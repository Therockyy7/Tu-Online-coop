// Đầu + khuôn mặt chibi: sọ + tai + mũi, mắt to bóng có mí chớp, mày, miệng, má hồng, nước mắt, đỏ mặt, mắt xoáy — chuyển biểu cảm mượt.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AvatarLook } from '../api';
import { hairColorOf } from './headwear';
import { SKULL, type BuildFace, type Expression, type FaceDriver, type MatFactory } from './rig';

// ───────────────────────── Toán sọ + "bản đồ" dán nét mặt ─────────────────────────

const CY = SKULL.cy;
const RX = SKULL.rx;
const RY = SKULL.ry;
const RZ = SKULL.rz;
const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Bản đồ phẳng quanh một điểm trên sọ: (a, b) mét trong mặt tiếp xúc (a theo `tx`, b theo `ty` — hướng lên) → chiếu từ
 * tâm sọ xuống mặt ellipsoid → dời ra theo pháp tuyến thật `off` mét (đúng khoảng cách tới sọ).
 */
interface Chart {
  cx: number;
  cy: number;
  cz: number;
  xx: number;
  xy: number;
  xz: number;
  yx: number;
  yy: number;
  yz: number;
}

/** Bản đồ tâm ở điểm sọ nhìn thẳng từ trước tại (x, h = y − cy); `sx` = −1 lật trục a (mắt phải: a dương = ra ngoài). */
function chartAt(x: number, h: number, sx = 1): Chart {
  const z = RZ * Math.sqrt(Math.max(0, 1 - (x / RX) ** 2 - (h / RY) ** 2));
  const n = new THREE.Vector3(x / (RX * RX), h / (RY * RY), z / (RZ * RZ)).normalize();
  const ty = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const tx = new THREE.Vector3().crossVectors(ty, n).normalize().multiplyScalar(sx);
  return { cx: x, cy: CY + h, cz: z, xx: tx.x, xy: tx.y, xz: tx.z, yx: ty.x, yy: ty.y, yz: ty.z };
}

/** Ghi điểm (a, b) của bản đồ, cách sọ `off`, vào pos[i*3..]; nrm (nếu có) = pháp tuyến sọ tại đó. */
function surfInto(ch: Chart, a: number, b: number, off: number, pos: Float32Array | number[], i: number, nrm?: Float32Array | number[] | null): void {
  const vx = ch.cx + a * ch.xx + b * ch.yx;
  const vy = ch.cy + a * ch.xy + b * ch.yy - CY;
  const vz = ch.cz + a * ch.xz + b * ch.yz;
  const k = 1 / Math.sqrt((vx / RX) ** 2 + (vy / RY) ** 2 + (vz / RZ) ** 2);
  const sx = vx * k;
  const sy = vy * k;
  const sz = vz * k;
  let nx = sx / (RX * RX);
  let ny = sy / (RY * RY);
  let nz = sz / (RZ * RZ);
  const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
  nx *= l;
  ny *= l;
  nz *= l;
  pos[i * 3] = sx + nx * off;
  pos[i * 3 + 1] = CY + sy + ny * off;
  pos[i * 3 + 2] = sz + nz * off;
  if (nrm) {
    nrm[i * 3] = nx;
    nrm[i * 3 + 1] = ny;
    nrm[i * 3 + 2] = nz;
  }
}

// ───────────────────────── Kích thước nét mặt (head-local, mặt nhìn +Z) ─────────────────────────

/** Mắt: bầu dục cao (nửa rộng W, nửa cao trên Ht / dưới Hb), mặt mắt phồng như hạt cườm bóng. */
const EYE = {
  x: SKULL.eyeX,
  h: SKULL.eyeY - CY,
  W: 0.044,
  Ht: 0.057,
  Hb: 0.055,
  /** Độ cao mặt mắt so với sọ ở mép / phồng thêm ở giữa. */
  base: 0.0025,
  bulge: 0.0072,
  /** Các lớp chồng trên mặt mắt (cách nhau ≥ 1 mm kể cả độ võng dây cung của lưới thưa): tròng, đốm sáng, mí (da), viền mi trên mí. */
  irisGap: 0.0015,
  hiGap: 0.0027,
  lidGap: 0.004,
  lashGap: 0.0012,
} as const;

/** Bán kính "bầu dục" chuẩn hoá của điểm (a, b) trong bản đồ mắt (1 = viền mắt). */
function eyeR(a: number, b: number): number {
  return Math.hypot(a / EYE.W, b / (b >= 0 ? EYE.Ht : EYE.Hb));
}

/**
 * Độ cao mặt mắt (cách sọ) tại (a, b): EYE.base ở viền, phồng dần vào giữa theo paraboloid — độ dốc hữu hạn ở viền nên
 * dây cung của lưới thưa (mí, đốm sáng) không chui xuống dưới mặt mắt.
 */
function eyeDome(a: number, b: number): number {
  const r = eyeR(a, b);
  return EYE.base + EYE.bulge * Math.max(0, 1 - r * r);
}

/** Độ cao mí mắt: trên mặt mắt `lidGap`; ngoài viền thì hạ dần xuống sát da (1,3 mm) trong ~20% bán kính. */
function lidOff(a: number, b: number): number {
  const r = eyeR(a, b);
  if (r < 1) return eyeDome(a, b) + EYE.lidGap;
  return mix(EYE.base + EYE.lidGap, 0.0013, smooth(1, 1.2, r));
}

/** Lông mày: tâm cao h ≈ 0.125 (đồ đội đầu chừa h 0.115–0.145), hơi lệch ra ngoài so với mắt. */
const BROW = { x: 0.118, h: 0.125, len: 0.05, wIn: 0.0068, wOut: 0.0048, arch: 0.003, base: 0.004, puff: 0.0042 } as const;
/** Miệng, mũi, má hồng, vùng đỏ mặt (giận / say). */
const MOUTH = { h: -0.062 } as const;
const NOSE = { h: -0.02, a: 0.014, b: 0.011, top: 0.0062 } as const;
const BLUSH = { x: 0.178, h: -0.046, a: 0.037, b: 0.022, off: 0.0031 } as const;
/** Đỏ mặt: 2 mảng ngang má dưới mắt (dưới lề mí dưới, chừa sống mũi + miệng để khỏi trông như môi đỏ), lớp dán thấp nhất. */
const FLUSH = { x: 0.118, h: -0.036, a: 0.085, bt: 0.016, bb: 0.02, off: 0.0014 } as const;
/** Tai: ellipsoid nhỏ nhô hai bên (vùng tóc chừa trống φ 72–106°, h ≤ 0.09). */
const EAR = { h: -0.006, z: -0.012, out: 0.024, up: 0.05, depth: 0.034, yaw: 0.32 } as const;

// ───────────────────────── Bộ dựng hình dán trên sọ ─────────────────────────

/** Gom đỉnh (theo bản đồ) + tam giác; tam giác tự lật để pháp tuyến hình học cùng chiều pháp tuyến sọ (hướng ra ngoài). */
class FaceBuf {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  v(ch: Chart, a: number, b: number, off: number, u = 0, w = 0): number {
    const i = this.pos.length / 3;
    surfInto(ch, a, b, off, this.pos, i, this.nrm);
    this.uv.push(u, w);
    return i;
  }

  tri(a: number, b: number, c: number): void {
    const p = this.pos;
    const n = this.nrm;
    const ux = p[b * 3]! - p[a * 3]!;
    const uy = p[b * 3 + 1]! - p[a * 3 + 1]!;
    const uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
    const vx = p[c * 3]! - p[a * 3]!;
    const vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
    const vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
    const d = (uy * vz - uz * vy) * n[a * 3]! + (uz * vx - ux * vz) * n[a * 3 + 1]! + (ux * vy - uy * vx) * n[a * 3 + 2]!;
    if (d < 0) this.idx.push(a, c, b);
    else this.idx.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  /** `geoNormals`: pháp tuyến theo hình (mặt phồng bóng); không thì dùng pháp tuyến sọ (hình dán phẳng, đổ bóng như da). */
  geometry(geoNormals: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    if (geoNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

type OffFn = (a: number, b: number, rho: number) => number;

/**
 * Bầu dục dán (tâm (a0, b0), nửa trục A / Bt trên / Bb dưới): 1 đỉnh tâm + `rings` vòng × `segs` đỉnh. uv toả tròn
 * (0.5, 0.5) → mép = bán kính 0.5 (khớp texture mờ dần `softTex`).
 */
function ellipse(buf: FaceBuf, ch: Chart, a0: number, b0: number, A: number, Bt: number, Bb: number, rings: number, segs: number, off: OffFn): void {
  const c = buf.v(ch, a0, b0, off(a0, b0, 0), 0.5, 0.5);
  let prev: number[] = [];
  for (let k = 1; k <= rings; k++) {
    const rho = k / rings;
    const ring: number[] = [];
    for (let s = 0; s < segs; s++) {
      const al = (s / segs) * TAU;
      const ca = Math.cos(al);
      const sa = Math.sin(al);
      const a = a0 + A * rho * ca;
      const b = b0 + (sa >= 0 ? Bt : Bb) * rho * sa;
      ring.push(buf.v(ch, a, b, off(a, b, rho), 0.5 + 0.5 * rho * ca, 0.5 + 0.5 * rho * sa));
    }
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      if (k === 1) buf.tri(c, ring[s]!, ring[s1]!);
      else buf.quad(prev[s]!, prev[s1]!, ring[s1]!, ring[s]!);
    }
    prev = ring;
  }
}

type StrokeOff = (a: number, b: number, d: number, wf: number) => number;

/**
 * Nét dải dọc đường gấp khúc 2D (`pts` = [a, b, nửa bề rộng]…) trong bản đồ, `rows` hàng ngang (d từ −1 → 1),
 * hai đầu bo tròn (`caps` bước). off(a, b, d, wf): độ cao theo vị trí ngang d và tỉ lệ bề rộng wf (0 ở chóp đầu bo).
 * uv: u = (d + 1) / 2 (ngang), w = 0.5 → texture mờ dần cho mép mềm.
 */
function stroke(buf: FaceBuf, ch: Chart, pts: readonly (readonly [number, number, number])[], rows: number, caps: number, off: StrokeOff): void {
  const n = pts.length;
  // Hướng tiếp tuyến 2D tại mỗi điểm.
  const tan: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[Math.min(n - 1, i + 1)]!;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const l = Math.hypot(dx, dy) || 1;
    tan.push([dx / l, dy / l]);
  }
  // Thêm điểm bo tròn hai đầu (nửa bề rộng giảm theo cung tròn).
  const full: [number, number, number, number, number][] = [];
  const hw0 = Math.max(...pts.map((p) => p[2]));
  const capPts = (i: number, dir: number): [number, number, number, number, number][] => {
    const out: [number, number, number, number, number][] = [];
    const p = pts[i]!;
    const t = tan[i]!;
    for (let k = 1; k <= caps; k++) {
      const ps = (k / caps) * (Math.PI / 2);
      const e = p[2] * Math.sin(ps);
      out.push([p[0] + t[0] * e * dir, p[1] + t[1] * e * dir, p[2] * Math.cos(ps), t[0], t[1]]);
    }
    return out;
  };
  full.push(...capPts(0, -1).reverse());
  for (let i = 0; i < n; i++) full.push([pts[i]![0], pts[i]![1], pts[i]![2], tan[i]![0], tan[i]![1]]);
  full.push(...capPts(n - 1, 1));
  let prev: number[] = [];
  for (let i = 0; i < full.length; i++) {
    const [a, b, hw, tx, ty] = full[i]!;
    const row: number[] = [];
    for (let r = 0; r < rows; r++) {
      const d = rows === 1 ? 0 : (r / (rows - 1)) * 2 - 1;
      const pa = a - ty * hw * d;
      const pb = b + tx * hw * d;
      row.push(buf.v(ch, pa, pb, off(pa, pb, d, hw0 > 0 ? hw / hw0 : 0), (d + 1) / 2, 0.5));
    }
    if (i > 0) for (let r = 0; r < rows - 1; r++) buf.quad(prev[r]!, prev[r + 1]!, row[r + 1]!, row[r]!);
    prev = row;
  }
}

/** Texture alpha mờ dần theo bán kính (trắng, alpha 1 ở tâm → 0 ở bán kính 0.5) — má hồng, đỏ mặt, nước mắt. */
let softTexCache: THREE.DataTexture | null = null;
function softTex(): THREE.DataTexture {
  if (softTexCache) return softTexCache;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot((x + 0.5) / N - 0.5, (y + 0.5) / N - 0.5) * 2;
      const a = 1 - smooth(0.25, 1, r);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * a);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  softTexCache = t;
  return t;
}

// ───────────────────────── Hình dùng chung (chỉ phụ thuộc kích thước chuẩn — dựng 1 lần, không dispose) ─────────────────────────

const SIDES = [1, -1] as const;
/** Bản đồ quanh tâm mắt trái / phải (a dương = ra ngoài, phía đuôi mắt). */
const EYE_CH = SIDES.map((s) => chartAt(s * EYE.x, EYE.h, s));
/** Tròng đen: tâm hơi thấp, chừa viền trắng mỏng; `IRIS_SMALL` = tỉ lệ khi ngạc nhiên. */
const IRIS = { b0: -0.05 * EYE.Ht, A: 0.86 * EYE.W, Bt: 0.9 * EYE.Ht, Bb: 0.9 * EYE.Hb } as const;
const IRIS_SMALL = 0.66;

/**
 * Sọ + tai + mũi — cùng vật liệu da, gộp 1 mesh. Sọ = icosphere chia 7 (1280 tam giác, cạnh ≤ ~9,5° — đường viền tròn
 * hơn cầu UV 32×24 (11,25° ở xích đạo) mà ít tam giác hơn), đỉnh nằm đúng ellipsoid SKULL, pháp tuyến giải tích.
 */
function skullGeometry(): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, 7);
  ico.deleteAttribute('uv');
  ico.deleteAttribute('normal');
  const sk = mergeVertices(ico, 1e-5);
  ico.dispose();
  const p = sk.getAttribute('position') as THREE.BufferAttribute;
  const n = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    p.setXYZ(i, v.x * RX, CY + v.y * RY, v.z * RZ);
    v.set(v.x / RX, v.y / RY, v.z / RZ).normalize();
    n[i * 3] = v.x;
    n[i * 3 + 1] = v.y;
    n[i * 3 + 2] = v.z;
  }
  sk.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  const parts: THREE.BufferGeometry[] = [sk];
  const m = new THREE.Matrix4();
  for (const s of SIDES) {
    const ear = new THREE.SphereGeometry(1, 10, 6);
    ear.deleteAttribute('uv');
    ear.applyMatrix4(m.compose(earCenter(s), earQuat(s), EAR_SCALE));
    parts.push(ear);
  }
  // Mũi: cục tròn nhỏ xíu, mép chìm dưới da (khỏi lộ đường viền), đỉnh nhô ~6 mm.
  const nb = new FaceBuf();
  ellipse(nb, chartAt(0, NOSE.h), 0, 0, NOSE.a, NOSE.b, NOSE.b, 2, 12, (_a, _b, rho) => -0.0012 + (NOSE.top + 0.0012) * Math.pow(1 - rho * rho, 0.8));
  const nose = nb.geometry(true);
  nose.deleteAttribute('uv');
  parts.push(nose);
  const g = mergeGeometries(parts, false)!;
  for (const x of parts) x.dispose();
  g.computeBoundingSphere();
  return g;
}

/** Tâm tai: lún nửa vào sọ, hơi lùi ra sau; tai xoay nhẹ hướng ra trước. */
function earCenter(s: number): THREE.Vector3 {
  const xs = RX * Math.sqrt(1 - (EAR.h / RY) ** 2 - (EAR.z / RZ) ** 2);
  return new THREE.Vector3(s * (xs + 0.002), CY + EAR.h, EAR.z);
}
const EAR_SCALE = new THREE.Vector3(EAR.out, EAR.up, EAR.depth);
function earQuat(s: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -s * EAR.yaw);
}

/**
 * Lòng tai hồng: miếng dán trên mặt ngoài vành tai (chỏm cầu đơn vị quanh cực +X của tai, nở 9% rồi co giãn theo
 * ellipsoid tai → cách mặt tai ~2–4 mm), uv toả tròn để texture mờ dần cho mép mềm. Ghi vào `buf` (gộp với má hồng).
 */
function earInnerInto(buf: FaceBuf): void {
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const RINGS = 2;
  const SEGS = 10;
  for (const s of SIDES) {
    m.compose(earCenter(s), earQuat(s), EAR_SCALE);
    nm.getNormalMatrix(m);
    const put = (th: number, al: number, u: number, w: number): number => {
      // Chỏm quanh cực hướng ra ngoài (s·X), hơi lệch xuống-ra trước như lòng tai thật; nở 1,09 lần theo ellipsoid tai.
      v.set(s * Math.cos(th), Math.sin(th) * Math.sin(al) - 0.08, Math.sin(th) * Math.cos(al) + 0.05).normalize().multiplyScalar(1.09);
      nv.copy(v);
      v.applyMatrix4(m);
      nv.applyMatrix3(nm).normalize();
      const i = buf.pos.length / 3;
      buf.pos.push(v.x, v.y, v.z);
      buf.nrm.push(nv.x, nv.y, nv.z);
      buf.uv.push(u, w);
      return i;
    };
    const c = put(0, 0, 0.5, 0.5);
    let prev: number[] = [];
    for (let k = 1; k <= RINGS; k++) {
      const rho = k / RINGS;
      const ring: number[] = [];
      for (let j = 0; j < SEGS; j++) {
        const al = (j / SEGS) * TAU;
        const th = rho * Math.hypot(0.92 * Math.sin(al), 0.8 * Math.cos(al));
        ring.push(put(th, al, 0.5 + 0.5 * rho * Math.cos(al), 0.5 + 0.5 * rho * Math.sin(al)));
      }
      for (let j = 0; j < SEGS; j++) {
        const j1 = (j + 1) % SEGS;
        if (k === 1) buf.tri(c, ring[j]!, ring[j1]!);
        else buf.quad(prev[j]!, prev[j1]!, ring[j1]!, ring[j]!);
      }
      prev = ring;
    }
  }
}

type EyeLayer = 'sclera' | 'iris' | 'high';

/**
 * Một lớp của 2 mắt (gộp trái + phải) với tròng thu nhỏ theo tỉ lệ `s` quanh tâm tròng. Tròng 1 mesh, màu (con ngươi,
 * vành nâu ấm, viền sẫm) vẽ bằng texture `irisTex` theo uv toả tròn.
 */
function eyeLayerAt(layer: EyeLayer, s: number): THREE.BufferGeometry {
  const buf = new FaceBuf();
  for (let e = 0; e < 2; e++) {
    const ch = EYE_CH[e]!;
    const side = SIDES[e]!;
    const sc = (a: number, b: number): [number, number] => [a * s, IRIS.b0 + (b - IRIS.b0) * s];
    if (layer === 'sclera') {
      ellipse(buf, ch, 0, 0, EYE.W, EYE.Ht, EYE.Hb, 2, 20, (a, b) => eyeDome(a, b));
    } else if (layer === 'iris') {
      ellipse(buf, ch, 0, IRIS.b0, IRIS.A * s, IRIS.Bt * s, IRIS.Bb * s, 2, 18, (a, b) => eyeDome(a, b) + EYE.irisGap);
    } else {
      // 2 đốm sáng: lớn ở trên-trái, nhỏ ở dưới-phải (cùng phía thế giới cho cả hai mắt).
      const [a1, b1] = sc(side * -0.3 * IRIS.A, IRIS.b0 + 0.38 * IRIS.Bt);
      ellipse(buf, ch, a1, b1, 0.33 * IRIS.A * s, 0.27 * IRIS.Bt * s, 0.27 * IRIS.Bt * s, 1, 12, (a, b) => eyeDome(a, b) + EYE.hiGap);
      const [a2, b2] = sc(side * 0.36 * IRIS.A, IRIS.b0 - 0.46 * IRIS.Bb);
      ellipse(buf, ch, a2, b2, 0.13 * IRIS.A * s, 0.13 * IRIS.A * s, 0.13 * IRIS.A * s, 1, 8, (a, b) => eyeDome(a, b) + EYE.hiGap);
    }
  }
  return buf.geometry(true);
}

/**
 * Texture tròng mắt (sRGB, dùng chung, không dispose): tròng nâu sẫm, nửa dưới ửng nâu ấm (ánh phản quang lưỡi liềm),
 * con ngươi sẫm hơn ở giữa, viền ngoài sẫm cho mắt rõ nét. uv toả tròn: tâm (0.5, 0.5), mép tròng ở bán kính 0.5.
 */
let irisTexCache: THREE.DataTexture | null = null;
function irisTex(): THREE.DataTexture {
  if (irisTexCache) return irisTexCache;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  const base = new THREE.Color('#2a170e');
  const warm = new THREE.Color('#b06a30');
  const pupil = new THREE.Color('#0d0705');
  const limb = new THREE.Color('#140a06');
  const c = new THREE.Color();
  const srgb = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = ((x + 0.5) / N - 0.5) * 2;
      const dy = ((y + 0.5) / N - 0.5) * 2;
      const r = Math.hypot(dx, dy);
      // Lưỡi liềm ấm: nửa dưới, giữa con ngươi và viền.
      const w = smooth(0.3, 0.55, r) * (1 - smooth(0.8, 0.93, r)) * smooth(0.05, -0.55, dy) * 0.9;
      c.copy(base).lerp(warm, w);
      c.lerp(pupil, 1 - smooth(0.3, 0.4, Math.hypot(dx, dy * 0.92 + 0.04)));
      c.lerp(limb, smooth(0.86, 0.98, r));
      // Trộn trong không gian tuyến tính, ghi ra sRGB (texture khai báo SRGBColorSpace).
      c.getRGB(srgb, THREE.SRGBColorSpace);
      const i = (y * N + x) * 4;
      data[i] = Math.round(srgb.r * 255);
      data[i + 1] = Math.round(srgb.g * 255);
      data[i + 2] = Math.round(srgb.b * 255);
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  irisTexCache = t;
  return t;
}

/** Lớp mắt kèm morph 'small' (ngạc nhiên: tròng co lại) — sclera không có morph. */
function eyeLayerGeometry(layer: EyeLayer): THREE.BufferGeometry {
  const g = eyeLayerAt(layer, 1);
  if (layer !== 'sclera') {
    const sm = eyeLayerAt(layer, IRIS_SMALL);
    g.morphAttributes.position = [sm.getAttribute('position')];
    g.morphAttributes.normal = [sm.getAttribute('normal')];
    g.morphTargetsRelative = false;
  }
  return g;
}

/** Mắt xoáy: số điểm dọc dải xoắn (2,5 vòng), bán kính chuẩn hoá trong / ngoài (theo bầu dục mắt), độ cao trên mặt mắt. */
const SPIRAL_N = 50;
const SPIRAL_R0 = 0.07;
const SPIRAL_R1 = 0.74;
const SPIRAL_GAP = 0.0015;

/**
 * Mắt xoáy (say khướt / choáng) cho cả hai mắt, 1 mesh riêng từng khuôn mặt: dải xoắn 2,5 vòng vẽ trong toạ độ chuẩn
 * hoá của bầu dục mắt, quay bằng cách ghi lại đỉnh mỗi khung (chỉ khi đang hiện) — luôn nằm đúng `SPIRAL_GAP` trên mặt
 * mắt ở mọi góc quay (quay cứng quanh một trục thì chỗ cao chỗ thấp so với mặt mắt bầu dục).
 */
class Spiral {
  readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(2 * (SPIRAL_N + 1) * 2 * 3);
  private readonly nrm = new Float32Array(2 * (SPIRAL_N + 1) * 2 * 3);
  private phase = NaN;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.set(0);
    const idx: number[] = [];
    for (let e = 0; e < 2; e++) {
      const o = e * (SPIRAL_N + 1) * 2;
      for (let k = 0; k < SPIRAL_N; k++) quadOriented(this.pos, this.nrm, idx, o + k * 2, o + k * 2 + 2, o + k * 2 + 3, o + k * 2 + 1);
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CY + EYE.h, 0.24), 0.2);
  }

  /** Ghi đỉnh ở góc quay `ph` (rad); bỏ qua nếu không đổi. */
  set(ph: number): void {
    if (Math.abs(ph - this.phase) < 1e-4) return;
    this.phase = ph;
    for (let e = 0; e < 2; e++) {
      const ch = EYE_CH[e]!;
      const o = e * (SPIRAL_N + 1) * 2;
      for (let k = 0; k <= SPIRAL_N; k++) {
        const t = k / SPIRAL_N;
        const rho = mix(SPIRAL_R0, SPIRAL_R1, t);
        const al = Math.PI / 2 + 2.5 * TAU * t + ph;
        // Pháp tuyến 2D của đường xoắn (chuẩn hoá) để dải đều bề rộng; thon nhọn hai đầu.
        const dr = SPIRAL_R1 - SPIRAL_R0;
        const dal = 2.5 * TAU;
        let tx = dr * Math.cos(al) - rho * dal * Math.sin(al);
        let ty = dr * Math.sin(al) + rho * dal * Math.cos(al);
        const l = Math.hypot(tx, ty) || 1;
        tx /= l;
        ty /= l;
        const hw = (0.11 + 0.04 * t) * Math.min(1, t * 8, (1 - t) * 6) * 0.5;
        for (let s = 0; s < 2; s++) {
          const d = s === 0 ? -1 : 1;
          const na = rho * Math.cos(al) - ty * hw * d;
          const nb = rho * Math.sin(al) + tx * hw * d;
          const a = na * EYE.W;
          const b = nb * (nb >= 0 ? EYE.Ht : EYE.Hb);
          surfInto(ch, a, b, eyeDome(a, b) + SPIRAL_GAP, this.pos, o + k * 2 + s, this.nrm);
        }
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

/**
 * Hai lông mày tròn mũm mĩm (đầu trong dày hơn), phồng nhẹ ở giữa — gộp 1 hình, toạ độ GỐC = tâm sọ (để xoay quanh tâm
 * sọ). Đỉnh [0, per) là mày trái, [per, 2·per) là mày phải.
 */
function browGeometry(): THREE.BufferGeometry {
  const buf = new FaceBuf();
  for (let e = 0; e < 2; e++) {
    const s = SIDES[e]!;
    const pts: [number, number, number][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      pts.push([mix(-BROW.len / 2, BROW.len / 2, t), BROW.arch * (1 - (2 * t - 1) ** 2) - 0.003 * t, mix(BROW.wIn, BROW.wOut, t)]);
    }
    stroke(buf, chartAt(s * BROW.x, BROW.h, s), pts, 3, 2, (_a, _b, d, wf) => BROW.base + BROW.puff * Math.sqrt(Math.max(0, 1 - d * d)) * Math.sqrt(wf));
  }
  const g = buf.geometry(true);
  g.translate(0, -CY, 0);
  return g;
}

/**
 * Má hồng 2 bên + lòng tai hồng — cùng vật liệu trong suốt mờ mép (tai ửng theo má khi vui / say). Morph 'big' = má
 * nở 1,35 lần (dựng thẳng trên mặt sọ, không phóng to dây cung); lòng tai giữ nguyên.
 */
const BLUSH_BIG = 1.35;
function blushGeometry(): THREE.BufferGeometry {
  const make = (k: number): FaceBuf => {
    const buf = new FaceBuf();
    for (const s of SIDES) ellipse(buf, chartAt(s * BLUSH.x, BLUSH.h, s), 0, 0, BLUSH.a * k, BLUSH.b * k, BLUSH.b * k, 1, 14, () => BLUSH.off);
    earInnerInto(buf);
    return buf;
  };
  const g = make(1).geometry(false);
  const big = make(BLUSH_BIG).geometry(false);
  g.morphAttributes.position = [big.getAttribute('position')];
  g.morphTargetsRelative = false;
  big.dispose();
  return g;
}

/** Vùng đỏ ngang má + sống mũi (giận, say). */
function flushGeometry(): THREE.BufferGeometry {
  const buf = new FaceBuf();
  for (const s of SIDES) ellipse(buf, chartAt(s * FLUSH.x, FLUSH.h, s), 0, 0, FLUSH.a, FLUSH.bt, FLUSH.bb, 2, 14, () => FLUSH.off);
  return buf.geometry(false);
}

/** Dòng nước mắt dưới mỗi mắt (bản đồ mắt): [a, b, nửa bề rộng]. */
const TEAR_PATH: readonly (readonly [number, number, number])[] = [
  [0.5 * EYE.W, -1.07 * EYE.Hb, 0.0026],
  [0.56 * EYE.W, -1.35 * EYE.Hb, 0.004],
  [0.6 * EYE.W, -1.7 * EYE.Hb, 0.005],
  [0.56 * EYE.W, -2.05 * EYE.Hb, 0.0054],
  [0.6 * EYE.W, -2.4 * EYE.Hb, 0.0054],
  [0.66 * EYE.W, -2.72 * EYE.Hb, 0.0048],
];
const TEAR_OFF = 0.0045;
const DROP_R = 0.0058;

function tearGeometry(): THREE.BufferGeometry {
  const buf = new FaceBuf();
  for (let e = 0; e < 2; e++) stroke(buf, EYE_CH[e]!, TEAR_PATH, 2, 2, () => TEAR_OFF);
  return buf.geometry(false);
}

/** Hai giọt lệ gộp 1 hình riêng từng khuôn mặt: đỉnh = hình giọt gốc × tỉ lệ + vị trí, ghi lại mỗi khung khi đang khóc. */
class Drops {
  readonly geo = new THREE.BufferGeometry();
  private readonly base: Float32Array;
  private readonly pos: Float32Array;
  private readonly n: number;

  constructor(shape: THREE.BufferGeometry) {
    this.base = (shape.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    this.n = this.base.length / 3;
    this.pos = new Float32Array(this.base.length * 2);
    const nrm = new Float32Array(this.base.length * 2);
    const sn = (shape.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    nrm.set(sn, 0);
    nrm.set(sn, sn.length);
    const si = shape.index!;
    const idx: number[] = [];
    for (let e = 0; e < 2; e++) for (let i = 0; i < si.count; i++) idx.push(si.getX(i) + e * this.n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CY + EYE.h - 0.12, 0.25), 0.25);
  }

  /** Đặt giọt `e` tại (x, y, z) với tỉ lệ `k` (0 = ẩn hẳn). */
  set(e: number, x: number, y: number, z: number, k: number): void {
    const b = this.base;
    const p = this.pos;
    const o = e * this.n * 3;
    for (let i = 0; i < b.length; i += 3) {
      p[o + i] = x + b[i]! * k;
      p[o + i + 1] = y + b[i + 1]! * k;
      p[o + i + 2] = z + b[i + 2]! * k;
    }
  }

  commit(): void {
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

/**
 * Hai lông mày gộp 1 hình riêng từng khuôn mặt: đỉnh = quaternion từng bên × hình gốc (quanh tâm sọ) + tâm sọ; chỉ ghi
 * lại khi góc xoay đổi.
 */
class Brows {
  readonly geo = new THREE.BufferGeometry();
  private readonly bp: Float32Array;
  private readonly bn: Float32Array;
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;
  private readonly per: number;
  private readonly last = [new THREE.Quaternion(0, 0, 0, 0), new THREE.Quaternion(0, 0, 0, 0)];
  private readonly v = new THREE.Vector3();

  constructor(base: THREE.BufferGeometry) {
    this.bp = (base.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    this.bn = (base.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
    this.per = this.bp.length / 6;
    this.pos = new Float32Array(this.bp.length);
    this.nrm = new Float32Array(this.bn.length);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    const bi = base.index!;
    const idx: number[] = [];
    for (let i = 0; i < bi.count; i++) idx.push(bi.getX(i));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CY + BROW.h, 0.24), 0.2);
  }

  /** Xoay mày bên `e` theo `q` (quanh tâm sọ); trả true nếu đã ghi lại đỉnh. */
  set(e: number, q: THREE.Quaternion): boolean {
    const L = this.last[e]!;
    if (Math.abs(L.dot(q)) > 1 - 1e-9) return false;
    L.copy(q);
    const v = this.v;
    const o = e * this.per * 3;
    for (let i = o; i < o + this.per * 3; i += 3) {
      v.set(this.bp[i]!, this.bp[i + 1]!, this.bp[i + 2]!).applyQuaternion(q);
      this.pos[i] = v.x;
      this.pos[i + 1] = v.y + CY;
      this.pos[i + 2] = v.z;
      v.set(this.bn[i]!, this.bn[i + 1]!, this.bn[i + 2]!).applyQuaternion(q);
      this.nrm[i] = v.x;
      this.nrm[i + 1] = v.y;
      this.nrm[i + 2] = v.z;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    return true;
  }

  dispose(): void {
    this.geo.dispose();
  }
}

/** Đường trượt của giọt lệ (head-local, mỗi mắt `DROP_N` điểm dọc dòng lệ, cách sọ đủ để giọt không lún). */
const DROP_N = 24;
function dropPath(e: number): Float32Array {
  const out = new Float32Array(DROP_N * 3);
  const n = TEAR_PATH.length - 1;
  for (let k = 0; k < DROP_N; k++) {
    const f = (k / (DROP_N - 1)) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const t = f - i;
    const p0 = TEAR_PATH[i]!;
    const p1 = TEAR_PATH[i + 1]!;
    surfInto(EYE_CH[e]!, mix(p0[0], p1[0], t), mix(p0[1], p1[1], t), TEAR_OFF + DROP_R * 0.8, out, k);
  }
  return out;
}

interface SharedGeo {
  skull: THREE.BufferGeometry;
  sclera: THREE.BufferGeometry;
  iris: THREE.BufferGeometry;
  high: THREE.BufferGeometry;
  /** Hình gốc 2 mày (quanh tâm sọ) — mỗi khuôn mặt chép ra hình riêng để xoay. */
  brow: THREE.BufferGeometry;
  blush: THREE.BufferGeometry;
  flush: THREE.BufferGeometry;
  tears: THREE.BufferGeometry;
  /** Hình gốc 1 giọt lệ (gốc = tâm giọt). */
  drop: THREE.BufferGeometry;
  dropPath: [Float32Array, Float32Array];
}

let shared: SharedGeo | null = null;
function sharedGeo(): SharedGeo {
  if (shared) return shared;
  const drop = new THREE.SphereGeometry(DROP_R, 6, 4);
  drop.scale(1, 1.25, 0.8);
  shared = {
    skull: skullGeometry(),
    sclera: eyeLayerGeometry('sclera'),
    iris: eyeLayerGeometry('iris'),
    high: eyeLayerGeometry('high'),
    brow: browGeometry(),
    blush: blushGeometry(),
    flush: flushGeometry(),
    tears: tearGeometry(),
    drop,
    dropPath: [dropPath(0), dropPath(1)],
  };
  return shared;
}

// ───────────────────────── Mí mắt + viền mi (hình riêng từng nhân vật, cập nhật khi tham số đổi) ─────────────────────────

/** Tham số mí (đã làm mượt): khép c, dáng khép (cong ∪ hiền / ∩ vui / ^ cười / ∩ dẹt khóc), mí trên sụp, xếch, mí dưới. */
interface LidParams {
  c: number;
  kCalm: number;
  kHappy: number;
  kLaugh: number;
  kCry: number;
  rest: number;
  slantIn: number;
  slantOut: number;
  low: number;
}

/** Cột theo chiều ngang mắt (u = a / W, quá viền một chút để phủ khoé mắt) + 5 hàng mỗi mí (viền ngoài, mép mắt, 2 hàng giữa, mép mí). */
const LID_COLS = 10;
const LID_U = 1.22;
const LID_ROWS = 5;
/** Lề da trên / dưới viền mắt mà mí phủ thêm (mép mí hạ sát da ở đây). */
const LID_MU = 0.009;
const LID_ML = 0.009;
/** Viền mi: số đoạn dọc mí + 3 điểm đuôi mi vểnh. */
const LASH_SEG = 12;
const LASH_N = LASH_SEG + 1 + 3;

const topOf = (u: number): number => (Math.abs(u) >= 1 ? 0 : EYE.Ht * Math.sqrt(1 - u * u));
const botOf = (u: number): number => (Math.abs(u) >= 1 ? 0 : -EYE.Hb * Math.sqrt(1 - u * u));

/** Mép mí trên U(u) + mép mí dưới D(u) (b trong bản đồ mắt). u ngoài [−1, 1] → khoé mắt (0). */
function lidEdges(p: LidParams, u: number, out: { U: number; D: number }): void {
  if (Math.abs(u) >= 1) {
    out.U = out.D = 0;
    return;
  }
  const e = Math.sqrt(1 - u * u);
  const top = EYE.Ht * e;
  const bot = -EYE.Hb * e;
  const full = top - bot;
  const wIn = clamp((0.5 - u) / 1.5, 0, 1);
  const wOut = clamp((u + 0.5) / 1.5, 0, 1);
  const f = Math.min(0.95, p.rest + p.slantIn * 0.55 * wIn + p.slantOut * 0.45 * wOut);
  const Uo = top - f * full;
  const Do = bot + p.low * 0.35 * full;
  const ks = p.kCalm + p.kHappy + p.kLaugh + p.kCry || 1;
  const K =
    (p.kCalm * -0.42 * EYE.Hb * e +
      p.kHappy * 0.4 * EYE.Ht * (1 - u * u) +
      p.kLaugh * 0.5 * EYE.Ht * (1 - Math.pow(Math.abs(u), 1.3)) +
      p.kCry * 0.24 * EYE.Ht * (1 - u * u)) /
    ks;
  const U = mix(Uo, K, p.c);
  const D = mix(Do, K, smooth(0.45, 1, p.c));
  out.U = U;
  out.D = Math.min(D, U);
}

/** Độ cong (1/m) mặt mắt + sọ theo chiều dọc / ngang, và bước cột của mí — để bù độ võng dây cung. */
const KV = (2 * EYE.bulge) / (EYE.Ht * EYE.Ht) + 1 / RY;
const KH = (2 * EYE.bulge) / (EYE.W * EYE.W) + 1 / RX;
const LID_DH = (2 * LID_U * EYE.W) / LID_COLS;

/**
 * Độ nâng thêm của các hàng mí trên mặt mắt ở một cột: lưới mí thưa (3 khoảng dọc, cột ~1 cm) nên mặt tam giác võng
 * xuống dưới mặt cong ≈ κ·Δ²/8 — nâng đỉnh đúng bấy nhiêu để mặt mí thật luôn cách các lớp mắt ≥ `lidGap − hiGap`.
 */
function lidLift(top: number, bot: number, U: number, D: number): number {
  const dv = Math.max(Math.abs(U - top), Math.abs(D - bot)) / (LID_ROWS - 2);
  return (KV * dv * dv + KH * LID_DH * LID_DH) / 8;
}

/** Mí trên/dưới (da) + viền mi (đậm) cho cả hai mắt; đỉnh tính lại chỉ khi tham số đổi. */
class Lids {
  readonly lid = new THREE.BufferGeometry();
  readonly lash = new THREE.BufferGeometry();
  private readonly lp: Float32Array;
  private readonly ln: Float32Array;
  private readonly hp: Float32Array;
  private readonly hn: Float32Array;
  private readonly last = new Float32Array(10).fill(NaN);
  private readonly edge = { U: 0, D: 0 };
  /** Đường giữa viền mi (a, b, nửa bề rộng) — dùng lại mỗi lần. */
  private readonly line = new Float32Array(LASH_N * 3);

  constructor() {
    const perLid = (LID_COLS + 1) * LID_ROWS;
    this.lp = new Float32Array(perLid * 4 * 3);
    this.ln = new Float32Array(perLid * 4 * 3);
    this.hp = new Float32Array(LASH_N * 2 * 2 * 3);
    this.hn = new Float32Array(LASH_N * 2 * 2 * 3);
    this.lid.setAttribute('position', new THREE.BufferAttribute(this.lp, 3).setUsage(THREE.DynamicDrawUsage));
    this.lid.setAttribute('normal', new THREE.BufferAttribute(this.ln, 3).setUsage(THREE.DynamicDrawUsage));
    this.lash.setAttribute('position', new THREE.BufferAttribute(this.hp, 3).setUsage(THREE.DynamicDrawUsage));
    this.lash.setAttribute('normal', new THREE.BufferAttribute(this.hn, 3).setUsage(THREE.DynamicDrawUsage));
    // Dựng chỉ số ở tư thế khép hờ (không suy biến) rồi lật tam giác theo pháp tuyến sọ.
    this.write({ c: 0.5, kCalm: 1, kHappy: 0, kLaugh: 0, kCry: 0, rest: 0.1, slantIn: 0, slantOut: 0, low: 0 });
    const li: number[] = [];
    for (let l = 0; l < 4; l++) {
      const o = l * perLid;
      for (let i = 0; i < LID_COLS; i++)
        for (let r = 0; r < LID_ROWS - 1; r++) {
          const a = o + i * LID_ROWS + r;
          quadOriented(this.lp, this.ln, li, a, a + LID_ROWS, a + LID_ROWS + 1, a + 1);
        }
    }
    this.lid.setIndex(li);
    const hi: number[] = [];
    for (let e = 0; e < 2; e++) {
      const o = e * LASH_N * 2;
      for (let i = 0; i < LASH_N - 1; i++) quadOriented(this.hp, this.hn, hi, o + i * 2, o + i * 2 + 2, o + i * 2 + 3, o + i * 2 + 1);
    }
    this.lash.setIndex(hi);
    // Vỏ bao cố định (đỉnh di chuyển trong vùng mắt) để khỏi tính lại mỗi lần.
    const bs = new THREE.Sphere(new THREE.Vector3(0, CY + EYE.h, 0.24), 0.2);
    this.lid.boundingSphere = bs;
    this.lash.boundingSphere = bs.clone();
  }

  /** Cập nhật nếu tham số đổi đáng kể (> 0,1 mm tương đương). */
  update(p: LidParams): void {
    const L = this.last;
    if (
      near(L, 0, p.c) &&
      near(L, 1, p.kCalm) &&
      near(L, 2, p.kHappy) &&
      near(L, 3, p.kLaugh) &&
      near(L, 4, p.kCry) &&
      near(L, 5, p.rest) &&
      near(L, 6, p.slantIn) &&
      near(L, 7, p.slantOut) &&
      near(L, 8, p.low)
    )
      return;
    this.write(p);
    (this.lid.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.lid.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    (this.lash.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.lash.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
  }

  private write(p: LidParams): void {
    const perLid = (LID_COLS + 1) * LID_ROWS;
    const E = this.edge;
    const W = EYE.W;
    for (let e = 0; e < 2; e++) {
      const ch = EYE_CH[e]!;
      for (let i = 0; i <= LID_COLS; i++) {
        const u = -LID_U + (2 * LID_U * i) / LID_COLS;
        const a = u * W;
        lidEdges(p, u, E);
        const top = topOf(u);
        const bot = botOf(u);
        const up = e * 2 * perLid + i * LID_ROWS;
        const dn = (e * 2 + 1) * perLid + i * LID_ROWS;
        const lift = lidLift(top, bot, E.U, E.D);
        for (let r = 0; r < LID_ROWS; r++) {
          const yu = r === 0 ? top + LID_MU : top + ((E.U - top) * (r - 1)) / (LID_ROWS - 2);
          const yd = r === 0 ? bot - LID_ML : bot + ((E.D - bot) * (r - 1)) / (LID_ROWS - 2);
          const l = r === 0 ? 0 : lift;
          surfInto(ch, a, yu, lidOff(a, yu) + l, this.lp, up + r, this.ln);
          surfInto(ch, a, yd, lidOff(a, yd) + l - 0.0003, this.lp, dn + r, this.ln);
        }
      }
      // Viền mi dọc mép mí trên: dày ở giữa, mảnh ở khoé trong, đuôi vểnh ra ngoài.
      const th = mix(0.0085, 0.007, p.c);
      const ln = this.line;
      for (let k = 0; k < LASH_N; k++) {
        let u: number;
        let y: number;
        let hw: number;
        if (k <= LASH_SEG) {
          u = -1.04 + (2.04 * k) / LASH_SEG;
          lidEdges(p, u, E);
          const taper = u < 0 ? mix(1, 0.45, Math.pow(-u / 1.04, 2)) : mix(1, 0.85, u * u);
          hw = (th / 2) * taper;
          y = E.U + 0.15 * th;
        } else {
          const f = k - LASH_SEG;
          u = 1 + 0.09 * f;
          hw = (th / 2) * 0.85 * (1 - f / 3.3);
          y = 0.15 * th + 0.0042 * f;
        }
        ln[k * 3] = u * W;
        ln[k * 3 + 1] = y;
        ln[k * 3 + 2] = hw;
      }
      for (let k = 0; k < LASH_N; k++) {
        const k0 = Math.max(0, k - 1);
        const k1 = Math.min(LASH_N - 1, k + 1);
        let tx = ln[k1 * 3]! - ln[k0 * 3]!;
        let ty = ln[k1 * 3 + 1]! - ln[k0 * 3 + 1]!;
        const l = Math.hypot(tx, ty) || 1;
        tx /= l;
        ty /= l;
        const a = ln[k * 3]!;
        const b = ln[k * 3 + 1]!;
        const hw = ln[k * 3 + 2]!;
        const o = e * LASH_N * 2 + k * 2;
        // Nâng theo độ nâng của mí ở cột này và không thấp hơn mép mắt (chỗ cao nhất của lề da mí) — dải mi vắt qua
        // nếp mép mắt hay góc khoé dốc vẫn nằm trên mặt mí thật.
        const u = a / W;
        lidEdges(p, u, E);
        const lift = lidLift(topOf(u), botOf(u), E.U, E.D);
        for (let s = 0; s < 2; s++) {
          const d = s === 0 ? -1 : 1;
          const pa = a - ty * hw * d;
          const pb = b + tx * hw * d;
          surfInto(ch, pa, pb, Math.max(lidOff(pa, pb), EYE.base + EYE.lidGap) + lift + EYE.lashGap, this.hp, o + s, this.hn);
        }
      }
    }
  }

  dispose(): void {
    this.lid.dispose();
    this.lash.dispose();
  }
}

/**
 * Kênh `i` còn gần giá trị đã ghi (sai khác < 1e-3) → true; khác → ghi giá trị mới, trả false. Nối các kênh bằng && —
 * có kênh đổi thì dựng lại (hình lệch tối đa 1e-3 theo mỗi kênh, không đáng kể).
 */
function near(last: Float32Array, i: number, v: number): boolean {
  if (Math.abs(v - last[i]!) < 1e-3) return true;
  last[i] = v;
  return false;
}

/** Thêm tứ giác a-b-c-d vào `idx`, lật cho pháp tuyến hình học cùng chiều pháp tuyến lưu ở đỉnh a. */
function quadOriented(pos: Float32Array, nrm: Float32Array, idx: number[], a: number, b: number, c: number, d: number): void {
  const ux = pos[c * 3]! - pos[a * 3]!;
  const uy = pos[c * 3 + 1]! - pos[a * 3 + 1]!;
  const uz = pos[c * 3 + 2]! - pos[a * 3 + 2]!;
  const vx = pos[d * 3]! - pos[b * 3]!;
  const vy = pos[d * 3 + 1]! - pos[b * 3 + 1]!;
  const vz = pos[d * 3 + 2]! - pos[b * 3 + 2]!;
  const dot = (uy * vz - uz * vy) * nrm[a * 3]! + (uz * vx - ux * vz) * nrm[a * 3 + 1]! + (ux * vy - uy * vx) * nrm[a * 3 + 2]!;
  if (dot >= 0) idx.push(a, b, c, a, c, d);
  else idx.push(a, d, c, a, c, b);
}

// ───────────────────────── Miệng (hình riêng từng nhân vật, cập nhật khi tham số đổi) ─────────────────────────

/**
 * Tham số miệng (đã làm mượt). Nét khép: nửa rộng mW, cong mCurve (> 0 cười, < 0 mếu), gợn sóng mWave, độ hiện mLine.
 * Miệng há: nửa rộng oW, mép trên phồng oUp, đáy sâu oDn, khoé cong lên oBow, lưỡi oTongue (0..1).
 */
interface MouthParams {
  mW: number;
  mCurve: number;
  mWave: number;
  mLine: number;
  oW: number;
  oUp: number;
  oDn: number;
  oBow: number;
  oTongue: number;
}

const M_CH = chartAt(0, MOUTH.h);
const ML_N = 13;
const MO_N = 11;
const MT_N = 9;
/** Nét miệng dày 5,2 mm; độ cao các lớp (cách nhau ≥ 1 mm, lòng miệng trên lớp đỏ mặt 1,4 mm): lòng miệng < lưỡi < nét khép. */
const M_TH = 0.0052;
const M_OFF = { line: 0.0048, open: 0.0026, tongue: 0.0037 } as const;

/** Miệng: nét khép (cười / mếu / gợn sóng), lòng miệng há (chữ D cười lớn, chữ o), lưỡi hồng. */
class Mouth {
  readonly line = new THREE.BufferGeometry();
  readonly open = new THREE.BufferGeometry();
  readonly tongue = new THREE.BufferGeometry();
  private readonly lp = new Float32Array(ML_N * 2 * 3);
  private readonly lnm = new Float32Array(ML_N * 2 * 3);
  private readonly op = new Float32Array(MO_N * 3 * 3);
  private readonly onm = new Float32Array(MO_N * 3 * 3);
  private readonly tp = new Float32Array(MT_N * 2 * 3);
  private readonly tnm = new Float32Array(MT_N * 2 * 3);
  private readonly last = new Float32Array(9).fill(NaN);
  private readonly all = [this.line, this.open, this.tongue] as const;

  constructor() {
    const geos: [THREE.BufferGeometry, Float32Array, Float32Array][] = [
      [this.line, this.lp, this.lnm],
      [this.open, this.op, this.onm],
      [this.tongue, this.tp, this.tnm],
    ];
    for (const [g, p, n] of geos) {
      g.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3).setUsage(THREE.DynamicDrawUsage));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, CY + MOUTH.h, 0.29), 0.08);
    }
    // Chỉ số dựng ở dáng không suy biến (cười há chữ D có lưỡi + nét cười).
    this.write({ mW: 0.02, mCurve: 0.008, mWave: 0, mLine: 1, oW: 0.03, oUp: 0.004, oDn: 0.03, oBow: 0.006, oTongue: 1 });
    const strip = (pos: Float32Array, nrm: Float32Array, cols: number, rows: number): number[] => {
      const idx: number[] = [];
      for (let i = 0; i < cols - 1; i++)
        for (let r = 0; r < rows - 1; r++) {
          const a = i * rows + r;
          quadOriented(pos, nrm, idx, a, a + rows, a + rows + 1, a + 1);
        }
      return idx;
    };
    this.line.setIndex(strip(this.lp, this.lnm, ML_N, 2));
    this.open.setIndex(strip(this.op, this.onm, MO_N, 3));
    this.tongue.setIndex(strip(this.tp, this.tnm, MT_N, 2));
  }

  update(p: MouthParams): void {
    const L = this.last;
    if (
      near(L, 0, p.mW) &&
      near(L, 1, p.mCurve) &&
      near(L, 2, p.mWave) &&
      near(L, 3, p.mLine) &&
      near(L, 4, p.oW) &&
      near(L, 5, p.oUp) &&
      near(L, 6, p.oDn) &&
      near(L, 7, p.oBow) &&
      near(L, 8, p.oTongue)
    )
      return;
    this.write(p);
    for (const g of this.all) {
      (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (g.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private write(p: MouthParams): void {
    // Nét khép: dải dọc y(u), đầu nét thon tròn.
    const th = M_TH * clamp(p.mLine, 0, 1);
    for (let k = 0; k < ML_N; k++) {
      const u = -1 + (2 * k) / (ML_N - 1);
      const x = u * p.mW;
      const hw = (th / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 6)));
      // Đạo hàm để dời mép theo pháp tuyến 2D của nét (nét cong / gợn vẫn đều bề dày).
      const y = p.mCurve * (u * u - 0.4) + p.mWave * Math.sin(2.5 * Math.PI * u);
      const dy = (2 * p.mCurve * u + p.mWave * 2.5 * Math.PI * Math.cos(2.5 * Math.PI * u)) / Math.max(1e-4, p.mW);
      const l = Math.hypot(1, dy);
      for (let s = 0; s < 2; s++) {
        const d = s === 0 ? -1 : 1;
        surfInto(M_CH, x - (dy / l) * hw * d, y + (1 / l) * hw * d, M_OFF.line, this.lp, k * 2 + s, this.lnm);
      }
    }
    // Lòng miệng: giữa mép trên top(u) và đáy bot(u), hai khoé gặp nhau.
    for (let k = 0; k < MO_N; k++) {
      const u = -Math.cos((Math.PI * k) / (MO_N - 1));
      const e = Math.sqrt(Math.max(0, 1 - u * u));
      const bow = p.oBow * (u * u - 0.3);
      const top = p.oUp * e + bow;
      const bot = -p.oDn * Math.pow(e, 0.85) + bow;
      const x = u * p.oW;
      surfInto(M_CH, x, top, M_OFF.open, this.op, k * 3, this.onm);
      surfInto(M_CH, x, (top + bot) / 2, M_OFF.open, this.op, k * 3 + 1, this.onm);
      surfInto(M_CH, x, bot, M_OFF.open, this.op, k * 3 + 2, this.onm);
    }
    // Lưỡi: gò tròn nhô lên từ đáy lòng miệng, không vượt mép trên.
    for (let k = 0; k < MT_N; k++) {
      const u = -0.72 * Math.cos((Math.PI * k) / (MT_N - 1));
      const e = Math.sqrt(Math.max(0, 1 - u * u));
      const bow = p.oBow * (u * u - 0.3);
      const top = p.oUp * e + bow;
      const bot = -p.oDn * Math.pow(e, 0.85) + bow + 0.0008 * e;
      const t = Math.max(bot, Math.min(top - 0.002, bot + p.oTongue * p.oDn * 0.6 * Math.sqrt(Math.max(0, 1 - (u / 0.72) ** 2))));
      const x = u * p.oW;
      surfInto(M_CH, x, bot, M_OFF.tongue, this.tp, k * 2, this.tnm);
      surfInto(M_CH, x, t, M_OFF.tongue, this.tp, k * 2 + 1, this.tnm);
    }
  }

  dispose(): void {
    this.line.dispose();
    this.open.dispose();
    this.tongue.dispose();
  }
}

// ───────────────────────── Biểu cảm → tham số đích ─────────────────────────

/** Mọi kênh của khuôn mặt (đích theo biểu cảm, được làm mượt mỗi khung hình). */
interface FaceParams extends MouthParams {
  /** Khép mắt theo biểu cảm (0 mở → 1 nhắm); chớp mắt cộng thêm riêng. */
  close: number;
  kCalm: number;
  kHappy: number;
  kLaugh: number;
  kCry: number;
  rest: number;
  slantIn: number;
  slantOut: number;
  low: number;
  /** Tròng co (ngạc nhiên). */
  small: number;
  /** Lông mày: nâng (m), xoay (> 0 đầu trong hạ — giận; < 0 đầu trong nhướn — buồn), dồn vào giữa (m), lệch (choáng). */
  bRaise: number;
  bTilt: number;
  bSlide: number;
  bAsym: number;
  /** Má hồng (0..1), đỏ mặt (0..1), nước mắt (0..1). */
  blush: number;
  flush: number;
  tears: number;
}

const BASE: Readonly<FaceParams> = {
  close: 0,
  kCalm: 1,
  kHappy: 0,
  kLaugh: 0,
  kCry: 0,
  rest: 0.07,
  slantIn: 0,
  slantOut: 0,
  low: 0,
  small: 0,
  bRaise: 0,
  bTilt: 0,
  bSlide: 0,
  bAsym: 0,
  mW: 0.02,
  mCurve: 0.008,
  mWave: 0,
  mLine: 1,
  oW: 0,
  oUp: 0,
  oDn: 0,
  oBow: 0,
  oTongue: 0,
  blush: 0.55,
  flush: 0,
  tears: 0,
};
const KEYS = Object.keys(BASE) as (keyof FaceParams)[];

/** Miệng khép (ẩn lòng miệng). */
const SHUT = { oW: 0, oUp: 0, oDn: 0, oBow: 0, oTongue: 0 } as const;
/** Miệng há (ẩn nét khép). */
const OPEN = { mLine: 0 } as const;

const EXPR_PARTS: Record<Expression, Partial<FaceParams>> = {
  // Mắt tròn long lanh, cười mỉm.
  neutral: {},
  // Mắt ^ ^, miệng chữ D nhỏ thấy chút lưỡi, má hồng hơn.
  happy: { ...OPEN, close: 1, kCalm: 0, kHappy: 1, bRaise: 0.006, oW: 0.023, oUp: 0.002, oDn: 0.018, oBow: 0.005, oTongue: 0.55, blush: 0.85 },
  // Mắt ^ nhắm tít, miệng há to có lưỡi.
  laugh: { ...OPEN, close: 1, kCalm: 0, kLaugh: 1, bRaise: 0.009, bTilt: -0.08, oW: 0.031, oUp: 0.003, oDn: 0.031, oBow: 0.007, oTongue: 1, blush: 1 },
  // Mắt nhắm cong hiền (∪), mỉm cười nhẹ.
  calm: { close: 1, bRaise: 0.002, bTilt: -0.06, mW: 0.016, mCurve: 0.0062, blush: 0.6 },
  // Hơi nheo mắt, mày chau nhẹ, miệng chúm chữ o nhỏ.
  focus: { ...OPEN, rest: 0.17, low: 0.22, bRaise: -0.004, bTilt: 0.18, bSlide: 0.003, oW: 0.0072, oUp: 0.0052, oDn: 0.0062, blush: 0.45 },
  // Đuôi mắt cụp, mày nhướn đầu trong, miệng mếu.
  sad: { rest: 0.1, slantOut: 0.34, bRaise: 0.003, bTilt: -0.34, mW: 0.016, mCurve: -0.0068, blush: 0.4 },
  // Nhắm tịt, nước mắt chảy, miệng mếu gợn sóng.
  cry: { close: 1, kCalm: 0, kCry: 1, bRaise: 0.004, bTilt: -0.4, mW: 0.022, mCurve: -0.0055, mWave: 0.0032, tears: 1, blush: 0.7 },
  // Mí xếch vào trong, mày chau, mặt đỏ, miệng mím xệ.
  angry: { rest: 0.08, slantIn: 0.44, low: 0.14, bRaise: -0.004, bTilt: 0.37, bSlide: 0.005, mW: 0.02, mCurve: -0.009, flush: 1, blush: 0.6 },
  // Mắt mở to tròng co, mày nhướn cao, miệng chữ o.
  surprised: { ...OPEN, rest: 0, small: 1, bRaise: 0.0095, bTilt: -0.05, oW: 0.012, oUp: 0.012, oDn: 0.014, blush: 0.5 },
  // Mắt xoáy (hoặc lờ đờ khi say vừa), mày lệch, miệng gợn sóng.
  dizzy: { rest: 0.1, bAsym: 1, mW: 0.02, mCurve: 0.001, mWave: 0.003, blush: 0.7 },
  // Mí sụp nửa chừng, mày chùng, miệng nhỏ.
  sleepy: { close: 0.6, bRaise: -0.002, bTilt: -0.1, mW: 0.012, mCurve: 0.002, blush: 0.5 },
};

const EXPR_T: Record<Expression, Readonly<FaceParams>> = (() => {
  const out = {} as Record<Expression, FaceParams>;
  for (const k of Object.keys(EXPR_PARTS) as Expression[]) {
    const p: FaceParams = { ...BASE, ...EXPR_PARTS[k] };
    // Miệng há thì tắt nét khép và ngược lại (giữ dáng nét để chuyển mượt).
    if (EXPR_PARTS[k].oDn === undefined) Object.assign(p, SHUT);
    out[k] = p;
  }
  return out;
})();

/** Kênh dùng lò xo (nảy nhẹ cho dễ thương) thay vì tiến dần đều. */
const SPRING_KEYS = new Set<keyof FaceParams>(['bRaise', 'bTilt', 'oUp', 'oDn']);

// ───────────────────────── Lắp khuôn mặt + chạy biểu cảm ─────────────────────────

const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);
/** Trục tâm sọ → tâm mày (xoay quanh trục qua tâm sọ thì nét vẫn nằm trên mặt sọ). */
const BROW_C = SIDES.map((s) => chartAt(s * BROW.x, BROW.h, s));
const BROW_AXIS = BROW_C.map((c) => new THREE.Vector3(c.cx, c.cy - CY, c.cz).normalize());
const BROW_R = Math.hypot(BROW_C[0]!.cx, BROW_C[0]!.cy - CY, BROW_C[0]!.cz);

const C_PINK = new THREE.Color('#ff8da1');
const C_RED = new THREE.Color('#ff4a5c');
const C_FLUSH = new THREE.Color('#ff3434');
const C_TEAR = new THREE.Color('#9fd8ff');

/** Lò xo cho kênh nảy: ω, ζ (vượt đích ~12%, ổn định sau ~0,2 giây). */
const SP_W = 26;
const SP_Z = 0.55;
/** Hằng thời gian làm mượt các kênh còn lại (≈ 93% sau 0,12 giây). */
const TAU_EXPR = 0.045;

let faceSeed = 0;

class Face implements FaceDriver {
  private readonly added: THREE.Object3D[] = [];
  private readonly lids = new Lids();
  private readonly mouth = new Mouth();
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly blushMat: THREE.MeshStandardMaterial;
  private readonly flushMat: THREE.MeshStandardMaterial;
  private readonly tearMat: THREE.MeshStandardMaterial;
  private readonly brows: Brows;
  private readonly dropGeo: Drops;
  private readonly irisLayers: THREE.Mesh[] = [];
  private readonly spiral = new Spiral();
  private readonly spiralMesh: THREE.Mesh;
  private readonly blush: THREE.Mesh;
  private readonly drops: THREE.Mesh;
  private readonly flush: THREE.Mesh;
  private readonly tears: THREE.Mesh;
  private readonly mLine: THREE.Mesh;
  private readonly mOpen: THREE.Mesh;
  private readonly mTongue: THREE.Mesh;
  private readonly dropPath: readonly Float32Array[];

  /** Kênh hiện tại / đích (dùng lại) / vận tốc lò xo. */
  private readonly P: FaceParams = { ...BASE };
  private readonly T: FaceParams = { ...BASE };
  private readonly V: FaceParams = { ...BASE };
  private readonly lidP: LidParams = { c: 0, kCalm: 1, kHappy: 0, kLaugh: 0, kCry: 0, rest: 0, slantIn: 0, slantOut: 0, low: 0 };
  private readonly mouthP: MouthParams = { mW: 0, mCurve: 0, mWave: 0, mLine: 0, oW: 0, oUp: 0, oDn: 0, oBow: 0, oTongue: 0 };
  private first = true;

  /** Chớp mắt: đồng hồ riêng, lúc chớp tới, thời điểm trong lần chớp (−1 = không chớp), có chớp đôi không. */
  private clock = 0;
  private nextBlink: number;
  private blinkT = -1;
  private blinkDouble = false;
  /** Mắt xoáy đang hiện; khép mí tạm (đổi kiểu mắt sau mí khép cho khỏi "nhảy hình"). */
  private spiralShown = false;
  private swapC = 0;
  private seed: number;

  private readonly tmpC = new THREE.Color();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly qc = new THREE.Quaternion();

  constructor(private readonly head: THREE.Group, look: AvatarLook, mat: MatFactory) {
    const G = sharedGeo();
    this.seed = (++faceSeed * 2654435761) >>> 0;
    for (let i = 0; i < 3; i++) this.rand();
    this.nextBlink = 0.8 + this.rand() * 3;
    this.skinMat = mat('skin', look.skin, { roughness: 0.6 });
    const browCol = look.hair !== 'bald' ? hairColorOf(look) : '#4a3122';

    // Sọ + tai + mũi: 1 mesh da (khoá 'skin' dùng chung với bàn tay — mặt không đổi màu khoá này).
    this.add(G.skull, this.skinMat, true);
    // Mắt: lòng trắng → tròng (texture con ngươi + vành nâu ấm) → 2 đốm sáng; mí da + viền mi đậm phủ lên trên.
    this.add(G.sclera, mat('sclera', '#fbfaf6', { roughness: 0.28 }));
    this.irisLayers.push(
      this.add(G.iris, mat('iris', '#ffffff', { roughness: 0.12, metalness: 0.05, map: irisTex() })),
      this.add(G.high, mat('eyeHi', '#ffffff', { roughness: 0.2, emissive: '#ffffff', ei: 0.9 })),
    );
    this.add(this.lids.lid, this.skinMat);
    this.add(this.lids.lash, mat('lash', '#2a1912', { roughness: 0.55 }));
    this.spiralMesh = this.add(this.spiral.geo, mat('eyeSpiral', '#2a1912', { roughness: 0.5 }));
    this.spiralMesh.visible = false;
    this.brows = new Brows(G.brow);
    this.add(this.brows.geo, mat('brow', browCol, { roughness: 0.75 }));
    // Miệng.
    this.mLine = this.add(this.mouth.line, mat('mouthLine', '#6e3226', { roughness: 0.6 }));
    this.mOpen = this.add(this.mouth.open, mat('mouthIn', '#5c1d20', { roughness: 0.55 }));
    this.mTongue = this.add(this.mouth.tongue, mat('tongue', '#ff8a8e', { roughness: 0.45 }));
    // Lớp dán trong suốt (màu tiến dần từ màu da → màu đích nên mờ dần không cần đổi độ trong).
    const tex = softTex();
    this.flushMat = mat('flush', '#ff3434', { transparent: true, opacity: 0.7, roughness: 0.6, map: tex });
    this.flush = this.add(G.flush, this.flushMat);
    this.flush.visible = false;
    this.tearMat = mat('tears', '#9fd8ff', { transparent: true, opacity: 0.85, roughness: 0.15, map: tex });
    this.tears = this.add(G.tears, this.tearMat);
    this.tears.visible = false;
    // Má hồng + lòng tai: 1 mesh, morph 'big' khi má ửng mạnh.
    this.blushMat = mat('blush', '#ff8da1', { transparent: true, opacity: 0.8, roughness: 0.6, map: tex });
    this.blush = this.add(G.blush, this.blushMat);
    const dropMat = mat('tearDrop', '#c4e9ff', { transparent: true, opacity: 0.85, roughness: 0.08, emissive: '#4aa8e8', ei: 0.25 });
    this.dropGeo = new Drops(G.drop);
    this.drops = this.add(this.dropGeo.geo, dropMat);
    this.drops.visible = false;
    this.dropPath = G.dropPath;
  }

  /** Gắn mesh vào đầu; chỉ sọ đổ bóng (nét mặt nhỏ thì không), mọi mesh nhận bóng. */
  private add(geo: THREE.BufferGeometry, m: THREE.Material, shadow = false): THREE.Mesh {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = shadow;
    o.receiveShadow = true;
    this.head.add(o);
    this.added.push(o);
    return o;
  }

  /** Số ngẫu nhiên 0..1 (riêng từng khuôn mặt → mỗi người chớp mắt một nhịp). */
  private rand(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  update(dt: number, time: number, expression: Expression, drunk: number): void {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0;
    const dk = clamp((drunk || 0) / 100, 0, 1);
    const P = this.P;
    const T = this.T;
    Object.assign(T, EXPR_T[expression] ?? EXPR_T.neutral);
    // Choáng: say vừa → mắt lờ đờ sụp mí; tỉnh mà vấp ngã / say khướt → mắt xoáy.
    const wantSpiral = expression === 'dizzy' && !(dk >= 0.5 && dk < 0.85);
    if (expression === 'dizzy' && !wantSpiral) {
      T.rest = 0.42;
      T.slantOut = 0.22;
      T.low = 0.1;
    }
    // Say: má đỏ hơn, ửng ngang mũi, mí nặng dần.
    T.blush = Math.min(1.4, T.blush + 0.85 * dk);
    T.flush = Math.max(T.flush, 0.55 * smooth(0.35, 1, dk));
    if (T.close < 0.5) T.rest = Math.min(0.6, T.rest + 0.3 * smooth(0.25, 0.85, dk));
    if (this.first) {
      Object.assign(P, T);
      for (const k of KEYS) this.V[k] = 0;
      this.spiralShown = wantSpiral;
      this.first = false;
    }
    this.smoothParams(dt);
    // Mí: khép theo biểu cảm, chớp mắt, hoặc khép tạm để đổi kiểu mắt.
    const blink = this.blink(dt, dk, expression === 'sleepy');
    const swapping = this.spiralShown !== wantSpiral;
    this.swapC += ((swapping ? 1 : 0) - this.swapC) * (1 - Math.exp(-dt / (swapping ? 0.025 : 0.035)));
    const c = clamp(Math.max(P.close, blink, this.swapC), 0, 1);
    if (swapping && c >= 0.97) this.spiralShown = wantSpiral;
    const L = this.lidP;
    L.c = c;
    L.kCalm = Math.max(0, P.kCalm);
    L.kHappy = Math.max(0, P.kHappy);
    L.kLaugh = Math.max(0, P.kLaugh);
    L.kCry = Math.max(0, P.kCry);
    L.rest = clamp(P.rest, 0, 0.9);
    L.slantIn = clamp(P.slantIn, 0, 1);
    L.slantOut = clamp(P.slantOut, 0, 1);
    L.low = clamp(P.low, 0, 1);
    this.lids.update(L);
    this.updateEyes(time);
    this.updateBrows(time);
    this.updateMouth();
    this.updateSkin(time, dk);
  }

  /** Làm mượt mọi kênh tới đích: lò xo (nảy nhẹ) cho mày + độ há miệng, còn lại tiến dần theo hàm mũ. */
  private smoothParams(dt: number): void {
    const P = this.P;
    const T = this.T;
    const V = this.V;
    const k = 1 - Math.exp(-dt / TAU_EXPR);
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (const key of KEYS) {
      if (!SPRING_KEYS.has(key)) {
        P[key] += (T[key] - P[key]) * k;
        continue;
      }
      let x = P[key];
      let v = V[key];
      for (let i = 0; i < n; i++) {
        v += (SP_W * SP_W * (T[key] - x) - 2 * SP_Z * SP_W * v) * h;
        x += v * h;
      }
      P[key] = x;
      V[key] = v;
    }
  }

  /** Độ khép do chớp mắt (0..1): mỗi 2,5–6 giây, đôi khi chớp đôi; không chớp khi mắt đang nhắm / đang đổi kiểu mắt. */
  private blink(dt: number, dk: number, sleepy: boolean): number {
    this.clock += dt;
    const sc = (1 + 1.3 * dk) * (sleepy ? 1.8 : 1);
    const tc = 0.065 * sc;
    const th = tc + 0.035 * sc;
    const end = th + 0.11 * sc;
    if (this.blinkT < 0) {
      if (this.clock < this.nextBlink) return 0;
      if (this.P.close > 0.7 || this.swapC > 0.05) {
        this.nextBlink = this.clock + 0.6 + this.rand();
        return 0;
      }
      this.blinkT = 0;
    }
    this.blinkT += dt;
    const t = this.blinkT;
    if (t >= end) {
      this.blinkT = -1;
      if (this.blinkDouble) {
        this.blinkDouble = false;
        this.nextBlink = this.clock + 0.09;
      } else {
        this.nextBlink = this.clock + (2.5 + this.rand() * 3.5) * (sleepy ? 1.4 : 1);
        this.blinkDouble = this.rand() < 0.2;
      }
      return 0;
    }
    return t < tc ? smooth(0, tc, t) : t < th ? 1 : 1 - smooth(th, end, t);
  }

  /** Tròng co khi ngạc nhiên (morph 'small'), đổi tròng ↔ mắt xoáy, xoáy quay đều. */
  private updateEyes(time: number): void {
    const small = clamp(this.P.small, 0, 1);
    const sp = this.spiralShown;
    for (const m of this.irisLayers) {
      m.visible = !sp;
      const inf = m.morphTargetInfluences;
      if (inf) inf[0] = small;
    }
    this.spiralMesh.visible = sp;
    if (sp) this.spiral.set((time * 5.5) % TAU);
  }

  /** Lông mày: xoay quanh tâm sọ (nâng / chau / dồn) nên luôn ôm mặt sọ; choáng thì hai bên lệch nhau, lắc lư. */
  private updateBrows(time: number): void {
    const P = this.P;
    const wob = P.bAsym * 0.0028;
    for (let e = 0; e < 2; e++) {
      const s = SIDES[e]!;
      const asym = P.bAsym * (e === 0 ? 0.006 : -0.004) + wob * Math.sin(time * 4.6 + e * 2.1);
      this.qa.setFromAxisAngle(AX_Y, (-s * P.bSlide) / BROW_R);
      this.qb.setFromAxisAngle(AX_X, -(P.bRaise + asym) / BROW_R);
      this.qc.setFromAxisAngle(BROW_AXIS[e]!, s * P.bTilt);
      this.brows.set(e, this.qa.multiply(this.qb).multiply(this.qc));
    }
  }

  /** Miệng: chặn độ há âm (lò xo vượt đích), ẩn phần không dùng. */
  private updateMouth(): void {
    const P = this.P;
    const M = this.mouthP;
    M.mW = Math.max(0.004, P.mW);
    M.mCurve = P.mCurve;
    M.mWave = P.mWave;
    M.mLine = clamp(P.mLine, 0, 1);
    M.oW = Math.max(0, P.oW);
    M.oUp = Math.max(0, P.oUp);
    M.oDn = Math.max(0, P.oDn);
    M.oBow = P.oBow;
    M.oTongue = clamp(P.oTongue, 0, 1);
    this.mouth.update(M);
    this.mLine.visible = M.mLine > 0.02;
    const open = M.oW > 0.002 && M.oUp + M.oDn > 0.0015;
    this.mOpen.visible = open;
    this.mTongue.visible = open && M.oTongue > 0.05;
  }

  /** Má hồng / đỏ mặt / nước mắt: màu tiến từ màu da → màu đích (mờ dần không cần đổi độ trong); giọt lệ trượt xuống. */
  private updateSkin(time: number, dk: number): void {
    const P = this.P;
    const skin = this.skinMat.color;
    const blush = clamp(P.blush, 0, 1);
    this.blushMat.color.copy(skin).lerp(this.tmpC.copy(C_PINK).lerp(C_RED, dk), blush);
    const bs = 0.25 * Math.max(0, P.blush - 0.7) + 0.15 * dk;
    this.blush.morphTargetInfluences![0] = clamp(bs / (BLUSH_BIG - 1), 0, 1);
    const fl = clamp(P.flush, 0, 1);
    this.flush.visible = fl > 0.01;
    if (this.flush.visible) this.flushMat.color.copy(skin).lerp(C_FLUSH, 0.85 * fl);
    const tr = clamp(P.tears, 0, 1);
    this.tears.visible = tr > 0.01;
    if (this.tears.visible) this.tearMat.color.copy(skin).lerp(C_TEAR, tr);
    const dropK = smooth(0.3, 1, tr);
    this.drops.visible = dropK > 0.01;
    if (!this.drops.visible) return;
    for (let e = 0; e < 2; e++) {
      // Trượt dọc dòng lệ 78% chu kỳ, rồi rơi khỏi má và nhỏ dần.
      const s = (((time * 0.5 + e * 0.47) % 1) + 1) % 1;
      const path = this.dropPath[e]!;
      if (s < 0.78) {
        const f = (s / 0.78) * (DROP_N - 1);
        const i = Math.min(DROP_N - 2, Math.floor(f));
        const t = f - i;
        const k = dropK * smooth(0, 0.1, s);
        this.dropGeo.set(e, mix(path[i * 3]!, path[i * 3 + 3]!, t), mix(path[i * 3 + 1]!, path[i * 3 + 4]!, t), mix(path[i * 3 + 2]!, path[i * 3 + 5]!, t), k);
      } else {
        const q = (s - 0.78) / 0.22;
        const j = (DROP_N - 1) * 3;
        this.dropGeo.set(e, path[j]!, path[j + 1]! - 0.05 * q * q, path[j + 2]! + 0.004 * q, dropK * (1 - q));
      }
    }
    this.dropGeo.commit();
  }

  dispose(): void {
    for (const o of this.added) o.removeFromParent();
    this.lids.dispose();
    this.mouth.dispose();
    this.brows.dispose();
    this.dropGeo.dispose();
    this.spiral.dispose();
  }
}

export const buildFace: BuildFace = (head, look, mat): FaceDriver => new Face(head, look, mat);
