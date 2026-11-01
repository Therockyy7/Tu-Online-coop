// Tài Xỉu chẵn lẻ (Sòng Công Đức) — luật thuần dùng chung client/server: 3 xúc xắc, 5 ô cược ăn theo khối TAIXIU.
// Tài (tổng 11–17), Xỉu (4–10), Chẵn, Lẻ ăn 1:1 nhưng gặp bộ ba (3 mặt giống nhau) thì cả 4 ô đều thua; Bộ Ba ăn 1:30.
import { TAIXIU } from '../config/balance';
import type { CasinoPhase, CasinoSettleLine, StakeMap } from './casino';

export const TAIXIU_BETS = ['tai', 'xiu', 'chan', 'le', 'bo_ba'] as const;
export type TaiXiuBet = (typeof TAIXIU_BETS)[number];

export const TAIXIU_LABELS: Record<TaiXiuBet, string> = { tai: 'Tài', xiu: 'Xỉu', chan: 'Chẵn', le: 'Lẻ', bo_ba: 'Bộ Ba' };
/** Dòng phụ dưới tên ô cược. */
export const TAIXIU_SUBS: Record<TaiXiuBet, string> = {
  tai: 'Tổng 11–17',
  xiu: 'Tổng 4–10',
  chan: 'Tổng chẵn',
  le: 'Tổng lẻ',
  bo_ba: '3 mặt giống nhau',
};

export interface TaiXiuOutcome {
  sum: number;
  tai: boolean;
  xiu: boolean;
  chan: boolean;
  le: boolean;
  /** Bộ ba: Tài/Xỉu/Chẵn/Lẻ đều false (nhà cái ăn), chỉ ô Bộ Ba thắng. */
  triple: boolean;
}

export function taiXiuOutcome(dice: readonly number[]): TaiXiuOutcome {
  const sum = dice.reduce((a, b) => a + b, 0);
  const triple = dice.length === 3 && dice[0] === dice[1] && dice[1] === dice[2];
  return {
    sum,
    tai: !triple && sum >= 11 && sum <= 17,
    xiu: !triple && sum >= 4 && sum <= 10,
    chan: !triple && sum % 2 === 0,
    le: !triple && sum % 2 === 1,
    triple,
  };
}

/** Ô `bet` có ăn với kết quả `o` không. */
export const taiXiuWins = (bet: TaiXiuBet, o: TaiXiuOutcome): boolean => (bet === 'bo_ba' ? o.triple : o[bet]);

/** Phía của ván cho bảng cầu (T đỏ / X xanh / bộ ba vàng). */
export function taiXiuSide(dice: readonly number[]): 'tai' | 'xiu' | 'triple' {
  const o = taiXiuOutcome(dice);
  return o.triple ? 'triple' : o.tai ? 'tai' : 'xiu';
}

/**
 * Tổng Công Đức trả lại cho các ô đã đặt (tiền cược đã trừ lúc đặt): ô ăn nhận cược × (1 + lãi), ô thua mất cược.
 * Lợi thế nhà cái (liệt kê 216 kết quả, test ở shared/tests/taixiu.test.ts): Tài/Xỉu/Chẵn/Lẻ 2,78%, Bộ Ba 13,9%.
 */
export function taiXiuReturn(stakes: StakeMap, dice: readonly number[]): number {
  const o = taiXiuOutcome(dice);
  let back = 0;
  for (const bet of TAIXIU_BETS) {
    const s = stakes[bet] ?? 0;
    if (s > 0 && taiXiuWins(bet, o)) back += s * (1 + TAIXIU.payout[bet]);
  }
  return back;
}

/** Một ván trên bảng cầu. */
export interface TaiXiuRound {
  dice: number[];
  sum: number;
}

/** Trạng thái công khai của bàn Tài Xỉu (server phát qua actState). */
export interface TaiXiuPublicState {
  phase: CasinoPhase;
  /** Giờ server kết thúc pha hiện tại (0 khi bàn nghỉ). */
  endsAt: number;
  round: number;
  /** 3 xúc xắc của ván vừa mở bát — rỗng khi đang đặt / đang lắc (server chỉ gieo lúc mở bát). */
  dice: number[];
  /** Cược từng người ván này; pha kết quả giữ bản chụp lúc chốt để bảng còn hiện. */
  bets: Record<string, StakeMap>;
  names: Record<string, string>;
  /** Bảng cầu: các ván gần nhất, cũ → mới, tối đa TAIXIU.history. */
  history: TaiXiuRound[];
  /** Kết quả chốt ván của từng người có cược (pha 'result'). */
  results: CasinoSettleLine[];
}
