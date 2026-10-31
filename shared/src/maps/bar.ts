// Bản đồ Quán Bar (44 × 32 m). X → Đông, Z → Nam. Sơ đồ: spec mục 6.2.
import { GATE_MESSAGES } from '../config/text';
import type { ColliderDef, MapDef, StationDef } from './types';

const PI = Math.PI;
const FACE_NORTH = PI;
const FACE_SOUTH = 0;
const FACE_EAST = PI / 2;
const FACE_WEST = -PI / 2;

const box = (x: number, z: number, w: number, d: number, tag: string): ColliderDef => ({ kind: 'box', x, z, w, d, tag });
const circle = (x: number, z: number, r: number, tag: string): ColliderDef => ({ kind: 'circle', x, z, r, tag });

const stations: StationDef[] = [];
const colliders: ColliderDef[] = [];
const add = (s: StationDef) => stations.push(s);

// ── Tường bao (cửa Hồi Sơn ở giữa phía Nam chỉ là trang trí) ──
colliders.push(
  box(0, -16.5, 46, 1, 'wall_perimeter'),
  box(0, 16.5, 46, 1, 'wall_perimeter'),
  box(-22.5, 0, 1, 34, 'wall_perimeter'),
  box(22.5, 0, 1, 34, 'wall_perimeter'),
);

// ── Sàn nhảy LED 8×6 ô (ô 2 m) ──
add({ id: 'dance_floor', kind: 'dance_floor', activity: 'dance', x: 0, z: 0, r: 8, label: 'Tham gia vòng nhảy', ry: FACE_NORTH, area: true });

// ── DJ booth (Bắc), DJ đứng phía sau bàn, nhìn về sàn ──
colliders.push(box(0, -11.2, 6, 1.4, 'dj_booth'));
add({ id: 'dj_booth', kind: 'dj_booth', activity: 'dj', x: 0, z: -13.2, r: 1.6, label: 'Bàn DJ', ry: FACE_SOUTH });

// ── Quầy bar (Tây) + khu pha chế ──
colliders.push(
  box(-17, -3, 1.4, 14, 'bar_counter'),
  box(-19.5, -10.3, 4.2, 0.6, 'bar_counter_side'),
  box(-19.5, 4.3, 4.2, 0.6, 'bar_counter_side'),
  box(-21.3, -3, 0.8, 14, 'liquor_shelf'),
);
[-8, -4.7, -1.4, 1.9].forEach((z, i) =>
  add({
    id: `mix_station_${i + 1}`,
    kind: 'mix_station',
    activity: 'mixology',
    x: -15.2,
    z,
    r: 1.2,
    label: 'Trạm pha chế',
    ry: FACE_WEST,
    data: { index: i + 1 },
  }),
);
add({ id: 'drink_counter', kind: 'drink_counter', activity: 'drink', x: -17, z: 5.6, r: 1.4, label: 'Gọi đồ uống', ry: FACE_NORTH });

// ── Khu VIP (Đông Bắc) — dây nhung, cổng VIP ──
colliders.push(
  box(13.5, -8, 3, 0.4, 'vip_rope'),
  box(20.1, -8, 3.8, 0.4, 'vip_rope'),
  box(12, -12, 0.4, 8, 'vip_rope'),
  box(15, -14.6, 4, 1.2, 'sofa'),
  box(20.6, -12, 1.2, 4, 'sofa'),
);

// ── Vòng quay sự thật (Tây Bắc) ──
colliders.push(circle(-10, -14.2, 1.1, 'truth_wheel'));
add({ id: 'truth_wheel', kind: 'truth_wheel', activity: 'truthwheel', x: -10, z: -12.4, r: 1.6, label: 'Quay vòng sự thật', ry: FACE_NORTH });

// ── Bàn khách NPC: hàng Nam + cột Đông ──
const tables: [number, number, 'south' | 'east'][] = [
  [-15, 11, 'south'],
  [-9.5, 11, 'south'],
  [9.5, 11, 'south'],
  [15, 11, 'south'],
  [18, -3.5, 'east'],
  [18, 2, 'east'],
];
tables.forEach(([x, z, side], i) => {
  colliders.push(circle(x, z, 0.85, 'npc_table'));
  add({
    id: `npc_table_${i + 1}`,
    kind: 'npc_table',
    activity: 'mixology',
    x: side === 'south' ? x : x - 1.4,
    z: side === 'south' ? z - 1.4 : z,
    r: 1.3,
    label: 'Bàn khách',
    ry: side === 'south' ? FACE_SOUTH : FACE_EAST,
    data: { index: i + 1 },
  });
});

// ── Bầu Cua Cá Cọp (Đông Nam) ──
colliders.push(box(17.5, 8.2, 3.2, 2, 'baucua_table'));
add({ id: 'baucua_table', kind: 'baucua_table', activity: 'baucua', x: 17.5, z: 8.2, r: 3.2, label: 'Bầu Cua Cá Cọp', ry: FACE_NORTH, area: true });

// ── Quầy đổi Đức (cạnh lối vào) ──
colliders.push(box(-5, 14.6, 2.6, 0.9, 'exchange_kiosk'));
add({ id: 'exchange_kiosk', kind: 'exchange_kiosk', activity: 'exchange', x: -5, z: 13.2, r: 1.4, label: 'Quầy đổi Đức', ry: FACE_SOUTH });

export const BAR_MAP: MapDef = {
  id: 'bar',
  bounds: { minX: -21.5, maxX: 21.5, minZ: -15.5, maxZ: 15.5 },
  spawn: { x: 0, z: 12.5, r: 1.8 },
  stations,
  colliders,
  gates: [
    {
      id: 'vip_rope_gate',
      box: { x: 16.5, z: -8, w: 3.5, d: 0.4 },
      require: 'vip',
      message: GATE_MESSAGES.vip,
    },
  ],
  zones: [
    { id: 'dance_floor', shape: { kind: 'box', x: 0, z: 0, w: 16, d: 12 } },
    { id: 'vip_lounge', shape: { kind: 'box', x: 17, z: -12, w: 10, d: 8 } },
    { id: 'baucua', shape: { kind: 'circle', x: 17.5, z: 8.2, r: 4 } },
    { id: 'bar_counter_area', shape: { kind: 'box', x: -14.5, z: -2.5, w: 4, d: 17 } },
  ],
  roofs: [],
};
