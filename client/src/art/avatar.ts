// Nhân vật "hạt đậu" (lắp ráp): cây khớp rig.ts + đầu/mặt (face.ts) + thân, áo quần, cà sa (outfit.ts) + tóc/mũ/kính
// (headwear.ts) + tích trượng/quạt/dụng cụ (handheld.ts) + đồ cầm (props.ts), chuyển động lò xo (motion.ts) với morph
// ngồi + đồ lủng lẳng, đồ đứng thẳng bù góc tay/thân, tích trượng chống đất; hiệu ứng mây Tạp Niệm, hào quang, thăng cấp,
// mờ khi mất kết nối. Vật liệu riêng từng nhân vật (MatFactory), hình theo ngoại hình dùng chung giữa các nhân vật.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AnimId, HeldItem } from '@shared/index';
import type { AvatarHandle, AvatarLook, CreateAvatar } from './api';
import { kit } from './kit';
import { createHeldItemMesh, gripStyle, type GripStyle } from './props';
import { buildFace } from './character/face';
import { buildStaff, buildFan, buildTool, TOOL_FOR } from './character/handheld';
import { buildHeadwear } from './character/headwear';
import { createMotion } from './character/motion';
import { buildOutfit } from './character/outfit';
import {
  BODY,
  applyPose,
  createJoints,
  type Expression,
  type FaceDriver,
  type HandheldBuild,
  type Joints,
  type MatFactory,
  type MatOpts,
  type MotionDriver,
  type MotionInput,
  type PartBuild,
  type ToolKind,
} from './character/rig';
import { leftBusyOf } from './character/style';

export { createFirstPersonView } from './character/fpHands';
export { prostrateDip } from './character/motion';
export { SKIN_TONES, npcLook, playerLook, type NpcKind } from './character/style';

// ───────────────────────── Hình hiệu ứng dùng chung (tạo 1 lần, không dispose) ─────────────────────────

/** Mây Tạp Niệm: các cụm tròn phồng gộp 1 lưới, đáy hơi bẹt như mây hoạt hình. */
const CLOUD_GEO = ((): THREE.BufferGeometry => {
  const puffs: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of [
    [0, 0.02, 0, 0.17],
    [0.16, -0.02, 0.02, 0.13],
    [-0.16, -0.01, -0.01, 0.14],
    [0.07, 0.11, -0.03, 0.12],
    [-0.08, 0.09, 0.05, 0.11],
    [0.27, -0.05, -0.02, 0.085],
    [-0.27, -0.04, 0.03, 0.09],
  ] as const) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.deleteAttribute('uv');
    // Bẹt đáy: điểm thấp hơn tâm cụm thì ép lên.
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const py = p.getY(i);
      if (py < 0) p.setY(i, py * 0.55);
    }
    g.translate(x, y, z);
    puffs.push(g);
  }
  const m = mergeGeometries(puffs, false)!;
  for (const g of puffs) g.dispose();
  m.computeVertexNormals();
  return m;
})();

/** Tia sét gấp khúc (3 đoạn). */
const BOLT_GEO = ((): THREE.BufferGeometry => {
  const parts: THREE.BufferGeometry[] = [];
  for (const [y, rz] of [
    [-0.16, 0.5],
    [-0.28, -0.5],
    [-0.4, 0.5],
  ] as const) {
    const b = new THREE.BoxGeometry(0.03, 0.15, 0.03);
    b.deleteAttribute('uv');
    b.rotateZ(rz);
    b.translate(0, y, 0);
    parts.push(b);
  }
  const m = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return m;
})();

const RAIN_GEO = new THREE.CylinderGeometry(0.008, 0.008, 0.09, 3);
/** Vỏ hào quang (mặt trong, cộng sáng) + vòng sáng dưới chân. */
const GLOW_GEO = new THREE.CapsuleGeometry(0.52, 0.85, 6, 14);
const GLOW_RING_GEO = new THREE.RingGeometry(0.5, 0.72, 32).rotateX(-Math.PI / 2);
/** Thăng cấp: vòng sáng bay lên + cột sáng. */
const RANK_RING_GEO = new THREE.TorusGeometry(0.55, 0.035, 6, 32).rotateX(Math.PI / 2);
const RANK_BEAM_GEO = new THREE.CylinderGeometry(0.5, 0.7, 3.2, 20, 1, true);

/** Số giọt mưa khi mây có sấm. */
const RAIN_N = 8;
/** Mây lơ lửng trên đỉnh đầu (body space, đứng nghỉ). */
const CLOUD_Y = 1.98;
/** Thời lượng hiệu ứng thăng cấp (s) + đoạn xoay nảy đầu tiên. */
const RANK_T = 1.8;
const RANK_SPIN_T = 0.9;
/** Bước dời vị trí lớn hơn mức này trong 1 khung hình = dịch chuyển tức thời (không tính là bước đi). */
const TELEPORT = 1.5;
/** Đầu dưới tích trượng không thấp hơn mức này so với mặt đất. */
const STAFF_FLOOR = 0.02;
/**
 * Đứng yên thì trượt gậy trong tay cho đầu gậy chống xuống đất (tay cầm cao hơn chỗ nắm chuẩn ~0,24 m nên không trượt thì
 * gậy lơ lửng); false = chỉ nhấc lên khi đầu gậy sắp lún sàn.
 */
const STAFF_PLANT = true;
/** Đi thì nhấc đầu gậy khỏi đất chừng này (không kéo lê). */
const STAFF_WALK_LIFT = 0.05;
/**
 * Chân gậy đang chống mà bị thân kéo đi ngang (nhảy, vặn người, quét, loạng choạng, quay tại chỗ) thì nhấc lên tới mức
 * này thay vì trượt trên sàn: theo tốc độ ngang của chân gậy (m/s) từ STAFF_SKATE_V0 → STAFF_SKATE_V1.
 */
const STAFF_SKATE_LIFT = 0.06;
const STAFF_SKATE_V0 = 0.04;
const STAFF_SKATE_V1 = 0.25;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth01 = (a: number, b: number, x: number): number => easeInOut((x - a) / (b - a));
const easeInOut = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Quạt nan trong tay trái: nghiêng so với ngực (ngửa nhẹ, xoay mặt tranh ra ngoài-trước, đầu quạt chếch ra ngoài). */
const FAN_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.42, -0.32, 'YXZ'));

/**
 * Đồ cầm (props.ts) dựng từng mảnh một mesh (bình hoa 22 mesh, bó hoa 20…): gộp các mesh tĩnh cùng vật liệu thành một
 * mesh (≤ số vật liệu, thường 3–6) — bớt lần vẽ khi cả quán đều cầm ly / lễ vật. Hình gộp là của riêng đồ cầm (kit.disposeTree
 * giải phóng khi bỏ đồ); hình gốc không thuộc cache của kit thì giải phóng ngay. Gộp lỗi thì giữ nguyên nhóm đó.
 */
function mergeHeldByMaterial(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return;
    if (m.morphTargetInfluences?.length) return;
    const list = groups.get(m.material);
    if (list) list.push(m);
    else groups.set(m.material, [m]);
  });
  const rel = new THREE.Matrix4();
  for (const [material, list] of groups) {
    if (list.length < 2) continue;
    const uv = list.every((m) => !!m.geometry.getAttribute('uv'));
    const parts: THREE.BufferGeometry[] = [];
    for (const m of list) {
      const src = m.geometry;
      const g = src.index ? src.toNonIndexed() : src.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(uv && name === 'uv')) g.deleteAttribute(name);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      g.morphAttributes = {};
      g.clearGroups();
      g.applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = list[0]!.name;
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = list.some((m) => m.receiveShadow);
    for (const m of list) {
      m.removeFromParent();
      if (!m.geometry.userData.kitCached) m.geometry.dispose();
    }
    root.add(mesh);
  }
  return root;
}

/** Một phần dựng theo ngoại hình + các khoá vật liệu nó dùng (để dọn vật liệu không còn dùng khi đổi ngoại hình). */
interface Slot<T extends PartBuild | FaceDriver> {
  part: T | null;
  readonly keys: Set<string>;
}

/** Đồ lủng lẳng + góc lúc dựng. */
interface Dangle {
  readonly obj: THREE.Object3D;
  readonly gain: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  /** Treo trên đồ giữ thẳng đứng (khoen tích trượng): chỉ lắc theo phần động, không bù góc cúi/nghiêng của thân. */
  readonly upright: boolean;
}

class BeanAvatar implements AvatarHandle {
  readonly root: THREE.Group;
  readonly headAnchor: THREE.Object3D;
  private readonly j: Joints;
  private readonly motion: MotionDriver;
  /** Vật liệu riêng của nhân vật (MatFactory): khoá → vật liệu. */
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  /** Vật liệu hiệu ứng (mây sét, mưa, hào quang, thăng cấp) — cũng mờ theo setGhost, dispose cùng nhân vật. */
  private readonly fxMats = new Set<THREE.Material>();
  /** Khoá vật liệu lấy ngoài lúc dựng một phần (hiệu ứng…): không bao giờ dọn. */
  private readonly pinned = new Set<string>();
  /** Đang dựng phần nào thì ghi khoá vật liệu vào đây. */
  private rec: Set<string> | null = null;

  private readonly face: Slot<FaceDriver> = { part: null, keys: new Set() };
  private readonly outfit: Slot<PartBuild> = { part: null, keys: new Set() };
  private readonly headwear: Slot<PartBuild> = { part: null, keys: new Set() };
  /** Tay trái cầm thường trực (tích trượng / quạt). */
  private readonly left: Slot<HandheldBuild> = { part: null, keys: new Set() };
  /** Dụng cụ làm việc ở tay phải (rìu, dùi mõ…) khi tay trống. */
  private readonly tool: Slot<HandheldBuild> = { part: null, keys: new Set() };
  private toolKind: ToolKind | null = null;
  private sitMeshes: THREE.Mesh[] = [];
  private dangles: Dangle[] = [];

  private look: AvatarLook;
  private leftBusy: 'staff' | 'fan' | null = null;
  private anim: AnimId = 'idle';
  private animTime = 0;
  private held: HeldItem | null = null;
  private heldObj: THREE.Object3D | null = null;
  private grip: GripStyle | null = null;
  private tapNiem = 0;
  private drunk = 0;
  private ghost = false;
  private glowColor: string | null = null;
  private time = 0;

  // Hiệu ứng.
  private readonly cloud = new THREE.Group();
  private readonly cloudMat: THREE.MeshStandardMaterial;
  private readonly bolt: THREE.Mesh;
  private readonly rain: THREE.Mesh[] = [];
  private readonly rainSpeed: number[] = [];
  private boltT = 0;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly glowRing: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly rankFx = new THREE.Group();
  private rankRings: THREE.Mesh[] = [];
  private rankBeam: THREE.Mesh | null = null;
  private rankT = -1;

  // Đầu vào chuyển động (dùng lại mỗi khung hình) + vận tốc thật suy từ vị trí root.
  private readonly inp: MotionInput = { anim: 'idle', animTime: 0, speed: 0, moveYaw: null, grip: null, leftBusy: null, tool: false, drunk: 0 };
  private vx = 0;
  private vz = 0;
  private lastX = 0;
  private lastZ = 0;
  private hasLast = false;
  /** Tư thế khung trước (áp ngay cho phần vừa dựng lại khi đổi ngoại hình). */
  private lastSit = 0;
  private lastSwayX = 0;
  private lastSwayZ = 0;
  private lastUprX = 0;
  private lastUprZ = 0;
  private lastExpr: Expression = 'neutral';
  private lastWrist = 0;
  /** Góc cổ tay trái trung bình (lọc thấp) — phần lệch khỏi nó là nhịp phe phẩy của quạt. */
  private wristRef = 0;
  private wristInit = false;
  /** Độ trượt tích trượng trong tay (m, làm mượt). */
  private staffSlide = 0;
  private staffInit = false;
  /** Vị trí ngang (thế giới) của chân gậy khung trước + tốc độ ngang đã làm mượt (m/s). */
  private staffFootX = 0;
  private staffFootZ = 0;
  private staffSkate = 0;

  // Biến tạm (không cấp phát trong vòng lặp khung hình).
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly va = new THREE.Vector3();
  private readonly vb = new THREE.Vector3();
  private readonly qc = new THREE.Quaternion();
  private readonly qw = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  constructor(look: AvatarLook) {
    this.look = look;
    const j = createJoints();
    this.j = j;
    this.root = j.root;
    this.headAnchor = j.headAnchor;
    this.motion = createMotion();

    // Mây Tạp Niệm: gắn khớp turn (không nghiêng/dẹt theo thân), độ cao bám theo nhún + ngồi.
    this.cloud.name = 'tapNiem';
    this.cloud.visible = false;
    j.turn.add(this.cloud);
    this.cloudMat = this.mat('cloud', '#8a8c98', { roughness: 1 });
    const cloudMesh = new THREE.Mesh(CLOUD_GEO, this.cloudMat);
    cloudMesh.castShadow = false;
    this.cloud.add(cloudMesh);
    const boltMat = this.fx(new THREE.MeshBasicMaterial({ color: '#fff27a' }));
    this.bolt = new THREE.Mesh(BOLT_GEO, boltMat);
    this.bolt.visible = false;
    this.cloud.add(this.bolt);
    const rainMat = this.fx(new THREE.MeshBasicMaterial({ color: '#8fc9ff', transparent: true, opacity: 0.7 }));
    for (let i = 0; i < RAIN_N; i++) {
      const d = new THREE.Mesh(RAIN_GEO, rainMat);
      d.position.set((Math.random() - 0.5) * 0.4, -0.2 - Math.random() * 0.9, (Math.random() - 0.5) * 0.28);
      d.visible = false;
      this.cloud.add(d);
      this.rain.push(d);
      this.rainSpeed.push(1.7 + Math.random());
    }

    // Hào quang: vỏ phát sáng quanh thân (nhún theo thân) + vòng sáng dưới chân.
    this.glowMat = this.fx(
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false }),
    );
    this.glow = new THREE.Mesh(GLOW_GEO, this.glowMat);
    this.glow.position.y = 0.95;
    this.glow.visible = false;
    j.bounce.add(this.glow);
    this.ringMat = this.fx(
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.glowRing = new THREE.Mesh(GLOW_RING_GEO, this.ringMat);
    this.glowRing.position.y = 0.04;
    this.glowRing.visible = false;
    this.root.add(this.glowRing);
    this.rankFx.visible = false;
    this.root.add(this.rankFx);

    this.buildLook();
    this.fillInput(0);
    this.motion.snap(this.inp);
    this.update(0, 0, 0);
    // Engine đặt vị trí thật sau khi tạo: khung đầu tiên chỉ ghi nhận vị trí, không coi là bước đi.
    this.hasLast = false;
  }

  // ───────────────────────── Vật liệu ─────────────────────────

  /** MatFactory: cùng khoá → cùng vật liệu, gọi lại thì đặt lại màu + thông số (như vừa tạo). Màu trơn, không vân thế giới. */
  private readonly mat: MatFactory = (key: string, color: string, o: MatOpts = {}): THREE.MeshStandardMaterial => {
    if (this.rec) this.rec.add(key);
    else this.pinned.add(key);
    let m = this.mats.get(key);
    if (!m) {
      m = kit.matUnique(color, { surface: 'none' });
      m.name = key;
      this.mats.set(key, m);
    }
    m.color.set(color);
    m.emissive.set(o.emissive ?? '#000000');
    m.emissiveIntensity = o.ei ?? (o.emissive ? 1 : 0);
    m.roughness = o.roughness ?? 0.88;
    m.metalness = o.metalness ?? 0;
    const map = o.map ?? null;
    const side = o.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
    if (m.map !== map || m.side !== side) {
      m.map = map;
      m.side = side;
      m.needsUpdate = true;
    }
    m.userData.baseOpacity = o.opacity ?? 1;
    m.userData.baseTransparent = o.transparent ?? false;
    this.applyGhost(m);
    return m;
  };

  /** Ghi nhận vật liệu hiệu ứng (mờ theo setGhost, dispose cùng nhân vật). */
  private fx<T extends THREE.Material>(m: T): T {
    m.userData.baseOpacity = m.opacity;
    m.userData.baseTransparent = m.transparent;
    this.fxMats.add(m);
    this.applyGhost(m);
    return m;
  }

  /** Mất kết nối: mờ còn ≤ 0.38; bình thường trả lại độ trong suốt gốc. */
  private applyGhost(m: THREE.Material): void {
    const bo = m.userData.baseOpacity as number;
    const t = this.ghost || (m.userData.baseTransparent as boolean);
    if (m.transparent !== t) {
      m.transparent = t;
      m.needsUpdate = true;
    }
    m.opacity = this.ghost ? Math.min(0.38, bo) : bo;
  }

  /** Dựng một phần, ghi lại khoá vật liệu nó dùng. Phần nào lỗi thì bỏ phần đó (ghi console) — nhân vật vẫn được tạo. */
  private record<T>(keys: Set<string>, make: () => T): T | null {
    keys.clear();
    this.rec = keys;
    try {
      return make();
    } catch (e) {
      console.error('[avatar] dựng phần nhân vật lỗi', e);
      return null;
    } finally {
      this.rec = null;
    }
  }

  /** Bỏ vật liệu không phần nào còn dùng (đổi ngoại hình liên tục không làm phình bộ nhớ). */
  private pruneMats(): void {
    for (const [key, m] of this.mats) {
      if (this.pinned.has(key)) continue;
      if (this.face.keys.has(key) || this.outfit.keys.has(key) || this.headwear.keys.has(key)) continue;
      if (this.left.keys.has(key) || this.tool.keys.has(key)) continue;
      m.dispose();
      this.mats.delete(key);
    }
  }

  // ───────────────────────── Dựng theo ngoại hình ─────────────────────────

  private buildLook(): void {
    const look = this.look;
    const j = this.j;
    this.face.part = this.record(this.face.keys, () => buildFace(j.head, look, this.mat));
    this.outfit.part = this.record(this.outfit.keys, () => buildOutfit(look, j, this.mat));
    this.headwear.part = this.record(this.headwear.keys, () => buildHeadwear(look, j.head, this.mat));
    this.leftBusy = leftBusyOf(look);
    this.left.part = null;
    if (this.leftBusy) {
      const busy = this.leftBusy;
      const part = this.record(this.left.keys, () => (busy === 'staff' ? buildStaff(this.mat) : buildFan(this.mat)));
      if (part) j.itemL.add(part.root);
      this.left.part = part;
    } else {
      this.left.keys.clear();
    }
    this.wristInit = false;
    this.staffInit = false;
    this.collectParts();
  }

  private disposeLook(): void {
    for (const s of [this.face, this.outfit, this.headwear, this.left] as const) {
      s.part?.dispose();
      s.part = null;
    }
    this.resetItem(this.j.itemL);
  }

  /** Gom mesh có morph 'sit' + đồ lủng lẳng của mọi phần đang gắn (chỉ chạy khi dựng lại). */
  private collectParts(): void {
    const sit: THREE.Mesh[] = [];
    const dangles: Dangle[] = [];
    for (const p of [this.outfit.part, this.headwear.part, this.left.part, this.tool.part]) {
      if (!p) continue;
      for (const m of p.sitMorph) {
        if (!m.morphTargetInfluences) m.updateMorphTargets();
        if (m.morphTargetInfluences && m.morphTargetInfluences.length > 0) sit.push(m);
      }
      const upright = p === this.left.part && this.leftBusy === 'staff';
      for (const d of p.danglers) dangles.push({ obj: d.obj, gain: d.gain, bx: d.obj.rotation.x, by: d.obj.rotation.y, bz: d.obj.rotation.z, upright });
    }
    this.sitMeshes = sit;
    this.dangles = dangles;
    this.applySecondary(this.lastSit, this.lastSwayX, this.lastSwayZ, this.lastUprX, this.lastUprZ);
  }

  /** Morph ngồi + đồ lủng lẳng theo tư thế (uprX/Z: góc lắc cho đồ treo trên vật giữ thẳng đứng). */
  private applySecondary(sit: number, swayX: number, swayZ: number, uprX: number, uprZ: number): void {
    for (const m of this.sitMeshes) m.morphTargetInfluences![0] = sit;
    for (const d of this.dangles) {
      const x = d.upright ? uprX : swayX;
      const z = d.upright ? uprZ : swayZ;
      d.obj.rotation.set(d.bx + x * d.gain, d.by, d.bz + z * d.gain);
    }
  }

  /** Trả khớp cầm đồ về mặc định (không xoay, không bù tỉ lệ). */
  private resetItem(item: THREE.Group): void {
    item.quaternion.identity();
    item.scale.set(1, 1, 1);
  }

  setLook(look: AvatarLook): void {
    this.disposeLook();
    this.look = look;
    this.buildLook();
    this.pruneMats();
    // Áp ngay tư thế đang có cho phần mới (khớp vẫn giữ tư thế khung trước): mặt, hướng đồ tay trái.
    this.face.part?.update(0, this.time, this.lastExpr, this.drunk);
    this.holdItems(this.lastWrist, this.j.bounce.position.y, 0);
  }

  // ───────────────────────── Đồ cầm, hoạt ảnh ─────────────────────────

  setHeld(item: HeldItem | null): void {
    const same = item === this.held || (!!item && !!this.held && item.kind === this.held.kind && item.variant === this.held.variant);
    if (same && (!item || this.heldObj)) {
      this.held = item;
      return;
    }
    this.held = item;
    if (this.heldObj) {
      this.heldObj.removeFromParent();
      kit.disposeTree(this.heldObj);
      this.heldObj = null;
    }
    this.resetItem(this.j.itemR);
    this.grip = item ? gripStyle(item.kind) : null;
    if (item) {
      const obj = mergeHeldByMaterial(createHeldItemMesh(item));
      (this.grip === 'carry' ? this.j.carry : this.j.itemR).add(obj);
      this.heldObj = obj;
    }
    this.refreshTool();
  }

  setAnim(anim: AnimId): void {
    if (anim === this.anim) return;
    this.anim = anim;
    this.animTime = 0;
    this.refreshTool();
  }

  /** Dụng cụ làm việc theo hoạt ảnh — chỉ hiện khi tay phải trống. */
  private refreshTool(): void {
    const kind = this.held ? null : (TOOL_FOR[this.anim] ?? null);
    if (kind === this.toolKind) return;
    this.tool.part?.dispose();
    this.tool.part = null;
    this.toolKind = kind;
    if (kind) {
      const part = this.record(this.tool.keys, () => buildTool(kind, this.mat));
      if (part) this.j.itemR.add(part.root);
      this.tool.part = part;
    } else {
      this.tool.keys.clear();
    }
    this.collectParts();
  }

  // ───────────────────────── Hiệu ứng ─────────────────────────

  setTapNiem(level: number): void {
    this.tapNiem = level;
    this.cloud.visible = level >= 50;
    const storm = level >= 80;
    this.cloudMat.color.set(storm ? '#4d4f5c' : '#8a8c98');
    for (const d of this.rain) d.visible = storm;
    if (!storm) this.bolt.visible = false;
  }

  setDrunk(level: number): void {
    this.drunk = Math.min(100, Math.max(0, level || 0));
  }

  setGhost(ghost: boolean): void {
    if (ghost === this.ghost) return;
    this.ghost = ghost;
    for (const m of this.mats.values()) this.applyGhost(m);
    for (const m of this.fxMats) this.applyGhost(m);
  }

  setGlow(color: string | null): void {
    this.glowColor = color;
    this.glow.visible = !!color;
    this.glowRing.visible = !!color;
    if (color) {
      this.glowMat.color.set(color);
      this.ringMat.color.set(color);
    }
  }

  playRankUp(): void {
    if (!this.rankBeam) {
      for (let i = 0; i < 3; i++) {
        const m = this.fx(new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        const ring = new THREE.Mesh(RANK_RING_GEO, m);
        ring.userData.delay = i * 0.22;
        this.rankFx.add(ring);
        this.rankRings.push(ring);
      }
      const bm = this.fx(
        new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
      );
      this.rankBeam = new THREE.Mesh(RANK_BEAM_GEO, bm);
      this.rankBeam.position.y = 1.6;
      this.rankFx.add(this.rankBeam);
    }
    this.rankT = 0;
    this.rankFx.visible = true;
    this.updateRankFx(0);
  }

  /** Vòng sáng bay lên + cột sáng loé rồi tắt. */
  private updateRankFx(r: number): void {
    const beam = this.rankBeam!;
    (beam.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 * (1 - r / 1.6));
    beam.scale.set(1 + r * 0.3, 1, 1 + r * 0.3);
    for (const ring of this.rankRings) {
      const lt = Math.max(0, r - (ring.userData.delay as number));
      ring.position.y = 0.1 + lt * 1.9;
      ring.scale.setScalar(1 + lt * 0.8);
      (ring.material as THREE.MeshBasicMaterial).opacity = r < (ring.userData.delay as number) ? 0 : Math.max(0, 1 - lt / 1.2);
    }
  }

  // ───────────────────────── Mỗi khung hình ─────────────────────────

  update(dt: number, time: number, speed: number): void {
    const h = dt > 0 ? dt : 0;
    this.time = time;
    this.animTime += h;
    if (this.rankT >= 0) this.rankT += h;
    this.trackVelocity(h);
    this.fillInput(speed);
    const out = this.motion.update(h, time, this.inp);
    const P = out.pose;
    const j = this.j;
    applyPose(j, P);

    // Thăng cấp: xoay một vòng + bật nảy + phồng lên rồi xẹp (chồng lên tư thế).
    if (this.rankT >= 0 && this.rankT < RANK_SPIN_T) {
      const u = this.rankT / RANK_SPIN_T;
      const bump = Math.sin(u * Math.PI);
      j.bounce.scale.multiplyScalar(1 + bump * 0.22);
      j.bounce.position.y += bump * 0.28;
      j.turn.rotation.y += easeInOut(u) * Math.PI * 2;
    }

    this.lastSit = P.sit;
    this.lastSwayX = P.swayX;
    this.lastSwayZ = P.swayZ;
    // motion.ts: sway = −0.5·(góc cúi/nghiêng thân + đầu) + phần động. Tích trượng giữ thẳng đứng nên bỏ phần bù tĩnh —
    // khoen không chĩa ngang khi lạy / cúi chào, chỉ còn rung theo nhịp động tác.
    this.lastUprX = clampAbs(P.swayX + 0.5 * (P.lean + P.bend + P.headX), 0.75);
    this.lastUprZ = clampAbs(P.swayZ + 0.5 * (P.roll + P.chestRoll + P.headZ), 0.75);
    this.applySecondary(P.sit, P.swayX, P.swayZ, this.lastUprX, this.lastUprZ);
    this.lastExpr = out.expression;
    this.lastWrist = P.lWrist;
    this.face.part?.update(h, time, out.expression, this.drunk);
    this.holdItems(P.lWrist, j.bounce.position.y, h);
    this.updateEffects(h, time, P.hipsY);
  }

  /** Vận tốc thật (m/s, làm mượt) suy từ vị trí root; dịch chuyển tức thời thì bỏ qua. */
  private trackVelocity(h: number): void {
    const p = this.root.position;
    if (!this.hasLast) {
      this.vx = this.vz = 0;
      this.hasLast = true;
    } else if (h > 0) {
      const dx = p.x - this.lastX;
      const dz = p.z - this.lastZ;
      if (dx * dx + dz * dz > TELEPORT * TELEPORT) {
        this.vx = this.vz = 0;
      } else {
        const k = Math.min(1, h * 12);
        this.vx += (dx / h - this.vx) * k;
        this.vz += (dz / h - this.vz) * k;
      }
    }
    this.lastX = p.x;
    this.lastZ = p.z;
  }

  private fillInput(speed: number): void {
    const inp = this.inp;
    const sp = Number.isFinite(speed) && speed > 0 ? speed : 0;
    inp.anim = this.anim;
    inp.animTime = this.animTime;
    inp.speed = sp;
    inp.moveYaw = null;
    if (sp > 0.4 && this.vx * this.vx + this.vz * this.vz > 0.09) {
      // Hướng bước so với hướng nhìn: đổi vận tốc thế giới về hệ của root (mặt nhìn +Z, +X = bên trái nhân vật).
      const ry = this.root.rotation.y;
      const c = Math.cos(ry);
      const s = Math.sin(ry);
      inp.moveYaw = Math.atan2(this.vx * c - this.vz * s, this.vx * s + this.vz * c);
    }
    inp.grip = this.grip;
    inp.leftBusy = this.leftBusy;
    inp.tool = this.tool.part !== null;
    inp.drunk = this.drunk;
  }

  /**
   * Hướng ngang (yaw thế giới) của một khung có quaternion thế giới `q`: chiếu trục +Z và +Y xuống mặt đất rồi cộng lại —
   * cúi rạp (+Z chúc xuống) hay ngửa ra sau vẫn ra đúng hướng mặt.
   */
  private headingOf(q: THREE.Quaternion): number {
    const z = this.va.set(0, 0, 1).applyQuaternion(q);
    const zx = z.x;
    const zz = z.z;
    const y = this.vb.set(0, 1, 0).applyQuaternion(q);
    return Math.atan2(zx + y.x, zz + y.z);
  }

  /**
   * Quaternion thế giới của khung hông: root · turn · hips. Bỏ qua tỉ lệ nhún của `bounce` — nó co giãn đều theo phương
   * ngang nên không đổi hướng nằm ngang, và đồ giữ thẳng đứng chỉ quay quanh trục đứng nên tỉ lệ đó giao hoán được.
   */
  private hipsQuat(out: THREE.Quaternion): THREE.Quaternion {
    const j = this.j;
    this.root.getWorldQuaternion(out);
    return out.multiply(j.turn.quaternion).multiply(j.hips.quaternion);
  }

  /**
   * Đặt khớp cầm `item` để đồ trong đó có quaternion thế giới `world`: quaternion thế giới của bàn tay = hông · ngực · vai ·
   * khuỷu · bàn tay, rồi bù ngược. Không phụ thuộc góc tay/thân.
   */
  private orientItem(item: THREE.Group, left: boolean, hips: THREE.Quaternion, world: THREE.Quaternion): void {
    const j = this.j;
    const hand = this.qb.copy(hips).multiply(j.chest.quaternion);
    hand.multiply(left ? j.shoulderL.quaternion : j.shoulderR.quaternion);
    hand.multiply(left ? j.elbowL.quaternion : j.elbowR.quaternion);
    hand.multiply(left ? j.handL.quaternion : j.handR.quaternion);
    item.quaternion.copy(hand.invert().multiply(world));
  }

  /**
   * Đồ cầm giữ hướng riêng (bù góc tay + thân): tích trượng thẳng đứng theo hướng hông, không co giãn theo nhún, trượt
   * trong tay để đầu dưới chống xuống đất khi đứng (nhấc nhẹ khi đi, theo người khi bật nhảy) và không bao giờ lún sàn;
   * quạt nghiêng cố định so với ngực, phe phẩy theo nhịp cổ tay; vật 'upright' ở tay phải (đèn, nhang, ly…) thẳng đứng
   * theo hướng ngực.
   */
  private holdItems(lWrist: number, bounceY: number, h: number): void {
    const j = this.j;
    const lp = this.left.part;
    const rightUpright = this.grip === 'upright' && this.heldObj !== null;
    if (!lp && !rightUpright) return;
    const hips = this.hipsQuat(this.qa);
    if (lp && this.leftBusy === 'staff') {
      this.orientItem(j.itemL, true, hips, this.qw.setFromAxisAngle(this.yAxis, this.headingOf(hips)));
      const bs = j.bounce.scale;
      j.itemL.scale.set(1 / bs.x, 1 / bs.y, 1 / bs.z);
      j.itemL.getWorldPosition(this.va);
      const floor = this.root.matrixWorld.elements[13]!;
      // need = độ trượt để đầu gậy vừa chạm sàn (+ khe STAFF_FLOOR); âm = gậy tụt xuống trong tay.
      const need = floor + STAFF_FLOOR - (this.va.y - lp.below);
      // Gậy luôn thẳng đứng theo thế giới → vị trí ngang của chân gậy = vị trí ngang của chỗ nắm. Tăng nhanh, giảm chậm.
      if (h > 0 && this.staffInit) {
        const dx = this.va.x - this.staffFootX;
        const dz = this.va.z - this.staffFootZ;
        const v = dx * dx + dz * dz > TELEPORT * TELEPORT ? 0 : Math.sqrt(dx * dx + dz * dz) / h;
        this.staffSkate += (v - this.staffSkate) * Math.min(1, h * (v > this.staffSkate ? 12 : 4));
      } else {
        this.staffSkate = 0;
      }
      this.staffFootX = this.va.x;
      this.staffFootZ = this.va.z;
      const walk = STAFF_WALK_LIFT * smooth01(0.4, 1.5, this.inp.speed);
      const lift = Math.max(walk, STAFF_SKATE_LIFT * smooth01(STAFF_SKATE_V0, STAFF_SKATE_V1, this.staffSkate));
      const target = STAFF_PLANT ? need + lift + Math.max(0, bounceY) : Math.max(0, need);
      this.staffSlide = h > 0 && this.staffInit ? this.staffSlide + (target - this.staffSlide) * Math.min(1, h * 10) : target;
      this.staffInit = true;
      lp.root.position.y = Math.max(this.staffSlide, need);
    } else if (lp) {
      if (!this.wristInit) {
        this.wristRef = lWrist;
        this.wristInit = true;
      }
      this.wristRef += wrapPi(lWrist - this.wristRef) * Math.min(1, h * 1.5);
      const flick = clampAbs(wrapPi(lWrist - this.wristRef), 0.7);
      const w = this.qw.copy(hips).multiply(j.chest.quaternion).multiply(FAN_TILT);
      w.multiply(this.qc.setFromAxisAngle(this.yAxis, flick));
      this.orientItem(j.itemL, true, hips, w);
    }
    if (rightUpright) {
      const chest = this.qc.copy(hips).multiply(j.chest.quaternion);
      this.orientItem(j.itemR, false, hips, this.qw.setFromAxisAngle(this.yAxis, this.headingOf(chest)));
    }
  }

  private updateEffects(h: number, time: number, hipsY: number): void {
    if (this.cloud.visible) {
      this.cloud.position.y = this.j.bounce.position.y + (hipsY - BODY.hipsY) + CLOUD_Y + Math.sin(time * 1.6) * 0.05;
      this.cloud.rotation.y = (this.cloud.rotation.y + h * 0.3) % (Math.PI * 2);
      if (this.tapNiem >= 80) {
        this.boltT -= h;
        if (this.boltT <= 0) {
          this.bolt.visible = !this.bolt.visible;
          this.boltT = this.bolt.visible ? 0.08 + Math.random() * 0.1 : 0.6 + Math.random() * 2;
        }
        for (let i = 0; i < this.rain.length; i++) {
          const d = this.rain[i]!;
          d.position.y -= h * this.rainSpeed[i]!;
          if (d.position.y < -1.25) d.position.y = -0.18;
        }
      } else {
        this.bolt.visible = false;
      }
    }
    if (this.glowColor) {
      this.glowMat.opacity = (0.2 + Math.sin(time * 3) * 0.08) * (this.ghost ? 0.6 : 1);
      this.glowRing.rotation.y = (this.glowRing.rotation.y + h * 0.8) % (Math.PI * 2);
      this.glowRing.scale.setScalar(1 + Math.sin(time * 2.5) * 0.06);
    }
    if (this.rankT >= 0) {
      if (this.rankT > RANK_T) {
        this.rankT = -1;
        this.rankFx.visible = false;
      } else {
        this.updateRankFx(this.rankT);
      }
    }
  }

  dispose(): void {
    this.disposeLook();
    this.tool.part?.dispose();
    this.tool.part = null;
    this.toolKind = null;
    if (this.heldObj) {
      this.heldObj.removeFromParent();
      kit.disposeTree(this.heldObj);
      this.heldObj = null;
    }
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    for (const m of this.fxMats) m.dispose();
    this.fxMats.clear();
    this.sitMeshes = [];
    this.dangles = [];
    this.root.removeFromParent();
  }
}

/** Góc về (−π, π]. */
function wrapPi(a: number): number {
  const t = Math.PI * 2;
  return a - t * Math.round(a / t);
}

const clampAbs = (x: number, m: number): number => (x < -m ? -m : x > m ? m : x);

export const createAvatar: CreateAvatar = (look: AvatarLook): AvatarHandle => new BeanAvatar(look);
