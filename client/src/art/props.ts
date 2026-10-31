// Vật cầm tay (HeldItem) dựng bằng hình khối low-poly. Gốc tọa độ = điểm cầm.
// Kiểu cầm: 'tool' bám theo tay (chổi), 'upright' cầm một tay nhưng luôn đứng thẳng, 'carry' ôm hai tay trước ngực.
import * as THREE from 'three';
import type { HeldItem, HeldKind } from '@shared/index';
import type { CreateHeldItemMesh } from './api';
import { kit } from './kit';

const { mat, geo, mesh, glowMat } = kit;

export type GripStyle = 'tool' | 'upright' | 'carry';

const CARRY = new Set<HeldKind>([
  'water_bucket',
  'animal',
  'supply',
  'rice',
  'rice_washed',
  'veggies',
  'veggies_cut',
  'rice_pot',
  'veggie_dish',
  'vase',
  'firewood',
]);

export function gripStyle(kind: HeldKind): GripStyle {
  if (kind === 'broom') return 'tool';
  return CARRY.has(kind) ? 'carry' : 'upright';
}

const FLOWER_HEX: Record<string, string> = { vang: '#ffd23f', trang: '#fffaf0', do: '#e23b3b', tim: '#9b59d0' };

interface PutOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number | [number, number, number];
  emissive?: string;
  ei?: number;
}

function put(g: THREE.Group, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, o: PutOpts = {}): THREE.Mesh {
  const m = mesh(geometry, o.emissive ? mat(color, { emissive: o.emissive, emissiveIntensity: o.ei ?? 0.8 }) : mat(color), {
    x,
    y,
    z,
    rx: o.rx,
    ry: o.ry,
    rz: o.rz,
    scale: o.scale,
  });
  g.add(m);
  return m;
}

function bouquet(g: THREE.Group, color: string, y: number, spread = 0.07): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = i === 0 ? 0 : spread;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    put(g, geo.cyl(0.007, 0.007, 0.22, 4), '#4f9a3f', x * 0.6, y - 0.1, z * 0.6, { rz: x * 2, rx: -z * 2 });
    put(g, geo.ico(0.045, 0), color, x, y + 0.02 + (i === 0 ? 0.03 : 0), z, { scale: [1, 0.7, 1] });
    put(g, geo.sphere(0.016, 6, 4), '#ffd166', x, y + 0.05 + (i === 0 ? 0.03 : 0), z);
  }
  put(g, geo.cone(0.03, 0.07, 5), '#5fae4e', 0.06, y - 0.03, 0, { rz: -0.8 });
  put(g, geo.cone(0.03, 0.07, 5), '#5fae4e', -0.06, y - 0.03, 0.02, { rz: 0.8 });
}

function fruitMesh(g: THREE.Group, fruit: string): void {
  switch (fruit) {
    case 'chuoi': {
      for (let i = 0; i < 4; i++) {
        put(g, geo.torus(0.13, 0.026, 5, 8, 1.3), '#ffd84a', (i - 1.5) * 0.03, 0.07, 0, { ry: (i - 1.5) * 0.28, rz: 0.2 });
      }
      put(g, geo.cyl(0.02, 0.025, 0.06, 5), '#7a5a2a', 0, 0.2, 0);
      return;
    }
    case 'buoi':
      put(g, geo.lathe([[0, 0], [0.09, 0.02], [0.12, 0.09], [0.1, 0.17], [0.05, 0.21], [0, 0.22]], 10), '#b7d653', 0, 0, 0);
      put(g, geo.cone(0.035, 0.08, 4), '#4f9a3f', 0.04, 0.22, 0, { rz: -1.1, scale: [1, 1, 0.3] });
      return;
    case 'phat_thu':
      put(g, geo.sphere(0.07, 8, 6), '#f4c430', 0, 0.06, 0, { scale: [1, 0.8, 1] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        put(g, geo.cone(0.022, 0.16, 5), '#f6cf3a', Math.cos(a) * 0.05, 0.15, Math.sin(a) * 0.05, {
          rx: Math.sin(a) * 0.5,
          rz: -Math.cos(a) * 0.5,
        });
      }
      return;
    case 'thanh_long':
      put(g, geo.sphere(0.09, 9, 7), '#d4246f', 0, 0.1, 0, { scale: [1, 1.25, 1] });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        put(g, geo.cone(0.025, 0.06, 4), '#7cc243', Math.cos(a) * 0.085, 0.04 + (i % 3) * 0.06, Math.sin(a) * 0.085, {
          rx: Math.sin(a) * 1.2,
          rz: -Math.cos(a) * 1.2,
        });
      }
      return;
    case 'xoai':
      put(g, geo.sphere(0.085, 9, 7), '#ffb627', 0, 0.09, 0, { scale: [0.8, 1.25, 0.7] });
      put(g, geo.sphere(0.04, 6, 5), '#f5822a', 0.04, 0.12, 0.03);
      return;
    case 'du_du':
      put(g, geo.capsule(0.07, 0.12, 4, 8), '#f59a2c', 0, 0.13, 0);
      put(g, geo.sphere(0.04, 6, 5), '#9bc24a', 0, 0.24, 0);
      return;
    default: {
      put(g, geo.ico(0.09, 1), '#9ccc65', 0, 0.09, 0);
      for (let i = 0; i < 10; i++) {
        const a = i * 2.4;
        put(g, geo.sphere(0.022, 5, 4), '#7cb342', Math.cos(a) * 0.08, 0.03 + (i % 4) * 0.04, Math.sin(a) * 0.08);
      }
    }
  }
}

function bucket(g: THREE.Group, water: boolean): void {
  put(g, geo.lathe([[0, 0], [0.13, 0], [0.16, 0.24], [0.155, 0.24], [0.12, 0.012], [0, 0.012]], 12), '#a06b3d', 0, -0.05, 0);
  for (const y of [0.02, 0.15]) put(g, geo.torus(0.145 + y * 0.12, 0.008, 4, 16), '#5a5a62', 0, -0.05 + y, 0, { rx: Math.PI / 2 });
  g.add(mesh(geo.torus(0.16, 0.01, 4, 14, Math.PI), mat('#5a5a62'), { y: 0.19 }));
  if (water) put(g, geo.cyl(0.148, 0.148, 0.01, 12), '#5cc2dd', 0, 0.16, 0, { emissive: '#2b8fb0', ei: 0.25 });
}

function lamp(g: THREE.Group, state: string): void {
  put(g, geo.cyl(0.07, 0.09, 0.04, 10), '#b8862f', 0, 0.02, 0);
  put(g, geo.lathe([[0, 0], [0.07, 0.01], [0.08, 0.06], [0.04, 0.1], [0.025, 0.12], [0, 0.12]], 10), '#d4a64a', 0, 0.04, 0);
  if (state !== 'empty') put(g, geo.cyl(0.065, 0.075, 0.03, 10), '#e8b84a', 0, 0.07, 0, { emissive: '#a4791f', ei: 0.2 });
  g.add(
    mesh(
      geo.lathe([[0.04, 0], [0.06, 0.05], [0.06, 0.12], [0.035, 0.2], [0.035, 0.24]], 12),
      mat('#dff4ff', { transparent: true, opacity: 0.35, doubleSide: true }),
      { y: 0.14, castShadow: false },
    ),
  );
  if (state === 'lit') {
    put(g, geo.cone(0.018, 0.07, 6), '#ffb43a', 0, 0.21, 0, { emissive: '#ff8a1a', ei: 2.2 });
    put(g, geo.sphere(0.012, 5, 4), '#fff3c4', 0, 0.2, 0, { emissive: '#fff3c4', ei: 3 });
    const halo = new THREE.Mesh(geo.sphere(0.09, 8, 6), glowMat('#ffb347', 0.18));
    halo.position.y = 0.21;
    g.add(halo);
  }
}

function incense(g: THREE.Group, lit: boolean): void {
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.012;
    put(g, geo.cyl(0.005, 0.005, 0.34, 4), '#b8322a', x, 0.12, 0, { rz: (i - 1) * 0.06 });
    put(g, geo.cyl(0.006, 0.006, 0.08, 4), '#e8c58a', x, -0.06, 0);
    if (lit) put(g, geo.sphere(0.009, 5, 4), '#ff6a2a', x + (i - 1) * 0.01, 0.29, 0, { emissive: '#ff4a10', ei: 3 });
  }
  if (lit) {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(geo.sphere(0.02 + i * 0.008, 6, 4), glowMat('#e8e4dc', 0.35 - i * 0.08));
      s.position.set(Math.sin(i * 1.7) * 0.02, 0.33 + i * 0.06, 0);
      g.add(s);
    }
  }
}

function cageBird(g: THREE.Group): void {
  put(g, geo.cyl(0.13, 0.13, 0.02, 10), '#8a5a2b', 0, -0.06, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    put(g, geo.cyl(0.006, 0.006, 0.24, 3), '#c8a064', Math.cos(a) * 0.12, 0.06, Math.sin(a) * 0.12);
  }
  put(g, geo.sphere(0.13, 10, 5), '#c8a064', 0, 0.18, 0, { scale: [1, 0.45, 1] });
  put(g, geo.torus(0.04, 0.008, 4, 10), '#8a5a2b', 0, 0.27, 0);
  put(g, geo.sphere(0.045, 8, 6), '#4fb3e8', 0, 0.02, 0, { scale: [1, 0.9, 1.2] });
  put(g, geo.sphere(0.03, 6, 5), '#4fb3e8', 0, 0.06, 0.04);
  put(g, geo.cone(0.012, 0.03, 4), '#ffb627', 0, 0.06, 0.08, { rx: Math.PI / 2 });
  put(g, geo.cone(0.025, 0.06, 3), '#2f7fb5', 0, 0.03, -0.06, { rx: -Math.PI / 2 });
}

function basinTurtle(g: THREE.Group): void {
  put(g, geo.lathe([[0, 0], [0.18, 0], [0.22, 0.08], [0.2, 0.08], [0.16, 0.015], [0, 0.015]], 14), '#c9c3b8', 0, -0.04, 0);
  put(g, geo.cyl(0.19, 0.19, 0.01, 14), '#5cc2dd', 0, 0.02, 0);
  put(g, geo.sphere(0.09, 8, 6), '#3f8a3a', 0, 0.04, 0, { scale: [1, 0.5, 1.2] });
  put(g, geo.sphere(0.035, 6, 5), '#7cbf5a', 0, 0.04, 0.12);
  for (const [x, z] of [
    [0.07, 0.07],
    [-0.07, 0.07],
    [0.07, -0.07],
    [-0.07, -0.07],
  ] as const) {
    put(g, geo.sphere(0.022, 5, 4), '#7cbf5a', x, 0.03, z);
  }
}

function fishBucket(g: THREE.Group): void {
  bucket(g, true);
  put(g, geo.cone(0.05, 0.1, 3), '#ff7a2a', 0.03, 0.22, 0, { rz: -0.4, scale: [1, 1, 0.3] });
  put(g, geo.sphere(0.05, 7, 5), '#ff8c3a', -0.03, 0.18, 0, { scale: [1.3, 0.8, 0.5] });
}

function riceSack(g: THREE.Group, big: boolean): void {
  const s = big ? 1.4 : 0.8;
  const color = big ? '#d8c29a' : '#efe6d2';
  put(g, geo.sphere(0.16 * s, 9, 7), color, 0, 0.12 * s, 0, { scale: [1, 1.15, 0.8] });
  put(g, geo.cyl(0.05 * s, 0.07 * s, 0.07 * s, 8), color, 0, 0.3 * s, 0);
  put(g, geo.torus(0.05 * s, 0.01 * s, 4, 10), '#8a5a2b', 0, 0.29 * s, 0, { rx: Math.PI / 2 });
  if (big) put(g, geo.box(0.16, 0.08, 0.01), '#b8322a', 0, 0.16, 0.13);
}

function vegCrate(g: THREE.Group): void {
  put(g, geo.box(0.42, 0.18, 0.3), '#b88552', 0, 0.06, 0);
  for (let i = 0; i < 7; i++) {
    put(g, geo.ico(0.06, 0), i % 3 === 0 ? '#e0d6c2' : '#5fae4e', -0.15 + (i % 4) * 0.1, 0.18, -0.08 + Math.floor(i / 4) * 0.13);
  }
}

function dish(g: THREE.Group, kind: 'stirfry' | 'cut'): void {
  put(g, geo.cyl(0.17, 0.12, 0.03, 14), kind === 'cut' ? '#b88552' : '#f7f3ea', 0, 0, 0);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.1;
    const r = (i % 4) * 0.035;
    const color = i % 3 !== 0 ? '#4f9a3f' : '#c49a6c';
    put(g, kind === 'cut' ? geo.box(0.04, 0.015, 0.025) : geo.ico(0.03, 0), color, Math.cos(a) * r, kind === 'cut' ? 0.03 : 0.04, Math.sin(a) * r, { ry: a });
  }
}

function clayPot(g: THREE.Group): void {
  put(g, geo.lathe([[0, 0], [0.12, 0.01], [0.16, 0.1], [0.14, 0.18], [0.1, 0.2], [0, 0.2]], 12), '#5a3a28', 0, -0.03, 0);
  put(g, geo.cyl(0.11, 0.12, 0.03, 12), '#6e4a32', 0, 0.18, 0);
  put(g, geo.sphere(0.025, 6, 4), '#6e4a32', 0, 0.21, 0);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(geo.sphere(0.04 + i * 0.012, 6, 4), glowMat('#ffffff', 0.4 - i * 0.1));
    s.position.set(Math.sin(i) * 0.03, 0.27 + i * 0.07, 0);
    g.add(s);
  }
}

function firewoodBundle(g: THREE.Group): void {
  for (let i = 0; i < 5; i++) {
    const x = ((i % 3) - 1) * 0.07;
    const y = Math.floor(i / 3) * 0.065;
    put(g, geo.cyl(0.035, 0.04, 0.42, 7), i % 2 ? '#8a5a3b' : '#9b6a45', x, y + 0.04, 0, { rx: Math.PI / 2 });
    put(g, geo.cyl(0.03, 0.03, 0.005, 7), '#d9b07a', x, y + 0.04, 0.212, { rx: Math.PI / 2 });
  }
  put(g, geo.torus(0.12, 0.012, 4, 12), '#c8a064', 0, 0.07, 0);
}

function broom(g: THREE.Group): void {
  put(g, geo.cyl(0.018, 0.022, 1.25, 6), '#c8a064', 0, -0.25, 0);
  put(g, geo.torus(0.03, 0.008, 4, 8), '#6e3b26', 0, -0.83, 0, { rx: Math.PI / 2 });
  put(g, geo.cone(0.14, 0.42, 8), '#d9b26a', 0, -1.0, 0, { rx: Math.PI, scale: [1, 1, 0.45] });
}

interface GlassOpts {
  tall?: boolean;
  garnish?: string;
  umbrella?: boolean;
  mint?: boolean;
}

function glass(g: THREE.Group, liquid: string, opts: GlassOpts): void {
  const h = opts.tall ? 0.2 : 0.14;
  g.add(
    mesh(geo.lathe([[0.035, 0], [0.04, 0.005], [0.045, h], [0.043, h]], 12), mat('#e8f6ff', { transparent: true, opacity: 0.38, doubleSide: true }), {
      castShadow: false,
    }),
  );
  put(g, geo.cyl(0.04, 0.035, h * 0.75, 12), liquid, 0, h * 0.4, 0, { emissive: liquid, ei: 0.25 });
  if (opts.garnish) put(g, geo.cyl(0.03, 0.03, 0.008, 10), opts.garnish, 0.035, h, 0, { rz: 1.2 });
  if (opts.mint) for (let i = 0; i < 3; i++) put(g, geo.sphere(0.018, 5, 4), '#3fbf5a', Math.cos(i * 2) * 0.02, h + 0.01, Math.sin(i * 2) * 0.02);
  put(g, geo.cyl(0.004, 0.004, h + 0.08, 4), '#ff5d8f', -0.015, h * 0.6, 0, { rz: 0.25 });
  if (opts.umbrella) {
    put(g, geo.cyl(0.003, 0.003, 0.12, 3), '#ffffff', 0.02, h + 0.04, 0, { rz: -0.3 });
    put(g, geo.cone(0.05, 0.025, 8), '#ffd166', 0.04, h + 0.1, 0, { rz: -0.3 });
  }
}

const COCKTAIL_COLORS: Record<string, string> = {
  mojito_niet_ban: '#b8f0a0',
  sinh_to_tap_niem: '#ff7aa2',
  tra_da_vo_uu: '#e0a85a',
  ruou_nep_than_thong: '#f4d6a0',
  soda_giai_thoat: '#9fe0ff',
  cocktail_ha_son: '#ffb347',
};

function drinkGlass(g: THREE.Group, drink: string): void {
  if (drink === 'bia_bo_de') {
    put(g, geo.cyl(0.055, 0.05, 0.16, 10), '#f2b632', 0, 0.08, 0, { emissive: '#c88a12', ei: 0.25 });
    put(g, geo.cyl(0.058, 0.056, 0.04, 10), '#fffaf0', 0, 0.17, 0);
    put(g, geo.torus(0.04, 0.012, 4, 10, Math.PI), '#e8f6ff', 0.06, 0.09, 0, { rz: -Math.PI / 2 });
    return;
  }
  if (drink === 'ruou_can_tap_niem') {
    put(g, geo.lathe([[0, 0], [0.07, 0.01], [0.1, 0.08], [0.07, 0.16], [0.045, 0.19], [0.05, 0.21], [0, 0.21]], 10), '#7a4a2a', 0, 0, 0);
    put(g, geo.cyl(0.006, 0.006, 0.3, 4), '#c8a064', 0.02, 0.28, 0, { rz: -0.35 });
    return;
  }
  glass(g, '#c9f5b0', { tall: true, garnish: '#9ccc65', mint: true });
}

export const createHeldItemMesh: CreateHeldItemMesh = (item: HeldItem): THREE.Object3D => {
  const g = new THREE.Group();
  g.name = `held:${item.kind}${item.variant ? ':' + item.variant : ''}`;
  const v = item.variant ?? '';
  switch (item.kind) {
    case 'broom':
      broom(g);
      break;
    case 'water_bucket':
      bucket(g, true);
      break;
    case 'animal':
      if (v === 'rua') basinTurtle(g);
      else if (v === 'chim') cageBird(g);
      else fishBucket(g);
      break;
    case 'fruit':
      fruitMesh(g, v);
      break;
    case 'flower':
      bouquet(g, FLOWER_HEX[v] ?? '#ffd23f', 0.14);
      break;
    case 'vase':
      put(g, geo.lathe([[0, 0], [0.07, 0.01], [0.1, 0.08], [0.08, 0.18], [0.045, 0.24], [0.06, 0.28]], 12), '#f2f6ff', 0, 0, 0);
      put(g, geo.torus(0.085, 0.008, 4, 14), '#3a62b8', 0, 0.12, 0, { rx: Math.PI / 2 });
      bouquet(g, FLOWER_HEX[v] ?? '#ffd23f', 0.36, 0.09);
      break;
    case 'lamp':
      lamp(g, v || 'empty');
      break;
    case 'incense':
      incense(g, v === 'lit');
      break;
    case 'rice':
      riceSack(g, false);
      break;
    case 'rice_washed':
      put(g, geo.lathe([[0, 0], [0.12, 0.01], [0.17, 0.09], [0.165, 0.09], [0.115, 0.015], [0, 0.015]], 12), '#c8a064', 0, 0, 0);
      put(g, geo.sphere(0.13, 10, 6), '#fffdf5', 0, 0.06, 0, { scale: [1, 0.35, 1] });
      for (let i = 0; i < 4; i++) put(g, geo.sphere(0.012, 5, 4), '#bdefff', Math.cos(i * 1.6) * 0.09, 0, Math.sin(i * 1.6) * 0.09);
      break;
    case 'veggies':
      for (let i = 0; i < 6; i++) put(g, geo.cone(0.05, 0.18, 5), '#5fae4e', (i - 2.5) * 0.03, 0.09, 0, { rz: (i - 2.5) * 0.18 });
      for (const x of [-0.06, 0.07]) {
        put(g, geo.cyl(0.015, 0.02, 0.06, 6), '#f1e6d0', x, 0.03, 0.06);
        put(g, geo.sphere(0.045, 8, 5), '#8a5a3b', x, 0.07, 0.06, { scale: [1, 0.55, 1] });
      }
      break;
    case 'veggies_cut':
      dish(g, 'cut');
      break;
    case 'rice_pot':
      clayPot(g);
      break;
    case 'veggie_dish':
      dish(g, 'stirfry');
      break;
    case 'firewood':
      firewoodBundle(g);
      break;
    case 'supply':
      if (v === 'veg_crate') vegCrate(g);
      else riceSack(g, true);
      break;
    case 'cocktail':
      glass(g, COCKTAIL_COLORS[v] ?? '#ff7aa2', {
        garnish: '#9ccc65',
        umbrella: v !== 'tra_da_vo_uu',
        mint: v.includes('mojito') || v.includes('soda'),
      });
      break;
    case 'drink_glass':
      drinkGlass(g, v);
      break;
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.Material).transparent) o.castShadow = true;
  });
  return g;
};
