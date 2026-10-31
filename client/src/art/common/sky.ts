// Bầu trời: vòm gradient có mặt trời + quầng sáng, mây low-poly trôi chậm, dãy núi xa nhiều lớp (sương mù tự phủ màu).
import * as THREE from 'three';
import { kit } from '../kit';
import { applySurface } from '../pbr';

export interface SkyOptions {
  top: string;
  horizon: string;
  bottom: string;
  sunColor: string;
  /** Hướng tới mặt trời (đã chuẩn hóa). */
  sunDir: THREE.Vector3;
  radius?: number;
}

export interface SkyHandle {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

export function createSky(o: SkyOptions): SkyHandle {
  const group = new THREE.Group();
  group.name = 'sky';
  const R = o.radius ?? 460;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(o.top) },
      uHorizon: { value: new THREE.Color(o.horizon) },
      uBottom: { value: new THREE.Color(o.bottom) },
      uSun: { value: new THREE.Color(o.sunColor) },
      uSunDir: { value: o.sunDir.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSun; uniform vec3 uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.6)) : mix(uHorizon, uBottom, pow(clamp(-h * 3.0, 0.0, 1.0), 0.5));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 3.0 + pow(s, 48.0) * 0.45 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 18), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // Mây: cụm khối đa diện trắng, hơi tự sáng để nổi trên nền trời.
  const cloudMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#ffffff',
    emissiveIntensity: 0.35,
    roughness: 1,
    flatShading: true,
    fog: false,
  });
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    const n = 4 + (i % 4);
    for (let k = 0; k < n; k++) {
      const r = 7 + ((i * 7 + k * 13) % 9);
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudMat);
      blob.position.set((k - n / 2) * r * 0.9, ((k * 5) % 4) * 1.8, ((k * 3) % 3) * 4 - 4);
      blob.scale.set(1.25, 0.62, 0.9);
      c.add(blob);
    }
    const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.3;
    const dist = 170 + (i % 5) * 32;
    c.position.set(Math.cos(a) * dist, 78 + (i % 4) * 14, Math.sin(a) * dist);
    c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  group.add(clouds);
  return {
    group,
    update(dt) {
      clouds.rotation.y += dt * 0.004;
    },
  };
}

/** Vòng núi bao quanh (nhiều lớp xa dần), dựng bằng chóp đa diện rồi gộp lại cho nhẹ. */
export function createMountains(seed: number, layers: { dist: [number, number]; height: [number, number]; colors: string[]; count: number }[]): THREE.Group {
  const root = new THREE.Group();
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  // Núi tả thực: chóp nhiều đỉnh, sườn gồ ghề theo nhiễu fBm (khe, sống núi), màu theo độ cao (rừng → đá → tuyết),
  // texture đá ba mặt; xa dần thì sương mù phủ xanh lam tự nhiên.
  const material = applySurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }), 'stone');
  const forest = new THREE.Color();
  const rock = new THREE.Color('#77736a');
  const snow = new THREE.Color('#eef2f6');
  const c = new THREE.Color();
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      const a = (i / layer.count) * Math.PI * 2 + rnd() * 0.2;
      const d = layer.dist[0] + rnd() * (layer.dist[1] - layer.dist[0]);
      const h = layer.height[0] + rnd() * (layer.height[1] - layer.height[0]);
      const r = h * (1.1 + rnd() * 0.7);
      forest.set(layer.colors[Math.floor(rnd() * layer.colors.length)]!);
      // Đủ mịn để đường sống núi trên nền trời không lộ cạnh gãy (lớp xa nhỏ trên màn hình thì thưa hơn).
      const g = new THREE.ConeGeometry(r, h, d > 280 ? 40 : 60, d > 280 ? 14 : 22);
      const ry = rnd() * Math.PI;
      const ox = Math.cos(a) * d;
      const oz = Math.sin(a) * d;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        const y = pos.getY(k);
        const z = pos.getZ(k);
        const t = (y + h / 2) / h;
        const rl = Math.hypot(x, z);
        // Nhiễu theo toạ độ thế giới (mối nối hình nón trùng điểm → trùng nhiễu, không hở).
        const wx = (ox + x) / 38;
        const wz = (oz + z) / 38;
        const n = fbm(wx, t * 3.1 + i * 0.37, wz);
        const ridge = 1 - Math.abs(fbm(wx * 2.3, t * 5, wz * 2.3) * 2 - 1);
        const push = (n - 0.5) * 0.55 + ridge * 0.18;
        if (rl > 1e-4) {
          const s = 1 + push * (1 - t * 0.55);
          pos.setX(k, x * s);
          pos.setZ(k, z * s);
        }
        pos.setY(k, y + (n - 0.5) * h * 0.14 * (1 - Math.abs(t - 0.5) * 1.2));
        const steep = Math.min(1, Math.max(0, (t - 0.35) / 0.4 + (ridge - 0.5) * 0.4));
        c.copy(forest).lerp(rock, steep * 0.75);
        if (h > 62 && t > 0.72 + (n - 0.5) * 0.25) c.lerp(snow, Math.min(1, (t - 0.68) / 0.12));
        c.multiplyScalar(0.9 + n * 0.2);
        col[k * 3] = c.r;
        col[k * 3 + 1] = c.g;
        col[k * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      root.add(
        kit.mesh(g, material, {
          x: ox,
          y: h / 2 - 2,
          z: oz,
          ry,
          castShadow: false,
          receiveShadow: false,
        }),
      );
    }
  }
  return kit.mergeStatic(root, 'mountains');
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Nhiễu giá trị 3D trơn (0..1). */
function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u);
  const c10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u);
  const c01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u);
  const c11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(c00, c10, v), lerp(c01, c11, v), w);
}

/** Nhiễu nhiều tầng (fBm), 4 tầng, 0..1. */
function fbm(x: number, y: number, z: number): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    sum += noise3(x * f, y * f, z * f) * amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / 0.9375;
}
