// Màn hình LED sân khấu — phần trình phát YouTube của bàn DJ (spec 2026-11-02-dj-youtube-led-design.md mục 2 + 4):
// MỘT YT.Player cho cả lúc ở Bar, đặt trong lớp CSS3D dưới canvas WebGL đúng neo 'video_screen' (mặt màn hình "đục lỗ"
// cho video hiện qua; người / vật đứng trước vẫn che). Phát / tua / dừng theo giờ server, sửa lệch bằng seekTo mỗi giây
// (setInterval riêng — vẫn chạy khi tab ẩn), báo thời lượng / livestream (yt_meta), báo lỗi trình phát (yt_error), bị
// chặn tự phát tiếng thì phát tắt tiếng + nút bật tiếng, âm lượng tự tính theo thanh âm lượng + chỗ đứng (iframe không
// đi qua Web Audio). Khung YouTube luôn nằm dưới canvas → không bao giờ nhận chuột / bàn phím.
import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { BAR_SCREEN, DJ, inZone } from '@shared/index';
import type { DjPublicState, DjYoutubeNow } from '@shared/activities/dj';
import { youtubeErrorText } from '@shared/activities/youtube';
import { settings } from '../../../settings';
import { button } from '../../../ui/dom';
import type { ClientActivityContext } from '../../types';
import {
  detectLive,
  expectedSec,
  playAt,
  seekTarget,
  shouldSeek,
  stalledBetween,
  ytPixelSize,
  ytVolumePercent,
} from './sync';
import { YT_STATE, loadYoutubeApi, type YTNamespace, type YTPlayer } from './ytApi';

/** Phần DjMusic cần từ trình phát YouTube (test tiêm bản giả). */
export interface YoutubeScreenLike {
  /** Trạng thái server có `yt` mà khóa nguồn / startedAt / playing vừa đổi: phát / tua / dừng cho khớp. */
  apply(s: DjPublicState): void;
  /** Mỗi khung khi đang phát YouTube: vẽ lớp CSS3D lúc màn hình trong tầm nhìn, âm lượng theo chỗ đứng. */
  update(): void;
  /** Rời YouTube (về nhạc có sẵn): dừng video, màn hình về hình nền — giữ trình phát để dùng lại. */
  stop(): void;
  /** Rời Bar: hủy trình phát, gỡ khung YouTube. */
  dispose(): void;
}

export type CreateYoutubeScreen = (
  ctx: ClientActivityContext,
  getState: () => DjPublicState | null,
) => YoutubeScreenLike;

type ScreenMode = 'idle' | 'loading' | 'video';

/** Kiểm đồng bộ / thời lượng / chặn tiếng mỗi ngần này (ms). */
const CHECK_MS = 1000;
/** Đọc lại thời lượng sau lần đọc đầu ngần này (ms) — còn tăng là livestream. */
const META_SAMPLE_MS = 4000;
/** Ra lệnh phát mà ngần này (ms) sau vẫn chưa từng chạy / đệm → coi như bị chặn tự phát tiếng. */
const BLOCK_WATCHDOG_MS = 4000;
/** Thử bật tiếng (sau cú bấm) rồi kiểm lại sau ngần này (ms). */
const UNBLOCK_VERIFY_MS = 1000;
/** Kiểm âm lượng (thanh âm lượng, vào / ra Sòng Công Đức) cách nhau ngần này (ms). */
const VOLUME_CHECK_MS = 250;
/** Server đang phát mà trình phát bị dừng (trình duyệt / YouTube tự dừng): thử phát tiếp cách nhau ≥ ngần này (ms). */
const RESUME_GAP_MS = 5000;
/** Tạo trình phát rồi mà quá ngần này (ms) chưa sẵn sàng (khung YouTube bị chặn) → báo người chơi. */
const READY_TIMEOUT_MS = 15_000;
const PLAYER_FAIL_TEXT = 'Không tải được trình phát YouTube (trình chặn quảng cáo?)';
/** Khung video lớn hơn lỗ 1% — mép nằm dưới khung viền, không lộ khe. */
const OVERSCAN = 1.01;
const PLAYER_VARS = { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 };
const BLOCKED_TEXT = '🔇 Nhạc YouTube đang tắt tiếng — bấm để bật';

export class DjYoutubeScreen implements YoutubeScreenLike {
  private player: YTPlayer | null = null;
  /** onReady đã tới — method của trình phát dùng được (trước đó gọi sẽ ném lỗi). */
  private ready = false;
  private disposed = false;
  /** Khung YouTube ở lớp CSS3D (dựng lười ở lần đầu có video); `slot` = chỗ YT.Player thay bằng iframe. */
  private obj: CSS3DObject | null = null;
  private wrap: HTMLDivElement | null = null;
  private slot: HTMLDivElement | null = null;
  private px = ytPixelSize('high');
  /** Tải API hỏng lúc đang chiếu video key này (−1 = lúc chưa có video) — video khác thì thử tải lại. */
  private apiFailedKey: number | null = null;
  /** Giờ tạo trình phát (performance.now) + đã báo "chưa sẵn sàng" chưa. */
  private createdAt = 0;
  private readyWarned = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Hẹn giờ phát (video chưa tới giờ bắt đầu theo giờ server). */
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  /** Trạng thái server nhận qua apply (null = không phát YouTube). */
  private want: DjPublicState | null = null;
  /** Đã áp vào trình phát: `key|startedAt|playing`. */
  private appliedSig = '';
  /** Key video đang nạp trong trình phát / đã từng chạy (PLAYING) / trình phát báo lỗi. */
  private loadedKey: number | null = null;
  private playedKey: number | null = null;
  private errorKey: number | null = null;
  /** Key đã bỏ qua 1 lỗi nghi là của video trước (lỗi lần sau cho key này là lỗi thật). */
  private staleErrorKey: number | null = null;
  private playerState: number = YT_STATE.UNSTARTED;
  /** Sửa lệch: giây đang phát ở lần kiểm trước (NaN = chưa có) + lần tua gần nhất (performance.now). */
  private lastTime = Number.NaN;
  private lastSeekAt = Number.NEGATIVE_INFINITY;
  /** Báo thời lượng: lần đọc đầu (giây) + giờ đọc; đã xong cho video này; máy này tự đo ra livestream. */
  private metaD1 = 0;
  private metaAt = 0;
  private metaDone = false;
  private liveLocal = false;
  /** Canh chặn tự phát: giờ ra lệnh phát (null = không canh) + đã thấy chạy / đệm từ lúc đó chưa. */
  private playCmdAt: number | null = null;
  private sawRun = false;
  /** Bị chặn phát có tiếng: đang phát tắt tiếng chờ cú bấm; giờ vừa thử bật tiếng (null = chưa thử). */
  private blocked = false;
  private unblockAt: number | null = null;
  private chip: HTMLButtonElement | null = null;
  private readonly onGesture = (): void => this.unblock();
  /** Âm lượng đã tính (−1 = chưa) + lần kiểm gần nhất. */
  private vol = -1;
  private volCheckAt = 0;
  /** Chế độ màn hình đã báo cho map (null = chưa báo lần nào). */
  private mode: ScreenMode | null = null;
  private modeTitle: string | null = null;
  /** Tầm nhìn camera ∩ hình cầu bao màn hình — cấp phát 1 lần. */
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere(
    new THREE.Vector3(BAR_SCREEN.x, BAR_SCREEN.y, BAR_SCREEN.z),
    Math.hypot(BAR_SCREEN.w, BAR_SCREEN.h) / 2,
  );

  constructor(
    private readonly ctx: ClientActivityContext,
    /** Trạng thái server mới nhất (thời lượng / livestream đổi mà không qua apply). */
    private readonly getState: () => DjPublicState | null,
  ) {}

  apply(s: DjPublicState): void {
    if (this.disposed) return;
    const yt = s.yt;
    if (!yt) {
      this.stop();
      return;
    }
    this.want = s;
    if (!this.wrap) this.init();
    else if (this.apiFailedKey !== null && this.apiFailedKey !== yt.key) this.loadApi();
    this.reconcile();
    this.refreshMode();
  }

  update(): void {
    if (this.disposed || !this.wrap) return;
    const now = performance.now();
    if (now - this.volCheckAt >= VOLUME_CHECK_MS) {
      this.volCheckAt = now;
      this.applyVolume(false);
    }
    this.ctx.world.css3d.setLive(this.mode === 'video' && this.inView());
  }

  stop(): void {
    if (this.disposed || (!this.want && this.loadedKey === null)) return;
    this.want = null;
    this.appliedSig = '';
    this.loadedKey = null;
    this.playedKey = null;
    this.errorKey = null;
    this.playCmdAt = null;
    this.clearStartTimer();
    this.clearBlocked();
    if (this.player && this.ready) this.player.stopVideo();
    if (this.wrap) this.ctx.world.css3d.setLive(false);
    this.refreshMode();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clearStartTimer();
    this.hideChip();
    const p = this.player;
    this.player = null;
    this.ready = false;
    if (p && typeof p.destroy === 'function') p.destroy();
    if (this.obj) {
      // Gỡ khỏi cảnh CSS3D → CSS3DObject tự xoá phần tử (cả iframe) khỏi DOM.
      this.ctx.world.css3d.scene.remove(this.obj);
      this.ctx.world.css3d.setLive(false);
    }
    this.obj = null;
    this.wrap = null;
    this.slot = null;
    // Trả màn hình về hình nền (vào lại Bar khi kết nối lại: map giữ nguyên, khỏi kẹt "lỗ" không có video).
    if (this.mode && this.mode !== 'idle') this.ctx.world.controls.setVideoScreen?.('idle', null);
    this.mode = null;
  }

  /** Lần đầu có video: dựng khung YouTube ở lớp CSS3D đúng neo màn hình, tải API rồi tạo trình phát. */
  private init(): void {
    const px = (this.px = ytPixelSize(settings.get().quality));
    const wrap = document.createElement('div');
    wrap.className = 'dj-yt-frame';
    wrap.style.width = `${px.w}px`;
    wrap.style.height = `${px.h}px`;
    // YT.Player thay `slot` bằng iframe; `wrap` (phần tử của CSS3DObject) đứng yên — dời / gỡ nó thì iframe tải lại.
    const slot = document.createElement('div');
    wrap.append(slot);
    const obj = new CSS3DObject(wrap);
    // Đặt SAU hàm dựng (nó bật pointer-events): khung không nhận chuột; ẩn bằng visibility (display:none / gỡ khỏi DOM
    // làm iframe tải lại).
    wrap.style.pointerEvents = 'none';
    wrap.style.visibility = 'hidden';
    const anchor = this.ctx.world.anchor('video_screen');
    if (anchor) {
      anchor.updateWorldMatrix(true, false);
      anchor.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
    } else {
      obj.position.set(BAR_SCREEN.x, BAR_SCREEN.y, BAR_SCREEN.z);
      obj.rotation.y = BAR_SCREEN.ry;
    }
    // 1 px CSS = BAR_SCREEN.w / bề rộng px mét.
    obj.scale.multiplyScalar((BAR_SCREEN.w / px.w) * OVERSCAN);
    this.sphere.center.copy(obj.position);
    const css = this.ctx.world.css3d;
    css.scene.add(obj);
    // Đưa khung vào DOM ngay — YT.Player cần phần tử đã nằm trong trang.
    css.flush();
    this.obj = obj;
    this.wrap = wrap;
    this.slot = slot;
    this.timer = setInterval(() => this.check(), CHECK_MS);
    this.loadApi();
  }

  private loadApi(): void {
    this.apiFailedKey = null;
    loadYoutubeApi().then(
      (api) => this.create(api),
      () => this.apiFailed(),
    );
  }

  private create(api: YTNamespace): void {
    if (this.disposed || this.player || !this.slot) return;
    try {
      this.player = new api.Player(this.slot, {
        width: this.px.w,
        height: this.px.h,
        playerVars: PLAYER_VARS,
        events: {
          onReady: () => this.onReady(),
          onStateChange: (e) => this.onStateChange(e.data),
          onError: (e) => this.onError(e.data),
          onAutoplayBlocked: () => this.onBlocked(),
        },
      });
      this.createdAt = performance.now();
    } catch {
      this.player = null;
      this.apiFailed();
    }
  }

  private apiFailed(): void {
    if (this.disposed) return;
    this.apiFailedKey = this.want?.yt?.key ?? -1;
    this.ctx.ui.toast(PLAYER_FAIL_TEXT, 'warn');
    this.refreshMode();
  }

  /** Tạo trình phát rồi mà mãi chưa bắt tay xong với iframe (khung YouTube bị chặn) → báo 1 lần, khi đang cần video. */
  private checkReady(): void {
    if (this.readyWarned || !this.want?.yt || performance.now() - this.createdAt < READY_TIMEOUT_MS) return;
    this.readyWarned = true;
    this.ctx.ui.toast(PLAYER_FAIL_TEXT, 'warn');
  }

  private onReady(): void {
    if (this.disposed) return;
    this.ready = true;
    this.applyVolume(true);
    this.reconcile();
    this.refreshMode();
  }

  private onStateChange(state: number): void {
    if (this.disposed) return;
    this.playerState = state;
    if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) this.sawRun = true;
    if (state === YT_STATE.PLAYING && this.loadedKey !== null) {
      // Video vừa vào bài: đặt lại âm lượng (trình phát có thể nạp mức nhớ từ trước).
      if (this.playedKey !== this.loadedKey) this.applyVolume(true);
      this.playedKey = this.loadedKey;
      this.playCmdAt = null;
    }
    this.refreshMode();
  }

  /** Lỗi trình phát: báo server (lỗi chết từ máy người dán / người đứng bàn thì cả quán đổi bài) + báo tại máy. */
  private onError(code: number): void {
    const yt = this.want?.yt;
    if (this.disposed || !yt || yt.key !== this.loadedKey || this.errorKey === yt.key) return;
    // Lỗi đến muộn của video trước: iframe phát lỗi trước khi xử lý lệnh nạp video mới, máy đã sang video mới — lúc đó
    // URL trình phát còn trống (widget xoá khi ra lệnh nạp / cue) hoặc còn id cũ (tin trễ) → bỏ qua, nạp lại video đang
    // cần 1 lần; lỗi thật của video này sẽ tới lại (sau khi iframe báo đúng id) và được tính.
    const held = this.playerVideoId();
    if (held !== null && held !== yt.videoId && this.staleErrorKey !== yt.key) {
      this.staleErrorKey = yt.key;
      this.appliedSig = '';
      this.reconcile();
      return;
    }
    this.errorKey = yt.key;
    this.playCmdAt = null;
    this.clearStartTimer();
    // Video không phát được thì nút "bật tiếng" vô nghĩa — gỡ (video sau bị chặn thì hiện lại).
    this.clearBlocked();
    this.ctx.send('yt_error', { videoId: yt.videoId, code });
    this.ctx.ui.toast(`Video không phát được trên máy bạn: ${youtubeErrorText(code)}`, 'warn');
    this.refreshMode();
  }

  /** Đưa trình phát về đúng trạng thái server — chỉ khi key / startedAt / playing đổi (hoặc vừa sẵn sàng). */
  private reconcile(): void {
    const s = this.want;
    const yt = s?.yt;
    const p = this.player;
    if (!s || !yt || !p || !this.ready) return;
    const sig = `${yt.key}|${s.startedAt}|${s.playing}`;
    if (sig === this.appliedSig) return;
    this.appliedSig = sig;
    this.clearStartTimer();
    this.playCmdAt = null;
    if (yt.key !== this.loadedKey) this.resetVideo(yt.key);
    // Video lỗi trên máy này: thôi ra lệnh (chờ server đổi bài / video mới).
    if (this.errorKey === yt.key) return;
    // Chưa chạy lần nào thì nạp lại bằng cue (seekTo lúc đang CUED sẽ tự phát).
    const fresh = this.playedKey !== yt.key;
    if (!s.playing) {
      const at = Math.max(0, s.pausedAtMs / 1000);
      if (fresh) p.cueVideoById({ videoId: yt.videoId, startSeconds: at });
      else {
        p.pauseVideo();
        if (!this.isLive(yt)) p.seekTo(at, true);
      }
      return;
    }
    const begin = playAt(yt, s.startedAt);
    const now = this.ctx.serverNow();
    if (now < begin) {
      // Chưa tới giờ: nạp sẵn ở giây bắt đầu, đúng giờ server thì phát.
      if (fresh) p.cueVideoById({ videoId: yt.videoId, startSeconds: yt.startMs / 1000 });
      else p.pauseVideo();
      this.startTimer = setTimeout(() => {
        this.startTimer = null;
        this.playNow();
      }, begin - now);
      return;
    }
    this.playNow();
  }

  /** Phát ngay từ chỗ giờ server đang tới: chưa chạy lần nào → nạp + phát; đã chạy → tua rồi phát tiếp. */
  private playNow(): void {
    const s = this.want;
    const yt = s?.yt;
    const p = this.player;
    if (!s?.playing || !yt || !p || !this.ready || this.errorKey === yt.key) return;
    const live = this.isLive(yt);
    const at = Math.max(0, expectedSec(s.startedAt, true, 0, this.ctx.serverNow()));
    // Livestream (kể cả phát tiếp sau khi dừng) vào từ chỗ trực tiếp: nạp lại không kèm giây là về sát trực tiếp.
    if (live) p.loadVideoById({ videoId: yt.videoId });
    else if (this.playedKey !== yt.key) p.loadVideoById({ videoId: yt.videoId, startSeconds: at });
    else {
      p.seekTo(at, true);
      p.playVideo();
    }
    const now = performance.now();
    // Vừa nạp / tua: chờ đủ khoảng nghỉ mới sửa lệch; canh chặn tự phát từ lúc này.
    this.lastSeekAt = now;
    this.lastTime = Number.NaN;
    this.playCmdAt = now;
    this.sawRun = false;
  }

  /** Video mới (key khác): quên mọi số đo của video trước. */
  private resetVideo(key: number): void {
    this.loadedKey = key;
    this.playedKey = null;
    this.errorKey = null;
    this.playerState = YT_STATE.UNSTARTED;
    this.lastTime = Number.NaN;
    this.lastSeekAt = Number.NEGATIVE_INFINITY;
    this.metaD1 = 0;
    this.metaAt = 0;
    this.metaDone = false;
    this.liveLocal = false;
  }

  /**
   * Mỗi giây: trình phát mãi chưa sẵn sàng, canh chặn tự phát, kiểm lần thử bật tiếng, giữ dừng / phát đúng lệnh
   * server, báo thời lượng, sửa lệch theo giờ server.
   */
  private check(): void {
    const p = this.player;
    const s = this.want;
    const yt = s?.yt;
    if (p && !this.ready && !this.disposed) this.checkReady();
    if (this.disposed || !p || !this.ready || !s || !yt || yt.key !== this.loadedKey || this.errorKey === yt.key) {
      this.lastTime = Number.NaN;
      return;
    }
    const now = performance.now();
    if (this.playCmdAt !== null && !this.sawRun && now - this.playCmdAt >= BLOCK_WATCHDOG_MS) {
      this.playCmdAt = null;
      this.onBlocked();
    }
    if (this.blocked && this.unblockAt !== null && now - this.unblockAt >= UNBLOCK_VERIFY_MS) this.verifyUnblock();
    if (!s.playing) {
      // Server đang dừng mà trình phát vẫn chạy (lệnh dừng đến trước tin trạng thái cũ) → dừng lại.
      if (this.playerState === YT_STATE.PLAYING) p.pauseVideo();
      this.lastTime = Number.NaN;
      return;
    }
    if (this.playerState !== YT_STATE.PLAYING) {
      this.lastTime = Number.NaN;
      // Đã chạy rồi mà bị dừng ngoài lệnh (server vẫn đang phát, không chờ hẹn giờ) → phát tiếp đúng chỗ.
      if (
        this.playerState === YT_STATE.PAUSED &&
        this.playedKey === yt.key &&
        !this.startTimer &&
        now - this.lastSeekAt >= RESUME_GAP_MS &&
        this.ctx.serverNow() >= playAt(yt, s.startedAt)
      ) {
        this.playNow();
      }
      return;
    }
    // Getter trả undefined ngay sau load / cue → NaN (không tua, coi như đứng).
    const cur = Number(p.getCurrentTime());
    const stalled = stalledBetween(this.lastTime, cur);
    this.lastTime = cur;
    const latest = this.getState()?.yt;
    const known = latest && latest.key === yt.key ? latest : yt;
    if (!this.metaDone) this.sampleMeta(p, known, now);
    if (known.durationMs <= 0 || this.isLive(known)) return;
    const expected = expectedSec(s.startedAt, true, 0, this.ctx.serverNow());
    const duration = known.durationMs / 1000;
    if (shouldSeek({ current: cur, expected, duration, now, lastSeekAt: this.lastSeekAt, stalled })) {
      p.seekTo(seekTarget(cur, expected), true);
      this.lastSeekAt = now;
      this.lastTime = Number.NaN;
    }
  }

  /**
   * Báo thời lượng (server không tự biết — oEmbed không có): lần đầu đọc được số thì ghi lại, ≥ 4 s sau (vẫn đang
   * phát) đọc lại — tăng thêm là livestream. Mỗi video 1 lần, chỉ khi server còn chưa biết.
   */
  private sampleMeta(p: YTPlayer, known: DjYoutubeNow, now: number): void {
    if (known.durationMs > 0 || known.live) {
      this.metaDone = true;
      return;
    }
    const d = Number(p.getDuration());
    if (!(d > 0)) return;
    if (this.metaD1 <= 0) {
      this.metaD1 = d;
      this.metaAt = now;
      return;
    }
    if (now - this.metaAt < META_SAMPLE_MS) return;
    this.metaDone = true;
    this.liveLocal = detectLive(this.metaD1, d);
    this.ctx.send('yt_meta', { videoId: known.videoId, durationMs: Math.round(d * 1000), live: this.liveLocal });
  }

  private isLive(yt: DjYoutubeNow): boolean {
    return yt.live || (this.liveLocal && yt.key === this.loadedKey);
  }

  /**
   * Id video trình phát đang giữ theo URL iframe báo về: '' = iframe chưa xác nhận lệnh nạp vừa gửi (URL null ngay sau
   * load / cue, vài chục ms sau mới có); null = không hỏi được (coi như không biết).
   */
  private playerVideoId(): string | null {
    const p = this.player;
    if (!p || typeof p.getVideoUrl !== 'function') return null;
    return /[?&]v=([\w-]{11})/.exec(String(p.getVideoUrl() ?? ''))?.[1] ?? '';
  }

  /** Trình duyệt chặn phát có tiếng: phát tắt tiếng cho kịp đồng bộ + nút bật tiếng; cú bấm / phím kế tiếp thử bật. */
  private onBlocked(): void {
    const p = this.player;
    const s = this.want;
    if (this.disposed || !p || !this.ready || !s?.yt || !s.playing || this.errorKey === s.yt.key) return;
    if (!this.blocked) {
      this.blocked = true;
      this.chip = button(BLOCKED_TEXT, 'dj-yt-chip', () => this.unblock(), this.ctx.ui.root);
      addEventListener('pointerdown', this.onGesture, true);
      addEventListener('keydown', this.onGesture, true);
    }
    this.unblockAt = null;
    p.mute();
    // Đang chờ giờ bắt đầu: hẹn giờ sẽ phát (tắt tiếng) — phát lúc này là sớm hơn giờ server.
    if (!this.startTimer) p.playVideo();
  }

  /** Trong cú bấm / phím của người chơi (trình duyệt cho phép phát có tiếng sau cử chỉ): bật tiếng + phát. */
  private unblock(): void {
    const p = this.player;
    // Đang chờ kiểm lần thử trước (giữ phím đi lại bắn keydown liên tục) — khỏi gửi lệnh dồn; video đang dừng / chưa tới
    // giờ bắt đầu thì chờ phát rồi mới thử (bật tiếng lúc dừng không kiểm được; phát lúc chờ là sớm hơn giờ server).
    if (!this.blocked || !p || !this.ready || this.unblockAt !== null || !this.want?.yt || !this.want.playing) return;
    if (this.startTimer) return;
    if (this.vol > 0) {
      p.unMute();
      p.setVolume(this.vol);
    }
    p.playVideo();
    this.unblockAt = performance.now();
  }

  /** Kiểm sau khi thử bật tiếng: đang phát có tiếng → xong; vẫn bị chặn → phát tắt tiếng tiếp, chờ cú bấm sau. */
  private verifyUnblock(): void {
    const p = this.player;
    this.unblockAt = null;
    if (!p) return;
    if (this.playerState === YT_STATE.PLAYING && (this.vol <= 0 || !p.isMuted())) {
      this.clearBlocked();
      return;
    }
    p.mute();
    if (this.want?.yt && this.want.playing && !this.startTimer) p.playVideo();
  }

  private clearBlocked(): void {
    if (!this.blocked) return;
    this.blocked = false;
    this.unblockAt = null;
    this.hideChip();
    // Lúc bị chặn trình phát bị tắt tiếng — trả về đúng mức (video sau không lặng im).
    this.applyVolume(true);
  }

  private hideChip(): void {
    this.chip?.remove();
    this.chip = null;
    removeEventListener('pointerdown', this.onGesture, true);
    removeEventListener('keydown', this.onGesture, true);
  }

  /** Âm lượng iframe như nhạc thu sẵn qua engine; đang bị chặn tiếng thì chỉ nhớ số (giữ tắt tiếng chờ cú bấm). */
  private applyVolume(force: boolean): void {
    const me = this.ctx.me();
    // Cùng luật inCasino (music.ts): trong Sòng Công Đức nhạc DJ nhỏ lại.
    const level = me && inZone('bar', 'casino', me) ? DJ.casinoLevel : 1;
    const v = ytVolumePercent(level, this.ctx.audio.getVolume('music'), this.ctx.audio.getVolume('master'));
    if (v === this.vol && !force) return;
    this.vol = v;
    const p = this.player;
    if (!p || !this.ready || this.blocked) return;
    if (v === 0) p.mute();
    else {
      p.unMute();
      p.setVolume(v);
    }
  }

  /** Chế độ màn hình theo trình phát: chưa chạy → "Đang tải"; chạy / đệm / dừng → lỗ video; không YouTube → nền. */
  private refreshMode(): void {
    const yt = this.want?.yt;
    let mode: ScreenMode = 'idle';
    if (yt) {
      const st = this.playerState;
      if (this.errorKey === yt.key || this.playedKey !== yt.key) mode = 'loading';
      else if (st === YT_STATE.PLAYING || st === YT_STATE.BUFFERING || st === YT_STATE.PAUSED) mode = 'video';
      // Hết video (chờ server sang bài) → hình nền; nạp lại (livestream về sát trực tiếp) → "Đang tải".
      else mode = st === YT_STATE.ENDED ? 'idle' : 'loading';
    }
    this.setMode(mode, mode === 'loading' && yt ? yt.title : null);
  }

  /** Báo map chỉ khi chế độ / tên đổi (map vẽ lại canvas hình nền); khung YouTube chỉ hiện ở chế độ 'video'. */
  private setMode(mode: ScreenMode, title: string | null): void {
    if (mode === this.mode && title === this.modeTitle) return;
    this.mode = mode;
    this.modeTitle = title;
    if (this.wrap) this.wrap.style.visibility = mode === 'video' ? 'visible' : 'hidden';
    this.ctx.world.controls.setVideoScreen?.(mode, title);
  }

  /** Màn hình nằm trong tầm nhìn camera (hình cầu bao ∩ frustum) — ngoài tầm thì thôi vẽ lớp CSS3D. */
  private inView(): boolean {
    const cam = this.ctx.world.camera;
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProj);
    return this.frustum.intersectsSphere(this.sphere);
  }

  private clearStartTimer(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
  }
}
