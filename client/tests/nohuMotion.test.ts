// Chuyển động cuộn máy Nổ Hũ phía client (thuần): cuộn đi liền mạch, dừng đúng ô server quyết đúng mốc reelStopMs, quay
// đủ nhanh, dội nhẹ rồi đứng yên; cần gạt kéo xuống rồi nhả về.
import { describe, expect, it } from 'vitest';
import { NOHU } from '@shared/index';
import { NOHU_STRIP_LEN } from '@shared/activities/nohu';
import { BOUNCE_S, MIN_SPEED, leverPull, reelDistance, reelPosition, travel, wrapCell } from '../src/activities/nohu/motion';

const TS = NOHU.reelStopMs.map((ms) => ms / 1000);

describe('Nổ Hũ — chuyển động cuộn', () => {
  it('quãng đi chuẩn hóa: 0 lúc bắt đầu, 1 đúng lúc dừng, không lùi, không giật', () => {
    for (const T of TS) {
      expect(travel(0, T)).toBe(0);
      expect(travel(-0.3, T)).toBe(0);
      expect(travel(T, T)).toBe(1);
      let prev = 0;
      for (let i = 1; i <= 400; i++) {
        const v = travel((T * i) / 400, T);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(v - prev).toBeLessThan(0.02);
        prev = v;
      }
      expect(prev).toBeCloseTo(1, 12);
    }
  });

  it('mọi cặp ô xuất phát → ô dừng: đi đúng tới ô dừng, tốc độ đỉnh không dưới MIN_SPEED', () => {
    for (const T of TS) {
      for (let from = 0; from < NOHU_STRIP_LEN; from += 3) {
        for (let to = 0; to < NOHU_STRIP_LEN; to++) {
          const d = reelDistance(from + 0.3, to, T);
          expect(wrapCell(from + 0.3 + d)).toBeCloseTo(to, 9);
          expect(d / (T - 0.06 - 0.21)).toBeGreaterThanOrEqual(MIN_SPEED - 1e-9);
          // Ngay trước mốc dừng cuộn còn cách ô dừng chưa tới 1 ô.
          const near = reelPosition(from + 0.3, d, to, T - 0.02, T);
          expect(wrapCell(to - near)).toBeLessThan(1);
        }
      }
    }
  });

  it('tới mốc dừng đúng ô; dội nhẹ (< 0,2 ô) rồi đứng yên', () => {
    const T = TS[2]!;
    const d = reelDistance(5, 17, T);
    expect(reelPosition(5, d, 17, T, T)).toBe(17);
    for (let i = 1; i < 10; i++) {
      const p = reelPosition(5, d, 17, T + (BOUNCE_S * i) / 10, T);
      expect(p).toBeGreaterThanOrEqual(17);
      expect(p - 17).toBeLessThan(0.2);
    }
    expect(reelPosition(5, d, 17, T + BOUNCE_S, T)).toBe(17);
    expect(reelPosition(5, d, 17, T + 5, T)).toBe(17);
  });

  it('cần gạt: 0 trước lượt, kéo hết cỡ rồi nhả về 0 trước khi cuộn 1 dừng', () => {
    expect(leverPull(-1)).toBe(0);
    expect(leverPull(0)).toBe(0);
    expect(leverPull(0.18)).toBe(1);
    expect(leverPull(0.4)).toBeGreaterThan(0);
    expect(leverPull(0.4)).toBeLessThan(1);
    expect(leverPull(TS[0]!)).toBe(0);
  });
});
