import { describe, expect, it } from 'vitest';
import { isBlocked, pointInShape, resolveMove } from '@shared/maps/collision';
import type { MapDef } from '@shared/maps/types';

const R = 0.45;
const testMap: MapDef = {
  id: 'temple',
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  spawn: { x: 0, z: 8, r: 1 },
  stations: [],
  colliders: [
    { kind: 'box', x: 0, z: 0, w: 10, d: 1, tag: 'wall' },
    { kind: 'circle', x: 0, z: -6, r: 1, tag: 'tree' },
  ],
  gates: [{ id: 'g', box: { x: 7.5, z: 0, w: 5, d: 1 }, require: 'chanh_dien', message: 'chặn' }],
  zones: [],
  roofs: [],
};
const open = { canPassGate: () => true };
const closed = { canPassGate: () => false };

describe('resolveMove', () => {
  it('không xuyên tường hộp', () => {
    const p = resolveMove({ x: 0, z: 5 }, { x: 0, z: -5 }, testMap, open);
    expect(p.z).toBeCloseTo(0.5 + R, 5);
  });

  it('trượt dọc tường (giữ thành phần tiếp tuyến)', () => {
    const p = resolveMove({ x: 0, z: 2 }, { x: 3, z: -2 }, testMap, open);
    expect(p.x).toBeCloseTo(3, 5);
    expect(p.z).toBeCloseTo(0.5 + R, 5);
  });

  it('không lọt vào vật cản tròn', () => {
    const p = resolveMove({ x: -4, z: -6 }, { x: 4, z: -6.01 }, testMap, open);
    const d = Math.hypot(p.x - 0, p.z + 6);
    expect(d).toBeGreaterThanOrEqual(1 + R - 1e-6);
  });

  it('kẹp trong biên map', () => {
    const p = resolveMove({ x: 8, z: 8 }, { x: 30, z: 30 }, testMap, open);
    expect(p.x).toBeLessThanOrEqual(10);
    expect(p.z).toBeLessThanOrEqual(10);
  });

  it('cổng chặn khi không đủ điều kiện, cho qua khi đủ', () => {
    const blocked = resolveMove({ x: 7.5, z: 4 }, { x: 7.5, z: -4 }, testMap, closed);
    expect(blocked.z).toBeGreaterThan(0.5);
    const passed = resolveMove({ x: 7.5, z: 4 }, { x: 7.5, z: -4 }, testMap, open);
    expect(passed.z).toBeCloseTo(-4, 5);
  });

  it('isBlocked nhận ra điểm nằm trong vật cản', () => {
    expect(isBlocked({ x: 0, z: 0 }, testMap, open)).toBe(true);
    expect(isBlocked({ x: 0, z: 5 }, testMap, open)).toBe(false);
  });
});

describe('pointInShape', () => {
  it('hộp và tròn', () => {
    expect(pointInShape({ x: 1, z: 0 }, { kind: 'circle', x: 0, z: 0, r: 1 })).toBe(true);
    expect(pointInShape({ x: 1.1, z: 0 }, { kind: 'circle', x: 0, z: 0, r: 1 })).toBe(false);
    expect(pointInShape({ x: 2, z: 0.5 }, { kind: 'box', x: 0, z: 0, w: 4, d: 1 })).toBe(true);
    expect(pointInShape({ x: 2.1, z: 0 }, { x: 0, z: 0, w: 4, d: 1 })).toBe(false);
  });
});
