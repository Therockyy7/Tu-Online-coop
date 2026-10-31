// Nhân vật của chính mình: WASD theo hướng nhìn, va chạm theo map dùng chung, chọn hoạt ảnh,
// gửi tư thế 15 lần/giây. Say rượu thì đi lệch hướng, rất say thì bị đẩy loạng choạng.
import {
  BUFFS,
  DO_SAY,
  MOVE,
  NET,
  canPassGate,
  clamp,
  resolveMove,
  type AnimId,
  type EmoteId,
  type MapDef,
  type PlayerPublic,
  type PoseMsg,
  type SelfState,
} from '@shared/index';

const EMOTE_ANIM: Record<EmoteId, AnimId> = {
  wave: 'wave',
  pray: 'pray',
  laugh: 'laugh',
  dance: 'dance',
  clap: 'clap',
  cry: 'cry',
  sit: 'sit',
  angry: 'angry',
};
/** Emote lặp tới khi di chuyển. */
const LOOPING = new Set<AnimId>(['dance', 'sit']);
const EMOTE_MS = 2600;
const GLIDE_SPEED = 4.2;

export interface ControllerFrame {
  isDown(code: string): boolean;
  /** Hướng nhìn của camera. */
  yaw: number;
  map: MapDef;
  me: SelfState;
  pub: PlayerPublic | undefined;
  serverNow: number;
  /** Không nhận phím di chuyển (đang gõ chat, mở bảng…). */
  blocked: boolean;
}

export class LocalController {
  x = 0;
  z = 0;
  ry = 0;
  /** Tốc độ thực (m/s), làm mượt. */
  speed = 0;
  anim: AnimId = 'idle';
  /** Hoạt ảnh do mini-game đặt (quét, chẻ…). */
  overrideAnim: AnimId | null = null;

  private vx = 0;
  private vz = 0;
  private readonly locks = new Set<string>();
  private emote: { anim: AnimId; until: number } | null = null;
  private glide: { x: number; z: number } | null = null;
  private pushX = 0;
  private pushZ = 0;
  private pushTimer = 3;
  private stumbleUntil = 0;
  private time = 0;
  private last = { x: NaN, z: NaN, ry: NaN, anim: '' as string, at: -Infinity };

  constructor(private readonly sendPose: (p: PoseMsg) => void) {}

  setLocked(key: string, locked: boolean): void {
    if (locked) this.locks.add(key);
    else this.locks.delete(key);
  }

  get locked(): boolean {
    return this.locks.size > 0;
  }

  clearLocks(): void {
    this.locks.clear();
  }

  /** Dịch chuyển tức thì (server kéo về, đổi map). */
  teleport(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.pushX = this.pushZ = 0;
    this.glide = null;
    this.last.at = -Infinity;
  }

  /** Đi tới điểm (vd đúng chỗ ngồi của bồ đoàn) — bước nhanh thay vì nhảy cóc để server chấp nhận. */
  glideTo(x: number, z: number): void {
    this.glide = { x, z };
  }

  playEmote(id: EmoteId): void {
    this.emote = { anim: EMOTE_ANIM[id], until: performance.now() + EMOTE_MS };
  }

  cancelEmote(): void {
    this.emote = null;
  }

  update(dt: number, f: ControllerFrame): void {
    this.time += dt;
    const kneeling = (f.pub?.kneelUntil ?? 0) > f.serverNow;
    const canMove = !f.blocked && !this.locked && !kneeling;

    let fwd = 0;
    let side = 0;
    if (canMove) {
      if (f.isDown('KeyW') || f.isDown('ArrowUp')) fwd += 1;
      if (f.isDown('KeyS') || f.isDown('ArrowDown')) fwd -= 1;
      if (f.isDown('KeyD') || f.isDown('ArrowRight')) side += 1;
      if (f.isDown('KeyA') || f.isDown('ArrowLeft')) side -= 1;
    }
    const yaw = f.yaw;
    let dx = Math.sin(yaw) * fwd - Math.cos(yaw) * side;
    let dz = Math.cos(yaw) * fwd + Math.sin(yaw) * side;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }

    const drunk = f.me.doSay;
    if (len > 0 && drunk > DO_SAY.sway) {
      const a = Math.sin(this.time * 1.15) * 0.5 * clamp((drunk - DO_SAY.sway) / (100 - DO_SAY.sway), 0, 1);
      const c = Math.cos(a);
      const s = Math.sin(a);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }

    let speed = MOVE.speed;
    if (f.me.buffs.some((b) => b.id === 'no_bung' && b.until > f.serverNow)) speed *= 1 + BUFFS.no_bung.speedBonus;
    const held = f.pub?.held;
    if (held) speed *= MOVE.carry[held.kind] ?? MOVE.carry.default ?? 0.85;

    const accel = len > 0 ? 14 : 11;
    const k = Math.min(1, dt * accel);
    this.vx += (dx * speed - this.vx) * k;
    this.vz += (dz * speed - this.vz) * k;

    if (drunk > DO_SAY.stumble && canMove) {
      this.pushTimer -= dt;
      if (this.pushTimer <= 0) {
        this.pushTimer = 2.5 + Math.random() * 3.5;
        const a = Math.random() * Math.PI * 2;
        this.pushX = Math.cos(a) * 3.2;
        this.pushZ = Math.sin(a) * 3.2;
        this.stumbleUntil = performance.now() + 700;
      }
    }
    const decay = Math.exp(-dt * 5);
    this.pushX *= decay;
    this.pushZ *= decay;

    let mx = (this.vx + this.pushX) * dt;
    let mz = (this.vz + this.pushZ) * dt;
    if (this.glide) {
      const gx = this.glide.x - this.x;
      const gz = this.glide.z - this.z;
      const gd = Math.hypot(gx, gz);
      if (gd < 0.02) {
        this.glide = null;
        mx = mz = 0;
      } else {
        const step = Math.min(gd, GLIDE_SPEED * dt);
        mx = (gx / gd) * step;
        mz = (gz / gd) * step;
      }
      this.vx = this.vz = 0;
    } else if (!canMove) {
      mx = this.pushX * dt * (kneeling ? 0 : 1);
      mz = this.pushZ * dt * (kneeling ? 0 : 1);
      this.vx = this.vz = 0;
    }

    let actual = 0;
    if (Math.abs(mx) + Math.abs(mz) > 1e-6) {
      const from = { x: this.x, z: this.z };
      const who = { rank: f.me.rank, isHost: f.me.isHost, vip: f.me.vip };
      const map = f.map;
      const res = resolveMove(from, { x: from.x + mx, z: from.z + mz }, map, {
        canPassGate: (g) => canPassGate(g, who, map, from),
      });
      actual = Math.hypot(res.x - from.x, res.z - from.z) / Math.max(dt, 1e-3);
      this.x = res.x;
      this.z = res.z;
    }
    this.speed += (actual - this.speed) * Math.min(1, dt * 12);
    this.ry = yaw;

    const moving = this.speed > 0.35 && !this.glide;
    if (this.emote) {
      if (moving && (LOOPING.has(this.emote.anim) || fwd !== 0 || side !== 0)) this.emote = null;
      else if (!LOOPING.has(this.emote.anim) && performance.now() > this.emote.until) this.emote = null;
    }
    let anim: AnimId;
    if (kneeling) anim = 'kneel';
    else if (this.overrideAnim) anim = this.overrideAnim;
    else if (performance.now() < this.stumbleUntil) anim = 'stumble';
    else if (this.emote) anim = this.emote.anim;
    else if (held) anim = moving ? 'carry_walk' : 'carry_idle';
    else anim = moving ? 'walk' : 'idle';
    this.anim = anim;

    this.maybeSend();
  }

  private maybeSend(): void {
    const now = performance.now();
    const since = now - this.last.at;
    if (since < 1000 / NET.poseHz) return;
    const changed =
      Math.abs(this.x - this.last.x) > 0.01 ||
      Math.abs(this.z - this.last.z) > 0.01 ||
      Math.abs(this.ry - this.last.ry) > 0.02 ||
      this.anim !== this.last.anim ||
      Number.isNaN(this.last.x);
    if (!changed && since < 1000) return;
    this.last = { x: this.x, z: this.z, ry: this.ry, anim: this.anim, at: now };
    this.sendPose({
      x: Math.round(this.x * 100) / 100,
      z: Math.round(this.z * 100) / 100,
      ry: Math.round(this.ry * 1000) / 1000,
      anim: this.anim,
    });
  }
}
