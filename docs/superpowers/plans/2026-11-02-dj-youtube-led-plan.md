# Bàn DJ YouTube + màn hình LED — Plan triển khai

> **Cho agent thực thi:** chạy bằng Workflow 3 làn song song (S · R · C), mỗi làn 1 agent, file rời nhau. Mỗi làn làm
> theo TDD ở phần thuần (viết test trước, chạy đỏ, viết code, chạy xanh). **Không commit** (user tự commit). Bước dùng
> ô `- [ ]` để đánh dấu.

**Goal:** Người đứng bàn DJ dán link YouTube → cả quán xem video đồng bộ trên màn hình LED 3D mới ở sân khấu, có hàng
chờ; 8 bài có sẵn giữ nguyên.

**Architecture:** Server (`dj` module) giữ `yt` + `ytQueue` trong `DjPublicState`, tra cứu oEmbed, quyết chuyển bài;
máy khách mở một `YT.Player` trong lớp CSS3D dưới canvas WebGL, màn hình 3D "đục lỗ" alpha cho video hiện qua; đồng bộ
theo giờ server bằng `seekTo`.

**Tech Stack:** TypeScript, Three.js 0.186 (`CSS3DRenderer` có sẵn), Socket.io, zod, vitest (Node), YouTube IFrame
Player API + oEmbed (không thêm gói npm).

Spec (nguồn sự thật hành vi): `docs/superpowers/specs/2026-11-02-dj-youtube-led-design.md` — **mỗi làn đọc toàn bộ spec
trước khi code**. Tiến độ: `docs/superpowers/plans/2026-11-02-dj-youtube-led-tien-do.md`.

---

## Hợp đồng dùng chung (ĐÃ VIẾT — các làn chỉ đọc, không sửa; cần đổi thì ghi vào báo cáo làn)

| File | Nội dung |
|---|---|
| `shared/src/activities/youtube.ts` | `YT_ID_RE`, `parseYoutubeUrl(raw) → {videoId, startMs} \| null`, `youtubeWatchUrl(id)`, `YT_FATAL_ERRORS`, `youtubeErrorText(code)`, `YoutubeLookupFail`, `YT_LOOKUP_FAIL_TEXT` (làn S được sửa nếu test tìm ra lỗi parser) |
| `shared/src/activities/dj.ts` | `DjYoutubeItem`, `DjYoutubeNow`, `DJ_YT_ACTIONS` (mô tả payload từng lệnh), `DjPublicState.yt` / `.ytQueue`, `djSourceKey(s)`, `djNowTitle(s)` |
| `shared/src/config/balance.ts` | `DJ.youtube = { bpm 124, startDelayMs 2500, endGraceMs 2000, metaTimeoutMs 30000, minDurationMs 1000, maxDurationMs 6h, queueMax 10, titleMax 80, authorMax 40, urlMax 500, pasteCooldownMs 3000, lookupTimeoutMs 3000 }` |
| `shared/src/util/names.ts` | `sanitizeTitle(raw, max) → string \| null` |
| `shared/src/maps/bar.ts` | `BAR_SCREEN = { x: 0, y: 4.1, z: -16.5, w: 4.8, h: 2.7, ry: 0 }` (xuất qua `@shared/index`) |
| `client/src/art/api.ts` | `WorldControls.setVideoScreen?(mode: 'idle' \| 'loading' \| 'video', title?)`, neo `'video_screen'` |
| `client/src/engine/worldApi.ts` | `Css3dLayer { scene; setLive(live); flush() }`, `WorldApi.css3d` |

## Phân làn (file rời nhau — KHÔNG sửa file của làn khác)

| Làn | Sở hữu |
|---|---|
| **S — server** | `server/src/activities/dj/index.ts`, `server/src/activities/dj/youtube.ts` (mới), `server/tests/activities/dj.test.ts`, `server/tests/activities/djYoutube.test.ts` (mới), `server/tests/activities/djYoutubeLookup.test.ts` (mới), `server/tests/activities/modules.test.ts` + `bugfixes.test.ts` + `server/tests/helpers/fakeContext.ts` (chỉ khi cần), `shared/tests/youtube.test.ts` (mới), `shared/src/activities/youtube.ts` (chỉ sửa lỗi parser) |
| **R — renderer + màn hình 3D** | `client/src/engine/Renderer.ts`, `client/src/engine/Game.ts` (chỉ phần `world.css3d` + tắt `cssLive` khi đổi map), `client/src/ui/ui.css` (chỉ thêm `.css3d-layer`), `client/src/art/bar/screen.ts` (mới), `client/src/art/bar/index.ts`, `client/tests/barScreen.test.ts` (mới) |
| **C — bàn DJ client** | `client/src/activities/dj/youtube/ytApi.ts`, `sync.ts`, `screen.ts` (mới), `client/src/activities/dj/music.ts`, `index.ts`, `panel.ts`, `dj.css`, `client/src/activities/mixology/index.ts`, `client/src/audio/index.ts` (chỉ xuất hằng `MUSIC_BUS_GAIN`), `client/tests/djYoutubeSync.test.ts` (mới), `client/tests/djMusic.test.ts`, `djartPanel.test.ts`, `djartMix.test.ts` |

Lệnh kiểm (PowerShell hoặc bash, ở `D:\AI\Tu Online`): `npx vitest run <đường dẫn test>`, `npx tsc -p server`,
`npx tsc -p client`, `npx tsc -p shared`. Trong lúc 3 làn chạy song song, `tsc` có thể báo lỗi ở file của làn khác —
**chỉ sửa lỗi trong file mình sở hữu**, ghi lại lỗi của làn khác vào báo cáo. Không chạy `npm run dev` / build (orchestrator
làm sau). Mỗi làn ghi nhật ký ngắn ở `<scratchpad>\lanes\<làn>.md` (đường dẫn scratchpad orchestrator đưa trong prompt).

Quy ước code: chú thích tiếng Việt, mật độ như code xung quanh; không `innerHTML` với dữ liệu ngoài; không cấp phát /
vẽ lại canvas mỗi khung; mọi đổi `yt` / `ytQueue` ở server thay object / mảng mới (không sửa tại chỗ).

---

## LÀN S — server

### Task S1: test parser + tiện ích shared

**Files:** Create `shared/tests/youtube.test.ts`.

- [ ] **Bước 1:** Viết test (dạng bảng) cho `parseYoutubeUrl`:

```ts
import { describe, expect, it } from 'vitest';
import { DJ } from '../src/config/balance';
import { djNowTitle, djSourceKey, trackInfo, DJ_RECORDED } from '../src/activities/dj';
import { YT_FATAL_ERRORS, parseYoutubeUrl, youtubeErrorText, youtubeWatchUrl } from '../src/activities/youtube';
import { sanitizeTitle } from '../src/util/names';

const ID = 'dQw4w9WgXcQ';
describe('parseYoutubeUrl', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, 0],
    [`youtube.com/watch?v=${ID}&t=1m30s&list=PL1`, 90_000],
    [`https://youtu.be/${ID}?si=abc&t=42`, 42_000],
    [`https://m.youtube.com/shorts/${ID}?feature=share`, 0],
    [`https://music.youtube.com/watch?v=${ID}#t=10`, 10_000],
    [`https://www.youtube-nocookie.com/embed/${ID}?start=5`, 5000],
    [`https://www.youtube.com:443/live/${ID}`, 0],
    [`https://www.youtube.com/watch?feature=x&v=${ID}&t=1h2m3s`, 3_723_000],
    [`https://www.youtube.com/embed/${ID}`, 0],
    [`http://youtube.com/v/${ID}`, 0],
    [ID, 0],
    [`  ${`https://youtu.be/${ID}`}  `, 0],
  ])('nhận %s', (url, startMs) => expect(parseYoutubeUrl(url)).toEqual({ videoId: ID, startMs }));

  it.each([
    `https://youtube.com@evil.com/watch?v=${ID}`,
    'https://www.youtube.com/embed/videoseries?list=PL',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@kenh',
    'javascript:alert(1)',
    `ftp://youtube.com/watch?v=${ID}`,
    'https://youtube.com/watch?v=dQw4w9WgXc',
    `https://notyoutube.com/watch?v=${ID}`,
    `https://youtube.com/clip/Ugkx${'a'.repeat(30)}`,
    `https://youtu.be/${ID} x`,
    '',
    `https://youtu.be/${ID}?x=${'a'.repeat(DJ.youtube.urlMax)}`,
  ])('từ chối %s', (url) => expect(parseYoutubeUrl(url)).toBeNull());

  it('t= sai dạng → 0, không âm, kẹp 12 giờ', () => {
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?t=abc`)?.startMs).toBe(0);
    expect(parseYoutubeUrl(`https://youtu.be/${ID}?t=99h`)?.startMs).toBe(12 * 3600_000);
  });
  it('không phải chuỗi → null', () => expect(parseYoutubeUrl(42)).toBeNull());
});
```

  Thêm test: `youtubeWatchUrl(ID)` = `https://www.youtube.com/watch?v=dQw4w9WgXcQ`; `YT_FATAL_ERRORS` chứa 2, 100, 101,
  150, 153 và không chứa 5; `youtubeErrorText(150)` chứa "chặn"; `sanitizeTitle` (ký tự zero-width bị bỏ, khoảng trắng
  gộp, dài hơn max → cắt + "…" đúng `max` ký tự, chuỗi rỗng / không phải chuỗi → null, emoji không bị cắt đôi);
  `djSourceKey({ trackId, yt: null })` = trackId, có yt → `yt:<key>`; `djNowTitle` trả tên video / `trackInfo(id).name`.
- [ ] **Bước 2:** `npx vitest run shared/tests/youtube.test.ts` → xanh (parser đã viết; đỏ thì sửa
  `shared/src/activities/youtube.ts` cho đúng spec, ghi vào báo cáo).

### Task S2: tra cứu oEmbed

**Files:** Create `server/src/activities/dj/youtube.ts`, `server/tests/activities/djYoutubeLookup.test.ts`.

- [ ] **Bước 1: test trước** — fetch giả ghi lại URL + trả `{ ok, status, json }`:
  - 200 `{ title: 'A', author_name: 'B' }` → `{ ok: true, title: 'A', author: 'B', verified: true }`; URL gọi =
    `https://www.youtube.com/oembed?format=json&url=` + `encodeURIComponent('https://www.youtube.com/watch?v=<id>')`.
  - 400 / 401 / 403 / 404 → `{ ok: false, reason: 'bad_id' | 'no_embed' | 'private' | 'not_found' }`.
  - 429, 500, fetch ném lỗi (mạng / AbortError), `json()` ném lỗi, 200 thiếu title → `{ ok: true, title: '', author: '',
    verified: false }` (thiếu title nhưng 200: `verified: true`, title '').
  - Gọi 2 lần cùng id sau 200 hoặc 404 → fetch chỉ chạy 1 lần (đệm); sau lỗi mạng → lần sau gọi lại (không đệm).
  - Đệm tối đa 200 id (id thứ 201 đẩy id cũ nhất ra).
  - fetch nhận `signal` (AbortSignal) — timeout dùng `AbortSignal.timeout(timeoutMs)`.
- [ ] **Bước 2:** chạy → đỏ (chưa có module).
- [ ] **Bước 3: cài đặt**

```ts
// Tra cứu video YouTube cho bàn DJ (spec 2026-11-02 mục 3): oEmbed công khai, không cần khóa API — lấy tên video / kênh
// và loại sớm video không phát được (400 id sai · 401 chặn nhúng · 403 riêng tư · 404 không có). Lỗi mạng / quá giờ /
// 429 / 5xx → vẫn nhận link (tên chung). URL dựng lại từ id (không dùng link người dán). Đệm kết quả chắc chắn theo id.
import { DJ } from '@shared/index';
import { youtubeWatchUrl, type YoutubeLookupFail } from '@shared/activities/youtube';

export type YoutubeLookupResult =
  | { ok: true; title: string; author: string; verified: boolean }
  | { ok: false; reason: YoutubeLookupFail };
export type YoutubeLookup = (videoId: string) => Promise<YoutubeLookupResult>;

/** Phần fetch cần dùng (tiêm được trong test). */
export type OembedFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const FAIL_BY_STATUS: Partial<Record<number, YoutubeLookupFail>> = { 400: 'bad_id', 401: 'no_embed', 403: 'private', 404: 'not_found' };
const CACHE_MAX = 200;
const UNVERIFIED: YoutubeLookupResult = { ok: true, title: '', author: '', verified: false };

export function createOembedLookup(
  fetchFn: OembedFetch = (url, init) => fetch(url, init),
  timeoutMs: number = DJ.youtube.lookupTimeoutMs,
): YoutubeLookup {
  const cache = new Map<string, YoutubeLookupResult>();
  const remember = (id: string, r: YoutubeLookupResult): YoutubeLookupResult => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
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
      if (fail) return remember(videoId, { ok: false, reason: fail });
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
```
- [ ] **Bước 4:** chạy test → xanh.

### Task S3: module DJ — trạng thái, lệnh YouTube, hàng chờ, tick

**Files:** Modify `server/src/activities/dj/index.ts`; Create `server/tests/activities/djYoutube.test.ts`; sửa
`server/tests/activities/dj.test.ts` / `modules.test.ts` / `bugfixes.test.ts` nếu vỡ do trường mới / factory.

Đọc trước: file hiện tại (245 dòng), `server/tests/activities/dj.test.ts` (khung test), `server/tests/helpers/fakeContext.ts`
(`mountActivity`, `advance`, `ctx.time`, `states`/`toasts`/`chats`), spec mục 3 + 5.

- [ ] **Bước 1: khung test** (`djYoutube.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { DJ } from '@shared/index';
import type { DjPublicState } from '@shared/activities/dj';
import { createDj, djModule } from '../../src/activities/dj';
import type { YoutubeLookup, YoutubeLookupResult } from '../../src/activities/dj/youtube';
import { mountActivity } from '../helpers/fakeContext';

const ID1 = 'dQw4w9WgXcQ';
const ID2 = 'kJQP7kiw5Fk';
const ID3 = '9bZkp7q19f0';
const url = (id: string, extra = '') => `https://www.youtube.com/watch?v=${id}${extra}`;
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Tra cứu giả: mặc định trả ngay tên "Tên <id>"; `hold` = giữ lại để test kết quả về muộn. */
function fakeLookup() {
  const pending: { id: string; resolve: (r: YoutubeLookupResult) => void }[] = [];
  let hold = false;
  const lookup: YoutubeLookup = (id) =>
    hold ? new Promise((resolve) => pending.push({ id, resolve })) : Promise.resolve({ ok: true, title: `Tên ${id}`, author: 'Kênh', verified: true });
  return { lookup, pending, setHold: (v: boolean) => (hold = v) };
}

function bar() {
  const f = fakeLookup();
  const { ctx, instance } = mountActivity({ ...djModule, create: (c) => createDj(c, { lookup: f.lookup }) });
  for (const pid of ['a', 'b']) {
    ctx.addPlayer({ pid, name: pid.toUpperCase() });
    ctx.placeAt(pid, 'dj_booth');
  }
  const booth = ctx.station('dj_booth');
  const press = (pid: string) => instance.onInteract!(ctx.view(pid), booth);
  const act = (pid: string, type: string, data?: unknown) => instance.onAction!(ctx.view(pid), type, data);
  const st = () => ctx.lastState<DjPublicState>()!;
  const tick = (ms: number) => { ctx.time += ms; instance.tick!(50, ctx.time); };
  const paste = async (pid: string, id: string, extra = '') => { act(pid, 'youtube', { url: url(id, extra) }); await flush(); ctx.time += DJ.youtube.pasteCooldownMs; };
  return { ctx, instance, f, press, act, st, tick, paste };
}
```
  (Tên helper của fakeContext — `addPlayer`, `placeAt`, `station`, `view`, `lastState`, `toasts`, `chats` — lấy đúng theo
  `server/tests/activities/dj.test.ts`; chỗ nào khác tên thì theo file thật.)

- [ ] **Bước 2: test các ca** (mỗi ca 1 `it`, assert cụ thể):
  1. Bàn DJ tạo ra có `yt: null`, `ytQueue: []`.
  2. A lên bàn, dán ID1 → state: `yt.videoId === ID1`, `yt.title === 'Tên ' + ID1`, `yt.author === 'Kênh'`,
     `yt.byPid === 'a'`, `yt.durationMs === 0`, `yt.live === false`, `playing`, `startedAt === now + startDelayMs`,
     `bpm === DJ.youtube.bpm`, `beat0 === startedAt`; chat có "phát YouTube".
  3. Link có `&t=90` → `startedAt === now + startDelayMs − 90000`, `yt.startMs === 90000`.
  4. Đang phát ID1, dán ID2 rồi ID3 → `ytQueue` = [ID2, ID3] (key tăng dần), `yt` vẫn ID1; chat "thêm vào hàng chờ (#1)".
  5. Người không đứng bàn (B) dán → không đổi gì. A đứng xa bàn (> bán kính + leaveSlack) dán → không đổi.
  6. Link sai (`https://example.com`) → toast tone 'bad' cho A, state không đổi, không gọi lookup.
  7. Dán 2 lần trong < 3 s → lần 2 toast, lookup chỉ gọi 1 lần.
  8. Trùng: dán lại ID1 khi đang phát ID1, hoặc ID2 khi ID2 trong hàng → toast, không thêm.
  9. Hàng chờ đầy 10 → lần dán thứ 11 (khi đang phát YouTube) toast "đầy", không thêm.
  10. Lookup trả `{ ok: false, reason: 'no_embed' }` → toast `YT_LOOKUP_FAIL_TEXT.no_embed`, state không đổi.
      Lookup trả `verified: false, title: ''` → vẫn phát, `yt.title === 'Video YouTube'`.
      Lookup trả title 200 ký tự có ký tự điều khiển → `yt.title` ≤ 80 ký tự, không còn ký tự điều khiển.
  11. Kết quả về muộn (`setHold(true)`): A dán rồi rời bàn ('close') trước khi resolve → bỏ; dán rồi đổi map
      (`instance.onMapChange('temple')`) → bỏ; dán ID1 rồi (sau cooldown) dán ID2, resolve ID1 sau ID2 → chỉ ID2 được
      áp; `instance.dispose?.()` rồi resolve → không publish thêm state.
  12. `yt_meta` từ B (không đứng bàn) `{ videoId: ID1, durationMs: 200_000 }` → `yt.durationMs === 200000`; báo lần 2
      khác số → giữ số đầu; sai videoId / 500 ms / 7 giờ / NaN / chuỗi → bỏ; `{ live: true }` → `yt.live === true`.
  13. Hết video: đã biết `durationMs = 60_000`; tick tới `startedAt + 60_000 + endGraceMs` → hàng chờ có ID2 → `yt` thành
      ID2 (`startedAt === now + startDelayMs`), `ytQueue` bớt 1, chat "Tiếp theo"; hàng chờ trống → `yt === null`,
      `trackId === nextTrackId(trackIdTrước, 1)`, `playing`.
  14. Chưa ai báo thời lượng: tick qua `startDelayMs + metaTimeoutMs` (đang phát) → chat "Không tải được", chuyển bài.
      Livestream (`live: true`) không bao giờ tự chuyển. Đang dừng (⏸) thì không tính giờ quá hạn.
  15. `yt_error { videoId: ID1, code: 150 }` từ A (người dán) → chuyển bài + chat có `youtubeErrorText(150)`; từ B (không
      dán, không đứng bàn) → không đổi; code 5 từ A → không đổi; sai videoId → không đổi.
  16. ⏭ (`next`) khi có hàng chờ → phát video đầu hàng; không có → bài có sẵn kế; ⏮ (`prev`) khi đang YouTube → `yt`
      null, phát `trackId` cũ từ đầu; `track { id }` → `yt` null, đúng bài; cả ba giữ nguyên `ytQueue` (trừ ⏭ lấy đầu hàng).
  17. `yt_play { key }` → video đó phát ngay, rời hàng chờ, video đang phát bị bỏ; key lạ → bỏ qua. `yt_remove { key }` →
      rời hàng chờ; key lạ → bỏ qua. Người không đứng bàn gửi → bỏ qua.
  18. ⏸ (`stop`) khi đang YouTube → `playing false`, `pausedAtMs` = vị trí; ▶ (`play`) → `startedAt === now +
      switchDelayMs − pausedAtMs`, `yt` giữ nguyên.
  19. Bài thu sẵn hết (`durationMs` của bài) khi hàng chờ có video → phát video đầu hàng; hàng chờ trống → như cũ.
  20. Thi nhảy chen ngang: đang phát ID1 ở vị trí 30 s, đặt `ctx.shared.set('dance_lobby_until', now + 20_000)`, tick →
      `yt === null`, bài thu sẵn kế đang phát, `ytQueue[0].videoId === ID1` và `ytQueue[0].startMs ≈ 30_000` (±100),
      chat "Thi nhảy"; trong lúc nhảy: dán ID2 → vào hàng (sau ID1), `yt_play` / `next` / `prev` / `track` bị chặn
      (toast warn); hết vòng (tick qua `dance_lobby_until` và `dance_until`) → phát ID1 với `startedAt === now +
      startDelayMs − 30_000`, chat "Nhảy xong".
  21. Đang phát nhạc có sẵn + có vòng nhảy + hàng chờ trống: dán ID1 → vào hàng (không phát), toast "khi hết vòng";
      hết vòng → phát ID1.
  22. `onMapChange('temple')` → `yt === null`, `ytQueue` rỗng; quay lại 'bar' → bài thu sẵn đầu như cũ.
  23. Đổi `yt` / `ytQueue` luôn là object / mảng mới: giữ tham chiếu state trước, sau thao tác so `!==` (bắt lỗi sửa tại chỗ).
- [ ] **Bước 3:** chạy → đỏ.
- [ ] **Bước 4: cài đặt** — giữ nguyên hành vi cũ, thêm:
  - `export function createDj(ctx: ActivityContext, deps: { lookup: YoutubeLookup }): ActivityInstance` (thân `create`
    cũ chuyển vào đây); `const defaultLookup = createOembedLookup();` (cấp module — đệm dùng chung mọi phòng);
    `export const djModule: ActivityServerModule = { id: 'dj', maps: ['bar'], create: (ctx) => createDj(ctx, { lookup:
    defaultLookup }) };`
  - zod: `ytUrlMsg = z.object({ url: z.string().trim().min(1).max(DJ.youtube.urlMax) })`, `ytKeyMsg = z.object({ key:
    z.number().int() })`, `ytMetaMsg = z.object({ videoId: z.string().regex(YT_ID_RE), durationMs: z.number().finite()
    .optional(), live: z.boolean().optional() })`, `ytErrorMsg = z.object({ videoId: z.string().regex(YT_ID_RE), code:
    z.number().int() })`.
  - Biến riêng: `nextKey = 0`, `reqSeq = 0`, `lastPasteAt = -Infinity`, `resumeAfterDance = false`, `wasBusy = false`,
    `metaDeadline = Infinity`, `disposed = false`.
  - `create` state thêm `yt: null, ytQueue: []`. `publish()` không đổi (dj_bpm/dj_beat0 lấy từ state).
  - Hàm lõi (viết đúng tinh thần sau):

```ts
/** Phát video YouTube `item` (bắt đầu sau startDelayMs, từ item.startMs). */
function playYoutube(item: DjYoutubeItem, now: number): void {
  const playAt = now + DJ.youtube.startDelayMs;
  state.yt = { ...item, durationMs: 0, live: false };
  state.bpm = DJ.youtube.bpm;
  state.startedAt = playAt - item.startMs;
  state.beat0 = state.startedAt;
  state.playing = true;
  state.pausedAtMs = 0;
  metaDeadline = playAt + DJ.youtube.metaTimeoutMs;
  publish();
}

/** Sang nguồn kế: video đầu hàng chờ (kèm chat) → hết hàng thì bài có sẵn kế sau trackId. */
function advance(now: number, chat = true): void {
  const [head, ...rest] = state.ytQueue;
  if (head) {
    state.ytQueue = rest;
    playYoutube(head, now);
    if (chat) ctx.chatSystem(`▶️ Tiếp theo: ${head.title} (${head.byName} chọn)`);
    return;
  }
  state.yt = null;
  play(nextTrackId(state.trackId, 1), now + DJ.switchDelayMs);
}
```
  - `play(id, startedAt)` (cũ) thêm `state.yt = null` ở đầu (mọi đường phát bài có sẵn đều rời YouTube).
  - `resume(now)`: có `state.yt` → `state.startedAt = state.yt.live ? now + DJ.switchDelayMs : now + DJ.switchDelayMs −
    state.pausedAtMs; state.beat0 = state.startedAt; state.playing = true; state.pausedAtMs = 0; metaDeadline =
    Math.max(now, state.startedAt + state.yt.startMs) + DJ.youtube.metaTimeoutMs; publish();` (đang phát dở thì
    `startMs` không còn nghĩa — dùng `now + switchDelayMs + metaTimeoutMs`); không có → như cũ.
  - `pause(now)`: như cũ (`positionMs` dùng chung); livestream thì `pausedAtMs = 0`.
  - `onTrackEnd(now)` (bài thu sẵn hết): `danceBusy` → như cũ; hàng chờ có video → `advance(now)`; không → như cũ.
  - `command`:
    - `'youtube'`: theo spec mục 3 bước 1–5 (parse → cooldown → trùng → đầy → `lastPasteAt = now`, `seq = ++reqSeq`,
      `void deps.lookup(id).then(onLookup).catch(() => onLookup(UNVERIFIED))` với `onLookup` kiểm `disposed`, `seq !==
      reqSeq`, `ctx.map() !== 'bar'`, `state.controllerPid !== p.pid` → bỏ; rồi kiểm lại trùng / đầy; tạo item `{ key:
      ++nextKey, videoId, title: sanitizeTitle(r.title, DJ.youtube.titleMax) ?? 'Video YouTube', author:
      sanitizeTitle(r.author, DJ.youtube.authorMax) ?? '', startMs, byPid: p.pid, byName: p.name }`; phát ngay hay xếp
      hàng như spec). "Đầy" chỉ xét khi lần dán sẽ xếp hàng (`state.yt || state.ytQueue.length || danceBusy`).
    - `'yt_play'` / `'next'` / `'prev'` / `'track'` / `'stop'`: chặn khi `danceBusy` (toast warn như cũ). `'yt_play'`
      tính cooldown đổi bài; `'next'` có hàng chờ → `advance(now)` kèm chat `⏭ <tên> chuyển: <video>`; `'prev'` khi
      đang YouTube → `play(state.trackId, now + switchDelayMs)`; `'track'` điều kiện no-op cũ thêm `&& !state.yt`.
    - `'yt_remove'`: KHÔNG chặn khi nhảy; xoá theo key (mảng mới), publish.
    - Hàng chờ vào trong vòng nhảy mà vốn phát ngay → `resumeAfterDance = true` + toast "Đang có vòng nhảy — video phát
      khi hết vòng".
  - `onAction`: `'yt_meta'` và `'yt_error'` xử lý **trước** cổng "chỉ người đứng bàn" (mọi người trong Bar gửi được, điều
    kiện theo spec mục 3); các lệnh còn lại qua cổng cũ.
  - `tick(_dt, now)` (map Bar): `const busy = danceBusy(now)`; (1) `state.yt && busy` → chen ngang: vị trí `pos =
    state.yt.live ? 0 : Math.max(0, Math.round(positionMs(state, now)))`, đưa `{ ...state.yt (bỏ durationMs/live),
    startMs: pos }` lên đầu `ytQueue`, `resumeAfterDance = true`, `play(nextTrackId(state.trackId, 1), now +
    switchDelayMs)`, chat 💃, `wasBusy = busy`, return; (2) `!busy && wasBusy && resumeAfterDance` → `resumeAfterDance =
    false`, có hàng → phát đầu hàng + chat "▶️ Nhảy xong — phát tiếp: …"; (3) `wasBusy = busy`; (4) kiểm người đứng bàn
    (cũ); (5) `state.yt`: đang dừng → return; `!live && durationMs > 0 && now − startedAt >= durationMs + endGraceMs` →
    `advance(now)`; `!live && durationMs === 0 && now >= metaDeadline` → chat ⚠️ "Không tải được …" + `advance(now,
    false)`; return (bỏ phần bài thu sẵn); (6) phần cũ.
  - `onMapChange`: thêm `state.yt = null; state.ytQueue = []; resumeAfterDance = false; wasBusy = false; reqSeq++;`.
  - Trả thêm `dispose() { disposed = true; }`.
- [ ] **Bước 5:** `npx vitest run server/tests/activities` → xanh; `npx tsc -p server` → sạch phần server.

---

## LÀN R — renderer + màn hình LED 3D

Đọc trước: spec mục 1–2; `client/src/engine/Renderer.ts` (234 dòng); `client/src/engine/Game.ts` dòng 115–175 (tạo
`world`) và 290–330 (`buildWorld`); `client/src/ui/ui.css` dòng 33–75 (`#stage`, canvas, `.label-layer`);
`client/src/art/bar/index.ts` dòng 23–50 (helper), 200–280 (bàn DJ, chữ chạy, loa, tường LED, bảng chữ), 640–665 (laser),
700–720 (neo), 830–890 (`controls`), 920–970 (vòng cập nhật tường LED); `client/src/art/bar/casinoKit.ts`
(`glowCanvasMat`, `neonText`); `client/src/art/kit.ts` (`FONT_TITLE`, `mesh`, `geo`, `mat`).

### Task R1: lớp CSS3D + canvas alpha

**Files:** Modify `client/src/engine/Renderer.ts`, `client/src/engine/Game.ts`, `client/src/ui/ui.css`.

- [ ] **Bước 1:** `Renderer3D`:

```ts
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
// field:
/** Lớp CSS3D dưới canvas (khung YouTube của màn hình LED Bar) + cảnh riêng của nó. */
readonly css3d: CSS3DRenderer;
readonly cssScene = new THREE.Scene();
/** Vẽ lớp CSS3D mỗi khung (chỉ bật khi màn hình trong tầm nhìn và đang chiếu video). */
cssLive = false;
// constructor:
this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
// Canvas có kênh alpha để màn hình LED "đục lỗ" cho video YouTube (lớp CSS3D bên dưới) hiện qua; chỗ khác vẫn đục.
this.renderer.setClearAlpha(1);
… (sau khi append canvas)
this.css3d = new CSS3DRenderer();
this.css3d.domElement.className = 'css3d-layer';
container.insertBefore(this.css3d.domElement, this.renderer.domElement);
// resize(): this.css3d.setSize(w, h);
// render() cuối: if (this.cssLive) this.css3d.render(this.cssScene, this.camera);
/** Vẽ lớp CSS3D ngay (đưa phần tử mới vào DOM). */
renderCss(): void { this.css3d.render(this.cssScene, this.camera); }
// dispose(): this.cssScene.clear(); this.css3d.domElement.remove();
```
- [ ] **Bước 2:** `ui.css` cạnh `.label-layer`:

```css
/* Lớp CSS3D (khung YouTube màn hình LED Bar) nằm DƯỚI canvas: z-index âm trong ngữ cảnh xếp lớp của #stage (fixed),
   chỉ lộ ra ở chỗ canvas "đục lỗ" trong suốt; không nhận chuột. */
.css3d-layer {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}
```
  Kiểm `#stage` thật sự là ngữ cảnh xếp lớp (position: fixed) và không có `background` che lớp z-index âm — nếu có
  background trên `#stage` thì vẫn ổn (nền ngữ cảnh vẽ trước con z-index âm); nếu `#stage` không tạo ngữ cảnh thì thêm
  `isolation: isolate`.
- [ ] **Bước 3:** `Game.ts` — trong object `this.world`:

```ts
css3d: {
  scene: this.r.cssScene,
  setLive: (live) => {
    self.r.cssLive = live;
  },
  flush: () => self.r.renderCss(),
},
```
  và đầu `buildWorld` thêm `this.r.cssLive = false;` (map mới chưa có màn hình nào bật).
- [ ] **Bước 4:** `npx tsc -p client` — hết lỗi `css3d` ở Game.ts.

### Task R2: màn hình LED sân khấu (`art/bar/screen.ts`)

**Files:** Create `client/src/art/bar/screen.ts`, `client/tests/barScreen.test.ts`.

- [ ] **Bước 1: test trước** (`barScreen.test.ts`, chỉ phần thuần — Node không có canvas): hàm `ledColumnX(c)` (vị trí X
  cột c = 0..19 của tường LED chia đôi): 20 giá trị tăng dần, đối xứng (`ledColumnX(c) === -ledColumnX(19 - c)`), mọi
  cột `|x| − 0.14 ≥ BAR_SCREEN.w / 2 + 0.15` (không lấn màn hình, chừa khung viền) và `|x| + 0.14 ≤ 5.92`; khoảng cách
  2 cột liền nhau trong 1 bên = 0.34.
- [ ] **Bước 2: cài đặt** — xuất:

```ts
/** Bề rộng / khoảng cách cột tường LED chia đôi 2 bên màn hình (m). */
export const LED_COL_W = 0.28;
export const LED_COL_STEP = 0.34;
/** X tâm cột c (0..19) — trái → phải, 10 cột mỗi bên màn hình (cột 0 sát mép trái tường, cột 9 sát khung màn hình). */
export function ledColumnX(c: number): number {
  const i = c % 10;
  return c < 10 ? -5.78 + i * LED_COL_STEP : 2.72 + i * LED_COL_STEP;
}

export type ScreenMode = 'idle' | 'loading' | 'video';
export interface BarScreen {
  /** Khung viền (gộp tĩnh). */
  readonly statics: THREE.Group;
  /** Mặt màn hình (đổi vật liệu theo chế độ) + viền neon theo màu đèn. */
  readonly dyn: THREE.Group;
  /** Neo 'video_screen': tâm mặt màn hình, +Z hướng khán giả. */
  readonly anchor: THREE.Object3D;
  setMode(mode: ScreenMode, title?: string | null): void;
  dispose(): void;
}
export function buildBarScreen(kit: ArtKit, themedMat: (slot: number, k: number) => THREE.Material): BarScreen
```
  - Mặt: `PlaneGeometry(BAR_SCREEN.w, BAR_SCREEN.h)` tại `(x, y, z)`, `rotation.y = ry`, `castShadow = receiveShadow =
    false`. Vật liệu `idle`/`loading`: `glowCanvasMat(tex, ~1.1)` với canvas 1024 × 576 (sRGB): nền gradient tối
    `#0b0814 → #1d1236`, chấm lưới LED mờ (như chữ chạy), logo **"NIẾT BÀN CLUB"** lớn bằng `neonText` (chữ `#7ff6ff`,
    quầng `#ff4fd8`), dòng phụ: idle → "▶ Dán link YouTube ở bàn DJ — cả quán cùng xem"; loading → "Đang tải: <title>"
    (cắt cho vừa bề ngang bằng `measureText`, có "…") + dòng nhỏ "▶ YouTube". Vẽ lại chỉ khi (mode, title) đổi; vẽ lại 1
    lần sau `document.fonts.ready` (như chữ chạy).
  - Vật liệu `video` (lỗ): `new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: false, blending:
    THREE.NoBlending, depthWrite: true, fog: false, toneMapped: false })`. `setMode` chỉ đổi `face.material`.
  - Khung viền: hộp tối (`mat('#0d0a14', { roughness: 0.6 })`) rộng `w + 0.3`, cao `h + 0.3`, sâu 0.1, mặt trước ở
    `z − 0.02` (mặt màn hình nhô 2 cm — tránh z-fighting); 4 dải neon `themedMat(0, 1.6)` mảnh (0.04 m) ôm NGOÀI mép mặt
    màn hình (không đè lên lỗ). Khung vào `statics`, mặt + dải neon vào `dyn` (gộp tĩnh bỏ mesh ẩn / đổi vật liệu).
  - `anchor`: `Object3D` tên `anchor:video_screen` tại tâm mặt, `rotation.y = ry`, thêm vào `dyn`.
  - `dispose()`: giải phóng texture, 2 vật liệu, geometry của mặt.
- [ ] **Bước 3:** `npx vitest run client/tests/barScreen.test.ts` → xanh.

### Task R3: nối vào Bar + đổi đồ cũ

**Files:** Modify `client/src/art/bar/index.ts`.

- [ ] Tường LED: cột c đặt ở `x: ledColumnX(c)`, hộp `geo.box(LED_COL_W, 0.32, 0.05)`; giữ 8 hàng `y: r * 0.42`, nhóm ở
  `y 1.2`, `vu.push({ m, col: c })` như cũ (vòng cập nhật đọc hàng từ y / 0.42 — không đổi).
- [ ] Bỏ `clubSign` (bảng "NIẾT BÀN CLUB") — logo đã ở hình nền màn hình.
- [ ] Tia laser: `l.position.set(0, 5.52, -D / 2 + 1)` (trên mép màn hình 5,45).
- [ ] `const screen = buildBarScreen(kit, themedMat); statics.add(screen.statics); dyn.add(screen.dyn);
  anchors.set('video_screen', screen.anchor);` — đặt TRƯỚC vòng `defaultAnchors` (vòng đó bỏ qua neo đã có).
- [ ] `controls.setVideoScreen = (mode, title) => screen.setMode(mode, title ?? null)` (trong object `controls`);
  `dispose` của Bar gọi `screen.dispose()`. Dải neon dùng `themedMat` nên tự đổi màu theo `setLightTheme`.
- [ ] `npx tsc -p client` (phần của làn R sạch) + `npx vitest run client/tests` (không làm vỡ test cũ của Bar).

---

## LÀN C — bàn DJ client

Đọc trước: spec mục 4–6; `client/src/activities/dj/{index,music,panel,effects}.ts`, `dj.css`; `client/src/audio/api.ts`
(`getVolume`, `setRecorded`, `stopBeatTrack`) + `client/src/audio/index.ts` dòng 180–200 (hệ số 0,7 kênh nhạc);
`client/src/settings.ts` (`settings.get().quality`); `client/src/ui/api.ts` (`toast`, `root`, `isTyping`); `client/src/ui/dom.ts`
(`h`, `button`); `client/src/activities/mixology/index.ts` dòng 30–50, 135–145, 190–200, 270–285; test cũ
`client/tests/djMusic.test.ts`, `djartPanel.test.ts` (DOM giả), `djartMix.test.ts`.

### Task C1: hàm thuần đồng bộ (`youtube/sync.ts`) — TDD

**Files:** Create `client/src/activities/dj/youtube/sync.ts`, `client/tests/djYoutubeSync.test.ts`; Modify
`client/src/audio/index.ts` (xuất `export const MUSIC_BUS_GAIN = 0.7;` và dùng nó thay số 0,7 ở `setVolume('music')`).

- [ ] **Bước 1: test trước:**
  - `expectedSec(startedAt, playing, pausedAtMs, now)`: đang phát → `(now − startedAt) / 1000`; dừng → `pausedAtMs / 1000`.
  - `playAt(yt, startedAt)` = `startedAt + yt.startMs` (giờ server bắt đầu phát thật).
  - `shouldSeek({ current, expected, duration, now, lastSeekAt, stalled })`: true khi lệch > 1,5 s, ≥ 5 s từ lần tua
    trước, `expected` trong [0, duration − 2], không `stalled`; false ở từng biên (1,5 s đúng → false; 4 999 ms → false;
    gần hết → false; stalled → false).
  - `detectLive(d1, d2)`: `d1 > 0 && d2 − d1 > 2`.
  - `ytVolumePercent(level, music, master)` = `clamp(round(100 × level × music × MUSIC_BUS_GAIN × master), 0, 100)`;
    mặc định (1; 0,55; 0,8) → 31; casino 0,55 → 17; 0 → 0.
  - `ytPixelSize(quality)`: 'high' → `{ w: 1280, h: 720 }`, 'low' → `{ w: 854, h: 480 }`.
- [ ] **Bước 2:** chạy đỏ → cài đặt (hàm thuần, không import DOM / three) → chạy xanh.

### Task C2: tải API + trình phát (`youtube/ytApi.ts`, `youtube/screen.ts`)

**Files:** Create `client/src/activities/dj/youtube/ytApi.ts`, `client/src/activities/dj/youtube/screen.ts`.

- [ ] `ytApi.ts`: kiểu tối thiểu `YTPlayer` (`loadVideoById(o: { videoId: string; startSeconds?: number })`,
  `cueVideoById(o)`, `playVideo()`, `pauseVideo()`, `stopVideo()`, `seekTo(s: number, allow: boolean)`,
  `getCurrentTime(): number`, `getDuration(): number`, `getPlayerState(): number`, `setVolume(v: number)`, `mute()`,
  `unMute()`, `isMuted(): boolean`, `destroy()`), `YTNamespace { Player: new (el: HTMLElement, opts: …) => YTPlayer }`,
  hằng trạng thái (`UNSTARTED −1, ENDED 0, PLAYING 1, PAUSED 2, BUFFERING 3, CUED 5`). `loadYoutubeApi():
  Promise<YTNamespace>` — 1 promise dùng chung; `window.YT?.Player` có sẵn → xong ngay; không thì chèn `<script
  src="https://www.youtube.com/iframe_api">` 1 lần, nối `window.onYouTubeIframeAPIReady` cũ (nếu có); `onerror` hoặc quá
  15 s → reject VÀ xoá promise đệm (lần sau thử lại).
- [ ] `screen.ts` — `export class DjYoutubeScreen` (một trình phát cho cả lúc ở Bar), hàm dựng nhận
  `(ctx: ClientActivityContext, getState: () => DjPublicState | null)`:
  - `apply(s: DjPublicState)`: gọi từ `DjMusic.sync` khi khóa nguồn / startedAt / playing đổi. Lần đầu có `s.yt` →
    khởi tạo: `loadYoutubeApi()`; tạo `wrap` (div, `width/height` theo `ytPixelSize(settings.get().quality)`,
    `pointer-events:none`, `visibility:hidden`, không background) chứa `slot`; `new CSS3DObject(wrap)`; đặt theo
    `ctx.world.anchor('video_screen')` (`updateWorldMatrix(true, false)` rồi `matrixWorld.decompose(pos, quat, scale)`),
    `obj.scale.multiplyScalar((BAR_SCREEN.w / pxW) * 1.01)`; `ctx.world.css3d.scene.add(obj)`; `ctx.world.css3d.flush()`;
    rồi `new YT.Player(slot, { width: pxW, height: pxH, playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0,
    playsinline: 1, rel: 0, iv_load_policy: 3 }, events: { onReady, onStateChange, onError, onAutoplayBlocked } })`.
    API lỗi → toast warn "Không tải được trình phát YouTube (trình chặn quảng cáo?)" + màn hình `loading`.
  - Đổi video (key mới): chưa tới `playAt` → `cueVideoById({ videoId, startSeconds: startMs / 1000 })` + hẹn
    `setTimeout(play, playAt − serverNow)`; đã qua → `loadVideoById({ videoId, startSeconds: expectedSec(...) })`; đang
    dừng → cue ở `pausedAtMs / 1000`. Cùng key, playing đổi → `seekTo(expected, true)` + `playVideo()` (hoặc hẹn giờ) /
    `pauseVideo()`. Trước `onReady` thì nhớ yêu cầu, áp khi ready (method chưa có trước handshake — gọi sẽ ném).
  - `setInterval(1000)` riêng (chạy cả khi tab ẩn): (a) sửa lệch theo `shouldSeek` (chỉ khi PLAYING, state server đã có
    `durationMs > 0`, `!live`; `stalled` = `getCurrentTime()` không tăng qua 2 lần kiểm liền trong khi PLAYING —
    quảng cáo); (b) báo thời lượng: lần đầu PLAYING của key → ghi `d1 = getDuration()` + giờ; ≥ 4 s sau còn PLAYING →
    `d2`, gửi `ctx.send('yt_meta', { videoId, durationMs: Math.round(d2 * 1000), live: detectLive(d1, d2) })` 1 lần/key,
    chỉ khi `getState()?.yt` vẫn đúng key và server chưa có `durationMs`/`live`; (c) watchdog chặn tiếng: 4 s sau lệnh
    phát mà trạng thái chưa từng 1/3 → coi như bị chặn.
  - Bị chặn tiếng (`onAutoplayBlocked` hoặc watchdog): `mute(); playVideo();` + hiện chip `button('🔇 Nhạc YouTube đang
    tắt tiếng — bấm để bật', 'dj-yt-chip', unblock, ctx.ui.root)`; thêm listener `pointerdown` + `keydown` (capture,
    window) gọi `unblock` lần kế; `unblock` = `unMute(); setVolume(vol); playVideo();` → ẩn chip, gỡ listener khi phát
    có tiếng.
  - `onError(code)`: `ctx.send('yt_error', { videoId, code })` + `ctx.ui.toast('Video không phát được trên máy bạn: ' +
    youtubeErrorText(code), 'warn')`, màn hình `loading` (server sẽ đổi bài nếu là lỗi chết từ máy người dán).
  - Chế độ màn hình (`ctx.world.controls.setVideoScreen?.(mode, title)` — chỉ gọi khi đổi): không có yt → `idle`; có yt
    mà chưa từng PLAYING (key hiện tại) → `loading` + tên; PLAYING / BUFFERING / PAUSED sau khi đã chạy → `video` (wrap
    `visibility: visible`; chế độ khác → `hidden`).
  - `update()` (mỗi khung, từ `DjMusic.update`): `ctx.world.css3d.setLive(mode === 'video' && trongTầmNhìn)` — frustum
    từ `ctx.world.camera` (`projectionMatrix × matrixWorldInverse`) giao hình cầu bao màn hình (tâm neo, bán kính
    `hypot(w, h) / 2`), cấp phát 1 lần; âm lượng mỗi 250 ms: `ytVolumePercent(levelAt, ctx.audio.getVolume('music'),
    ctx.audio.getVolume('master'))` → đổi thì `mute()` (0) / `unMute(); setVolume(v)` (trừ lúc đang bị chặn tiếng).
  - `stop()`: rời YouTube (về nhạc có sẵn): `stopVideo()`, xoá hẹn giờ phát, `setLive(false)`, màn hình `idle`, giữ
    trình phát để dùng lại. `dispose()`: `destroy()`, gỡ CSS3DObject khỏi `css3d.scene` (xoá phần tử), gỡ chip + listener
    + interval + timeout.

### Task C3: `DjMusic` + module DJ

**Files:** Modify `client/src/activities/dj/music.ts`, `client/src/activities/dj/index.ts`.

- [ ] `DjMusic` nhận `createScreen?: (ctx, getState) => YoutubeScreenLike` (mặc định tạo `DjYoutubeScreen`; test tiêm
  bản giả), tạo lười khi lần đầu gặp `s.yt`; interface `YoutubeScreenLike = { apply(s): void; update(): void; stop():
  void; dispose(): void }`.
- [ ] `sync`: khóa `${djSourceKey(s)}|${s.startedAt}|${s.playing}`; có `s.yt` → tắt bài thu sẵn (`setRecorded(null, 0)`
  nếu đang mở) + `stopSynth`, `screen.apply(s)`, `setMusicPlaying(s.playing)`, `setNowPlaying(s.playing ?
  sanitizeTitle(s.yt.title, 48) : null)`; rời YouTube → `screen.stop()` TRƯỚC khi mở bài có sẵn. Không có yt thì giữ
  nguyên luồng cũ.
- [ ] `update`: có `s.yt` → `screen.update()`, bắn `onBeat` theo `s.beat0`/`s.bpm` (danh nghĩa), **không** Drop, không
  `trackInfo`; còn lại như cũ. `stop()` → thêm `screen?.dispose()` (rời Bar), `reset()` giữ nguyên ý.
- [ ] `index.ts`: `manualSwitch` so `djSourceKey(prev) === djSourceKey(s)`, thời lượng = `prev.yt ? prev.yt.durationMs :
  trackInfo(prev.trackId).durationMs`; `prompt` / `onState` / `onOpen` không đổi.

### Task C4: bảng DJ — mục YouTube + hàng chờ

**Files:** Modify `client/src/activities/dj/panel.ts`, `client/src/activities/dj/dj.css`.

- [ ] Khu điều khiển (`render` / `tick`): có `s.yt` → tiêu đề = tên video; meta = `YouTube · ${author || 'không rõ
  kênh'} · ${byName} chọn`; tiến độ: `durationMs > 0 && !live` → `clock(pos) / clock(durationMs)`; live → "● TRỰC
  TIẾP"; chưa biết → "Đang lấy thời lượng…"; dừng → "Đã dừng"; chưa tới giờ → "Sắp vào bài…". Không nút bài có sẵn nào
  `.on`. Mọi chỗ gọi `trackInfo(s.trackId)` khi có `yt` phải rẽ nhánh.
- [ ] Mục mới (sau khu điều khiển + dòng khóa vòng nhảy, trước danh sách bài): tiêu đề `'▶️ YouTube — chiếu lên màn hình
  LED'`; hàng nhập: `h('input', 'input input-small dj-yt-input')` (`placeholder` 'Dán link YouTube (youtube.com/watch…,
  youtu.be/…)', `maxLength = DJ.youtube.urlMax`, `spellcheck = false`) + `button('➕ Thêm', 'dj-yt-add', submit)`;
  dòng gợi ý / trạng thái `.dj-yt-hint` ("Đang phát nhạc có sẵn → phát ngay; đang phát YouTube → xếp hàng (tối đa 10)").
  `submit`: `parseYoutubeUrl(value)` null → gợi ý báo đỏ "Link không phải video YouTube" + lắc ô; hợp lệ →
  `send('youtube', { url: value })`, xoá ô, `input.blur?.()`, gợi ý "Đang kiểm tra link…" tới khi `yt`/`ytQueue` đổi hoặc
  6 s. Ô nhập: `keydown` Enter → submit; Escape → `blur()` + `stopPropagation()` + `preventDefault()` (không đóng bảng).
- [ ] Hàng chờ `.dj-yt-queue`: tiêu đề "Hàng chờ (n/10)"; mỗi dòng `#i <tên> — <người chọn>` + `button('▶', …, () =>
  send('yt_play', { key }))` + `button('✕', …, () => send('yt_remove', { key }))`; trống → "Hàng chờ trống — dán link để
  phát ngay hoặc xếp hàng". Chỉ dựng lại danh sách khi chữ ký `ytQueue.map(k).join()` đổi. Trong vòng nhảy: nút ▶ thêm
  lớp `locked` (và ⏮ ⏭, danh sách bài như cũ); ô nhập + ✕ vẫn dùng được; gợi ý "Đang có vòng nhảy — video phát khi hết
  vòng".
- [ ] `dj.css`: kiểu cho `.dj-yt-*` theo bảng màu bảng DJ (viền `var(--line)`, nền `#fffdf7`, nhấn `#ff4fd8`), dòng chờ
  cắt chữ 1 dòng (`text-overflow: ellipsis`), `.dj-title` thêm `overflow-wrap:anywhere` + giới hạn 2 dòng; chip
  `.dj-yt-chip` (fixed, giữa trên màn hình, `pointer-events:auto`, nền tối viền hồng) — chip là `button` nên đã bấm được.
- [ ] Giữ test DOM giả chạy: chỉ dùng thuộc tính / method có trong `fakeEl` của `djartPanel.test.ts` hoặc bổ sung fake
  (`value`, `placeholder`, `maxLength`, `blur`, `focus`, `remove`, `replaceChildren`/xóa con) trong test.

### Task C5: pha chế + test

**Files:** Modify `client/src/activities/mixology/index.ts`, `client/tests/djMusic.test.ts`, `djartPanel.test.ts`,
`djartMix.test.ts`.

- [ ] Pha chế: chỗ dùng `dj.playing ? dj.bpm : …` → `dj.playing && !dj.yt ? dj.bpm : …` (YouTube = như nhạc dừng, gợi ý
  "canh theo chấm nhịp").
- [ ] Fixture `djState()` thêm `yt: null, ytQueue: []`.
- [ ] Test mới `djMusic`: state có `yt` → `setRecorded(null, 0)` (nếu đang mở bài) + `stopBeatTrack` được gọi, màn hình
  giả nhận `apply`, `setNowPlaying` nhận tên video (cắt 48), cùng khóa gọi lại không `apply` lần 2, meta đổi
  (`durationMs`) không mở lại nguồn; `update` có yt không gọi `drop`, có `onBeat`; rời yt → `screen.stop` trước
  `setRecorded(url…)`.
- [ ] Test mới bảng DJ: dựng có ô nhập + nút Thêm; link sai không gửi; link đúng gửi `('youtube', { url })`; hàng chờ 2
  video ra 2 dòng, render lại cùng hàng chờ không dựng lại (giữ cùng phần tử); ▶ gửi `yt_play` đúng key, ✕ gửi
  `yt_remove`; vòng nhảy → nút ▶ có `locked`, ô nhập không.
- [ ] `npx vitest run client/tests` → xanh; `npx tsc -p client` → sạch phần làn C.

---

## Sau 3 làn (orchestrator)

- [x] `npm run typecheck` · `npm test` · `npm run build` — sạch hết.
- [x] Thử trình duyệt (`npm run dev`, Vite :5173 + server :3000; kiểm cổng trống trước, không kill process lạ): vào
  Bar → màn hình hiện logo; đứng bàn dán link → 2 tab thấy video trên màn hình + nghe cùng đoạn; người đứng trước che
  màn hình; hàng chờ / ▶ / ✕ / ⏭; video chặn nhúng → toast; đồ họa thấp; mở Thi nhảy → về nhạc thu sẵn → hết vòng phát
  tiếp.
- [x] Workflow phản biện (≤ 3 agent cùng lúc) → sửa → kiểm lại.
- [x] Cập nhật file tiến độ + README (dòng tính năng Quán Bar), báo cáo user. Không commit.
