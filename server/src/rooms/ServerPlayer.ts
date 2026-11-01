// Trạng thái một người chơi trong phòng (phía server). Hồ sơ lưu bền nằm trong `profile`.
import type { Socket } from 'socket.io';
import {
  NET,
  rankOf,
  type ActivityId,
  type AnimId,
  type BuffState,
  type ClientToServerEvents,
  type HeldItem,
  type Pid,
  type Profile,
  type RankId,
  type ServerToClientEvents,
} from '@shared/index';
import { TokenBucket } from '../net/rateLimit';

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export class ServerPlayer {
  socket: GameSocket | null;
  x = 0;
  z = 0;
  ry = 0;
  anim: AnimId = 'idle';
  held: HeldItem | null = null;
  /** Buff riêng (vd Được ban phước). Buff cả phòng nằm ở PartyRoom.roomBuffs. */
  buffs: BuffState[] = [];
  /** Độ Say (số thực, giảm dần); gửi đi dạng làm tròn. */
  doSay = 0;
  kneelUntil = 0;
  activity: ActivityId | null = null;
  connected = true;
  disconnectedAt = 0;
  title: string | null = null;
  lastPoseAt: number;
  blessReadyAt = 0;
  /** Lần cuối bị Phương Trượng phạt quỳ (luật "cùng một người phải cách 2 phút"). */
  lastPunishedAt = 0;
  /** Lần cuối (với tư cách host) phạt người khác. */
  lastPunishAt = 0;
  /** Lần cuối báo cả phòng "tụt cấp vì đỏ đen" (tối đa 1 tin / CASINO.demoteChatCooldownMs). */
  lastDemoteChatAt = 0;
  /** Chữ ký đồ đã mở khóa đã gửi cho client (chỉ gửi lại khi đổi). */
  unlockedSig = '';

  readonly limits = {
    pose: new TokenBucket(NET.posePerSec, NET.posePerSec),
    act: new TokenBucket(NET.actPerSec, NET.actPerSec),
    chat: new TokenBucket(NET.chatPerSec, NET.chatBurst),
    emote: new TokenBucket(2, 4),
    interact: new TokenBucket(8, 8),
    misc: new TokenBucket(5, 8),
  };

  constructor(
    readonly pid: Pid,
    public profile: Profile,
    socket: GameSocket,
    readonly joinedAt: number,
  ) {
    this.socket = socket;
    this.lastPoseAt = joinedAt;
  }

  get key(): string {
    return this.profile.key;
  }

  get name(): string {
    return this.profile.name;
  }

  get rank(): RankId {
    return rankOf(this.profile.congDuc);
  }

  kneeling(now: number): boolean {
    return this.kneelUntil > now;
  }
}
