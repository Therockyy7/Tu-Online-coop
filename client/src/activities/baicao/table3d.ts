// Đồ động bàn Bài Cào: nhà cái NPC đứng phía Nam bàn nhìn về Bắc (khách đứng phía lối giữa), cỗ bài úp cạnh chỗ bài nhà
// cái; lá Card3D bay từ cỗ bài tới chỗ bài 6 tay đầu (neo baicao_seat:N — tay theo thứ tự đặt cược, người cược thêm chỉ
// hiện ở bảng) và chỗ bài nhà cái (neo baicao_dealer) theo mốc giờ server: 3 vòng (tay 1..n rồi nhà cái) bay hết trong
// BAICAO.dealFlyMs, úp; lật 3 đợt ở baiCaoFlipAt (lá thứ k của mọi tay cùng đợt) nên người vào giữa ván thấy đúng cảnh;
// chốt ván hiện chữ THẮNG / THUA trên từng tay. Dọn bài khi sang ván mới. update() chạy mỗi khung hình, không cấp phát
// (lật lá chỉ gọi moveTo đúng lúc qua đợt).
import * as THREE from 'three';
import { BAICAO, SONG_BAC, type AnimId, type SfxId } from '@shared/index';
import type { Card } from '@shared/activities/cards';
import { BA_TIEN, BAICAO_FLIPS, baiCaoFlipAt, baiCaoLabel, baiCaoScore, type BaiCaoPublicState, type BaiCaoVerdict } from '@shared/activities/baicao';
import { npcLook } from '../../art/avatar';
import type { NpcHandle } from '../../engine/worldApi';
import type { ClientActivityContext } from '../types';
import { CARD_H, CARD_W, Card3D } from '../casino/cards3d';

/** Chỗ đặt bài: tâm hàng 3 lá trên mặt nỉ + hướng (ry làm +Z cục bộ hướng ra phía khách). */
interface Spot {
  x: number;
  y: number;
  z: number;
  ry: number;
}

/** Một lá đã bày: đích trên bàn + mốc lật (giờ server). */
interface Laid {
  card: Card3D;
  to: THREE.Vector3;
  ry: number;
  flipAt: number;
  flipped: boolean;
}

/** Khoảng cách tâm 2 lá kề nhau trong 1 tay (ô bài in trên nỉ rộng 0,42 m; nhà cái 0,62 m). */
const SEAT_GAP = 0.125;
const DEALER_GAP = 0.15;
/** Lá sau cao hơn lá trước một chút cho khỏi nhấp nháy mặt. */
const LIFT = 0.0035;
const FLY_MS = 380;
const FLIP_MS = 360;
/** Cỗ bài úp: lệch +0,55 m X khỏi tâm chỗ bài nhà cái (khay phỉnh tĩnh nằm phía −X), dày 2,4 cm. */
const DECK_DX = 0.55;
const DECK_DZ = 0.05;
const DECK_T = 0.024;
/** Nhà cái đứng lùi khỏi mép Nam của bàn. */
const DEALER_BACK = 0.55;
/** Âm thanh bàn nghe được trong bán kính này (m). */
const HEAR_R = 14;
const VERDICT_FX: Record<BaiCaoVerdict, readonly [string, string]> = {
  win: ['THẮNG', '#7dffa0'],
  lose: ['THUA', '#ff8a7a'],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export class BaiCaoTable3D {
  private readonly root = new THREE.Group();
  private readonly dealer: NpcHandle;
  private readonly dealerSpot: Spot;
  /** Chỗ bài tay 1..BAICAO.seats3d (chỉ số = số tay − 1). */
  private readonly seatSpots: Spot[];
  /** Mặt trên cỗ bài — lá bay ra từ đây. */
  private readonly deckTop: THREE.Vector3;
  private readonly deckGeo = new THREE.BoxGeometry(CARD_W, DECK_T, CARD_H);
  private readonly deckMat = new THREE.MeshStandardMaterial({ color: '#efe7d6', roughness: 0.8 });
  private readonly deckCard: Card3D;
  private laid: Laid[] = [];
  private round = -1;
  /** Giờ chia của ván đang bày (0 = chưa bày) và số đợt lật đã phát tiếng. */
  private dealAt = 0;
  private flipSounds = 0;
  private readonly cx: number;
  private readonly cz: number;
  private dealerAnim: AnimId = 'idle';
  private dealerOverride: AnimId = 'idle';
  private dealerUntil = 0;

  constructor(private readonly ctx: ClientActivityContext) {
    const bc = SONG_BAC.baicao;
    const y = SONG_BAC.feltY;
    this.cx = bc.x;
    this.cz = bc.z;
    // Dự phòng khi thiếu neo: cùng công thức với art/anchors.ts (khách cạnh Bắc, nhà cái cạnh Nam).
    this.dealerSpot = this.spot('baicao_dealer', { x: bc.x, y, z: bc.z + 0.5, ry: Math.PI });
    this.seatSpots = Array.from({ length: BAICAO.seats3d }, (_, k) =>
      this.spot(`baicao_seat:${k + 1}`, { x: bc.x + (k - 2.5) * 0.5, y, z: bc.z - bc.d / 2 + 0.38, ry: Math.PI }),
    );
    this.root.name = 'baicao_dyn';
    ctx.world.scene.add(this.root);
    // Cỗ bài: thân hộp màu giấy + 1 lá úp trên cùng (lưng bài dùng chung của Card3D).
    const dx = this.dealerSpot.x + DECK_DX;
    const dz = this.dealerSpot.z + DECK_DZ;
    const deck = new THREE.Mesh(this.deckGeo, this.deckMat);
    deck.position.set(dx, y + DECK_T / 2, dz);
    deck.rotation.y = this.dealerSpot.ry;
    deck.castShadow = true;
    this.root.add(deck);
    this.deckCard = new Card3D(null, false);
    this.deckCard.place(tmpPos.set(dx, y + DECK_T + 0.0015, dz), this.dealerSpot.ry, false);
    this.root.add(this.deckCard.root);
    this.deckTop = new THREE.Vector3(dx, y + DECK_T + 0.004, dz);
    this.dealer = ctx.world.createNpc(npcLook('dealer', 53), 'Nhà cái');
    this.dealer.setPosition(bc.x, bc.z + bc.d / 2 + DEALER_BACK, Math.PI);
  }

  /** Trạng thái mới từ server: dọn bài khi sang ván mới, bày bài lúc chia (hoặc khi vào giữa ván), chữ kết quả, thoại. */
  sync(st: BaiCaoPublicState, prev: BaiCaoPublicState | null): void {
    if (st.round !== this.round || st.phase === 'idle' || st.phase === 'betting') this.clearCards();
    this.round = st.round;
    const dealt = (st.phase === 'resolving' || st.phase === 'result') && st.dealer.length > 0;
    if (dealt && !this.laid.length) this.lay(st);
    if (st.phase === 'result' && prev && prev.round === st.round && prev.phase !== 'result') this.verdicts(st);
    this.speak(st, prev);
  }

  update(dt: number): void {
    const now = this.ctx.serverNow();
    for (let i = 0; i < this.laid.length; i++) {
      const l = this.laid[i]!;
      if (!l.flipped && now >= l.flipAt) {
        l.flipped = true;
        l.card.moveTo(l.to, l.ry, true, FLIP_MS);
      }
      l.card.update(dt);
    }
    // Mỗi đợt lật 1 tiếng (đợt đã qua lâu lúc mới vào bàn thì im).
    if (this.dealAt > 0 && this.flipSounds < BAICAO_FLIPS) {
      const at = baiCaoFlipAt(this.dealAt, this.flipSounds);
      if (now >= at) {
        if (now - at < 400) this.sound('card_flip', 0.75);
        this.flipSounds++;
      }
    }
    const want: AnimId = performance.now() < this.dealerUntil ? this.dealerOverride : 'idle';
    if (want !== this.dealerAnim) {
      this.dealerAnim = want;
      this.dealer.avatar.setAnim(want);
    }
  }

  dispose(): void {
    this.clearCards();
    this.deckCard.dispose();
    this.ctx.world.scene.remove(this.root);
    this.deckGeo.dispose();
    this.deckMat.dispose();
    this.dealer.dispose();
  }

  // ───────────── Lá bài ─────────────

  /** Bày cả ván 1 lần (lúc chia hoặc lúc vào giữa ván): 6 tay đầu + nhà cái, đúng thứ tự chia 3 vòng. */
  private lay(st: BaiCaoPublicState): void {
    const now = this.ctx.serverNow();
    const m = Math.min(st.hands.length, BAICAO.seats3d);
    const total = 3 * (m + 1);
    const step = (BAICAO.dealFlyMs - FLY_MS) / Math.max(1, total - 1);
    const done = st.phase === 'result';
    this.dealAt = st.dealAt;
    this.flipSounds = 0;
    for (let i = 0; i < 3; i++) {
      const flipAt = baiCaoFlipAt(st.dealAt, i);
      for (let hi = 0; hi < m; hi++) {
        const h = st.hands[hi]!;
        const spot = this.seatSpots[h.seat - 1] ?? this.seatSpots[hi]!;
        this.add(h.cards[i] ?? null, spot, i, SEAT_GAP, st.dealAt + (i * (m + 1) + hi) * step, flipAt, now, done);
      }
      this.add(st.dealer[i] ?? null, this.dealerSpot, i, DEALER_GAP, st.dealAt + (i * (m + 1) + m) * step, flipAt, now, done);
    }
  }

  /**
   * Tạo 1 lá úp ở cỗ bài rồi bay tới chỗ của nó đúng mốc `flyAt` (giờ server); đã quá mốc thì đặt luôn, đã quá mốc lật
   * (hoặc ván đã chốt) thì đặt ngửa.
   */
  private add(card: Card | null, spot: Spot, i: number, gap: number, flyAt: number, flipAt: number, now: number, done: boolean): void {
    const c3 = new Card3D(card, false);
    this.root.add(c3.root);
    const to = this.slot(spot, i, gap, new THREE.Vector3());
    const l: Laid = { card: c3, to, ry: spot.ry, flipAt, flipped: false };
    this.laid.push(l);
    if (done || now >= flipAt + FLIP_MS) {
      c3.place(to, spot.ry, true);
      l.flipped = true;
      return;
    }
    const delay = flyAt - now;
    if (delay < -FLY_MS) {
      c3.place(to, spot.ry, false);
      return;
    }
    c3.place(this.deckTop, this.dealerSpot.ry, false);
    c3.moveTo(to, spot.ry, false, FLY_MS, Math.max(0, delay));
    const v = this.volume(0.45);
    if (v > 0.05) this.ctx.audio.playAt('card_deal', Math.max(now, flyAt), { volume: v, rate: 0.95 + (this.laid.length % 3) * 0.05 });
  }

  /** Vị trí lá thứ i (0..2) của 1 tay: dọc trục X cục bộ của chỗ bài (lá giữa ở tâm), mỗi lá cao hơn chút. */
  private slot(spot: Spot, i: number, gap: number, out: THREE.Vector3): THREE.Vector3 {
    const k = (i - 1) * gap;
    return out.set(spot.x + Math.cos(spot.ry) * k, spot.y + 0.0025 + i * LIFT, spot.z - Math.sin(spot.ry) * k);
  }

  private clearCards(): void {
    this.dealAt = 0;
    this.flipSounds = 0;
    if (!this.laid.length) return;
    for (const l of this.laid) l.card.dispose();
    this.laid = [];
  }

  /** Chữ bay "THẮNG / THUA" trên chỗ bài của 6 tay đầu lúc chốt ván. */
  private verdicts(st: BaiCaoPublicState): void {
    const m = Math.min(st.hands.length, BAICAO.seats3d);
    for (let hi = 0; hi < m; hi++) {
      const h = st.hands[hi]!;
      if (!h.result) continue;
      const spot = this.seatSpots[h.seat - 1] ?? this.seatSpots[hi]!;
      const [text, color] = VERDICT_FX[h.result];
      this.ctx.world.floatText(spot.x, spot.z, text, color, spot.y + 0.45);
    }
  }

  // ───────────── Nhà cái NPC ─────────────

  private speak(st: BaiCaoPublicState, prev: BaiCaoPublicState | null): void {
    if (!prev || prev.phase === st.phase) return;
    if (st.phase === 'betting') {
      this.dealer.say(`Đặt cược đi bà con! Ba Tiên ăn ${BAICAO.payout.ba_tien === 2 ? 'đôi' : `×${BAICAO.payout.ba_tien}`}!`, 2600);
      this.playDealer('wave', 1600);
    } else if (st.phase === 'resolving') {
      this.dealer.say('Chia bài! Lật dần nha…', 1600);
      this.playDealer('stir', BAICAO.dealFlyMs);
    } else if (st.phase === 'result') {
      this.resultLine(st);
    } else if (st.phase === 'idle') {
      this.dealer.say('Nghỉ tay chút — ai chơi bấm E mở ván nhé!', 2800);
    }
  }

  private resultLine(st: BaiCaoPublicState): void {
    if (!st.dealer.length) return;
    const score = baiCaoScore(st.dealer);
    const label = baiCaoLabel(st.dealer);
    if (score === 0) {
      this.dealer.say(`${label} — đền bà con!`, 2600);
      this.playDealer('cry', 2200);
    } else {
      this.dealer.say(`Nhà cái ${label}!`, 2600);
      if (score === BA_TIEN || score >= 8) this.playDealer('laugh', 2400);
    }
    const v = this.volume(0.5);
    if (v > 0.05) this.ctx.audio.play('chips', { volume: v });
  }

  private playDealer(anim: AnimId, ms: number): void {
    this.dealerOverride = anim;
    this.dealerUntil = performance.now() + ms;
  }

  // ───────────── Tiện ích ─────────────

  /** Neo theo tên (vị trí + hướng thế giới), thiếu thì dùng vị trí dự phòng. */
  private spot(name: string, fallback: Spot): Spot {
    const a = this.ctx.world.anchor(name);
    if (!a) return fallback;
    a.updateWorldMatrix(true, false);
    a.getWorldPosition(tmpPos);
    a.getWorldQuaternion(tmpQuat);
    tmpEuler.setFromQuaternion(tmpQuat, 'YXZ');
    return { x: tmpPos.x, y: tmpPos.y, z: tmpPos.z, ry: tmpEuler.y };
  }

  private sound(id: SfxId, base: number): void {
    const v = this.volume(base);
    if (v > 0.05) this.ctx.audio.play(id, { volume: v });
  }

  /** Âm lượng theo khoảng cách từ mình tới bàn. */
  private volume(base: number): number {
    const me = this.ctx.me();
    if (!me) return 0;
    return base * clamp01(1 - Math.hypot(me.x - this.cx, me.z - this.cz) / HEAR_R);
  }
}
