// Bộ máy âm thanh Web Audio: kênh tổng/nhạc/hiệu ứng, vang phòng, lập lịch nhạc theo bước (bài có nhịp canh
// đúng giờ server để cả phòng nghe cùng phách), hiệu ứng âm thanh tổng hợp. Chỉ bật sau cú bấm đầu tiên.
import type { SfxId, TrackId } from '@shared/index';
import type { AudioApi, AudioChannel, PlayOptions } from './api';
import { TRACKS, type MusicTrack } from './music';
import { SFX, bigBell } from './sfx';
import { impulseResponse, type Voice } from './synth';

interface Playing {
  id: TrackId;
  track: MusicTrack;
  gain: GainNode;
  voice: Voice;
  bpm: number;
  /** Bài có nhịp: giờ server của phách 0. Không có = nhạc nền tự do. */
  startServer: number | null;
  startAudio: number;
  nextStep: number;
  fadingUntil: number | null;
}

const LOOKAHEAD = 0.14;
const FADE = 1.3;
const REVERB_HEAVY = new Set<SfxId>(['bell_big', 'bell_small', 'gong', 'mo_lead', 'mo', 'bong', 'chant_hum', 'rankup']);

export function createAudio(): AudioApi {
  let ctx: AudioContext | null = null;
  let master!: GainNode;
  let musicBus!: GainNode;
  let sfxBus!: GainNode;
  let reverbIn!: GainNode;
  const volumes: Record<AudioChannel, number> = { master: 0.8, music: 0.6, sfx: 0.9 };
  let clock = () => Date.now();
  let bg: TrackId | null = null;
  let beat: { track: TrackId; start: number; bpm: number } | null = null;
  const playing: Playing[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

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
    gain.connect(musicBus);
    const send = ctx.createGain();
    send.gain.value = id === 'temple_ambience' || id === 'chant_lofi' ? 0.35 : 0.08;
    gain.connect(send);
    send.connect(reverbIn);
    let nextStep = 0;
    if (startServer !== null) {
      const stepMs = 60_000 / bpm / 4;
      nextStep = Math.max(0, Math.ceil((clock() - startServer) / stepMs));
    }
    playing.push({
      id,
      track: TRACKS[id],
      gain,
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

  return {
    unlock() {
      try {
        if (!ctx) {
          ctx = new AudioContext({ latencyHint: 'interactive' });
          build(ctx);
        }
        if (ctx.state === 'suspended') void ctx.resume().then(refreshMusic);
        else if (!playing.some((p) => p.fadingUntil === null)) refreshMusic();
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
      if (!beat) return;
      beat = null;
      refreshMusic();
    },
    djDrop() {
      if (!ctx) return;
      playAtAudio('drop', ctx.currentTime + 0.01, { volume: 1 });
      playAtAudio('airhorn', ctx.currentTime + 0.05, { volume: 0.5 });
    },
    // KHUNG — sẽ được cài đặt (HTMLAudioElement → MediaElementSource → kênh nhạc, nhường nhạc nền).
    setRecorded() {},
    recordedDuration: () => Promise.resolve(0),
    setVolume(channel, value) {
      volumes[channel] = Math.max(0, Math.min(1, value));
      applyVolumes();
    },
    getVolume: (channel) => volumes[channel],
  };
}
