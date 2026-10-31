// Map Quán Bar "Niết Bàn Club": sàn LED 8×6 nháy theo nhịp, DJ booth + loa nảy + tường LED, quầy bar + kệ rượu
// phát sáng, khu VIP dây nhung, vòng quay sự thật, bàn Bầu Cua, quầy đổi Đức, cửa Hồi Sơn, giàn đèn quét,
// quả cầu disco, khách NPC nhún nhảy. Điều khiển: onBeat / drop / setLightTheme.
import * as THREE from 'three';
import { createRng, type ColliderDef, type MapDef } from '@shared/index';
import { defaultAnchors } from '../anchors';
import type { WorldBuilder, WorldHandles } from '../api';
import { createAvatar, npcLook } from '../avatar';
import { kit as defaultKit } from '../kit';

type Theme = 'neon' | 'gold' | 'ocean' | 'fire';
const THEMES: Record<Theme, string[]> = {
  neon: ['#ff4fd8', '#3ef2ff', '#9b5cff', '#ffe14f'],
  gold: ['#ffd166', '#ff9f43', '#ffe9a8', '#ff6b35'],
  ocean: ['#3ef2ff', '#2f7bff', '#5cffd6', '#9be7ff'],
  fire: ['#ff3b30', '#ff9f1a', '#ffd60a', '#ff5ea8'],
};

export const buildBar: WorldBuilder = (map: MapDef, kit = defaultKit): WorldHandles => {
  const { geo, mat, mesh } = kit;
  const rng = createRng(1234);
  const root = new THREE.Group();
  root.name = 'bar';
  const statics = new THREE.Group();
  const dyn = new THREE.Group();
  const anchors = new Map<string, THREE.Object3D>();
  const one = (tag: string) => map.colliders.find((c) => c.tag === tag) as ColliderDef;
  const all = (tag: string) => map.colliders.filter((c) => c.tag === tag);
  const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number } = {}) =>
    mesh(geo.box(w, h, d), mat(color), { x, y, z, ...o });
  const neonMat = (color: string, intensity = 2.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  const glow = (color: string, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  let palette = THEMES.neon.map((c) => new THREE.Color(c));
  const themed: { mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; slot: number; emissive: boolean }[] = [];
  const themedMat = (slot: number, intensity = 2.2) => {
    const m = neonMat(THEMES.neon[slot % 4]!, intensity);
    themed.push({ mat: m, slot, emissive: true });
    return m;
  };

  const W = 46;
  const D = 34;
  const H = 6.2;

  // ── Vỏ phòng: sàn bóng, tường gạch tối, trần + giàn đèn ──
  const floorTex = kit.canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = '#1a1428';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        c.fillStyle = (i + j) % 2 ? '#211a33' : '#1b1529';
        c.fillRect(i * 64, j * 64, 64, 64);
      }
    }
    c.strokeStyle = '#2d2445';
    c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      c.beginPath();
      c.moveTo(i * 64, 0);
      c.lineTo(i * 64, h);
      c.moveTo(0, i * 64);
      c.lineTo(w, i * 64);
      c.stroke();
    }
  });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(W / 4, D / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.25 }));
  floor.receiveShadow = true;
  dyn.add(floor);
  const brick = kit.canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#16111f';
    c.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 26;
    for (let r = 0; r * bh < h; r++) {
      for (let k = -1; k * bw < w; k++) {
        const x = k * bw + (r % 2 ? bw / 2 : 0);
        const v = Math.sin(r * 12.9 + k * 78.2) * 0.5 + 0.5;
        c.fillStyle = `hsl(${265 + v * 20}, 22%, ${13 + v * 6}%)`;
        c.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
  });
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const wallMat = (len: number) => {
    const t = brick.clone();
    t.repeat.set(len / 4, H / 2);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  };
  for (const [w, d, x, z] of [
    [W, 0.6, 0, -D / 2],
    [W, 0.6, 0, D / 2],
    [0.6, D, -W / 2, 0],
    [0.6, D, W / 2, 0],
  ] as const) {
    const len = Math.max(w, d);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat(len));
    m.position.set(x, H / 2, z);
    m.receiveShadow = true;
    dyn.add(m);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), mat('#0f0b18', { roughness: 1 }));
  ceiling.position.y = H;
  dyn.add(ceiling);
  const truss = new THREE.Group();
  const metal = mat('#3a3f4a', { metalness: 0.6, roughness: 0.4 });
  for (let x = -18; x <= 18; x += 6) truss.add(mesh(geo.box(0.22, 0.22, D - 2), metal, { x, y: H - 0.5, castShadow: false }));
  for (let z = -12; z <= 12; z += 6) truss.add(mesh(geo.box(W - 2, 0.22, 0.22), metal, { y: H - 0.5, z, castShadow: false }));
  statics.add(truss);

  // Viền neon chạy dọc chân & đỉnh tường (đổi màu theo theme).
  for (const [w, d, x, z] of [
    [W - 1.4, 0.06, 0, -D / 2 + 0.36],
    [W - 1.4, 0.06, 0, D / 2 - 0.36],
    [0.06, D - 1.4, -W / 2 + 0.36, 0],
    [0.06, D - 1.4, W / 2 - 0.36, 0],
  ] as const) {
    dyn.add(mesh(geo.box(w, 0.08, d), themedMat(0, 2.6), { x, y: 0.12, z, castShadow: false }));
    dyn.add(mesh(geo.box(w, 0.08, d), themedMat(1, 2.6), { x, y: H - 0.15, z, castShadow: false }));
  }

  // ── Sàn LED 8×6 ──
  const tiles: { m: THREE.Mesh; mat: THREE.MeshStandardMaterial; i: number; j: number; level: number; color: THREE.Color }[] = [];
  const floorBase = new THREE.Group();
  floorBase.add(box(16.6, 0.08, 12.6, '#0b0814', 0, 0.04, 0));
  dyn.add(floorBase);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 6; j++) {
      const m = new THREE.MeshStandardMaterial({ color: '#1a1a22', emissive: '#000000', emissiveIntensity: 1.8, roughness: 0.25, metalness: 0.1 });
      const t = mesh(geo.box(1.9, 0.06, 1.9), m, { x: -7 + i * 2, y: 0.1, z: -5 + j * 2, castShadow: false });
      dyn.add(t);
      tiles.push({ m: t, mat: m, i, j, level: 0, color: new THREE.Color() });
    }
  }

  // ── DJ booth + loa + tường LED ──
  const dj = one('dj_booth');
  const djG = new THREE.Group();
  djG.position.set(dj.x, 0, dj.z);
  djG.add(box(6, 1.05, 1.4, '#14121c', 0, 0.525, 0));
  djG.add(box(6.1, 0.08, 1.5, '#2a2a36', 0, 1.09, 0));
  const djFront = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.8), themedMat(0, 1.6));
  djFront.position.set(0, 0.55, 0.71);
  djG.add(djFront);
  const djSign = kit.signBoard('DJ', { width: 1.4, height: 0.5, bg: '#0b0814', border: '#3ef2ff', color: '#ff7be5', depth: 0.02 });
  djSign.position.set(0, 0.55, 0.74);
  djG.add(djSign);
  const platters: THREE.Mesh[] = [];
  for (const x of [-1.6, 1.6]) {
    djG.add(box(1.2, 0.08, 1.0, '#2b2b36', x, 1.17, -0.05));
    const p = mesh(geo.cyl(0.42, 0.42, 0.03, 20), mat('#111111', { roughness: 0.3 }), { x, y: 1.23, z: -0.05 });
    p.add(mesh(geo.cyl(0.08, 0.08, 0.035, 10), themedMat(2, 2)));
    p.add(mesh(geo.box(0.36, 0.01, 0.02), mat('#888888'), { x: 0.15, y: 0.02 }));
    djG.add(p);
    platters.push(p);
  }
  djG.add(box(1.1, 0.12, 0.8, '#22222c', 0, 1.18, -0.05));
  for (let k = 0; k < 8; k++) djG.add(mesh(geo.cyl(0.03, 0.03, 0.05, 6), themedMat(k % 4, 2), { x: -0.4 + (k % 4) * 0.27, y: 1.26, z: -0.25 + Math.floor(k / 4) * 0.3 }));
  djG.add(box(0.7, 0.03, 0.48, '#c9cdd6', 0.0, 1.3, -0.45, { rx: -0.25 }));
  dyn.add(djG);
  anchors.set('dj_booth_top', djG);
  const speakers: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Group();
    sp.position.set(dj.x + s * 4.4, 0, dj.z - 0.6);
    sp.add(box(1.5, 2.6, 1.2, '#0e0d14', 0, 1.3, 0));
    for (const [y, r] of [
      [0.8, 0.5],
      [1.9, 0.32],
    ] as const) {
      const cone = mesh(geo.cyl(r, r * 0.7, 0.1, 18), mat('#2a2a33', { roughness: 0.5 }), { y, z: 0.62, rx: Math.PI / 2 });
      cone.add(mesh(geo.cyl(r * 0.3, r * 0.3, 0.12, 12), themedMat(1, 1.4), { y: 0.02 }));
      sp.add(cone);
    }
    dyn.add(sp);
    speakers.push(sp);
  }
  // Tường LED sau DJ: lưới cột sóng nhạc.
  const vu: { m: THREE.Mesh; col: number }[] = [];
  const vuGroup = new THREE.Group();
  vuGroup.position.set(0, 1.2, -D / 2 + 0.36);
  for (let c = 0; c < 20; c++) {
    for (let r = 0; r < 8; r++) {
      const m = mesh(geo.box(0.42, 0.32, 0.05), themedMat(r < 3 ? 1 : r < 6 ? 0 : 3, 1.8), { x: -5.7 + c * 0.6, y: r * 0.42, castShadow: false });
      vuGroup.add(m);
      vu.push({ m, col: c });
    }
  }
  dyn.add(vuGroup);
  const clubSign = kit.signBoard('NIẾT BÀN CLUB', { width: 6, height: 0.9, bg: '#0b0814', border: '#ff4fd8', color: '#7ff6ff', depth: 0.04 });
  clubSign.position.set(0, 5.0, -D / 2 + 0.34);
  dyn.add(clubSign);

  // ── Quầy bar + kệ rượu phát sáng + trạm pha chế ──
  const counter = one('bar_counter');
  const barG = new THREE.Group();
  barG.add(box(1.4, 1.1, 14, '#3a2420', counter.x, 0.55, counter.z));
  barG.add(box(1.6, 0.08, 14.2, '#c9a064', counter.x, 1.14, counter.z));
  barG.add(mesh(geo.box(0.04, 0.12, 13.6), themedMat(0, 2.4), { x: counter.x + 0.72, y: 0.15, z: counter.z, castShadow: false }));
  for (const c of all('bar_counter_side')) {
    barG.add(box(c.kind === 'box' ? c.w : 1, 1.1, c.kind === 'box' ? c.d : 1, '#3a2420', c.x, 0.55, c.z));
    barG.add(box(c.kind === 'box' ? c.w + 0.1 : 1, 0.08, c.kind === 'box' ? c.d + 0.1 : 1, '#c9a064', c.x, 1.14, c.z));
  }
  const shelf = one('liquor_shelf');
  barG.add(box(0.8, 4.2, 14, '#1c1416', shelf.x, 2.1, shelf.z));
  for (const y of [1.3, 2.1, 2.9, 3.7]) {
    barG.add(box(0.85, 0.06, 13.6, '#2a2026', shelf.x + 0.05, y, shelf.z));
    barG.add(mesh(geo.box(0.05, 0.05, 13.4), themedMat(y > 2.5 ? 3 : 2, 1.8), { x: shelf.x + 0.42, y: y + 0.04, z: shelf.z, castShadow: false }));
  }
  statics.add(barG);
  const bottleColors = ['#7fff9f', '#ffd166', '#ff7a5a', '#9fd8ff', '#c39bff', '#ffffff', '#ff5ea8', '#6ad1a8'];
  for (const y of [1.33, 2.13, 2.93]) {
    for (let k = 0; k < 18; k++) {
      const col = bottleColors[(k * 7 + Math.round(y * 10)) % bottleColors.length]!;
      const bm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 });
      const z = shelf.z - 6.4 + k * 0.75;
      const b = new THREE.Group();
      b.position.set(shelf.x + 0.15, y, z);
      b.add(mesh(geo.cyl(0.1, 0.11, 0.42, 8), bm, { y: 0.21, castShadow: false }));
      b.add(mesh(geo.cyl(0.035, 0.05, 0.16, 6), bm, { y: 0.5, castShadow: false }));
      dyn.add(b);
    }
  }
  anchors.set('bar_counter_top', Object.assign(new THREE.Object3D(), { name: 'anchor:bar_counter_top' }));
  anchors.get('bar_counter_top')!.position.set(counter.x, 1.18, counter.z);
  dyn.add(anchors.get('bar_counter_top')!);
  for (const s of map.stations.filter((x) => x.kind === 'mix_station')) {
    const st = new THREE.Group();
    st.position.set(counter.x, 1.18, s.z);
    st.add(mesh(geo.box(1.0, 0.02, 0.9), mat('#2a2026'), { y: 0.01 }));
    for (let k = 0; k < 6; k++) {
      const col = bottleColors[k]!;
      st.add(mesh(geo.cyl(0.05, 0.06, 0.26, 7), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, roughness: 0.2 }), { x: -0.3, y: 0.13, z: -0.35 + k * 0.14 }));
    }
    st.add(mesh(geo.cyl(0.07, 0.065, 0.24, 10), mat('#d9dde3', { metalness: 0.7, roughness: 0.25 }), { x: 0.25, y: 0.12, z: 0.25 }));
    st.add(mesh(geo.lathe([[0.04, 0], [0.05, 0.01], [0.06, 0.16]], 10), mat('#e8f6ff', { transparent: true, opacity: 0.4, doubleSide: true }), { x: 0.3, z: -0.2, castShadow: false }));
    const label = kit.signBoard(`PHA CHẾ ${s.data?.index ?? ''}`, { width: 0.8, height: 0.2, bg: '#0b0814', border: '#3ef2ff', color: '#ffe14f', depth: 0.02 });
    label.position.set(0.55, -0.25, 0);
    label.rotation.y = Math.PI / 2;
    st.add(label);
    dyn.add(st);
  }
  const menu = kit.signBoard('🍺 BIA BỒ ĐỀ · 🍹 MOJITO NIẾT BÀN · 🍶 RƯỢU CẦN', { width: 4.2, height: 0.5, bg: '#0b0814', border: '#ffe14f', color: '#ffffff', depth: 0.03 });
  menu.position.set(-21.0, 4.6, -3);
  menu.rotation.y = Math.PI / 2;
  dyn.add(menu);

  // ── Khu VIP: dây nhung, sofa, biển VIP ──
  const brass = mat('#d4a64a', { metalness: 0.7, roughness: 0.3 });
  const velvet = mat('#8a1f3d', { roughness: 0.6 });
  for (const c of all('vip_rope')) {
    if (c.kind !== 'box') continue;
    const long = c.w > c.d;
    const len = long ? c.w : c.d;
    const n = Math.max(2, Math.round(len / 1.6) + 1);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i * len) / (n - 1);
      const px = long ? c.x + t : c.x;
      const pz = long ? c.z : c.z + t;
      statics.add(mesh(geo.cyl(0.05, 0.07, 1.0, 8), brass, { x: px, y: 0.5, z: pz }));
      statics.add(mesh(geo.sphere(0.08, 8, 6), brass, { x: px, y: 1.02, z: pz }));
      if (i < n - 1) {
        const seg = len / (n - 1);
        const rope = mesh(geo.torus(seg / 2, 0.035, 5, 10, Math.PI), velvet, { x: long ? px + seg / 2 : px, y: 0.95, z: long ? pz : pz + seg / 2, rz: Math.PI, ry: long ? 0 : Math.PI / 2, scale: [1, 0.35, 1] });
        statics.add(rope);
      }
    }
  }
  for (const c of all('sofa')) {
    if (c.kind !== 'box') continue;
    const sofa = new THREE.Group();
    sofa.position.set(c.x, 0, c.z);
    const plush = mat('#5b2a86', { roughness: 0.7 });
    sofa.add(mesh(geo.box(c.w, 0.45, c.d), plush, { y: 0.225 }));
    const backAlongX = c.w > c.d;
    sofa.add(mesh(geo.box(backAlongX ? c.w : 0.3, 0.9, backAlongX ? 0.3 : c.d), plush, { y: 0.6, x: backAlongX ? 0 : 0.45, z: backAlongX ? -0.45 : 0 }));
    for (let k = 0; k < 3; k++) sofa.add(mesh(geo.box(backAlongX ? c.w / 3.4 : 0.8, 0.14, backAlongX ? 0.8 : c.d / 3.4), mat('#7a3ab0'), { y: 0.5, x: backAlongX ? (k - 1) * (c.w / 3) : -0.1, z: backAlongX ? 0.1 : (k - 1) * (c.d / 3) }));
    statics.add(sofa);
  }
  const vipSign = kit.signBoard('VIP LOUNGE', { width: 3.2, height: 0.7, bg: '#1a0f05', border: '#ffd166', color: '#ffd166', depth: 0.04 });
  vipSign.position.set(17, 4.2, -D / 2 + 0.34);
  dyn.add(vipSign);
  const gateStand = new THREE.Group();
  gateStand.position.set(16.5, 0, -7.4);
  gateStand.add(mesh(geo.cyl(0.04, 0.06, 1.3, 6), brass, { y: 0.65 }));
  const gateSign = kit.signBoard('VIP', { width: 0.6, height: 0.3, bg: '#1a0f05', border: '#ffd166', color: '#ffd166', depth: 0.02 });
  gateSign.position.y = 1.4;
  gateStand.add(gateSign);
  statics.add(gateStand);
  for (let i = 0; i < 9; i++) dyn.add(mesh(geo.box(0.9, 4.2, 0.06), mat(i % 2 ? '#b8862f' : '#d4a64a', { metalness: 0.5, roughness: 0.35 }), { x: 12.8 + i * 1.0, y: 2.6, z: -D / 2 + 0.36, castShadow: false }));

  // ── Vòng quay sự thật: đĩa quay quanh trục Z cục bộ của neo ──
  const wheelC = one('truth_wheel');
  const wheelStand = new THREE.Group();
  wheelStand.position.set(wheelC.x, 0, wheelC.z);
  wheelStand.add(box(1.4, 0.15, 0.9, '#2a2030', 0, 0.075, 0));
  for (const s of [-1, 1]) wheelStand.add(box(0.12, 2.1, 0.12, '#c9a064', s * 0.55, 1.05, -0.15, { rz: s * -0.12 }));
  wheelStand.add(mesh(geo.cone(0.12, 0.3, 3), mat('#ff3b30', { emissive: '#ff3b30', emissiveIntensity: 0.6 }), { y: 3.55, z: 0.12, rx: Math.PI }));
  statics.add(wheelStand);
  const wheelAnchor = new THREE.Object3D();
  wheelAnchor.name = 'anchor:truth_wheel_disc';
  wheelAnchor.position.set(wheelC.x, 2.0, wheelC.z + 0.05);
  const wheelTex = kit.canvasTexture(512, 512, (c, w) => {
    const n = 12;
    const cx = w / 2;
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.moveTo(cx, cx);
      c.arc(cx, cx, cx - 6, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      c.closePath();
      c.fillStyle = i % 2 ? '#ff4fd8' : '#3ef2ff';
      if (i % 4 === 3) c.fillStyle = '#ffe14f';
      c.fill();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 4;
      c.stroke();
      c.save();
      c.translate(cx, cx);
      c.rotate(((i + 0.5) / n) * Math.PI * 2);
      c.fillStyle = '#1a1028';
      c.font = `800 26px ${kit.FONT_TITLE}`;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText(i % 2 ? 'SỰ THẬT' : 'THỬ THÁCH', cx - 24, 0);
      c.restore();
    }
    c.beginPath();
    c.arc(cx, cx, 46, 0, Math.PI * 2);
    c.fillStyle = '#1a1028';
    c.fill();
    c.fillStyle = '#ffe14f';
    c.font = `800 40px ${kit.FONT_TITLE}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('?', cx, cx + 2);
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), new THREE.MeshStandardMaterial({ map: wheelTex, emissive: '#ffffff', emissiveMap: wheelTex, emissiveIntensity: 0.35, roughness: 0.5 }));
  wheelAnchor.add(disc);
  wheelAnchor.add(mesh(geo.torus(1.42, 0.07, 8, 48), mat('#d4a64a', { metalness: 0.6, roughness: 0.3 })));
  const bulbs: THREE.MeshStandardMaterial[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const bm = neonMat(i % 2 ? '#ffe14f' : '#ffffff', 1.5);
    bulbs.push(bm);
    wheelAnchor.add(mesh(geo.sphere(0.05, 6, 4), bm, { x: Math.cos(a) * 1.52, y: Math.sin(a) * 1.52, z: 0.04, castShadow: false }));
  }
  dyn.add(wheelAnchor);
  anchors.set('truth_wheel_disc', wheelAnchor);

  // ── Bầu Cua: bàn nỉ xanh in 6 ô ──
  const bc = one('baucua_table');
  const bcG = new THREE.Group();
  bcG.position.set(bc.x, 0, bc.z);
  if (bc.kind === 'box') {
    bcG.add(box(bc.w, 0.8, bc.d, '#4a2a1a', 0, 0.4, 0));
    const mat6 = kit.canvasTexture(768, 480, (c, w, h) => {
      c.fillStyle = '#1f6a3a';
      c.fillRect(0, 0, w, h);
      const names = ['BẦU', 'CUA', 'TÔM', 'CÁ', 'GÀ', 'NAI'];
      const icons = ['🍐', '🦀', '🦐', '🐟', '🐓', '🦌'];
      const cols = ['#ffd166', '#ff7a5a', '#ff9fb3', '#7fd3ff', '#ffb347', '#c9a064'];
      for (let i = 0; i < 6; i++) {
        const x = (i % 3) * (w / 3);
        const y = Math.floor(i / 3) * (h / 2);
        c.fillStyle = cols[i]!;
        c.globalAlpha = 0.22;
        c.fillRect(x + 8, y + 8, w / 3 - 16, h / 2 - 16);
        c.globalAlpha = 1;
        c.strokeStyle = '#ffe9a8';
        c.lineWidth = 5;
        c.strokeRect(x + 8, y + 8, w / 3 - 16, h / 2 - 16);
        c.font = `110px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(icons[i]!, x + w / 6, y + h / 4 - 18);
        c.fillStyle = '#fff3c4';
        c.font = `800 38px ${kit.FONT_TITLE}`;
        c.fillText(names[i]!, x + w / 6, y + h / 2 - 34);
      }
    });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(bc.w - 0.1, bc.d - 0.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: mat6, roughness: 0.9 }));
    felt.position.y = 0.81;
    bcG.add(felt);
    bcG.add(mesh(geo.box(bc.w + 0.12, 0.08, bc.d + 0.12), mat('#c9a064'), { y: 0.78 }));
    const sign = kit.signBoard('BẦU CUA CÁ CỌP', { width: 2.6, height: 0.45, bg: '#7a1f12', border: '#ffd166', color: '#ffd166', depth: 0.03 });
    sign.position.set(0, 2.6, -bc.d / 2 - 0.2);
    bcG.add(sign);
    bcG.add(mesh(geo.cyl(0.05, 0.05, 2.5, 6), brass, { x: -1.2, y: 1.25, z: -bc.d / 2 - 0.2 }));
    bcG.add(mesh(geo.cyl(0.05, 0.05, 2.5, 6), brass, { x: 1.2, y: 1.25, z: -bc.d / 2 - 0.2 }));
  }
  statics.add(bcG);

  // ── Bàn khách NPC ──
  const tableTops: THREE.Vector3[] = [];
  for (const t of all('npc_table')) {
    const g = new THREE.Group();
    g.position.set(t.x, 0, t.z);
    g.add(mesh(geo.cyl(0.08, 0.12, 1.05, 8), mat('#2a2a36', { metalness: 0.5 }), { y: 0.52 }));
    g.add(mesh(geo.cyl(0.3, 0.38, 0.05, 12), mat('#2a2a36', { metalness: 0.5 }), { y: 0.03 }));
    g.add(mesh(geo.cyl(0.8, 0.8, 0.06, 20), mat('#3a2a44', { roughness: 0.35, metalness: 0.2 }), { y: 1.06 }));
    g.add(mesh(geo.torus(0.8, 0.025, 4, 24), themedMat(rng.int(0, 3), 1.6), { y: 1.06, rx: Math.PI / 2, castShadow: false }));
    const candle = neonMat('#ffb347', 0.9);
    g.add(mesh(geo.cyl(0.06, 0.06, 0.1, 8), mat('#e8f6ff', { transparent: true, opacity: 0.4 }), { y: 1.14, castShadow: false }));
    g.add(mesh(geo.sphere(0.03, 6, 4), candle, { y: 1.17, castShadow: false }));
    for (let k = 0; k < 2; k++) {
      const col = bottleColors[(k * 3 + tableTops.length) % bottleColors.length]!;
      g.add(mesh(geo.cyl(0.05, 0.04, 0.16, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }), { x: 0.3 - k * 0.55, y: 1.17, z: 0.2, castShadow: false }));
    }
    statics.add(g);
    tableTops.push(new THREE.Vector3(t.x, 1.1, t.z));
  }

  // ── Quầy đổi Đức + cửa Hồi Sơn ──
  const kiosk = one('exchange_kiosk');
  const kG = new THREE.Group();
  kG.position.set(kiosk.x, 0, kiosk.z);
  kG.add(box(2.6, 1.1, 0.9, '#2a1a10', 0, 0.55, 0));
  kG.add(box(2.7, 0.08, 1.0, '#d4a64a', 0, 1.14, 0));
  kG.add(box(2.6, 1.4, 0.08, '#1a1010', 0, 1.9, 0.42));
  kG.add(mesh(new THREE.PlaneGeometry(1.6, 0.8), mat('#9fd8ff', { transparent: true, opacity: 0.3 }), { y: 1.85, z: 0.37, ry: Math.PI, castShadow: false }));
  for (let i = 0; i < 5; i++) kG.add(mesh(geo.cyl(0.08, 0.08, 0.025 * (i + 1), 12), mat('#ffd166', { metalness: 0.7, roughness: 0.3 }), { x: -0.8 + i * 0.12, y: 1.18 + 0.0125 * (i + 1), z: -0.2 }));
  statics.add(kG);
  const exSign = kit.signBoard('ĐỔI ĐỨC → XU', { width: 2.4, height: 0.5, bg: '#0b0814', border: '#ffd166', color: '#ffe14f', depth: 0.03 });
  exSign.position.set(kiosk.x, 2.95, kiosk.z + 0.3);
  exSign.rotation.y = Math.PI;
  dyn.add(exSign);
  const door = new THREE.Group();
  door.position.set(0, 0, D / 2 - 0.32);
  door.add(box(3.2, 3.4, 0.12, '#5a3420', 0, 1.7, 0));
  door.add(box(0.06, 3.2, 0.14, '#3a2014', 0, 1.7, 0));
  for (const x of [-0.3, 0.3]) door.add(mesh(geo.sphere(0.06, 6, 4), mat('#d4a64a'), { x, y: 1.6, z: -0.1 }));
  door.add(box(3.6, 0.25, 0.3, '#3a2014', 0, 3.5, 0));
  statics.add(door);
  const exit = kit.signBoard('⛰ HỒI SƠN — VỀ CHÙA', { width: 3.6, height: 0.55, bg: '#0b0814', border: '#5cff8f', color: '#b8ffc9', depth: 0.03 });
  exit.position.set(0, 4.15, D / 2 - 0.36);
  exit.rotation.y = Math.PI;
  dyn.add(exit);
  for (const [text, x, y, color, border] of [
    ['XẢ NGHIỆP', -14, 4.2, '#ff7be5', '#ff4fd8'],
    ['TẠP NIỆM ĐỪNG LO', 14, 4.2, '#7ff6ff', '#3ef2ff'],
  ] as const) {
    const s = kit.signBoard(text, { width: 4.2, height: 0.6, bg: '#0b0814', border, color, depth: 0.03 });
    s.position.set(x, y, D / 2 - 0.36);
    s.rotation.y = Math.PI;
    dyn.add(s);
  }

  // ── Quả cầu disco + đèn quét (spot) + tia laser khi Drop ──
  const ball = new THREE.Group();
  ball.position.set(0, 4.7, 0);
  ball.add(mesh(geo.cyl(0.015, 0.015, 1.0, 4), metal, { y: 0.9 }));
  const mirror = mesh(new THREE.IcosahedronGeometry(0.62, 2), mat('#e8eef7', { metalness: 1, roughness: 0.12, flat: true }), { castShadow: false });
  ball.add(mirror);
  dyn.add(ball);
  const dots = new THREE.Group();
  const dotMat = glow('#ffffff', 0.55);
  for (let i = 0; i < 70; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = 3 + rng.next() * 11;
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6).rotateX(-Math.PI / 2), dotMat);
    d.position.set(Math.cos(a) * r, 0.15 + rng.next() * 0.02, Math.sin(a) * r * 0.75);
    dots.add(d);
  }
  dyn.add(dots);
  const spots: { light: THREE.SpotLight; cone: THREE.Mesh; base: THREE.Vector3; ph: number; slot: number }[] = [];
  for (const [x, z, slot] of [
    [-6, -6, 0],
    [6, -6, 1],
    [-6, 6, 2],
    [6, 6, 3],
  ] as const) {
    const light = new THREE.SpotLight(THEMES.neon[slot]!, 60, 16, 0.38, 0.5, 1.4);
    light.position.set(x, H - 0.6, z);
    light.target.position.set(x * 0.4, 0, z * 0.4);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, H - 0.6, 18, 1, true).translate(0, -(H - 0.6) / 2, 0), glow(THEMES.neon[slot]!, 0.07));
    cone.position.set(x, H - 0.6, z);
    dyn.add(cone);
    dyn.add(mesh(geo.cyl(0.18, 0.25, 0.4, 10), metal, { x, y: H - 0.55, z, castShadow: false }));
    spots.push({ light, cone, base: new THREE.Vector3(x, 0, z), ph: slot * 1.7, slot });
  }
  const lasers = new THREE.Group();
  lasers.visible = false;
  const laserMat = glow('#5cff8f', 0.55);
  for (let i = 0; i < 10; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 30, 4), laserMat);
    l.position.set(0, 4.8, -D / 2 + 1);
    l.rotation.x = Math.PI / 2 - 0.3;
    l.userData.a = (i / 10) * Math.PI - Math.PI / 2;
    lasers.add(l);
  }
  dyn.add(lasers);

  // ── Khách NPC: đứng quanh bàn + nhảy quanh mép sàn ──
  const npcs: { av: ReturnType<typeof createAvatar>; base: THREE.Vector3; ry: number; anim: 'idle' | 'dance' | 'dance2' | 'dance3' | 'clap' | 'cheer' | 'laugh' | 'drink'; ph: number }[] = [];
  const addNpc = (x: number, z: number, ry: number, anim: (typeof npcs)[number]['anim'], seed: number) => {
    const av = createAvatar(npcLook('bar_guest', seed));
    av.root.position.set(x, 0, z);
    av.root.rotation.y = ry;
    av.setAnim(anim);
    dyn.add(av.root);
    npcs.push({ av, base: new THREE.Vector3(x, 0, z), ry, anim, ph: seed * 0.7 });
  };
  map.colliders
    .filter((c) => c.tag === 'npc_table')
    .forEach((t, i) => {
      const away = t.z > 5 ? 1 : 0;
      const ang = away ? 0 : Math.PI / 2;
      addNpc(t.x + Math.sin(ang + 0.6) * 1.3, t.z + Math.cos(ang + 0.6) * 1.3, ang + Math.PI + 0.6, (['laugh', 'idle', 'clap', 'drink'] as const)[i % 4], 11 + i * 3);
      addNpc(t.x + Math.sin(ang - 0.6) * 1.3, t.z + Math.cos(ang - 0.6) * 1.3, ang + Math.PI - 0.6, (['idle', 'cheer', 'laugh', 'idle'] as const)[i % 4], 29 + i * 5);
    });
  for (const [x, z, a] of [
    [-8.6, -6.4, 'dance'],
    [8.6, -6.4, 'dance2'],
    [-8.6, 6.4, 'dance3'],
    [8.6, 6.4, 'dance'],
    [-4, -6.6, 'dance2'],
    [4, 6.6, 'dance3'],
  ] as const) {
    addNpc(x, z, Math.atan2(-x, -z), a, Math.round(x * 13 + z * 7));
  }
  const bartender = createAvatar(npcLook('bartender', 3));
  bartender.root.position.set(-19.3, 0, -3);
  bartender.root.rotation.y = Math.PI / 2;
  dyn.add(bartender.root);
  const dealer = createAvatar(npcLook('dealer', 8));
  dealer.root.position.set(bc.x + 2.4, 0, bc.z);
  dealer.root.rotation.y = -Math.PI / 2;
  dyn.add(dealer.root);

  // ── Điểm neo + nhóm trạm ──
  for (const [name, spec] of defaultAnchors(map)) {
    if (anchors.has(name)) continue;
    const o = new THREE.Object3D();
    o.name = `anchor:${name}`;
    o.position.set(spec.x, spec.y, spec.z);
    o.rotation.y = spec.ry ?? 0;
    dyn.add(o);
    anchors.set(name, o);
  }
  const stationGroups = new Map<string, THREE.Group>();
  for (const s of map.stations) {
    const g = new THREE.Group();
    g.name = `station:${s.id}`;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.ry;
    dyn.add(g);
    stationGroups.set(s.id, g);
  }

  root.add(kit.mergeStatic(statics, 'bar-static'));
  root.add(dyn);

  // ── Ánh sáng ──
  const hemi = new THREE.HemisphereLight('#7a6aff', '#1a0f2a', 0.9);
  const key = new THREE.DirectionalLight('#c8b8ff', 0.9);
  key.position.set(8, 24, 10);
  key.castShadow = true;
  const barLight = new THREE.PointLight('#ffb36b', 14, 14, 1.6);
  barLight.position.set(-18.5, 3.5, -3);
  const vipLight = new THREE.PointLight('#ffd166', 10, 12, 1.6);
  vipLight.position.set(17, 3.2, -12);
  const bcLight = new THREE.PointLight('#7fffb0', 8, 10, 1.6);
  bcLight.position.set(bc.x, 3, bc.z);
  const floorGlow = new THREE.PointLight('#ff4fd8', 12, 18, 1.5);
  floorGlow.position.set(0, 1.2, 0);

  // ── Nhịp: tự chạy 124 BPM khi chưa có DJ (onBeat từ mini-game ghi đè) ──
  let lastExternalBeat = -Infinity;
  let localBeat = 0;
  let localAcc = 0;
  let beatPulse = 0;
  let dropUntil = 0;
  let clock = 0;
  const applyTheme = (t: Theme) => {
    palette = THEMES[t].map((c) => new THREE.Color(c));
    for (const x of themed) {
      const c = palette[x.slot % palette.length]!;
      x.mat.color.copy(c);
      if (x.emissive && 'emissive' in x.mat) (x.mat as THREE.MeshStandardMaterial).emissive.copy(c);
    }
    spots.forEach((s) => {
      const c = palette[s.slot % palette.length]!;
      s.light.color.copy(c);
      (s.cone.material as THREE.MeshBasicMaterial).color.copy(c);
    });
    floorGlow.color.copy(palette[0]!);
  };
  const onBeat = (index: number) => {
    beatPulse = 1;
    const pattern = Math.floor(index / 8) % 4;
    for (const t of tiles) {
      let on = false;
      if (pattern === 0) on = (t.i + t.j + index) % 2 === 0;
      else if (pattern === 1) on = Math.round(Math.hypot(t.i - 3.5, t.j - 2.5)) === index % 5;
      else if (pattern === 2) on = t.i === index % 8 || t.i === 7 - (index % 8);
      else on = Math.sin(t.i * 12.9 + t.j * 78.2 + index * 37.7) > 0.3;
      if (on) {
        t.level = 1;
        t.color.copy(palette[(t.i + t.j + index) % palette.length]!);
      }
    }
  };

  return {
    root,
    stations: stationGroups,
    roofs: new Map(),
    anchors,
    environment: {
      background: new THREE.Color('#0b0814'),
      fog: new THREE.Fog('#140d24', 16, 62),
      lights: [hemi, key, barLight, vipLight, bcLight, floorGlow, ...spots.map((s) => s.light)],
    },
    controls: {
      onBeat(index) {
        lastExternalBeat = clock;
        onBeat(index);
      },
      drop() {
        dropUntil = clock + 3.2;
        beatPulse = 1.6;
        for (const t of tiles) {
          t.level = 1.4;
          t.color.set('#ffffff');
        }
      },
      setLightTheme(t) {
        applyTheme(t);
      },
    },
    update(dt, t) {
      clock = t;
      if (clock - lastExternalBeat > 2) {
        localAcc += dt;
        const beatLen = 60 / 124;
        while (localAcc >= beatLen) {
          localAcc -= beatLen;
          onBeat(localBeat++);
        }
      }
      beatPulse = Math.max(0, beatPulse - dt * 4);
      const dropping = clock < dropUntil;
      for (const tile of tiles) {
        tile.level = Math.max(0.06, tile.level - dt * 2.2);
        tile.mat.emissive.copy(tile.color).multiplyScalar(tile.level * (dropping ? 1.6 : 1));
      }
      const pump = 1 + beatPulse * 0.06;
      for (const sp of speakers) sp.scale.set(pump, 1 + beatPulse * 0.03, pump);
      for (const p of platters) p.rotation.y -= dt * 3.4;
      for (const v of vu) {
        const level = (Math.sin(t * 6 + v.col * 0.7) * 0.5 + 0.5) * 0.6 + beatPulse * 0.5 + (dropping ? 0.4 : 0);
        const row = Math.round(v.m.position.y / 0.42);
        v.m.visible = row / 8 < level;
      }
      ball.rotation.y += dt * (dropping ? 2.4 : 0.6);
      dots.rotation.y -= dt * (dropping ? 1.2 : 0.3);
      dotMat.opacity = 0.35 + beatPulse * 0.3;
      for (const s of spots) {
        const a = t * (dropping ? 2.2 : 0.7) + s.ph;
        s.light.target.position.set(s.base.x * 0.4 + Math.cos(a) * 4, 0, s.base.z * 0.4 + Math.sin(a * 1.3) * 3.5);
        s.light.target.updateMatrixWorld();
        s.cone.lookAt(s.light.target.position);
        s.cone.rotateX(-Math.PI / 2);
        s.light.intensity = 40 + beatPulse * 50;
        (s.cone.material as THREE.MeshBasicMaterial).opacity = 0.05 + beatPulse * 0.06;
      }
      lasers.visible = dropping;
      if (dropping) lasers.children.forEach((l, i) => (l.rotation.y = (l.userData.a as number) + Math.sin(t * 3 + i) * 0.4));
      floorGlow.intensity = 8 + beatPulse * 14;
      bulbs.forEach((b, i) => (b.emissiveIntensity = ((i + Math.floor(t * 4)) % 2 ? 2.2 : 0.4)));
      for (const n of npcs) {
        n.av.update(dt, t, 0);
        if (n.anim === 'idle') n.av.root.position.y = Math.abs(Math.sin(t * 4.1 + n.ph)) * 0.04 * (1 + beatPulse);
      }
      bartender.setAnim(Math.sin(t * 0.3) > 0.2 ? 'shake' : 'idle');
      bartender.update(dt, t, 0);
      dealer.setAnim(Math.sin(t * 0.25 + 1) > 0.6 ? 'clap' : 'idle');
      dealer.update(dt, t, 0);
    },
    dispose() {
      for (const n of npcs) n.av.dispose();
      bartender.dispose();
      dealer.dispose();
      kit.disposeTree(root);
    },
  };
};
