// Bàn Tài Xỉu (Sòng Công Đức) phía server với FakeActivityContext: mở ván, đặt/gỡ cược Công Đức thật, lắc, mở bát trả
// thưởng, ngữ nghĩa rời bàn / mất kết nối / đổi map như Bầu Cua, isBusy, tự nghỉ, bảng cầu.
import { describe, expect, it } from 'vitest';
import { CASINO, JOKES, TAIXIU } from '@shared/index';
import { taiXiuReturn, type TaiXiuPublicState } from '@shared/activities/taixiu';
import { taiXiuModule } from '../../src/activities/taixiu';
import { mountActivity } from '../helpers/fakeContext';

const ROUND_MS = TAIXIU.betMs + TAIXIU.rollMs + TAIXIU.payoutMs;

function setup(seed = 7) {
  const { ctx, instance } = mountActivity(taiXiuModule, seed);
  ctx.addPlayer({ pid: 'a', name: 'An', congDuc: 300, duc: 120 });
  ctx.addPlayer({ pid: 'b', name: 'Bình', congDuc: 200, duc: 200 });
  ctx.placeAt('a', 'taixiu_table');
  ctx.placeAt('b', 'taixiu_table');
  const st = () => ctx.lastState<TaiXiuPublicState>();
  const open = (pid = 'a') => instance.onInteract!(ctx.view(pid), ctx.station('taixiu_table'));
  const bet = (pid: string, b: string, amount: number) => instance.onAction!(ctx.view(pid), 'bet', { bet: b, amount });
  const unbet = (pid: string, b: string, amount: number) => instance.onAction!(ctx.view(pid), 'unbet', { bet: b, amount });
  const wallet = (pid: string) => {
    const p = ctx.playersById.get(pid)!;
    return [p.congDuc, p.duc];
  };
  return { ctx, instance, st, open, bet, unbet, wallet };
}

describe('Tài Xỉu — đặt / gỡ cược', () => {
  it('bấm E ở bàn mở ván; đặt/gỡ trừ/hoàn cả Công Đức lẫn Đức; trạng thái công khai có cược', () => {
    const { ctx, instance, st, open, bet, unbet, wallet } = setup();
    expect(st().phase).toBe('idle');
    open();
    expect(st()).toMatchObject({ phase: 'betting', round: 1, endsAt: ctx.time + TAIXIU.betMs, dice: [] });
    expect(ctx.chats.at(-1)).toMatch(/An mở bàn Tài Xỉu/);
    expect(instance.isBusy!()).toBe(false);
    bet('a', 'tai', 10);
    bet('a', 'tai', 5);
    bet('a', 'chan', 1);
    expect(wallet('a')).toEqual([284, 104]);
    expect(instance.isBusy!()).toBe(true);
    unbet('a', 'tai', 5);
    expect(wallet('a')).toEqual([289, 109]);
    expect(st().bets).toEqual({ a: { tai: 10, chan: 1 } });
    expect(st().names).toEqual({ a: 'An' });
    expect(ctx.wagers.map((w) => w.amount)).toEqual([10, 5, 1]);
    // E lần nữa lúc bàn đang chạy không mở ván mới.
    open('b');
    expect(st().round).toBe(1);
    unbet('a', 'tai', 10);
    unbet('a', 'chan', 1);
    expect(wallet('a')).toEqual([300, 120]);
    expect(instance.isBusy!()).toBe(false);
  });

  it('mệnh giá ngoài phỉnh / ô lạ bị bỏ qua; thiếu Đức, vượt trần, đứng xa bị từ chối kèm toast', () => {
    const { ctx, st, open, bet, wallet } = setup();
    ctx.addPlayer({ pid: 'c', congDuc: 300, duc: 4 });
    ctx.placeAt('c', 'taixiu_table');
    open();
    bet('a', 'tai', 3);
    bet('a', 'nope', 5);
    bet('a', 'tai', -10);
    expect(ctx.wagers).toHaveLength(0);
    bet('c', 'xiu', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'c', tone: 'warn' });
    expect(ctx.toasts.at(-1)!.text).toMatch(/Cần đủ Đức/);
    expect(wallet('c')).toEqual([300, 4]);
    bet('a', 'tai', 50);
    bet('a', 'xiu', 50);
    bet('a', 'le', 1);
    expect(ctx.toasts.at(-1)!.text).toMatch(new RegExp(`Tối đa ${CASINO.maxBetPerRound}`));
    expect(wallet('a')).toEqual([200, 20]);
    // Đứng ngoài bán kính trạm + dung sai thì không đặt được; vừa trong tầm thì được.
    const s = ctx.station('taixiu_table');
    const pb = ctx.playersById.get('b')!;
    pb.z = s.z + s.r + CASINO.nearSlack + 0.3;
    bet('b', 'tai', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b', text: JOKES.tooFar });
    expect(wallet('b')).toEqual([200, 200]);
    pb.z = s.z + s.r + CASINO.nearSlack - 0.1;
    bet('b', 'tai', 5);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().bets.b).toEqual({ tai: 5 });
  });
});

describe('Tài Xỉu — lắc, mở bát, trả thưởng', () => {
  it('hết giờ đặt → lắc (âm dice_cup, chưa gieo) → mở bát trả đúng taiXiuReturn + Tạp Niệm, rồi tự sang ván kế', () => {
    const { ctx, instance, st, open, bet, unbet, wallet } = setup();
    open();
    bet('a', 'tai', 10);
    bet('a', 'bo_ba', 5);
    bet('b', 'xiu', 10);
    bet('b', 'le', 10);
    ctx.advance(TAIXIU.betMs, instance);
    expect(st()).toMatchObject({ phase: 'resolving', dice: [], endsAt: ctx.time + TAIXIU.rollMs });
    expect(ctx.fxs.some((f) => f.msg.type === 'sound' && f.msg.id === 'dice_cup')).toBe(true);
    // Đã chốt: không đặt thêm, không gỡ được nữa.
    bet('a', 'chan', 5);
    unbet('a', 'tai', 10);
    expect(wallet('a')).toEqual([285, 105]);
    expect(instance.isBusy!()).toBe(true);

    ctx.advance(TAIXIU.rollMs, instance);
    const r = st();
    expect(r.phase).toBe('result');
    expect(r.dice).toHaveLength(3);
    for (const d of r.dice) expect(Number.isInteger(d) && d >= 1 && d <= 6).toBe(true);
    const backA = taiXiuReturn({ tai: 10, bo_ba: 5 }, r.dice);
    const backB = taiXiuReturn({ xiu: 10, le: 10 }, r.dice);
    expect(wallet('a')).toEqual([285 + backA, 105 + backA]);
    expect(wallet('b')).toEqual([180 + backB, 180 + backB]);
    expect(r.results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 15, backA, backA - 15],
      ['b', 20, backB, backB - 20],
    ]);
    expect(r.bets).toEqual({ a: { tai: 10, bo_ba: 5 }, b: { xiu: 10, le: 10 } });
    expect(r.history).toEqual([{ dice: r.dice, sum: r.dice[0]! + r.dice[1]! + r.dice[2]! }]);
    for (const pid of ['a', 'b']) expect(ctx.playersById.get(pid)!.tapNiem).toBe(CASINO.tapNiemPerRound);
    for (const rw of ctx.rewards) expect(rw.opts).toMatchObject({ raw: true, noPool: true, label: 'Tài Xỉu' });
    expect(ctx.chats.at(-1)).toMatch(/Tài Xỉu ván 1/);
    expect(instance.isBusy!()).toBe(false);

    ctx.advance(TAIXIU.payoutMs, instance);
    expect(st()).toMatchObject({ phase: 'betting', round: 2, dice: [], bets: {}, results: [] });
    expect(st().history).toHaveLength(1);
  });
});

describe('Tài Xỉu — rời bàn, mất kết nối, đổi map', () => {
  it('mất kết nối lúc đặt → hoàn; Esc giữ cược; mất kết nối lúc lắc → giữ và vẫn trả; rời hẳn lúc lắc → hoàn', () => {
    const { ctx, instance, st, open, bet, wallet } = setup();
    ctx.addPlayer({ pid: 'c', congDuc: 100, duc: 100 });
    ctx.placeAt('c', 'taixiu_table');
    open();
    bet('a', 'tai', 10);
    bet('b', 'xiu', 10);
    bet('c', 'chan', 10);
    ctx.playersById.get('a')!.connected = false;
    instance.onLeave!(ctx.view('a'), 'disconnect');
    expect(wallet('a')).toEqual([300, 120]);
    expect(st().bets.a).toBeUndefined();
    instance.onLeave!(ctx.view('c'), 'esc');
    expect(wallet('c')).toEqual([90, 90]);

    ctx.advance(TAIXIU.betMs, instance);
    expect(st().phase).toBe('resolving');
    ctx.playersById.get('b')!.connected = false;
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(wallet('b')).toEqual([190, 190]);
    instance.onLeave!(ctx.view('c'), 'left');
    expect(wallet('c')).toEqual([100, 100]);
    ctx.playersById.delete('c');

    ctx.advance(TAIXIU.rollMs, instance);
    const r = st();
    const backB = taiXiuReturn({ xiu: 10 }, r.dice);
    expect(wallet('b')).toEqual([190 + backB, 190 + backB]);
    expect(r.results.map((l) => l.pid)).toEqual(['b']);
  });

  it('đổi map lúc đặt hoặc lúc lắc → hoàn hết, bàn về nghỉ, hẹn giờ cũ bị hủy', () => {
    for (const locked of [false, true]) {
      const { ctx, instance, st, open, bet, wallet } = setup();
      open();
      bet('a', 'tai', 10);
      bet('b', 'le', 5);
      if (locked) ctx.advance(TAIXIU.betMs, instance);
      expect(st().phase).toBe(locked ? 'resolving' : 'betting');
      ctx.mapId = 'temple';
      instance.onMapChange!('temple');
      expect(wallet('a')).toEqual([300, 120]);
      expect(wallet('b')).toEqual([200, 200]);
      expect(st()).toMatchObject({ phase: 'idle', endsAt: 0, bets: {}, dice: [], results: [] });
      expect(instance.isBusy!()).toBe(false);
      ctx.advance(ROUND_MS * 2, instance);
      expect(st().phase).toBe('idle');
      expect(ctx.wagers).toHaveLength(2);
    }
  });
});

describe('Tài Xỉu — tự nghỉ, mở lại, bảng cầu', () => {
  it(`nghỉ sau ${CASINO.idleRounds} ván không ai cược (ván trống vẫn vào cầu, không báo chat); nghỉ khi không còn ai đứng gần`, () => {
    const { ctx, instance, st, open, bet, wallet } = setup();
    open();
    ctx.advance(ROUND_MS * (CASINO.idleRounds - 1), instance);
    expect(st()).toMatchObject({ phase: 'betting', round: CASINO.idleRounds });
    ctx.advance(ROUND_MS, instance);
    expect(st()).toMatchObject({ phase: 'idle', round: CASINO.idleRounds, endsAt: 0 });
    expect(st().history).toHaveLength(CASINO.idleRounds);
    expect(ctx.chats.some((c) => /Tài Xỉu ván/.test(c))).toBe(false);
    ctx.advance(ROUND_MS, instance);
    expect(st().phase).toBe('idle');

    open();
    bet('a', 'tai', 5);
    for (const pid of ['a', 'b']) Object.assign(ctx.playersById.get(pid)!, { x: 0, z: 30 });
    ctx.advance(TAIXIU.betMs + TAIXIU.rollMs, instance);
    expect(st().phase).toBe('result');
    expect(wallet('a')[0]).toBe(295 + taiXiuReturn({ tai: 5 }, st().dice));
    ctx.advance(TAIXIU.payoutMs, instance);
    expect(st().phase).toBe('idle');
  });

  it('nút "Mở ván" trên bảng (act open) chỉ mở khi bàn nghỉ và người bấm đứng gần', () => {
    const { ctx, instance, st } = setup();
    Object.assign(ctx.playersById.get('b')!, { x: 0, z: 30 });
    instance.onAction!(ctx.view('b'), 'open', undefined);
    expect(st().phase).toBe('idle');
    instance.onAction!(ctx.view('a'), 'open', undefined);
    expect(st()).toMatchObject({ phase: 'betting', round: 1 });
    instance.onAction!(ctx.view('a'), 'open', undefined);
    expect(st().round).toBe(1);
  });

  it(`bảng cầu giữ tối đa ${TAIXIU.history} ván gần nhất (cũ → mới)`, () => {
    const { ctx, instance, st, open, bet } = setup();
    Object.assign(ctx.playersById.get('a')!, { congDuc: 5000, duc: 5000 });
    open();
    const seen: number[][] = [];
    for (let i = 0; i < TAIXIU.history + 2; i++) {
      bet('a', 'tai', 1);
      ctx.advance(TAIXIU.betMs + TAIXIU.rollMs, instance);
      seen.push(st().dice);
      ctx.advance(TAIXIU.payoutMs, instance);
    }
    const h = st().history;
    expect(h).toHaveLength(TAIXIU.history);
    expect(h.map((x) => x.dice)).toEqual(seen.slice(-TAIXIU.history));
    for (const x of h) expect(x.sum).toBe(x.dice[0]! + x.dice[1]! + x.dice[2]!);
  });
});
