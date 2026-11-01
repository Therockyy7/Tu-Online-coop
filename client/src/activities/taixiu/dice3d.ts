// Mô hình đồ động bàn Tài Xỉu (dựng bằng code, không asset ngoài): xúc xắc chấm (mặt 1 và 4 chấm đỏ), đĩa sứ viền lam,
// bát úp men lam kiểu gốm Bát Tràng. Kích thước phóng to hơn đồ thật để đứng cách bàn 1–2 m vẫn đọc được mặt xúc xắc.
import * as THREE from 'three';
import { kit } from '../../art/kit';

export const DIE = 0.06;
export const PLATE_R = 0.25;
/** Độ cao mặt đĩa (so với mặt nỉ). */
export const PLATE_TOP = 0.022;
export const BOWL_R = 0.205;
export const BOWL_H = 0.165;

const BLUE = '#1f4e9c';

/** Vị trí chấm trên lưới 3×3 (0 = góc trên trái, 4 = giữa, 8 = góc dưới phải) của từng mặt. */
export const PIPS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Mặt xúc xắc ứng với thứ tự vật liệu BoxGeometry (+x, −x, +y, −y, +z, −z); mặt đối diện cộng lại = 7. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5] as const;
/** Góc Euler (x, y, z) đưa mặt `v` lên trên (+Y). */
export const UP_EULER: Record<number, readonly [number, number, number]> = {
  1: [0, 0, 0],
  6: [Math.PI, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  2: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0],
};

function dieFaceTexture(v: number): THREE.CanvasTexture {
  return kit.canvasTexture(128, 128, (c, w, h) => {
    // Nền ngà, tối dần ra mép giả cạnh bo tròn.
    const g = c.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.74);
    g.addColorStop(0, '#fffdf6');
    g.addColorStop(1, '#ddd3bd');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    c.fillStyle = v === 1 || v === 4 ? '#c8211b' : '#1b1b1f';
    const r = v === 1 ? w * 0.16 : w * 0.085;
    for (const i of PIPS[v]!) {
      c.beginPath();
      c.arc((0.24 + (i % 3) * 0.26) * w, (0.24 + Math.floor(i / 3) * 0.26) * h, r, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** 6 vật liệu mặt xúc xắc dùng chung cho cả 3 viên (dọn bằng kit.disposeTree). */
export function dieMaterials(): THREE.MeshStandardMaterial[] {
  return FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: dieFaceTexture(v), roughness: 0.42 }));
}

export function makeDie(mats: THREE.Material[]): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(DIE, DIE, DIE), mats);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Men lam quanh thân bát (u chạy vòng quanh, v từ miệng bát v = 0 lên đáy bát v = 1). */
function bowlTexture(): THREE.CanvasTexture {
  return kit.canvasTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#fbfaf5';
    c.fillRect(0, 0, w, h);
    c.fillStyle = BLUE;
    c.fillRect(0, h - 10, w, 6); // viền miệng bát
    c.fillRect(0, h - 22, w, 2);
    c.fillRect(0, 26, w, 2);
    c.fillRect(0, 0, w, 12); // chân đế
    // Dải mây lam giữa thân.
    c.strokeStyle = BLUE;
    c.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const x = (i + 0.5) * (w / 8);
      const y = h * 0.55;
      c.beginPath();
      c.arc(x - 10, y, 10, Math.PI, Math.PI * 2);
      c.arc(x + 10, y, 10, Math.PI, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(x, y + 4, 5, 0, Math.PI * 2);
      c.stroke();
    }
  });
}

/** Bát úp (miệng bát ở y = 0, đáy bát hướng lên). Hai mặt để lúc nhấc nghiêng vẫn thấy lòng bát. */
export function makeBowl(): THREE.Mesh {
  const geo = kit.geo.lathe(
    [
      [BOWL_R, 0],
      [BOWL_R - 0.002, 0.02],
      [BOWL_R - 0.01, 0.05],
      [BOWL_R - 0.027, 0.085],
      [BOWL_R - 0.055, 0.115],
      [0.11, 0.138],
      [0.075, 0.148],
      [0.075, BOWL_H],
      [0, BOWL_H],
    ],
    36,
  );
  const mat = new THREE.MeshStandardMaterial({ map: bowlTexture(), roughness: 0.28, side: THREE.DoubleSide });
  return kit.mesh(geo, mat, { y: PLATE_TOP, name: 'taixiu_bowl' });
}

/** Đĩa sứ trắng, viền lam ở mép + một vòng lam bên trong. */
export function makePlate(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'taixiu_plate';
  const porcelain = new THREE.MeshStandardMaterial({ color: '#fbfaf5', roughness: 0.3 });
  const blue = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.35 });
  g.add(kit.mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R * 0.86, PLATE_TOP, 40), porcelain, { y: PLATE_TOP / 2 }));
  g.add(kit.mesh(new THREE.TorusGeometry(PLATE_R - 0.012, 0.007, 6, 44), blue, { y: PLATE_TOP, rx: Math.PI / 2 }));
  g.add(kit.mesh(new THREE.TorusGeometry(0.15, 0.003, 4, 40), blue, { y: PLATE_TOP + 0.0005, rx: Math.PI / 2, castShadow: false }));
  return g;
}
