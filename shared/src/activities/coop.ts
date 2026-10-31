// Luật thuần cho hoạt động co-op ở Chùa: Tụng kinh gõ mõ (7.7), Thỉnh Đại Hồng Chung (7.8).
import { BELL, CHANT } from '../config/balance';
import type { Judgement } from '../rules/timing';
import { createRng } from '../util/rng';
import { clamp, triangle01 } from '../util/math';

// ───────────── Tụng kinh (kiểu osu! × Audition) ─────────────
// Mỗi nốt là một vòng tròn hiện trên "sân khấu" theo dòng chảy kiểu osu! (đánh số trong câu, vòng tiếp cận co lại),
// bên trong là mũi tên phải bấm đúng (← ↑ → ↓ hoặc W A S D). Mỗi câu kinh 8 phách chốt bằng tiếng Khánh (Space)
// đúng phách cuối — như Audition chốt phách 4. Có nốt ngân dài (giữ phím) và mũi tên đỏ (bấm hướng ngược).

/** Phím của nốt: 0 ←, 1 ↑, 2 →, 3 ↓ (gõ mõ), 4 = Khánh (Space). */
export type ChantKey = 0 | 1 | 2 | 3 | 4;
export const CHANT_KHANH: ChantKey = 4;

/** Hướng ngược của mũi tên (Khánh giữ nguyên). */
export const oppositeChantKey = (k: ChantKey): ChantKey => (k === CHANT_KHANH ? k : (((k + 2) % 4) as ChantKey));

export interface ChantNote {
  /** Mốc đầu nốt (ms tính từ lúc bắt đầu bài). */
  t: number;
  /** Phím phải bấm. */
  key: ChantKey;
  /** Mũi tên đỏ: vẽ hướng ngược với phím phải bấm. */
  rev: boolean;
  /** Ngân dài: giữ phím chừng này ms (0 = gõ một cái). */
  hold: number;
  /** Vị trí đầu nốt trên sân khấu (0..1, gốc trên-trái). */
  x: number;
  y: number;
  /** Vị trí đuôi nốt ngân (nốt thường trùng đầu nốt). */
  x2: number;
  y2: number;
  /** Số thứ tự trong câu (từ 1) và chỉ số câu (đổi màu như combo osu!). */
  n: number;
  phrase: number;
  /** Nốt cuối câu (tiếng Khánh). */
  end: boolean;
}

export interface ChantChart {
  bpm: number;
  notes: ChantNote[];
  /** Mốc từng phách (cho mõ dẫn của Phương Trượng). */
  beats: number[];
}

/** Vùng đặt nốt trên sân khấu (chừa lề để vòng tròn không tràn ra ngoài). */
const FIELD = { x0: 0.1, x1: 0.9, y0: 0.14, y1: 0.86 } as const;

/** Mốc server chốt kết quả một nốt (ms từ đầu bài): sau đuôi nốt finalizeDelayMs. */
export const chantFinalizeAt = (n: ChantNote): number => n.t + n.hold + CHANT.finalizeDelayMs;

/**
 * Sinh bài tụng (tất định theo seed, client và server sinh giống hệt):
 * - Mỗi phách một nốt mũi tên; câu 8 phách, phách cuối câu là Khánh.
 * - Tâm Kinh: chỉ ← →, hay có nốt ngân. A Di Đà: 4 hướng + móc đơn. Chú Đại Bi: thêm dấu lặng và mũi tên đỏ.
 * - Nốt không bao giờ chồng nhau: nốt kế tiếp luôn bắt đầu sau đuôi nốt ngân trước đó.
 */
export function chantChart(sutraId: string, tempo: number, seed: number): ChantChart {
  const def = CHANT.sutras.find((s) => s.id === sutraId) ?? CHANT.sutras[0]!;
  const bpm = def.bpm * tempo;
  const beatMs = 60_000 / bpm;
  const rng = createRng(seed);
  const P = CHANT.phraseBeats;
  const dirs: ChantKey[] = def.arrows === 2 ? [0, 2] : [0, 1, 2, 3];
  const beats: number[] = [];
  const notes: ChantNote[] = [];

  let x = 0.5;
  let y = 0.5;
  let ang = rng.range(0, Math.PI * 2);
  let phrase = -1;
  let n = 0;
  let prevKey: ChantKey = 0;
  /** Phách sớm nhất được đặt nốt kế tiếp (sau nốt ngân). */
  let freeAt = 0;

  /** Đi tiếp một đoạn `len` từ (x, y) theo dòng chảy, dội lại ở mép sân khấu. */
  const flow = (len: number): [number, number] => {
    ang += rng.range(-0.8, 0.8);
    let nx = x + Math.cos(ang) * len;
    let ny = y + Math.sin(ang) * len;
    if (nx < FIELD.x0 || nx > FIELD.x1) {
      ang = Math.PI - ang;
      nx = x + Math.cos(ang) * len;
    }
    if (ny < FIELD.y0 || ny > FIELD.y1) {
      ang = -ang;
      ny = y + Math.sin(ang) * len;
    }
    return [clamp(nx, FIELD.x0, FIELD.x1), clamp(ny, FIELD.y0, FIELD.y1)];
  };
  const pickKey = (): ChantKey => {
    let k = rng.pick(dirs);
    if (k === prevKey && rng.chance(0.5)) k = rng.pick(dirs);
    prevKey = k;
    return k;
  };
  const push = (beat: number, key: ChantKey, holdBeats = 0, rev = false, end = false): void => {
    const prev = notes[notes.length - 1];
    const t = Math.round(beat * beatMs);
    if (n === 0) {
      // Câu mới: nhảy sang vùng khác của sân khấu, cách nốt trước đủ xa để không chồng lên nhau.
      for (let tries = 0; tries < 8; tries++) {
        x = rng.range(0.24, 0.76);
        y = rng.range(0.28, 0.72);
        if (!prev || Math.hypot(x - prev.x2, y - prev.y2) > 0.26) break;
      }
      ang = rng.range(0, Math.PI * 2);
    } else {
      const gap = prev ? (t - prev.t - prev.hold) / beatMs : 1;
      [x, y] = flow(clamp(0.1 + gap * 0.11, 0.15, 0.3));
    }
    const hold = holdBeats > 0 ? Math.round((holdBeats - 0.5) * beatMs) : 0;
    const [x2, y2] = hold > 0 ? flow(clamp(0.13 * holdBeats, 0.18, 0.3)) : [x, y];
    n++;
    notes.push({ t, key, rev, hold, x, y, x2, y2, n, phrase, end });
    x = x2;
    y = y2;
  };

  for (let b = 0; b < def.beats; b++) {
    beats.push(Math.round(b * beatMs));
    const inP = b % P;
    if (inP === 0) {
      phrase++;
      n = 0;
    }
    if (b < freeAt) continue;
    /** Phách Khánh của câu này (câu cuối có thể ngắn hơn 8 phách). */
    const endBeat = Math.min(b - inP + P - 1, def.beats - 1);
    if (b === endBeat) {
      push(b, CHANT_KHANH, 0, false, true);
      continue;
    }
    const rest = def.pattern === 'mixed' && inP !== 0 && rng.chance(0.14);
    if (!rest) {
      if (inP % 2 === 0 && b + 2 <= endBeat && rng.chance(def.hold)) {
        push(b, pickKey(), 2);
        freeAt = b + 2;
        continue;
      }
      push(b, pickKey(), 0, def.reverse > 0 && phrase >= 2 && rng.chance(def.reverse));
    }
    if (def.pattern !== 'quarter' && b + 1 < endBeat && b % 4 !== 3 && rng.chance(def.pattern === 'mixed' ? 0.32 : 0.28)) {
      push(b + 0.5, pickKey());
    }
  }
  return { bpm, notes, beats };
}

export function judgeChantHit(deltaMs: number): Judgement {
  const d = Math.abs(deltaMs);
  if (d <= CHANT.perfectMs) return 'perfect';
  if (d <= CHANT.goodMs) return 'good';
  return 'miss';
}

export interface ChantMatch {
  /** Chỉ số nốt bị "ăn". */
  i: number;
  j: Judgement;
  /** Bấm sai phím: nốt vẫn bị tính (trượt) — phải bấm đúng chuỗi. */
  wrongKey: boolean;
}

/**
 * Ghép một cú bấm phím `key` lúc `rel` (ms từ đầu bài) với nốt chưa chấm trong ±strayMs:
 * ưu tiên nốt đúng phím, cùng loại thì nốt gần nhất. Không có nốt nào → null (gõ trật nhịp).
 * Client dùng để phản hồi tức thì, server dùng để chấm chính thức — hai bên luôn ra cùng kết quả.
 */
export function matchChantPress(
  notes: readonly ChantNote[],
  from: number,
  taken: (i: number) => boolean,
  rel: number,
  key: ChantKey,
): ChantMatch | null {
  let best = -1;
  let bestD = Infinity;
  let bestOk = false;
  for (let i = Math.max(0, from); i < notes.length; i++) {
    const d = rel - notes[i]!.t;
    if (d < -CHANT.strayMs) break;
    if (d > CHANT.strayMs || taken(i)) continue;
    const ok = notes[i]!.key === key;
    const ad = Math.abs(d);
    if ((ok && !bestOk) || (ok === bestOk && ad < bestD)) {
      best = i;
      bestD = ad;
      bestOk = ok;
    }
  }
  if (best < 0) return null;
  return { i: best, j: bestOk ? judgeChantHit(rel - notes[best]!.t) : 'miss', wrongKey: !bestOk };
}

/** Nốt ngân: thả phím (`releaseRel`, ms từ đầu bài) sớm hơn đuôi nốt quá holdEarlyMs → đứt hơi. Chưa thả = giữ trọn. */
export const chantHoldBroken = (n: ChantNote, releaseRel: number | null | undefined): boolean =>
  n.hold > 0 && releaseRel != null && releaseRel < n.t + n.hold - CHANT.holdEarlyMs;

export interface ChantParticipant {
  pid: string;
  name: string;
  cushion: string;
}

export interface ChantPublicState {
  phase: 'idle' | 'lobby' | 'playing' | 'result';
  lobbyEndsAt: number;
  chooserPid: string | null;
  sutraId: string;
  tempo: number;
  seed: number;
  /** Giờ server của nốt/phách 0. */
  startAt: number;
  participants: ChantParticipant[];
  combo: number;
  maxCombo: number;
}

// ───────────── Thỉnh chuông ─────────────

/** Lực (0..100) khi thả tay: dao động tam giác chu kỳ oscillationMs, tính từ lúc nhấn. */
export const bellPower = (pressT: number, releaseT: number): number => triangle01((releaseT - pressT) / BELL.oscillationMs) * 100;

export function bellZoneScore(power: number): number {
  if (power >= BELL.zoneMin && power <= BELL.zoneMax) return BELL.zoneScore.in;
  for (const [lo, hi] of BELL.nearRanges) if (power >= lo && power <= hi) return BELL.zoneScore.near;
  return BELL.zoneScore.out;
}

export function bellSyncFactor(spreadMs: number): number {
  if (spreadMs <= BELL.syncPerfectMs) return 1;
  if (spreadMs <= BELL.syncMaxMs) {
    const k = (spreadMs - BELL.syncPerfectMs) / (BELL.syncMaxMs - BELL.syncPerfectMs);
    return 1 + (BELL.syncFactorAtMax - 1) * k;
  }
  return BELL.syncFactorBeyond;
}

/** Chất lượng 1 tiếng chuông: trung bình điểm vùng × hệ số đồng bộ × (số người / 4). Người không thả tính lực 0. */
export function bellQuality(releases: { power: number; at: number | null }[]): number {
  if (releases.length === 0) return 0;
  const avg = releases.reduce((a, r) => a + bellZoneScore(r.at === null ? 0 : r.power), 0) / releases.length;
  const times = releases.filter((r) => r.at !== null).map((r) => r.at as number);
  const spread = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
  const sync = times.length === 0 ? BELL.syncFactorBeyond : bellSyncFactor(spread);
  return avg * sync * (releases.length / BELL.ropes);
}

export interface BellPublicState {
  phase: 'idle' | 'gathering' | 'countdown' | 'ringing' | 'cooldown';
  pullers: { pid: string; name: string; rope: string }[];
  countdownEndsAt: number;
  strike: number;
  cooldownUntil: number;
}
