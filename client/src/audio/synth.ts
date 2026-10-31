// Khối dựng âm thanh tổng hợp (Web Audio): dao động, nhiễu, đường bao, nhạc cụ trống/bass/hợp âm.
// Không có file âm thanh nào — mọi tiếng đều sinh bằng code.

export interface Voice {
  ctx: AudioContext;
  out: AudioNode;
}

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

/** Bộ đệm nhiễu trắng 2 giây (cache theo AudioContext). */
export function noiseBuffer(ctx: AudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** Hàm âm sắc (tần số) theo nốt MIDI. */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function gainNode(ctx: AudioContext, value: number, dest: AudioNode): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(dest);
  return g;
}

/** Đường bao: 0 → peak (attack) → 0.0001 (decay), dạng mũ. */
export function envAD(param: AudioParam, t: number, attack: number, decay: number, peak: number): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, attack));
  param.exponentialRampToValueAtTime(0.0001, t + attack + Math.max(0.01, decay));
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Tần số cuối (trượt mũ). */
  freqEnd?: number;
  glide?: number;
  attack?: number;
  decay: number;
  gain: number;
  detune?: number;
  pan?: number;
  /** Lọc thông thấp (Hz). */
  lowpass?: number;
}

export function tone(v: Voice, t: number, o: ToneOpts): OscillatorNode {
  const { ctx } = v;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + (o.glide ?? o.decay));
  if (o.detune) osc.detune.value = o.detune;
  const g = ctx.createGain();
  envAD(g.gain, t, o.attack ?? 0.004, o.decay, o.gain);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lowpass;
    node.connect(f);
    node = f;
  }
  node.connect(g);
  if (o.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = o.pan;
    g.connect(p);
    p.connect(v.out);
  } else {
    g.connect(v.out);
  }
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.004) + o.decay + 0.05);
  return osc;
}

export interface NoiseOpts {
  attack?: number;
  decay: number;
  gain: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  /** Tốc độ phát bộ đệm nhiễu (đổi màu nhiễu). */
  rate?: number;
}

export function noise(v: Voice, t: number, o: NoiseOpts): AudioBufferSourceNode {
  const { ctx } = v;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.playbackRate.value = o.rate ?? 1;
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 2000, t);
  if (o.freqEnd !== undefined) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + (o.attack ?? 0.002) + o.decay);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  envAD(g.gain, t, o.attack ?? 0.002, o.decay, o.gain);
  src.connect(f);
  f.connect(g);
  g.connect(v.out);
  const offset = Math.random() * 1.5;
  src.start(t, offset);
  src.stop(t + (o.attack ?? 0.002) + o.decay + 0.05);
  return src;
}

// ───────────────────────── Nhạc cụ ─────────────────────────

export function kick(v: Voice, t: number, gain = 1, punch = 1): void {
  tone(v, t, { freq: 160 * punch, freqEnd: 42, glide: 0.13, decay: 0.42, gain: 0.95 * gain });
  tone(v, t, { type: 'triangle', freq: 1200, freqEnd: 200, glide: 0.02, decay: 0.03, gain: 0.25 * gain });
}

export function snare(v: Voice, t: number, gain = 1): void {
  noise(v, t, { decay: 0.18, gain: 0.55 * gain, filter: 'bandpass', freq: 1900, q: 0.7 });
  tone(v, t, { type: 'triangle', freq: 210, freqEnd: 150, decay: 0.1, gain: 0.35 * gain });
}

export function clap(v: Voice, t: number, gain = 1): void {
  for (let i = 0; i < 3; i++) noise(v, t + i * 0.011, { decay: 0.03, gain: 0.4 * gain, filter: 'bandpass', freq: 1300, q: 1.2 });
  noise(v, t + 0.034, { decay: 0.17, gain: 0.45 * gain, filter: 'bandpass', freq: 1200, q: 0.9 });
}

export function hat(v: Voice, t: number, open = false, gain = 1): void {
  noise(v, t, { decay: open ? 0.26 : 0.045, gain: (open ? 0.22 : 0.18) * gain, filter: 'highpass', freq: 7200, q: 0.6 });
}

export function woodblock(v: Voice, t: number, freq = 640, gain = 1): void {
  tone(v, t, { type: 'sine', freq: freq * 1.02, freqEnd: freq * 0.86, glide: 0.06, decay: 0.11, gain: 0.7 * gain });
  tone(v, t, { type: 'triangle', freq: freq * 2.3, decay: 0.035, gain: 0.18 * gain });
  noise(v, t, { decay: 0.02, gain: 0.25 * gain, filter: 'bandpass', freq: freq * 3, q: 3 });
}

export interface SynthNoteOpts {
  type?: OscillatorType;
  attack?: number;
  release?: number;
  gain: number;
  cutoff?: number;
  cutoffEnd?: number;
  q?: number;
  detunes?: number[];
}

/** Nốt có thân (sustain) qua bộ lọc thông thấp — bass, pad, hợp âm. */
export function synthNote(v: Voice, t: number, freq: number, dur: number, o: SynthNoteOpts): void {
  const { ctx } = v;
  const attack = o.attack ?? 0.01;
  const release = o.release ?? 0.12;
  const end = t + dur + release;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.cutoff ?? 2000, t);
  if (o.cutoffEnd !== undefined) f.frequency.exponentialRampToValueAtTime(o.cutoffEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.gain, t + attack);
  g.gain.setValueAtTime(o.gain, t + Math.max(attack, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  f.connect(g);
  g.connect(v.out);
  for (const d of o.detunes ?? [0]) {
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = d;
    osc.connect(f);
    osc.start(t);
    osc.stop(end + 0.02);
  }
}

export function chord(v: Voice, t: number, notes: number[], dur: number, o: SynthNoteOpts): void {
  for (const n of notes) synthNote(v, t, mtof(n), dur, { ...o, gain: o.gain / Math.sqrt(notes.length) });
}

/** Dây gảy (đàn tranh giản lược): tam giác tắt nhanh + bồi âm. */
export function pluck(v: Voice, t: number, freq: number, gain = 0.3, decay = 1.2): void {
  tone(v, t, { type: 'triangle', freq, decay, gain, lowpass: 3200 });
  tone(v, t, { type: 'sine', freq: freq * 2, decay: decay * 0.5, gain: gain * 0.35 });
  tone(v, t, { type: 'sine', freq: freq * 3.01, decay: decay * 0.25, gain: gain * 0.12 });
}

/** Chuông kim loại: các họa âm không điều hòa, tắt chậm. */
export function metalBell(v: Voice, t: number, f0: number, gain: number, decay: number, partials: [number, number][]): void {
  for (const [ratio, amp] of partials) {
    tone(v, t, { freq: f0 * ratio, attack: 0.003, decay: decay * (1.1 - Math.min(0.8, ratio / 8)), gain: gain * amp });
    tone(v, t, { freq: f0 * ratio * 1.003, attack: 0.003, decay: decay * 0.8, gain: gain * amp * 0.4 });
  }
}

/** Đáp ứng xung giả lập phòng vang (cho chuông, mõ trong chùa). */
export function impulseResponse(ctx: AudioContext, seconds: number, decayPow: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decayPow);
  }
  return buf;
}
