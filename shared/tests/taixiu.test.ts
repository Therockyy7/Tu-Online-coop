// Luật thuần Tài Xỉu chẵn lẻ: phân loại 3 xúc xắc, tiền trả lại theo ô cược, lợi thế nhà cái (liệt kê đủ 216 kết quả).
import { describe, expect, it } from 'vitest';
import { TAIXIU } from '../src/config/balance';
import { TAIXIU_BETS, TAIXIU_LABELS, taiXiuOutcome, taiXiuReturn, taiXiuSide, taiXiuWins, type TaiXiuBet } from '../src/activities/taixiu';

/** Mọi bộ 3 mặt xúc xắc (6³ = 216, đồng khả năng). */
function allRolls(): number[][] {
  const out: number[][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) out.push([a, b, c]);
  return out;
}

/** Lợi thế nhà cái của ô `bet` khi cược 1 mỗi ván: 1 − (tổng trả lại / số ván). */
function houseEdge(bet: TaiXiuBet): number {
  const rolls = allRolls();
  const back = rolls.reduce((s, d) => s + taiXiuReturn({ [bet]: 1 }, d), 0);
  return 1 - back / rolls.length;
}

describe('Tài Xỉu — phân loại kết quả', () => {
  it('4-5-6 = 15: Tài, Lẻ; không phải bộ ba', () => {
    expect(taiXiuOutcome([4, 5, 6])).toEqual({ sum: 15, tai: true, xiu: false, chan: false, le: true, triple: false });
  });

  it('bộ ba 3-3-3: thua cả Tài/Xỉu/Chẵn/Lẻ, chỉ Bộ Ba ăn', () => {
    const o = taiXiuOutcome([3, 3, 3]);
    expect(o).toEqual({ sum: 9, tai: false, xiu: false, chan: false, le: false, triple: true });
    expect(TAIXIU_BETS.filter((b) => taiXiuWins(b, o))).toEqual(['bo_ba']);
  });

  it('biên Tài/Xỉu: tổng 10 là Xỉu, 11 là Tài', () => {
    expect(taiXiuOutcome([2, 3, 5])).toMatchObject({ sum: 10, xiu: true, tai: false, chan: true });
    expect(taiXiuOutcome([2, 4, 5])).toMatchObject({ sum: 11, tai: true, xiu: false, le: true });
  });

  it('phía của ván cho bảng cầu: Tài / Xỉu / bộ ba', () => {
    expect(taiXiuSide([6, 5, 1])).toBe('tai');
    expect(taiXiuSide([1, 2, 1])).toBe('xiu');
    expect(taiXiuSide([6, 6, 6])).toBe('triple');
  });

  it('đủ nhãn cho 5 ô cược', () => {
    expect(TAIXIU_BETS).toEqual(['tai', 'xiu', 'chan', 'le', 'bo_ba']);
    for (const b of TAIXIU_BETS) expect(TAIXIU_LABELS[b].length).toBeGreaterThan(0);
  });
});

describe('Tài Xỉu — tiền trả lại', () => {
  it('Bộ Ba ăn 1:30, Tài thua khi ra bộ ba', () => {
    expect(taiXiuReturn({ tai: 10, bo_ba: 5 }, [2, 2, 2])).toBe(155);
  });

  it('1-2-3 = 6 (Xỉu, Chẵn): chỉ ô Chẵn ăn 1:1', () => {
    expect(taiXiuReturn({ tai: 10, chan: 10 }, [1, 2, 3])).toBe(20);
  });

  it('không cược hoặc ô 0 thì trả 0; cược cả Tài lẫn Xỉu ván thường hoàn đúng 1 bên', () => {
    expect(taiXiuReturn({}, [4, 5, 6])).toBe(0);
    expect(taiXiuReturn({ tai: 0, xiu: 0 }, [4, 5, 6])).toBe(0);
    expect(taiXiuReturn({ tai: 7, xiu: 7 }, [4, 5, 6])).toBe(14);
  });

  it('lãi lấy từ khối TAIXIU (ô thắng nhận cược × (1 + lãi))', () => {
    for (const b of TAIXIU_BETS) {
      const win = allRolls().find((d) => taiXiuWins(b, taiXiuOutcome(d)))!;
      expect(taiXiuReturn({ [b]: 10 }, win)).toBe(10 * (1 + TAIXIU.payout[b]));
    }
  });
});

describe('Tài Xỉu — lợi thế nhà cái (liệt kê 216 kết quả)', () => {
  it('Tài = Xỉu = Chẵn = Lẻ = 1 − 2·105/216 ≈ 2,78%', () => {
    const expected = 1 - (2 * 105) / 216;
    for (const b of ['tai', 'xiu', 'chan', 'le'] as const) expect(houseEdge(b)).toBeCloseTo(expected, 10);
    expect(houseEdge('tai')).toBeCloseTo(0.0278, 4);
  });

  it('Bộ Ba = 1 − 31·6/216 ≈ 13,9%', () => {
    expect(houseEdge('bo_ba')).toBeCloseTo(1 - (31 * 6) / 216, 10);
    expect(houseEdge('bo_ba')).toBeCloseTo(0.139, 3);
  });
});
