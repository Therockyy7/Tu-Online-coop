// Va chạm 2D trên mặt phẳng XZ, dùng chung client (di chuyển) và server (kiểm tra).
import { MOVE } from '../config/balance';
import type { Vec2 } from '../types';
import { clamp } from '../util/math';
import type { BoxShape, ColliderDef, GateDef, MapDef, ZoneDef, ZoneShape } from './types';

export interface MoveContext {
  /** Bán kính người chơi (mặc định MOVE.radius). */
  radius?: number;
  /** Có được đi qua cổng này không (vd đủ cấp vào Chánh Điện, có VIP). */
  canPassGate: (gate: GateDef) => boolean;
}

const MAX_STEP = 0.25;
const ITERATIONS = 4;

/** Đẩy điểm (tâm hình tròn bán kính r) ra khỏi một hộp. Trả true nếu có đẩy. */
function pushOutOfBox(p: Vec2, b: BoxShape, r: number): boolean {
  const hw = b.w / 2;
  const hd = b.d / 2;
  const minX = b.x - hw;
  const maxX = b.x + hw;
  const minZ = b.z - hd;
  const maxZ = b.z + hd;
  const qx = clamp(p.x, minX, maxX);
  const qz = clamp(p.z, minZ, maxZ);
  const dx = p.x - qx;
  const dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    p.x = qx + (dx / d) * r;
    p.z = qz + (dz / d) * r;
    return true;
  }
  // Tâm nằm trong hộp: đẩy ra theo cạnh gần nhất.
  const left = p.x - minX;
  const right = maxX - p.x;
  const top = p.z - minZ;
  const bottom = maxZ - p.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = minX - r;
  else if (m === right) p.x = maxX + r;
  else if (m === top) p.z = minZ - r;
  else p.z = maxZ + r;
  return true;
}

function pushOutOfCircle(p: Vec2, cx: number, cz: number, cr: number, r: number): boolean {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const min = cr + r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  if (d2 < 1e-12) {
    p.x = cx + min;
    return true;
  }
  const d = Math.sqrt(d2);
  p.x = cx + (dx / d) * min;
  p.z = cz + (dz / d) * min;
  return true;
}

function pushOutOfCollider(p: Vec2, c: ColliderDef, r: number): boolean {
  return c.kind === 'circle' ? pushOutOfCircle(p, c.x, c.z, c.r, r) : pushOutOfBox(p, c, r);
}

function clampToBounds(p: Vec2, map: MapDef): void {
  p.x = clamp(p.x, map.bounds.minX, map.bounds.maxX);
  p.z = clamp(p.z, map.bounds.minZ, map.bounds.maxZ);
}

/** Đẩy một vị trí ra khỏi mọi vật cản (và cổng không được qua), kẹp trong biên. */
export function settle(pos: Vec2, map: MapDef, ctx: MoveContext): Vec2 {
  const r = ctx.radius ?? MOVE.radius;
  const p = { x: pos.x, z: pos.z };
  for (let it = 0; it < ITERATIONS; it++) {
    let moved = false;
    for (const c of map.colliders) if (pushOutOfCollider(p, c, r)) moved = true;
    for (const g of map.gates) if (!ctx.canPassGate(g) && pushOutOfBox(p, g.box, r)) moved = true;
    clampToBounds(p, map);
    if (!moved) break;
  }
  return p;
}

/**
 * Di chuyển từ `from` tới `to`, chia bước nhỏ để không xuyên tường,
 * trượt dọc vật cản. Trả vị trí cuối cùng hợp lệ.
 */
export function resolveMove(from: Vec2, to: Vec2, map: MapDef, ctx: MoveContext): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  const steps = Math.max(1, Math.ceil(len / MAX_STEP));
  let p: Vec2 = { x: from.x, z: from.z };
  for (let i = 0; i < steps; i++) {
    p = settle({ x: p.x + dx / steps, z: p.z + dz / steps }, map, ctx);
  }
  return p;
}

/** Vị trí có bị vật cản chiếm không (dùng để kiểm tra điểm spawn/điểm đứng). */
export function isBlocked(pos: Vec2, map: MapDef, ctx: MoveContext): boolean {
  const s = settle(pos, map, ctx);
  return Math.abs(s.x - pos.x) > 1e-6 || Math.abs(s.z - pos.z) > 1e-6;
}

export function pointInShape(p: Vec2, shape: ZoneShape | BoxShape): boolean {
  if ('kind' in shape && shape.kind === 'circle') {
    const dx = p.x - shape.x;
    const dz = p.z - shape.z;
    return dx * dx + dz * dz <= shape.r * shape.r;
  }
  const b = shape as BoxShape;
  return Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.z - b.z) <= b.d / 2;
}

export const pointInZone = (p: Vec2, zone: ZoneDef): boolean => pointInShape(p, zone.shape);
