// Tiện ích test tích hợp: chạy server thật trên cổng ngẫu nhiên, nhiều socket.io-client giả làm người chơi.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, JoinRequest, JoinResult, ServerToClientEvents } from '@shared/index';
import { startGameServer, type GameServer } from '../../src/app';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestEnv {
  server: GameServer;
  dataDir: string;
  url: string;
  sockets: TestSocket[];
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

export async function createTestEnv(dataDir?: string): Promise<TestEnv> {
  const dir = dataDir ?? (await mkdtemp(path.join(os.tmpdir(), 'tu-online-test-')));
  const env: TestEnv = {
    server: await startGameServer({ port: 0, dataDir: dir, clientDir: null, saveDelayMs: 20 }),
    dataDir: dir,
    url: '',
    sockets: [],
    async restart() {
      for (const s of env.sockets) s.disconnect();
      env.sockets.length = 0;
      await env.server.close();
      env.server = await startGameServer({ port: 0, dataDir: dir, clientDir: null, saveDelayMs: 20 });
      env.url = `http://localhost:${env.server.port}`;
    },
    async dispose() {
      for (const s of env.sockets) s.disconnect();
      await env.server.close();
      // Socket vừa ngắt có thể còn hẹn lưu hồ sơ (saveDelayMs) → Windows báo ENOTEMPTY nếu xóa đúng lúc đó.
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 60 });
    },
  };
  env.url = `http://localhost:${env.server.port}`;
  return env;
}

export async function connect(env: TestEnv): Promise<TestSocket> {
  const s: TestSocket = io(env.url, { transports: ['websocket'], forceNew: true, reconnection: false });
  env.sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', reject);
  });
  return s;
}

export function join(s: TestSocket, req: Partial<JoinRequest> & { name: string }): Promise<JoinResult> {
  return new Promise((resolve) => {
    s.emit('join', { key: null, room: null, create: false, ...req }, resolve);
  });
}

export async function joinOk(s: TestSocket, req: Partial<JoinRequest> & { name: string }) {
  const r = await join(s, req);
  if (!r.ok) throw new Error(`join lỗi: ${r.error}`);
  return r;
}

/** Chờ sự kiện thỏa điều kiện (mặc định 3 giây). */
export function waitFor<E extends keyof ServerToClientEvents>(
  s: TestSocket,
  event: E,
  pred: (...args: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off(event, handler as never);
      reject(new Error(`Hết giờ chờ sự kiện ${String(event)}`));
    }, timeoutMs);
    const handler = (...args: Parameters<ServerToClientEvents[E]>) => {
      if (!pred(...args)) return;
      clearTimeout(timer);
      s.off(event, handler as never);
      resolve(args);
    };
    s.on(event, handler as never);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
