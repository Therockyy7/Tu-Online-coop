# Quán Bar mở rộng (nhạc DJ, bàn DJ mở, Sòng Công Đức 5 trò) — Implementation Plan

> **For agentic workers:** thực thi bằng **Workflow** (ultracode bật; tối đa ~3 agent cùng lúc vì tài khoản hay chạm giới
> hạn phiên). Mỗi làn = 1 agent sở hữu đúng danh sách file của mình. Không commit (user tự commit). Tiến độ ghi ở
> `2026-11-01-quan-bar-song-bac-tien-do.md`.

**Goal:** Bar phát 4 bài remix user gửi qua bàn DJ ai cũng đứng chỉnh được, và có phòng Sòng Công Đức với 5 trò may rủi
cược bằng Công Đức thật (Tài Xỉu, Xì Dách, Bài Cào, Nổ Hũ, Đua Ngựa), server quyết định, có test.

**Architecture:** theo khuôn module sẵn có — luật thuần + kiểu trạng thái ở `shared/src/activities/<trò>.ts`, module server
`server/src/activities/<trò>/index.ts` (đăng ký sẵn trong registry), module client `client/src/activities/<trò>/`
(đăng ký sẵn), đồ tĩnh của phòng ở `client/src/art/bar/casino.ts`, đồ động (xúc xắc, bài, cuộn, ngựa, nhà cái NPC) do
module trò tự dựng ở các neo. Tiền cược qua `ctx.wager` + `StakeBook`.

**Tech Stack:** TypeScript 5.9, Three.js 0.186, Socket.io 4.8, zod 4, vitest 5; Node 22; ffmpeg 7.1 (đo BPM nhạc).

**Spec:** `docs/superpowers/specs/2026-11-01-quan-bar-song-bac-design.md` (đọc trước khi làm bất kỳ làn nào).

---

## Quy ước chung cho mọi làn

- Dự án **`D:\AI\Tu Online`** (Node riêng). CLAUDE.md / Spec Kit / rule của `fastdo-server` **không áp dụng**. Shell
  của agent bị reset cwd mỗi lệnh → luôn `cd "D:/AI/Tu Online" && …`.
- Được chạy: `npx vitest run <file>` (test hẹp), `npx tsc -p shared`, `npx tsc -p server`, `npx tsc -p client`.
  **Không** chạy `npm run build`, `npm run dev`, không bật/tắt server, không kill process, không git commit/stash/reset.
- **Không sửa**: `client/src/art/character/*`, `client/src/art/avatar.ts`, `client/src/preview/views/avatar.ts`,
  `client/tests/character*.test.ts`, `vitest.config.ts`, `docs/superpowers/plans/2026-10-31-dai-phap-duong-tien-do.md`
  (phiên khác đang làm nhân vật). Lỗi typecheck nằm trong các file đó thì bỏ qua.
- **Hợp đồng dùng chung (chỉ đọc)** — cần đổi thì ghi vào báo cáo cuối (mục "Yêu cầu hợp đồng"), tự xoay xở trong file
  của mình: `shared/src/ids.ts`, `shared/src/maps/{types,bar,index}.ts` (riêng làn Art được chỉnh kích thước va chạm
  trong `bar.ts` nếu đồ thật lệch, giữ nguyên id trạm), `shared/src/config/balance.ts` (mỗi làn chỉ sửa khối của trò
  mình), `shared/src/config/text.ts`, `shared/src/activities/{cards,casino}.ts`, `server/src/activities/types.ts`,
  `server/src/activities/casino/stakes.ts`, `server/src/rooms/PartyRoom.ts`, `server/tests/helpers/fakeContext.ts`,
  `server/src/activities/registry.ts`, `client/src/activities/registry.ts`, `client/src/art/api.ts`,
  `client/src/art/anchors.ts`, `client/src/audio/api.ts`, `client/src/activities/casino/*`.
- Ghi file **từng đoạn ≤ ~250 dòng** (file dài: Write khung rồi Edit/append) — lần trước có agent soạn cả file lớn trong
  1 lượt rồi chạm trần token đầu ra, mất hết.
- TDD: viết test trước cho luật thuần + luồng server, chạy thấy đỏ, cài, chạy xanh. Tiếng Việt trong chú thích, nhãn UI.
- Mẫu gần nhất: Bầu Cua (`server/src/activities/barUtils/index.ts` phần cuối, `client/src/activities/barUtils/index.ts`
  phần cuối, test `server/tests/activities/modules.test.ts` mục "Bầu Cua").

## Hợp đồng đã viết (Task 0 — ✅ orchestrator, typecheck sạch, 217 test pass)

| Hợp đồng | File |
|---|---|
| 5 ID hoạt động `taixiu xidach baicao nohu duangua`; 11 âm thanh `card_deal card_flip chips dice_cup slot_spin slot_stop jackpot race_bell gallop scratch smoke_jet` (công thức tạm trong `client/src/audio/sfx.ts`) | `shared/src/ids.ts` |
| Loại trạm `taixiu_table xidach_table baicao_table slot_machine race_rail` (+ bảng KIND_ACTIVITY trong test) | `shared/src/maps/types.ts`, `shared/tests/maps.test.ts` |
| Phòng Sòng Công Đức: hằng **`SONG_BAC`** (nguồn sự thật bố cục), tường + cửa, va chạm bàn/đường đua/máy/bệ hũ, 9 trạm, vùng `casino`, biên `maxX` 39,5 | `shared/src/maps/bar.ts` |
| Số cân bằng `CASINO TAIXIU XIDACH BAICAO NOHU DUANGUA` (+ `NOHU_SYMBOLS`) | `shared/src/config/balance.ts` |
| Tên hoạt động | `shared/src/config/text.ts` |
| Bộ bài `Card`, `newDeck`, `shuffledDeck(rng)`, nhãn | `shared/src/activities/cards.ts` |
| `CasinoPhase`, `StakeMap`, `stakeTotal`, `CasinoSettleLine` | `shared/src/activities/casino.ts` |
| `ctx.wager(pid, n)` (trừ cả Công Đức lẫn Đức, cần Đức ≥ n, báo tụt cấp) — cài ở PartyRoom, giả lập ở fakeContext (`ctx.wagers`) | `server/src/activities/types.ts`, `ActivityHost.ts`, `rooms/PartyRoom.ts`, `tests/helpers/fakeContext.ts` |
| **`StakeBook`**: `place / remove / refund / settle / snapshot / of / totalOf / totalOn / bettors / nameOf / isEmpty` | `server/src/activities/casino/stakes.ts` (+ test `server/tests/activities/casinoStakes.test.ts`) |
| Khung module server/client 5 trò (dòng đầu "BẢN TẠM") đã đăng ký registry | `server/src/activities/<trò>/index.ts`, `client/src/activities/<trò>/index.ts` |
| `WorldControls.setSpectrum / setMusicPlaying / setNowPlaying / strobe / smoke`; tên neo Sòng Công Đức | `client/src/art/api.ts` |
| Vị trí neo Sòng Công Đức tính từ `SONG_BAC` | `client/src/art/anchors.ts` |
| `AudioApi.musicBands(out)` (thân tạm trả false) | `client/src/audio/api.ts`, `client/src/audio/index.ts` |
| Bộ giao diện sòng: `el fmt secondsLeft chipRow handleChipKey selectedChip walletRow phaseHead betTile resultBanner hint cardEl handRow beadRoad` + CSS `cs-*`; lá bài 3D `Card3D` (`place / moveTo / setCard / update / dispose`, `CARD_W/H`) | `client/src/activities/casino/{ui.ts,casino.css,cards3d.ts}` |

Neo (vị trí từ `SONG_BAC`): `taixiu_table_top`, `xidach_table_top`, `xidach_dealer`, `xidach_seat:1..5`,
`baicao_table_top`, `baicao_dealer`, `baicao_seat:1..6`, `race_track`, `race_board`, `slot_reels:slot_machine_N`,
`slot_lever:slot_machine_N`, `jackpot_display`. Nhà cái NPC do module trò tạo bằng `ctx.world.createNpc(npcLook('dealer',
seed), 'Nhà cái')` (`npcLook` import từ `client/src/art/avatar` — không sửa file đó).

---

## Làn A — Phòng Sòng Công Đức (đồ tĩnh) + bàn DJ (hình)

**Sở hữu:** `client/src/art/bar/casino.ts` (mới, có thể tách thêm `client/src/art/bar/casino*.ts`), `client/src/art/bar/index.ts`,
được chỉnh kích thước va chạm trong `shared/src/maps/bar.ts` (giữ id trạm + SONG_BAC là nguồn sự thật).

- [ ] A1. Đọc `client/src/art/bar/index.ts`, `client/src/art/kit.ts`, `client/src/art/anchors.ts`, `SONG_BAC`.
- [ ] A2. Tường Đông của Bar (mesh x 23, dày 0,6) khoét cửa z 3,5..6,5 cao 3,2 (2 đoạn + lanh tô), khung cửa + biển neon
      "SÒNG CÔNG ĐỨC" phía Bar, biển "Cờ bạc là bác thằng bần — Công Đức đi dễ khó về" cạnh cửa.
- [ ] A3. `casino.ts` export `buildCasino(map, kit)` → `{ statics, dyn, anchors?, lights, update(dt,t), dispose() }`; `index.ts`
      gộp `statics` vào nhóm tĩnh (merge), `dyn` vào nhóm động, đèn vào `environment.lights`.
      Vỏ phòng: sàn thảm đỏ hoa văn (canvas), lối giữa thảm đậm viền vàng, tường gỗ tối ốp + chỉ vàng (mặt trong tường
      trùng mặt trong va chạm: Bắc z −8, Đông x 40, Nam z 16), trần cao `SONG_BAC.ceiling`, 3–4 đèn chùm pha lê (phát sáng
      tự thân, không thêm đèn), **tối đa 2 PointLight** ấm, neon "SÒNG CÔNG ĐỨC" tường Đông cuối lối giữa.
- [ ] A4. Đồ tĩnh từng trò (kích thước = hộp va chạm trong SONG_BAC, mặt nỉ cao `feltY` 0,86):
      Tài Xỉu (nỉ đỏ in 5 ô TÀI · XỈU · CHẴN · LẺ · BỘ BA ×30; chừa giữa-Bắc mặt bàn cho đĩa + bát); Xì Dách (nửa elip
      nỉ xanh, cạnh thẳng phía Bắc, 5 ô tròn ở các neo ghế, chữ "NHÀ CÁI RÚT TỚI 16", hộp bài tĩnh cạnh `xidach_dealer`
      lệch +0,5 m X); Bài Cào (nỉ xanh, 6 ô chữ nhật ở neo ghế, chữ "BA TIÊN ĂN ĐÔI"); đường đua (bàn 14 × 3, mặt
      `surfaceY` 0,95, 6 làn ở `laneZ0 + k·laneGap`, vạch xuất phát `startX`, vạch đích ca-rô `finishX`, cổng xuất phát,
      lan can phía khách; **chừa tường Bắc x 26..37, y 2,3..4,3 cho bảng LED do làn Đua Ngựa dựng**); 4 vỏ máy xèng
      (thân hộp w × d, cửa sổ khoét **0,70 × 0,40 m** quanh neo `slot_reels:*`, khoang sâu 0,36 m nền tối để làn Nổ Hũ đặt
      3 cuộn, biển "NỔ HŨ" trên nóc, khay xu; **không** dựng cần gạt — làn Nổ Hũ làm); bệ + Hũ Công Đức vàng (chừa mặt
      Bắc trước hũ, khung 1,6 × 0,5 m ở neo `jackpot_display` cho bảng số do làn Nổ Hũ dựng). Không đặt NPC nhà cái.
- [ ] A5. Cài 5 điều khiển mới trong `index.ts`: `setSpectrum` (20 cột tường LED theo dải, rơi mượt; > 0,5 s không có thì về
      hoạt ảnh cũ), `setMusicPlaying` (đĩa than quay/dừng êm, dừng thì đèn quét chậm), `setNowPlaying` (bảng chữ chạy trên
      mép trước bàn DJ, canvas cập nhật khi đổi chữ, không cấp phát mỗi khung), `strobe(seconds)`, `smoke()` (2–4 cột khói
      CO2 từ trước bàn DJ ~1,5 s, hạt dùng chung không cấp phát mỗi khung).
- [ ] A6. Kiểm: `npx tsc -p client` sạch; `npx vitest run shared/tests/maps.test.ts` xanh; đếm số mesh/tam giác thêm
      (ước bằng script đếm hoặc suy từ code) ghi vào báo cáo; không cấp phát `new` trong `update`.

## Làn B — Nhạc DJ thu sẵn + bàn DJ mở + Thi nhảy theo nhịp mới

**Sở hữu:** `client/src/content/dj/*.mp3` (mới), `client/src/content/djTracks.ts` (mới), `shared/src/activities/dj.ts`,
khối `DJ` trong `balance.ts`, `server/src/activities/dj/index.ts`, `server/src/activities/dance/index.ts`,
`client/src/activities/dj/*` (+ `dj.css` mới), mục DJ trong `client/src/activities/activities.css`, `client/src/audio/index.ts`,
`client/src/audio/sfx.ts`, `shared/tests/dj.test.ts` (mới), `server/tests/activities/dj.test.ts` (mới), mục "Thi nhảy" trong
`server/tests/activities/modules.test.ts`.

- [ ] B1. Chép 4 file từ `C:\Users\LENOVO\Downloads\Nhạc DJ` sang `client/src/content/dj/` tên ASCII:
      `chu-dai-bi-vo-luong-masew.mp3`, `chu-dai-bi-vo-luong-tliem-remix.mp3`, `chu-dai-bi-remix.mp3`,
      `duoi-toa-sen-vang-anhvu-remix.mp3` (cp, không chạy gì từ thư mục Downloads).
- [ ] B2. Đo BPM + mốc phách đầu + mốc drop: ffmpeg giải mã mono 11 025 Hz f32le → script Node trong **scratchpad** (không
      để trong repo): đường bao onset (spectral flux dải thấp), tự tương quan 60–180 BPM, tinh chỉnh chu kỳ trên cả bài
      (bước 0,005 BPM), pha = cực đại năng lượng onset tại lưới phách; ưu tiên khoảng 110–150 BPM; đo độ khớp (% phách có
      onset trong ±30 ms) — ghi kết quả + độ khớp vào báo cáo. Drop = mốc năng lượng dải thấp tăng vọt sau đoạn lặng (tùy
      chọn, chỉ ghi khi rõ). Thời lượng lấy theo ffprobe (ms).
- [ ] B3. `shared/src/activities/dj.ts`: danh sách bài hợp nhất `DJ_TRACKS` (4 thu sẵn trước, 4 tổng hợp `DJ.tracks` sau)
      kiểu `{ id, kind: 'recorded'|'synth', name, bpm, beatOffsetMs, durationMs (synth = 0), file?, drops? }`; trạng thái
      công khai `DjPublicState` mới: `trackId, bpm, startedAt, beat0, playing, pausedAtMs, theme, dropAt, hornAt, confettiAt,
      smokeAt, strobeAt, controllerPid, controllerName`; hàm `trackInfo(id)`, `beatIndexAt`, `nextMeasureAt`,
      `positionMs(state, now)`, `nextTrackId(id, dir)`. Test `shared/tests/dj.test.ts`: id duy nhất, BPM 60–200, thời lượng >
      0 với bài thu sẵn, `nextTrackId` vòng quanh danh sách thu sẵn.
- [ ] B4. Server DJ (test trước, `server/tests/activities/dj.test.ts`): vào Bar tự phát bài thu sẵn 1 (`startedAt = now +
      1000`); hết bài (hẹn giờ `startedAt + durationMs`) → bài thu sẵn kế (vòng lại); đang có sảnh/vòng nhảy
      (`now < dance_until` hoặc `now < dance_lobby_until`) thì **phát lại chính bài đó đúng phách** (beat0 mới = lưới cũ);
      bài tổng hợp lặp mãi. Đứng bàn: E khi bàn trống → lên bàn (`ctx.open`, controller = mình); bàn có người → toast "X đang
      chỉnh nhạc ở bàn DJ"; người giữ danh hiệu DJ (`ctx.djPid()`) → chiếm lại (đóng bảng người cũ + toast); Esc / mất kết
      nối / rời / đổi map / tick thấy đứng xa (> r + 2 m) → bàn trống. Lệnh chỉ nhận từ controller đứng gần: `play stop next
      prev track{id} drop horn confetti smoke strobe theme{theme} close`; nghỉ: drop 8 s, còi 5 s, pháo/khói/đèn chớp 10 s,
      đổi bài tối thiểu 3 s; trong sảnh/vòng nhảy cấm `stop next prev track`. Pháo giấy = `ctx.fx({type:'confetti'})`.
      Ghi `ctx.shared`: `dj_bpm`, `dj_beat0`, `dj_playing` (1/0). Sảnh nhảy mở khi nhạc dừng → tick tự `play`.
- [ ] B5. Server Thi nhảy: đọc `dj_bpm` / `dj_beat0` thay `dj_track` / `dj_started_at` (0 thì lùi về DJ.tracks[0] + now);
      lúc mở sảnh ghi `dance_lobby_until`; sửa test "Thi nhảy" trong `modules.test.ts` cho khóa mới.
- [ ] B6. Âm thanh: cài `musicBands` (AnalyserNode nối sau kênh nhạc, fftSize 512, làm mượt, dải log 40 Hz–12 kHz, không
      cấp phát mỗi lần gọi); bảo đảm `setRecorded(null)` rồi `setRecorded(url)` cùng url tua lại đúng `startAt`; tinh chỉnh
      công thức `scratch`, `smoke_jet` nếu cần.
- [ ] B7. Client DJ: phát theo trạng thái (thu sẵn → `stopBeatTrack` + `setRecorded(url, level, { startAt: d => (now −
      startedAt)/1000, loop: false })`; tổng hợp → `setRecorded(null)` + `startBeatTrack(id, beat0, bpm)`; dừng → tắt cả
      hai); mức to 1 trong Bar, 0,55 trong vùng `casino`; phách → `controls.onBeat`; mỗi khung `audio.musicBands(20 dải)` →
      `controls.setSpectrum`; `setMusicPlaying`, `setNowPlaying(tên)`; drop tự bắn ở `drops`; hiệu ứng theo mốc
      `*At` (khói → `controls.smoke` + `world.burst('smoke')`, đèn chớp → `controls.strobe(4)`, còi, drop). Bảng DJ (chỉ
      controller): đang phát + thanh tiến độ, ⏮ ▶/⏸ ⏭, danh sách 8 bài (2 nhóm), hiệu ứng có đồng hồ nghỉ, 4 màu đèn; phím
      Space Drop, P phát/dừng, ←/→ bài, H còi, C pháo, K khói, F đèn chớp. Gợi ý E: "🎧 Lên bàn DJ" / "Bàn DJ — X đang
      chỉnh" / "(bạn đang đứng bàn)".
- [ ] B8. Kiểm: `npx vitest run shared/tests/dj.test.ts server/tests/activities/dj.test.ts server/tests/activities/modules.test.ts`
      xanh; `npx tsc -p shared && npx tsc -p server && npx tsc -p client` sạch.

## Làn C — Tài Xỉu chẵn lẻ (`taixiu`)

**Sở hữu:** `shared/src/activities/taixiu.ts`, `shared/tests/taixiu.test.ts`, khối `TAIXIU`, `server/src/activities/taixiu/*`,
`server/tests/activities/taixiu.test.ts`, `client/src/activities/taixiu/*`.

- [ ] C1. Test luật (đỏ trước): `taiXiuOutcome([4,5,6])` → `{ sum: 15, tai: true, xiu: false, chan: false, le: true,
      triple: false }`; `[3,3,3]` → triple true, cả tai/xiu/chan/le false; `taiXiuReturn({tai:10, bo_ba:5}, [2,2,2])` = 155;
      `({tai:10, chan:10}, [1,2,3])` = 20 (Xỉu + Chẵn → chỉ chan ăn); liệt kê đủ 216 kết quả: lợi thế Tài = Chẵn =
      1 − 2·105/216 ≈ 2,78%, Bộ Ba = 1 − 31·6/216 ≈ 13,9%.
- [ ] C2. Cài `taixiu.ts`: `TaiXiuBet = 'tai'|'xiu'|'chan'|'le'|'bo_ba'`, `TAIXIU_BETS`, nhãn, `taiXiuOutcome`, `taiXiuReturn`,
      `TaiXiuPublicState { phase: CasinoPhase, endsAt, round, dice: number[], bets: Record<pid, StakeMap>, names,
      history: {dice, sum}[], results: CasinoSettleLine[] }`.
- [ ] C3. Test server (đỏ trước): mở ván bằng E; đặt/gỡ bằng `act 'bet' {bet, amount}` / `'unbet' {bet, amount}` (amount
      thuộc `CASINO.chips`); trừ cả Công Đức lẫn Đức; thiếu Đức / vượt 100 bị từ chối kèm toast; ở xa (> r + nearSlack) bị
      từ chối; lắc `rollMs` → trả đúng `taiXiuReturn`; Tạp Niệm +2; rời bàn lúc đặt → hoàn; mất kết nối lúc lắc → giữ, vẫn
      trả; đổi map lúc đặt/lắc → hoàn hết; `isBusy` khi có cược; 3 ván không ai cược → nghỉ; `history` ≤ 16.
- [ ] C4. Cài server bằng `StakeBook` (nhãn "Tài Xỉu"); xúc xắc `ctx.rng.int(1, 6)`; âm `dice_cup` lúc lắc.
- [ ] C5. Client: bảng (đầu pha + đồng hồ, ví, hàng phỉnh, 5 ô `betTile` — Tài/Xỉu/Chẵn/Lẻ ×1, Bộ Ba ×30, bảng cầu
      `beadRoad` T/X/bộ ba, kết quả `resultBanner`), tự mở khi ván mới bắt đầu và mình đứng gần, phím 1–4; 3D ở neo
      `taixiu_table_top`: đĩa sứ + bát úp + 3 xúc xắc chấm (mặt 1 và 4 chấm đỏ), lắc bát khi `resolving`, mở bát lộ mặt đúng
      kết quả; nhà cái NPC phía Bắc bàn (`createNpc`, anim `shake` lúc lắc); dọn sạch khi unmount.
- [ ] C6. Kiểm: test hẹp xanh, `npx tsc -p shared && npx tsc -p server && npx tsc -p client` sạch.

## Làn D — Xì Dách (`xidach`)

**Sở hữu:** `shared/src/activities/xidach.ts`, `shared/tests/xidach.test.ts`, khối `XIDACH`, `server/src/activities/xidach/*`,
`server/tests/activities/xidach.test.ts`, `client/src/activities/xidach/*`.

- [ ] D1. Test luật (đỏ trước): `xiDachPoints` với luật Át theo số lá — `[A,5]` = 16, `[A,A]` → hạng `xi_bang`, `[A,K]` →
      `xi_dach`, `[A,9,A]` = 20 (3 lá: Át ∈ {10, 1} → 10+9+1), `[A,2,3,4]` = 10 (≥ 4 lá: Át = 1), `[K,Q,5]` = 25 →
      `quac`, 5 lá tổng ≤ 21 → `ngu_linh`; `compareXiDach`
      đủ bảng: hơn hạng thắng, cùng đặc biệt hòa, thường so điểm, người Quắc + cái Quắc = hòa, cái Quắc người không = thắng;
      `xiDachReturn(stake, player, dealer)` theo `XIDACH.payout`. Mô phỏng 200 000 ván (seed cố định, người chơi rút tới
      ≥ 16 rồi dằn, nhà cái rút tới ≥ 16): lợi thế nhà cái trong **[1%, 6%]** — lệch thì chỉnh `dealerStandAt` / lãi trong
      khối XIDACH và ghi lý do.
- [ ] D2. Cài `xidach.ts`: hạng, điểm, so bài, trả, `XiDachPublicState { phase, endsAt, round, seats: { pid, name, cards,
      stake, done, result? }[], dealer: { cards (lá tẩy = null khi chưa lật), revealed }, turnEndsAt, results }`.
- [ ] D3. Test server (đỏ trước): đặt cược (ghế theo thứ tự, tối đa 5, người thứ 6 bị từ chối), chia 2 lá, nhà cái Xì
      Bàng/Xì Dách lật ngay và chốt; `act 'hit'` / `'stand'` (dằn < 16 bị từ chối kèm toast; 21 hoặc 5 lá tự dừng); mọi
      người xong thì sang nhà cái sớm; hết `turnMs` tự rút tới 16 rồi dằn; nhà cái rút từng lá (`dealerStepMs`) tới ≥ 16;
      trả đúng; rời bàn lúc đặt → hoàn; rời hẳn khi đã chia → hoàn cược (theo ngữ nghĩa Bầu Cua); đổi map → hoàn;
      `isBusy`; nghỉ sau 3 ván trống.
- [ ] D4. Cài server bằng `StakeBook` (khóa ô `'hand'`, nhãn "Xì Dách"), bộ bài `shuffledDeck(ctx.rng)` mỗi ván.
- [ ] D5. Client: bảng (ví, phỉnh, ô cược, tay của mình + điểm/hạng, tay nhà cái, các tay khác, nút **Rút (R) / Dằn (T)**,
      đồng hồ lượt, kết quả); 3D: lá `Card3D` bay từ hộp bài (neo `xidach_dealer` lệch +0,5 X) tới neo ghế/nhà cái, lật khi
      biết mặt, dọn khi ván mới; nhà cái NPC phía Bắc; âm `card_deal` / `card_flip` / `chips`.
- [ ] D6. Kiểm như C6.

## Làn E — Bài Cào 3 lá (`baicao`)

**Sở hữu:** `shared/src/activities/baicao.ts`, `shared/tests/baicao.test.ts`, khối `BAICAO`, `server/src/activities/baicao/*`,
`server/tests/activities/baicao.test.ts`, `client/src/activities/baicao/*`.

- [ ] E1. Test luật (đỏ trước): nút `[7,8,9]` = 4, `[10,J,K]` = Ba Tiên, `[J,Q,5]` = 5; so: Ba Tiên > 9 nút; bằng nút so
      lá lớn nhất (K > Q > J > 10 > … > A); vẫn bằng → nhà cái thắng; `baiCaoReturn(10, thắng thường)` = 20, Ba Tiên thắng
      = 30, thua = 0. Lợi thế nhà cái (mô phỏng 300 000 ván seed cố định hoặc liệt kê) trong **[0,5%, 4%]** — lệch thì chỉnh
      lãi trong khối BAICAO và ghi lý do.
- [ ] E2. Cài `baicao.ts`: `baiCaoScore`, `isBaTien`, `compareBaiCao`, `baiCaoReturn`, `BaiCaoPublicState { phase, endsAt,
      round, hands: { pid, name, cards, stake, score, result? }[], dealer: cards[], revealAt, results }`.
- [ ] E3. Test server (đỏ trước): đặt/gỡ (khóa `'hand'`), chia 3 lá cho mỗi người cược + nhà cái khi hết giờ đặt, lật dần
      `revealMs`, trả đúng, Tạp Niệm, hoàn khi rời lúc đặt / đổi map, `isBusy`, nghỉ sau 3 ván trống, không giới hạn số người.
- [ ] E4. Cài server bằng `StakeBook` (nhãn "Bài Cào").
- [ ] E5. Client: bảng (ví, phỉnh, ô cược, tay mình + nút, nhà cái, danh sách tay khác + thắng/thua), 3D: lá bay tới 6 neo
      ghế đầu + nhà cái, lật dần theo `revealMs`; nhà cái NPC phía Nam; âm bài/phỉnh.
- [ ] E6. Kiểm như C6.

## Làn F — Nổ Hũ (`nohu`)

**Sở hữu:** `shared/src/activities/nohu.ts`, `shared/tests/nohu.test.ts`, khối `NOHU`, `server/src/activities/nohu/*`,
`server/tests/activities/nohu.test.ts`, `client/src/activities/nohu/*`.

- [ ] F1. Test luật (đỏ trước): dải cuộn dựng từ `NOHU.reelCounts` (mỗi cuộn 32 ô, xếp xen kẽ tất định); `noHuPayout(['hu',
      'hu','hu'])` = `'jackpot'`; `['that','that','that']` = 80; `['bia','dao','sen']` = 2 (quả lẫn); `['hu','hu','bia']` = 3;
      `['hu','bia','bia']` = 0; liệt kê 32³: trả lại (chưa tính hũ) = 27757/32768, tần suất trúng ≈ 32,6%, nổ hũ = 9/32768
      — đổi bảng trả/dải thì cập nhật cả test lẫn chú thích khối NOHU.
- [ ] F2. Cài `nohu.ts`: `NOHU_STRIPS`, `noHuPayout`, `noHuRtp()`, `NoHuPublicState { jackpot, machines: { id, pid, name,
      spin: { stops: [i,j,k], symbols, bet, startAt, stopAt, win } | null }[], lastJackpot: { name, amount, at } | null }`.
- [ ] F3. Test server (đỏ trước): E vào máy trống → `ctx.open`, máy có người → toast; `act 'spin' {bet}` (bet ∈ NOHU.bets):
      trừ cả Công Đức lẫn Đức, góp 10% vào hũ (giữ phần lẻ), quyết kết quả ngay, trả thưởng lúc `stopAt` (raw, noPool, nhãn
      "Nổ Hũ"), `minIntervalMs` chống quay dồn, Tạp Niệm +1/lượt; nổ hũ → trả cả quỹ, hũ về `jackpotSeed`, banner + chat
      + pháo + âm `jackpot` cả phòng; Esc / đi xa / mất kết nối / đổi map → nhả máy (lượt đang quay vẫn được trả nếu còn
      trong phòng); `isBusy` khi có máy đang quay.
- [ ] F4. Cài server (không dùng StakeBook — mỗi lượt tự `ctx.wager` + `ctx.reward`).
- [ ] F5. Client: ngồi máy → khóa di chuyển, `faceTo` nhìn màn máy, bảng nhỏ đáy màn hình (`position: 'bottom'`: ví, mức
      cược, nút QUAY, thắng gần nhất, hũ hiện tại); **Space** quay (không dùng Enter — Enter luôn mở chat), E/Esc rời máy.
      3D ở neo `slot_reels:*`: 3 trống cuộn (biểu tượng **vẽ canvas**, không dùng emoji) quay và dừng đúng ô ở 1,2/1,7/2,2 s
      cho mọi người xem, đèn nóc nháy khi thắng; cần gạt ở neo `slot_lever:*` kéo xuống mỗi lượt; bảng số hũ ở
      `jackpot_display` (canvas, chỉ vẽ lại khi số đổi); nổ hũ: mưa xu `world.burst('coins')`.
- [ ] F6. Kiểm như C6.

## Làn G — Đua Ngựa (`duangua`)

**Sở hữu:** `shared/src/activities/duangua.ts`, `shared/tests/duangua.test.ts`, khối `DUANGUA`, `server/src/activities/duangua/*`,
`server/tests/activities/duangua.test.ts`, `client/src/activities/duangua/*`.

- [ ] G1. Test luật (đỏ trước): `raceOdds(rng)` → 6 xác suất tổng 1, mỗi cái trong [`minWinProb`, `maxWinProb`], tỉ lệ =
      sàn 0,1 của `(1 − margin)/p`, ≥ `minOdds`; lợi thế nhà cái kỳ vọng (Σ p·o) trong [5%, 10%] trên 2 000 ván seed cố
      định; `raceScript(rng, finishOrder)` → mỗi ngựa 13 mốc tiến độ 0..1 đơn điệu tăng, ngựa nhất chạm 1 đúng mốc cuối
      (= `raceMs`), các ngựa sau về đích trễ `trailMinMs..trailMaxMs` theo đúng thứ tự; `raceReturn(stakes, winner, odds)`
      = floor(cược × tỉ lệ).
- [ ] G2. Cài `duangua.ts`: `HORSES` (6 tên + màu: Xích Thố đỏ, Bạch Long Mã trắng, Ô Truy đen, Đích Lư nâu, Tuyệt Ảnh bạc,
      Ngựa Sắt Gióng đồng), `raceOdds`, `raceScript`, `raceProgressAt(script, horse, tMs)`, `raceReturn`, `DuaNguaPublicState
      { phase, endsAt, round, odds, probs?, bets, names, race: { startAt, finish: number[], curves: number[][] } | null,
      results, history }` (không lộ ngựa thắng trước khi đua — `finish` chỉ gửi lúc bắt đầu đua là chấp nhận được vì client
      chỉ hiển thị; ghi rõ trong chú thích).
- [ ] G3. Test server (đỏ trước): mở ván bằng E ở rail (2 trạm cùng 1 bàn); đặt/gỡ khóa `horse_<i>`; hết `betMs` → chọn
      ngựa thắng theo p (kiểm phân phối trên nhiều ván seed cố định), phát kịch bản, `raceMs` sau trả thưởng; Tạp Niệm;
      hoàn khi rời lúc đặt / đổi map; `isBusy`; nghỉ sau 3 ván trống.
- [ ] G4. Cài server bằng `StakeBook` (nhãn "Đua Ngựa"); âm `race_bell` khi xuất phát.
- [ ] G5. Client: bảng (6 ngựa: màu, tên, tỉ lệ ×o, ô cược; ví; phỉnh; trong lúc đua hiện thứ hạng trực tiếp; kết quả); 3D ở
      neo `race_track`: 6 ngựa mô hình low-poly (thân, cổ, đầu, 4 chân, bờm/đuôi, nài ngựa áo màu làn) chạy theo
      `raceProgressAt`, nhún + chân đánh theo tốc độ, về chuồng khi ván mới; bảng LED ở `race_board` (khung + canvas: tên,
      tỉ lệ, đồng hồ, kết quả — chỉ vẽ lại khi đổi); âm `gallop` lặp khi đua, `cheer` lúc về đích.
- [ ] G6. Kiểm như C6.

---

## Sau Build — Phản biện + sửa (workflow 2)

- Phản biện 3 góc (chỉ báo cáo, có file:dòng + mức độ): (1) luật + kinh tế + server (bảo toàn Công Đức, không có kẽ hở sinh
  Đức, ngữ nghĩa rời/đổi map/mất kết nối, hẹn giờ, test); (2) client các trò (luồng, đồng bộ, phím, neo 3D khớp đồ tĩnh,
  dọn dẹp unmount, cấp phát mỗi khung); (3) DJ + âm thanh + phòng (đồng bộ nhạc, BPM, nhảy, điều khiển hình, va chạm khớp
  đồ, số đèn).
- Sửa theo nhóm file (server/shared · client trò · DJ/âm/hình), mỗi nhóm 1 agent; rồi kiểm.

## Kiểm cuối (orchestrator)

- [ ] `npm run typecheck`, `npm test`, `npm run build` (dist chứa 4 mp3 DJ).
- [ ] Thử trong trình duyệt (phòng thử `?auto&r=QBAR&name=...`, mã 4 ký tự hợp lệ): đi vào Sòng Bạc, chơi đủ 5 trò, bàn
      DJ đổi bài / Drop / khói / đèn chớp, nhạc thu sẵn phát (2 tab nghe cùng đoạn).
- [ ] Cập nhật file tiến độ + memory dự án.
