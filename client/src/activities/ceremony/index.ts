// Đại lễ cúng dường (client): thẻ yêu cầu 10 vị trí + vai gợi ý + đồng hồ nhang; giữ E để hái quả/hái hoa/cắm hoa;
// lấy đèn/hương; bảng đàn tràng để bày lễ; bàn soạn lễ; đồ đã bày hiện trên đàn; nén nhang lớn cháy ngắn dần.
import * as THREE from 'three';
import { CEREMONY, FLOWER_NAMES, FRUIT_NAMES, heldItemName, type FlowerColor, type FruitId, type HeldItem } from '@shared/index';
import {
  CEREMONY_ROLE_NAMES,
  ceremonyLayout,
  ceremonySlots,
  slotAccepts,
  type CeremonyPublicState,
  type CeremonySlot,
} from '@shared/activities/ceremony';
import { createHeldItemMesh } from '../../art/props';
import type { OverlayHandle, PanelHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

const FRUIT_ICON: Record<FruitId, string> = { chuoi: '🍌', buoi: '🟢', phat_thu: '🖐️', thanh_long: '🐉', xoai: '🥭', du_du: '🧡', mang_cau: '🍏' };
const FLOWER_DOT: Record<FlowerColor, string> = { vang: '🟡', trang: '⚪', do: '🔴', tim: '🟣' };

let cer: CeremonyPublicState | null = null;
let slots: CeremonySlot[] = [];
let card: { overlay: OverlayHandle; root: HTMLElement } | null = null;
let altarItems: THREE.Group | null = null;
let altarKey = '';
let hold: { stationId: string; need: number; start: number; overlay: OverlayHandle; ring: HTMLElement } | null = null;
let altarPanel: PanelHandle | null = null;
let cerCtx: ClientActivityContext | null = null;

function slotLabel(sl: CeremonySlot): string {
  if (sl.kind === 'fruit') return `${FRUIT_ICON[sl.variant as FruitId]} ${FRUIT_NAMES[sl.variant as FruitId]}`;
  if (sl.kind === 'vase') return `${FLOWER_DOT[sl.variant as FlowerColor]} Bình hoa ${FLOWER_NAMES[sl.variant as FlowerColor]}`;
  if (sl.kind === 'lamp') return '🪔 Đèn dầu đã thắp';
  return '🧧 Hương đã thắp';
}

function slotItem(sl: CeremonySlot): HeldItem {
  if (sl.kind === 'fruit') return { kind: 'fruit', variant: sl.variant };
  if (sl.kind === 'vase') return { kind: 'vase', variant: sl.variant };
  if (sl.kind === 'lamp') return { kind: 'lamp', variant: 'lit' };
  return { kind: 'incense', variant: 'lit' };
}

function renderCard(ctx: ClientActivityContext): void {
  if (!cer?.active) {
    card?.overlay.close();
    card = null;
    return;
  }
  if (!card) {
    const overlay = ctx.ui.openOverlay('ceremony');
    card = { overlay, root: el('div', 'cer-card', overlay.el) };
  }
  const r = card.root;
  r.replaceChildren();
  const left = Math.max(0, Math.ceil((cer.endsAt - ctx.serverNow()) / 1000));
  el('div', 'cer-title', r, `🪷 Đại lễ — nhang còn ${left}s`);
  const done = slots.filter((x) => cer!.placed[x.id]).length;
  el('div', 'cer-sub', r, `Đã bày ${done}/10 · bàn soạn lễ ${cer.prep.length}/${CEREMONY.prepTableMax}`);
  const grid = el('div', 'cer-grid', r);
  for (const sl of slots) el('div', `cer-slot ${cer.placed[sl.id] ? 'ok' : ''}`, grid, `${cer.placed[sl.id] ? '✔' : '○'} ${slotLabel(sl)}`);
  const me = cer.participants.find((p) => p.pid === ctx.state.me.pid);
  el('div', 'cer-role', r, me ? `Vai: ${CEREMONY_ROLE_NAMES[me.role]}` : 'Bấm E ở trạm bất kỳ của lễ để tham gia');
}

function renderAltar(ctx: ClientActivityContext): void {
  const top = ctx.world.anchor('altar_top');
  if (!top) return;
  const key = cer?.active || cer?.result === 'success' ? JSON.stringify([cer.seed, cer.placed]) : '';
  if (key === altarKey) return;
  altarKey = key;
  if (!altarItems) {
    altarItems = new THREE.Group();
    ctx.world.scene.add(altarItems);
  }
  altarItems.clear();
  altarItems.position.copy(top.position);
  altarItems.rotation.copy(top.rotation);
  if (!key) return;
  for (const sl of slots) {
    if (!cer!.placed[sl.id]) continue;
    const m = createHeldItemMesh(slotItem(sl));
    m.position.set(sl.x, 0.02, sl.z);
    m.scale.setScalar(sl.kind === 'vase' ? 1.6 : 1.3);
    altarItems.add(m);
  }
}

function startHold(ctx: ClientActivityContext, stationId: string, need: number): void {
  hold?.overlay.close();
  const overlay = ctx.ui.openOverlay('cer-hold');
  const ring = el('div', 'hold-ring', overlay.el);
  hold = { stationId, need, start: performance.now(), overlay, ring };
  ctx.setOpen(true);
  ctx.send('hold_start', { stationId });
  ctx.setLocalAnim('pick');
}

function endHold(ctx: ClientActivityContext): void {
  hold?.overlay.close();
  hold = null;
  ctx.setOpen(false);
  ctx.setLocalAnim(null);
}

function openAltar(ctx: ClientActivityContext): void {
  altarPanel?.close();
  altarPanel = ctx.ui.openPanel({ id: 'altar', title: '🪷 Đàn tràng — chọn ô để bày', width: 560, onClose: () => (altarPanel = null) });
  const held = ctx.me()?.held ?? null;
  el('div', 'cer-sub dark', altarPanel.body, held ? `Đang cầm: ${heldItemName(held.kind, held.variant)}` : 'Tay đang trống — lấy đồ ở bàn soạn lễ hoặc tự chuẩn bị.');
  const grid = el('div', 'cer-panel-grid', altarPanel.body);
  for (const sl of slots) {
    const placed = !!cer?.placed[sl.id];
    const b = el('button', `cer-panel-slot ${placed ? 'ok' : slotAccepts(sl, held) ? 'match' : ''}`, grid, `${placed ? '✔ ' : ''}${slotLabel(sl)}`);
    b.disabled = placed;
    b.onclick = () => {
      ctx.send('place', { slot: sl.id });
      altarPanel?.close();
    };
  }
}

export const ceremonyClient: ActivityClientModule = {
  id: 'ceremony',
  maps: ['temple'],
  mount(ctx) {
    cerCtx = ctx;
  },
  prompt(station, ctx) {
    const held = ctx.me()?.held ?? null;
    const active = !!cer?.active;
    switch (station.kind) {
      case 'fruit_tree':
        return active && !held ? `Hái ${FRUIT_NAMES[station.data?.fruit as FruitId]?.toLowerCase()} (giữ E)` : null;
      case 'flower_bed':
        return active && !held ? `Hái hoa ${FLOWER_NAMES[station.data?.color as FlowerColor]} (giữ E)` : null;
      case 'flower_table':
        return active && held?.kind === 'flower' ? 'Cắm hoa vào bình (giữ E 2 giây)' : null;
      case 'lamp_table':
        return active && !held ? 'Lấy đèn dầu / nén hương' : null;
      case 'oil_jar':
        return active && held?.kind === 'lamp' && held.variant === 'empty' ? 'Châm dầu vào đèn' : null;
      case 'candle_stand':
        return active && ((held?.kind === 'lamp' && held.variant === 'filled') || (held?.kind === 'incense' && held.variant !== 'lit')) ? 'Thắp lửa' : null;
      case 'prep_table':
        if (!active) return null;
        return held ? 'Đặt lên bàn soạn lễ' : cer!.prep.length ? `Lấy đồ từ bàn soạn lễ (${cer!.prep.length})` : null;
      case 'altar':
        return active ? (held ? 'Bày lễ lên đàn tràng' : 'Xem đàn tràng') : null;
    }
    return undefined;
  },
  interact(station, ctx) {
    if (!cer?.active) return false;
    const held = ctx.me()?.held ?? null;
    switch (station.kind) {
      case 'fruit_tree':
      case 'flower_bed':
        if (held) return true;
        startHold(ctx, station.id, CEREMONY.pickHoldMs);
        return true;
      case 'flower_table':
        if (held?.kind === 'flower') startHold(ctx, station.id, CEREMONY.arrangeHoldMs);
        return true;
      case 'lamp_table':
        void ctx.ui
          .choose({
            title: 'Bàn hương đăng',
            options: [
              { value: 'lamp', label: 'Đèn dầu rỗng', sub: 'Châm dầu ở vò dầu, thắp ở giá nến', icon: '🪔' },
              { value: 'incense', label: 'Nén hương', sub: 'Thắp ở giá nến', icon: '🧧' },
            ],
          })
          .then((v) => v && ctx.send('take', { kind: v }));
        return true;
      case 'prep_table':
        if (held) ctx.send('put');
        else if (cer.prep.length)
          void ctx.ui
            .choose({ title: 'Bàn soạn lễ — lấy món nào?', options: cer.prep.map((it, i) => ({ value: String(i), label: heldItemName(it.kind, it.variant), icon: '🎁' })) })
            .then((v) => v !== null && ctx.send('take_prep', { index: Number(v) }));
        return true;
      case 'altar':
        openAltar(ctx);
        return true;
    }
    return false;
  },
  hostMenuItems(ctx) {
    const cooling = cer ? Math.ceil((cer.cooldownUntil - ctx.serverNow()) / 1000) : 0;
    return [
      {
        id: 'ceremony_start',
        icon: '🪷',
        label: 'Mở Đại lễ cúng dường',
        sub: 'Cả chùa bày đủ 10 vị trí trong 150 giây',
        disabled: !!cer?.active || cooling > 0,
        reason: cer?.active ? 'Đang có Đại lễ' : `Nghỉ thêm ${cooling} giây`,
        run: () => cerCtx?.send('start'),
      },
    ];
  },
  onState(s, ctx) {
    const prev = cer;
    cer = s as CeremonyPublicState;
    if (!prev || prev.seed !== cer.seed) slots = ceremonySlots(ceremonyLayout(cer.seed));
    renderCard(ctx);
    renderAltar(ctx);
    if (!cer.active && hold) endHold(ctx);
  },
  onKey(e, down, ctx) {
    if (!hold) return false;
    if (e.code === 'KeyE' && !down) {
      endHold(ctx);
      return true;
    }
    return ['KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
  },
  update(_dt, ctx) {
    if (cer?.active) {
      const ratio = Math.max(0, (cer.endsAt - ctx.serverNow()) / CEREMONY.durationMs);
      ctx.world.controls.setAltarIncense?.(ratio);
      if (card) {
        const t = card.root.firstElementChild as HTMLElement | null;
        if (t) t.textContent = `🪷 Đại lễ — nhang còn ${Math.max(0, Math.ceil((cer.endsAt - ctx.serverNow()) / 1000))}s`;
      }
    } else {
      ctx.world.controls.setAltarIncense?.(null);
    }
    if (hold) {
      const k = (performance.now() - hold.start) / hold.need;
      hold.ring.style.setProperty('--p', String(Math.min(1, k)));
      if (k >= 1) {
        ctx.send('pick', { stationId: hold.stationId });
        ctx.audio.play('pickup');
        endHold(ctx);
      }
    }
  },
  unmount(ctx) {
    card?.overlay.close();
    card = null;
    if (hold) endHold(ctx);
    altarPanel?.close();
    if (altarItems) ctx.world.scene.remove(altarItems);
    altarItems = null;
    altarKey = '';
  },
};
