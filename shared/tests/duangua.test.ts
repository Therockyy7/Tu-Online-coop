// Luật thuần Đua Ngựa: xác suất về nhất + tỉ lệ trả (biên nhà cái), thứ tự về đích bốc theo xác suất, kịch bản đua
// (13 mốc tiến độ đơn điệu, ngựa nhất chạm đích đúng raceMs, các ngựa sau về trễ đúng thứ tự), nội suy tiến độ, tiền trả.
import { describe, expect, it } from 'vitest';
import { DUANGUA } from '../src/config/balance';
import {
  HORSES,
  horseKey,
  raceFinishOrder,
  raceOdds,
  raceOrderAt,
  raceProgressAt,
  raceReturn,
  raceScript,
  raceWinner,
  type RaceScript,
} from '../src/activities/duangua';
import { createRng } from '../src/util/rng';

const N = DUANGUA.horses;
const EPS = 1e-9;
/** Thời điểm (ms tính từ xuất phát) của mốc k trong kịch bản. */
const keyT = (k: number) => (k * DUANGUA.raceMs) / (DUANGUA.keyframes - 1);
/** Lợi thế nhà cái khi cược đều cả 6 ngựa: 1 − trung bình p·o. */
const roundEdge = (probs: number[], odds: number[]) => 1 - probs.reduce((s, p, i) => s + p * odds[i]!, 0) / probs.length;

describe('Đua Ngựa — 6 ngựa', () => {
  it('đủ 6 tên theo thiết kế, mỗi ngựa có màu áo nài + màu lông riêng', () => {
    expect(HORSES.map((h) => h.name)).toEqual(['Xích Thố', 'Bạch Long Mã', 'Ô Truy', 'Đích Lư', 'Tuyệt Ảnh', 'Ngựa Sắt Gióng']);
    expect(HORSES).toHaveLength(N);
    expect(new Set(HORSES.map((h) => h.color)).size).toBe(N);
    for (const h of HORSES) {
      expect(h.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(h.coat).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(horseKey(3)).toBe('horse_3');
  });
});

describe('Đua Ngựa — xác suất về nhất + tỉ lệ trả', () => {
  it('6 xác suất tổng 1, mỗi cái trong [minWinProb, maxWinProb]; tỉ lệ = sàn 0,1 của (1 − margin)/p, ≥ minOdds', () => {
    const rng = createRng(20261101);
    for (let r = 0; r < 500; r++) {
      const { probs, odds } = raceOdds(rng);
      expect(probs).toHaveLength(N);
      expect(odds).toHaveLength(N);
      expect(Math.abs(probs.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(EPS);
      probs.forEach((p, i) => {
        expect(p).toBeGreaterThanOrEqual(DUANGUA.minWinProb - EPS);
        expect(p).toBeLessThanOrEqual(DUANGUA.maxWinProb + EPS);
        const fair = (1 - DUANGUA.margin) / p;
        const o = odds[i]!;
        expect(Math.abs(o * 10 - Math.round(o * 10))).toBeLessThan(EPS);
        expect(o).toBeGreaterThanOrEqual(DUANGUA.minOdds);
        expect(o).toBeLessThanOrEqual(Math.max(DUANGUA.minOdds, fair) + EPS);
        if (fair >= DUANGUA.minOdds) expect(o).toBeGreaterThan(fair - 0.1 - EPS);
      });
    }
  });

  it('phong độ đổi theo ván: ngựa mạnh nhất không cố định, có ván kẹp sát trần 40%', () => {
    const rng = createRng(7);
    const favs = new Set<number>();
    let capped = 0;
    for (let r = 0; r < 300; r++) {
      const { probs } = raceOdds(rng);
      const max = Math.max(...probs);
      favs.add(probs.indexOf(max));
      if (max > DUANGUA.maxWinProb - 1e-6) capped++;
    }
    expect(favs.size).toBe(N);
    expect(capped).toBeGreaterThan(0);
  });

  it('lợi thế nhà cái: mỗi ngựa ≥ margin (sàn 0,1 chỉ làm nhà cái lợi thêm); trung bình 2 000 ván trong [5%, 10%]', () => {
    const rng = createRng(424242);
    let sum = 0;
    for (let r = 0; r < 2000; r++) {
      const { probs, odds } = raceOdds(rng);
      probs.forEach((p, i) => {
        const edge = 1 - p * odds[i]!;
        expect(edge).toBeGreaterThanOrEqual(DUANGUA.margin - EPS);
        expect(edge).toBeLessThanOrEqual(DUANGUA.margin + 0.1 * p + EPS);
      });
      sum += roundEdge(probs, odds);
    }
    const mean = sum / 2000;
    expect(mean).toBeGreaterThanOrEqual(0.05);
    expect(mean).toBeLessThanOrEqual(0.1);
    // Ghi số đo vào chú thích khối DUANGUA: ≈ 7,8%.
    expect(mean).toBeCloseTo(0.078, 2);
  });
});

describe('Đua Ngựa — thứ tự về đích bốc theo xác suất', () => {
  it('luôn là hoán vị của 6 ngựa', () => {
    const rng = createRng(3);
    const probs = [0.4, 0.2, 0.15, 0.1, 0.1, 0.05];
    for (let r = 0; r < 200; r++) expect([...raceFinishOrder(rng, probs)].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('ngựa về nhất theo đúng p (12 000 ván, sai lệch < 4 độ lệch chuẩn)', () => {
    const rng = createRng(99);
    const probs = [0.4, 0.2, 0.15, 0.1, 0.1, 0.05];
    const wins = new Array<number>(N).fill(0);
    const n = 12_000;
    for (let r = 0; r < n; r++) wins[raceFinishOrder(rng, probs)[0]!]!++;
    probs.forEach((p, i) => expect(Math.abs(wins[i]! / n - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n)));
  });
});

/** Kịch bản mẫu với thứ tự về đích cho trước. */
function sample(seed: number, order = [2, 0, 5, 1, 4, 3]): RaceScript {
  return raceScript(createRng(seed), order);
}

describe('Đua Ngựa — kịch bản đua', () => {
  it('mỗi ngựa 13 mốc từ 0, tăng ngặt; ngựa nhất chạm 1 đúng mốc cuối (= raceMs), ngựa khác chưa tới đích', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const order = createRng(seed * 31).shuffle([0, 1, 2, 3, 4, 5]);
      const s = raceScript(createRng(seed), order);
      expect(s.curves).toHaveLength(N);
      s.curves.forEach((c, i) => {
        expect(c).toHaveLength(DUANGUA.keyframes);
        expect(c[0]).toBe(0);
        for (let k = 1; k < c.length; k++) expect(c[k]!).toBeGreaterThan(c[k - 1]!);
        if (i === order[0]) expect(c.at(-1)).toBe(1);
        else expect(c.at(-1)!).toBeLessThan(1);
      });
      expect(s.finish[order[0]!]).toBe(DUANGUA.raceMs);
      expect(raceWinner(s)).toBe(order[0]);
    }
  });

  it('các ngựa sau về đích trễ trailMinMs..trailMaxMs, giờ về tăng ngặt theo đúng thứ tự', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const order = createRng(seed + 1000).shuffle([0, 1, 2, 3, 4, 5]);
      const s = raceScript(createRng(seed), order);
      for (let k = 1; k < N; k++) {
        const late = s.finish[order[k]!]! - DUANGUA.raceMs;
        expect(Number.isInteger(late)).toBe(true);
        expect(late).toBeGreaterThanOrEqual(DUANGUA.trailMinMs);
        expect(late).toBeLessThanOrEqual(DUANGUA.trailMaxMs);
        expect(s.finish[order[k]!]!).toBeGreaterThan(s.finish[order[k - 1]!]!);
      }
    }
  });

  it('cùng seed + thứ tự → cùng kịch bản (mọi máy thấy một cuộc đua); khác seed → khác', () => {
    expect(sample(5)).toEqual(sample(5));
    expect(sample(5)).not.toEqual(sample(6));
  });
});

describe('Đua Ngựa — nội suy tiến độ', () => {
  it('khớp mốc, 0 trước xuất phát, đơn điệu, < 1 trước giờ về, = 1 từ giờ về', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = sample(seed, createRng(seed).shuffle([0, 1, 2, 3, 4, 5]));
      for (let i = 0; i < N; i++) {
        const c = s.curves[i]!;
        for (let k = 0; k < c.length; k++) expect(raceProgressAt(s, i, keyT(k))).toBeCloseTo(c[k]!, 12);
        expect(raceProgressAt(s, i, -500)).toBe(0);
        let prev = 0;
        let bad = 0;
        for (let t = 0; t <= DUANGUA.raceMs + DUANGUA.trailMaxMs + 200; t += 7) {
          const v = raceProgressAt(s, i, t);
          if (v < prev - EPS || v > 1) bad++;
          prev = v;
        }
        expect(bad).toBe(0);
        const f = s.finish[i]!;
        expect(raceProgressAt(s, i, f - 1)).toBeLessThan(1);
        expect(raceProgressAt(s, i, f)).toBe(1);
        expect(raceProgressAt(s, i, f + 5000)).toBe(1);
      }
    }
  });

  it('có kịch tính: ngựa dẫn giữa đường không phải lúc nào cũng là ngựa về nhất', () => {
    let upsets = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const order = createRng(seed).shuffle([0, 1, 2, 3, 4, 5]);
      const s = raceScript(createRng(seed + 7), order);
      if (raceOrderAt(s, DUANGUA.raceMs / 2)[0] !== order[0]) upsets++;
    }
    expect(upsets).toBeGreaterThan(20);
    expect(upsets).toBeLessThan(95);
  });

  it('thứ hạng trực tiếp: theo tiến độ, ngựa đã về đích xếp theo giờ về; cuối cùng đúng thứ tự về đích', () => {
    const order = [4, 1, 0, 5, 3, 2];
    const s = sample(11, order);
    expect(raceOrderAt(s, DUANGUA.raceMs + DUANGUA.trailMaxMs + 1)).toEqual(order);
    const out: number[] = [];
    expect(raceOrderAt(s, 0, out)).toBe(out);
    expect([...out].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    const t = DUANGUA.raceMs * 0.7;
    const live = raceOrderAt(s, t);
    for (let k = 1; k < N; k++) expect(raceProgressAt(s, live[k - 1]!, t)).toBeGreaterThanOrEqual(raceProgressAt(s, live[k]!, t));
  });
});

describe('Đua Ngựa — tiền trả lại', () => {
  const odds = [2.3, 4.1, 6.1, 7.8, 16.8, 18.6];

  it('chỉ ô ngựa về nhất ăn: floor(cược × tỉ lệ), không lỗi làm tròn số thực', () => {
    expect(raceReturn({ horse_0: 10 }, 0, odds)).toBe(23);
    expect(raceReturn({ horse_0: 10, horse_3: 5 }, 3, odds)).toBe(39);
    expect(raceReturn({ horse_1: 7 }, 1, odds)).toBe(28);
    expect(raceReturn({ horse_2: 3 }, 2, [2.3, 4.1, 2.9, 7.8, 16.8, 18.6])).toBe(8);
    expect(raceReturn({ horse_0: 10 }, 1, odds)).toBe(0);
    expect(raceReturn({}, 0, odds)).toBe(0);
  });

  it('khớp sàn tuyệt đối với mọi mệnh giá × mọi tỉ lệ 1,5..20', () => {
    for (let o10 = 15; o10 <= 200; o10++) {
      for (const stake of [1, 5, 10, 50, 100, 37]) {
        expect(raceReturn({ horse_4: stake }, 4, [0, 0, 0, 0, o10 / 10, 0])).toBe(Math.floor((stake * o10) / 10));
      }
    }
  });
});
