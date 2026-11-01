// Đua Ngựa (Sòng Công Đức) — luật thuần dùng chung client/server: 6 ngựa, phong độ ngẫu nhiên mỗi ván → xác suất về nhất
// p_i → tỉ lệ trả o_i = (1 − margin)/p_i làm tròn xuống 0,1 (khối DUANGUA). Cược "về nhất" một hay nhiều ngựa (ô
// 'horse_<i>'); thắng nhận floor(cược × o_i). Server bốc thứ tự về đích theo p rồi sinh kịch bản đua (tiến độ 0..1 tại
// DUANGUA.keyframes mốc + giờ về đích từng ngựa) → client nội suy bằng raceProgressAt nên mọi máy thấy cùng một cuộc đua.
import { DUANGUA } from '../config/balance';
import type { Rng } from '../util/rng';
import type { CasinoPhase, CasinoSettleLine, StakeMap } from './casino';

export interface Horse {
  name: string;
  /** Màu áo nài = màu nhận diện ngựa trên bảng cược / bảng LED. */
  color: string;
  /** Màu lông (mô hình 3D). */
  coat: string;
  /** Màu bờm + đuôi. */
  mane: string;
}

export const HORSES: readonly Horse[] = [
  { name: 'Xích Thố', color: '#d8342a', coat: '#9c2a1c', mane: '#3a120c' },
  { name: 'Bạch Long Mã', color: '#f4f1e6', coat: '#eeeae0', mane: '#d9d4c6' },
  { name: 'Ô Truy', color: '#2b2b33', coat: '#1d1c21', mane: '#0c0b0e' },
  { name: 'Đích Lư', color: '#8a5a2b', coat: '#7a4a22', mane: '#2e1a0c' },
  { name: 'Tuyệt Ảnh', color: '#aab6c2', coat: '#9aa3ad', mane: '#e8ecf0' },
  { name: 'Ngựa Sắt Gióng', color: '#c07a3a', coat: '#8c5a2e', mane: '#e07a2a' },
];

/** Khóa ô cược của ngựa i trong StakeBook / trạng thái công khai. */
export const horseKey = (i: number): string => `horse_${i}`;

/** Tỉ lệ dạng "×2,3" (dấu phẩy thập phân). */
export const oddsLabel = (o: number): string => `×${o.toFixed(1).replace('.', ',')}`;

export interface RaceOdds {
  /** Xác suất về nhất từng ngựa (tổng 1). */
  probs: number[];
  /** Tỉ lệ trả từng ngựa (× tiền cược, đã gồm tiền cược). */
  odds: number[];
}

/** Tỉ lệ trả của ngựa có xác suất về nhất p: sàn 0,1 của (1 − margin)/p, không dưới minOdds. */
export function oddsFor(p: number): number {
  return Math.max(DUANGUA.minOdds, Math.floor(((1 - DUANGUA.margin) / p) * 10 + 1e-9) / 10);
}

/** Chuẩn hóa trọng số thành xác suất tổng 1, mỗi cái kẹp trong [lo, hi]: p_i = clamp(λ·w_i), tìm λ bằng chia đôi. */
function boundedShares(w: readonly number[], lo: number, hi: number): number[] {
  const at = (l: number) => w.reduce((s, x) => s + Math.min(hi, Math.max(lo, l * x)), 0);
  let a = 0;
  let b = 1;
  while (at(b) < 1) b *= 2;
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    if (at(m) < 1) a = m;
    else b = m;
  }
  return w.map((x) => Math.min(hi, Math.max(lo, b * x)));
}

/** Phong độ ván mới → xác suất về nhất (kẹp [minWinProb, maxWinProb]) + tỉ lệ trả. */
export function raceOdds(rng: Rng): RaceOdds {
  const w = Array.from({ length: DUANGUA.horses }, () => Math.exp(rng.range(-DUANGUA.formSpread, DUANGUA.formSpread)));
  const probs = boundedShares(w, DUANGUA.minWinProb, DUANGUA.maxWinProb);
  return { probs, odds: probs.map(oddsFor) };
}

/** Thứ tự về đích (ngựa nhất → bét): bốc lần lượt theo xác suất trong số ngựa còn lại (ngựa nhất đúng theo p). */
export function raceFinishOrder(rng: Rng, probs: readonly number[]): number[] {
  const left = probs.map((_, i) => i);
  const order: number[] = [];
  while (left.length) {
    let r = rng.next() * left.reduce((s, i) => s + Math.max(0, probs[i]!), 0);
    let k = 0;
    for (; k < left.length - 1; k++) {
      r -= Math.max(0, probs[left[k]!]!);
      if (r < 0) break;
    }
    order.push(left.splice(k, 1)[0]!);
  }
  return order;
}

/** Kịch bản 1 cuộc đua (thuần dữ liệu, gửi trong trạng thái công khai). */
export interface RaceScript {
  /** Thời điểm (ms tính từ xuất phát) từng ngựa chạm đích; ngựa nhất đúng DUANGUA.raceMs. */
  finish: number[];
  /** Tiến độ 0..1 của từng ngựa tại DUANGUA.keyframes mốc cách đều trên [0, raceMs] (mốc đầu = 0, tăng ngặt). */
  curves: number[][];
}

/** Ngựa sau về đích cách ngựa liền trước ít nhất chừng này (ms) để mắt phân biệt được. */
const TRAIL_GAP_MS = 40;
/** Ngựa nhì về sát ngựa nhất: trễ trong 30% đầu khoảng trailMinMs..trailMaxMs. */
const RUNNER_UP_SPAN = 0.3;
/** Nhịp chạy từng đoạn: bước ngẫu nhiên có quán tính (giữ PACE_KEEP phần đà cũ ± PACE_JITTER), sàn PACE_MIN. */
const PACE_KEEP = 0.6;
const PACE_JITTER = 0.3;
const PACE_MIN = 0.4;
/** Đoạn đầu (ra khỏi cổng) chạy chậm hơn — tăng tốc từ chỗ đứng yên. */
const START_PACE = 0.55;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Sinh kịch bản cho thứ tự về đích `order` (ngựa nhất → bét): giờ về đích (ngựa nhất đúng raceMs, các ngựa sau trễ
 * trailMinMs..trailMaxMs, tăng ngặt) + đường tiến độ. Mỗi ngựa có nhịp từng đoạn ngẫu nhiên rồi được co giãn sao cho
 * chạy tiếp với nhịp đoạn cuối thì chạm đích đúng giờ về của nó → giữa đường thứ hạng đổi qua lại nhưng về đích đúng
 * thứ tự. Tiến độ làm tròn 4 chữ số (gửi qua mạng gọn); raceProgressAt nội suy đúng trên chính số đã làm tròn.
 */
export function raceScript(rng: Rng, order: readonly number[]): RaceScript {
  const n = order.length;
  const K = DUANGUA.keyframes;
  const T = DUANGUA.raceMs;
  const H = T / (K - 1);
  const finish = new Array<number>(n).fill(T);
  const first = DUANGUA.trailMinMs + rng.next() * (DUANGUA.trailMaxMs - DUANGUA.trailMinMs) * RUNNER_UP_SPAN;
  const room = DUANGUA.trailMaxMs - first - Math.max(0, n - 2) * TRAIL_GAP_MS;
  let late = first;
  for (let k = 1; k < n; k++) {
    if (k > 1) late += TRAIL_GAP_MS + (rng.next() * room) / (n - 2);
    finish[order[k]!] = T + Math.round(late);
  }
  const curves: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pace: number[] = [];
    let drift = 0;
    for (let k = 1; k < K; k++) {
      drift = drift * PACE_KEEP + rng.range(-PACE_JITTER, PACE_JITTER);
      pace.push(Math.max(PACE_MIN, 1 + drift) * (k === 1 ? START_PACE : 1));
    }
    const F = finish[i]!;
    const scale = 1 / (H * pace.reduce((a, b) => a + b, 0) + pace[K - 2]! * (F - T));
    const c = [0];
    let acc = 0;
    for (let k = 0; k < K - 1; k++) {
      acc += pace[k]! * H * scale;
      c.push(round4(acc));
    }
    if (F <= T) c[K - 1] = 1;
    curves.push(c);
  }
  return { finish, curves };
}

/** Ngựa về nhất của kịch bản (giờ về sớm nhất). */
export function raceWinner(s: RaceScript): number {
  let best = 0;
  for (let i = 1; i < s.finish.length; i++) if (s.finish[i]! < s.finish[best]!) best = i;
  return best;
}

/**
 * Tiếp tuyến (đơn vị: tiến độ mỗi đoạn) tại mốc k cho nội suy Hermite đơn điệu: mốc 0 = 0 (xuất phát từ đứng yên),
 * mốc giữa = trung bình điều hòa hai dốc kề (≤ 2 lần dốc nhỏ → không vọt quá mốc), mốc cuối = nhịp chạy tiếp tới đích.
 */
function tangent(c: readonly number[], F: number, k: number): number {
  const K = c.length;
  if (k <= 0) return 0;
  if (k >= K - 1) {
    const d = c[K - 1]! - c[K - 2]!;
    if (F <= DUANGUA.raceMs) return d;
    const ext = ((1 - c[K - 1]!) / (F - DUANGUA.raceMs)) * (DUANGUA.raceMs / (K - 1));
    return Math.min(ext, 2 * d);
  }
  const a = c[k]! - c[k - 1]!;
  const b = c[k + 1]! - c[k]!;
  return a > 0 && b > 0 ? (2 * a * b) / (a + b) : 0;
}

/**
 * Tiến độ 0..1 của ngựa `horse` sau `tMs` ms tính từ xuất phát: trong [0, raceMs] nội suy Hermite đơn điệu qua các mốc;
 * sau raceMs (ngựa chưa về) chạy đều tới đích đúng giờ về; từ giờ về trở đi = 1. Không cấp phát (gọi mỗi khung hình).
 */
export function raceProgressAt(s: RaceScript, horse: number, tMs: number): number {
  const c = s.curves[horse];
  if (!c || c.length < 2 || tMs <= 0) return 0;
  const T = DUANGUA.raceMs;
  const F = s.finish[horse] ?? T;
  if (tMs >= F) return 1;
  const K = c.length;
  if (tMs >= T) {
    const last = c[K - 1]!;
    return Math.min(1, last + ((1 - last) * (tMs - T)) / (F - T));
  }
  const u = (tMs * (K - 1)) / T;
  const k = Math.min(K - 2, Math.floor(u));
  const x = u - k;
  const x2 = x * x;
  const x3 = x2 * x;
  const v =
    (2 * x3 - 3 * x2 + 1) * c[k]! + (x3 - 2 * x2 + x) * tangent(c, F, k) + (-2 * x3 + 3 * x2) * c[k + 1]! + (x3 - x2) * tangent(c, F, k + 1);
  return Math.min(1, Math.max(0, v));
}

const progScratch: number[] = [];

/** Ngựa x xếp trên ngựa y: cùng đã về thì ai về trước xếp trên; chưa thì tiến độ cao hơn; bằng nhau giữ thứ tự làn. */
function ahead(s: RaceScript, x: number, y: number): boolean {
  const px = progScratch[x]!;
  const py = progScratch[y]!;
  if (px >= 1 && py >= 1) return s.finish[x]! < s.finish[y]!;
  return px > py;
}

/** Thứ hạng trực tiếp tại `tMs` (chỉ số ngựa, nhất → bét), ghi vào `out` (mặc định mảng mới). */
export function raceOrderAt(s: RaceScript, tMs: number, out: number[] = []): number[] {
  const n = s.curves.length;
  out.length = n;
  for (let i = 0; i < n; i++) {
    out[i] = i;
    progScratch[i] = raceProgressAt(s, i, tMs);
  }
  for (let a = 1; a < n; a++) {
    const h = out[a]!;
    let b = a - 1;
    while (b >= 0 && ahead(s, h, out[b]!)) {
      out[b + 1] = out[b]!;
      b--;
    }
    out[b + 1] = h;
  }
  return out;
}

/** Tổng Công Đức trả lại (tiền cược đã trừ lúc đặt): chỉ ô ngựa về nhất ăn floor(cược × tỉ lệ), tính bằng phần mười. */
export function raceReturn(stakes: StakeMap, winner: number, odds: readonly number[]): number {
  const s = stakes[horseKey(winner)] ?? 0;
  if (!(s > 0)) return 0;
  return Math.floor((s * Math.round((odds[winner] ?? 0) * 10)) / 10);
}

/** Cuộc đua đang chạy / vừa xong. */
export interface DuaNguaRace extends RaceScript {
  /** Giờ server lúc xuất phát (chuông). */
  startAt: number;
}

/** Một ván trên bảng "ngựa về nhất". */
export interface DuaNguaRound {
  round: number;
  winner: number;
  /** Tỉ lệ trả của ngựa về nhất ván đó. */
  odds: number;
}

/**
 * Trạng thái công khai của đường đua (server phát qua actState). Lúc đặt cược chỉ có tỉ lệ (`race` = null, chưa bốc
 * ngựa thắng). Từ lúc xuất phát `race` mang cả kịch bản (giờ về đích lộ ngựa thắng) — chấp nhận được vì client chỉ hiển
 * thị và sổ đã chốt; để chặn "thấy thua thì rời phòng lấy lại cược", rời hẳn phòng từ lúc này tới lúc trả là mất cược.
 */
export interface DuaNguaPublicState {
  phase: CasinoPhase;
  /** Giờ server kết thúc pha hiện tại (0 khi bàn nghỉ); pha đua = lúc ngựa nhất chạm đích. */
  endsAt: number;
  round: number;
  /** Tỉ lệ trả từng ngựa ván này (rỗng khi bàn nghỉ). */
  odds: number[];
  /** Xác suất về nhất từng ngựa (chỉ để hiển thị). */
  probs: number[];
  /** Cược từng người ván này (ô 'horse_<i>'); pha kết quả giữ bản chụp lúc chốt để bảng còn hiện. */
  bets: Record<string, StakeMap>;
  names: Record<string, string>;
  race: DuaNguaRace | null;
  /** Ngựa về nhất (pha 'result'), null lúc khác. */
  winner: number | null;
  /** Kết quả chốt ván của từng người có cược (pha 'result'). */
  results: CasinoSettleLine[];
  /** Các ván gần nhất, cũ → mới, tối đa DUANGUA.history. */
  history: DuaNguaRound[];
}
