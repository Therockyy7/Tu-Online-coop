// Gắn các sự kiện Socket.io của mỗi kết nối vào phòng mà người chơi đang ở.
import { sanitizeName } from '@shared/index';
import type { PartyRoom, GameIo } from '../rooms/PartyRoom';
import type { RoomManager } from '../rooms/RoomManager';
import type { GameSocket, ServerPlayer } from '../rooms/ServerPlayer';
import { TokenBucket } from './rateLimit';
import { joinSchema } from './schemas';

export function attachConnections(io: GameIo, rooms: RoomManager): void {
  io.on('connection', (socket: GameSocket) => {
    let session: { room: PartyRoom; player: ServerPlayer } | null = null;
    let joining = false;
    const joinLimit = new TokenBucket(0.5, 4);
    const clockLimit = new TokenBucket(4, 12);

    /** Bọc handler: chỉ chạy khi đã vào phòng, và nuốt lỗi để không sập server. */
    const on = <A extends unknown[]>(fn: (room: PartyRoom, p: ServerPlayer, ...args: A) => void) => {
      return (...args: A) => {
        const s = session;
        if (!s || s.player.socket !== socket) return;
        try {
          fn(s.room, s.player, ...args);
        } catch (err) {
          console.error('[socket] lỗi xử lý gói tin', err);
        }
      };
    };

    socket.on('clock', (t0, ack) => {
      if (typeof ack !== 'function' || !clockLimit.take()) return;
      ack(Date.now());
    });

    socket.on('join', async (req, ack) => {
      if (typeof ack !== 'function') return;
      if (joining || session) return ack({ ok: false, error: 'Đang ở trong phòng rồi.' });
      if (!joinLimit.take()) return ack({ ok: false, error: 'Thao tác nhanh quá, đợi chút rồi thử lại.' });
      const parsed = joinSchema.safeParse(req);
      if (!parsed.success) return ack({ ok: false, error: 'Yêu cầu vào phòng không hợp lệ.' });
      const name = sanitizeName(parsed.data.name);
      if (!name) return ack({ ok: false, error: 'Tên cần 2–16 ký tự.' });
      joining = true;
      try {
        const out = await rooms.join(socket, { ...parsed.data, name });
        if (!out.ok) return ack(out);
        if (!socket.connected) {
          out.room.onDisconnect(out.player, socket);
          return;
        }
        session = { room: out.room, player: out.player };
        ack(out.result);
      } catch (err) {
        console.error('[socket] lỗi vào phòng', err);
        ack({ ok: false, error: 'Máy chủ gặp lỗi, thử lại sau nhé.' });
      } finally {
        joining = false;
      }
    });

    socket.on('pose', on((room, p, m) => room.onPose(p, m)));
    socket.on('chat', on((room, p, text) => room.onChat(p, text)));
    socket.on('emote', on((room, p, id) => room.onEmote(p, id)));
    socket.on('interact', on((room, p, id) => room.onInteract(p, id)));
    socket.on('drop', on((room, p) => room.onDrop(p)));
    socket.on('leaveActivity', on((room, p) => room.onLeaveActivity(p)));
    socket.on('act', on((room, p, m) => room.onAct(p, m)));
    socket.on('host', on((room, p, m) => room.onHost(p, m)));
    socket.on('bless', on((room, p, target) => room.onBless(p, target)));

    socket.on('disconnect', () => {
      const s = session;
      session = null;
      if (s) s.room.onDisconnect(s.player, socket);
    });
  });
}
