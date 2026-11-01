// Đồ động bàn Tài Xỉu ở neo taixiu_table_top + nhà cái NPC đứng phía Bắc bàn nhìn về Nam. Theo pha của server:
// đặt cược → bát úp kín trên đĩa; 'resolving' → nhà cái nâng cả đĩa lên trước ngực lắc (tiếng lắc lặp tới hết pha);
// 'result' → đĩa đã đặt xuống, bát nhấc lên nghiêng về phía nhà cái, lộ đúng mặt 3 xúc xắc. Mốc thời gian tính theo giờ
// server nên mọi máy (kể cả người vào giữa ván) thấy cùng một cảnh. update() chạy mỗi khung hình, không cấp phát mới.
import * as THREE from 'three';
import { SONG_BAC, TAIXIU, type AnimId } from '@shared/index';
import { taiXiuOutcome, type TaiXiuPublicState } from '@shared/activities/taixiu';
import { npcLook } from '../../art/avatar';
import { kit } from '../../art/kit';
import type { NpcHandle } from '../../engine/worldApi';
import type { ClientActivityContext } from '../types';
import { DIE, PLATE_TOP, UP_EULER, dieMaterials, makeBowl, makeDie, makePlate } from './dice3d';

/**
 * Tâm đĩa (so với tâm mặt nỉ): lúc nghỉ ở giữa nửa Bắc bàn; lúc lắc nhà cái nâng lên trước cằm (tay nhân vật ≈ y 1 m,
 * cách thân ~0,4 m) — tâm đĩa cách nhà cái 0,53 m để mép đĩa (bán kính 0,25) không xuyên ngực.
 */
const REST = { x: 0, y: 0, z: -0.45 };
const HOLD = { x: 0, y: 0.13, z: -0.95 };
/** Nhà cái đứng cách tâm bàn về phía Bắc (mép Bắc bàn ở −0,9). */
const DEALER_DZ = -1.48;
/** Chỗ 3 viên trên đĩa (x, z so với tâm đĩa). */
const SLOTS: readonly (readonly [number, number])[] = [
  [-0.07, 0.035],
  [0.07, 0.03],
  [0, -0.06],
];
/** Nhịp lắc (giây): nâng đĩa, hạ đĩa cuối pha, nhấc bát; úp bát lại (ms, đồng hồ máy). */
const LIFT_S = 0.35;
const LOWER_S = 0.45;
const OPEN_S = 0.6;
const CLOSE_MS = 450;
/** Bát mở hẳn: nhấc cao, lùi về phía nhà cái, nghiêng (rad). */
const OPEN_UP = 0.3;
const OPEN_BACK = 0.16;
const OPEN_TILT = 1.15;
/** Âm thanh bàn nghe được trong bán kính này (m). */
const HEAR_R = 14;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const yawQuat = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

export class TaiXiuTable {
  private readonly root = new THREE.Group();
  /** Đĩa + bát + xúc xắc: nhà cái nâng cả cụm khi lắc. */
  private readonly rig = new THREE.Group();
  private readonly bowl: THREE.Mesh;
  private readonly diceGroup = new THREE.Group();
  private readonly dice: THREE.Mesh[];
  private readonly dealer: NpcHandle;
  private readonly cx: number;
  private readonly cz: number;
  /** Mốc performance.now() bắt đầu úp bát lại sau pha kết quả (0 = không úp). */
  private closeT0 = 0;
  private lastRattle = -1;
  private dealerAnim: AnimId = 'idle';
  private dealerOverride: AnimId = 'idle';
  private dealerUntil = 0;

  constructor(private readonly ctx: ClientActivityContext) {
    const p = new THREE.Vector3(SONG_BAC.taixiu.x, SONG_BAC.feltY, SONG_BAC.taixiu.z);
    const anchor = ctx.world.anchor('taixiu_table_top');
    if (anchor) {
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(p);
    }
    this.cx = p.x;
    this.cz = p.z;
    this.root.name = 'taixiu_dyn';
    this.root.position.copy(p);
    this.rig.position.set(REST.x, REST.y, REST.z);
    this.rig.add(makePlate());
    this.bowl = makeBowl();
    this.rig.add(this.bowl);
    const mats = dieMaterials();
    this.dice = SLOTS.map(([x, z]) => {
      const m = makeDie(mats);
      m.position.set(x, PLATE_TOP + DIE / 2, z);
      this.diceGroup.add(m);
      return m;
    });
    this.diceGroup.visible = false;
    this.rig.add(this.diceGroup);
    this.root.add(this.rig);
    ctx.world.scene.add(this.root);
    this.dealer = ctx.world.createNpc(npcLook('dealer', 21), 'Nhà cái');
    this.dealer.setPosition(this.cx, this.cz + DEALER_DZ, 0);
  }

  /** Trạng thái mới từ server: đặt mặt xúc xắc, úp bát, thoại nhà cái theo pha. `prev` null = vừa vào map. */
  sync(st: TaiXiuPublicState, prev: TaiXiuPublicState | null): void {
    if (st.phase === 'result' && st.dice.length === 3 && (prev?.phase !== 'result' || prev.round !== st.round)) {
      this.showFaces(st.dice, st.round);
    }
    if (prev?.phase === 'result' && st.phase !== 'result') this.closeT0 = performance.now();
    if (!prev || prev.phase === st.phase) return;
    if (st.phase === 'betting') {
      this.dealer.say('Đặt cửa đi bà con! Tài hay Xỉu?', 2600);
      this.playDealer('wave', 1600);
    } else if (st.phase === 'resolving') {
      this.lastRattle = -1;
      this.dealer.say('Lắc đây!', 1400);
    } else if (st.phase === 'result' && st.dice.length === 3) {
      const o = taiXiuOutcome(st.dice);
      this.dealer.say(o.triple ? `Bộ ba ${st.dice[0]}! Nhà cái ăn hết!` : `${o.sum} — ${o.tai ? 'TÀI' : 'XỈU'}!`, 2600);
      if (o.triple) this.playDealer('laugh', 2400);
      const v = this.volume(0.6);
      if (v > 0.05) this.ctx.audio.play('card_flip', { volume: v, rate: 0.7 });
    } else if (st.phase === 'idle') {
      this.dealer.say('Nghỉ tay chút — ai chơi bấm E mở ván nhé!', 2800);
    }
  }

  update(st: TaiXiuPublicState): void {
    const now = this.ctx.serverNow();
    let x = REST.x;
    let y = REST.y;
    let z = REST.z;
    let tiltX = 0;
    let tiltZ = 0;
    let open = 0;
    if (st.phase === 'resolving') {
      const total = TAIXIU.rollMs / 1000;
      const t = (now - (st.endsAt - TAIXIU.rollMs)) / 1000;
      const up = smooth(clamp01(t / LIFT_S)) * (1 - smooth(clamp01((t - (total - LOWER_S)) / LOWER_S)));
      const s = up * up;
      x += (HOLD.x - REST.x) * up + Math.sin(t * 27) * 0.022 * s;
      y += (HOLD.y - REST.y) * up + Math.sin(t * 34) * 0.035 * s;
      z += (HOLD.z - REST.z) * up;
      tiltX = Math.cos(t * 23) * 0.08 * s;
      tiltZ = Math.sin(t * 31) * 0.14 * s;
      this.rattle(t, total);
    } else if (st.phase === 'result') {
      open = smooth(clamp01((now - (st.endsAt - TAIXIU.payoutMs)) / 1000 / OPEN_S));
    }
    if (this.closeT0 > 0) {
      const k = (performance.now() - this.closeT0) / CLOSE_MS;
      if (k >= 1 || st.phase === 'resolving' || st.phase === 'result') this.closeT0 = 0;
      else open = Math.max(open, 1 - smooth(k));
    }
    this.rig.position.set(x, y, z);
    this.rig.rotation.set(tiltX, 0, tiltZ);
    // Bát nhấc lên, lùi về phía nhà cái (−Z) và nghiêng đáy bát về Bắc: miệng bát quay ra phía khách.
    this.bowl.position.set(0, PLATE_TOP + open * OPEN_UP, -open * OPEN_BACK);
    this.bowl.rotation.set(-open * OPEN_TILT, 0, 0);
    this.diceGroup.visible = open > 0.02;

    const base: AnimId = st.phase === 'resolving' ? 'shake' : 'idle';
    const want = performance.now() < this.dealerUntil ? this.dealerOverride : base;
    if (want !== this.dealerAnim) {
      this.dealerAnim = want;
      this.dealer.avatar.setAnim(want);
    }
  }

  dispose(): void {
    this.ctx.world.scene.remove(this.root);
    kit.disposeTree(this.root);
    this.dealer.dispose();
  }

  /** Xoay từng viên cho mặt kết quả ngửa lên; góc xoay ngang + lệch nhẹ tất định theo ván (mọi máy giống nhau). */
  private showFaces(dice: readonly number[], round: number): void {
    this.dice.forEach((m, i) => {
      const e = UP_EULER[dice[i]!] ?? UP_EULER[1]!;
      tmpEuler.set(e[0], e[1], e[2]);
      tmpQuat.setFromEuler(tmpEuler);
      yawQuat.setFromAxisAngle(AXIS_Y, ((round * 5 + i * 3) % 8) * (Math.PI / 4) + 0.2 * i);
      m.quaternion.copy(tmpQuat).premultiply(yawQuat);
      const [sx, sz] = SLOTS[i]!;
      const j = (((round * 13 + i * 7) % 5) - 2) * 0.006;
      m.position.set(sx + j, PLATE_TOP + DIE / 2, sz - j);
    });
  }

  /** Tiếng xúc xắc lắc trong bát, lặp mỗi 0,5 s trong lúc nhà cái lắc (server phát tiếng đầu tiên lúc chốt cược). */
  private rattle(t: number, total: number): void {
    const k = Math.floor((t - 0.4) / 0.5);
    if (k < 0 || t > total - LOWER_S || k === this.lastRattle) return;
    this.lastRattle = k;
    const v = this.volume(0.85);
    if (v > 0.05) this.ctx.audio.play('dice_cup', { volume: v, rate: 0.95 + (k % 3) * 0.05 });
  }

  /** Âm lượng theo khoảng cách từ mình tới bàn. */
  private volume(base: number): number {
    const me = this.ctx.me();
    if (!me) return 0;
    return base * clamp01(1 - Math.hypot(me.x - this.cx, me.z - this.cz) / HEAR_R);
  }

  private playDealer(anim: AnimId, ms: number): void {
    this.dealerOverride = anim;
    this.dealerUntil = performance.now() + ms;
  }
}
