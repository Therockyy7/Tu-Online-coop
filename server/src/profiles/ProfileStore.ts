// Kho hồ sơ lưu bền: File JSON (mặc định) hoặc MongoDB (khi có MONGODB_URI).
import {
  ACCESSORY_IDS,
  HAT_IDS,
  KARMA,
  ROBE_IDS,
  defaultOutfitFor,
  rankOf,
  sanitizeName,
  type Outfit,
  type Profile,
} from '@shared/index';

export interface ProfileStore {
  readonly kind: 'file' | 'mongo';
  load(key: string): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
  close(): Promise<void>;
}

const num = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;

/** Dữ liệu đọc từ kho có thể cũ/hỏng: chuẩn hóa về đúng cấu trúc `Profile` hiện tại. */
export function normalizeProfile(raw: unknown, key: string): Profile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const now = Date.now();
  const congDuc = num(r.congDuc, 0, 1e9, 0);
  const outfitRaw = (r.outfit && typeof r.outfit === 'object' ? r.outfit : {}) as Record<string, unknown>;
  const fallback = defaultOutfitFor(rankOf(congDuc));
  const outfit: Outfit = {
    robe: ROBE_IDS.includes(outfitRaw.robe as never) ? (outfitRaw.robe as Outfit['robe']) : fallback.robe,
    hat: HAT_IDS.includes(outfitRaw.hat as never) ? (outfitRaw.hat as Outfit['hat']) : 'none',
    accessory: ACCESSORY_IDS.includes(outfitRaw.accessory as never)
      ? (outfitRaw.accessory as Outfit['accessory'])
      : 'none',
  };
  const stats: Record<string, number> = {};
  if (r.stats && typeof r.stats === 'object') {
    for (const [k, v] of Object.entries(r.stats as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && k.length <= 40) stats[k] = v;
    }
  }
  return {
    v: 1,
    key,
    name: sanitizeName(r.name) ?? 'Tiểu Đồng',
    congDuc,
    peakCongDuc: Math.max(congDuc, num(r.peakCongDuc, 0, 1e9, 0)),
    duc: num(r.duc, 0, 1e9, congDuc),
    tapNiem: num(r.tapNiem, 0, KARMA.tapNiemMax, 0),
    xu: num(r.xu, 0, 1e9, 0),
    vip: r.vip === true,
    outfit,
    stats,
    createdAt: num(r.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: num(r.updatedAt, 0, Number.MAX_SAFE_INTEGER, now),
  };
}

export function newProfile(key: string, name: string): Profile {
  const now = Date.now();
  return {
    v: 1,
    key,
    name,
    congDuc: 0,
    peakCongDuc: 0,
    duc: 0,
    tapNiem: 0,
    xu: 0,
    vip: false,
    outfit: defaultOutfitFor('tieu_dong'),
    stats: {},
    createdAt: now,
    updatedAt: now,
  };
}
