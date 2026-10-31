// Đại Pháp Đường (client): đứng ở bồ đoàn bấm E = ngồi xuống nghe kinh (server giữ chỗ). Chỉ ngồi nghe — không có
// mini-game, không có thưởng. Đang ngồi: E / Esc = đứng dậy. Khung hình điện ảnh: mắt hạ thấp, quay về tượng Phật lớn
// trên bệ thờ và ngẩng nhìn mặt tượng, thu hẹp góc nhìn.
// Nhạc kinh thu sẵn (content/sutra) phát canh theo giờ server nên cả phòng nghe cùng một đoạn như đang tụng trực tiếp:
// ngồi bồ đoàn = nghe trọn, đứng trong điện = khe khẽ, ngay trước cửa điện = vọng ra rất nhỏ, xa hơn = tạm dừng.
import { PHAP_DUONG, inZone } from '@shared/index';
import type { SutraOpenData, SutraPublicState } from '@shared/activities/temple';
import type { RecordedOptions } from '../../audio/api';
import { SUTRA_TRACKS, type SutraTrack } from '../../content/sutra';
import type { OverlayHandle } from '../../ui/api';
import { fmtClock, h } from '../../ui/dom';
import type { ActivityClientModule, ClientActivityContext } from '../types';

const DEG = Math.PI / 180;
/** Mắt khi ngồi (khớp EYE.sit của engine) và góc nhìn điện ảnh khi ngồi nghe kinh. */
const SIT_EYE = 0.85;
const SIT_FOV = 58;
/** Độ cao mặt tượng Phật lớn: mặt bệ thờ + tâm đầu tượng (≈ 3,05 đơn vị) × tỉ lệ tượng. */
const FACE_Y = PHAP_DUONG.altar.h + 3.05 * PHAP_DUONG.statueScale;
/** Hàng bồ đoàn sát tượng không ngẩng dốc quá: mép dưới khung hình vẫn thấp hơn mặt bệ thờ chừng này. */
const ALTAR_MARGIN = 6 * DEG;
/** Mức to nhạc kinh (0..1): ngồi bồ đoàn = trọn vẹn, đứng trong điện = khe khẽ, ngay trước cửa điện = vọng ra rất nhỏ. */
const LEVEL = { seated: 1, hall: 0.35, porch: 0.1 } as const;
/** Tầm (m) tính từ ô cửa điện mà tiếng kinh còn vọng tới, nhỏ dần về 0. */
const PORCH_RANGE = 10;
/** Hỏi lại thời lượng một bài sau lần hỏi hỏng (ms). */
const RETRY_MS = 60_000;

// ───────────────────────── Ngồi bồ đoàn ─────────────────────────

interface SitUi {
  overlay: OverlayHandle;
  track: HTMLElement;
  time: HTMLElement;
  /** Lần vẽ lại dòng thời gian kế tiếp (performance.now). */
  nextAt: number;
}
let sit: SitUi | null = null;

/**
 * Hướng nhìn từ bồ đoàn (x, z) lên tượng Phật lớn: quay về trục tượng, ngẩng nhìn mặt tượng. Hàng sát tượng thì ngẩng
 * vừa phải để mép dưới khung hình vẫn thấy mặt bệ thờ — cả tòa tượng nằm trọn trong khung.
 */
function viewFrom(x: number, z: number): { yaw: number; pitch: number } {
  const dx = PHAP_DUONG.x - x;
  const dz = PHAP_DUONG.altar.z - z;
  const dist = Math.hypot(dx, dz);
  const face = Math.atan2(FACE_Y - SIT_EYE, dist);
  const keepAltar = Math.atan2(PHAP_DUONG.altar.h - SIT_EYE, dist) + (SIT_FOV / 2) * DEG - ALTAR_MARGIN;
  return { yaw: Math.atan2(dx, dz), pitch: Math.min(face, keepAltar) };
}

/** Dòng "Đang nghe" + giờ đã nghe / thời lượng bài, đúng chỗ cả phòng đang nghe. */
function renderHud(s: SitUi, ctx: ClientActivityContext): void {
  if (SUTRA_TRACKS.length === 0) return;
  const plan = planAt(ctx.serverNow() / 1000);
  s.track.textContent = `Đang nghe: ${plan.track.title}`;
  s.time.textContent =
    plan.duration > 0 ? `${fmtClock(Math.floor(plan.offset) * 1000)} / ${fmtClock(Math.round(plan.duration) * 1000)}` : '';
}

function cleanup(ctx: ClientActivityContext): void {
  if (!sit) return;
  sit.overlay.close();
  sit = null;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
  ctx.setFov(null);
}

// ───────────────────────── Nhạc kinh canh theo giờ server ─────────────────────────

/** Thời lượng (giây) các bài đã biết — giữ suốt phiên chơi vì URL bài không đổi. Bài hỏng / 0 giây không có ở đây. */
const durations = new Map<string, number>();
/** Bài đang chờ kết quả hỏi thời lượng. */
const asking = new Set<string>();
/** Bài hỏi thời lượng bị hỏng → lúc được hỏi lại (performance.now). Đã hỏng một lần cũng tính là đã có kết quả. */
const retryAt = new Map<string, number>();

interface Playlist {
  /** Các bài đã biết thời lượng, theo thứ tự phát. */
  tracks: SutraTrack[];
  /** Giây bắt đầu của từng bài trong một vòng danh sách. */
  starts: number[];
  /** Thời lượng một vòng danh sách (giây). */
  total: number;
}
/** null = còn bài chưa có kết quả hỏi thời lượng → tạm phát lặp bài đầu. */
let playlist: Playlist | null = null;
/** Bài vừa phát hết (onEnded) trong khi lịch theo giờ server chưa sang bài kế — để sang bài kế ngay, không phát lại. */
let endedUrl: string | null = null;

/** Bài cần phát: `loop` = phát lặp một bài; `offset` / `duration` = giây đang tới / thời lượng bài (0 = chưa biết). */
interface Plan {
  track: SutraTrack;
  loop: boolean;
  offset: number;
  duration: number;
}

/** Lần gọi setRecorded gần nhất: bài, cách phát, mức to (đã làm tròn) và tùy chọn (giữ nguyên khi chỉ đổi mức to). */
interface Sent {
  url: string;
  loop: boolean;
  level: number;
  opts: RecordedOptions;
}
let sent: Sent | null = null;

const isDuration = (d: number): boolean => Number.isFinite(d) && d > 0;

/** Làm tròn mức to về bước 0,05 — đổi nhỏ hơn thế thì không gọi lại audio. */
const quantize = (level: number): number => Math.round(level * 20) / 20;

/** Dựng lại danh sách phát mỗi khi biết thêm thời lượng một bài (hoặc thêm một bài hỏi hỏng). */
function rebuildPlaylist(): void {
  if (!SUTRA_TRACKS.every(({ url }) => durations.has(url) || retryAt.has(url))) {
    playlist = null;
    return;
  }
  const tracks = SUTRA_TRACKS.filter(({ url }) => durations.has(url));
  const starts: number[] = [];
  let total = 0;
  for (const { url } of tracks) {
    starts.push(total);
    total += durations.get(url)!;
  }
  playlist = { tracks, starts, total };
}

function learn(url: string, d: number): void {
  durations.set(url, d);
  rebuildPlaylist();
}

/** Hỏi thời lượng các bài chưa biết (audio chỉ tải phần đầu file); hỏng thì hẹn hỏi lại sau RETRY_MS. */
function askDurations(ctx: ClientActivityContext): void {
  const now = performance.now();
  for (const { url } of SUTRA_TRACKS) {
    if (durations.has(url) || asking.has(url) || (retryAt.get(url) ?? 0) > now) continue;
    asking.add(url);
    const fail = () => {
      retryAt.set(url, performance.now() + RETRY_MS);
      rebuildPlaylist();
    };
    ctx.audio
      .recordedDuration(url)
      .then((d) => (isDuration(d) ? learn(url, d) : fail()), fail)
      .finally(() => asking.delete(url));
  }
}

/** Bài cần phát lúc `sec` (giây, giờ server) — mọi máy trong phòng tính ra cùng một bài, cùng một giây. */
function planAt(sec: number): Plan {
  const pl = playlist;
  if (!pl || pl.tracks.length < 2) {
    // Một bài, hoặc chưa biết đủ thời lượng các bài: phát lặp bài đầu, canh giây theo thời lượng bài.
    const track = pl?.tracks[0] ?? SUTRA_TRACKS[0]!;
    const d = durations.get(track.url) ?? 0;
    return { track, loop: true, offset: d > 0 ? sec % d : 0, duration: d };
  }
  const t = sec % pl.total;
  let i = pl.tracks.length - 1;
  while (i > 0 && pl.starts[i]! > t) i--;
  const track = pl.tracks[i]!;
  if (track.url !== endedUrl) {
    endedUrl = null; // lịch đã sang bài khác: thôi nhớ bài vừa hết
    return { track, loop: false, offset: t - pl.starts[i]!, duration: durations.get(track.url)! };
  }
  // Bài này phát hết sớm hơn lịch chút ít (thời lượng đo lệch): sang luôn bài kế, phát từ đầu.
  const next = pl.tracks[(i + 1) % pl.tracks.length]!;
  return { track: next, loop: false, offset: 0, duration: durations.get(next.url)! };
}

/** Giây bắt đầu của bài `url` (dài `d` giây) lúc `sec`; chưa tới lượt bài này (vừa sang sớm) thì phát từ đầu. */
function offsetIn(url: string, sec: number, d: number): number {
  const pl = playlist;
  const i = pl ? pl.tracks.findIndex((t) => t.url === url) : -1;
  if (!pl || i < 0) return 0;
  const rel = (((sec - pl.starts[i]!) % pl.total) + pl.total) % pl.total;
  return rel < d ? rel : 0;
}

/** Tùy chọn phát cho một kế hoạch: mỗi lần phát / nối lại, audio hỏi giây bắt đầu — tính theo giờ server lúc đó. */
function optsFor(plan: Plan, ctx: ClientActivityContext): RecordedOptions {
  const url = plan.track.url;
  if (plan.loop) {
    return {
      loop: true,
      startAt: (d) => {
        if (!isDuration(d)) return 0;
        // Hỏi thời lượng bị hỏng mà vẫn phát được: lấy luôn thời lượng thật để HUD hiện giờ.
        if (!durations.has(url)) learn(url, d);
        return (ctx.serverNow() / 1000) % d;
      },
    };
  }
  return {
    loop: false,
    startAt: (d) => offsetIn(url, ctx.serverNow() / 1000, d),
    onEnded: () => {
      if (sent?.url === url) endedUrl = url;
    },
  };
}

/** Đưa nhạc kinh về đúng bài + mức to mong muốn; chỉ gọi audio khi đổi bài hoặc mức to đổi qua một bước. */
function syncAudio(ctx: ClientActivityContext, plan: Plan, level: number): void {
  const cur = sent;
  if (level === 0) {
    // Ngoài tầm nghe: bài đang phát nhỏ dần rồi tạm dừng (thôi tải); quay lại thì nối tiếp đúng giờ server.
    if (cur && cur.level !== 0) {
      ctx.audio.setRecorded(cur.url, 0, cur.opts);
      cur.level = 0;
    }
    return;
  }
  const url = plan.track.url;
  if (cur && cur.url === url && cur.loop === plan.loop) {
    if (cur.level !== level) {
      ctx.audio.setRecorded(url, level, cur.opts);
      cur.level = level;
    }
    return;
  }
  // Cùng bài nhưng đổi cách phát (vừa biết đủ thời lượng các bài): tắt hẳn để lần phát mới canh lại đúng giây.
  if (cur && cur.url === url) ctx.audio.setRecorded(null, 0);
  const opts = optsFor(plan, ctx);
  ctx.audio.setRecorded(url, level, opts);
  sent = { url, loop: plan.loop, level, opts };
}

/** Khoảng cách (m) từ chỗ đứng trước mặt Nam của điện tới ô cửa gần nhất; Infinity nếu không đứng phía trước điện. */
function doorDistance(x: number, z: number): number {
  const P = PHAP_DUONG;
  if (z < P.zSouth - P.wall / 2) return Infinity;
  const dz = Math.max(0, z - (P.zSouth + P.wall / 2));
  let best = Infinity;
  for (const [cx, w] of P.doors) best = Math.min(best, Math.hypot(Math.max(0, Math.abs(x - cx) - w / 2), dz));
  return best;
}

/** Mức to mong muốn theo chỗ của mình: ngồi bồ đoàn / trong điện / trước cửa điện (nhỏ dần theo khoảng cách) / xa. */
function targetLevel(ctx: ClientActivityContext): number {
  if (sit) return LEVEL.seated;
  const me = ctx.me();
  const p = me ? ctx.world.playerPosition(me.pid) : undefined;
  if (!p) return 0;
  if (inZone('temple', 'phap_duong', p)) return LEVEL.hall;
  const d = doorDistance(p.x, p.z);
  return d < PORCH_RANGE ? LEVEL.porch * (1 - d / PORCH_RANGE) : 0;
}

export const sutraClient: ActivityClientModule = {
  id: 'sutra',
  maps: ['temple'],

  mount(ctx) {
    if (SUTRA_TRACKS.length > 0) askDurations(ctx);
  },

  prompt(station, ctx) {
    if (station.kind !== 'sutra_cushion') return undefined;
    if (sit) return null;
    const who = ctx.publicState<SutraPublicState>()?.seats?.[station.id];
    if (who && who !== ctx.me()?.pid) return 'Có người đang ngồi nghe kinh';
    return 'Ngồi bồ đoàn nghe kinh';
  },

  onOpen(data, ctx) {
    const d = data as SutraOpenData;
    const station = ctx.world.map.stations.find((s) => s.id === d.stationId);
    if (!station) return;
    cleanup(ctx);
    ctx.snapTo(station.x, station.z);
    const view = viewFrom(station.x, station.z);
    ctx.faceTo(view.yaw, view.pitch);
    ctx.setFov(SIT_FOV);
    ctx.lockMovement(true);
    ctx.setLocalAnim('sit');
    ctx.audio.play('bell_small', { volume: 0.3 });
    const overlay = ctx.ui.openOverlay('sutra');
    const root = h('div', 'act-hud sutra-hud', '', overlay.el);
    h('div', 'act-title', '🪷 Đại Pháp Đường', root);
    const track = h('div', 'act-sub', 'Pháp đường đang tĩnh lặng — chưa có bài kinh nào', root);
    const time = h('div', 'sutra-time', '', root);
    h('div', 'act-hint', 'E / Esc: đứng dậy', root);
    sit = { overlay, track, time, nextAt: 0 };
    renderHud(sit, ctx);
  },

  onKey(e, down, ctx) {
    if (!sit) return false;
    if (down && !e.repeat && e.code === 'KeyE') ctx.send('stand');
    return ['KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code);
  },

  update(_dt, ctx) {
    if (SUTRA_TRACKS.length === 0) return;
    askDurations(ctx);
    syncAudio(ctx, planAt(ctx.serverNow() / 1000), quantize(targetLevel(ctx)));
    const s = sit;
    const now = performance.now();
    if (s && now >= s.nextAt) {
      s.nextAt = now + 500;
      renderHud(s, ctx);
    }
  },

  onClose(_reason, ctx) {
    cleanup(ctx);
  },

  unmount(ctx) {
    cleanup(ctx);
    if (sent) ctx.audio.setRecorded(null, 0);
    sent = null;
    endedUrl = null;
  },
};
