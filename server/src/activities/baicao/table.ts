// Bàn Bài Cào 3 lá (Sòng Công Đức) phía server — máy trạng thái của 1 bàn: đặt cược (StakeBook, ô 'hand', không giới hạn
// số người, tay theo thứ tự đặt) → hết giờ chia 3 lá mỗi tay + nhà cái (đủ mặt trong trạng thái công khai — client tự úp
// tới mốc lật baiCaoFlipAt) → sau BAICAO.revealMs trả thưởng → kết quả BAICAO.resultMs → ván kế. Ván không ai cược thì
// không chia, sang ván kế; bàn tự nghỉ sau CASINO.idleRounds ván trống hoặc khi không còn ai đứng gần.
// index.ts kiểm dữ liệu thao tác (zod) + định tuyến.
import { BAICAO, CASINO, JOKES, type Pid, type Rng } from '@shared/index';
import type { Card } from '@shared/activities/cards';
import { baiCaoFlipAt, baiCaoLabel, baiCaoPayout, baiCaoScore, compareBaiCao, type BaiCaoHand, type BaiCaoPublicState } from '@shared/activities/baicao';
import { StakeBook } from '../casino/stakes';
import type { ActivityContext, LeaveReason, ServerPlayerView } from '../types';

const STATION = 'baicao_table';
/** Ô cược duy nhất của Bài Cào (cả tay bài). */
const HAND = 'hand';
const CARDS_PER_HAND = 3;

export class BaiCaoTable {
  readonly state: BaiCaoPublicState = {
    phase: 'idle',
    endsAt: 0,
    round: 0,
    dealAt: 0,
    revealAt: 0,
    hands: [],
    dealer: [],
    results: [],
  };
  private readonly book: StakeBook;
  private idleRounds = 0;
  private cancel: (() => void) | null = null;

  constructor(
    private readonly ctx: ActivityContext,
    private readonly newDeck: (rng: Rng) => Card[],
  ) {
    this.book = new StakeBook(ctx, 'Bài Cào');
    this.publish();
  }

  get busy(): boolean {
    return this.state.phase !== 'idle' && !this.book.isEmpty;
  }

  near(pid: Pid): boolean {
    return this.ctx.isNear(pid, STATION, CASINO.nearSlack);
  }

  // ───────────── Thao tác người chơi ─────────────

  /** E ở bàn / nút "Mở ván": bàn đang nghỉ thì mở ván mới. */
  open(p: ServerPlayerView): void {
    if (this.state.phase !== 'idle') return;
    this.idleRounds = 0;
    this.startBetting();
    this.ctx.chatSystem(`🃏 ${p.name} mở bàn Bài Cào. Đặt cược trong ${Math.round(BAICAO.betMs / 1000)} giây!`);
  }

  bet(p: ServerPlayerView, amount: number): void {
    if (this.state.phase !== 'betting') return this.ctx.toast(p.pid, 'Ngoài giờ đặt cược — chờ ván sau nhé.', 'warn');
    if (!this.near(p.pid)) return this.ctx.toast(p.pid, JOKES.tooFar, 'warn');
    const err = this.book.place(p, HAND, amount);
    if (err) return this.ctx.toast(p.pid, err, 'warn');
    this.syncHands();
    this.publish();
  }

  unbet(p: ServerPlayerView, amount: number): void {
    if (this.state.phase !== 'betting') return this.ctx.toast(p.pid, 'Đã chia bài, không gỡ cược được nữa.', 'warn');
    if (!this.near(p.pid)) return this.ctx.toast(p.pid, JOKES.tooFar, 'warn');
    if (this.book.remove(p.pid, HAND, amount) === 0) return;
    this.syncHands();
    this.publish();
  }

  /**
   * Đang đặt cược mà rời phòng / mất kết nối → hoàn, bỏ tay (như Bầu Cua). Esc chỉ đóng bảng, cược giữ nguyên.
   * Từ lúc chia, cả bàn bài (tức kết quả) đã nằm trong trạng thái công khai trước lúc trả → rời hẳn phòng KHÔNG hoàn
   * (nếu hoàn thì người thấy mình thua chỉ việc rời phòng là lấy lại cược); settle bỏ qua người vắng = mất cược. Mất kết
   * nối tạm thời thì giữ, trả như thường.
   */
  leave(p: ServerPlayerView, reason: LeaveReason): void {
    if (reason === 'esc' || !this.book.has(p.pid) || this.state.phase !== 'betting') return;
    this.book.refund(p.pid);
    this.syncHands();
    this.publish();
  }

  /** Đổi map (chỉ xảy ra khi bàn không bận): ván chưa trả thì hoàn toàn bộ cược, bàn về nghỉ. */
  mapChange(): void {
    this.cancel?.();
    this.cancel = null;
    this.book.refund();
    this.idleRounds = 0;
    this.toIdle();
    this.publish();
  }

  dispose(): void {
    this.cancel?.();
  }

  // ───────────── Vòng ván ─────────────

  private startBetting(): void {
    const st = this.state;
    Object.assign(st, { phase: 'betting', endsAt: this.ctx.now() + BAICAO.betMs, dealAt: 0, revealAt: 0, dealer: [], results: [] });
    st.round++;
    this.syncHands();
    this.publish();
    this.schedule(() => this.deal(), BAICAO.betMs);
  }

  /** Hết giờ đặt: chốt tay, xào bộ mới, chia 3 vòng (tay 1..n rồi nhà cái), tính nút; trả sau BAICAO.revealMs. */
  private deal(): void {
    if (this.book.isEmpty) {
      this.idleRounds++;
      return this.nextRound();
    }
    this.syncHands();
    const deck = this.newDeck(this.ctx.rng);
    let k = 0;
    const draw = (): Card => {
      // 52 lá đủ cho 16 tay + nhà cái; bàn đông hơn thì xào thêm bộ mới cho phần còn lại.
      if (k >= deck.length) {
        deck.push(...this.newDeck(this.ctx.rng));
      }
      return deck[k++]!;
    };
    const st = this.state;
    st.dealer = [];
    for (let i = 0; i < CARDS_PER_HAND; i++) {
      for (const h of st.hands) h.cards.push(draw());
      st.dealer.push(draw());
    }
    for (const h of st.hands) h.score = baiCaoScore(h.cards);
    const now = this.ctx.now();
    Object.assign(st, { phase: 'resolving', dealAt: now, revealAt: baiCaoFlipAt(now, 0), endsAt: now + BAICAO.revealMs });
    this.publish();
    this.schedule(() => this.finish(), BAICAO.revealMs);
  }

  /**
   * Lật xong: so từng tay với nhà cái, trả thưởng (sổ cộng Tạp Niệm + toast), báo chat nếu có cược, hẹn ván kế.
   * Người đã rời hẳn phòng: settle không trả — ghi trả 0 để dòng kết quả đúng là mất cược.
   */
  private finish(): void {
    const st = this.state;
    const anyBets = !this.book.isEmpty;
    const returns: Record<Pid, number> = {};
    for (const h of st.hands) {
      h.result = compareBaiCao(h.cards, st.dealer);
      returns[h.pid] = this.ctx.player(h.pid) ? baiCaoPayout(this.book.totalOf(h.pid), h.result, h.cards) : 0;
    }
    st.results = this.book.settle(returns);
    Object.assign(st, { phase: 'result', endsAt: this.ctx.now() + BAICAO.resultMs });
    this.publish();
    if (anyBets) this.ctx.chatSystem(this.summary());
    this.idleRounds = anyBets ? 0 : this.idleRounds + 1;
    this.schedule(() => this.nextRound(), BAICAO.resultMs);
  }

  private nextRound(): void {
    if (this.idleRounds < CASINO.idleRounds && this.anyoneNear()) return this.startBetting();
    this.cancel = null;
    this.toIdle();
    this.publish();
  }

  // ───────────── Tiện ích ─────────────

  private publish(): void {
    this.ctx.setState(structuredClone(this.state));
  }

  private anyoneNear(): boolean {
    return this.ctx.players().some((p) => p.connected && this.near(p.pid));
  }

  /** Lúc đặt cược: tay = người đã cược theo thứ tự đặt lần đầu (chưa có bài). */
  private syncHands(): void {
    this.state.hands = this.book.bettors().map<BaiCaoHand>((pid, i) => ({
      seat: i + 1,
      pid,
      name: this.book.nameOf(pid),
      cards: [],
      stake: this.book.totalOf(pid),
      score: -1,
    }));
  }

  private toIdle(): void {
    Object.assign(this.state, { phase: 'idle', endsAt: 0, dealAt: 0, revealAt: 0, hands: [], dealer: [], results: [] });
  }

  private schedule(fn: () => void, ms: number): void {
    this.cancel?.();
    this.cancel = this.ctx.setTimeout(fn, ms);
  }

  /** Tin chat chốt ván, vd "🃏 Bài Cào ván 3: nhà cái 7 nút — An +10 · Bình −5". */
  private summary(): string {
    const lines = this.state.results.map((l) => `${l.name} ${l.net > 0 ? `+${l.net}` : l.net < 0 ? `−${-l.net}` : 'hòa'}`);
    return `🃏 Bài Cào ván ${this.state.round}: nhà cái ${baiCaoLabel(this.state.dealer)} — ${lines.join(' · ')}`;
  }
}
