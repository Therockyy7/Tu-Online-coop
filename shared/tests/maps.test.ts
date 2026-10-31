import { describe, expect, it } from 'vitest';
import { ACTIVITY_IDS, type MapId } from '@shared/ids';
import {
  MAPS,
  STATION_KINDS,
  findStation,
  isBlocked,
  pickStation,
  pointInZone,
  resolveMove,
  type GateDef,
  type MapDef,
  type MoveContext,
  type StationDef,
  type StationKind,
} from '@shared/maps';

/** Hoạt động chủ quản của từng loại trạm — giữ nhất quán dữ liệu map. */
const KIND_ACTIVITY: Record<StationKind, string> = {
  broom_rack: 'sweep',
  tree_root: 'sweep',
  chop_block: 'chop',
  woodpile: 'cook',
  well: 'water',
  water_jar: 'water',
  meditation_cushion: 'meditate',
  release_cart: 'release',
  pond_release: 'release',
  forest_release: 'release',
  order_board: 'cook',
  rice_bin: 'cook',
  wash_basin: 'cook',
  stove_rice: 'cook',
  stove_pan: 'cook',
  firebox: 'cook',
  veggie_patch: 'cook',
  cutting_board: 'cook',
  dining_table: 'cook',
  storage: 'restock',
  supply_cart: 'restock',
  mo_cushion: 'chant',
  bell_rope: 'bell',
  altar: 'ceremony',
  prep_table: 'ceremony',
  fruit_tree: 'ceremony',
  flower_bed: 'ceremony',
  flower_table: 'ceremony',
  lamp_table: 'ceremony',
  oil_jar: 'ceremony',
  candle_stand: 'ceremony',
  temple_steps: 'guest',
  wardrobe: 'wardrobe',
  portrait: 'gallery',
  sutra_cushion: 'sutra',
  exchange_kiosk: 'exchange',
  drink_counter: 'drink',
  dance_floor: 'dance',
  dj_booth: 'dj',
  mix_station: 'mixology',
  npc_table: 'mixology',
  baucua_table: 'baucua',
  truth_wheel: 'truthwheel',
};

const allPass: MoveContext = { canPassGate: () => true };
const tieuDong: MoveContext = { canPassGate: (g: GateDef) => g.require !== 'chanh_dien' && g.require !== 'vip' };

/** Loang từ spawn trên lưới 0,5 m; trả hàm kiểm tra một ô có đi tới được không. */
function reachable(map: MapDef, ctx: MoveContext) {
  const step = 0.5;
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const nx = Math.floor((maxX - minX) / step) + 1;
  const nz = Math.floor((maxZ - minZ) / step) + 1;
  const free = new Uint8Array(nx * nz);
  const seen = new Uint8Array(nx * nz);
  const cell = (i: number, k: number) => ({ x: minX + i * step, z: minZ + k * step });
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) free[i * nz + k] = isBlocked(cell(i, k), map, ctx) ? 0 : 1;
  const si = Math.round((map.spawn.x - minX) / step);
  const sk = Math.round((map.spawn.z - minZ) / step);
  const queue: number[] = [si * nz + sk];
  seen[si * nz + sk] = 1;
  while (queue.length) {
    const idx = queue.pop()!;
    const i = Math.floor(idx / nz);
    const k = idx % nz;
    for (const [di, dk] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const a = i + di;
      const b = k + dk;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const j = a * nz + b;
      if (!seen[j] && free[j]) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  /** Có ô đi tới được nào trong bán kính `r` quanh điểm s không. */
  return (s: { x: number; z: number }, r: number): boolean => {
    for (let i = 0; i < nx; i++)
      for (let k = 0; k < nz; k++) {
        if (!seen[i * nz + k]) continue;
        const c = cell(i, k);
        if ((c.x - s.x) ** 2 + (c.z - s.z) ** 2 <= r * r) return true;
      }
    return false;
  };
}

const maps = Object.values(MAPS);

describe('dữ liệu map', () => {
  it('id trạm duy nhất trên mọi map và tra được', () => {
    const ids = maps.flatMap((m) => m.stations.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(findStation(id)?.station.id).toBe(id);
  });

  it.each(maps.map((m) => [m.id, m] as const))('%s: trạm hợp lệ (loại, hoạt động, trong biên)', (_id, m) => {
    for (const s of m.stations) {
      expect(STATION_KINDS).toContain(s.kind);
      expect(ACTIVITY_IDS).toContain(s.activity);
      expect(s.activity, `${s.id}`).toBe(KIND_ACTIVITY[s.kind]);
      expect(s.r).toBeGreaterThan(0);
      expect(s.x).toBeGreaterThanOrEqual(m.bounds.minX);
      expect(s.x).toBeLessThanOrEqual(m.bounds.maxX);
      expect(s.z).toBeGreaterThanOrEqual(m.bounds.minZ);
      expect(s.z).toBeLessThanOrEqual(m.bounds.maxZ);
    }
  });

  it.each(maps.map((m) => [m.id, m] as const))('%s: điểm đứng của trạm thường không bị vật cản chiếm', (_id, m) => {
    for (const s of m.stations.filter((st: StationDef) => !st.area)) {
      expect(isBlocked({ x: s.x, z: s.z }, m, allPass), `${s.id} bị chặn`).toBe(false);
    }
  });

  it.each(maps.map((m) => [m.id, m] as const))('%s: điểm spawn trống', (_id, m) => {
    expect(isBlocked({ x: m.spawn.x, z: m.spawn.z }, m, allPass)).toBe(false);
  });

  it.each(maps.map((m) => [m.id as MapId, m] as const))('%s: mọi trạm đi tới được từ spawn', (_id, m) => {
    const canReach = reachable(m, allPass);
    for (const s of m.stations) expect(canReach(s, s.r * 0.95), `${s.id} không tới được`).toBe(true);
  });

  it('Tiểu Đồng tới được mọi trạm trừ bồ đoàn gõ mõ trong Chánh Điện', () => {
    const m = MAPS.temple;
    const canReach = reachable(m, tieuDong);
    for (const s of m.stations) {
      const expected = s.kind !== 'mo_cushion';
      expect(canReach(s, s.r * 0.95), `${s.id}`).toBe(expected);
    }
  });

  it('cửa Chánh Điện chặn Tiểu Đồng, cho Hòa Thượng qua', () => {
    const m = MAPS.temple;
    expect(resolveMove({ x: 0, z: -18 }, { x: 0, z: -24 }, m, tieuDong).z).toBeGreaterThan(-21);
    expect(resolveMove({ x: 0, z: -18 }, { x: 0, z: -24 }, m, allPass).z).toBeCloseTo(-24, 5);
  });

  it('dây nhung VIP chặn người không có vé', () => {
    const m = MAPS.bar;
    expect(resolveMove({ x: 16.5, z: -5 }, { x: 16.5, z: -11 }, m, tieuDong).z).toBeGreaterThan(-8);
    expect(resolveMove({ x: 16.5, z: -5 }, { x: 16.5, z: -11 }, m, allPass).z).toBeCloseTo(-11, 5);
  });

  it('10 bồ đoàn gõ mõ nằm trong Chánh Điện', () => {
    const zone = MAPS.temple.zones.find((z) => z.id === 'chanh_dien')!;
    const cushions = MAPS.temple.stations.filter((s) => s.kind === 'mo_cushion');
    expect(cushions).toHaveLength(10);
    for (const c of cushions) expect(pointInZone(c, zone)).toBe(true);
  });

  it('đủ số trạm cho các hoạt động co-op', () => {
    const count = (map: MapDef, kind: StationKind) => map.stations.filter((s) => s.kind === kind).length;
    expect(count(MAPS.temple, 'bell_rope')).toBe(4);
    expect(count(MAPS.temple, 'fruit_tree')).toBe(7);
    expect(count(MAPS.temple, 'flower_bed')).toBe(4);
    expect(count(MAPS.temple, 'chop_block')).toBe(3);
    expect(count(MAPS.temple, 'meditation_cushion')).toBe(6);
    expect(count(MAPS.temple, 'water_jar')).toBe(3);
    expect(count(MAPS.temple, 'portrait')).toBe(6);
    expect(count(MAPS.bar, 'mix_station')).toBe(4);
    expect(count(MAPS.bar, 'npc_table')).toBe(6);
  });
});

describe('pickStation', () => {
  it('ưu tiên trạm nhỏ ở gần hơn trạm khu vực lớn', () => {
    const big: StationDef = { id: 'big', kind: 'dance_floor', activity: 'dance', x: 0, z: 0, r: 8, label: '', ry: 0, area: true };
    const small: StationDef = { id: 'small', kind: 'dj_booth', activity: 'dj', x: 3, z: 0, r: 1.5, label: '', ry: 0 };
    expect(pickStation([big, small], { x: 2.8, z: 0 })?.id).toBe('small');
    expect(pickStation([big, small], { x: 0.5, z: 0 })?.id).toBe('big');
    expect(pickStation([big, small], { x: 20, z: 0 })).toBeNull();
  });
});
