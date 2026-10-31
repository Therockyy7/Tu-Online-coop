import { BUFFS, KARMA } from '../config/balance';
import type { BuffState } from '../types';
import { clamp } from '../util/math';

/** Hệ số do Tạp Niệm: 1 khi 0, 0.5 khi 100. */
export function tapNiemMultiplier(tapNiem: number): number {
  const t = clamp(tapNiem, 0, KARMA.tapNiemMax) / KARMA.tapNiemMax;
  return 1 - KARMA.tapNiemPenaltyAtMax * t;
}

export function activeBuffs(buffs: readonly BuffState[], now: number): BuffState[] {
  return buffs.filter((b) => b.until > now);
}

export function buffMultiplier(buffs: readonly BuffState[], now: number): number {
  let m = 1;
  for (const b of activeBuffs(buffs, now)) m *= BUFFS[b.id].mult;
  return m;
}

/** Công Đức thực nhận từ một khoản gốc (spec mục 4). */
export function computeGain(base: number, tapNiem: number, buffs: readonly BuffState[], now: number): number {
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * tapNiemMultiplier(tapNiem) * buffMultiplier(buffs, now)));
}

/** Phần cộng thêm vào Quỹ Công Đức của phòng (số thực, phòng tự cộng dồn). */
export const poolShareOf = (gain: number): number => (gain > 0 ? gain * KARMA.poolShare : 0);

export const applyTapNiem = (current: number, delta: number): number =>
  clamp(Math.round(current + delta), 0, KARMA.tapNiemMax);
