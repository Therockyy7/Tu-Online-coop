// HỢP ĐỒNG bộ khung nhân vật "hạt đậu" — dùng chung cho avatar.ts (lắp ráp), character/body.ts + outfit.ts (hình thân,
// áo quần), character/headwear.ts (tóc, mũ, kính), character/handheld.ts (tích trượng, quạt, dụng cụ),
// character/face.ts (đầu + biểu cảm), character/motion.ts (chuyển động), character/fpHands.ts (tay góc nhìn thứ nhất).
// Đổi gì ở đây là đổi giao kèo giữa các phần: cây khớp, kích thước, dáng thân, biến dạng ngồi, ý nghĩa + dấu của từng
// kênh tư thế (Pose), kiểu trả về của từng phần dựng.
//
// Hệ trục "thân" (body space): gốc = mặt đất giữa hai chân; +Y lên; +Z = phía trước (mặt nhìn về +Z); +X = bên TRÁI
// của nhân vật (tay/chân trái ở +X). Đơn vị mét, góc radian. Kích thước dưới đây là lúc đứng nghỉ (REST_POSE).
import * as THREE from 'three';
import type { AnimId } from '@shared/index';
import type { AvatarLook } from '../api';
import type { GripStyle } from '../props';

/** Kích thước chuẩn (body space, đứng nghỉ). Giữ nguyên để camera, nhãn tên, chỗ ngồi… không lệch. */
export const BODY = {
  /** Gấu áo (đáy thân). */
  hemY: 0.06,
  /** Bán kính lớn nhất của vạt dưới (gần gấu). */
  hemR: 0.46,
  /** Eo: khớp xoay chung của vạt dưới (skirt) và thân trên (chest). */
  waistY: 0.62,
  waistR: 0.34,
  /** Khớp hông: xoay cả người (lean/roll/twist) quanh đây. */
  hipsY: 0.45,
  /** Độ cao khớp hông khi ngồi/quỳ hẳn (pose.sit = 1): gấu áo (đã morph) chạm sàn ≈ y 0.05. */
  sitHipsY: 0.2,
  /** Ngực rộng nhất ≈ y 0.72. */
  chestR: 0.345,
  shoulderY: 0.97,
  /** Khớp vai cách trục giữa (vai trái ở +X). */
  shoulderX: 0.31,
  /** Khớp cổ: đầu xoay quanh đây. */
  neckY: 1.06,
  /** Tâm đầu + bán kính sọ. */
  headY: 1.31,
  headR: 0.31,
  /**
   * Vai → khuỷu, khuỷu → tâm bàn tay (tổng 0.45 ≈ tay 0.43 của bản cũ). Ngắn hơn nữa thì không chắp tay được trước ngực
   * mà không xuyên thân (ngực bán kính 0.345): chắp tay chỉ vừa ở ngay dưới cằm, y ≈ 0.97–1.0, z ≈ 0.37.
   */
  upperArm: 0.22,
  forearm: 0.23,
  /** Bán kính bàn tay (tròn như găng tay hở ngón cái). */
  handR: 0.085,
  footX: 0.15,
  footY: 0.055,
  footZ: 0.03,
  /** Điểm gắn nhãn tên / bong bóng chat (headAnchor). */
  labelY: 1.87,
} as const;

type V3 = readonly [number, number, number];

/** Vị trí khớp (body space, đứng nghỉ). Mesh dựng theo body space thì gắn vào khớp với position = −PIVOT (xem `alignToBody`). */
export const PIVOT = {
  hips: [0, BODY.hipsY, 0] as V3,
  /** Eo — chung cho `skirt`, `chest`, `torso`. */
  waist: [0, BODY.waistY, 0] as V3,
  neck: [0, BODY.neckY, 0] as V3,
  shoulderL: [BODY.shoulderX, BODY.shoulderY, 0] as V3,
  shoulderR: [-BODY.shoulderX, BODY.shoulderY, 0] as V3,
  elbowL: [BODY.shoulderX, BODY.shoulderY - BODY.upperArm, 0] as V3,
  elbowR: [-BODY.shoulderX, BODY.shoulderY - BODY.upperArm, 0] as V3,
  handL: [BODY.shoulderX, BODY.shoulderY - BODY.upperArm - BODY.forearm, 0] as V3,
  handR: [-BODY.shoulderX, BODY.shoulderY - BODY.upperArm - BODY.forearm, 0] as V3,
  /** Vật ôm hai tay trước bụng (grip 'carry'). */
  carry: [0, 0.83, 0.4] as V3,
  label: [0, BODY.labelY, 0] as V3,
};

/**
 * Khép vai (pose.lShoulder / rShoulder = 1): khớp vai TRÁI dời (x −0.02 vào trong, y 0, z +0.07 ra trước); vai phải đối
 * xứng gương. Tay 0.45 với tới điểm chắp tay dưới cằm gần như duỗi thẳng khi vai đứng yên → cẳng tay áp sát ngực; khép
 * vai cho khuỷu gập được, cẳng tay + ống tay ra ngoài thân (chắp tay, vỗ tay, ôm vật).
 */
export const SHOULDER_FWD = [-0.02, 0, 0.07] as V3;

/**
 * Ống tay áo (outfit.ts dựng trên khớp shoulder* / elbow*, xương dọc −Y cục bộ): bán kính NGOÀI lớn nhất tính từ trục
 * xương, kể cả nếp vải. Ống tay trên ≤ upperR (đầu vai bo tròn kín, lồng vào vòm vai của thân — khép vai / giơ tay không
 * lộ khe); cẳng tay ≤ foreR; ống tay rộng (st.wide) loe dần tới cuffWide ở miệng tay áo. Mũ cà sa vai trái (kasaya.ts,
 * khớp shoulderL) nằm ngoài upperR ≥ 3 mm. motion.ts giữ các ống tay theo những bán kính này ngoài thân.
 */
export const SLEEVE = { upperR: 0.07, foreR: 0.066, cuffWide: 0.11 } as const;

/** Đặt `obj` (hình dựng theo body space) vào khớp có tâm `pivot` sao cho lúc đứng nghỉ trùng đúng chỗ. */
export function alignToBody<T extends THREE.Object3D>(obj: T, pivot: V3): T {
  obj.position.set(-pivot[0], -pivot[1], -pivot[2]);
  return obj;
}

// ───────────────────────── Dáng thân chuẩn ─────────────────────────

/**
 * Dáng thân MẶC ÁO lúc đứng nghỉ: bán kính quanh trục Y theo độ cao (body space) — gấu (0.06) → eo (0.62) → ngực →
 * vòm vai khép lại ở cổ (1.08). Cùng dáng với 2 khối tiện cũ (LOWER_GEO/UPPER_GEO), nội suy Hermite đơn điệu (không
 * vọt lố). body.ts dựng mặt thân từ đây (được thêm nếp vải: bán kính thật nằm trong [profileR − 0.004, profileR + 0.012]);
 * motion.ts dùng làm "vỏ" để bàn tay / ống tay không lọt vào thân. Đầu là ellipsoid riêng (SKULL).
 */
export const PROFILE: readonly (readonly [y: number, r: number])[] = [
  [0.06, 0.43],
  [0.13, 0.46],
  [0.32, 0.42],
  [0.5, 0.37],
  [0.62, 0.34],
  [0.72, 0.345],
  [0.86, 0.335],
  [0.98, 0.29],
  [1.06, 0.19],
  [1.08, 0],
];

const PROF_TAN: number[] = (() => {
  // Tiếp tuyến Fritsch–Carlson cho Hermite đơn điệu.
  const n = PROFILE.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((PROFILE[i + 1]![1] - PROFILE[i]![1]) / (PROFILE[i + 1]![0] - PROFILE[i]![0]));
  const m: number[] = [d[0]!];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  m.push(d[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i]!;
      m[i + 1] = k * b * d[i]!;
    }
  }
  return m;
})();

/** Bán kính thân mặc áo ở độ cao `y` (body space, đứng nghỉ); ngoài [0.06, 1.08] trả 0. */
export function profileR(y: number): number {
  const n = PROFILE.length;
  if (y < PROFILE[0]![0] || y > PROFILE[n - 1]![0]) return 0;
  let i = 0;
  while (i < n - 2 && y > PROFILE[i + 1]![0]) i++;
  const [y0, r0] = PROFILE[i]!;
  const [y1, r1] = PROFILE[i + 1]!;
  const h = y1 - y0;
  const t = (y - y0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * r0 + (t3 - 2 * t2 + t) * h * PROF_TAN[i]! + (-2 * t3 + 3 * t2) * r1 + (t3 - t2) * h * PROF_TAN[i + 1]!;
}

/**
 * Sọ (face.ts dựng, headwear.ts ôm khít): ellipsoid tâm head-local (0, cy, 0), bán kính (rx, ry, rz), mặt nhìn +Z.
 * Mắt tâm (±eyeX, eyeY) trên mặt sọ; mắt/mày nhô khỏi mặt sọ tối đa `featureOut` — kính râm đặt cách mặt sọ ≥ 0.028.
 */
export const SKULL = {
  cy: BODY.headY - BODY.neckY,
  rx: BODY.headR,
  ry: BODY.headR * 0.96,
  rz: BODY.headR * 0.98,
  eyeX: 0.11,
  eyeY: BODY.headY - BODY.neckY + 0.045,
  featureOut: 0.02,
} as const;

// ───────────────────────── Biến dạng ngồi (morph 'sit') ─────────────────────────

/** Ngồi kiết già / quỳ: vạt dưới xẹp xuống, xòe ra, phồng phía trước (đầu gối) — gấu vẫn nằm trên sàn. */
export const SIT = {
  /** Eo (khớp skirt) khi ngồi hẳn: hipsY = sitHipsY. */
  waistY: BODY.sitHipsY + (BODY.waistY - BODY.hipsY),
  /** Gấu áo khi ngồi hẳn (body space). */
  hemY: 0.05,
  /** Gấu xòe thêm (bán kính × (1 + flare)). */
  flare: 0.38,
  /** Phần dưới phía trước phồng ra thêm (m) — đầu gối khoanh. */
  knees: 0.09,
} as const;

const SKIRT_H = BODY.waistY - BODY.hemY;
const SIT_H = SIT.waistY - SIT.hemY;
const SIT_K = SKIRT_H / SIT_H;

function smooth01(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Morph 'sit' (pose.sit = 1) của vạt dưới: điểm skirt-local lúc nghỉ (gốc = eo, trục như body space) → vị trí lúc ngồi
 * hẳn. Sát eo gần như giữ nguyên (độ dốc 1); gấu xẹp phẳng trên sàn. Gấu chạm sàn khi hipsY = lerp(BODY.hipsY,
 * BODY.sitHipsY, sit) — motion giữ đúng quan hệ này. Morph trơn này chỉ dành cho chính vạt dưới: phần dưới xẹp phẳng nên
 * khe giữa một lớp vải và vạt dưới có thể mất (lớp nằm ngoài lúc nghỉ vẫn có thể lún vào khi ngồi) → mọi lớp khác gắn
 * khớp `skirt` dùng morph "bám mặt" `addSitMorph(geo, variant)` của body.ts.
 */
export function sitDeform(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const t = Math.min(1, Math.max(0, -y / SKIRT_H));
  const yy = y >= 0 ? y : -SIT_H * (1 - Math.pow(1 - t, SIT_K)) - Math.max(0, -y - SKIRT_H);
  const fl = 1 + SIT.flare * smooth01(0.15, 1, t);
  const r = Math.hypot(x, z);
  const front = r > 1e-6 ? Math.max(0, z / r) : 0;
  const bulge = SIT.knees * smooth01(0.3, 0.95, t) * front * Math.sqrt(front) * Math.min(1, r / 0.3);
  return out.set(x * fl, yy, z * fl + bulge);
}

/** Như `sitDeform` nhưng cho hình dựng theo body space rồi gắn vào `skirt` bằng alignToBody(obj, PIVOT.waist). */
export function sitDeformBody(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  sitDeform(x, y - BODY.waistY, z, out);
  out.y += BODY.waistY;
  return out;
}

/**
 * Cây khớp (avatar.ts tạo bằng `createJoints`, outfit/face gắn mesh vào, `applyPose` xoay mỗi khung hình):
 *
 * root   (engine: position (x, 0, z), rotation.y = hướng nhìn ry)
 * └ turn        rotation.y = pose.turn + pose.spin — thân quay theo hướng bước đi (0 = theo hướng nhìn)
 *   ├ footL / footR   vị trí body space (chân trái +X); không nảy theo bounce → bàn chân bám đất khi thân nhún
 *   └ bounce   position.y = pose.y; scale (s, pose.squash, s), s = 1/√squash (giữ thể tích) — gốc ở mặt đất
 *     └ hips   (0, BODY.hipsY) → position.y = pose.hipsY; rotation (lean, twist, roll) thứ tự 'YXZ'
 *       ├ skirt   pivot eo — vạt dưới (+ mọi thứ bám vạt dưới); rotation (skirtX, 0, skirtZ); morph 'sit'
 *       ├ chest   pivot eo — rotation (bend, chestTwist, chestRoll) thứ tự 'YXZ' (cúi ở eo, vạt dưới đứng yên)
 *       │ ├ torso   pivot eo — vỏ thân trên (áo, cổ áo, cà sa phần trên, chuỗi hạt…), co giãn theo pose.breath
 *       │ ├ head    pivot cổ — rotation (headX, headY, headZ) thứ tự 'YXZ'; face.ts + mũ/tóc gắn vào đây
 *       │ ├ shoulderL → elbowL → handL → itemL   (tay trái +X; itemL = chỗ cầm trong lòng bàn tay; vai dời theo
 *       │ │                                       pose.lShoulder × SHOULDER_FWD)
 *       │ ├ shoulderR → elbowR → handR → itemR   (vai dời theo pose.rShoulder, đối xứng gương)
 *       │ └ carry   vật ôm trước bụng
 *       └ headAnchor   nhãn tên (không xoay theo đầu)
 */
export interface Joints {
  readonly root: THREE.Group;
  readonly turn: THREE.Group;
  readonly bounce: THREE.Group;
  readonly hips: THREE.Group;
  readonly skirt: THREE.Group;
  readonly chest: THREE.Group;
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly shoulderL: THREE.Group;
  readonly elbowL: THREE.Group;
  readonly handL: THREE.Group;
  readonly itemL: THREE.Group;
  readonly shoulderR: THREE.Group;
  readonly elbowR: THREE.Group;
  readonly handR: THREE.Group;
  readonly itemR: THREE.Group;
  readonly carry: THREE.Group;
  readonly footL: THREE.Group;
  readonly footR: THREE.Group;
  readonly headAnchor: THREE.Object3D;
}

function joint(name: string, parent: THREE.Object3D, pivot: V3, parentPivot: V3): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
  parent.add(g);
  return g;
}

/** Dựng cây khớp rỗng ở tư thế nghỉ (chưa có mesh). */
export function createJoints(): Joints {
  const O: V3 = [0, 0, 0];
  const root = new THREE.Group();
  root.name = 'avatar';
  const turn = joint('turn', root, O, O);
  const footL = joint('footL', turn, [BODY.footX, BODY.footY, BODY.footZ], O);
  const footR = joint('footR', turn, [-BODY.footX, BODY.footY, BODY.footZ], O);
  const bounce = joint('bounce', turn, O, O);
  const hips = joint('hips', bounce, PIVOT.hips, O);
  const skirt = joint('skirt', hips, PIVOT.waist, PIVOT.hips);
  const chest = joint('chest', hips, PIVOT.waist, PIVOT.hips);
  const torso = joint('torso', chest, PIVOT.waist, PIVOT.waist);
  const head = joint('head', chest, PIVOT.neck, PIVOT.waist);
  const shoulderL = joint('shoulderL', chest, PIVOT.shoulderL, PIVOT.waist);
  const elbowL = joint('elbowL', shoulderL, PIVOT.elbowL, PIVOT.shoulderL);
  const handL = joint('handL', elbowL, PIVOT.handL, PIVOT.elbowL);
  const itemL = joint('itemL', handL, PIVOT.handL, PIVOT.handL);
  const shoulderR = joint('shoulderR', chest, PIVOT.shoulderR, PIVOT.waist);
  const elbowR = joint('elbowR', shoulderR, PIVOT.elbowR, PIVOT.shoulderR);
  const handR = joint('handR', elbowR, PIVOT.handR, PIVOT.elbowR);
  const itemR = joint('itemR', handR, PIVOT.handR, PIVOT.handR);
  const carry = joint('carry', chest, PIVOT.carry, PIVOT.waist);
  const headAnchor = joint('headAnchor', hips, PIVOT.label, PIVOT.hips);
  return { root, turn, bounce, hips, skirt, chest, torso, head, shoulderL, elbowL, handL, itemL, shoulderR, elbowR, handR, itemR, carry, footL, footR, headAnchor };
}

/**
 * Tư thế một khung hình. Mọi kênh là số thực (radian / mét); motion.ts làm mượt từng kênh bằng lò xo rồi trả ra.
 * Dấu (theo `applyPose`): lean/bend/headX > 0 = cúi về trước; twist/chestTwist/headY > 0 = mặt quay sang trái (+X);
 * roll/chestRoll/headZ > 0 = nghiêng đỉnh đầu sang phải (−X); ArmX > 0 = giơ tay ra trước/lên; ArmZ > 0 = dang tay ra
 * ngoài (cả hai bên); ArmY = xoắn cánh tay quanh trục dọc (tay phải đối xứng gương); Elbow > 0 = gập khuỷu về trước;
 * Wrist = xoay bàn tay quanh trục cẳng tay; FootX > 0 = bàn chân dạt ra ngoài; FootZ > 0 = về trước; FootPitch > 0 =
 * mũi chân chúc xuống.
 */
export interface Pose {
  /** Thân quay so với hướng nhìn (quay theo hướng bước đi). */
  turn: number;
  /** Quay thêm cả người (dance3, thăng cấp). */
  spin: number;
  /** Nảy cả người lên (m) — nhún khi đi, nhảy. Bàn chân không tự nảy theo: motion nhấc chân khi bật nhảy. */
  y: number;
  /** 1 = bình thường; < 1 dẹt xuống; > 1 vươn cao (giữ thể tích). */
  squash: number;
  /** Độ cao khớp hông (body space, nghỉ = BODY.hipsY; ngồi/quỳ ≈ BODY.sitHipsY). */
  hipsY: number;
  lean: number;
  twist: number;
  roll: number;
  /** 0..1: vạt dưới xòe phẳng ra (ngồi kiết già / quỳ) thay vì lún xuống sàn. */
  sit: number;
  /** Vạt dưới đung đưa trễ theo thân (thứ cấp). */
  skirtX: number;
  skirtZ: number;
  /** Cúi thân trên ở eo. */
  bend: number;
  chestTwist: number;
  chestRoll: number;
  /** Nhịp thở: ≈ ±0.02 (co giãn vỏ thân trên). */
  breath: number;
  headX: number;
  headY: number;
  headZ: number;
  lArmX: number;
  lArmY: number;
  lArmZ: number;
  lElbow: number;
  lWrist: number;
  rArmX: number;
  rArmY: number;
  rArmZ: number;
  rElbow: number;
  rWrist: number;
  /** Lệch bàn chân so với chỗ nghỉ (m) + góc mũi chân. */
  lFootX: number;
  lFootY: number;
  lFootZ: number;
  lFootPitch: number;
  rFootX: number;
  rFootY: number;
  rFootZ: number;
  rFootPitch: number;
  /** 0..1: chân thu vào trong vạt áo (ngồi/quỳ) — > 0.8 thì ẩn bàn chân. */
  tuck: number;
  /** Góc đung đưa thứ cấp (trễ theo gia tốc thân) cho đồ lủng lẳng: dải mũ, đuôi dây lưng, tua, khoen tích trượng. */
  swayX: number;
  swayZ: number;
  /** 0..1: khép vai trái / phải ra trước (SHOULDER_FWD) — chắp tay, vỗ tay, ôm vật. */
  lShoulder: number;
  rShoulder: number;
}

export const REST_POSE: Readonly<Pose> = {
  turn: 0,
  spin: 0,
  y: 0,
  squash: 1,
  hipsY: BODY.hipsY,
  lean: 0,
  twist: 0,
  roll: 0,
  sit: 0,
  skirtX: 0,
  skirtZ: 0,
  bend: 0,
  chestTwist: 0,
  chestRoll: 0,
  breath: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  // Tay buông hai bên, dang vừa đủ để bàn tay cách vạt áo ~2,5 cm (dang ít hơn là bàn tay lọt vào thân).
  lArmX: 0.1,
  lArmY: 0,
  lArmZ: 0.34,
  lElbow: 0.22,
  lWrist: 0,
  rArmX: 0.1,
  rArmY: 0,
  rArmZ: 0.34,
  rElbow: 0.22,
  rWrist: 0,
  lFootX: 0,
  lFootY: 0,
  lFootZ: 0,
  lFootPitch: 0,
  rFootX: 0,
  rFootY: 0,
  rFootZ: 0,
  rFootPitch: 0,
  tuck: 0,
  swayX: 0,
  swayZ: 0,
  lShoulder: 0,
  rShoulder: 0,
};

export const POSE_KEYS = Object.keys(REST_POSE) as (keyof Pose)[];

/** Khớp vai lúc nghỉ, so với khớp eo (cha của vai là `chest`). */
const SHOULDER_Y = BODY.shoulderY - BODY.waistY;

/** Áp tư thế lên cây khớp (không đụng morph 'sit' và đồ lủng lẳng — avatar.ts tự áp hai thứ đó). */
export function applyPose(j: Joints, p: Readonly<Pose>): void {
  j.turn.rotation.set(0, p.turn + p.spin, 0);
  j.bounce.position.y = p.y;
  const sq = Math.max(0.5, p.squash);
  const s = 1 / Math.sqrt(sq);
  j.bounce.scale.set(s, sq, s);
  j.hips.position.y = p.hipsY;
  j.hips.rotation.set(p.lean, p.twist, p.roll, 'YXZ');
  j.skirt.rotation.set(p.skirtX, 0, p.skirtZ);
  j.chest.rotation.set(p.bend, p.chestTwist, p.chestRoll, 'YXZ');
  j.torso.scale.set(1 + p.breath * 0.6, 1 + p.breath, 1 + p.breath * 0.8);
  j.head.rotation.set(p.headX, p.headY, p.headZ, 'YXZ');
  // Tay buông dọc −Y: dang ra (Z) → xoắn (Y) → giơ ra trước (X), theo trục cố định của vai. Tay phải đối xứng gương.
  const ls = p.lShoulder;
  const rs = p.rShoulder;
  j.shoulderL.position.set(BODY.shoulderX + SHOULDER_FWD[0] * ls, SHOULDER_Y + SHOULDER_FWD[1] * ls, SHOULDER_FWD[2] * ls);
  j.shoulderR.position.set(-BODY.shoulderX - SHOULDER_FWD[0] * rs, SHOULDER_Y + SHOULDER_FWD[1] * rs, SHOULDER_FWD[2] * rs);
  j.shoulderL.rotation.set(-p.lArmX, p.lArmY, p.lArmZ, 'XYZ');
  j.shoulderR.rotation.set(-p.rArmX, -p.rArmY, -p.rArmZ, 'XYZ');
  j.elbowL.rotation.set(-p.lElbow, 0, 0);
  j.elbowR.rotation.set(-p.rElbow, 0, 0);
  j.handL.rotation.set(0, p.lWrist, 0);
  j.handR.rotation.set(0, -p.rWrist, 0);
  j.footL.position.set(BODY.footX + p.lFootX, BODY.footY + p.lFootY, BODY.footZ + p.lFootZ);
  j.footR.position.set(-BODY.footX - p.rFootX, BODY.footY + p.rFootY, BODY.footZ + p.rFootZ);
  j.footL.rotation.set(p.lFootPitch, 0, 0);
  j.footR.rotation.set(p.rFootPitch, 0, 0);
  j.footL.visible = j.footR.visible = p.tuck < 0.8;
}

/** Biểu cảm khuôn mặt (motion chọn theo hoạt ảnh, face.ts vẽ). */
export type Expression =
  /** Mặc định: mắt tròn long lanh, cười mỉm. */
  | 'neutral'
  /** Vui: mắt cong ^ ^, miệng cười. */
  | 'happy'
  /** Cười lớn: mắt nhắm cong, miệng há. */
  | 'laugh'
  /** An tịnh: mắt nhắm hiền, miệng mỉm (thiền, chắp tay, lạy). */
  | 'calm'
  /** Chăm chú làm việc: mày hơi chau, miệng chúm. */
  | 'focus'
  | 'sad'
  /** Khóc: nhắm mắt, nước mắt chảy, miệng mếu. */
  | 'cry'
  /** Giận: mày chau xuống, mặt đỏ. */
  | 'angry'
  | 'surprised'
  /** Say / loạng choạng: mắt xoáy hoặc lờ đờ. */
  | 'dizzy'
  | 'sleepy';

export interface MatOpts {
  emissive?: string;
  ei?: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  map?: THREE.Texture | null;
  doubleSide?: boolean;
}

/**
 * Vật liệu RIÊNG của một nhân vật (avatar.ts cấp): cùng `key` → cùng vật liệu (gọi lại thì đổi màu). Mọi mesh của nhân
 * vật phải dùng vật liệu từ đây (để làm mờ khi mất kết nối). Không gắn texture ba mặt theo toạ độ thế giới (vân sẽ "trôi"
 * khi nhân vật di chuyển).
 */
export type MatFactory = (key: string, color: string, o?: MatOpts) => THREE.MeshStandardMaterial;

/** Đồ lủng lẳng: avatar.ts đặt obj.rotation = góc lúc dựng + (pose.swayX, 0, pose.swayZ) × gain mỗi khung hình. */
export interface Dangler {
  readonly obj: THREE.Object3D;
  readonly gain: number;
}

/** Một phần dựng theo ngoại hình (áo, đồ đội đầu, đồ cầm): avatar.ts gom lại, gọi dispose khi đổi ngoại hình. */
export interface PartBuild {
  /** Mesh có morph 'sit' ở morphTargetInfluences[0] — avatar.ts gán = pose.sit mỗi khung hình. */
  readonly sitMorph: readonly THREE.Mesh[];
  readonly danglers: readonly Dangler[];
  /** Gỡ mọi thứ đã gắn khỏi cây khớp + dispose geometry RIÊNG (không đụng geometry cache dùng chung, không đụng vật liệu). */
  dispose(): void;
}

/** Thân + áo quần + cà sa + tay áo + bàn tay + giày + phụ kiện trên thân (chuỗi hạt, dây chuyền) — outfit.ts. */
export type BuildOutfit = (look: AvatarLook, j: Joints, mat: MatFactory) => PartBuild;

/** Tóc, nón/mũ, mũ Tỳ Lư (Phương Trượng), kính râm — headwear.ts; gắn vào khớp `head`, ôm khít SKULL. */
export type BuildHeadwear = (look: AvatarLook, head: THREE.Group, mat: MatFactory) => PartBuild;

/** Dụng cụ làm việc hiện ở tay phải theo hoạt ảnh khi tay đang trống. */
export type ToolKind = 'axe' | 'mallet' | 'knife' | 'spatula' | 'fan' | 'shaker';

/**
 * Đồ cầm (handheld.ts): `root` có gốc = tâm nắm trong lòng bàn tay, +Y dọc cán hướng lên. avatar.ts gắn vào itemL/itemR
 * và giữ thẳng đứng khi cần (tích trượng, vật 'upright').
 */
export interface HandheldBuild extends PartBuild {
  readonly root: THREE.Group;
  /** Khoảng từ tâm nắm xuống đầu dưới (tích trượng) — avatar.ts trượt gậy trong tay để đầu dưới không thấp hơn y 0.02. */
  readonly below: number;
}

/** Đầu + khuôn mặt (face.ts): dựng sọ, tai, mắt, mày, mũi, miệng, má hồng, nước mắt… gắn vào khớp `head`. */
export interface FaceDriver {
  /** Mỗi khung hình: chuyển biểu cảm mượt, chớp mắt, má đỏ theo độ say (0..100). */
  update(dt: number, time: number, expression: Expression, drunk: number): void;
  /** Giải phóng geometry riêng (không đụng vật liệu — avatar.ts quản lý). */
  dispose(): void;
}
export type BuildFace = (head: THREE.Group, look: AvatarLook, mat: MatFactory) => FaceDriver;

/** Đầu vào chuyển động mỗi khung hình (avatar.ts gom). */
export interface MotionInput {
  anim: AnimId;
  /** Giây kể từ lúc đổi hoạt ảnh (prostrate: khớp nhịp lạy với camera qua `prostrateDip`). */
  animTime: number;
  /** Tốc độ di chuyển thực (m/s, đã làm mượt). */
  speed: number;
  /** Hướng bước đi so với hướng nhìn (root): 0 = thẳng trước, +π/2 = sang trái (+X); null = đứng yên / vừa dịch chuyển. */
  moveYaw: number | null;
  /** Kiểu cầm vật ở tay phải / hai tay; null = tay không. */
  grip: GripStyle | null;
  /** Tay trái cầm thường trực: tích trượng (Phương Trượng) / quạt — giữ bên hông, không chắp tay, không chạm đầu. */
  leftBusy: 'staff' | 'fan' | null;
  /** Đang hiện dụng cụ hành động ở tay phải (rìu, dùi mõ, dao…). */
  tool: boolean;
  /** Độ say 0..100. */
  drunk: number;
}

export interface MotionOutput {
  /** Tư thế đã làm mượt — object dùng lại giữa các khung hình, đọc ngay đừng giữ. */
  pose: Readonly<Pose>;
  expression: Expression;
}

export interface MotionDriver {
  update(dt: number, time: number, input: MotionInput): MotionOutput;
  /** Nhảy thẳng tới tư thế đích (bỏ lò xo) — khi vừa tạo nhân vật. */
  snap(input: MotionInput): void;
}
export type CreateMotion = () => MotionDriver;
