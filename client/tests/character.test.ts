// Kiểm hồi quy nhân vật "hạt đậu" (headless, tất định): (a) lớp vải không xuyên thân / lớp dưới, (b) đồ đội đầu ngoài sọ,
// (c) chuyển động hữu hạn, (d) chắp tay không xuyên ngực, (e) tích trượng không đâm đầu / mũ / mặt, (f) ngồi gấu chạm sàn,
// (g) mí không cắt mắt + nét mặt bám sọ, (h) đổi ngoại hình / tạo-huỷ không rò geometry / material, (i) tay góc nhìn thứ
// nhất trong khung nhìn, (j) không mảng vải nào chĩa ra khỏi thân. CHAR_DEBUG=1 → in số đo xấu nhất từng ca ra stderr.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ANIM_IDS, type AnimId, type HairId, type HatId, type HeldItem, type RobeId } from '@shared/index';
import type { AvatarHandle, AvatarLook, FirstPersonHandle } from '../src/art/api';
import type { GripStyle } from '../src/art/props';
import { createAvatar, createFirstPersonView } from '../src/art/avatar';
import { BODY_VARIANTS, LAYER, WAIST, bodyRadius, skirtGeometry } from '../src/art/character/body';
import { buildFace } from '../src/art/character/face';
import { TOOL_FOR } from '../src/art/character/handheld';
import { buildHeadwear } from '../src/art/character/headwear';
import { createMotion } from '../src/art/character/motion';
import { buildOutfit } from '../src/art/character/outfit';
import {
  BODY,
  PIVOT,
  REST_POSE,
  SIT,
  SKULL,
  SLEEVE,
  alignToBody,
  applyPose,
  createJoints,
  profileR,
  type Expression,
  type HandheldBuild,
  type Joints,
  type MatFactory,
  type MotionInput,
  type PartBuild,
  type Pose,
} from '../src/art/character/rig';
import { robeStyle } from '../src/art/character/style';

// ───────────────────────── Tiện ích chung ─────────────────────────

/** MatFactory giả: một vật liệu mỗi khoá, tên = khoá (để phân loại mesh theo vai trò). */
function fakeMats(): MatFactory {
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  return (key, color) => {
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color });
      m.name = key;
      mats.set(key, m);
    }
    return m;
  };
}

const monk = (robe: RobeId, accessory: AvatarLook['outfit']['accessory'] = 'none', isHost = false): AvatarLook => ({
  outfit: { robe, hat: 'none', accessory },
  hair: 'bald',
  skin: '#f6d2ad',
  isHost,
  vip: false,
  accent: '#4fc3f7',
});

const matName = (m: THREE.Mesh): string => (m.material as THREE.Material).name;

/** Tam giác của một mesh trong hệ `frame` (morph theo influence hiện tại), mảng phẳng 9 số / tam giác. */
function bakeTris(m: THREE.Mesh, frame: THREE.Object3D, keep?: (tri: number) => boolean): Float64Array {
  const g = m.geometry;
  const idx = g.getIndex();
  const n = (idx ? idx.count : g.getAttribute('position').count) / 3;
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const mw = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
  const out: number[] = [];
  const v = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    if (keep && !keep(t)) continue;
    for (let k = 0; k < 3; k++) {
      const i = idx ? idx.getX(t * 3 + k) : t * 3 + k;
      m.getVertexPosition(i, v).applyMatrix4(mw);
      out.push(v.x, v.y, v.z);
    }
  }
  return Float64Array.from(out);
}

/** Lưới băm đều (ô `cell` m) cho tập tam giác — tìm nhanh tam giác gần một đoạn thẳng. */
class TriGrid {
  private readonly map = new Map<number, number[]>();
  private stamp: Int32Array;
  private tick = 0;
  constructor(
    readonly tris: Float64Array,
    readonly cell = 0.02,
  ) {
    const n = tris.length / 9;
    this.stamp = new Int32Array(n);
    for (let t = 0; t < n; t++) {
      let x0 = Infinity;
      let y0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const o = t * 9 + k * 3;
        x0 = Math.min(x0, tris[o]!);
        y0 = Math.min(y0, tris[o + 1]!);
        z0 = Math.min(z0, tris[o + 2]!);
        x1 = Math.max(x1, tris[o]!);
        y1 = Math.max(y1, tris[o + 1]!);
        z1 = Math.max(z1, tris[o + 2]!);
      }
      for (let a = Math.floor(x0 / cell); a <= Math.floor(x1 / cell); a++)
        for (let b = Math.floor(y0 / cell); b <= Math.floor(y1 / cell); b++)
          for (let c = Math.floor(z0 / cell); c <= Math.floor(z1 / cell); c++) {
            const key = this.key(a, b, c);
            let l = this.map.get(key);
            if (!l) this.map.set(key, (l = []));
            l.push(t);
          }
    }
  }

  private key(a: number, b: number, c: number): number {
    return ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512);
  }

  /**
   * Bắn tia từ o theo hướng đơn vị d, dài tối đa `far`: gọi cb(t, khoảng cách, mặt trước?) cho mọi tam giác cắt tia
   * (mặt trước = pháp tuyến theo thứ tự đỉnh ngược chiều tia).
   */
  cast(o: THREE.Vector3, d: THREE.Vector3, far: number, cb: (t: number, dist: number, front: boolean) => void): void {
    this.tick++;
    const steps = Math.ceil(far / (this.cell * 0.5));
    const T = this.tris;
    for (let s = 0; s <= steps; s++) {
      const q = (far * s) / steps;
      const l = this.map.get(this.key(Math.floor((o.x + d.x * q) / this.cell), Math.floor((o.y + d.y * q) / this.cell), Math.floor((o.z + d.z * q) / this.cell)));
      if (!l) continue;
      for (const t of l) {
        if (this.stamp[t] === this.tick) continue;
        this.stamp[t] = this.tick;
        const b = t * 9;
        const e1x = T[b + 3]! - T[b]!;
        const e1y = T[b + 4]! - T[b + 1]!;
        const e1z = T[b + 5]! - T[b + 2]!;
        const e2x = T[b + 6]! - T[b]!;
        const e2y = T[b + 7]! - T[b + 1]!;
        const e2z = T[b + 8]! - T[b + 2]!;
        const px = d.y * e2z - d.z * e2y;
        const py = d.z * e2x - d.x * e2z;
        const pz = d.x * e2y - d.y * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const tx = o.x - T[b]!;
        const ty = o.y - T[b + 1]!;
        const tz = o.z - T[b + 2]!;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (dist < 0 || dist > far) continue;
        cb(t, dist, det > 0);
      }
    }
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Tư thế nghỉ với độ ngồi `sit` (hông hạ đúng như motion để gấu nằm trên sàn). */
function restPose(sit = 0): Pose {
  return { ...REST_POSE, sit, hipsY: lerp(BODY.hipsY, BODY.sitHipsY, sit) };
}

function posed(j: Joints, parts: readonly PartBuild[], p: Readonly<Pose>): void {
  applyPose(j, p);
  for (const part of parts) for (const m of part.sitMorph) m.morphTargetInfluences![0] = p.sit;
  j.root.updateMatrixWorld(true);
}

/** CHAR_DEBUG=1 npx vitest run client/tests/character.test.ts → in số đo xấu nhất của từng ca ra stderr (để đặt ngưỡng). */
const NODE = (globalThis as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;
const debug = (s: string): void => {
  if (NODE?.env.CHAR_DEBUG) NODE.stderr.write(`${s}\n`);
};

function meshesUnder(...roots: THREE.Object3D[]): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const r of roots)
    r.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
  return out;
}

// ───────────────────────── (a) Lớp vải bám thân ─────────────────────────

/**
 * Thứ tự lớp (khoá vật liệu → hạng): thân < da cổ < viền / cổ áo / gấu / đai / miếng vá < chỉ khâu < cà sa < viền cà sa
 * < chuỗi hạt / dây chuyền / khoen. Lớp hạng ≥ 2 phải cách mọi lớp hạng thấp hơn ≥ 1.5 mm.
 */
const RANK: Record<string, number> = {
  lower: 0,
  upper: 0,
  skin: 1,
  collar: 2,
  hem: 2,
  patch: 2,
  belt: 2,
  shirt: 2,
  button: 2,
  stitch: 3,
  lapel: 3,
  kasaya: 4,
  kasayaTrim: 5,
  tie: 5,
  bead: 6,
  tassel: 6,
  gold: 6,
};
/** Phần cà sa cố ý nằm trong thân (gờ cuộn eo, phủ đáy thân, phủ vòm hông) hoặc là tường mép: không đo như lớp trên. */
const KASAYA_INNER = new Set(['tuck', 'flange', 'underlap', 'wall']);
const CLEAR = 0.0015;

interface Layer {
  readonly key: string;
  readonly rank: number;
  readonly tris: Float64Array;
}

function layersOf(j: Joints): Layer[] {
  return meshesUnder(j.skirt, j.torso).map((m) => {
    const key = matName(m);
    const parts = m.geometry.userData.parts as { kind: string; start: number; count: number }[] | undefined;
    const keep = parts
      ? (t: number): boolean => !parts.some((p) => KASAYA_INNER.has(p.kind) && t * 3 >= p.start && t * 3 < p.start + p.count)
      : undefined;
    return { key, rank: RANK[key] ?? 3, tris: bakeTris(m, j.root, keep) };
  });
}

const _bn = new THREE.Vector3();
/** Pháp tuyến ngoài gần đúng của thân mặc áo tại điểm p (body space, đứng nghỉ): mặt tròn xoay r = profileR(y). */
function bodyNormalAt(p: THREE.Vector3): THREE.Vector3 {
  const r = Math.hypot(p.x, p.z) || 1;
  const dr = (profileR(p.y + 0.005) - profileR(p.y - 0.005)) / 0.01;
  return _bn.set(p.x / r, -dr, p.z / r).normalize();
}

/** Khe nhỏ nhất (m, âm = xuyên) giữa mỗi lớp hạng ≥ 2 và các lớp hạng thấp hơn: tia từ trọng tâm tam giác vào trong. */
function minLayerGap(layers: Layer[]): { gap: number; key: string } {
  let worst = { gap: Infinity, key: '' };
  const grids = new Map<number, { grid: TriGrid; owner: string[] }>();
  const gridBelow = (rank: number): { grid: TriGrid; owner: string[] } => {
    let g = grids.get(rank);
    if (!g) {
      const below = layers.filter((l) => l.rank < rank);
      const all = new Float64Array(below.reduce((s, l) => s + l.tris.length, 0));
      const owner: string[] = [];
      let o = 0;
      for (const l of below) {
        all.set(l.tris, o);
        o += l.tris.length;
        for (let k = 0; k < l.tris.length / 9; k++) owner.push(l.key);
      }
      grids.set(rank, (g = { grid: new TriGrid(all), owner }));
    }
    return g;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const o = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (const up of layers) {
    if (up.rank < 2) continue;
    const { grid, owner } = gridBelow(up.rank);
    const T = up.tris;
    for (let t = 0; t < T.length; t += 9) {
      a.set(T[t]!, T[t + 1]!, T[t + 2]!);
      b.set(T[t + 3]!, T[t + 4]!, T[t + 5]!);
      c.set(T[t + 6]!, T[t + 7]!, T[t + 8]!);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a));
      if (n.lengthSq() < 1e-14) continue;
      n.normalize();
      const cen = a.add(b).add(c).multiplyScalar(1 / 3);
      // Hạt / mắt xích (khối tròn): chỉ đo mặt quay ra ngoài theo pháp tuyến thân (dáng tròn xoay profileR) — mặt dưới /
      // mặt bên của quả cầu nằm thấp hơn mép lớp kề bên, tia từ đó đi dọc thân chứ không vào lớp bên dưới.
      if (up.rank === 6 && n.dot(bodyNormalAt(cen)) < 0.3) continue;
      o.copy(cen).addScaledVector(n, 0.02);
      d.copy(n).negate();
      let gap = Infinity;
      let hit = '';
      grid.cast(o, d, 0.06, (ti, dist, front) => {
        if ((dist < 0.02 && front) || dist >= 0.02) {
          if (dist - 0.02 < gap) hit = owner[ti]!;
          gap = Math.min(gap, dist - 0.02);
        }
      });
      if (gap < worst.gap) {
        const at = `(${cen.x.toFixed(3)},${cen.y.toFixed(3)},${cen.z.toFixed(3)}) n(${n.x.toFixed(2)},${n.y.toFixed(2)},${n.z.toFixed(2)})`;
        worst = { gap, key: `${up.key}${at} → ${hit}` };
      }
    }
  }
  return worst;
}

describe('áo quần: lớp vải không xuyên thân / lớp bên dưới', () => {
  const looks: [string, AvatarLook][] = [
    ['nau_rach', monk('robe_nau_rach')],
    ['lam', monk('robe_lam')],
    ['trang_nau', monk('robe_trang_nau')],
    ['ca_sa_vang', monk('robe_ca_sa_vang')],
    ['ca_sa_vien_do', monk('robe_ca_sa_vien_do')],
    ['host', monk('robe_ca_sa_vien_do', 'none', true)],
    ['lam+trang_hat', monk('robe_lam', 'trang_hat')],
    ['host+trang_hat', monk('robe_lam', 'trang_hat', true)],
    ['ca_sa_vang+day_chuyen', monk('robe_ca_sa_vang', 'day_chuyen_vang')],
    ['trang_nau+day_chuyen', monk('robe_trang_nau', 'day_chuyen_vang')],
  ];
  for (const [name, look] of looks) {
    it(`${name}: khe giữa các lớp ≥ 1.5 mm khi ngồi 0 / 0.5 / 1`, () => {
      const j = createJoints();
      const part = buildOutfit(look, j, fakeMats());
      for (const s of [0, 0.5, 1]) {
        posed(j, [part], restPose(s));
        const w = minLayerGap(layersOf(j));
        expect(w.gap, `${name} sit ${s}: ${w.key}`).toBeGreaterThanOrEqual(CLEAR);
      }
      part.dispose();
    });
  }
});

// ───────────────────────── (b) Đồ đội đầu ngoài sọ ─────────────────────────

/** Giá trị ellipsoid sọ tại điểm head-local: < 1 là nằm trong sọ. */
const skullE = (p: THREE.Vector3): number => (p.x / SKULL.rx) ** 2 + ((p.y - SKULL.cy) / SKULL.ry) ** 2 + (p.z / SKULL.rz) ** 2;

describe('đồ đội đầu: tóc / nón / mũ / mũ Tỳ Lư / kính ngoài sọ', () => {
  const HAIRS: HairId[] = ['bald', 'short', 'long', 'bun', 'spiky'];
  const HATS: (HatId | 'crown')[] = ['none', 'non_la', 'mu_len', 'mu_vip', 'crown'];
  it('mọi đỉnh nằm ngoài ellipsoid SKULL', () => {
    const v = new THREE.Vector3();
    for (const hair of HAIRS)
      for (const hat of HATS)
        for (const glasses of [false, true]) {
          const look: AvatarLook = {
            outfit: { robe: 'robe_lam', hat: hat === 'crown' ? 'none' : hat, accessory: glasses ? 'kinh_ram' : 'none' },
            hair,
            skin: '#efc193',
            isHost: hat === 'crown',
            vip: false,
          };
          const head = new THREE.Group();
          const part = buildHeadwear(look, head, fakeMats());
          head.updateMatrixWorld(true);
          let worst = Infinity;
          let at = '';
          for (const m of meshesUnder(head)) {
            const pos = m.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
              m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
              const e = skullE(v);
              if (e < worst) {
                worst = e;
                at = matName(m);
              }
            }
          }
          expect(worst, `${hair}/${hat}/${glasses ? 'kính' : '-'}: ${at}`).toBeGreaterThan(1);
          part.dispose();
          expect(head.children.length).toBe(0);
        }
  });
});

// ───────────────────────── (c) Chuyển động hữu hạn, có giới hạn ─────────────────────────

const LEFT_BUSY = [null, 'staff', 'fan'] as const;
const GRIPS: (GripStyle | null)[] = [null, 'tool', 'upright', 'carry'];

function input(anim: AnimId, busy: MotionInput['leftBusy'], grip: GripStyle | null, drunk = 0): MotionInput {
  const walk = anim === 'walk' || anim === 'carry_walk';
  return {
    anim,
    animTime: 0,
    speed: walk ? 3 : 0,
    moveYaw: walk ? 0.4 : null,
    grip,
    leftBusy: busy,
    tool: grip === null && TOOL_FOR[anim] !== undefined,
    drunk,
  };
}

/** Kênh tư thế có giới hạn rõ (ngoài ra: hữu hạn, |x| < 4π — kênh tay có thể ra dạng Euler kép / quấn 2π). */
function poseProblem(p: Readonly<Pose>): string | null {
  for (const [k, v] of Object.entries(p)) {
    if (!Number.isFinite(v)) return `${k} không hữu hạn`;
    if (Math.abs(v) > 4 * Math.PI) return `${k} = ${v}`;
  }
  const inside = (k: keyof Pose, a: number, b: number): string | null => (p[k] < a - 1e-9 || p[k] > b + 1e-9 ? `${k} = ${p[k]}` : null);
  return (
    inside('sit', 0, 1) ??
    inside('tuck', 0, 1) ??
    inside('lShoulder', 0, 1) ??
    inside('rShoulder', 0, 1) ??
    inside('squash', 0.5, 1.6) ??
    inside('y', -0.3, 0.8) ??
    inside('swayX', -1, 1) ??
    inside('swayZ', -1, 1) ??
    inside('hipsY', BODY.sitHipsY - 1e-6, BODY.hipsY + 1e-6) ??
    inside('lean', -1.6, 1.6) ??
    inside('bend', -1.6, 1.6) ??
    inside('roll', -1.6, 1.6) ??
    (Math.abs(p.hipsY - lerp(BODY.hipsY, BODY.sitHipsY, p.sit)) > 1e-6 ? `hipsY ${p.hipsY} lệch sit ${p.sit}` : null)
  );
}

describe('chuyển động: mọi AnimId × tay trái × kiểu cầm × dt', () => {
  it('tư thế hữu hạn, trong giới hạn, hông khớp độ ngồi (gấu nằm trên sàn)', () => {
    for (const busy of LEFT_BUSY)
      for (const grip of GRIPS)
        for (const dt of [1 / 144, 1 / 60, 0.1, 0.25]) {
          const m = createMotion();
          const inp = input('idle', busy, grip);
          m.snap(inp);
          let t = 0;
          for (const anim of ANIM_IDS) {
            Object.assign(inp, input(anim, busy, grip, busy === 'fan' ? 85 : 0));
            for (let s = 0; s * dt < 1; s++) {
              t += dt;
              inp.animTime += dt;
              const out = m.update(dt, t, inp);
              const bad = poseProblem(out.pose);
              if (bad) expect.fail(`${anim} busy=${busy} grip=${grip} dt=${dt.toFixed(4)} t=${inp.animTime.toFixed(2)}: ${bad}`);
            }
          }
        }
  });
});

// ───────────────────────── (d) Chắp tay / vỗ tay ─────────────────────────

/** Chạy motion `sec` giây (60 Hz) rồi áp tư thế lên cây khớp; gọi `each` sau mỗi khung (nếu có). */
function run(j: Joints, anim: AnimId, busy: MotionInput['leftBusy'], sec: number, each?: (t: number, p: Readonly<Pose>) => void): Readonly<Pose> {
  const m = createMotion();
  const inp = input(anim, busy, null);
  m.snap(input('idle', busy, null));
  let p: Readonly<Pose> = REST_POSE;
  for (let t = 0; t < sec; t += 1 / 60) {
    inp.animTime = t;
    p = m.update(1 / 60, t, inp).pose;
    if (each) {
      applyPose(j, p);
      j.root.updateMatrixWorld(true);
      each(t, p);
    }
  }
  applyPose(j, p);
  j.root.updateMatrixWorld(true);
  return p;
}

const PLAIN = BODY_VARIANTS.plain;
const _w = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/** Khoảng cách (m) từ điểm thế giới `w` tới mặt thân trên (body.ts, vỏ torso, hệ torso nên có cả nhịp thở). */
function torsoClear(j: Joints, w: THREE.Vector3): number {
  const p = _w.copy(w).applyMatrix4(_inv.copy(j.torso.matrixWorld).invert());
  const y = p.y + BODY.waistY;
  if (y > 1.08) return Infinity;
  return Math.hypot(p.x, p.z) - bodyRadius(Math.atan2(p.x, p.z), y, PLAIN, 'torso');
}

/** Khoảng cách gần đúng (m) từ điểm thế giới `w` tới mặt sọ (hệ head). */
function skullClear(j: Joints, w: THREE.Vector3): number {
  const p = _w.copy(w).applyMatrix4(_inv.copy(j.head.matrixWorld).invert());
  return (Math.sqrt(skullE(p)) - 1) * SKULL.ry;
}

describe('chắp tay / vỗ tay: lòng bàn tay chạm nhau, tay và ống tay không xuyên thân / đầu', () => {
  const hl = new THREE.Vector3();
  const hr = new THREE.Vector3();
  const el = new THREE.Vector3();
  const q = new THREE.Vector3();
  /** Tay + cẳng tay (ống tay hẹp SLEEVE.foreR, từ 15% tới 85% cẳng tay) so với thân và sọ. */
  const clearances = (j: Joints): { hand: number; head: number; fore: number } => {
    let hand = Infinity;
    let head = Infinity;
    let fore = Infinity;
    for (const [h, e] of [
      [j.handL, j.elbowL],
      [j.handR, j.elbowR],
    ] as const) {
      h.getWorldPosition(hl);
      e.getWorldPosition(el);
      hand = Math.min(hand, torsoClear(j, hl) - BODY.handR);
      head = Math.min(head, skullClear(j, hl) - BODY.handR);
      for (let k = 0.15; k <= 0.851; k += 0.05) fore = Math.min(fore, torsoClear(j, q.lerpVectors(el, hl, k)) - SLEEVE.foreR);
    }
    return { hand, head, fore };
  };
  for (const anim of ['pray', 'kneel', 'bow'] as const) {
    it(`${anim}: chắp tay sát nhau, không xuyên`, () => {
      const j = createJoints();
      run(j, anim, null, 2.5);
      j.handL.getWorldPosition(hl);
      j.handR.getWorldPosition(hr);
      expect(hl.distanceTo(hr)).toBeCloseTo(2 * BODY.handR, 2);
      const c = clearances(j);
      expect(c.hand, 'bàn tay vs thân').toBeGreaterThan(0);
      expect(c.head, 'bàn tay vs sọ').toBeGreaterThan(0);
      expect(c.fore, 'ống tay hẹp vs ngực').toBeGreaterThan(0);
    });
  }
  it('clap: hai tay chạm nhau theo nhịp, không xuyên', () => {
    const j = createJoints();
    let minD = Infinity;
    let worst = { hand: Infinity, head: Infinity, fore: Infinity };
    run(j, 'clap', null, 3, (t) => {
      if (t < 1) return;
      j.handL.getWorldPosition(hl);
      j.handR.getWorldPosition(hr);
      minD = Math.min(minD, hl.distanceTo(hr));
      const c = clearances(j);
      worst = { hand: Math.min(worst.hand, c.hand), head: Math.min(worst.head, c.head), fore: Math.min(worst.fore, c.fore) };
    });
    expect(minD).toBeLessThan(2 * BODY.handR + 0.01);
    expect(worst.hand, 'bàn tay vs thân').toBeGreaterThan(0);
    expect(worst.head, 'bàn tay vs sọ').toBeGreaterThan(0);
    expect(worst.fore, 'ống tay hẹp vs ngực').toBeGreaterThan(0);
  });
});

// ───────────────────────── (f) Ngồi: gấu áo nằm trên sàn ─────────────────────────

describe('ngồi / quỳ / lạy: vạt dưới (morph sit) không lún sàn, gấu nằm trên sàn', () => {
  it('đáy vạt dưới không lún sàn trong mọi hoạt ảnh; ngồi / quỳ thì gấu ở SIT.hemY ± 2 cm', () => {
    const v = new THREE.Vector3();
    const geo = skirtGeometry(PLAIN);
    const sitAnims: AnimId[] = [];
    for (const anim of ANIM_IDS) {
      const j = createJoints();
      const mesh = alignToBody(new THREE.Mesh(geo), PIVOT.waist);
      j.skirt.add(mesh);
      mesh.updateMorphTargets();
      const pos = geo.getAttribute('position');
      let low = Infinity;
      let seatedLow = -Infinity;
      run(j, anim, null, 2.5, (t, p) => {
        if (t < 0.6 || Math.round(t * 60) % 6) return;
        mesh.morphTargetInfluences![0] = p.sit;
        mesh.updateMatrixWorld(true);
        let lo = Infinity;
        for (let i = 0; i < pos.count; i++) lo = Math.min(lo, mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).y);
        low = Math.min(low, lo);
        if (p.sit > 0.5 && Math.abs(p.y) < 0.005) seatedLow = Math.max(seatedLow, lo);
      });
      expect(low, `${anim}: đáy vạt dưới`).toBeGreaterThan(-0.005);
      if (seatedLow > -Infinity) {
        sitAnims.push(anim);
        expect(Math.abs(seatedLow - SIT.hemY), `${anim}: gấu khi ngồi ở y ${seatedLow}`).toBeLessThan(0.02);
      }
    }
    expect(sitAnims).toEqual(expect.arrayContaining(['sit', 'kneel', 'strike']));
  });
});

// ───────────────────────── (e) Tích trượng không đâm đầu / mũ Tỳ Lư / mặt ─────────────────────────

/** Phần riêng của BeanAvatar (private trong avatar.ts) mà kiểm tra cần đọc. */
interface AvatarInternals {
  readonly j: Joints;
  readonly left: { part: HandheldBuild | null };
}
const internals = (av: AvatarHandle): AvatarInternals => av as unknown as AvatarInternals;

/**
 * Mô hình bao tích trượng (handheld.ts): cán trong khung root của gậy từ chân y −0.52 tới đỉnh cán 1.43, bán kính ≤ 0.028 (kể cả đai vàng);
 * đầu gậy (dangler, gốc = chân khoen lớn) từ 0 tới đỉnh ngọc 0.282, trong bán kính 0.09 quanh trục.
 */
const STAFF = { foot: -0.52, shaftTop: 1.43, shaftR: 0.028, finialTop: 0.282, finialR: 0.09 } as const;

/** Khoảng cách từ điểm (x, y, z) tới đoạn ab (không cấp phát). */
function segDist(x: number, y: number, z: number, a: THREE.Vector3, b: THREE.Vector3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / l2)) : 0;
  return Math.hypot(x - a.x - abx * t, y - a.y - aby * t, z - a.z - abz * t);
}

/**
 * Thể tích đầu + mũ Tỳ Lư (head-local) nở thêm bán kính r: sọ SKULL + tai (x +0.03), chóp mũ (+0.12 trên đỉnh sọ), cằm
 * (+0.02), nét mặt (+0.03 phía trước), dải mũ sau gáy (+0.01 phía sau). < 1 = chạm.
 */
function headVolume(p: THREE.Vector3, r: number): number {
  const ry = p.y > SKULL.cy ? SKULL.ry + 0.12 : SKULL.ry + 0.02;
  const rz = p.z > 0 ? SKULL.rz + 0.03 : SKULL.rz + 0.01;
  return (p.x / (SKULL.rx + 0.03 + r)) ** 2 + ((p.y - SKULL.cy) / (ry + r)) ** 2 + (p.z / (rz + r)) ** 2;
}

describe('tích trượng (Phương Trượng): không đâm đầu / mũ / mặt trong mọi hoạt ảnh, tay trái giữ bên hông', () => {
  const HOST = monk('robe_ca_sa_vien_do', 'none', true);

  it('mô hình bao khớp hình thật của gậy (cán + đầu gậy)', () => {
    const av = createAvatar(HOST);
    const staff = internals(av).left.part!;
    expect(staff, 'host phải cầm tích trượng ở tay trái').toBeTruthy();
    const fin = staff.danglers[0]!.obj;
    staff.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(staff.root.matrixWorld).invert();
    const finInv = new THREE.Matrix4().copy(fin.matrixWorld).invert();
    const a = new THREE.Vector3(0, STAFF.foot, 0);
    const b = new THREE.Vector3(0, STAFF.shaftTop, 0);
    const c = new THREE.Vector3(0, 0, 0);
    const d = new THREE.Vector3(0, STAFF.finialTop, 0);
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    let worst = -Infinity;
    for (const m of meshesUnder(staff.root)) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
        w.copy(v).applyMatrix4(finInv);
        v.applyMatrix4(inv);
        // Đỉnh nằm trong ít nhất một trong hai bao (cán / đầu gậy): ra ngoài cả hai = mô hình cũ, phải cập nhật STAFF.
        worst = Math.max(worst, Math.min(segDist(v.x, v.y, v.z, a, b) - STAFF.shaftR, segDist(w.x, w.y, w.z, c, d) - STAFF.finialR));
      }
    }
    expect(worst, 'đỉnh gậy ngoài mô hình bao (m)').toBeLessThanOrEqual(0.0005);
    av.dispose();
  });
});

/** Chạy avatar qua mọi AnimId nối tiếp (60 Hz, `sec` giây mỗi hoạt ảnh; đi thì root tiến 3 m/s), gọi `each` sau mỗi khung. */
function sweepAnims(av: AvatarHandle, each: (anim: AnimId, f: number) => void, sec = 2): void {
  let t = 0;
  for (const anim of ANIM_IDS) {
    av.setAnim(anim);
    const sp = anim === 'walk' || anim === 'carry_walk' ? 3 : 0;
    for (let f = 0; f < sec * 60; f++) {
      t += 1 / 60;
      av.update(1 / 60, t, sp);
      if (sp) av.root.position.z += sp / 60;
      av.root.updateMatrixWorld(true);
      each(anim, f);
    }
  }
}

describe('tích trượng: mọi AnimId (60 Hz, 2 s) × độ say × đồ tay phải', () => {
  const HOST = monk('robe_ca_sa_vien_do', 'none', true);
  /** [tên, độ say, đồ tay phải, đo đỉnh mesh mỗi n khung]. */
  const CASES: [string, number, HeldItem | null, number][] = [
    ['tay phải trống', 0, null, 2],
    ['say 95 + đèn (upright)', 95, { kind: 'lamp', variant: 'lit' }, 3],
    ['say 70 + chổi (tool)', 70, { kind: 'broom' }, 3],
    ['xô nước (carry)', 0, { kind: 'water_bucket' }, 3],
  ];
  for (const [name, drunk, held, every] of CASES) {
    it(`${name}: gậy cách đầu / mũ Tỳ Lư / dải mũ / mặt ≥ 1.5 mm, tay trái không qua đường giữa`, () => {
      const av = createAvatar(HOST);
      av.setDrunk(drunk);
      av.setHeld(held);
      const { j, left } = internals(av);
      const staff = left.part!;
      const fin = staff.danglers[0]!.obj;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const d = new THREE.Vector3();
      const v = new THREE.Vector3();
      const hp = new THREE.Vector3();
      const hinv = new THREE.Matrix4();
      const w = { vol: Infinity, volAt: '', mesh: Infinity, meshAt: '', hand: Infinity, handAt: '' };
      sweepAnims(av, (anim, f) => {
        a.set(0, STAFF.foot, 0).applyMatrix4(staff.root.matrixWorld);
        b.set(0, STAFF.shaftTop, 0).applyMatrix4(staff.root.matrixWorld);
        c.set(0, 0, 0).applyMatrix4(fin.matrixWorld);
        d.set(0, STAFF.finialTop, 0).applyMatrix4(fin.matrixWorld);
        const at = `${anim} t=${(f / 60).toFixed(2)}`;
        // Thể tích đầu + mũ (giải tích, mỗi khung): mẫu dọc cán 2 cm, dọc đầu gậy 2 cm.
        hinv.copy(j.head.matrixWorld).invert();
        for (let k = 0; k <= 100; k++) {
          const e = headVolume(hp.lerpVectors(a, b, k / 100).applyMatrix4(hinv), STAFF.shaftR);
          if (e < w.vol) [w.vol, w.volAt] = [e, `${at} cán ${k}%`];
        }
        for (let k = 0; k <= 15; k++) {
          const e = headVolume(hp.lerpVectors(c, d, k / 15).applyMatrix4(hinv), STAFF.finialR);
          if (e < w.vol) [w.vol, w.volAt] = [e, `${at} đầu gậy ${k}/15`];
        }
        // Mọi đỉnh đang hiện dưới khớp đầu (sọ, mặt, mũ Tỳ Lư, dải mũ) so với bao gậy.
        if (f % every === 0)
          j.head.traverseVisible((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const pos = m.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
              m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
              const g = Math.min(segDist(v.x, v.y, v.z, a, b) - STAFF.shaftR, segDist(v.x, v.y, v.z, c, d) - STAFF.finialR);
              if (g < w.mesh) [w.mesh, w.meshAt] = [g, `${at} ${matName(m)}`];
            }
          });
        // Tay trái (gậy) giữ bên hông: tâm bàn tay trong hệ hông ở x ≥ khớp vai (đường giữa x = 0).
        j.handL.getWorldPosition(v).applyMatrix4(hinv.copy(j.hips.matrixWorld).invert());
        if (v.x < w.hand) [w.hand, w.handAt] = [v.x, at];
      });
      debug(`[e] ${name} ${JSON.stringify(w)}`);
      expect(w.vol, `thể tích đầu + mũ: ${w.volAt}`).toBeGreaterThan(1);
      expect(w.mesh, `đỉnh đầu / mặt / mũ gần gậy nhất: ${w.meshAt}`).toBeGreaterThanOrEqual(CLEAR);
      expect(w.hand, `tay trái x (hệ hông): ${w.handAt}`).toBeGreaterThanOrEqual(BODY.shoulderX);
      av.dispose();
    });
  }
});

// ───────────────────────── (g) Khuôn mặt: mí không cắt mắt, nét mặt bám sọ ─────────────────────────

/** Khoảng cách có dấu (m) từ điểm head-local tới ellipsoid SKULL (> 0 = ngoài sọ): chiếu vuông góc, chia đôi tham số. */
function skullSD(x: number, y: number, z: number): number {
  const a2 = SKULL.rx ** 2;
  const b2 = SKULL.ry ** 2;
  const c2 = SKULL.rz ** 2;
  const px = Math.abs(x);
  const py = Math.abs(y - SKULL.cy);
  const pz = Math.abs(z);
  const F = (t: number): number => (SKULL.rx * px / (a2 + t)) ** 2 + (SKULL.ry * py / (b2 + t)) ** 2 + (SKULL.rz * pz / (c2 + t)) ** 2 - 1;
  const out = F(0) > 0;
  let lo = out ? 0 : -Math.min(a2, b2, c2) + 1e-12;
  let hi = out ? 1 : 0;
  if (out) while (F(hi) > 0) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (F(mid) > 0) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const d = Math.hypot(px - (a2 * px) / (a2 + t), py - (b2 * py) / (b2 + t), pz - (c2 * pz) / (c2 + t));
  return out ? d : -d;
}

/** Loại nét mặt theo khoá vật liệu; khoá 'skin' dùng chung cho sọ (đổ bóng) và mí (không đổ bóng). */
const faceKind = (m: THREE.Mesh): string => (matName(m) === 'skin' ? (m.castShadow ? 'skull' : 'lid') : matName(m));

/** Nét mặt nằm trong lớp [0, SKULL.featureOut] ngoài sọ (dung sai 0.1 mm như kiểm tra M2a). */
const FEATURE = new Set(['sclera', 'iris', 'eyeHi', 'lash', 'eyeSpiral', 'brow', 'mouthLine', 'mouthIn', 'tongue', 'lid']);
/** Lớp dán (má hồng, đỏ mặt, dòng lệ): cách sọ 0.8 mm .. 2 cm; giọt lệ rơi khỏi má nên chỉ cần ngoài sọ. */
const DECAL = new Set(['flush', 'tears', 'blush', 'tearDrop']);
/** Cặp lớp không được cắt nhau: mí ↔ mắt (lòng trắng / tròng / đốm sáng) / mi / mày / lệ, mi ↔ mắt, mắt xoáy, miệng, má. */
const FACE_PAIRS: [string, string[]][] = [
  ['lid', ['sclera', 'iris', 'eyeHi', 'lash', 'brow', 'tears']],
  ['lash', ['sclera', 'iris', 'eyeHi', 'brow', 'tears']],
  ['eyeSpiral', ['sclera', 'lid', 'lash']],
  ['mouthLine', ['mouthIn', 'tongue', 'flush']],
  ['tongue', ['mouthIn', 'flush']],
  ['mouthIn', ['flush']],
  ['blush', ['flush', 'lid', 'tears']],
  ['brow', ['eyeHi', 'sclera']],
];

/** Cạnh pq cắt tam giác thứ `b` (chỉ số phần tử đầu) của mảng phẳng T? (Möller–Trumbore, bỏ trường hợp song song.) */
function segTri(p: Float64Array, pi: number, qi: number, T: Float64Array, b: number): boolean {
  const dx = p[qi]! - p[pi]!;
  const dy = p[qi + 1]! - p[pi + 1]!;
  const dz = p[qi + 2]! - p[pi + 2]!;
  const e1x = T[b + 3]! - T[b]!;
  const e1y = T[b + 4]! - T[b + 1]!;
  const e1z = T[b + 5]! - T[b + 2]!;
  const e2x = T[b + 6]! - T[b]!;
  const e2y = T[b + 7]! - T[b + 1]!;
  const e2z = T[b + 8]! - T[b + 2]!;
  const pvx = dy * e2z - dz * e2y;
  const pvy = dz * e2x - dx * e2z;
  const pvz = dx * e2y - dy * e2x;
  const det = e1x * pvx + e1y * pvy + e1z * pvz;
  if (Math.abs(det) < 1e-14) return false;
  const inv = 1 / det;
  const tx = p[pi]! - T[b]!;
  const ty = p[pi + 1]! - T[b + 1]!;
  const tz = p[pi + 2]! - T[b + 2]!;
  const u = (tx * pvx + ty * pvy + tz * pvz) * inv;
  if (u < 0 || u > 1) return false;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return false;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 && t <= 1;
}

/** Hai tam giác (A tại a, B tại b) cắt nhau: một cạnh của tam giác này xuyên tam giác kia. */
function triTri(A: Float64Array, a: number, B: Float64Array, b: number): boolean {
  for (let k = 0; k < 3; k++) {
    const k1 = (k + 1) % 3;
    if (segTri(A, a + k * 3, a + k1 * 3, B, b) || segTri(B, b + k * 3, b + k1 * 3, A, a)) return true;
  }
  return false;
}

/** Số cặp tam giác cắt nhau giữa hai tập (mảng phẳng 9 số / tam giác, lưới băm ô 1 cm) + một chỗ ví dụ. */
function triCross(A: Float64Array, B: Float64Array): { n: number; at: string } {
  const C = 0.01;
  const key = (x: number, y: number, z: number): number => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
  const lo = (T: Float64Array, b: number, k: number): number => Math.min(T[b + k]!, T[b + 3 + k]!, T[b + 6 + k]!);
  const hi = (T: Float64Array, b: number, k: number): number => Math.max(T[b + k]!, T[b + 3 + k]!, T[b + 6 + k]!);
  const grid = new Map<number, number[]>();
  for (let b = 0; b < B.length; b += 9)
    for (let x = Math.floor(lo(B, b, 0) / C); x <= Math.floor(hi(B, b, 0) / C); x++)
      for (let y = Math.floor(lo(B, b, 1) / C); y <= Math.floor(hi(B, b, 1) / C); y++)
        for (let z = Math.floor(lo(B, b, 2) / C); z <= Math.floor(hi(B, b, 2) / C); z++) {
          const l = grid.get(key(x, y, z));
          if (l) l.push(b);
          else grid.set(key(x, y, z), [b]);
        }
  let n = 0;
  let at = '';
  const stamp = new Int32Array(B.length / 9).fill(-1);
  for (let a = 0; a < A.length; a += 9)
    for (let x = Math.floor(lo(A, a, 0) / C); x <= Math.floor(hi(A, a, 0) / C); x++)
      for (let y = Math.floor(lo(A, a, 1) / C); y <= Math.floor(hi(A, a, 1) / C); y++)
        for (let z = Math.floor(lo(A, a, 2) / C); z <= Math.floor(hi(A, a, 2) / C); z++)
          for (const b of grid.get(key(x, y, z)) ?? []) {
            if (stamp[b / 9] === a) continue;
            stamp[b / 9] = a;
            if (!triTri(A, a, B, b)) continue;
            n++;
            if (!at) at = `(${A[a]!.toFixed(3)},${A[a + 1]!.toFixed(3)},${A[a + 2]!.toFixed(3)})`;
          }
  return { n, at };
}

/** Phần riêng của Face (face.ts) để ép chớp mắt: đồng hồ, lúc chớp tới, thời điểm trong lần chớp (−1 = không chớp). */
interface FaceInternals {
  clock: number;
  nextBlink: number;
  blinkT: number;
}
const EXPRESSIONS: Expression[] = ['neutral', 'happy', 'laugh', 'calm', 'focus', 'sad', 'cry', 'angry', 'surprised', 'dizzy', 'sleepy'];

describe('khuôn mặt: mọi biểu cảm × say 0 / 70 / 95, lúc chuyển biểu cảm (~0.12 s) và lúc chớp mắt', () => {
  for (const drunk of [0, 70, 95]) {
    it(`say ${drunk}: mí không cắt mắt, nét mặt nằm trong [0, featureOut] ngoài sọ`, () => {
      const head = new THREE.Group();
      const mats = fakeMats();
      const look = monk('robe_lam');
      let face = buildFace(head, look, mats);
      const st = (): FaceInternals => face as unknown as FaceInternals;
      const v = new THREE.Vector3();
      const problems: string[] = [];
      let nProblems = 0;
      const bad = (s: string): void => {
        if (nProblems++ < 10) problems.push(s);
      };
      let samples = 0;
      let blinkSamples = 0;
      /** Loại nét đã gặp (đổi khoá vật liệu mà không sửa test thì cặp kiểm tra bị bỏ qua lặng lẽ — chặn ở cuối). */
      const seen = new Set<string>();
      const check = (tag: string): void => {
        samples++;
        if (st().blinkT > 0) blinkSamples++;
        head.updateMatrixWorld(true);
        const parts = new Map<string, Float64Array[]>();
        head.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const k = faceKind(m);
          parts.set(k, [...(parts.get(k) ?? []), bakeTris(m, head)]);
          seen.add(k);
          if (k === 'skull') return;
          const pos = m.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
            if (!Number.isFinite(v.x + v.y + v.z)) return bad(`${tag}: ${k} NaN`);
            if (k === 'blush' && Math.abs(v.x) > 0.26) continue; // lòng tai (cùng mesh má hồng)
            const d = skullSD(v.x, v.y, v.z);
            const off = FEATURE.has(k) ? d < -1e-4 || d > SKULL.featureOut + 1e-4 : DECAL.has(k) && (d < 0.0008 || (d > 0.02 && k !== 'tearDrop'));
            if (off) bad(`${tag}: ${k} d=${(d * 1000).toFixed(2)} mm @(${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)})`);
          }
        });
        const tris = (k: string): Float64Array | null => {
          const l = parts.get(k);
          if (!l) return null;
          const out = new Float64Array(l.reduce((s, x) => s + x.length, 0));
          let o = 0;
          for (const x of l) {
            out.set(x, o);
            o += x.length;
          }
          return out;
        };
        for (const [a, bs] of FACE_PAIRS) {
          const A = tris(a);
          if (!A) continue;
          for (const b of bs) {
            const B = tris(b);
            if (!B) continue;
            const r = triCross(A, B);
            if (r.n) bad(`${tag}: ${a} cắt ${b} ${r.n} cặp @${r.at}`);
          }
        }
      };
      let time = 0;
      for (const ex of EXPRESSIONS) {
        if (ex === 'sad') {
          // Dựng lại giữa chừng như avatar.setLook: dispose → dựng → update(dt 0) với biểu cảm đang có.
          face.dispose();
          expect(head.children.length, 'dispose để sót object').toBe(0);
          face = buildFace(head, look, mats);
          face.update(0, time, ex, drunk);
          check(`${ex} dựng lại`);
        }
        // Chuyển từ biểu cảm trước (xen khung dt = 0).
        for (let f = 1; f <= 40; f++) {
          const dt = f % 13 === 6 ? 0 : 1 / 60;
          time += dt;
          face.update(dt, time, ex, drunk);
          if (f === 2 || f === 4 || f === 7 || f === 10 || f === 40) check(`${ex}/${drunk} f${f}`);
        }
        // Ép tới giờ chớp (mặt tự bỏ qua khi mắt đang nhắm / đang đổi kiểu mắt), lấy mẫu suốt lần chớp.
        st().nextBlink = st().clock;
        for (let f = 1; f <= 30; f++) {
          time += 1 / 60;
          face.update(1 / 60, time, ex, drunk);
          if (f <= 16 ? f % 2 === 1 : f % 3 === 1) check(`${ex}/${drunk} chớp f${f}`);
        }
      }
      face.dispose();
      expect(head.children.length, 'dispose để sót object').toBe(0);
      debug(`[g] say ${drunk}: ${samples} mẫu, ${blinkSamples} mẫu đang chớp, ${nProblems} lỗi`);
      expect(problems, `${nProblems} lỗi / ${samples} mẫu`).toEqual([]);
      expect(blinkSamples, 'số mẫu lấy giữa lần chớp mắt').toBeGreaterThanOrEqual(30);
      expect([...seen]).toEqual(expect.arrayContaining(['skull', 'lid', 'lash', 'sclera', 'iris', 'eyeHi', 'brow', 'mouthLine', 'mouthIn', 'blush', 'tears']));
      if (drunk !== 70) expect(seen.has('eyeSpiral'), 'mắt xoáy (dizzy) phải được kiểm').toBe(true);
    });
  }
});

describe('tiện ích kiểm tra: phát hiện được tam giác cắt nhau / khoảng cách tới sọ', () => {
  it('triCross / skullSD', () => {
    // Hai tam giác vuông góc xuyên nhau, và một cặp cách nhau 1 mm.
    const A = Float64Array.from([0, 0, -0.01, 0.02, 0, -0.01, 0, 0.02, 0.01]);
    const B = Float64Array.from([-0.01, 0.005, -0.02, 0.03, 0.005, -0.02, 0.01, 0.005, 0.02]);
    const C = Float64Array.from([0, 0, 0.001, 0.02, 0, 0.001, 0, 0.02, 0.001]);
    const D = Float64Array.from([0, 0, 0, 0.02, 0, 0, 0, 0.02, 0]);
    expect(triCross(A, B).n).toBe(1);
    expect(triCross(C, D).n).toBe(0);
    expect(skullSD(0, SKULL.cy, SKULL.rz + 0.01)).toBeCloseTo(0.01, 6);
    expect(skullSD(SKULL.rx - 0.02, SKULL.cy, 0)).toBeCloseTo(-0.02, 6);
  });
});

// ───────────────────────── (h) Không rò geometry / material ─────────────────────────

const npcLook = (robe: RobeId, hair: HairId, skin: string, accent: string, hat: HatId = 'none', accessory: AvatarLook['outfit']['accessory'] = 'none'): AvatarLook => ({
  outfit: { robe, hat, accessory },
  hair,
  skin,
  isHost: false,
  vip: false,
  accent,
});
const monkLook = (robe: RobeId, skin: string, hat: HatId = 'none', accessory: AvatarLook['outfit']['accessory'] = 'none'): AvatarLook => ({
  ...monk(robe, accessory),
  skin,
  outfit: { robe, hat, accessory },
});
/** Dàn ngoại hình như LINEUP của client/src/preview/views/avatar.ts (ở đó không export): mọi áo, tóc, mũ, phụ kiện. */
const LINEUP: AvatarLook[] = [
  monkLook('robe_nau_rach', '#f6d2ad'),
  monkLook('robe_lam', '#efc193', 'non_la'),
  monkLook('robe_trang_nau', '#e8b48a', 'none', 'trang_hat'),
  monkLook('robe_ca_sa_vang', '#d9a173', 'none', 'quat_nan'),
  { ...monkLook('robe_ca_sa_vien_do', '#efc193'), isHost: true },
  monkLook('robe_ca_sa_vien_do', '#c98e62', 'mu_len', 'day_chuyen_vang'),
  npcLook('civ_ao_thun', 'short', '#e8b48a', '#ff6f91'),
  npcLook('civ_ba_ba', 'long', '#f6d2ad', '#ba68c8'),
  npcLook('civ_party', 'bun', '#d9a173', '#4db6ac', 'none', 'kinh_ram'),
  npcLook('civ_vest', 'spiky', '#c98e62', '#ffd54f', 'mu_vip'),
];
const HELD_ITEMS: (HeldItem | null)[] = [null, { kind: 'broom' }, { kind: 'water_bucket' }, { kind: 'lamp', variant: 'lit' }, { kind: 'incense', variant: 'lit' }];
/** Hoạt ảnh có dụng cụ làm việc (rìu, dùi mõ, dao, xẻng, quạt, bình lắc) + nghỉ. */
const TOOL_ANIMS = ['chop', 'strike', 'cut', 'stir', 'fan', 'shake', 'idle'] as const;

/**
 * Đếm geometry / material còn sống trong lúc chạy `body`: vá dispose để ghi id đã giải phóng; id tăng dần nên số đã tạo =
 * id của cái mới nhất. Gỡ vá khi xong.
 */
function withAliveCounter(body: (alive: () => { geo: number; mat: number }) => void): void {
  const gone = { geo: new Set<number>(), mat: new Set<number>() };
  const gd = THREE.BufferGeometry.prototype.dispose;
  const md = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry): void {
    gone.geo.add(this.id);
    gd.call(this);
  };
  // Material có `id` tăng dần lúc chạy nhưng @types/three 0.186 không khai báo.
  const matId = (m: THREE.Material): number => (m as unknown as { id: number }).id;
  THREE.Material.prototype.dispose = function (this: THREE.Material): void {
    gone.mat.add(matId(this));
    md.call(this);
  };
  try {
    body(() => {
      const g = new THREE.BufferGeometry();
      const m = new THREE.MeshBasicMaterial();
      const r = { geo: g.id - gone.geo.size, mat: matId(m) - gone.mat.size };
      // Cái vừa tạo để đo cũng dispose luôn → lần đo sau tự triệt tiêu.
      g.dispose();
      m.dispose();
      return r;
    });
  } finally {
    THREE.BufferGeometry.prototype.dispose = gd;
    THREE.Material.prototype.dispose = md;
  }
}

describe('rò rỉ: đổi ngoại hình liên tục / tạo-huỷ không làm tăng geometry / material còn sống', () => {
  let T = 0;
  const step = (h: AvatarHandle | FirstPersonHandle, n: number, speed = 0): void => {
    for (let i = 0; i < n; i++) h.update(1 / 60, (T += 1 / 60), speed);
  };
  /** Một vòng đổi: mọi ngoại hình LINEUP, đồ cầm × hoạt ảnh có dụng cụ, rồi về ngoại hình đầu. */
  const churn = (h: AvatarHandle | FirstPersonHandle): void => {
    for (const look of LINEUP) {
      h.setLook(look);
      step(h, 2);
    }
    for (const item of HELD_ITEMS) {
      h.setHeld(item);
      for (const anim of TOOL_ANIMS) {
        h.setAnim(anim);
        step(h, 2);
      }
    }
    h.setHeld(null);
    h.setAnim('idle');
    h.setLook(LINEUP[0]!);
    step(h, 2);
  };
  /** Vật liệu riêng của avatar (MatFactory + hiệu ứng). */
  const ownMats = (av: AvatarHandle): number => {
    const x = av as unknown as { mats: Map<string, unknown>; fxMats: Set<unknown> };
    return x.mats.size + x.fxMats.size;
  };

  it('avatar: setLook × LINEUP × 3 vòng + đồ cầm / dụng cụ / hiệu ứng', () => {
    withAliveCounter((alive) => {
      const av = createAvatar(LINEUP[0]!);
      const fx = (): void => {
        av.setTapNiem(90);
        av.setGlow('#ffd166');
        av.setDrunk(80);
        av.setGhost(true);
        av.playRankUp();
        step(av, 3);
        av.setGhost(false);
        av.setGlow(null);
        av.setTapNiem(0);
        av.setDrunk(0);
      };
      // Làm nóng: hình dùng chung theo ngoại hình (cache cấp module) + vật liệu hiệu ứng tạo lần đầu.
      churn(av);
      fx();
      churn(av);
      const a0 = alive();
      const m0 = ownMats(av);
      for (let r = 0; r < 3; r++) {
        churn(av);
        fx();
      }
      const a1 = alive();
      debug(`[h] avatar setLook: geo ${a0.geo} → ${a1.geo}, mat ${a0.mat} → ${a1.mat}, vật liệu riêng ${m0} → ${ownMats(av)}`);
      expect(a1.geo, 'geometry còn sống sau 3 vòng đổi ngoại hình').toBeLessThanOrEqual(a0.geo);
      expect(a1.mat, 'material còn sống sau 3 vòng đổi ngoại hình').toBeLessThanOrEqual(a0.mat);
      expect(ownMats(av), 'vật liệu riêng của avatar').toBeLessThanOrEqual(m0);
      av.dispose();
    });
  });

  it('avatar: tạo / huỷ 20× (đồ cầm, dụng cụ, mây sét, hào quang, thăng cấp)', () => {
    withAliveCounter((alive) => {
      const once = (i: number): void => {
        const b = createAvatar(LINEUP[i % LINEUP.length]!);
        b.setHeld(HELD_ITEMS[i % HELD_ITEMS.length]!);
        b.setAnim(i % 2 ? 'chop' : 'walk');
        b.setTapNiem(90);
        b.setGlow('#ffd166');
        b.playRankUp();
        step(b, 3, i % 2 ? 0 : 3);
        b.dispose();
      };
      for (let i = 0; i < LINEUP.length; i++) once(i);
      const a0 = alive();
      for (let i = 0; i < 20; i++) once(i);
      const a1 = alive();
      debug(`[h] avatar tạo/huỷ: geo ${a0.geo} → ${a1.geo}, mat ${a0.mat} → ${a1.mat}`);
      expect(a1.geo, 'geometry còn sống sau 20 lần tạo / huỷ').toBeLessThanOrEqual(a0.geo);
      expect(a1.mat, 'material còn sống sau 20 lần tạo / huỷ').toBeLessThanOrEqual(a0.mat);
    });
  });

  it('tay góc nhìn thứ nhất: setLook × LINEUP × 3 vòng + đồ cầm, tạo / huỷ 10×', () => {
    withAliveCounter((alive) => {
      const v = createFirstPersonView(LINEUP[0]!);
      churn(v);
      churn(v);
      const a0 = alive();
      for (let r = 0; r < 3; r++) churn(v);
      const a1 = alive();
      v.dispose();
      for (let i = 0; i < LINEUP.length; i++) {
        const w = createFirstPersonView(LINEUP[i]!);
        w.setHeld(HELD_ITEMS[i % HELD_ITEMS.length]!);
        step(w, 3);
        w.dispose();
      }
      const a2 = alive();
      for (let i = 0; i < 10; i++) {
        const w = createFirstPersonView(LINEUP[i % LINEUP.length]!);
        w.setHeld(HELD_ITEMS[i % HELD_ITEMS.length]!);
        w.setAnim(i % 2 ? 'chop' : 'idle');
        step(w, 3);
        w.dispose();
      }
      const a3 = alive();
      debug(`[h] fp: setLook geo ${a0.geo} → ${a1.geo}, mat ${a0.mat} → ${a1.mat}; tạo/huỷ geo ${a2.geo} → ${a3.geo}, mat ${a2.mat} → ${a3.mat}`);
      expect(a1.geo, 'fp: geometry sau đổi ngoại hình').toBeLessThanOrEqual(a0.geo);
      expect(a1.mat, 'fp: material sau đổi ngoại hình').toBeLessThanOrEqual(a0.mat);
      expect(a3.geo, 'fp: geometry sau tạo / huỷ').toBeLessThanOrEqual(a2.geo);
      expect(a3.mat, 'fp: material sau tạo / huỷ').toBeLessThanOrEqual(a2.mat);
    });
  });
});

// ───────────────────────── (i) Tay góc nhìn thứ nhất ─────────────────────────

/** Vật nào dưới `root` có ma trận thế giới / morph không hữu hạn (null = ổn). */
function badMatrix(root: THREE.Object3D): string | null {
  root.updateMatrixWorld(true);
  let bad: string | null = null;
  root.traverse((o) => {
    if (bad) return;
    for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) bad = o.name || o.type;
    const inf = (o as THREE.Mesh).morphTargetInfluences;
    if (inf) for (const x of inf) if (!Number.isFinite(x)) bad = `morph ${o.name || o.type}`;
  });
  return bad;
}

/** Tâm bàn tay (camera space) ra ngoài khung nhìn: z ∈ [−1, −0.25], |x| / |z| và |y| / |z| ≤ 0.70 (null = ổn). */
function outOfView(p: THREE.Vector3): string | null {
  if (!Number.isFinite(p.x + p.y + p.z)) return 'NaN';
  if (p.z > -0.25 || p.z < -1) return `z=${p.z.toFixed(3)}`;
  if (Math.abs(p.x) / -p.z > 0.7) return `x/z=${(Math.abs(p.x) / -p.z).toFixed(3)}`;
  if (Math.abs(p.y) / -p.z > 0.7) return `y/z=${(Math.abs(p.y) / -p.z).toFixed(3)}`;
  return null;
}

describe('tay góc nhìn thứ nhất: 3 ngoại hình × mọi AnimId × đồ cầm × dt', () => {
  const LOOKS_FP: [string, AvatarLook][] = [
    ['nau_rach', monk('robe_nau_rach')],
    ['host', monk('robe_ca_sa_vien_do', 'none', true)],
    ['ao_thun', npcLook('civ_ao_thun', 'short', '#e8b48a', '#ff6f91')],
  ];
  const HELD_FP: [string, HeldItem | null][] = [
    ['tay không', null],
    ['chổi', { kind: 'broom' }],
    ['đèn (upright)', { kind: 'lamp', variant: 'lit' }],
    ['xô nước (carry)', { kind: 'water_bucket' }],
  ];
  for (const [name, look] of LOOKS_FP)
    it(`${name}: ma trận hữu hạn, hai bàn tay luôn trong khung nhìn`, () => {
      const problems: string[] = [];
      for (const [hname, item] of HELD_FP)
        for (const dt of [1 / 60, 0.1]) {
          const v = createFirstPersonView(look);
          const arms = (v as unknown as { arms: readonly { hand: THREE.Group }[] }).arms;
          v.setHeld(item);
          let t = 0;
          let prev: AnimId = 'idle';
          for (const anim of ANIM_IDS) {
            v.setAnim(anim);
            const n = Math.round(2 / dt);
            let bad: string | null = null;
            let frames = 0;
            // Chạy đủ 2 s (không dừng ở lỗi đầu — dừng sớm thì hoạt ảnh sau bắt đầu từ tư thế dở dang, báo lỗi dây chuyền).
            for (let i = 0; i < n; i++) {
              t += dt;
              v.update(dt, t, anim === 'walk' || anim === 'carry_walk' ? 3 : 0);
              let out = false;
              for (let k = 0; k < 2; k++) {
                const o = outOfView(arms[k]!.hand.position);
                if (!o) continue;
                out = true;
                bad ??= `tay ${k ? 'trái' : 'phải'} ${o} @${(i * dt).toFixed(2)}s`;
              }
              if (out) frames++;
              if (i % 10 === 9 || i === n - 1) {
                const m = badMatrix(v.root);
                if (m) bad ??= `ma trận ${m} @${(i * dt).toFixed(2)}s`;
              }
            }
            if (bad) problems.push(`${hname} dt=${dt.toFixed(3)} ${anim} (sau ${prev}): ${bad}, ${frames} khung ra ngoài`);
            prev = anim;
          }
          v.dispose();
        }
      debug(`[i] ${name}: ${problems.length ? problems.join(' | ') : 'ổn'}`);
      expect(problems).toEqual([]);
    });
});

// ───────────────────────── (j) Không mảng vải nào chĩa ra khỏi thân ─────────────────────────

/** Khoảng cách từ p tới tam giác thứ `t` (chỉ số phần tử đầu) của T: out[0] = khoảng cách, out[1] > 0 = phía mặt trước. */
function pointTri(px: number, py: number, pz: number, T: Float64Array, t: number, out: Float64Array): void {
  const ax = T[t]!;
  const ay = T[t + 1]!;
  const az = T[t + 2]!;
  const abx = T[t + 3]! - ax;
  const aby = T[t + 4]! - ay;
  const abz = T[t + 5]! - az;
  const acx = T[t + 6]! - ax;
  const acy = T[t + 7]! - ay;
  const acz = T[t + 8]! - az;
  // Điểm gần nhất trên tam giác (Ericson, Real-Time Collision Detection 5.1.5) theo toạ độ (v, w) trên cạnh ab, ac.
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  const d3 = d1 - (abx * abx + aby * aby + abz * abz);
  const d4 = d2 - (acx * abx + acy * aby + acz * abz);
  const d5 = d1 - (abx * acx + aby * acy + abz * acz);
  const d6 = d2 - (acx * acx + acy * acy + acz * acz);
  let v = 0;
  let w = 0;
  const vc = d1 * d4 - d3 * d2;
  const vb = d5 * d2 - d1 * d6;
  const va = d3 * d6 - d5 * d4;
  if (d1 <= 0 && d2 <= 0) {
    // đỉnh a
  } else if (d3 >= 0 && d4 <= d3) v = 1;
  else if (vc <= 0 && d1 >= 0 && d3 <= 0) v = d1 / (d1 - d3);
  else if (d6 >= 0 && d5 <= d6) w = 1;
  else if (vb <= 0 && d2 >= 0 && d6 <= 0) w = d2 / (d2 - d6);
  else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    v = 1 - w;
  } else {
    const den = 1 / (va + vb + vc);
    v = vb * den;
    w = vc * den;
  }
  const dx = apx - abx * v - acx * w;
  const dy = apy - aby * v - acy * w;
  const dz = apz - abz * v - acz * w;
  out[0] = Math.hypot(dx, dy, dz);
  out[1] = dx * (aby * acz - abz * acy) + dy * (abz * acx - abx * acz) + dz * (abx * acy - aby * acx);
}

/** Mặt thân nhìn thấy (tam giác phẳng), tìm khoảng cách CÓ DẤU (> 0 = ngoài thân) chính xác: lưới ô `cell` + quét hết khi xa. */
class SurfaceDist {
  private readonly map = new Map<number, number[]>();
  private readonly o = new Float64Array(2);
  constructor(
    private readonly T: Float64Array,
    private readonly cell = 0.025,
  ) {
    const C = cell;
    for (let t = 0; t < T.length; t += 9) {
      const lo = (k: number): number => Math.floor(Math.min(T[t + k]!, T[t + 3 + k]!, T[t + 6 + k]!) / C);
      const hi = (k: number): number => Math.floor(Math.max(T[t + k]!, T[t + 3 + k]!, T[t + 6 + k]!) / C);
      for (let a = lo(0); a <= hi(0); a++)
        for (let b = lo(1); b <= hi(1); b++)
          for (let c = lo(2); c <= hi(2); c++) {
            const l = this.map.get(this.key(a, b, c));
            if (l) l.push(t);
            else this.map.set(this.key(a, b, c), [t]);
          }
    }
  }

  private key(a: number, b: number, c: number): number {
    return ((a + 512) * 1024 + (b + 512)) * 1024 + (c + 512);
  }

  signed(p: THREE.Vector3): number {
    let best = Infinity;
    let sgn = 1;
    const o = this.o;
    const visit = (t: number): void => {
      pointTri(p.x, p.y, p.z, this.T, t, o);
      // Cùng khoảng cách (gần cạnh / đỉnh chung): ưu tiên mặt trước — điểm ngoài thân không bị tính nhầm là trong.
      if (o[0]! < best - 1e-9 || (o[0]! <= best + 1e-9 && o[1]! > 0)) {
        best = o[0]!;
        sgn = o[1]! > 0 ? 1 : -1;
      }
    };
    const a = Math.floor(p.x / this.cell);
    const b = Math.floor(p.y / this.cell);
    const c = Math.floor(p.z / this.cell);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) for (const t of this.map.get(this.key(a + i, b + j, c + k)) ?? []) visit(t);
    // Xa hơn một ô thì tam giác gần nhất có thể nằm ngoài 27 ô đã quét → quét hết cho đúng.
    if (best > this.cell) for (let t = 0; t < this.T.length; t += 9) visit(t);
    return best * sgn;
  }
}

/**
 * Độ nổi tối đa (m) của mỗi phần so với mặt thân NHÌN THẤY (lưới thân đã morph ngồi; gồm cả độ võng dây cung của lưới
 * ≤ ~3 mm) = số đo thật lớn nhất (10 ngoại hình × ngồi 0 / 0.5 / 1) + ~1.5 mm. Khoá = vật liệu [/loại phần cà sa][~dangler].
 */
const POKE_OUT: Record<string, number> = {
  // Lớp viền: LAYER.trim + LAYER_MAX_THICK.trim = 7.5 mm (+ võng lưới).
  hem: 0.009,
  patch: 0.0105,
  collar: 0.012,
  /** Da cổ trong cổ áo. */
  skin: 0.0078,
  /** Chỉ khâu nằm trên miếng vá. */
  stitch: 0.0125,
  // Cà sa: mặt vải SHEET_OFF 12.5 mm, viền / tường mép TRIM_OFF 15 mm (+ dày, + võng lưới ở vai trước sát cổ).
  'kasaya/sheet': 0.017,
  'kasayaTrim/strip': 0.0195,
  'kasayaTrim/wall': 0.0195,
  // Phần cà sa cố ý nằm trong / dưới lớp khác: gờ cuộn eo (trong thân), phủ đáy thân, phủ vòm hông (dưới cà sa nửa trên).
  'kasaya/tuck': 0,
  'kasaya/flange': 0.005,
  'kasaya/underlap': 0.0075,
  // NGOẠI LỆ có tên (khối nổi theo thiết kế):
  /** Đế khoen cài cà sa ở góc ngực trái. */
  'kasayaTrim/plate': 0.0245,
  /** Khoen cài cà sa ở góc ngực trái (áo không đeo dây chuyền: 'gold' chỉ có khoen). */
  'gold:khoen': 0.0335,
  /** Dây chuyền vàng: mắt xích trên lớp ngoài cùng (trên cà sa: LAYER.top), mặt dây, khoen nối. */
  'gold:dây chuyền': 0.037,
  /** Tràng hạt: hạt Ø 4.6 cm, hạt mẹ Ø 5.2 cm trên lớp ngoài cùng. */
  bead: 0.073,
  /** Đồ lủng lẳng (ở góc lúc dựng): tua chuỗi hạt treo cách ngực để đung đưa không chạm áo. */
  'tassel~dangler': 0.0725,
  /** Dây thừng xoắn + nút thắt khối tròn Ø ~4.7 cm (áo nâu rách); đai vải + nút Ø ~4.2 cm (áo lam). */
  'belt:robe_nau_rach': 0.052,
  'belt:robe_lam': 0.047,
  /** Hai đuôi đai lủng lẳng: đuôi dây thừng có tua xơ (nâu rách), đuôi vải ngắn (lam). */
  'belt~dangler:robe_nau_rach': 0.0485,
  'belt~dangler:robe_lam': 0.0265,
};

/**
 * Ngưỡng nổi của khoá `key` với ngoại hình `look`. Chuỗi hạt / dây chuyền nằm trên LAYER.top khi có cà sa, sát hơn
 * (LAYER.kasaya) khi không → ngưỡng hạ đúng chừng đó; đai theo áo; 'gold' tách khoen cà sa / dây chuyền.
 */
function pokeLimit(key: string, look: AvatarLook): number | undefined {
  const acc = robeStyle(look).sash ? 0 : LAYER.top - LAYER.kasaya;
  if (key === 'gold') return look.outfit.accessory === 'day_chuyen_vang' ? POKE_OUT['gold:dây chuyền']! - acc : POKE_OUT['gold:khoen'];
  if (key === 'bead' || key === 'tassel~dangler') return POKE_OUT[key]! - acc;
  if (key === 'belt' || key === 'belt~dangler') return POKE_OUT[`${key}:${look.outfit.robe}`];
  return POKE_OUT[key];
}

describe('không mảng vải nào chĩa ra khỏi thân (áo, cà sa, phụ kiện) khi đứng / ngồi', () => {
  it('pointTri: khoảng cách có dấu tới tam giác', () => {
    const T = Float64Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const o = new Float64Array(2);
    pointTri(0.2, 0.2, 0.01, T, 0, o);
    expect(o[0]).toBeCloseTo(0.01, 9);
    expect(o[1]).toBeGreaterThan(0);
    pointTri(0.2, 0.2, -0.01, T, 0, o);
    expect(o[1]).toBeLessThan(0);
    pointTri(2, 0, 0, T, 0, o);
    expect(o[0]).toBeCloseTo(1, 9);
    pointTri(1, 1, 0, T, 0, o);
    expect(o[0]).toBeCloseTo(Math.SQRT1_2, 9);
  });

  const looks: [string, AvatarLook][] = [
    ['nau_rach', monk('robe_nau_rach')],
    ['lam', monk('robe_lam')],
    ['trang_nau', monk('robe_trang_nau')],
    ['ca_sa_vang', monk('robe_ca_sa_vang')],
    ['ca_sa_vien_do', monk('robe_ca_sa_vien_do')],
    ['host', monk('robe_ca_sa_vien_do', 'none', true)],
    ['lam+trang_hat', monk('robe_lam', 'trang_hat')],
    ['host+trang_hat', monk('robe_lam', 'trang_hat', true)],
    ['ca_sa_vang+day_chuyen', monk('robe_ca_sa_vang', 'day_chuyen_vang')],
    ['trang_nau+day_chuyen', monk('robe_trang_nau', 'day_chuyen_vang')],
  ];
  for (const [name, look] of looks)
    it(`${name}: mọi đỉnh vải (gắn skirt / torso) cách mặt thân ≤ ngưỡng của phần đó, ngồi 0 / 0.5 / 1`, () => {
      const j = createJoints();
      const part = buildOutfit(look, j, fakeMats());
      const dangling = new Set<THREE.Object3D>();
      for (const d of part.danglers) d.obj.traverse((o) => dangling.add(o));
      const meshes = meshesUnder(j.skirt, j.torso);
      const bodyMeshes = meshes.filter((m) => matName(m) === 'lower' || matName(m) === 'upper');
      expect(bodyMeshes.length, 'lưới thân lower + upper').toBe(2);
      // Mặt NHÌN THẤY (chọn lúc đứng nghỉ, theo trọng tâm tam giác): vạt dưới dưới mép gấu áo trên, thân trên từ mép đó lên —
      // bỏ phần vạt dưới luồn vào trong thân trên và nắp đáy thân trên (khuất, nằm trong thân).
      posed(j, [part], restPose(0));
      const visible = new Map<THREE.Mesh, Set<number>>();
      for (const m of bodyMeshes) {
        const T = bakeTris(m, j.root);
        const keep = new Set<number>();
        for (let t = 0; t < T.length / 9; t++) {
          const cy = (T[t * 9 + 1]! + T[t * 9 + 4]! + T[t * 9 + 7]!) / 3;
          if (matName(m) === 'lower' ? cy < WAIST.lipY : cy >= WAIST.lipY - 0.003) keep.add(t);
        }
        visible.set(m, keep);
      }
      const worst = new Map<string, { d: number; at: string }>();
      const v = new THREE.Vector3();
      const inv = new THREE.Matrix4();
      for (const s of [0, 0.5, 1]) {
        posed(j, [part], restPose(s));
        const parts = bodyMeshes.map((m) => bakeTris(m, j.root, (t) => visible.get(m)!.has(t)));
        const all = new Float64Array(parts.reduce((n, x) => n + x.length, 0));
        parts.reduce((o, x) => (all.set(x, o), o + x.length), 0);
        const surf = new SurfaceDist(all);
        inv.copy(j.root.matrixWorld).invert();
        for (const m of meshes) {
          if (bodyMeshes.includes(m)) continue;
          const segs = m.geometry.userData.parts as { kind: string; start: number; count: number }[] | undefined;
          const idx = m.geometry.getIndex();
          const kindOf = new Map<number, string>();
          if (segs && idx) for (const p of segs) for (let q = p.start; q < p.start + p.count; q++) kindOf.set(idx.getX(q), p.kind);
          const pos = m.geometry.getAttribute('position');
          for (let i = 0; i < pos.count; i++) {
            const key = `${matName(m)}${segs ? `/${kindOf.get(i) ?? '?'}` : ''}${dangling.has(m) ? '~dangler' : ''}`;
            m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
            const d = surf.signed(v);
            const w = worst.get(key);
            if (!w || d > w.d) worst.set(key, { d, at: `ngồi ${s} (${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)})` });
          }
        }
      }
      part.dispose();
      const problems: string[] = [];
      for (const [key, w] of worst) {
        const lim = pokeLimit(key, look);
        if (lim === undefined) problems.push(`${key}: chưa có ngưỡng (đo được ${(w.d * 1000).toFixed(2)} mm ${w.at})`);
        else if (w.d > lim) problems.push(`${key}: nổi ${(w.d * 1000).toFixed(2)} mm > ${(lim * 1000).toFixed(1)} mm @${w.at}`);
      }
      debug(`[j] ${name}: ${[...worst].map(([k, w]) => `${k} ${(w.d * 1000).toFixed(2)}`).join(', ')}`);
      expect(problems).toEqual([]);
    });
});

describe('ống tay + mũ cà sa vai trái bám tay (đo trong hệ khớp: quanh trục xương −Y, vòm trên khớp)', () => {
  /** Mũ cà sa / viền mũ / lót tối ở miệng mũ (khớp shoulderL, chỉ áo có cà sa) — số đo thật + ~1.5 mm. */
  const CAP = { kasaya: 0.0825, kasayaTrim: 0.082, lining: 0.0745 } as const;
  const looks: [string, AvatarLook][] = [
    ['nau_rach', monk('robe_nau_rach')],
    ['lam', monk('robe_lam')],
    ['trang_nau', monk('robe_trang_nau')],
    ['ca_sa_vang', monk('robe_ca_sa_vang')],
    ['ca_sa_vien_do', monk('robe_ca_sa_vien_do')],
    ['host', monk('robe_ca_sa_vien_do', 'none', true)],
  ];
  for (const [name, look] of looks)
    it(`${name}: ống tay ≤ SLEEVE, mũ cà sa ngoài ống tay trên ≥ 3 mm và ôm sát`, () => {
      const j = createJoints();
      const part = buildOutfit(look, j, fakeMats());
      posed(j, [part], restPose(0));
      const wide = !!robeStyle(look).wide;
      const problems: string[] = [];
      const v = new THREE.Vector3();
      const inv = new THREE.Matrix4();
      for (const [J, child, upper] of [
        [j.shoulderL, j.elbowL, true],
        [j.shoulderR, j.elbowR, true],
        [j.elbowL, j.handL, false],
        [j.elbowR, j.handR, false],
      ] as const) {
        inv.copy(J.matrixWorld).invert();
        const far = new Map<string, number>();
        const near = new Map<string, number>();
        const walk = (o: THREE.Object3D): void => {
          if (o === child) return;
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const k = matName(m);
            const pos = m.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
              m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
              // Dưới khớp: khoảng cách tới trục xương; trên khớp (vòm vai / khuỷu): khoảng cách tới tâm khớp.
              const d = v.y <= 0 ? Math.hypot(v.x, v.z) : v.length();
              far.set(k, Math.max(far.get(k) ?? 0, d));
              if (v.y <= 0) near.set(k, Math.min(near.get(k) ?? Infinity, d));
            }
          }
          for (const c of o.children) walk(c);
        };
        walk(J);
        for (const [k, d] of far) {
          const lim = upper ? (k === 'sleeve' ? SLEEVE.upperR : CAP[k as keyof typeof CAP]) : wide ? SLEEVE.cuffWide : SLEEVE.foreR;
          if (lim === undefined) problems.push(`${J.name}/${k}: chưa có ngưỡng (${(d * 1000).toFixed(1)} mm)`);
          else if (d > lim + 2e-4) problems.push(`${J.name}/${k}: ${(d * 1000).toFixed(1)} mm > ${(lim * 1000).toFixed(1)} mm`);
          if (upper && (k === 'kasaya' || k === 'kasayaTrim') && near.get(k)! < SLEEVE.upperR + 0.003)
            problems.push(`${J.name}/${k}: mặt trong ${(near.get(k)! * 1000).toFixed(1)} mm < ống tay trên + 3 mm`);
        }
        debug(`[j2] ${name} ${J.name}: ${[...far].map(([k, d]) => `${k} ≤${(d * 1000).toFixed(1)} (≥${((near.get(k) ?? 0) * 1000).toFixed(1)})`).join(', ')}`);
      }
      part.dispose();
      expect(problems).toEqual([]);
    });
});
