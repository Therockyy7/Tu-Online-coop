// Công thức từng hiệu ứng âm thanh (SfxId). `r` = hệ số cao độ/tốc độ (1 = bình thường).
import type { SfxId } from '@shared/index';
import { metalBell, mtof, noise, tone, woodblock, type Voice } from './synth';

type Recipe = (v: Voice, t: number, r: number) => void;

const BIG_BELL: [number, number][] = [
  [0.5, 0.55],
  [1, 0.8],
  [1.19, 0.45],
  [1.5, 0.35],
  [2, 0.4],
  [2.74, 0.22],
  [3.01, 0.16],
  [4.07, 0.1],
  [5.43, 0.07],
];
const SMALL_BELL: [number, number][] = [
  [1, 0.6],
  [2.76, 0.3],
  [5.4, 0.16],
  [8.93, 0.06],
];

/** Tiếng Đại Hồng Chung: strength 0..1 điều khiển âm lượng + độ ngân. */
export function bigBell(v: Voice, t: number, strength: number): void {
  const s = Math.max(0.15, Math.min(1, strength));
  metalBell(v, t, 82, 0.55 * s, 5 + 7 * s, BIG_BELL);
  noise(v, t, { decay: 0.25, gain: 0.35 * s, filter: 'lowpass', freq: 900 });
  tone(v, t, { freq: 41, decay: 3 + 3 * s, gain: 0.35 * s });
}

export const SFX: Record<SfxId, Recipe> = {
  mo: (v, t, r) => woodblock(v, t, 620 * r, 0.9),
  mo_lead: (v, t, r) => {
    woodblock(v, t, 470 * r, 1.25);
    tone(v, t, { freq: 235 * r, decay: 0.16, gain: 0.35 });
  },
  bell_big: (v, t) => bigBell(v, t, 0.85),
  bell_small: (v, t, r) => metalBell(v, t, 880 * r, 0.22, 2.4, SMALL_BELL),
  bong: (v, t) => {
    // Chói tai: hai nốt nghịch nhau + rung kim loại.
    for (const [f, type] of [
      [466, 'square'],
      [494, 'sawtooth'],
      [233, 'square'],
    ] as const) {
      tone(v, t, { type, freq: f, freqEnd: f * 0.92, glide: 0.8, attack: 0.005, decay: 0.85, gain: 0.16, lowpass: 2600 });
    }
    metalBell(v, t, 311, 0.25, 1.4, [
      [1, 0.6],
      [1.41, 0.5],
      [2.13, 0.3],
    ]);
  },
  sweep: (v, t, r) => noise(v, t, { attack: 0.06, decay: 0.28, gain: 0.32, filter: 'bandpass', freq: 1400 * r, freqEnd: 4200 * r, q: 0.8 }),
  leaf: (v, t, r) => noise(v, t, { attack: 0.02, decay: 0.12, gain: 0.18, filter: 'highpass', freq: 3500 * r }),
  chop: (v, t, r) => {
    tone(v, t, { freq: 150 * r, freqEnd: 55, glide: 0.12, decay: 0.2, gain: 0.8 });
    noise(v, t, { decay: 0.09, gain: 0.55, filter: 'highpass', freq: 1800 * r });
    noise(v, t + 0.012, { decay: 0.16, gain: 0.3, filter: 'bandpass', freq: 700 * r, q: 2 });
  },
  chop_miss: (v, t, r) => {
    tone(v, t, { type: 'square', freq: 1250 * r, freqEnd: 900, decay: 0.09, gain: 0.18, lowpass: 3000 });
    tone(v, t + 0.07, { type: 'square', freq: 980 * r, decay: 0.12, gain: 0.12, lowpass: 2500 });
    noise(v, t, { decay: 0.05, gain: 0.3, filter: 'highpass', freq: 3000 });
  },
  crank: (v, t, r) => {
    for (let i = 0; i < 4; i++) noise(v, t + i * 0.045, { decay: 0.02, gain: 0.3, filter: 'bandpass', freq: 2400 * r, q: 4 });
    tone(v, t, { type: 'triangle', freq: 180 * r, decay: 0.15, gain: 0.15 });
  },
  pour: (v, t, r) => {
    for (let i = 0; i < 6; i++) {
      noise(v, t + i * 0.12, { attack: 0.04, decay: 0.16, gain: 0.22, filter: 'bandpass', freq: (700 + Math.random() * 900) * r, q: 3 });
    }
    noise(v, t, { attack: 0.1, decay: 0.7, gain: 0.12, filter: 'lowpass', freq: 1200 });
  },
  splash: (v, t, r) => {
    noise(v, t, { decay: 0.4, gain: 0.5, filter: 'lowpass', freq: 2600 * r, freqEnd: 500 });
    for (let i = 0; i < 4; i++) {
      const f = (500 + Math.random() * 700) * r;
      tone(v, t + 0.05 + i * 0.06, { freq: f, freqEnd: f * 1.8, decay: 0.06, gain: 0.12 });
    }
  },
  bird: (v, t, r) => {
    for (let i = 0; i < 3; i++) {
      const f = (2600 + Math.random() * 900) * r;
      tone(v, t + i * 0.13, { freq: f, freqEnd: f * 1.45, glide: 0.07, decay: 0.08, gain: 0.12 });
    }
  },
  mosquito: (v, t, r) => {
    const { ctx } = v;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 610 * r;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 26;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1300;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(f);
    f.connect(g);
    g.connect(v.out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 1.35);
    lfo.stop(t + 1.35);
  },
  thud: (v, t, r) => {
    tone(v, t, { freq: 95 * r, freqEnd: 38, decay: 0.3, gain: 0.85 });
    noise(v, t, { decay: 0.2, gain: 0.35, filter: 'lowpass', freq: 600 });
  },
  pop: (v, t, r) => tone(v, t, { freq: 520 * r, freqEnd: 1250 * r, glide: 0.05, decay: 0.07, gain: 0.35 }),
  pickup: (v, t, r) => {
    tone(v, t, { type: 'triangle', freq: mtof(79) * r, decay: 0.08, gain: 0.3 });
    tone(v, t + 0.06, { type: 'triangle', freq: mtof(84) * r, decay: 0.14, gain: 0.3 });
  },
  putdown: (v, t, r) => {
    tone(v, t, { type: 'triangle', freq: mtof(79) * r, decay: 0.08, gain: 0.25 });
    tone(v, t + 0.06, { type: 'triangle', freq: mtof(72) * r, decay: 0.14, gain: 0.25 });
    noise(v, t + 0.05, { decay: 0.06, gain: 0.15, filter: 'lowpass', freq: 900 });
  },
  success: (v, t, r) => {
    [72, 76, 79, 84].forEach((n, i) => tone(v, t + i * 0.075, { type: 'triangle', freq: mtof(n) * r, decay: 0.35, gain: 0.26 }));
    tone(v, t + 0.3, { freq: mtof(96) * r, decay: 0.5, gain: 0.1 });
  },
  fail: (v, t, r) => {
    tone(v, t, { type: 'sawtooth', freq: 330 * r, freqEnd: 300 * r, decay: 0.22, gain: 0.16, lowpass: 1400 });
    tone(v, t + 0.22, { type: 'sawtooth', freq: 262 * r, freqEnd: 196 * r, glide: 0.4, decay: 0.42, gain: 0.16, lowpass: 1200 });
  },
  rankup: (v, t, r) => {
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) =>
      tone(v, t + i * 0.07, { type: 'triangle', freq: mtof(n) * r, decay: 0.6, gain: 0.2 }),
    );
    [72, 76, 79, 84].forEach((n) => tone(v, t + 0.55, { freq: mtof(n) * r, attack: 0.05, decay: 1.6, gain: 0.12 }));
    metalBell(v, t + 0.55, 1046 * r, 0.12, 2.2, SMALL_BELL);
    noise(v, t, { attack: 0.5, decay: 0.6, gain: 0.1, filter: 'highpass', freq: 5000 });
  },
  karma: (v, t, r) => {
    tone(v, t, { freq: mtof(88) * r, decay: 0.35, gain: 0.14 });
    tone(v, t + 0.05, { freq: mtof(95) * r, decay: 0.45, gain: 0.1 });
  },
  coin: (v, t, r) => {
    tone(v, t, { type: 'square', freq: 988 * r, decay: 0.06, gain: 0.12, lowpass: 4000 });
    tone(v, t + 0.06, { type: 'square', freq: 1319 * r, decay: 0.28, gain: 0.12, lowpass: 4000 });
  },
  click: (v, t, r) => tone(v, t, { type: 'triangle', freq: 1800 * r, decay: 0.025, gain: 0.2 }),
  whoosh: (v, t, r) => noise(v, t, { attack: 0.12, decay: 0.3, gain: 0.35, filter: 'bandpass', freq: 300 * r, freqEnd: 3200 * r, q: 0.9 }),
  teleport: (v, t, r) => {
    tone(v, t, { freq: 220 * r, freqEnd: 1760 * r, glide: 0.6, attack: 0.05, decay: 0.7, gain: 0.2 });
    tone(v, t, { type: 'triangle', freq: 330 * r, freqEnd: 2640 * r, glide: 0.6, attack: 0.05, decay: 0.7, gain: 0.1 });
    noise(v, t, { attack: 0.3, decay: 0.5, gain: 0.15, filter: 'highpass', freq: 4000 });
  },
  burp: (v, t, r) => {
    const { ctx } = v;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95 * r, t);
    osc.frequency.linearRampToValueAtTime(70 * r, t + 0.45);
    const wob = ctx.createOscillator();
    wob.frequency.value = 22;
    const wg = ctx.createGain();
    wg.gain.value = 18;
    wob.connect(wg);
    wg.connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(f);
    f.connect(g);
    g.connect(v.out);
    osc.start(t);
    wob.start(t);
    osc.stop(t + 0.55);
    wob.stop(t + 0.55);
  },
  dice: (v, t, r) => {
    for (let i = 0; i < 7; i++) {
      noise(v, t + i * 0.07 + Math.random() * 0.04, { decay: 0.035, gain: 0.3, filter: 'bandpass', freq: (2200 + Math.random() * 1500) * r, q: 3 });
    }
  },
  wheel_tick: (v, t, r) => {
    tone(v, t, { type: 'square', freq: 2200 * r, decay: 0.018, gain: 0.12, lowpass: 5000 });
    noise(v, t, { decay: 0.012, gain: 0.15, filter: 'highpass', freq: 4000 });
  },
  airhorn: (v, t, r) => {
    const blasts: [number, number][] = [
      [0, 0.32],
      [0.38, 0.12],
      [0.56, 0.12],
      [0.74, 0.6],
    ];
    for (const [off, len] of blasts) {
      for (const d of [0, 8, -10]) {
        tone(v, t + off, { type: 'sawtooth', freq: 415 * r, freqEnd: 440 * r, glide: 0.08, attack: 0.02, decay: len, gain: 0.07, detune: d, lowpass: 3200 });
        tone(v, t + off, { type: 'sawtooth', freq: 523 * r, attack: 0.02, decay: len, gain: 0.05, detune: d, lowpass: 3200 });
      }
    }
  },
  drop: (v, t) => {
    noise(v, t, { attack: 0.45, decay: 0.08, gain: 0.35, filter: 'bandpass', freq: 400, freqEnd: 6000, q: 1.2 });
    tone(v, t + 0.5, { freq: 130, freqEnd: 32, glide: 0.9, decay: 1.4, gain: 1 });
    noise(v, t + 0.5, { decay: 0.6, gain: 0.4, filter: 'lowpass', freq: 400 });
  },
  shaker: (v, t, r) => {
    for (let i = 0; i < 4; i++) noise(v, t + i * 0.11, { attack: 0.01, decay: 0.06, gain: 0.2, filter: 'highpass', freq: 6000 * r });
  },
  cheer: (v, t) => {
    for (let i = 0; i < 10; i++) {
      noise(v, t + Math.random() * 0.5, { attack: 0.15, decay: 0.9, gain: 0.07, filter: 'bandpass', freq: 600 + Math.random() * 1800, q: 2.5 });
    }
    for (let i = 0; i < 4; i++) {
      const f = 380 + Math.random() * 300;
      tone(v, t + Math.random() * 0.4, { type: 'sawtooth', freq: f, freqEnd: f * 1.5, glide: 0.4, attack: 0.05, decay: 0.5, gain: 0.04, lowpass: 1600 });
    }
  },
  fire: (v, t) => {
    noise(v, t, { attack: 0.1, decay: 0.9, gain: 0.15, filter: 'lowpass', freq: 400 });
    for (let i = 0; i < 8; i++) noise(v, t + Math.random() * 0.9, { decay: 0.02, gain: 0.25, filter: 'highpass', freq: 2500 + Math.random() * 3000 });
  },
  sizzle: (v, t) => {
    noise(v, t, { attack: 0.05, decay: 0.9, gain: 0.18, filter: 'highpass', freq: 5000 });
    for (let i = 0; i < 6; i++) noise(v, t + Math.random() * 0.8, { decay: 0.03, gain: 0.12, filter: 'highpass', freq: 7000 });
  },
  chant_hum: (v, t, r) => {
    for (const [n, gn] of [
      [45, 0.12],
      [52, 0.08],
      [57, 0.06],
    ] as const) {
      tone(v, t, { type: 'sawtooth', freq: mtof(n) * r, attack: 0.3, decay: 1.4, gain: gn, lowpass: 700 });
    }
  },
  gong: (v, t, r) => {
    metalBell(v, t, 68 * r, 0.4, 4, [
      [1, 0.7],
      [1.52, 0.45],
      [2.1, 0.4],
      [2.82, 0.25],
      [3.47, 0.2],
      [4.6, 0.1],
    ]);
    noise(v, t, { decay: 0.4, gain: 0.25, filter: 'lowpass', freq: 1200 });
  },
};
