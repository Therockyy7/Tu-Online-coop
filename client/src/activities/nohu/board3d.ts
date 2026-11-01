// Bảng số Hũ Công Đức ở neo 'jackpot_display' (khung 1,6 × 0,5 m do làn phòng dựng, mặt trước khung lùi sau neo 5 mm,
// tấm nền tối phía sau) — mặt canvas đặt ngay tại neo, nhìn về −Z ra lối giữa: số hũ chữ vàng phát sáng + dòng người nổ
// gần nhất. Canvas chỉ vẽ lại khi số hũ / lần nổ đổi. Vừa nổ hũ: bảng nháy sáng, mưa xu ở máy trúng và quanh bệ hũ.
import * as THREE from 'three';
import { NOHU, SONG_BAC } from '@shared/index';
import type { NoHuJackpotWin, NoHuPublicState } from '@shared/activities/nohu';
import { FONT_BODY, FONT_TITLE } from '../../art/kit';
import { fmt } from '../casino/ui';
import type { ClientActivityContext } from '../types';

/** Mặt bảng (m) = lỗ khung; canvas cùng tỉ lệ. */
const W = 1.6;
const H = 0.5;
const CW = 768;
const CH = 240;
/** Bảng nháy sau khi nổ hũ (ms, giờ server); chỉ mưa xu nếu nghe tin nổ trong khoảng này (vào phòng muộn thì thôi). */
const FLASH_MS = 7000;
const FRESH_MS = 4000;
/** Mức cược tối đa — chỉ mức này nổ hũ mới ăn trọn hũ (cược nhỏ hơn ăn theo tỉ lệ, noHuJackpotShare). */
const MAX_BET = NOHU.bets[NOHU.bets.length - 1]!;

export class JackpotBoard3D {
  private readonly canvas = document.createElement('canvas');
  private readonly c: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly geo = new THREE.PlaneGeometry(W, H);
  private readonly mesh: THREE.Mesh;
  private jackpot: number = NOHU.jackpotSeed;
  private last: NoHuJackpotWin | null = null;
  private drawnKey = '';
  private flashAt = -Infinity;
  private disposed = false;

  constructor(private readonly ctx: ClientActivityContext) {
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.c = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshStandardMaterial({ map: this.tex, emissive: '#ffffff', emissiveMap: this.tex, emissiveIntensity: 1, roughness: 0.6 });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.name = 'nohu_jackpot_board';
    const a = ctx.world.anchor('jackpot_display');
    if (a) {
      a.updateWorldMatrix(true, false);
      a.getWorldPosition(this.mesh.position);
      a.getWorldQuaternion(this.mesh.quaternion);
    } else {
      const j = SONG_BAC.jackpot;
      this.mesh.position.set(j.x, 2.7, j.z - j.r - 0.05);
      this.mesh.rotation.y = Math.PI;
    }
    ctx.world.scene.add(this.mesh);
    this.draw();
    // Font web tải xong thì vẽ lại cho đúng kiểu chữ.
    if (document.fonts) void document.fonts.ready.then(() => !this.disposed && this.draw(true));
  }

  /** Trạng thái mới: vẽ lại nếu số đổi; vừa có lần nổ mới (so với `prev`) thì nháy bảng + mưa xu. */
  sync(st: NoHuPublicState, prev: NoHuPublicState | null): void {
    this.jackpot = st.jackpot;
    this.last = st.lastJackpot;
    this.draw();
    const j = st.lastJackpot;
    if (!j || !prev || prev.lastJackpot?.at === j.at) return;
    this.flashAt = j.at;
    if (this.ctx.serverNow() - j.at > FRESH_MS) return;
    const x = SONG_BAC.slots.xs[j.machine - 1];
    if (x !== undefined) this.ctx.world.burst(x, SONG_BAC.slots.standZ + 0.4, 'coins', 60);
    this.ctx.world.burst(SONG_BAC.jackpot.x, SONG_BAC.jackpot.z, 'coins', 80);
    this.ctx.world.shake(0.25);
  }

  /** Mỗi khung hình: chỉ đổi độ sáng khi đang nháy (không vẽ lại canvas). */
  update(): void {
    const t = this.ctx.serverNow() - this.flashAt;
    const k = t >= 0 && t < FLASH_MS ? 1 - t / FLASH_MS : 0;
    this.mat.emissiveIntensity = k > 0 ? 1 + k * 1.4 * (0.5 + 0.5 * Math.sin(t / 70)) : 1;
  }

  private draw(force = false): void {
    const key = `${this.jackpot}|${this.last?.at ?? 0}`;
    if (!force && key === this.drawnKey) return;
    this.drawnKey = key;
    const c = this.c;
    const g = c.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#2a0a10');
    g.addColorStop(1, '#0b0205');
    c.fillStyle = g;
    c.fillRect(0, 0, CW, CH);
    // Vạch quét kiểu bảng LED + viền vàng trong.
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < CH; y += 4) c.fillRect(0, y, CW, 1);
    c.strokeStyle = '#e8c060';
    c.lineWidth = 4;
    c.strokeRect(8, 8, CW - 16, CH - 16);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.save();
    c.font = `800 128px ${FONT_TITLE}`;
    const num = fmt(this.jackpot);
    const ng = c.createLinearGradient(0, 40, 0, 170);
    ng.addColorStop(0, '#fff6c8');
    ng.addColorStop(0.5, '#ffd24a');
    ng.addColorStop(1, '#e08a10');
    c.shadowColor = '#ffb300';
    c.shadowBlur = 26;
    c.fillStyle = ng;
    c.fillText(num, CW / 2, CH * 0.43);
    c.shadowBlur = 0;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(90,30,0,0.8)';
    c.strokeText(num, CW / 2, CH * 0.43);
    c.restore();
    c.font = `700 25px ${FONT_BODY}`;
    c.fillStyle = '#ffd98a';
    const j = this.last;
    const name = j ? (j.name.length > 16 ? `${j.name.slice(0, 15)}…` : j.name) : '';
    c.fillText(j ? `Nổ gần nhất: ${name} +${fmt(j.amount)} Công Đức` : `Ba Hũ là nổ hũ — cược ${MAX_BET} ăn trọn hũ!`, CW / 2, CH - 34);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    this.ctx.world.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
