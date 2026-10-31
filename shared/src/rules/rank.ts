import { RANK_THRESHOLDS, WARDROBE_UNLOCKS } from '../config/balance';
import { ACCESSORY_IDS, HAT_IDS, RANK_IDS, type MonkRobeId, type RankId } from '../ids';
import type { Outfit, UnlockState } from '../types';

/** Cấp bậc theo Công Đức tích lũy. */
export function rankOf(congDuc: number): RankId {
  let result: RankId = 'tieu_dong';
  for (const r of RANK_IDS) if (congDuc >= RANK_THRESHOLDS[r]) result = r;
  return result;
}

export const rankIndex = (rank: RankId): number => RANK_IDS.indexOf(rank);

export const rankAtLeast = (rank: RankId, min: RankId): boolean => rankIndex(rank) >= rankIndex(min);

export interface RankProgress {
  rank: RankId;
  next: RankId | null;
  /** Công Đức đã có kể từ mốc cấp hiện tại. */
  current: number;
  /** Công Đức cần từ mốc cấp hiện tại tới mốc cấp kế. */
  needed: number;
  /** 0..1 (1 khi đã ở cấp cao nhất). */
  ratio: number;
}

export function progressToNext(congDuc: number): RankProgress {
  const cd = Math.max(0, congDuc);
  const rank = rankOf(cd);
  const idx = rankIndex(rank);
  const next = RANK_IDS[idx + 1] ?? null;
  const base = RANK_THRESHOLDS[rank];
  if (!next) return { rank, next: null, current: cd - base, needed: 0, ratio: 1 };
  const needed = RANK_THRESHOLDS[next] - base;
  const current = cd - base;
  return { rank, next, current, needed, ratio: Math.min(1, current / needed) };
}

/** Cửa Chánh Điện: từ Hòa Thượng Tập Sự trở lên, hoặc Phương Trượng. */
export const canEnterChanhDien = (rank: RankId, isHost: boolean): boolean =>
  isHost || rankAtLeast(rank, 'hoa_thuong_tap_su');

const RANK_ROBES: Record<RankId, MonkRobeId> = {
  tieu_dong: 'robe_nau_rach',
  hoa_thuong_tap_su: 'robe_lam',
  tri_khach_tang: 'robe_trang_nau',
  dai_duc: 'robe_ca_sa_vang',
  thuong_toa: 'robe_ca_sa_vien_do',
};

export const defaultRobeFor = (rank: RankId): MonkRobeId => RANK_ROBES[rank];

export function defaultOutfitFor(rank: RankId): Outfit {
  return { robe: defaultRobeFor(rank), hat: 'none', accessory: 'none' };
}

/** Đồ đã mở khóa theo Công Đức đỉnh + VIP (thứ tự giữ như danh sách gốc). */
export function unlockedOutfit(peakCongDuc: number, vip: boolean): UnlockState {
  const ok = (req: number | 'vip') => (req === 'vip' ? vip : peakCongDuc >= req);
  const robes = (Object.keys(WARDROBE_UNLOCKS.robes) as MonkRobeId[]).filter((r) =>
    ok(WARDROBE_UNLOCKS.robes[r]),
  );
  const hats = HAT_IDS.filter((h) => ok(WARDROBE_UNLOCKS.hats[h]));
  const accessories = ACCESSORY_IDS.filter((a) => ok(WARDROBE_UNLOCKS.accessories[a]));
  return { robes, hats, accessories };
}

export function isOutfitAllowed(outfit: Outfit, unlocked: UnlockState): boolean {
  return (
    unlocked.robes.includes(outfit.robe) &&
    unlocked.hats.includes(outfit.hat) &&
    unlocked.accessories.includes(outfit.accessory)
  );
}
