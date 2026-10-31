// Chạy song song server (tsx watch) và client (Vite dev server).
import { spawn } from 'node:child_process';

const procs = [
  { name: 'server', color: '\x1b[33m', script: 'dev:server' },
  { name: 'client', color: '\x1b[36m', script: 'dev:client' },
];

const children = procs.map(({ name, color, script }) => {
  const child = spawn('npm', ['run', script], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${prefix}đã thoát (code ${code})\n`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
