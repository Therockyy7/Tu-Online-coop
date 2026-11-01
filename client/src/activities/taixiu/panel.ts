// Bảng cược Tài Xỉu (bộ UI sòng dùng chung): đầu pha + đồng hồ, ví Công Đức/Đức, hàng phỉnh (phím 1–4), 5 ô cược
// (chuột trái đặt / chuột phải gỡ), 3 xúc xắc ván vừa mở, kết quả của mình + người thắng, bảng cầu 16 ván.
// Panel là modal nên phím không tới onKey của module → bảng tự nghe keydown (pha capture) khi đang mở. Dựng lại khi
// trạng thái / ví đổi (đang nhấn chuột trong bảng thì hoãn tới lúc nhả — pressGuard); đồng hồ chỉ sửa chữ tại chỗ mỗi giây.
import { CASINO, TAIXIU } from '@shared/index';
import { stakeTotal } from '@shared/activities/casino';
import {
  TAIXIU_BETS,
  TAIXIU_LABELS,
  TAIXIU_SUBS,
  taiXiuOutcome,
  taiXiuSide,
  taiXiuWins,
  type TaiXiuBet,
  type TaiXiuOutcome,
  type TaiXiuPublicState,
} from '@shared/activities/taixiu';
import type { PanelHandle } from '../../ui/api';
import type { ClientActivityContext } from '../types';
import {
  betTile,
  beadRoad,
  chipRow,
  el,
  fmt,
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
import { PIPS } from './dice3d';

/** Màu ô: Tài đỏ, Xỉu lam, Chẵn/Lẻ nỉ xanh, Bộ Ba vàng (chiếm cả hàng). */
const TILE_CLS: Record<TaiXiuBet, string> = { tai: 'red', xiu: 'tx-xiu', chan: '', le: '', bo_ba: 'gold tx-boba' };
/** Hạt bảng cầu (lớp cs-bead: t đỏ / x lam / tri vàng). */
const BEAD_CLS = { tai: 't', xiu: 'x', triple: 'tri' } as const;

function headText(st: TaiXiuPublicState, o: TaiXiuOutcome | null): [string, PhaseTone] {
  switch (st.phase) {
    case 'betting':
      return ['Đặt cược đi! Tài hay Xỉu?', 'bet'];
    case 'resolving':
      return ['Nhà cái đang lắc bát…', 'roll'];
    case 'result':
      if (!o) return ['Mở bát!', 'result'];
      return [o.triple ? `Bộ ba ${st.dice[0]}! Nhà cái ăn` : `${o.sum} — ${o.tai ? 'TÀI' : 'XỈU'} · ${o.chan ? 'CHẴN' : 'LẺ'}`, 'result'];
    default:
      return ['Bàn đang nghỉ', 'idle'];
  }
}

/** 3 xúc xắc HTML (mặt 1 và 4 chấm đỏ như xúc xắc trên bàn) + tổng. */
function diceRow(parent: HTMLElement, dice: readonly number[], o: TaiXiuOutcome): void {
  const row = el('div', `tx-dice ${o.triple ? 'triple' : ''}`, parent);
  for (const v of dice) {
    const d = el('div', `tx-die ${v === 1 || v === 4 ? 'red' : ''}`, row);
    const pips = PIPS[v] ?? [];
    for (let i = 0; i < 9; i++) el('i', pips.includes(i) ? `on ${v === 1 ? 'big' : ''}` : '', d);
  }
  el('div', 'tx-sum', row, `= ${o.sum}`);
}

const totalOn = (st: TaiXiuPublicState, bet: TaiXiuBet): number => Object.values(st.bets).reduce((a, m) => a + (m[bet] ?? 0), 0);

export class TaiXiuPanel {
  private readonly panel: PanelHandle;
  private readonly press: PressGuard;
  private timer: HTMLElement | null = null;
  private shownSec = -1;
  private offSelf: (() => void) | null = null;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly state: () => TaiXiuPublicState | null,
    onClosed: () => void,
  ) {
    this.panel = ctx.ui.openPanel({
      id: 'taixiu',
      title: '🎲 Tài Xỉu chẵn lẻ',
      width: 540,
      className: 'tx-panel',
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
    const mine = st.bets[me.pid] ?? {};
    const betting = st.phase === 'betting';
    const o = st.phase === 'result' && st.dice.length === 3 ? taiXiuOutcome(st.dice) : null;

    const [text, tone] = headText(st, o);
    const secs = st.phase === 'idle' ? undefined : secondsLeft(st.endsAt, this.ctx.serverNow());
    this.timer = phaseHead(b, text, tone, secs).querySelector<HTMLElement>('.cs-timer');
    this.shownSec = secs ?? -1;
    walletRow(b, me, `Đang cược ${fmt(stakeTotal(mine))}/${CASINO.maxBetPerRound}`);
    if (o) diceRow(b, st.dice, o);
    chipRow(b);
    const grid = el('div', 'cs-grid tx-grid', b);
    for (const bet of TAIXIU_BETS) {
      betTile(grid, {
        label: TAIXIU_LABELS[bet],
        sub: TAIXIU_SUBS[bet],
        odds: `1:${TAIXIU.payout[bet]}`,
        mine: mine[bet],
        total: totalOn(st, bet),
        hit: !!o && taiXiuWins(bet, o),
        disabled: !betting,
        cls: TILE_CLS[bet],
        onAdd: () => this.ctx.send('bet', { bet, amount: selectedChip() }),
        onRemove: () => this.ctx.send('unbet', { bet, amount: selectedChip() }),
      });
    }
    if (st.phase === 'result') this.results(b, st);
    this.road(b, st);
    if (st.phase === 'idle') el('button', 'cs-btn tx-open', b, '🎲 Mở ván mới (E)').onclick = () => this.ctx.send('open');
    hint(
      b,
      betting
        ? 'Chuột trái: đặt phỉnh đang chọn · Chuột phải: gỡ · Phím 1–4: chọn phỉnh'
        : `Ra bộ ba (3 mặt giống nhau): Tài/Xỉu/Chẵn/Lẻ đều thua, chỉ Bộ Ba ăn ×${TAIXIU.payout.bo_ba}.`,
    );
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

  private results(b: HTMLElement, st: TaiXiuPublicState): void {
    const line = st.results.find((l) => l.pid === this.ctx.state.me.pid);
    resultBanner(b, line ? line.net : null);
    const winners = st.results
      .filter((l) => l.net > 0)
      .sort((x, y) => y.net - x.net)
      .slice(0, 4);
    if (winners.length) el('div', 'tx-winners', b, `Thắng: ${winners.map((l) => `${l.name} +${fmt(l.net)}`).join(' · ')}`);
  }

  private road(b: HTMLElement, st: TaiXiuPublicState): void {
    const box = el('div', 'tx-road', b);
    const head = el('div', 'tx-road-head', box);
    el('span', '', head, `Cầu ${TAIXIU.history} ván gần nhất`);
    const n = { tai: 0, xiu: 0, triple: 0 };
    const beads = st.history.map((h) => {
      const side = taiXiuSide(h.dice);
      n[side]++;
      return { text: String(h.sum), cls: BEAD_CLS[side], title: `${h.dice.join('-')} = ${h.sum}` };
    });
    el('span', 'tx-tally', head, beads.length ? `Tài ${n.tai} · Xỉu ${n.xiu}${n.triple ? ` · Bộ ba ${n.triple}` : ''}` : 'Chưa có ván nào');
    beadRoad(box, beads);
  }

  /** Phím khi bảng đang mở và nằm trên cùng: 1–4 chọn phỉnh; E mở ván khi bàn nghỉ. Tổ hợp Ctrl/Meta/Alt để cho trình duyệt. */
  private onKey(e: KeyboardEvent): void {
    if (this.panel.closed || hasModifier(e) || !this.isTop()) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (handleChipKey(e, true)) {
      e.preventDefault();
      e.stopPropagation();
      const row = this.panel.body.querySelector('.cs-chips');
      if (row) CASINO.chips.forEach((v, i) => row.children[i]?.classList.toggle('on', v === selectedChip()));
      return;
    }
    if (e.code === 'KeyE' && this.state()?.phase === 'idle') {
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
