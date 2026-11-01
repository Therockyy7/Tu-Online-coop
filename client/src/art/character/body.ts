// Thư viện mặt thân mặc áo (nền chống xuyên áo): bán kính bề mặt + nếp vải / gấu rách / ly quần, điểm + pháp tuyến bám
// thân, lớp vải xếp chồng (LAYER), vạt dưới (skirt) + vỏ thân trên (torso) đóng kín, dải / mảng / vòng vải bám thân,
// quy ước đồ vắt qua eo (WAIST), morph 'sit' bám mặt.
//
// Mọi toạ độ ở đây là body space đứng nghỉ (xem rig.ts): +Y lên, +Z trước, +X bên TRÁI nhân vật. Góc `theta` đo từ +Z
// quay về +X: x = r·sin θ, z = r·cos θ. Hình gắn khớp skirt/torso đặt bằng alignToBody(mesh, PIVOT.waist); đồ trên khớp
// skirt luôn có morph 'sit' (builder: `sit: true`; hình tự dựng: addSitMorph(geo, variant)).
//
// Cách dùng điển hình (outfit.ts / kasaya.ts):
//   const v = bodyVariant(look);
//   alignToBody(new Mesh(skirtGeometry(v), lower), PIVOT.waist) → j.skirt (+ updateMorphTargets, PartBuild.sitMorph);
//   alignToBody(new Mesh(torsoGeometry(v), upper), PIVOT.waist) → j.torso;
//   bandGeometry({ y0: 0, y1: 0.035, followHem: true, offset: LAYER.trim, sit: true }, v) → dải gấu (khớp skirt);
//   ribbonGeometry({ path, width, offset: LAYER.kasayaTrim, joint: 'torso' }, v) → viền cà sa (khớp torso)…
// Geometry của skirtGeometry/torsoGeometry là cache dùng chung (không dispose); mọi builder khác trả geometry mới.
import * as THREE from 'three';
import type { AvatarLook } from '../api';
import { BODY, profileR, sitDeformBody } from './rig';

const TAU = Math.PI * 2;

// ───────────────────────── Biến thể bề mặt theo ngoại hình ─────────────────────────

export type BodyVariantId = 'plain' | 'ragged' | 'pants';

/** Biến thể bề mặt thân của một bộ đồ — MỌI lớp của cùng ngoại hình dùng chung một biến thể (để lớp trên bám đúng lớp dưới). */
export interface BodyVariant {
  readonly id: BodyVariantId;
  /** Gấu răng cưa: mép dưới vạt áo cao thấp theo θ (áo nâu rách) — xem `hemEdgeY`. */
  readonly ragged: boolean;
  /** Đồ thường mặc quần: ly quần phía trước mỗi ống + rãnh đáy quần trước/sau (vạt dưới đọc ra là quần). */
  readonly pants: boolean;
  /** Hệ số nếp dọc vạt dưới (0..1; 1 = áo dài buông nếp rõ). */
  readonly folds: number;
}

/** Ba biến thể (đối tượng đóng băng, so sánh bằng ===). */
export const BODY_VARIANTS: Readonly<Record<BodyVariantId, BodyVariant>> = Object.freeze({
  plain: Object.freeze({ id: 'plain', ragged: false, pants: false, folds: 1 }),
  ragged: Object.freeze({ id: 'ragged', ragged: true, pants: false, folds: 1 }),
  pants: Object.freeze({ id: 'pants', ragged: false, pants: true, folds: 0.22 }),
} as const);

/**
 * Biến thể bề mặt của ngoại hình: áo nâu rách → 'ragged'; đồ thường có quần dài (bà ba, áo thun + quần jean, vest) →
 * 'pants'; còn lại (áo tràng, cà sa, đồ tiệc, Phương Trượng) → 'plain'.
 */
export function bodyVariant(look: AvatarLook): BodyVariant {
  if (look.isHost) return BODY_VARIANTS.plain;
  switch (look.outfit.robe) {
    case 'robe_nau_rach':
      return BODY_VARIANTS.ragged;
    case 'civ_ba_ba':
    case 'civ_ao_thun':
    case 'civ_vest':
      return BODY_VARIANTS.pants;
    default:
      return BODY_VARIANTS.plain;
  }
}

// ───────────────────────── Lớp vải xếp chồng ─────────────────────────

/**
 * Độ nổi (m, theo pháp tuyến ngoài của mặt thân `bodyRadius`) của MẶT DƯỚI từng lớp vải bám thân. Một lớp dày
 * `thickness` (mặc định LAYER_THICK) chiếm [offset, offset + thickness]; mép bo hạ xuống `offset` (hoặc `edgeOffset`).
 * Các lớp cách nhau ≥ 4 mm nên lớp trên luôn cách mặt trên của lớp dưới ≥ 2 mm (không z-fighting ở xa) — đã kiểm cả
 * khi ngồi (sit 0..1, morph bám mặt). Đồ tự dựng (hạt, khoen…) đặt bằng surfacePoint(θ, y, LAYER.top + bán kính hạt, …).
 */
export const LAYER = {
  /** Viền: dải cổ áo, dải gấu, dây lưng / đai obi, miếng vá áo rách. */
  trim: 0.004,
  /** Tấm cà sa (mảng lớn vắt chéo thân). */
  kasaya: 0.009,
  /** Trên cà sa: viền cà sa, đường may "ruộng", đế khoen cài. */
  kasayaTrim: 0.013,
  /** Trên cùng: chuỗi hạt, dây chuyền vàng — độ dày riêng của hạt/khoen tính từ đây ra ngoài. */
  top: 0.018,
} as const;

/** Độ dày mặc định của dải/mảng vải (m). */
export const LAYER_THICK = 0.002;

/** Độ dày tối đa cho từng lớp để mặt trên vẫn cách đáy lớp kế tiếp ≥ 1,5 mm. */
export const LAYER_MAX_THICK = {
  trim: LAYER.kasaya - LAYER.trim - 0.0015,
  kasaya: LAYER.kasayaTrim - LAYER.kasaya - 0.0015,
  kasayaTrim: LAYER.top - LAYER.kasayaTrim - 0.0015,
} as const;

// ───────────────────────── Eo: chỗ nối khớp skirt ↔ torso ─────────────────────────

/**
 * Quy ước đồ vắt qua eo. Vạt áo trên (torso) phủ ra ngoài vạt dưới (skirt) thành một "gấu áo trên" dày WAIST.lip từ
 * lipY tới eo (mờ dần tới eo + lipFade; đã tính trong bodyRadius) — che đường nối kể cả khi thở (torso co giãn ±6 mm,
 * ±8 mm ở mức kẹp breath 0.03) hay cúi / nghiêng / xoay ngực.
 * - Gắn khớp torso (cúi theo ngực, co giãn theo nhịp thở): mọi thứ có y ≥ lipY — builder ghi `joint: 'torso'`.
 * - Gắn khớp skirt (+ morph 'sit' bám mặt): mọi thứ có y ≤ lipY — builder ghi `sit: true` (kéo theo joint 'skirt').
 * Đồ vắt qua (dải cà sa chéo, dây lưng buông…) cắt đúng tại lipY thành 2 phần (splitPathAtWaist cho dải, clampToJoint
 * cho mảng): phần trên dừng ở mép gấu áo trên, phần dưới bắt đầu ngay dưới mép đó — bậc WAIST.lip che chỗ nối. Đầu cắt
 * nên để thẳng (capStart/capEnd: false). Vạt dưới lõm WAIST.recess dưới gấu áo trên (ẩn) để gấu áo trên không chạm vạt
 * dưới khi thở ra hết cỡ.
 */
export const WAIST = {
  y: BODY.waistY,
  lipY: BODY.waistY - 0.04,
  lip: 0.008,
  /** Gấu áo trên mờ dần về thân chuẩn trong [y, y + lipFade]. */
  lipFade: 0.04,
  recess: 0.006,
} as const;

/**
 * Cổ: vai trước hạ thấp `scoop` (để khi cúi đầu headX ≤ 0.35 cằm không bị vai đâm xuyên), thân khép quanh một cổ
 * tròn bán kính `r` tới y1 rồi vòm kín ở `topY` — luôn nằm trong sọ nên nhìn góc nào cũng không hở giữa đầu và vai.
 */
export const NECK = {
  r: 0.14,
  y1: 1.064,
  topY: 1.09,
  /** Vai trước hạ tối đa (m) ở θ = 0, mờ dần ra hai bên. */
  scoop: 0.035,
  /** Vùng bắt đầu hạ vai. */
  scoopFrom: 0.9,
  scoopTo: 1.0,
} as const;

/** Số cột quanh thân của skirt/torso (gấu răng cưa khớp đúng cột). */
export const RADIAL = 48;

/**
 * Đồ trên vạt dưới phải bắt đầu cao hơn mép gấu hemEdgeY(θ) ít nhất chừng này (m): khi ngồi, 7 cm đáy vạt dưới (mặt
 * úp xuống) bị gập xuống dưới, lớp vải bám đúng góc gấu sẽ lộ mép xuyên ở giữa chừng ngồi. bandGeometry({ followHem })
 * tự kẹp y0 ≥ HEM_CLEAR.
 */
export const HEM_CLEAR = 0.006;

// ───────────────────────── Bề mặt thân mặc áo ─────────────────────────

function sat(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function smooth01(a: number, b: number, x: number): number {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Hiệu góc quấn về [−π, π]. */
function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}
function gauss(d: number, s: number): number {
  return Math.exp((-0.5 * d * d) / (s * s));
}
/** Max trơn (đa thức, độ mềm k). */
function smax(a: number, b: number, k: number): number {
  const h = sat(0.5 + (0.5 * (a - b)) / k);
  return b + (a - b) * h + k * h * (1 - h);
}

/** Nếp dọc vạt dưới: biên độ 0 ngay dưới gấu áo trên, đầy đủ từ y 0.14 xuống gấu. */
const FOLD_TOP = WAIST.lipY - 0.015;
function foldEnv(y: number): number {
  return smooth01(FOLD_TOP, 0.14, y);
}
/** Sóng nếp ∈ [−1, 1]: nhịp lệch (4–8 nếp/vòng), hơi chéo theo độ cao. */
function foldWave(th: number, y: number): number {
  return Math.cos(6 * th + 0.9 * Math.sin(th + 0.5) + 0.5 * Math.sin(2 * th + 1.3) + 0.9 * (FOLD_TOP - y));
}

/** Gấu răng cưa: [cột tâm khía, độ sâu khía (m), nửa bề rộng (cột)] — khía chữ V, đỉnh lưỡi vải nằm đúng cột lưới. */
const RAG_NOTCH: readonly (readonly [number, number, number])[] = [
  [1, 0.035, 2],
  [5, 0.022, 2],
  [10, 0.048, 2],
  [14, 0.028, 2],
  [19, 0.04, 3],
  [24, 0.02, 2],
  [29, 0.05, 2],
  [33, 0.03, 2],
  [38, 0.042, 3],
  [43, 0.025, 2],
];
const RAG: readonly number[] = (() => {
  const a: number[] = [];
  for (let c = 0; c < RADIAL; c++) {
    let m = 0;
    for (const [cc, depth, hw] of RAG_NOTCH) {
      let d = Math.abs(c - cc) % RADIAL;
      d = Math.min(d, RADIAL - d);
      m = Math.max(m, depth * Math.max(0, 1 - d / hw));
    }
    a.push(m);
  }
  return a;
})();
/** Độ khía của gấu rách theo θ (nội suy tuyến tính giữa các cột — trùng khít mép lưới vạt dưới). */
function ragRaise(th: number): number {
  let u = (th / TAU) % 1;
  if (u < 0) u += 1;
  u *= RADIAL;
  const i = Math.floor(u) % RADIAL;
  const f = u - Math.floor(u);
  return RAG[i]! + (RAG[(i + 1) % RADIAL]! - RAG[i]!) * f;
}

/**
 * Mép dưới vạt áo (body space, đứng nghỉ) theo θ: BODY.hemY, riêng biến thể rách cao thêm 0–5 cm thành các lưỡi vải
 * so le (khía chữ V, lưỡi vải rủ chạm đúng BODY.hemY). Dải gấu `bandGeometry({ followHem: true })` bám theo mép này.
 */
export function hemEdgeY(theta: number, v: BodyVariant): number {
  return v.ragged ? BODY.hemY + ragRaise(theta) : BODY.hemY;
}

/** Ly quần (gờ trước mỗi ống) + rãnh đáy quần trước/sau, mờ dần lên tới đáy quần. */
const CREASE_TH = (3 / RADIAL) * TAU;
function pantsDetail(th: number, y: number): number {
  const eg = 1 - smooth01(0.27, 0.37, y);
  const ec = 1 - smooth01(0.34, 0.46, y);
  let d = 0;
  if (eg > 0) d -= 0.0032 * eg * (gauss(angDiff(th, 0), 0.12) + gauss(angDiff(th, Math.PI), 0.14));
  if (ec > 0) d += 0.0058 * ec * (gauss(angDiff(th, CREASE_TH), 0.07) + gauss(angDiff(th, -CREASE_TH), 0.07));
  return d;
}

/** Vạt dưới (y < WAIST.lipY): dáng chuẩn + nếp dọc (+ ly quần), luôn trong [profileR − 0.004, profileR + 0.012]. */
function rSkirt(th: number, y: number, v: BodyVariant): number {
  const yy = Math.max(BODY.hemY, y);
  let d = 0;
  const a = foldEnv(yy) * v.folds;
  if (a > 0) d += a * (0.8 + 0.2 * Math.cos(th - Math.PI)) * (0.0035 + 0.0075 * foldWave(th, yy));
  if (v.pants) d += pantsDetail(th, yy);
  return profileR(yy) + Math.min(0.012, Math.max(-0.004, d));
}

function neckR(y: number): number {
  if (y <= NECK.y1) return NECK.r;
  if (y >= NECK.topY) return 0;
  const t = (y - NECK.y1) / (NECK.topY - NECK.y1);
  return NECK.r * Math.sqrt(1 - t * t);
}

/** Thân trên (y ≥ WAIST.lipY): gấu áo trên dày WAIST.lip quanh eo; vai trước hạ dần rồi khép quanh cổ (NECK). */
function rTop(th: number, y: number): number {
  if (y >= NECK.topY) return 0;
  let r: number;
  if (y < NECK.scoopFrom) r = profileR(y);
  else {
    const c = Math.max(0, Math.cos(th));
    const sh = NECK.scoop * c * smooth01(NECK.scoopFrom, NECK.scoopTo, y);
    r = smax(profileR(y + sh), neckR(y), 0.03);
  }
  const lipK = y <= WAIST.y ? 1 : 1 - smooth01(WAIST.y, WAIST.y + WAIST.lipFade, y);
  return r + WAIST.lip * lipK;
}

/**
 * Mặt của khớp nào: 'skirt' = vạt dưới (nếp, gấu rách, ly quần; tính tiếp lên trên lipY như không có gấu áo trên),
 * 'torso' = thân trên (gấu áo trên, ngực, vai, cổ; tính tiếp xuống dưới lipY như gấu áo trên kéo dài). Bỏ trống = tự
 * chọn theo y (jointForY). Đồ đặt sát đúng WAIST.lipY nên ghi rõ khớp để không lấy nhầm mặt bên kia bậc.
 */
export type BodyJoint = 'skirt' | 'torso';

/**
 * Bán kính mặt thân MẶC ÁO lúc đứng nghỉ (body space) theo góc θ (từ +Z về +X) và độ cao y. Là mặt NHÌN THẤY: vạt dưới
 * (+ nếp, gấu rách, ly quần) dưới WAIST.lipY; gấu áo trên (+WAIST.lip) từ lipY tới eo; ngực/vai = profileR; trên cùng
 * khép quanh cổ (lệch khỏi profileR, nằm trong sọ). Có bậc nhảy đúng tại WAIST.lipY (mép gấu áo trên) — xem `joint`.
 */
export function bodyRadius(theta: number, y: number, v: BodyVariant, joint?: BodyJoint): number {
  return (joint ?? (y < WAIST.lipY ? 'skirt' : 'torso')) === 'skirt' ? rSkirt(theta, y, v) : rTop(theta, y);
}

// Đạo hàm số (một phía khi sát bậc lipY) — kết quả để ở biến module (không cấp phát).
const H = 1e-4;
let fR = 0;
let fRt = 0;
let fRy = 0;
function evalFrame(th: number, y: number, v: BodyVariant, joint?: BodyJoint): void {
  const j: BodyJoint = joint ?? (y < WAIST.lipY ? 'skirt' : 'torso');
  fR = bodyRadius(th, y, v, j);
  fRt = (bodyRadius(th + H, y, v, j) - bodyRadius(th - H, y, v, j)) / (2 * H);
  let ya = y - H;
  let yb = y + H;
  if (!joint) {
    if (y < WAIST.lipY) yb = Math.min(yb, WAIST.lipY - 1e-7);
    else ya = Math.max(ya, WAIST.lipY);
  }
  if (j === 'skirt' && y < BODY.hemY) ya = yb = y; // dưới gấu: mặt thẳng đứng
  fRy = yb > ya ? (bodyRadius(th, yb, v, j) - bodyRadius(th, ya, v, j)) / (yb - ya) : 0;
}

/**
 * Pháp tuyến ngoài (đơn vị) của mặt thân tại (θ, y), tính cả nếp vải: N ∝ r·e_r − r_θ·e_θ − r·r_y·e_y. Đỉnh cổ (r = 0)
 * trả (0, 1, 0).
 */
export function surfaceNormal(theta: number, y: number, v: BodyVariant, out: THREE.Vector3, joint?: BodyJoint): THREE.Vector3 {
  evalFrame(theta, y, v, joint);
  return frameNormal(theta, out);
}
function frameNormal(th: number, out: THREE.Vector3): THREE.Vector3 {
  if (fR < 1e-6) return out.set(0, 1, 0);
  const s = Math.sin(th);
  const c = Math.cos(th);
  // r·e_r − r_θ·e_θ − r·r_y·e_y với e_r = (s, 0, c), e_θ = (c, 0, −s)
  out.set(fR * s - fRt * c, -fR * fRy, fR * c + fRt * s);
  return out.normalize();
}

/**
 * Điểm trên mặt thân tại (θ, y) nhấc ra `offset` mét theo pháp tuyến ngoài (offset 0 = đúng mặt thân). Nguồn sự thật cho
 * mọi lớp bám thân: lớp có offset lớn hơn luôn nằm ngoài lớp nhỏ hơn.
 */
export function surfacePoint(theta: number, y: number, offset: number, v: BodyVariant, out: THREE.Vector3, joint?: BodyJoint): THREE.Vector3 {
  if (offset === 0) {
    const r = bodyRadius(theta, y, v, joint);
    return out.set(r * Math.sin(theta), y, r * Math.cos(theta));
  }
  return surfaceSample(theta, y, offset, v, out, _n, joint);
}
const _n = new THREE.Vector3();

/** Như surfacePoint nhưng trả luôn pháp tuyến (`nrm`) — một lần tính đạo hàm cho cả hai. */
export function surfaceSample(
  theta: number,
  y: number,
  offset: number,
  v: BodyVariant,
  pos: THREE.Vector3,
  nrm: THREE.Vector3,
  joint?: BodyJoint,
): THREE.Vector3 {
  evalFrame(theta, y, v, joint);
  frameNormal(theta, nrm);
  const r = fR;
  return pos.set(r * Math.sin(theta) + nrm.x * offset, y + nrm.y * offset, r * Math.cos(theta) + nrm.z * offset);
}

/** Hai tiếp tuyến của mặt thân: ∂P/∂θ (`dTh`) và ∂P/∂y (`dY`) — chưa chuẩn hoá. */
export function surfaceTangents(theta: number, y: number, v: BodyVariant, dTh: THREE.Vector3, dY: THREE.Vector3, joint?: BodyJoint): void {
  evalFrame(theta, y, v, joint);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  // ∂P/∂θ = r_θ·e_r + r·e_θ; ∂P/∂y = r_y·e_r + e_y
  dTh.set(fRt * s + fR * c, 0, fRt * c - fR * s);
  dY.set(fRy * s, 1, fRy * c);
}

// ───────────────────────── Bộ đệm lưới ─────────────────────────

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();

/** Tích luỹ nhiều lưới chữ nhật (đỉnh + pháp tuyến + uv) vào một BufferGeometry có index. */
class MeshBuf {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number): void {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
  }
  /**
   * Nối (nu+1)×(nv+1) đỉnh đã thêm từ `base` (theo hàng v, mỗi hàng nu+1 cột u) thành tam giác. Chiều quấn tự chọn để
   * mặt trước quay về phía pháp tuyến đỉnh. poleLo/poleHi: hàng đầu/cuối là một điểm (đỉnh cực) → mỗi ô 1 tam giác.
   */
  grid(base: number, nu: number, nv: number, poleLo = false, poleHi = false): void {
    const w = nu + 1;
    const P = this.pos;
    const N = this.nrm;
    let s = 0;
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * w + i;
        const b = a + 1;
        const d = a + w;
        const c = d + 1;
        // hướng (b − a) × (d − a) so với pháp tuyến đỉnh (bỏ qua ô suy biến)
        const o = j === 0 && poleLo ? d : a;
        const ou = j === 0 && poleLo ? c : b;
        const ov = j === 0 && poleLo ? a : d;
        _a.set(P[ou * 3]! - P[o * 3]!, P[ou * 3 + 1]! - P[o * 3 + 1]!, P[ou * 3 + 2]! - P[o * 3 + 2]!);
        _b.set(P[ov * 3]! - P[o * 3]!, P[ov * 3 + 1]! - P[o * 3 + 1]!, P[ov * 3 + 2]! - P[o * 3 + 2]!);
        _c.crossVectors(_a, _b);
        if (j === 0 && poleLo) _c.negate();
        s += _c.x * (N[a * 3]! + N[c * 3]!) + _c.y * (N[a * 3 + 1]! + N[c * 3 + 1]!) + _c.z * (N[a * 3 + 2]! + N[c * 3 + 2]!);
      }
    }
    const flip = s < 0;
    const I = this.idx;
    const tri = (x: number, y: number, z: number) => (flip ? I.push(x, z, y) : I.push(x, y, z));
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * w + i;
        const b = a + 1;
        const d = a + w;
        const c = d + 1;
        if (j === 0 && poleLo) tri(a, c, d);
        else if (j === nv - 1 && poleHi) tri(a, b, c);
        else {
          tri(a, b, c);
          tri(a, c, d);
        }
      }
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ───────────────────────── Morph 'sit' ─────────────────────────

/** Ma trận Jacobi của sitDeformBody tại (x, y, z) (sai phân trung tâm) → cột _a, _b, _c. */
function sitJacobian(x: number, y: number, z: number): void {
  const h = 1e-4;
  sitDeformBody(x + h, y, z, _a);
  sitDeformBody(x - h, y, z, _q);
  _a.sub(_q).multiplyScalar(0.5 / h);
  sitDeformBody(x, y + h, z, _b);
  sitDeformBody(x, y - h, z, _q);
  _b.sub(_q).multiplyScalar(0.5 / h);
  sitDeformBody(x, y, z + h, _c);
  sitDeformBody(x, y, z - h, _q);
  _c.sub(_q).multiplyScalar(0.5 / h);
}
const _m1 = new THREE.Vector3();
/**
 * Biến đổi pháp tuyến theo Jacobi đang có ở _a/_b/_c: J⁻ᵀ·n = (nx·(b×c) + ny·(c×a) + nz·(a×b)) / det(J) — chỉ cần hướng
 * (det > 0) nên bỏ chia det: vẫn đúng khi gấu xẹp phẳng (J gần suy biến).
 */
function morphNormal(nx: number, ny: number, nz: number, out: THREE.Vector3): THREE.Vector3 {
  out.crossVectors(_b, _c).multiplyScalar(nx);
  _m1.crossVectors(_c, _a).multiplyScalar(ny);
  out.add(_m1);
  _m1.crossVectors(_a, _b).multiplyScalar(nz);
  return out.add(_m1).normalize();
}

/**
 * Ghi morph 'sit' vào `geo`. Không có `foot`: mỗi đỉnh p → sitDeformBody(p) (biến dạng không gian). Có `foot` (chân đỉnh
 * trên mặt vạt dưới, pháp tuyến mặt `footN`, độ nổi `lift`): đỉnh → sitDeformBody(chân) + lift·(pháp tuyến mặt đã biến
 * dạng) — giữ đúng khe hở giữa các lớp kể cả khi vạt dưới xẹp phẳng trên sàn.
 */
function writeSitMorph(
  geo: THREE.BufferGeometry,
  foot: Float32Array | null,
  footN: Float32Array | null,
  lift: Float32Array | null,
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const n = pos.count;
  const mp = new Float32Array(n * 3);
  const mn = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = foot ? foot[i * 3]! : pos.getX(i);
    const y = foot ? foot[i * 3 + 1]! : pos.getY(i);
    const z = foot ? foot[i * 3 + 2]! : pos.getZ(i);
    sitDeformBody(x, y, z, _p);
    sitJacobian(x, y, z);
    if (foot && footN && lift) {
      morphNormal(footN[i * 3]!, footN[i * 3 + 1]!, footN[i * 3 + 2]!, _t);
      _p.addScaledVector(_t, lift[i]!);
    }
    mp[i * 3] = _p.x;
    mp[i * 3 + 1] = _p.y;
    mp[i * 3 + 2] = _p.z;
    if (!nrm) continue;
    if (foot && footN) {
      // Bám mặt: tách pháp tuyến đỉnh = cosφ·N(chân) + sinφ·(tiếp tuyến), biến dạng N bằng J⁻ᵀ, tiếp tuyến bằng J rồi ghép
      // lại đúng góc φ — mép bo giữ đúng độ nghiêng kể cả nơi vạt dưới xẹp phẳng (J gần suy biến).
      const fx = footN[i * 3]!;
      const fy = footN[i * 3 + 1]!;
      const fz = footN[i * 3 + 2]!;
      _m1.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      const cs = _m1.x * fx + _m1.y * fy + _m1.z * fz;
      _m1.x -= cs * fx;
      _m1.y -= cs * fy;
      _m1.z -= cs * fz;
      const sn = _m1.length();
      if (sn > 1e-6) {
        _m1.multiplyScalar(1 / sn);
        _q.copy(_a).multiplyScalar(_m1.x).addScaledVector(_b, _m1.y).addScaledVector(_c, _m1.z);
        _t.addScaledVector(_t, cs - 1); // _t = N' (đơn vị) → cs·N'
        if (_q.lengthSq() > 1e-12) _t.addScaledVector(_q.normalize(), sn);
        _t.normalize();
      }
    } else morphNormal(nrm.getX(i), nrm.getY(i), nrm.getZ(i), _t);
    mn[i * 3] = _t.x;
    mn[i * 3 + 1] = _t.y;
    mn[i * 3 + 2] = _t.z;
  }
  geo.morphAttributes.position = [new THREE.Float32BufferAttribute(mp, 3)];
  if (nrm) geo.morphAttributes.normal = [new THREE.Float32BufferAttribute(mn, 3)];
  geo.morphTargetsRelative = false;
  return geo;
}

const _dTh = new THREE.Vector3();
const _dY = new THREE.Vector3();
/** Chân của điểm `q` trên mặt vạt dưới (chiếu theo pháp tuyến, Newton 5 bước) → (θ, y) ở `out`, trả độ nổi có dấu. */
function projectToSkirt(q: THREE.Vector3, v: BodyVariant, out: SurfaceUV): number {
  let th = Math.atan2(q.x, q.z);
  let y = q.y;
  for (let k = 0; k < 5; k++) {
    surfaceSample(th, y, 0, v, _p, _n, 'skirt');
    surfaceTangents(th, y, v, _dTh, _dY, 'skirt');
    _q.subVectors(q, _p);
    const g11 = _dTh.dot(_dTh);
    const g12 = _dTh.dot(_dY);
    const g22 = _dY.dot(_dY);
    const r1 = _dTh.dot(_q);
    const r2 = _dY.dot(_q);
    const det = g11 * g22 - g12 * g12;
    if (!(det > 1e-12)) break;
    th += (r1 * g22 - r2 * g12) / det;
    y += (g11 * r2 - g12 * r1) / det;
  }
  out.theta = th;
  out.y = y;
  surfaceSample(th, y, 0, v, _p, _n, 'skirt');
  return _q.subVectors(q, _p).dot(_n);
}

/**
 * Gắn morph 'sit' (morphAttributes.position[0] + morphAttributes.normal[0], vị trí tuyệt đối) cho hình dựng theo body
 * space sẽ gắn khớp skirt (alignToBody(mesh, PIVOT.waist)). Sửa tại chỗ và trả lại `geo`; sau khi tạo mesh gọi
 * mesh.updateMorphTargets() — avatar.ts đặt morphTargetInfluences[0] = pose.sit. Pháp tuyến morph = J⁻ᵀ·n (mịn, không
 * lộ đường nối uv).
 * - Không truyền `v`: biến dạng không gian thuần (sitDeformBody từng đỉnh) — cho chính vạt dưới, đồ xa thân.
 * - Truyền `v` (KHUYÊN DÙNG cho đồ nằm trên vạt dưới — dải, mảng, khuy, hạt…): mỗi đỉnh chiếu về chân trên mặt vạt dưới,
 *   chân được biến dạng rồi đặt lại đúng độ nổi theo pháp tuyến mới → khe hở giữa các lớp giữ nguyên khi ngồi (biến dạng
 *   thuần làm lớp sát gấu lún vào thân vì vạt dưới xẹp phẳng). Builder trong file này tự dùng cách này khi `sit: true`.
 */
export function addSitMorph(geo: THREE.BufferGeometry, v?: BodyVariant): THREE.BufferGeometry {
  if (!v) return writeSitMorph(geo, null, null, null);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const foot = new Float32Array(n * 3);
  const footN = new Float32Array(n * 3);
  const lift = new Float32Array(n);
  const s: SurfaceUV = { theta: 0, y: 0 };
  const q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    q.fromBufferAttribute(pos, i);
    lift[i] = projectToSkirt(q, v, s);
    foot[i * 3] = _p.x;
    foot[i * 3 + 1] = _p.y;
    foot[i * 3 + 2] = _p.z;
    footN[i * 3] = _n.x;
    footN[i * 3 + 1] = _n.y;
    footN[i * 3 + 2] = _n.z;
  }
  return writeSitMorph(geo, foot, footN, lift);
}

// ───────────────────────── Vạt dưới + thân trên (cache theo biến thể, dùng chung) ─────────────────────────

/**
 * Hàng lưới vạt dưới (y danh nghĩa) từ gấu lên eo; dưới SKIRT_REMAP các hàng co giãn theo mép gấu rách của từng cột.
 * Dày ở 0.29–0.5: khi ngồi, morph uốn cong dáng vạt dưới ở đây — hàng thưa thì dây cung lồi ra ngoài mặt thật tới 3.7 mm
 * (lớp viền 4 mm suýt chạm); với các hàng này sai số ≤ 1.2 mm.
 */
const SKIRT_ROWS = [
  BODY.hemY, 0.085, 0.12, 0.17, 0.235, 0.29, 0.34, 0.38, 0.42, 0.46, 0.5, 0.548, WAIST.lipY - 0.004, WAIST.lipY + 0.012, BODY.waistY,
];
const SKIRT_REMAP = 0.18;
/** Vòm hông đóng kín đỉnh vạt dưới (nằm trong thân trên lúc nghỉ; lộ ra tròn, kín khi cúi ở eo). */
const DOME_TOP = 0.895;
const DOME_ROWS = [0.7, 0.79, 0.86];
/** Thân trên: phần nhét trong vạt dưới (đáy kín) — [y, r]. */
const TORSO_BOTTOM = 0.44;
const TORSO_TUCK: readonly (readonly [number, number])[] = [
  [0.47, 0.235],
  [0.53, 0.305],
];
const TORSO_ROWS = [WAIST.lipY + 0.004, BODY.waistY, 0.66, 0.72, 0.8, 0.87, 0.93, 0.97, 1.0, 1.025, 1.048, NECK.y1, 1.08];

/** Mặt thật của lưới vạt dưới: như bodyRadius dưới lipY, lõm WAIST.recess dưới gấu áo trên (ẩn). */
function skirtShellR(th: number, y: number, v: BodyVariant): number {
  return rSkirt(th, y, v) - WAIST.recess * smooth01(WAIST.lipY - 0.004, WAIST.lipY + 0.012, y);
}

/** Pháp tuyến của mặt tròn xoay r = f(θ, y) bất kỳ (sai phân trung tâm). */
function normalOfR(f: (th: number, y: number) => number, th: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  fR = f(th, y);
  fRt = (f(th + H, y) - f(th - H, y)) / (2 * H);
  fRy = (f(th, y + H) - f(th, y - H)) / (2 * H);
  return frameNormal(th, out);
}

function buildSkirt(v: BodyVariant): THREE.BufferGeometry {
  const B = new MeshBuf();
  const nu = RADIAL;
  const shellR = (th: number, y: number) => skirtShellR(th, y, v);
  // 1) Đáy: tâm → vành vát → mép gấu (pháp tuyến chúi xuống, mép bo tròn).
  let base = B.count;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i <= nu; i++) {
      const th = (i / nu) * TAU;
      const s = Math.sin(th);
      const c = Math.cos(th);
      const ey = hemEdgeY(th, v);
      const re = bodyRadius(th, ey, v);
      if (row === 0) {
        _p.set(0, BODY.hemY + 0.016, 0);
        _n.set(0, -1, 0);
      } else if (row === 1) {
        _p.set((re - 0.022) * s, ey + 0.005, (re - 0.022) * c);
        _n.set(0.3 * s, -1, 0.3 * c).normalize();
      } else {
        surfaceSample(th, ey, 0, v, _p, _n);
        _n.y -= 1.1;
        _n.normalize();
      }
      B.vert(_p, _n, i / nu, -0.06 + row * 0.03);
    }
  }
  B.grid(base, nu, 2, true, false);
  // 2) Vỏ: gấu → eo (+ lõm dưới gấu áo trên) → vòm hông → đỉnh.
  base = B.count;
  const nRows = SKIRT_ROWS.length + DOME_ROWS.length + 1;
  const hd = DOME_TOP - BODY.waistY;
  for (let k = 0; k < nRows; k++) {
    for (let i = 0; i <= nu; i++) {
      const th = (i / nu) * TAU;
      const s = Math.sin(th);
      const c = Math.cos(th);
      let y: number;
      if (k < SKIRT_ROWS.length) {
        const yn = SKIRT_ROWS[k]!;
        const ey = hemEdgeY(th, v);
        y = yn < SKIRT_REMAP ? ey + ((yn - BODY.hemY) * (SKIRT_REMAP - ey)) / (SKIRT_REMAP - BODY.hemY) : yn;
        if (y < WAIST.lipY) surfaceSample(th, y, 0, v, _p, _n);
        else {
          const r = shellR(th, y);
          _p.set(r * s, y, r * c);
          normalOfR(shellR, th, y, _n);
        }
      } else if (k < nRows - 1) {
        y = DOME_ROWS[k - SKIRT_ROWS.length]!;
        const r0 = shellR(th, BODY.waistY);
        const t = (y - BODY.waistY) / hd;
        const r = r0 * Math.sqrt(1 - t * t);
        _p.set(r * s, y, r * c);
        _n.set((r / (r0 * r0)) * s, (y - BODY.waistY) / (hd * hd), (r / (r0 * r0)) * c).normalize();
      } else {
        y = DOME_TOP;
        _p.set(0, y, 0);
        _n.set(0, 1, 0);
      }
      B.vert(_p, _n, i / nu, (y - BODY.hemY) / (DOME_TOP - BODY.hemY));
    }
  }
  B.grid(base, nu, nRows - 1, false, true);
  return addSitMorph(B.build());
}

function buildTorso(): THREE.BufferGeometry {
  const B = new MeshBuf();
  const nu = RADIAL;
  const base = B.count;
  const nRows = 1 + TORSO_TUCK.length + 2 + TORSO_ROWS.length + 1;
  const top = (th: number, y: number) => rTop(th, y);
  for (let k = 0; k < nRows; k++) {
    for (let i = 0; i <= nu; i++) {
      const th = (i / nu) * TAU;
      const s = Math.sin(th);
      const c = Math.cos(th);
      let y: number;
      if (k === 0) {
        // đáy kín (trong vạt dưới)
        y = TORSO_BOTTOM;
        _p.set(0, y, 0);
        _n.set(0, -1, 0);
      } else if (k <= TORSO_TUCK.length) {
        const [ty, tr] = TORSO_TUCK[k - 1]!;
        y = ty;
        _p.set(tr * s, y, tr * c);
        const w = k === 1 ? 0.6 : 0.85;
        _n.set(w * s, -Math.sqrt(1 - w * w), w * c);
      } else if (k === TORSO_TUCK.length + 1) {
        // mặt dưới gấu áo trên (quặt vào trong vạt dưới)
        y = WAIST.lipY - 0.002;
        const r = profileR(WAIST.lipY) - 0.01;
        _p.set(r * s, y, r * c);
        _n.set(0.3 * s, -1, 0.3 * c).normalize();
      } else if (k === TORSO_TUCK.length + 2) {
        // mép gấu áo trên (bo tròn)
        y = WAIST.lipY;
        const r = rTop(th, y) - 0.0015;
        _p.set(r * s, y, r * c);
        normalOfR(top, th, y + 0.002, _n);
        _n.y -= 0.9;
        _n.normalize();
      } else if (k < nRows - 1) {
        y = TORSO_ROWS[k - TORSO_TUCK.length - 3]!;
        surfaceSample(th, y, 0, BODY_VARIANTS.plain, _p, _n);
      } else {
        y = NECK.topY;
        _p.set(0, y, 0);
        _n.set(0, 1, 0);
      }
      B.vert(_p, _n, i / nu, (y - TORSO_BOTTOM) / (NECK.topY - TORSO_BOTTOM));
    }
  }
  B.grid(base, nu, nRows - 1, true, true);
  return B.build();
}

const SKIRT_CACHE = new Map<BodyVariantId, THREE.BufferGeometry>();
let TORSO_GEO: THREE.BufferGeometry | null = null;

/**
 * Vạt dưới kín (đáy bo + vỏ gấu→eo theo bodyRadius + vòm hông đóng đỉnh) cho khớp skirt: dựng theo body space, gắn
 * alignToBody(mesh, PIVOT.waist), CÓ morph 'sit' (gọi mesh.updateMorphTargets()). Cache theo biến thể, dùng chung giữa
 * các nhân vật — KHÔNG dispose.
 */
export function skirtGeometry(v: BodyVariant): THREE.BufferGeometry {
  let g = SKIRT_CACHE.get(v.id);
  if (!g) {
    g = buildSkirt(v);
    g.userData.shared = true;
    SKIRT_CACHE.set(v.id, g);
  }
  return g;
}

/**
 * Vỏ thân trên kín (đáy nhét trong vạt dưới từ y 0.44, gấu áo trên ở WAIST.lipY, ngực/vai theo bodyRadius, khép quanh cổ
 * tới NECK.topY) cho khớp torso: body space, alignToBody(mesh, PIVOT.waist), không morph. Giống nhau cho mọi biến thể;
 * cache dùng chung — KHÔNG dispose.
 */
export function torsoGeometry(v?: BodyVariant): THREE.BufferGeometry {
  void v;
  if (!TORSO_GEO) {
    TORSO_GEO = buildTorso();
    TORSO_GEO.userData.shared = true;
  }
  return TORSO_GEO;
}

// ───────────────────────── Dải / mảng vải bám thân ─────────────────────────

/** Toạ độ trên mặt thân: góc θ (từ +Z về +X) + độ cao y (body space, đứng nghỉ). */
export interface SurfaceUV {
  theta: number;
  y: number;
}
/** Đường trên mặt thân: t ∈ [0, 1] → (θ, y) ghi vào `out`. */
export type SurfacePath = (t: number, out: SurfaceUV) => void;

/** Tuỳ chọn chung của dải (ribbon), mảng (patch), vòng (band). */
export interface SheetOpts {
  /** Độ nổi mặt dưới theo pháp tuyến (m) — dùng một trong LAYER.*. */
  offset: number;
  /** Độ dày (m), mặc định LAYER_THICK (không vượt LAYER_MAX_THICK của lớp): mặt trên ở offset + thickness. */
  thickness?: number;
  /** Bề rộng mép bo (m), mặc định max(0.003, 1.5·thickness), tối đa 1/3 bề rộng. */
  bevel?: number;
  /** Độ nổi của mép ngoài cùng (m), mặc định = offset. Hạ thấp hơn để mép vải ôm sát lớp dưới — giữ ≥ mặt trên lớp dưới + 1.5 mm. */
  edgeOffset?: number;
  /** Thêm morph 'sit' bám mặt (cho đồ gắn khớp skirt) — giữ đúng độ nổi khi ngồi. */
  sit?: boolean;
  /** Bám mặt của khớp nào (mặc định: sit ? 'skirt' : tự chọn theo y) — nên ghi 'torso' cho tấm có mép đúng WAIST.lipY. */
  joint?: BodyJoint;
  /** Mép bo tròn thật (thêm 1 hàng) thay vì vát 1 bậc + pháp tuyến bo (ít tam giác hơn). */
  round?: boolean;
}

/** Một đỉnh lưới tấm: toạ độ mặt thân, uv, hệ số nổi theo u/v (1 = mặt trên, 0 = mép). */
interface SheetPt {
  theta: number;
  y: number;
  u: number;
  v: number;
  hu: number;
  hv: number;
}

/** Bậc bo mép: [vị trí theo bề rộng bo (0..1), hệ số nổi]. */
function bevelSteps(round: boolean | undefined): readonly (readonly [number, number])[] {
  return round ? [[0, 0], [0.3, 0.714], [1, 1]] : [[0, 0], [1, 1]];
}

/**
 * Dãy phân số [0..1] dọc một trục dài `len` (m): bo hai đầu (nếu cap) + `seg` đoạn đều ở giữa; kèm hệ số nổi từng mẫu.
 * capLo/capHi = false: đầu đó cắt thẳng (không bo).
 */
function axisSamples(len: number, bevel: number, seg: number, capLo: boolean, capHi: boolean, round?: boolean): { f: number[]; h: number[] } {
  const f: number[] = [];
  const h: number[] = [];
  const steps = bevelSteps(round);
  const b = len > 0 ? Math.min(bevel / len, 0.34) : 0;
  const lo = capLo ? b : 0;
  const hi = capHi ? 1 - b : 1;
  const add = (x: number, y: number) => {
    f.push(x);
    h.push(y);
  };
  if (capLo) for (let k = 0; k < steps.length - 1; k++) add(steps[k]![0] * b, steps[k]![1]);
  for (let k = 0; k <= seg; k++) add(lo + ((hi - lo) * k) / seg, 1);
  if (capHi) for (let k = steps.length - 2; k >= 0; k--) add(1 - steps[k]![0] * b, steps[k]![1]);
  return { f, h };
}

const _e = new THREE.Vector3();
const _t = new THREE.Vector3();

/**
 * Dựng tấm vải từ lưới điểm mặt thân `pts[iv][iu]` (nv+1 hàng × nu+1 cột): đỉnh = mặt thân nhấc theo pháp tuyến tới
 * edgeOffset (mép) … offset + thickness (mặt trên); pháp tuyến nghiêng ra phía mép ở vùng bo.
 */
function emitSheet(v: BodyVariant, o: SheetOpts, pts: SheetPt[][]): THREE.BufferGeometry {
  const nv = pts.length - 1;
  const nu = pts[0]!.length - 1;
  const top = o.offset + (o.thickness ?? LAYER_THICK);
  const edge = o.edgeOffset ?? o.offset;
  const joint = sheetJoint(o);
  const bp: THREE.Vector3[][] = [];
  const bn: THREE.Vector3[][] = [];
  for (let j = 0; j <= nv; j++) {
    const rp: THREE.Vector3[] = [];
    const rn: THREE.Vector3[] = [];
    for (let i = 0; i <= nu; i++) {
      const pt = pts[j]![i]!;
      const p = new THREE.Vector3();
      const n = new THREE.Vector3();
      surfaceSample(pt.theta, pt.y, 0, v, p, n, joint);
      rp.push(p);
      rn.push(n);
    }
    bp.push(rp);
    bn.push(rn);
  }
  const B = new MeshBuf();
  const nVert = (nu + 1) * (nv + 1);
  const foot = o.sit ? new Float32Array(nVert * 3) : null;
  const footN = o.sit ? new Float32Array(nVert * 3) : null;
  const lift = o.sit ? new Float32Array(nVert) : null;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const pt = pts[j]![i]!;
      const nb = bn[j]![i]!;
      const h = Math.min(pt.hu, pt.hv);
      const off = edge + (top - edge) * h;
      if (foot && footN && lift) {
        const k = B.count;
        bp[j]![i]!.toArray(foot, k * 3);
        nb.toArray(footN, k * 3);
        lift[k] = off;
      }
      _p.copy(bp[j]![i]!).addScaledVector(nb, off);
      _e.set(0, 0, 0);
      if (pt.hv < 1) {
        const jj = j < nv / 2 ? j + 1 : j - 1;
        _t.subVectors(bp[j]![i]!, bp[jj]![i]!);
        if (_t.lengthSq() > 1e-14) _e.addScaledVector(_t.normalize(), 1 - pt.hv);
      }
      if (pt.hu < 1) {
        const ii = i < nu / 2 ? i + 1 : i - 1;
        _t.subVectors(bp[j]![i]!, bp[j]![ii]!);
        if (_t.lengthSq() > 1e-14) _e.addScaledVector(_t.normalize(), 1 - pt.hu);
      }
      _e.addScaledVector(nb, -_e.dot(nb));
      _n.copy(nb);
      if (h < 1 && _e.lengthSq() > 1e-12) {
        const phi = (1 - h) * 1.15;
        _n.multiplyScalar(Math.cos(phi)).addScaledVector(_e.normalize(), Math.sin(phi)).normalize();
      }
      B.vert(_p, _n, pt.u, pt.v);
    }
  }
  B.grid(0, nu, nv);
  const g = B.build();
  return foot ? writeSitMorph(g, foot, footN, lift) : g;
}

/** Mặt để bám: ghi rõ thì theo đó; có sit → 'skirt'; còn lại tự chọn theo y từng điểm. */
function sheetJoint(o: SheetOpts): BodyJoint | undefined {
  return o.joint ?? (o.sit ? 'skirt' : undefined);
}

/** Độ dài (m) của đường `f(t)` (t ∈ [t0, t1]) trên mặt thân, lấy mẫu `n` đoạn. */
function pathLength(f: (t: number, out: SurfaceUV) => void, t0: number, t1: number, v: BodyVariant, n = 32, joint?: BodyJoint): number {
  const s: SurfaceUV = { theta: 0, y: 0 };
  let len = 0;
  f(t0, s);
  surfacePoint(s.theta, s.y, 0, v, _a, joint);
  for (let k = 1; k <= n; k++) {
    f(t0 + ((t1 - t0) * k) / n, s);
    surfacePoint(s.theta, s.y, 0, v, _b, joint);
    len += _a.distanceTo(_b);
    _a.copy(_b);
  }
  return len;
}

/** Dải vải dọc một đường trên mặt thân. */
export interface RibbonOpts extends SheetOpts {
  /** Đường giữa (align 'center') hoặc mép (align 'left'/'right'), t ∈ [0, 1]. */
  path: SurfacePath;
  /** Bề rộng (m), đo trên mặt thân vuông góc với đường. */
  width: number;
  /**
   * 'center' (mặc định): trải đều hai bên đường. 'left' / 'right': cả bề rộng nằm về bên trái / phải của đường khi nhìn
   * từ ngoài vào, t tăng hướng lên trên (vd đường đi lên ở mặt trước: 'left' = phía bên phải nhân vật, −X).
   */
  align?: 'center' | 'left' | 'right';
  /** Chỉ dựng đoạn t ∈ [t0, t1] (mặc định 0..1) — vd cắt tại eo bằng splitPathAtWaist. */
  t0?: number;
  t1?: number;
  /** Đường khép kín (path(1) trùng path(0)): không có đầu dải, nối liền. */
  closed?: boolean;
  /** Bo đầu dải ở t0 / t1 (mặc định true); false = cắt thẳng (chỗ nối giấu dưới mép gấu áo trên / lớp khác). */
  capStart?: boolean;
  capEnd?: boolean;
  /** Số đoạn dọc đường (mặc định ≈ mỗi 3 cm một đoạn) / ngang bề rộng (mặc định ≈ mỗi 3 cm). */
  segments?: number;
  acrossSegments?: number;
}

/**
 * Dải vải bám thân (cổ áo, viền, dây lưng, viền cà sa, dải cà sa chéo…): bề rộng trải trên mặt thân vuông góc với
 * đường, nằm ở `offset` (+ độ dày, mép bo), uv: u dọc (0..1 theo t0→t1), v ngang (0..1). Trả geometry MỚI — người gọi
 * sở hữu và dispose. Gắn khớp skirt thì đặt `sit: true`.
 */
export function ribbonGeometry(o: RibbonOpts, v: BodyVariant): THREE.BufferGeometry {
  const t0 = o.t0 ?? 0;
  const t1 = o.t1 ?? 1;
  const closed = !!o.closed;
  const thick = o.thickness ?? LAYER_THICK;
  const bevel = Math.min(o.bevel ?? Math.max(0.003, 1.5 * thick), o.width / 3);
  const joint = sheetJoint(o);
  const len = pathLength(o.path, t0, t1, v, 48, joint);
  const segU = o.segments ?? Math.max(2, Math.ceil(len / 0.03));
  const ax = axisSamples(len, bevel, segU, !closed && o.capStart !== false, !closed && o.capEnd !== false, o.round);
  const s0 = o.align === 'left' ? 0 : o.align === 'right' ? -o.width : -o.width / 2;
  const segV = o.acrossSegments ?? Math.max(1, Math.ceil((o.width - 2 * bevel) / 0.03));
  const ac = axisSamples(o.width, bevel, segV, true, true, o.round);
  // Mỗi mẫu dọc: tâm (θ, y) + hướng ngang trên mặt thân viết theo (dθ, dy) cho 1 m.
  const c: SurfaceUV = { theta: 0, y: 0 };
  const cA: SurfaceUV = { theta: 0, y: 0 };
  const cB: SurfaceUV = { theta: 0, y: 0 };
  const cols: { th: number; y: number; a: number; b: number }[] = [];
  const dt = 1e-4;
  for (let i = 0; i < ax.f.length; i++) {
    const t = t0 + (t1 - t0) * ax.f[i]!;
    o.path(closed && i === ax.f.length - 1 ? t0 : t, c);
    let ta = t - dt;
    let tb = t + dt;
    if (!closed) {
      ta = Math.max(t0, ta);
      tb = Math.min(t1, tb);
    }
    o.path(ta, cA);
    o.path(tb, cB);
    const dth = angDiff(cB.theta, cA.theta);
    const dy = cB.y - cA.y;
    surfaceTangents(c.theta, c.y, v, _a, _b, joint);
    surfaceNormal(c.theta, c.y, v, _n, joint);
    _t.copy(_a).multiplyScalar(dth).addScaledVector(_b, dy);
    _e.crossVectors(_n, _t).normalize();
    // _e = a·∂P/∂θ + b·∂P/∂y (bình phương tối thiểu)
    const g11 = _a.dot(_a);
    const g12 = _a.dot(_b);
    const g22 = _b.dot(_b);
    const r1 = _a.dot(_e);
    const r2 = _b.dot(_e);
    const det = g11 * g22 - g12 * g12 || 1e-12;
    cols.push({ th: c.theta, y: c.y, a: (r1 * g22 - r2 * g12) / det, b: (g11 * r2 - g12 * r1) / det });
  }
  const pts: SheetPt[][] = [];
  for (let j = 0; j < ac.f.length; j++) {
    const s = s0 + o.width * ac.f[j]!;
    const row: SheetPt[] = [];
    for (let i = 0; i < cols.length; i++) {
      const k = cols[i]!;
      row.push({ theta: k.th + k.a * s, y: k.y + k.b * s, u: ax.f[i]!, v: ac.f[j]!, hu: ax.h[i]!, hv: ac.h[j]! });
    }
    pts.push(row);
  }
  return emitSheet(v, o, pts);
}

/** Mảng vải phủ một vùng mặt thân. */
export interface PatchOpts extends SheetOpts {
  /** Vùng theo dải góc θ ∈ [theta0, theta1] (theta1 > theta0, được vượt 2π)… */
  theta0?: number;
  theta1?: number;
  /** …với biên dưới / trên là hằng số hoặc hàm của θ (biên xiên: y0 = (θ) => a + k·θ). */
  y0?: number | ((theta: number) => number);
  y1?: number | ((theta: number) => number);
  /** Hoặc hai đường biên tuỳ ý (u ∈ [0, 1]): mảng phủ giữa, nội suy tuyến tính theo (θ, y). Ưu tiên hơn theta0/y0… */
  lower?: SurfacePath;
  upper?: SurfacePath;
  /** Khép kín quanh thân (u = 0 trùng u = 1, vd theta0 = 0, theta1 = 2π): không bo hai mép bên. */
  closed?: boolean;
  /** Số đoạn theo u / v (mặc định ≈ mỗi 3 cm). */
  segU?: number;
  segV?: number;
}

/** Độ cao biên theo θ (hằng số hoặc hàm). */
function boundY(b: number | ((theta: number) => number) | undefined, th: number, def: number): number {
  return typeof b === 'function' ? b(th) : (b ?? def);
}

/**
 * Mảng vải bám thân (tấm cà sa, miếng vá…): phủ vùng giữa biên dưới và biên trên, mép bo / vát xuống `edgeOffset`,
 * uv: u theo θ / dọc biên (0..1), v từ biên dưới lên biên trên (0..1). Trả geometry MỚI — người gọi dispose.
 */
export function patchGeometry(o: PatchOpts, v: BodyVariant): THREE.BufferGeometry {
  const th0 = o.theta0 ?? 0;
  const th1 = o.theta1 ?? TAU;
  const lower: SurfacePath =
    o.lower ??
    ((u, out) => {
      out.theta = th0 + (th1 - th0) * u;
      out.y = boundY(o.y0, out.theta, BODY.hemY);
    });
  const upper: SurfacePath =
    o.upper ??
    ((u, out) => {
      out.theta = th0 + (th1 - th0) * u;
      out.y = boundY(o.y1, out.theta, BODY.waistY);
    });
  const closed = !!o.closed;
  const thick = o.thickness ?? LAYER_THICK;
  const lo: SurfaceUV = { theta: 0, y: 0 };
  const up: SurfaceUV = { theta: 0, y: 0 };
  const mid = (u: number, out: SurfaceUV) => {
    lower(u, lo);
    upper(u, up);
    out.theta = lo.theta + 0.5 * angDiff(up.theta, lo.theta);
    out.y = 0.5 * (lo.y + up.y);
  };
  const joint = sheetJoint(o);
  const lenU = pathLength(mid, 0, 1, v, 48, joint);
  // Bề cao của từng cột: đo dọc đoạn thẳng tham số từ biên dưới lên biên trên.
  const lenV = (u: number) => {
    lower(u, lo);
    upper(u, up);
    const lt = lo.theta;
    const ly = lo.y;
    const dth = angDiff(up.theta, lo.theta);
    const dy = up.y - ly;
    return pathLength(
      (t, out) => {
        out.theta = lt + dth * t;
        out.y = ly + dy * t;
      },
      0,
      1,
      v,
      8,
      joint,
    );
  };
  let maxV = 0;
  for (let k = 0; k <= 8; k++) maxV = Math.max(maxV, lenV(k / 8));
  const bevel = Math.min(o.bevel ?? Math.max(0.003, 1.5 * thick), maxV / 3, closed ? Infinity : lenU / 3);
  const au = axisSamples(lenU, bevel, o.segU ?? Math.max(1, Math.ceil(lenU / 0.03)), !closed, !closed, o.round);
  const segV = o.segV ?? Math.max(1, Math.ceil(maxV / 0.03));
  const cols: { lt: number; ly: number; dth: number; dy: number; f: number[]; h: number[] }[] = [];
  for (let i = 0; i < au.f.length; i++) {
    const u = closed && i === au.f.length - 1 ? 0 : au.f[i]!;
    const lv = lenV(u);
    lower(u, lo);
    upper(u, up);
    const av = axisSamples(lv, bevel, segV, true, true, o.round);
    cols.push({ lt: lo.theta, ly: lo.y, dth: angDiff(up.theta, lo.theta), dy: up.y - lo.y, f: av.f, h: av.h });
  }
  const nvp = cols[0]!.f.length;
  const pts: SheetPt[][] = [];
  for (let j = 0; j < nvp; j++) {
    const row: SheetPt[] = [];
    for (let i = 0; i < cols.length; i++) {
      const k = cols[i]!;
      const f = k.f[j]!;
      row.push({ theta: k.lt + k.dth * f, y: k.ly + k.dy * f, u: au.f[i]!, v: f, hu: au.h[i]!, hv: k.h[j]! });
    }
    pts.push(row);
  }
  return emitSheet(v, o, pts);
}

/** Vòng vải quanh thân giữa hai độ cao. */
export interface BandOpts extends SheetOpts {
  y0: number;
  y1: number;
  /**
   * y0 / y1 tính từ mép gấu hemEdgeY(θ) (dải gấu bám đúng mép răng cưa của biến thể rách) thay vì tuyệt đối; y0 tự kẹp
   * ≥ HEM_CLEAR.
   */
  followHem?: boolean;
  /** Số cột quanh thân (mặc định RADIAL — trùng cột vạt dưới nên bám khít gấu răng cưa). */
  segments?: number;
}

/**
 * Vòng vải kín quanh thân (dây lưng / đai obi, dải gấu…) — mép trên/dưới bo, uv: u quanh thân (0..1 từ θ = 0), v từ
 * dưới lên. Trả geometry MỚI — người gọi dispose.
 */
export function bandGeometry(o: BandOpts, v: BodyVariant): THREE.BufferGeometry {
  const hem = !!o.followHem;
  const y0 = hem ? Math.max(HEM_CLEAR, o.y0) : o.y0;
  return patchGeometry(
    {
      ...o,
      closed: true,
      theta0: 0,
      theta1: TAU,
      y0: hem ? (th: number) => hemEdgeY(th, v) + y0 : y0,
      y1: hem ? (th: number) => hemEdgeY(th, v) + o.y1 : o.y1,
      segU: o.segments ?? RADIAL,
      segV: Math.max(1, Math.ceil(Math.abs(o.y1 - y0) / 0.03)),
    },
    v,
  );
}

// ───────────────────────── Đồ vắt qua eo ─────────────────────────

/** Khớp phải gắn cho một điểm ở độ cao `y`: 'torso' nếu y ≥ WAIST.lipY, ngược lại 'skirt' (+ morph 'sit'). */
export function jointForY(y: number): BodyJoint {
  return y >= WAIST.lipY ? 'torso' : 'skirt';
}

/** t ∈ [t0, t1] tại đó đường `path` cắt độ cao `y` (chia đôi; y(t) phải đơn điệu trên khoảng) — null nếu không cắt. */
export function pathTAtY(path: SurfacePath, y: number, t0 = 0, t1 = 1): number | null {
  const s: SurfaceUV = { theta: 0, y: 0 };
  path(t0, s);
  const ya = s.y - y;
  path(t1, s);
  const yb = s.y - y;
  if (ya === 0) return t0;
  if (yb === 0) return t1;
  if (ya * yb > 0) return null;
  let lo = t0;
  let hi = t1;
  for (let k = 0; k < 48; k++) {
    const m = 0.5 * (lo + hi);
    path(m, s);
    if ((s.y - y) * ya > 0) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}

/**
 * Cắt một đường vắt qua eo (y đơn điệu theo t) tại WAIST.lipY: khoảng t cho phần trên (gắn torso) và phần dưới (gắn
 * skirt, `sit: true`); null nếu không có phần đó. Dựng 2 ribbon với t0/t1 tương ứng, đầu cắt `capStart/capEnd: false`.
 */
export function splitPathAtWaist(path: SurfacePath, t0 = 0, t1 = 1): { torso: [number, number] | null; skirt: [number, number] | null } {
  const s: SurfaceUV = { theta: 0, y: 0 };
  const tc = pathTAtY(path, WAIST.lipY, t0, t1);
  path(t0, s);
  const y0 = s.y;
  path(t1, s);
  const y1 = s.y;
  if (tc === null) return y0 >= WAIST.lipY && y1 >= WAIST.lipY ? { torso: [t0, t1], skirt: null } : { torso: null, skirt: [t0, t1] };
  return y0 >= y1 ? { torso: [t0, tc], skirt: [tc, t1] } : { torso: [tc, t1], skirt: [t0, tc] };
}

/**
 * Kẹp biên của mảng theo θ (PatchOpts.y0/y1) vào phần thuộc một khớp: 'torso' → y ≥ WAIST.lipY, 'skirt' → y ≤ lipY.
 * Cột nằm hẳn bên kia eo thành cột dẹt (không lộ). Dùng: patchGeometry({ ...o, ...clampToJoint('skirt', o.y0, o.y1), sit: true }, v).
 */
export function clampToJoint(
  joint: 'torso' | 'skirt',
  y0: number | ((theta: number) => number),
  y1: number | ((theta: number) => number),
): { y0: (theta: number) => number; y1: (theta: number) => number } {
  const f0 = (th: number) => boundY(y0, th, BODY.hemY);
  const f1 = (th: number) => boundY(y1, th, BODY.waistY);
  const L = WAIST.lipY;
  return joint === 'torso'
    ? { y0: (th) => Math.max(L, f0(th)), y1: (th) => Math.max(L, f1(th)) }
    : { y0: (th) => Math.min(L, f0(th)), y1: (th) => Math.min(L, f1(th)) };
}
