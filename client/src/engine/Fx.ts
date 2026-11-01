// Hiệu ứng trong cảnh: chữ bay lên ("+5 Công Đức"), hạt (pháo giấy, cánh sen, lấp lánh, khói, nước, lá, tim,
// nốt nhạc, ngôi sao, nước mắt, hơi giận, đồng xu), vòng sóng loang trên mặt đất, cột sáng thăng cấp,
// bụi bước chân (một bể hạt dùng chung), bụi sáng lơ lửng quanh camera, mưa cánh sen toàn chùa khi Đại lễ thành công.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { BurstKind } from './worldApi';

interface FloatEntry {
  obj: CSS2DObject;
  /** Phần tử gốc do CSS2DRenderer quản lý vị trí (transform bị ghi đè mỗi khung hình). */
  el: HTMLDivElement;
  /** Phần tử con để tự co giãn "nảy" mà không bị CSS2DRenderer ghi đè. */
  inner: HTMLSpanElement;
  age: number;
  life: number;
  y0: number;
}

interface KindSpec {
  geo: THREE.BufferGeometry;
  colors: string[];
  life: [number, number];
  speed: [number, number];
  up: [number, number];
  gravity: number;
  drag: number;
  size: [number, number];
  /** Lắc ngang khi rơi (cánh hoa, lá). */
  flutter: number;
  additive?: boolean;
  /** Không chịu ánh sáng (màu tươi như hoạt hình: nốt nhạc, ngôi sao). */
  unlit?: boolean;
  /** Luôn quay mặt về camera cho đọc được hình: 'rock' lắc lư nhẹ (nốt nhạc), 'spin' xoay tròn (ngôi sao). */
  billboard?: 'rock' | 'spin';
  /** Phình to theo thời gian (khói). */
  grow?: number;
  spin: number;
  fade: boolean;
}

function heartGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.9, 0.1, -0.5, 0.75, 0, 0.35);
  s.bezierCurveTo(0.5, 0.75, 0.9, 0.1, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 6);
  g.scale(0.2, 0.2, 0.2);
  return g;
}

function petalGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.1, 6, 4);
  g.scale(1, 0.18, 0.55);
  return g;
}

function leafGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.12);
  s.quadraticCurveTo(0.11, 0, 0, 0.14);
  s.quadraticCurveTo(-0.11, 0, 0, -0.12);
  return new THREE.ShapeGeometry(s, 4);
}

/** Nốt móc đơn ♪: đầu nốt nghiêng + thân + đuôi cờ. */
function noteGeometry(): THREE.BufferGeometry {
  const head = new THREE.Shape();
  head.absellipse(0, 0, 0.075, 0.054, 0, Math.PI * 2, false, 0.35);
  const stem = new THREE.Shape();
  stem.moveTo(0.046, 0.01);
  stem.lineTo(0.046, 0.27);
  stem.lineTo(0.07, 0.27);
  stem.quadraticCurveTo(0.17, 0.2, 0.125, 0.07);
  stem.quadraticCurveTo(0.13, 0.17, 0.07, 0.19);
  stem.lineTo(0.07, 0.01);
  stem.lineTo(0.046, 0.01);
  const g = new THREE.ShapeGeometry([head, stem], 6);
  g.translate(-0.04, -0.11, 0);
  return g;
}

function starGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.048 : 0.115;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function tearGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.05, 6, 5);
  g.scale(0.8, 1.35, 0.8);
  return g;
}

function coinGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.1, 0.1, 0.028, 12);
  g.rotateX(Math.PI / 2);
  return g;
}

const SPECS: Record<BurstKind, KindSpec> = {
  confetti: {
    geo: new THREE.PlaneGeometry(0.09, 0.14),
    colors: ['#ff5d8f', '#ffd166', '#5ad7ff', '#7ee081', '#b388ff', '#ff9f43'],
    life: [2.2, 3.2],
    speed: [2.5, 5.5],
    up: [4, 8],
    gravity: 6,
    drag: 1.6,
    size: [0.8, 1.3],
    flutter: 1.2,
    spin: 9,
    fade: false,
  },
  petals: {
    geo: petalGeometry(),
    colors: ['#f7a8c0', '#ffc4d6', '#ffe0ea', '#f48fb1'],
    life: [3.5, 5.5],
    speed: [0.3, 1.2],
    up: [0, 0.6],
    gravity: 0.9,
    drag: 0.8,
    size: [0.8, 1.4],
    flutter: 1.4,
    spin: 2.5,
    fade: false,
  },
  sparkle: {
    geo: new THREE.OctahedronGeometry(0.06, 0),
    colors: ['#fff3b0', '#ffd166', '#ffffff', '#ffe08a'],
    life: [0.7, 1.3],
    speed: [0.6, 2.2],
    up: [1.2, 3],
    gravity: -0.4,
    drag: 2.5,
    size: [0.7, 1.5],
    flutter: 0,
    additive: true,
    spin: 6,
    fade: true,
  },
  smoke: {
    geo: new THREE.IcosahedronGeometry(0.22, 0),
    colors: ['#d9d4cc', '#c9c3ba', '#e8e4dc'],
    life: [1.4, 2.4],
    speed: [0.2, 0.7],
    up: [0.6, 1.3],
    gravity: -0.2,
    drag: 1.2,
    size: [0.7, 1.2],
    flutter: 0.2,
    grow: 1.8,
    spin: 1,
    fade: true,
  },
  splash: {
    geo: new THREE.IcosahedronGeometry(0.06, 0),
    colors: ['#8fdcf0', '#bdefff', '#5cc2dd'],
    life: [0.6, 1],
    speed: [1, 3],
    up: [2.5, 5],
    gravity: 11,
    drag: 0.5,
    size: [0.7, 1.4],
    flutter: 0,
    spin: 3,
    fade: true,
  },
  leaves: {
    geo: leafGeometry(),
    colors: ['#6fbf4a', '#8fd16a', '#c9d65a', '#e0b84a'],
    life: [2, 3.4],
    speed: [0.8, 2.2],
    up: [1.5, 3],
    gravity: 2,
    drag: 1.5,
    size: [0.8, 1.3],
    flutter: 1.6,
    spin: 4,
    fade: false,
  },
  hearts: {
    geo: heartGeometry(),
    colors: ['#ff4f7b', '#ff7aa2', '#ffb3c8'],
    life: [1.4, 2.2],
    speed: [0.3, 1],
    up: [1.2, 2.2],
    gravity: -0.3,
    drag: 1.4,
    size: [0.8, 1.3],
    flutter: 0.6,
    spin: 0,
    fade: true,
  },
  notes: {
    geo: noteGeometry(),
    colors: ['#ff5d8f', '#5ad7ff', '#ffd166', '#b388ff', '#7ee081'],
    life: [1.5, 2.3],
    speed: [0.5, 1.2],
    up: [1.1, 1.9],
    gravity: -0.4,
    drag: 1.3,
    size: [1.1, 1.6],
    flutter: 1.5,
    spin: 2.4,
    fade: true,
    unlit: true,
    billboard: 'rock',
  },
  stars: {
    geo: starGeometry(),
    colors: ['#ffd166', '#fff3b0', '#ffb347', '#ffffff'],
    life: [0.8, 1.3],
    speed: [2, 3.6],
    up: [1.6, 3.2],
    gravity: 4,
    drag: 2.4,
    size: [0.9, 1.5],
    flutter: 0,
    spin: 7,
    fade: true,
    unlit: true,
    billboard: 'spin',
  },
  tears: {
    geo: tearGeometry(),
    colors: ['#7fd3ff', '#a8e4ff', '#4fb6f0'],
    life: [0.7, 1.1],
    speed: [1.6, 2.8],
    up: [1.2, 2.4],
    gravity: 9,
    drag: 0.6,
    size: [0.8, 1.3],
    flutter: 0,
    spin: 2,
    fade: true,
  },
  steam: {
    geo: new THREE.IcosahedronGeometry(0.14, 0),
    colors: ['#ff8a80', '#ffb3a7', '#f2ece4', '#ff6f61'],
    life: [0.8, 1.3],
    speed: [0.3, 0.9],
    up: [2.2, 3.4],
    gravity: -1,
    drag: 1.8,
    size: [0.7, 1.1],
    flutter: 0.4,
    grow: 2.2,
    spin: 2,
    fade: true,
  },
  coins: {
    geo: coinGeometry(),
    colors: ['#ffd34d', '#ffbf2e', '#ffe58a'],
    life: [1.6, 2.2],
    speed: [1, 2.4],
    up: [3.5, 5.5],
    gravity: 11,
    drag: 0.6,
    size: [0.9, 1.2],
    flutter: 0,
    spin: 12,
    fade: false,
  },
};

class Burst {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly rot: Float32Array;
  private readonly spinV: Float32Array;
  private readonly lifeOf: Float32Array;
  private readonly size: Float32Array;
  private readonly phase: Float32Array;
  age = 0;
  readonly maxLife: number;
  private static readonly dummy = new THREE.Object3D();

  constructor(
    private readonly spec: KindSpec,
    x: number,
    y: number,
    z: number,
    count: number,
    spread: number,
  ) {
    this.n = count;
    this.material = spec.additive
      ? new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      : spec.unlit
        ? new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: spec.fade, depthWrite: !spec.fade })
        : new THREE.MeshStandardMaterial({
            roughness: 0.7,
            flatShading: true,
            side: THREE.DoubleSide,
            transparent: spec.fade,
            depthWrite: !spec.fade,
          });
    this.mesh = new THREE.InstancedMesh(spec.geo, this.material, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.rot = new Float32Array(count * 3);
    this.spinV = new Float32Array(count * 3);
    this.lifeOf = new Float32Array(count);
    this.size = new Float32Array(count);
    this.phase = new Float32Array(count);
    const color = new THREE.Color();
    let maxLife = 0;
    const rnd = (a: [number, number]) => a[0] + Math.random() * (a[1] - a[0]);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.pos[i * 3] = x + Math.cos(a) * r;
      this.pos[i * 3 + 1] = y + Math.random() * spread * 0.5;
      this.pos[i * 3 + 2] = z + Math.sin(a) * r;
      const sp = rnd(spec.speed);
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = rnd(spec.up);
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      for (let k = 0; k < 3; k++) {
        this.rot[i * 3 + k] = Math.random() * Math.PI * 2;
        this.spinV[i * 3 + k] = (Math.random() - 0.5) * 2 * spec.spin;
      }
      this.lifeOf[i] = rnd(spec.life);
      maxLife = Math.max(maxLife, this.lifeOf[i]!);
      this.size[i] = rnd(spec.size);
      this.phase[i] = Math.random() * 10;
      color.set(spec.colors[i % spec.colors.length]!);
      this.mesh.setColorAt(i, color);
    }
    this.maxLife = maxLife;
    this.update(0, null);
  }

  update(dt: number, camQuat: THREE.Quaternion | null): boolean {
    this.age += dt;
    const s = this.spec;
    const d = Burst.dummy;
    const dragK = Math.exp(-s.drag * dt);
    for (let i = 0; i < this.n; i++) {
      const life = this.lifeOf[i]!;
      const t = this.age / life;
      const i3 = i * 3;
      if (t >= 1) {
        d.position.set(0, -999, 0);
        d.scale.setScalar(0.0001);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      this.vel[i3]! *= dragK;
      this.vel[i3 + 2]! *= dragK;
      this.vel[i3 + 1] = this.vel[i3 + 1]! * (s.gravity > 0 ? 1 : dragK) - s.gravity * dt;
      const flutter = s.flutter ? Math.sin(this.age * 3 + this.phase[i]!) * s.flutter * dt : 0;
      this.pos[i3] = this.pos[i3]! + this.vel[i3]! * dt + flutter;
      this.pos[i3 + 1] = Math.max(0.03, this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt);
      this.pos[i3 + 2] = this.pos[i3 + 2]! + this.vel[i3 + 2]! * dt + flutter * 0.6;
      const onGround = this.pos[i3 + 1]! <= 0.031;
      for (let k = 0; k < 3; k++) {
        if (!onGround) this.rot[i3 + k] = this.rot[i3 + k]! + this.spinV[i3 + k]! * dt;
      }
      d.position.set(this.pos[i3]!, this.pos[i3 + 1]!, this.pos[i3 + 2]!);
      if (s.billboard && camQuat) {
        d.quaternion.copy(camQuat);
        d.rotateZ(s.billboard === 'spin' ? this.rot[i3 + 2]! : Math.sin(this.rot[i3 + 2]!) * 0.45);
      } else {
        d.rotation.set(this.rot[i3]!, this.rot[i3 + 1]!, this.rot[i3 + 2]!);
      }
      let sc = this.size[i]!;
      if (s.grow) sc *= 1 + s.grow * t;
      if (s.fade) sc *= t < 0.15 ? t / 0.15 : 1;
      else if (t > 0.85) sc *= (1 - t) / 0.15;
      d.scale.setScalar(Math.max(0.0001, sc));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (s.fade) this.material.opacity = Math.max(0, 1 - this.age / this.maxLife) * (s.additive || s.unlit ? 1 : 0.85);
    this.mesh.instanceMatrix.needsUpdate = true;
    return this.age < this.maxLife;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.material.dispose();
  }
}

// ───────────── Vòng sóng loang và cột sáng ─────────────

const RING_GEO = new THREE.RingGeometry(0.86, 1, 56);

interface Pulse {
  root: THREE.Object3D;
  mats: THREE.MeshBasicMaterial[];
  age: number;
  life: number;
  tick(k: number, dt: number): void;
}

/** Vân sáng dọc cho cột sáng: sáng ở chân, mờ dần lên đỉnh, có vài sọc chạy dọc. */
let pillarTex: THREE.CanvasTexture | null = null;
function pillarTexture(): THREE.CanvasTexture {
  if (pillarTex) return pillarTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < 64; x += 8) {
    g.fillStyle = `rgba(0,0,0,${0.25 + ((x * 37) % 50) / 100})`;
    g.fillRect(x + 3, 0, 3, 128);
  }
  pillarTex = new THREE.CanvasTexture(c);
  pillarTex.colorSpace = THREE.SRGBColorSpace;
  return pillarTex;
}

// ───────────── Bụi bước chân: một bể hạt vòng tròn dùng chung ─────────────

class PuffPool {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private live = 0;
  private static readonly dummy = new THREE.Object3D();
  private static readonly color = new THREE.Color();

  constructor(private readonly n: number) {
    const material = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true, opacity: 0.6, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), material, n);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(99);
    this.life = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    const d = PuffPool.dummy;
    d.scale.setScalar(0.0001);
    d.updateMatrix();
    for (let i = 0; i < n; i++) {
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, PuffPool.color.set('#ffffff'));
    }
  }

  spawn(x: number, z: number, color: string, count: number, y: number): void {
    const c = PuffPool.color.set(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2;
      const sp = 0.35 + Math.random() * 0.5;
      this.pos[i * 3] = x + Math.cos(a) * 0.12;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.12;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = 0.25 + Math.random() * 0.45;
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.age[i] = 0;
      this.life[i] = 0.45 + Math.random() * 0.35;
      this.size[i] = 0.6 + Math.random() * 0.6;
      this.mesh.setColorAt(i, c);
    }
    this.live = this.n;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    const d = PuffPool.dummy;
    const drag = Math.exp(-3 * dt);
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i]! >= this.life[i]!) continue;
      this.age[i] = this.age[i]! + dt;
      const k = this.age[i]! / this.life[i]!;
      const i3 = i * 3;
      this.vel[i3]! *= drag;
      this.vel[i3 + 1]! *= drag;
      this.vel[i3 + 2]! *= drag;
      this.pos[i3] = this.pos[i3]! + this.vel[i3]! * dt;
      this.pos[i3 + 1] = this.pos[i3 + 1]! + this.vel[i3 + 1]! * dt;
      this.pos[i3 + 2] = this.pos[i3 + 2]! + this.vel[i3 + 2]! * dt;
      d.position.set(this.pos[i3]!, this.pos[i3 + 1]!, this.pos[i3 + 2]!);
      d.rotation.set(k * 2, k * 3, 0);
      d.scale.setScalar(k >= 1 ? 0.0001 : this.size[i]! * (0.6 + k * 1.4) * (k > 0.6 ? (1 - k) / 0.4 : 1));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      if (k < 1) alive++;
    }
    this.live = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.age.fill(99);
    const d = PuffPool.dummy;
    d.scale.setScalar(0.0001);
    d.updateMatrix();
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = 0;
  }
}

// ───────────── Bụi sáng lơ lửng quanh camera (phấn hoa trong nắng / bụi neon) ─────────────

export type MotesTheme = 'temple' | 'bar' | 'halo';

// Chùa ban ngày không có bụi: ở góc nhìn thứ nhất các đốm sáng trôi ngay trước mắt, đè lên đồ vật
// thành lớp "nhiễu trắng". Chỉ giữ ít hạt vàng ấm khi có Hào quang và bụi neon thưa ở Bar.
const MOTE_THEMES: Record<MotesTheme, { colors: string[]; count: number; size: number }> = {
  temple: { colors: ['#ffe9a8'], count: 0, size: 0.6 },
  bar: { colors: ['#ff4fd8', '#3ef2ff', '#9b5cff', '#ffe14f'], count: 34, size: 0.8 },
  halo: { colors: ['#ffd166', '#ffc861', '#ffb347'], count: 30, size: 0.9 },
};
/** Hạt nằm gần camera hơn khoảng này (m) thì thu nhỏ dần về 0, không trôi sát mắt. */
const MOTE_CLEAR_RADIUS = 3;
/** Số vòng/cột sáng tối đa cùng lúc. */
const MAX_PULSES = 24;

class Motes {
  readonly mesh: THREE.InstancedMesh;
  private readonly N = 96;
  /** Nửa cạnh hộp quanh camera (m). */
  private readonly H = 10;
  private readonly pos: Float32Array;
  private readonly ph: Float32Array;
  private readonly sp: Float32Array;
  private sizeK = 1;
  private static readonly dummy = new THREE.Object3D();

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.03, 0), mat, this.N);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    this.pos = new Float32Array(this.N * 3);
    this.ph = new Float32Array(this.N);
    this.sp = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * this.H;
      this.pos[i * 3 + 1] = 0.3 + Math.random() * 4.5;
      this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * this.H;
      this.ph[i] = Math.random() * 100;
      this.sp[i] = 0.5 + Math.random();
    }
  }

  setTheme(theme: MotesTheme | null): void {
    if (!theme) {
      this.mesh.count = 0;
      return;
    }
    const t = MOTE_THEMES[theme];
    const c = new THREE.Color();
    for (let i = 0; i < this.N; i++) this.mesh.setColorAt(i, c.set(t.colors[i % t.colors.length]!));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = t.count;
    this.sizeK = t.size;
  }

  update(dt: number, time: number, cam: THREE.Vector3): void {
    const n = this.mesh.count;
    if (n === 0) return;
    const d = Motes.dummy;
    const H = this.H;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3;
      const ph = this.ph[i]!;
      const sp = this.sp[i]!;
      // Trôi chậm theo gió + lượn nhẹ; ra khỏi hộp quanh camera thì quấn sang phía đối diện.
      let x = this.pos[i3]! + (0.18 + Math.sin(time * 0.3 + ph) * 0.12) * sp * dt;
      let y = this.pos[i3 + 1]! + Math.sin(time * 0.7 * sp + ph) * 0.12 * dt;
      let z = this.pos[i3 + 2]! + Math.cos(time * 0.25 + ph * 1.3) * 0.15 * sp * dt;
      if (x - cam.x > H) x -= 2 * H;
      else if (x - cam.x < -H) x += 2 * H;
      if (z - cam.z > H) z -= 2 * H;
      else if (z - cam.z < -H) z += 2 * H;
      if (y > 5) y = 0.4;
      else if (y < 0.25) y = 4.8;
      this.pos[i3] = x;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z;
      d.position.set(x + Math.sin(time * 1.3 + ph) * 0.15, y, z + Math.cos(time * 1.1 + ph) * 0.15);
      // Hạt sát ống kính thu nhỏ dần về 0, không thành đốm sáng trôi trước mắt.
      const near = d.position.distanceToSquared(cam);
      const fade = Math.min(1, Math.max(0, near / (MOTE_CLEAR_RADIUS * MOTE_CLEAR_RADIUS) - 0.35) / 0.65);
      d.scale.setScalar((this.sizeK * (0.55 + 0.45 * Math.sin(time * 2.2 * sp + ph)) + 0.15) * fade);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Fx {
  private readonly floats: FloatEntry[] = [];
  private readonly bursts: Burst[] = [];
  private readonly pulses: Pulse[] = [];
  private readonly puffs = new PuffPool(192);
  private readonly motes = new Motes();
  private rain: { kind: BurstKind; until: number; acc: number; rate: number; center: () => { x: number; z: number } } | null =
    null;
  private time = 0;
  /**
   * Tường che chữ bay của map hiện tại (Game đặt mỗi lần dựng map; xem WorldHandles.labelOccluded): chữ bay là HTML vẽ
   * đè canvas, bị tường che (vd "+N Công Đức" của người trong Sòng khi đứng ở Bar) thì ẩn. null = luôn hiện.
   */
  occluder: ((ax: number, az: number, bx: number, bz: number) => boolean) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    scene.add(this.puffs.mesh, this.motes.mesh);
  }

  floatText(x: number, z: number, text: string, color = '#ffd166', y = 2.2): void {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.style.color = color;
    const inner = document.createElement('span');
    inner.textContent = text;
    inner.style.display = 'inline-block';
    el.append(inner);
    const obj = new CSS2DObject(el);
    obj.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    // Chữ tạo sau Fx.update (mini-game) vẫn được vẽ một khung trước lần update kế — xét tường che ngay từ đầu.
    const cam = this.camera.position;
    obj.visible = !this.occluder || !this.occluder(cam.x, cam.z, obj.position.x, obj.position.z);
    this.scene.add(obj);
    this.floats.push({ obj, el, inner, age: 0, life: 1.7, y0: obj.position.y });
    if (this.floats.length > 40) this.removeFloat(0);
  }

  burst(x: number, z: number, kind: BurstKind, count = 24, y = 1.2, spread = 0.35): void {
    if (this.bursts.length > 60) this.bursts.shift()?.dispose();
    const b = new Burst(SPECS[kind], x, y, z, Math.max(1, Math.min(400, count)), spread);
    this.scene.add(b.mesh);
    this.bursts.push(b);
  }

  /** Vòng sáng loang trên mặt đất (chuông vang, thăng cấp, niệm Phật…). */
  ring(x: number, z: number, color = '#ffd166', radius = 3, life = 0.9, y = 0.06): void {
    if (!this.roomForPulse()) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(RING_GEO, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.pulses.push({
      root: mesh,
      mats: [mat],
      age: 0,
      life,
      tick(k) {
        const e = 1 - Math.pow(1 - k, 3);
        mesh.scale.setScalar(0.25 + (radius - 0.25) * e);
        mat.opacity = Math.pow(1 - k, 1.4) * 0.95;
      },
    });
  }

  /** Cột sáng từ đất vút lên trời (thăng cấp). */
  pillar(x: number, z: number, color = '#ffd166', seconds = 2.4): void {
    if (!this.roomForPulse()) return;
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    const tex = pillarTexture();
    // Pha màu thường (không cộng sáng): giữa trời nắng, cộng sáng + bloom sẽ trắng xóa thay vì ra ánh vàng.
    const mk = (rTop: number, rBottom: number, h: number, c: string) => {
      const mat = new THREE.MeshBasicMaterial({
        color: c,
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 28, 1, true).translate(0, h / 2, 0), mat);
      root.add(m);
      return { m, mat };
    };
    const outer = mk(1.1, 0.8, 11, color);
    const inner = mk(0.3, 0.24, 13, '#fff1c9');
    this.scene.add(root);
    this.pulses.push({
      root,
      mats: [outer.mat, inner.mat],
      age: 0,
      life: seconds,
      tick(k, dt) {
        const fadeIn = Math.min(1, k / 0.08);
        const fadeOut = k > 0.55 ? Math.max(0, 1 - (k - 0.55) / 0.45) : 1;
        const a = fadeIn * fadeOut;
        outer.mat.opacity = 0.42 * a;
        inner.mat.opacity = 0.55 * a;
        outer.m.rotation.y += dt * 1.6;
        inner.m.rotation.y -= dt * 2.4;
        const w = 0.6 + 0.4 * Math.min(1, k / 0.12) + Math.sin(k * 40) * 0.03;
        outer.m.scale.set(w, 0.35 + 0.65 * Math.min(1, k / 0.15), w);
        inner.m.scale.set(w * (1 - k * 0.5), 0.3 + 0.7 * Math.min(1, k / 0.1), w * (1 - k * 0.5));
      },
    });
  }

  /**
   * Còn chỗ cho vòng/cột sáng mới không. Tab đang ẩn thì khung hình dừng → bỏ qua (khỏi dồn lại rồi bung một lúc);
   * quá nhiều thì bỏ cái cũ nhất.
   */
  private roomForPulse(): boolean {
    if (typeof document !== 'undefined' && document.hidden) return false;
    while (this.pulses.length >= MAX_PULSES) {
      const old = this.pulses.shift();
      if (old) this.disposePulse(old);
    }
    return true;
  }

  /** Bụi tung lên dưới chân (bước chạy, tiếp đất). */
  dust(x: number, z: number, color = '#e3d5b8', count = 3, y = 0.06): void {
    this.puffs.spawn(x, z, color, count, y);
  }

  setMotes(theme: MotesTheme | null): void {
    this.motes.setTheme(theme);
  }

  /** Mưa hạt quanh một tâm (vd cánh sen quanh người chơi) trong `seconds` giây. */
  startRain(kind: BurstKind, seconds: number, center: () => { x: number; z: number }, rate = 40): void {
    this.rain = { kind, until: performance.now() + seconds * 1000, acc: 0, rate, center };
  }

  update(dt: number): void {
    this.time += dt;
    const occ = this.occluder;
    const cam = this.camera.position;
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.age += dt;
      const t = f.age / f.life;
      // Ẩn bằng obj.visible (CSS2DRenderer tự đặt style.display mỗi khung); camera ra chỗ nhìn thấy thì hiện lại.
      f.obj.visible = !occ || !occ(cam.x, cam.z, f.obj.position.x, f.obj.position.z);
      f.obj.position.y = f.y0 + (1 - Math.pow(1 - Math.min(1, t), 2)) * 1.3;
      f.el.style.opacity = String(t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3));
      f.inner.style.transform = `scale(${t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : 1.15 - Math.min(0.15, (t - 0.12) * 0.5)})`;
      if (t >= 1) this.removeFloat(i);
    }
    const camQuat = this.camera.quaternion;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      if (!b.update(dt, camQuat)) {
        b.dispose();
        this.bursts.splice(i, 1);
      }
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]!;
      p.age += dt;
      const k = Math.min(1, p.age / p.life);
      p.tick(k, dt);
      if (k >= 1) {
        this.disposePulse(p);
        this.pulses.splice(i, 1);
      }
    }
    this.puffs.update(dt);
    this.motes.update(dt, this.time, this.camera.position);
    if (this.rain) {
      if (performance.now() > this.rain.until) {
        this.rain = null;
      } else {
        this.rain.acc += dt * this.rain.rate;
        const c = this.rain.center();
        while (this.rain.acc >= 6) {
          this.rain.acc -= 6;
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 9;
          this.burst(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, this.rain.kind, 6, 6 + Math.random() * 3, 1.2);
        }
      }
    }
  }

  private removeFloat(i: number): void {
    const f = this.floats[i]!;
    f.obj.removeFromParent();
    f.el.remove();
    this.floats.splice(i, 1);
  }

  private disposePulse(p: Pulse): void {
    p.root.removeFromParent();
    p.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry !== RING_GEO) m.geometry.dispose();
    });
    for (const m of p.mats) m.dispose();
  }

  clear(): void {
    while (this.floats.length) this.removeFloat(this.floats.length - 1);
    for (const b of this.bursts) b.dispose();
    this.bursts.length = 0;
    for (const p of this.pulses) this.disposePulse(p);
    this.pulses.length = 0;
    this.puffs.clear();
    this.rain = null;
  }
}
