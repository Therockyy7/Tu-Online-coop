// Nhạc tổng hợp theo bước 1/16 nốt: nhạc nền chùa, nhạc tụng kinh lofi, 4 bài DJ ở Quán Bar.
// Mỗi bài là vòng 4 ô nhịp × 16 bước; bộ lập lịch gọi `step` đúng thời điểm (canh giờ server với bài có nhịp).
import type { TrackId } from '@shared/index';
import { chord, clap, hat, kick, mtof, noise, pluck, snare, synthNote, tone, woodblock, type Voice } from './synth';

export interface MusicTrack {
  /** BPM mặc định (bài có nhịp do server truyền vào). */
  bpm: number;
  step(v: Voice, t: number, step: number, stepDur: number): void;
}

const bar = (s: number) => Math.floor(s / 16) % 4;
const pos = (s: number) => s % 16;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// ── Nhạc nền chùa: drone + đàn tranh ngũ cung + mõ nhẹ + chim ──
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
const templeAmbience: MusicTrack = {
  bpm: 60,
  step(v, t, s, d) {
    const p = s % 128;
    if (p === 0) {
      synthNote(v, t, mtof(38), d * 126, { type: 'sine', attack: 3, release: 4, gain: 0.16, cutoff: 600 });
      synthNote(v, t, mtof(45), d * 126, { type: 'triangle', attack: 4, release: 4, gain: 0.07, cutoff: 500 });
    }
    if (p % 32 === 0) {
      const root = pick([62, 59, 57, 64]);
      chord(v, t, [root, root + 7, root + 12], d * 30, { type: 'sine', attack: 2.5, release: 3, gain: 0.09, cutoff: 900 });
    }
    if (s % 2 === 0 && Math.random() < 0.22) pluck(v, t, mtof(pick(PENTA)), 0.13, 1.8);
    if (s % 16 === 8 && Math.random() < 0.35) woodblock(v, t, 700, 0.25);
    if (s % 24 === 0 && Math.random() < 0.3) {
      const f = 2700 + Math.random() * 900;
      for (let i = 0; i < 3; i++) tone(v, t + i * 0.12, { freq: f, freqEnd: f * 1.4, glide: 0.06, decay: 0.07, gain: 0.04 });
    }
    if (p === 64) noise(v, t, { attack: 3, decay: 5, gain: 0.025, filter: 'bandpass', freq: 500, q: 0.4 });
  },
};

// ── Tụng kinh lofi: trống nhẹ, mõ mỗi phách, hợp âm ấm ──
const CHANT_CHORDS = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [48, 52, 55, 59],
  [55, 59, 62, 65],
];
const chantLofi: MusicTrack = {
  bpm: 72,
  step(v, t, s, d) {
    const p = pos(s);
    const ch = CHANT_CHORDS[bar(s)]!;
    if (p === 0) {
      chord(v, t, ch, d * 15, { type: 'triangle', attack: 0.4, release: 1.2, gain: 0.11, cutoff: 1100 });
      synthNote(v, t, mtof(ch[0]! - 24), d * 7, { type: 'sine', attack: 0.02, release: 0.3, gain: 0.22, cutoff: 400 });
    }
    if (p === 8) synthNote(v, t, mtof(ch[0]! - 24), d * 6, { type: 'sine', attack: 0.02, release: 0.3, gain: 0.18, cutoff: 400 });
    if (p === 0 || p === 10) kick(v, t, 0.45, 0.8);
    if (p === 4 || p === 12) snare(v, t, 0.25);
    if (p % 2 === 0) hat(v, t, false, 0.35);
    if (p === 14 && Math.random() < 0.5) pluck(v, t, mtof(pick(ch) + 12), 0.08, 1.2);
  },
};

// ── Vinahouse Đắc Đạo 136 ──
const VH_CHORDS = [
  [54, 57, 61],
  [50, 54, 57],
  [57, 61, 64],
  [52, 56, 59],
];
const vinahouse: MusicTrack = {
  bpm: 136,
  step(v, t, s, d) {
    const p = pos(s);
    const ch = VH_CHORDS[bar(s)]!;
    const root = ch[0]!;
    if (p % 4 === 0) kick(v, t, 1, 1.1);
    if (p % 4 === 2) hat(v, t, true, 0.9);
    if (p === 4 || p === 12) clap(v, t, 0.8);
    hat(v, t, false, p % 2 ? 0.25 : 0.4);
    // Bass "tưng tưng" nhạc sàn: nốt nghịch phách, quãng tám nhảy.
    if (p % 4 === 2 || p % 4 === 3) {
      synthNote(v, t, mtof(root - 12 + (p % 4 === 3 ? 12 : 0)), d * 0.8, { type: 'sawtooth', attack: 0.005, release: 0.05, gain: 0.2, cutoff: 900, cutoffEnd: 300, q: 4 });
    }
    // Lead: rải hợp âm 1/16 kiểu "bay phòng".
    const arp = [ch[0]!, ch[1]!, ch[2]!, ch[1]! + 12, ch[2]! + 12, ch[1]! + 12, ch[2]!, ch[0]! + 12];
    if (bar(s) % 2 === 1 || Math.floor(s / 64) % 2 === 1) {
      synthNote(v, t, mtof(arp[p % 8]! + 12), d * 0.7, { type: 'square', attack: 0.003, release: 0.06, gain: 0.07, cutoff: 3200, cutoffEnd: 1200 });
    }
    if (p === 0 && bar(s) === 0) chord(v, t, ch.map((n) => n + 12), d * 3, { type: 'sawtooth', attack: 0.01, release: 0.3, gain: 0.1, cutoff: 2600, detunes: [-9, 9] });
    if (s % 64 === 48) noise(v, t, { attack: d * 15, decay: 0.05, gain: 0.12, filter: 'bandpass', freq: 500, freqEnd: 7000, q: 1 });
  },
};

// ── EDM Niết Bàn 128: hợp âm supersaw bơm theo kick ──
const EDM_CHORDS = [
  [60, 63, 67],
  [56, 60, 63],
  [63, 67, 70],
  [58, 62, 65],
];
const edm: MusicTrack = {
  bpm: 128,
  step(v, t, s, d) {
    const p = pos(s);
    const ch = EDM_CHORDS[bar(s)]!;
    if (p % 4 === 0) kick(v, t, 1, 1);
    if (p === 4 || p === 12) clap(v, t, 0.9);
    if (p % 4 === 2) hat(v, t, false, 0.6);
    if (p % 2 === 0) synthNote(v, t, mtof(ch[0]! - 24), d * 1.6, { type: 'sawtooth', attack: 0.005, release: 0.06, gain: 0.17, cutoff: 600, q: 2 });
    if (p % 4 === 2) chord(v, t, ch, d * 1.6, { type: 'sawtooth', attack: 0.004, release: 0.12, gain: 0.16, cutoff: 3400, detunes: [-14, 0, 14] });
    if (p === 0 && bar(s) === 0) tone(v, t, { freq: mtof(ch[2]! + 24), decay: 1.2, gain: 0.05 });
    if (p === 14 && bar(s) === 3) noise(v, t, { attack: d * 2, decay: 0.05, gain: 0.15, filter: 'highpass', freq: 3000 });
  },
};

// ── Lofi Hạ Sơn 90: trống lười, hợp âm Rhodes, tiếng đĩa than ──
const LOFI_CHORDS = [
  [50, 53, 57, 60, 64],
  [43, 53, 57, 59, 64],
  [48, 52, 55, 59, 62],
  [45, 55, 60, 64, 67],
];
const lofi: MusicTrack = {
  bpm: 90,
  step(v, t, s, d) {
    const p = pos(s);
    const ch = LOFI_CHORDS[bar(s)]!;
    const swing = p % 2 === 1 ? d * 0.18 : 0;
    const tt = t + swing;
    if (p === 0 || p === 7 || p === 10) kick(v, tt, 0.6, 0.85);
    if (p === 4 || p === 12) snare(v, tt, 0.35);
    if (p % 2 === 0) hat(v, tt, false, 0.3);
    if (p === 0) {
      chord(v, t, ch, d * 14, { type: 'sine', attack: 0.03, release: 1.2, gain: 0.2, cutoff: 1800 });
      chord(v, t, ch.map((n) => n + 12), d * 6, { type: 'triangle', attack: 0.02, release: 0.6, gain: 0.05, cutoff: 1500 });
      synthNote(v, t, mtof(ch[0]! - 12), d * 7, { type: 'sine', attack: 0.02, release: 0.3, gain: 0.22, cutoff: 500 });
    }
    if (p === 8) synthNote(v, t, mtof(ch[0]! - 12 + 7), d * 6, { type: 'sine', attack: 0.02, release: 0.3, gain: 0.16, cutoff: 500 });
    if (p % 8 === 0) noise(v, t, { attack: 0.05, decay: 0.5, gain: 0.025, filter: 'highpass', freq: 3000, rate: 0.6 });
    if ((p === 6 || p === 14) && Math.random() < 0.4) pluck(v, tt, mtof(pick(ch) + 12), 0.07, 0.9);
  },
};

// ── Mõ House 124: house 4/4, mõ nghịch phách, organ stab ──
const MH_CHORDS = [
  [55, 58, 62, 65],
  [51, 55, 58, 62],
  [48, 51, 55, 58],
  [50, 54, 57, 60],
];
const moHouse: MusicTrack = {
  bpm: 124,
  step(v, t, s, d) {
    const p = pos(s);
    const ch = MH_CHORDS[bar(s)]!;
    if (p % 4 === 0) kick(v, t, 1, 0.95);
    if (p === 4 || p === 12) clap(v, t, 0.6);
    if (p % 4 === 2) hat(v, t, true, 0.6);
    if (p % 4 === 2 || p === 7 || p === 15) woodblock(v, t, p % 4 === 2 ? 660 : 520, 0.6);
    if (p === 3 || p === 6 || p === 11 || p === 14) {
      chord(v, t, ch, d * 0.9, { type: 'square', attack: 0.003, release: 0.08, gain: 0.11, cutoff: 2200 });
    }
    if (p % 4 === 2 || p === 9) synthNote(v, t, mtof(ch[0]! - 24), d * 1.5, { type: 'triangle', attack: 0.004, release: 0.08, gain: 0.32, cutoff: 700 });
  },
};

export const TRACKS: Record<TrackId, MusicTrack> = {
  temple_ambience: templeAmbience,
  chant_lofi: chantLofi,
  vinahouse_dac_dao: vinahouse,
  edm_niet_ban: edm,
  lofi_ha_son: lofi,
  mo_house: moHouse,
};
