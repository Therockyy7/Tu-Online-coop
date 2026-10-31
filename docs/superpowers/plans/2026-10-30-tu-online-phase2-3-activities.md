# Tu Online — Kế hoạch Phase 2 + 3: Hoạt động Chùa & Quán Bar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Không git commit** — user tự commit.

**Goal:** Cài đặt đủ 19 hoạt động của spec mục 7–8 trên framework Phase 1, mỗi hoạt động gồm luật thuần dùng chung, module server, module client và test.

**Architecture:** Mỗi hoạt động `<id>` là một "lát dọc" độc lập:

```text
shared/src/activities/<id>.ts           kiểu public state, payload sự kiện/thao tác, luật thuần
server/src/activities/<id>/index.ts     ActivityServerModule (server quyết định kết quả)
client/src/activities/<id>/index.ts     ActivityClientModule (+ <id>.css nếu cần)
shared/tests/<id>.test.ts               test luật thuần
server/tests/activities/<id>.test.ts    test module với FakeActivityContext
```

Phiên chính đăng ký module vào `server/src/activities/registry.ts` và `client/src/activities/registry.ts` sau khi agent xong (agent **không** sửa registry, `shared/src/index.ts` hay file của hoạt động khác).

**Tech Stack:** như Phase 1 (TypeScript 5.9, Three.js 0.186, Socket.io 4.8, zod 4, Vitest 5).

Spec: [`docs/superpowers/specs/2026-10-30-tu-online-design.md`](../specs/2026-10-30-tu-online-design.md) mục 7–8. Mẫu chuẩn: **Chẻ củi** (`shared/src/activities/chop.ts`, `server/src/activities/chop/`, `client/src/activities/chop/`).

---

## Quy ước chung cho mọi hoạt động

1. **Server quyết định:** điểm, phần thưởng, ngẫu nhiên (`ctx.rng`), thời gian (`ctx.now()`). Mọi `data` từ client đều validate bằng zod. Thời điểm bấm phím do client gửi theo giờ server và được kiểm hợp lý (không ở tương lai, không cũ quá 1,5 giây).
2. **Public state gọn:** `ctx.setState` mỗi khi thay đổi. Trạng thái chạy liên tục (vị trí NPC, nhiệt bếp…) throttle ≤ 5–10 lần/giây; số làm tròn.
3. **Sự kiện riêng tư** cho từng người dùng `ctx.emit(type, data, pid)`. Âm thanh người khác cần nghe: `ctx.fx({type:'sound', …}, others)`; người thao tác tự phát âm ngay ở client.
4. **Góc nhìn thứ nhất:**
   - QTE / thanh nhịp dùng `ui.openOverlay` (không modal, giữ khóa chuột).
   - Lựa chọn, nhập liệu, bấm chuột dùng `ui.openPanel` / `ui.choose` (modal; engine tự thả chuột).
   - Trạm ngồi/đứng cố định thì `ctx.snapTo(x, z, ry)` + `ctx.lockMovement(true)`.
   - Hoạt ảnh hành động qua `ctx.setLocalAnim` (viewmodel tay cũng chạy theo).
5. **Nhãn gợi ý** qua `prompt(station)`:
   - Ẩn (`null`) khi không làm gì được, ví dụ trạm Thả xuống ao khi tay không cầm con vật.
   - Đổi chữ khi cần thông tin, ví dụ "Đổ lá (12 lá)".
6. **Bộ đếm dùng chung của phòng** (`ctx.shared`):
   - `firewood`: Chẻ củi cộng, Nấu cơm trừ.
   - `rice_stock`, `veg_stock`: Nhập kho cộng, Nấu cơm trừ.
   - `dj_track`: chỉ số trong `DJ.tracks`.
   - `dj_started_at`: giờ server phách 0 của bài DJ.
7. **Buff phòng:** `hao_quang` (Tụng kinh), `no_bung` (Nấu cơm) qua `ctx.addBuff('room', …)`.
8. **Menu Phương Trượng:** module client trả `hostMenuItems()`. Phía server nhận qua `onHostAction` (server lõi đã kiểm người gửi là host).
9. **Map đổi giữa chừng:** `onMapChange` dọn mọi phiên. Co-op đang chạy thì `isBusy()` trả true để chặn Hạ Sơn / Hồi Sơn.
10. **Không TODO, không bản "tạm"**; chữ tiếng Việt có dấu; dọn mọi thứ trong `onClose`/`unmount`.

## Phân công (workflow Phase 2 + 3)

| Agent | Hoạt động | Spec |
|---|---|---|
| A | `sweep` Quét lá, `water` Xách nước, `release` Phóng sinh | 7.1, 7.3, 7.5 |
| B | `meditate` Thiền định, `wardrobe` Tủ áo | 7.4, 7.12 |
| C | `guest` Đón khách vãng lai, `restock` Nhập kho | 7.10 |
| D | `cook` Nấu cơm chay tập thể | 7.6 |
| E | `chant` Công phu tụng kinh — gõ mõ | 7.7 |
| F | `bell` Thỉnh Đại Hồng Chung | 7.8 |
| G | `ceremony` Đại lễ cúng dường | 7.9 |
| H | `exchange` Quầy đổi Đức, `drink` Gọi đồ uống, `truthwheel` Vòng quay | 8.1, 8.2, 8.7 |
| I | `dj` DJ Chiếm Sóng, `dance` Thi nhảy | 8.3, 8.4 |
| J | `mixology` Thi pha chế | 8.5 |
| K | `baucua` Bầu Cua Cá Cọp | 8.6 |

Mỗi agent có một reviewer độc lập chạy ngay sau khi agent đó xong. Phiên chính đăng ký module, chạy toàn bộ test, rồi chơi thử bằng trình duyệt và bot.

## Ghi chú thiết kế từng hoạt động (bổ sung cho spec, chủ yếu về giao thức và góc nhìn thứ nhất)

### A — Quét lá / Xách nước / Phóng sinh
- **Quét lá:**
  - **Lá rụng:** server giữ danh sách `{id, x, z, sx, sz, spawnAt, settleAt}` (`sx/sz`: vị trí trên tán cây; trôi theo gió tới `x/z` trong `SWEEP.driftMs`). Public state toàn bộ lá, throttle 2 lần/giây, tọa độ làm tròn 0,1 m. Client vẽ bằng một `InstancedMesh` lá bồ đề hình tim, lá đang rơi chao lượn.
  - **Quét:** giữ Space khi cầm chổi → anim `sweep`, mỗi `SWEEP.sweepIntervalMs` gửi `sweep {x, z, ry}`. Server gom lá trong nửa hình tròn phía trước, bán kính `sweepRadius`.
  - **Bao lá:** hiện dưới tâm ngắm, dạng "Bao lá 12/30".
  - **Tạp niệm:** chữ hiện trôi trước mặt kèm phím. Server sinh và kiểm thời hạn `thoughtWindowMs`.
  - Gốc cây: "Đổ lá vào gốc cây (12 lá)", ẩn khi bao rỗng. Giá chổi: lấy / trả chổi.
- **Xách nước:**
  - Giếng: E mở overlay kéo gàu (A/D xen kẽ 12 lần, server kiểm tổng thời gian ≥ `crankMinMs`) → cầm `water_bucket`.
  - Chum: E → đổ (anim `pour`). Mực nước chum nằm trong public state → `world.controls.setJarLevel`.
- **Phóng sinh:** xe phóng sinh: E → `ui.choose` các con còn trong xe → cầm `animal`. Ao/rừng chỉ hiện gợi ý khi đang cầm con vật. Thả đúng thì có hoạt cảnh nhỏ (cá nhảy tạo `burst splash`, chim vỗ cánh bay đi).

### B — Thiền định / Tủ áo
- **Thiền:**
  - E ở bồ đoàn → `snapTo` + anim `sit` (engine hạ mắt xuống 0,85 m). Server gửi lịch nhiễu (seed) trong `actOpen`.
  - Client mô phỏng con lắc 40 giây trên overlay (vạch cung xanh/vàng/đỏ; con lắc treo phía trên, A/D đẩy). Muỗi bay qua màn hình kèm tiếng vo ve và chữ phím; "Rầm!" thì rung camera.
  - Gửi `finish {score, outcomes}`. Server kiểm thời lượng (≥ `durationMs − durationSlackMs`) và kẹp điểm 0..1.
- **Tủ áo:**
  - Panel 3 tab Áo / Mũ / Phụ kiện. Món chưa mở khóa hiện mờ kèm điều kiện ("Cần 300 Công Đức", "Cần Vé VIP").
  - Có ô xem trước 3D quay tròn (renderer nhỏ riêng trong panel, dispose khi đóng).
  - Gửi `equip` → server `ctx.setOutfit`.

### C — Đón khách / Nhập kho
- **Khách vãng lai:**
  - **Server:** sinh khách tại `gate_wait` với tên (`NPC_NAMES`) và seed ngoại hình. Đang được đón thì server di chuyển khách bám theo người dẫn (`GUEST.followSpeed`, cách 1,5 m, dùng `resolveMove`). Public state throttle 5 lần/giây.
  - **Client:** `world.createNpc(npcLook('visitor', seed))`, nội suy vị trí. Điểm tương tác động "Đón khách: Cô Ba" chỉ hiện với Tri Khách trở lên.
  - **Giao khách:** người dẫn đứng ở trạm `temple_steps` và khách ở trong vòng 4 m → khách vái (`bow`), +6 Công Đức, rồi đi ra cổng biến mất. Chờ quá `waitMs` thì khách bỏ về.
- **Nhập kho:** E ở xe tiếp tế → `ui.choose` bao gạo / thùng rau (chỉ Tri Khách+) → cầm `supply`. E ở kho → kho +5, +3 Công Đức. Public state: số gạo và rau trong kho.

### D — Nấu cơm chay
- **Pha:** idle → lobby (10 giây) → cooking (150 giây) → result.
- **Public state:** pha, giờ kết thúc, người tham gia + vai gợi ý, nhiệt bếp, tiến độ chín / thanh khét của nồi, tiến độ đảo chảo, số mâm cần / đã dọn, kho gạo / rau / củi.
  - Nhiệt mô phỏng trên server ở tick (throttle gửi 5 lần/giây).
  - `world.controls.setStove` cho lửa và khói.
  - Thanh tiến độ nổi trên nồi/chảo bằng CSS2D hoặc overlay khi đứng gần.
- **QTE từng trạm** (overlay):
  - Vo gạo: bấm Space 10 lần.
  - Thái rau: chuỗi 6 phím mũi tên.
  - Đảo chảo: giữ Space 8 giây, nhiệt phải ≥ vùng xanh.
  - Quạt lửa: Space liên tục, giới hạn `bellowsMinIntervalMs`.
  - Bỏ củi: E ở lò khi đang cầm `firewood`. Lấy củi ở `woodpile` thì trừ `firewood`.
- **Dọn mâm:** cầm `rice_pot` hoặc `veggie_dish` → E ở Trai đường.

### E — Tụng kinh gõ mõ
- **Bắt đầu:** menu host "Bắt đầu thời khóa tụng kinh" → `fx` chuông lớn + banner → lobby 20 giây.
- **Chọn kinh:** người chọn kinh (Đại Đức+ cao điểm nhất, không có thì host) nhận panel chọn bài + nhịp.
- **Bài tụng:** `chartFor(sutra, tempo, seed)` là hàm thuần trong shared, trả mốc thời gian từng nốt.
  - Mọi người trong Chùa nghe `audio.startBeatTrack('chant_lofi', startAt, bpm)` và mõ dẫn `audio.playAt('mo_lead', beat)`.
  - Người tham gia ngồi bồ đoàn, xem làn nốt overlay ở đáy, gõ Space/J (anim `strike`, âm `mo`).
- **Chấm điểm (server):** chấm từng người, chốt nốt sau `finalizeDelayMs`, phát sự kiện cả phòng `{i, ok, blame}`.
  - Đứt combo: `fx` âm `bong` cho cả phòng, người bị blame nháy đỏ.
  - Combo 20: `ctx.addBuff('room','hao_quang')` + `fx glow chanh_dien` + banner.
- `isBusy` trong lobby/playing.

### F — Thỉnh Đại Hồng Chung
- E ở dây kéo → nắm dây (snapTo, anim `pull`). Đủ 3 người thì đếm ngược 3 giây.
- **Mỗi tiếng chuông:** server phát `pull {strike, at}`.
  - Overlay thanh lực dao động tam giác chu kỳ `oscillationMs`, tính từ lúc người đó nhấn.
  - Gửi `release {strike, pressT, releaseT}`. Server tính lực, độ lệch thời điểm thả, q.
  - Sự kiện cả phòng `{strike, q}` → `audio.bell(q)`, `world.controls.hitBell(q)`, rung camera theo q.
- Trong lúc chờ: `world.controls.setBellPull` theo lực trung bình của người kéo (sự kiện throttle).
- Hết 3 tiếng thì nghỉ `cooldownMs` (public state). `isBusy` trong lúc thỉnh.

### G — Đại lễ cúng dường
- **Mở lễ:** menu host "Mở Đại lễ cúng dường" (nghỉ 5 phút).
- **Public state:** active, `endsAt`, sơ đồ (`fruits[5]`, `vases[2]`, đèn, hương), đồ đã đặt, bàn soạn lễ (≤ 12 món), người tham gia + vai.
- **Đồ trên đàn:** vẽ bằng `createHeldItemMesh` đặt quanh neo `altar_top`. `world.controls.setAltarIncense(phần còn lại)`.
- **Trạm hái/cắm/châm/thắp:** cần giữ E (vòng tiến độ quanh tâm ngắm).
  - Client gửi `hold_start` / `hold_end`; server kiểm đủ thời lượng `pickHoldMs` / `arrangeHoldMs`.
  - Bàn hương đăng: `ui.choose` lấy đèn rỗng / lấy nén hương. Vò dầu: đèn rỗng → đèn đầy. Giá nến: đèn đầy → đèn thắp, hương → hương thắp.
- **Bàn soạn lễ:** panel đặt món đang cầm / lấy một món. **Đàn tràng:** panel các ô (yêu cầu + đã đặt); bấm ô để đặt món đang cầm.
- Từ 4 người trở lên chỉ vai Bày lễ được đặt lên đàn. Sai thì báo "Sai phong thủy!".

### H — Quầy đổi Đức / Đồ uống / Vòng quay
- **Quầy đổi:** panel 3 phần.
  - Đổi Xu: nhập số Đức, xem trước số Xu.
  - Bao cả quán: 100 Đức.
  - Vé VIP: 300 Đức, ẩn nếu đã VIP.

  Server kiểm số dư (`spendDuc`), cộng Xu cho cả phòng khi bao quán, banner + pháo giấy.
- **Đồ uống:** panel menu (giá có giảm VIP) → mua → cầm `drink_glass` → Space để uống (anim `drink`, tiếng ợ). Server cộng Độ Say + Tạp Niệm, bỏ ly.
- **Vòng quay:** E (nghỉ 15 giây cả quán) → server chọn người + loại + câu.
  - Public state `{startAt, endAt, finalAngle, targetPid, kind, text}`.
  - Client quay neo `truth_wheel_disc` (easing) kèm `wheel_tick`. Khi dừng: banner + tin hệ thống.

### I — DJ / Thi nhảy
- **DJ:**
  - Panel bàn DJ (chỉ DJ): 4 bài, Drop!, 4 màu đèn, còi hú.
  - Public state `{trackId, bpm, startedAt, theme, dropAt}`; server cập nhật `ctx.shared` `dj_track` / `dj_started_at`.
  - Mọi client ở Bar chạy `audio.startBeatTrack(track, startedAt, bpm)` liên tục và gọi `world.controls.onBeat` mỗi phách.
  - Drop: `controls.drop()` + `audio.djDrop()`.
  - Lúc vào Bar: DJ = Phương Trượng, bài mặc định `vinahouse_dac_dao`.
- **Thi nhảy:**
  - Mở vòng (DJ hoặc host, qua panel DJ hoặc menu host) → lobby 15 giây (E trên sàn để vào).
  - Vòng bắt đầu ở ranh ô nhịp kế tiếp của bài DJ đang phát (canh `dj_started_at` + bpm).
  - Bài nhảy `danceChart(seed, measures)` là hàm thuần. Overlay mũi tên kiểu Audition (mũi tên đỏ = đảo hướng).
  - Gửi `measure {i, ok, t}`; server chấm thời điểm Space, cộng điểm, phát bảng điểm.
  - Cuối vòng: xếp hạng, Xu, Tạp Niệm, `ctx.setDj(nhất)`.
  - Nhân vật nhảy `dance` / `dance2` / `dance3` theo kết quả.

### J — Thi pha chế
- **Phiên:** E ở trạm pha chế → mở ca (lobby 10 giây) → ca 90 giây.
- **Khách và đơn:** module client dựng khách NPC ở 6 bàn (`createNpc(npcLook('bar_guest', seed))`). Đơn hàng trong public state.
- **Làm ly** (panel ở trạm):
  1. Danh sách đơn, nhận đơn.
  2. Phím 1–6 nhập nguyên liệu.
  3. Lắc: Space theo 8 phách của bài DJ, overlay vòng nhịp.
  4. Cầm `cocktail` (variant = id công thức), mang tới bàn khách (E) để phục vụ.
- **Tip:** server tính từ độ chuẩn lắc và tốc độ. Bảng xếp hạng cuối ca.

### K — Bầu Cua Cá Cọp
- **Vòng chơi:** E ở bàn → panel đặt cược (modal, bấm chuột trái/phải lên 6 ô; hiện cược của mọi người).
  - Public state `{phase, endsAt, dice, bets}`.
  - Server dùng `ctx.rng` (seed crypto), trả thưởng đúng spec 8.6, cộng Tạp Niệm.
- **Hình:** 3 viên xúc xắc 3D (mặt vẽ bằng canvas) lắc trong bát trên neo `baucua_table_top`. Kết quả kèm âm `dice` / `coin`.

## Kiểm thử

- **Luật thuần (shared):** chấm điểm, sinh bài kinh/nhảy, sơ đồ đàn tràng, chia vai, trả thưởng Bầu Cua, chất lượng chuông, nhiệt bếp…
- **Module server:** `FakeActivityContext` (`server/tests/helpers/fakeContext.ts`, phiên chính viết) ghi lại `setState` / `emit` / `reward` / `toast` / `open` / `close`, có đồng hồ giả và `rng` seed cố định.
- **Tích hợp:** bot + chơi thử 2–3 tab trình duyệt.
- **Lệnh:** `npx vitest run shared server`, `npx tsc -p client`, `npx tsc -p server`.

---

## Prompt gốc của người dùng (cho plan này)

1. Bản thiết kế game gốc: phần 3 "Hệ thống nhiệm vụ & mini-game trong chùa" (co-op gõ mõ, đại lễ cúng dường, thỉnh Đại Hồng Chung; cá nhân: quét lá, nấu cơm chay, thiền, phóng sinh) và phần 4 "Room Quán Bar" (thi nhảy Audition, pha chế, DJ chiếm sóng, xúc xắc / vòng quay sự thật).
2. "phát triển trong D:\AI\Tu Online. Đồng thời tôi muốn có thể cùng nhau chơi, nên có thể Deploy web luôn".
3. "góc nhìn của Nhân vật là góc nhìn thứ nhất".
