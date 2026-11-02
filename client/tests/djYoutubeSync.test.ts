// Trình phát YouTube ở bàn DJ — hàm thuần (client/src/activities/dj/youtube/sync.ts): vị trí cần có theo giờ server,
// quyết định tua sửa lệch (chỉ khi lệch rõ, cách lần tua trước đủ lâu, không đang quảng cáo, chưa sát cuối video), phát
// hiện livestream, âm lượng iframe (không đi qua Web Audio — tự nhân mức chỗ đứng × thanh nhạc × hệ số kênh nhạc ×
// thanh tổng), cỡ khung theo đồ họa. Và DjYoutubeScreen (youtube/screen.ts) với YT.Player / DOM / lớp CSS3D giả: chờ
// onReady mới ra lệnh, nạp sẵn rồi phát đúng giờ server, chế độ màn hình, báo thời lượng 1 lần, sửa lệch, dừng / phát
// tiếp, lỗi trình phát, bị chặn tự phát tiếng, âm lượng theo chỗ đứng, rời YouTube / rời Bar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DJ, getZone } from '@shared/index';
import type { DjPublicState, DjYoutubeNow } from '@shared/activities/dj';
import { youtubeErrorText } from '@shared/activities/youtube';
import { MUSIC_BUS_GAIN } from '../src/audio/index';
import { DjYoutubeScreen } from '../src/activities/dj/youtube/screen';
import {
  detectLive,
  expectedSec,
  playAt,
  seekTarget,
  shouldSeek,
  stalledBetween,
  ytPixelSize,
  ytVolumePercent,
} from '../src/activities/dj/youtube/sync';
import { YT_STATE, type YTPlayerOptions, type YTVideoRequest } from '../src/activities/dj/youtube/ytApi';
import type { ClientActivityContext } from '../src/activities/types';

describe('expectedSec / playAt — vị trí theo giờ server', () => {
  it('đang phát: (giờ server − startedAt) / 1000, âm = chưa tới giờ; đang dừng: vị trí lúc dừng', () => {
    expect(expectedSec(10_000, true, 0, 42_500)).toBe(32.5);
    expect(expectedSec(10_000, true, 0, 7_500)).toBe(-2.5);
    expect(expectedSec(10_000, false, 61_250, 999_999)).toBe(61.25);
  });

  it('giờ bắt đầu phát thật = startedAt + startMs (link có ?t= thì giây 0 nằm trong quá khứ)', () => {
    expect(playAt({ startMs: 0 }, 50_000)).toBe(50_000);
    expect(playAt({ startMs: 90_000 }, 50_000 - 90_000)).toBe(50_000);
  });
});

describe('shouldSeek — sửa lệch bằng seekTo', () => {
  const base = { current: 10, expected: 13, duration: 200, now: 100_000, lastSeekAt: 90_000, stalled: false };

  it('lệch > 1,5 s, ≥ 5 s từ lần tua trước, còn xa cuối video, không quảng cáo → tua (cả hai chiều)', () => {
    expect(shouldSeek(base)).toBe(true);
    expect(shouldSeek({ ...base, current: 16 })).toBe(true);
    expect(shouldSeek({ ...base, lastSeekAt: -Infinity })).toBe(true);
  });

  it('lệch đúng 1,5 s chưa tua; lệch hơn chút thì tua', () => {
    expect(shouldSeek({ ...base, current: 10, expected: 11.5 })).toBe(false);
    expect(shouldSeek({ ...base, current: 10, expected: 11.51 })).toBe(true);
  });

  it('vừa tua chưa đủ 5 s → để yên (4 999 ms chưa, 5 000 ms được)', () => {
    expect(shouldSeek({ ...base, lastSeekAt: base.now - 4999 })).toBe(false);
    expect(shouldSeek({ ...base, lastSeekAt: base.now - 5000 })).toBe(true);
  });

  it('gần hết video (còn ≤ 2 s) hoặc vị trí âm → để yên', () => {
    expect(shouldSeek({ ...base, current: 190, expected: 198 })).toBe(true);
    expect(shouldSeek({ ...base, current: 190, expected: 198.01 })).toBe(false);
    expect(shouldSeek({ ...base, current: 1, expected: 210 })).toBe(false);
    expect(shouldSeek({ ...base, current: 3, expected: -0.5 })).toBe(false);
  });

  it('thời gian đứng yên dù đang PLAYING (quảng cáo) → không tua', () => {
    expect(shouldSeek({ ...base, stalled: true })).toBe(false);
  });

  it('số hỏng (NaN) → không tua', () => {
    expect(shouldSeek({ ...base, current: Number.NaN })).toBe(false);
    expect(shouldSeek({ ...base, duration: Number.NaN })).toBe(false);
  });

  it('chỗ tua tới: đang chậm thì vượt lên 0,5 s (bù lúc đệm / làm tròn khung khóa), đang nhanh thì đúng chỗ', () => {
    expect(seekTarget(10, 13)).toBe(13.5);
    expect(seekTarget(16, 13)).toBe(13);
  });
});

describe('stalledBetween — đang PLAYING mà thời gian không chạy (quảng cáo)', () => {
  it('tăng ~1 s giữa hai lần kiểm → đang chạy; đứng yên / lùi / lần kiểm đầu → coi như đứng', () => {
    expect(stalledBetween(41.2, 42.21)).toBe(false);
    expect(stalledBetween(41.2, 41.2)).toBe(true);
    expect(stalledBetween(41.2, 41.3)).toBe(true);
    expect(stalledBetween(41.2, 12)).toBe(true);
    expect(stalledBetween(Number.NaN, 12)).toBe(true);
  });
});

describe('detectLive — livestream: thời lượng còn tăng sau ~4 s', () => {
  it('tăng > 2 s → livestream; đứng yên / tăng ít / lần đầu chưa có số → không', () => {
    expect(detectLive(3600, 3604.5)).toBe(true);
    expect(detectLive(212.4, 212.4)).toBe(false);
    expect(detectLive(212.4, 214.4)).toBe(false);
    expect(detectLive(0, 3600)).toBe(false);
  });
});

describe('ytVolumePercent — âm lượng iframe 0..100', () => {
  it('đúng công thức kênh nhạc của engine: 100 × mức chỗ đứng × thanh nhạc × MUSIC_BUS_GAIN × thanh tổng', () => {
    expect(MUSIC_BUS_GAIN).toBe(0.7);
    // Mặc định (thanh nhạc 0,55, thanh tổng 0,8) ở sảnh Bar: 30,8 → 31.
    expect(ytVolumePercent(1, 0.55, 0.8)).toBe(31);
    // Trong Sòng Công Đức nhỏ lại theo DJ.casinoLevel: 16,94 → 17.
    expect(ytVolumePercent(DJ.casinoLevel, 0.55, 0.8)).toBe(17);
  });

  it('tắt thanh nhạc / thanh tổng → 0; kẹp trong 0..100; số hỏng → 0', () => {
    expect(ytVolumePercent(1, 0, 0.8)).toBe(0);
    expect(ytVolumePercent(1, 0.55, 0)).toBe(0);
    expect(ytVolumePercent(3, 1, 1)).toBe(100);
    expect(ytVolumePercent(-1, 1, 1)).toBe(0);
    expect(ytVolumePercent(Number.NaN, 1, 1)).toBe(0);
  });
});

describe('ytPixelSize — khung YouTube theo đồ họa', () => {
  it('đồ họa cao 1280 × 720, thấp 854 × 480 (16:9)', () => {
    expect(ytPixelSize('high')).toEqual({ w: 1280, h: 720 });
    expect(ytPixelSize('low')).toEqual({ w: 854, h: 480 });
  });
});

// ───────────────────────── DjYoutubeScreen với trình phát giả ─────────────────────────

const ID = 'dQw4w9WgXcQ';
const BASE = 1_000_000;

/** Phần tử DOM giả: đủ cho CSS3DObject (style, setAttribute, ownerDocument khi gỡ) + nút bật tiếng (button()). */
class FakeEl {
  className = '';
  textContent = '';
  title = '';
  type = '';
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  readonly ownerDocument = { defaultView: { Element: FakeEl } };
  setAttribute(): void {}
  addEventListener(): void {}
  append(...els: FakeEl[]): void {
    for (const e of els) {
      e.parentNode = this;
      this.children.push(e);
    }
  }
  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }
}

/**
 * YT.Player giả: ghi lệnh; test tự bắn onReady / onStateChange / onError / onAutoplayBlocked. Giây đang phát chạy theo
 * đồng hồ giả khi đang PLAYING (đệm / dừng / quảng cáo thì đứng), nạp / tua thì nhảy tới giây được yêu cầu.
 */
class FakePlayer {
  static last: FakePlayer | null = null;
  readonly calls: unknown[][] = [];
  duration = 0;
  muted = false;
  /** getVideoUrl() như widget thật: lệnh nạp / cue xoá (null); iframe báo lại id mới khi xử lý xong (ack / sự kiện). */
  videoUrl: string | null = null;
  private pendingId = '';
  private base = 0;
  private baseAt = 0;
  private running = false;
  constructor(
    readonly el: unknown,
    readonly opts: YTPlayerOptions,
  ) {
    FakePlayer.last = this;
  }
  get time(): number {
    return this.running ? this.base + (performance.now() - this.baseAt) / 1000 : this.base;
  }
  set time(v: number) {
    this.base = v;
    this.baseAt = performance.now();
  }
  loadVideoById(o: YTVideoRequest): void {
    this.calls.push(['load', o]);
    this.time = o.startSeconds ?? 0;
    this.videoUrl = null;
    this.pendingId = o.videoId;
  }
  cueVideoById(o: YTVideoRequest): void {
    this.calls.push(['cue', o]);
    this.time = o.startSeconds ?? 0;
    this.videoUrl = null;
    this.pendingId = o.videoId;
  }
  /** Iframe đã xử lý lệnh nạp gần nhất → báo URL video mới. */
  ack(): void {
    this.videoUrl = `https://www.youtube.com/watch?v=${this.pendingId}`;
  }
  playVideo(): void {
    this.calls.push(['play']);
  }
  pauseVideo(): void {
    this.calls.push(['pause']);
  }
  stopVideo(): void {
    this.calls.push(['stop']);
  }
  seekTo(s: number): void {
    this.calls.push(['seek', s]);
    this.time = s;
  }
  getCurrentTime(): number {
    return this.time;
  }
  getDuration(): number {
    return this.duration;
  }
  getPlayerState(): number {
    return -1;
  }
  getVideoUrl(): string | null {
    return this.videoUrl;
  }
  setVolume(v: number): void {
    this.calls.push(['volume', v]);
  }
  mute(): void {
    this.muted = true;
    this.calls.push(['mute']);
  }
  unMute(): void {
    this.muted = false;
    this.calls.push(['unMute']);
  }
  isMuted(): boolean {
    return this.muted;
  }
  destroy(): void {
    this.calls.push(['destroy']);
  }
  ready(): void {
    this.opts.events.onReady?.();
  }
  state(n: number): void {
    // Iframe báo trạng thái = đã xử lý lệnh nạp trước đó.
    this.ack();
    const cur = this.time;
    this.running = n === YT_STATE.PLAYING;
    this.time = cur;
    this.opts.events.onStateChange?.({ data: n });
  }
  /** Quảng cáo: vẫn báo PLAYING nhưng giây video đứng yên. */
  stall(): void {
    const cur = this.time;
    this.running = false;
    this.time = cur;
  }
  error(code: number): void {
    this.opts.events.onError?.({ data: code });
  }
  blocked(): void {
    this.opts.events.onAutoplayBlocked?.();
  }
  /** Lệnh gửi từ chỉ số `from` (bỏ lệnh âm lượng — chúng chạy kèm nhiều chỗ). */
  since(from: number): unknown[][] {
    return this.calls.slice(from).filter((c) => c[0] !== 'volume' && c[0] !== 'unMute');
  }
}

function ytState(key: number, startedAt: number, yt: Partial<DjYoutubeNow> = {}, extra: Partial<DjPublicState> = {}) {
  const s: DjPublicState = {
    trackId: 'chu_dai_bi_masew',
    bpm: DJ.youtube.bpm,
    startedAt,
    beat0: startedAt,
    playing: true,
    pausedAtMs: 0,
    theme: 'neon',
    dropAt: 0,
    hornAt: 0,
    confettiAt: 0,
    smokeAt: 0,
    strobeAt: 0,
    controllerPid: 'a',
    controllerName: 'A',
    yt: {
      key,
      videoId: ID,
      title: `Video ${key}`,
      author: 'Kênh',
      startMs: 0,
      byPid: 'a',
      byName: 'A',
      durationMs: 0,
      live: false,
      ...yt,
    },
    ytQueue: [],
    ...extra,
  };
  return s;
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

describe('DjYoutubeScreen — trình phát trên màn hình LED (YT.Player / DOM / lớp CSS3D giả)', () => {
  let win: EventTarget;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    win = new EventTarget();
    FakePlayer.last = null;
    vi.stubGlobal('window', { YT: { Player: FakePlayer } });
    vi.stubGlobal('document', { createElement: () => new FakeEl() });
    vi.stubGlobal('addEventListener', win.addEventListener.bind(win));
    vi.stubGlobal('removeEventListener', win.removeEventListener.bind(win));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Màn hình + context giả; giờ server = BASE + thời gian giả đã trôi từ lúc dựng. */
  function mount(first: DjPublicState) {
    const t0 = performance.now();
    const serverNow = () => BASE + (performance.now() - t0);
    const env = { me: { pid: 'a', x: 0, z: 0 }, music: 0.55, master: 0.8, state: first };
    const sent: unknown[][] = [];
    const toasts: string[] = [];
    const modes: unknown[][] = [];
    const live: boolean[] = [];
    const scene = new THREE.Scene();
    const layer = new FakeEl();
    const root = new FakeEl();
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 900);
    camera.position.set(0, 1.6, 8);
    camera.lookAt(0, 4.1, -16.5);
    const ctx = {
      serverNow,
      me: () => env.me,
      send: (type: string, data: unknown) => sent.push([type, data]),
      audio: { getVolume: (ch: string) => (ch === 'music' ? env.music : ch === 'master' ? env.master : 1) },
      ui: { toast: (text: string) => toasts.push(text), root },
      world: {
        camera,
        anchor: () => undefined,
        css3d: {
          scene,
          setLive: (v: boolean) => live.push(v),
          flush: () => {
            for (const o of scene.children) {
              const el = (o as unknown as { element: FakeEl }).element;
              if (!el.parentNode) layer.append(el);
            }
          },
        },
        controls: { setVideoScreen: (mode: string, title?: string | null) => modes.push([mode, title]) },
      },
    } as unknown as ClientActivityContext;
    const scr = new DjYoutubeScreen(ctx, () => env.state);
    /** Trạng thái server mới (khóa nguồn / mốc / dừng đổi thì DjMusic gọi apply). */
    const push = (s: DjPublicState, apply = true) => {
      env.state = s;
      if (apply) scr.apply(s);
    };
    /** Thời gian giả trôi `ms` (hẹn giờ, lượt kiểm mỗi giây, performance.now, giờ server, giây video cùng chạy). */
    const tick = (ms: number) => vi.advanceTimersByTime(ms);
    return { scr, env, sent, toasts, modes, live, scene, layer, root, camera, serverNow, push, tick };
  }

  /** Dựng, áp video phát ngay, trình phát sẵn sàng rồi chạy (PLAYING). */
  async function playing(s: DjPublicState) {
    const m = mount(s);
    m.push(s);
    await settle();
    const p = FakePlayer.last!;
    p.ready();
    p.state(YT_STATE.BUFFERING);
    p.state(YT_STATE.PLAYING);
    return { ...m, p };
  }

  it('chờ onReady mới ra lệnh; chưa tới giờ → nạp sẵn, đúng giờ mới phát; PLAYING → lỗ video + CSS3D', async () => {
    const m = mount(ytState(7, BASE + DJ.youtube.startDelayMs));
    m.push(m.env.state);
    expect(m.modes).toEqual([['loading', 'Video 7']]);
    // Khung YouTube vào DOM (flush) trước khi tạo trình phát; không nhận chuột; ẩn bằng visibility.
    expect(m.layer.children).toHaveLength(1);
    const wrap = m.layer.children[0]!;
    expect(wrap.style.pointerEvents).toBe('none');
    expect(wrap.style.visibility).toBe('hidden');
    expect(wrap.style.width).toBe('1280px');
    await settle();
    const p = FakePlayer.last!;
    expect(p.opts.width).toBe(1280);
    expect(p.opts.playerVars).toMatchObject({ autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0 });
    expect(p.calls).toEqual([]);
    p.ready();
    // Âm lượng mặc định (31) đặt trước, rồi nạp sẵn ở giây 0 — chưa phát.
    expect(p.calls).toEqual([['unMute'], ['volume', 31], ['cue', { videoId: ID, startSeconds: 0 }]]);
    m.tick(DJ.youtube.startDelayMs - 1);
    expect(p.since(3)).toEqual([]);
    m.tick(1);
    expect(p.since(3)).toEqual([['load', { videoId: ID, startSeconds: 0 }]]);
    p.state(YT_STATE.BUFFERING);
    expect(m.modes.at(-1)).toEqual(['loading', 'Video 7']);
    p.state(YT_STATE.PLAYING);
    expect(m.modes.at(-1)).toEqual(['video', null]);
    expect(wrap.style.visibility).toBe('visible');
    m.scr.update();
    expect(m.live.at(-1)).toBe(true);
    // Quay lưng lại màn hình → thôi vẽ lớp CSS3D.
    m.camera.lookAt(0, 1.6, 40);
    m.scr.update();
    expect(m.live.at(-1)).toBe(false);
  });

  it('vào giữa chừng: nạp + phát ngay đúng giây theo giờ server; link ?t= thì chờ tới giây bắt đầu', async () => {
    const late = await playing(ytState(3, BASE - 42_500));
    expect(late.p.since(0)[0]).toEqual(['load', { videoId: ID, startSeconds: 42.5 }]);
    late.scr.dispose();
    const m = mount(ytState(4, BASE + 2000 - 90_000, { startMs: 90_000 }));
    m.push(m.env.state);
    await settle();
    const p = FakePlayer.last!;
    p.ready();
    expect(p.since(0)).toEqual([['cue', { videoId: ID, startSeconds: 90 }]]);
    const from = p.calls.length;
    m.tick(2000);
    expect(p.since(from)).toEqual([['load', { videoId: ID, startSeconds: 90 }]]);
  });

  it('báo thời lượng 1 lần (đọc lại sau ≥ 4 s, không tăng → video thường); livestream thì báo live', async () => {
    const m = await playing(ytState(8, BASE));
    const p = m.p;
    m.tick(1000);
    p.duration = 212.4;
    m.tick(1000);
    m.tick(3000);
    expect(m.sent).toEqual([]);
    m.tick(1000);
    expect(m.sent).toEqual([['yt_meta', { videoId: ID, durationMs: 212_400, live: false }]]);
    m.tick(10_000);
    expect(m.sent).toHaveLength(1);
    m.scr.dispose();
    // Server đã biết (máy khác báo trước) → không báo nữa.
    const n = await playing(ytState(9, BASE));
    n.push({ ...n.env.state, yt: { ...n.env.state.yt!, durationMs: 100_000 } }, false);
    n.p.duration = 100;
    n.tick(8000);
    expect(n.sent).toEqual([]);
    n.scr.dispose();
    // Livestream: thời lượng còn tăng theo đồng hồ.
    const l = await playing(ytState(10, BASE));
    l.p.duration = 3600;
    l.tick(1000);
    l.p.duration = 3606;
    l.tick(5000);
    expect(l.sent).toEqual([['yt_meta', { videoId: ID, durationMs: 3_606_000, live: true }]]);
  });

  it('sửa lệch: biết thời lượng, chậm > 1,5 s → tua vượt lên 0,5 s; cách ≥ 5 s; quảng cáo thì thôi', async () => {
    const m = await playing(ytState(11, BASE));
    const p = m.p;
    m.push({ ...m.env.state, yt: { ...m.env.state.yt!, durationMs: 200_000 } }, false);
    const expected = () => (m.serverNow() - BASE) / 1000;
    const from = p.calls.length;
    // Vừa nạp đã đệm 2 s (chậm 2 s): lần kiểm đầu sau khi chạy lại chỉ ghi mốc; lần sau chưa đủ 5 s từ lúc nạp → chờ.
    p.state(YT_STATE.BUFFERING);
    m.tick(2000);
    p.state(YT_STATE.PLAYING);
    m.tick(2000);
    expect(p.since(from)).toEqual([]);
    m.tick(1000);
    expect(p.since(from)).toEqual([['seek', expected() + 0.5]]);
    // Đệm 1,4 s (chậm chưa tới ngưỡng 1,5 s) → để yên.
    m.tick(5000);
    p.state(YT_STATE.BUFFERING);
    m.tick(1900);
    p.state(YT_STATE.PLAYING);
    m.tick(3100);
    expect(p.since(from)).toHaveLength(1);
    expect(expected() - p.time).toBeCloseTo(1.4, 6);
    // Quảng cáo: đang PLAYING mà giây đứng yên → không tua dù lệch ngày càng xa.
    p.stall();
    m.tick(10_000);
    expect(p.since(from)).toHaveLength(1);
    expect(expected() - p.time).toBeGreaterThan(10);
  });

  it('dừng → dừng + tua về chỗ dừng (mọi máy cùng khung hình); phát tiếp → tua đúng giờ server rồi phát', async () => {
    const m = await playing(ytState(12, BASE));
    const p = m.p;
    m.tick(5000);
    const from = p.calls.length;
    m.push({ ...m.env.state, playing: false, pausedAtMs: 30_000 });
    expect(p.since(from)).toEqual([['pause'], ['seek', 30]]);
    p.state(YT_STATE.PAUSED);
    expect(m.modes.at(-1)).toEqual(['video', null]);
    // Phát tiếp: server hẹn giây 30 rơi vào sau switchDelayMs — tua tới chỗ giờ server đang tới rồi phát luôn.
    const at = m.serverNow();
    m.push({ ...m.env.state, playing: true, pausedAtMs: 0, startedAt: at + DJ.switchDelayMs - 30_000 });
    expect(p.since(from).slice(2)).toEqual([['seek', (30_000 - DJ.switchDelayMs) / 1000], ['play']]);
  });

  it('lỗi trình phát: báo server + toast tại máy, màn hình về "Đang tải", thôi ra lệnh cho video đó', async () => {
    const m = await playing(ytState(13, BASE));
    const p = m.p;
    p.error(150);
    expect(m.sent).toEqual([['yt_error', { videoId: ID, code: 150 }]]);
    expect(m.toasts.at(-1)).toContain(youtubeErrorText(150));
    expect(m.modes.at(-1)).toEqual(['loading', 'Video 13']);
    const from = p.calls.length;
    m.push({ ...m.env.state, playing: false, pausedAtMs: 1000 });
    p.error(150);
    m.tick(10_000);
    expect(p.since(from)).toEqual([]);
    expect(m.sent).toHaveLength(1);
  });

  it('lỗi đến muộn của video trước (iframe chưa xác nhận lệnh nạp mới) → không báo, nạp lại 1 lần; lỗi lần 2 mới báo', async () => {
    const NEXT = 'aqz-KE-bpKQ';
    const m = await playing(ytState(21, BASE));
    const p = m.p;
    // Server đã sang video kế (máy khác báo lỗi trước), hẹn phát sau startDelayMs: máy này cue → URL trình phát trống;
    // lỗi của video cũ (iframe phát ra trước khi nhận lệnh) mới tới.
    m.push(ytState(22, m.serverNow() + DJ.youtube.startDelayMs, { videoId: NEXT }));
    const from = p.calls.length;
    p.error(150);
    expect(m.sent).toEqual([]);
    expect(m.toasts).toEqual([]);
    expect(p.since(from)).toEqual([['cue', { videoId: NEXT, startSeconds: 0 }]]);
    // Tới giờ vẫn phát video mới.
    m.tick(DJ.youtube.startDelayMs);
    expect(p.since(from)).toContainEqual(['load', { videoId: NEXT, startSeconds: 0 }]);
    // Lỗi lần nữa cho video này (dù trình phát vẫn báo id cũ) → lỗi thật: báo server + toast.
    p.error(150);
    expect(m.sent).toEqual([['yt_error', { videoId: NEXT, code: 150 }]]);
    expect(m.toasts.at(-1)).toContain(youtubeErrorText(150));
    // Trình phát đã báo đúng id video đang cần → lỗi báo ngay (video kế).
    m.push(ytState(23, m.serverNow(), { videoId: ID }));
    p.ack();
    p.error(101);
    expect(m.sent.at(-1)).toEqual(['yt_error', { videoId: ID, code: 101 }]);
    // Tin trễ của iframe còn mang id cũ (URL = video trước, dạng `t=…&v=…`) → cũng là lỗi của video trước.
    m.push(ytState(24, m.serverNow() + DJ.youtube.startDelayMs, { videoId: NEXT }));
    p.videoUrl = `https://www.youtube.com/watch?t=5&v=${ID}`;
    const n = m.sent.length;
    p.error(150);
    expect(m.sent).toHaveLength(n);
  });

  it('bị chặn tự phát tiếng: phát tắt tiếng + nút; cú bấm kế tiếp bật tiếng; có tiếng rồi thì gỡ nút', async () => {
    const m = await playing(ytState(14, BASE));
    const p = m.p;
    p.blocked();
    expect(p.calls.slice(-2)).toEqual([['mute'], ['play']]);
    expect(m.root.children.map((c) => c.className)).toEqual(['btn dj-yt-chip']);
    // Đổi âm lượng lúc bị chặn: chỉ nhớ, vẫn tắt tiếng.
    m.env.music = 1;
    m.tick(300);
    m.scr.update();
    expect(p.muted).toBe(true);
    win.dispatchEvent(new Event('pointerdown'));
    expect(p.calls.slice(-3)).toEqual([['unMute'], ['volume', 56], ['play']]);
    // Phím giữ liên tục: không gửi dồn trong lúc chờ kiểm.
    const n = p.calls.length;
    win.dispatchEvent(new Event('keydown'));
    expect(p.calls).toHaveLength(n);
    // Kiểm ở lượt kiểm mỗi giây sau ≥ 1 s: đang phát, hết tắt tiếng → gỡ nút + thôi nghe cú bấm.
    m.tick(2000);
    expect(m.root.children).toHaveLength(0);
    const k = p.calls.length;
    win.dispatchEvent(new Event('pointerdown'));
    expect(p.calls).toHaveLength(k);
  });

  it('canh chặn tự phát: 4 s không chạy / đệm → tắt tiếng + nút; bật tiếng không được → tắt tiếng lại', async () => {
    const m = mount(ytState(15, BASE));
    m.push(m.env.state);
    await settle();
    const p = FakePlayer.last!;
    p.ready();
    expect(p.since(0)).toEqual([['load', { videoId: ID, startSeconds: 0 }]]);
    const loaded = p.calls.length;
    m.tick(3000);
    expect(m.root.children).toHaveLength(0);
    m.tick(1000);
    expect(p.since(loaded)).toEqual([['mute'], ['play']]);
    expect(m.root.children).toHaveLength(1);
    p.state(YT_STATE.PLAYING);
    win.dispatchEvent(new Event('pointerdown'));
    // Trình duyệt dừng video khi bật tiếng (iOS) → kiểm lại: phát tắt tiếng tiếp, giữ nút chờ cú bấm sau.
    p.state(YT_STATE.PAUSED);
    const from = p.calls.length;
    m.tick(2000);
    expect(p.since(from).slice(0, 2)).toEqual([['mute'], ['play']]);
    expect(m.root.children).toHaveLength(1);
  });

  it('đang bị chặn tiếng, video mới chờ giờ bắt đầu: cú bấm / kiểm lại / onAutoplayBlocked không phát sớm', async () => {
    const m = await playing(ytState(24, BASE));
    const p = m.p;
    p.blocked();
    // Vừa bấm thử bật tiếng thì server sang video mới (hẹn phát sau startDelayMs).
    win.dispatchEvent(new Event('pointerdown'));
    m.push(ytState(25, m.serverNow() + DJ.youtube.startDelayMs));
    const from = p.calls.length;
    m.tick(1500); // lượt kiểm lại lần thử bật tiếng rơi vào lúc chờ
    win.dispatchEvent(new Event('keydown'));
    p.blocked();
    expect(p.since(from).filter((c) => c[0] === 'play' || c[0] === 'load')).toEqual([]);
    // Đúng giờ server mới nạp + phát; cú bấm sau đó mới thử bật tiếng.
    m.tick(DJ.youtube.startDelayMs - 1500);
    expect(p.since(from).filter((c) => c[0] === 'play' || c[0] === 'load')).toEqual([
      ['load', { videoId: ID, startSeconds: 0 }],
    ]);
    p.state(YT_STATE.PLAYING);
    win.dispatchEvent(new Event('keydown'));
    expect(p.calls.slice(-1)).toEqual([['play']]);
    expect(p.muted).toBe(false);
  });

  it('âm lượng theo thanh âm lượng + chỗ đứng (Sòng Công Đức nhỏ lại, tắt thanh nhạc → mute) mỗi 250 ms', async () => {
    const m = await playing(ytState(16, BASE));
    const p = m.p;
    const casino = getZone('bar', 'casino')!.shape as { x: number; z: number };
    m.env.me = { pid: 'a', x: casino.x, z: casino.z };
    m.tick(250);
    m.scr.update();
    expect(p.calls.slice(-2)).toEqual([['unMute'], ['volume', 17]]);
    const n = p.calls.length;
    m.scr.update();
    m.tick(250);
    m.scr.update();
    expect(p.calls).toHaveLength(n);
    m.env.music = 0;
    m.tick(250);
    m.scr.update();
    expect(p.calls.at(-1)).toEqual(['mute']);
  });

  it('rời YouTube: dừng, màn hình về nền, giữ trình phát dùng lại; rời Bar: hủy trình phát, gỡ khung', async () => {
    const m = await playing(ytState(17, BASE));
    const p = m.p;
    m.scr.stop();
    expect(p.calls.at(-1)).toEqual(['stop']);
    expect(m.modes.at(-1)).toEqual(['idle', null]);
    expect(m.live.at(-1)).toBe(false);
    // Gọi lại khi không còn video: không làm gì thêm.
    const n = p.calls.length;
    m.scr.stop();
    expect(p.calls).toHaveLength(n);
    m.push(ytState(18, m.serverNow()));
    expect(FakePlayer.last).toBe(p);
    expect(p.since(n)).toEqual([['load', { videoId: ID, startSeconds: 0 }]]);
    expect(m.modes.at(-1)).toEqual(['loading', 'Video 18']);
    m.scr.dispose();
    expect(p.calls.at(-1)).toEqual(['destroy']);
    expect(m.layer.children).toHaveLength(0);
    expect(m.scene.children).toHaveLength(0);
    expect(m.modes.at(-1)).toEqual(['idle', null]);
    const k = p.calls.length;
    m.tick(10_000);
    m.push(ytState(19, m.serverNow()));
    expect(p.calls).toHaveLength(k);
  });
});
