// Bàn Xì Dách (Sòng Công Đức) phía server với FakeActivityContext: mở ván, đặt/gỡ cược Công Đức thật (ô 'hand'), ghế theo
// thứ tự đặt cược (tối đa 5), chia bài, rút/dằn cùng lúc, hết giờ tự chơi, nhà cái lật + rút từng lá + xét dần, trả
// thưởng; rời bàn / mất kết nối / đổi map (đang đặt → hoàn như Bầu Cua; từ lúc chia mà rời hẳn phòng → mất cược, ghế tự
// chơi), isBusy, tự nghỉ.
import { describe, expect, it } from 'vitest';
import { CASINO, JOKES, XIDACH } from '@shared/index';
import type { Card, Suit } from '@shared/activities/cards';
import { xiDachPayout, xiDachPoints, xiDachRank, type XiDachPublicState } from '@shared/activities/xidach';
import { createXiDach, xiDachModule } from '../../src/activities/xidach';
import type { ActivityServerModule } from '../../src/activities/types';
import { mountActivity } from '../helpers/fakeContext';

const SUITS: Suit[] = ['bich', 'co', 'ro', 'chuon'];
const cards = (...ranks: number[]): Card[] => ranks.map((r, i) => ({ r, s: SUITS[i % 4]! }));
const A = 1;
const K = 13;
const Q = 12;

/**
 * Bộ bài xếp sẵn. Thứ tự chia: vòng 1 (ghế 1..n rồi nhà cái), vòng 2 (ghế 1..n rồi nhà cái — lá tẩy), sau đó là nọc rút
 * theo đúng thứ tự xảy ra (người rút, tự chơi khi hết giờ, nhà cái rút). Đệm thêm lá 10 phía sau cho đủ.
 */
const stacked =
  (...ranks: number[]) =>
  (): Card[] =>
    cards(...ranks, ...Array<number>(30).fill(10));

function setup(opts: { deck?: () => Card[]; seed?: number } = {}) {
  const deck = opts.deck;
  const mod: ActivityServerModule = deck ? { ...xiDachModule, create: (c) => createXiDach(c, deck) } : xiDachModule;
  const { ctx, instance } = mountActivity(mod, opts.seed ?? 7);
  ctx.addPlayer({ pid: 'a', name: 'An', congDuc: 300, duc: 120 });
  ctx.addPlayer({ pid: 'b', name: 'Bình', congDuc: 200, duc: 200 });
  ctx.placeAt('a', 'xidach_table');
  ctx.placeAt('b', 'xidach_table');
  const st = () => ctx.lastState<XiDachPublicState>();
  const open = (pid = 'a') => instance.onInteract!(ctx.view(pid), ctx.station('xidach_table'));
  const act = (pid: string, type: string, data?: unknown) => instance.onAction!(ctx.view(pid), type, data);
  const bet = (pid: string, amount: number) => act(pid, 'bet', { amount });
  const unbet = (pid: string, amount: number) => act(pid, 'unbet', { amount });
  const wallet = (pid: string) => {
    const p = ctx.playersById.get(pid)!;
    return [p.congDuc, p.duc];
  };
  const seat = (pid: string) => st().seats.find((s) => s.pid === pid);
  const ranks = (pid: string) => seat(pid)!.cards.map((c) => c.r);
  const dealerRanks = () => st().dealer.cards.map((c) => c?.r ?? 0);
  /** Hết giờ đặt + chia xong → vào lượt rút/dằn. */
  const toTurn = () => {
    ctx.advance(XIDACH.betMs, instance);
    ctx.advance(XIDACH.dealMs, instance);
  };
  return { ctx, instance, st, open, act, bet, unbet, wallet, seat, ranks, dealerRanks, toTurn };
}

describe('Xì Dách — đặt / gỡ cược, ghế', () => {
  it('bấm E mở ván; đặt/gỡ trừ/hoàn cả Công Đức lẫn Đức; ghế theo thứ tự đặt cược, tối đa 5, người thứ 6 bị từ chối', () => {
    const { ctx, instance, st, open, bet, unbet, wallet } = setup();
    for (const pid of ['c', 'd', 'e', 'f']) {
      ctx.addPlayer({ pid, congDuc: 100, duc: 100 });
      ctx.placeAt(pid, 'xidach_table');
    }
    expect(st().phase).toBe('idle');
    open();
    expect(st()).toMatchObject({ phase: 'betting', step: null, round: 1, endsAt: ctx.time + XIDACH.betMs, seats: [] });
    expect(ctx.chats.at(-1)).toMatch(/An mở bàn Xì Dách/);
    expect(instance.isBusy!()).toBe(false);
    bet('b', 5);
    bet('a', 10);
    bet('a', 1);
    expect(wallet('a')).toEqual([289, 109]);
    expect(instance.isBusy!()).toBe(true);
    for (const pid of ['c', 'd', 'e']) bet(pid, 5);
    expect(st().seats.map((s) => [s.seat, s.pid, s.stake])).toEqual([
      [1, 'b', 5],
      [2, 'a', 11],
      [3, 'c', 5],
      [4, 'd', 5],
      [5, 'e', 5],
    ]);
    expect(st().seats[1]).toMatchObject({ name: 'An', cards: [], done: false });
    bet('f', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'f', tone: 'warn' });
    expect(ctx.toasts.at(-1)!.text).toMatch(/đủ 5 ghế/);
    expect(wallet('f')).toEqual([100, 100]);
    // Gỡ hết thì nhường ghế; người đặt sau vào ghế cuối.
    unbet('c', 5);
    expect(wallet('c')).toEqual([100, 100]);
    bet('f', 5);
    expect(st().seats.map((s) => s.pid)).toEqual(['b', 'a', 'd', 'e', 'f']);
    unbet('a', 1);
    expect(wallet('a')).toEqual([290, 110]);
    expect(ctx.wagers.map((w) => w.amount)).toEqual([5, 10, 1, 5, 5, 5, 5]);
    // E lần nữa lúc bàn đang chạy không mở ván mới.
    open('b');
    expect(st().round).toBe(1);
  });

  it('mệnh giá ngoài phỉnh bị bỏ qua; thiếu Đức, vượt trần, đứng xa, ngoài giờ đặt bị từ chối kèm toast', () => {
    const { ctx, instance, st, open, act, bet, unbet, wallet } = setup();
    ctx.addPlayer({ pid: 'c', congDuc: 300, duc: 4 });
    ctx.placeAt('c', 'xidach_table');
    bet('a', 5);
    expect(ctx.wagers).toHaveLength(0);
    open();
    bet('a', 3);
    bet('a', -10);
    act('a', 'bet', { amount: '5' });
    act('a', 'bet', null);
    expect(ctx.wagers).toHaveLength(0);
    bet('c', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'c', tone: 'warn' });
    expect(ctx.toasts.at(-1)!.text).toMatch(/Cần đủ Đức/);
    expect(wallet('c')).toEqual([300, 4]);
    bet('a', 50);
    bet('a', 50);
    bet('a', 1);
    expect(ctx.toasts.at(-1)!.text).toMatch(new RegExp(`Tối đa ${CASINO.maxBetPerRound}`));
    expect(wallet('a')).toEqual([200, 20]);
    const s = ctx.station('xidach_table');
    const pb = ctx.playersById.get('b')!;
    pb.z = s.z + s.r + CASINO.nearSlack + 0.3;
    bet('b', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b', text: JOKES.tooFar });
    expect(wallet('b')).toEqual([200, 200]);
    pb.z = s.z + s.r + CASINO.nearSlack - 0.1;
    bet('b', 5);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().seats.map((x) => x.pid)).toEqual(['a', 'b']);
    ctx.advance(XIDACH.betMs, instance);
    bet('b', 5);
    expect(ctx.toasts.at(-1)!.text).toMatch(/Ngoài giờ đặt cược/);
    unbet('b', 5);
    expect(ctx.toasts.at(-1)!.text).toMatch(/không gỡ cược/);
    expect(wallet('b')).toEqual([195, 195]);
  });
});

describe('Xì Dách — chia bài', () => {
  it('hết giờ đặt → chia 2 lá mỗi ghế + nhà cái (lá tẩy úp, không lộ trong trạng thái) → lượt rút/dằn', () => {
    const { ctx, instance, st, open, bet, ranks } = setup({ deck: stacked(10, 9, 7, 5, K, 6) });
    open();
    bet('a', 10);
    bet('b', 5);
    ctx.advance(XIDACH.betMs, instance);
    const d = st();
    expect(d).toMatchObject({ phase: 'resolving', step: 'deal', dealAt: ctx.time, endsAt: ctx.time + XIDACH.dealMs, turnEndsAt: 0 });
    expect(ranks('a')).toEqual([10, 5]);
    expect(ranks('b')).toEqual([9, K]);
    expect(d.dealer.revealed).toBe(false);
    expect(d.dealer.cards[0]).toMatchObject({ r: 7 });
    expect(d.dealer.cards[1]).toBeNull();
    ctx.advance(XIDACH.dealMs, instance);
    expect(st()).toMatchObject({ step: 'turn', turnEndsAt: ctx.time + XIDACH.turnMs, endsAt: ctx.time + XIDACH.turnMs });
    expect(st().seats.map((s) => s.done)).toEqual([false, false]);
    // Chưa lật thì không bản trạng thái nào lộ lá tẩy.
    for (const s of ctx.states as XiDachPublicState[]) if (!s.dealer.revealed) expect(s.dealer.cards.slice(1).every((c) => c === null)).toBe(true);
  });

  it('nhà cái Xì Dách lúc chia → lật ngay, chốt ván: người Xì Dách hòa, người thường thua', () => {
    const { ctx, instance, st, open, bet, seat, wallet, dealerRanks } = setup({ deck: stacked(A, 10, A, K, 9, Q) });
    open();
    bet('a', 10);
    bet('b', 5);
    ctx.advance(XIDACH.betMs + XIDACH.dealMs, instance);
    expect(st()).toMatchObject({ phase: 'result', step: null, endsAt: ctx.time + XIDACH.resultMs });
    expect(st().dealer.revealed).toBe(true);
    expect(dealerRanks()).toEqual([A, Q]);
    expect(seat('a')!.result).toBe('push');
    expect(seat('b')!.result).toBe('lose');
    expect(wallet('a')).toEqual([300, 120]);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 10, 10, 0],
      ['b', 5, 0, -5],
    ]);
    expect(ctx.chats.at(-1)).toMatch(/Xì Dách ván 1/);
  });

  it('người có Xì Dách lúc chia tự dừng; cả bàn đã xong thì sang nhà cái ngay; Xì Dách ăn ×2', () => {
    const { ctx, instance, st, open, bet, seat, wallet } = setup({ deck: stacked(A, 10, K, 9) });
    open();
    bet('a', 10);
    ctx.advance(XIDACH.betMs + XIDACH.dealMs, instance);
    expect(seat('a')!.done).toBe(true);
    expect(st()).toMatchObject({ step: 'dealer', dealer: { revealed: true } });
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(st().phase).toBe('result');
    expect(seat('a')!.result).toBe('win');
    expect(wallet('a')).toEqual([290 + 10 * (1 + XIDACH.payout.xi_dach), 110 + 10 * (1 + XIDACH.payout.xi_dach)]);
  });
});

describe('Xì Dách — rút / dằn', () => {
  it('dằn dưới 16 bị từ chối kèm toast; 21 điểm và 5 lá tự dừng; chưa tới lượt không rút được; mọi người xong thì sang nhà cái sớm', () => {
    const { ctx, instance, st, open, act, bet, ranks, seat, dealerRanks } = setup({ deck: stacked(10, 2, 10, 5, 3, 7, 6, 2, 2, 3) });
    open();
    bet('a', 10);
    bet('b', 5);
    ctx.advance(XIDACH.betMs, instance);
    act('a', 'hit');
    expect(ranks('a')).toEqual([10, 5]);
    ctx.advance(XIDACH.dealMs, instance);
    act('a', 'stand');
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', tone: 'warn' });
    expect(ctx.toasts.at(-1)!.text).toMatch(new RegExp(`Chưa đủ ${XIDACH.playerMinStand} điểm`));
    expect(seat('a')!.done).toBe(false);
    act('a', 'hit');
    expect(ranks('a')).toEqual([10, 5, 6]);
    expect(seat('a')!.done).toBe(true);
    act('a', 'hit');
    act('a', 'stand');
    expect(ranks('a')).toEqual([10, 5, 6]);
    const t0 = ctx.time;
    act('b', 'hit');
    act('b', 'hit');
    expect(st().step).toBe('turn');
    act('b', 'hit');
    expect(ranks('b')).toEqual([2, 3, 2, 2, 3]);
    expect(seat('b')!.done).toBe(true);
    expect(st()).toMatchObject({ step: 'dealer', endsAt: t0 + XIDACH.dealerStepMs, dealer: { revealed: true } });
    expect(dealerRanks()).toEqual([10, 7]);
    // Nhà cái 17: cả hai hơn (21 điểm, Ngũ Linh) → rút 10 = Quắc → a thắng ×1, b Ngũ Linh ×(lãi Ngũ Linh).
    ctx.advance(XIDACH.dealerStepMs * 2, instance);
    expect(st().phase).toBe('result');
    expect(st().seats.map((s) => s.result)).toEqual(['win', 'win']);
    expect(st().results.map((l) => [l.pid, l.back])).toEqual([
      ['a', 10 * (1 + XIDACH.payout.win)],
      ['b', 5 * (1 + XIDACH.payout.ngu_linh)],
    ]);
  });

  it('đứng xa bàn thì không rút / dằn được', () => {
    const { ctx, open, act, bet, ranks, seat, toTurn } = setup({ deck: stacked(10, 9, 10, 2, 9, 8) });
    open();
    bet('a', 10);
    toTurn();
    Object.assign(ctx.playersById.get('a')!, { x: 0, z: 30 });
    act('a', 'hit');
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', text: JOKES.tooFar });
    expect(ranks('a')).toEqual([10, 10]);
    expect(seat('a')!.done).toBe(false);
  });

  it('hết giờ lượt: ghế chưa xong tự rút tới đủ tuổi rồi dằn (người mất kết nối vẫn giữ ghế, vẫn được trả)', () => {
    const { ctx, instance, st, open, bet, ranks, seat, wallet, toTurn } = setup({ deck: stacked(10, 9, 10, 2, 9, 8, 3, 4) });
    open();
    bet('a', 10);
    bet('b', 5);
    toTurn();
    ctx.playersById.get('b')!.connected = false;
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(seat('b')).toBeDefined();
    ctx.advance(XIDACH.turnMs - 100, instance);
    expect(st().step).toBe('turn');
    ctx.advance(100, instance);
    expect(ranks('a')).toEqual([10, 2, 3, 4]);
    expect(ranks('b')).toEqual([9, 9]);
    expect(st().seats.every((s) => s.done)).toBe(true);
    expect(st().step).toBe('dealer');
    // Nhà cái 18: xét b (18 = hòa), còn a 19 hơn điểm → rút 10 = Quắc → a thắng.
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(seat('b')!.result).toBe('push');
    expect(seat('a')!.result).toBeUndefined();
    expect(st().dealer.cards).toHaveLength(3);
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(st().phase).toBe('result');
    expect(seat('a')!.result).toBe('win');
    expect(wallet('a')).toEqual([310, 130]);
    expect(wallet('b')).toEqual([200, 200]);
  });
});

describe('Xì Dách — nhà cái, trả thưởng', () => {
  it('nhà cái lật rồi rút từng lá mỗi dealerStepMs tới đủ tuổi, xét dần; trả raw + Tạp Niệm; báo chat; ván kế dọn sạch', () => {
    const { ctx, instance, st, open, act, bet, seat, wallet, toTurn, dealerRanks } = setup({ deck: stacked(10, K, 10, 9, 6, 4, 3, 5) });
    open();
    bet('a', 10);
    bet('b', 5);
    toTurn();
    act('a', 'stand');
    act('b', 'stand');
    expect(st()).toMatchObject({ step: 'dealer', dealer: { revealed: true } });
    expect(dealerRanks()).toEqual([10, 4]);
    expect(instance.isBusy!()).toBe(true);
    // 14 → rút 3 = 17 (chưa xét); xét b 16 (thua), a 19 hơn → rút 5 = 22 Quắc; a thắng.
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(dealerRanks()).toEqual([10, 4, 3]);
    expect(st().seats.map((s) => s.result)).toEqual([undefined, undefined]);
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(seat('b')!.result).toBe('lose');
    expect(dealerRanks()).toEqual([10, 4, 3, 5]);
    expect(st().phase).toBe('resolving');
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(st()).toMatchObject({ phase: 'result', step: null, endsAt: ctx.time + XIDACH.resultMs });
    expect(seat('a')!.result).toBe('win');
    expect(wallet('a')).toEqual([310, 130]);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 10, 20, 10],
      ['b', 5, 0, -5],
    ]);
    for (const pid of ['a', 'b']) expect(ctx.playersById.get(pid)!.tapNiem).toBe(CASINO.tapNiemPerRound);
    for (const rw of ctx.rewards) expect(rw.opts).toMatchObject({ raw: true, noPool: true, label: 'Xì Dách' });
    expect(ctx.chats.at(-1)).toMatch(/Xì Dách ván 1/);
    expect(instance.isBusy!()).toBe(false);
    ctx.advance(XIDACH.resultMs, instance);
    expect(st()).toMatchObject({ phase: 'betting', round: 2, step: null, seats: [], results: [], turnEndsAt: 0 });
    expect(st().dealer).toEqual({ cards: [], revealed: false });
  });

  it('xét dần: người Quắc bị xét lúc nhà cái đủ tuổi thì thua, dù sau đó nhà cái rút tiếp mà Quắc', () => {
    const { ctx, instance, st, open, act, bet, seat, wallet, toTurn } = setup({ deck: stacked(10, 10, 10, 6, 9, 7, 9, 8) });
    open();
    bet('a', 10);
    bet('b', 5);
    toTurn();
    act('a', 'hit');
    expect(seat('a')!.done).toBe(true);
    expect(xiDachRank(seat('a')!.cards)).toBe('quac');
    act('b', 'stand');
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(seat('a')!.result).toBe('lose');
    ctx.advance(XIDACH.dealerStepMs, instance);
    expect(xiDachPoints(st().dealer.cards as Card[])).toBe(25);
    expect(seat('b')!.result).toBe('win');
    expect(wallet('a')).toEqual([290, 110]);
    expect(wallet('b')).toEqual([205, 205]);
  });

  it('bộ bài xào mới mỗi ván bằng ctx.rng: lá không trùng; tiền trả khớp kết quả từng ghế', () => {
    const { ctx, instance, st, open, bet, wallet } = setup({ seed: 99 });
    Object.assign(ctx.playersById.get('a')!, { congDuc: 2000, duc: 2000 });
    open();
    for (let round = 1; round <= 4; round++) {
      const w0 = { a: wallet('a'), b: wallet('b') };
      bet('a', 10);
      bet('b', 5);
      for (let guard = 0; st().phase !== 'result' && guard < 600; guard++) ctx.advance(100, instance);
      const r = st();
      expect(r).toMatchObject({ phase: 'result', round });
      expect(r.dealer.revealed).toBe(true);
      const all = [...r.seats.flatMap((s) => s.cards), ...(r.dealer.cards as Card[])];
      expect(new Set(all.map((c) => `${c.r}${c.s}`)).size).toBe(all.length);
      for (const s of r.seats) {
        expect(s.result).toBeDefined();
        const back = xiDachPayout(s.stake, s.result!, xiDachRank(s.cards));
        const w = w0[s.pid as 'a' | 'b'];
        expect(wallet(s.pid)).toEqual([w[0]! - s.stake + back, w[1]! - s.stake + back]);
        expect(r.results.find((l) => l.pid === s.pid)).toMatchObject({ staked: s.stake, back });
      }
      ctx.advance(XIDACH.resultMs, instance);
      expect(st()).toMatchObject({ phase: 'betting', round: round + 1 });
    }
  });
});

describe('Xì Dách — rời bàn, mất kết nối, đổi map, tự nghỉ', () => {
  it('lúc đặt: mất kết nối / rời hẳn → hoàn đủ, nhường ghế; Esc giữ cược; rời hẳn sau khi chia → mất cược, ghế tự dằn, kết quả −cược', () => {
    const { ctx, instance, st, open, act, bet, seat, wallet, toTurn } = setup({ deck: stacked(10, 10, 10, 2, 9, 7, 5) });
    for (const pid of ['c', 'd']) {
      ctx.addPlayer({ pid, congDuc: 100, duc: 100 });
      ctx.placeAt(pid, 'xidach_table');
    }
    open();
    bet('c', 5);
    bet('d', 1);
    bet('a', 10);
    bet('b', 5);
    ctx.playersById.get('c')!.connected = false;
    instance.onLeave!(ctx.view('c'), 'disconnect');
    expect(wallet('c')).toEqual([100, 100]);
    instance.onLeave!(ctx.view('d'), 'left');
    expect(wallet('d')).toEqual([100, 100]);
    ctx.playersById.delete('d');
    expect(st().seats.map((s) => [s.seat, s.pid])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(wallet('a')).toEqual([290, 110]);
    toTurn();
    // a ghế 1 [10, 2], b ghế 2 [10, 9]; nhà cái [10, 7]. b rời hẳn: không hoàn, ghế giữ nguyên + dằn ngay (đủ 19).
    const paid = ctx.rewards.length;
    instance.onLeave!(ctx.view('b'), 'left');
    expect(wallet('b')).toEqual([195, 195]);
    expect(ctx.rewards).toHaveLength(paid);
    ctx.playersById.delete('b');
    expect(st().seats.map((s) => [s.seat, s.pid])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(seat('b')).toMatchObject({ cards: [{ r: 10 }, { r: 9 }], done: true });
    expect(st().step).toBe('turn');
    act('a', 'hit');
    act('a', 'stand');
    expect(st().step).toBe('dealer');
    // Nhà cái 17: xét a 17 (hòa); b 19 hơn → rút 10 = Quắc → b "thắng" nhưng đã rời phòng: không trả, ghi −5.
    ctx.advance(XIDACH.dealerStepMs * 2, instance);
    expect(st().phase).toBe('result');
    expect(st().seats.map((s) => s.result)).toEqual(['push', 'win']);
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 10, 10, 0],
      ['b', 5, 0, -5],
    ]);
    expect(ctx.rewards.filter((r) => r.pid === 'b')).toEqual([]);
    expect(ctx.chats.at(-1)).toMatch(/Bình −5/);
    expect(wallet('a')).toEqual([300, 120]);
  });

  it('người cuối cùng rời hẳn giữa lượt → mất cược; ghế tự rút tới đủ tuổi rồi dằn ngay, nhà cái vẫn lật + xét, kết quả −cược', () => {
    const { ctx, instance, st, open, bet, ranks, wallet, toTurn } = setup({ deck: stacked(10, 9, 3, 2, 5, 6) });
    open();
    bet('a', 10);
    toTurn();
    // a [10, 3] = 13 phải rút; nhà cái [9, 2] = 11.
    instance.onLeave!(ctx.view('a'), 'left');
    expect(wallet('a')).toEqual([290, 110]);
    ctx.playersById.delete('a');
    expect(ranks('a')).toEqual([10, 3, 5]);
    expect(st()).toMatchObject({ step: 'dealer', dealer: { revealed: true } });
    expect(instance.isBusy!()).toBe(true);
    // 11 → rút 6 = 17: a 18 hơn → rút 10 = Quắc → a "thắng" nhưng đã rời phòng: không trả, ghi −10.
    ctx.advance(XIDACH.dealerStepMs * 3, instance);
    expect(st().phase).toBe('result');
    expect(st().seats[0]!.result).toBe('win');
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([['a', 10, 0, -10]]);
    expect(ctx.rewards).toEqual([]);
    expect(ctx.chats.at(-1)).toMatch(/An −10/);
    expect(instance.isBusy!()).toBe(false);
  });

  it('rời hẳn lúc đang chia → mất cược; tới lượt thì ghế đó tự chơi ngay, bàn không phải chờ hết giờ', () => {
    const { ctx, instance, st, open, act, bet, ranks, seat, wallet } = setup({ deck: stacked(10, 10, 9, 9, 3, 8, 4) });
    open();
    bet('a', 10);
    bet('b', 5);
    ctx.advance(XIDACH.betMs, instance);
    expect(st().step).toBe('deal');
    instance.onLeave!(ctx.view('b'), 'left');
    expect(wallet('b')).toEqual([195, 195]);
    ctx.playersById.delete('b');
    ctx.advance(XIDACH.dealMs, instance);
    // a [10, 9] chưa dằn → vẫn lượt rút/dằn; b [10, 3] = 13 tự rút 4 = 17 rồi dằn ngay.
    expect(st().step).toBe('turn');
    expect(ranks('b')).toEqual([10, 3, 4]);
    expect(seat('b')!.done).toBe(true);
    act('a', 'stand');
    expect(st().step).toBe('dealer');
  });

  it('đổi map lúc đặt / lúc đang chơi → hoàn hết, bàn về nghỉ, hẹn giờ cũ bị hủy', () => {
    for (const started of [false, true]) {
      const { ctx, instance, st, open, bet, wallet, toTurn } = setup();
      open();
      bet('a', 10);
      bet('b', 5);
      if (started) toTurn();
      expect(st().phase).toBe(started ? 'resolving' : 'betting');
      ctx.mapId = 'temple';
      instance.onMapChange!('temple');
      expect(wallet('a')).toEqual([300, 120]);
      expect(wallet('b')).toEqual([200, 200]);
      expect(st()).toMatchObject({ phase: 'idle', step: null, endsAt: 0, seats: [], results: [], turnEndsAt: 0 });
      expect(st().dealer).toEqual({ cards: [], revealed: false });
      expect(instance.isBusy!()).toBe(false);
      ctx.advance(60_000, instance);
      expect(st().phase).toBe('idle');
      expect(ctx.wagers).toHaveLength(2);
    }
  });

  it(`nghỉ sau ${CASINO.idleRounds} ván không ai cược (ván trống không chia, không báo chat); nghỉ khi không còn ai đứng gần`, () => {
    const { ctx, instance, st, open, bet, wallet } = setup({ deck: stacked(10, 10, 9, 7) });
    open();
    ctx.advance(XIDACH.betMs * (CASINO.idleRounds - 1), instance);
    expect(st()).toMatchObject({ phase: 'betting', round: CASINO.idleRounds, seats: [] });
    ctx.advance(XIDACH.betMs, instance);
    expect(st()).toMatchObject({ phase: 'idle', round: CASINO.idleRounds, endsAt: 0 });
    expect((ctx.states as XiDachPublicState[]).some((s) => s.step === 'deal')).toBe(false);
    expect(ctx.chats.some((c) => /Xì Dách ván/.test(c))).toBe(false);
    ctx.advance(XIDACH.betMs * 2, instance);
    expect(st().phase).toBe('idle');

    // Có cược nhưng mọi người đi xa: hết giờ tự chơi, nhà cái xét, trả thưởng, rồi nghỉ.
    open();
    bet('a', 5);
    for (const pid of ['a', 'b']) Object.assign(ctx.playersById.get(pid)!, { x: 0, z: 30 });
    ctx.advance(XIDACH.betMs + XIDACH.dealMs + XIDACH.turnMs + XIDACH.dealerStepMs * 2, instance);
    expect(st().phase).toBe('result');
    expect(wallet('a')).toEqual([305, 125]);
    ctx.advance(XIDACH.resultMs, instance);
    expect(st().phase).toBe('idle');
  });

  it('nút "Mở ván" (act open) chỉ mở khi bàn nghỉ và người bấm đứng gần', () => {
    const { ctx, st, act } = setup();
    Object.assign(ctx.playersById.get('b')!, { x: 0, z: 30 });
    act('b', 'open');
    expect(st().phase).toBe('idle');
    act('a', 'open');
    expect(st()).toMatchObject({ phase: 'betting', round: 1 });
    act('a', 'open');
    expect(st().round).toBe(1);
  });
});
