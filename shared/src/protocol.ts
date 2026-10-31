// Giao thức Socket.io có kiểu, dùng chung client/server.
import type { ActivityId, AnimId, EmoteId, RankId, SfxId } from './ids';
import type { Pid, PlayerPublic, RoomPublic, SelfState } from './types';

export interface JoinRequest {
  /** playerKey đã lưu ở trình duyệt; null nếu lần đầu. */
  key: string | null;
  name: string;
  /** Mã phòng muốn vào; null khi tạo mới. */
  room: string | null;
  create: boolean;
}

export type JoinResult =
  | {
      ok: true;
      key: string;
      you: SelfState;
      room: RoomPublic;
      players: PlayerPublic[];
      /** Trạng thái công khai hiện tại của các hoạt động trong map hiện tại. */
      activities: Partial<Record<ActivityId, unknown>>;
      serverTime: number;
    }
  | { ok: false; error: string };

export interface PoseMsg {
  x: number;
  z: number;
  ry: number;
  anim: AnimId;
}

/** [pid, x, z, ry, anim] — gọn để gửi 15 lần/giây. */
export type SnapEntry = [pid: Pid, x: number, z: number, ry: number, anim: AnimId];

export interface SnapMsg {
  /** Giờ server lúc chụp snapshot. */
  t: number;
  p: SnapEntry[];
}

export interface ChatMsg {
  /** null = tin hệ thống. */
  pid: Pid | null;
  name: string;
  text: string;
  t: number;
}

/** Thao tác gửi tới một hoạt động. `type` và `data` do module định nghĩa. */
export interface ActMsg {
  a: ActivityId;
  type: string;
  data?: unknown;
}

export type HostActionMsg =
  | { type: 'gift'; target: Pid; amount: number }
  | { type: 'punish'; target: Pid }
  | { type: 'go_bar' }
  | { type: 'go_temple' }
  /** Hành động host do module hoạt động định nghĩa (vd bắt đầu thời khóa, mở Đại lễ). */
  | { type: 'activity'; a: ActivityId; action: string; data?: unknown };

export type Tone = 'info' | 'good' | 'bad' | 'warn' | 'gold';

export type FxMsg =
  /** Số "+N Công Đức" (hoặc âm) bay lên trên đầu người chơi. */
  | { type: 'karma'; pid: Pid; amount: number; label?: string }
  | { type: 'xu'; pid: Pid; amount: number }
  | { type: 'tapniem'; pid: Pid; amount: number }
  | { type: 'banner'; title: string; sub?: string; tone?: Tone; big?: boolean }
  /** Phát âm thanh; `at` = giờ server để phát đồng bộ; x/z = vị trí (âm lượng theo khoảng cách). */
  | { type: 'sound'; id: SfxId; at?: number; x?: number; z?: number; volume?: number }
  | { type: 'rankup'; pid: Pid; rank: RankId }
  /** Ban phước: tim + lấp lánh bay quanh người được ban, vòng sáng dưới chân. */
  | { type: 'bless'; from: Pid; to: Pid }
  | { type: 'confetti'; x?: number; z?: number }
  | { type: 'petals' }
  | { type: 'shake'; strength: number }
  | { type: 'flash'; color: string }
  /** Bật/tắt hiệu ứng phát sáng của một trạm hoặc khu vực (vd Chánh Điện hào quang). */
  | { type: 'glow'; target: string; on: boolean };

export interface ToastMsg {
  text: string;
  tone: Tone;
}

export interface ClientToServerEvents {
  join: (req: JoinRequest, ack: (res: JoinResult) => void) => void;
  /** Đồng bộ đồng hồ: gửi giờ client, nhận giờ server. */
  clock: (t0: number, ack: (serverTime: number) => void) => void;
  pose: (p: PoseMsg) => void;
  chat: (text: string) => void;
  emote: (id: EmoteId) => void;
  interact: (stationId: string) => void;
  drop: () => void;
  leaveActivity: () => void;
  act: (m: ActMsg) => void;
  host: (m: HostActionMsg) => void;
  bless: (target: Pid) => void;
}

export interface ServerToClientEvents {
  snap: (m: SnapMsg) => void;
  playerJoined: (p: PlayerPublic) => void;
  playerLeft: (pid: Pid) => void;
  playerPatch: (pid: Pid, patch: Partial<PlayerPublic>) => void;
  self: (patch: Partial<SelfState>) => void;
  room: (patch: Partial<RoomPublic>) => void;
  chat: (m: ChatMsg) => void;
  emote: (pid: Pid, id: EmoteId) => void;
  /** Trạng thái công khai của hoạt động (gửi cả phòng khi thay đổi). */
  actState: (a: ActivityId, state: unknown) => void;
  /** Sự kiện của hoạt động (cả phòng hoặc riêng 1 người). */
  actEvent: (a: ActivityId, type: string, data: unknown) => void;
  /** Mở giao diện hoạt động cho riêng người chơi này. */
  actOpen: (a: ActivityId, data: unknown) => void;
  actClose: (a: ActivityId, reason: string) => void;
  fx: (m: FxMsg) => void;
  toast: (m: ToastMsg) => void;
  kicked: (reason: string) => void;
}
