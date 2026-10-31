// Đại Pháp Đường — khu thờ chính sát tường Bắc: bệ thờ hai tầng sơn son thếp vàng (bậc lên phía trước), phông hậu sơn
// son có câu đối, tượng Phật đá lớn, vầng hào quang (thân quang viền lửa + viên quang sau đầu, toả sáng và xoay rất chậm),
// đôi tháp đèn hoa sen vàng, chân nến, bình sen, đỉnh trầm, chuông gia trì và mõ trước bệ.
// Bố cục đọc từ PHAP_DUONG (shared) — bệ, tượng, đèn trùng khớp va chạm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PHAP_DUONG } from '@shared/index';
import { kit } from '../kit';
import { realisticBuddha } from './buddha';
import { flame, verticalBoard, type TempleCtx } from './ctx';
import { PD, gilt, glowCard, raysTexture, rod } from './phapDuongDecor';

const { geo, mat, mesh } = kit;
const P = PHAP_DUONG;
const A = P.altar;
const IN_N = P.zNorth + P.wall / 2;
const FRONT = A.z + A.d / 2;
/** Tầng trên lùi nhẹ so với mặt trước tầng dưới (đế sen của tượng gần chạm mép trước bệ). */
const UPPER_FRONT = FRONT - 0.15;
const LOWER_TOP = 1.0;

function addBox(g: THREE.Object3D, w: number, h: number, d: number, m: string | THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const o = mesh(geo.box(w, h, d), typeof m === 'string' ? mat(m) : m, { x, y, z, castShadow: cast });
  g.add(o);
  return o;
}

/** Khung chỉ vàng hình chữ nhật trên mặt phẳng hướng +Z (tâm `x, y`, mặt ở `z`). */
function goldFrame(g: THREE.Object3D, w: number, h: number, x: number, y: number, z: number, t = 0.05, m: THREE.Material = gilt()): void {
  addBox(g, w, t, 0.03, m, x, y + h / 2 - t / 2, z, false);
  addBox(g, w, t, 0.03, m, x, y - h / 2 + t / 2, z, false);
  addBox(g, t, h - 2 * t, 0.03, m, x - w / 2 + t / 2, y, z, false);
  addBox(g, t, h - 2 * t, 0.03, m, x + w / 2 - t / 2, y, z, false);
}

/** Đường bao thân quang (nửa phải, từ đáy lên đỉnh): elip phần dưới, thu nhỏ dần thành búp ở trên. */
function aureoleHalf(y0: number, y1: number, a: number, n: number): THREE.Vector2[] {
  const k = 0.4;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const f = s <= k ? Math.sqrt(Math.max(0, 1 - ((k - s) / (1 - k)) ** 2)) : Math.pow(Math.max(0, Math.cos((Math.PI / 2) * ((s - k) / (1 - k)))), 0.75);
    pts.push(new THREE.Vector2(a * f, y0 + (y1 - y0) * s));
  }
  return pts;
}

/** Hình kín từ nửa phải (đối xứng qua trục đứng), co giãn quanh tâm `c` theo tỉ lệ `sc`. */
function aureoleShape(half: THREE.Vector2[], c: THREE.Vector2, sc: number): THREE.Shape {
  const right = half.map((p) => p.clone().sub(c).multiplyScalar(sc).add(c));
  const left = right
    .slice(0, -1)
    .reverse()
    .map((p) => new THREE.Vector2(-p.x, p.y));
  return new THREE.Shape([...right, ...left]);
}

/** Đặt UV theo tâm `c` và bán kính `r` (tia hào quang toả từ ngực tượng thay vì từ tâm khung bao). */
function radialUV(g: THREE.BufferGeometry, c: THREE.Vector2, r: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + (pos.getX(i) - c.x) / (2 * r), 0.5 + (pos.getY(i) - c.y) / (2 * r));
  uv.needsUpdate = true;
  return g;
}

/** Lưỡi lửa (gốc tại gốc toạ độ, chĩa +Y, đầu hơi cong). */
function tongueShape(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.bezierCurveTo(-w * 0.6, h * 0.38, -w * 0.08, h * 0.58, w * 0.08, h);
  s.bezierCurveTo(w * 0.22, h * 0.62, w * 0.62, h * 0.36, w / 2, 0);
  s.closePath();
  return s;
}

/**
 * Vầng hào quang sau tượng (mặt phẳng z = `z`, nhìn +Z): thân quang hình búp sen viền lửa nhiều lớp (vàng – son –
 * vàng – trường tia), chuỗi hạt, viên quang sau đầu (đĩa tia xoay chậm), quầng sáng cộng màu trên phông hậu.
 */
function buildMandorla(ctx: TempleCtx, dyn: THREE.Group, z: number, headY: number, radial: THREE.Texture): void {
  const g = new THREE.Group();
  const y0 = 3.7;
  const y1 = 11.72;
  const a = 4.75;
  const half = aureoleHalf(y0, y1, a, 90);
  const c = new THREE.Vector2(0, y0 + (y1 - y0) * 0.4);
  const goldGlow = new THREE.MeshStandardMaterial({ color: '#f2c35c', emissive: '#d4901f', emissiveIntensity: 0.7, metalness: 0.55, roughness: 0.35 });
  const redBand = new THREE.MeshStandardMaterial({ color: '#8a1f14', emissive: '#5a0e06', emissiveIntensity: 0.55, roughness: 0.5 });
  const rays = raysTexture();
  const field = new THREE.MeshStandardMaterial({ map: rays, emissiveMap: rays, emissive: '#ffffff', emissiveIntensity: 0.72, roughness: 0.55, metalness: 0.2 });
  const layer = (sc: number, m: THREE.Material, dz: number) => {
    const sg = new THREE.ShapeGeometry(aureoleShape(half, c, sc), 1);
    g.add(mesh(sg, m, { z: z + dz, castShadow: false }));
    return sg;
  };
  layer(1.0, goldGlow, 0);
  layer(0.93, redBand, 0.015);
  layer(0.895, goldGlow, 0.03);
  const chest = new THREE.Vector2(0, 6.6);
  g.add(mesh(radialUV(new THREE.ShapeGeometry(aureoleShape(half, c, 0.86), 1), chest, 5.4), field, { z: z + 0.045, castShadow: false }));

  // Chuỗi hạt vàng giữa hai dải viền (dọc đường bao, bỏ mép đáy).
  const beads: THREE.Vector3[] = [];
  const bead = new THREE.Vector2();
  for (let i = 3; i < half.length; i += 3) {
    bead.copy(half[i]!).sub(c).multiplyScalar(0.965).add(c);
    beads.push(new THREE.Vector3(bead.x, bead.y, z + 0.02));
    if (bead.x > 0.05) beads.push(new THREE.Vector3(-bead.x, bead.y, z + 0.02));
  }
  const beadGeo = beads.map((p) => geo.sphere(0.07, 8, 6).clone().translate(p.x, p.y, p.z));
  g.add(mesh(mergeAll(beadGeo), gilt(true), { castShadow: false }));

  // Lưỡi lửa quanh viền: hướng theo pháp tuyến ngoài, ngả lên trên; dài dần về phía đỉnh, lưỡi đỉnh lớn nhất.
  const tongues: THREE.BufferGeometry[] = [];
  const lens: number[] = [0];
  for (let i = 1; i < half.length; i++) lens.push(lens[i - 1]! + half[i]!.distanceTo(half[i - 1]!));
  const total = lens[lens.length - 1]!;
  const at = (d: number): number => {
    let i = 1;
    while (i < lens.length - 1 && lens[i]! < d) i++;
    return i;
  };
  const step = 0.4;
  for (let d = 0.55, k = 0; d < total - 0.25; d += step, k++) {
    const i = at(d);
    const p = half[i]!;
    const q = half[i - 1]!;
    const tx = p.x - q.x;
    const ty = p.y - q.y;
    const nl = Math.hypot(tx, ty) || 1;
    // Pháp tuyến ngoài của nửa phải (đi từ đáy lên): (ty, −tx).
    const nx = ty / nl;
    const ny = -tx / nl;
    const s = (p.y - y0) / (y1 - y0);
    // Gần đỉnh lưỡi lửa ngắn lại để không chạm trần.
    const h = (0.42 + 0.16 * Math.sin(k * 2.3) ** 2) * (0.85 + 0.35 * s) * (s > 0.9 ? 0.75 : 1);
    const ang = Math.atan2(ny + 0.55, nx) - Math.PI / 2;
    // Nửa trái là ảnh gương: pháp tuyến (−nx, ny) → góc quay đổi dấu.
    for (const side of [1, -1]) {
      const tg = new THREE.ShapeGeometry(tongueShape(0.34, h), 4);
      tg.rotateZ(side * ang);
      tg.translate(side * (p.x - nx * 0.07), p.y - ny * 0.07, z - 0.02);
      tongues.push(tg);
    }
  }
  const crest = new THREE.ShapeGeometry(tongueShape(0.5, 0.42), 4);
  crest.translate(0, y1 - 0.12, z - 0.02);
  tongues.push(crest);
  const flameMat = new THREE.MeshStandardMaterial({ color: '#ffcf6a', emissive: '#ff9a2a', emissiveIntensity: 1.25, metalness: 0.35, roughness: 0.4, side: THREE.DoubleSide });
  ctx.flicker.push({ mat: flameMat, base: 1.25, speed: 1.7, phase: 0.4 });
  g.add(mesh(mergeAll(tongues), flameMat, { castShadow: false }));

  // Viên quang sau đầu: đĩa tia (xoay chậm), vòng hạt, viền vàng kép.
  const nimbus = mesh(new THREE.CircleGeometry(1.42, 48), field, { y: headY, z: z + 0.06, castShadow: false });
  g.add(nimbus);
  g.add(mesh(geo.torus(1.5, 0.055, 8, 64), goldGlow, { y: headY, z: z + 0.08, castShadow: false }));
  g.add(mesh(geo.torus(0.98, 0.03, 6, 48), goldGlow, { y: headY, z: z + 0.075, castShadow: false }));
  const ringBeads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 30; i++) {
    const t = (i / 30) * Math.PI * 2;
    ringBeads.push(geo.sphere(0.055, 8, 6).clone().translate(Math.cos(t) * 1.3, headY + Math.sin(t) * 1.3, z + 0.08));
  }
  g.add(mesh(mergeAll(ringBeads), gilt(true), { castShadow: false }));

  // Quầng sáng cộng màu trên phông hậu (thở chậm).
  const glowMat = new THREE.MeshBasicMaterial({ map: radial, color: '#ffb45c', transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false });
  g.add(mesh(new THREE.PlaneGeometry(13.5, 11.5), glowMat, { y: 7.7, z: z - 0.5, castShadow: false, receiveShadow: false }));
  const haloMat = new THREE.MeshBasicMaterial({ map: radial, color: '#ffd38a', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  g.add(mesh(new THREE.PlaneGeometry(4.6, 4.6), haloMat, { y: headY, z: z + 0.1, castShadow: false, receiveShadow: false }));
  dyn.add(g);
  ctx.updates.push((_dt, t) => {
    nimbus.rotation.z = t * 0.05;
    glowMat.opacity = 0.3 + Math.sin(t * 0.5) * 0.05;
    haloMat.opacity = 0.36 + Math.sin(t * 0.8 + 1) * 0.06;
    field.emissiveIntensity = 0.7 + Math.sin(t * 0.6) * 0.07;
  });
}

/** Gộp nhiều mảnh cùng kiểu thuộc tính (ShapeGeometry / SphereGeometry: index, position, normal, uv) thành một hình. */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return out;
}

/** Tháp đèn hoa sen vàng đứng (gốc tại sàn `x, z`): đế sen, thân trụ có đốt, ba tầng đĩa sen cắm nến, búp sen đỉnh. */
function lotusLampTower(ctx: TempleCtx, stat: THREE.Group, dyn: THREE.Group, x: number, z: number, floorY: number, glow: THREE.Material): void {
  const gold = gilt();
  const goldLight = gilt(true);
  const wax = mat(PD.wax, { roughness: 0.6 });
  const g = new THREE.Group();
  g.position.set(x, floorY, z);
  g.add(
    mesh(
      geo.lathe(
        [
          [0.56, 0],
          [0.57, 0.1],
          [0.49, 0.16],
          [0.44, 0.28],
          [0.3, 0.36],
          [0.16, 0.42],
          [0.11, 0.6],
        ],
        20,
      ),
      gold,
    ),
  );
  const petal = geo.sphere(0.2, 8, 6);
  const petals = (count: number, rr: number, y: number, tilt: number, sc: number, off = 0) => {
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      pivot.rotation.y = Math.PI / 2 - a;
      pivot.add(mesh(petal, goldLight, { z: 0.12 * sc, rx: tilt, scale: [0.5 * sc, 0.16 * sc, 1 * sc], castShadow: false }));
      g.add(pivot);
    }
  };
  petals(10, 0.42, 0.22, -0.7, 1);
  g.add(mesh(geo.cyl(0.065, 0.09, 3.7, 12), gold, { y: 0.6 + 1.85 }));
  for (const y of [1.25, 2.3, 3.25]) g.add(mesh(geo.torus(0.1, 0.03, 6, 16), goldLight, { y, rx: Math.PI / 2 }));
  const tiers: [number, number, number][] = [
    [1.75, 0.85, 6],
    [2.75, 0.66, 5],
    [3.65, 0.46, 4],
  ];
  for (const [y, R, n] of tiers) {
    g.add(
      mesh(
        geo.lathe(
          [
            [0.06, -0.09],
            [R * 0.5, -0.05],
            [R * 0.9, 0.04],
            [R, 0.1],
          ],
          24,
        ),
        mat(PD.gold, { metalness: 0.55, roughness: 0.36, emissive: '#5a3a0c', emissiveIntensity: 0.5, doubleSide: true }),
        { y },
      ),
    );
    petals(n * 2, R * 0.92, y + 0.06, -0.45, R * 1.1, Math.PI / (n * 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const cx = Math.cos(a) * R * 0.74;
      const cz = Math.sin(a) * R * 0.74;
      g.add(mesh(geo.cyl(0.045, 0.045, 0.22, 10), wax, { x: cx, y: y + 0.13, z: cz }));
      flame(ctx, dyn, x + cx, floorY + y + 0.3, z + cz, 1.6);
    }
  }
  // Búp sen đỉnh + nến lớn.
  g.add(
    mesh(
      geo.lathe(
        [
          [0.05, 0],
          [0.2, 0.06],
          [0.28, 0.2],
          [0.24, 0.3],
        ],
        20,
      ),
      gold,
      { y: 4.28 },
    ),
  );
  petals(8, 0.2, 4.4, -1.0, 0.85);
  g.add(mesh(geo.cyl(0.07, 0.07, 0.34, 12), wax, { y: 4.62 }));
  flame(ctx, dyn, x, floorY + 4.86, z, 2.6);
  stat.add(g);
  for (const [y, s] of [
    [2.7, 3.6],
    [4.85, 1.7],
  ] as const) {
    const sp = glowCard(glow, s);
    sp.position.set(x, floorY + y, z);
    dyn.add(sp);
  }
}

/**
 * Khu thờ chính: bệ, phông hậu, tượng, hào quang, tháp đèn, đồ thờ. Phần tĩnh vào `stat`, phần sáng/động vào `dyn`.
 * `floorY` = mặt sàn điện; `radial` = texture quầng sáng dùng chung.
 */
export function buildPhapDuongAltar(ctx: TempleCtx, stat: THREE.Group, dyn: THREE.Group, floorY: number, radial: THREE.Texture): void {
  const gold = gilt();
  const goldLight = gilt(true);
  const lacquer = PD.lacquer;
  const midZ = A.z;

  // ── Bệ hai tầng: tầng dưới rộng đủ khung va chạm, tầng trên lùi hai bên; chỉ vàng viền mép, ô hộc mặt trước ──
  addBox(stat, A.w, LOWER_TOP - floorY + 0.005, A.d, PD.lacquerDeep, P.x, (LOWER_TOP + floorY - 0.005) / 2, midZ);
  addBox(stat, A.w + 0.04, 0.2, A.d + 0.02, PD.lacquerDark, P.x, floorY + 0.095, midZ + 0.01);
  // Chỉ vàng chỉ lộ ở mép (đỉnh thấp hơn mặt tầng dưới 5 mm, như chỉ tầng trên) — không phủ vàng cả mặt tầng dưới.
  addBox(stat, A.w + 0.06, 0.07, A.d + 0.05, gold, P.x, LOWER_TOP - 0.04, midZ + 0.025, false);
  const upW = 11.6;
  const upD = UPPER_FRONT - IN_N;
  const upZ = (UPPER_FRONT + IN_N) / 2;
  addBox(stat, upW, A.h - LOWER_TOP, upD, lacquer, P.x, (A.h + LOWER_TOP) / 2, upZ);
  addBox(stat, upW + 0.05, 0.06, upD + 0.03, gold, P.x, A.h - 0.035, upZ + 0.015, false);
  addBox(stat, upW + 0.05, 0.05, upD + 0.03, gold, P.x, LOWER_TOP + 0.06, upZ + 0.015, false);
  // Ô hộc mặt trước: tầng dưới 6 ô, tầng trên 4 ô + mặt sen vàng giữa.
  for (let i = 0; i < 6; i++) goldFrame(stat, 2.25, 0.5, P.x - A.w / 2 + 1.35 + i * 2.66, (floorY + 0.2 + LOWER_TOP - 0.07) / 2, FRONT + 0.016);
  for (const x of [-4.4, -1.75, 1.75, 4.4]) goldFrame(stat, 2.2, 0.62, P.x + x, (LOWER_TOP + A.h) / 2 + 0.01, UPPER_FRONT + 0.016);
  stat.add(mesh(new THREE.CircleGeometry(0.34, 24), goldLight, { y: (LOWER_TOP + A.h) / 2 + 0.01, z: UPPER_FRONT + 0.012, castShadow: false }));
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    stat.add(mesh(geo.sphere(0.1, 8, 6), gold, { x: Math.cos(t) * 0.42, y: (LOWER_TOP + A.h) / 2 + 0.01 + Math.sin(t) * 0.42, z: UPPER_FRONT + 0.02, scale: [1, 1, 0.35], castShadow: false }));
  }
  // Bậc lên trước bệ (thấp, chỉ trang trí) có mũi bậc vàng.
  for (const [w, top, dz] of [
    [6.4, floorY + 0.11, 0.18],
    [7.0, floorY + 0.05, 0.53],
  ] as const) {
    addBox(stat, w, top - floorY + 0.005, 0.35, PD.lacquerDark, P.x, (top + floorY - 0.005) / 2, FRONT + dz);
    addBox(stat, w + 0.02, 0.025, 0.03, gold, P.x, top - 0.01, FRONT + dz + 0.17, false);
  }

  // ── Phông hậu sơn son trên tường Bắc, khung vàng, đôi câu đối ──
  const backZ = IN_N + 0.06;
  addBox(stat, 17.6, 10.7, 0.1, PD.lacquerDeep, P.x, 6.35, backZ);
  goldFrame(stat, 17.6, 10.7, P.x, 6.35, backZ + 0.065, 0.12, gold);
  goldFrame(stat, 17.0, 10.1, P.x, 6.35, backZ + 0.065, 0.04, goldLight);
  for (const [x, text] of [
    [7.25, 'Phật Pháp Vô Biên'],
    [-7.25, 'Từ Bi Hỷ Xả'],
  ] as const) {
    const b = verticalBoard(text, 0.78, 5.6, PD.ink, PD.goldBright);
    b.position.set(P.x + x, 6.9, backZ + 0.1);
    stat.add(b);
  }

  // ── Tượng Phật (lưới dựng bằng Web Worker → nhóm động) + vầng hào quang ──
  const buddha = realisticBuddha();
  buddha.group.position.set(P.x, A.h, A.z);
  buddha.group.scale.setScalar(P.statueScale);
  dyn.add(buddha.group);
  buildMandorla(ctx, dyn, IN_N + 0.75, A.h + 3.05 * P.statueScale, radial);

  // ── Chân nến cao + bình sen trên tầng trên; đỉnh trầm trên tầng dưới ──
  const wax = mat(PD.wax, { roughness: 0.6 });
  const porcelain = mat('#eef2f8', { roughness: 0.25 });
  for (const s of [-1, 1]) {
    const cx = P.x + s * 5.15;
    const cz = UPPER_FRONT - 0.5;
    stat.add(
      mesh(
        geo.lathe(
          [
            [0.22, 0],
            [0.09, 0.06],
            [0.06, 0.62],
            [0.15, 0.68],
            [0.17, 0.72],
          ],
          16,
        ),
        gold,
        { x: cx, y: A.h, z: cz },
      ),
    );
    stat.add(mesh(geo.cyl(0.075, 0.075, 0.5, 12), wax, { x: cx, y: A.h + 0.97, z: cz }));
    flame(ctx, dyn, cx, A.h + 1.27, cz, 3.2);
    const vx = P.x + s * 4.95;
    const vz = A.z + 1.2;
    stat.add(
      mesh(
        geo.lathe(
          [
            [0, 0],
            [0.15, 0.02],
            [0.27, 0.28],
            [0.17, 0.56],
            [0.13, 0.7],
            [0.19, 0.8],
          ],
          16,
        ),
        porcelain,
        { x: vx, y: A.h, z: vz },
      ),
    );
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2;
      const tip = new THREE.Vector3(vx + Math.cos(t) * 0.32, A.h + 1.45 + (i % 2) * 0.22, vz + Math.sin(t) * 0.22);
      rod(stat, new THREE.Vector3(vx, A.h + 0.75, vz), tip, 0.012, mat('#4f8a3a'));
      stat.add(mesh(geo.sphere(0.11, 10, 8), mat('#f3a6bd', { roughness: 0.6 }), { x: tip.x, y: tip.y + 0.08, z: tip.z, scale: [0.8, 1.25, 0.8] }));
    }
    for (const t of [0.6, 2.4, 4.3]) {
      stat.add(mesh(geo.sphere(0.24, 12, 6), mat('#3f7f3a', { roughness: 0.7 }), { x: vx + Math.cos(t) * 0.3, y: A.h + 1.05, z: vz + Math.sin(t) * 0.24, scale: [1, 0.12, 1], rz: Math.cos(t) * 0.3 }));
    }
    // Đỉnh trầm đồng ba chân trên tầng dưới (khói hương bay lên định kỳ).
    const burner = new THREE.Group();
    burner.position.set(P.x + s * 6.9, LOWER_TOP, A.z + 1.4);
    burner.scale.setScalar(2.2);
    const bronze = mat(PD.bronze, { metalness: 0.6, roughness: 0.38 });
    burner.add(
      mesh(
        geo.lathe(
          [
            [0, 0],
            [0.2, 0.02],
            [0.27, 0.16],
            [0.24, 0.3],
            [0.17, 0.34],
          ],
          16,
        ),
        bronze,
        { y: 0.1 },
      ),
    );
    for (let i = 0; i < 3; i++) {
      const t = (i / 3) * Math.PI * 2 + Math.PI / 2;
      burner.add(mesh(geo.cyl(0.035, 0.025, 0.12, 6), bronze, { x: Math.cos(t) * 0.17, y: 0.06, z: Math.sin(t) * 0.17 }));
    }
    burner.add(
      mesh(
        geo.lathe(
          [
            [0.19, 0],
            [0.16, 0.08],
            [0.08, 0.16],
            [0, 0.18],
          ],
          16,
        ),
        bronze,
        { y: 0.44 },
      ),
    );
    burner.add(mesh(geo.sphere(0.06, 10, 8), goldLight, { y: 0.66 }));
    for (const k of [1, -1]) burner.add(mesh(geo.torus(0.07, 0.015, 4, 10), bronze, { x: k * 0.28, y: 0.3, ry: Math.PI / 2 }));
    stat.add(burner);
  }
  let smokeAcc = 0;
  let smokeSide = 1;
  ctx.updates.push((dt) => {
    smokeAcc += dt;
    if (smokeAcc > 0.6) {
      smokeAcc = 0;
      smokeSide = -smokeSide;
      ctx.smoke?.(P.x + smokeSide * 6.9, LOWER_TOP + 0.72 * 2.2, A.z + 1.4, 0.35);
    }
  });

  // ── Đôi tháp đèn hoa sen vàng trước hai góc bệ ──
  const lampGlow = new THREE.MeshBasicMaterial({ map: radial, color: '#ffbf66', transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const x of P.lampXs) lotusLampTower(ctx, stat, dyn, x, P.lampZ, floorY, lampGlow);

  // ── Chuông gia trì (bên trái) và mõ (bên phải) đặt trên nệm đỏ trước bệ ──
  const cushion = mat(PD.fabricRed);
  const rugTop = floorY + 0.012;
  const bellX = P.x - 3.0;
  const fishX = P.x + 3.0;
  const itemZ = FRONT + 1.55;
  for (const x of [bellX, fishX]) {
    stat.add(
      mesh(
        geo.lathe(
          [
            [0, 0],
            [0.4, 0],
            [0.44, 0.05],
            [0.42, 0.11],
            [0.3, 0.15],
            [0, 0.15],
          ],
          20,
        ),
        cushion,
        { x, y: rugTop, z: itemZ },
      ),
    );
  }
  stat.add(
    mesh(
      geo.lathe(
        [
          [0.06, 0],
          [0.25, 0.02],
          [0.34, 0.13],
          [0.37, 0.3],
          [0.35, 0.32],
          [0.32, 0.17],
          [0.2, 0.06],
        ],
        28,
      ),
      mat(PD.bronze, { metalness: 0.65, roughness: 0.33 }),
      { x: bellX, y: rugTop + 0.15, z: itemZ },
    ),
  );
  stat.add(mesh(geo.cyl(0.025, 0.025, 0.42, 8), mat(PD.frame), { x: bellX + 0.5, y: rugTop + 0.02, z: itemZ + 0.1, rz: Math.PI / 2, ry: 0.4 }));
  stat.add(mesh(geo.sphere(0.32, 18, 12), mat(lacquer, { roughness: 0.4 }), { x: fishX, y: rugTop + 0.42, z: itemZ, scale: [1, 0.82, 1.18] }));
  stat.add(mesh(geo.box(0.36, 0.035, 0.05), mat(PD.ink), { x: fishX, y: rugTop + 0.42, z: itemZ + 0.375 }));
  stat.add(mesh(geo.torus(0.3, 0.02, 6, 28), gold, { x: fishX, y: rugTop + 0.42, z: itemZ, rx: Math.PI / 2, scale: [1.08, 1.3, 1] }));
  stat.add(mesh(geo.cyl(0.02, 0.02, 0.4, 6), mat(PD.frame), { x: fishX - 0.48, y: rugTop + 0.04, z: itemZ + 0.15, rz: Math.PI / 2, ry: -0.5 }));
  stat.add(mesh(geo.sphere(0.065, 10, 8), mat(PD.dado), { x: fishX - 0.66, y: rugTop + 0.06, z: itemZ + 0.24 }));
}
