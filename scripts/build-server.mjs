// Bundle server (kèm code shared/) thành 1 file ESM chạy bằng Node.
import { build } from 'esbuild';

await build({
  entryPoints: ['server/src/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  tsconfig: 'server/tsconfig.json',
  // Thư viện runtime giữ nguyên trong node_modules (không bundle).
  external: ['express', 'socket.io', 'zod', 'mongodb'],
  logLevel: 'info',
});
