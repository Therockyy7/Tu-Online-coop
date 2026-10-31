// Chẻ củi (spec 7.2) — phía client: thanh kim chạy qua lại, Space để bổ. Server chấm điểm chính thức;
// client chấm tạm ngay lúc bấm để phản hồi tức thì rồi thay bằng kết quả server.
import './chop.css';
import { CHOP } from '@shared/index';
import {
  chopJudge,
  chopMarkerPos,
  type ChopLogEvent,
  type ChopOpenData,
  type ChopPublicState,
  type ChopResult,
  type ChopResultEvent,
} from '@shared/activities/chop';
import type { OverlayHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

const JUDGE_TEXT: Record<ChopResult, string> = { perfect: 'Hoàn hảo!', good: 'Tốt!', miss: 'Trượt rồi!' };
/** Thời gian giữ hoạt ảnh bổ củi sau mỗi nhát (giây). */
const SWING_SECONDS = 0.45;

interface View {
  overlay: OverlayHandle;
  title: HTMLElement;
  green: HTMLElement;
  perfect: HTMLElement;
  marker: HTMLElement;
  judge: HTMLElement;
  stats: HTMLElement;
}

let view: View | null = null;
let log: ChopLogEvent | null = null;
let pressedAt: number | null = null;
let total: number = CHOP.logs;
let swingLeft = 0;
let judgeTimer: ReturnType<typeof setTimeout> | null = null;
const stats: Record<ChopResult, number> = { perfect: 0, good: 0, miss: 0 };

function div(cls: string, parent: HTMLElement, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  parent.append(d);
  return d;
}

function buildView(ctx: ClientActivityContext): View {
  const overlay = ctx.ui.openOverlay('chop');
  const root = div('chop-hud', overlay.el);
  const title = div('chop-title', root, 'Chẻ củi');
  const bar = div('chop-bar', root);
  const green = div('chop-green', bar);
  const perfect = div('chop-perfect', bar);
  const marker = div('chop-marker', bar);
  const judge = div('chop-judge', root);
  div('chop-hint', root, 'Bấm Space khi kim vào vùng xanh • Esc để nghỉ tay');
  const stats = div('chop-stats', root);
  return { overlay, title, green, perfect, marker, judge, stats };
}

function renderStats(): void {
  if (!view) return;
  view.stats.textContent = `Hoàn hảo ${stats.perfect} · Tốt ${stats.good} · Trượt ${stats.miss}`;
}

function renderLog(): void {
  if (!view || !log) return;
  view.title.textContent = `Chẻ củi — khúc ${log.index + 1}/${total}`;
  const zone = (el: HTMLElement, width: number) => {
    el.style.left = `${(log!.center - width / 2) * 100}%`;
    el.style.width = `${width * 100}%`;
  };
  zone(view.green, log.green);
  zone(view.perfect, log.perfect);
}

function showJudge(result: ChopResult): void {
  if (!view) return;
  const el = view.judge;
  el.textContent = JUDGE_TEXT[result];
  el.className = `chop-judge ${result} show`;
  if (judgeTimer) clearTimeout(judgeTimer);
  judgeTimer = setTimeout(() => el.classList.remove('show'), 700);
}

function cleanup(ctx: ClientActivityContext): void {
  if (judgeTimer) clearTimeout(judgeTimer);
  judgeTimer = null;
  view?.overlay.close();
  view = null;
  log = null;
  pressedAt = null;
  if (swingLeft > 0) ctx.setLocalAnim(null);
  swingLeft = 0;
  ctx.lockMovement(false);
}

export const chopClient: ActivityClientModule = {
  id: 'chop',
  maps: ['temple'],

  prompt(station, ctx) {
    if (station.kind !== 'chop_block') return undefined;
    const st = ctx.publicState<ChopPublicState>();
    const occupant = st?.blocks[station.id] ?? null;
    if (occupant && occupant === ctx.me()?.pid) return null;
    if (occupant) return 'Thớt này có người đang chẻ';
    return st ? `Chẻ củi (kho củi ${st.firewood}/${CHOP.firewoodMax})` : 'Chẻ củi';
  },

  onOpen(data, ctx) {
    const d = data as ChopOpenData;
    const station = ctx.world.map.stations.find((s) => s.id === d.stationId);
    if (station) ctx.snapTo(station.x, station.z, station.ry);
    ctx.lockMovement(true);
    total = d.total;
    stats.perfect = stats.good = stats.miss = 0;
    log = null;
    pressedAt = null;
    view?.overlay.close();
    view = buildView(ctx);
    renderStats();
  },

  onEvent(type, data) {
    if (!view) return;
    if (type === 'log') {
      log = data as ChopLogEvent;
      pressedAt = null;
      renderLog();
    } else if (type === 'result') {
      const r = data as ChopResultEvent;
      stats[r.result]++;
      showJudge(r.result);
      renderStats();
    }
  },

  onKey(e, down, ctx) {
    if (e.code !== 'Space') return false;
    if (down && !e.repeat && log && pressedAt === null) {
      const t = ctx.serverNow();
      pressedAt = t;
      // Chấm tạm để phản hồi ngay; server gửi 'result' chính thức ngay sau đó.
      const local = chopJudge(log, t, 0);
      ctx.send('chop', { index: log.index, t });
      ctx.audio.play(local === 'miss' ? 'chop_miss' : 'chop');
      ctx.setLocalAnim('chop');
      swingLeft = SWING_SECONDS;
      showJudge(local);
    }
    return true;
  },

  update(dt, ctx) {
    if (swingLeft > 0) {
      swingLeft -= dt;
      if (swingLeft <= 0) ctx.setLocalAnim(null);
    }
    if (!view || !log) return;
    // Kim đứng yên tại chỗ đã bấm cho tới khi khúc mới đến.
    const pos = chopMarkerPos(log, pressedAt ?? ctx.serverNow());
    view.marker.style.left = `${pos * 100}%`;
  },

  onClose(_reason, ctx) {
    cleanup(ctx);
  },

  unmount(ctx) {
    if (view) cleanup(ctx);
  },
};
