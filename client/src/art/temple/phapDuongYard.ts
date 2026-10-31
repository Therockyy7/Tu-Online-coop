// Sân trên trước Đại Pháp Đường + hai nghi môn ở lối lên. Sân lát đá xám khổ lớn có bó vỉa thấp; thần đạo (trục giữa)
// lát phiến đá mài sáng màu thẳng vào cửa chính, lối ngang dọc mép Nam nối hai đường lên (Đông x = 18, Tây x = −12,4)
// vào thần đạo; đôi đèn đá lớn, đôi nghê đá trên bệ, sáu cột phướn ngũ sắc lay gió, bờ cây xén + chậu bonsai hai bên
// sân; hai nghi môn cột son mái ngói mang biển "ĐẠI PHÁP ĐƯỜNG". Bố cục đọc từ PHAP_DUONG; đồ có va chạm (đèn đá, nghê,
// cột phướn) đặt đúng theo collider của map Chùa.
import * as THREE from 'three';
import { PHAP_DUONG, TEMPLE_MAP, type Rng } from '@shared/index';
import { foliageGeometry, leafMaterial } from '../common/nature';
import { kit } from '../kit';
import { applySurface } from '../pbr';
import { pillar } from './buildings';
import { addStatic, hangingLantern, verticalBoard, type TempleCtx } from './ctx';
import { vietRoof } from './roof';

const { geo, mat, mesh } = kit;
const P = PHAP_DUONG;
const PLAZA = P.plaza;

const C = {
  red: '#a8432f',
  redDark: '#7f2e1f',
  lacquer: '#7a1f12',
  gold: '#e8b04a',
  goldBright: '#ffd166',
  bracket: '#c8a064',
  stone: '#bbb5a9',
  stoneDark: '#a19a8d',
};

/** Cao độ các lớp lát (đất y = 0, lối đá ở ground.ts y = 0,01): mặt sân < vữa mạch < phiến đá mài. */
const FIELD_Y = 0.02;
const GROUT_Y = 0.026;
const SLAB_Y = 0.032;
/** Mạch vữa giữa hai phiến (m). */
const JOINT = 0.03;
/** Nửa bề rộng thần đạo (cửa chính rộng 5 m) và bề rộng viền đá sẫm hai bên. */
const AXIS = 3;
const BAND = 0.32;
/** Lối lên phía Tây (khớp PATHS ở ground.ts): tâm x + nửa bề rộng — mép Nam sân chừa chỗ cho lối này. */
const WEST_LANE_X = -12.4;
const WEST_LANE_HALF = 0.8;

/** Đá mài hạt mịn (đèn, nghê, bệ, bó vỉa) — vật liệu cache theo màu. */
function dressed(color: string): THREE.MeshStandardMaterial {
  return mat(color, { surface: 'carved', roughness: 0.82 });
}

/**
 * Phóng to vân texture ba mặt cho riêng một vật liệu (uniform `uTriScale` riêng, mét/lần lặp): đá lát sân thành phiến
 * lớn hơn lối đi. Mã shader y hệt bản gốc (chỉ khác giá trị uniform) nên giữ khoá cache, dùng chung chương trình.
 */
function widenGrain(m: THREE.MeshStandardMaterial, metersPerTile: number): THREE.MeshStandardMaterial {
  const key = m.customProgramCacheKey();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, renderer) => {
    prev.call(m, sh, renderer);
    sh.uniforms.uTriScale = { value: metersPerTile };
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ───────────────────────── Mặt sân + phiến lát ─────────────────────────

/** Tam giác rời của các phiến đá lát (mặt trên hướng +Y) + màu đỉnh từng phiến. */
interface Sheet {
  pos: number[];
  col: number[];
}

function quad(s: Sheet, x0: number, x1: number, z0: number, z1: number, c: THREE.Color): void {
  s.pos.push(x0, SLAB_Y, z0, x0, SLAB_Y, z1, x1, SLAB_Y, z1, x0, SLAB_Y, z0, x1, SLAB_Y, z1, x1, SLAB_Y, z0);
  for (let i = 0; i < 6; i++) s.col.push(c.r, c.g, c.b);
}

/**
 * Lát kín chữ nhật [x0, x1] × [z0, z1] bằng phiến `sw` (theo X) × `sd` (theo Z), chừa mạch vữa; `stagger` = hàng so
 * le nửa phiến. Mỗi phiến đậm nhạt khác nhau một chút quanh `tone` (độ sáng so với màu vật liệu).
 */
function pave(s: Sheet, rng: Rng, x0: number, x1: number, z0: number, z1: number, sw: number, sd: number, tone = 1, stagger = true): void {
  const c = new THREE.Color();
  let row = 0;
  for (let za = z0; za < z1 - JOINT; za += sd, row++) {
    const zb = Math.min(z1, za + sd);
    for (let xa = x0 - (stagger && row % 2 ? sw / 2 : 0); xa < x1 - JOINT; xa += sw) {
      const a = Math.max(x0, xa);
      const b = Math.min(x1, xa + sw);
      if (b - a <= JOINT * 2) continue;
      const v = tone * (0.9 + rng.next() * 0.15);
      c.setRGB(v, v * (0.985 + rng.next() * 0.03), v * (0.97 + rng.next() * 0.03));
      quad(s, a + JOINT / 2, b - JOINT / 2, za + JOINT / 2, zb - JOINT / 2, c);
    }
  }
}

function sheetMesh(s: Sheet, m: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  const nor = new Float32Array(s.pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  return mesh(g, m, { castShadow: false });
}

/** Mặt sân đá xám; thần đạo, lối ngang mép Nam, nền dưới hai nghi môn lát phiến đá mài; bó vỉa thấp quanh sân. */
function buildPaving(ctx: TempleCtx): void {
  const { minX, maxX, minZ, maxZ } = PLAZA;
  const g = new THREE.Group();

  // ── Mặt sân: đá xám (texture ba mặt, vân phóng to thành phiến lớn), loang đậm nhạt + tối dần sát bó vỉa ──
  const field = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 48, 12)
    .rotateX(-Math.PI / 2)
    .translate((minX + maxX) / 2, FIELD_Y, (minZ + maxZ) / 2);
  const fp = field.getAttribute('position') as THREE.BufferAttribute;
  const fc = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i);
    const z = fp.getZ(i);
    const mottle = 0.95 + Math.sin(x * 0.19 + Math.sin(z * 0.41) * 1.6) * Math.sin(z * 0.33 - x * 0.07) * 0.08;
    const edge = Math.min(x - minX, maxX - x, maxZ - z);
    const v = mottle * (0.84 + 0.16 * Math.min(1, edge / 1.1));
    fc[i * 3] = v;
    fc[i * 3 + 1] = v;
    fc[i * 3 + 2] = v * 0.98;
  }
  field.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const fieldMat = new THREE.MeshStandardMaterial({
    color: '#b2ab9f',
    vertexColors: true,
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  g.add(mesh(field, widenGrain(applySurface(fieldMat, 'stone'), 4.6), { castShadow: false }));

  // ── Phiến đá mài sáng màu (mạch vữa sẫm lộ giữa các phiến) ──
  const slabs: Sheet = { pos: [], col: [] };
  const groutMat = new THREE.MeshStandardMaterial({ color: '#58534a', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const area = (x0: number, x1: number, z0: number, z1: number, sw: number, sd: number, tone = 1, stagger = true) => {
    pave(slabs, ctx.rng, x0, x1, z0, z1, sw, sd, tone, stagger);
    g.add(mesh(geo.ground(x1 - x0, z1 - z0), groutMat, { x: (x0 + x1) / 2, y: GROUT_Y, z: (z0 + z1) / 2, castShadow: false }));
  };
  const [[wgx, wHalf], [egx, eHalf]] = P.gates;
  const walkW = wgx - wHalf - 0.5;
  const walkE = egx + eHalf + 0.5;
  const walkZ = maxZ - 2.4;
  // Thần đạo từ mép Nam thẳng tới cửa chính, viền đá sẫm hai bên.
  area(-AXIS, AXIS, minZ, maxZ, 2, 1.3);
  area(-AXIS - BAND, -AXIS, minZ, maxZ, BAND, 2.6, 0.72, false);
  area(AXIS, AXIS + BAND, minZ, maxZ, BAND, 2.6, 0.72, false);
  // Lối ngang dọc mép Nam: đón hai đường lên + hai nghi môn, dẫn vào thần đạo; viền sẫm phía Bắc.
  area(walkW, -AXIS - BAND, walkZ, maxZ, 1.6, 1.2);
  area(AXIS + BAND, walkE, walkZ, maxZ, 1.6, 1.2);
  area(walkW, -AXIS - BAND, walkZ - BAND, walkZ, 2.4, BAND, 0.72);
  area(AXIS + BAND, walkE, walkZ - BAND, walkZ, 2.4, BAND, 0.72);
  // Nền lát dưới hai nghi môn (nối liền lối ngang).
  for (const [gx, half] of P.gates) area(gx - half - 0.5, gx + half + 0.5, maxZ, P.gateZ + 1.1, 1.45, 1.35);
  const slabMat = new THREE.MeshStandardMaterial({
    color: '#d0c8b9',
    vertexColors: true,
    roughness: 0.74,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  g.add(sheetMesh(slabs, applySurface(slabMat, 'carved')));

  // ── Bó vỉa thấp (mép Bắc giáp nền điện để trống; mép Nam chừa lối vào hai nghi môn + lối Tây) ──
  const curb = dressed('#9e978a');
  const CW = 0.3;
  const CH = 0.14;
  const southCurb = (x0: number, x1: number) => g.add(mesh(geo.box(x1 - x0, CH, CW), curb, { x: (x0 + x1) / 2, y: CH / 2, z: maxZ + CW / 2 }));
  southCurb(minX - CW, walkW);
  southCurb(WEST_LANE_X + WEST_LANE_HALF + 0.4, egx - eHalf - 0.5);
  southCurb(walkE, maxX + CW);
  for (const x of [minX - CW / 2, maxX + CW / 2]) g.add(mesh(geo.box(CW, CH, maxZ - minZ + CW), curb, { x, y: CH / 2, z: (minZ + maxZ + CW) / 2 }));
  addStatic(ctx, g);
}

// ───────────────────────── Đèn đá lớn ─────────────────────────

/** Đèn đá lớn (~4 m): bệ hai cấp, đài sen, thân bát giác, bầu đèn bốn ô sáng ấm nhấp nháy, mái cong vểnh bốn góc. */
function grandLantern(ctx: TempleCtx, x: number, z: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const s = dressed(C.stone);
  const sd = dressed(C.stoneDark);
  const oct = Math.PI / 8;
  g.add(mesh(geo.box(1.36, 0.22, 1.36), sd, { y: 0.11 }));
  g.add(mesh(geo.box(1.06, 0.2, 1.06), s, { y: 0.32 }));
  g.add(mesh(geo.cyl(0.46, 0.52, 0.2, 8), sd, { y: 0.52, ry: oct }));
  // Đài sen: chén đá loe + tám cánh sen nổi quanh chân thân đèn.
  g.add(mesh(geo.lathe([[0.3, 0], [0.44, 0.04], [0.42, 0.1], [0.26, 0.16], [0.2, 0.18]], 16), s, { y: 0.62 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(geo.sphere(1, 10, 8), s, { x: Math.sin(a) * 0.38, y: 0.7, z: Math.cos(a) * 0.38, ry: a, scale: [0.13, 0.09, 0.06] }));
  }
  g.add(mesh(geo.cyl(0.19, 0.23, 1.24, 8), s, { y: 1.34, ry: oct }));
  g.add(mesh(geo.cyl(0.25, 0.25, 0.08, 8), sd, { y: 1.34, ry: oct }));
  g.add(mesh(geo.cyl(0.52, 0.22, 0.16, 8), s, { y: 2.04, ry: oct }));
  g.add(mesh(geo.cyl(0.6, 0.6, 0.14, 8), sd, { y: 2.19, ry: oct }));
  // Bầu đèn: lõi sáng ấm sau bốn ô cửa có song đá.
  const glow = new THREE.MeshStandardMaterial({ color: '#ffe2a6', emissive: '#ffb04a', emissiveIntensity: 1.7, roughness: 0.9 });
  ctx.flicker.push({ mat: glow, base: 1.7, speed: 1.5 + ctx.rng.next(), phase: ctx.rng.next() * 10 });
  g.add(mesh(geo.box(0.56, 0.64, 0.56), glow, { y: 2.66, castShadow: false }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(geo.box(0.15, 0.78, 0.15), s, { x: sx * 0.3, y: 2.65, z: sz * 0.3 }));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const ox = Math.sin(a) * 0.3;
    const oz = Math.cos(a) * 0.3;
    g.add(mesh(geo.box(0.05, 0.6, 0.05), sd, { x: ox, y: 2.66, z: oz }));
    for (const y of [2.31, 3.0]) g.add(mesh(geo.box(0.62, 0.07, 0.1), s, { x: ox, y, z: oz, ry: a }));
  }
  g.add(mesh(geo.box(0.86, 0.08, 0.86), sd, { y: 3.08 }));
  // Mái đá: chóp bốn mặt lõm (tiện 4 cạnh, đổ bóng phẳng từng mặt), góc vểnh, búp sen trên đỉnh.
  const roof = geo.lathe([[0, -0.02], [0.98, -0.02], [0.98, 0.02], [0.72, 0.12], [0.46, 0.25], [0.24, 0.4], [0.1, 0.52], [0, 0.56]], 4).toNonIndexed();
  roof.computeVertexNormals();
  g.add(mesh(roof, s, { y: 3.12, ry: Math.PI / 4 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(geo.cone(0.05, 0.24, 6), s, { x: sx * 0.74, y: 3.2, z: sz * 0.74, rx: sz * 0.7, rz: -sx * 0.7 }));
  g.add(mesh(geo.sphere(0.11, 12, 10), sd, { y: 3.74 }));
  g.add(mesh(geo.cone(0.085, 0.26, 10), s, { y: 3.95 }));
  addStatic(ctx, g);
}

// ───────────────────────── Nghê đá ─────────────────────────

/** Khối bầu dục (cầu bán kính 1 co giãn) — dựng hình tượng nghê. */
function blob(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, rz = 0): void {
  g.add(mesh(geo.sphere(1, 20, 14), m, { x, y, z, rx, rz, scale: [sx, sy, sz] }));
}

/** Lọn bờm phủ gáy, lưng và ngực nghê: [x, y, z, bán kính]. */
const MANE: readonly (readonly [number, number, number, number])[] = [
  [-0.16, 0.9, -0.2, 0.085],
  [0, 0.95, -0.25, 0.085],
  [0.16, 0.9, -0.2, 0.085],
  [-0.1, 1.1, -0.18, 0.08],
  [0.1, 1.1, -0.18, 0.08],
  [0, 0.78, -0.3, 0.08],
  [-0.2, 0.72, -0.22, 0.075],
  [0.2, 0.72, -0.22, 0.075],
  [-0.09, 0.88, 0.37, 0.06],
  [0.09, 0.88, 0.37, 0.06],
  [0, 0.76, 0.38, 0.06],
];

/**
 * Nghê đá ngồi chầu trên bệ (gốc = tâm chân bệ, mặt hướng +Z): bệ chạm ô hộc, thân ngồi chân trước thẳng, đầu to mắt
 * lồi miệng há, bờm xoăn từng lọn, đuôi xoè như ngọn lửa; `withBall` = một chân trước vờn quả cầu.
 */
function guardianLion(withBall: boolean): THREE.Group {
  const root = new THREE.Group();
  const st = dressed('#c4beb2');
  const sd = dressed(C.stoneDark);
  const dark = dressed('#6f695f');
  // ── Bệ ──
  root.add(mesh(geo.box(1.36, 0.16, 1.5), sd, { y: 0.08 }));
  root.add(mesh(geo.box(1.12, 0.74, 1.26), sd, { y: 0.53 }));
  root.add(mesh(geo.box(0.84, 0.44, 0.03), st, { y: 0.53, z: 0.64 }));
  for (const s of [-1, 1]) root.add(mesh(geo.box(0.03, 0.44, 0.96), st, { x: s * 0.57, y: 0.53 }));
  root.add(mesh(geo.box(1.3, 0.14, 1.44), sd, { y: 0.97 }));
  root.add(mesh(geo.box(1.18, 0.06, 1.32), st, { y: 1.07 }));

  // ── Tượng (gốc = mặt bệ) ──
  const g = new THREE.Group();
  g.position.y = 1.1;
  root.add(g);
  g.add(mesh(geo.box(0.86, 0.1, 1.06), st, { y: 0.05 }));
  for (const s of [-1, 1]) {
    blob(g, st, s * 0.23, 0.33, -0.2, 0.24, 0.27, 0.36);
    blob(g, st, s * 0.3, 0.13, 0.08, 0.1, 0.065, 0.17);
  }
  blob(g, st, 0, 0.62, -0.06, 0.3, 0.47, 0.31, 0.42);
  blob(g, st, 0, 0.8, 0.15, 0.27, 0.3, 0.24);
  // Chân trước thẳng (chân phía trong đặt lên quả cầu nếu có).
  for (const s of [-1, 1]) {
    const footY = withBall && s < 0 ? 0.33 : 0.09;
    const leg = 0.76 - footY;
    g.add(mesh(geo.capsule(0.085, leg - 0.17, 4, 10), st, { x: s * 0.17, y: footY + leg / 2, z: 0.29 }));
    blob(g, st, s * 0.17, footY, 0.35, 0.12, 0.075, 0.15);
    for (const t of [-1, 0, 1]) g.add(mesh(geo.sphere(0.036, 8, 6), st, { x: s * 0.17 + t * 0.065, y: footY - 0.01, z: 0.47 }));
  }
  if (withBall) {
    g.add(mesh(geo.sphere(0.17, 18, 14), st, { x: -0.17, y: 0.17, z: 0.37 }));
    g.add(mesh(geo.torus(0.172, 0.02, 6, 28), sd, { x: -0.17, y: 0.17, z: 0.37, rx: 0.4, ry: 0.7 }));
  }
  // Đầu: bờm cổ, sọ, mõm, mũi, miệng há có nanh, mắt lồi, mày, tai.
  blob(g, st, 0, 1.0, 0.02, 0.33, 0.31, 0.3);
  blob(g, st, 0, 1.23, 0.17, 0.27, 0.25, 0.25);
  blob(g, st, 0, 1.15, 0.39, 0.165, 0.11, 0.13);
  blob(g, st, 0, 1.22, 0.5, 0.075, 0.05, 0.05);
  blob(g, dark, 0, 1.075, 0.43, 0.1, 0.035, 0.06);
  blob(g, st, 0, 1.03, 0.38, 0.13, 0.045, 0.1);
  for (const s of [-1, 1]) {
    blob(g, st, s * 0.105, 1.31, 0.38, 0.062, 0.056, 0.05);
    blob(g, dark, s * 0.11, 1.312, 0.425, 0.026, 0.026, 0.016);
    blob(g, st, s * 0.11, 1.375, 0.37, 0.09, 0.03, 0.045, 0, -s * 0.25);
    blob(g, st, s * 0.25, 1.41, 0.1, 0.075, 0.05, 0.1, 0.3, s * 0.5);
    g.add(mesh(geo.cone(0.022, 0.07, 6), st, { x: s * 0.08, y: 1.08, z: 0.5, rx: Math.PI }));
  }
  // Bờm xoăn: hai vòng lọn quanh mặt (chừa dưới cằm) + lọn phủ gáy, lưng, ngực.
  for (let ring = 0; ring < 2; ring++) {
    const n = 11 + ring * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 1.5) < 0.5) continue;
      g.add(mesh(geo.ico(0.072 - ring * 0.006, 1), st, { x: Math.cos(a) * (0.29 + ring * 0.07), y: 1.23 + Math.sin(a) * (0.27 + ring * 0.07), z: 0.1 - ring * 0.1, ry: a }));
    }
  }
  for (const [x, y, z, r] of MANE) g.add(mesh(geo.ico(r, 1), st, { x, y, z }));
  // Đuôi xoè như ngọn lửa dựng sau lưng.
  for (const [y, z, r] of [
    [0.36, -0.5, 0.1],
    [0.52, -0.54, 0.095],
    [0.68, -0.5, 0.085],
    [0.82, -0.42, 0.07],
  ] as const) {
    g.add(mesh(geo.ico(r, 1), st, { y, z }));
  }
  g.add(mesh(geo.torus(0.08, 0.03, 6, 14, Math.PI * 1.5), st, { y: 0.93, z: -0.36, ry: Math.PI / 2 }));
  return root;
}

// ───────────────────────── Cột phướn ─────────────────────────

interface BannerSpec {
  text: string;
  bg: string;
  fg: string;
}

/** Phướn theo thứ tự cột từ Tây sang Đông (x tăng dần): màu đối xứng qua thần đạo, mỗi phướn một danh hiệu. */
const BANNERS: BannerSpec[] = [
  { text: 'Nam Mô Dược Sư Lưu Ly Quang Phật', bg: '#2f5c9a', fg: '#ffe9b0' },
  { text: 'Nam Mô Quán Thế Âm Bồ Tát', bg: '#b3302a', fg: '#ffd166' },
  { text: 'Nam Mô A Di Đà Phật', bg: '#e0a52e', fg: '#7a1d12' },
  { text: 'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật', bg: '#e0a52e', fg: '#7a1d12' },
  { text: 'Nam Mô Địa Tạng Vương Bồ Tát', bg: '#b3302a', fg: '#ffd166' },
  { text: 'Nam Mô Đại Thế Chí Bồ Tát', bg: '#2f5c9a', fg: '#ffe9b0' },
];

const POLE_H = 9.4;
const BANNER_W = 0.9;
const BANNER_L = 6.2;
/** Mép trên tấm phướn (m) và khoảng treo ra trước cột (phía Nam — mặt vải quay về hướng người đi lên). */
const BANNER_TOP = 8.5;
const BANNER_OUT = 0.46;

/** Vải phướn: thân màu chính viền vàng, đầu phướn có pháp luân, danh hiệu viết dọc, đuôi năm dải ngũ sắc. */
function bannerTexture(spec: BannerSpec): THREE.CanvasTexture {
  const cw = 160;
  const ch = Math.round((cw * BANNER_L) / BANNER_W);
  return kit.canvasTexture(cw, ch, (c, W, H) => {
    const body = H - W * 1.25;
    c.fillStyle = spec.bg;
    c.fillRect(0, 0, W, body);
    // Đầu phướn sẫm màu, viền vàng, pháp luân tám nan.
    c.fillStyle = 'rgba(0, 0, 0, 0.22)';
    c.fillRect(0, 0, W, W * 0.95);
    c.strokeStyle = C.gold;
    c.lineWidth = 7;
    c.strokeRect(9, 9, W - 18, body - 18);
    c.beginPath();
    c.moveTo(9, W * 0.95);
    c.lineTo(W - 9, W * 0.95);
    c.stroke();
    const r = W * 0.26;
    const cy = W * 0.48;
    c.lineWidth = 5;
    for (const rr of [r, r * 0.28]) {
      c.beginPath();
      c.arc(W / 2, cy, rr, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(W / 2 + Math.cos(a) * r * 0.28, cy + Math.sin(a) * r * 0.28);
      c.lineTo(W / 2 + Math.cos(a) * r, cy + Math.sin(a) * r);
      c.stroke();
    }
    // Danh hiệu viết dọc, mỗi chữ một dòng, cỡ chữ vừa bề ngang.
    const words = spec.text.split(' ');
    const top = W * 1.1;
    const lineH = (body - top - 24) / words.length;
    let size = Math.min(lineH * 0.8, W * 0.36);
    c.font = `800 ${size}px ${kit.FONT_TITLE}`;
    const widest = Math.max(...words.map((wd) => c.measureText(wd).width));
    if (widest > W - 44) {
      size *= (W - 44) / widest;
      c.font = `800 ${size}px ${kit.FONT_TITLE}`;
    }
    c.fillStyle = spec.fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    words.forEach((wd, i) => c.fillText(wd, W / 2, top + (i + 0.5) * lineH));
    // Đuôi ngũ sắc: năm dải mũi nhọn, khe giữa các dải để trong suốt (cắt alpha).
    const tails = ['#2f5c9a', '#e2b236', '#b3302a', '#f1ece0', '#d9772b'];
    const sw = W / tails.length;
    tails.forEach((col, i) => {
      const x0 = i * sw + 2;
      const x1 = (i + 1) * sw - 2;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(x0, body - 4);
      c.lineTo(x1, body - 4);
      c.lineTo(x1, H - sw * 0.9);
      c.lineTo((x0 + x1) / 2, H - 2);
      c.lineTo(x0, H - sw * 0.9);
      c.closePath();
      c.fill();
    });
    c.fillStyle = C.gold;
    c.fillRect(0, body - 8, W, 8);
  });
}

/** Lưới vải phướn: số đỉnh theo bề ngang × theo chiều dài (PlaneGeometry 2 × 22 ô). */
const CLOTH_COLS = 3;
const CLOTH_ROWS = 23;

/**
 * Pháp tuyến lưới vải từ hiệu hai đỉnh kề (ngang × dọc) — thay `computeVertexNormals` (tạo Vector3 mới mỗi lần gọi)
 * để hoạt ảnh không cấp phát gì mỗi khung hình. Hàng 0 ở mép trên, chỉ số đỉnh = hàng × CLOTH_COLS + cột.
 */
function clothNormals(p: THREE.BufferAttribute, n: THREE.BufferAttribute): void {
  for (let r = 0; r < CLOTH_ROWS; r++) {
    const up = Math.max(r - 1, 0) * CLOTH_COLS;
    const down = Math.min(r + 1, CLOTH_ROWS - 1) * CLOTH_COLS;
    for (let c = 0; c < CLOTH_COLS; c++) {
      const right = r * CLOTH_COLS + Math.min(c + 1, CLOTH_COLS - 1);
      const left = r * CLOTH_COLS + Math.max(c - 1, 0);
      // Tiếp tuyến ngang (trái → phải) và dọc (dưới → trên); tích có hướng ra mặt trước (+Z khi vải phẳng).
      const ux = p.getX(right) - p.getX(left);
      const uy = p.getY(right) - p.getY(left);
      const uz = p.getZ(right) - p.getZ(left);
      const vx = p.getX(up + c) - p.getX(down + c);
      const vy = p.getY(up + c) - p.getY(down + c);
      const vz = p.getZ(up + c) - p.getZ(down + c);
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      n.setXYZ(r * CLOTH_COLS + c, nx / len, ny / len, nz / len);
    }
  }
  n.needsUpdate = true;
}

/**
 * Cột phướn: chân đá, cột sơn son đai vàng, búp sen thếp vàng trên đỉnh, tay đỡ + mũ phướn; tấm phướn dài lay gió
 * (đỉnh vải đứng yên, càng xuống chân càng gợn mạnh — dời đỉnh lưới trên CPU mỗi khung hình).
 */
function bannerPole(ctx: TempleCtx, x: number, z: number, spec: BannerSpec): void {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const gold = mat(C.gold, { metalness: 0.5, roughness: 0.4 });
  g.add(mesh(geo.box(0.74, 0.3, 0.74), dressed(C.stoneDark), { y: 0.15 }));
  g.add(mesh(geo.cyl(0.22, 0.27, 0.22, 12), dressed(C.stone), { y: 0.41 }));
  g.add(mesh(geo.cyl(0.085, 0.11, POLE_H, 12), mat(C.red), { y: 0.52 + POLE_H / 2 }));
  for (const y of [0.62, 3.4, 6.4, BANNER_TOP - 0.25, POLE_H + 0.5]) g.add(mesh(geo.cyl(0.118, 0.118, 0.07, 12), gold, { y }));
  g.add(mesh(geo.sphere(0.13, 12, 10), gold, { y: POLE_H + 0.62 }));
  g.add(mesh(geo.cone(0.09, 0.32, 10), gold, { y: POLE_H + 0.86 }));
  g.add(mesh(geo.box(0.07, 0.07, BANNER_OUT + 0.06), mat(C.redDark), { y: BANNER_TOP + 0.3, z: BANNER_OUT / 2 }));
  g.add(mesh(geo.cyl(0.024, 0.024, BANNER_W + 0.28, 8), gold, { y: BANNER_TOP + 0.02, z: BANNER_OUT, rz: Math.PI / 2 }));
  g.add(mesh(geo.box(BANNER_W + 0.16, 0.22, 0.1), mat(C.lacquer), { y: BANNER_TOP + 0.16, z: BANNER_OUT }));
  g.add(mesh(geo.box(BANNER_W + 0.22, 0.04, 0.13), gold, { y: BANNER_TOP + 0.28, z: BANNER_OUT }));
  for (const s of [-1, 1]) g.add(mesh(geo.cone(0.04, 0.18, 6), gold, { x: s * (BANNER_W / 2 + 0.12), y: BANNER_TOP - 0.04, z: BANNER_OUT, rx: Math.PI }));
  addStatic(ctx, g);

  // Tấm vải: lưới 2 × 22 ô, đỉnh lưới ở mép trên (y = 0) treo xuống.
  const clothMat = new THREE.MeshStandardMaterial({ map: bannerTexture(spec), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.9 });
  const cg = new THREE.PlaneGeometry(BANNER_W, BANNER_L, CLOTH_COLS - 1, CLOTH_ROWS - 1).translate(0, -BANNER_L / 2, 0);
  const cp = cg.getAttribute('position') as THREE.BufferAttribute;
  const cn = cg.getAttribute('normal') as THREE.BufferAttribute;
  const rest = Float32Array.from(cp.array as ArrayLike<number>);
  cg.computeBoundingSphere();
  cg.boundingSphere!.radius += 0.6;
  ctx.dynamics.add(mesh(cg, applySurface(clothMat, 'fabric'), { x, y: BANNER_TOP, z: z + BANNER_OUT }));
  const t0 = ctx.rng.next() * 10;
  ctx.updates.push((_dt, t) => {
    for (let i = 0; i < cp.count; i++) {
      const bx = rest[i * 3]!;
      const by = rest[i * 3 + 1]!;
      const s = -by / BANNER_L;
      const k = s * s;
      const wave = Math.sin(t * 1.3 + t0 - s * 3.4) * 0.3 + Math.sin(t * 2.6 + t0 * 1.7 - s * 7 + bx * 3) * 0.06;
      cp.setXYZ(i, bx + Math.sin(t * 0.8 + t0) * 0.12 * k, by + Math.abs(wave) * k * 0.05, wave * k);
    }
    cp.needsUpdate = true;
    clothNormals(cp, cn);
  });
}

// ───────────────────────── Nghi môn ─────────────────────────

/** Biển dùng chung cho hai nghi môn (mỗi chỗ đặt một bản clone — chung texture). */
interface GateSigns {
  title: THREE.Group;
  /** Biển phụ mặt Nam (đi lên nghe kinh) / mặt Bắc (quay về sân chùa). */
  south: THREE.Group;
  north: THREE.Group;
  couplets: readonly [THREE.Group, THREE.Group];
}

function gateSigns(): GateSigns {
  const sub = (text: string) => kit.signBoard(text, { width: 1.5, height: 0.34, bg: '#3a2418', border: C.gold, color: '#ffe3a3', depth: 0.04 });
  return {
    title: kit.signBoard('ĐẠI PHÁP ĐƯỜNG', { width: 3.3, height: 0.74, bg: C.lacquer, border: C.gold, color: C.goldBright, depth: 0.08 }),
    south: sub('↑ Nghe kinh'),
    north: sub('↑ Sân chùa'),
    couplets: [verticalBoard('Pháp Âm Vi Diệu', 0.34, 2.2, '#8a1f14', C.goldBright), verticalBoard('Tâm Tịnh Thân An', 0.34, 2.2, '#8a1f14', C.goldBright)],
  };
}

/** Nghi môn: hai cột son trên chân tảng, xà kép, biển "ĐẠI PHÁP ĐƯỜNG" hai mặt, mái ngói có ngọc, câu đối, đèn lồng. */
function ceremonialGate(ctx: TempleCtx, gx: number, half: number, signs: GateSigns): void {
  const z = P.gateZ;
  const span = half * 2;
  const g = new THREE.Group();
  g.position.set(gx, 0, z);
  const gold = mat(C.gold, { metalness: 0.5, roughness: 0.4 });
  // Hai cột (khớp collider 'gate_pillar' r 0,4) + câu đối mặt Nam.
  [-1, 1].forEach((s, i) => {
    g.add(mesh(geo.box(0.92, 0.12, 0.92), dressed(C.stoneDark), { x: s * half, y: 0.06 }));
    pillar(g, s * half, 0, 5, 0.3, C.red);
    const board = signs.couplets[i]!.clone();
    board.position.set(s * half, 2.45, 0.335);
    g.add(board);
  });
  // Xà dưới + xà trên (đầu xà bịt vàng), đấu đỡ mái, ô hộc hai bên biển.
  g.add(mesh(geo.box(span + 0.8, 0.26, 0.32), mat(C.redDark), { y: 3.86 }));
  for (const y of [3.72, 4.0]) g.add(mesh(geo.box(span + 0.84, 0.04, 0.34), gold, { y }));
  g.add(mesh(geo.box(span + 1.5, 0.32, 0.4), mat(C.redDark), { y: 5.06 }));
  g.add(mesh(geo.box(span + 1.54, 0.04, 0.42), gold, { y: 4.9 }));
  for (const s of [-1, 1]) {
    g.add(mesh(geo.box(0.06, 0.34, 0.42), gold, { x: s * (span / 2 + 0.75), y: 5.06 }));
    g.add(mesh(geo.box(0.42, 0.78, 0.12), mat(C.redDark), { x: s * (half - 0.51), y: 4.445 }));
    g.add(mesh(geo.cyl(0.12, 0.12, 0.14, 16), gold, { x: s * (half - 0.51), y: 4.445, rx: Math.PI / 2 }));
    g.add(mesh(geo.cyl(0.012, 0.012, 0.2, 6), gold, { x: s * 0.6, y: 3.62 }));
  }
  for (let k = 0; k < 5; k++) g.add(mesh(geo.box(0.24, 0.14, 0.34), mat(C.bracket), { x: -half + (k * span) / 4, y: 5.29 }));
  // Biển chính hai mặt + biển phụ treo dưới xà (mỗi mặt chỉ hướng đi tiếp).
  for (const dir of [1, -1]) {
    const ry = dir > 0 ? 0 : Math.PI;
    g.add(kit.place(signs.title.clone(), 0, 4.445, dir * 0.045, ry));
    g.add(kit.place((dir > 0 ? signs.south : signs.north).clone(), 0, 3.36, dir * 0.022, ry));
  }
  addStatic(ctx, g);
  for (const s of [-1, 1]) hangingLantern(ctx, gx + s * 1.3, 3.3, z);
  // Mái ngói (UV riêng của mái — không gộp tĩnh).
  const roof = vietRoof({ w: span + 1.2, d: 1.0, h: 0.95, overhang: 0.55, lift: 0.34, pearl: true });
  roof.position.set(gx, 5.36, z);
  ctx.dynamics.add(roof);
}

// ───────────────────────── Cây cảnh ─────────────────────────

const UP = new THREE.Vector3(0, 1, 0);

/** Đoạn thân/cành hình trụ nối hai điểm. */
function limb(g: THREE.Group, m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const c = mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 7), m);
  c.position.copy(a).addScaledVector(d, 0.5);
  c.quaternion.setFromUnitVectors(UP, d.normalize());
  g.add(c);
}

/** Chậu đá chữ nhật trồng tùng bonsai: thân uốn lượn, cành ngang mang tán lá dẹt từng tầng. */
function bonsai(ctx: TempleCtx, x: number, z: number, leaves: THREE.Material[]): THREE.Group {
  const r = ctx.rng;
  const p = new THREE.Group();
  p.position.set(x, 0, z);
  p.rotation.y = Math.PI / 2 + (r.next() < 0.5 ? 0 : Math.PI);
  const pot = dressed('#b1ab9f');
  p.add(mesh(geo.box(1.24, 0.1, 0.78), dressed(C.stoneDark), { y: 0.05 }));
  p.add(mesh(geo.box(1.14, 0.4, 0.68), pot, { y: 0.3 }));
  p.add(mesh(geo.box(1.26, 0.07, 0.8), pot, { y: 0.535 }));
  p.add(mesh(geo.box(1.06, 0.03, 0.6), mat('#3b2b1f', { surface: 'none', roughness: 1 }), { y: 0.56 }));
  const bark = mat('#6e5038');
  const v = (vx: number, vy: number, vz: number) => new THREE.Vector3(vx, vy, vz);
  const sway = (r.next() - 0.5) * 0.12;
  const trunk = [v(0.2, 0.56, 0), v(-0.04 + sway, 0.86, 0.06), v(0.18, 1.12, -0.04), v(0.02 - sway, 1.4, 0.02)];
  for (let i = 0; i < trunk.length - 1; i++) limb(p, bark, trunk[i]!, trunk[i + 1]!, 0.09 - i * 0.02, 0.07 - i * 0.02);
  const pads: [THREE.Vector3, number, number][] = [
    [v(-0.46, 0.98, 0.1), 0.34, 1],
    [v(0.5, 1.18, -0.06), 0.32, 2],
    [v(-0.24, 1.3, -0.18), 0.24, 2],
    [v(0.04, 1.55, 0.02), 0.3, 3],
  ];
  for (const [c, rad, from] of pads) {
    limb(p, bark, trunk[from]!, c, 0.035, 0.02);
    p.add(mesh(foliageGeometry(r, rad, 1.6, 0.42), r.pick(leaves), { x: c.x, y: c.y + 0.04, z: c.z, ry: r.next() * 6 }));
  }
  return p;
}

/** Bờ cây xén thấp ngoài bó vỉa Đông/Tây + sáu chậu bonsai trên mép sân (không va chạm — đặt chỗ ít người đi). */
function buildGreenery(ctx: TempleCtx): void {
  const { minX, maxX, minZ, maxZ } = PLAZA;
  const g = new THREE.Group();
  // ── Bờ cây xén: lõi xanh sẫm phủ tấm lá thật, thấp hơn đầu gối (đi qua không thấy kỳ) ──
  const hedge = ['#4f7f3d', '#47763a', '#5a8a45'].map((c) => leafMaterial(c, ctx.wind, 8));
  const core = mat('#3c6532', { roughness: 0.95 });
  const segs = 4;
  const gap = 0.45;
  const z0 = maxZ - 0.35;
  const segLen = (z0 - (minZ + 0.35) - gap * (segs - 1)) / segs;
  const n = Math.round(segLen / 0.42);
  for (const x of [minX - 1, maxX + 1]) {
    for (let i = 0; i < segs; i++) {
      const zc = z0 - i * (segLen + gap) - segLen / 2;
      g.add(mesh(geo.box(0.56, 0.34, segLen - 0.12), core, { x, y: 0.17, z: zc }));
      for (let k = 0; k < n; k++) {
        const fz = zc - segLen / 2 + 0.24 + (k / (n - 1)) * (segLen - 0.48);
        const leaf = ctx.rng.pick(hedge);
        g.add(mesh(foliageGeometry(ctx.rng, 0.32, 1.4, 0.8), leaf, { x: x + (ctx.rng.next() - 0.5) * 0.08, y: 0.3, z: fz, ry: ctx.rng.next() * 6, scale: [0.95, 0.72, 1.1] }));
      }
    }
  }
  // ── Chậu bonsai: ba chậu mỗi bên, sát bó vỉa ──
  const pine = ['#41693a', '#4a7340'].map((c) => leafMaterial(c, ctx.wind, 8));
  for (const sx of [-1, 1]) for (const z of [maxZ - 1.5, (minZ + maxZ) / 2, minZ + 1.6]) g.add(bonsai(ctx, sx * (maxX - 1.6), z, pine));
  addStatic(ctx, g);
}

// ───────────────────────── Dựng sân ─────────────────────────

/**
 * Dựng sân trên Đại Pháp Đường: mặt sân + phiến lát + bó vỉa, đôi đèn đá, đôi nghê, sáu cột phướn, hai nghi môn, cây
 * cảnh. Phần tĩnh vào `ctx.statics` (gộp mesh), phướn lay gió + mái ngói + đèn lồng vào `ctx.dynamics`.
 */
export function buildPhapDuongYard(ctx: TempleCtx): void {
  buildPaving(ctx);
  // Đồ có va chạm: vị trí đọc từ collider (chỉ phần sân trên — phía Bắc hàng nghi môn).
  const yard = (tag: string) => TEMPLE_MAP.colliders.filter((c) => c.tag === tag && c.z < P.gateZ);
  for (const c of yard('stone_lantern')) grandLantern(ctx, c.x, c.z);
  for (const c of yard('nghe')) addStatic(ctx, kit.place(guardianLion(c.x > 0), c.x, 0, c.z, c.x < 0 ? 0.18 : -0.18));
  yard('banner_pole')
    .sort((a, b) => a.x - b.x)
    .forEach((c, i) => bannerPole(ctx, c.x, c.z, BANNERS[i % BANNERS.length]!));
  const signs = gateSigns();
  for (const [gx, half] of P.gates) ceremonialGate(ctx, gx, half, signs);
  buildGreenery(ctx);
}
