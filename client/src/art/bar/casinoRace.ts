// Đường đua ngựa của Sòng Công Đức (dọc tường Bắc, bố cục SONG_BAC.race): bàn tủ gỗ 14 × 3 m, mặt cỏ cao đúng
// surfaceY in 6 làn (tâm làn k ở laneZ0 + k·laneGap), vạch xuất phát trắng ở startX, vạch đích ca-rô ở finishX, số làn
// ở hai đầu; cổng xuất phát (vách ngăn chuồng + xà trên, không có cửa trước nên ngựa phóng ra được), lan can trắng + đệm
// da phía khách, phông sơn son phía Bắc ghi XUẤT PHÁT / ĐÍCH và các mốc ¼ ½ ¾, cột đích. Ngựa + bảng LED do làn Đua
// Ngựa dựng ở neo race_track / race_board; không dựng gì lên tường Bắc ở x 26..37, y 2,3..4,3 (chỗ bảng LED).
import * as THREE from 'three';
import { DUANGUA } from '@shared/index';
import { applySurface } from '../pbr';
import { SB, casinoTexture, lacquerSign, type CasinoCtx } from './casinoKit';

const R = SB.race;
const LANES = DUANGUA.horses;
/** Mép bàn đua. */
const X0 = R.x - R.w / 2;
const X1 = R.x + R.w / 2;
const ZN = R.z - R.d / 2;
const ZS = R.z + R.d / 2;
/** Khung gỗ quanh mặt cỏ: bề rộng mép Bắc/Nam và Tây/Đông. */
const RIM_NS = 0.18;
const RIM_EW = 0.12;
/** Lòng đường đua (mặt cỏ). */
const TX0 = X0 + RIM_EW;
const TX1 = X1 - RIM_EW;
const TZ0 = ZN + RIM_NS;
const TZ1 = ZS - RIM_NS;
/** Mép ngoài làn 1 (Bắc) và làn cuối (Nam). */
const LANE_N = R.laneZ0 - R.laneGap / 2;
const LANE_S = R.laneZ0 + (LANES - 0.5) * R.laneGap;
/** Mặt gỗ dưới cỏ (thấp hơn mặt cỏ 2 mm cho khỏi trùng mặt) và đỉnh khung gỗ viền. */
const DECK_TOP = R.surfaceY - 0.002;
const RIM_TOP = R.surfaceY + 0.06;
/** Phông sơn son phía Bắc: chiều cao, bề dày. */
const BACK_H = 0.42;
const BACK_T = 0.05;
const IVORY = '#f4f1e6';

/** Mặt cỏ: vệt cắt cỏ so le, dải ngoài làn sẫm, vạch làn, vạch xuất phát, vạch đích ca-rô, mốc ¼ ½ ¾, số làn hai đầu. */
function turfTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  const ppm = 128;
  return casinoTexture(ctx, Math.round((TX1 - TX0) * ppm), Math.round((TZ1 - TZ0) * ppm), (c, w, h) => {
    const k = w / (TX1 - TX0);
    const X = (x: number) => (x - TX0) * k;
    const Y = (z: number) => ((z - TZ0) / (TZ1 - TZ0)) * h;
    c.fillStyle = '#245f30';
    c.fillRect(0, 0, w, h);
    for (let x = TX0, i = 0; x < TX1; x += 0.7, i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
      c.fillRect(X(x), 0, 0.7 * k + 1, h);
    }
    c.fillStyle = 'rgba(8,30,14,0.55)';
    c.fillRect(0, 0, w, Y(LANE_N));
    c.fillRect(0, Y(LANE_S), w, h - Y(LANE_S));
    for (let i = 0; i < 4200; i++) {
      c.fillStyle = i % 3 ? 'rgba(0,0,0,0.10)' : 'rgba(190,255,170,0.06)';
      c.fillRect((i * 97.13) % w, (i * 57.71 + (i % 9) * 11.3) % h, 2, 1);
    }
    for (let i = 0; i <= LANES; i++) {
      const edge = i === 0 || i === LANES;
      c.fillStyle = edge ? IVORY : 'rgba(244,241,230,0.7)';
      const t = edge ? 3 : 2;
      c.fillRect(0, Y(LANE_N + i * R.laneGap) - t / 2, w, t);
    }
    c.fillStyle = IVORY;
    c.fillRect(X(R.startX) - 2, Y(LANE_N), 4, Y(LANE_S) - Y(LANE_N));
    const sq = 0.06;
    for (let col = 0; col < 2; col++) {
      for (let row = 0; LANE_N + row * sq < LANE_S - 1e-6; row++) {
        c.fillStyle = (col + row) % 2 ? '#141414' : IVORY;
        c.fillRect(X(R.finishX - sq + col * sq), Y(LANE_N + row * sq), sq * k + 0.5, sq * k + 0.5);
      }
    }
    // Mốc ¼ ½ ¾ quãng đua: tam giác trắng ở hai dải ngoài làn.
    for (const f of [0.25, 0.5, 0.75]) {
      const x = X(R.startX + f * (R.finishX - R.startX));
      for (const [y0, dir] of [
        [Y(LANE_N), -1],
        [Y(LANE_S), 1],
      ] as const) {
        c.beginPath();
        c.moveTo(x - 0.045 * k, y0 + dir * 0.01 * k);
        c.lineTo(x + 0.045 * k, y0 + dir * 0.01 * k);
        c.lineTo(x, y0 + dir * 0.05 * k);
        c.closePath();
        c.fill();
      }
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 ${Math.round(0.13 * k)}px ${ctx.kit.FONT_TITLE}`;
    for (let i = 0; i < LANES; i++) {
      const y = Y(R.laneZ0 + i * R.laneGap);
      for (const x of [TX0 + 0.15, TX1 - 0.2]) {
        c.fillStyle = IVORY;
        c.beginPath();
        c.arc(X(x), y, 0.088 * k, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#1b1b1f';
        c.fillText(`${i + 1}`, X(x), y + 1);
      }
    }
  });
}

/** Phông phía Bắc (mặt chữ hướng Nam): sơn son, chỉ vàng, XUẤT PHÁT ở startX, ĐÍCH + dải ca-rô ở finishX, mốc ¼ ½ ¾. */
function backdropTexture(ctx: CasinoCtx, len: number): THREE.CanvasTexture {
  const ppm = 160;
  const bx0 = R.x - len / 2;
  return casinoTexture(ctx, Math.round(len * ppm), Math.round(BACK_H * ppm), (c, w, h) => {
    const k = w / len;
    const X = (x: number) => (x - bx0) * k;
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#6a170e');
    grad.addColorStop(1, '#3c0d08');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8c060';
    c.fillRect(0, 3, w, 2);
    c.fillRect(0, h - 5, w, 2);
    c.fillStyle = 'rgba(232,192,96,0.35)';
    for (let x = bx0 + 0.25; x < bx0 + len; x += 0.5) {
      c.beginPath();
      c.moveTo(X(x), h * 0.5 - 4);
      c.lineTo(X(x) + 4, h * 0.5);
      c.lineTo(X(x), h * 0.5 + 4);
      c.lineTo(X(x) - 4, h * 0.5);
      c.closePath();
      c.fill();
    }
    const label = (text: string, x: number, size: number) => {
      c.font = `800 ${Math.round(size * k)}px ${ctx.kit.FONT_TITLE}`;
      const tw = c.measureText(text).width;
      c.fillStyle = '#4a0f09';
      c.fillRect(x - tw / 2 - 10, 8, tw + 20, h - 16);
      c.fillStyle = '#ffd98a';
      c.fillText(text, x, h * 0.54);
    };
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = IVORY;
    c.fillRect(X(R.startX) - 2, 6, 4, h - 12);
    label('XUẤT PHÁT', X(R.startX + 0.85), 0.2);
    const sq = (h - 12) / 6;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 2; col++) {
        c.fillStyle = (row + col) % 2 ? '#141414' : IVORY;
        c.fillRect(X(R.finishX) - sq + col * sq, 6 + row * sq, sq + 0.5, sq + 0.5);
      }
    }
    label('ĐÍCH', X(R.finishX - 0.5), 0.22);
    ['¼', '½', '¾'].forEach((f, i) => {
      const x = X(R.startX + ((i + 1) / 4) * (R.finishX - R.startX));
      c.fillStyle = '#e8c060';
      c.fillRect(x - 1.5, 6, 3, h - 12);
      label(f, x + 0.16 * k, 0.17);
    });
  });
}

/** Đĩa biển "ĐÍCH" trên cột đích (mặt hướng +Z). */
function finishDiscTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  return casinoTexture(ctx, 128, 128, (c, w, h) => {
    c.fillStyle = '#c8322a';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = IVORY;
    c.beginPath();
    c.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c8322a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `800 ${Math.round(h * 0.3)}px ${ctx.kit.FONT_TITLE}`;
    c.fillText('ĐÍCH', w / 2, h * 0.53);
  });
}

export function buildRace(ctx: CasinoCtx): void {
  const { geo, mesh, mat } = ctx.kit;
  const S = ctx.statics;
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, o: { rx?: number; rz?: number } = {}) =>
    S.add(mesh(g, m, { x, y, z, castShadow: false, ...o }));

  // Thân tủ gỗ lùi vào + chỉ đồng chân, mặt gỗ dưới cỏ viền chỉ vàng, khung gỗ quanh mặt cỏ (cao hơn cỏ 6 cm).
  add(geo.box(R.w - 0.3, 0.8, R.d - 0.3), ctx.woodDark, R.x, 0.44, R.z);
  add(geo.box(R.w - 0.2, 0.05, R.d - 0.2), ctx.gold, R.x, 0.025, R.z);
  add(geo.box(R.w, DECK_TOP - 0.84, R.d), ctx.woodMid, R.x, (DECK_TOP + 0.84) / 2, R.z);
  add(geo.box(R.w + 0.02, 0.025, R.d + 0.02), ctx.gold, R.x, 0.8525, R.z);
  const rimH = RIM_TOP - DECK_TOP;
  const rimY = (RIM_TOP + DECK_TOP) / 2;
  add(geo.box(R.w, rimH, RIM_NS), ctx.woodMid, R.x, rimY, ZN + RIM_NS / 2);
  add(geo.box(R.w, rimH, RIM_NS), ctx.woodMid, R.x, rimY, ZS - RIM_NS / 2);
  add(geo.box(RIM_EW, rimH, TZ1 - TZ0), ctx.woodMid, X0 + RIM_EW / 2, rimY, R.z);
  add(geo.box(RIM_EW, rimH, TZ1 - TZ0), ctx.woodMid, X1 - RIM_EW / 2, rimY, R.z);
  add(geo.box(TX1 - TX0, 0.006, 0.012), ctx.gold, R.x, RIM_TOP + 0.003, TZ0 - 0.006);
  add(geo.box(TX1 - TX0, 0.006, 0.012), ctx.gold, R.x, RIM_TOP + 0.003, TZ1 + 0.006);

  // Mặt cỏ đúng surfaceY.
  const turf = applySurface(new THREE.MeshStandardMaterial({ map: turfTexture(ctx), roughness: 0.95 }), 'fabric');
  add(new THREE.PlaneGeometry(TX1 - TX0, TZ1 - TZ0).rotateX(-Math.PI / 2), turf, (TX0 + TX1) / 2, R.surfaceY, (TZ0 + TZ1) / 2);

  // Phông sơn son đứng trên mép Bắc, nắp chỉ vàng.
  const backLen = R.w - 0.04;
  const backZ = ZN + 0.02 + BACK_T / 2;
  add(geo.box(backLen, BACK_H, BACK_T), ctx.woodDark, R.x, RIM_TOP + BACK_H / 2, backZ);
  add(new THREE.PlaneGeometry(backLen - 0.04, BACK_H - 0.04), new THREE.MeshStandardMaterial({ map: backdropTexture(ctx, backLen - 0.04), roughness: 0.45 }), R.x, RIM_TOP + BACK_H / 2, backZ + BACK_T / 2 + 0.002);
  add(geo.box(backLen + 0.02, 0.03, BACK_T + 0.03), ctx.gold, R.x, RIM_TOP + BACK_H + 0.015, backZ);

  // Phía khách: đệm da trên mép Nam + lan can trắng chạy từ cổng tới cuối đường.
  const armX0 = X0 + 0.06;
  const armX1 = X1 - 0.06;
  const armY = RIM_TOP + 0.045;
  const armZ = ZS - 0.065;
  add(geo.cyl(0.055, 0.055, armX1 - armX0, 12), ctx.leather, R.x, armY, armZ, { rz: Math.PI / 2 });
  for (const x of [armX0, armX1]) add(geo.sphere(0.055, 12, 8), ctx.leather, x, armY, armZ);
  const white = mat('#f2efe6', { roughness: 0.35, surface: 'none' });
  const railZ = TZ1 - 0.03;
  const railX0 = R.startX + 0.25;
  const railX1 = TX1 - 0.08;
  const posts = Math.round((railX1 - railX0) / 1.05);
  for (let i = 0; i <= posts; i++) add(geo.cyl(0.011, 0.011, 0.2, 6), white, railX0 + ((railX1 - railX0) * i) / posts, R.surfaceY + 0.1, railZ);
  add(geo.cyl(0.016, 0.016, railX1 - railX0, 8), white, (railX0 + railX1) / 2, R.surfaceY + 0.2, railZ, { rz: Math.PI / 2 });

  buildGate(ctx);

  // Cột đích phía khách: cột trắng sọc đỏ, đĩa "ĐÍCH" quay về phía khách.
  const red = mat('#c8322a', { roughness: 0.45, surface: 'none' });
  add(geo.cyl(0.016, 0.016, 0.52, 8), white, R.finishX, R.surfaceY + 0.26, railZ + 0.012);
  for (const y of [0.12, 0.3]) add(geo.cyl(0.0175, 0.0175, 0.06, 8), red, R.finishX, R.surfaceY + y, railZ + 0.012);
  add(new THREE.CircleGeometry(0.11, 24), new THREE.MeshStandardMaterial({ map: finishDiscTexture(ctx), roughness: 0.5 }), R.finishX, R.surfaceY + 0.6, railZ + 0.03);

  // Biển sơn son ở mặt tủ phía khách.
  const sign = lacquerSign(ctx, 'ĐUA NGỰA', 'Cược ngựa về nhất — tỉ lệ hiện trên bảng LED', 3.2, 0.5);
  sign.position.set(R.x, 0.47, R.z + (R.d - 0.3) / 2 + 0.025);
  S.add(sign);
}

/**
 * Cổng xuất phát ở startX: vách ngăn giữa các chuồng (đệm kem, hai vách đầu sơn son) từ startX − 0,42 tới startX + 0,02,
 * khung 4 cột + 2 xà ngang + thanh nóc vàng trên mỗi vách. Không có cửa trước (đồ tĩnh) — ngựa đứng ở vạch và phóng ra.
 */
function buildGate(ctx: CasinoCtx): void {
  const { geo, mesh, mat } = ctx.kit;
  const S = ctx.statics;
  const pad = mat('#e8dcc0', { roughness: 0.6, surface: 'fabric' });
  const back = R.startX - 0.42;
  const front = R.startX + 0.02;
  const mid = (back + front) / 2;
  const len = front - back;
  const top = R.surfaceY + 0.46;
  const zN = LANE_N - 0.03;
  const zS = LANE_S + 0.03;
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) =>
    S.add(mesh(geo.box(w, h, d), m, { x, y, z, castShadow: false }));
  for (let i = 0; i <= LANES; i++) {
    const end = i === 0 || i === LANES;
    const z = LANE_N + i * R.laneGap;
    box(len, 0.3, 0.018, end ? ctx.lacquer : pad, mid, R.surfaceY + 0.17, z);
    box(len, 0.018, 0.022, ctx.gold, mid, top - 0.01, z);
  }
  for (const x of [back, front]) {
    for (const z of [zN, zS]) box(0.04, top - R.surfaceY, 0.04, ctx.lacquer, x, (top + R.surfaceY) / 2, z);
    box(0.045, 0.05, zS - zN + 0.04, ctx.lacquer, x, top + 0.005, (zN + zS) / 2);
  }
  box(len + 0.04, 0.012, 0.05, ctx.gold, mid, top + 0.036, zN);
  box(len + 0.04, 0.012, 0.05, ctx.gold, mid, top + 0.036, zS);
}
