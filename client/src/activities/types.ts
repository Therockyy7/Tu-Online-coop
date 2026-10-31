// HỢP ĐỒNG mini-game phía client. Mỗi hoạt động = 1 module ở client/src/activities/<id>/index.ts,
// đăng ký trong registry.ts. Runtime (engine) định tuyến actState/actEvent/actOpen/actClose và phím.
import type { ActivityId, AnimId, MapId, PlayerPublic, StationDef } from '@shared/index';
import type { AudioApi } from '../audio/api';
import type { WorldApi } from '../engine/worldApi';
import type { GameStateApi } from '../state/types';
import type { HostMenuItem, UIApi } from '../ui/api';

export interface InputApi {
  /** Phím đang giữ (theo KeyboardEvent.code, vd 'Space', 'KeyA', 'ArrowUp'). */
  isDown(code: string): boolean;
}

export interface ClientActivityContext {
  readonly id: ActivityId;
  readonly state: GameStateApi;
  readonly ui: UIApi;
  readonly audio: AudioApi;
  readonly world: WorldApi;
  readonly input: InputApi;
  /** Gửi thao tác lên server (ActMsg { a: id, type, data }). */
  send(type: string, data?: unknown): void;
  /** Giờ server ước lượng (ms). */
  serverNow(): number;
  /** Bản công khai của người chơi local. */
  me(): PlayerPublic | undefined;
  /** Hoạt ảnh hành động cho nhân vật local (đồng bộ qua pose); null = trả về đi/đứng mặc định. */
  setLocalAnim(anim: AnimId | null): void;
  /** Khóa/mở di chuyển của nhân vật local. */
  lockMovement(locked: boolean): void;
  /** Quay nhân vật local về hướng ry (radian); `pitch` (radian, + là ngẩng) = đồng thời ngẩng/cúi camera tới góc đó. */
  faceTo(ry: number, pitch?: number): void;
  /** Thu hẹp góc nhìn camera (độ) cho khung hình điện ảnh; null = trả về mặc định. Tự trả khi hoạt động đóng. */
  setFov(fov: number | null): void;
  /** Đặt nhân vật local tới vị trí (vd ngồi đúng bồ đoàn). */
  snapTo(x: number, z: number, ry?: number): void;
  /** Đánh dấu hoạt động đang "mở" ở client để nhận phím (onKey) mà không cần server (vd lightbox). */
  setOpen(open: boolean): void;
  /** Trạng thái công khai mới nhất của hoạt động này. */
  publicState<T = unknown>(): T | undefined;
}

export interface ActivityClientModule {
  readonly id: ActivityId;
  /** Map mà hoạt động hiện diện (mount khi vào map, unmount khi rời). */
  readonly maps: readonly MapId[];
  /** Vào map: dựng đồ vật/hiệu ứng cần thiết. Gọi lại mỗi lần đổi map. */
  mount?(ctx: ClientActivityContext): void;
  /** Rời map / thoát game: dọn mọi thứ đã tạo (scene, UI, timer). */
  unmount?(ctx: ClientActivityContext): void;
  /**
   * Nhãn gợi ý cho trạm thuộc hoạt động này: chuỗi = đổi nhãn, null = ẩn gợi ý (không cho E),
   * undefined = dùng nhãn mặc định của trạm.
   */
  prompt?(station: StationDef, ctx: ClientActivityContext): string | null | undefined;
  /** Bấm E ở trạm: trả true nếu đã xử lý ở client (KHÔNG gửi `interact` lên server). */
  interact?(station: StationDef, ctx: ClientActivityContext): boolean;
  /** Trạng thái công khai mới (actState) — cũng được gọi ngay sau mount nếu đã có. */
  onState?(state: unknown, ctx: ClientActivityContext): void;
  onEvent?(type: string, data: unknown, ctx: ClientActivityContext): void;
  /** Server mở giao diện hoạt động cho mình (actOpen). */
  onOpen?(data: unknown, ctx: ClientActivityContext): void;
  onClose?(reason: string, ctx: ClientActivityContext): void;
  /**
   * Phím khi hoạt động đang mở (sau onOpen hoặc setOpen(true)): trả true để chặn xử lý mặc định
   * (di chuyển, E, Q, emote…). Esc không được chặn thì runtime gửi leaveActivity.
   */
  onKey?(e: KeyboardEvent, down: boolean, ctx: ClientActivityContext): boolean;
  /** Mỗi khung hình (dt giây). */
  update?(dt: number, ctx: ClientActivityContext): void;
  /** Mục thêm cho menu Phương Trượng (H). */
  hostMenuItems?(ctx: ClientActivityContext): HostMenuItem[];
}
