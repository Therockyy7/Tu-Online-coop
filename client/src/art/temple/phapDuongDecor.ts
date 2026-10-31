// Đại Pháp Đường — chi tiết trang trí dùng chung: bảng màu, vàng thếp, texture vẽ bằng canvas (ô trần hoa sen, diềm chạm
// thủng, phướn lụa, quầng sáng, tia hào quang, vệt nắng), rồng vàng cuốn cột (thân ống thuôn dần theo đường xoắn),
// đèn chùm hoa sen vàng và phướn treo dưới xà. Phần đứng yên vào nhóm tĩnh (gộp mesh), phần sáng/động vào nhóm động.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { kit } from '../kit';
import type { TempleCtx } from './ctx';

const { geo, mat, mesh } = kit;

/** Bảng màu Đại Pháp Đường — màu gỗ/đá/trát/vải trùng bảng PBR nên tự có texture tả thực. */
export const PD = {
  lacquer: '#8a1f14',
  lacquerDeep: '#7a1d12',
  lacquerDark: '#521008',
  dado: '#4a2a1a',
  frame: '#5a321f',
  plaster: '#d6b57a',
  stone: '#bdb4a3',
  stoneLight: '#cfc8ba',
  stoneDark: '#a8a092',
  fabricRed: '#9b2a1f',
  fabricSaffron: '#c27a2c',
  straw: '#b8955a',
  gold: '#e3b04b',
  goldBright: '#ffd166',
  ink: '#1f120a',
  bronze: '#8a6233',
  wax: '#f4e2bf',
};

/** Vàng thếp: ánh kim vừa phải + chút tự sáng để không xỉn trong điện (IBL bị giảm khi ở trong nhà). */
export function gilt(bright = false): THREE.MeshStandardMaterial {
  return bright
    ? mat(PD.goldBright, { metalness: 0.5, roughness: 0.32, emissive: '#7a5214', emissiveIntensity: 0.55 })
    : mat(PD.gold, { metalness: 0.55, roughness: 0.36, emissive: '#5a3a0c', emissiveIntensity: 0.5 });
}

/** Texture quầng sáng tròn mềm (quầng đèn, hào quang, vũng sáng). */
export function radialTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
}

/** Texture vệt nắng: sáng ở đầu cửa sổ, mờ dần xuống sàn, hai mép mềm. */
export function shaftTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(64, 256, (c, w, h) => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const v = y / (h - 1);
      const along = Math.pow(1 - v, 1.2) * Math.min(1, v / 0.05 + 0.3);
      for (let x = 0; x < w; x++) {
        const edge = Math.pow(Math.sin((Math.PI * x) / (w - 1)), 1.6);
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(255 * along * edge);
      }
    }
    c.putImageData(img, 0, 0);
  });
}

/** Texture vệt nắng in trên sàn: ô cửa có song gỗ, mép mềm. */
export function patchTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(256, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.85)';
    for (let k = 1; k < 9; k++) c.fillRect((k * w) / 9 - 4, 0, 8, h);
  });
}

/** Một ô trần (lặp theo UV, mỗi ô = 1 lần lặp): nền son thẫm, viền vàng kép, hoa sen tám cánh thếp vàng ở giữa. */
export function cofferTexture(): THREE.CanvasTexture {
  const tex = kit.canvasTexture(256, 256, (c, w, h) => {
    const bg = c.createRadialGradient(w / 2, h / 2, w * 0.06, w / 2, h / 2, w * 0.7);
    bg.addColorStop(0, '#a8361e');
    bg.addColorStop(0.6, '#7a1d12');
    bg.addColorStop(1, '#4e0f08');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9a441';
    c.lineWidth = 9;
    c.strokeRect(26, 26, w - 52, h - 52);
    c.strokeStyle = '#ffd98a';
    c.lineWidth = 3;
    c.strokeRect(40, 40, w - 80, h - 80);
    // Hoa văn góc: cánh hoa nhỏ chĩa vào giữa ô.
    c.fillStyle = '#e3b04b';
    for (const [x, y] of [
      [40, 40],
      [w - 40, 40],
      [40, h - 40],
      [w - 40, h - 40],
    ]) {
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(h / 2 - y, w / 2 - x));
      c.beginPath();
      c.ellipse(15, 0, 15, 5.5, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    // Hoa sen giữa ô: vòng cánh ngoài, vòng cánh trong lệch pha, đài sen có hạt.
    c.save();
    c.translate(w / 2, h / 2);
    const petals = (n: number, r: number, rw: number, rh: number, col: string, off: number) => {
      c.fillStyle = col;
      for (let i = 0; i < n; i++) {
        c.save();
        c.rotate(off + (i / n) * Math.PI * 2);
        c.beginPath();
        c.ellipse(0, -r, rw, rh, 0, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
    };
    petals(8, 50, 17, 33, '#c98a2e', 0);
    petals(8, 48, 12, 26, '#f2c45e', 0);
    petals(8, 29, 11, 21, '#ffe29a', Math.PI / 8);
    c.fillStyle = '#7a1d12';
    c.beginPath();
    c.arc(0, 0, 15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#ffd166';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.arc(Math.cos(a) * 8, Math.sin(a) * 8, 2.6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Diềm chạm thủng lặp ngang: hoa văn "đồng tiền" lồng nhau, lõi son viền chỉ vàng, nền trong suốt (dùng alphaTest). */
export function fretworkTexture(): THREE.CanvasTexture {
  const tex = kit.canvasTexture(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const coin = (x: number, y: number) => {
      c.beginPath();
      c.arc(x, y, w * 0.36, 0, Math.PI * 2);
      c.stroke();
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      c.strokeRect(-w * 0.09, -w * 0.09, w * 0.18, w * 0.18);
      c.restore();
    };
    for (const [col, lw] of [
      ['#6e1a10', 26],
      ['#e3b04b', 9],
    ] as const) {
      c.strokeStyle = col;
      c.lineWidth = lw;
      coin(w / 2, h / 2);
      for (const [x, y] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ]) {
        coin(x, y);
      }
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Texture hào quang: tia vàng toả từ tâm trên nền cam vàng, sáng dần vào giữa. */
export function raysTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#fff4c8');
    g.addColorStop(0.45, '#f5c25a');
    g.addColorStop(1, '#c8761c');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.translate(w / 2, h / 2);
    for (let i = 0; i < 48; i++) {
      c.rotate((Math.PI * 2) / 48);
      c.fillStyle = i % 2 ? 'rgba(255,240,190,0.35)' : 'rgba(150,80,10,0.2)';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-7, -w);
      c.lineTo(7, -w);
      c.closePath();
      c.fill();
    }
  });
}

/** Phướn lụa vàng: diềm son răng cưa trên đầu, viền đỏ, hoa sen, hàng chữ dọc; đuôi én cắt trong suốt (alphaTest). */
export function bannerTexture(text: string): THREE.CanvasTexture {
  return kit.canvasTexture(128, 704, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const tail = 72;
    const body = h - tail;
    const silk = c.createLinearGradient(0, 0, w, 0);
    silk.addColorStop(0, '#d38a26');
    silk.addColorStop(0.5, '#f2bd4e');
    silk.addColorStop(1, '#d38a26');
    c.fillStyle = silk;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(w / 2, body + 6);
    c.lineTo(0, h);
    c.closePath();
    c.fill();
    c.fillStyle = '#9b2a1f';
    c.fillRect(0, 0, 9, body);
    c.fillRect(w - 9, 0, 9, body);
    c.fillRect(0, 0, w, 62);
    c.fillStyle = '#e3b04b';
    c.fillRect(0, 54, w, 6);
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo((i * w) / 4, 60);
      c.lineTo(((i + 0.5) * w) / 4, 84);
      c.lineTo(((i + 1) * w) / 4, 60);
      c.fill();
    }
    // Hoa sen thêu dưới diềm.
    c.save();
    c.translate(w / 2, 128);
    c.fillStyle = '#c0392b';
    for (let i = -2; i <= 2; i++) {
      c.save();
      c.rotate(i * 0.42);
      c.beginPath();
      c.ellipse(0, -14, 9, 20, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.arc(0, 4, 7, 0, Math.PI * 2);
    c.fill();
    c.restore();
    const words = text.split(' ');
    const top = 168;
    const bottom = body - 24;
    const step = (bottom - top) / words.length;
    const size = Math.min(w * 0.3, step * 0.62);
    c.font = `800 ${size}px ${kit.FONT_TITLE}`;
    c.fillStyle = '#7a160e';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    words.forEach((wd, i) => c.fillText(wd, w / 2, top + (i + 0.5) * step, w - 26));
    c.fillStyle = '#9b2a1f';
    c.fillRect(0, body - 12, w, 7);
  });
}

/** Ống dọc đường cong có bán kính đổi theo t ∈ [0, 1] (thân rồng thuôn dần về đuôi). */
function taperTube(curve: THREE.Curve<THREE.Vector3>, segs: number, radial: number, radius: (t: number) => number): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    const r = radius(t);
    const N = frames.normals[i]!;
    const B = frames.binormals[i]!;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a);
      const co = -Math.cos(a);
      n.set(co * N.x + s * B.x, co * N.y + s * B.y, co * N.z + s * B.z).normalize();
      nor.push(n.x, n.y, n.z);
      pos.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Thanh tròn nối hai điểm (dây, cần đèn). */
export function rod(g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 5): void {
  const len = a.distanceTo(b);
  const m0 = mesh(geo.cyl(r, r, len, seg), m, { castShadow: false });
  m0.position.copy(a).add(b).multiplyScalar(0.5);
  m0.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  g.add(m0);
}

/**
 * Rồng vàng cuốn cột: thân ống thuôn về đuôi quấn xoắn quanh cột (tâm `x, z`, bán kính `r`) từ `y0` lên `y1`, vây lưng
 * nhọn, chân bám cột, đầu ngóc ra hướng ngang `face` ngậm ngọc. Toàn bộ là mesh tĩnh (để gộp), toạ độ thế giới.
 */
export function coilingDragon(g: THREE.Group, x: number, z: number, r: number, y0: number, y1: number, face: THREE.Vector3, spin: 1 | -1): void {
  const gold = mat(PD.gold, { metalness: 0.6, roughness: 0.3, emissive: '#5a3a0c', emissiveIntensity: 0.55, surface: 'carved' });
  const goldLight = gilt(true);
  const turns = 2.25;
  const R = r + 0.19;
  const endA = Math.atan2(face.z, face.x);
  const pts: THREE.Vector3[] = [];
  const n = 54;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = endA - spin * turns * Math.PI * 2 * (1 - t);
    const rr = R + 0.05 * Math.sin(t * 23);
    pts.push(new THREE.Vector3(x + Math.cos(a) * rr, y0 + (y1 - y0) * t + 0.07 * Math.sin(t * 17), z + Math.sin(a) * rr));
  }
  const end = pts[pts.length - 1]!.clone();
  pts.push(end.clone().addScaledVector(face, 0.42).add(new THREE.Vector3(0, 0.34, 0)));
  pts.push(end.clone().addScaledVector(face, 0.82).add(new THREE.Vector3(0, 0.46, 0)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const radius = (t: number) => 0.035 + 0.135 * smooth(0, 0.3, t) + 0.025 * smooth(0.3, 0.75, t) - 0.03 * smooth(0.86, 0.96, t);
  g.add(mesh(taperTube(curve, 230, 10, radius), gold));

  // Vây lưng (hướng ra xa trục cột) + chân bám cột.
  const p = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let t = 0.06; t < 0.9; t += 0.024) {
    curve.getPointAt(t, p);
    out.set(p.x - x, 0, p.z - z).normalize();
    const fin = mesh(geo.cone(0.045, 0.17, 4), goldLight, { castShadow: false });
    fin.position.copy(p).addScaledVector(out, radius(t) * 0.85);
    fin.quaternion.setFromUnitVectors(UP, out.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize());
    g.add(fin);
  }
  for (const t of [0.34, 0.58, 0.8]) {
    curve.getPointAt(t, p);
    out.set(p.x - x, 0, p.z - z).normalize();
    const foot = p.clone().addScaledVector(out, -0.2).add(new THREE.Vector3(0, -0.12, 0));
    rod(g, p, foot, 0.045, gold, 6);
    for (const da of [-0.5, 0, 0.5]) {
      const claw = mesh(geo.cone(0.022, 0.11, 4), goldLight, { castShadow: false });
      const dir = out.clone().negate().applyAxisAngle(UP, da).add(new THREE.Vector3(0, -0.6, 0)).normalize();
      claw.position.copy(foot).addScaledVector(dir, 0.05);
      claw.quaternion.setFromUnitVectors(UP, dir);
      g.add(claw);
    }
  }

  // Đầu rồng: sọ, mõm, hàm dưới há, sừng, bờm, mắt; ngậm ngọc phía trước.
  const tip = curve.getPointAt(1);
  const tan = curve.getTangentAt(1);
  const head = new THREE.Group();
  head.position.copy(tip);
  head.lookAt(tip.clone().add(tan));
  head.scale.setScalar(1.3);
  head.add(mesh(geo.sphere(0.2, 14, 10), gold, { scale: [1, 0.85, 1.3] }));
  head.add(mesh(geo.sphere(0.14, 12, 8), gold, { y: -0.02, z: 0.26, scale: [0.85, 0.7, 1.6] }));
  head.add(mesh(geo.sphere(0.08, 10, 8), goldLight, { y: 0.05, z: 0.47 }));
  head.add(mesh(geo.sphere(0.11, 10, 8), gold, { y: -0.16, z: 0.22, rx: 0.3, scale: [0.75, 0.45, 1.6] }));
  for (const s of [1, -1]) {
    head.add(mesh(geo.cone(0.035, 0.44, 6), goldLight, { x: s * 0.09, y: 0.2, z: -0.12, rx: -1.1, rz: s * 0.25 }));
    head.add(mesh(geo.sphere(0.035, 8, 6), mat('#b3261a', { emissive: '#7a0a04', emissiveIntensity: 0.6 }), { x: s * 0.12, y: 0.09, z: 0.15 }));
    head.add(mesh(geo.cone(0.014, 0.55, 4), goldLight, { x: s * 0.1, y: -0.02, z: 0.42, rx: -1.25, rz: s * 0.9, castShadow: false }));
  }
  for (let k = 0; k < 4; k++) head.add(mesh(geo.cone(0.06, 0.3, 5), gold, { x: (k - 1.5) * 0.08, y: 0.08 + (k % 2) * 0.06, z: -0.22, rx: -1.35 }));
  g.add(head);
  const pearlAt = tip.clone().addScaledVector(tan, 0.95);
  g.add(mesh(geo.sphere(0.14, 14, 10), mat('#fff1c2', { emissive: '#ffcf6a', emissiveIntensity: 1.1 }), { x: pearlAt.x, y: pearlAt.y, z: pearlAt.z }));
  for (let k = 0; k < 5; k++) {
    g.add(mesh(geo.cone(0.05, 0.22, 5), goldLight, { x: pearlAt.x, y: pearlAt.y + 0.17, z: pearlAt.z, rz: (k - 2) * 0.4, castShadow: false }));
  }
}

/** Gộp các bản sao của một hình đã dịch tới các vị trí (bóng đèn, hạt) thành một hình duy nhất. */
export function scatterGeometry(base: THREE.BufferGeometry, at: THREE.Vector3[]): THREE.BufferGeometry {
  const parts = at.map((p) => base.clone().translate(p.x, p.y, p.z));
  const merged = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return merged;
}

const CARD = new THREE.PlaneGeometry(1, 1);

/**
 * Quầng sáng luôn quay mặt về camera (thay cho Sprite), cạnh `size`: mesh phẳng vật liệu trong suốt nên lớp AO màn hình
 * bỏ qua như mọi hiệu ứng khác — Sprite lọt vào lượt vẽ pháp tuyến của AO thành tấm phẳng cố định, sinh mảng tối hình
 * thang quanh đèn. Đặt trong nhóm không xoay (nhóm động của điện).
 */
export function glowCard(m: THREE.Material, size: number): THREE.Mesh {
  const card = new THREE.Mesh(CARD, m);
  card.scale.setScalar(size);
  card.onBeforeRender = (_r, _s, camera) => {
    card.quaternion.copy(camera.quaternion);
    card.updateMatrixWorld();
  };
  return card;
}

/**
 * Đèn chùm hoa sen vàng: xích từ trần, vương miện, cần nối, bát sen úp, hai vòng cánh sen; bóng đèn sáng trên mép
 * cánh + quầng sáng (nhóm động, `glow` = vật liệu cộng màu trong suốt). `y` = độ cao mép bát sen.
 */
export function lotusChandelier(stat: THREE.Group, dyn: THREE.Group, x: number, y: number, z: number, ceilY: number, bulb: THREE.Material, glow: THREE.Material): void {
  const gold = gilt();
  const goldLight = gilt(true);
  const crownY = y + 1.25;
  stat.add(mesh(geo.cyl(0.035, 0.035, ceilY - crownY, 6), gold, { x, y: (ceilY + crownY) / 2, z, castShadow: false }));
  stat.add(mesh(geo.torus(0.42, 0.04, 6, 24), goldLight, { x, y: crownY, z, rx: Math.PI / 2 }));
  stat.add(mesh(geo.sphere(0.13, 12, 8), goldLight, { x, y: crownY + 0.12, z }));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    rod(stat, new THREE.Vector3(x + Math.cos(a) * 0.42, crownY, z + Math.sin(a) * 0.42), new THREE.Vector3(x + Math.cos(a) * 1.12, y + 0.04, z + Math.sin(a) * 1.12), 0.018, gold);
  }
  const bowl = geo.lathe(
    [
      [0.02, -0.95],
      [0.18, -0.9],
      [0.5, -0.66],
      [0.86, -0.36],
      [1.12, -0.1],
      [1.2, 0.02],
    ],
    28,
  );
  stat.add(mesh(bowl, gold, { x, y, z }));
  stat.add(mesh(geo.torus(1.2, 0.045, 6, 40), goldLight, { x, y: y + 0.02, z, rx: Math.PI / 2 }));
  const petal = geo.sphere(0.32, 10, 6);
  const ring = (count: number, rr: number, dy: number, tilt: number, sc: [number, number, number], m: THREE.Material, off: number) => {
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(x + Math.cos(a) * rr, y + dy, z + Math.sin(a) * rr);
      pivot.rotation.y = Math.PI / 2 - a;
      pivot.add(mesh(petal, m, { z: 0.24, rx: tilt, scale: sc, castShadow: false }));
      stat.add(pivot);
    }
  };
  ring(14, 1.12, 0.05, -0.55, [0.42, 0.09, 1], gold, 0);
  ring(10, 0.72, 0.12, -1.0, [0.36, 0.08, 0.75], goldLight, Math.PI / 10);
  stat.add(mesh(geo.sphere(0.12, 10, 8), goldLight, { x, y: y - 0.95, z }));
  stat.add(mesh(geo.cone(0.09, 0.34, 8), gold, { x, y: y - 1.18, z, rx: Math.PI }));

  // Bóng đèn trên đầu cánh ngoài + vòng nến trong lòng sen (một mesh, vật liệu nhấp nháy dùng chung).
  const at: THREE.Vector3[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    at.push(new THREE.Vector3(x + Math.cos(a) * 1.58, y + 0.24, z + Math.sin(a) * 1.58));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    at.push(new THREE.Vector3(x + Math.cos(a) * 0.45, y + 0.3, z + Math.sin(a) * 0.45));
  }
  dyn.add(mesh(scatterGeometry(geo.sphere(0.075, 8, 6), at), bulb, { castShadow: false, receiveShadow: false }));
  const halo = glowCard(glow, 5.2);
  halo.position.set(x, y + 0.15, z);
  dyn.add(halo);
}

/** Một phướn treo: tâm thanh treo `x, z`, chữ thêu `text`. */
export interface BannerSpec {
  x: number;
  z: number;
  text: string;
}

/** Phướn lụa treo dưới xà (mặt hướng ±Z), đỉnh ở `top`, dài `len`; đung đưa rất nhẹ. Thanh treo vàng vào nhóm tĩnh. */
export function hangingBanners(ctx: TempleCtx, stat: THREE.Group, dyn: THREE.Group, items: BannerSpec[], top: number, len: number, width: number): void {
  const mats = new Map<string, THREE.Material>();
  const geom = new THREE.PlaneGeometry(width, len, 1, 6).translate(0, -len / 2, 0);
  const pivots: THREE.Object3D[] = [];
  for (const it of items) {
    let m = mats.get(it.text);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ map: bannerTexture(it.text), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
      mats.set(it.text, m);
    }
    const pivot = new THREE.Group();
    pivot.position.set(it.x, top - 0.1, it.z);
    pivot.add(mesh(geom, m, { castShadow: false }));
    dyn.add(pivot);
    pivots.push(pivot);
    stat.add(mesh(geo.cyl(0.035, 0.035, width + 0.26, 8), gilt(), { x: it.x, y: top - 0.07, z: it.z, rz: Math.PI / 2, castShadow: false }));
    for (const s of [-1, 1]) stat.add(mesh(geo.sphere(0.06, 8, 6), gilt(true), { x: it.x + s * (width / 2 + 0.15), y: top - 0.07, z: it.z, castShadow: false }));
  }
  ctx.updates.push((_dt, t) => {
    // Vòng for thường: không tạo hàm mới mỗi khung hình.
    for (let i = 0; i < pivots.length; i++) {
      const p = pivots[i]!;
      p.rotation.x = Math.sin(t * 0.55 + i * 1.7) * 0.022;
      p.rotation.z = Math.sin(t * 0.4 + i) * 0.01;
    }
  });
}
