// Tiện ích Quán Bar dùng chung client/server: Vòng quay sự thật (8.7) và Bầu Cua Cá Cọp (8.6).
import { BAUCUA_SYMBOLS, type BauCuaSymbol } from '../ids';

// ───────────── Vòng quay sự thật ─────────────

export const WHEEL_SEGMENTS = 12;

export interface TruthWheelState {
  startAt: number;
  endAt: number;
  /** Ô dừng (0..11): ô lẻ = Sự thật, ô chẵn = Thử thách (khớp hình vẽ trên đĩa). */
  segment: number;
  targetPid: string | null;
  targetName: string;
  kind: 'truth' | 'dare';
  text: string;
  cooldownUntil: number;
}

export const segmentKind = (segment: number): 'truth' | 'dare' => (segment % 2 === 1 ? 'truth' : 'dare');

/** Góc quay (quanh Z) để tâm ô `segment` nằm dưới kim chỉ ở đỉnh, cộng thêm `spins` vòng tính từ góc hiện tại. */
export function wheelFinalAngle(current: number, segment: number, spins = 5): number {
  const phi = ((segment + 0.5) / WHEEL_SEGMENTS) * Math.PI * 2;
  const target = Math.PI / 2 + phi;
  const tau = Math.PI * 2;
  const delta = (((target - current) % tau) + tau) % tau;
  return current + spins * tau + delta;
}

// ───────────── Bầu Cua Cá Cọp ─────────────

export interface BauCuaState {
  phase: 'idle' | 'betting' | 'rolling' | 'payout';
  endsAt: number;
  round: number;
  /** Kết quả 3 xúc xắc (rỗng khi đang đặt cược / đang lắc). */
  dice: BauCuaSymbol[];
  bets: Record<string, Partial<Record<BauCuaSymbol, number>>>;
  names: Record<string, string>;
}

/** Số Xu trả lại cho 1 người (đã trừ tiền cược lúc đặt): ô xuất hiện m mặt nhận lại B + B×m, không xuất hiện mất B. */
export function bauCuaReturn(bets: Partial<Record<BauCuaSymbol, number>>, dice: readonly BauCuaSymbol[]): number {
  let total = 0;
  for (const sym of BAUCUA_SYMBOLS) {
    const b = bets[sym] ?? 0;
    if (b <= 0) continue;
    const m = dice.filter((d) => d === sym).length;
    if (m > 0) total += b + b * m;
  }
  return total;
}

export const totalBet = (bets: Partial<Record<BauCuaSymbol, number>> | undefined): number =>
  bets ? Object.values(bets).reduce((a, b) => a + (b ?? 0), 0) : 0;
