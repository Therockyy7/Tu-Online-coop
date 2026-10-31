// Thi nhảy — phía client: lớp phủ kiểu Audition (chuỗi mũi tên, mũi tên đỏ = bấm ngược, Space đúng phách 4),
// thanh phách, điểm + combo, bảng xếp hạng nhỏ; nhân vật nhảy theo kết quả.
import { DANCE, type Judgement } from '@shared/index';
import { danceChart, expectedKey, judgeDanceHit, type ArrowDir, type DanceMeasure, type DancePublicState } from '@shared/activities/dance';
import type { OverlayHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

const GLYPH: Record<ArrowDir, string> = { 0: '↑', 1: '↓', 2: '←', 3: '→' };
const KEY_DIR: Record<string, ArrowDir> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3 };
const JUDGE_TEXT: Record<Judgement, string> = { perfect: 'PERFECT!', great: 'GREAT!', good: 'GOOD', miss: 'MISS' };

let state: DancePublicState | null = null;
let chart: DanceMeasure[] = [];
let joined = false;
let view: {
  overlay: OverlayHandle;
  title: HTMLElement;
  info: HTMLElement;
  arrows: HTMLElement;
  beats: HTMLElement[];
  cursor: HTMLElement;
  judge: HTMLElement;
  board: HTMLElement;
} | null = null;
let inputMeasure = -1;
let progress = 0;
let submitted = new Set<number>();
let lastRender = '';
let danceAnimUntil = 0;
let openCtx: ClientActivityContext | null = null;

function el(tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent.append(e);
  return e;
}

function measureMs(): number {
  return state ? (60_000 / state.bpm) * 4 : 2000;
}

function buildView(ctx: ClientActivityContext): void {
  view?.overlay.close();
  const overlay = ctx.ui.openOverlay('dance');
  const root = el('div', 'act-hud dance-hud', overlay.el);
  const title = el('div', 'act-title', root, 'Thi nhảy');
  const info = el('div', 'act-sub', root);
  const arrows = el('div', 'dance-arrows', root);
  const beatBar = el('div', 'dance-beats', root);
  const beats = [0, 1, 2, 3].map((i) => el('div', `dance-beat ${i === 3 ? 'space' : ''}`, beatBar, i === 3 ? 'SPACE' : String(i + 1)));
  const cursor = el('div', 'dance-cursor', beatBar);
  const judge = el('div', 'act-judge', root);
  el('div', 'act-hint', root, 'Nhập mũi tên ↑↓←→ (đỏ = bấm ngược) rồi Space đúng phách 4');
  const board = el('div', 'dance-board', overlay.el);
  view = { overlay, title, info, arrows, beats, cursor, judge, board };
  lastRender = '';
}

function showJudge(j: Judgement): void {
  if (!view) return;
  view.judge.textContent = JUDGE_TEXT[j];
  view.judge.className = `act-judge ${j} show`;
  setTimeout(() => view?.judge.classList.remove('show'), 650);
}

function close(ctx: ClientActivityContext): void {
  view?.overlay.close();
  view = null;
  joined = false;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
}

export const danceClient: ActivityClientModule = {
  id: 'dance',
  maps: ['bar'],

  mount(ctx) {
    openCtx = ctx;
  },

  prompt(station, ctx) {
    if (station.kind !== 'dance_floor') return undefined;
    const me = ctx.me();
    if (!state || state.phase === 'idle') {
      return me?.isHost || ctx.state.room.djPid === me?.pid ? '💃 Mở vòng nhảy cho cả quán' : 'Sàn nhảy — chờ DJ mở vòng';
    }
    if (state.phase === 'lobby') return joined ? null : '💃 Tham gia vòng nhảy';
    return null;
  },

  hostMenuItems() {
    const idle = !state || state.phase === 'idle';
    return [
      {
        id: 'dance_open',
        icon: '💃',
        label: 'Mở vòng nhảy',
        sub: 'Cả quán có 15 giây lên sàn LED',
        disabled: !idle,
        reason: 'Đang có vòng nhảy',
        run: () => openCtx?.send('open'),
      },
    ];
  },

  onState(s, ctx) {
    const prev = state;
    state = s as DancePublicState;
    if (!prev || prev.seed !== state.seed) chart = danceChart(state.seed, state.measures);
    if (state.phase === 'playing' && prev?.phase !== 'playing') {
      submitted = new Set();
      inputMeasure = -1;
      if (joined) ctx.lockMovement(true);
    }
    if ((state.phase === 'result' || state.phase === 'idle') && joined) close(ctx);
  },

  onOpen(data, ctx) {
    const d = data as { seed: number };
    if (!state || state.seed !== d.seed) chart = danceChart(d.seed);
    joined = true;
    buildView(ctx);
    ctx.audio.play('pickup');
  },

  onClose(_reason, ctx) {
    close(ctx);
  },

  onKey(e, down, ctx) {
    if (!joined || !state || state.phase !== 'playing') return e.code in KEY_DIR || e.code === 'Space';
    if (!down || e.repeat) return e.code in KEY_DIR || e.code === 'Space';
    const now = ctx.serverNow();
    const mMs = measureMs();
    const i = Math.floor((now - state.startAt) / mMs);
    const m = chart[i];
    if (e.code in KEY_DIR) {
      if (!m || i < DANCE.introMeasures || submitted.has(i)) return true;
      if (inputMeasure !== i) {
        inputMeasure = i;
        progress = 0;
      }
      if (progress >= m.arrows.length) return true;
      if (KEY_DIR[e.code] === expectedKey(m, progress)) {
        progress++;
        ctx.audio.play('click', { volume: 0.5, rate: 1 + progress * 0.08 });
      } else {
        progress = 0;
        ctx.audio.play('chop_miss', { volume: 0.4 });
        view?.arrows.classList.remove('shake');
        void view?.arrows.offsetWidth;
        view?.arrows.classList.add('shake');
      }
      return true;
    }
    if (e.code === 'Space') {
      const target = Math.round((now - state.startAt - mMs * 0.75) / mMs);
      if (target < DANCE.introMeasures || target >= state.measures || submitted.has(target)) return true;
      submitted.add(target);
      const tm = chart[target];
      const ok = !!tm && inputMeasure === target && progress >= tm.arrows.length;
      const beat4 = state.startAt + target * mMs + mMs * 0.75;
      const local = ok ? judgeDanceHit(now - beat4) : 'miss';
      ctx.send('measure', { i: target, ok, t: now });
      showJudge(local);
      ctx.audio.play(local === 'perfect' ? 'success' : local === 'miss' ? 'fail' : 'pop', { volume: 0.6 });
      ctx.setLocalAnim(local === 'perfect' ? 'dance3' : local === 'great' ? 'dance2' : local === 'good' ? 'dance' : 'stumble');
      danceAnimUntil = performance.now() + mMs;
      if (local === 'perfect') ctx.world.burst(ctx.me()?.x ?? 0, ctx.me()?.z ?? 0, 'sparkle', 18);
      return true;
    }
    return false;
  },

  update(_dt, ctx) {
    if (!view || !state) return;
    const now = ctx.serverNow();
    if (state.phase === 'lobby') {
      const left = Math.max(0, Math.ceil((state.lobbyEndsAt - now) / 1000));
      const key = `lobby${left}${state.players.length}`;
      if (key !== lastRender) {
        lastRender = key;
        view.title.textContent = 'Chuẩn bị nhảy!';
        view.info.textContent = `Vòng bắt đầu sau ${left} giây · ${state.players.length} người trên sàn`;
        view.arrows.replaceChildren();
      }
      return;
    }
    if (state.phase !== 'playing') return;
    const mMs = measureMs();
    const i = Math.floor((now - state.startAt) / mMs);
    const phase = ((now - state.startAt) / mMs) - i;
    view.cursor.style.left = `${Math.max(0, Math.min(1, phase)) * 100}%`;
    view.beats.forEach((b, k) => b.classList.toggle('lit', i >= 0 && Math.floor(phase * 4) === k));
    if (performance.now() > danceAnimUntil) ctx.setLocalAnim('dance');
    const me = state.players.find((p) => p.pid === ctx.me()?.pid);
    const m = chart[i];
    const key = `${i}|${inputMeasure === i ? progress : 0}|${submitted.has(i)}|${me?.score}|${state.players.map((p) => p.score).join(',')}`;
    if (key === lastRender) return;
    lastRender = key;
    if (i < 0) {
      view.title.textContent = 'Sẵn sàng…';
      view.info.textContent = `Vào nhạc sau ${Math.ceil(-i)} ô nhịp`;
    } else {
      view.title.textContent = i < DANCE.introMeasures ? `Dạo nhạc — ô ${i + 1}/${state.measures}` : `Ô nhịp ${i + 1}/${state.measures}`;
      view.info.textContent = `Điểm ${me?.score ?? 0}${me && me.streak > 1 ? ` · Perfect x${me.streak}` : ''}`;
    }
    view.arrows.replaceChildren();
    if (m && i >= DANCE.introMeasures) {
      const done = submitted.has(i) ? m.arrows.length : inputMeasure === i ? progress : 0;
      m.arrows.forEach((a, j) => {
        el('div', `dance-arrow ${m.reversed[j] ? 'rev' : ''} ${j < done ? 'done' : ''}`, view!.arrows, GLYPH[a]);
      });
    }
    view.board.replaceChildren();
    el('div', 'dance-board-title', view.board, 'Bảng điểm');
    [...state.players]
      .sort((a, b) => b.score - a.score)
      .forEach((p, idx) => {
        const row = el('div', `dance-board-row ${p.pid === ctx.me()?.pid ? 'me' : ''}`, view!.board);
        el('span', '', row, `${idx + 1}. ${p.name}`);
        el('b', '', row, String(p.score));
      });
  },

  unmount(ctx) {
    if (view) close(ctx);
    state = null;
  },
};

