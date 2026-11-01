// Bài Cào 3 lá (Sòng Công Đức) — luật thuần dùng chung client/server: nút, Ba Tiên, so bài với nhà cái, tiền trả lại theo
// khối BAICAO, mốc lật bài (bảng + 3D cùng canh theo giờ server) và trạng thái công khai của bàn.
// Nút = tổng điểm 3 lá (Át 1, 2–9 theo số, 10/J/Q/K = 10) mod 10; Ba Tiên (3 lá J/Q/K — lá 10 không tính) cao nhất.
// So: Ba Tiên > 9 > … > 0. Bằng nút so lá lớn nhất (K > Q > J > 10 > … > Át); vẫn bằng → nhà cái thắng.
// Thêm 1 luật (chốt 2026-11-01): **bù gặp bù** (cùng 0 nút) → nhà cái ăn luôn, không so lá. Đúng luật spec thì nhà cái chỉ
// lợi 0,077% (dưới khoảng [0,5%; 4%]); có luật bù là 0,933% — cách lệch spec ít nhất (số liệu đủ ở chú thích khối BAICAO).
import { BAICAO } from '../config/balance';
import type { Card } from './cards';
import type { CasinoPhase, CasinoSettleLine } from './casino';

/** Kết quả của khách so với nhà cái (không có hòa — bằng hẳn thì nhà cái ăn). */
export type BaiCaoVerdict = 'win' | 'lose';

/** Điểm so bài của Ba Tiên — trên mọi nút 0..9. */
export const BA_TIEN = 10;

/** Điểm 1 lá khi cộng nút: Át 1, 2–9 theo số, 10/J/Q/K = 10. */
export const baiCaoCardPoint = (c: Card): number => Math.min(10, c.r);

/** Ba Tiên: đủ 3 lá và cả 3 đều là lá Tiên J/Q/K. */
export const isBaTien = (cards: readonly Card[]): boolean => cards.length === 3 && cards.every((c) => c.r >= 11);

/** Điểm so bài: 0..9 = nút (tổng mod 10), BA_TIEN = Ba Tiên. */
export function baiCaoScore(cards: readonly Card[]): number {
  if (isBaTien(cards)) return BA_TIEN;
  let sum = 0;
  for (const c of cards) sum += baiCaoCardPoint(c);
  return sum % 10;
}

/** Hạng lá lớn nhất (1 = Át nhỏ nhất … 13 = K) — phá hòa khi bằng nút. */
export function baiCaoTop(cards: readonly Card[]): number {
  let top = 0;
  for (const c of cards) if (c.r > top) top = c.r;
  return top;
}

/** So tay khách với nhà cái: hơn điểm thắng; bằng điểm mà cùng bù (0 nút) thì nhà cái ăn; còn lại so lá lớn nhất. */
export function compareBaiCao(player: readonly Card[], dealer: readonly Card[]): BaiCaoVerdict {
  const a = baiCaoScore(player);
  const b = baiCaoScore(dealer);
  if (a !== b) return a > b ? 'win' : 'lose';
  if (a === 0) return 'lose';
  return baiCaoTop(player) > baiCaoTop(dealer) ? 'win' : 'lose';
}

/** Tổng trả lại cho cược `stake` (đã trừ lúc đặt): thắng cược × (1 + lãi) — lãi Ba Tiên nếu tay thắng là Ba Tiên; thua 0. */
export function baiCaoPayout(stake: number, verdict: BaiCaoVerdict, player: readonly Card[]): number {
  if (verdict === 'lose') return 0;
  return stake * (1 + (isBaTien(player) ? BAICAO.payout.ba_tien : BAICAO.payout.win));
}

/** Trả lại khi so tay khách với tay nhà cái. */
export const baiCaoReturn = (stake: number, player: readonly Card[], dealer: readonly Card[]): number =>
  baiCaoPayout(stake, compareBaiCao(player, dealer), player);

/** Nhãn tay bài cho bảng / chat, vd "Ba Tiên", "9 nút", "Bù (0 nút)"; rỗng khi chưa có bài. */
export function baiCaoLabel(cards: readonly Card[]): string {
  if (cards.length === 0) return '';
  const s = baiCaoScore(cards);
  if (s === BA_TIEN) return 'Ba Tiên';
  return s === 0 ? 'Bù (0 nút)' : `${s} nút`;
}

// ───────────────────────── Mốc chia / lật ─────────────────────────

/** Số đợt lật: đợt k ngửa lá thứ k của mọi tay + nhà cái. */
export const BAICAO_FLIPS = 3;

/** Giờ server lật đợt k (0..2) của ván chia lúc `dealAt`: sau BAICAO.dealFlyMs bay bài, các đợt cách đều phần còn lại. */
export const baiCaoFlipAt = (dealAt: number, k: number): number =>
  dealAt + BAICAO.dealFlyMs + (k * (BAICAO.revealMs - BAICAO.dealFlyMs)) / BAICAO_FLIPS;

/** Số lá đã ngửa của mỗi tay lúc giờ server `now`: 0 khi chưa chia, đủ 3 từ pha kết quả. */
export function baiCaoShown(st: { phase: CasinoPhase; dealAt: number }, now: number): number {
  if (st.phase === 'result') return BAICAO_FLIPS;
  if (st.phase !== 'resolving' || st.dealAt <= 0) return 0;
  let n = 0;
  while (n < BAICAO_FLIPS && now >= baiCaoFlipAt(st.dealAt, n)) n++;
  return n;
}

// ───────────────────────── Trạng thái công khai ─────────────────────────

export interface BaiCaoHand {
  /** Thứ tự tay theo lần đặt cược đầu tiên (1..n); tay 1..BAICAO.seats3d có chỗ bài 3D `baicao_seat:<seat>`. */
  seat: number;
  pid: string;
  name: string;
  /** 3 lá (rỗng lúc đặt cược). Gửi đủ mặt từ lúc chia — bảng + 3D tự úp tới mốc baiCaoFlipAt. */
  cards: Card[];
  stake: number;
  /** Điểm so bài (0..9 nút, BA_TIEN) — −1 khi chưa chia. */
  score: number;
  /** Kết quả so với nhà cái (có từ pha 'result'). */
  result?: BaiCaoVerdict;
}

/** Trạng thái công khai của bàn Bài Cào (server phát qua actState). */
export interface BaiCaoPublicState {
  phase: CasinoPhase;
  /** Giờ server kết thúc pha hiện tại (0 khi bàn nghỉ). */
  endsAt: number;
  round: number;
  /** Giờ server bắt đầu chia (0 khi chưa chia): lá bay trong BAICAO.dealFlyMs, lật đợt k lúc baiCaoFlipAt(dealAt, k). */
  dealAt: number;
  /** Giờ server lật đợt đầu (= baiCaoFlipAt(dealAt, 0); 0 khi chưa chia). */
  revealAt: number;
  /** Mọi tay có cược, theo thứ tự đặt (không giới hạn số người). */
  hands: BaiCaoHand[];
  /** 3 lá nhà cái (rỗng khi chưa chia). */
  dealer: Card[];
  /** Kết quả chốt ván của từng người có cược (pha 'result'). */
  results: CasinoSettleLine[];
}
