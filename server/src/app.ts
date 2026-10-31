// Dựng server game: Express (file client + /healthz) + Socket.io + kho hồ sơ + RoomManager.
// Tách khỏi index.ts để test tích hợp chạy server thật trên cổng ngẫu nhiên.
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/index';
import { ACTIVITY_MODULES } from './activities/registry';
import type { ActivityServerModule } from './activities/types';
import { attachConnections } from './net/connection';
import { FileProfileStore } from './profiles/FileProfileStore';
import { createMongoProfileStore } from './profiles/MongoProfileStore';
import { ProfileService } from './profiles/ProfileService';
import type { ProfileStore } from './profiles/ProfileStore';
import { RoomManager } from './rooms/RoomManager';

export interface GameServerOptions {
  /** 0 = cổng ngẫu nhiên (test). */
  port: number;
  dataDir: string;
  mongoUri?: string | null;
  mongoDb?: string;
  clientDir?: string | null;
  modules?: readonly ActivityServerModule[];
  /** Độ trễ ghi hồ sơ (ms). */
  saveDelayMs?: number;
}

export interface GameServer {
  readonly port: number;
  readonly rooms: RoomManager;
  readonly profiles: ProfileService;
  close(): Promise<void>;
}

export async function startGameServer(opts: GameServerOptions): Promise<GameServer> {
  const store: ProfileStore = opts.mongoUri
    ? await createMongoProfileStore(opts.mongoUri, opts.mongoDb ?? 'tu_online')
    : new FileProfileStore(path.join(opts.dataDir, 'profiles'));
  const profiles = new ProfileService(store, opts.saveDelayMs ?? 5000);

  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => {
    res.type('text/plain').send('ok');
  });
  const clientDir = opts.clientDir ?? null;
  if (clientDir && existsSync(path.join(clientDir, 'index.html'))) {
    app.use(
      express.static(clientDir, {
        index: false,
        maxAge: '7d',
        setHeaders(res, file) {
          // File có hash trong tên được cache lâu; HTML luôn kiểm tra lại.
          if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });
  const rooms = new RoomManager(io, profiles, opts.modules ?? ACTIVITY_MODULES);
  attachConnections(io, rooms);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;

  let closed = false;
  return {
    port,
    rooms,
    profiles,
    async close() {
      if (closed) return;
      closed = true;
      await rooms.shutdown();
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
      await store.close();
    },
  };
}
