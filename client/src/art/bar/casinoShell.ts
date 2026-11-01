// Vỏ phòng Sòng Công Đức: thảm đỏ hoa văn, lối giữa thảm đậm viền vàng, tường gỗ tối ốp chỉ vàng (mặt trong trùng mặt
// trong va chạm: Bắc z = minZ, Đông x = maxX, Nam z = maxZ), trần ô cờ, khung cửa thông + biển phía Bar, đèn tường
// (chỉ phát sáng tự thân). Tường Bắc giữ phẳng ở x 26..37, y 2,3..4,3 — chỗ bảng LED của làn Đua Ngựa.
import * as THREE from 'three';
import { applySurface } from '../pbr';
import { PANEL_TILE, SB, WEST_FACE, WEST_LINING, casinoTexture, lacquerSign, neonSign, worldBox, worldPlane, type CasinoCtx } from './casinoKit';

/** Hoa thị vàng (cánh elip quanh tâm). */
function rosette(c: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, core: string): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = petal;
  for (let i = 0; i < 8; i++) {
    c.rotate(Math.PI / 4);
    c.beginPath();
    c.ellipse(r * 0.5, 0, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = core;
  c.beginPath();
  c.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Lốm đốm sợi vải/vân gỗ (tất định để mọi máy giống nhau). */
function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, dark: string, light: string): void {
  for (let i = 0; i < n; i++) {
    c.fillStyle = i % 2 ? dark : light;
    c.fillRect((i * 97.13) % w, (i * 57.71 + (i % 7) * 13.3) % h, 2, 2);
  }
}

/** Ván ốp: ô PANEL_TILE m × cả chiều cao phòng (đỉnh canvas = trần). Chân tường, ô ốp thấp, nẹp, ô lớn chỉ vàng, diềm. */
function panelTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  const H = SB.ceiling;
  return casinoTexture(
    ctx,
    256,
    1024,
    (c, w, h) => {
      const Y = (y: number) => h - (y / H) * h;
      const X = (x: number) => (x / PANEL_TILE) * w;
      c.fillStyle = '#2a160e';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        c.fillStyle = i % 3 ? 'rgba(0,0,0,0.13)' : 'rgba(140,80,46,0.09)';
        c.fillRect((i * 37.3) % w, 0, 1 + (i % 2), h);
      }
      // Trụ ốp ở mép ô (hai ô kề nhau ghép thành một trụ), chỉ vàng giữa trụ.
      c.fillStyle = '#190c07';
      c.fillRect(0, 0, X(0.07), h);
      c.fillRect(w - X(0.07), 0, X(0.07), h);
      c.fillStyle = '#c9a050';
      c.fillRect(0, 0, 2, h);
      // Chân tường + ô ốp thấp (khung nổi: mép trên-trái sáng, dưới-phải tối).
      c.fillStyle = '#120806';
      c.fillRect(0, Y(0.16), w, h - Y(0.16));
      const bx = X(0.16);
      const bw = X(1.34) - bx;
      const by = Y(0.94);
      const bh = Y(0.26) - by;
      c.fillStyle = '#341c12';
      c.fillRect(bx, by, bw, bh);
      c.fillStyle = 'rgba(255,200,140,0.12)';
      c.fillRect(bx, by, bw, 3);
      c.fillRect(bx, by, 3, bh);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(bx, by + bh - 3, bw, 3);
      c.fillRect(bx + bw - 3, by, 3, bh);
      // Nẹp ngang (nẹp vàng 3D phủ lên).
      c.fillStyle = '#b8913f';
      c.fillRect(0, Y(1.12), w, Y(1.05) - Y(1.12));
      // Ô lớn: lõi gỗ đỏ sẫm hoa văn chìm, viền chỉ vàng kép, hoa thoi ở góc.
      const x0 = X(0.17);
      const x1 = X(1.33);
      const y0 = Y(4.72);
      const y1 = Y(1.32);
      c.fillStyle = '#381a10';
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.strokeStyle = 'rgba(120,52,30,0.55)';
      c.lineWidth = 2;
      const cw = (x1 - x0) / 3;
      for (let yy = y0 + cw / 2; yy < y1; yy += cw) {
        for (let k = 0; k < 3; k++) {
          const cx = x0 + cw * (k + 0.5);
          c.beginPath();
          c.moveTo(cx, yy - cw * 0.42);
          c.lineTo(cx + cw * 0.3, yy);
          c.lineTo(cx, yy + cw * 0.42);
          c.lineTo(cx - cw * 0.3, yy);
          c.closePath();
          c.stroke();
        }
      }
      c.strokeStyle = '#d6ac55';
      c.lineWidth = 3;
      c.strokeRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
      c.lineWidth = 1.5;
      c.strokeRect(x0 + 13, y0 + 13, x1 - x0 - 26, y1 - y0 - 26);
      c.fillStyle = '#e0b55c';
      for (const [px, py] of [
        [x0 + 13, y0 + 13],
        [x1 - 13, y0 + 13],
        [x0 + 13, y1 - 13],
        [x1 - 13, y1 - 13],
      ] as const) {
        c.beginPath();
        c.moveTo(px, py - 7);
        c.lineTo(px + 7, py);
        c.lineTo(px, py + 7);
        c.lineTo(px - 7, py);
        c.closePath();
        c.fill();
      }
      // Diềm trên: gỗ sẫm, chỉ vàng, chấm vàng lặp.
      c.fillStyle = '#1c0e09';
      c.fillRect(0, 0, w, Y(4.92));
      c.fillStyle = '#c9a050';
      c.fillRect(0, Y(4.96), w, 3);
      for (let k = 0; k < 4; k++) {
        c.beginPath();
        c.arc((k + 0.5) * (w / 4), Y(5.12), 4, 0, Math.PI * 2);
        c.fill();
      }
    },
    true,
  );
}

/** Thảm đỏ hoa văn: lưới thoi chỉ vàng sẫm, hoa thị giữa ô (ô lặp 1,5 m). */
function carpetTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  return casinoTexture(
    ctx,
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#5a0d13';
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, 1400, 'rgba(0,0,0,0.12)', 'rgba(255,140,120,0.05)');
      c.strokeStyle = 'rgba(190,134,50,0.6)';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(0, h / 2);
      c.lineTo(w / 2, 0);
      c.lineTo(w, h / 2);
      c.lineTo(w / 2, h);
      c.closePath();
      c.stroke();
      c.strokeStyle = 'rgba(40,4,8,0.7)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(w * 0.12, h / 2);
      c.lineTo(w / 2, h * 0.12);
      c.lineTo(w * 0.88, h / 2);
      c.lineTo(w / 2, h * 0.88);
      c.closePath();
      c.stroke();
      rosette(c, w / 2, h / 2, 38, '#c8963c', '#3d070b');
      for (const [x, y] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ] as const)
        rosette(c, x, y, 22, '#a8762c', '#2c0508');
    },
    true,
  );
}

/** Thảm lối giữa: đỏ đậm, viền vàng hai mép (theo chiều ngang thảm = trục v), huy chương vàng mỗi 1,5 m. */
function aisleTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  return casinoTexture(
    ctx,
    256,
    512,
    (c, w, h) => {
      c.fillStyle = '#3c070c';
      c.fillRect(0, 0, w, h);
      speckle(c, w, h, 1600, 'rgba(0,0,0,0.14)', 'rgba(255,120,100,0.05)');
      for (const flip of [false, true]) {
        const at = (y: number, hh: number) => (flip ? h - y - hh : y);
        c.fillStyle = '#1e0306';
        c.fillRect(0, at(0, 12), w, 12);
        c.fillStyle = '#d4a64a';
        c.fillRect(0, at(12, 20), w, 20);
        c.fillStyle = '#e8c56e';
        c.fillRect(0, at(40, 4), w, 4);
      }
      c.strokeStyle = 'rgba(212,166,74,0.85)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(w / 2, h / 2, 72, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.arc(w / 2, h / 2, 60, 0, Math.PI * 2);
      c.stroke();
      rosette(c, w / 2, h / 2, 50, '#d4a64a', '#5a0d13');
      // Thoi vàng nhỏ ở mép ô (hai ô ghép thành một), hàng chấm dọc theo chiều dài.
      c.fillStyle = '#b8863a';
      for (const x of [0, w]) {
        c.beginPath();
        c.moveTo(x, h / 2 - 30);
        c.lineTo(x + 18, h / 2);
        c.lineTo(x, h / 2 + 30);
        c.lineTo(x - 18, h / 2);
        c.closePath();
        c.fill();
      }
      for (let k = 0; k < 4; k++) {
        for (const y of [h * 0.22, h * 0.78]) {
          c.beginPath();
          c.arc((k + 0.5) * (w / 4), y, 5, 0, Math.PI * 2);
          c.fill();
        }
      }
    },
    true,
  );
}

/** Trần ô cờ: khung gỗ sẫm, ô lõm đỏ nâu viền chỉ vàng, hoa thị giữa ô (ô lặp 2 m). */
function cofferTexture(ctx: CasinoCtx): THREE.CanvasTexture {
  return casinoTexture(
    ctx,
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#1d0f09';
      c.fillRect(0, 0, w, h);
      const m = 24;
      const grad = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.55);
      grad.addColorStop(0, '#4a2116');
      grad.addColorStop(1, '#2a120b');
      c.fillStyle = grad;
      c.fillRect(m, m, w - 2 * m, h - 2 * m);
      c.strokeStyle = '#c99a48';
      c.lineWidth = 3;
      c.strokeRect(m + 8, m + 8, w - 2 * m - 16, h - 2 * m - 16);
      c.fillStyle = 'rgba(255,220,160,0.08)';
      c.fillRect(m, m, w - 2 * m, 4);
      rosette(c, w / 2, h / 2, 34, '#c99a48', '#2a120b');
    },
    true,
  );
}

/** Nhấp nháy neon: nhịp thở nhẹ + thỉnh thoảng chập chờn (tất định theo thời gian). */
export function neonFlicker(ctx: CasinoCtx, m: THREE.MeshStandardMaterial, base: number, seed: number): void {
  ctx.updates.push((_dt, t) => {
    const blink = Math.sin(t * 19.3 + seed) * Math.sin(t * 6.1 + seed * 2) > 0.95 ? 0.45 : 1;
    m.emissiveIntensity = (base + Math.sin(t * 2.1 + seed) * 0.1) * blink;
  });
}

/** Một dải nằm ngang chạy dọc mặt tường: tường theo trục `axis`, mặt ở toạ độ `f`, `s` = chiều vào trong phòng. */
interface Run {
  axis: 'x' | 'z';
  f: number;
  s: 1 | -1;
  a: number;
  b: number;
}

/** Sàn thảm, lối giữa, trần ô cờ, tường ốp (3 tường mới + ván phủ mặt tường Bar), nẹp vàng, phào trần, neon tường Đông. */
export function buildShell(ctx: CasinoCtx): void {
  const { kit } = ctx;
  const S = ctx.statics;
  const H = SB.ceiling;
  const T = 0.3;
  const xE = SB.maxX + T;
  const d = SB.door;
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => S.add(kit.mesh(g, m, { castShadow: false }));

  // Sàn thảm; lối giữa cao hơn sàn 12 mm (khỏi giành độ sâu khi nhìn xa), v trải đúng bề ngang thảm.
  add(worldPlane(SB.minX, SB.maxX, SB.minZ, SB.maxZ, 0, 1.5), applySurface(new THREE.MeshStandardMaterial({ map: carpetTexture(ctx), roughness: 0.92 }), 'fabric'));
  const aisle = worldPlane(WEST_FACE, SB.maxX, SB.aisle.z0, SB.aisle.z1, 0.012, 1.5);
  const apos = aisle.attributes.position as THREE.BufferAttribute;
  const auv = aisle.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < auv.count; i++) auv.setY(i, (apos.getZ(i) - SB.aisle.z0) / (SB.aisle.z1 - SB.aisle.z0));
  add(aisle, applySurface(new THREE.MeshStandardMaterial({ map: aisleTexture(ctx), roughness: 0.9 }), 'fabric'));
  add(worldPlane(SB.minX, xE, SB.minZ - T, SB.maxZ + T, H, 2, true), applySurface(new THREE.MeshStandardMaterial({ map: cofferTexture(ctx), roughness: 0.85 }), 'wood'));

  // Tường mới dày 0,3 m nằm ngoài lòng phòng; ván ốp 4 cm phủ mặt tường Bar, chừa cửa thông.
  const wallMat = applySurface(new THREE.MeshStandardMaterial({ map: panelTexture(ctx), roughness: 0.6 }), 'wood');
  const wall = (x0: number, x1: number, y0: number, z0: number, z1: number) => add(worldBox(x0, x1, y0, H, z0, z1, PANEL_TILE, H), wallMat);
  wall(WEST_FACE, xE, 0, SB.minZ - T, SB.minZ);
  wall(SB.maxX, xE, 0, SB.minZ - T, SB.maxZ + T);
  wall(WEST_FACE, xE, 0, SB.maxZ, SB.maxZ + T);
  wall(WEST_FACE, WEST_LINING, 0, SB.minZ, d.z0);
  wall(WEST_FACE, WEST_LINING, 0, d.z1, SB.maxZ);
  wall(WEST_FACE, WEST_LINING, d.height, d.z0, d.z1);

  // Phào trần (gỗ sẫm + chỉ vàng) quanh 4 mặt; nẹp vàng ngang + len chân tường (chừa khung cửa).
  const strip = (r: Run, y: number, h: number, dp: number, m: THREE.Material) => {
    const len = r.b - r.a;
    const mid = (r.a + r.b) / 2;
    const off = r.f + (r.s * dp) / 2;
    S.add(
      r.axis === 'x'
        ? kit.mesh(kit.geo.box(len, h, dp), m, { x: mid, y, z: off, castShadow: false })
        : kit.mesh(kit.geo.box(dp, h, len), m, { x: off, y, z: mid, castShadow: false }),
    );
  };
  const north: Run = { axis: 'x', f: SB.minZ, s: 1, a: WEST_LINING, b: SB.maxX };
  const south: Run = { axis: 'x', f: SB.maxZ, s: -1, a: WEST_LINING, b: SB.maxX };
  const east: Run = { axis: 'z', f: SB.maxX, s: -1, a: SB.minZ, b: SB.maxZ };
  const west: Run = { axis: 'z', f: WEST_LINING, s: 1, a: SB.minZ, b: SB.maxZ };
  for (const r of [north, south, east, west]) {
    strip(r, H - 0.07, 0.14, 0.12, ctx.woodDark);
    strip(r, H - 0.155, 0.03, 0.13, ctx.gold);
  }
  for (const r of [north, south, east, { ...west, b: d.z0 - 0.16 }, { ...west, a: d.z1 + 0.16 }]) {
    strip(r, 1.085, 0.07, 0.045, ctx.gold);
    strip(r, 0.06, 0.12, 0.025, ctx.woodDark);
  }

  // Neon "SÒNG CÔNG ĐỨC" trên tường Đông, cuối lối giữa.
  const neon = neonSign(ctx, 'SÒNG CÔNG ĐỨC', { width: 5.2, height: 1.0, color: '#ffd24a', border: '#ff3b6b' });
  neon.group.position.set(SB.maxX - 0.04, 3.75, (SB.aisle.z0 + SB.aisle.z1) / 2);
  neon.group.rotation.y = -Math.PI / 2;
  S.add(neon.group);
  neonFlicker(ctx, neon.mat, 1.6, 0.7);
}

/** Cửa thông ở tường Đông của Bar: ngưỡng đồng, ốp má cửa + lanh tô, nẹp khung sơn son chỉ vàng hai mặt, biển phía Bar. */
export function buildEntrance(ctx: CasinoCtx): void {
  const { kit } = ctx;
  const S = ctx.statics;
  const d = SB.door;
  const zc = (d.z0 + d.z1) / 2;
  /** Mặt gạch phía Bar (tường gạch Bar dày 0,3 m nằm sau WEST_FACE). */
  const barFace = WEST_FACE - 0.3;
  // Lòng cửa xuyên gạch + ván ốp: ngưỡng / má cửa / lanh tô nhô 2 cm khỏi mặt gạch phía Bar, lùi 2 cm sau mặt ván Sòng.
  const x0 = barFace - 0.02;
  const x1 = WEST_LINING - 0.02;
  const cx = (x0 + x1) / 2;
  const depth = x1 - x0;
  const box = (w: number, h: number, dp: number, m: THREE.Material, x: number, y: number, z: number) =>
    S.add(kit.mesh(kit.geo.box(w, h, dp), m, { x, y, z, castShadow: false }));
  box(depth, 0.02, d.z1 - d.z0 + 0.12, ctx.gold, cx, 0.01, zc);
  box(depth, d.height, 0.06, ctx.woodDark, cx, d.height / 2, d.z0 + 0.03);
  box(depth, d.height, 0.06, ctx.woodDark, cx, d.height / 2, d.z1 - 0.03);
  box(depth, 0.06, d.z1 - d.z0, ctx.woodDark, cx, d.height - 0.03, zc);
  const hh = d.height + 0.16;
  for (const x of [barFace - 0.03, WEST_LINING + 0.03]) {
    box(0.06, hh, 0.16, ctx.lacquer, x, hh / 2, d.z0 - 0.08);
    box(0.06, hh, 0.16, ctx.lacquer, x, hh / 2, d.z1 + 0.08);
    box(0.06, 0.16, d.z1 - d.z0 + 0.32, ctx.lacquer, x, d.height + 0.08, zc);
    // Chỉ vàng mép trong nẹp (nhô 2 mm cho khỏi trùng mặt).
    box(0.07, d.height, 0.027, ctx.gold, x, d.height / 2, d.z0 - 0.0115);
    box(0.07, d.height, 0.027, ctx.gold, x, d.height / 2, d.z1 + 0.0115);
    box(0.07, 0.027, d.z1 - d.z0 + 0.05, ctx.gold, x, d.height + 0.0115, zc);
  }
  const neon = neonSign(ctx, 'SÒNG CÔNG ĐỨC', { width: 3.6, height: 0.82, color: '#ffd24a', border: '#ff3b6b', sub: 'TÀI XỈU · XÌ DÁCH · BÀI CÀO · NỔ HŨ · ĐUA NGỰA' });
  neon.group.position.set(barFace - 0.04, d.height + 0.95, zc);
  neon.group.rotation.y = -Math.PI / 2;
  S.add(neon.group);
  neonFlicker(ctx, neon.mat, 1.5, 2.3);
  const warn = lacquerSign(ctx, 'CỜ BẠC LÀ BÁC THẰNG BẦN', 'Công Đức đi dễ khó về', 2.3, 0.78);
  warn.position.set(barFace - 0.035, 2.05, d.z0 - 1.75);
  warn.rotation.y = -Math.PI / 2;
  S.add(warn);
}

/** Đèn tường: đế vàng, tay đỡ, chao vải phát sáng tự thân (không thêm nguồn sáng). Tường Bắc tránh chỗ bảng LED. */
export function buildSconces(ctx: CasinoCtx): void {
  const { geo, mesh, mat } = ctx.kit;
  const shade = mat('#ffe6bf', { emissive: '#ffbf6a', emissiveIntensity: 1.7 });
  const d = SB.door;
  const W = Math.PI / 2;
  const at: [number, number, number][] = [
    [WEST_LINING, d.z0 - 1.2, W],
    [WEST_LINING, d.z1 + 1.2, W],
    [WEST_LINING, -4.2, W],
    [WEST_LINING, 12.4, W],
    [SB.maxX, 1.6, -W],
    [SB.maxX, 8.4, -W],
    [SB.maxX, -4.2, -W],
    [SB.maxX, 12.4, -W],
    [24.6, SB.minZ, 0],
    [38.4, SB.minZ, 0],
    [25.5, SB.maxZ, Math.PI],
    [28.5, SB.maxZ, Math.PI],
    [33, SB.maxZ, Math.PI],
    [35, SB.maxZ, Math.PI],
    [37, SB.maxZ, Math.PI],
  ];
  for (const [x, z, ry] of at) {
    const g = new THREE.Group();
    g.position.set(x, 2.75, z);
    g.rotation.y = ry;
    g.add(mesh(geo.box(0.14, 0.3, 0.03), ctx.gold, { z: 0.015, castShadow: false }));
    g.add(mesh(geo.box(0.025, 0.025, 0.17), ctx.gold, { y: -0.05, z: 0.1, castShadow: false }));
    g.add(mesh(geo.cyl(0.035, 0.022, 0.05, 8), ctx.gold, { y: -0.03, z: 0.18, castShadow: false }));
    g.add(mesh(geo.cyl(0.06, 0.09, 0.15, 10), shade, { y: 0.06, z: 0.18, castShadow: false }));
    ctx.statics.add(g);
  }
}
