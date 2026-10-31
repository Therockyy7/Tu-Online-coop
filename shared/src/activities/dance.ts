// Thi nhảy kiểu Audition (spec 8.3) — bài nhảy sinh tất định từ seed, chấm Space đúng phách 4, cộng điểm.
import { DANCE } from '../config/balance';
import { judgeTiming, type Judgement } from '../rules/timing';
import { createRng } from '../util/rng';

/** Hướng mũi tên: 0 lên, 1 xuống, 2 trái, 3 phải. */
export type ArrowDir = 0 | 1 | 2 | 3;
export const OPPOSITE: Record<ArrowDir, ArrowDir> = { 0: 1, 1: 0, 2: 3, 3: 2 };

export interface DanceMeasure {
  /** Mũi tên hiển thị (đỏ = bấm hướng ngược lại). */
  arrows: ArrowDir[];
  reversed: boolean[];
}

/** Bài nhảy: các ô nhịp dạo (intro) trống, sau đó số mũi tên tăng dần 3 → 9; từ ô reverseFromMeasure có mũi tên đỏ. */
export function danceChart(seed: number, measures: number = DANCE.measures): DanceMeasure[] {
  const rng = createRng(seed);
  const out: DanceMeasure[] = [];
  const playable = measures - DANCE.introMeasures;
  for (let i = 0; i < measures; i++) {
    if (i < DANCE.introMeasures) {
      out.push({ arrows: [], reversed: [] });
      continue;
    }
    const k = arrowCount(i, playable);
    const arrows: ArrowDir[] = [];
    const reversed: boolean[] = [];
    for (let j = 0; j < k; j++) {
      arrows.push(rng.int(0, 3) as ArrowDir);
      reversed.push(i >= DANCE.reverseFromMeasure && rng.chance(0.3));
    }
    out.push({ arrows, reversed });
  }
  return out;
}

/** Số mũi tên của ô nhịp i (tăng dần từ arrowsMin tới arrowsMax). */
export function arrowCount(i: number, playable: number = DANCE.measures - DANCE.introMeasures): number {
  const p = (i - DANCE.introMeasures) / Math.max(1, playable - 1);
  return Math.round(DANCE.arrowsMin + Math.max(0, Math.min(1, p)) * (DANCE.arrowsMax - DANCE.arrowsMin));
}

/** Phím cần bấm cho mũi tên thứ j của ô nhịp. */
export const expectedKey = (m: DanceMeasure, j: number): ArrowDir => (m.reversed[j] ? OPPOSITE[m.arrows[j]!] : m.arrows[j]!);

export const judgeDanceHit = (deltaMs: number): Judgement =>
  judgeTiming(deltaMs, { perfect: DANCE.perfectMs, great: DANCE.greatMs, good: DANCE.goodMs });

/** Điểm 1 ô nhịp: điểm gốc × (1 + k/10), cộng thưởng chuỗi Perfect liên tiếp. */
export function measureScore(j: Judgement, k: number, perfectStreak: number): number {
  const base = DANCE.points[j];
  if (base === 0) return 0;
  const bonus = j === 'perfect' ? Math.max(0, perfectStreak - 1) * DANCE.perfectComboBonus : 0;
  return Math.round(base * (1 + k / 10) + bonus);
}

export interface DancePlayerState {
  pid: string;
  name: string;
  score: number;
  streak: number;
  last: Judgement | null;
}

export interface DancePublicState {
  phase: 'idle' | 'lobby' | 'playing' | 'result';
  lobbyEndsAt: number;
  /** Giờ server bắt đầu ô nhịp 0. */
  startAt: number;
  bpm: number;
  seed: number;
  measures: number;
  players: DancePlayerState[];
  results: { pid: string; name: string; score: number; xu: number }[];
}

/** act 'measure': kết quả nhập chuỗi + thời điểm bấm Space (giờ server). */
export interface DanceMeasureAction {
  i: number;
  ok: boolean;
  t: number;
}
