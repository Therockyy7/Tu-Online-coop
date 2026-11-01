// Biểu tượng máy Nổ Hũ vẽ bằng canvas 2D (không dùng emoji — máy nào cũng hiện giống nhau): bia, đào tiên, hoa sen,
// chuông, nén vàng, số 7, hũ. Một texture dải dùng chung cho cả 12 cuộn: 3 cột (cuộn 1–3) × 32 ô theo NOHU_STRIPS,
// ô i nằm ở v ∈ [i/32, (i+1)/32] (ô 0 ở đáy canvas) — cuộn quay bằng cách dời UV dọc, không cần thêm texture. Thêm ảnh
// nhỏ từng biểu tượng (data URL) cho bảng điều khiển.
import * as THREE from 'three';
import type { NoHuSymbol } from '@shared/index';
import { NOHU_STRIPS, NOHU_STRIP_LEN } from '@shared/activities/nohu';
import { FONT_TITLE } from '../../art/kit';

/** Kích thước 1 ô trên texture dải (px). */
export const CELL_W = 128;
export const CELL_H = 96;

type Ctx2D = CanvasRenderingContext2D;

function lin(c: Ctx2D, y0: number, y1: number, stops: readonly string[]): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

function outline(c: Ctx2D, color: string, w: number): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineJoin = 'round';
  c.stroke();
}

/** Vại bia: thân thủy tinh vàng hổ phách, bọt trắng, quai bên phải, vài bọt khí. Gốc tọa độ = tâm ô, u = bán kính. */
function drawBia(c: Ctx2D, u: number): void {
  c.beginPath();
  c.moveTo(0.42 * u, -0.25 * u);
  c.bezierCurveTo(0.95 * u, -0.25 * u, 0.95 * u, 0.5 * u, 0.42 * u, 0.5 * u);
  outline(c, '#d8e2e8', 0.16 * u);
  outline(c, '#8a9aa4', 0.05 * u);
  c.beginPath();
  c.roundRect(-0.55 * u, -0.45 * u, 0.97 * u, 1.2 * u, 0.12 * u);
  c.fillStyle = lin(c, -0.45 * u, 0.75 * u, ['#ffd24a', '#f2a51c', '#c9740c']);
  c.fill();
  outline(c, '#7a4a12', 0.06 * u);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(-0.42 * u, -0.3 * u, 0.1 * u, 0.9 * u);
  c.fillStyle = 'rgba(255,250,230,0.85)';
  for (const [x, y, r] of [
    [-0.05, 0.4, 0.05],
    [0.15, 0.15, 0.04],
    [0.02, -0.05, 0.035],
  ] as const) {
    c.beginPath();
    c.arc(x * u, y * u, r * u, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  for (const [x, r] of [
    [-0.42, 0.22],
    [-0.12, 0.27],
    [0.2, 0.24],
    [0.4, 0.17],
  ] as const)
    c.arc(x * u, -0.52 * u, r * u, 0, Math.PI * 2);
  c.fillStyle = '#fffaf0';
  c.fill();
  outline(c, '#cdbf9c', 0.04 * u);
}

/** Đào tiên: trái hồng má đỏ có chóp nhọn + rãnh, hai lá xanh. */
function drawDao(c: Ctx2D, u: number): void {
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * 0.22 * u, -0.62 * u);
    c.rotate(s * 0.7);
    c.beginPath();
    c.ellipse(s * 0.2 * u, 0, 0.3 * u, 0.13 * u, 0, 0, Math.PI * 2);
    c.fillStyle = lin(c, -0.13 * u, 0.13 * u, ['#7ccf5a', '#2e7d32']);
    c.fill();
    outline(c, '#1b5e20', 0.035 * u);
    c.restore();
  }
  c.beginPath();
  c.moveTo(0, -0.72 * u);
  c.bezierCurveTo(0.25 * u, -0.55 * u, 0.72 * u, -0.45 * u, 0.7 * u, 0.12 * u);
  c.bezierCurveTo(0.68 * u, 0.62 * u, 0.3 * u, 0.78 * u, 0, 0.78 * u);
  c.bezierCurveTo(-0.3 * u, 0.78 * u, -0.68 * u, 0.62 * u, -0.7 * u, 0.12 * u);
  c.bezierCurveTo(-0.72 * u, -0.45 * u, -0.25 * u, -0.55 * u, 0, -0.72 * u);
  const g = c.createRadialGradient(-0.25 * u, -0.05 * u, 0.05 * u, 0, 0.1 * u, 0.85 * u);
  g.addColorStop(0, '#fff1c4');
  g.addColorStop(0.45, '#ffa08a');
  g.addColorStop(1, '#d8344e');
  c.fillStyle = g;
  c.fill();
  outline(c, '#9c1f36', 0.05 * u);
  c.beginPath();
  c.moveTo(0.02 * u, -0.66 * u);
  c.quadraticCurveTo(0.22 * u, 0.05 * u, 0.06 * u, 0.72 * u);
  outline(c, 'rgba(160,30,55,0.55)', 0.045 * u);
}

/** Hoa sen: 5 cánh hồng xòe quạt trên lá xanh, nhụy vàng. */
function drawSen(c: Ctx2D, u: number): void {
  c.beginPath();
  c.ellipse(0, 0.62 * u, 0.78 * u, 0.16 * u, 0, 0, Math.PI * 2);
  c.fillStyle = lin(c, 0.46 * u, 0.78 * u, ['#66bb6a', '#2e7d32']);
  c.fill();
  outline(c, '#1b5e20', 0.035 * u);
  const base = 0.5 * u;
  for (const [deg, light] of [
    [-62, true],
    [62, true],
    [-32, false],
    [32, false],
    [0, false],
  ] as const) {
    c.save();
    c.translate(0, base);
    c.rotate((deg * Math.PI) / 180);
    c.beginPath();
    c.moveTo(0, 0);
    c.bezierCurveTo(0.34 * u, -0.25 * u, 0.24 * u, -0.85 * u, 0, -1.05 * u);
    c.bezierCurveTo(-0.24 * u, -0.85 * u, -0.34 * u, -0.25 * u, 0, 0);
    c.fillStyle = lin(c, -1.05 * u, 0, light ? ['#ffe4ec', '#f8a5c2'] : ['#ffd0de', '#ec5f8e']);
    c.fill();
    outline(c, '#b3285c', 0.035 * u);
    c.restore();
  }
  c.beginPath();
  c.ellipse(0, 0.36 * u, 0.16 * u, 0.09 * u, 0, 0, Math.PI * 2);
  c.fillStyle = '#ffd54a';
  c.fill();
  outline(c, '#b8860b', 0.03 * u);
}

/** Chuông vàng: núm + nơ đỏ, thân loe, vành đáy, quả lắc. */
function drawChuong(c: Ctx2D, u: number): void {
  c.beginPath();
  c.arc(0, 0.6 * u, 0.13 * u, 0, Math.PI * 2);
  c.fillStyle = '#8a5a10';
  c.fill();
  c.beginPath();
  c.moveTo(-0.2 * u, -0.62 * u);
  c.bezierCurveTo(-0.5 * u, -0.6 * u, -0.5 * u, -0.1 * u, -0.56 * u, 0.2 * u);
  c.quadraticCurveTo(-0.62 * u, 0.4 * u, -0.76 * u, 0.48 * u);
  c.lineTo(0.76 * u, 0.48 * u);
  c.quadraticCurveTo(0.62 * u, 0.4 * u, 0.56 * u, 0.2 * u);
  c.bezierCurveTo(0.5 * u, -0.1 * u, 0.5 * u, -0.6 * u, 0.2 * u, -0.62 * u);
  c.closePath();
  c.fillStyle = lin(c, -0.62 * u, 0.48 * u, ['#fff3b0', '#f5c22c', '#c27c0a']);
  c.fill();
  outline(c, '#7a4a06', 0.05 * u);
  c.beginPath();
  c.roundRect(-0.8 * u, 0.42 * u, 1.6 * u, 0.14 * u, 0.06 * u);
  c.fillStyle = '#d89a16';
  c.fill();
  outline(c, '#7a4a06', 0.04 * u);
  c.beginPath();
  c.moveTo(-0.28 * u, -0.3 * u);
  c.quadraticCurveTo(-0.36 * u, 0.05 * u, -0.44 * u, 0.3 * u);
  outline(c, 'rgba(255,255,255,0.7)', 0.07 * u);
  c.beginPath();
  c.arc(0, -0.7 * u, 0.1 * u, 0, Math.PI * 2);
  c.fillStyle = '#e3a51e';
  c.fill();
  outline(c, '#7a4a06', 0.035 * u);
  c.fillStyle = '#d32f2f';
  for (const s of [-1, 1]) {
    c.beginPath();
    c.moveTo(0, -0.7 * u);
    c.lineTo(s * 0.32 * u, -0.86 * u);
    c.lineTo(s * 0.3 * u, -0.56 * u);
    c.closePath();
    c.fill();
  }
}

/** Nén vàng (nguyên bảo): thuyền vàng hai đầu vểnh, khối vồng giữa, lấp lánh. */
function drawVang(c: Ctx2D, u: number): void {
  c.beginPath();
  c.ellipse(0, 0.02 * u, 0.42 * u, 0.4 * u, 0, Math.PI, 0);
  c.fillStyle = lin(c, -0.38 * u, 0.02 * u, ['#fff6c0', '#f7c948', '#d99a14']);
  c.fill();
  outline(c, '#8a5a06', 0.045 * u);
  c.beginPath();
  c.moveTo(-0.88 * u, -0.32 * u);
  c.quadraticCurveTo(-0.78 * u, 0.42 * u, -0.45 * u, 0.5 * u);
  c.lineTo(0.45 * u, 0.5 * u);
  c.quadraticCurveTo(0.78 * u, 0.42 * u, 0.88 * u, -0.32 * u);
  c.quadraticCurveTo(0.55 * u, 0.02 * u, 0, 0.0);
  c.quadraticCurveTo(-0.55 * u, 0.02 * u, -0.88 * u, -0.32 * u);
  c.closePath();
  c.fillStyle = lin(c, -0.32 * u, 0.5 * u, ['#ffe680', '#f2b21e', '#b97808']);
  c.fill();
  outline(c, '#7a4a06', 0.05 * u);
  c.beginPath();
  c.moveTo(-0.6 * u, 0.12 * u);
  c.quadraticCurveTo(0, 0.24 * u, 0.6 * u, 0.12 * u);
  outline(c, 'rgba(255,255,255,0.55)', 0.05 * u);
  c.fillStyle = '#ffffff';
  for (const [x, y, r] of [
    [-0.18, -0.28, 0.13],
    [0.58, -0.5, 0.1],
  ] as const) {
    c.beginPath();
    c.moveTo(x * u, (y - r) * u);
    c.quadraticCurveTo(x * u, y * u, (x + r) * u, y * u);
    c.quadraticCurveTo(x * u, y * u, x * u, (y + r) * u);
    c.quadraticCurveTo(x * u, y * u, (x - r) * u, y * u);
    c.quadraticCurveTo(x * u, y * u, x * u, (y - r) * u);
    c.fill();
  }
}

/** Số 7 đỏ viền vàng. */
function drawThat(c: Ctx2D, u: number): void {
  c.font = `900 ${Math.round(1.75 * u)}px ${FONT_TITLE}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.strokeStyle = '#5a1206';
  c.lineWidth = 0.34 * u;
  c.strokeText('7', 0, 0.08 * u);
  c.strokeStyle = '#ffd54a';
  c.lineWidth = 0.16 * u;
  c.strokeText('7', 0, 0.08 * u);
  c.fillStyle = lin(c, -0.8 * u, 0.9 * u, ['#ff6b5a', '#e0241a', '#9c0f0a']);
  c.fillText('7', 0, 0.08 * u);
}

/** Hũ Công Đức: hũ sơn đỏ đai vàng, chữ "HŨ", xu vàng đầy miệng. */
function drawHu(c: Ctx2D, u: number): void {
  c.fillStyle = '#f2c230';
  for (const [x, y] of [
    [-0.22, -0.72],
    [0.2, -0.74],
    [0, -0.84],
  ] as const) {
    c.beginPath();
    c.ellipse(x * u, y * u, 0.17 * u, 0.09 * u, 0, 0, Math.PI * 2);
    c.fill();
    outline(c, '#8a5a06', 0.03 * u);
  }
  c.beginPath();
  c.moveTo(-0.32 * u, -0.62 * u);
  c.lineTo(-0.26 * u, -0.42 * u);
  c.bezierCurveTo(-0.85 * u, -0.3 * u, -0.85 * u, 0.6 * u, -0.38 * u, 0.74 * u);
  c.lineTo(0.38 * u, 0.74 * u);
  c.bezierCurveTo(0.85 * u, 0.6 * u, 0.85 * u, -0.3 * u, 0.26 * u, -0.42 * u);
  c.lineTo(0.32 * u, -0.62 * u);
  c.closePath();
  const g = c.createRadialGradient(-0.2 * u, 0, 0.05 * u, 0, 0.1 * u, 0.85 * u);
  g.addColorStop(0, '#ff6a50');
  g.addColorStop(0.55, '#c62828');
  g.addColorStop(1, '#6d0a0a');
  c.fillStyle = g;
  c.fill();
  outline(c, '#4a0606', 0.05 * u);
  c.fillStyle = '#f2c230';
  c.fillRect(-0.34 * u, -0.5 * u, 0.68 * u, 0.08 * u);
  c.fillRect(-0.62 * u, 0.5 * u, 1.24 * u, 0.07 * u);
  c.font = `900 ${Math.round(0.5 * u)}px ${FONT_TITLE}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffd54a';
  c.strokeStyle = '#5a0a06';
  c.lineWidth = 0.08 * u;
  c.strokeText('HŨ', 0, 0.12 * u);
  c.fillText('HŨ', 0, 0.12 * u);
}

const DRAW: Record<NoHuSymbol, (c: Ctx2D, u: number) => void> = {
  bia: drawBia,
  dao: drawDao,
  sen: drawSen,
  chuong: drawChuong,
  vang: drawVang,
  that: drawThat,
  hu: drawHu,
};

/** Một ô cuộn: nền kem (hũ / số 7 có quầng màu), biểu tượng giữa ô, gạch phân ô mảnh trên dưới. */
export function drawCell(c: Ctx2D, sym: NoHuSymbol, x: number, y: number, w: number, h: number): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = lin(c, 0, h, ['#fffdf7', '#f6eedb', '#e9dcbc']);
  c.fillRect(0, 0, w, h);
  if (sym === 'hu' || sym === 'that') {
    const g = c.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, sym === 'hu' ? 'rgba(255,214,74,0.85)' : 'rgba(255,120,90,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  c.fillStyle = 'rgba(120,90,40,0.55)';
  c.fillRect(0, 0, w, 2);
  c.fillRect(0, h - 2, w, 2);
  c.translate(w / 2, h / 2);
  DRAW[sym](c, Math.min(w, h) * 0.4);
  c.restore();
}

/** Vẽ cả 3 dải lên canvas (cột k = cuộn k, ô 0 ở đáy). */
function paintStrips(c: Ctx2D): void {
  NOHU_STRIPS.forEach((strip, k) => {
    strip.forEach((sym, i) => drawCell(c, sym, k * CELL_W, (NOHU_STRIP_LEN - 1 - i) * CELL_H, CELL_W, CELL_H));
  });
}

/**
 * Texture dải dùng chung cho mọi cuộn (lặp theo chiều dọc để dải nối vòng). Vẽ lại một lần khi font web tải xong (số 7,
 * chữ "HŨ"). Người tạo tự dispose.
 */
export function createStripTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * NOHU_STRIPS.length;
  canvas.height = CELL_H * NOHU_STRIP_LEN;
  const c = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  let disposed = false;
  tex.addEventListener('dispose', () => (disposed = true));
  const paint = () => {
    if (disposed) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
    paintStrips(c);
    tex.needsUpdate = true;
  };
  paint();
  if (typeof document !== 'undefined' && document.fonts) void document.fonts.ready.then(paint);
  return tex;
}

const icons = new Map<NoHuSymbol, string>();

/** Ảnh nhỏ (data URL) của 1 biểu tượng cho bảng điều khiển — vẽ một lần rồi nhớ. */
export function symbolIcon(sym: NoHuSymbol): string {
  let url = icons.get(sym);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    drawCell(canvas.getContext('2d')!, sym, 0, 0, 64, 48);
    url = canvas.toDataURL('image/png');
    icons.set(sym, url);
  }
  return url;
}
