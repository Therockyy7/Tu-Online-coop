// Bàn Bài Cào 3 lá (Sòng Công Đức) phía server với FakeActivityContext: mở ván, đặt/gỡ cược Công Đức thật (ô 'hand'),
// không giới hạn số người, hết giờ đặt chia 3 lá mỗi tay + nhà cái, lật dần BAICAO.revealMs rồi trả thưởng (Ba Tiên ×2,
// bù gặp bù nhà cái ăn, bằng nút so lá lớn nhất); rời bàn lúc đặt → hoàn, đã chia mà rời hẳn phòng → mất cược, mất kết
// nối → giữ; đổi map → hoàn hết; isBusy; tự nghỉ.
import { describe, expect, it } from 'vitest';
import { BAICAO, CASINO, JOKES } from '@shared/index';
import type { Card, Suit } from '@shared/activities/cards';
import { baiCaoFlipAt, baiCaoReturn, baiCaoScore, compareBaiCao, type BaiCaoPublicState } from '@shared/activities/baicao';
import { baiCaoModule, createBaiCao } from '../../src/activities/baicao';
import type { ActivityServerModule } from '../../src/activities/types';
import { mountActivity } from '../helpers/fakeContext';

const SUITS: Suit[] = ['bich', 'co', 'ro', 'chuon'];
const cards = (...ranks: number[]): Card[] => ranks.map((r, i) => ({ r, s: SUITS[i % 4]! }));
const A = 1;
const J = 11;
const Q = 12;
const K = 13;

/**
 * Các bộ bài xếp sẵn, mỗi ván lấy 1 bộ (theo thứ tự). Thứ tự chia: 3 vòng, mỗi vòng tay 1..n (theo thứ tự đặt cược) rồi
 * nhà cái. Đệm thêm lá 2 phía sau cho đủ.
 */
const decks = (...lists: number[][]) => {
  let i = 0;
  return (): Card[] => cards(...(lists[i++] ?? []), ...Array<number>(40).fill(2));
};

function setup(opts: { deck?: () => Card[]; seed?: number } = {}) {
  const deck = opts.deck;
  const mod: ActivityServerModule = deck ? { ...baiCaoModule, create: (c) => createBaiCao(c, deck) } : baiCaoModule;
  const { ctx, instance } = mountActivity(mod, opts.seed ?? 7);
  ctx.addPlayer({ pid: 'a', name: 'An', congDuc: 300, duc: 120 });
  ctx.addPlayer({ pid: 'b', name: 'Bình', congDuc: 200, duc: 200 });
  ctx.placeAt('a', 'baicao_table');
  ctx.placeAt('b', 'baicao_table');
  const st = () => ctx.lastState<BaiCaoPublicState>();
  const open = (pid = 'a') => instance.onInteract!(ctx.view(pid), ctx.station('baicao_table'));
  const act = (pid: string, type: string, data?: unknown) => instance.onAction!(ctx.view(pid), type, data);
  const bet = (pid: string, amount: number) => act(pid, 'bet', { amount });
  const unbet = (pid: string, amount: number) => act(pid, 'unbet', { amount });
  const wallet = (pid: string) => {
    const p = ctx.playersById.get(pid)!;
    return [p.congDuc, p.duc];
  };
  const hand = (pid: string) => st().hands.find((x) => x.pid === pid);
  const ranks = (pid: string) => hand(pid)!.cards.map((c) => c.r);
  const join = (pid: string, congDuc = 100) => {
    ctx.addPlayer({ pid, congDuc, duc: congDuc });
    ctx.placeAt(pid, 'baicao_table');
  };
  return { ctx, instance, st, open, act, bet, unbet, wallet, hand, ranks, join };
}

describe('Bài Cào — đặt / gỡ cược', () => {
  it('bấm E mở ván; đặt/gỡ trừ/hoàn cả Công Đức lẫn Đức; tay theo thứ tự đặt cược, không giới hạn số người', () => {
    const { ctx, instance, st, open, bet, unbet, wallet, join } = setup();
    for (const pid of ['c', 'd', 'e', 'f', 'g', 'h']) join(pid);
    expect(st().phase).toBe('idle');
    open();
    expect(st()).toMatchObject({ phase: 'betting', round: 1, endsAt: ctx.time + BAICAO.betMs, dealAt: 0, revealAt: 0, hands: [], dealer: [] });
    expect(ctx.chats.at(-1)).toMatch(/An mở bàn Bài Cào/);
    expect(instance.isBusy!()).toBe(false);
    bet('b', 5);
    bet('a', 10);
    bet('a', 1);
    expect(wallet('a')).toEqual([289, 109]);
    expect(instance.isBusy!()).toBe(true);
    for (const pid of ['c', 'd', 'e', 'f', 'g', 'h']) bet(pid, 5);
    // 8 người — quá 6 tay bày 3D vẫn vào bàn bình thường.
    expect(st().hands.map((x) => [x.seat, x.pid, x.stake])).toEqual([
      [1, 'b', 5],
      [2, 'a', 11],
      [3, 'c', 5],
      [4, 'd', 5],
      [5, 'e', 5],
      [6, 'f', 5],
      [7, 'g', 5],
      [8, 'h', 5],
    ]);
    expect(st().hands[1]).toMatchObject({ name: 'An', cards: [], score: -1 });
    expect(st().hands[1]!.result).toBeUndefined();
    // Gỡ hết thì rời bàn; số tay đánh lại.
    unbet('c', 5);
    expect(wallet('c')).toEqual([100, 100]);
    expect(st().hands.map((x) => [x.seat, x.pid])).toEqual([
      [1, 'b'],
      [2, 'a'],
      [3, 'd'],
      [4, 'e'],
      [5, 'f'],
      [6, 'g'],
      [7, 'h'],
    ]);
    unbet('a', 1);
    expect(wallet('a')).toEqual([290, 110]);
    expect(ctx.wagers.map((w) => w.amount)).toEqual([5, 10, 1, 5, 5, 5, 5, 5, 5]);
    // E lần nữa lúc bàn đang chạy không mở ván mới.
    open('b');
    expect(st().round).toBe(1);
  });

  it('mệnh giá ngoài phỉnh bị bỏ qua; thiếu Đức, vượt trần, đứng xa, ngoài giờ đặt bị từ chối kèm toast', () => {
    const { ctx, instance, st, open, act, bet, unbet, wallet } = setup();
    ctx.addPlayer({ pid: 'c', congDuc: 300, duc: 4 });
    ctx.placeAt('c', 'baicao_table');
    bet('a', 5);
    expect(ctx.wagers).toHaveLength(0);
    open();
    bet('a', 3);
    bet('a', -10);
    act('a', 'bet', { amount: '5' });
    act('a', 'bet', null);
    act('a', 'unbet', { amount: 7 });
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
    const s = ctx.station('baicao_table');
    const pb = ctx.playersById.get('b')!;
    pb.z = s.z - s.r - CASINO.nearSlack - 0.3;
    bet('b', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b', text: JOKES.tooFar });
    expect(wallet('b')).toEqual([200, 200]);
    pb.z = s.z - s.r - CASINO.nearSlack + 0.1;
    bet('b', 5);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().hands.map((x) => x.pid)).toEqual(['a', 'b']);
    ctx.advance(BAICAO.betMs, instance);
    bet('b', 5);
    expect(ctx.toasts.at(-1)!.text).toMatch(/Ngoài giờ đặt cược/);
    unbet('b', 5);
    expect(ctx.toasts.at(-1)!.text).toMatch(/không gỡ cược/);
    expect(wallet('b')).toEqual([195, 195]);
  });
});

describe('Bài Cào — chia, lật dần, trả thưởng', () => {
  it('hết giờ đặt → chia 3 lá theo vòng (tay 1..n rồi nhà cái), đủ mặt trong trạng thái; lật dần revealMs → trả đúng', () => {
    // An [A, 8, K] = 9 nút · Bình [7, 8, 9] = 4 nút · nhà cái [5, 2, Q] = 7 nút.
    const { ctx, instance, st, open, bet, unbet, wallet, hand, ranks } = setup({ deck: decks([A, 7, 5, 8, 8, 2, K, 9, Q]) });
    open();
    bet('a', 10);
    bet('b', 5);
    ctx.advance(BAICAO.betMs, instance);
    const d = st();
    expect(d).toMatchObject({
      phase: 'resolving',
      round: 1,
      dealAt: ctx.time,
      revealAt: baiCaoFlipAt(ctx.time, 0),
      endsAt: ctx.time + BAICAO.revealMs,
      results: [],
    });
    expect(ranks('a')).toEqual([A, 8, K]);
    expect(ranks('b')).toEqual([7, 8, 9]);
    expect(d.dealer.map((c) => c.r)).toEqual([5, 2, Q]);
    expect([hand('a')!.score, hand('b')!.score]).toEqual([9, 4]);
    expect(d.hands.every((x) => x.result === undefined)).toBe(true);
    expect(instance.isBusy!()).toBe(true);
    unbet('a', 10);
    expect(ctx.toasts.at(-1)!.text).toMatch(/Đã chia bài/);
    expect(wallet('a')).toEqual([290, 110]);
    ctx.advance(BAICAO.revealMs - 1, instance);
    expect(st().phase).toBe('resolving');
    ctx.advance(1, instance);
    expect(st()).toMatchObject({ phase: 'result', endsAt: ctx.time + BAICAO.resultMs });
    expect([hand('a')!.result, hand('b')!.result]).toEqual(['win', 'lose']);
    expect(wallet('a')).toEqual([310, 130]);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 10, 20, 10],
      ['b', 5, 0, -5],
    ]);
    for (const pid of ['a', 'b']) expect(ctx.playersById.get(pid)!.tapNiem).toBe(CASINO.tapNiemPerRound);
    for (const rw of ctx.rewards) expect(rw.opts).toMatchObject({ raw: true, noPool: true, label: 'Bài Cào' });
    expect(ctx.chats.at(-1)).toMatch(/Bài Cào ván 1: nhà cái 7 nút — An \+10 · Bình −5/);
    expect(instance.isBusy!()).toBe(false);
    ctx.advance(BAICAO.resultMs, instance);
    expect(st()).toMatchObject({ phase: 'betting', round: 2, dealAt: 0, revealAt: 0, hands: [], dealer: [], results: [] });
  });

  it('Ba Tiên thắng ăn ×2; bù gặp bù nhà cái ăn; bằng nút so lá lớn nhất, cùng hạng thì nhà cái ăn', () => {
    const { ctx, instance, open, bet, wallet, hand, join } = setup({
      deck: decks(
        // Ván 1 — An [J, Q, K] Ba Tiên · Bình [K, Q, 10] bù · Chi [A, 10, 10] 1 nút · nhà cái [5, 5, 10] bù.
        [J, K, A, 5, Q, Q, 10, 5, K, 10, 10, 10],
        // Ván 2 — cùng 7 nút: An [K, 5, 2] · Bình [Q, 4, 3] · Chi [J, 4, 3] · nhà cái [Q, 3, 4].
        [K, Q, J, Q, 5, 4, 4, 3, 2, 3, 3, 4],
      ),
    });
    join('c');
    open();
    for (const pid of ['a', 'b', 'c']) bet(pid, 10);
    ctx.advance(BAICAO.betMs + BAICAO.revealMs, instance);
    expect(['a', 'b', 'c'].map((pid) => hand(pid)!.result)).toEqual(['win', 'lose', 'win']);
    expect(wallet('a')).toEqual([320, 140]);
    expect(wallet('b')).toEqual([190, 190]);
    expect(wallet('c')).toEqual([110, 110]);
    ctx.advance(BAICAO.resultMs, instance);
    for (const pid of ['a', 'b', 'c']) bet(pid, 10);
    ctx.advance(BAICAO.betMs + BAICAO.revealMs, instance);
    expect(['a', 'b', 'c'].map((pid) => hand(pid)!.score)).toEqual([7, 7, 7]);
    expect(['a', 'b', 'c'].map((pid) => hand(pid)!.result)).toEqual(['win', 'lose', 'lose']);
    expect(wallet('a')).toEqual([330, 150]);
    expect(wallet('b')).toEqual([180, 180]);
    expect(wallet('c')).toEqual([100, 100]);
  });

  it('bộ bài xào mới mỗi ván bằng ctx.rng: 3 lá mỗi tay, không trùng lá; tiền trả khớp baiCaoReturn', () => {
    const { ctx, instance, st, open, bet, wallet } = setup({ seed: 99 });
    Object.assign(ctx.playersById.get('a')!, { congDuc: 2000, duc: 2000 });
    open();
    for (let round = 1; round <= 5; round++) {
      const w0 = { a: wallet('a'), b: wallet('b') };
      bet('a', 10);
      bet('b', 5);
      ctx.advance(BAICAO.betMs + BAICAO.revealMs, instance);
      const r = st();
      expect(r).toMatchObject({ phase: 'result', round });
      const all = [...r.hands.flatMap((x) => x.cards), ...r.dealer];
      expect(all).toHaveLength(9);
      expect(new Set(all.map((c) => `${c.r}${c.s}`)).size).toBe(9);
      for (const x of r.hands) {
        expect(x.score).toBe(baiCaoScore(x.cards));
        expect(x.result).toBe(compareBaiCao(x.cards, r.dealer));
        const back = baiCaoReturn(x.stake, x.cards, r.dealer);
        const w = w0[x.pid as 'a' | 'b'];
        expect(wallet(x.pid)).toEqual([w[0]! - x.stake + back, w[1]! - x.stake + back]);
        expect(r.results.find((l) => l.pid === x.pid)).toMatchObject({ staked: x.stake, back });
      }
      ctx.advance(BAICAO.resultMs, instance);
      expect(st()).toMatchObject({ phase: 'betting', round: round + 1 });
    }
  });
});

describe('Bài Cào — rời bàn, mất kết nối, đổi map, tự nghỉ', () => {
  it('lúc đặt: mất kết nối / rời phòng → hoàn, bỏ tay; Esc chỉ đóng bảng, cược giữ nguyên', () => {
    const { ctx, instance, st, open, bet, wallet, join } = setup();
    join('c');
    open();
    bet('c', 5);
    bet('a', 10);
    bet('b', 5);
    ctx.playersById.get('c')!.connected = false;
    instance.onLeave!(ctx.view('c'), 'disconnect');
    expect(wallet('c')).toEqual([100, 100]);
    instance.onLeave!(ctx.view('b'), 'left');
    expect(wallet('b')).toEqual([200, 200]);
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(wallet('a')).toEqual([290, 110]);
    expect(st().hands.map((x) => [x.seat, x.pid, x.stake])).toEqual([[1, 'a', 10]]);
  });

  it('đã chia (bài đã lộ): rời hẳn phòng → không hoàn, mất cược dù tay thắng; mất kết nối → giữ, trả như thường', () => {
    // An [A, 8, K] 9 nút · Bình [K, 5, 3] 8 nút · nhà cái [2, 2, 2] 6 nút — cả hai đều thắng.
    const { ctx, instance, st, open, bet, wallet, hand } = setup({ deck: decks([A, K, 2, 8, 5, 2, K, 3, 2]) });
    open();
    bet('a', 10);
    bet('b', 5);
    ctx.advance(BAICAO.betMs, instance);
    expect(st().phase).toBe('resolving');
    instance.onLeave!(ctx.view('a'), 'left');
    expect(wallet('a')).toEqual([290, 110]);
    ctx.playersById.delete('a');
    ctx.playersById.get('b')!.connected = false;
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(instance.isBusy!()).toBe(true);
    ctx.advance(BAICAO.revealMs, instance);
    expect(st().phase).toBe('result');
    expect(hand('a')!.result).toBe('win');
    expect(hand('b')!.result).toBe('win');
    expect(wallet('b')).toEqual([205, 205]);
    // Người đã rời phòng: không được trả, dòng kết quả ghi đúng là mất cược.
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 10, 0, -10],
      ['b', 5, 10, 5],
    ]);
    expect(ctx.rewards.every((rw) => rw.pid === 'b')).toBe(true);
    expect(instance.isBusy!()).toBe(false);
  });

  it('đổi map lúc đặt / lúc chia → hoàn hết, bàn về nghỉ, hẹn giờ cũ bị hủy', () => {
    for (const dealt of [false, true]) {
      const { ctx, instance, st, open, bet, wallet } = setup();
      open();
      bet('a', 10);
      bet('b', 5);
      if (dealt) ctx.advance(BAICAO.betMs, instance);
      expect(st().phase).toBe(dealt ? 'resolving' : 'betting');
      ctx.mapId = 'temple';
      instance.onMapChange!('temple');
      expect(wallet('a')).toEqual([300, 120]);
      expect(wallet('b')).toEqual([200, 200]);
      expect(st()).toMatchObject({ phase: 'idle', endsAt: 0, dealAt: 0, revealAt: 0, hands: [], dealer: [], results: [] });
      expect(instance.isBusy!()).toBe(false);
      ctx.advance(60_000, instance);
      expect(st().phase).toBe('idle');
      expect(ctx.wagers).toHaveLength(2);
    }
  });

  it(`nghỉ sau ${CASINO.idleRounds} ván không ai cược (ván trống không chia, không báo chat); nghỉ khi không còn ai đứng gần`, () => {
    const { ctx, instance, st, open, bet, wallet } = setup({ deck: decks([K, Q, 2, 2, 2, 5]) });
    open();
    ctx.advance(BAICAO.betMs * (CASINO.idleRounds - 1), instance);
    expect(st()).toMatchObject({ phase: 'betting', round: CASINO.idleRounds, hands: [] });
    ctx.advance(BAICAO.betMs, instance);
    expect(st()).toMatchObject({ phase: 'idle', round: CASINO.idleRounds, endsAt: 0 });
    expect((ctx.states as BaiCaoPublicState[]).some((s) => s.phase === 'resolving')).toBe(false);
    expect(ctx.chats.some((c) => /Bài Cào ván/.test(c))).toBe(false);
    ctx.advance(BAICAO.betMs * 2, instance);
    expect(st().phase).toBe('idle');

    // Có cược nhưng mọi người đi xa: vẫn chia, trả thưởng, rồi nghỉ. An [K, 2, 2] 4 nút thua nhà cái [Q, 2, 5] 7 nút.
    open();
    bet('a', 5);
    for (const pid of ['a', 'b']) Object.assign(ctx.playersById.get(pid)!, { x: 0, z: 30 });
    ctx.advance(BAICAO.betMs + BAICAO.revealMs, instance);
    expect(st().phase).toBe('result');
    expect(wallet('a')).toEqual([295, 115]);
    ctx.advance(BAICAO.resultMs, instance);
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
