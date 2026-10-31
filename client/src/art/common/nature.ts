// Cây cỏ: cây tán tròn, thông, bụi, đá, cây Bồ đề, cây ăn quả trong vườn chùa, cỏ + hoa dại (instanced).
// Tán lá tả thực = hàng trăm tấm lá cắt alpha (texture lá vẽ sẵn), pháp tuyến uốn ra ngoài từ tâm tán.
import * as THREE from 'three';
import type { Rng } from '@shared/index';
import { kit } from '../kit';
import { windMaterial, type WindUniforms } from './wind';

const { geo, mesh } = kit;

export interface TreeMats {
  trunk: THREE.Material;
  /** Lá khối (lá chuối, tay thanh long…). */
  leaves: THREE.Material[];
  /** Vật liệu tấm lá (cắt alpha) cho tán lá thật; không có thì tán là khối đa diện. */
  foliage?: THREE.Material[];
}

let leafTex: THREE.CanvasTexture | null = null;

/** Texture chùm lá (nền trong suốt): lá mũi mác xám sáng (vật liệu nhuộm màu), mép tối, gân giữa sáng. */
export function leafTexture(): THREE.CanvasTexture {
  if (leafTex) return leafTex;
  leafTex = kit.canvasTexture(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 34; i++) {
      const x = 30 + rnd() * (w - 60);
      const y = 30 + rnd() * (h - 60);
      const len = 34 + rnd() * 30;
      const wid = 11 + rnd() * 8;
      const l = 62 + rnd() * 30;
      c.save();
      c.translate(x, y);
      c.rotate(rnd() * Math.PI * 2);
      c.beginPath();
      c.moveTo(-len / 2, 0);
      c.quadraticCurveTo(0, -wid, len / 2, 0);
      c.quadraticCurveTo(0, wid, -len / 2, 0);
      c.closePath();
      c.fillStyle = `hsl(80, 18%, ${l}%)`;
      c.fill();
      c.strokeStyle = `hsla(80, 25%, ${l - 22}%, 0.8)`;
      c.lineWidth = 1.5;
      c.stroke();
      c.beginPath();
      c.moveTo(-len / 2, 0);
      c.lineTo(len / 2 - 4, 0);
      c.strokeStyle = `hsla(70, 30%, ${Math.min(96, l + 18)}%, 0.85)`;
      c.lineWidth = 1.2;
      c.stroke();
      c.restore();
    }
  });
  leafTex.anisotropy = 4;
  return leafTex;
}

/**
 * Vật liệu tấm lá: texture lá cắt alpha (khử răng cưa bằng alpha-to-coverage), lay theo gió, pháp tuyến "uốn"
 * (không lật theo mặt trước/sau) để cả tán sáng tối mềm như một khối lá.
 */
export function leafMaterial(color: string, wind: WindUniforms, heightScale: number): THREE.MeshStandardMaterial {
  const base = new THREE.MeshStandardMaterial({ color, map: leafTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, alphaToCoverage: true });
  const mat = windMaterial(base, wind, heightScale);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
  };
  mat.customProgramCacheKey = () => `leaf-${heightScale}`;
  return mat;
}

/**
 * Tán lá thật: các tấm lá vuông (2 tam giác) rải trong khối elip bán kính `radius` (dẹt theo `squashY`), mặt lá chếch ra
 * ngoài, pháp tuyến hướng từ tâm tán ra. Gốc toạ độ = tâm tán.
 */
export function foliageGeometry(r: Rng, radius: number, density = 1, squashY = 0.82): THREE.BufferGeometry {
  const count = Math.round((10 + 20 * radius * radius) * density);
  const pos = new Float32Array(count * 18);
  const nor = new Float32Array(count * 18);
  const uv = new Float32Array(count * 12);
  const dir = new THREE.Vector3();
  const c = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  const order = [0, 1, 2, 0, 2, 3];
  for (let i = 0; i < count; i++) {
    const zc = r.next() * 2 - 1;
    const t = r.next() * Math.PI * 2;
    const sr = Math.sqrt(1 - zc * zc);
    dir.set(sr * Math.cos(t), zc, sr * Math.sin(t));
    c.copy(dir).multiplyScalar(radius * (0.35 + 0.65 * Math.sqrt(r.next())));
    c.y *= squashY;
    tmp.set(r.next() * 2 - 1, r.next() * 2 - 1, r.next() * 2 - 1).normalize();
    n.copy(dir).multiplyScalar(0.8).add(tmp).normalize();
    u.set(0, 1, 0);
    if (Math.abs(n.y) > 0.9) u.set(1, 0, 0);
    u.cross(n).normalize();
    v.crossVectors(n, u).normalize();
    const size = (0.55 + r.next() * 0.35) * Math.min(1.4, 0.75 + radius * 0.18);
    tmp.set(c.x, c.y / (squashY * squashY), c.z).normalize();
    for (let k = 0; k < 6; k++) {
      const q = corners[order[k]!]!;
      const o = (i * 6 + k) * 3;
      pos[o] = c.x + (u.x * q[0]! + v.x * q[1]!) * size;
      pos[o + 1] = c.y + (u.y * q[0]! + v.y * q[1]!) * size;
      pos[o + 2] = c.z + (u.z * q[0]! + v.z * q[1]!) * size;
      nor[o] = tmp.x;
      nor[o + 1] = tmp.y;
      nor[o + 2] = tmp.z;
      uv[(i * 6 + k) * 2] = q[0]! + 0.5;
      uv[(i * 6 + k) * 2 + 1] = q[1]! + 0.5;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

let needleTex: THREE.CanvasTexture | null = null;

/** Texture cành lá kim (nền trong suốt): cuống giữa, lá kim mảnh xiên xuống hai bên, xám sáng để vật liệu nhuộm màu. */
export function needleTexture(): THREE.CanvasTexture {
  if (needleTex) return needleTex;
  needleTex = kit.canvasTexture(128, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let b = 0; b < 3; b++) {
      const cx = w * (0.3 + b * 0.2);
      c.strokeStyle = 'hsl(30, 20%, 40%)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(cx, 8);
      c.lineTo(cx + (rnd() - 0.5) * 12, h - 8);
      c.stroke();
      for (let y = 14; y < h - 10; y += 4) {
        const len = 18 + rnd() * 16 * (1 - y / h) + 10;
        for (const s of [-1, 1]) {
          const l = 58 + rnd() * 30;
          c.strokeStyle = `hsla(95, 18%, ${l}%, 0.95)`;
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(cx, y);
          c.lineTo(cx + s * len, y + len * 0.55);
          c.stroke();
        }
      }
    }
  });
  needleTex.anisotropy = 4;
  return needleTex;
}

/** Vật liệu cành lá kim (như leafMaterial, dùng texture lá kim). */
export function needleMaterial(color: string, wind: WindUniforms, heightScale: number): THREE.MeshStandardMaterial {
  const m = leafMaterial(color, wind, heightScale);
  m.map = needleTexture();
  m.customProgramCacheKey = () => `needle-${heightScale}`;
  return m;
}

/**
 * Tán thông thật: các tầng cành (tấm lá kim cắt alpha) xếp quanh thân theo hình chóp, cành chĩa ra ngoài và rủ xuống,
 * pháp tuyến hướng ra ngoài + lên. Gốc toạ độ = gốc cây; tán từ `y0` tới `y0 + height`, bán kính đáy `radius`.
 */
export function coniferGeometry(r: Rng, y0: number, height: number, radius: number, density = 1): THREE.BufferGeometry {
  const tiers = Math.max(4, Math.round(height * 1.6));
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const out = new THREE.Vector3();
  const side = new THREE.Vector3();
  const corner = (p: THREE.Vector3, n: THREE.Vector3, u: number, v: number) => {
    pos.push(p.x, p.y, p.z);
    nor.push(n.x, n.y, n.z);
    uv.push(u, v);
  };
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y = y0 + k * height;
    const ring = radius * Math.pow(1 - k, 1.05) + 0.15;
    const count = Math.max(4, Math.round((5 + ring * 6) * density));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r.next() * 0.6 + t * 0.9;
      out.set(Math.cos(a), 0, Math.sin(a));
      side.set(-out.z, 0, out.x);
      const len = ring * (0.9 + r.next() * 0.3) + 0.25;
      const wid = Math.min(1.2, 0.35 + ring * 0.45);
      const droop = 0.25 + r.next() * 0.25;
      // Cành: tấm phẳng từ thân (gốc) chĩa ra ngoài, đầu rủ xuống; v = 1 ở gốc, 0 ở ngọn.
      const base = new THREE.Vector3(0, y, 0);
      const tip = out.clone().multiplyScalar(len).add(new THREE.Vector3(0, y - droop * len, 0));
      const n = out.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.8, 0)).normalize();
      const b0 = base.clone().addScaledVector(side, -wid * 0.25);
      const b1 = base.clone().addScaledVector(side, wid * 0.25);
      const t0 = tip.clone().addScaledVector(side, -wid * 0.5);
      const t1 = tip.clone().addScaledVector(side, wid * 0.5);
      corner(b0, n, 0, 1);
      corner(b1, n, 1, 1);
      corner(t1, n, 1, 0);
      corner(b0, n, 0, 1);
      corner(t1, n, 1, 0);
      corner(t0, n, 0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Một cụm tán: tấm lá thật nếu có vật liệu lá, không thì khối đa diện như cũ. */
function canopy(r: Rng, mats: TreeMats, rad: number, x: number, y: number, z: number, o: { ry?: number; squash?: number; detail?: number } = {}): THREE.Mesh {
  if (mats.foliage?.length) return mesh(foliageGeometry(r, rad, 1, o.squash ?? 0.82), r.pick(mats.foliage), { x, y, z, ry: o.ry });
  const squash = o.squash ?? 1;
  return mesh(geo.ico(rad, o.detail ?? 1), r.pick(mats.leaves), { x, y, z, ry: o.ry, scale: squash === 1 ? undefined : [1, squash, 1] });
}

function m(g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; scale?: number | [number, number, number] } = {}): THREE.Mesh {
  return mesh(g, mat, { x, y, z, rx: o.rx, ry: o.ry, rz: o.rz, scale: o.scale });
}

export function roundTree(r: Rng, mats: TreeMats, s = 1): THREE.Group {
  const g = new THREE.Group();
  const h = (2.1 + r.next() * 0.8) * s;
  g.add(m(geo.cyl(0.16 * s, 0.27 * s, h, 7), mats.trunk, 0, h / 2, 0, { rz: (r.next() - 0.5) * 0.08 }));
  g.add(m(geo.cyl(0.07 * s, 0.1 * s, 0.9 * s, 5), mats.trunk, 0.3 * s, h * 0.75, 0, { rz: -0.8 }));
  const n = 4 + r.int(0, 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.next();
    const rad = (0.95 + r.next() * 0.6) * s;
    g.add(canopy(r, mats, rad, Math.cos(a) * 0.75 * s, h + 0.35 * s + r.next() * 0.8 * s, Math.sin(a) * 0.75 * s, { ry: r.next() * 3 }));
  }
  g.add(canopy(r, mats, 1.25 * s, 0, h + 1.1 * s, 0));
  return g;
}

export function pineTree(r: Rng, mats: TreeMats, s = 1): THREE.Group {
  const g = new THREE.Group();
  const h = (5 + r.next() * 2.5) * s;
  g.add(m(geo.cyl(0.16 * s, 0.26 * s, h * 0.45, 6), mats.trunk, 0, h * 0.22, 0));
  if (mats.foliage?.length) {
    // Thân thon lên tới ngọn + các tầng cành lá kim.
    g.add(m(geo.cyl(0.05 * s, 0.16 * s, h * 0.6, 6), mats.trunk, 0, h * 0.72, 0));
    g.add(mesh(coniferGeometry(r, h * 0.22, h * 0.78, 1.9 * s), r.pick(mats.foliage)));
    return g;
  }
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const rad = (1.9 - t * 1.3) * s;
    g.add(m(geo.cone(rad, h * 0.38, 7), r.pick(mats.leaves), 0, h * 0.3 + t * h * 0.55, 0, { ry: r.next() * 3 }));
  }
  return g;
}

export function bush(r: Rng, mats: TreeMats, s = 1): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = r.next() * Math.PI * 2;
    const rad = (0.45 + r.next() * 0.3) * s;
    g.add(canopy(r, mats, rad, Math.cos(a) * 0.35 * s, rad * 0.7, Math.sin(a) * 0.35 * s, { ry: r.next() * 3, squash: 0.8, detail: 0 }));
  }
  return g;
}

export function rock(r: Rng, mat: THREE.Material, s = 1): THREE.Mesh {
  return m(geo.dodeca(0.5 * s), mat, 0, 0.18 * s, 0, { ry: r.next() * 3, rx: r.next() * 0.4, scale: [1 + r.next() * 0.5, 0.55 + r.next() * 0.3, 1] });
}

/** Cây Bồ đề cổ thụ: rễ nổi, thân xoắn, tán rộng nhiều tầng, rễ phụ buông xuống. */
export function bodhiTree(r: Rng, mats: TreeMats): THREE.Group {
  const g = new THREE.Group();
  g.add(m(geo.cyl(0.75, 1.15, 5.2, 9), mats.trunk, 0, 2.6, 0));
  g.add(m(geo.cyl(0.45, 0.65, 3.4, 8), mats.trunk, 0.5, 5.6, 0.2, { rz: -0.35 }));
  g.add(m(geo.cyl(0.4, 0.6, 3.2, 8), mats.trunk, -0.6, 5.5, -0.2, { rz: 0.4 }));
  g.add(m(geo.cyl(0.3, 0.45, 2.6, 7), mats.trunk, 0.1, 5.8, -0.7, { rx: 0.45 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.add(m(geo.cone(0.38, 1.9, 5), mats.trunk, Math.cos(a) * 1.05, 0.35, Math.sin(a) * 1.05, { rz: -Math.cos(a) * 1.25, rx: Math.sin(a) * 1.25 }));
  }
  const blobs: [number, number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r.next() * 0.4;
    const ring = i % 2 ? 3.6 : 2.2;
    blobs.push([Math.cos(a) * ring, 7.2 + r.next() * 1.8 - (ring > 3 ? 0.8 : 0), Math.sin(a) * ring, 2 + r.next() * 0.9]);
  }
  blobs.push([0, 9.6, 0, 2.8], [0.8, 8.8, 1, 2.3], [-1, 9, -0.8, 2.3]);
  for (const [x, y, z, rad] of blobs) g.add(canopy(r, mats, rad, x, y, z, { ry: r.next() * 3, squash: 0.78 }));
  for (let i = 0; i < 9; i++) {
    const a = r.next() * Math.PI * 2;
    const d = 2 + r.next() * 2;
    g.add(m(geo.cyl(0.03, 0.03, 2.4 + r.next() * 1.5, 3), mats.trunk, Math.cos(a) * d, 5.6, Math.sin(a) * d));
  }
  return g;
}

// ───────────────────────── Cây ăn quả (vườn chùa) ─────────────────────────

function fruitCluster(g: THREE.Group, mat: THREE.Material, geom: THREE.BufferGeometry, cx: number, cy: number, cz: number, n: number, spread: number, r: Rng): void {
  for (let i = 0; i < n; i++) {
    const a = r.next() * Math.PI * 2;
    g.add(m(geom, mat, cx + Math.cos(a) * spread * r.next(), cy - r.next() * spread * 0.6, cz + Math.sin(a) * spread * r.next()));
  }
}

export function bananaPlant(r: Rng, mats: TreeMats): THREE.Group {
  const g = new THREE.Group();
  const stem = kit.mat('#7fb24a');
  g.add(m(geo.cyl(0.18, 0.26, 2.3, 7), stem, 0, 1.15, 0));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.Group();
    leaf.add(m(geo.box(0.55, 0.03, 2.1), r.pick(mats.leaves), 0, 0, 1.05));
    leaf.position.set(0, 2.3, 0);
    leaf.rotation.set(-0.55 - r.next() * 0.4, a, 0);
    g.add(leaf);
  }
  const bunch = kit.mat('#a6c94a');
  for (let i = 0; i < 6; i++) g.add(m(geo.torus(0.22, 0.05, 4, 6, 1.2), bunch, 0.35, 1.7 - i * 0.12, 0.2, { ry: i * 1.1 }));
  g.add(m(geo.cone(0.13, 0.35, 6), kit.mat('#7a2a4a'), 0.35, 1.0, 0.2, { rx: Math.PI }));
  return g;
}

export function papayaTree(r: Rng, mats: TreeMats): THREE.Group {
  const g = new THREE.Group();
  g.add(m(geo.cyl(0.11, 0.18, 3.4, 6), kit.mat('#9a8a6a'), 0, 1.7, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const leaf = new THREE.Group();
    leaf.add(m(geo.cyl(0.02, 0.02, 1.3, 3), kit.mat('#7fb24a'), 0, 0, 0.65, { rx: Math.PI / 2 }));
    leaf.add(m(geo.ico(0.42, 0), r.pick(mats.leaves), 0, 0, 1.35, { scale: [1.2, 0.25, 1] }));
    leaf.position.set(0, 3.4, 0);
    leaf.rotation.set(-0.35 - (i % 2) * 0.25, a, 0);
    g.add(leaf);
  }
  fruitCluster(g, kit.mat('#f59a2c'), geo.capsule(0.11, 0.16, 3, 7), 0, 3.0, 0, 7, 0.28, r);
  return g;
}

export function dragonFruitPlant(r: Rng, mats: TreeMats): THREE.Group {
  const g = new THREE.Group();
  g.add(m(geo.box(0.22, 1.9, 0.22), kit.mat('#bdb7aa'), 0, 0.95, 0));
  g.add(m(geo.cyl(0.55, 0.55, 0.08, 8), kit.mat('#bdb7aa'), 0, 1.9, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const arm = new THREE.Group();
    arm.add(m(geo.cyl(0.07, 0.09, 1.3, 3), r.pick(mats.leaves), 0, -0.6, 0));
    arm.position.set(Math.cos(a) * 0.45, 1.95, Math.sin(a) * 0.45);
    arm.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    g.add(arm);
  }
  fruitCluster(g, kit.mat('#d4246f'), geo.sphere(0.13, 7, 6), 0, 1.6, 0, 6, 0.7, r);
  return g;
}

/** Cây ăn quả tán tròn có quả (bưởi, xoài, phật thủ, mãng cầu). */
export function fruitTree(r: Rng, mats: TreeMats, fruit: { color: string; geo: THREE.BufferGeometry; count: number }, s = 1): THREE.Group {
  const g = roundTree(r, mats, s);
  fruitCluster(g, kit.mat(fruit.color), fruit.geo, 0, 2.6 * s, 0, fruit.count, 1.4 * s, r);
  return g;
}

// ───────────────────────── Cỏ, hoa dại ─────────────────────────

function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(0.028, 0.3 + (i % 2) * 0.1, 3);
    c.translate(0, 0.15, 0);
    c.rotateZ((i - 1.5) * 0.28);
    c.rotateY(i * 1.3);
    c.translate((i - 1.5) * 0.04, 0, ((i * 7) % 3) * 0.03 - 0.03);
    parts.push(c.toNonIndexed());
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const p of parts) total += p.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    const a = p.getAttribute('position').array as Float32Array;
    pos.set(a, o);
    o += a.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

export interface ScatterOptions {
  count: number;
  /** Vùng rải: hàm trả true nếu điểm hợp lệ. */
  accept: (x: number, z: number) => boolean;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  scale: [number, number];
}

export interface ScatterLayer {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Màu theo từng instance (vật liệu nên để trắng); bỏ trống = màu vật liệu. */
  colors?: string[];
  castShadow?: boolean;
}

/** Rải các lớp instanced mesh dùng chung vị trí (vd cuống xanh + bông màu), tất định theo rng. */
export function scatter(r: Rng, layers: ScatterLayer[], o: ScatterOptions): THREE.InstancedMesh[] {
  const mats: THREE.Matrix4[] = [];
  const d = new THREE.Object3D();
  for (let tries = 0; tries < o.count * 8 && mats.length < o.count; tries++) {
    const x = o.bounds.minX + r.next() * (o.bounds.maxX - o.bounds.minX);
    const z = o.bounds.minZ + r.next() * (o.bounds.maxZ - o.bounds.minZ);
    if (!o.accept(x, z)) continue;
    d.position.set(x, 0, z);
    d.rotation.set(0, r.next() * Math.PI * 2, 0);
    d.scale.setScalar(o.scale[0] + r.next() * (o.scale[1] - o.scale[0]));
    d.updateMatrix();
    mats.push(d.matrix.clone());
  }
  const c = new THREE.Color();
  return layers.map((L) => {
    const im = new THREE.InstancedMesh(L.geometry, L.material, Math.max(1, mats.length));
    mats.forEach((mt, i) => {
      im.setMatrixAt(i, mt);
      if (L.colors) im.setColorAt(i, c.set(L.colors[(i * 7 + 3) % L.colors.length]!));
    });
    im.count = mats.length;
    im.castShadow = L.castShadow ?? false;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    return im;
  });
}

/**
 * Bông hoa dại: 5 cánh thuôn hơi khum lên quanh nhuỵ tròn (thay khối đa diện kiểu "viên ngọc"), mặt bông hơi nghiêng
 * như hướng nắng. Gốc ở chân cuống: bông nằm ở đỉnh cuống (y ≈ 0,34).
 */
function flowerHeadGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const R = 0.082;
  const tri = (a: number[], b: number[], c: number[]) => {
    // Giữ mặt tam giác hướng lên (nhìn từ trên xuống thấy mặt trước).
    const ny = (b[2]! - a[2]!) * (c[0]! - a[0]!) - (b[0]! - a[0]!) * (c[2]! - a[2]!);
    if (ny >= 0) pos.push(...a, ...b, ...c);
    else pos.push(...a, ...c, ...b);
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const at = (r: number, w: number, h: number) => [ca * r - sa * w, h, sa * r + ca * w];
    const base = at(0.012, 0, 0.012);
    const l1 = at(R * 0.42, -R * 0.26, 0.016);
    const r1 = at(R * 0.42, R * 0.26, 0.016);
    const l2 = at(R * 0.8, -R * 0.2, 0.03);
    const r2 = at(R * 0.8, R * 0.2, 0.03);
    const tip = at(R, 0, 0.042);
    tri(base, l1, r1);
    tri(l1, l2, r2);
    tri(l1, r2, r1);
    tri(l2, tip, r2);
  }
  // Nhuỵ: chỏm tròn nhỏ giữa bông.
  const disc = new THREE.SphereGeometry(0.02, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  disc.translate(0, 0.012, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...pos, ...(disc.getAttribute('position').array as Float32Array)], 3));
  g.computeVertexNormals();
  g.rotateX(-0.25);
  g.translate(0, 0.33, 0);
  return g;
}

export const GRASS_TUFT = tuftGeometry();
export const FLOWER_STEM = new THREE.CylinderGeometry(0.012, 0.012, 0.32, 3).translate(0, 0.16, 0);
export const FLOWER_HEAD = flowerHeadGeometry();
