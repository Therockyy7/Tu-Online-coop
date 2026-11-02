// Nhạc DJ phía client (DjMusic): chỉ gọi audio khi trạng thái phát đổi, bài thu sẵn bám giờ server, bài tổng hợp theo
// lưới phách, nhỏ lại trong Sòng Công Đức (cả bài thu sẵn lẫn bài tổng hợp), phách → đèn, Drop tự bắn ở mốc drop; hiệu
// ứng DJ (DjEffects) trong Sòng nhỏ tiếng, không rung / chớp trắng; video YouTube (spec 2026-11-02): một nguồn nhạc tại
// một lúc, trình phát (bản giả) nhận trạng thái khi khóa nguồn đổi, đèn theo nhịp danh nghĩa, không Drop tự động.
// Context giả, không cần trình duyệt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DJ, getZone, sanitizeTitle } from '@shared/index';
import {
  DJ_RECORDED,
  beatMs,
  trackInfo,
  type DjAnyTrackId,
  type DjPublicState,
  type DjYoutubeNow,
} from '@shared/activities/dj';
import type { FollowRecordedOptions } from '../src/audio/index';
import { DjEffects } from '../src/activities/dj/effects';
import { DjMusic } from '../src/activities/dj/music';
import type { YoutubeScreenLike } from '../src/activities/dj/youtube/screen';
import type { ClientActivityContext } from '../src/activities/types';

function fakeCtx() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const log =
    (fn: string, ret?: unknown) =>
    (...args: unknown[]) => {
      calls.push({ fn, args });
      return ret;
    };
  const env = { now: 1_000_000, me: { pid: 'a', x: 0, z: 0 } };
  const ctx = {
    serverNow: () => env.now,
    me: () => env.me,
    audio: {
      setRecorded: log('setRecorded'),
      startBeatTrack: log('startBeatTrack'),
      stopBeatTrack: log('stopBeatTrack'),
      setBeatLevel: log('setBeatLevel'),
      musicBands: log('musicBands', false),
      djDrop: log('djDrop'),
      play: log('play'),
    },
    world: {
      controls: {
        setMusicPlaying: log('setMusicPlaying'),
        setNowPlaying: log('setNowPlaying'),
        onBeat: log('onBeat'),
        drop: log('drop'),
        setSpectrum: log('setSpectrum'),
        smoke: log('smoke'),
        strobe: log('strobe'),
      },
      shake: log('shake'),
      burst: log('burst'),
    },
    ui: { screenFx: { flash: log('flash') } },
  } as unknown as ClientActivityContext;
  const of = (fn: string) => calls.filter((c) => c.fn === fn);
  return { ctx, env, calls, of, log };
}

function djState(trackId: DjAnyTrackId, startedAt: number, playing = true): DjPublicState {
  const t = trackInfo(trackId);
  return {
    trackId,
    bpm: t.bpm,
    startedAt,
    beat0: startedAt + t.beatOffsetMs,
    playing,
    pausedAtMs: 0,
    theme: 'neon',
    dropAt: 0,
    hornAt: 0,
    confettiAt: 0,
    smokeAt: 0,
    strobeAt: 0,
    controllerPid: null,
    controllerName: null,
    yt: null,
    ytQueue: [],
  };
}

/** Đang phát video YouTube (key) từ startedAt: nhịp danh nghĩa, beat0 = startedAt, bài có sẵn gần nhất = bài 1. */
function ytState(key: number, startedAt: number, playing = true, extra: Partial<DjYoutubeNow> = {}): DjPublicState {
  return {
    ...djState(DJ_RECORDED[0]!.id, startedAt, playing),
    bpm: DJ.youtube.bpm,
    beat0: startedAt,
    yt: {
      key,
      videoId: 'dQw4w9WgXcQ',
      title: `Video ${key}`,
      author: 'Kênh',
      startMs: 0,
      byPid: 'a',
      byName: 'A',
      durationMs: 0,
      live: false,
      ...extra,
    },
  };
}

/** DjMusic với trình phát YouTube giả (ghi lời gọi vào cùng nhật ký với audio để so thứ tự). */
function withScreen() {
  const f = fakeCtx();
  const getters: (() => DjPublicState | null)[] = [];
  const screen: YoutubeScreenLike = {
    apply: f.log('screen.apply'),
    update: f.log('screen.update'),
    stop: f.log('screen.stop'),
    dispose: f.log('screen.dispose'),
  };
  const m = new DjMusic((_ctx, getState) => {
    getters.push(getState);
    return screen;
  });
  return { ...f, m, getters };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DjMusic — phát theo trạng thái server', () => {
  it('bài thu sẵn: mở 1 lần với tùy chọn bám giờ server; cùng trạng thái thì không gọi lại audio', () => {
    const { ctx, env, of } = fakeCtx();
    const m = new DjMusic();
    const first = DJ_RECORDED[0]!;
    const s = djState(first.id, env.now + 1000);
    m.sync(s, ctx);
    const rec = of('setRecorded');
    expect(rec).toHaveLength(1);
    const [url, level, opts] = rec[0]!.args as [string, number, FollowRecordedOptions];
    expect(url).toContain(first.file!.replace('.mp3', ''));
    expect(level).toBe(1);
    expect(opts.follow).toBe(true);
    expect(opts.loop).toBe(false);
    expect(opts.startAt!(234)).toBeCloseTo(-1, 6);
    env.now += 5000;
    expect(opts.startAt!(234)).toBeCloseTo(4, 6);
    expect(of('setMusicPlaying').at(-1)!.args[0]).toBe(true);
    expect(of('setNowPlaying').at(-1)!.args[0]).toBe(first.name);
    m.sync({ ...s, theme: 'fire', dropAt: env.now }, ctx);
    expect(of('setRecorded')).toHaveLength(1);
  });

  it('phát lại cùng bài (mốc mới) → tắt hẳn rồi mở thẻ mới; dừng → tắt, ẩn chữ chạy', () => {
    const { ctx, env, of } = fakeCtx();
    const m = new DjMusic();
    const id = DJ_RECORDED[1]!.id;
    m.sync(djState(id, env.now), ctx);
    m.sync(djState(id, env.now + 60_000), ctx);
    const rec = of('setRecorded');
    expect(rec.map((c) => c.args[0] === null)).toEqual([false, true, false]);
    m.sync(djState(id, env.now + 60_000, false), ctx);
    expect(of('setRecorded').at(-1)!.args[0]).toBeNull();
    expect(of('setMusicPlaying').at(-1)!.args[0]).toBe(false);
    expect(of('setNowPlaying').at(-1)!.args[0]).toBeNull();
  });

  it('bài tổng hợp → startBeatTrack theo mốc; sang bài thu sẵn → tắt bài có nhịp', () => {
    const { ctx, env, of } = fakeCtx();
    const m = new DjMusic();
    m.sync(djState(DJ_RECORDED[0]!.id, env.now), ctx);
    const synth = DJ.tracks[2]!;
    m.sync(djState(synth.id, env.now + 800), ctx);
    expect(of('setRecorded').at(-1)!.args[0]).toBeNull();
    expect(of('startBeatTrack').at(-1)!.args).toEqual([synth.id, env.now + 800, synth.bpm]);
    m.sync(djState(DJ_RECORDED[2]!.id, env.now + 900), ctx);
    expect(of('stopBeatTrack')).toHaveLength(1);
    expect(of('setRecorded').at(-1)!.args[0]).not.toBeNull();
  });

  it('vào Sòng Công Đức → nhỏ còn mức casinoLevel, gửi lại đúng tùy chọn cũ; ra lại → to hết cỡ', () => {
    const { ctx, env, of } = fakeCtx();
    let clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const m = new DjMusic();
    const s = djState(DJ_RECORDED[0]!.id, env.now);
    m.sync(s, ctx);
    const opts = of('setRecorded')[0]!.args[2];
    const casino = getZone('bar', 'casino')!.shape as { x: number; z: number };
    env.me = { pid: 'a', x: casino.x, z: casino.z };
    m.update(s, ctx);
    expect(of('setRecorded')).toHaveLength(1); // chưa tới lượt kiểm chỗ đứng
    clock += 300;
    m.update(s, ctx);
    expect(of('setRecorded').at(-1)!.args.slice(1)).toEqual([DJ.casinoLevel, opts]);
    clock += 300;
    m.update(s, ctx);
    expect(of('setRecorded')).toHaveLength(2);
    env.me = { pid: 'a', x: 0, z: 0 };
    clock += 300;
    m.update(s, ctx);
    expect(of('setRecorded').at(-1)!.args.slice(1)).toEqual([1, opts]);
  });

  it('phách → onBeat (đổi pha theo đoạn của bài ghép), Drop tự bắn ở mốc drop', () => {
    const { ctx, env, of } = fakeCtx();
    const m = new DjMusic();
    const t = trackInfo('chu_dai_bi_remix');
    const startedAt = env.now;
    const s = djState(t.id, startedAt);
    m.sync(s, ctx);
    const step = beatMs(t.bpm);
    env.now = startedAt + t.beatOffsetMs + 1;
    m.update(s, ctx);
    env.now += step;
    m.update(s, ctx);
    expect(of('onBeat').map((c) => c.args[0])).toEqual([0, 1]);
    // Qua mốc đổi pha đầu tiên: phách 0 mới ở beatMs của đoạn.
    const g = t.grid![0]!;
    env.now = startedAt + g.beatMs - 30;
    m.update(s, ctx);
    env.now = startedAt + g.beatMs + 5;
    m.update(s, ctx);
    expect(of('onBeat').at(-1)!.args[0]).toBe(0);
    expect(of('drop')).toHaveLength(1); // drop đầu của bài trùng mốc đoạn mới
    env.now = startedAt + t.drops![1]! + 20_000;
    m.update(s, ctx);
    expect(of('drop')).toHaveLength(1); // nhảy cóc quá xa (tua / treo tab): không bắn bù
  });
});

describe('DJ khi đứng trong Sòng Công Đức', () => {
  const casino = () => getZone('bar', 'casino')!.shape as { x: number; z: number };

  it('bài tổng hợp: mức to đặt trước khi bật theo chỗ đứng; vào / ra Sòng đổi mức; dừng → tắt bài có nhịp', () => {
    const { ctx, env, calls, of } = fakeCtx();
    let clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const m = new DjMusic();
    const c = casino();
    env.me = { pid: 'a', x: c.x, z: c.z };
    const synth = DJ.tracks[0]!;
    const s = djState(synth.id, env.now);
    m.sync(s, ctx);
    // Đứng trong Sòng lúc bật: mức nhỏ đặt TRƯỚC startBeatTrack (bài vào thẳng mức đúng).
    expect(calls.filter((x) => x.fn === 'setBeatLevel' || x.fn === 'startBeatTrack').map((x) => x.fn)).toEqual([
      'setBeatLevel',
      'startBeatTrack',
    ]);
    expect(of('setBeatLevel')[0]!.args).toEqual([DJ.casinoLevel]);
    // Ra sảnh Bar → to hết cỡ ở lượt kiểm chỗ đứng kế; không đổi thì không gửi lại.
    env.me = { pid: 'a', x: 0, z: 0 };
    m.update(s, ctx);
    expect(of('setBeatLevel')).toHaveLength(1);
    clock += 300;
    m.update(s, ctx);
    expect(of('setBeatLevel').at(-1)!.args).toEqual([1]);
    clock += 300;
    m.update(s, ctx);
    expect(of('setBeatLevel')).toHaveLength(2);
    env.me = { pid: 'a', x: c.x, z: c.z };
    clock += 300;
    m.update(s, ctx);
    expect(of('setBeatLevel').at(-1)!.args).toEqual([DJ.casinoLevel]);
    expect(of('setRecorded')).toHaveLength(0);
    // Dừng nhạc → tắt bài có nhịp (mức to bài có nhịp về 1 theo hợp đồng AudioApi); thôi đổi mức theo chỗ đứng.
    const stopped = djState(synth.id, env.now, false);
    m.sync(stopped, ctx);
    expect(of('stopBeatTrack')).toHaveLength(1);
    env.me = { pid: 'a', x: 0, z: 0 };
    clock += 300;
    m.update(stopped, ctx);
    expect(of('setBeatLevel')).toHaveLength(3);
  });

  it('Drop tự bắn của bài thu sẵn: trong Sòng vẫn nháy đèn nhưng không rung màn hình; ngoài sảnh rung như cũ', () => {
    const { ctx, env, of } = fakeCtx();
    const m = new DjMusic();
    const t = trackInfo('chu_dai_bi_remix');
    const startedAt = env.now;
    const s = djState(t.id, startedAt);
    const c = casino();
    env.me = { pid: 'a', x: c.x, z: c.z };
    m.sync(s, ctx);
    const [d0, d1] = [t.drops![0]!, t.drops![1]!];
    env.now = startedAt + d0 - 30;
    m.update(s, ctx);
    env.now = startedAt + d0 + 5;
    m.update(s, ctx);
    expect(of('drop')).toHaveLength(1);
    expect(of('shake')).toHaveLength(0);
    env.me = { pid: 'a', x: 0, z: 0 };
    env.now = startedAt + d1 - 30;
    m.update(s, ctx);
    env.now = startedAt + d1 + 5;
    m.update(s, ctx);
    expect(of('drop')).toHaveLength(2);
    expect(of('shake')).toHaveLength(1);
  });

  it('hiệu ứng bàn DJ: trong Sòng tiếng nhỏ theo casinoLevel, không rung / chớp trắng; ngoài sảnh như cũ', () => {
    const { ctx, env, of } = fakeCtx();
    const fx = new DjEffects();
    const base = djState(DJ_RECORDED[0]!.id, env.now - 60_000);
    const c = casino();
    env.me = { pid: 'a', x: c.x, z: c.z };
    fx.onState({ ...base, dropAt: env.now - 100, hornAt: env.now - 100, smokeAt: env.now - 100 }, ctx);
    expect(of('djDrop')[0]!.args).toEqual([DJ.casinoLevel]);
    expect(of('drop')).toHaveLength(1); // đèn sàn nhảy (phòng bên) vẫn nháy
    expect(of('shake')).toHaveLength(0);
    expect(of('flash')).toHaveLength(0);
    const vol = (id: string) => (of('play').find((p) => p.args[0] === id)!.args[1] as { volume: number }).volume;
    expect(vol('airhorn')).toBeCloseTo(0.7 * DJ.casinoLevel, 6);
    expect(vol('smoke_jet')).toBeCloseTo(0.8 * DJ.casinoLevel, 6);
    // Ra sảnh Bar: Drop kế tiếp to hết cỡ, rung + chớp như cũ.
    env.me = { pid: 'a', x: 0, z: 0 };
    fx.onState({ ...base, dropAt: env.now - 50 }, ctx);
    expect(of('djDrop').at(-1)!.args).toEqual([1]);
    expect(of('shake')).toHaveLength(1);
    expect(of('flash')).toHaveLength(1);
  });
});

describe('DjMusic — video YouTube trên màn hình LED', () => {
  it('vào YouTube: tắt hẳn bài thu sẵn, trình phát nhận trạng thái, chữ chạy hiện tên video (cắt 48 ký tự)', () => {
    const { ctx, env, of, m, getters } = withScreen();
    m.sync(djState(DJ_RECORDED[0]!.id, env.now), ctx);
    expect(of('setRecorded')).toHaveLength(1);
    const long = 'Sơn Tùng M-TP — Chúng Ta Của Tương Lai (Official Music Video) | 4K Remastered Edition';
    const s = ytState(7, env.now + DJ.youtube.startDelayMs, true, { title: long });
    m.sync(s, ctx);
    expect(of('setRecorded').at(-1)!.args).toEqual([null, 0]);
    expect(of('screen.apply')).toHaveLength(1);
    expect(of('screen.apply')[0]!.args[0]).toBe(s);
    const shown = of('setNowPlaying').at(-1)!.args[0] as string;
    expect(shown).toBe(sanitizeTitle(long, 48));
    expect([...shown]).toHaveLength(48);
    expect(of('setMusicPlaying').at(-1)!.args[0]).toBe(true);
    expect(of('startBeatTrack')).toHaveLength(0);
    expect(getters).toHaveLength(1);
  });

  it('cùng khóa nguồn / chỉ đổi thời lượng → không áp lại, không mở lại nguồn; trình phát đọc được số mới', () => {
    const { ctx, env, of, m, getters } = withScreen();
    const s = ytState(3, env.now);
    m.sync(s, ctx);
    m.sync({ ...s, theme: 'fire', dropAt: env.now }, ctx);
    const meta: DjPublicState = { ...s, yt: { ...s.yt!, durationMs: 200_000 } };
    m.sync(meta, ctx);
    expect(of('screen.apply')).toHaveLength(1);
    expect(of('setRecorded')).toHaveLength(0);
    expect(getters[0]!()?.yt?.durationMs).toBe(200_000);
    // Dừng video (playing đổi) → áp lại, ẩn chữ chạy; phát tiếp (startedAt mới) → áp lại.
    m.sync({ ...meta, playing: false, pausedAtMs: 30_000 }, ctx);
    expect(of('screen.apply')).toHaveLength(2);
    expect(of('setNowPlaying').at(-1)!.args[0]).toBeNull();
    m.sync({ ...meta, startedAt: env.now + 1000 - 30_000 }, ctx);
    expect(of('screen.apply')).toHaveLength(3);
    // Video khác (key mới) dù cùng mốc → áp lại; chỉ một trình phát cho cả lúc ở Bar.
    m.sync({ ...meta, startedAt: env.now + 1000 - 30_000, yt: { ...meta.yt!, key: 4 } }, ctx);
    expect(of('screen.apply')).toHaveLength(4);
    expect(getters).toHaveLength(1);
  });

  it('từ bài tổng hợp sang YouTube: tắt bài có nhịp, không mở bài thu sẵn', () => {
    const { ctx, env, of, m } = withScreen();
    m.sync(djState(DJ.tracks[0]!.id, env.now), ctx);
    m.sync(ytState(1, env.now + 2500), ctx);
    expect(of('stopBeatTrack')).toHaveLength(1);
    expect(of('setRecorded')).toHaveLength(0);
    expect(of('screen.apply')).toHaveLength(1);
  });

  it('đèn theo nhịp danh nghĩa từ lúc video vào bài (cả link ?t=), không Drop; trình phát update mỗi khung', () => {
    const { ctx, env, of, m } = withScreen();
    // Link ?t=90: giây 0 của video nằm 87,5 s trong quá khứ nhưng video chỉ vào bài sau 2,5 s nữa.
    const playAtMs = env.now + DJ.youtube.startDelayMs;
    const s = ytState(5, playAtMs - 90_000, true, { startMs: 90_000 });
    m.sync(s, ctx);
    m.update(s, ctx);
    expect(of('onBeat')).toHaveLength(0);
    expect(of('screen.update')).toHaveLength(1);
    const step = beatMs(DJ.youtube.bpm);
    env.now = playAtMs + 1;
    m.update(s, ctx);
    env.now += step;
    m.update(s, ctx);
    const beats = of('onBeat').map((c) => c.args);
    expect(beats).toHaveLength(2);
    expect(beats[1]![0]).toBe((beats[0]![0] as number) + 1);
    expect(beats[0]![1]).toBe(DJ.youtube.bpm);
    // Đi qua mốc drop của bài có sẵn gần nhất (trackId) → không Drop, không rung.
    const drop0 = DJ_RECORDED[0]!.drops![0]!;
    env.now = s.startedAt + drop0 - 30;
    m.update(s, ctx);
    env.now = s.startedAt + drop0 + 5;
    m.update(s, ctx);
    expect(of('drop')).toHaveLength(0);
    expect(of('shake')).toHaveLength(0);
    // Đang dừng: không nháy theo nhịp.
    const n = of('onBeat').length;
    const paused = { ...s, playing: false, pausedAtMs: 100_000 };
    m.sync(paused, ctx);
    env.now += step * 3;
    m.update(paused, ctx);
    expect(of('onBeat')).toHaveLength(n);
  });

  it('rời YouTube về bài thu sẵn: dừng trình phát TRƯỚC khi mở bài; rời Bar → hủy trình phát, vào lại tạo mới', () => {
    const { ctx, env, calls, of, m, getters } = withScreen();
    m.sync(ytState(5, env.now), ctx);
    m.sync(djState(DJ_RECORDED[1]!.id, env.now + DJ.switchDelayMs), ctx);
    const order = calls
      .filter((c) => c.fn === 'screen.stop' || c.fn === 'setRecorded')
      .map((c) => (c.fn === 'setRecorded' ? (c.args[0] === null ? 'tắt bài' : 'mở bài') : c.fn));
    expect(order).toEqual(['screen.stop', 'mở bài']);
    expect(of('setNowPlaying').at(-1)!.args[0]).toBe(DJ_RECORDED[1]!.name);
    m.stop(ctx);
    expect(of('screen.dispose')).toHaveLength(1);
    expect(of('setRecorded').at(-1)!.args[0]).toBeNull();
    m.reset();
    m.sync(ytState(6, env.now), ctx);
    expect(getters).toHaveLength(2);
  });
});
