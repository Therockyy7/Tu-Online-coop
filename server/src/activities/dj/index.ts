// DJ Chiếm Sóng (spec 8.4): chỉ DJ (hoặc Phương Trượng khi chưa có DJ) điều khiển bàn DJ — đổi bài, Drop!, màu đèn,
// còi hú. Mốc nhịp lưu vào bộ đếm dùng chung để Thi nhảy canh theo bài đang phát.
import { z } from 'zod';
import { DJ, type DjTrackId } from '@shared/index';
import { LIGHT_THEMES, trackDef, type DjPublicState } from '@shared/activities/dj';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const trackMsg = z.object({ id: z.enum(DJ.tracks.map((t) => t.id) as [DjTrackId, ...DjTrackId[]]) });
const themeMsg = z.object({ theme: z.enum(LIGHT_THEMES) });

function create(ctx: ActivityContext): ActivityInstance {
  const first = DJ.tracks[0]!;
  const state: DjPublicState = { trackId: first.id, bpm: first.bpm, startedAt: ctx.now(), theme: 'neon', dropAt: 0, hornAt: 0 };

  const publish = () => {
    ctx.shared.set('dj_track', DJ.tracks.findIndex((t) => t.id === state.trackId));
    ctx.shared.set('dj_started_at', state.startedAt);
    ctx.setState({ ...state });
  };

  /** DJ hiện tại; chưa có DJ thì Phương Trượng điều khiển. */
  const canControl = (p: ServerPlayerView) => {
    const dj = ctx.djPid();
    return dj ? dj === p.pid : p.isHost;
  };

  publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'dj_booth') return;
      if (!canControl(p)) {
        const dj = ctx.djPid();
        const name = dj ? ctx.player(dj)?.name : null;
        ctx.toast(p.pid, name ? `${name} đang làm DJ. Thắng vòng nhảy để chiếm sóng!` : 'Chỉ DJ mới điều khiển được bàn này.', 'warn');
        return;
      }
      ctx.open(p.pid, { ...state });
    },

    onAction(p, type, data) {
      if (type === 'close') {
        if (p.activity === 'dj') ctx.close(p.pid, 'esc');
        return;
      }
      if (!canControl(p) || !ctx.isNear(p.pid, 'dj_booth', 2)) return;
      const now = ctx.now();
      if (type === 'track') {
        const r = trackMsg.safeParse(data);
        if (!r.success || r.data.id === state.trackId) return;
        // Đang có vòng nhảy chấm điểm theo nhịp bài hiện tại → chưa cho đổi bài.
        if (now < ctx.shared.get('dance_until')) return ctx.toast(p.pid, 'Đang có vòng nhảy, đổi bài sau khi hết vòng nhé.', 'warn');
        const def = trackDef(r.data.id);
        state.trackId = def.id;
        state.bpm = def.bpm;
        state.startedAt = now + 700;
        publish();
        ctx.chatSystem(`🎧 DJ ${p.name} đổi bài: ${def.name} (${def.bpm} BPM)`);
      } else if (type === 'drop') {
        if (now - state.dropAt < DJ.dropCooldownMs) return;
        state.dropAt = now;
        publish();
      } else if (type === 'theme') {
        const r = themeMsg.safeParse(data);
        if (!r.success) return;
        state.theme = r.data.theme;
        publish();
      } else if (type === 'horn') {
        if (now - state.hornAt < DJ.hornCooldownMs) return;
        state.hornAt = now;
        publish();
      }
    },

    onLeave(p) {
      if (p.activity === 'dj') ctx.close(p.pid, 'esc');
    },

    onMapChange(map) {
      if (map !== 'bar') return;
      state.startedAt = ctx.now() + 1000;
      state.dropAt = 0;
      publish();
    },
  };
}

export const djModule: ActivityServerModule = { id: 'dj', maps: ['bar'], create };
