import { describe, expect, it } from 'vitest';
import { CHOP } from '@shared/config/balance';
import { chopJudge, chopMarkerPos, type ChopLog } from '@shared/activities/chop';

const log: ChopLog = { index: 0, center: 0.5, period: 1600, t0: 10_000 };

describe('chopMarkerPos', () => {
  it('bắt đầu ở 0, lên 1 ở nửa chu kỳ, về 0 hết chu kỳ', () => {
    expect(chopMarkerPos(log, 10_000)).toBeCloseTo(0);
    expect(chopMarkerPos(log, 10_400)).toBeCloseTo(0.5);
    expect(chopMarkerPos(log, 10_800)).toBeCloseTo(1);
    expect(chopMarkerPos(log, 11_600)).toBeCloseTo(0);
  });

  it('trước t0 kim đứng ở 0', () => {
    expect(chopMarkerPos(log, 9_000)).toBe(0);
  });
});

describe('chopJudge', () => {
  it('bấm đúng lúc kim qua tâm → hoàn hảo', () => {
    expect(chopJudge(log, 10_400, 0)).toBe('perfect');
  });

  it('lệch vừa phải → tốt; lệch xa → trượt', () => {
    // Tìm thời điểm kim ở mép vùng xanh (khoảng cách tới tâm ~ green/2 − ε).
    const goodPos = 0.5 + CHOP.greenWidth / 2 - 0.01;
    const tGood = 10_000 + (Math.acos(1 - 2 * goodPos) / (2 * Math.PI)) * 1600;
    expect(chopMarkerPos(log, tGood)).toBeCloseTo(goodPos, 3);
    expect(chopJudge(log, tGood, 0)).toBe('good');
    expect(chopJudge(log, 10_800, 0)).toBe('miss');
  });

  it('dung sai thời gian giúp nhát bấm hơi trễ vẫn được tính', () => {
    const late = 10_400 + 60;
    expect(chopJudge(log, late, 0)).not.toBe('perfect');
    expect(chopJudge(log, late, 60)).toBe('perfect');
  });
});
