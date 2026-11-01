// Bảng Bài Cào 3 lá (bộ UI sòng dùng chung): đầu pha + đồng hồ, ví Công Đức/Đức, phỉnh + ô cược "tay của bạn" (pha đặt),
// mặt nỉ: tay nhà cái, tay mình (tô sáng) và danh sách tay khác (cuộn khi đông — không giới hạn số người); lá úp tới đúng
// mốc lật baiCaoFlipAt như trên bàn 3D, nút + Thắng/Thua hiện khi đủ 3 lá / khi chốt ván; kết quả của mình + người thắng.
// Panel là modal nên phím không tới onKey của module → bảng tự nghe keydown (pha capture) khi đang mở. Dựng lại khi trạng
// thái / ví đổi hoặc khi qua 1 đợt lật (lúc đó không còn ô cược) — đang nhấn chuột trong bảng thì hoãn tới lúc nhả
// (pressGuard); đồng hồ chỉ sửa chữ tại chỗ mỗi giây. Lớp CSS riêng tiền tố `bk-` (baicao.css; `bc-` là của Bầu Cua).
import { BAICAO, CASINO } from '@shared/index';
import type { Card } from '@shared/activities/cards';
import { BAICAO_FLIPS, baiCaoLabel, baiCaoShown, type BaiCaoHand, type BaiCaoPublicState, type BaiCaoVerdict } from '@shared/activities/baicao';
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

const VERDICT: Record<BaiCaoVerdict, string> = { win: 'Thắng', lose: 'Thua' };
const P = BAICAO.payout;
const RULES =
  `Nút = tổng điểm 3 lá mod 10 (Át 1, 10/J/Q/K = 10) · Ba Tiên (3 lá J/Q/K) cao nhất, ăn ×${P.ba_tien} · Bằng nút so lá lớn ` +
  'nhất (K > Q > J > 10 > … > Át), vẫn bằng thì nhà cái ăn · Bù gặp bù (cùng 0 nút) nhà cái ăn luôn.';

/** Lá hiện trên bảng: lá thứ i chỉ ngửa khi đã qua đợt lật i (cùng nhịp lá 3D). */
const visible = (cards: readonly Card[], shown: number): (Card | null)[] => cards.map((c, i) => (i < shown ? c : null));

function headText(st: BaiCaoPublicState, mine: BaiCaoHand | undefined, shown: number): [string, PhaseTone] {
  switch (st.phase) {
    case 'betting':
      return [mine ? 'Cược thêm hay chờ chia bài?' : 'Đặt cược đi! Bao nhiêu người cũng vào được', 'bet'];
    case 'resolving':
      return [shown < BAICAO_FLIPS ? 'Nhà cái chia bài, lật dần…' : 'Lật xong — nhà cái chốt…', 'roll'];
    case 'result':
      return [`Nhà cái ${baiCaoLabel(st.dealer)}`, 'result'];
    default:
      return ['Bàn đang nghỉ', 'idle'];
  }
}

export class BaiCaoPanel {
  private readonly panel: PanelHandle;
  private readonly press: PressGuard;
  private timer: HTMLElement | null = null;
  private shownSec = -1;
  /** Số đợt lật đã vẽ (dựng lại bảng khi qua đợt mới). */
  private shownFlips = -1;
  private offSelf: (() => void) | null = null;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly state: () => BaiCaoPublicState | null,
    onClosed: () => void,
  ) {
    this.panel = ctx.ui.openPanel({
      id: 'baicao',
      title: '🃏 Bài Cào 3 lá',
      width: 520,
      className: 'bk-panel',
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
    const b = this.panel.body;
    b.replaceChildren();
    this.timer = null;
    const st = this.state();
    if (!st) {
      hint(b, 'Đang tải bàn…');
      return;
    }
    const me = this.ctx.state.me;
    const mine = st.hands.find((x) => x.pid === me.pid);
    const shown = baiCaoShown(st, this.ctx.serverNow());
    this.shownFlips = shown;
    const [text, tone] = headText(st, mine, shown);
    const secs = st.phase === 'idle' ? undefined : secondsLeft(st.endsAt, this.ctx.serverNow());
    this.timer = phaseHead(b, text, tone, secs).querySelector<HTMLElement>('.cs-timer');
    this.shownSec = secs ?? -1;
    walletRow(b, me, mine ? `Tay ${mine.seat} · cược ${fmt(mine.stake)}/${CASINO.maxBetPerRound}` : `Tối đa ${CASINO.maxBetPerRound}/ván`);
    if (st.phase === 'betting') this.betting(b, st, mine);
    if (st.phase !== 'idle') this.felt(b, st, me.pid, shown);
    if (st.phase === 'result') this.results(b, st, me.pid);
    if (st.phase === 'idle') el('button', 'cs-btn bk-open', b, '🃏 Mở ván mới (E)').onclick = () => this.ctx.send('open');
    hint(b, st.phase === 'betting' ? 'Chuột trái: đặt phỉnh đang chọn · Chuột phải: gỡ · Phím 1–4: chọn phỉnh' : RULES);
  }

  /**
   * Mỗi khung hình: sửa chữ đồng hồ khi số giây đổi; qua đợt lật mới thì dựng lại để ngửa lá. Đồng hồ sửa trước: đang nhấn
   * chuột trong bảng thì render() bị hoãn (shownFlips chưa đổi) nên khung nào cũng gọi lại render() — đồng hồ vẫn phải chạy.
   */
  tick(): void {
    const st = this.state();
    if (this.panel.closed || !st) return;
    const now = this.ctx.serverNow();
    if (this.timer) {
      const s = secondsLeft(st.endsAt, now);
      if (s !== this.shownSec) {
        this.shownSec = s;
        this.timer.textContent = `${s}s`;
        this.timer.classList.toggle('hot', s <= 5);
      }
    }
    if (st.phase === 'resolving' && baiCaoShown(st, now) !== this.shownFlips) this.render();
  }

  /** Pha đặt: hàng phỉnh + ô cược tay của mình + bảng lãi. */
  private betting(b: HTMLElement, st: BaiCaoPublicState, mine: BaiCaoHand | undefined): void {
    chipRow(b);
    betTile(el('div', 'bk-bet', b), {
      label: mine ? `Tay ${mine.seat} — cược tay này` : 'Vào bàn — cược 1 tay',
      sub: mine ? 'Chuột trái cược thêm · chuột phải gỡ' : `Đã có ${st.hands.length} tay · không giới hạn người chơi`,
      odds: `1:${P.win}`,
      mine: mine?.stake,
      total: st.hands.reduce((a, x) => a + x.stake, 0),
      onAdd: () => this.ctx.send('bet', { amount: selectedChip() }),
      onRemove: () => this.ctx.send('unbet', { amount: selectedChip() }),
    });
    el('div', 'bk-pay', b, `Lãi: thắng ×${P.win} · Ba Tiên thắng ×${P.ba_tien} · bằng hẳn hoặc bù gặp bù: nhà cái ăn`);
  }

  /** Mặt nỉ: nhà cái, tay mình, rồi các tay khác (cuộn khi đông). */
  private felt(b: HTMLElement, st: BaiCaoPublicState, myPid: string, shown: number): void {
    const felt = el('div', 'bk-felt', b);
    const full = shown >= BAICAO_FLIPS;
    if (st.dealer.length) {
      handRow(felt, 'Nhà cái', visible(st.dealer, shown), full ? baiCaoLabel(st.dealer) : '').classList.add('bk-dealer');
    }
    if (!st.hands.length) {
      el('div', 'bk-empty', felt, st.phase === 'betting' ? 'Chưa ai cược — đặt phỉnh để vào tay 1.' : 'Ván này không ai cược.');
      return;
    }
    const mine = st.hands.find((x) => x.pid === myPid);
    if (mine) this.handLine(felt, mine, true, shown);
    const others = st.hands.filter((x) => x.pid !== myPid);
    if (!others.length) return;
    const list = el('div', 'bk-others', felt);
    for (const x of others) this.handLine(list, x, false, shown);
  }

  private handLine(parent: HTMLElement, x: BaiCaoHand, me: boolean, shown: number): void {
    const full = shown >= BAICAO_FLIPS && x.cards.length > 0;
    const label = `${x.seat}. ${me ? 'Bạn' : x.name}`;
    const score = full ? baiCaoLabel(x.cards) : `Cược ${fmt(x.stake)}`;
    const row = handRow(parent, label, visible(x.cards, shown), score, me);
    row.title = `${x.name} · cược ${fmt(x.stake)}`;
    if (x.result) el('span', `bk-verdict ${x.result}`, row, VERDICT[x.result]);
  }

  private results(b: HTMLElement, st: BaiCaoPublicState, myPid: string): void {
    const line = st.results.find((l) => l.pid === myPid);
    resultBanner(b, line ? line.net : null);
    const winners = st.results
      .filter((l) => l.net > 0)
      .sort((x, y) => y.net - x.net)
      .slice(0, 4);
    if (winners.length) el('div', 'bk-winners', b, `Thắng: ${winners.map((l) => `${l.name} +${fmt(l.net)}`).join(' · ')}`);
  }

  /** Phím khi bảng đang mở và nằm trên cùng: 1–4 chọn phỉnh; E mở ván khi bàn nghỉ. Tổ hợp Ctrl/Meta/Alt để cho trình duyệt. */
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
