// Luật thuần Nổ Hũ: dải cuộn 32 ô dựng tất định từ NOHU.reelCounts, bảng trả × mức cược, trả lại / tần suất trúng /
// nổ hũ (liệt kê đủ 32³ tổ hợp ô dừng, mỗi ô đồng khả năng). Đổi bảng trả hay số ô thì sửa cả test lẫn chú thích khối NOHU.
import { describe, expect, it } from 'vitest';
import { NOHU, NOHU_SYMBOLS, type NoHuSymbol } from '../src/config/balance';
import {
  NOHU_FUND_SCALE,
  NOHU_NAMES,
  NOHU_STRIPS,
  NOHU_STRIP_LEN,
  buildNoHuStrip,
  noHuJackpotPay,
  noHuJackpotShare,
  noHuLineLabel,
  noHuPayout,
  noHuRtp,
  noHuSymbolsAt,
} from '../src/activities/nohu';
import { createRng } from '../src/util/rng';

describe('Nổ Hũ — dải cuộn', () => {
  it('3 cuộn × 32 ô, đúng số ô mỗi biểu tượng theo NOHU.reelCounts', () => {
    expect(NOHU_STRIP_LEN).toBe(32);
    expect(NOHU_STRIPS).toHaveLength(3);
    NOHU_STRIPS.forEach((strip, k) => {
      expect(strip).toHaveLength(NOHU_STRIP_LEN);
      for (const s of NOHU_SYMBOLS) expect(strip.filter((x) => x === s).length).toBe(NOHU.reelCounts[k]![s]);
    });
  });

  it('xếp xen kẽ: không có 2 ô giống nhau liền nhau (kể cả nối vòng ô cuối → ô đầu)', () => {
    for (const strip of NOHU_STRIPS) {
      for (let i = 0; i < strip.length; i++) expect(strip[i]).not.toBe(strip[(i + 1) % strip.length]);
    }
  });

  it('tất định: dựng lại ra đúng dải cũ; `rotate` chỉ đổi ô bắt đầu', () => {
    const counts = NOHU.reelCounts[0]!;
    const a = buildNoHuStrip(counts);
    expect(buildNoHuStrip(counts)).toEqual(a);
    expect(buildNoHuStrip(counts, 5)).toEqual([...a.slice(5), ...a.slice(0, 5)]);
    expect(NOHU_STRIPS[0]).toEqual(a);
  });

  it('noHuSymbolsAt đọc đúng ô dừng của từng cuộn (chỉ số quay vòng theo 32)', () => {
    expect(noHuSymbolsAt([0, 1, 2])).toEqual([NOHU_STRIPS[0]![0], NOHU_STRIPS[1]![1], NOHU_STRIPS[2]![2]]);
    expect(noHuSymbolsAt([33, -1, 64])).toEqual([NOHU_STRIPS[0]![1], NOHU_STRIPS[1]![31], NOHU_STRIPS[2]![0]]);
  });
});

describe('Nổ Hũ — bảng trả (× mức cược, đã gồm tiền cược)', () => {
  it('3 hũ = nổ hũ; 3 giống nhau theo NOHU.paytable', () => {
    expect(noHuPayout(['hu', 'hu', 'hu'])).toBe('jackpot');
    expect(noHuPayout(['that', 'that', 'that'])).toBe(80);
    expect(noHuPayout(['vang', 'vang', 'vang'])).toBe(40);
    expect(noHuPayout(['chuong', 'chuong', 'chuong'])).toBe(15);
    expect(noHuPayout(['sen', 'sen', 'sen'])).toBe(10);
    expect(noHuPayout(['dao', 'dao', 'dao'])).toBe(6);
    expect(noHuPayout(['bia', 'bia', 'bia'])).toBe(4);
  });

  it('3 quả lẫn ×2; đúng 2 hũ ×3; 1 hũ + đôi bất kỳ = 0; trượt = 0', () => {
    expect(noHuPayout(['bia', 'dao', 'sen'])).toBe(2);
    expect(noHuPayout(['sen', 'sen', 'bia'])).toBe(2);
    expect(noHuPayout(['hu', 'hu', 'bia'])).toBe(3);
    expect(noHuPayout(['that', 'hu', 'hu'])).toBe(3);
    expect(noHuPayout(['hu', 'bia', 'bia'])).toBe(0);
    expect(noHuPayout(['hu', 'that', 'that'])).toBe(0);
    expect(noHuPayout(['bia', 'dao', 'chuong'])).toBe(0);
    expect(noHuPayout(['that', 'that', 'vang'])).toBe(0);
  });

  it('nhãn đường thắng cho bảng / tin chat', () => {
    expect(noHuLineLabel(['hu', 'hu', 'hu'])).toBe('NỔ HŨ');
    expect(noHuLineLabel(['that', 'that', 'that'])).toBe(`3 ${NOHU_NAMES.that} ×80`);
    expect(noHuLineLabel(['bia', 'dao', 'sen'])).toBe(`3 quả lẫn ×${NOHU.mixedFruit}`);
    expect(noHuLineLabel(['hu', 'bia', 'hu'])).toBe(`2 ${NOHU_NAMES.hu} ×${NOHU.twoHu}`);
    expect(noHuLineLabel(['hu', 'bia', 'bia'])).toBe('');
    for (const s of NOHU_SYMBOLS) expect(NOHU_NAMES[s as NoHuSymbol].length).toBeGreaterThan(0);
  });
});

describe('Nổ Hũ — trả lại (liệt kê đủ 32³ tổ hợp ô dừng)', () => {
  it('trả lại chưa tính hũ = 27757/32768 ≈ 84,7%; trúng 10685/32768 ≈ 32,6%; nổ hũ 9/32768 ≈ 1/3641 lượt', () => {
    const r = noHuRtp();
    expect(r.combos).toBe(32 ** 3);
    expect(r.returned).toBe(27757);
    expect(r.rtp).toBeCloseTo(27757 / 32768, 12);
    expect(r.hits).toBe(10685);
    expect(r.hitRate).toBeCloseTo(0.326, 3);
    expect(r.jackpots).toBe(9);
  });

  it('cộng phần góp hũ (mọi đồng góp rốt cuộc về tay người nổ hũ): trả lại dài hạn trong [93%, 96%]', () => {
    const total = noHuRtp().rtp + NOHU.jackpotShare;
    expect(total).toBeGreaterThanOrEqual(0.93);
    expect(total).toBeLessThanOrEqual(0.96);
  });

  it('nhịp máy: 3 cuộn dừng lần lượt, cuộn 3 dừng đúng spinMs, máy nghỉ tối thiểu dài hơn 1 lượt quay', () => {
    expect(NOHU.reelStopMs).toHaveLength(3);
    expect(NOHU.reelStopMs[0]! < NOHU.reelStopMs[1]! && NOHU.reelStopMs[1]! < NOHU.reelStopMs[2]!).toBe(true);
    expect(NOHU.reelStopMs[2]).toBe(NOHU.spinMs);
    expect(NOHU.minIntervalMs).toBeGreaterThan(NOHU.spinMs);
    expect([...NOHU.bets].sort((x, y) => x - y)).toEqual([...NOHU.bets]);
  });
});

describe('Nổ Hũ — nổ hũ ăn theo tỉ lệ mức cược (user chốt 2026-11-01)', () => {
  const S = NOHU_FUND_SCALE;
  const MAX = NOHU.bets[NOHU.bets.length - 1]!;
  const SEED = NOHU.jackpotSeed * S;

  it('phần hũ = mức cược / mức cược tối đa: 1 → 5%, 5 → 25%, 10 → 50%, 20 → trọn hũ', () => {
    expect(NOHU.bets.map((b) => noHuJackpotShare(b))).toEqual([0.05, 0.25, 0.5, 1]);
  });

  it('cược tối đa: ăn phần nguyên cả hũ, hũ về mức gốc + phần lẻ (như trước)', () => {
    expect(noHuJackpotPay(104_500, MAX)).toEqual({ amount: 104, fund: SEED + 500 });
    expect(noHuJackpotPay(7_382_000, MAX)).toEqual({ amount: 7382, fund: SEED });
  });

  it('cược nhỏ: ăn phần nguyên của phần mình, phần còn lại (cả phần lẻ) ở lại hũ', () => {
    // 7 382,4 × 25% = 1 845,6 → trả 1 845, hũ còn 5 537,4; × 5% = 369,12 → trả 369, hũ còn 7 013,4.
    expect(noHuJackpotPay(7_382_400, 5)).toEqual({ amount: 1845, fund: 5_537_400 });
    expect(noHuJackpotPay(7_382_400, 1)).toEqual({ amount: 369, fund: 7_013_400 });
  });

  it('phần còn lại dưới mức gốc thì nhà cái bù lên mức gốc, giữ phần lẻ', () => {
    // 104,5 × 25% = 26,125 → trả 26, còn 78,5 → bù thành 100,5; 150 × 50% = 75 → còn 75 → bù thành 100.
    expect(noHuJackpotPay(104_500, 5)).toEqual({ amount: 26, fund: SEED + 500 });
    expect(noHuJackpotPay(150_000, 10)).toEqual({ amount: 75, fund: SEED });
  });

  it('cược 1 không hớt được hũ do cược 20 nuôi: 2 người quay xen kẽ, trả lại dài hạn ngang nhau, trong [93%, 96%]', () => {
    // Bảng trả đã tính chính xác ở trên; ở đây chỉ mô phỏng phần hũ: mỗi lượt góp NOHU.jackpotShare × cược (như server),
    // nổ hũ đúng tần suất liệt kê, trả bằng noHuJackpotPay. Đo 3 seed: luật này 94,4–95,7% cả hai người; luật cũ (ai nổ
    // cũng ăn trọn hũ) người cược 1 được ~190%, người cược 20 còn ~90%.
    const { rtp, jackpots, combos } = noHuRtp();
    const p = jackpots / combos;
    const rng = createRng(20261101);
    const bets = [MAX, 1];
    const staked = [0, 0];
    const won = [0, 0];
    let fund = SEED;
    for (let i = 0; i < 8_000_000; i++) {
      const k = i & 1;
      const bet = bets[k]!;
      staked[k] += bet;
      fund += Math.round(bet * NOHU.jackpotShare * S);
      if (!rng.chance(p)) continue;
      const r = noHuJackpotPay(fund, bet);
      won[k] += r.amount;
      fund = r.fund;
    }
    const total = staked.map((s, k) => rtp + won[k]! / s);
    for (const t of total) {
      expect(t).toBeGreaterThanOrEqual(0.93);
      expect(t).toBeLessThanOrEqual(0.96);
    }
    expect(Math.abs(total[0]! - total[1]!)).toBeLessThan(0.015);
  });
});
