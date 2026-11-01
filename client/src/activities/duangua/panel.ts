// Bảng cược Đua Ngựa (bộ UI sòng dùng chung): đầu pha + đồng hồ, ví Công Đức/Đức, hàng phỉnh (phím 1–4), 6 ô ngựa (màu áo
// nài, tên, cơ hội, tỉ lệ ×o; chuột trái đặt / chuột phải gỡ), thứ hạng trực tiếp lúc đua (thanh tiến độ), kết quả của mình
// + người thắng, dãy ngựa về nhất các ván gần đây. Panel là modal nên phím không tới onKey của module → bảng tự nghe
// keydown (pha capture) khi đang mở. Dựng lại khi trạng thái / ví đổi (đang nhấn chuột trong bảng thì hoãn tới lúc nhả —
// pressGuard); đồng hồ + thứ hạng chỉ sửa tại chỗ.
import { CASINO, DUANGUA } from '@shared/index';
import { stakeTotal } from '@shared/activities/casino';
import { HORSES, horseKey, oddsLabel, raceOrderAt, raceProgressAt, type DuaNguaPublicState } from '@shared/activities/duangua';
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

/** Áo nài màu sáng (trắng, bạc) → chữ tối trên nền màu ngựa. */
const LIGHT = new Set([1, 4]);
/** Thứ hạng trực tiếp cập nhật tối đa chừng này lần mỗi giây. */
const STANDINGS_MS = 100;

function headText(st: DuaNguaPublicState): [string, PhaseTone] {
  switch (st.phase) {
    case 'betting':
      return ['Đặt cược ngựa về nhất!', 'bet'];
    case 'resolving':
      return ['Xuất phát! Ngựa đang đua…', 'roll'];
    case 'result':
      return st.winner === null ? ['Về đích!', 'result'] : [`🏆 ${HORSES[st.winner]!.name} về nhất!`, 'result'];
    default:
      return ['Đường đua đang nghỉ', 'idle'];
  }
}

const totalOn = (st: DuaNguaPublicState, key: string): number => Object.values(st.bets).reduce((a, m) => a + (m[key] ?? 0), 0);

/** Một dòng trên bảng thứ hạng: các phần tử sửa tại chỗ mỗi lần cập nhật. */
interface StandingRow {
  row: HTMLElement;
  rank: HTMLElement;
  bar: HTMLElement;
  note: HTMLElement;
}

export class DuaNguaPanel {
  private readonly panel: PanelHandle;
  private readonly press: PressGuard;
  private timer: HTMLElement | null = null;
  private shownSec = -1;
  private rows: StandingRow[] = [];
  private lastStandings = 0;
  private readonly order: number[] = [];
  private offSelf: (() => void) | null = null;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly state: () => DuaNguaPublicState | null,
    onClosed: () => void,
  ) {
    this.panel = ctx.ui.openPanel({
      id: 'duangua',
      title: '🏇 Đua Ngựa',
      width: 580,
      className: 'dn-panel',
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
    this.rows = [];
    const st = this.state();
    if (!st) {
      hint(b, 'Đang tải đường đua…');
      return;
    }
    const me = this.ctx.state.me;
    const mine = st.bets[me.pid] ?? {};
    const betting = st.phase === 'betting';

    const [text, tone] = headText(st);
    const secs = st.phase === 'idle' ? undefined : secondsLeft(st.endsAt, this.ctx.serverNow());
    this.timer = phaseHead(b, text, tone, secs).querySelector<HTMLElement>('.cs-timer');
    this.shownSec = secs ?? -1;
    walletRow(b, me, `Đang cược ${fmt(stakeTotal(mine))}/${CASINO.maxBetPerRound}`);
    if (st.phase === 'idle') {
      el('button', 'cs-btn dn-open', b, '🏇 Mở ván mới (E)').onclick = () => this.ctx.send('open');
    } else {
      chipRow(b);
      this.tiles(b, st, mine, betting);
    }
    if (st.race) this.standings(b, st);
    if (st.phase === 'result') this.results(b, st);
    this.recent(b, st);
    hint(
      b,
      betting
        ? 'Chuột trái: đặt phỉnh đang chọn · Chuột phải: gỡ · Phím 1–4: chọn phỉnh · Cược được nhiều ngựa'
        : `Ngựa về nhất trả cược × tỉ lệ (làm tròn xuống). Tối đa ${CASINO.maxBetPerRound} Công Đức mỗi ván.`,
    );
    this.lastStandings = 0;
    this.tick();
  }

  /** Mỗi khung hình: sửa chữ đồng hồ khi số giây đổi; thứ hạng trực tiếp ~10 lần/giây. */
  tick(): void {
    const st = this.state();
    if (this.panel.closed || !st) return;
    if (this.timer) {
      const s = secondsLeft(st.endsAt, this.ctx.serverNow());
      if (s !== this.shownSec) {
        this.shownSec = s;
        this.timer.textContent = `${s}s`;
        this.timer.classList.toggle('hot', s <= 5);
      }
    }
    const now = performance.now();
    if (!st.race || !this.rows.length || now - this.lastStandings < STANDINGS_MS) return;
    this.lastStandings = now;
    const race = st.race;
    const t = this.ctx.serverNow() - race.startAt;
    raceOrderAt(race, t, this.order);
    for (let pos = 0; pos < this.order.length; pos++) {
      const h = this.order[pos]!;
      const r = this.rows[h];
      if (!r) continue;
      const p = raceProgressAt(race, h, t);
      const done = p >= 1;
      r.row.style.order = String(pos);
      r.row.classList.toggle('done', done);
      r.row.classList.toggle('first', done && pos === 0);
      r.rank.textContent = String(pos + 1);
      r.bar.style.transform = `scaleX(${p.toFixed(3)})`;
      r.note.textContent = done ? `${(race.finish[h]! / 1000).toFixed(2).replace('.', ',')}s` : `${Math.round(p * 100)}%`;
    }
  }

  /** 6 ô ngựa: dải màu áo nài, tên, cơ hội về nhất, tỉ lệ; ô ngựa về nhất sáng lên ở pha kết quả. */
  private tiles(b: HTMLElement, st: DuaNguaPublicState, mine: Record<string, number>, betting: boolean): void {
    const grid = el('div', 'cs-grid dn-grid', b);
    HORSES.forEach((h, i) => {
      const key = horseKey(i);
      const o = st.odds[i];
      const p = st.probs[i];
      const tile = betTile(grid, {
        label: h.name,
        sub: p === undefined ? undefined : `Cơ hội ~${Math.max(1, Math.round(p * 100))}%`,
        odds: o === undefined ? undefined : oddsLabel(o),
        mine: mine[key],
        total: totalOn(st, key),
        hit: st.phase === 'result' && st.winner === i,
        disabled: !betting,
        cls: 'dn-tile',
        onAdd: () => this.ctx.send('bet', { horse: i, amount: selectedChip() }),
        onRemove: () => this.ctx.send('unbet', { horse: i, amount: selectedChip() }),
      });
      const num = el('span', `dn-num ${LIGHT.has(i) ? 'light' : ''}`, null, String(i + 1));
      num.style.background = h.color;
      tile.querySelector('.cs-tile-label')?.prepend(num);
      el('span', 'dn-stripe', tile).style.background = h.color;
    });
  }

  /** Thứ hạng trực tiếp (cũng giữ nguyên lúc kết quả): mỗi ngựa 1 dòng, đổi chỗ bằng CSS order, không dựng lại DOM. */
  private standings(b: HTMLElement, st: DuaNguaPublicState): void {
    const box = el('div', 'dn-standings', b);
    const mine = st.bets[this.ctx.state.me.pid] ?? {};
    HORSES.forEach((h, i) => {
      const row = el('div', `dn-row ${mine[horseKey(i)] ? 'mine' : ''}`, box);
      const rank = el('span', 'dn-rank', row, '–');
      const num = el('span', `dn-num ${LIGHT.has(i) ? 'light' : ''}`, row, String(i + 1));
      num.style.background = h.color;
      el('span', 'dn-name', row, h.name);
      const track = el('span', 'dn-bar', row);
      const bar = el('i', '', track);
      bar.style.background = h.color;
      const note = el('span', 'dn-note', row, '');
      this.rows[i] = { row, rank, bar, note };
    });
  }

  private results(b: HTMLElement, st: DuaNguaPublicState): void {
    const line = st.results.find((l) => l.pid === this.ctx.state.me.pid);
    resultBanner(b, line ? line.net : null);
    const winners = st.results
      .filter((l) => l.net > 0)
      .sort((x, y) => y.net - x.net)
      .slice(0, 4);
    if (winners.length) el('div', 'dn-winners', b, `Thắng: ${winners.map((l) => `${l.name} +${fmt(l.net)}`).join(' · ')}`);
  }

  /** Dãy ngựa về nhất các ván gần đây (cũ → mới). */
  private recent(b: HTMLElement, st: DuaNguaPublicState): void {
    const box = el('div', 'dn-recent', b);
    el('div', 'dn-recent-head', box, st.history.length ? `Về nhất ${DUANGUA.history} ván gần nhất` : 'Chưa có ván nào');
    const road = beadRoad(
      box,
      st.history.map((r) => ({
        text: String(r.winner + 1),
        cls: LIGHT.has(r.winner) ? 'dn-bead light' : 'dn-bead',
        title: `Ván ${r.round}: ${HORSES[r.winner]!.name} ${oddsLabel(r.odds)}`,
      })),
    );
    st.history.forEach((r, i) => {
      const bead = road.children[i] as HTMLElement | undefined;
      if (bead) bead.style.background = HORSES[r.winner]!.color;
    });
  }

  /** Phím khi bảng đang mở và nằm trên cùng: 1–4 chọn phỉnh; E mở ván khi đường đua nghỉ. Tổ hợp Ctrl/Meta/Alt để cho trình duyệt. */
  private onKey(e: KeyboardEvent): void {
    if (this.panel.closed || hasModifier(e) || !this.isTop() || this.ctx.ui.isTyping()) return;
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
