// HỢP ĐỒNG các hành động UI/mini-game gửi lên server (engine cài đặt qua Net).
import type { ActivityId, EmoteId, HostActionMsg, Pid } from '@shared/index';

export interface GameActions {
  chat(text: string): void;
  emote(id: EmoteId): void;
  host(msg: HostActionMsg): void;
  bless(target: Pid): void;
  /** Bỏ/trả vật đang cầm. */
  drop(): void;
  /** Thoát hoạt động đang tham gia (Esc). */
  leaveActivity(): void;
  act(a: ActivityId, type: string, data?: unknown): void;
  interact(stationId: string): void;
  /** Rời phòng, về sảnh. */
  leaveRoom(): void;
}
