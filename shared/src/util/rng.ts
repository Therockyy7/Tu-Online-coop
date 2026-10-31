// RNG có seed (mulberry32) — tất định, dùng chung client/server (vd sinh bài kinh, sơ đồ đàn tràng).

export interface Rng {
  /** Số thực trong [0, 1). */
  next(): number;
  /** Số nguyên trong [min, max] (bao gồm hai đầu). */
  int(min: number, max: number): number;
  /** Số thực trong [min, max). */
  range(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  chance(p: number): boolean;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  return rngFrom(mulberry32(seed));
}

/** Bọc một hàm sinh [0,1) bất kỳ (vd Math.random hoặc crypto) thành Rng. */
export function rngFrom(next: () => number): Rng {
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (arr) => {
      if (arr.length === 0) throw new Error('pick() trên mảng rỗng');
      return arr[Math.floor(next() * arr.length)] as (typeof arr)[number];
    },
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
    chance: (p) => next() < p,
  };
  return rng;
}

/** Hash chuỗi → số nguyên 32-bit (để tạo seed từ id). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
