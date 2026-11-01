// Đua Ngựa (Sòng Công Đức) phía client: bảng cược (panel.ts, bộ UI sòng dùng chung), 6 ngựa mô hình chạy theo kịch bản của
// server ở neo race_track (horses3d.ts + horseModel.ts) và bảng LED ở neo race_board (board3d.ts). Server quyết định mọi
// kết quả; client chỉ hiển thị + gửi thao tác. Hai lan can race_rail_1/2 là cùng một bàn. E ở lan can: đường đua đang nghỉ
// → gửi interact để server mở ván (bảng tự mở khi ván bắt đầu mà mình đứng gần — casino/autoOpen.ts); đang chạy → mở bảng.
import './duangua.css';
import { CASINO } from '@shared/index';
import { stakeTotal } from '@shared/activities/casino';
import type { DuaNguaPublicState } from '@shared/activities/duangua';
import { canAutoOpen } from '../casino/autoOpen';
import type { ActivityClientModule, ClientActivityContext } from '../types';
import { RaceBoard } from './board3d';
import { RaceHorses } from './horses3d';
import { DuaNguaPanel } from './panel';

let st: DuaNguaPublicState | null = null;
let panel: DuaNguaPanel | null = null;
let horses: RaceHorses | null = null;
let board: RaceBoard | null = null;

/** Đứng trong tầm một trong hai lan can như server kiểm (bán kính trạm + CASINO.nearSlack). */
function nearRail(ctx: ClientActivityContext): boolean {
  const me = ctx.me();
  if (!me) return false;
  return ctx.world.map.stations.some((s) => s.kind === 'race_rail' && Math.hypot(me.x - s.x, me.z - s.z) <= s.r + CASINO.nearSlack);
}

function openPanel(ctx: ClientActivityContext): void {
  if (panel && !panel.closed) return panel.render();
  panel = new DuaNguaPanel(ctx, () => st, () => {
    panel = null;
  });
}

/** Âm thanh riêng của mình: phỉnh khi cược của mình đổi, xu (+ reo hò nếu thắng đậm) khi ngựa mình cược về nhất. */
function playSounds(prev: DuaNguaPublicState | null, cur: DuaNguaPublicState, ctx: ClientActivityContext): void {
  if (!prev) return;
  const pid = ctx.state.me.pid;
  if (cur.phase === 'betting' && prev.phase === 'betting' && prev.round === cur.round) {
    const before = stakeTotal(prev.bets[pid]);
    const after = stakeTotal(cur.bets[pid]);
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

export const duaNguaClient: ActivityClientModule = {
  id: 'duangua',
  maps: ['bar'],
  mount(ctx) {
    horses = new RaceHorses(ctx);
    board = new RaceBoard(ctx);
  },
  prompt(station) {
    if (station.kind !== 'race_rail') return undefined;
    if (!st || st.phase === 'idle') return '🏇 Mở đường đua';
    return st.phase === 'betting' ? '🏇 Đặt cược Đua Ngựa' : '🏇 Xem đua ngựa';
  },
  interact(station, ctx) {
    if (station.kind !== 'race_rail') return false;
    if (!st || st.phase === 'idle') return false;
    openPanel(ctx);
    return true;
  },
  onState(s, ctx) {
    const prev = st;
    st = s as DuaNguaPublicState;
    // Đường đua vừa mở ván mà mình đứng gần một lan can → tự mở bảng (như Bầu Cua / Tài Xỉu); không đè bảng khác, đứng gần
    // bàn sòng khác hơn (lối đi giữa lan can và bàn Tài Xỉu / Xì Dách) thì thôi.
    if (prev?.phase === 'idle' && st.phase === 'betting' && !panel && nearRail(ctx) && canAutoOpen(ctx, 'race_rail')) openPanel(ctx);
    playSounds(prev, st, ctx);
    horses?.sync(st, prev);
    panel?.render();
  },
  update(dt) {
    if (!st) return;
    horses?.update(dt, st);
    board?.update(st);
    panel?.tick();
  },
  unmount() {
    panel?.close();
    panel = null;
    horses?.dispose();
    horses = null;
    board?.dispose();
    board = null;
    st = null;
  },
};
