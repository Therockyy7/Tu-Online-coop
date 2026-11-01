// Máy Nổ Hũ (Sòng Công Đức) phía server với FakeActivityContext: vào máy (1 người/máy), quay trừ Công Đức thật + góp hũ
// (giữ phần lẻ), quyết kết quả ngay, trả thưởng đúng lúc cuộn 3 dừng, chống quay dồn, nổ hũ cả phòng, nhả máy khi Esc /
// đi xa / mất kết nối / rời (lượt đang quay vẫn được trả nếu còn trong phòng); đổi map chốt ngay lượt đang quay rồi nhả
// máy, không chặn đổi map (isBusy luôn false).
import { describe, expect, it, vi } from 'vitest';
import { JOKES, NOHU, type NoHuSymbol } from '@shared/index';
import { NOHU_STRIPS, type NoHuPublicState } from '@shared/activities/nohu';
import { noHuModule } from '../../src/activities/nohu';
import { mountActivity } from '../helpers/fakeContext';

const NOTHING: NoHuSymbol[] = ['chuong', 'bia', 'dao'];

function setup(seed = 3) {
  const { ctx, instance } = mountActivity(noHuModule, seed);
  ctx.addPlayer({ pid: 'a', name: 'An', congDuc: 300, duc: 200 });
  ctx.addPlayer({ pid: 'b', name: 'Bình', congDuc: 100, duc: 100 });
  ctx.placeAt('a', 'slot_machine_1');
  ctx.placeAt('b', 'slot_machine_2');
  const st = () => ctx.lastState<NoHuPublicState>();
  const sit = (pid: string, n: number) => instance.onInteract!(ctx.view(pid), ctx.station(`slot_machine_${n}`));
  const spin = (pid: string, bet: unknown) => instance.onAction!(ctx.view(pid), 'spin', { bet });
  const wallet = (pid: string) => {
    const p = ctx.playersById.get(pid)!;
    return [p.congDuc, p.duc];
  };
  /** Ép 3 ô dừng của lượt quay kế tiếp (server gieo bằng ctx.rng.int, lần lượt cuộn 1 → 3). */
  const force = (stops: readonly number[]) => {
    const spy = vi.spyOn(ctx.rng, 'int');
    for (const s of stops) spy.mockReturnValueOnce(s);
  };
  /** Ép lượt kế tiếp ra đúng 3 biểu tượng (ô đầu tiên của biểu tượng đó trên mỗi dải). */
  const forceSymbols = (syms: readonly NoHuSymbol[]) => force(syms.map((s, k) => NOHU_STRIPS[k]!.indexOf(s)));
  return { ctx, instance, st, sit, spin, wallet, force, forceSymbols };
}

describe('Nổ Hũ — vào máy', () => {
  it('máy trống → mở giao diện + ghi người ngồi; máy có người → toast, không cướp; sang máy khác thì nhả máy cũ', () => {
    const { ctx, st, sit } = setup();
    expect(st()).toMatchObject({ jackpot: NOHU.jackpotSeed, lastJackpot: null });
    expect(st().machines.map((m) => [m.id, m.pid, m.spin])).toEqual([1, 2, 3, 4].map((id) => [id, null, null]));
    sit('a', 1);
    expect(ctx.opens.at(-1)).toMatchObject({ pid: 'a', data: { machine: 1 } });
    expect(ctx.playersById.get('a')!.activity).toBe('nohu');
    expect(st().machines[0]).toMatchObject({ id: 1, pid: 'a', name: 'An', spin: null });

    ctx.placeAt('b', 'slot_machine_1');
    sit('b', 1);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'b' });
    expect(ctx.toasts.at(-1)!.text).toMatch(/An/);
    expect(st().machines[0]!.pid).toBe('a');
    expect(ctx.opens.filter((o) => o.pid === 'b')).toHaveLength(0);

    ctx.placeAt('a', 'slot_machine_2');
    sit('a', 2);
    expect(st().machines.map((m) => m.pid)).toEqual([null, 'a', null, null]);
    sit('b', 1);
    expect(st().machines.map((m) => m.pid)).toEqual(['b', 'a', null, null]);
  });
});

describe('Nổ Hũ — quay', () => {
  it('trừ cả Công Đức lẫn Đức, quyết kết quả ngay, trả đúng lúc cuộn 3 dừng (raw, noPool, "Nổ Hũ"), Tạp Niệm +1', () => {
    const { ctx, instance, st, sit, spin, wallet, forceSymbols } = setup();
    sit('a', 1);
    forceSymbols(['bia', 'bia', 'bia']);
    const t0 = ctx.time;
    spin('a', 10);
    expect(wallet('a')).toEqual([290, 190]);
    expect(ctx.wagers).toEqual([{ pid: 'a', amount: 10 }]);
    const stops = NOHU_STRIPS.map((s) => s.indexOf('bia'));
    expect(st().machines[0]!.spin).toEqual({
      pid: 'a',
      name: 'An',
      stops,
      symbols: ['bia', 'bia', 'bia'],
      bet: 10,
      startAt: t0,
      stopAt: t0 + NOHU.spinMs,
      win: 10 * NOHU.paytable.bia,
      jackpot: false,
      done: false,
    });
    expect(st().jackpot).toBe(NOHU.jackpotSeed + 1);
    expect(ctx.playersById.get('a')!.tapNiem).toBe(NOHU.tapNiemPerSpin);
    // Đang quay cũng không chặn đổi map (đổi map thì chốt ngay lượt dở — xem test "đổi map").
    expect(instance.isBusy!()).toBe(false);

    ctx.advance(NOHU.spinMs - 50, instance);
    expect(ctx.rewards).toHaveLength(0);
    ctx.advance(50, instance);
    expect(ctx.rewards).toEqual([{ pid: 'a', base: 40, gain: 40, opts: { raw: true, noPool: true, label: 'Nổ Hũ' } }]);
    expect(wallet('a')).toEqual([330, 230]);
    expect(st().machines[0]!.spin).toMatchObject({ done: true, win: 40 });
    expect(instance.isBusy!()).toBe(false);
  });

  it('trượt thì không trả; góp hũ giữ phần lẻ (10 lượt cược 1 = +1 hũ, không làm tròn mất)', () => {
    const { ctx, instance, st, sit, spin, forceSymbols } = setup();
    sit('a', 1);
    for (let i = 0; i < 9; i++) {
      forceSymbols(NOTHING);
      spin('a', 1);
      ctx.advance(NOHU.minIntervalMs, instance);
    }
    expect(ctx.wagers).toHaveLength(9);
    expect(ctx.rewards).toHaveLength(0);
    expect(st().jackpot).toBe(NOHU.jackpotSeed);
    forceSymbols(NOTHING);
    spin('a', 1);
    expect(st().jackpot).toBe(NOHU.jackpotSeed + 1);
    expect(ctx.playersById.get('a')!.tapNiem).toBe(10 * NOHU.tapNiemPerSpin);
  });

  it('mức cược ngoài NOHU.bets / chưa ngồi máy bị bỏ qua; thiếu Đức → toast, không đổi gì', () => {
    const { ctx, instance, st, sit, spin, wallet } = setup();
    sit('a', 1);
    for (const bad of [3, -5, '10', 50, 0, 1.5]) spin('a', bad);
    instance.onAction!(ctx.view('a'), 'spin', null);
    expect(ctx.wagers).toHaveLength(0);
    spin('b', 5);
    expect(ctx.wagers).toHaveLength(0);
    ctx.addPlayer({ pid: 'c', congDuc: 50, duc: 4 });
    ctx.placeAt('c', 'slot_machine_3');
    sit('c', 3);
    spin('c', 5);
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'c', tone: 'warn' });
    expect(ctx.toasts.at(-1)!.text).toMatch(/Cần đủ Đức/);
    expect(wallet('c')).toEqual([50, 4]);
    expect(st().machines[2]!.spin).toBeNull();
    expect(st().jackpot).toBe(NOHU.jackpotSeed);
  });

  it('chống quay dồn: trong NOHU.minIntervalMs kể từ lượt trước, act spin bị bỏ qua (kể cả gửi dồn dập)', () => {
    const { ctx, instance, sit, spin } = setup();
    sit('a', 1);
    spin('a', 1);
    spin('a', 1);
    spin('a', 20);
    expect(ctx.wagers).toHaveLength(1);
    ctx.advance(NOHU.spinMs, instance);
    spin('a', 1);
    ctx.advance(NOHU.minIntervalMs - NOHU.spinMs - 1, instance);
    spin('a', 1);
    expect(ctx.wagers).toHaveLength(1);
    ctx.advance(1, instance);
    spin('a', 1);
    expect(ctx.wagers).toHaveLength(2);
    // Mỗi máy tính nhịp riêng.
    sit('b', 2);
    spin('b', 5);
    expect(ctx.wagers.map((w) => w.pid)).toEqual(['a', 'a', 'b']);
  });
});

describe('Nổ Hũ — nổ hũ (ăn theo tỉ lệ mức cược: cược / cược tối đa)', () => {
  it('nổ lúc cuộn 3 dừng: cược 5 ăn 25% phần nguyên của quỹ, phần còn lại dưới mức gốc thì bù lên jackpotSeed (giữ phần lẻ); banner, chat, pháo, âm jackpot cả phòng', () => {
    const { ctx, instance, st, sit, spin, wallet, force, forceSymbols } = setup();
    sit('a', 1);
    sit('b', 2);
    forceSymbols(NOTHING);
    spin('a', 20);
    forceSymbols(NOTHING);
    spin('b', 20);
    ctx.advance(NOHU.minIntervalMs, instance);
    expect(st().jackpot).toBe(104);
    force(NOHU_STRIPS.map((s) => s.indexOf('hu')));
    spin('a', 5);
    expect(st().machines[0]!.spin).toMatchObject({ symbols: ['hu', 'hu', 'hu'], jackpot: true, win: 0, done: false });
    // Cuộn chưa dừng: hũ vẫn hiện đủ (104,5), chưa ai biết nổ.
    expect(st().jackpot).toBe(104);
    expect(st().lastJackpot).toBeNull();
    const [cd, duc] = wallet('a');
    ctx.advance(NOHU.spinMs, instance);
    // 104,5 × 25% = 26,125 → trả 26; còn 78,5 < 100 → nhà cái bù lên 100,5.
    expect(wallet('a')).toEqual([cd! + 26, duc! + 26]);
    expect(ctx.rewards.at(-1)).toMatchObject({ pid: 'a', base: 26, opts: { raw: true, noPool: true, label: 'Nổ Hũ' } });
    expect(st().lastJackpot).toEqual({ name: 'An', amount: 26, at: ctx.time, machine: 1 });
    expect(st().machines[0]!.spin).toMatchObject({ done: true, win: 26 });
    expect(st().jackpot).toBe(NOHU.jackpotSeed);
    const room = ctx.fxs.filter((f) => f.to === 'room').map((f) => f.msg);
    expect(room.some((m) => m.type === 'banner' && m.big === true && /NỔ HŨ/.test(m.title) && /25%/.test(m.sub ?? ''))).toBe(true);
    expect(room.some((m) => m.type === 'sound' && m.id === 'jackpot')).toBe(true);
    expect(room.some((m) => m.type === 'confetti')).toBe(true);
    expect(ctx.chats.at(-1)).toMatch(/An NỔ HŨ 26 Công Đức \(25% hũ, cược 5\).*còn 100/);
    // Phần lẻ 0,5 còn trong hũ: 5 lượt cược 1 nữa là tròn 101.
    for (let i = 0; i < 5; i++) {
      ctx.advance(NOHU.minIntervalMs, instance);
      forceSymbols(NOTHING);
      spin('a', 1);
    }
    expect(st().jackpot).toBe(NOHU.jackpotSeed + 1);
  });

  it('cược tối đa ăn trọn hũ (phần nguyên), hũ về jackpotSeed — banner "ăn trọn", chat "về lại"', () => {
    const { ctx, instance, st, sit, spin, wallet, force, forceSymbols } = setup();
    sit('a', 1);
    forceSymbols(NOTHING);
    spin('a', 20);
    ctx.advance(NOHU.minIntervalMs, instance);
    force(NOHU_STRIPS.map((s) => s.indexOf('hu')));
    spin('a', 20);
    expect(st().jackpot).toBe(104);
    const [cd, duc] = wallet('a');
    ctx.advance(NOHU.spinMs, instance);
    expect(wallet('a')).toEqual([cd! + 104, duc! + 104]);
    expect(st().lastJackpot).toEqual({ name: 'An', amount: 104, at: ctx.time, machine: 1 });
    expect(st().jackpot).toBe(NOHU.jackpotSeed);
    const banner = ctx.fxs.map((f) => f.msg).find((m) => m.type === 'banner');
    expect(banner?.type === 'banner' && banner.sub).toMatch(/An ăn trọn Hũ Công Đức: \+104/);
    expect(ctx.chats.at(-1)).toMatch(/An NỔ HŨ 104 Công Đức ở máy Nổ Hũ số 1! Hũ Công Đức về lại 100\./);
  });

  it('cược 1 nổ hũ: ăn 5% phần nguyên, phần còn lại (cả phần lẻ) ở lại hũ — không bù khi còn trên mức gốc', () => {
    const { ctx, instance, st, sit, spin, wallet, force, forceSymbols } = setup();
    sit('a', 1);
    sit('b', 2);
    for (let i = 0; i < 2; i++) {
      forceSymbols(NOTHING);
      spin('a', 20);
      forceSymbols(NOTHING);
      spin('b', 20);
      ctx.advance(NOHU.minIntervalMs, instance);
    }
    expect(st().jackpot).toBe(108);
    force(NOHU_STRIPS.map((s) => s.indexOf('hu')));
    spin('b', 1);
    const [cd, duc] = wallet('b');
    ctx.advance(NOHU.spinMs, instance);
    // 108,1 × 5% = 5,405 → trả 5; hũ còn 103,1.
    expect(wallet('b')).toEqual([cd! + 5, duc! + 5]);
    expect(st().lastJackpot).toEqual({ name: 'Bình', amount: 5, at: ctx.time, machine: 2 });
    expect(st().machines[1]!.spin).toMatchObject({ done: true, win: 5 });
    expect(st().jackpot).toBe(103);
    expect(ctx.chats.at(-1)).toMatch(/Bình NỔ HŨ 5 Công Đức \(5% hũ, cược 1\) ở máy Nổ Hũ số 2! Hũ Công Đức còn 103\./);
    // Phần lẻ 0,1 vẫn trong hũ: 9 lượt cược 1 nữa (+0,9) là tròn 104.
    for (let i = 0; i < 9; i++) {
      ctx.advance(NOHU.minIntervalMs, instance);
      forceSymbols(NOTHING);
      spin('a', 1);
    }
    expect(st().jackpot).toBe(104);
  });

  it('người quay rời phòng trước lúc cuộn dừng → không trả, hũ giữ nguyên, không báo nổ hũ', () => {
    const { ctx, instance, st, sit, spin, force } = setup();
    sit('a', 1);
    force(NOHU_STRIPS.map((s) => s.indexOf('hu')));
    spin('a', 10);
    instance.onLeave!(ctx.view('a'), 'left');
    ctx.playersById.delete('a');
    expect(st().machines[0]!.pid).toBeNull();
    ctx.advance(NOHU.spinMs, instance);
    expect(ctx.rewards).toHaveLength(0);
    expect(st().jackpot).toBe(NOHU.jackpotSeed + 1);
    expect(st().lastJackpot).toBeNull();
    expect(st().machines[0]!.spin).toMatchObject({ done: true, win: 0 });
    expect(ctx.chats.some((c) => /NỔ HŨ/.test(c))).toBe(false);
    expect(instance.isBusy!()).toBe(false);
  });
});

describe('Nổ Hũ — rời máy', () => {
  it('Esc / mất kết nối / act leave → nhả máy; lượt đang quay vẫn được trả khi còn trong phòng', () => {
    const { ctx, instance, st, sit, spin, forceSymbols } = setup();
    sit('a', 1);
    sit('b', 2);
    forceSymbols(['that', 'that', 'that']);
    spin('a', 1);
    instance.onLeave!(ctx.view('a'), 'esc');
    expect(st().machines[0]!.pid).toBeNull();
    forceSymbols(['bia', 'dao', 'sen']);
    spin('b', 5);
    ctx.playersById.get('b')!.connected = false;
    instance.onLeave!(ctx.view('b'), 'disconnect');
    expect(st().machines[1]!.pid).toBeNull();
    ctx.advance(NOHU.spinMs, instance);
    expect(ctx.rewards.map((r) => [r.pid, r.base])).toEqual([
      ['a', NOHU.paytable.that],
      ['b', 5 * NOHU.mixedFruit],
    ]);
    // Đã rời máy thì quay không được nữa.
    ctx.advance(NOHU.minIntervalMs, instance);
    spin('a', 1);
    expect(ctx.wagers).toHaveLength(2);
    // act 'leave' (bảng đóng bằng Esc / ✕): nhả máy + đóng giao diện.
    sit('a', 1);
    instance.onAction!(ctx.view('a'), 'leave', undefined);
    expect(st().machines[0]!.pid).toBeNull();
    expect(ctx.closes.at(-1)).toMatchObject({ pid: 'a' });
    expect(ctx.playersById.get('a')!.activity).toBeNull();
  });

  it('đi xa (tick kiểm khoảng cách) → nhả máy + đóng giao diện; gửi quay lúc đã đứng xa bị từ chối', () => {
    const { ctx, instance, st, sit, spin } = setup();
    sit('a', 1);
    const s = ctx.station('slot_machine_1');
    const pa = ctx.playersById.get('a')!;
    pa.z = s.z - (s.r + NOHU.leaveSlack - 0.2);
    ctx.advance(200, instance);
    expect(st().machines[0]!.pid).toBe('a');
    pa.z = s.z - (s.r + NOHU.leaveSlack + 0.3);
    ctx.advance(100, instance);
    expect(st().machines[0]!.pid).toBeNull();
    expect(ctx.closes.at(-1)).toMatchObject({ pid: 'a', reason: 'far' });
    expect(pa.activity).toBeNull();

    pa.z = s.z;
    sit('a', 1);
    pa.z = s.z - 5;
    spin('a', 5);
    expect(ctx.wagers).toHaveLength(0);
    expect(st().machines[0]!.pid).toBeNull();
    expect(ctx.toasts.at(-1)).toMatchObject({ target: 'a', text: JOKES.tooFar });
  });

  it('đang quay không chặn đổi map; đổi map chốt NGAY lượt dở (trả đúng số đã quyết) rồi nhả mọi máy, sau đó không trả thêm', () => {
    const { ctx, instance, st, sit, spin, wallet, forceSymbols } = setup();
    sit('a', 1);
    sit('b', 2);
    expect(instance.isBusy!()).toBe(false);
    forceSymbols(['bia', 'bia', 'bia']);
    spin('a', 5);
    expect(instance.isBusy!()).toBe(false);
    ctx.advance(NOHU.spinMs / 2, instance);
    expect(ctx.rewards).toHaveLength(0);
    ctx.mapId = 'temple';
    instance.onMapChange!('temple');
    // Trả ngay trong onMapChange, không đợi cuộn dừng.
    expect(ctx.rewards.map((r) => [r.pid, r.base])).toEqual([['a', 5 * NOHU.paytable.bia]]);
    expect(wallet('a')).toEqual([300 - 5 + 5 * NOHU.paytable.bia, 200 - 5 + 5 * NOHU.paytable.bia]);
    expect(st().machines[0]!.spin).toMatchObject({ done: true, win: 5 * NOHU.paytable.bia });
    expect(st().machines.every((m) => m.pid === null)).toBe(true);
    expect(ctx.closes.map((c) => c.pid).sort()).toEqual(['a', 'b']);
    // Không còn hẹn giờ nào trả thưởng sau khi đổi map.
    ctx.advance(NOHU.spinMs * 2, instance);
    expect(ctx.rewards).toHaveLength(1);
    expect(instance.isBusy!()).toBe(false);
  });
});
