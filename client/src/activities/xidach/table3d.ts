// Đồ động bàn Xì Dách: lá bài Card3D bay từ hộp bài (cạnh neo xidach_dealer, lệch +0,5 m X — hộp tĩnh do phòng dựng) tới
// chỗ bài từng ghế (neo xidach_seat:N, ghế theo thứ tự đặt cược) và chỗ bài nhà cái; lá tẩy úp tới khi lật; dọn bài khi
// ván mới; nhà cái NPC đứng phía Bắc bàn nhìn về Nam. Lá chia đầu ván bay đúng mốc giờ server (dealAt) nên người vào giữa
// ván thấy đúng cảnh; lá rút sau bay ngay khi trạng thái tới — trừ lá đã rút từ trước lúc mình thấy ván này (vừa vào map /
// vào giữa ván): đặt thẳng lên bàn, không bay, không tiếng. update() chạy mỗi khung hình, không cấp phát mới.
import * as THREE from 'three';
import { SONG_BAC, XIDACH, type AnimId, type SfxId } from '@shared/index';
import type { Card } from '@shared/activities/cards';
import { xiDachHandLabel, xiDachRank, type XiDachPublicState, type XiDachVerdict } from '@shared/activities/xidach';
import { npcLook } from '../../art/avatar';
import type { NpcHandle } from '../../engine/worldApi';
import type { ClientActivityContext } from '../types';
import { Card3D } from '../casino/cards3d';

/** Chỗ đặt bài: tâm hàng bài trên mặt nỉ + hướng (ry làm +Z cục bộ hướng ra phía người xem bài). */
interface Spot {
  x: number;
  y: number;
  z: number;
  ry: number;
}

/** Khoảng cách lá trong 1 tay (xòe chồng lên nhau; lá thứ i nằm ở (i − 0,5) × gap dọc trục X cục bộ). */
const SEAT_GAP = 0.075;
const DEALER_GAP = 0.09;
/** Lá sau cao hơn lá trước một chút cho khỏi nhấp nháy mặt. */
const LIFT = 0.0035;
const FLY_MS = 420;
/** Nhiều lá rút cùng lúc (tự chơi khi hết giờ) bay so le. */
const LATE_STAGGER_MS = 150;
const FLIP_MS = 380;
/** Miệng hộp bài (khe rút quay về Nam): hộp tâm lệch +0,5 m X khỏi neo nhà cái, miệng ở +0,14 m Z, cao ~6 cm. */
const SHOE_DX = 0.5;
const SHOE_DY = 0.06;
const SHOE_DZ = 0.14;
/** Nhà cái đứng lùi khỏi mép thẳng phía Bắc của bàn. */
const DEALER_BACK = 0.55;
/** Âm thanh bàn nghe được trong bán kính này (m). */
const HEAR_R = 14;
const VERDICT_FX: Record<XiDachVerdict, readonly [string, string]> = {
  win: ['THẮNG', '#7dffa0'],
  push: ['HÒA', '#ffe9a8'],
  lose: ['THUA', '#ff8a7a'],
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export class XiDachTable3D {
  private readonly root = new THREE.Group();
  private readonly dealer: NpcHandle;
  private readonly shoe: THREE.Vector3;
  private readonly dealerSpot: Spot;
  /** Chỗ bài ghế 1..5 (chỉ số = số ghế − 1). */
  private readonly seatSpots: Spot[];
  private readonly seatCards = new Map<string, Card3D[]>();
  private dealerCards: Card3D[] = [];
  /** Mọi lá đang có trên bàn (duyệt mỗi khung hình không cấp phát). */
  private cards: Card3D[] = [];
  private round = -1;
  private readonly cx: number;
  private readonly cz: number;
  private dealerAnim: AnimId = 'idle';
  private dealerOverride: AnimId = 'idle';
  private dealerUntil = 0;

  constructor(private readonly ctx: ClientActivityContext) {
    const xd = SONG_BAC.xidach;
    const y = SONG_BAC.feltY;
    const z0 = xd.z - xd.d / 2;
    this.cx = xd.x;
    this.cz = xd.z;
    // Dự phòng khi thiếu neo: cùng công thức với art/anchors.ts (nửa elip, 5 ghế trên cung ở 68% bán kính).
    this.dealerSpot = this.spot('xidach_dealer', { x: xd.x, y, z: z0 + 0.35, ry: 0 });
    this.seatSpots = [-60, -30, 0, 30, 60].map((deg, i) => {
      const phi = (deg * Math.PI) / 180;
      const fb = { x: xd.x + (xd.w / 2) * 0.68 * Math.sin(phi), y, z: z0 + xd.d * 0.68 * Math.cos(phi), ry: phi };
      return this.spot(`xidach_seat:${i + 1}`, fb);
    });
    this.shoe = new THREE.Vector3(this.dealerSpot.x + SHOE_DX, this.dealerSpot.y + SHOE_DY, this.dealerSpot.z + SHOE_DZ);
    this.root.name = 'xidach_dyn';
    ctx.world.scene.add(this.root);
    this.dealer = ctx.world.createNpc(npcLook('dealer', 37), 'Nhà cái');
    this.dealer.setPosition(xd.x, z0 - DEALER_BACK, 0);
  }

  /** Trạng thái mới từ server: dọn bài khi sang ván mới, bày lá mới / lật lá tẩy, thoại nhà cái. `prev` null = vừa vào map. */
  sync(st: XiDachPublicState, prev: XiDachPublicState | null): void {
    if (st.round !== this.round || st.phase === 'idle' || st.phase === 'betting') this.clearCards();
    this.round = st.round;
    if (st.phase === 'resolving' || st.phase === 'result') this.layCards(st, prev);
    this.speak(st, prev);
  }

  update(dt: number): void {
    for (let i = 0; i < this.cards.length; i++) this.cards[i]!.update(dt);
    const want: AnimId = performance.now() < this.dealerUntil ? this.dealerOverride : 'idle';
    if (want !== this.dealerAnim) {
      this.dealerAnim = want;
      this.dealer.avatar.setAnim(want);
    }
  }

  dispose(): void {
    this.clearCards();
    this.ctx.world.scene.remove(this.root);
    this.dealer.dispose();
  }

  // ───────────── Lá bài ─────────────

  private layCards(st: XiDachPublicState, prev: XiDachPublicState | null): void {
    const now = this.ctx.serverNow();
    const n = st.seats.length;
    const step = XIDACH.dealMs / (2 * (n + 1));
    // Chưa thấy ván này từ trước (vừa vào map / vào giữa ván): lá rút sau (i ≥ 2) đã nằm sẵn trên bàn ở mọi máy khác → đặt
    // thẳng (late = null). Cùng ván với trạng thái trước thì lá rút mới bay so le như thường.
    const seen = prev?.round === st.round;
    let late = 0;
    // Ghế đã rời (được hoàn cược) → dọn bài của ghế đó.
    for (const [pid, list] of this.seatCards) {
      if (st.seats.some((s) => s.pid === pid)) continue;
      for (const c of list) this.drop(c);
      this.seatCards.delete(pid);
    }
    st.seats.forEach((s, si) => {
      const spot = this.seatSpots[s.seat - 1] ?? this.seatSpots[0]!;
      let list = this.seatCards.get(s.pid);
      if (!list) {
        list = [];
        this.seatCards.set(s.pid, list);
      }
      for (let i = list.length; i < s.cards.length; i++) {
        // Thứ tự chia: vòng i, ghế si (ghế 1..n rồi nhà cái).
        const dealAt = i < 2 ? st.dealAt + (i * (n + 1) + si) * step : 0;
        list.push(this.fly(s.cards[i]!, true, this.slot(spot, i, SEAT_GAP, 1), spot.ry, dealAt, now, i < 2 ? 0 : seen ? late++ : null));
      }
      const before = prev?.round === st.round ? prev.seats.find((x) => x.pid === s.pid) : undefined;
      if (s.result && before && !before.result) this.verdictFx(spot, s.result);
    });
    const d = st.dealer.cards;
    for (let i = 0; i < d.length; i++) {
      const c = d[i] ?? null;
      const have = this.dealerCards[i];
      // Lá nhà cái xếp dần sang tay phải nhà cái (phía Tây = bên trái người chơi nhìn vào).
      const to = this.slot(this.dealerSpot, i, DEALER_GAP, -1);
      if (!have) {
        const dealAt = i < 2 ? st.dealAt + (i * (n + 1) + n) * step : 0;
        this.dealerCards.push(this.fly(c, c !== null, to, this.dealerSpot.ry, dealAt, now, i < 2 ? 0 : seen ? late++ : null));
      } else if (!have.card && c) {
        // Lật lá tẩy: đổi mặt rồi lật tại chỗ.
        have.setCard(c);
        have.moveTo(to, this.dealerSpot.ry, true, FLIP_MS);
        this.sound('card_flip', 0.75);
      }
    }
  }

  /**
   * Tạo lá ở hộp bài rồi bay tới `to`. `dealAt` > 0: lá chia đầu ván, bay đúng mốc giờ server (đã quá lâu thì đặt luôn);
   * 0: lá rút sau, bay ngay (so le theo thứ tự `late`); `late` null: lá rút từ trước lúc mình thấy ván → đặt luôn.
   */
  private fly(card: Card | null, faceUp: boolean, to: THREE.Vector3, ry: number, dealAt: number, now: number, late: number | null): Card3D {
    const c3 = new Card3D(card, false);
    this.root.add(c3.root);
    this.cards.push(c3);
    const delay = dealAt > 0 ? dealAt - now : (late ?? 0) * LATE_STAGGER_MS;
    if (late === null || delay < -FLY_MS) {
      c3.place(to, ry, faceUp);
      return c3;
    }
    c3.place(this.shoe, this.dealerSpot.ry, false);
    c3.moveTo(to, ry, faceUp, FLY_MS, Math.max(0, delay));
    const v = this.volume(0.55);
    if (v > 0.05) this.ctx.audio.playAt('card_deal', now + Math.max(0, delay), { volume: v, rate: 0.95 + (this.cards.length % 3) * 0.05 });
    return c3;
  }

  /** Vị trí lá thứ i của 1 tay: dọc trục X cục bộ của chỗ bài (`dir` −1 = xếp ngược chiều), mỗi lá cao hơn chút. */
  private slot(spot: Spot, i: number, gap: number, dir: number): THREE.Vector3 {
    const k = (i - 0.5) * gap * dir;
    return tmpPos.set(spot.x + Math.cos(spot.ry) * k, spot.y + 0.0025 + i * LIFT, spot.z - Math.sin(spot.ry) * k);
  }

  private drop(c: Card3D): void {
    c.dispose();
    const i = this.cards.indexOf(c);
    if (i >= 0) this.cards.splice(i, 1);
  }

  private clearCards(): void {
    if (!this.cards.length) return;
    for (const c of this.cards) c.dispose();
    this.cards = [];
    this.dealerCards = [];
    this.seatCards.clear();
  }

  /** Chữ bay "THẮNG / HÒA / THUA" trên chỗ bài của ghế lúc nhà cái xét tới. */
  private verdictFx(spot: Spot, v: XiDachVerdict): void {
    const [text, color] = VERDICT_FX[v];
    this.ctx.world.floatText(spot.x, spot.z, text, color, spot.y + 0.45);
  }

  // ───────────── Nhà cái NPC ─────────────

  private speak(st: XiDachPublicState, prev: XiDachPublicState | null): void {
    if (!prev) return;
    if (prev.phase === st.phase && prev.step === st.step) {
      // Nhà cái rút thêm lá: tay khuấy ngắn.
      if (st.step === 'dealer' && st.dealer.cards.length > prev.dealer.cards.length) this.playDealer('stir', 700);
      return;
    }
    if (st.phase === 'betting') {
      this.dealer.say(`Đặt cược đi bà con! Tối đa ${XIDACH.seats} ghế.`, 2600);
      this.playDealer('wave', 1600);
    } else if (st.step === 'deal') {
      this.dealer.say('Chia bài!', 1400);
      this.playDealer('stir', XIDACH.dealMs);
    } else if (st.step === 'turn') {
      this.dealer.say(`Rút hay dằn? Đủ ${XIDACH.playerMinStand} mới được dằn nha!`, 2800);
    } else if (st.step === 'dealer') {
      this.dealer.say('Lật bài!', 1400);
    } else if (st.phase === 'result') {
      this.resultLine(st);
    } else if (st.phase === 'idle') {
      this.dealer.say('Nghỉ tay chút — ai chơi bấm E mở ván nhé!', 2800);
    }
  }

  private resultLine(st: XiDachPublicState): void {
    const cards = st.dealer.cards.filter((c): c is Card => c !== null);
    if (!st.dealer.revealed || !cards.length) return;
    const r = xiDachRank(cards);
    this.dealer.say(r === 'quac' ? `${xiDachHandLabel(cards)} — đền bà con!` : `Nhà cái ${xiDachHandLabel(cards)}!`, 2600);
    if (r === 'xi_bang' || r === 'xi_dach') this.playDealer('laugh', 2400);
    else if (r === 'quac') this.playDealer('cry', 2200);
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
