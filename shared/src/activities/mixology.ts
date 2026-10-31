// Thi pha chế — Mixologist Battle (spec 8.5): đơn hàng, chấm lắc theo nhịp, tính tiền tip.
import { MIXOLOGY } from '../config/balance';

export interface MixOrder {
  id: number;
  /** Bàn khách 1..6 (trạm npc_table_N). */
  table: number;
  recipe: string;
  createdAt: number;
  takenBy: string | null;
  takenAt: number;
}

export interface MixPublicState {
  phase: 'idle' | 'lobby' | 'playing' | 'result';
  endsAt: number;
  /** Trạm pha chế → người đứng. */
  stations: Record<string, string | null>;
  orders: MixOrder[];
  scores: { pid: string; name: string; tips: number }[];
}

/** Chất lượng lắc 0..1 từ độ lệch (ms) của từng nhịp so với phách gần nhất. */
export function shakeQuality(deltas: readonly number[]): number {
  if (deltas.length === 0) return 0;
  let sum = 0;
  for (const d of deltas.slice(0, MIXOLOGY.shakeBeats)) {
    const a = Math.abs(d);
    sum += a <= 60 ? 1 : a <= 120 ? 0.65 : a <= 200 ? 0.35 : 0.1;
  }
  return sum / MIXOLOGY.shakeBeats;
}

/** Tiền tip: 20 × chất lượng × hệ số nhanh (giao trong 20 giây ×2, chậm dần tới ×0,75), kẹp 10..40. */
export function mixTip(quality: number, serveMs: number): number {
  const speed = Math.max(0.75, Math.min(2, 2 - serveMs / 30_000));
  return Math.max(MIXOLOGY.tipMin, Math.min(MIXOLOGY.tipMax, Math.round(MIXOLOGY.tipBase * quality * speed)));
}

export const recipeOf = (id: string) => MIXOLOGY.recipes.find((r) => r.id === id);
