// Bộ bài Tây 52 lá dùng chung cho Xì Dách và Bài Cào (luật riêng mỗi trò nằm ở file của trò đó).
import type { Rng } from '../util/rng';

/** Chất: Cơ ♥, Rô ♦, Chuồn (Tép) ♣, Bích ♠. */
export const SUITS = ['co', 'ro', 'chuon', 'bich'] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  /** 1 = Át, 2..10, 11 = J, 12 = Q, 13 = K. */
  r: number;
  s: Suit;
}

export const SUIT_SYMBOL: Record<Suit, string> = { co: '♥', ro: '♦', chuon: '♣', bich: '♠' };
export const SUIT_NAME: Record<Suit, string> = { co: 'Cơ', ro: 'Rô', chuon: 'Chuồn', bich: 'Bích' };
export const SUIT_RED: Record<Suit, boolean> = { co: true, ro: true, chuon: false, bich: false };

export const rankLabel = (r: number): string => (r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
export const cardLabel = (c: Card): string => `${rankLabel(c.r)}${SUIT_SYMBOL[c.s]}`;
/** Lá mặt người (J, Q, K). */
export const isFace = (c: Card): boolean => c.r >= 11;

export function newDeck(): Card[] {
  const out: Card[] = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) out.push({ r, s });
  return out;
}

/** Bộ 52 lá đã xào (Fisher–Yates theo rng — server dùng RNG phòng seed crypto). */
export const shuffledDeck = (rng: Rng): Card[] => rng.shuffle(newDeck());
