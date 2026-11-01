// Nhạc thu sẵn bám giờ server (tùy chọn `follow` — nhạc DJ): chờ đúng giờ mới vào bài, nắn lệch bằng tốc độ phát, lệch
// lớn thì tua, tháo bài thì dọn thẻ; phổ nhạc trả false khi không có nhạc; mức to bài có nhịp (setBeatLevel — nhạc DJ
// tổng hợp nhỏ lại trong Sòng). Thẻ audio + AudioContext giả (chạy trong node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, type FollowRecordedOptions } from '../src/audio/index';

const param = () => ({
  value: 1,
  setTargetAtTime: vi.fn(),
  setValueAtTime: vi.fn(),
  cancelScheduledValues: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

class FakeCtx {
  /** Mọi nút gain đã tạo (để soi mức to riêng của từng bài nhạc tổng hợp). */
  static gains: { gain: ReturnType<typeof param> }[] = [];
  state = 'running';
  currentTime = 0;
  sampleRate = 48_000;
  outputLatency = 0;
  baseLatency = 0;
  destination = {};
  createGain = () => {
    const g = { ...node(), gain: param() };
    FakeCtx.gains.push(g);
    return g;
  };
  createDynamicsCompressor = () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  createConvolver = () => ({ ...node(), buffer: null });
  createBuffer = (_ch: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  createMediaElementSource = () => node();
  createAnalyser = () => ({ ...node(), fftSize: 2048, frequencyBinCount: 1024, context: this, getByteFrequencyData: vi.fn() });
  resume = () => Promise.resolve();
}

class FakeAudio {
  static all: FakeAudio[] = [];
  preload = '';
  loop = true;
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  ended = false;
  seeking = false;
  readyState = 0;
  playbackRate = 1;
  buffered = { length: 0, start: () => 0, end: () => 0 };
  plays = 0;
  private readonly handlers = new Map<string, (() => void)[]>();
  constructor() {
    FakeAudio.all.push(this);
  }
  addEventListener(type: string, fn: () => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  removeEventListener(): void {}
  emit(type: string): void {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
  play(): Promise<void> {
    this.plays++;
    this.paused = false;
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
  load(): void {}
  removeAttribute(): void {
    this.src = '';
  }
  /** Tải xong metadata (thời lượng d giây). */
  meta(d: number): void {
    this.readyState = 1;
    this.duration = d;
    this.emit('loadedmetadata');
  }
}

let server = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.all = [];
  server = 1_000_000;
  vi.stubGlobal('AudioContext', FakeCtx);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2, HAVE_FUTURE_DATA: 3, HAVE_ENOUGH_DATA: 4 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Âm thanh đã mở khóa, đồng hồ server giả; bài DJ bắt đầu lúc `startedAt` (giờ server). */
function setup(startedAt: number) {
  const audio = createAudio();
  audio.unlock();
  audio.setClock(() => server);
  const opts: FollowRecordedOptions = { loop: false, follow: true, startAt: () => (server - startedAt) / 1000 };
  audio.setRecorded('dj.mp3', 1, opts);
  const el = FakeAudio.all.at(-1)!;
  /** Tiến cả đồng hồ server lẫn hẹn giờ. */
  const pass = (ms: number) => {
    server += ms;
    vi.advanceTimersByTime(ms);
  };
  return { audio, el, pass };
}

describe('Nhạc thu sẵn bám giờ server (follow)', () => {
  it('chưa tới giờ: đứng chờ ở giây 0, tới giờ mới phát', () => {
    const { el, pass } = setup(server + 800);
    expect(el.loop).toBe(false);
    expect(el.plays).toBe(0); // chưa có metadata thì chưa phát
    pass(100);
    el.meta(234.6);
    expect(el.plays).toBe(0);
    expect(el.currentTime).toBe(0);
    pass(650);
    expect(el.plays).toBe(0);
    pass(60);
    expect(el.plays).toBe(1);
    expect(el.currentTime).toBeLessThan(0.05);
  });

  it('vào giữa bài: tua đúng giây theo giờ server rồi phát', () => {
    const { el } = setup(server - 42_000);
    el.meta(234.6);
    expect(el.plays).toBe(1);
    expect(el.currentTime).toBeCloseTo(42, 2);
  });

  it('lệch nhỏ → nhích tốc độ phát tới khi khớp; lệch lớn → tua thẳng', () => {
    const startedAt = server - 10_000;
    const { el, pass } = setup(startedAt);
    el.meta(234.6);
    el.readyState = 4;
    /** Giây đúng theo giờ server ở lần kiểm lệch kế tiếp (sau 200 ms) — thẻ giả không tự chạy giờ. */
    const next = () => (server + 200 - startedAt) / 1000;
    // Phát trễ 100 ms so với giờ server → tăng tốc (kẹp ở +4%).
    el.currentTime = next() - 0.1;
    pass(200);
    expect(el.playbackRate).toBeGreaterThan(1);
    expect(el.playbackRate).toBeLessThanOrEqual(1.04 + 1e-9);
    // Còn lệch 20 ms (dưới ngưỡng vào nhưng trên ngưỡng ra) → vẫn nắn tiếp.
    el.currentTime = next() - 0.02;
    pass(200);
    expect(el.playbackRate).toBeGreaterThan(1);
    // Đã khớp → về tốc độ thường; sớm 20 ms thì chưa nắn (ngưỡng vào 30 ms).
    el.currentTime = next();
    pass(200);
    expect(el.playbackRate).toBe(1);
    el.currentTime = next() + 0.02;
    pass(200);
    expect(el.playbackRate).toBe(1);
    // Sớm 60 ms → giảm tốc.
    el.currentTime = next() + 0.06;
    pass(200);
    expect(el.playbackRate).toBeLessThan(1);
    // Sớm 2 giây (tab treo, mạng giật) → tua thẳng về đúng giây.
    el.currentTime = next() + 2;
    pass(200);
    expect(el.currentTime).toBeCloseTo((server - startedAt) / 1000, 3);
    expect(el.playbackRate).toBe(1);
  });

  it('tắt (setRecorded null) → dọn thẻ audio, thôi kiểm lệch', () => {
    const { audio, el, pass } = setup(server - 5000);
    el.meta(234.6);
    audio.setRecorded(null, 0);
    pass(3000);
    expect(el.src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('phát lại cùng bài (null rồi url): thẻ mới tua đúng mốc mới', () => {
    const { audio, el, pass } = setup(server - 30_000);
    el.meta(234.6);
    audio.setRecorded(null, 0);
    const startedAt = server + 800;
    audio.setRecorded('dj.mp3', 1, { loop: false, follow: true, startAt: () => (server - startedAt) / 1000 } as FollowRecordedOptions);
    const el2 = FakeAudio.all.at(-1)!;
    expect(el2).not.toBe(el);
    el2.meta(234.6);
    expect(el2.plays).toBe(0);
    pass(800);
    expect(el2.plays).toBe(1);
    expect(el2.currentTime).toBeLessThan(0.05);
  });

  it('phổ nhạc: chưa có nhạc → false, mảng về 0', () => {
    const audio = createAudio();
    const out = new Float32Array(20).fill(0.5);
    expect(audio.musicBands(out)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
    audio.unlock();
    out.fill(0.5);
    expect(audio.musicBands(out)).toBe(false);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

describe('Mức to bài có nhịp (setBeatLevel — nhạc DJ tổng hợp nhỏ lại trong Sòng)', () => {
  /** Các nút gain tạo ra trong lúc chạy `fn`. */
  const gainsDuring = (fn: () => void) => {
    const from = FakeCtx.gains.length;
    fn();
    return FakeCtx.gains.slice(from);
  };

  it('bài bật sau theo mức đã đặt (kể cả đặt trước khi mở khóa); đổi mức thì bài đang phát đổi êm', () => {
    const audio = createAudio();
    audio.setBeatLevel(0.55);
    audio.unlock();
    audio.setClock(() => server);
    const made = gainsDuring(() => audio.startBeatTrack('mo_house', server, 124));
    const level = made.find((g) => g.gain.value === 0.55);
    expect(level).toBeDefined();
    audio.setBeatLevel(1);
    expect(level!.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, expect.any(Number), expect.any(Number));
  });

  it('stopBeatTrack trả mức về 1 cho bài có nhịp bật sau; nhạc nền (setMusic) không theo mức bài có nhịp', () => {
    const audio = createAudio();
    audio.unlock();
    audio.setClock(() => server);
    audio.setBeatLevel(0.55);
    audio.startBeatTrack('mo_house', server, 124);
    audio.stopBeatTrack();
    const next = gainsDuring(() => audio.startBeatTrack('edm_niet_ban', server, 128));
    expect(next.length).toBeGreaterThan(0);
    expect(next.some((g) => g.gain.value === 0.55)).toBe(false);
    audio.stopBeatTrack();
    audio.setBeatLevel(0.3);
    const bg = gainsDuring(() => audio.setMusic('temple_ambience'));
    expect(bg.length).toBeGreaterThan(0);
    expect(bg.some((g) => g.gain.value === 0.3)).toBe(false);
  });
});
