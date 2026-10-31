// Quản lý các phòng: tạo mã, vào phòng (kể cả vào lại trong thời gian ân hạn), một khóa chỉ ở 1 phòng,
// hủy phòng trống sau 5 phút.
import { randomInt } from 'node:crypto';
import { ROOM, normalizeRoomCode, type JoinResult } from '@shared/index';
import type { ActivityServerModule } from '../activities/types';
import type { ProfileService } from '../profiles/ProfileService';
import { PartyRoom, type GameIo } from './PartyRoom';
import type { GameSocket, ServerPlayer } from './ServerPlayer';

export interface JoinInput {
  key: string | null;
  name: string;
  room: string | null;
  create: boolean;
}

export type JoinOutcome =
  | { ok: true; room: PartyRoom; player: ServerPlayer; result: JoinResult }
  | { ok: false; error: string };

export class RoomManager {
  readonly rooms = new Map<string, PartyRoom>();
  /** playerKey → phòng đang chứa người chơi đó. */
  private readonly keyIndex = new Map<string, PartyRoom>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly io: GameIo,
    private readonly profiles: ProfileService,
    private readonly modules: readonly ActivityServerModule[],
  ) {
    this.sweeper = setInterval(() => this.sweep(), 15_000);
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM.codeLength; i++) code += ROOM.codeChars[randomInt(ROOM.codeChars.length)];
      if (!this.rooms.has(code) && code !== ROOM.publicCode) return code;
    }
  }

  private getOrCreateRoom(code: string): PartyRoom {
    let room = this.rooms.get(code);
    if (!room) {
      room = new PartyRoom(code, this.io, this.profiles, this.modules, {
        onPlayerRemoved: (r, p) => {
          if (this.keyIndex.get(p.key) === r) this.keyIndex.delete(p.key);
        },
      });
      this.rooms.set(code, room);
    }
    return room;
  }

  async join(socket: GameSocket, input: JoinInput): Promise<JoinOutcome> {
    let code: string;
    if (input.create) {
      code = this.newCode();
    } else {
      const normalized = input.room === null ? ROOM.publicCode : normalizeRoomCode(input.room);
      if (!normalized) return { ok: false, error: `Mã chùa gồm ${ROOM.codeLength} ký tự (chữ in hoa và số).` };
      code = normalized;
    }

    const profile = await this.profiles.getOrCreate(input.key, input.name);
    if (!socket.connected) return { ok: false, error: 'Mất kết nối khi đang vào phòng.' };

    // Một khóa chỉ ở 1 phòng: cùng phòng thì gắn lại socket, khác phòng thì rời phòng cũ.
    const current = this.keyIndex.get(profile.key);
    if (current) {
      const existing = current.findByKey(profile.key);
      if (existing && current.code === code) {
        if (existing.socket && existing.socket !== socket) {
          current.detachSocket(existing, 'Bạn vừa vào game ở một tab hoặc máy khác.');
        }
        existing.profile = profile;
        current.reattach(existing, socket);
        return { ok: true, room: current, player: existing, result: current.joinResult(existing) };
      }
      if (existing) {
        if (existing.socket && existing.socket !== socket) {
          current.detachSocket(existing, 'Bạn vừa vào một chùa khác ở tab hoặc máy khác.');
        }
        current.removePlayer(existing, 'moved');
      }
      this.keyIndex.delete(profile.key);
    }

    const room = this.getOrCreateRoom(code);
    if (room.isFull) return { ok: false, error: `Chùa ${code} đã đủ ${ROOM.maxPlayers} người.` };
    const player = room.addPlayer(socket, profile);
    this.keyIndex.set(profile.key, room);
    return { ok: true, room, player, result: room.joinResult(player) };
  }

  /** Hủy phòng trống quá lâu. */
  sweep(now = Date.now()): void {
    for (const [code, room] of this.rooms) {
      if (room.players.size === 0 && room.emptySince !== null && now - room.emptySince >= ROOM.emptyTtlMs) {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    await this.profiles.flushAll();
  }
}
