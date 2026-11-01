// Lá bài 3D dùng chung cho Xì Dách và Bài Cào: mặt vẽ canvas (cache theo lá), lưng đỏ viền vàng, bay theo cung + lật.
// Lá nằm phẳng trên bàn: mặt trước ở +Y; úp = quay π quanh trục Z cục bộ. Module trò tự add `root` vào scene, gọi
// update(dt) mỗi khung hình và dispose() khi dọn bàn (chất liệu/texture dùng chung không bị hủy).
import * as THREE from 'three';
import { SUIT_RED, SUIT_SYMBOL, isFace, rankLabel, type Card } from '@shared/activities/cards';
import { kit } from '../../art/kit';

export const CARD_W = 0.13;
export const CARD_H = 0.18;
const THICK = 0.003;

const geo = new THREE.BoxGeometry(CARD_W, THICK, CARD_H);
const edgeMat = new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.7 });
const faceMats = new Map<string, THREE.MeshStandardMaterial>();
let backMat: THREE.MeshStandardMaterial | null = null;

const keyOf = (c: Card) => `${c.r}${c.s}`;

function faceMat(c: Card): THREE.MeshStandardMaterial {
  let m = faceMats.get(keyOf(c));
  if (m) return m;
  const color = SUIT_RED[c.s] ? '#c8322a' : '#1b1b1f';
  const tex = kit.canvasTexture(128, 178, (g, w, h) => {
    g.fillStyle = '#fffdf8';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9bda5';
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 30px ${kit.FONT_TITLE}`;
    g.fillText(rankLabel(c.r), 22, 24);
    g.font = '24px serif';
    g.fillText(SUIT_SYMBOL[c.s], 22, 50);
    g.save();
    g.translate(w - 22, h - 24);
    g.rotate(Math.PI);
    g.font = `800 30px ${kit.FONT_TITLE}`;
    g.fillText(rankLabel(c.r), 0, 0);
    g.font = '24px serif';
    g.fillText(SUIT_SYMBOL[c.s], 0, -26);
    g.restore();
    if (isFace(c)) {
      g.fillStyle = SUIT_RED[c.s] ? '#fbe3c8' : '#e3e8f4';
      g.fillRect(34, 40, w - 68, h - 80);
      g.strokeStyle = '#d4a64a';
      g.lineWidth = 3;
      g.strokeRect(34, 40, w - 68, h - 80);
      g.fillStyle = color;
      g.font = `800 52px ${kit.FONT_TITLE}`;
      g.fillText(rankLabel(c.r), w / 2, h / 2 - 6);
      g.font = '22px serif';
      g.fillText('♛', w / 2, h / 2 + 30);
    } else {
      g.font = '64px serif';
      g.fillText(SUIT_SYMBOL[c.s], w / 2, h / 2 + 4);
    }
  });
  m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  faceMats.set(keyOf(c), m);
  return m;
}

function getBackMat(): THREE.MeshStandardMaterial {
  if (backMat) return backMat;
  const tex = kit.canvasTexture(128, 178, (g, w, h) => {
    g.fillStyle = '#fffdf8';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a5231b';
    g.fillRect(8, 8, w - 16, h - 16);
    g.strokeStyle = '#ffd166';
    g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 12) {
      g.beginPath();
      g.moveTo(i, 8);
      g.lineTo(i + h, h - 8);
      g.stroke();
    }
    g.strokeStyle = '#ffd166';
    g.lineWidth = 4;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#ffd166';
    g.font = `800 22px ${kit.FONT_TITLE}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TU', w / 2, h / 2 - 12);
    g.fillText('ONLINE', w / 2, h / 2 + 14);
  });
  backMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  return backMat;
}

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  ry0: number;
  ry1: number;
  flip0: number;
  flip1: number;
  t: number;
  dur: number;
  delay: number;
}

/** Một lá bài 3D. `card` null = lá úp chưa biết mặt (vd lá tẩy nhà cái). */
export class Card3D {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private tween: Tween | null = null;
  card: Card | null = null;

  constructor(card: Card | null, faceUp = false) {
    this.mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, edgeMat, edgeMat]);
    this.mesh.castShadow = true;
    this.root.add(this.mesh);
    this.setCard(card);
    this.root.rotation.z = faceUp ? 0 : Math.PI;
  }

  /** Đổi mặt lá (vd server vừa lật lá tẩy). */
  setCard(card: Card | null): void {
    this.card = card;
    const mats = this.mesh.material as THREE.Material[];
    mats[2] = card ? faceMat(card) : getBackMat();
    mats[3] = getBackMat();
  }

  /** Đặt ngay (không hoạt ảnh) tại vị trí thế giới, hướng ry, ngửa/úp. */
  place(at: THREE.Vector3, ry: number, faceUp: boolean): void {
    this.tween = null;
    this.root.position.copy(at);
    this.root.rotation.set(0, ry, faceUp ? 0 : Math.PI);
  }

  /** Bay theo cung tới `to` trong `ms` (sau `delayMs`), quay về ry, kết thúc ngửa/úp. */
  moveTo(to: THREE.Vector3, ry: number, faceUp: boolean, ms = 450, delayMs = 0): void {
    this.tween = {
      from: this.root.position.clone(),
      to: to.clone(),
      ry0: this.root.rotation.y,
      ry1: ry,
      flip0: this.root.rotation.z,
      flip1: faceUp ? 0 : Math.PI,
      t: 0,
      dur: Math.max(0.05, ms / 1000),
      delay: Math.max(0, delayMs / 1000),
    };
  }

  /** Đang bay/lật? */
  get busy(): boolean {
    return this.tween !== null;
  }

  update(dt: number): void {
    const tw = this.tween;
    if (!tw) return;
    if (tw.delay > 0) {
      tw.delay -= dt;
      return;
    }
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const k = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
    this.root.position.lerpVectors(tw.from, tw.to, k);
    this.root.position.y += Math.sin(Math.PI * tw.t) * 0.12;
    this.root.rotation.y = tw.ry0 + (tw.ry1 - tw.ry0) * k;
    this.root.rotation.z = tw.flip0 + (tw.flip1 - tw.flip0) * k;
    if (tw.t >= 1) this.tween = null;
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}
