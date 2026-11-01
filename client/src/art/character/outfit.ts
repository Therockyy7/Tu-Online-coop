// Áo quần nhân vật: thân (body.ts) + cổ áo, da cổ, tay áo 2 đoạn, bàn tay găng, hài, đai, miếng vá, đồ thường, chuỗi hạt.
// Cà sa (st.sash) do kasaya.ts dựng, buildOutfit gộp PartBuild của nó vào.
//
// Toạ độ body space (rig.ts): +Y lên, +Z trước, +X bên TRÁI nhân vật; θ đo từ +Z về +X. Hình bám thân dựng theo body space
// rồi gắn khớp skirt/torso bằng alignToBody(mesh, PIVOT.waist); đồ trên khớp skirt luôn có morph 'sit' bám mặt
// (addSitMorph(geo, v) / builder `sit: true`). Tay áo, bàn tay, giày dựng theo khung cục bộ của khớp (xương dọc −Y).
// Mọi hình chỉ phụ thuộc ngoại hình → cache cấp module, dùng chung giữa các nhân vật (không dispose).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AvatarLook } from '../api';
import { PIVOT, alignToBody, type BuildOutfit, type Dangler, type Joints, type MatFactory, type MatOpts, type PartBuild } from './rig';
import { robeStyle, type RobeStyle } from './style';
import { buildKasaya } from './kasaya';
import {
  LAYER,
  RADIAL,
  WAIST,
  addSitMorph,
  bandGeometry,
  bodyVariant,
  patchGeometry,
  ribbonGeometry,
  skirtGeometry,
  surfaceSample,
  torsoGeometry,
  type BodyJoint,
  type BodyVariant,
  type SurfacePath,
} from './body';

const TAU = Math.PI * 2;
type V3 = readonly [number, number, number];

// ───────────────────────── Vai trò vật liệu ─────────────────────────

/** Khớp gắn hình. */
type JointKey = 'skirt' | 'torso' | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR' | 'handL' | 'handR' | 'footL' | 'footR';

/** Vai trò vật liệu = khoá MatFactory (mỗi vai trò một vật liệu riêng của nhân vật). */
type Role =
  | 'lower'
  | 'upper'
  | 'sleeve'
  | 'collar'
  | 'hem'
  | 'cuff'
  | 'lining'
  | 'skin'
  | 'shoes'
  | 'belt'
  | 'patch'
  | 'stitch'
  | 'bead'
  | 'tassel'
  | 'gold'
  | 'button'
  | 'shirt'
  | 'tie'
  | 'lapel';

/** Giống headwear.ts / handheld.ts — cùng khoá 'gold' thì phải cùng thông số. */
const GOLD: MatOpts = { metalness: 0.45, roughness: 0.38, emissive: '#b8862f', ei: 0.25 };

/** Nhân màu hex (sRGB) với k (< 1 tối hơn). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/** Màu viền cổ áo: st.collar → st.trim → áo trên tối hơn. */
function collarColor(st: RobeStyle): string {
  return st.collar ?? st.trim ?? shade(st.upper, 0.72);
}

/** Màu + thông số vật liệu của một vai trò theo bộ áo. */
function roleMat(role: Role, st: RobeStyle, look: AvatarLook): [string, MatOpts] {
  const cloth = (c: string): [string, MatOpts] => [c, st.shiny ? { roughness: 0.42, metalness: 0.16 } : { roughness: 0.85 }];
  switch (role) {
    case 'lower':
      return [st.lower, { roughness: 0.85 }];
    case 'upper':
      return cloth(st.upper);
    case 'sleeve':
      return cloth(st.sleeve);
    case 'collar':
      return [collarColor(st), { roughness: 0.8 }];
    case 'hem':
      return [st.trim ?? shade(st.lower, 0.74), { roughness: 0.8 }];
    case 'cuff':
      return [st.trim ?? st.collar ?? shade(st.sleeve, 0.8), { roughness: 0.8 }];
    case 'lining':
      return [shade(st.sleeve, 0.42), { roughness: 0.95 }];
    case 'skin':
      return [look.skin, { roughness: 0.6 }];
    case 'shoes':
      return [st.shoes, { roughness: 0.8 }];
    case 'belt':
      return [st.belt ?? shade(st.upper, 0.6), { roughness: 0.9 }];
    case 'patch':
      return [st.patches ?? shade(st.upper, 1.2), { roughness: 0.9 }];
    case 'stitch':
      return [shade(st.upper, 0.45), { roughness: 0.9 }];
    case 'bead':
      return ['#6e3b26', { roughness: 0.45 }];
    case 'tassel':
      return ['#b5382f', { roughness: 0.75 }];
    case 'gold':
      return ['#ffd166', GOLD];
    case 'button':
      return [look.outfit.robe === 'civ_vest' ? '#1a1d29' : '#c8a064', { roughness: 0.5 }];
    case 'shirt':
      return ['#f7f7f2', { roughness: 0.75 }];
    case 'tie':
      return [st.tie ?? '#c8322a', { roughness: 0.55 }];
    case 'lapel':
      return [shade(st.upper, 0.78), { roughness: 0.7 }];
  }
}

// ───────────────────────── Gộp hình theo (khớp, vật liệu) ─────────────────────────

/** Một mesh sẽ dựng: hình + khớp + vai trò vật liệu. */
interface Piece {
  readonly joint: JointKey;
  readonly role: Role;
  readonly geo: THREE.BufferGeometry;
  /** Dựng theo body space (gắn alignToBody(…, PIVOT.waist)); false = khung cục bộ của khớp. */
  readonly body: boolean;
  /** Có morph 'sit' (đồ khớp skirt). */
  readonly sit: boolean;
  readonly shadow: boolean;
  /** Đồ lủng lẳng: điểm treo (body space) + gain. */
  readonly hang?: { readonly at: V3; readonly gain: number };
}

interface AddOpts {
  body?: boolean;
  sit?: boolean;
  shadow?: boolean;
}

/** Gộp các hình cùng (khớp, vai trò, morph, bóng) thành một mesh — giảm draw call. Hình dùng chung thì để riêng. */
class Recipe {
  private readonly groups = new Map<string, { o: Required<AddOpts>; joint: JointKey; role: Role; list: THREE.BufferGeometry[] }>();
  private readonly fixed: Piece[] = [];

  /** Thêm hình MỚI (sẽ gộp + giải phóng bản lẻ). */
  add(joint: JointKey, role: Role, geo: THREE.BufferGeometry, o: AddOpts = {}): void {
    const oo: Required<AddOpts> = { body: o.body ?? (joint === 'skirt' || joint === 'torso'), sit: o.sit ?? joint === 'skirt', shadow: o.shadow ?? false };
    const k = `${joint}|${role}|${+oo.body}|${+oo.sit}|${+oo.shadow}`;
    let g = this.groups.get(k);
    if (!g) this.groups.set(k, (g = { o: oo, joint, role, list: [] }));
    g.list.push(geo);
  }

  /** Thêm hình DÙNG CHUNG (cache khác) — mesh riêng, không gộp. */
  use(joint: JointKey, role: Role, geo: THREE.BufferGeometry, o: AddOpts = {}): void {
    const body = o.body ?? (joint === 'skirt' || joint === 'torso');
    this.fixed.push({ joint, role, geo, body, sit: o.sit ?? joint === 'skirt', shadow: o.shadow ?? false });
  }

  /** Đồ lủng lẳng (mesh riêng, xoay quanh `at`). */
  hang(joint: JointKey, role: Role, geo: THREE.BufferGeometry, at: V3, gain: number, sit = joint === 'skirt'): void {
    this.fixed.push({ joint, role, geo, body: true, sit, shadow: false, hang: { at, gain } });
  }

  done(): Piece[] {
    const out = [...this.fixed];
    for (const g of this.groups.values()) out.push({ joint: g.joint, role: g.role, geo: mergeAll(g.list), ...g.o });
    return out;
  }
}

/** Gộp nhiều hình (cùng thuộc tính, cùng có/không morph) thành một; giải phóng bản lẻ. */
function mergeAll(list: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (list.length === 1) return list[0]!;
  for (const g of list) {
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  }
  const m = mergeGeometries(list as THREE.BufferGeometry[], false);
  if (!m) throw new Error('outfit: không gộp được hình');
  m.morphTargetsRelative = list[0]!.morphTargetsRelative;
  for (const g of list) g.dispose();
  return m;
}

// ───────────────────────── Ống tiện tiết diện quả trứng ─────────────────────────

/**
 * Vòng tiết diện quanh trục Y cục bộ: [y, nửa ngang X, tầm trước (+Z), tầm sau (−Z), tâm lệch Z]. rx = zf = 0 → đỉnh cực
 * (chỉ ở vòng đầu/cuối). Tiết diện = nửa elip trước (rx, zf) + nửa elip sau (rx, zb) — trơn ở hai bên.
 */
type Ring = readonly [y: number, rx: number, zf: number, zb: number, cz?: number];

/**
 * Ống nối các vòng theo thứ tự (đi xuống −Y thì mặt ngoài hướng ra; vòng quay ngược lên phía trong → lớp lót hướng vào
 * trục, nhìn được từ miệng ống). Không lặp đỉnh ở đường nối → pháp tuyến trơn quanh vòng.
 */
function ringStack(rings: readonly Ring[], seg: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const start: number[] = [];
  const pole: boolean[] = [];
  const nr = rings.length - 1;
  rings.forEach(([y, rx, zf, zb, cz = 0], i) => {
    start.push(pos.length / 3);
    const p = rx <= 0 && zf <= 0 && zb <= 0;
    pole.push(p);
    if (p) {
      pos.push(0, y, cz);
      uv.push(0.5, i / nr);
      return;
    }
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      const c = Math.cos(a);
      pos.push(rx * Math.sin(a), y, cz + (c >= 0 ? zf : zb) * c);
      uv.push(k / seg, i / nr);
    }
  });
  for (let i = 0; i < nr; i++) {
    const s0 = start[i]!;
    const s1 = start[i + 1]!;
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      if (pole[i]) idx.push(s0, s1 + k, s1 + k1);
      else if (pole[i + 1]) idx.push(s0 + k, s1, s0 + k1);
      else idx.push(s0 + k, s1 + k, s1 + k1, s0 + k, s1 + k1, s0 + k1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Bán cầu (bán kính r, tâm y0) thành các vòng: từ đỉnh (dir = 1, cực trên) hoặc đáy (dir = −1); `n` bậc kể cả xích đạo. */
function capRings(y0: number, r: number, dir: 1 | -1, n: number): Ring[] {
  const out: Ring[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (1 - i / n);
    const rr = i === 0 ? 0 : r * Math.cos(a);
    out.push([y0 + dir * r * Math.sin(a), rr, rr, rr]);
  }
  return dir === 1 ? out : out.reverse();
}

/** Lật gương theo X (tay trái → tay phải) — đổi chiều quấn để mặt trước vẫn hướng ra. */
function mirrorX(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const ix = g.getIndex()!;
  for (let i = 0; i < ix.count; i += 3) {
    const b = ix.getX(i + 1);
    ix.setX(i + 1, ix.getX(i + 2));
    ix.setX(i + 2, b);
  }
  ix.needsUpdate = true;
  return g;
}

// ───────────────────────── Tay áo, bàn tay, hài ─────────────────────────

/** Kiểu tay áo: hẹp (áo nâu, áo lam, cà sa, đồ thường dài tay), rộng (áo tràng, Phương Trượng), ngắn (áo thun). */
type SleeveKind = 'narrow' | 'wide' | 'short';

const SEG_ARM = 10;

/** Nửa cầu "ống" quanh trục X (khuỷu chỉ xoay quanh X): tròn trong mặt YZ bán kính r, bề ngang X = r·kx. */
function hingeCap(y0: number, r: number, kx: number, dir: 1 | -1, n: number): Ring[] {
  return capRings(y0, r, dir, n).map(([y, rr]) => [y, rr * kx, rr, rr] as Ring);
}

/**
 * Ống tay trên (khớp shoulder*, khuỷu ở y −0.22): đầu vai là quả cầu đúng tâm khớp (bán kính 0.062 < SLEEVE.upperR) nên
 * giơ / dang / khép vai kiểu gì cũng không hở; thân ống dẹt nhẹ theo X (mặt trong sát thân) + một nếp gấp; đáy là nửa
 * "ống" tròn quanh trục khuỷu — gập khuỷu 0..2.2 cẳng tay áo vẫn chui trong đó.
 */
function upperSleeveRings(kind: SleeveKind): Ring[] {
  const top = capRings(0, 0.062, 1, 2);
  if (kind === 'short') {
    return [
      ...top,
      [-0.04, 0.059, 0.064, 0.064],
      [-0.07, 0.06, 0.065, 0.065],
      [-0.077, 0.0625, 0.0675, 0.0675],
      [-0.1, 0.0625, 0.0675, 0.0675],
      [-0.108, 0.062, 0.067, 0.067],
      [-0.1135, 0.0585, 0.0635, 0.0635],
      [-0.109, 0.0535, 0.0585, 0.0585],
    ];
  }
  return [
    ...top,
    [-0.06, 0.058, 0.064, 0.064],
    [-0.105, 0.056, 0.0625, 0.0625],
    [-0.15, 0.0545, 0.061, 0.061],
    [-0.181, 0.0565, 0.0625, 0.0625],
    [-0.203, 0.054, 0.06, 0.06],
    ...hingeCap(-0.22, 0.06, 0.9, -1, 2),
  ];
}

/** Hệ số bóp mặt trong theo y dọc xương: 1 ở đầu vai (y ≥ −0.04) → 0.6 ở bắp tay (−0.11…−0.16) → 1 ở khuỷu (y ≤ −0.2). */
function innerK(y: number): number {
  const s = (a: number, b: number) => {
    const t = Math.min(1, Math.max(0, (y - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return 1 - 0.4 * s(-0.04, -0.11) * (1 - s(-0.16, -0.2));
}

/**
 * Bóp mặt trong (−X cục bộ của khớp vai TRÁI) ống tay trên: x < 0 nhân innerK(y). Hướng thân trong hệ vai đo trên tư thế
 * thật nằm ở φ ≈ 130°…190° (buông, đi, chắp tay, ôm, lạy) và trục xương bắp tay chỉ cách thân 3–5 cm → ống đủ rộng lún qua
 * thân / cà sa; bóp còn 60 % thì mặt ngoài vẫn tròn đầy. Đầu vai + nửa ống quanh khuỷu giữ nguyên (khớp nắp, cẳng tay áo).
 */
function squeezeInner(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (x < 0) p.setX(i, x * innerK(p.getY(i)));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Lót trong tay áo ngắn (tiếp nối vòng trong của mép, đi lên khép kín). */
const SHORT_LINING: readonly Ring[] = [
  [-0.109, 0.0535, 0.0585, 0.0585],
  [-0.095, 0.05, 0.054, 0.054],
  [-0.075, 0.038, 0.042, 0.042],
  [-0.062, 0, 0, 0],
] as Ring[];

/**
 * Cẳng tay áo (khớp elbow*, tâm bàn tay ở y −0.23): đầu trên nửa "ống" quanh trục khuỷu nằm trong đáy ống tay trên; thân
 * ống một nếp; cổ tay loe hình chuông, mép cuộn vào trong rồi lót tối khép kín — bàn tay ló ra từ lớp lót. Tay rộng: phần
 * loe thêm dồn về −Z cục bộ (sau / dưới cẳng tay như túi áo) — mặt trong (±X, phía thân) không phình. Trả [ống, cổ tay, lót].
 */
function foreSleeveRings(kind: 'narrow' | 'wide'): [Ring[], Ring[], Ring[]] {
  const top = hingeCap(0, 0.055, 0.92, 1, 2);
  if (kind === 'wide') {
    const tube: Ring[] = [...top, [-0.045, 0.053, 0.057, 0.06], [-0.09, 0.058, 0.0585, 0.073], [-0.136, 0.0635, 0.0595, 0.091]];
    // miệng tay rộng thấp (mép trong y −0.184) gần chỗ bàn tay phình ra (nửa bề ngang ≈ 0.061 ở đó): mép trong 0.07 mọi
    // phía (dây cung 10 cạnh ≥ 0.0666) để bàn tay ló ra từ lòng ống chứ không xuyên qua mép cuộn khi xoay cổ tay
    const cuff: Ring[] = [
      [-0.136, 0.0635, 0.0595, 0.091],
      [-0.145, 0.067, 0.0635, 0.097],
      [-0.168, 0.0715, 0.0695, 0.104],
      [-0.181, 0.0745, 0.0745, 0.109],
      [-0.19, 0.0725, 0.0725, 0.1055],
      [-0.184, 0.07, 0.07, 0.1],
    ];
    const lining: Ring[] = [
      [-0.184, 0.07, 0.07, 0.1],
      [-0.163, 0.0625, 0.0595, 0.086],
      [-0.135, 0.042, 0.039, 0.053],
      [-0.112, 0.019, 0.018, 0.023],
      [-0.105, 0, 0, 0],
    ];
    return [tube, cuff, lining];
  }
  const tube: Ring[] = [...top, [-0.045, 0.052, 0.057, 0.057], [-0.08, 0.0545, 0.0595, 0.0595], [-0.121, 0.055, 0.0595, 0.0595]];
  const cuff: Ring[] = [
    [-0.121, 0.055, 0.0595, 0.0595],
    [-0.129, 0.058, 0.062, 0.062],
    [-0.151, 0.06, 0.064, 0.064],
    [-0.162, 0.062, 0.066, 0.066],
    [-0.168, 0.0585, 0.0625, 0.0625],
    [-0.164, 0.053, 0.057, 0.057],
  ];
  const lining: Ring[] = [
    [-0.164, 0.053, 0.057, 0.057],
    [-0.145, 0.047, 0.05, 0.05],
    [-0.122, 0.03, 0.032, 0.032],
    [-0.112, 0, 0, 0],
  ];
  return [tube, cuff, lining];
}

/** Cánh tay trần (áo thun): đoạn trên (khớp shoulder*, bắt đầu trong ống tay ngắn) và cẳng tay (khớp elbow*, cổ tay lọt trong bàn tay). */
const BARE_UPPER: readonly Ring[] = [
  [-0.012, 0, 0, 0],
  [-0.022, 0.03, 0.033, 0.033],
  [-0.036, 0.041, 0.044, 0.044],
  [-0.12, 0.04, 0.043, 0.043],
  [-0.195, 0.038, 0.041, 0.041],
  ...hingeCap(-0.22, 0.041, 0.93, -1, 3),
];
const BARE_FORE: readonly Ring[] = [...hingeCap(0, 0.039, 0.93, 1, 3), [-0.08, 0.035, 0.038, 0.038], [-0.15, 0.032, 0.035, 0.035], [-0.18, 0.03, 0.033, 0.033], [-0.2, 0, 0, 0]];

/**
 * Bàn tay "găng hở ngón cái" (khớp hand*, ngón dọc −Y cục bộ, lòng bàn tay trái hướng −X / phải +X): khối tròn dẹt theo
 * trục lòng bàn tay + ngón cái phía +Z cục bộ (buông tay: ngón cái hướng ra trước; chắp tay / ôm vật: hướng lên), hơi
 * lệch về phía lòng bàn tay. Dựng cho tay trái; tay phải = soi gương X.
 */
function handGeometry(): THREE.BufferGeometry {
  const mitten = ringStack(
    [
      [0.08, 0, 0, 0],
      [0.068, 0.036, 0.046, 0.046],
      [0.04, 0.051, 0.065, 0.065],
      [0.003, 0.06, 0.077, 0.077],
      [-0.038, 0.057, 0.073, 0.073],
      [-0.07, 0.044, 0.056, 0.056],
      [-0.086, 0.022, 0.028, 0.028],
      [-0.09, 0, 0, 0],
    ],
    10,
  );
  const thumb = ringStack(
    [
      [0.03, 0, 0, 0],
      [0.022, 0.0135, 0.0145, 0.0145],
      [0.008, 0.019, 0.02, 0.02],
      [-0.01, 0.0195, 0.0205, 0.0205],
      [-0.024, 0.016, 0.017, 0.017],
      [-0.033, 0, 0, 0],
    ],
    6,
  );
  // trục ngón cái (−Y của nó) chúc ra trước-xuống, nghiêng về phía lòng bàn tay
  const dir = new THREE.Vector3(-0.28, -0.42, 0.86).normalize();
  thumb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
  thumb.translate(-0.014, 0.004, 0.064);
  // lệch 5 mm về phía lòng bàn tay: chắp tay (lòng bàn tay lệch ~50° do giới hạn khung) hai bàn tay chạm nhau, không hở
  mitten.translate(-0.005, 0, 0);
  return mergeAll([mitten, thumb]);
}

/**
 * Hài vải (khớp foot*, tâm khớp cách sàn BODY.footY): đế gần phẳng, mũi thon hếch lên; gói trong elip nhấc chân của
 * motion.ts (nửa dài 0.145, nửa cao 0.055) nên chúc / hếch mũi không lún sàn.
 */
function shoeGeometry(): THREE.BufferGeometry {
  // [dọc (+Z), nửa ngang, dưới, trên, tâm nâng]
  const S: readonly (readonly [number, number, number, number, number])[] = [
    [-0.138, 0, 0, 0, -0.01],
    [-0.13, 0.04, 0.03, 0.03, -0.012],
    [-0.11, 0.06, 0.045, 0.045, -0.006],
    [-0.05, 0.071, 0.05, 0.054, 0],
    [0.03, 0.07, 0.051, 0.049, -0.001],
    [0.085, 0.056, 0.047, 0.034, -0.004],
    [0.112, 0.04, 0.036, 0.024, 0.002],
    [0.13, 0.024, 0.02, 0.016, 0.016],
    [0.142, 0, 0, 0, 0.032],
  ];
  // Dựng dọc −Y (gót ở trên) rồi xoay −90° quanh X: −Y → +Z (mũi), +Z cục bộ → +Y (nên "trước" của vòng = phía trên)
  const g = ringStack(
    S.map(([f, w, dn, up, cu]) => [-f, w, up, dn, cu] as Ring),
    8,
  );
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Cache hình tay / chân dùng chung (không dispose). */
const ARM_CACHE = new Map<string, THREE.BufferGeometry>();
function armGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = ARM_CACHE.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    ARM_CACHE.set(key, g);
  }
  return g;
}

/**
 * Vành bịt miệng mũ cà sa (khớp shoulderL, có cà sa): vành khăn úp xuống ở y −0.125 (5 mm trên mép dưới mũ ở −0.13), mép
 * trong nằm trong ống tay trên đã bóp (0.8 tiết diện), mép ngoài r 0.073 nằm trong ống mũ (dây cung 12 cạnh ≥ 0.0744).
 * Màu lót tối (một mesh riêng): nhìn vào miệng mũ (từ dưới, hay từ trước khi giơ tay) thấy lòng mũ tối như bóng đổ,
 * không thấy khe sâu tới áo trong (≈ 0.033…0.062) hay xuyên qua mũ.
 */
function capLiningGeometry(): THREE.BufferGeometry {
  const y = -0.125;
  const k = innerK(y);
  const n = 24;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    // tiết diện ống tay trên ở y (nội suy vòng −0.105 / −0.15), mặt trong (x < 0) bóp k
    pos.push(0.8 * 0.0553 * sx * (sx < 0 ? k : 1), y, 0.8 * 0.0618 * cz, 0.073 * sx, y, 0.073 * cz);
    nrm.push(0, -1, 0, 0, -1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a0 = i * 2;
    const a1 = ((i + 1) % n) * 2;
    // mặt úp xuống (−Y): (trong_i, trong_i+1, ngoài_i+1) theo chiều kim đồng hồ nhìn từ dưới
    idx.push(a0, a1, a1 + 1, a0, a1 + 1, a0 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Tay áo + bàn tay + hài cho một bộ đồ: thêm vào `r`. `cuffRole` = 'sleeve' thì cổ tay liền một khối với ống tay (lót tối
 * riêng); khác 'sleeve' thì cổ tay + lót trong là một khối màu viền (tiết kiệm draw call). `capLining` = có cà sa (mũ vai
 * trái) → thêm lót tối bịt miệng mũ.
 */
function addLimbs(r: Recipe, kind: SleeveKind, cuffRole: Role, capLining: boolean): void {
  if (capLining) r.use('shoulderL', 'lining', armGeo('capLining', capLiningGeometry));
  // ống tay trên ngắn (áo thun) không bóp: cánh tay trần thon bên trong đã cách thân
  const upper = armGeo(`upper:${kind}`, () => (kind === 'short' ? ringStack(upperSleeveRings(kind), SEG_ARM) : squeezeInner(ringStack(upperSleeveRings(kind), SEG_ARM))));
  const upperR = kind === 'short' ? upper : armGeo(`upperR:${kind}`, () => mirrorX(upper));
  const hand = armGeo('handL', handGeometry);
  const handR = armGeo('handR', () => mirrorX(hand));
  const shoe = armGeo('shoe', shoeGeometry);
  for (const s of ['L', 'R'] as const) {
    const sh: JointKey = s === 'L' ? 'shoulderL' : 'shoulderR';
    const el: JointKey = s === 'L' ? 'elbowL' : 'elbowR';
    r.use(sh, 'sleeve', s === 'L' ? upper : upperR, { shadow: true });
    if (kind === 'short') {
      r.use(sh, 'lining', armGeo('lining:short', () => ringStack(SHORT_LINING, SEG_ARM)));
      r.use(sh, 'skin', armGeo('bare:upper', () => ringStack(BARE_UPPER, 10)), { shadow: true });
      r.use(el, 'skin', armGeo('bare:fore', () => ringStack(BARE_FORE, 10)), { shadow: true });
    } else {
      const [tube, cuff, lining] = foreSleeveRings(kind);
      if (cuffRole === 'sleeve') {
        r.use(el, 'sleeve', armGeo(`fore:${kind}`, () => ringStack([...tube, ...cuff.slice(1)], SEG_ARM)), { shadow: true });
        r.use(el, 'lining', armGeo(`lining:${kind}`, () => ringStack(lining, SEG_ARM)));
      } else {
        r.use(el, 'sleeve', armGeo(`foreTube:${kind}`, () => ringStack(tube, SEG_ARM)), { shadow: true });
        r.use(el, cuffRole, armGeo(`cuff:${kind}`, () => ringStack([...cuff, ...lining.slice(1)], SEG_ARM)), { shadow: true });
      }
    }
    r.use(s === 'L' ? 'handL' : 'handR', 'skin', s === 'L' ? hand : handR, { shadow: true });
    r.use(s === 'L' ? 'footL' : 'footR', 'shoes', shoe, { shadow: true });
  }
}

// ───────────────────────── Đường cong + ống bám thân ─────────────────────────

/** y(θ) nội suy Catmull–Rom qua các điểm (θ tăng dần); ngoài khoảng thì giữ đầu mút. */
function curve(pts: readonly (readonly [number, number])[]): (th: number) => number {
  const n = pts.length;
  return (th) => {
    if (th <= pts[0]![0]) return pts[0]![1];
    if (th >= pts[n - 1]![0]) return pts[n - 1]![1];
    let i = 0;
    while (i < n - 2 && th > pts[i + 1]![0]) i++;
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    const h = p2[0] - p1[0];
    const t = (th - p1[0]) / h;
    // tiếp tuyến theo khoảng θ không đều
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * h;
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

/** Đường trên mặt thân theo θ ∈ [th0, th1], y = f(θ). */
function thetaPath(th0: number, th1: number, f: (th: number) => number): SurfacePath {
  return (t, o) => {
    o.theta = th0 + (th1 - th0) * t;
    o.y = f(o.theta);
  };
}

const _sp = new THREE.Vector3();
const _sn = new THREE.Vector3();
/** Điểm tâm (bán kính r) nằm trên mặt thân ở độ nổi `off` + r — trả [điểm, pháp tuyến mặt]. */
function onSurface(th: number, y: number, off: number, v: BodyVariant, joint?: BodyJoint): [THREE.Vector3, THREE.Vector3] {
  surfaceSample(th, y, off, v, _sp, _sn, joint);
  return [_sp.clone(), _sn.clone()];
}

/**
 * Ống tròn dọc đường tâm `pts` (khung: tiếp tuyến + pháp tuyến mặt `nrm`); bán kính rad(i, φ) (φ = 0 về phía pháp tuyến).
 * closed: nối vòng cuối với vòng đầu; không thì bịt hai đầu bằng đỉnh cực lùi ra `capLen`.
 */
function tubeAlong(
  pts: readonly THREE.Vector3[],
  nrm: readonly THREE.Vector3[],
  rad: (i: number, phi: number) => number,
  seg: number,
  closed: boolean,
  capLen = 0,
): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const U = new THREE.Vector3();
  const tan = (i: number, out: THREE.Vector3) => {
    const a = closed ? pts[(i - 1 + n) % n]! : pts[Math.max(0, i - 1)]!;
    const b = closed ? pts[(i + 1) % n]! : pts[Math.min(n - 1, i + 1)]!;
    return out.subVectors(b, a).normalize();
  };
  for (let i = 0; i < n; i++) {
    tan(i, T);
    N.copy(nrm[i]!).addScaledVector(T, -nrm[i]!.dot(T)).normalize();
    U.crossVectors(T, N);
    for (let k = 0; k < seg; k++) {
      const phi = (k / seg) * TAU;
      const r = rad(i, phi);
      const c = Math.cos(phi) * r;
      const s = Math.sin(phi) * r;
      pos.push(pts[i]!.x + N.x * c + U.x * s, pts[i]!.y + N.y * c + U.y * s, pts[i]!.z + N.z * c + U.z * s);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) {
    const s0 = i * seg;
    const s1 = ((i + 1) % n) * seg;
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      idx.push(s0 + k, s0 + k1, s1 + k1, s0 + k, s1 + k1, s1 + k);
    }
  }
  if (!closed) {
    for (const end of [0, n - 1]) {
      tan(end, T);
      const c = pts[end]!.clone().addScaledVector(T, end === 0 ? -capLen : capLen);
      const pi = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      const s0 = end * seg;
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % seg;
        if (end === 0) idx.push(pi, s0 + k1, s0 + k);
        else idx.push(pi, s0 + k, s0 + k1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Khối tròn (vòng tiết diện `rings`, trục Y) đặt tại `at`, trục Y quay theo `up`. */
function blob(rings: readonly Ring[], seg: number, at: THREE.Vector3, up: THREE.Vector3, spin = 0): THREE.BufferGeometry {
  const g = ringStack(rings, seg);
  if (spin) g.rotateY(spin);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize()));
  g.translate(at.x, at.y, at.z);
  return g;
}

// ───────────────────────── Cổ áo, cổ, gấu, đai ─────────────────────────

/** Bề rộng dải cổ áo (m) + độ nổi: cao hơn LAYER.trim 1.5 mm để mép cách mặt trên dải "da cổ" ≥ 1.9 mm; mặt trên ≤ 7.5 mm (dưới cà sa ≥ 1.5 mm). */
const COLLAR_W = 0.036;
const COLLAR_OFF = LAYER.trim + 0.0015;
/** Da cổ (dưới mọi viền cổ): 3 mm — dây cung lưới thân trên ở chỗ lõm vai→cổ nhô ra tới ~2.5 mm. */
const NECK_OFF = 0.003;
const NECK_THICK = 0.0006;
/**
 * Đỉnh dải da cổ: hàng 1.08 trên chỏm cổ (thân trên khép ở 1.09). Ngửa đầu (cười, cổ vũ: headX tới −0.27) mép dưới sọ
 * nhấc lên, chỏm cổ trên góc cổ (NECK.y1 1.064) lộ dưới cằm — phải là da chứ không phải màu áo.
 */
const NECK_TOP = 1.08;

/**
 * Cổ giao lĩnh (vạt trái đè vạt phải): đường tâm cổ áo theo θ — từ dưới nách phải (θ −1.36) chéo lên ngang ngực qua
 * điểm giao chữ "y" (θ 0, y 0.86) tới bên trái cổ, vòng sau gáy (sát chân tóc), sang bên phải cổ rồi xuống điểm giao.
 */
const GIAO_LINH = curve([
  [-1.36, 0.7],
  [-1.0, 0.745],
  [-0.5, 0.8],
  [0, 0.86],
  [0.25, 0.925],
  [0.45, 0.975],
  [0.7, 1.003],
  [1.1, 1.025],
  [1.8, 1.04],
  [Math.PI, 1.045],
  [TAU - 1.8, 1.04],
  [TAU - 1.1, 1.025],
  [TAU - 0.7, 1.003],
  [TAU - 0.45, 0.975],
  [TAU - 0.25, 0.925],
  [TAU, 0.86],
]);

/**
 * Dải cổ giao lĩnh trên khớp torso: A = mép vạt trái (dày hơn, nằm trên) từ nách phải lên qua trái cổ; B = phần sau gáy +
 * nét ngắn bên phải (mỏng hơn) bắt đầu dưới đầu A, kết thúc dưới A ở điểm giao — cùng màu nên chỗ chồng không lộ.
 */
function addGiaoLinh(r: Recipe, v: BodyVariant, sash: boolean): void {
  // có cà sa: A nằm trọn dưới tấm cà sa (mép trên cà sa từ sát cổ vai trái xuống dưới nách phải) → bỏ
  if (!sash)
    r.add('torso', 'collar', ribbonGeometry({ path: thetaPath(-1.36, 1.2, GIAO_LINH), width: COLLAR_W, offset: COLLAR_OFF, thickness: 0.002, joint: 'torso', segments: 24 }, v));
  // B vắt qua gờ vai→cổ (mặt lồi mạnh ở y ≈ 0.98, da cổ nằm dưới): lưới dày (48 × 2) để dây cung không võng sát da cổ
  r.add('torso', 'collar', ribbonGeometry({ path: thetaPath(0.95, TAU, GIAO_LINH), width: COLLAR_W, offset: COLLAR_OFF, thickness: 0.0008, joint: 'torso', segments: 48, acrossSegments: 2 }, v));
}

/** Hàng lưới thân trên (body.ts TORSO_ROWS) từ vai lên góc cổ — dải da cổ đặt hàng trùng để dây cung song song. */
const NECK_ROWS = [0.93, 0.97, 1.0, 1.025, 1.048, 1.064, NECK_TOP];
/** Bước cột lưới thân trên (cột ở θ = k·NECK_DTH) — dải da cổ đặt cột trùng cột thân. */
const NECK_DTH = TAU / RADIAL;

/**
 * Da cổ: dải quanh cổ (θ ∈ [−span, span], span = π thì khép kín) từ ngay dưới mép trên viền cổ (`neckline` = đường tâm
 * viền, ≥ `floor`) lên NECK_TOP (trên đó lọt trong sọ) — nhìn trước / từ dưới cằm thấy cổ da thay vì "cổ lọ" màu áo.
 * Hàng + cột lưới trùng của thân trên (span = k·NECK_DTH, cols = 2k): ở chỗ lõm vai→cổ dây cung hai lưới song song, khe
 * hở = NECK_OFF.
 */
function addNeck(r: Recipe, v: BodyVariant, neckline: (th: number) => number, floor: number, span: number, cols: number): void {
  const closed = span >= Math.PI;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // chỉ lấy các hàng thân trên cao hơn đáy thấp nhất của dải (cổ thấp như áo tiệc mới cần hàng 0.93 / 0.97)
  let lowY = NECK_TOP;
  for (let i = 0; i <= 64; i++) lowY = Math.min(lowY, Math.max(floor, neckline(-span + (2 * span * i) / 64) - 0.004));
  const rows = NECK_ROWS.filter((h) => h > lowY + 0.004);
  // hàng 0 = mép dưới quặp vào trong thân 2 mm (nhìn từ dưới cằm lên không lọt khe giữa dải da và thân áo), hàng 1 = mép dưới
  const nr = rows.length + 2;
  const nc = closed ? cols : cols + 1;
  for (let i = 0; i < nc; i++) {
    const th = -span + (2 * span * i) / cols;
    const y0 = Math.max(floor, neckline(th) - 0.004);
    let y = y0;
    for (let k = 0; k < nr; k++) {
      if (k > 1) y = Math.max(rows[k - 2]!, y + 0.002);
      surfaceSample(th, Math.min(y, NECK_TOP), k === 0 ? -0.002 : NECK_OFF + NECK_THICK, v, _sp, _sn, 'torso');
      pos.push(_sp.x, _sp.y, _sp.z);
      // mép quặp úp xuống: pháp tuyến chúc xuống (khớp chiều mặt, tối nhẹ như nếp gấp chân cổ)
      if (k === 0) _sn.multiplyScalar(0.4).setY(_sn.y - 1).normalize();
      nrm.push(_sn.x, _sn.y, _sn.z);
      uv.push(i / cols, k / (nr - 1));
    }
  }
  for (let i = 0; i < cols; i++) {
    const a = i * nr;
    const b = ((i + 1) % nc) * nr;
    // θ tăng (về +X) × y tăng → pháp tuyến hướng ra ngoài
    for (let k = 0; k < nr - 1; k++) idx.push(a + k, b + k, b + k + 1, a + k, b + k + 1, a + k + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  r.add('torso', 'skin', g);
}

/** Đường viền cổ áo kiểu monk cho dải da cổ: theo GIAO_LINH, trong khoảng chữ y lấy mép hai bên cổ. */
function giaoLinhNeckline(th: number): number {
  let t = th % TAU;
  if (t < 0) t += TAU;
  return t <= Math.PI ? GIAO_LINH(Math.max(0.45, t)) : GIAO_LINH(Math.min(TAU - 0.45, t));
}

/** Dải gấu áo (khớp skirt, bám mép gấu, morph bám mặt). */
function addHemBand(r: Recipe, v: BodyVariant): void {
  r.add('skirt', 'hem', bandGeometry({ y0: 0, y1: 0.036, followHem: true, offset: LAYER.trim, thickness: 0.0028, sit: true, segments: 48 }, v));
}

/**
 * Nút đai: θ (lệch phải chút so với giữa bụng) + độ cao tâm. Gần giữa bụng: đuôi lắc ngang (swayZ) đi ra ngoài mặt áo
 * chứ không lướt vào trong như khi nút ở sườn.
 */
const KNOT_TH = -0.15;
/** Gain đung đưa của đuôi đai: swayX dương lớn nhất khi loạng choạng ≈ 0.26 → đuôi 13 cm lùi vào ≈ 1.7 cm < khoảng hở. */
const BELT_GAIN = 0.5;
const BELT_Y = 0.604;

/**
 * Dây thừng xoắn (áo nâu rách): ống quanh gấu áo trên (khớp torso, y ≥ WAIST.lipY) — bán kính nhấp nhô theo cos(2φ − pha)
 * nên đọc ra 2 sợi xoắn; nút thắt bên phải-trước; hai đầu thừa (khớp skirt, lủng lẳng, đuôi tua) — `ends` cho buildRecipe.
 */
function addRopeBelt(r: Recipe, v: BodyVariant): void {
  const R = 0.0115;
  const n = 30;
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const [p, q] = onSurface((i / n) * TAU, BELT_Y, LAYER.trim + R, v, 'torso');
    pts.push(p);
    nrm.push(q);
  }
  r.add('torso', 'belt', tubeAlong(pts, nrm, (i, phi) => R * (1 + 0.17 * Math.cos(2 * phi - i * 1.7)), 6, true), { shadow: true });
  addKnot(r, v, 0.038);
  ropeEnd(r, v, KNOT_TH - 0.05, 0.45, 0.0095);
  ropeEnd(r, v, KNOT_TH + 0.07, 0.476, 0.0095);
}

/**
 * Nút thắt: khối tròn dẹt nổi trên đai, hạ thấp hơn đai một chút để trùm đầu trên của hai đuôi. Gắn khớp skirt (morph
 * bám mặt) cùng hai đuôi: đi bộ xoay ngực ±0.1 (đai tròn đều nên xoay không lộ) thì nút vẫn trùm đúng chỗ đuôi.
 */
function addKnot(r: Recipe, v: BodyVariant, size: number): void {
  const [p, q] = onSurface(KNOT_TH, BELT_Y - 0.008, LAYER.trim + size * 0.62, v, 'torso');
  const rings: Ring[] = [
    [0.62 * size, 0, 0, 0],
    [0.45 * size, 0.62 * size, 0.55 * size, 0.6 * size],
    [0.05 * size, size, 0.85 * size, 0.92 * size],
    [-0.4 * size, 0.78 * size, 0.7 * size, 0.75 * size],
    [-0.62 * size, 0, 0, 0],
  ];
  r.add('skirt', 'belt', addSitMorph(blob(rings, 6, p, q, 0.4), v), { shadow: true });
}

/** Một đầu thừa của dây thừng: treo dưới nút (khớp skirt, dangler), xuống tới `yEnd`, đuôi xơ tua. */
function ropeEnd(r: Recipe, v: BodyVariant, th: number, yEnd: number, R: number): void {
  const y0 = WAIST.lipY - 0.004;
  const n = 7;
  const pts: THREE.Vector3[] = [];
  const nrm: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const [p, q] = onSurface(th - 0.05 * t, y0 + (yEnd - y0) * t, LAYER.trim + R + 0.016, v, 'skirt');
    pts.push(p);
    nrm.push(q);
  }
  const geo = tubeAlong(pts, nrm, (i, phi) => (i === n - 1 ? R * 1.45 * (1 + 0.25 * Math.cos(5 * phi)) : R * (1 + 0.15 * Math.cos(2 * phi - i * 1.6))), 6, false, R * 1.6);
  addSitMorph(geo, v);
  const at = pts[0]!;
  r.hang('skirt', 'belt', geo, [at.x, at.y, at.z], BELT_GAIN);
}

/** Đai vải (áo lam): dải quanh gấu áo trên + nút + hai đuôi vải ngắn lủng lẳng. */
function addClothBelt(r: Recipe, v: BodyVariant): void {
  r.add('torso', 'belt', bandGeometry({ y0: WAIST.lipY + 0.002, y1: 0.638, offset: LAYER.trim, thickness: 0.003, joint: 'torso', segments: 32 }, v), {
    shadow: true,
  });
  addKnot(r, v, 0.034);
  // [lệch θ, dài, rộng, trôi θ, nổi thêm] — hai đuôi cách nhau, nổi khác nhau nên chạm nhau cũng không nháy mặt
  for (const [dt, len, w, drift, lift] of [
    [-0.05, 0.1, 0.03, -0.03, 0.008],
    [0.06, 0.08, 0.028, 0.02, 0.012],
  ] as const) {
    const th = KNOT_TH + dt;
    const y0 = WAIST.lipY - 0.004;
    const path: SurfacePath = (t, o) => {
      o.theta = th + drift * t;
      o.y = y0 - len * t;
    };
    const geo = ribbonGeometry({ path, width: w, offset: LAYER.kasaya + lift, thickness: 0.003, sit: true, capStart: false, segments: 3, acrossSegments: 1 }, v);
    const [p] = onSurface(th, y0, LAYER.kasaya + lift, v, 'skirt');
    r.hang('skirt', 'belt', geo, [p.x, p.y, p.z], BELT_GAIN);
  }
}

// ───────────────────────── Miếng vá (áo nâu rách) ─────────────────────────

/** Miếng vá: khớp, dải θ, biên dưới/trên ở θ0, độ xiên (m/rad). Tránh cổ áo, dây thừng, chỗ tay buông. */
const PATCHES: readonly { joint: 'skirt' | 'torso'; th0: number; th1: number; y0: number; y1: number; tilt: number }[] = [
  { joint: 'skirt', th0: 0.2, th1: 0.62, y0: 0.2, y1: 0.31, tilt: 0.05 },
  { joint: 'torso', th0: 0.34, th1: 0.74, y0: 0.668, y1: 0.756, tilt: -0.035 },
  { joint: 'skirt', th0: 2.72, th1: 3.18, y0: 0.15, y1: 0.262, tilt: 0.035 },
];

/** Miếng vá bám thân (màu sáng hơn) + mũi khâu thưa (gạch ngắn nổi trên miếng vá, cách mép 6 mm). */
function addPatches(r: Recipe, v: BodyVariant): void {
  const thick = 0.0025;
  const stOff = LAYER.trim + thick + 0.0017;
  for (const P of PATCHES) {
    const lo = (th: number) => P.y0 + P.tilt * (th - P.th0);
    const hi = (th: number) => P.y1 + P.tilt * (th - P.th0);
    const sit = P.joint === 'skirt';
    r.add(P.joint, 'patch', patchGeometry({ theta0: P.th0, theta1: P.th1, y0: lo, y1: hi, offset: LAYER.trim, thickness: thick, sit, joint: P.joint, segU: 5, segV: 3 }, v));
    const [c] = onSurface((P.th0 + P.th1) / 2, (P.y0 + P.y1) / 2, 0, v, P.joint);
    const rr = Math.hypot(c.x, c.z);
    const ins = 0.007;
    const a0 = P.th0 + ins / rr;
    const a1 = P.th1 - ins / rr;
    const corner: [number, number][] = [
      [a0, lo(a0) + ins],
      [a1, lo(a1) + ins],
      [a1, hi(a1) - ins],
      [a0, hi(a0) - ins],
    ];
    for (let s = 0; s < 4; s++) {
      const [t0, y0] = corner[s]!;
      const [t1, y1] = corner[(s + 1) % 4]!;
      const len = Math.hypot((t1 - t0) * rr, y1 - y0);
      const nd = Math.max(1, Math.round(len / 0.05));
      for (let d = 0; d < nd; d++) {
        const u0 = (d + 0.5) / nd - 0.0065 / len;
        const u1 = (d + 0.5) / nd + 0.0065 / len;
        const path: SurfacePath = (t, o) => {
          const u = u0 + (u1 - u0) * t;
          o.theta = t0 + (t1 - t0) * u;
          o.y = y0 + (y1 - y0) * u;
        };
        const g = ribbonGeometry(
          { path, width: 0.0035, offset: stOff, thickness: 0.0008, segments: 1, acrossSegments: 1, capStart: false, capEnd: false, sit, joint: P.joint },
          v,
        );
        r.add(P.joint, 'stitch', g);
      }
    }
  }
}

// ───────────────────────── Đồ thường ─────────────────────────

/** Viền cổ tròn (vòng kín quanh cổ) theo y ở trước (θ 0), hai bên (±1.4) và gáy (π). */
function roundNeck(front: number, side: number, back: number): (th: number) => number {
  const f = curve([
    [-Math.PI, back],
    [-1.4, side],
    [-0.6, front + 0.3 * (side - front)],
    [0, front],
    [0.6, front + 0.3 * (side - front)],
    [1.4, side],
    [Math.PI, back],
  ]);
  return (th) => {
    let t = th % TAU;
    if (t > Math.PI) t -= TAU;
    else if (t < -Math.PI) t += TAU;
    return f(t);
  };
}

/** Viền cổ tròn kín (khớp torso) + da cổ phía trên. */
function addRoundNeck(r: Recipe, v: BodyVariant, neck: (th: number) => number, width: number, role: Role): void {
  r.add('torso', role, ribbonGeometry({ path: thetaPath(-Math.PI, Math.PI, neck), closed: true, width, offset: COLLAR_OFF, thickness: 0.002, joint: 'torso', segments: 48 }, v));
  addNeck(r, v, neck, 0, Math.PI, RADIAL);
}

/** Khuy tròn dẹt nổi trên mặt thân (khớp torso) tại (θ, y), nằm trên lớp `off`. */
function addButton(r: Recipe, v: BodyVariant, th: number, y: number, rad: number, off: number): void {
  const h = rad * 0.45;
  const [p, q] = onSurface(th, y, off + h, v, 'torso');
  const rings: Ring[] = [[h, 0, 0, 0], [h * 0.75, rad * 0.75, rad * 0.75, rad * 0.75], [0, rad, rad, rad], [-h, rad * 0.8, rad * 0.8, rad * 0.8], [-h * 1.05, 0, 0, 0]];
  r.add('torso', 'button', blob(rings, 8, p, q));
}

const TEE_NECK = roundNeck(0.975, 1.02, 1.04);
const PARTY_NECK = roundNeck(0.918, 1.0, 1.035);
const BABA_NECK = roundNeck(0.98, 1.022, 1.042);
const VEST_NECK = roundNeck(0.988, 1.025, 1.046);
/** Vest: mép chữ V của áo khoác (đáy V ở y 0.765). */
const VEST_V = (th: number) => 0.765 + 0.42 * Math.abs(th);

/** Áo bà ba: cổ tròn màu nhấn + 4 khuy dọc giữa ngực. */
function addBaBa(r: Recipe, v: BodyVariant): void {
  addRoundNeck(r, v, BABA_NECK, 0.026, 'collar');
  for (const y of [0.93, 0.82, 0.74, 0.665]) addButton(r, v, 0, y, 0.013, LAYER.trim);
}

/**
 * Vest: áo sơ mi trắng trong chữ V (mảng LAYER.trim), cổ sơ mi trắng quanh cổ, ve áo (2 dải tối hơn nằm trên mép V,
 * LAYER.kasaya), cà vạt (LAYER.kasayaTrim) + nút thắt, 2 khuy áo khoác dưới chữ V.
 */
function addVest(r: Recipe, v: BodyVariant): void {
  const w = 0.56;
  r.add('torso', 'shirt', patchGeometry({ theta0: -w, theta1: w, y0: (th) => VEST_V(th) - 0.01, y1: (th) => VEST_NECK(th) - 0.003, offset: LAYER.trim, joint: 'torso', segU: 8, segV: 4 }, v));
  addRoundNeck(r, v, VEST_NECK, 0.03, 'shirt');
  for (const s of [1, -1] as const) {
    const path: SurfacePath = (t, o) => {
      o.theta = s * (0.035 + (w - 0.04) * t);
      o.y = VEST_V(o.theta);
    };
    r.add('torso', 'lapel', ribbonGeometry({ path, width: 0.045, align: s > 0 ? 'right' : 'left', offset: LAYER.kasaya, thickness: 0.003, joint: 'torso', segments: 8 }, v), {
      shadow: false,
    });
  }
  const tie: SurfacePath = (t, o) => {
    o.theta = 0;
    o.y = 0.955 - (0.955 - 0.785) * t;
  };
  r.add('torso', 'tie', ribbonGeometry({ path: tie, width: 0.036, offset: LAYER.kasayaTrim, thickness: 0.0025, joint: 'torso', segments: 5 }, v));
  const [kp, kq] = onSurface(0, 0.962, LAYER.kasayaTrim + 0.012, v, 'torso');
  r.add('torso', 'tie', blob([[0.014, 0, 0, 0], [0.008, 0.02, 0.012, 0.012], [-0.008, 0.016, 0.011, 0.011], [-0.014, 0, 0, 0]], 8, kp, kq));
  for (const y of [0.715, 0.665]) addButton(r, v, 0, y, 0.014, LAYER.trim);
}

// ───────────────────────── Chuỗi hạt, dây chuyền ─────────────────────────

/** Vòng đeo cổ: trước võng xuống ngực, hai bên đi giữa cổ và quả cầu vai, sau gáy ngang chân cổ. */
function neckLoop(front: number, mid: number, side: number, back: number): (th: number) => number {
  return roundNeckLoop(curve([[-Math.PI, back], [-1.6, side], [-1.0, mid], [-0.5, front + 0.25 * (mid - front)], [0, front], [0.5, front + 0.25 * (mid - front)], [1.0, mid], [1.6, side], [Math.PI, back]]));
}
function roundNeckLoop(f: (th: number) => number): (th: number) => number {
  return (th) => {
    let t = th % TAU;
    if (t > Math.PI) t -= TAU;
    else if (t < -Math.PI) t += TAU;
    return f(t);
  };
}

const BEAD_LOOP = neckLoop(0.84, 0.975, 1.045, 1.05);
const CHAIN_LOOP = neckLoop(0.895, 0.99, 1.04, 1.046);

/** Lấy mẫu đường tâm vòng (độ nổi `off`) dày rồi chia đều theo độ dài → `n` điểm + pháp tuyến (θ bắt đầu ở 0 = giữa ngực). */
function loopSamples(f: (th: number) => number, off: number, v: BodyVariant, n: number): { p: THREE.Vector3[]; q: THREE.Vector3[]; len: number } {
  const M = 360;
  const dense: THREE.Vector3[] = [];
  const dn: THREE.Vector3[] = [];
  const acc: number[] = [0];
  for (let i = 0; i <= M; i++) {
    const th = (i / M) * TAU;
    const [p, q] = onSurface(th, f(th), off, v, 'torso');
    dense.push(p);
    dn.push(q);
    if (i > 0) acc.push(acc[i - 1]! + p.distanceTo(dense[i - 1]!));
  }
  const len = acc[M]!;
  const p: THREE.Vector3[] = [];
  const q: THREE.Vector3[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * len;
    while (j < M - 1 && acc[j + 1]! < s) j++;
    const t = (s - acc[j]!) / (acc[j + 1]! - acc[j]! || 1);
    p.push(dense[j]!.clone().lerp(dense[j + 1]!, t));
    q.push(dn[j]!.clone().lerp(dn[j + 1]!, t).normalize());
  }
  return { p, q, len };
}

/**
 * Độ nổi mặt trong của chuỗi hạt / dây chuyền: trên cà sa (viền ≤ 15 mm, khoen ở trên vòng) và trên cà vạt / khuy áo
 * (≤ 16 mm) thì LAYER.top; còn lại sát hơn — ngay trên viền cổ (mặt trên 7.5 mm) — để nhìn nghiêng không thấy hạt lơ lửng.
 */
function accOffset(robe: string, st: RobeStyle): number {
  return st.sash || robe === 'civ_vest' || robe === 'civ_ba_ba' ? LAYER.top : LAYER.kasaya;
}

/** Bán kính hạt chuỗi / hạt đầu (hạt "mẹ" giữa ngực, nối tua). */
const BEAD_R = 0.023;
const GURU_R = 0.026;

/**
 * Tràng hạt: các hạt tròn sát nhau trên lớp ngoài cùng (mặt trong ở độ nổi `off`, xem accOffset), hạt mẹ to hơn ở
 * giữa ngực; tua đỏ lủng lẳng dưới hạt mẹ (dangler, khớp torso, treo cách ngực để đung đưa không chạm áo).
 */
function addPrayerBeads(r: Recipe, v: BodyVariant, off: number): void {
  const probe = loopSamples(BEAD_LOOP, off + BEAD_R, v, 8);
  const n = Math.max(12, Math.floor((probe.len - 2 * GURU_R) / (2 * BEAD_R * 1.04)));
  const s = loopSamples(BEAD_LOOP, off + BEAD_R, v, n + 1);
  // hạt hơi tròn trống (6 cạnh × 4 vòng = 24 tam giác, pháp tuyến trơn đọc ra tròn)
  const ball = (rad: number): Ring[] => [[rad, 0, 0, 0], [0.42 * rad, 0.93 * rad, 0.93 * rad, 0.93 * rad], [-0.42 * rad, 0.93 * rad, 0.93 * rad, 0.93 * rad], [-rad, 0, 0, 0]];
  for (let k = 1; k <= n; k++) r.add('torso', 'bead', blob(ball(BEAD_R), 6, s.p[k]!, s.q[k]!));
  const [gp, gq] = onSurface(0, BEAD_LOOP(0) - 0.006, off + GURU_R, v, 'torso');
  r.add('torso', 'bead', blob(ball(GURU_R), 8, gp, gq));
  // Tua: dây ngắn + chùm tua loe, treo thẳng dưới mặt trước hạt mẹ (lệch ra ngoài 1.2 cm theo pháp tuyến) — loạng choạng
  // (swayX ≈ 0.26) tua lùi vào ≈ 2 cm vẫn chưa chạm ngực / cà sa.
  const top = gp.clone().addScaledVector(gq, 0.012).add(new THREE.Vector3(0, -GURU_R * 0.75, 0));
  const tassel = ringStack(
    [
      [0, 0, 0, 0],
      [-0.004, 0.006, 0.006, 0.006],
      [-0.022, 0.0055, 0.0055, 0.0055],
      [-0.03, 0.011, 0.011, 0.011],
      [-0.052, 0.017, 0.017, 0.017],
      [-0.07, 0.02, 0.02, 0.02],
      [-0.074, 0.012, 0.012, 0.012],
      [-0.076, 0, 0, 0],
    ],
    8,
  );
  tassel.translate(top.x, top.y, top.z);
  r.hang('torso', 'tassel', tassel, [top.x, top.y, top.z], 1);
}

/** Dây chuyền vàng: mắt xích to/nhỏ xen kẽ (ống mảnh trên lớp ngoài cùng) + mặt dây tròn dẹt áp ngực, có khoen nối. */
function addGoldChain(r: Recipe, v: BodyVariant, off: number): void {
  const R = 0.0055;
  const s = loopSamples(CHAIN_LOOP, off + R * 1.3, v, 40);
  r.add('torso', 'gold', tubeAlong(s.p, s.q, (i) => R * (i % 2 ? 1.3 : 0.75), 4, true));
  const pr = 0.03;
  const ph = 0.0045;
  const [mp, mq] = onSurface(0, CHAIN_LOOP(0) - pr - 0.003, off + ph, v, 'torso');
  const medal: Ring[] = [
    [ph, 0, 0, 0],
    [ph, pr * 0.62, pr * 0.62, pr * 0.62],
    [ph * 0.55, pr * 0.82, pr * 0.82, pr * 0.82],
    [ph * 0.75, pr * 0.92, pr * 0.92, pr * 0.92],
    [0, pr, pr, pr],
    [-ph, pr * 0.94, pr * 0.94, pr * 0.94],
    [-ph, 0, 0, 0],
  ];
  r.add('torso', 'gold', blob(medal, 14, mp, mq), { shadow: false });
  // khoen nối mặt dây với dây
  const [bp, bq] = onSurface(0, CHAIN_LOOP(0) - 0.006, off + R * 1.4, v, 'torso');
  r.add('torso', 'gold', blob([[0.005, 0, 0, 0], [0.004, 0.006, 0.006, 0.006], [-0.004, 0.006, 0.006, 0.006], [-0.005, 0, 0, 0]], 6, bp, bq));
}

// ───────────────────────── Công thức theo ngoại hình (cache) ─────────────────────────

/** Bộ áo của ngoại hình: Phương Trượng đè lên áo đang mặc. */
function robeKey(look: AvatarLook): string {
  return look.isHost ? 'host' : look.outfit.robe;
}

/** Kiểu tay áo + vai trò vật liệu của cổ tay áo ('sleeve' = liền ống tay). */
function sleeveOf(robe: string, st: RobeStyle): [SleeveKind, Role] {
  if (st.short) return ['short', 'sleeve'];
  if (robe === 'civ_vest') return ['narrow', 'shirt'];
  if (robe.startsWith('civ_') || robe === 'robe_nau_rach' || robe === 'robe_lam') return ['narrow', 'sleeve'];
  return [st.wide ? 'wide' : 'narrow', 'cuff'];
}

const RECIPES = new Map<string, Piece[]>();

/** Mọi mảnh hình (chưa có vật liệu) của một ngoại hình — dựng một lần, dùng chung giữa các nhân vật. */
function recipeOf(look: AvatarLook, st: RobeStyle, v: BodyVariant): Piece[] {
  const robe = robeKey(look);
  const acc = look.outfit.accessory === 'trang_hat' || look.outfit.accessory === 'day_chuyen_vang' ? look.outfit.accessory : '';
  const key = `${robe}|${acc}`;
  let pieces = RECIPES.get(key);
  if (pieces) return pieces;
  const r = new Recipe();
  r.use('skirt', 'lower', skirtGeometry(v), { shadow: true, sit: true });
  r.use('torso', 'upper', torsoGeometry(v), { shadow: true });
  switch (robe) {
    case 'civ_ao_thun':
      addRoundNeck(r, v, TEE_NECK, 0.022, 'collar');
      break;
    case 'civ_party':
      addRoundNeck(r, v, PARTY_NECK, 0.018, 'collar');
      break;
    case 'civ_ba_ba':
      addBaBa(r, v);
      break;
    case 'civ_vest':
      addVest(r, v);
      break;
    default:
      // Tu sĩ: cổ giao lĩnh + da cổ + dải gấu (áo rách thì gấu răng cưa của body.ts, không viền).
      addGiaoLinh(r, v, !!st.sash);
      addNeck(r, v, giaoLinhNeckline, 0.975, 15 * NECK_DTH, 30);
      if (!st.ragged) addHemBand(r, v);
      if (robe === 'robe_nau_rach') {
        addPatches(r, v);
        addRopeBelt(r, v);
      } else if (robe === 'robe_lam') addClothBelt(r, v);
  }
  const [kind, cuff] = sleeveOf(robe, st);
  addLimbs(r, kind, cuff, !!st.sash);
  if (acc === 'trang_hat') addPrayerBeads(r, v, accOffset(robe, st));
  else if (acc === 'day_chuyen_vang') addGoldChain(r, v, accOffset(robe, st));
  pieces = r.done();
  for (const p of pieces) {
    p.geo.userData.shared = true;
    p.geo.userData.outfit = true;
  }
  RECIPES.set(key, pieces);
  return pieces;
}

// ───────────────────────── Dựng ─────────────────────────

const NO_PIVOT: V3 = [0, 0, 0];

/**
 * Thân + áo quần + tay áo + bàn tay + hài + phụ kiện trên thân; cà sa (st.sash) do kasaya.ts dựng rồi gộp vào. Hình là
 * cache dùng chung — dispose() chỉ gỡ mesh khỏi khớp (và gọi dispose của cà sa).
 */
export const buildOutfit: BuildOutfit = (look: AvatarLook, j: Joints, mat: MatFactory): PartBuild => {
  const st = robeStyle(look);
  const v = bodyVariant(look);
  const added: THREE.Object3D[] = [];
  const sit: THREE.Mesh[] = [];
  const danglers: Dangler[] = [];
  for (const p of recipeOf(look, st, v)) {
    const [color, opts] = roleMat(p.role, st, look);
    const m = new THREE.Mesh(p.geo, mat(p.role, color, opts));
    m.castShadow = p.shadow;
    // Nhận bóng như mặt/mũ (vào bóng mái hiên thì cả người cùng tối, không chỉ cái đầu).
    m.receiveShadow = true;
    const parent = j[p.joint];
    if (p.hang) {
      // Nhóm xoay quanh điểm treo; mesh (body space) lùi về đúng chỗ.
      const piv = p.body ? PIVOT.waist : NO_PIVOT;
      const g = new THREE.Group();
      g.position.set(p.hang.at[0] - piv[0], p.hang.at[1] - piv[1], p.hang.at[2] - piv[2]);
      m.position.set(-p.hang.at[0], -p.hang.at[1], -p.hang.at[2]);
      g.add(m);
      parent.add(g);
      added.push(g);
      danglers.push({ obj: g, gain: p.hang.gain });
    } else {
      if (p.body) alignToBody(m, PIVOT.waist);
      parent.add(m);
      added.push(m);
    }
    if (p.sit) {
      m.updateMorphTargets();
      sit.push(m);
    }
  }
  const kas = st.sash ? buildKasaya(look, st, j, mat) : null;
  return {
    sitMorph: kas ? [...sit, ...kas.sitMorph] : sit,
    danglers: kas ? [...danglers, ...kas.danglers] : danglers,
    dispose() {
      for (const o of added) o.removeFromParent();
      kas?.dispose();
    },
  };
};
