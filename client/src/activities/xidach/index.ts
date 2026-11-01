// Xì Dách (Sòng Công Đức) phía client: bảng cược + rút/dằn (panel.ts, bộ UI sòng dùng chung) + lá bài 3D bay từ hộp bài tới
// các ghế / nhà cái và nhà cái NPC (table3d.ts). Server quyết định mọi kết quả; client chỉ hiển thị + gửi thao tác.
// E ở bàn: bàn đang nghỉ → gửi interact để server mở ván (bảng tự mở khi ván bắt đầu mà mình đứng gần — casino/autoOpen.ts);
// đang chạy → mở bảng. Bảng cũng tự mở lại khi vào lượt rút/dằn mà mình có ghế (đứng gần, không có bảng khác đang mở).
import './xidach.css';
import { CASINO } from '@shared/index';
import type { XiDachPublicState } from '@shared/activities/xidach';
import { canAutoOpen } from '../casino/autoOpen';
import type { ActivityClientModule, ClientActivityContext } from '../types';
import { XiDachPanel } from './panel';
import { XiDachTable3D } from './table3d';

let st: XiDachPublicState | null = null;
let panel: XiDachPanel | null = null;
let table: XiDachTable3D | null = null;

/** Đứng trong tầm bàn như server kiểm (bán kính trạm + CASINO.nearSlack). */
function nearTable(ctx: ClientActivityContext): boolean {
  const me = ctx.me();
  const s = ctx.world.map.stations.find((x) => x.id === 'xidach_table');
  return !!me && !!s && Math.hypot(me.x - s.x, me.z - s.z) <= s.r + CASINO.nearSlack;
}

function openPanel(ctx: ClientActivityContext): void {
  if (panel && !panel.closed) return panel.render();
  panel = new XiDachPanel(ctx, () => st, () => {
    panel = null;
  });
}

/** Ghế của mình còn đang rút/dằn ở ván này. */
const myTurn = (s: XiDachPublicState, pid: string): boolean =>
  s.phase === 'resolving' && s.step === 'turn' && s.seats.some((x) => x.pid === pid && !x.done);

/** Âm thanh riêng của mình: phỉnh khi cược của mình đổi; xu (+ reo hò nếu thắng đậm) khi chốt ván thắng. */
function playSounds(prev: XiDachPublicState | null, cur: XiDachPublicState, ctx: ClientActivityContext): void {
  if (!prev) return;
  const pid = ctx.state.me.pid;
  if (cur.phase === 'betting' && prev.phase === 'betting' && prev.round === cur.round) {
    const before = prev.seats.find((s) => s.pid === pid)?.stake ?? 0;
    const after = cur.seats.find((s) => s.pid === pid)?.stake ?? 0;
    if (after !== before) ctx.audio.play('chips', after > before ? { volume: 0.55 } : { volume: 0.35, rate: 1.2 });
  }
  if (cur.phase === 'result' && prev.phase !== 'result') {
    const line = cur.results.find((l) => l.pid === pid);
    if (line && line.net > 0) {
      ctx.audio.play('coin', { volume: 0.7 });
      if (line.net >= CASINO.maxBetPerRound) ctx.audio.play('cheer', { volume: 0.5 });
    }
  }
}

export const xiDachClient: ActivityClientModule = {
  id: 'xidach',
  maps: ['bar'],
  mount(ctx) {
    table = new XiDachTable3D(ctx);
  },
  prompt(station, ctx) {
    if (station.kind !== 'xidach_table') return undefined;
    if (!st || st.phase === 'idle') return '🃏 Mở bàn Xì Dách';
    if (st.phase === 'betting') return '🃏 Đặt cược Xì Dách';
    return myTurn(st, ctx.state.me.pid) ? '🃏 Rút / dằn Xì Dách' : '🃏 Xem bàn Xì Dách';
  },
  interact(station, ctx) {
    if (station.kind !== 'xidach_table') return false;
    if (!st || st.phase === 'idle') return false;
    openPanel(ctx);
    return true;
  },
  onState(s, ctx) {
    const prev = st;
    st = s as XiDachPublicState;
    if (!panel && prev && nearTable(ctx) && !ctx.ui.isModalOpen()) {
      // Tự mở bảng (không bao giờ đè bảng / hộp chọn khác): bàn vừa mở ván (như Bầu Cua / Tài Xỉu) mà đây là bàn sòng gần
      // mình nhất; hoặc vừa vào lượt rút/dằn mà mình có ghế (đang có cược ở bàn này nên mở cả khi đứng gần lan can đua hơn).
      const opened = prev.phase === 'idle' && st.phase === 'betting' && canAutoOpen(ctx, 'xidach_table');
      const turn = myTurn(st, ctx.state.me.pid) && prev.step !== 'turn';
      if (opened || turn) openPanel(ctx);
    }
    playSounds(prev, st, ctx);
    table?.sync(st, prev);
    panel?.render();
  },
  update(dt) {
    if (!st) return;
    table?.update(dt);
    panel?.tick();
  },
  unmount() {
    panel?.close();
    panel = null;
    table?.dispose();
    table = null;
    st = null;
  },
};
