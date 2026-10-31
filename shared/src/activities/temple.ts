// Kiểu dữ liệu + luật thuần cho các hoạt động cá nhân ở Chùa: Quét lá (7.1), Xách nước (7.3), Phóng sinh (7.5),
// Thiền định (7.4), Đón khách / Nhập kho (7.10).
import { MEDITATE, SWEEP } from '../config/balance';
import type { AnimalId } from '../ids';
import { createRng } from '../util/rng';

// ───────────── Quét lá ─────────────

export interface Leaf {
  id: number;
  /** Vị trí trên tán (bắt đầu rơi). */
  sx: number;
  sz: number;
  /** Vị trí nằm trên đất. */
  x: number;
  z: number;
  spawnAt: number;
  settleAt: number;
}

export interface SweepPublicState {
  leaves: Leaf[];
  /** Người đang cầm chổi lấy từ giá (số chổi còn trên giá = 4 − số này). */
  brooms: number;
}

/** actEvent riêng: số lá trong bao. */
export interface SweepBagEvent {
  count: number;
}

/** actEvent riêng: chữ Tạp niệm bật lên khi quét. */
export interface SweepThoughtEvent {
  id: number;
  word: string;
  key: string;
  expiresAt: number;
}

/** Lá có nằm trong nửa hình tròn phía trước (bán kính r) của người quét đứng ở (x, z) nhìn hướng ry không. */
export function inSweepArc(px: number, pz: number, ry: number, lx: number, lz: number, r = SWEEP.sweepRadius): boolean {
  const dx = lx - px;
  const dz = lz - pz;
  if (dx * dx + dz * dz > r * r) return false;
  return dx * Math.sin(ry) + dz * Math.cos(ry) >= -0.3;
}

// ───────────── Xách nước ─────────────

export interface WaterPublicState {
  /** Mực nước từng chum (số xô) theo id trạm water_jar_N. */
  jars: Record<string, number>;
}

// ───────────── Phóng sinh ─────────────

export interface ReleasePublicState {
  cart: AnimalId[];
}

export const releaseTargetOk = (animal: AnimalId, place: 'pond' | 'forest'): boolean =>
  animal === 'chim' ? place === 'forest' : place === 'pond';

// ───────────── Thiền định ─────────────

export type Disturbance =
  | { at: number; kind: 'mosquito'; key: string }
  | { at: number; kind: 'noise' }
  | { at: number; kind: 'thought'; key: string; word: string };

/** Lịch nhiễu trong 1 phiên thiền (ms tính từ lúc bắt đầu), tất định theo seed. */
export function meditationSchedule(seed: number, words: readonly string[]): Disturbance[] {
  const rng = createRng(seed);
  const out: Disturbance[] = [];
  const keys = ['J', 'K', 'L', 'U', 'I', 'O'];
  let t = rng.range(MEDITATE.disturbMinMs, MEDITATE.disturbMaxMs);
  while (t < MEDITATE.durationMs - 2000) {
    const r = rng.next();
    if (r < 0.4) out.push({ at: Math.round(t), kind: 'mosquito', key: rng.pick(keys) });
    else if (r < 0.7) out.push({ at: Math.round(t), kind: 'noise' });
    else out.push({ at: Math.round(t), kind: 'thought', key: rng.pick(keys), word: rng.pick(words) });
    t += rng.range(MEDITATE.disturbMinMs, MEDITATE.disturbMaxMs);
  }
  return out;
}

/** Thưởng thiền theo điểm 0..1. */
export function meditationReward(score: number): { karma: number; tapNiem: number } {
  const s = Math.max(0, Math.min(1, score));
  return {
    karma: Math.round(MEDITATE.rewardBase + MEDITATE.rewardScale * s),
    tapNiem: -Math.round(MEDITATE.tapNiemBase + MEDITATE.tapNiemScale * s),
  };
}

export interface MeditateOpenData {
  stationId: string;
  seed: number;
  startAt: number;
  durationMs: number;
}

// ───────────── Điện Tăng Đoàn: quỳ lạy chân dung ─────────────

/** Ai đang quỳ ở bồ đoàn chân dung nào (stationId → pid). */
export interface GalleryPublicState {
  seats: Record<string, string>;
}

export interface GalleryOpenData {
  stationId: string;
  /** Số lạy đã lạy trong lễ đang dở (0..bowsPerRite−1). */
  bows: number;
  /** Giờ server được thưởng lại ở chân dung này (0 = được ngay). */
  readyAt: number;
}

/** Sự kiện `bowed` gửi riêng người lạy. */
export interface GalleryBowEvent {
  bows: number;
  /** Vừa đủ 1 lễ. */
  rite: boolean;
  /** Công Đức thực nhận của lễ này (0 = đang chờ hồi). */
  karma: number;
  readyAt: number;
}

// ───────────── Đại Pháp Đường: ngồi nghe kinh ─────────────

/** Ai đang ngồi bồ đoàn nghe kinh nào (stationId → pid). */
export interface SutraPublicState {
  seats: Record<string, string>;
}

/** actOpen gửi người vừa ngồi xuống bồ đoàn. */
export interface SutraOpenData {
  stationId: string;
}

// ───────────── Đón khách + nhập kho ─────────────

export interface GuestNpc {
  id: number;
  name: string;
  seed: number;
  x: number;
  z: number;
  ry: number;
  state: 'waiting' | 'following' | 'bowing' | 'leaving';
  leaderPid: string | null;
  arrivedAt: number;
}

export interface GuestPublicState {
  guests: GuestNpc[];
}

export interface RestockPublicState {
  rice: number;
  veggies: number;
}
