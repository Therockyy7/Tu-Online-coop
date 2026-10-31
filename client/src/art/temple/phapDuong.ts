// Đại Pháp Đường: điện nghe kinh lớn nhất, tráng lệ nhất chùa (phía Bắc Chánh Điện, z −62 … −94). Nền đá thấp; hiên
// mười cột son cao 11 m đỡ mái, bẩy hiên, trần ô cờ; mặt tiền ván sơn son ba cửa (cánh mở áp tường trong, đinh vàng),
// song cửa, hoành phi "ĐẠI PHÁP ĐƯỜNG", câu đối trên hai cột giữa. Trong điện: sàn đá mài, bốn dãy cột son khổng lồ
// (rồng vàng cuốn bốn cột gần tượng), xà lớn chỉ vàng có diềm chạm thủng, trần ô cờ son thếp sen vàng, thảm đỏ viền vàng
// giữa lối dẫn tới bệ tượng, 40 bồ đoàn trên chiếu cói đúng chỗ các trạm nghe kinh, đèn chùm hoa sen, đèn lồng, phướn;
// nắng xiên qua song cửa cao phía Đông và song cửa mặt tiền. Mái ba tầng ở phapDuongRoof.ts, khu thờ ở phapDuongAltar.ts.
// Bố cục đọc từ PHAP_DUONG (shared) — tường, cột, bệ trùng khớp va chạm; bồ đoàn trùng các trạm ngồi nghe kinh.
import * as THREE from 'three';
import { PHAP_DUONG } from '@shared/index';
import { kit } from '../kit';
import { addStatic, hangingLantern, verticalBoard, type TempleCtx } from './ctx';
import { buildPhapDuongAltar } from './phapDuongAltar';
import {
  PD,
  cofferTexture,
  coilingDragon,
  fretworkTexture,
  gilt,
  hangingBanners,
  lotusChandelier,
  patchTexture,
  radialTexture,
  rod,
  scatterGeometry,
  shaftTexture,
} from './phapDuongDecor';
import { EAVE_Y, buildPhapDuongRoof, repPlane } from './phapDuongRoof';

const { geo, mat, mesh } = kit;
const P = PHAP_DUONG;
const IN_W = P.xWest + P.wall / 2;
const IN_E = P.xEast - P.wall / 2;
const IN_S = P.zSouth - P.wall / 2;
const IN_N = P.zNorth + P.wall / 2;
const OUT_W = P.xWest - P.wall / 2;
const OUT_E = P.xEast + P.wall / 2;
const OUT_S = P.zSouth + P.wall / 2;
const OUT_N = P.zNorth - P.wall / 2;
const MID_Z = (P.zSouth + P.zNorth) / 2;
/** Mặt sàn trong điện (đỉnh nền đá), trùng sàn Điện Tăng Đoàn. */
const FLOOR_Y = 0.08;
const CEIL_Y = P.ceilingY;
/** Đỉnh tường phía ngoài (lọt dưới mặt mái tầng dưới) và các mốc chia tường: chân gỗ, bậu cửa sổ cao, diềm trên. */
const WALL_TOP = 12.7;
const DADO = 1.3;
const SILL = 8.2;
const FRIEZE = 11.6;
/** Cửa sổ cao (hông, hậu, trên mặt tiền) và cửa sổ thấp giữa các cửa ra vào: tâm y, cao. */
const HIGH = { y: 9.8, h: 2.4 };
const LOW = { y: 4.4, h: 3.6 };
/** Đáy xà ngang (theo hàng cột) và xà dọc (trên các dãy cột) khác cao độ để chỗ giao nhau không trùng mặt. */
const BEAM_X_BOTTOM = 11.3;
const BEAM_Z_BOTTOM = 11.45;
/** Giữa các gian (giữa hai hàng cột liên tiếp): treo đèn chùm, đèn lồng, phướn. */
const BAY_ZS = [-68.5, -73.5, -78.5, -83.5];

export interface PhapDuongHandles {
  roof: THREE.Group;
}

/** Một bức tường theo bố cục chung: chạy dọc trục `along`, tâm tường ở `c` trên trục kia, `inward` = chiều vào trong điện. */
interface WallLine {
  along: 'x' | 'z';
  c: number;
  inward: 1 | -1;
}
const SOUTH: WallLine = { along: 'x', c: P.zSouth, inward: -1 };
const NORTH: WallLine = { along: 'x', c: P.zNorth, inward: 1 };
const EAST: WallLine = { along: 'z', c: P.xEast, inward: -1 };
const WEST: WallLine = { along: 'z', c: P.xWest, inward: 1 };

function addBox(g: THREE.Object3D, w: number, h: number, d: number, m: string | THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const o = mesh(geo.box(w, h, d), typeof m === 'string' ? mat(m) : m, { x, y, z, castShadow: cast });
  g.add(o);
  return o;
}

/** Hộp nằm trên một bức tường: dài `len` dọc tường tại `pos`, dày `depth` theo pháp tuyến (đè tâm tường). */
function wallBox(g: THREE.Object3D, wl: WallLine, pos: number, y: number, len: number, h: number, depth: number, m: string | THREE.Material): void {
  if (wl.along === 'x') addBox(g, len, h, depth, m, pos, y, wl.c);
  else addBox(g, depth, h, len, m, wl.c, y, pos);
}

/** Đoạn tường từ `y0` lên `y1`: chân gỗ sẫm, thân (trát vàng đất hoặc ván sơn son), diềm gỗ son sẫm trên cùng. */
function wallBlock(g: THREE.Group, wl: WallLine, pos: number, len: number, y0: number, y1: number, body: string): void {
  const layers: [number, number, string][] = [
    [0, DADO, PD.dado],
    [DADO, FRIEZE, body],
    [FRIEZE, WALL_TOP, PD.lacquerDark],
  ];
  for (const [a, b, color] of layers) {
    const lo = Math.max(a, y0);
    const hi = Math.min(b, y1);
    if (hi > lo + 0.001) wallBox(g, wl, pos, (lo + hi) / 2, len, hi - lo, P.wall, color);
  }
}

/** Song cửa gỗ (một ô lặp): khung ô vuông chia bốn, hình thoi giữa mỗi ô con. Nền sáng = trời bên ngoài, nền tối = nhìn vào. */
function latticeTexture(bg: string, bar: string): THREE.CanvasTexture {
  const tex = kit.canvasTexture(128, 128, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = bar;
    for (const [x, bw] of [
      [0, 6],
      [w - 6, 6],
      [w / 2 - 4, 8],
    ] as const) {
      c.fillRect(x, 0, bw, h);
      c.fillRect(0, x, w, bw);
    }
    c.strokeStyle = bar;
    c.lineWidth = 5;
    for (const cx of [w / 4, (3 * w) / 4]) {
      for (const cy of [h / 4, (3 * h) / 4]) {
        c.beginPath();
        c.moveTo(cx, cy - 17);
        c.lineTo(cx + 17, cy);
        c.lineTo(cx, cy + 17);
        c.lineTo(cx - 17, cy);
        c.closePath();
        c.stroke();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Cửa sổ song gỗ xuyên tường: khung gỗ lộ hai mặt, mặt trong sáng (`lit`), mặt ngoài tối (`dark`). */
function wallWindow(g: THREE.Group, wl: WallLine, pos: number, y: number, w: number, h: number, lit: THREE.Material, dark: THREE.Material, frame: THREE.Material): void {
  const t = P.wall + 0.14;
  wallBox(g, wl, pos, y + h / 2 + 0.07, w + 0.3, 0.14, t, frame);
  wallBox(g, wl, pos, y - h / 2 - 0.07, w + 0.3, 0.14, t, frame);
  for (const s of [-1, 1]) wallBox(g, wl, pos + s * (w / 2 + 0.075), y, 0.15, h, t, frame);
  const pane = repPlane(w, h, w / 0.62, h / 0.62);
  for (const [side, m] of [
    [wl.inward, lit],
    [-wl.inward, dark],
  ] as const) {
    const off = wl.c + side * (P.wall / 2 + 0.004);
    const ry = wl.along === 'x' ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(mesh(pane, m, wl.along === 'x' ? { x: pos, y, z: off, ry, castShadow: false } : { x: off, y, z: pos, ry, castShadow: false }));
  }
}

/** Vệt nắng: hai mặt phẳng cộng màu bắt chéo, từ ô cửa `from` theo hướng tia nắng `dir`, dài `len`. */
function lightShaft(parent: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, m: THREE.Material): void {
  const g = new THREE.PlaneGeometry(width, len);
  g.translate(0, -len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  for (const spin of [0, Math.PI / 2]) {
    const s = new THREE.Mesh(g, m);
    s.position.copy(from);
    s.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
    s.renderOrder = 2;
    parent.add(s);
  }
}

/** Tấm trần ô cờ (mặt nhìn xuống) phủ khung `x0..x1 × z0..z1` ở cao độ `y`; mỗi ô ~1,7 m, vừa khít khung. */
function cofferPanel(g: THREE.Group, x0: number, x1: number, z0: number, z1: number, y: number, m: THREE.Material): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const geom = repPlane(w, d, Math.max(1, Math.round(w / 1.7)), Math.max(1, Math.round(d / 1.7))).rotateX(Math.PI / 2);
  g.add(mesh(geom, m, { x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, castShadow: false }));
}

/**
 * Dựng toàn bộ Đại Pháp Đường (trừ sân trước): nền, hiên, tường, cửa, trần, cột, xà, nội thất, ánh sáng, khu thờ (gọi
 * buildPhapDuongAltar) và mái ba tầng. Đồ tĩnh gộp mesh qua `addStatic`; đồ sáng/động + mái vào `ctx.dynamics`.
 */
export function buildPhapDuong(ctx: TempleCtx, sunDir: THREE.Vector3): PhapDuongHandles {
  const stat = new THREE.Group();
  const dyn = new THREE.Group();
  const radial = radialTexture();
  const gold = gilt();
  const goldBright = gilt(true);
  const frame = mat(PD.frame);
  const lacquer = mat(PD.lacquer, { roughness: 0.5 });
  const stone = mat(PD.stoneDark);
  const latticeLit = new THREE.MeshBasicMaterial({ map: latticeTexture('#fff0d2', '#3a2418') });
  const latticeDark = new THREE.MeshStandardMaterial({ map: latticeTexture('#1c100a', '#7a4a2e'), roughness: 0.85 });

  // ── Nền đá dưới điện + hiên, sàn đá mài trong điện (mạch lát), thảm đỏ lối giữa, thảm ngang trước bệ ──
  // Đỉnh nền 0,064: thấp hơn sàn trong điện 16 mm để hai mặt không giành nhau độ sâu (nhấp nháy khi nhìn từ xa qua cửa).
  addBox(stat, 48, 0.196, 38, PD.stone, P.x, -0.034, -76.6);
  addBox(stat, 43.8, 0.05, 31.8, mat(PD.stoneLight, { roughness: 0.42 }), P.x, FLOOR_Y - 0.025, MID_Z);
  const joint = mat('#8f877a', { roughness: 0.6 });
  for (let x = -20; x <= 20; x += 2) addBox(stat, 0.03, 0.008, IN_S - IN_N, joint, x, FLOOR_Y + 0.002, MID_Z, false);
  for (let z = -63.5; z > IN_N; z -= 2.5) addBox(stat, IN_E - IN_W, 0.008, 0.03, joint, P.x, FLOOR_Y, z, false);
  const carpet = mat(PD.fabricRed);
  const trim = mat(PD.gold, { roughness: 0.55, metalness: 0.3 });
  const aisleS = P.porchZ - 0.3;
  const aisleN = -82.9;
  const aisleZ = (aisleS + aisleN) / 2;
  addBox(stat, 2.4, 0.03, aisleS - aisleN, carpet, P.x, 0.085, aisleZ, false);
  for (const s of [-1, 1]) addBox(stat, 0.1, 0.03, aisleS - aisleN, trim, P.x + s * 1.1, 0.089, aisleZ, false);
  addBox(stat, 2.4, 0.03, 0.1, trim, P.x, 0.089, aisleS - 0.05, false);
  addBox(stat, 8.4, 0.03, 2, carpet, P.x, 0.085, aisleN - 1, false);
  for (const dz of [0.05, 1.95]) addBox(stat, 8.4, 0.03, 0.1, trim, P.x, 0.089, aisleN - dz, false);
  for (const s of [-1, 1]) addBox(stat, 0.1, 0.03, 1.8, trim, P.x + s * 4.15, 0.089, aisleN - 1, false);

  // ── 40 bồ đoàn trên chiếu cói, đúng vị trí các trạm nghe kinh (lưới cột × hàng) ──
  const straw = mat(PD.straw);
  const fabrics = [mat(PD.fabricSaffron, { roughness: 0.9 }), mat(PD.fabricRed, { roughness: 0.9 })];
  const pouf = geo.lathe(
    [
      [0, 0],
      [0.3, 0],
      [0.36, 0.035],
      [0.385, 0.09],
      [0.35, 0.145],
      [0.24, 0.18],
      [0, 0.19],
    ],
    20,
  );
  P.cushionZs.forEach((z, row) => {
    P.cushionXs.forEach((x, col) => {
      addBox(stat, 0.92, 0.024, 0.92, straw, x, FLOOR_Y + 0.01, z, false);
      stat.add(mesh(pouf, fabrics[(row + col) % 2]!, { x, y: FLOOR_Y + 0.022, z }));
    });
  });

  // ── Tường: hông Đông/Tây chạy suốt chiều sâu; tường Nam (ván sơn son, ba cửa) và tường Bắc nằm giữa hai tường hông ──
  for (const wl of [EAST, WEST]) wallBlock(stat, wl, MID_Z, OUT_S - OUT_N, 0, WALL_TOP, PD.plaster);
  wallBlock(stat, NORTH, P.x, IN_E - IN_W, 0, WALL_TOP, PD.plaster);
  let from: number = IN_W;
  for (const [cx, w] of P.doors) {
    wallBlock(stat, SOUTH, (from + cx - w / 2) / 2, cx - w / 2 - from, 0, WALL_TOP, PD.lacquerDeep);
    wallBlock(stat, SOUTH, cx, w, P.doorH, WALL_TOP, PD.lacquerDeep);
    from = cx + w / 2;
  }
  wallBlock(stat, SOUTH, (from + IN_E) / 2, IN_E - from, 0, WALL_TOP, PD.lacquerDeep);
  // Khung gỗ: cột ốp (trùng hàng cột trong điện), đố chân tường + đố bậu cửa sổ, cột góc ngoài. Đố tường Bắc thấp hơn 5 mm.
  for (const wl of [EAST, WEST]) {
    for (const z of [...P.colZs, -90]) wallBox(stat, wl, z, (DADO + FRIEZE) / 2, 0.34, FRIEZE - DADO, P.wall + 0.18, frame);
    wallBox(stat, wl, MID_Z, DADO + 0.075, OUT_S - OUT_N - 0.02, 0.15, P.wall + 0.12, frame);
    wallBox(stat, wl, MID_Z, SILL + 0.125, OUT_S - OUT_N - 0.02, 0.25, P.wall + 0.12, frame);
  }
  for (const x of [-16, -9, 9, 16]) wallBox(stat, NORTH, x, (DADO + FRIEZE) / 2, 0.34, FRIEZE - DADO, P.wall + 0.18, frame);
  wallBox(stat, NORTH, P.x, DADO + 0.075, OUT_E - OUT_W - 0.02, 0.14, P.wall + 0.12, frame);
  wallBox(stat, NORTH, P.x, SILL + 0.125, OUT_E - OUT_W - 0.02, 0.24, P.wall + 0.12, frame);
  for (const x of [OUT_W, OUT_E]) for (const z of [OUT_S, OUT_N]) addBox(stat, 0.5, WALL_TOP, 0.5, frame, x, WALL_TOP / 2, z);

  // ── Cửa sổ song gỗ: dãy cửa cao hai bên hông + tường hậu; mặt tiền hai tầng cửa giữa các cửa ra vào ──
  const sideWins: [number, number][] = [
    [-64.2, 2],
    [-68.5, 3],
    [-73.5, 3],
    [-78.5, 3],
    [-83.5, 3],
    [-88, 2.4],
    [-91.8, 2],
  ];
  const frontWins: [number, number][] = [
    [-18, 4],
    [-6.2, 1.5],
    [6.2, 1.5],
    [18, 4],
  ];
  for (const wl of [EAST, WEST]) for (const [z, w] of sideWins) wallWindow(stat, wl, z, HIGH.y, w, HIGH.h, latticeLit, latticeDark, frame);
  for (const [x, w] of [
    [-18.8, 2.8],
    [-12.5, 3],
    [12.5, 3],
    [18.8, 2.8],
  ] as const) {
    wallWindow(stat, NORTH, x, HIGH.y, w, HIGH.h, latticeLit, latticeDark, frame);
  }
  for (const [x, w] of frontWins) {
    wallWindow(stat, SOUTH, x, LOW.y, w, LOW.h, latticeLit, latticeDark, frame);
    wallWindow(stat, SOUTH, x, HIGH.y, w, HIGH.h, latticeLit, latticeDark, frame);
  }

  // ── Ba cửa ra vào: khung son, lanh tô chỉ vàng, ngưỡng đá; hai cánh mở áp tường trong, đinh vàng ──
  const studs: THREE.Vector3[] = [];
  for (const [cx, w] of P.doors) {
    const half = w / 2;
    for (const s of [-1, 1]) addBox(stat, 0.32, P.doorH + 0.5, P.wall + 0.16, lacquer, cx + s * (half + 0.14), (P.doorH + 0.5) / 2, P.zSouth);
    addBox(stat, w + 0.64, 0.55, P.wall + 0.2, PD.lacquerDark, cx, P.doorH + 0.245, P.zSouth);
    addBox(stat, w + 0.64, 0.06, P.wall + 0.24, gold, cx, P.doorH - 0.06, P.zSouth, false);
    addBox(stat, w - 0.04, 0.03, P.wall + 0.1, PD.stoneDark, cx, FLOOR_Y, P.zSouth, false);
    const lw = half - 0.04;
    const lh = P.doorH - 0.14;
    for (const s of [-1, 1]) {
      const lx = cx + s * (half + 0.32 + lw / 2);
      addBox(stat, lw, lh, 0.1, PD.lacquerDeep, lx, FLOOR_Y + lh / 2, IN_S - 0.14);
      const nc = Math.max(3, Math.round(lw / 0.42));
      for (let i = 0; i < nc; i++) {
        for (let y = 0.7; y < lh - 0.4; y += 0.62) studs.push(new THREE.Vector3(lx - lw / 2 + ((i + 0.5) * lw) / nc, FLOOR_Y + y, IN_S - 0.2));
      }
    }
  }
  stat.add(mesh(scatterGeometry(geo.sphere(0.045, 6, 3), studs), goldBright, { castShadow: false }));

  // ── Hiên: mười cột son trên chân tảng đá, đai vàng, đấu vàng; xà hiên chỉ vàng, xà nách, bẩy đỡ mép mái, trần ô cờ ──
  const porchBase = geo.lathe(
    [
      [0, 0],
      [0.78, 0],
      [0.78, 0.14],
      [0.7, 0.2],
      [0.64, 0.3],
      [0.56, 0.36],
      [0, 0.36],
    ],
    20,
  );
  const porchShaft = 11.3 - 0.4;
  const brace = mat(PD.lacquerDark);
  for (const x of P.porchXs) {
    stat.add(mesh(porchBase, stone, { x, y: 0.06, z: P.porchZ }));
    stat.add(mesh(geo.cyl(P.porchR, P.porchR * 1.04, porchShaft, 20), lacquer, { x, y: 0.4 + porchShaft / 2, z: P.porchZ }));
    for (const y of [1.3, 10.5]) stat.add(mesh(geo.cyl(P.porchR * 1.08, P.porchR * 1.08, 0.16, 20), gold, { x, y, z: P.porchZ }));
    stat.add(mesh(geo.cyl(0.64, 0.52, 0.3, 20), gold, { x, y: 11.14, z: P.porchZ }));
    addBox(stat, 0.36, 0.5, 3, brace, x, 11.45, (P.porchZ - 0.35 + OUT_S) / 2);
    const a = new THREE.Vector3(x, 10.75, P.porchZ + 0.3);
    const b = new THREE.Vector3(x, 11.85, -56.75);
    const arm = mesh(geo.box(0.3, 0.34, a.distanceTo(b)), brace);
    arm.position.copy(a).add(b).multiplyScalar(0.5);
    arm.lookAt(b);
    stat.add(arm);
  }
  addBox(stat, 46.2, 0.75, 0.7, brace, P.x, 11.675, P.porchZ);
  for (const y of [11.4, 11.95]) addBox(stat, 46.24, 0.07, 0.04, gold, P.x, y, P.porchZ + 0.37, false);
  for (const s of [-1, 1]) addBox(stat, 0.36, 0.75, 2.65, brace, P.x + s * 22.95, 11.675, (P.porchZ - 0.35 + OUT_S) / 2);
  const coffer = cofferTexture();
  const cofferMat = new THREE.MeshStandardMaterial({ map: coffer, roughness: 0.6, metalness: 0.15, emissive: '#ffffff', emissiveMap: coffer, emissiveIntensity: 0.14 });
  cofferPanel(stat, -23.1, 23.1, OUT_S, P.porchZ - 0.35, EAVE_Y, cofferMat);

  // Hoành phi "ĐẠI PHÁP ĐƯỜNG" trên cửa chính (nền khung vàng), câu đối trên hai cột giữa hiên, đèn lồng dưới hiên.
  addBox(stat, 5.7, 1.85, 0.08, goldBright, P.x, P.doorH + 1.5, OUT_S + 0.042);
  const plaque = kit.signBoard('ĐẠI PHÁP ĐƯỜNG', { width: 5.2, height: 1.4, bg: PD.ink, border: PD.gold, color: PD.goldBright, depth: 0.12, fontScale: 0.52 });
  plaque.position.set(P.x, P.doorH + 1.5, OUT_S + 0.145);
  stat.add(plaque);
  for (const [s, text] of [
    [-1, 'Pháp Âm Vi Diệu'],
    [1, 'Tâm Tịnh Kinh An'],
  ] as const) {
    const board = verticalBoard(text, 0.62, 5.2, PD.ink, PD.goldBright);
    board.position.set(P.x + s * 3.3, 5.6, P.porchZ + P.porchR + 0.035);
    stat.add(board);
  }
  for (const x of [-11, -5.75, 5.75, 11]) {
    hangingLantern(ctx, x, 9.4, -60.1, '#e0352b', 1.7);
    rod(stat, new THREE.Vector3(x, EAVE_Y, -60.1), new THREE.Vector3(x, 10.3, -60.1), 0.02, frame);
  }

  // ── Bốn dãy cột son khổng lồ trong điện (chân tảng sen đá, đai vàng); rồng vàng cuốn bốn cột gần tượng ──
  const colBase = geo.lathe(
    [
      [0, 0],
      [0.9, 0],
      [0.9, 0.12],
      [0.8, 0.2],
      [0.74, 0.3],
      [0.66, 0.38],
      [0, 0.38],
    ],
    24,
  );
  const colShaft = CEIL_Y - 0.02 - (FLOOR_Y + 0.36);
  for (const z of P.colZs) {
    for (const cx of P.colXs) {
      for (const s of [-1, 1]) {
        const x = P.x + s * cx;
        stat.add(mesh(colBase, stone, { x, y: FLOOR_Y - 0.01, z }));
        stat.add(mesh(geo.cyl(P.colR, P.colR * 1.03, colShaft, 24), lacquer, { x, y: FLOOR_Y + 0.36 + colShaft / 2, z }));
        for (const y of [1.5, 10.7]) stat.add(mesh(geo.cyl(P.colR * 1.07, P.colR * 1.07, 0.18, 24), gold, { x, y, z }));
      }
    }
  }
  for (const z of [P.colZs[3], P.colZs[4]]) {
    for (const s of [-1, 1] as const) {
      coilingDragon(stat, P.x + s * P.colXs[0], z, P.colR, 2.3, 10.3, new THREE.Vector3(-s * 0.75, 0, 0.66).normalize(), s < 0 ? 1 : -1);
    }
  }

  // ── Xà ngang (theo hàng cột) + xà dọc (trên các dãy cột) có chỉ vàng, diềm chạm thủng dưới xà ngang ──
  const beam = mat(PD.lacquerDeep);
  for (const z of P.colZs) {
    addBox(stat, IN_E - IN_W + 0.3, CEIL_Y - 0.01 - BEAM_X_BOTTOM, 0.75, beam, P.x, (BEAM_X_BOTTOM + CEIL_Y - 0.01) / 2, z);
    for (const dz of [-0.28, 0.28]) addBox(stat, IN_E - IN_W + 0.3, 0.05, 0.07, gold, P.x, BEAM_X_BOTTOM - 0.025, z + dz, false);
  }
  for (const cx of P.colXs) {
    for (const s of [-1, 1]) {
      const x = P.x + s * cx;
      addBox(stat, 0.7, CEIL_Y - 0.01 - BEAM_Z_BOTTOM, IN_S - IN_N + 0.3, beam, x, (BEAM_Z_BOTTOM + CEIL_Y - 0.01) / 2, MID_Z);
      for (const dx of [-0.26, 0.26]) addBox(stat, 0.07, 0.05, IN_S - IN_N + 0.3, gold, x + dx, BEAM_Z_BOTTOM - 0.025, MID_Z, false);
    }
  }
  const fret = fretworkTexture();
  const fretMat = new THREE.MeshStandardMaterial({ map: fret, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2, emissive: '#ffffff', emissiveMap: fret, emissiveIntensity: 0.18 });
  const fretH = 0.8;
  const r = P.colR;
  const spans: [number, number][] = [
    [IN_W, -16 - r],
    [-16 + r, -9 - r],
    [-9 + r, 9 - r],
    [9 + r, 16 - r],
    [16 + r, IN_E],
  ];
  for (const z of P.colZs) {
    for (const [x0, x1] of spans) {
      // Gian giữa ngay trước tượng để trống: diềm không che vầng hào quang khi nhìn từ cửa.
      if (z === P.colZs[4] && x0 < 0 && x1 > 0) continue;
      stat.add(mesh(repPlane(x1 - x0, fretH, (x1 - x0) / fretH, 1), fretMat, { x: (x0 + x1) / 2, y: BEAM_X_BOTTOM - 0.05 - fretH / 2, z, castShadow: false }));
    }
  }

  // ── Trần ô cờ son thếp sen vàng: mỗi khung giữa các xà là một tấm, ô cờ vừa khít khung ──
  const gridX = [IN_W, -16, -9, 9, 16, IN_E];
  const gridZ = [IN_S, ...P.colZs, IN_N];
  for (let i = 0; i + 1 < gridX.length; i++) {
    for (let j = 0; j + 1 < gridZ.length; j++) cofferPanel(stat, gridX[i]!, gridX[i + 1]!, gridZ[j]!, gridZ[j + 1]!, CEIL_Y, cofferMat);
  }

  // ── Vệt nắng xiên qua song cửa cao phía Đông + song cửa thấp mặt tiền, in ô nắng có song trên sàn ──
  const dir = sunDir.clone().negate().normalize();
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTexture(),
    color: '#ffdca0',
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTexture(), color: '#ffd896', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const shafts: [THREE.Vector3, number, number][] = [
    // Chỉ những ô cửa hông có vệt nắng chạm sàn trước khi tới tường Bắc.
    ...sideWins.slice(0, 5).map(([z, w]): [THREE.Vector3, number, number] => [new THREE.Vector3(IN_E - 0.05, HIGH.y, z), w, HIGH.h]),
    ...frontWins.map(([x, w]): [THREE.Vector3, number, number] => [new THREE.Vector3(x, LOW.y, IN_S - 0.05), w, LOW.h]),
  ];
  for (const [src, w, h] of shafts) {
    const len = (src.y - FLOOR_Y) / -dir.y;
    lightShaft(dyn, src, dir, len, w * 0.85, shaftMat);
    const hit = src.clone().addScaledVector(dir, len);
    const along = (h * Math.hypot(dir.x, dir.z)) / -dir.y;
    const patch = mesh(new THREE.PlaneGeometry(w, along).rotateX(-Math.PI / 2), patchMat, {
      x: hit.x,
      y: FLOOR_Y + 0.012,
      z: hit.z,
      ry: Math.atan2(dir.x, dir.z),
      castShadow: false,
      receiveShadow: false,
    });
    dyn.add(patch);
  }

  // ── Đèn chùm hoa sen giữa gian, đèn lồng hai lối bên, phướn treo dưới xà dọc ──
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffc766', emissiveIntensity: 2 });
  ctx.flicker.push({ mat: bulb, base: 2, speed: 1.7, phase: 0 });
  const halo = new THREE.MeshBasicMaterial({ map: radial, color: '#ffc46b', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const z of BAY_ZS.slice(0, 3)) lotusChandelier(stat, dyn, P.x, 9.2, z, CEIL_Y, bulb, halo);
  for (const z of BAY_ZS) {
    for (const s of [-1, 1]) {
      const x = P.x + s * 12.5;
      hangingLantern(ctx, x, 8, z, '#e0352b', 1.5);
      rod(stat, new THREE.Vector3(x, CEIL_Y, z), new THREE.Vector3(x, 8.83, z), 0.02, frame);
    }
  }
  const texts = ['Nam Mô A Di Đà Phật', 'Nam Mô Quán Thế Âm Bồ Tát', 'Nam Mô Đại Thế Chí Bồ Tát', 'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật'];
  const banners = BAY_ZS.flatMap((z, i) => [-1, 1].map((s) => ({ x: P.x + s * P.colXs[0], z, text: texts[i]! })));
  hangingBanners(ctx, stat, dyn, banners, BEAM_Z_BOTTOM - 0.02, 5, 1.1);

  // ── Khu thờ chính: bệ, phông hậu, tượng Phật đá, hào quang, tháp đèn sen, đồ thờ ──
  buildPhapDuongAltar(ctx, stat, dyn, FLOOR_Y, radial);

  // ── Ánh sáng ấm trong điện (không đổ bóng): giữa điện, gian giữa, trước bệ tượng ──
  const naveLight = new THREE.PointLight('#ffd29a', 55, 34, 1.4);
  naveLight.position.set(P.x, 9.4, -70.5);
  const midLight = new THREE.PointLight('#ffc98a', 40, 28, 1.5);
  midLight.position.set(P.x, 8.5, -78);
  const altarLight = new THREE.PointLight('#ffb867', 45, 22, 1.5);
  altarLight.position.set(P.x, 6.5, -83);
  ctx.lights.push(naveLight, midLight, altarLight);
  ctx.updates.push((_dt, t) => {
    shaftMat.opacity = 0.2 + Math.sin(t * 0.37) * 0.025;
  });

  // ── Mái ba tầng (nhóm động, như mái các điện khác); dải tầng diêm vào nhóm tĩnh ──
  const roof = buildPhapDuongRoof(stat, latticeDark);
  ctx.dynamics.add(roof);
  addStatic(ctx, stat);
  ctx.dynamics.add(dyn);
  return { roof };
}
