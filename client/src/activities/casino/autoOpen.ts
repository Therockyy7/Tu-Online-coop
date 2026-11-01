// Luật tự mở bảng của các bàn sòng theo ván (Tài Xỉu, Xì Dách, Bài Cào, 2 lan can Đua Ngựa) lúc bàn vừa mở ván. Vùng "đứng
// gần" (bán kính trạm + CASINO.nearSlack) của bàn và lan can đua chồng nhau ở dải lối đi giữa hai bên, nên chỉ bàn gần mình
// nhất được tự mở, và không bao giờ bật đè lên bảng / hộp chọn đang mở. Bấm E ở bàn vẫn mở bảng như cũ.
import type { ClientActivityContext } from '../types';

/** Loại trạm các bàn sòng theo ván (máy Nổ Hũ ngồi riêng, không tự mở bảng). */
const TABLE_KINDS: ReadonlySet<string> = new Set(['taixiu_table', 'xidach_table', 'baicao_table', 'race_rail']);

/** Loại trạm bàn sòng gần mình nhất (khoảng cách tới mép vùng trạm), null nếu chưa có nhân vật / map không có bàn sòng. */
export function nearestTableKind(ctx: Pick<ClientActivityContext, 'me' | 'world'>): string | null {
  const me = ctx.me();
  if (!me) return null;
  let kind: string | null = null;
  let best = Infinity;
  for (const s of ctx.world.map.stations) {
    if (!TABLE_KINDS.has(s.kind)) continue;
    const d = Math.hypot(me.x - s.x, me.z - s.z) - s.r;
    if (d < best) {
      best = d;
      kind = s.kind;
    }
  }
  return kind;
}

/**
 * Được tự mở bảng của bàn loại `kind` lúc bàn vừa mở ván không (module tự kiểm thêm "đứng trong tầm bàn"): chưa có bảng /
 * hộp chọn nào đang mở, và bàn này là bàn sòng gần mình nhất.
 */
export const canAutoOpen = (ctx: Pick<ClientActivityContext, 'me' | 'world' | 'ui'>, kind: string): boolean =>
  !ctx.ui.isModalOpen() && nearestTableKind(ctx) === kind;
