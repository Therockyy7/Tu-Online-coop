// Đại Pháp Đường: ngồi bồ đoàn nghe kinh (giữ chỗ, tay bận không ngồi được, đứng dậy / thoát / đổi map / rời chỗ thì
// trả bồ đoàn; chỉ ngồi nghe — không bao giờ thưởng Công Đức hay đổi Tạp Niệm).
import { describe, expect, it } from 'vitest';
import { JOKES } from '@shared/index';
import type { SutraOpenData, SutraPublicState } from '@shared/activities/temple';
import { sutraModule } from '../../src/activities/sutra';
import { mountActivity, type FakeActivityContext } from '../helpers/fakeContext';

/** Bảng chỗ ngồi vừa công bố cho cả phòng (stationId → pid). */
const seatsOf = (ctx: FakeActivityContext) => ctx.lastState<SutraPublicState>().seats;

describe('Nghe kinh ở Đại Pháp Đường', () => {
  it('ngồi xuống bồ đoàn: giữ chỗ, mở giao diện nghe kinh, báo cả phòng', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    expect(seatsOf(ctx)).toEqual({});
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_1'));
    expect(ctx.opens).toEqual([{ pid: 'a', data: { stationId: 'sutra_cushion_1' } satisfies SutraOpenData }]);
    expect(ctx.playersById.get('a')!.activity).toBe('sutra');
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_1: 'a' });
  });

  it('bồ đoàn đã có người thì người thứ hai không ngồi chồng được, bồ đoàn bên cạnh vẫn ngồi được', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_1'));
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'sutra_cushion_1'));
    expect(ctx.opens.filter((o) => o.pid === 'b')).toHaveLength(0);
    expect(ctx.toasts.at(-1)).toEqual({ target: 'b', text: 'Bồ đoàn này có người ngồi rồi, chọn chỗ khác nhé.', tone: 'warn' });
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_1: 'a' });
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'sutra_cushion_2'));
    expect(ctx.opens.at(-1)).toEqual({ pid: 'b', data: { stationId: 'sutra_cushion_2' } });
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_1: 'a', sutra_cushion_2: 'b' });
  });

  it('tay đang cầm đồ thì không ngồi được', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a', held: { kind: 'water_bucket' } });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_5'));
    expect(ctx.opens).toHaveLength(0);
    expect(ctx.toasts.at(-1)).toEqual({ target: 'a', text: JOKES.handsFull, tone: 'warn' });
    expect(seatsOf(ctx)).toEqual({});
  });

  it('đang ngồi mà bấm E ở bồ đoàn khác thì bỏ qua, vẫn giữ chỗ cũ', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_1'));
    const published = ctx.states.length;
    instance.onInteract!(ctx.view('a'), ctx.station('sutra_cushion_2'));
    instance.onInteract!(ctx.view('a'), ctx.station('sutra_cushion_1'));
    expect(ctx.opens).toHaveLength(1);
    expect(ctx.toasts).toHaveLength(0);
    expect(ctx.states).toHaveLength(published);
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_1: 'a' });
  });

  it('đứng dậy thì trả bồ đoàn và đóng giao diện; thao tác lạ hoặc từ người chưa ngồi bị bỏ qua', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_3'));
    instance.onAction!(ctx.view('a'), 'bow', null);
    instance.onAction!(ctx.view('b'), 'stand', null);
    expect(ctx.closes).toHaveLength(0);
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_3: 'a' });
    instance.onAction!(ctx.view('a'), 'stand', null);
    expect(ctx.closes).toEqual([{ pid: 'a', reason: 'done' }]);
    expect(ctx.playersById.get('a')!.activity).toBeNull();
    expect(seatsOf(ctx)).toEqual({});
    // Gói `stand` tới trễ không đóng thêm lần nữa; chỗ đã trống thì người khác ngồi vào được.
    instance.onAction!(ctx.view('a'), 'stand', null);
    expect(ctx.closes).toHaveLength(1);
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'sutra_cushion_3'));
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_3: 'b' });
  });

  it('thoát (Esc / mất kết nối) thì trả bồ đoàn; người không ngồi rời đi thì không đóng gì', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_4'));
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(ctx.closes).toHaveLength(0);
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(ctx.closes).toEqual([{ pid: 'a', reason: 'esc' }]);
    expect(seatsOf(ctx)).toEqual({});
  });

  it('đổi map thì mọi người đứng dậy, trả hết bồ đoàn', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_1'));
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'sutra_cushion_40'));
    instance.onMapChange!('bar');
    expect(ctx.closes).toHaveLength(2);
    expect(ctx.closes).toEqual(expect.arrayContaining([{ pid: 'a', reason: 'map' }, { pid: 'b', reason: 'map' }]));
    expect(seatsOf(ctx)).toEqual({});
  });

  it('ngồi yên nghe lâu không bị đuổi; bị dịch chuyển khỏi bồ đoàn thì tự đứng dậy, trả chỗ', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_10'));
    ctx.advance(2 * 60_000, instance);
    expect(ctx.closes).toHaveLength(0);
    ctx.playersById.get('a')!.x += 5;
    ctx.advance(5_000, instance);
    expect(ctx.closes).toEqual([{ pid: 'a', reason: 'moved' }]);
    expect(ctx.playersById.get('a')!.activity).toBeNull();
    expect(seatsOf(ctx)).toEqual({});
  });

  it('vừa ngồi xuống, còn đang lướt vào giữa bồ đoàn thì chưa bị tính là rời chỗ', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    // b ngồi trước để lượt kiểm chỗ ngồi định kỳ đang chạy dở.
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'sutra_cushion_8'));
    ctx.advance(950, instance);
    // a bấm E ở mép tầm tương tác (ngoài bán kính kiểm chỗ ngồi), ngay trước lượt kiểm kế tiếp.
    const cushion = ctx.placeAt('a', 'sutra_cushion_1');
    ctx.playersById.get('a')!.z += cushion.r + 0.9;
    instance.onInteract!(ctx.view('a'), cushion);
    ctx.advance(300, instance);
    // Client lướt xong vào giữa bồ đoàn.
    ctx.placeAt('a', 'sutra_cushion_1');
    ctx.advance(10_000, instance);
    expect(ctx.closes).toHaveLength(0);
    expect(seatsOf(ctx)).toEqual({ sutra_cushion_1: 'a', sutra_cushion_8: 'b' });
  });

  it('giao diện bị đóng ở đường khác (không qua module) thì bồ đoàn cũng được trả, không giữ chỗ ma', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_12'));
    ctx.playersById.get('a')!.activity = null;
    ctx.advance(5_000, instance);
    expect(seatsOf(ctx)).toEqual({});
  });

  it('chỉ ngồi nghe: không bao giờ thưởng Công Đức, Xu hay đổi Tạp Niệm', () => {
    const { ctx, instance } = mountActivity(sutraModule);
    const a = ctx.addPlayer({ pid: 'a', congDuc: 100, tapNiem: 30, xu: 5 });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_20'));
    ctx.advance(5 * 60_000, instance);
    instance.onAction!(ctx.view('a'), 'stand', null);
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'sutra_cushion_20'));
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(ctx.rewards).toEqual([]);
    expect(ctx.penalties).toEqual([]);
    expect(a).toMatchObject({ congDuc: 100, duc: 100, tapNiem: 30, xu: 5, doSay: 0, buffs: [] });
    expect(ctx.roomBuffs).toEqual([]);
  });
});
