// Bảng DJ (chỉ người đang đứng bàn thấy): đang phát + thanh tiến độ, ⏮ ▶/⏸ ⏭, danh sách 8 bài (thu sẵn / tổng hợp),
// hiệu ứng có đồng hồ nghỉ, 4 màu đèn, phím tắt. DOM dựng một lần; trạng thái mới chỉ bật/tắt lớp, mỗi khung chỉ sửa
// thanh tiến độ + đồng hồ nghỉ khi số hiển thị đổi. Bảng là modal nên engine không chuyển phím cho module: bảng tự
// nghe keydown (pha bắt) lúc mở; Esc để engine đóng bảng — onClose của bảng báo rời bàn.
import { DJ } from '@shared/index';
import type { DancePublicState } from '@shared/activities/dance';
import {
  DJ_TRACKS,
  LIGHT_THEMES,
  beatMs,
  positionMs,
  trackInfo,
  type DjAnyTrackId,
  type DjPublicState,
  type DjTrack,
  type LightTheme,
} from '@shared/activities/dj';
import type { PanelHandle } from '../../ui/api';
import { button, h } from '../../ui/dom';
import type { ClientActivityContext } from '../types';

type EffectField = 'dropAt' | 'hornAt' | 'confettiAt' | 'smokeAt' | 'strobeAt';

interface EffectDef {
  /** Lệnh gửi server. */
  cmd: string;
  icon: string;
  label: string;
  key: string;
  code: string;
  field: EffectField;
  cooldown: number;
}

const EFFECTS: readonly EffectDef[] = [
  { cmd: 'drop', icon: '💥', label: 'Drop', key: 'Space', code: 'Space', field: 'dropAt', cooldown: DJ.dropCooldownMs },
  { cmd: 'horn', icon: '📯', label: 'Còi', key: 'H', code: 'KeyH', field: 'hornAt', cooldown: DJ.hornCooldownMs },
  { cmd: 'confetti', icon: '🎊', label: 'Pháo giấy', key: 'C', code: 'KeyC', field: 'confettiAt', cooldown: DJ.confettiCooldownMs },
  { cmd: 'smoke', icon: '💨', label: 'Khói CO2', key: 'K', code: 'KeyK', field: 'smokeAt', cooldown: DJ.smokeCooldownMs },
  { cmd: 'strobe', icon: '⚡', label: 'Đèn chớp', key: 'F', code: 'KeyF', field: 'strobeAt', cooldown: DJ.strobeCooldownMs },
];

const THEME_LABEL: Record<LightTheme, [string, string]> = {
  neon: ['Neon', 'linear-gradient(135deg,#ff4fd8,#3ef2ff)'],
  gold: ['Vàng son', 'linear-gradient(135deg,#ffd166,#ff9f43)'],
  ocean: ['Đại dương', 'linear-gradient(135deg,#3ef2ff,#2f7bff)'],
  fire: ['Lửa', 'linear-gradient(135deg,#ff3b30,#ffd60a)'],
};

/** mm:ss làm tròn xuống (đồng hồ chạy của bài). */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const trackSub = (t: DjTrack): string =>
  `${Math.round(t.bpm)} BPM · ${t.kind === 'recorded' ? clock(t.durationMs) : 'lặp'}`;

interface FxView {
  def: EffectDef;
  btn: HTMLButtonElement;
  /** Lớp phủ nghỉ (co dần theo thời gian còn lại) + số giây còn lại. */
  cover: HTMLElement;
  left: HTMLElement;
  shownSecs: number;
  shownFrac: number;
}

/** Chữ dưới thanh tiến độ khi không phải đồng hồ chạy (khóa hiển thị âm). */
const SOON = -1;
const LOOPING = -2;
const STOPPED = -3;

export class DjPanel {
  private readonly panel: PanelHandle;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);
  /** Server đóng bảng (bị chiếm bàn / đi xa / đổi map): không báo rời bàn ngược lên nữa. */
  private silent = false;
  private readonly status: HTMLElement;
  private readonly title: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly time: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly lock: HTMLElement;
  private readonly lockables: HTMLElement[] = [];
  private readonly trackBtns = new Map<DjAnyTrackId, HTMLButtonElement>();
  private readonly themeBtns = new Map<LightTheme, HTMLButtonElement>();
  private readonly fx: FxView[] = [];
  /** Đang hiện: giây của đồng hồ chạy (hoặc SOON / LOOPING / STOPPED), độ dài thanh tiến độ, khóa vòng nhảy. */
  private shownKey = Number.NaN;
  private shownFill = -1;
  private shownBusy = false;

  constructor(
    private readonly ctx: ClientActivityContext,
    private readonly state: () => DjPublicState | null,
    onLeave: () => void,
  ) {
    this.panel = ctx.ui.openPanel({
      id: 'dj',
      title: '🎧 Bàn DJ — Chiếm Sóng',
      width: 440,
      position: 'right',
      className: 'dj-panel',
      onClose: () => {
        removeEventListener('keydown', this.keyHandler, true);
        if (!this.silent) onLeave();
      },
    });
    const b = this.panel.body;
    // Bấm chuột không để nút giữ tiêu điểm — kẻo Space / Enter sau đó bấm lại nút cũ thay vì là phím tắt.
    b.addEventListener('mousedown', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
    });

    const con = h('div', 'dj-console', '', b);
    this.status = h('div', 'dj-status', '', con);
    this.title = h('div', 'dj-title', '', con);
    this.meta = h('div', 'dj-meta', '', con);
    const bar = h('div', 'dj-prog', '', con);
    this.fill = h('div', 'dj-prog-fill', '', bar);
    this.time = h('div', 'dj-time', '', con);
    const tr = h('div', 'dj-transport', '', con);
    this.lockables.push(button('⏮', 'dj-tbtn', () => this.send('prev'), tr));
    this.playBtn = button('▶', 'dj-tbtn dj-play', () => this.send(this.state()?.playing ? 'stop' : 'play'), tr);
    this.lockables.push(this.playBtn);
    this.lockables.push(button('⏭', 'dj-tbtn', () => this.send('next'), tr));
    this.lock = h('div', 'dj-lock', '💃 Đang có vòng nhảy — chưa dừng / đổi bài được, chờ hết vòng nhé.', b);

    for (const [kind, label] of [
      ['recorded', '🎵 Nhạc thu sẵn (tự phát nối tiếp)'],
      ['synth', '🎹 Nhạc tổng hợp (lặp tới khi đổi)'],
    ] as const) {
      h('div', 'dj-sec', label, b);
      const list = h('div', 'dj-list', '', b);
      this.lockables.push(list);
      for (const t of DJ_TRACKS) {
        if (t.kind !== kind) continue;
        const btn = button('', 'dj-song', () => this.send('track', { id: t.id }), list);
        h('b', '', t.name, btn);
        h('span', '', trackSub(t), btn);
        this.trackBtns.set(t.id, btn);
      }
    }

    h('div', 'dj-sec', '✨ Hiệu ứng', b);
    const fxRow = h('div', 'dj-fx', '', b);
    for (const def of EFFECTS) {
      const btn = button('', 'dj-fxbtn', () => this.effect(def), fxRow);
      h('i', 'dj-fx-icon', def.icon, btn);
      h('b', '', def.label, btn);
      h('kbd', 'dj-kbd', def.key, btn);
      const cover = h('div', 'dj-cd', '', btn);
      const left = h('div', 'dj-cd-left', '', btn);
      this.fx.push({ def, btn, cover, left, shownSecs: -1, shownFrac: -1 });
    }

    h('div', 'dj-sec', '🌈 Màu đèn', b);
    const themes = h('div', 'dj-themes', '', b);
    for (const th of LIGHT_THEMES) {
      const btn = button(THEME_LABEL[th][0], 'dj-theme', () => this.send('theme', { theme: th }), themes);
      btn.style.background = THEME_LABEL[th][1];
      this.themeBtns.set(th, btn);
    }

    const keys = h('div', 'dj-keys', '', b);
    for (const [k, text] of [
      ['Space', 'Drop'],
      ['P', 'phát/dừng'],
      ['← →', 'đổi bài'],
      ['H', 'còi'],
      ['C', 'pháo giấy'],
      ['K', 'khói'],
      ['F', 'đèn chớp'],
      ['Esc', 'rời bàn'],
    ] as const) {
      const item = h('span', 'dj-key', '', keys);
      h('kbd', 'dj-kbd', k, item);
      h('span', '', text, item);
    }

    addEventListener('keydown', this.keyHandler, true);
    this.render();
    this.tick();
  }

  get closed(): boolean {
    return this.panel.closed;
  }

  /** Đóng bảng; `silent` = server đã cho rời bàn (không gửi 'close' lên nữa). */
  close(silent: boolean): void {
    this.silent = silent;
    this.panel.close();
  }

  /** Trạng thái mới: tên bài, nút phát/dừng, bài đang chọn, màu đèn. */
  render(): void {
    const s = this.state();
    if (this.panel.closed || !s) return;
    const t = trackInfo(s.trackId);
    this.status.textContent = s.playing ? '● ĐANG PHÁT' : '❚❚ ĐÃ DỪNG';
    this.status.classList.toggle('on', s.playing);
    this.title.textContent = t.name;
    this.meta.textContent = `${Math.round(t.bpm)} BPM · ${t.kind === 'recorded' ? 'Nhạc thu sẵn' : 'Nhạc tổng hợp'}`;
    this.playBtn.textContent = s.playing ? '⏸' : '▶';
    this.playBtn.title = s.playing ? 'Dừng (P)' : 'Phát (P)';
    for (const [id, btn] of this.trackBtns) btn.classList.toggle('on', id === s.trackId);
    for (const [th, btn] of this.themeBtns) btn.classList.toggle('on', th === s.theme);
    this.shownKey = Number.NaN;
    this.shownFill = -1;
  }

  /** Mỗi khung: thanh tiến độ, đồng hồ nghỉ hiệu ứng, khóa đổi bài khi có vòng nhảy — chỉ sửa DOM khi số đổi. */
  tick(): void {
    const s = this.state();
    if (this.panel.closed || !s) return;
    const now = this.ctx.serverNow();
    const t = trackInfo(s.trackId);
    let frac: number;
    let key: number;
    if (t.kind === 'recorded') {
      const pos = positionMs(s, now);
      frac = Math.max(0, Math.min(1, pos / t.durationMs));
      key = pos < 0 ? SOON : Math.floor(Math.min(pos, t.durationMs) / 1000);
    } else {
      // Bài tổng hợp không có hồi kết: thanh chạy theo ô nhịp (4 phách) cho dễ canh.
      const m = beatMs(s.bpm) * 4;
      frac = s.playing ? Math.round((((((now - s.beat0) % m) + m) % m) / m) * 32) / 32 : 0;
      key = s.playing ? LOOPING : STOPPED;
    }
    if (Math.abs(frac - this.shownFill) >= 0.002) {
      this.shownFill = frac;
      this.fill.style.transform = `scaleX(${frac.toFixed(4)})`;
    }
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.time.textContent =
        key === SOON
          ? 'Sắp vào bài…'
          : key === LOOPING
            ? '∞ Lặp tới khi đổi bài'
            : key === STOPPED
              ? 'Đã dừng'
              : `${clock(key * 1000)} / ${clock(t.durationMs)}`;
    }
    for (const v of this.fx) {
      const left = Math.max(0, s[v.def.field] + v.def.cooldown - now);
      const secs = Math.ceil(left / 1000);
      if (secs !== v.shownSecs) {
        v.shownSecs = secs;
        v.left.textContent = secs > 0 ? `${secs}s` : '';
        v.btn.classList.toggle('cooling', secs > 0);
      }
      const f = Math.round((left / v.def.cooldown) * 50) / 50;
      if (f !== v.shownFrac) {
        v.shownFrac = f;
        v.cover.style.transform = `scaleY(${f})`;
      }
    }
    const busy = this.danceBusy();
    if (busy !== this.shownBusy) {
      this.shownBusy = busy;
      this.lock.classList.toggle('on', busy);
      for (const e of this.lockables) e.classList.toggle('locked', busy);
    }
  }

  private send(type: string, data?: unknown): void {
    this.ctx.send(type, data);
  }

  /** Bấm hiệu ứng: còn nghỉ thì lắc nút báo (khỏi gửi), không thì gửi server. */
  private effect(def: EffectDef): void {
    const s = this.state();
    if (s && this.ctx.serverNow() - s[def.field] < def.cooldown) {
      const v = this.fx.find((x) => x.def === def);
      v?.btn.classList.remove('nope');
      void v?.btn.offsetWidth;
      v?.btn.classList.add('nope');
      return;
    }
    this.send(def.cmd);
  }

  /**
   * Phím tắt khi bảng đang mở và nằm trên cùng. Tổ hợp Ctrl / Meta / Alt là của trình duyệt (Ctrl+P in trang, Ctrl+F tìm,
   * Ctrl+C sao chép, Alt+← / → lùi / tới trang…): bảng để nguyên, không thành lệnh cho cả quán (như bảng sòng).
   */
  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.panel.closed || !this.isTop() || this.ctx.ui.isTyping()) return;
    const s = this.state();
    let run: (() => void) | null = null;
    if (e.code === 'KeyP') run = () => this.send(s?.playing ? 'stop' : 'play');
    else if (e.code === 'ArrowLeft') run = () => this.send('prev');
    else if (e.code === 'ArrowRight') run = () => this.send('next');
    else {
      const def = EFFECTS.find((d) => d.code === e.code);
      if (def) run = () => this.effect(def);
    }
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) run();
  }

  /** Bảng này là modal trên cùng (không có bảng / hộp chọn khác đè lên). */
  private isTop(): boolean {
    const wrap = this.panel.el.parentElement;
    return !!wrap && wrap.parentElement?.lastElementChild === wrap;
  }

  /** Sảnh / vòng nhảy đang diễn ra — server cấm dừng / đổi bài. */
  private danceBusy(): boolean {
    const d = this.ctx.state.activityState('dance') as DancePublicState | undefined;
    return !!d && (d.phase === 'lobby' || d.phase === 'playing');
  }
}
