// Nhân vật "hạt đậu" low-poly: thân áo tu xòe (theo cấp bậc) hoặc đồ thường (NPC), đầu tròn mắt to, tay chân nhỏ,
// mũ/phụ kiện, bộ Phương Trượng (cà sa đỏ thêu kim + mũ Tỳ Lư + tích trượng), mây Tạp Niệm, say, hào quang,
// hiệu ứng thăng cấp, và hoạt ảnh thủ tục cho mọi AnimId. Kèm "đôi tay" ở góc nhìn thứ nhất.
import * as THREE from 'three';
import { PORTRAIT_BOW, type AnimId, type HairId, type HeldItem, type Outfit, type RobeId } from '@shared/index';
import type { AvatarHandle, AvatarLook, CreateAvatar, CreateFirstPersonView, FirstPersonHandle } from './api';
import { kit } from './kit';
import { createHeldItemMesh, gripStyle, type GripStyle } from './props';

/**
 * Độ cúi của 1 lạy (0 = quỳ thẳng, 1 = rạp sát đất) theo giây kể từ lúc bắt đầu lạy: cúi xuống 40%,
 * giữ 20%, ngẩng lên 40% thời gian PORTRAIT_BOW.bowMs. Dùng chung cho thân nhân vật và camera góc thứ nhất.
 */
export function prostrateDip(sec: number): number {
  const p = Math.min(1, Math.max(0, (sec * 1000) / PORTRAIT_BOW.bowMs));
  const d = p < 0.4 ? p / 0.4 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
  return d * d * (3 - 2 * d);
}

const { geo } = kit;

/** Màu da cho người chơi (chọn theo seed). */
export const SKIN_TONES = ['#f6d2ad', '#efc193', '#e8b48a', '#d9a173', '#c98e62'];
const ACCENTS = ['#ff6f91', '#4fc3f7', '#ffd54f', '#81c784', '#ba68c8', '#ff8a65', '#4db6ac', '#f06292'];

/** Ngoại hình người chơi (tu sĩ đầu trọc), màu da/màu nhấn ổn định theo seed (vd hash pid). */
export function playerLook(p: { outfit: Outfit; isHost: boolean; vip: boolean }, seed: number): AvatarLook {
  const s = Math.abs(seed);
  return {
    outfit: p.outfit,
    hair: 'bald',
    skin: SKIN_TONES[s % SKIN_TONES.length]!,
    isHost: p.isHost,
    vip: p.vip,
    accent: ACCENTS[(s >> 3) % ACCENTS.length],
  };
}

export type NpcKind = 'visitor' | 'bar_guest' | 'dealer' | 'bartender';

/** Ngoại hình NPC (có tóc, đồ thường) theo loại + seed. */
export function npcLook(kind: NpcKind, seed: number): AvatarLook {
  const s = Math.abs(seed);
  const robe: RobeId =
    kind === 'visitor' ? (s % 3 === 0 ? 'civ_ao_thun' : 'civ_ba_ba') : kind === 'bar_guest' ? (s % 4 === 0 ? 'civ_ao_thun' : 'civ_party') : 'civ_vest';
  return {
    outfit: { robe, hat: 'none', accessory: kind === 'bar_guest' && s % 5 === 0 ? 'kinh_ram' : 'none' },
    hair: (['short', 'long', 'bun', 'spiky'] as const)[s % 4]!,
    skin: SKIN_TONES[(s * 7) % SKIN_TONES.length]!,
    isHost: false,
    vip: false,
    accent: ACCENTS[(s * 5 + 3) % ACCENTS.length],
  };
}

// ───────────────────────── Kiểu áo ─────────────────────────

interface RobeStyle {
  upper: string;
  lower: string;
  sleeve: string;
  /** Viền gấu áo. */
  trim?: string;
  /** Dải cà sa vắt chéo vai trái. */
  sash?: string;
  sashTrim?: string;
  belt?: string;
  patches?: string;
  ragged?: boolean;
  wide?: boolean;
  collar?: string;
  tie?: string;
  shiny?: boolean;
  shoes: string;
}

function robeStyle(look: AvatarLook): RobeStyle {
  const accent = look.accent ?? '#4fc3f7';
  if (look.isHost) {
    return { upper: '#c8432f', lower: '#b23a28', sleeve: '#c8432f', trim: '#ffd166', sash: '#e7b43c', sashTrim: '#ffe08a', shoes: '#5a3a28' };
  }
  switch (look.outfit.robe) {
    case 'robe_nau_rach':
      return { upper: '#8b6a4a', lower: '#86654a', sleeve: '#8b6a4a', patches: '#b08a62', ragged: true, belt: '#5a3d26', shoes: '#6e4a32' };
    case 'robe_lam':
      return { upper: '#7f97a8', lower: '#7a92a3', sleeve: '#7f97a8', belt: '#4f6575', shoes: '#4a3a30' };
    case 'robe_trang_nau':
      return { upper: '#6d4c35', lower: '#664632', sleeve: '#6d4c35', wide: true, collar: '#3f2a1c', shoes: '#3f2a1c' };
    case 'robe_ca_sa_vang':
      return { upper: '#e9a23b', lower: '#e39a33', sleeve: '#e9a23b', sash: '#d4861f', sashTrim: '#f2b65a', shoes: '#6e4a32' };
    case 'robe_ca_sa_vien_do':
      return { upper: '#e9a23b', lower: '#e39a33', sleeve: '#e9a23b', sash: '#d4861f', sashTrim: '#b5382f', trim: '#b5382f', shoes: '#5a3a28' };
    case 'civ_ao_thun':
      return { upper: accent, lower: '#3b5b8a', sleeve: accent, shoes: '#f3f3f3' };
    case 'civ_ba_ba':
      return { upper: '#f4efe2', lower: '#2b2b33', sleeve: '#f4efe2', collar: accent, shoes: '#6e4a32' };
    case 'civ_party':
      return { upper: accent, lower: '#1f1f26', sleeve: accent, shiny: true, shoes: '#1b1b1f' };
    case 'civ_vest':
      return { upper: '#2c3550', lower: '#22283c', sleeve: '#2c3550', collar: '#ffffff', tie: '#c8322a', shoes: '#111111' };
  }
}

// Hình khối dùng chung (tạo 1 lần).
const LOWER_GEO = geo.lathe(
  [
    [0, 0.06],
    [0.43, 0.06],
    [0.46, 0.13],
    [0.42, 0.32],
    [0.37, 0.5],
    [0.34, 0.62],
  ],
  14,
);
const UPPER_GEO = geo.lathe(
  [
    [0.335, 0.6],
    [0.345, 0.72],
    [0.335, 0.86],
    [0.29, 0.98],
    [0.19, 1.06],
    [0, 1.08],
  ],
  14,
);
const HEAD_GEO = new THREE.SphereGeometry(0.31, 16, 12);
const HAIR_CAP_GEO = new THREE.SphereGeometry(0.325, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const HEM_TEETH_GEO = new THREE.ConeGeometry(0.05, 0.1, 3);

/** Đường bao cơ thể theo hoạt ảnh (tất cả là góc radian / mét). */
interface Pose {
  y: number;
  sy: number;
  hipsY: number;
  lean: number;
  roll: number;
  twist: number;
  headX: number;
  headZ: number;
  lx: number;
  lz: number;
  rx: number;
  rz: number;
  step: number;
  tuck: number;
}

const BASE: Pose = { y: 0, sy: 1, hipsY: 0.45, lean: 0, roll: 0, twist: 0, headX: 0, headZ: 0, lx: 0.12, lz: 0.14, rx: 0.12, rz: 0.14, step: 0, tuck: 0 };
const POSE_KEYS = Object.keys(BASE) as (keyof Pose)[];

const MOVING = new Set<AnimId>(['walk', 'carry_walk']);
const TOOL_FOR: Partial<Record<AnimId, 'axe' | 'mallet' | 'knife' | 'spatula' | 'fan' | 'shaker'>> = {
  chop: 'axe',
  strike: 'mallet',
  cut: 'knife',
  stir: 'spatula',
  fan: 'fan',
  shake: 'shaker',
};

/** Dụng cụ hành động (rìu, dùi mõ, dao…) — hiện trên tay khi tay đang trống. Gốc = chỗ cầm. */
function toolMesh(kind: NonNullable<(typeof TOOL_FOR)[AnimId]>): THREE.Group {
  const g = new THREE.Group();
  const m = (gg: THREE.BufferGeometry, c: string, x: number, y: number, z: number, rx = 0, rz = 0) =>
    g.add(kit.mesh(gg, kit.mat(c), { x, y, z, rx, rz }));
  switch (kind) {
    case 'axe':
      m(geo.cyl(0.02, 0.024, 0.62, 6), '#a0703f', 0, 0.2, 0);
      m(geo.box(0.04, 0.16, 0.2), '#9aa3ad', 0, 0.45, 0.08);
      break;
    case 'mallet':
      m(geo.cyl(0.012, 0.014, 0.3, 5), '#7a4a2a', 0, 0.12, 0);
      m(geo.sphere(0.04, 6, 5), '#5a3420', 0, 0.28, 0);
      break;
    case 'knife':
      m(geo.box(0.03, 0.1, 0.03), '#5a3420', 0, 0.02, 0);
      m(geo.box(0.012, 0.2, 0.05), '#d9dde3', 0, 0.16, 0.01);
      break;
    case 'spatula':
      m(geo.cyl(0.012, 0.012, 0.36, 5), '#a0703f', 0, 0.15, 0);
      m(geo.box(0.09, 0.1, 0.012), '#a0703f', 0, 0.36, 0);
      break;
    case 'fan':
      g.add(kit.mesh(new THREE.CircleGeometry(0.18, 10, 0, Math.PI), kit.mat('#e8c58a', { doubleSide: true }), { y: 0.1 }));
      m(geo.cyl(0.01, 0.01, 0.16, 4), '#8a5a2b', 0, 0.06, 0);
      break;
    case 'shaker':
      m(geo.cyl(0.05, 0.045, 0.2, 10), '#d9dde3', 0, 0.12, 0);
      m(geo.cyl(0.035, 0.05, 0.06, 10), '#c2c8d0', 0, 0.25, 0);
      break;
  }
  return g;
}

/** Tích trượng của Phương Trượng. */
function staffMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(kit.mesh(geo.cyl(0.022, 0.026, 1.95, 6), kit.mat('#8a5a2b'), { y: 0.45 }));
  g.add(kit.mesh(geo.torus(0.11, 0.016, 5, 14), kit.mat('#ffd166', { metalness: 0.4, roughness: 0.4 }), { y: 1.5 }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(kit.mesh(geo.torus(0.035, 0.008, 4, 8), kit.mat('#ffd166'), { x: Math.cos(a) * 0.11, y: 1.5 + Math.sin(a) * 0.11, rx: Math.PI / 2 }));
  }
  g.add(kit.mesh(geo.sphere(0.035, 6, 5), kit.mat('#ffd166', { emissive: '#e8b04a', emissiveIntensity: 0.4 }), { y: 1.66 }));
  return g;
}

class BeanAvatar implements AvatarHandle {
  readonly root = new THREE.Group();
  readonly headAnchor = new THREE.Object3D();
  private readonly bounce = new THREE.Group();
  private readonly hips = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly shoulderL = new THREE.Group();
  private readonly shoulderR = new THREE.Group();
  private readonly handL = new THREE.Group();
  private readonly handR = new THREE.Group();
  private readonly itemR = new THREE.Group();
  private readonly itemL = new THREE.Group();
  private readonly carry = new THREE.Group();
  private readonly footL: THREE.Mesh;
  private readonly footR: THREE.Mesh;
  private readonly cloud = new THREE.Group();
  private readonly bolt: THREE.Group;
  private readonly rain: THREE.Mesh[] = [];
  private readonly glow: THREE.Mesh;
  private readonly glowRing: THREE.Mesh;
  private readonly rankFx = new THREE.Group();
  /** Phần đổi theo ngoại hình (áo, mũ, tóc, phụ kiện) — dựng lại khi setLook. */
  private readonly outfitParts = new THREE.Group();
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly owned = new Set<THREE.Material>();
  private eyes: THREE.Mesh[] = [];
  private blush: THREE.Mesh[] = [];
  private skinMat!: THREE.MeshStandardMaterial;
  private look: AvatarLook;
  private anim: AnimId = 'idle';
  private animTime = 0;
  private phase = 0;
  private readonly pose: Pose = { ...BASE };
  private readonly target: Pose = { ...BASE };
  private held: HeldItem | null = null;
  private grip: GripStyle | null = null;
  private tool: THREE.Group | null = null;
  private toolKind: string | null = null;
  private tapNiem = 0;
  private drunk = 0;
  private ghost = false;
  private glowColor: string | null = null;
  private blinkAt = 2 + Math.random() * 3;
  private blinkLeft = 0;
  private rankT = -1;
  private spin = 0;
  private boltT = 0;
  private time = 0;

  constructor(look: AvatarLook) {
    this.look = look;
    this.root.add(this.bounce);
    this.bounce.add(this.hips);
    this.hips.position.y = BASE.hipsY;

    const feetMat = this.m('feet', '#5a3a28');
    this.footL = kit.mesh(geo.sphere(0.1, 8, 6), feetMat, { x: 0.15, y: 0.055, z: 0.03, scale: [0.95, 0.55, 1.45] });
    this.footR = kit.mesh(geo.sphere(0.1, 8, 6), feetMat, { x: -0.15, y: 0.055, z: 0.03, scale: [0.95, 0.55, 1.45] });
    this.bounce.add(this.footL, this.footR);

    this.hips.add(this.outfitParts);
    this.head.position.y = 0.86;
    this.hips.add(this.head);
    this.headAnchor.position.y = 1.42;
    this.hips.add(this.headAnchor);

    // Tay: vai → tay áo → bàn tay.
    for (const [sh, hand, x] of [
      [this.shoulderL, this.handL, 0.31],
      [this.shoulderR, this.handR, -0.31],
    ] as const) {
      sh.position.set(x, 0.52, 0);
      hand.position.y = -0.43;
      sh.add(hand);
      this.hips.add(sh);
    }
    this.handR.add(this.itemR);
    this.handL.add(this.itemL);
    this.carry.position.set(0, 0.38, 0.4);
    this.hips.add(this.carry);

    // Mây Tạp Niệm.
    this.cloud.position.y = 1.95;
    this.cloud.visible = false;
    this.hips.add(this.cloud);
    const cloudMat = this.m('cloud', '#80828e', { roughness: 1 });
    for (const [x, y, z, r] of [
      [0, 0, 0, 0.17],
      [0.16, -0.03, 0.02, 0.13],
      [-0.16, -0.02, -0.01, 0.14],
      [0.06, 0.09, -0.04, 0.12],
      [-0.07, 0.07, 0.05, 0.11],
    ] as const) {
      this.cloud.add(kit.mesh(geo.ico(r, 1), cloudMat, { x, y, z, castShadow: false }));
    }
    this.bolt = new THREE.Group();
    const boltMat = new THREE.MeshBasicMaterial({ color: '#fff27a' });
    this.owned.add(boltMat);
    for (const [y, rz] of [
      [-0.16, 0.5],
      [-0.28, -0.5],
      [-0.4, 0.5],
    ] as const) {
      this.bolt.add(new THREE.Mesh(geo.box(0.03, 0.15, 0.03), boltMat).translateY(y).rotateZ(rz));
    }
    this.bolt.visible = false;
    this.cloud.add(this.bolt);
    const rainMat = new THREE.MeshBasicMaterial({ color: '#8fc9ff', transparent: true, opacity: 0.7 });
    this.owned.add(rainMat);
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(geo.cyl(0.008, 0.008, 0.09, 3), rainMat);
      d.position.set((Math.random() - 0.5) * 0.35, -0.2, (Math.random() - 0.5) * 0.25);
      d.userData.speed = 1.6 + Math.random();
      d.visible = false;
      this.cloud.add(d);
      this.rain.push(d);
    }

    // Hào quang: vỏ phát sáng + vòng dưới chân.
    const glowMat = new THREE.MeshBasicMaterial({
      color: '#ffd166',
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.owned.add(glowMat);
    this.glow = new THREE.Mesh(geo.capsule(0.52, 0.85, 6, 14), glowMat);
    this.glow.position.y = 0.95;
    this.glow.visible = false;
    this.bounce.add(this.glow);
    const ringMat = glowMat.clone();
    ringMat.side = THREE.DoubleSide;
    ringMat.opacity = 0.55;
    this.owned.add(ringMat);
    this.glowRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 28).rotateX(-Math.PI / 2), ringMat);
    this.glowRing.position.y = 0.04;
    this.glowRing.visible = false;
    this.root.add(this.glowRing);
    this.root.add(this.rankFx);

    this.buildLook(look);
  }

  /** Vật liệu riêng của nhân vật này (để làm mờ khi mất kết nối mà không đụng vật liệu dùng chung). */
  private m(key: string, color: string, o: { emissive?: string; ei?: number; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
    let mt = this.mats.get(key);
    if (!mt) {
      mt = kit.matUnique(color, {
        emissive: o.emissive,
        emissiveIntensity: o.ei,
        roughness: o.roughness,
        metalness: o.metalness,
        transparent: o.transparent,
        opacity: o.opacity,
      });
      this.mats.set(key, mt);
      this.owned.add(mt);
    } else {
      mt.color.set(color);
      if (o.emissive) mt.emissive.set(o.emissive);
    }
    return mt;
  }

  private addTo(parent: THREE.Object3D, g: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; scale?: number | [number, number, number]; shadow?: boolean } = {}): THREE.Mesh {
    const mm = kit.mesh(g, material, { x, y, z, rx: o.rx, ry: o.ry, rz: o.rz, scale: o.scale, castShadow: o.shadow ?? true });
    parent.add(mm);
    return mm;
  }

  private buildLook(look: AvatarLook): void {
    this.look = look;
    for (const c of [...this.outfitParts.children]) this.outfitParts.remove(c);
    for (const c of [...this.head.children]) this.head.remove(c);
    for (const sh of [this.shoulderL, this.shoulderR]) {
      for (const c of [...sh.children]) if (c !== this.handL && c !== this.handR) sh.remove(c);
    }
    for (const h of [this.handL, this.handR]) for (const c of [...h.children]) if (c !== this.itemL && c !== this.itemR) h.remove(c);
    this.itemL.clear();

    const st = robeStyle(look);
    const P = this.outfitParts;
    const off = -0.45;
    const upper = this.m('upper', st.upper, st.shiny ? { emissive: st.upper, ei: 0.25, roughness: 0.35, metalness: 0.3 } : {});
    const lower = this.m('lower', st.lower);
    this.addTo(P, LOWER_GEO, lower, 0, off, 0);
    this.addTo(P, UPPER_GEO, upper, 0, off, 0);
    (this.mats.get('feet') as THREE.MeshStandardMaterial).color.set(st.shoes);

    if (st.trim) this.addTo(P, geo.cyl(0.462, 0.462, 0.07, 14), this.m('trim', st.trim), 0, off + 0.1, 0);
    if (st.belt) this.addTo(P, geo.torus(0.345, 0.03, 5, 16), this.m('belt', st.belt), 0, off + 0.64, 0, { rx: Math.PI / 2 });
    if (st.ragged) {
      const teeth = this.m('lower', st.lower);
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + 0.2;
        this.addTo(P, HEM_TEETH_GEO, teeth, Math.cos(a) * 0.43, off + 0.06, Math.sin(a) * 0.43, { rx: Math.PI, scale: [1, 0.8 + (i % 3) * 0.25, 0.5], ry: -a });
      }
    }
    if (st.patches) {
      const pm = this.m('patch', st.patches);
      this.addTo(P, geo.box(0.12, 0.1, 0.02), pm, 0.16, off + 0.32, 0.4, { rz: 0.2, ry: 0.35 });
      this.addTo(P, geo.box(0.1, 0.09, 0.02), pm, -0.2, off + 0.8, 0.28, { rz: -0.3, ry: -0.6 });
      this.addTo(P, geo.box(0.09, 0.11, 0.02), pm, 0.05, off + 0.2, -0.43, { rz: 0.1 });
    }
    if (st.sash) {
      // Cà sa vắt chéo từ vai trái xuống hông phải.
      const sm = this.m('sash', st.sash);
      const band = this.addTo(P, geo.box(0.2, 0.86, 0.06), sm, 0.02, off + 0.82, 0.25, { rz: -0.62, rx: -0.12 });
      band.scale.z = 1;
      this.addTo(P, geo.box(0.2, 0.86, 0.06), sm, 0.02, off + 0.82, -0.25, { rz: 0.62, rx: 0.12 });
      this.addTo(P, geo.torus(0.3, 0.055, 5, 14, Math.PI * 1.2), sm, 0.12, off + 0.95, 0, { rx: Math.PI / 2, rz: 1.2 });
      if (st.sashTrim) {
        const tm = this.m('sashTrim', st.sashTrim);
        this.addTo(P, geo.box(0.03, 0.86, 0.07), tm, -0.07, off + 0.86, 0.26, { rz: -0.62, rx: -0.12 });
      }
    }
    if (st.collar) {
      const cm = this.m('collar', st.collar);
      if (look.outfit.robe === 'civ_vest') {
        this.addTo(P, geo.cone(0.12, 0.26, 3), cm, 0, off + 0.94, 0.27, { rx: Math.PI, scale: [1, 1, 0.3] });
        if (st.tie) this.addTo(P, geo.box(0.05, 0.22, 0.02), this.m('tie', st.tie), 0, off + 0.88, 0.31);
      } else {
        this.addTo(P, geo.torus(0.2, 0.035, 5, 14), cm, 0, off + 1.03, 0.02, { rx: Math.PI / 2 + 0.2 });
      }
    }
    if (look.outfit.robe === 'civ_ba_ba') {
      const bm = this.m('btn', '#c8a064');
      for (let i = 0; i < 3; i++) this.addTo(P, geo.sphere(0.018, 5, 4), bm, 0.04, off + 0.95 - i * 0.12, 0.31 - i * 0.005);
    }

    // Tay áo + bàn tay.
    const sleeve = this.m('sleeve', st.sleeve);
    this.skinMat = this.m('skin', look.skin);
    for (const [sh, hand] of [
      [this.shoulderL, this.handL],
      [this.shoulderR, this.handR],
    ] as const) {
      this.addTo(sh, geo.capsule(st.wide ? 0.11 : 0.085, 0.24, 3, 8), sleeve, 0, -0.2, 0);
      if (st.wide) this.addTo(sh, geo.cyl(0.13, 0.17, 0.12, 8), sleeve, 0, -0.34, 0);
      this.addTo(hand, geo.sphere(0.085, 8, 6), this.skinMat, 0, 0, 0);
    }

    // Đầu + mặt.
    const H = this.head;
    this.addTo(H, HEAD_GEO, this.skinMat, 0, 0, 0, { scale: [1, 0.96, 0.98] });
    for (const x of [0.3, -0.3]) this.addTo(H, geo.sphere(0.07, 6, 5), this.skinMat, x, 0.0, -0.01, { scale: [0.45, 1, 0.8] });
    const eyeMat = this.m('eye', '#241812', { roughness: 0.3 });
    const shine = this.m('shine', '#ffffff', { emissive: '#ffffff', ei: 0.6 });
    this.eyes = [];
    for (const x of [0.11, -0.11]) {
      const e = this.addTo(H, geo.sphere(0.055, 10, 8), eyeMat, x, 0.045, 0.268, { scale: [0.82, 1.15, 0.5], shadow: false });
      this.eyes.push(e);
      // Đốm sáng trong mắt: bù tỉ lệ không đều của tròng mắt để luôn tròn nhỏ.
      this.addTo(e, geo.sphere(0.017, 6, 5), shine, 0.022, 0.024, 0.05, { shadow: false, scale: [1 / 0.82, 1 / 1.15, 1 / 0.5] });
    }
    const blushMat = this.m('blush', '#ff8fa3', { transparent: true, opacity: 0.5 });
    this.blush = [];
    for (const x of [0.19, -0.19]) this.blush.push(this.addTo(H, geo.sphere(0.05, 8, 6), blushMat, x, -0.055, 0.235, { scale: [1, 0.6, 0.35], shadow: false }));
    this.addTo(H, geo.torus(0.05, 0.012, 4, 10, Math.PI), this.m('mouth', '#6b2e1d'), 0, -0.075, 0.287, { rz: Math.PI, shadow: false });

    this.buildHair(look.hair, look);
    this.buildHat(look);
    this.buildAccessory(look);
    if (look.isHost) this.itemL.add(staffMesh());
    this.setDrunk(this.drunk);
    if (this.ghost) this.setGhost(true);
  }

  private buildHair(hair: HairId, look: AvatarLook): void {
    if (hair === 'bald') return;
    const hm = this.m('hair', ['#2b1d16', '#4a2f1f', '#1b1b1f', '#6a3f22'][(look.skin.length + hair.length) % 4]!);
    const H = this.head;
    this.addTo(H, HAIR_CAP_GEO, hm, 0, 0.02, -0.015, { rx: -0.15 });
    if (hair === 'long') this.addTo(H, geo.capsule(0.22, 0.25, 4, 10), hm, 0, -0.18, -0.16, { scale: [1.2, 1, 0.6] });
    if (hair === 'bun') this.addTo(H, geo.sphere(0.12, 8, 6), hm, 0, 0.32, -0.08);
    if (hair === 'spiky') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.addTo(H, geo.cone(0.07, 0.17, 5), hm, Math.cos(a) * 0.14, 0.27, Math.sin(a) * 0.14 - 0.03, { rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6 });
      }
    }
  }

  private buildHat(look: AvatarLook): void {
    const H = this.head;
    if (look.isHost) {
      // Mũ Tỳ Lư: vành vàng + 5 cánh đỏ viền kim.
      const gold = this.m('gold', '#ffd166', { metalness: 0.4, roughness: 0.4, emissive: '#b8862f', ei: 0.25 });
      const red = this.m('hatRed', '#c8432f');
      this.addTo(H, geo.cyl(0.3, 0.31, 0.08, 14), gold, 0, 0.2, -0.01);
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.55;
        const petal = new THREE.Group();
        petal.position.set(Math.sin(a) * 0.27, 0.32, Math.cos(a) * 0.27 - 0.03);
        petal.rotation.set(-0.25, a, 0);
        petal.add(kit.mesh(geo.sphere(1, 8, 6), gold, { scale: [0.12, 0.17, 0.025] }));
        petal.add(kit.mesh(geo.sphere(1, 8, 6), red, { scale: [0.1, 0.145, 0.03], z: 0.006 }));
        H.add(petal);
      }
      this.addTo(H, geo.sphere(0.05, 8, 6), gold, 0, 0.43, -0.03);
      return;
    }
    switch (look.outfit.hat) {
      case 'non_la':
        this.addTo(H, geo.cone(0.5, 0.27, 16), this.m('nonla', '#ead39a'), 0, 0.33, 0);
        this.addTo(H, geo.torus(0.36, 0.008, 3, 20), this.m('nonlaLine', '#c9a96a'), 0, 0.28, 0, { rx: Math.PI / 2 });
        break;
      case 'mu_len':
        this.addTo(H, new THREE.SphereGeometry(0.335, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), this.m('beanie', '#d9483c'), 0, 0.03, 0);
        this.addTo(H, geo.torus(0.32, 0.045, 6, 18), this.m('beanieBand', '#f3efe4'), 0, 0.06, 0, { rx: Math.PI / 2 });
        this.addTo(H, geo.ico(0.075, 1), this.m('pompom', '#fffaf0'), 0, 0.38, 0);
        break;
      case 'mu_vip': {
        const black = this.m('tophat', '#1d1d24', { roughness: 0.4 });
        this.addTo(H, geo.cyl(0.38, 0.38, 0.03, 18), black, 0, 0.24, 0);
        this.addTo(H, geo.cyl(0.24, 0.25, 0.34, 16), black, 0, 0.42, 0);
        this.addTo(H, geo.cyl(0.252, 0.255, 0.07, 16), this.m('gold', '#ffd166', { metalness: 0.4, roughness: 0.4 }), 0, 0.29, 0);
        break;
      }
      default:
        break;
    }
  }

  private buildAccessory(look: AvatarLook): void {
    const P = this.outfitParts;
    const off = -0.45;
    switch (look.outfit.accessory) {
      case 'trang_hat': {
        const bead = this.m('bead', '#6e3b26', { roughness: 0.5 });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          this.addTo(P, geo.sphere(0.028, 6, 4), bead, Math.cos(a) * 0.25, off + 1.0 - Math.max(0, Math.sin(a)) * 0.16, Math.sin(a) * 0.25 + 0.03, { shadow: false });
        }
        this.addTo(P, geo.cone(0.035, 0.09, 5), this.m('tassel', '#b5382f'), 0, off + 0.74, 0.3, { rx: Math.PI });
        break;
      }
      case 'quat_nan': {
        const fan = new THREE.Group();
        const fm = this.m('fan', '#e8c58a');
        fm.side = THREE.DoubleSide;
        fan.add(kit.mesh(new THREE.CircleGeometry(0.22, 12, 0, Math.PI), fm, { y: 0.06 }));
        fan.add(kit.mesh(geo.cyl(0.012, 0.012, 0.14, 4), this.m('fanStick', '#8a5a2b'), { y: 0.0 }));
        fan.rotation.set(0, Math.PI / 2, 0);
        this.itemL.add(fan);
        break;
      }
      case 'kinh_ram': {
        const lens = this.m('lens', '#141418', { roughness: 0.15, metalness: 0.6 });
        for (const x of [0.11, -0.11]) this.addTo(this.head, geo.box(0.13, 0.08, 0.02), lens, x, 0.05, 0.3, { shadow: false });
        this.addTo(this.head, geo.box(0.08, 0.015, 0.015), lens, 0, 0.065, 0.305, { shadow: false });
        break;
      }
      case 'day_chuyen_vang': {
        const gold = this.m('gold', '#ffd166', { metalness: 0.5, roughness: 0.35, emissive: '#b8862f', ei: 0.3 });
        this.addTo(P, geo.torus(0.23, 0.018, 4, 18), gold, 0, off + 0.98, 0.03, { rx: Math.PI / 2 + 0.35 });
        this.addTo(P, geo.cyl(0.06, 0.06, 0.02, 12), gold, 0, off + 0.82, 0.31, { rx: Math.PI / 2 - 0.25 });
        break;
      }
      default:
        break;
    }
  }

  setLook(look: AvatarLook): void {
    this.buildLook(look);
    this.setHeld(this.held);
  }

  setHeld(item: HeldItem | null): void {
    this.held = item;
    this.itemR.clear();
    this.carry.clear();
    this.grip = item ? gripStyle(item.kind) : null;
    if (!item) return;
    const meshObj = createHeldItemMesh(item);
    if (this.grip === 'carry') this.carry.add(meshObj);
    else this.itemR.add(meshObj);
    this.refreshTool();
  }

  setAnim(anim: AnimId): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.animTime = 0;
    this.refreshTool();
  }

  private refreshTool(): void {
    const kind = this.held ? null : (TOOL_FOR[this.anim] ?? null);
    if (kind === this.toolKind) return;
    if (this.tool) this.itemR.remove(this.tool);
    this.tool = kind ? toolMesh(kind) : null;
    this.toolKind = kind;
    if (this.tool) this.itemR.add(this.tool);
  }

  setTapNiem(level: number): void {
    this.tapNiem = level;
    this.cloud.visible = level >= 50;
    const storm = level >= 80;
    (this.mats.get('cloud') as THREE.MeshStandardMaterial).color.set(storm ? '#4d4f5c' : '#8a8c98');
    for (const d of this.rain) d.visible = storm;
  }

  setDrunk(level: number): void {
    this.drunk = level;
    const k = Math.min(1, level / 100);
    const bm = this.mats.get('blush');
    if (bm) {
      bm.opacity = 0.45 + k * 0.5;
      bm.color.set(k > 0.3 ? '#ff5a6e' : '#ff8fa3');
    }
    for (const b of this.blush) b.scale.set(1 + k * 0.5, 0.6 + k * 0.3, 0.35);
  }

  setGhost(ghost: boolean): void {
    this.ghost = ghost;
    for (const mt of this.owned) {
      const m = mt as THREE.MeshStandardMaterial;
      if (m.userData.baseOpacity === undefined) {
        m.userData.baseOpacity = m.opacity;
        m.userData.baseTransparent = m.transparent;
      }
      m.transparent = ghost || (m.userData.baseTransparent as boolean);
      m.opacity = ghost ? Math.min(0.38, m.userData.baseOpacity as number) : (m.userData.baseOpacity as number);
      m.needsUpdate = true;
    }
  }

  setGlow(color: string | null): void {
    this.glowColor = color;
    this.glow.visible = !!color;
    this.glowRing.visible = !!color;
    if (color) {
      (this.glow.material as THREE.MeshBasicMaterial).color.set(color);
      (this.glowRing.material as THREE.MeshBasicMaterial).color.set(color);
    }
  }

  playRankUp(): void {
    this.rankT = 0;
    this.rankFx.clear();
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.035, 6, 32),
        new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.userData.delay = i * 0.22;
      this.rankFx.add(ring);
    }
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 3.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 1.6;
    beam.userData.beam = true;
    this.rankFx.add(beam);
  }

  // ───────────────────────── Hoạt ảnh ─────────────────────────

  private computeTarget(t: number): void {
    const T = this.target;
    Object.assign(T, BASE);
    const a = this.animTime;
    const ph = this.phase;
    const carry = this.grip === 'carry';
    const upright = this.grip === 'upright';
    const breath = Math.sin(t * 2.1) * 0.018;
    T.sy = 1 + breath;
    switch (this.anim) {
      case 'idle':
      case 'carry_idle':
        T.lx = 0.12 + Math.sin(t * 1.3) * 0.04;
        T.rx = 0.12 + Math.sin(t * 1.3 + 1) * 0.04;
        T.headZ = Math.sin(t * 0.7) * 0.05;
        break;
      case 'walk':
      case 'carry_walk': {
        const b = Math.abs(Math.sin(ph));
        T.y = b * 0.075;
        T.sy = 1 + (b - 0.5) * 0.07;
        T.step = 1;
        T.lean = 0.07;
        T.roll = Math.sin(ph) * 0.045;
        T.rx = 0.12 + Math.sin(ph) * 0.6;
        T.lx = 0.12 - Math.sin(ph) * 0.6;
        T.headX = -0.03;
        break;
      }
      case 'sweep': {
        const s = Math.sin(t * 7);
        T.lean = 0.28;
        T.twist = s * 0.38;
        T.rx = 0.85;
        T.lx = 0.95;
        T.rz = -0.15 + s * 0.2;
        T.lz = -0.25 - s * 0.2;
        T.headX = 0.25;
        break;
      }
      case 'chop': {
        const c = (a * 2) % 1;
        const up = c < 0.55 ? c / 0.55 : 1 - (c - 0.55) / 0.45;
        T.rx = T.lx = 0.5 + up * 2.4;
        T.rz = T.lz = -0.25;
        T.lean = 0.05 + (1 - up) * 0.3;
        T.sy = 1 + up * 0.05;
        break;
      }
      case 'cut':
        T.rx = 0.95 + Math.sin(t * 22) * 0.25;
        T.lx = 0.8;
        T.lz = -0.2;
        T.lean = 0.25;
        T.headX = 0.3;
        break;
      case 'crank':
        T.rx = 1.1 + Math.sin(t * 8) * 0.35;
        T.lx = 1.1 + Math.cos(t * 8) * 0.35;
        T.rz = T.lz = -0.2;
        T.lean = 0.2;
        break;
      case 'pour':
        T.rx = T.lx = 1.25;
        T.rz = T.lz = -0.25;
        T.lean = 0.38;
        T.headX = 0.3;
        break;
      case 'wash':
        T.rx = 0.9 + Math.sin(t * 6) * 0.15;
        T.lx = 0.9 + Math.cos(t * 6) * 0.15;
        T.rz = T.lz = -0.3;
        T.lean = 0.45;
        T.headX = 0.3;
        break;
      case 'stir':
        T.rx = 1.0 + Math.sin(t * 5) * 0.2;
        T.rz = -0.1 + Math.cos(t * 5) * 0.25;
        T.lx = 0.2;
        T.lz = 0.5;
        T.lean = 0.15;
        break;
      case 'fan':
        T.rx = 0.85 + Math.sin(t * 18) * 0.3;
        T.lean = 0.3;
        T.headX = 0.25;
        break;
      case 'pick':
        T.rx = 2.6 + Math.sin(t * 4) * 0.15;
        T.lx = 0.3;
        T.y = 0.04;
        T.sy = 1.05;
        T.headX = -0.35;
        break;
      case 'release': {
        const c = (a * 1.2) % 1;
        T.lean = 0.5 - c * 0.4;
        T.rx = T.lx = 0.9 + c * 1.6;
        T.rz = T.lz = -0.15;
        break;
      }
      case 'sit':
        T.hipsY = 0.2;
        T.tuck = 1;
        T.rx = T.lx = 0.45;
        T.rz = T.lz = -0.35;
        T.headX = 0.05 + Math.sin(t * 0.8) * 0.03;
        T.sy = 1 + breath * 1.5;
        break;
      case 'kneel':
        T.hipsY = 0.25;
        T.tuck = 1;
        T.lean = 0.35;
        T.rx = T.lx = 1.1;
        T.rz = T.lz = -0.42;
        T.headX = 0.35;
        break;
      case 'prostrate': {
        // Lạy từ tư thế quỳ: chắp tay, cúi rạp xuống rồi ngẩng lên (animTime đặt lại mỗi lạy).
        const e = prostrateDip(a);
        T.hipsY = 0.25 - e * 0.06;
        T.tuck = 1;
        T.lean = 0.3 + e * 1.05;
        T.rx = T.lx = 1.1 + e * 0.75;
        T.rz = T.lz = -0.42 + e * 0.12;
        T.headX = 0.3 + e * 0.35;
        break;
      }
      case 'bow': {
        const b = Math.sin(a * 2.4) * 0.5 + 0.5;
        T.lean = b * 0.95;
        T.rx = T.lx = 1.15;
        T.rz = T.lz = -0.42;
        T.headX = 0.2 + b * 0.2;
        break;
      }
      case 'pray':
        T.rx = T.lx = 1.25;
        T.rz = T.lz = -0.46;
        T.headX = 0.15 + Math.sin(t * 2) * 0.06;
        T.lean = 0.06;
        break;
      case 'strike': {
        const tap = Math.pow(Math.max(0, Math.sin(a * 12.6)), 3);
        T.hipsY = 0.2;
        T.tuck = 1;
        T.rx = 0.95 - tap * 0.55;
        T.lx = 1.1;
        T.lz = -0.42;
        T.rz = 0;
        T.headX = 0.15;
        break;
      }
      case 'pull': {
        const p = Math.sin(a * 3) * 0.5 + 0.5;
        T.rx = T.lx = 2.75 - p * 1.1;
        T.rz = T.lz = -0.1;
        T.sy = 1 - p * 0.06;
        T.lean = -0.05 + p * 0.15;
        break;
      }
      case 'shake':
        T.rx = 2.1 + Math.sin(t * 26) * 0.18;
        T.lx = 2.1 + Math.sin(t * 26 + 0.6) * 0.18;
        T.rz = T.lz = -0.35;
        T.y = Math.abs(Math.sin(t * 13)) * 0.03;
        break;
      case 'drink':
        T.rx = 2.25;
        T.rz = -0.5;
        T.headX = -0.35;
        T.lean = -0.08;
        break;
      case 'dj':
        T.lx = 2.45;
        T.lz = -0.75;
        T.rx = 1.05 + Math.sin(t * 9) * 0.15;
        T.rz = -0.2 + Math.sin(t * 9) * 0.3;
        T.headX = Math.sin(t * 8.5) * 0.15;
        T.y = Math.abs(Math.sin(t * 4.25)) * 0.04;
        break;
      case 'dance': {
        const s = Math.sin(t * 8);
        T.y = Math.abs(s) * 0.12;
        T.twist = Math.sin(t * 4) * 0.45;
        T.rx = s > 0 ? 2.6 : 0.6;
        T.lx = s > 0 ? 0.6 : 2.6;
        T.rz = T.lz = 0.3;
        T.headZ = Math.sin(t * 4) * 0.15;
        T.step = 0.6;
        break;
      }
      case 'dance2':
        T.roll = Math.sin(t * 5) * 0.28;
        T.y = Math.abs(Math.sin(t * 10)) * 0.07;
        T.rx = T.lx = 2.8;
        T.rz = 0.3 + Math.sin(t * 5) * 0.35;
        T.lz = 0.3 - Math.sin(t * 5) * 0.35;
        T.step = 0.8;
        break;
      case 'dance3':
        T.y = Math.abs(Math.sin(t * 5)) * 0.24;
        T.rx = T.lx = 0.4;
        T.rz = T.lz = 1.35;
        T.sy = 1 + Math.sin(t * 10) * 0.05;
        break;
      case 'wave':
        T.rx = 2.7;
        T.rz = 0.15 + Math.sin(t * 12) * 0.4;
        T.headZ = 0.12;
        break;
      case 'laugh':
        T.lean = -0.18;
        T.headX = -0.3;
        T.y = Math.abs(Math.sin(t * 18)) * 0.025;
        T.rx = T.lx = 0.65;
        T.rz = T.lz = -0.4;
        T.roll = Math.sin(t * 9) * 0.06;
        break;
      case 'clap': {
        const c = Math.abs(Math.sin(t * 13));
        T.rx = T.lx = 1.2;
        T.rz = T.lz = -0.62 + c * 0.45;
        break;
      }
      case 'cry':
        T.rx = T.lx = 2.35;
        T.rz = T.lz = -0.62;
        T.headX = 0.3;
        T.y = Math.abs(Math.sin(t * 11)) * 0.02;
        T.lean = 0.12;
        break;
      case 'angry':
        T.y = Math.pow(Math.abs(Math.sin(t * 7)), 6) * 0.08;
        T.rx = T.lx = 0.2;
        T.rz = T.lz = 0.55;
        T.headX = 0.12;
        T.roll = Math.sin(t * 14) * 0.03;
        break;
      case 'cheer':
        T.y = Math.abs(Math.sin(t * 6)) * 0.26;
        T.rx = T.lx = 2.95;
        T.rz = T.lz = 0.35;
        T.headX = -0.2;
        break;
      case 'stumble':
        T.roll = Math.sin(t * 9) * 0.38;
        T.lean = Math.sin(t * 5) * 0.2;
        T.rx = 1.4 + Math.sin(t * 13) * 0.6;
        T.lx = 1.4 - Math.sin(t * 13) * 0.6;
        T.rz = T.lz = 0.8;
        break;
    }
    // Cầm đồ: tay giữ vật trước người (trừ khi hoạt ảnh tự đặt tay lên cao).
    const busyHands = !['idle', 'walk', 'carry_idle', 'carry_walk'].includes(this.anim);
    if (carry && !busyHands) {
      T.rx = T.lx = 1.12;
      T.rz = T.lz = -0.22;
    } else if (upright && !busyHands) {
      T.rx = 0.75 + (MOVING.has(this.anim) ? Math.sin(ph) * 0.12 : 0);
      T.rz = -0.1;
    }
    // Say: lảo đảo.
    if (this.drunk > 30) {
      const k = Math.min(1, (this.drunk - 30) / 70);
      T.roll += Math.sin(t * 1.7) * 0.12 * k;
      T.headZ += Math.sin(t * 1.3) * 0.15 * k;
    }
  }

  update(dt: number, time: number, speed: number): void {
    this.time = time;
    this.animTime += dt;
    if (MOVING.has(this.anim)) this.phase += dt * (2.2 + speed * 1.9);
    this.computeTarget(time);
    const k = Math.min(1, dt * 12);
    const P = this.pose;
    const T = this.target;
    for (const key of POSE_KEYS) P[key] += (T[key] - P[key]) * k;

    if (this.anim === 'dance3') this.spin += dt * 6.5;
    else this.spin *= Math.max(0, 1 - dt * 10);

    this.bounce.position.y = P.y;
    const sx = 1 / Math.sqrt(Math.max(0.6, P.sy));
    this.bounce.scale.set(sx, P.sy, sx);
    this.bounce.rotation.y = this.spin;
    this.hips.position.y = P.hipsY;
    this.hips.rotation.set(P.lean, P.twist, P.roll);
    this.head.rotation.set(P.headX, 0, P.headZ);
    this.shoulderL.rotation.set(-P.lx, 0, P.lz);
    this.shoulderR.rotation.set(-P.rx, 0, -P.rz);

    // Vật đứng thẳng (ly, đèn, nhang…) và tích trượng: bù góc tay + người để luôn thẳng đứng.
    const keepUpright = this.grip === 'upright';
    this.itemR.rotation.set(keepUpright ? P.rx - P.lean : 0, 0, keepUpright ? P.rz : 0);
    this.itemL.rotation.set(P.lx - P.lean, 0, -P.lz);

    // Chân: bước khi đi, thu vào khi ngồi.
    const step = P.step * Math.sin(this.phase);
    const lift = P.step * 0.07;
    this.footL.position.set(0.15 - P.tuck * 0.06, 0.055 + Math.max(0, Math.cos(this.phase)) * lift, 0.03 + step * 0.17 + P.tuck * 0.12);
    this.footR.position.set(-0.15 + P.tuck * 0.06, 0.055 + Math.max(0, -Math.cos(this.phase)) * lift, 0.03 - step * 0.17 + P.tuck * 0.12);
    this.footL.visible = this.footR.visible = P.tuck < 0.8;

    // Chớp mắt (say nặng thì lim dim).
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blinkLeft = 0.12;
      this.blinkAt = 2.2 + Math.random() * 3.5;
    }
    let eyeY = 1.15;
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
      eyeY = 0.12;
    } else if (this.drunk > 60 || this.anim === 'sit' || this.anim === 'laugh') {
      eyeY = 0.35;
    }
    for (const e of this.eyes) e.scale.y = eyeY;

    // Giận: mặt đỏ phừng.
    this.skinMat.emissive.set(this.anim === 'angry' ? '#ff2a10' : '#000000');
    this.skinMat.emissiveIntensity = this.anim === 'angry' ? 0.18 + Math.sin(time * 10) * 0.08 : 0;

    // Mây Tạp Niệm.
    if (this.cloud.visible) {
      this.cloud.position.y = 1.95 + Math.sin(time * 1.6) * 0.05;
      this.cloud.rotation.y += dt * 0.3;
      if (this.tapNiem >= 80) {
        this.boltT -= dt;
        if (this.boltT <= 0) {
          this.bolt.visible = !this.bolt.visible;
          this.boltT = this.bolt.visible ? 0.08 + Math.random() * 0.1 : 0.6 + Math.random() * 2;
        }
        for (const d of this.rain) {
          d.position.y -= dt * (d.userData.speed as number);
          if (d.position.y < -1.2) d.position.y = -0.18;
        }
      } else {
        this.bolt.visible = false;
      }
    }

    if (this.glowColor) {
      const gm = this.glow.material as THREE.MeshBasicMaterial;
      gm.opacity = 0.2 + Math.sin(time * 3) * 0.08;
      this.glowRing.rotation.y += dt * 0.8;
      this.glowRing.scale.setScalar(1 + Math.sin(time * 2.5) * 0.06);
    }

    // Thăng cấp: vòng sáng bay lên + cột sáng + nhân vật xoay nảy.
    if (this.rankT >= 0) {
      this.rankT += dt;
      const r = this.rankT;
      for (const c of this.rankFx.children) {
        const m = c as THREE.Mesh;
        const mat = m.material as THREE.MeshBasicMaterial;
        if (c.userData.beam) {
          mat.opacity = Math.max(0, 0.45 * (1 - r / 1.6));
          m.scale.set(1 + r * 0.3, 1, 1 + r * 0.3);
        } else {
          const lt = Math.max(0, r - (c.userData.delay as number));
          m.position.y = 0.1 + lt * 1.9;
          m.scale.setScalar(1 + lt * 0.8);
          mat.opacity = Math.max(0, 1 - lt / 1.2);
        }
      }
      if (r < 0.9) {
        const s = 1 + Math.sin((r / 0.9) * Math.PI) * 0.25;
        this.bounce.scale.multiplyScalar(s);
        this.bounce.rotation.y += (r / 0.9) * Math.PI * 2;
      }
      if (r > 1.8) {
        this.rankT = -1;
        for (const c of this.rankFx.children) {
          const m = c as THREE.Mesh;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
        this.rankFx.clear();
      }
    }
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
    this.owned.clear();
    this.mats.clear();
    this.glowRing.geometry.dispose();
    this.root.removeFromParent();
  }
}

export const createAvatar: CreateAvatar = (look: AvatarLook): AvatarHandle => new BeanAvatar(look);

// ───────────────────────── Góc nhìn thứ nhất ─────────────────────────

interface HandPose {
  rx: number;
  ry: number;
  rz: number;
  lx: number;
  ly: number;
  lz: number;
  /** Góc nghiêng bàn tay phải (cầm đồ). */
  rrot: number;
  lrot: number;
  vis: number;
}

const FP_BASE: HandPose = { rx: 0.31, ry: -0.36, rz: -0.56, lx: -0.31, ly: -0.38, lz: -0.56, rrot: 0, lrot: 0, vis: 1 };
const FP_KEYS = Object.keys(FP_BASE) as (keyof HandPose)[];

class FirstPersonHands implements FirstPersonHandle {
  readonly root = new THREE.Group();
  private readonly right = new THREE.Group();
  private readonly left = new THREE.Group();
  private readonly itemR = new THREE.Group();
  private readonly carry = new THREE.Group();
  private readonly sleeveMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly trimMat: THREE.MeshStandardMaterial;
  private anim: AnimId = 'idle';
  private animTime = 0;
  private phase = 0;
  private grip: GripStyle | null = null;
  private hasItem = false;
  private tool: THREE.Group | null = null;
  private toolKind: string | null = null;
  private readonly pose: HandPose = { ...FP_BASE };
  private readonly target: HandPose = { ...FP_BASE };

  constructor(look: AvatarLook) {
    this.sleeveMat = kit.matUnique('#8b6a4a');
    this.skinMat = kit.matUnique(look.skin);
    this.trimMat = kit.matUnique('#ffd166');
    for (const [g, side] of [
      [this.right, 1],
      [this.left, -1],
    ] as const) {
      // Tay áo chạy ra sau-xuống khỏi khung hình; bàn tay ở đầu.
      const sleeve = kit.mesh(geo.cyl(0.075, 0.095, 0.55, 10), this.sleeveMat, { castShadow: false, receiveShadow: false });
      sleeve.position.set(side * 0.03, -0.12, 0.26);
      sleeve.rotation.x = -1.15;
      g.add(sleeve);
      const cuff = kit.mesh(geo.torus(0.078, 0.014, 5, 12), this.trimMat, { castShadow: false, receiveShadow: false });
      cuff.position.set(side * 0.005, -0.015, 0.035);
      cuff.rotation.x = -1.15 + Math.PI / 2;
      cuff.visible = false;
      cuff.name = 'cuff';
      g.add(cuff);
      g.add(kit.mesh(geo.sphere(0.068, 10, 8), this.skinMat, { scale: [1, 0.85, 1.15], castShadow: false, receiveShadow: false }));
      g.add(kit.mesh(geo.sphere(0.03, 6, 5), this.skinMat, { x: -side * 0.055, y: 0.02, z: -0.02, castShadow: false, receiveShadow: false }));
      this.root.add(g);
    }
    this.right.add(this.itemR);
    this.itemR.position.set(0, 0.02, -0.02);
    this.carry.position.set(0, -0.3, -0.62);
    this.root.add(this.carry);
    this.setLook(look);
  }

  setLook(look: AvatarLook): void {
    const st = robeStyle(look);
    this.sleeveMat.color.set(st.sleeve);
    this.skinMat.color.set(look.skin);
    const trim = st.trim ?? (look.isHost ? '#ffd166' : null);
    for (const g of [this.right, this.left]) {
      const cuff = g.getObjectByName('cuff');
      if (cuff) cuff.visible = !!trim;
    }
    if (trim) this.trimMat.color.set(trim);
  }

  setHeld(item: HeldItem | null): void {
    this.itemR.clear();
    this.carry.clear();
    this.grip = item ? gripStyle(item.kind) : null;
    this.hasItem = !!item;
    if (!item) {
      this.refreshTool();
      return;
    }
    const m = createHeldItemMesh(item);
    m.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    if (this.grip === 'carry') {
      m.scale.setScalar(0.85);
      this.carry.add(m);
    } else {
      if (this.grip === 'tool') m.rotation.set(-0.5, 0.2, 0.15);
      this.itemR.add(m);
    }
    this.refreshTool();
  }

  setAnim(anim: AnimId): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.animTime = 0;
    this.refreshTool();
  }

  private refreshTool(): void {
    const kind = this.hasItem ? null : (TOOL_FOR[this.anim] ?? null);
    if (kind === this.toolKind) return;
    if (this.tool) this.itemR.remove(this.tool);
    this.tool = kind ? toolMesh(kind) : null;
    this.toolKind = kind;
    if (this.tool) {
      this.tool.rotation.set(-0.35, 0, 0.1);
      this.itemR.add(this.tool);
    }
  }

  private computeTarget(t: number): void {
    const T = this.target;
    Object.assign(T, FP_BASE);
    const a = this.animTime;
    const breath = Math.sin(t * 2) * 0.006;
    T.ry += breath;
    T.ly += breath;
    if (this.grip === 'carry') {
      T.rx = 0.17;
      T.lx = -0.17;
      T.ry = T.ly = -0.33;
      T.rz = T.lz = -0.58;
    } else if (this.grip === 'upright') {
      T.rx = 0.24;
      T.ry = -0.27;
      T.rz = -0.5;
    } else if (this.grip === 'tool') {
      T.rx = 0.2;
      T.ry = -0.3;
      T.lx = 0.06;
      T.ly = -0.2;
      T.lz = -0.5;
    }
    switch (this.anim) {
      case 'sweep': {
        const s = Math.sin(t * 7) * 0.16;
        T.rx = 0.16 + s;
        T.lx = 0.02 + s;
        T.ry = -0.33;
        T.ly = -0.2;
        T.rrot = s * 1.5;
        break;
      }
      case 'chop': {
        const c = (a * 2) % 1;
        const up = c < 0.55 ? c / 0.55 : 1 - (c - 0.55) / 0.45;
        T.rx = 0.08;
        T.lx = -0.02;
        T.ry = T.ly = -0.42 + up * 0.5;
        T.rz = T.lz = -0.5 + up * 0.1;
        T.rrot = -up * 0.9;
        break;
      }
      case 'cut':
        T.rx = 0.14;
        T.ry = -0.38 + Math.abs(Math.sin(t * 22)) * 0.07;
        T.rrot = -0.4;
        break;
      case 'strike': {
        const tap = Math.pow(Math.max(0, Math.sin(a * 12.6)), 3);
        T.rx = 0.2;
        T.ry = -0.26 - tap * 0.14;
        T.rrot = -0.3 - tap * 0.5;
        T.lx = -0.05;
        T.ly = -0.3;
        T.lz = -0.45;
        break;
      }
      case 'pull': {
        const p = Math.sin(a * 3) * 0.5 + 0.5;
        T.rx = 0.1;
        T.lx = -0.1;
        T.ry = T.ly = 0.12 - p * 0.32;
        T.rz = T.lz = -0.5;
        break;
      }
      case 'pour':
      case 'wash':
        T.rx = 0.12 + Math.sin(t * 6) * 0.03;
        T.lx = -0.12 + Math.cos(t * 6) * 0.03;
        T.ry = T.ly = -0.42;
        T.rrot = T.lrot = this.anim === 'pour' ? 0.6 : 0;
        break;
      case 'stir':
        T.rx = 0.16 + Math.cos(t * 5) * 0.06;
        T.rz = -0.58 + Math.sin(t * 5) * 0.05;
        T.ry = -0.36;
        break;
      case 'fan':
        T.rx = 0.18;
        T.ry = -0.4 + Math.sin(t * 18) * 0.05;
        T.rrot = Math.sin(t * 18) * 0.4;
        break;
      case 'crank':
        T.rx = 0.12 + Math.sin(t * 8) * 0.05;
        T.ry = -0.33 + Math.cos(t * 8) * 0.05;
        T.lx = -0.12 + Math.sin(t * 8 + 1) * 0.05;
        T.ly = -0.33 + Math.cos(t * 8 + 1) * 0.05;
        break;
      case 'pick':
        T.rx = 0.12;
        T.ry = 0.02 + Math.sin(t * 4) * 0.02;
        T.rz = -0.62;
        break;
      case 'release': {
        const c = (a * 1.2) % 1;
        T.ry = T.ly = -0.42 + c * 0.35;
        break;
      }
      case 'shake':
        T.rx = 0.08 + Math.sin(t * 26) * 0.02;
        T.lx = -0.08 + Math.sin(t * 26) * 0.02;
        T.ry = T.ly = -0.08 + Math.sin(t * 26 + 1) * 0.03;
        T.rz = T.lz = -0.45;
        break;
      case 'drink':
        T.rx = 0.05;
        T.ry = -0.13;
        T.rz = -0.3;
        T.rrot = 0.9;
        T.lx = -0.3;
        T.ly = -0.42;
        break;
      case 'wave':
        T.rx = 0.32;
        T.ry = 0.0;
        T.rz = -0.5;
        T.rrot = Math.sin(t * 12) * 0.5;
        break;
      case 'pray':
      case 'kneel':
      case 'prostrate':
      case 'bow':
      case 'sit':
        T.rx = 0.035;
        T.lx = -0.035;
        T.ry = T.ly = this.anim === 'sit' ? -0.36 : -0.22;
        T.rz = T.lz = -0.42;
        T.rrot = -0.25;
        T.lrot = 0.25;
        break;
      case 'clap': {
        const c = Math.abs(Math.sin(t * 13));
        T.rx = 0.04 + c * 0.13;
        T.lx = -0.04 - c * 0.13;
        T.ry = T.ly = -0.22;
        T.rz = T.lz = -0.45;
        break;
      }
      case 'dj':
        T.rx = 0.2 + Math.sin(t * 9) * 0.05;
        T.ry = -0.38;
        T.lx = -0.4;
        T.ly = -0.06;
        T.lz = -0.3;
        break;
      case 'dance':
      case 'dance2':
      case 'dance3':
      case 'cheer': {
        const s = Math.sin(t * 8);
        T.ry = this.anim === 'cheer' ? 0.05 : -0.1 + s * 0.15;
        T.ly = this.anim === 'cheer' ? 0.05 : -0.1 - s * 0.15;
        T.rz = T.lz = -0.5;
        break;
      }
      case 'cry':
        T.rx = 0.09;
        T.lx = -0.09;
        T.ry = T.ly = -0.14 + Math.sin(t * 11) * 0.01;
        T.rz = T.lz = -0.28;
        break;
      case 'laugh':
      case 'angry':
        T.ry = T.ly = -0.42 + Math.abs(Math.sin(t * (this.anim === 'angry' ? 7 : 16))) * 0.03;
        break;
      case 'stumble':
        T.rx = 0.35 + Math.sin(t * 13) * 0.08;
        T.lx = -0.35 - Math.sin(t * 13) * 0.08;
        T.ry = T.ly = -0.2;
        break;
    }
  }

  update(dt: number, time: number, speed: number): void {
    this.animTime += dt;
    if (speed > 0.3) this.phase += dt * (2 + speed * 1.8);
    this.computeTarget(time);
    const k = Math.min(1, dt * 14);
    for (const key of FP_KEYS) this.pose[key] += (this.target[key] - this.pose[key]) * k;
    const P = this.pose;
    const walk = speed > 0.3 ? 1 : 0;
    const bobY = Math.abs(Math.sin(this.phase)) * 0.018 * walk;
    const bobX = Math.sin(this.phase) * 0.012 * walk;
    this.right.position.set(P.rx + bobX, P.ry - bobY, P.rz + Math.sin(this.phase) * 0.02 * walk);
    this.left.position.set(P.lx + bobX, P.ly - bobY, P.lz - Math.sin(this.phase) * 0.02 * walk);
    this.right.rotation.set(P.rrot, 0, -0.15);
    this.left.rotation.set(P.lrot, 0, 0.15);
    this.carry.position.set(bobX, -0.31 - bobY, -0.6);
  }

  dispose(): void {
    this.sleeveMat.dispose();
    this.skinMat.dispose();
    this.trimMat.dispose();
    this.root.removeFromParent();
  }
}

export const createFirstPersonView: CreateFirstPersonView = (look: AvatarLook): FirstPersonHandle => new FirstPersonHands(look);
