# Tiến độ & bàn giao — Tượng Phật đá + Đại Pháp Đường (2026-10-31)

File này để **phiên làm việc sau đọc là chạy tiếp được**. Cập nhật mỗi khi xong một bước. Phiên trước từng bị dừng
giữa chừng vì **chạm giới hạn phiên (session limit)** khi chạy 5 agent song song — vì vậy chạy ít agent một lúc.

## Yêu cầu gốc của user (nguyên văn)

> trong game Tu online, D:\AI\Tu Online đã chạy đến … phần nhân cấp đồ họa rồi Nâng cấp đồ họa tả thực + tượng Phật,
> tượng phật thì tôi muốn làm giống như ảnh hết mức có thể, đồng thời trong khu treo ảnh thì không cần để bát hương
> như thờ cúng đâu, bỏ bát hương đi nơi khu treo ảnh, Tiếp tục update UI tả thực. Tôi muốn làm thêm 1 khu tụng kinh
> nhưng nơi đó chỉ việc ngồi và nghe khi phật trong C:\Users\LENOVO\Downloads\Nhạc kinh phật , nơi nghe kinh này sẻ
> là nơi to nhất, hoành tráng, tráng lệ nhất

> (sau khi bị ngắt) chạy tiếp

> đang chạy đến bước nào và cần chạy gì tiếp thì node vào 1 File md để các phiên xử lý sau có thể thừa kế chạy tiếp.
> Đồng thời tiếp tục chạy việc đang làm giữa chừng

Ảnh mẫu tượng Phật: tượng đá xanh xám ngồi thiền trên bệ sen (ảnh pngtree user gửi trong chat — **không** lưu vào dự án
vì là ảnh có bản quyền; muốn so lại thì xin user gửi lại ảnh).

## Trạng thái từng phần

| # | Phần việc | Trạng thái | File chính |
|---|---|---|---|
| 1 | Bỏ bát hương + nhang + khói ở 6 khám chân dung (Điện Tăng Đoàn) | ✅ Xong, đã chụp kiểm trong game | `client/src/art/temple/tangDoan.ts` |
| 2 | Tượng Phật đá theo ảnh mẫu (SDF nhiều phần, Web Worker, LOD gần/xa, tóc xoắn ốc instanced + normal map xoáy) | ✅ Xong (có thể tinh chỉnh thêm) | `client/src/art/temple/buddhaSdf.ts`, `buddha.ts`, `buddha.worker.ts`; xem thử `preview.html?view=buddha` |
| 3 | Chánh Điện đặt tượng mới (bệ thờ sâu hơn, hào quang, xà giữa không xuyên tượng, ánh vàng chỉ khi bật Hào quang) | ✅ Xong | `client/src/art/temple/buildings.ts` |
| 4 | Tả thực tiếp: hoa dại 5 cánh (thay khối đa giác), núi xa mịn hơn | ✅ Xong | `client/src/art/common/nature.ts`, `client/src/art/common/sky.ts` |
| 5 | Dữ liệu bản đồ Đại Pháp Đường: mở rộng map lên phía Bắc (z −100..−40), hằng `PHAP_DUONG`, tường/cột/bệ/cửa, 40 bồ đoàn `sutra_cushion_1..40`, zone `phap_duong`, roof `phap_duong`, biên minZ −99 | ✅ Xong, test map pass | `shared/src/maps/temple.ts` (+ `types.ts`, `ids.ts` 'sutra', `config/text.ts`, `activities/temple.ts` SutraPublicState/SutraOpenData, `shared/tests/maps.test.ts`) |
| 6 | Nhạc kinh: chép mp3 (57,6 MB, 1 giờ, 128 kbps) vào dự án + danh sách bài | ✅ Xong | `client/src/content/sutra/nhac-phat-tinh-tam.mp3`, `client/src/content/sutra.ts` |
| 7 | API âm thanh `setRecorded` / `recordedDuration` (khai báo) | ✅ Khai báo xong | `client/src/audio/api.ts` |
| 8 | Server hoạt động `sutra` (giữ chỗ bồ đoàn, đứng dậy, rời/đổi map trả chỗ, không thưởng) + 11 test | ✅ Xong (agent workflow), 67 test server pass | `server/src/activities/sutra/index.ts`, `server/tests/activities/sutra.test.ts` |
| 9 | Client hoạt động `sutra` (ngồi, khung hình nhìn tượng, HUD, mức to nhạc theo vị trí, đồng bộ giờ server) | ✅ Đã viết + typecheck sạch; CSS HUD `.sutra-hud`/`.sutra-time` đã thêm (chưa thử trong game) | `client/src/activities/sutra/index.ts`, `client/src/activities/activities.css` |
| 10 | Cài đặt phát nhạc thu sẵn trong engine âm thanh (HTMLAudioElement → MediaElementSource → kênh nhạc, nhường nhạc nền, chờ mở khóa, tạm dừng khi 0) | 🔄 Workflow đang làm (agent `build:audio`) | `client/src/audio/index.ts` |
| 11 | Dựng thân Đại Pháp Đường (hiên 10 cột, 3 cửa, tường, trần ô cờ, 4 hàng cột lớn + rồng cuốn, bệ + tượng ~9 m, hào quang, đèn sen, đèn lồng, phướn, vệt nắng, 40 bồ đoàn, mái 3 tầng) | 🔄 Workflow đang làm (agent `build:hall`) | `client/src/art/temple/phapDuong.ts` (đã nối sẵn ở `temple/index.ts`) |
| 12 | Sân trước điện + 2 nghi môn + mở rộng mặt đất (đồi, cỏ, rừng, lối đi lên) | 🔄 Workflow đang làm (agent `build:yard`) | `client/src/art/temple/phapDuongYard.ts`, `client/src/art/temple/ground.ts` |
| 13 | Phản biện (review) + sửa lỗi xác nhận | ⏳ Workflow chạy sau khi build xong (2 agent: `review:sutra-audio`, `review:art`) | — |
| 14 | Kiểm hình ảnh trong game + tinh chỉnh; tả thực thêm | ⏳ Chưa làm | — |
| 15 | Typecheck + test + build cuối | ⏳ Chưa làm | — |

Đã kiểm lúc viết file: typecheck 3 project sạch, **164 test pass** (gồm 11 test sutra mới). Phiên 2026-10-31 sáng: đã
chạy tiếp workflow từ chỗ dừng (task `w6so2e46u`, run `wf_c425360c-c01`) với script đã sửa — bỏ agent client (đã xong),
còn 3 agent build (audio, hall, yard) + 2 agent review. Dev server được bật lại bằng Bash nền (`npm run dev` trong
`D:\AI\Tu Online`) vì `preview_start` chỉ đọc `.claude/launch.json` của thư mục phiên (fastdo-server).

## Chạy tiếp như thế nào

1. **Bật dev server** (nếu chưa chạy — kiểm `netstat -ano | grep -E ":(5173|3000) "`): dùng preview_start cấu hình `game`
   trong `.claude/launch.json` (= `npm run dev`: Vite :5173 + game server :3000). Đừng kill process lạ.
2. **Workflow** (đã sửa để chỉ chạy phần còn lại, ít agent hơn): script
   `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\ad41d191-4300-4eaf-90f4-1021c0958be6\workflows\scripts\phap-duong-build-wf_c425360c-c01.js`,
   run id `wf_c425360c-c01` → `Workflow({ scriptPath, resumeFromRunId: 'wf_c425360c-c01' })`. Agent `build:server` đã xong
   nên trả kết quả cache. Nếu phiên mới không có script/journal này (khác session) thì chạy lại các mục 10–13 bằng tay
   theo mô tả trong bảng + mục "Hợp đồng" bên dưới.
3. **Client sutra** (mục 9): `npx tsc -p client`, đọc lại file, thêm khối CSS HUD (`.sutra-hud`…) vào `activities.css`.
4. Sau khi các phần xong: kiểm trong game (mục 14), rồi `npm run typecheck`, `npm test`, `npm run build` (mục 15).
5. Cập nhật lại bảng trạng thái ở trên.

## Hợp đồng đã chốt (đừng đổi khi chạy tiếp)

- Bố cục điện: hằng `PHAP_DUONG` trong `shared/src/maps/temple.ts` là nguồn sự thật (tường Nam z −62 có 3 cửa
  `[[−11,3.6],[0,5],[11,3.6]]` cao 7,2; tường Bắc −94; Tây/Đông x ±22; dày 0,8; tường cao 12, trần 12,4; hiên cột ở z −58,6;
  cột trong x = ±9, ±16 tại z −66…−86; bệ thờ tâm z −89,6 rộng 16 sâu 8 cao 2; tượng tỉ lệ 2,55; đèn sen x ±6 z −84,4;
  bồ đoàn 5 hàng × 8; sân lát đá x ±30, z −57,6…−42; nghi môn tâm x −17,2 / 18, nửa khoảng trụ 2,4, z −40,4).
- Hoạt động `sutra`: client gửi `stand` để đứng dậy; server mở bằng `SutraOpenData { stationId }`, trạng thái công khai
  `SutraPublicState { seats }`. Không thưởng Công Đức/Tạp Niệm (user: "chỉ việc ngồi và nghe").
- Âm thanh: `audio.setRecorded(url | null, level 0..1, { startAt(duration), loop, onEnded })`; mức to client dùng:
  ngồi 1, đứng trong điện 0,35, trước cửa ≤ 0,1, xa thì 0 (tạm dừng tải). Vị trí phát = giờ server mod thời lượng
  (cả phòng nghe cùng một đoạn).
- Tượng: `realisticBuddha()` trả `{ group, bodyMat }`; group luôn để ở `ctx.dynamics` (lưới gắn sau khi Worker dựng xong,
  nhóm tĩnh đã gộp mesh từ lúc dựng map).

## Ghi chú & quyết định

- File nhạc 57,6 MB: GitHub cảnh báo (>50 MB) nhưng vẫn đẩy được; có thể nén còn ~43 MB (96 kbps) nếu user muốn.
- Chân dung ở Điện Tăng Đoàn là bạn bè còn sống → không đặt đồ thờ cúng kiểu người mất (bát hương, nhang).
- Tượng Phật: tỉ lệ đo từ ảnh mẫu (tổng cao 3,62 đơn vị; nhục kế 3,38→3,62; chân tóc 3,2; mắt 2,99; cằm 2,66; vai 2,23–2,36;
  gối ±1,28; bệ 0→0,70). Còn có thể chỉnh: tai, mắt, cánh mũi, chuyển tiếp cổ–ngực.
- Không có git (thư mục chưa git init) — không commit. Dự án được tự chạy npm install/test/build.
