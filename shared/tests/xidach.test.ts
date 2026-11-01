// Luật thuần Xì Dách (luật Việt): điểm với luật Át theo số lá, hạng, so bài với nhà cái, tiền trả lại, nhà cái "xét dần"
// và mô phỏng lợi thế nhà cái (seed cố định).
import { describe, expect, it } from 'vitest';
import { XIDACH } from '../src/config/balance';
import { newDeck, type Card, type Suit } from '../src/activities/cards';
import {
  autoPlayXiDach,
  compareXiDach,
  isXiDachSpecial,
  playXiDachDealer,
  xiDachAutoStop,
  xiDachCanStand,
  xiDachDealerStep,
  xiDachHandLabel,
  xiDachPayout,
  xiDachPoints,
  xiDachRank,
  xiDachReturn,
  type XiDachVerdict,
} from '../src/activities/xidach';
import { createRng } from '../src/util/rng';

const SUITS: Suit[] = ['bich', 'co', 'ro', 'chuon'];
/** Tay bài theo hạng lá (1 = Át, 11 J, 12 Q, 13 K); chất xoay vòng cho khác nhau. */
const h = (...ranks: number[]): Card[] => ranks.map((r, i) => ({ r, s: SUITS[i % 4]! }));
const A = 1;
const J = 11;
const Q = 12;
const K = 13;

/** Bộ bài rút lần lượt theo thứ tự cho sẵn (kịch bản cố định). */
function script(...ranks: number[]): () => Card {
  const cards = h(...ranks);
  let i = 0;
  return () => {
    const c = cards[i++];
    if (!c) throw new Error('Kịch bản hết lá');
    return c;
  };
}

describe('Xì Dách — điểm (luật Át theo số lá)', () => {
  it('2 lá: Át = 11 / 10 / 1 (lấy tổng tốt nhất ≤ 21)', () => {
    expect(xiDachPoints(h(A, 5))).toBe(16);
    expect(xiDachPoints(h(A, 6))).toBe(17);
    expect(xiDachPoints(h(A, A))).toBe(21);
    expect(xiDachPoints(h(A, K))).toBe(21);
  });

  it('3 lá: Át = 10 / 1', () => {
    expect(xiDachPoints(h(A, 9, A))).toBe(20);
    expect(xiDachPoints(h(A, 5, 6))).toBe(21);
    expect(xiDachPoints(h(A, A, A))).toBe(21);
    expect(xiDachPoints(h(A, 9, 5))).toBe(15);
  });

  it('≥ 4 lá: Át = 1', () => {
    expect(xiDachPoints(h(A, 2, 3, 4))).toBe(10);
    expect(xiDachPoints(h(A, 5, 6, 2))).toBe(14);
    expect(xiDachPoints(h(2, A, 3, A, 4))).toBe(11);
  });

  it('J/Q/K = 10; vượt 21 thì trả tổng nhỏ nhất (Quắc)', () => {
    expect(xiDachPoints(h(J, Q))).toBe(20);
    expect(xiDachPoints(h(K, Q, 5))).toBe(25);
    expect(xiDachPoints(h(10, 9, A, 4))).toBe(24);
  });
});

describe('Xì Dách — hạng', () => {
  it('Xì Bàng (2 Át), Xì Dách (Át + 10/J/Q/K), chỉ tính khi đúng 2 lá', () => {
    expect(xiDachRank(h(A, A))).toBe('xi_bang');
    expect(xiDachRank(h(A, K))).toBe('xi_dach');
    expect(xiDachRank(h(10, A))).toBe('xi_dach');
    expect(xiDachRank(h(A, 9))).toBe('thuong');
    expect(xiDachRank(h(A, A, 9))).toBe('thuong');
    expect(isXiDachSpecial(h(A, A))).toBe(true);
    expect(isXiDachSpecial(h(Q, A))).toBe(true);
    expect(isXiDachSpecial(h(10, 10, A))).toBe(false);
  });

  it('Quắc (> 21), Ngũ Linh (5 lá ≤ 21), còn lại Thường', () => {
    expect(xiDachRank(h(K, Q, 5))).toBe('quac');
    expect(xiDachRank(h(2, 3, 4, A, 5))).toBe('ngu_linh');
    expect(xiDachRank(h(2, 3, 4, 5, 6))).toBe('ngu_linh');
    expect(xiDachRank(h(10, 2, 3, 4, 5))).toBe('quac');
    expect(xiDachRank(h(10, 6))).toBe('thuong');
    expect(xiDachRank(h(7, 7, 7))).toBe('thuong');
  });

  it('nhãn tay bài cho bảng / chat', () => {
    expect(xiDachHandLabel(h(A, A))).toBe('Xì Bàng');
    expect(xiDachHandLabel(h(K, A))).toBe('Xì Dách');
    expect(xiDachHandLabel(h(2, 3, 4, 5, 6))).toBe('Ngũ Linh (20)');
    expect(xiDachHandLabel(h(K, Q, 5))).toBe('Quắc (25)');
    expect(xiDachHandLabel(h(10, 8))).toBe('18 điểm');
    expect(xiDachHandLabel([])).toBe('');
  });
});

describe('Xì Dách — so bài với nhà cái', () => {
  it('hơn hạng thì thắng: Xì Bàng > Xì Dách > Ngũ Linh > Thường', () => {
    expect(compareXiDach(h(A, A), h(A, K))).toBe('win');
    expect(compareXiDach(h(A, J), h(2, 3, 4, 5, 6))).toBe('win');
    expect(compareXiDach(h(2, 3, 4, 5, 6), h(K, A, 10))).toBe('win');
    expect(compareXiDach(h(10, 9), h(A, Q))).toBe('lose');
    expect(compareXiDach(h(10, 10, A), h(A, 2, 3, 4, 5))).toBe('lose');
  });

  it('cùng hạng đặc biệt thì hòa', () => {
    expect(compareXiDach(h(A, A), h(A, A))).toBe('push');
    expect(compareXiDach(h(A, K), h(10, A))).toBe('push');
    expect(compareXiDach(h(2, 3, 4, 5, 6), h(A, 2, 3, 4, 9))).toBe('push');
  });

  it('cùng Thường thì so điểm, bằng điểm hòa', () => {
    expect(compareXiDach(h(10, 9), h(10, 8))).toBe('win');
    expect(compareXiDach(h(10, 7), h(J, Q))).toBe('lose');
    expect(compareXiDach(h(10, 8), h(9, 9))).toBe('push');
  });

  it('người Quắc thua, trừ khi nhà cái cũng Quắc thì hòa; nhà cái Quắc thì người không Quắc thắng', () => {
    expect(compareXiDach(h(K, Q, 5), h(10, 7))).toBe('lose');
    expect(compareXiDach(h(K, Q, 5), h(A, K))).toBe('lose');
    expect(compareXiDach(h(K, Q, 5), h(10, 6, 9))).toBe('push');
    expect(compareXiDach(h(10, 6), h(10, 6, 9))).toBe('win');
    expect(compareXiDach(h(2, 3, 4, 5, 6), h(10, 6, 9))).toBe('win');
  });
});

describe('Xì Dách — tiền trả lại (lãi theo khối XIDACH)', () => {
  it('thắng nhận cược × (1 + lãi theo hạng); hòa hoàn cược; thua mất cược', () => {
    expect(xiDachReturn(10, h(A, A), h(10, 9))).toBe(10 * (1 + XIDACH.payout.xi_bang));
    expect(xiDachReturn(10, h(A, Q), h(10, 10))).toBe(10 * (1 + XIDACH.payout.xi_dach));
    expect(xiDachReturn(10, h(2, 3, 4, 5, 6), h(A, 10, 10))).toBe(10 * (1 + XIDACH.payout.ngu_linh));
    expect(xiDachReturn(10, h(10, 9), h(10, 8))).toBe(10 * (1 + XIDACH.payout.win));
    expect(xiDachReturn(10, h(10, 8), h(9, 9))).toBe(10);
    expect(xiDachReturn(10, h(10, 7), h(10, 8))).toBe(0);
    expect(xiDachReturn(10, h(K, Q, 5), h(10, 6, 9))).toBe(10);
  });

  it('bảng trả: Xì Bàng ×3, Xì Dách ×2, Ngũ Linh ×1 (đã chốt hạ từ ×2 của spec — xem khối XIDACH), thắng thường ×1', () => {
    expect(xiDachReturn(10, h(A, A), h(10, 9))).toBe(40);
    expect(xiDachReturn(10, h(A, K), h(10, 10))).toBe(30);
    expect(xiDachReturn(10, h(2, 3, 4, 5, 6), h(10, 10, A))).toBe(20);
    expect(xiDachReturn(10, h(10, 9), h(10, 8))).toBe(20);
    expect(xiDachPayout(5, 'win', 'thuong')).toBe(10);
    expect(xiDachPayout(5, 'push', 'quac')).toBe(5);
    expect(xiDachPayout(5, 'lose', 'xi_bang')).toBe(0);
  });
});

describe('Xì Dách — lượt người chơi', () => {
  it(`phải đủ ${XIDACH.playerMinStand} điểm mới được dằn; 21 điểm / Quắc / ${XIDACH.maxCards} lá thì tự dừng`, () => {
    expect(xiDachCanStand(h(10, 5))).toBe(false);
    expect(xiDachCanStand(h(10, 6))).toBe(true);
    expect(xiDachCanStand(h(A, 5))).toBe(true);
    expect(xiDachAutoStop(h(10, 6))).toBe(false);
    expect(xiDachAutoStop(h(A, K))).toBe(true);
    expect(xiDachAutoStop(h(7, 7, 7))).toBe(true);
    expect(xiDachAutoStop(h(K, Q, 5))).toBe(true);
    expect(xiDachAutoStop(h(2, 2, 2, 2, 2))).toBe(true);
  });

  it('tự chơi (hết giờ): rút tới đủ tuổi rồi dằn, dừng ở 5 lá', () => {
    const a = h(10, 3);
    autoPlayXiDach(a, script(2, 9));
    expect(a.map((c) => c.r)).toEqual([10, 3, 2, 9]);
    const b = h(2, 2);
    autoPlayXiDach(b, script(2, 3, 2, 9));
    expect(b.map((c) => c.r)).toEqual([2, 2, 2, 3, 2]);
    expect(xiDachRank(b)).toBe('ngu_linh');
    const c = h(10, 6);
    autoPlayXiDach(c, script());
    expect(c).toHaveLength(2);
  });
});

describe('Xì Dách — nhà cái rút tới đủ tuổi rồi xét dần', () => {
  it(`dưới ${XIDACH.dealerStandAt} thì rút, chưa xét ai`, () => {
    expect(xiDachDealerStep(h(10, 5), [h(10, 9)], [0])).toEqual({ settle: [], draw: true });
  });

  it('đủ tuổi: chốt ghế thua/hòa (gồm người Quắc), còn ghế hơn điểm thì rút tiếp', () => {
    const hands = [h(10, 5, K), h(10, 7), h(10, 9), h(9, 4, 2)];
    expect(xiDachDealerStep(h(J, 7), hands, [0, 1, 2, 3])).toEqual({ settle: [0, 1, 3], draw: true });
  });

  it('không còn ghế nào đuổi được (chỉ còn Xì Dách) / Quắc / đủ 5 lá → xét hết, dừng', () => {
    expect(xiDachDealerStep(h(10, 7), [h(A, K), h(10, 5, 2)], [0, 1])).toEqual({ settle: [0, 1], draw: false });
    expect(xiDachDealerStep(h(10, 6, 9), [h(10, 9)], [0])).toEqual({ settle: [0], draw: false });
    expect(xiDachDealerStep(h(2, 3, 2, 4, 3), [h(10, 9)], [0])).toEqual({ settle: [0], draw: false });
    expect(xiDachDealerStep(h(10, 2), [], [])).toEqual({ settle: [], draw: false });
  });

  it('người Quắc bị xét lúc nhà cái đủ tuổi thì thua, dù sau đó nhà cái rút tiếp mà Quắc', () => {
    const dealer = h(10, 7);
    const v = playXiDachDealer(dealer, [h(10, 6, 9), h(10, 9)], script(8));
    expect(v).toEqual<XiDachVerdict[]>(['lose', 'win']);
    expect(dealer.map((c) => c.r)).toEqual([10, 7, 8]);
  });

  it('nhà cái Quắc ngay khi đang rút tới đủ tuổi: người Quắc hòa, người còn lại thắng', () => {
    const dealer = h(10, 4);
    expect(playXiDachDealer(dealer, [h(K, Q, 5), h(10, 8)], script(K))).toEqual<XiDachVerdict[]>(['push', 'win']);
  });

  it('rút tiếp đuổi kịp: mỗi lần xét chốt ngay người bằng điểm (hòa) và người thấp hơn (thua)', () => {
    const dealer = h(10, 6);
    // 16 → rút 2 = 18: xét 17 (thua) và 18 (hòa), còn 19 → rút 2 = 20: xét 19 (thua).
    expect(playXiDachDealer(dealer, [h(10, 9), h(10, 7), h(10, 8)], script(2, 2))).toEqual<XiDachVerdict[]>(['lose', 'lose', 'push']);
    expect(dealer.map((c) => c.r)).toEqual([10, 6, 2, 2]);
    const d2 = h(10, 6);
    // 16 → 18: xét 18 (hòa), còn 19 → rút K = 28 Quắc: 19 thắng.
    expect(playXiDachDealer(d2, [h(10, 9), h(10, 8)], script(2, K))).toEqual<XiDachVerdict[]>(['win', 'push']);
  });
});

/** Cách người chơi đi lượt rút/dằn: thấy tay mình + lá ngửa nhà cái, rút bằng `draw` (sửa `hand` tại chỗ). */
type XiDachPlay = (hand: Card[], up: Card, draw: () => Card) => void;

/** Người chơi ngây thơ (như tự chơi khi hết giờ): rút tới đủ tuổi rồi dằn. */
const playNaive: XiDachPlay = (hand, _up, draw) => autoPlayXiDach(hand, draw);

/**
 * Chiến lược "S2" của phản biện (người chơi khá, không cần đếm bài): dưới 16 thì rút (bắt buộc); có Át mà ≤ 18 điểm
 * (3 lá: ≤ 19) thì rút — Át 3 lá = 10/1, 4 lá = 1 nên rút thêm gần như không thể Quắc; 4 lá ≤ 17 thì rút (nhắm Ngũ
 * Linh); đúng 16 mà lá ngửa nhà cái là A hoặc 7–K thì rút; còn lại dằn.
 */
function s2WantsHit(hand: readonly Card[], up: Card): boolean {
  if (xiDachAutoStop(hand)) return false;
  if (!xiDachCanStand(hand)) return true;
  const p = xiDachPoints(hand);
  if (hand.some((c) => c.r === A) && (p <= 18 || (hand.length === 3 && p === 19))) return true;
  if (hand.length === 4 && p <= 17) return true;
  return p === 16 && (up.r === A || up.r >= 7);
}
const playS2: XiDachPlay = (hand, up, draw) => {
  while (s2WantsHit(hand, up)) hand.push(draw());
};

/**
 * Mô phỏng `rounds` ván với `seats` người: người chơi đi lượt theo `play` (mặc định rút tới đủ tuổi rồi dằn), nhà cái
 * rút tới đủ tuổi rồi xét dần; nhà cái có Xì Bàng / Xì Dách lúc chia thì lật ngay. Trả lợi thế nhà cái = 1 − (tổng trả
 * lại / tổng cược).
 */
function houseEdge(rounds: number, seats: number, seed: number, play: XiDachPlay = playNaive): number {
  const rng = createRng(seed);
  const base = newDeck();
  let staked = 0;
  let back = 0;
  for (let g = 0; g < rounds; g++) {
    const deck = rng.shuffle(base);
    let k = 0;
    const draw = () => deck[k++]!;
    const hands: Card[][] = Array.from({ length: seats }, () => []);
    const dealer: Card[] = [];
    for (let i = 0; i < 2; i++) {
      for (const hand of hands) hand.push(draw());
      dealer.push(draw());
    }
    let verdicts: XiDachVerdict[];
    if (isXiDachSpecial(dealer)) verdicts = hands.map((hand) => compareXiDach(hand, dealer));
    else {
      for (const hand of hands) play(hand, dealer[0]!, draw);
      verdicts = playXiDachDealer(dealer, hands, draw);
    }
    hands.forEach((hand, i) => {
      staked += 1;
      back += xiDachPayout(1, verdicts[i]!, xiDachRank(hand));
    });
  }
  return 1 - back / staked;
}

/** Bộ bài vô hạn: hạng 1..9 mỗi hạng 1/13, lá 10 điểm (gộp 10/J/Q/K) 4/13 — chất không ảnh hưởng luật. */
const INFINITE: readonly (readonly [Card, number])[] = [
  ...Array.from({ length: 9 }, (_, i) => [{ r: i + 1, s: 'bich' as Suit }, 1 / 13] as const),
  [{ r: 10, s: 'bich' }, 4 / 13],
];

/** Tóm tắt tay bài đủ để tính điểm + hạng (số lá, tổng lá không phải Át, số Át) — khóa nhớ đệm. */
function handKey(cards: readonly Card[]): string {
  let base = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === A) aces++;
    else base += Math.min(10, c.r);
  }
  return `${cards.length}.${base}.${aces}`;
}

/**
 * Lợi thế nhà cái khi người chơi chơi TỐI ƯU (1 ghế, bộ bài vô hạn, tính chính xác — không mô phỏng): mỗi lượt chọn
 * rút / dằn theo kỳ vọng lớn hơn khi biết tay mình + lá ngửa nhà cái + việc nhà cái không có Xì Bàng / Xì Dách (có thì
 * ván đã chốt lúc chia). Nhà cái đi đúng từng bước xiDachDealerStep; trả theo xiDachPayout của repo.
 */
function optimalHouseEdge(): number {
  const dealerMemo = new Map<string, number>();
  /** Lãi ròng kỳ vọng (trên 1 Công Đức cược) của tay `hand` đã dằn khi nhà cái đang cầm `dealer`. */
  const dealerEv = (hand: Card[], dealer: Card[]): number => {
    const key = `${xiDachRank(hand)}:${xiDachPoints(hand)}|${handKey(dealer)}`;
    const hit = dealerMemo.get(key);
    if (hit !== undefined) return hit;
    const move = xiDachDealerStep(dealer, [hand], [0]);
    const ev = move.settle.length
      ? xiDachPayout(1, compareXiDach(hand, dealer), xiDachRank(hand)) - 1
      : INFINITE.reduce((s, [c, p]) => s + p * dealerEv(hand, [...dealer, c]), 0);
    dealerMemo.set(key, ev);
    return ev;
  };
  /** Phân bố lá tẩy khi đã biết lá ngửa `up` và nhà cái không có Xì Bàng / Xì Dách. */
  const holeGiven = (up: Card) => {
    const ok = INFINITE.filter(([c]) => !isXiDachSpecial([up, c]));
    const t = ok.reduce((s, [, p]) => s + p, 0);
    return ok.map(([c, p]) => [c, p / t] as const);
  };
  const playerMemo = new Map<string, number>();
  const playerEv = (hand: Card[], up: Card): number => {
    const key = `${handKey(hand)}|${up.r}`;
    const hit = playerMemo.get(key);
    if (hit !== undefined) return hit;
    const stand = () => holeGiven(up).reduce((s, [c, p]) => s + p * dealerEv(hand, [up, c]), 0);
    const draw = () => INFINITE.reduce((s, [c, p]) => s + p * playerEv([...hand, c], up), 0);
    const ev = xiDachAutoStop(hand) ? stand() : !xiDachCanStand(hand) ? draw() : Math.max(stand(), draw());
    playerMemo.set(key, ev);
    return ev;
  };
  let ev = 0;
  for (const [a, pa] of INFINITE)
    for (const [b, pb] of INFINITE)
      for (const [up, pu] of INFINITE) {
        let special = 0;
        for (const [hole, ph] of INFINITE) {
          if (!isXiDachSpecial([up, hole])) continue;
          special += ph;
          ev += pa * pb * pu * ph * (xiDachPayout(1, compareXiDach([a, b], [up, hole]), xiDachRank([a, b])) - 1);
        }
        ev += pa * pb * pu * (1 - special) * playerEv([a, b], up);
      }
  return -ev;
}

describe('Xì Dách — lợi thế nhà cái (mô phỏng, seed cố định)', () => {
  it('200 000 ván 1 người: lợi thế nhà cái trong [1%, 6%]', () => {
    const edge = houseEdge(200_000, 1, 20261101);
    expect(edge).toBeGreaterThan(0.01);
    expect(edge).toBeLessThan(0.06);
  });

  it('bàn đông (5 ghế × 40 000 ván) vẫn trong [1%, 6%]', () => {
    const edge = houseEdge(40_000, 5, 7);
    expect(edge).toBeGreaterThan(0.01);
    expect(edge).toBeLessThan(0.06);
  });

  // Hồi quy phản biện R1-01: với Ngũ Linh lãi ×2, người chơi khá nhìn lá ngửa có lợi thế dương (S2 +0,87%, tối ưu +2,03%).
  it('người chơi khá (chiến lược S2, 200 000 ván 1 người) vẫn thua: lợi thế nhà cái ≥ 1%', () => {
    expect(houseEdge(200_000, 1, 20261101, playS2)).toBeGreaterThan(0.01);
  });

  it('người chơi tối ưu (expectimax theo lá ngửa, bộ bài vô hạn, tính chính xác) vẫn thua: lợi thế nhà cái ≥ 1%', () => {
    expect(optimalHouseEdge()).toBeGreaterThan(0.01);
  });
});
