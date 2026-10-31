// Chơi ngay với bạn bè: build (nếu chưa có), chạy server bản production, mở tunnel ngrok và in link mời.
// Dùng: npm run share            (cổng mặc định 3000)
//       PORT=4000 npm run share
//       NGROK_DOMAIN=ten-ban.ngrok-free.app npm run share   (nếu có domain tĩnh của ngrok)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 3000);
const children = [];

function log(msg) {
  process.stdout.write(`\x1b[35m[share]\x1b[0m ${msg}\n`);
}

function shutdown(code = 0) {
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function waitFor(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      // chưa sẵn sàng
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Hết thời gian chờ ${url}`);
}

if (!existsSync('dist/server/index.js') || !existsSync('dist/client/index.html')) {
  log('Chưa có bản build — đang chạy npm run build…');
  const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    log('Build lỗi, dừng.');
    process.exit(1);
  }
}

log(`Khởi động server ở cổng ${PORT}…`);
const server = spawn(process.execPath, ['dist/server/index.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
});
children.push(server);
server.on('exit', (code) => {
  log(`Server đã dừng (code ${code}).`);
  shutdown(code ?? 1);
});

try {
  await waitFor(`http://localhost:${PORT}/healthz`, 20_000);
} catch (err) {
  log(String(err));
  shutdown(1);
}

const ngrokArgs = ['http', String(PORT), '--log', 'stdout', '--log-format', 'json'];
if (process.env.NGROK_DOMAIN) ngrokArgs.push('--url', process.env.NGROK_DOMAIN);
log('Mở tunnel ngrok…');
const ngrok = spawn('ngrok', ngrokArgs, { stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' });
children.push(ngrok);
ngrok.on('exit', (code) => {
  log(`ngrok đã dừng (code ${code}). Kiểm tra đã đăng nhập ngrok (ngrok config add-authtoken …) chưa.`);
  shutdown(code ?? 1);
});

let announced = false;
function announce(url) {
  if (announced) return;
  announced = true;
  log('──────────────────────────────────────────────');
  log(`Link chơi chung: ${url}`);
  log(`Gửi bạn bè link phòng: ${url}/?r=MÃPHÒNG (mã hiện ở góc phải trên khi vào game)`);
  log('Lần đầu mở link, ngrok hiện trang cảnh báo — bấm "Visit Site" là vào được.');
  log('Ctrl+C để tắt server và tunnel.');
  log('──────────────────────────────────────────────');
}

// Dự phòng: hỏi API cục bộ của ngrok nếu log không có URL.
setTimeout(async () => {
  for (let i = 0; i < 10 && !announced; i++) {
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels');
      const data = await res.json();
      const t = (data.tunnels ?? []).find((x) => String(x.public_url).startsWith('https://'));
      if (t) announce(t.public_url);
    } catch {
      // API chưa sẵn sàng
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}, 4000);

let buf = '';
ngrok.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  const lines = buf.split(/\r?\n/);
  buf = lines.pop() ?? '';
  for (const line of lines) {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.lvl === 'eror' || rec.lvl === 'crit') log(`ngrok lỗi: ${rec.err ?? rec.msg}`);
    if (typeof rec.url === 'string' && rec.url.startsWith('https://')) announce(rec.url);
  }
});
