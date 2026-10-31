// Co-op ở Chùa (client): Tụng kinh gõ mõ (kiểu osu! × Audition — xem ./chant.ts)
// và Thỉnh Đại Hồng Chung (giữ Space, thả khi lực vào vùng vàng, chuông ngân theo chất lượng).
import { BELL } from '@shared/index';
import { bellPower, type BellPublicState } from '@shared/activities/coop';
import type { OverlayHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

export { chantClient } from './chant';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

// ───────────────────────── Thỉnh Đại Hồng Chung ─────────────────────────

let bell: BellPublicState | null = null;
let pulling = false;
let bellView: { overlay: OverlayHandle; title: HTMLElement; fill: HTMLElement; info: HTMLElement; bar: HTMLElement } | null = null;
let strikeNo = 0;
let pressT = 0;
let released = true;

function closeBellView(ctx: ClientActivityContext): void {
  bellView?.overlay.close();
  bellView = null;
  pulling = false;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
  ctx.world.controls.setBellPull?.(0);
}

export const bellClient: ActivityClientModule = {
  id: 'bell',
  maps: ['temple'],
  prompt(station, ctx) {
    if (station.kind !== 'bell_rope') return undefined;
    if (pulling) return null;
    if (bell?.phase === 'cooldown') return `Đại Hồng Chung đang nghỉ (${Math.max(0, Math.ceil((bell.cooldownUntil - ctx.serverNow()) / 1000))} giây)`;
    if (bell?.phase === 'ringing') return null;
    if (bell?.pullers.some((p) => p.rope === station.id)) return null;
    return `Nắm dây kéo chuông (${bell?.pullers.length ?? 0}/${BELL.ropes})`;
  },
  onState(s) {
    bell = s as BellPublicState;
    if (bellView && bell.phase === 'gathering') {
      bellView.title.textContent = 'Thỉnh Đại Hồng Chung';
      bellView.info.textContent = `Cần ít nhất ${BELL.minPlayers} người (${bell.pullers.length}/${BELL.ropes}) — rủ bạn ra gác chuông!`;
    }
  },
  onOpen(data, ctx) {
    const d = data as { rope: string };
    const st = ctx.world.map.stations.find((s) => s.id === d.rope);
    if (st) ctx.snapTo(st.x, st.z, st.ry);
    ctx.lockMovement(true);
    ctx.setLocalAnim('pull');
    pulling = true;
    released = true;
    const overlay = ctx.ui.openOverlay('bell');
    const root = el('div', 'act-hud', overlay.el);
    const title = el('div', 'act-title', root, 'Thỉnh Đại Hồng Chung');
    const bar = el('div', 'act-bar bell-bar', root);
    el('div', 'bell-zone', bar);
    const fill = el('div', 'act-bar-fill', bar);
    const info = el('div', 'act-sub', root, 'Chờ đủ người…');
    el('div', 'act-hint', root, 'Khi hô "Kéo!": giữ Space, thả tay lúc lực ở vùng vàng 70–90 · thả cùng lúc với đồng đội');
    bellView = { overlay, title, fill, info, bar };
  },
  onClose(_r, ctx) {
    closeBellView(ctx);
  },
  onEvent(type, data, ctx) {
    if (type === 'countdown' && bellView) {
      bellView.info.textContent = 'Chuẩn bị… 3 giây';
      ctx.audio.play('click');
    } else if (type === 'pull') {
      strikeNo = (data as { strike: number }).strike;
      released = false;
      pressT = 0;
      if (bellView) {
        bellView.title.textContent = `Tiếng ${strikeNo}/${BELL.strikes} — KÉO!`;
        bellView.info.textContent = 'Giữ Space…';
      }
      ctx.audio.play('whoosh', { volume: 0.5 });
    } else if (type === 'ring') {
      const d = data as { strike: number; q: number };
      ctx.audio.bell(d.q);
      ctx.world.controls.hitBell?.(d.q);
      // Sóng âm vàng loang ra từ gác chuông, to theo chất lượng tiếng chuông.
      ctx.world.ring(26, -14, '#ffd166', 5 + d.q * 14);
      if (d.q > 0.6) ctx.world.ring(26, -14, '#fff3b0', 3 + d.q * 8);
      const me = ctx.me();
      const dist = me ? Math.hypot(me.x - 26, me.z + 14) : 30;
      ctx.world.shake(Math.max(0, (0.25 + d.q * 0.9) * (1 - dist / 45)));
      if (bellView) bellView.info.textContent = `Tiếng ${d.strike}: chất lượng ${Math.round(d.q * 100)}%`;
      released = true;
    }
  },
  onKey(e, down, ctx) {
    if (!pulling) return false;
    if (e.code !== 'Space') return ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
    if (released || !strikeNo) return true;
    if (down && !e.repeat && !pressT) pressT = ctx.serverNow();
    if (!down && pressT) {
      const releaseT = ctx.serverNow();
      ctx.send('release', { strike: strikeNo, pressT, releaseT });
      released = true;
      const p = bellPower(pressT, releaseT);
      if (bellView) bellView.info.textContent = `Thả ở lực ${Math.round(p)} — chờ đồng đội…`;
      ctx.world.controls.setBellPull?.(0);
    }
    return true;
  },
  update(_dt, ctx) {
    if (!bellView) return;
    const p = !released && pressT ? bellPower(pressT, ctx.serverNow()) : 0;
    bellView.fill.style.width = `${p}%`;
    bellView.fill.style.background = p >= BELL.zoneMin && p <= BELL.zoneMax ? 'linear-gradient(90deg,#ffd166,#ffb347)' : 'linear-gradient(90deg,#7ee081,#a0d8ff)';
    if (!released && pressT) ctx.world.controls.setBellPull?.(p / 100);
  },
  unmount(ctx) {
    if (bellView) closeBellView(ctx);
  },
};
