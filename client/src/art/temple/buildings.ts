// Công trình của Chùa: tường bao, cổng Tam Quan, cổng Hạ Sơn, Chánh Điện (tượng Phật, nội thất, hào quang),
// gác chuông Đại Hồng Chung, nhà bếp, kho. Điện Tăng Đoàn (chân dung + tủ áo) ở tangDoan.ts.
import * as THREE from 'three';
import type { MapDef } from '@shared/index';
import { kit } from '../kit';
import { realisticBuddha } from './buddha';
import { addStatic, flame, hangingLantern, verticalBoard, type TempleCtx } from './ctx';
import { vietRoof } from './roof';

const { geo, mat, mesh } = kit;
const C = {
  wall: '#f3d58f',
  wallLight: '#f8e3ad',
  cream: '#f6e8c8',
  red: '#a8432f',
  redDark: '#7f2e1f',
  wood: '#8a5a3b',
  woodDark: '#5e3a24',
  gold: '#e8b04a',
  goldBright: '#ffd166',
  stone: '#cfc8ba',
  stoneDark: '#a8a092',
  bronze: '#9a6a35',
};

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number } = {}): THREE.Mesh {
  return mesh(geo.box(w, h, d), mat(color), { x, y, z, ...o });
}

function cyl(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, seg = 10): THREE.Mesh {
  return mesh(geo.cyl(rt, rb, h, seg), mat(color), { x, y, z });
}

/** Cột son có chân đá và đai vàng. */
export function pillar(g: THREE.Group, x: number, z: number, h: number, r = 0.26, color = C.red): void {
  g.add(cyl(r * 1.45, r * 1.6, 0.28, C.stone, x, 0.14, z, 8));
  g.add(cyl(r, r * 1.05, h, color, x, h / 2 + 0.2, z, 12));
  g.add(cyl(r * 1.12, r * 1.12, 0.12, C.gold, x, h - 0.15, z, 12));
  g.add(cyl(r * 1.12, r * 1.12, 0.08, C.gold, x, 0.45, z, 12));
}

function roundWindow(g: THREE.Group, x: number, y: number, z: number, ry: number, r = 0.7): void {
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = ry;
  w.add(mesh(geo.torus(r, 0.09, 6, 20), mat(C.redDark)));
  w.add(mesh(new THREE.CircleGeometry(r - 0.02, 18), mat('#3a2418'), { z: -0.03, castShadow: false }));
  for (const a of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) w.add(mesh(geo.box(r * 2 - 0.1, 0.05, 0.05), mat(C.gold), { rz: a }));
  w.add(mesh(geo.torus(r * 0.45, 0.04, 4, 14), mat(C.gold)));
  g.add(w);
}

// ───────────────────────── Tường bao + cổng ─────────────────────────

export function buildWalls(ctx: TempleCtx, map: MapDef): void {
  const g = new THREE.Group();
  for (const c of map.colliders) {
    if (c.tag !== 'wall_perimeter' || c.kind !== 'box') continue;
    const long = c.w > c.d;
    const len = long ? c.w : c.d;
    g.add(box(c.w + 0.1, 0.4, c.d + 0.25, C.stoneDark, c.x, 0.2, c.z));
    g.add(box(c.w, 2.3, c.d, '#efd9a6', c.x, 1.35, c.z));
    g.add(box(c.w + (long ? 0.2 : 0.7), 0.16, c.d + (long ? 0.7 : 0.2), '#9a4430', c.x, 2.55, c.z));
    g.add(box(long ? c.w + 0.2 : 0.3, 0.16, long ? 0.3 : c.d + 0.2, '#7a3324', c.x, 2.7, c.z));
    // Trụ tường mỗi ~6 m + ô thoáng tròn.
    const n = Math.floor(len / 6);
    for (let i = 0; i <= n; i++) {
      const t = -len / 2 + (i * len) / n;
      const px = long ? c.x + t : c.x;
      const pz = long ? c.z : c.z + t;
      g.add(box(0.7, 2.75, 0.7, '#e2c48a', px, 1.38, pz));
      g.add(box(0.8, 0.14, 0.8, '#9a4430', px, 2.8, pz));
      g.add(mesh(geo.sphere(0.13, 8, 6), mat(C.gold), { x: px, y: 2.95, z: pz }));
      if (i < n && i % 2 === 0) {
        const mx = long ? px + len / n / 2 : px;
        const mz = long ? pz : pz + len / n / 2;
        for (const side of [-1, 1]) {
          const off = (long ? c.d : c.w) / 2 + 0.02;
          roundWindow(g, long ? mx : mx + side * off, 1.5, long ? mz + side * off : mz, long ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2, 0.42);
        }
      }
    }
  }
  addStatic(ctx, g);
}

export function buildTamQuan(ctx: TempleCtx): THREE.Group {
  const g = new THREE.Group();
  const z = 39.1;
  for (const x of [-7, -3.2, 3.2, 7]) pillar(g, x, z - 0.5, x * x > 20 ? 3.6 : 4.4, 0.36);
  // Lan can giữa các trụ phụ (cổng hai bên đóng).
  for (const s of [-1, 1]) {
    g.add(box(3.4, 3.1, 0.25, C.woodDark, s * 5.1, 1.7, z + 0.2));
    for (let k = 0; k < 4; k++) g.add(box(0.06, 2.9, 0.06, C.gold, s * (3.8 + k * 0.85), 1.7, z + 0.04));
    g.add(box(4.2, 0.28, 0.4, C.redDark, s * 5.1, 3.5, z - 0.4));
  }
  g.add(box(7.4, 0.36, 0.5, C.redDark, 0, 4.25, z - 0.5));
  g.add(box(7.4, 0.2, 0.5, C.gold, 0, 3.98, z - 0.5));
  addStatic(ctx, g);

  const roofs = new THREE.Group();
  const main = vietRoof({ w: 7.6, d: 2.8, h: 1.7, overhang: 0.75, lift: 0.55 });
  main.position.set(0, 4.45, z - 0.4);
  roofs.add(main);
  const top = vietRoof({ w: 4.2, d: 2.2, h: 1.4, overhang: 0.6, lift: 0.45, pearl: true });
  top.position.set(0, 6.55, z - 0.4);
  roofs.add(top);
  roofs.add(box(4.4, 1.2, 1.6, C.wall, 0, 6.0, z - 0.4));
  for (const s of [-1, 1]) {
    const side = vietRoof({ w: 4, d: 2.4, h: 1.15, overhang: 0.55, lift: 0.4, pearl: false });
    side.position.set(s * 5.1, 3.7, z - 0.4);
    roofs.add(side);
  }
  ctx.dynamics.add(roofs);

  for (const dir of [1, -1]) {
    const sign = kit.signBoard('CHÙA TU ONLINE', { width: 3.6, height: 0.8, bg: '#7a1f12', border: C.gold, color: C.goldBright, depth: 0.08 });
    sign.position.set(0, 6.0, z - 0.4 + dir * 0.85);
    sign.rotation.y = dir > 0 ? 0 : Math.PI;
    addStatic(ctx, sign);
  }
  for (const [x, text] of [
    [-3.2, 'Phước Huệ Song Tu'],
    [3.2, 'Công Đức Vô Lượng'],
  ] as const) {
    const b = verticalBoard(text, 0.42, 2.5, '#8a1f14', C.goldBright);
    b.position.set(x, 2.4, z - 1.0);
    b.rotation.y = Math.PI;
    addStatic(ctx, b);
  }
  for (const x of [-5.1, 5.1]) hangingLantern(ctx, x, 3.0, z - 1.1);
  hangingLantern(ctx, -1.8, 3.6, z - 1.0, '#e0352b', 1.15);
  hangingLantern(ctx, 1.8, 3.6, z - 1.0, '#e0352b', 1.15);
  return roofs;
}

export function buildHaSonGate(ctx: TempleCtx): void {
  const g = new THREE.Group();
  for (const x of [-32, -28]) pillar(g, x, 34, 3.3, 0.3, C.woodDark);
  g.add(box(5.2, 0.3, 0.42, C.redDark, -30, 3.25, 34));
  g.add(box(4.6, 0.2, 0.3, C.wood, -30, 2.75, 34));
  addStatic(ctx, g);
  const roof = vietRoof({ w: 4.6, d: 1.3, h: 0.9, overhang: 0.45, lift: 0.3, pearl: false, color: '#8a4a32' });
  roof.position.set(-30, 3.45, 34);
  ctx.dynamics.add(roof);
  for (const dir of [1, -1]) {
    const sign = kit.signBoard('CỔNG HẠ SƠN', { width: 2.6, height: 0.5, bg: '#2a1a3a', border: '#ff4fd8', color: '#ffd6f6', depth: 0.06 });
    sign.position.set(-30, 2.95, 34 + dir * 0.22);
    sign.rotation.y = dir > 0 ? 0 : Math.PI;
    addStatic(ctx, sign);
  }
  // Biển chỉ đường neon nhỏ: "Quán Bar Niết Bàn ↓".
  const post = new THREE.Group();
  post.position.set(-25.6, 0, 35.6);
  post.add(cyl(0.06, 0.07, 1.8, C.woodDark, 0, 0.9, 0, 6));
  const neon = kit.signBoard('Quán Bar Niết Bàn →', { width: 1.6, height: 0.36, bg: '#1d1830', border: '#3ef2ff', color: '#ff7be5', depth: 0.05 });
  neon.position.set(0, 1.65, 0);
  neon.rotation.y = -0.5;
  post.add(neon);
  addStatic(ctx, post);
  hangingLantern(ctx, -31.2, 2.4, 34, '#ff4fd8', 0.8);
  hangingLantern(ctx, -28.8, 2.4, 34, '#3ef2ff', 0.8);
}

// ───────────────────────── Chánh Điện ─────────────────────────

export interface ChanhDienHandles {
  roof: THREE.Group;
  setGlow(on: boolean): void;
}

/** Tượng Phật đá ngồi trên đài sen (bản tả thực theo ảnh mẫu, điêu khắc bằng SDF — xem buddha.ts). */
export function buddhaStatue(_ctx: TempleCtx): { group: THREE.Group; bodyMat: THREE.MeshStandardMaterial } {
  return realisticBuddha();
}

export function buildChanhDien(ctx: TempleCtx, map: MapDef): ChanhDienHandles {
  const g = new THREE.Group();
  const z0 = -29;
  // Nền + sàn gỗ + thảm đỏ.
  g.add(box(23.4, 0.06, 17.4, C.stoneDark, 0, 0.03, z0));
  g.add(box(21.4, 0.03, 15.4, '#7a3f26', 0, 0.075, z0));
  for (let i = -5; i <= 5; i++) g.add(box(0.03, 0.035, 15.4, '#5e2f1c', i * 2, 0.08, z0));
  g.add(box(2.6, 0.04, 13.4, '#a32a22', 0, 0.095, z0 + 0.9));
  for (const s of [-1, 1]) g.add(box(0.1, 0.045, 13.4, C.gold, s * 1.25, 0.1, z0 + 0.9));
  g.add(box(9.4, 0.04, 2.8, C.stone, 0, 0.02, -19.7));
  g.add(box(7.6, 0.07, 1.3, C.stone, 0, 0.035, -20.55));

  // Tường (theo dữ liệu va chạm) — chân tường son, thân vàng, diềm gỗ trên.
  for (const c of map.colliders) {
    if (c.tag !== 'wall_chanh_dien' || c.kind !== 'box') continue;
    g.add(box(c.w, 0.6, c.d + 0.06, C.redDark, c.x, 0.35, c.z));
    g.add(box(c.w, 3.4, c.d, C.wall, c.x, 2.3, c.z));
    g.add(box(c.w + 0.05, 0.4, c.d + 0.1, C.wood, c.x, 4.2, c.z));
  }
  // Cột hiên + cột trong.
  for (const x of [-11, -7, -3.2, 3.2, 7, 11]) pillar(g, x, -20.6, 4.2, 0.27);
  for (const [x, z] of [
    [-8, -24],
    [8, -24],
    [-8, -32],
    [8, -32],
  ] as const) {
    pillar(g, x, z, 4.2, 0.35);
    g.add(mesh(geo.torus(0.42, 0.06, 5, 16), mat(C.gold), { x, y: 2.6, z, rx: Math.PI / 2 }));
    g.add(mesh(geo.torus(0.42, 0.06, 5, 16), mat(C.gold), { x, y: 1.6, z, rx: Math.PI / 2 }));
  }
  for (const x of [-11, 11]) for (const zz of [-37, -21]) pillar(g, x, zz, 4.2, 0.3);
  // Cửa sổ tròn mặt tiền + cửa sổ song gỗ hai bên.
  for (const x of [-7, 7]) roundWindow(g, x, 2.3, -20.66, 0, 0.75);
  for (const x of [-7, 7]) roundWindow(g, x, 2.3, -21.34, Math.PI, 0.75);
  for (const s of [-1, 1]) {
    for (const z of [-25, -29, -33]) {
      const wx = s * 11.32;
      g.add(box(0.06, 1.3, 1.6, C.redDark, wx, 2.4, z));
      for (let k = 0; k < 5; k++) g.add(box(0.08, 1.2, 0.06, C.gold, wx + s * 0.02, 2.4, z - 0.64 + k * 0.32));
    }
  }
  // Khung cửa chính.
  g.add(box(6.6, 0.45, 0.7, C.redDark, 0, 3.55, -21));
  g.add(box(6.6, 0.12, 0.72, C.gold, 0, 3.3, -21));
  // Xà ngang trong điện.
  // Xà ngang (xà gần tượng lùi về z = −31,4 để từ cửa vẫn nhìn rõ mặt tượng Phật).
  for (const z of [-24, -28.5, -31.4]) g.add(box(22, 0.32, 0.34, C.redDark, 0, 4.15, z));
  for (const x of [-8, 8]) g.add(box(0.3, 0.3, 16, C.redDark, x, 4.35, z0));
  // Xà dọc giữa dừng trước tượng (không xuyên qua nhục kế).
  g.add(box(0.3, 0.3, 11.4, C.redDark, 0, 4.35, -26.7));
  addStatic(ctx, g);

  // Biển "Đại Hùng Bảo Điện" + câu đối.
  const plaque = kit.signBoard('ĐẠI HÙNG BẢO ĐIỆN', { width: 4.6, height: 0.95, bg: '#7a1f12', border: C.gold, color: C.goldBright, depth: 0.1 });
  plaque.position.set(0, 4.35, -20.55);
  addStatic(ctx, plaque);
  for (const [x, text] of [
    [-3.2, 'Tâm Tịnh Đức Sinh'],
    [3.2, 'Tu Thân Phước Đến'],
  ] as const) {
    const b = verticalBoard(text, 0.44, 2.6, '#8a1f14', C.goldBright);
    b.position.set(x, 2.4, -20.25);
    addStatic(ctx, b);
  }
  for (const x of [-9, -5.2, 5.2, 9]) hangingLantern(ctx, x, 3.6, -19.9);

  // Nội thất: bệ thờ, tượng Phật, hào quang, bàn thờ, nến, phướn.
  const altarBase = new THREE.Group();
  altarBase.add(box(7, 0.9, 3.4, '#8a1f14', 0, 0.45, -34.35));
  altarBase.add(box(7.1, 0.1, 3.5, C.gold, 0, 0.92, -34.35));
  altarBase.add(box(7.1, 0.12, 3.5, C.gold, 0, 0.06, -34.35));
  altarBase.add(box(5.6, 3.8, 0.2, '#6e1a12', 0, 2.8, -36.4));
  addStatic(ctx, altarBase);
  const buddha = buddhaStatue(ctx);
  buddha.group.position.set(0, 0.95, -34.4);
  buddha.group.scale.setScalar(1.05);
  ctx.dynamics.add(buddha.group);

  // Vầng hào quang sau tượng (thân quang, sáng rực khi bật Hào quang) — đỉnh vòng thấp hơn mái.
  const halo = new THREE.Group();
  halo.position.set(0, 3.2, -35.75);
  const haloMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  halo.add(new THREE.Mesh(new THREE.RingGeometry(1.1, 1.9, 40), haloMat));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({ color: '#fff1c2', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.add(disc);
  // Vành hào quang: chuỗi hạt vàng + viền vàng mảnh (thay ngọn lửa nhọn kiểu hoạt hình).
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ff9a2a', emissiveIntensity: 1.2, metalness: 0.6, roughness: 0.35 });
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    halo.add(mesh(geo.sphere(0.075, 10, 8), flameMat, { x: Math.cos(a) * 2.02, y: Math.sin(a) * 2.02, castShadow: false }));
  }
  halo.add(mesh(geo.torus(2.16, 0.025, 6, 64), flameMat, { castShadow: false }));
  ctx.dynamics.add(halo);
  const rays = new THREE.Group();
  rays.position.set(0, 3.2, -35.7);
  rays.scale.setScalar(0.6);
  rays.visible = false;
  const rayMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 7), rayMat);
    r.rotation.z = (i / 12) * Math.PI * 2;
    r.position.set(Math.sin(r.rotation.z) * -3.5, Math.cos(r.rotation.z) * 3.5, 0);
    rays.add(r);
  }
  ctx.dynamics.add(rays);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 6, 30, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.set(0, 18, -29);
  beam.visible = false;
  ctx.dynamics.add(beam);

  // Bàn thờ phía trước: nến, bát hương, mâm quả, bình sen, chuông gia trì.
  const table = new THREE.Group();
  table.position.set(0, 0, -32.95);
  table.add(box(4.2, 0.9, 0.85, '#9a2a1c', 0, 0.45, 0));
  table.add(box(4.3, 0.08, 0.95, C.gold, 0, 0.92, 0));
  for (const x of [-1.6, 1.6]) {
    table.add(cyl(0.1, 0.14, 0.12, C.bronze, x, 1.02, 0, 8));
    table.add(cyl(0.05, 0.05, 0.4, '#fff4dc', x, 1.28, 0, 8));
    flame(ctx, table, x, 1.53, 0, 1.4);
  }
  table.add(mesh(geo.lathe([[0, 0], [0.3, 0.02], [0.34, 0.18], [0.3, 0.22]], 12), mat(C.bronze, { metalness: 0.4, roughness: 0.4 }), { y: 0.96 }));
  for (let i = 0; i < 5; i++) {
    table.add(cyl(0.01, 0.01, 0.55, '#b8322a', (i - 2) * 0.05, 1.42, 0, 4));
    table.add(mesh(geo.sphere(0.015, 4, 3), mat('#ff6a2a', { emissive: '#ff4a10', emissiveIntensity: 3 }), { x: (i - 2) * 0.05, y: 1.7, castShadow: false }));
  }
  for (const x of [-0.85, 0.85]) {
    table.add(cyl(0.32, 0.18, 0.06, C.gold, x, 0.98, 0, 12));
    const colors = ['#ffb627', '#f59a2c', '#b7d653', '#d4246f', '#ffd84a'];
    for (let i = 0; i < 5; i++) table.add(mesh(geo.sphere(0.1, 7, 5), mat(colors[i]!), { x: x + Math.cos(i * 1.26) * 0.15, y: 1.08, z: Math.sin(i * 1.26) * 0.15 }));
    table.add(mesh(geo.sphere(0.1, 7, 5), mat('#ffb627'), { x, y: 1.22 }));
  }
  for (const x of [-2.35, 2.35]) {
    table.add(mesh(geo.lathe([[0, 0], [0.1, 0.02], [0.14, 0.15], [0.08, 0.32], [0.11, 0.4]], 10), mat('#f2f6ff'), { x, y: 0.95 }));
    for (let i = 0; i < 3; i++) table.add(mesh(geo.ico(0.08, 0), mat('#f7a8c0'), { x: x + (i - 1) * 0.07, y: 1.45 + (i % 2) * 0.08 }));
  }
  ctx.dynamics.add(table);
  const bell = new THREE.Group();
  bell.position.set(2.9, 0, -32.4);
  bell.add(cyl(0.38, 0.38, 0.14, '#a32a22', 0, 0.07, 0, 12));
  bell.add(mesh(geo.lathe([[0, 0], [0.3, 0.02], [0.33, 0.22], [0.26, 0.36], [0, 0.38]], 12), mat(C.bronze, { metalness: 0.5, roughness: 0.35 }), { y: 0.14 }));
  addStatic(ctx, bell);

  // Phướn treo + đèn lồng trong điện.
  for (const [x, z, color] of [
    [-6, -34.5, '#e8b04a'],
    [6, -34.5, '#e8b04a'],
    [-9.5, -27, '#c8432f'],
    [9.5, -27, '#c8432f'],
  ] as const) {
    const banner = new THREE.Group();
    banner.position.set(x, 3.95, z);
    banner.add(mesh(geo.box(0.7, 2.4, 0.03), mat(color), { y: -1.2 }));
    banner.add(mesh(geo.box(0.8, 0.08, 0.08), mat(C.redDark), { y: 0 }));
    for (let k = 0; k < 3; k++) banner.add(mesh(geo.cone(0.12, 0.3, 3), mat(color), { x: (k - 1) * 0.24, y: -2.5, rx: Math.PI }));
    banner.add(mesh(geo.box(0.5, 0.05, 0.035), mat(C.redDark), { y: -0.6 }));
    banner.add(mesh(geo.box(0.5, 0.05, 0.035), mat(C.redDark), { y: -1.8 }));
    ctx.dynamics.add(banner);
    const t0 = x + z;
    ctx.updates.push((_dt, t) => {
      banner.rotation.x = Math.sin(t * 0.8 + t0) * 0.03;
    });
  }
  for (const [x, z] of [
    [-4, -26],
    [4, -26],
    [-4, -31],
    [4, -31],
  ] as const) {
    hangingLantern(ctx, x, 3.3, z, '#e0352b', 1.1);
  }

  // Ánh sáng ấm trong điện.
  const warm = new THREE.PointLight('#ffcf8a', 9, 16, 1.8);
  warm.position.set(0, 2.4, -30.5);
  const door = new THREE.PointLight('#ffb070', 3, 10, 1.8);
  door.position.set(0, 2.2, -24);
  ctx.lights.push(warm, door);

  // Mái hai tầng (luôn hiện ở góc nhìn thứ nhất).
  const roof = new THREE.Group();
  const lower = vietRoof({ w: 22.6, d: 16.6, h: 2.5, overhang: 1.4, lift: 0.95, pearl: false });
  lower.position.set(0, 4.35, z0);
  roof.add(lower);
  roof.add(box(13.6, 1.6, 7.6, C.wall, 0, 6.35, z0));
  roof.add(box(13.8, 0.3, 7.8, C.redDark, 0, 7.1, z0));
  for (const x of [-6, -2, 2, 6]) roof.add(box(0.12, 1.3, 7.7, C.redDark, x, 6.3, z0));
  const upper = vietRoof({ w: 13.4, d: 7.4, h: 2.4, overhang: 1.2, lift: 0.85, dragons: true });
  upper.position.set(0, 7.25, z0);
  roof.add(upper);
  ctx.dynamics.add(roof);

  let glowOn = false;
  let glowK = 0;
  ctx.updates.push((dt, t) => {
    glowK += ((glowOn ? 1 : 0) - glowK) * Math.min(1, dt * 2);
    haloMat.opacity = 0.45 + glowK * 0.45 + Math.sin(t * 2) * 0.05;
    halo.rotation.z = t * 0.08;
    halo.scale.setScalar(0.76 * (1 + glowK * 0.06 + Math.sin(t * 3) * 0.015 * glowK));
    flameMat.emissiveIntensity = 1.1 + glowK * 1.6 + Math.sin(t * 6) * 0.15;
    // Tượng đá chỉ ánh vàng khi bật Hào quang.
    buddha.bodyMat.emissiveIntensity = glowK * 0.32;
    rays.visible = glowK > 0.02;
    rays.rotation.z = -t * 0.15;
    rayMat.opacity = 0.28 * glowK;
    beam.visible = glowK > 0.02;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.12 * glowK + Math.sin(t * 2.4) * 0.03 * glowK;
    warm.intensity = 9 + glowK * 22;
  });
  return {
    roof,
    setGlow(on) {
      glowOn = on;
    },
  };
}

// ───────────────────────── Gác chuông ─────────────────────────

export interface BellHandles {
  roof: THREE.Group;
  setPull(amount: number): void;
  hit(strength: number): void;
}

export function buildBellTower(ctx: TempleCtx, map: MapDef): BellHandles {
  const g = new THREE.Group();
  const cx = 25;
  const cz = -14;
  g.add(box(8.6, 0.08, 8.6, C.stone, cx, 0.04, cz));
  for (const x of [21.5, 28.5]) for (const z of [-17.5, -10.5]) pillar(g, x, z, 5.0, 0.3);
  for (const z of [-17.5, -10.5]) g.add(box(7.4, 0.3, 0.32, C.redDark, cx, 4.95, z));
  for (const x of [21.5, 28.5]) g.add(box(0.32, 0.3, 7.4, C.redDark, x, 4.95, cz));
  g.add(box(0.36, 0.36, 7.4, C.redDark, 26, 4.75, cz));
  g.add(box(0.3, 0.3, 3.2, C.redDark, 23.7, 4.75, cz));
  addStatic(ctx, g);

  // Đại Hồng Chung (treo, lắc khi bị đánh).
  const bellPivot = new THREE.Group();
  bellPivot.position.set(26, 4.6, cz);
  const bronze = new THREE.MeshStandardMaterial({ color: '#a8743a', metalness: 0.55, roughness: 0.38, flatShading: true, emissive: '#3a2008', emissiveIntensity: 0.2 });
  const bellBody = new THREE.Mesh(
    geo.lathe([[0.0, -2.0], [1.08, -2.0], [1.05, -1.82], [0.92, -1.3], [0.86, -0.6], [0.82, -0.25], [0.6, -0.04], [0, 0]], 24),
    bronze,
  );
  bellBody.castShadow = true;
  bellBody.receiveShadow = true;
  bellPivot.add(bellBody);
  for (const y of [-1.75, -0.95, -0.4]) bellPivot.add(mesh(geo.torus(y < -1.5 ? 1.0 : 0.86, 0.045, 5, 24), bronze, { y, rx: Math.PI / 2 }));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (let k = 0; k < 2; k++) bellPivot.add(mesh(geo.sphere(0.05, 6, 4), bronze, { x: Math.cos(a) * (0.84 - k * 0.04), y: -0.6 - k * 0.18, z: Math.sin(a) * (0.84 - k * 0.04) }));
  }
  bellPivot.add(mesh(geo.torus(0.22, 0.08, 6, 12), bronze, { y: 0.1 }));
  bellPivot.add(mesh(geo.sphere(0.32, 10, 8), mat('#7a5a2a'), { y: -1.95, scale: [1, 0.3, 1], castShadow: false }));
  ctx.dynamics.add(bellPivot);

  // Chày kình: khúc gỗ treo ngang, kéo lùi về phía Tây rồi thả đập vào chuông.
  const strikerPivot = new THREE.Group();
  strikerPivot.position.set(23.7, 4.75, cz);
  const log = new THREE.Group();
  log.position.set(0, -1.45, 0);
  log.add(mesh(geo.cyl(0.19, 0.2, 2.3, 10), mat('#8a5a3b'), { rz: Math.PI / 2 }));
  log.add(mesh(geo.cyl(0.2, 0.2, 0.08, 10), mat('#d9b07a'), { x: 1.15, rz: Math.PI / 2 }));
  for (const x of [-0.7, 0.7]) log.add(mesh(geo.torus(0.21, 0.025, 4, 12), mat('#c8a064'), { x, ry: Math.PI / 2 }));
  strikerPivot.add(log);
  for (const x of [-0.7, 0.7]) strikerPivot.add(mesh(geo.cyl(0.02, 0.02, 1.45, 4), mat('#c8a064'), { x, y: -0.72 }));
  ctx.dynamics.add(strikerPivot);

  // Dây kéo xuống 4 vị trí đứng.
  const ropeMat = mat('#c8a064');
  const ropes = map.stations
    .filter((s) => s.kind === 'bell_rope')
    .map((s) => {
      const r = mesh(geo.cyl(0.025, 0.025, 1, 5), ropeMat, { castShadow: false });
      ctx.dynamics.add(r);
      return { mesh: r, end: new THREE.Vector3(s.x + 0.35, 1.25, s.z) };
    });

  // Sóng âm khi chuông ngân.
  const waves: { mesh: THREE.Mesh; age: number }[] = [];
  const waveMat = new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  let pullTarget = 0;
  let angle = 0;
  let swing: { t: number; strength: number } | null = null;
  let wobble = 0;
  const start = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  ctx.updates.push((dt, t) => {
    let target = -0.55 * pullTarget;
    if (swing) {
      swing.t += dt;
      if (swing.t < 0.14) target = 0.06;
      else if (swing.t > 0.5) swing = null;
    }
    angle += (target - angle) * Math.min(1, dt * (swing ? 22 : 6));
    strikerPivot.rotation.z = angle;
    wobble *= Math.exp(-dt * 0.9);
    bellPivot.rotation.z = Math.sin(t * 9) * wobble * 0.05;
    bellPivot.rotation.x = Math.cos(t * 7.3) * wobble * 0.03;
    // Đầu dây gắn ở đầu Tây của chày.
    strikerPivot.updateMatrixWorld();
    start.set(-1.1, -1.45, 0).applyMatrix4(strikerPivot.matrixWorld);
    for (const r of ropes) {
      const len = start.distanceTo(r.end);
      r.mesh.position.copy(start).add(r.end).multiplyScalar(0.5);
      r.mesh.scale.set(1, len, 1);
      r.mesh.quaternion.setFromUnitVectors(up, r.end.clone().sub(start).normalize());
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]!;
      w.age += dt;
      w.mesh.scale.setScalar(1 + w.age * 6);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - w.age * 0.35);
      if (w.age > 1.5) {
        w.mesh.removeFromParent();
        (w.mesh.material as THREE.Material).dispose();
        waves.splice(i, 1);
      }
    }
  });

  const roof = new THREE.Group();
  const r1 = vietRoof({ w: 7.6, d: 7.6, h: 2.1, overhang: 1.0, lift: 0.75, pearl: false });
  r1.position.set(cx, 5.1, cz);
  roof.add(r1);
  roof.add(box(3.4, 1.2, 3.4, C.wall, cx, 6.6, cz));
  const r2 = vietRoof({ w: 3.4, d: 3.4, h: 1.5, overhang: 0.7, lift: 0.5 });
  r2.position.set(cx, 7.2, cz);
  roof.add(r2);
  ctx.dynamics.add(roof);
  hangingLantern(ctx, 21.5, 3.9, -14, '#e0352b', 1);

  return {
    roof,
    setPull(amount) {
      pullTarget = Math.max(0, Math.min(1, amount));
    },
    hit(strength) {
      swing = { t: 0, strength };
      pullTarget = 0;
      wobble = Math.min(1.4, wobble + 0.4 + strength);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.05, 6, 40), waveMat.clone());
      ring.position.set(26, 3.0, cz);
      ring.rotation.x = Math.PI / 2;
      ctx.dynamics.add(ring);
      waves.push({ mesh: ring, age: 0 });
    },
  };
}

// ───────────────────────── Nhà bếp ─────────────────────────

export interface KitchenHandles {
  roof: THREE.Group;
  setStove(burner: 'rice' | 'pan', state: { fire: number; smoke: number }): void;
}

export function buildKitchen(ctx: TempleCtx, smokeAt: (x: number, y: number, z: number, amount: number) => void): KitchenHandles {
  const g = new THREE.Group();
  g.add(box(14, 0.04, 12, '#b89870', -30, 0.02, -28));
  // Tường gỗ (Bắc + Tây), khung xà.
  g.add(box(14, 3.4, 0.5, '#c2915e', -30, 1.7, -34));
  g.add(box(0.5, 3.4, 12, '#c2915e', -37, 1.7, -28));
  for (let i = 0; i <= 7; i++) g.add(box(0.18, 3.4, 0.56, C.woodDark, -37 + i * 2, 1.7, -34));
  for (let i = 0; i <= 6; i++) g.add(box(0.56, 3.4, 0.18, C.woodDark, -37, 1.7, -34 + i * 2));
  g.add(box(14, 0.2, 0.6, C.woodDark, -30, 3.3, -34));
  g.add(box(0.6, 0.2, 12, C.woodDark, -37, 3.3, -28));
  for (const [x, z] of [
    [-23.3, -33.7],
    [-23.3, -22.3],
    [-36.7, -22.3],
  ] as const) {
    g.add(cyl(0.18, 0.2, 3.4, C.woodDark, x, 1.7, z, 8));
  }
  g.add(box(14, 0.22, 0.25, C.woodDark, -30, 3.3, -22.3));
  g.add(box(0.25, 0.22, 12, C.woodDark, -23.3, 3.3, -28));
  // Kệ + hũ trên tường Bắc.
  for (const y of [1.5, 2.3]) {
    g.add(box(4, 0.06, 0.4, C.wood, -33.5, y, -33.55));
    for (let i = 0; i < 6; i++) {
      g.add(mesh(geo.lathe([[0, 0], [0.12, 0.01], [0.15, 0.12], [0.08, 0.24], [0.09, 0.28]], 8), mat(['#b5503a', '#d9b07a', '#6e8a9a'][i % 3]!), { x: -35.2 + i * 0.65, y: y + 0.03, z: -33.5 }));
    }
  }
  // Bếp lò gạch + nồi + chảo + ống khói.
  g.add(box(6, 0.85, 1.6, '#b0573c', -27, 0.425, -32.9));
  g.add(box(6.1, 0.1, 1.7, '#8a3f2a', -27, 0.88, -32.9));
  for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) g.add(box(0.95, 0.03, 0.02, '#e8c9a8', -29.5 + i + (k % 2) * 0.5, 0.18 + k * 0.25, -32.09));
  g.add(box(0.7, 0.5, 0.05, '#2a1610', -28.8, 0.4, -32.08));
  g.add(box(0.7, 0.5, 0.05, '#2a1610', -25.2, 0.4, -32.08));
  g.add(box(0.7, 3.2, 0.7, '#a24e36', -27, 2.4, -33.4));
  g.add(box(0.85, 0.15, 0.85, '#7a3324', -27, 4.05, -33.4));
  g.add(mesh(geo.lathe([[0, 0], [0.3, 0.02], [0.4, 0.2], [0.36, 0.38], [0.28, 0.42], [0, 0.42]], 12), mat('#4a3022'), { x: -28.8, y: 0.92, z: -32.9 }));
  g.add(mesh(new THREE.SphereGeometry(0.48, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#2b2b33', { metalness: 0.4, roughness: 0.5 }), { x: -25.2, y: 1.38, z: -32.9 }));
  // Củi nhỏ cạnh bếp, tỏi ớt treo.
  for (let i = 0; i < 5; i++) g.add(mesh(geo.cyl(0.07, 0.08, 0.8, 6), mat(C.wood), { x: -30.6 + (i % 3) * 0.17, y: 0.08 + Math.floor(i / 3) * 0.14, z: -32.3, rz: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.01, 0.01, 0.9, '#c8a064', -35.5 + i * 1.2, 2.75, -33.6, 3));
    for (let k = 0; k < 5; k++) g.add(mesh(geo.sphere(0.07, 6, 4), mat(i % 2 ? '#f2eee2' : '#d9312a'), { x: -35.5 + i * 1.2, y: 2.4 - k * 0.14, z: -33.55, scale: i % 2 ? 1 : [0.6, 1.4, 0.6] }));
  }
  addStatic(ctx, g);

  // Lửa trong 2 cửa lò (điều khiển bởi mini-game nấu cơm) + đèn hắt lửa.
  const fires: Record<'rice' | 'pan', { group: THREE.Group; mats: THREE.MeshStandardMaterial[]; level: number; target: number; smoke: number }> = {
    rice: { group: new THREE.Group(), mats: [], level: 0.25, target: 0.25, smoke: 0 },
    pan: { group: new THREE.Group(), mats: [], level: 0.25, target: 0.25, smoke: 0 },
  };
  for (const [key, x] of [
    ['rice', -28.8],
    ['pan', -25.2],
  ] as const) {
    const f = fires[key];
    f.group.position.set(x, 0.18, -32.15);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.MeshStandardMaterial({ color: i % 2 ? '#ffd166' : '#ff7a1a', emissive: i % 2 ? '#ffb43a' : '#ff5a10', emissiveIntensity: 2, flatShading: true, transparent: true, opacity: 0.95 });
      f.mats.push(m);
      const cone = mesh(geo.cone(0.09 + (i % 3) * 0.02, 0.35, 5), m, { x: (i - 2) * 0.1, y: 0.15, castShadow: false });
      cone.userData.phase = i * 1.3;
      f.group.add(cone);
    }
    f.group.add(mesh(geo.box(0.6, 0.08, 0.3), mat('#3a1a0a', { emissive: '#ff4a10', emissiveIntensity: 0.6 }), { y: 0.02 }));
    ctx.dynamics.add(f.group);
  }
  const fireLight = new THREE.PointLight('#ff8a3a', 6, 7, 1.6);
  fireLight.position.set(-27, 0.8, -31.6);
  ctx.lights.push(fireLight);
  let smokeAcc = 0;
  ctx.updates.push((dt, t) => {
    let total = 0;
    for (const key of ['rice', 'pan'] as const) {
      const f = fires[key];
      f.level += (f.target - f.level) * Math.min(1, dt * 3);
      total += f.level;
      f.group.children.forEach((c, i) => {
        if (!(c as THREE.Mesh).isMesh || i >= 5) return;
        const ph = c.userData.phase as number;
        c.scale.set(0.6 + f.level * 0.6, (0.4 + f.level * 1.4) * (0.8 + Math.sin(t * 12 + ph) * 0.25), 0.6 + f.level * 0.6);
      });
      for (const m of f.mats) m.emissiveIntensity = 1.2 + f.level * 2.2 + Math.sin(t * 15) * 0.3;
    }
    fireLight.intensity = 2 + total * 7 + Math.sin(t * 17) * 1.2;
    smokeAcc += dt;
    if (smokeAcc > 0.35) {
      smokeAcc = 0;
      smokeAt(-27, 4.3, -33.4, 0.6 + total * 0.3);
      if (fires.rice.smoke > 0.05) smokeAt(-28.8, 1.45, -32.9, fires.rice.smoke);
      if (fires.pan.smoke > 0.05) smokeAt(-25.2, 1.45, -32.9, fires.pan.smoke);
    }
  });

  const roof = new THREE.Group();
  const r = vietRoof({ w: 14.6, d: 12.6, h: 2.2, overhang: 0.8, lift: 0.5, color: '#9a4a32', pearl: false });
  r.position.set(-30, 3.45, -28);
  roof.add(r);
  ctx.dynamics.add(roof);
  hangingLantern(ctx, -26, 2.7, -25, '#e0352b', 0.9);
  hangingLantern(ctx, -33, 2.7, -25, '#e0352b', 0.9);
  return {
    roof,
    setStove(burner, state) {
      const f = fires[burner];
      f.target = Math.max(0.05, Math.min(1, state.fire));
      f.smoke = Math.max(0, Math.min(1, state.smoke));
    },
  };
}

// ───────────────────────── Kho ─────────────────────────

export function buildStorage(ctx: TempleCtx): void {
  const g = new THREE.Group();
  g.add(box(6, 2.6, 6, '#a0703f', -36, 1.3, -12));
  for (let i = 0; i < 7; i++) g.add(box(0.08, 2.6, 6.04, '#7a5230', -39 + i, 1.3, -12));
  g.add(box(0.06, 1.9, 1.7, '#2a1a10', -32.98, 0.95, -12));
  for (let i = 0; i < 3; i++) g.add(mesh(geo.sphere(0.3, 8, 6), mat('#d8c29a'), { x: -33.5, y: 0.3 + (i % 2) * 0.35, z: -12.5 + i * 0.45, scale: [1, 1.2, 0.8] }));
  addStatic(ctx, g);
  const sign = kit.signBoard('KHO ĐỒ CHAY', { width: 1.6, height: 0.4, bg: C.woodDark, border: C.gold, color: '#fff3c4' });
  sign.position.set(-32.92, 2.25, -12);
  sign.rotation.y = Math.PI / 2;
  addStatic(ctx, sign);
  const roof = vietRoof({ w: 6, d: 6, h: 1.7, overhang: 0.6, lift: 0.35, color: '#c9a45a', ridge: '#8a6a32', pearl: false });
  roof.position.set(-36, 2.6, -12);
  ctx.dynamics.add(roof);
}
