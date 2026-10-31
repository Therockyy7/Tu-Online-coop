// Nấu cơm chay (client): bảng bếp (giờ, mâm, nhiệt, nồi, chảo, kho), gợi ý từng trạm theo đồ đang cầm,
// QTE vo gạo (Space ×10), thái rau (chuỗi mũi tên), quạt lửa (Space), đảo chảo (giữ Space); lửa + khói lò.
import { COOK, heldItemName } from '@shared/index';
import { ROLE_NAMES, type CookPublicState } from '@shared/activities/cook';
import type { OverlayHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

const GLYPH = ['↑', '↓', '←', '→'];
const KEY_DIR: Record<string, number> = { ArrowUp: 0, ArrowDown: 1, ArrowLeft: 2, ArrowRight: 3 };

let cook: CookPublicState | null = null;
let board: { overlay: OverlayHandle; root: HTMLElement } | null = null;
let qte: { kind: 'wash' | 'cut' | 'fan' | 'stir'; overlay: OverlayHandle; info: HTMLElement; count: number; seq: number[]; idx: number; lastFan: number } | null = null;
let animUntil = 0;

const inCook = (ctx: ClientActivityContext) => !!cook?.participants.some((p) => p.pid === ctx.state.me.pid);

function renderBoard(ctx: ClientActivityContext): void {
  const show = cook && (cook.phase === 'cooking' || cook.phase === 'lobby') && inCook(ctx);
  if (!show) {
    board?.overlay.close();
    board = null;
    return;
  }
  if (!board) {
    const overlay = ctx.ui.openOverlay('cook-board');
    board = { overlay, root: el('div', 'cook-board', overlay.el) };
  }
  const s = cook!;
  const r = board.root;
  r.replaceChildren();
  const left = Math.max(0, Math.ceil((s.endsAt - ctx.serverNow()) / 1000));
  el('div', 'cook-title', r, s.phase === 'lobby' ? `🍳 Chờ phụ bếp… ${left}s` : `🍚 Nấu cơm chay — ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
  el('div', 'cook-line', r, `Mâm: cơm ${s.rice} · rau ${s.dishes} / cần ${s.mealsNeeded}`);
  const heat = el('div', 'cook-meter', r);
  el('span', '', heat, `🔥 Nhiệt ${Math.round(s.heat)}`);
  const hb = el('div', 'cook-bar heat', heat);
  el('div', 'cook-green', hb).style.cssText = `left:${COOK.heatGreenMin}%;width:${COOK.heatGreenMax - COOK.heatGreenMin}%`;
  el('div', 'cook-red', hb).style.cssText = `left:${COOK.heatRed}%;width:${100 - COOK.heatRed}%`;
  el('div', 'cook-fill', hb).style.width = `${s.heat}%`;
  const pot = el('div', 'cook-meter', r);
  el('span', '', pot, s.pot.state === 'empty' ? '🍲 Nồi trống' : s.pot.state === 'done' ? '🍲 Cơm chín — múc ra!' : `🍲 Cơm ${s.pot.progress}%`);
  const pb = el('div', 'cook-bar', pot);
  el('div', 'cook-fill pot', pb).style.width = `${s.pot.progress}%`;
  if (s.pot.burn > 0) el('div', 'cook-fill burn', pb).style.width = `${s.pot.burn}%`;
  const pan = el('div', 'cook-meter', r);
  el('span', '', pan, s.pan.state === 'empty' ? '🥘 Chảo trống' : s.pan.state === 'done' ? '🥘 Rau chín — múc ra!' : `🥘 Đảo ${s.pan.progress}%${s.pan.stirring ? ' (đang đảo)' : ''}`);
  const panBar = el('div', 'cook-bar', pan);
  el('div', 'cook-fill pan', panBar).style.width = `${s.pan.progress}%`;
  el('div', 'cook-line small', r, `Kho: gạo ${s.stock.rice} · rau ${s.stock.veggies} · củi ${s.stock.firewood}`);
  const me = s.participants.find((p) => p.pid === ctx.state.me.pid);
  if (me) el('div', 'cook-role', r, `Vai gợi ý: ${ROLE_NAMES[me.role]}`);
}

function closeQte(ctx: ClientActivityContext): void {
  qte?.overlay.close();
  qte = null;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
}

export const cookClient: ActivityClientModule = {
  id: 'cook',
  maps: ['temple'],
  prompt(station, ctx) {
    const s = cook;
    const held = ctx.me()?.held ?? null;
    if (station.kind === 'order_board') {
      if (!s || s.phase === 'idle') return '🍳 Mở bếp nấu cơm chay (co-op)';
      if (s.phase === 'result') return null;
      return inCook(ctx) ? null : '🍳 Vào phụ bếp';
    }
    if (!s || s.phase !== 'cooking') return null;
    switch (station.kind) {
      case 'rice_bin':
        return held ? null : `Lấy gạo (còn ${s.stock.rice})`;
      case 'veggie_patch':
        return held ? null : `Hái rau nấm (còn ${s.stock.veggies})`;
      case 'woodpile':
        return held ? null : `Lấy bó củi (còn ${s.stock.firewood})`;
      case 'wash_basin':
        return held?.kind === 'rice' ? 'Vo gạo (Space ×10)' : null;
      case 'cutting_board':
        return held?.kind === 'veggies' ? 'Thái rau nấm (chuỗi mũi tên)' : null;
      case 'stove_rice':
        if (held?.kind === 'rice_washed' && s.pot.state === 'empty') return 'Bắc nồi cơm';
        if (!held && s.pot.state === 'done') return 'Múc nồi cơm chín';
        return null;
      case 'firebox':
        return held?.kind === 'firewood' ? 'Bỏ củi vào lò (+30 nhiệt)' : held ? null : 'Quạt lửa (Space liên tục)';
      case 'stove_pan':
        if (held?.kind === 'veggies_cut' && s.pan.state === 'empty') return 'Đổ rau vào chảo, giữ Space để đảo';
        if (!held && s.pan.state === 'ready') return 'Đảo chảo (giữ Space)';
        if (!held && s.pan.state === 'done') return 'Múc đĩa rau xào';
        return null;
      case 'dining_table':
        return held?.kind === 'rice_pot' || held?.kind === 'veggie_dish' ? `Dọn ${heldItemName(held.kind)} ra mâm` : null;
    }
    return undefined;
  },
  onState(s, ctx) {
    cook = s as CookPublicState;
    const fire = cook.phase === 'cooking' ? cook.heat / 100 : 0.25;
    ctx.world.controls.setStove?.('rice', { fire, smoke: cook.pot.state === 'cooking' ? 0.3 + cook.pot.burn / 120 : 0 });
    ctx.world.controls.setStove?.('pan', { fire, smoke: cook.pan.stirring ? 0.7 : 0 });
    renderBoard(ctx);
  },
  onOpen(data, ctx) {
    const d = data as { qte: 'wash' | 'cut' | 'fan' | 'stir'; stationId: string; seq?: number[] };
    const st = ctx.world.map.stations.find((x) => x.id === d.stationId);
    if (st) ctx.snapTo(st.x, st.z, st.ry);
    ctx.lockMovement(true);
    qte?.overlay.close();
    const overlay = ctx.ui.openOverlay('cook-qte');
    const root = el('div', 'act-hud', overlay.el);
    const titles = { wash: 'Vo gạo — bấm Space 10 lần', cut: 'Thái rau — bấm đúng chuỗi mũi tên', fan: 'Quạt lửa — bấm Space liên tục', stir: 'Đảo chảo — giữ Space (lửa phải đủ nóng)' };
    el('div', 'act-title', root, titles[d.qte]);
    const info = el('div', 'act-keys', root);
    el('div', 'act-hint', root, 'Esc để thôi');
    qte = { kind: d.qte, overlay, info, count: 0, seq: d.seq ?? [], idx: 0, lastFan: 0 };
    if (d.qte === 'cut') qte.seq.forEach((dir) => el('div', 'dance-arrow', info, GLYPH[dir]));
    else el('div', 'act-key', info, d.qte === 'wash' ? '0/10' : 'SPACE');
    ctx.setLocalAnim(d.qte === 'wash' ? 'wash' : d.qte === 'cut' ? 'cut' : d.qte === 'fan' ? 'fan' : 'stir');
  },
  onClose(_r, ctx) {
    if (qte?.kind === 'stir') ctx.send('stir', { down: false });
    closeQte(ctx);
  },
  onKey(e, down, ctx) {
    if (!qte) return false;
    const q = qte;
    if (q.kind === 'cut') {
      if (!(e.code in KEY_DIR)) return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code);
      if (!down || e.repeat) return true;
      const arrows = [...q.info.children] as HTMLElement[];
      if (KEY_DIR[e.code] === q.seq[q.idx]) {
        arrows[q.idx]?.classList.add('done');
        q.idx++;
        ctx.audio.play('chop', { volume: 0.4, rate: 1.6 });
        if (q.idx >= q.seq.length) ctx.send('cut_done');
      } else {
        q.idx = 0;
        arrows.forEach((a) => a.classList.remove('done'));
        ctx.audio.play('chop_miss', { volume: 0.4 });
      }
      return true;
    }
    if (e.code !== 'Space') return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
    if (q.kind === 'stir') {
      if (!e.repeat) ctx.send('stir', { down });
      if (down && !e.repeat) ctx.audio.play('sizzle', { volume: 0.5 });
      return true;
    }
    if (!down || e.repeat) return true;
    if (q.kind === 'wash') {
      q.count++;
      (q.info.firstElementChild as HTMLElement).textContent = `${q.count}/${COOK.washPresses}`;
      ctx.audio.play('splash', { volume: 0.35, rate: 1.4 });
      if (q.count === COOK.washPresses) ctx.send('wash_done');
    } else if (q.kind === 'fan') {
      const now = performance.now();
      if (now - q.lastFan >= COOK.bellowsMinIntervalMs) {
        q.lastFan = now;
        ctx.send('fan');
        ctx.audio.play('whoosh', { volume: 0.3, rate: 1.5 });
      }
    }
    animUntil = performance.now() + 300;
    return true;
  },
  update(_dt, ctx) {
    if (board && cook) {
      const left = Math.ceil((cook.endsAt - ctx.serverNow()) / 1000);
      const title = board.root.firstElementChild as HTMLElement | null;
      if (title && cook.phase === 'cooking') title.textContent = `🍚 Nấu cơm chay — ${Math.floor(Math.max(0, left) / 60)}:${String(Math.max(0, left) % 60).padStart(2, '0')}`;
    }
    if (qte && animUntil && performance.now() > animUntil) animUntil = 0;
  },
  unmount(ctx) {
    board?.overlay.close();
    board = null;
    if (qte) closeQte(ctx);
    cook = null;
  },
};
