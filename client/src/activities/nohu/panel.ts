// Bảng điều khiển máy Nổ Hũ (đáy màn hình, position 'bottom'): ví Công Đức/Đức + Hũ Công Đức, mức cược (phím 1–4), nút
// QUAY (Space), kết quả lượt gần nhất của mình (ảnh biểu tượng canvas + đường thắng), nút rời máy (E). Panel là modal nên
// phím không tới onKey của module → bảng tự nghe keydown (pha bắt) khi đang mở; Esc do engine đóng bảng → onClose báo rời
// máy (trừ khi server đã cho rời). Chỉ dựng lại DOM khi phần mình thấy thật sự đổi (đang nhấn chuột trong bảng thì hoãn
// tới lúc nhả — pressGuard, vì Hũ đổi mỗi lượt quay của người khác); mỗi khung chỉ bật/tắt nút QUAY.
import { NOHU } from '@shared/index';
import { noHuJackpotShare, noHuLineLabel, type NoHuMachine, type NoHuPublicState, type NoHuSpin } from '@shared/activities/nohu';
import type { PanelHandle } from '../../ui/api';
import type { ClientActivityContext } from '../types';
import { chipRow, el, fmt, handleChipKey, hasModifier, hint, pressGuard, selectedChip, walletRow, type PressGuard } from '../casino/ui';
import { symbolIcon } from './symbols';

/** Chặn bấm dồn (nhấp đúp / phím) trong lúc chờ server trả trạng thái lượt mới (ms, đồng hồ máy). */
const PENDING_MS = 500;
const BETS: readonly number[] = NOHU.bets;

/** Phần hũ ăn khi nổ hũ với mức cược này: "ăn trọn hũ" (cược tối đa) / "ăn 25% hũ" (noHuJackpotShare). */
function shareText(bet: number): string {
  const share = noHuJackpotShare(bet);
  return share >= 1 ? 'ăn trọn hũ' : `ăn ${Math.round(share * 100)}% hũ`;
}

export class NoHuPanel {
  private readonly panel: PanelHandle;
  private readonly press: PressGuard;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private offSelf: (() => void) | null = null;
  /** Server đã cho rời máy, hoặc mình đã tự gửi 'leave': đóng bảng không báo ngược lên nữa. */
  private silent = false;
  private spinBtn: HTMLButtonElement | null = null;
  private ready = false;
  private pendingUntil = 0;
  private renderedKey = '';

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly machineId: number,
    private readonly state: () => NoHuPublicState | null,
    onClosed: () => void,
  ) {
    this.panel = ctx.ui.openPanel({
      id: 'nohu',
      title: `🎰 Nổ Hũ — máy ${machineId}`,
      width: 560,
      position: 'bottom',
      className: 'nh-panel',
      onClose: () => {
        removeEventListener('keydown', this.keyHandler, true);
        this.press.dispose();
        this.offSelf?.();
        this.offSelf = null;
        // Esc / ✕ → rời máy cho người khác ngồi.
        if (!this.silent) ctx.send('leave');
        onClosed();
      },
    });
    this.press = pressGuard(this.panel.body, () => this.render());
    // Bấm chuột không để nút giữ tiêu điểm — kẻo Space sau đó lại "bấm" nút cũ thay vì là phím quay.
    this.panel.body.addEventListener('mousedown', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
    });
    addEventListener('keydown', this.keyHandler, true);
    this.offSelf = ctx.state.on('self', (e) => {
      if ('congDuc' in e.patch || 'duc' in e.patch) this.render();
    });
    this.render();
  }

  get closed(): boolean {
    return this.panel.closed;
  }

  /** Đóng bảng; `silent` = không gửi 'leave' (server đã cho rời máy / đổi map). */
  close(silent: boolean): void {
    if (silent) this.silent = true;
    this.panel.close();
  }

  /** Máy của bảng này (server giữ dãy máy theo đúng thứ tự số máy 1..4 — không cần tìm). */
  private machine(): NoHuMachine | undefined {
    const m = this.state()?.machines[this.machineId - 1];
    return m?.id === this.machineId ? m : undefined;
  }

  /** Lượt gần nhất của chính mình ở máy này (lượt của người ngồi trước thì bỏ qua). */
  private mySpin(m: NoHuMachine | undefined): NoHuSpin | null {
    const s = m?.spin;
    return s && s.pid === this.ctx.state.me.pid ? s : null;
  }

  render(): void {
    if (this.panel.closed || this.press.hold()) return;
    const st = this.state();
    const m = this.machine();
    const me = this.ctx.state.me;
    const s = this.mySpin(m);
    const key = `${st?.jackpot}|${s?.startAt}|${s?.done}|${me.congDuc}|${me.duc}|${selectedChip()}`;
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const b = this.panel.body;
    b.replaceChildren();
    this.spinBtn = null;
    if (!st || !m) {
      hint(b, 'Đang tải máy…');
      return;
    }
    const top = el('div', 'nh-top', b);
    walletRow(top, me);
    const pot = el('span', 'nh-pot', top, `🏺 Hũ Công Đức ${fmt(st.jackpot)}`);
    const bet = selectedChip();
    const share = noHuJackpotShare(bet);
    el('small', 'nh-pot-share', pot, `cược ${bet} nổ ${shareText(bet)}${share < 1 ? ` ≈ ${fmt(Math.floor(st.jackpot * share))}` : ''}`);
    const row = el('div', 'nh-row', b);
    chipRow(row, BETS, () => this.render());
    const spin = el('button', 'cs-btn nh-spin', row, `QUAY ${selectedChip()} (Space)`);
    spin.onclick = () => this.spin();
    this.spinBtn = spin;
    this.ready = !this.busy(m);
    this.showReady();
    el('button', 'cs-btn alt nh-leave', row, 'Rời máy (E)').onclick = () => this.leave();
    this.result(b, s);
    hint(b, `Space quay · Phím 1–4 chọn mức cược · E / Esc rời máy · Bảng thưởng in ngay trên máy`);
  }

  /** Mỗi khung hình: bật nút QUAY khi máy hết nghỉ; lượt của mình vừa dừng cuộn thì hiện kết quả. */
  tick(): void {
    if (this.panel.closed) return;
    const m = this.machine();
    if (!m) return;
    const ready = !this.busy(m);
    if (ready !== this.ready) {
      this.ready = ready;
      this.showReady();
    }
  }

  /** Kết quả lượt của mình: đang quay thì chưa lộ (cuộn còn chạy); dừng rồi thì 3 biểu tượng + đường thắng. */
  private result(b: HTMLElement, s: NoHuSpin | null): void {
    if (!s) {
      el('div', 'nh-result idle', b, `Chọn mức cược rồi bấm QUAY! Ba Hũ trên đường thắng là nổ hũ: cược ${BETS[BETS.length - 1]} ăn trọn Hũ Công Đức, cược nhỏ hơn ăn theo tỉ lệ.`);
      return;
    }
    if (!s.done) {
      el('div', 'nh-result idle', b, `🎰 Đang quay… (cược ${fmt(s.bet)})`);
      return;
    }
    const cls = s.jackpot && s.win > 0 ? 'jackpot' : s.win > 0 ? 'win' : 'lose';
    const box = el('div', `nh-result ${cls}`, b);
    const icons = el('div', 'nh-icons', box);
    for (const sym of s.symbols) {
      const img = el('img', '', icons);
      img.src = symbolIcon(sym);
      img.alt = sym;
    }
    const text =
      cls === 'jackpot'
        ? `🏺 NỔ HŨ! +${fmt(s.win)} Công Đức (${shareText(s.bet)})`
        : cls === 'win'
          ? `🎉 ${noHuLineLabel(s.symbols)} · +${fmt(s.win)} Công Đức (lãi ${fmt(s.win - s.bet)})`
          : `Trượt — mất ${fmt(s.bet)} Công Đức. Cờ bạc là bác thằng bần…`;
    el('span', 'nh-result-text', box, text);
  }

  /** Máy đang quay / còn nghỉ giữa 2 lượt (theo giờ server), hoặc vừa gửi lệnh quay chưa có hồi âm. */
  private busy(m: NoHuMachine): boolean {
    if (performance.now() < this.pendingUntil) return true;
    const s = m.spin;
    return !!s && (!s.done || this.ctx.serverNow() < s.startAt + NOHU.minIntervalMs);
  }

  private showReady(): void {
    if (!this.spinBtn) return;
    this.spinBtn.disabled = !this.ready;
    this.spinBtn.classList.toggle('ready', this.ready);
  }

  private spin(): void {
    const m = this.machine();
    if (this.panel.closed || !m || this.busy(m)) return;
    const bet = BETS.includes(selectedChip()) ? selectedChip() : BETS[0]!;
    const duc = this.ctx.state.me.duc;
    if (duc < bet) return this.ctx.ui.toast(`Cần đủ Đức để quay (đang có ${fmt(duc)}).`, 'warn');
    this.pendingUntil = performance.now() + PENDING_MS;
    this.ready = false;
    this.showReady();
    this.ctx.send('spin', { bet });
  }

  private leave(): void {
    if (this.panel.closed) return;
    this.silent = true;
    this.ctx.send('leave');
    this.panel.close();
  }

  /**
   * Phím khi bảng đang mở và nằm trên cùng: 1–4 chọn mức cược, Space quay, E rời máy (Enter để dành cho chat). Tổ hợp
   * Ctrl/Meta/Alt để cho trình duyệt.
   */
  private onKey(e: KeyboardEvent): void {
    if (this.panel.closed || hasModifier(e) || !this.isTop() || this.ctx.ui.isTyping()) return;
    if (handleChipKey(e, true, BETS)) {
      e.preventDefault();
      e.stopPropagation();
      this.render();
      return;
    }
    if (e.code !== 'Space' && e.code !== 'KeyE') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Space') this.spin();
    else this.leave();
  }

  /** Bảng này là modal trên cùng (không có bảng / hộp chọn khác đè lên). */
  private isTop(): boolean {
    const wrap = this.panel.el.parentElement;
    return !!wrap && wrap.parentElement?.lastElementChild === wrap;
  }
}
