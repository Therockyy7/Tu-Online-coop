// Chuyển động nhân vật "hạt đậu": lò xo bậc hai cho từng kênh Pose (bám đích chủ động — nhịp đều không trễ pha; đổi
// hoạt ảnh thì đích trộn mượt trong không gian khớp, lò xo giữ đà rồi lắng, không giật), chu kỳ bước theo tốc độ thật,
// tư thế chibi cho mọi AnimId (nhún dẹt/vươn, bật nhảy, nghiêng đầu), IK tay có khép vai (chắp tay, vỗ tay, ôm vật:
// khuỷu gập mềm, cẳng tay + ống tay SLEEVE ngoài thân/đầu, cả lúc chuyển thế), tay trái cầm tích trượng/quạt luôn bên
// hông, chổi tì đất không xuyên sàn, biểu cảm theo hoạt ảnh. Vòng lặp mỗi khung hình không cấp phát bộ nhớ.
import { MOVE, PORTRAIT_BOW, clamp, type AnimId } from '@shared/index';
import {
  BODY,
  POSE_KEYS,
  REST_POSE,
  SHOULDER_FWD,
  SLEEVE,
  profileR,
  type CreateMotion,
  type Expression,
  type MotionDriver,
  type MotionInput,
  type MotionOutput,
  type Pose,
} from './rig';

/**
 * Độ cúi của 1 lạy (0 = quỳ thẳng, 1 = rạp sát đất) theo giây kể từ lúc bắt đầu lạy: cúi xuống 40%,
 * giữ 20%, ngẩng lên 40% thời gian PORTRAIT_BOW.bowMs. Dùng chung cho thân nhân vật và camera góc thứ nhất.
 */
export function prostrateDip(sec: number): number {
  const p = Math.min(1, Math.max(0, (sec * 1000) / PORTRAIT_BOW.bowMs));
  const d = p < 0.4 ? p / 0.4 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
  return d * d * (3 - 2 * d);
}

// ───────────────────────── IK 2 khúc (vai → khuỷu → bàn tay) ─────────────────────────

const L1 = BODY.upperArm;
const L2 = BODY.forearm;
/** Tâm bàn tay → đầu chổi (props.ts: chổi dọc −Y của chỗ cầm, chóp bó rơm ở −1.21). */
const BROOM = 1.21;
/** Khớp vai trái trong không gian ngực (gốc = khớp eo, trục như body space). */
const SHX = BODY.shoulderX;
const SHY = BODY.shoulderY - BODY.waistY;

/** Kết quả IK theo đúng kênh FK của applyPose (tay trái; tay phải dùng y nguyên giá trị — applyPose tự đối xứng gương). */
export interface ArmSolve {
  armX: number;
  armY: number;
  armZ: number;
  elbow: number;
  wrist: number;
}

/**
 * IK tay TRÁI trong không gian ngực: bàn tay tới (hx, hy, hz), khuỷu chĩa về phía (px, py, pz), lòng bàn tay (−X cục bộ
 * của bàn tay trái) quay về hướng (qx, qy, qz). Tay phải: truyền toạ độ đã lật X (−hx, −px, −qx) rồi gán thẳng kết quả.
 * Ngoài tầm với thì duỗi thẳng về phía đích.
 */
export function solveArm(hx: number, hy: number, hz: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, out: ArmSolve): ArmSolve {
  return solveArmAt(0, hx, hy, hz, px, py, pz, qx, qy, qz, out);
}

/**
 * Như solveArm nhưng vai TRÁI đang khép `sh` (0..1 = pose.lShoulder): khớp vai dời sh × SHOULDER_FWD (rig.ts) rồi mới
 * giải. Tay phải: truyền toạ độ đã lật X + sh = pose.rShoulder (vai phải dời đối xứng gương).
 */
export function solveArmAt(sh: number, hx: number, hy: number, hz: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, out: ArmSolve): ArmSolve {
  let dx = hx - SHX - SHOULDER_FWD[0] * sh;
  let dy = hy - SHY - SHOULDER_FWD[1] * sh;
  let dz = hz - SHOULDER_FWD[2] * sh;
  let D = Math.hypot(dx, dy, dz);
  if (D < 1e-6) {
    dx = 0;
    dy = -1;
    dz = 0;
    D = 1;
  }
  dx /= D;
  dy /= D;
  dz /= D;
  const Dc = clamp(D, 0.06, L1 + L2 - 0.002);
  const cosE = clamp((Dc * Dc - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const e = Math.acos(cosE);
  const cosA = clamp((L1 * L1 + Dc * Dc - L2 * L2) / (2 * L1 * Dc), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // Hướng khuỷu: phần của cực (pole) vuông góc với đường vai→tay.
  let pd = px * dx + py * dy + pz * dz;
  let nx = px - pd * dx;
  let ny = py - pd * dy;
  let nz = pz - pd * dz;
  let nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-5) {
    // Cực trùng phương với tay: lấy tạm hướng xuống dưới (hoặc ra sau).
    const fx = 0;
    const fy = Math.abs(dy) > 0.9 ? 0 : -1;
    const fz = Math.abs(dy) > 0.9 ? -1 : 0;
    pd = fx * dx + fy * dy + fz * dz;
    nx = fx - pd * dx;
    ny = fy - pd * dy;
    nz = fz - pd * dz;
    nl = Math.hypot(nx, ny, nz);
  }
  nx /= nl;
  ny /= nl;
  nz /= nl;
  // Cánh tay trên u, hướng gập cẳng tay w (⊥ u, cùng mặt phẳng gập). Cột ma trận vai: X = Y × Z, Y = −u, Z = w.
  const ux = cosA * dx + sinA * nx;
  const uy = cosA * dy + sinA * ny;
  const uz = cosA * dz + sinA * nz;
  const wx = sinA * dx - cosA * nx;
  const wy = sinA * dy - cosA * ny;
  const wz = sinA * dz - cosA * nz;
  // X = (−u) × w
  const Xx = -(uy * wz - uz * wy);
  const Xy = -(uz * wx - ux * wz);
  const Xz = -(ux * wy - uy * wx);
  // Tách Euler 'XYZ' (giống THREE.Euler.setFromRotationMatrix): m13 = Z.x, m23 = Z.y, m33 = Z.z, m12 = Y.x, m11 = X.x.
  const beta = Math.asin(clamp(wx, -1, 1));
  let alpha: number;
  let gamma: number;
  if (Math.abs(wx) < 0.9999) {
    alpha = Math.atan2(-wy, wz);
    gamma = Math.atan2(ux, Xx);
  } else {
    alpha = Math.atan2(-uz, -uy);
    gamma = 0;
  }
  out.armX = -alpha;
  out.armY = beta;
  out.armZ = gamma;
  out.elbow = e;
  // Cổ tay: xoay quanh trục cẳng tay để lòng bàn tay (−X cục bộ) nhìn về q. Trục bàn tay trước khi xoay:
  // Xh = X (gập khuỷu quanh X), Zh = sin(e)·(−u) + cos(e)·w (trục Z của khuỷu sau khi gập).
  const se = Math.sin(e);
  const ce = cosE;
  const Zx = -se * ux + ce * wx;
  const Zy = -se * uy + ce * wy;
  const Zz = -se * uz + ce * wz;
  out.wrist = Math.atan2(Zx * qx + Zy * qy + Zz * qz, -(Xx * qx + Xy * qy + Xz * qz));
  return out;
}

// ───────────────────────── Tiện ích ─────────────────────────

const TAU = Math.PI * 2;
/** Khớp hông → khớp eo. */
const HIP_W = BODY.waistY - BODY.hipsY;
const sat = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Smoothstep 0..1. */
const sm = (x: number): number => {
  const t = sat(x);
  return t * t * (3 - 2 * t);
};
/** Smoothstep từ a → b. */
const smr = (x: number, a: number, b: number): number => sm((x - a) / (b - a));
/** Vòm êm 0 → 1 → 0 trên [0, 1] (đạo hàm liên tục ở hai đầu). */
const arc = (u: number): number => {
  if (u <= 0 || u >= 1) return 0;
  const s = Math.sin(Math.PI * u);
  return s * s;
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const frac = (x: number): number => x - Math.floor(x);
const wrapPi = (a: number): number => a - TAU * Math.round(a / TAU);
const unwrapNear = (a: number, ref: number): number => a - TAU * Math.round((a - ref) / TAU);

// Phép quay trên 1 điểm dùng chung (không cấp phát).
let QX = 0;
let QY = 0;
let QZ = 0;
function rotX(a: number): void {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const y = QY * c - QZ * s;
  QZ = QY * s + QZ * c;
  QY = y;
}
function rotY(a: number): void {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = QX * c + QZ * s;
  QZ = -QX * s + QZ * c;
  QX = x;
}
function rotZ(a: number): void {
  if (a === 0) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = QX * c - QY * s;
  QY = QX * s + QY * c;
  QX = x;
}

/** (QX, QY, QZ): điểm body space (hệ khớp turn) → không gian ngực theo tư thế p (ngược đúng chuỗi của applyPose). */
function bodyToChest(p: Pose): void {
  const sq = Math.max(0.5, p.squash);
  const s = 1 / Math.sqrt(sq);
  QX /= s;
  QY = (QY - p.y) / sq - p.hipsY;
  QZ /= s;
  rotY(-p.twist);
  rotX(-p.lean);
  rotZ(-p.roll);
  QY -= HIP_W;
  rotY(-p.chestTwist);
  rotX(-p.bend);
  rotZ(-p.chestRoll);
}

/** Như bodyToChest nhưng cho hướng (bỏ tịnh tiến + co giãn). */
function dirBodyToChest(p: Pose): void {
  rotY(-p.twist);
  rotX(-p.lean);
  rotZ(-p.roll);
  rotY(-p.chestTwist);
  rotX(-p.bend);
  rotZ(-p.chestRoll);
}

/** (QX, QY, QZ): điểm trong hệ "hông chỉ quay ngang" (gốc khớp hông, chỉ theo twist) → không gian ngực. */
function yawHipsToChest(p: Pose): void {
  rotX(-p.lean);
  rotZ(-p.roll);
  QY -= HIP_W;
  rotY(-p.chestTwist);
  rotX(-p.bend);
  rotZ(-p.chestRoll);
}

/** Như yawHipsToChest nhưng cho hướng. */
function dirYawHipsToChest(p: Pose): void {
  rotX(-p.lean);
  rotZ(-p.roll);
  rotY(-p.chestTwist);
  rotX(-p.bend);
  rotZ(-p.chestRoll);
}

/** (QX, QY, QZ): điểm head-local (gốc khớp cổ) → không gian ngực theo góc đầu của p. */
function headToChest(p: Pose): void {
  rotZ(p.headZ);
  rotX(p.headX);
  rotY(p.headY);
  QY += BODY.neckY - BODY.waistY;
}

/** Bàn chân (ellipsoid nửa cao footY, nửa dài 0.145) chúc góc `pitch` → phải nâng tâm lên bao nhiêu để không lún sàn. */
function footLift(pitch: number): number {
  const a = BODY.footY * Math.cos(pitch);
  const b = 0.145 * Math.sin(pitch);
  return Math.sqrt(a * a + b * b) - BODY.footY;
}

/** Dải độ cao của dáng thân (rig.ts PROFILE). */
const PROFILE_Y0 = 0.06;
const PROFILE_Y1 = 1.08;

/** (QX, QY, QZ) ← R·(QX, QY, QZ) với R = phép quay vai tay TRÁI theo applyPose: Euler 'XYZ' (−X, Y, Z). */
function armRot(x: number, y: number, z: number): void {
  rotZ(z);
  rotY(y);
  rotX(-x);
}

/** Khoảng hở xấp xỉ của quả cầu bán kính r tâm (px, py, pz) (không gian ngực, thân đứng thẳng): vỏ PROFILE + sọ (cầu). */
function proxyClear(px: number, py: number, pz: number, r: number): number {
  const y = py + BODY.waistY;
  const body = y < PROFILE_Y0 || y > PROFILE_Y1 ? 1 : Math.hypot(px, pz) - profileR(y);
  const head = Math.hypot(px, py - (BODY.headY - BODY.waistY), pz) - BODY.headR;
  return Math.min(body, head) - r;
}

/**
 * Khoảng hở xấp xỉ (m) của cẳng tay (khuỷu, giữa) + bàn tay TRÁI với thân/sọ ở bộ góc (x, y, z, e) + khép vai sh — dùng
 * chọn hướng dang khuỷu khi trộn (startBlend), không phải số đo chính xác. Tay phải đối xứng gương: dùng y nguyên góc.
 */
function armProxy(x: number, y: number, z: number, e: number, sh: number): number {
  QX = 0;
  QY = -1;
  QZ = 0;
  armRot(x, y, z);
  const ex = SHX + SHOULDER_FWD[0] * sh + L1 * QX;
  const ey = SHY + SHOULDER_FWD[1] * sh + L1 * QY;
  const ez = SHOULDER_FWD[2] * sh + L1 * QZ;
  QX = 0;
  QY = -Math.cos(e);
  QZ = Math.sin(e);
  armRot(x, y, z);
  const fx = QX * L2;
  const fy = QY * L2;
  const fz = QZ * L2;
  return Math.min(
    proxyClear(ex, ey, ez, SLEEVE.foreR),
    proxyClear(ex + 0.5 * fx, ey + 0.5 * fy, ez + 0.5 * fz, SLEEVE.foreR),
    proxyClear(ex + fx, ey + fy, ez + fz, BODY.handR),
  );
}

/** Đưa bộ góc tay `k` về biểu diễn tương đương (2π / kép) gần (rx, ry, rz, rw) nhất — nội suy giữa 2 tư thế đi đường ngắn. */
function alignArm(k: ArmSolve, rx: number, ry: number, rz: number, rw: number): ArmSolve {
  const ax = unwrapNear(k.armX, rx);
  const ay = unwrapNear(k.armY, ry);
  const az = unwrapNear(k.armZ, rz);
  const bx = unwrapNear(k.armX - Math.PI, rx);
  const by = unwrapNear(Math.PI - k.armY, ry);
  const bz = unwrapNear(k.armZ + Math.PI, rz);
  const dual = (bx - rx) ** 2 + (by - ry) ** 2 + (bz - rz) ** 2 < (ax - rx) ** 2 + (ay - ry) ** 2 + (az - rz) ** 2;
  k.armX = dual ? bx : ax;
  k.armY = dual ? by : ay;
  k.armZ = dual ? bz : az;
  k.wrist = unwrapNear(k.wrist, rw);
  return k;
}

/** Tư thế tay khoá: góc khớp + mức khép vai `sh` (pose.lShoulder / rShoulder) mà IK đã giải theo. */
interface ArmKey extends ArmSolve {
  sh: number;
}

/** Tư thế tay khoá (IK tính sẵn, vai khép `sh`), biểu diễn gần `ref` (mặc định: tay buông). */
function keyAt(sh: number, x: number, y: number, z: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, ref?: Readonly<ArmSolve>): Readonly<ArmKey> {
  const k: ArmKey = { armX: 0, armY: 0, armZ: 0, elbow: 0, wrist: 0, sh };
  solveArmAt(sh, x, y, z, px, py, pz, qx, qy, qz, k);
  if (ref) alignArm(k, ref.armX, ref.armY, ref.armZ, ref.wrist);
  else alignArm(k, REST_POSE.lArmX, 0, REST_POSE.lArmZ, 0);
  return k;
}

/** Như keyAt với vai đứng yên. */
function key(x: number, y: number, z: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number, ref?: Readonly<ArmSolve>): Readonly<ArmKey> {
  return keyAt(0, x, y, z, px, py, pz, qx, qy, qz, ref);
}

// ───────────────────────── Tư thế tay khoá (không gian ngực, tay TRÁI; tay phải dùng y nguyên) ─────────────────────────
// Ngực tròn + tay ngắn (0.45): vai đứng yên thì chắp tay chỉ với tới dưới cằm với tay gần thẳng — cẳng tay áp sát ngực,
// ống tay lún vào thân. Khép vai (SHOULDER_FWD) cho khuỷu gập ~50°: cẳng tay + ống tay (SLEEVE) ra ngoài thân.

/**
 * Chắp tay trước ngực trên (hai bàn tay chạm nhau, y thân ≈ 0.96, z ≈ 0.42), vai khép hẳn, khuỷu mềm thấp hơn vai ~4 cm,
 * hơi dạt ra: ống tay hẹp dọc cẳng tay ngoài ngực ≥ 7 mm (ống rộng ≥ 1 mm) kể cả lúc thở, bàn tay cách sọ ≥ 9 cm khi cúi
 * chào. Cẳng tay chĩa vào trong-trước nên lòng bàn tay (luôn ⊥ cẳng tay — rig không gập cổ tay) quay vào nhau hết mức
 * có thể, lệch ~50° về phía ngực.
 */
const G = { x: 0.085, y: 0.34, z: 0.42 } as const;
const K_GASSHO = keyAt(1, G.x, G.y, G.z, 1, -0.2, 0, -1, 0, 0);
/** Lạy rạp: mức khép vai khi hai bàn tay úp trên vạt áo trước gối. */
const SH_PLANT = 1;
/** Tay buông của đứng chơi / đi: dang hơn REST_POSE (0.34) — cẳng tay + ống tay không áp vào hông. */
const ARM_OUT = 0.5;
const K_REST: Readonly<ArmKey> = { armX: REST_POSE.lArmX, armY: REST_POSE.lArmY, armZ: ARM_OUT, elbow: REST_POSE.lElbow, wrist: 0, sh: 0 };
/** Ôm hộp (khớp carry ở ngực (0, 0.21, 0.4)): hai bàn tay kẹp hai bên hộp; vai khép, khuỷu ôm vòng ra ngoài. */
const K_CARRY = keyAt(1, 0.2, 0.26, 0.41, 1, -0.4, 0.3, -1, 0, 0);
/** Ngồi thiền: hai tay đặt trên bụng/đùi trước, ngửa lòng; vai khép để cẳng tay không áp vào bụng. */
const K_LAP = keyAt(1, 0.25, 0.17, 0.39, 1, -0.4, 0.2, 0, 1, 0);
/**
 * Vỗ tay: từ thế chắp duỗi bớt khuỷu (cẳng tay bản lề quanh khuỷu đứng yên → hai bàn tay mở ra ngoài-trước ~8 cm), trộn
 * trong không gian khớp. Không giải IK từng khung: thế chắp gần vùng khoá gimbal của Euler 'XYZ' (armY ≈ −π/2), IK từng
 * khung làm armX/armZ quay nhanh ngược chiều nhau và tay quất khi đổi hoạt ảnh.
 */
const K_CLAP_OPEN: Readonly<ArmKey> = { ...K_GASSHO, armX: K_GASSHO.armX - 0.2, armZ: K_GASSHO.armZ + 0.2, elbow: K_GASSHO.elbow - 0.4 };
/** Chẻ củi: giơ cao trước cằm ↔ bổ xuống trước hông; vai khép vừa (cẳng tay không quét qua ngực khi vung). */
const SH_CHOP = 0.6;
const K_CHOP_DOWN = keyAt(SH_CHOP, 0.37, 0.07, 0.29, 1, -0.3, -0.6, -1, 0, 0);
const K_CHOP_UP = keyAt(SH_CHOP, 0.12, 0.41, 0.36, 1, -0.3, -0.2, -1, 0, 0, K_CHOP_DOWN);
/** Phóng sinh: bế thấp trước hông ↔ nâng lên thả. */
const K_REL_LOW = key(0.38, 0.06, 0.28, 1, -0.4, -0.6, -1, 0.3, 0);
const K_REL_UP = key(0.33, 0.45, 0.27, 1, -0.6, -0.4, -1, 0.5, 0, K_REL_LOW);
/** Nhảy: tay vung lên chéo ngoài ↔ hạ xuống bên hông trước. */
const K_UP = key(0.44, 0.6, 0.12, 1, -0.6, -0.4, 0, 0, 1);
// Cổ tay giữ đúng góc của K_UP: trộn hai thế không xoắn bàn tay nửa vòng.
const K_LOW: Readonly<ArmKey> = { ...key(0.39, 0.05, 0.24, 1, -0.2, -0.8, 0, 0, 1, K_UP), wrist: K_UP.wrist };
/** Tay giữ bụng (cười): lòng bàn tay úp vào bụng, vai khép. */
const K_BELLY = keyAt(1, 0.25, 0.2, 0.4, 1, -0.4, 0.2, 0, 0, -1);

// ───────────────────────── Lò xo ─────────────────────────

const KEYS = POSE_KEYS;
const N = KEYS.length;
const idx = (k: keyof Pose): number => KEYS.indexOf(k);
const I_TURN = idx('turn');
const I_SPIN = idx('spin');
const I_Y = idx('y');
const I_LEAN = idx('lean');
const I_ROLL = idx('roll');
const I_BEND = idx('bend');
const I_CROLL = idx('chestRoll');
const I_HX = idx('headX');
const I_HZ = idx('headZ');
const I_LARM = idx('lArmX');
const I_RARM = idx('rArmX');
const I_LSH = idx('lShoulder');
const I_RSH = idx('rShoulder');

/** Tần số (Hz), hệ số tắt dần, mức bám đích chủ động (0 = lò xo thuần, 1 = bám đúng đích, chỉ lò xo khi đích nhảy), trần vận tốc đích. */
interface Tune {
  hz: number;
  zeta: number;
  ff: number;
  vmax: number;
}
const T_BODY: Tune = { hz: 3.5, zeta: 0.6, ff: 1, vmax: 30 };
const T_HEAD: Tune = { hz: 2.8, zeta: 0.5, ff: 0.6, vmax: 30 };
const T_ARM: Tune = { hz: 4.6, zeta: 0.6, ff: 1, vmax: 45 };
const T_FOOT: Tune = { hz: 8, zeta: 1, ff: 1, vmax: 8 };
const T_FOOTP: Tune = { hz: 8, zeta: 1, ff: 1, vmax: 30 };
const T_SKIRT: Tune = { hz: 2.1, zeta: 0.32, ff: 0, vmax: 0 };
const T_SWAY: Tune = { hz: 1.7, zeta: 0.22, ff: 0, vmax: 0 };
const TUNE: Record<keyof Pose, Tune> = {
  turn: { hz: 2.4, zeta: 0.78, ff: 0, vmax: 0 },
  spin: { hz: 2.6, zeta: 0.75, ff: 1, vmax: 40 },
  y: { hz: 3.6, zeta: 0.6, ff: 1, vmax: 5 },
  squash: { hz: 4, zeta: 0.55, ff: 1, vmax: 12 },
  hipsY: { hz: 3, zeta: 1, ff: 1, vmax: 5 },
  lean: T_BODY,
  twist: T_BODY,
  roll: T_BODY,
  sit: { hz: 2.3, zeta: 0.92, ff: 1, vmax: 10 },
  skirtX: T_SKIRT,
  skirtZ: T_SKIRT,
  bend: { hz: 3.2, zeta: 0.62, ff: 1, vmax: 30 },
  chestTwist: T_BODY,
  chestRoll: T_BODY,
  breath: { hz: 2, zeta: 0.9, ff: 1, vmax: 2 },
  headX: T_HEAD,
  headY: T_HEAD,
  headZ: T_HEAD,
  lArmX: T_ARM,
  lArmY: T_ARM,
  lArmZ: T_ARM,
  lElbow: T_ARM,
  lWrist: T_ARM,
  rArmX: T_ARM,
  rArmY: T_ARM,
  rArmZ: T_ARM,
  rElbow: T_ARM,
  rWrist: T_ARM,
  lFootX: T_FOOT,
  lFootY: T_FOOT,
  lFootZ: T_FOOT,
  lFootPitch: T_FOOTP,
  rFootX: T_FOOT,
  rFootY: T_FOOT,
  rFootZ: T_FOOT,
  rFootPitch: T_FOOTP,
  tuck: { hz: 4, zeta: 1, ff: 1, vmax: 10 },
  swayX: T_SWAY,
  swayZ: T_SWAY,
  lShoulder: { hz: 4, zeta: 0.8, ff: 1, vmax: 6 },
  rShoulder: { hz: 4, zeta: 0.8, ff: 1, vmax: 6 },
};
const OM = new Float64Array(N);
const ZE = new Float64Array(N);
const FW = new Float64Array(N);
const VM = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const t = TUNE[KEYS[i]!];
  OM[i] = TAU * t.hz;
  ZE[i] = t.zeta;
  FW[i] = t.ff;
  VM[i] = t.vmax;
}
/** Mức xoay thêm ArmZ giữa lúc trộn để thử (planBump) — 0 đầu tiên; đường thẳng thoáng ≥ BUMP_OK (m) thì giữ 0. */
const BUMPS = [0, 0.25, 0.45, -0.25, -0.45] as const;
const BUMP_OK = 0.012;
/** Bước tích phân tối đa (giây) — Euler bán ẩn ổn định tới 8 Hz với dt khung hình tới 0,25 s. */
const SUB = 1 / 120;

// ───────────────────────── Biểu cảm, cử chỉ vặt ─────────────────────────

const EXPR: Record<AnimId, Expression> = {
  idle: 'neutral',
  walk: 'neutral',
  carry_idle: 'neutral',
  carry_walk: 'neutral',
  sweep: 'focus',
  chop: 'focus',
  cut: 'focus',
  crank: 'focus',
  pour: 'focus',
  wash: 'focus',
  stir: 'focus',
  fan: 'focus',
  pick: 'focus',
  release: 'focus',
  sit: 'calm',
  kneel: 'calm',
  bow: 'calm',
  prostrate: 'calm',
  pray: 'calm',
  strike: 'focus',
  pull: 'focus',
  shake: 'focus',
  drink: 'happy',
  dj: 'happy',
  dance: 'happy',
  dance2: 'happy',
  dance3: 'happy',
  wave: 'happy',
  laugh: 'laugh',
  clap: 'happy',
  cry: 'cry',
  angry: 'angry',
  cheer: 'happy',
  stumble: 'dizzy',
};

/** Cử chỉ vặt khi đứng chơi: ngó quanh, nghiêng đầu, nhún nhảy, vung tay, mỉm cười, đung đưa gót. */
const F_LOOK = 1;
const F_TILT = 2;
const F_HOP = 3;
const F_SWING = 4;
const F_SMILE = 5;
const F_ROCK = 6;
const F_DUR = [0, 2.6, 1.7, 1.0, 1.9, 1.6, 1.8];

let seedCounter = 0;

// ───────────────────────── Bộ chuyển động ─────────────────────────

class Motion implements MotionDriver {
  /** Đích mỗi khung hình (dựng lại từ REST_POSE). */
  private readonly T: Pose = { ...REST_POSE };
  /** Đầu ra (object dùng lại). */
  private readonly P: Pose = { ...REST_POSE };
  private readonly out: MotionOutput = { pose: this.P, expression: 'neutral' };
  /** Trạng thái lò xo theo thứ tự POSE_KEYS. */
  private readonly x = new Float64Array(N);
  private readonly v = new Float64Array(N);
  /** Đích + vận tốc đích của khung trước (bám chủ động). */
  private readonly tp = new Float64Array(N);
  private readonly tv = new Float64Array(N);
  private readonly arm: ArmSolve = { armX: 0, armY: 0, armZ: 0, elbow: 0, wrist: 0 };
  private readonly arm2: ArmKey = { armX: 0, armY: 0, armZ: 0, elbow: 0, wrist: 0, sh: 0 };
  /** Trộn khi đổi hoạt ảnh: tư thế lúc đổi (đóng băng), tiến độ 0..1, thời lượng (s). */
  private readonly from = new Float64Array(N);
  private bt = 1;
  private bd = 0.3;
  /** Dang thêm tay trái / phải giữa chừng trộn (rad, đỉnh ở giữa) — xem startBlend. */
  private bumpL = 0;
  private bumpR = 0;
  private spinFwd = 0;
  private started = false;
  private lastAnim: AnimId = 'idle';
  private lastGrip: MotionInput['grip'] = null;
  private lastBusy: MotionInput['leftBusy'] = null;
  private lastTool = false;
  private lastAnimTime = 0;
  private time = 0;
  /** Pha chu kỳ bước (0..1: chân trái chạm đất ở 0, chân phải ở 0.5). */
  private phase = 0;
  private speed = 0;
  private lastSpeed = 0;
  /** Gia tốc tiến (m/s², đã làm mượt). */
  private accel = 0;
  private drunk = 0;
  /** Lệch pha riêng từng nhân vật (thở, đung đưa không đồng loạt). */
  private readonly ph: number;
  private rs: number;
  private fKind = 0;
  private fStart = 0;
  private fDur = 1;
  private fNext = 0;
  private fDir = 1;
  private idleOn = false;
  /** Bù 2π đã trừ khỏi spin (dance3 xoay mãi). */
  private spinOff = 0;
  /** Đang ôm hộp (grip 'carry') — tư thế cúi sâu thì chỉ cúi vừa. */
  private carrying = false;

  constructor() {
    seedCounter++;
    this.rs = (Math.imul(seedCounter, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
    this.ph = this.rand() * 100;
    for (let i = 0; i < N; i++) {
      const r = REST_POSE[KEYS[i]!];
      this.x[i] = r;
      this.tp[i] = r;
    }
  }

  /** Số ngẫu nhiên 0..1 tất định theo thứ tự tạo nhân vật (mulberry32). */
  private rand(): number {
    this.rs = (this.rs + 0x6d2b79f5) >>> 0;
    let t = this.rs;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  update(dt: number, time: number, inp: MotionInput): MotionOutput {
    const h = dt > 0 ? Math.min(dt, 0.25) : 0;
    this.time = time;
    this.advance(h, time, inp);
    this.computeTarget(inp, time);
    if (!this.started) this.reset();
    else if (h > 0) {
      const jump = this.discreteChanged(inp);
      if (jump) this.startBlend(inp);
      this.applyBlend(h);
      this.integrate(h, jump);
    }
    this.remember(inp);
    this.finish(inp);
    return this.out;
  }

  snap(inp: MotionInput): void {
    this.advance(0, this.time, inp);
    this.computeTarget(inp, this.time);
    this.reset();
    this.remember(inp);
    this.finish(inp);
  }

  // ── Lò xo ──

  private reset(): void {
    const T = this.T;
    for (let i = 0; i < N; i++) {
      let t = T[KEYS[i]!];
      if (i === I_TURN || i === I_SPIN) t = wrapPi(t);
      this.x[i] = t;
      this.v[i] = 0;
      this.tp[i] = t;
      this.tv[i] = 0;
    }
    this.spinOff = 0;
    this.bt = 1;
    this.started = true;
  }

  /**
   * Đổi hoạt ảnh / đồ cầm: đích trộn trong không gian khớp từ tư thế đang có (đóng băng) sang đích mới theo smoothstep
   * 0,2–0,42 s (lâu hơn khi tay phải đi xa) — lò xo giữ đà cũ (theo đà, vượt nhẹ) nhưng tay không "quất" theo bước nhảy đích.
   * Vai khép trước / mở sau, và khuỷu vòng ra một nhịp giữa chừng khi đường thẳng sẽ quét cẳng tay qua thân (planBump).
   */
  private startBlend(inp: MotionInput): void {
    const T = this.T;
    const x = this.x;
    this.from.set(x);
    let d = 0;
    for (let i = I_LARM; i < I_LARM + 10; i++) {
      if (i === I_LARM + 4 || i === I_LARM + 9) continue;
      d = Math.max(d, Math.abs(T[KEYS[i]!] - x[i]!));
    }
    // Đang xoay (dance3) mà đổi hoạt ảnh: đã quay quá 2/3 nửa vòng thì xoay tiếp cho tròn vòng thay vì quay ngược lại.
    const ds = wrapPi(T.spin - x[I_SPIN]!);
    const vs = this.v[I_SPIN]!;
    this.spinFwd = vs > 1.5 && ds < 1 - Math.PI ? TAU : vs < -1.5 && ds > Math.PI - 1 ? -TAU : 0;
    d = Math.max(d, 2 * Math.abs(T.bend - x[I_BEND]!), 3 * Math.abs(T.y - x[I_Y]!), 0.5 * Math.abs(ds + this.spinFwd));
    this.bd = clamp(0.18 + 0.08 * d, 0.2, 0.42);
    this.bt = 0;
    // Đổi sang đi: đích tay còn vung trước/sau theo bước — tính cho cả hai đầu vung.
    const swing = inp.anim === 'walk' || inp.anim === 'carry_walk' ? 0.45 : 0;
    this.bumpL = this.planBump(I_LARM, I_LSH, swing);
    this.bumpR = this.planBump(I_RARM, I_RSH, swing);
  }

  /**
   * Trộn thẳng trong không gian khớp có thể kéo cẳng tay / bàn tay quét qua ngực, bụng hay mặt giữa chừng (buông bên hông
   * ↔ chụm trước ngực, chắp tay → áp tai…). Thử vài mức xoay thêm kênh ArmZ (đỉnh giữa lúc trộn, dạng sin) trên đường
   * trộn, chọn mức có khoảng hở xấp xỉ (armProxy) lớn nhất; đường thẳng đã đủ thoáng thì giữ nguyên (0).
   */
  private planBump(ia: number, ish: number, swing: number): number {
    const T = this.T;
    const x = this.x;
    const x0 = x[ia]!;
    const y0 = x[ia + 1]!;
    const z0 = x[ia + 2]!;
    const e0 = x[ia + 3]!;
    const s0 = x[ish]!;
    const dx = T[KEYS[ia]!] - x0;
    const dy = T[KEYS[ia + 1]!] - y0;
    const dz = T[KEYS[ia + 2]!] - z0;
    const de = T[KEYS[ia + 3]!] - e0;
    const ds = T[KEYS[ish]!] - s0;
    let best = 0;
    let bestC = -9;
    for (let c = 0; c < BUMPS.length; c++) {
      const amp = BUMPS[c]!;
      let m = 9;
      for (let v = swing > 0 ? -1 : 0; v <= (swing > 0 ? 1 : 0); v++) {
        const dxv = dx + v * swing;
        for (let k = 1; k <= 3; k++) {
          const u = k / 4;
          const us = ds > 0 ? sm(u * 1.8) : sm(u * 1.8 - 0.8);
          m = Math.min(m, armProxy(x0 + dxv * u, y0 + dy * u, z0 + dz * u + amp * Math.sin(Math.PI * u), e0 + de * u, s0 + ds * us));
        }
      }
      if (c === 0 && m >= BUMP_OK) return 0;
      if (m > bestC + 0.004) {
        bestC = m;
        best = amp;
      }
    }
    return best;
  }

  private applyBlend(dt: number): void {
    if (this.bt >= 1) return;
    const T = this.T;
    const f = this.from;
    const e = sm(this.bt);
    // Vai khép sớm, mở muộn: tay đang gập vào giữa / duỗi ra thì vai đã (vẫn) ở trước — cẳng tay không quét qua ngực.
    const eIn = sm(this.bt * 1.8);
    const eOut = sm(this.bt * 1.8 - 0.8);
    for (let i = 0; i < N; i++) {
      if (FW[i] === 0) continue; // quay thân, vạt dưới, đồ lủng lẳng: lò xo thuần, không trộn
      const k = KEYS[i]!;
      const d = i === I_SPIN ? wrapPi(T[k] - f[i]!) + this.spinFwd : T[k] - f[i]!;
      T[k] = f[i]! + d * (i === I_LSH || i === I_RSH ? (d > 0 ? eIn : eOut) : e);
    }
    const b = Math.sin(Math.PI * e);
    T.lArmZ += this.bumpL * b;
    T.rArmZ += this.bumpR * b;
    this.bt = Math.min(1, this.bt + dt / this.bd);
  }

  private discreteChanged(inp: MotionInput): boolean {
    return (
      inp.anim !== this.lastAnim ||
      inp.grip !== this.lastGrip ||
      inp.leftBusy !== this.lastBusy ||
      inp.tool !== this.lastTool ||
      inp.animTime < this.lastAnimTime - 1e-6
    );
  }

  private remember(inp: MotionInput): void {
    if (inp.anim === 'dance3' && this.lastAnim !== 'dance3') this.spinOff = 0;
    this.lastAnim = inp.anim;
    this.lastGrip = inp.grip;
    this.lastBusy = inp.leftBusy;
    this.lastTool = inp.tool;
    this.lastAnimTime = inp.animTime;
  }

  /**
   * Lò xo bậc hai x'' = ω²(đích − x) + 2ζω(f·v* − x'), Euler bán ẩn chia bước ≤ 1/120 s; đích đi thẳng giữa 2 khung với
   * vận tốc v* (sai phân), đầu khung cộng xung f·Δv* vào vận tốc. Với f = 1 sai số e = x − đích tự tắt theo đúng lò xo
   * (e'' + 2ζωe' + ω²e = 0) nên nhịp đều được bám đúng pha, không trễ, không vượt; chỗ đích nhảy (đổi hoạt ảnh/đồ cầm)
   * thì bỏ bám chủ động để lò xo tự lấy đà, vượt nhẹ rồi lắng.
   */
  private integrate(dt: number, jump: boolean): void {
    const T = this.T;
    const n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
    const hs = dt / n;
    const x = this.x;
    const v = this.v;
    for (let i = 0; i < N; i++) {
      let tgt = T[KEYS[i]!];
      if (i === I_TURN || i === I_SPIN) tgt = x[i]! + wrapPi(tgt - x[i]!);
      const f = FW[i]!;
      let t0 = this.tp[i]!;
      let fv = 0;
      let dv = 0;
      if (jump || f === 0) {
        t0 = tgt;
        this.tv[i] = 0;
      } else {
        fv = (tgt - t0) / dt;
        if (Math.abs(fv) > VM[i]!) {
          // Đích nhảy bất thường: để lò xo lo.
          fv = 0;
          t0 = tgt;
        }
        dv = f * clamp(fv - this.tv[i]!, -2 * VM[i]!, 2 * VM[i]!);
        this.tv[i] = fv;
        fv *= f;
      }
      const w = OM[i]!;
      const w2 = w * w;
      const c = 2 * ZE[i]! * w;
      let xi = x[i]!;
      let vi = v[i]! + dv;
      for (let k = 0; k < n; k++) {
        // Lực tính tại đầu bước con (đích cùng thời điểm với x) — Euler bán ẩn mới bám đúng đường thẳng của đích.
        const tk = t0 + ((tgt - t0) * k) / n;
        vi += (w2 * (tk - xi) + c * (fv - vi)) * hs;
        xi += vi * hs;
      }
      x[i] = xi;
      v[i] = vi;
      this.tp[i] = tgt;
    }
    // Giữ góc quay trong (−π, π] (dịch cả đích để vận tốc đích không nhảy).
    for (let j = 0; j < 2; j++) {
      const i = j === 0 ? I_TURN : I_SPIN;
      const xi = x[i]!;
      if (xi > Math.PI || xi < -Math.PI) {
        const s = TAU * Math.round(xi / TAU);
        x[i] = xi - s;
        this.tp[i] = this.tp[i]! - s;
        if (i === I_SPIN) this.spinOff += s;
      }
    }
  }

  /** Ghi đầu ra từ trạng thái lò xo + ràng buộc cứng (gấu chạm sàn khi ngồi, chân không lún sàn). */
  private finish(inp: MotionInput): void {
    const P = this.P;
    for (let i = 0; i < N; i++) P[KEYS[i]!] = this.x[i]!;
    P.sit = sat(P.sit);
    P.tuck = sat(P.tuck);
    P.lShoulder = sat(P.lShoulder);
    P.rShoulder = sat(P.rShoulder);
    // Gấu áo nằm trên sàn khi ngồi: hông luôn theo đúng độ ngồi ĐÃ làm mượt.
    P.hipsY = lerp(BODY.hipsY, BODY.sitHipsY, P.sit);
    P.y = Math.max(0, P.y);
    P.squash = clamp(P.squash, 0.72, 1.3);
    P.breath = clamp(P.breath, -0.03, 0.03);
    P.swayX = clamp(P.swayX, -1, 1);
    P.swayZ = clamp(P.swayZ, -1, 1);
    P.lFootY = Math.max(P.lFootY, footLift(P.lFootPitch), 0);
    P.rFootY = Math.max(P.rFootY, footLift(P.rFootPitch), 0);
    this.out.expression = this.expression(inp);
  }

  // ── Trạng thái nền: tốc độ, gia tốc, độ say, nhịp bước, cử chỉ vặt ──

  private advance(dt: number, time: number, inp: MotionInput): void {
    const sp = Math.max(0, inp.speed || 0);
    if (dt > 0) {
      const a = clamp((sp - this.lastSpeed) / dt, -30, 30);
      this.accel += (a - this.accel) * Math.min(1, dt * 7);
      this.drunk += (clamp(inp.drunk || 0, 0, 100) - this.drunk) * Math.min(1, dt * 1.2);
    } else if (!this.started) {
      this.drunk = clamp(inp.drunk || 0, 0, 100);
    }
    this.lastSpeed = sp;
    this.speed = sp;
    if (inp.anim === 'walk' || inp.anim === 'carry_walk') this.phase = frac(this.phase + dt * 0.5 * this.cadence(sp));
    this.scheduleFidget(time, inp);
  }

  /** Số bước mỗi giây: ~2,2 khi đi chậm → ~4,4 khi chạy hết tốc. */
  private cadence(sp: number): number {
    return 2.1 + 0.46 * Math.min(sp, MOVE.speed);
  }

  private scheduleFidget(time: number, inp: MotionInput): void {
    const idleLike = inp.anim === 'idle' || inp.anim === 'carry_idle';
    if (!idleLike || this.drunk > 60) {
      this.fKind = 0;
      this.idleOn = false;
      return;
    }
    if (!this.idleOn) {
      this.idleOn = true;
      this.fNext = time + 3 + this.rand() * 5;
    }
    if (this.fKind && time >= this.fStart + this.fDur) {
      this.fKind = 0;
      this.fNext = time + 5 + this.rand() * 7;
    }
    if (!this.fKind && time >= this.fNext) {
      const r = this.rand();
      const carry = inp.anim === 'carry_idle';
      this.fKind = carry ? (r < 0.3 ? F_LOOK : r < 0.55 ? F_TILT : r < 0.75 ? F_SMILE : F_HOP) : r < 0.2 ? F_LOOK : r < 0.38 ? F_TILT : r < 0.54 ? F_HOP : r < 0.7 ? F_SWING : r < 0.86 ? F_SMILE : F_ROCK;
      this.fStart = time;
      this.fDur = F_DUR[this.fKind]!;
      this.fDir = this.rand() < 0.5 ? -1 : 1;
    }
  }

  private expression(inp: MotionInput): Expression {
    let e = EXPR[inp.anim] ?? 'neutral';
    if ((inp.anim === 'idle' || inp.anim === 'carry_idle') && (this.fKind === F_TILT || this.fKind === F_HOP || this.fKind === F_SMILE)) e = 'happy';
    if (this.drunk > 60 && (e === 'neutral' || e === 'happy' || e === 'focus')) e = 'dizzy';
    return e;
  }

  // ── Tay ──

  /**
   * IK tay `side` (0 trái, 1 phải) — toạ độ thật trong không gian ngực (tay phải x âm, cực/lòng bàn tay cũng toạ độ thật).
   * Giải theo mức khép vai ĐÍCH hiện tại của bên đó (T.lShoulder / T.rShoulder) — đặt vai trước khi gọi.
   */
  private ik(side: 0 | 1, x: number, y: number, z: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number): void {
    const m = side === 0 ? 1 : -1;
    const sh = side === 0 ? this.T.lShoulder : this.T.rShoulder;
    const s = solveArmAt(sh, x * m, y, z, px * m, py, pz, qx * m, qy, qz, this.arm);
    this.setArm(side, s);
  }

  /** IK tới điểm body space (cực, lòng bàn tay cũng theo body space) theo tư thế đích hiện tại. */
  private ikBody(side: 0 | 1, x: number, y: number, z: number, px: number, py: number, pz: number, qx: number, qy: number, qz: number): void {
    const T = this.T;
    QX = x;
    QY = y;
    QZ = z;
    bodyToChest(T);
    const hx = QX;
    const hy = QY;
    const hz = QZ;
    QX = px;
    QY = py;
    QZ = pz;
    dirBodyToChest(T);
    const ax = QX;
    const ay = QY;
    const az = QZ;
    QX = qx;
    QY = qy;
    QZ = qz;
    dirBodyToChest(T);
    this.ik(side, hx, hy, hz, ax, ay, az, QX, QY, QZ);
  }

  /**
   * Tay PHẢI cầm chổi (props.ts: chổi nối dài cẳng tay, đầu chổi cách tâm bàn tay BROOM): đặt tay sao cho đầu chổi chạm
   * điểm (gx, gy, gz) body space theo tư thế đích. Khuỷu nằm trên giao của mặt cầu quanh vai (cánh tay trên) với mặt cầu
   * quanh đầu chổi (cẳng tay + chổi), chọn điểm gần hướng (ex, ey, ez) nhất (ngực, toạ độ thật); rồi IK với cực = khuỷu.
   * Điểm quá gần vai (cúi sâu, ngồi) thì đẩy ra xa theo mặt đất cho tới khi với tới — đầu chổi không đâm xuống sàn.
   */
  private broomAim(gx: number, gy: number, gz: number, ex: number, ey: number, ez: number): void {
    const LB = L2 + BROOM;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let D = 0;
    for (let it = 0; it < 5; it++) {
      QX = gx;
      QY = gy;
      QZ = gz;
      bodyToChest(this.T);
      cx = QX + SHX;
      cy = QY - SHY;
      cz = QZ;
      D = Math.hypot(cx, cy, cz);
      if (D >= LB - L1 + 0.03) break;
      const k = 1 + (LB - L1 + 0.05 - D) / Math.max(0.3, Math.hypot(gx, gz));
      gx *= k;
      gz *= k;
    }
    const ux = cx / D;
    const uy = cy / D;
    const uz = cz / D;
    const a = clamp((D * D + L1 * L1 - LB * LB) / (2 * D), -L1, L1);
    const rho = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pd = ex * ux + ey * uy + ez * uz;
    let nx = ex - pd * ux;
    let ny = ey - pd * uy;
    let nz = ez - pd * uz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // Khuỷu (so với vai), hướng chổi khuỷu → đầu chổi, bàn tay = khuỷu + cẳng tay theo hướng đó.
    const Ex = a * ux + rho * nx;
    const Ey = a * uy + rho * ny;
    const Ez = a * uz + rho * nz;
    let bx = cx - Ex;
    let by = cy - Ey;
    let bz = cz - Ez;
    const bl = Math.hypot(bx, by, bz) || 1;
    bx /= bl;
    by /= bl;
    bz /= bl;
    // Hình học trên tính theo vai đứng yên: tay cầm chổi không khép vai.
    this.T.rShoulder = 0;
    this.ik(1, -SHX + Ex + L2 * bx, SHY + Ey + L2 * by, Ez + L2 * bz, Ex, Ey, Ez, 1, 0, 0.3);
  }

  /** Ghi kênh tay (biểu diễn gốc; cộng thêm dao động thoải mái — alignArms chọn biểu diễn liên tục ở cuối computeTarget). */
  private setArm(side: 0 | 1, k: Readonly<ArmSolve>): void {
    const T = this.T;
    if (side === 0) {
      T.lArmX = k.armX;
      T.lArmY = k.armY;
      T.lArmZ = k.armZ;
      T.lElbow = k.elbow;
      T.lWrist = k.wrist;
    } else {
      T.rArmX = k.armX;
      T.rArmY = k.armY;
      T.rArmZ = k.armZ;
      T.rElbow = k.elbow;
      T.rWrist = k.wrist;
    }
  }

  /**
   * Cùng một hướng vai có 2 bộ góc Euler 'XYZ' tương đương (X, Y, Z) ≡ (X − π, π − Y, Z + π), mỗi góc (cả cổ tay) lại
   * tuần hoàn 2π: chọn bộ gần trạng thái lò xo hiện tại nhất — đổi hoạt ảnh không làm tay quay vòng xa, kênh không giật nhánh.
   */
  private alignArms(): void {
    const T = this.T;
    const x = this.x;
    const s = this.arm;
    s.armX = T.lArmX;
    s.armY = T.lArmY;
    s.armZ = T.lArmZ;
    s.wrist = T.lWrist;
    alignArm(s, x[I_LARM]!, x[I_LARM + 1]!, x[I_LARM + 2]!, x[I_LARM + 4]!);
    T.lArmX = s.armX;
    T.lArmY = s.armY;
    T.lArmZ = s.armZ;
    T.lWrist = s.wrist;
    s.armX = T.rArmX;
    s.armY = T.rArmY;
    s.armZ = T.rArmZ;
    s.wrist = T.rWrist;
    alignArm(s, x[I_RARM]!, x[I_RARM + 1]!, x[I_RARM + 2]!, x[I_RARM + 4]!);
    T.rArmX = s.armX;
    T.rArmY = s.armY;
    T.rArmZ = s.armZ;
    T.rWrist = s.wrist;
  }

  /** Đặt tư thế tay khoá + mức khép vai của nó. */
  private setKey(side: 0 | 1, k: Readonly<ArmKey>): void {
    this.setArm(side, k);
    if (side === 0) this.T.lShoulder = k.sh;
    else this.T.rShoulder = k.sh;
  }

  /** Trộn 2 tư thế khoá theo kênh khớp (đường cung tự nhiên của vai/khuỷu), cả mức khép vai. */
  private mixArm(side: 0 | 1, a: Readonly<ArmKey>, b: Readonly<ArmKey>, t: number): void {
    const s = this.arm;
    s.armX = lerp(a.armX, b.armX, t);
    s.armY = lerp(a.armY, b.armY, t);
    s.armZ = lerp(a.armZ, b.armZ, t);
    s.elbow = lerp(a.elbow, b.elbow, t);
    s.wrist = lerp(a.wrist, b.wrist, t);
    this.setArm(side, s);
    if (side === 0) this.T.lShoulder = lerp(a.sh, b.sh, t);
    else this.T.rShoulder = lerp(a.sh, b.sh, t);
  }

  // ── Đích ──

  private computeTarget(inp: MotionInput, time: number): void {
    const T = this.T;
    for (let i = 0; i < N; i++) {
      const k = KEYS[i]!;
      T[k] = REST_POSE[k];
    }
    const anim = inp.anim;
    const a = Math.max(0, inp.animTime || 0);
    const tt = time + this.ph;
    const B = Math.sin(tt * 1.75);
    this.carrying = inp.grip === 'carry';
    let breath = 1;
    switch (anim) {
      case 'idle':
      case 'carry_idle':
        this.poseIdle(tt, time, anim === 'carry_idle');
        break;
      case 'walk':
      case 'carry_walk':
        this.poseWalk(anim === 'carry_walk');
        break;
      case 'sweep':
        this.poseSweep(a);
        break;
      case 'chop':
        this.poseChop(a);
        break;
      case 'cut': {
        // Thái rau: dao gõ nhanh lên xuống, tay trái úp giữ rau trên thớt, cúi nhìn.
        const tap = Math.pow(0.5 - 0.5 * Math.cos(a * 22), 1.4);
        const e = smr(a, 0, 0.25);
        T.bend = 0.22;
        T.lean = 0.02;
        T.headX = 0.26;
        T.headZ = 0.05;
        T.y = 0.004 * tap * e;
        this.ik(1, -0.37, 0.1 + 0.08 * (1 - tap) * e, 0.29, -1, -0.5, -0.6, 1, 0, 0);
        this.ik(0, 0.36, 0.05, 0.29, 1, -0.3, -0.6, 0, -1, 0.2);
        break;
      }
      case 'crank': {
        // Quay tời: hai tay quay vòng lệch pha như guồng, thân nhún theo vòng quay.
        const w = a * 8;
        const e = smr(a, 0, 0.3);
        const s = Math.sin(w);
        const c = Math.cos(w);
        T.bend = 0.16 + 0.05 * s * e;
        T.lean = 0.04;
        T.chestTwist = 0.06 * s * e;
        T.headX = 0.12;
        T.y = 0.008 * (1 + Math.sin(2 * w)) * e;
        this.ik(1, -0.4, 0.15 + 0.07 * s * e, 0.28 + 0.06 * c * e, -1, -0.5, -0.5, 1, 0, 0);
        this.ik(0, 0.4, 0.15 + 0.07 * c * e, 0.28 - 0.06 * s * e, 1, -0.5, -0.5, -1, 0, 0);
        break;
      }
      case 'pour': {
        // Rót: hai tay nâng vật trước ngực, nghiêng dần sang phải, cúi nhìn dòng nước.
        const e = smr(a, 0.1, 0.8);
        const tip = (0.5 - 0.5 * Math.cos(a * 1.6)) * e;
        T.bend = 0.28 + 0.06 * tip;
        T.lean = 0.03;
        T.headX = 0.24;
        T.chestRoll = 0.07 * tip;
        T.headZ = -0.05 * tip;
        this.ik(1, -0.24, 0.31 - 0.04 * tip, 0.37, -1, -0.6, -0.2, 1, 0, 0);
        this.ik(0, 0.24, 0.31 + 0.03 * tip, 0.37, 1, -0.6, -0.2, -1, 0, 0);
        break;
      }
      case 'wash': {
        // Vo gạo: hai tay xoa vòng tròn so le trong chậu thấp trước người, cúi.
        const w = a * 6;
        const e = smr(a, 0, 0.3);
        T.bend = 0.34;
        T.lean = 0.03;
        T.headX = 0.24;
        T.y = 0.005 * (1 - Math.cos(2 * w)) * e;
        T.chestRoll = 0.03 * Math.sin(w) * e;
        this.ik(0, 0.41 + 0.02 * Math.cos(w) * e, 0.08 + 0.035 * Math.sin(w) * e, 0.27 + 0.03 * Math.cos(w) * e, 1, -0.4, -0.6, 0, -1, 0);
        this.ik(1, -0.41 + 0.02 * Math.cos(w) * e, 0.08 - 0.035 * Math.sin(w) * e, 0.27 - 0.03 * Math.cos(w) * e, -1, -0.4, -0.6, 0, -1, 0);
        break;
      }
      case 'stir': {
        // Đảo chảo: tay phải khuấy vòng, tay trái chống nạnh, đầu lắc lư theo.
        const w = a * 5;
        const e = smr(a, 0, 0.3);
        T.bend = 0.13;
        T.lean = 0.02;
        T.headX = 0.22;
        T.headY = -0.08 + 0.06 * Math.sin(w) * e;
        T.twist = 0.04 * Math.sin(w) * e;
        this.ik(1, -0.385 + 0.045 * Math.cos(w) * e, 0.14, 0.34 + 0.045 * Math.sin(w) * e, -1, -0.6, -0.4, 1, 0, 0);
        this.ik(0, 0.455, 0.04, 0.07, 1, 0.3, -1, -1, 0, 0);
        break;
      }
      case 'fan': {
        // Quạt lửa: ngồi xổm, tay phải phẩy quạt nhanh, tay trái chống gối.
        const f = Math.sin(a * 18);
        const e = smr(a, 0, 0.25);
        T.bend = 0.25;
        T.squash = 0.95;
        T.lean = 0.02;
        T.headX = 0.22;
        this.ik(1, -0.38, 0.13 + 0.03 * f * e, 0.3, -1, -0.5, -0.4, 1, 0, 0);
        T.rWrist += 0.55 * f * e;
        this.ik(0, 0.41, 0.03, 0.24, 1, -0.4, -0.5, 0, -1, 0);
        break;
      }
      case 'pick': {
        // Hái quả: kiễng chân vươn người, tay phải với lên ngoắc ngoắc, tay trái dang giữ thăng bằng, ngước nhìn.
        const w = Math.sin(a * 4);
        const e = smr(a, 0, 0.45);
        T.y = 0.04 * e;
        T.squash = 1 + 0.05 * e;
        T.headX = -0.32 * e;
        T.lean = -0.02 * e;
        T.lFootPitch = T.rFootPitch = 0.5 * e;
        T.lFootY = T.rFootY = 0.04 * e;
        this.ik(1, -0.4, 0.66 + 0.03 * w * e, 0.2 + 0.02 * w * e, -1, -0.3, -0.6, 0, 0, 1);
        T.lArmX = 0.35;
        T.lArmZ = 0.65 + 0.05 * w * e;
        T.lElbow = 0.4;
        break;
      }
      case 'release':
        this.poseRelease(a);
        break;
      case 'sit': {
        // Ngồi kiết già: tay đặt trên đùi trước bụng, thở sâu chậm, đầu hơi cúi, đung đưa rất khẽ.
        this.seat(1);
        breath = 1.25;
        T.headX = 0.12 + 0.025 * Math.sin(tt * 0.8);
        T.chestRoll = 0.012 * Math.sin(tt * 0.5);
        T.headZ = 0.03 * Math.sin(tt * 0.37);
        this.setKey(0, K_LAP);
        this.setKey(1, K_LAP);
        break;
      }
      case 'kneel': {
        // Quỳ chắp tay dưới cằm.
        this.seat(0.85);
        T.bend = 0.08;
        T.headX = 0.14 + 0.03 * Math.sin(tt * 0.9);
        this.setKey(0, K_GASSHO);
        this.setKey(1, K_GASSHO);
        break;
      }
      case 'prostrate':
        this.poseProstrate(a);
        break;
      case 'bow': {
        // Cúi chào từ eo (vạt dưới đứng yên), chắp tay; nhịp cúi ~2,6 s.
        const b = smr(a, 0.25, 0.7) * (0.5 - 0.5 * Math.cos(Math.max(0, a - 0.25) * 2.4));
        T.bend = 0.04 + 0.66 * b;
        T.lean = 0.03 * b;
        T.headX = 0.12 + 0.22 * b;
        this.setKey(0, K_GASSHO);
        this.setKey(1, K_GASSHO);
        break;
      }
      case 'pray': {
        // Chắp tay niệm: đầu gật khẽ, thân đung đưa nhẹ.
        T.bend = 0.06;
        T.headX = 0.15 + 0.06 * Math.sin(a * 2);
        T.chestRoll = 0.015 * Math.sin(a * 0.9);
        this.setKey(0, K_GASSHO);
        this.setKey(1, K_GASSHO);
        break;
      }
      case 'strike':
        this.poseStrike(a);
        break;
      case 'pull':
        this.posePull(a);
        break;
      case 'shake': {
        // Lắc bình pha chế: hai tay giữ bình trước cằm lắc nhanh, người nảy theo.
        const s = Math.sin(a * 26);
        const e = smr(a, 0, 0.25);
        T.y = 0.012 * (0.5 - 0.5 * Math.cos(a * 13)) * e;
        T.squash = 1 - 0.015 * s * e;
        T.headZ = 0.1 * e;
        T.headX = 0.05;
        T.chestRoll = 0.025 * s * e;
        // Hai tay chụm trước cằm: khép vai để khuỷu gập, cẳng tay không áp ngực.
        T.lShoulder = T.rShoulder = 1;
        this.ik(1, -0.12 - 0.01 * s * e, 0.42 + 0.025 * s * e, 0.38, -1, -0.45, 0, 1, 0, 0);
        this.ik(0, 0.12 - 0.01 * s * e, 0.42 + 0.025 * s * e, 0.38, 1, -0.45, 0, -1, 0, 0);
        break;
      }
      case 'drink':
        this.poseDrink(a);
        break;
      case 'dj': {
        // DJ: tay trái áp tai nghe, tay phải cào đĩa, gật gù + nhún theo nhịp.
        const b = a * 8.5;
        T.y = 0.03 * (0.5 - 0.5 * Math.cos(b));
        T.squash = 1 - 0.03 * (0.5 + 0.5 * Math.cos(b)) + 0.015;
        T.headX = 0.08 + 0.13 * Math.sin(b);
        T.headZ = 0.12;
        T.chestRoll = -0.04;
        T.twist = 0.05 * Math.sin(b * 0.5);
        this.ik(0, 0.43, 0.6, 0.02, 1, -0.6, -0.5, -1, 0, 0);
        this.ik(1, -0.39 + 0.035 * Math.sin(a * 9), 0.13, 0.31 + 0.03 * Math.cos(a * 9), -1, -0.5, -0.5, 0, -1, 0);
        break;
      }
      case 'dance':
        this.poseDance(a);
        breath = 0.5;
        break;
      case 'dance2':
        this.poseDance2(a);
        breath = 0.5;
        break;
      case 'dance3':
        this.poseDance3(a);
        breath = 0.4;
        break;
      case 'wave':
        this.poseWave(a, inp);
        break;
      case 'laugh': {
        // Cười lớn: ngả ra sau ở eo, ôm bụng, rung bần bật, lắc lư.
        const e = smr(a, 0, 0.3);
        const shake = 0.5 - 0.5 * Math.cos(a * 18);
        T.bend = -0.14 * e;
        T.lean = -0.02 * e;
        T.headX = -0.26 * e;
        T.y = 0.014 * shake * e;
        T.squash = 1 - 0.02 * shake * e;
        T.chestRoll = 0.05 * Math.sin(a * 9) * e;
        T.headZ = -0.06 * Math.sin(a * 9) * e;
        this.setKey(0, K_BELLY);
        this.setKey(1, K_BELLY);
        T.lArmX += 0.04 * shake;
        T.rArmX += 0.04 * shake;
        break;
      }
      case 'clap':
        this.poseClap(a, inp);
        break;
      case 'cry':
        this.poseCry(a);
        break;
      case 'angry':
        this.poseAngry(a);
        break;
      case 'cheer':
        this.poseCheer(a, inp);
        break;
      case 'stumble':
        this.poseStumble(a);
        break;
    }

    // Thở (vỏ thân trên co giãn), vai nhô theo nhịp thở khi tay rảnh.
    T.breath += 0.017 * B * breath;
    if (anim === 'idle' || anim === 'walk') {
      T.lArmZ += 0.01 * B;
      T.rArmZ += 0.01 * B;
    }
    T.headX -= 0.01 * B * breath;

    this.layerDrunk(tt, anim);
    this.layerGrip(inp, a);
    this.layerLeftBusy(inp, a, tt);

    // Thân quay theo hướng bước (lò xo, đường ngắn nhất); đầu quay ngược một phần để nhìn theo hướng nhìn.
    T.turn = inp.moveYaw === null ? 0 : inp.moveYaw;
    T.headY += clamp(-Math.sin(this.x[I_TURN]!) * 0.42, -0.45, 0.45);
    this.alignArms();
    this.layerSecondary();
  }

  /** Ngồi/quỳ: vạt dưới xoè trên sàn (hông suy từ sit), chân thu vào trong áo. */
  private seat(s: number): void {
    const T = this.T;
    T.sit = s;
    T.tuck = 1;
    T.hipsY = lerp(BODY.hipsY, BODY.sitHipsY, s);
    T.lFootX = T.rFootX = -0.05;
    T.lFootZ = T.rFootZ = 0.06;
  }

  /** Một cú bật nhảy (t giây cục bộ): nhún lấy đà trong `pre`, bay parabol cao `hgt` trong `air`, tiếp đất dẹt rồi lắng trong `post`. */
  private hop(t: number, pre: number, air: number, post: number, hgt: number, sq: number): number {
    const T = this.T;
    if (t <= 0 || t >= pre + air + post) return 0;
    let squash: number;
    let y = 0;
    if (t < pre) {
      const u = t / pre;
      squash = u < 0.65 ? lerp(1, 1 - sq, sm(u / 0.65)) : lerp(1 - sq, 1 + sq * 0.6, sm((u - 0.65) / 0.35));
    } else if (t < pre + air) {
      const u = (t - pre) / air;
      y = hgt * 4 * u * (1 - u);
      squash = u < 0.5 ? lerp(1 + sq * 0.6, 1 + sq * 0.25, sm(u / 0.5)) : lerp(1 + sq * 0.25, 1 + sq * 0.1, sm((u - 0.5) / 0.5));
    } else {
      const u = (t - pre - air) / post;
      squash = u < 0.35 ? lerp(1 + sq * 0.1, 1 - sq * 0.9, sm(u / 0.35)) : lerp(1 - sq * 0.9, 1, sm((u - 0.35) / 0.65));
    }
    T.y += y;
    T.squash *= squash;
    // Chân nhấc theo người khi bay (bàn chân không gắn vào khớp nảy) + co lên chút cho dễ thương.
    const tuck = t > pre && t < pre + air ? 0.025 * arc((t - pre) / air) : 0;
    T.lFootY += y + tuck;
    T.rFootY += y + tuck;
    return y;
  }

  // ── Tư thế từng hoạt ảnh ──

  private poseIdle(tt: number, time: number, carry: boolean): void {
    const T = this.T;
    const S = Math.sin(tt * 0.55 + 1.3);
    T.roll = 0.02 * S;
    T.chestRoll = -0.012 * S;
    T.headZ = -0.025 * S + 0.04 * Math.sin(tt * 0.7);
    T.headX = 0.02 * Math.sin(tt * 0.45);
    T.lArmX = 0.1 + 0.035 * Math.sin(tt * 1.3);
    T.rArmX = 0.1 + 0.035 * Math.sin(tt * 1.3 + 1);
    T.lArmZ = T.rArmZ = ARM_OUT;
    T.lElbow = 0.24 + 0.05 * Math.sin(tt * 1.1);
    T.rElbow = 0.24 + 0.05 * Math.sin(tt * 1.1 + 0.8);
    if (!this.fKind) return;
    const u = (time - this.fStart) / this.fDur;
    const d = this.fDir;
    switch (this.fKind) {
      case F_LOOK: {
        // Ngó sang một bên, dừng một nhịp rồi quay về.
        const e = smr(u, 0, 0.25) * (1 - smr(u, 0.68, 1));
        T.headY += 0.6 * d * e;
        T.chestTwist += 0.1 * d * e;
        T.headZ -= 0.06 * d * e;
        T.headX -= 0.04 * e;
        break;
      }
      case F_TILT: {
        const e = smr(u, 0, 0.3) * (1 - smr(u, 0.65, 1));
        T.headZ += 0.3 * d * e;
        T.headX -= 0.06 * e;
        T.chestRoll += 0.04 * d * e;
        T.roll += 0.012 * d * e;
        break;
      }
      case F_HOP: {
        // Nhún nhảy tại chỗ: lấy đà dẹt, bật lên vươn dài, tiếp đất dẹt; tay vẫy nhẹ.
        const t = u * this.fDur;
        this.hop(t, 0.22, 0.32, 0.4, 0.075, 0.09);
        const e = arc(sat((t - 0.12) / 0.6));
        if (!carry) {
          T.lArmZ += 0.35 * e;
          T.rArmZ += 0.35 * e;
          T.lElbow += 0.3 * e;
          T.rElbow += 0.3 * e;
        }
        T.headX -= 0.08 * e;
        break;
      }
      case F_SWING: {
        if (carry) break;
        const e = arc(u);
        const w = Math.sin(u * TAU * 2);
        T.lArmX += 0.45 * w * e;
        T.rArmX -= 0.45 * w * e;
        T.lElbow += 0.2 * e;
        T.rElbow += 0.2 * e;
        T.twist += 0.07 * w * e;
        T.headZ += 0.05 * w * e;
        break;
      }
      case F_SMILE: {
        const e = smr(u, 0, 0.25) * (1 - smr(u, 0.7, 1));
        T.headZ += 0.1 * d * e;
        T.headX -= 0.05 * e;
        break;
      }
      case F_ROCK: {
        // Đung đưa gót ↔ mũi chân.
        const e = arc(u);
        const w = Math.sin(u * TAU * 2);
        T.lean += 0.035 * w * e;
        T.lFootPitch = T.rFootPitch = 0.22 * Math.max(0, w) * e - 0.12 * Math.max(0, -w) * e;
        T.y += 0.012 * Math.max(0, w) * e;
        T.headX -= 0.03 * w * e;
        break;
      }
    }
  }

  /** Đi/chạy: nhịp bước theo tốc độ, 2 lần nhún mỗi chu kỳ (dẹt khi chạm đất, vươn khi chuyển chân), lạch bạch, vung tay. */
  private poseWalk(carry: boolean): void {
    const T = this.T;
    const sp = this.speed;
    const k = clamp(sp / MOVE.speed, 0, 1);
    const g = smr(sp, 0.05, 0.9);
    const ph = this.phase;
    const f = this.cadence(sp) * 0.5;
    const S = 0.6 - 0.1 * k;
    // Sải chân lúc trụ = đúng quãng mặt đất trôi (chân không trượt), giới hạn trong vạt áo.
    const A = Math.min((sp * S) / (2 * f), carry ? 0.12 : 0.15);
    const H = g * (0.045 + 0.035 * k);
    this.foot(0, ph, A, H, S, g);
    this.foot(1, frac(ph + 0.5), A, H, S, g);

    const c2 = Math.cos(TAU * (2 * ph - 0.08));
    const hb = g * (0.022 + 0.04 * k) * (carry ? 0.75 : 1);
    T.y = hb * 0.5 * (1 - c2);
    const pos = Math.max(0, c2);
    const neg = Math.max(0, -c2);
    T.squash = 1 - g * (0.03 + 0.04 * k) * pos * pos + g * (0.015 + 0.025 * k) * neg * neg;
    T.lean = clamp(g * (0.03 + 0.06 * k) + clamp(this.accel * 0.008, -0.05, 0.04) - (carry ? 0.02 : 0), -0.07, 0.1);
    const sp1 = Math.sin(TAU * ph);
    const cp1 = Math.cos(TAU * ph);
    T.roll = -g * (0.035 + 0.02 * k) * sp1;
    T.twist = -g * 0.07 * cp1;
    T.chestTwist = g * 0.1 * cp1;
    T.chestRoll = -0.4 * T.roll;
    T.headZ = -0.5 * (T.roll + T.chestRoll);
    T.headX = -0.4 * T.lean + g * 0.035 * Math.sin(TAU * 2 * ph - 1.2);
    T.headY = -0.6 * (T.twist + T.chestTwist);
    // Vung tay ngược chân (trễ chút), khuỷu gập thêm khi tay ra trước.
    const sw = g * (0.32 + 0.3 * k);
    const sa = Math.cos(TAU * ph - 0.35);
    T.lArmX = 0.1 - sw * sa;
    T.rArmX = 0.1 + sw * sa;
    T.lArmZ = ARM_OUT + g * 0.03;
    T.rArmZ = ARM_OUT + g * 0.03;
    const bl = 0.5 - 0.5 * sa;
    const br = 0.5 + 0.5 * sa;
    T.lElbow = 0.25 + g * 0.12 + sw * 0.55 * bl * bl;
    T.rElbow = 0.25 + g * 0.12 + sw * 0.55 * br * br;
  }

  /**
   * Bàn chân `side` ở pha cục bộ u (0 = chạm gót): trụ [0, S) lùi đều từ +A về −A (bám đất), nhấc [S, 1) theo cung êm
   * (Hermite, vận tốc khớp lúc trụ) + nhấc cao H; gót chạm (mũi hếch) → bàn chân phẳng → nhón mũi lúc rời đất.
   */
  private foot(side: 0 | 1, u: number, A: number, H: number, S: number, g: number): void {
    const T = this.T;
    const heel = -0.22 * g;
    const toe = 0.45 * g;
    let z: number;
    let y = 0;
    let p: number;
    if (u < S) {
      const s = u / S;
      z = A * (1 - 2 * s);
      p = heel * (1 - smr(s, 0, 0.18)) + toe * smr(s, 0.6, 1);
    } else {
      const s = (u - S) / (1 - S);
      const m = (-2 * A * (1 - S)) / S;
      const s2 = s * s;
      const s3 = s2 * s;
      z = (2 * s3 - 3 * s2 + 1) * -A + (s3 - 2 * s2 + s) * m + (-2 * s3 + 3 * s2) * A + (s3 - s2) * m;
      y = H * arc(s);
      p = lerp(toe, heel, sm(s));
    }
    if (side === 0) {
      T.lFootZ = z;
      T.lFootY = y;
      T.lFootPitch = p;
    } else {
      T.rFootZ = z;
      T.rFootY = y;
      T.rFootPitch = p;
    }
  }

  private poseSweep(a: number): void {
    // Quét lá: tay phải nắm chổi bên hông phải (chổi nối dài cẳng tay, đầu chổi quẹt sát đất phía trước), tay trái chống
    // nạnh; vặn hông + thân qua lại ~1,1 Hz, mỗi nhát nhún nhẹ, đầu nhìn theo chổi.
    const T = this.T;
    const s = Math.sin(a * 7);
    const e = smr(a, 0, 0.35);
    T.bend = 0.12;
    T.lean = 0.02;
    T.twist = 0.24 * s * e;
    T.chestTwist = 0.1 * s * e;
    T.headY = 0.2 * s * e;
    T.headX = 0.26;
    const b = (0.5 - 0.5 * Math.cos(a * 14)) * e;
    T.y = 0.008 * b;
    T.squash = 1 - 0.02 * b;
    // Đầu chổi quẹt vòng cung sát đất trước người theo hướng vặn thân, cuối mỗi nhát hất nhẹ lên.
    const flick = smr(Math.abs(s), 0.75, 1) * e;
    this.broomAim(-0.2 + 0.42 * s * e, 0.02 + 0.05 * flick, 1.12 - 0.04 * flick, -1, -0.2, -0.6);
    this.ik(0, 0.455, 0.04, 0.07, 1, 0.3, -1, -1, 0, 0);
  }

  private poseChop(a: number): void {
    // Chẻ củi 2 nhát/giây: giơ chậm trước cằm (vươn người, lấy đà), khựng một nhịp → bổ xuống nhanh dần → dội nhẹ khi trúng.
    const T = this.T;
    const c = frac(a * 2);
    const up = c < 0.42 ? sm(c / 0.42) : c < 0.52 ? 1 : c < 0.75 ? 1 - ((c - 0.52) / 0.23) ** 2 : 0;
    const hit = c >= 0.75 ? arc((c - 0.75) / 0.25) : 0;
    const e = smr(a, 0, 0.2);
    T.bend = 0.1 + (1 - up) * 0.2 + hit * 0.05;
    T.lean = 0.02 + (1 - up) * 0.04;
    T.squash = 1 + (up * 0.06 - hit * 0.07) * e;
    T.y = 0.01 * up * e;
    T.headX = 0.12 + (1 - up) * 0.14 - up * 0.12;
    this.mixArm(0, K_CHOP_DOWN, K_CHOP_UP, up);
    this.mixArm(1, K_CHOP_DOWN, K_CHOP_UP, up);
    T.lArmX -= 0.08 * hit;
    T.rArmX -= 0.08 * hit;
  }

  private poseRelease(a: number): void {
    // Phóng sinh (~0,83 s/nhịp): cúi bế thấp → đứng lên nâng tay thả, nhún nhẹ → hạ tay về.
    const T = this.T;
    const c = frac(a * 1.2);
    const down = c < 0.45 ? sm(c / 0.45) : c < 0.7 ? 1 - sm((c - 0.45) / 0.25) : 0;
    const toss = c < 0.45 ? 0 : arc((c - 0.45) / 0.55);
    T.bend = 0.06 + 0.42 * down;
    T.lean = 0.03 * down;
    T.headX = 0.15 + 0.12 * down - 0.18 * toss;
    T.y = 0.025 * toss;
    T.lFootY = T.rFootY = 0.025 * toss;
    T.squash = 1 - 0.05 * down + 0.05 * toss;
    this.mixArm(0, K_REL_LOW, K_REL_UP, toss);
    this.mixArm(1, K_REL_LOW, K_REL_UP, toss);
  }

  private poseProstrate(a: number): void {
    // Lạy từ thế quỳ: độ cúi đúng prostrateDip (khớp camera góc thứ nhất); vạt dưới nằm yên trên sàn, gập ở eo; tay rời
    // thế chắp, vòng ra ngoài rồi úp xuống vạt áo trước gối khi rạp, ngược lại khi ngẩng lên.
    const T = this.T;
    const d = prostrateDip(a);
    this.seat(0.85);
    // Đang ôm hộp: chỉ cúi vừa (hộp gắn ở ngực, cúi sâu thì hộp lún vào lòng).
    const deep = this.carrying ? 0.4 : 1.25;
    T.bend = 0.08 + (deep - 0.08) * d;
    T.lean = 0.04 * d;
    T.headX = 0.14 + 0.22 * d;
    const k = smr(d, 0.08, 0.72);
    if (k <= 0) {
      this.setKey(0, K_GASSHO);
      this.setKey(1, K_GASSHO);
      return;
    }
    // Điểm úp tay trên vạt áo trước gối (body space, tay TRÁI) → không gian ngực theo độ cúi hiện tại → IK; trộn với
    // thế chắp trong không gian khớp (vai dạt ra giữa chừng để tay vòng qua gối). Tay phải đối xứng: dùng y nguyên góc.
    QX = 0.26;
    QY = 0.19;
    QZ = 0.55;
    bodyToChest(T);
    const hx = QX;
    const hy = QY;
    const hz = QZ;
    QX = 1;
    QY = 0.3;
    QZ = -0.6;
    dirBodyToChest(T);
    const px = QX;
    const py = QY;
    const pz = QZ;
    QX = 0;
    QY = -1;
    QZ = 0.15;
    dirBodyToChest(T);
    const f = this.arm2;
    f.sh = SH_PLANT;
    solveArmAt(SH_PLANT, hx, hy, hz, px, py, pz, QX, QY, QZ, f);
    alignArm(f, K_GASSHO.armX, K_GASSHO.armY, K_GASSHO.armZ, K_GASSHO.wrist);
    f.armZ += 0.35 * arc(k);
    this.mixArm(0, K_GASSHO, f, k);
    this.mixArm(1, K_GASSHO, f, k);
  }

  private poseStrike(a: number): void {
    // Gõ mõ khi ngồi (mỗi lần bấm ~0,2 s): dùi nhấc lên chút lấy đà rồi gõ nhanh xuống mõ trước mặt, nảy lại; tay trái để yên trên đùi.
    const T = this.T;
    this.seat(1);
    T.headX = 0.15;
    T.bend = 0.1;
    const p = frac(a * 2);
    const lift = p < 0.06 ? sm(p / 0.06) : p < 0.16 ? 1 - ((p - 0.06) / 0.1) ** 2 : 0;
    const hit = p >= 0.16 ? arc((p - 0.16) / 0.5) : 0;
    T.y = 0;
    T.bend += 0.04 * hit;
    T.squash = 1 - 0.02 * hit;
    this.ik(1, -0.36, 0.08 + 0.13 * lift + 0.05 * (1 - lift - hit), 0.31 + 0.02 * lift, -1, -0.4, -0.6, 0, -1, 0);
    this.setKey(0, K_LAP);
  }

  private posePull(a: number): void {
    // Kéo dây chuông: hai tay giơ cao bên đầu nắm dây ↔ kéo xuống trước ngực (nhún người, cúi, nhìn lên).
    const T = this.T;
    const p = 0.5 + 0.5 * Math.sin(a * 3 - Math.PI / 2);
    const e = smr(a, 0, 0.4);
    T.squash = 1 - 0.06 * p * e;
    T.bend = 0.14 * p * e;
    T.lean = -0.02 + 0.03 * p;
    T.headX = (-0.22 + 0.15 * p) * e;
    for (let si = 0; si < 2; si++) {
      const side: 0 | 1 = si === 0 ? 0 : 1;
      const m = side === 0 ? 1 : -1;
      this.ik(side, lerp(0.42, 0.24, p) * m, lerp(0.62, 0.3, p), lerp(0.15, 0.37, p), m, -0.6, -0.3, -m, 0.3, 0);
    }
  }

  private poseDrink(a: number): void {
    // Uống: nâng ly lên tới cằm, ngửa đầu ực ực, cuối cùng "hức" một cái nhún vai.
    const T = this.T;
    const up = smr(a, 0, 0.35);
    const gulp = a > 0.35 ? 0.5 - 0.5 * Math.cos((a - 0.35) * 14) : 0;
    const hic = arc((a - 0.9) / 0.3);
    T.headX = -0.32 * up + 0.04 * gulp * up - 0.1 * hic;
    T.bend = -0.06 * up;
    T.lean = -0.02 * up;
    T.y = 0.02 * hic;
    T.lFootY = T.rFootY = 0.02 * hic;
    T.squash = 1 + 0.04 * hic;
    this.ik(1, lerp(-0.36, -0.13, up), lerp(0.12, 0.55, up), lerp(0.3, 0.33, up), -1, -0.8, -0.3, 1, 0, 0);
    T.lArmZ = ARM_OUT;
    T.lElbow = 0.3;
  }

  private poseDance(a: number): void {
    // Nhảy: nhún đều theo phách (~2,5 nhịp/giây), hai tay thay phiên vung lên chéo ngoài, lắc hông, bước chân đổi bên.
    const T = this.T;
    const fb = 8 / Math.PI;
    const e = smr(a, 0, 0.3);
    const c = Math.cos(TAU * fb * a);
    T.y = 0.055 * (0.5 - 0.5 * c) * e;
    T.squash = 1 + (0.04 * (0.5 - 0.5 * c) - 0.06 * (0.5 + 0.5 * c)) * e;
    const w = Math.sin(Math.PI * fb * a);
    T.twist = 0.32 * w * e;
    T.chestTwist = 0.12 * w * e;
    T.roll = 0.03 * w * e;
    T.headZ = 0.14 * Math.sin(Math.PI * fb * a + 0.5) * e;
    T.headX = -0.04 + 0.05 * c * e;
    const kl = sm(0.5 + 0.5 * w);
    this.mixArm(0, K_LOW, K_UP, kl * e);
    this.mixArm(1, K_LOW, K_UP, (1 - kl) * e);
    // Bước: chân bên tay đang giơ nhấc nhẹ, dạt ra ngoài.
    const lift = 0.5 - 0.5 * c;
    T.lFootY = 0.04 * Math.max(0, w) * lift * e;
    T.rFootY = 0.04 * Math.max(0, -w) * lift * e;
    T.lFootX = 0.03 * w * e;
    T.rFootX = -0.03 * w * e;
  }

  private poseDance2(a: number): void {
    // Nhảy kiểu 2: hai tay giơ chữ V lắc cổ tay, thân trên lắc lư sang hai bên, nhún nhanh.
    const T = this.T;
    const e = smr(a, 0, 0.3);
    const s = Math.sin(a * 5);
    const c = Math.cos(a * 10);
    T.y = 0.045 * (0.5 - 0.5 * c) * e;
    T.squash = 1 + (0.03 * (0.5 - 0.5 * c) - 0.05 * (0.5 + 0.5 * c)) * e;
    T.roll = 0.05 * s * e;
    T.chestRoll = 0.16 * s * e;
    T.headZ = -0.08 * s * e;
    T.headX = -0.08 * e;
    this.mixArm(0, K_REST, K_UP, e);
    this.mixArm(1, K_REST, K_UP, e);
    T.lWrist += 0.6 * Math.sin(a * 10) * e;
    T.rWrist += 0.6 * Math.sin(a * 10 + 1) * e;
    T.lFootY = 0.03 * Math.max(0, s) * e;
    T.rFootY = 0.03 * Math.max(0, -s) * e;
  }

  private poseDance3(a: number): void {
    // Nhảy kiểu 3 (Perfect): bật nhảy xoay nửa vòng mỗi cú (~0,63 s), dang tay như cánh máy bay, tiếp đất dẹt.
    const T = this.T;
    const P = Math.PI / 5;
    const n = Math.floor(a / P);
    const t = a - n * P;
    this.hop(t, 0.12, 0.34, P - 0.46, 0.17, 0.1);
    const air = smr(t, 0.1, 0.52);
    T.spin = Math.PI * (n + air) - this.spinOff;
    const e = smr(a, 0, 0.2);
    T.lArmZ = lerp(0.34, 1.3, e) - 0.25 * arc(sat((t - 0.4) / 0.22));
    T.rArmZ = T.lArmZ;
    T.lArmX = T.rArmX = 0.25 * e;
    T.lElbow = T.rElbow = 0.25;
    T.headX = -0.1 * e;
  }

  private poseWave(a: number, inp: MotionInput): void {
    // Vẫy chào: nhún lấy đà, giơ tay phải lên bên đầu (bật nhẹ), cẳng tay + cổ tay vẫy qua lại, nghiêng đầu về tay vẫy.
    // Tay phải cầm chổi thì vẫy tay trái (nếu rảnh); cả hai tay bận thì chỉ nhún + nghiêng đầu.
    const T = this.T;
    this.hop(a, 0.14, 0.2, 0.3, 0.035, 0.06);
    const up = smr(a, 0.08, 0.38);
    const w = Math.sin((a - 0.3) * 12) * smr(a, 0.3, 0.5);
    const side: 0 | 1 = inp.grip === 'tool' ? 0 : 1;
    const m = side === 0 ? 1 : -1;
    if (side === 1 || !inp.leftBusy) {
      // Đường giơ tay vòng ra ngoài-trước (đi thẳng thì bàn tay lướt sát vai, khuỷu gập gắt rồi tay quất vòng); lòng bàn
      // tay từ quay vào trong (tay buông) sang quay ra trước (tay giơ) — không bao giờ song song cẳng tay.
      const bul = Math.sin(Math.PI * up);
      const hx = m * (lerp(0.4, 0.45 - 0.05 * w, up) + 0.12 * bul);
      this.ik(side, hx, lerp(0.0, 0.57, up), lerp(0.12, 0.16, up) + 0.14 * bul, m, -0.9, 0.1, -m * (1 - up), 0, 0.3 + up);
      if (side === 1) T.rWrist += 0.35 * w;
      else T.lWrist += 0.35 * w;
    }
    T.headZ = -m * 0.14 * up;
    T.chestRoll = -m * (0.04 * up + 0.02 * w);
    T.headX = -0.04 * up;
    if (side === 1) {
      T.lArmZ = ARM_OUT;
      T.lArmX = 0.12;
    }
  }

  private poseClap(a: number, inp: MotionInput): void {
    // Vỗ tay ~3 nhịp/giây dưới cằm (lòng bàn tay chạm đúng nhau), mỗi tiếng vỗ nhún nhẹ.
    const T = this.T;
    const e = smr(a, 0, 0.25);
    const c = frac(a * 3.2);
    // 0 = chạm (giữ một chút), mở ra rồi đập vào nhanh.
    const open = c < 0.12 ? 0 : c < 0.55 ? sm((c - 0.12) / 0.43) : 1 - sm((c - 0.55) / 0.45);
    const o = open * e;
    T.y = 0.012 * o;
    T.squash = 1 - 0.025 * (1 - o) * e + 0.01 * o;
    T.headX = 0.04 - 0.04 * o;
    T.headZ = 0.08 * Math.sin(a * 3.2 * Math.PI) * e;
    if (inp.leftBusy) {
      // Tay trái đang cầm đồ: tay phải vỗ nhẹ lên bụng (vai phải khép như K_BELLY).
      T.rShoulder = 1;
      this.ik(1, -0.25, 0.2 + 0.03 * o, 0.4 + 0.02 * o, -1, -0.4, 0.2, 0, 0, -1);
      return;
    }
    this.mixArm(0, K_GASSHO, K_CLAP_OPEN, o);
    this.mixArm(1, K_GASSHO, K_CLAP_OPEN, o);
  }

  private poseCry(a: number): void {
    // Khóc: hai nắm tay dụi dưới mắt (ngang gò má), cúi đầu, vai nấc từng hồi.
    const T = this.T;
    const e = smr(a, 0, 0.35);
    const sob = Math.pow(0.5 - 0.5 * Math.cos(a * 11), 2);
    T.headX = 0.24 * e;
    T.bend = 0.08 * e;
    T.y = 0.012 * sob * e;
    T.squash = 1 - 0.02 * sob * e;
    T.headZ = 0.05 * Math.sin(a * 2.3) * e;
    T.chestRoll = 0.02 * Math.sin(a * 5.5) * e;
    for (let si = 0; si < 2; si++) {
      const side: 0 | 1 = si === 0 ? 0 : 1;
      const m = side === 0 ? 1 : -1;
      const r = Math.sin(a * 9 + side * Math.PI);
      // Điểm trước gò má (head-local) → ngực theo góc đầu đích.
      QX = (0.27 + 0.01 * r) * m;
      QY = 0.11 + 0.012 * r;
      QZ = 0.3;
      headToChest(T);
      this.ik(side, lerp(0.38 * m, QX, e), lerp(0.1, QY, e), lerp(0.25, QZ, e), m, -0.7, -0.3, 0, 0, -1);
    }
  }

  private poseAngry(a: number): void {
    // Giận dỗi: dậm chân thay phiên (nhấc → dậm mạnh, người giật dẹt), nắm tay duỗi thẳng xuống, cúi gằm, run run.
    const T = this.T;
    const e = smr(a, 0, 0.25);
    const per = 0.9;
    for (let si = 0; si < 2; si++) {
      const side: 0 | 1 = si === 0 ? 0 : 1;
      const t = frac(a / per + side * 0.5) * per;
      const lift = t < 0.22 ? sm(t / 0.22) : t < 0.3 ? 1 - ((t - 0.22) / 0.08) ** 2 : 0;
      const y = 0.065 * lift * e;
      if (side === 0) T.lFootY = y;
      else T.rFootY = y;
      const stomp = arc(sat((t - 0.3) / 0.22));
      T.squash -= 0.07 * stomp * e;
      T.roll += (side === 0 ? -0.025 : 0.025) * lift * e;
    }
    T.headX = 0.14 * e;
    T.headZ = 0.04 * Math.sin(a * 14) * e;
    T.chestRoll = 0.02 * Math.sin(a * 14 + 1) * e;
    T.lArmX = T.rArmX = -0.06;
    T.lArmZ = T.rArmZ = 0.52;
    T.lElbow = T.rElbow = 0.1;
    T.lArmX += 0.04 * Math.sin(a * 14) * e;
    T.rArmX += 0.04 * Math.sin(a * 14 + 2) * e;
  }

  private poseCheer(a: number, inp: MotionInput): void {
    // Hoan hô: nhảy cẫng liên tục (dẹt khi lấy đà, vươn dài khi bay), hai tay giơ chữ V vung theo mỗi cú.
    const T = this.T;
    const P = 0.55;
    const t = a % P;
    this.hop(t, 0.13, 0.27, P - 0.4, 0.13, 0.11);
    const e = smr(a, 0, 0.2);
    const land = arc(sat((t - 0.38) / 0.17));
    T.headX = -0.18 * e;
    const busy = !!inp.leftBusy;
    this.mixArm(1, K_REST, K_UP, e);
    T.rArmZ -= 0.15 * land;
    T.rWrist += 0.4 * Math.sin(a * 12) * e;
    if (!busy) {
      this.mixArm(0, K_REST, K_UP, e);
      T.lArmZ -= 0.15 * land;
      T.lWrist += 0.4 * Math.sin(a * 12 + 1) * e;
    }
  }

  private poseStumble(a: number): void {
    // Loạng choạng: thân trên chao đảo, hông lắc nhẹ (gấu không chạm sàn), tay chới với, chân bước vội lấy thăng bằng.
    const T = this.T;
    const e = smr(a, 0, 0.2);
    T.roll = 0.08 * Math.sin(a * 9) * e;
    T.chestRoll = 0.22 * Math.sin(a * 9 - 0.7) * e;
    T.bend = 0.12 * Math.sin(a * 5) * e;
    T.lean = 0.04 * Math.sin(a * 5 + 0.5) * e;
    T.headZ = -0.15 * Math.sin(a * 9 - 1.4) * e;
    T.headX = 0.08 * Math.sin(a * 6) * e;
    const w = Math.sin(a * 13);
    T.lArmZ = 0.9 + 0.35 * w * e;
    T.rArmZ = 0.9 - 0.35 * w * e;
    T.lArmX = 0.5 + 0.4 * w * e;
    T.rArmX = 0.5 - 0.4 * w * e;
    T.lElbow = T.rElbow = 0.5;
    const s = Math.sin(a * 9);
    T.lFootY = 0.04 * Math.max(0, s) * e;
    T.rFootY = 0.04 * Math.max(0, -s) * e;
    T.lFootX = 0.04 * s * e;
    T.rFootX = -0.04 * s * e;
    T.lFootZ = 0.05 * Math.cos(a * 9) * e;
    T.rFootZ = -0.05 * Math.cos(a * 9) * e;
  }

  // ── Lớp chung ──

  private layerDrunk(tt: number, anim: AnimId): void {
    const k = sat((this.drunk - 30) / 70);
    if (k <= 0) return;
    const T = this.T;
    const ds = T.sit > 0.5 ? 0.4 : anim === 'walk' || anim === 'idle' ? 1 : 0.6;
    T.roll += 0.05 * k * ds * Math.sin(tt * 1.7);
    T.chestRoll += 0.08 * k * ds * Math.sin(tt * 1.7 - 0.7);
    T.headZ += 0.14 * k * Math.sin(tt * 1.3 + 0.4);
    T.lean += 0.03 * k * ds * Math.sin(tt * 1.1);
    T.headX += 0.05 * k * Math.sin(tt * 0.9);
    T.twist += 0.05 * k * ds * Math.sin(tt * 0.6);
  }

  /** Cầm đồ: hộp ôm hai tay, vật đứng (ly, đèn…) cầm trước người, chổi chĩa xuống đất phía trước. */
  private layerGrip(inp: MotionInput, a: number): void {
    const g = inp.grip;
    if (!g) return;
    const anim = inp.anim;
    const T = this.T;
    if (g === 'carry') {
      if (anim !== 'wave') this.setKey(1, K_CARRY);
      if (inp.leftBusy !== 'staff') this.setKey(0, K_CARRY);
      return;
    }
    const free = anim === 'idle' || anim === 'walk' || anim === 'carry_idle' || anim === 'carry_walk';
    const walk = anim === 'walk' || anim === 'carry_walk';
    const sw = walk ? 0.03 * Math.sin(TAU * this.phase) * smr(this.speed, 0.05, 0.9) : 0;
    if (g === 'upright') {
      if (free || HANDS_TOGETHER.has(anim)) {
        // Vật đứng trước bụng: vai phải khép vừa, khuỷu dạt ra — cẳng tay không áp vào bụng.
        T.rShoulder = 0.7;
        this.ik(1, -0.3, 0.17 + sw, 0.37, -1, -0.6, 0.1, 1, 0, 0);
      }
    } else if (anim !== 'sweep') {
      // Chổi (nối dài cẳng tay) trong MỌI hoạt ảnh trừ quét (quét tự lái đầu chổi): đầu chổi tì đất trước chân phải —
      // tay làm động tác khác thì chổi (dài 1,2 m) sẽ đâm xuống sàn; đi thì nhấc đầu chổi khỏi đất, lắc nhẹ theo bước.
      // Điểm tì đất xoay theo hướng vặn thân (nhảy, lắc hông): tay cầm chổi luôn ở trước-bên phải, không bị thân xoay đè vào.
      const lift = walk ? smr(this.speed, 0.05, 0.9) : 0;
      const yaw = T.twist + T.chestTwist;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      // Cúi / ngồi (vai đổ ra trước, vạt áo xoè trên sàn) hay nghiêng về bên phải: tì chổi xa hơn để bàn tay không chạm
      // thân, vạt áo.
      const gx = -0.4 - 0.12 * T.sit - 0.4 * Math.max(0, T.roll + T.chestRoll);
      const gz = 1.12 + 2 * sw + 0.3 * sat(T.bend) + 0.2 * T.sit;
      this.broomAim(gx * c + gz * sn, 0.03 + 0.09 * lift + 0.04 * Math.max(0, sw * 33), gz * c - gx * sn, -1, -0.3, -0.4);
    }
  }

  /** Tay trái cầm tích trượng (luôn ở bên hông trái, không vào giữa, không quá vai) hoặc quạt (trước ngực trái). */
  private layerLeftBusy(inp: MotionInput, a: number, tt: number): void {
    const busy = inp.leftBusy;
    if (!busy) return;
    const T = this.T;
    // Tay trái cầm tích trượng không khép vai (gậy luôn bên hông, xa đầu); quạt khép vừa (bên dưới).
    T.lShoulder = 0;
    if (busy === 'staff') {
      // Neo theo hông (chỉ quay ngang theo twist): không theo cúi/nghiêng ngực → gậy đứng yên khi lạy, cúi chào.
      const sq = Math.max(0.5, T.squash);
      const s = 1 / Math.sqrt(sq);
      const walk = inp.anim === 'walk' || inp.anim === 'carry_walk';
      const thump = walk ? 0.03 * Math.sin(TAU * this.phase) * smr(this.speed, 0.05, 0.9) : 0;
      // Cúi sâu (lạy, chào) thì hạ tay theo (vẫn dưới vai); thân/đầu nghiêng về phía gậy thì đẩy tay ra ngoài (mũ Tỳ Lư
      // rộng: hệ số 0.7 giữ cán cách vành mũ ≥ 6 cm cả khi say + loạng choạng). Hông nghiêng ra xa gậy thì vạt dưới văng về
      // phía gậy (cán thẳng đứng, đáy vạt cách tay ~0.56 m) → cũng đẩy tay ra. Ngồi/quỳ: vạt dưới xoè trên sàn tới r ≈ 0.6
      // → tay ra thêm 16 cm, gậy đứng ngoài mép vạt (không cắm xuyên vạt áo nằm trên sàn).
      const toward = Math.max(0, -(T.roll + T.chestRoll + 0.6 * T.headZ));
      QX = Math.max(0.47, 0.455 / s) + 0.7 * toward + 0.6 * Math.max(0, T.roll) + 0.16 * sat(T.sit);
      QY = 0.31 - 0.1 * sat(T.bend);
      QZ = 0.17 + thump;
      yawHipsToChest(T);
      const hx = QX;
      const hy = QY;
      const hz = QZ;
      // Khuỷu: đứng thì chĩa ra ngoài-xuống-sau; cúi sâu (vai đổ ra trước bàn tay) thì chỉ ra ngoài — cực không bao giờ
      // trùng phương vai→tay (trùng thì khuỷu lật vòng, tay giật).
      const u = 1 - smr(T.bend, 0.3, 0.9);
      QX = 1;
      QY = -0.5 * u;
      QZ = -u;
      dirYawHipsToChest(T);
      const px = QX;
      const py = QY;
      const pz = QZ;
      QX = -1;
      QY = 0;
      QZ = 0;
      dirYawHipsToChest(T);
      this.ik(0, hx, hy, hz, px, py, pz, QX, QY, QZ);
      return;
    }
    // Quạt: tay trái cầm quạt trước ngực trái, đứng chơi thì phe phẩy.
    const idle = inp.anim === 'idle' || inp.anim === 'carry_idle';
    const f = idle ? Math.sin(tt * 5.5) : 0;
    T.lShoulder = 0.5;
    this.ik(0, 0.37, 0.24 + 0.015 * f, 0.29, 1, -0.5, 0, -1, 0, 0);
    T.lWrist += 0.45 * f;
  }

  /** Thứ cấp: vạt dưới lắc trễ theo thân, đồ lủng lẳng đung đưa theo gia tốc (lò xo con lắc, không bám chủ động). */
  private layerSecondary(): void {
    const T = this.T;
    const x = this.x;
    const v = this.v;
    const st = 1 - sat(T.sit * 1.6);
    T.skirtX = st * (-0.45 * x[I_LEAN]! + clamp(0.012 * this.accel, -0.08, 0.08));
    T.skirtZ = st * -0.45 * x[I_ROLL]!;
    const pitch = x[I_LEAN]! + x[I_BEND]! + x[I_HX]!;
    const rollAll = x[I_ROLL]! + x[I_CROLL]! + x[I_HZ]!;
    T.swayX = clamp(-0.5 * pitch - 0.1 * (v[I_LEAN]! + v[I_BEND]! + v[I_HX]!) + 0.03 * this.accel, -0.75, 0.75);
    T.swayZ = clamp(-0.5 * rollAll - 0.1 * (v[I_ROLL]! + v[I_CROLL]! + v[I_HZ]!), -0.75, 0.75);
  }
}

/** Hoạt ảnh hai tay chụm trước người: cầm vật đứng ở tay phải thì tay phải giữ vật, tay trái làm một mình. */
const HANDS_TOGETHER = new Set<AnimId>(['pray', 'kneel', 'bow', 'clap', 'cry', 'laugh', 'cheer', 'dance', 'dance2', 'dance3', 'angry', 'stumble', 'sit']);

export const createMotion: CreateMotion = (): MotionDriver => new Motion();
