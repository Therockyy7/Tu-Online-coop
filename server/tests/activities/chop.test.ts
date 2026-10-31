import { describe, expect, it } from 'vitest';
import { CHOP, JOKES } from '@shared/index';
import type { ChopDoneEvent, ChopLogEvent, ChopResultEvent } from '@shared/activities/chop';
import { chopModule } from '../../src/activities/chop';
import { mountActivity } from '../helpers/fakeContext';

/** Giờ server kim nằm đúng tâm vùng xanh (pha đầu tiên của chu kỳ). */
function perfectTime(log: ChopLogEvent): number {
  const phase = Math.acos(1 - 2 * log.center) / (2 * Math.PI);
  return log.t0 + phase * log.period;
}

/** Giờ kim ở xa tâm nhất trong chu kỳ đầu (chắc chắn trượt). */
function missTime(log: ChopLogEvent): number {
  const phase = log.center > 0.5 ? 0 : 0.5;
  return log.t0 + phase * log.period + 1;
}

describe('Chẻ củi (server)', () => {
  it('mở phiên, chấm hoàn hảo / trượt theo thời điểm bấm và cộng củi', () => {
    const { ctx, instance } = mountActivity(chopModule, 7);
    ctx.shared.set('firewood', CHOP.firewoodStart);
    ctx.addPlayer({ pid: 'a' });
    const station = ctx.placeAt('a', 'chop_block_1');
    instance.onInteract!(ctx.view('a'), station);
    expect(ctx.opens).toHaveLength(1);
    expect(ctx.playersById.get('a')!.activity).toBe('chop');

    ctx.advance(700, instance);
    const log1 = ctx.eventsOf('log', 'a').at(-1) as ChopLogEvent;
    expect(log1.index).toBe(0);
    ctx.time = Math.max(ctx.time, Math.ceil(perfectTime(log1)));
    instance.onAction!(ctx.view('a'), 'chop', { index: 0, t: perfectTime(log1) });
    const r1 = ctx.eventsOf('result', 'a').at(-1) as ChopResultEvent;
    expect(r1.result).toBe('perfect');
    expect(ctx.rewards.at(-1)!.base).toBe(CHOP.rewardPerfect);
    expect(r1.firewood).toBe(CHOP.firewoodStart + 1);

    ctx.advance(CHOP.logGapMs + 50, instance);
    const log2 = ctx.eventsOf('log', 'a').at(-1) as ChopLogEvent;
    expect(log2.index).toBe(1);
    expect(log2.period).toBe(CHOP.basePeriodMs - CHOP.periodStepMs);
    ctx.time = Math.max(ctx.time, Math.ceil(missTime(log2)));
    instance.onAction!(ctx.view('a'), 'chop', { index: 1, t: missTime(log2) });
    const r2 = ctx.eventsOf('result', 'a').at(-1) as ChopResultEvent;
    expect(r2.result).toBe('miss');
    expect(ctx.rewards).toHaveLength(1);
  });

  it('thớt đang có người thì báo bận, tay cầm đồ thì không chẻ', () => {
    const { ctx, instance } = mountActivity(chopModule);
    ctx.addPlayer({ pid: 'a' });
    ctx.addPlayer({ pid: 'b' });
    const st = ctx.placeAt('a', 'chop_block_2');
    ctx.placeAt('b', 'chop_block_2');
    instance.onInteract!(ctx.view('a'), st);
    instance.onInteract!(ctx.view('b'), st);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b', text: JOKES.stationBusy });

    ctx.addPlayer({ pid: 'c', held: { kind: 'broom' } });
    const st3 = ctx.placeAt('c', 'chop_block_3');
    instance.onInteract!(ctx.view('c'), st3);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'c', text: JOKES.handsFull });
  });

  it('không bấm thì tự tính trượt; đủ 8 khúc thì kết thúc và trả thớt', () => {
    const { ctx, instance } = mountActivity(chopModule);
    ctx.addPlayer({ pid: 'a' });
    const st = ctx.placeAt('a', 'chop_block_1');
    instance.onInteract!(ctx.view('a'), st);
    ctx.advance(120_000, instance);
    const done = ctx.eventsOf('done', 'a').at(-1) as ChopDoneEvent;
    expect(done).toEqual({ perfect: 0, good: 0, miss: CHOP.logs });
    expect(ctx.closes.at(-1)).toMatchObject({ pid: 'a', reason: 'done' });
    expect(ctx.lastState<{ blocks: Record<string, string | null> }>().blocks.chop_block_1).toBeNull();
  });

  it('Esc giữa chừng thì đóng phiên, không thưởng phần dở', () => {
    const { ctx, instance } = mountActivity(chopModule);
    ctx.addPlayer({ pid: 'a' });
    const st = ctx.placeAt('a', 'chop_block_1');
    instance.onInteract!(ctx.view('a'), st);
    ctx.advance(700, instance);
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(ctx.closes.at(-1)).toMatchObject({ pid: 'a', reason: 'esc' });
    ctx.advance(10_000, instance);
    expect(ctx.rewards).toHaveLength(0);
  });
});
