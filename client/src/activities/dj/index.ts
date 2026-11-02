// DJ Chiếm Sóng — phía client: cả quán nghe nhạc DJ theo trạng thái server (4 bài thu sẵn tự phát nối tiếp, 4 bài tổng
// hợp lặp, video YouTube người đứng bàn dán — chiếu trên màn hình LED sân khấu), đèn / sàn LED nháy theo phách, tường
// LED theo phổ nhạc thật, hiệu ứng Drop / còi / khói / đèn chớp. Bàn DJ mở: ai đứng ở bàn cũng chỉnh được, mỗi lúc 1
// người (server kiểm) — người đang đứng bàn thấy bảng DJ.
import { DJ } from '@shared/index';
import { djSourceKey, trackInfo, type DjPublicState } from '@shared/activities/dj';
import type { ActivityClientModule } from '../types';
import { DjEffects } from './effects';
import { DjMusic, inCasino } from './music';
import { DjPanel } from './panel';
import './dj.css';

let state: DjPublicState | null = null;
let panel: DjPanel | null = null;
const music = new DjMusic();
const effects = new DjEffects();

/** Đóng bảng DJ; `silent` = server đã cho rời bàn rồi (không gửi 'close' lên nữa). */
function closePanel(silent: boolean): void {
  const p = panel;
  panel = null;
  if (p && !p.closed) p.close(silent);
}

/**
 * Đổi nguồn do người đứng bàn chọn (không phải tự sang bài khi bài thu sẵn / video YouTube hết) — kêu tiếng cào đĩa.
 * Video chưa biết thời lượng / livestream (không tự hết) tính như bài tổng hợp: đổi lúc nào cũng là đổi tay.
 */
function manualSwitch(prev: DjPublicState, s: DjPublicState, now: number): boolean {
  if (djSourceKey(prev) === djSourceKey(s)) return false;
  const dur = prev.yt ? (prev.yt.live ? 0 : prev.yt.durationMs) : trackInfo(prev.trackId).durationMs;
  return !prev.playing || dur === 0 || now - prev.startedAt < dur - 1000;
}

export const djClient: ActivityClientModule = {
  id: 'dj',
  maps: ['bar'],

  mount(ctx) {
    music.reset();
    effects.reset();
    if (state) {
      music.sync(state, ctx);
      ctx.world.controls.setLightTheme?.(state.theme);
    }
  },

  unmount(ctx) {
    music.stop(ctx);
    closePanel(true);
    // Vào lại Bar: runtime gọi onState với trạng thái mới nhất ngay sau mount — coi như lần đầu (không kêu cào đĩa).
    state = null;
  },

  prompt(station, ctx) {
    if (station.kind !== 'dj_booth') return undefined;
    const me = ctx.me();
    const cur = state?.controllerPid ?? null;
    if (cur && cur === me?.pid) return 'Bàn DJ (bạn đang đứng bàn)';
    if (!cur) return '🎧 Lên bàn DJ';
    const name = state?.controllerName ?? 'Ai đó';
    // Người giữ danh hiệu DJ (thắng vòng nhảy) chiếm lại được bàn.
    return ctx.state.room.djPid === me?.pid ? `🎧 Chiếm lại bàn DJ (${name} đang chỉnh)` : `Bàn DJ — ${name} đang chỉnh`;
  },

  onState(s, ctx) {
    const prev = state;
    state = s as DjPublicState;
    music.sync(state, ctx);
    if (!prev || prev.theme !== state.theme) ctx.world.controls.setLightTheme?.(state.theme);
    // Trong Sòng Công Đức tiếng cào đĩa nhỏ lại như nhạc.
    if (prev && manualSwitch(prev, state, ctx.serverNow())) {
      ctx.audio.play('scratch', { volume: 0.6 * (inCasino(ctx) ? DJ.casinoLevel : 1) });
    }
    effects.onState(state, ctx);
    panel?.render();
  },

  onOpen(data, ctx) {
    state = data as DjPublicState;
    music.sync(state, ctx);
    closePanel(true);
    // Đứng đúng chỗ DJ sau bàn, quay mặt ra sàn nhảy.
    const booth = ctx.world.map.stations.find((x) => x.kind === 'dj_booth');
    if (booth) ctx.snapTo(booth.x, booth.z, booth.ry);
    panel = new DjPanel(
      ctx,
      () => state,
      () => {
        // Người chơi tự đóng bảng (Esc / ✕) → rời bàn để bàn trống cho người khác.
        panel = null;
        ctx.send('close');
        ctx.setLocalAnim(null);
      },
    );
    ctx.setLocalAnim('dj');
  },

  onClose(_reason, ctx) {
    ctx.setLocalAnim(null);
    closePanel(true);
  },

  update(_dt, ctx) {
    if (!state) return;
    music.update(state, ctx);
    panel?.tick();
  },
};
