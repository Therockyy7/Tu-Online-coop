import { describe, expect, it } from 'vitest';
import {
  activeBuffs,
  applyTapNiem,
  buffMultiplier,
  computeGain,
  poolShareOf,
  tapNiemMultiplier,
} from '@shared/rules/karma';
import type { BuffState } from '@shared/types';

const NOW = 1_000_000;

describe('tapNiemMultiplier', () => {
  it('0 → 1, 100 → 0.5, 50 → 0.75', () => {
    expect(tapNiemMultiplier(0)).toBe(1);
    expect(tapNiemMultiplier(100)).toBe(0.5);
    expect(tapNiemMultiplier(50)).toBe(0.75);
  });

  it('kẹp trong 0..100', () => {
    expect(tapNiemMultiplier(-20)).toBe(1);
    expect(tapNiemMultiplier(500)).toBe(0.5);
  });
});

describe('buffs', () => {
  const buffs: BuffState[] = [
    { id: 'hao_quang', until: NOW + 1000 },
    { id: 'ban_phuoc', until: NOW - 1 },
  ];

  it('chỉ tính buff còn hạn', () => {
    expect(activeBuffs(buffs, NOW).map((b) => b.id)).toEqual(['hao_quang']);
    expect(buffMultiplier(buffs, NOW)).toBe(2);
  });

  it('nhân dồn các buff', () => {
    const all: BuffState[] = [
      { id: 'hao_quang', until: NOW + 1 },
      { id: 'ban_phuoc', until: NOW + 1 },
      { id: 'no_bung', until: NOW + 1 },
    ];
    expect(buffMultiplier(all, NOW)).toBeCloseTo(2 * 1.2 * 1.1);
  });
});

describe('computeGain', () => {
  it('không buff, không Tạp Niệm → giữ nguyên', () => {
    expect(computeGain(10, 0, [], NOW)).toBe(10);
  });

  it('Tạp Niệm 100 → một nửa', () => {
    expect(computeGain(10, 100, [], NOW)).toBe(5);
  });

  it('Hào quang ×2', () => {
    expect(computeGain(10, 0, [{ id: 'hao_quang', until: NOW + 5 }], NOW)).toBe(20);
  });

  it('tối thiểu 1 khi gốc > 0', () => {
    expect(computeGain(1, 100, [], NOW)).toBe(1);
  });

  it('gốc ≤ 0 → 0', () => {
    expect(computeGain(0, 0, [], NOW)).toBe(0);
    expect(computeGain(-3, 0, [], NOW)).toBe(0);
  });
});

describe('poolShareOf', () => {
  it('10% khoản nhận', () => {
    expect(poolShareOf(20)).toBeCloseTo(2);
    expect(poolShareOf(0)).toBe(0);
  });
});

describe('applyTapNiem', () => {
  it('kẹp trong 0..100', () => {
    expect(applyTapNiem(98, 5)).toBe(100);
    expect(applyTapNiem(3, -10)).toBe(0);
    expect(applyTapNiem(40, 6)).toBe(46);
  });
});
