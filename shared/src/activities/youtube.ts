// YouTube ở bàn DJ (spec 2026-11-02-dj-youtube-led-design.md): đọc link người đứng bàn dán → id video + giây bắt đầu,
// bảng lỗi trình phát / tra cứu dùng chung server (quyết đổi bài, toast) và client (báo lỗi tại máy). Thuần, không I/O.
import { DJ } from '../config/balance';

/** Id video YouTube: đúng 11 ký tự base64url. */
export const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface YoutubeLink {
  videoId: string;
  /** Vị trí bắt đầu trong video (ms) theo ?t= / &start= / #t= của link; 0 = từ đầu. */
  startMs: number;
}

/** Hai đường dẫn /embed/… dài đúng 11 ký tự nhưng không phải video. */
const NOT_VIDEO_IDS = new Set(['videoseries', 'live_stream']);
/** youtube.com/<seg>/<id>: các dạng link một video (watch xử lý riêng). */
const ID_PATHS = new Set(['shorts', 'embed', 'live', 'v', 'e']);
const MAX_START_MS = 12 * 3600_000;

/** "90" · "90s" · "1m30s" · "1h2m3s" → ms; sai dạng → 0. */
function parseStart(raw: string | null | undefined): number {
  if (!raw) return 0;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw.trim());
  if (!m) return 0;
  const ms = ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
  return Number.isFinite(ms) ? Math.min(MAX_START_MS, Math.max(0, ms)) : 0;
}

const asId = (s: string | null | undefined): string | null => (s && YT_ID_RE.test(s) && !NOT_VIDEO_IDS.has(s) ? s : null);

/**
 * Tách link (không dùng URL — shared chạy cả server lẫn client, lib ES thuần): [scheme://]authority[/path][?query][#hash],
 * không khoảng trắng. Authority bỏ phần "user@" và ":cổng" (youtube.com@evil.com → host evil.com, bị loại).
 */
const LINK_RE = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/?#\s]+)([^?#\s]*)(?:\?([^#\s]*))?(?:#(\S*))?$/i;

/** Tham số query/hash dạng a=1&b=2 → giá trị đầu tiên của `name` (đã giải mã; mã hỏng → giữ nguyên). */
function param(qs: string | undefined, name: string): string | null {
  if (!qs) return null;
  for (const part of qs.split('&')) {
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    if (k !== name) continue;
    const v = eq < 0 ? '' : part.slice(eq + 1).replace(/\+/g, ' ');
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

/**
 * Link YouTube một video → { videoId, startMs }; null = không phải link video (playlist không có v=, kênh, clip, host
 * lạ…). Nhận: youtube.com/watch?v= (www. / m. / music.), youtu.be/ID, /shorts/ID, /embed/ID, /live/ID, /v/ID, /e/ID,
 * youtube-nocookie.com/embed/ID, thiếu https:// vẫn được, và id 11 ký tự trơn.
 */
export function parseYoutubeUrl(raw: unknown): YoutubeLink | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > DJ.youtube.urlMax) return null;
  const bare = asId(text);
  if (bare) return { videoId: bare, startMs: 0 };
  const m = LINK_RE.exec(text);
  if (!m) return null;
  const [, scheme, authority = '', path = '', query, hash] = m;
  if (scheme && !/^https?$/i.test(scheme)) return null;
  const host = authority
    .replace(/^.*@/, '')
    .replace(/:\d*$/, '')
    .toLowerCase()
    .replace(/^(?:www|m|music)\./, '');
  const segs = path.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be') id = asId(segs[0]);
  else if (host === 'youtube.com') {
    if (segs[0] === 'watch' && segs.length === 1) id = asId(param(query, 'v'));
    else if (segs.length >= 2 && ID_PATHS.has(segs[0]!)) id = asId(segs[1]);
  } else if (host === 'youtube-nocookie.com' && segs[0] === 'embed') id = asId(segs[1]);
  if (!id) return null;
  return { videoId: id, startMs: parseStart(param(query, 't') ?? param(query, 'start') ?? param(hash, 't')) };
}

/** Link xem video trên youtube.com (server tra cứu oEmbed, client mở tab "Xem trên YouTube"). */
export const youtubeWatchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;

/**
 * Mã lỗi trình phát YouTube (onError) coi là hỏng với mọi máy: 2 id sai · 100 không tồn tại / riêng tư · 101, 150 chủ
 * video chặn phát nhúng · 153 thiếu Referer. Máy người dán (hoặc người đứng bàn) báo các mã này → cả quán đổi bài; máy
 * khác báo thì chỉ máy đó hiện lỗi (thường là chặn theo vùng). Mã 5 (lỗi trình phát HTML5) luôn chỉ tại máy.
 */
export const YT_FATAL_ERRORS: readonly number[] = [2, 100, 101, 150, 153];

/** Lý do lỗi trình phát YouTube, viết cho người chơi. */
export function youtubeErrorText(code: number): string {
  if (code === 2) return 'link video không hợp lệ';
  if (code === 5) return 'trình phát YouTube gặp lỗi';
  if (code === 100) return 'video không tồn tại hoặc đã để riêng tư';
  if (code === 101 || code === 150) return 'chủ video chặn phát ngoài YouTube';
  if (code === 153) return 'YouTube từ chối trang phát (thiếu Referer)';
  return `lỗi YouTube mã ${code}`;
}

/** Kết quả tra cứu oEmbed bị từ chối (link hợp lệ về dạng nhưng video không phát được). */
export type YoutubeLookupFail = 'bad_id' | 'no_embed' | 'private' | 'not_found';

export const YT_LOOKUP_FAIL_TEXT: Record<YoutubeLookupFail, string> = {
  bad_id: 'Link YouTube không hợp lệ.',
  no_embed: 'Video này chặn phát ngoài YouTube — thử bản lyric / cover khác nhé.',
  private: 'Video đang để riêng tư — không phát được.',
  not_found: 'Không tìm thấy video (đã xoá hoặc sai link).',
};
