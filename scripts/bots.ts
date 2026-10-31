// Người chơi ảo để thử nhiều người: vào phòng, đi lang thang quanh sân, thỉnh thoảng chat và emote.
// Chạy khi server đang bật:  npm run bots -- --room ABCD --count 8 [--url http://localhost:3000] [--seconds 60]
// Không có --room thì tạo phòng mới và in mã phòng. Khóa hồ sơ của bot lưu ở data/bot-keys.json để lần sau
// dùng lại đúng các hồ sơ đó (không đẻ thêm hồ sơ mới mỗi lần chạy).
import fs from 'node:fs';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import {
  EMOTE_IDS,
  NET,
  type ClientToServerEvents,
  type JoinResult,
  type MapId,
  type Pid,
  type ServerToClientEvents,
} from '../shared/src/index';

type BotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const URL = arg('url', 'http://localhost:3000');
const COUNT = Math.max(1, Math.min(20, Number(arg('count', '4')) || 4));
/** Tự rời phòng sau chừng này giây (0 = chạy tới khi Ctrl+C). */
const SECONDS = Math.max(0, Number(arg('seconds', '0')) || 0);
let roomCode: string | null = arg('room', '').toUpperCase() || null;

const NAMES = ['Tiểu Mõ', 'Chú Tiểu Bơ', 'Sư Đậu', 'Bé Sen', 'Chú Mít', 'Tiểu Khoai', 'Sư Bánh Bao', 'Bé Chuông', 'Chú Nấm', 'Tiểu Bồ Đề'];
const LINES = [
  'A Di Đà Phật 🙏',
  'Hôm nay quét lá chưa mọi người?',
  'Ai đi tụng kinh không?',
  'Đói quá, nấu cơm chay đi!',
  'Thầy ơi cho con xin ít Công Đức',
  'Tối nay hạ sơn đi bar nha 🕺',
  'Thỉnh chuông cần 3 người nè',
  'Tâm tịnh, tâm tịnh…',
];
/** Vùng sân rộng để đi lang thang theo từng map (tránh mép tường). */
const WANDER: Record<MapId, { x: [number, number]; z: [number, number] }> = {
  temple: { x: [-12, 12], z: [2, 30] },
  bar: { x: [-14, 14], z: [-8, 10] },
};

const KEY_FILE = path.resolve('data', 'bot-keys.json');
function loadKeys(): string[] {
  try {
    const v = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
const keys = loadKeys();
function saveKey(i: number, key: string): void {
  keys[i] = key;
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify(keys, null, 2));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const join = (s: BotSocket, req: Parameters<ClientToServerEvents['join']>[0]) =>
  new Promise<JoinResult>((resolve) => s.emit('join', req, resolve));

class Bot {
  private readonly socket: BotSocket;
  private pid: Pid = '';
  private map: MapId = 'temple';
  private x = 0;
  private z = 0;
  private ry = 0;
  private target: { x: number; z: number } | null = null;
  private restUntil = 0;
  private nextEmote = Date.now() + rand(4000, 12_000);
  private nextChat = Date.now() + rand(8000, 30_000);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly index: number,
    private readonly name: string,
  ) {
    this.socket = io(URL, { transports: ['websocket'], reconnection: false });
  }

  async start(): Promise<boolean> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', reject);
    });
    const res = await join(this.socket, { key: keys[this.index] ?? null, name: this.name, room: roomCode, create: roomCode === null });
    if (!res.ok) {
      console.log(`[${this.name}] không vào được phòng: ${res.error}`);
      this.socket.close();
      return false;
    }
    saveKey(this.index, res.key);
    roomCode = res.room.code;
    this.pid = res.you.pid;
    this.map = res.room.map;
    const me = res.players.find((p) => p.pid === this.pid);
    this.x = me?.x ?? 0;
    this.z = me?.z ?? 0;
    // Server kéo về vị trí hợp lệ (va tường / đi nhanh quá) → nhận vị trí mới, chọn hướng khác.
    this.socket.on('playerPatch', (pid, patch) => {
      if (pid !== this.pid || patch.x === undefined || patch.z === undefined) return;
      this.x = patch.x;
      this.z = patch.z;
      this.target = null;
    });
    this.socket.on('room', (patch) => {
      if (patch.map) {
        this.map = patch.map;
        this.target = null;
      }
    });
    this.socket.on('disconnect', () => this.stop());
    const dt = 1 / NET.poseHz;
    this.timer = setInterval(() => this.step(dt), dt * 1000);
    console.log(`[${this.name}] đã vào phòng ${roomCode}`);
    return true;
  }

  private step(dt: number): void {
    const now = Date.now();
    if (now >= this.nextEmote) {
      this.nextEmote = now + rand(9000, 20_000);
      this.socket.emit('emote', pick(EMOTE_IDS));
      this.restUntil = now + 2600;
    }
    if (now >= this.nextChat) {
      this.nextChat = now + rand(20_000, 45_000);
      this.socket.emit('chat', pick(LINES));
    }
    let anim: 'idle' | 'walk' = 'idle';
    if (now >= this.restUntil) {
      if (!this.target) {
        const w = WANDER[this.map];
        this.target = { x: rand(w.x[0], w.x[1]), z: rand(w.z[0], w.z[1]) };
      }
      const dx = this.target.x - this.x;
      const dz = this.target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        this.target = null;
        this.restUntil = now + rand(800, 4000);
      } else {
        const stepLen = Math.min(d, 3.6 * dt);
        this.x += (dx / d) * stepLen;
        this.z += (dz / d) * stepLen;
        this.ry = Math.atan2(dx, dz);
        anim = 'walk';
      }
    }
    this.socket.emit('pose', { x: this.x, z: this.z, ry: this.ry, anim });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.socket.connected) this.socket.close();
  }
}

async function main(): Promise<void> {
  const bots: Bot[] = [];
  for (let i = 0; i < COUNT; i++) {
    const bot = new Bot(i, NAMES[i % NAMES.length]! + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''));
    // Bot đầu tiên tạo phòng (nếu chưa có mã) nên phải vào xong rồi mới thả các bot sau.
    if (await bot.start().catch((e: unknown) => (console.log(`Không kết nối được ${URL}:`, e instanceof Error ? e.message : e), false))) {
      bots.push(bot);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (bots.length === 0) process.exit(1);
  console.log(`${bots.length} bot đang chơi trong phòng ${roomCode} — Ctrl+C để dừng.`);
  const quit = () => {
    for (const b of bots) b.stop();
    process.exit(0);
  };
  process.on('SIGINT', quit);
  if (SECONDS > 0) setTimeout(quit, SECONDS * 1000);
}

void main();
