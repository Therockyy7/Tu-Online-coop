// Điểm vào server: đọc cấu hình, chạy game, tắt êm (ghi hết hồ sơ) khi nhận tín hiệu dừng.
import { loadConfig } from './config';
import { startGameServer } from './app';

const config = loadConfig();

const game = await startGameServer({
  port: config.port,
  dataDir: config.dataDir,
  mongoUri: config.mongoUri,
  mongoDb: config.mongoDb,
  clientDir: config.clientDir,
});

console.log(
  `[tu-online] server chạy ở http://localhost:${game.port} — lưu hồ sơ bằng ${
    game.profiles.store.kind === 'mongo' ? 'MongoDB' : `file (${config.dataDir})`
  }`,
);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[tu-online] nhận ${signal}, đang ghi hồ sơ và tắt…`);
  const force = setTimeout(() => process.exit(1), 8000);
  try {
    await game.close();
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
