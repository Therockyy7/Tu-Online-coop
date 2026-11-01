// Đôi tay góc nhìn thứ nhất: găng tròn có ngón cái + khớp ngón, ống tay chuông có lót/viền theo bộ áo, lò xo mượt, nhún theo bước.
//
// Không gian camera (nhìn −Z, +X phải, +Y lên). Mỗi tay: nhóm bàn tay (tâm găng) + nhóm ống tay (gốc = cổ tay, chạy về khuỷu
// ảo ngoài khung hình). Tư thế = lớp nền (lò xo chậm, đổi hoạt ảnh mềm) + lớp dao động (lò xo nhanh, giữ nhịp động tác,
// cùng nhịp với motion.ts); đổi hoạt ảnh thì gộp lớp dao động vào lớp nền nên không giật. Vật cầm giữ thẳng như bản cũ, tay
// nắm khít cán; tay trái nắm cán chổi / rìu / nắp bình lắc. Hình theo ngoại hình cache cấp module (dùng chung, không
// dispose); vật liệu riêng mỗi view (matUnique, màu trơn), giải phóng trong dispose().
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AnimId, HeldItem } from '@shared/index';
import type { AvatarLook, CreateFirstPersonView, FirstPersonHandle } from '../api';
import { kit } from '../kit';
import { createHeldItemMesh, gripStyle, type GripStyle } from '../props';
import { TOOL_FOR as TOOL_OF, buildTool } from './handheld';
import { prostrateDip } from './motion';
import type { HandheldBuild, MatFactory, MatOpts, ToolKind } from './rig';
import { robeStyle, type RobeStyle } from './style';

// ───────────────────────── Tiện ích ─────────────────────────

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const frac = (x: number): number => x - Math.floor(x);
/** Smoothstep 0..1. */
const sm = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
/** Smoothstep trên đoạn [a, b]. */
const smr = (x: number, a: number, b: number): number => sm((x - a) / (b - a));
/** Vòm 0 → 1 → 0 trên [0, 1] (ngoài đoạn = 0). */
const arc = (x: number): number => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));

/** Nhân màu hex (sRGB) với k (< 1 tối hơn) — như outfit.ts. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

// ───────────────────────── Ống tiện tiết diện quả trứng (như outfit.ts) ─────────────────────────

/**
 * Vòng tiết diện quanh trục Y cục bộ: [y, nửa ngang X, tầm +Z, tầm −Z, tâm lệch Z]. rx = zf = zb = 0 → đỉnh cực.
 * Đi xuống −Y thì mặt ngoài hướng ra; đi ngược lên +Y thì mặt hướng vào trục (lớp lót).
 */
type Ring = readonly [y: number, rx: number, zf: number, zb: number, cz?: number];

function ringStack(rings: readonly Ring[], seg: number, palmK = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const start: number[] = [];
  const pole: boolean[] = [];
  const nr = rings.length - 1;
  rings.forEach(([y, rx, zf, zb, cz = 0]) => {
    start.push(pos.length / 3);
    const p = rx <= 0 && zf <= 0 && zb <= 0;
    pole.push(p);
    if (p) {
      pos.push(0, y, cz);
      return;
    }
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // palmK < 1: dẹt phía −X (lòng bàn tay trái).
      pos.push(rx * s * (s < 0 ? palmK : 1), y, cz + (c >= 0 ? zf : zb) * c);
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
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Lật gương X (tay trái → tay phải), đảo chiều quấn để mặt ngoài vẫn hướng ra. */
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
  g.computeVertexNormals();
  return g;
}

/** Gộp hình (chỉ giữ position + normal), giải phóng bản lẻ. */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of list) {
    if (!g.index) g.setIndex(Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  }
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('fpHands: không gộp được hình');
  for (const g of list) g.dispose();
  m.computeBoundingSphere();
  return m;
}

// ───────────────────────── Bàn tay (găng tròn + ngón cái + khớp ngón) ─────────────────────────

/** Tỉ lệ tay góc nhìn thứ nhất so với tay góc thứ ba (outfit.ts). */
const S = 0.85;
/** Nửa dày (trục lòng bàn tay X), nửa rộng (Z), đỉnh cổ tay (+Y), đầu ngón (−Y) của găng — đúng dáng outfit.ts × S. */
const MIT = { hx: 0.06 * S, hz: 0.077 * S, top: 0.08 * S, tip: 0.09 * S } as const;
/**
 * Tâm bàn tay → điểm xoay cổ tay (sát đỉnh găng) theo +Y cục bộ = miệng tay áo. Đặt sát đỉnh để phần găng phình rộng
 * cách xa mép tay áo: cổ tay gập ~30° mép chuông vẫn không cắt vào găng; khoảng hở lộ một đoạn cổ tay da.
 */
const WRIST = 0.064;

/**
 * Bàn tay TRÁI theo khung cục bộ (như outfit.ts): ngón dọc −Y, lòng bàn tay hướng −X (dẹt hơn mặt mu), ngón cái phía +Z
 * hơi lệch về lòng bàn tay; mu bàn tay (+X) có 4 khớp ngón nhô khẽ; cổ tay da ngắn chui vào ống tay áo.
 */
function handGeometry(): THREE.BufferGeometry {
  // Găng: siêu elip — nửa trên (cổ tay) tròn, nửa dưới (đầu ngón) vuông vức hơn như outfit.ts.
  const rings: Ring[] = [[MIT.top, 0, 0, 0]];
  const N = 7;
  for (let i = 1; i <= N; i++) {
    const th = (Math.PI / 2) * (i / N);
    const r = Math.sin(th);
    rings.push([MIT.top * Math.cos(th), MIT.hx * r, MIT.hz * r, MIT.hz * r]);
  }
  for (let i = N - 1; i >= 1; i--) {
    const th = (Math.PI / 2) * (i / N);
    const r = Math.pow(Math.sin(th), 0.8);
    rings.push([-MIT.tip * Math.cos(th), MIT.hx * r, MIT.hz * r, MIT.hz * r]);
  }
  rings.push([-MIT.tip, 0, 0, 0]);
  const mitten = ringStack(rings, 18, 0.84);
  // Ngón cái: chúc ra trước-xuống, nghiêng về phía lòng bàn tay (như outfit.ts).
  const thumb = ringStack(
    [
      [0.03 * S, 0, 0, 0],
      [0.022 * S, 0.0135 * S, 0.0145 * S, 0.0145 * S],
      [0.008 * S, 0.019 * S, 0.02 * S, 0.02 * S],
      [-0.01 * S, 0.0195 * S, 0.0205 * S, 0.0205 * S],
      [-0.024 * S, 0.016 * S, 0.017 * S, 0.017 * S],
      [-0.033 * S, 0, 0, 0],
    ],
    10,
  );
  const dir = new THREE.Vector3(-0.28, -0.42, 0.86).normalize();
  thumb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
  thumb.translate(-0.014 * S, 0.004 * S, 0.064 * S);
  const parts = [mitten, thumb];
  // Khớp ngón: 4 u tròn dẹt lún ~70% vào mu bàn tay ở hàng gốc ngón (y ≈ 0), ngón trỏ (phía ngón cái +Z) to hơn chút.
  for (const [z, k] of [
    [-0.036, 0.85],
    [-0.012, 0.95],
    [0.012, 1],
    [0.036, 1],
  ] as const) {
    const xs = MIT.hx * Math.sqrt(Math.max(0, 1 - (z / MIT.hz) ** 2));
    const kn = new THREE.SphereGeometry(0.0095 * k, 8, 6);
    kn.scale(0.75, 1, 1.15);
    kn.translate(xs - 0.0045, -0.002, z);
    parts.push(kn);
  }
  // Cổ tay da: ống ngắn từ trong găng lên trong ống tay áo (lộ ra khi tay áo tuột về khuỷu).
  parts.push(
    ringStack(
      [
        [0.115, 0.02, 0.023, 0.023],
        [0.09, 0.023, 0.027, 0.027],
        [0.05, 0.026, 0.031, 0.031],
      ],
      10,
    ),
  );
  return mergeAll(parts);
}

// ───────────────────────── Ống tay áo ─────────────────────────
//
// Khung ống tay (camera space, mỗi khung hình): gốc = điểm xoay cổ tay (trong găng), +Y dọc cẳng tay về phía khuỷu
// (chạy ra khỏi khung hình), +Z ≈ hướng lên, −Z = phía võng xuống (túi tay áo rộng). Miệng tay áo ở y ≈ 0: chuông loe,
// mép cuộn vào, lót tối khép kín bên trong — bàn tay ló ra từ lớp lót (như cẳng tay áo của outfit.ts × S).

/** Kiểu tay áo: hẹp, rộng (áo tràng, Phương Trượng), ngắn (áo thun — cẳng tay trần). */
type SleeveKind = 'narrow' | 'wide' | 'short';

interface SleeveGeo {
  /** Ống ngoài (vải áo). */
  readonly tube: THREE.BufferGeometry;
  /** Miệng chuông (vải áo hoặc viền cổ tay); null = áo thun. */
  readonly cuff: THREE.BufferGeometry | null;
  readonly lining: THREE.BufferGeometry;
  /** Cẳng tay trần (áo thun). */
  readonly skin: THREE.BufferGeometry | null;
  /** Miếng vá trên cẳng tay áo (áo nâu rách). */
  readonly patch: THREE.BufferGeometry | null;
}

/** [ống, miệng chuông, lót] theo kiểu tay áo dài. */
function sleeveRings(kind: 'narrow' | 'wide'): [Ring[], Ring[], Ring[]] {
  if (kind === 'wide') {
    // Phần loe thêm dồn về −Z (võng xuống dưới cẳng tay như túi áo); phía trên không phình.
    return [
      [
        [1.0, 0.064, 0.064, 0.064],
        [0.6, 0.06, 0.06, 0.062],
        [0.35, 0.056, 0.054, 0.066],
        [0.2, 0.0545, 0.052, 0.072],
        [0.11, 0.055, 0.0515, 0.08],
        [0.055, 0.0565, 0.052, 0.086],
      ],
      [
        [0.055, 0.0565, 0.052, 0.086],
        [0.032, 0.0588, 0.0545, 0.0905],
        [0.012, 0.0598, 0.0555, 0.093],
        [0.002, 0.0585, 0.0545, 0.0905],
        [-0.002, 0.0555, 0.0515, 0.085],
        [0.001, 0.0515, 0.048, 0.079],
      ],
      [
        [0.001, 0.0515, 0.048, 0.079],
        [0.02, 0.048, 0.045, 0.07],
        [0.045, 0.035, 0.032, 0.046],
        [0.062, 0.016, 0.015, 0.02],
        [0.067, 0, 0, 0],
      ],
    ];
  }
  return [
    [
      [1.0, 0.064, 0.064, 0.064],
      [0.6, 0.06, 0.06, 0.06],
      [0.35, 0.0555, 0.0555, 0.0555],
      [0.2, 0.0515, 0.0515, 0.0515],
      [0.1, 0.0505, 0.0505, 0.0505],
      [0.045, 0.051, 0.051, 0.051],
    ],
    [
      [0.045, 0.051, 0.051, 0.051],
      [0.03, 0.0538, 0.0538, 0.0538],
      [0.012, 0.0556, 0.0556, 0.0556],
      [0.002, 0.0546, 0.0546, 0.0546],
      [-0.002, 0.0515, 0.0515, 0.0515],
      [0.001, 0.0475, 0.0475, 0.0475],
    ],
    [
      [0.001, 0.0475, 0.0475, 0.0475],
      [0.018, 0.0445, 0.0445, 0.0445],
      [0.038, 0.034, 0.034, 0.034],
      [0.05, 0.016, 0.016, 0.016],
      [0.054, 0, 0, 0],
    ],
  ];
}

/** Áo thun: ống tay ngắn (mép ở bắp tay, y ≈ 0.29) + lót; cẳng tay trần từ trong găng chạy ra khỏi khung hình. */
const SHORT_TUBE: readonly Ring[] = [
  [1.0, 0.066, 0.066, 0.066],
  [0.5, 0.063, 0.063, 0.063],
  [0.33, 0.061, 0.061, 0.061],
  [0.3, 0.06, 0.06, 0.06],
  [0.292, 0.0575, 0.0575, 0.0575],
  [0.296, 0.054, 0.054, 0.054],
];
const SHORT_LINING: readonly Ring[] = [
  [0.296, 0.054, 0.054, 0.054],
  [0.31, 0.046, 0.046, 0.046],
  [0.33, 0.036, 0.036, 0.036],
  [0.34, 0, 0, 0],
];
const BARE_FORE: readonly Ring[] = [
  [1.0, 0.04, 0.04, 0.04],
  [0.5, 0.038, 0.038, 0.038],
  [0.22, 0.034, 0.035, 0.035],
  [0.12, 0.03, 0.031, 0.031],
  [0.04, 0.026, 0.028, 0.028],
  [-0.005, 0.024, 0.026, 0.026],
  [-0.012, 0, 0, 0],
];

/** Miếng vá cong ôm ống tay (cách mặt vải 1,8 mm), mép hơi xô lệch như khâu tay; tâm ở mặt trên (+Z). */
function patchGeometry(rOf: (y: number) => number): THREE.BufferGeometry {
  const NA = 8;
  const NY = 4;
  const pos: number[] = [];
  const idx: number[] = [];
  const y0 = 0.11;
  const y1 = 0.19;
  const half = 0.55;
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NA; i++) {
      const u = i / NA;
      const v = j / NY;
      // Mép xô lệch: lệch góc theo y, lệch y theo góc (cố định → hình dùng chung ổn định).
      const a = (u * 2 - 1) * half * (1 + 0.06 * Math.sin(v * 5.1 + 0.7));
      const y = lerp(y0, y1, v) + 0.006 * Math.sin(u * 7.3 + 1.1) * (v === 0 || v === 1 ? 1 : 0.3);
      const r = rOf(y) + 0.0018;
      pos.push(r * Math.sin(a), y, r * Math.cos(a));
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i;
      const b = a + NA + 1;
      // Mặt ngoài hướng ra (cùng chiều quấn với ống đi xuống −Y).
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Bán kính ống tay hẹp ở mặt trên theo y (khớp sleeveRings('narrow') đoạn 0.1..0.2). */
const narrowTopR = (y: number): number => lerp(0.0505, 0.0515, clamp((y - 0.1) / 0.1, 0, 1));

/** Hình theo ngoại hình — cache cấp module, dùng chung (không dispose). */
const GEO_CACHE = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = make();
    g.computeBoundingSphere();
    g.userData.shared = true;
    GEO_CACHE.set(key, g);
  }
  return g;
}

function sleeveGeo(kind: SleeveKind, patched: boolean): SleeveGeo {
  if (kind === 'short') {
    return {
      tube: cached('short:tube', () => ringStack(SHORT_TUBE, 16)),
      cuff: null,
      lining: cached('short:lining', () => ringStack(SHORT_LINING, 16)),
      skin: cached('short:fore', () => ringStack(BARE_FORE, 14)),
      patch: null,
    };
  }
  const [tube, cuff, lining] = sleeveRings(kind);
  return {
    tube: cached(`${kind}:tube`, () => ringStack(tube, 16)),
    cuff: cached(`${kind}:cuff`, () => ringStack(cuff, 16)),
    lining: cached(`${kind}:lining`, () => ringStack(lining, 16)),
    skin: null,
    patch: patched && kind === 'narrow' ? cached('patch', () => patchGeometry(narrowTopR)) : null,
  };
}

const HAND_L = (): THREE.BufferGeometry => cached('handL', handGeometry);
const HAND_R = (): THREE.BufferGeometry => cached('handR', () => mirrorX(HAND_L()));

/** Kiểu tay áo + màu cổ tay áo (như outfit.ts sleeveOf/roleMat): 'cuff' = viền riêng, 'shirt' = cổ tay sơ mi trắng. */
function sleeveLook(look: AvatarLook, st: RobeStyle): { kind: SleeveKind; cuff: string } {
  const robe = look.isHost ? 'host' : look.outfit.robe;
  if (st.short) return { kind: 'short', cuff: st.sleeve };
  if (robe === 'civ_vest') return { kind: 'narrow', cuff: '#f7f7f2' };
  if (robe.startsWith('civ_') || robe === 'robe_nau_rach' || robe === 'robe_lam') return { kind: 'narrow', cuff: st.sleeve };
  return { kind: st.wide ? 'wide' : 'narrow', cuff: st.trim ?? st.collar ?? shade(st.sleeve, 0.8) };
}

// ───────────────────────── Kênh tư thế (camera space: nhìn −Z, +X phải, +Y lên) ─────────────────────────
//
// Mỗi tay 10 kênh: vị trí tâm bàn tay (x, y, z; tay trái x âm), xoay đối xứng gương — roll > 0 = úp lòng bàn tay xuống
// (0 = ngón cái lên, lòng bàn tay quay vào trong), pitch > 0 = đầu ngón chỉ lên, yaw > 0 = đầu ngón quay vào giữa,
// tilt > 0 = bàn tay nghiêng ra ngoài trong mặt phẳng nhìn (vẫy) —, sq = bóp dẹt (vỗ, gõ), elb = khuỷu dạt ra ngoài,
// pull = ống tay tuột về khuỷu (lộ cổ tay). Thêm: nghiêng vật cầm tay phải (quanh X, quanh Z), nghiêng vật ôm, tay trái
// nắm cán (chổi, rìu, nắp bình lắc), tay phải nắm khít cán vật cầm.

const X = 0;
const Y = 1;
const Z = 2;
const ROLL = 3;
const PITCH = 4;
const YAW = 5;
const TILT = 6;
const SQ = 7;
const ELB = 8;
const PULL = 9;
const AN = 10;
/** Độ lệch kênh tay phải / trái. */
const RO = 0;
const LO = AN;
const I_TILT = 20;
const I_ROLL = 21;
const C_TILT = 22;
const C_ROLL = 23;
const SHAFT = 24;
const GRIP = 25;
/** Điểm tay trái nắm dọc cán (m, theo +Y vật) — lò xo hoá để đổi dụng cụ không giật. */
const SLEN = 26;
const CH = 27;

type Side = 1 | -1;
const OFF = (s: Side): number => (s === 1 ? RO : LO);

/** Đặt tư thế một tay (số theo tay PHẢI; tay trái tự lật x). */
function hand(T: Float64Array, s: Side, x: number, y: number, z: number, roll: number, pitch: number, yaw: number): void {
  const o = OFF(s);
  T[o + X] = s * x;
  T[o + Y] = y;
  T[o + Z] = z;
  T[o + ROLL] = roll;
  T[o + PITCH] = pitch;
  T[o + YAW] = yaw;
}
function both(T: Float64Array, x: number, y: number, z: number, roll: number, pitch: number, yaw: number): void {
  hand(T, 1, x, y, z, roll, pitch, yaw);
  hand(T, -1, x, y, z, roll, pitch, yaw);
}
/** Tư thế nghỉ: hai bàn tay ló ở mép dưới khung hình, úp nghiêng, đầu ngón hơi quay vào. */
const REST = ((): Float64Array => {
  const T = new Float64Array(CH);
  both(T, 0.3, -0.33, -0.56, 1.0, 0.12, 0.22);
  T[LO + Y] = -0.335;
  return T;
})();

/**
 * Chắp tay (gassho): lòng bàn tay áp nhau (hở ~5 mm), đầu ngón chỉ lên, ngón cái hướng về mặt, khuỷu dạt ra cho hai miệng
 * tay áo không chạm nhau, ống tay tuột nhẹ lộ cổ tay.
 */
function gassho(T: Float64Array, y = -0.215, z = -0.43): void {
  both(T, 0.0455, y, z, 0, 1.25, 0);
  T[RO + ELB] = T[LO + ELB] = 0.12;
  T[RO + PULL] = T[LO + PULL] = 0.02;
}

/** Hai lòng bàn tay áp nhau (chắp, vỗ): tâm cách nhau tối thiểu 2 × 0,0445 khi hai tay cùng độ cao / độ sâu. */
const PALM_GAP = 0.089;

/** Ngồi thiền: hai bàn tay ngửa trong lòng, đầu ngón quay vào gần chạm nhau (ấn thiền định). */
function lap(T: Float64Array, s: Side): void {
  hand(T, s, 0.075, -0.285, -0.47, -1.35, -0.05, 1.05);
  T[OFF(s) + ELB] = 0.04;
}

/** Hai tay ôm vật trước bụng (lòng bàn tay áp hai bên vật). */
function carryPose(T: Float64Array): void {
  both(T, 0.17, -0.33, -0.58, 0.05, 0.25, -0.1);
  T[RO + ELB] = T[LO + ELB] = 0.05;
}

// ───────────────────────── Lò xo giảm chấn (giải tích — ổn định với mọi dt) ─────────────────────────

/** Hệ số bước lò xo (x' = x − đích, v) → [a11, a12, a21, a22] cho bước dt, ω, ζ < 1 (hơi vọt lố → mềm, nảy nhẹ). */
function springCoef(w: number, z: number, dt: number, out: Float64Array): void {
  const wd = w * Math.sqrt(1 - z * z);
  const e = Math.exp(-z * w * dt);
  const c = Math.cos(wd * dt);
  const s = Math.sin(wd * dt);
  out[0] = e * (c + ((z * w) / wd) * s);
  out[1] = (e * s) / wd;
  out[2] = (-e * w * w * s) / wd;
  out[3] = e * (c - ((z * w) / wd) * s);
}

/** Bước lò xo cho cả mảng kênh: x, v tiến về đích T. */
function springStep(x: Float64Array, v: Float64Array, T: Float64Array, k: Float64Array): void {
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - T[i]!;
    const vi = v[i]!;
    x[i] = T[i]! + k[0]! * d + k[1]! * vi;
    v[i] = k[2]! * d + k[3]! * vi;
  }
}

/** slerp theo đúng dấu `sg` của b (không tự chọn đường ngắn — tránh lật 180° khi hai hướng gần ngược nhau). */
function slerpSigned(a: THREE.Quaternion, b: THREE.Quaternion, t: number, sg: number, out: THREE.Quaternion): THREE.Quaternion {
  const bx = b.x * sg;
  const by = b.y * sg;
  const bz = b.z * sg;
  const bw = b.w * sg;
  const om = Math.acos(clamp(a.x * bx + a.y * by + a.z * bz + a.w * bw, -1, 1));
  const so = Math.sin(om);
  if (so < 1e-4) return out.set(a.x + (bx - a.x) * t, a.y + (by - a.y) * t, a.z + (bz - a.z) * t, a.w + (bw - a.w) * t).normalize();
  const ka = Math.sin((1 - t) * om) / so;
  const kb = Math.sin(t * om) / so;
  return out.set(a.x * ka + bx * kb, a.y * ka + by * kb, a.z * ka + bz * kb, a.w * ka + bw * kb);
}

/** Dụng cụ / vật cầm: xoay gốc trong tay + điểm tay trái nắm dọc cán (+Y vật, m; null = một tay). */
interface HoldSpec {
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly shaft: number | null;
}
const HOLD_NONE: HoldSpec = { rx: 0, ry: 0, rz: 0, shaft: null };
/** Chổi gần thẳng đứng (ngả trước ít — cán gần song song cẳng tay thì không nắm khít được), tay trái nắm cao hơn tay phải. */
const HOLD_BROOM: HoldSpec = { rx: -0.15, ry: 0.2, rz: 0.12, shaft: 0.2 };
/** Lưỡi rìu / dao / sạn quay ra trước (−Z); rìu hai tay; nắp bình lắc giữ bằng tay trái. */
const HOLD_TOOL: Record<ToolKind, HoldSpec> = {
  axe: { rx: 0, ry: Math.PI, rz: 0, shaft: 0.13 },
  mallet: { rx: 0, ry: 0, rz: 0, shaft: null },
  knife: { rx: 0, ry: Math.PI, rz: 0, shaft: null },
  spatula: { rx: 0, ry: Math.PI, rz: 0, shaft: null },
  fan: { rx: 0, ry: 0, rz: 0, shaft: null },
  shaker: { rx: 0, ry: 0, rz: 0, shaft: 0.3 },
};

/** Hoạt ảnh hai tay vẫn ôm vật được (còn lại: giữ thế ôm, chỉ nhún theo). */
const CARRY_OK: ReadonlySet<AnimId> = new Set<AnimId>(['idle', 'walk', 'carry_idle', 'carry_walk', 'pour', 'wash', 'release']);
/** Hoạt ảnh làm được khi cầm chổi (còn lại: hai tay giữ chổi; vẫy chào thì tay trái rời cán vẫy). */
const BROOM_OK: ReadonlySet<AnimId> = new Set<AnimId>(['idle', 'walk', 'carry_idle', 'carry_walk', 'sweep']);
/**
 * Tay phải cầm vật dựng đứng (đèn, nhang, ly…) thì không tham gia: chắp / vỗ tay / dụi mắt (chắp tay một tay), động tác
 * của dụng cụ khác (vật sẽ chúc ngược) — tay trái vẫn làm phần của nó.
 */
const UPRIGHT_KEEP: ReadonlySet<AnimId> = new Set<AnimId>([
  'sit',
  'kneel',
  'bow',
  'pray',
  'prostrate',
  'clap',
  'cry',
  'chop',
  'cut',
  'stir',
  'fan',
  'shake',
  'strike',
  'sweep',
  'crank',
  'wash',
  'pull',
]);

const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Tốc độ xoay bàn tay tối đa (rad/s) — ≈ 15°/khung ở 60 Hz; động tác nhanh nhất (bổ rìu, phẩy quạt) vẫn dưới mức này. */
const MAX_TURN = 16;
/**
 * Giới hạn mềm độ cao tâm bàn tay trong khung nhìn (|y| / |z|): dưới VIEW_KNEE giữ nguyên, trên đó nén dần về VIEW_MAX
 * (tan 35° = 0.70 là mép ngoài cùng còn thấy được nửa bàn tay). Chỉ cắt phần lò xo vọt lố lúc chuyển hoạt ảnh (vd vẫy
 * tay → cười: tay phải lao xuống bụng vọt tới 0.74, rơi khỏi mép dưới màn hình); tư thế đứng yên cao nhất ≈ 0.69.
 */
const VIEW_KNEE = 0.66;
const VIEW_MAX = 0.695;
/** Hướng "lên" tham chiếu cho khung ống tay (hơi ngả về camera để không suy biến khi cẳng tay dựng đứng). */
const SLEEVE_UP = new THREE.Vector3(0, 0.86, 0.51).normalize();

/** Khung gốc: ngón (−Y cục bộ) chỉ ra trước (−Z), ngón cái (+Z) hướng lên, +X cục bộ → −X (lòng bàn tay quay vào trong). */
const Q_BASE = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)),
);

/** Một cánh tay: nhóm bàn tay (tâm bàn tay) + nhóm ống tay (gốc = điểm xoay cổ tay). */
interface Arm {
  readonly s: Side;
  readonly hand: THREE.Group;
  readonly handMesh: THREE.Mesh;
  readonly sleeve: THREE.Group;
  readonly tube: THREE.Mesh;
  readonly cuff: THREE.Mesh;
  readonly lining: THREE.Mesh;
  readonly skin: THREE.Mesh;
  readonly patch: THREE.Mesh;
}

function vmMesh(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function noShadow(o: THREE.Object3D): void {
  o.traverse((c) => {
    c.castShadow = false;
    c.receiveShadow = false;
  });
}

class FpView implements FirstPersonHandle {
  readonly root = new THREE.Group();
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly arms: readonly [Arm, Arm];
  /** Vật cầm tay phải (gốc = chỗ nắm) và vật ôm hai tay. */
  private readonly itemR = new THREE.Group();
  private readonly carry = new THREE.Group();
  private heldObj: THREE.Object3D | null = null;
  private tool: HandheldBuild | null = null;
  private toolKind: ToolKind | null = null;
  private hold: HoldSpec = HOLD_NONE;
  /**
   * Điểm tay trái nắm dọc cán của vật CUỐI CÙNG có cán (cùng qHold): giữ nguyên khi vật cất đi để hai tay rời cán mượt
   * theo lò xo GRIP / SHAFT (không giật về chỗ cũ).
   */
  private shaftLen = 0.2;
  /** Vật đang co lại biến mất (dụng cụ cất đi, vật vừa đặt xuống) — giải phóng khi đủ nhỏ. */
  private readonly leaving: { obj: THREE.Object3D; s: number; free: () => void }[] = [];
  private anim: AnimId = 'idle';
  private animTime = 0;
  private grip: GripStyle | null = null;
  private hasItem = false;
  private started = false;
  // Lò xo: tư thế nền (chậm, chuyển hoạt ảnh mềm) + lớp dao động (nhanh, giữ nhịp động tác).
  private readonly tB = new Float64Array(CH);
  private readonly tO = new Float64Array(CH);
  private readonly xB = new Float64Array(CH);
  private readonly vB = new Float64Array(CH);
  private readonly xO = new Float64Array(CH);
  private readonly vO = new Float64Array(CH);
  private readonly P = new Float64Array(CH);
  private readonly kB = new Float64Array(4);
  private readonly kO = new Float64Array(4);
  private readonly kPop = new Float64Array(4);
  /** Nảy khi vật / dụng cụ hiện ra: [vật cầm, vật ôm] → tiến về 1. */
  private readonly popX = new Float64Array([1, 1]);
  private readonly popV = new Float64Array(2);
  private readonly popT = new Float64Array([1, 1]);
  private walkPhase = 0;
  private walkAmp = 0;

  constructor(look: AvatarLook) {
    this.root.name = 'fpHands';
    const make = (s: Side): Arm => {
      const handG = new THREE.Group();
      const sleeve = new THREE.Group();
      this.root.add(handG, sleeve);
      const ph = this.mat('skin', look.skin);
      const geo0 = HAND_L();
      return {
        s,
        hand: handG,
        handMesh: vmMesh(handG, s === 1 ? HAND_R() : geo0, ph),
        sleeve,
        tube: vmMesh(sleeve, geo0, ph),
        cuff: vmMesh(sleeve, geo0, ph),
        lining: vmMesh(sleeve, geo0, ph),
        skin: vmMesh(sleeve, geo0, ph),
        patch: vmMesh(sleeve, geo0, ph),
      };
    };
    this.arms = [make(1), make(-1)];
    this.root.add(this.itemR, this.carry);
    this.xB.set(REST);
    this.setLook(look);
  }

  /** MatFactory riêng của đôi tay: cùng khoá → cùng vật liệu, gọi lại thì đặt lại màu + thông số. Màu trơn. */
  private readonly mat: MatFactory = (key: string, color: string, o: MatOpts = {}): THREE.MeshStandardMaterial => {
    let m = this.mats.get(key);
    if (!m) {
      m = kit.matUnique(color, { surface: 'none' });
      m.name = key;
      this.mats.set(key, m);
    }
    m.color.set(color);
    m.emissive.set(o.emissive ?? '#000000');
    m.emissiveIntensity = o.ei ?? (o.emissive ? 1 : 0);
    m.roughness = o.roughness ?? 0.88;
    m.metalness = o.metalness ?? 0;
    m.transparent = o.transparent ?? false;
    m.opacity = o.opacity ?? 1;
    const map = o.map ?? null;
    const side = o.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
    if (m.map !== map || m.side !== side) {
      m.map = map;
      m.side = side;
      m.needsUpdate = true;
    }
    return m;
  };

  setLook(look: AvatarLook): void {
    const st = robeStyle(look);
    const sl = sleeveLook(look, st);
    const cloth: MatOpts = st.shiny ? { roughness: 0.42, metalness: 0.16 } : { roughness: 0.85 };
    const sleeve = this.mat('sleeve', st.sleeve, cloth);
    const cuff = sl.cuff === st.sleeve ? sleeve : this.mat('cuff', sl.cuff, { roughness: 0.8 });
    const lining = this.mat('lining', shade(st.sleeve, 0.42), { roughness: 0.95 });
    const skin = this.mat('skin', look.skin, { roughness: 0.6 });
    const patch = this.mat('patch', st.patches ?? shade(st.upper, 1.2), { roughness: 0.9 });
    const g = sleeveGeo(sl.kind, !!st.ragged);
    for (const a of this.arms) {
      a.handMesh.material = skin;
      a.tube.geometry = g.tube;
      a.tube.material = sleeve;
      a.cuff.visible = !!g.cuff;
      if (g.cuff) a.cuff.geometry = g.cuff;
      a.cuff.material = cuff;
      a.lining.geometry = g.lining;
      // Như outfit.ts: cổ tay có màu viền riêng thì mặt trong miệng tay áo cùng màu viền (ngôi thứ ba gộp lót vào khối cổ
      // tay); cổ tay cùng màu vải thì lót tối.
      a.lining.material = cuff === sleeve ? lining : cuff;
      a.skin.visible = !!g.skin;
      if (g.skin) a.skin.geometry = g.skin;
      a.skin.material = skin;
      a.patch.visible = !!g.patch;
      if (g.patch) a.patch.geometry = g.patch;
      a.patch.material = patch;
    }
  }

  setHeld(item: HeldItem | null): void {
    if (this.heldObj) {
      const o = this.heldObj;
      this.leave(o, () => {
        o.removeFromParent();
        kit.disposeTree(o);
      });
      this.heldObj = null;
    }
    this.grip = item ? gripStyle(item.kind) : null;
    this.hasItem = !!item;
    if (item) {
      const m = createHeldItemMesh(item);
      noShadow(m);
      if (this.grip === 'carry') {
        this.carry.add(m);
        this.pop(1);
      } else {
        const h = this.grip === 'tool' ? HOLD_BROOM : HOLD_NONE;
        m.rotation.set(h.rx, h.ry, h.rz);
        this.itemR.add(m);
        this.pop(0);
      }
      m.scale.setScalar(0.45);
      this.heldObj = m;
    }
    this.refreshTool();
  }

  /** Cất vật: co lại (dễ thương, không biến mất cái rụp) rồi mới giải phóng. */
  private leave(obj: THREE.Object3D, free: () => void): void {
    this.leaving.push({ obj, s: obj.scale.x, free });
  }

  setAnim(anim: AnimId): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.animTime = 0;
    // Gộp lớp dao động đang chạy vào tư thế nền (giữ cả vận tốc): tay đang ở đâu thì từ đó lò xo chậm đưa về đích mới,
    // lớp dao động của hoạt ảnh mới bắt đầu từ 0 — không giật khi đổi hoạt ảnh.
    for (let i = 0; i < CH; i++) {
      this.xB[i] += this.xO[i]!;
      this.vB[i] += this.vO[i]!;
      this.xO[i] = 0;
      this.vO[i] = 0;
    }
    this.refreshTool();
  }

  /** Vật vừa hiện ra: thu nhỏ rồi nảy về cỡ thật (lò xo hơi vọt lố). */
  private pop(i: 0 | 1): void {
    this.popX[i] = 0.45;
    this.popV[i] = 0;
  }

  /** Dụng cụ làm việc theo hoạt ảnh — chỉ hiện khi tay phải trống. */
  private refreshTool(): void {
    const kind = this.hasItem ? null : (TOOL_OF[this.anim] ?? null);
    if (kind !== this.toolKind) {
      if (this.tool) {
        const part = this.tool;
        this.leave(part.root, () => part.dispose());
      }
      this.tool = null;
      this.toolKind = kind;
      if (kind) {
        this.tool = buildTool(kind, this.mat);
        noShadow(this.tool.root);
        const h = HOLD_TOOL[kind];
        this.tool.root.rotation.set(h.rx, h.ry, h.rz);
        this.tool.root.scale.setScalar(0.45);
        this.itemR.add(this.tool.root);
        this.pop(0);
      }
    }
    // Thế cầm hiện tại: dụng cụ > chổi > không. Tay trống thì giữ trục cán cũ cho tay rời cán mượt.
    this.hold = this.toolKind ? HOLD_TOOL[this.toolKind] : this.hasItem && this.grip === 'tool' ? HOLD_BROOM : HOLD_NONE;
    if (this.hold !== HOLD_NONE || (this.hasItem && this.grip === 'upright')) {
      this.qHoldT.setFromEuler(this.eulI.set(this.hold.rx, this.hold.ry, this.hold.rz));
    }
    if (this.hold.shaft !== null) this.shaftLen = this.hold.shaft;
  }

  /** Tư thế theo kiểu cầm (chụp lại trước khi áp hoạt ảnh — tay đang bận thì trả về đây khi làm emote). */
  private readonly gB = new Float64Array(CH);

  /** Đích tư thế: tB = nền (lò xo chậm, chuyển hoạt ảnh mềm), tO = dao động cộng thêm (lò xo nhanh, giữ nhịp). */
  private computeTarget(t: number): void {
    const B = this.tB;
    const O = this.tO;
    B.set(REST);
    O.fill(0);
    const a = this.animTime;
    const g = this.grip;
    const holding = !!this.tool || (this.hasItem && g !== 'carry');
    // Thở: hai tay nâng hạ rất khẽ, lệch pha chút cho tự nhiên.
    O[RO + Y] += 0.004 * Math.sin(t * 1.75);
    O[LO + Y] += 0.004 * Math.sin(t * 1.75 + 0.5);
    if (g === 'carry') carryPose(B);
    else if (g === 'upright') hand(B, 1, 0.24, -0.27, -0.5, 0.08, 0.15, 0.1);
    else if (g === 'tool') hand(B, 1, 0.21, -0.31, -0.56, 0.1, 0.2, 0.15);
    B[GRIP] = holding ? 1 : 0;
    B[SHAFT] = this.hold.shaft !== null && (!!this.tool || g === 'tool') ? 1 : 0;
    B[SLEN] = this.shaftLen;
    this.gB.set(B);
    switch (this.anim) {
      case 'idle':
      case 'carry_idle': {
        // Thỉnh thoảng nắm tay bóp nhẹ một cái + nhún (dễ thương, không đều tăm tắp).
        const ph = frac(t / 6.3);
        const q = arc((ph - 0.86) / 0.1);
        O[RO + SQ] += 0.3 * q;
        O[LO + SQ] += 0.3 * arc((ph - 0.9) / 0.1);
        O[RO + Y] += 0.012 * q;
        break;
      }
      case 'sweep': {
        // Quét ~1,1 Hz cùng nhịp thân (motion.ts): hai tay lướt ngang theo cán, cuối nhát hất nhẹ lên, chổi nghiêng theo.
        const s = Math.sin(a * 7);
        const e = smr(a, 0, 0.35);
        const fl = smr(Math.abs(s), 0.75, 1) * e;
        // Cầm vật dựng đứng / ôm vật thì không quét (tay phải giữ vật, tay trái để yên).
        if (g === 'upright' || g === 'carry') break;
        if (g === null) {
          // Tay không: làm điệu cầm chổi tưởng tượng (tay trái trên, tay phải dưới).
          hand(B, 1, 0.19, -0.31, -0.56, 0.1, 0.2, 0.15);
          hand(B, -1, -0.07, -0.2, -0.52, 0.1, 0.3, 0.2);
        }
        O[RO + X] += 0.15 * s * e;
        O[LO + X] += 0.15 * s * e;
        O[RO + Y] += 0.03 * fl;
        O[I_ROLL] += 0.5 * s * e;
        O[I_TILT] -= 0.12 * fl;
        break;
      }
      case 'chop': {
        // Chẻ củi 2 nhát/giây: giơ rìu chậm lên trước mặt (lưỡi ngả ra sau) → khựng → bổ xuống nhanh → dội nhẹ.
        // Nhát bổ trúng đúng lúc với motion.ts (c = 0.75) nhưng bắt đầu bổ sớm hơn chút cho đỡ giật.
        const c = frac(a * 2);
        const up = c < 0.4 ? sm(c / 0.4) : c < 0.48 ? 1 : c < 0.75 ? 1 - ((c - 0.48) / 0.27) ** 1.6 : 0;
        const hit = c >= 0.75 ? arc((c - 0.75) / 0.25) : 0;
        const e = smr(a, 0, 0.2);
        hand(B, 1, 0.07, -0.29, -0.6, 0.1, -0.3, 0.2);
        B[I_TILT] = -1.2;
        O[RO + Y] += 0.26 * up * e + 0.02 * hit;
        O[RO + Z] += 0.12 * up * e;
        O[I_TILT] += 1.3 * up * e;
        O[RO + SQ] += 0.5 * hit;
        O[LO + SQ] += 0.5 * hit;
        break;
      }
      case 'cut': {
        // Thái rau: dao gõ nhanh lên xuống (nhịp motion.ts), tay trái úp giữ rau trên thớt.
        const tap = Math.pow(0.5 - 0.5 * Math.cos(a * 22), 1.4);
        const e = smr(a, 0, 0.25);
        hand(B, 1, 0.15, -0.37, -0.56, 0.2, -0.2, 0.3);
        B[I_TILT] = -1.2;
        O[RO + Y] += 0.06 * (1 - tap) * e;
        O[I_TILT] += 0.15 * (1 - tap) * e;
        O[RO + SQ] += 0.2 * tap * e;
        hand(B, -1, 0.12, -0.38, -0.58, 1.5, -0.1, 0.4);
        break;
      }
      case 'strike': {
        // Gõ mõ khi ngồi (2 lần/giây): dùi nhấc lên lấy đà → gõ nhanh xuống → nảy lại; tay trái đặt trong lòng.
        const p = frac(a * 2);
        const lift = p < 0.06 ? sm(p / 0.06) : p < 0.16 ? 1 - ((p - 0.06) / 0.1) ** 2 : 0;
        const hit = p >= 0.16 ? arc((p - 0.16) / 0.5) : 0;
        hand(B, 1, 0.17, -0.31, -0.55, 0.2, -0.1, 0.25);
        B[I_TILT] = -0.9;
        O[RO + Y] += 0.085 * lift + 0.035 * (1 - lift - hit);
        O[I_TILT] += 0.6 * lift - 0.15 * hit;
        O[RO + SQ] += 0.5 * arc((p - 0.16) / 0.12);
        lap(B, -1);
        break;
      }
      case 'pull': {
        // Kéo dây chuông: hai nắm tay chồng lên nhau trên dây, giơ cao ↔ kéo xuống (nhịp motion.ts).
        const p = 0.5 + 0.5 * Math.sin(a * 3 - Math.PI / 2);
        const e = smr(a, 0, 0.4);
        hand(B, 1, 0.035, -0.03, -0.5, 0, 0.1, 0.6);
        hand(B, -1, 0.035, -0.165, -0.5, 0, 0.1, 0.6);
        B[RO + ELB] = B[LO + ELB] = 0.1;
        const dy = (lerp(0.12, -0.18, p) + 0.03) * e;
        O[RO + Y] += dy;
        O[LO + Y] += dy;
        break;
      }
      case 'pour': {
        // Rót: nghiêng dần sang phải (nhịp motion.ts); ôm vật thì nghiêng cả vật, tay phải hạ / tay trái nâng theo.
        const tip = (0.5 - 0.5 * Math.cos(a * 1.6)) * smr(a, 0.1, 0.8);
        if (g === 'carry') {
          O[C_ROLL] -= 0.5 * tip;
          O[RO + Y] -= 0.05 * tip;
          O[LO + Y] += 0.05 * tip;
        } else {
          both(B, 0.12, -0.37, -0.56, 0.3, 0.2, 0.3);
          O[I_ROLL] -= 0.7 * tip;
          O[RO + ROLL] += 0.5 * tip;
        }
        break;
      }
      case 'wash': {
        // Vo gạo: hai tay úp xoa vòng tròn so le (tâm hai tay đứng yên → chậu ôm không xoay theo).
        const w = a * 6;
        const e = smr(a, 0, 0.3);
        both(B, 0.12, -0.375, -0.56, 1.45, -0.15, 0.35);
        const cx = 0.03 * Math.cos(w) * e;
        const sy = 0.02 * Math.sin(w) * e;
        const sz = 0.025 * Math.sin(w) * e;
        O[RO + X] += cx;
        O[LO + X] -= cx;
        O[RO + Y] += sy;
        O[LO + Y] -= sy;
        O[RO + Z] += sz;
        O[LO + Z] -= sz;
        break;
      }
      case 'stir': {
        // Đảo chảo: tay phải khuấy vòng tròn nằm ngang, sạn chúc xuống chảo.
        const w = a * 5;
        const e = smr(a, 0, 0.3);
        hand(B, 1, 0.17, -0.34, -0.56, 0.15, -0.3, 0.2);
        B[I_TILT] = -2.2;
        O[RO + X] += 0.045 * Math.cos(w) * e;
        O[RO + Z] += 0.045 * Math.sin(w) * e;
        O[I_ROLL] += 0.15 * Math.sin(w) * e;
        break;
      }
      case 'fan': {
        // Quạt lửa: tay phải phẩy quạt mo nhanh, tay trái chống gối.
        const f = Math.sin(a * 18);
        const e = smr(a, 0, 0.25);
        hand(B, 1, 0.18, -0.36, -0.56, 0.3, 0, 0.2);
        B[I_TILT] = -0.55;
        O[RO + Y] += 0.025 * f * e;
        O[I_TILT] += 0.45 * f * e;
        hand(B, -1, 0.24, -0.38, -0.58, 1.4, -0.1, 0.3);
        break;
      }
      case 'crank': {
        // Quay tời: hai nắm tay quay vòng đứng (trục ngang) lệch pha 90° như motion.ts.
        const w = a * 8;
        const e = smr(a, 0, 0.3);
        both(B, 0.13, -0.31, -0.55, 0.25, 0.15, 0.35);
        B[RO + ELB] = B[LO + ELB] = 0.06;
        O[RO + Y] += 0.05 * Math.sin(w) * e;
        O[RO + Z] += 0.05 * Math.cos(w) * e;
        O[LO + Y] += 0.05 * Math.cos(w) * e;
        O[LO + Z] -= 0.05 * Math.sin(w) * e;
        break;
      }
      case 'pick': {
        // Hái quả: tay phải với lên ngoắc ngoắc (bóp nắm), tay trái dang giữ thăng bằng.
        const w = Math.sin(a * 4);
        const e = smr(a, 0, 0.45);
        hand(B, 1, 0.12, 0.03, -0.62, -0.3, 1.0, 0.1);
        O[RO + Y] += 0.02 * w * e;
        O[RO + Z] -= 0.02 * w * e;
        O[RO + SQ] += 0.3 * Math.max(0, w) * e;
        hand(B, -1, 0.36, -0.2, -0.56, 1.3, 0.2, -0.2);
        break;
      }
      case 'release': {
        // Phóng sinh (~0,83 s/nhịp): hạ thấp → nâng tay thả, ngửa lòng bàn tay → hạ về.
        const c = frac(a * 1.2);
        const down = c < 0.45 ? sm(c / 0.45) : c < 0.7 ? 1 - sm((c - 0.45) / 0.25) : 0;
        const toss = c < 0.45 ? 0 : arc((c - 0.45) / 0.55);
        if (g !== 'carry') both(B, 0.16, -0.3, -0.56, -0.2, 0.3, 0.2);
        for (let o = RO; o <= LO; o += AN) {
          O[o + Y] += -0.07 * down + 0.14 * toss;
          O[o + Z] -= 0.05 * toss;
          O[o + ROLL] -= 0.5 * toss;
        }
        O[C_TILT] -= 0.3 * toss;
        break;
      }
      case 'shake': {
        // Lắc bình: tay phải giữ đáy, tay trái úp nắp, lắc nhanh trước cằm.
        const s = Math.sin(a * 26);
        const e = smr(a, 0, 0.25);
        hand(B, 1, 0.04, -0.17, -0.44, 0, 0.3, 0.3);
        B[I_TILT] = 0.1;
        B[I_ROLL] = -0.1;
        O[RO + Y] += 0.03 * s * e;
        O[RO + X] -= 0.012 * s * e;
        O[I_ROLL] += 0.08 * s * e;
        break;
      }
      case 'drink': {
        // Uống: nâng ly lên miệng, ngửa ly ực ực, cuối cùng "hức" nhún vai.
        const up = smr(a, 0, 0.35);
        const gulp = a > 0.35 ? 0.5 - 0.5 * Math.cos((a - 0.35) * 14) : 0;
        const hic = arc((a - 0.9) / 0.3);
        hand(B, 1, lerp(0.24, 0.05, up), lerp(-0.27, -0.13, up), lerp(-0.5, -0.32, up), 0.08, 0.15, 0.1);
        B[I_TILT] = 0.95 * up;
        O[I_TILT] += 0.08 * gulp * up;
        O[RO + Y] += 0.02 * hic;
        O[LO + Y] += 0.02 * hic;
        break;
      }
      case 'sit':
        // Ngồi thiền: hai tay ngửa trong lòng, thở sâu chậm.
        lap(B, 1);
        lap(B, -1);
        O[RO + Y] += 0.006 * Math.sin(t * 0.9);
        O[LO + Y] += 0.006 * Math.sin(t * 0.9);
        break;
      case 'kneel':
        gassho(B);
        O[RO + Y] += 0.004 * Math.sin(t * 0.9);
        O[LO + Y] += 0.004 * Math.sin(t * 0.9);
        break;
      case 'pray': {
        // Chắp tay niệm: tay gật khẽ theo nhịp đầu (motion.ts).
        gassho(B);
        const n = Math.sin(a * 2);
        for (let o = RO; o <= LO; o += AN) {
          O[o + Y] += 0.008 * n;
          O[o + PITCH] += 0.04 * n;
        }
        break;
      }
      case 'bow': {
        // Cúi chào (nhịp motion.ts ~2,6 s): tay chắp hạ xuống, đầu ngón ngả ra trước.
        const b = smr(a, 0.25, 0.7) * (0.5 - 0.5 * Math.cos(Math.max(0, a - 0.25) * 2.4));
        gassho(B);
        for (let o = RO; o <= LO; o += AN) {
          O[o + Y] -= 0.03 * b;
          O[o + Z] -= 0.02 * b;
          O[o + PITCH] -= 0.3 * b;
        }
        break;
      }
      case 'prostrate': {
        // Lạy: đúng nhịp prostrateDip (camera cúi theo) — tay rời thế chắp, vòng ra ngoài rồi úp phẳng xuống sàn trước mặt.
        const d = prostrateDip(a);
        const k = smr(d, 0.08, 0.72);
        both(B, lerp(0.0455, 0.17, k) + 0.07 * arc(k), lerp(-0.215, -0.12, k), lerp(-0.43, -0.5, k), lerp(0, 1.5, k), lerp(1.25, 0.6, k), 0.3 * k);
        B[RO + ELB] = B[LO + ELB] = 0.12 + 0.05 * k;
        B[RO + PULL] = B[LO + PULL] = 0.03 * (1 - k);
        // Đang ôm vật: chỉ hạ vật theo nhịp cúi.
        if (g === 'carry') O[RO + Y] = O[LO + Y] = -0.05 * d;
        break;
      }
      case 'clap': {
        // Vỗ tay ~3 nhịp/giây (motion.ts): mở ra rồi đập vào nhanh, lòng bàn tay chạm nhau thì bóp dẹt.
        const e = smr(a, 0, 0.25);
        const c = frac(a * 3.2);
        const open = c < 0.12 ? 0 : c < 0.55 ? sm((c - 0.12) / 0.43) : 1 - sm((c - 0.55) / 0.45);
        const o = open * e;
        both(B, 0.0455, -0.25, -0.46, 0, 1.0, 0);
        B[RO + ELB] = B[LO + ELB] = 0.1;
        B[RO + PULL] = B[LO + PULL] = 0.02;
        O[RO + X] += 0.13 * o;
        O[LO + X] -= 0.13 * o;
        const sq = 0.6 * (1 - sm(o * 4)) * e;
        for (let i = RO; i <= LO; i += AN) {
          O[i + ROLL] -= 0.35 * o;
          O[i + PITCH] -= 0.25 * o;
          O[i + SQ] += sq;
          O[i + Y] += 0.012 * o;
        }
        break;
      }
      case 'cry': {
        // Khóc: hai nắm tay dụi mắt (sát camera), vòng nhỏ so le, nấc từng hồi.
        const e = smr(a, 0, 0.35);
        const sob = Math.pow(0.5 - 0.5 * Math.cos(a * 11), 2);
        both(B, 0.1, -0.13, -0.3, 0.4, 1.1, 0.5);
        B[RO + SQ] = B[LO + SQ] = 0.2;
        for (let o = RO, s = 1; o <= LO; o += AN, s = -1) {
          const r = a * 9 + (s === 1 ? 0 : Math.PI);
          O[o + X] += s * 0.012 * Math.sin(r) * e;
          O[o + Y] += (0.01 * Math.cos(r) + 0.01 * sob) * e;
        }
        break;
      }
      case 'laugh': {
        // Cười lớn: hai tay ôm bụng rung bần bật, lúc lắc.
        const e = smr(a, 0, 0.3);
        const shake = 0.5 - 0.5 * Math.cos(a * 18);
        both(B, 0.2, -0.34, -0.5, 0.9, 0.6, 0.5);
        for (let o = RO; o <= LO; o += AN) {
          O[o + Y] += 0.02 * shake * e;
          O[o + ROLL] += 0.15 * Math.sin(a * 9) * e;
        }
        break;
      }
      case 'angry': {
        // Giận dỗi: nắm chặt tay run run, mỗi cú dậm chân (so le, motion.ts) tay giật xuống.
        const e = smr(a, 0, 0.25);
        both(B, 0.22, -0.34, -0.54, 0.2, 0, 0.3);
        B[RO + SQ] = B[LO + SQ] = 0.25;
        for (let o = RO, s = 0; o <= LO; o += AN, s = 0.5) {
          const tt = frac(a / 0.9 + s) * 0.9;
          O[o + X] += 0.006 * Math.sin(a * 14 + s * 4) * e;
          O[o + Y] -= 0.025 * arc(clamp((tt - 0.3) / 0.22, 0, 1)) * e;
        }
        break;
      }
      case 'cheer': {
        // Hoan hô: nhảy cẫng liên tục (0,55 s/cú), hai tay giơ chữ V, cổ tay lắc.
        const e = smr(a, 0, 0.2);
        const tt = a % 0.55;
        const air = arc(clamp((tt - 0.1) / 0.3, 0, 1));
        const land = arc(clamp((tt - 0.38) / 0.17, 0, 1));
        both(B, 0.28, 0.06, -0.5, -0.5, 1.2, -0.2);
        for (let o = RO, ph = 0; o <= LO; o += AN, ph = 1) {
          O[o + Y] += (0.04 * air - 0.03 * land) * e;
          O[o + ROLL] += 0.4 * Math.sin(a * 12 + ph) * e;
        }
        break;
      }
      case 'dance': {
        // Nhảy (~2,5 nhịp/giây, motion.ts): hai tay thay phiên vung lên chéo ngoài, nhún theo phách.
        const fb = 8 / Math.PI;
        const e = smr(a, 0, 0.3);
        const c = Math.cos(TAU * fb * a);
        const kl = sm(0.5 + 0.5 * Math.sin(Math.PI * fb * a));
        this.towardUp(B, O, RO, (1 - kl) * e);
        this.towardUp(B, O, LO, kl * e);
        O[RO + Y] += 0.02 * (0.5 - 0.5 * c) * e;
        O[LO + Y] += 0.02 * (0.5 - 0.5 * c) * e;
        break;
      }
      case 'dance2': {
        // Nhảy kiểu 2: hai tay giơ chữ V lắc cổ tay, nhún nhanh.
        const e = smr(a, 0, 0.3);
        both(B, 0.3, 0.06, -0.52, -0.6, 1.1, -0.2);
        for (let o = RO, ph = 1; o <= LO; o += AN, ph = 0) {
          O[o + ROLL] += 0.6 * Math.sin(a * 10 + ph) * e;
          O[o + Y] += 0.03 * (0.5 - 0.5 * Math.cos(a * 10)) * e;
        }
        break;
      }
      case 'dance3': {
        // Nhảy kiểu 3: dang tay như cánh máy bay, bật nhảy mỗi ~0,63 s.
        const e = smr(a, 0, 0.2);
        const P5 = Math.PI / 5;
        const tt = a % P5;
        const air = arc(clamp((tt - 0.12) / 0.34, 0, 1));
        const land = arc(clamp((tt - 0.44) / 0.17, 0, 1));
        both(B, 0.38, -0.15, -0.6, 1.2, 0, -0.3);
        for (let o = RO; o <= LO; o += AN) O[o + Y] += (0.03 * air - 0.02 * land) * e;
        break;
      }
      case 'wave': {
        // Vẫy chào: giơ tay lên (lòng bàn tay ra trước) vẫy qua lại trong mặt phẳng nhìn, nhún lấy đà. Tay phải cầm chổi
        // thì vẫy tay trái (rời cán chổi); ôm vật thì chỉ nhún.
        const w = Math.sin((a - 0.3) * 12) * smr(a, 0.3, 0.5);
        const hop = 0.025 * arc(a / 0.3);
        O[RO + Y] += hop;
        O[LO + Y] += hop;
        if (g !== 'carry') {
          const s: Side = g === 'tool' ? -1 : 1;
          const o = OFF(s);
          hand(B, s, 0.27, -0.02, -0.5, 0, 1.35, -1.45);
          O[o + TILT] += 0.35 * w;
          O[o + X] += s * 0.02 * w;
          if (s === -1) B[SHAFT] = 0;
        }
        break;
      }
      case 'dj': {
        // DJ: tay phải cào đĩa, tay trái giữ tai nghe, gật gù theo nhịp.
        const b = Math.sin(a * 8.5);
        hand(B, 1, 0.2, -0.36, -0.56, 1.4, -0.1, 0.4);
        O[RO + X] += 0.035 * Math.sin(a * 9);
        O[RO + Z] += 0.03 * Math.cos(a * 9);
        hand(B, -1, 0.33, -0.02, -0.5, -0.3, 1.2, -0.4);
        O[RO + Y] += 0.012 * b;
        O[LO + Y] += 0.012 * b;
        break;
      }
      case 'stumble': {
        // Loạng choạng: hai tay chới với so le.
        const e = smr(a, 0, 0.2);
        const w = Math.sin(a * 13);
        both(B, 0.3, -0.22, -0.58, 1.2, 0.4, -0.2);
        O[RO + X] += 0.06 * w * e;
        O[LO + X] -= 0.06 * w * e;
        O[RO + Y] += 0.05 * w * e;
        O[LO + Y] -= 0.05 * w * e;
        O[RO + ROLL] += 0.3 * Math.sin(a * 9) * e;
        O[LO + ROLL] += 0.3 * Math.sin(a * 9 + 1) * e;
        break;
      }
    }
    // Tay đang bận (ôm vật, cầm chổi, cầm vật dựng đứng) mà hoạt ảnh không dành cho vật đó: tay giữ nguyên thế cầm, chỉ
    // nhún theo nhịp (giữ lớp dao động trục Y).
    const an = this.anim;
    const keepR = g === 'carry' ? !CARRY_OK.has(an) : g === 'tool' ? !BROOM_OK.has(an) : g === 'upright' && UPRIGHT_KEEP.has(an);
    const keepL = g === 'carry' ? !CARRY_OK.has(an) : g === 'tool' && !BROOM_OK.has(an) && an !== 'wave';
    for (let o = RO; o <= LO; o += AN) {
      if (!(o === RO ? keepR : keepL)) continue;
      for (let i = o; i < o + AN; i++) {
        B[i] = this.gB[i]!;
        if (i !== o + Y) O[i] = 0;
      }
      O[o + Y] = clamp(O[o + Y]!, -0.03, 0.03);
    }
    if (keepR) {
      B[I_TILT] = this.gB[I_TILT]!;
      B[I_ROLL] = this.gB[I_ROLL]!;
      O[I_TILT] = O[I_ROLL] = 0;
    }
    if (keepL) B[SHAFT] = this.gB[SHAFT]!;
    if (g === 'carry' && keepR) B[C_TILT] = B[C_ROLL] = O[C_TILT] = O[C_ROLL] = 0;
  }

  /** Trộn tay (độ lệch kênh `o`) từ tư thế nền tới thế giơ tay chữ V theo k (vào lớp dao động). */
  private towardUp(B: Float64Array, O: Float64Array, o: number, k: number): void {
    const s = o === RO ? 1 : -1;
    O[o + X] += (s * 0.3 - B[o + X]!) * k;
    O[o + Y] += (0.06 - B[o + Y]!) * k;
    O[o + Z] += (-0.52 - B[o + Z]!) * k;
    O[o + ROLL] += (-0.6 - B[o + ROLL]!) * k;
    O[o + PITCH] += (1.1 - B[o + PITCH]!) * k;
    O[o + YAW] += (-0.2 - B[o + YAW]!) * k;
  }

  // Bộ nhớ tạm dùng lại mỗi khung hình (không cấp phát trong update).
  private readonly vW = new THREE.Vector3();
  private readonly vL = new THREE.Vector3();
  private readonly vA = new THREE.Vector3();
  private readonly vD = new THREE.Vector3();
  private readonly vU = new THREE.Vector3();
  private readonly vX = new THREE.Vector3();
  private readonly vZ = new THREE.Vector3();
  private readonly qC = new THREE.Quaternion();
  private readonly qG = new THREE.Quaternion();
  private readonly qT = new THREE.Quaternion();
  private readonly qI = new THREE.Quaternion();
  private readonly qS1 = new THREE.Quaternion();
  private readonly qS2 = new THREE.Quaternion();
  /** Xoay gốc của vật trong tay (đích) và bản làm mượt dùng để tính trục cán (đổi vật không lật bàn tay). */
  private readonly qHold = new THREE.Quaternion();
  private readonly qHoldT = new THREE.Quaternion();
  private readonly eul = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly eulI = new THREE.Euler();
  private readonly mB = new THREE.Matrix4();
  /** Nhún khi đi: [dx, dy] chung + [dy, dz, roll] riêng mỗi tay (phải, trái). */
  private bx = 0;
  private by = 0;

  update(dt: number, time: number, speed: number): void {
    dt = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    const first = !this.started;
    this.animTime += dt;
    this.computeTarget(time);
    if (first) {
      // Khung hình đầu: đặt thẳng vào tư thế (không bay từ tư thế nghỉ).
      this.started = true;
      this.xB.set(this.tB);
      this.xO.set(this.tO);
    } else if (dt > 0) {
      springCoef(10, 0.62, dt, this.kB);
      springCoef(34, 0.8, dt, this.kO);
      springStep(this.xB, this.vB, this.tB, this.kB);
      springStep(this.xO, this.vO, this.tO, this.kO);
    }
    if (dt > 0) {
      springCoef(15, 0.42, dt, this.kPop);
      springStep(this.popX, this.popV, this.popT, this.kPop);
    }
    // Vật mới nảy về cỡ thật; vật cất đi co lại rồi giải phóng.
    const cur = this.tool ? this.tool.root : this.grip !== 'carry' ? this.heldObj : null;
    if (cur) cur.scale.setScalar(Math.max(0.05, this.popX[0]!));
    if (this.heldObj && this.grip === 'carry') this.heldObj.scale.setScalar(Math.max(0.05, this.popX[1]!));
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i]!;
      l.s *= Math.exp(-dt * 13);
      l.obj.scale.setScalar(l.s);
      if (l.s < 0.06) {
        l.free();
        this.leaving.splice(i, 1);
      }
    }
    const P = this.P;
    for (let i = 0; i < CH; i++) P[i] = this.xB[i]! + this.xO[i]!;
    // Lò xo vọt lố không được ép hai lòng bàn tay lún vào nhau (chắp tay, vỗ tay): chạm thì dừng — như va chạm thật.
    const dy = Math.abs(P[RO + Y]! - P[LO + Y]!);
    const dz = Math.abs(P[RO + Z]! - P[LO + Z]!);
    const sep = P[RO + X]! - P[LO + X]!;
    if (dy < 0.08 && dz < 0.08 && sep < PALM_GAP) {
      const k = (PALM_GAP - sep) * 0.5 * (1 - sm(Math.max(dy, dz) / 0.08));
      P[RO + X] += k;
      P[LO + X] -= k;
    }
    // Nhún khi đi: cùng tần số với camera (CameraRig: pha += dt·(3 + 1,7·tốc độ)) — lắc ngang + nảy hình số 8, hai tay
    // vung so le (ôm vật / cầm chổi thì vung ít), bàn tay lúc lắc nhẹ.
    this.walkAmp += ((speed > 0.4 ? 1 : 0) - this.walkAmp) * Math.min(1, dt * 6);
    this.walkPhase = (this.walkPhase + dt * (3 + Math.max(0, speed) * 1.7)) % TAU;
    const wa = this.walkAmp;
    const ph = this.walkPhase;
    const swing = (this.grip === 'carry' || this.grip === 'tool' ? 0.3 : 1) * wa;
    this.bx = 0.012 * Math.sin(ph) * wa;
    this.by = 0.01 * Math.sin(2 * ph + 0.6) * wa;
    const cs = Math.cos(ph);
    P[RO + Y] += 0.006 * cs * swing;
    P[LO + Y] -= 0.006 * cs * swing;
    P[RO + Z] -= 0.022 * cs * swing;
    P[LO + Z] += 0.022 * cs * swing;
    P[RO + ROLL] += 0.06 * Math.sin(ph) * swing;
    P[LO + ROLL] -= 0.06 * Math.sin(ph) * swing;
    // Giữ tâm bàn tay trong khung nhìn (chỉ nén phần vượt VIEW_KNEE; không đụng trạng thái lò xo).
    for (let h = 0; h < 2; h++) {
      const o = h === 0 ? RO : LO;
      const az = -P[o + Z]!;
      if (az <= 0.05) continue;
      const y = P[o + Y]! + this.by;
      const r = Math.abs(y) / az;
      if (r <= VIEW_KNEE) continue;
      const w = VIEW_MAX - VIEW_KNEE;
      P[o + Y] = Math.sign(y) * az * (VIEW_KNEE + w * Math.tanh((r - VIEW_KNEE) / w)) - this.by;
    }
    const R = this.arms[0];
    const L = this.arms[1];
    this.qHold.slerp(this.qHoldT, first ? 1 : 1 - Math.exp(-dt * 12));
    // Tay phải + vật cầm.
    const wR = this.vW.set(P[RO + X]! + this.bx, P[RO + Y]! + this.by, P[RO + Z]!);
    this.channelQuat(P, R.s, this.qC);
    const qi = this.qI.setFromEuler(this.eulI.set(P[I_TILT]!, 0, -0.15 + P[I_ROLL]!));
    this.itemR.quaternion.copy(qi);
    this.itemR.position.set(0, 0.02, -0.02).applyQuaternion(qi).add(wR);
    const gw = clamp(P[GRIP]!, 0, 1);
    if (gw > 0.001) {
      // Nắm khít cán: ngón cái dọc trục vật, đầu ngón theo hướng cẳng tay.
      const ax = this.vA.set(0, 1, 0).applyQuaternion(this.qT.multiplyQuaternions(qi, this.qHold));
      this.gripQuat(wR, R.s, P[RO + ELB]!, ax, this.qG);
      this.blend(R, gw, first);
    }
    const maxTurn = first ? 0 : MAX_TURN * dt;
    this.place(R, wR, this.qC, P[RO + SQ]!, maxTurn);
    // Tay trái (có thể nắm cán chổi / rìu / nắp bình lắc ngay trên vật cầm của tay phải).
    const wL = this.vL.set(P[LO + X]! + this.bx, P[LO + Y]! + this.by, P[LO + Z]!);
    this.channelQuat(P, L.s, this.qC);
    const sw = clamp(P[SHAFT]!, 0, 1);
    if (sw > 0.001) {
      const q = this.qT.multiplyQuaternions(qi, this.qHold);
      const ax = this.vA.set(0, 1, 0).applyQuaternion(q);
      this.vD.copy(ax).multiplyScalar(P[SLEN]!).add(this.itemR.position);
      wL.lerp(this.vD, sw);
      this.gripQuat(wL, L.s, P[LO + ELB]!, ax, this.qG);
      this.blend(L, sw, first);
    }
    this.place(L, wL, this.qC, P[LO + SQ]!, maxTurn);
    this.placeSleeve(R, P[RO + ELB]!, P[RO + PULL]!);
    this.placeSleeve(L, P[LO + ELB]!, P[LO + PULL]!);
    // Vật ôm: giữa hai bàn tay.
    this.carry.position.addVectors(R.hand.position, L.hand.position).multiplyScalar(0.5);
    this.carry.position.y += 0.02;
    this.carry.position.z -= 0.03;
    this.carry.rotation.set(P[C_TILT]!, 0, P[C_ROLL]!);
    this.carry.scale.setScalar(0.85);
  }

  /**
   * qC ← trộn hướng theo kênh (qC) với hướng nắm cán (qG) theo w. Hai hướng có thể gần ngược nhau: chọn đường quay (trong
   * hai đường) gần hướng khung trước nhất → bàn tay xoay liền mạch, không lật cái rụp khi đổi dụng cụ.
   */
  private blend(arm: Arm, w: number, first: boolean): void {
    if (first) {
      this.qC.slerp(this.qG, w);
      return;
    }
    const prev = arm.hand.quaternion;
    const a = slerpSigned(this.qC, this.qG, w, 1, this.qS1);
    const b = slerpSigned(this.qC, this.qG, w, -1, this.qS2);
    this.qC.copy(Math.abs(a.dot(prev)) >= Math.abs(b.dot(prev)) ? a : b);
  }

  /** Hướng bàn tay theo kênh: nghiêng (mặt phẳng nhìn) · yaw · pitch · roll · khung gốc. */
  private channelQuat(P: Float64Array, s: Side, out: THREE.Quaternion): THREE.Quaternion {
    const o = OFF(s);
    out.setFromEuler(this.eul.set(P[o + PITCH]!, s * P[o + YAW]!, s * P[o + ROLL]!, 'YXZ')).multiply(Q_BASE);
    const tilt = P[o + TILT]!;
    if (tilt !== 0) out.premultiply(this.qT.setFromAxisAngle(Z_AXIS, -s * tilt));
    return out;
  }

  /** Điểm khuỷu ảo (ngoài khung hình, dưới-sau) — ống tay chạy từ cổ tay về đây. */
  private elbow(s: Side, elb: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(s * (0.27 + elb) + this.bx, -0.64 + this.by, 0.02);
  }

  /** Hướng nắm khít một cán có trục `ax` tại `w`: ngón cái (+Z cục bộ) dọc trục, đầu ngón (−Y) theo hướng cẳng tay. */
  private gripQuat(w: THREE.Vector3, s: Side, elb: number, ax: THREE.Vector3, out: THREE.Quaternion): void {
    // Hướng tham chiếu cố định theo tư thế = cẳng tay + chếch vào giữa: chiếu vuông góc với trục cán. Không dùng riêng
    // cẳng tay (cán quét qua gần song song cẳng tay — vd sạn chúc xuống — thì hướng ngón lật ngược đột ngột).
    const d = this.elbow(s, elb, this.vD).sub(w).negate().normalize();
    const f = this.vU.copy(d).addScaledVector(this.vX.set(-s, 0, 0), 0.6);
    f.addScaledVector(ax, -f.dot(ax));
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1).addScaledVector(ax, ax.z);
    f.normalize();
    const y = f.negate();
    const x = this.vX.crossVectors(y, ax).normalize();
    this.mB.makeBasis(x, y, this.vZ.crossVectors(x, y));
    out.setFromRotationMatrix(this.mB);
  }

  /** Đặt nhóm bàn tay: vị trí, hướng, bóp dẹt theo trục lòng bàn tay. */
  private place(arm: Arm, w: THREE.Vector3, q: THREE.Quaternion, sq: number, maxTurn: number): void {
    const k = clamp(sq, -0.5, 1.5);
    arm.hand.position.copy(w);
    // Giới hạn tốc độ xoay cổ tay: đích có đổi đột ngột (đổi dụng cụ, hai hướng gần ngược nhau) thì vẫn xoay mượt.
    if (maxTurn > 0) arm.hand.quaternion.rotateTowards(q, maxTurn);
    else arm.hand.quaternion.copy(q);
    arm.hand.scale.set(1 - 0.12 * k, 1 + 0.05 * k, 1 + 0.05 * k);
  }

  /**
   * Ống tay: gốc ở điểm xoay cổ tay, chạy về khuỷu ảo nhưng ngả theo hướng cổ tay (≥ 35%, nhiều hơn khi bàn tay gập
   * mạnh — cổ tay gập còn ≤ ~30°, găng + cổ tay da luôn nằm trong miệng tay áo), +Z cục bộ hướng lên.
   */
  private placeSleeve(arm: Arm, elb: number, pull: number): void {
    const hd = this.vU.set(0, 1, 0).applyQuaternion(arm.hand.quaternion);
    const piv = this.vW.copy(arm.hand.position).addScaledVector(hd, WRIST);
    const toE = this.elbow(arm.s, elb, this.vD).sub(piv).normalize();
    const th = Math.acos(clamp(toE.dot(hd), -1, 1));
    const k = th > 0.5 ? Math.max(0.35, 1 - 0.5 / th) : 0.35;
    const u = toE.multiplyScalar(1 - k).addScaledVector(hd, k).normalize();
    const z = this.vZ.copy(SLEEVE_UP).addScaledVector(u, -SLEEVE_UP.dot(u));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(u, -u.z);
    z.normalize();
    const x = this.vX.crossVectors(u, z);
    this.mB.makeBasis(x, u, z);
    arm.sleeve.quaternion.setFromRotationMatrix(this.mB);
    arm.sleeve.position.copy(piv).addScaledVector(u, pull);
  }

  dispose(): void {
    this.tool?.dispose();
    this.tool = null;
    for (const l of this.leaving) l.free();
    this.leaving.length = 0;
    if (this.heldObj) {
      this.heldObj.removeFromParent();
      kit.disposeTree(this.heldObj);
      this.heldObj = null;
    }
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.root.removeFromParent();
  }
}

export const createFirstPersonView: CreateFirstPersonView = (look: AvatarLook): FirstPersonHandle => new FpView(look);
