// Ống quẻ của Điện Tăng Đoàn: gom sáu bộ lá quẻ theo lĩnh vực (mỗi lĩnh vực một vị Sư Thầy được tuyên dương) và rút quẻ
// không lặp lại — mỗi lĩnh vực xáo một lượt, rút hết mới xáo lại, lá đầu lượt mới không trùng lá vừa rút.
import { CONG_DANH } from './congDanh';
import type { FortuneDomainId, FortuneSlip } from './domains';
import { GIA_DAO } from './giaDao';
import { SUC_KHOE } from './sucKhoe';
import { TAI_LOC } from './taiLoc';
import { TINH_DUYEN } from './tinhDuyen';
import { VAN_HAN } from './vanHan';

export * from './domains';

export const FORTUNE_SLIPS: Record<FortuneDomainId, readonly FortuneSlip[]> = {
  cong_danh: CONG_DANH,
  tinh_duyen: TINH_DUYEN,
  tai_loc: TAI_LOC,
  suc_khoe: SUC_KHOE,
  gia_dao: GIA_DAO,
  van_han: VAN_HAN,
};

/** Lá quẻ vừa rút kèm số thứ tự trong bộ (1-based — "Quẻ số N"). */
export interface DrawnSlip {
  slip: FortuneSlip;
  number: number;
}

/** Thứ tự rút còn lại của mỗi lĩnh vực (chỉ số lá), và lá vừa rút. */
const bags = new Map<FortuneDomainId, number[]>();
const lastDrawn = new Map<FortuneDomainId, number>();

/** Rút một lá quẻ của lĩnh vực `id`; null nếu lĩnh vực chưa có lá nào. */
export function drawSlip(id: FortuneDomainId): DrawnSlip | null {
  const slips = FORTUNE_SLIPS[id];
  if (slips.length === 0) return null;
  let bag = bags.get(id);
  if (!bag || bag.length === 0) {
    bag = slips.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    // Lượt mới: đẩy lá vừa rút ở lượt trước ra khỏi chỗ rút kế tiếp (cuối mảng = rút trước).
    const last = lastDrawn.get(id);
    if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
    bags.set(id, bag);
  }
  const index = bag.pop()!;
  lastDrawn.set(id, index);
  return { slip: slips[index]!, number: index + 1 };
}
