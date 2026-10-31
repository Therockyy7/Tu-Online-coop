// HUD trong game: thẻ người chơi (cấp bậc, Công Đức, Đức, Xu, Tạp Niệm, Độ Say, buff), thông tin phòng,
// vật đang cầm, thanh emote, bảng người chơi (giữ Tab).
import {
  BUFF_NAMES,
  EMOTE_ICONS,
  EMOTE_IDS,
  EMOTE_NAMES,
  HOST_TITLE,
  KARMA,
  RANK_NAMES,
  heldItemName,
  progressToNext,
  type BuffId,
  type PlayerPublic,
} from '@shared/index';
import type { UIGameContext } from './api';
import { button, copyText, fmt, fmtClock, h } from './dom';

const ROBE_COLORS: Record<string, string> = {
  robe_nau_rach: '#8b6a4a',
  robe_lam: '#6f8ea3',
  robe_trang_nau: '#6d4c35',
  robe_ca_sa_vang: '#e9a23b',
  robe_ca_sa_vien_do: '#e9a23b',
};
const BUFF_ICONS: Record<BuffId, string> = { hao_quang: '✨', ban_phuoc: '🙏', no_bung: '🍚' };

export interface HudDeps {
  openSettings(): void;
  toast(text: string, tone?: 'info' | 'good' | 'bad' | 'warn' | 'gold'): void;
}

export class Hud {
  readonly el: HTMLDivElement;
  private readonly offs: (() => void)[] = [];
  private readonly timer: ReturnType<typeof setInterval>;

  private readonly avatar: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly rankEl: HTMLDivElement;
  private readonly cdEl: HTMLSpanElement;
  private readonly ducEl: HTMLSpanElement;
  private readonly xuEl: HTMLSpanElement;
  private readonly progFill: HTMLDivElement;
  private readonly progText: HTMLDivElement;
  private readonly tnFill: HTMLDivElement;
  private readonly tnText: HTMLSpanElement;
  private readonly sayRow: HTMLDivElement;
  private readonly sayFill: HTMLDivElement;
  private readonly buffs: HTMLDivElement;

  private readonly codeEl: HTMLSpanElement;
  private readonly mapEl: HTMLSpanElement;
  private readonly countEl: HTMLSpanElement;
  private readonly poolEl: HTMLSpanElement;
  private readonly hostChip: HTMLDivElement;
  private readonly conn: HTMLDivElement;

  readonly promptEl: HTMLDivElement;
  private readonly heldEl: HTMLDivElement;
  private readonly board: HTMLDivElement;
  private readonly boardBody: HTMLDivElement;
  private boardOpen = false;
  private shownCd = 0;
  private targetCd = 0;
  private animRaf = 0;

  constructor(
    root: HTMLElement,
    private readonly ctx: UIGameContext,
    private readonly deps: HudDeps,
  ) {
    const s = ctx.state;
    this.el = h('div', 'hud', '', root);

    // ── Thẻ người chơi (trái trên) ──
    const card = h('div', 'hud-card', '', this.el);
    const top = h('div', 'hud-card-top', '', card);
    this.avatar = h('div', 'hud-avatar', '', top);
    const who = h('div', 'hud-who', '', top);
    this.nameEl = h('div', 'hud-name', '', who);
    this.rankEl = h('div', 'hud-rank', '', who);
    const stats = h('div', 'hud-stats', '', card);
    const stat = (icon: string, title: string) => {
      const b = h('div', 'hud-stat', '', stats);
      b.title = title;
      h('span', 'hud-stat-icon', icon, b);
      return h('span', 'hud-stat-val', '', b);
    };
    this.cdEl = stat('🪷', 'Công Đức tích lũy (xếp cấp bậc)');
    this.ducEl = stat('📿', 'Đức khả dụng (đổi Xu, Vé VIP)');
    this.xuEl = stat('🪙', 'Xu (tiêu ở Quán Bar)');
    const prog = h('div', 'bar bar-progress', '', card);
    this.progFill = h('div', 'bar-fill', '', prog);
    this.progText = h('div', 'bar-text', '', prog);
    const tnRow = h('div', 'hud-meter', '', card);
    h('span', 'hud-meter-label', 'Tạp Niệm', tnRow);
    const tn = h('div', 'bar bar-tapniem', '', tnRow);
    this.tnFill = h('div', 'bar-fill', '', tn);
    this.tnText = h('span', 'hud-meter-val', '', tnRow);
    this.sayRow = h('div', 'hud-meter say', '', card);
    h('span', 'hud-meter-label', 'Độ Say', this.sayRow);
    const say = h('div', 'bar bar-say', '', this.sayRow);
    this.sayFill = h('div', 'bar-fill', '', say);
    this.buffs = h('div', 'hud-buffs', '', card);

    // ── Phòng (phải trên) ──
    const roomBox = h('div', 'hud-room', '', this.el);
    const chip = h('button', 'room-chip interactive', '', roomBox);
    chip.type = 'button';
    chip.title = 'Bấm để sao chép link mời bạn bè';
    this.mapEl = h('span', 'room-map', '', chip);
    this.codeEl = h('span', 'room-code', '', chip);
    h('span', 'room-copy', '🔗', chip);
    chip.addEventListener('click', () => void this.copyInvite());
    const meta = h('div', 'room-meta', '', roomBox);
    this.countEl = h('span', 'room-count', '', meta);
    this.poolEl = h('span', 'room-pool', '', meta);
    button('⚙', 'icon-btn interactive', () => deps.openSettings(), roomBox).title = 'Cài đặt';
    this.hostChip = h('div', 'host-chip', `👑 Bạn là ${HOST_TITLE} · phím H`, this.el);
    this.conn = h('div', 'conn-banner', 'Mất kết nối — đang kết nối lại…', this.el);

    // ── Giữa dưới ──
    const bottom = h('div', 'hud-bottom', '', this.el);
    this.promptEl = h('div', 'prompt', '', bottom);
    this.heldEl = h('div', 'held', '', bottom);
    const emotes = h('div', 'emote-bar', '', bottom);
    EMOTE_IDS.forEach((id, i) => {
      const b = h('button', 'emote-btn interactive', '', emotes);
      b.type = 'button';
      b.title = `${i + 1} · ${EMOTE_NAMES[id]}`;
      h('span', 'emote-icon', EMOTE_ICONS[id], b);
      h('span', 'emote-key', String(i + 1), b);
      b.addEventListener('click', () => ctx.actions.emote(id));
    });
    h(
      'div',
      'hud-keys',
      'E tương tác · Q bỏ đồ · B ban phước · V góc nhìn · Tab bảng · Enter chat',
      this.el,
    );

    // ── Bảng người chơi (Tab) ──
    this.board = h('div', 'scoreboard', '', this.el);
    const bh = h('div', 'scoreboard-head', '', this.board);
    h('span', '', 'Người trong chùa', bh);
    h('span', 'scoreboard-hint', 'thả Tab để đóng', bh);
    this.boardBody = h('div', 'scoreboard-body', '', this.board);

    this.renderSelf();
    this.renderRoom();
    this.renderHeld();
    this.shownCd = this.targetCd = s.me.congDuc;
    this.cdEl.textContent = fmt(s.me.congDuc);
    this.offs.push(s.on('self', () => this.renderSelf()));
    this.offs.push(s.on('room', () => this.renderRoom()));
    this.offs.push(s.on('playerJoined', () => this.renderRoom()));
    this.offs.push(s.on('playerLeft', () => this.renderRoom()));
    this.offs.push(
      s.on('playerPatch', (e) => {
        if (e.pid === s.me.pid && 'held' in e.patch) this.renderHeld();
        if (this.boardOpen) this.renderBoard();
      }),
    );
    this.offs.push(s.on('connection', (e) => this.conn.classList.toggle('show', e.status !== 'connected')));
    this.timer = setInterval(() => this.renderBuffs(), 500);
  }

  private async copyInvite(): Promise<void> {
    const url = `${location.origin}${location.pathname}?r=${this.ctx.state.room.code}`;
    const ok = await copyText(url);
    this.deps.toast(ok ? `Đã sao chép link mời: ${url}` : `Link mời: ${url}`, ok ? 'good' : 'info');
  }

  private renderSelf(): void {
    const me = this.ctx.state.me;
    const color = me.isHost ? '#c8432f' : (ROBE_COLORS[me.outfit.robe] ?? '#8b6a4a');
    this.avatar.style.background = `radial-gradient(circle at 35% 30%, #fff6, transparent 45%), ${color}`;
    this.avatar.textContent = [...me.name][0]?.toUpperCase() ?? '?';
    this.avatar.classList.toggle('vien-do', me.outfit.robe === 'robe_ca_sa_vien_do');
    this.nameEl.textContent = me.name;
    this.rankEl.textContent = me.isHost ? `👑 ${HOST_TITLE} · ${RANK_NAMES[me.rank]}` : RANK_NAMES[me.rank];
    this.rankEl.classList.toggle('host', me.isHost);
    this.targetCd = me.congDuc;
    this.animateCd();
    this.ducEl.textContent = fmt(me.duc);
    this.xuEl.textContent = fmt(me.xu);
    const p = progressToNext(me.congDuc);
    this.progFill.style.width = `${(p.ratio * 100).toFixed(1)}%`;
    this.progText.textContent = p.next
      ? `${fmt(p.current)} / ${fmt(p.needed)} → ${RANK_NAMES[p.next]}`
      : 'Đã đạt cấp cao nhất';
    const tn = me.tapNiem;
    this.tnFill.style.width = `${tn}%`;
    this.tnText.textContent = String(tn);
    this.tnFill.parentElement!.classList.toggle('storm', tn >= KARMA.tapNiemStorm);
    this.tnFill.parentElement!.classList.toggle('cloud', tn >= KARMA.tapNiemCloud && tn < KARMA.tapNiemStorm);
    this.sayRow.classList.toggle('show', me.doSay > 0);
    this.sayFill.style.width = `${me.doSay}%`;
    this.hostChip.classList.toggle('show', me.isHost);
    this.renderBuffs();
    if (this.boardOpen) this.renderBoard();
  }

  /** Số Công Đức chạy lên dần cho vui mắt. */
  private animateCd(): void {
    if (this.animRaf) return;
    const step = () => {
      const diff = this.targetCd - this.shownCd;
      if (Math.abs(diff) < 1) {
        this.shownCd = this.targetCd;
        this.cdEl.textContent = fmt(this.shownCd);
        this.cdEl.parentElement!.classList.remove('bump');
        this.animRaf = 0;
        return;
      }
      this.shownCd += diff * 0.18 + Math.sign(diff) * 0.5;
      this.cdEl.textContent = fmt(this.shownCd);
      this.cdEl.parentElement!.classList.add('bump');
      this.animRaf = requestAnimationFrame(step);
    };
    this.animRaf = requestAnimationFrame(step);
  }

  private renderBuffs(): void {
    const now = this.ctx.state.serverNow();
    const active = this.ctx.state.me.buffs.filter((b) => b.until > now);
    this.buffs.replaceChildren();
    for (const b of active) {
      const chip = h('div', `buff buff-${b.id}`, '', this.buffs);
      h('span', 'buff-icon', BUFF_ICONS[b.id], chip);
      h('span', 'buff-name', BUFF_NAMES[b.id], chip);
      h('span', 'buff-time', fmtClock(b.until - now), chip);
    }
  }

  private renderRoom(): void {
    const s = this.ctx.state;
    this.mapEl.textContent = s.room.map === 'temple' ? '🏯 Chùa' : '🪩 Quán Bar';
    this.codeEl.textContent = s.room.code;
    this.countEl.textContent = `👥 ${s.room.playerCount}`;
    this.poolEl.textContent = `🏺 Quỹ ${fmt(s.room.pool)}`;
    this.poolEl.title = 'Quỹ Công Đức của chùa (Phương Trượng dùng để phát bổng lộc)';
    this.el.classList.toggle('in-bar', s.room.map === 'bar');
    if (this.boardOpen) this.renderBoard();
  }

  private renderHeld(): void {
    const held = this.ctx.state.myPlayer()?.held ?? null;
    this.heldEl.replaceChildren();
    this.heldEl.classList.toggle('show', !!held);
    if (!held) return;
    h('span', 'held-label', 'Đang cầm', this.heldEl);
    h('b', '', heldItemName(held.kind, held.variant), this.heldEl);
    h('kbd', 'key', 'Q', this.heldEl);
    h('span', 'held-drop', 'bỏ', this.heldEl);
  }

  setBoard(open: boolean): void {
    if (open === this.boardOpen) return;
    this.boardOpen = open;
    this.board.classList.toggle('show', open);
    if (open) this.renderBoard();
  }

  private renderBoard(): void {
    const s = this.ctx.state;
    const list = [...s.players().values()].sort((a, b) => b.congDuc - a.congDuc || a.joinedAt - b.joinedAt);
    this.boardBody.replaceChildren();
    list.forEach((p: PlayerPublic, i) => {
      const row = h('div', `sb-row ${p.pid === s.me.pid ? 'me' : ''} ${p.connected ? '' : 'off'}`, '', this.boardBody);
      h('span', 'sb-rank', String(i + 1), row);
      const name = h('span', 'sb-name', '', row);
      if (p.isHost) h('span', 'sb-badge host', '👑', name);
      name.append(p.name);
      if (s.room.djPid === p.pid) h('span', 'sb-badge', '🎧', name);
      if (p.vip) h('span', 'sb-badge vip', 'VIP', name);
      if (p.title) h('span', 'sb-badge title', p.title, name);
      h('span', 'sb-title', p.isHost ? HOST_TITLE : RANK_NAMES[p.rank], row);
      h('span', 'sb-cd', `🪷 ${fmt(p.congDuc)}`, row);
      h('span', 'sb-tn', `☁ ${p.tapNiem}`, row);
    });
  }

  dispose(): void {
    clearInterval(this.timer);
    if (this.animRaf) cancelAnimationFrame(this.animRaf);
    for (const off of this.offs) off();
    this.el.remove();
  }
}
