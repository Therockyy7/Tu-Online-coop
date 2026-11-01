// Bàn Xì Dách (Sòng Công Đức) phía server — máy trạng thái của 1 bàn: đặt cược (StakeBook, ô 'hand', ghế theo thứ tự
// đặt) → chia 2 lá → cả bàn rút/dằn cùng lúc → nhà cái lật + rút từng lá + xét dần → trả thưởng → ván kế. Lá tẩy của nhà
// cái chỉ nằm ở dealerCards tới khi lật (trạng thái công khai giữ null). Ván không ai cược thì không chia, sang ván kế;
// bàn tự nghỉ sau CASINO.idleRounds ván trống hoặc khi không còn ai đứng gần. index.ts kiểm dữ liệu + định tuyến thao tác.
import { CASINO, JOKES, XIDACH, type Pid, type Rng } from '@shared/index';
import type { Card } from '@shared/activities/cards';
import {
  autoPlayXiDach,
  compareXiDach,
  isXiDachSpecial,
  xiDachAutoStop,
  xiDachCanStand,
  xiDachDealerStep,
  xiDachHandLabel,
  xiDachPayout,
  xiDachRank,
  type XiDachPublicState,
  type XiDachSeat,
} from '@shared/activities/xidach';
import { StakeBook } from '../casino/stakes';
import type { ActivityContext, LeaveReason, ServerPlayerView } from '../types';

const STATION = 'xidach_table';
/** Ô cược duy nhất của Xì Dách (cả tay bài). */
const HAND = 'hand';

export class XiDachTable {
  readonly state: XiDachPublicState = {
    phase: 'idle',
    step: null,
    endsAt: 0,
    round: 0,
    dealAt: 0,
    seats: [],
    dealer: { cards: [], revealed: false },
    turnEndsAt: 0,
    results: [],
  };
  private readonly book: StakeBook;
  private deck: Card[] = [];
  private drawn = 0;
  /** Tay đầy đủ của nhà cái (kể cả lá tẩy chưa lật). */
  private dealerCards: Card[] = [];
  private idleRounds = 0;
  private cancel: (() => void) | null = null;

  constructor(
    private readonly ctx: ActivityContext,
    private readonly newDeck: (rng: Rng) => Card[],
  ) {
    this.book = new StakeBook(ctx, 'Xì Dách');
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
    this.ctx.chatSystem(`🃏 ${p.name} mở bàn Xì Dách. Đặt cược trong ${Math.round(XIDACH.betMs / 1000)} giây!`);
  }

  bet(p: ServerPlayerView, amount: number): void {
    if (this.state.phase !== 'betting') return this.ctx.toast(p.pid, 'Ngoài giờ đặt cược — chờ ván sau nhé.', 'warn');
    if (!this.near(p.pid)) return this.ctx.toast(p.pid, JOKES.tooFar, 'warn');
    if (!this.book.has(p.pid) && this.book.bettors().length >= XIDACH.seats) {
      return this.ctx.toast(p.pid, `Bàn đã đủ ${XIDACH.seats} ghế — chờ ván sau nhé.`, 'warn');
    }
    const err = this.book.place(p, HAND, amount);
    if (err) return this.ctx.toast(p.pid, err, 'warn');
    this.syncSeats();
    this.publish();
  }

  unbet(p: ServerPlayerView, amount: number): void {
    if (this.state.phase !== 'betting') return this.ctx.toast(p.pid, 'Đã chia bài, không gỡ cược được nữa.', 'warn');
    if (!this.near(p.pid)) return this.ctx.toast(p.pid, JOKES.tooFar, 'warn');
    if (this.book.remove(p.pid, HAND, amount) === 0) return;
    this.syncSeats();
    this.publish();
  }

  hit(p: ServerPlayerView): void {
    const s = this.turnSeat(p);
    if (!s) return;
    s.cards.push(this.draw());
    if (xiDachAutoStop(s.cards)) s.done = true;
    this.afterMove();
  }

  stand(p: ServerPlayerView): void {
    const s = this.turnSeat(p);
    if (!s) return;
    if (!xiDachCanStand(s.cards)) return this.ctx.toast(p.pid, `Chưa đủ ${XIDACH.playerMinStand} điểm — phải rút thêm.`, 'warn');
    s.done = true;
    this.afterMove();
  }

  /**
   * Đang đặt cược mà rời phòng / mất kết nối → hoàn, nhường ghế (như Bầu Cua). Esc chỉ đóng bảng, cược giữ nguyên.
   * Từ lúc chia (bài đã lộ trong trạng thái công khai) mà rời hẳn phòng → MẤT cược như Bài Cào / Đua Ngựa (nếu hoàn thì ai
   * thấy bài xấu chỉ việc rời phòng là lấy lại tiền): giữ ghế + bài, đang lượt rút/dằn thì tự chơi như hết giờ và xong
   * ngay (bàn khỏi chờ người vắng); settle bỏ qua người vắng nên dòng kết quả ghi −cược. Đang chia mà rời thì startTurn tự
   * chơi giùm. Mất kết nối tạm thời → giữ ghế (hết giờ tự chơi), trả như thường.
   */
  leave(p: ServerPlayerView, reason: LeaveReason): void {
    if (reason === 'esc' || !this.book.has(p.pid)) return;
    if (this.state.phase === 'betting') {
      this.book.refund(p.pid);
      this.syncSeats();
      return this.publish();
    }
    if (this.state.phase !== 'resolving' || reason !== 'left' || this.state.step !== 'turn') return;
    const s = this.state.seats.find((x) => x.pid === p.pid);
    if (!s || s.done) return;
    autoPlayXiDach(s.cards, () => this.draw());
    s.done = true;
    this.afterMove();
  }

  /** Đổi map: ván chưa trả thì hoàn toàn bộ cược, bàn về nghỉ. */
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
    Object.assign(st, { phase: 'betting', step: null, endsAt: this.ctx.now() + XIDACH.betMs, dealAt: 0, turnEndsAt: 0, results: [] });
    st.round++;
    st.dealer = { cards: [], revealed: false };
    this.dealerCards = [];
    this.syncSeats();
    this.publish();
    this.schedule(() => this.deal(), XIDACH.betMs);
  }

  /** Hết giờ đặt: chốt ghế, xào bộ mới, chia 2 vòng (ghế 1..n rồi nhà cái; lá thứ 2 của nhà cái là lá tẩy). */
  private deal(): void {
    if (this.book.isEmpty) {
      this.idleRounds++;
      return this.nextRound();
    }
    this.syncSeats();
    this.deck = this.newDeck(this.ctx.rng);
    this.drawn = 0;
    this.dealerCards = [];
    for (let i = 0; i < 2; i++) {
      for (const s of this.state.seats) s.cards.push(this.draw());
      this.dealerCards.push(this.draw());
    }
    const now = this.ctx.now();
    Object.assign(this.state, { phase: 'resolving', step: 'deal', dealAt: now, endsAt: now + XIDACH.dealMs });
    this.state.dealer = { cards: [this.dealerCards[0]!, null], revealed: false };
    this.publish();
    this.schedule(() => this.afterDeal(), XIDACH.dealMs);
  }

  /** Chia xong: nhà cái Xì Bàng / Xì Dách thì lật ngay và chốt ván, không thì vào lượt rút/dằn. */
  private afterDeal(): void {
    if (!isXiDachSpecial(this.dealerCards)) return this.startTurn();
    this.reveal();
    for (const s of this.state.seats) s.result = compareXiDach(s.cards, this.dealerCards);
    this.finish();
  }

  private startTurn(): void {
    const now = this.ctx.now();
    Object.assign(this.state, { step: 'turn', turnEndsAt: now + XIDACH.turnMs, endsAt: now + XIDACH.turnMs });
    for (const s of this.state.seats) {
      if (this.ctx.player(s.pid)) {
        if (xiDachAutoStop(s.cards)) s.done = true;
        continue;
      }
      // Rời hẳn phòng lúc đang chia (cược đã mất): tự chơi giùm ngay như hết giờ để bàn khỏi chờ người vắng.
      autoPlayXiDach(s.cards, () => this.draw());
      s.done = true;
    }
    if (this.allDone()) return this.startDealer();
    this.publish();
    this.schedule(() => this.turnTimeout(), XIDACH.turnMs);
  }

  /** Hết giờ: ghế chưa xong tự rút tới đủ tuổi rồi dằn (kể cả người đang mất kết nối). */
  private turnTimeout(): void {
    for (const s of this.state.seats) {
      if (s.done) continue;
      autoPlayXiDach(s.cards, () => this.draw());
      s.done = true;
    }
    this.startDealer();
  }

  /** Cả bàn xong: nhà cái lật lá tẩy, mỗi XIDACH.dealerStepMs đi 1 bước (rút / xét). Không còn ghế thì chốt luôn. */
  private startDealer(): void {
    if (this.state.seats.length === 0) return this.finish();
    this.reveal();
    this.state.step = 'dealer';
    this.state.endsAt = this.ctx.now() + XIDACH.dealerStepMs;
    this.publish();
    this.schedule(() => this.dealerTick(), XIDACH.dealerStepMs);
  }

  private dealerTick(): void {
    const seats = this.state.seats;
    const open = seats.flatMap((s, i) => (s.result === undefined ? [i] : []));
    const move = xiDachDealerStep(this.dealerCards, seats.map((s) => s.cards), open);
    for (const i of move.settle) seats[i]!.result = compareXiDach(seats[i]!.cards, this.dealerCards);
    if (!move.draw) return this.finish();
    this.dealerCards.push(this.draw());
    this.reveal();
    this.state.endsAt = this.ctx.now() + XIDACH.dealerStepMs;
    this.publish();
    this.schedule(() => this.dealerTick(), XIDACH.dealerStepMs);
  }

  /** Trả thưởng theo kết quả từng ghế (sổ cộng Tạp Niệm + toast), báo chat nếu có cược, hẹn ván kế. */
  private finish(): void {
    const anyBets = !this.book.isEmpty;
    const returns: Record<Pid, number> = {};
    for (const s of this.state.seats) {
      const stake = this.book.totalOf(s.pid);
      returns[s.pid] = s.result ? xiDachPayout(stake, s.result, xiDachRank(s.cards)) : stake;
    }
    const st = this.state;
    st.results = this.book.settle(returns);
    Object.assign(st, { phase: 'result', step: null, endsAt: this.ctx.now() + XIDACH.resultMs });
    this.publish();
    if (anyBets) this.ctx.chatSystem(this.summary());
    this.idleRounds = anyBets ? 0 : this.idleRounds + 1;
    this.schedule(() => this.nextRound(), XIDACH.resultMs);
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

  /** Lúc đặt cược: ghế = người đã cược theo thứ tự đặt lần đầu (chưa có bài). */
  private syncSeats(): void {
    this.state.seats = this.book.bettors().map<XiDachSeat>((pid, i) => ({
      seat: i + 1,
      pid,
      name: this.book.nameOf(pid),
      cards: [],
      stake: this.book.totalOf(pid),
      done: false,
    }));
  }

  /** Ghế của người đang được rút/dằn (đúng bước, chưa xong, đứng gần) — null nếu không hợp lệ. */
  private turnSeat(p: ServerPlayerView): XiDachSeat | null {
    if (this.state.phase !== 'resolving' || this.state.step !== 'turn') return null;
    const s = this.state.seats.find((x) => x.pid === p.pid);
    if (!s || s.done) return null;
    if (!this.near(p.pid)) {
      this.ctx.toast(p.pid, JOKES.tooFar, 'warn');
      return null;
    }
    return s;
  }

  private allDone(): boolean {
    return this.state.seats.every((s) => s.done);
  }

  private afterMove(): void {
    if (this.allDone()) this.startDealer();
    else this.publish();
  }

  private draw(): Card {
    // 52 lá luôn đủ cho 5 ghế × 5 lá + nhà cái 5 lá; phòng hờ hết lá thì xào bộ mới.
    if (this.drawn >= this.deck.length) {
      this.deck = this.newDeck(this.ctx.rng);
      this.drawn = 0;
    }
    return this.deck[this.drawn++]!;
  }

  /** Lật bài nhà cái: chép cả tay (gồm lá tẩy) ra trạng thái công khai. */
  private reveal(): void {
    this.state.dealer = { cards: [...this.dealerCards], revealed: true };
  }

  private toIdle(): void {
    Object.assign(this.state, { phase: 'idle', step: null, endsAt: 0, dealAt: 0, seats: [], turnEndsAt: 0, results: [] });
    this.state.dealer = { cards: [], revealed: false };
    this.dealerCards = [];
  }

  private schedule(fn: () => void, ms: number): void {
    this.cancel?.();
    this.cancel = this.ctx.setTimeout(fn, ms);
  }

  /** Tin chat chốt ván, vd "🃏 Xì Dách ván 3: nhà cái 19 điểm — An +10 · Bình −5". */
  private summary(): string {
    const lines = this.state.results.map((l) => `${l.name} ${l.net > 0 ? `+${l.net}` : l.net < 0 ? `−${-l.net}` : 'hòa'}`);
    return `🃏 Xì Dách ván ${this.state.round}: nhà cái ${xiDachHandLabel(this.dealerCards)} — ${lines.join(' · ')}`;
  }
}
