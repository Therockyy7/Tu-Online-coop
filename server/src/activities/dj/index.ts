// Bàn DJ (spec 8.4 + Quán Bar mở rộng mục 4): vào Bar tự phát danh sách thu sẵn (hết bài sang bài kế, hết danh sách
// quay lại; bài tổng hợp lặp tới khi đổi). Ai đứng ở bàn cũng chỉnh được, mỗi lúc 1 người; người giữ danh hiệu DJ (thắng
// vòng nhảy) chiếm lại được bàn; Esc / đi xa / mất kết nối / đổi map → bàn trống. Mốc nhịp ghi vào bộ đếm dùng chung
// (dj_bpm, dj_beat0, dj_playing) để Thi nhảy canh theo bài đang phát; có sảnh/vòng nhảy thì cấm dừng / đổi bài, bài thu
// sẵn hết giữa chừng thì phát lại từ đầu đúng lưới ô nhịp cũ.
import { z } from 'zod';
import { DJ, findStation } from '@shared/index';
import {
  DJ_RECORDED,
  DJ_TRACK_IDS,
  LIGHT_THEMES,
  alignedStartAt,
  beat0At,
  nextTrackId,
  trackInfo,
  type DjAnyTrackId,
  type DjPublicState,
} from '@shared/activities/dj';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const trackMsg = z.object({ id: z.enum(DJ_TRACK_IDS) });
const themeMsg = z.object({ theme: z.enum(LIGHT_THEMES) });
/**
 * Tâm sàn nhảy LED của Bar (trạm khu vực 'dance_floor'): pháo giấy của bàn DJ bắn ở đây cho mọi máy — không kèm toạ độ
 * thì mỗi máy tự bắn quanh chính người chơi, kể cả người đang ở trong Sòng Công Đức.
 */
const DANCE_FLOOR = findStation('dance_floor')!.station;

type EffectField = 'dropAt' | 'hornAt' | 'confettiAt' | 'smokeAt' | 'strobeAt';
/** Hiệu ứng ở bàn: lệnh → [trường mốc trong trạng thái, thời gian nghỉ]. */
const EFFECTS: Record<string, readonly [EffectField, number]> = {
  drop: ['dropAt', DJ.dropCooldownMs],
  horn: ['hornAt', DJ.hornCooldownMs],
  confetti: ['confettiAt', DJ.confettiCooldownMs],
  smoke: ['smokeAt', DJ.smokeCooldownMs],
  strobe: ['strobeAt', DJ.strobeCooldownMs],
};

function create(ctx: ActivityContext): ActivityInstance {
  const first = DJ_RECORDED[0]!;
  const state: DjPublicState = {
    trackId: first.id,
    bpm: first.bpm,
    startedAt: ctx.now(),
    beat0: ctx.now() + first.beatOffsetMs,
    playing: false,
    pausedAtMs: 0,
    theme: 'neon',
    dropAt: 0,
    hornAt: 0,
    confettiAt: 0,
    smokeAt: 0,
    strobeAt: 0,
    controllerPid: null,
    controllerName: null,
  };
  /** Lần đổi bài / phát-dừng gần nhất do người đứng bàn bấm (tự sang bài không tính). */
  let lastSwitchAt = -Infinity;
  let lastToggleAt = -Infinity;
  /** Lần đổi màu đèn gần nhất (chống đổi xen kẽ liên tục làm đèn cả quán nháy). */
  let lastThemeAt = -Infinity;

  const publish = () => {
    ctx.shared.set('dj_bpm', state.bpm);
    ctx.shared.set('dj_beat0', state.beat0);
    ctx.shared.set('dj_playing', state.playing ? 1 : 0);
    ctx.setState({ ...state });
  };

  /** Sảnh hoặc vòng nhảy đang chấm điểm theo nhịp bài hiện tại. */
  const danceBusy = (now: number) => now < ctx.shared.get('dance_until') || now < ctx.shared.get('dance_lobby_until');

  /** Phát bài `id`; giây 0 của bài ứng với giờ server `startedAt` (phát tiếp sau khi dừng = lùi mốc về trước). */
  function play(id: DjAnyTrackId, startedAt: number): void {
    const t = trackInfo(id);
    state.trackId = t.id;
    state.bpm = t.bpm;
    state.startedAt = startedAt;
    state.playing = true;
    state.pausedAtMs = 0;
    state.beat0 = beat0At(t, startedAt, Math.max(0, ctx.now() - startedAt));
    publish();
  }

  /** Phát tiếp từ chỗ đã dừng (sau một nhịp ngắn cho máy khách kịp tua). */
  const resume = (now: number) => play(state.trackId, now + DJ.switchDelayMs - state.pausedAtMs);

  function pause(now: number): void {
    state.pausedAtMs = Math.max(0, now - state.startedAt);
    state.playing = false;
    publish();
  }

  /** Bài thu sẵn phát hết: đang có nhảy → phát lại chính bài đó đúng lưới ô nhịp cũ; không thì sang bài thu sẵn kế. */
  function onTrackEnd(now: number): void {
    const t = trackInfo(state.trackId);
    if (danceBusy(now)) play(t.id, alignedStartAt(t, state, now + DJ.switchDelayMs));
    else play(nextTrackId(t.id, 1), now + DJ.switchDelayMs);
  }

  /** Bỏ người đứng bàn (không gửi trạng thái — người gọi tự publish). */
  function dropController(reason: string, notify?: string): void {
    const pid = state.controllerPid;
    if (!pid) return;
    state.controllerPid = null;
    state.controllerName = null;
    const p = ctx.player(pid);
    if (p?.activity === 'dj') ctx.close(pid, reason);
    if (notify && p) ctx.toast(pid, notify, 'info');
  }

  function release(reason: string, notify?: string): void {
    if (!state.controllerPid) return;
    dropController(reason, notify);
    publish();
  }

  /** Người đứng bàn còn ở đó: còn trong phòng, còn kết nối, chưa đi xa quá bán kính bàn + leaveSlack. */
  const present = (pid: string) => {
    const p = ctx.player(pid);
    return !!p && p.connected && ctx.isNear(pid, 'dj_booth', DJ.leaveSlack);
  };

  function command(p: ServerPlayerView, type: string, data: unknown): void {
    const now = ctx.now();
    if (type === 'play') {
      if (state.playing || now - lastToggleAt < DJ.toggleCooldownMs) return;
      lastToggleAt = now;
      return resume(now);
    }
    if (type === 'stop' || type === 'next' || type === 'prev' || type === 'track') {
      if (danceBusy(now)) return ctx.toast(p.pid, 'Đang có vòng nhảy — dừng hay đổi bài sau khi hết vòng nhé.', 'warn');
      if (type === 'stop') {
        if (!state.playing || now - lastToggleAt < DJ.toggleCooldownMs) return;
        lastToggleAt = now;
        return pause(now);
      }
      let id: DjAnyTrackId;
      if (type === 'track') {
        const r = trackMsg.safeParse(data);
        if (!r.success || (r.data.id === state.trackId && state.playing)) return;
        id = r.data.id;
      } else {
        id = nextTrackId(state.trackId, type === 'next' ? 1 : -1);
      }
      if (now - lastSwitchAt < DJ.switchCooldownMs) return;
      lastSwitchAt = now;
      play(id, now + DJ.switchDelayMs);
      const t = trackInfo(id);
      ctx.chatSystem(`🎧 ${p.name} đổi bài: ${t.name} (${Math.round(t.bpm)} BPM)`);
      return;
    }
    if (type === 'theme') {
      const r = themeMsg.safeParse(data);
      if (!r.success || r.data.theme === state.theme || now - lastThemeAt < DJ.themeCooldownMs) return;
      lastThemeAt = now;
      state.theme = r.data.theme;
      return publish();
    }
    const fx = EFFECTS[type];
    if (!fx) return;
    const [field, cooldown] = fx;
    if (now - state[field] < cooldown) return;
    state[field] = now;
    if (type === 'confetti') ctx.fx({ type: 'confetti', x: DANCE_FLOOR.x, z: DANCE_FLOOR.z });
    publish();
  }

  if (ctx.map() === 'bar') play(first.id, ctx.now() + DJ.enterDelayMs);
  else publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'dj_booth') return;
      const cur = state.controllerPid;
      if (cur === p.pid) return ctx.open(p.pid, { ...state });
      if (cur && present(cur)) {
        if (ctx.djPid() !== p.pid) return ctx.toast(p.pid, `${state.controllerName} đang chỉnh nhạc ở bàn DJ.`, 'info');
        // Người giữ danh hiệu DJ (thắng vòng nhảy) chiếm lại bàn.
        dropController('taken', `DJ ${p.name} chiếm lại bàn DJ.`);
        ctx.chatSystem(`🎧 DJ ${p.name} chiếm lại bàn DJ.`);
      } else {
        dropController('esc');
      }
      state.controllerPid = p.pid;
      state.controllerName = p.name;
      publish();
      ctx.open(p.pid, { ...state });
    },

    onAction(p, type, data) {
      if (type === 'close') {
        if (p.pid === state.controllerPid) release('esc');
        else if (p.activity === 'dj') ctx.close(p.pid, 'esc');
        return;
      }
      if (p.pid !== state.controllerPid || !ctx.isNear(p.pid, 'dj_booth', DJ.leaveSlack)) return;
      command(p, type, data);
    },

    onLeave(p) {
      if (p.pid === state.controllerPid) release('esc');
    },

    tick(_dt, now) {
      if (ctx.map() !== 'bar') return;
      const cur = state.controllerPid;
      if (cur && !present(cur)) release('far', ctx.player(cur)?.connected ? 'Bạn đã rời bàn DJ.' : undefined);
      if (!state.playing) {
        // Sảnh nhảy mở lúc nhạc đang dừng → tự phát tiếp để có nhịp mà nhảy.
        if (danceBusy(now)) resume(now);
        return;
      }
      const t = trackInfo(state.trackId);
      if (t.kind !== 'recorded') return;
      const pos = now - state.startedAt;
      if (pos >= t.durationMs) return onTrackEnd(now);
      // Bài ghép nhiều đoạn lệch pha: qua mốc đổi pha thì lưới phách đổi theo đoạn.
      const b0 = beat0At(t, state.startedAt, Math.max(0, pos));
      if (b0 !== state.beat0) {
        state.beat0 = b0;
        publish();
      }
    },

    onMapChange(map) {
      if (state.controllerPid) {
        const pid = state.controllerPid;
        state.controllerPid = null;
        state.controllerName = null;
        ctx.close(pid, 'map');
      }
      lastSwitchAt = -Infinity;
      lastToggleAt = -Infinity;
      lastThemeAt = -Infinity;
      state.dropAt = state.hornAt = state.confettiAt = state.smokeAt = state.strobeAt = 0;
      if (map === 'bar') return play(first.id, ctx.now() + DJ.enterDelayMs);
      state.playing = false;
      state.pausedAtMs = 0;
      publish();
    },
  };
}

export const djModule: ActivityServerModule = { id: 'dj', maps: ['bar'], create };
