import type { ActivityId, MapId } from '../ids';

/** Loại trạm tương tác. Mỗi trạm thuộc đúng 1 hoạt động (định tuyến `interact`). */
export const STATION_KINDS = [
  // Chùa
  'broom_rack',
  'tree_root',
  'chop_block',
  'woodpile',
  'well',
  'water_jar',
  'meditation_cushion',
  'release_cart',
  'pond_release',
  'forest_release',
  'order_board',
  'rice_bin',
  'wash_basin',
  'stove_rice',
  'stove_pan',
  'firebox',
  'veggie_patch',
  'cutting_board',
  'dining_table',
  'storage',
  'supply_cart',
  'mo_cushion',
  'bell_rope',
  'altar',
  'prep_table',
  'fruit_tree',
  'flower_bed',
  'flower_table',
  'lamp_table',
  'oil_jar',
  'candle_stand',
  'temple_steps',
  'wardrobe',
  'portrait',
  'sutra_cushion',
  // Bar
  'exchange_kiosk',
  'drink_counter',
  'dance_floor',
  'dj_booth',
  'mix_station',
  'npc_table',
  'baucua_table',
  'truth_wheel',
  // Sòng Công Đức
  'taixiu_table',
  'xidach_table',
  'baicao_table',
  'slot_machine',
  'race_rail',
] as const;
export type StationKind = (typeof STATION_KINDS)[number];

export interface StationDef {
  /** Duy nhất trên toàn bộ các map. */
  id: string;
  kind: StationKind;
  activity: ActivityId;
  /** Điểm đứng của người chơi khi dùng trạm. */
  x: number;
  z: number;
  /** Bán kính tương tác (m). */
  r: number;
  /** Nhãn mặc định cho gợi ý "[E] …" (module client có thể đổi/ẩn). */
  label: string;
  /** Hướng người chơi nhìn khi dùng trạm (radian, ry=0 nhìn về +Z). */
  ry: number;
  /** Trạm dạng khu vực: đứng đâu trong bán kính cũng được (tâm có thể nằm trong vật cản). */
  area?: boolean;
  /** Dữ liệu thêm, vd { fruit: 'buoi' } / { color: 'do' } / { index: 3 }. */
  data?: Record<string, string | number>;
}

export type ColliderDef =
  | { kind: 'circle'; x: number; z: number; r: number; tag: string }
  /** Hộp thẳng trục: tâm (x, z), rộng w theo X, sâu d theo Z. */
  | { kind: 'box'; x: number; z: number; w: number; d: number; tag: string };

export interface BoxShape {
  x: number;
  z: number;
  w: number;
  d: number;
}

export type GateRequirement = 'chanh_dien' | 'vip';

export interface GateDef {
  id: string;
  /** Vùng chặn khi người chơi không đủ điều kiện. */
  box: BoxShape;
  require: GateRequirement;
  message: string;
}

export type ZoneShape = ({ kind: 'circle' } & { x: number; z: number; r: number }) | ({ kind: 'box' } & BoxShape);

export interface ZoneDef {
  id: string;
  shape: ZoneShape;
}

/** Mái nhà tự ẩn khi người chơi (local) đứng trong hộp này. */
export interface RoofDef {
  id: string;
  box: BoxShape;
}

export interface MapDef {
  id: MapId;
  /** Giới hạn tâm người chơi. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; z: number; r: number };
  stations: StationDef[];
  /**
   * Vật cản tĩnh. `tag` cho phần dựng hình biết đây là gì
   * (wall, pillar, tree, bodhi, buddha, bell, pond, table, cart, jar, block, …).
   */
  colliders: ColliderDef[];
  gates: GateDef[];
  zones: ZoneDef[];
  roofs: RoofDef[];
}
