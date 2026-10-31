// Hoạt động cá nhân ở Chùa (client): Quét lá, Xách nước, Phóng sinh, Thiền định, Tủ áo, Đón khách, Nhập kho.
import * as THREE from 'three';
import {
  ACCESSORY_IDS,
  ACCESSORY_NAMES,
  ANIMAL_NAMES,
  HAT_IDS,
  HAT_NAMES,
  MEDITATE,
  RANK_NAMES,
  ROBE_NAMES,
  SWEEP,
  THOUGHT_WORDS,
  WARDROBE_UNLOCKS,
  WATER,
  hashString,
  rankAtLeast,
  type AnimalId,
  type MonkRobeId,
  type Outfit,
} from '@shared/index';
import {
  meditationSchedule,
  type Disturbance,
  type GuestPublicState,
  type MeditateOpenData,
  type ReleasePublicState,
  type SweepPublicState,
  type SweepThoughtEvent,
  type WaterPublicState,
} from '@shared/activities/temple';
import { createAvatar, npcLook, playerLook } from '../../art/avatar';
import { kit } from '../../art/kit';
import { createHeldItemMesh } from '../../art/props';
import type { NpcHandle } from '../../engine/worldApi';
import type { OverlayHandle, PanelHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

// ───────────────────────── Quét lá ─────────────────────────

const MAX_LEAVES = 120;
let leafMesh: THREE.InstancedMesh | null = null;
let sweepState: SweepPublicState | null = null;
let bag = 0;
let sweepHud: { overlay: OverlayHandle; bag: HTMLElement; thought: HTMLElement } | null = null;
let thought: SweepThoughtEvent | null = null;
let sweepAcc = 0;
let sweeping = false;

function leafGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.14);
  s.bezierCurveTo(0.15, -0.02, 0.12, 0.14, 0, 0.09);
  s.bezierCurveTo(-0.12, 0.14, -0.15, -0.02, 0, -0.14);
  return new THREE.ShapeGeometry(s, 3);
}

function ensureSweepHud(ctx: ClientActivityContext): void {
  if (sweepHud) return;
  const overlay = ctx.ui.openOverlay('sweep');
  const root = el('div', 'sweep-hud', overlay.el);
  const bagEl = el('div', 'sweep-bag', root);
  const th = el('div', 'sweep-thought', root);
  sweepHud = { overlay, bag: bagEl, thought: th };
}

function renderSweepHud(ctx: ClientActivityContext): void {
  const holding = ctx.me()?.held?.kind === 'broom';
  if (!holding && bag === 0 && !thought) {
    sweepHud?.overlay.close();
    sweepHud = null;
    return;
  }
  ensureSweepHud(ctx);
  sweepHud!.bag.textContent = `🍂 Bao lá ${bag}/${SWEEP.bagMax}${holding ? ' · giữ Space để quét' : ''}${bag > 0 ? ' · đổ ở gốc Bồ đề' : ''}`;
  sweepHud!.bag.classList.toggle('full', bag >= SWEEP.bagMax);
  if (thought) {
    sweepHud!.thought.replaceChildren();
    el('span', 'thought-word', sweepHud!.thought, `💭 ${thought.word}`);
    el('kbd', 'key', sweepHud!.thought, thought.key);
    sweepHud!.thought.classList.add('show');
  } else {
    sweepHud!.thought.classList.remove('show');
  }
}

export const sweepClient: ActivityClientModule = {
  id: 'sweep',
  maps: ['temple'],
  mount(ctx) {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, flatShading: true, roughness: 0.8 });
    leafMesh = new THREE.InstancedMesh(leafGeometry(), mat, MAX_LEAVES);
    leafMesh.count = 0;
    leafMesh.castShadow = false;
    leafMesh.receiveShadow = true;
    leafMesh.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < MAX_LEAVES; i++) leafMesh.setColorAt(i, c.set(['#7cbf4a', '#9ccc65', '#c9c25a', '#e0b84a', '#6fae4e'][i % 5]!));
    ctx.world.scene.add(leafMesh);
  },
  unmount(ctx) {
    if (leafMesh) {
      ctx.world.scene.remove(leafMesh);
      leafMesh.geometry.dispose();
      (leafMesh.material as THREE.Material).dispose();
      leafMesh.dispose();
    }
    leafMesh = null;
    sweepHud?.overlay.close();
    sweepHud = null;
    thought = null;
    bag = 0;
    ctx.setOpen(false);
  },
  prompt(station, ctx) {
    const held = ctx.me()?.held;
    if (station.kind === 'broom_rack') {
      if (held?.kind === 'broom') return 'Trả chổi lên giá';
      if (held) return null;
      return sweepState && sweepState.brooms >= 4 ? 'Giá chổi (hết chổi)' : 'Lấy chổi tre';
    }
    if (station.kind === 'tree_root') return bag > 0 ? `Đổ lá vào gốc cây (${bag} lá)` : null;
    return undefined;
  },
  onState(s) {
    sweepState = s as SweepPublicState;
  },
  onEvent(type, data, ctx) {
    if (type === 'bag') {
      const d = data as { count: number; full?: boolean };
      if (d.full && bag >= SWEEP.bagMax) ctx.ui.toast('Bao đầy rồi! Mang ra đổ ở gốc cây Bồ đề.', 'warn');
      bag = d.count;
    } else if (type === 'thought') {
      thought = data as SweepThoughtEvent;
      ctx.audio.play('pop', { volume: 0.6 });
    } else if (type === 'thought_result') {
      const d = data as { ok: boolean };
      ctx.ui.toast(d.ok ? 'Dẹp được tạp niệm! Tâm an.' : 'Tạp niệm lấn tới… +1 Tạp Niệm', d.ok ? 'good' : 'warn');
      thought = null;
    } else if (type === 'dumped') {
      const d = data as { x: number; z: number };
      ctx.world.burst(d.x, d.z, 'leaves', 30);
      ctx.audio.play('leaf', { volume: 0.8 });
    }
    renderSweepHud(ctx);
  },
  onKey(e, down, ctx) {
    if (thought && down && !e.repeat && /^Key[A-Z]$/.test(e.code) && 'JKLUIO'.includes(e.code[3]!)) {
      ctx.send('thought', { id: thought.id, key: e.code[3] });
      return true;
    }
    if (e.code !== 'Space') return false;
    sweeping = down && ctx.me()?.held?.kind === 'broom';
    return true;
  },
  update(dt, ctx) {
    const me = ctx.me();
    const holding = me?.held?.kind === 'broom';
    // Đang ở hoạt động khác (ngồi gõ mõ, kéo chuông…) thì chổi tạm "nghỉ", không giành phím.
    const busy = !!me?.activity && me.activity !== 'sweep';
    ctx.setOpen((holding || !!thought) && !busy);
    if (!holding || busy) sweeping = false;
    // Mất sự kiện thả Space (mở chat/bảng giữa chừng) → không quét mãi.
    if (sweeping && (!ctx.input.isDown('Space') || ctx.ui.isTyping() || ctx.ui.isModalOpen())) sweeping = false;
    if (sweeping) {
      ctx.setLocalAnim('sweep');
      sweepAcc += dt * 1000;
      if (sweepAcc >= SWEEP.sweepIntervalMs) {
        sweepAcc = 0;
        ctx.send('sweep', { ry: me!.ry });
        ctx.audio.play('sweep', { volume: 0.6, rate: 0.9 + Math.random() * 0.2 });
        if (Math.random() < 0.5) ctx.world.burst(me!.x + Math.sin(me!.ry) * 1.1, me!.z + Math.cos(me!.ry) * 1.1, 'leaves', 5);
      }
    } else if (holding) {
      ctx.setLocalAnim(null);
    }
    if (thought && ctx.serverNow() > thought.expiresAt + 400) thought = null;
    renderSweepHud(ctx);
    // Lá: đang rơi thì chao lượn, nằm xuống thì phẳng trên đất.
    if (!leafMesh || !sweepState) return;
    const now = ctx.serverNow();
    const t = now / 1000;
    const d = new THREE.Object3D();
    const leaves = sweepState.leaves;
    const n = Math.min(MAX_LEAVES, leaves.length);
    for (let i = 0; i < n; i++) {
      const l = leaves[i]!;
      const k = Math.max(0, Math.min(1, (now - l.spawnAt) / Math.max(1, l.settleAt - l.spawnAt)));
      if (k < 1) {
        const sway = Math.sin(t * 3 + l.id) * (1 - k) * 0.6;
        d.position.set(l.sx + (l.x - l.sx) * k + sway, 7.5 * (1 - k) + 0.04, l.sz + (l.z - l.sz) * k + Math.cos(t * 2.3 + l.id) * (1 - k) * 0.4);
        d.rotation.set(t * 2 + l.id, t * 1.3, Math.sin(t * 4 + l.id) * 0.8);
      } else {
        d.position.set(l.x, 0.035, l.z);
        d.rotation.set(-Math.PI / 2, 0, (l.id * 2.39) % (Math.PI * 2));
      }
      d.scale.setScalar(1.1);
      d.updateMatrix();
      leafMesh.setMatrixAt(i, d.matrix);
    }
    leafMesh.count = n;
    leafMesh.instanceMatrix.needsUpdate = true;
  },
};

// ───────────────────────── Xách nước ─────────────────────────

let waterState: WaterPublicState | null = null;
let crank: { overlay: OverlayHandle; count: HTMLElement; fill: HTMLElement; keys: HTMLElement[]; next: 'KeyA' | 'KeyD'; presses: number; start: number; timeout: number } | null = null;

function closeCrank(ctx: ClientActivityContext): void {
  crank?.overlay.close();
  crank = null;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
}

export const waterClient: ActivityClientModule = {
  id: 'water',
  maps: ['temple'],
  prompt(station, ctx) {
    const held = ctx.me()?.held;
    if (station.kind === 'well') return held ? null : 'Kéo nước giếng';
    if (station.kind === 'water_jar') {
      const lv = waterState?.jars[station.id] ?? 0;
      return held?.kind === 'water_bucket' ? `Đổ nước vào chum (${lv}/${WATER.jarCapacity})` : null;
    }
    return undefined;
  },
  onState(s, ctx) {
    waterState = s as WaterPublicState;
    for (const [id, lv] of Object.entries(waterState.jars)) ctx.world.controls.setJarLevel?.(id, lv / WATER.jarCapacity);
  },
  onOpen(data, ctx) {
    const d = data as { presses: number; timeoutMs: number; stationId: string };
    const st = ctx.world.map.stations.find((s) => s.id === d.stationId);
    if (st) ctx.snapTo(st.x, st.z, st.ry);
    ctx.lockMovement(true);
    ctx.setLocalAnim('crank');
    const overlay = ctx.ui.openOverlay('water');
    const root = el('div', 'act-hud', overlay.el);
    el('div', 'act-title', root, 'Kéo gàu nước!');
    el('div', 'act-sub', root, 'Bấm A, D xen kẽ thật nhanh');
    const keysRow = el('div', 'act-keys', root);
    const keys = [el('div', 'act-key on', keysRow, 'A'), el('div', 'act-key', keysRow, 'D')];
    const bar = el('div', 'act-bar', root);
    const fill = el('div', 'act-bar-fill', bar);
    const count = el('div', 'act-sub', root, `0/${d.presses}`);
    crank = { overlay, count, fill, keys, next: 'KeyA', presses: 0, start: performance.now(), timeout: d.timeoutMs };
  },
  onKey(e, down, ctx) {
    if (!crank) return false;
    if (e.code !== 'KeyA' && e.code !== 'KeyD') return false;
    if (!down || e.repeat) return true;
    if (e.code === crank.next) {
      crank.presses++;
      crank.next = crank.next === 'KeyA' ? 'KeyD' : 'KeyA';
      crank.keys[0]!.classList.toggle('on', crank.next === 'KeyA');
      crank.keys[1]!.classList.toggle('on', crank.next === 'KeyD');
      ctx.audio.play('crank', { volume: 0.6, rate: 0.9 + crank.presses * 0.02 });
      crank.count.textContent = `${crank.presses}/${WATER.crankPresses}`;
      crank.fill.style.width = `${(crank.presses / WATER.crankPresses) * 100}%`;
      if (crank.presses >= WATER.crankPresses) {
        ctx.send('crank', { presses: crank.presses });
        ctx.audio.play('splash', { volume: 0.7 });
      }
    }
    return true;
  },
  update(_dt, ctx) {
    if (!crank) return;
    const left = crank.timeout - (performance.now() - crank.start);
    if (left < -1500) closeCrank(ctx);
  },
  onClose(_r, ctx) {
    closeCrank(ctx);
  },
  unmount(ctx) {
    if (crank) closeCrank(ctx);
  },
};

// ───────────────────────── Phóng sinh ─────────────────────────

let releaseState: ReleasePublicState | null = null;
let cartGroup: THREE.Group | null = null;
const flying: { obj: THREE.Object3D; t: number; vx: number; vz: number; kind: string }[] = [];

function renderCart(ctx: ClientActivityContext): void {
  const top = ctx.world.anchor('release_cart_top');
  if (!top || !releaseState) return;
  if (!cartGroup) {
    cartGroup = new THREE.Group();
    ctx.world.scene.add(cartGroup);
  }
  cartGroup.clear();
  cartGroup.position.copy(top.position);
  releaseState.cart.forEach((a, i) => {
    const m = createHeldItemMesh({ kind: 'animal', variant: a });
    m.position.set(-0.85 + (i % 3) * 0.85, 0.0, i < 3 ? -0.2 : 0.25);
    m.scale.setScalar(0.9);
    cartGroup!.add(m);
  });
}

export const releaseClient: ActivityClientModule = {
  id: 'release',
  maps: ['temple'],
  prompt(station, ctx) {
    const held = ctx.me()?.held;
    if (station.kind === 'release_cart') {
      if (held) return null;
      return releaseState && releaseState.cart.length === 0 ? 'Xe phóng sinh (đang trống, chờ thêm)' : 'Xe phóng sinh — chọn con vật';
    }
    if (station.kind === 'pond_release') return held?.kind === 'animal' ? `Thả ${ANIMAL_NAMES[held.variant as AnimalId]?.toLowerCase() ?? ''} xuống ao` : null;
    if (station.kind === 'forest_release') return held?.kind === 'animal' ? `Thả ${ANIMAL_NAMES[held.variant as AnimalId]?.toLowerCase() ?? ''} về rừng` : null;
    return undefined;
  },
  interact(station, ctx) {
    if (station.kind !== 'release_cart') return false;
    const cart = releaseState?.cart ?? [];
    if (!cart.length) return true;
    const icons: Record<AnimalId, string> = { ca: '🐟', rua: '🐢', chim: '🐦' };
    void ctx.ui
      .choose({
        title: '🐾 Chọn con vật để phóng sinh',
        options: cart.map((a, i) => ({
          value: String(i),
          label: ANIMAL_NAMES[a],
          sub: a === 'chim' ? 'Thả ở bìa rừng phía Đông' : 'Thả ở ao sen',
          icon: icons[a],
        })),
      })
      .then((v) => {
        if (v !== null) ctx.send('take', { index: Number(v) });
      });
    return true;
  },
  onState(s, ctx) {
    releaseState = s as ReleasePublicState;
    renderCart(ctx);
  },
  onEvent(type, data, ctx) {
    if (type !== 'released') return;
    const d = data as { animal: AnimalId; x: number; z: number; ry: number };
    if (d.animal === 'chim') {
      const bird = new THREE.Group();
      bird.add(kit.mesh(kit.geo.sphere(0.12, 8, 6), kit.mat('#4fb3e8'), { scale: [1, 0.9, 1.3] }));
      for (const s of [-1, 1]) bird.add(kit.mesh(kit.geo.box(0.32, 0.02, 0.14), kit.mat('#2f7fb5'), { x: s * 0.18 }));
      bird.position.set(d.x, 1.4, d.z);
      ctx.world.scene.add(bird);
      flying.push({ obj: bird, t: 0, vx: Math.sin(d.ry) * 3, vz: Math.cos(d.ry) * 3, kind: 'bird' });
      ctx.world.burst(d.x, d.z, 'hearts', 10);
    } else {
      const fx = d.x + Math.sin(d.ry) * 2;
      const fz = d.z + Math.cos(d.ry) * 2;
      ctx.world.burst(fx, fz, 'splash', 26);
      const fish = createHeldItemMesh({ kind: 'animal', variant: d.animal });
      fish.position.set(fx, 0.2, fz);
      ctx.world.scene.add(fish);
      flying.push({ obj: fish, t: 0, vx: Math.sin(d.ry) * 1.2, vz: Math.cos(d.ry) * 1.2, kind: 'fish' });
    }
  },
  update(dt, ctx) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]!;
      f.t += dt;
      if (f.kind === 'bird') {
        f.obj.position.x += f.vx * dt;
        f.obj.position.z += f.vz * dt;
        f.obj.position.y += dt * 2.2;
        f.obj.children.slice(1).forEach((w, k) => (w.rotation.z = Math.sin(f.t * 18) * 0.7 * (k ? -1 : 1)));
      } else {
        f.obj.position.x += f.vx * dt;
        f.obj.position.z += f.vz * dt;
        f.obj.position.y = 0.2 + Math.sin(Math.min(1, f.t / 0.9) * Math.PI) * 1.1 - (f.t > 0.9 ? (f.t - 0.9) * 2 : 0);
        f.obj.rotation.z += dt * 6;
      }
      if (f.t > (f.kind === 'bird' ? 3 : 1.4)) {
        ctx.world.scene.remove(f.obj);
        flying.splice(i, 1);
      }
    }
  },
  unmount(ctx) {
    if (cartGroup) ctx.world.scene.remove(cartGroup);
    cartGroup = null;
    for (const f of flying) ctx.world.scene.remove(f.obj);
    flying.length = 0;
  },
};

// ───────────────────────── Thiền định ─────────────────────────

interface MedSession {
  data: MeditateOpenData;
  schedule: Disturbance[];
  angle: number;
  vel: number;
  green: number;
  yellow: number;
  sent: boolean;
  active: { d: Disturbance; until: number; done: boolean } | null;
  next: number;
  overlay: OverlayHandle;
  gauge: HTMLElement;
  needle: HTMLElement;
  timer: HTMLElement;
  popup: HTMLElement;
  zone: HTMLElement;
}
let med: MedSession | null = null;

function kick(s: MedSession, ctx: ClientActivityContext): void {
  s.vel += (Math.random() < 0.5 ? -1 : 1) * MEDITATE.kickDeg * 4;
  ctx.world.shake(0.25);
  ctx.audio.play('fail', { volume: 0.4 });
}

export const meditateClient: ActivityClientModule = {
  id: 'meditate',
  maps: ['temple'],
  prompt(station) {
    if (station.kind !== 'meditation_cushion') return undefined;
    // Đang ngồi thiền thì không hiện nút ngồi nữa.
    return med ? null : 'Ngồi thiền định tâm (40 giây)';
  },
  onOpen(data, ctx) {
    const d = data as MeditateOpenData;
    const st = ctx.world.map.stations.find((s) => s.id === d.stationId);
    if (st) ctx.snapTo(st.x, st.z, st.ry);
    ctx.lockMovement(true);
    ctx.setLocalAnim('sit');
    const overlay = ctx.ui.openOverlay('meditate');
    const root = el('div', 'act-hud med-hud', overlay.el);
    el('div', 'act-title', root, 'Thiền định — giữ tâm ở giữa');
    const gauge = el('div', 'med-gauge', root);
    el('div', 'med-arc red', gauge);
    el('div', 'med-arc yellow', gauge);
    el('div', 'med-arc green', gauge);
    const needle = el('div', 'med-needle', gauge);
    const zone = el('div', 'med-zone', root, 'Tâm an');
    const timer = el('div', 'act-sub', root);
    el('div', 'act-hint', root, 'A / D đẩy con lắc về giữa · Muỗi/tạp niệm: bấm phím hiện ra · "Rầm!": đừng bấm gì');
    const popup = el('div', 'med-popup', overlay.el);
    med = {
      data: d,
      schedule: meditationSchedule(d.seed, THOUGHT_WORDS),
      angle: 0,
      vel: 0,
      green: 0,
      yellow: 0,
      sent: false,
      active: null,
      next: 0,
      overlay,
      gauge,
      needle,
      timer,
      popup,
      zone,
    };
  },
  onKey(e, down, ctx) {
    if (!med) return false;
    const a = med.active;
    if (down && !e.repeat && a && !a.done) {
      if (a.d.kind === 'noise') {
        a.done = true;
        kick(med, ctx);
        med.popup.textContent = 'Động tâm rồi!';
      } else if (/^Key[A-Z]$/.test(e.code) && e.code[3] === a.d.key) {
        a.done = true;
        med.popup.classList.remove('show');
        ctx.audio.play(a.d.kind === 'mosquito' ? 'pop' : 'karma', { volume: 0.6 });
        return true;
      }
    }
    return ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space'].includes(e.code) || /^Key[JKLUIO]$/.test(e.code);
  },
  update(dt, ctx) {
    const s = med;
    if (!s) return;
    const now = ctx.serverNow();
    const el0 = now - s.data.startAt;
    const k = Math.max(0, Math.min(1, el0 / s.data.durationMs));
    if (el0 < 0) {
      s.timer.textContent = `Hít thở… bắt đầu sau ${Math.ceil(-el0 / 1000)}`;
      return;
    }
    // Con lắc mất cân bằng dần: lực nhiễu tăng theo thời gian, A/D đẩy ngược.
    // Lực đổ chỉ tăng tới góc 30° (tối đa ~96) nên lực đẩy A/D (115) LUÔN kéo về được, kể cả khi đã rơi hết.
    const push = (ctx.input.isDown('KeyD') ? 1 : 0) - (ctx.input.isDown('KeyA') ? 1 : 0);
    const lean = Math.max(-30, Math.min(30, s.angle));
    s.vel += (lean * (0.8 + k * 1.6) + Math.sin(now / 900) * (6 + k * 18) + push * 115) * dt;
    s.vel *= Math.exp(-dt * 1.6);
    s.angle += s.vel * dt;
    // Chạm đáy thì dừng hẳn (không tích vận tốc ép xuống), bấm ngược là lên ngay.
    if (Math.abs(s.angle) > 80) {
      s.angle = Math.sign(s.angle) * 80;
      if (Math.sign(s.vel) === Math.sign(s.angle)) s.vel = 0;
    }
    const abs = Math.abs(s.angle);
    if (abs <= MEDITATE.greenDeg) s.green += dt;
    else if (abs <= MEDITATE.yellowDeg) s.yellow += dt;
    s.needle.style.transform = `rotate(${s.angle}deg)`;
    s.zone.textContent = abs <= MEDITATE.greenDeg ? 'Tâm an' : abs <= MEDITATE.yellowDeg ? 'Hơi xao động' : 'Mất định!';
    s.zone.className = `med-zone ${abs <= MEDITATE.greenDeg ? 'green' : abs <= MEDITATE.yellowDeg ? 'yellow' : 'red'}`;
    s.timer.textContent = `${Math.max(0, Math.ceil((s.data.durationMs - el0) / 1000))} giây · định tâm ${Math.round(((s.green + s.yellow * 0.5) / (s.data.durationMs / 1000)) * 100)}%`;
    // Nhiễu.
    const next = s.schedule[s.next];
    if (next && el0 >= next.at && !s.active) {
      s.next++;
      s.active = { d: next, until: el0 + (next.kind === 'noise' ? MEDITATE.stillWindowMs : MEDITATE.keyWindowMs), done: false };
      s.popup.replaceChildren();
      if (next.kind === 'mosquito') {
        el('span', '', s.popup, '🦟 Muỗi vo ve! ');
        el('kbd', 'key', s.popup, next.key);
        ctx.audio.play('mosquito');
      } else if (next.kind === 'thought') {
        el('span', '', s.popup, `💭 ${next.word} `);
        el('kbd', 'key', s.popup, next.key);
        ctx.audio.play('pop', { volume: 0.5 });
      } else {
        el('span', '', s.popup, '💥 Rầm! Đừng bấm gì…');
        ctx.audio.play('thud');
        ctx.world.shake(0.6);
      }
      s.popup.classList.add('show');
    }
    if (s.active && el0 > s.active.until) {
      if (!s.active.done && s.active.d.kind !== 'noise') kick(s, ctx);
      if (s.active.d.kind === 'noise' && !s.active.done) ctx.audio.play('karma', { volume: 0.5 });
      s.active = null;
      s.popup.classList.remove('show');
    }
    if (el0 >= s.data.durationMs && !s.sent) {
      s.sent = true;
      const score = (s.green + s.yellow * 0.5) / (s.data.durationMs / 1000);
      ctx.send('finish', { score: Math.max(0, Math.min(1, score)) });
      ctx.audio.play('bell_small');
    }
  },
  onClose(_r, ctx) {
    med?.overlay.close();
    med = null;
    ctx.lockMovement(false);
    ctx.setLocalAnim(null);
  },
  unmount(ctx) {
    if (med) {
      med.overlay.close();
      med = null;
      ctx.lockMovement(false);
      ctx.setLocalAnim(null);
    }
  },
};

// ───────────────────────── Tủ áo ─────────────────────────

let wardrobePanel: PanelHandle | null = null;
let preview: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; avatar: ReturnType<typeof createAvatar>; raf: number } | null = null;

function lockText(req: number | 'vip'): string {
  return req === 'vip' ? 'Cần Vé VIP' : `Cần ${new Intl.NumberFormat('vi-VN').format(req)} Công Đức`;
}

function openWardrobe(ctx: ClientActivityContext): void {
  wardrobePanel?.close();
  const me = ctx.state.me;
  let tab: 'robe' | 'hat' | 'accessory' = 'robe';
  const draft: Outfit = { ...me.outfit };
  wardrobePanel = ctx.ui.openPanel({
    id: 'wardrobe',
    title: '👘 Tủ áo Tăng xá',
    width: 680,
    className: 'wardrobe-panel',
    onClose: () => {
      if (preview) {
        cancelAnimationFrame(preview.raf);
        preview.avatar.dispose();
        preview.renderer.dispose();
        preview = null;
      }
      wardrobePanel = null;
    },
  });
  const wrap = el('div', 'wd-wrap', wardrobePanel.body);
  const left = el('div', 'wd-preview', wrap);
  const right = el('div', 'wd-right', wrap);
  const tabs = el('div', 'wd-tabs', right);
  const grid = el('div', 'wd-grid', right);
  // Xem trước 3D quay tròn.
  const canvas = el('canvas', 'wd-canvas', left);
  canvas.width = 240;
  canvas.height = 300;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#7a5a3a', 2.4));
  const key = new THREE.DirectionalLight('#ffffff', 1.8);
  key.position.set(2, 3, 2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 240 / 300, 0.1, 20);
  camera.position.set(0, 1.25, 4.4);
  camera.lookAt(0, 0.95, 0);
  const avatar = createAvatar(playerLook({ outfit: draft, isHost: false, vip: me.vip }, hashString(me.pid)));
  scene.add(avatar.root);
  const loop = () => {
    if (!preview) return;
    const t = performance.now() / 1000;
    avatar.root.rotation.y = t * 0.8;
    avatar.update(1 / 60, t, 0);
    renderer.render(scene, camera);
    preview.raf = requestAnimationFrame(loop);
  };
  preview = { renderer, scene, camera, avatar, raf: 0 };
  preview.raf = requestAnimationFrame(loop);
  el('div', 'wd-note', left, me.isHost ? 'Khi là Phương Trượng, bộ cà sa đỏ sẽ đè lên đồ đang mặc.' : 'Thăng cấp sẽ tự thay áo mới.');

  const setPreview = (o: Outfit) => avatar.setLook(playerLook({ outfit: o, isHost: false, vip: me.vip }, hashString(me.pid)));
  const render = () => {
    tabs.replaceChildren();
    for (const [id, label] of [
      ['robe', 'Áo'],
      ['hat', 'Mũ'],
      ['accessory', 'Phụ kiện'],
    ] as const) {
      const b = el('button', `wd-tab ${tab === id ? 'on' : ''}`, tabs, label);
      b.onclick = () => {
        tab = id;
        render();
      };
    }
    grid.replaceChildren();
    const cur = ctx.state.me;
    const items: { id: string; name: string; req: number | 'vip'; unlocked: boolean; on: boolean }[] =
      tab === 'robe'
        ? (Object.keys(WARDROBE_UNLOCKS.robes) as MonkRobeId[]).map((r) => ({ id: r, name: ROBE_NAMES[r], req: WARDROBE_UNLOCKS.robes[r], unlocked: cur.unlocked.robes.includes(r), on: cur.outfit.robe === r }))
        : tab === 'hat'
          ? HAT_IDS.map((h) => ({ id: h, name: HAT_NAMES[h], req: WARDROBE_UNLOCKS.hats[h], unlocked: cur.unlocked.hats.includes(h), on: cur.outfit.hat === h }))
          : ACCESSORY_IDS.map((a) => ({ id: a, name: ACCESSORY_NAMES[a], req: WARDROBE_UNLOCKS.accessories[a], unlocked: cur.unlocked.accessories.includes(a), on: cur.outfit.accessory === a }));
    for (const it of items) {
      const b = el('button', `wd-item ${it.on ? 'on' : ''} ${it.unlocked ? '' : 'locked'}`, grid);
      el('b', '', b, it.name);
      el('span', '', b, it.on ? '✔ Đang mặc' : it.unlocked ? 'Bấm để mặc' : `🔒 ${lockText(it.req)}`);
      b.onmouseenter = () => setPreview({ ...cur.outfit, [tab]: it.id } as Outfit);
      b.onmouseleave = () => setPreview(cur.outfit);
      b.onclick = () => {
        if (!it.unlocked) return ctx.ui.toast(lockText(it.req), 'info');
        ctx.send('equip', { [tab]: it.id });
      };
    }
  };
  const off = ctx.state.on('self', (e) => {
    if (!wardrobePanel) return off();
    if (e.patch.outfit || e.patch.unlocked) {
      render();
      setPreview(ctx.state.me.outfit);
    }
  });
  render();
}

export const wardrobeClient: ActivityClientModule = {
  id: 'wardrobe',
  maps: ['temple'],
  interact(station, ctx) {
    if (station.kind !== 'wardrobe') return false;
    openWardrobe(ctx);
    ctx.audio.play('click');
    return true;
  },
  unmount() {
    wardrobePanel?.close();
  },
};

// ───────────────────────── Đón khách vãng lai ─────────────────────────

const guestNpcs = new Map<number, { npc: NpcHandle; off: () => void; state: string }>();
let guestState: GuestPublicState | null = null;

const canGreet = (ctx: ClientActivityContext) => {
  const me = ctx.state.me;
  return me.isHost || rankAtLeast(me.rank, 'tri_khach_tang');
};

export const guestClient: ActivityClientModule = {
  id: 'guest',
  maps: ['temple'],
  prompt(station) {
    // Bậc Chánh Điện chỉ là điểm giao khách, không cần bấm E.
    return station.kind === 'temple_steps' ? null : undefined;
  },
  onState(s, ctx) {
    guestState = s as GuestPublicState;
    const seen = new Set<number>();
    for (const g of guestState.guests) {
      seen.add(g.id);
      let entry = guestNpcs.get(g.id);
      if (!entry) {
        const npc = ctx.world.createNpc(npcLook('visitor', g.seed), g.name);
        npc.avatar.setHeld({ kind: 'fruit', variant: 'buoi' });
        const off = ctx.world.addInteractable({
          id: `guest:${g.id}`,
          r: 2.2,
          position: () => {
            const cur = guestState?.guests.find((x) => x.id === g.id);
            return cur ? { x: cur.x, z: cur.z } : { x: 999, z: 999 };
          },
          label: () => {
            const cur = guestState?.guests.find((x) => x.id === g.id);
            if (!cur || cur.state !== 'waiting') return null;
            return canGreet(ctx) ? `Đón khách: ${cur.name}` : `${cur.name} (cần Tri Khách Tăng để đón)`;
          },
          onInteract: () => {
            if (canGreet(ctx)) ctx.send('lead', { id: g.id });
            else ctx.ui.toast('Cần từ Tri Khách Tăng trở lên mới đón khách được.', 'info');
          },
        });
        entry = { npc, off, state: '' };
        guestNpcs.set(g.id, entry);
        npc.say('Xin chào quý thầy!', 2500);
      }
      entry.npc.setPosition(g.x, g.z, g.ry);
      if (entry.state !== g.state) {
        entry.state = g.state;
        entry.npc.avatar.setAnim(g.state === 'bowing' ? 'bow' : 'idle');
        if (g.state === 'following') entry.npc.say('Nhờ thầy dẫn đường ạ!', 2500);
      }
    }
    for (const [id, e] of guestNpcs) {
      if (!seen.has(id)) {
        e.off();
        e.npc.dispose();
        guestNpcs.delete(id);
      }
    }
  },
  onEvent(type, data, ctx) {
    if (type !== 'bow') return;
    const e = guestNpcs.get((data as { id: number }).id);
    e?.npc.say('A Di Đà Phật! 🙏', 2600);
    ctx.audio.play('bell_small', { volume: 0.6 });
  },
  unmount() {
    for (const e of guestNpcs.values()) {
      e.off();
      e.npc.dispose();
    }
    guestNpcs.clear();
  },
};

// ───────────────────────── Nhập kho ─────────────────────────

let stock = { rice: 0, veggies: 0 };

export const restockClient: ActivityClientModule = {
  id: 'restock',
  maps: ['temple'],
  prompt(station, ctx) {
    const held = ctx.me()?.held;
    if (station.kind === 'storage') return held?.kind === 'supply' ? 'Nhập kho (+5)' : `Kho đồ chay — gạo ${stock.rice}, rau ${stock.veggies}`;
    if (station.kind === 'supply_cart') {
      if (held) return null;
      return canGreet(ctx) ? 'Xe tiếp tế — lấy hàng nhập kho' : `Xe tiếp tế (cần ${RANK_NAMES.tri_khach_tang})`;
    }
    return undefined;
  },
  interact(station, ctx) {
    if (station.kind !== 'supply_cart') return false;
    if (!canGreet(ctx)) {
      ctx.ui.toast('Cần từ Tri Khách Tăng trở lên mới nhập kho được.', 'info');
      return true;
    }
    void ctx.ui
      .choose({
        title: '🛒 Lấy hàng nhập kho',
        options: [
          { value: 'rice_sack', label: 'Bao gạo', sub: 'Kho gạo +5', icon: '🌾' },
          { value: 'veg_crate', label: 'Thùng rau', sub: 'Kho rau +5', icon: '🥬' },
        ],
      })
      .then((v) => {
        if (v) ctx.send('take', { kind: v });
      });
    return true;
  },
  onState(s) {
    stock = s as { rice: number; veggies: number };
  },
};
