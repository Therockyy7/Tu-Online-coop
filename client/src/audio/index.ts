// Bộ máy âm thanh Web Audio: kênh tổng/nhạc/hiệu ứng, vang phòng, lập lịch nhạc theo bước (bài có nhịp canh
// đúng giờ server để cả phòng nghe cùng phách), hiệu ứng âm thanh tổng hợp, nhạc thu sẵn phát trực tuyến (nhạc kinh
// ở Đại Pháp Đường — nhạc tổng hợp nhỏ lại nhường chỗ; nhạc DJ ở Bar bám giờ server liên tục), phổ nhạc cho tường LED.
// Chỉ bật sau cú bấm đầu tiên.
import type { SfxId, TrackId } from '@shared/index';
import type { AudioApi, AudioChannel, PlayOptions, RecordedOptions } from './api';
import { TRACKS, type MusicTrack } from './music';
import { SFX, bigBell } from './sfx';
import { impulseResponse, type Voice } from './synth';

/**
 * Tên cũ của tùy chọn nhạc thu sẵn có `follow` (bám giờ server liên tục — nhạc DJ: cả quán nghe cùng một phách, Thi
 * nhảy chấm điểm theo đúng phách đó). `follow` đã vào hợp đồng RecordedOptions (api.ts); giữ tên cho mã đang dùng.
 */
export type FollowRecordedOptions = RecordedOptions;

interface Playing {
  id: TrackId;
  track: MusicTrack;
  /** To dần khi vào bài / nhỏ dần khi thay bài. */
  gain: GainNode;
  /** Mức to riêng sau `gain`: bài có nhịp theo setBeatLevel (DJ nhỏ lại trong Sòng), nhạc nền luôn 1. */
  level: GainNode;
  voice: Voice;
  bpm: number;
  /** Bài có nhịp: giờ server của phách 0. Không có = nhạc nền tự do. */
  startServer: number | null;
  startAudio: number;
  nextStep: number;
  fadingUntil: number | null;
}

/** Một bài thu sẵn đang mở: thẻ audio (không gắn vào trang) → MediaElementSource → âm lượng riêng → kênh nhạc. */
interface Recorded {
  url: string;
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  opts: RecordedOptions;
  /** Mức to mong muốn 0..1 (0 = nhỏ dần rồi tạm dừng). */
  level: number;
  /** Đã play() khi chưa có metadata: giữ im, chờ 'loadedmetadata' tua đúng giây rồi mới to lên. */
  needSeek: boolean;
  /** play() bị từ chối (chính sách autoplay): thử lại ở lần unlock() sau — trong cú bấm/phím của người dùng. */
  blocked: boolean;
  /** Thẻ audio báo lỗi (mất mạng, file hỏng). */
  failed: boolean;
  /** Số lần đã dựng lại thẻ vì lỗi liên tiếp. */
  tries: number;
  /** Đã tháo (đổi bài / tắt): sự kiện đến muộn bỏ qua. */
  dead: boolean;
  pauseTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** Nhạc bám giờ server chưa tới giờ bắt đầu: hẹn phát đúng lúc. */
  startTimer: ReturnType<typeof setTimeout> | null;
  /** Lần tua thẳng gần nhất để bám giờ (performance.now, ms). */
  seekAt: number;
}

const LOOKAHEAD = 0.14;
const FADE = 1.3;
const REVERB_HEAVY = new Set<SfxId>(['bell_big', 'bell_small', 'gong', 'mo_lead', 'mo', 'bong', 'chant_hum', 'rankup']);
/** Hằng thời gian (giây) khi nhạc thu sẵn đổi mức to, và khi nhạc tổng hợp nhỏ lại / to lên nhường chỗ. */
const REC_TC = 0.5;
/** Nhỏ dần về 0 xong (≈ 5 hằng thời gian) mới tạm dừng / dọn thẻ audio. */
const REC_FADE_MS = 2500;
/** Nhạc thu sẵn ở mức 1 thì nhạc tổng hợp còn 15%. */
const REC_DUCK = 0.85;
/** Không tua sát cuối bài (tua tới đúng thời lượng = hết bài ngay). */
const REC_TAIL = 0.1;
/** Thẻ audio lỗi khi đang nghe: dựng thẻ mới sau ngần này, tối đa REC_RETRIES lần liên tiếp. */
const REC_RETRY_MS = 8000;
const REC_RETRIES = 3;
/** Hỏi thời lượng quá lâu thì thôi (trả 0). */
const PROBE_TIMEOUT_MS = 15_000;
/**
 * Nhạc bám giờ server: kiểm lệch mỗi FOLLOW_MS; lệch quá FOLLOW_START giây thì nhích tốc độ (tối đa ±FOLLOW_MAX, tỉ lệ
 * FOLLOW_GAIN theo độ lệch) tới khi còn dưới FOLLOW_STOP; lệch quá FOLLOW_SEEK giây thì tua thẳng (cách nhau ≥
 * FOLLOW_SEEK_GAP_MS — mạng chậm đừng tua liên hồi). Vào bài thì to lên nhanh (hằng thời gian FOLLOW_FADE).
 */
const FOLLOW_MS = 200;
const FOLLOW_START = 0.03;
const FOLLOW_STOP = 0.008;
const FOLLOW_GAIN = 0.8;
const FOLLOW_MAX = 0.04;
const FOLLOW_SEEK = 0.5;
const FOLLOW_SEEK_GAP_MS = 3000;
/** Lệch quá FOLLOW_JUMP giây mà chỗ cần tới đã tải sẵn (tua trong bộ đệm gần như tức thì) thì tua luôn (cách ≥ 1 s). */
const FOLLOW_JUMP = 0.12;
const FOLLOW_JUMP_GAP_MS = 1000;
const FOLLOW_FADE = 0.06;
/** Trễ đầu ra quá ngần này (giây) coi như số hỏng. */
const MAX_OUT_LATENCY = 0.3;
/**
 * Phổ nhạc: FFT 2048 (dải trầm 40–100 Hz mới tách được cột), dải log BAND_LO_HZ – BAND_HI_HZ, bù nghiêng BAND_TILT mỗi
 * quãng tám quanh 1 kHz (nhạc dồn năng lượng ở dải trầm — không bù thì cột cao tần nằm im), dưới BAND_FLOOR coi là lặng.
 */
const FFT_SIZE = 2048;
const BAND_LO_HZ = 40;
const BAND_HI_HZ = 12_000;
const BAND_TILT = 0.045;
const BAND_FLOOR = 0.06;

/**
 * Thời lượng (giây) một file nhạc: thẻ audio tạm chỉ tải metadata, xong thì bỏ nguồn (hủy tải). Luồng chưa biết độ dài
 * (Infinity / NaN) thì chờ 'durationchange'. Lỗi hoặc quá PROBE_TIMEOUT_MS → 0; không bao giờ reject.
 */
function probeDuration(url: string): Promise<number> {
  return new Promise<number>((resolve) => {
    let el: HTMLAudioElement | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function done(d: number): void {
      const e = el;
      el = null;
      if (timer) clearTimeout(timer);
      if (e) {
        e.removeEventListener('loadedmetadata', check);
        e.removeEventListener('durationchange', check);
        e.removeEventListener('error', fail);
        try {
          e.removeAttribute('src');
          e.load();
        } catch {
          // bỏ qua
        }
      }
      resolve(d);
    }
    function check(): void {
      const d = el ? el.duration : NaN;
      if (Number.isFinite(d) && d > 0) done(d);
    }
    function fail(): void {
      done(0);
    }
    try {
      el = new Audio();
      el.preload = 'metadata';
      el.addEventListener('loadedmetadata', check);
      el.addEventListener('durationchange', check);
      el.addEventListener('error', fail);
      timer = setTimeout(fail, PROBE_TIMEOUT_MS);
      el.src = url;
    } catch {
      fail();
    }
  });
}

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let master!: GainNode;
  let musicBus!: GainNode;
  let sfxBus!: GainNode;
  let reverbIn!: GainNode;
  /** Tầng chung của nhạc tổng hợp: phần khô (→ kênh nhạc) và phần gửi vang — nhỏ lại nhường chỗ cho nhạc thu sẵn. */
  let synthBus!: GainNode;
  let synthVerb!: GainNode;
  const volumes: Record<AudioChannel, number> = { master: 0.8, music: 0.6, sfx: 0.9 };
  let clock = () => Date.now();
  let bg: TrackId | null = null;
  let beat: { track: TrackId; start: number; bpm: number } | null = null;
  const playing: Playing[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Yêu cầu nhạc thu sẵn gần nhất — nhớ cả khi chưa mở khóa âm thanh. */
  let wanted: { url: string; level: number; opts: RecordedOptions } | null = null;
  /** Bài thu sẵn đang mở (đúng `wanted.url`); bài cũ đã tháo thì tự nhỏ dần rồi dọn. */
  let rec: Recorded | null = null;
  /** Mức nhạc tổng hợp đang nhắm tới (1 = không nhường). */
  let duck = 1;
  /** Mức to bài có nhịp (setBeatLevel) — nhớ cả khi chưa mở khóa; stopBeatTrack trả về 1. */
  let beatLevel = 1;
  /** Thời lượng theo url: đang hỏi hoặc đã biết (hỏi hỏng thì xóa để lần sau hỏi lại). */
  const durations = new Map<string, Promise<number>>();
  /** Kiểm lệch nhạc bám giờ server (chỉ chạy khi bài đang mở cần bám). */
  let followTimer: ReturnType<typeof setInterval> | null = null;
  /** Phổ nhạc: nhánh đo sau kênh nhạc + bộ đệm / bảng chia dải dựng sẵn (đổi số dải mới dựng lại). */
  let analyser: AnalyserNode | null = null;
  let bins: Uint8Array<ArrayBuffer> | null = null;
  let bandLo = new Int16Array(0);
  let bandHi = new Int16Array(0);
  let bandTilt = new Float32Array(0);

  const applyVolumes = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(volumes.master, t, 0.05);
    musicBus.gain.setTargetAtTime(volumes.music * 0.7, t, 0.05);
    sfxBus.gain.setTargetAtTime(volumes.sfx, t, 0.05);
  };

  function build(c: AudioContext): void {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    master = c.createGain();
    master.connect(comp);
    musicBus = c.createGain();
    musicBus.connect(master);
    // Phổ nhạc cho tường LED: nhánh rẽ sau thanh âm lượng nhạc (không nối ra loa — trình duyệt vẫn tự kéo dữ liệu).
    analyser = c.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.7;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -25;
    musicBus.connect(analyser);
    sfxBus = c.createGain();
    sfxBus.connect(master);
    const convolver = c.createConvolver();
    convolver.buffer = impulseResponse(c, 2.6, 2.4);
    const wet = c.createGain();
    wet.gain.value = 0.32;
    convolver.connect(wet);
    wet.connect(master);
    reverbIn = c.createGain();
    reverbIn.connect(convolver);
    // Mọi nhạc tổng hợp — nhạc nền lẫn bài có nhịp (tụng kinh lofi, DJ) — cùng nhường chỗ cho nhạc thu sẵn: nhạc thu
    // sẵn chỉ vang quanh Đại Pháp Đường, xa chỗ các trò cần nghe phách. Nhạc thu sẵn đi thẳng vào kênh nhạc, không qua
    // vang (bản thu đã có tiếng vang của nó).
    synthBus = c.createGain();
    synthBus.connect(musicBus);
    synthVerb = c.createGain();
    synthVerb.connect(reverbIn);
    applyVolumes();
  }

  /** Đầu ra cho 1 lần phát hiệu ứng: âm lượng + lệch trái/phải + gửi một phần vào vang. */
  function sfxOut(c: AudioContext, o: PlayOptions, reverb: number): AudioNode {
    const g = c.createGain();
    g.gain.value = Math.max(0, Math.min(1.5, o.volume ?? 1));
    let node: AudioNode = g;
    if (o.pan) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      node = p;
    }
    node.connect(sfxBus);
    if (reverb > 0) {
      const send = c.createGain();
      send.gain.value = reverb;
      node.connect(send);
      send.connect(reverbIn);
    }
    return g;
  }

  function playAtAudio(id: SfxId, t: number, o: PlayOptions): void {
    if (!ctx || ctx.state !== 'running') return;
    const recipe = SFX[id];
    if (!recipe) return;
    try {
      recipe({ ctx, out: sfxOut(ctx, o, REVERB_HEAVY.has(id) ? 0.5 : 0.15) }, t, o.rate ?? 1);
    } catch (err) {
      console.warn('[audio] lỗi phát', id, err);
    }
  }

  function fadeOut(p: Playing, now: number): void {
    if (p.fadingUntil !== null) return;
    p.fadingUntil = now + FADE;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), now);
    p.gain.gain.linearRampToValueAtTime(0.0001, now + FADE);
  }

  function startTrack(id: TrackId, startServer: number | null, bpm: number): void {
    if (!ctx) return;
    const now = ctx.currentTime;
    // Đang phát đúng bài này với cùng mốc nhịp → giữ nguyên.
    const cur = playing.find((p) => p.fadingUntil === null);
    if (cur && cur.id === id && cur.startServer === startServer && cur.bpm === bpm) return;
    for (const p of playing) fadeOut(p, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE);
    // Mức to riêng nằm sau tầng to dần / nhỏ dần (hai việc không giành nhau một tham số) và trước cả phần khô lẫn vang.
    const level = ctx.createGain();
    level.gain.value = startServer !== null ? beatLevel : 1;
    gain.connect(level);
    level.connect(synthBus);
    const send = ctx.createGain();
    send.gain.value = id === 'temple_ambience' || id === 'chant_lofi' ? 0.35 : 0.08;
    level.connect(send);
    send.connect(synthVerb);
    let nextStep = 0;
    if (startServer !== null) {
      const stepMs = 60_000 / bpm / 4;
      nextStep = Math.max(0, Math.ceil((clock() - startServer) / stepMs));
    }
    playing.push({
      id,
      track: TRACKS[id],
      gain,
      level,
      voice: { ctx, out: gain },
      bpm,
      startServer,
      startAudio: now + 0.05,
      nextStep,
      fadingUntil: null,
    });
    if (!timer) timer = setInterval(schedule, 25);
  }

  function refreshMusic(): void {
    if (!ctx || ctx.state !== 'running') return;
    if (beat) startTrack(beat.track, beat.start, beat.bpm);
    else if (bg) startTrack(bg, null, TRACKS[bg].bpm);
    else for (const p of playing) fadeOut(p, ctx.currentTime);
  }

  function schedule(): void {
    if (!ctx || ctx.state !== 'running') return;
    const audioNow = ctx.currentTime;
    const serverNow = clock();
    for (let i = playing.length - 1; i >= 0; i--) {
      const p = playing[i]!;
      if (p.fadingUntil !== null && audioNow > p.fadingUntil) {
        p.gain.disconnect();
        p.level.disconnect();
        playing.splice(i, 1);
        continue;
      }
      const stepSec = 60 / p.bpm / 4;
      for (let guard = 0; guard < 64; guard++) {
        const t =
          p.startServer !== null
            ? audioNow + (p.startServer + p.nextStep * stepSec * 1000 - serverNow) / 1000
            : p.startAudio + p.nextStep * stepSec;
        if (t > audioNow + LOOKAHEAD) break;
        if (t >= audioNow - 0.02) {
          try {
            p.track.step(p.voice, Math.max(audioNow, t), p.nextStep, stepSec);
          } catch (err) {
            console.warn('[audio] lỗi nhạc', p.id, err);
          }
        }
        p.nextStep++;
      }
    }
  }

  // ──────────── Nhạc thu sẵn: thẻ audio phát trực tuyến → Web Audio (qua kênh nhạc, theo thanh âm lượng) ────────────

  /** Nhạc tổng hợp nhỏ lại theo mức nhạc thu sẵn; bài lỗi hoặc bị chặn không tính (đừng để cả điện im lặng). */
  function updateDuck(): void {
    if (!ctx) return;
    const r = rec;
    const g = 1 - REC_DUCK * (r && !r.failed && !r.blocked ? r.level : 0);
    if (g === duck) return;
    duck = g;
    synthBus.gain.setTargetAtTime(g, ctx.currentTime, REC_TC);
    synthVerb.gain.setTargetAtTime(g, ctx.currentTime, REC_TC);
  }

  /** Âm lượng riêng của bài về mức mong muốn (êm); còn chờ tua đúng giây thì giữ im. */
  function rampRec(r: Recorded): void {
    if (!ctx) return;
    r.gain.gain.setTargetAtTime(r.needSeek ? 0 : r.level, ctx.currentTime, REC_TC);
  }

  /** Tua tới giây opts.startAt(thời lượng) (canh giờ server), kẹp trong [0, thời lượng). Thiếu startAt: không tua. */
  function seekToStart(r: Recorded): void {
    const startAt = r.opts.startAt;
    if (!startAt) return;
    const d = r.el.duration;
    let t: number;
    try {
      t = startAt(d);
    } catch (err) {
      console.warn('[audio] lỗi startAt', err);
      return;
    }
    if (!Number.isFinite(t)) return;
    t = Math.max(0, t);
    if (Number.isFinite(d) && d > 0) t = Math.min(t, Math.max(0, d - REC_TAIL));
    if (Math.abs(r.el.currentTime - t) < 0.05) return;
    try {
      r.el.currentTime = t;
    } catch {
      // Luồng không cho tua: phát tiếp chỗ cũ.
    }
  }

  /** Giây `t` của bài đã nằm trong phần tải sẵn (tua tới đó không phải chờ mạng). */
  function isBuffered(el: HTMLMediaElement, t: number): boolean {
    const b = el.buffered;
    for (let i = 0; i < b.length; i++) if (t >= b.start(i) && t < b.end(i) - 0.25) return true;
    return false;
  }

  /** Trễ từ đồ thị âm thanh tới loa (giây): nhạc bám giờ server phát sớm chừng ấy để tiếng nghe thấy đúng giờ. */
  function outLatency(): number {
    if (!ctx) return 0;
    const out = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
    const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
    return Math.max(0, Math.min(MAX_OUT_LATENCY, out + base));
  }

  /** Giây bài bám giờ server phải đang phát lúc này (đã bù trễ đầu ra; âm = chưa tới giờ); null = không tính được. */
  function followTarget(r: Recorded): number | null {
    const startAt = r.opts.startAt;
    if (!startAt) return null;
    let t: number;
    try {
      t = startAt(r.el.duration);
    } catch (err) {
      console.warn('[audio] lỗi startAt', err);
      return null;
    }
    return Number.isFinite(t) ? t + outLatency() : null;
  }

  /**
   * Phát bài bám giờ server từ im lặng: chưa có metadata thì chờ ('loadedmetadata' gọi lại); chưa tới giờ thì đứng ở
   * giây 0, hẹn phát đúng lúc; tới giờ thì tua đúng giây, play() rồi to lên nhanh. Phần lệch còn lại (trễ khởi động,
   * trễ tua) do followTick nắn dần.
   */
  function startFollowing(r: Recorded): void {
    if (!ctx || r.dead || r.failed || r.level <= 0) return;
    const el = r.el;
    if (r.startTimer) {
      clearTimeout(r.startTimer);
      r.startTimer = null;
    }
    if (el.readyState < HTMLMediaElement.HAVE_METADATA) {
      r.needSeek = true;
      return;
    }
    r.needSeek = false;
    const t = followTarget(r);
    if (t === null) return;
    const d = el.duration;
    try {
      if (t < 0) {
        // Chưa tới giờ bắt đầu: đứng chờ ở giây 0 (đã tải sẵn), hẹn vào đúng lúc.
        if (!el.paused) el.pause();
        if (el.currentTime !== 0) el.currentTime = 0;
        r.startTimer = setTimeout(() => {
          r.startTimer = null;
          startFollowing(r);
        }, -t * 1000);
        return;
      }
      if (Number.isFinite(d) && d > 0 && t >= d - REC_TAIL) return; // bài đã hết theo giờ server
      if (Math.abs(el.currentTime - t) > 0.02) el.currentTime = t;
      el.playbackRate = 1;
      void el.play().catch(() => {
        // Bị chặn (autoplay) — hoặc bị ngắt vì vừa tháo bài / tạm dừng chờ giờ trước khi kịp phát thì thôi.
        if (r.dead || r.failed || r.level <= 0 || !el.paused || r.startTimer) return;
        r.blocked = true;
        updateDuck();
      });
    } catch {
      r.blocked = true;
    }
    r.gain.gain.setTargetAtTime(r.level, ctx.currentTime, FOLLOW_FADE);
    updateDuck();
  }

  /** Kiểm lệch bài bám giờ server đang phát: lệch nhỏ → nhích tốc độ phát; lệch lớn → tua thẳng. */
  function followTick(): void {
    const r = rec;
    if (!ctx || ctx.state !== 'running' || !r || !r.opts.follow) return;
    if (r.dead || r.failed || r.blocked || r.needSeek || r.startTimer || r.level <= 0) return;
    const el = r.el;
    if (el.paused || el.seeking || el.ended || el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    const t = followTarget(r);
    if (t === null) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0 && t >= d - REC_TAIL) return;
    if (t < 0) return startFollowing(r); // mốc bắt đầu bị dời về sau: đứng chờ lại
    const drift = el.currentTime - t;
    const ad = Math.abs(drift);
    const since = performance.now() - r.seekAt;
    try {
      if (
        (ad > FOLLOW_SEEK && since > FOLLOW_SEEK_GAP_MS) ||
        (ad > FOLLOW_JUMP && since > FOLLOW_JUMP_GAP_MS && isBuffered(el, t))
      ) {
        r.seekAt = performance.now();
        el.currentTime = t;
        el.playbackRate = 1;
        return;
      }
      const tol = el.playbackRate === 1 ? FOLLOW_START : FOLLOW_STOP;
      const rate = Math.abs(drift) < tol ? 1 : Math.max(1 - FOLLOW_MAX, Math.min(1 + FOLLOW_MAX, 1 - drift * FOLLOW_GAIN));
      if (el.playbackRate !== rate) el.playbackRate = rate;
    } catch {
      // Luồng không cho tua / đổi tốc độ: thôi.
    }
  }

  /**
   * Phát (lại) bài từ im lặng: tua tới giây canh giờ server, play() rồi to dần. Chưa có metadata thì vẫn play() ngay —
   * để trình duyệt tải, và còn nằm trong cú bấm nếu gọi từ unlock() — nhưng giữ im tới 'loadedmetadata' mới tua.
   */
  function startRecorded(r: Recorded): void {
    if (!ctx || r.dead || r.failed) return;
    const el = r.el;
    const now = ctx.currentTime;
    r.blocked = false;
    r.gain.gain.cancelScheduledValues(now);
    r.gain.gain.setValueAtTime(0, now);
    if (r.opts.follow) {
      el.preload = 'auto';
      startFollowing(r);
      updateDuck();
      return;
    }
    try {
      el.preload = 'auto';
      r.needSeek = el.readyState < HTMLMediaElement.HAVE_METADATA;
      if (!r.needSeek) seekToStart(r);
      void el.play().catch(() => {
        // Bị chặn (autoplay) — hoặc bị ngắt vì vừa tạm dừng / tháo bài trước khi kịp phát thì thôi.
        if (r.dead || r.failed || r.level <= 0 || !el.paused) return;
        r.blocked = true;
        r.needSeek = false;
        updateDuck();
      });
    } catch {
      r.blocked = true;
    }
    rampRec(r);
    updateDuck();
  }

  /** Nhỏ dần xong mà vẫn ở mức 0 thì tạm dừng và hạ preload — trình duyệt thôi tải tiếp. */
  function schedulePause(r: Recorded): void {
    if (r.pauseTimer) clearTimeout(r.pauseTimer);
    r.pauseTimer = setTimeout(() => {
      r.pauseTimer = null;
      if (r.dead || r.level > 0) return;
      try {
        r.el.pause();
        r.el.preload = 'none';
      } catch {
        // bỏ qua
      }
    }, REC_FADE_MS);
  }

  /** Đổi mức to: từ 0 lên (kể cả lần đầu) = tua theo giờ server rồi phát; về 0 = nhỏ dần rồi tạm dừng. */
  function setRecLevel(r: Recorded, level: number): void {
    const prev = r.level;
    if (level === prev) return;
    r.level = level;
    if (level > 0) {
      if (r.pauseTimer) {
        clearTimeout(r.pauseTimer);
        r.pauseTimer = null;
      }
      // Chưa kịp tạm dừng thì vẫn đúng giờ: chỉ đổi mức to. Bài đã hết (loop = false) chỉ phát lại khi lên từ 0.
      if (!r.el.paused) rampRec(r);
      else if (prev === 0 || r.blocked) startRecorded(r);
    } else {
      rampRec(r);
      if (!r.el.paused) schedulePause(r);
    }
  }

  /** Dọn hẳn một bài: dừng, bỏ nguồn (hủy tải), tháo khỏi đồ thị âm thanh. */
  function destroyRecorded(r: Recorded): void {
    try {
      r.el.pause();
      r.el.removeAttribute('src');
      r.el.load();
    } catch {
      // bỏ qua
    }
    try {
      r.source.disconnect();
      r.gain.disconnect();
    } catch {
      // bỏ qua
    }
  }

  /** Tháo bài (đổi bài / tắt): đang vang thì nhỏ dần rồi mới dọn, không thì dọn ngay. */
  function retire(r: Recorded): void {
    r.dead = true;
    if (r.pauseTimer) clearTimeout(r.pauseTimer);
    if (r.retryTimer) clearTimeout(r.retryTimer);
    if (r.startTimer) clearTimeout(r.startTimer);
    r.pauseTimer = null;
    r.retryTimer = null;
    r.startTimer = null;
    if (ctx && ctx.state === 'running' && !r.el.paused && !r.needSeek && !r.failed) {
      r.gain.gain.setTargetAtTime(0, ctx.currentTime, REC_TC);
      setTimeout(() => destroyRecorded(r), REC_FADE_MS);
    } else {
      destroyRecorded(r);
    }
  }

  /** Thẻ audio lỗi (mất mạng, file hỏng): nhạc tổng hợp trở lại; vẫn đang nghe thì hẹn dựng thẻ mới (có giới hạn). */
  function onRecordedError(r: Recorded): void {
    if (r.dead || r.failed) return;
    r.failed = true;
    r.needSeek = false;
    updateDuck();
    if (r.tries >= REC_RETRIES) return;
    r.retryTimer = setTimeout(() => {
      r.retryTimer = null;
      if (r.dead || r !== rec || r.level <= 0) return;
      retire(r);
      rec = null;
      syncRecorded(r.tries + 1);
    }, REC_RETRY_MS);
  }

  /** Mở bài: mỗi lần một thẻ audio mới (MediaElementSource chỉ tạo được 1 lần cho mỗi thẻ); gắn nguồn sau cùng. */
  function openRecorded(c: AudioContext, url: string, opts: RecordedOptions, tries: number): Recorded | null {
    try {
      const el = new Audio();
      el.preload = 'auto';
      el.loop = opts.loop !== false;
      const source = c.createMediaElementSource(el);
      const gain = c.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(musicBus);
      const r: Recorded = {
        url,
        el,
        source,
        gain,
        opts,
        level: 0,
        needSeek: false,
        blocked: false,
        failed: false,
        tries,
        dead: false,
        pauseTimer: null,
        retryTimer: null,
        startTimer: null,
        seekAt: -Infinity,
      };
      el.addEventListener('loadedmetadata', () => {
        if (r.dead || !r.needSeek) return;
        if (r.opts.follow) return startFollowing(r);
        r.needSeek = false;
        // Tua cả khi mức to vừa về 0: lên lại trước lúc tạm dừng thì chỉ to lên, không tua nữa — phải đúng giây sẵn.
        if (!el.paused) seekToStart(r);
        rampRec(r);
      });
      el.addEventListener('ended', () => {
        if (r.dead || el.loop) return;
        try {
          r.opts.onEnded?.();
        } catch (err) {
          console.warn('[audio] lỗi onEnded', err);
        }
      });
      el.addEventListener('error', () => onRecordedError(r));
      el.src = url;
      return r;
    } catch {
      return null;
    }
  }

  /**
   * Đưa nhạc thu sẵn về đúng yêu cầu gần nhất. Tháo bài cũ (đổi bài / tắt) làm ngay cả khi chưa mở khóa; mở bài mới,
   * phát và đổi mức to thì chờ AudioContext chạy — unlock() gọi lại hàm này. `tries` = số lần dựng lại vì lỗi.
   */
  function syncRecorded(tries = 0): void {
    const w = wanted;
    // Đổi bài / tắt; hoặc bài từng lỗi được nghe lại từ mức 0 → dựng thẻ mới.
    if (rec && (!w || w.url !== rec.url || (rec.failed && rec.level === 0 && w.level > 0))) {
      retire(rec);
      rec = null;
    }
    const c = ctx;
    if (w && c && c.state === 'running') {
      if (!rec && w.level > 0) rec = openRecorded(c, w.url, w.opts, tries);
      if (rec) {
        rec.opts = w.opts;
        const loop = w.opts.loop !== false;
        if (rec.el.loop !== loop) rec.el.loop = loop;
        setRecLevel(rec, w.level);
      }
    }
    updateDuck();
    // Bài cần bám giờ server: kiểm lệch đều đặn; không còn bài như thế thì thôi.
    const following = !!rec?.opts.follow;
    if (following && !followTimer) followTimer = setInterval(followTick, FOLLOW_MS);
    else if (!following && followTimer) {
      clearInterval(followTimer);
      followTimer = null;
    }
  }

  /** AudioContext đang chạy (unlock): áp yêu cầu gần nhất; play() từng bị chặn thì thử lại ngay trong cú bấm/phím. */
  function resumeRecorded(): void {
    syncRecorded();
    if (rec && rec.blocked && rec.level > 0) startRecorded(rec);
  }

  // ──────────── Phổ nhạc (tường LED sau bàn DJ) ────────────

  /** Kênh nhạc đang có tiếng: bài thu sẵn đang phát, hoặc nhạc tổng hợp chưa tắt dần; thanh âm lượng không về 0. */
  function musicAudible(): boolean {
    if (volumes.music <= 0 || volumes.master <= 0) return false;
    const r = rec;
    if (r && !r.dead && !r.failed && !r.blocked && r.level > 0 && !r.el.paused) return true;
    for (let i = 0; i < playing.length; i++) if (playing[i]!.fadingUntil === null) return true;
    return false;
  }

  /** Bảng chia `n` dải theo thang log BAND_LO_HZ – BAND_HI_HZ ra các ô FFT (mỗi dải ≥ 1 ô) + độ bù nghiêng từng dải. */
  function layoutBands(n: number, a: AnalyserNode): void {
    bandLo = new Int16Array(n);
    bandHi = new Int16Array(n);
    bandTilt = new Float32Array(n);
    const binHz = a.context.sampleRate / a.fftSize;
    const last = a.frequencyBinCount - 1;
    const ratio = BAND_HI_HZ / BAND_LO_HZ;
    for (let i = 0; i < n; i++) {
      const f0 = BAND_LO_HZ * Math.pow(ratio, i / n);
      const f1 = BAND_LO_HZ * Math.pow(ratio, (i + 1) / n);
      // Ô FFT có tần số giữa trong [f0, f1); dải hẹp hơn một ô (dải trầm) thì lấy hai ô kề — dải kề nhau vẫn khác nhau.
      const lo = Math.min(last, Math.max(1, Math.floor(f0 / binHz)));
      bandLo[i] = lo;
      bandHi[i] = Math.min(last, Math.max(lo, Math.ceil(f1 / binHz) - 1));
      bandTilt[i] = BAND_TILT * Math.log2(Math.sqrt(f0 * f1) / 1000);
    }
  }

  return {
    unlock() {
      try {
        if (!ctx) {
          ctx = new AudioContext({ latencyHint: 'interactive' });
          build(ctx);
        }
        if (ctx.state === 'suspended') {
          void ctx.resume().then(
            () => {
              refreshMusic();
              resumeRecorded();
            },
            () => {}, // context đã đóng — bỏ qua
          );
        } else {
          if (!playing.some((p) => p.fadingUntil === null)) refreshMusic();
          resumeRecorded();
        }
      } catch (err) {
        console.warn('[audio] không mở được âm thanh', err);
      }
    },
    get unlocked() {
      return ctx?.state === 'running';
    },
    setClock(fn) {
      clock = fn;
    },
    play(id, opts = {}) {
      if (!ctx) return;
      playAtAudio(id, ctx.currentTime + 0.005, opts);
    },
    playAt(id, serverMs, opts = {}) {
      if (!ctx) return;
      const delta = (serverMs - clock()) / 1000;
      if (delta < -0.08) return;
      playAtAudio(id, ctx.currentTime + Math.max(0.005, delta), opts);
    },
    bell(strength) {
      if (!ctx || ctx.state !== 'running') return;
      bigBell({ ctx, out: sfxOut(ctx, { volume: 0.6 + 0.6 * strength }, 0.6) }, ctx.currentTime + 0.01, strength);
    },
    setMusic(track) {
      bg = track;
      if (!beat) refreshMusic();
    },
    startBeatTrack(track, startServerMs, bpm) {
      beat = { track, start: startServerMs, bpm };
      refreshMusic();
    },
    stopBeatTrack() {
      // Bài đang nhỏ dần giữ mức to riêng của nó; bài có nhịp bật sau bắt đầu lại ở mức 1.
      beatLevel = 1;
      if (!beat) return;
      beat = null;
      refreshMusic();
    },
    setBeatLevel(level) {
      beatLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1;
      if (!ctx) return;
      for (const p of playing) {
        if (p.startServer !== null && p.fadingUntil === null) p.level.gain.setTargetAtTime(beatLevel, ctx.currentTime, REC_TC);
      }
    },
    djDrop(level = 1) {
      if (!ctx) return;
      const k = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 1;
      playAtAudio('drop', ctx.currentTime + 0.01, { volume: k });
      playAtAudio('airhorn', ctx.currentTime + 0.05, { volume: 0.5 * k });
    },
    setRecorded(url, level, opts = {}) {
      const lv = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
      wanted = url ? { url, level: lv, opts } : null;
      syncRecorded();
    },
    recordedDuration(url) {
      let p = durations.get(url);
      if (!p) {
        p = probeDuration(url).then((d) => {
          if (!(d > 0)) durations.delete(url); // hỏi hỏng: lần sau hỏi lại
          return d;
        });
        durations.set(url, p);
      }
      return p;
    },
    musicBands(out) {
      const a = analyser;
      if (!ctx || !a || ctx.state !== 'running' || !musicAudible()) {
        out.fill(0);
        return false;
      }
      if (!bins) bins = new Uint8Array(a.frequencyBinCount);
      if (bandLo.length !== out.length) layoutBands(out.length, a);
      a.getByteFrequencyData(bins);
      for (let i = 0; i < out.length; i++) {
        let m = 0;
        for (let k = bandLo[i]!; k <= bandHi[i]!; k++) if (bins[k]! > m) m = bins[k]!;
        const v = m / 255 + bandTilt[i]!;
        out[i] = v <= BAND_FLOOR ? 0 : Math.min(1, (v - BAND_FLOOR) / (1 - BAND_FLOOR));
      }
      return true;
    },
    setVolume(channel, value) {
      volumes[channel] = Math.max(0, Math.min(1, value));
      applyVolumes();
    },
    getVolume: (channel) => volumes[channel],
  };
}
