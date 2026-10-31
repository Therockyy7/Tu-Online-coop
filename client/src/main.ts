// Luồng chính: sảnh (nhập tên, chọn phòng) → kết nối → vào phòng → game; rời phòng / bị đá thì về sảnh.
import './styles/fonts';
import { normalizeRoomCode, sanitizeName } from '@shared/index';
import { createAudio } from './audio';
import { Game } from './engine/Game';
import { Net } from './net/Net';
import { prefs, settings } from './settings';
import { createUI } from './ui';

const ui = createUI(document.getElementById('ui')!);
const stage = document.getElementById('stage')!;
const audio = createAudio();

const applyVolumes = () => {
  const s = settings.get();
  audio.setVolume('master', s.volMaster);
  audio.setVolume('music', s.volMusic);
  audio.setVolume('sfx', s.volSfx);
};
applyVolumes();
settings.on(applyVolumes);

// Âm thanh chỉ bật sau lần tương tác đầu tiên (chính sách autoplay).
const unlock = () => audio.unlock();
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });

const linkRoom = normalizeRoomCode(new URLSearchParams(location.search).get('r'));

/** Chỉ khi phát triển: `?auto&r=ABCD&name=...` tự vào phòng (thử nhanh nhiều tab). */
const params = new URLSearchParams(location.search);
let autoJoin = import.meta.env.DEV && params.has('auto');
if (import.meta.env.DEV && params.get('slot')) prefs.useSlot(params.get('slot')!);

async function lobby(error?: string): Promise<void> {
  const saved = prefs.load();
  let message = error;
  for (;;) {
    const req = autoJoin
      ? { name: params.get('name') ?? (saved.name || 'Khách Thử'), room: linkRoom ?? 'CHUA', create: false }
      : await ui.showLobby({ defaultName: saved.name, defaultRoom: linkRoom ?? saved.room, error: message });
    autoJoin = false;
    const name = sanitizeName(req.name);
    if (!name) {
      message = 'Tên cần 2–16 ký tự.';
      ui.setLobbyBusy(false, message);
      continue;
    }
    if (!req.create && req.room !== null && !normalizeRoomCode(req.room)) {
      message = 'Mã chùa gồm 4 ký tự (chữ in hoa và số).';
      ui.setLobbyBusy(false, message);
      continue;
    }
    ui.setLobbyBusy(true);
    const net = new Net();
    try {
      await net.connect();
    } catch (err) {
      net.close();
      message = (err as Error).message;
      ui.setLobbyBusy(false, message);
      continue;
    }
    const res = await net.join({ key: prefs.load().key, name, room: req.create ? null : req.room, create: req.create });
    if (!res.ok) {
      net.close();
      message = res.error;
      ui.setLobbyBusy(false, message);
      continue;
    }
    prefs.save({ name, key: res.key, room: res.room.code });
    if (!params.has('auto')) history.replaceState(null, '', `${location.pathname}?r=${res.room.code}`);
    ui.hideLobby();
    try {
      new Game({
        ui,
        audio,
        net,
        stage,
        join: res,
        onExit: (reason) => {
          if (!params.has('auto')) history.replaceState(null, '', location.pathname);
          void lobby(reason ?? undefined);
        },
      });
    } catch (err) {
      // Không dựng được game (vd máy không mở được WebGL): rời phòng để không để lại "người chơi ma", về sảnh báo lỗi.
      console.error('[game] không khởi tạo được', err);
      net.close();
      stage.replaceChildren();
      message = 'Không mở được đồ họa 3D (WebGL) trên trình duyệt này. Thử Chrome/Edge bản mới hoặc bật tăng tốc phần cứng.';
      ui.setLobbyBusy(false, message);
      autoJoin = false;
      void lobby(message);
      return;
    }
    return;
  }
}

void lobby();
