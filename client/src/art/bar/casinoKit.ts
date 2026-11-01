// Đồ dùng chung khi dựng phòng Sòng Công Đức: bảng màu, ngữ cảnh dựng (nhóm tĩnh/động, vật liệu dùng chung, hoạt ảnh),
// hộp có UV theo mét thật (nhiều đoạn tường chung một vật liệu mà vân vẫn liền), biển neon tự phát sáng, biển sơn son
// hai dòng, vật liệu nỉ. Mọi kích thước/vị trí lấy từ SONG_BAC (shared) — đổi số ở đó thì phòng theo.
import * as THREE from 'three';
import { SONG_BAC } from '@shared/index';
import type { AnchorSpec } from '../anchors';
import type { ArtKit } from '../kit';
import { applySurface } from '../pbr';

export const SB = SONG_BAC;
/**
 * Mặt tường Đông của Bar nhìn từ trong Sòng — trùng mặt va chạm (x = SB.minX = W/2 của Bar; tường gạch Bar dày 0,3 m
 * phủ x SB.minX − 0,3 .. SB.minX) như 3 tường mới, để người chơi / camera góc thứ ba không lấn vào hay lùi ra sau mặt ván.
 */
export const WEST_FACE = SB.minX;
/** Lớp ván ốp phủ lên mặt đó (dày 4 cm). */
export const WEST_LINING = WEST_FACE + 0.04;
/** Một ô ván ốp tường (m) — texture lặp theo bề ngang. */
export const PANEL_TILE = 1.5;

/** Bảng màu phòng: gỗ tối, sơn son, nhung, vàng kim, nỉ. Màu gỗ nằm trong bảng bề mặt PBR (vân gỗ tự nhận). */
export const C = {
  woodDark: '#2e1a10',
  woodMid: '#3a2418',
  woodWarm: '#4a2a1a',
  lacquer: '#7a1f12',
  leather: '#1e0e0b',
  ink: '#0b0608',
  gold: '#e3b553',
  feltRed: '#8c1c1f',
  feltGreen: '#1f6b3e',
  chrome: '#d9dde3',
  warmLight: '#ffd9a0',
  /** Màu phỉnh 1 · 5 · 10 · 50 (trùng bảng cược `cs-chip`). */
  chips: ['#4a7bd8', '#c8322a', '#1f8a4a', '#1b1b1f'],
} as const;

export interface CasinoCtx {
  kit: ArtKit;
  /** Vị trí neo của map (anchors.ts) — đồ tĩnh bám đúng chỗ mini-game đặt đồ động. */
  anchors: ReadonlyMap<string, AnchorSpec>;
  /** Đồ đứng yên — index.ts gộp mesh theo vật liệu cùng phần tĩnh của Bar. */
  statics: THREE.Group;
  /** Đồ cần đổi vị trí/hiện ẩn theo thời gian (không gộp). */
  dyn: THREE.Group;
  /** Hoạt ảnh mỗi khung: chỉ đổi thông số vật liệu/vị trí đã có, không cấp phát. */
  updates: ((dt: number, t: number) => void)[];
  /** Texture tự tạo (giải phóng khi dỡ map — phần lớn disposeTree của Bar đã lo, đây là lưới an toàn). */
  textures: THREE.Texture[];
  /** Vàng kim (phát sáng nhẹ để vẫn ra màu vàng khi phòng không có IBL). */
  gold: THREE.MeshStandardMaterial;
  goldDim: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  woodMid: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  ink: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
}

export function createCasinoCtx(kit: ArtKit, anchors: ReadonlyMap<string, AnchorSpec>): CasinoCtx {
  const { mat } = kit;
  return {
    kit,
    anchors,
    statics: new THREE.Group(),
    dyn: new THREE.Group(),
    updates: [],
    textures: [],
    gold: mat(C.gold, { metalness: 0.55, roughness: 0.32, emissive: '#6a4510', emissiveIntensity: 0.45 }),
    goldDim: mat('#b88a36', { metalness: 0.5, roughness: 0.42, emissive: '#3a2408', emissiveIntensity: 0.4 }),
    woodDark: mat(C.woodDark, { roughness: 0.55 }),
    woodMid: mat(C.woodMid, { roughness: 0.5 }),
    lacquer: mat(C.lacquer, { roughness: 0.38 }),
    leather: mat(C.leather, { roughness: 0.45, surface: 'fabric' }),
    ink: mat(C.ink, { roughness: 0.7, surface: 'none' }),
    chrome: mat(C.chrome, { metalness: 0.75, roughness: 0.22, emissive: '#30343c', emissiveIntensity: 0.5 }),
  };
}

/** Vị trí một neo (báo lỗi ngay lúc dựng nếu anchors.ts đổi tên neo mà phòng chưa theo). */
export function anchorOf(ctx: CasinoCtx, name: string): AnchorSpec {
  const a = ctx.anchors.get(name);
  if (!a) throw new Error(`Sòng Công Đức thiếu neo "${name}"`);
  return a;
}

/**
 * Hộp đặt sẵn ở toạ độ thế giới (x0..x1 × y0..y1 × z0..z1), UV theo mét: mặt đứng u = toạ độ dọc tường / `tileU`,
 * v = y / `spanV`; mặt nằm u = x / tileU, v = z / tileU. Nhiều đoạn tường chung vật liệu vẫn liền vân sau khi gộp mesh.
 */
export function worldBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tileU: number, spanV: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const facesZ = Math.abs(nor.getZ(i)) > 0.5;
    const facesX = Math.abs(nor.getX(i)) > 0.5;
    if (facesZ || facesX) uv.setXY(i, (facesZ ? pos.getX(i) : pos.getZ(i)) / tileU, pos.getY(i) / spanV);
    else uv.setXY(i, pos.getX(i) / tileU, pos.getZ(i) / tileU);
  }
  return g;
}

/** Mặt phẳng nằm ngang ở cao độ y phủ x0..x1 × z0..z1 (nhìn lên hoặc nhìn xuống), UV theo mét / `tile`. */
export function worldPlane(x0: number, x1: number, z0: number, z1: number, y: number, tile: number, facingDown = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(facingDown ? Math.PI / 2 : -Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  return g;
}

/** Texture canvas tự tạo của phòng (ghi lại để giải phóng). */
export function casinoTexture(ctx: CasinoCtx, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): THREE.CanvasTexture {
  const tex = ctx.kit.canvasTexture(w, h, draw);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  ctx.textures.push(tex);
  return tex;
}

/** Vật liệu nỉ mặt bàn: màu + chữ in từ canvas, gân vải PBR. */
export function feltMat(tex: THREE.Texture): THREE.MeshStandardMaterial {
  return applySurface(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), 'fabric');
}

/** Vật liệu tự phát sáng theo chính texture (biển neon, màn đèn): nền tối không sáng, nét sáng mới phát quang. */
export function glowCanvasMat(tex: THREE.Texture, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: intensity, roughness: 0.6 });
}

/** Chữ neon có quầng: vẽ quầng màu rồi lõi sáng. */
export function neonText(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, blur: number): void {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.fillStyle = color;
  c.fillText(text, x, y);
  c.shadowBlur = blur * 0.4;
  c.fillStyle = '#fff6e8';
  c.globalAlpha = 0.85;
  c.fillText(text, x, y);
  c.restore();
}

export interface NeonSignOptions {
  width: number;
  height: number;
  /** Màu chữ neon. */
  color: string;
  /** Màu viền neon đôi. */
  border: string;
  /** Dòng phụ nhỏ dưới chữ chính (tuỳ chọn). */
  sub?: string;
  intensity?: number;
}

/** Biển neon (mặt chữ hướng +Z): nền tối, viền neon đôi, chữ phát sáng. Trả cả vật liệu để nhấp nháy. */
export function neonSign(ctx: CasinoCtx, text: string, o: NeonSignOptions): { group: THREE.Group; mat: THREE.MeshStandardMaterial } {
  const ppm = 220;
  const tex = casinoTexture(ctx, Math.round(o.width * ppm), Math.round(o.height * ppm), (c, w, h) => {
    c.fillStyle = '#0d0507';
    c.fillRect(0, 0, w, h);
    c.save();
    c.shadowColor = o.border;
    c.shadowBlur = h * 0.08;
    c.strokeStyle = o.border;
    c.lineWidth = Math.max(3, h * 0.035);
    const m = h * 0.09;
    c.strokeRect(m, m, w - 2 * m, h - 2 * m);
    c.lineWidth = Math.max(2, h * 0.015);
    c.strokeRect(m * 1.7, m * 1.7, w - 3.4 * m, h - 3.4 * m);
    c.restore();
    const mainH = o.sub ? h * 0.42 : h * 0.5;
    let size = Math.round(mainH);
    c.font = `800 ${size}px ${ctx.kit.FONT_TITLE}`;
    while (c.measureText(text).width > w * 0.84 && size > 10) {
      size -= 2;
      c.font = `800 ${size}px ${ctx.kit.FONT_TITLE}`;
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    neonText(c, text, w / 2, o.sub ? h * 0.42 : h * 0.53, o.color, size * 0.35);
    if (o.sub) {
      c.font = `700 ${Math.round(h * 0.16)}px ${ctx.kit.FONT_BODY}`;
      neonText(c, o.sub, w / 2, h * 0.73, o.border, h * 0.05);
    }
  });
  const m = glowCanvasMat(tex, o.intensity ?? 1.5);
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), m);
  face.position.z = 0.032;
  g.add(face);
  g.add(ctx.kit.mesh(ctx.kit.geo.box(o.width + 0.06, o.height + 0.06, 0.06), ctx.ink, { castShadow: false }));
  return { group: g, mat: m };
}

/** Biển sơn son thếp vàng hai dòng (mặt chữ hướng +Z): dòng trên chữ đậm, dòng dưới nghiêng nhỏ hơn. */
export function lacquerSign(ctx: CasinoCtx, top: string, bottom: string, width: number, height: number): THREE.Group {
  const ppm = 240;
  const tex = casinoTexture(ctx, Math.round(width * ppm), Math.round(height * ppm), (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#8a2416');
    grad.addColorStop(1, '#5e140c');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8c060';
    c.lineWidth = h * 0.05;
    c.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    c.lineWidth = h * 0.015;
    c.strokeRect(h * 0.12, h * 0.12, w - h * 0.24, h - h * 0.24);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffd98a';
    const fit = (text: string, weight: string, start: number, font: string) => {
      let size = Math.round(start);
      c.font = `${weight} ${size}px ${font}`;
      while (c.measureText(text).width > w * 0.84 && size > 8) {
        size -= 2;
        c.font = `${weight} ${size}px ${font}`;
      }
    };
    fit(top, '800', h * 0.3, ctx.kit.FONT_TITLE);
    c.fillText(top, w / 2, h * 0.4);
    fit(bottom, 'italic 600', h * 0.2, ctx.kit.FONT_BODY);
    c.fillStyle = '#f3e2b8';
    c.fillText(bottom, w / 2, h * 0.7);
  });
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
  face.position.z = 0.027;
  g.add(face);
  g.add(ctx.kit.mesh(ctx.kit.geo.box(width + 0.08, height + 0.08, 0.05), ctx.gold, { castShadow: false }));
  return g;
}
