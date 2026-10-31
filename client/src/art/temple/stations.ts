// Đồ vật ở các trạm + vật cản trang trí của Chùa: giếng, chum, xe, bàn, lư hương, đàn tràng, bồ đoàn + mõ,
// thớt chẻ củi, giá chổi, vườn quả, luống hoa, thiền viên, ao sen, cây trong sân, đèn đá, nghê đá.
import * as THREE from 'three';
import type { ColliderDef, FruitId, MapDef, StationDef } from '@shared/index';
import { bananaPlant, bodhiTree, bush, dragonFruitPlant, fruitTree, papayaTree, pineTree, roundTree, rock, type TreeMats } from '../common/nature';
import { kit } from '../kit';
import { addStatic, flame, type TempleCtx } from './ctx';
import { POND_BANK } from './ground';

const { geo, mat, mesh } = kit;

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number } = {}): THREE.Mesh {
  return mesh(geo.box(w, h, d), mat(color), { x, y, z, ...o });
}

function at<T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0, y = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

const FLOWER_HEX: Record<string, string> = { vang: '#ffd23f', trang: '#fffaf0', do: '#e23b3b', tim: '#9b59d0' };

export interface StationControls {
  setJarLevel(stationId: string, level: number): void;
  setAltarIncense(ratio: number | null): void;
}

export function buildStationProps(ctx: TempleCtx, map: MapDef, mats: { tree: TreeMats; pine: TreeMats; bodhi: TreeMats; garden: TreeMats }): StationControls {
  const byTag = (tag: string) => map.colliders.filter((c) => c.tag === tag);
  const one = (tag: string) => byTag(tag)[0] as ColliderDef;

  // ── Đàn tràng + bàn soạn lễ + nén nhang lớn ──
  const altar = one('altar_table');
  const altarG = at(new THREE.Group(), altar.x, altar.z);
  altarG.add(box(8, 0.86, 1.6, '#9a2a1c', 0, 0.43, 0));
  altarG.add(box(8.2, 0.06, 1.75, '#e8b04a', 0, 0.88, 0));
  altarG.add(box(8.3, 0.5, 0.04, '#e8b04a', 0, 0.62, 0.86));
  for (let i = 0; i < 8; i++) altarG.add(box(0.5, 0.42, 0.02, i % 2 ? '#c8432f' : '#e8a33a', -3.5 + i, 0.62, 0.885));
  for (const x of [-4.2, 4.2]) {
    const pole = new THREE.Group();
    pole.position.set(x, 0, 0);
    pole.add(mesh(geo.cyl(0.05, 0.06, 3.4, 6), mat('#8a5a3b'), { y: 1.7 }));
    pole.add(mesh(geo.box(0.5, 1.8, 0.03), mat(x < 0 ? '#e8a33a' : '#c8432f'), { y: 2.3, x: 0.27 }));
    pole.add(mesh(geo.sphere(0.08, 6, 4), mat('#ffd166'), { y: 3.45 }));
    altarG.add(pole);
  }
  addStatic(ctx, altarG);
  const prep = one('prep_table');
  const prepG = at(new THREE.Group(), prep.x, prep.z);
  prepG.add(box(3, 0.84, 1.4, '#a0703f', 0, 0.42, 0));
  prepG.add(box(3.1, 0.06, 1.5, '#7a4a2e', 0, 0.86, 0));
  addStatic(ctx, prepG);
  // Nén nhang lớn trên đàn (hiện khi có Đại lễ, cháy ngắn dần).
  const incense = new THREE.Group();
  incense.position.set(altar.x, 0.9, altar.z - 0.35);
  incense.add(mesh(geo.lathe([[0, 0], [0.32, 0.02], [0.36, 0.25], [0.3, 0.3]], 12), mat('#9a6a35', { metalness: 0.4, roughness: 0.4 })));
  const stick = mesh(geo.cyl(0.05, 0.06, 1, 8), mat('#b8322a'), { y: 0.3 });
  const ember = mesh(geo.sphere(0.07, 8, 6), mat('#ff6a2a', { emissive: '#ff4a10', emissiveIntensity: 3 }), { y: 0.3, castShadow: false });
  incense.add(stick, ember);
  incense.visible = false;
  ctx.dynamics.add(incense);
  let incenseRatio: number | null = null;
  let smokeAcc = 0;
  ctx.updates.push((dt, t) => {
    if (incenseRatio === null) return;
    const h = 0.15 + 1.35 * incenseRatio;
    stick.scale.y = h;
    stick.position.y = 0.3 + h / 2;
    ember.position.y = 0.3 + h;
    ember.scale.setScalar(1 + Math.sin(t * 8) * 0.15);
    smokeAcc += dt;
    if (smokeAcc > 0.25) {
      smokeAcc = 0;
      smoke(altar.x, 0.9 + 0.3 + h, altar.z - 0.35, 0.5);
    }
  });

  // ── Lư hương lớn giữa sân ──
  const burnerC = one('incense_burner');
  const burner = at(new THREE.Group(), burnerC.x, burnerC.z);
  const bronze = mat('#9a6a35', { metalness: 0.5, roughness: 0.4 });
  burner.add(mesh(geo.cyl(1.25, 1.3, 0.3, 12), mat('#b8b0a2'), { y: 0.15 }));
  burner.add(mesh(geo.lathe([[0.4, 0], [0.95, 0.15], [1.05, 0.55], [0.95, 0.95], [1.0, 1.05], [0.85, 1.05]], 16), bronze, { y: 0.55 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    burner.add(mesh(geo.cyl(0.12, 0.08, 0.45, 6), bronze, { x: Math.cos(a) * 0.6, y: 0.48, z: Math.sin(a) * 0.6 }));
  }
  for (const s of [-1, 1]) burner.add(mesh(geo.torus(0.22, 0.05, 5, 10), bronze, { x: s * 1.05, y: 1.45, ry: Math.PI / 2 }));
  burner.add(mesh(geo.cyl(0.85, 0.85, 0.06, 16), mat('#d9cdb0'), { y: 1.5 }));
  for (let i = 0; i < 24; i++) {
    const a = i * 2.4;
    const r = 0.15 + (i % 5) * 0.13;
    const h = 0.4 + (i % 3) * 0.15;
    burner.add(mesh(geo.cyl(0.012, 0.012, h, 3), mat('#b8322a'), { x: Math.cos(a) * r, y: 1.52 + h / 2, z: Math.sin(a) * r }));
    if (i % 3 === 0) burner.add(mesh(geo.sphere(0.02, 4, 3), mat('#ff6a2a', { emissive: '#ff4a10', emissiveIntensity: 3 }), { x: Math.cos(a) * r, y: 1.52 + h, z: Math.sin(a) * r, castShadow: false }));
  }
  burner.add(mesh(geo.cone(0.5, 0.6, 8), bronze, { y: 2.6, scale: [1, 0.6, 1] }));
  addStatic(ctx, burner);
  let burnerAcc = 0;
  ctx.updates.push((dt) => {
    burnerAcc += dt;
    if (burnerAcc > 0.3) {
      burnerAcc = 0;
      smoke(burnerC.x + (Math.random() - 0.5) * 0.6, 2.0, burnerC.z + (Math.random() - 0.5) * 0.6, 0.8);
    }
  });

  // ── Hương đăng: bàn đèn, vò dầu, giá nến ──
  const lampT = one('lamp_table');
  const lampG = at(new THREE.Group(), lampT.x, lampT.z);
  lampG.add(box(2.6, 0.86, 1.2, '#8a1f14', 0, 0.43, 0));
  lampG.add(box(2.7, 0.06, 1.3, '#e8b04a', 0, 0.88, 0));
  for (let i = 0; i < 4; i++) {
    lampG.add(mesh(geo.cyl(0.07, 0.09, 0.05, 8), mat('#b8862f'), { x: -0.9 + i * 0.45, y: 0.94, z: -0.25 }));
    lampG.add(mesh(geo.lathe([[0.04, 0], [0.06, 0.05], [0.06, 0.12], [0.035, 0.2]], 8), mat('#dff4ff', { transparent: true, opacity: 0.4, doubleSide: true }), { x: -0.9 + i * 0.45, y: 0.97, z: -0.25, castShadow: false }));
  }
  for (let i = 0; i < 6; i++) lampG.add(mesh(geo.cyl(0.006, 0.006, 0.4, 3), mat('#b8322a'), { x: 0.6 + (i % 3) * 0.05, y: 0.92, z: 0.2 + Math.floor(i / 3) * 0.05, rz: Math.PI / 2 }));
  addStatic(ctx, lampG);
  const oil = one('oil_jar');
  addStatic(ctx, at(mesh(geo.lathe([[0, 0], [0.4, 0.02], [0.58, 0.45], [0.5, 0.85], [0.3, 1.0], [0.34, 1.08], [0, 1.08]], 14), mat('#7a4a2a')), oil.x, oil.z));
  const candle = one('candle_stand');
  const cs = at(new THREE.Group(), candle.x, candle.z);
  cs.add(mesh(geo.cyl(0.35, 0.42, 0.12, 10), mat('#9a6a35', { metalness: 0.5, roughness: 0.4 }), { y: 0.06 }));
  cs.add(mesh(geo.cyl(0.05, 0.06, 1.3, 8), mat('#9a6a35', { metalness: 0.5, roughness: 0.4 }), { y: 0.7 }));
  cs.add(mesh(geo.cyl(0.42, 0.3, 0.08, 12), mat('#9a6a35', { metalness: 0.5, roughness: 0.4 }), { y: 1.38 }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.28;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    cs.add(mesh(geo.cyl(0.035, 0.035, 0.22, 6), mat('#fff4dc'), { x, y: 1.53, z }));
    flame(ctx, cs, x, 1.69, z);
  }
  ctx.dynamics.add(cs);

  // ── Bếp: thùng gạo, chậu vo, thớt thái rau, bảng gọi món, trai đường, rau nấm, củi ──
  const bin = one('rice_bin');
  const binG = at(new THREE.Group(), bin.x, bin.z);
  binG.add(mesh(geo.lathe([[0, 0], [0.55, 0], [0.62, 0.45], [0.58, 0.95], [0, 0.95]], 12), mat('#a0703f')));
  for (const y of [0.2, 0.75]) binG.add(mesh(geo.torus(0.6, 0.03, 4, 16), mat('#5a5a62'), { y, rx: Math.PI / 2 }));
  binG.add(mesh(geo.sphere(0.5, 10, 6), mat('#fffdf5'), { y: 0.93, scale: [1, 0.25, 1] }));
  addStatic(ctx, binG);
  const basin = one('wash_basin');
  const basinG = at(new THREE.Group(), basin.x, basin.z);
  basinG.add(box(1.6, 0.7, 1.0, '#b8b0a2', 0, 0.35, 0));
  basinG.add(box(1.35, 0.04, 0.75, '#5cc2dd', 0, 0.68, 0));
  basinG.add(mesh(geo.cyl(0.05, 0.05, 1.2, 6), mat('#9ccc65'), { x: -0.6, y: 1.1, z: -0.4, rz: 1.2 }));
  addStatic(ctx, basinG);
  const cb = one('cutting_board');
  const cbG = at(new THREE.Group(), cb.x, cb.z);
  cbG.add(box(1.0, 0.85, 2.2, '#a0703f', 0, 0.425, 0));
  cbG.add(box(0.6, 0.06, 0.8, '#d9b07a', 0.1, 0.88, 0));
  cbG.add(box(0.02, 0.03, 0.3, '#d9dde3', 0.15, 0.93, -0.2));
  for (let i = 0; i < 5; i++) cbG.add(mesh(geo.cone(0.05, 0.16, 5), mat('#5fae4e'), { x: -0.1, y: 0.95, z: 0.55 + i * 0.08, rz: 1.4 }));
  addStatic(ctx, cbG);
  const ob = one('order_board');
  const obG = at(new THREE.Group(), ob.x, ob.z);
  obG.add(mesh(geo.cyl(0.07, 0.08, 1.8, 6), mat('#6e4a32'), { y: 0.9 }));
  const menu = kit.canvasTexture(512, 384, (c, w, h) => {
    c.fillStyle = '#2f3b2f';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#c8a064';
    c.lineWidth = 16;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#ffe08a';
    c.font = `800 52px ${kit.FONT_TITLE}`;
    c.textAlign = 'center';
    c.fillText('THỰC ĐƠN CHAY', w / 2, 80);
    c.fillStyle = '#f4efe2';
    c.font = `600 34px ${kit.FONT_BODY}`;
    ['🍚 Cơm trắng dẻo thơm', '🍄 Rau nấm xào', '🔥 Canh lửa vừa tay', 'Bấm E để mở bếp!'].forEach((t, i) => c.fillText(t, w / 2, 150 + i * 56));
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshStandardMaterial({ map: menu, roughness: 0.8 }));
  board.position.set(0, 1.55, -0.06);
  board.rotation.y = Math.PI;
  obG.add(board, mesh(geo.box(1.28, 0.98, 0.06), mat('#6e4a32'), { y: 1.55 }));
  addStatic(ctx, obG);
  const dining = one('dining_table');
  const dG = at(new THREE.Group(), dining.x, dining.z);
  dG.add(box(6, 0.12, 1.4, '#8a5a3b', 0, 0.72, 0));
  for (const x of [-2.7, 2.7]) for (const z of [-0.55, 0.55]) dG.add(box(0.12, 0.7, 0.12, '#6e4a32', x, 0.35, z));
  dG.add(box(6, 0.08, 0.4, '#8a5a3b', 0, 0.42, -1.1));
  for (let i = 0; i < 6; i++) {
    const x = -2.5 + i;
    dG.add(mesh(geo.lathe([[0, 0], [0.08, 0], [0.13, 0.09], [0.12, 0.1]], 10), mat('#f7f3ea'), { x, y: 0.78, z: -0.35 }));
    dG.add(box(0.01, 0.01, 0.28, '#c8a064', x + 0.18, 0.79, -0.35));
  }
  dG.add(mesh(geo.lathe([[0, 0], [0.26, 0.01], [0.32, 0.18], [0.28, 0.3], [0, 0.3]], 12), mat('#5a3a28'), { y: 0.78, z: 0.25 }));
  addStatic(ctx, dG);
  const sign = kit.signBoard('TRAI ĐƯỜNG', { width: 1.5, height: 0.36, bg: '#6e3b26', border: '#e8b04a', color: '#ffd166' });
  sign.position.set(dining.x, 1.25, dining.z - 0.72);
  addStatic(ctx, sign);
  const veg = map.stations.find((s) => s.kind === 'veggie_patch')!;
  const vegG = at(new THREE.Group(), veg.x, veg.z);
  vegG.add(mesh(geo.cyl(2.3, 2.3, 0.08, 20), mat('#6e4a32'), { y: 0.04 }));
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39;
    const r = 0.35 + (i % 6) * 0.3;
    if (i % 5 === 0) {
      vegG.add(mesh(geo.cyl(0.03, 0.04, 0.12, 5), mat('#f1e6d0'), { x: Math.cos(a) * r, y: 0.12, z: Math.sin(a) * r }));
      vegG.add(mesh(geo.sphere(0.1, 8, 5), mat('#8a5a3b'), { x: Math.cos(a) * r, y: 0.2, z: Math.sin(a) * r, scale: [1, 0.5, 1] }));
    } else {
      vegG.add(mesh(geo.ico(0.16, 0), mat(i % 2 ? '#5fae4e' : '#86c76a'), { x: Math.cos(a) * r, y: 0.18, z: Math.sin(a) * r, scale: [1, 0.7, 1] }));
    }
  }
  addStatic(ctx, vegG);
  const pile = one('woodpile');
  const pileG = at(new THREE.Group(), pile.x, pile.z);
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 14 - row; i++) {
      pileG.add(mesh(geo.cyl(0.14, 0.15, 1.2, 7), mat(i % 3 ? '#8a5a3b' : '#9b6a45'), { x: -2.7 + i * 0.4 + row * 0.2, y: 0.15 + row * 0.27, z: 0, rx: Math.PI / 2 }));
      pileG.add(mesh(geo.cyl(0.12, 0.12, 0.01, 7), mat('#d9b07a'), { x: -2.7 + i * 0.4 + row * 0.2, y: 0.15 + row * 0.27, z: 0.605, rx: Math.PI / 2 }));
    }
  }
  pileG.add(box(6.4, 0.1, 1.8, '#9a4430', 0, 1.6, 0, { rx: 0.2 }));
  for (const x of [-3.1, 3.1]) pileG.add(mesh(geo.cyl(0.06, 0.06, 1.6, 5), mat('#6e4a32'), { x, y: 0.8, z: 0.5 }));
  addStatic(ctx, pileG);
  for (const c of byTag('chop_block')) {
    const blk = at(new THREE.Group(), c.x, c.z);
    blk.add(mesh(geo.cyl(0.42, 0.48, 0.55, 10), mat('#8a5a3b'), { y: 0.275 }));
    blk.add(mesh(geo.cyl(0.4, 0.4, 0.02, 10), mat('#d9b07a'), { y: 0.56 }));
    blk.add(mesh(geo.cyl(0.025, 0.03, 0.7, 6), mat('#a0703f'), { x: 0.05, y: 0.85, z: -0.05, rz: -0.5 }));
    blk.add(box(0.05, 0.16, 0.22, '#9aa3ad', -0.12, 0.62, -0.05, { rz: -0.5 }));
    addStatic(ctx, blk);
  }

  // ── Giá chổi ──
  const rack = one('broom_rack');
  const rackG = at(new THREE.Group(), rack.x, rack.z);
  rackG.add(box(0.3, 0.12, 2.2, '#6e4a32', 0, 1.3, 0));
  for (const z of [-1, 1]) rackG.add(mesh(geo.cyl(0.06, 0.07, 1.4, 6), mat('#6e4a32'), { y: 0.7, z }));
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.position.set(0.12, 1.3, -0.75 + i * 0.5);
    b.rotation.z = -0.25;
    b.add(mesh(geo.cyl(0.018, 0.022, 1.3, 5), mat('#c8a064'), { y: -0.5 }));
    b.add(mesh(geo.cone(0.13, 0.4, 7), mat('#d9b26a'), { y: -1.2, rx: Math.PI, scale: [1, 1, 0.45] }));
    rackG.add(b);
  }
  addStatic(ctx, rackG);

  // ── Giếng: thành đá tròn, giá gỗ, ròng rọc, gàu ──
  const well = one('well');
  const wellG = at(new THREE.Group(), well.x, well.z);
  wellG.add(mesh(geo.cyl(0.95, 1.0, 0.85, 14), mat('#b8b0a2'), { y: 0.425 }));
  wellG.add(mesh(geo.torus(0.92, 0.1, 6, 18), mat('#a39b8c'), { y: 0.86, rx: Math.PI / 2 }));
  wellG.add(mesh(new THREE.CircleGeometry(0.82, 18).rotateX(-Math.PI / 2), mat('#2b6a7a', { emissive: '#103a44', emissiveIntensity: 0.3 }), { y: 0.55, castShadow: false }));
  for (const x of [-0.8, 0.8]) wellG.add(mesh(geo.cyl(0.07, 0.08, 2.0, 6), mat('#6e4a32'), { x, y: 1.0 }));
  wellG.add(mesh(geo.cyl(0.06, 0.06, 1.8, 6), mat('#6e4a32'), { y: 1.95, rz: Math.PI / 2 }));
  wellG.add(mesh(geo.cyl(0.15, 0.15, 0.12, 10), mat('#8a5a3b'), { y: 1.95, rz: Math.PI / 2 }));
  wellG.add(mesh(geo.cyl(0.012, 0.012, 1.0, 3), mat('#c8a064'), { y: 1.45 }));
  wellG.add(mesh(geo.lathe([[0, 0], [0.14, 0], [0.17, 0.2], [0, 0.2]], 8), mat('#a06b3d'), { y: 0.85, x: 0.35 }));
  for (const s of [-1, 1]) wellG.add(box(1.1, 0.06, 0.8, '#9a4430', s * 0.48, 2.25, 0, { rz: s * -0.45 }));
  addStatic(ctx, wellG);

  // ── Chum nước (mực nước điều khiển bởi mini-game xách nước) ──
  const jarLevels = new Map<string, THREE.Mesh>();
  const jarColliders = byTag('jar');
  for (const st of map.stations.filter((s) => s.kind === 'water_jar')) {
    const c = jarColliders.reduce((best, j) => (Math.hypot(j.x - st.x, j.z - st.z) < Math.hypot(best.x - st.x, best.z - st.z) ? j : best));
    const jarG = at(new THREE.Group(), c.x, c.z);
    jarG.add(mesh(geo.lathe([[0, 0], [0.35, 0.01], [0.56, 0.35], [0.55, 0.7], [0.42, 0.95], [0.44, 1.02], [0.4, 1.02], [0.38, 0.96], [0.5, 0.7], [0.5, 0.35], [0.3, 0.06], [0, 0.06]], 14), mat('#7a4a2a', { roughness: 0.6 })));
    const water = mesh(geo.cyl(0.47, 0.47, 0.02, 14), mat('#5cc2dd', { emissive: '#2b8fb0', emissiveIntensity: 0.2 }), { y: 0.5, castShadow: false });
    jarG.add(water);
    jarLevels.set(st.id, water);
    ctx.dynamics.add(jarG);
  }

  // ── Xe phóng sinh + xe tiếp tế ──
  for (const [tag, kind] of [
    ['release_cart', 'release'],
    ['supply_cart', 'supply'],
  ] as const) {
    const c = one(tag);
    const cart = at(new THREE.Group(), c.x, c.z);
    cart.add(box(2.4, 0.12, 1.1, '#a0703f', 0, 0.62, 0));
    for (const z of [-0.55, 0.55]) cart.add(box(2.4, 0.35, 0.06, '#8a5a3b', 0, 0.85, z));
    for (const x of [-1.2, 1.2]) cart.add(box(0.06, 0.35, 1.1, '#8a5a3b', x, 0.85, 0));
    for (const s of [-1, 1]) {
      cart.add(mesh(geo.torus(0.42, 0.06, 6, 14), mat('#6e4a32'), { x: -0.4, y: 0.45, z: s * 0.66 }));
      for (let k = 0; k < 4; k++) cart.add(box(0.05, 0.8, 0.04, '#6e4a32', -0.4, 0.45, s * 0.66, { rz: (k * Math.PI) / 4 }));
    }
    cart.add(mesh(geo.cyl(0.035, 0.035, 1.6, 5), mat('#6e4a32'), { x: 1.6, y: 0.65, rz: 1.35 }));
    if (kind === 'supply') {
      for (let i = 0; i < 3; i++) cart.add(mesh(geo.sphere(0.32, 8, 6), mat('#d8c29a'), { x: -0.7 + i * 0.6, y: 0.95, scale: [1, 0.8, 0.8] }));
      cart.add(box(0.6, 0.3, 0.45, '#b88552', 0.75, 0.85, 0.1));
      const s = kit.signBoard('XE TIẾP TẾ', { width: 1.3, height: 0.3, bg: '#6e3b26', border: '#e8b04a', color: '#ffd166' });
      s.position.set(0, 1.25, -0.6);
      s.rotation.y = Math.PI;
      cart.add(s);
    } else {
      const s = kit.signBoard('XE PHÓNG SINH', { width: 1.4, height: 0.3, bg: '#1f5a6a', border: '#9fe2ff', color: '#e8fbff' });
      s.position.set(0, 1.25, -0.6);
      s.rotation.y = Math.PI;
      cart.add(s);
    }
    addStatic(ctx, cart);
  }

  // ── Bàn cắm hoa ──
  const ft = one('flower_table');
  const ftG = at(new THREE.Group(), ft.x, ft.z);
  ftG.add(box(2.2, 0.82, 1.0, '#a0703f', 0, 0.41, 0));
  ftG.add(box(2.3, 0.05, 1.1, '#7a4a2e', 0, 0.84, 0));
  for (let i = 0; i < 3; i++) ftG.add(mesh(geo.lathe([[0, 0], [0.08, 0.01], [0.1, 0.1], [0.06, 0.22], [0.08, 0.26]], 10), mat('#f2f6ff'), { x: -0.7 + i * 0.7, y: 0.86, z: -0.25 }));
  addStatic(ctx, ftG);

  // ── Bồ đoàn gõ mõ (Chánh Điện) + bồ đoàn thiền (thiền viên) ──
  for (const s of map.stations) {
    if (s.kind === 'mo_cushion') {
      const c = at(new THREE.Group(), s.x, s.z, s.ry);
      c.add(mesh(geo.cyl(0.42, 0.46, 0.16, 14), mat('#e8a33a'), { y: 0.16 }));
      c.add(mesh(geo.torus(0.42, 0.05, 5, 16), mat('#c8832a'), { y: 0.22, rx: Math.PI / 2 }));
      c.add(mesh(geo.cyl(0.22, 0.24, 0.1, 10), mat('#a32a22'), { y: 0.13, z: 0.62 }));
      c.add(mesh(geo.sphere(0.2, 10, 8), mat('#a0532a', { roughness: 0.5 }), { y: 0.28, z: 0.62, scale: [1.2, 0.85, 0.95] }));
      c.add(box(0.26, 0.02, 0.03, '#3a1a0a', 0, 0.3, 0.8));
      c.add(mesh(geo.cyl(0.012, 0.014, 0.3, 5), mat('#7a4a2a'), { x: 0.3, y: 0.25, z: 0.4, rz: Math.PI / 2 }));
      addStatic(ctx, c);
    } else if (s.kind === 'meditation_cushion') {
      const c = at(new THREE.Group(), s.x, s.z, s.ry);
      c.add(mesh(geo.cyl(0.5, 0.55, 0.06, 12), mat('#b8a07a'), { y: 0.03 }));
      c.add(mesh(geo.cyl(0.36, 0.4, 0.18, 14), mat('#7a8a5a'), { y: 0.15 }));
      addStatic(ctx, c);
    } else if (s.kind === 'temple_steps') {
      // Bậc đã dựng trong Chánh Điện.
    }
  }

  // ── Thiền viên: sân cát cào vòng tròn, đèn đá, đá cảnh, bonsai ──
  const lantern = one('stone_lantern');
  const zen = at(new THREE.Group(), lantern.x, lantern.z);
  zen.add(mesh(geo.cyl(5.8, 5.8, 0.04, 40), mat('#efe6cf'), { y: 0.02 }));
  for (let r = 1.2; r < 5.6; r += 0.55) zen.add(mesh(geo.torus(r, 0.025, 3, 48), mat('#d9ccae'), { y: 0.045, rx: Math.PI / 2, castShadow: false }));
  zen.add(mesh(geo.cyl(0.3, 0.38, 0.3, 6), mat('#b8b0a2'), { y: 0.15 }));
  zen.add(mesh(geo.cyl(0.12, 0.14, 0.7, 6), mat('#b8b0a2'), { y: 0.65 }));
  zen.add(mesh(geo.box(0.6, 0.45, 0.6), mat('#c9c1b2'), { y: 1.2 }));
  const lglow = new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb347', emissiveIntensity: 1.4, flatShading: true });
  ctx.flicker.push({ mat: lglow, base: 1.4, speed: 2, phase: 1 });
  zen.add(mesh(geo.box(0.42, 0.3, 0.62), lglow, { y: 1.2, castShadow: false }));
  zen.add(mesh(geo.cone(0.6, 0.45, 6), mat('#a8a092'), { y: 1.65 }));
  zen.add(mesh(geo.sphere(0.1, 6, 4), mat('#a8a092'), { y: 1.92 }));
  addStatic(ctx, zen);
  addStatic(ctx, at(rock(ctx.rng, mat('#9a948a'), 1.5), lantern.x + 4.6, lantern.z - 2.6));
  addStatic(ctx, at(rock(ctx.rng, mat('#a8a296'), 1.1), lantern.x - 4.9, lantern.z + 2.2));
  addStatic(ctx, at(rock(ctx.rng, mat('#8f897f'), 0.9), lantern.x + 1.5, lantern.z + 5.0));

  // ── Ao sen ──
  const pondC = one('pond');
  const pond = { x: pondC.x, z: pondC.z, r: pondC.kind === 'circle' ? pondC.r : 6 };
  const rim = at(new THREE.Group(), pond.x, pond.z);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    rim.add(mesh(geo.dodeca(0.55), mat(i % 3 ? '#b8b0a2' : '#a39b8c'), { x: Math.cos(a) * (pond.r + 0.15), y: 0.12, z: Math.sin(a) * (pond.r + 0.15), scale: [1.2, 0.5, 1], ry: a }));
  }
  // Lòng ao thật nằm dưới lỗ khoét trên địa hình: vách bờ đất + đáy lõm (không mặt nào trùng mặt đất).
  const hole = pond.r + POND_BANK;
  const bankMat = new THREE.MeshStandardMaterial({ color: '#5b5443', roughness: 1, side: THREE.BackSide });
  rim.add(mesh(new THREE.CylinderGeometry(hole, hole, 0.62, 56, 1, true), bankMat, { y: -0.29, castShadow: false }));
  const bedMat = new THREE.MeshStandardMaterial({ color: '#33402f', roughness: 1, side: THREE.DoubleSide });
  const bed = new THREE.LatheGeometry(
    [new THREE.Vector2(hole, -0.56), new THREE.Vector2(pond.r - 0.7, -0.84), new THREE.Vector2(pond.r - 2.5, -0.92), new THREE.Vector2(0, -0.94)],
    48,
  );
  rim.add(mesh(bed, bedMat, { castShadow: false }));
  addStatic(ctx, rim);

  // ── Cây Bồ đề, cây sân, rừng ──
  const bodhiC = one('bodhi');
  addStatic(ctx, at(bodhiTree(ctx.rng, mats.bodhi), bodhiC.x, bodhiC.z));
  for (const c of byTag('tree')) {
    const t = c.x > 36 ? pineTree(ctx.rng, mats.pine, 1.15 + ctx.rng.next() * 0.3) : roundTree(ctx.rng, mats.tree, 0.95 + ctx.rng.next() * 0.35);
    addStatic(ctx, at(t, c.x, c.z, ctx.rng.next() * 6));
  }
  // Bụi cây thấp dọc bìa rừng (thấp hơn đầu gối, đi qua được không thấy kỳ).
  for (let i = 0; i < 18; i++) {
    const z = -2 + i * 2.2;
    addStatic(ctx, at(bush(ctx.rng, mats.pine, 0.55 + ctx.rng.next() * 0.3), 33.2 + ctx.rng.next() * 1.6, z));
  }

  // ── Vườn: 7 cây quả + 4 luống hoa ──
  const fruitSpecs: Record<FruitId, () => THREE.Group> = {
    chuoi: () => bananaPlant(ctx.rng, mats.garden),
    buoi: () => fruitTree(ctx.rng, mats.garden, { color: '#b7d653', geo: geo.sphere(0.2, 8, 6), count: 9 }, 1),
    phat_thu: () => fruitTree(ctx.rng, mats.garden, { color: '#f4c430', geo: geo.cone(0.12, 0.3, 6), count: 10 }, 0.75),
    thanh_long: () => dragonFruitPlant(ctx.rng, mats.garden),
    xoai: () => fruitTree(ctx.rng, mats.garden, { color: '#ffb627', geo: geo.sphere(0.13, 7, 5), count: 14 }, 1.05),
    du_du: () => papayaTree(ctx.rng, mats.garden),
    mang_cau: () => fruitTree(ctx.rng, mats.garden, { color: '#9ccc65', geo: geo.ico(0.15, 1), count: 11 }, 0.9),
  };
  for (const s of map.stations.filter((x) => x.kind === 'fruit_tree')) {
    const fruit = s.data?.fruit as FruitId;
    const make = fruitSpecs[fruit];
    if (make) addStatic(ctx, at(make(), s.x, s.z - 1.3, ctx.rng.next() * 6));
  }
  for (const s of map.stations.filter((x) => x.kind === 'flower_bed')) addStatic(ctx, flowerBed(s, ctx));

  // ── Đèn đá dọc lối + nghê đá ──
  for (const c of byTag('path_lantern')) {
    const l = at(new THREE.Group(), c.x, c.z);
    l.add(mesh(geo.cyl(0.32, 0.36, 0.18, 6), mat('#b8b0a2'), { y: 0.09 }));
    l.add(mesh(geo.cyl(0.1, 0.12, 0.6, 6), mat('#b8b0a2'), { y: 0.48 }));
    l.add(mesh(geo.box(0.42, 0.34, 0.42), mat('#c9c1b2'), { y: 0.95 }));
    const glow = new THREE.MeshStandardMaterial({ color: '#ffe0a0', emissive: '#ffb347', emissiveIntensity: 1.2, flatShading: true });
    ctx.flicker.push({ mat: glow, base: 1.2, speed: 2.5, phase: c.z });
    l.add(mesh(geo.box(0.3, 0.22, 0.44), glow, { y: 0.95, castShadow: false }));
    l.add(mesh(geo.cone(0.42, 0.32, 4), mat('#a8a092'), { y: 1.28, ry: Math.PI / 4 }));
    ctx.dynamics.add(l);
  }
  for (const c of byTag('nghe')) addStatic(ctx, at(stoneLion(), c.x, c.z, c.x < 0 ? 0.5 : -0.5));

  // ── Khói hương dùng chung ──
  function smoke(x: number, y: number, z: number, amount: number): void {
    ctx.smoke?.(x, y, z, amount);
  }

  return {
    setJarLevel(stationId, level) {
      const w = jarLevels.get(stationId);
      if (!w) return;
      const l = Math.max(0, Math.min(1, level));
      w.visible = l > 0.02;
      w.position.y = 0.12 + l * 0.8;
      const r = 0.36 + Math.sin(Math.min(1, 0.15 + l * 0.75) * Math.PI) * 0.16;
      w.scale.set(r / 0.47, 1, r / 0.47);
    },
    setAltarIncense(ratio) {
      incenseRatio = ratio;
      incense.visible = ratio !== null;
    },
  };
}

function flowerBed(s: StationDef, ctx: TempleCtx): THREE.Group {
  const g = at(new THREE.Group(), s.x, s.z);
  const color = FLOWER_HEX[s.data?.color as string] ?? '#ffd23f';
  g.add(mesh(geo.cyl(1.7, 1.75, 0.12, 18), mat('#6e4a32'), { y: 0.06 }));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.add(mesh(geo.dodeca(0.16), mat('#b8b0a2'), { x: Math.cos(a) * 1.78, y: 0.1, z: Math.sin(a) * 1.78, scale: [1, 0.6, 1] }));
  }
  for (let i = 0; i < 34; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt(i / 34) * 1.45;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 0.3 + ctx.rng.next() * 0.25;
    g.add(mesh(geo.cyl(0.015, 0.015, h, 3), mat('#4f9a3f'), { x, y: 0.12 + h / 2, z }));
    g.add(mesh(geo.ico(0.09 + ctx.rng.next() * 0.04, 0), mat(color), { x, y: 0.14 + h, z, scale: [1, 0.7, 1] }));
    if (i % 4 === 0) g.add(mesh(geo.cone(0.06, 0.18, 4), mat('#5fae4e'), { x: x + 0.06, y: 0.25, z, rz: 0.7 }));
  }
  return g;
}

/** Nghê đá (sư tử canh cửa) cách điệu. */
function stoneLion(): THREE.Group {
  const g = new THREE.Group();
  const stone = mat('#b5aea0');
  g.add(mesh(geo.box(0.9, 0.35, 0.9), mat('#a39b8c'), { y: 0.175 }));
  g.add(mesh(geo.sphere(0.36, 10, 8), stone, { y: 0.72, z: -0.05, scale: [0.9, 1.1, 1.1] }));
  g.add(mesh(geo.sphere(0.3, 10, 8), stone, { y: 1.18, z: 0.12 }));
  g.add(mesh(geo.ico(0.36, 1), mat('#a39b8c'), { y: 1.2, z: 0.02, scale: [1.05, 1.05, 0.8] }));
  for (const s of [-1, 1]) {
    g.add(mesh(geo.sphere(0.06, 6, 4), mat('#3a2418'), { x: s * 0.12, y: 1.25, z: 0.38 }));
    g.add(mesh(geo.capsule(0.08, 0.3, 3, 6), stone, { x: s * 0.2, y: 0.5, z: 0.25 }));
  }
  g.add(mesh(geo.sphere(0.12, 8, 6), mat('#b8322a'), { y: 1.06, z: 0.4, scale: [1, 0.6, 0.6] }));
  g.add(mesh(geo.sphere(0.13, 8, 6), stone, { y: 0.42, z: 0.38 }));
  return g;
}
