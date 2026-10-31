import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '@shared/util/rng';
import { isValidPlayerKey, normalizeRoomCode, sanitizeChat, sanitizeName } from '@shared/util/names';
import { lerpAngle, triangle01 } from '@shared/util/math';

describe('rng', () => {
  it('cùng seed → cùng dãy', () => {
    const a = createRng(42);
    const b = createRng(42);
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).toEqual(sb);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int nằm trong khoảng, shuffle giữ phần tử', () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = r.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
    }
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('hashString ổn định', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('names', () => {
  it('sanitizeName: 2–16 ký tự, giữ dấu tiếng Việt, bỏ ký tự điều khiển', () => {
    expect(sanitizeName('  Tiểu   Minh  ')).toBe('Tiểu Minh');
    expect(sanitizeName('A')).toBeNull();
    expect(sanitizeName('x'.repeat(17))).toBeNull();
    expect(sanitizeName('Ha' + String.fromCharCode(0x200b) + 'Na')).toBe('HaNa');
    expect(sanitizeName('Ha' + String.fromCharCode(0x2028) + 'Na')).toBe('HaNa');
    expect(sanitizeName(123)).toBeNull();
  });

  it('sanitizeChat cắt 120 ký tự, rỗng → null', () => {
    expect(sanitizeChat('   ')).toBeNull();
    expect([...(sanitizeChat('a'.repeat(200)) ?? '')].length).toBe(120);
    expect(sanitizeChat('<b>hi</b>')).toBe('<b>hi</b>'); // client hiển thị bằng textContent
  });

  it('normalizeRoomCode', () => {
    expect(normalizeRoomCode(' chua ')).toBe('CHUA');
    expect(normalizeRoomCode('AB1')).toBeNull();
    expect(normalizeRoomCode('ABIO')).toBeNull(); // I, O không có trong bảng mã
  });

  it('isValidPlayerKey', () => {
    expect(isValidPlayerKey('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isValidPlayerKey('0123456789ABCDEF0123456789abcdef')).toBe(false);
    expect(isValidPlayerKey('short')).toBe(false);
  });
});

describe('math', () => {
  it('lerpAngle đi đường ngắn', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 5);
  });

  it('triangle01', () => {
    expect(triangle01(0)).toBe(0);
    expect(triangle01(0.25)).toBeCloseTo(0.5);
    expect(triangle01(0.5)).toBeCloseTo(1);
    expect(triangle01(0.75)).toBeCloseTo(0.5);
  });
});
