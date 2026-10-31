import type { MapId } from '../ids';
import type { Vec2 } from '../types';
import { BAR_MAP } from './bar';
import { pointInZone } from './collision';
import { TEMPLE_MAP } from './temple';
import type { MapDef, StationDef, StationKind, ZoneDef } from './types';

export const MAPS: Record<MapId, MapDef> = {
  temple: TEMPLE_MAP,
  bar: BAR_MAP,
};

export const getMap = (id: MapId): MapDef => MAPS[id];

const stationIndex = new Map<string, { map: MapId; station: StationDef }>();
for (const m of Object.values(MAPS)) for (const s of m.stations) stationIndex.set(s.id, { map: m.id, station: s });

/** Tìm trạm theo id trên mọi map. */
export function findStation(id: string): { map: MapId; station: StationDef } | undefined {
  return stationIndex.get(id);
}

export const stationsOfKind = (mapId: MapId, kind: StationKind): StationDef[] =>
  MAPS[mapId].stations.filter((s) => s.kind === kind);

export const getZone = (mapId: MapId, zoneId: string): ZoneDef | undefined =>
  MAPS[mapId].zones.find((z) => z.id === zoneId);

export function inZone(mapId: MapId, zoneId: string, p: Vec2): boolean {
  const z = getZone(mapId, zoneId);
  return z ? pointInZone(p, z) : false;
}

/** Người chơi ở vị trí p có trong bán kính dùng trạm không (kèm dung sai). */
export function isNearStation(station: StationDef, p: Vec2, slack = 0): boolean {
  const dx = p.x - station.x;
  const dz = p.z - station.z;
  const r = station.r + slack;
  return dx * dx + dz * dz <= r * r;
}

/**
 * Trạm "gần nhất" để gợi ý tương tác: trong các trạm chứa p trong bán kính,
 * chọn trạm có tỉ lệ khoảng cách / bán kính nhỏ nhất (trạm khu vực lớn không lấn trạm nhỏ).
 */
export function pickStation(
  stations: readonly StationDef[],
  p: Vec2,
  accept: (s: StationDef) => boolean = () => true,
): StationDef | null {
  let best: StationDef | null = null;
  let bestRatio = Infinity;
  for (const s of stations) {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > s.r) continue;
    const ratio = d / s.r;
    if (ratio < bestRatio && accept(s)) {
      best = s;
      bestRatio = ratio;
    }
  }
  return best;
}

export * from './types';
export * from './collision';
export { TEMPLE_MAP, TANG_DOAN, PHAP_DUONG } from './temple';
export { BAR_MAP } from './bar';
