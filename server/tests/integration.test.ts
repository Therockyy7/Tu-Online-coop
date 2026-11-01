// Test tích hợp server lõi: server thật + nhiều socket.io-client.
import { afterEach, describe, expect, it } from 'vitest';
import { CHOP, HOST, HOST_TITLE, RANK_THRESHOLDS, findStation, type FxMsg, type SelfState } from '@shared/index';
import { connect, createTestEnv, join, joinOk, sleep, waitFor, type TestEnv } from './helpers/testServer';

let env: TestEnv | null = null;

afterEach(async () => {
  await env?.dispose();
  env = null;
});

function roomOf(code: string) {
  const room = env!.server.rooms.rooms.get(code);
  if (!room) throw new Error(`Không có phòng ${code}`);
  return room;
}

describe('Server lõi', () => {
  it('tạo phòng, người thứ hai vào bằng mã: thấy nhau và nhận snapshot', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Sư Tèo', create: true });
    expect(ra.room.code).toMatch(/^[A-Z2-9]{4}$/);
    expect(ra.players).toHaveLength(1);
    expect(ra.you.isHost).toBe(true);

    const b = await connect(env);
    const joined = waitFor(a, 'playerJoined');
    const rb = await joinOk(b, { name: 'Chú Tễu', room: ra.room.code.toLowerCase() });
    const [pub] = await joined;
    expect(pub.name).toBe('Chú Tễu');
    expect(rb.players.map((p) => p.name).sort()).toEqual(['Chú Tễu', 'Sư Tèo']);
    expect(rb.room.hostPid).toBe(ra.you.pid);

    const [snap] = await waitFor(a, 'snap', (m) => m.p.length === 2);
    expect(snap.p.map((e) => e[0]).sort()).toEqual([ra.you.pid, rb.you.pid].sort());
  });

  it('chat làm sạch + giới hạn tần suất, emote gửi cả phòng', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'An An', create: true });
    const b = await connect(env);
    await joinOk(b, { name: 'Bình Bình', room: ra.room.code });

    const got = waitFor(b, 'chat', (m) => m.pid === ra.you.pid);
    a.emit('chat', '  <b>Xin   chào</b>  ');
    const [msg] = await got;
    expect(msg.text).toBe('<b>Xin chào</b>');

    const emote = waitFor(b, 'emote');
    a.emit('emote', 'pray');
    expect(await emote).toEqual([ra.you.pid, 'pray']);

    const warned = waitFor(a, 'toast', (t) => t.tone === 'warn');
    for (let i = 0; i < 5; i++) a.emit('chat', `tin ${i}`);
    await warned;
  });

  it('Phương Trượng là người nhiều Công Đức nhất, chuyển ngay khi bị vượt; thăng cấp đổi áo', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Trụ Trì', create: true });
    const b = await connect(env);
    const rb = await joinOk(b, { name: 'Tiểu Bảo', room: ra.room.code });
    const room = roomOf(ra.room.code);

    const hostChanged = waitFor(a, 'room', (r) => r.hostPid === rb.you.pid);
    const rankup = waitFor(b, 'self', (s) => s.rank === 'hoa_thuong_tap_su');
    const fx = waitFor(a, 'fx', (m) => m.type === 'rankup');
    room.reward(rb.you.pid, RANK_THRESHOLDS.hoa_thuong_tap_su, { raw: true });
    await hostChanged;
    const [self] = await rankup;
    expect(self.outfit?.robe).toBe('robe_lam');
    expect(self.isHost).toBeUndefined();
    await fx;
    expect(room.hostPid).toBe(rb.you.pid);

    // Người không phải host không mở được menu Phương Trượng.
    const denied = waitFor(a, 'toast', (t) => t.tone === 'warn');
    a.emit('host', { type: 'go_bar' });
    await denied;
  });

  it('Q bỏ vật cầm; phạt quỳ chặn di chuyển', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Host Hà', create: true });
    const b = await connect(env);
    const rb = await joinOk(b, { name: 'Bé Bi', room: ra.room.code });
    const room = roomOf(ra.room.code);

    room.setHeld(rb.you.pid, { kind: 'broom' });
    const dropped = waitFor(a, 'playerPatch', (pid, p) => pid === rb.you.pid && p.held === null);
    b.emit('drop');
    await dropped;

    const kneel = waitFor(b, 'playerPatch', (pid, p) => pid === rb.you.pid && (p.kneelUntil ?? 0) > 0);
    a.emit('host', { type: 'punish', target: rb.you.pid });
    await kneel;
    const pb = room.players.get(rb.you.pid)!;
    const before = { x: pb.x, z: pb.z };
    b.emit('pose', { x: before.x + 0.3, z: before.z, ry: 0, anim: 'walk' });
    await sleep(80);
    expect(pb.x).toBe(before.x);
    expect(pb.anim).toBe('kneel');
  });

  it('Hạ Sơn: đếm 5 giây rồi cả phòng sang Bar; đang có phiên chẻ củi thì không cho đi', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Thầy Ba', create: true });
    const room = roomOf(ra.room.code);
    const pa = room.players.get(ra.you.pid)!;

    // Đang chẻ củi (co-op/cá nhân đều chặn đổi map khi module báo bận) — chẻ củi không bận nên vẫn đi được.
    const block = findStation('chop_block_1')!.station;
    pa.x = block.x;
    pa.z = block.z;
    const opened = waitFor(a, 'actOpen', (id) => id === 'chop');
    a.emit('interact', block.id);
    await opened;

    const countdown = waitFor(a, 'room', (r) => r.mapChange?.to === 'bar');
    a.emit('host', { type: 'go_bar' });
    const [r1] = await countdown;
    expect(r1.mapChange!.at - Date.now()).toBeGreaterThan(HOST.mapChangeCountdownMs - 1500);
    const closed = waitFor(a, 'actClose', (id) => id === 'chop', 8000);
    const moved = waitFor(a, 'room', (r) => r.map === 'bar', 8000);
    await closed;
    const [r2] = await moved;
    // Hạ Sơn không trao danh hiệu DJ cho Phương Trượng (chỉ thắng vòng nhảy mới có).
    expect(r2.djPid).toBeNull();
    expect(room.map).toBe('bar');
    expect(Math.abs(pa.z - 12.5)).toBeLessThan(3);
  }, 15_000);

  it('kho củi khởi đầu đúng balance và trạng thái hoạt động gửi kèm khi vào phòng', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Củi Khô', create: true });
    expect((ra.activities.chop as { firewood: number }).firewood).toBe(CHOP.firewoodStart);
  });

  it('hồ sơ còn sau khi khởi động lại server; không lộ khóa của người khác', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Bền Bỉ', room: 'TEST' });
    const key = ra.key;
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    roomOf('TEST').reward(ra.you.pid, 30, { raw: true });
    roomOf('TEST').addXu(ra.you.pid, 120);

    const b = await connect(env);
    const rb = await joinOk(b, { name: 'Tò Mò', room: 'TEST' });
    expect(JSON.stringify(rb)).not.toContain(key);

    await env.restart();
    const a2 = await connect(env);
    const again = await joinOk(a2, { name: 'Bền Bỉ', key, room: 'TEST' });
    expect(again.key).toBe(key);
    expect(again.you.congDuc).toBe(30);
    expect(again.you.duc).toBe(30);
    expect(again.you.xu).toBe(120);
  });

  it('cùng khóa vào ở tab mới thì tab cũ bị ngắt, giữ nguyên người chơi', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Hai Tab', room: 'DUAL' });
    const kicked = waitFor(a, 'kicked');
    const a2 = await connect(env);
    const r2 = await joinOk(a2, { name: 'Hai Tab', key: ra.key, room: 'DUAL' });
    await kicked;
    expect(r2.you.pid).toBe(ra.you.pid);
    expect(roomOf('DUAL').players.size).toBe(1);
  });

  it('từ chối tên không hợp lệ và mã phòng sai', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const bad = await join(a, { name: 'A' });
    expect(bad.ok).toBe(false);
    const badCode = await join(a, { name: 'Hợp Lệ', room: 'AB!' });
    expect(badCode.ok).toBe(false);
  });
});

// Sòng Công Đức qua phòng thật: đặt cược = ctx.wager, gỡ / hoàn cược = reward raw + noPool + silent (đúng như StakeBook).
describe('Sòng Công Đức — cược Công Đức thật qua PartyRoom', () => {
  it('đặt cược tụt cấp: toast + tin chat (chat ≤ 1 lần/60 s mỗi người); gỡ cược chỉ phục hồi cấp — không báo thăng cấp, giữ áo', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Sư Cả', create: true });
    const b = await connect(env);
    const rb = await joinOk(b, { name: 'Con Bạc', room: ra.room.code });
    const room = roomOf(ra.room.code);
    const pid = rb.you.pid;
    const promoted = waitFor(b, 'self', (s) => s.rank === 'hoa_thuong_tap_su');
    room.reward(pid, RANK_THRESHOLDS.hoa_thuong_tap_su + 4, { raw: true }); // 105: thăng cấp thật (vượt đỉnh cũ)
    await promoted;
    expect(room.setOutfit(pid, { robe: 'robe_nau_rach' })).toBe(true); // tự chọn lại áo nâu
    await sleep(80);

    const chats: string[] = [];
    const fx: FxMsg[] = [];
    const toasts: string[] = [];
    const selfs: Partial<SelfState>[] = [];
    a.on('chat', (m) => chats.push(m.text));
    a.on('fx', (m) => fx.push(m));
    b.on('fx', (m) => fx.push(m));
    b.on('toast', (t) => toasts.push(t.text));
    b.on('self', (s) => selfs.push(s));
    const bet = () => expect(room.wager(pid, 10)).toBe(true);
    const unbet = () => room.reward(pid, 10, { raw: true, noPool: true, silent: true, label: 'Tài Xỉu' });

    bet(); // 95 → Tiểu Đồng
    await waitFor(a, 'chat', (m) => /Con Bạc tụt xuống Tiểu Đồng/.test(m.text));
    unbet(); // 105 → phục hồi Hòa Thượng Tập Sự
    await waitFor(b, 'self', (s) => s.rank === 'hoa_thuong_tap_su');
    bet();
    await waitFor(b, 'toast', (t) => /Tụt xuống Tiểu Đồng/.test(t.text));
    unbet();
    await waitFor(b, 'self', (s) => s.rank === 'hoa_thuong_tap_su');
    await sleep(100);

    expect(toasts.filter((t) => /Tụt xuống Tiểu Đồng/.test(t))).toHaveLength(2);
    expect(chats.filter((t) => /tụt xuống/.test(t))).toHaveLength(1);
    expect(chats.some((t) => /thăng cấp/.test(t))).toBe(false);
    expect(fx.some((m) => m.type === 'rankup')).toBe(false);
    expect(fx.some((m) => m.type === 'banner' && /Thăng cấp/.test(m.title))).toBe(false);
    expect(selfs.some((s) => s.outfit !== undefined)).toBe(false);
    const prof = room.players.get(pid)!.profile;
    expect([prof.congDuc, prof.outfit.robe]).toEqual([105, 'robe_nau_rach']);
  });

  it('Phương Trượng đặt cược tụt dưới người kế thì mất ghế; cùng cặp đổi qua lại trong 30 s thì ghế vẫn đổi mà không báo lại', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Trụ Trì', create: true });
    const b = await connect(env);
    const rb = await joinOk(b, { name: 'Phó Trì', room: ra.room.code });
    const room = roomOf(ra.room.code);
    const [hostA, nextB] = [ra.you.pid, rb.you.pid];
    room.reward(hostA, 600, { raw: true });
    room.reward(nextB, 590, { raw: true });
    expect(room.hostPid).toBe(hostA);
    await waitFor(b, 'self', (s) => s.congDuc === 590);
    await sleep(80);

    const hosts: (string | null)[] = [];
    const announced: string[] = [];
    let bells = 0;
    b.on('room', (r) => {
      if ('hostPid' in r) hosts.push(r.hostPid ?? null);
    });
    b.on('fx', (m) => {
      if (m.type === 'banner' && /trở thành/.test(m.title)) announced.push(m.title);
      if (m.type === 'sound' && m.id === 'bell_big') bells++;
    });
    b.on('chat', (m) => {
      if (m.text.startsWith('👑')) announced.push(m.text);
    });
    for (let i = 0; i < 3; i++) {
      expect(room.wager(hostA, 50)).toBe(true); // 550 < 590 → Phó Trì lên ghế
      expect(room.hostPid).toBe(nextB);
      room.reward(hostA, 50, { raw: true, noPool: true, silent: true }); // gỡ cược → 600 → lấy lại ghế
      expect(room.hostPid).toBe(hostA);
    }
    await sleep(150);
    expect(hosts).toEqual([nextB, hostA, nextB, hostA, nextB, hostA]);
    expect(announced).toEqual([`Phó Trì trở thành ${HOST_TITLE}!`, `👑 Phó Trì trở thành ${HOST_TITLE}.`]);
    expect(bells).toBe(1);
  });

  it('Hạ Sơn không trao danh hiệu DJ cho Phương Trượng: không chiếm được bàn DJ người khác đang đứng; người thắng vòng nhảy giữ danh hiệu', async () => {
    env = await createTestEnv();
    const a = await connect(env);
    const ra = await joinOk(a, { name: 'Trụ Trì', create: true });
    const b = await connect(env);
    const rb = await joinOk(b, { name: 'Dân Chơi', room: ra.room.code });
    const room = roomOf(ra.room.code);
    expect(room.hostPid).toBe(ra.you.pid);
    // Đổi map ngay (bỏ qua 5 giây đếm ngược của requestMapChange): vòng tick kế thực hiện performMapChange.
    const toBar = waitFor(a, 'room', (r) => r.map === 'bar');
    room.mapChange = { to: 'bar', at: Date.now() };
    const [r1] = await toBar;
    expect(r1.djPid).toBeNull();

    const booth = findStation('dj_booth')!.station;
    for (const pid of [ra.you.pid, rb.you.pid]) Object.assign(room.players.get(pid)!, { x: booth.x, z: booth.z });
    const opened = waitFor(b, 'actOpen', (id) => id === 'dj');
    b.emit('interact', 'dj_booth');
    await opened;
    const closed: string[] = [];
    b.on('actClose', (id, reason) => closed.push(`${id}:${reason}`));
    const told = waitFor(a, 'toast', (t) => /Dân Chơi đang chỉnh nhạc/.test(t.text));
    a.emit('interact', 'dj_booth');
    await told;
    await sleep(80);
    expect(closed).toEqual([]);
    expect(room.players.get(rb.you.pid)!.activity).toBe('dj');
    expect(room.players.get(ra.you.pid)!.activity).toBeNull();

    // Người thắng vòng nhảy (setDj) vẫn giữ danh hiệu qua Hồi Sơn → Hạ Sơn.
    room.setDj(rb.you.pid);
    const toTemple = waitFor(a, 'room', (r) => r.map === 'temple');
    room.mapChange = { to: 'temple', at: Date.now() };
    await toTemple;
    const back = waitFor(a, 'room', (r) => r.map === 'bar');
    room.mapChange = { to: 'bar', at: Date.now() };
    const [r2] = await back;
    expect(r2.djPid).toBe(rb.you.pid);
  });
});
