// Ngoại hình theo dữ liệu: màu da, màu nhấn, kiểu áo theo cấp bậc (tu sĩ) / đồ thường (NPC). Không dựng hình ở đây —
// outfit.ts (thân, áo, cà sa, mũ…) và fpHands.ts (tay áo góc nhìn thứ nhất) cùng đọc bảng này.
import type { Outfit, RobeId } from '@shared/index';
import type { AvatarLook } from '../api';

/** Màu da cho người chơi (chọn theo seed). */
export const SKIN_TONES = ['#f6d2ad', '#efc193', '#e8b48a', '#d9a173', '#c98e62'];
const ACCENTS = ['#ff6f91', '#4fc3f7', '#ffd54f', '#81c784', '#ba68c8', '#ff8a65', '#4db6ac', '#f06292'];

/** Ngoại hình người chơi (tu sĩ đầu trọc), màu da/màu nhấn ổn định theo seed (vd hash pid). */
export function playerLook(p: { outfit: Outfit; isHost: boolean; vip: boolean }, seed: number): AvatarLook {
  const s = Math.abs(seed);
  return {
    outfit: p.outfit,
    hair: 'bald',
    skin: SKIN_TONES[s % SKIN_TONES.length]!,
    isHost: p.isHost,
    vip: p.vip,
    accent: ACCENTS[(s >> 3) % ACCENTS.length],
  };
}

export type NpcKind = 'visitor' | 'bar_guest' | 'dealer' | 'bartender';

/** Ngoại hình NPC (có tóc, đồ thường) theo loại + seed. */
export function npcLook(kind: NpcKind, seed: number): AvatarLook {
  const s = Math.abs(seed);
  const robe: RobeId =
    kind === 'visitor' ? (s % 3 === 0 ? 'civ_ao_thun' : 'civ_ba_ba') : kind === 'bar_guest' ? (s % 4 === 0 ? 'civ_ao_thun' : 'civ_party') : 'civ_vest';
  return {
    outfit: { robe, hat: 'none', accessory: kind === 'bar_guest' && s % 5 === 0 ? 'kinh_ram' : 'none' },
    hair: (['short', 'long', 'bun', 'spiky'] as const)[s % 4]!,
    skin: SKIN_TONES[(s * 7) % SKIN_TONES.length]!,
    isHost: false,
    vip: false,
    accent: ACCENTS[(s * 5 + 3) % ACCENTS.length],
  };
}

/** Tay trái cầm thường trực: Phương Trượng cầm tích trượng (bỏ quạt nếu có), phụ kiện quạt nan thì cầm quạt. */
export function leftBusyOf(look: AvatarLook): 'staff' | 'fan' | null {
  return look.isHost ? 'staff' : look.outfit.accessory === 'quat_nan' ? 'fan' : null;
}

/** Màu sắc + đặc điểm của một bộ áo. outfit.ts được thêm trường tùy chọn mới (fpHands chỉ đọc sleeve/trim). */
export interface RobeStyle {
  upper: string;
  lower: string;
  sleeve: string;
  /** Viền gấu áo / cổ tay áo. */
  trim?: string;
  /** Cà sa (vắt vai trái, quấn chéo thân). */
  sash?: string;
  /** Đường may "ruộng" + viền cà sa. */
  sashTrim?: string;
  belt?: string;
  patches?: string;
  ragged?: boolean;
  /** Tay áo rộng (áo tràng). */
  wide?: boolean;
  /** Tay áo ngắn, cẳng tay trần (áo thun). */
  short?: boolean;
  collar?: string;
  tie?: string;
  shiny?: boolean;
  shoes: string;
}

export function robeStyle(look: AvatarLook): RobeStyle {
  const accent = look.accent ?? '#4fc3f7';
  if (look.isHost) {
    // Phương Trượng: áo trong vàng nghệ, cà sa đỏ thẫm thêu kim (đường ruộng + viền vàng), tay áo rộng, viền vàng.
    return { upper: '#e2a535', lower: '#dc9c2e', sleeve: '#e2a535', trim: '#ffd166', sash: '#a5231b', sashTrim: '#f5c84c', wide: true, shoes: '#5a3a28' };
  }
  switch (look.outfit.robe) {
    case 'robe_nau_rach':
      return { upper: '#8b6a4a', lower: '#86654a', sleeve: '#8b6a4a', patches: '#b08a62', ragged: true, belt: '#5a3d26', shoes: '#6e4a32' };
    case 'robe_lam':
      return { upper: '#7f97a8', lower: '#7a92a3', sleeve: '#7f97a8', belt: '#4f6575', shoes: '#4a3a30' };
    case 'robe_trang_nau':
      return { upper: '#6d4c35', lower: '#664632', sleeve: '#6d4c35', wide: true, collar: '#3f2a1c', shoes: '#3f2a1c' };
    case 'robe_ca_sa_vang':
      return { upper: '#e9a23b', lower: '#e39a33', sleeve: '#e9a23b', sash: '#d4861f', sashTrim: '#f2b65a', shoes: '#6e4a32' };
    case 'robe_ca_sa_vien_do':
      return { upper: '#e9a23b', lower: '#e39a33', sleeve: '#e9a23b', sash: '#d4861f', sashTrim: '#b5382f', trim: '#b5382f', shoes: '#5a3a28' };
    case 'civ_ao_thun':
      return { upper: accent, lower: '#3b5b8a', sleeve: accent, short: true, shoes: '#f3f3f3' };
    case 'civ_ba_ba':
      return { upper: '#f4efe2', lower: '#2b2b33', sleeve: '#f4efe2', collar: accent, shoes: '#6e4a32' };
    case 'civ_party':
      return { upper: accent, lower: '#1f1f26', sleeve: accent, shiny: true, shoes: '#1b1b1f' };
    case 'civ_vest':
      return { upper: '#2c3550', lower: '#22283c', sleeve: '#2c3550', collar: '#ffffff', tie: '#c8322a', shoes: '#111111' };
  }
}
