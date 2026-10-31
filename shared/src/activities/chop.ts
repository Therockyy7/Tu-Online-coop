// Chẻ củi (spec 7.2) — kiểu dữ liệu + luật thuần dùng chung: client vẽ kim, server chấm điểm theo cùng công thức.
// QUY ƯỚC cho mọi hoạt động: shared/src/activities/<id>.ts chứa public state, payload sự kiện/thao tác và luật thuần.
import { CHOP } from '../config/balance';
import type { Pid } from '../types';

export type ChopResult = 'perfect' | 'good' | 'miss';

export interface ChopLog {
  index: number;
  /** Tâm vùng xanh trên thanh 0..1. */
  center: number;
  /** Chu kỳ kim chạy 0 → 1 → 0 (ms). */
  period: number;
  /** Giờ server kim bắt đầu ở vị trí 0. */
  t0: number;
}

/** actState: thớt nào đang có người chẻ + kho củi nhà bếp. */
export interface ChopPublicState {
  blocks: Record<string, Pid | null>;
  firewood: number;
}

/** actOpen. */
export interface ChopOpenData {
  stationId: string;
  total: number;
}

/** actEvent 'log' (riêng người chẻ): tham số khúc gỗ mới. */
export interface ChopLogEvent extends ChopLog {
  green: number;
  perfect: number;
  total: number;
}

/** actEvent 'result' (riêng người chẻ). */
export interface ChopResultEvent {
  index: number;
  result: ChopResult;
  firewood: number;
}

/** actEvent 'done' (riêng người chẻ). */
export interface ChopDoneEvent {
  perfect: number;
  good: number;
  miss: number;
}

/** act 'chop': thời điểm bấm theo giờ server (client ước lượng). */
export interface ChopAction {
  index: number;
  t: number;
}

/** Vị trí kim (0..1) tại giờ server t: bắt đầu ở 0, lên 1 ở nửa chu kỳ rồi về 0 (dạng cos mượt). */
export function chopMarkerPos(log: ChopLog, t: number): number {
  if (t <= log.t0) return 0;
  const phase = ((t - log.t0) % log.period) / log.period;
  return 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
}

/**
 * Chấm một nhát bổ tại giờ t. Xét cả khoảng [t − slack, t + slack] (bù sai số đồng hồ/độ trễ)
 * và lấy khoảng cách nhỏ nhất tới tâm vùng xanh.
 */
export function chopJudge(log: ChopLog, t: number, slackMs: number): ChopResult {
  let best = Infinity;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const tt = t - slackMs + (2 * slackMs * i) / steps;
    best = Math.min(best, Math.abs(chopMarkerPos(log, tt) - log.center));
  }
  if (best <= CHOP.perfectWidth / 2) return 'perfect';
  if (best <= CHOP.greenWidth / 2) return 'good';
  return 'miss';
}
