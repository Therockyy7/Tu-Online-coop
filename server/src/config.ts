// Cấu hình server lấy từ biến môi trường.
import path from 'node:path';

export interface ServerConfig {
  port: number;
  /** Thư mục lưu hồ sơ dạng file JSON (khi không có MONGODB_URI). */
  dataDir: string;
  mongoUri: string | null;
  mongoDb: string;
  /** Thư mục client đã build (dist/client); null = không phục vụ file tĩnh. */
  clientDir: string | null;
  production: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    port: Number(env.PORT ?? 3000),
    dataDir: path.resolve(env.DATA_DIR ?? 'data'),
    mongoUri: env.MONGODB_URI?.trim() || null,
    mongoDb: env.MONGODB_DB?.trim() || 'tu_online',
    clientDir: path.resolve(env.CLIENT_DIR ?? 'dist/client'),
    production: env.NODE_ENV === 'production',
  };
}
