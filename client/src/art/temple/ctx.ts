// Ngữ cảnh dựng map Chùa: gom phần tĩnh (sẽ gộp mesh cho nhẹ), phần động (có hoạt ảnh), đèn nhấp nháy,
// các hàm cập nhật mỗi khung hình, và điểm neo cho mini-game.
import * as THREE from 'three';
import type { Rng } from '@shared/index';
import type { WindUniforms } from '../common/wind';
import { kit } from '../kit';

export interface TempleCtx {
  rng: Rng;
  wind: WindUniforms;
  /** Đồ trang trí đứng yên — cuối cùng được gộp theo vật liệu. */
  statics: THREE.Group;
  /** Đồ có hoạt ảnh / cần điều khiển (không gộp). */
  dynamics: THREE.Group;
  /** Vật liệu tự phát sáng nhấp nháy (đèn lồng, nến). */
  flicker: { mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; base: number; speed: number; phase: number }[];
  updates: ((dt: number, t: number) => void)[];
  anchors: Map<string, THREE.Object3D>;
  lights: THREE.Light[];
  /** Thả khói (hương, bếp) tại vị trí — do hệ hạt khói đăng ký. */
  smoke?: (x: number, y: number, z: number, amount: number) => void;
}

export function addStatic(ctx: TempleCtx, obj: THREE.Object3D): THREE.Object3D {
  ctx.statics.add(obj);
  return obj;
}

/** Đèn lồng đỏ treo: vật liệu phát sáng riêng để nhấp nháy. */
export function hangingLantern(ctx: TempleCtx, x: number, y: number, z: number, color = '#e0352b', scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.6, flatShading: true });
  ctx.flicker.push({ mat: glow, base: 0.9, speed: 3 + ctx.rng.next() * 2, phase: ctx.rng.next() * 10 });
  g.add(kit.mesh(kit.geo.cyl(0.012, 0.012, 0.4, 3), kit.mat('#3a2a1a'), { y: 0.42 * scale, castShadow: false }));
  g.add(kit.mesh(kit.geo.cyl(0.13 * scale, 0.13 * scale, 0.05 * scale, 8), kit.mat('#e8b04a'), { y: 0.2 * scale }));
  g.add(kit.mesh(kit.geo.sphere(0.25 * scale, 10, 8), glow, { scale: [1, 0.85, 1], castShadow: false }));
  g.add(kit.mesh(kit.geo.cyl(0.13 * scale, 0.13 * scale, 0.05 * scale, 8), kit.mat('#e8b04a'), { y: -0.2 * scale }));
  g.add(kit.mesh(kit.geo.cone(0.05 * scale, 0.26 * scale, 5), kit.mat('#ffd166'), { y: -0.36 * scale, rx: Math.PI }));
  const t0 = ctx.rng.next() * 10;
  ctx.updates.push((_dt, t) => {
    g.rotation.z = Math.sin(t * 1.1 + t0) * 0.05;
    g.rotation.x = Math.cos(t * 0.9 + t0) * 0.04;
  });
  ctx.dynamics.add(g);
  return g;
}

/** Ngọn lửa nến/đèn: hình nón phát sáng nhấp nháy. */
export function flame(ctx: TempleCtx, parent: THREE.Object3D, x: number, y: number, z: number, s = 1): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffb43a', emissive: '#ff8a1a', emissiveIntensity: 2.4, flatShading: true });
  ctx.flicker.push({ mat, base: 2.4, speed: 9 + ctx.rng.next() * 6, phase: ctx.rng.next() * 10 });
  const f = kit.mesh(kit.geo.cone(0.035 * s, 0.11 * s, 6), mat, { x, y, z, castShadow: false });
  parent.add(f);
  const t0 = ctx.rng.next() * 10;
  ctx.updates.push((_dt, t) => {
    f.scale.set(1, 0.85 + Math.sin(t * 13 + t0) * 0.15, 1);
    f.rotation.z = Math.sin(t * 7 + t0) * 0.12;
  });
  return f;
}

export function anchor(ctx: TempleCtx, name: string, x: number, y: number, z: number, ry = 0): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = `anchor:${name}`;
  o.position.set(x, y, z);
  o.rotation.y = ry;
  ctx.anchors.set(name, o);
  ctx.dynamics.add(o);
  return o;
}

/** Tấm chữ dọc (câu đối) vẽ bằng canvas. */
export function verticalBoard(text: string, w: number, h: number, bg: string, fg: string): THREE.Group {
  const tex = kit.canvasTexture(128, Math.round((128 * h) / w), (c, cw, ch) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, cw, ch);
    c.strokeStyle = '#e8b04a';
    c.lineWidth = 8;
    c.strokeRect(6, 6, cw - 12, ch - 12);
    const words = text.split(' ');
    const size = Math.min(cw * 0.42, (ch - 40) / words.length / 1.15);
    c.font = `800 ${size}px ${kit.FONT_TITLE}`;
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    words.forEach((wd, i) => c.fillText(wd, cw / 2, 26 + (i + 0.5) * ((ch - 52) / words.length)));
  });
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  face.position.z = 0.035;
  g.add(face, kit.mesh(kit.geo.box(w + 0.04, h + 0.04, 0.06), kit.mat(bg)));
  return g;
}
