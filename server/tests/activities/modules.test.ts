// Kịch bản chính của các module hoạt động phía server, chạy với FakeActivityContext (đồng hồ + hẹn giờ giả).
import { describe, expect, it } from 'vitest';
import { BAUCUA, BELL, CEREMONY, CHANT, COOK, DANCE, EXCHANGE, MIXOLOGY, SWEEP, WATER, findStation } from '@shared/index';
import type { BauCuaState } from '@shared/activities/bar';
import { ceremonyLayout, ceremonySlots, type CeremonyPublicState } from '@shared/activities/ceremony';
import type { CookPublicState } from '@shared/activities/cook';
import { CHANT_KHANH, chantChart, chantFinalizeAt, type ChantPublicState } from '@shared/activities/coop';
import type { DancePublicState } from '@shared/activities/dance';
import type { MixPublicState } from '@shared/activities/mixology';
import type { SweepPublicState } from '@shared/activities/temple';
import { bauCuaModule, drinkModule, exchangeModule } from '../../src/activities/barUtils';
import { ceremonyModule } from '../../src/activities/ceremony';
import { cookModule } from '../../src/activities/cook';
import { bellModule, chantModule } from '../../src/activities/coop';
import { danceModule } from '../../src/activities/dance';
import { mixologyModule } from '../../src/activities/mixology';
import { releaseModule, sweepModule, waterModule } from '../../src/activities/templePersonal';
import { mountActivity } from '../helpers/fakeContext';

describe('Thi nhảy', () => {
  it('DJ mở vòng, người chơi tham gia, ô nhịp không gửi bị tính trượt, cuối vòng thưởng Xu và người nhất làm DJ', () => {
    const { ctx, instance } = mountActivity(danceModule);
    ctx.mapId = 'bar';
    ctx.shared.set('dj_track', 0);
    ctx.shared.set('dj_started_at', ctx.time);
    ctx.addPlayer({ pid: 'dj', isHost: true });
    ctx.addPlayer({ pid: 'b' });
    const floor = ctx.station('dance_floor');
    instance.onInteract!(ctx.view('dj'), floor);
    instance.onInteract!(ctx.view('dj'), floor);
    instance.onInteract!(ctx.view('b'), floor);
    expect(ctx.lastState<DancePublicState>().players).toHaveLength(2);
    ctx.advance(DANCE.lobbyMs + 100, instance);
    const st = ctx.lastState<DancePublicState>();
    expect(st.phase).toBe('playing');
    const measureMs = (60_000 / st.bpm) * 4;
    const beat4 = st.startAt + DANCE.introMeasures * measureMs + measureMs * 0.75;
    ctx.time = Math.max(ctx.time, Math.ceil(beat4) + 10);
    instance.onAction!(ctx.view('dj'), 'measure', { i: DANCE.introMeasures, ok: true, t: beat4 });
    ctx.advance(DANCE.measures * measureMs + 2000, instance);
    const end = ctx.lastState<DancePublicState>();
    expect(end.phase).toBe('result');
    expect(end.results[0]!.pid).toBe('dj');
    expect(ctx.playersById.get('dj')!.xu).toBe(DANCE.rewards[0]);
    expect(ctx.playersById.get('b')!.xu).toBe(DANCE.rewards[1]);
    expect(ctx.playersById.get('b')!.tapNiem).toBe(DANCE.tapNiem);
    expect(ctx.dj).toBe('dj');
  });
});

describe('Bầu Cua', () => {
  it('đặt / gỡ cược, lắc, trả thưởng đúng luật', () => {
    const { ctx, instance } = mountActivity(bauCuaModule, 3);
    ctx.mapId = 'bar';
    ctx.addPlayer({ pid: 'a', xu: 100 });
    ctx.placeAt('a', 'baucua_table');
    instance.onInteract!(ctx.view('a'), ctx.station('baucua_table'));
    for (let i = 0; i < 3; i++) instance.onAction!(ctx.view('a'), 'bet', { sym: 'cua' });
    instance.onAction!(ctx.view('a'), 'unbet', { sym: 'cua' });
    expect(ctx.playersById.get('a')!.xu).toBe(100 - 2 * BAUCUA.chip);
    ctx.advance(BAUCUA.betMs + BAUCUA.rollMs + 50, instance);
    const st = ctx.lastState<BauCuaState>();
    expect(st.phase).toBe('payout');
    const m = st.dice.filter((d) => d === 'cua').length;
    const expected = 100 - 20 + (m > 0 ? 20 + 20 * m : 0);
    expect(ctx.playersById.get('a')!.xu).toBe(expected);
    expect(ctx.playersById.get('a')!.tapNiem).toBe(BAUCUA.tapNiem);
  });
});

describe('Quầy đổi Đức + đồ uống', () => {
  it('đổi Xu, bao cả quán, vé VIP; uống tăng Độ Say và Tạp Niệm', () => {
    const ex = mountActivity(exchangeModule);
    ex.ctx.mapId = 'bar';
    ex.ctx.addPlayer({ pid: 'a', congDuc: 600 });
    ex.ctx.addPlayer({ pid: 'b' });
    ex.ctx.placeAt('a', 'exchange_kiosk');
    ex.instance.onAction!(ex.ctx.view('a'), 'xu', { duc: 10 });
    expect(ex.ctx.playersById.get('a')!.xu).toBe(10 * EXCHANGE.xuPerDuc);
    ex.instance.onAction!(ex.ctx.view('a'), 'baoquan', undefined);
    expect(ex.ctx.playersById.get('b')!.xu).toBe(EXCHANGE.baoQuanXu);
    expect(ex.ctx.playersById.get('a')!.title).toBe('Đại gia');
    ex.instance.onAction!(ex.ctx.view('a'), 'vip', undefined);
    expect(ex.ctx.playersById.get('a')!.vip).toBe(true);
    expect(ex.ctx.playersById.get('a')!.duc).toBe(600 - 10 - EXCHANGE.baoQuanCost - EXCHANGE.vipCost);
    ex.instance.onAction!(ex.ctx.view('a'), 'vip', undefined);
    expect(ex.ctx.playersById.get('a')!.duc).toBe(600 - 10 - EXCHANGE.baoQuanCost - EXCHANGE.vipCost);

    const dr = mountActivity(drinkModule);
    dr.ctx.mapId = 'bar';
    dr.ctx.addPlayer({ pid: 'c', xu: 100, vip: true });
    dr.ctx.placeAt('c', 'drink_counter');
    dr.instance.onAction!(dr.ctx.view('c'), 'buy', { id: 'bia_bo_de' });
    expect(dr.ctx.playersById.get('c')!.xu).toBe(90);
    expect(dr.ctx.playersById.get('c')!.held).toEqual({ kind: 'drink_glass', variant: 'bia_bo_de' });
    dr.instance.onAction!(dr.ctx.view('c'), 'drink', undefined);
    expect(dr.ctx.playersById.get('c')!.doSay).toBe(20);
    expect(dr.ctx.playersById.get('c')!.tapNiem).toBe(3);
    expect(dr.ctx.playersById.get('c')!.held).toBeNull();
  });
});

describe('Tụng kinh', () => {
  type NoteEvt = { i: number; results: Record<string, string>; combo: number };
  type BreakEvt = { i: number; blame: string[]; broke: boolean };
  /** Một phím chắc chắn sai so với phím của nốt. */
  const wrongKey = (k: number) => (k === CHANT_KHANH ? 0 : (k + 1) % 4);

  /** Dựng thời khóa 2 người (host chọn kinh + b) tới lúc đếm ngược; mốc `rel` tính bằng ms từ đầu bài. */
  function chantSession(sutra = 'tam_kinh') {
    const { ctx, instance } = mountActivity(chantModule);
    ctx.addPlayer({ pid: 'host', isHost: true, congDuc: 200 });
    ctx.addPlayer({ pid: 'b', congDuc: 150 });
    instance.onAction!(ctx.view('host'), 'start', undefined);
    instance.onAction!(ctx.view('host'), 'choose', { sutra, tempo: 1 });
    for (const [pid, cushion] of [
      ['host', 'mo_cushion_1'],
      ['b', 'mo_cushion_2'],
    ] as const) {
      ctx.placeAt(pid, cushion);
      instance.onInteract!(ctx.view(pid), ctx.station(cushion));
    }
    ctx.advance(CHANT.lobbyMs + 50, instance);
    const st = ctx.lastState<ChantPublicState>();
    expect(st.phase).toBe('playing');
    expect(st.sutraId).toBe(sutra);
    const chart = chantChart(st.sutraId, st.tempo, st.seed);
    const to = (rel: number) => ctx.advance(Math.max(0, st.startAt + rel - ctx.time), instance);
    const send = (pid: string, type: 'hit' | 'release', rel: number, k: number) => {
      to(rel);
      instance.onAction!(ctx.view(pid), type, { t: st.startAt + rel, k });
    };
    /** Cả hai gõ đúng phím đúng phách nốt i; nốt ngân thì giữ tới đuôi rồi mới thả. */
    const playNote = (i: number, who: string[] = ['host', 'b']) => {
      const n = chart.notes[i]!;
      for (const pid of who) send(pid, 'hit', n.t, n.key);
      if (n.hold > 0) for (const pid of who) send(pid, 'release', n.t + n.hold, n.key);
    };
    const finalize = (i: number) => to(chantFinalizeAt(chart.notes[i]!) + 1);
    const noteEvent = (i: number) => (ctx.eventsOf('note') as NoteEvt[]).find((e) => e.i === i);
    const breakEvent = (i: number) => (ctx.eventsOf('break') as BreakEvt[]).find((e) => e.i === i);
    return { ctx, instance, st, chart, to, send, playNote, finalize, noteEvent, breakEvent };
  }

  it.each(CHANT.sutras.map((s) => s.id))('bài %s: cả đội gõ đúng trọn bài (cả nốt ngân, mũi tên đỏ, Khánh) → 100%%, không vỡ nhịp', (sutra) => {
    const { ctx, instance, chart, playNote } = chantSession(sutra);
    chart.notes.forEach((_, i) => playNote(i));
    ctx.advance(10_000, instance);
    expect(ctx.eventsOf('break')).toHaveLength(0);
    expect(ctx.eventsOf('note')).toHaveLength(chart.notes.length);
    for (const pid of ['host', 'b']) {
      const r = ctx.rewards.find((x) => x.pid === pid && (x.opts?.label ?? '').startsWith('Tụng kinh'));
      expect(r?.opts?.label).toBe('Tụng kinh 100%');
      expect(r?.base).toBe(chart.notes.length * CHANT.rewardPerfect + CHANT.endBonusMax);
      expect(ctx.closes).toContainEqual({ pid, reason: 'done' });
    }
  });

  it('cả đội đồng điệu 20 nốt → Hào quang cả phòng; bỏ dở phần sau thì thưởng theo độ chính xác', () => {
    const { ctx, instance, chart, playNote, finalize, noteEvent } = chantSession();
    const N = CHANT.comboForHaoQuang;
    for (let i = 0; i < N; i++) playNote(i);
    finalize(N - 1);
    expect(noteEvent(N - 1)?.combo).toBe(N);
    expect(ctx.roomBuffs.some((b) => b.id === 'hao_quang')).toBe(true);
    expect(ctx.fxs.some((f) => f.msg.type === 'glow' && f.msg.on)).toBe(true);
    ctx.advance(200_000, instance);
    expect(ctx.lastState<ChantPublicState>().phase).toBe('idle');
    const acc = N / chart.notes.length;
    const r = ctx.rewards.find((x) => x.pid === 'b' && (x.opts?.label ?? '').startsWith('Tụng kinh'));
    expect(r?.opts?.label).toBe(`Tụng kinh ${Math.round(acc * 100)}%`);
    expect(r?.base).toBe(N * CHANT.rewardPerfect + Math.round(acc * CHANT.endBonusMax));
  });

  it('bấm sai phím: nốt tính trượt, vỡ đồng điệu (Bongggg) và nêu tên người sai', () => {
    const { ctx, chart, playNote, send, finalize, noteEvent, breakEvent } = chantSession();
    for (let i = 0; i < 3; i++) playNote(i);
    const n = chart.notes[3]!;
    send('host', 'hit', n.t, n.key);
    send('b', 'hit', n.t, wrongKey(n.key));
    finalize(3);
    expect(noteEvent(2)?.combo).toBe(3);
    expect(noteEvent(3)).toMatchObject({ results: { host: 'perfect', b: 'miss' }, combo: 0 });
    expect(breakEvent(3)).toEqual({ i: 3, blame: ['b'], broke: true });
    expect(ctx.fxs.some((f) => f.msg.type === 'sound' && f.msg.id === 'bong')).toBe(true);
  });

  it('chưa có combo mà trượt thì chỉ báo lỗi, không vang Bongggg', () => {
    const { ctx, chart, send, finalize, breakEvent } = chantSession();
    const n = chart.notes[0]!;
    send('host', 'hit', n.t, n.key);
    finalize(0);
    expect(breakEvent(0)).toEqual({ i: 0, blame: ['b'], broke: false });
    expect(ctx.fxs.some((f) => f.msg.type === 'sound' && f.msg.id === 'bong')).toBe(false);
  });

  it('gõ trật nhịp (không có nốt nào gần) không ăn nốt nhưng làm vỡ đồng điệu ở nốt kế', () => {
    const { chart, playNote, send, finalize, noteEvent, breakEvent } = chantSession();
    const i = chart.notes.findIndex((n) => n.hold === 0);
    for (let k = 0; k <= i; k++) playNote(k);
    const a = chart.notes[i]!;
    const stray = chantFinalizeAt(a) + 150;
    expect(chart.notes[i + 1]!.t - stray).toBeGreaterThan(CHANT.strayMs);
    send('host', 'hit', stray, a.key);
    playNote(i + 1);
    finalize(i + 1);
    expect(noteEvent(i + 1)?.results).toEqual({ host: 'perfect', b: 'perfect' });
    expect(breakEvent(i + 1)).toEqual({ i: i + 1, blame: ['host'], broke: true });
  });

  it('nốt ngân: giữ tới gần đuôi thì ăn điểm, thả sớm là đứt hơi (trượt); thả phím khác không tính', () => {
    const { chart, send, finalize, noteEvent } = chantSession();
    const h = chart.notes.findIndex((n) => n.hold > 0);
    expect(h).toBeGreaterThanOrEqual(0);
    const n = chart.notes[h]!;
    send('host', 'hit', n.t, n.key);
    send('b', 'hit', n.t, n.key);
    send('host', 'release', n.t + 100, wrongKey(n.key));
    send('b', 'release', n.t + Math.round(n.hold / 3), n.key);
    send('host', 'release', n.t + n.hold - CHANT.holdEarlyMs + 10, n.key);
    finalize(h);
    expect(noteEvent(h)?.results).toEqual({ host: 'perfect', b: 'miss' });
  });

  it('mốc gõ ở tương lai bị kẹp về giờ server — không khai gian được Hoàn hảo', () => {
    const { ctx, instance, st, chart, to, finalize, noteEvent } = chantSession();
    const n = chart.notes[0]!;
    to(n.t - 70);
    instance.onAction!(ctx.view('host'), 'hit', { t: st.startAt + n.t, k: n.key });
    instance.onAction!(ctx.view('b'), 'hit', { t: st.startAt + n.t - 70, k: n.key });
    finalize(0);
    expect(noteEvent(0)?.results).toEqual({ host: 'good', b: 'good' });
  });

  it('người rời bồ đoàn giữa bài được bỏ khỏi điều kiện đồng điệu từ nốt kế', () => {
    const { ctx, instance, playNote, finalize, noteEvent, breakEvent } = chantSession();
    playNote(0);
    instance.onLeave!(ctx.view('b'), 'esc');
    expect(ctx.closes).toContainEqual({ pid: 'b', reason: 'esc' });
    playNote(1, ['host']);
    finalize(1);
    expect(noteEvent(1)).toMatchObject({ results: { host: 'perfect' }, combo: 2 });
    expect(breakEvent(1)).toBeUndefined();
  });

  it('mọi người rời bồ đoàn giữa bài → thời khóa dừng ngay, hết bận, mở được thời khóa mới', () => {
    const { ctx, instance, playNote } = chantSession();
    playNote(0);
    instance.onLeave!(ctx.view('host'), 'esc');
    expect(instance.isBusy!()).toBe(true);
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(ctx.lastState<ChantPublicState>().phase).toBe('idle');
    expect(instance.isBusy!()).toBe(false);
    ctx.advance(120_000, instance);
    expect(ctx.rewards.filter((r) => (r.opts?.label ?? '').startsWith('Tụng kinh'))).toHaveLength(0);
    instance.onAction!(ctx.view('host'), 'start', undefined);
    expect(ctx.lastState<ChantPublicState>().phase).toBe('lobby');
  });

  it('chỉ Người chọn kinh đổi được bài và nhịp; bài hoặc nhịp lạ bị bỏ qua', () => {
    const { ctx, instance } = mountActivity(chantModule);
    ctx.addPlayer({ pid: 'host', isHost: true, congDuc: 200 });
    ctx.addPlayer({ pid: 'dd', congDuc: 2000 });
    instance.onAction!(ctx.view('host'), 'start', undefined);
    expect(ctx.lastState<ChantPublicState>().chooserPid).toBe('dd');
    instance.onAction!(ctx.view('host'), 'choose', { sutra: 'dai_bi', tempo: 1.15 });
    instance.onAction!(ctx.view('dd'), 'choose', { sutra: 'dai_bi', tempo: 2 });
    instance.onAction!(ctx.view('dd'), 'choose', { sutra: 'kinh_la', tempo: 1 });
    expect(ctx.lastState<ChantPublicState>()).toMatchObject({ sutraId: CHANT.sutras[0]!.id, tempo: 1 });
    instance.onAction!(ctx.view('dd'), 'choose', { sutra: 'dai_bi', tempo: 1.15 });
    expect(ctx.lastState<ChantPublicState>()).toMatchObject({ sutraId: 'dai_bi', tempo: 1.15 });
  });

  it('Tiểu Đồng không được ngồi gõ mõ', () => {
    const { ctx, instance } = mountActivity(chantModule);
    ctx.addPlayer({ pid: 'host', isHost: true, congDuc: 200 });
    ctx.addPlayer({ pid: 'td', congDuc: 0 });
    instance.onAction!(ctx.view('host'), 'start', undefined);
    ctx.placeAt('td', 'mo_cushion_3');
    instance.onInteract!(ctx.view('td'), ctx.station('mo_cushion_3'));
    expect(ctx.lastState<ChantPublicState>().participants).toHaveLength(0);
  });

  it('chưa có thời khóa: Phương Trượng ngồi bồ đoàn là mở thời khóa luôn', () => {
    const { ctx, instance } = mountActivity(chantModule);
    ctx.addPlayer({ pid: 'host', isHost: true, congDuc: 0 });
    instance.onInteract!(ctx.view('host'), ctx.placeAt('host', 'mo_cushion_1'));
    const st = ctx.lastState<ChantPublicState>();
    expect(st.phase).toBe('lobby');
    expect(st.participants.map((p) => p.pid)).toEqual(['host']);
    expect(ctx.opens.map((o) => o.pid)).toEqual(['host']);
    ctx.advance(CHANT.lobbyMs + 50, instance);
    expect(ctx.lastState<ChantPublicState>().phase).toBe('playing');
  });

  it('chưa có thời khóa: người khác ngồi chờ, được giữ lại khi Phương Trượng mở, Esc thì đứng dậy', () => {
    const { ctx, instance } = mountActivity(chantModule);
    ctx.addPlayer({ pid: 'host', isHost: true, congDuc: 300 });
    ctx.addPlayer({ pid: 'b', congDuc: 150 });
    ctx.addPlayer({ pid: 'c', congDuc: 120 });
    instance.onInteract!(ctx.view('b'), ctx.placeAt('b', 'mo_cushion_2'));
    instance.onInteract!(ctx.view('c'), ctx.placeAt('c', 'mo_cushion_3'));
    let st = ctx.lastState<ChantPublicState>();
    expect(st.phase).toBe('idle');
    expect(st.participants.map((p) => p.pid)).toEqual(['b', 'c']);
    expect(ctx.view('b').activity).toBe('chant');
    expect(ctx.toasts.some((t) => t.target === 'host' && t.text.includes('đang ngồi bồ đoàn'))).toBe(true);
    // Cùng bồ đoàn thì không ngồi chồng được.
    ctx.addPlayer({ pid: 'd', congDuc: 130 });
    instance.onInteract!(ctx.view('d'), ctx.placeAt('d', 'mo_cushion_2'));
    expect(ctx.lastState<ChantPublicState>().participants).toHaveLength(2);
    // c đứng dậy (Esc) trước khi mở.
    instance.onLeave!(ctx.view('c'), 'esc');
    expect(ctx.closes).toContainEqual({ pid: 'c', reason: 'esc' });
    instance.onAction!(ctx.view('host'), 'start', undefined);
    st = ctx.lastState<ChantPublicState>();
    expect(st.phase).toBe('lobby');
    expect(st.participants.map((p) => p.pid)).toEqual(['b']);
    ctx.advance(CHANT.lobbyMs + 50, instance);
    expect(ctx.lastState<ChantPublicState>().phase).toBe('playing');
  });

  it('đang tụng thì không ngồi thêm được', () => {
    const { ctx, instance } = mountActivity(chantModule);
    ctx.addPlayer({ pid: 'host', isHost: true, congDuc: 300 });
    ctx.addPlayer({ pid: 'late', congDuc: 200 });
    instance.onInteract!(ctx.view('host'), ctx.placeAt('host', 'mo_cushion_1'));
    ctx.advance(CHANT.lobbyMs + 50, instance);
    instance.onInteract!(ctx.view('late'), ctx.placeAt('late', 'mo_cushion_4'));
    expect(ctx.lastState<ChantPublicState>().participants.map((p) => p.pid)).toEqual(['host']);
    expect(ctx.toasts.some((t) => t.target === 'late' && t.text.includes('đang diễn ra'))).toBe(true);
  });
});

describe('Thỉnh chuông', () => {
  it('đủ 3 người thì đếm ngược, 3 tiếng chuông thưởng cả phòng, người kéo gấp đôi, rồi nghỉ', () => {
    const { ctx, instance } = mountActivity(bellModule);
    for (const pid of ['a', 'b', 'c', 'watcher']) ctx.addPlayer({ pid });
    ['a', 'b', 'c'].forEach((pid, i) => {
      const st = ctx.placeAt(pid, `bell_rope_${i + 1}`);
      instance.onInteract!(ctx.view(pid), st);
    });
    ctx.advance(BELL.countdownMs + 10, instance);
    for (let n = 1; n <= BELL.strikes; n++) {
      const pull = ctx.eventsOf('pull', 'a').at(-1) as { strike: number; at: number };
      expect(pull.strike).toBe(n);
      const press = ctx.time;
      const release = press + BELL.oscillationMs * 0.4;
      ctx.advance(release - ctx.time, instance);
      for (const pid of ['a', 'b', 'c']) instance.onAction!(ctx.view(pid), 'release', { strike: n, pressT: press, releaseT: release });
      ctx.advance(BELL.strikeGapMs + 10, instance);
    }
    expect(ctx.eventsOf('ring')).toHaveLength(3);
    const a = ctx.playersById.get('a')!.congDuc;
    const w = ctx.playersById.get('watcher')!.congDuc;
    expect(a).toBe(w * BELL.pullerMultiplier);
    expect(ctx.lastState<{ phase: string }>().phase).toBe('cooldown');
  });
});

describe('Nấu cơm chay', () => {
  it('một người nấu đủ 1 mâm: vo gạo, nồi, củi, rau, thái, đảo, dọn mâm → hoàn hảo + buff No bụng', () => {
    const { ctx, instance } = mountActivity(cookModule, 5);
    ctx.shared.set('rice_stock', 10);
    ctx.shared.set('veg_stock', 10);
    ctx.shared.set('firewood', 10);
    ctx.addPlayer({ pid: 'a' });
    const at = (id: string) => ctx.placeAt('a', id);
    instance.onInteract!(ctx.view('a'), at('order_board'));
    ctx.advance(COOK.lobbyMs + 50, instance);
    expect(ctx.lastState<CookPublicState>().phase).toBe('cooking');
    instance.onInteract!(ctx.view('a'), at('rice_bin'));
    instance.onInteract!(ctx.view('a'), at('wash_basin'));
    ctx.advance(1000, instance);
    instance.onAction!(ctx.view('a'), 'wash_done', undefined);
    expect(ctx.playersById.get('a')!.held?.kind).toBe('rice_washed');
    instance.onInteract!(ctx.view('a'), at('stove_rice'));
    // Canh lửa: bỏ củi mỗi khi nhiệt sắp rơi khỏi vùng xanh, tới khi cơm chín.
    for (let i = 0; i < 80 && ctx.lastState<CookPublicState>().pot.state !== 'done'; i++) {
      if (ctx.lastState<CookPublicState>().heat < COOK.heatGreenMin + 6) {
        instance.onInteract!(ctx.view('a'), at('woodpile'));
        instance.onInteract!(ctx.view('a'), at('firebox'));
      }
      ctx.advance(1000, instance);
    }
    expect(ctx.lastState<CookPublicState>().pot.state).toBe('done');
    instance.onInteract!(ctx.view('a'), at('stove_rice'));
    instance.onInteract!(ctx.view('a'), at('dining_table'));
    instance.onInteract!(ctx.view('a'), at('veggie_patch'));
    instance.onInteract!(ctx.view('a'), at('cutting_board'));
    ctx.advance(1000, instance);
    instance.onAction!(ctx.view('a'), 'cut_done', undefined);
    instance.onInteract!(ctx.view('a'), at('woodpile'));
    instance.onInteract!(ctx.view('a'), at('firebox'));
    instance.onInteract!(ctx.view('a'), at('stove_pan'));
    ctx.placeAt('a', 'stove_pan');
    // Đảo chảo khi lửa đủ nóng (bỏ thêm củi khi cần).
    instance.onAction!(ctx.view('a'), 'stir', { down: true });
    for (let i = 0; i < 6 && ctx.lastState<CookPublicState>().pan.state !== 'done'; i++) {
      ctx.advance(2000, instance);
      if (ctx.lastState<CookPublicState>().heat < COOK.heatGreenMin + 5) {
        ctx.setHeld('a', { kind: 'firewood' });
        ctx.placeAt('a', 'firebox');
        instance.onInteract!(ctx.view('a'), ctx.station('firebox'));
        ctx.placeAt('a', 'stove_pan');
        instance.onAction!(ctx.view('a'), 'stir', { down: true });
      }
    }
    expect(ctx.lastState<CookPublicState>().pan.state).toBe('done');
    instance.onInteract!(ctx.view('a'), at('stove_pan'));
    instance.onInteract!(ctx.view('a'), at('dining_table'));
    const st = ctx.lastState<CookPublicState>();
    expect(st.result).toBe('perfect');
    expect(ctx.roomBuffs.some((b) => b.id === 'no_bung')).toBe(true);
    expect(ctx.rewards.at(-1)!.base).toBe(COOK.rewardPerfect);
  });
});

describe('Đại lễ', () => {
  it('đặt sai bị trả lại; bày đủ 10 vị trí thì thành công, người ngoài cũng được thưởng', () => {
    const { ctx, instance } = mountActivity(ceremonyModule);
    ctx.addPlayer({ pid: 'h', isHost: true });
    ctx.addPlayer({ pid: 'other' });
    instance.onAction!(ctx.view('h'), 'start', undefined);
    const st = ctx.lastState<CeremonyPublicState>();
    expect(st.active).toBe(true);
    const slots = ceremonySlots(ceremonyLayout(st.seed));
    ctx.placeAt('h', 'altar');
    ctx.setHeld('h', { kind: 'fruit', variant: 'khong_hop_le' });
    instance.onAction!(ctx.view('h'), 'place', { slot: slots[0]!.id });
    expect(ctx.toasts.at(-1)!.text).toContain('phong thủy');
    for (const sl of slots) {
      const item =
        sl.kind === 'fruit' || sl.kind === 'vase' ? { kind: sl.kind, variant: sl.variant } : { kind: sl.kind, variant: 'lit' };
      ctx.setHeld('h', item as never);
      instance.onAction!(ctx.view('h'), 'place', { slot: sl.id });
    }
    expect(ctx.lastState<CeremonyPublicState>().result).toBe('success');
    expect(ctx.playersById.get('h')!.congDuc).toBe(CEREMONY.rewardSuccess);
    expect(ctx.playersById.get('other')!.congDuc).toBe(CEREMONY.rewardRoom);
  });
  it('hái quả phải giữ đủ 1,5 giây', () => {
    const { ctx, instance } = mountActivity(ceremonyModule);
    ctx.addPlayer({ pid: 'h', isHost: true });
    instance.onAction!(ctx.view('h'), 'start', undefined);
    ctx.placeAt('h', 'fruit_tree_xoai');
    instance.onAction!(ctx.view('h'), 'hold_start', { stationId: 'fruit_tree_xoai' });
    ctx.advance(500, instance);
    instance.onAction!(ctx.view('h'), 'pick', { stationId: 'fruit_tree_xoai' });
    expect(ctx.playersById.get('h')!.held).toBeNull();
    instance.onAction!(ctx.view('h'), 'hold_start', { stationId: 'fruit_tree_xoai' });
    ctx.advance(CEREMONY.pickHoldMs, instance);
    instance.onAction!(ctx.view('h'), 'pick', { stationId: 'fruit_tree_xoai' });
    expect(ctx.playersById.get('h')!.held).toEqual({ kind: 'fruit', variant: 'xoai' });
  });
});

describe('Thi pha chế', () => {
  it('nhận đơn, pha đúng công thức, lắc, phục vụ đúng bàn được tip; cuối ca người nhất +50 Xu', () => {
    const { ctx, instance } = mountActivity(mixologyModule, 9);
    ctx.mapId = 'bar';
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view(ctx.placeAt('a', 'mix_station_1') && 'a'), ctx.station('mix_station_1'));
    ctx.advance(MIXOLOGY.lobbyMs + 50, instance);
    ctx.advance(8000, instance);
    const st = ctx.lastState<MixPublicState>();
    expect(st.phase).toBe('playing');
    const order = st.orders[0]!;
    instance.onAction!(ctx.view('a'), 'take_order', { id: order.id });
    const recipe = MIXOLOGY.recipes.find((r) => r.id === order.recipe)!;
    instance.onAction!(ctx.view('a'), 'mix_done', { id: order.id, ingredients: recipe.ingredients, deltas: Array(8).fill(10) });
    expect(ctx.playersById.get('a')!.held).toEqual({ kind: 'cocktail', variant: recipe.id });
    const table = findStation(`npc_table_${order.table}`)!.station;
    ctx.placeAt('a', table.id);
    instance.onInteract!(ctx.view('a'), table);
    expect(ctx.playersById.get('a')!.xu).toBeGreaterThanOrEqual(MIXOLOGY.tipMin);
    const tip = ctx.playersById.get('a')!.xu;
    ctx.advance(MIXOLOGY.durationMs, instance);
    expect(ctx.playersById.get('a')!.xu).toBe(tip + MIXOLOGY.winnerBonus);
  });
});

describe('Quét lá + Xách nước + Phóng sinh', () => {
  it('lấy chổi, quét gom lá vào bao, đổ ở gốc cây được Công Đức', () => {
    const { ctx, instance } = mountActivity(sweepModule, 2);
    ctx.addPlayer({ pid: 'a' });
    instance.onInteract!(ctx.view('a'), ctx.station('broom_rack'));
    expect(ctx.playersById.get('a')!.held).toEqual({ kind: 'broom' });
    ctx.advance(SWEEP.driftMs + 100, instance);
    const leaf = ctx.lastState<SweepPublicState>().leaves[0]!;
    const p = ctx.playersById.get('a')!;
    p.x = leaf.x;
    p.z = leaf.z - 0.8;
    instance.onAction!(ctx.view('a'), 'sweep', { ry: 0 });
    const bag = ctx.eventsOf('bag', 'a').at(-1) as { count: number };
    expect(bag.count).toBeGreaterThan(0);
    instance.onInteract!(ctx.view('a'), ctx.station('tree_root'));
    expect((ctx.eventsOf('bag', 'a').at(-1) as { count: number }).count).toBe(0);
    if (bag.count >= SWEEP.leavesPerKarma) expect(ctx.rewards.at(-1)!.base).toBe(Math.floor(bag.count / SWEEP.leavesPerKarma));
  });
  it('kéo gàu đủ 12 lần → xô nước; đổ chum +4; chum đầy thì không thưởng', () => {
    const { ctx, instance } = mountActivity(waterModule);
    ctx.addPlayer({ pid: 'a' });
    const well = ctx.placeAt('a', 'well');
    instance.onInteract!(ctx.view('a'), well);
    ctx.advance(WATER.crankMinMs + 100, instance);
    instance.onAction!(ctx.view('a'), 'crank', { presses: WATER.crankPresses });
    expect(ctx.playersById.get('a')!.held).toEqual({ kind: 'water_bucket' });
    const jar = ctx.placeAt('a', 'water_jar_1');
    instance.onInteract!(ctx.view('a'), jar);
    expect(ctx.rewards.at(-1)!.base).toBe(WATER.rewardPour);
  });
  it('thả cá xuống ao +6; thả cá lên rừng bị trừ 2 và vẫn cầm con vật', () => {
    const { ctx, instance } = mountActivity(releaseModule);
    ctx.addPlayer({ pid: 'a', congDuc: 10, held: { kind: 'animal', variant: 'ca' } });
    const forest = ctx.placeAt('a', 'forest_release_1');
    instance.onInteract!(ctx.view('a'), forest);
    expect(ctx.playersById.get('a')!.congDuc).toBe(8);
    expect(ctx.playersById.get('a')!.held).not.toBeNull();
    const pond = ctx.placeAt('a', 'pond_release');
    instance.onInteract!(ctx.view('a'), pond);
    expect(ctx.playersById.get('a')!.held).toBeNull();
    expect(ctx.rewards.at(-1)!.base).toBe(6);
  });
});
