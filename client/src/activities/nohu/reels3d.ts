// Đồ động 4 máy Nổ Hũ ở neo 'slot_reels:slot_machine_N' / 'slot_lever:slot_machine_N': 3 trống cuộn (cung trụ cố định,
// "quay" bằng cách dời UV dọc trên texture dải dùng chung) nằm lọt khoang sau cửa sổ 0,70 × 0,40 m, vạch đường thắng,
// 2 đèn nóc nháy khi thắng, cần gạt kéo xuống mỗi lượt. Chuyển động tính thuần từ spin.startAt (giờ server) + ô dừng nên
// mọi máy (kể cả người đứng xem) thấy cùng một lượt quay, cuộn k dừng đúng ô lúc startAt + NOHU.reelStopMs[k].
// Neo quay π: +Z cục bộ hướng ra người chơi, khoang máy ở phía −Z. Mặt cuộn dịu đi khi camera sát máy (ngồi máy) cho khỏi
// vượt ngưỡng bloom của Bar. update() mỗi khung hình không cấp phát mới.
import * as THREE from 'three';
import { NOHU, SONG_BAC } from '@shared/index';
import { NOHU_STRIP_LEN, type NoHuPublicState, type NoHuSpin } from '@shared/activities/nohu';
import { kit } from '../../art/kit';
import type { ClientActivityContext } from '../types';
import { leverPull, reelDistance, reelPosition, wrapCell } from './motion';
import { createStripTexture } from './symbols';

const L = NOHU_STRIP_LEN;
/**
 * Trống cuộn: bán kính, nửa góc cung lộ ra (cao 0,376 m, vừa cửa sổ 0,40), trục lùi sau mặt neo — mặt trống lùi 6 cm
 * (sau mặt tủ 2 cm) ở đường thắng, 19 cm ở mép trên/dưới, vẫn trong khoang sâu 0,36 m — số đoạn cung.
 */
const R = 0.2;
const HALF = (70 * Math.PI) / 180;
const AXIS_Z = -(R + 0.06);
const SEG = 16;
const REEL_W = 0.205;
const REEL_X = [-0.235, 0, 0.235] as const;
/** Số ô lộ ra trong cửa sổ (trên — đường thắng — dưới). */
const VISIBLE = 3;
/** Lề u mỗi cột để lọc mipmap không ăn sang dải bên cạnh. */
const U_PAD = 0.004;
/** Góc kéo cần gạt (rad, ngả về phía người chơi). */
const PULL_ANGLE = 1.05;
/** Đèn nóc nháy sau khi cuộn 3 dừng (giây). */
const WIN_FLASH_S = 2.6;
const JACKPOT_FLASH_S = 7;
/** Tiếng máy nghe được trong bán kính này (m). */
const HEAR_R = 11;
/**
 * Mặt cuộn tự phát sáng (nền kem × GLOW) lại bị đèn sòng chiếu thẳng: độ chói ~0,6–1,3, vượt ngưỡng bloom Bar 0,62. Đứng
 * xa thì chỉ lấp lánh, nhưng ngồi máy cửa sổ cuộn chiếm ~1/6 khung hình → bloom loang trắng cả màn. Nên theo khoảng cách
 * ngang camera → mặt tủ gần nhất: ≤ DIM_NEAR m dùng mức dịu GLOW_NEAR + màu × TINT_NEAR (ước lượng PBR: phần sáng nhất
 * ≈ 0,56 ở máy 1 — gần đèn nhất —, ≈ 0,32 ở máy 4; dưới ngưỡng, cuộn + biểu tượng vẫn rõ), ≥ DIM_FAR m giữ như cũ, giữa
 * hai mốc chuyển mượt (năng lượng bloom của cuộn không lúc nào vượt mức lúc đứng cách 2 m với độ sáng cũ).
 */
const GLOW = 0.55;
const GLOW_NEAR = 0.18;
const TINT_NEAR = 0.5;
const DIM_NEAR = 1.2;
const DIM_FAR = 3;
/** Mặt tủ máy (z thế giới) — mốc đo khoảng cách camera. */
const FACE_Z = SONG_BAC.slots.z - SONG_BAC.slots.d / 2;

/** Cung trụ 1 cuộn (trục dọc X cục bộ), UV cột `col`; v cập nhật theo vị trí cuộn. */
function reelGeometry(col: number): { geo: THREE.BufferGeometry; uv: THREE.BufferAttribute } {
  const n = (SEG + 1) * 2;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uvs = new Float32Array(n * 2);
  const u0 = col / VISIBLE + U_PAD;
  const u1 = (col + 1) / VISIBLE - U_PAD;
  for (let i = 0; i <= SEG; i++) {
    const th = -HALF + (2 * HALF * i) / SEG;
    for (let j = 0; j < 2; j++) {
      const k = i * 2 + j;
      pos.set([(j ? 0.5 : -0.5) * REEL_W, R * Math.sin(th), AXIS_Z + R * Math.cos(th)], k * 3);
      nor.set([0, Math.sin(th), Math.cos(th)], k * 3);
      uvs[k * 2] = j ? u1 : u0;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const uv = new THREE.BufferAttribute(uvs, 2);
  geo.setAttribute('uv', uv);
  return { geo, uv };
}

/** Đặt object theo neo (vị trí + hướng thế giới); thiếu neo thì dùng vị trí tính từ SONG_BAC. */
function placeAtAnchor(obj: THREE.Object3D, ctx: ClientActivityContext, name: string, x: number, y: number, z: number): void {
  const a = ctx.world.anchor(name);
  if (a) {
    a.updateWorldMatrix(true, false);
    a.getWorldPosition(obj.position);
    a.getWorldQuaternion(obj.quaternion);
  } else {
    obj.position.set(x, y, z);
    obj.rotation.set(0, Math.PI, 0);
  }
}

interface Reel {
  uv: THREE.BufferAttribute;
  /** Vị trí đang hiện (ô, liên tục): ô nằm trên đường thắng. */
  pos: number;
}

interface Machine3D {
  x: number;
  z: number;
  root: THREE.Group;
  leverRoot: THREE.Group;
  lever: THREE.Group;
  reels: Reel[];
  lamp: THREE.MeshStandardMaterial;
  line: THREE.MeshStandardMaterial;
  /** Lượt đang hiển thị (theo startAt) và điểm xuất phát / quãng từng cuộn của lượt đó. */
  spin: NoHuSpin | null;
  spinAt: number;
  from: number[];
  dist: number[];
}

export class SlotMachines3D {
  private readonly tex = createStripTexture();
  private readonly reelMat = new THREE.MeshStandardMaterial({
    map: this.tex,
    emissive: '#ffffff',
    emissiveMap: this.tex,
    emissiveIntensity: GLOW,
    roughness: 0.42,
  });
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly machines: Machine3D[] = [];

  constructor(private readonly ctx: ClientActivityContext) {
    const sl = SONG_BAC.slots;
    sl.xs.forEach((x, i) => {
      const id = i + 1;
      const root = new THREE.Group();
      root.name = `nohu_reels_${id}`;
      placeAtAnchor(root, ctx, `slot_reels:slot_machine_${id}`, x, 1.38, sl.z - sl.d / 2 - 0.04);
      const reels: Reel[] = REEL_X.map((rx, k) => {
        const { geo, uv } = reelGeometry(k);
        this.geos.push(geo);
        root.add(kit.mesh(geo, this.reelMat, { x: rx, castShadow: false, receiveShadow: false }));
        return { uv, pos: Number.NaN };
      });
      const line = kit.matUnique('#ff2a2a', { emissive: '#ff2020', emissiveIntensity: 0.9, surface: 'none' });
      root.add(kit.mesh(kit.geo.box(0.68, 0.007, 0.004), line, { z: -0.012, castShadow: false, receiveShadow: false }));
      // 2 đèn nóc trên nắp tủ (nắp ở cao 2,05 m = neo + 0,67), hai bên biển neon "NỔ HŨ".
      const lamp = kit.matUnique('#ffe2a0', { emissive: '#ffb020', emissiveIntensity: 0.35, roughness: 0.3, surface: 'none' });
      const lampBase = kit.mat('#c9ccd2', { metalness: 0.8, roughness: 0.3, surface: 'none' });
      for (const s of [-1, 1]) {
        root.add(kit.mesh(kit.geo.cyl(0.05, 0.055, 0.03, 16), lampBase, { x: s * 0.54, y: 0.685, z: -0.3, castShadow: false }));
        root.add(kit.mesh(kit.geo.sphere(0.055, 16, 10), lamp, { x: s * 0.54, y: 0.7, z: -0.3, scale: [1, 1.2, 1], castShadow: false }));
      }
      ctx.world.scene.add(root);

      const leverRoot = new THREE.Group();
      leverRoot.name = `nohu_lever_${id}`;
      placeAtAnchor(leverRoot, ctx, `slot_lever:slot_machine_${id}`, x - sl.w / 2 - 0.06, 1.15, sl.z - 0.15);
      const lever = this.buildLever(leverRoot);
      ctx.world.scene.add(leverRoot);

      // Máy chưa quay lần nào: mỗi máy đứng yên ở vài ô khác nhau.
      const rest = [(id * 5) % L, (id * 11 + 3) % L, (id * 7 + 9) % L];
      reels.forEach((r, k) => this.setReel(r, rest[k]!));
      this.machines.push({ x, z: sl.standZ, root, leverRoot, lever, reels, lamp, line, spin: null, spinAt: 0, from: rest, dist: [0, 0, 0] });
    });
  }

  /** Cần gạt: bạc trục bắt vào hông máy, cần crôm dựng đứng, quả nắm đỏ; trả nhóm khớp quay. */
  private buildLever(root: THREE.Group): THREE.Group {
    const chrome = kit.mat('#d7dbe2', { metalness: 0.9, roughness: 0.25, surface: 'none' });
    const knob = kit.mat('#e3262a', { roughness: 0.25, emissive: '#5a0606', emissiveIntensity: 0.4, surface: 'none' });
    root.add(kit.mesh(kit.geo.cyl(0.045, 0.045, 0.02, 18), chrome, { x: -0.05, rz: Math.PI / 2, castShadow: false }));
    root.add(kit.mesh(kit.geo.cyl(0.028, 0.028, 0.08, 14), chrome, { x: -0.01, rz: Math.PI / 2, castShadow: false }));
    const pivot = new THREE.Group();
    pivot.position.set(0.03, 0, 0);
    pivot.add(kit.mesh(kit.geo.cyl(0.012, 0.014, 0.42, 10), chrome, { y: 0.21 }));
    pivot.add(kit.mesh(kit.geo.cyl(0.02, 0.02, 0.03, 12), chrome, { y: 0.39 }));
    pivot.add(kit.mesh(kit.geo.sphere(0.048, 16, 12), knob, { y: 0.45 }));
    root.add(pivot);
    return pivot;
  }

  /** Trạng thái mới: lượt mới ở máy nào thì dựng đường cuộn từ vị trí đang hiện + hẹn tiếng quay / dừng cuộn. */
  sync(st: NoHuPublicState): void {
    const now = this.ctx.serverNow();
    st.machines.forEach((m, i) => {
      const mach = this.machines[i];
      if (!mach) return;
      mach.spin = m.spin;
      const s = m.spin;
      if (!s || s.startAt === mach.spinAt) return;
      mach.spinAt = s.startAt;
      for (let k = 0; k < 3; k++) {
        // Xuất phát từ ô đang hiện (thường là ô dừng của lượt trước) để cuộn quay liền mạch.
        const p0 = wrapCell(mach.reels[k]!.pos);
        mach.from[k] = p0;
        mach.dist[k] = reelDistance(p0, s.stops[k], NOHU.reelStopMs[k]! / 1000);
      }
      if (now < s.stopAt) this.spinSounds(mach, s, now);
    });
  }

  /**
   * Hẹn tiếng lượt quay theo giờ server. Đang đếm ngược đổi map thì bỏ mọi tiếng hẹn từ mốc dịch chuyển trở đi: playAt
   * không hủy được, còn server chốt ngay lượt dở lúc đổi map (tiếng thưởng 'karma' tới đúng lúc đó) → tiếng dừng cuộn /
   * coin / cheer không vang ở map mới. Chuyến bị hoãn (có phiên chơi chung khác vừa mở) thì lượt đó thiếu vài tiếng.
   */
  private spinSounds(mach: Machine3D, s: NoHuSpin, now: number): void {
    const me = this.ctx.me();
    const mine = s.pid === this.ctx.state.me.pid;
    const d = me ? Math.hypot(me.x - mach.x, me.z - mach.z) : HEAR_R;
    const v = (mine ? 0.6 : 0.4) * Math.max(0, 1 - d / HEAR_R);
    if (v < 0.04) return;
    const audio = this.ctx.audio;
    const cut = this.ctx.state.room.mapChange?.at ?? Infinity;
    const play: typeof audio.playAt = (id, at, opts) => {
      if (at < cut) audio.playAt(id, at, opts);
    };
    if (now < s.startAt + 400) play('slot_spin', Math.max(s.startAt, now), { volume: v * 0.8 });
    NOHU.reelStopMs.forEach((ms, k) => {
      if (s.startAt + ms > now) play('slot_stop', s.startAt + ms, { volume: v, rate: 1 + k * 0.06 });
    });
    if (mine && !s.jackpot && s.win > 0) {
      play('coin', s.stopAt + 60, { volume: 0.7 });
      if (s.win >= s.bet * NOHU.paytable.chuong) play('cheer', s.stopAt + 120, { volume: 0.5 });
    }
  }

  update(): void {
    const now = this.ctx.serverNow();
    const wall = performance.now() / 1000;
    this.dimReels();
    for (const mach of this.machines) {
      const s = mach.spin;
      const t = s ? (now - s.startAt) / 1000 : -1;
      for (let k = 0; k < 3; k++) {
        const reel = mach.reels[k]!;
        const p = s ? reelPosition(mach.from[k]!, mach.dist[k]!, s.stops[k], t, NOHU.reelStopMs[k]! / 1000) : mach.from[k]!;
        if (!(Math.abs(p - reel.pos) <= 1e-4)) this.setReel(reel, p);
      }
      // Cần gạt kéo xuống lúc bắt đầu lượt rồi nhả về.
      mach.lever.rotation.x = leverPull(t) * PULL_ANGLE;
      this.lights(mach, s, t, wall);
    }
  }

  /** Dịu / trả mặt cuộn (vật liệu chung 4 máy) theo khoảng cách ngang từ camera tới mặt tủ gần nhất — xem GLOW. */
  private dimReels(): void {
    const cam = this.ctx.world.camera.position;
    let d2 = Infinity;
    for (const mach of this.machines) d2 = Math.min(d2, (cam.x - mach.x) ** 2 + (cam.z - FACE_Z) ** 2);
    const k = THREE.MathUtils.smoothstep(Math.sqrt(d2), DIM_NEAR, DIM_FAR);
    this.reelMat.emissiveIntensity = GLOW_NEAR + (GLOW - GLOW_NEAR) * k;
    this.reelMat.color.setScalar(TINT_NEAR + (1 - TINT_NEAR) * k);
  }

  /** Đèn nóc + vạch đường thắng: chờ dịu; đang quay thở nhẹ; thắng nháy vàng; nổ hũ nháy đổi màu cầu vồng. */
  private lights(mach: Machine3D, s: NoHuSpin | null, t: number, wall: number): void {
    const stopT = NOHU.spinMs / 1000;
    const won = !!s && (s.jackpot || s.win > 0) && !(s.done && s.win <= 0);
    const after = t - stopT;
    let lamp = 0.35;
    let line = 0.9;
    if (s && t >= 0 && t < stopT) {
      lamp = 0.55 + 0.3 * Math.sin(wall * 9);
      mach.lamp.emissive.setRGB(1, 0.69, 0.13);
    } else if (won && after >= 0 && after < (s!.jackpot ? JACKPOT_FLASH_S : WIN_FLASH_S)) {
      const on = Math.floor(wall * 8) % 2 === 0;
      lamp = on ? 3 : 0.25;
      line = on ? 2.6 : 0.6;
      if (s!.jackpot) mach.lamp.emissive.setHSL((wall * 0.8) % 1, 1, 0.55);
      else mach.lamp.emissive.setRGB(1, 0.78, 0.2);
    } else {
      mach.lamp.emissive.setRGB(1, 0.69, 0.13);
    }
    mach.lamp.emissiveIntensity = lamp;
    mach.line.emissiveIntensity = line;
  }

  /** Dời UV dọc của cuộn: ô `p` nằm giữa (đường thắng), ô p+1 phía trên, p−1 phía dưới; ô tăng = biểu tượng trôi xuống. */
  private setReel(reel: Reel, p: number): void {
    reel.pos = p;
    const base = wrapCell(p) - 1;
    const arr = reel.uv.array as Float32Array;
    for (let i = 0; i <= SEG; i++) {
      const v = (base + (VISIBLE * i) / SEG) / L;
      arr[i * 4 + 1] = v;
      arr[i * 4 + 3] = v;
    }
    reel.uv.needsUpdate = true;
  }

  dispose(): void {
    for (const mach of this.machines) {
      this.ctx.world.scene.remove(mach.root, mach.leverRoot);
      kit.disposeTree(mach.leverRoot);
      mach.lamp.dispose();
      mach.line.dispose();
    }
    for (const g of this.geos) g.dispose();
    this.reelMat.dispose();
    this.tex.dispose();
    this.machines.length = 0;
    this.geos.length = 0;
  }
}
