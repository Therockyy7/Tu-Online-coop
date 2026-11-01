// Cà sa "điền y" vắt vai trái ôm thân (Đại Đức, Thượng Tọa, Phương Trượng): vải hai nửa + bọc eo, viền nổi, mũ vai, khoen.
//
// Toạ độ body space đứng nghỉ (rig.ts): +Y lên, +Z trước, +X bên TRÁI nhân vật; θ đo từ +Z về +X (x = r·sinθ).
// Tấm cà sa quấn kín thân dưới một mép chéo (giao của thân với mặt phẳng nghiêng: cao ở vai trái sát cổ, thấp dưới nách
// phải — vai + bắp tay phải lộ áo trong), phủ tiếp xuống vạt dưới tới gần gấu. Hai nửa cắt ở WAIST.lipY: nửa trên gắn
// khớp torso (mép dưới cuộn vào dưới gấu áo trên rồi bọc đáy thân trên), nửa dưới gắn khớp skirt (morph 'sit' bám mặt) và
// luồn ngược lên vòm hông bên trong thân trên — cúi / xoay / nghiêng ngực ở eo thì chỗ hở vẫn là vải cà sa. Mũ cà sa trùm
// bắp tay trái gắn khớp shoulderL. Vân điền y: CanvasTexture (có `document`); viền mép, mép chồng, đường may chính là hình
// nổi (vẫn đọc ra điền y khi không có vân). Mọi hình chỉ phụ thuộc biến thể thân → cache cấp module, dùng chung (không
// dispose); vân cache theo bộ màu.
import * as THREE from 'three';
import type { AvatarLook } from '../api';
import { PIVOT, SLEEVE, alignToBody, type Joints, type MatFactory, type MatOpts, type PartBuild } from './rig';
import type { RobeStyle } from './style';
import {
  LAYER,
  LAYER_MAX_THICK,
  WAIST,
  addSitMorph,
  bodyRadius,
  bodyVariant,
  surfacePoint,
  surfaceSample,
  type BodyJoint,
  type BodyVariant,
} from './body';

const TAU = Math.PI * 2;

// ───────────────────────── Kích thước ─────────────────────────

/** Số cột lưới quanh thân (đường may chính trùng cột: mỗi SEAM_EVERY cột một đường). */
const COLS = 28;
const SEAM_EVERY = 4;
/** Cột của mép vải chồng (vạt trước bên ngực trái, θ ≈ 0.45): viền dọc + khoen ở đầu trên. */
const EDGE_COL = 2;
/** Số ô vân (texture) quanh thân: mỗi ô = 2 cột ruộng → đường may vân trùng đường may hình (u = 0, 0.5 mỗi ô). */
const TEX_TILES = COLS / SEAM_EVERY / 2;
/**
 * Mặt vải cà sa: một lớp, đỉnh lưới ở trên đỉnh dải lớp cà sa (LAYER.kasaya + LAYER_MAX_THICK.kasaya) thêm 1 mm — dây cung
 * giữa các đỉnh lõm vào trong tới ~4 mm ở vòm vai nên mặt vải thật nằm trong ≈ [LAYER.kasaya, đỉnh lưới]; vẫn cách viền
 * của chính cà sa (TRIM_OFF) 2.5 mm và cách đồ LAYER.top (chuỗi hạt, dây chuyền) ≥ 5.5 mm.
 */
const SHEET_OFF = LAYER.kasaya + LAYER_MAX_THICK.kasaya + 0.001;
/** Viền / đường may (một lớp): ≤ LAYER.top − 1.5 mm để chuỗi hạt / dây chuyền (outfit.ts, LAYER.top) nằm trên được. */
const TRIM_OFF = LAYER.kasayaTrim + 0.002;
/** Chân "tường" mép vải (độ dày mép cà sa): sát áo trong — cắm vào viền cổ / dải gấu nếu có (chạm, không xuyên ra). */
const WALL_LOW = 0.0015;
/** Bề rộng viền mép (trên + gấu), viền mép chồng dọc, đường may (m, đo trên mặt thân). */
const BORDER_W = 0.026;
const EDGE_W = 0.028;
const SEAM_W = 0.009;
/** Đường may chính nổi (−156 tam giác): tắt — texture đã vẽ đường may; còn viền, mép chồng nổi. */
const RAISED_SEAMS = false;

/** Mép trên: giao của thân với mặt phẳng y = TOP_A + TOP_B·x — sát cổ trên vai trái, dưới nách phải. */
const TOP_L = { x: 0.215, y: 1.045 };
const TOP_R = { x: -0.35, y: 0.78 };
const TOP_B = (TOP_L.y - TOP_R.y) / (TOP_L.x - TOP_R.x);
const TOP_A = TOP_L.y - TOP_B * TOP_L.x;

/** Gấu cà sa (y nghỉ) — buông thấp hơn bên trái; luôn cao hơn phần gấu áo bị gập xuống khi ngồi (≈ 7 cm đáy). */
function yBot(th: number): number {
  return 0.18 - 0.025 * Math.sin(th);
}

/** Mép trên tại cột θ (giải y = TOP_A + TOP_B·r(θ, y)·sinθ bằng chia đôi — vế trái tăng đơn điệu theo y). */
function yTop(th: number, v: BodyVariant): number {
  const s = Math.sin(th);
  let lo = WAIST.y + 0.05;
  let hi = 1.064;
  for (let k = 0; k < 40; k++) {
    const m = 0.5 * (lo + hi);
    if (m - TOP_A - TOP_B * bodyRadius(th, m, v, 'torso') * s < 0) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}

// ───────────────────────── Hàng lưới theo độ dài cung ─────────────────────────

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Vector3();
const _t = new THREE.Vector3();

/**
 * Độ cao các hàng trên kinh tuyến θ từ y0 lên y1 (bám mặt `joint`), đặt tại các độ dài cung do `at(tổng)` trả (m, tăng
 * dần trong [0, tổng]) — vòm vai cong gắt nên chia theo cung chứ không theo y.
 */
function arcRows(th: number, y0: number, y1: number, v: BodyVariant, joint: BodyJoint, at: (len: number) => number[]): number[] {
  const N = 48;
  const ys: number[] = [y0];
  const ss: number[] = [0];
  surfacePoint(th, y0, 0, v, _p, joint);
  for (let k = 1; k <= N; k++) {
    const y = y0 + ((y1 - y0) * k) / N;
    surfacePoint(th, y, 0, v, _q, joint);
    ss.push(ss[k - 1]! + _p.distanceTo(_q));
    ys.push(y);
    _p.copy(_q);
  }
  const total = ss[N]!;
  return at(total).map((s) => {
    if (s <= 0) return y0;
    if (s >= total) return y1;
    let k = 1;
    while (ss[k]! < s) k++;
    const f = (s - ss[k - 1]!) / (ss[k]! - ss[k - 1]! || 1);
    return ys[k - 1]! + (ys[k]! - ys[k - 1]!) * f;
  });
}

/** Tách đoạn cung [a, b] thành n khoảng, khoảng trên cùng = `ratio` × khoảng dưới cùng (thưa ở eo, dày dần lên vòm vai). */
function graded(a: number, b: number, n: number, ratio: number): number[] {
  const c = (1 - ratio) / (1 + ratio);
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push(a + (b - a) * (t + c * t * (1 - t)));
  }
  return out;
}

// ───────────────────────── Bộ đệm lưới ─────────────────────────

/** Một đoạn chỉ số tam giác cùng loại (kiểm tra / thống kê đọc qua geometry.userData.parts). */
interface PartRange {
  kind: string;
  start: number;
  count: number;
}

/** Tích luỹ lưới chữ nhật (đỉnh + pháp tuyến + uv) — chiều quấn từng ô tự chọn theo pháp tuyến đỉnh (mặt trước hướng ra). */
class Buf {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  readonly parts: PartRange[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
  vert(p: THREE.Vector3, n: THREE.Vector3, u: number, w: number): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, w);
    return this.count - 1;
  }
  /** Lưới `rows` hàng × `cols` đỉnh mỗi hàng, thêm liên tiếp từ `base` (theo hàng) → tam giác, ghi loại `kind`. */
  grid(base: number, cols: number, rows: number, kind: string): void {
    const start = this.idx.length;
    const P = this.pos;
    const N = this.nrm;
    const I = this.idx;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = base + j * cols + i;
        const b = a + 1;
        const d = a + cols;
        const c = d + 1;
        _e.set(P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!);
        _t.set(P[d * 3]! - P[b * 3]!, P[d * 3 + 1]! - P[b * 3 + 1]!, P[d * 3 + 2]! - P[b * 3 + 2]!);
        _n.crossVectors(_e, _t);
        if (_n.lengthSq() < 1e-14) continue; // ô suy biến (cột cao 0)
        const s = _n.x * (N[a * 3]! + N[c * 3]!) + _n.y * (N[a * 3 + 1]! + N[c * 3 + 1]!) + _n.z * (N[a * 3 + 2]! + N[c * 3 + 2]!);
        // (c − a) × (d − b) cùng chiều với (b − a) × (d − a) của tứ giác a-b-c-d; bỏ tam giác suy biến (đỉnh cực).
        if (s >= 0) {
          this.tri(a, b, c);
          this.tri(a, c, d);
        } else {
          this.tri(a, c, b);
          this.tri(a, d, c);
        }
      }
    }
    if (I.length > start) this.parts.push({ kind, start, count: I.length - start });
  }
  /** Thêm tam giác (giữ thứ tự đỉnh) nếu không suy biến. */
  private tri(a: number, b: number, c: number): void {
    const P = this.pos;
    _e.set(P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!);
    _t.set(P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!);
    if (_q.crossVectors(_e, _t).lengthSq() > 1e-16) this.idx.push(a, b, c);
  }
  /** Quạt tam giác tâm `center` quanh vòng `ring` (khép kín), mặt trước theo pháp tuyến tâm. */
  fan(center: number, ring: readonly number[], kind: string): void {
    const start = this.idx.length;
    const P = this.pos;
    const N = this.nrm;
    const o = center * 3;
    for (let k = 0; k < ring.length; k++) {
      const b = ring[k]!;
      const c = ring[(k + 1) % ring.length]!;
      _e.set(P[b * 3]! - P[o]!, P[b * 3 + 1]! - P[o + 1]!, P[b * 3 + 2]! - P[o + 2]!);
      _t.set(P[c * 3]! - P[o]!, P[c * 3 + 1]! - P[o + 1]!, P[c * 3 + 2]! - P[o + 2]!);
      _n.crossVectors(_e, _t);
      if (_n.x * N[o]! + _n.y * N[o + 1]! + _n.z * N[o + 2]! >= 0) this.tri(center, b, c);
      else this.tri(center, c, b);
    }
    if (this.idx.length > start) this.parts.push({ kind, start, count: this.idx.length - start });
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.userData.parts = this.parts;
    g.userData.shared = true;
    return g;
  }
}

/** u vân quanh thân theo chỉ số cột (cột EDGE_COL ở u = 0 — đường may vân trùng mép chồng + các đường may chính). */
function uOf(col: number): number {
  return ((col - EDGE_COL) / COLS) * TEX_TILES;
}
/** v vân theo độ cao nghỉ (1 ô vân cao 1 m). */
function vOf(y: number): number {
  return y - 0.1;
}

/** θ của cột i (0..COLS; cột COLS trùng chỗ cột 0 nhưng u khác — vân liền vòng). */
function colTheta(i: number): number {
  return (i / COLS) * TAU;
}

/** Hướng "ra khỏi tấm" tại p trên mặt thân (pháp tuyến n): (p − q) chiếu lên mặt tiếp xúc, chuẩn hoá. */
function awayDir(p: THREE.Vector3, q: THREE.Vector3, n: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  out.subVectors(p, q);
  out.addScaledVector(n, -out.dot(n));
  return out.normalize();
}

/** Một nửa cà sa: vải (vật liệu cà sa, có vân) + viền / đường may / tường mép (vật liệu viền). */
interface Half {
  cloth: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _na = new THREE.Vector3();
const _nb = new THREE.Vector3();

/**
 * Dải nổi (viền dọc / đường may) dọc các hàng `ys` của một cột: phủ θ ∈ [th + w0/r, th + w1/r] (w tính bằng m trên mặt
 * thân) ở độ nổi TRIM_OFF. Đỉnh dải đi theo đúng hàng của tấm vải → dây cung song song, giữ khe hở với tấm.
 */
function stripAlong(T: Buf, th: number, ys: readonly number[], w0: number, w1: number, col: number, v: BodyVariant, joint: BodyJoint): void {
  const base = T.count;
  for (const y of ys) {
    const r = Math.max(0.05, bodyRadius(th, y, v, joint));
    surfaceSample(th + w0 / r, y, TRIM_OFF, v, _a, _na, joint);
    surfaceSample(th + w1 / r, y, TRIM_OFF, v, _b, _nb, joint);
    T.vert(_a, _na, uOf(col), vOf(y));
    T.vert(_b, _nb, uOf(col), vOf(y));
  }
  T.grid(base, 2, ys.length, 'strip');
}

/**
 * "Tường" mép vải tại cột θ dọc các hàng `ys`: từ độ nổi `hi` xuống `lo`, pháp tuyến = hướng ngang mặt thân về phía −θ
 * (mép chồng nhìn từ giữa ngực) — độ dày mép vải, che khe dưới tấm.
 */
function wallAlongCol(T: Buf, th: number, ys: readonly number[], hi: number, lo: number, col: number, v: BodyVariant, joint: BodyJoint): void {
  const base = T.count;
  for (const y of ys) {
    surfacePoint(th, y, 0, v, _a, joint);
    surfacePoint(th - 0.01, y, 0, v, _b, joint);
    surfaceSample(th, y, hi, v, _p, _n, joint);
    awayDir(_b, _a, _n, _e); // về phía θ nhỏ hơn
    T.vert(_p, _e, uOf(col), vOf(y));
    surfaceSample(th, y, lo, v, _p, _n, joint);
    T.vert(_p, _e, uOf(col), vOf(y));
  }
  T.grid(base, 2, ys.length, 'wall');
}

/**
 * Viền mép ngang (mép trên chéo / gấu) quanh thân: dải từ hàng `inner` tới hàng `edge` của mọi cột ở TRIM_OFF + tường
 * tại hàng `edge` từ TRIM_OFF xuống WALL_LOW, pháp tuyến hướng ra khỏi tấm (lên trên ở mép trên, xuống dưới ở gấu).
 */
function borderLoop(T: Buf, rows: readonly (readonly number[])[], inner: number, edge: number, v: BodyVariant, joint: BodyJoint): void {
  let base = T.count;
  for (const k of [inner, edge]) {
    for (let i = 0; i <= COLS; i++) {
      const th = colTheta(i);
      const y = rows[i]![k]!;
      surfaceSample(th, y, TRIM_OFF, v, _p, _n, joint);
      if (k === edge) {
        // pháp tuyến hơi nghiêng ra mép: viền đọc như gờ cuộn tròn
        surfacePoint(th, y, 0, v, _a, joint);
        surfacePoint(th, rows[i]![inner]!, 0, v, _b, joint);
        _n.addScaledVector(awayDir(_a, _b, _n, _e), 0.6).normalize();
      }
      T.vert(_p, _n, uOf(i), vOf(y));
    }
  }
  T.grid(base, COLS + 1, 2, 'strip');
  base = T.count;
  for (const off of [TRIM_OFF, WALL_LOW]) {
    for (let i = 0; i <= COLS; i++) {
      const th = colTheta(i);
      const y = rows[i]![edge]!;
      surfacePoint(th, y, 0, v, _a, joint);
      surfacePoint(th, rows[i]![inner]!, 0, v, _b, joint);
      surfaceSample(th, y, off, v, _p, _n, joint);
      T.vert(_p, awayDir(_a, _b, _n, _e), uOf(i), vOf(y));
    }
  }
  T.grid(base, COLS + 1, 2, 'wall');
}

/** Độ cong nền (1/m) cộng vào khi chia hàng theo độ cong: chỗ phẳng vẫn có hàng mỗi ~1/√K0 × bước. */
const K0 = 2;
/** Số khoảng của nửa trên từ lipY tới hàng trong của viền mép trên. */
const TORSO_SEG = 9;

/** Nội suy tuyến tính bảng (xs tăng dần) tại x. */
function lookup(xs: readonly number[], ys: readonly number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!;
  const n = xs.length - 1;
  if (x >= xs[n]!) return ys[n]!;
  let k = 1;
  while (xs[k]! < x) k++;
  const f = (x - xs[k - 1]!) / (xs[k]! - xs[k - 1]! || 1);
  return ys[k - 1]! + (ys[k]! - ys[k - 1]!) * f;
}

/**
 * Kinh tuyến θ từ y0 lên y1 (64 mẫu đều theo y): độ cao `ys`, độ dài cung `ss` và "độ dài cong" `ws` = ∫ √(κ + K0) ds
 * (κ = độ cong kinh tuyến). Chia hàng đều theo `ws` thì dây cung lõm gần bằng nhau mọi chỗ — dày ở vòm vai, thưa ở eo.
 */
function meridian(th: number, y0: number, y1: number, v: BodyVariant, joint: BodyJoint): { ys: number[]; ss: number[]; ws: number[] } {
  const N = 64;
  const P: THREE.Vector3[] = [];
  const ys: number[] = [];
  for (let k = 0; k <= N; k++) {
    const y = y0 + ((y1 - y0) * k) / N;
    ys.push(y);
    P.push(surfacePoint(th, y, 0, v, new THREE.Vector3(), joint));
  }
  const L: number[] = [0];
  for (let k = 1; k <= N; k++) L.push(P[k]!.distanceTo(P[k - 1]!));
  const kap: number[] = [0];
  for (let k = 1; k < N; k++) {
    _a.subVectors(P[k]!, P[k - 1]!);
    _b.subVectors(P[k + 1]!, P[k]!);
    kap.push(_a.angleTo(_b) / Math.max(1e-6, 0.5 * (L[k]! + L[k + 1]!)));
  }
  kap[0] = kap[1]!;
  kap.push(kap[N - 1]!);
  const ss: number[] = [0];
  const ws: number[] = [0];
  for (let k = 1; k <= N; k++) {
    ss.push(ss[k - 1]! + L[k]!);
    ws.push(ws[k - 1]! + L[k]! * Math.sqrt(0.5 * (kap[k - 1]! + kap[k]!) + K0));
  }
  return { ys, ss, ws };
}

/** Hàng (y nghỉ) của từng cột nửa trên: lipY → TORSO_SEG khoảng chia theo độ cong → hàng trong của viền → mép trên. */
function torsoRows(v: BodyVariant): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i <= COLS; i++) {
    const th = colTheta(i);
    const top = yTop(th, v);
    const m = meridian(th, WAIST.lipY, top, v, 'torso');
    const wB = lookup(m.ss, m.ws, m.ss[m.ss.length - 1]! - BORDER_W);
    const r: number[] = [];
    for (let k = 0; k <= TORSO_SEG; k++) r.push(lookup(m.ws, m.ys, (wB * k) / TORSO_SEG));
    r.push(top);
    rows.push(r);
  }
  return rows;
}

/**
 * Bọc đáy thân trên (phần nhét trong vạt dưới, body.ts TORSO_TUCK): [y, bán kính, hệ số ngang của pháp tuyến] từ dưới lên,
 * ngoài vỏ thân ≥ 5 mm theo pháp tuyến (lớn hơn độ lõm dây cung 28 cột). Ẩn trong vạt dưới lúc đứng / ngồi; cúi sâu ở eo
 * thì đáy thân trên vểnh ra sau — vẫn là vải cà sa thay vì màu áo trong.
 */
const TUCK: readonly (readonly [number, number, number])[] = [
  [0.465, 0.244, 0.6],
  [0.53, 0.313, 0.85],
];

/**
 * Nửa trên (khớp torso, body space → alignToBody(mesh, PIVOT.waist)): tấm vải từ WAIST.lipY lên mép chéo; mép dưới cuộn
 * vào dưới gấu áo trên (chạm vải nửa dưới — che chỗ nối khi thở / xoay ngực) rồi bọc tiếp đáy thân trên; viền mép trên +
 * tường mép, viền mép chồng dọc ở cột EDGE_COL, đường may chính mỗi SEAM_EVERY cột.
 */
function buildTorsoHalf(v: BodyVariant): Half {
  const rows = torsoRows(v);
  const nr = rows[0]!.length;
  const C = new Buf();
  const base = C.count;
  const lip = WAIST.lipY;
  for (let k = 0; k <= TUCK.length; k++) {
    for (let i = 0; i <= COLS; i++) {
      const th = colTheta(i);
      const s = Math.sin(th);
      const c = Math.cos(th);
      if (k < TUCK.length) {
        const [y, r, w] = TUCK[k]!;
        _p.set(r * s, y, r * c);
        _n.set(w * s, -Math.sqrt(1 - w * w), w * c);
        C.vert(_p, _n, uOf(i), vOf(y) - 0.04);
      } else {
        // gờ cuộn: quặt vào dưới gấu áo trên
        const r = bodyRadius(th, lip, v, 'torso') - 0.004;
        _p.set(r * s, lip - 0.004, r * c);
        _n.set(0.35 * s, -1, 0.35 * c).normalize();
        C.vert(_p, _n, uOf(i), vOf(lip) - 0.02);
      }
    }
  }
  for (let k = 0; k < nr; k++) {
    for (let i = 0; i <= COLS; i++) {
      const y = rows[i]![k]!;
      surfaceSample(colTheta(i), y, SHEET_OFF, v, _p, _n, 'torso');
      C.vert(_p, _n, uOf(i), vOf(y));
    }
  }
  C.grid(base, COLS + 1, TUCK.length + 1, 'tuck');
  C.grid(base + TUCK.length * (COLS + 1), COLS + 1, 2, 'flange');
  C.grid(base + (TUCK.length + 1) * (COLS + 1), COLS + 1, nr, 'sheet');

  const T = new Buf();
  borderLoop(T, rows, nr - 2, nr - 1, v, 'torso');
  const er = rows[EDGE_COL]!;
  const te = colTheta(EDGE_COL);
  stripAlong(T, te, er.slice(0, nr - 1), 0, EDGE_W, EDGE_COL, v, 'torso');
  wallAlongCol(T, te, er, TRIM_OFF, SHEET_OFF - 0.001, EDGE_COL, v, 'torso');
  for (let col = EDGE_COL + SEAM_EVERY; RAISED_SEAMS && col < EDGE_COL + COLS; col += SEAM_EVERY) {
    const ci = col % COLS;
    stripAlong(T, colTheta(ci), rows[ci]!.slice(0, nr - 1), -SEAM_W / 2, SEAM_W / 2, ci, v, 'torso');
  }
  addClaspPlate(T, v);
  return { cloth: C.build(), trim: T.build() };
}

/** Đỉnh vòm hông của vạt dưới (body.ts: DOME_TOP) — vòm là nửa ellipsoid từ eo, bán kính đáy = mặt vạt dưới − WAIST.recess. */
const DOME_TOP = 0.895;
/** Lớp lót luồn lên vòm hông: [y nghỉ, độ nổi khỏi vòm (m)] — ngoài vòm ≥ 6 mm kể cả giữa dây cung, trong thân trên. */
const UNDERLAP: readonly (readonly [number, number])[] = [
  [0.69, 0.012],
  [0.79, 0.016],
  [0.85, 0.016],
];

/** Hàng (y nghỉ) từng cột nửa dưới: gấu → hàng trong của viền gấu → 3 hàng giữa → WAIST.lipY. */
function skirtRows(v: BodyVariant): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i <= COLS; i++) {
    const th = colTheta(i);
    rows.push(arcRows(th, yBot(th), WAIST.lipY, v, 'skirt', (S) => [0, ...graded(BORDER_W, S, 4, 1)]));
  }
  return rows;
}

/**
 * Nửa dưới (khớp skirt, body space → alignToBody(mesh, PIVOT.waist), morph 'sit' bám mặt): tấm vải từ gấu cà sa lên
 * WAIST.lipY (giấu dưới gờ nửa trên) rồi luồn vào trong thân trên phủ vòm hông (ẩn lúc đứng; cúi / nghiêng ngực thì
 * chỗ hở ở eo vẫn là vải cà sa); viền gấu + tường mép, viền mép chồng, đường may chính.
 */
function buildSkirtHalf(v: BodyVariant): Half {
  const rows = skirtRows(v);
  const nr = rows[0]!.length;
  const lip = WAIST.lipY;
  const C = new Buf();
  const base = C.count;
  for (let k = 0; k < nr; k++) {
    for (let i = 0; i <= COLS; i++) {
      const y = rows[i]![k]!;
      surfaceSample(colTheta(i), y, SHEET_OFF, v, _p, _n, 'skirt');
      C.vert(_p, _n, uOf(i), vOf(y));
    }
  }
  // Lót vòm hông: ngay trên lipY (giữa vạt dưới đã lõm và thân trên), rồi bám vòm.
  const hd = DOME_TOP - WAIST.y;
  for (let k = -1; k < UNDERLAP.length; k++) {
    for (let i = 0; i <= COLS; i++) {
      const th = colTheta(i);
      const s = Math.sin(th);
      const c = Math.cos(th);
      let y: number;
      let r: number;
      if (k < 0) {
        y = lip + 0.012;
        r = bodyRadius(th, y, v, 'skirt') + 0.002;
        _n.set(s, 0.1, c).normalize();
      } else {
        y = UNDERLAP[k]![0];
        const r0 = bodyRadius(th, WAIST.y, v, 'skirt') - WAIST.recess;
        const t = (y - WAIST.y) / hd;
        const rd = r0 * Math.sqrt(1 - t * t);
        r = rd + UNDERLAP[k]![1];
        _n.set((rd / (r0 * r0)) * s, (y - WAIST.y) / (hd * hd), (rd / (r0 * r0)) * c).normalize();
      }
      _p.set(r * s, y, r * c);
      C.vert(_p, _n, uOf(i), vOf(y));
    }
  }
  C.grid(base, COLS + 1, nr, 'sheet');
  C.grid(base + (nr - 1) * (COLS + 1), COLS + 1, UNDERLAP.length + 2, 'underlap');

  const T = new Buf();
  borderLoop(T, rows, 1, 0, v, 'skirt');
  // Dải dọc dừng dưới gờ nửa trên (≥ 2 mm dưới đáy gờ cuộn) — không xuyên gờ.
  const capY = lip - 0.006;
  const er = rows[EDGE_COL]!;
  const te = colTheta(EDGE_COL);
  stripAlong(T, te, [...er.slice(1, nr - 1), capY], 0, EDGE_W, EDGE_COL, v, 'skirt');
  wallAlongCol(T, te, [...er.slice(0, nr - 1), capY], TRIM_OFF, SHEET_OFF - 0.001, EDGE_COL, v, 'skirt');
  for (let col = EDGE_COL + SEAM_EVERY; RAISED_SEAMS && col < EDGE_COL + COLS; col += SEAM_EVERY) {
    const ci = col % COLS;
    stripAlong(T, colTheta(ci), [...rows[ci]!.slice(1, nr - 1), capY], -SEAM_W / 2, SEAM_W / 2, ci, v, 'skirt');
  }
  const cloth = addSitMorph(C.build(), v);
  const trim = addSitMorph(T.build(), v);
  // khối bao tính lại sau morph (vạt xoè rộng khi ngồi) — tránh bị cắt khỏi khung nhìn
  cloth.computeBoundingSphere();
  trim.computeBoundingSphere();
  return { cloth, trim };
}

// ───────────────────────── Mũ cà sa vai trái (khớp shoulderL) ─────────────────────────

/** Bán kính mũ vai (từ trục xương / tâm khớp): ngoài SLEEVE.upperR ≥ 3 mm kể cả giữa dây cung (12 cạnh: −2.6 mm). */
const CAP_R = SLEEVE.upperR + 0.007;
const CAP_SEG = 12;
/** Mép dưới mũ vai (dọc xương, −Y cục bộ) + viền. */
const CAP_LOW = -0.13;
const CAP_BORDER = 0.025;
/** Viền mũ vai nổi trên mũ; tường mép quặt vào tới bán kính này (giữa dây cung 12 cạnh vẫn ≥ upperR + 3 mm). */
const CAP_TRIM_R = CAP_R + 0.0035;
const CAP_WALL_R = (SLEEVE.upperR + 0.0031) / Math.cos(Math.PI / 12);

/**
 * Mũ cà sa trùm bắp tay trái, dựng trong khung cục bộ của khớp shoulderL (xương dọc −Y, gốc = tâm khớp): nửa cầu kín
 * trên đầu vai (ống tay áo trong có đầu vai là quả cầu quanh tâm khớp) + ống tới CAP_LOW, viền + tường mép dưới. Đi theo
 * tay khi giơ / dang / khép vai; vải nửa trên trên vai trái phủ lên tới sát cổ nên chỗ giáp hai mảnh luôn là vải cà sa.
 */
function buildCap(): Half {
  const C = new Buf();
  const n = CAP_SEG;
  const base = C.count;
  // Vòm: 4 vòng theo góc cực α (đỉnh → xích đạo) — ba vòng trên phồng thêm 4 mm để mọi mặt tam giác (kể cả đường chéo
  // ô) vẫn cách tâm khớp ≥ 74 mm (> upperR + 3 mm); ống: các cao độ y dọc xương.
  const ALPHA = [0, 0.6, 1.2, Math.PI / 2];
  const TUBE = [-0.06, CAP_LOW + CAP_BORDER, CAP_LOW];
  for (let k = 0; k < ALPHA.length + TUBE.length; k++) {
    for (let i = 0; i <= n; i++) {
      const ph = (i / n) * TAU;
      const cx = Math.cos(ph);
      const sz = Math.sin(ph);
      if (k < ALPHA.length) {
        const al = ALPHA[k]!;
        _n.set(Math.sin(al) * cx, Math.cos(al), Math.sin(al) * sz);
        _p.copy(_n).multiplyScalar(k < ALPHA.length - 1 ? CAP_R + 0.004 : CAP_R);
        C.vert(_p, _n, i / n, 0.62 + CAP_R * (Math.PI / 2 - al));
      } else {
        const y = TUBE[k - ALPHA.length]!;
        _n.set(cx, 0, sz);
        _p.set(CAP_R * cx, y, CAP_R * sz);
        C.vert(_p, _n, i / n, 0.62 + y);
      }
    }
  }
  C.grid(base, n + 1, ALPHA.length + TUBE.length, 'cap');
  const T = new Buf();
  let tb = T.count;
  for (const y of [CAP_LOW + CAP_BORDER, CAP_LOW]) {
    for (let i = 0; i <= n; i++) {
      const ph = (i / n) * TAU;
      _n.set(Math.cos(ph), y === CAP_LOW ? -0.45 : 0, Math.sin(ph)).normalize();
      _p.set(CAP_TRIM_R * Math.cos(ph), y, CAP_TRIM_R * Math.sin(ph));
      T.vert(_p, _n, i / n, 0);
    }
  }
  T.grid(tb, n + 1, 2, 'strip');
  tb = T.count;
  for (const r of [CAP_TRIM_R, CAP_WALL_R]) {
    for (let i = 0; i <= n; i++) {
      const ph = (i / n) * TAU;
      _n.set(0, -1, 0);
      _p.set(r * Math.cos(ph), CAP_LOW, r * Math.sin(ph));
      T.vert(_p, _n, i / n, 0);
    }
  }
  T.grid(tb, n + 1, 2, 'wall');
  return { cloth: C.build(), trim: T.build() };
}

// ───────────────────────── Khoen (khớp torso) ─────────────────────────

/**
 * Khoen: đế tròn nổi trên góc viền (chỗ viền mép chồng gặp viền mép trên, ngực trái dưới xương đòn) + vòng kim loại áp
 * ngực. Cao hơn đường dây chuyền / chuỗi hạt của outfit.ts (≈ y 0.92 / 0.87 ở θ 0.5) nên không chạm.
 */
const CLASP = { plateR: 0.022, plateOff: TRIM_OFF + 0.0025, ringR: 0.0185, tube: 0.0048, below: 0.006 } as const;

/** Tâm khoen (θ, y nghỉ) trên viền mép chồng. */
function claspAt(v: BodyVariant): { theta: number; y: number } {
  const er = torsoRows(v)[EDGE_COL]!;
  const y = er[er.length - 2]! - CLASP.below;
  const th = colTheta(EDGE_COL);
  return { theta: th + EDGE_W / 2 / bodyRadius(th, y, v, 'torso'), y };
}

/** Đế khoen (gộp vào hình viền nửa trên) — đĩa phẳng tiếp xúc thân tại tâm khoen. */
function addClaspPlate(T: Buf, v: BodyVariant): void {
  const at = claspAt(v);
  surfaceSample(at.theta, at.y, CLASP.plateOff, v, _p, _n, 'torso');
  const nn = _n.clone();
  const c0 = _p.clone();
  const ax = new THREE.Vector3(0, 1, 0).cross(nn).normalize();
  const ay = nn.clone().cross(ax);
  const center = T.vert(c0, nn, 0, 0);
  const ring: number[] = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    _q.copy(c0).addScaledVector(ax, CLASP.plateR * Math.cos(a)).addScaledVector(ay, CLASP.plateR * Math.sin(a));
    _e.copy(nn).addScaledVector(ax, 0.35 * Math.cos(a)).addScaledVector(ay, 0.35 * Math.sin(a)).normalize();
    ring.push(T.vert(_q, _e, 0, 0));
  }
  T.fan(center, ring, 'plate');
}

/** Vòng khoen (body space, khớp torso): xuyến nằm áp ngực trên đế. */
function buildRing(v: BodyVariant): THREE.BufferGeometry {
  const at = claspAt(v);
  surfaceSample(at.theta, at.y, 0, v, _p, _n, 'torso');
  const g = new THREE.TorusGeometry(CLASP.ringR, CLASP.tube, 4, 10);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n));
  g.translate(_p.x + _n.x * (CLASP.plateOff + CLASP.tube + 0.0005), _p.y + _n.y * (CLASP.plateOff + CLASP.tube + 0.0005), _p.z + _n.z * (CLASP.plateOff + CLASP.tube + 0.0005));
  g.userData.shared = true;
  return g;
}

// ───────────────────────── Cache hình + lắp ráp ─────────────────────────

/** Toàn bộ hình cà sa của một biến thể thân (dùng chung giữa các nhân vật — KHÔNG dispose). */
interface KasayaGeo {
  torso: Half;
  skirt: Half;
  cap: Half;
  ring: THREE.BufferGeometry;
}
const GEO_CACHE = new Map<string, KasayaGeo>();

function kasayaGeo(v: BodyVariant): KasayaGeo {
  let g = GEO_CACHE.get(v.id);
  if (!g) {
    g = { torso: buildTorsoHalf(v), skirt: buildSkirtHalf(v), cap: buildCap(), ring: buildRing(v) };
    GEO_CACHE.set(v.id, g);
  }
  return g;
}

/** Giống headwear.ts / handheld.ts / outfit.ts — cùng khoá 'gold' thì phải cùng màu + thông số. */
const GOLD: MatOpts = { metalness: 0.45, roughness: 0.38, emissive: '#b8862f', ei: 0.25 };

// ───────────────────────── Vân "điền y" (CanvasTexture) ─────────────────────────

/** Một ô vân = 2 cột ruộng (u 0..0.5, 0.5..1) cao 1 m; các đường may ngang (v) so le giữa hai cột — ô dài, ô ngắn xen kẽ. */
const PADDY_CUTS: readonly (readonly number[])[] = [
  [0.24, 0.55, 0.83],
  [0.1, 0.4, 0.69, 0.97],
];
const TEX_CACHE = new Map<string, THREE.CanvasTexture>();

/** Màu hex trộn a → b theo t, rồi nhân độ sáng k. */
function tone(a: string, b: string, t: number, k = 1): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round((((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/**
 * Vân điền y cho vải cà sa: các ô ruộng chữ nhật (sắc độ lệch nhẹ từng ô), đường may màu viền có bóng + chỉ khâu, sợi vải
 * mờ; Phương Trượng thêm hoa thêu kim nhỏ giữa ô. Cache theo bộ màu (dùng chung, không dispose); không có `document`
 * (node / test) thì trả null — viền + đường may chính vẫn là hình nổi nên vẫn đọc ra điền y.
 */
function kasayaTexture(sash: string, seam: string, embroidered: boolean): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const key = `${sash}|${seam}|${embroidered ? 1 : 0}`;
  const hit = TEX_CACHE.get(key);
  if (hit) return hit;
  const W = 256;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return null;
  let seed = 9173;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const yOf = (v: number) => (1 - v) * H;
  const half = W / 2;
  // ô ruộng
  for (let c = 0; c < 2; c++) {
    const cuts = [0, ...PADDY_CUTS[c]!, 1];
    for (let k = 0; k < cuts.length - 1; k++) {
      g.fillStyle = tone(sash, '#000000', 0, 0.94 + 0.1 * rnd());
      g.fillRect(c * half, yOf(cuts[k + 1]!), half, yOf(cuts[k]!) - yOf(cuts[k + 1]!));
    }
  }
  // sợi vải
  for (let k = 0; k < 1400; k++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)';
    if (k % 2) g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 14, 1);
    else g.fillRect(rnd() * W, rnd() * H, 1, 2 + rnd() * 14);
  }
  const seamC = tone(sash, seam, 0.82);
  const shadow = 'rgba(0,0,0,0.28)';
  const light = 'rgba(255,255,255,0.18)';
  const stitch = tone(seam, '#ffffff', 0.35);
  // đường may ngang (mỗi cột)
  for (let c = 0; c < 2; c++) {
    for (const v of PADDY_CUTS[c]!) {
      const y = yOf(v);
      g.fillStyle = light;
      g.fillRect(c * half, y - 4, half, 1);
      g.fillStyle = seamC;
      g.fillRect(c * half, y - 3, half, 5);
      g.fillStyle = shadow;
      g.fillRect(c * half, y + 2, half, 2);
      g.fillStyle = stitch;
      for (let x = c * half + 3; x < (c + 1) * half - 2; x += 7) g.fillRect(x, y - 1, 3, 1);
    }
  }
  // đường may dọc giữa / mép ô (u = 0, 0.5, 1 — trùng đường may nổi)
  for (const x of [0, half, W]) {
    g.fillStyle = shadow;
    g.fillRect(x - 5, 0, 2, H);
    g.fillStyle = seamC;
    g.fillRect(x - 3, 0, 6, H);
    g.fillStyle = light;
    g.fillRect(x + 3, 0, 1, H);
  }
  if (embroidered) {
    // hoa thêu kim 4 cánh giữa mỗi ô
    g.fillStyle = tone(seam, '#ffffff', 0.15);
    g.globalAlpha = 0.55;
    for (let c = 0; c < 2; c++) {
      const cuts = [0, ...PADDY_CUTS[c]!, 1];
      for (let k = 0; k < cuts.length - 1; k++) {
        const cx = c * half + half / 2;
        const cy = yOf(0.5 * (cuts[k]! + cuts[k + 1]!));
        for (let a = 0; a < 4; a++) {
          g.beginPath();
          g.ellipse(cx + 7 * Math.cos((a * Math.PI) / 2), cy + 7 * Math.sin((a * Math.PI) / 2), 6, 3, (a * Math.PI) / 2, 0, TAU);
          g.fill();
        }
        g.beginPath();
        g.arc(cx, cy, 3, 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  TEX_CACHE.set(key, tex);
  return tex;
}

/** Cà sa cho bộ áo có `st.sash` (Đại Đức, Thượng Tọa, Phương Trượng) — outfit.ts gọi rồi gộp PartBuild vào phần của nó. */
export function buildKasaya(look: AvatarLook, st: RobeStyle, j: Joints, mat: MatFactory): PartBuild {
  const v = bodyVariant(look);
  const g = kasayaGeo(v);
  const sash = st.sash ?? '#a5231b';
  const seam = st.sashTrim ?? st.trim ?? '#f5c84c';
  const map = kasayaTexture(sash, seam, look.isHost);
  const cloth = mat('kasaya', map ? '#ffffff' : sash, { map, roughness: 0.82 });
  // Phương Trượng: viền thêu kim (ánh kim nhẹ + tự sáng chút); còn lại vải viền thường.
  const trim = look.isHost
    ? mat('kasayaTrim', seam, { metalness: 0.4, roughness: 0.42, emissive: seam, ei: 0.14 })
    : mat('kasayaTrim', seam, { roughness: 0.7 });
  const gold = mat('gold', '#ffd166', GOLD);
  const added: THREE.Mesh[] = [];
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, shadow: boolean, body: boolean): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, m);
    if (body) alignToBody(mesh, PIVOT.waist);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    added.push(mesh);
    return mesh;
  };
  add(j.torso, g.torso.cloth, cloth, true, true);
  add(j.torso, g.torso.trim, trim, false, true);
  add(j.torso, g.ring, gold, false, true);
  const sc = add(j.skirt, g.skirt.cloth, cloth, true, true);
  const sk = add(j.skirt, g.skirt.trim, trim, false, true);
  sc.updateMorphTargets();
  sk.updateMorphTargets();
  add(j.shoulderL, g.cap.cloth, cloth, true, false);
  add(j.shoulderL, g.cap.trim, trim, false, false);
  return {
    sitMorph: [sc, sk],
    danglers: [],
    dispose() {
      for (const m of added) m.removeFromParent();
    },
  };
}
