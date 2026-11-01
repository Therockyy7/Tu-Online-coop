// Tài Xỉu chẵn lẻ (Sòng Công Đức) phía client: bảng cược (panel.ts, bộ UI sòng dùng chung) + đĩa sứ, bát úp, 3 xúc xắc
// và nhà cái NPC trên bàn (table3d.ts). Server quyết định mọi kết quả; client chỉ hiển thị + gửi thao tác.
// E ở bàn: bàn đang nghỉ → gửi interact để server mở ván (bảng tự mở khi ván bắt đầu mà mình đứng gần — casino/autoOpen.ts);
// đang chạy → mở bảng.
import './taixiu.css';
import { CASINO } from '@shared/index';
import { stakeTotal } from '@shared/activities/casino';
import type { TaiXiuPublicState } from '@shared/activities/taixiu';
import { canAutoOpen } from '../casino/autoOpen';
import type { ActivityClientModule, ClientActivityContext } from '../types';
import { TaiXiuPanel } from './panel';
import { TaiXiuTable } from './table3d';

let st: TaiXiuPublicState | null = null;
let panel: TaiXiuPanel | null = null;
let table: TaiXiuTable | null = null;

/** Đứng trong tầm bàn như server kiểm (bán kính trạm + CASINO.nearSlack). */
function nearTable(ctx: ClientActivityContext): boolean {
  const me = ctx.me();
  const s = ctx.world.map.stations.find((x) => x.id === 'taixiu_table');
  return !!me && !!s && Math.hypot(me.x - s.x, me.z - s.z) <= s.r + CASINO.nearSlack;
}

function openPanel(ctx: ClientActivityContext): void {
  if (panel && !panel.closed) return panel.render();
  panel = new TaiXiuPanel(ctx, () => st, () => {
    panel = null;
  });
}

/** Âm thanh riêng của mình: phỉnh khi cược của mình đổi, xu (+ reo hò nếu thắng đậm) khi mở bát thắng. */
function playSounds(prev: TaiXiuPublicState | null, cur: TaiXiuPublicState, ctx: ClientActivityContext): void {
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

export const taiXiuClient: ActivityClientModule = {
  id: 'taixiu',
  maps: ['bar'],
  mount(ctx) {
    table = new TaiXiuTable(ctx);
  },
  prompt(station) {
    if (station.kind !== 'taixiu_table') return undefined;
    if (!st || st.phase === 'idle') return '🎲 Mở bàn Tài Xỉu';
    return st.phase === 'betting' ? '🎲 Đặt cược Tài Xỉu' : '🎲 Xem bàn Tài Xỉu';
  },
  interact(station, ctx) {
    if (station.kind !== 'taixiu_table') return false;
    if (!st || st.phase === 'idle') return false;
    openPanel(ctx);
    return true;
  },
  onState(s, ctx) {
    const prev = st;
    st = s as TaiXiuPublicState;
    // Bàn vừa mở ván mà mình đứng gần → tự mở bảng (như Bầu Cua); không đè bảng khác, đứng gần bàn sòng khác hơn thì thôi.
    if (prev?.phase === 'idle' && st.phase === 'betting' && !panel && nearTable(ctx) && canAutoOpen(ctx, 'taixiu_table')) openPanel(ctx);
    playSounds(prev, st, ctx);
    table?.sync(st, prev);
    panel?.render();
  },
  update(_dt) {
    if (!st) return;
    table?.update(st);
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
