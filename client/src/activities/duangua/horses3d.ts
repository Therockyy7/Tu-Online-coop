// Đàn ngựa đua ở neo race_track (gốc = vạch xuất phát làn 1 trên mặt đường; +X dọc đường đua tới finishX − startX, làn k ở
// +Z k·laneGap). Lúc đua vị trí tính thẳng từ kịch bản của server (raceProgressAt theo giờ server, tính theo mũi ngựa) nên
// mọi máy — kể cả người vào giữa chừng — thấy cùng một cuộc đua; qua vạch đích thì chạy quá đà rồi dừng dần trước mép bàn.
// Trạng thái không còn cuộc đua (ván mới / bàn nghỉ) → ngựa quay đầu đi nước kiệu về trước cổng, quay mặt ra cổng ở đó (ngoài
// vách ngăn làn) rồi lùi vào chuồng (homeStep). Chân đánh + thân nhún theo tốc độ; vó ngựa lặp khi đua, reo hò + pháo giấy
// lúc ngựa nhất chạm đích. update() không cấp phát mới.
import * as THREE from 'three';
import { DUANGUA, SONG_BAC } from '@shared/index';
import { HORSES, raceProgressAt, type DuaNguaPublicState } from '@shared/activities/duangua';
import type { ClientActivityContext } from '../types';
import {
  HORSE_SCALE,
  LEG_PIVOTS,
  NOSE,
  TAIL_PIVOT,
  buildHorseGeometry,
  buildHorseMaterials,
  hasBlaze,
  hasWhiteHooves,
  type HorseGeometry,
} from './horseModel';

const R = SONG_BAC.race;
const LEN = R.finishX - R.startX;
/** Quá vạch đích tối đa (m): mặt cỏ còn ~0,68 m sau vạch, mũi ngựa dừng trước mép bàn. */
const OVERRUN = 0.42;
/** Nước kiệu về chuồng (m/s) và tốc độ quay đầu (rad/s). */
const WALK_SPEED = 0.9;
const TURN_RATE = 5;
/**
 * Chỗ quay mặt ra cổng khi về chuồng (gốc ngựa, m dọc đường đua): quay ở đây thì mũi (bán kính NOSE quanh gốc) chỉ quét
 * 0,03..0,47 m — hẳn trước vách ngăn làn (vách từ −0,42 tới +0,02) — rồi lùi vào chuồng mặt vẫn nhìn ra cổng: đầu không
 * quét xuyên vách, mũi không lòi ra sau cổng.
 */
export const STALL_TURN_X = 0.25;
/** Tốc độ lùi vào chuồng (m/s). */
const BACK_SPEED = 0.5;
/** Tốc độ coi như phi hết sức (m/s): biên độ chân / độ nhún tính theo tỉ lệ này. */
const RUN_FULL = 1.0;
/** Lệch pha 4 chân (phần chu kỳ, thứ tự LEG_PIVOTS): phi nước đại và nước kiệu (chéo cặp). */
const GALLOP = [0.5, 0.62, 0, 0.12] as const;
const TROT = [0, 0.5, 0.5, 0] as const;
const TROT_HZ = 2.3;
/** Độ nhún thân (m, trước khi nhân tỉ lệ) và độ chúi (rad) khi phi hết sức. */
const BOB = 0.014;
const PITCH = 0.07;
const GALLOP_EVERY_MS = 360;
/** Âm thanh đường đua nghe được trong bán kính này (m) tính từ mép đường đua. */
const HEAR_R = 16;
const TAU = Math.PI * 2;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tmpV = new THREE.Vector3();

/**
 * Một bước về chuồng khi không có cuộc đua (thuần; cập nhật `r.x`, trả hướng cần quay tới): còn xa thì quay mặt về −X xong
 * mới đi nước kiệu tới STALL_TURN_X; tới đó quay mặt lại +X (ra cổng) xong mới lùi chậm tới gốc −NOSE (mũi ở vạch xuất phát).
 */
export function homeStep(r: { x: number; yaw: number }, dt: number): number {
  if (r.x > STALL_TURN_X + 0.005) {
    if (Math.abs(r.yaw - Math.PI) < 0.35) r.x = Math.max(STALL_TURN_X, r.x - WALK_SPEED * dt);
    return Math.PI;
  }
  if (Math.abs(r.yaw) < 0.05) r.x = Math.max(-NOSE, r.x - BACK_SPEED * dt);
  return 0;
}

/** Quay dần `r.yaw` về `yawTo`, tối đa TURN_RATE rad/s. */
export function turnStep(r: { yaw: number }, yawTo: number, dt: number): void {
  const turn = TURN_RATE * dt;
  r.yaw += Math.max(-turn, Math.min(turn, yawTo - r.yaw));
}

interface Runner {
  /** Vị trí dọc làn + hướng (đã nhân tỉ lệ mô hình). */
  group: THREE.Group;
  /** Thân: nhún + chúi theo nhịp chân. */
  body: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Group;
  /** Gốc ngựa dọc làn (m, cục bộ neo) — mũi ở x + NOSE. */
  x: number;
  prevX: number;
  yaw: number;
  /** Pha nhịp chân 0..1. */
  phase: number;
  /** Tốc độ đã làm mượt (m/s). */
  speed: number;
}

export class RaceHorses {
  private readonly root = new THREE.Group();
  private readonly geo: HorseGeometry;
  private readonly materials: THREE.Material[] = [];
  private readonly runners: Runner[] = [];
  /** Tốc độ lúc chạm đích (m/s) từng ngựa của cuộc đua hiện tại — để chạy quá đà rồi dừng êm. */
  private readonly finishSpeed = new Float64Array(DUANGUA.horses);
  private raceAt = -1;
  private cheeredRound = -1;
  private lastGallop = 0;
  private gallopN = 0;

  constructor(private readonly ctx: ClientActivityContext) {
    const anchor = ctx.world.anchor('race_track');
    if (anchor) {
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(this.root.position);
      anchor.getWorldQuaternion(this.root.quaternion);
    } else {
      this.root.position.set(R.startX, R.surfaceY, R.laneZ0);
    }
    this.root.name = 'duangua_horses';
    this.geo = buildHorseGeometry();
    const fixed = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.6 });
    const shadow = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    this.materials.push(fixed, shadow);
    for (let i = 0; i < DUANGUA.horses; i++) this.runners.push(this.makeRunner(i, fixed, shadow));
    ctx.world.scene.add(this.root);
    this.root.updateMatrixWorld(true);
  }

  /** Trạng thái mới: chuẩn bị cuộc đua mới (tốc độ về đích), ăn mừng khi ngựa nhất vừa chạm đích. */
  sync(st: DuaNguaPublicState, prev: DuaNguaPublicState | null): void {
    const race = st.race;
    if (race && race.startAt !== this.raceAt) {
      this.raceAt = race.startAt;
      for (let i = 0; i < DUANGUA.horses; i++) {
        const f = race.finish[i] ?? DUANGUA.raceMs;
        this.finishSpeed[i] = Math.max(0.2, ((1 - raceProgressAt(race, i, f - 40)) * LEN) / 0.04);
      }
    }
    if (prev?.phase === 'resolving' && st.phase === 'result' && st.winner !== null && st.round !== this.cheeredRound) {
      this.cheeredRound = st.round;
      this.celebrate(st.winner);
    }
  }

  update(dt: number, st: DuaNguaPublicState): void {
    const race = st.phase === 'resolving' || st.phase === 'result' ? st.race : null;
    const t = race ? this.ctx.serverNow() - race.startAt : 0;
    const clock = performance.now() / 1000;
    let fastest = 0;
    for (let i = 0; i < this.runners.length; i++) {
      const r = this.runners[i]!;
      let yawTo = 0;
      if (race) {
        const p = raceProgressAt(race, i, t);
        let nose = p * LEN;
        if (p >= 1) {
          const tau = Math.max(0, t - (race.finish[i] ?? 0)) / 1000;
          nose = LEN + OVERRUN * (1 - Math.exp((-tau * this.finishSpeed[i]!) / OVERRUN));
        }
        r.x = nose - NOSE;
      } else {
        yawTo = homeStep(r, dt);
      }
      turnStep(r, yawTo, dt);
      const v = dt > 0 ? Math.abs(r.x - r.prevX) / dt : 0;
      r.prevX = r.x;
      const stepping = Math.abs(yawTo - r.yaw) > 0.02 ? 0.3 : 0;
      r.speed += (Math.min(v, 3) + stepping - r.speed) * (1 - Math.exp(-dt * 10));
      if (race) fastest = Math.max(fastest, r.speed);
      this.pose(r, i, dt, clock, !!race);
    }
    if (fastest > 0.3) this.gallop();
  }

  dispose(): void {
    this.ctx.world.scene.remove(this.root);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of this.materials) m.dispose();
  }

  private makeRunner(i: number, fixed: THREE.Material, shadowMat: THREE.Material): Runner {
    const m = buildHorseMaterials(i);
    this.materials.push(m.coat, m.mane, m.silk);
    if (m.leg !== m.coat) this.materials.push(m.leg);
    const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const x = new THREE.Mesh(g, mat);
      x.castShadow = false;
      x.receiveShadow = false;
      return x;
    };
    const body = new THREE.Group();
    body.add(mesh(this.geo.coat, m.coat), mesh(this.geo.mane, m.mane), mesh(this.geo.silk, m.silk), mesh(this.geo.fixed, fixed));
    if (hasBlaze(i)) body.add(mesh(this.geo.blaze, fixed));
    const legGeo = hasWhiteHooves(i) ? this.geo.legWhiteHoof : this.geo.leg;
    const legs = LEG_PIVOTS.map(([x, y, z]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      pivot.add(mesh(legGeo, m.leg));
      body.add(pivot);
      return pivot;
    });
    const tail = new THREE.Group();
    tail.position.set(TAIL_PIVOT[0], TAIL_PIVOT[1], TAIL_PIVOT[2]);
    tail.add(mesh(this.geo.tail, m.mane));
    body.add(tail);
    const shadow = mesh(this.geo.shadow, shadowMat);
    shadow.position.y = 0.003;
    shadow.scale.set(1.35, 1, 0.55);
    shadow.renderOrder = 1;
    const group = new THREE.Group();
    group.name = `horse_${i}`;
    group.scale.setScalar(HORSE_SCALE);
    group.add(shadow, body);
    const x = -NOSE;
    group.position.set(x, 0, i * R.laneGap);
    this.root.add(group);
    return { group, body, legs, tail, x, prevX: x, yaw: 0, phase: (i * 0.17) % 1, speed: 0 };
  }

  /** Dáng theo tốc độ: phi nước đại lúc đua, nước kiệu lúc về chuồng; đứng yên thì thở + vẫy đuôi. */
  private pose(r: Runner, i: number, dt: number, clock: number, racing: boolean): void {
    const run = clamp01(r.speed / RUN_FULL);
    const gait = racing ? GALLOP : TROT;
    if (r.speed > 0.03) r.phase = (r.phase + dt * (racing ? 1.4 + 2.4 * run : TROT_HZ)) % 1;
    const a = r.phase * TAU;
    const amp = (racing ? 0.75 : 0.4) * clamp01(r.speed / 0.5);
    for (let k = 0; k < 4; k++) r.legs[k]!.rotation.z = amp * Math.sin(a + gait[k]! * TAU);
    const still = 1 - run;
    const lift = racing ? run : run * 0.4;
    r.body.position.y = lift * BOB * (0.5 - 0.5 * Math.cos(2 * a));
    r.body.rotation.z = lift * PITCH * Math.sin(a) + still * 0.02 * Math.sin(clock * 1.3 + i);
    r.tail.rotation.z = -0.6 * run + still * 0.14 * Math.sin(clock * 2.2 + i * 1.7);
    r.tail.rotation.y = still * 0.25 * Math.sin(clock * 1.1 + i);
    r.group.position.x = r.x;
    r.group.rotation.y = r.yaw;
  }

  /** Ngựa nhất chạm đích: pháo giấy ở vạch đích làn thắng, chữ tên ngựa bay lên, reo hò. */
  private celebrate(w: number): void {
    tmpV.set(LEN, 0, w * R.laneGap);
    this.root.localToWorld(tmpV);
    this.ctx.world.burst(tmpV.x, tmpV.z, 'confetti', 36);
    this.ctx.world.floatText(tmpV.x, tmpV.z, `🏆 ${HORSES[w]!.name}`, '#ffd166', tmpV.y + 0.75);
    const v = this.volume(0.75);
    if (v > 0.05) this.ctx.audio.play('cheer', { volume: v });
  }

  /** Vó ngựa lặp đều trong lúc đua. */
  private gallop(): void {
    const now = performance.now();
    if (now - this.lastGallop < GALLOP_EVERY_MS) return;
    this.lastGallop = now;
    const v = this.volume(0.5);
    if (v > 0.04) this.ctx.audio.play('gallop', { volume: v, rate: 0.92 + (this.gallopN++ % 3) * 0.07 });
  }

  /** Âm lượng theo khoảng cách từ mình tới mép đường đua gần nhất. */
  private volume(base: number): number {
    const me = this.ctx.me();
    if (!me) return 0;
    const x = Math.min(R.finishX, Math.max(R.startX, me.x));
    const z = Math.min(R.laneZ0 + (DUANGUA.horses - 1) * R.laneGap, Math.max(R.laneZ0, me.z));
    return base * clamp01(1 - Math.hypot(me.x - x, me.z - z) / HEAR_R);
  }
}
