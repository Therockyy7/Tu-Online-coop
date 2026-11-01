// Nổ Hũ (Sòng Công Đức) — luật thuần dùng chung client/server: 3 cuộn × 1 đường thắng, dải cuộn 32 ô dựng tất định từ
// NOHU.reelCounts, bảng trả × mức cược theo khối NOHU (3 hũ = nổ hũ: ăn phần Hũ Công Đức của phòng theo tỉ lệ mức cược —
// cược tối đa ăn trọn hũ). Server quyết ô dừng bằng ctx.rng (mỗi ô đồng khả năng); client chỉ vẽ cuộn quay rồi dừng đúng ô.
import { NOHU, NOHU_SYMBOLS, type NoHuSymbol } from '../config/balance';

/** Số ô mỗi cuộn. */
export const NOHU_STRIP_LEN = 32;

/** Tên hiển thị của biểu tượng (bảng, tin chat). */
export const NOHU_NAMES: Record<NoHuSymbol, string> = {
  bia: 'Bia',
  dao: 'Đào Tiên',
  sen: 'Hoa Sen',
  chuong: 'Chuông',
  vang: 'Nén Vàng',
  that: 'Số 7',
  hu: 'Hũ',
};

/**
 * Dải 1 cuộn từ số ô mỗi biểu tượng: round-robin có trọng số (mỗi bước cộng "tín dụng" bằng số ô của từng biểu tượng,
 * chọn biểu tượng nhiều tín dụng nhất — hòa thì theo thứ tự NOHU_SYMBOLS — rồi trừ tổng số ô) cho các ô cùng loại rải
 * đều quanh cuộn; sau đó đổi chỗ cho hết cảnh 2 ô giống nhau liền nhau (kể cả nối vòng ô cuối → ô đầu). `rotate` = cuộn
 * bắt đầu từ ô thứ mấy (để các cuộn cùng số ô trông khác nhau). Tất định: cùng đầu vào luôn ra cùng dải.
 */
export function buildNoHuStrip(counts: Readonly<Record<NoHuSymbol, number>>, rotate = 0): NoHuSymbol[] {
  const total = NOHU_SYMBOLS.reduce((a, s) => a + counts[s], 0);
  const credit = new Map<NoHuSymbol, number>(NOHU_SYMBOLS.map((s) => [s, 0]));
  const out: NoHuSymbol[] = [];
  for (let i = 0; i < total; i++) {
    let best: NoHuSymbol = NOHU_SYMBOLS[0];
    for (const s of NOHU_SYMBOLS) {
      credit.set(s, credit.get(s)! + counts[s]);
      if (credit.get(s)! > credit.get(best)!) best = s;
    }
    credit.set(best, credit.get(best)! - total);
    out.push(best);
  }
  const n = out.length;
  const same = (i: number) => out[(i + n) % n] === out[(i + 1) % n];
  const swap = (a: number, b: number) => {
    const t = out[a]!;
    out[a] = out[b]!;
    out[b] = t;
  };
  for (let i = 0; i < n; i++) {
    if (!same(i)) continue;
    // Ô kế bị trùng → tìm ô xa hơn đổi chỗ mà không sinh cặp trùng mới ở cả hai chỗ.
    const a = (i + 1) % n;
    for (let k = 2; k < n; k++) {
      const j = (i + k) % n;
      swap(a, j);
      if (!same(a - 1) && !same(a) && !same(j - 1) && !same(j)) break;
      swap(a, j);
    }
  }
  return out.map((_, i) => out[(((i + rotate) % n) + n) % n]!);
}

/** Dải 3 cuộn (ô 0..31); cuộn k bắt đầu lệch 7k ô. */
export const NOHU_STRIPS: readonly (readonly NoHuSymbol[])[] = NOHU.reelCounts.map((c, k) => buildNoHuStrip(c, k * 7));

/** Biểu tượng nằm trên đường thắng khi 3 cuộn dừng ở `stops` (chỉ số quay vòng theo độ dài dải). */
export function noHuSymbolsAt(stops: readonly number[]): [NoHuSymbol, NoHuSymbol, NoHuSymbol] {
  const at = (k: number) => {
    const strip = NOHU_STRIPS[k]!;
    const i = stops[k] ?? 0;
    return strip[((i % strip.length) + strip.length) % strip.length]!;
  };
  return [at(0), at(1), at(2)];
}

/**
 * Hệ số trả của đường thắng (× mức cược, đã gồm tiền cược; 0 = trượt): 3 hũ = 'jackpot' (nổ hũ, xem noHuJackpotPay); 3 giống
 * nhau theo NOHU.paytable; đúng 2 hũ ×twoHu; 3 "quả" (bia / đào / sen) lẫn nhau ×mixedFruit. 1 hũ + đôi bất kỳ không ăn.
 */
export function noHuPayout(s: readonly NoHuSymbol[]): number | 'jackpot' {
  if (s.length !== 3) return 0;
  const a = s[0]!;
  if (a === s[1] && a === s[2]) return a === 'hu' ? 'jackpot' : NOHU.paytable[a];
  if (s.filter((x) => x === 'hu').length === 2) return NOHU.twoHu;
  if (s.every((x) => NOHU.fruits.includes(x))) return NOHU.mixedFruit;
  return 0;
}

/** Hũ Công Đức giữ theo phần nghìn Công Đức (số nguyên) để cộng dồn phần lẻ của các lần góp mà không trôi số thực. */
export const NOHU_FUND_SCALE = 1000;

/**
 * Phần Hũ Công Đức người nổ hũ được ăn: mức cược / mức cược tối đa (1 → 5%, 5 → 25%, 10 → 50%, 20 → trọn hũ) — người cược
 * nhỏ không hớt được hũ do người cược lớn nuôi, nên mọi mức cược có cùng tỉ lệ trả lại dài hạn.
 */
export function noHuJackpotShare(bet: number): number {
  return bet / NOHU.bets[NOHU.bets.length - 1]!;
}

/**
 * Nổ hũ với quỹ `fund` (phần nghìn Công Đức, NOHU_FUND_SCALE) và mức cược `bet`: trả phần nguyên của quỹ ×
 * noHuJackpotShare(bet); phần còn lại (cả phần lẻ) ở lại hũ, còn dưới NOHU.jackpotSeed thì nhà cái bù lên mức gốc (giữ
 * phần lẻ). Cược tối đa = ăn trọn hũ, hũ về mức gốc như trước. `amount` = Công Đức trả, `fund` = quỹ sau khi nổ.
 */
export function noHuJackpotPay(fund: number, bet: number): { amount: number; fund: number } {
  const amount = Math.floor((fund * bet) / (NOHU.bets[NOHU.bets.length - 1]! * NOHU_FUND_SCALE));
  let rest = fund - amount * NOHU_FUND_SCALE;
  const whole = Math.floor(rest / NOHU_FUND_SCALE);
  if (whole < NOHU.jackpotSeed) rest += (NOHU.jackpotSeed - whole) * NOHU_FUND_SCALE;
  return { amount, fund: rest };
}

/** Nhãn đường thắng, vd "3 Số 7 ×80", "3 quả lẫn ×2", "2 Hũ ×3", "NỔ HŨ"; trượt = ''. */
export function noHuLineLabel(s: readonly NoHuSymbol[]): string {
  const p = noHuPayout(s);
  if (p === 'jackpot') return 'NỔ HŨ';
  if (p === 0) return '';
  const a = s[0]!;
  if (a === s[1] && a === s[2]) return `3 ${NOHU_NAMES[a]} ×${p}`;
  if (p === NOHU.twoHu && s.filter((x) => x === 'hu').length === 2) return `2 ${NOHU_NAMES.hu} ×${p}`;
  return `3 quả lẫn ×${p}`;
}

export interface NoHuStats {
  /** Số tổ hợp ô dừng (32³). */
  combos: number;
  /** Tổng hệ số trả của mọi tổ hợp (chưa tính nổ hũ). */
  returned: number;
  /** Trả lại chưa tính hũ = returned / combos. */
  rtp: number;
  /** Số tổ hợp có trả (kể cả nổ hũ). */
  hits: number;
  hitRate: number;
  /** Số tổ hợp nổ hũ. */
  jackpots: number;
}

/** Liệt kê đủ mọi tổ hợp ô dừng của 3 dải (mỗi ô đồng khả năng): trả lại, tần suất trúng, tần suất nổ hũ. */
export function noHuRtp(): NoHuStats {
  const [r0, r1, r2] = NOHU_STRIPS as [readonly NoHuSymbol[], readonly NoHuSymbol[], readonly NoHuSymbol[]];
  let returned = 0;
  let hits = 0;
  let jackpots = 0;
  for (const a of r0)
    for (const b of r1)
      for (const c of r2) {
        const p = noHuPayout([a, b, c]);
        if (p === 'jackpot') {
          jackpots++;
          hits++;
        } else if (p > 0) {
          returned += p;
          hits++;
        }
      }
  const combos = r0.length * r1.length * r2.length;
  return { combos, returned, rtp: returned / combos, hits, hitRate: hits / combos, jackpots };
}

// ── Trạng thái công khai (server phát qua actState) ──

/** Một lượt quay: server quyết ô dừng ngay lúc quay; cuộn 3 dừng ở stopAt thì trả thưởng. */
export interface NoHuSpin {
  /** Người quay (giữ lại kể cả khi đã rời máy trước lúc cuộn dừng). */
  pid: string;
  name: string;
  /** Ô dừng trên NOHU_STRIPS[k] của 3 cuộn (ô nằm trên đường thắng). */
  stops: [number, number, number];
  symbols: [NoHuSymbol, NoHuSymbol, NoHuSymbol];
  bet: number;
  /** Giờ server bắt đầu quay; cuộn k dừng ở startAt + NOHU.reelStopMs[k]; stopAt = cuộn 3 dừng. */
  startAt: number;
  stopAt: number;
  /** Tiền trả (gồm cả cược) theo bảng trả; nổ hũ: 0 tới lúc cuộn 3 dừng (quỹ chốt lúc đó) rồi mới là số đã trả. */
  win: number;
  jackpot: boolean;
  /** Đã chốt (đã trả thưởng, hoặc người quay rời phòng trước lúc cuộn dừng nên không trả). */
  done: boolean;
}

export interface NoHuMachine {
  /** Số máy 1..NOHU.machines (trạm slot_machine_N). */
  id: number;
  /** Người đang ngồi máy (null = máy trống). */
  pid: string | null;
  name: string | null;
  /** Lượt gần nhất của máy (giữ sau khi dừng để cuộn đứng đúng ô); null = chưa quay lần nào. */
  spin: NoHuSpin | null;
}

export interface NoHuJackpotWin {
  name: string;
  amount: number;
  /** Giờ server lúc nổ (cuộn 3 dừng). */
  at: number;
  machine: number;
}

/** Trạng thái công khai của dãy máy Nổ Hũ + Hũ Công Đức (thuộc phòng). */
export interface NoHuPublicState {
  /** Hũ Công Đức hiện tại (phần nguyên; phần lẻ của các lần góp server giữ, không làm tròn mất). */
  jackpot: number;
  machines: NoHuMachine[];
  lastJackpot: NoHuJackpotWin | null;
}
