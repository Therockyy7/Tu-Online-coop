// Nhân vật trong cảnh: người chơi khác (nội suy snapshot trễ 100 ms), chính mình (ẩn ở góc nhìn thứ nhất,
// chỉ đổ bóng), nhãn tên/cấp bậc, bong bóng chat, emote, và NPC do mini-game tạo.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  EMOTE_ICONS,
  HOST_TITLE,
  RANK_NAMES,
  hashString,
  lerpAngle,
  type AnimId,
  type BuffState,
  type EmoteId,
  type Pid,
  type PlayerPublic,
  type SnapMsg,
} from '@shared/index';
import type { AvatarHandle, AvatarLook } from '../art/api';
import { createAvatar, playerLook } from '../art/avatar';
import { kit } from '../art/kit';
import type { NpcHandle } from './worldApi';

interface Snap {
  t: number;
  x: number;
  z: number;
  ry: number;
  anim: AnimId;
}

interface Label {
  obj: CSS2DObject;
  root: HTMLDivElement;
  name: HTMLDivElement;
  sub: HTMLDivElement;
  tag: HTMLDivElement;
  bubble: HTMLDivElement;
  emote: HTMLDivElement;
  bubbleTimer: ReturnType<typeof setTimeout> | null;
  emoteTimer: ReturnType<typeof setTimeout> | null;
}

interface Entry {
  pid: Pid;
  avatar: AvatarHandle;
  label: Label;
  snaps: Snap[];
  x: number;
  z: number;
  ry: number;
  speed: number;
  anim: AnimId;
  lookKey: string;
  isLocal: boolean;
  /** Quãng đường đi được từ bước chân trước (m) — đủ một sải thì tung bụi. */
  stepAcc: number;
}

/** Sải bước tung một nhúm bụi (m) và tốc độ tối thiểu được tính là đang đi (m/s). */
const STEP_LEN = 1.15;
const STEP_MIN_SPEED = 2.2;

const GLOW_COLORS: Record<string, string> = {
  hao_quang: '#ffd166',
  ban_phuoc: '#7fd8ff',
  no_bung: '#a6f07a',
};

const LABEL_FADE_START = 18;
const LABEL_HIDE = 30;

function div(cls: string, parent?: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent?.append(d);
  return d;
}

function makeLabel(): Label {
  const root = div('plabel');
  const bubble = div('plabel-bubble', root);
  const emote = div('plabel-emote', root);
  const name = div('plabel-name', root);
  const sub = div('plabel-sub', root);
  const tag = div('plabel-tag', root);
  const obj = new CSS2DObject(root);
  obj.center.set(0.5, 1);
  return { obj, root, name, sub, tag, bubble, emote, bubbleTimer: null, emoteTimer: null };
}

function lookKeyOf(p: PlayerPublic): string {
  return `${p.outfit.robe}|${p.outfit.hat}|${p.outfit.accessory}|${p.isHost ? 1 : 0}|${p.vip ? 1 : 0}`;
}

export class Players {
  private readonly entries = new Map<Pid, Entry>();
  private readonly npcs = new Set<NpcEntry>();
  private readonly shadowProxy: THREE.Mesh;
  private localPid: Pid | null = null;
  firstPerson = true;
  /** Gọi mỗi sải bước của người đang đi (để tung bụi dưới chân). */
  onStep: ((x: number, z: number) => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.shadowProxy = new THREE.Mesh(kit.geo.capsule(0.34, 0.8, 4, 10), proxyMat);
    this.shadowProxy.castShadow = true;
    this.shadowProxy.receiveShadow = false;
    this.shadowProxy.position.y = 0.78;
    this.shadowProxy.visible = false;
    scene.add(this.shadowProxy);
  }

  setLocal(pid: Pid): void {
    this.localPid = pid;
  }

  has(pid: Pid): boolean {
    return this.entries.has(pid);
  }

  add(p: PlayerPublic): void {
    this.remove(p.pid);
    const avatar = createAvatar(playerLook(p, hashString(p.pid)));
    avatar.root.position.set(p.x, 0, p.z);
    avatar.root.rotation.y = p.ry;
    const label = makeLabel();
    avatar.headAnchor.add(label.obj);
    this.scene.add(avatar.root);
    const e: Entry = {
      pid: p.pid,
      avatar,
      label,
      snaps: [],
      x: p.x,
      z: p.z,
      ry: p.ry,
      speed: 0,
      anim: p.anim,
      lookKey: lookKeyOf(p),
      isLocal: p.pid === this.localPid,
      stepAcc: 0,
    };
    this.entries.set(p.pid, e);
    this.applyAll(e, p);
  }

  remove(pid: Pid): void {
    const e = this.entries.get(pid);
    if (!e) return;
    this.disposeLabel(e.label);
    this.scene.remove(e.avatar.root);
    e.avatar.dispose();
    this.entries.delete(pid);
  }

  clear(): void {
    for (const pid of [...this.entries.keys()]) this.remove(pid);
    for (const n of [...this.npcs]) n.handle.dispose();
  }

  private disposeLabel(l: Label): void {
    if (l.bubbleTimer) clearTimeout(l.bubbleTimer);
    if (l.emoteTimer) clearTimeout(l.emoteTimer);
    l.obj.removeFromParent();
    l.root.remove();
  }

  /** Cập nhật mọi thứ hiển thị từ bản công khai (gọi khi vào + khi có patch). */
  private applyAll(e: Entry, p: PlayerPublic): void {
    e.avatar.setHeld(p.held);
    e.avatar.setTapNiem(p.tapNiem);
    e.avatar.setDrunk(p.doSay);
    e.avatar.setGhost(!p.connected);
    e.avatar.setGlow(this.glowOf(p.buffs));
    this.renderLabel(e, p);
  }

  private glowOf(buffs: BuffState[]): string | null {
    const now = Date.now();
    for (const id of ['hao_quang', 'ban_phuoc', 'no_bung']) {
      if (buffs.some((b) => b.id === id && b.until > now - 60_000)) return GLOW_COLORS[id] ?? null;
    }
    return null;
  }

  private renderLabel(e: Entry, p: PlayerPublic): void {
    const l = e.label;
    l.name.textContent = p.name;
    l.name.classList.toggle('host', p.isHost);
    l.root.classList.toggle('vip', p.vip);
    l.root.classList.toggle('ghost', !p.connected);
    const parts = [p.isHost ? `👑 ${HOST_TITLE}` : RANK_NAMES[p.rank]];
    if (p.title) parts.push(p.title);
    if (p.vip) parts.push('VIP');
    l.sub.textContent = parts.join(' · ');
    const kneeling = p.kneelUntil > Date.now();
    l.tag.textContent = !p.connected ? 'Mất kết nối…' : kneeling ? 'Đang sám hối' : '';
    l.tag.style.display = l.tag.textContent ? '' : 'none';
  }

  patch(pid: Pid, patch: Partial<PlayerPublic>, full: PlayerPublic | undefined): void {
    const e = this.entries.get(pid);
    if (!e || !full) return;
    const key = lookKeyOf(full);
    if (key !== e.lookKey) {
      e.lookKey = key;
      e.avatar.setLook(playerLook(full, hashString(pid)));
    }
    if ('held' in patch) e.avatar.setHeld(full.held);
    if ('tapNiem' in patch) e.avatar.setTapNiem(full.tapNiem);
    if ('doSay' in patch) e.avatar.setDrunk(full.doSay);
    if ('connected' in patch) e.avatar.setGhost(!full.connected);
    if ('buffs' in patch) e.avatar.setGlow(this.glowOf(full.buffs));
    if (!e.isLocal && ('x' in patch || 'z' in patch)) {
      // Dịch chuyển (đổi map / bị kéo về): bỏ lịch sử nội suy.
      e.snaps.length = 0;
      e.x = full.x;
      e.z = full.z;
    }
    this.renderLabel(e, full);
  }

  onSnap(m: SnapMsg): void {
    for (const [pid, x, z, ry, anim] of m.p) {
      const e = this.entries.get(pid);
      if (!e || e.isLocal) continue;
      const last = e.snaps[e.snaps.length - 1];
      if (last && m.t <= last.t) continue;
      e.snaps.push({ t: m.t, x, z, ry, anim });
      if (e.snaps.length > 30) e.snaps.splice(0, e.snaps.length - 30);
    }
  }

  playRankUp(pid: Pid): void {
    this.entries.get(pid)?.avatar.playRankUp();
  }

  showChat(pid: Pid, text: string): void {
    const e = this.entries.get(pid);
    if (!e) return;
    const l = e.label;
    l.bubble.textContent = text;
    l.bubble.classList.add('show');
    if (l.bubbleTimer) clearTimeout(l.bubbleTimer);
    l.bubbleTimer = setTimeout(() => l.bubble.classList.remove('show'), 5000);
  }

  showEmote(pid: Pid, id: EmoteId): void {
    const e = this.entries.get(pid);
    if (!e) return;
    const l = e.label;
    l.emote.textContent = EMOTE_ICONS[id];
    l.emote.classList.remove('show');
    void l.emote.offsetWidth;
    l.emote.classList.add('show');
    if (l.emoteTimer) clearTimeout(l.emoteTimer);
    l.emoteTimer = setTimeout(() => l.emote.classList.remove('show'), 2600);
  }

  position(pid: Pid): { x: number; z: number } | undefined {
    const e = this.entries.get(pid);
    return e ? { x: e.x, z: e.z } : undefined;
  }

  avatar(pid: Pid): AvatarHandle | undefined {
    return this.entries.get(pid)?.avatar;
  }

  /** Người chơi khác gần tâm ngắm nhất (để ban phước): trong `range` mét và lệch ≤ `maxAngle`. */
  pickInFront(fromX: number, fromZ: number, yaw: number, range: number, maxAngle: number): Pid | null {
    let best: Pid | null = null;
    let bestScore = Infinity;
    for (const e of this.entries.values()) {
      if (e.isLocal) continue;
      const dx = e.x - fromX;
      const dz = e.z - fromZ;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) continue;
      const ang = Math.abs(lerpAngle(yaw, Math.atan2(dx, dz), 1) - yaw);
      if (ang > maxAngle) continue;
      const score = ang * 2 + d * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = e.pid;
      }
    }
    return best;
  }

  update(
    dt: number,
    time: number,
    renderTime: number,
    local: { x: number; z: number; ry: number; anim: AnimId; speed: number },
  ): void {
    const camPos = this.camera.position;
    for (const e of this.entries.values()) {
      if (e.isLocal) {
        e.x = local.x;
        e.z = local.z;
        e.ry = local.ry;
        e.speed = local.speed;
        e.anim = local.anim;
        this.shadowProxy.visible = this.firstPerson;
        this.shadowProxy.position.x = local.x;
        this.shadowProxy.position.z = local.z;
        e.avatar.root.visible = !this.firstPerson;
        e.label.obj.visible = !this.firstPerson;
      } else {
        this.interpolate(e, renderTime, dt);
      }
      e.avatar.root.position.set(e.x, 0, e.z);
      e.avatar.root.rotation.y = e.ry;
      e.avatar.setAnim(e.anim);
      e.avatar.update(dt, time, e.speed);
      if (e.speed > STEP_MIN_SPEED && (e.anim === 'walk' || e.anim === 'carry_walk')) {
        e.stepAcc += e.speed * dt;
        if (e.stepAcc >= STEP_LEN) {
          e.stepAcc -= STEP_LEN;
          this.onStep?.(e.x, e.z);
        }
      } else {
        e.stepAcc = STEP_LEN * 0.7;
      }
      if (!e.isLocal || !this.firstPerson) {
        const d = Math.hypot(e.x - camPos.x, e.z - camPos.z);
        const visible = d < LABEL_HIDE;
        e.label.obj.visible = visible;
        if (visible) e.label.root.style.opacity = d < LABEL_FADE_START ? '1' : String(1 - (d - LABEL_FADE_START) / (LABEL_HIDE - LABEL_FADE_START));
      }
    }
    for (const n of this.npcs) n.update(dt, time);
  }

  private interpolate(e: Entry, renderTime: number, dt: number): void {
    const s = e.snaps;
    const px = e.x;
    const pz = e.z;
    if (s.length === 0) return;
    // Bỏ snapshot quá cũ (giữ 1 cái trước renderTime để nội suy).
    while (s.length >= 2 && s[1]!.t <= renderTime) s.shift();
    const a = s[0]!;
    const b = s[1];
    if (!b || renderTime <= a.t) {
      e.x = a.x;
      e.z = a.z;
      e.ry = a.ry;
      e.anim = a.anim;
    } else {
      const k = Math.min(1, (renderTime - a.t) / Math.max(1, b.t - a.t));
      e.x = a.x + (b.x - a.x) * k;
      e.z = a.z + (b.z - a.z) * k;
      e.ry = lerpAngle(a.ry, b.ry, k);
      e.anim = k < 0.5 ? a.anim : b.anim;
    }
    const v = Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 1e-3);
    e.speed += (Math.min(v, 9) - e.speed) * Math.min(1, dt * 10);
  }

  // ───────────────────────── NPC ─────────────────────────

  createNpc(look: AvatarLook, name?: string): NpcHandle {
    const entry = new NpcEntry(this, look, name ?? null);
    this.npcs.add(entry);
    this.scene.add(entry.avatarReal.root);
    return entry.handle;
  }

  /** @internal */
  _removeNpc(n: NpcEntry): void {
    this.npcs.delete(n);
    this.scene.remove(n.avatarReal.root);
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.shadowProxy);
    (this.shadowProxy.material as THREE.Material).dispose();
  }
}

/** NPC: vị trí đặt bởi mini-game, được làm mượt; tự đi/đứng trừ khi mini-game đặt hoạt ảnh riêng. */
class NpcEntry {
  readonly avatarReal: AvatarHandle;
  readonly handle: NpcHandle;
  private readonly label: Label;
  private x = 0;
  private z = 0;
  private ry = 0;
  private tx = 0;
  private tz = 0;
  private tr = 0;
  private placed = false;
  private speed = 0;
  private override: AnimId | null = null;
  private disposed = false;

  constructor(
    private readonly owner: Players,
    look: AvatarLook,
    name: string | null,
  ) {
    const real = createAvatar(look);
    this.avatarReal = real;
    this.label = makeLabel();
    this.label.root.classList.add('npc');
    real.headAnchor.add(this.label.obj);
    this.setLabel(name);
    const self = this;
    // Bọc AvatarHandle: setAnim của mini-game ghi đè chế độ tự đi/đứng ('idle'/'walk' = trả lại tự động).
    const avatar: AvatarHandle = {
      root: real.root,
      headAnchor: real.headAnchor,
      setLook: (l) => real.setLook(l),
      setHeld: (i) => real.setHeld(i),
      setAnim: (a) => {
        self.override = a === 'idle' || a === 'walk' ? null : a;
      },
      update: (dt, t, s) => real.update(dt, t, s),
      setTapNiem: (v) => real.setTapNiem(v),
      setDrunk: (v) => real.setDrunk(v),
      setGhost: (g) => real.setGhost(g),
      setGlow: (c) => real.setGlow(c),
      playRankUp: () => real.playRankUp(),
      dispose: () => self.handle.dispose(),
    };
    this.handle = {
      avatar,
      setPosition: (x, z, ry) => {
        this.tx = x;
        this.tz = z;
        if (ry !== undefined) this.tr = ry;
        if (!this.placed) {
          this.placed = true;
          this.x = x;
          this.z = z;
          this.ry = ry ?? 0;
        }
      },
      setLabel: (text) => this.setLabel(text),
      say: (text, ms = 3000) => {
        const l = this.label;
        l.bubble.textContent = text;
        l.bubble.classList.add('show');
        if (l.bubbleTimer) clearTimeout(l.bubbleTimer);
        l.bubbleTimer = setTimeout(() => l.bubble.classList.remove('show'), ms);
      },
      dispose: () => {
        if (this.disposed) return;
        this.disposed = true;
        if (this.label.bubbleTimer) clearTimeout(this.label.bubbleTimer);
        this.label.obj.removeFromParent();
        this.label.root.remove();
        this.owner._removeNpc(this);
        real.dispose();
      },
    };
  }

  private setLabel(text: string | null): void {
    this.label.name.textContent = text ?? '';
    this.label.sub.textContent = '';
    this.label.tag.style.display = 'none';
    this.label.root.style.display = text ? '' : 'none';
  }

  update(dt: number, time: number): void {
    const k = Math.min(1, dt * 8);
    const px = this.x;
    const pz = this.z;
    this.x += (this.tx - this.x) * k;
    this.z += (this.tz - this.z) * k;
    const moved = Math.hypot(this.x - px, this.z - pz) / Math.max(dt, 1e-3);
    if (moved > 0.2) this.tr = Math.atan2(this.x - px, this.z - pz);
    this.ry = lerpAngle(this.ry, this.tr, Math.min(1, dt * 8));
    this.speed += (moved - this.speed) * Math.min(1, dt * 8);
    const r = this.avatarReal;
    r.root.position.set(this.x, 0, this.z);
    r.root.rotation.y = this.ry;
    r.setAnim(this.override ?? (this.speed > 0.35 ? 'walk' : 'idle'));
    r.update(dt, time, this.speed);
  }
}

