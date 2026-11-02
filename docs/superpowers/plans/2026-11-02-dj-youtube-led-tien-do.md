# Tiến độ & bàn giao — Bàn DJ: dán link YouTube + màn hình LED + hàng chờ (2026-11-02)

File này để **phiên làm việc sau đọc là chạy tiếp được**. Cập nhật mỗi khi xong một bước. Tài khoản user hay chạm
giới hạn phiên → workflow chạy tối đa ~3 agent cùng lúc; bị ngắt thì đọc bảng trạng thái + "Nhật ký".

- Spec: `docs/superpowers/specs/2026-11-02-dj-youtube-led-design.md`
- Plan: `docs/superpowers/plans/2026-11-02-dj-youtube-led-plan.md`
- Orchestrator: phiên Claude Code `9ab9eb11-45ee-43d9-b3dd-064ebcf1e601` (cwd `D:\FastDo\fastdo-server`, sửa repo
  `D:\AI\Tu Online`) — nhận bàn giao 2026-11-02 ~09:45 từ phiên `76acb309-63c0-4af7-9004-497737dd6686` (dừng vì giới
  hạn phiên sau bước 6). Phiên khác đọc dòng này mà phiên đó vẫn đang chạy → dừng, báo user (hai phiên sẽ cùng sửa file).
- Quy ước repo này: được tự chạy `npm test` / `npm run typecheck` / `npm run build`; **không tự commit** (user tự commit).

## Yêu cầu gốc của user (nguyên văn)

> Hiện tại trong quán Bar tôi muốn Update có thể kết nối link Youtube vào để bật nhạc trực tiếp luôn, vẫn giữ các bài
> nhạc có sẵn đó nhưng thêm option dán link youtube

> (2026-11-02, trả lời 4 câu hỏi thiết kế) Hiện video thế nào: "tôi muốn quán bar update thêm 1 màng hình led bật link
> Youtube thì hiển thị lên luôn" · Thi nhảy: "Tự chuyển về nhạc có sẵn (Recommended)" · Hết video: "Về danh sách có sẵn
> (Recommended)" · Dán link mới khi đang có bài: "Xếp hàng chờ"

> (2026-11-02, sau khi xem thiết kế đầy đủ — màn hình phương án A tường sân khấu Bắc) Duyệt, làm tiếp

## Trạng thái từng phần

| # | Phần việc | Trạng thái | File chính |
|---|---|---|---|
| 1 | Khảo sát (5 agent) + kiểm khả thi CSS3D (3 agent) + chốt 4 quyết định | ✅ Xong | báo cáo ở scratchpad phiên (`understand-*.md`, `feasibility-*.md`) |
| 2 | Spec | ✅ Xong | spec ở trên |
| 3 | Hợp đồng dùng chung (orchestrator tự viết) | ✅ shared typecheck sạch; parser thử 18 link | `shared/src/activities/youtube.ts`, `dj.ts` (kiểu YouTube), `config/balance.ts` (`DJ.youtube`), `util/names.ts` (`sanitizeTitle`), `maps/bar.ts` (`BAR_SCREEN`), `client/src/art/api.ts` (`setVideoScreen`, neo `video_screen`), `client/src/engine/worldApi.ts` (`Css3dLayer`, `world.css3d`) |
| 4 | Plan | ✅ Xong | plan ở trên |
| 5 | Workflow Build — 3 làn: S server · R màn hình 3D + renderer · C bàn DJ client | ✅ Xong (run `wf_88710619-ade`) | báo cáo làn: scratchpad phiên cũ `build-report-<S\|R\|C>.json`, `lanes\<S\|R\|C>.md` |
| 6 | Typecheck / toàn bộ test / build | ✅ typecheck sạch, 547/547 test (42 file), build OK | — |
| 7 | Thử trong trình duyệt (2 tab) | ✅ Xong — xem "Nhật ký" 2026-11-02 ~10:10 | — |
| 8 | Workflow phản biện + sửa | ⏳ đang làm | — |
| 9 | Kiểm cuối + cập nhật file này + báo cáo user | ⬜ | — |

Typecheck sau bước 3 (lỗi CHỜ làn sửa, đúng dự kiến): `server/src/activities/dj/index.ts` thiếu `yt`/`ytQueue` (làn S);
`client/src/engine/Game.ts` thiếu `world.css3d` (làn R); fixture `client/tests/djartPanel.test.ts`, `djMusic.test.ts`
thiếu `yt`/`ytQueue` (làn C).

## Bị ngắt thì

Đọc bảng trên + "Nhật ký" (ghi run id / script / journal của mỗi workflow), chỉ chạy phần còn thiếu. Cùng phiên:
`Workflow({ scriptPath, resumeFromRunId })`; khác phiên: chép prompt làn từ script, chỉ chạy làn chưa xong (xem nhật ký làn
ở scratchpad + `git status` / `git diff` của repo).

## Nhật ký

- 2026-11-02 ~08:45 — Hợp đồng dùng chung xong (bảng mục 3). Spec viết xong.
- 2026-11-02 ~09:00 — Plan xong. **Workflow Build** run `wf_88710619-ade` (task `wuhqy041a`), 3 agent song song (làn S, R,
  C). Script: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\76acb309-63c0-4af7-9004-497737dd6686\workflows\scripts\tu-online-dj-youtube-build-wf_88710619-ade.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\76acb309-63c0-4af7-9004-497737dd6686\subagents\workflows\wf_88710619-ade\journal.jsonl`.
  Nhật ký từng làn: `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\76acb309-63c0-4af7-9004-497737dd6686\scratchpad\lanes\<S|R|C>.md`.
- 2026-11-02 ~09:40 — Cả 3 làn xong (S 398 test làn, R 113, C 137). Orchestrator kiểm: `npm run typecheck` sạch,
  `npm test` 547/547 (42 file), `npm run build` OK (cảnh báo file JS lớn có từ trước). Phiên `76acb309` dừng vì giới
  hạn phiên; phiên `9ab9eb11` nhận tiếp (chạy lại typecheck + 547 test: xanh).
- 2026-11-02 ~10:10 — **Thử trình duyệt** (trình duyệt trong app, `npm run dev` bật nền, phòng `QATS`, tab DJ1 `slot=1`
  đứng bàn + tab Khach2 `slot=2`). Đạt hết: màn hình idle hiện logo; dán link → oEmbed lấy đúng tên/kênh, chat "🎬 …
  phát YouTube", máy khách báo thời lượng; 2 tab cùng phát, lệch so với giờ server −0,26 / −1,39 s (sau đó −0,63,
  −0,74); hàng chờ #1 #2 (`&t=30` → `startMs` 30000); dán trùng → toast, link sai → báo tại ô, video không tồn tại →
  toast "Không tìm thấy video"; ▶ phát ngay; video hết → "▶️ Tiếp theo" phát video kế đúng giây 30; ⏸ ▶ khớp giờ
  server; ✕ xoá; ⏭ khi hàng chờ trống → bài thu sẵn kế, màn hình về idle; **Thi nhảy chen ngang** → video về đầu hàng
  (vị trí 148,04 s) + bài thu sẵn 128 BPM + chat 💃 → dán trong vòng vẫn xếp hàng, ▶ ⏮ ⏭ có class `locked` → hết vòng
  ~1 s → "▶️ Nhảy xong — phát tiếp" đúng 148,04 s; người đứng trước che video, nhãn tên vẫn trên; đồ họa thấp (không
  hậu kỳ) lỗ vẫn đúng; đổi map → server xoá video + hàng chờ, trình phát hủy (0 iframe), cảnh CSS3D trống. Console 2
  tab không lỗi; log server không lỗi (chỉ cảnh báo shader ANGLE có từ trước). Chưa thử được: video bị chặn nhúng
  (101/150 — không tìm được video mẫu, có test giả), trình duyệt chặn tự phát tiếng (trình duyệt app cho phát),
  livestream, âm lượng trong Sòng. Ghi nhận nhỏ: đổi chất lượng đồ họa lúc đang ở Bar thì khung iframe giữ cỡ cũ tới
  lần vào Bar sau (`ytPixelSize` chọn lúc tạo trình phát).
- 2026-11-02 ~10:15 — **Workflow phản biện** run `wf_5cf3b5a4-29b` (task `whsmu9bz1`): 3 góc (server · player · renderer),
  mỗi phát hiện mức vừa trở lên (tối đa 4/góc) có 1 agent cố bác bỏ; tối đa 3 agent cùng lúc; chỉ đọc code + test thăm
  dò tạm (`_review_*` / `_verify_*`, tự xoá). Script:
  `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\9ab9eb11-45ee-43d9-b3dd-064ebcf1e601\workflows\scripts\tu-online-dj-youtube-review-wf_5cf3b5a4-29b.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\9ab9eb11-45ee-43d9-b3dd-064ebcf1e601\subagents\workflows\wf_5cf3b5a4-29b\journal.jsonl`.
