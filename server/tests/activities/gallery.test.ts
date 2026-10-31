// Điện Tăng Đoàn: đảnh lễ chân dung Sư Thầy (giữ chỗ, đủ 3 lạy mới thành lễ, chặn lạy dồn, thời gian hồi theo chân dung).
import { describe, expect, it } from 'vitest';
import { PORTRAIT_BOW } from '@shared/index';
import type { GalleryBowEvent, GalleryPublicState } from '@shared/activities/temple';
import { galleryModule } from '../../src/activities/gallery';
import { mountActivity } from '../helpers/fakeContext';

function bowTimes(ctx: ReturnType<typeof mountActivity>['ctx'], instance: ReturnType<typeof mountActivity>['instance'], pid: string, n: number) {
  for (let i = 0; i < n; i++) {
    instance.onAction!(ctx.view(pid), 'bow', null);
    ctx.advance(PORTRAIT_BOW.bowMs, instance);
  }
}

describe('Quỳ lạy chân dung', () => {
  it('quỳ giữ chỗ, người thứ hai không quỳ chồng được', () => {
    const { ctx, instance } = mountActivity(galleryModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'portrait_1'));
    expect(ctx.opens.at(-1)?.pid).toBe('a');
    expect(ctx.lastState<GalleryPublicState>().seats).toEqual({ portrait_1: 'a' });
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'portrait_1'));
    expect(ctx.opens.filter((o) => o.pid === 'b')).toHaveLength(0);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b', tone: 'warn' });
  });

  it('đủ 3 lạy thành 1 lễ: được Công Đức + bớt Tạp Niệm, lễ sau ở cùng chân dung phải chờ hồi', () => {
    const { ctx, instance } = mountActivity(galleryModule);
    ctx.addPlayer({ pid: 'a', tapNiem: 20 });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'portrait_4'));
    bowTimes(ctx, instance, 'a', PORTRAIT_BOW.bowsPerRite - 1);
    expect(ctx.rewards).toHaveLength(0);
    bowTimes(ctx, instance, 'a', 1);
    expect(ctx.rewards).toHaveLength(1);
    expect(ctx.rewards[0]!.base).toBe(PORTRAIT_BOW.reward);
    expect(ctx.playersById.get('a')!.tapNiem).toBe(20 + PORTRAIT_BOW.tapNiem);
    const last = ctx.eventsOf('bowed', 'a').at(-1) as GalleryBowEvent;
    expect(last).toMatchObject({ bows: 0, rite: true });
    expect(last.karma).toBeGreaterThan(0);
    // Lễ thứ hai ngay sau đó: không thưởng.
    bowTimes(ctx, instance, 'a', PORTRAIT_BOW.bowsPerRite);
    expect(ctx.rewards).toHaveLength(1);
    expect((ctx.eventsOf('bowed', 'a').at(-1) as GalleryBowEvent).karma).toBe(0);
    // Hết thời gian hồi: lại được thưởng.
    ctx.advance(PORTRAIT_BOW.cooldownMs, instance);
    bowTimes(ctx, instance, 'a', PORTRAIT_BOW.bowsPerRite);
    expect(ctx.rewards).toHaveLength(2);
  });

  it('lạy dồn nhanh hơn mức tối thiểu không được tính', () => {
    const { ctx, instance } = mountActivity(galleryModule);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'portrait_2'));
    for (let i = 0; i < 10; i++) {
      instance.onAction!(ctx.view('a'), 'bow', null);
      ctx.advance(100, instance);
    }
    expect(ctx.eventsOf('bowed', 'a')).toHaveLength(1);
    expect(ctx.rewards).toHaveLength(0);
  });

  it('đứng dậy / thoát / đổi map thì trả chỗ quỳ', () => {
    const { ctx, instance } = mountActivity(galleryModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'portrait_3'));
    instance.onAction!(ctx.view('a'), 'stand', null);
    expect(ctx.closes).toContainEqual({ pid: 'a', reason: 'done' });
    expect(ctx.lastState<GalleryPublicState>().seats).toEqual({});
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'portrait_3'));
    instance.onLeave!(ctx.view('b'), 'esc');
    expect(ctx.lastState<GalleryPublicState>().seats).toEqual({});
    instance.onInteract!(ctx.view('a'), ctx.placeAt('a', 'portrait_3'));
    instance.onMapChange!('bar');
    expect(ctx.closes.at(-1)).toEqual({ pid: 'a', reason: 'map' });
    expect(ctx.lastState<GalleryPublicState>().seats).toEqual({});
  });
});
