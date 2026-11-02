// Điện Tăng Đoàn — chi tiết trang trí: bảng màu, texture vẽ bằng canvas (bảng tên lĩnh vực, băng rôn tuyên dương đỏ chữ
// vàng, Bảng Vàng vinh danh khi không treo ảnh), pháp luân thếp vàng trên đài sen, khung vinh danh Sư Thầy (phông son,
// khung vàng chạm, bảng tên lĩnh vực + khẩu hiệu, bảng tên, hai băng rôn, quầng sáng vàng) kèm kệ ống quẻ + khay lá quẻ +
// chiếu quỳ, cột son đai vàng, bệ Bảng Vàng ba bậc và trụ đèn hoa sen vàng. Phần đứng yên vào nhóm tĩnh (gộp mesh), phần
// sáng/động vào nhóm động. Mọi kích thước khớp TANG_DOAN (shared) — kệ đúng ô va chạm `shrine_table`, chiếu quỳ đúng trạm.
import * as THREE from 'three';
import { TANG_DOAN } from '@shared/index';
import { FORTUNE_DOMAINS, type FortuneDomain } from '../../content/fortunes/domains';
import { GALLERY_TITLE, HONOUR_BOARD_PHOTO, PORTRAIT_CENTER_Y, PORTRAIT_HEIGHT, type GalleryPhoto } from '../../content/gallery';
import { kit } from '../kit';
import { PD, gilt, glowCard } from './phapDuongDecor';

const { geo, mat, mesh } = kit;
const T = TANG_DOAN;

/** Bảng màu Điện Tăng Đoàn: son tươi, vàng thếp, trát sáng (màu gỗ/đá/trát/vải trùng bảng PBR nên tự có texture). */
export const TD = {
  plaster: '#e9d3a3',
  lacquer: '#8a1f14',
  lacquerDeep: '#7a1d12',
  lacquerDark: '#6e1a12',
  dado: '#7a1f12',
  frame: '#5a321f',
  stone: '#bdb4a3',
  stoneLight: '#cfc8ba',
  stoneDark: '#a8a092',
  grout: '#8f877a',
  carpet: '#9b2a1f',
  saffron: '#c27a2c',
  bamboo: '#c8a064',
  gold: PD.gold,
  goldBright: PD.goldBright,
  ink: PD.ink,
};

/** Độ tự sáng nền của ảnh chân dung và độ đậm nền của quầng sáng sau khung (lúc chưa bừng sáng). */
export const PHOTO_GLOW = 0.34;
export const HALO_OPACITY = 0.36;

/** Hộp `w × h × d` tâm (x, y, z) thêm vào `g`. */
export function addBox(g: THREE.Object3D, w: number, h: number, d: number, m: string | THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const o = mesh(geo.box(w, h, d), typeof m === 'string' ? mat(m) : m, { x, y, z, castShadow: cast });
  g.add(o);
  return o;
}

/** Bốn thanh khung quanh ô `w × h` tâm (0, cy): cách mép ô `inner`, bản rộng `band`, dày `depth`, tâm theo Z tại `z`. */
export function frameRing(g: THREE.Object3D, w: number, h: number, inner: number, band: number, depth: number, m: THREE.Material, cy: number, z: number): void {
  const ow = w + inner * 2;
  const oh = h + inner * 2;
  addBox(g, ow + band * 2, band, depth, m, 0, cy + oh / 2 + band / 2, z);
  addBox(g, ow + band * 2, band, depth, m, 0, cy - oh / 2 - band / 2, z);
  addBox(g, band, oh, depth, m, -ow / 2 - band / 2, cy, z);
  addBox(g, band, oh, depth, m, ow / 2 + band / 2, cy, z);
}

// ── Texture vẽ bằng canvas ──

/** Viết chữ theo `textAlign` hiện tại, tự thu nhỏ cỡ chữ cho vừa bề rộng `maxW`. */
function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, weight = 800): void {
  let s = size;
  c.font = `${weight} ${s}px ${kit.FONT_TITLE}`;
  while (c.measureText(text).width > maxW && s > 10) {
    s -= 2;
    c.font = `${weight} ${s}px ${kit.FONT_TITLE}`;
  }
  c.fillText(text, x, y);
}

/** Hình thoi tô bằng `fillStyle` hiện tại (điểm nhấn trên đường kẻ). */
function diamond(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x + r, y);
  c.lineTo(x, y + r);
  c.lineTo(x - r, y);
  c.closePath();
  c.fill();
}

/** Huy hiệu tròn mang màu lĩnh vực: viền vàng, nhuỵ kem. */
function medallion(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = '#f0c055';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r * 0.74, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff2c8';
  c.beginPath();
  c.arc(x, y, r * 0.24, 0, Math.PI * 2);
  c.fill();
}

/** Bảng tên lĩnh vực trên khung chân dung: nền son mài, viền vàng kép, tên lĩnh vực chữ vàng lớn, khẩu hiệu 4 chữ dưới. */
function titleBoardTexture(d: FortuneDomain | undefined): THREE.CanvasTexture {
  return kit.canvasTexture(640, 200, (c, w, h) => {
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#7e170e');
    bg.addColorStop(0.5, '#b3301f');
    bg.addColorStop(1, '#6e130b');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f0c055';
    c.lineWidth = 10;
    c.strokeRect(5, 5, w - 10, h - 10);
    c.lineWidth = 3;
    c.strokeRect(20, 20, w - 40, h - 40);
    for (const x of [64, w - 64]) medallion(c, x, h / 2, 27, d?.color ?? '#c8102e');
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(30, 0, 0, 0.6)';
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    c.fillStyle = '#ffd35e';
    fitText(c, (d?.short ?? 'Sư Thầy').toUpperCase(), w / 2, 80, w - 200, 86);
    c.fillStyle = '#ffeec4';
    fitText(c, d?.motto ?? 'Tuyên Dương', w / 2, 152, w - 210, 40, 700);
    c.restore();
  });
}

/** Băng rôn tuyên dương dọc: lụa son, viền vàng, diềm vàng đầu băng, hoa sen vàng, chữ vàng xếp dọc, đuôi én (alphaTest). */
function honourBannerTexture(text: string): THREE.CanvasTexture {
  return kit.canvasTexture(128, 896, (c, w, h) => {
    const body = h - 64;
    const silk = c.createLinearGradient(0, 0, w, 0);
    silk.addColorStop(0, '#8a170e');
    silk.addColorStop(0.5, '#c8342a');
    silk.addColorStop(1, '#8a170e');
    c.fillStyle = silk;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(w / 2, body + 4);
    c.lineTo(0, h);
    c.closePath();
    c.fill();
    c.fillStyle = '#eab84e';
    c.fillRect(7, 56, 6, body - 56);
    c.fillRect(w - 13, 56, 6, body - 56);
    c.fillRect(0, 0, w, 56);
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo((i * w) / 4, 56);
      c.lineTo(((i + 0.5) * w) / 4, 78);
      c.lineTo(((i + 1) * w) / 4, 56);
      c.fill();
    }
    c.fillStyle = '#9b2a1f';
    c.fillRect(0, 44, w, 5);
    c.fillStyle = '#f2c35a';
    c.save();
    c.translate(w / 2, 122);
    for (let i = -2; i <= 2; i++) {
      c.save();
      c.rotate(i * 0.42);
      c.beginPath();
      c.ellipse(0, -13, 8, 19, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.restore();
    const words = text.split(' ');
    const top = 166;
    const step = (body - 30 - top) / words.length;
    c.font = `800 ${Math.min(w * 0.32, step * 0.6)}px ${kit.FONT_TITLE}`;
    c.fillStyle = '#ffd35e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    words.forEach((wd, i) => c.fillText(wd, w / 2, top + (i + 0.5) * step, w - 30));
    c.fillStyle = '#eab84e';
    c.fillRect(0, body - 12, w, 6);
  });
}

/**
 * Bảng Vàng vinh danh: nền son, viền vàng kép, góc mây; tên Tăng đoàn, dòng "VINH DANH CHƯ TĂNG", sáu lĩnh vực chia hai
 * cột (trái = chân dung 1–3 tường Tây, phải = 4–6 tường Đông — đúng phía khi đứng giữa điện nhìn vào bệ).
 */
function bangVangTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(1024, 868, (c, w, h) => {
    const bg = c.createRadialGradient(w / 2, h * 0.4, 40, w / 2, h / 2, w * 0.72);
    bg.addColorStop(0, '#c63c25');
    bg.addColorStop(0.6, '#9c2416');
    bg.addColorStop(1, '#5e100a');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f0c055';
    c.lineWidth = 18;
    c.strokeRect(9, 9, w - 18, h - 18);
    c.lineWidth = 4;
    c.strokeRect(38, 38, w - 76, h - 76);
    c.lineWidth = 5;
    for (const [x, y] of [
      [72, 72],
      [w - 72, 72],
      [72, h - 72],
      [w - 72, h - 72],
    ] as const) {
      for (const r of [22, 9]) {
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.save();
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.shadowColor = 'rgba(40, 0, 0, 0.6)';
    c.shadowBlur = 10;
    c.shadowOffsetY = 3;
    c.fillStyle = '#ffd56b';
    fitText(c, GALLERY_TITLE.toUpperCase(), w / 2, 134, w - 200, 96);
    c.fillStyle = '#fff0c4';
    fitText(c, 'VINH DANH CHƯ TĂNG', w / 2, 236, w - 380, 52);
    c.restore();
    c.fillStyle = '#f0c055';
    c.fillRect(170, 296, w - 340, 4);
    for (const [x, r] of [
      [w / 2, 14],
      [170, 8],
      [w - 170, 8],
    ] as const) {
      diamond(c, x, 298, r);
    }
    c.fillRect(w / 2 - 2, 352, 4, 400);
    c.save();
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.shadowColor = 'rgba(40, 0, 0, 0.55)';
    c.shadowBlur = 6;
    c.shadowOffsetY = 2;
    FORTUNE_DOMAINS.forEach((d, i) => {
      const left = i < 3 ? 92 : w / 2 + 52;
      const y = 398 + (i % 3) * 140;
      medallion(c, left + 30, y + 14, 28, d.color);
      c.fillStyle = '#ffd56b';
      fitText(c, d.short.toUpperCase(), left + 80, y - 6, w / 2 - 176, 58);
      c.fillStyle = '#ffe6b0';
      fitText(c, d.motto, left + 82, y + 44, w / 2 - 178, 32, 600);
    });
    c.restore();
    c.fillStyle = '#f0c055';
    c.fillRect(170, h - 90, w - 340, 3);
    diamond(c, w / 2, h - 89, 10);
  });
}

/** Ảnh treo trên Bảng Vàng (tải nền, lọc như ảnh chân dung). */
function photoTexture(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── Chi tiết thếp vàng ──

/** Vòng cánh sen quanh trục đứng (x, z): `count` cánh dẹt ngả ra ngoài góc `tilt`, tâm vòng cao `y`, bán kính `r`. */
function petalRing(g: THREE.Object3D, x: number, y: number, z: number, r: number, count: number, size: number, tilt: number, m: THREE.Material): void {
  const petal = geo.sphere(size, 8, 6);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    pivot.rotation.y = Math.PI / 2 - a;
    pivot.add(mesh(petal, m, { rx: tilt, scale: [0.62, 1.5, 0.3], castShadow: false }));
    g.add(pivot);
  }
}

/** Pháp luân thếp vàng tám nan trên đài sen, ngọc báu trên đỉnh: tâm bánh xe (x, y, z), bán kính `r`, mặt hướng +Z. */
export function dharmaWheel(g: THREE.Object3D, x: number, y: number, z: number, r: number): void {
  const gold = gilt();
  const bright = gilt(true);
  g.add(mesh(geo.torus(r, r * 0.1, 6, 32), bright, { x, y, z }));
  g.add(mesh(geo.torus(r * 0.3, r * 0.07, 6, 16), gold, { x, y, z }));
  g.add(mesh(geo.cyl(r * 0.14, r * 0.14, r * 0.26, 12), bright, { x, y, z, rx: Math.PI / 2 }));
  const spoke = geo.box(r * 0.07, r * 0.64, r * 0.07);
  const knob = geo.sphere(r * 0.09, 8, 6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.add(mesh(spoke, gold, { x: x + Math.cos(a) * r * 0.64, y: y + Math.sin(a) * r * 0.64, z, rz: a - Math.PI / 2 }));
    g.add(mesh(knob, bright, { x: x + Math.cos(a) * r * 1.13, y: y + Math.sin(a) * r * 1.13, z }));
  }
  const base = y - r * 1.32;
  g.add(mesh(geo.lathe([[0, 0], [r * 0.24, 0], [r * 0.34, r * 0.12], [r * 0.6, r * 0.3], [r * 0.64, r * 0.36], [0, r * 0.36]], 16), gold, { x, y: base, z }));
  petalRing(g, x, base + r * 0.36, z, r * 0.5, 8, r * 0.2, 0.45, bright);
  g.add(mesh(geo.sphere(r * 0.13, 10, 8), bright, { x, y: y + r * 1.34, z }));
  g.add(mesh(geo.cone(r * 0.09, r * 0.3, 8), bright, { x, y: y + r * 1.55, z }));
}

/** Cột son: chân tảng sen đá (lọt trong ô va chạm r 0,3), thân son, đai vàng, đầu cột vàng sát xà ở độ cao `top`. */
export function hallColumn(g: THREE.Object3D, x: number, z: number, r: number, top: number): void {
  const gold = gilt(true);
  g.add(mesh(geo.lathe([[0, 0], [0.3, 0], [0.3, 0.1], [0.26, 0.17], [r + 0.03, 0.26], [0, 0.26]], 16), mat(TD.stoneLight), { x, z }));
  g.add(mesh(geo.cyl(r, r * 1.04, top - 0.26, 16), mat(TD.lacquer), { x, y: 0.26 + (top - 0.26) / 2, z }));
  for (const y of [0.55, top - 0.34]) g.add(mesh(geo.cyl(r * 1.08, r * 1.08, 0.1, 16), gold, { x, y, z }));
  g.add(mesh(geo.cyl(r * 1.26, r * 1.08, 0.16, 16), gold, { x, y: top - 0.08, z }));
}

// ── Khung vinh danh Sư Thầy ──

/** Chiếu quỳ son viền vàng + bồ đoàn nghệ viền vàng, tâm (x, z), đặt trên mặt phẳng cao `y` (mặt sàn hoặc mặt thảm). */
export function kneelMat(g: THREE.Object3D, x: number, z: number, y: number): void {
  addBox(g, 1.04, 0.012, 0.9, mat(TD.gold, { roughness: 0.55, metalness: 0.3 }), x, y + 0.006, z, false);
  addBox(g, 0.94, 0.014, 0.8, TD.carpet, x, y + 0.007, z, false);
  g.add(mesh(geo.cyl(0.3, 0.34, 0.12, 20), mat(TD.saffron), { x, y: y + 0.074, z }));
  g.add(mesh(geo.torus(0.305, 0.014, 4, 24), gilt(true), { x, y: y + 0.134, z, rx: Math.PI / 2, castShadow: false }));
}

/** Vật liệu đổi theo thời gian của một khung chân dung. */
export interface PortraitParts {
  photoMat: THREE.MeshStandardMaterial;
  glowMat: THREE.MeshBasicMaterial;
  /** Độ bừng sáng còn lại (1 → 0 trong ~2,5 s sau mỗi lễ). */
  pulse: number;
}

/** Tài nguyên dùng chung giữa sáu khung (tạo một lần mỗi lần dựng map). */
export interface StationKit {
  radial: THREE.Texture;
  loader: THREE.TextureLoader;
  /** Vật liệu băng rôn theo chữ (tạo lần đầu rồi dùng lại). */
  banner(text: string): THREE.Material;
  /** Bảng tên dưới khung theo chữ (bản sao dùng chung vật liệu). */
  plate(text: string): THREE.Object3D;
  /** Biển "BÓC QUẺ" trước kệ (bản sao dùng chung vật liệu). */
  sign(): THREE.Object3D;
}

/** Bộ tài nguyên dùng chung cho các khung chân dung. */
export function stationKit(radial: THREE.Texture): StationKit {
  const banners = new Map<string, THREE.Material>();
  const plates = new Map<string, THREE.Object3D>();
  let sign: THREE.Object3D | null = null;
  return {
    radial,
    loader: new THREE.TextureLoader(),
    banner(text) {
      let m = banners.get(text);
      if (!m) {
        const map = honourBannerTexture(text);
        m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.7, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.14 });
        banners.set(text, m);
      }
      return m;
    },
    plate(text) {
      let p = plates.get(text);
      if (!p) {
        p = kit.signBoard(text, { width: 0.62, height: 0.13, bg: '#d9a640', border: '#fff0b0', color: '#6e140c', depth: 0.02, fontScale: 0.6 });
        plates.set(text, p);
      }
      return p.clone();
    },
    sign() {
      if (!sign) sign = kit.signBoard('BÓC QUẺ', { width: 0.46, height: 0.12, bg: '#7a160e', border: '#f0c055', color: '#ffd166', depth: 0.015, fontScale: 0.62 });
      return sign.clone();
    },
  };
}

/**
 * Khung vinh danh một Sư Thầy, gốc tại mặt tường trong (giữa khung, mặt sàn), nhìn ra giữa điện theo +Z cục bộ (+X cục
 * bộ = bên phải người đứng nhìn). Từ dưới lên: kệ ống quẻ (đúng ô va chạm), bảng tên vắt qua thanh khung dưới, ảnh trong
 * khung vàng chạm, bảng tên lĩnh vực + khẩu hiệu, pháp luân trên đài sen; hai băng rôn dọc hai bên ảnh. Ảnh, bảng tên lĩnh
 * vực và khẩu hiệu nằm trọn trong dải tường camera quỳ nhìn thấy (≈ 0,93–3,0 m khi PORTRAIT_CENTER_Y = 1,8), trên mức HUD.
 * Đồ tĩnh vào `stat`; ảnh + quầng sáng (đổi theo thời gian) vào `dyn`.
 */
export function portraitStation(stat: THREE.Group, dyn: THREE.Group, photo: GalleryPhoto | undefined, domain: FortuneDomain | undefined, k: StationKit, floorY: number): PortraitParts {
  const lac = mat(TD.lacquer);
  const lacDeep = mat(TD.lacquerDeep);
  const bright = gilt(true);
  const carved = mat(PD.gold, { metalness: 0.6, roughness: 0.3, emissive: '#5a3a0c', emissiveIntensity: 0.55, surface: 'carved' });

  // Phông vinh danh sơn son giữa hai cột ốp, viền vàng, gờ son nẹp vàng trên đỉnh.
  addBox(stat, 2.4, 2.62, 0.04, lac, 0, 2.27, 0.024);
  for (const y of [0.99, 3.55]) addBox(stat, 2.44, 0.05, 0.022, bright, 0, y, 0.05, false);
  for (const x of [-1.195, 1.195]) addBox(stat, 0.05, 2.51, 0.022, bright, x, 2.27, 0.05, false);
  addBox(stat, 2.6, 0.1, 0.13, lacDeep, 0, 3.63, 0.065);
  addBox(stat, 2.66, 0.035, 0.15, bright, 0, 3.6975, 0.075);

  // Quầng sáng vàng ấm trên phông sau khung — bừng lên sau mỗi lễ.
  const glowMat = new THREE.MeshBasicMaterial({ map: k.radial, color: '#ffc870', transparent: true, opacity: HALO_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false });
  dyn.add(mesh(new THREE.PlaneGeometry(2.3, 2.5), glowMat, { y: PORTRAIT_CENTER_Y + 0.2, z: 0.052, castShadow: false, receiveShadow: false }));

  // Khung vinh danh: nền son, ảnh tự sáng nhẹ, chỉ vàng trong, bản khung vàng chạm, chỉ vàng ngoài, hoa vàng bốn góc.
  let w = PORTRAIT_HEIGHT * (photo ? photo.width / photo.height : 0.75);
  let h = PORTRAIT_HEIGHT;
  if (w > 1) {
    h /= w;
    w = 1;
  }
  const fy = PORTRAIT_CENTER_Y;
  addBox(stat, w + 0.06, h + 0.06, 0.04, lacDeep, 0, fy, 0.08);
  frameRing(stat, w, h, 0, 0.025, 0.03, bright, fy, 0.115);
  frameRing(stat, w, h, 0.025, 0.1, 0.08, carved, fy, 0.1);
  frameRing(stat, w, h, 0.125, 0.035, 0.07, bright, fy, 0.095);
  const rosette = geo.sphere(0.045, 10, 8);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) stat.add(mesh(rosette, bright, { x: sx * (w / 2 + 0.075), y: fy + sy * (h / 2 + 0.075), z: 0.14, scale: [1, 1, 0.5] }));
  }
  const photoMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, emissive: '#ffffff', emissiveIntensity: PHOTO_GLOW });
  if (photo) {
    const t = k.loader.load(photo.url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    photoMat.map = t;
    photoMat.emissiveMap = t;
  }
  dyn.add(mesh(new THREE.PlaneGeometry(w, h), photoMat, { y: fy, z: 0.105, castShadow: false }));
  const plate = k.plate(photo?.caption || 'SƯ THẦY');
  plate.position.set(0, fy - h / 2 - 0.145, 0.147);
  stat.add(plate);

  // Bảng tên lĩnh vực (chữ vàng lớn) + khẩu hiệu ngay trên khung, pháp luân trên đài sen chầu đỉnh.
  const ty = fy + PORTRAIT_HEIGHT / 2 + 0.4;
  const tbTex = titleBoardTexture(domain);
  const tbMat = new THREE.MeshStandardMaterial({ map: tbTex, emissive: '#ffffff', emissiveMap: tbTex, emissiveIntensity: 0.3, roughness: 0.5 });
  addBox(stat, 1.44, 0.5, 0.04, lacDeep, 0, ty, 0.062);
  stat.add(mesh(new THREE.PlaneGeometry(1.36, 0.42), tbMat, { y: ty, z: 0.084, castShadow: false }));
  for (const y of [ty - 0.235, ty + 0.235]) addBox(stat, 1.48, 0.03, 0.03, bright, 0, y, 0.08, false);
  for (const x of [-0.725, 0.725]) addBox(stat, 0.03, 0.44, 0.03, bright, x, ty, 0.08, false);
  dharmaWheel(stat, 0, ty + 0.47, 0.12, 0.16);

  // Hai băng rôn tuyên dương: khẩu hiệu bên trái, tên đầy đủ lĩnh vực bên phải; thanh treo vàng có quả đầu.
  const texts: [number, string][] = [
    [-1, domain?.motto ?? 'Tuyên Dương'],
    [1, domain ? domain.title.replace(' & ', ' ') : 'Tuyên Dương'],
  ];
  const bannerGeo = new THREE.PlaneGeometry(0.28, 1.96);
  const finial = geo.sphere(0.026, 8, 6);
  for (const [s, text] of texts) {
    stat.add(mesh(bannerGeo, k.banner(text), { x: s * 0.98, y: 1.96, z: 0.066, castShadow: false }));
    stat.add(mesh(geo.cyl(0.014, 0.014, 0.36, 8), bright, { x: s * 0.98, y: 2.955, z: 0.08, rz: Math.PI / 2, castShadow: false }));
    for (const e of [-1, 1]) stat.add(mesh(finial, bright, { x: s * 0.98 + e * 0.19, y: 2.955, z: 0.08, castShadow: false }));
  }

  // Kệ ống quẻ sơn son thếp vàng phủ đúng ô va chạm (sâu d × rộng tw, sát tường), mặt kệ cao 0,72 m (thấp hơn mắt quỳ).
  const d = T.shrineTable.d;
  const tw = T.shrineTable.w;
  const top = 0.72;
  // Đế kệ đứng trên mặt sàn (floorY) — không chìm dưới sàn, mặt trên đế không trùng mặt sàn.
  const bodyY = floorY + 0.08;
  addBox(stat, tw - 0.02, 0.08, d - 0.02, TD.lacquerDark, 0, floorY + 0.04, d / 2);
  addBox(stat, tw - 0.08, top - 0.05 - bodyY, d - 0.08, lac, 0, (bodyY + top - 0.05) / 2, d / 2);
  addBox(stat, tw, 0.05, d - 0.006, lacDeep, 0, top - 0.025, d / 2 + 0.003);
  addBox(stat, tw + 0.02, 0.015, 0.015, bright, 0, top - 0.048, d, false);
  addBox(stat, tw - 0.06, 0.03, 0.02, bright, 0, top - 0.075, d - 0.035, false);
  for (const s of [-1, 1]) addBox(stat, 0.03, top - 0.1 - bodyY, 0.02, bright, s * (tw / 2 - 0.05), (bodyY + top - 0.1) / 2, d - 0.035, false);
  const sign = k.sign();
  sign.position.set(0, 0.42, d - 0.032);
  stat.add(sign);

  // Ống quẻ tre (bên trái) cắm hai chục thẻ, đầu thẻ sơn son.
  const ox = -0.46;
  const oz = 0.3;
  stat.add(mesh(geo.cyl(0.072, 0.066, 0.26, 16), mat(TD.bamboo), { x: ox, y: top + 0.13, z: oz }));
  for (const y of [0.025, 0.2]) stat.add(mesh(geo.torus(0.071, 0.009, 4, 16), mat('#94603d'), { x: ox, y: top + y, z: oz, rx: Math.PI / 2 }));
  stat.add(mesh(geo.cyl(0.076, 0.076, 0.06, 16), mat('#b3261a', { roughness: 0.6 }), { x: ox, y: top + 0.11, z: oz }));
  const stick = geo.box(0.011, 0.32, 0.004);
  const tip = geo.box(0.013, 0.045, 0.006);
  const stickMat = mat('#e8cf98', { roughness: 0.7 });
  const tipMat = mat('#c0281c', { roughness: 0.6 });
  for (let i = 0; i < 20; i++) {
    const a = i * 2.39996;
    const rr = 0.008 + 0.048 * Math.sqrt((i + 0.5) / 20);
    const lean = rr * 1.6;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const base = top + 0.05 + (i % 4) * 0.012;
    const rot = { rx: dz * lean, rz: -dx * lean, castShadow: false };
    stat.add(mesh(stick, stickMat, { ...rot, x: ox + dx * (rr + lean * 0.16), y: base + 0.16, z: oz + dz * (rr + lean * 0.16) }));
    stat.add(mesh(tip, tipMat, { ...rot, x: ox + dx * (rr + lean * 0.3), y: base + 0.3, z: oz + dz * (rr + lean * 0.3) }));
  }

  // Khay vàng (bên phải) đựng lá quẻ giấy đỏ gấp đôi, nẹp vàng ngang thân lá.
  const sx = 0.42;
  const sz = 0.3;
  addBox(stat, 0.36, 0.024, 0.26, bright, sx, top + 0.012, sz);
  addBox(stat, 0.32, 0.006, 0.22, TD.lacquerDark, sx, top + 0.026, sz, false);
  for (const s of [-1, 1]) {
    addBox(stat, 0.36, 0.022, 0.012, bright, sx, top + 0.035, sz + s * 0.124, false);
    addBox(stat, 0.012, 0.022, 0.236, bright, sx + s * 0.174, top + 0.035, sz, false);
  }
  const slip = geo.box(0.09, 0.012, 0.034);
  const band = geo.box(0.014, 0.0135, 0.036);
  const paper = mat('#c62f22', { roughness: 0.75 });
  for (let i = 0; i < 9; i++) {
    const layer = i < 6 ? 0 : 1;
    const x = sx + (layer ? (i - 7) * 0.085 : ((i % 3) - 1) * 0.1);
    const z = sz + (layer ? 0.004 : (Math.floor(i / 3) - 0.5) * 0.08);
    const y = top + 0.036 + layer * 0.012;
    const ry = ((i * 0.37) % 0.5) - 0.25;
    stat.add(mesh(slip, paper, { x, y, z, ry, castShadow: false }));
    stat.add(mesh(band, bright, { x, y, z, ry, castShadow: false }));
  }

  // Chiếu quỳ son viền vàng + bồ đoàn nghệ có viền vàng tại đúng trạm đảnh lễ.
  kneelMat(stat, 0, T.kneelOff, floorY);
  return { photoMat, glowMat, pulse: 0 };
}

// ── Bệ Bảng Vàng + trụ đèn hoa sen ──

/**
 * Bệ Bảng Vàng ba bậc sơn son nẹp vàng phủ kín ô va chạm `tang_doan_altar` (4,4 × 1,6, sát tường Bắc), biển "XẢ NGHIỆP" ở
 * cổ bậc giữa, Bảng Vàng khung vàng chạm trên bệ đỡ (treo HONOUR_BOARD_PHOTO nếu có, không thì bảng chữ vinh danh), pháp
 * luân trên đỉnh, cuộn mây vàng hai góc. Gốc `(x, 0, zWall)` = mặt tường Bắc phía trong.
 */
export function honourDais(stat: THREE.Group, x: number, zWall: number): void {
  const g = new THREE.Group();
  g.position.set(x, 0, zWall);
  const lacDeep = mat(TD.lacquerDeep);
  const bright = gilt(true);
  const carved = mat(PD.gold, { metalness: 0.6, roughness: 0.3, emissive: '#5a3a0c', emissiveIntensity: 0.55, surface: 'carved' });
  for (const [w, d, y0, y1] of [
    [4.4, 1.596, 0, 0.24],
    [3.9, 1.2, 0.24, 0.42],
    [3.5, 0.84, 0.42, 0.6],
  ] as const) {
    const front = 0.004 + d;
    addBox(g, w, y1 - y0, d, lacDeep, 0, (y0 + y1) / 2, front - d / 2);
    addBox(g, w + 0.02, 0.035, 0.035, bright, 0, y1 - 0.0135, front, false);
    addBox(g, w - 0.16, 0.022, 0.012, bright, 0, (y0 + y1) / 2 - 0.01, front + 0.004, false);
  }
  // Biển ở cổ bậc giữa (mặt bậc ở 1,204), đứng trước nẹp vàng — chỉ bồ đoàn xả nghiệp trên thảm trước bệ.
  const sign = kit.signBoard('XẢ NGHIỆP', { width: 0.9, height: 0.14, bg: '#7a160e', border: '#f0c055', color: '#ffd166', depth: 0.015, fontScale: 0.62 });
  sign.position.set(0, 0.32, 1.23);
  g.add(sign);
  addBox(g, 3.56, 0.14, 0.5, bright, 0, 0.67, 0.27);
  // Khổ bảng 3,3 × 2,8 m; treo ảnh thì co theo tỉ lệ ảnh trong khổ đó (mép dưới vẫn đặt trên bệ đỡ).
  const photo = HONOUR_BOARD_PHOTO;
  let bw = 3.3;
  let bh = 2.8;
  if (photo) {
    bw = Math.min(bw, (bh * photo.width) / photo.height);
    bh = (bw * photo.height) / photo.width;
  }
  const by = 0.82 + bh / 2;
  addBox(g, bw + 0.1, bh + 0.1, 0.1, lacDeep, 0, by, 0.14);
  const tex = photo ? photoTexture(photo.url) : bangVangTexture();
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: photo ? PHOTO_GLOW : 0.2, roughness: 0.5 });
  g.add(mesh(new THREE.PlaneGeometry(bw, bh), boardMat, { y: by, z: 0.193, castShadow: false }));
  frameRing(g, bw, bh, 0, 0.13, 0.12, carved, by, 0.18);
  frameRing(g, bw, bh, 0.13, 0.04, 0.1, bright, by, 0.17);
  const topY = by + bh / 2 + 0.17;
  dharmaWheel(g, 0, topY + 0.4, 0.2, 0.3);
  for (const s of [-1, 1]) {
    g.add(mesh(geo.torus(0.17, 0.045, 6, 18, Math.PI * 1.5), bright, { x: s * (bw / 2 + 0.02), y: topY + 0.1, z: 0.19, rz: s > 0 ? 0 : Math.PI / 2 }));
    g.add(mesh(geo.sphere(0.07, 10, 8), bright, { x: s * (bw / 2 + 0.02), y: topY + 0.1, z: 0.19 }));
  }
  stat.add(g);
}

/**
 * Trụ đèn hoa sen vàng trên ô va chạm tròn (r 0,45): bệ đá bát giác (r 0,44), đế son, thân son đai vàng, đài sen hai vòng
 * cánh đỡ quả đèn sáng (vật liệu `bulb`, nhóm động) và quầng sáng luôn quay về camera (`halo`).
 */
export function lotusLampPillar(stat: THREE.Group, dyn: THREE.Group, x: number, z: number, bulb: THREE.Material, halo: THREE.Material): void {
  const gold = gilt();
  const bright = gilt(true);
  stat.add(mesh(geo.cyl(0.4, 0.44, 0.24, 8), mat(TD.stoneLight), { x, y: 0.12, z }));
  stat.add(mesh(geo.cyl(0.3, 0.37, 0.14, 8), mat(TD.lacquerDeep), { x, y: 0.31, z }));
  stat.add(mesh(geo.lathe([[0.3, 0], [0.24, 0.06], [0.13, 0.16], [0.11, 0.2], [0, 0.2]], 16), gold, { x, y: 0.38, z }));
  stat.add(mesh(geo.cyl(0.095, 0.11, 1.95, 14), mat(TD.lacquer), { x, y: 1.555, z }));
  for (const y of [0.75, 1.55, 2.35]) stat.add(mesh(geo.cyl(0.122, 0.122, 0.06, 14), bright, { x, y, z }));
  const cupY = 2.5;
  stat.add(mesh(geo.lathe([[0.06, 0], [0.14, 0.04], [0.26, 0.16], [0.32, 0.26], [0.33, 0.29], [0, 0.29]], 18), gold, { x, y: cupY, z }));
  petalRing(stat, x, cupY + 0.3, z, 0.27, 10, 0.1, 0.55, bright);
  petalRing(stat, x, cupY + 0.33, z, 0.17, 7, 0.08, 0.3, gold);
  const globeY = cupY + 0.52;
  dyn.add(mesh(geo.sphere(0.17, 16, 12), bulb, { x, y: globeY, z, castShadow: false, receiveShadow: false }));
  stat.add(mesh(geo.cone(0.05, 0.16, 8), bright, { x, y: globeY + 0.22, z }));
  const card = glowCard(halo, 1.5);
  card.position.set(x, globeY, z);
  dyn.add(card);
}
