// Mái chùa kiểu Việt: mái chái 4 mặt cong vểnh ở góc, ngói ống (sọc màu theo hàng ngói), mặt dưới là ván gỗ
// (nhìn từ trong nhà ở góc nhìn thứ nhất), bờ nóc, đầu đao, ngọc giữa nóc và đôi rồng chầu (tùy chọn).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { kit } from '../kit';
import { applySurfaceUV } from '../pbr';

export interface RoofOptions {
  w: number;
  d: number;
  h: number;
  overhang?: number;
  lift?: number;
  color?: string;
  under?: string;
  ridge?: string;
  dragons?: boolean;
  pearl?: boolean;
  /** Số cột ngói theo chiều dài. */
  columns?: number;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Gốc tọa độ = tâm mép mái (y = 0), nóc chạy dọc trục X. */
export function vietRoof(o: RoofOptions): THREE.Group {
  const over = o.overhang ?? 0.9;
  const W = o.w + over * 2;
  const D = o.d + over * 2;
  const H = o.h;
  const lift = o.lift ?? H * 0.3;
  const R = Math.max(0, W - D);
  const curve = (u: number) => Math.pow(Math.abs(2 * u - 1), 3);
  const cols = o.columns ?? Math.max(10, Math.round(W * 1.6));
  const rows = 6;
  const pos: number[] = [];
  const uvs: number[] = [];
  type Corner = { p: THREE.Vector3; uv: [number, number] };
  const pushQuad = (a: Corner, b: Corner, c: Corner, d: Corner, flip: boolean) => {
    const tri = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const k of tri) {
      pos.push(k.p.x, k.p.y, k.p.z);
      uvs.push(k.uv[0], k.uv[1]);
    }
  };
  // UV tính bằng mét: u chạy dọc mép mái, v ngược dốc mái → hàng ngói luôn song song mép mái.
  const face = (eave: (u: number) => THREE.Vector3, top: (u: number) => THREE.Vector3, n: number, flip: boolean, alongX: boolean) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < rows; j++) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        const v0 = j / rows;
        const v1 = (j + 1) / rows;
        const p = (u: number, v: number): Corner => {
          const e = eave(u);
          const t = top(u);
          return { p: e.clone().lerp(t, v), uv: [alongX ? e.x : e.z, v * e.distanceTo(t)] };
        };
        pushQuad(p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1), flip);
      }
    }
  };
  for (const side of [1, -1]) {
    face(
      (u) => tmpA.set(-W / 2 + W * u, lift * curve(u), (side * D) / 2).clone(),
      (u) => tmpB.set(-R / 2 + R * u, H, 0).clone(),
      cols,
      side === -1,
      true,
    );
  }
  const endCols = Math.max(6, Math.round(D * 1.4));
  for (const side of [1, -1]) {
    face(
      (u) => tmpA.set((side * W) / 2, lift * curve(u), -D / 2 + D * u).clone(),
      () => tmpB.set((side * R) / 2, H, 0).clone(),
      endCols,
      side === 1,
      false,
    );
  }
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  raw.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Gộp đỉnh trùng trong cùng một mặt mái → pháp tuyến mượt theo độ cong, mép bờ chảy vẫn sắc.
  const geom = mergeVertices(raw);
  raw.dispose();
  geom.computeVertexNormals();

  const roof = new THREE.Group();
  const tiles = applySurfaceUV(new THREE.MeshStandardMaterial({ roughness: 0.78, side: THREE.FrontSide }), 'roof', o.color ?? kit.PALETTE.roofTile);
  roof.add(kit.mesh(geom, tiles));
  // Mặt dưới mái: ván gỗ (thấy khi đứng trong nhà).
  const underMat = kit.mat(o.under ?? '#7a4a2e', { doubleSide: false });
  const underside = new THREE.Mesh(geom, underMat.clone());
  (underside.material as THREE.MeshStandardMaterial).side = THREE.BackSide;
  underside.position.y = -0.04;
  underside.receiveShadow = true;
  roof.add(underside);

  const ridgeMat = kit.mat(o.ridge ?? kit.PALETTE.roofRidge);
  if (R > 0.01) roof.add(kit.mesh(kit.geo.box(R + 0.4, 0.3, 0.36), ridgeMat, { y: H + 0.1 }));
  // Bờ chảy (4 đường gờ chéo từ đầu nóc xuống góc mái).
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const a = new THREE.Vector3((sx * R) / 2, H + 0.08, 0);
      const b = new THREE.Vector3((sx * W) / 2, lift + 0.08, (sz * D) / 2);
      const len = a.distanceTo(b);
      const beam = kit.mesh(kit.geo.box(0.2, 0.2, len), ridgeMat);
      beam.position.copy(a).add(b).multiplyScalar(0.5);
      beam.lookAt(b);
      roof.add(beam);
      // Đầu đao: sừng cong vểnh lên ở góc.
      const horn = new THREE.Group();
      horn.position.copy(b);
      const dir = Math.atan2(sx, sz);
      horn.rotation.y = dir;
      for (let k = 0; k < 4; k++) {
        horn.add(kit.mesh(kit.geo.cone(0.13 - k * 0.025, 0.42, 6), ridgeMat, { x: 0, y: 0.12 + k * 0.22, z: 0.12 + k * 0.08 - k * k * 0.05, rx: 0.6 - k * 0.35 }));
      }
      roof.add(horn);
    }
  }
  for (const s of [1, -1]) {
    roof.add(kit.mesh(kit.geo.cone(0.16, 0.8, 6), ridgeMat, { x: (s * (R + 0.4)) / 2, y: H + 0.4, rz: -s * 0.55 }));
  }
  if (o.pearl ?? true) {
    roof.add(kit.mesh(kit.geo.sphere(0.24, 12, 10), kit.mat('#ffd166', { emissive: '#e8a33a', emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.4 }), { y: H + 0.55 }));
    for (let i = 0; i < 5; i++) {
      roof.add(kit.mesh(kit.geo.cone(0.07, 0.3, 5), kit.mat('#ffb347', { emissive: '#ff8a1a', emissiveIntensity: 0.5 }), { y: H + 0.85, rz: (i - 2) * 0.35 }));
    }
  }
  if (o.dragons && R > 2) {
    for (const s of [1, -1]) roof.add(dragon(s, R, H));
  }
  return roof;
}

/** Rồng chầu ngọc trên bờ nóc (chuỗi khối uốn lượn, đầu hướng vào giữa). */
function dragon(side: number, R: number, H: number): THREE.Group {
  const g = new THREE.Group();
  const body = kit.mat('#3f9a6a', { roughness: 0.6 });
  const fin = kit.mat('#ffd166', { emissive: '#b8862f', emissiveIntensity: 0.25 });
  const n = 11;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = side * (0.55 + t * (R / 2 - 0.3));
    const y = H + 0.35 + Math.sin(t * Math.PI * 2.2) * 0.28 + (1 - t) * 0.15;
    const r = 0.16 - t * 0.06;
    g.add(kit.mesh(kit.geo.sphere(r, 8, 6), body, { x, y }));
    if (i % 2 === 0) g.add(kit.mesh(kit.geo.cone(0.05, 0.18, 4), fin, { x, y: y + r + 0.05 }));
  }
  const hx = side * 0.45;
  g.add(kit.mesh(kit.geo.sphere(0.2, 10, 8), body, { x: hx, y: H + 0.62, scale: [1.3, 0.9, 0.9] }));
  g.add(kit.mesh(kit.geo.cone(0.08, 0.3, 5), fin, { x: hx + side * 0.05, y: H + 0.85, rz: side * 0.6 }));
  g.add(kit.mesh(kit.geo.cone(0.05, 0.28, 4), body, { x: hx - side * 0.2, y: H + 0.62, rz: side * Math.PI / 2 }));
  for (const z of [0.09, -0.09]) g.add(kit.mesh(kit.geo.sphere(0.035, 6, 4), kit.mat('#fff3b0', { emissive: '#ffd166', emissiveIntensity: 0.8 }), { x: hx - side * 0.12, y: H + 0.7, z }));
  return g;
}
