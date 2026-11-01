// Danh sách bài DJ hợp nhất (thu sẵn + tổng hợp) và lưới phách theo giờ server.
import { describe, expect, it } from 'vitest';
import { DJ } from '../src/config/balance';
import {
  DJ_RECORDED_IDS,
  DJ_TRACKS,
  alignedStartAt,
  beat0At,
  beatIndexAt,
  beatMs,
  gridAnchorAt,
  nextMeasureAt,
  nextTrackId,
  positionMs,
  trackInfo,
  type DjPublicState,
} from '../src/activities/dj';

const recorded = DJ_TRACKS.filter((t) => t.kind === 'recorded');
const synth = DJ_TRACKS.filter((t) => t.kind === 'synth');

describe('Danh sách bài DJ', () => {
  it('4 bài thu sẵn đứng trước 4 bài tổng hợp, id không trùng', () => {
    expect(recorded.map((t) => t.id)).toEqual([...DJ_RECORDED_IDS]);
    expect(synth.map((t) => t.id)).toEqual(DJ.tracks.map((t) => t.id));
    expect(DJ_TRACKS.slice(0, 4).every((t) => t.kind === 'recorded')).toBe(true);
    expect(new Set(DJ_TRACKS.map((t) => t.id)).size).toBe(DJ_TRACKS.length);
  });

  it('BPM 60–200; bài thu sẵn có file, thời lượng > 0, phách mạnh đầu trong ô nhịp đầu; bài tổng hợp lặp mãi', () => {
    for (const t of DJ_TRACKS) {
      expect(t.bpm).toBeGreaterThanOrEqual(60);
      expect(t.bpm).toBeLessThanOrEqual(200);
    }
    for (const t of recorded) {
      expect(t.file).toMatch(/^[a-z0-9-]+\.mp3$/);
      expect(t.durationMs).toBeGreaterThan(60_000);
      expect(t.beatOffsetMs).toBeGreaterThanOrEqual(0);
      expect(t.beatOffsetMs).toBeLessThan(4 * beatMs(t.bpm));
      for (const d of t.drops ?? []) {
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(t.durationMs);
      }
    }
    for (const t of synth) {
      expect(t.durationMs).toBe(0);
      expect(t.beatOffsetMs).toBe(0);
      expect(t.file).toBeUndefined();
    }
  });

  it('đổi pha giữa bài: tăng dần, mốc neo nằm ngay sau mốc đổi (≤ 1 phách), trong bài', () => {
    for (const t of recorded) {
      let prev = 0;
      for (const g of t.grid ?? []) {
        expect(g.atMs).toBeGreaterThan(prev);
        expect(g.beatMs).toBeGreaterThan(g.atMs);
        expect(g.beatMs - g.atMs).toBeLessThanOrEqual(beatMs(t.bpm));
        expect(g.beatMs).toBeLessThan(t.durationMs);
        prev = g.beatMs;
      }
    }
  });

  it('trackInfo: id lạ lùi về bài đầu', () => {
    expect(trackInfo('chu_dai_bi_remix').file).toBe('chu-dai-bi-remix.mp3');
    expect(trackInfo('khong_co' as never).id).toBe(DJ_TRACKS[0]!.id);
  });

  it('nextTrackId vòng quanh trong nhóm của bài (thu sẵn / tổng hợp)', () => {
    const ids = recorded.map((t) => t.id);
    expect(nextTrackId(ids[0]!, 1)).toBe(ids[1]);
    expect(nextTrackId(ids[3]!, 1)).toBe(ids[0]);
    expect(nextTrackId(ids[0]!, -1)).toBe(ids[3]);
    const s = synth.map((t) => t.id);
    expect(nextTrackId(s[3]!, 1)).toBe(s[0]);
    expect(nextTrackId(s[0]!, -1)).toBe(s[3]);
  });
});

describe('Lưới phách', () => {
  it('chỉ số phách và ranh ô nhịp kế tiếp theo beat0', () => {
    const g = { beat0: 1000, bpm: 120 };
    expect(beatIndexAt(g, 1000)).toBe(0);
    expect(beatIndexAt(g, 1499)).toBe(0);
    expect(beatIndexAt(g, 1500)).toBe(1);
    expect(beatIndexAt(g, 999)).toBe(-1);
    expect(nextMeasureAt(g, 1001)).toBe(3000);
    expect(nextMeasureAt(g, 3000)).toBe(3000);
  });

  it('mốc neo theo vị trí trong bài: trước lần đổi pha đầu = phách mạnh đầu, sau đó = mốc neo của đoạn', () => {
    const t = trackInfo('chu_dai_bi_remix');
    const g = t.grid!;
    expect(gridAnchorAt(t, 0)).toBe(t.beatOffsetMs);
    expect(gridAnchorAt(t, g[0]!.atMs - 1)).toBe(t.beatOffsetMs);
    expect(gridAnchorAt(t, g[0]!.atMs)).toBe(g[0]!.beatMs);
    expect(gridAnchorAt(t, t.durationMs)).toBe(g[g.length - 1]!.beatMs);
    expect(beat0At(t, 50_000, g[1]!.atMs + 10)).toBe(50_000 + g[1]!.beatMs);
    const s = trackInfo('mo_house');
    expect(beat0At(s, 7000, 123_456)).toBe(7000);
  });

  it('vị trí trong bài: đang phát = giờ − mốc bắt đầu; đang dừng = vị trí lúc dừng', () => {
    const st = { startedAt: 10_000, playing: true, pausedAtMs: 0 } as DjPublicState;
    expect(positionMs(st, 12_500)).toBe(2500);
    expect(positionMs({ ...st, playing: false, pausedAtMs: 4321 }, 99_999)).toBe(4321);
  });

  it('phát lại đúng phách: phách mạnh đầu của bài rơi đúng lưới ô nhịp cũ, không sớm hơn mốc cho phép', () => {
    for (const t of recorded) {
      const grid = { beat0: 123_456.7, bpm: t.bpm };
      const earliest = 500_000;
      const at = alignedStartAt(t, grid, earliest);
      const m = 4 * beatMs(t.bpm);
      expect(at).toBeGreaterThanOrEqual(earliest);
      expect(at - m).toBeLessThan(earliest);
      const k = (at + t.beatOffsetMs - grid.beat0) / m;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
  });
});
