# Tu Online — Kế hoạch triển khai Phase 1: Nền tảng

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Không git commit** — user tự commit (thư mục chưa `git init`).

**Goal:** Dựng một thế giới 3D nhiều người chơi chạy được: vào phòng bằng mã, đi lại trong Chùa và Bar dựng low-poly bằng code, chat + emote, cấp bậc + Phương Trượng, lưu tiến trình, framework mini-game (server + client) với 1 mini-game mẫu (Chẻ củi), bot test, sẵn sàng deploy.

**Architecture:** Một package Node duy nhất gồm 3 thư mục nguồn: `shared/` (luật, dữ liệu map, giao thức — dùng chung), `server/` (Express + Socket.io, server quyết định luật chơi, lưu hồ sơ File/Mongo), `client/` (Vite + Three.js, UI HTML/CSS phủ trên canvas). Mini-game là module cắm vào `ActivityHost` (server) và `ActivityClientModule` (client) qua hợp đồng kiểu TypeScript.

**Tech Stack:** Node 22, TypeScript 5.9.3, Vite 8, Vitest 5, Three.js 0.186, Socket.io 4.8, Express 5, zod 4, mongodb 7 (tùy chọn), esbuild (bundle server), tsx (dev), @fontsource Baloo 2 + Be Vietnam Pro.

Spec: [`docs/superpowers/specs/2026-10-30-tu-online-design.md`](../specs/2026-10-30-tu-online-design.md)

---

## Lộ trình tổng

| Phase | Nội dung | Plan |
|---|---|---|
| **1. Nền tảng** | Repo, hợp đồng, server lõi, client lõi, UI, nhân vật, 2 map, âm thanh, mini-game mẫu Chẻ củi, bot, khung deploy | **file này** |
| 2. Hoạt động Chùa | Quét lá, Xách nước, Thiền, Phóng sinh, Nấu cơm, Tụng kinh gõ mõ, Thỉnh chuông, Đại lễ, Tri Khách (đón khách, nhập kho), Tủ áo, menu host đầy đủ | viết sau Phase 1 (dựa trên framework thật) |
| 3. Quán Bar | Quầy đổi Đức, đồ uống + Độ Say, Thi nhảy, DJ, Pha chế, Bầu Cua, Vòng quay, VIP | viết sau Phase 2 |
| 4. Hoàn thiện | Review chéo, test nhiều người với bot, QA hình ảnh, ngrok, hướng dẫn Render + Atlas | viết sau Phase 3 |

## Cấu trúc file

```text
D:\AI\Tu Online\
├── package.json · tsconfig.base.json · vitest.config.ts · .gitignore · .node-version · render.yaml · README.md
├── scripts/
│   ├── dev.mjs            chạy song song server (tsx watch) + Vite
│   ├── build-server.mjs   esbuild bundle server → dist/server/index.js
│   ├── share.mjs          build nếu cần → start → ngrok http PORT
│   └── bots.ts            người chơi ảo (socket.io-client)
├── shared/src/
│   ├── types.ts           kiểu domain: Rank, Outfit, HeldItem, PlayerPublic, SelfState, RoomPublic, Profile, Buff…
│   ├── ids.ts             danh sách hằng runtime: ACTIVITY_IDS, ANIM_IDS, EMOTES, RANKS…
│   ├── protocol.ts        sự kiện Socket.io có kiểu + message
│   ├── config/balance.ts  MỌI con số cân bằng (spec mục 4–8)
│   ├── config/text.ts     chuỗi tiếng Việt dùng chung
│   ├── rules/*.ts         rank, karma, host, timing (thuần, có unit test)
│   ├── maps/*.ts          MapDef, dữ liệu temple/bar, va chạm dùng chung
│   └── util/*.ts          rng có seed, toán, tên
├── server/src/
│   ├── index.ts · config.ts
│   ├── net/               schemas (zod), rateLimit, connection
│   ├── rooms/             RoomManager, PartyRoom, ServerPlayer
│   ├── profiles/          ProfileStore (interface), FileProfileStore, MongoProfileStore, ProfileService
│   └── activities/        types (hợp đồng), ActivityHost, registry, <id>/
├── client/
│   ├── index.html · preview.html · vite.config.ts
│   └── src/
│       ├── main.ts · preview.ts
│       ├── net/           Net (socket có kiểu), ServerClock
│       ├── state/         GameState (store + sự kiện)
│       ├── engine/        Engine, CameraRig, Input, World, Players, LocalController, Interaction, Fx
│       ├── art/           kit (vật liệu/hình khối), avatar, props, temple/, bar/
│       ├── audio/         AudioEngine (sfx + nhạc tổng hợp)
│       ├── ui/            lobby, hud, chat, emotes, panel, toast/banner, chooser, settings, scoreboard, hostMenu
│       └── activities/    types (hợp đồng client), registry, <id>/
└── docs/superpowers/      specs/, plans/
```

Nguyên tắc: mỗi file một trách nhiệm; dữ liệu map ở `shared/` là nguồn sự thật cho cả hai phía; mọi số cân bằng nằm trong `balance.ts`.

## Hợp đồng chính (chi tiết đầy đủ nằm trong code của Task 2–4)

- `shared/src/types.ts`, `ids.ts`, `protocol.ts`: kiểu dữ liệu và sự kiện C2S/S2C.
- `server/src/activities/types.ts`: `ActivityServerModule`, `ActivityInstance`, `ActivityContext`.
- `client/src/activities/types.ts`: `ActivityClientModule`, `ClientActivityContext`.
- `client/src/ui/api.ts`: `UIApi` (panel, toast, banner, prompt, chooser, overlay…).
- `client/src/audio/api.ts`: `AudioApi` (`play`, `playAt` theo giờ server, `setMusic`, `startBeatTrack`).
- `client/src/art/api.ts`: `AvatarHandle`, `createAvatar`, `createHeldItemMesh`, `WorldBuilder` (dựng map → `WorldHandles`).
- `client/src/engine/worldApi.ts`: `WorldApi` cho mini-game (lấy nhóm 3D của trạm, đăng ký điểm tương tác động, hiệu ứng).

## Chiến lược thực thi

1. **Inline (phiên chính):** Task 1–4 + toàn bộ file hợp đồng + stub chạy được cho từng module client (để app chạy end-to-end ngay từ đầu).
2. **Workflow song song (Task 5–11):** mỗi agent **sở hữu riêng** thư mục/file của mình, chỉ đọc file hợp đồng, không sửa file của agent khác. Verify bằng typecheck (lọc lỗi theo file của mình) + unit test riêng.
3. **Inline (Task 12–15):** ghép nối, mini-game mẫu, bot, deploy, QA hình ảnh bằng trình duyệt (2 tab).

---

### Task 1: Khung repo và toolchain

**Files:** Create `package.json`, `tsconfig.base.json`, `shared/tsconfig.json`, `server/tsconfig.json`, `client/tsconfig.json`, `client/vite.config.ts`, `vitest.config.ts`, `scripts/dev.mjs`, `scripts/build-server.mjs`, `.gitignore`, `.node-version`, `client/index.html`.

- [ ] `npm install` các gói theo Tech Stack (phiên bản ghim chính xác).
- [ ] Alias `@shared/*` → `shared/src/*` trong tsconfig, Vite, Vitest, esbuild.
- [ ] Scripts: `dev`, `build` (vite build + build-server), `start` (`node dist/server/index.js`), `test` (`vitest run`), `typecheck` (`tsc -p shared && tsc -p server && tsc -p client`), `bots`, `share`.
- [ ] Verify: `npm run typecheck` → 0 lỗi; `npm test` → pass (passWithNoTests); `npm run build` → tạo `dist/client/index.html` và `dist/server/index.js`.

### Task 2: Hợp đồng dùng chung

**Files:** Create `shared/src/{types,ids,protocol}.ts`, `shared/src/config/{balance,text}.ts`, `shared/src/util/{rng,math,names}.ts`, `shared/src/index.ts`.

- [ ] Kiểu domain + danh sách ID + giao thức Socket.io có kiểu (C2S: `join` (ack), `ping` (ack), `pose`, `chat`, `emote`, `interact`, `drop`, `leaveActivity`, `act`, `host`, `bless`; S2C: `snap`, `playerJoined`, `playerLeft`, `playerPatch`, `self`, `room`, `chat`, `emote`, `actState`, `actEvent`, `actOpen`, `actClose`, `fx`, `toast`, `kicked`).
- [ ] `balance.ts` chứa toàn bộ số ở spec mục 4–8; `text.ts` chứa tên cấp, tên vật phẩm, câu chọc, danh sách Tạp niệm, câu hỏi Vòng quay.
- [ ] `rng.ts`: `mulberry32(seed)` + `pick/shuffle/int`; test tính tất định.
- [ ] Verify: `npm run typecheck`.

### Task 3: Luật thuần (TDD)

**Files:** Create `shared/src/rules/{rank,karma,host,timing}.ts`; Test `shared/tests/{rank,karma,host,timing,rng}.test.ts`.

Test cases bắt buộc:
- `rankOf(0)='tieu_dong'`, `rankOf(100)='tieu_dong'`, `rankOf(101)='hoa_thuong_tap_su'`, `rankOf(501)='tri_khach_tang'`, `rankOf(1501)='dai_duc'`, `rankOf(4001)='thuong_toa'`; `progressToNext`.
- `computeGain(10, 0, [])=10`; `computeGain(10, 100, [])=5`; `computeGain(10, 0, [hao_quang])=20`; `computeGain(1, 100, [])=1` (tối thiểu 1); buff hết hạn không tính.
- `pickHost`: điểm cao nhất thắng; bằng điểm → `joinedAt` nhỏ hơn; bỏ qua người mất kết nối; phòng rỗng → null.
- `judge(deltaMs, windows)`: biên ±45 → perfect, ±100 → good, còn lại → miss; `estimateOffset(samples)` dùng mẫu RTT nhỏ nhất.
- `unlockedOutfit(peakCongDuc, vip)` đúng spec 7.12.
- [ ] Viết test → chạy thấy FAIL → cài đặt → chạy PASS: `npx vitest run shared`.

### Task 4: Dữ liệu map + va chạm dùng chung (TDD)

**Files:** Create `shared/src/maps/{types,temple,bar,collision,index}.ts`; Test `shared/tests/{collision,maps}.test.ts`.

- [ ] `MapDef` gồm `bounds`, `spawn`, `stations[]` (id, kind, activity, x, z, r, label, data), `colliders[]` (circle/box), `gates[]` (rank/vip), `zones[]`, `roofs[]`.
- [ ] Bố cục đúng sơ đồ spec 6.1/6.2; mọi trạm của Phase 1–3 được khai báo ngay (để các agent sau dùng).
- [ ] `resolveMove(from, to, map, ctx)` trượt dọc tường, chặn biên, chặn cổng theo `ctx.canPassGate(gate)`.
- [ ] Test: không xuyên tường box/circle; trượt dọc tường; Tiểu Đồng bị chặn ở cửa Chánh Điện, Hòa Thượng đi qua; non-VIP bị chặn dây nhung; mọi station id duy nhất; mọi station nằm trong bounds và không nằm trong collider; spawn hợp lệ.
- [ ] Verify: `npx vitest run shared`.

### Task 5 (workflow): Server lõi

**Files (sở hữu):** `server/src/**` trừ `server/src/activities/<id>/`; Test `server/tests/**`.

- [ ] `FileProfileStore` (ghi nguyên tử), `MongoProfileStore` (import động khi có `MONGODB_URI`), `ProfileService` (cache, ghi trễ 5 giây, `flushAll`).
- [ ] `RoomManager` (mã phòng, phòng `CHUA`, hủy sau 5 phút rỗng), `PartyRoom` (join/rejoin trong 60 giây, `pose` kiểm tốc độ + `resolveMove`, snapshot 15Hz, chat/emote có rate limit, host tính lại, thăng cấp → `fx` banner, held/drop, buff, quỳ sám hối, ban phước, bổng lộc + quỹ, Hạ Sơn/Hồi Sơn đếm 5 giây và chặn khi `isBusy`).
- [ ] `ActivityHost`: tạo instance mỗi module cho mỗi phòng, định tuyến `interact` (kiểm khoảng cách trạm + quyền), `act`, `leaveActivity`, host action của module, `tick` 20Hz, gửi `publicState` cho người mới vào.
- [ ] `index.ts`: Express phục vụ `dist/client`, `/healthz`, Socket.io, tắt êm (flush hồ sơ).
- [ ] Test tích hợp (`socket.io-client`, server cổng ngẫu nhiên, File store thư mục tạm): tạo/vào phòng; 2 client thấy nhau + nhận `snap`; chat + emote; rate limit chat; host = cao điểm, chuyển khi vượt; thăng cấp 101 → `self` + `playerPatch` rank; drop; quỳ sám hối chặn `pose`; go_bar đếm và đổi map, bị chặn khi bận; hồ sơ còn sau khi khởi động lại server; key khác không thấy key người khác.
- [ ] Verify: `npx vitest run server` PASS; `npx tsc -p server` 0 lỗi.

### Task 6 (workflow): Client engine

**Files (sở hữu):** `client/src/{main.ts,net/**,state/**,engine/**,activities/registry.ts,activities/context.ts}`.

- [ ] `Net` (socket có kiểu, tự kết nối lại + join lại bằng key + mã phòng), `ServerClock` (ping 5 lần lúc đầu, 10 giây/lần sau).
- [ ] `GameState` (me, players, room, activity states; sự kiện).
- [ ] `Engine` (WebGLRenderer, sRGB, bóng, vòng lặp, resize, CSS2DRenderer, lượt vẽ viewmodel riêng), `FirstPersonCamera` (mắt ~1,35 m, chuột xoay qua pointer lock, ±85°, nhún khi đi, rung, say; **V** chuyển góc thứ ba sau lưng có chống xuyên tường), `Input` (trạng thái phím + chuột + ngăn xếp bắt phím cho mini-game/chat, tự thả/khóa chuột khi mở/đóng bảng).
- [ ] `World` (dựng map qua `WorldBuilder`, nhóm `station:<id>`, điểm tương tác động; mái luôn hiện), `Players` (avatar, nội suy 100ms, nhãn tên/cấp, bong bóng chat, emote; nhân vật của mình chỉ đổ bóng ở góc nhìn thứ nhất), `LocalController` (WASD theo hướng nhìn, va chạm `resolveMove`, gửi pose 15Hz với ry = hướng nhìn, khóa khi quỳ/mini-game, chao khi say), `Interaction` (chọn trạm trong tầm với **và** trong ~45° trước mặt, tâm ngắm, prompt E, Q bỏ đồ, B ban phước người ở tâm ngắm, H menu host).
- [ ] `Fx`: số "+N Công Đức" bay lên, pháo giấy, mưa cánh sen, rung, chớp.
- [ ] `ClientActivityContext` + registry: định tuyến `actState/actEvent/actOpen/actClose` tới module, `onKey` bắt phím khi mở.
- [ ] Verify: `npx tsc -p client` 0 lỗi ở file mình; chạy `npm run dev`, mở 2 tab thấy nhau (với stub art/UI).

### Task 7 (workflow): UI

**Files (sở hữu):** `client/src/ui/**`, `client/src/styles/**`.

- [ ] Cài đặt `UIApi`: lobby (tên, tạo/vào mã/chùa chung, đọc `?r=`), HUD (spec mục 9), chat (Enter, 120 ký tự, textContent), thanh emote 1–8, panel/overlay, toast, banner, chooser, settings (âm lượng, mã khôi phục, copy link), scoreboard (Tab), menu host (H) với khe cho hành động của mini-game.
- [ ] Theme: font Baloo 2 (tiêu đề) + Be Vietnam Pro (chữ), màu theo palette chùa/bar, góc bo tròn, nút to vui mắt.
- [ ] Verify: typecheck; xem bằng `preview.html?view=ui`.

### Task 8 (workflow): Nhân vật + đạo cụ

**Files (sở hữu):** `client/src/art/{kit,avatar,props}.ts` (kit do phiên chính tạo sẵn, agent chỉ được bổ sung helper).

- [ ] `createAvatar(look)`: hạt đậu capsule, mắt to, tay chân nhỏ, đầu trọc (tu sĩ) hoặc tóc (NPC), 5 áo tu + đồ thường NPC, mũ, phụ kiện, bộ Phương Trượng, mây Tạp Niệm, mờ khi mất kết nối.
- [ ] Hoạt ảnh thủ tục cho mọi `AnimId` + co giãn nảy khi đi.
- [ ] `createHeldItemMesh(item)` cho mọi `HeldItemKind`/variant.
- [ ] `createFirstPersonView(look)`: đôi tay + vật cầm trước camera (góc nhìn thứ nhất), động tác cho mọi hành động có dùng tay.
- [ ] Verify: typecheck; `preview.html?view=avatars` hiện lưới đủ áo/mũ/phụ kiện/anim.

### Task 9 (workflow): Map Chùa 3D

**Files (sở hữu):** `client/src/art/temple/**`.

- [ ] `buildTemple(map, kit)` đúng bố cục `shared/src/maps/temple.ts`: Chánh Điện (tượng Phật, 10 bồ đoàn + mõ, mái cong, cửa), gác chuông + Đại Hồng Chung + chày, nhà bếp, Trai đường, kho, bãi củi, giếng, chum, vườn 7 cây quả, 4 luống hoa, ao + sen, bìa rừng, thiền viên, cổng Tam Quan, cổng Hạ Sơn, Tăng xá + tủ áo, đàn tràng + bàn soạn lễ, bàn hương đăng, lư hương, xe phóng sinh, xe tiếp tế, giá chổi, cây bồ đề lớn.
- [ ] Mái tách riêng theo `roofs[]`; nhóm `station:<id>` đặt đúng tọa độ; hoạt ảnh nền (cây đung đưa, nước gợn, khói hương, chim bay).
- [ ] **Hiên Tăng Đoàn** (spec 7.13): 5 khung chân dung trên tường mặt Nam Tăng xá tại `PORTRAIT_FRAME_XS`/`PORTRAIT_WALL_Z`, texture từ `client/src/content/gallery.ts`, tâm tranh ngang tầm mắt (~1,45 m), mái hiên, đèn lồng, bảng "Tăng Đoàn Tu Online"; không hương án.
- [ ] Góc nhìn thứ nhất: nội thất + trần/mặt dưới mái đẹp ở tầm mắt, mọi mặt công trình đều hoàn thiện, vòm trời + núi xa bao quanh.
- [ ] Verify: typecheck; `preview.html?view=temple` (orbit) và đi thử trong game.

### Task 10 (workflow): Map Bar 3D

**Files (sở hữu):** `client/src/art/bar/**`.

- [ ] `buildBar(map, kit)`: sàn LED 8×6 (API đổi màu theo nhịp), DJ booth, quầy bar 4 trạm + kệ rượu, bàn NPC, bàn Bầu Cua, vòng quay, khu VIP + dây nhung, quầy đổi Đức, cửa Hồi Sơn, cầu disco, đèn neon.
- [ ] Hàm điều khiển ánh sáng: `onBeat(beatIndex, bpm)`, `drop()`, `setLightTheme(theme)`.
- [ ] Góc nhìn thứ nhất: trần có giàn đèn, chi tiết ở tầm mắt.
- [ ] Verify: typecheck; `preview.html?view=bar`.

### Task 11 (workflow): Âm thanh tổng hợp

**Files (sở hữu):** `client/src/audio/**`.

- [ ] `AudioApi`: mở khóa sau click đầu, kênh master/music/sfx, mọi `SfxId` tổng hợp bằng Web Audio (mõ, chuông ngân, Bongggg, quét, chặt, nước…), nhạc: `temple_ambience`, `chant_lofi`, 4 bài DJ; `startBeatTrack(trackId, startServerMs, bpm)` canh theo giờ server; `playAt(sfx, serverMs)`.
- [ ] Verify: typecheck; `preview.html?view=audio` có nút nghe thử từng âm.

### Task 12 (inline): Mini-game mẫu Chẻ củi

**Files:** `server/src/activities/chop/index.ts`, `client/src/activities/chop/index.ts`, `server/tests/activities/chop.test.ts`.

- [ ] Server: chiếm thớt, 8 khúc, tham số khúc do server sinh (vị trí vùng, chu kỳ, t0), client gửi thời điểm bổ theo giờ server, server chấm theo `pos(t)`, thưởng 3/2/0, +củi vào kho (kho củi lưu ở state phòng cho Phase 2 dùng).
- [ ] Client: panel QTE thanh ngang, Space bổ, anim `chop`, âm `chop`/`chop_miss`, Esc thoát.
- [ ] Test: chấm đúng hoàn hảo/tốt/trượt theo thời điểm; không bổ được khi xa thớt; thớt bận; 8 khúc thì kết thúc.

### Task 13 (inline): Bot

**Files:** `scripts/bots.ts`. Bot vào phòng, đi lang thang theo trạm, chat câu ngẫu nhiên, emote; tham số `--room --count --url`.

### Task 14 (inline): Khung deploy

**Files:** `render.yaml`, `scripts/share.mjs`, `README.md`, `.node-version`.

### Task 15 (inline): Ghép nối + QA

- [ ] `npm run typecheck`, `npm test`, `npm run build`, `npm start` → mở 2 tab trình duyệt, kiểm AC-01, AC-02, AC-03, AC-08 bằng ảnh chụp màn hình.
- [ ] Sửa lỗi ghép nối; ghi lại giới hạn còn lại cho Phase 2.

---

## Prompt gốc của người dùng (cho plan này)

1. Gửi bản thiết kế game gồm 5 phần:
   - Core loop & progression: Công Đức / Tạp Niệm, chuyển Đức sang tiền bao quán / Vé VIP, mang Nghiệp từ bar về chùa hóa giải.
   - Bảng 5 cấp bậc + đặc quyền: Tiểu Đồng → Phương Trượng.
   - Nhiệm vụ co-op: gõ mõ đồng điệu, đại lễ cúng dường, thỉnh Đại Hồng Chung. Mini-game cá nhân: quét lá, nấu cơm chay, thiền, phóng sinh.
   - Phác thảo Quán Bar: nhảy Audition, pha chế, DJ chiếm sóng, xúc xắc / vòng quay sự thật.
   - Kiến trúc đề xuất: Phaser hoặc Three.js/Babylon, Node + Colyseus hoặc Socket.io, soundboard.

   Kèm yêu cầu: "phát triển trong D:\AI\Tu Online. Đồng thời tôi muốn có thể cùng nhau chơi, nên có thể Deploy web luôn".
2. Chọn: đồ họa **3D low-poly hài hước**; deploy **ngrok chơi ngay + Render lâu dài**; thiết bị **chỉ máy tính**; voice **chat chữ + emote, nói chuyện qua Discord**.
3. Duyệt thiết kế: "Ổn, làm Cách A và tiếp tục".
4. (Bổ sung giữa chừng) "C:\Users\LENOVO\Downloads\My Documents [30-10-2026 10_08] — trong này là các ảnh, hãy thiết kế thêm chỗ để treo các ảnh này vào trong chùa Tu hành" → 5 ảnh chân dung tu sĩ, treo ở Hiên Tăng Đoàn (spec 7.13).
5. (Bổ sung giữa chừng) "góc nhìn của Nhân vật là góc nhìn thứ nhất" → đổi camera sang góc nhìn thứ nhất (chuột xoay, tâm ngắm, tay + vật cầm trước mắt), thêm V xem tạm góc thứ ba (spec mục 0, 9, 10).
