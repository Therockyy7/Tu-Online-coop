// Vị trí mặc định của các điểm neo (xem AnchorName trong art/api.ts), tính từ dữ liệu map dùng chung.
// Phần dựng hình map nên dùng các vị trí X/Z này và chỉnh Y cho khớp chiều cao mô hình của mình.
import type { ColliderDef, MapDef } from '@shared/index';

export interface AnchorSpec {
  x: number;
  y: number;
  z: number;
  /** Hướng quay quanh trục Y (radian). */
  ry?: number;
}

function byTag(map: MapDef, tag: string): ColliderDef[] {
  return map.colliders.filter((c) => c.tag === tag);
}

function center(map: MapDef, tag: string): { x: number; z: number } {
  const c = byTag(map, tag)[0];
  if (!c) throw new Error(`Map ${map.id} thiếu vật cản tag "${tag}" cho điểm neo`);
  return { x: c.x, z: c.z };
}

/** Bảng điểm neo mặc định của từng map. */
export function defaultAnchors(map: MapDef): Map<string, AnchorSpec> {
  const a = new Map<string, AnchorSpec>();
  if (map.id === 'temple') {
    const altar = center(map, 'altar_table');
    a.set('altar_top', { x: altar.x, y: 0.9, z: altar.z });
    const prep = center(map, 'prep_table');
    a.set('prep_table_top', { x: prep.x, y: 0.9, z: prep.z });
    const stove = center(map, 'stove');
    a.set('stove_rice_top', { x: stove.x - 1.8, y: 0.95, z: stove.z });
    a.set('stove_pan_top', { x: stove.x + 1.8, y: 0.95, z: stove.z });
    const dining = center(map, 'dining_table');
    a.set('dining_table_top', { x: dining.x, y: 0.8, z: dining.z });
    const rc = center(map, 'release_cart');
    a.set('release_cart_top', { x: rc.x, y: 1.0, z: rc.z });
    const sc = center(map, 'supply_cart');
    a.set('supply_cart_top', { x: sc.x, y: 1.0, z: sc.z });
    const bodhi = center(map, 'bodhi');
    a.set('tree_root', { x: bodhi.x, y: 0, z: bodhi.z + 1.9 });
    const cb = center(map, 'cutting_board');
    a.set('cutting_board_top', { x: cb.x, y: 0.9, z: cb.z });
    const ft = center(map, 'flower_table');
    a.set('flower_table_top', { x: ft.x, y: 0.85, z: ft.z });
    const lt = center(map, 'lamp_table');
    a.set('lamp_table_top', { x: lt.x, y: 0.9, z: lt.z });
    const shed = center(map, 'storage_shed');
    a.set('storage_door', { x: shed.x + 3, y: 0, z: shed.z, ry: Math.PI / 2 });
    const gw = map.zones.find((z) => z.id === 'gate_wait');
    if (gw) a.set('gate_wait', { x: gw.shape.x, y: 0, z: gw.shape.z });
    const leaf = map.zones.find((z) => z.id === 'leaf_area');
    if (leaf) a.set('leaf_ground', { x: leaf.shape.x, y: 0, z: leaf.shape.z });
  } else {
    const dj = center(map, 'dj_booth');
    a.set('dj_booth_top', { x: dj.x, y: 1.1, z: dj.z });
    const bar = center(map, 'bar_counter');
    a.set('bar_counter_top', { x: bar.x, y: 1.1, z: bar.z });
    const bc = center(map, 'baucua_table');
    a.set('baucua_table_top', { x: bc.x, y: 0.85, z: bc.z });
    const wheel = center(map, 'truth_wheel');
    a.set('truth_wheel_disc', { x: wheel.x, y: 2.0, z: wheel.z, ry: 0 });
    const kiosk = center(map, 'exchange_kiosk');
    a.set('exchange_kiosk_top', { x: kiosk.x, y: 1.1, z: kiosk.z });
    byTag(map, 'npc_table').forEach((t, i) => a.set(`npc_table_top:npc_table_${i + 1}`, { x: t.x, y: 0.8, z: t.z }));
    a.set('dance_floor_center', { x: 0, y: 0.05, z: 0 });
  }
  return a;
}
