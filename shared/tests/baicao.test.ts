// Luật thuần Bài Cào 3 lá: nút (tổng mod 10), Ba Tiên, so bài với nhà cái (bằng nút so lá lớn nhất, bù gặp bù nhà cái
// ăn, vẫn bằng thì nhà cái ăn), tiền trả lại, mốc lật bài, và lợi thế nhà cái tính CHÍNH XÁC trên mọi cặp tay rời nhau.
import { describe, expect, it } from 'vitest';
import { BAICAO } from '../src/config/balance';
import type { Card, Suit } from '../src/activities/cards';
import {
  BA_TIEN,
  baiCaoFlipAt,
  baiCaoLabel,
  baiCaoPayout,
  baiCaoReturn,
  baiCaoScore,
  baiCaoShown,
  baiCaoTop,
  compareBaiCao,
  isBaTien,
} from '../src/activities/baicao';

const SUITS: Suit[] = ['bich', 'co', 'ro', 'chuon'];
/** Tay bài theo hạng lá (1 = Át, 11 J, 12 Q, 13 K); chất xoay vòng cho khác nhau. */
const h = (...ranks: number[]): Card[] => ranks.map((r, i) => ({ r, s: SUITS[i % 4]! }));
const A = 1;
const J = 11;
const Q = 12;
const K = 13;

describe('Bài Cào — nút và Ba Tiên', () => {
  it('nút = tổng điểm mod 10 (Át 1, 2–9 theo số, 10/J/Q/K = 10)', () => {
    expect(baiCaoScore(h(7, 8, 9))).toBe(4);
    expect(baiCaoScore(h(J, Q, 5))).toBe(5);
    expect(baiCaoScore(h(A, 8, K))).toBe(9);
    expect(baiCaoScore(h(A, A, A))).toBe(3);
    expect(baiCaoScore(h(5, 5, 10))).toBe(0);
    expect(baiCaoScore(h(9, 9, 9))).toBe(7);
  });

  it('Ba Tiên = đủ 3 lá J/Q/K, xếp trên 9 nút; lá 10 không phải lá Tiên', () => {
    expect(isBaTien(h(J, Q, K))).toBe(true);
    expect(isBaTien(h(K, K, J))).toBe(true);
    expect(baiCaoScore(h(J, Q, K))).toBe(BA_TIEN);
    expect(BA_TIEN).toBeGreaterThan(9);
    expect(isBaTien(h(10, J, K))).toBe(false);
    expect(baiCaoScore(h(10, J, K))).toBe(0);
    expect(isBaTien(h(J, Q))).toBe(false);
  });

  it('lá lớn nhất theo hạng: K > Q > J > 10 > … > Át', () => {
    expect(baiCaoTop(h(A, 2, K))).toBe(K);
    expect(baiCaoTop(h(10, J, 3))).toBe(J);
    expect(baiCaoTop(h(A, A, 2))).toBe(2);
  });

  it('nhãn tay bài cho bảng / chat', () => {
    expect(baiCaoLabel(h(J, Q, K))).toBe('Ba Tiên');
    expect(baiCaoLabel(h(A, 8, K))).toBe('9 nút');
    expect(baiCaoLabel(h(5, 5, 10))).toBe('Bù (0 nút)');
    expect(baiCaoLabel([])).toBe('');
  });
});

describe('Bài Cào — so với nhà cái', () => {
  it('hơn nút thắng, kém nút thua; Ba Tiên thắng cả 9 nút', () => {
    expect(compareBaiCao(h(A, 8, K), h(7, 8, 9))).toBe('win');
    expect(compareBaiCao(h(7, 8, 9), h(A, 8, K))).toBe('lose');
    expect(compareBaiCao(h(J, Q, K), h(A, 8, K))).toBe('win');
    expect(compareBaiCao(h(A, 8, K), h(J, Q, K))).toBe('lose');
    expect(compareBaiCao(h(A, 10, J), h(5, 5, 10))).toBe('win');
  });

  it('bằng nút: so lá lớn nhất (K > Q > J > 10 > … > Át)', () => {
    // 7 nút cả hai: K-5-2 (lá lớn nhất K) thắng Q-3-4 (lá lớn nhất Q).
    expect(compareBaiCao(h(K, 5, 2), h(Q, 3, 4))).toBe('win');
    expect(compareBaiCao(h(Q, 3, 4), h(K, 5, 2))).toBe('lose');
    // J > 10: J-4-3 vs 10-6-A (cùng 7 nút).
    expect(compareBaiCao(h(J, 4, 3), h(10, 6, A))).toBe('win');
    // 9 > 8 khi không có lá 10/J/Q/K: 9-4-A vs 8-4-2 (cùng 4 nút).
    expect(compareBaiCao(h(9, 4, A), h(8, 4, 2))).toBe('win');
  });

  it('bằng nút, lá lớn nhất cùng hạng → nhà cái thắng (không so chất, không so lá thứ hai)', () => {
    // Lá thứ hai của khách lớn hơn (5 > 4, 9 > 7) cũng không tính.
    expect(compareBaiCao(h(K, 5, 2), h(K, 4, 3))).toBe('lose');
    expect(compareBaiCao(h(9, 9, 9), h(9, 7, A))).toBe('lose');
  });

  it('bù gặp bù (cùng 0 nút) → nhà cái ăn, không so lá', () => {
    expect(compareBaiCao(h(K, Q, 10), h(5, 5, 10))).toBe('lose');
    expect(compareBaiCao(h(K, 7, 3), h(2, 8, 10))).toBe('lose');
    // Bù vẫn thua mọi nút khác của nhà cái, và nhà cái bù thì khách có nút là thắng.
    expect(compareBaiCao(h(K, Q, 10), h(A, 10, 10))).toBe('lose');
    expect(compareBaiCao(h(A, 10, 10), h(K, Q, 10))).toBe('win');
  });

  it('Ba Tiên gặp Ba Tiên: so lá lớn nhất, bằng thì nhà cái ăn', () => {
    expect(compareBaiCao(h(K, J, J), h(Q, Q, J))).toBe('win');
    expect(compareBaiCao(h(Q, Q, J), h(K, J, J))).toBe('lose');
    expect(compareBaiCao(h(K, Q, J), h(K, J, J))).toBe('lose');
  });
});

describe('Bài Cào — tiền trả lại', () => {
  it('thắng thường nhận cược × (1 + lãi), thắng bằng Ba Tiên × (1 + lãi Ba Tiên), thua 0', () => {
    expect(BAICAO.payout).toEqual({ win: 1, ba_tien: 2 });
    expect(baiCaoReturn(10, h(A, 8, K), h(7, 8, 9))).toBe(20);
    expect(baiCaoReturn(10, h(J, Q, K), h(A, 8, K))).toBe(30);
    expect(baiCaoReturn(10, h(7, 8, 9), h(A, 8, K))).toBe(0);
    expect(baiCaoReturn(10, h(K, Q, 10), h(5, 5, 10))).toBe(0);
    expect(baiCaoPayout(10, 'win', h(J, Q, K))).toBe(30);
    expect(baiCaoPayout(10, 'win', h(K, 5, 2))).toBe(20);
    expect(baiCaoPayout(10, 'lose', h(J, Q, K))).toBe(0);
  });
});

describe('Bài Cào — mốc lật bài (bảng + 3D cùng canh)', () => {
  it('3 đợt lật nằm trong revealMs, sau phần bay bài; baiCaoShown đếm số lá đã ngửa', () => {
    const dealAt = 50_000;
    const at = [0, 1, 2].map((k) => baiCaoFlipAt(dealAt, k));
    expect(at[0]).toBe(dealAt + BAICAO.dealFlyMs);
    expect(at[1]!).toBeGreaterThan(at[0]!);
    expect(at[2]!).toBeGreaterThan(at[1]!);
    expect(at[2]!).toBeLessThan(dealAt + BAICAO.revealMs);
    const st = { phase: 'resolving' as const, dealAt };
    expect(baiCaoShown(st, dealAt)).toBe(0);
    expect(baiCaoShown(st, at[0]! - 1)).toBe(0);
    expect(baiCaoShown(st, at[0]!)).toBe(1);
    expect(baiCaoShown(st, at[1]!)).toBe(2);
    expect(baiCaoShown(st, at[2]! + 1)).toBe(3);
    expect(baiCaoShown({ phase: 'result', dealAt }, 0)).toBe(3);
    expect(baiCaoShown({ phase: 'betting', dealAt: 0 }, dealAt)).toBe(0);
  });
});

// ── Lợi thế nhà cái: liệt kê chính xác theo bộ hạng (kết quả chỉ phụ thuộc hạng lá, chất chỉ quyết định số cách rút) ──

/** Tổ hợp C(n, k) với n ≤ 4. */
const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let v = 1;
  for (let i = 0; i < k; i++) v = (v * (n - i)) / (i + 1);
  return v;
};

/** Mọi bộ 3 hạng không thứ tự (có lặp): C(15, 3) = 455 bộ, kèm số lá mỗi hạng. */
function rankSets(): { cards: Card[]; count: Map<number, number> }[] {
  const out: { cards: Card[]; count: Map<number, number> }[] = [];
  for (let a = 1; a <= 13; a++) {
    for (let b = a; b <= 13; b++) {
      for (let c = b; c <= 13; c++) {
        const count = new Map<number, number>();
        for (const r of [a, b, c]) count.set(r, (count.get(r) ?? 0) + 1);
        out.push({ cards: h(a, b, c), count });
      }
    }
  }
  return out;
}

/**
 * Cược 1 mỗi ván trên mọi cặp (tay khách, tay nhà cái) 3 lá rời nhau từ bộ 52 lá, đồng khả năng. Số cách rút bộ hạng P
 * cho khách = Π C(4, p_r); rồi bộ D cho nhà cái từ 49 lá còn lại = Π C(4 − p_r, d_r).
 */
function exactEdge(): { pairs: number; back: number; edge: number } {
  const sets = rankSets();
  let pairs = 0;
  let back = 0;
  for (const P of sets) {
    let waysP = 1;
    for (const m of P.count.values()) waysP *= choose(4, m);
    for (const D of sets) {
      let w = waysP;
      for (const [r, m] of D.count) w *= choose(4 - (P.count.get(r) ?? 0), m);
      if (w === 0) continue;
      pairs += w;
      back += w * baiCaoReturn(1, P.cards, D.cards);
    }
  }
  return { pairs, back, edge: 1 - back / pairs };
}

describe('Bài Cào — lợi thế nhà cái (liệt kê chính xác)', () => {
  it('mọi cặp tay 3 lá rời nhau: lợi thế 0,933% — trong [0,5%; 1,6%] (khoảng mục tiêu [0,5%; 4%])', () => {
    expect(rankSets()).toHaveLength(455);
    const { pairs, back, edge } = exactEdge();
    // C(52,3) tay khách × C(49,3) tay nhà cái.
    expect(pairs).toBe(22_100 * 18_424);
    // Khách thắng thường 195 627 072 cặp (× 2) + thắng bằng Ba Tiên 4 038 984 cặp (× 3).
    expect(back).toBe(195_627_072 * 2 + 4_038_984 * 3);
    expect(edge).toBeGreaterThan(0.005);
    expect(edge).toBeLessThan(0.016);
    expect(edge * 100).toBeCloseTo(0.9331, 3);
  });
});
