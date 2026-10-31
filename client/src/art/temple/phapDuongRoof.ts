// Đại Pháp Đường — mái ba tầng chồng diêm: tầng dưới phủ cả khối điện lẫn hiên trước (mép mái cao 12 m), hai tầng
// diêm (dải tường gỗ có song cửa chạy quanh) nâng tầng giữa và tầng trên; nóc tầng trên cao ~24 m (gấp đôi Chánh Điện),
// bờ nóc lớn, lưỡng long chầu ngọc lửa, hai đầu kìm. Mỗi tầng là một mái chái đầy đủ (vietRoof) cùng tâm, cùng độ dốc
// ~0,42–0,45: phần chìm của tầng dưới luôn nằm dưới tầng diêm + tầng trên nên không lộ ra ngoài.
import * as THREE from 'three';
import { kit } from '../kit';
import { vietRoof } from './roof';
import { PD } from './phapDuongDecor';

const { geo, mat, mesh } = kit;

/** Cao độ mép mái tầng dưới — xà hiên, trần hiên và đỉnh tường ngoài của điện tính theo mốc này. */
export const EAVE_Y = 12;
/** Tâm (z) chung của ba tầng mái: giữa khối điện + hiên trước (lưới cột trong điện cũng đối xứng quanh đây). */
export const ROOF_Z = -76.4;
const ROOF_COLOR = '#b5503a';

/** Một tầng mái: phần nhà bên dưới `w` (theo X) × `d` (theo Z), cao từ mép tới nóc `h`, cao độ mép `y`, vươn, vểnh góc. */
interface Tier {
  w: number;
  d: number;
  h: number;
  y: number;
  over: number;
  lift: number;
}

/** Tầng dưới ôm tường điện (x ±22,4) và hàng cột hiên (z −58); mỗi tầng trên lùi đều vào trong 3,6–3,8 m. */
const TIERS: Tier[] = [
  { w: 45.6, d: 36.8, h: 8.4, y: EAVE_Y, over: 1.6, lift: 1.1 },
  { w: 41.2, d: 32.4, h: 7.875, y: 14.6, over: 1.3, lift: 1.0 },
  { w: 36.6, d: 27.8, h: 6.84, y: 17.2, over: 1.3, lift: 0.9 },
];

/** Độ dốc mặt mái (cao / tầm ngang từ mép tới nóc). */
function slope(t: Tier): number {
  return t.h / ((t.d + 2 * t.over) / 2);
}

/** Mặt phẳng có UV lặp `ru × rv` lần (texture lặp: ô trần, song cửa, diềm chạm). */
export function repPlane(w: number, h: number, ru: number, rv: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
  return g;
}

/**
 * Dải tầng diêm (đồ tĩnh): lõi gỗ sẫm, dải song cửa chạy quanh phần lộ ra giữa hai tầng mái, cột son chia nhịp (mỗi
 * hộp xuyên suốt dải, lộ hai đầu ở hai mặt đối diện), cột góc, xà đầu son. Đáy chìm dưới mặt mái tầng dưới.
 */
function band(stat: THREE.Group, w: number, d: number, bottom: number, top: number, lattice: THREE.Material): void {
  const h = top - bottom;
  stat.add(mesh(geo.box(w, h, d), mat(PD.frame), { y: (bottom + top) / 2, z: ROOF_Z }));
  const seen = bottom + 0.3;
  const rh = (top - seen) * 0.56;
  const ry = (seen + top - 0.24) / 2;
  for (const [len, x, z, rot] of [
    [w, 0, ROOF_Z + d / 2 + 0.005, 0],
    [w, 0, ROOF_Z - d / 2 - 0.005, Math.PI],
    [d, w / 2 + 0.005, ROOF_Z, Math.PI / 2],
    [d, -w / 2 - 0.005, ROOF_Z, -Math.PI / 2],
  ] as const) {
    stat.add(mesh(repPlane(len, rh, len / 0.6, rh / 0.6), lattice, { x, y: ry, z, ry: rot, castShadow: false }));
  }
  const postH = h - 0.26;
  const postY = bottom + postH / 2;
  const red = mat(PD.lacquerDeep);
  const nx = Math.round(w / 3.4);
  for (let i = 1; i < nx; i++) stat.add(mesh(geo.box(0.28, postH, d + 0.12), red, { x: -w / 2 + (i * w) / nx, y: postY, z: ROOF_Z }));
  const nz = Math.round(d / 3.4);
  for (let j = 1; j < nz; j++) stat.add(mesh(geo.box(w + 0.12, postH, 0.28), red, { y: postY, z: ROOF_Z - d / 2 + (j * d) / nz }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stat.add(mesh(geo.box(0.36, postH, 0.36), red, { x: (sx * w) / 2, y: postY, z: ROOF_Z + (sz * d) / 2 }));
  stat.add(mesh(geo.box(w + 0.24, 0.24, d + 0.24), mat(PD.lacquer), { y: top - 0.12, z: ROOF_Z }));
}

/**
 * Bờ nóc tầng trên (toạ độ cục bộ, nóc dài `R` theo X ở cao độ `y`): thân bờ lớn + mũ bờ, ngọc lửa trên đài mây, đôi
 * rồng chầu (chuỗi khối uốn lượn, vây vàng, đầu hướng vào ngọc), hai đầu kìm vểnh ở hai đầu bờ. Cùng vật liệu với rồng
 * và ngọc của các mái khác trong chùa, chỉ to hơn cho xứng tầm.
 */
function crest(R: number, y: number): THREE.Group {
  const g = new THREE.Group();
  const ridge = mat('#7a3324');
  const cap = mat('#963f2c');
  const body = mat('#3f9a6a', { roughness: 0.6 });
  const fin = mat('#ffd166', { emissive: '#b8862f', emissiveIntensity: 0.25 });
  const pearl = mat('#ffd166', { emissive: '#e8a33a', emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.4 });
  const fire = mat('#ffb347', { emissive: '#ff8a1a', emissiveIntensity: 0.5 });
  const eye = mat('#fff3b0', { emissive: '#ffd166', emissiveIntensity: 0.8 });
  g.add(mesh(geo.box(R + 2.4, 0.95, 0.85), ridge, { y: y + 0.3 }));
  g.add(mesh(geo.box(R + 2.7, 0.16, 1.05), cap, { y: y + 0.85 }));
  // Ngọc lửa trên đài mây giữa nóc.
  g.add(mesh(geo.sphere(0.62, 12, 8), cap, { y: y + 1.1, scale: [1.6, 0.6, 1] }));
  g.add(mesh(geo.sphere(0.72, 16, 12), pearl, { y: y + 1.85 }));
  for (let i = 0; i < 7; i++) g.add(mesh(geo.cone(0.2, 0.95, 6), fire, { x: (i - 3) * 0.16, y: y + 2.55, rz: (i - 3) * 0.32 }));
  for (const s of [1, -1]) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = s * (1.5 + t * (R / 2 - 0.9));
      const yy = y + 1.3 + Math.sin(t * Math.PI * 2.2) * 0.55 + (1 - t) * 0.3;
      const r = 0.42 - t * 0.2;
      g.add(mesh(geo.sphere(r, 10, 8), body, { x, y: yy }));
      if (i % 2 === 0) g.add(mesh(geo.cone(0.12, 0.42, 4), fin, { x, y: yy + r + 0.12 }));
    }
    const hx = s * 1.25;
    g.add(mesh(geo.sphere(0.5, 12, 10), body, { x: hx, y: y + 1.95, scale: [1.3, 0.9, 0.9] }));
    g.add(mesh(geo.cone(0.2, 0.75, 5), fin, { x: hx + s * 0.15, y: y + 2.5, rz: s * 0.6 }));
    g.add(mesh(geo.cone(0.13, 0.7, 4), body, { x: hx - s * 0.5, y: y + 1.95, rz: (s * Math.PI) / 2 }));
    for (const z of [0.22, -0.22]) g.add(mesh(geo.sphere(0.09, 6, 4), eye, { x: hx - s * 0.3, y: y + 2.12, z }));
    // Đầu kìm: sừng lớn vểnh ra ngoài ở đầu bờ.
    g.add(mesh(geo.cone(0.38, 1.9, 6), cap, { x: s * (R / 2 + 1.1), y: y + 1.25, rz: -s * 0.55 }));
  }
  return g;
}

/**
 * Mái Đại Pháp Đường: ba tầng mái + bờ nóc vào nhóm trả về (để ở nhóm động như mái các điện khác); hai dải tầng diêm
 * vào `stat` (gộp mesh). `lattice` = vật liệu song cửa nhìn từ ngoài vào (dùng chung với cửa sổ tường điện).
 */
export function buildPhapDuongRoof(stat: THREE.Group, lattice: THREE.Material): THREE.Group {
  const roof = new THREE.Group();
  TIERS.forEach((t, i) => {
    const r = vietRoof({ w: t.w, d: t.d, h: t.h, overhang: t.over, lift: t.lift, color: ROOF_COLOR, pearl: false });
    r.position.set(0, t.y, ROOF_Z);
    roof.add(r);
    const up = TIERS[i + 1];
    if (up) {
      const inset = (t.w + 2 * t.over - up.w) / 2;
      band(stat, up.w, up.d, t.y + inset * slope(t) - 0.3, up.y + up.over * slope(up) - 0.1, lattice);
    }
  });
  const top = TIERS[TIERS.length - 1]!;
  const c = kit.mergeStatic(crest(top.w - top.d, top.y + top.h), 'phap-duong-crest');
  c.position.z = ROOF_Z;
  roof.add(c);
  return roof;
}
