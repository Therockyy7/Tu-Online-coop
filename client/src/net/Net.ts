// Kết nối Socket.io có kiểu + đồng bộ đồng hồ với server.
import { io, type Socket } from 'socket.io-client';
import {
  NET,
  estimateClockOffset,
  type ClientToServerEvents,
  type ClockSample,
  type JoinRequest,
  type JoinResult,
  type ServerToClientEvents,
} from '@shared/index';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type ServerEventName = keyof ServerToClientEvents;
type QueuedEvent = [name: string, args: unknown[]];

export class Net {
  readonly socket: GameSocket;
  /** Sự kiện tới sau khi vào phòng nhưng trước khi game gắn handler — phát lại theo đúng thứ tự. */
  private queue: QueuedEvent[] | null = null;
  private readonly buffer = (name: string, ...args: unknown[]) => {
    this.queue?.push([name, args]);
  };

  constructor() {
    this.socket = io({
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  connect(timeoutMs = 12_000): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'));
      }, timeoutMs);
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('connect', onConnect);
      };
      this.socket.on('connect', onConnect);
      this.socket.connect();
    });
  }

  /** Gửi yêu cầu vào phòng; từ lúc nhận kết quả, các sự kiện server được giữ lại cho tới khi game nhận. */
  join(req: JoinRequest): Promise<JoinResult> {
    this.socket.offAny(this.buffer);
    this.queue = [];
    this.socket.onAny(this.buffer);
    return new Promise((resolve) => {
      this.socket.timeout(12_000).emit('join', req, (err: Error | null, res: JoinResult) => {
        // Sự kiện tới trước kết quả đã nằm sẵn trong trạng thái của kết quả → bỏ.
        if (this.queue) this.queue.length = 0;
        if (err) resolve({ ok: false, error: 'Máy chủ không phản hồi, thử lại nhé.' });
        else resolve(res);
      });
    });
  }

  /** Lấy các sự kiện đã giữ lại và ngừng giữ (game đã gắn handler riêng). */
  takeQueued(): QueuedEvent[] {
    this.socket.offAny(this.buffer);
    const q = this.queue ?? [];
    this.queue = null;
    return q;
  }

  close(): void {
    this.socket.offAny(this.buffer);
    this.queue = null;
    this.socket.disconnect();
  }
}

/** Ước lượng giờ server: ping vài lần lúc đầu, sau đó mỗi 10 giây; dùng mẫu có RTT nhỏ nhất. */
export class ServerClock {
  private offset = 0;
  private samples: ClockSample[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  rtt = 0;

  constructor(private readonly socket: GameSocket) {}

  now(): number {
    return Date.now() + this.offset;
  }

  /** Gán nhanh theo giờ server trong kết quả vào phòng (trước khi có mẫu ping). */
  seed(serverTime: number): void {
    if (this.samples.length === 0) this.offset = serverTime - Date.now();
  }

  async sync(count = 5): Promise<void> {
    for (let i = 0; i < count; i++) {
      await this.sample();
      await new Promise((r) => setTimeout(r, 70));
    }
  }

  start(): void {
    this.stop();
    this.timer = setInterval(() => void this.sample(), NET.clockPingIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private sample(): Promise<void> {
    if (!this.socket.connected) return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = Date.now();
      this.socket.timeout(3000).emit('clock', t0, (err: Error | null, server: number) => {
        if (!err && typeof server === 'number') {
          this.samples.push({ t0, t1: Date.now(), server });
          if (this.samples.length > 12) this.samples.shift();
          const est = estimateClockOffset(this.samples);
          if (est) {
            this.offset = est.offset;
            this.rtt = est.rtt;
          }
        }
        resolve();
      });
    });
  }
}
