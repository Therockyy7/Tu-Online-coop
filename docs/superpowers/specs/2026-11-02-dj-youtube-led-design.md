# Bàn DJ: dán link YouTube + màn hình LED sân khấu + hàng chờ (2026-11-02)

> Bổ sung cho `2026-11-01-quan-bar-song-bac-design.md` (mục 4 — nhạc DJ + bàn DJ). Trạng thái: **4 quyết định do user
> chốt** 2026-11-02 (bảng dưới), thiết kế đã duyệt ("Duyệt, làm tiếp"); chi tiết do AI chốt gom ở mục 10.
> Tiến độ + bàn giao: `docs/superpowers/plans/2026-11-02-dj-youtube-led-tien-do.md`. Plan: `…-dj-youtube-led-plan.md`.

## 0. Quyết định của user

| Câu hỏi | User chọn |
|---|---|
| Phát YouTube thì hiện video thế nào? | **Thêm 1 màn hình LED trong quán Bar, bật link YouTube thì video hiện lên đó luôn** (không phải khung 2D góc màn hình, không phát ẩn) |
| Đang phát YouTube mà mở Thi nhảy? | **Tự chuyển về nhạc có sẵn** (bài thu sẵn đã đo nhịp), báo trong chat |
| Hết video? | **Về danh sách có sẵn** |
| Dán link mới khi đang có bài phát? | **Xếp hàng chờ** |
| Vị trí màn hình (sau khi trình bày phương án A/B) | **A — tường sân khấu phía Bắc, sau lưng DJ** ("Duyệt, làm tiếp") |

Yêu cầu gốc (nguyên văn): *"Hiện tại trong quán Bar tôi muốn Update có thể kết nối link Youtube vào để bật nhạc trực
tiếp luôn, vẫn giữ các bài nhạc có sẵn đó nhưng thêm option dán link youtube"* — trả lời câu hỏi hiển thị (nguyên văn):
*"tôi muốn quán bar update thêm 1 màng hình led bật link Youtube thì hiển thị lên luôn"*.

## 1. Màn hình LED sân khấu

- **Vị trí** (`BAR_SCREEN` ở `shared/src/maps/bar.ts`): tâm mặt màn hình (0; 4,1; −16,5), rộng 4,8 × cao 2,7 m (16:9),
  nhìn về Nam ra sàn nhảy; mép trên 5,45 m (dưới giàn đèn trần 5,59), mép dưới 2,75 m (trên đầu DJ ~1,73 m và bàn DJ
  ~1,35 m). Từ sàn nhảy nhìn thẳng ở 10–22 m; từ chỗ xuất hiện (0; 12,5) thấy ngay trước mặt. Gắn tường, không va chạm.
- **Đổi đồ cũ cho vừa**: tường LED 20 cột nhảy theo nhạc **chia đôi sang hai bên màn hình** (mỗi bên 10 cột, |x| từ
  2,58 tới 5,92, cột 0,28 m cách 0,34; giữ 8 hàng cách 0,42 m để phổ nhạc / đèn chớp không phải đổi); **bỏ bảng chữ
  "NIẾT BÀN CLUB"** (logo chuyển vào hình nền màn hình); **gốc tia laser nâng từ 4,8 lên ~5,52 m** (trên mép màn hình;
  tia bắt đầu đúng ở gốc, chĩa lên và xòe quạt — sau phản biện 2026-11-02).
- **3 chế độ** (`WorldControls.setVideoScreen(mode, title)`):
  - `idle` — không phát YouTube: hình nền club (logo NIẾT BÀN CLUB neon + "▶ Dán link YouTube ở bàn DJ — cả quán
    cùng xem").
  - `loading` — đã có video nhưng trình phát chưa chạy (đang tải, chờ giờ bắt đầu, bị chặn tự phát tiếng): "Đang tải:
    <tên video>".
  - `video` — trình phát đang chạy / đã chạy rồi tạm dừng: mặt màn hình thành "lỗ" trong suốt, video thật hiện qua.
- Khung viền tối + viền neon theo màu đèn (themed); canvas hình nền chỉ vẽ lại khi đổi chế độ / tên.

## 2. Kỹ thuật hiển thị: lớp CSS3D dưới canvas + "đục lỗ"

Khung YouTube (iframe khác nguồn) **không vẽ được lên texture WebGL**. Cách làm (đã kiểm khả thi trên three 0.186 và
chuỗi hậu kỳ hiện có):

- `Renderer3D`: `WebGLRenderer({ …, alpha: true })` + `setClearAlpha(1)` (giữ `premultipliedAlpha` mặc định). Nền map
  là `Color` nên mọi chỗ khác vẫn đục; chỉ "lỗ" mới trong suốt. Hậu kỳ (GTAO → bloom → chỉnh màu → OutputPass) giữ được
  alpha của lỗ (bloom cộng thêm chút sáng lên video — chấp nhận).
- Lớp `CSS3DRenderer` (có sẵn trong three, không thêm gói) đặt **trong `#stage`, trước canvas**, CSS
  `position:absolute; inset:0; z-index:-1; pointer-events:none` (z-index âm mới nằm dưới canvas tĩnh; ở trong `#stage`
  để hiệu ứng say rượu biến dạng cả hai lớp như nhau). Cảnh riêng `cssScene`; `setSize` trong `resize()`; vẽ sau cảnh
  WebGL **chỉ khi `cssLive`**; gỡ trong `dispose()`.
- `WorldApi.css3d: Css3dLayer { scene, setLive(live), flush() }` (`client/src/engine/worldApi.ts`). Đổi map → engine
  tắt `cssLive`.
- **Lỗ**: mặt màn hình đổi vật liệu sang `MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: false,
  blending: NoBlending, depthWrite: true, fog: false, toneMapped: false })` (thiếu NoBlending thì three ép alpha = 1 →
  ra màu đen; thiếu fog:false thì sương tím cộng vào thành quầng), `castShadow = false`. Vật thể đứng trước (người, khói,
  tia laser) vẽ đè lên lỗ bình thường → che video như vật thật; nhãn tên (CSS2D) vẫn nằm trên.
- **Khung YouTube**: phần tử bọc 1280 × 720 px (đồ họa thấp: 854 × 480) trong `CSS3DObject`, đặt theo
  `anchor('video_screen').matrixWorld`, scale = `BAR_SCREEN.w / bề rộng px` (× 1,01 cho mép khớp dưới khung viền);
  `pointer-events:none`; ẩn bằng `visibility` (không `display:none`, không gỡ / dời phần tử — iframe sẽ tải lại).
  Mỗi khung: màn hình nằm trong tầm nhìn (frustum ∩ hình cầu bao) và đang ở chế độ `video` → `setLive(true)`, ngược lại
  `false` (đỡ trình duyệt vẽ lại iframe, tránh lỗi phép chiếu khi màn hình sau lưng camera).
- Iframe nằm dưới canvas nên không bao giờ nhận chuột / bàn phím — không ai tự tua / dừng làm lệch cả quán, không bị
  cướp tiêu điểm bàn phím, khóa chuột giữ nguyên.

## 3. Dán link + hàng chờ (server, module `dj`)

Trạng thái công khai thêm (`DjPublicState`): `yt: DjYoutubeNow | null` (video đang phát) và `ytQueue: DjYoutubeItem[]`
(hàng chờ). Lúc phát YouTube: `startedAt` = giờ server ứng với giây 0 của video, `bpm = DJ.youtube.bpm` (124, danh
nghĩa), `beat0 = startedAt`, `trackId` = bài có sẵn phát gần nhất. Mọi lần đổi `yt` / `ytQueue` thay object/mảng mới
(không sửa tại chỗ — `ctx.setState` giữ tham chiếu).

**Ai**: chỉ người đang đứng bàn DJ (đúng luật bàn hiện nay) dán / phát ngay / xoá. `yt_meta`, `yt_error` nhận từ mọi
máy trong Bar (có điều kiện, xem dưới).

**`youtube { url }`** (url chuỗi 1–500 ký tự):
1. `parseYoutubeUrl` (`shared/src/activities/youtube.ts`) → null: toast "Link không phải video YouTube…".
2. Dán dồn < 3 s (`pasteCooldownMs`): toast chờ. Trùng video đang phát / trong hàng chờ: toast. Hàng chờ đầy (10) mà
   lần dán này sẽ xếp hàng: toast.
3. Tra cứu **oEmbed** (`https://www.youtube.com/oembed?format=json&url=<watch URL dựng lại từ id>` — không dùng link
   người dán → không SSRF), timeout 3 s, có bộ nhớ đệm theo id (chỉ lưu kết quả nhận được — từ chối không đệm, chủ
   video đổi sang công khai / cho nhúng thì dán lại được ngay):
   - 200 → tên (`title`), kênh (`author_name`); 400 → `bad_id`; 401 → `no_embed`; 403 → `private`; 404 → `not_found`
     → toast lỗi (`YT_LOOKUP_FAIL_TEXT`), cả quán không bị gì.
   - Mạng lỗi / quá giờ / 429 / 5xx / JSON hỏng → **vẫn nhận**, tên "Video YouTube".
4. Kết quả về (bất đồng bộ) chỉ áp dụng nếu: module chưa dispose, đúng lượt yêu cầu mới nhất, map vẫn là Bar, người dán
   vẫn đứng bàn; kiểm lại trùng / đầy. `onAction` vẫn đồng bộ (promise tự bắt lỗi — không để rejection thoát ra).
5. Không có YouTube đang phát + hàng chờ trống + không có vòng nhảy → **phát ngay** (bắt đầu sau 2,5 s — máy khách kịp
   tải trình phát; link có `?t=` thì bắt đầu từ giây đó), chat `🎬 <tên> phát YouTube: <video>`. Còn lại → **xếp
   cuối hàng**, chat `🎬 <tên> thêm vào hàng chờ (#n): <video>`; đang có vòng nhảy mà vốn sẽ phát ngay → đánh dấu "phát
   khi hết vòng".

**Hàng chờ / chuyển bài**:
- Video hết (thời lượng đã biết + 2 s) → video kế trong hàng chờ (chat `▶️ Tiếp theo: …`) → hết hàng chờ → bài thu sẵn
  kế tiếp (sau `trackId`).
- Bài **thu sẵn** hết → hàng chờ có video thì phát video đầu hàng; không thì như cũ. (Có vòng nhảy thì vẫn phát lại bài
  đúng phách như cũ.) Bài tổng hợp lặp mãi → hàng chờ đợi tới khi DJ bấm ⏭ / ▶.
- `yt_play { key }` phát ngay 1 video trong hàng chờ (video YouTube đang phát bị bỏ). `yt_remove { key }` xoá khỏi hàng.
- ⏭ (`next`): hàng chờ có video → video đầu hàng; không → bài có sẵn kế. ⏮ (`prev`) khi đang YouTube → quay về bài có
  sẵn vừa phát (`trackId`) từ đầu; bấm 1 bài có sẵn (`track`) → chuyển sang bài đó. Hai trường hợp này hàng chờ giữ
  nguyên (phát tiếp khi bài có sẵn hết).
- ⏸ / ▶ dừng / phát tiếp video (livestream phát tiếp từ chỗ trực tiếp).
- Đổi map → xoá video đang phát + hàng chờ.
- Luật thời gian nghỉ cũ giữ nguyên (đổi bài 3 s, phát/dừng 1 s); `yt_play` tính như đổi bài.

**Thời lượng / livestream** (`yt_meta { videoId, durationMs, live }`): YouTube không cho server biết thời lượng (oEmbed
không có) → máy khách báo; nhận **lần đầu**, đúng video đang phát, `durationMs` trong [1 s; 13 giờ] (YouTube cho tải
lên tới 12 giờ) hoặc `live: true`.
Livestream: không tự hết, không tua đồng bộ. Phát quá 30 s (tính từ giờ bắt đầu, chỉ lúc đang phát) mà chưa máy nào báo
được (không phải livestream) → coi như không phát được: chat lý do, chuyển bài.

**Lỗi trình phát** (`yt_error { videoId, code }`): mã trong `YT_FATAL_ERRORS` (2, 100, 101, 150, 153) từ **máy người
dán hoặc người đứng bàn** → cả quán chuyển bài, chat `⚠️ Không phát được "<video>": <lý do> — chuyển bài.` Máy khác
báo → bỏ qua ở server (máy đó tự hiện lỗi — thường do chặn theo vùng). Mã 5 luôn chỉ tại máy.

## 4. Máy khách: phát đồng bộ, âm lượng, lỗi

- **Một trình phát YouTube** (IFrame Player API, tải `https://www.youtube.com/iframe_api` một lần, có `onerror` cho
  trình chặn quảng cáo) cho cả lúc ở Bar; đổi video bằng `loadVideoById` / `cueVideoById`; hủy khi rời Bar.
  `playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 }`. Không tự
  viết iframe (YT.Player tự thêm `allow="autoplay"`, `origin`, Referer).
- **Đồng bộ theo giờ server**: vị trí cần có = (giờ server − `startedAt`) / 1000 giây. Chưa tới giờ bắt đầu → cue sẵn
  rồi hẹn giờ phát. Sửa lệch bằng `seekTo` (YouTube không cho chỉnh tốc độ mịn như mp3): kiểm mỗi 1 s bằng `setInterval`
  riêng (chạy cả khi tab ẩn), chỉ khi đang PLAYING, đã biết thời lượng, không phải livestream; lệch > 1,5 s và đã ≥ 5 s
  từ lần tua trước → tua; thời gian không chạy dù đang PLAYING (đang quảng cáo) → không tua; gần hết video (≤ 2 s) → để
  yên. Mục tiêu: các máy lệch nhau ≤ ~1–2 s.
- **Báo thời lượng**: lần đầu PLAYING ghi `getDuration()`; ≥ 4 s sau đọc lại — tăng > 2 s → livestream; không thì gửi
  `yt_meta` với thời lượng (mỗi video 1 lần, chỉ khi server còn chưa biết).
- **Âm lượng**: iframe không đi qua Web Audio → tự tính `setVolume(round(100 × mức chỗ đứng × volMusic × 0,7 ×
  volMaster))` (0,7 = hệ số kênh nhạc của engine; trong Sòng Công Đức mức = 0,55), 0 → `mute()`; kiểm mỗi 250 ms
  trong vòng cập nhật DJ. Phát YouTube thì tắt hẳn bài thu sẵn / bài tổng hợp (một nguồn nhạc tại một lúc).
- **Bị chặn tự phát tiếng** (`onAutoplayBlocked`, hoặc 4 s sau lệnh phát vẫn chưa chạy): phát **tắt tiếng** cho kịp
  đồng bộ + hiện nút "🔇 Nhạc YouTube đang tắt tiếng — bấm để bật" (HUD, bấm được); lần bấm / gõ phím kế tiếp trong game
  thử `unMute()` + `playVideo()` (video còn chờ giờ bắt đầu thì không phát sớm — chờ tới giờ, cú bấm sau mới thử).
- **Lỗi** (`onError`): gửi `yt_error` (server quyết đổi bài hay không) + toast tại máy "Video không phát được trên máy
  bạn: <lý do>"; màn hình về `loading`/`idle`. Lỗi đến muộn của video trước (trình phát còn báo id cũ theo
  `getVideoUrl()` khi máy đã sang video mới) → bỏ qua, nạp lại video mới 1 lần; lỗi lần 2 cho video đó mới tính.
- **Màn hình**: chưa chạy → `loading` + tên; PLAYING / BUFFERING (sau khi đã chạy) / PAUSED → `video`; không có YouTube
  → `idle`. Chữ chạy "ĐANG PHÁT" trên bàn DJ hiện tên video (cắt ~48 ký tự).

## 5. Thi nhảy, đèn, tường LED, pha chế

- **Mở sảnh nhảy khi đang phát YouTube** (server tick thấy `danceBusy`): video đang phát **quay về đầu hàng chờ** (vị trí
  đang dở thành `startMs`; livestream → 0), đánh dấu "phát tiếp khi hết vòng", phát bài thu sẵn kế (đúng nhịp) — chat
  `💃 Có Thi nhảy — tạm chuyển về nhạc thu sẵn cho đúng nhịp; nhảy xong phát tiếp video.` Hết vòng (danceBusy hết) mà
  có đánh dấu + hàng chờ còn video → phát video đầu hàng (đúng đoạn đang dở), chat `▶️ Nhảy xong — phát tiếp: …`.
- Trong vòng nhảy: **thêm vào hàng chờ / xoá được**; phát ngay (`yt_play`), ⏭ ⏮, chọn bài vẫn bị chặn như cũ.
- **Đèn / sàn LED**: YouTube không có nhịp đo được → máy khách bắn `onBeat` theo lưới danh nghĩa 124 BPM
  (`beat0`/`bpm` trong trạng thái), **không bắn Drop tự động** (mốc drop là của bài thu sẵn).
- **Tường LED phổ nhạc**: Web Audio không nghe được iframe → `musicBands` trả false → tường tự chạy hoạt ảnh có sẵn (đã
  có chế độ dự phòng khi > 0,5 s không có phổ).
- **Pha chế (lắc theo nhịp)**: đang phát YouTube coi như "không có nhịp nhạc" — canh theo chấm nhịp như lúc nhạc dừng.

## 6. Bảng DJ (người đứng bàn)

- Khu điều khiển: đang YouTube → tên video, "YouTube · <kênh> · <người chọn>", thanh tiến độ khi biết thời lượng
  ("● TRỰC TIẾP" với livestream, "Đang lấy thời lượng…" khi chưa biết); không bài có sẵn nào sáng.
- Mục mới **"▶️ YouTube — chiếu lên màn hình LED"**: ô dán link (Enter = thêm; Esc = bỏ chọn ô, không rời bàn; không
  phím tắt bàn DJ nào chạy khi đang gõ) + nút "➕ Thêm"; kiểm dạng link ngay tại máy (sai → báo tại chỗ, không gửi);
  đang chờ server → "Đang kiểm tra link…". Gợi ý: đang phát nhạc có sẵn thì phát ngay, đang phát YouTube thì xếp hàng.
- **Hàng chờ (n/10)**: mỗi dòng "#i tên — người chọn" + ▶ phát ngay + ✕ xoá; trống → dòng gợi ý. Trong vòng nhảy: ▶ bị
  khóa (như ⏮ ⏭), ✕ và ô dán vẫn dùng được.
- DOM dựng một lần; danh sách chờ chỉ dựng lại khi hàng chờ đổi (ô dán không mất chữ / tiêu điểm).

## 7. Kiến trúc (theo khuôn module có sẵn)

- `shared/`: `activities/youtube.ts` (đọc link, mã lỗi, chữ lỗi — **đã viết**), `activities/dj.ts` (kiểu
  `DjYoutubeItem` / `DjYoutubeNow`, `yt` / `ytQueue`, `djSourceKey`, `djNowTitle`, `DJ_YT_ACTIONS` — **đã viết**),
  `config/balance.ts` (`DJ.youtube` — **đã viết**), `util/names.ts` (`sanitizeTitle` — **đã viết**), `maps/bar.ts`
  (`BAR_SCREEN` — **đã viết**).
- `server/`: `activities/dj/youtube.ts` (tra cứu oEmbed tiêm được, bộ nhớ đệm), `activities/dj/index.ts` (lệnh, hàng
  chờ, tick, `createDj(ctx, deps)` để test tiêm tra cứu giả).
- `client/`: `engine/Renderer.ts` + `engine/Game.ts` (lớp CSS3D, alpha, `world.css3d`), `ui/ui.css` (`.css3d-layer`),
  `art/bar/screen.ts` (màn hình: khung, hình nền, lỗ, neo) + `art/bar/index.ts` (tường LED chia đôi, bỏ bảng chữ, laser,
  nối `setVideoScreen`), `activities/dj/youtube/*` (tải API, trình phát + đồng bộ + âm lượng + lỗi, hàm thuần test được),
  `activities/dj/music.ts` / `index.ts` / `panel.ts` / `dj.css`, `activities/mixology/index.ts` (coi YouTube là không
  nhịp).
- Không thêm gói npm (kiểu `YT` khai báo tối thiểu trong code).

## 8. Kiểm thử

- **shared**: `parseYoutubeUrl` (mọi dạng link nhận / từ chối, `t=` các dạng, host giả `youtube.com@evil.com`,
  `javascript:`, `/embed/videoseries`), `sanitizeTitle`, `djSourceKey` / `djNowTitle`.
- **server** (FakeActivityContext + tra cứu giả bằng promise hoãn): dán → phát ngay / xếp hàng; link sai, dồn, trùng,
  đầy; oEmbed từ chối từng loại / lỗi mạng vẫn nhận; kết quả về muộn khi đã rời bàn / đổi map / có yêu cầu mới / đã
  dispose → bỏ; `yt_meta` lần đầu thắng, sai video / ngoài khoảng bỏ; `yt_error` người dán vs người khác, mã chết vs mã
  5; hết video → hàng chờ → bài có sẵn; quá 30 s chưa có thời lượng → chuyển; ⏭ ⏮ chọn bài, ⏸ ▶ video; bài thu sẵn hết →
  hàng chờ; Thi nhảy chen ngang → về đầu hàng đúng vị trí → hết vòng phát tiếp; dán trong vòng nhảy; đổi map xoá hết;
  module tra cứu oEmbed (ánh xạ mã HTTP, timeout, bộ nhớ đệm, URL dựng từ id).
- **client** (Node, DOM giả): hàm thuần đồng bộ (vị trí cần có, quyết định tua, phát hiện livestream, âm lượng);
  `DjMusic` chế độ YouTube (tắt nhạc có sẵn, khóa nguồn, không Drop); bảng DJ mục YouTube + hàng chờ (dựng 1 lần, khóa ▶
  trong vòng nhảy, Esc trong ô); cập nhật fixture test cũ (`yt: null, ytQueue: []`).
- **Trình duyệt** (`npm run dev`, 2 tab): dán link → cả 2 tab thấy video trên màn hình, nghe cùng đoạn; người đi qua che
  màn hình; hàng chờ / ⏭ / xoá; video cấm nhúng → báo lỗi; quay lưng / vào Sòng vẫn nghe; đồ họa cao (hậu kỳ) và thấp;
  Thi nhảy chen ngang rồi phát tiếp.

## 9. Ngoài phạm vi

Người không đứng bàn thêm bài (máy hát chung); giữ hàng chờ qua lần khởi động lại server / đổi map; tìm video trong
game; nhiều màn hình; danh sách phát YouTube (playlist); đo nhịp video YouTube; âm thanh theo khoảng cách tới màn hình.

## 10. Rủi ro

- **Nhiều MV của hãng đĩa chặn nhúng** (101/150) → báo lỗi, chọn bản lyric / cover. Video giới hạn tuổi / vùng cũng vậy.
- **Quảng cáo trong video**: máy dính quảng cáo vào trễ rồi tự đuổi kịp; sang bài theo đồng hồ server.
- **Điều khoản YouTube API**: hiện trình phát trong khung 3D, bị người che, tiếp tục phát khi quay đi / sang Sòng là
  vùng xám (III.I.9, RMF). Chơi nội bộ ổn; mở công khai thì cân nhắc.
- **Hiệu năng**: canvas có alpha → mọi map tốn thêm một lần trộn toàn màn hình; iframe vẽ lại khi xoay camera (giảm bằng
  `setLive` theo tầm nhìn, `controls: 0`, 854 × 480 khi đồ họa thấp). Thu phóng trình duyệt khác 100% làm lớp CSS3D lệch.
- **Safari / iOS** chặn phát có tiếng do script → chỉ nghe được sau khi bấm (game nhắm trình duyệt máy tính).
- Render (máy chủ đám mây) có thể bị YouTube giới hạn oEmbed → vẫn nhận link với tên chung.

## 11. AI tự chốt (user xem lại được)

1. Màn hình 4,8 × 2,7 m; tường LED chia 2 bên; bỏ bảng chữ (logo vào hình nền); laser nâng lên 5,52 m.
2. Chỉ người đứng bàn dán / phát ngay / xoá; hàng chờ tối đa 10, không trùng video; dán cách nhau ≥ 3 s.
3. Đang phát nhạc có sẵn mà hàng chờ trống → video phát ngay; còn lại xếp cuối hàng.
4. ⏭ ưu tiên hàng chờ; ⏮ khi YouTube = về bài có sẵn vừa phát; chọn bài có sẵn giữ hàng chờ (phát tiếp khi bài đó hết).
5. Thi nhảy chen ngang: video đang dở về đầu hàng, nhảy xong phát tiếp đúng đoạn.
6. Livestream phát như radio (không tự hết, không đồng bộ từng giây); quá 30 s không ai báo được thời lượng → chuyển bài.
7. Chỉ lỗi từ máy người dán / người đứng bàn mới làm cả quán chuyển bài.
8. Đèn nháy theo 124 BPM danh nghĩa khi phát YouTube; không Drop tự động; pha chế coi như không nhịp.
9. oEmbed lỗi mạng vẫn nhận link (tên "Video YouTube"); 401/403/404/400 từ chối.
