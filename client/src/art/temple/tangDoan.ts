// Điện Tăng Đoàn (thay Tăng xá cũ): nhà thờ chân dung kiểu Nhà Tổ. Hiên hai cột son, hoành phi trên cửa; trong điện
// hai hàng cột son chia gian, thảm đỏ dẫn tới bàn thờ chính (tượng Phật, đỉnh đồng, hạc chầu trên lưng rùa); 6 khám
// chân dung (3 mỗi bên tường) có án gỗ, nến, bình sen, bồ đoàn để quỳ lạy — không đặt bát hương. Ánh sáng điện ảnh: vệt nắng xiên qua
// song cửa cao, quầng nến ấm sau mỗi chân dung. Bố cục đọc từ TANG_DOAN (shared) — trùng khớp va chạm và trạm quỳ lạy.
import * as THREE from 'three';
import { TANG_DOAN } from '@shared/index';
import { GALLERY_PHOTOS, GALLERY_TITLE, PORTRAIT_CENTER_Y, PORTRAIT_HEIGHT, type GalleryPhoto } from '../../content/gallery';
import { kit } from '../kit';
import { buddhaStatue, pillar } from './buildings';
import { addStatic, flame, hangingLantern, verticalBoard, type TempleCtx } from './ctx';
import { vietRoof } from './roof';

const { geo, mat, mesh } = kit;
const T = TANG_DOAN;
const C = {
  plaster: '#d6b57a',
  dado: '#4a2a1a',
  frame: '#5a321f',
  lacquer: '#7a1d12',
  lacquerDark: '#521008',
  gold: '#e3b04b',
  goldBright: '#ffd166',
  bronze: '#8a6233',
  bronzeDark: '#4f4a35',
  floor: '#5c3420',
  carpet: '#9b2a1f',
  stone: '#bdb4a3',
  ink: '#1f120a',
};

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
const DOOR_H = 2.9;
const FLOOR_Y = 0.08;
/** Cửa sổ cao (song gỗ) phía trên mỗi khám thờ. */
const WIN = { y: 3.52, h: 0.32, w: 1.4 };
/** Đỉnh tường = chân mái. */
const WALL_TOP = 4.25;

export interface TangDoanHandles {
  roof: THREE.Group;
  /** Chân dung (theo id ảnh) bừng sáng rồi dịu lại. */
  pulsePortrait(photoId: string): void;
}

/** Texture quầng sáng tròn mềm (dùng cho quầng nến, vũng sáng trên sàn). */
function radialTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

/** Texture vệt nắng: sáng ở đầu cửa sổ, mờ dần xuống sàn, hai mép mềm. */
function shaftTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(64, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      const along = Math.pow(1 - v, 1.3) * Math.min(1, v / 0.06 + 0.25);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const edge = Math.pow(Math.sin(Math.PI * u), 1.6);
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(255 * along * edge);
      }
    }
    c.putImageData(img, 0, 0);
  });
}

/** Texture vệt nắng in trên sàn: ô cửa có song gỗ, mép mềm. */
function patchTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(256, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.85)';
    for (let k = 1; k < 6; k++) c.fillRect((k * w) / 6 - 5, 0, 10, h);
  });
}

function addBox(g: THREE.Object3D, w: number, h: number, d: number, color: string | THREE.Material, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; cast?: boolean } = {}): THREE.Mesh {
  const m = mesh(geo.box(w, h, d), typeof color === 'string' ? mat(color) : color, { x, y, z, rx: o.rx, ry: o.ry, rz: o.rz, castShadow: o.cast ?? true });
  g.add(m);
  return m;
}

/**
 * Một đoạn tường: chân tường gỗ sẫm, thân trát vàng đất, diềm gỗ trên. `inset` hạ nhẹ mặt trên chân tường/diềm của
 * tường Nam–Bắc để không trùng mặt phẳng với tường Đông–Tây ở góc (tránh nhấp nháy).
 */
function wallSegment(g: THREE.Group, x: number, z: number, w: number, d: number, y0: number, y1: number, inset = 0): void {
  const e = 0.04;
  const dadoTop = Math.min(y1, 1.0 - inset);
  if (y0 < dadoTop) addBox(g, w + (w > d ? 0 : e), dadoTop - y0, d + (w > d ? e : 0), C.dado, x, (y0 + dadoTop) / 2, z);
  const pTop = Math.min(y1, 3.75);
  const pBot = Math.max(y0, 1.0 - inset);
  if (pBot < pTop) addBox(g, w, pTop - pBot, d, C.plaster, x, (pBot + pTop) / 2, z);
  if (y1 > 3.75) addBox(g, w + (w > d ? 0 : e), y1 - 3.76 - inset, d + (w > d ? e : 0), C.frame, x, (3.76 + inset + y1 - inset) / 2, z);
}

/** Ô cửa sổ song gỗ trên tường (mặt hướng +Z cục bộ); `pane` sáng = nhìn từ trong ra trời, tối = nhìn từ ngoài vào. */
function latticeWindow(w: number, h: number, pane: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.PlaneGeometry(w, h), pane, { z: 0.004, castShadow: false }));
  const wood = mat(C.frame);
  g.add(mesh(geo.box(w + 0.12, 0.07, 0.06), wood, { y: h / 2 + 0.03, z: 0.02 }));
  g.add(mesh(geo.box(w + 0.12, 0.07, 0.06), wood, { y: -h / 2 - 0.03, z: 0.02 }));
  const n = Math.max(3, Math.round(w / 0.16));
  for (let i = 0; i <= n; i++) g.add(mesh(geo.box(0.035, h, 0.04), wood, { x: -w / 2 + (i * w) / n, z: 0.02, castShadow: false }));
  return g;
}

/** Hạc đứng trên lưng rùa (hạc chầu) — đồng, gốc tại mặt sàn, nhìn về +Z. */
function craneOnTurtle(): THREE.Group {
  const g = new THREE.Group();
  const bronze = mat(C.bronze, { metalness: 0.55, roughness: 0.42, flat: false });
  const patina = mat(C.bronzeDark, { metalness: 0.4, roughness: 0.55, flat: false });
  // Rùa: mai dẹt, đầu ngóc, bốn chân.
  g.add(mesh(geo.sphere(0.42, 16, 10), patina, { y: 0.18, scale: [1, 0.44, 1.22] }));
  g.add(mesh(geo.torus(0.4, 0.035, 6, 24), bronze, { y: 0.17, rx: Math.PI / 2, scale: [1, 1.22, 1] }));
  g.add(mesh(geo.sphere(0.12, 10, 8), patina, { y: 0.24, z: 0.56, scale: [1, 0.85, 1.25] }));
  for (const [x, z] of [
    [0.3, 0.32],
    [-0.3, 0.32],
    [0.3, -0.32],
    [-0.3, -0.32],
  ] as const) {
    g.add(mesh(geo.sphere(0.1, 8, 6), patina, { x, y: 0.07, z, scale: [1, 0.6, 1.3] }));
  }
  // Hạc: hai chân, thân, cánh khép, cổ cong, mỏ dài ngửa lên.
  for (const x of [0.08, -0.08]) g.add(mesh(geo.cyl(0.022, 0.026, 0.62, 6), bronze, { x, y: 0.62, z: -0.02 }));
  g.add(mesh(geo.sphere(0.22, 14, 10), bronze, { y: 1.02, z: 0.0, scale: [0.82, 0.86, 1.4], rx: -0.25 }));
  for (const s of [1, -1]) g.add(mesh(geo.sphere(0.2, 12, 8), bronze, { x: s * 0.14, y: 1.06, z: -0.05, scale: [0.35, 0.75, 1.45], rx: -0.3 }));
  g.add(mesh(geo.cone(0.1, 0.32, 8), bronze, { y: 0.98, z: -0.36, rx: -Math.PI / 2 - 0.5 }));
  const neck = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.14, 0.2),
    new THREE.Vector3(0, 1.4, 0.24),
    new THREE.Vector3(0, 1.62, 0.16),
    new THREE.Vector3(0, 1.78, 0.2),
  ]);
  g.add(mesh(new THREE.TubeGeometry(neck, 16, 0.045, 8, false), bronze));
  g.add(mesh(geo.sphere(0.075, 10, 8), bronze, { y: 1.8, z: 0.22, scale: [0.9, 0.9, 1.15] }));
  g.add(mesh(geo.cone(0.026, 0.3, 6), bronze, { y: 1.86, z: 0.4, rx: Math.PI / 2 - 0.45 }));
  g.add(mesh(geo.sphere(0.03, 6, 4), mat('#c0392b', { metalness: 0.2, roughness: 0.5 }), { y: 1.87, z: 0.2 }));
  return g;
}

interface ShrineParts {
  photoMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;
}

/**
 * Một khám thờ chân dung: gốc tại mặt tường trong (giữa khám, mặt sàn), nhìn ra giữa điện theo +Z cục bộ.
 * Phần tĩnh vào `stat`, phần có hoạt ảnh/vật liệu riêng vào `dyn`.
 */
function shrine(ctx: TempleCtx, stat: THREE.Group, dyn: THREE.Group, photo: GalleryPhoto | undefined, tex: { radial: THREE.Texture }, loader: THREE.TextureLoader): ShrineParts {
  const gold = mat(C.gold, { metalness: 0.55, roughness: 0.35 });
  const goldFlat = mat(C.goldBright, { metalness: 0.4, roughness: 0.4 });
  // Bảng hậu sơn son, viền vàng, ba ngọn lửa vàng trên đỉnh.
  addBox(stat, 1.86, 2.2, 0.06, C.lacquerDark, 0, 1.95, 0.03);
  addBox(stat, 1.9, 0.05, 0.03, gold, 0, 3.05, 0.07);
  addBox(stat, 1.9, 0.05, 0.03, gold, 0, 0.88, 0.07);
  for (const s of [1, -1]) addBox(stat, 0.05, 2.2, 0.03, gold, s * 0.93, 1.95, 0.07);
  for (const [x, s] of [
    [0, 0.8],
    [-0.62, 0.56],
    [0.62, 0.56],
  ] as const) {
    stat.add(mesh(geo.cone(0.07 * s, 0.24 * s, 6), goldFlat, { x, y: 3.08 + 0.12 * s, z: 0.05 }));
    stat.add(mesh(geo.sphere(0.05 * s, 8, 6), goldFlat, { x, y: 3.1, z: 0.05 }));
  }
  // Quầng nến ấm sau chân dung.
  const glowMat = new THREE.MeshBasicMaterial({ map: tex.radial, color: '#ffae5c', transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  dyn.add(mesh(new THREE.PlaneGeometry(1.8, 2.1), glowMat, { y: PORTRAIT_CENTER_Y + 0.05, z: 0.064, castShadow: false, receiveShadow: false }));

  // Khung: viền vàng ngoài, gỗ sẫm, chỉ vàng trong; ảnh hơi tự sáng để nổi trong điện tối.
  let w = PORTRAIT_HEIGHT * (photo ? photo.width / photo.height : 0.75);
  let h = PORTRAIT_HEIGHT;
  if (w > 0.98) {
    h = (h * 0.98) / w;
    w = 0.98;
  }
  const fy = PORTRAIT_CENTER_Y;
  const fz = 0.1;
  const ring = (inner: number, band: number, depth: number, m: THREE.Material, z: number) => {
    const ow = w + inner * 2;
    const oh = h + inner * 2;
    addBox(stat, ow + band * 2, band, depth, m, 0, fy + oh / 2 + band / 2, z);
    addBox(stat, ow + band * 2, band, depth, m, 0, fy - oh / 2 - band / 2, z);
    addBox(stat, band, oh, depth, m, -ow / 2 - band / 2, fy, z);
    addBox(stat, band, oh, depth, m, ow / 2 + band / 2, fy, z);
  };
  ring(0.0, 0.025, 0.04, goldFlat, fz + 0.01);
  ring(0.025, 0.08, 0.07, mat('#2e1a10'), fz);
  ring(0.105, 0.05, 0.08, gold, fz - 0.005);
  const photoMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.16 });
  if (photo) {
    const t = loader.load(photo.url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    photoMat.map = t;
    photoMat.emissiveMap = t;
  }
  dyn.add(mesh(new THREE.PlaneGeometry(w, h), photoMat, { y: fy, z: fz, castShadow: false }));
  if (photo?.caption) {
    const plate = kit.signBoard(photo.caption, { width: Math.max(0.7, w * 0.9), height: 0.15, bg: '#8a6a2a', border: '#ffe08a', color: '#fff3c4', depth: 0.02 });
    plate.position.set(0, fy - h / 2 - 0.24, fz + 0.01);
    dyn.add(plate);
  }

  // Án gỗ sơn son thếp vàng (khu treo ảnh không đặt bát hương).
  const d = T.shrineTable.d;
  addBox(stat, T.shrineTable.w, 0.8, d - 0.02, C.lacquer, 0, 0.4, d / 2);
  addBox(stat, T.shrineTable.w + 0.08, 0.06, d + 0.04, C.lacquerDark, 0, 0.83, d / 2);
  addBox(stat, T.shrineTable.w - 0.04, 0.05, 0.02, gold, 0, 0.7, d);
  for (const s of [1, -1]) addBox(stat, 0.04, 0.76, 0.02, gold, s * (T.shrineTable.w / 2 - 0.03), 0.4, d);
  stat.add(mesh(geo.torus(0.11, 0.022, 6, 18), gold, { y: 0.42, z: d + 0.01 }));
  const top = 0.86;
  // Đôi chân nến đồng + nến sáp.
  const brass = mat('#c99a45', { metalness: 0.6, roughness: 0.35, flat: false });
  for (const x of [-0.56, 0.56]) {
    stat.add(mesh(geo.cyl(0.06, 0.08, 0.03, 12), brass, { x, y: top + 0.015, z: 0.38 }));
    stat.add(mesh(geo.cyl(0.018, 0.022, 0.18, 8), brass, { x, y: top + 0.12, z: 0.38 }));
    stat.add(mesh(geo.cyl(0.05, 0.03, 0.03, 12), brass, { x, y: top + 0.225, z: 0.38 }));
    stat.add(mesh(geo.cyl(0.032, 0.032, 0.2, 10), mat('#f4e2bf', { roughness: 0.6, flat: false }), { x, y: top + 0.34, z: 0.38 }));
    flame(ctx, dyn, x, top + 0.48, 0.38, 1.1);
  }
  // Bình sen + mâm quả.
  stat.add(mesh(geo.lathe([[0, 0], [0.06, 0.01], [0.09, 0.1], [0.05, 0.2], [0.07, 0.26]], 12), mat('#eef2f8', { roughness: 0.3, flat: false }), { x: -0.3, y: top, z: 0.16 }));
  for (let i = 0; i < 3; i++) stat.add(mesh(geo.ico(0.055, 0), mat('#f39bb8'), { x: -0.3 + (i - 1) * 0.05, y: top + 0.36 + (i % 2) * 0.06, z: 0.16 }));
  stat.add(mesh(geo.cyl(0.17, 0.1, 0.04, 14), gold, { x: 0.3, y: top + 0.02, z: 0.16 }));
  ['#ffb627', '#b7d653', '#d4246f', '#ffd84a', '#f59a2c'].forEach((col, i) =>
    stat.add(mesh(geo.sphere(0.055, 8, 6), mat(col), { x: 0.3 + Math.cos(i * 1.26) * 0.08, y: top + 0.08, z: 0.16 + Math.sin(i * 1.26) * 0.08 })),
  );

  // Chiếu + bồ đoàn để quỳ, vũng sáng nến trên sàn.
  stat.add(mesh(geo.box(0.95, 0.012, 0.82), mat('#b8955a'), { y: FLOOR_Y + 0.006, z: T.kneelOff }));
  stat.add(mesh(geo.cyl(0.3, 0.34, 0.12, 20), mat('#c27a2c', { flat: false }), { y: FLOOR_Y + 0.07, z: T.kneelOff }));
  const pool = new THREE.MeshBasicMaterial({ map: tex.radial, color: '#ff9f4a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  dyn.add(mesh(new THREE.PlaneGeometry(2.0, 1.8).rotateX(-Math.PI / 2), pool, { y: FLOOR_Y + 0.016, z: 0.95, castShadow: false, receiveShadow: false }));
  return { photoMat, glowMat };
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

export function buildTangDoan(ctx: TempleCtx, sunDir: THREE.Vector3): TangDoanHandles {
  const stat = new THREE.Group();
  const dyn = new THREE.Group();
  const tex = { radial: radialTexture() };
  const loader = new THREE.TextureLoader();
  const litPane = new THREE.MeshBasicMaterial({ color: '#ffe9c4' });
  const darkPane = mat('#2a160c');

  // ── Nền, sàn gỗ, thảm đỏ, bậc cửa ──
  addBox(stat, OUT_E - OUT_W + 0.8, 0.06, OUT_S - OUT_N + 0.8, C.stone, T.x, 0.03, MID_Z);
  addBox(stat, IN_E - IN_W, 0.02, IN_S - IN_N, C.floor, T.x, FLOOR_Y - 0.01, MID_Z);
  for (let i = 1; i < 12; i++) addBox(stat, 0.02, 0.005, IN_S - IN_N, '#45261a', IN_W + (i * (IN_E - IN_W)) / 12, FLOOR_Y + 0.0025, MID_Z, { cast: false });
  const carpetLen = IN_S - (IN_N + 1.7);
  const carpetZ = IN_S - carpetLen / 2;
  addBox(stat, 2.2, 0.012, carpetLen, C.carpet, T.x, FLOOR_Y + 0.006, carpetZ, { cast: false });
  for (const s of [1, -1]) addBox(stat, 0.08, 0.014, carpetLen, C.gold, T.x + s * 1.06, FLOOR_Y + 0.007, carpetZ, { cast: false });
  addBox(stat, T.doorW + 1.0, 0.05, 0.7, C.stone, T.x, 0.025, OUT_S + 0.35);
  addBox(stat, T.doorW + 0.4, 0.1, 0.5, '#a8a092', T.x, 0.05, T.zSouth, { cast: false });

  // ── Tường (cửa giữa mặt Nam), cột gỗ mặt ngoài, khung cửa ──
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
    addBox(stat, 0.36, WALL_TOP + 0.05, 0.36, C.frame, x, (WALL_TOP + 0.05) / 2, z);
  }
  for (const z of T.colZs) {
    addBox(stat, 0.24, 3.9, 0.24, C.frame, OUT_W, 1.95, z);
    addBox(stat, 0.24, 3.9, 0.24, C.frame, OUT_E, 1.95, z);
    // Cột ốp tường phía trong — chia nhịp các khám thờ.
    addBox(stat, 0.14, 3.7, 0.26, C.frame, IN_W + 0.07, 1.9, z);
    addBox(stat, 0.14, 3.7, 0.26, C.frame, IN_E - 0.07, 1.9, z);
  }
  for (const x of [DOOR_L, DOOR_R]) addBox(stat, 0.2, DOOR_H + 0.1, T.wall + 0.12, C.lacquer, x, (DOOR_H + 0.1) / 2, T.zSouth);
  addBox(stat, T.doorW + 0.6, 0.24, T.wall + 0.14, C.lacquer, T.x, DOOR_H + 0.12, T.zSouth);
  addBox(stat, T.doorW + 0.62, 0.06, T.wall + 0.16, C.gold, T.x, DOOR_H + 0.02, T.zSouth);
  // Hai cánh cửa mở áp vào tường trong, đinh vàng.
  for (const s of [-1, 1]) {
    const hinge = s < 0 ? DOOR_L : DOOR_R;
    const cx = hinge + s * 0.6;
    addBox(stat, 1.18, DOOR_H - 0.06, 0.07, C.lacquer, cx, (DOOR_H - 0.06) / 2, IN_S - 0.05);
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 4; k++) stat.add(mesh(geo.sphere(0.025, 6, 4), mat(C.goldBright, { metalness: 0.5, roughness: 0.4 }), { x: cx - 0.36 + i * 0.36, y: 0.55 + k * 0.6, z: IN_S - 0.09 }));
  }

  // ── Cửa sổ: song cao trên mỗi khám (hai mặt), cửa tròn mặt tiền ──
  for (const z of T.shrineZs) {
    for (const [x, ryIn, ryOut] of [
      [IN_W, Math.PI / 2, -Math.PI / 2],
      [IN_E, -Math.PI / 2, Math.PI / 2],
    ] as const) {
      const inner = latticeWindow(WIN.w, WIN.h, litPane);
      inner.position.set(x + (x < T.x ? 0.001 : -0.001), WIN.y, z);
      inner.rotation.y = ryIn;
      stat.add(inner);
      const outer = latticeWindow(WIN.w, WIN.h, darkPane);
      outer.position.set(x < T.x ? OUT_W - 0.001 : OUT_E + 0.001, WIN.y, z);
      outer.rotation.y = ryOut;
      stat.add(outer);
    }
  }
  const roundWin = (x: number, z: number, ry: number, lit: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, 2.15, z);
    g.rotation.y = ry;
    g.add(mesh(new THREE.CircleGeometry(0.56, 24), lit ? litPane : darkPane, { z: 0.004, castShadow: false }));
    g.add(mesh(geo.torus(0.6, 0.07, 6, 24), mat(C.lacquer), { z: 0.03 }));
    for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) g.add(mesh(geo.box(1.1, 0.04, 0.04), mat(C.frame), { z: 0.03, rz: a, castShadow: false }));
    g.add(mesh(geo.torus(0.26, 0.03, 4, 16), mat(C.gold), { z: 0.04 }));
    stat.add(g);
  };
  const roundXs = [(IN_W + DOOR_L) / 2, (DOOR_R + IN_E) / 2];
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
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTexture(), color: '#ffd896', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const floorHit = (from: THREE.Vector3) => (from.y - FLOOR_Y) / -dir.y;
  const shafts: [THREE.Vector3, number][] = [
    ...T.shrineZs.map((z) => [new THREE.Vector3(IN_E - 0.05, WIN.y, z), WIN.w * 0.85] as [THREE.Vector3, number]),
    ...roundXs.map((x) => [new THREE.Vector3(x, 2.15, IN_S - 0.05), 0.95] as [THREE.Vector3, number]),
  ];
  for (const [from, width] of shafts) {
    const len = floorHit(from);
    lightShaft(dyn, from, dir, len, width, shaftMat);
    const hit = from.clone().addScaledVector(dir, len);
    const patch = mesh(new THREE.PlaneGeometry(width * 1.15, width * 0.8).rotateX(-Math.PI / 2), patchMat, {
      x: hit.x,
      y: FLOOR_Y + 0.02,
      z: hit.z,
      ry: Math.atan2(dir.x, dir.z) + Math.PI / 2,
      castShadow: false,
      receiveShadow: false,
    });
    dyn.add(patch);
  }

  // ── Hai hàng cột son trong điện + xà dọc, xà ngang, đèn lồng giữa gian ──
  for (const z of T.colZs) {
    for (const s of [-1, 1]) {
      pillar(stat, T.x + s * T.colX, z, 3.75, 0.22, '#9a3424');
      stat.add(mesh(geo.torus(0.27, 0.045, 5, 16), mat(C.gold), { x: T.x + s * T.colX, y: 2.4, z, rx: Math.PI / 2 }));
    }
    addBox(stat, IN_E - IN_W, 0.28, 0.24, C.lacquerDark, T.x, 4.2, z);
  }
  for (const s of [-1, 1]) addBox(stat, 0.26, 0.3, IN_S - IN_N, C.lacquerDark, T.x + s * T.colX, 4.03, MID_Z);
  // Đèn lồng giữa gian (không treo gần bàn thờ chính để khỏi che hoành phi khi nhìn từ cửa).
  for (const z of [-27.4, -31.2]) hangingLantern(ctx, T.x, 3.4, z, '#d9352b', 1.05);

  // ── Sáu khám thờ chân dung ──
  const parts = new Map<string, ShrineParts>();
  ([
    [IN_W, Math.PI / 2],
    [IN_E, -Math.PI / 2],
  ] as const).forEach(([x, ry], side) =>
    T.shrineZs.forEach((z, k) => {
      const n = side * T.shrineZs.length + k + 1;
      const photo = GALLERY_PHOTOS[n - 1];
      const sg = new THREE.Group();
      sg.position.set(x, 0, z);
      sg.rotation.y = ry;
      const dg = sg.clone(false);
      parts.set(`portrait_${n}`, shrine(ctx, sg, dg, photo, tex, loader));
      stat.add(sg);
      ctx.dynamics.add(dg);
    }),
  );

  // ── Bàn thờ chính (tường Bắc): phông sơn son, hoành phi, câu đối, tượng Phật, đỉnh đồng, chân nến, hạc chầu ──
  const altar = new THREE.Group();
  altar.position.set(T.x, 0, IN_N);
  const altarDyn = altar.clone(false);
  addBox(altar, 4.4, 0.3, 1.6, C.lacquerDark, 0, 0.15, 0.8);
  addBox(altar, 4.46, 0.04, 1.64, C.gold, 0, 0.31, 0.8);
  addBox(altar, 3.4, 0.75, 1.0, C.lacquer, 0, 0.705, 0.55);
  addBox(altar, 3.5, 0.06, 1.08, C.lacquerDark, 0, 1.11, 0.55);
  addBox(altar, 3.3, 0.06, 0.02, C.gold, 0, 0.95, 1.06);
  addBox(altar, 5.2, 3.3, 0.06, C.lacquerDark, 0, 2.0, 0.03);
  for (const [w, h, x, y] of [
    [5.26, 0.07, 0, 3.65],
    [5.26, 0.07, 0, 0.35],
    [0.07, 3.3, -2.6, 2.0],
    [0.07, 3.3, 2.6, 2.0],
  ] as const) {
    addBox(altar, w, h, 0.04, mat(C.gold, { metalness: 0.5, roughness: 0.4 }), x, y, 0.07);
  }
  altar.add(mesh(geo.torus(1.55, 0.05, 6, 40, Math.PI), mat(C.gold, { metalness: 0.5, roughness: 0.4 }), { y: 1.75, z: 0.08 }));
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    altar.add(mesh(geo.sphere(0.055, 8, 6), mat(C.goldBright, { metalness: 0.4, roughness: 0.4 }), { x: Math.cos(a) * 1.55, y: 1.75 + Math.sin(a) * 1.55, z: 0.1 }));
  }
  const board = kit.signBoard(GALLERY_TITLE.toUpperCase(), { width: 3.3, height: 0.6, bg: C.ink, border: C.gold, color: C.goldBright, depth: 0.08 });
  board.position.set(0, 3.42, 0.14);
  altar.add(board);
  for (const [x, text] of [
    [-2.3, 'Đồng Tu Đồng Hành'],
    [2.3, 'Tình Bạn Bền Lâu'],
  ] as const) {
    const b = verticalBoard(text, 0.34, 2.1, C.ink, C.goldBright);
    b.position.set(x, 1.9, 0.1);
    altar.add(b);
  }
  // Đỉnh đồng ba chân lớn đặt trên bậc trước bàn thờ.
  const bronze = mat(C.bronze, { metalness: 0.6, roughness: 0.38, flat: false });
  const burner = new THREE.Group();
  burner.position.set(0, 0.33, 1.3);
  burner.scale.setScalar(1.35);
  burner.add(mesh(geo.lathe([[0, 0], [0.2, 0.02], [0.27, 0.16], [0.24, 0.3], [0.17, 0.34]], 16), bronze, { y: 0.1 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    burner.add(mesh(geo.cyl(0.035, 0.025, 0.12, 6), bronze, { x: Math.cos(a) * 0.17, y: 0.06, z: Math.sin(a) * 0.17 }));
  }
  burner.add(mesh(geo.lathe([[0.19, 0], [0.16, 0.08], [0.08, 0.16], [0, 0.18]], 16), bronze, { y: 0.44 }));
  burner.add(mesh(geo.sphere(0.06, 10, 8), mat(C.goldBright, { metalness: 0.5, roughness: 0.35 }), { y: 0.66 }));
  for (const s of [1, -1]) burner.add(mesh(geo.torus(0.07, 0.015, 4, 10), bronze, { x: s * 0.28, y: 0.3, ry: Math.PI / 2 }));
  altar.add(burner);
  // Chân nến cao + bình sen hai bên.
  for (const s of [1, -1]) {
    const x = s * 1.3;
    altar.add(mesh(geo.lathe([[0.12, 0], [0.04, 0.05], [0.035, 0.5], [0.09, 0.55], [0.1, 0.58]], 12), bronze, { x, y: 1.14, z: 0.75 }));
    altar.add(mesh(geo.cyl(0.05, 0.05, 0.32, 10), mat('#f4e2bf', { roughness: 0.6, flat: false }), { x, y: 1.88, z: 0.75 }));
    flame(ctx, altarDyn, x, 2.1, 0.75, 1.6);
    altar.add(mesh(geo.lathe([[0, 0], [0.08, 0.01], [0.12, 0.14], [0.07, 0.3], [0.1, 0.38]], 12), mat('#eef2f8', { roughness: 0.3, flat: false }), { x: s * 0.72, y: 1.14, z: 0.55 }));
    for (let i = 0; i < 3; i++) altar.add(mesh(geo.ico(0.07, 0), mat('#f39bb8'), { x: s * 0.72 + (i - 1) * 0.07, y: 1.6 + (i % 2) * 0.08, z: 0.55 }));
  }
  // Tượng gắn lưới khi Web Worker dựng xong → để ở nhóm động (nhóm tĩnh đã gộp mesh từ lúc dựng map).
  const buddha = buddhaStatue(ctx);
  buddha.group.position.set(0, 1.14, 0.56);
  buddha.group.scale.setScalar(0.36);
  altarDyn.add(buddha.group);
  const haloMat = new THREE.MeshBasicMaterial({ map: tex.radial, color: '#ffc46b', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  altarDyn.add(mesh(new THREE.PlaneGeometry(2.0, 2.0), haloMat, { y: 2.24, z: 0.1, castShadow: false, receiveShadow: false }));
  for (const s of [1, -1]) {
    const crane = craneOnTurtle();
    crane.position.set(s * 2.75, FLOOR_Y, 1.15);
    crane.rotation.y = -s * 0.35;
    altar.add(crane);
  }
  stat.add(altar);
  ctx.dynamics.add(altarDyn);
  const burnerTop = new THREE.Vector3(T.x, 0.33 + 0.72 * 1.35, IN_N + 1.3);
  let burnAcc = 0;
  ctx.updates.push((dt, t) => {
    burnAcc += dt;
    if (burnAcc > 0.5) {
      burnAcc = 0;
      ctx.smoke?.(burnerTop.x, burnerTop.y, burnerTop.z, 0.45);
    }
    haloMat.opacity = 0.5 + Math.sin(t * 1.3) * 0.06;
    shaftMat.opacity = 0.19 + Math.sin(t * 0.37) * 0.025;
  });

  // ── Hiên: hai cột son, câu đối, hoành phi "ĐIỆN TĂNG ĐOÀN", đèn lồng hai bên (không che chữ) ──
  // Xà hiên đặt cao hơn tầm nhìn tới hoành phi (không che chữ).
  for (const s of [-1, 1]) pillar(stat, T.x + s * T.porchX, T.porchZ, 3.55, 0.22);
  addBox(stat, T.porchX * 2 + 0.5, 0.22, 0.22, C.lacquerDark, T.x, 3.86, T.porchZ);
  for (const s of [-1, 1]) addBox(stat, 0.18, 0.18, OUT_S - T.porchZ + 0.3, C.lacquerDark, T.x + s * T.porchX, 3.66, (OUT_S + T.porchZ) / 2 - 0.1);
  const porchRoof = vietRoof({ w: T.porchX * 2 + 1.2, d: 1.3, h: 0.8, overhang: 0.45, lift: 0.3, color: '#b5503a', pearl: false });
  porchRoof.position.set(T.x, 3.6, T.porchZ - 0.05);
  ctx.dynamics.add(porchRoof);
  const plaque = kit.signBoard('ĐIỆN TĂNG ĐOÀN', { width: 2.5, height: 0.55, bg: C.ink, border: C.gold, color: C.goldBright, depth: 0.08 });
  plaque.position.set(T.x, 3.45, OUT_S + 0.02);
  stat.add(plaque);
  for (const [s, text] of [
    [-1, 'Tu Online Hội Ngộ'],
    [1, 'Tăng Đoàn Lưu Danh'],
  ] as const) {
    const b = verticalBoard(text, 0.3, 2.0, C.ink, C.goldBright);
    b.position.set(T.x + s * T.porchX, 1.95, T.porchZ + 0.24);
    stat.add(b);
  }
  for (const s of [-1, 1]) hangingLantern(ctx, T.x + s * (T.porchX + 1.3), 3.05, T.porchZ + 0.45, '#e0352b', 0.85);

  // ── Tủ áo (sát mặt tiền, bên phải cửa) ──
  const wardrobe = new THREE.Group();
  wardrobe.position.set(35.3, 0, -23.9);
  addBox(wardrobe, 2.0, 2.2, 0.72, '#8a5a3b', 0, 1.1, 0);
  addBox(wardrobe, 2.1, 0.12, 0.8, C.frame, 0, 2.26, 0);
  addBox(wardrobe, 0.03, 1.9, 0.02, C.frame, 0, 1.15, 0.37);
  for (const x of [-0.12, 0.12]) wardrobe.add(mesh(geo.sphere(0.04, 6, 4), mat(C.goldBright), { x, y: 1.15, z: 0.4 }));
  for (const x of [-0.5, 0.5]) addBox(wardrobe, 0.7, 1.5, 0.02, '#a0703f', x, 1.2, 0.365);
  const wPlaque = kit.signBoard('TỦ ÁO', { width: 0.8, height: 0.22, bg: C.frame, border: C.gold, color: C.goldBright, depth: 0.02 });
  wPlaque.position.set(0, 2.05, 0.38);
  wardrobe.add(wPlaque);
  stat.add(wardrobe);

  // ── Ánh sáng ấm trong điện (không đổ bóng), mái hai lớp ──
  const nave = new THREE.PointLight('#ffc887', 6, 10, 1.8);
  nave.position.set(T.x, 3.0, MID_Z + 1);
  const altarLight = new THREE.PointLight('#ffab5e', 4.5, 7, 1.8);
  altarLight.position.set(T.x, 2.3, IN_N + 2.2);
  ctx.lights.push(nave, altarLight);

  const roof = new THREE.Group();
  const main = vietRoof({ w: OUT_S - OUT_N, d: OUT_E - OUT_W, h: 2.8, overhang: 0.9, lift: 0.8, color: '#b5503a', dragons: true });
  main.rotation.y = Math.PI / 2;
  main.position.set(T.x, 4.25, MID_Z);
  roof.add(main);
  ctx.dynamics.add(roof);

  addStatic(ctx, stat);
  ctx.dynamics.add(dyn);

  // Chân dung bừng sáng khi xong 1 lễ lạy rồi dịu dần (~2,5 s).
  const pulses = new Map<string, number>();
  ctx.updates.push((dt) => {
    for (const [id, p] of pulses) {
      const v = Math.max(0, p - dt / 2.5);
      const part = parts.get(id);
      if (part) {
        part.photoMat.emissiveIntensity = 0.16 + v * 0.75;
        part.glowMat.opacity = 0.42 + v * 0.55;
      }
      if (v <= 0) pulses.delete(id);
      else pulses.set(id, v);
    }
  });
  return {
    roof,
    pulsePortrait(photoId) {
      if (parts.has(photoId)) pulses.set(photoId, 1);
    },
  };
}
