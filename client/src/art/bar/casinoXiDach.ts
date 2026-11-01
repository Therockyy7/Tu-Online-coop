// Bàn Xì Dách của Sòng Công Đức: bàn bán nguyệt (nửa elip bán trục w/2 × d của SONG_BAC) — cạnh thẳng phía Bắc cho
// nhà cái, cạnh cong quay về lối giữa cho 5 khách. Mặt nỉ xanh cao đúng SB.feltY in 5 ô tròn đúng neo ghế, cung chữ
// "NHÀ CÁI RÚT TỚI 16" và cung lãi theo hạng (số đọc từ balance); đệm da chạy theo mép cong, nẹp gỗ cạnh nhà cái; hộp
// bài tĩnh cạnh `xidach_dealer` lệch +0,5 m X (chỗ lá bài của làn Xì Dách bay ra), khay phỉnh phía Tây. Không đặt NPC.
import * as THREE from 'three';
import { XIDACH } from '@shared/index';
import { C, SB, anchorOf, casinoTexture, feltMat, type CasinoCtx } from './casinoKit';
import { FELT_IN, GOLD_INK, PPM, RAIL_IN, RAIL_R, RAIL_Y, TEXT_INK, chipTray, feltBase, fitFont } from './casinoTables';

/** Số đoạn chia cung elip (đủ mịn ở bán kính ~1,7 m). */
const ARC_SEG = 48;
/** Mép nỉ lùi khỏi cạnh thẳng (luồn dưới nẹp gỗ phía nhà cái). */
const FELT_STRAIGHT_IN = 0.05;
/** Bề sâu nẹp gỗ cạnh thẳng (tính từ mép bàn vào trong). */
const LIP_D = 0.07;
/** Bán kính ô cược tròn ở mỗi neo ghế. */
const SPOT_R = 0.12;
/** Bán kính (m, tính từ giữa cạnh thẳng) của cung chữ luật nhà cái và cung chữ lãi. */
const RULE_R = 0.76;
const PAY_R = 1.36;

/**
 * Nửa elip trong mặt phẳng hình (sx, sy) với sy = −lz, lz = khoảng cách về phía Nam tính từ cạnh thẳng của bàn: bán
 * trục a (X) × b (Z), bỏ phần lz < s (s > 0 lùi cạnh thẳng vào trong, s < 0 nhô ra ngoài). Sau `rotateX(−π/2)` hình
 * nằm ngang, mặt trên hướng +Y, lz trùng +Z của nhóm bàn.
 */
function halfEllipse(a: number, b: number, s: number): THREE.Shape {
  const phiM = Math.acos(THREE.MathUtils.clamp(s / b, -1, 1));
  const shape = new THREE.Shape();
  for (let i = 0; i <= ARC_SEG; i++) {
    const phi = -phiM + (2 * phiM * i) / ARC_SEG;
    if (i === 0) shape.moveTo(a * Math.sin(phi), -b * Math.cos(phi));
    else shape.lineTo(a * Math.sin(phi), -b * Math.cos(phi));
  }
  shape.closePath();
  return shape;
}

/** Khối nửa elip dày h, đáy ở cao độ y0. */
function slab(a: number, b: number, s: number, y0: number, h: number): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(halfEllipse(a, b, s), { depth: h, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Mặt nỉ nửa elip (aF × bF); UV phủ khung chữ nhật [−aF, aF] × [0, bF], đỉnh texture ở cạnh thẳng (phía Bắc). */
function feltGeometry(aF: number, bF: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(halfEllipse(aF, bF, FELT_STRAIGHT_IN), 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + aF) / (2 * aF), 1 - pos.getZ(i) / bF);
  return g;
}

/**
 * Chữ chạy theo cung tròn tâm (cx, cy), bán kính r (px), giữa cung nằm ngay dưới tâm; chân chữ quay ra ngoài để khách
 * đứng phía cạnh cong đọc xuôi từ trái sang phải. Tách từng ký tự đã chuẩn hoá NFC (dấu tiếng Việt không rời chữ).
 */
function arcText(c: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number): void {
  const chars = [...text.normalize('NFC')];
  const widths = chars.map((ch) => c.measureText(ch).width);
  let theta = -widths.reduce((s, w) => s + w, 0) / r / 2;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const half = widths[i]! / r / 2;
    theta += half;
    c.save();
    c.translate(cx + r * Math.sin(theta), cy + r * Math.cos(theta));
    c.rotate(-theta);
    c.fillText(ch, 0, 0);
    c.restore();
    theta += half;
  });
}

export function buildXiDach(ctx: CasinoCtx): void {
  const { geo, mesh } = ctx.kit;
  const xd = SB.xidach;
  const a = xd.w / 2;
  const b = xd.d;
  const z0 = xd.z - xd.d / 2;
  const seats = Array.from({ length: XIDACH.seats }, (_, k) => anchorOf(ctx, `xidach_seat:${k + 1}`));
  const dealer = anchorOf(ctx, 'xidach_dealer');
  const g = new THREE.Group();
  g.position.set(xd.x, 0, z0);

  // Chân bệ gỗ lùi vào + chỉ đồng chân, mặt gỗ dày 10 cm viền chỉ vàng (cùng kiểu bàn chữ nhật).
  g.add(mesh(slab(a - 0.25, b - 0.25, 0.25, 0.04, 0.7), ctx.woodDark));
  g.add(mesh(slab(a - 0.18, b - 0.18, 0.18, 0, 0.05), ctx.gold));
  g.add(mesh(slab(a, b, 0, 0.74, 0.1), ctx.woodMid));
  g.add(mesh(slab(a + 0.01, b + 0.01, -0.01, 0.7325, 0.025), ctx.gold));

  // Mặt nỉ: canvas phủ khung [−aF, aF] × [0, bF] (mét → điểm ảnh theo đúng tỉ lệ nên hình tròn vẫn tròn).
  const aF = a - FELT_IN;
  const bF = b - FELT_IN;
  const font = ctx.kit.FONT_TITLE;
  const p = XIDACH.payout;
  const tex = casinoTexture(ctx, Math.round(2 * aF * PPM), Math.round(bF * PPM), (c, w, h) => {
    const kx = w / (2 * aF);
    const kz = h / bF;
    const X = (lx: number) => (lx + aF) * kx;
    const Y = (lz: number) => lz * kz;
    feltBase(c, w, h, C.feltGreen);
    c.strokeStyle = GOLD_INK;
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(X(0), Y(0), (aF - 0.05) * kx, (bF - 0.05) * kz, 0, 0, Math.PI);
    c.stroke();
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(X(0), Y(0), (aF - 0.08) * kx, (bF - 0.08) * kz, 0, 0, Math.PI);
    c.stroke();
    // 5 ô cược tròn đúng neo ghế, số ghế quay về phía người ngồi ghế đó.
    seats.forEach((s, k) => {
      const r = SPOT_R * kx;
      c.save();
      c.translate(X(s.x - xd.x), Y(s.z - z0));
      c.rotate(-(s.ry ?? 0));
      c.fillStyle = 'rgba(255,214,140,0.08)';
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = GOLD_INK;
      c.lineWidth = 5;
      c.stroke();
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(0, 0, r - 9, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = 'rgba(255,233,176,0.75)';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitFont(c, `${k + 1}`, r * 0.95, r * 1.2, '800', font);
      c.fillText(`${k + 1}`, 0, r * 0.06);
      c.restore();
    });
    // Cung chữ luật nhà cái (giữa nhà cái và các ô ghế) và cung lãi (phía ngoài các ô ghế).
    c.fillStyle = TEXT_INK;
    c.font = `800 ${Math.round(0.085 * kz)}px ${font}`;
    arcText(c, `NHÀ CÁI RÚT TỚI ${XIDACH.dealerStandAt}`, X(0), Y(0), RULE_R * kz);
    c.fillStyle = '#f3d28a';
    c.font = `700 ${Math.round(0.052 * kz)}px ${font}`;
    arcText(c, `XÌ BÀNG 1 ĂN ${p.xi_bang} · XÌ DÁCH 1 ĂN ${p.xi_dach} · NGŨ LINH 1 ĂN ${p.ngu_linh}`, X(0), Y(0), PAY_R * kz);
  });
  g.add(mesh(feltGeometry(aF, bF), feltMat(tex), { y: SB.feltY, castShadow: false }));

  // Đệm da theo mép cong (dừng trước cạnh thẳng một đoạn RAIL_IN), hai đầu bo tròn; nẹp gỗ chỉ vàng ở cạnh nhà cái.
  const ra = a - RAIL_IN;
  const rb = b - RAIL_IN;
  const phiE = Math.acos(RAIL_IN / rb);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= ARC_SEG; i++) {
    const phi = -phiE + (2 * phiE * i) / ARC_SEG;
    pts.push(new THREE.Vector3(ra * Math.sin(phi), RAIL_Y, rb * Math.cos(phi)));
  }
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), ARC_SEG * 2, RAIL_R, 10), ctx.leather));
  for (const s of [-1, 1]) g.add(mesh(geo.sphere(RAIL_R, 10, 6), ctx.leather, { x: s * ra * Math.sin(phiE), y: RAIL_Y, z: RAIL_IN }));
  const lipW = 2 * ra * Math.sin(phiE) - 2 * RAIL_R;
  g.add(mesh(geo.box(lipW, 0.045, LIP_D), ctx.woodMid, { y: 0.8625, z: LIP_D / 2 }));
  g.add(mesh(geo.box(lipW, 0.008, 0.012), ctx.gold, { y: 0.889, z: LIP_D - 0.008 }));
  ctx.statics.add(g);

  deckShoe(ctx, dealer.x + 0.5, dealer.z);
  chipTray(ctx, dealer.x - 0.78, z0 + 0.19);
}

/**
 * Hộp bài (shoe) tĩnh trên nỉ, tâm (x, z): thân sơn đen viền vàng, lưng cao hơn miệng, chồng bài nghiêng lộ mặt lưng đỏ,
 * khe rút bài ở miệng quay về phía khách (Nam). Lá bài 3D của làn Xì Dách xuất phát từ đây.
 */
function deckShoe(ctx: CasinoCtx, x: number, z: number): void {
  const { geo, mesh, mat } = ctx.kit;
  const y = SB.feltY;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const edge = mat('#efe8d6', { roughness: 0.6, surface: 'none' });
  const back = mat('#9e1b22', { roughness: 0.5, surface: 'none' });
  g.add(mesh(geo.box(0.18, 0.07, 0.27), ctx.ink, { y: 0.035 }));
  g.add(mesh(geo.box(0.18, 0.045, 0.06), ctx.ink, { y: 0.0925, z: -0.105 }));
  g.add(mesh(geo.box(0.13, 0.05, 0.21), edge, { y: 0.085, z: -0.01, rx: 0.14 }));
  g.add(mesh(geo.box(0.128, 0.004, 0.205), back, { y: 0.112, z: -0.014, rx: 0.14 }));
  g.add(mesh(geo.box(0.12, 0.012, 0.012), edge, { y: 0.05, z: 0.136 }));
  for (const sx of [-1, 1]) g.add(mesh(geo.box(0.012, 0.012, 0.27), ctx.gold, { x: sx * 0.09, y: 0.07, castShadow: false }));
  g.add(mesh(geo.box(0.19, 0.012, 0.012), ctx.gold, { y: 0.07, z: 0.135, castShadow: false }));
  g.add(mesh(geo.box(0.19, 0.012, 0.012), ctx.gold, { y: 0.115, z: -0.135, castShadow: false }));
  ctx.statics.add(g);
}
