// Tải YouTube IFrame Player API (https://www.youtube.com/iframe_api) một lần cho cả game + kiểu tối thiểu của YT.Player
// (không thêm gói @types/youtube). Không tự viết iframe: YT.Player tự gắn allow="autoplay", origin, Referer. Trình chặn
// quảng cáo chặn script / mạng quá chậm → reject và quên lần tải đó (lần sau gọi lại thì thử tải lại).

const API_URL = 'https://www.youtube.com/iframe_api';
/** Chờ API sẵn sàng tối đa (ms). */
const LOAD_TIMEOUT_MS = 15_000;

/** Trạng thái trình phát (onStateChange / getPlayerState). */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export interface YTVideoRequest {
  videoId: string;
  /** Giây bắt đầu (YouTube làm tròn về khung khóa gần nhất, thường sớm ≤ ~2 s). */
  startSeconds?: number;
}

/** Các method dùng tới. Chỉ có sau onReady (bắt tay xong với iframe) — gọi sớm hơn sẽ ném lỗi. */
export interface YTPlayer {
  loadVideoById(o: YTVideoRequest): void;
  cueVideoById(o: YTVideoRequest): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  /**
   * URL trang xem của video trình phát đang giữ — iframe báo về bất đồng bộ: ngay sau load / cue là null, rồi có thể còn
   * 1 tin trễ mang id cũ, sau đó mới tới id mới (đo trên Chromium 2026-11-02).
   */
  getVideoUrl(): string | null;
  /** 0..100 (số nguyên). */
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  destroy(): void;
}

export interface YTPlayerOptions {
  width: number;
  height: number;
  playerVars: Record<string, number>;
  events: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
    /** Mã lỗi: 2 · 5 · 100 · 101 · 150 · 153 (xem youtubeErrorText). */
    onError?: (e: { data: number }) => void;
    /** Trình duyệt chặn tự phát có tiếng. */
    onAutoplayBlocked?: () => void;
  };
}

export interface YTNamespace {
  /** Thay phần tử `el` (đang nằm trong trang) bằng iframe trình phát. */
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
}

type YTWindow = Window & { YT?: Partial<YTNamespace>; onYouTubeIframeAPIReady?: () => void };

/** Lần tải đang chạy / đã xong (dùng chung); hỏng thì xoá để lần sau tải lại. */
let loading: Promise<YTNamespace> | null = null;

/** YouTube IFrame Player API — có sẵn thì xong ngay, không thì chèn script 1 lần và chờ onYouTubeIframeAPIReady. */
export function loadYoutubeApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT as YTNamespace);
  if (loading) return loading;
  const p = new Promise<YTNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => fail('quá giờ'), LOAD_TIMEOUT_MS);
    function fail(why: string): void {
      clearTimeout(timer);
      if (loading === p) loading = null;
      reject(new Error(`Không tải được YouTube IFrame API (${why})`));
    }
    // Nối hàm sẵn sàng cũ (nếu trang có) — API chỉ gọi đúng một hàm toàn cục này.
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      if (w.YT?.Player) resolve(w.YT as YTNamespace);
      else fail('thiếu YT.Player');
    };
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      // Script bị chặn: gỡ thẻ hỏng để lần thử sau chèn thẻ mới.
      script.remove();
      fail('bị chặn');
    };
    document.head.append(script);
  });
  loading = p;
  return p;
}
