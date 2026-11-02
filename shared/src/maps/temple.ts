// Bản đồ Chùa (80 × 80 m). X → Đông, Z → Nam (về phía camera). Nguồn sự thật cho client + server.
// Sơ đồ tổng quát: spec mục 6.1.
import { FLOWER_NAMES, FRUIT_NAMES } from '../config/text';
import type { FlowerColor, FruitId } from '../ids';
import { headingOf } from '../util/math';
import type { ColliderDef, MapDef, StationDef } from './types';

const PI = Math.PI;
const FACE_NORTH = PI; // nhìn về −Z
const FACE_SOUTH = 0; // nhìn về +Z
const FACE_EAST = PI / 2; // nhìn về +X
const FACE_WEST = -PI / 2; // nhìn về −X

const box = (x: number, z: number, w: number, d: number, tag: string): ColliderDef => ({ kind: 'box', x, z, w, d, tag });
const circle = (x: number, z: number, r: number, tag: string): ColliderDef => ({ kind: 'circle', x, z, r, tag });

const stations: StationDef[] = [];
const colliders: ColliderDef[] = [];
const add = (s: StationDef) => stations.push(s);

// ── Tường bao ──────────────────────────────────────────────
// Sân chính (z −40..40) + sân trên phía Bắc cho Đại Pháp Đường (z −100..−40). Tường ngang cũ ở z = −40 chỉ còn hai
// đoạn sau nhà bếp và sau Điện Tăng Đoàn; khoảng giữa (x −23..25) mở thông lên sân trên, có hai nghi môn hai bên
// Chánh Điện đánh dấu lối lên.
colliders.push(
  box(0, -100, 82, 1, 'wall_perimeter'),
  box(-21.5, 40, 37, 1, 'wall_perimeter'),
  box(21.5, 40, 37, 1, 'wall_perimeter'),
  box(-40, -30, 1, 142, 'wall_perimeter'),
  box(40, -30, 1, 142, 'wall_perimeter'),
  box(-31.5, -40, 17, 1, 'wall_perimeter'),
  box(32.5, -40, 15, 1, 'wall_perimeter'),
);

// ── Cổng Tam Quan (Nam) + cổng Hạ Sơn ─────────────────────
colliders.push(
  circle(-3.2, 38.6, 0.5, 'gate_pillar'),
  circle(3.2, 38.6, 0.5, 'gate_pillar'),
  circle(-7, 38.6, 0.5, 'gate_pillar'),
  circle(7, 38.6, 0.5, 'gate_pillar'),
  circle(-32, 34, 0.45, 'hason_pillar'),
  circle(-28, 34, 0.45, 'hason_pillar'),
);

// ── Chánh Điện: x ∈ [−11, 11], z ∈ [−37, −21], cửa ở giữa phía Nam ──
colliders.push(
  box(0, -37, 22, 0.6, 'wall_chanh_dien'),
  box(-11, -29, 0.6, 16, 'wall_chanh_dien'),
  box(11, -29, 0.6, 16, 'wall_chanh_dien'),
  box(-7, -21, 8, 0.6, 'wall_chanh_dien'),
  box(7, -21, 8, 0.6, 'wall_chanh_dien'),
  box(0, -34.35, 7, 3.4, 'buddha'),
  circle(-8, -24, 0.35, 'pillar'),
  circle(8, -24, 0.35, 'pillar'),
  circle(-8, -32, 0.35, 'pillar'),
  circle(8, -32, 0.35, 'pillar'),
);
{
  // 10 bồ đoàn gõ mõ: 2 hàng × 5, nhìn về tượng Phật (Bắc).
  let i = 1;
  for (const z of [-28.5, -25]) {
    for (const x of [-6, -3, 0, 3, 6]) {
      add({
        id: `mo_cushion_${i}`,
        kind: 'mo_cushion',
        activity: 'chant',
        x,
        z,
        r: 0.9,
        label: 'Ngồi gõ mõ',
        ry: FACE_NORTH,
        data: { index: i },
      });
      i++;
    }
  }
}
add({ id: 'temple_steps', kind: 'temple_steps', activity: 'guest', x: 0, z: -19, r: 2.5, label: 'Bậc Chánh Điện', ry: FACE_NORTH, area: true });

// ── Đàn tràng + Bàn soạn lễ (ngoài sân, trước Chánh Điện) ──
colliders.push(box(0, -14.5, 8, 1.6, 'altar_table'), box(-7, -14.5, 3, 1.4, 'prep_table'));
add({ id: 'altar', kind: 'altar', activity: 'ceremony', x: 0, z: -12.6, r: 2.4, label: 'Đàn tràng', ry: FACE_NORTH });
add({ id: 'prep_table', kind: 'prep_table', activity: 'ceremony', x: -7, z: -12.9, r: 1.8, label: 'Bàn soạn lễ', ry: FACE_NORTH });

// ── Lư hương lớn giữa sân ──
colliders.push(circle(0, -6, 1.1, 'incense_burner'));

// ── Hương đăng: bàn đèn/hương, vò dầu, giá nến ──
colliders.push(box(12, -15, 2.6, 1.2, 'lamp_table'), circle(15.8, -12.5, 0.6, 'oil_jar'), circle(9, -11, 0.45, 'candle_stand'));
add({ id: 'lamp_table', kind: 'lamp_table', activity: 'ceremony', x: 12, z: -13.6, r: 1.6, label: 'Bàn hương đăng', ry: FACE_NORTH });
add({ id: 'oil_jar', kind: 'oil_jar', activity: 'ceremony', x: 15.8, z: -11.2, r: 1.5, label: 'Châm dầu', ry: FACE_NORTH });
add({ id: 'candle_stand', kind: 'candle_stand', activity: 'ceremony', x: 9, z: -9.8, r: 1.5, label: 'Thắp lửa', ry: FACE_NORTH });

// ── Gác chuông + Đại Hồng Chung (Đông) ──
colliders.push(
  circle(21.5, -17.5, 0.4, 'bell_pillar'),
  circle(28.5, -17.5, 0.4, 'bell_pillar'),
  circle(21.5, -10.5, 0.4, 'bell_pillar'),
  circle(28.5, -10.5, 0.4, 'bell_pillar'),
  circle(26, -14, 1.5, 'bell'),
);
[
  [20, -15.4],
  [20, -12.6],
  [18.4, -15.4],
  [18.4, -12.6],
].forEach(([x, z], i) =>
  add({
    id: `bell_rope_${i + 1}`,
    kind: 'bell_rope',
    activity: 'bell',
    x: x as number,
    z: z as number,
    r: 0.9,
    label: 'Nắm dây kéo chuông',
    ry: FACE_EAST,
    data: { index: i + 1 },
  }),
);

// ── Điện Tăng Đoàn (điện tuyên dương chư Tăng còn đang tu học, thay Tăng xá cũ): cửa giữa mặt Nam, 2 hàng cột son, ──
// 3 chân dung Sư Thầy mỗi bên tường Tây/Đông, trước mỗi chân dung có kệ ống quẻ + bồ đoàn để đảnh lễ rồi bóc quẻ;
// bệ Bảng Vàng sát tường Bắc, trước bệ (trên thảm) là bồ đoàn lạy "Xả nghiệp". (Tên hằng/nhãn va chạm `shrine*`,
// `tang_doan_altar`, `crane` giữ từ bản cũ.)
/** Bố cục Điện Tăng Đoàn — dùng chung cho va chạm (ở đây) và dựng hình (client). */
export const TANG_DOAN = {
  x: 31,
  /** Tâm tường mặt Nam (có cửa) / mặt Bắc. */
  zSouth: -24.6,
  zNorth: -38.6,
  /** Tâm tường Tây / Đông. */
  xWest: 25.85,
  xEast: 36.15,
  wall: 0.5,
  doorW: 2.4,
  /** Hàng cột trong: x = x ± colX, tại các z này. */
  colX: 2.3,
  colZs: [-27, -29.8, -32.6, -35.4],
  /** Tâm chân dung Sư Thầy (giữa hai cột) — 3 chân dung mỗi bên. */
  shrineZs: [-28.4, -31.2, -34],
  /** Kệ ống quẻ trước chân dung: sâu (tính từ mặt tường trong) × rộng. */
  shrineTable: { d: 0.6, w: 1.5 },
  /** Từ mặt tường trong tới chỗ quỳ. */
  kneelOff: 1.55,
  /** Từ mặt tường Bắc phía trong tới bồ đoàn lạy xả nghiệp (giữa thảm, lùi khỏi bệ để khi quỳ thấy trọn Bảng Vàng). */
  xaNghiepOff: 3.8,
  /** Cột hiên trước cửa. */
  porchX: 2.4,
  porchZ: -23.6,
} as const;
{
  const T = TANG_DOAN;
  const innerW = T.xWest + T.wall / 2;
  const innerE = T.xEast - T.wall / 2;
  const outerW = T.xWest - T.wall / 2;
  const outerE = T.xEast + T.wall / 2;
  const doorL = T.x - T.doorW / 2;
  const doorR = T.x + T.doorW / 2;
  const depth = T.zSouth - T.zNorth + T.wall;
  const midZ = (T.zSouth + T.zNorth) / 2;
  colliders.push(
    box((outerW + doorL) / 2, T.zSouth, doorL - outerW, T.wall, 'wall_tang_doan'),
    box((doorR + outerE) / 2, T.zSouth, outerE - doorR, T.wall, 'wall_tang_doan'),
    box(T.x, T.zNorth, outerE - outerW, T.wall, 'wall_tang_doan'),
    box(T.xWest, midZ, T.wall, depth, 'wall_tang_doan'),
    box(T.xEast, midZ, T.wall, depth, 'wall_tang_doan'),
    box(T.x, -37.55, 4.4, 1.6, 'tang_doan_altar'),
    circle(T.x - 2.75, -37.2, 0.45, 'crane'),
    circle(T.x + 2.75, -37.2, 0.45, 'crane'),
    circle(T.x - T.porchX, T.porchZ, 0.3, 'pillar'),
    circle(T.x + T.porchX, T.porchZ, 0.3, 'pillar'),
  );
  for (const z of T.colZs) colliders.push(circle(T.x - T.colX, z, 0.3, 'pillar'), circle(T.x + T.colX, z, 0.3, 'pillar'));
  // Chân dung 1–3 ở tường Tây, 4–6 ở tường Đông (từ cửa vào trong).
  ([
    [innerW, 1, FACE_WEST],
    [innerE, -1, FACE_EAST],
  ] as const).forEach(([wallX, inward, ry], side) =>
    T.shrineZs.forEach((z, k) => {
      const n = side * T.shrineZs.length + k + 1;
      colliders.push(box(wallX + inward * (T.shrineTable.d / 2), z, T.shrineTable.d, T.shrineTable.w, 'shrine_table'));
      add({
        id: `portrait_${n}`,
        kind: 'portrait',
        activity: 'gallery',
        x: wallX + inward * T.kneelOff,
        z,
        r: 0.9,
        label: 'Đảnh lễ Sư Thầy',
        ry,
        data: { photo: `portrait_${n}`, index: n },
      });
    }),
  );
  // Bồ đoàn "Xả nghiệp" giữa thảm đỏ trước bệ Bảng Vàng, nhìn về Bảng Vàng.
  add({
    id: 'xa_nghiep',
    kind: 'xa_nghiep_cushion',
    activity: 'gallery',
    x: T.x,
    z: T.zNorth + T.wall / 2 + T.xaNghiepOff,
    r: 0.9,
    label: 'Lạy xả nghiệp',
    ry: FACE_NORTH,
  });
}

// ── Tủ áo (sát mặt tiền Điện Tăng Đoàn, bên phải cửa) ──
colliders.push(box(35.3, -23.9, 2.2, 0.8, 'wardrobe'));
add({ id: 'wardrobe', kind: 'wardrobe', activity: 'wardrobe', x: 35.3, z: -22.6, r: 1.5, label: 'Tủ áo', ry: FACE_NORTH });

// ── Đại Pháp Đường (sân trên phía Bắc): điện nghe kinh lớn nhất chùa ──
// Hiên 10 cột son, 3 cửa ở mặt Nam; trong điện 4 hàng cột lớn, tượng Phật đá cao ~9 m trên bệ sát tường Bắc,
// 40 bồ đoàn chia hai bên lối giữa trải thảm. Trước điện là sân lát đá với đèn đá, nghê đá, cột phướn.
/** Bố cục Đại Pháp Đường — dùng chung cho va chạm, trạm (ở đây) và dựng hình (client). Đơn vị mét. */
export const PHAP_DUONG = {
  x: 0,
  /** Tâm tường mặt Nam (có 3 cửa) / mặt Bắc. */
  zSouth: -62,
  zNorth: -94,
  /** Tâm tường Tây / Đông. */
  xWest: -22,
  xEast: 22,
  wall: 0.8,
  /** Cửa ở tường Nam: [tâm x, bề rộng] — cửa chính giữa + hai cửa bên. */
  doors: [
    [-11, 3.6],
    [0, 5],
    [11, 3.6],
  ],
  doorH: 7.2,
  /** Đỉnh tường (chân mái) và trần trong điện. */
  wallH: 12,
  ceilingY: 12.4,
  /** Hiên trước: hàng cột ngoài tại porchZ. */
  porchZ: -58.6,
  porchXs: [-22.3, -19, -13.8, -8.2, -3.3, 3.3, 8.2, 13.8, 19, 22.3],
  porchR: 0.5,
  /** Hai hàng cột lớn mỗi bên trong điện (x = ±colXs) tại các z. */
  colXs: [9, 16],
  colZs: [-66, -71, -76, -81, -86],
  colR: 0.6,
  /** Bệ thờ tượng Phật lớn sát tường Bắc: tâm z, rộng (X), sâu (Z), cao. */
  altar: { z: -89.6, w: 16, d: 8, h: 2 },
  /** Tỉ lệ tượng Phật (tượng cao 3,62 đơn vị → ~9,2 m), đặt giữa mặt bệ. */
  statueScale: 2.55,
  /** Hai cây đèn hoa sen đứng trước hai góc bệ. */
  lampXs: [-6, 6],
  lampZ: -84.4,
  /** Bồ đoàn nghe kinh: các hàng z × các cột x (chừa lối giữa trải thảm, cách xa hàng cột). */
  cushionZs: [-68, -70.6, -73.2, -75.8, -78.4],
  cushionXs: [-7.2, -5.4, -3.6, -1.8, 1.8, 3.6, 5.4, 7.2],
  /** Sân lát đá trước điện. */
  plaza: { minX: -30, maxX: 30, minZ: -57.6, maxZ: -42 },
  /** Hai nghi môn ở chỗ tường ngang cũ (z = −40), hai bên Chánh Điện: tâm x + nửa khoảng cách hai trụ. */
  gates: [
    [-17.2, 2.4],
    [18, 2.4],
  ],
  gateZ: -40.4,
} as const;
{
  const P = PHAP_DUONG;
  const outerW = P.xWest - P.wall / 2;
  const outerE = P.xEast + P.wall / 2;
  const depth = P.zSouth - P.zNorth + P.wall;
  const midZ = (P.zSouth + P.zNorth) / 2;
  // Tường Nam chia đoạn giữa các cửa.
  let from: number = outerW;
  for (const [cx, w] of P.doors) {
    colliders.push(box((from + cx - w / 2) / 2, P.zSouth, cx - w / 2 - from, P.wall, 'wall_phap_duong'));
    from = cx + w / 2;
  }
  colliders.push(
    box((from + outerE) / 2, P.zSouth, outerE - from, P.wall, 'wall_phap_duong'),
    box(P.x, P.zNorth, outerE - outerW, P.wall, 'wall_phap_duong'),
    box(P.xWest, midZ, P.wall, depth, 'wall_phap_duong'),
    box(P.xEast, midZ, P.wall, depth, 'wall_phap_duong'),
    box(P.x, P.altar.z, P.altar.w, P.altar.d, 'phap_duong_altar'),
  );
  for (const z of P.colZs) for (const cx of P.colXs) colliders.push(circle(-cx, z, P.colR, 'pillar'), circle(cx, z, P.colR, 'pillar'));
  for (const x of P.porchXs) colliders.push(circle(x, P.porchZ, P.porchR, 'pillar'));
  for (const x of P.lampXs) colliders.push(circle(x, P.lampZ, 0.5, 'lotus_lamp'));
  let n = 1;
  for (const z of P.cushionZs) {
    for (const x of P.cushionXs) {
      add({
        id: `sutra_cushion_${n}`,
        kind: 'sutra_cushion',
        activity: 'sutra',
        x,
        z,
        r: 0.8,
        label: 'Ngồi nghe kinh',
        ry: FACE_NORTH,
        data: { index: n },
      });
      n++;
    }
  }
  // Sân trước điện: đôi đèn đá lớn, đôi nghê đá hai bên bậc, sáu cột phướn; hai nghi môn ở lối lên.
  colliders.push(
    circle(-8, -50, 0.7, 'stone_lantern'),
    circle(8, -50, 0.7, 'stone_lantern'),
    circle(-4.8, -56, 0.7, 'nghe'),
    circle(4.8, -56, 0.7, 'nghe'),
  );
  for (const x of [-26, -20, -14, 14, 20, 26]) colliders.push(circle(x, -47, 0.25, 'banner_pole'));
  for (const [gx, half] of P.gates) colliders.push(circle(gx - half, P.gateZ, 0.4, 'gate_pillar'), circle(gx + half, P.gateZ, 0.4, 'gate_pillar'));
}

// ── Nhà bếp: x ∈ [−37, −23], z ∈ [−34, −22], mở phía Nam và Đông ──
colliders.push(
  box(-30, -34, 14, 0.5, 'wall_kitchen'),
  box(-37, -28, 0.5, 12, 'wall_kitchen'),
  circle(-23.3, -33.7, 0.35, 'pillar'),
  circle(-23.3, -22.3, 0.35, 'pillar'),
  circle(-36.7, -22.3, 0.35, 'pillar'),
  box(-35.3, -32.4, 1.2, 1.2, 'rice_bin'),
  box(-32.4, -32.6, 1.6, 1.0, 'wash_basin'),
  box(-27, -32.9, 6, 1.6, 'stove'),
  box(-35.2, -26, 1.0, 2.2, 'cutting_board'),
  circle(-24, -23, 0.3, 'order_board'),
);
add({ id: 'rice_bin', kind: 'rice_bin', activity: 'cook', x: -35.3, z: -31, r: 1.3, label: 'Lấy gạo', ry: FACE_NORTH });
add({ id: 'wash_basin', kind: 'wash_basin', activity: 'cook', x: -32.4, z: -31.2, r: 1.3, label: 'Vo gạo', ry: FACE_NORTH });
add({ id: 'stove_rice', kind: 'stove_rice', activity: 'cook', x: -29.2, z: -31.2, r: 1.2, label: 'Bếp nồi cơm', ry: FACE_NORTH });
add({ id: 'firebox', kind: 'firebox', activity: 'cook', x: -27, z: -31.2, r: 1.0, label: 'Bỏ củi / quạt lửa', ry: FACE_NORTH });
add({ id: 'stove_pan', kind: 'stove_pan', activity: 'cook', x: -24.8, z: -31.2, r: 1.2, label: 'Chảo xào rau', ry: FACE_NORTH });
add({ id: 'cutting_board', kind: 'cutting_board', activity: 'cook', x: -33.8, z: -26, r: 1.3, label: 'Thái rau nấm', ry: FACE_WEST });
add({ id: 'order_board', kind: 'order_board', activity: 'cook', x: -24.8, z: -24.5, r: 1.4, label: 'Bảng gọi món — nấu cơm chay', ry: FACE_SOUTH });

// Chum nước (2 cạnh bếp, 1 trong vườn)
colliders.push(circle(-21.2, -23.5, 0.55, 'jar'), circle(-21.2, -21.3, 0.55, 'jar'), circle(-17.5, 21.5, 0.55, 'jar'));
add({ id: 'water_jar_1', kind: 'water_jar', activity: 'water', x: -20, z: -23.5, r: 1.1, label: 'Đổ nước vào chum', ry: FACE_WEST, data: { index: 1 } });
add({ id: 'water_jar_2', kind: 'water_jar', activity: 'water', x: -20, z: -21.3, r: 1.1, label: 'Đổ nước vào chum', ry: FACE_WEST, data: { index: 2 } });
add({ id: 'water_jar_3', kind: 'water_jar', activity: 'water', x: -17.5, z: 22.9, r: 1.2, label: 'Đổ nước vào chum', ry: FACE_NORTH, data: { index: 3 } });

// Bãi củi + 3 thớt chẻ củi
colliders.push(
  box(-17, -33.4, 6, 1.4, 'woodpile'),
  circle(-20, -29.4, 0.45, 'chop_block'),
  circle(-17, -29.4, 0.45, 'chop_block'),
  circle(-14, -29.4, 0.45, 'chop_block'),
);
add({ id: 'woodpile', kind: 'woodpile', activity: 'cook', x: -17, z: -31.9, r: 1.2, label: 'Lấy bó củi', ry: FACE_NORTH });
[-20, -17, -14].forEach((x, i) =>
  add({
    id: `chop_block_${i + 1}`,
    kind: 'chop_block',
    activity: 'chop',
    x,
    z: -28.2,
    r: 1.2,
    label: 'Chẻ củi',
    ry: FACE_NORTH,
    data: { index: i + 1 },
  }),
);

// Trai đường, kho đồ chay, luống rau nấm
colliders.push(box(-30, -16.5, 6, 1.4, 'dining_table'), box(-36, -12, 6, 6, 'storage_shed'));
add({ id: 'dining_table', kind: 'dining_table', activity: 'cook', x: -30, z: -15, r: 2.4, label: 'Dọn mâm (Trai đường)', ry: FACE_NORTH });
add({ id: 'storage', kind: 'storage', activity: 'restock', x: -31.8, z: -12, r: 1.6, label: 'Kho đồ chay', ry: FACE_WEST });
add({ id: 'veggie_patch', kind: 'veggie_patch', activity: 'cook', x: -23, z: -16, r: 2.2, label: 'Hái rau nấm', ry: FACE_SOUTH, area: true });

// ── Cây Bồ đề + giá chổi ──
colliders.push(circle(-14, -6, 1.4, 'bodhi'), box(-21, 1.5, 0.5, 2.2, 'broom_rack'));
add({ id: 'tree_root', kind: 'tree_root', activity: 'sweep', x: -14, z: -3.8, r: 2.2, label: 'Đổ lá vào gốc cây', ry: FACE_NORTH });
add({ id: 'broom_rack', kind: 'broom_rack', activity: 'sweep', x: -19.8, z: 1.5, r: 1.3, label: 'Lấy chổi', ry: FACE_WEST });

// ── Vườn: 7 cây quả + 4 luống hoa + bàn cắm hoa ──
const fruitTrees: [FruitId, number, number][] = [
  ['chuoi', -36, 7],
  ['buoi', -31, 7],
  ['phat_thu', -26, 7],
  ['thanh_long', -36, 13],
  ['xoai', -31, 13],
  ['du_du', -26, 13],
  ['mang_cau', -21, 10],
];
for (const [fruit, x, z] of fruitTrees) {
  colliders.push(circle(x, z, 0.45, 'fruit_tree'));
  add({
    id: `fruit_tree_${fruit}`,
    kind: 'fruit_tree',
    activity: 'ceremony',
    x,
    z: z + 1.3,
    r: 1.3,
    label: `Hái ${FRUIT_NAMES[fruit].toLowerCase()}`,
    ry: FACE_NORTH,
    data: { fruit },
  });
}
const flowerBeds: [FlowerColor, number, number][] = [
  ['vang', -36, 20],
  ['trang', -31, 20],
  ['do', -26, 20],
  ['tim', -21, 20],
];
for (const [color, x, z] of flowerBeds) {
  add({
    id: `flower_bed_${color}`,
    kind: 'flower_bed',
    activity: 'ceremony',
    x,
    z,
    r: 1.6,
    label: `Hái hoa ${FLOWER_NAMES[color]}`,
    ry: FACE_SOUTH,
    area: true,
    data: { color },
  });
}
colliders.push(box(-15, 15, 2.2, 1.0, 'flower_table'));
add({ id: 'flower_table', kind: 'flower_table', activity: 'ceremony', x: -15, z: 16.4, r: 1.4, label: 'Cắm hoa vào bình', ry: FACE_NORTH });

// ── Giếng nước ──
colliders.push(circle(14, 4, 1.0, 'well'));
add({ id: 'well', kind: 'well', activity: 'water', x: 14, z: 5.6, r: 1.3, label: 'Kéo nước giếng', ry: FACE_NORTH });

// ── Thiền viên: 6 bồ đoàn quanh đèn đá ──
const lantern = { x: 10, z: 15.5 };
colliders.push(circle(lantern.x, lantern.z, 0.45, 'stone_lantern'));
[
  [6, 13],
  [10, 12.4],
  [14, 13],
  [6, 18],
  [10, 18.6],
  [14, 18],
].forEach(([x, z], i) =>
  add({
    id: `meditation_cushion_${i + 1}`,
    kind: 'meditation_cushion',
    activity: 'meditate',
    x: x as number,
    z: z as number,
    r: 0.9,
    label: 'Ngồi thiền',
    ry: headingOf(lantern.x - (x as number), lantern.z - (z as number)),
    data: { index: i + 1 },
  }),
);

// ── Ao phóng sinh + bìa rừng (Đông Nam) ──
colliders.push(circle(24, 21, 6, 'pond'));
add({ id: 'pond_release', kind: 'pond_release', activity: 'release', x: 24, z: 21, r: 8.3, label: 'Thả xuống ao', ry: FACE_EAST, area: true });
[8, 20, 32].forEach((z, i) =>
  add({
    id: `forest_release_${i + 1}`,
    kind: 'forest_release',
    activity: 'release',
    x: 35.5,
    z,
    r: 3,
    label: 'Thả về rừng',
    ry: FACE_EAST,
    area: true,
  }),
);
colliders.push(
  circle(37.5, 3.5, 0.5, 'tree'),
  circle(38.2, 12, 0.5, 'tree'),
  circle(37.4, 16.5, 0.5, 'tree'),
  circle(38.4, 25, 0.5, 'tree'),
  circle(37.3, 28.5, 0.5, 'tree'),
  circle(38.4, 36, 0.5, 'tree'),
);

// ── Xe phóng sinh + xe tiếp tế (gần cổng) ──
colliders.push(box(9, 33.4, 2.6, 1.2, 'release_cart'), box(-9, 33.4, 2.6, 1.2, 'supply_cart'));
add({ id: 'release_cart', kind: 'release_cart', activity: 'release', x: 9, z: 31.9, r: 1.5, label: 'Xe phóng sinh', ry: FACE_SOUTH });
add({ id: 'supply_cart', kind: 'supply_cart', activity: 'restock', x: -9, z: 31.9, r: 1.5, label: 'Xe tiếp tế', ry: FACE_SOUTH });

// ── Đèn đá dọc lối chính + đôi nghê đá trước bậc Chánh Điện (trang trí có va chạm) ──
for (const z of [6, 13, 20, 27]) colliders.push(circle(-3.3, z, 0.35, 'path_lantern'), circle(3.3, z, 0.35, 'path_lantern'));
colliders.push(circle(-5.4, -19.7, 0.5, 'nghe'), circle(5.4, -19.7, 0.5, 'nghe'));

// ── Cây cảnh trong sân (có va chạm) ──
colliders.push(
  circle(-5, 24, 0.5, 'tree'),
  circle(5, 24, 0.5, 'tree'),
  circle(-18, 28, 0.5, 'tree'),
  circle(18, 28, 0.5, 'tree'),
  circle(20, 6, 0.5, 'tree'),
  circle(-4, 9, 0.5, 'tree'),
  circle(-27, 27, 0.5, 'tree'),
  circle(27, -3, 0.5, 'tree'),
);

export const TEMPLE_MAP: MapDef = {
  id: 'temple',
  bounds: { minX: -39, maxX: 39, minZ: -99, maxZ: 39 },
  spawn: { x: 0, z: 30, r: 3 },
  stations,
  colliders,
  // Cửa Chánh Điện mở cho mọi cấp bậc (ai cũng vào ngồi bồ đoàn gõ mõ tụng kinh được) — không đặt cổng.
  gates: [],
  zones: [
    { id: 'chanh_dien', shape: { kind: 'box', x: 0, z: -29, w: 22, d: 16 } },
    { id: 'kitchen', shape: { kind: 'box', x: -30, z: -28, w: 14, d: 12 } },
    { id: 'leaf_area', shape: { kind: 'circle', x: -11, z: -2, r: 9 } },
    { id: 'pond', shape: { kind: 'circle', x: 24, z: 21, r: 6 } },
    { id: 'forest', shape: { kind: 'box', x: 36, z: 19, w: 8, d: 38 } },
    { id: 'meditation', shape: { kind: 'box', x: 10, z: 15.5, w: 12, d: 11 } },
    { id: 'gate_wait', shape: { kind: 'box', x: 0, z: 35, w: 8, d: 3 } },
    { id: 'bell_tower', shape: { kind: 'box', x: 25, z: -14, w: 8, d: 8 } },
    { id: 'altar_area', shape: { kind: 'box', x: 0, z: -13, w: 18, d: 8 } },
    { id: 'garden', shape: { kind: 'box', x: -29, z: 14, w: 18, d: 18 } },
    { id: 'tang_doan', shape: { kind: 'box', x: 31, z: -31.6, w: 9.8, d: 13.5 } },
    // Trong Đại Pháp Đường (nghe kinh văng vẳng) + sân trước điện.
    { id: 'phap_duong', shape: { kind: 'box', x: 0, z: -78, w: 43.2, d: 31.2 } },
    { id: 'phap_duong_plaza', shape: { kind: 'box', x: 0, z: -49.8, w: 60, d: 15.6 } },
  ],
  roofs: [
    { id: 'chanh_dien', box: { x: 0, z: -29, w: 23, d: 17 } },
    { id: 'kitchen', box: { x: -30, z: -28, w: 14.6, d: 12.6 } },
    { id: 'bell_tower', box: { x: 25, z: -14, w: 8, d: 8 } },
    { id: 'tang_doan', box: { x: 31, z: -31.6, w: 11.4, d: 14.8 } },
    { id: 'phap_duong', box: { x: 0, z: -78, w: 44.8, d: 32.8 } },
  ],
};
