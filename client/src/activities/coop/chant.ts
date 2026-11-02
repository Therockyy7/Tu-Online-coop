// Công phu tụng kinh (client) — kiểu osu! × Audition:
// vòng tròn đánh số hiện theo dòng chảy trên "sân khấu", vòng tiếp cận co lại; bấm đúng mũi tên (← ↑ → ↓ / W A S D)
// đúng lúc vòng khép; nốt ngân phải giữ phím tới đuôi; cuối mỗi câu gõ Khánh (Space) đúng phách.
// Client chấm tạm ngay bằng cùng hàm matchChantPress với server để phản hồi tức thì; combo cả đội theo server.
import './chant.css';
import { CHANT, type Judgement } from '@shared/index';
import {
  CHANT_KHANH,
  chantChart,
  chantHoldBroken,
  matchChantPress,
  oppositeChantKey,
  type ChantChart,
  type ChantKey,
  type ChantNote,
  type ChantPublicState,
} from '@shared/activities/coop';
import type { OverlayHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

const TEMPO_LABEL: Record<number, string> = { 0.85: 'Chậm', 1: 'Vừa', 1.15: 'Nhanh' };

/** Phím → nốt: mũi tên hoặc W A S D gõ mõ, Space (hoặc J) gõ Khánh. */
const KEY_OF: Record<string, ChantKey> = {
  ArrowLeft: 0,
  KeyA: 0,
  ArrowUp: 1,
  KeyW: 1,
  ArrowRight: 2,
  KeyD: 2,
  ArrowDown: 3,
  KeyS: 3,
  Space: 4,
  KeyJ: 4,
};
const KEY_GLYPH = ['←', '↑', '→', '↓', '␣'] as const;
/** Góc xoay mũi tên (SVG gốc chỉ lên). */
const KEY_ROT = [-90, 0, 90, 180] as const;
/** Cao độ tiếng mõ theo hướng — gõ đúng chuỗi nghe như một giai điệu. */
const KEY_RATE = [0.9, 1.12, 1, 0.8] as const;
/** Màu từng câu kinh (như màu combo của osu!): nghệ, ngọc, sen hồng, trời, vàng. */
const SET_COLORS = ['#ff9f43', '#3fd0a0', '#ff7eb6', '#5cc2ff', '#c9a2ff'] as const;

const ARROW_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8 L90 50 H64 V92 H36 V50 H10 Z"/></svg>';
const KHANH_SVG =
  '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="40" rx="34" ry="8"/><path d="M16 40 Q16 82 50 82 Q84 82 84 40 Z"/><rect x="30" y="84" width="40" height="8" rx="4"/><rect x="66" y="10" width="8" height="34" rx="4" transform="rotate(38 70 27)"/></svg>';

const HIT_SCORE: Record<string, number> = { perfect: 300, good: 100 };

/** Chữ hạng kiểu osu! (SS..D) kèm lời khen vui. */
export function chantGrade(n300: number, n100: number, nMiss: number): { grade: string; caption: string } {
  const total = n300 + n100 + nMiss;
  if (total === 0) return { grade: 'D', caption: 'Chưa gõ tiếng nào…' };
  const r = n300 / total;
  if (n300 === total) return { grade: 'SS', caption: 'Phật độ! Không trượt một tiếng' };
  if (r > 0.9 && nMiss === 0) return { grade: 'S', caption: 'Đắc đạo!' };
  if ((r > 0.8 && nMiss === 0) || r > 0.9) return { grade: 'A', caption: 'Tinh tấn lắm!' };
  if ((r > 0.7 && nMiss === 0) || r > 0.8) return { grade: 'B', caption: 'Khá lắm, tu tiếp nhé' };
  if (r > 0.6) return { grade: 'C', caption: 'Tâm còn hơi động' };
  return { grade: 'D', caption: 'Tâm loạn rồi… niệm Phật lại nào' };
}

/** Độ chính xác kiểu osu! (0..1). */
const accuracyOf = (n300: number, n100: number, nMiss: number): number => {
  const total = n300 + n100 + nMiss;
  return total === 0 ? 1 : (n300 * 300 + n100 * 100) / (total * 300);
};

const pct = (v: number): string => `${(v * 100).toFixed(2).replace('.', ',')}%`;

interface NoteView {
  root: HTMLElement;
  ring: HTMLElement;
  slider?: HTMLElement;
  ball?: HTMLElement;
  tail?: HTMLElement;
}

interface NoteState {
  /** Kết quả đầu nốt (chấm tạm ở client). */
  j?: Judgement;
  /** Đang giữ nốt ngân. */
  holding?: boolean;
  /** Đã chốt điểm. */
  done?: boolean;
}

interface Teammate {
  pid: string;
  name: string;
  last: Judgement | null;
}

export interface ChantStats {
  sutra: string;
  tempo: string;
  score: number;
  n300: number;
  n100: number;
  nMiss: number;
  maxCombo: number;
  teamMax: number;
}

/** Màn chơi tụng kinh của người đang ngồi bồ đoàn: dựng DOM, chấm tạm, hiệu ứng. */
class ChantView {
  readonly overlay: OverlayHandle;
  private readonly field: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly fx: HTMLElement;
  private readonly center: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly prog: HTMLElement;
  private readonly hpBox: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly accEl: HTMLElement;
  private readonly pieEl: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly teamCombo: HTMLElement;
  private readonly teamList: HTMLElement;
  private readonly errBar: HTMLElement;
  private readonly keyEls: HTMLElement[] = [];
  private readonly keyCount = [0, 0, 0, 0, 0];

  private chart: ChantChart | null = null;
  private startAt = 0;
  private approach = 1000;
  private st: NoteState[] = [];
  private views = new Map<number, NoteView>();
  private follows = new Map<number, HTMLElement>();
  /** Nốt đầu tiên chưa chốt. */
  private cursor = 0;
  private lastCount = '';
  private teammates: Teammate[] = [];
  private teamMax = 0;

  n300 = 0;
  n100 = 0;
  nMiss = 0;
  combo = 0;
  maxCombo = 0;
  score = 0;
  private shownScore = 0;
  private hp = 1;
  private phraseClean = new Map<number, boolean>();
  sutraName = '';
  tempoLabel = '';

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly myPid: string,
  ) {
    this.overlay = ctx.ui.openOverlay('chant');
    const root = el('div', 'ch-root', this.overlay.el);
    el('div', 'ch-dim', root);
    const stage = el('div', 'ch-stage', root);

    const head = el('div', 'ch-head', stage);
    this.hpBox = el('div', 'ch-hp', head);
    el('div', 'ch-label', this.hpBox, '☸ Định lực');
    const hpBar = el('div', 'ch-hp-bar', this.hpBox);
    this.hpFill = el('div', 'ch-hp-fill', hpBar);
    const titleBox = el('div', 'ch-title', head);
    this.title = el('b', '', titleBox, 'Công phu tụng kinh');
    this.sub = el('span', '', titleBox, 'Chờ mọi người ngồi bồ đoàn…');
    const progBar = el('div', 'ch-prog', titleBox);
    this.prog = el('i', '', progBar);
    const scoreBox = el('div', 'ch-scorebox', head);
    this.scoreEl = el('div', 'ch-score', scoreBox, '00000000');
    this.accEl = el('div', 'ch-acc', scoreBox);
    this.pieEl = el('i', 'ch-pie', this.accEl);
    el('span', '', this.accEl, '100,00%');

    const team = el('div', 'ch-team', stage);
    this.teamCombo = el('div', 'ch-team-combo', team, 'Đồng điệu × 0');
    this.teamList = el('div', 'ch-team-list', team);

    this.field = el('div', 'ch-field', stage);
    el('div', 'ch-mandala', this.field);
    this.layer = el('div', 'ch-layer', this.field);
    this.fx = el('div', 'ch-layer', this.field);
    this.center = el('div', 'ch-center', this.field);
    this.comboEl = el('div', 'ch-combo', this.field);
    const keys = el('div', 'ch-keys', this.field);
    KEY_GLYPH.forEach((g, i) => {
      const k = el('div', `ch-k ${i === CHANT_KHANH ? 'khanh' : ''}`, keys);
      el('b', '', k, g);
      el('small', '', k, '0');
      this.keyEls.push(k);
    });

    const err = el('div', 'ch-err', stage);
    el('i', 'ch-err-good', err);
    el('i', 'ch-err-perfect', err);
    el('i', 'ch-err-mid', err);
    this.errBar = err;
    el(
      'div',
      'ch-hint',
      stage,
      'Mũi tên ← ↑ → ↓ (hoặc W A S D) đúng hướng khi vòng khép · mũi tên ĐỎ bấm ngược · giữ phím khi ngân · Space gõ Khánh cuối câu · Esc rời',
    );
    this.setCenter('🪷', 'Chờ thời khóa bắt đầu…');
  }

  get playing(): boolean {
    return this.chart !== null;
  }

  setLobby(text: string, sub: string): void {
    this.title.textContent = text;
    this.sub.textContent = sub;
  }

  setTeammates(list: { pid: string; name: string }[]): void {
    const prev = new Map(this.teammates.map((t) => [t.pid, t.last]));
    this.teammates = list.map((p) => ({ pid: p.pid, name: p.name, last: prev.get(p.pid) ?? null }));
    this.renderTeam();
  }

  private renderTeam(): void {
    this.teamList.replaceChildren();
    for (const t of this.teammates) {
      const chip = el('span', `ch-chip ${t.pid === this.myPid ? 'me' : ''} ${t.last ?? ''}`, this.teamList);
      el('i', '', chip);
      el('span', '', chip, t.name);
    }
  }

  private setCenter(big: string, small = '', cls = ''): void {
    this.center.replaceChildren();
    const box = el('div', `ch-msg ${cls}`, this.center);
    if (big) el('div', 'ch-msg-big', box, big);
    if (small) el('div', 'ch-msg-small', box, small);
  }

  begin(chart: ChantChart, startAt: number, sutraName: string, tempoLabel: string): void {
    this.clearNotes();
    this.chart = chart;
    this.startAt = startAt;
    this.sutraName = sutraName;
    this.tempoLabel = tempoLabel;
    const beatMs = 60_000 / chart.bpm;
    this.approach = Math.min(1200, Math.max(780, beatMs * 1.8));
    this.st = chart.notes.map(() => ({}));
    this.cursor = 0;
    this.n300 = this.n100 = this.nMiss = this.combo = this.maxCombo = this.score = this.shownScore = 0;
    this.hp = 1;
    this.phraseClean.clear();
    this.lastCount = '';
    this.title.textContent = sutraName;
    this.sub.textContent = `${tempoLabel} · ${Math.round(chart.bpm)} BPM · ${chart.notes.length} tiếng`;
    this.renderHud();
  }

  // ───────────── Mỗi khung hình ─────────────

  frame(now: number): void {
    const chart = this.chart;
    if (!chart) return;
    const rel = now - this.startAt;
    const notes = chart.notes;

    // Đếm ngược 3-2-1 trước phách đầu.
    if (rel < 0) {
      const c = String(Math.ceil(-rel / 1000));
      if (c !== this.lastCount) {
        this.lastCount = c;
        this.setCenter(c, rel < -2000 ? `📿 ${this.sutraName}` : 'Chuẩn bị…', 'count');
      }
    } else if (this.lastCount !== 'go' && this.lastCount !== 'none') {
      this.lastCount = 'go';
      this.setCenter('Nam Mô A Di Đà Phật', '', 'go');
      setTimeout(() => {
        if (this.lastCount === 'go') {
          this.lastCount = 'none';
          this.center.replaceChildren();
        }
      }, 900);
    }

    // Nốt không ai bấm: quá cửa sổ trật nhịp thì tính trượt (giống server).
    for (let i = this.cursor; i < notes.length; i++) {
      const n = notes[i]!;
      const s = this.st[i]!;
      if (s.done) continue;
      if (s.holding) {
        if (rel >= n.t + n.hold) this.resolve(i, s.j ?? 'good');
        continue;
      }
      if (s.j === undefined && rel > n.t + CHANT.strayMs) this.resolve(i, 'miss');
      else if (n.t - rel > CHANT.strayMs) break;
    }
    while (this.cursor < notes.length && this.st[this.cursor]!.done) this.cursor++;

    // Vẽ nốt trong tầm nhìn.
    const W = this.field.clientWidth;
    const H = this.field.clientHeight;
    for (let i = this.cursor; i < notes.length; i++) {
      const n = notes[i]!;
      const appear = n.t - this.approach;
      if (appear > rel) break;
      const s = this.st[i]!;
      if (s.done) continue;
      let v = this.views.get(i);
      if (!v) {
        v = this.makeNote(i, n, W, H);
        this.views.set(i, v);
      }
      const p = Math.min(1, Math.max(0, (rel - appear) / this.approach));
      v.root.style.opacity = s.holding ? '1' : String(Math.min(1, p / 0.3));
      if (!s.holding) {
        v.ring.style.transform = `scale(${1 + 2.3 * (1 - p)})`;
        v.ring.style.opacity = String(Math.min(0.95, p * 2.4));
      }
      if (v.slider && v.ball) {
        this.layoutSlider(n, v, W, H);
        const k = s.holding ? Math.min(1, Math.max(0, (rel - n.t) / n.hold)) : 0;
        v.ball.style.left = `${(n.x + (n.x2 - n.x) * k) * 100}%`;
        v.ball.style.top = `${(n.y + (n.y2 - n.y) * k) * 100}%`;
        v.slider.style.opacity = s.holding ? '1' : String(Math.min(0.9, p / 0.3));
      }
      // Chấm nối kiểu osu! từ nốt trước (cùng câu) tới nốt này.
      const prev = notes[i - 1];
      if (prev && prev.phrase === n.phrase && !this.follows.has(i) && p < 0.92) this.follows.set(i, this.makeFollow(prev, n, W, H));
      const f = this.follows.get(i);
      if (f) f.style.opacity = String(Math.min(0.85, p * 2) * (1 - Math.max(0, (p - 0.7) / 0.3)));
    }
    for (const [i, f] of this.follows) {
      const n = notes[i]!;
      if (rel > n.t || this.st[i]!.done) {
        f.remove();
        this.follows.delete(i);
      }
    }

    // Thanh tiến độ bài + điểm chạy dần.
    const last = notes[notes.length - 1];
    if (last) this.prog.style.width = `${Math.min(100, Math.max(0, (rel / (last.t + last.hold)) * 100))}%`;
    if (this.shownScore !== this.score) {
      this.shownScore = this.score - this.shownScore < 8 ? this.score : Math.round(this.shownScore + (this.score - this.shownScore) * 0.25);
      this.scoreEl.textContent = String(this.shownScore).padStart(8, '0');
    }
  }

  private makeNote(i: number, n: ChantNote, W: number, H: number): NoteView {
    const color = n.key === CHANT_KHANH ? '#ffd166' : SET_COLORS[n.phrase % SET_COLORS.length]!;
    let slider: HTMLElement | undefined;
    let ball: HTMLElement | undefined;
    let tail: HTMLElement | undefined;
    if (n.hold > 0) {
      slider = el('div', 'ch-slider', this.layer);
      slider.style.setProperty('--c', color);
      tail = el('div', 'ch-tail', this.layer);
      tail.style.setProperty('--c', color);
      tail.style.left = `${n.x2 * 100}%`;
      tail.style.top = `${n.y2 * 100}%`;
      ball = el('div', 'ch-ball', this.layer);
      ball.style.setProperty('--c', color);
    }
    const root = el('div', `ch-note ${n.key === CHANT_KHANH ? 'khanh' : ''} ${n.rev ? 'rev' : ''} ${n.hold ? 'hold' : ''}`, this.layer);
    root.style.setProperty('--c', n.rev ? '#ff5a4f' : color);
    root.style.left = `${n.x * 100}%`;
    root.style.top = `${n.y * 100}%`;
    root.style.zIndex = String(10_000 - i);
    const ring = el('div', 'ch-ring', root);
    const body = el('div', 'ch-body', root);
    if (n.key === CHANT_KHANH) {
      body.innerHTML = KHANH_SVG;
      el('div', 'ch-tag', root, 'SPACE');
    } else {
      body.innerHTML = ARROW_SVG;
      const shown = n.rev ? oppositeChantKey(n.key) : n.key;
      const svg = body.firstElementChild as SVGElement | null;
      if (svg) svg.style.transform = `rotate(${KEY_ROT[shown as 0 | 1 | 2 | 3]}deg)`;
      if (n.rev) el('div', 'ch-tag rev', root, 'NGƯỢC');
      else if (n.hold) el('div', 'ch-tag hold', root, 'GIỮ');
    }
    el('div', 'ch-num', root, String(n.n));
    const v: NoteView = { root, ring, slider, ball, tail };
    if (slider) this.layoutSlider(n, v, W, H);
    return v;
  }

  private layoutSlider(n: ChantNote, v: NoteView, W: number, H: number): void {
    if (!v.slider) return;
    const dx = (n.x2 - n.x) * W;
    const dy = (n.y2 - n.y) * H;
    const len = Math.hypot(dx, dy);
    const d = W * 0.09;
    v.slider.style.left = `${n.x * 100}%`;
    v.slider.style.top = `${n.y * 100}%`;
    v.slider.style.width = `${len + d}px`;
    v.slider.style.transform = `translate(${-d / 2}px, -50%) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  private makeFollow(a: ChantNote, b: ChantNote, W: number, H: number): HTMLElement {
    const ax = a.x2 * W;
    const ay = a.y2 * H;
    const dx = b.x * W - ax;
    const dy = b.y * H - ay;
    const len = Math.hypot(dx, dy);
    const r = W * 0.055;
    const f = el('div', 'ch-follow', this.fx);
    f.style.left = `${ax + (dx / Math.max(1, len)) * r}px`;
    f.style.top = `${ay + (dy / Math.max(1, len)) * r}px`;
    f.style.width = `${Math.max(0, len - r * 2)}px`;
    f.style.transform = `translateY(-50%) rotate(${Math.atan2(dy, dx)}rad)`;
    f.style.opacity = '0';
    return f;
  }

  private removeView(i: number, cls: string, delayMs: number): void {
    const v = this.views.get(i);
    if (!v) return;
    this.views.delete(i);
    v.root.classList.add(cls);
    v.ring.style.opacity = '0';
    const parts = [v.slider, v.ball, v.tail].filter((x): x is HTMLElement => !!x);
    for (const p of parts) p.classList.add(cls === 'hit' ? 'fade' : 'miss');
    setTimeout(() => {
      v.root.remove();
      for (const p of parts) p.remove();
    }, delayMs);
  }

  private popup(x: number, y: number, text: string, cls: string): void {
    const p = el('div', `ch-pop ${cls}`, this.fx, text);
    p.style.left = `${x * 100}%`;
    p.style.top = `${y * 100}%`;
    setTimeout(() => p.remove(), cls === 'zen' ? 1200 : 700);
  }

  private burst(x: number, y: number, color: string): void {
    const b = el('div', 'ch-burst', this.fx);
    b.style.left = `${x * 100}%`;
    b.style.top = `${y * 100}%`;
    b.style.setProperty('--c', color);
    for (let k = 0; k < 6; k++) {
      const petal = el('i', '', b);
      petal.style.setProperty('--a', `${k * 60 + Math.random() * 30}deg`);
    }
    setTimeout(() => b.remove(), 600);
  }

  // ───────────── Bấm / thả phím ─────────────

  keyVisual(k: ChantKey, down: boolean): void {
    const e = this.keyEls[k];
    if (!e) return;
    e.classList.toggle('on', down);
    if (down) {
      const n = (this.keyCount[k] ?? 0) + 1;
      this.keyCount[k] = n;
      const small = e.querySelector('small');
      if (small) small.textContent = String(n);
    }
  }

  /** Chấm tạm một cú bấm (giống server). Trả kết quả để module phát âm thanh. */
  press(k: ChantKey, t: number): { note?: ChantNote; j: Judgement | 'stray' } {
    const chart = this.chart;
    if (!chart) return { j: 'stray' };
    const rel = t - this.startAt;
    const m = matchChantPress(chart.notes, this.cursor, (i) => this.st[i]!.j !== undefined, rel, k);
    if (!m) {
      this.stray(rel);
      return { j: 'stray' };
    }
    const n = chart.notes[m.i]!;
    const s = this.st[m.i]!;
    s.j = m.j;
    if (!m.wrongKey) this.markError(rel - n.t);
    if (m.j === 'miss') {
      this.resolve(m.i, 'miss', m.wrongKey ? 'Sai phím!' : undefined);
    } else if (n.hold > 0) {
      s.holding = true;
      const v = this.views.get(m.i);
      if (v) {
        v.root.classList.add('holding');
        v.ring.style.opacity = '0';
        v.ball?.classList.add('on');
      }
      this.burst(n.x, n.y, SET_COLORS[n.phrase % SET_COLORS.length]!);
    } else {
      this.resolve(m.i, m.j);
    }
    return { note: n, j: m.j };
  }

  /** Thả phím: nốt ngân đang giữ cùng phím → chốt (thả sớm = đứt hơi). Trả true nếu có nốt ngân bị ảnh hưởng. */
  release(k: ChantKey, t: number): boolean {
    const chart = this.chart;
    if (!chart) return false;
    const rel = t - this.startAt;
    for (let i = this.cursor; i < chart.notes.length; i++) {
      const s = this.st[i]!;
      const n = chart.notes[i]!;
      if (!s.holding || n.key !== k) continue;
      if (chantHoldBroken(n, rel)) this.resolve(i, 'miss', 'Đứt hơi!');
      else this.resolve(i, s.j ?? 'good');
      return true;
    }
    return false;
  }

  holdingKey(k: ChantKey): boolean {
    const chart = this.chart;
    if (!chart) return false;
    for (let i = this.cursor; i < chart.notes.length; i++) if (this.st[i]!.holding && chart.notes[i]!.key === k) return true;
    return false;
  }

  private stray(rel: number): void {
    const chart = this.chart!;
    const next = chart.notes.slice(this.cursor).find((n) => n.t > rel) ?? chart.notes[chart.notes.length - 1];
    if (next) this.popup(next.x, next.y - 0.09, 'Trật nhịp!', 'miss small');
    this.breakCombo();
    this.hp = Math.max(0, this.hp - 0.05);
    this.renderHud();
  }

  private breakCombo(): void {
    if (this.combo >= 10) {
      this.field.classList.remove('shake');
      void this.field.offsetWidth;
      this.field.classList.add('shake');
    }
    this.combo = 0;
  }

  /** Chốt điểm một nốt (cục bộ). */
  private resolve(i: number, j: Judgement, label?: string): void {
    const n = this.chart!.notes[i]!;
    const s = this.st[i]!;
    if (s.done) return;
    s.done = true;
    s.holding = false;
    const px = n.hold > 0 ? n.x2 : n.x;
    const py = n.hold > 0 ? n.y2 : n.y;
    if (j === 'perfect' || j === 'good') {
      if (j === 'perfect') this.n300++;
      else this.n100++;
      this.score += Math.round(HIT_SCORE[j]! * (1 + this.combo / 25));
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.hp = Math.min(1, this.hp + (j === 'perfect' ? 0.035 : 0.012));
      const color = n.key === CHANT_KHANH ? '#ffd166' : SET_COLORS[n.phrase % SET_COLORS.length]!;
      this.removeView(i, 'hit', 260);
      this.burst(px, py, color);
      if (j !== 'perfect') this.phraseClean.set(n.phrase, false);
      if (n.end && this.phraseClean.get(n.phrase) !== false) {
        this.popup(px, py, '善 Thiện tai!', 'zen');
        this.ctx.audio.play('pop', { rate: 1.3, volume: 0.6 });
      } else {
        this.popup(px, py, j === 'perfect' ? '300' : '100', j === 'perfect' ? 'p300' : 'p100');
      }
      this.comboEl.classList.remove('bump');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('bump');
    } else {
      this.nMiss++;
      this.phraseClean.set(n.phrase, false);
      this.breakCombo();
      this.hp = Math.max(0, this.hp - 0.09);
      this.removeView(i, 'miss', 320);
      this.popup(px, py, label ?? '✕', label ? 'miss small' : 'miss');
    }
    const f = this.follows.get(i);
    if (f) {
      f.remove();
      this.follows.delete(i);
    }
    this.renderHud();
  }

  private markError(delta: number): void {
    const tick = el('i', `ch-err-tick ${Math.abs(delta) <= CHANT.perfectMs ? 'p' : 'g'}`, this.errBar);
    tick.style.left = `${50 + Math.max(-1, Math.min(1, delta / CHANT.strayMs)) * 50}%`;
    setTimeout(() => tick.remove(), 2600);
  }

  private renderHud(): void {
    const acc = accuracyOf(this.n300, this.n100, this.nMiss);
    const span = this.accEl.lastElementChild;
    if (span) span.textContent = pct(acc);
    this.pieEl.style.setProperty('--p', `${acc * 100}%`);
    this.comboEl.textContent = this.combo > 0 ? `${this.combo}x` : '';
    this.hpFill.style.transform = `scaleX(${this.hp})`;
    this.hpBox.classList.toggle('low', this.hp < 0.3);
  }

  // ───────────── Cả đội (theo server) ─────────────

  teamNote(results: Record<string, Judgement>, combo: number): void {
    this.teamMax = Math.max(this.teamMax, combo);
    for (const t of this.teammates) if (results[t.pid]) t.last = results[t.pid]!;
    this.renderTeam();
    this.teamCombo.textContent = `Đồng điệu × ${combo}`;
    this.teamCombo.className = `ch-team-combo ${combo >= CHANT.comboForHaoQuang ? 'gold' : combo > 0 ? 'on' : ''}`;
    this.field.classList.toggle('aura', combo >= CHANT.comboForHaoQuang);
  }

  teamBreak(names: string[], mine: boolean): void {
    this.teamCombo.textContent = `Bongggg! ${names.join(', ')} lệch nhịp`;
    this.teamCombo.className = 'ch-team-combo broken';
    this.field.classList.remove('aura');
    if (mine) this.ctx.ui.screenFx.flash('rgba(255, 59, 48, 0.55)');
  }

  stats(): ChantStats {
    return {
      sutra: this.sutraName,
      tempo: this.tempoLabel,
      score: this.score,
      n300: this.n300,
      n100: this.n100,
      nMiss: this.nMiss,
      maxCombo: this.maxCombo,
      teamMax: this.teamMax,
    };
  }

  private clearNotes(): void {
    for (const v of this.views.values()) {
      v.root.remove();
      v.slider?.remove();
      v.ball?.remove();
      v.tail?.remove();
    }
    this.views.clear();
    for (const f of this.follows.values()) f.remove();
    this.follows.clear();
  }

  dispose(): void {
    this.clearNotes();
    this.chart = null;
    this.overlay.close();
  }
}

/** Bảng xếp hạng cuối bài (giữ vài giây sau khi đứng dậy khỏi bồ đoàn). */
function showResult(ctx: ClientActivityContext, s: ChantStats): OverlayHandle {
  const overlay = ctx.ui.openOverlay('chant-result');
  const card = el('div', 'ch-result', overlay.el);
  const { grade, caption } = chantGrade(s.n300, s.n100, s.nMiss);
  const g = el('div', `ch-grade g-${grade}`, card, grade);
  g.setAttribute('aria-label', `Hạng ${grade}`);
  const info = el('div', 'ch-rinfo', card);
  el('div', 'ch-rtitle', info, `📿 ${s.sutra}`);
  el('div', 'ch-rcap', info, `${s.tempo} · ${caption}`);
  el('div', 'ch-rscore', info, String(s.score).padStart(8, '0'));
  const row = el('div', 'ch-rrow', info);
  for (const [label, n, cls] of [
    ['300', s.n300, 'p300'],
    ['100', s.n100, 'p100'],
    ['✕', s.nMiss, 'miss'],
  ] as const) {
    const c = el('span', 'ch-rcell', row);
    el('b', cls, c, label);
    el('span', '', c, `× ${n}`);
  }
  el('div', 'ch-rmeta', info, `Độ chính xác ${pct(accuracyOf(s.n300, s.n100, s.nMiss))} · Combo ${s.maxCombo}x · Đồng điệu cả đội ${s.teamMax}`);
  return overlay;
}

// ───────────────────────── Module ─────────────────────────

let chant: ChantPublicState | null = null;
let chart: ChantChart | null = null;
let chantCtx: ClientActivityContext | null = null;
let seated = false;
let view: ChantView | null = null;
let result: { overlay: OverlayHandle; timer: ReturnType<typeof setTimeout> } | null = null;
let leadScheduled = -1;
let chooserAsked = '';
let chooserAbort: AbortController | null = null;
let strikeUntil = 0;
let lobbyShown = '';

function sutraOf(id: string) {
  return CHANT.sutras.find((x) => x.id === id) ?? CHANT.sutras[0]!;
}

/** Dòng phụ ở sảnh chờ: bài, nhịp, số giây còn lại để mọi người ngồi vào bồ đoàn. */
function showLobby(ctx: ClientActivityContext): void {
  if (!view || !chant) return;
  if (chant.phase === 'idle') {
    // Ngồi chờ trước khi có thời khóa.
    const host = ctx.state.me.isHost;
    const key = `idle:${host}`;
    if (key === lobbyShown) return;
    lobbyShown = key;
    view.setLobby(
      '📿 Ngồi chờ thời khóa',
      host ? 'Bấm H → Bắt đầu thời khóa tụng kinh · Esc để đứng dậy' : 'Chờ Phương Trượng mở thời khóa tụng kinh · Esc để đứng dậy',
    );
    return;
  }
  if (chant.phase !== 'lobby') return;
  const def = sutraOf(chant.sutraId);
  const left = Math.max(0, Math.ceil((chant.lobbyEndsAt - ctx.serverNow()) / 1000));
  const key = `${def.id}:${chant.tempo}:${left}:${chant.participants.length}`;
  if (key === lobbyShown) return;
  lobbyShown = key;
  const chooserHint = chant.chooserPid === ctx.state.me.pid ? ' · K: chọn bài kinh' : '';
  view.setLobby(def.name, `${TEMPO_LABEL[chant.tempo] ?? ''} · ${def.bpm} BPM — ${chant.participants.length} người đã ngồi · bắt đầu sau ${left}s${chooserHint}`);
}

function closeResult(): void {
  if (!result) return;
  clearTimeout(result.timer);
  result.overlay.close();
  result = null;
}

function stand(ctx: ClientActivityContext): void {
  view?.dispose();
  view = null;
  seated = false;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
}

function beginIfReady(): void {
  if (!view || !chant || chant.phase !== 'playing' || !chart || view.playing) return;
  view.begin(chart, chant.startAt, sutraOf(chant.sutraId).name, TEMPO_LABEL[chant.tempo] ?? `×${chant.tempo}`);
  view.setTeammates(chant.participants);
}

async function askChooser(ctx: ClientActivityContext): Promise<void> {
  cancelChooser();
  const abort = new AbortController();
  chooserAbort = abort;
  const sutra = await ctx.ui.choose({
    title: '📿 Bạn là người chọn kinh — chọn bài',
    options: CHANT.sutras.map((s) => ({
      value: s.id,
      label: s.name,
      sub: `${s.bpm} BPM · ${s.arrows === 2 ? 'chỉ ← →, nhiều nốt ngân' : s.reverse > 0 ? '4 hướng, móc đơn, mũi tên đỏ' : '4 hướng, có móc đơn'}`,
      icon: s.arrows === 2 ? '🌱' : s.reverse > 0 ? '🔥' : '📜',
    })),
    signal: abort.signal,
  });
  if (!sutra) return;
  const tempo = await ctx.ui.choose({
    title: 'Chọn nhịp',
    options: CHANT.tempos.map((t) => ({ value: String(t), label: TEMPO_LABEL[t] ?? `×${t}`, sub: `×${t}`, icon: t < 1 ? '🐢' : t > 1 ? '🐇' : '🙂' })),
    signal: abort.signal,
  });
  if (tempo && !abort.signal.aborted) ctx.send('choose', { sutra, tempo: Number(tempo) });
  if (chooserAbort === abort) chooserAbort = null;
}

/** Hết giờ chờ / không còn là người chọn → đóng hộp chọn kinh đang mở. */
function cancelChooser(): void {
  chooserAbort?.abort();
  chooserAbort = null;
}

export const chantClient: ActivityClientModule = {
  id: 'chant',
  maps: ['temple'],
  mount(ctx) {
    chantCtx = ctx;
  },
  prompt(station, ctx) {
    if (station.kind !== 'mo_cushion') return undefined;
    if (seated) return null;
    const me = ctx.state.me;
    const phase = chant?.phase ?? 'idle';
    if (phase === 'playing' || phase === 'result') return 'Thời khóa đang diễn ra';
    if (chant?.participants.some((p) => p.cushion === station.id)) return 'Bồ đoàn có người ngồi';
    if (phase === 'lobby') return 'Ngồi gõ mõ tụng kinh';
    // Chưa có thời khóa: Phương Trượng ngồi là mở luôn, người khác ngồi chờ.
    return me.isHost ? 'Ngồi & bắt đầu thời khóa tụng kinh' : 'Ngồi bồ đoàn chờ thời khóa';
  },
  hostMenuItems() {
    const idle = !chant || chant.phase === 'idle';
    return [
      {
        id: 'chant_start',
        icon: '📿',
        label: 'Bắt đầu thời khóa tụng kinh',
        sub: 'Chuông vang, 20 giây vào Chánh Điện ngồi gõ mõ',
        disabled: !idle,
        reason: 'Đang có thời khóa',
        run: () => chantCtx?.send('start'),
      },
    ];
  },
  onState(s, ctx) {
    const prev = chant;
    chant = s as ChantPublicState;
    if (chant.phase === 'lobby' && chant.chooserPid === ctx.state.me.pid && chooserAsked !== `${chant.seed}`) {
      chooserAsked = `${chant.seed}`;
      void askChooser(ctx);
    } else if (chant.phase !== 'lobby' || chant.chooserPid !== ctx.state.me.pid) cancelChooser();
    if (chant.phase === 'playing' && prev?.phase !== 'playing') {
      chart = chantChart(chant.sutraId, chant.tempo, chant.seed);
      leadScheduled = -1;
      ctx.audio.startBeatTrack('chant_lofi', chant.startAt, chart.bpm);
    }
    if (chant.phase !== 'playing' && prev?.phase === 'playing') ctx.audio.stopBeatTrack();
    if (view) {
      view.setTeammates(chant.participants);
      showLobby(ctx);
      beginIfReady();
    }
  },
  onOpen(data, ctx) {
    const d = data as { cushion: string };
    const st = ctx.world.map.stations.find((s) => s.id === d.cushion);
    if (st) ctx.snapTo(st.x, st.z, st.ry);
    ctx.lockMovement(true);
    ctx.setLocalAnim('sit');
    seated = true;
    closeResult();
    view?.dispose();
    view = new ChantView(ctx, ctx.state.me.pid);
    lobbyShown = '';
    if (chant) view.setTeammates(chant.participants);
    showLobby(ctx);
    beginIfReady();
  },
  onClose(reason, ctx) {
    const stats = reason === 'done' && view?.playing ? view.stats() : null;
    stand(ctx);
    if (stats) {
      closeResult();
      const overlay = showResult(ctx, stats);
      result = { overlay, timer: setTimeout(closeResult, 9000) };
    }
  },
  onEvent(type, data, ctx) {
    if (!view) return;
    if (type === 'break') {
      const d = data as { blame: string[]; broke?: boolean };
      // Chưa có combo thì không làm ồn — chỉ người lỡ nốt thấy "✕" tại nốt (đã chấm tạm ở client).
      if (!d.broke) return;
      const names = d.blame.map((pid) => ctx.state.player(pid)?.name ?? '?');
      view.teamBreak(names, d.blame.includes(ctx.state.me.pid));
    } else if (type === 'note') {
      const d = data as { results: Record<string, Judgement>; combo: number };
      view.teamNote(d.results ?? {}, d.combo);
    }
  },
  onKey(e, down, ctx) {
    if (!seated) return false;
    // Người chọn kinh lỡ đóng hộp chọn (Esc, rớt mạng): bấm K để mở lại trong lúc chờ.
    if (e.code === 'KeyK' && chant?.phase === 'lobby' && chant.chooserPid === ctx.state.me.pid) {
      if (down && !e.repeat) void askChooser(ctx);
      return true;
    }
    const k = KEY_OF[e.code];
    // Đang ngồi bồ đoàn: E/Q không được chạm vào đồ vật xung quanh.
    if (k === undefined) return e.code === 'KeyE' || e.code === 'KeyQ';
    if (down && e.repeat) return true;
    view?.keyVisual(k, down);
    if (!chant || chant.phase !== 'playing' || !view?.playing) return true;
    const t = ctx.serverNow();
    if (!down) {
      if (view.holdingKey(k)) {
        ctx.send('release', { t, k });
        view.release(k, t);
      }
      return true;
    }
    ctx.send('hit', { t, k });
    const r = view.press(k, t);
    if (k === CHANT_KHANH) ctx.audio.play('bell_small', { volume: r.j === 'stray' ? 0.35 : 0.8 });
    else ctx.audio.play('mo', { rate: KEY_RATE[k as 0 | 1 | 2 | 3], volume: r.j === 'stray' ? 0.6 : 1 });
    if (r.note && r.note.hold > 0 && r.j !== 'miss') ctx.audio.play('chant_hum', { volume: 0.55 });
    ctx.setLocalAnim('strike');
    strikeUntil = performance.now() + 200;
    return true;
  },
  update(_dt, ctx) {
    const now = ctx.serverNow();
    // Chánh Điện phát sáng khi cả chùa đang có Hào quang.
    const halo = ctx.state.me.buffs.some((b) => b.id === 'hao_quang' && b.until > now);
    ctx.world.controls.setChanhDienGlow?.(halo);
    if (seated && strikeUntil && performance.now() > strikeUntil) {
      strikeUntil = 0;
      ctx.setLocalAnim('sit');
    }
    if (chant?.phase === 'lobby') showLobby(ctx);
    if (!chant || chant.phase !== 'playing' || !chart) return;
    // Mõ dẫn nhịp của Phương Trượng vang mỗi phách (lên lịch trước ~300 ms).
    const rel = now - chant.startAt;
    for (let i = leadScheduled + 1; i < chart.beats.length; i++) {
      if (chart.beats[i]! > rel + 300) break;
      leadScheduled = i;
      if (chart.beats[i]! > rel - 50) ctx.audio.playAt('mo_lead', chant.startAt + chart.beats[i]!, { volume: 0.4 });
    }
    view?.frame(now);
  },
  unmount(ctx) {
    cancelChooser();
    if (view || seated) stand(ctx);
    closeResult();
    ctx.audio.stopBeatTrack();
    ctx.world.controls.setChanhDienGlow?.(false);
    chant = null;
    chart = null;
  },
};
