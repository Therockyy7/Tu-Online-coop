// Bảng LED đường đua ở neo race_board (tường Bắc, mặt nhìn về +Z; làn phòng chừa x 26..37, y 2,3..4,3): khung gỗ sẫm viền
// vàng + màn canvas tự phát sáng. Trái: chữ ĐUA NGỰA, pha + đồng hồ / ngựa về nhất; phải: 6 cột ngựa (số làn màu áo nài,
// tên, tỉ lệ, cơ hội lúc đặt / thứ hạng lúc đua / VỀ NHẤT lúc kết quả). Chỉ vẽ lại khi nội dung đổi (so bằng số, không dựng
// chuỗi mỗi khung): đồng hồ đổi mỗi giây, thứ hạng lúc đua lấy mẫu 2 lần/giây.
import * as THREE from 'three';
import { DUANGUA, SONG_BAC } from '@shared/index';
import { HORSES, oddsLabel, raceOrderAt, type DuaNguaPublicState } from '@shared/activities/duangua';
import { FONT_TITLE, kit } from '../../art/kit';
import { secondsLeft } from '../casino/ui';
import type { ClientActivityContext } from '../types';

/** Màn LED (m) và độ phân giải canvas (cùng tỉ lệ khung). */
const BW = 8.4;
const BH = 1.575;
const CW = 1536;
const CH = 288;
const LEFT_W = 400;
const COL_X0 = 420;
const COL_W = (CW - COL_X0 - 16) / DUANGUA.horses;
/** Thứ hạng lúc đua lấy mẫu chừng này ms một lần. */
const RANK_MS = 500;
/** Áo nài màu sáng (trắng, bạc) → số làn chữ tối. */
const LIGHT = new Set([1, 4]);
const PHASES = ['idle', 'betting', 'resolving', 'result'] as const;

export class RaceBoard {
  private readonly root = new THREE.Group();
  private readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly dots: CanvasPattern | null;
  private readonly order: number[] = [];
  private st: DuaNguaPublicState | null = null;
  private disposed = false;
  // Chữ ký nội dung đã vẽ (so bằng số).
  private sPhase = -1;
  private sRound = -1;
  private sSecs = -1;
  private sWinner = -2;
  private sRanks = -1;
  private lastRank = 0;
  /** Mốc xuất phát của cuộc đua đang lấy mẫu thứ hạng. */
  private raceAt = -1;

  constructor(private readonly ctx: ClientActivityContext) {
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.dots = this.makeDots();

    const anchor = ctx.world.anchor('race_board');
    if (anchor) {
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(this.root.position);
      anchor.getWorldQuaternion(this.root.quaternion);
    } else {
      this.root.position.set(SONG_BAC.race.x, 3.3, SONG_BAC.minZ + 0.05);
    }
    this.root.name = 'duangua_board';
    const wood = kit.mat('#1a1410', { roughness: 0.5, surface: 'none' });
    const gold = kit.mat('#c9a14a', { roughness: 0.35, metalness: 0.7, surface: 'none' });
    // Neo cách mặt tường 5 cm: tấm viền vàng lùi sát tường cho khỏi hở khe; khung gỗ + màn nhô ra trước.
    this.root.add(
      kit.mesh(kit.geo.box(BW + 0.4, BH + 0.4, 0.1), gold, { z: 0, castShadow: false }),
      kit.mesh(kit.geo.box(BW + 0.24, BH + 0.24, 0.12), wood, { z: 0.06, castShadow: false }),
    );
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    screen.position.z = 0.125;
    this.root.add(screen);
    ctx.world.scene.add(this.root);
    this.draw();
    // Font web tải xong sau → vẽ lại một lần cho đúng nét chữ.
    if (document.fonts) void document.fonts.ready.then(() => this.disposed || this.draw());
  }

  /** Mỗi khung hình: chỉ vẽ lại khi pha / ván / giây / ngựa thắng / thứ hạng (lúc đua) đổi. */
  update(st: DuaNguaPublicState | null): void {
    this.st = st;
    if (!st) return;
    const phase = PHASES.indexOf(st.phase);
    const secs = st.phase === 'idle' ? -1 : secondsLeft(st.endsAt, this.ctx.serverNow());
    const winner = st.winner ?? -1;
    let ranks = this.sRanks;
    const now = performance.now();
    if (st.race && st.race.startAt !== this.raceAt) {
      this.raceAt = st.race.startAt;
      this.lastRank = 0;
    }
    if (st.race && (st.phase === 'resolving' || st.phase === 'result') && now - this.lastRank >= RANK_MS) {
      this.lastRank = now;
      raceOrderAt(st.race, this.ctx.serverNow() - st.race.startAt, this.order);
      ranks = 0;
      for (let k = 0; k < this.order.length; k++) ranks = ranks * DUANGUA.horses + this.order[k]!;
    } else if (!st.race) {
      ranks = -1;
    }
    if (phase === this.sPhase && st.round === this.sRound && secs === this.sSecs && winner === this.sWinner && ranks === this.sRanks) return;
    this.sPhase = phase;
    this.sRound = st.round;
    this.sSecs = secs;
    this.sWinner = winner;
    this.sRanks = ranks;
    this.draw();
  }

  dispose(): void {
    this.disposed = true;
    this.ctx.world.scene.remove(this.root);
    kit.disposeTree(this.root);
  }

  private draw(): void {
    const c = this.g;
    const st = this.st;
    c.fillStyle = '#07090d';
    c.fillRect(0, 0, CW, CH);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillStyle = '#ffd166';
    c.font = `800 62px ${FONT_TITLE}`;
    c.fillText('ĐUA NGỰA', 28, 60);
    const [label, color, big] = this.status(st);
    c.fillStyle = color;
    c.font = `800 38px ${FONT_TITLE}`;
    c.fillText(label, 30, 140);
    c.fillStyle = '#f4f1e6';
    this.fit(big, LEFT_W - 40, 64, 26);
    c.fillText(big, 30, 222);
    c.fillStyle = '#2a2f3a';
    c.fillRect(LEFT_W, 18, 3, CH - 36);

    const ranked = !!st?.race && (st.phase === 'resolving' || st.phase === 'result');
    for (let i = 0; i < DUANGUA.horses; i++) this.column(st, i, ranked ? this.order.indexOf(i) : -1);
    if (this.dots) {
      c.fillStyle = this.dots;
      c.fillRect(0, 0, CW, CH);
    }
    this.tex.needsUpdate = true;
  }

  /** Chữ pha, màu, dòng lớn (đồng hồ / ngựa về nhất / hướng dẫn). */
  private status(st: DuaNguaPublicState | null): [string, string, string] {
    const secs = st && st.phase !== 'idle' ? `${secondsLeft(st.endsAt, this.ctx.serverNow())}s` : '';
    switch (st?.phase) {
      case 'betting':
        return ['ĐẶT CƯỢC', '#7dffa0', secs];
      case 'resolving':
        return ['ĐANG ĐUA', '#ff8a7a', secs];
      case 'result':
        return ['VỀ NHẤT', '#ffd166', st.winner === null ? '' : HORSES[st.winner]!.name];
      default:
        return ['ĐANG NGHỈ', '#9aa3ad', 'Bấm E ở lan can'];
    }
  }

  /** Cột ngựa i: số làn, tên, tỉ lệ, dòng dưới theo pha; `rank` = thứ hạng (0 = nhất) lúc đua, −1 nếu chưa đua. */
  private column(st: DuaNguaPublicState | null, i: number, rank: number): void {
    const c = this.g;
    const h = HORSES[i]!;
    const x0 = COL_X0 + i * COL_W;
    const cx = x0 + COL_W / 2;
    const won = st?.phase === 'result' && st.winner === i;
    c.fillStyle = won ? '#3a2c0a' : rank === 0 ? '#1d2534' : '#11151d';
    c.fillRect(x0 + 5, 16, COL_W - 10, CH - 32);
    if (won) {
      c.strokeStyle = '#ffd166';
      c.lineWidth = 5;
      c.strokeRect(x0 + 7, 18, COL_W - 14, CH - 36);
    }
    c.fillStyle = h.color;
    c.beginPath();
    c.arc(cx, 54, 25, 0, Math.PI * 2);
    c.fill();
    c.textAlign = 'center';
    c.fillStyle = LIGHT.has(i) ? '#1b1b1f' : '#ffffff';
    c.font = `800 30px ${FONT_TITLE}`;
    c.fillText(String(i + 1), cx, 56);
    c.fillStyle = '#f4f1e6';
    this.fit(h.name, COL_W - 16, 30, 18);
    c.fillText(h.name, cx, 106);
    const o = st?.odds[i];
    c.fillStyle = '#ffc94a';
    c.font = `800 56px ${FONT_TITLE}`;
    c.fillText(o === undefined ? '—' : oddsLabel(o), cx, 172);
    let sub = '';
    let subColor = '#9aa3ad';
    if (won) {
      sub = 'VỀ NHẤT ★';
      subColor = '#ffd166';
    } else if (rank >= 0) {
      sub = `Hạng ${rank + 1}`;
      subColor = rank === 0 ? '#7dffa0' : '#cfd6de';
    } else if (st?.phase === 'betting' && st.probs[i] !== undefined) {
      sub = `Cơ hội ${Math.max(1, Math.round(st.probs[i]! * 100))}%`;
    }
    c.fillStyle = subColor;
    c.font = `800 30px ${FONT_TITLE}`;
    c.fillText(sub, cx, 238);
    c.textAlign = 'left';
  }

  /** Đặt cỡ chữ lớn nhất (≤ max, ≥ min) cho `text` vừa bề rộng `w`. */
  private fit(text: string, w: number, max: number, min: number): void {
    let size = max;
    this.g.font = `800 ${size}px ${FONT_TITLE}`;
    while (size > min && this.g.measureText(text).width > w) {
      size -= 2;
      this.g.font = `800 ${size}px ${FONT_TITLE}`;
    }
  }

  /** Lưới điểm LED: ô 6 px, viền phải/dưới tối phủ lên chữ sáng. */
  private makeDots(): CanvasPattern | null {
    const tile = document.createElement('canvas');
    tile.width = 6;
    tile.height = 6;
    const t = tile.getContext('2d');
    if (!t) return null;
    t.fillStyle = 'rgba(0,0,0,0.42)';
    t.fillRect(5, 0, 1, 6);
    t.fillRect(0, 5, 6, 1);
    return this.g.createPattern(tile, 'repeat');
  }
}
