// Tiện ích Quán Bar phía client: Quầy đổi Đức, Gọi đồ uống (Space để uống), Vòng quay sự thật (quay đĩa 3D),
// Bầu Cua Cá Cọp (bảng đặt cược + 3 xúc xắc 3D lắc trong bát).
import * as THREE from 'three';
import { BAUCUA, BAUCUA_NAMES, BAUCUA_SYMBOLS, DRINKS, EXCHANGE, type BauCuaSymbol } from '@shared/index';
import { totalBet, wheelFinalAngle, type BauCuaState, type TruthWheelState } from '@shared/activities/bar';
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

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

// ───────────────────────── Quầy đổi Đức ─────────────────────────

let exPanel: PanelHandle | null = null;
let exOff: (() => void) | null = null;

function renderExchange(ctx: ClientActivityContext): void {
  if (!exPanel || exPanel.closed) return;
  const me = ctx.state.me;
  const b = exPanel.body;
  // Giữ số Đức người chơi đang gõ khi bảng vẽ lại (vd vừa đổi xong, ví thay đổi).
  const typed = b.querySelector<HTMLInputElement>('.ex-input')?.value;
  b.replaceChildren();
  const wallet = el('div', 'ex-wallet', b);
  el('div', 'ex-chip', wallet, `📿 ${fmt(me.duc)} Đức`);
  el('div', 'ex-chip', wallet, `🪙 ${fmt(me.xu)} Xu`);
  if (me.vip) el('div', 'ex-chip vip', wallet, '🎟️ VIP');

  const s1 = el('div', 'ex-section', b);
  el('div', 'ex-title', s1, `Đổi Xu (1 Đức = ${EXCHANGE.xuPerDuc} Xu)`);
  const row = el('div', 'ex-row', s1);
  const input = el('input', 'input ex-input', row);
  input.type = 'number';
  input.min = '1';
  input.max = String(Math.min(me.duc, EXCHANGE.maxExchangePerAction));
  input.value = typed ?? String(Math.min(10, Math.max(1, me.duc)));
  const preview = el('span', 'ex-preview', row);
  const update = () => (preview.textContent = `= ${fmt(Number(input.value || 0) * EXCHANGE.xuPerDuc)} Xu`);
  input.oninput = update;
  update();
  const go = el('button', 'btn btn-primary', row, 'Đổi');
  go.onclick = () => {
    const duc = Math.floor(Number(input.value));
    if (duc > 0) ctx.send('xu', { duc });
  };
  const quick = el('div', 'ex-quick', s1);
  for (const n of [10, 50, 100]) {
    const q = el('button', 'btn btn-ghost btn-small', quick, `${n} Đức`);
    q.disabled = me.duc < n;
    q.onclick = () => ctx.send('xu', { duc: n });
  }

  const s2 = el('div', 'ex-section', b);
  el('div', 'ex-title', s2, `💸 Bao cả quán — ${EXCHANGE.baoQuanCost} Đức`);
  el('p', 'ex-note', s2, `Mọi người trong quán +${EXCHANGE.baoQuanXu} Xu, bạn nhận danh hiệu "Đại gia".`);
  const bao = el('button', 'btn btn-secondary', s2, 'Bao cả quán!');
  bao.disabled = me.duc < EXCHANGE.baoQuanCost;
  bao.onclick = () => ctx.send('baoquan');

  if (!me.vip) {
    const s3 = el('div', 'ex-section', b);
    el('div', 'ex-title', s3, `🎟️ Vé VIP vĩnh viễn — ${EXCHANGE.vipCost} Đức`);
    el('p', 'ex-note', s3, 'Vào khu VIP, mở mũ VIP + kính râm + dây chuyền vàng, đồ uống giảm 50%.');
    const vip = el('button', 'btn btn-primary', s3, 'Mua Vé VIP');
    vip.disabled = me.duc < EXCHANGE.vipCost;
    vip.onclick = () => ctx.send('vip');
  }
}

export const exchangeClient: ActivityClientModule = {
  id: 'exchange',
  maps: ['bar'],
  interact(station, ctx) {
    if (station.kind !== 'exchange_kiosk') return false;
    exPanel?.close();
    exPanel = ctx.ui.openPanel({
      id: 'exchange',
      title: '🏦 Quầy đổi Đức',
      width: 440,
      onClose: () => {
        exOff?.();
        exOff = null;
        exPanel = null;
      },
    });
    // Chỉ vẽ lại khi ví đổi — không phải mỗi lần Độ Say giảm (1 lần/giây) làm mất số đang gõ.
    exOff = ctx.state.on('self', (e) => {
      if ('duc' in e.patch || 'xu' in e.patch || 'vip' in e.patch) renderExchange(ctx);
    });
    renderExchange(ctx);
    ctx.audio.play('coin', { volume: 0.4 });
    return true;
  },
  unmount() {
    exPanel?.close();
  },
};

// ───────────────────────── Đồ uống ─────────────────────────

let drinkUntil = 0;

export const drinkClient: ActivityClientModule = {
  id: 'drink',
  maps: ['bar'],
  prompt(station, ctx) {
    if (station.kind !== 'drink_counter') return undefined;
    return ctx.me()?.held ? null : 'Gọi đồ uống';
  },
  interact(station, ctx) {
    if (station.kind !== 'drink_counter') return false;
    const vip = ctx.state.me.vip;
    void ctx.ui
      .choose({
        title: `🍹 Thực đơn (bạn có ${fmt(ctx.state.me.xu)} Xu${vip ? ' · VIP giảm 50%' : ''})`,
        options: DRINKS.menu.map((d) => {
          const price = Math.round(d.price * (vip ? DRINKS.vipDiscount : 1));
          return {
            value: d.id,
            label: `${d.name} — ${price} Xu`,
            sub: `Say +${d.say} · Tạp Niệm +${d.tapNiem}`,
            icon: d.id.startsWith('bia') ? '🍺' : d.id.startsWith('mojito') ? '🍹' : '🍶',
            disabled: ctx.state.me.xu < price,
          };
        }),
      })
      .then((id) => {
        if (id) ctx.send('buy', { id });
      });
    return true;
  },
  onKey(e, down, ctx) {
    if (e.code !== 'Space') return false;
    if (down && !e.repeat && ctx.me()?.held?.kind === 'drink_glass') {
      ctx.send('drink');
      ctx.setLocalAnim('drink');
      drinkUntil = performance.now() + 1300;
      ctx.audio.play('pour', { volume: 0.5, rate: 1.3 });
      setTimeout(() => ctx.audio.play('burp', { volume: 0.8 }), 900);
    }
    return true;
  },
  update(_dt, ctx) {
    const holding = ctx.me()?.held?.kind === 'drink_glass';
    ctx.setOpen(holding);
    if (drinkUntil && performance.now() > drinkUntil) {
      drinkUntil = 0;
      ctx.setLocalAnim(null);
    }
  },
  unmount(ctx) {
    ctx.setOpen(false);
  },
};

// ───────────────────────── Vòng quay sự thật ─────────────────────────

let wheel: TruthWheelState | null = null;
let spin: { from: number; to: number; start: number; end: number } | null = null;
let lastSeg = -1;

export const truthWheelClient: ActivityClientModule = {
  id: 'truthwheel',
  maps: ['bar'],
  prompt(station, ctx) {
    if (station.kind !== 'truth_wheel') return undefined;
    const left = wheel ? Math.ceil((wheel.cooldownUntil - ctx.serverNow()) / 1000) : 0;
    return left > 0 ? `Vòng quay đang nghỉ (${left} giây)` : '🎡 Quay vòng sự thật';
  },
  onState(s, ctx) {
    const next = s as TruthWheelState;
    const isNew = !wheel || next.startAt !== wheel.startAt;
    wheel = next;
    const disc = ctx.world.anchor('truth_wheel_disc');
    if (!disc || !isNew || next.endAt < ctx.serverNow()) return;
    const from = disc.rotation.z;
    spin = { from, to: wheelFinalAngle(from, next.segment, 6), start: next.startAt, end: next.endAt };
  },
  update(_dt, ctx) {
    const disc = ctx.world.anchor('truth_wheel_disc');
    if (!disc || !spin) return;
    const now = ctx.serverNow();
    const k = Math.max(0, Math.min(1, (now - spin.start) / (spin.end - spin.start)));
    const ease = 1 - Math.pow(1 - k, 3.2);
    disc.rotation.z = spin.from + (spin.to - spin.from) * ease;
    const seg = Math.floor(disc.rotation.z / ((Math.PI * 2) / 12));
    if (seg !== lastSeg) {
      lastSeg = seg;
      if (k > 0 && k < 1) ctx.audio.play('wheel_tick', { volume: 0.5 });
    }
    if (k >= 1) spin = null;
  },
};

// ───────────────────────── Bầu Cua ─────────────────────────

const ICON: Record<BauCuaSymbol, string> = { bau: '🍐', cua: '🦀', tom: '🦐', ca: '🐟', ga: '🐓', nai: '🦌' };
/** Mặt khối lập phương (thứ tự vật liệu BoxGeometry: +x, −x, +y, −y, +z, −z) ứng với từng con. */
const FACE: Record<BauCuaSymbol, number> = { cua: 0, tom: 1, bau: 2, nai: 3, ca: 4, ga: 5 };
const UP_ROT: Record<number, [number, number, number]> = {
  0: [0, 0, Math.PI / 2],
  1: [0, 0, -Math.PI / 2],
  2: [0, 0, 0],
  3: [Math.PI, 0, 0],
  4: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0],
};

let bc: BauCuaState | null = null;
let bcPanel: PanelHandle | null = null;
let dice: THREE.Group | null = null;
let diceMeshes: THREE.Mesh[] = [];
let bcLeft = -1;

function makeDice(ctx: ClientActivityContext): void {
  const top = ctx.world.anchor('baucua_table_top');
  if (!top || dice) return;
  const faces = BAUCUA_SYMBOLS.slice()
    .sort((a, b) => FACE[a] - FACE[b])
    .map((sym) => {
      const tex = kit.canvasTexture(128, 128, (c, w, h) => {
        c.fillStyle = '#fffaf0';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = '#c8322a';
        c.lineWidth = 8;
        c.strokeRect(4, 4, w - 8, h - 8);
        c.font = `80px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(ICON[sym], w / 2, h / 2 + 4);
      });
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    });
  dice = new THREE.Group();
  dice.position.copy(top.position).add(new THREE.Vector3(0, 0.02, 0));
  dice.add(kit.mesh(kit.geo.cyl(0.55, 0.5, 0.05, 20), kit.mat('#f2f6ff'), { y: 0.02 }));
  const bowl = kit.mesh(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.mat('#c8322a', { doubleSide: true }), { y: 0.05 });
  bowl.name = 'bowl';
  dice.add(bowl);
  diceMeshes = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), faces);
    m.castShadow = true;
    m.position.set(-0.25 + i * 0.25, 0.15, (i % 2) * 0.12 - 0.06);
    dice!.add(m);
    return m;
  });
  ctx.world.scene.add(dice);
}

function renderBauCua(ctx: ClientActivityContext): void {
  if (!bcPanel || bcPanel.closed || !bc) return;
  const b = bcPanel.body;
  b.replaceChildren();
  const now = ctx.serverNow();
  const left = Math.max(0, Math.ceil((bc.endsAt - now) / 1000));
  const phaseText =
    bc.phase === 'betting' ? `Đặt cược — còn ${left} giây` : bc.phase === 'rolling' ? 'Nhà cái đang lắc…' : bc.phase === 'payout' ? 'Trả thưởng!' : 'Sòng đang nghỉ — bấm E ở bàn để mở ván';
  const head = el('div', 'bc-head', b);
  el('div', `bc-phase ${bc.phase}`, head, phaseText);
  const mine = bc.bets[ctx.state.me.pid] ?? {};
  el('div', 'bc-wallet', head, `🪙 ${fmt(ctx.state.me.xu)} Xu · cược ${totalBet(mine)}/${BAUCUA.maxBetPerRound}`);
  const grid = el('div', 'bc-grid', b);
  for (const sym of BAUCUA_SYMBOLS) {
    const tile = el('button', `bc-tile ${bc.dice.includes(sym) ? 'hit' : ''}`, grid);
    el('div', 'bc-icon', tile, ICON[sym]);
    el('div', 'bc-name', tile, BAUCUA_NAMES[sym]);
    const total = Object.values(bc.bets).reduce((a, x) => a + (x[sym] ?? 0), 0);
    el('div', 'bc-bets', tile, `${mine[sym] ? `Bạn ${mine[sym]} · ` : ''}Tổng ${total}`);
    const count = bc.dice.filter((d) => d === sym).length;
    if (count) el('div', 'bc-count', tile, `×${count}`);
    tile.onclick = () => ctx.send('bet', { sym });
    tile.oncontextmenu = (e) => {
      e.preventDefault();
      ctx.send('unbet', { sym });
    };
  }
  el('div', 'bc-hint', b, `Chuột trái: đặt ${BAUCUA.chip} Xu · Chuột phải: gỡ · Ô ra m mặt nhận lại cược × (1 + m)`);
}

export const bauCuaClient: ActivityClientModule = {
  id: 'baucua',
  maps: ['bar'],
  mount(ctx) {
    makeDice(ctx);
  },
  prompt(station) {
    if (station.kind !== 'baucua_table') return undefined;
    return !bc || bc.phase === 'idle' ? '🎲 Mở sòng Bầu Cua' : '🎲 Đặt cược Bầu Cua';
  },
  interact(station, ctx) {
    if (station.kind !== 'baucua_table') return false;
    if (!bc || bc.phase === 'idle') return false;
    bcPanel?.close();
    bcPanel = ctx.ui.openPanel({ id: 'baucua', title: '🎲 Bầu Cua Cá Cọp', width: 560, onClose: () => (bcPanel = null) });
    renderBauCua(ctx);
    return true;
  },
  onState(s, ctx) {
    const prev = bc;
    bc = s as BauCuaState;
    if (prev?.phase === 'idle' && bc.phase === 'betting' && !bcPanel) {
      const me = ctx.me();
      if (me && Math.hypot(me.x - 17.5, me.z - 8.2) < 5) {
        bcPanel = ctx.ui.openPanel({ id: 'baucua', title: '🎲 Bầu Cua Cá Cọp', width: 560, onClose: () => (bcPanel = null) });
      }
    }
    if (bc.phase === 'payout' && prev?.phase !== 'payout') ctx.audio.play('coin', { volume: 0.6 });
    renderBauCua(ctx);
  },
  update(_dt, ctx) {
    if (!dice || !bc) return;
    const t = performance.now() / 1000;
    const bowl = dice.getObjectByName('bowl')!;
    if (bc.phase === 'rolling') {
      bowl.position.y = 0.05 + Math.abs(Math.sin(t * 18)) * 0.06;
      bowl.rotation.z = Math.sin(t * 20) * 0.15;
      bowl.visible = true;
      diceMeshes.forEach((m, i) => {
        m.rotation.set(t * 9 + i, t * 7 + i * 2, t * 11);
        m.position.y = 0.15 + Math.abs(Math.sin(t * 15 + i)) * 0.05;
      });
    } else if (bc.phase === 'payout') {
      bowl.visible = false;
      diceMeshes.forEach((m, i) => {
        const sym = bc!.dice[i];
        if (!sym) return;
        const r = UP_ROT[FACE[sym]]!;
        m.rotation.set(r[0], r[1] + i * 0.5, r[2]);
        m.position.y = 0.15;
      });
    } else {
      bowl.visible = true;
      bowl.position.y = 0.05;
      bowl.rotation.z = 0;
    }
    const left = Math.ceil((bc.endsAt - ctx.serverNow()) / 1000);
    if (bcPanel && left !== bcLeft) {
      bcLeft = left;
      renderBauCua(ctx);
    }
  },
  unmount(ctx) {
    bcPanel?.close();
    if (dice) ctx.world.scene.remove(dice);
    dice = null;
    diceMeshes = [];
  },
};
