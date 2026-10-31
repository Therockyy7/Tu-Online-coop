// Mặt đất Chùa: địa hình (bằng trong tường — gồm cả sân trên Đại Pháp Đường phía Bắc, đồi thoải bên ngoài), sân gạch
// đỏ Bát Tràng, lối đá, cỏ + hoa dại lay theo gió (instanced), rừng cây ngoài tường (instanced).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PHAP_DUONG, type MapDef } from '@shared/index';
import { FLOWER_HEAD, FLOWER_STEM, GRASS_TUFT, coniferGeometry, foliageGeometry, leafMaterial, needleMaterial, scatter } from '../common/nature';
import { windMaterial } from '../common/wind';
import { kit } from '../kit';
import { applySurface } from '../pbr';
import type { TempleCtx } from './ctx';

type Rect = [minX: number, maxX: number, minZ: number, maxZ: number];
type Seg = [x1: number, z1: number, x2: number, z2: number, w: number];

/** Lối đi đá (tâm-tâm + bề rộng). */
export const PATHS: Seg[] = [
  [0, 39.5, 0, -18.6, 4],
  [-15, -11, -24, -11, 2.4],
  [-24, -11, -24, -21, 2.2],
  [-24, -11, -32.5, -11, 2],
  [15, -12, 21, -12, 2.4],
  [2, 2, 31, 2, 2.4],
  [31, 2, 31, -24.4, 2],
  [17, 2, 19.6, 14.6, 2],
  [2, 15.5, 4.4, 15.5, 2],
  [-2, 10, -19.4, 10, 2.4],
  [-12, 10, -12, 17.6, 1.8],
  [-12, 17.6, -37, 17.6, 1.6],
  [-2, 32, -30, 32, 2],
  [-30, 32, -30, 37, 2],
  [2, 31, 8, 31, 2],
  [-2, 31, -8, 31, 2],
  // Hai đường lên sân Đại Pháp Đường: lối Đông qua nghi môn, lối Tây len giữa tường Chánh Điện và thớt chẻ củi.
  [18, -12, 18, -42, 2.4],
  [-12.4, -21, -12.4, -42, 1.6],
];
const COURTYARD: Rect = [-15, 15, -20.2, -2.4];

/** Khuôn viên trong tường bao (tính tới tâm tường): x ∈ [−40, 40], z ∈ [−100, 40] — gồm cả sân trên phía Bắc. */
const YARD: Rect = [-40, 40, -100, 40];
const PLAZA = PHAP_DUONG.plaza;

/** Vùng không mọc cỏ (nhà, sân, ao…), tính thêm lề. */
const NO_GRASS: Rect[] = [
  [-12.5, 12.5, -38.5, -19.5],
  [-37.8, -22.4, -34.8, -21.4],
  [-39.6, -32.4, -15.6, -8.4],
  [23.4, 38.6, -37.6, -24.2],
  [20.6, 29.4, -18.4, -9.6],
  [-21, -12.6, -35.2, -27.2],
  [-34, -26, -18.2, -13.6],
  [-8.6, 8.6, 37.2, 40],
  [-33, -27, 33, 35],
  [-11, -7, 32.4, 34.6],
  [7, 11, 32.4, 34.6],
  // Đại Pháp Đường (nền + bệ điện), sân lát đá trước điện, nền lát dưới hai nghi môn (dựng ở phapDuongYard.ts).
  [-24, 24, -96, -57],
  // Sân: lề X rộng hơn để bao cả bờ cây xén ngoài bó vỉa Đông/Tây (x = ±31) — cỏ không mọc xuyên bờ cây.
  [PLAZA.minX - 1.8, PLAZA.maxX + 1.8, PLAZA.minZ, PLAZA.maxZ + 0.6],
  ...PHAP_DUONG.gates.map(([gx, half]): Rect => [gx - half - 0.6, gx + half + 0.6, PLAZA.maxZ, PHAP_DUONG.gateZ + 1.3]),
];

/** Bờ ao: lỗ khoét trên địa hình rộng hơn bán kính collider ao chừng này (đá kè che mép). */
export const POND_BANK = 0.05;

/**
 * Khoét lỗ tròn trên địa hình (bỏ fragment trong bán kính) để lòng ao thật bên dưới hiện ra — thay vì đặt
 * đáy ao trùng mặt phẳng với đất (z-fighting nhấp nháy khi di chuyển).
 */
function cutHole(m: THREE.Material, x: number, z: number, r: number): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHole = { value: new THREE.Vector3(x, z, r) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vHoleXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHoleXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uHole;\nvarying vec2 vHoleXZ;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (distance(vHoleXZ, uHole.xy) < uHole.z) discard;');
  };
}

/** Khoảng cách (kiểu Chebyshev) từ điểm ra ngoài khuôn viên đã nới thêm `pad` mỗi phía; âm = còn ở trong. */
function outsideYard(x: number, z: number, pad: number): number {
  return Math.max(YARD[0] - pad - x, x - YARD[1] - pad, YARD[2] - pad - z, z - YARD[3] - pad);
}

/** Độ cao địa hình: bằng phẳng trong khuôn viên nới 4 m (x ∈ [−44, 44], z ∈ [−104, 44]), ngoài đó đồi thoải dần. */
export function terrainHeight(x: number, z: number): number {
  const out = outsideYard(x, z, 4);
  if (out < 0) return 0;
  const k = Math.min(1, out / 110);
  const s = k * k * (3 - 2 * k);
  return s * 26 + Math.sin(x * 0.07) * Math.cos(z * 0.06) * 3 * s;
}

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function inRect(x: number, z: number, r: Rect, pad = 0): boolean {
  return x >= r[0] - pad && x <= r[1] + pad && z >= r[2] - pad && z <= r[3] + pad;
}

function nearSeg(x: number, z: number, s: Seg, pad = 0): boolean {
  const [x1, z1, x2, z2, w] = s;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2));
  const px = x1 + dx * t;
  const pz = z1 + dz * t;
  return Math.hypot(x - px, z - pz) <= w / 2 + pad;
}

export function buildGround(ctx: TempleCtx, map: MapDef): void {
  // ── Địa hình ──
  const size = 340;
  const seg = 136;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const inside = new THREE.Color('#729f46');
  const inside2 = new THREE.Color('#62903e');
  const outside = new THREE.Color('#5f8d40');
  const hill = new THREE.Color('#4d7a3a');
  const dirt = new THREE.Color('#8a7656');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = noise(x * 0.12, z * 0.12);
    const n2 = noise(x * 0.5 + 10, z * 0.5);
    if (outsideYard(x, z, 1) < 0) {
      c.copy(inside).lerp(inside2, n * 0.8);
      if (n2 > 0.82) c.lerp(dirt, 0.25);
    } else {
      c.copy(outside).lerp(hill, Math.min(1, h / 20) * 0.8 + n * 0.25);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false });
  const pond = map.colliders.find((x) => x.tag === 'pond');
  if (pond?.kind === 'circle') cutHole(terrainMat, pond.x, pond.z, pond.r + POND_BANK);
  applySurface(terrainMat, 'grass');
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  ctx.dynamics.add(terrain);

  // ── Sân gạch + lối đá ──
  const [cx0, cx1, cz0, cz1] = COURTYARD;
  const cw = cx1 - cx0;
  const cd = cz1 - cz0;
  // Gạch Bát Tràng: texture PBR thật (ba mặt theo mét), màu nung đỏ đất.
  const courtMat = applySurface(new THREE.MeshStandardMaterial({ color: '#b86a4c', roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2 }), 'tile');
  const court = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd).rotateX(-Math.PI / 2), courtMat);
  court.position.set((cx0 + cx1) / 2, 0.015, (cz0 + cz1) / 2);
  court.receiveShadow = true;
  ctx.dynamics.add(court);
  const border = new THREE.Group();
  for (const [w, d, x, z] of [
    [cw + 0.4, 0.3, (cx0 + cx1) / 2, cz0],
    [cw + 0.4, 0.3, (cx0 + cx1) / 2, cz1],
    [0.3, cd, cx0, (cz0 + cz1) / 2],
    [0.3, cd, cx1, (cz0 + cz1) / 2],
  ] as const) {
    border.add(kit.mesh(kit.geo.box(w, 0.06, d), kit.mat('#8f877a'), { x, y: 0.03, z }));
  }
  ctx.statics.add(border);

  const pathMat = applySurface(new THREE.MeshStandardMaterial({ color: '#b3aa98', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }), 'stone');
  for (const [x1, z1, x2, z2, w] of PATHS) {
    const len = Math.hypot(x2 - x1, z2 - z1) + w * 0.4;
    const g = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, pathMat);
    m.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2);
    m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    m.receiveShadow = true;
    ctx.dynamics.add(m);
  }

  // ── Cỏ + hoa dại (instanced, lay theo gió) ──
  const blocked = (x: number, z: number, pad: number) => {
    if (Math.abs(x) > 39.2 || z > 39.2 || z < -99.2) return true;
    if (inRect(x, z, COURTYARD, pad)) return true;
    for (const r of NO_GRASS) if (inRect(x, z, r, pad)) return true;
    for (const s of PATHS) if (nearSeg(x, z, s, pad + 0.15)) return true;
    for (const col of map.colliders) {
      if (col.kind === 'circle') {
        if (Math.hypot(x - col.x, z - col.z) < col.r + pad + (col.tag === 'pond' ? 0.6 : 0.1)) return true;
      } else if (inRect(x, z, [col.x - col.w / 2, col.x + col.w / 2, col.z - col.d / 2, col.z + col.d / 2], pad)) {
        return true;
      }
    }
    for (const s of map.stations) {
      if ((s.kind === 'flower_bed' || s.kind === 'veggie_patch') && Math.hypot(x - s.x, z - s.z) < 2.6) return true;
      if (s.kind === 'meditation_cushion' && Math.hypot(x - 10, z - 15.5) < 6.2) return true;
    }
    return false;
  };
  const bounds = { minX: -39.5, maxX: 39.5, minZ: -99.5, maxZ: 39.5 };
  const grassMat = windMaterial(kit.matUnique('#ffffff', { roughness: 0.9 }), ctx.wind, 0.5);
  const [grass] = scatter(ctx.rng, [{ geometry: GRASS_TUFT, material: grassMat, colors: ['#6aa046', '#5e9340', '#78ad50', '#86b45a', '#669a48'] }], {
    // Khuôn viên mở rộng lên phía Bắc: tăng số bụi ~60% để giữ mật độ cỏ như cũ.
    count: 8300,
    accept: (x, z) => !blocked(x, z, 0.1),
    bounds,
    scale: [0.6, 1.1],
  });
  ctx.dynamics.add(grass!);
  const stemMat = windMaterial(kit.matUnique('#4f9a3f'), ctx.wind, 0.5);
  const headMat = windMaterial(kit.matUnique('#ffffff', { roughness: 0.7 }), ctx.wind, 0.5);
  const flowers = scatter(
    ctx.rng,
    [
      { geometry: FLOWER_STEM, material: stemMat },
      { geometry: FLOWER_HEAD, material: headMat, colors: ['#ffd23f', '#ffffff', '#ff8fb1', '#c39bff', '#ff7a5a', '#8fd3ff'] },
    ],
    { count: 1100, accept: (x, z) => !blocked(x, z, 0.2) && noise(x * 0.15, z * 0.15) > 0.45, bounds, scale: [0.8, 1.3] },
  );
  for (const f of flowers) ctx.dynamics.add(f);

  // ── Rừng ngoài tường (instanced) ──
  // Thông: tầng cành lá kim thật; cây tán tròn: tấm lá cắt alpha — đều thưa hơn cây trong sân cho nhẹ.
  const pineFoliage = coniferGeometry(ctx.rng, 1.6, 5.4, 2.2, 0.7);
  const roundFoliage = mergeGeometries([
    foliageGeometry(ctx.rng, 1.8, 0.6).translate(0, 4.2, 0),
    foliageGeometry(ctx.rng, 1.4, 0.6).translate(1.1, 3.6, 0.4),
    foliageGeometry(ctx.rng, 1.3, 0.6).translate(-1.0, 3.7, -0.5),
  ])!;
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3, 6).translate(0, 1.5, 0);
  const roundLeafMat = leafMaterial('#c8d8b8', ctx.wind, 8);
  const trunkMat = kit.mat('#7a5236');
  const N = 230;
  const pineIm = new THREE.InstancedMesh(pineFoliage, needleMaterial('#c4d4bc', ctx.wind, 8), N);
  const roundIm = new THREE.InstancedMesh(roundFoliage, roundLeafMat, N);
  const trunkIm = new THREE.InstancedMesh(trunk, trunkMat, N * 2);
  const d = new THREE.Object3D();
  const col = new THREE.Color();
  let np = 0;
  let nr = 0;
  let nt = 0;
  for (let i = 0; i < N * 2; i++) {
    const a = ctx.rng.next() * Math.PI * 2;
    const r = 47 + Math.pow(ctx.rng.next(), 0.7) * 95;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 46 && z > -106 && z < 46) continue;
    if (z > 40 && Math.abs(x) < 10) continue;
    const y = terrainHeight(x, z) - 0.2;
    const s = 0.9 + ctx.rng.next() * 0.9;
    d.position.set(x, y, z);
    d.rotation.set(0, ctx.rng.next() * 6, 0);
    d.scale.setScalar(s);
    d.updateMatrix();
    const pine = ctx.rng.next() < 0.55;
    if (pine && np < N) {
      pineIm.setMatrixAt(np, d.matrix);
      pineIm.setColorAt(np, col.set(ctx.rng.pick(['#3f8a4a', '#4f9a55', '#367a40', '#2f6e3a'])));
      np++;
    } else if (!pine && nr < N) {
      roundIm.setMatrixAt(nr, d.matrix);
      roundIm.setColorAt(nr, col.set(ctx.rng.pick(['#5fae4e', '#6fbf4a', '#4f9a3f', '#7cc35a'])));
      nr++;
    } else {
      continue;
    }
    if (nt < N * 2) trunkIm.setMatrixAt(nt++, d.matrix);
  }
  pineIm.count = np;
  roundIm.count = nr;
  trunkIm.count = nt;
  for (const im of [pineIm, roundIm, trunkIm]) {
    im.castShadow = false;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    ctx.dynamics.add(im);
  }
}
