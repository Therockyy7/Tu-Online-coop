# Tu Online — Thiết kế game (2026-10-30)

> Nguồn ý tưởng: bản thiết kế tổng quan của user (Core loop, cấp bậc, mini-game Chùa, Quán Bar, kiến trúc web co-op).
> Trạng thái: **đã duyệt hướng tiếp cận (Cách A)** ngày 2026-10-30. Các điểm do AI tự chốt thay user được đánh dấu **[Chốt]** và liệt kê lại ở mục 15.

## 0. Quyết định đã chốt với user

| Chủ đề | Quyết định |
|---|---|
| Đồ họa | **3D low-poly hài hước** (kiểu Fall Guys / Untitled Goose Game), dựng bằng Three.js |
| Cách làm | **Cách A**: Three.js + model low-poly dựng bằng code + UI HTML/CSS phủ trên canvas + Node + Socket.io |
| Thiết bị | **Chỉ máy tính** (bàn phím + chuột). Không hỗ trợ cảm ứng |
| Góc nhìn | **Góc nhìn thứ nhất** (yêu cầu bổ sung 2026-10-30): chuột xoay góc nhìn (khóa chuột), WASD đi theo hướng nhìn, tâm ngắm giữa màn hình; phím V xem tạm góc thứ ba sau lưng (để ngắm áo, emote) |
| Voice | **Chat chữ + emote** trong game; nói chuyện dùng Discord |
| Deploy | **ngrok chơi ngay** từ máy user + **Render (free) + MongoDB Atlas (free)** để có link cố định |
| Ngôn ngữ | Toàn bộ giao diện tiếng Việt |

## 1. Mục tiêu và phạm vi

**Mục tiêu:** một game web co-op cho hội bạn 2–20 người, vào cùng một "chùa" bằng mã phòng, làm Phật sự / mini-game để tích Công Đức, thăng cấp, rồi cùng "Hạ Sơn" sang Quán Bar xả nghiệp và quay về chùa hóa giải Tạp Niệm.

**Trong phạm vi:** toàn bộ nội dung bản thiết kế gốc — 2 room (Chùa, Quán Bar), hệ thống cấp bậc + quyền hạn, 9 hoạt động trong Chùa + 3 đặc quyền cấp bậc, 7 hoạt động/tiện ích ở Bar, kinh tế chuyển đổi giữa 2 room, chat + emote, lưu tiến trình, deploy.

**Ngoài phạm vi:** voice chat trong game, điện thoại/cảm ứng, tài khoản có mật khẩu, tiền thật, bảng xếp hạng toàn server, chống gian lận nâng cao (chỉ kiểm tra hợp lý phía server), đa ngôn ngữ.

## 2. Vòng lặp cốt lõi

```text
Vào chùa (mã phòng) → làm công quả cá nhân / co-op → +Công Đức, −Tạp Niệm
   → thăng cấp (áo, quyền, mở hoạt động cao cấp)
   → Phương Trượng mở cổng "Hạ Sơn Xả Nghiệp" → cả phòng sang Quán Bar
   → đổi Đức lấy Xu / Vé VIP, nhảy, pha chế, cược, uống → +Xu, +Tạp Niệm, +Độ Say
   → Phương Trượng "Hồi Sơn" → về chùa làm công quả để hóa giải Tạp Niệm
```

## 3. Người chơi, phòng, danh tính

- **Vào game:** màn hình sảnh nhập tên (2–16 ký tự, có dấu tiếng Việt, cắt khoảng trắng đầu/cuối, cấm ký tự điều khiển) rồi chọn:
  - **Tạo chùa mới** → server sinh mã 4 ký tự từ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
  - **Vào chùa bằng mã** hoặc mở link `https://<host>/?r=ABCD` (tự điền mã).
  - **Chùa chung**: phòng công khai mã `CHUA`.
- **Giới hạn:** tối đa 20 người/phòng; co-op thiết kế cho tối đa 10 người tham gia cùng lúc. Phòng (trong bộ nhớ) bị hủy sau 5 phút không còn ai.
- **Danh tính không mật khẩu:** lần đầu, trình duyệt sinh `playerKey` ngẫu nhiên 32 ký tự hex (crypto) lưu `localStorage`. Server lưu hồ sơ theo khóa này và **không bao giờ** gửi khóa của người khác ra ngoài; mỗi người chơi trong phòng có `pid` công khai riêng. Màn Cài đặt hiển thị **Mã khôi phục** (chính là `playerKey`) để dán sang máy khác.
- **Một khóa chỉ vào 1 phòng tại một thời điểm.** Nếu cùng khóa vào lại (tab mới) thì kết nối cũ bị ngắt với thông báo.
- **Mất kết nối:** nhân vật mờ đi 60 giây (ân hạn); kết nối lại trong 60 giây giữ nguyên vị trí. Hết ân hạn thì rời phòng. Người mất kết nối bị loại khỏi mọi phiên co-op ngay lập tức (đội chơi tiếp).

## 4. Hệ thống điểm

| Chỉ số | Ý nghĩa | Lưu bền |
|---|---|---|
| **Công Đức tích lũy** (`congDuc`) | Tổng Công Đức kiếm được, quyết định cấp bậc. Không bao giờ bị tiêu | Có |
| **Đức khả dụng** (`duc`) | Mỗi +1 Công Đức kiếm được thì +1 Đức. Dùng để đổi Xu / Bao cả quán / Vé VIP | Có |
| **Tạp Niệm** (`tapNiem`, 0–100) | "Nghiệp" mang về từ bar và từ lỗi. Giảm bằng công quả, thiền, sám hối | Có |
| **Xu** (`xu`) | Tiền bao quán, chỉ tiêu ở Bar | Có |
| **VIP** (`vip`) | Vé VIP vĩnh viễn | Có |
| **Độ Say** (`doSay`, 0–100) | Độ cồn tạm thời ở Bar, giảm 1 điểm/giây | Không |

**Công thức nhận Công Đức** (mọi số trong `shared/src/config/balance.ts`, chỉnh được):

```text
heSoTapNiem = 1 − 0.5 × tapNiem / 100            (Tạp Niệm 100 → chỉ nhận 50%)
heSoBuff    = tích các buff đang có: Hào quang ×2, Được ban phước ×1.2, No bụng ×1.1
nhan        = max(1, round(goc × heSoTapNiem × heSoBuff))      (khi goc > 0)
```

- Khoản **phạt** (nấu khét, phóng sinh sai…) trừ thẳng cả `congDuc` lẫn `duc`, không nhân hệ số, không âm.
- **Quỹ Công Đức của phòng:** mỗi khoản nhận dương cộng thêm 10% vào quỹ (không trừ của người chơi). Phương Trượng dùng quỹ để phát bổng lộc. Quỹ thuộc phòng, mất khi phòng bị hủy.
- **Bổng lộc** (Phương Trượng phát) cộng thẳng vào `congDuc` và `duc`, không nhân hệ số.
- Tạp Niệm ≥ 50: mây đen lơ lửng trên đầu nhân vật; ≥ 80: mây có sấm.

## 5. Cấp bậc và quyền hạn

| Cấp | Công Đức | Áo tự động | Quyền thêm |
|---|---|---|---|
| Tiểu Đồng Quét Lá | 0–100 | Áo nâu sồng rách (vá) | Quét lá, chẻ củi, xách nước, phóng sinh, thiền, phụ bếp nấu cơm, kéo chuông, phụ Đại lễ |
| Hòa Thượng Tập Sự | 101–500 | Áo lam | ~~Vào Chánh Điện, gõ mõ tụng kinh~~ — từ 2026-11-02 mở cho mọi cấp |
| Tri Khách Tăng | 501–1.500 | Áo tràng nâu | Đón khách vãng lai, nhập kho đồ chay, ban phước cho Tiểu Đồng |
| Đại Đức | 1.501–4.000 | Cà sa vàng | Chọn bài kinh + chỉnh nhịp mõ chung |
| Thượng Tọa **[Chốt]** | 4.001+ | Cà sa vàng viền đỏ + tràng hạt | Như Đại Đức (bản gốc gộp "Đại Đức / Thượng Tọa" thành một tầng quyền) |
| **Phương Trượng (Trụ Trì)** | **Người có Công Đức cao nhất phòng** **[Chốt]** | Cà sa đỏ thêu kim + mũ Tỳ Lư + tích trượng (đè lên áo đang mặc) | Host tâm linh (mục 7.11) |

- Quyền của cấp thấp hơn luôn được giữ ở cấp cao hơn.
- **Phương Trượng** được tính lại khi có người vào/rời phòng hoặc khi Công Đức thay đổi; bằng điểm thì ai vào phòng sớm hơn được chọn. Phương Trượng luôn có mọi quyền của các cấp khác. Đổi Phương Trượng có thông báo lớn + tiếng chuông.
- **Thăng cấp:** banner "Thăng cấp: Hòa Thượng Tập Sự!", hiệu ứng biến hình (vòng sáng + âm thanh), đổi áo tự động, mở khóa đồ trong Tủ áo.
- ~~Cổng **Chánh Điện** chặn người dưới 101 Công Đức (lính canh nói "Tiểu Đồng chưa được vào Chánh Điện, đi quét lá đi con!").~~
  **Cập nhật 2026-11-02:** bỏ cổng — mọi cấp bậc vào Chánh Điện (Đại Hùng Bảo Điện) và ngồi bồ đoàn gõ mõ tụng kinh được;
  mở thời khóa vẫn là việc của Phương Trượng.

## 6. Bản đồ

Hệ trục: X hướng Đông, Z hướng Nam (về phía camera), Y hướng lên, đơn vị mét. Tọa độ chính xác của mọi trạm tương tác và vật cản nằm trong `shared/src/maps/temple.ts` và `shared/src/maps/bar.ts` — **nguồn sự thật duy nhất** cho cả client (dựng hình) lẫn server (kiểm tra khoảng cách).

### 6.1 Chùa (80 × 80 m)

```text
Bắc (z = −40)
┌──────────────────────────────────────────────────────────────────────┐
│ [Bãi củi + 3 thớt]     ┌──── CHÁNH ĐIỆN ────┐   [TĂNG XÁ — hiên    │
│ [Kho đồ chay]          │ Tượng Phật         │    5 chân dung + Tủ áo]│
│ [NHÀ BẾP: thùng gạo,   │ 10 bồ đoàn + mõ    │                       │
│  chậu vo, bếp 2 lò,    └──────cửa (chặn)────┘   [GÁC CHUÔNG]        │
│  thớt, quạt lửa]        [Đàn tràng + Bàn soạn lễ]  Đại Hồng Chung    │
│ [Trai đường]      🌳 Bồ đề     [Lư hương lớn]      4 vị trí kéo dây  │
│ [Rau nấm]   [Giá chổi]  (khu lá rụng)   [Bàn hương đăng: đèn, dầu,   │
│                                          nến, hương]                 │
│ [VƯỜN: 7 cây quả]        SÂN CHÙA                 [Giếng]            │
│ [4 luống hoa] [Bàn cắm hoa]  [3 chum nước]   [Thiền viên: 6 bồ đoàn] │
│                                                    ~~ AO ~~   🌲 RỪNG │
│ [Cổng Hạ Sơn]     [Xe tiếp tế]   [Xe phóng sinh]                     │
└──────────────────────────── CỔNG TAM QUAN ───────────────────────────┘
Nam (z = +40) — điểm xuất hiện ngay trong cổng
```

- Góc nhìn thứ nhất: mái nhà **luôn hiện**. Bên trong Chánh Điện, Nhà bếp và Gác chuông phải đẹp ở tầm mắt: trần/mặt dưới mái, xà, đèn lồng, tượng Phật lớn. Chỉ ở chế độ xem góc thứ ba (V) camera mới có thể ẩn mái khi lọt vào trong nhà.
- Thấy được đường chân trời mọi hướng → có vòm trời và dãy núi thấp xa bao quanh tường chùa.
- **Đàn tràng** đặt ngoài sân **[Chốt]** để Tiểu Đồng cũng phụ được Đại lễ (Chánh Điện bị chặn cấp).

### 6.2 Quán Bar (44 × 32 m)

```text
┌──────────────────────────────────────────────────────────┐
│ [Khu VIP — dây nhung]     [ DJ BOOTH ]      [Vòng quay]   │
│ [QUẦY BAR: 4 trạm pha chế + kệ rượu]                      │
│                       [ SÀN NHẢY LED 8×6 ]    [Bàn NPC ×3]│
│ [Bàn NPC ×2]                                  [Bầu Cua]   │
│        [Quầy đổi Đức]      [Cửa Hồi Sơn]  [Bàn NPC]       │
└──────────────────────────────────────────────────────────┘
```

Không khí: tối, đèn neon, quả cầu disco, sàn LED nháy theo nhịp, khách NPC "hạt đậu" mặc đồ thường.

## 7. Hoạt động trong Chùa

Quy ước chung cho mọi hoạt động:
- **E** tương tác với trạm gần nhất (trong bán kính của trạm), **Q** bỏ/trả vật đang cầm, **Esc** thoát hoạt động đang chơi (không thưởng phần dang dở).
- Mỗi người chỉ cầm **1 vật** một lúc (vật hiện trên tay nhân vật). Cầm vật nặng thì đi chậm lại.
- Mỗi trạm cá nhân chỉ 1 người dùng một lúc ("Có người đang dùng").
- Server quyết định kết quả; client chỉ hiển thị và gửi thao tác (kèm thời điểm theo đồng hồ server đã đồng bộ).
- Đổi map (Hạ Sơn / Hồi Sơn) hủy các hoạt động cá nhân đang dở, không thưởng không phạt; **không cho đổi map khi đang có phiên co-op**.

### 7.1 Quét lá bồ đề (cá nhân)
- Lấy chổi ở **Giá chổi** (E). Lá rụng liên tục quanh cây Bồ đề: server giữ tối đa 80 lá, mỗi 2 giây rụng thêm 3 lá, trôi theo hướng gió (gió đổi mỗi 30 giây) rồi nằm xuống đất.
- **Giữ Space** để quét: mỗi 0,4 giây gom các lá trong bán kính 1,8 m trước mặt vào bao (tối đa 30 lá).
- Mỗi lần quét trúng lá có 12% bật lên **chữ Tạp niệm** ("Trà sữa", "Deadline", "Người yêu cũ"…) kèm 1 phím (J/K/L/U/I/O). Bấm đúng phím trong 1,5 giây: −2 Tạp Niệm, +1 Công Đức; trượt: +1 Tạp Niệm.
- Đổ bao ở **gốc cây** (E): +⌊số lá / 2⌋ Công Đức.

### 7.2 Chẻ củi (cá nhân, 3 thớt)
- E ở thớt → 8 khúc gỗ. Mỗi khúc: kim chạy qua lại trên thanh ngang (chu kỳ 1,6 giây, mỗi khúc nhanh hơn 0,08 giây); vùng xanh rộng 18%, vùng hoàn hảo 6% ở giữa, vị trí ngẫu nhiên.
- Bấm **Space** để bổ: hoàn hảo +3, tốt +2, trượt 0 ("Cạch! Trượt rồi").
- Mỗi khúc bổ trúng cộng +1 củi vào kho củi nhà bếp (tối đa 40; ban đầu 10).

### 7.3 Xách nước (cá nhân)
- E ở **Giếng** → kéo gàu: bấm xen kẽ **A, D** đủ 12 lần trong 6 giây → cầm xô nước (đi chậm 30%).
- Đổ vào **chum** (E): +4 Công Đức. Mỗi chum chứa 5 xô, tự vơi 1 xô/40 giây. Chum đầy thì không thưởng ("Chum đầy rồi!").

### 7.4 Ngồi thiền định tâm (cá nhân, 6 bồ đoàn)
- E ở bồ đoàn → ngồi kiết già, phiên 40 giây. Con lắc trên đầu tự nghiêng dần (càng về cuối càng mạnh); **A/D** đẩy ngược để giữ ở giữa.
- **Xanh** khi lệch ≤ 15°, **vàng** khi ≤ 35°, quá 35° thì "mất định" (vẫn chơi tiếp).
- **Nhiễu, mỗi 5–8 giây:**
  - *Muỗi vo ve*: hiện phím, phải bấm trong 1,5 giây, trượt thì con lắc bị hất ±20°.
  - *Tiếng động lạ*: "Rầm!" kèm rung màn hình. Phải **không bấm gì** trong 1,5 giây, bấm thì bị hất.
  - *Tạp niệm*: bấm phím hiện ra để dẹp.
- **Điểm** = (thời gian xanh + 0,5 × thời gian vàng) / 40 giây.
- **Thưởng:** +round(4 + 10 × điểm) Công Đức, −round(8 + 30 × điểm) Tạp Niệm.

### 7.5 Giải cứu động vật phóng sinh (cá nhân)
- **Xe phóng sinh** gần cổng chứa tối đa 6 con (cá, rùa, chim ngẫu nhiên), mỗi 20 giây thêm 1. E → chọn con → cầm xô cá / chậu rùa / lồng chim (đi chậm 20%).
- **Thả đúng chỗ** (E): cá, rùa ở bờ ao; chim ở bìa rừng → +6 Công Đức, kèm hoạt cảnh cá nhảy hoặc chim bay.
- **Thả sai chỗ:** −2 Công Đức kèm lời chọc, ví dụ "Cá không biết leo cây đâu!".

### 7.6 Nấu cơm chay tập thể (co-op, 1–6 người)
- **Mở phiên:** E ở **Bảng gọi món** trong bếp. Có 10 giây chờ người khác vào (E ở bảng), sau đó nấu trong 150 giây. Số mâm cần nấu = 1 + ⌊số người / 2⌋, tối đa 3.
- **Một mâm** = 1 nồi cơm chín + 1 đĩa rau nấm xào, đều mang ra **Trai đường**.

**Vai và các bước** (không ép vai, ít người thì một người làm nhiều việc):

| Vai | Các bước |
|---|---|
| Vo gạo nấu cơm | Thùng gạo → Chậu vo (bấm Space 10 lần) → Lò A (nồi) |
| Nhặt rau nấm | Luống rau nấm → Thớt (bấm đúng chuỗi 6 phím mũi tên) → Lò B (giữ Space đảo 8 giây) |
| Canh lửa bếp củi | Lấy củi ở bãi củi (trừ kho củi; hết củi thì báo "Hết củi, đi chẻ củi đi!") → bỏ vào lò (+30 nhiệt). Hoặc **quạt lửa** (Space, +3 nhiệt/lần) |

**Nhiệt bếp:**
- Nhiệt 0–100, tự giảm 4 điểm/giây. Vùng xanh 40–75; trên 85 là vùng đỏ.
- Cơm chín từ 0 đến 100% trong 30 giây khi nhiệt ở vùng xanh, nhiệt thấp thì chín chậm.
- Nhiệt ở vùng đỏ làm tăng thanh khét; khét đầy thì nồi hỏng: −5 Công Đức mỗi người tham gia, phải nấu lại.

**Kết quả:**
- **Thành công** (đủ mâm trước khi hết giờ): +15 Công Đức mỗi người.
- **Hoàn hảo** (không khét, còn ≥ 30 giây): +25 mỗi người, cả phòng nhận buff **"No bụng"** trong 3 phút: +20% tốc độ chạy, Công Đức ×1,1. **[Chốt]** buff này thay cho "hồi năng lượng" vì game không có thanh năng lượng.
- **Hết giờ:** +3 Công Đức mỗi người.

Kho đồ chay có gạo và rau (ban đầu mỗi loại 10); mỗi lần lấy trừ 1, hết thì phải chờ Tri Khách nhập kho.

### 7.7 Công phu tụng kinh — gõ mõ đồng điệu (co-op nhịp, 1–10 người)
- **Mở phiên:** Phương Trượng chọn "Bắt đầu thời khóa" trong menu host (khi đang ở Chùa). Đại Hồng Chung vang một tiếng, Chánh Điện mở **20 giây** để người đủ cấp (≥ 101 Công Đức hoặc Phương Trượng) ngồi vào bồ đoàn (E).
- **Chọn kinh:** trong 20 giây đó, **Người chọn kinh** (Đại Đức / Thượng Tọa cao điểm nhất phòng; không có thì Phương Trượng) chọn bài và nhịp:
  - Bài: *Tâm Kinh Bát Nhã* (72 BPM, nốt đen, chỉ ← →, nhiều nốt ngân), *Kinh A Di Đà* (84 BPM, 4 hướng, có móc đơn), *Chú Đại Bi* (96 BPM, 4 hướng, móc đơn + dấu lặng + mũi tên đỏ).
  - Nhịp: chậm ×0,85, vừa ×1, nhanh ×1,15.
  - Hết giờ mà chưa chọn thì mặc định bài đầu, nhịp vừa.
- **Lối chơi (kiểu osu! × Audition — làm lại 2026-10-30):**
  - Đếm 3-2-1 rồi các **vòng tròn đánh số** hiện theo dòng chảy trên "sân khấu", vòng tiếp cận co lại; trong mỗi vòng là **mũi tên** phải bấm (← ↑ → ↓ hoặc W A S D) đúng lúc vòng khép.
  - Mỗi câu kinh 8 phách; **phách cuối câu là tiếng Khánh** (Space hoặc J) — như Audition chốt phách 4. Cả câu không trượt thì hiện "善 Thiện tai!".
  - **Nốt ngân** (GIỮ): giữ phím tới đuôi; thả sớm quá 140 ms là **đứt hơi** (trượt). **Mũi tên đỏ** (NGƯỢC, Chú Đại Bi từ câu 3): bấm hướng ngược hướng vẽ.
  - Cửa sổ chấm: Hoàn hảo ±45 ms, Tốt ±100 ms. **Bấm sai phím** thì nốt đó tính trượt. Không gõ thì tính trượt.
  - Gõ khi không có nốt nào trong ±150 ms là **gõ trật nhịp**.
  - Mõ dẫn nhịp của Phương Trượng luôn vang to trên mỗi phách để mọi người bám theo; mõ của người chơi đổi cao độ theo hướng mũi tên.
  - Màn hình kiểu osu!: điểm (300/100 × hệ số combo), độ chính xác, thanh Định lực, thanh lệch nhịp, bảng hạng SS–D cuối bài. Bảng này chỉ để vui — thưởng Công Đức vẫn theo luật dưới đây.
- **Combo cả đội:** một nốt được tính "đồng điệu" khi **mọi** người tham gia đều gõ Tốt/Hoàn hảo.
  - Có người trượt hoặc gõ trật nhịp → tiếng **"Bongggg!"** chói tai, combo về 0, người lỗi nháy đỏ.
  - Server chốt mỗi nốt sau thời điểm nốt 250 ms để bù độ trễ mạng.
- **Hào quang:** đội đạt combo 20 → Chánh Điện phát hào quang, **cả phòng ×2 Công Đức trong 3 phút** (đạt lại thì làm mới). Cần ≥ 2 người tham gia, trừ khi phòng chỉ có 1 người **[Chốt]**. Mỗi 20 combo tiếp theo: +10 Công Đức cho người tham gia.
- **Thưởng mỗi người:** Hoàn hảo +2, Tốt +1 mỗi nốt. Cuối bài thêm round(độ chính xác × 20), với độ chính xác = (số Hoàn hảo + 0,6 × số Tốt) / số nốt.
- Người rời phiên giữa chừng được bỏ khỏi điều kiện đồng điệu từ nốt kế tiếp.

### 7.8 Thỉnh Đại Hồng Chung (co-op QTE, 3–4 người)
- **Tham gia:** gác chuông có 4 vị trí kéo dây, mọi cấp đều kéo được (E). Đủ 3 người thì đếm 3 giây (người thứ 4 vẫn vào kịp). Sau khi thỉnh xong, chuông nghỉ 60 giây.
- **Thỉnh 3 tiếng.** Mỗi tiếng, server hô "Kéo!":
  - Mỗi người **giữ Space**; thanh lực của riêng người đó dao động 0→100→0, chu kỳ 2 giây, tính từ lúc người đó nhấn.
  - Thả tay khi lực trong vùng vàng 70–90.
  - Ai không thả trong 5 giây thì lực tính bằng 0.
- **Chất lượng mỗi tiếng:** `q = trungBình(điểmVùng) × hệSốĐồngBộ × (sốNgười / 4)`.
  - điểmVùng: 1 trong vùng 70–90; 0,6 trong 55–70 hoặc 90–95; còn lại 0,25.
  - hệSốĐồngBộ tính theo độ lệch thời điểm thả: ≤ 120 ms → 1; đến 400 ms giảm dần về 0,4; trên 400 ms → 0,3.
- **Thưởng mỗi tiếng:** cả phòng +round(2 + 8q) Công Đức, người kéo được gấp đôi. Âm lượng, độ ngân của chuông và độ rung camera tăng theo q.
- **[Chốt]** Đây là hoạt động riêng, tách khỏi tiếng chuông "bắt đầu thời khóa" mà Phương Trượng gõ một mình (mục 7.7). Nhờ vậy nhóm ít người vẫn tụng kinh được.

### 7.9 Đại lễ cúng dường & lập đàn tràng (co-op xếp đặt, 1–10 người)
- **Mở lễ:** Phương Trượng chọn "Mở Đại lễ" trong menu host (nghỉ 5 phút giữa hai lễ). Đàn tràng ngoài sân hiện lên, kèm **thẻ yêu cầu** cho mọi người ở Chùa. Nén nhang lớn trên đàn cháy dần trong **150 giây**.
- **Yêu cầu theo sơ đồ phong thủy ngẫu nhiên** (10 vị trí):
  - **Mâm ngũ quả:** 5 ô, mỗi ô một loại quả, chọn 5 loại khác nhau từ 7 loại (chuối, bưởi, phật thủ, thanh long, xoài, đu đủ, mãng cầu).
  - **2 bình hoa** trái/phải, mỗi bình một màu khác nhau từ 4 màu (vàng, trắng, đỏ, tím).
  - **2 đèn dầu đã thắp** trái/phải, **1 lư hương đã thắp hương** ở giữa.
- **Chuẩn bị vật phẩm:**
  - *Quả:* giữ E 1,5 giây ở cây quả tương ứng.
  - *Bình hoa:* hái hoa ở luống màu → **Bàn cắm hoa** (giữ E 2 giây).
  - *Đèn:* lấy đèn trống ở **Bàn hương đăng** → **Vò dầu** → **Giá nến** để thắp.
  - *Hương:* lấy hương → **Giá nến** để thắp.
- **Phân vai** (tự động gợi ý, hiện trên HUD, tính lại khi có người vào/ra):
  - Từ 4 người trở lên: **Bày lễ** ≈ 30% số người (ít nhất 1); số còn lại chia theo tỉ lệ 3 : 2 : 2 cho **Hái quả : Cắm hoa : Hương đăng**. Ví dụ 10 người = 3 Hái quả, 2 Cắm hoa, 2 Hương đăng, 3 Bày lễ, đúng như bản gốc.
  - Dưới 4 người: tất cả là **Đa năng**.
- **Luật bày lễ** **[Chốt]**:
  - Từ 4 người trở lên, chỉ người **Bày lễ** được đặt đồ lên đàn. Người khác để vật phẩm lên **Bàn soạn lễ** (tối đa 12 món, cạnh đàn); người Bày lễ lấy từ đó.
  - Dưới 4 người thì ai cũng đặt được.
  - Cách đặt: đứng gần đàn bấm E → bảng đàn tràng hiện các ô → bấm ô cần đặt.
  - Đặt sai thì bị trả lại kèm thông báo "Sai phong thủy!", vật vẫn trên tay.
- **Kết quả:**
  - **Đủ 10 vị trí trước khi nhang tàn:** người tham gia +40, mọi người khác trong phòng +10, mưa cánh sen.
  - **Nhang tàn:** người tham gia +5.
- Đang có lễ thì ai ở Chùa cũng tham gia được (E ở đàn hoặc bàn soạn lễ).

### 7.10 Đặc quyền Tri Khách Tăng (≥ 501)
- **Đón khách vãng lai:** khách NPC (đồ thường, mang giỏ trái cây) xuất hiện ngoài cổng mỗi 40 giây, tối đa 3 người chờ, chờ quá 120 giây thì bỏ về.
  - Tri Khách bấm E cạnh khách → khách đi theo.
  - Dẫn tới bậc Chánh Điện → khách vái lạy rồi về → +6 Công Đức.
- **Nhập kho đồ chay:** E ở **Xe tiếp tế** gần cổng → chọn bao gạo hoặc thùng rau → mang vào **Kho** → kho +5, người mang +3 Công Đức.
- **Ban phước** (phím **B** khi đứng cạnh một Tiểu Đồng, hoặc chuột phải vào nhân vật → "Ban phước"):
  - Người được ban phước nhận buff **"Được ban phước"** (Công Đức ×1,2 trong 3 phút); người ban +2 Công Đức.
  - Mỗi người ban nghỉ 90 giây giữa hai lần; người đang có buff thì không ban chồng được.

### 7.11 Phương Trượng — menu host (phím **H**)

| Hành động | Ở đâu | Luật |
|---|---|---|
| Bắt đầu thời khóa tụng kinh | Chùa | Khi chưa có phiên tụng kinh (7.7) |
| Mở Đại lễ cúng dường | Chùa | Nghỉ 5 phút giữa hai lễ (7.9) |
| Phát bổng lộc | Mọi nơi | Chọn người + gói 10/20/50 Công Đức, trừ vào Quỹ Công Đức |
| Phạt quỳ sám hối | Mọi nơi | Người bị phạt quỳ 15 giây, không đi/không thao tác được, nhãn "Đang sám hối", −5 Tạp Niệm (sám hối có ích!). Host nghỉ 30 giây giữa hai lần; cùng một người phải cách 2 phút; không tự phạt mình |
| Hạ Sơn Xả Nghiệp | Chùa | Đếm 5 giây rồi cả phòng dịch chuyển sang Bar. Không cho khi đang có phiên co-op |
| Hồi Sơn | Bar | Đếm 5 giây rồi cả phòng về Chùa. Không cho khi đang có phiên ở Bar |

### 7.12 Tủ áo (Tăng xá)
- **Áo:** mở khóa vĩnh viễn khi đạt cấp — nâu sồng rách, áo lam, áo tràng nâu, cà sa vàng, cà sa vàng viền đỏ.
- **Mũ:** không, nón lá (100 CĐ), mũ len (300 CĐ), mũ VIP (VIP).
- **Phụ kiện:** không, tràng hạt (200 CĐ), quạt nan (600 CĐ), kính râm (VIP), dây chuyền vàng (VIP).
- Thăng cấp thì tự mặc áo mới. Người chơi được chọn mặc lại áo cấp thấp hơn.
- Bộ đồ Phương Trượng đè lên đồ đang mặc khi đang là host.

### 7.13 Hiên Tăng Đoàn — treo ảnh chân dung (yêu cầu bổ sung 2026-10-30)
- **Vị trí:** tường mặt Nam của Tăng xá (`z = −27`, `x` 25,6 → 34,4), có mái hiên. Người chơi đi tới đứng trước hiên là thấy tranh ngang tầm mắt. Tủ áo dời sang đầu Đông của hiên.
- **Ảnh:** 5 ảnh chân dung trang phục tu sĩ do user cung cấp, đã thu nhỏ (cạnh dài ≤ 1280px, tổng ~730 KB), nằm ở `client/src/content/gallery/`. Danh sách và chú thích ở `client/src/content/gallery.ts`.
- **Hình:**
  - Khung gỗ sẫm, viền trong vàng, kích thước theo đúng tỉ lệ ảnh (cao ~1,3 m), tâm tranh ngang tầm mắt (~1,45 m).
  - Đèn lồng đỏ treo giữa các khung.
  - Bảng hiệu gỗ giữa hiên "Tăng Đoàn Tu Online".
  - Có `caption` thì hiện bảng đồng nhỏ dưới khung.
  - **Không** đặt hương án / nhang trước ảnh (tránh hiểu nhầm là ảnh thờ).
- **Tương tác:** đứng trước tranh bấm **E** "Ngắm chân dung" → mở ảnh phóng to (lightbox) kèm chú thích; ←/→ chuyển ảnh, Esc đóng. Hoạt động `gallery` chỉ chạy phía client, không cần server.
- **Lưu ý riêng tư:** khi deploy (ngrok/Render), ai có link game đều xem được các ảnh này.

## 8. Hoạt động ở Quán Bar

### 8.1 Quầy đổi Đức
- **Đổi Xu:** 1 Đức → 10 Xu, nhập số Đức muốn đổi.
- **Bao cả quán** **[Chốt]:** 100 Đức → mọi người đang trong phòng (kể cả người bao) +100 Xu. Banner "Đại gia <tên> bao cả quán!" kèm pháo giấy; người bao mang danh hiệu "Đại gia" tới khi rời phòng.
- **Vé VIP:** 300 Đức → VIP vĩnh viễn: vào khu VIP, mở đồ VIP, đồ uống giảm 50%.

### 8.2 Gọi đồ uống (quầy bar)

| Món | Giá | Độ Say | Tạp Niệm |
|---|---|---|---|
| Bia Bồ Đề | 20 Xu | +20 | +3 |
| Mojito Niết Bàn | 30 Xu | +30 | +4 |
| Rượu Cần Tạp Niệm | 50 Xu | +45 | +6 |

**Hiệu ứng Độ Say** (giảm 1 điểm/giây):

| Độ Say | Hiệu ứng |
|---|---|
| > 30 | Màn hình hơi chao |
| > 60 | Camera lắc, hướng đi bị lệch |
| > 85 | Thỉnh thoảng loạng choạng, bị đẩy ngẫu nhiên |

Kèm tiếng ợ ngẫu nhiên.

### 8.3 Thi nhảy (kiểu Audition, 1–10 người)
- **Mở vòng:** DJ (không có DJ thì Phương Trượng) bấm "Mở vòng nhảy" ở DJ booth. Có 15 giây để người đứng trên sàn bấm E tham gia.
- **Nhạc:** bài DJ đang chọn (124–136 BPM). Vòng nhảy dài 16 ô nhịp, 2 ô đầu là dạo.
- **Mỗi ô nhịp:**
  - Hiện chuỗi k mũi tên, k tăng dần từ 3 lên 9. Từ ô 10 có mũi tên **đỏ** = phải bấm hướng ngược lại.
  - Nhập đủ chuỗi bằng **↑↓←→** trong phách 1–3 (bấm sai thì làm lại từ đầu chuỗi), rồi bấm **Space đúng phách 4**.
  - Chấm Space: Perfect ±40 ms, Great ±80 ms, Good ±130 ms. Chuỗi chưa xong hoặc lệch hơn thì Miss.
- **Điểm mỗi ô:** Perfect 100 / Great 70 / Good 40 / Miss 0, nhân (1 + k/10). Mỗi Perfect liên tiếp cộng thêm 10.
- Nhân vật nhảy theo kết quả, đèn sàn đổi theo nhịp.
- **Cuối vòng:** xếp hạng, thưởng Xu: nhất 100, nhì 60, ba 40, còn lại 15. Mỗi người tham gia +5 Tạp Niệm. **Người nhất thành DJ.**

### 8.4 DJ Chiếm Sóng
- **Ai làm DJ:** người thắng vòng nhảy gần nhất. Lúc mới vào Bar, DJ là Phương Trượng.
- **Bảng DJ** (E ở DJ booth):
  - Chọn bài cho cả quán: *Vinahouse Đắc Đạo* 136 BPM, *EDM Niết Bàn* 128 BPM, *Lofi Hạ Sơn* 90 BPM, *Mõ House* 124 BPM.
  - **Drop!** (nghỉ 8 giây): đèn chớp, màn hình mọi người nhịp mạnh.
  - **Đổi màu đèn.**
  - **Còi hú** (nghỉ 5 giây).

### 8.5 Thi pha chế — Mixologist Battle (1–4 người, 4 trạm)
- **Mở ca:** E ở một trạm pha chế → "Mở ca pha chế". Có 10 giây để người khác vào trạm khác. Ca dài 90 giây.
- **Đơn hàng:** 6 bàn NPC liên tục gọi món từ thực đơn như *Mojito Niết Bàn*, *Bia Bồ Đề*, *Sinh tố Tạp Niệm*, *Trà Đá Vô Ưu*… Mỗi món là 3 nguyên liệu (trong 6, bấm phím 1–6 đúng thứ tự) và có **lắc theo nhịp**.
- **Làm một ly:**
  1. Nhận đơn (ai nhận trước thì được, đơn dùng chung cho cả ca).
  2. Nhập nguyên liệu; sai thì làm lại.
  3. Lắc: bấm Space đúng phách 8 lần, độ chuẩn quyết định chất lượng.
  4. Rót, cầm ly mang tới đúng bàn (E).
- **Tiền tip:** round(20 × chất lượng × hệ số nhanh) Xu, khoảng 10–40.
- **Cuối ca:** xếp hạng theo tổng tip, người nhất +50 Xu. Mỗi người tham gia +3 Tạp Niệm.

### 8.6 Bầu Cua Cá Cọp
- **Vòng chơi:** bàn có nhà cái NPC, chạy liên tục khi có người đứng cạnh bàn:
  1. 15 giây đặt cược.
  2. Lắc 3 xúc xắc (có hoạt cảnh).
  3. Trả thưởng, nghỉ 5 giây, sang vòng mới.
- **Đặt cược:** 6 ô bầu, cua, tôm, cá, gà, nai. Mỗi lần bấm chuột trái đặt 10 Xu, chuột phải gỡ. Tối đa 200 Xu mỗi vòng.
- **Trả thưởng:** mỗi ô đặt B Xu, xuất hiện m mặt (m ≥ 1) thì nhận lại B + B × m; không xuất hiện thì mất B.
- Mỗi vòng có đặt cược: +2 Tạp Niệm. Kết quả xúc xắc do server sinh ngẫu nhiên bằng crypto.

### 8.7 Vòng quay sự thật
- E ở vòng quay (nghỉ 15 giây cho cả quán): vòng quay 5 giây rồi dừng ở **một người đang trong Bar** kèm thẻ **Sự thật** hoặc **Thử thách**, lấy từ danh sách ~40 câu vui, lành mạnh.
- Kết quả hiện banner lớn và vào khung chat. Không tính điểm; cả nhóm trả lời qua Discord hoặc chat.

### 8.8 Khu VIP
Chỉ người VIP đi qua được dây nhung; có ghế sofa và nhãn "VIP" cạnh tên.

## 9. Giao tiếp và điều khiển

| Phím | Chức năng |
|---|---|
| Chuột | Xoay góc nhìn (bấm vào màn hình để khóa chuột; Esc thả chuột) |
| WASD / mũi tên | Đi tới/lùi, bước ngang theo hướng nhìn (mũi tên bị mini-game chiếm khi đang chơi nhảy hoặc thái rau) |
| V | Bật/tắt xem góc thứ ba sau lưng |
| E | Tương tác |
| Q | Bỏ / trả vật đang cầm |
| Space | Hành động (quét, gõ, bổ, kéo…) |
| H | Menu Phương Trượng |
| B | Ban phước |
| Enter | Chat |
| 1–8 | Emote |
| Tab | Bảng người chơi |
| Esc | Đóng bảng / thoát hoạt động / thả chuột |
| Lăn chuột | Khoảng cách camera ở chế độ góc thứ ba |

- **Chat:** tối đa 120 ký tự; bong bóng trên đầu 5 giây + khung chat 50 dòng cuối; tối đa 1 tin/giây (dồn được 3). Nội dung luôn hiển thị dạng text thuần (chống chèn HTML).
- **Emote:**
  1. Chào
  2. A Di Đà Phật (chắp tay vái)
  3. Cười lăn
  4. Nhảy
  5. Vỗ tay
  6. Khóc
  7. Ngồi thiền
  8. Giận dỗi

  Emote nhảy lặp tới khi di chuyển.
- **Camera — góc nhìn thứ nhất:**
  - Mắt cao ~1,35 m (ngồi thiền ~0,85 m, quỳ ~0,75 m), FOV ~75°, góc ngẩng/cúi giới hạn ±85°, độ nhạy chuột và đảo trục Y chỉnh trong Cài đặt.
  - Đi có nhún đầu nhẹ (tắt khi hệ điều hành bật giảm chuyển động). Say thì camera chao và nghiêng.
  - Trước mắt hiện đôi tay (tay áo theo màu áo) và vật đang cầm, có động tác theo hành động (quét, chẻ, gõ mõ…).
  - Nhân vật của chính mình không vẽ ở góc nhìn thứ nhất nhưng vẫn đổ bóng.
  - **V** chuyển sang camera góc thứ ba sau lưng ~3 m (không xuyên tường), lăn chuột chỉnh khoảng cách.
  - Chuột bị khóa khi chơi. Khi mở bảng, hộp chọn hay gõ chat thì tự thả chuột; đóng xong thì khóa lại (hoặc hiện gợi ý "Bấm vào màn hình để điều khiển").
- **Tương tác theo hướng nhìn:** chỉ gợi ý trạm hay vật trong tầm với **và** nằm trong ~45° trước mặt. Tâm ngắm sáng lên khi đang nhắm vào thứ tương tác được. Ban phước (B) nhắm vào người đang ở giữa tâm ngắm.
- **HUD:**
  - Góc trái trên: tên, cấp bậc, Công Đức + Đức, thanh tiến tới cấp sau, thanh Tạp Niệm, các buff đang có kèm đồng hồ.
  - Góc phải trên: mã phòng (bấm để copy link mời), số người, nút cài đặt (âm lượng tổng / nhạc / hiệu ứng, mã khôi phục).
  - Góc trái dưới: chat.
  - Giữa dưới: gợi ý "[E] …" và vật đang cầm.
  - Giữa màn hình: banner sự kiện.
  - Trên đầu nhân vật: số "+5 Công Đức" bay lên.

## 10. Hình ảnh và âm thanh

- **Phong cách:** low-poly đổ bóng phẳng, màu pastel tươi; nhân vật "hạt đậu" (capsule) có mắt to, tay chân nhỏ. Đầu trọc nên nhìn là thấy tu sĩ. Hoạt ảnh nảy, co giãn vui nhộn.
- **Ánh sáng:** Chùa nắng ấm, có sương mờ ở xa. Bar tối, đèn neon, có thể thêm bloom.
- **Góc nhìn thứ nhất** nên mọi mặt công trình, nội thất và trần nhà đều phải đẹp ở tầm mắt. Chùa có vòm trời (gradient + mây) và dãy núi thấp xa. Bar có trần (giàn đèn) vì người chơi sẽ ngẩng lên.
- **Tài nguyên:** mọi model dựng bằng hình khối Three.js ngay trong code, **không tải asset 3D ngoài**. Font tiếng Việt tự host qua gói npm `@fontsource`.
- **Nhãn** tên, cấp bậc, bong bóng chat là phần tử HTML gắn theo vị trí 3D (CSS2DRenderer).
- **Âm thanh** tổng hợp bằng Web Audio, không có file âm thanh:
  - Hiệu ứng: mõ (cốc), chuông đồng (ngân dài), "Bongggg" (chuông chói), quét lá, chặt củi, nước, chim, muỗi, tiếng ợ, biến hình thăng cấp.
  - Nhạc Chùa: drone + hợp âm lofi + mõ nhẹ.
  - Nhạc Bar: 4 bài DJ (mục 8.4).

  Âm thanh chỉ bật sau lần click đầu tiên (chính sách autoplay của trình duyệt).

## 11. Mạng, đồng bộ, lưu trữ

- **Server có quyền quyết định:** luật chơi, điểm, phần thưởng, thời gian nhịp, kết quả ngẫu nhiên, ai là Phương Trượng.
- **Di chuyển:** client tự di chuyển (va chạm theo dữ liệu map dùng chung) và gửi tư thế 15 lần/giây.
  - Server kiểm tra tốc độ (≤ tốc độ tối đa × buff × 1,3) và biên map, sai thì kéo về.
  - Server gửi snapshot vị trí 15 lần/giây; client nội suy người khác trễ 100 ms.
- **Tương tác:** server kiểm tra khoảng cách tới trạm theo tọa độ trong map dùng chung, dung sai +1 m.
- **Đồng bộ đồng hồ:** ping/pong lúc vào game rồi mỗi 10 giây, lấy mẫu RTT nhỏ nhất để tính độ lệch. Mọi mốc thời gian của mini-game nhịp đều theo giờ server.
- **Kiểm tra đầu vào:** mọi gói client → server kiểm tra bằng schema (zod), có giới hạn tần suất (di chuyển 30/giây, thao tác 20/giây, chat 1/giây). Gói sai bị bỏ qua.
- **Lưu hồ sơ:**
  - Mặc định ghi file JSON (`DATA_DIR`, ghi nguyên tử qua file tạm + rename). Có `MONGODB_URI` thì dùng MongoDB (collection `profiles`).
  - Ghi trễ 5 giây khi có thay đổi, ghi ngay khi rời phòng và khi tắt server.
  - Hồ sơ có số phiên bản `v` để nâng cấp cấu trúc sau này.

## 12. Yêu cầu phi chức năng

- **Trình duyệt:** Chrome, Edge, Firefox bản mới trên máy tính, cần WebGL2.
- **Hiệu năng:** 60 fps với 20 người trên laptop tầm trung ở 1080p; JS tải lần đầu ≤ 3 MB.
- **Triển khai:** một tiến trình Node duy nhất phục vụ cả file client lẫn Socket.io trên `PORT`; `/healthz` trả `ok`.
- **Không lộ:** `playerKey` của người khác, stack trace, đường dẫn file.

## 13. Kiểm thử và tiêu chí chấp nhận

**Kiểm thử tự động:**
- *Unit test* (vitest) cho luật dùng chung: cấp bậc, hệ số, chấm nhịp, sinh bài kinh, sơ đồ đàn tràng, chia vai, trả thưởng Bầu Cua, chấm QTE chuông, chấm nhảy.
- *Test tích hợp server:* chạy server thật trên cổng ngẫu nhiên, dùng nhiều `socket.io-client` giả làm người chơi để đi qua các luồng chính.

**Công cụ thử nghiệm:**
- Script **bot** `npm run bots -- --room ABCD --count 8` thả người ảo vào phòng: đi lại, chat, tham gia co-op. Dùng để thử khi chơi một mình.
- **Kiểm tra hình ảnh** bằng trình duyệt, hai tab là hai người chơi.

**Tiêu chí chấp nhận:**
- **AC-01:** Hai trình duyệt vào cùng mã phòng, thấy nhau di chuyển mượt, chat và emote hiện cho cả hai.
- **AC-02:** Đạt mốc cấp thì hiện banner, đổi áo, mở quyền đúng bảng mục 5. Cổng Chánh Điện chặn người dưới 101 Công Đức.
- **AC-03:** Phương Trượng là người cao điểm nhất phòng, chỉ host mới mở được menu H, quyền chuyển ngay khi có người vượt điểm.
- **AC-04:** Mỗi hoạt động ở mục 7 và 8 chạy đúng luật và thưởng đúng công thức; số liệu khớp `balance.ts`.
- **AC-05:** Combo 20 khi tụng kinh kích hoạt Hào quang ×2 cho cả phòng; gõ trật nhịp hoặc trượt thì vang Bongggg và combo về 0.
- **AC-06:** Hạ Sơn / Hồi Sơn chuyển cả phòng. Đổi Đức → Xu, Bao cả quán, Vé VIP trừ và cộng đúng, lưu bền.
- **AC-07:** Tắt rồi bật server (file store) hoặc khởi động lại trên Render (Mongo) không mất Công Đức, Đức, Xu, VIP, đồ đã mở khóa.
- **AC-08:** `npm run build` thành công; `npm start` phục vụ game trên `PORT`; `npm test` pass.
- **AC-09:** Có `render.yaml`, script `npm run share` (ngrok) và hướng dẫn deploy tiếng Việt.

## 14. Deploy

- **Chạy local:** `npm install`, `npm run dev` (Vite + server chạy song song), hoặc `npm run build`, `npm start`.
- **Chơi ngay qua ngrok:** `npm run share` (build, start server, rồi `ngrok http <PORT>`) và gửi link https cho bạn bè. Máy user đã có ngrok cấu hình hợp lệ. AI chỉ mở tunnel khi user xác nhận.
- **Render:**
  - Blueprint `render.yaml`: web service runtime Node, gói free, `npm ci && npm run build`, `npm start`, health check `/healthz`, biến `MONGODB_URI` khai báo `sync: false` để user tự dán.
  - Hướng dẫn trong `README.md` (tiếng Việt):
    1. Tạo repo GitHub và push code.
    2. Tạo cluster MongoDB Atlas M0, mở IP `0.0.0.0/0`, lấy connection string.
    3. Render → New Blueprint → chọn repo → dán `MONGODB_URI`.
  - Lưu ý gói free: server ngủ sau 15 phút không có truy cập, mở lại mất khoảng 1 phút.

## 15. Các điểm AI tự chốt (cần user biết)

1. **Phương Trượng** là người cao điểm nhất phòng, không cần một mốc Công Đức cố định.
2. Tầng "Đại Đức / Thượng Tọa" được tách tên: **Đại Đức** 1.501–4.000, **Thượng Tọa** 4.001+ (cùng quyền).
3. Tách **Công Đức tích lũy** (xếp cấp, không tiêu) và **Đức khả dụng** (để tiêu), để đi bar không bị tụt cấp.
4. **Đàn tràng** đặt ngoài sân để Tiểu Đồng phụ được; Chánh Điện chặn người dưới 101.
5. **Thỉnh chuông co-op** tách khỏi tiếng chuông "bắt đầu thời khóa" của Phương Trượng.
6. **Hào quang** cần ≥ 2 người tham gia (trừ phòng 1 người). **Gõ trật nhịp** cũng làm đứt combo.
7. Nấu cơm hoàn hảo cho buff **No bụng** (+20% tốc độ, Công Đức ×1,1) thay cho "hồi năng lượng".
8. "Nghiệp / Tạp niệm" từ bar gộp thành **Tạp Niệm** (lưu bền); "Độ cồn" thành **Độ Say** (tạm thời).
9. **"Bao quán"** = bỏ Đức để cả phòng nhận Xu. Xúc xắc là **Bầu Cua Cá Cọp**, chỉ dùng Xu ảo.
10. Đại lễ từ 4 người trở lên: chỉ vai **Bày lễ** được đặt lên đàn, các vai khác chuyển đồ qua **Bàn soạn lễ**.
11. Mọi con số cân bằng nằm trong `shared/src/config/balance.ts` để chỉnh sau khi chơi thử.
12. Góc nhìn thứ nhất (theo yêu cầu bổ sung) kèm phím **V** xem tạm góc thứ ba, để người chơi còn thấy áo và emote của chính mình.
