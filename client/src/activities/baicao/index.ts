// Bài Cào 3 lá (Sòng Công Đức) phía client: bảng cược + tay bài (panel.ts, bộ UI sòng dùng chung) + lá bài 3D bay từ cỗ
// bài tới 6 tay đầu / nhà cái, lật dần theo mốc giờ server, và nhà cái NPC phía Nam bàn (table3d.ts). Server quyết định
// mọi kết quả; client chỉ hiển thị + gửi thao tác.
// E ở bàn: bàn đang nghỉ → gửi interact để server mở ván (bảng tự mở khi ván bắt đầu mà mình đứng gần — casino/autoOpen.ts);
// đang chạy → mở bảng.
import './baicao.css';
import { CASINO } from '@shared/index';
import type { BaiCaoPublicState } from '@shared/activities/baicao';
import { canAutoOpen } from '../casino/autoOpen';
import type { ActivityClientModule, ClientActivityContext } from '../types';
import { BaiCaoPanel } from './panel';
import { BaiCaoTable3D } from './table3d';

let st: BaiCaoPublicState | null = null;
let panel: BaiCaoPanel | null = null;
let table: BaiCaoTable3D | null = null;

/** Đứng trong tầm bàn như server kiểm (bán kính trạm + CASINO.nearSlack). */
function nearTable(ctx: ClientActivityContext): boolean {
  const me = ctx.me();
  const s = ctx.world.map.stations.find((x) => x.id === 'baicao_table');
  return !!me && !!s && Math.hypot(me.x - s.x, me.z - s.z) <= s.r + CASINO.nearSlack;
}

function openPanel(ctx: ClientActivityContext): void {
  if (panel && !panel.closed) return panel.render();
  panel = new BaiCaoPanel(ctx, () => st, () => {
    panel = null;
  });
}

/** Âm thanh riêng của mình: phỉnh khi cược của mình đổi; xu (+ reo hò nếu thắng đậm) khi chốt ván thắng. */
function playSounds(prev: BaiCaoPublicState | null, cur: BaiCaoPublicState, ctx: ClientActivityContext): void {
  if (!prev) return;
  const pid = ctx.state.me.pid;
  if (cur.phase === 'betting' && prev.phase === 'betting' && prev.round === cur.round) {
    const before = prev.hands.find((x) => x.pid === pid)?.stake ?? 0;
    const after = cur.hands.find((x) => x.pid === pid)?.stake ?? 0;
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

export const baiCaoClient: ActivityClientModule = {
  id: 'baicao',
  maps: ['bar'],
  mount(ctx) {
    table = new BaiCaoTable3D(ctx);
  },
  prompt(station) {
    if (station.kind !== 'baicao_table') return undefined;
    if (!st || st.phase === 'idle') return '🃏 Mở bàn Bài Cào';
    return st.phase === 'betting' ? '🃏 Đặt cược Bài Cào' : '🃏 Xem bàn Bài Cào';
  },
  interact(station, ctx) {
    if (station.kind !== 'baicao_table') return false;
    if (!st || st.phase === 'idle') return false;
    openPanel(ctx);
    return true;
  },
  onState(s, ctx) {
    const prev = st;
    st = s as BaiCaoPublicState;
    // Bàn vừa mở ván mà mình đứng gần → tự mở bảng (như Bầu Cua / Tài Xỉu); không đè bảng khác, gần bàn sòng khác hơn thì thôi.
    if (prev?.phase === 'idle' && st.phase === 'betting' && !panel && nearTable(ctx) && canAutoOpen(ctx, 'baicao_table')) openPanel(ctx);
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
