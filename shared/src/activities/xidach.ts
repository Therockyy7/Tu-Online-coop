// Xì Dách (luật Việt, Sòng Công Đức) — luật thuần dùng chung client/server: điểm theo luật Át, hạng, so bài với nhà cái,
// tiền trả lại theo khối XIDACH, lượt người chơi và cách nhà cái "xét dần".
// Điểm: 2–10 theo số, J/Q/K = 10; Át 2 lá = 11/10/1, 3 lá = 10/1, ≥ 4 lá = 1 (lấy tổng tốt nhất ≤ 21).
// Hạng: Xì Bàng (2 Át) > Xì Dách (Át + 10/J/Q/K) > Ngũ Linh (5 lá ≤ 21) > Thường; > 21 là Quắc.
import { XIDACH } from '../config/balance';
import type { Card } from './cards';
import type { CasinoPhase, CasinoSettleLine } from './casino';

export type XiDachRank = 'xi_bang' | 'xi_dach' | 'ngu_linh' | 'thuong' | 'quac';
/** Kết quả của người chơi so với nhà cái. */
export type XiDachVerdict = 'win' | 'push' | 'lose';

export const XIDACH_RANK_LABELS: Record<XiDachRank, string> = {
  xi_bang: 'Xì Bàng',
  xi_dach: 'Xì Dách',
  ngu_linh: 'Ngũ Linh',
  thuong: 'Thường',
  quac: 'Quắc',
};

/** Thứ bậc hạng (lớn hơn = mạnh hơn); Quắc xử lý riêng trong compareXiDach. */
const RANK_ORDER: Record<XiDachRank, number> = { quac: 0, thuong: 1, ngu_linh: 2, xi_dach: 3, xi_bang: 4 };

/** Giá trị Át theo số lá trên tay (giảm dần — phần tử cuối là giá trị nhỏ nhất). */
const ACE_2 = [11, 10, 1] as const;
const ACE_3 = [10, 1] as const;
const ACE_4 = [1] as const;

/** Tổng tốt nhất ≤ 21 khi `aces` lá Át lần lượt chọn giá trị trong `values` (−1 nếu cách nào cũng vượt 21). */
function bestAces(base: number, aces: number, values: readonly number[], from: number): number {
  if (aces === 0) return base <= 21 ? base : -1;
  let best = -1;
  for (let i = from; i < values.length; i++) best = Math.max(best, bestAces(base + values[i]!, aces - 1, values, i));
  return best;
}

/** Điểm tay bài; quá 21 thì trả tổng nhỏ nhất có thể (> 21 = Quắc). */
export function xiDachPoints(cards: readonly Card[]): number {
  let base = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 1) aces++;
    else base += Math.min(10, c.r);
  }
  if (aces === 0) return base;
  const values = cards.length <= 2 ? ACE_2 : cards.length === 3 ? ACE_3 : ACE_4;
  const best = bestAces(base, aces, values, 0);
  return best >= 0 ? best : base + aces * values[values.length - 1]!;
}

export function xiDachRank(cards: readonly Card[]): XiDachRank {
  if (cards.length === 2) {
    const aces = (cards[0]!.r === 1 ? 1 : 0) + (cards[1]!.r === 1 ? 1 : 0);
    if (aces === 2) return 'xi_bang';
    if (aces === 1 && (cards[0]!.r >= 10 || cards[1]!.r >= 10)) return 'xi_dach';
  }
  const p = xiDachPoints(cards);
  if (p > 21) return 'quac';
  if (cards.length >= XIDACH.maxCards) return 'ngu_linh';
  return 'thuong';
}

/** Xì Bàng / Xì Dách (2 lá đầu) — nhà cái có thì lật ngay lúc chia và kết thúc ván. */
export const isXiDachSpecial = (cards: readonly Card[]): boolean => {
  const r = xiDachRank(cards);
  return r === 'xi_bang' || r === 'xi_dach';
};

/**
 * So tay người chơi với nhà cái: hơn hạng thắng; cùng hạng đặc biệt hòa; cùng Thường so điểm, bằng điểm hòa; người Quắc
 * thua trừ khi nhà cái cũng Quắc (hòa); nhà cái Quắc thì người không Quắc thắng.
 */
export function compareXiDach(player: readonly Card[], dealer: readonly Card[]): XiDachVerdict {
  const rp = xiDachRank(player);
  const rd = xiDachRank(dealer);
  if (rp === 'quac') return rd === 'quac' ? 'push' : 'lose';
  if (rd === 'quac') return 'win';
  if (rp !== rd) return RANK_ORDER[rp] > RANK_ORDER[rd] ? 'win' : 'lose';
  if (rp !== 'thuong') return 'push';
  const a = xiDachPoints(player);
  const b = xiDachPoints(dealer);
  return a === b ? 'push' : a > b ? 'win' : 'lose';
}

/** Tổng trả lại cho cược `stake` (đã trừ lúc đặt) theo kết quả + hạng tay thắng: thắng cược × (1 + lãi), hòa hoàn, thua 0. */
export function xiDachPayout(stake: number, verdict: XiDachVerdict, rank: XiDachRank): number {
  if (verdict === 'lose') return 0;
  if (verdict === 'push') return stake;
  const key = rank === 'xi_bang' || rank === 'xi_dach' || rank === 'ngu_linh' ? rank : 'win';
  return stake * (1 + XIDACH.payout[key]);
}

/** Trả lại khi so thẳng tay người chơi với tay cuối của nhà cái (không qua xét dần). */
export const xiDachReturn = (stake: number, player: readonly Card[], dealer: readonly Card[]): number =>
  xiDachPayout(stake, compareXiDach(player, dealer), xiDachRank(player));

/** Người chơi được dằn: đủ XIDACH.playerMinStand điểm (hoặc đã đủ 5 lá). */
export const xiDachCanStand = (cards: readonly Card[]): boolean =>
  cards.length >= XIDACH.maxCards || xiDachPoints(cards) >= XIDACH.playerMinStand;

/** Tự dừng: 21 điểm (gồm Xì Bàng / Xì Dách), Quắc, hoặc đủ 5 lá. */
export const xiDachAutoStop = (cards: readonly Card[]): boolean => cards.length >= XIDACH.maxCards || xiDachPoints(cards) >= 21;

/** Tự chơi khi hết giờ: rút tới đủ tuổi (hoặc tự dừng) rồi dằn. `cards` bị sửa tại chỗ. */
export function autoPlayXiDach(cards: Card[], draw: () => Card): void {
  while (!xiDachAutoStop(cards) && !xiDachCanStand(cards)) cards.push(draw());
}

/** Nhãn tay bài cho bảng / chat, vd "Xì Dách", "Ngũ Linh (20)", "Quắc (25)", "18 điểm". */
export function xiDachHandLabel(cards: readonly Card[]): string {
  if (cards.length === 0) return '';
  const r = xiDachRank(cards);
  const p = xiDachPoints(cards);
  if (r === 'xi_bang' || r === 'xi_dach') return XIDACH_RANK_LABELS[r];
  if (r === 'ngu_linh' || r === 'quac') return `${XIDACH_RANK_LABELS[r]} (${p})`;
  return `${p} điểm`;
}

/** Tay đuổi được: nhà cái rút thêm còn có thể vượt / hòa (Thường, Ngũ Linh); Xì Bàng / Xì Dách thì chịu thua. */
const CHASABLE: ReadonlySet<XiDachRank> = new Set<XiDachRank>(['thuong', 'ngu_linh']);

export interface XiDachDealerMove {
  /** Chỉ số các tay chốt kết quả ngay lúc này (so với tay hiện tại của nhà cái). */
  settle: number[];
  /** Nhà cái rút thêm 1 lá rồi tính bước kế. */
  draw: boolean;
}

/**
 * Bước kế của nhà cái ("xét dần" — nhà cái Việt được xét bài khi đủ tuổi). `open` = chỉ số các tay chưa chốt.
 * - Dưới XIDACH.dealerStandAt (chưa Quắc, chưa 5 lá): rút, chưa xét ai.
 * - Quắc hoặc đủ 5 lá: xét hết các tay còn lại, dừng.
 * - Đủ tuổi: chốt mọi tay thua / hòa nhà cái (kể cả người Quắc — nhà cái lúc đó chưa Quắc nên người Quắc thua); còn tay
 *   hơn điểm mà đuổi được thì rút tiếp (rút thêm không hại gì: tay còn lại đang thắng, nhà cái Quắc thì họ vẫn thắng),
 *   không còn thì xét hết rồi dừng.
 * Lý do có bước xét dần: nếu nhà cái rút tới 16 rồi dừng hẳn thì hai bên đối xứng (cùng rút tới 16, người Quắc + cái Quắc
 * hòa) mà lãi đặc biệt chỉ người chơi được hưởng → nhà cái lỗ ≈ 6,9%. Xét dần (cùng Ngũ Linh lãi ×1 — xem khối XIDACH)
 * đưa lợi thế nhà cái về ≈ 3,9% với người rút tới 16 và ≈ 1,3% với người chơi tối ưu (mô phỏng + tính chính xác ở
 * shared/tests/xidach.test.ts), giữ nguyên bảng so + ngưỡng 16 của thiết kế.
 */
export function xiDachDealerStep(dealer: readonly Card[], hands: readonly (readonly Card[])[], open: readonly number[]): XiDachDealerMove {
  if (open.length === 0) return { settle: [], draw: false };
  const busted = xiDachRank(dealer) === 'quac';
  const full = dealer.length >= XIDACH.maxCards;
  if (!busted && !full && xiDachPoints(dealer) < XIDACH.dealerStandAt) return { settle: [], draw: true };
  if (busted || full) return { settle: [...open], draw: false };
  const settle: number[] = [];
  let chase = false;
  for (const i of open) {
    const hand = hands[i]!;
    if (compareXiDach(hand, dealer) !== 'win') settle.push(i);
    else if (CHASABLE.has(xiDachRank(hand))) chase = true;
  }
  return chase ? { settle, draw: true } : { settle: [...open], draw: false };
}

/**
 * Chạy trọn lượt nhà cái (đồng bộ): rút bằng `draw` (sửa `dealer` tại chỗ) theo xiDachDealerStep, trả kết quả từng tay
 * — mỗi tay so với tay nhà cái **lúc bị xét**. Server chạy từng bước có nhịp; hàm này dùng cho mô phỏng + kiểm thử.
 */
export function playXiDachDealer(dealer: Card[], hands: readonly (readonly Card[])[], draw: () => Card): XiDachVerdict[] {
  const out: XiDachVerdict[] = hands.map(() => 'push');
  let open = hands.map((_, i) => i);
  for (;;) {
    const move = xiDachDealerStep(dealer, hands, open);
    for (const i of move.settle) out[i] = compareXiDach(hands[i]!, dealer);
    if (move.settle.length) open = open.filter((i) => !move.settle.includes(i));
    if (!move.draw) return out;
    dealer.push(draw());
  }
}

// ───────────────────────── Trạng thái công khai ─────────────────────────

/** Bước trong pha 'resolving': chia bài → cả bàn rút/dằn cùng lúc → nhà cái lật + rút + xét. */
export type XiDachStep = 'deal' | 'turn' | 'dealer';

export interface XiDachSeat {
  /** Số ghế 1..XIDACH.seats theo thứ tự đặt cược (neo 3D `xidach_seat:<seat>`). */
  seat: number;
  pid: string;
  name: string;
  /** Lá trên tay (ngửa cho cả bàn — mỗi người chỉ đấu với nhà cái). */
  cards: Card[];
  stake: number;
  /** Đã dằn / tự dừng (21, Quắc, 5 lá) / hết giờ tự chơi. */
  done: boolean;
  /** Kết quả khi nhà cái xét tới ghế này. */
  result?: XiDachVerdict;
}

export interface XiDachDealerView {
  /** Lá nhà cái theo thứ tự chia; lá tẩy (lá thứ 2) = null tới khi lật. */
  cards: (Card | null)[];
  revealed: boolean;
}

/** Trạng thái công khai của bàn Xì Dách (server phát qua actState). */
export interface XiDachPublicState {
  phase: CasinoPhase;
  /** Bước của pha 'resolving' (null ở các pha khác). */
  step: XiDachStep | null;
  /** Giờ server kết thúc pha / bước hiện tại (0 khi bàn nghỉ; bước nhà cái = mốc lá kế). */
  endsAt: number;
  round: number;
  /** Giờ server bắt đầu chia: lá thứ i bay lúc dealAt + i·XIDACH.dealMs / tổng số lá (người vào giữa ván thấy đúng cảnh). */
  dealAt: number;
  /** Ghế ván này: lúc đặt cược = người đã cược (chưa có bài); từ lúc chia = cố định. */
  seats: XiDachSeat[];
  dealer: XiDachDealerView;
  /** Hết giờ rút/dằn (0 khi chưa tới lượt). */
  turnEndsAt: number;
  /** Kết quả chốt ván của từng người có cược (pha 'result'). */
  results: CasinoSettleLine[];
}
