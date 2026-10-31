// Tượng Phật ngồi thiền bằng đá xanh xám (theo ảnh mẫu), dùng chung cho mọi tượng: Chánh Điện, Điện Tăng Đoàn, Đại
// Pháp Đường. Lưới dựng từ SDF (buddhaSdf.ts) trong nhiều Web Worker song song để không giật khung hình; tượng gắn vào
// khi lưới xong. Tóc xoắn ốc là InstancedMesh các chỏm cầu; mặt trên phiến bệ là đĩa phẳng (khỏi tốn lưới).
// AO + vân đá nướng sẵn trong màu đỉnh; thêm vân hạt đá (texture ba mặt) ở bề mặt.
import * as THREE from 'three';
import { settings } from '../../settings';
import { applySurface } from '../pbr';
import { BUDDHA_PARTS, BUDDHA_SLAB, CURL_STRIDE, buildBuddhaCurls, buildBuddhaPart, type BuddhaMeshData } from './buddhaSdf';
import type { BuddhaJob, BuddhaJobResult } from './buddha.worker';

interface BuddhaGeometry {
  /** Lưới gần (đủ chi tiết) và lưới xa (thưa ~1/4 tam giác) — cùng thứ tự BUDDHA_PARTS. */
  near: THREE.BufferGeometry[];
  far: THREE.BufferGeometry[];
  slab: THREE.BufferGeometry;
  /** Chỏm tóc xoắn cho lưới gần / lưới xa (ít mặt hơn). */
  curl: THREE.BufferGeometry;
  curlFar: THREE.BufferGeometry;
  curls: Float32Array;
}

/** Lưới xa thưa hơn lưới gần chừng này mỗi chiều (~1/4 số tam giác). */
const FAR_COARSE = 2.1;
/** Xa hơn chừng này đơn vị tượng (~2,5 lần chiều cao tượng) thì dùng lưới xa — tượng càng to càng đổi mức ở xa. */
const FAR_UNITS = 9;

let built: BuddhaGeometry | null = null;
let pending: Promise<BuddhaGeometry> | null = null;

function toGeometry(d: BuddhaMeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.color, 3));
  g.setIndex(new THREE.BufferAttribute(d.index, 1));
  g.computeBoundingSphere();
  // Dùng chung giữa các lần dựng map — không huỷ khi rời map.
  g.userData.kitCached = true;
  return g;
}

/** Mặt trên phiến bệ: đĩa phẳng, tối dần vào giữa (khuất dưới thân tượng). */
function slabGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(BUDDHA_SLAB.r, 96).rotateX(-Math.PI / 2);
  g.translate(0, BUDDHA_SLAB.y, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i)) / BUDDHA_SLAB.r;
    const v = 0.55 + 0.4 * THREE.MathUtils.smoothstep(r, 0.55, 0.97);
    col.set([v, v, v * 0.97], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.kitCached = true;
  return g;
}

/** Một xoắn ốc tóc: chỏm cầu (gốc ở tâm, đỉnh +Y), chân chìm vào sọ; tối dần xuống chân (kẽ giữa các xoắn). */
function curlGeometry(segments: number, rings: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, rings, 0, Math.PI * 2, 0, Math.PI * 0.64);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = 0.42 + 0.58 * THREE.MathUtils.smoothstep(p.getY(i), -0.35, 0.75);
    col.set([v, v, v * 0.97], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.kitCached = true;
  return g;
}

/**
 * Vân xoắn ốc cho từng lọn tóc: normal map theo UV chỏm cầu (u quanh trục, v từ chân lên chóp) — một rãnh xoắn
 * ~2,4 vòng từ chân lên đỉnh, nhạt dần ở chóp (UV chụm lại).
 */
function spiralNormalMap(): THREE.DataTexture {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const height = (u: number, w: number) => (0.5 + 0.5 * Math.cos(Math.PI * 2 * (u + 2.4 * w))) * THREE.MathUtils.smoothstep(w, 0.04, 0.32);
  const e = 1 / N;
  for (let j = 0; j < N; j++) {
    const w = 1 - (j + 0.5) / N;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const du = (height(u + e, w) - height(u - e, w)) / (2 * e);
      const dv = -(height(u, w + e) - height(u, w - e)) / (2 * e);
      const nx = -du * 0.05;
      const ny = -dv * 0.05;
      const l = Math.hypot(nx, ny, 1);
      const o = (j * N + i) * 4;
      data[o] = Math.round((nx / l * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((ny / l * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function runJob(job: BuddhaJob): Promise<BuddhaJobResult> {
  return new Promise((resolve) => {
    const local = (): BuddhaJobResult => ({ part: job.part, mesh: buildBuddhaPart(job.part, job.detail), curls: job.curls ? buildBuddhaCurls() : undefined });
    try {
      const w = new Worker(new URL('./buddha.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<BuddhaJobResult>) => {
        resolve(e.data);
        w.terminate();
      };
      w.onerror = () => {
        w.terminate();
        resolve(local());
      };
      w.postMessage(job);
    } catch {
      resolve(local());
    }
  });
}

/** Chạy các việc dựng lưới, tối đa `limit` worker cùng lúc; kết quả theo đúng thứ tự `jobs`. */
async function runAll(jobs: BuddhaJob[], limit: number): Promise<BuddhaJobResult[]> {
  const out: BuddhaJobResult[] = new Array(jobs.length);
  let next = 0;
  const lane = async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await runJob(jobs[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, lane));
  return out;
}

/** Bắt đầu dựng lưới tượng (song song nhiều Web Worker, lưới gần trước rồi lưới xa). Gọi sớm cho có sẵn. */
export function prepareBuddha(): Promise<BuddhaGeometry> {
  if (built) return Promise.resolve(built);
  if (pending) return pending;
  // Chất lượng thấp: lưới thưa hơn (~1/2 số tam giác).
  const detail = settings.get().quality === 'high' ? 1 : 1.45;
  const near = BUDDHA_PARTS.map((part): BuddhaJob => ({ part, detail, curls: part === 'head' }));
  const far = BUDDHA_PARTS.map((part): BuddhaJob => ({ part, detail: detail * FAR_COARSE }));
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  pending = runAll([...near, ...far], Math.max(2, Math.min(BUDDHA_PARTS.length, cores - 1))).then((res) => {
    const n = BUDDHA_PARTS.length;
    built = {
      near: res.slice(0, n).map((r) => toGeometry(r.mesh)),
      far: res.slice(n).map((r) => toGeometry(r.mesh)),
      slab: slabGeometry(),
      curl: curlGeometry(11, 5),
      curlFar: curlGeometry(7, 3),
      curls: res.find((r) => r.curls)?.curls ?? new Float32Array(0),
    };
    return built;
  });
  return pending;
}

/** LOD đổi mức theo khoảng cách quy ra đơn vị tượng: tượng phóng to (Đại Pháp Đường) đổi sang lưới xa ở xa hơn. */
class StatueLOD extends THREE.LOD {
  private readonly ws = new THREE.Vector3();
  override update(camera: THREE.Camera): void {
    const k = this.getWorldScale(this.ws).x;
    for (const l of this.levels) l.distance = (l.object.userData.unitDistance as number) * k;
    super.update(camera);
  }
}

export interface BuddhaHandles {
  group: THREE.Group;
  /** Vật liệu đá của tượng (đổi emissiveIntensity để toả sáng khi bật Hào quang). */
  bodyMat: THREE.MeshStandardMaterial;
}

let stone: THREE.MeshStandardMaterial | null = null;
let curlStone: THREE.MeshStandardMaterial | null = null;

/** Đá của lọn tóc: cùng màu đá, thêm vân xoắn ốc (không dùng vân hạt ba mặt — sẽ đè mất normal map). */
function curlMaterial(): THREE.MeshStandardMaterial {
  if (curlStone) return curlStone;
  curlStone = new THREE.MeshStandardMaterial({
    color: '#a2a596',
    roughness: 0.62,
    metalness: 0,
    vertexColors: true,
    normalMap: spiralNormalMap(),
    emissive: '#d8a44a',
    emissiveIntensity: 0,
  });
  curlStone.userData.kitCached = true;
  return curlStone;
}

/** Đá xanh xám mịn, hơi bóng (đá mài) — một vật liệu cho mọi tượng; vân hạt đá ba mặt rất nhẹ. */
function stoneMaterial(): THREE.MeshStandardMaterial {
  if (stone) return stone;
  stone = applySurface(
    new THREE.MeshStandardMaterial({
      color: '#a2a596',
      roughness: 0.6,
      metalness: 0,
      vertexColors: true,
      emissive: '#d8a44a',
      emissiveIntensity: 0,
    }),
    'carved',
  );
  stone.userData.kitCached = true;
  return stone;
}

/** Một mức chi tiết: các phần lưới + đĩa mặt bệ + tóc xoắn ốc (instanced). */
function levelGroup(parts: THREE.BufferGeometry[], curl: THREE.BufferGeometry, geo: BuddhaGeometry, mat: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  for (const part of [...parts, geo.slab]) {
    const m = new THREE.Mesh(part, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    g.add(m);
  }
  const n = geo.curls.length / CURL_STRIDE;
  if (!n) return g;
  const cm = curlMaterial();
  const curls = new THREE.InstancedMesh(curl, cm, n);
  // Toả sáng (Hào quang) theo vật liệu thân tượng.
  curls.onBeforeRender = () => {
    cm.emissiveIntensity = mat.emissiveIntensity;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const c = new THREE.Color();
  const d = geo.curls;
  for (let i = 0; i < n; i++) {
    const o = i * CURL_STRIDE;
    q.setFromUnitVectors(up, new THREE.Vector3(d[o + 3]!, d[o + 4]!, d[o + 5]!));
    spin.setFromAxisAngle(up, i * 2.399);
    q.multiply(spin);
    const r = d[o + 6]!;
    m4.compose(new THREE.Vector3(d[o]!, d[o + 1]!, d[o + 2]!), q, new THREE.Vector3(r, r * 0.82, r));
    curls.setMatrixAt(i, m4);
    const ao = d[o + 7]!;
    curls.setColorAt(i, c.setRGB(ao, ao, ao));
  }
  curls.instanceMatrix.needsUpdate = true;
  if (curls.instanceColor) curls.instanceColor.needsUpdate = true;
  curls.computeBoundingSphere();
  curls.receiveShadow = true;
  g.add(curls);
  return g;
}

function attach(g: THREE.Group, geo: BuddhaGeometry, mat: THREE.MeshStandardMaterial): void {
  const lod = new StatueLOD();
  const near = levelGroup(geo.near, geo.curl, geo, mat);
  const far = levelGroup(geo.far, geo.curlFar, geo, mat);
  near.userData.unitDistance = 0;
  far.userData.unitDistance = FAR_UNITS;
  lod.addLevel(near, 0);
  lod.addLevel(far, FAR_UNITS, 0.08);
  g.add(lod);
}

/** Tượng Phật đá ngồi trên đài sen (gốc: tâm đáy bệ, mặt tượng nhìn +Z; cao 3,62 đơn vị). */
export function realisticBuddha(): BuddhaHandles {
  const g = new THREE.Group();
  g.name = 'buddha';
  const mat = stoneMaterial();
  if (built) attach(g, built, mat);
  else void prepareBuddha().then((geo) => attach(g, geo, mat));
  return { group: g, bodyMat: mat };
}
