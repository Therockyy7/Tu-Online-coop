// HỢP ĐỒNG trạng thái game phía client (engine cài đặt, UI + mini-game đọc).
import type { ActivityId, ChatMsg, MapId, Pid, PlayerPublic, RoomPublic, SelfState } from '@shared/index';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export type GameEvent =
  | { type: 'self'; patch: Partial<SelfState> }
  | { type: 'room'; patch: Partial<RoomPublic> }
  | { type: 'playerJoined'; player: PlayerPublic }
  | { type: 'playerLeft'; pid: Pid; name: string }
  | { type: 'playerPatch'; pid: Pid; patch: Partial<PlayerPublic> }
  | { type: 'chat'; msg: ChatMsg }
  /** Map của phòng vừa đổi (sau khi dịch chuyển xong). */
  | { type: 'mapChanged'; map: MapId }
  | { type: 'connection'; status: ConnectionStatus }
  /** Server đá ra (vd đăng nhập ở tab khác). */
  | { type: 'kicked'; reason: string };

export type GameEventType = GameEvent['type'];
export type GameEventOf<T extends GameEventType> = Extract<GameEvent, { type: T }>;

export interface GameStateApi {
  /** playerKey của mình (để hiện mã khôi phục). */
  readonly key: string;
  readonly me: Readonly<SelfState>;
  readonly room: Readonly<RoomPublic>;
  readonly connection: ConnectionStatus;
  players(): ReadonlyMap<Pid, PlayerPublic>;
  player(pid: Pid): PlayerPublic | undefined;
  /** Bản công khai của chính mình (vị trí, held, anim…). */
  myPlayer(): PlayerPublic | undefined;
  chatLog(): readonly ChatMsg[];
  /** Trạng thái công khai mới nhất của một hoạt động. */
  activityState(a: ActivityId): unknown;
  /** Giờ server ước lượng (ms). */
  serverNow(): number;
  /** Đăng ký sự kiện; trả hàm hủy đăng ký. */
  on<T extends GameEventType>(type: T, fn: (e: GameEventOf<T>) => void): () => void;
}
