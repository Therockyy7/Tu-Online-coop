// Kiểm thử hồi quy cho các bug đã xác nhận ở đợt săn bug (2026-10-30).
import { describe, expect, it } from 'vitest';
import { BAUCUA, BELL, COOK, DJ, GUEST, MIXOLOGY, RESTOCK, WATER } from '@shared/index';
import type { BauCuaState } from '@shared/activities/bar';
import type { BellPublicState } from '@shared/activities/coop';
import type { CookPublicState } from '@shared/activities/cook';
import type { GuestPublicState } from '@shared/activities/temple';
import { bauCuaModule } from '../../src/activities/barUtils';
import { cookModule } from '../../src/activities/cook';
import { bellModule } from '../../src/activities/coop';
import { djModule } from '../../src/activities/dj';
import { mixologyModule } from '../../src/activities/mixology';
import { guestModule, restockModule, waterModule } from '../../src/activities/templePersonal';
import { mountActivity } from '../helpers/fakeContext';

describe('Xách nước', () => {
  it('kéo đủ nhưng nhanh hơn mức tối thiểu vẫn được xô nước, đúng lúc crankMinMs', () => {
    const { ctx, instance } = mountActivity(waterModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'well'));
    ctx.advance(300, instance);
    instance.onAction!(ctx.view('a'), 'crank', { presses: WATER.crankPresses });
    expect(ctx.playersById.get('a')!.held).toBeNull();
    // Gửi lại lần nữa trong lúc chờ không làm gì thêm.
    instance.onAction!(ctx.view('a'), 'crank', { presses: WATER.crankPresses });
    ctx.advance(WATER.crankMinMs, instance);
    expect(ctx.playersById.get('a')!.held).toEqual({ kind: 'water_bucket' });
    expect(ctx.closes).toContainEqual({ pid: 'a', reason: 'done' });
  });

  it('kéo chưa đủ số lần thì báo tuột gàu', () => {
    const { ctx, instance } = mountActivity(waterModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'well'));
    ctx.advance(WATER.crankMinMs + 100, instance);
    instance.onAction!(ctx.view('a'), 'crank', { presses: 3 });
    expect(ctx.playersById.get('a')!.held).toBeNull();
    expect(ctx.toasts.at(-1)?.text).toContain('tuột');
  });
});

describe('Khách vãng lai', () => {
  it('khách chờ quá lâu bỏ về rồi biến mất, không dồn đống ở cổng', () => {
    const { ctx, instance } = mountActivity(guestModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.advance(GUEST.spawnEveryMs, instance);
    expect(ctx.lastState<GuestPublicState>().guests).toHaveLength(1);
    // Không ai đón: hết thời gian chờ + đi về cổng.
    ctx.advance(GUEST.waitMs + 40_000, instance);
    const st = ctx.lastState<GuestPublicState>();
    const leaving = st.guests.filter((g) => g.state === 'leaving');
    expect(leaving.length).toBeLessThanOrEqual(1);
    // Sau 10 phút không có ai đón, số khách luôn bị chặn (không tăng vô hạn).
    ctx.advance(10 * 60_000, instance);
    expect(ctx.lastState<GuestPublicState>().guests.length).toBeLessThanOrEqual(GUEST.maxWaiting + 2);
  });

  it('khách được dẫn tới bậc Chánh Điện, vái xong thì đi ra cổng và biến mất', () => {
    const { ctx, instance } = mountActivity(guestModule);
    ctx.addPlayer({ pid: 'tk', congDuc: 600 });
    ctx.advance(GUEST.spawnEveryMs, instance);
    const g = ctx.lastState<GuestPublicState>().guests[0]!;
    ctx.playersById.get('tk')!.x = g.x;
    ctx.playersById.get('tk')!.z = g.z - 1;
    instance.onAction!(ctx.view('tk'), 'lead', { id: g.id });
    // Người dẫn đi bộ vòng qua bên phải đàn tràng tới bậc Chánh Điện (4 m/s), khách đi theo vết chân.
    const tk = ctx.playersById.get('tk')!;
    const steps = ctx.station('temple_steps');
    for (const [wx, wz] of [
      [5.5, 20],
      [5.5, -17],
      [steps.x, steps.z],
    ] as const) {
      while (Math.hypot(wx - tk.x, wz - tk.z) > 0.05) {
        const d = Math.hypot(wx - tk.x, wz - tk.z);
        const k = Math.min(1, 0.4 / d);
        tk.x += (wx - tk.x) * k;
        tk.z += (wz - tk.z) * k;
        ctx.advance(100, instance);
      }
    }
    ctx.advance(8000, instance);
    expect(ctx.rewards.some((r) => r.pid === 'tk' && r.opts?.label === 'Đón khách')).toBe(true);
    ctx.advance(40_000, instance);
    expect(ctx.lastState<GuestPublicState>().guests.find((x) => x.id === g.id)).toBeUndefined();
  });
});

describe('Nhập kho', () => {
  it('kho đầy thì không thưởng, vẫn giữ bao trên tay', () => {
    const { ctx, instance } = mountActivity(restockModule);
    ctx.shared.set('rice_stock', COOK.stockMax);
    ctx.addPlayer({ pid: 'tk', congDuc: 600, held: { kind: 'supply', variant: 'rice_sack' } });
    instance.onInteract!(ctx.view('tk'), ctx.placeAt('tk', 'storage'));
    expect(ctx.rewards).toHaveLength(0);
    expect(ctx.playersById.get('tk')!.held).toEqual({ kind: 'supply', variant: 'rice_sack' });
    ctx.shared.set('rice_stock', 3);
    instance.onInteract!(ctx.view('tk'), ctx.station('storage'));
    expect(ctx.rewards.at(-1)!.base).toBe(RESTOCK.reward);
    expect(ctx.shared.get('rice_stock')).toBe(3 + RESTOCK.amount);
  });
});

describe('Thỉnh chuông', () => {
  function threePullers() {
    const { ctx, instance } = mountActivity(bellModule);
    for (const pid of ['a', 'b', 'c', 'watcher']) ctx.addPlayer({ pid });
    ['a', 'b', 'c'].forEach((pid, i) => instance.onInteract!(ctx.view(pid), ctx.placeAt(pid, `bell_rope_${i + 1}`)));
    ctx.advance(BELL.countdownMs + 10, instance);
    return { ctx, instance };
  }

  it('một tiếng chuông chỉ chốt và trả thưởng 1 lần dù có người thả tay muộn', () => {
    const { ctx, instance } = threePullers();
    const t = ctx.time;
    for (const pid of ['a', 'b']) instance.onAction!(ctx.view(pid), 'release', { strike: 1, pressT: t, releaseT: t + 800 });
    ctx.advance(BELL.releaseTimeoutMs + 50, instance);
    const paid = ctx.rewards.filter((r) => r.pid === 'watcher' && r.opts?.label === 'Chuông 1').length;
    expect(paid).toBe(1);
    // c thả tay muộn trong khoảng nghỉ giữa 2 tiếng → bị bỏ qua.
    instance.onAction!(ctx.view('c'), 'release', { strike: 1, pressT: ctx.time - 900, releaseT: ctx.time });
    expect(ctx.rewards.filter((r) => r.pid === 'watcher' && r.opts?.label === 'Chuông 1')).toHaveLength(1);
    expect(ctx.eventsOf('ring').filter((e) => (e as { strike: number }).strike === 1)).toHaveLength(1);
  });

  it('đi Bar rồi về không lách được thời gian nghỉ của chuông', () => {
    const { ctx, instance } = threePullers();
    for (let n = 1; n <= BELL.strikes; n++) {
      const t = ctx.time;
      for (const pid of ['a', 'b', 'c']) instance.onAction!(ctx.view(pid), 'release', { strike: n, pressT: t, releaseT: t + 800 });
      ctx.advance(BELL.strikeGapMs + 50, instance);
    }
    expect(ctx.lastState<BellPublicState>().phase).toBe('cooldown');
    instance.onMapChange!('bar');
    instance.onMapChange!('temple');
    expect(ctx.lastState<BellPublicState>().phase).toBe('cooldown');
    instance.onInteract!(ctx.view('a'), ctx.station('bell_rope_1'));
    expect(ctx.toasts.at(-1)?.text).toContain('nghỉ');
    ctx.advance(BELL.cooldownMs + 50, instance);
    expect(ctx.lastState<BellPublicState>().phase).toBe('idle');
  });
});

describe('Bầu Cua', () => {
  function table() {
    const { ctx, instance } = mountActivity(bauCuaModule);
    ctx.mapId = 'bar';
    ctx.addPlayer({ pid: 'a', xu: 100 });
    ctx.addPlayer({ pid: 'broke', xu: 0 });
    for (const pid of ['a', 'broke']) ctx.placeAt(pid, 'baucua_table');
    instance.onInteract!(ctx.view('a'), ctx.station('baucua_table'));
    return { ctx, instance };
  }

  it('bấm cược khi hết Xu hoặc gỡ ô trống không tạo mục cược rỗng', () => {
    const { ctx, instance } = table();
    instance.onAction!(ctx.view('broke'), 'bet', { sym: 'cua' });
    instance.onAction!(ctx.view('broke'), 'unbet', { sym: 'ga' });
    instance.onAction!(ctx.view('a'), 'unbet', { sym: 'nai' });
    instance.onAction!(ctx.view('a'), 'xyz', { sym: 'nai' });
    expect(ctx.lastState<BauCuaState>().bets).toEqual({});
    expect(instance.isBusy!()).toBe(false);
  });

  it('đổi map khi xúc xắc đang lắc thì hoàn lại tiền cược', () => {
    const { ctx, instance } = table();
    for (let i = 0; i < 5; i++) instance.onAction!(ctx.view('a'), 'bet', { sym: 'bau' });
    expect(ctx.playersById.get('a')!.xu).toBe(100 - 5 * BAUCUA.chip);
    ctx.advance(BAUCUA.betMs + 50, instance);
    expect(ctx.lastState<BauCuaState>().phase).toBe('rolling');
    instance.onMapChange!('temple');
    expect(ctx.playersById.get('a')!.xu).toBe(100);
    expect(ctx.lastState<BauCuaState>().bets).toEqual({});
  });
});

describe('Thi pha chế', () => {
  it('không ai có tip thì không trao thưởng người nhất', () => {
    const { ctx, instance } = mountActivity(mixologyModule);
    ctx.mapId = 'bar';
    ctx.addPlayer({ pid: 'a', xu: 0 });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'mix_station_1'));
    ctx.advance(MIXOLOGY.lobbyMs + MIXOLOGY.durationMs + 200, instance);
    expect(ctx.playersById.get('a')!.xu).toBe(0);
  });
});

describe('Nấu cơm', () => {
  it('hết ca thì đóng mọi cửa sổ QTE đang mở (quạt lửa) để không ai bị khóa', () => {
    const { ctx, instance } = mountActivity(cookModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'order_board'));
    ctx.advance(COOK.lobbyMs + 50, instance);
    expect(ctx.lastState<CookPublicState>().phase).toBe('cooking');
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'firebox'));
    expect(ctx.view('a').activity).toBe('cook');
    ctx.advance(COOK.durationMs + 50, instance);
    expect(ctx.view('a').activity).toBeNull();
  });
});

describe('DJ', () => {
  it('đang có vòng nhảy thì không cho đổi bài', () => {
    const { ctx, instance } = mountActivity(djModule);
    ctx.mapId = 'bar';
    ctx.addPlayer({ pid: 'dj', isHost: true });
    ctx.setDj('dj');
    // Bàn DJ mở: phải lên bàn (E) trước rồi mới ra lệnh được.
    instance.onInteract!(ctx.view('dj'), ctx.placeAt('dj', 'dj_booth'));
    ctx.shared.set('dance_until', ctx.time + 30_000);
    const other = DJ.tracks[1]!.id;
    instance.onAction!(ctx.view('dj'), 'track', { id: other });
    expect(ctx.toasts.at(-1)?.text).toContain('vòng nhảy');
    expect((ctx.lastState<{ trackId: string }>()).trackId).not.toBe(other);
    ctx.time += 31_000;
    instance.onAction!(ctx.view('dj'), 'track', { id: other });
    expect((ctx.lastState<{ trackId: string }>()).trackId).toBe(other);
  });
});
