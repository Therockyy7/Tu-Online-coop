# Tiến độ & bàn giao — Tượng Phật đá + Đại Pháp Đường (2026-10-31)

File này để **phiên làm việc sau đọc là chạy tiếp được**. Cập nhật mỗi khi xong một bước. Phiên trước từng bị dừng
giữa chừng vì **chạm giới hạn phiên (session limit)** khi chạy 5 agent song song — vì vậy chạy ít agent một lúc.

> **Trạng thái 2026-10-31 chiều: ĐÃ XONG** 17/17 mục bên dưới (gồm 2 yêu cầu thêm: lạy Phật khi ngồi nghe kinh, bầu
> trời bớt chói). Đã thử trong game, typecheck sạch, 164 test pass, build OK. Việc còn lại chỉ là tinh chỉnh tuỳ chọn —
> xem mục "Còn mở / có thể làm tiếp".
>
> **Cập nhật 2026-10-31 ~16:00: Điện Tăng Đoàn vinh danh + bóc quẻ ĐÃ XONG** (mục 18–20): điện dựng lại + phản biện,
> 291 lá quẻ ở 6 lĩnh vực (công cụ kiểm 0 lỗi), đã thử trong game lạy + bóc quẻ ở cả 6 ảnh, typecheck sạch, 164 test
> pass, build OK.

## Yêu cầu gốc của user (nguyên văn)

> trong game Tu online, D:\AI\Tu Online đã chạy đến … phần nhân cấp đồ họa rồi Nâng cấp đồ họa tả thực + tượng Phật,
> tượng phật thì tôi muốn làm giống như ảnh hết mức có thể, đồng thời trong khu treo ảnh thì không cần để bát hương
> như thờ cúng đâu, bỏ bát hương đi nơi khu treo ảnh, Tiếp tục update UI tả thực. Tôi muốn làm thêm 1 khu tụng kinh
> nhưng nơi đó chỉ việc ngồi và nghe khi phật trong C:\Users\LENOVO\Downloads\Nhạc kinh phật , nơi nghe kinh này sẻ
> là nơi to nhất, hoành tráng, tráng lệ nhất

> (sau khi bị ngắt) chạy tiếp

> đang chạy đến bước nào và cần chạy gì tiếp thì node vào 1 File md để các phiên xử lý sau có thể thừa kế chạy tiếp.
> Đồng thời tiếp tục chạy việc đang làm giữa chừng

> (2026-10-31 chiều, kèm ảnh chụp nhìn về phía mặt trời bị trắng xoá) Bầu trời đang bị chói quá, đồng thời tại Đại pháp
> đường, tôi muốn thêm hành động lày phật khi đang ngồi nghe kinh

> (2026-10-31 chiều) Tại Điện tăng đoàn, tôi muốn nó là nơi tôn vinh các Sư chứ không phải là nơi tưởng nệm, giống như
> nó là nơi tuyên dương các sư thầy. Hiện tại Điện tăng đoàn giống như thờ cúng không tốt vì những người này vẫn còn
> sống . làm Lại Điện tăng đoàn cho trang nghiêm hoành tráng hơn. Đồng thời trong 6 bước ảnh, mỗi người sẻ cho lời
> khuyên trong từng lĩnh vực như: [Công danh & Sự nghiệp — cơ hội thăng tiến, chuyển việc, đổi ngành hoặc thi cử; thời
> điểm thích hợp để khởi nghiệp, mở rộng kinh doanh hoặc chọn đối tác làm ăn hợp mệnh/hợp tuổi · Tình duyên & Hôn nhân —
> bao giờ gặp được ý trung nhân, đường tình duyên có trắc trở không; xem độ hòa hợp tuổi tác, ngày giờ tốt để làm đám
> cưới, hoặc hướng xử lý khi xảy ra xung đột vợ chồng · Tài lộc & Tiền bạc — vận may tài chính ngắn hạn (thưởng, đầu
> tư, trúng số) và dài hạn (tích lũy tài sản, đất đai, nhà cửa); các hạn hao tài tốn của trong năm để chủ động phòng
> tránh hoặc quản lý chi tiêu · Sức khỏe & Bình an — thể trạng tổng quát, cơ quan dễ gặp vấn đề theo ngũ hành/cung
> mệnh; vận hạn về tai nạn, ốm đau, đi lại xa hoặc phẫu thuật trong từng năm/tháng · Gia đạo & Con cái — hòa khí gia
> đình, mối quan hệ giữa cha mẹ - con cái, anh chị em; đường con cái (thời điểm sinh con, số lượng con, con cái có hiếu
> thuận hay hợp mệnh bố mẹ không) · Vận hạn niên hạn & Chuyến đi lớn (Xuất hành/Định cư) — năm nay có vướng hạn nặng
> như Tam Tai, Kim Lâu, Hoang Ốc, Thái Tuế hay không để làm lễ giải hạn hoặc kiêng cữ; thời vận cho việc xuất ngoại, du
> học, định cư hoặc thay đổi chỗ ở/xây nhà mới] Mỗi khi lạy rồi sau đó bóc quẻ thì sẻ hiện lời khuyên tương ứng, hãy
> cho thật nhiều lời khuyên cho mỗi lĩnh vực
>
> (Danh sách lĩnh vực trong ngoặc vuông là bản gom gọn từ khối user dán vào, giữ nguyên chữ của từng gạch đầu dòng.)

**Điện Tăng Đoàn vinh danh + bóc quẻ (✅ xong 2026-10-31 ~16:00 — xem mục 18–20 trong bảng):** thiết kế đã chốt — giữ khung nhà + va chạm, làm lại
hình ảnh thành điện tuyên dương (bỏ khám thờ, nến, bình sen, hạc–rùa, đỉnh đồng; thêm khung ảnh mạ vàng, bảng lĩnh vực,
băng rôn, Bảng Vàng giữa điện, mái 2 tầng); quỳ → lạy đủ 3 lạy → **Q = bóc quẻ** → lá quẻ lời khuyên đúng lĩnh vực.
Ảnh 1→6 = Công Danh, Tình Duyên, Tài Lộc, Sức Khỏe, Gia Đạo, Vận Hạn (`client/src/content/fortunes/domains.ts`).
Dữ liệu quẻ: `client/src/content/fortunes/*.ts` (48 lá/lĩnh vực, kiểu `FortuneSlip`), rút không lặp bằng `drawSlip()` ở
`index.ts`. Phần bóc quẻ trong `client/src/activities/gallery/index.ts` + CSS do orchestrator tự làm (✅ xong, typecheck
sạch). Nhãn trong `shared/` đổi sang "đảnh lễ Sư Thầy / kệ ống quẻ / Bảng Vàng" (chỉ chú thích + nhãn trạm, va chạm giữ nguyên).

- Lần 1 (session `d8f7f5e5`, run `wf_f80b4a0a-f81`): phiên bị ngắt ngay sau khi chạy — **không agent nào làm được gì**
  (6 file quẻ vẫn là mảng rỗng, `tangDoan.ts` chưa đổi, không có journal).
- Lần 2 (session `33d59b2c`, 2026-10-31 14:3x, run `wf_01eb2acc-a1f`, script
  `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\33d59b2c-acee-4593-9886-4bcf05bde474\workflows\scripts\tang-doan-honor-hall-wf_01eb2acc-a1f.js`):
  cùng 8 agent (3 viết quẻ, 2 lĩnh vực/agent + 3 phản biện; 1 dựng điện + 1 phản biện), **tối đa 3 agent cùng lúc**.
  Có công cụ kiểm quẻ tự động (số lá, phân bố chủ đề/mức, nhịp 6/8, vần, bằng trắc, trùng lặp) ở scratchpad của session:
  `...\Temp\claude\D--FastDo-fastdo-server\33d59b2c-...\scratchpad\check-fortunes.mts` — chạy
  `npx tsx "<đường dẫn>" [cong_danh ...]` từ `D:\AI\Tu Online`. Phiên sau nếu cần làm lại: kiểm file nào còn rỗng
  (`grep -c "level:" client/src/content/fortunes/*.ts`) và `git diff --stat client/src/art/temple/` rồi chỉ chạy phần thiếu.
- Lúc bắt đầu lần 2, server game cổng 3000 **không chạy** (tsx watch cũ còn sống nhưng không bật lại server sau lần sửa
  `shared/` lúc 14:13) → đã bật `npm run dev:server` riêng (Vite cũ ở :5173 vẫn dùng tiếp).
- Kết quả lần 2 (đọc từ journal `...\33d59b2c-...\subagents\workflows\wf_01eb2acc-a1f\journal.jsonl`): **xong** dựng điện +
  phản biện (sửa khe hở 1 cm quanh điện ở y 4,5 m, bệ kệ ống quẻ chìm dưới sàn), **xong** Công Danh 49 / Tình Duyên 48 /
  Tài Lộc 49 / Sức Khỏe 49 lá + phản biện (0 lỗi). Bị ngắt khi đang viết Gia Đạo (dừng ở 16 lá) và Vận Hạn (14 lá).
- Lần 3 (session `746ab505`, 2026-10-31 tối, run `wf_93088305-607`, script
  `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\746ab505-5bf8-4600-8184-ab7d5f667810\workflows\scripts\tang-doan-finish-fortunes-wf_93088305-607.js`):
  chỉ chạy phần thiếu — viết nốt Gia Đạo + Vận Hạn (mỗi lĩnh vực 1 agent viết + 1 agent phản biện) và 1 agent soi code
  bóc quẻ (chỉ báo cáo, orchestrator tự sửa). Công cụ kiểm quẻ đã chép sang
  `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\746ab505-5bf8-4600-8184-ab7d5f667810\scratchpad\check-fortunes.mts`
  (chạy không tham số = cả 6 lĩnh vực + bắt trùng chéo). Nếu lần này cũng bị ngắt: đếm lá như trên, chỉ viết tiếp chủ đề
  còn thiếu (mỗi khối chủ đề mở bằng `// ── Tên chủ đề ──`).
- **Server dev hay kẹt khi tự khởi động lại:** sửa file trong `server/` lúc 15:45 làm cả 2 tiến trình `tsx watch` cũ
  (của `npm run dev` 11:40 và của `npm run dev:server` 14:33) báo "Rerunning..." rồi **không bật lại server** (cổng 3000
  chết, trình duyệt báo "Không kết nối được máy chủ"); bản 11:40 đã kẹt như vậy từ 14:13. Code không lỗi (chạy thử cổng
  3997 lên bình thường). Đã bật thêm `npm run dev:server` nền lúc 15:5x (session `746ab505`). Nếu cổng 3000 lại chết: bật
  một `npm run dev:server` mới (không kill process lạ), hoặc user tắt hết rồi chạy lại `npm run dev`.

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
| 9 | Client hoạt động `sutra` (ngồi, khung hình nhìn tượng, HUD, mức to nhạc theo vị trí, đồng bộ giờ server) | ✅ Xong, **đã thử trong game**: đi bộ tới bồ đoàn → E ngồi (khóa di chuyển, anim `sit`, khung hình nhìn tượng) → HUD "Đang nghe … 35:39 / 60:02" → E đứng dậy. HUD nâng lên `bottom: calc(9vh + 14px)` (ngang HUD phòng tranh) vì trước đó đè thanh biểu cảm | `client/src/activities/sutra/index.ts`, `client/src/activities/activities.css` |
| 10 | Cài đặt phát nhạc thu sẵn trong engine âm thanh (HTMLAudioElement → MediaElementSource → kênh nhạc, nhường nhạc nền, chờ mở khóa, tạm dừng khi 0) | ✅ Xong + review + **thử thật**: stream 206 Partial Content; ra sân → tắt dần, tạm dừng, `preload='none'`; quay vào → `play()` lại và tua tới vị trí giờ server; ngồi lại: HUD 37:10 vs `currentTime` 2230,5 s (lệch 0,5 s do HUD làm tròn) | `client/src/audio/index.ts` |
| 11 | Dựng thân Đại Pháp Đường (hiên 10 cột, 3 cửa, tường, trần ô cờ, 4 hàng cột lớn + rồng cuốn, bệ + tượng ~9 m, hào quang, đèn sen, đèn lồng, phướn, vệt nắng, 40 bồ đoàn, mái 3 tầng) | ✅ Xong: nền đá (đỉnh 0,064) + sàn đá mài (0,08), hiên 10 cột + trần ô cờ, 3 cửa mở (~300 đinh vàng gộp 1 mesh), 26 cửa sổ chấn song, 9 vệt nắng, 20 cột + 4 rồng cuốn, trần 30 tấm ô cờ, thảm đỏ, 40 bồ đoàn trên chiếu, 3 đèn chùm sen, 12 đèn lồng, 8 phướn; mái 3 tầng nóc 24 m (`phapDuongRoof.ts`). ≈188k tam giác chưa kể tượng (~410k), đúng 3 PointLight. Sprite quầng sáng → `glowCard` (mesh quay theo camera) vì GTAO vẽ Sprite thành ô tối | `phapDuong.ts`, `phapDuongRoof.ts` (mới), `phapDuongDecor.ts`, `phapDuongAltar.ts` |
| 12 | Sân trước điện + 2 nghi môn + mở rộng mặt đất (đồi, cỏ, rừng, lối đi lên) | ✅ Xong + review: kiểm bằng số địa hình = 0 tuyệt đối trên toàn vùng đi lại, lối Đông/Tây không cắt collider, đồ trang trí đúng tâm collider, biển nghi môn đọc đúng chiều cả hai mặt | `phapDuongYard.ts`, `ground.ts` |
| 13 | Phản biện (review) + sửa lỗi xác nhận | ✅ 3 agent phản biện, sửa 6 lỗi: âm thanh mất đồng bộ nếu bước ra trước khi metadata về (`loadedmetadata` giờ tua khi còn đang phát); viền vàng bệ dưới phủ kín mặt bệ; nền đá dưới điện sát sàn 4 mm (z-fighting xa) → hạ còn 0,064; 2 chỗ cấp phát mỗi khung (phướn trong điện, pháp tuyến phướn ngoài sân); cỏ mọc xuyên hàng cây cảnh x ±31 | — |
| 14 | Kiểm hình ảnh trong game + tinh chỉnh | ✅ Đã chụp: từ sân chính (mái 3 tầng nhô sau Chánh Điện), mặt tiền từ sân, trong điện, 2 góc sau, góc Tây ngoài điện, nghi môn Đông, từ trên cao. Sửa thêm: **núi xa mọc xuyên vào khu Bắc** (160 đỉnh lưới nhô lên trong tường, cao tới 8,8 m, thấy cả đồi xanh sau bệ thờ) → `createMountains` có tham số `clear`, ngọn nào lấn khuôn viên (+8 m) thì lùi ra theo hướng của nó (9/66 ngọn dời, còn 0); GTAO bỏ qua `Sprite` (`Renderer.ts`, chữa luôn quầng tối của sprite ở pha chế) | `client/src/art/common/sky.ts`, `temple/index.ts`, `client/src/engine/Renderer.ts` |
| 15 | Typecheck + test + build cuối | ✅ `npm run typecheck` sạch; `npm test` 15 file / **164 test pass**; `npm run build` OK (mp3 ra `dist/client/assets/nhac-phat-tinh-tam-*.mp3`); server production thử ở cổng 3999 trả mp3 `206 Partial Content` + `Accept-Ranges: bytes` + `audio/mpeg` | — |
| 16 | **Lạy Phật khi đang ngồi nghe kinh** (yêu cầu thêm chiều 31/10) | ✅ Đang ngồi bồ đoàn: **Space = lạy** — hoạt ảnh `prostrate` sẵn có của Điện Tăng Đoàn (quỳ lên, chắp tay cúi rạp về phía tượng, `PORTRAIT_BOW.bowMs` = 1,8 s) rồi tự về `sit`; camera góc thứ nhất cúi theo (mắt 0,85 → 0,45 m, nhìn từ mặt tượng xuống sàn rồi ngẩng lại); chuông gia trì khẽ mỗi lạy; bấm Space lúc đang lạy bị bỏ qua; E giữa lúc lạy vẫn đứng dậy bình thường. Hoạt ảnh đi theo tư thế đồng bộ qua mạng (server nhận mọi `AnimId`) nên cả phòng thấy — **chỉ sửa client, không thưởng** (giữ hợp đồng "chỉ ngồi nghe"). HUD: "Space: lạy Phật · E / Esc: đứng dậy". Đã thử trong game | `client/src/activities/sutra/index.ts` |
| 17 | **Bầu trời bớt chói** | ✅ Nguyên nhân (đo trong game): nhìn về phía mặt trời, cả vùng trời rộng quanh mặt trời (quầng Mie + mây sáng, không chỉ đĩa) vượt ngưỡng bloom 1,6 của Chùa → bloom tràn thành màn trắng phủ kín hình. Sửa trong `tuneSky`: nén mềm chỗ sáng của bầu trời **thấy được** (`SKY_LIMIT`: từ 0,9 nén về trần 1,35 < ngưỡng bloom; riêng đĩa mặt trời trần 6 để còn quầng nhỏ). Bản chụp IBL không nén (ánh sáng cảnh giữ nguyên); thông số khí quyển giữ nguyên. Đã so: quay lưng mặt trời thì trời y hệt trước; nhìn mặt trời thì trời xanh + đĩa trắng có quầng mềm | `client/src/art/temple/index.ts` |
| 18 | **Điện Tăng Đoàn thành điện vinh danh** (yêu cầu chiều 31/10) | ✅ Agent dựng + agent phản biện (lần 2): bỏ khám thờ, nến, bình sen, hạc–rùa, đỉnh đồng, tượng; thêm khung ảnh mạ vàng + bảng lĩnh vực + khẩu hiệu + 2 băng rôn mỗi ảnh, kệ ống quẻ trên `shrine_table`, bệ 3 cấp + Bảng Vàng "Tăng Đoàn Tu Online · Vinh danh chư Tăng" (6 lĩnh vực 2 cột), 2 trụ đèn sen trên vòng `crane`, cột son rồng vàng, trần ô sen, đèn lồng, phướn, mái 2 tầng có rồng, biển "Điện Tăng Đoàn", câu đối. 3 PointLight (24/21/12 cd). `PORTRAIT_CENTER_Y` 1,8, `PORTRAIT_HEIGHT` 1,0. Phản biện sửa: khe hở 1 cm quanh điện ở y 4,5 m, bệ kệ chìm dưới sàn. **Đã thử trong game** ở góc quỳ thật (FOV 60): thấy trọn bảng lĩnh vực + khẩu hiệu + ảnh + băng rôn | `client/src/art/temple/tangDoan.ts`, `tangDoanDecor.ts` (mới), `client/src/content/gallery.ts` |
| 19 | **Lời khuyên 6 lĩnh vực** | ✅ 291 lá: Công Danh 49, Tình Duyên 48, Tài Lộc 49, Sức Khỏe 49, Gia Đạo 48, Vận Hạn 48 — mỗi lĩnh vực chia đều chủ đề theo danh sách user gửi, mức quẻ ~7/15/12/7/7, thơ lục bát 6/8 đúng vần + thanh bằng. Mỗi lĩnh vực 1 agent viết + 1 agent phản biện (sửa: lá sức khỏe hứa khỏi bệnh, lá "Đại Cát" mặc định ai cũng sắp có con, luật dân gian tự bịa, ý trùng giữa lĩnh vực…). Công cụ kiểm (không tham số): **0 lỗi, 0 cảnh báo** | `client/src/content/fortunes/*.ts` |
| 20 | **Bóc quẻ trong game + sửa sau phản biện** | ✅ Agent soi code (chỉ báo cáo, 6 điểm) + thử trong game cả 6 ảnh (mỗi ảnh ra đúng lĩnh vực). Đã sửa: lễ chưa bóc thì **dồn lá** (tối đa 3, HUD "còn N lá"); lễ vừa thành thì bỏ dòng nhắc tạm để hiện "bấm Q" ngay; **ẩn HUD quỳ khi đang mở lá quẻ** (1280×720 hai thứ chạm nhau); HUD có nền tối mờ (trước đó chữ đè lên bảng tên vàng, khó đọc); màn thấp (≤ 640 / ≤ 520 px) thu lá quẻ 0,86 / 0,7; bỏ Enter khỏi phím cất quẻ (Enter luôn mở chat); chữ "xin lời khuyên **về** Công Danh"; bỏ chữ "khám thờ / quỳ lạy" ở chú thích server + 2 toast server ("Có người đang đảnh lễ…", "Công Đức … để lần sau, quẻ thì con cứ bóc nhé") | `client/src/activities/gallery/index.ts`, `activities.css`, `server/src/activities/gallery/index.ts` |

**Phiên 2026-10-31 chiều** (session `d8f7f5e5`): lần chạy tiếp lúc trưa lại bị ngắt vì **giới hạn tuần** ("weekly limit ·
resets 6pm") lúc 12:08 — journal cho thấy `build:audio` xong, `build:yard` hỏng sau khi ghi file, `build:hall` dừng giữa
chừng. Phiên chiều chạy workflow `wf_fd274eee-224` (4 agent, tối đa 3 cùng lúc, ~44 phút): `build:hall` →
`review:hall`, song song `review:sutra-audio` + `review:yard` — cả 4 xong, không agent nào lỗi. Sau đó orchestrator tự
kiểm trong game, sửa núi xuyên khuôn viên + GTAO/Sprite + vị trí HUD, chạy typecheck/test/build (xem bảng).

Đã kiểm lúc viết file: typecheck 3 project sạch, **164 test pass** (gồm 11 test sutra mới). Phiên 2026-10-31 sáng: đã
chạy tiếp workflow từ chỗ dừng (task `w6so2e46u`, run `wf_c425360c-c01`) với script đã sửa — bỏ agent client (đã xong),
còn 3 agent build (audio, hall, yard) + 2 agent review. Dev server được bật lại bằng Bash nền (`npm run dev` trong
`D:\AI\Tu Online`) vì `preview_start` chỉ đọc `.claude/launch.json` của thư mục phiên (fastdo-server).

## Còn mở / có thể làm tiếp (không chặn — tuỳ user)

- **Giữ chỗ "ma" khi đổi tab/thiết bị** (cả engine, không riêng sutra): `RoomManager.ts` gắn lại socket mà không gọi
  `leaveAll` → server vẫn giữ bồ đoàn, client mới không biết đang ngồi. Tự hết khi người chơi đi khỏi (tick 1 s trả chỗ).
  Cách sửa gợi ý: trong `onInteract`, nếu đã ngồi đúng bồ đoàn đó thì gửi lại `ctx.open` (nhưng test hiện tại khẳng định
  hành vi "bỏ qua" → phải sửa cả test). Tải lại trang bình thường không bị (disconnect → leaveAll).
- Trình duyệt chặn tự phát → phần tử `<audio>` vẫn `preload='auto'`, có thể tải tiếp file 57 MB khi đã đi xa (nhỏ).
- Nhạc nền synth nhỏ đi một nhịp trước khi nhạc kinh kịp phát (lúc chờ metadata) (nhỏ).
- Mỹ thuật nhỏ: đế cột/tháp đèn sen rộng hơn collider chút; chuông + mõ trước bệ không có collider; 2 vệt nắng cửa Đông
  rơi trúng hàng cột x = 16; bó vỉa Nam của sân (cao 0,14) cắt ngang trục giữa sau Chánh Điện không có collider.
- Đèn trong điện mạnh hơn hẳn Tăng Đoàn (55/40/45 cd so với 6/4,5) — ảnh chụp chưa cháy sáng, nên xem lại khi chơi thật.
- Chưa thử: Safari (chính sách tự phát), nhiều người cùng nghe một lúc (vị trí đều tính từ giờ server nên về lý thuyết khớp).
- Tượng Phật còn chỉnh được tai, mắt, cánh mũi, chuyển tiếp cổ–ngực (xem "Ghi chú").
- **Điện Tăng Đoàn** (chờ user quyết):
  - 6 `caption` trong `client/src/content/gallery.ts` đang rỗng → bảng tên, HUD và chữ ký lá quẻ đều chỉ ghi "Sư Thầy".
    Điền pháp danh/biệt danh từng người thì hiện "Sư Thầy <tên>".
  - Ai giữ lĩnh vực nào (ảnh 1→6 = Công Danh, Tình Duyên, Tài Lộc, Sức Khỏe, Gia Đạo, Vận Hạn) lấy theo thứ tự danh sách
    user gửi — đổi trong `client/src/content/fortunes/domains.ts` (bảng và lá quẻ tự theo).
  - Chưa đo số tam giác của điện (ước ~90k, tĩnh đã gộp chung cả chùa nên không tách được); trình duyệt trong app chỉ
    1–2 khung hình/giây nên chưa đánh giá được độ mượt thật.
  - Mỹ thuật nhỏ (phản biện để lại): 2 đèn chùm sen che một phần nóc điện khi nhìn từ cửa; chữ dài trên băng rôn
    (vd "Nghiệp", "Đường") bị ép hẹp; đỉnh bánh xe pháp trên bảng lĩnh vực bị dải đen trên cắt khi quỳ.

## Chạy dự án / kiểm lại

1. **Dev server** (kiểm `netstat -ano | grep -E ":(5173|3000) "`): `npm run dev` trong `D:\AI\Tu Online` (Vite :5173 +
   game server :3000). `preview_start` chỉ đọc `.claude/launch.json` của thư mục phiên, nên nếu phiên mở ở fastdo-server
   thì bật bằng Bash nền. Đừng kill process lạ.
2. Vào game: `http://localhost:5173/?auto&r=PHONG&name=Ten&slot=N` — **mã phòng đúng 4 ký tự** trong
   `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (vd `QATS`); mã sai (vd `QAMAIN`, `HALLR`) bị bỏ qua và vào phòng mặc định — tức
   phòng `CHUA` user đang chơi (user từng thấy "Host đã rời chùa" vì vậy). Khung trình duyệt của app bị ẩn thì game
   đứng (trình duyệt dừng vòng vẽ) → hiện lại bằng `mcp__ccd_view__show_pane` pane `preview`. DEV có
   `window.__tu.cam(x, y, z, yaw, pitch)` /
   `__tu.free()`. Đi bộ bằng `__tu.game.controller.glideTo(x, z)` (có va chạm; `teleport` bị server kéo về). Bồ đoàn chỉ
   nhận E khi đứng trong bán kính 0,8 m quanh tâm và nhìn về phía Bắc; `__tu.game.interaction.press()` = bấm E.
   Camera đặt ở z −36 là nằm sát tường sau Chánh Điện (thấy "dải nâu" ở đáy hình — không phải lỗi); xem điện từ sân
   thì dùng z ≈ −42,5.
3. Kiểm cuối: `npm run typecheck`, `npm test`, `npm run build`.
4. Workflow đã chạy (tham khảo prompt nếu cần làm lại phần nào): phiên chiều
   `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\d8f7f5e5-4d03-417a-8712-fc9f0e1a8680\workflows\scripts\phap-duong-finish-wf_fd274eee-224.js`;
   phiên sáng `...\ad41d191-4300-4eaf-90f4-1021c0958be6\workflows\scripts\phap-duong-build-wf_c425360c-c01.js`.

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
- Dự án **đã có git** (commit gốc `bfa8506 Feat: Base game`, remote `origin` = GitHub `Therockyy7/Tu-Online-coop`) —
  AI không tự commit/push; thay đổi của phiên 2026-10-31 chiều đang nằm ở working tree (chưa commit). Dự án được tự
  chạy npm install/test/build.
