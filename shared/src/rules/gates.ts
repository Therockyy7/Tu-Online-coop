import type { RankId } from '../ids';
import { pointInZone } from '../maps/collision';
import type { GateDef, MapDef } from '../maps/types';
import type { Vec2 } from '../types';
import { canEnterChanhDien } from './rank';

export interface GateSubject {
  rank: RankId;
  isHost: boolean;
  vip: boolean;
}

/** Vùng phía trong của từng loại cổng: đang đứng trong vùng thì luôn được đi ra (không bị kẹt khi mất quyền). */
const GATE_INSIDE_ZONE: Record<GateDef['require'], string> = {
  chanh_dien: 'chanh_dien',
  vip: 'vip_lounge',
};

/**
 * Có được đi qua cổng không: đủ điều kiện (cấp bậc / VIP), hoặc đang đứng phía trong vùng của cổng
 * (vd vừa mất chức Phương Trượng khi đang ở Chánh Điện thì vẫn đi ra được, nhưng không vào lại được).
 * `from` = vị trí trước khi di chuyển. Client và server dùng chung hàm này.
 */
export function canPassGate(gate: GateDef, who: GateSubject, map: MapDef, from: Vec2): boolean {
  const allowed = gate.require === 'chanh_dien' ? canEnterChanhDien(who.rank, who.isHost) : who.vip;
  if (allowed) return true;
  const zone = map.zones.find((z) => z.id === GATE_INSIDE_ZONE[gate.require]);
  return zone ? pointInZone(from, zone) : false;
}
