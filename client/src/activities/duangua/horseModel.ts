// Mô hình ngựa đua low-poly cho đường đua mô hình (đơn vị mét): hình khối gộp sẵn MỘT lần, dùng chung cho cả 6 ngựa — mỗi
// ngựa chỉ khác vật liệu (lông, bờm, áo nài). Hệ trục cục bộ: +X hướng đầu ngựa, +Y lên, gốc ở mặt đường dưới bụng.
// Thân cứng (thân, ngực, mông, cổ, đầu, tai, bờm, nài) gộp theo "ô màu"; phần màu cố định (mặt, quần, ủng, mắt, khăn yên,
// dây cương) tô bằng màu đỉnh nên cả 6 ngựa chung 1 hình + 1 vật liệu; 4 chân + đuôi là khớp riêng để đánh nhịp. Màu đỉnh
// của phần lông là trắng → vật liệu lông (vertexColors) nhuộm đúng màu từng ngựa, móng tối nhờ màu đỉnh sẫm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HORSES } from '@shared/activities/duangua';

/** Tỉ lệ chung: ngựa dài ~0,37 m, đỉnh mũ nài ~0,30 m (xà cổng xuất phát ở 0,44 m, làn rộng 0,42 m). */
export const HORSE_SCALE = 0.92;
/** Mũi ngựa (đầu mõm) cách gốc (đã nhân tỉ lệ) — vạch xuất phát / vạch đích tính theo mũi. */
export const NOSE = 0.242 * HORSE_SCALE;
/** Khớp vai / hông của 4 chân: trước trái, trước phải, sau trái, sau phải (chưa nhân tỉ lệ). */
export const LEG_PIVOTS: readonly (readonly [number, number, number])[] = [
  [0.072, 0.148, -0.025],
  [0.072, 0.148, 0.025],
  [-0.078, 0.148, -0.027],
  [-0.078, 0.148, 0.027],
];
/** Gốc đuôi (chưa nhân tỉ lệ). */
export const TAIL_PIVOT: readonly [number, number, number] = [-0.125, 0.2, 0];
/** Ngựa Ô Truy: đen tuyền, bốn vó trắng. Đích Lư: đốm trắng trên trán. Ngựa Sắt Gióng: lông đồng ánh kim, bờm lửa. */
const O_TRUY = 2;
const DICH_LU = 3;
const GIONG = 5;

export interface HorseGeometry {
  /** Phần lông của thân cứng (màu đỉnh trắng). */
  coat: THREE.BufferGeometry;
  mane: THREE.BufferGeometry;
  /** Áo, tay áo, mũ nài. */
  silk: THREE.BufferGeometry;
  /** Phần màu cố định (màu đỉnh). */
  fixed: THREE.BufferGeometry;
  /** 1 chân, gốc ở khớp: ống chân trắng (nhuộm theo lông) + móng sẫm. */
  leg: THREE.BufferGeometry;
  /** Chân Ô Truy: ống chân sẵn màu lông, móng trắng (vật liệu trắng). */
  legWhiteHoof: THREE.BufferGeometry;
  /** Đuôi, gốc ở TAIL_PIVOT. */
  tail: THREE.BufferGeometry;
  /** Đốm trắng trán (Đích Lư). */
  blaze: THREE.BufferGeometry;
  /** Bóng mờ dưới bụng. */
  shadow: THREE.BufferGeometry;
}

export interface HorseMaterials {
  coat: THREE.MeshStandardMaterial;
  leg: THREE.MeshStandardMaterial;
  mane: THREE.MeshStandardMaterial;
  silk: THREE.MeshStandardMaterial;
}

const WHITE = '#ffffff';
const SKIN = '#e8bf94';
const PANTS = '#f4f1e6';
const BOOT = '#2a1d10';
const HOOF = '#3a302a';
const DARK = '#141210';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Một mảnh hình: chép `src`, xoay rz (rồi ry), co giãn s, đặt ở (x, y, z), tô màu đỉnh `color`. `src` bị hủy sau khi dùng. */
function part(
  src: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  o: { rz?: number; ry?: number; s?: readonly [number, number, number]; color?: string } = {},
): THREE.BufferGeometry {
  const g = src.clone();
  src.dispose();
  tmpE.set(0, o.ry ?? 0, o.rz ?? 0);
  tmpQ.setFromEuler(tmpE);
  const s = o.s ?? [1, 1, 1];
  tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s[0], s[1], s[2]));
  g.applyMatrix4(tmpM);
  tmpC.set(o.color ?? WHITE);
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    col[i] = tmpC.r;
    col[i + 1] = tmpC.g;
    col[i + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Cặp đối xứng trái/phải (z và −z). */
const pair = (make: (side: number) => THREE.BufferGeometry): THREE.BufferGeometry[] => [make(-1), make(1)];

function legParts(shin: string, hoof: string): THREE.BufferGeometry {
  return merge([
    part(new THREE.CylinderGeometry(0.017, 0.012, 0.075, 7), 0, -0.035, 0, { color: shin }),
    part(new THREE.CylinderGeometry(0.0095, 0.0085, 0.06, 6), 0, -0.1, 0, { color: shin }),
    part(new THREE.CylinderGeometry(0.011, 0.012, 0.018, 7), 0, -0.139, 0, { color: hoof }),
  ]);
}

/** Dựng bộ hình dùng chung cho cả đàn (gọi 1 lần mỗi lần vào map, hủy khi rời). */
export function buildHorseGeometry(): HorseGeometry {
  const HEAD_RZ = -(Math.PI / 2 + 0.55);
  const coat = merge([
    part(new THREE.CapsuleGeometry(0.05, 0.13, 4, 10), 0, 0.17, 0, { rz: Math.PI / 2, s: [0.95, 1, 0.82] }),
    part(new THREE.SphereGeometry(0.052, 10, 8), 0.075, 0.163, 0, { s: [1, 1.05, 0.84] }),
    part(new THREE.SphereGeometry(0.054, 10, 8), -0.078, 0.176, 0, { s: [1.05, 1, 0.9] }),
    part(new THREE.CylinderGeometry(0.026, 0.04, 0.13, 10), 0.118, 0.232, 0, { rz: -0.75, s: [1, 1, 0.8] }),
    part(new THREE.SphereGeometry(0.024, 8, 6), 0.16, 0.282, 0, { s: [1, 1, 0.8] }),
    part(new THREE.CylinderGeometry(0.016, 0.025, 0.095, 8), 0.192, 0.268, 0, { rz: HEAD_RZ }),
    ...pair((sd) => part(new THREE.ConeGeometry(0.009, 0.032, 6), 0.155, 0.312, 0.012 * sd, { rz: 0.25 })),
  ]);
  const mane = merge([
    part(new THREE.BoxGeometry(0.016, 0.13, 0.012), 0.094, 0.258, 0, { rz: -0.75 }),
    part(new THREE.BoxGeometry(0.02, 0.016, 0.01), 0.165, 0.304, 0, { rz: -0.4 }),
  ]);
  const silk = merge([
    part(new THREE.BoxGeometry(0.056, 0.064, 0.05), 0.008, 0.262, 0, { rz: -0.65 }),
    ...pair((sd) => part(new THREE.BoxGeometry(0.052, 0.015, 0.015), 0.05, 0.252, 0.027 * sd, { rz: -0.25 })),
    part(new THREE.SphereGeometry(0.0205, 10, 8), 0.04, 0.306, 0, { s: [1, 0.85, 1] }),
    part(new THREE.BoxGeometry(0.02, 0.004, 0.026), 0.062, 0.302, 0),
  ]);
  const fixed = merge([
    part(new THREE.SphereGeometry(0.017, 8, 6), 0.046, 0.299, 0, { color: SKIN }),
    ...pair((sd) => part(new THREE.BoxGeometry(0.048, 0.017, 0.017), -0.002, 0.232, 0.038 * sd, { rz: 0.55, color: PANTS })),
    ...pair((sd) => part(new THREE.BoxGeometry(0.026, 0.02, 0.016), 0.016, 0.21, 0.042 * sd, { rz: -0.3, color: BOOT })),
    part(new THREE.BoxGeometry(0.07, 0.008, 0.112), -0.004, 0.218, 0, { color: PANTS }),
    ...pair((sd) => part(new THREE.SphereGeometry(0.006, 6, 4), 0.183, 0.282, 0.016 * sd, { color: DARK })),
    ...pair((sd) => part(new THREE.BoxGeometry(0.075, 0.003, 0.003), 0.12, 0.262, 0.02 * sd, { rz: 0.2, color: BOOT })),
    part(new THREE.SphereGeometry(0.012, 8, 6), 0.229, 0.246, 0, { s: [1.1, 0.9, 0.9], color: '#3a2a22' }),
  ]);
  // Đuôi rủ về sau-xuống: hướng d = (−0,55; −0,83), đáy nón ở gốc đuôi.
  const tail = part(new THREE.ConeGeometry(0.022, 0.13, 7), -0.55 * 0.065, -0.83 * 0.065, 0, { rz: 2.556 });
  const blaze = part(new THREE.BoxGeometry(0.05, 0.004, 0.016), 0.202, 0.284, 0, { rz: -0.55 });
  const shadow = new THREE.CircleGeometry(0.15, 16).rotateX(-Math.PI / 2);
  return {
    coat,
    mane,
    silk,
    fixed,
    leg: legParts(WHITE, HOOF),
    legWhiteHoof: legParts(HORSES[O_TRUY]!.coat, PANTS),
    tail,
    blaze,
    shadow,
  };
}

/** Vật liệu riêng của ngựa i (lông nhuộm màu đỉnh, bờm, áo nài). */
export function buildHorseMaterials(i: number): HorseMaterials {
  const h = HORSES[i]!;
  const coat = new THREE.MeshStandardMaterial({
    color: h.coat,
    vertexColors: true,
    roughness: i === GIONG ? 0.32 : 0.45,
    metalness: i === GIONG ? 0.6 : i === 4 ? 0.25 : 0.02,
  });
  const leg = i === O_TRUY ? new THREE.MeshStandardMaterial({ color: WHITE, vertexColors: true, roughness: 0.45 }) : coat;
  const mane = new THREE.MeshStandardMaterial({
    color: h.mane,
    roughness: 0.85,
    emissive: i === GIONG ? '#ff4a10' : '#000000',
    emissiveIntensity: i === GIONG ? 0.6 : 0,
  });
  const silk = new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.35, metalness: 0.05 });
  return { coat, leg, mane, silk };
}

/** Ngựa này dùng hình chân móng trắng / có đốm trán không. */
export const hasWhiteHooves = (i: number): boolean => i === O_TRUY;
export const hasBlaze = (i: number): boolean => i === DICH_LU;
