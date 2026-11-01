// Bảng Xì Dách (bộ UI sòng dùng chung): đầu pha + đồng hồ, ví Công Đức/Đức, phỉnh + ô cược (pha đặt), tay nhà cái (lá tẩy
// úp tới khi lật), các ghế theo số (tay mình tô sáng, điểm/hạng, kết quả lúc nhà cái xét), nút Rút (R) / Dằn (T), kết quả.
// Panel là modal nên phím không tới onKey của module → bảng tự nghe keydown (pha capture) khi đang mở. Dựng lại khi
// trạng thái / ví đổi (đang nhấn chuột trong bảng thì hoãn tới lúc nhả — pressGuard); đồng hồ chỉ sửa chữ tại chỗ mỗi giây.
import { CASINO, XIDACH } from '@shared/index';
import type { Card } from '@shared/activities/cards';
import {
  xiDachCanStand,
  xiDachHandLabel,
  xiDachPoints,
  type XiDachPublicState,
  type XiDachSeat,
  type XiDachVerdict,
} from '@shared/activities/xidach';
import type { PanelHandle } from '../../ui/api';
import type { ClientActivityContext } from '../types';
import {
  betTile,
  chipRow,
  el,
  fmt,
  handRow,
  handleChipKey,
  hasModifier,
  hint,
  phaseHead,
  pressGuard,
  resultBanner,
  secondsLeft,
  selectedChip,
  walletRow,
  type PhaseTone,
  type PressGuard,
} from '../casino/ui';

const VERDICT: Record<XiDachVerdict, string> = { win: 'Thắng', push: 'Hòa', lose: 'Thua' };
/** Chặn bấm dồn (nhấp đúp / phím lặp) trong lúc chờ server trả trạng thái mới. */
const PENDING_MS = 450;
const P = XIDACH.payout;

/** Các lá nhà cái đã ngửa (bỏ lá tẩy null). */
const shownCards = (st: XiDachPublicState): Card[] => st.dealer.cards.filter((c): c is Card => c !== null);

/** Nhãn tay nhà cái: đã lật → đủ nhãn; chưa lật → điểm lá ngửa + "?". */
function dealerLabel(st: XiDachPublicState): string {
  const shown = shownCards(st);
  if (!shown.length) return '';
  return st.dealer.revealed ? xiDachHandLabel(shown) : `${xiDachPoints(shown)} + ?`;
}

function headText(st: XiDachPublicState, mine: XiDachSeat | undefined): [string, PhaseTone] {
  switch (st.phase) {
    case 'betting':
      if (!mine && st.seats.length >= XIDACH.seats) return [`Bàn đủ ${XIDACH.seats} ghế — xem ván này nhé`, 'bet'];
      return ['Đặt cược đi! Ai vào ghế?', 'bet'];
    case 'resolving':
      if (st.step === 'deal') return ['Nhà cái đang chia bài…', 'roll'];
      if (st.step === 'turn') {
        if (mine && !mine.done) return ['Lượt bạn: Rút hay Dằn?', 'bet'];
        return [mine ? 'Bạn đã dừng — chờ cả bàn…' : 'Cả bàn đang rút / dằn…', 'roll'];
      }
      return ['Nhà cái lật bài, rút và xét…', 'roll'];
    case 'result':
      return [st.dealer.revealed ? `Nhà cái ${dealerLabel(st)}` : 'Ván kết thúc', 'result'];
    default:
      return ['Bàn đang nghỉ', 'idle'];
  }
}

export class XiDachPanel {
  private readonly panel: PanelHandle;
  private readonly press: PressGuard;
  private timer: HTMLElement | null = null;
  private shownSec = -1;
  private pendingUntil = 0;
  private offSelf: (() => void) | null = null;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly state: () => XiDachPublicState | null,
    onClosed: () => void,
  ) {
    this.panel = ctx.ui.openPanel({
      id: 'xidach',
      title: '🃏 Xì Dách',
      width: 520,
      className: 'xd-panel',
      onClose: () => {
        removeEventListener('keydown', this.keyHandler, true);
        this.press.dispose();
        this.offSelf?.();
        this.offSelf = null;
        onClosed();
      },
    });
    this.press = pressGuard(this.panel.body, () => this.render());
    addEventListener('keydown', this.keyHandler, true);
    this.offSelf = ctx.state.on('self', (e) => {
      if ('congDuc' in e.patch || 'duc' in e.patch) this.render();
    });
    this.render();
  }

  get closed(): boolean {
    return this.panel.closed;
  }

  close(): void {
    this.panel.close();
  }

  render(): void {
    if (this.panel.closed || this.press.hold()) return;
    this.pendingUntil = 0;
    const b = this.panel.body;
    b.replaceChildren();
    this.timer = null;
    const st = this.state();
    if (!st) {
      hint(b, 'Đang tải bàn…');
      return;
    }
    const me = this.ctx.state.me;
    const mine = st.seats.find((s) => s.pid === me.pid);
    const [text, tone] = headText(st, mine);
    // Bước nhà cái không có hạn cố định (mỗi lá 1 nhịp) → không hiện đồng hồ.
    const secs = st.phase === 'idle' || st.step === 'dealer' ? undefined : secondsLeft(st.endsAt, this.ctx.serverNow());
    this.timer = phaseHead(b, text, tone, secs).querySelector<HTMLElement>('.cs-timer');
    this.shownSec = secs ?? -1;
    walletRow(b, me, mine ? `Ghế ${mine.seat} · cược ${fmt(mine.stake)}/${CASINO.maxBetPerRound}` : `Tối đa ${CASINO.maxBetPerRound}/ván`);
    if (st.phase === 'betting') this.betting(b, st, mine);
    this.hands(b, st, me.pid);
    if (st.phase === 'resolving' && st.step === 'turn' && mine) this.actions(b, mine);
    if (st.phase === 'result') this.results(b, st, me.pid);
    if (st.phase === 'idle') el('button', 'cs-btn xd-open', b, '🃏 Mở ván mới (E)').onclick = () => this.ctx.send('open');
    hint(b, this.hintText(st, mine));
  }

  /** Mỗi khung hình: chỉ sửa chữ đồng hồ khi số giây đổi. */
  tick(): void {
    const st = this.state();
    if (this.panel.closed || !st || !this.timer) return;
    const s = secondsLeft(st.endsAt, this.ctx.serverNow());
    if (s === this.shownSec) return;
    this.shownSec = s;
    this.timer.textContent = `${s}s`;
    this.timer.classList.toggle('hot', s <= 5);
  }

  /** Pha đặt: hàng phỉnh + ô cược (vào ghế / cược thêm) + bảng lãi. */
  private betting(b: HTMLElement, st: XiDachPublicState, mine: XiDachSeat | undefined): void {
    chipRow(b);
    const full = !mine && st.seats.length >= XIDACH.seats;
    const free = XIDACH.seats - st.seats.length;
    betTile(el('div', 'xd-bet', b), {
      label: mine ? `Ghế ${mine.seat} — cược tay này` : full ? 'Bàn đủ ghế' : 'Vào ghế',
      sub: mine ? 'Chuột trái cược thêm · chuột phải gỡ' : full ? 'Chờ ván sau nhé' : `Còn ${free}/${XIDACH.seats} ghế trống`,
      odds: `1:${P.win}`,
      mine: mine?.stake,
      total: st.seats.reduce((a, s) => a + s.stake, 0),
      disabled: full,
      onAdd: () => this.ctx.send('bet', { amount: selectedChip() }),
      onRemove: () => this.ctx.send('unbet', { amount: selectedChip() }),
    });
    el('div', 'xd-pay', b, `Lãi: thắng ×${P.win} · Ngũ Linh ×${P.ngu_linh} · Xì Dách ×${P.xi_dach} · Xì Bàng ×${P.xi_bang}`);
  }

  /** Mặt bàn: tay nhà cái rồi các ghế theo số (tay mình tô sáng). */
  private hands(b: HTMLElement, st: XiDachPublicState, myPid: string): void {
    const felt = el('div', 'xd-felt', b);
    handRow(felt, 'Nhà cái', st.dealer.cards, dealerLabel(st)).classList.add('xd-dealer');
    if (!st.seats.length) {
      el('div', 'xd-empty', felt, st.phase === 'betting' ? 'Chưa ai vào ghế — đặt phỉnh để ngồi ghế 1.' : 'Chưa có ai cược.');
      return;
    }
    for (const s of st.seats) {
      const me = s.pid === myPid;
      const score = s.cards.length ? xiDachHandLabel(s.cards) : `Cược ${fmt(s.stake)}`;
      const row = handRow(felt, `${s.seat}. ${me ? 'Bạn' : s.name}`, s.cards, score, me);
      row.title = `${s.name} · cược ${fmt(s.stake)}`;
      if (s.result) el('span', `xd-verdict ${s.result}`, row, VERDICT[s.result]);
      else if (s.done && st.phase === 'resolving') el('span', 'xd-verdict wait', row, 'Dừng');
    }
  }

  /** Nút Rút / Dằn của mình (Dằn khóa khi chưa đủ tuổi). */
  private actions(b: HTMLElement, mine: XiDachSeat): void {
    const row = el('div', 'cs-actions', b);
    const hit = el('button', 'cs-btn', row, '🃏 Rút (R)');
    const stand = el('button', 'cs-btn alt', row, '✋ Dằn (T)');
    const canStand = xiDachCanStand(mine.cards);
    hit.disabled = mine.done;
    stand.disabled = mine.done || !canStand;
    if (!mine.done && !canStand) stand.title = `Cần đủ ${XIDACH.playerMinStand} điểm mới được dằn`;
    hit.onclick = () => this.act('hit');
    stand.onclick = () => this.act('stand');
  }

  private results(b: HTMLElement, st: XiDachPublicState, myPid: string): void {
    const line = st.results.find((l) => l.pid === myPid);
    resultBanner(b, line ? line.net : null);
    const winners = st.results
      .filter((l) => l.net > 0)
      .sort((x, y) => y.net - x.net)
      .slice(0, 4);
    if (winners.length) el('div', 'xd-winners', b, `Thắng: ${winners.map((l) => `${l.name} +${fmt(l.net)}`).join(' · ')}`);
  }

  private hintText(st: XiDachPublicState, mine: XiDachSeat | undefined): string {
    const min = XIDACH.playerMinStand;
    if (st.phase === 'betting') return 'Chuột trái: đặt phỉnh đang chọn · Chuột phải: gỡ · Phím 1–4: chọn phỉnh';
    if (st.step === 'turn' && mine && !mine.done) {
      return `R rút · T dằn (đủ ${min} điểm) · 21 điểm hoặc ${XIDACH.maxCards} lá tự dừng · hết giờ tự rút tới ${min} rồi dằn`;
    }
    if (st.step === 'dealer') {
      return `Nhà cái rút tới ${XIDACH.dealerStandAt} rồi xét: chốt người thua / hòa (kể cả người Quắc), còn ai hơn điểm thì rút tiếp.`;
    }
    return `Xì Bàng > Xì Dách > Ngũ Linh > điểm thường · Nhà cái đủ ${XIDACH.dealerStandAt} là xét: người Quắc thua; nhà cái Quắc trước lúc xét thì người Quắc hòa.`;
  }

  private act(type: 'hit' | 'stand'): void {
    const now = performance.now();
    if (now < this.pendingUntil) return;
    this.pendingUntil = now + PENDING_MS;
    this.ctx.send(type);
  }

  /**
   * Phím khi bảng đang mở và nằm trên cùng: 1–4 chọn phỉnh; R rút, T dằn (lượt của mình); E mở ván khi bàn nghỉ. Tổ hợp
   * Ctrl/Meta/Alt để cho trình duyệt (Ctrl+R là tải lại trang, không phải Rút bài).
   */
  private onKey(e: KeyboardEvent): void {
    if (this.panel.closed || hasModifier(e) || !this.isTop() || this.ctx.ui.isTyping()) return;
    const st = this.state();
    if (!st) return;
    if (handleChipKey(e, true)) {
      e.preventDefault();
      e.stopPropagation();
      const row = this.panel.body.querySelector('.cs-chips');
      if (row) CASINO.chips.forEach((v, i) => row.children[i]?.classList.toggle('on', v === selectedChip()));
      return;
    }
    if (e.code === 'KeyR' || e.code === 'KeyT') {
      const mine = st.seats.find((s) => s.pid === this.ctx.state.me.pid);
      if (st.phase !== 'resolving' || st.step !== 'turn' || !mine || mine.done) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.act(e.code === 'KeyR' ? 'hit' : 'stand');
      return;
    }
    if (e.code === 'KeyE' && st.phase === 'idle') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.ctx.send('open');
    }
  }

  /** Bảng này là modal trên cùng (không có bảng / hộp chọn khác đè lên). */
  private isTop(): boolean {
    const wrap = this.panel.el.parentElement;
    return !!wrap && wrap.parentElement?.lastElementChild === wrap;
  }
}
