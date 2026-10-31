import type {
  AccessoryId,
  ActivityId,
  AnimId,
  BuffId,
  HatId,
  HeldKind,
  MapId,
  RankId,
  RobeId,
} from './ids';

/** ID công khai của người chơi trong phòng (không phải playerKey). */
export type Pid = string;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Outfit {
  robe: RobeId;
  hat: HatId;
  accessory: AccessoryId;
}

export interface HeldItem {
  kind: HeldKind;
  /** Chi tiết: loại quả, màu hoa, trạng thái đèn… (xem HELD_KINDS). */
  variant?: string;
}

export interface BuffState {
  id: BuffId;
  /** Giờ server (ms) hết hạn. */
  until: number;
}

/** Thông tin người chơi gửi cho mọi người trong phòng. */
export interface PlayerPublic {
  pid: Pid;
  name: string;
  rank: RankId;
  congDuc: number;
  isHost: boolean;
  outfit: Outfit;
  vip: boolean;
  /** Danh hiệu tạm trong phòng (vd "Đại gia"), null nếu không có. */
  title: string | null;
  held: HeldItem | null;
  buffs: BuffState[];
  tapNiem: number;
  doSay: number;
  connected: boolean;
  /** Giờ server hết quỳ sám hối; 0 = không quỳ. */
  kneelUntil: number;
  /** Hoạt động đang tham gia (dùng cho nhãn/khóa), null nếu rảnh. */
  activity: ActivityId | null;
  x: number;
  z: number;
  /** Góc quay quanh trục Y (radian). */
  ry: number;
  anim: AnimId;
  /** Giờ server lúc vào phòng (tie-break Phương Trượng). */
  joinedAt: number;
}

export interface UnlockState {
  robes: RobeId[];
  hats: HatId[];
  accessories: AccessoryId[];
}

/** Thông tin riêng chỉ gửi cho chính người chơi. */
export interface SelfState {
  pid: Pid;
  name: string;
  congDuc: number;
  peakCongDuc: number;
  duc: number;
  tapNiem: number;
  xu: number;
  vip: boolean;
  outfit: Outfit;
  unlocked: UnlockState;
  rank: RankId;
  isHost: boolean;
  buffs: BuffState[];
  doSay: number;
}

export interface MapChange {
  to: MapId;
  /** Giờ server sẽ dịch chuyển. */
  at: number;
}

export interface RoomPublic {
  code: string;
  map: MapId;
  hostPid: Pid | null;
  /** Quỹ Công Đức của phòng. */
  pool: number;
  /** DJ hiện tại ở Bar. */
  djPid: Pid | null;
  mapChange: MapChange | null;
  playerCount: number;
}

/** Hồ sơ lưu bền (File/Mongo). */
export interface Profile {
  v: 1;
  key: string;
  name: string;
  congDuc: number;
  peakCongDuc: number;
  duc: number;
  tapNiem: number;
  xu: number;
  vip: boolean;
  outfit: Outfit;
  stats: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}
