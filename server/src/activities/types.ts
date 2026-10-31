// HỢP ĐỒNG mini-game phía server. Mỗi hoạt động = 1 module ở server/src/activities/<id>/index.ts,
// đăng ký trong registry.ts. ActivityHost (server lõi) tạo 1 instance cho mỗi phòng.
// KHÔNG đổi file này nếu không thống nhất với phiên chính.
import type {
  ActivityId,
  BuffId,
  FxMsg,
  HeldItem,
  MapId,
  Outfit,
  Pid,
  RankId,
  Rng,
  StationDef,
  Tone,
} from '@shared/index';

/** Thông tin người chơi (chỉ đọc) mà hoạt động được xem. */
export interface ServerPlayerView {
  readonly pid: Pid;
  readonly name: string;
  readonly rank: RankId;
  readonly isHost: boolean;
  readonly congDuc: number;
  readonly duc: number;
  readonly xu: number;
  readonly vip: boolean;
  readonly tapNiem: number;
  readonly doSay: number;
  readonly x: number;
  readonly z: number;
  readonly held: HeldItem | null;
  /** Hoạt động đang tham gia (do ctx.open/close quản lý). */
  readonly activity: ActivityId | null;
  readonly connected: boolean;
  readonly kneeling: boolean;
  readonly joinedAt: number;
}

export interface RewardOptions {
  /** Nhãn cạnh số bay lên, vd "Quét lá". */
  label?: string;
  /** Không hiện số bay lên. */
  silent?: boolean;
  /** Không cộng phần 10% vào Quỹ Công Đức (vd bổng lộc). */
  noPool?: boolean;
  /** Không nhân hệ số Tạp Niệm/buff (cộng thẳng). */
  raw?: boolean;
}

/** Bộ đếm dùng chung giữa các hoạt động trong 1 phòng (vd 'firewood', 'rice_stock', 'veg_stock'). */
export interface RoomSharedStore {
  get(key: string): number;
  set(key: string, value: number): void;
  /** Cộng rồi kẹp trong [min, max]; trả giá trị mới. */
  add(key: string, delta: number, min?: number, max?: number): number;
}

export interface ActivityContext {
  readonly id: ActivityId;
  readonly roomCode: string;
  /** Giờ server (ms). */
  now(): number;
  /** RNG cho luật chơi (seed ngẫu nhiên bằng crypto mỗi phòng). */
  readonly rng: Rng;
  /** Map hiện tại của phòng. */
  map(): MapId;
  /** Người chơi đang ở trong phòng (kể cả đang mất kết nối trong thời gian ân hạn). */
  players(): ServerPlayerView[];
  player(pid: Pid): ServerPlayerView | undefined;

  /** Đặt trạng thái công khai → gửi `actState` cho cả phòng; lưu lại để gửi cho người mới vào. */
  setState(state: unknown): void;
  /** Gửi `actEvent` (cả phòng nếu không có `to`). */
  emit(type: string, data?: unknown, to?: Pid | Pid[]): void;
  /** Mở giao diện hoạt động cho 1 người (`actOpen`) và đánh dấu player.activity = id. */
  open(pid: Pid, data?: unknown): void;
  /** Đóng giao diện (`actClose`) và đặt player.activity = null (nếu đang là hoạt động này). */
  close(pid: Pid, reason?: string): void;

  /** Thưởng Công Đức (áp dụng hệ số Tạp Niệm/buff trừ khi raw). Trả số thực nhận (cũng cộng Đức). */
  reward(pid: Pid, base: number, opts?: RewardOptions): number;
  /** Phạt: trừ thẳng Công Đức + Đức (không âm). */
  penalize(pid: Pid, amount: number, label?: string): void;
  /** Cộng/trừ Tạp Niệm (kẹp 0..100), hiện số bay lên trừ khi silent. */
  addTapNiem(pid: Pid, delta: number, silent?: boolean): void;
  /** Cộng/trừ Xu; trả false (không đổi gì) nếu trừ mà không đủ. */
  addXu(pid: Pid, delta: number): boolean;
  /** Trừ Đức khả dụng; false nếu không đủ. */
  spendDuc(pid: Pid, amount: number): boolean;
  setVip(pid: Pid): void;
  addDoSay(pid: Pid, delta: number): void;
  /** Thêm/làm mới buff cho 1 người hoặc cả phòng. */
  addBuff(target: Pid | 'room', buff: BuffId, durationMs?: number): void;
  setHeld(pid: Pid, item: HeldItem | null): void;
  /** Danh hiệu tạm hiển thị cạnh tên (vd "Đại gia"). */
  setTitle(pid: Pid, title: string | null): void;
  /** Đổi trang phục (đã kiểm tra mở khóa); false nếu chưa mở khóa. */
  setOutfit(pid: Pid, outfit: Partial<Outfit>): boolean;
  /** DJ hiện tại ở Bar. */
  setDj(pid: Pid | null): void;
  djPid(): Pid | null;

  toast(target: Pid | 'room', text: string, tone?: Tone): void;
  fx(msg: FxMsg, to?: Pid | Pid[]): void;
  /** Tin hệ thống vào khung chat của cả phòng. */
  chatSystem(text: string): void;

  /** Người chơi có đứng trong bán kính trạm (thuộc map hiện tại) không. */
  isNear(pid: Pid, stationId: string, slack?: number): boolean;
  /** Hẹn giờ gắn với vòng đời phòng (tự hủy khi phòng đóng). Trả hàm hủy. */
  setTimeout(fn: () => void, ms: number): () => void;
  readonly shared: RoomSharedStore;
  log(...args: unknown[]): void;
}

export type LeaveReason = 'esc' | 'disconnect' | 'left' | 'map';

export interface ActivityInstance {
  /** Người chơi bấm E ở trạm của hoạt động này (server đã kiểm khoảng cách, map, không quỳ). */
  onInteract?(p: ServerPlayerView, station: StationDef): void;
  /** Thao tác `act` từ client. `data` CHƯA kiểm tra — module tự validate (zod). */
  onAction?(p: ServerPlayerView, type: string, data: unknown): void;
  /** Người chơi rời hoạt động: Esc, mất kết nối, rời phòng, đổi map. */
  onLeave?(p: ServerPlayerView, reason: LeaveReason): void;
  /** Hành động host (`HostActionMsg` type 'activity'); server đã kiểm người gửi là Phương Trượng. */
  onHostAction?(p: ServerPlayerView, action: string, data: unknown): void;
  /** Gọi 20 lần/giây. */
  tick?(dtMs: number, now: number): void;
  /** Đang có phiên co-op chạy → chặn đổi map. */
  isBusy?(): boolean;
  /** Phòng vừa đổi map. */
  onMapChange?(map: MapId): void;
  dispose?(): void;
}

export interface ActivityServerModule {
  readonly id: ActivityId;
  /** Map mà hoạt động diễn ra. */
  readonly maps: readonly MapId[];
  create(ctx: ActivityContext): ActivityInstance;
}
