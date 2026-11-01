// Thi pha chế (client): bảng trạm pha chế (đơn hàng → phím 1–6 nhập nguyên liệu → lắc 8 nhịp theo bài DJ),
// biển đơn hàng lơ lửng trên bàn khách, bảng tip; mang ly tới đúng bàn bấm E để phục vụ.
import * as THREE from 'three';
import { DJ, MIXOLOGY } from '@shared/index';
import { beatMs, type DjPublicState } from '@shared/activities/dj';
import { recipeOf, type MixPublicState } from '@shared/activities/mixology';
import { kit } from '../../art/kit';
import type { PanelHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

const ING_NAME = Object.fromEntries(MIXOLOGY.ingredients.map((i) => [i.id, i.name]));

let mix: MixPublicState | null = null;
let panel: PanelHandle | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
/** Đơn đang làm; `shakeAt` = giờ server bắt đầu lắc (neo lưới phách mặc định khi nhạc DJ dừng). */
let work: { orderId: number; picked: string[]; shaking: boolean; deltas: number[]; shakeAt: number } | null = null;
let markers = new Map<number, THREE.Sprite>();
let lastBeatPulse = 0;

/**
 * Lưới phách chấm lắc: bài DJ đang phát (beat0 = một phách mạnh, kể cả bài thu sẵn); nhạc dừng hoặc chưa có bàn DJ →
 * nhịp bài tổng hợp đầu, phách 0 = lúc bắt đầu lắc (giống Thi nhảy lùi về DJ.tracks[0]) — không chấm theo lưới của bài
 * đã tắt tiếng; người chơi canh theo chấm nhịp trên bảng.
 */
function shakeBeat0(dj: DjPublicState | undefined, shakeAt: number): number {
  return dj?.playing ? dj.beat0 : shakeAt;
}

function shakeBpm(dj: DjPublicState | undefined): number {
  return dj?.playing ? dj.bpm : DJ.tracks[0]!.bpm;
}

/** Độ lệch (ms) của cú lắc lúc `now` so với phách gần nhất của lưới chấm lắc. */
export function shakeDelta(dj: DjPublicState | undefined, shakeAt: number, now: number): number {
  const bm = beatMs(shakeBpm(dj));
  const b0 = shakeBeat0(dj, shakeAt);
  return now - (b0 + Math.round((now - b0) / bm) * bm);
}

function tableAnchor(ctx: ClientActivityContext, table: number): THREE.Vector3 | null {
  const a = ctx.world.anchor(`npc_table_top:npc_table_${table}`);
  return a ? a.position.clone() : null;
}

function makeMarker(text: string, mine: boolean): THREE.Sprite {
  const tex = kit.canvasTexture(512, 160, (c, w, h) => {
    c.fillStyle = mine ? 'rgba(255, 209, 102, 0.95)' : 'rgba(20, 8, 40, 0.88)';
    c.beginPath();
    c.roundRect(6, 6, w - 12, h - 30, 30);
    c.fill();
    c.strokeStyle = mine ? '#7a3a14' : '#ff4fd8';
    c.lineWidth = 6;
    c.stroke();
    c.beginPath();
    c.moveTo(w / 2 - 16, h - 26);
    c.lineTo(w / 2, h - 6);
    c.lineTo(w / 2 + 16, h - 26);
    c.fill();
    c.fillStyle = mine ? '#3a2410' : '#ffffff';
    c.font = `800 46px ${kit.FONT_TITLE}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, (h - 24) / 2 + 4);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sp.scale.set(1.8, 0.56, 1);
  return sp;
}

function syncMarkers(ctx: ClientActivityContext): void {
  const orders = mix?.phase === 'playing' ? mix.orders : [];
  const keep = new Set(orders.map((o) => o.id));
  for (const [id, sp] of markers) {
    if (!keep.has(id)) {
      ctx.world.scene.remove(sp);
      sp.material.map?.dispose();
      sp.material.dispose();
      markers.delete(id);
    }
  }
  for (const o of orders) {
    const mine = o.takenBy === ctx.state.me.pid;
    const key = `${o.id}:${mine}`;
    const existing = markers.get(o.id);
    if (existing && existing.userData.key === key) continue;
    if (existing) {
      // Thay biển cũ: giải phóng texture canvas + vật liệu (không rò rỉ bộ nhớ GPU).
      ctx.world.scene.remove(existing);
      existing.material.map?.dispose();
      existing.material.dispose();
    }
    const pos = tableAnchor(ctx, o.table);
    if (!pos) continue;
    const sp = makeMarker(`🍹 ${recipeOf(o.recipe)?.name ?? o.recipe}`, mine);
    sp.userData.key = key;
    sp.position.set(pos.x, 2.4, pos.z);
    ctx.world.scene.add(sp);
    markers.set(o.id, sp);
  }
}

function closePanel(): void {
  if (keyHandler) removeEventListener('keydown', keyHandler, true);
  keyHandler = null;
  panel?.close();
  panel = null;
}

function renderPanel(ctx: ClientActivityContext): void {
  if (!panel || panel.closed || !mix) return;
  const b = panel.body;
  b.replaceChildren();
  const now = ctx.serverNow();
  const left = Math.max(0, Math.ceil((mix.endsAt - now) / 1000));
  el('div', 'mx-head', b, mix.phase === 'lobby' ? `Chờ bartender khác vào trạm… ${left}s` : mix.phase === 'playing' ? `⏱ Còn ${left} giây` : 'Hết ca!');
  if (work) {
    const o = mix.orders.find((x) => x.id === work!.orderId);
    const recipe = o ? recipeOf(o.recipe) : undefined;
    if (!o || !recipe) {
      work = null;
    } else {
      el('div', 'mx-title', b, `${recipe.name} — bàn ${o.table}`);
      const slots = el('div', 'mx-slots', b);
      recipe.ingredients.forEach((_, i) => el('div', `mx-slot ${work!.picked[i] ? 'ok' : ''}`, slots, work!.picked[i] ? ING_NAME[work!.picked[i]!] ?? '' : '?'));
      if (!work.shaking) {
        el('div', 'mx-hint', b, `Bấm phím theo đúng thứ tự: ${recipe.ingredients.map((id) => `${MIXOLOGY.ingredients.find((x) => x.id === id)?.key} ${ING_NAME[id]}`).join(' → ')}`);
        const keys = el('div', 'mx-keys', b);
        for (const ing of MIXOLOGY.ingredients) el('div', 'mx-key', keys, `${ing.key} · ${ing.name}`);
      } else {
        const dj = ctx.state.activityState('dj') as DjPublicState | undefined;
        const hint = dj?.playing ? 'đúng nhịp nhạc' : 'canh theo chấm nhịp';
        el('div', 'mx-title shake', b, `🍸 LẮC! Space ${hint} (${work.deltas.length}/${MIXOLOGY.shakeBeats})`);
        el('div', `mx-beat ${performance.now() - lastBeatPulse < 120 ? 'on' : ''}`, b, '●');
      }
      return;
    }
  }
  if (mix.phase !== 'playing') return;
  el('div', 'mx-title', b, 'Đơn đang chờ');
  const list = el('div', 'mx-orders', b);
  for (const o of mix.orders) {
    const r = recipeOf(o.recipe);
    const row = el('button', `mx-order ${o.takenBy ? 'taken' : ''}`, list);
    el('b', '', row, `Bàn ${o.table}: ${r?.name ?? o.recipe}`);
    el('span', '', row, o.takenBy ? (o.takenBy === ctx.state.me.pid ? 'Bạn đã nhận' : 'Người khác nhận') : 'Bấm để nhận đơn');
    row.disabled = !!o.takenBy && o.takenBy !== ctx.state.me.pid;
    row.onclick = () => {
      if (!o.takenBy) ctx.send('take_order', { id: o.id });
      work = { orderId: o.id, picked: [], shaking: false, deltas: [], shakeAt: 0 };
      renderPanel(ctx);
    };
  }
  if (!mix.orders.length) el('div', 'mx-hint', b, 'Chưa có khách gọi món… chờ chút!');
  const board = el('div', 'mx-scores', b);
  mix.scores.forEach((s, i) => el('div', '', board, `${i + 1}. ${s.name} — ${s.tips} Xu`));
}

function onPanelKey(ctx: ClientActivityContext, e: KeyboardEvent): void {
  if (!work || !mix) return;
  const o = mix.orders.find((x) => x.id === work!.orderId);
  const recipe = o ? recipeOf(o.recipe) : undefined;
  if (!recipe) return;
  if (!work.shaking) {
    const m = /^Digit([1-6])$/.exec(e.code);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    const ing = MIXOLOGY.ingredients.find((x) => x.key === Number(m[1]));
    if (!ing) return;
    if (recipe.ingredients[work.picked.length] === ing.id) {
      work.picked.push(ing.id);
      ctx.audio.play('pour', { volume: 0.4, rate: 1.5 });
      if (work.picked.length === recipe.ingredients.length) {
        work.shaking = true;
        work.shakeAt = ctx.serverNow();
        ctx.setLocalAnim('shake');
      }
    } else {
      work.picked = [];
      ctx.audio.play('fail', { volume: 0.4 });
    }
    renderPanel(ctx);
  } else if (e.code === 'Space' && !e.repeat) {
    e.preventDefault();
    e.stopPropagation();
    const dj = ctx.state.activityState('dj') as DjPublicState | undefined;
    work.deltas.push(shakeDelta(dj, work.shakeAt, ctx.serverNow()));
    ctx.audio.play('shaker', { volume: 0.6 });
    if (work.deltas.length >= MIXOLOGY.shakeBeats) {
      ctx.send('mix_done', { id: work.orderId, ingredients: work.picked, deltas: work.deltas });
      work = null;
      ctx.setLocalAnim(null);
    }
    renderPanel(ctx);
  }
}

export const mixologyClient: ActivityClientModule = {
  id: 'mixology',
  maps: ['bar'],
  prompt(station, ctx) {
    const me = ctx.state.me.pid;
    if (station.kind === 'mix_station') {
      if (!mix || mix.phase === 'idle') return '🍸 Mở ca pha chế (1–4 người)';
      if (mix.phase === 'result') return null;
      const at = mix.stations[station.id];
      if (at === me) return 'Mở bảng pha chế';
      if (at) return null;
      return Object.values(mix.stations).includes(me) ? null : 'Vào trạm pha chế';
    }
    if (station.kind === 'npc_table') {
      const held = ctx.me()?.held;
      return mix?.phase === 'playing' && held?.kind === 'cocktail' ? `Phục vụ bàn ${station.data?.index}` : null;
    }
    return undefined;
  },
  onState(s, ctx) {
    mix = s as MixPublicState;
    syncMarkers(ctx);
    renderPanel(ctx);
  },
  onEvent(type, data, ctx) {
    if (type === 'served') {
      const d = data as { table: number; tip: number; name: string };
      const pos = tableAnchor(ctx, d.table);
      if (pos) {
        ctx.world.floatText(pos.x, pos.z, `+${d.tip} Xu tip`, '#7fe3ff', 2.2);
        ctx.world.burst(pos.x, pos.z, 'confetti', 20);
      }
    } else if (type === 'order') {
      ctx.audio.play('bell_small', { volume: 0.4, rate: 1.4 });
    }
  },
  onOpen(data, ctx) {
    const d = data as { stationId: string };
    const st = ctx.world.map.stations.find((x) => x.id === d.stationId);
    if (st) ctx.snapTo(st.x, st.z, st.ry);
    closePanel();
    work = null;
    panel = ctx.ui.openPanel({
      id: 'mixology',
      title: '🍸 Trạm pha chế',
      width: 520,
      position: 'right',
      onClose: () => {
        if (keyHandler) removeEventListener('keydown', keyHandler, true);
        keyHandler = null;
        panel = null;
        ctx.send('close');
      },
    });
    keyHandler = (e) => onPanelKey(ctx, e);
    addEventListener('keydown', keyHandler, true);
    renderPanel(ctx);
  },
  onClose(_r, ctx) {
    closePanel();
    ctx.setLocalAnim(null);
  },
  update(_dt, ctx) {
    const t = performance.now() / 1000;
    for (const sp of markers.values()) sp.position.y = 2.4 + Math.sin(t * 2 + sp.id) * 0.08;
    if (work?.shaking) {
      // Chấm nhịp trên bảng theo đúng lưới chấm lắc (nhạc dừng → lưới mặc định neo lúc bắt đầu lắc).
      const dj = ctx.state.activityState('dj') as DjPublicState | undefined;
      const bm = beatMs(shakeBpm(dj));
      const phase = ((((ctx.serverNow() - shakeBeat0(dj, work.shakeAt)) % bm) + bm) % bm) / bm;
      if (phase < 0.12 && performance.now() - lastBeatPulse > bm * 0.5) {
        lastBeatPulse = performance.now();
        renderPanel(ctx);
      }
    }
  },
  unmount(ctx) {
    closePanel();
    for (const sp of markers.values()) {
      ctx.world.scene.remove(sp);
      sp.material.map?.dispose();
      sp.material.dispose();
    }
    markers = new Map();
    mix = null;
  },
};
