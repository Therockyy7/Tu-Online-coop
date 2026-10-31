// Tượng Phật ngồi thiền bằng đá xanh xám (dựng theo ảnh mẫu): hàm khoảng cách (SDF) chia 4 phần, mỗi phần một lưới
// với độ mịn riêng — đầu (tóc xoắn ốc, nhục kế, mặt, tai dài), tay chân (bàn tay ấn thiền, bàn chân ngửa), thân (cà sa
// phủ hai vai hở ngực, 5 nếp chữ U trước bụng, nếp áo dọc tay, vạt áo rủ trước bệ), bệ sen (mặt bệ chạm lá, cánh sen
// tròn hai lớp, viền thừng xoắn, đế hai tầng). Thuần toán (không phụ thuộc three) để chạy trong Web Worker: Surface Nets
// thưa chỉ tính các khối quanh bề mặt; pháp tuyến từ gradient; AO + vân đá nướng vào màu đỉnh.
// Đơn vị: cao toàn tượng 3,62 (đáy bệ y = 0, mặt bệ 0,70, đỉnh nhục kế 3,62); mặt tượng nhìn +Z; +X là bên TRÁI tượng.

export interface BuddhaMeshData {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint32Array;
}

export type BuddhaPart = 'head' | 'limbs' | 'body' | 'drape' | 'base';
/** Thứ tự dựng (phần nặng trước) — mỗi phần một Web Worker. */
export const BUDDHA_PARTS: readonly BuddhaPart[] = ['body', 'head', 'base', 'limbs', 'drape'];

type V3 = [number, number, number];
type Sdf = (x: number, y: number, z: number) => number;

const { sqrt, abs, min, max, sin, cos, atan2, asin, round, floor } = Math;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ───────────────────────── Khối cơ bản ─────────────────────────

function smin(a: number, b: number, k: number): number {
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}
function smax(a: number, b: number, k: number): number {
  const h = max(k - abs(a - b), 0) / k;
  return max(a, b) + h * h * k * 0.25;
}
/** Khoét mềm: bỏ phần `b` khỏi `a`. */
const carve = (a: number, b: number, k: number): number => smax(a, -b, k);

function sph(x: number, y: number, z: number, cx: number, cy: number, cz: number, r: number): number {
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Elip xấp xỉ (Inigo Quilez) — đủ chính xác cho ghép mềm. */
function ell(x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const ax = (x - cx) / rx;
  const ay = (y - cy) / ry;
  const az = (z - cz) / rz;
  const k0 = sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx;
  const by = ay / ry;
  const bz = az / rz;
  const k1 = sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
}

/** Con nhộng thuôn (bán kính đổi từ ra tới rb dọc đoạn a→b). */
function cap(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number): number {
  const pax = x - ax;
  const pay = y - ay;
  const paz = z - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}

/** Trụ tròn bo cạnh quanh trục Y: `r` = khoảng cách tới trục, đoạn [y0, y1], bán kính R, bo cạnh rr. */
function roundCyl(r: number, y: number, R: number, y0: number, y1: number, rr: number): number {
  const qx = r - (R - rr);
  const qy = abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - rr);
  const ox = max(qx, 0);
  const oy = max(qy, 0);
  return sqrt(ox * ox + oy * oy) + min(max(qx, qy), 0) - rr;
}

/** Khoảng cách tới hộp bao (0 nếu ở trong) — để bỏ qua nhanh khối ở xa. */
function boxDist(x: number, y: number, z: number, b: Float64Array): number {
  const dx = max(b[0]! - x, 0, x - b[3]!);
  const dy = max(b[1]! - y, 0, y - b[4]!);
  const dz = max(b[2]! - z, 0, z - b[5]!);
  return sqrt(dx * dx + dy * dy + dz * dz);
}

/** Đường gờ/rãnh: chuỗi đoạn con nhộng qua các điểm [x, y, z, r], có hộp bao để bỏ qua nhanh. */
class Chain {
  readonly p: Float64Array;
  readonly box = new Float64Array(6);
  constructor(points: readonly (readonly number[])[]) {
    this.p = Float64Array.from(points.flat());
    this.box.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    for (const q of points) {
      const r = q[3]!;
      for (let a = 0; a < 3; a++) {
        this.box[a] = min(this.box[a]!, q[a]! - r);
        this.box[a + 3] = max(this.box[a + 3]!, q[a]! + r);
      }
    }
  }
  d(x: number, y: number, z: number): number {
    const far = boxDist(x, y, z, this.box);
    if (far > 0.09) return far;
    const p = this.p;
    let best = Infinity;
    for (let i = 0; i + 4 < p.length; i += 4) {
      const v = cap(x, y, z, p[i]!, p[i + 1]!, p[i + 2]!, p[i + 4]!, p[i + 5]!, p[i + 6]!, p[i + 3]!, p[i + 7]!);
      if (v < best) best = v;
    }
    return best;
  }
}

/** Đặt một điểm (x, y) lên bề mặt nhìn từ phía trước (+Z): dò từ ngoài vào theo −Z rồi chia đôi. */
function projZ(f: Sdf, x: number, y: number, lift: number, zFrom = 1.7): number {
  let z = zFrom;
  let prev = f(x, y, z);
  for (; z > -1.2; z -= 0.004) {
    const v = f(x, y, z - 0.004);
    if (v < 0 && prev >= 0) {
      let lo = z - 0.004;
      let hi = z;
      for (let i = 0; i < 18; i++) {
        const m = (lo + hi) / 2;
        if (f(x, y, m) < 0) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2 + lift;
    }
    prev = v;
  }
  return 0;
}

/**
 * Gờ mềm (nếp vải) dọc một đường nằm trên bề mặt: độ nhô theo khoảng cách tới đường, cao A, nửa rộng w (hồ sơ
 * (1 − t²)²) — trừ vào khoảng cách để bề mặt phồng lên êm như vải, không thành ống tròn.
 */
function ridge(dist: number, A: number, w: number): number {
  if (dist >= w) return 0;
  const t = dist / w;
  const s = 1 - t * t;
  return A * s * s;
}

/** Dựng chuỗi gờ từ các điểm (x, y) nhìn chính diện, đặt sát bề mặt `f` (nâng `lift`), bán kính r (số hoặc theo điểm). */
function surfaceChain(f: Sdf, xy: readonly (readonly [number, number])[], lift: number, r: number | readonly number[]): Chain {
  return new Chain(xy.map(([x, y], i) => [x, y, projZ(f, x, y, lift), typeof r === 'number' ? r : r[i]!]));
}

// ───────────────────────── Nhiễu (vân đá) ─────────────────────────

function hash3(i: number, j: number, k: number): number {
  let h = (i * 374761393 + j * 668265263 + k * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x: number, y: number, z: number): number {
  const i = floor(x);
  const j = floor(y);
  const k = floor(z);
  const fx = x - i;
  const fy = y - j;
  const fz = z - k;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hash3(i, j, k), hash3(i + 1, j, k), u), l(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), u), v),
    l(l(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), u), l(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), u), v),
    w,
  );
}

/** Đang dựng lưới đủ mịn cho vân nhỏ (xoắn thừng, sóng chạm) — lưới xa bỏ qua để khỏi răng cưa. */
let fineDetail = true;

// ───────────────────────── Bệ sen ─────────────────────────

/**
 * Một hàng cánh sen quanh trục Y: n cánh, lệch pha, tâm cánh cách trục R0, tâm cao yc; nửa rộng/nửa cao/nửa dày.
 * `point` = độ thon về đầu cánh (0 = bầu tròn); `outline` = khắc đường chỉ chạy sát mép cánh.
 */
function petalRow(x: number, y: number, z: number, r: number, n: number, phase: number, R0: number, yc: number, hw: number, hh: number, hd: number, point: number, outline: boolean): number {
  const sector = TAU / n;
  const a = atan2(x, z) - phase;
  const la = a - round(a / sector) * sector;
  const u = r * sin(la);
  const w = r * cos(la) - R0;
  const v = y - yc;
  // Thon dần về đỉnh cánh (đầu nhọn), giữ bầu tròn phía dưới.
  const t = clamp((v + hh) / (2 * hh), 0, 1);
  const taper = 1 - point * t * t * t;
  const uu = u / taper;
  let d = ell(uu, v, w, 0, 0, 0, hw, hh, hd) * taper;
  if (outline) {
    const inner = ell(uu, v + hh * 0.05, w - hd * 0.55, 0, 0, 0, hw * 0.87, hh * 0.88, hd);
    d = carve(d, abs(inner) - 0.0075, 0.006);
  }
  return d;
}

function baseSdf(x: number, y: number, z: number): number {
  const r = sqrt(x * x + z * z);
  if (r > 1.62 || y > 0.86) return max(r - 1.5, y - 0.72);
  // Đế dưới + tầng hai.
  let d = roundCyl(r, y, 1.47, -0.06, 0.068, 0.028);
  d = smin(d, roundCyl(r, y, 1.44, 0.05, 0.146, 0.032), 0.012);
  // Viền thừng xoắn.
  {
    const dr = r - 1.405;
    const dy = y - 0.18;
    const a = atan2(x, z);
    const rope = sqrt(dr * dr + dy * dy) - 0.036 - (fineDetail ? 0.007 * sin(a * 150 + atan2(dy, dr) * 2) : 0);
    d = smin(d, rope, 0.01);
  }
  // Cổ bệ + lõi trống trong vòng cánh sen.
  d = smin(d, roundCyl(r, y, 1.32, 0.14, 0.24, 0.03), 0.015);
  d = min(d, roundCyl(r, y, 1.22, 0.18, 0.6, 0.02));
  // Cánh sen: hàng lớn bầu tròn + hàng nhỏ phía sau nhô đầu nhọn giữa hai cánh lớn.
  if (r > 1.0 && y > 0.18 && y < 0.6) {
    d = smin(d, petalRow(x, y, z, r, 20, 0, 1.31, 0.375, 0.215, 0.17, 0.095, 0.55, false), 0.012);
    d = smin(d, petalRow(x, y, z, r, 20, TAU / 40, 1.23, 0.45, 0.13, 0.11, 0.06, 0.3, false), 0.02);
  }
  // Mặt bệ: phiến tròn dày, mép chạm hàng lá giữa hai đường chỉ.
  const slab = roundCyl(r, y, 1.38, 0.545, 0.7, 0.03);
  d = min(d, slab);
  if (fineDetail && r > 1.3 && y > 0.54 && y < 0.71) {
    for (const yy of [0.567, 0.682]) {
      const dr = r - 1.383;
      const dy = y - yy;
      d = smin(d, sqrt(dr * dr + dy * dy) - 0.011, 0.006);
    }
    // Dải chạm hoa văn sóng cuộn giữa hai đường chỉ.
    const a = atan2(x, z);
    const dr = r - 1.38;
    const dy = y - (0.625 + 0.022 * sin(a * 36));
    d = smin(d, sqrt(dr * dr + dy * dy) - 0.012, 0.008);
  }
  return d;
}

// ───────────────────────── Thân + cà sa ─────────────────────────

/**
 * Lưới đầu (mịn) sở hữu cả cổ + ba ngấn cổ, cắm xuống trong ngực/cổ áo từ NECK_Y0; lưới thân (thô hơn) không có cổ,
 * đỉnh cổ áo thấp hơn BODY_TOP — hai lưới chỉ giao nhau, không có đường nối.
 */
const NECK_Y0 = 2.36;
const BODY_TOP = 2.58;
/** Độ dày lớp cà sa phủ ngoài thân. */
const ROBE_T = 0.032;

function torsoCore(x: number, y: number, z: number, ax: number): number {
  let d = ell(x, y, z, 0, 1.3, -0.15, 0.56, 0.32, 0.42);
  d = smin(d, ell(x, y, z, 0, 1.66, -0.1, 0.46, 0.36, 0.33), 0.2);
  d = smin(d, ell(x, y, z, 0, 2.1, -0.12, 0.55, 0.4, 0.33), 0.2);
  // Cơ thang + cổ áo: vai dốc êm từ chân cổ (cao sát cằm như ảnh mẫu) xuống đầu vai tròn.
  d = smin(d, ell(x, y, z, 0, 2.28, -0.15, 0.55, 0.24, 0.25), 0.16);
  d = smin(d, sph(ax, y, z, 0.63, 1.99, -0.12, 0.245), 0.22);
  // Cà sa nối bắp tay với sườn (nhìn chính diện không hở khe giữa tay và thân).
  d = smin(d, ell(ax, y, z, 0.57, 1.74, -0.08, 0.2, 0.36, 0.3), 0.14);
  return d;
}

/** Ngực trần: cơ ngực + khối bụng trên (rãnh giữa ngực, nếp dưới cơ ngực khắc sau — xem Details). */
function chestSkin(core: number, x: number, y: number, z: number, ax: number): number {
  if (z < -0.05 || y < 1.74 || y > 2.5) return core;
  const d = smin(core, ell(ax, y, z, 0.2, 2.17, 0.13, 0.2, 0.15, 0.1), 0.07);
  return smin(d, ell(x, y, z, 0, 1.92, 0.1, 0.17, 0.09, 0.1), 0.07);
}

/** Vùng ngực trần (nhìn chính diện, nửa phải x ≥ 0): đa giác; trả khoảng cách có dấu (âm = trong). */
const BARE: readonly (readonly [number, number])[] = [
  [0, 1.86],
  [0.2, 1.9],
  [0.34, 1.98],
  [0.42, 2.06],
  [0.45, 2.17],
  [0.41, 2.31],
  [0.31, 2.43],
  [0.24, 2.75],
  [0, 2.75],
];
function bare2d(ax: number, y: number): number {
  let d = Infinity;
  let inside = false;
  const n = BARE.length;
  // Đa giác đối xứng: dùng nửa phải + cạnh giữa (x = 0) coi như mở → chỉ tính các cạnh có x > 0.
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = BARE[i]!;
    const [xj, yj] = BARE[j]!;
    if (yi > y !== yj > y && ax < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    if (xi === 0 && xj === 0) continue;
    const ex = xj - xi;
    const ey = yj - yi;
    const h = clamp(((ax - xi) * ex + (y - yi) * ey) / (ex * ex + ey * ey), 0, 1);
    const dx = ax - xi - ex * h;
    const dy = y - yi - ey * h;
    d = min(d, sqrt(dx * dx + dy * dy));
  }
  return inside ? -d : d;
}

function arms(x: number, y: number, z: number, ax: number): number {
  // Bắp tay, cẳng tay đưa vào lòng, tay áo rủ dưới cẳng tay, miệng tay áo loe.
  let d = cap(ax, y, z, 0.66, 1.98, -0.12, 0.77, 1.5, -0.03, 0.17, 0.16);
  d = smin(d, cap(ax, y, z, 0.76, 1.5, -0.03, 0.45, 1.27, 0.4, 0.15, 0.125), 0.08);
  d = smin(d, ell(ax, y, z, 0.64, 1.33, 0.16, 0.2, 0.14, 0.24), 0.1);
  d = smin(d, sph(ax, y, z, 0.47, 1.275, 0.385, 0.128), 0.05);
  return d;
}

function legs(x: number, y: number, z: number, ax: number): number {
  let d = ell(x, y, z, 0, 0.95, 0.12, 1.12, 0.27, 0.78);
  d = smin(d, sph(ax, y, z, 1.02, 0.93, 0.36, 0.28), 0.2);
  // Hai cẳng chân bắt chéo trước lòng (phải ở trên).
  d = smin(d, cap(x, y, z, -0.98, 1.0, 0.58, 0.45, 1.09, 0.8, 0.18, 0.15), 0.1);
  d = smin(d, cap(x, y, z, 0.98, 0.98, 0.56, -0.45, 1.05, 0.76, 0.18, 0.15), 0.1);
  return d;
}

/** Cổ (dùng chung cho thân + đầu, đầu phình thêm `grow` để thắng độ sâu ở dải chồng). */
function neck(x: number, y: number, z: number, grow: number): number {
  return cap(x, y, z, 0, 2.38, -0.075, 0, 2.8, -0.05, 0.178 + grow, 0.17 + grow);
}

/** Vạt cà sa rủ trước bệ: tấm cong theo mép bệ, nếp dọc, rộng dần xuống dưới. */
const DRAPE: readonly (readonly [number, number])[] = [
  [1.08, 0.86],
  [0.97, 1.08],
  [0.86, 1.22],
  [0.77, 1.3],
  [0.715, 1.33],
];
const DRAPE_LEN = DRAPE.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - DRAPE[i - 1]![0], p[1] - DRAPE[i - 1]![1]) : 0), 0);
function frontDrape(x: number, y: number, z: number): number {
  if (z < 0.5 || y > 1.16 || y < 0.52) return 0.2;
  const rho = sqrt(x * x + z * z);
  const s = rho * atan2(x, z);
  if (abs(s) > 0.5) return abs(s) - 0.3;
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  for (let i = 0; i + 1 < DRAPE.length; i++) {
    const [ay, ar] = DRAPE[i]!;
    const [by, br] = DRAPE[i + 1]!;
    const ey = by - ay;
    const er = br - ar;
    const segL = sqrt(ey * ey + er * er);
    const h = clamp(((y - ay) * ey + (rho - ar) * er) / (segL * segL), 0, 1);
    const dy = y - ay - ey * h;
    const dr = rho - ar - er * h;
    const dd = sqrt(dy * dy + dr * dr);
    if (dd < best) {
      best = dd;
      bestT = (acc + h * segL) / DRAPE_LEN;
    }
    acc += segL;
  }
  const w = 0.14 + 0.17 * bestT + 0.012 * sin(bestT * 9);
  const pleat = 0.022 * (0.5 + 0.5 * cos((s * TAU) / 0.09)) * smooth(0.05, 0.35, bestT);
  let d = best - (0.024 + pleat);
  d = smax(d, abs(s) - w, 0.03);
  return d;
}

// ───────────────────────── Đầu ─────────────────────────

/** Sọ (vùng tóc phủ) — tóc xoắn ốc ôm khung mặt; mặt là khối trứng riêng phía trước. */
const HEAD = { cx: 0, cy: 3.12, cz: -0.06, rx: 0.315, ry: 0.31, rz: 0.34 };
const USH = { cx: 0, cy: 3.43, cz: -0.06, rx: 0.2, ry: 0.18, rz: 0.19 };

/** Elip xoay quanh trục Y một góc `ry` (tâm cx, cz) — cho vành tai nghiêng ra sau. */
function ellRy(x: number, y: number, z: number, cx: number, cy: number, cz: number, ry: number, rx: number, rxy: number, rz: number): number {
  const dx = x - cx;
  const dz = z - cz;
  const c = cos(ry);
  const s = sin(ry);
  return ell(dx * c - dz * s, y, dx * s + dz * c, 0, cy, 0, rx, rxy, rz);
}

/** Mặt + sọ (chưa có các nét khắc mảnh — dùng để đặt nét khắc lên đúng bề mặt). */
function faceBase(x: number, y: number, z: number, ax: number): number {
  let h = ell(x, y, z, HEAD.cx, HEAD.cy, HEAD.cz, HEAD.rx, HEAD.ry, HEAD.rz);
  // Hai bên đầu ngang tai (chỗ tai bám vào) — sọ thật rộng nhất quanh tầm tai.
  h = smin(h, ell(x, y, z, 0, 2.93, -0.08, 0.27, 0.2, 0.28), 0.08);
  // Mặt hình trứng: rộng nhất ngang gò má rồi thuôn êm về cằm; gò má đầy, cằm nhỏ tròn.
  const jt = 1 - 0.12 * smooth(2.9, 2.64, y);
  h = smin(h, ell(x / jt, y, z, 0, 2.87, 0.02, 0.24, 0.24, 0.255) * jt, 0.08);
  h = smin(h, ell(ax, y, z, 0.13, 2.9, 0.1, 0.1, 0.09, 0.12), 0.06);
  h = smin(h, sph(x, y, z, 0, 2.715, 0.16, 0.062), 0.07);
  if (z > 0.08 && y > 2.68 && y < 3.16) {
    // Hốc mắt nông, mi trên khép (mắt nhìn xuống), mi dưới.
    h = carve(h, ell(ax, y, z, 0.105, 3.0, 0.318, 0.08, 0.045, 0.055), 0.04);
    h = smin(h, ell(ax, y, z, 0.105, 2.995, 0.228, 0.07, 0.03, 0.035), 0.016);
    h = smin(h, ell(ax, y, z, 0.105, 2.97, 0.226, 0.056, 0.014, 0.026), 0.01);
    // Mũi: sống thẳng nối từ chân mày, đầu mũi tròn, cánh mũi nở.
    h = smin(h, cap(x, y, z, 0, 3.045, 0.27, 0, 2.875, 0.31, 0.021, 0.03), 0.03);
    h = smin(h, sph(x, y, z, 0, 2.858, 0.312, 0.027), 0.022);
    h = smin(h, ell(ax, y, z, 0.036, 2.853, 0.28, 0.026, 0.02, 0.022), 0.028);
    // Môi trên, môi dưới (đầy, miệng rộng vừa).
    h = smin(h, ell(x, y, z, 0, 2.794, 0.247, 0.072, 0.015, 0.024), 0.012);
    h = smin(h, ell(x, y, z, 0, 2.765, 0.243, 0.062, 0.02, 0.026), 0.012);
  }
  return h;
}

/** Lưới xoắn ốc tóc: các hàng xoắn trên một elip, mỗi hàng n xoắn; `on` = xoắn có hiện (theo chân tóc). */
interface CurlRow {
  n: number;
  off: number;
  pts: Float64Array;
  on: Uint8Array;
}
interface CurlLattice {
  c: V3;
  r: V3;
  rc: number;
  e0: number;
  de: number;
  rows: CurlRow[];
  top: V3 | null;
}

function makeCurls(c: V3, r: V3, rc: number, e0: number, e1: number, spacing: number, lift: number, active: (e: number, a: number) => boolean, top: boolean): CurlLattice {
  const meanR = (r[0] + r[1] + r[2]) / 3;
  const de = spacing / meanR;
  const rows: CurlRow[] = [];
  const place = (e: number, a: number): V3 => {
    const ux = cos(e) * sin(a);
    const uy = sin(e);
    const uz = cos(e) * cos(a);
    let nx = ux / r[0];
    let ny = uy / r[1];
    let nz = uz / r[2];
    const nl = sqrt(nx * nx + ny * ny + nz * nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;
    return [c[0] + ux * r[0] + nx * lift, c[1] + uy * r[1] + ny * lift, c[2] + uz * r[2] + nz * lift];
  };
  for (let e = e0; e <= e1 + 1e-6; e += de) {
    const ring = TAU * cos(e) * ((r[0] + r[2]) / 2);
    const n = max(3, round(ring / spacing));
    const off = rows.length % 2 ? 0.5 : 0;
    const pts = new Float64Array(n * 3);
    const on = new Uint8Array(n);
    for (let j = 0; j < n; j++) {
      let a = ((j + off) / n) * TAU;
      if (a > Math.PI) a -= TAU;
      pts.set(place(e, a), j * 3);
      on[j] = active(e, a) ? 1 : 0;
    }
    rows.push({ n, off, pts, on });
  }
  return { c, r, rc, e0, de, rows, top: top ? place(Math.PI / 2, 0) : null };
}

/** Chân tóc: độ cao (góc ngẩng trên elip sọ) theo hướng quanh đầu `a` (0 = chính diện). */
function hairline(a: number): number {
  const aa = abs(a);
  return 0.2 - 0.3 * smooth(0.35, 0.95, aa) - 0.75 * smooth(1.75, 2.7, aa);
}

// ───────────────────────── Tay chân ─────────────────────────

/** Ngón: đốt gần + đốt xa (hơi cong xuống). */
function finger(x: number, y: number, z: number, x0: number, y0: number, z0: number, dir: number, len: number, r: number): number {
  const xm = x0 + dir * len * 0.55;
  const xt = x0 + dir * len;
  const d = cap(x, y, z, x0, y0, z0, xm, y0 + 0.004, z0, r * 1.05, r);
  return smin(d, cap(x, y, z, xm, y0 + 0.004, z0, xt, y0 - 0.006, z0 + 0.004, r, r * 0.82), 0.008);
}

/** Bàn tay ngửa: `side` = −1 tay phải (từ phía −X, nằm trên), +1 tay trái (từ +X, nằm dưới). Ngón chỉ về phía đối diện. */
function hand(x: number, y: number, z: number, side: number, yb: number): number {
  const dir = -side;
  // Cổ tay vào trong ống tay áo, lòng bàn tay dẹt.
  let d = cap(x, y, z, side * 0.43, yb + 0.03, 0.4, side * 0.27, yb + 0.008, 0.49, 0.054, 0.05);
  d = smin(d, ell(x, y, z, side * 0.16, yb, 0.525, 0.115, 0.034, 0.088), 0.03);
  // Bốn ngón (ngón trỏ phía trước +Z), xếp sát nhau.
  const x0 = side * 0.06;
  d = smin(d, finger(x, y, z, x0, yb + 0.004, 0.592, dir, 0.17, 0.021), 0.01);
  d = smin(d, finger(x, y, z, x0, yb + 0.006, 0.551, dir, 0.185, 0.022), 0.01);
  d = smin(d, finger(x, y, z, x0, yb + 0.005, 0.51, dir, 0.172, 0.021), 0.01);
  d = smin(d, finger(x, y, z, x0 - side * 0.01, yb + 0.002, 0.472, dir, 0.14, 0.019), 0.01);
  // Ngón cái dựng lên, hai đầu ngón cái chạm nhau giữa lòng.
  d = smin(d, cap(x, y, z, side * 0.14, yb + 0.01, 0.6, side * 0.06, yb + 0.06, 0.625, 0.027, 0.024), 0.015);
  d = smin(d, cap(x, y, z, side * 0.06, yb + 0.06, 0.625, side * 0.008, 1.305, 0.618, 0.024, 0.021), 0.01);
  return d;
}

/** Bàn chân ngửa trên đùi bên kia (ngón hướng ra ngoài): `s` = +1 bàn chân phải (trên đùi trái, +X), −1 bàn chân trái. */
function foot(x: number, y: number, z: number, s: number): number {
  const ax = x * s;
  let d = ell(ax, y, z, 0.6, 1.2, 0.64, 0.2, 0.055, 0.088);
  d = smin(d, sph(ax, y, z, 0.43, 1.19, 0.64, 0.075), 0.05);
  // Năm ngón chân (ngón cái phía trước).
  const toes: readonly [number, number, number][] = [
    [0.705, 0.024, 0.032],
    [0.665, 0.021, 0.03],
    [0.627, 0.019, 0.029],
    [0.59, 0.017, 0.027],
    [0.555, 0.015, 0.025],
  ];
  for (const [tz, tr, len] of toes) d = smin(d, cap(ax, y, z, 0.76, 1.205, tz + 0.02, 0.76 + len, 1.21, tz + 0.02, tr, tr * 0.9), 0.012);
  return d;
}

function limbsSdf(x: number, y: number, z: number): number {
  if (y < 1.0 || y > 1.45 || z < 0.28 || z > 0.82 || abs(x) > 0.9) {
    return max(1.0 - y, y - 1.45, 0.28 - z, z - 0.82, abs(x) - 0.9, 0.02);
  }
  let d = Infinity;
  if (abs(x) < 0.6) {
    // Đôi bàn tay to bản như ảnh mẫu: phóng 1,18 lần quanh giữa lòng.
    const s = 1.18;
    const hx = x / s;
    const hy = 1.21 + (y - 1.21) / s;
    const hz = 0.53 + (z - 0.53) / s;
    d = min(hand(hx, hy, hz, -1, 1.232), hand(hx, hy, hz, 1, 1.196)) * s;
  }
  if (abs(x) > 0.3) d = min(d, foot(x, y, z, x > 0 ? 1 : -1));
  return d;
}

// ───────────────────────── Nét khắc đặt lên bề mặt (tính một lần) ─────────────────────────

interface Details {
  sternum: Chain;
  pecCrease: Chain;
  brow: Chain;
  lid: Chain;
  lidCrease: Chain;
  mouth: Chain;
  lipCrease: Chain;
  philtrum: Chain;
  neckFolds: Chain[];
  hem: Chain;
  hemLine: Chain;
  sideFolds: Chain[];
  armpit: Chain;
  sleeveFolds: Chain[];
  legFolds: Chain[];
  urnaZ: number;
  cranium: CurlLattice;
  ushnisha: CurlLattice;
}

let details: Details | null = null;

function robeShell(x: number, y: number, z: number): number {
  const ax = abs(x);
  const core = torsoCore(x, y, z, ax);
  const skin = chestSkin(core, x, y, z, ax);
  const bare = max(bare2d(ax, y), -z);
  return smin(min(skin, smax(core - ROBE_T, -bare, 0.015)), arms(x, y, z, ax), 0.12);
}

function buildDetails(): Details {
  const face: Sdf = (x, y, z) => faceBase(x, y, z, abs(x));
  const mirror = (pts: readonly (readonly [number, number])[]) => [...pts.map(([x, y]) => [-x, y] as const).reverse(), ...pts];
  const neckS: Sdf = (x, y, z) => neck(x, y, z, 0);
  const legS: Sdf = (x, y, z) => smin(legs(x, y, z, abs(x)), robeShell(x, y, z), 0.18);
  const brows: [number, number][] = [
    [0.02, 3.042],
    [0.065, 3.063],
    [0.12, 3.07],
    [0.175, 3.058],
    [0.22, 3.034],
    [0.245, 3.0],
  ];
  const lid: [number, number][] = [
    [0.035, 2.992],
    [0.065, 2.983],
    [0.105, 2.979],
    [0.145, 2.984],
    [0.178, 2.996],
  ];
  const crease: [number, number][] = [
    [0.045, 3.015],
    [0.09, 3.024],
    [0.135, 3.023],
    [0.17, 3.012],
  ];
  const chest: Sdf = (x, y, z) => {
    const ax = abs(x);
    return chestSkin(torsoCore(x, y, z, ax), x, y, z, ax);
  };
  const d: Details = {
    sternum: surfaceChain(
      chest,
      [
        [0, 2.26],
        [0, 2.14],
        [0, 2.04],
      ],
      0,
      0.011,
    ),
    pecCrease: surfaceChain(
      chest,
      [
        [0.05, 2.03],
        [0.14, 2.015],
        [0.24, 2.025],
        [0.33, 2.06],
        [0.39, 2.12],
      ],
      0,
      0.012,
    ),
    brow: surfaceChain(face, brows, 0.001, 0.008),
    lid: surfaceChain(face, lid, -0.0005, 0.0045),
    lidCrease: surfaceChain(face, crease, 0, 0.003),
    mouth: surfaceChain(
      face,
      mirror([
        [0.005, 2.781],
        [0.035, 2.779],
        [0.07, 2.786],
      ]),
      -0.001,
      0.0038,
    ),
    lipCrease: surfaceChain(
      face,
      mirror([
        [0.005, 2.744],
        [0.045, 2.748],
      ]),
      0,
      0.005,
    ),
    philtrum: surfaceChain(
      face,
      [
        [0, 2.838],
        [0, 2.81],
      ],
      0,
      0.006,
    ),
    // Ba ngấn cổ cong xuống ở giữa.
    neckFolds: [2.53, 2.575, 2.62].map((yy) =>
      surfaceChain(
        neckS,
        [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15].map((x) => [x, yy - 0.012 * (1 - (x / 0.17) ** 2)] as [number, number]),
        0.002,
        0.003,
      ),
    ),
    // Viền cà sa (gờ mềm = mép vải cuộn): chạy từ chân cổ qua sườn ngực xuống bụng; thêm một nếp song song phía ngoài.
    hem: surfaceChain(
      robeShell,
      [
        [0.25, 2.47],
        [0.32, 2.4],
        [0.4, 2.29],
        [0.447, 2.16],
        [0.44, 2.02],
        [0.41, 1.89],
        [0.385, 1.75],
        [0.36, 1.61],
        [0.33, 1.47],
      ],
      0,
      0,
    ),
    hemLine: surfaceChain(
      robeShell,
      [
        [0.34, 2.45],
        [0.42, 2.35],
        [0.5, 2.21],
        [0.53, 2.06],
        [0.51, 1.91],
        [0.48, 1.77],
        [0.46, 1.63],
      ],
      0,
      0,
    ),
    // Nếp dọc trên cà sa phủ sườn + bắp tay (từ vai rủ xuống).
    sideFolds: [
      [
        [0.61, 2.24],
        [0.63, 2.0],
        [0.66, 1.76],
        [0.7, 1.54],
      ],
      [
        [0.73, 2.18],
        [0.76, 1.94],
        [0.79, 1.7],
      ],
    ].map((pts) => surfaceChain(robeShell, pts as [number, number][], 0, 0)),
    // Rãnh sâu giữa bắp tay và sườn (bóng đổ dọc dưới nách).
    armpit: surfaceChain(
      robeShell,
      [
        [0.535, 2.1],
        [0.545, 1.88],
        [0.56, 1.68],
        [0.58, 1.5],
      ],
      0,
      0,
    ),
    sleeveFolds: [
      [
        [0.8, 1.43],
        [0.68, 1.37],
        [0.56, 1.31],
      ],
      [
        [0.82, 1.36],
        [0.7, 1.3],
        [0.58, 1.25],
      ],
    ].map((pts) => surfaceChain(robeShell, pts as [number, number][], 0, 0)),
    // Nếp áo trên chân: quét từ giữa lòng ra hai đầu gối.
    legFolds: [
      [
        [0.2, 1.08],
        [0.45, 1.06],
        [0.75, 1.02],
        [1.0, 0.96],
        [1.15, 0.89],
      ],
      [
        [0.22, 1.0],
        [0.5, 0.98],
        [0.8, 0.93],
        [1.05, 0.86],
      ],
      [
        [0.26, 0.92],
        [0.56, 0.9],
        [0.86, 0.85],
        [1.1, 0.79],
      ],
      [
        [0.95, 1.14],
        [1.1, 1.07],
        [1.22, 0.96],
      ],
    ].map((pts) => surfaceChain(legS, pts as [number, number][], 0, 0)),
    urnaZ: projZ(face, 0, 3.096, 0),
    cranium: makeCurls([HEAD.cx, HEAD.cy, HEAD.cz], [HEAD.rx, HEAD.ry, HEAD.rz], 0.027, -0.95, 1.25, 0.054, 0.004, (e, a) => e > hairline(a), false),
    ushnisha: makeCurls([USH.cx, USH.cy, USH.cz], [USH.rx, USH.ry, USH.rz], 0.026, -0.3, 1.3, 0.052, 0.003, () => true, true),
  };
  return d;
}

const D = (): Details => (details ??= buildDetails());

// ───────────────────────── Ghép các phần ─────────────────────────

function neckFolds(d: number, x: number, y: number, z: number): number {
  if (z < -0.02 || y < 2.49 || y > 2.66) return d;
  for (const f of D().neckFolds) d = carve(d, f.d(x, y, z), 0.01);
  return d;
}

const BODY_BOX = Float64Array.from([-1.36, 0.5, -0.82, 1.36, 2.66, 1.54]);

/** 4 nếp chữ U trước bụng: đáy nếp yb, nửa rộng xe, hai đầu nếp cao ye. */
const U_FOLDS = [0, 1, 2, 3].map((i) => ({ yb: 1.8 - 0.11 * i, xe: 0.42 - 0.03 * i, ye: 2.02 - 0.11 * i }));

/** Nếp chữ U kiểu vải rủ chồng lớp: mỗi nếp dốc thoải phía trên, mép dưới gãy gọn (đổ bóng xuống nếp dưới). */
function uFolds(x: number, y: number, z: number): number {
  if (z < -0.02 || y < 1.3 || y > 2.12) return 0;
  const ax = abs(x);
  let h = 0;
  for (const f of U_FOLDS) {
    if (ax > f.xe + 0.03) continue;
    const v = y - (f.yb + (f.ye - f.yb) * Math.pow(min(1, ax / f.xe), 1.7));
    if (v < -0.04 || v > 0.075) continue;
    const s = v < 0 ? 1 - (v / 0.04) ** 2 : 1 - (v / 0.075) ** 2;
    h += 0.026 * s * s * (1 - smooth(f.xe - 0.04, f.xe + 0.03, ax));
  }
  return h;
}

function bodySdf(x: number, y: number, z: number): number {
  const bound = boxDist(x, y, z, BODY_BOX);
  if (bound > 0.1) return bound;
  const ax = abs(x);
  const det = D();
  const core = torsoCore(x, y, z, ax);
  let skin = chestSkin(core, x, y, z, ax);
  if (z > 0 && y > 1.9 && y < 2.32 && ax < 0.45) {
    skin = carve(skin, det.sternum.d(x, y, z), 0.03);
    skin = carve(skin, det.pecCrease.d(ax, y, z), 0.03);
  }
  const bare = max(bare2d(ax, y), -z);
  let d = min(skin, smax(core - ROBE_T, -bare, 0.03));
  d = smin(d, arms(x, y, z, ax), 0.12);
  d = smin(d, legs(x, y, z, ax), 0.18);
  // Viền + nếp cà sa: gờ mềm phồng lên khỏi bề mặt (như vải), không phải ống tròn đặt lên.
  let fold = ridge(det.hem.d(ax, y, z), 0.03, 0.065) + ridge(det.hemLine.d(ax, y, z), 0.012, 0.035) + uFolds(x, y, z);
  if (ax > 0.45) {
    for (const f of det.sideFolds) fold += ridge(f.d(ax, y, z), 0.022, 0.065);
    for (const f of det.sleeveFolds) fold += ridge(f.d(ax, y, z), 0.014, 0.04);
    fold -= ridge(det.armpit.d(ax, y, z), 0.04, 0.06);
  }
  if (y < 1.2 && z > 0.2) for (const f of det.legFolds) fold += ridge(f.d(ax, y, z), 0.015, 0.05);
  return d - fold;
}

function headSdf(x: number, y: number, z: number): number {
  if (y < NECK_Y0 - 0.03) return NECK_Y0 - y;
  const bound = ell(x, y, z, 0, 3.1, -0.05, 0.44, 0.62, 0.46);
  if (bound > 0.12) return bound;
  const ax = abs(x);
  const det = D();
  let h = faceBase(x, y, z, ax);
  if (z > 0.12 && y > 2.7 && y < 3.12) {
    h = smin(h, det.brow.d(ax, y, z), 0.016);
    h = carve(h, det.lid.d(ax, y, z), 0.005);
    h = carve(h, det.lidCrease.d(ax, y, z), 0.004);
    h = carve(h, det.mouth.d(x, y, z), 0.004);
    h = carve(h, sph(ax, y, z, 0.072, 2.787, det.mouth.p[det.mouth.p.length - 2]! + 0.002, 0.007), 0.006);
    h = carve(h, det.lipCrease.d(x, y, z), 0.008);
    h = carve(h, det.philtrum.d(x, y, z), 0.006);
    h = carve(h, sph(ax, y, z, 0.025, 2.838, 0.3, 0.011), 0.005);
    h = smin(h, sph(x, y, z, 0, 3.096, det.urnaZ + 0.004, 0.017), 0.005);
  }
  // Tai áp sát đầu, hơi nghiêng ra sau: vành tai, hốc tai, dái tai dày dài buông tới ngang cằm, có khe xỏ.
  if (ax > 0.18 && y < 3.15 && z < 0.12) {
    h = smin(h, ellRy(ax, y, z, 0.282, 2.97, -0.06, 0.22, 0.03, 0.125, 0.085), 0.035);
    h = carve(h, ellRy(ax, y, z, 0.308, 2.98, -0.05, 0.22, 0.016, 0.085, 0.05), 0.012);
    h = smin(h, ellRy(ax, y, z, 0.272, 2.77, -0.03, 0.15, 0.034, 0.11, 0.05), 0.035);
    h = carve(h, cap(ax, y, z, 0.314, 2.83, -0.03, 0.316, 2.73, -0.02, 0.006, 0.006), 0.005);
  }
  // Cổ + ba ngấn (cổ cắm xuống trong ngực — lưới thân không có cổ). Chân cổ loe êm vào một lớp ngực lùi vào trong
  // 6 mm: phần loe nổi lên khỏi ngực của lưới thân thành chỗ nối mềm, phần còn lại khuất dưới bề mặt thân.
  h = smin(h, neck(x, y, z, 0), 0.07);
  if (y < 2.62) h = smin(h, torsoCore(x, y, z, ax) + 0.006, 0.07);
  h = neckFolds(h, x, y, z);
  // Nhục kế (tóc xoắn ốc dựng riêng bằng instancing — xem buildBuddhaCurls).
  return smin(h, ell(x, y, z, USH.cx, USH.cy, USH.cz, USH.rx, USH.ry, USH.rz), 0.05);
}

/** Khoảng cách từ điểm tới tâm xoắn ốc gần nhất (đang hiện) của một lưới xoắn. */
function nearCurl(L: CurlLattice, x: number, y: number, z: number): number {
  const vx = (x - L.c[0]) / L.r[0];
  const vy = (y - L.c[1]) / L.r[1];
  const vz = (z - L.c[2]) / L.r[2];
  const vl = sqrt(vx * vx + vy * vy + vz * vz) || 1;
  const e = asin(clamp(vy / vl, -1, 1));
  let a = atan2(vx, vz);
  if (a < 0) a += TAU;
  const i0 = floor((e - L.e0) / L.de);
  let best = Infinity;
  for (let i = i0 - 1; i <= i0 + 2; i++) {
    const row = L.rows[i];
    if (!row) continue;
    const j0 = round((a / TAU) * row.n - row.off);
    for (let dj = -1; dj <= 1; dj++) {
      const j = (((j0 + dj) % row.n) + row.n) % row.n;
      if (!row.on[j]) continue;
      const dx = x - row.pts[j * 3]!;
      const dy = y - row.pts[j * 3 + 1]!;
      const dz = z - row.pts[j * 3 + 2]!;
      best = min(best, sqrt(dx * dx + dy * dy + dz * dz));
    }
  }
  if (L.top) best = min(best, sqrt((x - L.top[0]) ** 2 + (y - L.top[1]) ** 2 + (z - L.top[2]) ** 2));
  return best;
}

/** Độ tối chân tóc (0..1): sọ nằm giữa/dưới các xoắn ốc thì tối hẳn, ra khỏi vùng xoắn thì sáng dần (mép mềm). */
function hairShade(x: number, y: number, z: number): number {
  if (y < 2.85) return 0;
  const det = D();
  const d = min(nearCurl(det.cranium, x, y, z), nearCurl(det.ushnisha, x, y, z));
  return 1 - smooth(0.03, 0.05, d);
}

/** Toàn tượng (để tính AO). */
function statueSdf(x: number, y: number, z: number): number {
  let d = y < 0.9 ? baseSdf(x, y, z) : 0.5;
  if (y > 0.55) d = min(d, bodySdf(x, y, z));
  if (z > 0.5 && y < 1.2) d = min(d, frontDrape(x, y, z));
  if (y > 1.0 && y < 1.5) d = min(d, limbsSdf(x, y, z));
  if (y > NECK_Y0 - 0.05) d = min(d, headSdf(x, y, z));
  return d;
}

interface PartSpec {
  f: Sdf;
  min: V3;
  max: V3;
  /** Cạnh ô lưới ở chất lượng cao (chất lượng thấp nhân thêm hệ số `detail`). */
  step: number;
}

/**
 * Hộp lưới từng phần. Mặt bị che hẳn không dựng: đáy bệ (đặt trên bàn thờ), mặt trên phiến bệ (thay bằng đĩa phẳng —
 * xem BUDDHA_SLAB), mặt dưới chân ngồi áp lên mặt bệ.
 */
const PARTS: Record<BuddhaPart, PartSpec> = {
  head: { f: headSdf, min: [-0.42, NECK_Y0, -0.5], max: [0.42, 3.63, 0.42], step: 0.009 },
  limbs: { f: limbsSdf, min: [-0.88, 1.04, 0.3], max: [0.88, 1.4, 0.8], step: 0.008 },
  body: { f: bodySdf, min: [-1.33, 0.69, -0.74], max: [1.33, BODY_TOP, 1.3], step: 0.018 },
  drape: { f: frontDrape, min: [-0.5, 0.54, 0.6], max: [0.5, 1.13, 1.5], step: 0.015 },
  base: { f: baseSdf, min: [-1.52, 0.004, -1.52], max: [1.52, 0.695, 1.52], step: 0.024 },
};

/** Mặt trên phiến bệ (dựng bằng đĩa phẳng ở client): cao + bán kính khớp mép lưới bệ đã cắt. */
export const BUDDHA_SLAB = { y: 0.695, r: 1.368 };

// ───────────────────────── Surface Nets thưa ─────────────────────────

const BLOCK = 8;

/** Lưới mặt đẳng trị 0 trong hộp [min, max]: chỉ tính các khối 8³ ô gần bề mặt (khoảng cách tâm khối đủ nhỏ). */
function sparseSurfaceNets(f: Sdf, lo: V3, hi: V3, step: number): { pos: Float32Array; index: Uint32Array } {
  const nx = Math.ceil((hi[0] - lo[0]) / step);
  const ny = Math.ceil((hi[1] - lo[1]) / step);
  const nz = Math.ceil((hi[2] - lo[2]) / step);
  const bx = Math.ceil(nx / BLOCK);
  const by = Math.ceil(ny / BLOCK);
  const bz = Math.ceil(nz / BLOCK);
  const S = BLOCK + 1;
  const thr = 1.8 * ((Math.sqrt(3) * BLOCK * step) / 2) + 3 * step;
  const blocks = new Map<number, Float32Array>();
  for (let K = 0; K < bz; K++)
    for (let J = 0; J < by; J++)
      for (let I = 0; I < bx; I++) {
        const c = f(lo[0] + (I + 0.5) * BLOCK * step, lo[1] + (J + 0.5) * BLOCK * step, lo[2] + (K + 0.5) * BLOCK * step);
        if (abs(c) > thr) continue;
        const s = new Float32Array(S * S * S);
        for (let c2 = 0; c2 < S; c2++) {
          const z = lo[2] + (K * BLOCK + c2) * step;
          for (let b = 0; b < S; b++) {
            const y = lo[1] + (J * BLOCK + b) * step;
            for (let a = 0; a < S; a++) s[a + S * (b + S * c2)] = f(lo[0] + (I * BLOCK + a) * step, y, z);
          }
        }
        blocks.set(I + bx * (J + by * K), s);
      }

  const C: V3[] = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const E: [number, number][] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const vmap = new Map<number, number>();
  const pos: number[] = [];
  const v = new Float32Array(8);
  for (const [key, s] of blocks) {
    const I = key % bx;
    const J = floor(key / bx) % by;
    const K = floor(key / (bx * by));
    for (let c2 = 0; c2 < BLOCK; c2++) {
      const k = K * BLOCK + c2;
      if (k >= nz) break;
      for (let b = 0; b < BLOCK; b++) {
        const j = J * BLOCK + b;
        if (j >= ny) break;
        for (let a = 0; a < BLOCK; a++) {
          const i = I * BLOCK + a;
          if (i >= nx) break;
          let neg = 0;
          for (let q = 0; q < 8; q++) {
            const o = C[q]!;
            v[q] = s[a + o[0] + S * (b + o[1] + S * (c2 + o[2]))]!;
            if (v[q]! < 0) neg++;
          }
          if (neg === 0 || neg === 8) continue;
          let px = 0;
          let py = 0;
          let pz = 0;
          let n = 0;
          for (const [ea, eb] of E) {
            const va = v[ea]!;
            const vb = v[eb]!;
            if (va < 0 === vb < 0) continue;
            const t = va / (va - vb);
            const oa = C[ea]!;
            const ob = C[eb]!;
            px += oa[0] + (ob[0] - oa[0]) * t;
            py += oa[1] + (ob[1] - oa[1]) * t;
            pz += oa[2] + (ob[2] - oa[2]) * t;
            n++;
          }
          vmap.set(i + nx * (j + ny * k), pos.length / 3);
          pos.push(lo[0] + (i + px / n) * step, lo[1] + (j + py / n) * step, lo[2] + (k + pz / n) * step);
        }
      }
    }
  }

  const index: number[] = [];
  const cell = (i: number, j: number, k: number) => vmap.get(i + nx * (j + ny * k)) ?? -1;
  const quad = (qa: number, qb: number, qc: number, qd: number, flip: boolean) => {
    if (qa < 0 || qb < 0 || qc < 0 || qd < 0) return;
    if (flip) index.push(qa, qc, qb, qa, qd, qc);
    else index.push(qa, qb, qc, qa, qc, qd);
  };
  for (const [key, s] of blocks) {
    const I = key % bx;
    const J = floor(key / bx) % by;
    const K = floor(key / (bx * by));
    for (let c2 = 0; c2 < BLOCK; c2++) {
      const k = K * BLOCK + c2;
      if (k > nz) break;
      for (let b = 0; b < BLOCK; b++) {
        const j = J * BLOCK + b;
        if (j > ny) break;
        for (let a = 0; a < BLOCK; a++) {
          const i = I * BLOCK + a;
          if (i > nx) break;
          const in0 = s[a + S * (b + S * c2)]! < 0;
          if (i < nx && j > 0 && k > 0 && j < ny && k < nz && in0 !== s[a + 1 + S * (b + S * c2)]! < 0) {
            quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !in0);
          }
          if (j < ny && i > 0 && k > 0 && i < nx && k < nz && in0 !== s[a + S * (b + 1 + S * c2)]! < 0) {
            quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !in0);
          }
          if (k < nz && i > 0 && j > 0 && i < nx && j < ny && in0 !== s[a + S * (b + S * (c2 + 1))]! < 0) {
            quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !in0);
          }
        }
      }
    }
  }
  return { pos: new Float32Array(pos), index: new Uint32Array(index) };
}

const AO_D = [0.012, 0.03, 0.06, 0.1, 0.16];
const AO_W = [1.0, 0.65, 0.42, 0.26, 0.15];

/** Độ sáng do bị che (AO) tại điểm p theo hướng n, tính trên toàn tượng. */
function occlusion(x: number, y: number, z: number, nx: number, ny: number, nz: number): number {
  let occ = 0;
  for (let s = 0; s < AO_D.length; s++) {
    const dist = AO_D[s]!;
    occ += (max(0, dist - statueSdf(x + nx * dist, y + ny * dist, z + nz * dist)) / dist) * AO_W[s]!;
  }
  return clamp(1 - occ * 0.42, 0.22, 1);
}

/** Kéo đỉnh về đúng mặt, pháp tuyến = gradient, AO (theo toàn tượng) + vân đá vào màu đỉnh. */
function finishPart(f: Sdf, step: number, pos: Float32Array, index: Uint32Array, hair: boolean): BuddhaMeshData {
  const count = pos.length / 3;
  const N = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const h = step * 0.5;
  const grad = (x: number, y: number, z: number): V3 => {
    const a = f(x + h, y - h, z - h);
    const b = f(x - h, y - h, z + h);
    const c = f(x - h, y + h, z - h);
    const d = f(x + h, y + h, z + h);
    const gx = a - b - c + d;
    const gy = -a - b + c + d;
    const gz = -a + b - c + d;
    const l = sqrt(gx * gx + gy * gy + gz * gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  for (let q = 0; q < count; q++) {
    let x = pos[q * 3]!;
    let y = pos[q * 3 + 1]!;
    let z = pos[q * 3 + 2]!;
    let g = grad(x, y, z);
    const dd = clamp(f(x, y, z), -step * 0.6, step * 0.6);
    x -= g[0] * dd;
    y -= g[1] * dd;
    z -= g[2] * dd;
    g = grad(x, y, z);
    const ao = occlusion(x, y, z, g[0], g[1], g[2]);
    // Vân đá: mảng loang lớn + lấm tấm nhỏ; chân tóc giữa các xoắn ốc tối hẳn.
    const mottle = 0.93 + 0.1 * noise3(x * 5.5, y * 5.5, z * 5.5) + 0.05 * noise3(x * 31, y * 31, z * 31) - 0.04;
    const shade = ao * mottle * (hair ? 1 - 0.55 * hairShade(x, y, z) : 1);
    pos[q * 3] = x;
    pos[q * 3 + 1] = y;
    pos[q * 3 + 2] = z;
    N.set(g, q * 3);
    // Kẽ sâu ngả xanh rêu nhẹ (đá để lâu năm).
    col[q * 3] = shade * (0.97 + 0.03 * ao);
    col[q * 3 + 1] = shade;
    col[q * 3 + 2] = shade * (0.94 + 0.06 * ao);
  }
  return { position: pos, normal: N, color: col, index };
}

/**
 * Lưới một phần tượng (đã kéo đỉnh về mặt, pháp tuyến mượt, AO + vân đá trong màu đỉnh).
 * `detail` > 1 = lưới thưa hơn (máy yếu / chất lượng thấp).
 */
export function buildBuddhaPart(part: BuddhaPart, detail = 1): BuddhaMeshData {
  const spec = PARTS[part];
  const step = spec.step * detail;
  fineDetail = detail < 1.8;
  const { pos, index } = sparseSurfaceNets(spec.f, spec.min, spec.max, step);
  return finishPart(spec.f, step, pos, index, part === 'head');
}

/** Số liệu mỗi xoắn ốc tóc trong mảng trả về: tâm (3), pháp tuyến (3), bán kính, độ sáng AO. */
export const CURL_STRIDE = 8;

/**
 * Tóc xoắn ốc (dựng bằng InstancedMesh ở client): mỗi xoắn là một chỏm cầu đặt trên sọ/nhục kế theo hàng. Bỏ các
 * xoắn chìm hẳn trong khối kia (xoắn sọ dưới nhục kế, xoắn nhục kế dưới mặt sọ).
 */
export function buildBuddhaCurls(): Float32Array {
  const det = D();
  const out: number[] = [];
  const add = (L: CurlLattice, hiddenIn: (x: number, y: number, z: number) => number) => {
    const emit = (px: number, py: number, pz: number, r: number) => {
      if (hiddenIn(px, py, pz) < -L.rc * 0.55) return;
      let nx = (px - L.c[0]) / (L.r[0] * L.r[0]);
      let ny = (py - L.c[1]) / (L.r[1] * L.r[1]);
      let nz = (pz - L.c[2]) / (L.r[2] * L.r[2]);
      const nl = sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const ao = occlusion(px + nx * r, py + ny * r, pz + nz * r, nx, ny, nz);
      out.push(px, py, pz, nx, ny, nz, r, ao);
    };
    for (const row of L.rows) {
      for (let j = 0; j < row.n; j++) if (row.on[j]) emit(row.pts[j * 3]!, row.pts[j * 3 + 1]!, row.pts[j * 3 + 2]!, L.rc);
    }
    if (L.top) emit(L.top[0], L.top[1], L.top[2], L.rc * 1.15);
  };
  add(det.cranium, (x, y, z) => ell(x, y, z, USH.cx, USH.cy, USH.cz, USH.rx, USH.ry, USH.rz));
  add(det.ushnisha, (x, y, z) => ell(x, y, z, HEAD.cx, HEAD.cy, HEAD.cz, HEAD.rx, HEAD.ry, HEAD.rz));
  return new Float32Array(out);
}
