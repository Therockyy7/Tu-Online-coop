// Tra cứu video YouTube cho bàn DJ (spec 2026-11-02 mục 3): oEmbed công khai, không cần khóa API — lấy tên video / kênh
// và loại sớm video không phát được (400 id sai · 401 chặn nhúng · 403 riêng tư · 404 không có). Lỗi mạng / quá giờ /
// 429 / 5xx / JSON hỏng → vẫn nhận link (tên chung). URL dựng lại từ id (không dùng link người dán → không SSRF). Chỉ đệm
// kết quả nhận được (200) theo id (dùng chung mọi phòng), tối đa CACHE_MAX id — id mới đẩy id cũ nhất ra. Từ chối không
// đệm: chủ video đổi sang công khai / cho nhúng thì dán lại là nhận ngay (mỗi lần dán đã cách nhau ≥ 3 s, tra lại rẻ).
import { DJ } from '@shared/index';
import { youtubeWatchUrl, type YoutubeLookupFail } from '@shared/activities/youtube';

export type YoutubeLookupResult =
  | { ok: true; title: string; author: string; verified: boolean }
  | { ok: false; reason: YoutubeLookupFail };
/** Tra cứu 1 id (đã kiểm YT_ID_RE). Không bao giờ reject — lỗi gì cũng ra kết quả. */
export type YoutubeLookup = (videoId: string) => Promise<YoutubeLookupResult>;

/** Phần fetch cần dùng (tiêm được trong test). */
export type OembedFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const FAIL_BY_STATUS: Partial<Record<number, YoutubeLookupFail>> = {
  400: 'bad_id',
  401: 'no_embed',
  403: 'private',
  404: 'not_found',
};
const CACHE_MAX = 200;
/** Không tra được (mạng / quá giờ / 429 / 5xx / JSON hỏng): vẫn nhận link, tên chung — không đệm, lần sau tra lại. */
const UNVERIFIED: YoutubeLookupResult = { ok: true, title: '', author: '', verified: false };

export function createOembedLookup(
  fetchFn: OembedFetch = (url, init) => fetch(url, init),
  timeoutMs: number = DJ.youtube.lookupTimeoutMs,
): YoutubeLookup {
  const cache = new Map<string, YoutubeLookupResult>();
  const remember = (id: string, r: YoutubeLookupResult): YoutubeLookupResult => {
    if (!cache.has(id) && cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(id, r);
    return r;
  };
  return async (videoId) => {
    const hit = cache.get(videoId);
    if (hit) return hit;
    try {
      const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubeWatchUrl(videoId))}`;
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      const fail = FAIL_BY_STATUS[res.status];
      if (fail) return { ok: false, reason: fail };
      if (!res.ok) return UNVERIFIED;
      const j = (await res.json()) as { title?: unknown; author_name?: unknown } | null;
      return remember(videoId, {
        ok: true,
        title: typeof j?.title === 'string' ? j.title : '',
        author: typeof j?.author_name === 'string' ? j.author_name : '',
        verified: true,
      });
    } catch {
      return UNVERIFIED;
    }
  };
}
