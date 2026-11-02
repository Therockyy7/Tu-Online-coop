// Bàn DJ — dán link YouTube (spec 2026-11-02-dj-youtube-led-design.md mục 3 + 5): phát ngay / xếp hàng, link sai, dán
// dồn, trùng, đầy, tra cứu từ chối / không kiểm chứng được, kết quả về muộn, thời lượng do máy khách báo, lỗi trình phát,
// hết video → hàng chờ → bài có sẵn, ⏭ ⏮ chọn bài, ⏸ ▶, Thi nhảy chen ngang rồi phát tiếp, đổi map, không sửa tại chỗ.
import { describe, expect, it } from 'vitest';
import { DJ } from '@shared/index';
import { DJ_RECORDED, nextTrackId, trackInfo, type DjPublicState } from '@shared/activities/dj';
import { YT_LOOKUP_FAIL_TEXT, youtubeErrorText } from '@shared/activities/youtube';
import { createDj, djModule } from '../../src/activities/dj';
import type { YoutubeLookup, YoutubeLookupResult } from '../../src/activities/dj/youtube';
import { mountActivity } from '../helpers/fakeContext';

const ID1 = 'dQw4w9WgXcQ';
const ID2 = 'kJQP7kiw5Fk';
const ID3 = '9bZkp7q19f0';
const url = (id: string, extra = '') => `https://www.youtube.com/watch?v=${id}${extra}`;
/** Id hợp lệ thứ i (11 ký tự) cho các ca cần nhiều video. */
const vid = (i: number) => `vid${String(i).padStart(8, '0')}`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (title: string): YoutubeLookupResult => ({ ok: true, title, author: 'Kênh', verified: true });

/** Tra cứu giả: mặc định trả ngay "Tên <id>"; `setHold(true)` = giữ lại để test kết quả về muộn; `setReply` đổi kết quả. */
function fakeLookup() {
  const calls: string[] = [];
  const pending: { id: string; resolve: (r: YoutubeLookupResult) => void }[] = [];
  let hold = false;
  let reply: (id: string) => YoutubeLookupResult | Promise<YoutubeLookupResult> = (id) => ok(`Tên ${id}`);
  const lookup: YoutubeLookup = (id) => {
    calls.push(id);
    if (hold) return new Promise((resolve) => pending.push({ id, resolve }));
    return Promise.resolve(reply(id));
  };
  return {
    lookup,
    calls,
    pending,
    setHold: (v: boolean) => {
      hold = v;
    },
    setReply: (fn: typeof reply) => {
      reply = fn;
    },
  };
}

/** Phòng ở Bar, DJ tự phát; a + b đứng sát bàn DJ. */
function bar() {
  const f = fakeLookup();
  const { ctx, instance } = mountActivity({ ...djModule, create: (c) => createDj(c, { lookup: f.lookup }) });
  for (const pid of ['a', 'b']) {
    ctx.addPlayer({ pid, name: pid.toUpperCase() });
    ctx.placeAt(pid, 'dj_booth');
  }
  const booth = ctx.station('dj_booth');
  const press = (pid: string) => instance.onInteract!(ctx.view(pid), booth);
  const act = (pid: string, type: string, data?: unknown) => instance.onAction!(ctx.view(pid), type, data);
  const st = () => ctx.lastState<DjPublicState>();
  /** Nhảy tới giờ t (không lùi) rồi chạy 1 tick. */
  const jump = (t: number) => {
    ctx.time = Math.max(ctx.time, t);
    instance.tick!(50, ctx.time);
  };
  /** Dán link rồi chờ kết quả tra cứu; trả giờ áp kết quả; đồng hồ tiến qua thời gian nghỉ giữa 2 lần dán. */
  const paste = async (pid: string, id: string, extra = '') => {
    const at = ctx.time;
    act(pid, 'youtube', { url: url(id, extra) });
    await flush();
    ctx.time += DJ.youtube.pasteCooldownMs;
    return at;
  };
  /** Đưa người chơi ra xa bàn DJ (quá bán kính + leaveSlack). */
  const walkAway = (pid: string) => {
    ctx.playersById.get(pid)!.z = booth.z + booth.r + DJ.leaveSlack + 0.5;
  };
  return { ctx, instance, f, press, act, st, jump, paste, walkAway };
}

describe('YouTube — dán link', () => {
  it('1. bàn DJ tạo ra chưa phát YouTube, hàng chờ trống', () => {
    expect(bar().st()).toMatchObject({ yt: null, ytQueue: [] });
    const { ctx } = mountActivity(djModule);
    expect(ctx.lastState<DjPublicState>()).toMatchObject({ yt: null, ytQueue: [] });
  });

  it('2. đang phát nhạc có sẵn, hàng chờ trống → phát ngay sau startDelayMs, nhịp danh nghĩa', async () => {
    const { ctx, press, st, paste } = bar();
    press('a');
    const track0 = st().trackId;
    const at = await paste('a', ID1);
    const s = st();
    expect(s.yt).toEqual({
      key: expect.any(Number),
      videoId: ID1,
      title: `Tên ${ID1}`,
      author: 'Kênh',
      startMs: 0,
      byPid: 'a',
      byName: 'A',
      durationMs: 0,
      live: false,
    });
    expect(s.playing).toBe(true);
    expect(s.pausedAtMs).toBe(0);
    expect(s.startedAt).toBe(at + DJ.youtube.startDelayMs);
    expect(s.bpm).toBe(DJ.youtube.bpm);
    expect(s.beat0).toBe(s.startedAt);
    // trackId giữ bài có sẵn phát gần nhất (⏭ / ⏮ / hết hàng chờ đi tiếp từ đây).
    expect(s.trackId).toBe(track0);
    expect(ctx.shared.get('dj_bpm')).toBe(DJ.youtube.bpm);
    expect(ctx.shared.get('dj_beat0')).toBe(s.startedAt);
    expect(ctx.shared.get('dj_playing')).toBe(1);
    expect(ctx.chats.at(-1)).toContain('phát YouTube');
    expect(ctx.chats.at(-1)).toContain(`Tên ${ID1}`);
  });

  it('3. link có ?t= → phát từ giây đó', async () => {
    const { press, st, paste } = bar();
    press('a');
    const at = await paste('a', ID1, '&t=90');
    expect(st().yt?.startMs).toBe(90_000);
    expect(st().startedAt).toBe(at + DJ.youtube.startDelayMs - 90_000);
    expect(st().beat0).toBe(st().startedAt);
  });

  it('4. đang phát YouTube → dán thêm thì xếp cuối hàng chờ (khóa tăng dần)', async () => {
    const { ctx, press, st, paste } = bar();
    press('a');
    await paste('a', ID1);
    await paste('a', ID2);
    expect(ctx.chats.at(-1)).toContain('thêm vào hàng chờ (#1)');
    await paste('a', ID3);
    expect(ctx.chats.at(-1)).toContain('thêm vào hàng chờ (#2)');
    const s = st();
    expect(s.yt?.videoId).toBe(ID1);
    expect(s.ytQueue.map((i) => i.videoId)).toEqual([ID2, ID3]);
    expect(s.ytQueue[0]).toMatchObject({ title: `Tên ${ID2}`, author: 'Kênh', startMs: 0, byPid: 'a', byName: 'A' });
    expect(s.ytQueue[0]!.key).toBeGreaterThan(s.yt!.key);
    expect(s.ytQueue[1]!.key).toBeGreaterThan(s.ytQueue[0]!.key);
  });

  it('5. người không đứng bàn / đứng bàn mà đi xa → không làm gì', async () => {
    const { ctx, f, press, st, paste, walkAway } = bar();
    press('a');
    const n = ctx.states.length;
    await paste('b', ID1);
    walkAway('a');
    await paste('a', ID1);
    expect(ctx.states).toHaveLength(n);
    expect(f.calls).toEqual([]);
    expect(st().yt).toBeNull();
  });

  it('6. link sai → báo tại máy người dán (bad), không tra cứu, trạng thái giữ nguyên', async () => {
    const { ctx, f, press, act } = bar();
    press('a');
    const n = ctx.states.length;
    act('a', 'youtube', { url: 'https://example.com' });
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', tone: 'bad' });
    expect(ctx.toasts.at(-1)?.text).toContain('Link không phải video YouTube');
    for (const bad of [{ url: 42 }, null, { url: '' }, { url: `${url(ID1)}&x=${'a'.repeat(DJ.youtube.urlMax)}` }]) {
      act('a', 'youtube', bad);
    }
    await flush();
    expect(ctx.toasts.filter((t) => t.tone === 'bad')).toHaveLength(5);
    expect(ctx.states).toHaveLength(n);
    expect(f.calls).toEqual([]);
  });

  it('7. dán dồn < 3 giây → lần sau bị chặn, chỉ tra cứu 1 lần', async () => {
    const { ctx, f, press, act, st } = bar();
    press('a');
    act('a', 'youtube', { url: url(ID1) });
    ctx.time += DJ.youtube.pasteCooldownMs - 1;
    act('a', 'youtube', { url: url(ID2) });
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', tone: 'warn' });
    await flush();
    expect(f.calls).toEqual([ID1]);
    expect(st().yt?.videoId).toBe(ID1);
    expect(st().ytQueue).toEqual([]);
    ctx.time += 1;
    act('a', 'youtube', { url: url(ID2) });
    await flush();
    expect(f.calls).toEqual([ID1, ID2]);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID2]);
  });

  it('8. trùng video đang phát / trong hàng chờ → báo, không thêm, không tra cứu', async () => {
    const { ctx, f, press, st, paste } = bar();
    press('a');
    await paste('a', ID1);
    await paste('a', ID2);
    const n = ctx.states.length;
    await paste('a', ID1);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', tone: 'warn' });
    expect(ctx.toasts.at(-1)?.text).toContain('đang phát');
    await paste('a', ID2, '&t=30');
    expect(ctx.toasts.at(-1)?.text).toContain('hàng chờ');
    expect(ctx.states).toHaveLength(n);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID2]);
    expect(f.calls).toEqual([ID1, ID2]);
  });

  it('9. hàng chờ đầy → lần dán sẽ xếp hàng bị chặn; kiểm lại khi kết quả tra cứu về', async () => {
    const { ctx, f, press, st, paste } = bar();
    press('a');
    await paste('a', ID1);
    for (let i = 0; i < DJ.youtube.queueMax; i++) await paste('a', vid(i));
    expect(st().ytQueue).toHaveLength(DJ.youtube.queueMax);
    const calls = f.calls.length;
    await paste('a', vid(99));
    expect(ctx.toasts.at(-1)?.text).toContain('đầy');
    expect(st().ytQueue).toHaveLength(DJ.youtube.queueMax);
    expect(f.calls).toHaveLength(calls);
    // Hàng còn 1 chỗ lúc dán, nhưng trong lúc tra cứu Thi nhảy đẩy video đang phát về đầu hàng → hết chỗ.
    const { ctx: c2, f: f2, press: p2, act: a2, st: s2, jump: j2, paste: v2 } = bar();
    p2('a');
    await v2('a', ID1);
    for (let i = 0; i < DJ.youtube.queueMax - 1; i++) await v2('a', vid(i));
    f2.setHold(true);
    a2('a', 'youtube', { url: url(ID2) });
    c2.shared.set('dance_lobby_until', c2.time + 20_000);
    j2(c2.time);
    expect(s2().ytQueue).toHaveLength(DJ.youtube.queueMax);
    f2.pending[0]!.resolve(ok('muộn'));
    await flush();
    expect(c2.toasts.at(-1)?.text).toContain('đầy');
    expect(s2().ytQueue.some((i) => i.videoId === ID2)).toBe(false);
  });

  it('10. tra cứu từ chối → báo lỗi, không đổi; không kiểm chứng được → vẫn nhận, tên chung; tên dài / ký tự lạ → làm sạch', async () => {
    const { ctx, f, press, st, paste } = bar();
    press('a');
    f.setReply(() => ({ ok: false, reason: 'no_embed' }));
    const n = ctx.states.length;
    await paste('a', ID1);
    expect(ctx.toasts.at(-1)).toEqual({ target: 'a', text: YT_LOOKUP_FAIL_TEXT.no_embed, tone: 'bad' });
    expect(ctx.states).toHaveLength(n);
    expect(st().yt).toBeNull();
    f.setReply(() => ({ ok: true, title: '', author: '', verified: false }));
    await paste('a', ID1);
    expect(st().yt).toMatchObject({ videoId: ID1, title: 'Video YouTube', author: '' });
    f.setReply(() => ({ ok: true, title: `\u0007Bài​ ${'x'.repeat(200)}`, author: `K‮${'k'.repeat(100)}`, verified: true }));
    await paste('a', ID2);
    const q = st().ytQueue[0]!;
    expect([...q.title].length).toBeLessThanOrEqual(DJ.youtube.titleMax);
    expect(q.title.startsWith('Bài x')).toBe(true);
    expect(q.title.endsWith('…')).toBe(true);
    expect(/[\u0000-\u001f​‮]/.test(q.title + q.author)).toBe(false);
    expect([...q.author].length).toBeLessThanOrEqual(DJ.youtube.authorMax);
    expect(ctx.chats.at(-1)).toContain(q.title);
  });
});

describe('YouTube — 11. kết quả tra cứu về muộn', () => {
  it('người dán đã rời bàn (Esc, hoặc đi xa mà tick chưa kịp nhả bàn) → bỏ', async () => {
    const { ctx, f, press, act, st, walkAway } = bar();
    press('a');
    f.setHold(true);
    act('a', 'youtube', { url: url(ID1) });
    act('a', 'close');
    const marks = [ctx.states.length, ctx.chats.length, ctx.toasts.length];
    f.pending[0]!.resolve(ok('muộn'));
    await flush();
    expect([ctx.states.length, ctx.chats.length, ctx.toasts.length]).toEqual(marks);
    expect(st().yt).toBeNull();
    press('a');
    ctx.time += DJ.youtube.pasteCooldownMs;
    act('a', 'youtube', { url: url(ID2) });
    walkAway('a');
    f.pending[1]!.resolve(ok('muộn'));
    await flush();
    expect(st().yt).toBeNull();
    expect(st().ytQueue).toEqual([]);
  });

  it('đã đổi map (kể cả quay lại Bar) → bỏ', async () => {
    const { ctx, instance, f, press, act, st } = bar();
    press('a');
    f.setHold(true);
    act('a', 'youtube', { url: url(ID1) });
    ctx.mapId = 'temple';
    instance.onMapChange!('temple');
    ctx.mapId = 'bar';
    instance.onMapChange!('bar');
    press('a');
    const marks = [ctx.states.length, ctx.chats.length];
    f.pending[0]!.resolve(ok('muộn'));
    await flush();
    expect([ctx.states.length, ctx.chats.length]).toEqual(marks);
    expect(st().yt).toBeNull();
  });

  it('có yêu cầu mới hơn → chỉ yêu cầu mới nhất được áp', async () => {
    const { ctx, f, press, act, st } = bar();
    press('a');
    f.setHold(true);
    act('a', 'youtube', { url: url(ID1) });
    ctx.time += DJ.youtube.pasteCooldownMs;
    act('a', 'youtube', { url: url(ID2) });
    f.pending[1]!.resolve(ok(`Tên ${ID2}`));
    await flush();
    expect(st().yt?.videoId).toBe(ID2);
    const n = ctx.states.length;
    f.pending[0]!.resolve(ok(`Tên ${ID1}`));
    await flush();
    expect(ctx.states).toHaveLength(n);
    expect(st().yt?.videoId).toBe(ID2);
    expect(st().ytQueue).toEqual([]);
  });

  it('module đã dispose → không gửi trạng thái / chat / toast nữa', async () => {
    const { ctx, instance, f, press, act } = bar();
    press('a');
    f.setHold(true);
    act('a', 'youtube', { url: url(ID1) });
    instance.dispose!();
    const marks = [ctx.states.length, ctx.chats.length, ctx.toasts.length];
    f.pending[0]!.resolve(ok('muộn'));
    await flush();
    expect([ctx.states.length, ctx.chats.length, ctx.toasts.length]).toEqual(marks);
  });

  it('tra cứu reject / ném lỗi đồng bộ → vẫn nhận link (tên chung), onAction không ném, không rò rejection', async () => {
    const { f, press, act, st, paste } = bar();
    press('a');
    f.setReply(() => Promise.reject(new Error('mạng hỏng')));
    await paste('a', ID1);
    expect(st().yt).toMatchObject({ videoId: ID1, title: 'Video YouTube' });
    f.setReply(() => {
      throw new Error('lỗi đồng bộ');
    });
    expect(() => act('a', 'youtube', { url: url(ID2) })).not.toThrow();
    await flush();
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID2]);
    expect(st().ytQueue[0]!.title).toBe('Video YouTube');
  });

  it('lỗi khi áp kết quả → ghi log, không rò rejection', async () => {
    const { ctx, press, act } = bar();
    press('a');
    ctx.chatSystem = () => {
      throw new Error('chat hỏng');
    };
    act('a', 'youtube', { url: url(ID1) });
    await flush();
    expect(ctx.logs.length).toBeGreaterThan(0);
  });
});

describe('YouTube — thời lượng, lỗi, chuyển bài', () => {
  it('12. yt_meta: máy nào trong Bar cũng báo được; lần đầu thắng; sai video / ngoài khoảng / sai kiểu → bỏ; livestream', async () => {
    const { ctx, press, act, st, paste, walkAway } = bar();
    press('a');
    act('b', 'yt_meta', { videoId: ID1, durationMs: 200_000 }); // chưa có video nào
    await paste('a', ID1);
    walkAway('b');
    const n = ctx.states.length;
    for (const bad of [
      { videoId: ID2, durationMs: 200_000 },
      { videoId: ID1, durationMs: 500 },
      { videoId: ID1, durationMs: DJ.youtube.maxDurationMs + 1 },
      { videoId: ID1, durationMs: Number.NaN },
      { videoId: ID1, durationMs: Infinity },
      { videoId: ID1, durationMs: '200000' },
      { videoId: ID1 },
      { videoId: ID1, live: false },
      { videoId: 'khong hop le', durationMs: 200_000 },
      null,
    ]) {
      act('b', 'yt_meta', bad);
    }
    expect(ctx.states).toHaveLength(n);
    expect(st().yt?.durationMs).toBe(0);
    act('b', 'yt_meta', { videoId: ID1, durationMs: 200_000.4, live: false });
    expect(st().yt).toMatchObject({ videoId: ID1, durationMs: 200_000, live: false });
    act('a', 'yt_meta', { videoId: ID1, durationMs: 150_000 });
    act('a', 'yt_meta', { videoId: ID1, live: true });
    expect(st().yt).toMatchObject({ durationMs: 200_000, live: false });
    // Livestream (video kế): live thắng, bỏ qua số.
    await paste('a', ID2);
    act('a', 'next');
    expect(st().yt?.videoId).toBe(ID2);
    act('b', 'yt_meta', { videoId: ID2, durationMs: 5000, live: true });
    expect(st().yt).toMatchObject({ videoId: ID2, durationMs: 0, live: true });
  });

  it('12b. video 10 giờ (YouTube cho tải lên tới 12 giờ): nhận thời lượng, qua mốc 30 s vẫn phát, hết mới sang bài', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    await paste('a', ID1);
    const startedAt = st().startedAt;
    act('b', 'yt_meta', { videoId: ID1, durationMs: 10 * 3600_000, live: false });
    expect(st().yt).toMatchObject({ videoId: ID1, durationMs: 10 * 3600_000, live: false });
    jump(startedAt + DJ.youtube.metaTimeoutMs + 1);
    expect(st().yt?.videoId).toBe(ID1);
    expect(ctx.chats.join('\n')).not.toContain('Không tải được');
    jump(startedAt + 10 * 3600_000 + DJ.youtube.endGraceMs - 1);
    expect(st().yt?.videoId).toBe(ID1);
    jump(startedAt + 10 * 3600_000 + DJ.youtube.endGraceMs);
    expect(st().yt).toBeNull();
  });

  it('13. hết video (đã biết thời lượng) → video kế trong hàng chờ → hết hàng thì bài có sẵn kế', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    const track0 = st().trackId;
    await paste('a', ID1);
    await paste('a', ID2);
    act('b', 'yt_meta', { videoId: ID1, durationMs: 60_000 });
    const s1 = st();
    jump(s1.startedAt + 60_000 + DJ.youtube.endGraceMs - 1);
    expect(st().yt?.videoId).toBe(ID1);
    jump(s1.startedAt + 60_000 + DJ.youtube.endGraceMs);
    expect(st().yt?.videoId).toBe(ID2);
    expect(st().startedAt).toBe(ctx.time + DJ.youtube.startDelayMs);
    expect(st().ytQueue).toEqual([]);
    expect(ctx.chats.at(-1)).toContain('Tiếp theo');
    expect(ctx.chats.at(-1)).toContain(`Tên ${ID2}`);
    act('b', 'yt_meta', { videoId: ID2, durationMs: 30_000 });
    jump(st().startedAt + 30_000 + DJ.youtube.endGraceMs);
    expect(st().yt).toBeNull();
    expect(st().trackId).toBe(nextTrackId(track0, 1));
    expect(st().playing).toBe(true);
    expect(st().startedAt).toBe(ctx.time + DJ.switchDelayMs);
    expect(st().bpm).toBe(trackInfo(nextTrackId(track0, 1)).bpm);
  });

  it('14. quá hạn chưa ai báo thời lượng → chuyển bài; livestream không tự chuyển; đang dừng không tính giờ', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    const at = await paste('a', ID1);
    const deadline = at + DJ.youtube.startDelayMs + DJ.youtube.metaTimeoutMs;
    jump(deadline - 1);
    expect(st().yt?.videoId).toBe(ID1);
    jump(deadline);
    expect(st().yt).toBeNull();
    expect(st().playing).toBe(true);
    expect(ctx.chats.at(-1)).toContain('Không tải được');
    expect(ctx.chats.at(-1)).toContain(`Tên ${ID1}`);
    // Livestream: không bao giờ tự hết.
    await paste('a', ID2);
    act('b', 'yt_meta', { videoId: ID2, live: true });
    jump(ctx.time + 6 * 3600_000);
    expect(st().yt).toMatchObject({ videoId: ID2, live: true });
    // Đang dừng: không tính giờ quá hạn; phát tiếp thì đếm lại từ lúc phát.
    ctx.time += DJ.switchCooldownMs;
    act('a', 'next');
    await paste('a', ID3);
    act('a', 'stop');
    expect(st().playing).toBe(false);
    jump(ctx.time + 10 * DJ.youtube.metaTimeoutMs);
    expect(st().yt?.videoId).toBe(ID3);
    act('a', 'play');
    const resumed = ctx.time + DJ.switchDelayMs + DJ.youtube.metaTimeoutMs;
    jump(resumed - 1);
    expect(st().yt?.videoId).toBe(ID3);
    jump(resumed);
    expect(st().yt).toBeNull();
  });

  it('15. yt_error: lỗi chết từ máy người dán / người đứng bàn → chuyển bài; máy khác, mã 5, sai video → bỏ', async () => {
    const { ctx, press, act, st, paste } = bar();
    press('a');
    await paste('a', ID1);
    const n = ctx.states.length;
    act('b', 'yt_error', { videoId: ID1, code: 150 }); // không dán, không đứng bàn
    act('a', 'yt_error', { videoId: ID1, code: 5 }); // lỗi chỉ tại máy
    act('a', 'yt_error', { videoId: ID2, code: 150 }); // sai video
    act('a', 'yt_error', { videoId: ID1, code: '150' }); // sai kiểu
    expect(ctx.states).toHaveLength(n);
    expect(st().yt?.videoId).toBe(ID1);
    act('a', 'yt_error', { videoId: ID1, code: 150 });
    expect(st().yt).toBeNull();
    expect(ctx.chats.at(-1)).toContain(youtubeErrorText(150));
    expect(ctx.chats.at(-1)).toContain(`Tên ${ID1}`);
    // Người đứng bàn (không phải người dán) báo → cũng chuyển.
    await paste('a', ID2);
    act('a', 'close');
    press('b');
    act('b', 'yt_error', { videoId: ID2, code: 101 });
    expect(st().yt).toBeNull();
    // Người dán đã rời bàn vẫn là "máy người dán".
    await paste('b', ID3);
    act('b', 'close');
    press('a');
    act('b', 'yt_error', { videoId: ID3, code: 100 });
    expect(st().yt).toBeNull();
    expect(ctx.chats.at(-1)).toContain(youtubeErrorText(100));
  });

  it('16. ⏭ ưu tiên hàng chờ; ⏮ khi YouTube → bài có sẵn vừa phát từ đầu; chọn bài có sẵn → rời YouTube; hàng chờ giữ nguyên', async () => {
    const { ctx, press, act, st, paste } = bar();
    press('a');
    const track0 = st().trackId;
    await paste('a', ID1);
    await paste('a', ID2);
    await paste('a', ID3);
    act('a', 'next');
    expect(st().yt?.videoId).toBe(ID2);
    expect(st().startedAt).toBe(ctx.time + DJ.youtube.startDelayMs);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID3]);
    expect(ctx.chats.at(-1)).toContain('⏭');
    expect(ctx.chats.at(-1)).toContain(`Tên ${ID2}`);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'prev');
    expect(st().yt).toBeNull();
    expect(st().trackId).toBe(track0);
    expect(st().startedAt).toBe(ctx.time + DJ.switchDelayMs);
    expect(st().bpm).toBe(trackInfo(track0).bpm);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID3]);
    // Đang bài có sẵn mà hàng chờ còn video → ⏭ phát video đầu hàng.
    ctx.time += DJ.switchCooldownMs;
    act('a', 'next');
    expect(st().yt?.videoId).toBe(ID3);
    expect(st().ytQueue).toEqual([]);
    // Hàng chờ trống → ⏭ sang bài có sẵn kế sau trackId.
    ctx.time += DJ.switchCooldownMs;
    act('a', 'next');
    expect(st().yt).toBeNull();
    expect(st().trackId).toBe(nextTrackId(track0, 1));
    // Chọn đúng bài có sẵn vừa phát khi đang YouTube → vẫn rời YouTube.
    await paste('a', ID1);
    await paste('a', ID2);
    act('a', 'track', { id: st().trackId });
    expect(st().yt).toBeNull();
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID2]);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'yt_play', { key: st().ytQueue[0]!.key });
    ctx.time += DJ.switchCooldownMs;
    await paste('a', ID3);
    act('a', 'track', { id: 'mo_house' });
    expect(st().yt).toBeNull();
    expect(st().trackId).toBe('mo_house');
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID3]);
  });

  it('17. yt_play phát ngay 1 video trong hàng chờ; yt_remove xoá; khóa lạ / người không đứng bàn → bỏ', async () => {
    const { ctx, press, act, st, paste } = bar();
    press('a');
    await paste('a', ID1);
    await paste('a', ID2);
    await paste('a', ID3);
    const [k2, k3] = st().ytQueue.map((i) => i.key) as [number, number];
    const n = ctx.states.length;
    act('a', 'yt_play', { key: 9999 });
    act('a', 'yt_remove', { key: 9999 });
    act('a', 'yt_play', { key: 'x' });
    act('a', 'yt_remove', null);
    act('b', 'yt_play', { key: k3 });
    act('b', 'yt_remove', { key: k2 });
    expect(ctx.states).toHaveLength(n);
    act('a', 'yt_play', { key: k3 });
    expect(st().yt).toMatchObject({ videoId: ID3, key: k3, durationMs: 0, live: false });
    expect(st().startedAt).toBe(ctx.time + DJ.youtube.startDelayMs);
    expect(st().ytQueue.map((i) => i.key)).toEqual([k2]);
    // Phát ngay tính như đổi bài (nghỉ switchCooldownMs).
    act('a', 'yt_play', { key: k2 });
    expect(st().yt?.key).toBe(k3);
    act('a', 'yt_remove', { key: k2 });
    expect(st().ytQueue).toEqual([]);
    expect(st().yt?.videoId).toBe(ID3);
  });

  it('18. ⏸ / ▶ dừng / phát tiếp video; livestream phát tiếp từ chỗ trực tiếp', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    await paste('a', ID1);
    jump(st().startedAt + 20_000);
    act('a', 'stop');
    expect(st()).toMatchObject({ playing: false, pausedAtMs: 20_000 });
    expect(st().yt?.videoId).toBe(ID1);
    expect(ctx.shared.get('dj_playing')).toBe(0);
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'play');
    const s = st();
    expect(s.playing).toBe(true);
    expect(s.startedAt).toBe(ctx.time + DJ.switchDelayMs - 20_000);
    expect(s.beat0).toBe(s.startedAt);
    expect(s.bpm).toBe(DJ.youtube.bpm);
    expect(s.yt?.videoId).toBe(ID1);
    expect(ctx.shared.get('dj_playing')).toBe(1);
    // Livestream.
    await paste('a', ID2);
    act('a', 'next');
    act('b', 'yt_meta', { videoId: ID2, live: true });
    jump(st().startedAt + 50_000);
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'stop');
    expect(st()).toMatchObject({ playing: false, pausedAtMs: 0 });
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'play');
    expect(st().startedAt).toBe(ctx.time + DJ.switchDelayMs);
    expect(st().yt).toMatchObject({ videoId: ID2, live: true });
    // Dừng trước giờ bắt đầu (link có ?t=) → phát tiếp vẫn từ giây đó.
    await paste('a', ID3, '&t=90');
    ctx.time += DJ.switchCooldownMs;
    act('a', 'next');
    expect(st().yt?.videoId).toBe(ID3);
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'stop');
    expect(st().pausedAtMs).toBe(90_000);
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'play');
    expect(st().startedAt).toBe(ctx.time + DJ.switchDelayMs - 90_000);
    // Lúc dừng chưa biết là livestream (máy khách báo muộn trong lúc dừng) → vẫn phát tiếp từ chỗ trực tiếp.
    await paste('a', vid(1));
    ctx.time += DJ.switchCooldownMs;
    act('a', 'next');
    jump(st().startedAt + 8000);
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'stop');
    expect(st().pausedAtMs).toBeGreaterThan(0);
    act('b', 'yt_meta', { videoId: vid(1), live: true });
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'play');
    expect(st().startedAt).toBe(ctx.time + DJ.switchDelayMs);
  });

  it('19. bài thu sẵn hết khi hàng chờ có video → phát video đầu hàng; trống → bài thu sẵn kế như cũ', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    await paste('a', ID1);
    await paste('a', ID2);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'prev'); // về bài có sẵn, hàng chờ còn ID2
    const s = st();
    expect(trackInfo(s.trackId).kind).toBe('recorded');
    jump(s.startedAt + trackInfo(s.trackId).durationMs - 1);
    expect(st().yt).toBeNull();
    jump(s.startedAt + trackInfo(s.trackId).durationMs);
    expect(st().yt?.videoId).toBe(ID2);
    expect(st().ytQueue).toEqual([]);
    expect(ctx.chats.at(-1)).toContain('Tiếp theo');
    act('b', 'yt_meta', { videoId: ID2, durationMs: 10_000 });
    jump(st().startedAt + 10_000 + DJ.youtube.endGraceMs);
    const t = st();
    expect(t.yt).toBeNull();
    expect(t.trackId).toBe(nextTrackId(s.trackId, 1));
    jump(t.startedAt + trackInfo(t.trackId).durationMs);
    expect(st().trackId).toBe(nextTrackId(t.trackId, 1));
    expect(st().yt).toBeNull();
  });
});

describe('YouTube — Thi nhảy, đổi map, không sửa tại chỗ', () => {
  it('20. Thi nhảy chen ngang: video về đầu hàng đúng chỗ đang dở → nhạc thu sẵn kế; trong vòng chỉ dán / xoá; hết vòng phát tiếp', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    const track0 = st().trackId;
    await paste('a', ID1);
    act('b', 'yt_meta', { videoId: ID1, durationMs: 200_000 });
    const key1 = st().yt!.key;
    jump(st().startedAt + 30_000);
    const lobbyUntil = ctx.time + 20_000;
    ctx.shared.set('dance_lobby_until', lobbyUntil);
    jump(ctx.time);
    const s = st();
    expect(s.yt).toBeNull();
    expect(s.trackId).toBe(nextTrackId(track0, 1));
    expect(s.playing).toBe(true);
    expect(s.startedAt).toBe(ctx.time + DJ.switchDelayMs);
    expect(ctx.shared.get('dj_bpm')).toBe(trackInfo(s.trackId).bpm);
    expect(s.ytQueue).toHaveLength(1);
    expect(s.ytQueue[0]).toMatchObject({ videoId: ID1, title: `Tên ${ID1}`, byPid: 'a' });
    // Khóa mới: máy khách coi lượt phát tiếp là nguồn mới (nạp lại video), không lẫn với lượt đã dừng.
    expect(s.ytQueue[0]!.key).toBeGreaterThan(key1);
    expect(Math.abs(s.ytQueue[0]!.startMs - 30_000)).toBeLessThanOrEqual(100);
    expect(ctx.chats.at(-1)).toContain('Thi nhảy');
    // Trong vòng nhảy: dán → vào hàng (sau video đang dở); phát ngay / ⏭ ⏮ / chọn bài / dừng bị chặn.
    await paste('a', ID2);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID1, ID2]);
    const before = st();
    const blocked: [string, unknown][] = [
      ['yt_play', { key: before.ytQueue[1]!.key }],
      ['next', undefined],
      ['prev', undefined],
      ['track', { id: 'mo_house' }],
      ['stop', undefined],
    ];
    for (const [type, data] of blocked) {
      const t = ctx.toasts.length;
      act('a', type, data);
      expect(ctx.toasts).toHaveLength(t + 1);
      expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', tone: 'warn' });
    }
    expect(st()).toMatchObject({ yt: null, trackId: before.trackId, startedAt: before.startedAt, playing: true });
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID1, ID2]);
    // Hết vòng → phát tiếp video đúng đoạn đang dở (thời lượng đã biết giữ nguyên).
    jump(lobbyUntil + 1000);
    const r = st();
    expect(r.yt).toMatchObject({ videoId: ID1, durationMs: 200_000, live: false });
    expect(r.yt!.startMs).toBe(s.ytQueue[0]!.startMs);
    expect(r.startedAt).toBe(ctx.time + DJ.youtube.startDelayMs - s.ytQueue[0]!.startMs);
    expect(r.bpm).toBe(DJ.youtube.bpm);
    expect(r.ytQueue.map((i) => i.videoId)).toEqual([ID2]);
    expect(ctx.chats.at(-1)).toContain('Nhảy xong');
  });

  it('20b. hết sảnh nhưng vòng nhảy vừa bắt đầu (lệch vài ms) → chưa phát tiếp video', async () => {
    const { ctx, press, st, jump, paste } = bar();
    press('a');
    await paste('a', ID1);
    jump(st().startedAt + 10_000);
    const lobbyUntil = ctx.time + 15_000;
    ctx.shared.set('dance_lobby_until', lobbyUntil);
    jump(ctx.time);
    expect(st().yt).toBeNull();
    // Tick chạy ngay lúc hết sảnh, trước khi hẹn giờ bắt đầu vòng của Thi nhảy kịp đặt dance_until.
    jump(lobbyUntil);
    expect(st().yt).toBeNull();
    const roundUntil = lobbyUntil + 60_000;
    ctx.shared.set('dance_until', roundUntil);
    jump(lobbyUntil + 5);
    jump(roundUntil - 1);
    expect(st().yt).toBeNull();
    jump(roundUntil + 1000);
    expect(st().yt?.videoId).toBe(ID1);
  });

  it('20c. vừa hết vòng mà DJ tự bấm ⏭ → không tự phát tiếp thêm lần nữa (không nhảy cóc hàng chờ)', async () => {
    const { ctx, press, act, st, jump, paste } = bar();
    press('a');
    await paste('a', ID1);
    await paste('a', ID2);
    const until = ctx.time + 20_000;
    ctx.shared.set('dance_until', until);
    jump(ctx.time);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID1, ID2]);
    jump(until);
    act('a', 'next');
    expect(st().yt?.videoId).toBe(ID1);
    jump(until + 2000);
    expect(st().yt?.videoId).toBe(ID1);
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID2]);
  });

  it('21. đang nhạc có sẵn + có vòng nhảy + hàng chờ trống: dán → xếp hàng, báo "khi hết vòng"; hết vòng → phát', async () => {
    const { ctx, press, st, jump, paste } = bar();
    press('a');
    const until = ctx.time + 20_000;
    ctx.shared.set('dance_until', until);
    jump(ctx.time);
    await paste('a', ID1);
    expect(st().yt).toBeNull();
    expect(st().ytQueue.map((i) => i.videoId)).toEqual([ID1]);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a' });
    expect(ctx.toasts.at(-1)?.text).toContain('khi hết vòng');
    expect(ctx.chats.at(-1)).toContain('hàng chờ (#1)');
    jump(until + 1000);
    expect(st().yt?.videoId).toBe(ID1);
    expect(st().ytQueue).toEqual([]);
    expect(st().startedAt).toBe(ctx.time + DJ.youtube.startDelayMs);
  });

  it('22. đổi map → xoá video đang phát + hàng chờ; quay lại Bar phát bài thu sẵn đầu như cũ', async () => {
    const { ctx, instance, press, st, paste } = bar();
    press('a');
    await paste('a', ID1);
    await paste('a', ID2);
    ctx.mapId = 'temple';
    instance.onMapChange!('temple');
    expect(st()).toMatchObject({ yt: null, ytQueue: [], playing: false });
    ctx.mapId = 'bar';
    instance.onMapChange!('bar');
    const first = DJ_RECORDED[0]!;
    expect(st()).toMatchObject({ yt: null, ytQueue: [], trackId: first.id, bpm: first.bpm, playing: true });
    expect(st().startedAt).toBe(ctx.time + DJ.enterDelayMs);
  });

  it('23. mọi lần đổi yt / ytQueue thay object / mảng mới — trạng thái đã gửi không bị sửa theo', async () => {
    const { ctx, instance, press, act, st, jump, paste } = bar();
    const published: { raw: DjPublicState; snap: DjPublicState }[] = [];
    const send = ctx.setState.bind(ctx);
    ctx.setState = (s: unknown) => {
      published.push({ raw: s as DjPublicState, snap: structuredClone(s) as DjPublicState });
      send(s);
    };
    const raw = () => published.at(-1)!.raw;
    press('a');
    await paste('a', ID1);
    const y1 = raw().yt;
    const q1 = raw().ytQueue;
    act('b', 'yt_meta', { videoId: ID1, durationMs: 100_000 });
    expect(raw().yt).not.toBe(y1);
    await paste('a', ID2);
    expect(raw().ytQueue).not.toBe(q1);
    await paste('a', ID3);
    const q3 = raw().ytQueue;
    act('a', 'yt_remove', { key: q3[1]!.key });
    expect(raw().ytQueue).not.toBe(q3);
    await paste('a', vid(1));
    await paste('a', vid(2));
    const q5 = raw().ytQueue;
    act('a', 'yt_play', { key: q5[1]!.key });
    expect(raw().ytQueue).not.toBe(q5);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'next');
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'stop');
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'play');
    const q6 = raw().ytQueue;
    ctx.shared.set('dance_lobby_until', ctx.time + 10_000);
    jump(ctx.time);
    expect(raw().ytQueue).not.toBe(q6);
    jump(ctx.time + 12_000);
    act('a', 'yt_error', { videoId: st().yt!.videoId, code: 150 });
    ctx.mapId = 'temple';
    instance.onMapChange!('temple');
    expect(raw()).toMatchObject({ yt: null, ytQueue: [] });
    for (const p of published) expect(p.raw).toEqual(p.snap);
    expect(published.length).toBeGreaterThan(10);
  });
});
