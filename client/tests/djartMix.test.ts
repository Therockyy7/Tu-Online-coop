// Pha chế — lắc theo nhịp (client): khi nhạc DJ đang phát, chấm theo lưới phách của bài; nhạc dừng (hoặc chưa có bàn
// DJ, hoặc đang phát video YouTube — chỉ có nhịp danh nghĩa) thì không chấm theo lưới lệch tiếng nhạc mà theo lưới mặc
// định — nhịp bài tổng hợp đầu, phách 0 = lúc bắt đầu lắc (đúng nhịp chấm ● trên bảng).
import { describe, expect, it } from 'vitest';
import { DJ } from '@shared/index';
import { beatMs, type DjPublicState, type DjYoutubeNow } from '@shared/activities/dj';
import { shakeDelta } from '../src/activities/mixology/index';

const dj = (playing: boolean, beat0: number, bpm: number) => ({ playing, beat0, bpm }) as DjPublicState;

describe('shakeDelta — lưới chấm lắc của Pha chế', () => {
  it('nhạc đang phát: lệch so với phách gần nhất của bài DJ (bỏ qua mốc bắt đầu lắc)', () => {
    const bm = beatMs(128);
    const s = dj(true, 10_000, 128);
    expect(shakeDelta(s, 50_000, 10_000 + 3 * bm + 20)).toBeCloseTo(20, 6);
    expect(shakeDelta(s, 50_000, 10_000 + 5 * bm - 35)).toBeCloseTo(-35, 6);
  });

  it('nhạc dừng: dùng nhịp bài tổng hợp đầu neo lúc bắt đầu lắc, không theo lưới bài đã tắt', () => {
    const bm = beatMs(DJ.tracks[0]!.bpm);
    const shakeAt = 50_000;
    // Lưới của bài vừa dừng lệch hẳn nửa phách so với lưới mặc định — vẫn chấm theo lưới mặc định.
    const stopped = dj(false, shakeAt + bm / 2, 90);
    expect(shakeDelta(stopped, shakeAt, shakeAt + 2 * bm + 15)).toBeCloseTo(15, 6);
    expect(shakeDelta(stopped, shakeAt, shakeAt + 6 * bm - 40)).toBeCloseTo(-40, 6);
  });

  it('chưa có bàn DJ: cũng chấm theo lưới mặc định (trước đây mọi cú lắc bị tính lệch 300 ms)', () => {
    const bm = beatMs(DJ.tracks[0]!.bpm);
    expect(shakeDelta(undefined, 70_000, 70_000 + 4 * bm + 10)).toBeCloseTo(10, 6);
  });

  it('đang phát video YouTube: nhịp trong trạng thái chỉ là danh nghĩa → chấm theo lưới mặc định như nhạc dừng', () => {
    const bm = beatMs(DJ.tracks[0]!.bpm);
    const shakeAt = 50_000;
    const yt: DjYoutubeNow = {
      key: 1,
      videoId: 'dQw4w9WgXcQ',
      title: 'Video',
      author: 'Kênh',
      startMs: 0,
      byPid: 'a',
      byName: 'A',
      durationMs: 0,
      live: false,
    };
    // Lưới danh nghĩa (124 BPM, beat0 lệch nửa phách) không khớp tiếng video — vẫn chấm theo lưới mặc định.
    const s = { ...dj(true, shakeAt + bm / 2, DJ.youtube.bpm), yt } as DjPublicState;
    expect(shakeDelta(s, shakeAt, shakeAt + 3 * bm + 12)).toBeCloseTo(12, 6);
    expect(shakeDelta(s, shakeAt, shakeAt + 7 * bm - 25)).toBeCloseTo(-25, 6);
  });
});
