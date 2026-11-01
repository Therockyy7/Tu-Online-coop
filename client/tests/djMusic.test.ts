// Nhạc DJ phía client (DjMusic): chỉ gọi audio khi trạng thái phát đổi, bài thu sẵn bám giờ server, bài tổng hợp theo
// lưới phách, nhỏ lại trong Sòng Công Đức (cả bài thu sẵn lẫn bài tổng hợp), phách → đèn, Drop tự bắn ở mốc drop; hiệu
// ứng DJ (DjEffects) trong Sòng nhỏ tiếng, không rung / chớp trắng. Context giả, không cần trình duyệt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DJ, getZone } from '@shared/index';
import { DJ_RECORDED, beatMs, trackInfo, type DjAnyTrackId, type DjPublicState } from '@shared/activities/dj';
import type { FollowRecordedOptions } from '../src/audio/index';
import { DjEffects } from '../src/activities/dj/effects';
import { DjMusic } from '../src/activities/dj/music';
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
  return { ctx, env, calls, of };
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
  };
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
