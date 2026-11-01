# Quán Bar mở rộng — nhạc DJ thu sẵn, bàn DJ mở, phòng Sòng Công Đức 5 trò (2026-11-01)

> Bổ sung cho `2026-10-30-tu-online-design.md` (mục 6.2, 8). Trạng thái: **4 quyết định chính do user chốt**
> 2026-11-01 (bảng dưới); chi tiết luật/số liệu do AI chốt, đánh dấu **[Chốt]** và gom ở mục 9.
> Tiến độ + bàn giao: `docs/superpowers/plans/2026-11-01-quan-bar-song-bac-tien-do.md`.

## 0. Quyết định của user

| Chủ đề | Quyết định |
|---|---|
| Tiền cược 5 trò mới | **Công Đức thật** — thua trừ cả Công Đức tích lũy lẫn Đức (có thể tụt cấp, mất ghế Phương Trượng); thắng cộng cả hai (có thể thăng cấp). Bầu Cua giữ cược Xu. |
| 5 trò | **Tài Xỉu chẵn lẻ**, **Xì Dách**, **Bài Cào 3 lá**, **Nổ Hũ** (máy xèng, hũ chung cả phòng), **Đua Ngựa** |
| Bàn DJ | **Ai đứng ở bàn cũng chỉnh được**, mỗi lúc 1 người; người thắng vòng nhảy giữ danh hiệu DJ và được chiếm lại bàn |
| Chỗ đặt | **Phòng Sòng Bạc mới** nối tường Đông của Bar (cạnh Bầu Cua); Bar cũ giữ nguyên |

Yêu cầu gốc (nguyên văn): *"…thêm các bài nhạc trong thư muc tôi đã gửi, đồng thời Update thêm các trò chơi trong Quán
Bar lấy công đức để chơi, các trò đỏ đen, may rủi, thêm khoảng 5 trò, như xúc xắc chẵn lẻ, bài, và các trò hấp dẫn khác.
Đồng thời có thể tương tác với bàn DJ,"*

## 1. Kinh tế: cược bằng Công Đức thật

Thiết kế gốc tách Công Đức tích lũy (xếp cấp, không tiêu) khỏi Đức (để tiêu). User chọn cho 5 trò mới cược thẳng bằng
Công Đức — đây là **ngoại lệ có chủ đích** với mục 4 và mục 15.3 của thiết kế gốc.

- **Đặt cược** `ctx.wager(pid, n)`: cần **Đức khả dụng ≥ n** **[Chốt]** (Đức ≤ Công Đức luôn đúng, nên đủ Đức là đủ
  Công Đức). Trừ cùng lúc **cả Công Đức lẫn Đức** đúng n, không nhân hệ số, không vào Quỹ, không hiện số bay (đặt phỉnh
  liên tục không rối mắt). Tụt cấp → toast riêng + tin chat "📉 X tụt xuống <cấp> vì đỏ đen!"; mất ghế Phương Trượng thì
  dùng thông báo đổi Phương Trượng sẵn có. Không đủ Đức → toast "Cần đủ Đức để đặt (đang có X)".
- **Thắng**: trả (tiền cược + tiền lãi) bằng `ctx.reward(pid, n, { raw: true, noPool: true, label })` — cộng cả Công Đức
  lẫn Đức, số bay "+N · <tên trò>", có thể thăng cấp (banner sẵn có), cập nhật Công Đức đỉnh.
- **Hòa / hoàn cược** (rời bàn lúc đang đặt, đổi map, ván bị hủy): trả đúng tiền đã cược, im lặng (`silent`).
- **Tạp Niệm**: +2 mỗi ván có cược ở 4 bàn; Nổ Hũ +1 mỗi lượt quay **[Chốt]**.
- **Phỉnh** 1 · 5 · 10 · 50; tối đa **100 Công Đức / người / ván / bàn**; Nổ Hũ mức cược 1 · 5 · 10 · 20 / lượt **[Chốt]**.
- Rời phòng / mất kết nối / đổi map giữ đúng ngữ nghĩa Bầu Cua: đang đặt cược → hoàn; đã chốt (đang lắc/chia/đua) và chỉ
  mất kết nối tạm → giữ cược, trả thưởng như thường; rời hẳn khi đã chốt → hoàn cược.
- Bàn đang có ván có cược → `isBusy()` (chặn Hồi Sơn như Bầu Cua).
- Lợi thế nhà cái mục tiêu **[Chốt]**: Tài Xỉu 2,78%; Xì Dách 1–6%; Bài Cào 0,5–4%; Nổ Hũ trả lại 93–96% (gồm phần góp
  hũ); Đua Ngựa ~7%. Mỗi con số được **test tính chính xác hoặc mô phỏng** (seed cố định), lệch khỏi khoảng thì chỉnh
  tham số trong `balance.ts`.

## 2. Phòng Sòng Công Đức (map `bar`)

Hệ trục như map Bar (X Đông, Z Nam, mét). Bar cũ: lòng phòng x −22..22, z −16..16. **Phòng mới** lòng phòng
**x 23..40, z −8..16**, cửa thông ở tường Đông của Bar **z 3,5..6,5** (rộng 3 m), ngay phía Bắc bàn Bầu Cua.

```text
z=-8 ┌──────────────────────── tường Bắc ────────────────────────┐
     │ [══════ ĐƯỜNG ĐUA NGỰA 14×3 m, x 24,5–38,5, z −7,7..−4,7 ══]│  bảng LED trên tường
     │       rail_1 (27,5;−3,2)              rail_2 (35,5;−3,2)    │
     │   [TÀI XỈU (27;1,8) 3,2×1,8]     [XÌ DÁCH (35;1,6) bán nguyệt]│
cửa  ║ ═════════════ thảm đỏ lối giữa z 3,5–6,5 ═══════════════════│  neon "SÒNG CÔNG ĐỨC" tường Đông
     │   [BÀI CÀO (27;9,4) 3,2×1,8]       ( HŨ CÔNG ĐỨC (35,5;9,8) ) │
     │                       [NH1][NH2][NH3][NH4] x 32/34/36/38      │  máy xèng sát tường Nam
z=16 └──────────────────────── tường Nam ──────────────────────────┘
    x=23                                                        x=40
```

- Vật cản: tường Đông Bar tách 2 đoạn chừa cửa; tường mới Bắc (z −8,5), Đông (x 40,5), Nam (z 16,5) dày 1 m; bàn, đường
  đua, 4 máy xèng, bệ hũ. Biên người chơi `maxX` 39,5. Vùng `casino` (hộp tâm (31,5; 4), 17 × 24).
- Trạm: `taixiu_table`, `xidach_table`, `baicao_table` (khu vực, r 3), `race_rail_1/2` (khu vực, r 3),
  `slot_machine_1..4` (cá nhân, r 1, đứng ở z 14 nhìn về Nam).
- Hình: thảm đỏ hoa văn, tường ốp gỗ tối + viền vàng, 3–4 đèn chùm pha lê (phát sáng tự thân), **thêm tối đa 2
  PointLight**, nhà cái NPC ở 3 bàn bài/xúc xắc, biển "Cờ bạc là bác thằng bần — Công Đức đi dễ khó về" ở cửa. Mọi model
  dựng bằng code (không asset ngoài), tĩnh thì gộp lưới (`kit.mergeStatic`).
- Điểm neo (mini-game đặt đồ động): `taixiu_table_top`, `xidach_table_top`, `xidach_seat:1..5`, `xidach_dealer`,
  `baicao_table_top`, `baicao_seat:1..6`, `baicao_dealer`, `race_track` (gốc ở vạch xuất phát làn 1, +X dọc đường
  đua, +Z sang làn kế), `race_board` (bảng LED), `slot_reels:slot_machine_N` (tâm ô kính 3 cuộn, nhìn về −Z),
  `slot_lever:slot_machine_N`, `jackpot_display` (mặt bảng số trên bệ hũ).

## 3. Năm trò (server quyết định, ngẫu nhiên bằng RNG phòng seed crypto)

Chung cho 4 bàn theo ván (Tài Xỉu, Xì Dách, Bài Cào, Đua Ngựa): bấm **E** ở bàn → mở bảng; bàn đang nghỉ thì mở ván
mới. Ván mới tự mở bảng cho người đứng gần. Bảng: phỉnh 1/5/10/50 (phím 1–4 chọn), **chuột trái đặt / chuột phải gỡ**,
ví Công Đức + Đức, đồng hồ đếm ngược, kết quả. Bàn tự nghỉ khi 3 ván liền không ai cược hoặc không còn ai đứng gần.

### 3.1 Tài Xỉu chẵn lẻ (`taixiu`)
- 3 xúc xắc. Ô cược: **Tài** (tổng 11–17), **Xỉu** (4–10), **Chẵn**, **Lẻ** — ăn 1:1, gặp **bộ ba** thì thua cả 4 ô;
  **Bộ Ba** (3 mặt giống nhau) ăn 1:30.
- Ván: đặt 15 s → nhà cái lắc bát 3 s → mở bát + trả 5 s. Bảng "cầu" 16 ván gần nhất (tổng + T/X).
- 3D: bàn nỉ in 5 ô, đĩa sứ + bát úp, 3 xúc xắc chấm (mặt 1 và 4 chấm đỏ), nhà cái lắc bát.

### 3.2 Xì Dách (`xidach`)
- Tối đa 5 người/ván (ghế theo thứ tự đặt cược). Bộ 52 lá xào mới mỗi ván.
- Điểm: 2–10 theo số, J/Q/K = 10; **Át** 2 lá = 11/10/1, 3 lá = 10/1, ≥ 4 lá = 1 (lấy tổng tốt nhất ≤ 21).
- Hạng: **Xì Bàng** (2 Át) > **Xì Dách** (Át + 10/J/Q/K) > **Ngũ Linh** (5 lá ≤ 21) > Thường (16–21) ; > 21 là
  **Quắc**. Người chơi phải **đủ 16** mới được dằn; 21 điểm hoặc 5 lá thì tự dừng. Nhà cái rút tới khi ≥ 16 (hoặc 5 lá).
- So: hơn hạng thắng; cùng hạng đặc biệt hòa; cùng Thường so điểm, bằng hòa; người Quắc thua, **trừ khi nhà cái cũng
  Quắc thì hòa**; nhà cái Quắc thì người không Quắc thắng. Nhà cái có Xì Bàng / Xì Dách lúc chia → lật ngay, kết thúc ván.
- Lãi: Xì Bàng ×3, Xì Dách ×2, Ngũ Linh ×2, thắng thường ×1 (thua mất cược).
- Ván: đặt 15 s → chia 2,5 s → **cả bàn rút/dằn cùng lúc** trong 20 s (xong sớm thì đi tiếp; hết giờ tự rút tới 16 rồi
  dằn) → nhà cái lật + rút (0,9 s/lá) → kết quả 6 s. Phím **R rút, T dằn** + nút bấm.
- 3D: bàn bán nguyệt nỉ xanh, hộp bài, lá bài bay tới ghế, lật bài; nhà cái NPC.

### 3.3 Bài Cào 3 lá (`baicao`)
- Mỗi người cược + nhà cái nhận 3 lá (bộ mới mỗi ván). **Nút** = tổng (Át 1, 2–9, 10/J/Q/K = 10) mod 10.
  **Ba Tiên** (3 lá J/Q/K) cao nhất.
- So với nhà cái: Ba Tiên > 9 > … > 0. Bằng nút → so **lá lớn nhất** (K > Q > J > 10 > … > Át); vẫn bằng → **nhà cái
  thắng**. Lãi ×1, Ba Tiên thắng ×2.
- Ván: đặt 15 s → chia + lật dần 3 s → kết quả 6 s. Không giới hạn số người cược (3D chỉ bày 6 tay đầu + nhà cái).

### 3.4 Nổ Hũ (`nohu`)
- 4 máy, mỗi máy 1 người. E vào máy → khóa di chuyển, nhìn màn máy; **Space / nút QUAY**. Mức cược 1/5/10/20.
- 3 cuộn × 1 đường thắng. 7 biểu tượng vẽ bằng canvas (không phụ thuộc emoji): bia, đào tiên, hoa sen, chuông, nén
  vàng, số 7, **hũ**. Bảng trả (× mức cược): 3 hũ = **NỔ HŨ** (cả quỹ); 3 số 7 ×80, 3 nén vàng ×40, 3 chuông ×15,
  3 sen ×10, 3 đào ×6, 3 bia ×4; 3 "quả" lẫn nhau (bia/đào/sen) ×2; đúng 2 hũ ×3. Dải cuộn 32 ô/cuộn (số ô ở
  `NOHU.reelCounts`): trả lại chưa tính hũ 84,7%, trúng 32,6% số lượt, nổ hũ ~1/3641 lượt — test liệt kê đủ 32³ tổ hợp.
- **Hũ Công Đức** thuộc phòng: khởi 100, mỗi lượt góp 10% mức cược (giữ phần lẻ nội bộ). Nổ hũ: banner cả phòng, pháo
  giấy, còi, mưa xu, tin chat; hũ về 100.
- Server trừ cược, quyết kết quả ngay, trả thưởng lúc cuộn 3 dừng (2,2 s); mỗi máy tối thiểu 2,4 s/lượt. Người khác thấy
  cuộn quay.

### 3.5 Đua Ngựa (`duangua`)
- 6 ngựa: Xích Thố, Bạch Long Mã, Ô Truy, Đích Lư, Tuyệt Ảnh, Ngựa Sắt Gióng.
- Mỗi ván phong độ ngẫu nhiên → xác suất về nhất p_i (mạnh nhất ≤ 40%, yếu nhất ≥ 5%); **tỉ lệ trả** o_i = (1 − 7%) / p_i
  làm tròn xuống 0,1, tối thiểu ×1,5. Cược "về nhất" một hay nhiều ngựa; thắng nhận floor(cược × o_i).
- Ván: đặt 20 s → đua 12 s → kết quả 6 s. Server chọn ngựa thắng theo p_i và sinh **kịch bản đua** (tiến độ 0..1 tại
  13 mốc, đơn điệu, về đích đúng thứ tự, ngựa nhất chạm đích đúng 12 s) → mọi máy thấy cùng một cuộc đua.
- 3D: đường đua 6 làn, cổng xuất phát, vạch đích ca-rô, ngựa mô hình có nài màu làn (nhún khi chạy), bảng LED tỉ lệ +
  kết quả; chuông xuất phát, vó ngựa, reo hò.

## 4. Nhạc DJ thu sẵn + bàn DJ

- 4 file user gửi (tổng 19 MB, 128 kbps) chép vào `client/src/content/dj/` với tên ASCII; danh sách bài ở `shared/`
  (id, tên hiển thị, BPM, lệch phách đầu, thời lượng, các mốc drop nếu đo được) — BPM/phách **đo bằng ffmpeg + script**,
  sai số mục tiêu BPM ±0,02, phách ±15 ms. Giữ 4 bài tổng hợp cũ (tổng 8 bài).
- Vào Bar → tự phát **danh sách thu sẵn** từ bài 1; hết bài sang bài kế, hết danh sách quay lại; bài tổng hợp lặp tới
  khi đổi. Cả phòng nghe cùng đoạn (vị trí = giờ server − mốc bắt đầu). Trong Sòng Bạc nhạc nhỏ còn 55%.
- **Đứng bàn**: bấm E ở bàn DJ — bàn trống thì lên bàn; có người → "X đang chỉnh nhạc"; người giữ danh hiệu DJ bấm E thì
  **chiếm lại bàn**; Esc / đi xa (bán kính + 2 m) / mất kết nối → bàn trống. Chỉ người đứng bàn gửi lệnh được (server
  kiểm).
- Bảng DJ: đang phát (tên, BPM, thanh tiến độ), ⏮ ▶/⏸ ⏭, danh sách 8 bài, hiệu ứng 💥 Drop (nghỉ 8 s), 📯 Còi (5 s),
  🎊 Pháo giấy (10 s), 💨 Khói CO2 (10 s), ⚡ Đèn chớp 4 s (10 s), 4 màu đèn. Phím: Space Drop, P phát/dừng, ←/→ bài
  trước/kế, H còi, C pháo giấy, K khói, F đèn chớp.
- **Thi nhảy** canh theo BPM + phách của bài đang phát (kể cả bài thu sẵn); mở sảnh nhảy khi nhạc dừng → tự phát lại;
  trong sảnh/vòng nhảy không cho đổi/dừng bài; bài thu sẵn hết giữa vòng → phát lại từ đầu **đúng phách**.
- Hình: tường LED sau DJ nhảy theo **phổ nhạc thật** (AnalyserNode), sàn LED + đèn theo phách, bảng chữ chạy "ĐANG PHÁT"
  trên bàn DJ, đĩa than quay khi đang phát, Drop tự bắn ở mốc drop đã đo, khói CO2 + đèn chớp do DJ bấm.

## 5. Kiến trúc (theo khuôn module có sẵn)

- `shared/`: ID (5 hoạt động, loại trạm, âm thanh mới), `balance.ts` (khối CASINO/TAIXIU/XIDACH/BAICAO/NOHU/DUANGUA +
  DJ), luật thuần + kiểu trạng thái công khai mỗi trò ở `shared/src/activities/<trò>.ts`, bộ bài dùng chung `cards.ts`,
  danh sách bài DJ, map `bar.ts`.
- `server/`: `ctx.wager()` mới (hợp đồng `ActivityContext`, cài ở `PartyRoom`, giả lập ở `fakeContext`); sổ cược dùng
  chung `server/src/activities/casino/stakes.ts`; mỗi trò 1 module `server/src/activities/<trò>/index.ts`; DJ viết lại
  mô hình đứng bàn + danh sách phát; Thi nhảy đọc mốc nhịp mới qua `ctx.shared` (`dj_bpm`, `dj_beat0`, `dj_playing`,
  `dance_lobby_until`).
- `client/`: bộ giao diện sòng dùng chung `client/src/activities/casino/` (bảng cược, phỉnh, ví, lá bài 3D); mỗi trò
  1 module + CSS riêng; DJ viết lại; `AudioApi.musicBands()` mới; `WorldControls` thêm `setSpectrum`, `setMusicPlaying`,
  `setNowPlaying`, `strobe`, `smoke`; phòng mới ở `client/src/art/bar/casino.ts`.

## 6. Kiểm thử

- Luật thuần (vitest): phân loại/trả thưởng Tài Xỉu; điểm Xì Dách (luật Át theo số lá), hạng, so bài; nút Bài Cào, Ba
  Tiên, phá hòa; bảng trả + trả lại Nổ Hũ (liệt kê đủ 32³ tổ hợp); tỉ lệ + kịch bản Đua Ngựa (đơn điệu, đúng thứ tự);
  lợi thế nhà cái từng trò nằm trong khoảng mục 1.
- Server (FakeActivityContext): đặt/gỡ cược trừ đúng cả Công Đức lẫn Đức, thiếu Đức bị từ chối, trần 100/ván, trả
  thưởng đúng, hoàn cược khi rời/đổi map, `isBusy`, Tạp Niệm, tụt cấp có báo; hũ góp + nổ hũ; Xì Dách rút/dằn/hết
  giờ/nhà cái/cùng Quắc; DJ đứng bàn / chiếm lại / rời bàn, phát/dừng/chuyển/tự sang bài, chặn đổi bài khi nhảy, phát
  lại đúng phách.
- Map: test có sẵn (trạm đi tới được, không bị chặn) phủ phòng mới.
- Thử trong trình duyệt: đi vào Sòng Bạc, chơi đủ 5 trò, bàn DJ đổi bài / Drop / khói / đèn chớp, nhạc thu sẵn phát
  đồng bộ (2 tab).

## 7. Ngoài phạm vi

Đổi Bầu Cua sang Công Đức; người chơi làm nhà cái; cược đối kháng người–người; bảng xếp hạng đỏ đen; chống gian lận
nâng cao; tự động dò drop bằng AI.

## 8. Rủi ro

- 4 bài là **remix thương mại có bản quyền**: chơi nội bộ ổn; nếu repo GitHub công khai hoặc deploy mở cho người lạ thì
  nên để nhạc ngoài repo (như nhạc kinh 57 MB hiện đã commit).
- Hiệu năng: thêm ~2 PointLight, 3–4 NPC, vài trăm lưới động; tĩnh phải gộp.
- Dev server `tsx watch` hay kẹt khi sửa `server/` (cổng 3000 chết) — bật thêm `npm run dev:server`, không kill process lạ.

## 9. AI tự chốt (user xem lại được)

1. Đặt cược cần đủ **Đức** (không cho cược bằng phần Công Đức đã tiêu ở quầy) — tránh lỗi "hòa/hoàn cược sinh thêm Đức".
2. Phỉnh 1/5/10/50, trần 100/ván/bàn; Nổ Hũ 1/5/10/20 mỗi lượt; Tạp Niệm +2/ván, Nổ Hũ +1/lượt.
3. Luật + bảng trả từng trò (mục 3), lợi thế nhà cái (mục 1); hũ Nổ Hũ thuộc phòng, khởi 100, góp 10%.
4. Vị trí phòng Sòng Bạc và bố trí bàn (mục 2); tên "Sòng Công Đức"; 6 tên ngựa.
5. Bar tự phát nhạc thu sẵn khi vào; nhạc nhỏ 55% trong Sòng Bạc; phím tắt bàn DJ.
6. Người giữ danh hiệu DJ chiếm lại bàn được; Phương Trượng không còn quyền riêng ở bàn DJ (vẫn mở được vòng nhảy).
