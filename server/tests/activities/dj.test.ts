// Bàn DJ mở (Quán Bar mở rộng mục 4): tự phát danh sách thu sẵn, đứng bàn / chiếm lại / rời bàn, lệnh chỉ của người
// đứng bàn, nghỉ hiệu ứng, chặn đổi bài khi có vòng nhảy, phát lại đúng phách, mốc nhịp dùng chung cho Thi nhảy.
import { describe, expect, it } from 'vitest';
import { DJ } from '@shared/index';
import { DJ_RECORDED, DJ_TRACKS, beatMs, trackInfo, type DjPublicState } from '@shared/activities/dj';
import { djModule } from '../../src/activities/dj';
import { FakeActivityContext, mountActivity } from '../helpers/fakeContext';

type Ctx = FakeActivityContext;
const st = (ctx: Ctx) => ctx.lastState<DjPublicState>();

/** Phòng ở Bar, DJ tự phát; a + b + c đứng sát bàn DJ. */
function bar() {
  const { ctx, instance } = mountActivity(djModule);
  for (const pid of ['a', 'b', 'c']) {
    ctx.addPlayer({ pid, name: pid.toUpperCase() });
    ctx.placeAt(pid, 'dj_booth');
  }
  const booth = ctx.station('dj_booth');
  const press = (pid: string) => instance.onInteract!(ctx.view(pid), booth);
  const act = (pid: string, type: string, data?: unknown) => instance.onAction!(ctx.view(pid), type, data);
  /** Nhảy tới giờ t rồi chạy 1 tick. */
  const jump = (t: number) => {
    ctx.time = Math.max(ctx.time, t);
    instance.tick!(50, ctx.time);
  };
  return { ctx, instance, press, act, jump };
}

describe('DJ — danh sách thu sẵn', () => {
  it('vào Bar tự phát bài thu sẵn 1 sau 1 giây, ghi mốc nhịp dùng chung', () => {
    const ctx = new FakeActivityContext('dj');
    ctx.mapId = 'temple';
    const instance = djModule.create(ctx);
    expect(st(ctx).playing).toBe(false);
    ctx.mapId = 'bar';
    instance.onMapChange!('bar');
    const s = st(ctx);
    const first = DJ_RECORDED[0]!;
    expect(s.trackId).toBe(first.id);
    expect(s.playing).toBe(true);
    expect(s.startedAt).toBe(ctx.time + DJ.enterDelayMs);
    expect(s.beat0).toBe(s.startedAt + first.beatOffsetMs);
    expect(ctx.shared.get('dj_bpm')).toBe(first.bpm);
    expect(ctx.shared.get('dj_beat0')).toBe(s.beat0);
    expect(ctx.shared.get('dj_playing')).toBe(1);
  });

  it('hết bài sang bài thu sẵn kế, hết danh sách quay lại bài 1; bài tổng hợp lặp mãi', () => {
    const { ctx, jump, press, act } = bar();
    for (let i = 1; i <= DJ_RECORDED.length; i++) {
      const s = st(ctx);
      jump(s.startedAt + trackInfo(s.trackId).durationMs + 10);
      const next = DJ_RECORDED[i % DJ_RECORDED.length]!;
      expect(st(ctx).trackId).toBe(next.id);
      expect(st(ctx).startedAt).toBeGreaterThanOrEqual(ctx.time);
    }
    press('a');
    act('a', 'track', { id: 'mo_house' });
    const s = st(ctx);
    jump(ctx.time + 3_600_000);
    expect(st(ctx).trackId).toBe('mo_house');
    expect(st(ctx).startedAt).toBe(s.startedAt);
  });

  it('bài ghép nhiều đoạn: qua mốc đổi pha thì beat0 đổi theo đoạn', () => {
    const { ctx, jump, press, act } = bar();
    press('a');
    act('a', 'track', { id: 'chu_dai_bi_remix' });
    const s = st(ctx);
    const g = trackInfo('chu_dai_bi_remix').grid!;
    jump(s.startedAt + g[0]!.atMs + 5);
    expect(st(ctx).beat0).toBe(s.startedAt + g[0]!.beatMs);
    expect(ctx.shared.get('dj_beat0')).toBe(s.startedAt + g[0]!.beatMs);
  });

  it('đang có sảnh/vòng nhảy mà bài thu sẵn hết → phát lại chính bài đó, phách mạnh đầu rơi đúng lưới ô nhịp cũ', () => {
    const { ctx, jump, press, act } = bar();
    press('a');
    act('a', 'track', { id: 'chu_dai_bi_tliem' });
    const t = trackInfo('chu_dai_bi_tliem');
    const s = st(ctx);
    jump(s.startedAt + t.durationMs - 100);
    const oldBeat0 = st(ctx).beat0;
    ctx.shared.set('dance_until', ctx.time + 60_000);
    jump(s.startedAt + t.durationMs + 10);
    const r = st(ctx);
    expect(r.trackId).toBe(t.id);
    expect(r.startedAt).toBeGreaterThan(ctx.time);
    const m = 4 * beatMs(t.bpm);
    const k = (r.startedAt + t.beatOffsetMs - oldBeat0) / m;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    expect(r.beat0).toBe(r.startedAt + t.beatOffsetMs);
  });
});

describe('DJ — đứng bàn', () => {
  it('bàn trống → lên bàn; có người → báo tên; người giữ danh hiệu DJ chiếm lại được', () => {
    const { ctx, press } = bar();
    press('a');
    expect(st(ctx).controllerPid).toBe('a');
    expect(st(ctx).controllerName).toBe('A');
    expect(ctx.opens.at(-1)?.pid).toBe('a');
    press('b');
    expect(st(ctx).controllerPid).toBe('a');
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b' });
    expect(ctx.toasts.at(-1)?.text).toContain('A đang chỉnh nhạc');
    ctx.setDj('c');
    press('c');
    expect(st(ctx).controllerPid).toBe('c');
    expect(ctx.closes.some((c) => c.pid === 'a')).toBe(true);
    expect(ctx.toasts.some((t) => t.target === 'a' && t.text.includes('chiếm lại'))).toBe(true);
  });

  it('Phương Trượng không còn quyền riêng ở bàn DJ', () => {
    const { ctx, press } = bar();
    ctx.playersById.get('b')!.isHost = true;
    press('a');
    press('b');
    expect(st(ctx).controllerPid).toBe('a');
  });

  it('Esc / đóng bảng / mất kết nối / đi xa / đổi map → bàn trống', () => {
    const { ctx, instance, press, act, jump } = bar();
    press('a');
    act('a', 'close');
    expect(st(ctx).controllerPid).toBeNull();
    press('a');
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(st(ctx).controllerPid).toBeNull();
    press('b');
    ctx.playersById.get('b')!.connected = false;
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(st(ctx).controllerPid).toBeNull();
    press('c');
    const booth = ctx.station('dj_booth');
    ctx.playersById.get('c')!.z = booth.z + booth.r + DJ.leaveSlack + 0.5;
    jump(ctx.time + 100);
    expect(st(ctx).controllerPid).toBeNull();
    expect(ctx.closes.at(-1)?.pid).toBe('c');
    ctx.placeAt('c', 'dj_booth');
    press('c');
    ctx.mapId = 'temple';
    instance.onMapChange!('temple');
    expect(st(ctx).controllerPid).toBeNull();
    expect(st(ctx).playing).toBe(false);
    expect(ctx.shared.get('dj_playing')).toBe(0);
  });
});

describe('DJ — lệnh ở bàn', () => {
  it('chỉ người đứng bàn ra lệnh; đổi bài cách nhau ≥ 3 giây; ⏮ ⏭ vòng quanh nhóm', () => {
    const { ctx, press, act } = bar();
    act('b', 'next');
    expect(st(ctx).trackId).toBe(DJ_RECORDED[0]!.id);
    press('a');
    act('a', 'next');
    expect(st(ctx).trackId).toBe(DJ_RECORDED[1]!.id);
    expect(ctx.chats.at(-1)).toContain(DJ_RECORDED[1]!.name);
    act('a', 'next');
    expect(st(ctx).trackId).toBe(DJ_RECORDED[1]!.id);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'prev');
    expect(st(ctx).trackId).toBe(DJ_RECORDED[0]!.id);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'prev');
    expect(st(ctx).trackId).toBe(DJ_RECORDED[DJ_RECORDED.length - 1]!.id);
    ctx.time += DJ.switchCooldownMs;
    act('a', 'track', { id: 'khong_co_bai_nay' });
    expect(st(ctx).trackId).toBe(DJ_RECORDED[DJ_RECORDED.length - 1]!.id);
    act('a', 'track', { id: DJ_TRACKS[5]!.id });
    expect(st(ctx).trackId).toBe(DJ_TRACKS[5]!.id);
    expect(st(ctx).bpm).toBe(DJ_TRACKS[5]!.bpm);
  });

  it('dừng giữ vị trí, phát tiếp đúng chỗ; mốc nhịp dùng chung báo đang dừng', () => {
    const { ctx, press, act, jump } = bar();
    press('a');
    const s = st(ctx);
    jump(s.startedAt + 20_000);
    act('a', 'stop');
    expect(st(ctx).playing).toBe(false);
    expect(st(ctx).pausedAtMs).toBe(20_000);
    expect(ctx.shared.get('dj_playing')).toBe(0);
    ctx.time += DJ.toggleCooldownMs;
    act('a', 'play');
    const r = st(ctx);
    expect(r.playing).toBe(true);
    expect(r.startedAt).toBe(ctx.time + DJ.switchDelayMs - 20_000);
    expect(ctx.shared.get('dj_playing')).toBe(1);
  });

  it('hiệu ứng có thời gian nghỉ; pháo giấy bắn ở tâm sàn nhảy cho cả quán; đổi màu đèn có thời gian nghỉ', () => {
    const { ctx, press, act } = bar();
    press('a');
    act('a', 'drop');
    const d1 = st(ctx).dropAt;
    expect(d1).toBe(ctx.time);
    ctx.time += DJ.dropCooldownMs - 1;
    act('a', 'drop');
    expect(st(ctx).dropAt).toBe(d1);
    ctx.time += 1;
    act('a', 'drop');
    expect(st(ctx).dropAt).toBe(ctx.time);
    act('a', 'horn');
    act('a', 'smoke');
    act('a', 'strobe');
    act('a', 'confetti');
    const s = st(ctx);
    expect([s.hornAt, s.smokeAt, s.strobeAt, s.confettiAt]).toEqual([ctx.time, ctx.time, ctx.time, ctx.time]);
    expect(ctx.fxs.filter((f) => f.msg.type === 'confetti')).toHaveLength(1);
    // Kèm toạ độ tâm sàn nhảy — thiếu thì mỗi máy tự bắn quanh chính người chơi (kể cả người đang trong Sòng).
    const floor = ctx.station('dance_floor');
    expect(ctx.fxs.find((f) => f.msg.type === 'confetti')).toEqual({ msg: { type: 'confetti', x: floor.x, z: floor.z }, to: 'room' });
    ctx.time += DJ.confettiCooldownMs - 1;
    act('a', 'confetti');
    expect(ctx.fxs.filter((f) => f.msg.type === 'confetti')).toHaveLength(1);
    act('a', 'theme', { theme: 'fire' });
    expect(st(ctx).theme).toBe('fire');
    act('a', 'theme', { theme: 'tim_tim' });
    expect(st(ctx).theme).toBe('fire');
    // Đổi màu đèn dồn dập (xen kẽ trong giới hạn gói tin) bị bỏ qua tới hết thời gian nghỉ.
    const states = ctx.states.length;
    ctx.time += DJ.themeCooldownMs - 1;
    act('a', 'theme', { theme: 'gold' });
    expect(st(ctx).theme).toBe('fire');
    expect(ctx.states).toHaveLength(states);
    ctx.time += 1;
    act('a', 'theme', { theme: 'gold' });
    expect(st(ctx).theme).toBe('gold');
  });

  it('đang có sảnh/vòng nhảy: cấm dừng / đổi bài; sảnh mở lúc nhạc dừng → tự phát', () => {
    const { ctx, press, act, jump } = bar();
    press('a');
    act('a', 'stop');
    expect(st(ctx).playing).toBe(false);
    ctx.shared.set('dance_lobby_until', ctx.time + 15_000);
    jump(ctx.time + 50);
    expect(st(ctx).playing).toBe(true);
    ctx.time += DJ.switchCooldownMs;
    for (const cmd of ['stop', 'next', 'prev']) act('a', cmd);
    act('a', 'track', { id: 'mo_house' });
    expect(st(ctx).playing).toBe(true);
    expect(st(ctx).trackId).toBe(DJ_RECORDED[0]!.id);
    expect(ctx.toasts.at(-1)?.text).toContain('vòng nhảy');
  });
});
