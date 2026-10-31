// "Sự sống" của Chùa: khói hương bay, mặt ao gợn sóng + sen + cá koi, chim bay đàn, bướm, lá bồ đề rơi.
import * as THREE from 'three';
import type { MapDef } from '@shared/index';
import { kit } from '../kit';
import type { TempleCtx } from './ctx';
import { POND_BANK } from './ground';

const { geo, mat, mesh } = kit;

/** Cụm khói mềm: vài đốm mờ chồng nhau (không tròn đều), mép tan hẳn về trong suốt. */
function smokeTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(128, 128, (c, w, h) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i === 0 ? 0 : 16 + (i % 3) * 6;
      const cx = w / 2 + Math.cos(a) * r;
      const cy = h / 2 + Math.sin(a) * r;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, 34);
      g.addColorStop(0, 'rgba(255,255,255,0.34)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  });
}

/**
 * Hệ khói dùng chung: làn khói mềm luôn quay mặt về camera (một draw call, chịu sương mù), lớn dần, xoay chậm,
 * tan dần — thay cho khối đa giác trắng (nhìn như nhiễu khi bay trước mặt).
 */
export function smokeSystem(ctx: TempleCtx): void {
  const N = 260;
  const geom = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1) as unknown as THREE.InstancedBufferGeometry);
  geom.instanceCount = N;
  const puff = new Float32Array(N * 4);
  const fade = new Float32Array(N * 2);
  const aPuff = new THREE.InstancedBufferAttribute(puff, 4).setUsage(THREE.DynamicDrawUsage);
  const aFade = new THREE.InstancedBufferAttribute(fade, 2).setUsage(THREE.DynamicDrawUsage);
  geom.setAttribute('aPuff', aPuff);
  geom.setAttribute('aFade', aFade);
  const material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: smokeTexture() }, uColor: { value: new THREE.Color('#d8d2c8') }, ...THREE.UniformsLib.fog },
    vertexShader: /* glsl */ `
      attribute vec4 aPuff;
      attribute vec2 aFade;
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(aPuff.xyz, 1.0);
        float c = cos(aFade.y);
        float s = sin(aFade.y);
        mvPosition.xy += mat2(c, s, -s, c) * position.xy * aPuff.w;
        gl_Position = projectionMatrix * mvPosition;
        vUv = uv;
        vAlpha = aFade.x;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        float a = texture2D(uMap, vUv).a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const smoke = new THREE.Mesh(geom, material);
  smoke.frustumCulled = false;
  smoke.castShadow = false;
  smoke.receiveShadow = false;
  smoke.renderOrder = 3;
  const pos = new Float32Array(N * 3);
  const age = new Float32Array(N).fill(99);
  const life = new Float32Array(N).fill(1);
  const size = new Float32Array(N);
  const drift = new Float32Array(N);
  const spin = new Float32Array(N);
  const strength = new Float32Array(N);
  let next = 0;
  ctx.smoke = (x, y, z, amount) => {
    const n = Math.max(1, Math.round(amount * 2));
    for (let k = 0; k < n; k++) {
      const i = next;
      next = (next + 1) % N;
      pos[i * 3] = x + (Math.random() - 0.5) * 0.06;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.06;
      age[i] = 0;
      life[i] = 2.6 + Math.random() * 1.8;
      size[i] = (0.22 + Math.random() * 0.16) * (0.7 + Math.min(1.5, amount));
      drift[i] = Math.random() * 10;
      spin[i] = (Math.random() - 0.5) * 0.8;
      strength[i] = Math.min(1, 0.55 + amount * 0.45);
    }
  };
  ctx.updates.push((dt, t) => {
    for (let i = 0; i < N; i++) {
      if (age[i]! >= life[i]!) {
        puff[i * 4 + 3] = 0;
        fade[i * 2] = 0;
        continue;
      }
      age[i]! += dt;
      const k = Math.min(1, age[i]! / life[i]!);
      pos[i * 3 + 1]! += dt * (0.42 + k * 0.22);
      pos[i * 3]! += Math.sin(t * 0.9 + drift[i]!) * dt * 0.16 * (0.3 + k) + dt * 0.06;
      pos[i * 3 + 2]! += Math.cos(t * 0.7 + drift[i]!) * dt * 0.12 * (0.3 + k);
      puff[i * 4] = pos[i * 3]!;
      puff[i * 4 + 1] = pos[i * 3 + 1]!;
      puff[i * 4 + 2] = pos[i * 3 + 2]!;
      puff[i * 4 + 3] = size[i]! * (0.3 + k * 1.9);
      // Hiện dần lúc mới bốc lên, tan dần về cuối đời.
      fade[i * 2] = Math.min(1, k / 0.12) * Math.pow(1 - k, 1.4) * 0.5 * strength[i]!;
      fade[i * 2 + 1] = drift[i]! + t * spin[i]!;
    }
    aPuff.needsUpdate = true;
    aFade.needsUpdate = true;
  });
  ctx.dynamics.add(smoke);
}

/** Mặt ao gợn sóng (đỉnh dao động trên GPU), lá sen, hoa sen, cá koi bơi. */
export function pondLife(ctx: TempleCtx, map: MapDef): void {
  const c = map.colliders.find((x) => x.tag === 'pond');
  if (!c || c.kind !== 'circle') return;
  // Mặt nước thấp hơn mặt đất, sóng nhỏ hơn khoảng hở tới lá sen → không mặt nào cắt nhau nhấp nháy.
  const WATER_Y = -0.16;
  const time = { value: 0 };
  // Nước thật: vật liệu vật lý (IOR 1,33) phản chiếu bầu trời qua IBL; hai lớp gợn (normal map dựng sẵn) cuộn ngược
  // chiều nhau; độ trong theo góc nhìn (Fresnel): nhìn thẳng xuống thấy cá, nhìn xiên thấy trời phản chiếu.
  const water = new THREE.MeshPhysicalMaterial({
    color: '#1d4a44',
    transparent: true,
    roughness: 0.035,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 1,
    envMapIntensity: 1.15,
  });
  const ripples = rippleNormalTexture();
  water.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uRipple = { value: ripples };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWaterPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.z += sin(position.x * 1.7 + uTime * 1.3) * 0.006 + cos(position.y * 2.1 + uTime * 1.1) * 0.005;
        vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D uRipple;\nvarying vec3 vWaterPos;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 uvA = vWaterPos.xz * 0.32 + vec2(uTime * 0.031, uTime * 0.017);
          vec2 uvB = vWaterPos.xz * 0.71 + vec2(-uTime * 0.022, uTime * 0.027);
          vec2 slope = (texture2D(uRipple, uvA).xy * 2.0 - 1.0) * 0.55 + (texture2D(uRipple, uvB).xy * 2.0 - 1.0) * 0.35;
          vec3 wn = normalize(vec3(-slope.x, 1.0, -slope.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float waterFres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        diffuseColor.a = mix(0.6, 0.97, waterFres);
        #include <opaque_fragment>`,
      );
  };
  water.customProgramCacheKey = () => 'pond-water';
  const disc = new THREE.Mesh(subdivideDisc(c.r + POND_BANK - 0.01, 14, 48), water);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(c.x, WATER_Y, c.z);
  disc.receiveShadow = true;
  ctx.dynamics.add(disc);

  const group = new THREE.Group();
  group.position.set(c.x, 0, c.z);
  ctx.dynamics.add(group);
  const padMat = mat('#4f9a3f');
  const padMat2 = mat('#6fbf4a');
  const pads: { m: THREE.Mesh; ph: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996;
    const r = 1.2 + ((i * 37) % 10) * 0.38;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.42 + (i % 3) * 0.1, 12, 0.4, Math.PI * 2 - 0.5), i % 2 ? padMat : padMat2);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = a;
    pad.position.set(Math.cos(a) * r, WATER_Y + 0.03, Math.sin(a) * r);
    pad.receiveShadow = true;
    group.add(pad);
    pads.push({ m: pad, ph: a });
    if (i % 3 === 0) {
      const flower = new THREE.Group();
      flower.position.set(pad.position.x, pad.position.y, pad.position.z);
      for (let k = 0; k < 8; k++) {
        const pa = (k / 8) * Math.PI * 2;
        const petal = mesh(geo.sphere(0.11, 6, 4), mat(k % 2 ? '#f7a8c0' : '#ffd0de'), { x: Math.cos(pa) * 0.1, y: 0.1, z: Math.sin(pa) * 0.1, scale: [0.5, 1.1, 0.3] });
        petal.lookAt(flower.position.x + Math.cos(pa) * 2, 2, flower.position.z + Math.sin(pa) * 2);
        flower.add(petal);
      }
      flower.add(mesh(geo.sphere(0.06, 6, 4), mat('#ffd166'), { y: 0.14 }));
      group.add(flower);
      pads.push({ m: flower as unknown as THREE.Mesh, ph: a + 1 });
    }
  }
  // Cá koi.
  const fish: { g: THREE.Group; r: number; speed: number; ph: number; depth: number }[] = [];
  const colors = ['#ff7a2a', '#ffffff', '#ff5a3a', '#ffb347', '#f2f2f2', '#ff8c5a', '#d9312a'];
  for (let i = 0; i < 8; i++) {
    const f = new THREE.Group();
    const col = colors[i % colors.length]!;
    f.add(mesh(geo.sphere(0.16, 8, 6), mat(col), { scale: [0.55, 0.45, 1.4], castShadow: false }));
    f.add(mesh(geo.sphere(0.06, 5, 4), mat(i % 2 ? '#ff7a2a' : '#ffffff'), { y: 0.05, z: 0.05, castShadow: false }));
    const tail = mesh(geo.cone(0.1, 0.22, 3), mat(col), { z: -0.28, rx: -Math.PI / 2, scale: [1, 1, 0.25], castShadow: false });
    f.add(tail);
    f.userData.tail = tail;
    group.add(f);
    fish.push({ g: f, r: 1.2 + (i % 4) * 0.95, speed: (0.22 + (i % 3) * 0.08) * (i % 2 ? 1 : -1), ph: i * 1.7, depth: WATER_Y - 0.2 - (i % 3) * 0.08 });
  }
  ctx.updates.push((_dt, t) => {
    time.value = t;
    for (const p of pads) p.m.position.y = WATER_Y + 0.03 + Math.sin(t * 1.2 + p.ph) * 0.005;
    for (const f of fish) {
      const a = f.ph + t * f.speed;
      const wob = Math.sin(t * 0.6 + f.ph) * 0.4;
      const x = Math.cos(a) * (f.r + wob);
      const z = Math.sin(a) * (f.r + wob);
      f.g.position.set(x, f.depth, z);
      const dir = f.speed > 0 ? 1 : -1;
      f.g.rotation.y = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      (f.g.userData.tail as THREE.Object3D).rotation.y = Math.sin(t * 8 + f.ph) * 0.5;
    }
  });
}

/**
 * Normal map gợn nước lặp liền (256²): độ cao = tổng sóng sin tần số nguyên theo nhiều hướng (nên lặp không lộ mối),
 * pháp tuyến lấy từ sai phân. Kênh RG = độ dốc (0,5 = phẳng).
 */
function rippleNormalTexture(): THREE.DataTexture {
  const N = 256;
  const waves: [number, number, number, number][] = [
    [3, 1, 0.5, 0],
    [-2, 4, 0.35, 1.3],
    [5, -3, 0.22, 2.1],
    [-7, -2, 0.15, 0.7],
    [9, 6, 0.09, 3.3],
    [-4, 11, 0.07, 4.1],
    [13, -9, 0.05, 5.2],
  ];
  const height = (x: number, y: number) => {
    let h = 0;
    for (const [kx, ky, a, ph] of waves) h += a * Math.sin(((kx * x + ky * y) / N) * Math.PI * 2 + ph);
    return h;
  };
  const data = new Uint8Array(N * N * 4);
  const s = 2.2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * s * 4;
      const dy = (height(x, y + 1) - height(x, y - 1)) * s * 4;
      const i = (y * N + x) * 4;
      data[i] = Math.round(Math.min(1, Math.max(0, 0.5 + dx)) * 255);
      data[i + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + dy)) * 255);
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/** Đĩa tròn chia ô đều (để mặt nước gợn có đủ đỉnh). */
function subdivideDisc(r: number, rings: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const rr = (i / rings) * r;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0);
    }
  }
  const ring = (i: number, j: number) => 1 + (i - 1) * segs + (j % segs);
  for (let j = 0; j < segs; j++) idx.push(0, ring(1, j), ring(1, j + 1));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ring(i, j);
      const b = ring(i, j + 1);
      const c2 = ring(i + 1, j);
      const d = ring(i + 1, j + 1);
      idx.push(a, c2, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Đàn chim bay vòng trên cao + bướm quanh vườn hoa + lá bồ đề rơi. */
export function skyLife(ctx: TempleCtx, map: MapDef): void {
  // Chim.
  const birdMat = mat('#3a3a44');
  for (let flock = 0; flock < 2; flock++) {
    const fg = new THREE.Group();
    const birds: { body: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; ph: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      b.add(mesh(geo.cone(0.12, 0.6, 4), birdMat, { rx: Math.PI / 2, castShadow: false }));
      const wl = new THREE.Group();
      wl.add(mesh(geo.box(0.7, 0.02, 0.22), birdMat, { x: 0.35, castShadow: false }));
      const wr = new THREE.Group();
      wr.add(mesh(geo.box(0.7, 0.02, 0.22), birdMat, { x: -0.35, castShadow: false }));
      b.add(wl, wr);
      const row = Math.floor((i + 1) / 2);
      const side = i % 2 ? 1 : -1;
      b.position.set(side * row * 1.2, ((i * 7) % 3) * 0.3, -row * 1.4);
      fg.add(b);
      birds.push({ body: b, wl, wr, ph: i * 0.7 });
    }
    ctx.dynamics.add(fg);
    const R = 34 + flock * 16;
    const H = 24 + flock * 9;
    const sp = 0.07 + flock * 0.025;
    ctx.updates.push((_dt, t) => {
      const a = t * sp * (flock ? -1 : 1) + flock * 2;
      fg.position.set(Math.cos(a) * R, H + Math.sin(t * 0.4 + flock) * 2, Math.sin(a) * R);
      fg.rotation.y = flock ? -a : -a + Math.PI;
      for (const b of birds) {
        const f = Math.sin(t * 9 + b.ph) * 0.6;
        b.wl.rotation.z = f;
        b.wr.rotation.z = -f;
      }
    });
  }

  // Bướm quanh luống hoa, thiền viên, vườn.
  const homes = map.stations.filter((s) => s.kind === 'flower_bed' || s.kind === 'meditation_cushion' || s.kind === 'fruit_tree').map((s) => ({ x: s.x, z: s.z }));
  const wingColors = ['#ffd23f', '#ff8fb1', '#8fd3ff', '#ffffff', '#ffb347', '#c39bff'];
  for (let i = 0; i < 12; i++) {
    const home = homes[i % homes.length]!;
    const b = new THREE.Group();
    const wm = new THREE.MeshStandardMaterial({ color: wingColors[i % wingColors.length], side: THREE.DoubleSide, roughness: 0.7, flatShading: true });
    const wl = new THREE.Mesh(new THREE.CircleGeometry(0.13, 6), wm);
    wl.position.x = 0.12;
    const wr = new THREE.Mesh(new THREE.CircleGeometry(0.13, 6), wm);
    wr.position.x = -0.12;
    const pl = new THREE.Group();
    pl.add(wl);
    const pr = new THREE.Group();
    pr.add(wr);
    b.add(pl, pr, mesh(geo.capsule(0.02, 0.12, 2, 4), mat('#2b2b33'), { rx: Math.PI / 2, castShadow: false }));
    ctx.dynamics.add(b);
    const ph = i * 1.37;
    ctx.updates.push((_dt, t) => {
      const x = home.x + Math.sin(t * 0.37 + ph) * 2.2 + Math.sin(t * 1.3 + ph) * 0.4;
      const z = home.z + Math.cos(t * 0.29 + ph * 1.3) * 2.2;
      const y = 0.9 + Math.sin(t * 1.7 + ph) * 0.4;
      b.rotation.y = Math.atan2(x - b.position.x, z - b.position.z);
      b.position.set(x, y, z);
      const f = Math.sin(t * 18 + ph) * 1.1;
      pl.rotation.z = f;
      pr.rotation.z = -f;
      pl.rotation.x = pr.rotation.x = -Math.PI / 2;
    });
  }

  // Lá bồ đề rơi quanh gốc cây.
  const bodhi = map.colliders.find((c) => c.tag === 'bodhi');
  if (bodhi) {
    const leafGeo = new THREE.ShapeGeometry(heartLeaf(), 3);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#8fc95a', side: THREE.DoubleSide, flatShading: true });
    const leaves: { m: THREE.Mesh; ph: number; speed: number; r: number; a: number }[] = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(leafGeo, i % 4 === 0 ? mat('#d9c25a', { doubleSide: true }) : leafMat);
      m.scale.setScalar(0.9);
      ctx.dynamics.add(m);
      leaves.push({ m, ph: i * 0.9, speed: 0.5 + (i % 5) * 0.12, r: 1 + (i % 6) * 0.8, a: i * 2.1 });
    }
    ctx.updates.push((_dt, t) => {
      for (const L of leaves) {
        const cycle = 9 / L.speed;
        const k = ((t + L.ph * 3) % cycle) / cycle;
        const y = 8.5 * (1 - k) + 0.05;
        const a = L.a + k * 2;
        L.m.position.set(bodhi.x + Math.cos(a) * (L.r + Math.sin(t + L.ph) * 0.6), Math.max(0.05, y), bodhi.z + Math.sin(a) * (L.r + 0.5));
        L.m.rotation.set(t * 1.3 + L.ph, t * 0.8, Math.sin(t * 2 + L.ph) * 0.8);
      }
    });
  }
}

function heartLeaf(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -0.12);
  s.bezierCurveTo(0.12, -0.02, 0.1, 0.12, 0, 0.08);
  s.bezierCurveTo(-0.1, 0.12, -0.12, -0.02, 0, -0.12);
  return s;
}
