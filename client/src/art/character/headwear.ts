// Đồ đội đầu ôm khít sọ (SKULL, rig.ts): tóc NPC (ngắn / dài / búi / xù — mái lọn nhọn, tóc mai ôm mặt, chừa tai), nón lá,
// mũ len, mũ chóp cao, mũ Tỳ Lư của Phương Trượng (5 cánh + chóp sen + 2 dải lụa đung đưa), kính râm. Mặt trong cách sọ
// (hoặc lớp tóc bên dưới) ~3 mm, không che mắt / mày. Hình chỉ phụ thuộc ngoại hình → dựng một lần, dùng chung giữa các
// nhân vật (không dispose); vật liệu lấy từ MatFactory riêng của từng nhân vật.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HairId, HatId } from '@shared/index';
import type { AvatarLook } from '../api';
import { SKULL, type BuildHeadwear, type Dangler, type MatFactory, type PartBuild } from './rig';

// ───────────────────────── Toán sọ ─────────────────────────

const CY = SKULL.cy;
const RX = SKULL.rx;
const RY = SKULL.ry;
const RZ = SKULL.rz;
const DEG = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;
/** Khe hở giữa mặt trong (tóc, mũ, quai) và mặt sọ / lớp tóc bên dưới. */
const GAP = 0.003;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** smoothstep (e0 > e1 thì đảo chiều). */
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
/** 1 tại c, giảm mượt về 0 khi cách c ≥ w. */
const bump = (x: number, c: number, w: number): number => 1 - smooth(0, w, Math.abs(x - c));
/** Góc về (−π, π]. */
const wrapPi = (a: number): number => a - TAU * Math.round(a / TAU);
/** θ (tính từ đỉnh) của điểm trên sọ ở độ cao h = y − cy. */
const thetaAtH = (h: number): number => Math.acos(clamp(h / RY, -1, 1));
/** Độ cao "cos": a + b·cosφ + c·cos2φ qua 3 mốc trước (φ = 0) / bên (90°) / sau (180°). */
function ring3(front: number, side: number, back: number, phi: number): number {
  const c = (front + back) / 4 - side / 2;
  const a = side + c;
  const b = (front - back) / 2;
  return a + b * Math.cos(phi) + c * Math.cos(2 * phi);
}

/** Điểm trên sọ ở tham số (φ: từ +Z quay sang +X; θ: từ đỉnh xuống), dời ra theo pháp tuyến `off` mét. */
function skullAt(phi: number, theta: number, off: number, out: THREE.Vector3): THREE.Vector3 {
  const st = Math.sin(theta);
  const ux = st * Math.sin(phi);
  const uy = Math.cos(theta);
  const uz = st * Math.cos(phi);
  const nx = ux / RX;
  const ny = uy / RY;
  const nz = uz / RZ;
  const k = off / Math.hypot(nx, ny, nz);
  return out.set(ux * RX + nx * k, CY + uy * RY + ny * k, uz * RZ + nz * k);
}

/** Pháp tuyến ngoài (đơn vị) của sọ ở tham số (φ, θ). */
function skullNormal(phi: number, theta: number, out: THREE.Vector3): THREE.Vector3 {
  const st = Math.sin(theta);
  return out.set((st * Math.sin(phi)) / RX, Math.cos(theta) / RY, (st * Math.cos(phi)) / RZ).normalize();
}

/** Tham số (φ, θ) gần đúng của điểm head-local (sọ gần cầu — đủ dùng lúc dựng). */
function paramOf(p: THREE.Vector3): [number, number] {
  const ux = p.x / RX;
  const uy = (p.y - CY) / RY;
  const uz = p.z / RZ;
  const l = Math.hypot(ux, uy, uz) || 1;
  return [Math.atan2(ux, uz), Math.acos(clamp(uy / l, -1, 1))];
}

const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
/** Đẩy điểm ra ngoài theo pháp tuyến sọ cho tới khi cách sọ ≥ need(φ, θ) (không kéo vào). */
function pushOut(p: THREE.Vector3, need: (phi: number, theta: number) => number): void {
  for (let k = 0; k < 3; k++) {
    const [phi, th] = paramOf(p);
    skullAt(phi, th, 0, _s);
    skullNormal(phi, th, _n);
    const d = need(phi, th) - _s.sub(p).negate().dot(_n);
    if (d <= 1e-5) return;
    p.addScaledVector(_n, d + 1e-4);
  }
}

// ───────────────────────── Dựng hình (dùng chung với handheld.ts) ─────────────────────────

/** Bộ gom đỉnh + tam giác; tam giác tự lật cho pháp tuyến cùng chiều `out` (hướng ra ngoài mong muốn). */
export class Buf {
  private readonly pos: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly d = new THREE.Vector3();

  v(p: THREE.Vector3, u = 0, w = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, w);
    return this.pos.length / 3 - 1;
  }

  private at(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!);
  }

  tri(a: number, b: number, c: number, out?: THREE.Vector3): void {
    if (out) {
      this.at(a, this.a);
      this.at(b, this.b).sub(this.a);
      this.at(c, this.c).sub(this.a);
      if (this.b.cross(this.c).dot(out) < 0) {
        this.idx.push(a, c, b);
        return;
      }
    }
    this.idx.push(a, b, c);
  }

  /** Tứ giác a-b-c-d (theo vòng). */
  quad(a: number, b: number, c: number, d: number, out?: THREE.Vector3): void {
    if (out) {
      this.at(c, this.c).sub(this.at(a, this.a));
      this.at(d, this.d).sub(this.at(b, this.b));
      if (this.c.cross(this.d).dot(out) < 0) {
        this.idx.push(a, d, c, a, c, b);
        return;
      }
    }
    this.idx.push(a, b, c, a, c, d);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

/** Gộp nhiều hình (chỉ giữ position/normal/uv, thêm index nếu thiếu) thành một; hình con bị dispose. */
export function merge(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((g) => {
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    return g;
  });
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('character: không gộp được hình');
  for (const g of parts) g.dispose();
  return m;
}

/** Hồ sơ tiện [bán kính, độ cao] → LatheGeometry. */
export function lathe(profile: readonly (readonly [number, number])[], segs: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

export interface SweepOpts {
  readonly sides: number;
  /** Bán kính theo s ∈ [0, 1] dọc đường. */
  readonly r: (s: number) => number;
  /** Hệ số mặt cắt theo trục N / B (dẹt). */
  readonly kn?: number;
  readonly kb?: number;
  /** Hướng tham chiếu cho trục N tại điểm p (vd pháp tuyến sọ); không có thì truyền song song từ `n0`. */
  readonly ref?: (p: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;
  readonly n0?: THREE.Vector3;
  readonly closed?: boolean;
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
}

/** Ống quét dọc polyline (mặt cắt elip `sides` cạnh, bán kính thay đổi) — dây, quai, gọng kính, khoen, lọn tóc. */
export function sweep(pts: readonly THREE.Vector3[], o: SweepOpts): THREE.BufferGeometry {
  const b = new Buf();
  const n = pts.length;
  const kn = o.kn ?? 1;
  const kb = o.kb ?? 1;
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  const rings: number[][] = [];
  const Ns: THREE.Vector3[] = [];
  const Bs: THREE.Vector3[] = [];
  const Ts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const a = pts[o.closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const c = pts[o.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    T.subVectors(c, a).normalize();
    if (o.ref) o.ref(p, N);
    else if (i === 0) {
      if (o.n0) N.copy(o.n0);
      else N.set(Math.abs(T.y) < 0.9 ? 0 : 1, Math.abs(T.y) < 0.9 ? 1 : 0, 0);
    }
    N.addScaledVector(T, -N.dot(T));
    if (N.lengthSq() < 1e-10) N.set(1, 0, 0).addScaledVector(T, -T.x);
    N.normalize();
    B.crossVectors(T, N);
    const s = o.closed ? i / n : i / Math.max(1, n - 1);
    const r = o.r(s);
    const ring: number[] = [];
    for (let k = 0; k < o.sides; k++) {
      const ang = (k / o.sides) * TAU;
      P.copy(p)
        .addScaledVector(N, Math.cos(ang) * r * kn)
        .addScaledVector(B, Math.sin(ang) * r * kb);
      ring.push(b.v(P, k / o.sides, s));
    }
    rings.push(ring);
    Ns.push(N.clone());
    Bs.push(B.clone());
    Ts.push(T.clone());
  }
  const out = new THREE.Vector3();
  const segs = o.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % n;
    const r0 = rings[i]!;
    const r1 = rings[i1]!;
    for (let k = 0; k < o.sides; k++) {
      const k1 = (k + 1) % o.sides;
      const ang = ((k + 0.5) / o.sides) * TAU;
      out
        .copy(Ns[i]!)
        .add(Ns[i1]!)
        .multiplyScalar(Math.cos(ang) * kb)
        .addScaledVector(Bs[i]!.clone().add(Bs[i1]!), Math.sin(ang) * kn);
      b.quad(r0[k]!, r0[k1]!, r1[k1]!, r1[k]!, out);
    }
  }
  const cap = (i: number, dir: number): void => {
    const c = b.v(pts[i]!);
    out.copy(Ts[i]!).multiplyScalar(dir);
    const ring = rings[i]!;
    for (let k = 0; k < o.sides; k++) b.tri(c, ring[k]!, ring[(k + 1) % o.sides]!, out);
  };
  if (!o.closed && o.capStart && o.r(0) > 0) cap(0, -1);
  if (!o.closed && o.capEnd && o.r(1) > 0) cap(n - 1, 1);
  return b.geometry();
}

/** Lấy mẫu đường cong Catmull-Rom (centripetal) qua các điểm. */
function curve(points: readonly THREE.Vector3[], count: number, closed = false): THREE.Vector3[] {
  return new THREE.CatmullRomCurve3(points.map((p) => p.clone()), closed, 'centripetal').getPoints(count);
}

/** Điều kiện "nằm ngoài sọ + lớp tóc": khoảng cần thiết theo hướng (φ, θ). */
type Support = (phi: number, theta: number) => number;

// ───────────────────────── Tóc ─────────────────────────

type HairStyle = Exclude<HairId, 'bald'>;
/** Mốc viền tóc: [φ độ (0 = giữa trán, 90 = tai trái +X, 180 = gáy), h = y − cy, 1 = ngọn lọn / 0 = chân lọn]. */
type Node = readonly [number, number, 0 | 1];

interface HairSpec {
  /** Viền tóc nửa trái φ 0 → 180 (nửa phải đối xứng gương), xen kẽ chân / ngọn lọn. */
  readonly nodes: readonly Node[];
  /** Dưới xích đạo sọ thì buông thẳng (tóc dài) thay vì ôm sọ. */
  readonly curtain: boolean;
  /** Độ dày tóc ở đỉnh / hai bên / ngọn lọn. */
  readonly tTop: number;
  readonly tSide: number;
  readonly tEdge: number;
  /** Mũ cạnh lọn (< 1: lọn phồng, ngọn nhọn). */
  readonly q: number;
  /** Rãnh giữa các lọn. */
  readonly crease: number;
  /** Đuôi tóc dài hất ra ngoài (hai bên / sau gáy). */
  readonly flareSide: number;
  readonly flareBack: number;
  /** Tóc dài phủ qua tai: nâng lớp tóc khỏi sọ quanh tai để không xuyên tai. */
  readonly tent: number;
  readonly rows: number;
}

// Viền tóc: ngọn mái ≥ h 0.16 (mày ở h ≈ 0.115–0.145), tóc mai trước tai ở φ ≤ 60°, vùng tai φ 72–106° h ≤ 0.09 để trống.
const SPECS: Record<HairStyle, HairSpec> = {
  short: {
    nodes: [
      [0, 0.18, 1],
      [9, 0.238, 0],
      [19, 0.173, 1],
      [29, 0.232, 0],
      [38, 0.162, 1],
      [46, 0.214, 0],
      [57, -0.03, 1],
      [70, 0.118, 0],
      [86, 0.1, 1],
      [104, 0.118, 0],
      [118, -0.06, 1],
      [131, -0.03, 0],
      [145, -0.15, 1],
      [158, -0.1, 0],
      [170, -0.16, 1],
      [180, -0.12, 0],
    ],
    curtain: false,
    tTop: 0.048,
    tSide: 0.022,
    tEdge: 0.01,
    q: 0.7,
    crease: 0.012,
    flareSide: 0,
    flareBack: 0,
    tent: 0,
    rows: 8,
  },
  long: {
    nodes: [
      [0, 0.185, 1],
      [9, 0.24, 0],
      [19, 0.177, 1],
      [29, 0.235, 0],
      [38, 0.165, 1],
      [46, 0.218, 0],
      [57, -0.14, 1],
      [67, -0.04, 0],
      [79, -0.18, 1],
      [92, -0.11, 0],
      [106, -0.2, 1],
      [120, -0.14, 0],
      [135, -0.23, 1],
      [149, -0.17, 0],
      [164, -0.25, 1],
      [180, -0.19, 0],
    ],
    curtain: true,
    tTop: 0.045,
    tSide: 0.024,
    tEdge: 0.011,
    q: 0.7,
    crease: 0.01,
    flareSide: 0.022,
    flareBack: 0.04,
    tent: 0.05,
    rows: 10,
  },
  bun: {
    nodes: [
      [0, 0.255, 0],
      [12, 0.19, 1],
      [25, 0.245, 0],
      [37, 0.178, 1],
      [48, 0.222, 0],
      [58, 0.07, 1],
      [70, 0.125, 0],
      [86, 0.105, 1],
      [104, 0.125, 0],
      [118, 0.0, 1],
      [131, 0.035, 0],
      [146, -0.06, 1],
      [160, -0.025, 0],
      [172, -0.075, 1],
      [180, -0.045, 0],
    ],
    curtain: false,
    tTop: 0.028,
    tSide: 0.017,
    tEdge: 0.008,
    q: 0.7,
    crease: 0.008,
    flareSide: 0,
    flareBack: 0,
    tent: 0,
    rows: 8,
  },
  spiky: {
    nodes: [
      [0, 0.172, 1],
      [10, 0.25, 0],
      [21, 0.166, 1],
      [31, 0.245, 0],
      [41, 0.152, 1],
      [49, 0.222, 0],
      [59, -0.01, 1],
      [71, 0.122, 0],
      [86, 0.09, 1],
      [104, 0.122, 0],
      [118, -0.07, 1],
      [130, -0.015, 0],
      [143, -0.16, 1],
      [156, -0.07, 0],
      [168, -0.175, 1],
      [180, -0.08, 0],
    ],
    curtain: false,
    tTop: 0.04,
    tSide: 0.022,
    tEdge: 0.01,
    q: 0.55,
    crease: 0.014,
    flareSide: 0,
    flareBack: 0,
    tent: 0,
    rows: 8,
  },
};

interface Col {
  readonly phi: number;
  /** Tham số viền (θ trên sọ; tóc dài: > π/2 là phần buông, tụt (θ − π/2)·RY mét). */
  readonly tb: number;
  /** 0 = chân lọn (rãnh) → 1 = ngọn lọn. */
  readonly lock: number;
}

/** Mô hình lớp tóc: viền lọn theo góc, độ dày theo vị trí, mặt ngoài (dùng cho mũ/kính đội lên trên). */
class HairModel {
  readonly cols: Col[] = [];

  constructor(readonly spec: HairSpec) {
    const half = spec.nodes;
    const ring: { phi: number; t: number; tip: boolean }[] = [];
    for (const [p, h, tip] of half) ring.push({ phi: p * DEG, t: this.tOf(h), tip: tip === 1 });
    for (let i = half.length - 2; i >= 1; i--) {
      const [p, h, tip] = half[i]!;
      ring.push({ phi: TAU - p * DEG, t: this.tOf(h), tip: tip === 1 });
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const pb = i + 1 === ring.length ? b.phi + TAU : b.phi;
      // Lấy mẫu đều theo θ (bước ≤ 11°): dây cung ngắn → mép lọn / mặt tóc không cắt vào sọ ở đoạn viền dốc (mái → tóc mai).
      // Cùng đường cong lọn t = a + (b − a)·s^q, chỉ đổi chỗ lấy mẫu: s = u^(1/q).
      const n = clamp(Math.ceil(Math.abs(b.t - a.t) / (11 * DEG)), 2, 8);
      for (let k = 0; k < n; k++) {
        const u = k / n;
        let s: number;
        let lock: number;
        if (!a.tip && b.tip) {
          s = Math.pow(u, 1 / spec.q);
          lock = s;
        } else if (a.tip && !b.tip) {
          s = 1 - Math.pow(1 - u, 1 / spec.q);
          lock = 1 - s;
        } else {
          s = u;
          lock = a.tip ? 1 : 0;
        }
        this.cols.push({ phi: mix(a.phi, pb, s), tb: mix(a.t, b.t, u), lock });
      }
    }
  }

  /** Tham số viền của mốc ở độ cao h. */
  tOf(h: number): number {
    return this.spec.curtain && h < 0 ? HALF_PI - h / RY : thetaAtH(h);
  }

  /** Nâng tóc qua tai (tóc dài). */
  tent(phi: number, t: number): number {
    const s = this.spec;
    return s.tent > 0 ? s.tent * bump(Math.abs(wrapPi(phi)), HALF_PI, 42 * DEG) * smooth(58 * DEG, 86 * DEG, t) : 0;
  }

  /** Độ dày tóc ở tham số t, hàng v (0 đỉnh → 1 viền), vị trí trong lọn. */
  thick(t: number, v: number, lock: number): number {
    const s = this.spec;
    const base = mix(s.tTop, s.tSide, smooth(0.2, 1.45, t));
    const th = mix(s.tEdge, base, smooth(1, 0.72, v));
    const crease = s.crease * (1 - smooth(0, 0.55, lock)) * smooth(0.35, 0.9, v);
    return Math.max(s.tEdge * 0.5, th - crease);
  }

  /** Điểm tóc ở tham số (φ, t) cách sọ `off` (phần buông của tóc dài: thả thẳng từ xích đạo + hất đuôi). */
  point(phi: number, t: number, off: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.spec;
    if (!s.curtain || t <= HALF_PI) return skullAt(phi, t, off, out);
    const drop = (t - HALF_PI) * RY;
    skullAt(phi, HALF_PI, off, out);
    out.y -= drop;
    const a = Math.abs(wrapPi(phi));
    const fl = mix(s.flareSide, s.flareBack, smooth(80 * DEG, 150 * DEG, a)) * smooth(62 * DEG, 76 * DEG, a);
    const f = fl * Math.pow(smooth(0.02, 0.27, drop), 2);
    const nx = Math.sin(phi) / RX;
    const nz = Math.cos(phi) / RZ;
    const l = Math.hypot(nx, nz);
    out.x += (nx / l) * f;
    out.z += (nz / l) * f;
    return out;
  }

  /** Viền + vị trí lọn nội suy ở góc φ (ghi vào `_edge`). */
  private edgeAt(phi: number): void {
    const cols = this.cols;
    const p = ((phi % TAU) + TAU) % TAU;
    let i = 0;
    while (i < cols.length - 1 && cols[i + 1]!.phi <= p) i++;
    const a = cols[i]!;
    const b = cols[(i + 1) % cols.length]!;
    const pb = i + 1 === cols.length ? b.phi + TAU : b.phi;
    const f = (p - a.phi) / Math.max(1e-6, pb - a.phi);
    _edge.tb = mix(a.tb, b.tb, f);
    _edge.lock = mix(a.lock, b.lock, f);
  }

  /** Mặt ngoài tóc cách sọ bao nhiêu theo hướng sọ (φ, θ); 0 nếu ngoài vùng tóc (chỉ tính phần ôm sọ). */
  outerAt(phi: number, theta: number): number {
    this.edgeAt(phi);
    if (theta > _edge.tb) return 0;
    const t = Math.min(theta, HALF_PI);
    return GAP + this.tent(phi, t) + this.thick(t, theta / _edge.tb, _edge.lock);
  }

  /** Như outerAt nhưng lấy max trong lân cận ~3 cm (mũ, quai, gọng kính đi êm qua các lọn). */
  envelope(phi: number, theta: number): number {
    let m = this.outerAt(phi, theta);
    const st = Math.max(0.3, Math.sin(theta));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      m = Math.max(m, this.outerAt(phi + (Math.cos(a) * 0.1) / st, theta + Math.sin(a) * 0.1));
    }
    return m;
  }

  /** Lớp tóc: mặt ngoài (chung đỉnh), mép dày ở viền lọn, mặt trong phần buông (tóc dài). */
  shell(): THREE.BufferGeometry {
    const s = this.spec;
    const cols = this.cols;
    const n = cols.length;
    const R = s.rows;
    const b = new Buf();
    const P = new THREE.Vector3();
    const out = new THREE.Vector3();
    const vRow = (j: number): number => 1 - Math.pow(1 - j / R, 1.5);
    const phiNext = (i: number): number => (i + 1 === n ? cols[0]!.phi + TAU : cols[i + 1]!.phi);
    const top = b.v(this.point(0, 0, GAP + s.tTop, P));
    const grid: number[][] = [];
    for (const c of cols) {
      const col: number[] = [];
      for (let j = 1; j <= R; j++) {
        const v = vRow(j);
        const t = v * c.tb;
        col.push(b.v(this.point(c.phi, t, GAP + this.tent(c.phi, t) + this.thick(t, v, c.lock), P)));
      }
      grid.push(col);
    }
    for (let i = 0; i < n; i++) {
      const a = grid[i]!;
      const c = grid[(i + 1) % n]!;
      const pm = (cols[i]!.phi + phiNext(i)) / 2;
      const tbm = (cols[i]!.tb + cols[(i + 1) % n]!.tb) / 2;
      b.tri(top, a[0]!, c[0]!, out.set(0, 1, 0));
      for (let j = 0; j < R - 1; j++) {
        skullNormal(pm, Math.min(HALF_PI, ((vRow(j + 1) + vRow(j + 2)) / 2) * tbm), out);
        b.quad(a[j]!, c[j]!, c[j + 1]!, a[j + 1]!, out);
      }
    }
    // Mép lọn: mặt ngoài → mặt trong (cách sọ GAP), đỉnh riêng để cạnh sắc. Hướng ra ngoài = vuông góc viền, phía θ tăng.
    const eo: number[] = [];
    const ei: number[] = [];
    const edge: THREE.Vector3[] = [];
    for (const c of cols) {
      const offIn = GAP + this.tent(c.phi, c.tb);
      eo.push(b.v(this.point(c.phi, c.tb, offIn + this.thick(c.tb, 1, c.lock), P)));
      ei.push(b.v(this.point(c.phi, c.tb, offIn, P)));
      edge.push(this.point(c.phi, c.tb, offIn, new THREE.Vector3()));
    }
    const away: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const c = cols[i]!;
      const tb = edge[(i + 1) % n]!.clone().sub(edge[(i - 1 + n) % n]!);
      const offIn = GAP + this.tent(c.phi, c.tb);
      const dt = this.point(c.phi, c.tb + 0.02, offIn, new THREE.Vector3()).sub(edge[i]!);
      away.push(dt.addScaledVector(tb, -dt.dot(tb) / Math.max(1e-9, tb.lengthSq())));
    }
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      out.copy(away[i]!).add(away[i1]!);
      b.quad(eo[i]!, eo[i1]!, ei[i1]!, ei[i]!, out);
    }
    // Mặt trong phần tóc buông (tóc dài): nhìn từ dưới / sau lên không thấy rỗng.
    if (s.curtain) {
      const t0 = 80 * DEG;
      const inner: number[][] = [];
      for (const c of cols) {
        const col: number[] = [];
        for (let j = 0; j <= R; j++) {
          const t = vRow(j) * c.tb;
          col.push(t >= t0 ? b.v(this.point(c.phi, t, GAP + this.tent(c.phi, t), P)) : -1);
        }
        inner.push(col);
      }
      for (let i = 0; i < n; i++) {
        const a = inner[i]!;
        const c = inner[(i + 1) % n]!;
        const pm = (cols[i]!.phi + phiNext(i)) / 2;
        out.set(-Math.sin(pm), 0, -Math.cos(pm));
        for (let j = 0; j < R; j++) {
          if (a[j]! < 0 || c[j]! < 0 || a[j + 1]! < 0 || c[j + 1]! < 0) continue;
          b.quad(a[j]!, c[j]!, c[j + 1]!, a[j + 1]!, out);
        }
      }
    }
    return b.geometry();
  }
}

const _edge = { tb: 0, lock: 0 };
const models = new Map<HairStyle, HairModel>();
function hairModel(style: HairStyle): HairModel {
  let m = models.get(style);
  if (!m) {
    m = new HairModel(SPECS[style]);
    models.set(style, m);
  }
  return m;
}

/** Khoảng "an toàn" phía ngoài sọ theo hướng: lớp tóc (nếu có) + khe hở. */
function supportOf(hair: HairId): Support {
  if (hair === 'bald') return () => GAP;
  const m = hairModel(hair);
  return (phi, theta) => m.envelope(phi, theta) + GAP;
}

/** Màu tóc theo ngoại hình (giữ như bản cũ). face.ts có thể dùng cho lông mày. */
const HAIR_COLORS = ['#2b1d16', '#4a2f1f', '#1b1b1f', '#6a3f22'];
export function hairColorOf(look: AvatarLook): string {
  return HAIR_COLORS[(look.skin.length + look.hair.length) % HAIR_COLORS.length]!;
}

/** Búi tó sau đỉnh đầu: khối tròn xoắn (rãnh xoắn ốc) + dây buộc. */
function bunParts(model: HairModel): { bun: THREE.BufferGeometry; tie: THREE.BufferGeometry } {
  const phi = Math.PI;
  const theta = 36 * DEG;
  const R = 0.098;
  const nrm = skullNormal(phi, theta, new THREE.Vector3());
  const center = skullAt(phi, theta, R + 0.005, new THREE.Vector3());
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
  const bun = new THREE.SphereGeometry(R, 16, 12);
  const pos = bun.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x) + (v.y / R) * 2.2;
    const groove = Math.pow(0.5 + 0.5 * Math.cos(ang * 5), 4);
    const k = (1 - 0.055 * groove * (1 - Math.abs(v.y / R) * 0.6)) * (v.y > 0 ? 0.94 : 1);
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  bun.computeVertexNormals();
  bun.applyQuaternion(q);
  bun.translate(center.x, center.y, center.z);
  // Dây buộc ở chân búi, sát mặt tóc.
  const d0 = model.outerAt(phi, theta) + 0.006;
  const rc = R + 0.005 - d0;
  const ringR = Math.sqrt(Math.max(0.001, R * R - rc * rc)) - 0.002;
  const tie = new THREE.TorusGeometry(ringR, 0.011, 6, 18);
  tie.rotateX(HALF_PI);
  tie.applyQuaternion(q);
  const at = skullAt(phi, theta, d0 + 0.004, new THREE.Vector3());
  tie.translate(at.x, at.y, at.z);
  return { bun, tie };
}

/** Tóc xù: các mũi tóc nhọn cong ra sau / xuống. [φ°, θ°, dài, bán kính chân, độ cong (+ xuống / − ngược lên)]. */
const SPIKES: readonly (readonly [number, number, number, number, number])[] = [
  [0, 22, 0.1, 0.045, -0.45],
  [40, 28, 0.13, 0.05, 0.5],
  [-40, 28, 0.13, 0.05, 0.5],
  [92, 42, 0.11, 0.046, 0.65],
  [-92, 42, 0.11, 0.046, 0.65],
  [138, 32, 0.145, 0.052, 0.9],
  [-138, 32, 0.145, 0.052, 0.9],
  [180, 16, 0.155, 0.054, 0.95],
];

function spikeGeos(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const [pd, td, len, r0, bend] of SPIKES) {
    const phi = pd * DEG;
    const theta = td * DEG;
    const base = skullAt(phi, theta, 0.022, new THREE.Vector3());
    const n = skullNormal(phi, theta, new THREE.Vector3());
    // Hướng "xuống dốc đầu" (θ tăng) trên mặt tiếp tuyến.
    const down = skullAt(phi, theta + 0.05, 0.022, new THREE.Vector3()).sub(base);
    down.addScaledVector(n, -down.dot(n)).normalize();
    const side = new THREE.Vector3().crossVectors(n, down).normalize();
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const s = k / 5;
      pts.push(
        base
          .clone()
          .addScaledVector(n, len * s)
          .addScaledVector(down, len * bend * s * s * 0.75),
      );
    }
    out.push(sweep(pts, { sides: 6, r: (s) => r0 * Math.pow(1 - s, 0.9), kn: 1, kb: 0.62, ref: (_p, o) => o.copy(side) }));
  }
  return out;
}

/** Sợi tóc "ăng-ten" vểnh trên đỉnh (tóc ngắn) — đung đưa. Hình dựng quanh gốc (0, 0, 0). */
function ahogeGeo(): { geo: THREE.BufferGeometry; at: THREE.Vector3 } {
  const phi = 12 * DEG;
  const theta = 16 * DEG;
  const model = hairModel('short');
  const at = skullAt(phi, theta, model.outerAt(phi, theta) - 0.008, new THREE.Vector3());
  const n = skullNormal(phi, theta, new THREE.Vector3());
  const f = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
  const side = new THREE.Vector3().crossVectors(n, f).normalize();
  const key: readonly (readonly [number, number])[] = [
    [0, 0],
    [0.038, 0.004],
    [0.07, 0.02],
    [0.088, 0.048],
    [0.082, 0.078],
    [0.062, 0.092],
  ];
  const pts = curve(
    key.map(([a, b]) => new THREE.Vector3().addScaledVector(n, a).addScaledVector(f, b)),
    12,
  );
  return {
    geo: sweep(pts, { sides: 5, r: (s) => mix(0.012, 0.0018, Math.pow(s, 0.8)), kn: 1, kb: 0.4, ref: (_p, o) => o.copy(side) }),
    at,
  };
}

interface HairParts {
  readonly geo: THREE.BufferGeometry;
  readonly tie: THREE.BufferGeometry | null;
  readonly ahoge: { geo: THREE.BufferGeometry; at: THREE.Vector3 } | null;
}
const hairCache = new Map<string, HairParts>();

/** Tóc theo kiểu; `covered` (đội mũ) thì bỏ phần nhô lên đỉnh (búi, mũi xù, ăng-ten). */
function hairParts(style: HairStyle, covered: boolean): HairParts {
  const key = `${style}:${covered ? 1 : 0}`;
  let h = hairCache.get(key);
  if (h) return h;
  const model = hairModel(style);
  const parts = [model.shell()];
  let tie: THREE.BufferGeometry | null = null;
  if (!covered && style === 'bun') {
    const b = bunParts(model);
    parts.push(b.bun);
    tie = b.tie;
  }
  if (!covered && style === 'spiky') parts.push(...spikeGeos());
  h = {
    geo: parts.length > 1 ? merge(parts) : parts[0]!,
    tie,
    ahoge: !covered && style === 'short' ? ahogeGeo() : null,
  };
  hairCache.set(key, h);
  return h;
}

// ───────────────────────── Mũ len ─────────────────────────

/** Mũ len: thân đan (gân dọc, phồng nhẹ sau đỉnh) + vành gập gân to + quả bông. */
function beanieParts(hair: HairId): { body: THREE.BufferGeometry; band: THREE.BufferGeometry; pom: THREE.BufferGeometry } {
  const sup = supportOf(hair);
  const haired = hair !== 'bald';
  // Mép dưới vành: trước trên mày, hai bên trên tai, sau thấp xuống gáy.
  const hLow = (phi: number): number => (haired ? ring3(0.205, 0.115, 0.035, phi) : ring3(0.165, 0.105, 0.02, phi));
  const NC = 40;
  const P = new THREE.Vector3();
  const out = new THREE.Vector3();
  // Vành gập: [lùi θ, dày thêm] từ mép dưới lên.
  const BAND: readonly (readonly [number, number])[] = [
    [0, 0],
    [-0.012, 0.016],
    [-0.035, 0.03],
    [-0.13, 0.03],
    [-0.152, 0.02],
    [-0.162, 0.008],
  ];
  const bb = new Buf();
  const bandGrid: number[][] = [];
  for (let i = 0; i < NC; i++) {
    const phi = (i / NC) * TAU;
    const t0 = thetaAtH(hLow(phi));
    const col: number[] = [];
    for (let j = 0; j < BAND.length; j++) {
      const [dt, add] = BAND[j]!;
      const t = t0 + dt;
      const rib = (j === 2 || j === 3) && i % 2 === 1 ? -0.006 : 0;
      col.push(bb.v(skullAt(phi, t, sup(phi, t) + add + rib, P)));
    }
    bandGrid.push(col);
  }
  for (let i = 0; i < NC; i++) {
    const a = bandGrid[i]!;
    const c = bandGrid[(i + 1) % NC]!;
    const pm = ((i + 0.5) / NC) * TAU;
    for (let j = 0; j < BAND.length - 1; j++) {
      // Lật đúng chiều: mép dưới hướng xuống, mặt ngoài hướng ra, mép trên hướng lên.
      const t = thetaAtH(hLow(pm)) + (BAND[j]![0] + BAND[j + 1]![0]) / 2;
      skullNormal(pm, t, out);
      if (j === 0) out.y -= 1.2;
      if (j === BAND.length - 2) out.y += 1.2;
      bb.quad(a[j]!, c[j]!, c[j + 1]!, a[j + 1]!, out);
    }
  }
  // Thân mũ: từ dưới mép trên của vành lên đỉnh.
  const ROWS = 6;
  const body = new Buf();
  const bodyOff = (phi: number, t: number): number => sup(phi, t) + 0.012 + 0.022 * smooth(1.0, 0.15, t) * (0.55 - 0.45 * Math.cos(phi));
  const top = body.v(skullAt(0, 0, bodyOff(Math.PI, 0), P));
  const grid: number[][] = [];
  for (let i = 0; i < NC; i++) {
    const phi = (i / NC) * TAU;
    const tEnd = thetaAtH(hLow(phi)) - 0.145;
    const col: number[] = [];
    for (let j = 1; j <= ROWS; j++) {
      const t = (j / ROWS) * tEnd;
      const rib = i % 2 === 1 && j > 1 ? -0.0022 : 0;
      col.push(body.v(skullAt(phi, t, bodyOff(phi, t) + rib, P)));
    }
    grid.push(col);
  }
  for (let i = 0; i < NC; i++) {
    const a = grid[i]!;
    const c = grid[(i + 1) % NC]!;
    const pm = ((i + 0.5) / NC) * TAU;
    body.tri(top, a[0]!, c[0]!, out.set(0, 1, 0));
    for (let j = 0; j < ROWS - 1; j++) {
      skullNormal(pm, ((j + 1.5) / ROWS) * thetaAtH(hLow(pm)), out);
      body.quad(a[j]!, c[j]!, c[j + 1]!, a[j + 1]!, out);
    }
  }
  // Quả bông xù trên đỉnh (lún nhẹ vào thân mũ).
  const pom = new THREE.SphereGeometry(0.062, 12, 8);
  const pp = pom.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pp.count; i++) {
    v.fromBufferAttribute(pp, i).normalize();
    const lump = 1 + 0.09 * Math.sin(v.x * 11 + v.y * 7) * Math.sin(v.z * 9 - v.y * 5) + 0.05 * Math.sin(v.x * 23 + v.z * 19);
    v.multiplyScalar(0.062 * lump);
    pp.setXYZ(i, v.x, v.y, v.z);
  }
  pom.computeVertexNormals();
  const pc = skullAt(Math.PI, 0.12, bodyOff(Math.PI, 0.12) + 0.045, new THREE.Vector3());
  pom.translate(pc.x, pc.y, pc.z);
  return { body: body.geometry(), band: bb.geometry(), pom };
}

// ───────────────────────── Mũ chóp cao (VIP) ─────────────────────────

/** Mũ chóp cao mini đội lệch: vành cong hai bên, thân hơi loe, dải vàng. Đáy vành cắt mặt "đỡ" (sọ/tóc) đúng ở mép lỗ đội. */
function topHatParts(hair: HairId): { hat: THREE.BufferGeometry; band: THREE.BufferGeometry } {
  const sup = supportOf(hair);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0.15));
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const ez = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const C = new THREE.Vector3(0, CY, 0);
  const P = new THREE.Vector3();
  const NA = 36;
  /** Một điểm trong mặt phẳng vành (toạ độ phẳng x, z) có nằm trong mặt đỡ không. */
  const inside = (o: THREE.Vector3, x: number, z: number): boolean => {
    P.copy(o).addScaledVector(ex, x).addScaledVector(ez, z);
    const [phi, th] = paramOf(P);
    skullAt(phi, th, sup(phi, th), _s);
    return P.distanceTo(C) < _s.distanceTo(C);
  };
  /** Bán kính lỗ đội theo từng góc (mặt phẳng vành ∩ mặt đỡ), quanh tâm (cx, cz) của mặt phẳng ở độ nâng `lift`. */
  const radii = (lift: number, cx: number, cz: number): number[] => {
    const o = C.clone().addScaledVector(axis, lift);
    const rs: number[] = [];
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * TAU;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      let lo = 0;
      let hi = 0.42;
      if (!inside(o, cx, cz)) {
        rs.push(0);
        continue;
      }
      for (let it = 0; it < 26; it++) {
        const m = (lo + hi) / 2;
        if (inside(o, cx + dx * m, cz + dz * m)) lo = m;
        else hi = m;
      }
      rs.push(hi);
    }
    return rs;
  };
  const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
  // Nâng tới khi lỗ đội trung bình ≈ 0.17 (mũ nhỏ ngự trên đỉnh đầu), rồi canh tâm vành theo lỗ.
  let lo = 0.1;
  let hi = 0.45;
  let cx = 0;
  let cz = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let it = 0; it < 30; it++) {
      const m = (lo + hi) / 2;
      if (mean(radii(m, cx, cz)) > 0.17) lo = m;
      else hi = m;
    }
    const rs = radii(hi, cx, cz);
    let sx = 0;
    let sz = 0;
    for (let k = 0; k < NA; k++) {
      const a = (k / NA) * TAU;
      sx += Math.sin(a) * rs[k]!;
      sz += Math.cos(a) * rs[k]!;
    }
    cx += (2 * sx) / NA;
    cz += (2 * sz) / NA;
    // Chỉ nới khoảng dò cho lượt sau — lượt cuối giữ nguyên `hi` (nới cả lượt cuối thì vành nằm trên đỉnh, lỗ đội = 0).
    if (pass === 0) {
      lo = hi - 0.05;
      hi += 0.05;
    }
  }
  const lift = hi;
  const open = radii(lift, cx, cz);
  const crownR = Math.max(0.19, Math.max(...open) + 0.008);
  const M = new THREE.Matrix4().compose(C.clone().addScaledVector(axis, lift).addScaledVector(ex, cx).addScaledVector(ez, cz), q, new THREE.Vector3(1, 1, 1));
  // Vành: mép trong = lỗ đội, mép ngoài elip (rộng hai bên, cong vểnh lên).
  const BX = 0.29;
  const BZ = 0.255;
  const TH = 0.012;
  const curl = (a: number, r: number, rout: number): number => 0.04 * Math.pow(clamp((r - crownR) / (rout - crownR), 0, 1), 2) * Math.pow(Math.sin(a), 2);
  const brim = new Buf();
  const RING = 4;
  const topIdx: number[][] = [];
  const botIdx: number[][] = [];
  const out = new THREE.Vector3();
  for (let k = 0; k < NA; k++) {
    const a = (k / NA) * TAU;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const rout = 1 / Math.hypot(dx / BX, dz / BZ);
    const tcol: number[] = [];
    const bcol: number[] = [];
    for (let j = 0; j <= RING; j++) {
      const r = mix(open[k]!, rout, j / RING);
      const y = curl(a, r, rout);
      bcol.push(brim.v(P.set(dx * r, y, dz * r)));
      const rt = mix(Math.max(open[k]!, crownR - 0.01), rout, j / RING);
      tcol.push(brim.v(P.set(dx * rt, curl(a, rt, rout) + TH, dz * rt)));
    }
    topIdx.push(tcol);
    botIdx.push(bcol);
  }
  for (let k = 0; k < NA; k++) {
    const k1 = (k + 1) % NA;
    for (let j = 0; j < RING; j++) {
      brim.quad(topIdx[k]![j]!, topIdx[k1]![j]!, topIdx[k1]![j + 1]!, topIdx[k]![j + 1]!, out.set(0, 1, 0));
      brim.quad(botIdx[k]![j]!, botIdx[k1]![j]!, botIdx[k1]![j + 1]!, botIdx[k]![j + 1]!, out.set(0, -1, 0));
    }
    const a = ((k + 0.5) / NA) * TAU;
    brim.quad(topIdx[k]![RING]!, topIdx[k1]![RING]!, botIdx[k1]![RING]!, botIdx[k]![RING]!, out.set(Math.sin(a), 0, Math.cos(a)));
  }
  const crown = lathe(
    [
      [crownR - 0.004, TH * 0.5],
      [crownR, TH + 0.004],
      [crownR * 1.025, 0.13],
      [crownR * 1.06, 0.255],
      [crownR * 1.06 - 0.012, 0.266],
      [crownR * 0.5, 0.272],
      [0, 0.273],
    ],
    32,
  );
  const hat = merge([brim.geometry(), crown]);
  hat.applyMatrix4(M);
  const band = lathe(
    [
      [crownR * 1.004 + 0.002, TH + 0.002],
      [crownR * 1.006 + 0.0045, TH + 0.008],
      [crownR * 1.012 + 0.0045, TH + 0.048],
      [crownR * 1.014 + 0.002, TH + 0.054],
    ],
    32,
  );
  // Khoá nhỏ bên trái dải.
  const buckle = new THREE.BoxGeometry(0.012, 0.05, 0.03);
  buckle.translate(crownR * 1.01 + 0.007, TH + 0.031, 0);
  const bandAll = merge([band, buckle]);
  bandAll.applyMatrix4(M);
  return { hat, band: bandAll };
}

// ───────────────────────── Nón lá ─────────────────────────

const NONLA = { R: 0.43, H: 0.29, th: 0.007, tilt: -0.2 } as const;

/** Nón lá: mặt ngoài 6 vòng nan (gờ bậc), sống lá theo chiều dọc, vành cuộn, mặt trong; quai ôm má qua cằm. */
function nonLaParts(hair: HairId): { cone: THREE.BufferGeometry; strap: THREE.BufferGeometry | null } {
  const sup = supportOf(hair);
  const { R, H, th, tilt } = NONLA;
  const slope = H / R;
  const thV = th * Math.sqrt(1 + slope * slope);
  const coneY = (r: number): number => H * (1 - r / R);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0));
  const qi = q.clone().invert();
  const C = new THREE.Vector3(0, CY, 0);
  // Hạ nón theo trục tới khi mặt trong vừa chạm mặt đỡ (sọ / tóc + khe).
  let lift = -Infinity;
  const P = new THREE.Vector3();
  for (let ti = 0; ti <= 44; ti++) {
    const theta = ti * 2.25 * DEG;
    for (let pi = 0; pi < 64; pi++) {
      const phi = (pi / 64) * TAU;
      skullAt(phi, theta, sup(phi, theta), P)
        .sub(C)
        .applyQuaternion(qi);
      const r = Math.hypot(P.x, P.z);
      if (r > R - 0.03) continue;
      lift = Math.max(lift, P.y - (coneY(r) - thV));
    }
  }
  lift += 0.0012;
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const M = new THREE.Matrix4().compose(C.clone().addScaledVector(axis, lift), q, new THREE.Vector3(1, 1, 1));
  // Mặt ngoài: từng dải giữa hai vòng nan, mép dưới mỗi dải nhô ra (gờ) → thấy rõ vòng nan.
  const RINGS = [0, 0.07, 0.14, 0.21, 0.28, 0.355, R];
  const NC = 32;
  const LIP = 0.0032;
  const nrm = (a: number, out: THREE.Vector3): THREE.Vector3 => out.set(slope * Math.sin(a), 1, slope * Math.cos(a)).normalize();
  const b = new Buf();
  const N = new THREE.Vector3();
  const out = new THREE.Vector3();
  const apex = b.v(P.set(0, H, 0));
  for (let k = 0; k < RINGS.length - 1; k++) {
    const r0 = RINGS[k]!;
    const r1 = RINGS[k + 1]!;
    const lipped = k < RINGS.length - 2;
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU;
      // Sống lá: cột lẻ nhô nhẹ.
      const leaf = i % 2 === 1 ? 0.0014 : 0;
      nrm(a, N);
      if (k > 0) upper.push(b.v(P.set(Math.sin(a) * r0, coneY(r0), Math.cos(a) * r0).addScaledVector(N, leaf * (r0 / R))));
      lower.push(
        b.v(
          P.set(Math.sin(a) * r1, coneY(r1), Math.cos(a) * r1)
            .addScaledVector(N, (lipped ? LIP : 0) + leaf * (r1 / R)),
        ),
      );
    }
    for (let i = 0; i < NC; i++) {
      const i1 = (i + 1) % NC;
      nrm(((i + 0.5) / NC) * TAU, out);
      if (k === 0) b.tri(apex, lower[i]!, lower[i1]!, out);
      else b.quad(upper[i]!, upper[i1]!, lower[i1]!, lower[i]!, out);
    }
    // Gờ: mặt bậc nhỏ từ mép nhô xuống mặt dải dưới.
    if (lipped) {
      const step: number[] = [];
      for (let i = 0; i < NC; i++) {
        const a = (i / NC) * TAU;
        step.push(b.v(P.set(Math.sin(a) * r1, coneY(r1), Math.cos(a) * r1)));
      }
      for (let i = 0; i < NC; i++) {
        const i1 = (i + 1) % NC;
        const a = ((i + 0.5) / NC) * TAU;
        out.set(Math.sin(a), -slope * 1.5, Math.cos(a));
        b.quad(lower[i]!, lower[i1]!, step[i1]!, step[i]!, out);
      }
    }
  }
  // Mặt trong (dưới nón).
  const IN = [0.05, 0.16, 0.29, R - 0.012];
  const inner: number[][] = [];
  for (const r of IN) {
    const row: number[] = [];
    for (let i = 0; i < NC; i++) {
      const a = (i / NC) * TAU;
      row.push(b.v(P.set(Math.sin(a) * r, coneY(r) - thV, Math.cos(a) * r)));
    }
    inner.push(row);
  }
  const innerTop = b.v(P.set(0, coneY(0.05) - thV + 0.004, 0));
  for (let i = 0; i < NC; i++) {
    const i1 = (i + 1) % NC;
    nrm(((i + 0.5) / NC) * TAU, out).negate();
    b.tri(innerTop, inner[0]![i]!, inner[0]![i1]!, out);
    for (let j = 0; j < IN.length - 1; j++) b.quad(inner[j]![i]!, inner[j]![i1]!, inner[j + 1]![i1]!, inner[j + 1]![i]!, out);
  }
  // Vành cuộn + chóp nón.
  const rim = new THREE.TorusGeometry(R - 0.004, 0.0085, 5, NC);
  rim.rotateX(HALF_PI);
  rim.translate(0, -0.003, 0);
  const tip = lathe(
    [
      [0, H - 0.01],
      [0.012, H - 0.004],
      [0.01, H + 0.008],
      [0, H + 0.016],
    ],
    8,
  );
  const cone = merge([b.geometry(), rim, tip]);
  cone.applyMatrix4(M);
  // Quai: từ mặt trong nón (trước tai) xuống má, vòng dưới cằm; tóc dài buông che hai bên thì bỏ quai.
  let strap: THREE.BufferGeometry | null = null;
  if (hair === 'bald' || !SPECS[hair].curtain) {
    const hang = (side: number): THREE.Vector3 => {
      const a = side * 62 * DEG;
      const r = 0.3;
      return new THREE.Vector3(Math.sin(a) * r, coneY(r) - thV - 0.0025, Math.cos(a) * r).applyMatrix4(M);
    };
    const on = (phiDeg: number, h: number): THREE.Vector3 => {
      const phi = phiDeg * DEG;
      const t = thetaAtH(h);
      return skullAt(phi, t, sup(phi, t) + 0.004, new THREE.Vector3());
    };
    const ctrl = [hang(1), on(73, 0.04), on(63, -0.09), on(40, -0.162), on(0, -0.185), on(-40, -0.162), on(-63, -0.09), on(-73, 0.04), hang(-1)];
    const pts = curve(ctrl, 44);
    for (const p of pts) pushOut(p, (phi, t) => sup(phi, t) + 0.0035);
    strap = sweep(pts, {
      sides: 4,
      r: () => 0.0048,
      kn: 0.38,
      kb: 1,
      ref: (p, o) => {
        const [phi, t] = paramOf(p);
        return skullNormal(phi, t, o);
      },
    });
  }
  return { cone, strap };
}

// ───────────────────────── Mũ Tỳ Lư (Phương Trượng) ─────────────────────────

/** Mép dưới đai mũ: trước trên mày, hai bên trên tai, sau thấp. */
const crownLow = (phi: number): number => ring3(0.172, 0.118, 0.088, phi);
/** Mặt cắt đai: [lùi θ từ mép dưới, dày thêm] — gờ hạt cườm hai mép. */
const CROWN_BAND: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.016, 0.012],
  [-0.036, 0.016],
  [-0.125, 0.016],
  [-0.145, 0.012],
  [-0.162, 0],
];
const BAND_OUT = 0.016;
/** Cánh: [φ°, cao, rộng]. Cánh giữa lớn nhất, nhỏ dần ra hai bên. */
const PETALS: readonly (readonly [number, number, number])[] = [
  [0, 0.175, 0.135],
  [36, 0.16, 0.125],
  [-36, 0.16, 0.125],
  [72, 0.14, 0.112],
  [-72, 0.14, 0.112],
];

/** Nửa bề rộng cánh (tỉ lệ) theo độ cao tương đối v ∈ [0, 1]: cổ hẹp → phình → nhọn đầu, 3 thuỳ mỗi bên. */
function petalHalf(v: number): number {
  const s = v < 0.42 ? mix(0.62, 1, Math.sin((HALF_PI * v) / 0.42)) : (1 - (v - 0.42) / 0.58) * (1 + 1.2 * ((v - 0.42) / 0.58));
  const lobes = v < 0.86 ? 1 - 0.07 * Math.pow(1 - Math.abs(Math.sin(3 * Math.PI * v)), 2) : 1;
  return Math.max(0, s * lobes);
}

interface CrownParts {
  readonly gold: THREE.BufferGeometry;
  readonly red: THREE.BufferGeometry;
  readonly ribbons: { geo: THREE.BufferGeometry; at: THREE.Vector3; phi: number }[];
}

function crownParts(hair: HairId): CrownParts {
  const sup = supportOf(hair);
  const NC = 40;
  const P = new THREE.Vector3();
  const out = new THREE.Vector3();
  // Đai vàng ôm sọ.
  const band = new Buf();
  const grid: number[][] = [];
  for (let i = 0; i < NC; i++) {
    const phi = (i / NC) * TAU;
    const t0 = thetaAtH(crownLow(phi));
    grid.push(CROWN_BAND.map(([dt, add]) => band.v(skullAt(phi, t0 + dt, sup(phi, t0 + dt) + add, P))));
  }
  for (let i = 0; i < NC; i++) {
    const a = grid[i]!;
    const c = grid[(i + 1) % NC]!;
    const pm = ((i + 0.5) / NC) * TAU;
    const t0 = thetaAtH(crownLow(pm));
    for (let j = 0; j < CROWN_BAND.length - 1; j++) {
      skullNormal(pm, t0 + (CROWN_BAND[j]![0] + CROWN_BAND[j + 1]![0]) / 2, out);
      if (j === 0) out.y -= 1.2;
      if (j === CROWN_BAND.length - 2) out.y += 1.2;
      band.quad(a[j]!, c[j]!, c[j + 1]!, a[j + 1]!, out);
    }
  }
  const gold: THREE.BufferGeometry[] = [band.geometry()];
  const red: THREE.BufferGeometry[] = [];
  /** Bán kính ngang của mặt ngoài đai ở độ cao y (head-local), hướng φ (dò θ để điểm đã dời theo pháp tuyến đúng độ cao). */
  const Q = new THREE.Vector3();
  const bandR = (phi: number, y: number): number => {
    let t = thetaAtH(y - CY);
    for (let k = 0; k < 3; k++) {
      skullAt(phi, t, sup(phi, t) + BAND_OUT, Q);
      t = clamp(t + (Q.y - y) / RY, 0.01, Math.PI - 0.01);
    }
    skullAt(phi, t, sup(phi, t) + BAND_OUT, Q);
    return Math.hypot(Q.x, Q.z);
  };
  for (const [pd, H, W] of PETALS) {
    const phiP = pd * DEG;
    const lean = 0.06;
    const tLow = thetaAtH(crownLow(phiP));
    const y0 = skullAt(phiP, tLow - 0.014, 0, P).y;
    const r0 = bandR(phiP, y0);
    const yTop = skullAt(phiP, tLow - 0.162, 0, P).y;
    const layer = (u: number, v: number, d: 'front' | 'back' | 'red' | 'emblem', o: THREE.Vector3): THREE.Vector3 => {
      const y = y0 + v * Math.cos(lean);
      const rMid = r0 + 0.0055 - v * Math.sin(lean);
      const ang = phiP + u / r0;
      let r: number;
      if (d === 'front') r = rMid + 0.0045;
      else if (d === 'red') r = rMid + 0.0057;
      else if (d === 'emblem') r = rMid + 0.006;
      else {
        // Mặt sau phần dưới bám sát đai (khối chân cánh), phía trên mỏng.
        r = rMid - 0.0045;
        const w = smooth(yTop + 0.012, yTop - 0.004, y);
        if (w > 0) r = mix(r, Math.min(r, bandR(ang, Math.min(y, yTop)) - 0.0015), w);
      }
      return o.set(Math.sin(ang) * r, y, Math.cos(ang) * r);
    };
    // Viền ngoài cánh (vàng) và lòng cánh (đỏ).
    const V = [0, 0.05, 0.11, 0.17, 0.23, 0.3, 0.37, 0.44, 0.52, 0.6, 0.68, 0.76, 0.83, 0.9, 0.96];
    const outline: THREE.Vector2[] = [];
    for (const v of V) outline.push(new THREE.Vector2(W * 0.5 * petalHalf(v), v * H));
    outline.push(new THREE.Vector2(0, H));
    for (let k = V.length - 1; k >= 0; k--) outline.push(new THREE.Vector2(-W * 0.5 * petalHalf(V[k]!), V[k]! * H));
    const inset: THREE.Vector2[] = [];
    const VI = [0.02, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.85];
    for (const v of VI) inset.push(new THREE.Vector2(Math.max(0.004, W * 0.5 * petalHalf(v) - 0.012), v * H));
    inset.push(new THREE.Vector2(0, 0.91 * H));
    for (let k = VI.length - 1; k >= 0; k--) inset.push(new THREE.Vector2(-Math.max(0.004, W * 0.5 * petalHalf(VI[k]!) - 0.012), VI[k]! * H));
    const fn = new THREE.Vector3(Math.sin(phiP), Math.sin(lean), Math.cos(phiP)).normalize();
    // Khung vàng: mặt trước + mặt sau + thành viền.
    const pb = new Buf();
    const tris = THREE.ShapeUtils.triangulateShape(outline, []);
    const front = outline.map((p) => pb.v(layer(p.x, p.y, 'front', P)));
    const back = outline.map((p) => pb.v(layer(p.x, p.y, 'back', P)));
    for (const [a, b, c] of tris) {
      pb.tri(front[a]!, front[b]!, front[c]!, fn);
      pb.tri(back[a]!, back[b]!, back[c]!, out.copy(fn).negate());
    }
    const sideF = outline.map((p) => pb.v(layer(p.x, p.y, 'front', P)));
    const sideB = outline.map((p) => pb.v(layer(p.x, p.y, 'back', P)));
    const ctr = layer(0, H * 0.45, 'front', new THREE.Vector3());
    for (let k = 0; k < outline.length; k++) {
      const k1 = (k + 1) % outline.length;
      layer((outline[k]!.x + outline[k1]!.x) / 2, (outline[k]!.y + outline[k1]!.y) / 2, 'front', out).sub(ctr);
      out.addScaledVector(fn, -out.dot(fn));
      pb.quad(sideF[k]!, sideF[k1]!, sideB[k1]!, sideB[k]!, out);
    }
    gold.push(pb.geometry());
    // Lòng cánh đỏ.
    const rb = new Buf();
    const rt = THREE.ShapeUtils.triangulateShape(inset, []);
    const ri = inset.map((p) => rb.v(layer(p.x, p.y, 'red', P)));
    for (const [a, b, c] of rt) rb.tri(ri[a]!, ri[b]!, ri[c]!, fn);
    red.push(rb.geometry());
    // Huy hiệu vàng nhỏ (hào quang + nụ) giữa lòng cánh.
    const em = lathe(
      [
        [0, 0.0085],
        [0.007, 0.0078],
        [0.012, 0.0045],
        [0.0175, 0.0032],
        [0.021, 0.0012],
        [0.022, 0],
      ],
      8,
    );
    em.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), fn));
    const ep = layer(0, H * 0.46, 'emblem', new THREE.Vector3());
    em.translate(ep.x, ep.y, ep.z);
    gold.push(em);
  }
  // Chóp sen vàng trên đỉnh: chân cong ôm sọ, đài sen 5 cánh, nụ nhọn.
  const tTop = sup(0, 0);
  const base = (r: number): number => RY * (Math.sqrt(1 - (r / RX) ** 2) - 1) + 0.0004;
  const fin = lathe(
    [
      [0, 0],
      [0.022, base(0.022)],
      [0.04, base(0.04)],
      [0.047, base(0.047) + 0.004],
      [0.044, 0.01],
      [0.03, 0.016],
      [0.034, 0.026],
      [0.026, 0.036],
      [0.012, 0.041],
      [0.02, 0.054],
      [0.018, 0.068],
      [0.01, 0.08],
      [0, 0.094],
    ],
    15,
  );
  const fp = fin.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) {
    const y = fp.getY(i);
    if (y > 0.012 && y < 0.04) {
      const k = 1 + 0.16 * Math.cos(5 * Math.atan2(fp.getZ(i), fp.getX(i)));
      fp.setXYZ(i, fp.getX(i) * k, y, fp.getZ(i) * k);
    }
  }
  fin.computeVertexNormals();
  fin.translate(0, CY + RY + tTop, 0);
  gold.push(fin);
  // Hai dải lụa sau gáy (đung đưa) + nút vàng chỗ buộc.
  const ribbons: CrownParts['ribbons'] = [];
  for (const side of [1, -1]) {
    const phi = side * 152 * DEG;
    const t = thetaAtH(crownLow(phi)) - 0.02;
    const at = skullAt(phi, t, sup(phi, t) + BAND_OUT + 0.006, new THREE.Vector3());
    const knot = new THREE.SphereGeometry(0.014, 10, 8);
    knot.scale(1.25, 0.9, 0.8);
    knot.rotateY(phi);
    knot.translate(at.x, at.y, at.z);
    gold.push(knot);
    ribbons.push({ geo: ribbonGeo(), at, phi });
  }
  return { gold: merge(gold), red: merge(red), ribbons };
}

/** Dải lụa dẹt treo từ gốc (0, 0, 0) xuống −Y, lượn nhẹ, đuôi xẻ chữ V (bề ngang theo X, phồng theo Z). */
function ribbonGeo(): THREE.BufferGeometry {
  const L = 0.2;
  const W = 0.034;
  const ROWS = 9;
  const b = new Buf();
  const P = new THREE.Vector3();
  const rows: number[][] = [];
  for (let j = 0; j <= ROWS; j++) {
    const s = j / ROWS;
    const y = -L * s;
    const z = 0.012 * Math.sin(s * Math.PI * 1.6) * s;
    const w = W * (0.75 + 0.25 * s);
    const notch = j === ROWS ? 0.028 : 0;
    rows.push([b.v(P.set(-w / 2, y, z)), b.v(P.set(0, y + notch, z + 0.002)), b.v(P.set(w / 2, y, z))]);
  }
  const out = new THREE.Vector3(0, 0, 1);
  for (let j = 0; j < ROWS; j++) {
    const a = rows[j]!;
    const c = rows[j + 1]!;
    b.quad(a[0]!, a[1]!, c[1]!, c[0]!, out);
    b.quad(a[1]!, a[2]!, c[2]!, c[1]!, out);
  }
  return b.geometry();
}

// ───────────────────────── Kính râm ─────────────────────────

/** Kính râm: 2 tròng cong theo mặt (cách sọ ≥ 3 cm), gọng viền, cầu mũi, càng kính ôm ra sau về phía tai. */
function glassesParts(hair: HairId): { lens: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  const sup = supportOf(hair);
  const LENS = 0.031;
  const phiC = 21.5 * DEG;
  const hC = 0.044;
  const aOut = 15.5 * DEG;
  const aIn = 13 * DEG;
  const bTop = 0.05;
  const bBot = 0.052;
  const NS = 16;
  /** Viền tròng (tròng trái, x' > 0 là phía ngoài) theo góc a: siêu elip — trên phẳng, dưới tròn. */
  const rim = (a: number, f: number, side: number, off: number, o: THREE.Vector3): THREE.Vector3 => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / (sa > 0 ? 4.2 : 2.6));
    const y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / (sa > 0 ? 4.2 : 2.6));
    const phi = side * (phiC + f * x * (x > 0 ? aOut : aIn));
    const h = hC + f * y * (y > 0 ? bTop : bBot);
    return skullAt(phi, thetaAtH(h), off, o);
  };
  const lens = new Buf();
  const frame: THREE.BufferGeometry[] = [];
  const P = new THREE.Vector3();
  const out = new THREE.Vector3();
  const nRef = (p: THREE.Vector3, o: THREE.Vector3): THREE.Vector3 => {
    const [phi, t] = paramOf(p);
    return skullNormal(phi, t, o);
  };
  for (const side of [1, -1]) {
    const c = lens.v(skullAt(side * phiC, thetaAtH(hC), LENS, P));
    const r1: number[] = [];
    const r2: number[] = [];
    for (let k = 0; k < NS; k++) {
      const a = (k / NS) * TAU;
      r1.push(lens.v(rim(a, 0.55, side, LENS, P)));
      r2.push(lens.v(rim(a, 1, side, LENS, P)));
    }
    skullNormal(side * phiC, thetaAtH(hC), out);
    for (let k = 0; k < NS; k++) {
      const k1 = (k + 1) % NS;
      lens.tri(c, r1[k]!, r1[k1]!, out);
      lens.quad(r1[k]!, r1[k1]!, r2[k1]!, r2[k]!, out);
    }
    const loop: THREE.Vector3[] = [];
    const NL = 24;
    for (let k = 0; k < NL; k++) loop.push(rim((k / NL) * TAU, 1, side, LENS + 0.001, new THREE.Vector3()));
    frame.push(sweep(loop, { sides: 4, r: () => 0.0055, closed: true, ref: nRef }));
    // Càng kính: từ góc ngoài tròng ôm ra sau, thấp dần về phía tai (vượt qua lớp tóc nếu có).
    const start = rim(0.18, 1, side, LENS + 0.001, new THREE.Vector3());
    const [p0] = paramOf(start);
    const ARM: THREE.Vector3[] = [start];
    const K = 9;
    for (let k = 1; k <= K; k++) {
      const s = k / K;
      const phi = mix(p0, side * 75 * DEG, s);
      const h = mix(0.07, 0.061, s);
      const t = thetaAtH(h);
      const want = Math.max(mix(LENS, 0.0085, smooth(0, 0.75, s)), sup(phi, t) + 0.0075);
      ARM.push(skullAt(phi, t, want, new THREE.Vector3()));
    }
    // Làm mượt độ cách (tránh gãy khúc khi vượt qua mép tóc).
    const arm = curve(ARM, 18);
    for (const p of arm) pushOut(p, (phi, t) => sup(phi, t) + 0.0075);
    frame.push(sweep(arm, { sides: 4, r: () => 0.0042, kn: 1, kb: 1.25, ref: nRef, capEnd: true }));
  }
  // Cầu mũi.
  const br: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) {
    const s = k / 6;
    const phi = mix(phiC - aIn * 0.93, -(phiC - aIn * 0.93), s);
    const h = hC + 0.018 + 0.012 * Math.sin(Math.PI * s);
    br.push(skullAt(phi, thetaAtH(h), LENS + 0.002 + 0.002 * Math.sin(Math.PI * s), new THREE.Vector3()));
  }
  frame.push(sweep(br, { sides: 4, r: () => 0.0048, ref: nRef }));
  return { lens: lens.geometry(), frame: merge(frame) };
}

// ───────────────────────── Lắp vào đầu ─────────────────────────

type HatKind = HatId | 'crown';
const hatCache = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  let v = hatCache.get(key) as T | undefined;
  if (v === undefined) {
    v = make();
    hatCache.set(key, v);
  }
  return v;
}

const GOLD = { metalness: 0.45, roughness: 0.38, emissive: '#b8862f', ei: 0.25 } as const;

export const buildHeadwear: BuildHeadwear = (look: AvatarLook, head: THREE.Group, mat: MatFactory): PartBuild => {
  const added: THREE.Object3D[] = [];
  const danglers: Dangler[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, shadow: boolean, parent: THREE.Object3D = head): THREE.Mesh => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = shadow;
    o.receiveShadow = shadow;
    parent.add(o);
    if (parent === head) added.push(o);
    return o;
  };
  const dangle = (at: THREE.Vector3, gain: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.copy(at);
    head.add(g);
    added.push(g);
    danglers.push({ obj: g, gain });
    return g;
  };
  const hat: HatKind = look.isHost ? 'crown' : look.outfit.hat;
  const hair = look.hair;
  if (hair !== 'bald') {
    const h = hairParts(hair, hat !== 'none');
    const hm = mat('hair', hairColorOf(look), { roughness: 0.5 });
    add(h.geo, hm, true);
    if (h.tie) add(h.tie, mat('hairTie', look.accent ?? '#ff6f91', { roughness: 0.45 }), false);
    if (h.ahoge) add(h.ahoge.geo, hm, false, dangle(h.ahoge.at, 1.4));
  }
  switch (hat) {
    case 'crown': {
      const c = cached(`crown:${hair}`, () => crownParts(hair));
      add(c.gold, mat('gold', '#ffd166', GOLD), true);
      add(c.red, mat('crownRed', '#c8432f', { roughness: 0.55 }), false);
      const rm = mat('crownRibbon', '#d24a36', { roughness: 0.6, doubleSide: true });
      for (const r of c.ribbons) {
        const g = dangle(r.at, 1);
        // Hướng dải: mặt phẳng tiếp tuyến với gáy, chếch ra sau / ra ngoài một chút.
        const inner = new THREE.Group();
        inner.rotation.set(-0.3, r.phi, -Math.sign(r.phi) * 0.12, 'YXZ');
        g.add(inner);
        add(r.geo, rm, false, inner);
      }
      break;
    }
    case 'non_la': {
      const n = cached(`non_la:${hair}`, () => nonLaParts(hair));
      add(n.cone, mat('nonla', '#ead39a', { roughness: 0.82 }), true);
      if (n.strap) add(n.strap, mat('nonlaStrap', look.accent ?? '#c0392b', { roughness: 0.6 }), false);
      break;
    }
    case 'mu_len': {
      const b = cached(`mu_len:${hair}`, () => beanieParts(hair));
      add(b.body, mat('beanie', '#d9483c', { roughness: 0.95 }), true);
      // Vành + quả bông cùng màu kem: gộp một lưới (bớt 1 lần vẽ); gộp không được thì để riêng.
      const trim = cached(`mu_len_trim:${hair}`, () => mergeGeometries([b.band, b.pom], false) ?? false);
      if (trim) add(trim, mat('beanieBand', '#f6f1e6', { roughness: 0.97 }), true);
      else {
        add(b.band, mat('beanieBand', '#f3efe4', { roughness: 0.95 }), true);
        add(b.pom, mat('pompom', '#fffaf0', { roughness: 1 }), true);
      }
      break;
    }
    case 'mu_vip': {
      const t = cached(`mu_vip:${hair}`, () => topHatParts(hair));
      add(t.hat, mat('tophat', '#1d1d24', { roughness: 0.45 }), true);
      add(t.band, mat('gold', '#ffd166', GOLD), false);
      break;
    }
    case 'none':
      break;
  }
  if (look.outfit.accessory === 'kinh_ram') {
    const g = cached(`kinh_ram:${hair}`, () => glassesParts(hair));
    add(g.lens, mat('lens', '#141418', { roughness: 0.12, metalness: 0.6 }), false);
    add(g.frame, mat('glassFrame', '#1b1b1f', { roughness: 0.35, metalness: 0.2 }), false);
  }
  return {
    sitMorph: [],
    danglers,
    dispose() {
      for (const o of added) o.removeFromParent();
    },
  };
};
