// Bảng DJ (chỉ người đang đứng bàn thấy): đang phát + thanh tiến độ, ⏮ ▶/⏸ ⏭, dán link YouTube + hàng chờ (chiếu trên
// màn hình LED sân khấu), danh sách 8 bài (thu sẵn / tổng hợp), hiệu ứng có đồng hồ nghỉ, 4 màu đèn, phím tắt. DOM dựng
// một lần; trạng thái mới chỉ bật/tắt lớp (hàng chờ chỉ dựng lại khi hàng chờ đổi — ô dán không mất chữ / tiêu điểm),
// mỗi khung chỉ sửa thanh tiến độ + đồng hồ nghỉ khi số hiển thị đổi. Bảng là modal nên engine không chuyển phím cho
// module: bảng tự nghe keydown (pha bắt) lúc mở; Esc để engine đóng bảng — onClose của bảng báo rời bàn.
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
  type DjYoutubeItem,
  type LightTheme,
} from '@shared/activities/dj';
import { parseYoutubeUrl } from '@shared/activities/youtube';
import type { PanelHandle } from '../../ui/api';
import { button, h } from '../../ui/dom';
import type { ClientActivityContext } from '../types';
import { playAt } from './youtube/sync';

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
/** Video YouTube: livestream / chưa biết thời lượng (chờ máy khách báo). */
const LIVE = -4;
const FETCHING = -5;

/** Dán link xong chờ server trả lời (video vào phát / vào hàng chờ) tối đa ngần này (ms), rồi thôi "đang kiểm tra". */
const PENDING_MS = 6000;

/** Dòng gợi ý dưới ô dán link. */
type HintMode = 'error' | 'pending' | 'full' | 'busy' | 'queueYt' | 'queueWait' | 'now';

const HINT_TEXT: Record<HintMode, string> = {
  error: 'Link không phải video YouTube — dán link dạng youtube.com/watch?v=… hoặc youtu.be/…',
  pending: 'Đang kiểm tra link…',
  full: `Hàng chờ đã đầy (${DJ.youtube.queueMax}/${DJ.youtube.queueMax}) — xoá bớt video rồi thêm`,
  busy: '💃 Đang có vòng nhảy — video phát khi hết vòng (vẫn thêm / xoá hàng chờ được)',
  queueYt: `Đang phát YouTube → link mới xếp cuối hàng chờ (tối đa ${DJ.youtube.queueMax})`,
  queueWait: 'Hàng chờ còn video → link mới xếp cuối hàng (phát khi bài có sẵn hết, hoặc bấm ▶)',
  now: 'Đang phát nhạc có sẵn → dán link là phát ngay trên màn hình LED',
};

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
  /** Mục YouTube: ô dán link, dòng gợi ý, hàng chờ (tiêu đề + danh sách, nút ▶ từng dòng — khóa trong vòng nhảy). */
  private readonly ytInput: HTMLInputElement;
  private readonly ytHint: HTMLElement;
  private readonly queueHead: HTMLElement;
  private readonly queueList: HTMLElement;
  private readonly queuePlay: HTMLButtonElement[] = [];
  /** Chữ ký hàng chờ đang hiện (các key nối lại; null = chưa dựng). */
  private queueSig: string | null = null;
  /** Đã gửi link, chờ server: chữ ký `video đang phát|hàng chờ` lúc gửi (null = không chờ) + hạn (performance.now). */
  private pendingSig: string | null = null;
  private pendingUntil = 0;
  /** Link vừa dán sai dạng (báo tại chỗ tới khi gõ lại / gửi link đúng). */
  private badLink = false;
  private shownHint: HintMode | null = null;
  /** Đang hiện: giây đồng hồ chạy (hoặc SOON / LOOPING / STOPPED / LIVE / FETCHING), độ dài thanh, khóa vòng nhảy. */
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

    // YouTube: dán link → server tra cứu rồi phát ngay / xếp hàng; cả quán xem trên màn hình LED sân khấu.
    h('div', 'dj-sec', '▶️ YouTube — chiếu lên màn hình LED', b);
    const form = h('div', 'dj-yt-form', '', b);
    this.ytInput = h('input', 'input input-small dj-yt-input', '', form);
    this.ytInput.type = 'text';
    this.ytInput.placeholder = 'Dán link YouTube (youtube.com/watch…, youtu.be/…)';
    this.ytInput.maxLength = DJ.youtube.urlMax;
    this.ytInput.spellcheck = false;
    this.ytInput.autocomplete = 'off';
    this.ytInput.addEventListener('keydown', (e) => this.onInputKey(e));
    this.ytInput.addEventListener('input', () => {
      if (!this.badLink) return;
      this.badLink = false;
      this.ytInput.classList.remove('nope');
      this.refreshHint();
    });
    button('➕ Thêm', 'dj-yt-add', () => this.submitYoutube(), form);
    this.ytHint = h('div', 'dj-yt-hint', '', b);
    const queue = h('div', 'dj-yt-queue', '', b);
    this.queueHead = h('div', 'dj-yt-qhead', '', queue);
    this.queueList = h('div', 'dj-yt-qlist', '', queue);

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

  /** Trạng thái mới: tên bài / video, nút phát/dừng, bài đang chọn, màu đèn, hàng chờ YouTube. */
  render(): void {
    const s = this.state();
    if (this.panel.closed || !s) return;
    this.status.textContent = s.playing ? '● ĐANG PHÁT' : '❚❚ ĐÃ DỪNG';
    this.status.classList.toggle('on', s.playing);
    if (s.yt) {
      // Video YouTube không nằm trong danh sách bài (trackInfo không dùng được cho nó).
      this.title.textContent = s.yt.title;
      this.meta.textContent = `YouTube · ${s.yt.author || 'không rõ kênh'} · ${s.yt.byName} chọn`;
    } else {
      const t = trackInfo(s.trackId);
      this.title.textContent = t.name;
      this.meta.textContent = `${Math.round(t.bpm)} BPM · ${t.kind === 'recorded' ? 'Nhạc thu sẵn' : 'Nhạc tổng hợp'}`;
    }
    this.playBtn.textContent = s.playing ? '⏸' : '▶';
    this.playBtn.title = s.playing ? 'Dừng (P)' : 'Phát (P)';
    for (const [id, btn] of this.trackBtns) btn.classList.toggle('on', !s.yt && id === s.trackId);
    for (const [th, btn] of this.themeBtns) btn.classList.toggle('on', th === s.theme);
    const qsig = s.ytQueue.map((it) => it.key).join();
    if (qsig !== this.queueSig) {
      this.queueSig = qsig;
      this.buildQueue(s.ytQueue);
    }
    // Server đã trả lời link vừa dán (video vào phát / vào hàng chờ) → thôi "đang kiểm tra".
    if (this.pendingSig !== null && this.ytSig(s) !== this.pendingSig) this.pendingSig = null;
    this.refreshHint();
    this.shownKey = Number.NaN;
    this.shownFill = -1;
  }

  /** Mỗi khung: thanh tiến độ, đồng hồ nghỉ hiệu ứng, khóa đổi bài khi có vòng nhảy — chỉ sửa DOM khi số đổi. */
  tick(): void {
    const s = this.state();
    if (this.panel.closed || !s) return;
    const now = this.ctx.serverNow();
    let frac: number;
    let key: number;
    let dur = 0;
    if (s.yt) {
      // YouTube: tiến độ khi đã biết thời lượng; livestream / chưa biết thời lượng thì báo chữ.
      const yt = s.yt;
      dur = yt.live ? 0 : yt.durationMs;
      const pos = positionMs(s, now);
      frac = yt.live ? 1 : dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
      if (!s.playing) key = STOPPED;
      else if (now < playAt(yt, s.startedAt)) key = SOON;
      else if (yt.live) key = LIVE;
      else key = dur > 0 ? Math.floor(Math.min(pos, dur) / 1000) : FETCHING;
    } else {
      const t = trackInfo(s.trackId);
      if (t.kind === 'recorded') {
        dur = t.durationMs;
        const pos = positionMs(s, now);
        frac = Math.max(0, Math.min(1, pos / dur));
        key = pos < 0 ? SOON : Math.floor(Math.min(pos, dur) / 1000);
      } else {
        // Bài tổng hợp không có hồi kết: thanh chạy theo ô nhịp (4 phách) cho dễ canh.
        const m = beatMs(s.bpm) * 4;
        frac = s.playing ? Math.round((((((now - s.beat0) % m) + m) % m) / m) * 32) / 32 : 0;
        key = s.playing ? LOOPING : STOPPED;
      }
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
              : key === LIVE
                ? '● TRỰC TIẾP'
                : key === FETCHING
                  ? 'Đang lấy thời lượng…'
                  : `${clock(key * 1000)} / ${clock(dur)}`;
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
      // Trong vòng nhảy: ▶ phát ngay bị khóa như ⏮ ⏭; ô dán + ✕ xoá vẫn dùng được (server kiểm như nhau).
      for (const e of this.queuePlay) e.classList.toggle('locked', busy);
      this.refreshHint();
    }
    if (this.pendingSig !== null && performance.now() > this.pendingUntil) {
      this.pendingSig = null;
      this.refreshHint();
    }
  }

  private send(type: string, data?: unknown): void {
    this.ctx.send(type, data);
  }

  /** Chữ ký nguồn YouTube + hàng chờ (đổi = server đã nhận / từ chối xong link vừa dán). */
  private ytSig(s: DjPublicState): string {
    return `${s.yt ? s.yt.key : ''}|${this.queueSig ?? ''}`;
  }

  /** Thêm link: kiểm dạng ngay tại máy (sai → báo tại chỗ + lắc ô, không gửi); đúng → gửi, chờ server trả lời. */
  private submitYoutube(): void {
    const url = this.ytInput.value.trim();
    if (!url) return;
    if (!parseYoutubeUrl(url)) {
      this.badLink = true;
      this.refreshHint();
      this.ytInput.classList.remove('nope');
      void this.ytInput.offsetWidth;
      this.ytInput.classList.add('nope');
      return;
    }
    this.send('youtube', { url });
    this.ytInput.value = '';
    this.ytInput.classList.remove('nope');
    // Bỏ tiêu điểm ô nhập (nút ➕ không lấy tiêu điểm khi bấm) — phím tắt bàn DJ chạy lại ngay.
    this.ytInput.blur();
    this.badLink = false;
    const s = this.state();
    this.pendingSig = s ? this.ytSig(s) : null;
    this.pendingUntil = performance.now() + PENDING_MS;
    this.refreshHint();
  }

  /**
   * Phím trong ô dán link: Enter = thêm, Esc = chỉ bỏ chọn ô (không rời bàn). Chặn lan lên cửa sổ để engine / UI không
   * coi hai phím này là phím game (mở chat, đóng bảng); phím khác là gõ chữ — phím tắt bàn DJ tự bỏ qua khi đang gõ.
   */
  private onInputKey(e: KeyboardEvent): void {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.submitYoutube();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.ytInput.blur();
    }
  }

  /** Hàng chờ YouTube: dựng lại cả danh sách — chỉ khi hàng chờ đổi (render() so chữ ký các key). */
  private buildQueue(q: readonly DjYoutubeItem[]): void {
    this.queueHead.textContent = `Hàng chờ (${q.length}/${DJ.youtube.queueMax})`;
    this.queueList.replaceChildren();
    this.queuePlay.length = 0;
    if (!q.length) {
      h('div', 'dj-yt-empty', 'Hàng chờ trống — dán link để phát ngay hoặc xếp hàng', this.queueList);
      return;
    }
    q.forEach((it, i) => {
      const row = h('div', 'dj-yt-item', '', this.queueList);
      const name = h('span', 'dj-yt-name', `#${i + 1} ${it.title} — ${it.byName}`, row);
      name.title = it.title;
      const play = button('▶', 'dj-yt-btn dj-yt-play', () => this.send('yt_play', { key: it.key }), row);
      play.title = 'Phát ngay';
      play.classList.toggle('locked', this.shownBusy);
      this.queuePlay.push(play);
      const del = button('✕', 'dj-yt-btn dj-yt-del', () => this.send('yt_remove', { key: it.key }), row);
      del.title = 'Xoá khỏi hàng chờ';
    });
  }

  /** Dòng gợi ý dưới ô dán link — chỉ sửa DOM khi loại gợi ý đổi. */
  private refreshHint(): void {
    const s = this.state();
    if (this.panel.closed || !s) return;
    const n = s.ytQueue.length;
    const mode: HintMode = this.badLink
      ? 'error'
      : this.pendingSig !== null
        ? 'pending'
        : n >= DJ.youtube.queueMax
          ? 'full'
          : this.shownBusy
            ? 'busy'
            : s.yt
              ? 'queueYt'
              : n
                ? 'queueWait'
                : 'now';
    if (mode === this.shownHint) return;
    this.shownHint = mode;
    this.ytHint.textContent = HINT_TEXT[mode];
    this.ytHint.classList.toggle('bad', mode === 'error' || mode === 'full');
    this.ytHint.classList.toggle('wait', mode === 'pending');
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
