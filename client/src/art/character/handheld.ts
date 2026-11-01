// Đồ cầm tay: tích trượng (cán gỗ thuôn + đai vàng, khoen nhọn hình ngọn lửa + 6 khoen nhỏ leng keng), quạt nan xếp
// (giấy vẽ tranh, tua đỏ đung đưa), dụng cụ làm việc (rìu, dùi mõ, dao, sạn, quạt mo, bình lắc). Gốc mỗi món = tâm nắm
// trong lòng bàn tay, +Y dọc cán. Hình dùng chung giữa các nhân vật (cache, không dispose); vật liệu từ MatFactory.
import * as THREE from 'three';
import type { AnimId } from '@shared/index';
import { Buf, lathe, merge, sweep } from './headwear';
import type { Dangler, HandheldBuild, MatFactory, MatOpts, ToolKind } from './rig';

/** Dụng cụ hiện ở tay phải theo hoạt ảnh (khi tay đang trống). */
export const TOOL_FOR: Partial<Record<AnimId, ToolKind>> = {
  chop: 'axe',
  strike: 'mallet',
  cut: 'knife',
  stir: 'spatula',
  fan: 'fan',
  shake: 'shaker',
};

const GOLD: MatOpts = { metalness: 0.45, roughness: 0.38, emissive: '#b8862f', ei: 0.25 };
const STEEL: MatOpts = { metalness: 0.65, roughness: 0.32 };
const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
function smooth(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Một phần của món đồ: hình (dùng chung) + vật liệu. */
interface Piece {
  readonly geo: THREE.BufferGeometry;
  readonly key: string;
  readonly color: string;
  readonly opts?: MatOpts;
  readonly shadow: boolean;
}

/** Đồ lủng lẳng: nhóm đặt ở điểm treo (góc nghỉ = 0), các phần treo bên dưới. */
interface Hang {
  readonly at: THREE.Vector3;
  readonly gain: number;
  readonly pieces: readonly Piece[];
  /** Xoay riêng của phần treo (trong nhóm). */
  readonly yaw?: number;
}

function assemble(pieces: readonly Piece[], hangs: readonly Hang[], below: number, mat: MatFactory): HandheldBuild {
  const root = new THREE.Group();
  root.name = 'handheld';
  const mesh = (p: Piece, parent: THREE.Object3D): void => {
    const m = new THREE.Mesh(p.geo, mat(p.key, p.color, p.opts));
    m.castShadow = p.shadow;
    m.receiveShadow = p.shadow;
    parent.add(m);
  };
  for (const p of pieces) mesh(p, root);
  const danglers: Dangler[] = [];
  for (const h of hangs) {
    const g = new THREE.Group();
    g.position.copy(h.at);
    root.add(g);
    const inner = new THREE.Group();
    inner.rotation.y = h.yaw ?? 0;
    g.add(inner);
    for (const p of h.pieces) mesh(p, inner);
    danglers.push({ obj: g, gain: h.gain });
  }
  return {
    root,
    below,
    sitMorph: [],
    danglers,
    dispose() {
      root.removeFromParent();
    },
  };
}

/** Lấy mẫu Catmull-Rom (centripetal) qua các điểm (x, y) trong mặt phẳng z = 0. */
function curveXY(pts: readonly (readonly [number, number])[], count: number): THREE.Vector3[] {
  return new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    'centripetal',
  ).getPoints(count);
}

/**
 * Tấm dẹt theo đường viền (z, y) — lưỡi rìu, lưỡi dao: dày theo X = 2·half(z) (mỏng dần ra mép), mặt + thành viền.
 * Viền đi một vòng, không lặp điểm đầu.
 */
function blade(outline: readonly (readonly [number, number])[], half: (z: number) => number): THREE.BufferGeometry {
  const b = new Buf();
  const P = new THREE.Vector3();
  const out = new THREE.Vector3();
  const shape = outline.map(([z, y]) => new THREE.Vector2(z, y));
  const tris = THREE.ShapeUtils.triangulateShape(shape, []);
  const side = (s: number): number[] => outline.map(([z, y]) => b.v(P.set(s * half(z), y, z)));
  const front = side(1);
  const back = side(-1);
  for (const [a, c, d] of tris) {
    b.tri(front[a]!, front[c]!, front[d]!, out.set(1, 0, 0));
    b.tri(back[a]!, back[c]!, back[d]!, out.set(-1, 0, 0));
  }
  const rf = side(1);
  const rb = side(-1);
  let cz = 0;
  let cy = 0;
  for (const [z, y] of outline) {
    cz += z / outline.length;
    cy += y / outline.length;
  }
  for (let k = 0; k < outline.length; k++) {
    const k1 = (k + 1) % outline.length;
    const [z0, y0] = outline[k]!;
    const [z1, y1] = outline[k1]!;
    // Pháp tuyến viền: vuông góc cạnh, hướng ra xa tâm hình.
    out.set(0, z1 - z0, -(y1 - y0));
    if (out.y * ((y0 + y1) / 2 - cy) + out.z * ((z0 + z1) / 2 - cz) < 0) out.negate();
    b.quad(rf[k]!, rf[k1]!, rb[k1]!, rb[k]!, out);
  }
  return b.geometry();
}

// ───────────────────────── Tích trượng ─────────────────────────

/** Tâm nắm cách đầu dưới gậy (m) — avatar.ts trượt gậy trong tay để đầu dưới không thấp hơn y 0.02. */
const STAFF_BELOW = 0.52;
/** Đỉnh cán gỗ (chân khoen) tính từ tâm nắm. Tổng dài cán ≈ 1.95 m. */
const SHAFT_TOP = 1.95 - STAFF_BELOW;
/** Bán kính khoen nhỏ (tâm ống) và nửa bề dày ống. */
const RING_R = 0.015;

interface StaffGeo {
  readonly wood: THREE.BufferGeometry;
  /** Bịt chân + đai + chuôi đỡ khoen (đứng yên theo cán). */
  readonly gold: THREE.BufferGeometry;
  /** Đầu gậy: khoen lớn + trụ + ngọc lửa + 6 khoen nhỏ gộp một lưới, gốc toạ độ = chân khoen lớn (FINIAL_AT). */
  readonly finial: THREE.BufferGeometry;
}
let staffGeo: StaffGeo | null = null;

/** Đai vàng quanh cán ở độ cao y. */
function collar(y: number, r: number): THREE.BufferGeometry {
  return lathe(
    [
      [r, y - 0.014],
      [r + 0.004, y - 0.008],
      [r + 0.0048, y],
      [r + 0.004, y + 0.008],
      [r, y + 0.014],
    ],
    12,
  );
}

function staffGeometry(): StaffGeo {
  if (staffGeo) return staffGeo;
  const T = SHAFT_TOP;
  // Cán gỗ thuôn nhẹ (dưới to, trên nhỏ).
  const wood = lathe(
    [
      [0, -STAFF_BELOW + 0.02],
      [0.0215, -STAFF_BELOW + 0.02],
      [0.0226, -0.1],
      [0.022, 0.4],
      [0.0205, 1.0],
      [0.019, T],
      [0, T],
    ],
    10,
  );
  const gold: THREE.BufferGeometry[] = [];
  // Bịt chân gậy.
  gold.push(
    lathe(
      [
        [0, -STAFF_BELOW],
        [0.019, -STAFF_BELOW],
        [0.0235, -STAFF_BELOW + 0.008],
        [0.0245, -STAFF_BELOW + 0.05],
        [0.0232, -STAFF_BELOW + 0.065],
        [0.0222, -STAFF_BELOW + 0.072],
      ],
      12,
    ),
  );
  // Đai quanh chỗ nắm và giữa cán.
  gold.push(collar(-0.115, 0.0222), collar(0.115, 0.021), collar(0.8, 0.0202));
  // Chuôi đỡ khoen.
  gold.push(
    lathe(
      [
        [0.0188, T - 0.075],
        [0.0245, T - 0.06],
        [0.0262, T - 0.038],
        [0.022, T - 0.02],
        [0.024, T - 0.005],
        [0.031, T + 0.008],
        [0.03, T + 0.022],
        [0.02, T + 0.032],
        [0.012, T + 0.038],
        [0, T + 0.04],
      ],
      12,
    ),
  );
  // Khoen lớn: vòng nhọn hình ngọn lửa (2 nửa gặp nhau ở chóp), dải dẹt trong mặt phẳng XY.
  const Y = T + 0.032;
  const half: readonly (readonly [number, number])[] = [
    [0.014, Y],
    [0.03, Y + 0.014],
    [0.045, Y + 0.038],
    [0.0535, Y + 0.068],
    [0.0555, Y + 0.103],
    [0.05, Y + 0.138],
    [0.038, Y + 0.17],
    [0.022, Y + 0.198],
    [0, Y + 0.228],
  ];
  const head: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const pts = curveXY(
      half.map(([x, y]) => [s * x, y] as const),
      16,
    );
    head.push(sweep(pts, { sides: 6, r: () => 0.0062, kn: 0.75, kb: 1.15, ref: (_p, o) => o.set(0, 0, 1), capEnd: true, capStart: true }));
  }
  // Trụ giữa (tháp nhỏ) trong khoen + ngọc lửa trên chóp.
  head.push(
    lathe(
      [
        [0.012, Y - 0.004],
        [0.0085, Y + 0.02],
        [0.0135, Y + 0.038],
        [0.0155, Y + 0.058],
        [0.0075, Y + 0.082],
        [0.011, Y + 0.092],
        [0.0055, Y + 0.115],
        [0, Y + 0.13],
      ],
      10,
    ),
  );
  head.push(
    lathe(
      [
        [0, Y + 0.214],
        [0.0115, Y + 0.224],
        [0.0135, Y + 0.238],
        [0.009, Y + 0.254],
        [0, Y + 0.282],
      ],
      10,
    ),
  );
  // 6 khoen nhỏ treo trên đoạn dốc dưới của khoen lớn (3 mỗi bên), mặt khoen chéo 45° để nhìn đâu cũng thấy tròn. Gộp
  // chung lưới đầu gậy (cả cụm rung theo một gốc — 1 lần vẽ thay vì 6; từng khoen nhỏ 3 cm lắc riêng gần như không thấy).
  const path = curveXY(half, 64);
  for (const s of [1, -1]) {
    for (const hy of [Y + 0.016, Y + 0.038, Y + 0.058]) {
      let best = path[0]!;
      for (const p of path) if (Math.abs(p.y - hy) < Math.abs(best.y - hy)) best = p;
      const ring = new THREE.TorusGeometry(RING_R, 0.0032, 4, 12);
      ring.translate(0, -RING_R, 0);
      ring.rotateY(s * (Math.PI / 4));
      ring.translate(s * best.x, best.y, 0);
      head.push(ring);
    }
  }
  const finial = merge(head);
  finial.translate(0, -Y, 0);
  staffGeo = { wood, gold: merge(gold), finial };
  return staffGeo;
}

/** Chân khoen lớn (tính từ tâm nắm): đầu gậy rung quanh điểm này. */
const FINIAL_AT = new THREE.Vector3(0, SHAFT_TOP + 0.032, 0);

/** Tích trượng (Phương Trượng, tay trái): dài 1.95 m, nắm cách chân 0.52 m; khoen đầu gậy trong bán kính 0.09 quanh trục. */
export function buildStaff(mat: MatFactory): HandheldBuild {
  const g = staffGeometry();
  return assemble(
    [
      { geo: g.wood, key: 'staffWood', color: '#8a5a2b', opts: { roughness: 0.62 }, shadow: true },
      { geo: g.gold, key: 'gold', color: '#ffd166', opts: GOLD, shadow: true },
    ],
    // Đầu gậy + khoen nhún nhẹ theo nhịp động tác (avatar.ts: đồ treo trên gậy đứng thẳng chỉ lắc phần động).
    [{ at: FINIAL_AT, gain: 0.3, pieces: [{ geo: g.finial, key: 'gold', color: '#ffd166', opts: GOLD, shadow: true }] }],
    STAFF_BELOW,
    mat,
  );
}

// ───────────────────────── Quạt nan ─────────────────────────

const FAN = { r0: 0.1, r1: 0.25, half: (60 * Math.PI) / 180, n: 12, depth: 0.011 } as const;

let fanTex: THREE.Texture | null | undefined;
/** Tranh trên giấy quạt (vẽ một lần): nền giấy dó, núi mực, mặt trời đỏ, cành đào. Không có DOM (chạy headless) → null. */
function fanTexture(): THREE.Texture | null {
  if (fanTex !== undefined) return fanTex;
  if (typeof document === 'undefined') return (fanTex = null);
  const W = 256;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return (fanTex = null);
  // Gốc quạt ở giữa đáy (128, 128); 512 px / m.
  const px = (r: number, a: number): [number, number] => [W / 2 + Math.sin(a) * r * 512, H - Math.cos(a) * r * 512];
  const grad = g.createRadialGradient(W / 2, H, 30, W / 2, H, 130);
  grad.addColorStop(0, '#fff6e3');
  grad.addColorStop(0.7, '#fbe9cc');
  grad.addColorStop(1, '#f3cfa8');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // Núi mực xa / gần.
  for (const [base, amp, col] of [
    [0.16, 0.035, 'rgba(110,130,150,0.45)'],
    [0.13, 0.03, 'rgba(70,85,100,0.55)'],
  ] as const) {
    g.beginPath();
    for (let k = 0; k <= 40; k++) {
      const a = -FAN.half + (k / 40) * FAN.half * 2;
      const r = base + amp * Math.abs(Math.sin(a * 5.3 + base * 40)) * (0.6 + 0.4 * Math.sin(a * 2.1));
      const [x, y] = px(r, a);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let k = 40; k >= 0; k--) {
      const [x, y] = px(0.09, -FAN.half + (k / 40) * FAN.half * 2);
      g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = col;
    g.fill();
  }
  // Mặt trời đỏ.
  const [sx, sy] = px(0.205, 0.42);
  g.fillStyle = '#d9352b';
  g.beginPath();
  g.arc(sx, sy, 11, 0, TAU);
  g.fill();
  // Cành đào: thân mực + hoa hồng.
  g.strokeStyle = '#3b2a22';
  g.lineCap = 'round';
  g.lineWidth = 3;
  const [b0x, b0y] = px(0.235, -0.95);
  const [b1x, b1y] = px(0.19, -0.45);
  const [b2x, b2y] = px(0.222, -0.05);
  g.beginPath();
  g.moveTo(b0x, b0y);
  g.quadraticCurveTo(b1x, b1y, b2x, b2y);
  g.stroke();
  g.lineWidth = 1.6;
  const [t0x, t0y] = px(0.2, -0.55);
  const [t1x, t1y] = px(0.165, -0.3);
  g.beginPath();
  g.moveTo(t0x, t0y);
  g.lineTo(t1x, t1y);
  g.stroke();
  for (const [r, a, s] of [
    [0.225, -0.75, 6],
    [0.2, -0.5, 7],
    [0.17, -0.32, 5],
    [0.212, -0.25, 6],
    [0.224, -0.08, 5],
    [0.19, -0.62, 4],
  ] as const) {
    const [x, y] = px(r, a);
    g.fillStyle = '#f48fb1';
    for (let k = 0; k < 5; k++) {
      const pa = (k / 5) * TAU;
      g.beginPath();
      g.arc(x + Math.cos(pa) * s * 0.55, y + Math.sin(pa) * s * 0.55, s * 0.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.arc(x, y, s * 0.28, 0, TAU);
    g.fill();
  }
  // Viền đỏ sát mép giấy.
  g.strokeStyle = '#b5382f';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(W / 2, H, 0.24 * 512, -Math.PI / 2 - FAN.half, -Math.PI / 2 + FAN.half);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (fanTex = t);
}

interface FanGeo {
  readonly paper: THREE.BufferGeometry;
  readonly ribs: THREE.BufferGeometry;
  readonly rivet: THREE.BufferGeometry;
  readonly tassel: THREE.BufferGeometry;
}
let fanGeo: FanGeo | null = null;

function fanGeometry(): FanGeo {
  if (fanGeo) return fanGeo;
  const { r0, r1, half, n, depth } = FAN;
  // Giấy xếp nếp: nan ở nếp lõm (z = 0), giữa hai nan là nếp lồi (+Z), mỗi mảnh phẳng riêng (nếp gấp sắc).
  const b = new Buf();
  const P = new THREE.Vector3();
  const out = new THREE.Vector3(0, 0, 1);
  const radii = [r0, (r0 + r1) / 2, r1];
  const vtx = (a: number, r: number, z: number): number => {
    P.set(Math.sin(a) * r, Math.cos(a) * r, z);
    return b.v(P, 0.5 + P.x / (2 * r1), P.y / r1);
  };
  for (let k = 0; k < n; k++) {
    const a0 = -half + (k / n) * half * 2;
    const a1 = -half + ((k + 1) / n) * half * 2;
    const am = (a0 + a1) / 2;
    for (const [aa, ab, za, zb] of [
      [a0, am, 0, 1],
      [am, a1, 1, 0],
    ] as const) {
      const ca: number[] = [];
      const cb: number[] = [];
      for (const r of radii) {
        ca.push(vtx(aa, r, za * depth * (r / r1)));
        cb.push(vtx(ab, r, zb * depth * (r / r1)));
      }
      for (let j = 0; j < radii.length - 1; j++) b.quad(ca[j]!, cb[j]!, cb[j + 1]!, ca[j + 1]!, out);
    }
  }
  const paper = b.geometry();
  // Nan tre: phần lộ dưới giấy + 2 nan cái (dày) chạy hết mép.
  const ribs: THREE.BufferGeometry[] = [];
  for (let k = 0; k <= n; k++) {
    const a = -half + (k / n) * half * 2;
    const guard = k === 0 || k === n;
    const len = guard ? r1 + 0.01 : r0 + 0.014;
    const box = new THREE.BoxGeometry(guard ? 0.011 : 0.0068, len - 0.006, guard ? 0.0062 : 0.0026);
    box.translate(0, 0.006 + (len - 0.006) / 2, guard ? 0.0012 : -0.0018);
    box.rotateZ(-a);
    ribs.push(box);
  }
  const rivet = new THREE.CylinderGeometry(0.0095, 0.0095, 0.02, 10);
  rivet.rotateX(Math.PI / 2);
  // Tua đỏ: dây + nút + chùm tua, treo dưới đinh quạt.
  const cord = new THREE.CylinderGeometry(0.0022, 0.0022, 0.095, 5);
  cord.translate(0, -0.0475, 0);
  const knot = new THREE.SphereGeometry(0.0085, 8, 6);
  knot.translate(0, -0.097, 0);
  const tuft = lathe(
    [
      [0.004, -0.1],
      [0.011, -0.108],
      [0.0145, -0.128],
      [0.0165, -0.15],
      [0.012, -0.156],
      [0, -0.157],
    ],
    8,
  );
  fanGeo = { paper, ribs: merge(ribs), rivet, tassel: merge([cord, knot, tuft]) };
  return fanGeo;
}

/** Quạt nan xếp (tay trái): mở ~120° trong mặt phẳng XY, mặt tranh nhìn về +Z; gốc = đinh quạt (chỗ nắm). */
export function buildFan(mat: MatFactory): HandheldBuild {
  const g = fanGeometry();
  const tex = fanTexture();
  return assemble(
    [
      { geo: g.paper, key: 'fanPaper', color: tex ? '#ffffff' : '#efd9ad', opts: { roughness: 0.85, doubleSide: true, map: tex }, shadow: true },
      { geo: g.ribs, key: 'fanRib', color: '#8a5a2b', opts: { roughness: 0.6 }, shadow: false },
      { geo: g.rivet, key: 'gold', color: '#ffd166', opts: GOLD, shadow: false },
    ],
    [{ at: new THREE.Vector3(0, 0, 0), gain: 1.3, pieces: [{ geo: g.tassel, key: 'fanTassel', color: '#c0392b', opts: { roughness: 0.7 }, shadow: false }] }],
    0.02,
    mat,
  );
}

// ───────────────────────── Dụng cụ làm việc ─────────────────────────

const toolCache = new Map<ToolKind, readonly Piece[]>();

function toolPieces(kind: ToolKind): readonly Piece[] {
  const hit = toolCache.get(kind);
  if (hit) return hit;
  const wood = (geo: THREE.BufferGeometry): Piece => ({ geo, key: 'toolWood', color: '#9c6b3c', opts: { roughness: 0.7 }, shadow: true });
  const steel = (geo: THREE.BufferGeometry, shadow = true): Piece => ({ geo, key: 'toolSteel', color: '#a7b0ba', opts: STEEL, shadow });
  let pieces: Piece[];
  switch (kind) {
    case 'axe': {
      const handle = lathe(
        [
          [0, -0.12],
          [0.023, -0.118],
          [0.025, -0.1],
          [0.0195, -0.07],
          [0.018, 0.1],
          [0.017, 0.3],
          [0.019, 0.42],
          [0.019, 0.5],
          [0.012, 0.516],
          [0, 0.518],
        ],
        10,
      );
      // Lưỡi rìu: lỗ tra cán + má dày, lưỡi xoè cong mỏng dần ra mép (hướng +Z).
      const head = blade(
        [
          [-0.042, 0.42],
          [-0.03, 0.408],
          [0.02, 0.414],
          [0.07, 0.424],
          [0.12, 0.408],
          [0.155, 0.393],
          [0.17, 0.418],
          [0.178, 0.47],
          [0.17, 0.522],
          [0.155, 0.546],
          [0.12, 0.535],
          [0.07, 0.506],
          [0.02, 0.496],
          [-0.03, 0.5],
          [-0.042, 0.49],
        ],
        (z) => mix(0.022, 0.0025, smooth(0.02, 0.172, z)),
      );
      pieces = [wood(handle), steel(head)];
      break;
    }
    case 'mallet': {
      const handle = lathe(
        [
          [0, -0.035],
          [0.013, -0.033],
          [0.0145, -0.02],
          [0.012, 0.1],
          [0.0108, 0.24],
          [0.0102, 0.25],
          [0, 0.252],
        ],
        8,
      );
      const head = new THREE.SphereGeometry(0.042, 12, 9);
      head.scale(1, 0.92, 1);
      head.translate(0, 0.28, 0);
      const tie = new THREE.TorusGeometry(0.0125, 0.0042, 5, 12);
      tie.rotateX(Math.PI / 2);
      tie.translate(0, 0.243, 0);
      pieces = [
        { geo: handle, key: 'malletWood', color: '#7c4b2b', opts: { roughness: 0.65 }, shadow: true },
        { geo: head, key: 'malletHead', color: '#5a3420', opts: { roughness: 0.9 }, shadow: true },
        { geo: tie, key: 'malletTie', color: '#b5382f', opts: { roughness: 0.7 }, shadow: false },
      ];
      break;
    }
    case 'knife': {
      const handle = new THREE.CapsuleGeometry(0.0145, 0.07, 4, 8);
      handle.scale(0.8, 1, 1.15);
      handle.translate(0, 0.022, 0);
      const bolster = new THREE.CylinderGeometry(0.0145, 0.016, 0.012, 10);
      bolster.scale(0.75, 1, 1.25);
      bolster.translate(0, 0.07, 0.004);
      const edge = blade(
        [
          [-0.012, 0.074],
          [0.034, 0.074],
          [0.035, 0.12],
          [0.034, 0.18],
          [0.028, 0.225],
          [0.014, 0.255],
          [-0.004, 0.27],
          [-0.012, 0.25],
          [-0.012, 0.15],
        ],
        (z) => mix(0.0032, 0.0008, smooth(-0.012, 0.035, z)),
      );
      pieces = [{ geo: handle, key: 'knifeHandle', color: '#4e2f1f', opts: { roughness: 0.55 }, shadow: true }, steel(merge([bolster, edge]))];
      break;
    }
    case 'spatula': {
      const handle = lathe(
        [
          [0, -0.035],
          [0.0135, -0.033],
          [0.015, -0.02],
          [0.013, 0.15],
          [0.012, 0.25],
          [0.009, 0.262],
          [0, 0.264],
        ],
        8,
      );
      const neck = new THREE.CylinderGeometry(0.0045, 0.006, 0.07, 6);
      neck.translate(0, 0.287, 0);
      // Lưỡi sạn: tấm thép bo góc trên, cong nhẹ về sau như sạn chảo.
      const plate = new THREE.BoxGeometry(0.09, 0.1, 0.004, 4, 5, 1);
      const pp = plate.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i);
        const y = pp.getY(i);
        const f = (y + 0.05) / 0.1;
        const nx = x * (1 - 0.22 * smooth(0.55, 1, f) * smooth(0.5, 1, Math.abs(x) / 0.045)) * mix(0.82, 1, smooth(0, 0.35, f));
        pp.setXYZ(i, nx, y, pp.getZ(i) - 0.016 * f * f);
      }
      plate.computeVertexNormals();
      plate.translate(0, 0.37, 0);
      pieces = [wood(handle), steel(merge([neck, plate]))];
      break;
    }
    case 'fan': {
      // Quạt mo / lá cọ: lá tròn xếp gân toả, viền nẹp, cán tre.
      const R = 0.14;
      const C = 0.2;
      const NA = 28;
      const b = new Buf();
      const P = new THREE.Vector3();
      const out = new THREE.Vector3(0, 0, 1);
      const center = b.v(P.set(0, C, 0.004));
      const rows: number[][] = [];
      for (const f of [0.45, 1]) {
        const row: number[] = [];
        for (let k = 0; k < NA; k++) {
          const a = (k / NA) * TAU;
          const r = R * f * (1 + 0.06 * Math.cos(a)) * (a > Math.PI * 0.85 && a < Math.PI * 1.15 ? 0.94 : 1);
          row.push(b.v(P.set(Math.sin(a) * r, C + Math.cos(a) * r * 1.05, 0.0065 * Math.cos(a * 14) * f)));
        }
        rows.push(row);
      }
      for (let k = 0; k < NA; k++) {
        const k1 = (k + 1) % NA;
        b.tri(center, rows[0]![k]!, rows[0]![k1]!, out);
        b.quad(rows[0]![k]!, rows[0]![k1]!, rows[1]![k1]!, rows[1]![k]!, out);
      }
      const leaf = b.geometry();
      const edge: THREE.Vector3[] = [];
      for (let k = 0; k < NA; k++) {
        const a = (k / NA) * TAU;
        const r = R * (1 + 0.06 * Math.cos(a)) * (a > Math.PI * 0.85 && a < Math.PI * 1.15 ? 0.94 : 1);
        edge.push(new THREE.Vector3(Math.sin(a) * r, C + Math.cos(a) * r * 1.05, 0.0065 * Math.cos(a * 14)));
      }
      const rim = sweep(edge, { sides: 4, r: () => 0.0045, closed: true, ref: (_p, o) => o.set(0, 0, 1) });
      const stick = new THREE.CylinderGeometry(0.0095, 0.011, 0.2, 6);
      stick.translate(0, 0.04, 0);
      const spine = new THREE.BoxGeometry(0.008, 0.24, 0.006);
      spine.translate(0, C - 0.01, 0.002);
      pieces = [
        { geo: leaf, key: 'toolLeaf', color: '#e8c58a', opts: { roughness: 0.8, doubleSide: true }, shadow: true },
        { geo: merge([rim, stick, spine]), key: 'toolLeafRim', color: '#8a5a2b', opts: { roughness: 0.65 }, shadow: false },
      ];
      break;
    }
    case 'shaker': {
      const body = lathe(
        [
          [0, 0.02],
          [0.042, 0.02],
          [0.046, 0.025],
          [0.05, 0.188],
          [0.0525, 0.198],
          [0.049, 0.205],
          [0.047, 0.21],
          [0.05, 0.216],
          [0.046, 0.238],
          [0.037, 0.253],
          [0.024, 0.261],
          [0.021, 0.269],
          [0.0245, 0.277],
          [0.02, 0.289],
          [0, 0.292],
        ],
        16,
      );
      pieces = [{ geo: body, key: 'shaker', color: '#d9dde3', opts: { metalness: 0.85, roughness: 0.22 }, shadow: true }];
      break;
    }
  }
  toolCache.set(kind, pieces);
  return pieces;
}

/** Dụng cụ làm việc ở tay phải (cỡ như bản cũ). */
export function buildTool(kind: ToolKind, mat: MatFactory): HandheldBuild {
  return assemble(toolPieces(kind), [], 0.06, mat);
}
