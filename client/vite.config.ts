import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const serverPort = Number(process.env.PORT ?? 3000);

export default defineConfig({
  root: here('.'),
  publicDir: false,
  resolve: {
    alias: {
      '@shared': here('../shared/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
      '/healthz': { target: `http://localhost:${serverPort}` },
    },
  },
  build: {
    outDir: here('../dist/client'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: { main: here('index.html') },
    },
  },
});
