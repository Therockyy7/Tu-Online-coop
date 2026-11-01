// Đường đua ngựa (Sòng Công Đức) phía server với FakeActivityContext: mở ván ở một trong hai lan can (cùng 1 bàn), đặt/gỡ
// cược Công Đức thật theo ngựa, xuất phát (kịch bản công khai), trả thưởng lúc ngựa nhất chạm đích, ngựa thắng bốc theo
// xác suất, ngữ nghĩa rời phòng / mất kết nối / đổi map (từ lúc xuất phát rời hẳn = mất cược), isBusy, tự nghỉ, lịch sử.
import { describe, expect, it } from 'vitest';
import { CASINO, DUANGUA, JOKES, SONG_BAC } from '@shared/index';
import { raceReturn, raceWinner, type DuaNguaPublicState } from '@shared/activities/duangua';
import { duaNguaModule } from '../../src/activities/duangua';
import { mountActivity } from '../helpers/fakeContext';

const ROUND_MS = DUANGUA.betMs + DUANGUA.raceMs + DUANGUA.resultMs;

function setup(seed = 7) {
  const { ctx, instance } = mountActivity(duaNguaModule, seed);
  ctx.addPlayer({ pid: 'a', name: 'An', congDuc: 300, duc: 120 });
  ctx.addPlayer({ pid: 'b', name: 'Bình', congDuc: 200, duc: 200 });
  ctx.placeAt('a', 'race_rail_1');
  ctx.placeAt('b', 'race_rail_2');
  const st = () => ctx.lastState<DuaNguaPublicState>();
  const open = (pid = 'a', rail = 'race_rail_1') => instance.onInteract!(ctx.view(pid), ctx.station(rail));
  const bet = (pid: string, horse: unknown, amount: unknown) => instance.onAction!(ctx.view(pid), 'bet', { horse, amount });
  const unbet = (pid: string, horse: unknown, amount: unknown) => instance.onAction!(ctx.view(pid), 'unbet', { horse, amount });
  const wallet = (pid: string) => {
    const p = ctx.playersById.get(pid)!;
    return [p.congDuc, p.duc];
  };
  return { ctx, instance, st, open, bet, unbet, wallet };
}

describe('Đua Ngựa — mở ván, đặt / gỡ cược', () => {
  it('E ở lan can nào cũng mở cùng một bàn; ván mới có 6 tỉ lệ, chưa có kịch bản; đặt/gỡ trừ/hoàn cả Công Đức lẫn Đức', () => {
    const { ctx, instance, st, open, bet, unbet, wallet } = setup();
    expect(st()).toMatchObject({ phase: 'idle', race: null, winner: null, odds: [] });
    open('b', 'race_rail_2');
    expect(st()).toMatchObject({ phase: 'betting', round: 1, endsAt: ctx.time + DUANGUA.betMs, race: null, winner: null });
    expect(st().odds).toHaveLength(DUANGUA.horses);
    expect(st().probs).toHaveLength(DUANGUA.horses);
    expect(ctx.chats.at(-1)).toMatch(/Bình mở đường đua/);
    expect(instance.isBusy!()).toBe(false);
    bet('a', 0, 10);
    bet('a', 0, 5);
    bet('a', 3, 1);
    bet('b', 5, 5);
    expect(wallet('a')).toEqual([284, 104]);
    expect(wallet('b')).toEqual([195, 195]);
    expect(instance.isBusy!()).toBe(true);
    unbet('a', 0, 5);
    expect(wallet('a')).toEqual([289, 109]);
    expect(st().bets).toEqual({ a: { horse_0: 10, horse_3: 1 }, b: { horse_5: 5 } });
    expect(st().names).toEqual({ a: 'An', b: 'Bình' });
    expect(ctx.wagers.map((w) => w.amount)).toEqual([10, 5, 1, 5]);
    // E lần nữa (ở lan can kia) lúc bàn đang chạy không mở ván mới.
    open('a', 'race_rail_1');
    expect(st().round).toBe(1);
    unbet('a', 0, 10);
    unbet('a', 3, 1);
    unbet('b', 5, 5);
    expect(wallet('a')).toEqual([300, 120]);
    expect(wallet('b')).toEqual([200, 200]);
    expect(instance.isBusy!()).toBe(false);
  });

  it('ngựa lạ / mệnh giá lạ bị bỏ qua; thiếu Đức, vượt trần, đứng xa cả hai lan can bị từ chối kèm toast', () => {
    const { ctx, st, open, bet, wallet } = setup();
    ctx.addPlayer({ pid: 'c', congDuc: 300, duc: 4 });
    ctx.placeAt('c', 'race_rail_1');
    open();
    for (const [h, amt] of [
      [6, 5],
      [-1, 5],
      [1.5, 5],
      ['0', 5],
      [2, 3],
      [2, -10],
    ] as const) {
      bet('a', h, amt);
    }
    expect(ctx.wagers).toHaveLength(0);
    bet('c', 1, 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'c', tone: 'warn' });
    expect(ctx.toasts.at(-1)!.text).toMatch(/Cần đủ Đức/);
    expect(wallet('c')).toEqual([300, 4]);
    bet('a', 0, 50);
    bet('a', 1, 50);
    bet('a', 2, 1);
    expect(ctx.toasts.at(-1)!.text).toMatch(new RegExp(`Tối đa ${CASINO.maxBetPerRound}`));
    expect(wallet('a')).toEqual([200, 20]);
    // Giữa hai lan can (cách mỗi trạm 4 m > r + dung sai) thì không đặt được; vừa trong tầm lan can 2 thì được.
    const s = ctx.station('race_rail_2');
    const pb = ctx.playersById.get('b')!;
    Object.assign(pb, { x: SONG_BAC.race.x, z: SONG_BAC.race.railZ });
    bet('b', 4, 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b', text: JOKES.tooFar });
    expect(wallet('b')).toEqual([200, 200]);
    Object.assign(pb, { x: s.x, z: s.z + s.r + CASINO.nearSlack - 0.1 });
    bet('b', 4, 5);
    expect(wallet('b')).toEqual([195, 195]);
    expect(st().bets.b).toEqual({ horse_4: 5 });
  });
});

describe('Đua Ngựa — xuất phát, về đích, trả thưởng', () => {
  it('hết giờ đặt → xuất phát (chuông, kịch bản công khai) → raceMs sau trả đúng raceReturn + Tạp Niệm → ván kế', () => {
    const { ctx, instance, st, open, bet, unbet, wallet } = setup();
    open();
    const odds = [...st().odds];
    bet('a', 0, 10);
    bet('a', 2, 5);
    bet('b', 4, 10);
    ctx.advance(DUANGUA.betMs, instance);
    const r = st();
    expect(r.phase).toBe('resolving');
    expect(r.race).not.toBeNull();
    expect(r.race!.startAt).toBe(ctx.time);
    expect(r.endsAt).toBe(ctx.time + DUANGUA.raceMs);
    expect(r.winner).toBeNull();
    expect(r.odds).toEqual(odds);
    expect(r.race!.curves).toHaveLength(DUANGUA.horses);
    expect(r.race!.finish[raceWinner(r.race!)]).toBe(DUANGUA.raceMs);
    expect(ctx.fxs.some((f) => f.msg.type === 'sound' && f.msg.id === 'race_bell')).toBe(true);
    // Đã xuất phát: không đặt thêm, không gỡ được nữa.
    bet('a', 1, 5);
    unbet('a', 0, 10);
    expect(wallet('a')).toEqual([285, 105]);
    expect(instance.isBusy!()).toBe(true);

    const w = raceWinner(r.race!);
    ctx.advance(DUANGUA.raceMs, instance);
    const res = st();
    expect(res).toMatchObject({ phase: 'result', winner: w, endsAt: ctx.time + DUANGUA.resultMs });
    expect(res.race).toEqual(r.race);
    const backA = raceReturn({ horse_0: 10, horse_2: 5 }, w, odds);
    const backB = raceReturn({ horse_4: 10 }, w, odds);
    expect(wallet('a')).toEqual([285 + backA, 105 + backA]);
    expect(wallet('b')).toEqual([190 + backB, 190 + backB]);
    expect(res.results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 15, backA, backA - 15],
      ['b', 10, backB, backB - 10],
    ]);
    expect(res.bets).toEqual({ a: { horse_0: 10, horse_2: 5 }, b: { horse_4: 10 } });
    expect(res.history).toEqual([{ round: 1, winner: w, odds: odds[w] }]);
    for (const pid of ['a', 'b']) expect(ctx.playersById.get(pid)!.tapNiem).toBe(CASINO.tapNiemPerRound);
    for (const rw of ctx.rewards) expect(rw.opts).toMatchObject({ raw: true, noPool: true, label: 'Đua Ngựa' });
    expect(ctx.chats.at(-1)).toMatch(/Đua Ngựa ván 1/);
    expect(instance.isBusy!()).toBe(false);

    ctx.advance(DUANGUA.resultMs, instance);
    expect(st()).toMatchObject({ phase: 'betting', round: 2, race: null, winner: null, bets: {}, results: [] });
    expect(st().odds).toHaveLength(DUANGUA.horses);
    expect(st().history).toHaveLength(1);
  });
});

describe('Đua Ngựa — ngựa thắng bốc theo xác suất', () => {
  it('400 ván seed cố định: số lần ngựa ưa chuộng nhất thắng khớp Σ p (sai lệch < 4σ), ngựa nào cũng có lúc thắng', () => {
    const { ctx, instance, st, open, bet } = setup(2026);
    Object.assign(ctx.playersById.get('a')!, { congDuc: 100_000, duc: 100_000 });
    open();
    let expected = 0;
    let variance = 0;
    let favWins = 0;
    const wins = new Array<number>(DUANGUA.horses).fill(0);
    for (let i = 0; i < 400; i++) {
      const probs = st().probs;
      const fav = probs.indexOf(Math.max(...probs));
      expected += probs[fav]!;
      variance += probs[fav]! * (1 - probs[fav]!);
      bet('a', 0, 1);
      ctx.advance(DUANGUA.betMs + DUANGUA.raceMs, instance);
      const w = st().winner!;
      wins[w]!++;
      if (w === fav) favWins++;
      ctx.advance(DUANGUA.resultMs, instance);
    }
    expect(Math.abs(favWins - expected)).toBeLessThan(4 * Math.sqrt(variance));
    expect(favWins).toBeGreaterThan(400 / DUANGUA.horses);
    for (const n of wins) expect(n).toBeGreaterThan(0);
  });
});

describe('Đua Ngựa — rời bàn, mất kết nối, đổi map', () => {
  it('lúc đặt: mất kết nối / rời phòng → hoàn, Esc giữ cược; từ lúc xuất phát: mất kết nối giữ + vẫn trả, rời hẳn = mất cược', () => {
    const { ctx, instance, st, open, bet, wallet } = setup();
    ctx.addPlayer({ pid: 'c', name: 'Cúc', congDuc: 100, duc: 100 });
    ctx.addPlayer({ pid: 'd', name: 'Dũng', congDuc: 100, duc: 100 });
    ctx.placeAt('c', 'race_rail_1');
    ctx.placeAt('d', 'race_rail_2');
    open();
    bet('a', 0, 10);
    bet('d', 1, 10);
    for (let h = 0; h < DUANGUA.horses; h++) bet('b', h, 5);
    for (let h = 0; h < DUANGUA.horses; h++) bet('c', h, 5);
    ctx.playersById.get('a')!.connected = false;
    instance.onLeave!(ctx.view('a'), 'disconnect');
    expect(wallet('a')).toEqual([300, 120]);
    expect(st().bets.a).toBeUndefined();
    instance.onLeave!(ctx.view('d'), 'left');
    expect(wallet('d')).toEqual([100, 100]);
    expect(st().bets.d).toBeUndefined();
    ctx.playersById.delete('d');
    instance.onLeave!(ctx.view('c'), 'esc');
    expect(wallet('c')).toEqual([70, 70]);

    ctx.advance(DUANGUA.betMs, instance);
    const race = st().race!;
    const w = raceWinner(race);
    ctx.playersById.get('b')!.connected = false;
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(wallet('b')).toEqual([170, 170]);
    // Rời hẳn khi kịch bản (lộ ngựa thắng) đã công khai: không hoàn, settle bỏ qua người vắng → mất cược dù có cược ngựa thắng.
    instance.onLeave!(ctx.view('c'), 'left');
    expect(wallet('c')).toEqual([70, 70]);
    const gone = ctx.playersById.get('c')!;
    ctx.playersById.delete('c');
    const rewardsBefore = ctx.rewards.length;

    ctx.advance(DUANGUA.raceMs, instance);
    const odds = st().odds;
    const backB = raceReturn({ horse_0: 5, horse_1: 5, horse_2: 5, horse_3: 5, horse_4: 5, horse_5: 5 }, w, odds);
    expect(backB).toBeGreaterThan(0);
    expect(wallet('b')).toEqual([170 + backB, 170 + backB]);
    expect(gone.congDuc).toBe(70);
    expect(ctx.rewards.slice(rewardsBefore).map((r) => r.pid)).toEqual(['b']);
    expect(st().results.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['b', 30, backB, backB - 30],
      ['c', 30, 0, -30],
    ]);
  });

  it('đổi map lúc đặt hoặc lúc đua → hoàn hết, bàn về nghỉ, hẹn giờ cũ bị hủy', () => {
    for (const racing of [false, true]) {
      const { ctx, instance, st, open, bet, wallet } = setup();
      open();
      bet('a', 0, 10);
      bet('b', 5, 5);
      if (racing) ctx.advance(DUANGUA.betMs, instance);
      expect(st().phase).toBe(racing ? 'resolving' : 'betting');
      ctx.mapId = 'temple';
      instance.onMapChange!('temple');
      expect(wallet('a')).toEqual([300, 120]);
      expect(wallet('b')).toEqual([200, 200]);
      expect(st()).toMatchObject({ phase: 'idle', endsAt: 0, bets: {}, race: null, winner: null, odds: [], results: [] });
      expect(instance.isBusy!()).toBe(false);
      ctx.advance(ROUND_MS * 2, instance);
      expect(st().phase).toBe('idle');
      expect(ctx.wagers).toHaveLength(2);
    }
  });
});

describe('Đua Ngựa — tự nghỉ, mở lại, lịch sử', () => {
  it(`nghỉ sau ${CASINO.idleRounds} ván không ai cược (vẫn đua, vào lịch sử, không báo chat); nghỉ khi không còn ai đứng gần`, () => {
    const { ctx, instance, st, open, bet, wallet } = setup();
    open();
    ctx.advance(ROUND_MS * (CASINO.idleRounds - 1), instance);
    expect(st()).toMatchObject({ phase: 'betting', round: CASINO.idleRounds });
    ctx.advance(ROUND_MS, instance);
    expect(st()).toMatchObject({ phase: 'idle', round: CASINO.idleRounds, endsAt: 0, race: null });
    expect(st().history).toHaveLength(CASINO.idleRounds);
    expect(ctx.chats.some((c) => /Đua Ngựa ván/.test(c))).toBe(false);
    ctx.advance(ROUND_MS, instance);
    expect(st().phase).toBe('idle');

    open('b', 'race_rail_2');
    bet('a', 2, 5);
    for (const pid of ['a', 'b']) Object.assign(ctx.playersById.get(pid)!, { x: 0, z: 30 });
    ctx.advance(DUANGUA.betMs + DUANGUA.raceMs, instance);
    expect(st().phase).toBe('result');
    expect(wallet('a')[0]).toBe(295 + raceReturn({ horse_2: 5 }, st().winner!, st().odds));
    ctx.advance(DUANGUA.resultMs, instance);
    expect(st().phase).toBe('idle');
  });

  it('nút "Mở ván" trên bảng (act open) chỉ mở khi bàn nghỉ và người bấm đứng gần một trong hai lan can', () => {
    const { ctx, instance, st } = setup();
    Object.assign(ctx.playersById.get('a')!, { x: 0, z: 30 });
    instance.onAction!(ctx.view('a'), 'open', undefined);
    expect(st().phase).toBe('idle');
    instance.onAction!(ctx.view('b'), 'open', undefined);
    expect(st()).toMatchObject({ phase: 'betting', round: 1 });
    instance.onAction!(ctx.view('b'), 'open', undefined);
    expect(st().round).toBe(1);
  });

  it(`lịch sử giữ tối đa ${DUANGUA.history} ván gần nhất (cũ → mới), kèm tỉ lệ của ngựa về nhất`, () => {
    const { ctx, instance, st, open, bet } = setup();
    Object.assign(ctx.playersById.get('a')!, { congDuc: 5000, duc: 5000 });
    open();
    const seen: { round: number; winner: number; odds: number }[] = [];
    for (let i = 0; i < DUANGUA.history + 3; i++) {
      bet('a', i % DUANGUA.horses, 1);
      ctx.advance(DUANGUA.betMs + DUANGUA.raceMs, instance);
      const s = st();
      seen.push({ round: s.round, winner: s.winner!, odds: s.odds[s.winner!]! });
      ctx.advance(DUANGUA.resultMs, instance);
    }
    expect(st().history).toEqual(seen.slice(-DUANGUA.history));
  });
});
