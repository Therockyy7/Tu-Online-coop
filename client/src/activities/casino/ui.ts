// Bộ giao diện dùng chung cho các bàn Sòng Công Đức (Tài Xỉu, Xì Dách, Bài Cào, Đua Ngựa, Nổ Hũ): phỉnh, ví Công
// Đức, đầu bảng + đồng hồ, ô cược (chuột trái đặt / chuột phải gỡ), dòng kết quả, lá bài HTML, bảng cầu.
// Chỉ dựng DOM — module trò tự giữ PanelHandle và vẽ lại khi trạng thái đổi. Lớp CSS tiền tố `cs-` (casino.css). Kèm vài
// tiện ích phím / chuột dùng chung cho bảng: bỏ qua tổ hợp Ctrl/Meta/Alt, hoãn dựng lại khi đang nhấn chuột trong bảng.
import './casino.css';
import { CASINO, type SelfState } from '@shared/index';
import { SUIT_RED, SUIT_SYMBOL, rankLabel, type Card } from '@shared/activities/cards';

export const fmt = (n: number): string => new Intl.NumberFormat('vi-VN').format(Math.round(n));

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement | null, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

/** Giây còn lại tới mốc giờ server `endsAt` (không âm, làm tròn lên). */
export const secondsLeft = (endsAt: number, serverNow: number): number => Math.max(0, Math.ceil((endsAt - serverNow) / 1000));

// ── Phỉnh: giá trị đang chọn nhớ chung cho mọi bàn trong phiên chơi ──

let chip: number = CASINO.chips[1]!;
export const selectedChip = (): number => chip;
export function setSelectedChip(v: number): void {
  chip = v;
}

/** Hàng phỉnh; bấm chọn. `chips` mặc định CASINO.chips (Nổ Hũ truyền NOHU.bets). Trả phần tử hàng. */
export function chipRow(parent: HTMLElement, chips: readonly number[] = CASINO.chips, onPick?: (v: number) => void): HTMLElement {
  if (!chips.includes(chip)) chip = chips[Math.min(1, chips.length - 1)]!;
  const row = el('div', 'cs-chips', parent);
  chips.forEach((v, i) => {
    const b = el('button', `cs-chip v${i} ${v === chip ? 'on' : ''}`, row, String(v));
    b.title = `Phím ${i + 1}`;
    b.onclick = () => {
      chip = v;
      for (const x of row.children) x.classList.toggle('on', x === b);
      onPick?.(v);
    };
  });
  return row;
}

/**
 * Phím kèm Ctrl / Meta / Alt là tổ hợp của trình duyệt / hệ điều hành (Ctrl+R tải lại, Ctrl/Cmd+1–4 chuyển tab…): bảng sòng
 * không bắt, để nguyên cho trình duyệt. Mọi bảng sòng gọi đầu keydown của bảng.
 */
export const hasModifier = (e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean => e.ctrlKey || e.metaKey || e.altKey;

/**
 * Phím 1–4 (hàng số hoặc bàn phím số) chọn phỉnh — gọi trong keydown (pha capture) của bảng khi bảng đang mở (bảng là
 * modal nên onKey của module không nhận phím). Tổ hợp có Ctrl / Meta / Alt không tính. Trả true nếu đã xử lý.
 */
export function handleChipKey(e: KeyboardEvent, down: boolean, chips: readonly number[] = CASINO.chips): boolean {
  if (hasModifier(e)) return false;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (!m) return false;
  const v = chips[Number(m[1]) - 1];
  if (v === undefined) return false;
  if (down) chip = v;
  return true;
}

/** Ví: Công Đức tích lũy + Đức khả dụng (cược trừ cả hai). `extra` = chữ phụ, vd "Đang cược 30/100". */
export function walletRow(parent: HTMLElement, me: Pick<SelfState, 'congDuc' | 'duc'>, extra?: string): HTMLElement {
  const row = el('div', 'cs-wallet', parent);
  el('span', 'cs-pill cd', row, `📿 Công Đức ${fmt(me.congDuc)}`);
  el('span', 'cs-pill duc', row, `🪷 Đức ${fmt(me.duc)}`);
  if (extra) el('span', 'cs-extra', row, extra);
  return row;
}

export type PhaseTone = 'idle' | 'bet' | 'roll' | 'result';

/** Đầu bảng: chữ pha + đồng hồ giây (bỏ trống nếu không có). */
export function phaseHead(parent: HTMLElement, text: string, tone: PhaseTone, seconds?: number): HTMLElement {
  const head = el('div', 'cs-head', parent);
  el('div', `cs-phase ${tone}`, head, text);
  if (seconds !== undefined) el('div', `cs-timer ${seconds <= 5 ? 'hot' : ''}`, head, `${seconds}s`);
  return head;
}

export interface BetTileOpts {
  label: string;
  /** Dòng nhỏ dưới tên, vd "11–17". */
  sub?: string;
  /** Tỉ lệ / lãi hiển thị góc phải, vd "1:1", "×4,2". */
  odds?: string;
  /** Mình đã đặt bao nhiêu ở ô này. */
  mine?: number;
  /** Cả bàn đặt bao nhiêu. */
  total?: number;
  /** Ô thắng (kết quả ván). */
  hit?: boolean;
  disabled?: boolean;
  /** Lớp thêm (màu riêng từng ô). */
  cls?: string;
  onAdd(): void;
  onRemove(): void;
}

/** Ô cược: chuột trái đặt phỉnh đang chọn, chuột phải gỡ. */
export function betTile(parent: HTMLElement, o: BetTileOpts): HTMLButtonElement {
  const b = el('button', `cs-tile ${o.cls ?? ''} ${o.hit ? 'hit' : ''} ${o.disabled ? 'off' : ''}`, parent);
  el('div', 'cs-tile-label', b, o.label);
  if (o.sub) el('div', 'cs-tile-sub', b, o.sub);
  if (o.odds) el('div', 'cs-tile-odds', b, o.odds);
  const info = [o.mine ? `Bạn ${fmt(o.mine)}` : '', o.total ? `Tổng ${fmt(o.total)}` : ''].filter(Boolean).join(' · ');
  if (info) el('div', 'cs-tile-bets', b, info);
  if (o.mine) el('div', 'cs-tile-stack', b, fmt(o.mine));
  b.disabled = !!o.disabled;
  b.onclick = () => o.onAdd();
  b.oncontextmenu = (e) => {
    e.preventDefault();
    o.onRemove();
  };
  return b;
}

/** Dòng kết quả ván của mình (null = không cược ván này → không vẽ). */
export function resultBanner(parent: HTMLElement, net: number | null): HTMLElement | null {
  if (net === null) return null;
  const cls = net > 0 ? 'win' : net < 0 ? 'lose' : 'push';
  const text = net > 0 ? `🎉 Thắng +${fmt(net)} Công Đức` : net < 0 ? `💸 Thua ${fmt(-net)} Công Đức` : '🤝 Hòa — hoàn cược';
  return el('div', `cs-result ${cls}`, parent, text);
}

export function hint(parent: HTMLElement, text: string): HTMLElement {
  return el('div', 'cs-hint', parent, text);
}

/** Nhấn giữ lâu hơn chừng này (ms) thì thôi hoãn dựng lại (vd nhả chuột ngoài cửa sổ nên không có pointerup). */
const HOLD_MAX_MS = 1500;

export interface PressGuard {
  /** Gọi đầu render(): true = đang nhấn chuột trong bảng → bỏ lượt dựng lại này, nhả chuột sẽ tự dựng lại. */
  hold(): boolean;
  /** Gỡ listener (gọi khi bảng đóng). */
  dispose(): void;
}

/**
 * Hoãn dựng lại DOM bảng khi đang nhấn chuột trong bảng: dựng lại giữa lúc nhấn và lúc nhả làm nút cũ rời khỏi DOM →
 * trình duyệt không bắn click, cú đặt cược mất mà không báo gì (vd đúng lúc người khác vừa cược). Đang nhấn thì render()
 * chỉ đánh dấu; nhả chuột (pointerup / pointercancel / cửa sổ mất tiêu điểm) thì dựng lại — hẹn sang lượt sự kiện sau để
 * click của chính cú nhả đó kịp chạy trên nút cũ.
 */
export function pressGuard(body: HTMLElement, rebuild: () => void): PressGuard {
  let downAt = -1;
  let dirty = false;
  const down = () => {
    downAt = performance.now();
  };
  const up = () => {
    if (downAt < 0) return;
    downAt = -1;
    if (!dirty) return;
    dirty = false;
    setTimeout(rebuild, 0);
  };
  // Pha bắt: nhả chuột ở đâu (kể cả ngoài bảng) cũng nhận được. Dạng { capture } cho cả gắn lẫn gỡ.
  const cap = { capture: true };
  body.addEventListener('pointerdown', down, cap);
  addEventListener('pointerup', up, cap);
  addEventListener('pointercancel', up, cap);
  addEventListener('blur', up);
  return {
    hold() {
      if (downAt < 0 || performance.now() - downAt > HOLD_MAX_MS) return false;
      dirty = true;
      return true;
    },
    dispose() {
      body.removeEventListener('pointerdown', down, cap);
      removeEventListener('pointerup', up, cap);
      removeEventListener('pointercancel', up, cap);
      removeEventListener('blur', up);
    },
  };
}

/** Lá bài HTML nhỏ cho bảng (null = úp). */
export function cardEl(parent: HTMLElement, c: Card | null): HTMLElement {
  if (!c) return el('span', 'cs-card back', parent, '🂠');
  const e = el('span', `cs-card ${SUIT_RED[c.s] ? 'red' : ''}`, parent);
  el('b', '', e, rankLabel(c.r));
  el('i', '', e, SUIT_SYMBOL[c.s]);
  return e;
}

/** Một tay bài: nhãn + các lá + chữ điểm (vd "Xì Dách", "8 nút"). */
export function handRow(parent: HTMLElement, label: string, cards: readonly (Card | null)[], score?: string, mine = false): HTMLElement {
  const row = el('div', `cs-hand ${mine ? 'me' : ''}`, parent);
  el('div', 'cs-hand-label', row, label);
  const cs = el('div', 'cs-cards', row);
  for (const c of cards) cardEl(cs, c);
  if (score) el('div', 'cs-hand-score', row, score);
  return row;
}

/** Bảng cầu: dãy hạt màu (cũ → mới). `beads[i].cls` do module chọn (vd 't' Tài, 'x' Xỉu, 'tri' bộ ba). */
export function beadRoad(parent: HTMLElement, beads: readonly { text: string; cls: string; title?: string }[]): HTMLElement {
  const row = el('div', 'cs-road', parent);
  for (const b of beads) {
    const d = el('span', `cs-bead ${b.cls}`, row, b.text);
    if (b.title) d.title = b.title;
  }
  return row;
}
