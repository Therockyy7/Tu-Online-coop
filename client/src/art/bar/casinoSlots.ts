// Máy xèng Nổ Hũ + bệ Hũ Công Đức của Sòng Công Đức (bố cục SONG_BAC.slots / .jackpot). Mỗi máy: tủ sơn son w × d
// sát tường Nam, cửa sổ khoét đúng 0,70 × 0,40 m quanh neo 'slot_reels:slot_machine_N' với khoang sâu 0,36 m nền tối
// phía sau neo (làn Nổ Hũ đặt 3 trống cuộn vào đây), viền crôm, bàn phím nghiêng, kính bảng thưởng (số đọc từ balance),
// khay xu, cột đèn chạy hai bên, biển neon "NỔ HŨ" trên nóc. Mặt hông phía neo 'slot_lever:*' để phẳng — cần gạt do làn
// Nổ Hũ dựng. Bệ hũ: 3 tầng gỗ chỉ vàng, cánh sen, hũ vàng đầy xu, giá treo khung 1,6 × 0,5 m ở neo 'jackpot_display'
// (bảng số do làn Nổ Hũ dựng) + biển neon "HŨ CÔNG ĐỨC". Không đặt NPC.
import * as THREE from 'three';
import { NOHU, type NoHuSymbol } from '@shared/index';
import { C, SB, anchorOf, casinoTexture, glowCanvasMat, neonSign, neonText, type CasinoCtx } from './casinoKit';
import { neonFlicker } from './casinoShell';

/** Cửa sổ cuộn (m) và độ sâu khoang tính từ mặt neo vào trong máy. */
const WIN_W = 0.7;
const WIN_H = 0.4;
const CAVITY = 0.36;
/** Đỉnh tủ máy (chưa tính biển nóc). */
const TOP_Y = 2.0;
/** Tên biểu tượng in trên kính bảng thưởng. */
const SYMBOL_NAME: Record<Exclude<NoHuSymbol, 'hu'>, string> = {
  that: 'SỐ 7',
  vang: 'NÉN VÀNG',
  chuong: 'CHUÔNG',
  sen: 'HOA SEN',
  dao: 'ĐÀO TIÊN',
  bia: 'BIA',
};

/** Kính bảng thưởng (nền tối, chữ vàng): 3 hũ nổ hũ, các bộ ba theo NOHU.paytable, 3 quả lẫn, 2 hũ. */
function paytableTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  const rows: [string, string][] = [['3 HŨ', 'NỔ HŨ']];
  const pay = Object.entries(NOHU.paytable) as [Exclude<NoHuSymbol, 'hu'>, number][];
  pay.sort((a, b) => b[1] - a[1]);
  for (const [sym, x] of pay) rows.push([`3 ${SYMBOL_NAME[sym]}`, `×${x}`]);
  rows.push(['3 QUẢ LẪN', `×${NOHU.mixedFruit}`], ['2 HŨ', `×${NOHU.twoHu}`]);
  return casinoTexture(ctx, 512, 288, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a0a14');
    g.addColorStop(1, '#090307');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8c060';
    c.lineWidth = 4;
    c.strokeRect(8, 8, w - 16, h - 16);
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.font = `800 26px ${ctx.kit.FONT_TITLE}`;
    neonText(c, 'BẢNG THƯỞNG', w / 2, 34, '#ff3b6b', 8);
    const perCol = Math.ceil(rows.length / 2);
    const rowH = (h - 70) / perCol;
    rows.forEach(([name, value], i) => {
      const col = i < perCol ? 0 : 1;
      const y = 62 + rowH * ((i % perCol) + 0.5);
      const x0 = 26 + col * (w / 2 - 10);
      const x1 = x0 + w / 2 - 42;
      c.font = `700 ${i === 0 ? 21 : 19}px ${ctx.kit.FONT_BODY}`;
      c.textAlign = 'left';
      c.fillStyle = i === 0 ? '#ffd24a' : '#f3e2b8';
      c.fillText(name, x0, y);
      c.textAlign = 'right';
      c.fillStyle = i === 0 ? '#ff6b8b' : '#ffd98a';
      c.fillText(value, x1, y);
    });
  });
}

/** Ô đèn nóc tủ: ba số 7 neon trên nền đỏ sẫm viền vàng. */
function topArtTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  return casinoTexture(ctx, 512, 170, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5e0f12');
    g.addColorStop(1, '#2a0508');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e8c060';
    c.lineWidth = 5;
    c.strokeRect(7, 7, w - 14, h - 14);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 ${Math.round(h * 0.62)}px ${ctx.kit.FONT_TITLE}`;
    for (let k = -1; k <= 1; k++) neonText(c, '7', w / 2 + k * w * 0.26, h * 0.54, k ? '#ff3b4a' : '#ffd24a', 14);
    c.font = `800 ${Math.round(h * 0.22)}px ${ctx.kit.FONT_TITLE}`;
    for (const x of [w * 0.37, w * 0.63]) neonText(c, '★', x, h * 0.54, '#ffd24a', 8);
  });
}

/**
 * Mức tự phát sáng bóng đèn cột hai bên mặt tủ lúc bật / tắt (chạy so le A/B). Bật 1,4 chứ không 2,3: ngồi máy (Nổ Hũ),
 * hai cột bóng nằm sát hai bên cửa sổ cuộn nên quầng bloom nhấp nháy theo nhịp đèn chạy lấn vào khung nhìn; 1,4 vẫn trên
 * ngưỡng bloom của Bar nên đứng xa vẫn lấp lánh.
 */
const BULB_ON = 1.4;
const BULB_OFF = 0.45;

export function buildSlots(ctx: CasinoCtx): void {
  const sl = SB.slots;
  const bulbA = new THREE.MeshStandardMaterial({ color: '#fff1c8', emissive: C.warmLight, emissiveIntensity: BULB_ON, roughness: 0.4 });
  const bulbB = bulbA.clone();
  ctx.updates.push((_dt, t) => {
    const on = Math.floor(t * 3) % 2 === 0;
    bulbA.emissiveIntensity = on ? BULB_ON : BULB_OFF;
    bulbB.emissiveIntensity = on ? BULB_OFF : BULB_ON;
  });
  const parts = {
    bulbA,
    bulbB,
    paytable: glowCanvasMat(paytableTexture(ctx), 0.9),
    topArt: glowCanvasMat(topArtTexture(ctx), 1.1),
    sign: neonSign(ctx, 'NỔ HŨ', { width: 0.95, height: 0.36, color: '#ffd24a', border: '#ff3b6b' }),
  };
  neonFlicker(ctx, parts.sign.mat, 1.6, 4.1);
  sl.xs.forEach((x, i) => {
    const reel = anchorOf(ctx, `slot_reels:slot_machine_${i + 1}`);
    buildMachine(ctx, parts, x, sl.z, reel.y, sl.z - reel.z);
  });
  buildJackpot(ctx);
}

type MachineParts = {
  bulbA: THREE.Material;
  bulbB: THREE.Material;
  paytable: THREE.Material;
  topArt: THREE.Material;
  sign: { group: THREE.Group };
};

/**
 * Một máy xèng trong nhóm riêng tâm (x, z), quay π để +Z cục bộ hướng về người chơi (như neo cuộn). `winY` = cao độ
 * tâm cửa sổ, `faceZ` = khoảng cách từ tâm máy tới mặt neo theo +Z cục bộ (mặt tủ ở d/2, neo nhô trước mặt tủ 4 cm).
 */
function buildMachine(ctx: CasinoCtx, parts: MachineParts, x: number, z: number, winY: number, faceZ: number): void {
  const { geo, mesh } = ctx.kit;
  const W = SB.slots.w;
  const D = SB.slots.d;
  const F = D / 2;
  const y0 = winY - WIN_H / 2;
  const y1 = winY + WIN_H / 2;
  const back = faceZ - CAVITY;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = Math.PI;
  const box = (w: number, h: number, d: number, m: THREE.Material, bx: number, by: number, bz: number, cast = false) =>
    g.add(mesh(geo.box(w, h, d), m, { x: bx, y: by, z: bz, castShadow: cast }));

  // Tủ: chân đen, thân dưới, hai trụ cạnh cửa sổ, khối sau khoang, thân trên — chừa khoang cuộn ở giữa.
  box(W, 0.1, D, ctx.ink, 0, 0.05, 0);
  box(W, 0.02, 0.01, ctx.gold, 0, 0.1, F + 0.005);
  box(W, y0 - 0.1, D, ctx.lacquer, 0, (y0 + 0.1) / 2, 0, true);
  const pillarW = (W - WIN_W) / 2;
  for (const s of [-1, 1]) box(pillarW, WIN_H, D, ctx.lacquer, s * (WIN_W + pillarW) / 2, winY, 0, true);
  box(WIN_W, WIN_H, back + F, ctx.lacquer, 0, winY, (back - F) / 2);
  box(W, TOP_Y - y1, D, ctx.lacquer, 0, (TOP_Y + y1) / 2, 0, true);
  // Lót khoang màu tối: đáy, nóc, hai vách, lưng.
  const cavD = F - back;
  const cavZ = (F + back) / 2;
  box(WIN_W, 0.004, cavD, ctx.ink, 0, y0 + 0.002, cavZ);
  box(WIN_W, 0.004, cavD, ctx.ink, 0, y1 - 0.002, cavZ);
  for (const s of [-1, 1]) box(0.004, WIN_H, cavD, ctx.ink, s * (WIN_W / 2 - 0.002), winY, cavZ);
  box(WIN_W, WIN_H, 0.004, ctx.ink, 0, winY, back + 0.002);
  // Viền crôm quanh cửa sổ (mép trong trùng cửa sổ, nhô trước mặt neo 1 cm).
  const bz = F + (faceZ + 0.01 - F) / 2;
  const bd = faceZ + 0.01 - F;
  box(WIN_W + 0.1, 0.05, bd, ctx.chrome, 0, y1 + 0.025, bz);
  box(WIN_W + 0.1, 0.05, bd, ctx.chrome, 0, y0 - 0.025, bz);
  for (const s of [-1, 1]) box(0.05, WIN_H, bd, ctx.chrome, s * (WIN_W / 2 + 0.025), winY, bz);

  // Cột đèn chạy hai bên mặt tủ.
  const sideX = (W + WIN_W + 0.2) / 4;
  for (const s of [-1, 1]) {
    box(0.15, TOP_Y - 0.15, 0.01, ctx.ink, s * sideX, (TOP_Y + 0.15) / 2, F + 0.005);
    for (let k = 0; k < 9; k++) box(0.06, 0.1, 0.02, k % 2 ? parts.bulbB : parts.bulbA, s * sideX, 0.27 + k * 0.205, F + 0.015);
  }

  // Bàn phím nghiêng (4 nút mức cược + nút QUAY) trên gờ đỡ.
  box(0.9, 0.09, 0.12, ctx.lacquer, 0, y0 - 0.16, F + 0.06);
  const deck = new THREE.Group();
  deck.position.set(0, y0 - 0.105, F + 0.08);
  deck.rotation.x = 0.3;
  deck.add(mesh(geo.box(0.9, 0.04, 0.2), ctx.ink, { castShadow: false }));
  deck.add(mesh(geo.box(0.9, 0.006, 0.006), ctx.gold, { y: 0.02, z: 0.1, castShadow: false }));
  const betBtn = ctx.kit.mat('#fff4dc', { emissive: '#ffcf7a', emissiveIntensity: 0.9 });
  const spinBtn = ctx.kit.mat('#ff5a4a', { emissive: '#ff2a1a', emissiveIntensity: 1.4 });
  for (let k = 0; k < 4; k++) deck.add(mesh(geo.cyl(0.025, 0.025, 0.016, 12), betBtn, { x: -0.33 + k * 0.1, y: 0.026, castShadow: false }));
  deck.add(mesh(geo.cyl(0.045, 0.045, 0.02, 16), spinBtn, { x: 0.24, y: 0.028, castShadow: false }));
  g.add(deck);

  // Kính bảng thưởng có khung vàng, khe xu tối, khay xu crôm có vài đồng xu.
  box(0.82, 0.48, 0.012, ctx.gold, 0, 0.73, F + 0.006);
  g.add(mesh(new THREE.PlaneGeometry(0.78, 0.44), parts.paytable, { y: 0.73, z: F + 0.014, castShadow: false }));
  box(0.3, 0.09, 0.01, ctx.ink, 0, 0.4, F + 0.005);
  box(0.52, 0.012, 0.16, ctx.chrome, 0, 0.24, F + 0.08);
  box(0.52, 0.07, 0.012, ctx.chrome, 0, 0.27, F + 0.154);
  for (const s of [-1, 1]) box(0.012, 0.07, 0.16, ctx.chrome, s * 0.254, 0.27, F + 0.08);
  for (const [cx, cz, tilt] of [
    [-0.1, 0.1, 0.1],
    [-0.04, 0.06, -0.15],
    [0.13, 0.11, 0.2],
  ] as const)
    g.add(mesh(geo.cyl(0.02, 0.02, 0.006, 12), ctx.gold, { x: cx, y: 0.25, z: F + cz, rx: tilt, castShadow: false }));

  // Ô đèn nóc tủ, phào vàng, đế + biển neon "NỔ HŨ".
  box(WIN_W + 0.2, 0.34, 0.01, ctx.gold, 0, (TOP_Y + y1) / 2 + 0.02, F + 0.005);
  g.add(mesh(new THREE.PlaneGeometry(WIN_W + 0.16, 0.3), parts.topArt, { y: (TOP_Y + y1) / 2 + 0.02, z: F + 0.012, castShadow: false }));
  box(W + 0.06, 0.05, D + 0.06, ctx.gold, 0, TOP_Y + 0.025, 0);
  box(0.5, 0.08, 0.3, ctx.ink, 0, TOP_Y + 0.09, 0.2);
  const sign = parts.sign.group.clone();
  sign.position.set(0, TOP_Y + 0.32, 0.25);
  g.add(sign);
  ctx.statics.add(g);
}

/**
 * Bệ Hũ Công Đức (tâm SB.jackpot, tầng đáy đúng bán kính va chạm): 3 tầng gỗ viền chỉ vàng, vòng cánh sen, hũ vàng tiện
 * tròn đầy xu (vàng lấp lánh chậm), mề đay "CÔNG ĐỨC" mặt Bắc; giá hai cột vàng đỡ khung 1,6 × 0,5 m ở neo
 * 'jackpot_display' (tấm nền tối phía sau, bảng số của làn Nổ Hũ đặt ngay mặt neo), biển neon "HŨ CÔNG ĐỨC" phía trên.
 */
function buildJackpot(ctx: CasinoCtx): void {
  const { geo, mesh, mat } = ctx.kit;
  const S = ctx.statics;
  const j = SB.jackpot;
  /** Bán kính các tầng bệ theo bán kính va chạm (thiết kế ở r = 1,1 m). */
  const rr = (v: number) => (v * j.r) / 1.1;
  const add = (
    g: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    o: { rx?: number; ry?: number; rz?: number; scale?: number | [number, number, number] } = {},
  ) => S.add(mesh(g, m, { x: j.x + x, y, z: j.z + z, castShadow: false, ...o }));

  add(geo.cyl(rr(1.08), j.r, 0.16, 40), ctx.woodDark, 0, 0.08, 0);
  add(geo.cyl(rr(1.0), rr(1.0), 0.025, 40), ctx.gold, 0, 0.1725, 0);
  add(geo.cyl(rr(0.92), rr(0.96), 0.3, 36), ctx.lacquer, 0, 0.335, 0);
  add(geo.cyl(rr(0.93), rr(0.93), 0.025, 36), ctx.gold, 0, 0.4975, 0);
  add(geo.cyl(rr(0.7), rr(0.74), 0.22, 32), ctx.woodDark, 0, 0.62, 0);
  add(geo.cyl(rr(0.72), rr(0.72), 0.02, 32), ctx.gold, 0, 0.74, 0);
  const petal = mat('#e9a3ad', { roughness: 0.5, emissive: '#5a1a24', emissiveIntensity: 0.25 });
  for (let i = 0; i < 12; i++) {
    const pg = new THREE.Group();
    pg.position.set(j.x, 0.8, j.z);
    pg.rotation.y = (i / 12) * Math.PI * 2;
    pg.add(mesh(geo.sphere(0.1, 10, 6), petal, { z: 0.52, rx: -0.55, scale: [0.6, 0.28, 1.25], castShadow: false }));
    S.add(pg);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
    add(geo.cyl(0.045, 0.045, 0.01, 14), ctx.gold, Math.sin(a) * 0.6, 0.756, Math.cos(a) * 0.6, { rx: 0.05 * (i % 3) });
  }

  // Hũ vàng tiện tròn (đáy ở mặt tầng 3), miệng đầy xu, vài đồng xu nằm nghiêng trên đỉnh.
  const urnGold = new THREE.MeshStandardMaterial({ color: '#e8b04a', metalness: 0.7, roughness: 0.26, emissive: '#7a4a10', emissiveIntensity: 0.5 });
  ctx.updates.push((_dt, t) => (urnGold.emissiveIntensity = 0.5 + 0.18 * Math.sin(t * 1.7)));
  const profile: [number, number][] = [
    [0, 0],
    [0.26, 0],
    [0.3, 0.04],
    [0.27, 0.09],
    [0.36, 0.2],
    [0.5, 0.42],
    [0.55, 0.6],
    [0.53, 0.74],
    [0.44, 0.88],
    [0.3, 0.98],
    [0.25, 1.04],
    [0.29, 1.09],
    [0.31, 1.12],
    [0, 1.12],
  ];
  add(geo.lathe(profile, 36), urnGold, 0, 0.75, 0);
  add(geo.sphere(0.3, 20, 10), ctx.gold, 0, 1.86, 0, { scale: [1, 0.36, 1] });
  for (const [cx, cz, y, rx, rz] of [
    [0.05, -0.08, 1.975, 0.3, 0.1],
    [-0.12, 0.02, 1.95, -0.2, 0.5],
    [0.14, 0.1, 1.94, 0.4, -0.3],
    [-0.03, 0.14, 1.955, -0.5, -0.2],
    [0.18, -0.12, 1.925, 0.2, 0.6],
  ] as const)
    add(geo.cyl(0.05, 0.05, 0.012, 14), ctx.gold, cx, y, cz, { rx, rz });
  const medal = casinoTexture(ctx, 160, 160, (c, w, h) => {
    c.fillStyle = '#8a1c14';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffd98a';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 7, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 17, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#ffe2a0';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 34px ${ctx.kit.FONT_TITLE}`;
    c.fillText('CÔNG', w / 2, h * 0.39);
    c.fillText('ĐỨC', w / 2, h * 0.66);
  });
  add(new THREE.CircleGeometry(0.13, 28), new THREE.MeshStandardMaterial({ map: medal, roughness: 0.4, metalness: 0.2 }), 0, 1.35, -0.566, { ry: Math.PI });

  // Giá đỡ: 2 cột vàng đứng trên tầng đáy (ngoài tầng 2), xà nóc, 2 tay vươn tới khung bảng số ở neo jackpot_display.
  const disp = anchorOf(ctx, 'jackpot_display');
  const OPEN_W = 1.6;
  const OPEN_H = 0.5;
  const BAR = 0.06;
  const frameZ = disp.z + 0.03 - j.z;
  const postX = OPEN_W / 2 + BAR;
  const postR = rr(1.02);
  const postZ = -Math.sqrt(Math.max(0, postR * postR - postX * postX));
  const topY = disp.y + 0.35;
  for (const s of [-1, 1]) {
    add(geo.cyl(0.035, 0.035, topY - 0.16, 10), ctx.gold, s * postX, (topY + 0.16) / 2, postZ);
    add(geo.sphere(0.05, 10, 8), ctx.gold, s * postX, topY + 0.04, postZ);
    add(geo.box(0.04, 0.04, postZ - frameZ), ctx.gold, s * postX, disp.y, (postZ + frameZ) / 2);
  }
  add(geo.box(2 * postX + 0.08, 0.06, 0.06), ctx.gold, 0, topY, postZ);
  const dx = disp.x - j.x;
  for (const s of [-1, 1]) {
    add(geo.box(OPEN_W + 2 * BAR, BAR, 0.05), ctx.gold, dx, disp.y + s * (OPEN_H + BAR) / 2, frameZ);
    add(geo.box(BAR, OPEN_H, 0.05), ctx.gold, dx + s * (OPEN_W + BAR) / 2, disp.y, frameZ);
  }
  add(geo.box(OPEN_W, OPEN_H, 0.02), ctx.ink, dx, disp.y, frameZ + 0.035);
  const sign = neonSign(ctx, 'HŨ CÔNG ĐỨC', { width: OPEN_W + 2 * BAR, height: 0.36, color: '#ffd24a', border: '#ff3b6b' });
  sign.group.position.set(disp.x, disp.y + OPEN_H / 2 + BAR + 0.22, j.z + frameZ);
  sign.group.rotation.y = Math.PI;
  S.add(sign.group);
  neonFlicker(ctx, sign.mat, 1.7, 5.3);
}
