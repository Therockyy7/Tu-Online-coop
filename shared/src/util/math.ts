import type { Vec2 } from '../types';

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const round2 = (v: number): number => Math.round(v * 100) / 100;
export const dist2 = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};
export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(dist2(a, b));

/** Nội suy góc theo đường ngắn nhất (radian). */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Góc quay quanh trục Y để nhìn theo hướng (dx, dz) — quy ước: ry=0 nhìn về +Z. */
export const headingOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

/** Hàm tam giác 0→1→0 theo pha t (chu kỳ 1). */
export function triangle01(t: number): number {
  const f = t - Math.floor(t);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}
