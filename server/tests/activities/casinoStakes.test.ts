// Sổ cược Sòng Công Đức: trừ Công Đức thật lúc đặt, gỡ/hoàn đúng số, chốt ván trả thưởng raw + Tạp Niệm.
import { describe, expect, it } from 'vitest';
import { CASINO } from '@shared/index';
import { StakeBook } from '../../src/activities/casino/stakes';
import { FakeActivityContext } from '../helpers/fakeContext';

function setup() {
  const ctx = new FakeActivityContext('taixiu');
  ctx.mapId = 'bar';
  ctx.addPlayer({ pid: 'a', congDuc: 300, duc: 120 });
  ctx.addPlayer({ pid: 'b', congDuc: 50, duc: 50 });
  return { ctx, book: new StakeBook(ctx, 'Tài Xỉu') };
}

describe('StakeBook — cược bằng Công Đức thật', () => {
  it('đặt cược trừ cả Công Đức lẫn Đức; thiếu Đức hoặc vượt trần bị từ chối, không trừ gì', () => {
    const { ctx, book } = setup();
    expect(book.place(ctx.view('a'), 'tai', 10)).toBeNull();
    expect(book.place(ctx.view('a'), 'chan', 5)).toBeNull();
    const a = ctx.playersById.get('a')!;
    expect([a.congDuc, a.duc]).toEqual([285, 105]);
    expect(book.totalOf('a')).toBe(15);
    expect(book.of('a')).toEqual({ tai: 10, chan: 5 });
    expect(book.place(ctx.view('a'), 'tai', CASINO.maxBetPerRound)).toMatch(/Tối đa/);
    expect(book.place(ctx.view('b'), 'xiu', 51)).toMatch(/Cần đủ Đức/);
    expect(book.place(ctx.view('b'), 'xiu', 2.5)).toMatch(/không hợp lệ/);
    expect(ctx.playersById.get('b')!.congDuc).toBe(50);
    expect(ctx.wagers).toEqual([
      { pid: 'a', amount: 10 },
      { pid: 'a', amount: 5 },
    ]);
  });

  it('gỡ cược hoàn lại im lặng đúng số đã đặt; hoàn cả bàn khi hủy ván', () => {
    const { ctx, book } = setup();
    book.place(ctx.view('a'), 'tai', 10);
    book.place(ctx.view('b'), 'le', 20);
    expect(book.remove('a', 'tai', 50)).toBe(10);
    expect(book.has('a')).toBe(false);
    expect(ctx.playersById.get('a')!.congDuc).toBe(300);
    expect(ctx.rewards.at(-1)!.opts).toMatchObject({ raw: true, noPool: true, silent: true });
    book.refund();
    expect(book.isEmpty).toBe(true);
    expect(ctx.playersById.get('b')!.duc).toBe(50);
  });

  it('chốt ván: thắng trả (cược + lãi) có số bay, hòa hoàn im lặng, thua mất cược; ai có cược +Tạp Niệm', () => {
    const { ctx, book } = setup();
    ctx.addPlayer({ pid: 'c', congDuc: 40, duc: 40 });
    book.place(ctx.view('a'), 'tai', 10);
    book.place(ctx.view('b'), 'xiu', 10);
    book.place(ctx.view('c'), 'chan', 10);
    const lines = book.settle({ a: 20, c: 10 });
    expect(lines.map((l) => [l.pid, l.net])).toEqual([
      ['a', 10],
      ['b', -10],
      ['c', 0],
    ]);
    expect(ctx.playersById.get('a')!.congDuc).toBe(310);
    expect(ctx.playersById.get('b')!.congDuc).toBe(40);
    expect(ctx.playersById.get('c')!.congDuc).toBe(40);
    const winReward = ctx.rewards.find((r) => r.pid === 'a')!;
    expect(winReward.opts).toMatchObject({ raw: true, noPool: true, silent: false, label: 'Tài Xỉu' });
    expect(ctx.rewards.find((r) => r.pid === 'c')!.opts?.silent).toBe(true);
    for (const pid of ['a', 'b', 'c']) expect(ctx.playersById.get(pid)!.tapNiem).toBe(CASINO.tapNiemPerRound);
    expect(book.isEmpty).toBe(true);
  });

  it('chốt ván khi người có cược đã rời hẳn phòng: không trả gì, dòng kết quả ghi back 0 · net −cược (không "thắng" ảo)', () => {
    const { ctx, book } = setup();
    book.place(ctx.view('a'), 'tai', 10);
    book.place(ctx.view('b'), 'xiu', 20);
    ctx.playersById.delete('b');
    const lines = book.settle({ a: 20, b: 40 });
    expect(lines.map((l) => [l.pid, l.staked, l.back, l.net])).toEqual([
      ['a', 10, 20, 10],
      ['b', 20, 0, -20],
    ]);
    expect(ctx.rewards.map((r) => r.pid)).toEqual(['a']);
    expect(ctx.toasts.map((t) => t.target)).toEqual(['a']);
    expect(book.isEmpty).toBe(true);
  });

  it('thua có thể làm tụt cấp (Công Đức tích lũy bị trừ thật)', () => {
    const ctx = new FakeActivityContext('taixiu');
    ctx.addPlayer({ pid: 'm', congDuc: 105, duc: 105 });
    expect(ctx.view('m').rank).toBe('hoa_thuong_tap_su');
    const book = new StakeBook(ctx, 'Tài Xỉu');
    book.place(ctx.view('m'), 'tai', 10);
    book.settle({});
    expect(ctx.view('m').rank).toBe('tieu_dong');
  });
});
