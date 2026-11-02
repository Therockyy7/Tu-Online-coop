import { describe, expect, it } from 'vitest';
import { MOVE } from '@shared/config/balance';
import { ACTIVITY_IDS, type MapId } from '@shared/ids';
import {
  MAPS,
  SONG_BAC,
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
  xa_nghiep_cushion: 'gallery',
  sutra_cushion: 'sutra',
  exchange_kiosk: 'exchange',
  drink_counter: 'drink',
  dance_floor: 'dance',
  dj_booth: 'dj',
  mix_station: 'mixology',
  npc_table: 'mixology',
  baucua_table: 'baucua',
  truth_wheel: 'truthwheel',
  taixiu_table: 'taixiu',
  xidach_table: 'xidach',
  baicao_table: 'baicao',
  slot_machine: 'nohu',
  race_rail: 'duangua',
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

  it('Tiểu Đồng tới được mọi trạm, kể cả bồ đoàn gõ mõ trong Chánh Điện', () => {
    const m = MAPS.temple;
    const canReach = reachable(m, tieuDong);
    for (const s of m.stations) expect(canReach(s, s.r * 0.95), `${s.id}`).toBe(true);
  });

  it('cửa Chánh Điện mở cho mọi cấp bậc (Tiểu Đồng đi thẳng vào được)', () => {
    expect(MAPS.temple.gates).toHaveLength(0);
    expect(resolveMove({ x: 0, z: -18 }, { x: 0, z: -24 }, MAPS.temple, tieuDong).z).toBeCloseTo(-24, 5);
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
    expect(count(MAPS.temple, 'xa_nghiep_cushion')).toBe(1);
    expect(count(MAPS.bar, 'mix_station')).toBe(4);
    expect(count(MAPS.bar, 'npc_table')).toBe(6);
  });
});

describe('Sòng Công Đức — va chạm bàn Xì Dách bán nguyệt', () => {
  const m = MAPS.bar;
  const xd = SONG_BAC.xidach;
  const a = xd.w / 2;
  const b = xd.d;
  const z0 = xd.z - xd.d / 2;
  /** Điểm trên mép cung ở góc tham số `deg` (0 = đỉnh cung phía Nam, ±90 = hai đầu cạnh thẳng) + pháp tuyến ra ngoài. */
  const arc = (deg: number) => {
    const f = (deg * Math.PI) / 180;
    const nx = Math.sin(f) / a;
    const nz = Math.cos(f) / b;
    const l = Math.hypot(nx, nz);
    return { x: xd.x + a * Math.sin(f), z: z0 + b * Math.cos(f), nx: nx / l, nz: nz / l };
  };
  /**
   * Áp sát mép bàn dọc pháp tuyến: khoảng hở giữa thân người chơi (MOVE.radius) và mép bàn ở chỗ gần nhất đứng được
   * (dương = còn hở / tường vô hình, âm = thân lấn vào mép bàn).
   */
  const gap = (p: { x: number; z: number }, nx: number, nz: number): number => {
    for (let t = 0; t <= 2; t += 0.005) if (!isBlocked({ x: p.x + nx * t, z: p.z + nz * t }, m, allPass)) return t - MOVE.radius;
    return Infinity;
  };

  it('đứng sát được mép cong ở mọi hướng (gồm 5 ô ghế ±60° / ±30° / 0°): hở ≤ 0,15 m, lấn ≤ 0,1 m', () => {
    for (let deg = -90; deg <= 90; deg += 5) {
      const p = arc(deg);
      const g = gap(p, p.nx, p.nz);
      expect(g, `góc ${deg}°`).toBeLessThanOrEqual(0.15);
      expect(g, `góc ${deg}°`).toBeGreaterThanOrEqual(-0.1);
    }
  });

  it('hai góc phía Nam của hộp bao cũ không còn là tường vô hình; cạnh thẳng phía nhà cái không lố ra sau', () => {
    for (const sx of [-1, 1]) expect(isBlocked({ x: xd.x + sx * a, z: z0 + b }, m, allPass), `góc ${sx}`).toBe(false);
    for (let x = xd.x - a + 0.1; x <= xd.x + a - 0.1; x += 0.1) {
      const g = gap({ x, z: z0 }, 0, -1);
      expect(g, `x ${x.toFixed(1)}`).toBeLessThanOrEqual(0.02);
      expect(g, `x ${x.toFixed(1)}`).toBeGreaterThanOrEqual(-0.02);
    }
  });

  it('không đi xuyên bàn: mọi điểm trong lòng bàn đều bị chặn; đi thẳng vào bàn thì dừng / trượt vòng quanh mép', () => {
    for (let u = -a + 0.05; u <= a - 0.05; u += 0.1) {
      const vMax = b * Math.sqrt(1 - (u / a) ** 2);
      for (let v = 0.02; v < vMax; v += 0.1) expect(isBlocked({ x: xd.x + u, z: z0 + v }, m, allPass), `(${u}, ${v})`).toBe(true);
    }
    expect(resolveMove({ x: xd.x, z: z0 + b + 1.5 }, { x: xd.x, z: z0 - 1.5 }, m, allPass).z).toBeGreaterThan(z0 + b);
    /** Khoảng cách từ tâm người chơi tới bàn (0 nếu ở trong), lấy mẫu dày mép cung + cạnh thẳng. */
    const distToTable = (p: { x: number; z: number }): number => {
      const u = p.x - xd.x;
      const v = p.z - z0;
      if (v >= 0 && (u / a) ** 2 + (v / b) ** 2 <= 1) return 0;
      let best = Infinity;
      for (let deg = -90; deg <= 90; deg += 0.5) best = Math.min(best, Math.hypot(p.x - arc(deg).x, p.z - arc(deg).z));
      for (let x = xd.x - a; x <= xd.x + a; x += 0.02) best = Math.min(best, Math.hypot(p.x - x, p.z - z0));
      return best;
    };
    // Đi từng bước nhỏ (như từng khung hình) từ Tây sang Đông ngang giữa bàn: thân không lấn vào mép quá 0,1 m.
    let p = { x: xd.x - a - 1.5, z: z0 + 0.8 };
    for (let i = 0; i < 70; i++) {
      p = resolveMove(p, { x: p.x + 0.1, z: p.z }, m, allPass);
      expect(distToTable(p), `bước ${i}`).toBeGreaterThan(MOVE.radius - 0.1);
    }
    expect(m.colliders.filter((c) => c.tag === 'xidach_table').length).toBeGreaterThan(1);
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
