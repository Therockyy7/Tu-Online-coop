// Nổ Hũ (Sòng Công Đức) phía client: 4 máy xèng sát tường Nam — bấm E ở máy trống để ngồi (server mở giao diện): khóa di
// chuyển, đứng đúng chỗ nhìn thẳng màn máy, bảng điều khiển đáy màn hình (panel.ts). 3 trống cuộn + cần gạt + đèn nóc
// (reels3d.ts) và bảng số Hũ Công Đức (board3d.ts) vẽ cho cả phòng xem. Server quyết định mọi kết quả; client chỉ hiển
// thị + gửi thao tác. Rời máy: E / Esc / ✕ (bảng báo 'leave'), đi xa / đổi map (server tự đóng).
import './nohu.css';
import type { NoHuPublicState } from '@shared/activities/nohu';
import type { ActivityClientModule, ClientActivityContext } from '../types';
import { JackpotBoard3D } from './board3d';
import { NoHuPanel } from './panel';
import { SlotMachines3D } from './reels3d';

/**
 * Cúi nhìn cửa sổ cuộn (rad) và góc nhìn hẹp cho cận cảnh máy (độ) khi ngồi máy. Cúi −0,12: cửa sổ cuộn nằm ở 46–79,5%
 * chiều cao màn tính từ đáy (đường thắng 62%) → màn thấp ~650 px thì mép dưới cửa sổ vẫn cao ~299 px, trên bảng đáy.
 */
const PITCH = -0.12;
const FOV = 64;

let st: NoHuPublicState | null = null;
let panel: NoHuPanel | null = null;
let slots: SlotMachines3D | null = null;
let board: JackpotBoard3D | null = null;

const machineIdOf = (stationId: string): number => Number(/^slot_machine_(\d+)$/.exec(stationId)?.[1]) || 0;

/** Đóng bảng; `silent` = server đã cho rời máy rồi (không gửi 'leave' lên nữa). */
function closePanel(silent: boolean): void {
  const p = panel;
  panel = null;
  if (p && !p.closed) p.close(silent);
}

function releaseView(ctx: ClientActivityContext): void {
  ctx.lockMovement(false);
  ctx.setFov(null);
}

export const noHuClient: ActivityClientModule = {
  id: 'nohu',
  maps: ['bar'],

  mount(ctx) {
    slots = new SlotMachines3D(ctx);
    board = new JackpotBoard3D(ctx);
  },

  prompt(station, ctx) {
    if (station.kind !== 'slot_machine') return undefined;
    const id = machineIdOf(station.id);
    const m = st?.machines[id - 1];
    if (m?.pid && m.pid !== ctx.state.me.pid) return `🎰 Máy ${id} — ${m.name} đang chơi`;
    return `🎰 Chơi Nổ Hũ (máy ${id})`;
  },

  onState(s) {
    const prev = st;
    st = s as NoHuPublicState;
    slots?.sync(st);
    board?.sync(st, prev);
    panel?.render();
  },

  onOpen(data, ctx) {
    const id = Number((data as { machine?: unknown } | null)?.machine) || 0;
    const station = ctx.world.map.stations.find((x) => x.id === `slot_machine_${id}`);
    if (!station) return;
    closePanel(true);
    // Đứng đúng chỗ trước máy, quay mặt vào màn cuộn, khóa di chuyển tới khi rời máy.
    ctx.snapTo(station.x, station.z, station.ry);
    ctx.faceTo(station.ry, PITCH);
    ctx.setFov(FOV);
    ctx.lockMovement(true);
    panel = new NoHuPanel(ctx, id, () => st, () => {
      panel = null;
      releaseView(ctx);
    });
  },

  onClose(_reason, ctx) {
    closePanel(true);
    releaseView(ctx);
  },

  update() {
    slots?.update();
    board?.update();
    panel?.tick();
  },

  unmount(ctx) {
    closePanel(true);
    releaseView(ctx);
    slots?.dispose();
    slots = null;
    board?.dispose();
    board = null;
    st = null;
  },
};
