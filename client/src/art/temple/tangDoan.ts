// Điện Tăng Đoàn — điện tuyên dương chư Tăng còn đang tu học (thay Tăng xá cũ): trang nghiêm, hoành tráng, sáng sủa. Ngoài:
// tường cao, mái hai tầng chồng diêm (lưỡng long chầu ngọc trên tầng trên), hiên hai cột son câu đối ca ngợi đức sáng
// trí soi, hoành phi thếp vàng "ĐIỆN TĂNG ĐOÀN", đèn lồng đỏ. Trong: sàn đá sáng, thảm đỏ viền vàng từ hiên dẫn tới bệ
// Bảng Vàng ba bậc (treo ảnh hoặc chữ vinh danh, pháp luân trên đỉnh; trên thảm trước bệ là bồ đoàn lạy xả nghiệp)
// giữa hai trụ đèn hoa sen vàng; hai hàng cột son đai vàng
// (đôi rồng vàng cuốn hai cột trước bệ), xà chỉ vàng, diềm chạm thủng, trần ô cờ sen vàng, đèn chùm hoa sen, đèn lồng,
// phướn "Tuyên Dương / Đức Trí Song Toàn / Vinh Danh". Sáu khung vinh danh Sư Thầy (3 mỗi bên tường, chi tiết ở
// tangDoanDecor.ts); nắng xiên qua song cửa cao. Bố cục đọc từ TANG_DOAN (shared) — trùng khớp va chạm và trạm đảnh lễ.
import * as THREE from 'three';
import { TANG_DOAN } from '@shared/index';
import { domainOfPhoto } from '../../content/fortunes/domains';
import { GALLERY_PHOTOS } from '../../content/gallery';
import { kit } from '../kit';
import { addStatic, hangingLantern, verticalBoard, type TempleCtx } from './ctx';
import { cofferTexture, coilingDragon, fretworkTexture, gilt, hangingBanners, lotusChandelier, patchTexture, radialTexture, rod, shaftTexture } from './phapDuongDecor';
import { repPlane } from './phapDuongRoof';
import { vietRoof } from './roof';
import { HALO_OPACITY, PHOTO_GLOW, TD, addBox, hallColumn, honourDais, kneelMat, lotusLampPillar, portraitStation, stationKit, type PortraitParts } from './tangDoanDecor';

const { geo, mat, mesh } = kit;
const T = TANG_DOAN;

const IN_W = T.xWest + T.wall / 2;
const IN_E = T.xEast - T.wall / 2;
const IN_S = T.zSouth - T.wall / 2;
const IN_N = T.zNorth + T.wall / 2;
const OUT_W = T.xWest - T.wall / 2;
const OUT_E = T.xEast + T.wall / 2;
const OUT_S = T.zSouth + T.wall / 2;
const OUT_N = T.zNorth - T.wall / 2;
const MID_Z = (T.zSouth + T.zNorth) / 2;
const DOOR_L = T.x - T.doorW / 2;
const DOOR_R = T.x + T.doorW / 2;
const DOOR_H = 3.0;
const FLOOR_Y = 0.08;
/** Cửa sổ cao (song gỗ) phía trên mỗi khung vinh danh. */
const WIN = { y: 4.15, h: 0.4, w: 1.5 };
/** Cửa sổ tròn hai bên cửa chính (cao hơn nóc tủ áo). */
const ROUND_WIN_Y = 3.0;
/** Đỉnh tường = mép mái tầng dưới; trần ô cờ; đáy xà ngang (theo hàng cột) và xà dọc (trên hai dãy cột). */
const WALL_TOP = 5.0;
const CEIL_Y = 4.9;
const BEAM_X = 4.6;
const BEAM_Z = 4.56;
/** Đèn chùm hoa sen (thu nhỏ) giữa gian: cao độ mép bát sen, tỉ lệ, vị trí — không che Bảng Vàng khi nhìn từ cửa. */
const CHANDELIER_Y = 3.95;
const CHANDELIER_SCALE = 0.62;
const CHANDELIER_ZS = [-27.9, -31.4];
/** Tâm hai trụ đèn hoa sen — trùng hai ô va chạm tròn `crane` trong shared/src/maps/temple.ts. */
const LAMP_PILLARS: readonly [number, number][] = [
  [T.x - 2.75, -37.2],
  [T.x + 2.75, -37.2],
];

export interface TangDoanHandles {
  roof: THREE.Group;
  /** Chân dung (theo id ảnh) bừng sáng rồi dịu lại. */
  pulsePortrait(photoId: string): void;
}

/**
 * Một đoạn tường: chân tường son, thân trát vàng sáng, diềm son trên. `inset` hạ nhẹ mặt trên chân tường/diềm của tường
 * Nam–Bắc để không trùng mặt phẳng với tường Đông–Tây ở góc (tránh nhấp nháy).
 */
function wallSegment(g: THREE.Group, x: number, z: number, w: number, d: number, y0: number, y1: number, inset = 0): void {
  const e = 0.04;
  const along = w > d;
  const dadoTop = Math.min(y1, 1.0 - inset);
  if (y0 < dadoTop) addBox(g, w + (along ? 0 : e), dadoTop - y0, d + (along ? e : 0), TD.dado, x, (y0 + dadoTop) / 2, z);
  const pTop = Math.min(y1, 4.5);
  const pBot = Math.max(y0, 1.0 - inset);
  if (pBot < pTop) addBox(g, w, pTop - pBot, d, TD.plaster, x, (pBot + pTop) / 2, z);
  // Diềm chồng xuống thân tường 1 cm (không hở khe sáng ở 4,5 m); đáy diềm tường Nam–Bắc lệch 5 mm so với tường Đông–Tây.
  const fBot = 4.49 + inset / 2;
  const fTop = y1 - inset;
  if (y1 > 4.5) addBox(g, w + (along ? 0 : e), fTop - fBot, d + (along ? e : 0), TD.lacquerDark, x, (fBot + fTop) / 2, z);
}

/** Ô cửa sổ song gỗ trên tường (mặt hướng +Z cục bộ); `pane` sáng = nhìn từ trong ra trời, tối = nhìn từ ngoài vào. */
function latticeWindow(w: number, h: number, pane: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(w, h), pane, { z: 0.004, castShadow: false }));
  const wood = mat(TD.frame);
  g.add(mesh(geo.box(w + 0.12, 0.07, 0.06), wood, { y: h / 2 + 0.03, z: 0.02 }));
  g.add(mesh(geo.box(w + 0.12, 0.07, 0.06), wood, { y: -h / 2 - 0.03, z: 0.02 }));
  const n = Math.max(3, Math.round(w / 0.16));
  for (let i = 0; i <= n; i++) g.add(mesh(geo.box(0.035, h, 0.04), wood, { x: -w / 2 + (i * w) / n, z: 0.02, castShadow: false }));
  return g;
}

/** Vệt nắng (2 mặt phẳng chéo nhau dọc theo tia), đầu trên tại `from`. */
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

/** Một tầng mái chái: phần nhà bên dưới `w` (dọc Z) × `d` (dọc X), cao `h` từ mép tới nóc, mép ở cao độ `y`. */
interface Tier {
  w: number;
  d: number;
  h: number;
  y: number;
  over: number;
  lift: number;
}

/** Độ dốc mặt mái (cao / tầm ngang từ mép tới nóc). */
const slope = (t: Tier): number => t.h / ((t.d + 2 * t.over) / 2);

export function buildTangDoan(ctx: TempleCtx, sunDir: THREE.Vector3): TangDoanHandles {
  const stat = new THREE.Group();
  const dyn = new THREE.Group();
  const radial = radialTexture();
  const litPane = new THREE.MeshBasicMaterial({ color: '#ffe9c4' });
  const darkPane = mat('#2a160c');
  const bright = gilt(true);
  const frame = mat(TD.frame);

  // ── Nền đá, sàn đá mài sáng kẻ ron, hiên, ngưỡng cửa, thảm đỏ viền vàng từ hiên tới chân bệ Bảng Vàng ──
  addBox(stat, OUT_E - OUT_W + 0.8, 0.06, OUT_S - OUT_N + 0.8, TD.stone, T.x, 0.03, MID_Z);
  addBox(stat, IN_E - IN_W, 0.02, IN_S - IN_N, TD.stoneLight, T.x, FLOOR_Y - 0.01, MID_Z);
  const grout = mat(TD.grout);
  for (let i = 1; i < 8; i++) addBox(stat, 0.016, 0.005, IN_S - IN_N, grout, IN_W + (i * (IN_E - IN_W)) / 8, FLOOR_Y + 0.0025, MID_Z, false);
  for (let i = 1; i < 10; i++) addBox(stat, IN_E - IN_W, 0.005, 0.016, grout, T.x, FLOOR_Y + 0.0025, IN_N + (i * (IN_S - IN_N)) / 10, false);
  addBox(stat, 6.6, FLOOR_Y, 1.7, TD.stoneLight, T.x, FLOOR_Y / 2, OUT_S + 0.85);
  addBox(stat, T.doorW + 0.4, 0.088, T.wall + 0.1, TD.stoneDark, T.x, 0.044, T.zSouth, false);
  const carpetS = OUT_S + 1.3;
  const carpetN = IN_N + 1.604;
  const carpetZ = (carpetS + carpetN) / 2;
  addBox(stat, 2.2, 0.012, carpetS - carpetN, TD.carpet, T.x, FLOOR_Y + 0.006, carpetZ, false);
  const trim = mat(TD.gold, { roughness: 0.55, metalness: 0.3 });
  for (const s of [1, -1]) addBox(stat, 0.08, 0.014, carpetS - carpetN, trim, T.x + s * 1.07, FLOOR_Y + 0.007, carpetZ, false);

  // ── Tường (cửa giữa mặt Nam), cột góc + cột ốp ngoài sơn son, cột ốp trong đai vàng chia nhịp các khung vinh danh ──
  const midX = (IN_W + IN_E) / 2;
  wallSegment(stat, T.xWest, MID_Z, T.wall, OUT_S - OUT_N, 0, WALL_TOP);
  wallSegment(stat, T.xEast, MID_Z, T.wall, OUT_S - OUT_N, 0, WALL_TOP);
  wallSegment(stat, midX, T.zNorth, IN_E - IN_W, T.wall, 0, WALL_TOP, 0.01);
  wallSegment(stat, (IN_W + DOOR_L) / 2, T.zSouth, DOOR_L - IN_W, T.wall, 0, WALL_TOP, 0.01);
  wallSegment(stat, (DOOR_R + IN_E) / 2, T.zSouth, IN_E - DOOR_R, T.wall, 0, WALL_TOP, 0.01);
  wallSegment(stat, T.x, T.zSouth, T.doorW, T.wall, DOOR_H, WALL_TOP, 0.01);
  for (const [x, z] of [
    [OUT_W, OUT_S],
    [OUT_E, OUT_S],
    [OUT_W, OUT_N],
    [OUT_E, OUT_N],
  ] as const) {
    addBox(stat, 0.36, WALL_TOP + 0.05, 0.36, TD.lacquerDark, x, (WALL_TOP + 0.05) / 2, z);
  }
  for (const z of T.colZs) {
    for (const x of [OUT_W, OUT_E]) addBox(stat, 0.24, WALL_TOP - 0.1, 0.24, TD.lacquerDark, x, (WALL_TOP - 0.1) / 2, z);
    for (const [x, s] of [
      [IN_W, 1],
      [IN_E, -1],
    ] as const) {
      addBox(stat, 0.14, BEAM_X, 0.28, TD.lacquer, x + s * 0.07, BEAM_X / 2, z);
      for (const y of [0.6, 4.4]) addBox(stat, 0.16, 0.08, 0.3, bright, x + s * 0.08, y, z);
    }
  }

  // ── Khung cửa son nẹp vàng (cột cửa nằm ngoài ô cửa), hai cánh cửa mở áp tường trong, đinh vàng ──
  for (const [x, s] of [
    [DOOR_L, -1],
    [DOOR_R, 1],
  ] as const) {
    addBox(stat, 0.2, DOOR_H + 0.1, T.wall + 0.12, TD.lacquer, x + s * 0.1, (DOOR_H + 0.1) / 2, T.zSouth);
  }
  addBox(stat, T.doorW + 0.6, 0.26, T.wall + 0.14, TD.lacquer, T.x, DOOR_H + 0.13, T.zSouth);
  addBox(stat, T.doorW + 0.62, 0.05, T.wall + 0.16, bright, T.x, DOOR_H + 0.02, T.zSouth);
  const stud = mat(TD.goldBright, { metalness: 0.5, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const cx = (s < 0 ? DOOR_L : DOOR_R) + s * 0.8;
    addBox(stat, 1.18, DOOR_H - 0.06, 0.07, TD.lacquer, cx, (DOOR_H - 0.06) / 2, IN_S - 0.05);
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 4; k++) stat.add(mesh(geo.sphere(0.025, 6, 4), stud, { x: cx - 0.36 + i * 0.36, y: 0.6 + k * 0.62, z: IN_S - 0.09 }));
    }
  }

  // ── Cửa sổ: song cao trên mỗi khung vinh danh (hai mặt), cửa tròn hai bên cửa chính ──
  for (const z of T.shrineZs) {
    for (const [x, xo, ryIn] of [
      [IN_W, OUT_W, Math.PI / 2],
      [IN_E, OUT_E, -Math.PI / 2],
    ] as const) {
      const sgn = x < T.x ? 1 : -1;
      const inner = latticeWindow(WIN.w, WIN.h, litPane);
      inner.position.set(x + sgn * 0.001, WIN.y, z);
      inner.rotation.y = ryIn;
      stat.add(inner);
      const outer = latticeWindow(WIN.w, WIN.h, darkPane);
      outer.position.set(xo - sgn * 0.001, WIN.y, z);
      outer.rotation.y = -ryIn;
      stat.add(outer);
    }
  }
  const roundWin = (x: number, z: number, ry: number, lit: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, ROUND_WIN_Y, z);
    g.rotation.y = ry;
    g.add(mesh(new THREE.CircleGeometry(0.56, 24), lit ? litPane : darkPane, { z: 0.004, castShadow: false }));
    g.add(mesh(geo.torus(0.6, 0.07, 6, 24), mat(TD.lacquer), { z: 0.03 }));
    for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) g.add(mesh(geo.box(1.1, 0.04, 0.04), frame, { z: 0.03, rz: a, castShadow: false }));
    g.add(mesh(geo.torus(0.26, 0.03, 4, 16), bright, { z: 0.04 }));
    stat.add(g);
  };
  const roundXs = [DOOR_L - 2.1, DOOR_R + 2.1];
  for (const x of roundXs) {
    roundWin(x, OUT_S + 0.001, 0, false);
    roundWin(x, IN_S - 0.001, Math.PI, true);
  }

  // ── Vệt nắng xiên qua song cửa phía Đông + cửa tròn mặt tiền, in vệt sáng có song trên sàn ──
  const dir = sunDir.clone().negate().normalize();
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTexture(),
    color: '#ffdca0',
    transparent: true,
    opacity: 0.17,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTexture(), color: '#ffd896', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const shafts: [THREE.Vector3, number][] = [
    ...T.shrineZs.map((z) => [new THREE.Vector3(IN_E - 0.05, WIN.y, z), WIN.w * 0.85] as [THREE.Vector3, number]),
    ...roundXs.map((x) => [new THREE.Vector3(x, ROUND_WIN_Y, IN_S - 0.05), 0.95] as [THREE.Vector3, number]),
  ];
  for (const [from, width] of shafts) {
    const len = (from.y - FLOOR_Y) / -dir.y;
    lightShaft(dyn, from, dir, len, width, shaftMat);
    const hit = from.clone().addScaledVector(dir, len);
    dyn.add(
      mesh(new THREE.PlaneGeometry(width * 1.15, width * 0.8).rotateX(-Math.PI / 2), patchMat, {
        x: hit.x,
        y: FLOOR_Y + 0.02,
        z: hit.z,
        ry: Math.atan2(dir.x, dir.z) + Math.PI / 2,
        castShadow: false,
        receiveShadow: false,
      }),
    );
  }

  // ── Hai hàng cột son đai vàng (đôi rồng vàng cuốn hai cột trước bệ), xà chỉ vàng, diềm chạm thủng, trần ô cờ ──
  for (const z of T.colZs) {
    for (const s of [-1, 1]) hallColumn(stat, T.x + s * T.colX, z, 0.22, BEAM_Z);
  }
  for (const s of [-1, 1] as const) {
    coilingDragon(stat, T.x + s * T.colX, T.colZs[3], 0.22, 2.05, 3.8, new THREE.Vector3(-s * 0.75, 0, 0.66).normalize(), s < 0 ? 1 : -1);
  }
  const beam = mat(TD.lacquerDeep);
  for (const z of T.colZs) {
    addBox(stat, IN_E - IN_W, CEIL_Y - BEAM_X, 0.3, beam, T.x, (BEAM_X + CEIL_Y) / 2, z);
    for (const dz of [-0.11, 0.11]) addBox(stat, IN_E - IN_W, 0.02, 0.04, bright, T.x, BEAM_X - 0.008, z + dz, false);
  }
  for (const s of [-1, 1]) {
    const x = T.x + s * T.colX;
    addBox(stat, 0.3, CEIL_Y - BEAM_Z, IN_S - IN_N, beam, x, (BEAM_Z + CEIL_Y) / 2, MID_Z);
    for (const dx of [-0.11, 0.11]) addBox(stat, 0.04, 0.02, IN_S - IN_N, bright, x + dx, BEAM_Z - 0.008, MID_Z, false);
  }
  const fret = fretworkTexture();
  const fretMat = new THREE.MeshStandardMaterial({ map: fret, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2, emissive: '#ffffff', emissiveMap: fret, emissiveIntensity: 0.18 });
  const fretW = 2 * T.colX - 0.5;
  const fretH = 0.42;
  for (const z of T.colZs) stat.add(mesh(repPlane(fretW, fretH, fretW / fretH, 1), fretMat, { x: T.x, y: BEAM_X - 0.012 - fretH / 2, z, castShadow: false }));
  const coffer = cofferTexture();
  const cofferMat = new THREE.MeshStandardMaterial({ map: coffer, roughness: 0.6, metalness: 0.15, emissive: '#ffffff', emissiveMap: coffer, emissiveIntensity: 0.16 });
  const gx = [IN_W, T.x - T.colX, T.x + T.colX, IN_E];
  const gz = [IN_S, ...T.colZs, IN_N];
  for (let i = 0; i + 1 < gx.length; i++) {
    for (let j = 0; j + 1 < gz.length; j++) {
      const x0 = gx[i]!;
      const x1 = gx[i + 1]!;
      const z0 = gz[j]!;
      const z1 = gz[j + 1]!;
      const w = x1 - x0;
      const d = z0 - z1;
      const panel = repPlane(w, d, Math.max(1, Math.round(w / 1.3)), Math.max(1, Math.round(d / 1.3))).rotateX(Math.PI / 2);
      stat.add(mesh(panel, cofferMat, { x: (x0 + x1) / 2, y: CEIL_Y, z: (z0 + z1) / 2, castShadow: false }));
    }
  }

  // ── Đèn chùm hoa sen giữa gian, đèn lồng hai lối bên (treo từ xà ngang), phướn treo dưới xà dọc ──
  const bulb = new THREE.MeshStandardMaterial({ color: '#fff3d0', emissive: '#ffc766', emissiveIntensity: 2 });
  ctx.flicker.push({ mat: bulb, base: 2, speed: 1.7, phase: 0 });
  const halo = new THREE.MeshBasicMaterial({ map: radial, color: '#ffc46b', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const z of CHANDELIER_ZS) {
    const sg = new THREE.Group();
    sg.position.set(T.x, CHANDELIER_Y, z);
    sg.scale.setScalar(CHANDELIER_SCALE);
    const dg = sg.clone(false);
    lotusChandelier(sg, dg, 0, 0, 0, (CEIL_Y - CHANDELIER_Y) / CHANDELIER_SCALE, bulb, halo);
    stat.add(sg);
    dyn.add(dg);
  }
  for (const z of [T.colZs[1], T.colZs[2]]) {
    for (const x of [IN_W + 1.25, IN_E - 1.25]) {
      hangingLantern(ctx, x, 3.8, z, '#e0352b', 0.9);
      rod(stat, new THREE.Vector3(x, BEAM_X + 0.05, z), new THREE.Vector3(x, 4.36, z), 0.012, frame);
    }
  }
  const bannerTexts = ['Tuyên Dương', 'Đức Trí Song Toàn', 'Vinh Danh'];
  hangingBanners(
    ctx,
    stat,
    dyn,
    T.shrineZs.flatMap((z, i) => [-1, 1].map((s) => ({ x: T.x + s * T.colX, z, text: bannerTexts[i] ?? 'Vinh Danh' }))),
    BEAM_Z + 0.05,
    1.5,
    0.46,
  );

  // ── Sáu khung vinh danh Sư Thầy: 1–3 tường Tây, 4–6 tường Đông (từ cửa vào trong) ──
  const sk = stationKit(radial);
  const parts = new Map<string, PortraitParts>();
  ([
    [IN_W, Math.PI / 2],
    [IN_E, -Math.PI / 2],
  ] as const).forEach(([x, ry], side) =>
    T.shrineZs.forEach((z, k) => {
      const id = `portrait_${side * T.shrineZs.length + k + 1}`;
      const sg = new THREE.Group();
      sg.position.set(x, 0, z);
      sg.rotation.y = ry;
      const dg = sg.clone(false);
      parts.set(id, portraitStation(sg, dg, GALLERY_PHOTOS.find((p) => p.id === id), domainOfPhoto(id), sk, FLOOR_Y));
      stat.add(sg);
      dyn.add(dg);
    }),
  );

  // ── Bệ Bảng Vàng sát tường Bắc: phông son viền vàng, quầng sáng, bệ + bảng, câu đối hai bên, hai trụ đèn hoa sen ──
  addBox(stat, 4.6, 3.95, 0.04, TD.lacquer, T.x, 2.6, IN_N + 0.024);
  for (const y of [0.65, 4.55]) addBox(stat, 4.64, 0.05, 0.022, bright, T.x, y, IN_N + 0.05, false);
  for (const s of [-1, 1]) addBox(stat, 0.05, 3.85, 0.022, bright, T.x + s * 2.295, 2.6, IN_N + 0.05, false);
  const boardGlow = new THREE.MeshBasicMaterial({ map: radial, color: '#ffc46b', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  dyn.add(mesh(new THREE.PlaneGeometry(6, 5), boardGlow, { x: T.x, y: 2.5, z: IN_N + 0.052, castShadow: false, receiveShadow: false }));
  honourDais(stat, T.x, IN_N);
  // Bồ đoàn lạy xả nghiệp trên thảm đỏ (mặt thảm FLOOR_Y + 0,012), đúng trạm `xa_nghiep`.
  kneelMat(stat, T.x, IN_N + T.xaNghiepOff, FLOOR_Y + 0.012);
  const lampHalo = new THREE.MeshBasicMaterial({ map: radial, color: '#ffcf80', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [x, z] of LAMP_PILLARS) lotusLampPillar(stat, dyn, x, z, bulb, lampHalo);
  for (const [s, text] of [
    [1, 'Đạo Hạnh Rạng Ngời'],
    [-1, 'Trí Tuệ Sáng Soi'],
  ] as const) {
    const b = verticalBoard(text, 0.42, 2.5, '#7a160e', TD.goldBright);
    b.position.set(T.x + s * 3.6, 2.45, IN_N + 0.04);
    stat.add(b);
  }
  const inPlaque = kit.signBoard('TINH TẤN TU HỌC', { width: 2.4, height: 0.5, bg: '#7a160e', border: TD.gold, color: TD.goldBright, depth: 0.05, fontScale: 0.5 });
  inPlaque.position.set(T.x, 3.72, IN_S - 0.03);
  inPlaque.rotation.y = Math.PI;
  stat.add(inPlaque);

  // ── Hiên: hai cột son, xà nẹp vàng, mái hiên, hoành phi thếp vàng, câu đối ca ngợi đức – trí, đèn lồng ──
  for (const s of [-1, 1]) hallColumn(stat, T.x + s * T.porchX, T.porchZ, 0.2, 4.0);
  addBox(stat, T.porchX * 2 + 0.5, 0.22, 0.24, TD.lacquerDeep, T.x, 4.09, T.porchZ);
  addBox(stat, T.porchX * 2 + 0.52, 0.03, 0.03, bright, T.x, 3.985, T.porchZ + 0.11, false);
  for (const s of [-1, 1]) addBox(stat, 0.18, 0.18, T.porchZ - OUT_S + 0.1, TD.lacquerDeep, T.x + s * T.porchX, 3.95, (OUT_S + T.porchZ) / 2 - 0.05);
  const porchRoof = vietRoof({ w: T.porchX * 2 + 1.2, d: 1.3, h: 0.65, overhang: 0.45, lift: 0.3, color: '#b5503a', pearl: false });
  porchRoof.position.set(T.x, 4.2, T.porchZ - 0.05);
  ctx.dynamics.add(porchRoof);
  addBox(stat, 3.1, 0.86, 0.06, bright, T.x, 3.72, OUT_S + 0.03);
  const plaque = kit.signBoard('ĐIỆN TĂNG ĐOÀN', { width: 2.9, height: 0.66, bg: '#7a160e', border: TD.gold, color: TD.goldBright, depth: 0.06, fontScale: 0.56 });
  plaque.position.set(T.x, 3.72, OUT_S + 0.08);
  stat.add(plaque);
  // Vế đầu bên phải (Đông) theo lối đọc câu đối truyền thống.
  for (const [s, text] of [
    [1, 'Đức Sáng Muôn Phương'],
    [-1, 'Trí Soi Vạn Nẻo'],
  ] as const) {
    const b = verticalBoard(text, 0.3, 2.3, '#7a160e', TD.goldBright);
    b.position.set(T.x + s * T.porchX, 2.15, T.porchZ + 0.23);
    stat.add(b);
  }
  for (const s of [-1, 1]) {
    const x = T.x + s * 3.0;
    hangingLantern(ctx, x, 3.45, T.porchZ + 0.1, '#e0352b', 0.85);
    rod(stat, new THREE.Vector3(x, 4.42, T.porchZ + 0.1), new THREE.Vector3(x, 3.99, T.porchZ + 0.1), 0.012, frame);
    // Đèn lồng hai góc mặt tiền treo trên cần gỗ chìa ra từ tường.
    const ex = T.x + s * 4.3;
    hangingLantern(ctx, ex, 3.95, OUT_S + 0.42, '#e0352b', 0.9);
    rod(stat, new THREE.Vector3(ex, 4.58, OUT_S - 0.05), new THREE.Vector3(ex, 4.58, OUT_S + 0.46), 0.022, frame);
    rod(stat, new THREE.Vector3(ex, 4.58, OUT_S + 0.42), new THREE.Vector3(ex, 4.5, OUT_S + 0.42), 0.012, frame);
  }

  // ── Tủ áo (sát mặt tiền, bên phải cửa) ──
  const wardrobe = new THREE.Group();
  wardrobe.position.set(35.3, 0, -23.9);
  addBox(wardrobe, 2.0, 2.2, 0.72, '#8a5a3b', 0, 1.1, 0);
  addBox(wardrobe, 2.1, 0.12, 0.8, TD.frame, 0, 2.26, 0);
  addBox(wardrobe, 0.03, 1.9, 0.02, TD.frame, 0, 1.15, 0.37);
  for (const x of [-0.12, 0.12]) wardrobe.add(mesh(geo.sphere(0.04, 6, 4), mat(TD.goldBright), { x, y: 1.15, z: 0.4 }));
  for (const x of [-0.5, 0.5]) addBox(wardrobe, 0.7, 1.5, 0.02, '#a0703f', x, 1.2, 0.365);
  const wPlaque = kit.signBoard('TỦ ÁO', { width: 0.8, height: 0.22, bg: TD.frame, border: TD.gold, color: TD.goldBright, depth: 0.02 });
  wPlaque.position.set(0, 2.05, 0.38);
  wardrobe.add(wPlaque);
  stat.add(wardrobe);

  // ── Ánh sáng ấm trong điện (3 đèn điểm, không đổ bóng): đầu gian, giữa gian, trước Bảng Vàng ──
  const naveLight = new THREE.PointLight('#ffd6a0', 24, 15, 1.5);
  naveLight.position.set(T.x, 3.6, -28.6);
  const midLight = new THREE.PointLight('#ffcf94', 21, 15, 1.5);
  midLight.position.set(T.x, 3.6, -32.6);
  const daisLight = new THREE.PointLight('#ffc27a', 12, 9, 1.6);
  daisLight.position.set(T.x, 2.8, -35.9);
  ctx.lights.push(naveLight, midLight, daisLight);

  // ── Mái hai tầng chồng diêm (nhóm `roof` — ẩn khi camera góc ba lọt vào trong điện). Hai tầng cùng tâm, cùng độ dốc
  // ~0,4; tầng diêm (lõi gỗ, song cửa, cột son, xà đầu) nối tầng dưới với mép tầng trên; rồng chầu ngọc trên tầng trên. ──
  const roof = new THREE.Group();
  const lower: Tier = { w: OUT_S - OUT_N, d: OUT_E - OUT_W, h: 2.4, y: WALL_TOP, over: 0.9, lift: 0.7 };
  const upper: Tier = { w: lower.w - 3.2, d: lower.d - 3.2, h: 1.95, y: 6.75, over: 0.8, lift: 0.6 };
  for (const t of [lower, upper]) {
    const top = t === upper;
    const r = vietRoof({ w: t.w, d: t.d, h: t.h, overhang: t.over, lift: t.lift, color: '#b5503a', dragons: top, pearl: top });
    r.rotation.y = Math.PI / 2;
    r.position.set(T.x, t.y, MID_Z);
    roof.add(r);
  }
  const seen = lower.y + ((lower.d + 2 * lower.over - upper.d) / 2) * slope(lower);
  const bandTop = upper.y + upper.over * slope(upper) - 0.1;
  const band = new THREE.Group();
  addBox(band, upper.d, bandTop - seen + 0.35, upper.w, TD.frame, T.x, (seen - 0.35 + bandTop) / 2, MID_Z);
  const wy = (seen + bandTop) / 2;
  for (const [len, x, z, ry] of [
    [upper.w, T.x + upper.d / 2 + 0.002, MID_Z, Math.PI / 2],
    [upper.w, T.x - upper.d / 2 - 0.002, MID_Z, -Math.PI / 2],
    [upper.d, T.x, MID_Z + upper.w / 2 + 0.002, 0],
    [upper.d, T.x, MID_Z - upper.w / 2 - 0.002, Math.PI],
  ] as const) {
    const face = new THREE.Group();
    face.position.set(x, wy, z);
    face.rotation.y = ry;
    const n = Math.round(len / 1.9);
    for (let k = 0; k < n; k++) {
      const win = latticeWindow(len / n - 0.55, (bandTop - seen) * 0.55, darkPane);
      win.position.x = -len / 2 + (k + 0.5) * (len / n);
      face.add(win);
    }
    for (let k = 0; k <= n; k++) addBox(face, 0.16, bandTop - seen + 0.05, 0.06, TD.lacquer, -len / 2 + k * (len / n), 0, 0.03);
    addBox(face, len + 0.1, 0.12, 0.08, TD.lacquerDeep, 0, bandTop - wy - 0.06, 0.04);
    band.add(face);
  }
  roof.add(kit.mergeStatic(band, 'tang-doan-band'));
  ctx.dynamics.add(roof);

  addStatic(ctx, stat);
  ctx.dynamics.add(dyn);

  // Quầng sau khung thở nhẹ; khung vừa xong 1 lễ bừng sáng rồi dịu dần (~2,5 s). Vòng for thường: không cấp phát mỗi khung.
  const partList = [...parts.values()];
  ctx.updates.push((dt, t) => {
    shaftMat.opacity = 0.17 + Math.sin(t * 0.37) * 0.025;
    for (let i = 0; i < partList.length; i++) {
      const p = partList[i]!;
      if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt / 2.5);
      const v = p.pulse * p.pulse * (3 - 2 * p.pulse);
      p.photoMat.emissiveIntensity = PHOTO_GLOW + v * 0.85;
      p.glowMat.opacity = HALO_OPACITY + Math.sin(t * 0.9 + i * 1.3) * 0.04 + v * 0.6;
    }
  });
  return {
    roof,
    pulsePortrait(photoId) {
      const p = parts.get(photoId);
      if (p) p.pulse = 1;
    },
  };
}
