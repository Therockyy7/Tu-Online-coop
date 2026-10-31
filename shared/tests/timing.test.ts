import { describe, expect, it } from 'vitest';
import { estimateClockOffset, judgeTiming } from '@shared/rules/timing';

describe('judgeTiming', () => {
  const w = { perfect: 45, good: 100 };

  it('biên cửa sổ tính cả hai phía', () => {
    expect(judgeTiming(0, w)).toBe('perfect');
    expect(judgeTiming(45, w)).toBe('perfect');
    expect(judgeTiming(-45, w)).toBe('perfect');
    expect(judgeTiming(46, w)).toBe('good');
    expect(judgeTiming(-100, w)).toBe('good');
    expect(judgeTiming(101, w)).toBe('miss');
    expect(judgeTiming(-150, w)).toBe('miss');
  });

  it('có cửa sổ great (thi nhảy)', () => {
    const dance = { perfect: 40, great: 80, good: 130 };
    expect(judgeTiming(30, dance)).toBe('perfect');
    expect(judgeTiming(-70, dance)).toBe('great');
    expect(judgeTiming(120, dance)).toBe('good');
    expect(judgeTiming(131, dance)).toBe('miss');
  });
});

describe('estimateClockOffset', () => {
  it('chọn mẫu có RTT nhỏ nhất', () => {
    // client gửi t0, nhận t1; server trả giờ server.
    const r = estimateClockOffset([
      { t0: 1000, t1: 1200, server: 5100 }, // rtt 200, offset 5100 − 1100 = 4000
      { t0: 2000, t1: 2040, server: 6030 }, // rtt 40, offset 6030 − 2020 = 4010
      { t0: 3000, t1: 3100, server: 7060 }, // rtt 100
    ]);
    expect(r).not.toBeNull();
    expect(r!.rtt).toBe(40);
    expect(r!.offset).toBe(4010);
  });

  it('không có mẫu → null', () => {
    expect(estimateClockOffset([])).toBeNull();
  });
});
