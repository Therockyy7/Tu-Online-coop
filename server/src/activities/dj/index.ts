// Bàn DJ (spec 8.4 + Quán Bar mở rộng mục 4): vào Bar tự phát danh sách thu sẵn (hết bài sang bài kế, hết danh sách
// quay lại; bài tổng hợp lặp tới khi đổi). Ai đứng ở bàn cũng chỉnh được, mỗi lúc 1 người; người giữ danh hiệu DJ (thắng
// vòng nhảy) chiếm lại được bàn; Esc / đi xa / mất kết nối / đổi map → bàn trống. Mốc nhịp ghi vào bộ đếm dùng chung
// (dj_bpm, dj_beat0, dj_playing) để Thi nhảy canh theo bài đang phát; có sảnh/vòng nhảy thì cấm dừng / đổi bài, bài thu
// sẵn hết giữa chừng thì phát lại từ đầu đúng lưới ô nhịp cũ.
// YouTube (spec 2026-11-02-dj-youtube-led-design.md mục 3 + 5): người đứng bàn dán link → tra cứu oEmbed → phát ngay
// (đang nhạc có sẵn, hàng chờ trống) hoặc xếp hàng chờ; hết video (thời lượng do máy khách báo) sang video kế, hết hàng
// về bài có sẵn; mở Thi nhảy thì video đang dở về đầu hàng, phát nhạc có sẵn cho đúng nhịp, nhảy xong phát tiếp.
import { z } from 'zod';
import { DJ, findStation, sanitizeTitle, type Pid } from '@shared/index';
import {
  DJ_RECORDED,
  DJ_TRACK_IDS,
  LIGHT_THEMES,
  alignedStartAt,
  beat0At,
  nextTrackId,
  positionMs,
  trackInfo,
  type DjAnyTrackId,
  type DjPublicState,
  type DjYoutubeItem,
  type DjYoutubeNow,
} from '@shared/activities/dj';
import {
  YT_FATAL_ERRORS,
  YT_ID_RE,
  YT_LOOKUP_FAIL_TEXT,
  parseYoutubeUrl,
  youtubeErrorText,
  type YoutubeLink,
} from '@shared/activities/youtube';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';
import { createOembedLookup, type YoutubeLookup, type YoutubeLookupResult } from './youtube';

const trackMsg = z.object({ id: z.enum(DJ_TRACK_IDS) });
const themeMsg = z.object({ theme: z.enum(LIGHT_THEMES) });
const ytUrlMsg = z.object({ url: z.string().trim().min(1).max(DJ.youtube.urlMax) });
const ytKeyMsg = z.object({ key: z.number().int() });
// z.number() (zod 4) đã từ chối NaN / ±Infinity.
const ytMetaMsg = z.object({
  videoId: z.string().regex(YT_ID_RE),
  durationMs: z.number().optional(),
  live: z.boolean().optional(),
});
const ytErrorMsg = z.object({ videoId: z.string().regex(YT_ID_RE), code: z.number().int() });

/** Tra cứu không ra kết quả (reject / ném lỗi): như lỗi mạng — vẫn nhận link, tên chung. */
const UNVERIFIED: YoutubeLookupResult = { ok: true, title: '', author: '', verified: false };
/** Tên video khi YouTube không cho biết (lỗi mạng / video không có tên). */
const YT_DEFAULT_TITLE = 'Video YouTube';
/**
 * Hết sảnh / vòng nhảy bao lâu mới phát tiếp YouTube. Hết sảnh thì Thi nhảy mới đặt dance_until (hẹn giờ phòng, chạy lệch
 * vài ms với tick 20 Hz): phát tiếp ngay ở khe hở đó thì vòng nhảy đọc lưới phách danh nghĩa của video và chấm sai nhịp.
 */
const DANCE_SETTLE_MS = 1000;
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

/** Phần phụ thuộc tiêm được (test thay tra cứu YouTube bằng bản giả). */
export interface DjDeps {
  lookup: YoutubeLookup;
}

export function createDj(ctx: ActivityContext, deps: DjDeps): ActivityInstance {
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
    yt: null,
    ytQueue: [],
  };
  /** Lần đổi bài / phát-dừng gần nhất do người đứng bàn bấm (tự sang bài không tính). */
  let lastSwitchAt = -Infinity;
  let lastToggleAt = -Infinity;
  /** Lần đổi màu đèn gần nhất (chống đổi xen kẽ liên tục làm đèn cả quán nháy). */
  let lastThemeAt = -Infinity;
  /** Khóa video YouTube cuối cùng đã cấp (tăng dần, không dùng lại trong phòng). */
  let nextKey = 0;
  /** Lượt tra cứu mới nhất — kết quả lượt cũ về muộn thì bỏ. */
  let reqSeq = 0;
  let lastPasteAt = -Infinity;
  /** Có video chờ phát tiếp khi hết sảnh / vòng nhảy (bị Thi nhảy chen ngang, hoặc dán lúc đang nhảy mà vốn phát ngay). */
  let resumeAfterDance = false;
  /** Video đang phát chưa biết thời lượng: tới giờ này (giờ server) chưa máy nào báo được → coi như không phát được. */
  let metaDeadline = Infinity;
  /** Thời lượng / livestream đã biết của video bị Thi nhảy đẩy về hàng chờ (theo khóa) — phát tiếp khỏi chờ báo lại. */
  const metaByKey = new Map<number, Pick<DjYoutubeNow, 'durationMs' | 'live'>>();
  let disposed = false;

  // Trạng thái gửi đi là bản sao nông: yt / ytQueue luôn thay object / mảng mới, không sửa tại chỗ (host giữ tham chiếu).
  const publish = () => {
    ctx.shared.set('dj_bpm', state.bpm);
    ctx.shared.set('dj_beat0', state.beat0);
    ctx.shared.set('dj_playing', state.playing ? 1 : 0);
    ctx.setState({ ...state });
  };

  /** Sảnh hoặc vòng nhảy đang chấm điểm theo nhịp bài hiện tại. */
  const danceBusy = (now: number) => now < ctx.shared.get('dance_until') || now < ctx.shared.get('dance_lobby_until');
  /** Từ giờ này (giờ server) Thi nhảy coi như đã yên: hết sảnh / vòng + DANCE_SETTLE_MS. */
  const danceQuietAt = () =>
    Math.max(ctx.shared.get('dance_until'), ctx.shared.get('dance_lobby_until')) + DANCE_SETTLE_MS;

  /** Phát bài `id`; giây 0 của bài ứng với giờ server `startedAt` (phát tiếp sau khi dừng = lùi mốc về trước). */
  function play(id: DjAnyTrackId, startedAt: number): void {
    const t = trackInfo(id);
    state.yt = null;
    state.trackId = t.id;
    state.bpm = t.bpm;
    state.startedAt = startedAt;
    state.playing = true;
    state.pausedAtMs = 0;
    state.beat0 = beat0At(t, startedAt, Math.max(0, ctx.now() - startedAt));
    publish();
  }

  /**
   * Phát video YouTube `item` từ item.startMs, bắt đầu sau startDelayMs (máy khách kịp tải trình phát). Nhịp danh nghĩa
   * DJ.youtube.bpm, lưới phách neo ở giây 0 của video; trackId giữ bài có sẵn phát gần nhất.
   */
  function playYoutube(item: DjYoutubeItem, now: number): void {
    const playAt = now + DJ.youtube.startDelayMs;
    const meta = metaByKey.get(item.key);
    metaByKey.delete(item.key);
    state.yt = { ...item, durationMs: meta?.durationMs ?? 0, live: meta?.live ?? false };
    state.bpm = DJ.youtube.bpm;
    state.startedAt = playAt - item.startMs;
    state.beat0 = state.startedAt;
    state.playing = true;
    state.pausedAtMs = 0;
    metaDeadline = playAt + DJ.youtube.metaTimeoutMs;
    // Đã có video phát → không còn gì phải "phát tiếp khi hết vòng" (tránh tự phát thêm lần nữa, nhảy cóc hàng chờ).
    resumeAfterDance = false;
    publish();
  }

  /** Sang nguồn kế: video đầu hàng chờ (kèm chat) → hết hàng thì bài có sẵn kế sau trackId. */
  function advance(now: number, chat = true): void {
    const [head, ...rest] = state.ytQueue;
    if (!head) return play(nextTrackId(state.trackId, 1), now + DJ.switchDelayMs);
    state.ytQueue = rest;
    playYoutube(head, now);
    if (chat) ctx.chatSystem(`▶️ Tiếp theo: ${head.title} (${head.byName} chọn)`);
  }

  /** Phát tiếp từ chỗ đã dừng (sau một nhịp ngắn cho máy khách kịp tua). */
  function resume(now: number): void {
    if (!state.yt) return play(state.trackId, now + DJ.switchDelayMs - state.pausedAtMs);
    // Livestream không có vị trí → phát tiếp từ chỗ đang trực tiếp (kể cả khi lúc dừng chưa biết là livestream).
    state.startedAt = now + DJ.switchDelayMs - (state.yt.live ? 0 : state.pausedAtMs);
    state.beat0 = state.startedAt;
    state.playing = true;
    state.pausedAtMs = 0;
    metaDeadline = now + DJ.switchDelayMs + DJ.youtube.metaTimeoutMs;
    publish();
  }

  function pause(now: number): void {
    const yt = state.yt;
    // YouTube: dừng trước giờ bắt đầu vẫn tính từ giây bắt đầu của link; livestream không có vị trí.
    state.pausedAtMs = yt?.live ? 0 : Math.max(yt?.startMs ?? 0, now - state.startedAt);
    state.playing = false;
    publish();
  }

  /**
   * Bài thu sẵn phát hết: đang có nhảy → phát lại chính bài đó đúng lưới ô nhịp cũ; hàng chờ YouTube có video → phát
   * video đầu hàng; không thì sang bài thu sẵn kế.
   */
  function onTrackEnd(now: number): void {
    const t = trackInfo(state.trackId);
    if (danceBusy(now)) play(t.id, alignedStartAt(t, state, now + DJ.switchDelayMs));
    else if (state.ytQueue.length > 0) advance(now);
    else play(nextTrackId(t.id, 1), now + DJ.switchDelayMs);
  }

  /**
   * Mở sảnh nhảy lúc đang phát YouTube (video không có nhịp đo được): video về đầu hàng chờ — khóa mới (máy khách nạp lại
   * như nguồn mới), phát tiếp đúng đoạn đang dở, livestream từ chỗ trực tiếp — rồi phát bài có sẵn kế; hết vòng phát tiếp.
   */
  function yieldToDance(yt: DjYoutubeNow, now: number): void {
    const key = ++nextKey;
    if (yt.durationMs > 0 || yt.live) metaByKey.set(key, { durationMs: yt.durationMs, live: yt.live });
    const startMs = yt.live ? 0 : Math.max(yt.startMs, Math.round(positionMs(state, now)));
    const item: DjYoutubeItem = {
      key,
      videoId: yt.videoId,
      title: yt.title,
      author: yt.author,
      startMs,
      byPid: yt.byPid,
      byName: yt.byName,
    };
    state.ytQueue = [item, ...state.ytQueue];
    play(nextTrackId(state.trackId, 1), now + DJ.switchDelayMs);
    resumeAfterDance = true;
    ctx.chatSystem('💃 Có Thi nhảy — tạm chuyển về nhạc thu sẵn cho đúng nhịp; nhảy xong phát tiếp video.');
  }

  /** Lần dán này phải xếp hàng (không phát ngay): đang phát YouTube, hàng chờ còn video, hoặc đang có vòng nhảy. */
  const mustQueue = (now: number) => state.yt !== null || state.ytQueue.length > 0 || danceBusy(now);

  /** Lý do không nhận video: trùng video đang phát / trong hàng chờ, hoặc hàng chờ đầy mà lần dán này phải xếp hàng. */
  function refusal(videoId: string, now: number): string | null {
    if (state.yt?.videoId === videoId) return 'Video này đang phát rồi.';
    if (state.ytQueue.some((i) => i.videoId === videoId)) return 'Video này đã có trong hàng chờ rồi.';
    if (mustQueue(now) && state.ytQueue.length >= DJ.youtube.queueMax) {
      return `Hàng chờ đầy (${DJ.youtube.queueMax} video) — xoá bớt hoặc đợi phát hết đã nhé.`;
    }
    return null;
  }

  /**
   * 'youtube' { url }: kiểm link, dán dồn, trùng / đầy rồi mới tra cứu. onAction vẫn đồng bộ: lookup chạy nền, lỗi gì
   * (reject, ném lỗi đồng bộ, lỗi khi áp kết quả) cũng bị bắt — không để rejection thoát ra làm sập server.
   */
  function paste(p: ServerPlayerView, data: unknown, now: number): void {
    const r = ytUrlMsg.safeParse(data);
    const link = r.success ? parseYoutubeUrl(r.data.url) : null;
    if (!link) {
      return ctx.toast(p.pid, 'Link không phải video YouTube — dán link dạng youtube.com/watch?v=… hoặc youtu.be/…', 'bad');
    }
    if (now - lastPasteAt < DJ.youtube.pasteCooldownMs) {
      return ctx.toast(p.pid, 'Từ từ thôi — vài giây nữa hãy dán link tiếp nhé.', 'warn');
    }
    const why = refusal(link.videoId, now);
    if (why) return ctx.toast(p.pid, why, 'warn');
    lastPasteAt = now;
    const seq = ++reqSeq;
    const by = { pid: p.pid, name: p.name };
    void new Promise<YoutubeLookupResult>((resolve) => resolve(deps.lookup(link.videoId)))
      .then(
        (res) => applyLookup(seq, by, link, res),
        () => applyLookup(seq, by, link, UNVERIFIED),
      )
      .catch((err: unknown) => ctx.log('lỗi khi nhận video YouTube', err));
  }

  /** Kết quả tra cứu về: chỉ áp khi module còn sống, đúng lượt mới nhất, vẫn ở Bar, người dán vẫn đứng bàn. */
  function applyLookup(seq: number, by: { pid: Pid; name: string }, link: YoutubeLink, res: YoutubeLookupResult): void {
    if (disposed || seq !== reqSeq || ctx.map() !== 'bar' || state.controllerPid !== by.pid || !present(by.pid)) return;
    if (!res.ok) return ctx.toast(by.pid, YT_LOOKUP_FAIL_TEXT[res.reason], 'bad');
    const now = ctx.now();
    // Trong lúc chờ tra cứu hàng chờ có thể đã đổi (Thi nhảy đẩy video đang phát về đầu hàng…) → kiểm lại.
    const why = refusal(link.videoId, now);
    if (why) return ctx.toast(by.pid, why, 'warn');
    const item: DjYoutubeItem = {
      key: ++nextKey,
      videoId: link.videoId,
      title: sanitizeTitle(res.title, DJ.youtube.titleMax) ?? YT_DEFAULT_TITLE,
      author: sanitizeTitle(res.author, DJ.youtube.authorMax) ?? '',
      startMs: link.startMs,
      byPid: by.pid,
      byName: by.name,
    };
    if (!mustQueue(now)) {
      playYoutube(item, now);
      ctx.chatSystem(`🎬 ${by.name} phát YouTube: ${item.title}`);
      return;
    }
    // Vốn phát ngay (không phát YouTube, hàng chờ trống) nhưng đang có vòng nhảy → phát khi hết vòng.
    const afterDance = state.yt === null && state.ytQueue.length === 0;
    state.ytQueue = [...state.ytQueue, item];
    if (afterDance) resumeAfterDance = true;
    publish();
    if (afterDance) ctx.toast(by.pid, 'Đang có vòng nhảy — video phát khi hết vòng.', 'info');
    ctx.chatSystem(`🎬 ${by.name} thêm vào hàng chờ (#${state.ytQueue.length}): ${item.title}`);
  }

  /** 'yt_meta' (máy nào trong Bar cũng gửi được): thời lượng / livestream của video đang phát — chỉ nhận lần đầu. */
  function onMeta(data: unknown): void {
    const r = ytMetaMsg.safeParse(data);
    const yt = state.yt;
    if (!r.success || !yt || yt.videoId !== r.data.videoId || yt.durationMs > 0 || yt.live) return;
    if (r.data.live) {
      state.yt = { ...yt, live: true };
    } else {
      const d = r.data.durationMs;
      if (d === undefined || d < DJ.youtube.minDurationMs || d > DJ.youtube.maxDurationMs) return;
      state.yt = { ...yt, durationMs: Math.round(d) };
    }
    metaDeadline = Infinity;
    publish();
  }

  /**
   * 'yt_error': lỗi chết của trình phát (YT_FATAL_ERRORS) từ máy người dán hoặc người đứng bàn → cả quán chuyển bài. Máy
   * khác báo thì bỏ qua (máy đó tự hiện lỗi — thường do chặn theo vùng); mã 5 luôn chỉ tại máy.
   */
  function onPlayerError(p: ServerPlayerView, data: unknown): void {
    const r = ytErrorMsg.safeParse(data);
    const yt = state.yt;
    if (!r.success || !yt || yt.videoId !== r.data.videoId || !YT_FATAL_ERRORS.includes(r.data.code)) return;
    if (p.pid !== yt.byPid && p.pid !== state.controllerPid) return;
    ctx.chatSystem(`⚠️ Không phát được "${yt.title}": ${youtubeErrorText(r.data.code)} — chuyển bài.`);
    advance(ctx.now(), false);
  }

  /** 'yt_play' { key }: phát ngay 1 video trong hàng chờ (video YouTube đang phát bị bỏ) — tính như đổi bài. */
  function playQueued(p: ServerPlayerView, data: unknown, now: number): void {
    const r = ytKeyMsg.safeParse(data);
    const item = r.success ? state.ytQueue.find((i) => i.key === r.data.key) : undefined;
    if (!item || now - lastSwitchAt < DJ.switchCooldownMs) return;
    lastSwitchAt = now;
    state.ytQueue = state.ytQueue.filter((i) => i !== item);
    playYoutube(item, now);
    ctx.chatSystem(`🎬 ${p.name} phát ngay: ${item.title}`);
  }

  /** 'yt_remove' { key }: xoá 1 video khỏi hàng chờ (được cả lúc đang có vòng nhảy). */
  function removeQueued(data: unknown): void {
    const r = ytKeyMsg.safeParse(data);
    if (!r.success || !state.ytQueue.some((i) => i.key === r.data.key)) return;
    const key = r.data.key;
    state.ytQueue = state.ytQueue.filter((i) => i.key !== key);
    metaByKey.delete(key);
    publish();
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
    if (type === 'youtube') return paste(p, data, now);
    if (type === 'yt_remove') return removeQueued(data);
    if (type === 'play') {
      if (state.playing || now - lastToggleAt < DJ.toggleCooldownMs) return;
      lastToggleAt = now;
      return resume(now);
    }
    if (type === 'stop' || type === 'next' || type === 'prev' || type === 'track' || type === 'yt_play') {
      if (danceBusy(now)) return ctx.toast(p.pid, 'Đang có vòng nhảy — dừng hay đổi bài sau khi hết vòng nhé.', 'warn');
      if (type === 'stop') {
        if (!state.playing || now - lastToggleAt < DJ.toggleCooldownMs) return;
        lastToggleAt = now;
        // DJ tự chỉnh nhạc ngay sau vòng nhảy → thôi tự phát tiếp video (video vẫn ở đầu hàng chờ).
        resumeAfterDance = false;
        return pause(now);
      }
      if (type === 'yt_play') return playQueued(p, data, now);
      if (type === 'next' && state.ytQueue.length > 0) {
        // ⏭ ưu tiên hàng chờ YouTube.
        if (now - lastSwitchAt < DJ.switchCooldownMs) return;
        lastSwitchAt = now;
        const head = state.ytQueue[0]!;
        advance(now, false);
        ctx.chatSystem(`⏭ ${p.name} chuyển: ${head.title}`);
        return;
      }
      let id: DjAnyTrackId;
      if (type === 'track') {
        const r = trackMsg.safeParse(data);
        if (!r.success || (r.data.id === state.trackId && state.playing && !state.yt)) return;
        id = r.data.id;
      } else if (type === 'prev' && state.yt) {
        // ⏮ lúc đang YouTube: về bài có sẵn vừa phát, từ đầu (hàng chờ giữ nguyên, phát tiếp khi bài đó hết).
        id = state.trackId;
      } else {
        id = nextTrackId(state.trackId, type === 'next' ? 1 : -1);
      }
      if (now - lastSwitchAt < DJ.switchCooldownMs) return;
      lastSwitchAt = now;
      resumeAfterDance = false;
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
      // Thời lượng / lỗi trình phát của video đang phát: máy nào trong Bar cũng báo được (điều kiện xét bên trong).
      if (type === 'yt_meta') return onMeta(data);
      if (type === 'yt_error') return onPlayerError(p, data);
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
      const yt = state.yt;
      if (yt && danceBusy(now)) return yieldToDance(yt, now);
      if (resumeAfterDance && now >= danceQuietAt()) {
        // Hết sảnh / vòng nhảy → phát tiếp video đầu hàng (đúng đoạn đang dở).
        resumeAfterDance = false;
        const head = state.ytQueue[0];
        if (head) {
          advance(now, false);
          ctx.chatSystem(`▶️ Nhảy xong — phát tiếp: ${head.title}`);
          return;
        }
      }
      if (yt) {
        // Đang dừng / livestream: không tự hết. Thời lượng do máy khách báo; quá hạn chưa ai báo → coi như không phát được.
        if (!state.playing || yt.live) return;
        if (yt.durationMs > 0) {
          if (now - state.startedAt >= yt.durationMs + DJ.youtube.endGraceMs) advance(now);
        } else if (now >= metaDeadline) {
          ctx.chatSystem(`⚠️ Không tải được "${yt.title}" (quá lâu chưa máy nào phát được) — chuyển bài.`);
          advance(now, false);
        }
        return;
      }
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
      // YouTube không giữ qua đổi map: xoá video đang phát + hàng chờ, bỏ mọi lượt tra cứu đang chờ.
      state.yt = null;
      state.ytQueue = [];
      reqSeq++;
      lastPasteAt = -Infinity;
      resumeAfterDance = false;
      metaDeadline = Infinity;
      metaByKey.clear();
      if (map === 'bar') return play(first.id, ctx.now() + DJ.enterDelayMs);
      state.playing = false;
      state.pausedAtMs = 0;
      publish();
    },

    dispose() {
      disposed = true;
    },
  };
}

/** Tra cứu oEmbed dùng chung mọi phòng (bộ nhớ đệm chung). */
const defaultLookup = createOembedLookup();

export const djModule: ActivityServerModule = {
  id: 'dj',
  maps: ['bar'],
  create: (ctx) => createDj(ctx, { lookup: defaultLookup }),
};
