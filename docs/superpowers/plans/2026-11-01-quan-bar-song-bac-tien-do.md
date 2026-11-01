# Tiến độ & bàn giao — Quán Bar: nhạc DJ, bàn DJ, phòng Sòng Bạc 5 trò (2026-11-01)

File này để **phiên làm việc sau đọc là chạy tiếp được**. Cập nhật mỗi khi xong một bước. Tài khoản user hay chạm
**giới hạn phiên** → workflow chạy tối đa ~3 agent cùng lúc; bị ngắt thì đọc bảng trạng thái + mục "Bị ngắt thì".

> **Từ 21:10 ngày 2026-11-01, phiên `9968c6b8` (app: "Quan bar song bắc tiến độ") là orchestrator** (user gửi ảnh phiên
> `475ba469` "Tiếp tục chạy" đã chạm giới hạn 5 giờ lúc ~20:27 và bảo "Tiếp tục việc đang giữa chừng"). Phiên `475ba469` còn
> tick "tự động tiếp tục" lúc 0:31 ngày 2026-11-02 — **nếu chính phiên `475ba469` tự chạy lại và đọc dòng này thì DỪNG, không
> sửa gì, báo user.** Trước đó: `44294fdc` chạm giới hạn 19:30; `1b13254f` user ngắt 16:18; `0978011f` user bỏ tick 15:44.
> Phiên nào đọc dòng này mà không phải `9968c6b8` thì dừng, báo user (hai phiên sẽ cùng sửa một file) — trừ khi user bảo
> rõ là chạy tiếp thay phiên này.

Song song có phiên khác đang **nâng cấp nhân vật** (xem cuối `2026-10-31-dai-phap-duong-tien-do.md`) — phiên này
**không sửa** `client/src/art/character/*`, `client/src/art/avatar.ts`, `client/src/preview/views/avatar.ts`,
`client/tests/character*.test.ts`, `vitest.config.ts`, và không sửa file bàn giao 2026-10-31 (phiên kia đang ghi).
Typecheck lỗi nằm trong các file đó thì bỏ qua (không phải của phiên này).

## Yêu cầu gốc của user (nguyên văn)

> C:\Users\LENOVO\Downloads\Nhạc DJ , Đến việc update khu Hạ sơn vào Bar thì tôi muốn thêm các bài nhạc trong thư muc
> tôi đã gửi, đồng thời Update thêm các trò chơi trong Quán Bar lấy công đức để chơi, các trò đỏ đen, may rủi, thêm
> khoảng 5 trò, như xúc xắc chẵn lẻ, bài, và các trò hấp dẫn khác. Đồng thời có thể tương tác với bàn DJ,

> (2026-11-01, sau khi trả lời 4 câu hỏi thiết kế) Tiếp tục, lưu ý nốt vào 1 File tiếng trình

> (2026-11-01 21:08, phiên `9968c6b8`, kèm ảnh phiên "Tiếp tục chạy" đã chạm giới hạn 5 giờ) Tiếp tục việc đang giữa chừng
> D:\AI\Tu Online\docs\superpowers\plans\2026-11-01-quan-bar-song-bac-tien-do.md

> (2026-11-01 ~21:30, trả lời câu hỏi R1-05 "Hũ Nổ Hũ có trả theo tỉ lệ mức cược không?") Trả theo tỉ lệ cược

## Quyết định đã chốt với user (2026-11-01)

| Câu hỏi | User chọn |
|---|---|
| 5 trò mới cược bằng gì? | **Công Đức thật**: thua trừ cả Công Đức tích lũy lẫn Đức (có thể tụt cấp, mất ghế Phương Trượng); thắng cộng cả hai (có thể thăng cấp). Bầu Cua giữ nguyên cược Xu. |
| 5 trò | **Tài Xỉu chẵn lẻ**, **Xì Dách**, **Nổ Hũ** (máy xèng, hũ chung cả phòng), **Đua Ngựa**, **Bài Cào 3 lá** |
| Ai điều khiển bàn DJ? | **Ai đứng ở bàn cũng chỉnh được**, mỗi lúc 1 người; người thắng vòng nhảy vẫn giữ danh hiệu DJ và được chiếm lại bàn |
| Đặt 5 trò ở đâu? | **Mở thêm phòng Sòng Bạc** nối tường Đông của Bar (cạnh Bầu Cua); Bar cũ giữ nguyên |
| Nổ Hũ: nổ hũ ăn cả hũ hay theo mức cược? (R1-05, hỏi lại 21:25) | **Trả theo tỉ lệ mức cược.** Chi tiết AI chốt: ăn cược / 20 × hũ (cược 1 → 5%, 5 → 25%, 10 → 50%, 20 → trọn hũ), phần nguyên Công Đức; phần còn lại ở lại hũ; hũ còn dưới mức gốc 100 thì nhà cái bù lên mức gốc (giữ phần lẻ) — cược 20 vẫn y như cũ |

User nói "Tiếp tục" → theo memory [[continue-after-core-design-approval]]: tự đi tiếp spec → plan → code, chỉ dừng khi
thiếu đầu vào thật. Chi tiết luật/số liệu do AI chốt, ghi trong spec (mục "AI tự chốt") để user xem lại.

## Dữ kiện đã đo

- Thư mục nhạc `C:\Users\LENOVO\Downloads\Nhạc DJ`: 4 file mp3, 128 kbps, 44,1 kHz stereo, **tổng 19 MB** (file lớn
  nhất 7,3 MB) → không cần nén (GitHub chỉ cảnh báo > 50 MB/file).
  - `CHÚ ĐẠI BI (VÔ LƯỢNG) - Masew, Khoi Vu.mp3` — 234,6 s
  - `CHÚ ĐẠI BI (VÔ LƯỢNG) x MASEW - TLIEM REMIX - ….mp3` — 453,3 s
  - `Chú đại bi remix - nhạc phật remix -.mp3` — 264,2 s
  - `DƯỚI TÒA SEN VÀNG HOT TIKTOK REMIX … AnhVu REMIX ….mp3` — 285,2 s
- Bầu Cua hiện cược **Xu** (`server/src/activities/barUtils/index.ts`), trừ tiền lúc đặt, hoàn khi rời/đổi map.
- Bàn DJ hiện chỉ DJ (thắng vòng nhảy) hoặc Phương Trượng mở được; 4 bài nhạc **tổng hợp** (Web Audio) có BPM cố định;
  Thi nhảy chấm theo nhịp bài DJ đang phát (`ctx.shared` `dj_track` / `dj_started_at` / `dance_until`).
- Dev server: Vite :5173 + game server :3000 đang chạy (bật bởi phiên khác) — dùng lại, không bật trùng, không kill.

## Trạng thái từng phần

| # | Phần việc | Trạng thái | File chính |
|---|---|---|---|
| 1 | Khảo sát code + chốt 4 quyết định với user | ✅ Xong | — |
| 2 | Spec thiết kế | ✅ Xong (user chưa đọc lại — "Tiếp tục" nên đi thẳng) | `docs/superpowers/specs/2026-11-01-quan-bar-song-bac-design.md` |
| 3 | Plan + **hợp đồng dùng chung** (orchestrator tự viết: ID, `SONG_BAC` + map, balance, `ctx.wager`, `StakeBook` + test, neo, `WorldControls`, `musicBands`, khung 5 module đã đăng ký, bộ UI sòng + lá bài 3D) | ✅ typecheck sạch, **217 test pass** | `docs/superpowers/plans/2026-11-01-quan-bar-song-bac-plan.md` (bảng "Hợp đồng đã viết") |
| 4 | Workflow Build — 7 làn: A phòng + hình DJ · B nhạc/bàn DJ · C Tài Xỉu · D Xì Dách · E Bài Cào · F Nổ Hũ · G Đua Ngựa | ✅ **7/7 xong** (lần 1: C; lần 2: A B D; lần 3: E F G). tsc sạch, **380 test / 33 file**, không còn "BẢN TẠM" | xem "Nhật ký" |
| 5 | Thử trong trình duyệt (trước phản biện) | ✅ 6 phần chạy đúng; 2 lỗi hình ghi ở Nhật ký 16:09–16:18 + 18:42 | — |
| 6 | Workflow phản biện + sửa | ⏳ phản biện ✅ (phiên `44294fdc`) · sửa ✅ 3 nhóm (phiên `475ba469`) · soi lại + sửa nốt ⏳ phiên `9968c6b8` | xem "Nhật ký" |
| 7 | Kiểm cuối: typecheck / test / build + thử lại trong trình duyệt | ⬜ | — |

## Bị ngắt thì

Đọc bảng trên + mục "Nhật ký" bên dưới (ghi run id / script / journal của mỗi workflow), chỉ chạy phần còn thiếu.
- Mỗi làn ghi nhật ký ngắn ở `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\1b13254f-929e-4a81-a63f-33a31432b627\scratchpad\lanes\<làn>.md`
  (từ lần chạy 3; bản lần 2 ở scratchpad phiên `0978011f`, bản lần 1 ở phiên `2cc30cdf` — đều đã chép sang). Báo cáo đủ của
  làn A B C D (đầu vào cho workflow phản biện): `…\1b13254f-…\scratchpad\build-reports-ABCD.json`.
- File khung 5 trò (`server|client/src/activities/<trò>/index.ts`) dòng đầu còn **"BẢN TẠM"** = làn đó chưa làm xong.
  DJ: `client/src/audio/index.ts` còn chú thích "BẢN TẠM" ở `musicBands` = làn B chưa cài phổ nhạc.
- Cùng phiên: `Workflow({ scriptPath, resumeFromRunId })`; khác phiên: chép prompt từ script, chỉ chạy làn còn thiếu.

## Nhật ký

- 2026-11-01 ~12:15 — phiên `2cc30cdf` (side session của phiên nâng cấp nhân vật): khảo sát xong, user chốt 4 quyết định.
- 2026-11-01 ~12:45 — orchestrator viết xong spec + plan + hợp đồng dùng chung (typecheck sạch, 217 test pass).
- 2026-11-01 ~12:55 — **Workflow Build** run `wf_f7062cde-9dd` (task `wjfcz5qqx`), 7 làn A–G, tối đa 3 agent cùng lúc. Script:
  `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\2cc30cdf-4d49-4d05-b400-baf8508a1a98\workflows\scripts\tu-online-quan-bar-song-bac-build-wf_f7062cde-9dd.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\2cc30cdf-4d49-4d05-b400-baf8508a1a98\subagents\workflows\wf_f7062cde-9dd\journal.jsonl`.
  Thứ tự chạy: A phòng, B DJ, C Tài Xỉu trước; D Xì Dách, E Bài Cào, F Nổ Hũ, G Đua Ngựa vào khi có chỗ trống.
- 2026-11-01 ~13:15 — **chạm giới hạn 5 giờ**, mọi agent chết. Kết quả lần 1 (đối chiếu journal + nhật ký làn + file thật):
  - **C Tài Xỉu XONG** (shared 11 + server 8 test xanh, tsc sạch; báo cáo đủ trong journal lần 1).
  - A dở: viết `casinoKit.ts`, `casinoShell.ts`, `casino.ts`, `casinoTables.ts` (Tài Xỉu + Bài Cào); còn thiếu `buildXiDach`,
    `casinoRace.ts`, `casinoSlots.ts`, sửa `bar/index.ts` (khoét tường Đông, gộp phòng) + 5 điều khiển DJ.
  - B dở: B1 mp3, B2 đo BPM (bảng số trong nhật ký làn B), B3 `shared/src/activities/dj.ts`, server DJ mới 11 test xanh; còn test cũ
    DJ/Thi nhảy đỏ, `dance/index.ts`, âm thanh `musicBands`, client DJ, `mixology` canh phách.
  - D, E, F, G chưa viết gì (D mới đọc tài liệu).
  - Workflow phản biện + sửa đã soạn sẵn ở scratchpad phiên cũ: `…\2cc30cdf-…\scratchpad\w2-review-fix.js`.
- 2026-11-01 13:40 — phiên mới `0978011f` chạy tiếp. Mốc trước khi chạy: tsc shared sạch; server 1 lỗi (`dance/index.ts:85`, làn B);
  client 4 lỗi (DJ làn B, `casino.ts`/`casinoTables.ts` làn A); test 254 pass / 2 đỏ (DJ — làn B).
- 2026-11-01 ~13:50 — **Workflow Build lần 2** run `wf_7610c6b2-7dd` (task `whwltu298`), 6 làn A·B (nốt) + D·E·F·G, tối đa 3 agent.
  Script: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\0978011f-163c-4deb-81c8-dfb15883db16\workflows\scripts\tu-online-song-bac-build-2-wf_7610c6b2-7dd.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\0978011f-163c-4deb-81c8-dfb15883db16\subagents\workflows\wf_7610c6b2-7dd\journal.jsonl`.
  Prompt mỗi làn có sẵn phần "lần trước đã làm / còn phải làm" + dặn đọc nhật ký làn trước khi viết → chạy lại an toàn.
- 2026-11-01 ~14:26 — lần 2 **chạm giới hạn 5 giờ** lần nữa. Kết quả (journal + file thật):
  - **A XONG** (`casinoXiDach.ts`, `casinoRace.ts`, `casinoSlots.ts`, khoét cửa tường Đông, gộp phòng, 5 điều khiển DJ; 809 mesh →
    46 draw call; `maps.test` 15/15; tsc client sạch).
  - **B XONG** (Thi nhảy theo `dj_bpm`/`dj_beat0`, `musicBands` FFT 2048 · 20 dải, nhạc thu sẵn bám giờ server, bảng DJ + phím,
    `djTracks.ts`; 109 test hẹp xanh; tsc sạch). BPM đo: Masew 95,0 · TLiem 138,0 · Remix 128,0 · Tòa Sen 142,0.
  - **D XONG** (39 test, tsc sạch) — **lệch spec, chờ user duyệt**: xem mục "AI tự chốt — chờ user xem lại".
  - E, F, G: chưa viết file nào (2 file khung BẢN TẠM còn nguyên).
- 2026-11-01 15:30 — phiên mới `1b13254f` chạy tiếp. Mốc: tsc shared/server/client **sạch**, **308 test pass / 25 file**.
  Dev server (:3000 / :5173) **không chạy**.
- 2026-11-01 ~15:40 — **Workflow Build lần 3** run `wf_f05900d8-1e7` (task `wl9vl9ht7`), 3 làn E · F · G song song. Script:
  `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\1b13254f-929e-4a81-a63f-33a31432b627\workflows\scripts\tu-online-song-bac-build-3-wf_f05900d8-1e7.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\1b13254f-929e-4a81-a63f-33a31432b627\subagents\workflows\wf_f05900d8-1e7\journal.jsonl`.
  Bước sau: thử A B C D trong trình duyệt trong lúc chờ → workflow phản biện + sửa (`…\1b13254f-…\scratchpad\w2-review-fix.js`,
  args `{ build: <7 báo cáo>, visual: [...] }`) → kiểm cuối.
- 2026-11-01 ~16:07 — **Build lần 3 xong** E Bài Cào · F Nổ Hũ · G Đua Ngựa. Báo cáo đủ 7 làn (đầu vào phản biện):
  `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\1b13254f-929e-4a81-a63f-33a31432b627\scratchpad\build-reports-all.json`.
  tsc 3 project sạch, **380 test pass / 33 file**.
- 2026-11-01 16:09–16:18 — thử trong trình duyệt (phòng thử QBAR, hồ sơ "Tester" được cấp 600 Công Đức, server dev của user cổng
  5174): nhạc thu sẵn tự phát khi vào Bar; bàn DJ đổi bài/khói/đèn/pháo giấy chạy, Esc nhả bàn; Tài Xỉu, Xì Dách (lá tẩy úp tới lúc
  lật, phím T dằn), Bài Cào (lá rơi đúng ô), Nổ Hũ (giữ phần lẻ hũ, rời máy), Đua Ngựa (tỉ lệ khớp công thức, bảng LED xếp hạng trực
  tiếp, trả 25 cho cược 10 ×2,5) đều đúng. **Lỗi hình:** ngồi máy Nổ Hũ thì cả khung nhìn bị chói trắng. 16:18 user ngắt phiên.
- 2026-11-01 18:42 — phiên mới `44294fdc` chạy tiếp (dev server không còn chạy). Xem ảnh cửa thông chụp từ phía Bar: biển neon +
  nhìn xuyên vào Sòng đúng; **lỗi hình:** nhãn tên NPC "Nhà cái" (và tên người chơi trong Sòng) lộ xuyên tường khi đứng ở Bar.
  Mốc trước phản biện: tsc 3 project sạch, **380 test pass / 33 file**.
- 2026-11-01 ~18:55 — **Workflow phản biện + sửa** run `wf_0de445c1-6bc` (task `wpng6t5z0`): 3 phản biện song song (R1 server/kinh tế ·
  R2 client 5 trò · R3 DJ/âm thanh/phòng/nhãn) → 3 nhóm sửa song song theo file rời nhau (F-server · F-client · F-djart).
  Giao thẳng cho nhóm sửa 5 việc đã chốt: K1 Xì Dách rời phòng sau chia = mất cược · K2 `StakeBook.settle` ghi đúng dòng người đã rời ·
  K3 va chạm bàn Xì Dách ôm sát nửa elip · K4 nhạc DJ tổng hợp nhỏ 55% trong Sòng + `follow` trong `RecordedOptions` · K5 chú thích
  `handleChipKey`; và 2 lỗi hình V1 (chói trắng khi ngồi Nổ Hũ) · V2 (nhãn lộ xuyên tường).
  Script: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\44294fdc-31d9-471b-b088-4d6649a533c1\workflows\scripts\tu-online-song-bac-review-fix-2-wf_0de445c1-6bc.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\44294fdc-31d9-471b-b088-4d6649a533c1\subagents\workflows\wf_0de445c1-6bc\journal.jsonl`.
  Nhật ký từng nhóm sửa: `C:\Users\LENOVO\AppData\Local\Temp\claude\C--Users-LENOVO--claude-spares-spare-kUEkmk\44294fdc-31d9-471b-b088-4d6649a533c1\scratchpad\lanes\fix-<nhóm>.md`.
  Bị ngắt giữa chừng: cùng phiên thì `Workflow({ scriptPath, resumeFromRunId })`; khác phiên thì đọc journal (phản biện đã xong trả
  về findings) + nhật ký nhóm sửa, chỉ chạy phần còn thiếu.
- 2026-11-01 19:30 — phiên `44294fdc` **chạm giới hạn phiên** (mở lại 23:40), workflow chết giữa pha Sửa. Đối chiếu journal + transcript
  từng agent + `git diff` (việc Build đã `git add` nên `git diff` chưa stage = đúng phần của pha Sửa):
  - **3 phản biện XONG**: R1 server/kinh tế 9 mục (1 high R1-01 Xì Dách người chơi giỏi có lợi thế dương), R2 client 8 mục, R3
    DJ/phòng/nhãn 8 mục. Bản chép đủ findings (đọc được, tiếng Việt): `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\475ba469-a0aa-481a-9d37-7b1562dafee0\scratchpad\journal-dump.txt`.
  - **F-server chưa sửa file nào** (đang dò vị trí hình tròn va chạm K3 bằng script `…\44294fdc-…\scratchpad\k3\opt.js`).
  - **F-client chưa sửa file nào** (mới đọc code, có script đo độ chói `…\44294fdc-…\scratchpad\v1\*.mjs`).
  - **F-djart sửa dở V2** (nhãn che khuất: `client/src/art/api.ts` `labelOccluded`, `client/src/art/bar/index.ts`,
    `client/src/engine/{Players,Fx,Game}.ts`); test nháp `…\44294fdc-…\scratchpad\djart-check\djart-occluder.test.ts` 1/2 đỏ (phần Players).
  - Mốc lúc nhận lại (19:35): tsc 3 project sạch, **380 test pass / 33 file** (gồm cả phần V2 sửa dở).
- 2026-11-01 ~19:45 — **Workflow chạy tiếp pha Sửa** run `wf_c1089fa4-93c` (task `wl2qhinvf`), phiên `475ba469`: pipeline 3 nhóm
  F-server · F-client · F-djart (file rời nhau) → mỗi nhóm 1 agent soi lại `git diff` của nhóm → sửa nốt nếu có lỗi thật (≤ 9 agent,
  tối đa 3 cùng lúc). Danh sách mục từng nhóm (đủ detail + fix): `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\475ba469-a0aa-481a-9d37-7b1562dafee0\scratchpad\fix\items-<nhóm>.json`;
  nhật ký nhóm: `…\475ba469-…\scratchpad\lanes\fix-<nhóm>.md`. Script:
  `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\475ba469-a0aa-481a-9d37-7b1562dafee0\workflows\scripts\tu-online-song-bac-fix-resume-wf_c1089fa4-93c.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\475ba469-a0aa-481a-9d37-7b1562dafee0\subagents\workflows\wf_c1089fa4-93c\journal.jsonl`.
  Orchestrator chốt (giao cho nhóm sửa): **R1-01** Ngũ Linh lãi ×2 → ×1 + test hồi quy chiến lược S2 (lợi thế nhà cái ≥ 1%);
  **R1-02** Nổ Hũ không chặn đổi map nữa (chốt lượt đang quay lúc đổi map); **R1-03** chỉ báo "Thăng cấp" khi vượt đỉnh cũ, chat tụt
  cấp ≤ 1 lần/60 s, báo đổi ghế Phương Trượng không lặp trong 30 s; **R1-04** Hạ Sơn không gán DJ cho Phương Trượng; **R1-05 để user
  quyết** (không sửa); R1-06 giữ làm tròn xuống; pháo giấy DJ bắn ở sàn nhảy (phần server của DJ-FX-SONG chuyển sang F-server).
- 2026-11-01 ~20:27 — phiên `475ba469` **chạm giới hạn 5 giờ** (mở lại 0:30 ngày 2026-11-02). Đối chiếu journal `wf_c1089fa4-93c` +
  `git diff`: **pha Sửa XONG cả 3 nhóm** (F-client 20:15 · F-djart 20:16 · F-server 20:20); **3 agent soi lại chết giữa chừng** (chỉ đọc,
  không để lại gì trong repo). Báo cáo pha Sửa tách ra `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\9968c6b8-7331-4005-a01d-e831fb2c9360\scratchpad\fix-reports\<nhóm>.json`;
  nhật ký từng mục ở `…\475ba469-…\scratchpad\lanes\fix-<nhóm>.md`. Tóm tắt:
  - F-server: R1-01 Ngũ Linh ×2 → ×1 (+ test chiến lược S2 200k ván và expectimax chơi tối ưu, cả hai ≥ 1%), K1 + R1-07, K2, K3 (va chạm
    bàn Xì Dách = 1 hộp dải cạnh thẳng + 3 hình tròn, lệch mép elip ≤ 0,07 m), R1-02, R1-03, R1-04, R1-08 (đổi màu đèn cách ≥ 800 ms),
    R1-09 (3 test tích hợp), pháo giấy DJ bắn ở sàn nhảy, R1-06 chỉ ghi chú thích. Hằng mới trong `balance.ts`: `HOST.swapQuietMs` 30 000,
    `CASINO.demoteChatCooldownMs` 60 000, `DJ.themeCooldownMs` 800.
  - F-client: V1 (cuộn Nổ Hũ dịu dần khi camera lại gần 1,2–3 m + bóng đèn cột 2,3 → 1,4), C1 (bỏ qua Ctrl/Alt/Meta, nhận Numpad1–4),
    C2 (chỉ tự mở bảng khi không có modal và bàn đó gần nhất — file mới `casino/autoOpen.ts`), C3 (góc nhìn ngồi máy −0,12), C4 (ngựa
    quay đầu trước cổng rồi lùi vào chuồng), C5 (`pressGuard` giữ cú bấm khi bảng dựng lại), C6, C7 (`1:1`), C8 (`bk-`), K5.
  - F-djart: V2 (nhãn tên / chữ bay bị tường Bar↔Sòng che, nhãn NPC mờ 18→30 m chỉ ở Bar), K4 (`setBeatLevel`, `follow`), đèn chớp
    ≤ 2,5 lần/giây + giảm tương phản, DJ trong Sòng không rung / không chớp trắng / nhỏ tiếng, LOW_TAGS bàn sòng, mặt tường Tây Sòng về
    x 23,0, khói CO2 sát ống kính, pha chế khi nhạc DJ dừng.
  - Bỏ ngỏ: R1-05 (chờ user), 4 vòi khói trước bàn DJ không có va chạm (cần `shared/src/maps/bar.ts`), R1-06 / R1-08 phần client (tùy chọn).
- 2026-11-01 21:10 — phiên mới `9968c6b8` nhận làm orchestrator. Mốc: tsc 3 project sạch, **413 test pass / 36 file**; 6 file F-server
  từng bị tạm thay để kiểm đỏ/xanh đã khớp bản sửa (so với `…\475ba469-…\scratchpad\redcheck\*.new.ts`).
- 2026-11-01 ~21:17 — **Workflow soi lại + sửa nốt** run `wf_9eeb16b1-0dc` (task `wo1qw5201`), phiên `9968c6b8`: 4 agent chỉ đọc
  (verify-cross soi tương tác giữa các nhóm: va chạm Xì Dách mới ↔ art/camera, ghế người đã rời ↔ client, djPid null ↔ bảng DJ,
  Ngũ Linh ×1 ↔ chữ client, Nổ Hũ đổi map, `setBeatLevel`, occluder ↔ collider tường… · verify-F-server · verify-F-client ·
  verify-F-djart) → nhóm nào có lỗi thật thì sửa nốt (file rời nhau) → nhóm sửa nốt mục high/medium thì 1 agent soi lại; tối đa 3 agent
  cùng lúc. Script: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\9968c6b8-7331-4005-a01d-e831fb2c9360\workflows\scripts\tu-online-song-bac-verify-resume-wf_9eeb16b1-0dc.js`;
  journal: `C:\Users\LENOVO\.claude\projects\D--FastDo-fastdo-server\9968c6b8-7331-4005-a01d-e831fb2c9360\subagents\workflows\wf_9eeb16b1-0dc\journal.jsonl`.
  Nhật ký sửa nốt: `C:\Users\LENOVO\AppData\Local\Temp\claude\D--FastDo-fastdo-server\9968c6b8-7331-4005-a01d-e831fb2c9360\scratchpad\lanes\refix-<nhóm>.md`.
  Bị ngắt: cùng phiên thì `Workflow({ scriptPath, resumeFromRunId })`; khác phiên thì đọc journal (kết quả soi lại) + nhật ký sửa nốt,
  chỉ chạy phần còn thiếu. Sau workflow: orchestrator soát diff, thêm va chạm 4 vòi khói (nếu không chặn đường tới bàn DJ), typecheck /
  toàn bộ test / build, xem bằng mắt V1 + V2, cập nhật file này.

## AI tự chốt — chờ user xem lại

| Trò | Spec gốc | Đã đổi thành | Lý do (số đo) |
|---|---|---|---|
| Xì Dách | Nhà cái rút tới 16 rồi dừng, so tất cả | **Nhà cái "xét dần"**: đủ 16 thì chốt ngay các ghế thua/hòa (kể cả người Quắc), còn ghế hơn điểm thì rút tiếp (tối đa 5 lá) — giống cách "xét bài" ngoài đời | Giữ đúng spec thì nhà cái **lỗ 6,9%** (Công Đức sinh ra từ không khí). Luật mới: nhà cái lời 2,65% (người dằn ở 16), ~0,7% (dằn ở 17), ~0% (người chơi giỏi nhìn lá ngửa). Hệ quả: người Quắc bị xét trước thì thua dù sau đó nhà cái Quắc |
| Bài Cào | Bằng nút so lá lớn nhất, vẫn bằng thì nhà cái ăn | Thêm **"bù gặp bù (cùng 0 nút) → nhà cái ăn"**, giữ Ba Tiên ăn đôi | Spec gốc chỉ lời 0,08% (dưới mức 0,5–4% plan đặt). Luật mới: 0,93% |
| Xì Dách · Bài Cào · Đua Ngựa | Rời phòng trước lúc trả → hoàn cược (như Bầu Cua) | Từ lúc **bài đã chia / ngựa đã xuất phát** mà rời hẳn phòng → **mất cược** (mất kết nối thì vẫn giữ và trả) | Lúc đó kết quả đã lộ trong dữ liệu gửi xuống máy → ai thấy bài xấu bấm rời phòng là được hoàn = gian lận. Xì Dách sửa ở bước phản biện |
