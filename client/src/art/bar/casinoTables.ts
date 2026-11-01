// Hai bàn chữ nhật của Sòng Công Đức — kích thước = hộp va chạm trong SONG_BAC, mặt nỉ cao đúng SB.feltY:
// Tài Xỉu (nỉ đỏ in 5 ô, chừa giữa-Bắc mặt bàn cho đĩa + bát), Bài Cào (nỉ xanh, 6 ô bài đúng neo ghế + ô nhà cái).
// Bàn Xì Dách bán nguyệt ở casinoXiDach.ts, dùng chung các helper nỉ / đệm da / khay phỉnh export ở đây. Chữ in quay
// về phía khách đứng; số lãi đọc từ balance để mặt nỉ không lệch luật khi chỉnh cân bằng. Không đặt nhà cái NPC.
import * as THREE from 'three';
import { BAICAO, TAIXIU, XIDACH } from '@shared/index';
import { C, SB, anchorOf, casinoTexture, feltMat, type CasinoCtx } from './casinoKit';

/** Đệm da quanh mép bàn: bán kính ống, tâm ống lùi vào từ mép bàn, cao độ tâm ống. */
export const RAIL_R = 0.05;
export const RAIL_IN = 0.06;
export const RAIL_Y = 0.885;
/** Mép nỉ lùi vào từ mép bàn (luồn dưới đệm da). */
export const FELT_IN = 0.1;
/** Điểm ảnh / mét của texture nỉ. */
export const PPM = 340;
export const GOLD_INK = '#e8c060';
export const TEXT_INK = '#ffe9b0';

interface TableBox {
  x: number;
  z: number;
  w: number;
  d: number;
}

export function buildTables(ctx: CasinoCtx): void {
  buildTaiXiu(ctx);
  buildBaiCao(ctx);
}

/** Nền nỉ: màu chính, sáng giữa tối mép, lốm đốm sợi (tất định). */
export function feltBase(c: CanvasRenderingContext2D, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.65);
  g.addColorStop(0, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.04)';
    c.fillRect((i * 97.13) % w, (i * 57.71 + (i % 9) * 11.3) % h, 2, 2);
  }
}

/** Đặt font cỡ `size`, thu nhỏ tới khi chữ rộng ≤ maxW; trả cỡ chữ cuối. */
export function fitFont(c: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight: string, font: string): number {
  let s = Math.round(size);
  c.font = `${weight} ${s}px ${font}`;
  while (c.measureText(text).width > maxW && s > 8) {
    s -= 2;
    c.font = `${weight} ${s}px ${font}`;
  }
  return s;
}

/** Ô cược in trên nỉ: ánh vàng nhạt, viền chỉ vàng kép, tên ô + dòng phụ (hoặc hình vẽ thêm ở chỗ dòng phụ). */
function betBox(
  c: CanvasRenderingContext2D,
  font: string,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub?: string | ((cx: number, cy: number, size: number) => void),
): void {
  c.fillStyle = 'rgba(255,214,140,0.07)';
  c.fillRect(x, y, w, h);
  c.strokeStyle = GOLD_INK;
  c.lineWidth = 5;
  c.strokeRect(x, y, w, h);
  c.lineWidth = 1.5;
  c.strokeRect(x + 9, y + 9, w - 18, h - 18);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = TEXT_INK;
  const size = fitFont(c, title, Math.min(h * (sub ? 0.4 : 0.5), w * 0.32), w * 0.84, '800', font);
  c.fillText(title, x + w / 2, y + h * (sub ? 0.4 : 0.52));
  if (typeof sub === 'string') {
    fitFont(c, sub, size * 0.36, w * 0.84, '700', font);
    c.fillStyle = '#f3d28a';
    c.fillText(sub, x + w / 2, y + h * 0.76);
  } else if (sub) sub(x + w / 2, y + h * 0.75, size);
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

/** Xúc xắc vẽ phẳng (mặt 1 và 4 chấm đỏ). */
function dieIcon(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, face: number): void {
  c.fillStyle = '#f7f2e6';
  c.strokeStyle = '#b9a87a';
  c.lineWidth = 2;
  c.beginPath();
  c.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.2);
  c.fill();
  c.stroke();
  c.fillStyle = face === 1 || face === 4 ? '#d4232a' : '#1b1b1f';
  for (const [px, py] of PIPS[face] ?? []) {
    c.beginPath();
    c.arc(cx + px * s * 0.27, cy + py * s * 0.27, s * (face === 1 ? 0.15 : 0.1), 0, Math.PI * 2);
    c.fill();
  }
}

/** Điểm ảnh trên texture nỉ của bàn chữ nhật ứng với điểm (x, z) thế giới; flip = chữ quay về phía Bắc. */
function feltPx(t: TableBox, flip: boolean, cw: number, ch: number, x: number, z: number): [number, number] {
  const u = (x - t.x) / (t.w - 2 * FELT_IN);
  const v = (z - t.z) / (t.d - 2 * FELT_IN);
  return flip ? [(0.5 - u) * cw, (0.5 - v) * ch] : [(0.5 + u) * cw, (0.5 + v) * ch];
}

/**
 * Bàn chữ nhật: chân bệ gỗ lùi vào + chỉ đồng chân, mặt gỗ dày 10 cm viền chỉ vàng, nỉ ở đúng SB.feltY (flip = xoay nỉ
 * 180° để chữ quay về phía Bắc), đệm da tròn quanh mép (cao hơn nỉ ~7 cm, không lấn tới các neo ghế).
 */
function rectTable(ctx: CasinoCtx, t: TableBox, felt: THREE.Material, flip: boolean): void {
  const { geo, mesh } = ctx.kit;
  const g = new THREE.Group();
  g.position.set(t.x, 0, t.z);
  g.add(mesh(geo.box(t.w - 0.5, 0.7, t.d - 0.5), ctx.woodDark, { y: 0.39 }));
  g.add(mesh(geo.box(t.w - 0.36, 0.05, t.d - 0.36), ctx.gold, { y: 0.025 }));
  g.add(mesh(geo.box(t.w, 0.1, t.d), ctx.woodMid, { y: 0.79 }));
  g.add(mesh(geo.box(t.w + 0.02, 0.025, t.d + 0.02), ctx.gold, { y: 0.745 }));
  const fg = new THREE.PlaneGeometry(t.w - 2 * FELT_IN, t.d - 2 * FELT_IN).rotateX(-Math.PI / 2);
  if (flip) fg.rotateY(Math.PI);
  g.add(mesh(fg, felt, { y: SB.feltY, castShadow: false }));
  const ix = t.w / 2 - RAIL_IN;
  const iz = t.d / 2 - RAIL_IN;
  for (const s of [-1, 1]) {
    g.add(mesh(geo.cyl(RAIL_R, RAIL_R, 2 * ix, 10), ctx.leather, { y: RAIL_Y, z: s * iz, rz: Math.PI / 2 }));
    g.add(mesh(geo.cyl(RAIL_R, RAIL_R, 2 * iz, 10), ctx.leather, { y: RAIL_Y, x: s * ix, rx: Math.PI / 2 }));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(geo.sphere(RAIL_R, 10, 6), ctx.leather, { x: sx * ix, y: RAIL_Y, z: sz * iz }));
  ctx.statics.add(g);
}

/** Khay phỉnh của nhà cái (lõm trên nỉ): 2 hàng × 4 chồng phỉnh 4 màu mệnh giá. */
export function chipTray(ctx: CasinoCtx, x: number, z: number): void {
  const { geo, mesh } = ctx.kit;
  ctx.statics.add(mesh(geo.box(0.56, 0.03, 0.18), ctx.woodDark, { x, y: SB.feltY + 0.006, z }));
  for (let k = 0; k < 8; k++) {
    const h = 0.02 + ((k * 7) % 4) * 0.008;
    ctx.statics.add(
      mesh(geo.cyl(0.02, 0.02, h, 10), ctx.kit.mat(C.chips[k % 4]!, { roughness: 0.5, surface: 'none' }), {
        x: x - 0.195 + (k % 4) * 0.13,
        y: SB.feltY + 0.021 + h / 2,
        z: z + (k < 4 ? -0.045 : 0.045),
      }),
    );
  }
}

/** Tài Xỉu: nỉ đỏ — TÀI / XỈU hai bên hàng trên, CHẴN / LẺ / BỘ BA hàng dưới; giữa hàng trên để trống cho đĩa + bát. */
function buildTaiXiu(ctx: CasinoCtx): void {
  const t = SB.taixiu;
  const font = ctx.kit.FONT_TITLE;
  const p = TAIXIU.payout;
  const tex = casinoTexture(ctx, Math.round((t.w - 2 * FELT_IN) * PPM), Math.round((t.d - 2 * FELT_IN) * PPM), (c, w, h) => {
    feltBase(c, w, h, C.feltRed);
    const m = 16;
    const colW = w * 0.34;
    const row = h * 0.7;
    const sideW = colW - 1.5 * m;
    betBox(c, font, m, m, sideW, row - 1.5 * m, 'TÀI', `11 – 17 · 1 ĂN ${p.tai}`);
    betBox(c, font, w - colW + 0.5 * m, m, sideW, row - 1.5 * m, 'XỈU', `4 – 10 · 1 ĂN ${p.xiu}`);
    betBox(c, font, m, row + 0.5 * m, sideW, h - row - 1.5 * m, 'CHẴN', `1 ĂN ${p.chan}`);
    betBox(c, font, w - colW + 0.5 * m, row + 0.5 * m, sideW, h - row - 1.5 * m, 'LẺ', `1 ĂN ${p.le}`);
    betBox(c, font, colW + 0.5 * m, row + 0.5 * m, w - 2 * colW - m, h - row - 1.5 * m, `BỘ BA ×${p.bo_ba}`, (cx, cy, size) => {
      const s = size * 0.62;
      for (let k = -1; k <= 1; k++) dieIcon(c, cx + k * s * 1.3, cy, s, 6);
    });
  });
  rectTable(ctx, t, feltMat(tex), false);
}

/** Bài Cào: nỉ xanh — 6 ô bài đúng neo ghế (cạnh Bắc, phía lối giữa), ô nhà cái cạnh Nam, chữ "BA TIÊN ĂN ĐÔI". */
function buildBaiCao(ctx: CasinoCtx): void {
  const t = SB.baicao;
  const font = ctx.kit.FONT_TITLE;
  const seats = Array.from({ length: BAICAO.seats3d }, (_, k) => anchorOf(ctx, `baicao_seat:${k + 1}`));
  const dealer = anchorOf(ctx, 'baicao_dealer');
  const baTien = BAICAO.payout.ba_tien === 2 ? 'BA TIÊN ĂN ĐÔI' : `BA TIÊN ĂN ×${BAICAO.payout.ba_tien}`;
  const tex = casinoTexture(ctx, Math.round((t.w - 2 * FELT_IN) * PPM), Math.round((t.d - 2 * FELT_IN) * PPM), (c, w, h) => {
    feltBase(c, w, h, C.feltGreen);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const zone = (x: number, z: number, zw: number, zd: number, label: string) => {
      const [px, py] = feltPx(t, true, w, h, x, z);
      const bw = zw * PPM;
      const bh = zd * PPM;
      c.strokeStyle = GOLD_INK;
      c.lineWidth = 4;
      c.setLineDash([14, 8]);
      c.strokeRect(px - bw / 2, py - bh / 2, bw, bh);
      c.setLineDash([]);
      c.fillStyle = 'rgba(255,214,140,0.85)';
      fitFont(c, label, bh * 0.3, bw * 0.9, '800', font);
      c.fillText(label, px, py + bh / 2 + bh * 0.24);
    };
    seats.forEach((s, k) => zone(s.x, s.z, 0.42, 0.26, `${k + 1}`));
    zone(dealer.x, dealer.z, 0.62, 0.28, 'NHÀ CÁI');
    const [mx, my] = feltPx(t, true, w, h, t.x, (seats[0]!.z + dealer.z) / 2);
    c.fillStyle = TEXT_INK;
    fitFont(c, baTien, 0.17 * PPM, w * 0.7, '800', font);
    c.fillText(baTien, mx, my);
  });
  rectTable(ctx, t, feltMat(tex), true);
  chipTray(ctx, dealer.x - 0.85, dealer.z + 0.14);
}
