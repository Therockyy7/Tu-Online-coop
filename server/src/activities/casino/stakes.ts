// Sổ cược dùng chung cho các bàn Sòng Công Đức theo ván (Tài Xỉu, Xì Dách, Bài Cào, Đua Ngựa): đặt cược trừ Công Đức
// thật qua ctx.wager, gỡ / hoàn trả đúng số đã cược (im lặng), chốt ván trả thưởng raw (không vào Quỹ) + Tạp Niệm.
// Module bàn tự lo luật + trạng thái công khai; sổ chỉ giữ tiền.
import { CASINO, type Pid } from '@shared/index';
import { type CasinoSettleLine, type StakeMap } from '@shared/activities/casino';
import type { ActivityContext, ServerPlayerView } from '../types';

const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);

export class StakeBook {
  private readonly book = new Map<Pid, Map<string, number>>();
  private readonly names = new Map<Pid, string>();

  constructor(
    private readonly ctx: ActivityContext,
    /** Nhãn cạnh số "+N" khi thắng, vd 'Tài Xỉu'. */
    private readonly label: string,
    private readonly maxPerRound: number = CASINO.maxBetPerRound,
  ) {}

  /** Đặt thêm `amount` Công Đức vào ô `key`. Trả null nếu được, hoặc câu báo lỗi để module toast. */
  place(p: ServerPlayerView, key: string, amount: number): string | null {
    if (!Number.isInteger(amount) || amount <= 0) return 'Mức cược không hợp lệ.';
    if (this.totalOf(p.pid) + amount > this.maxPerRound) return `Tối đa ${this.maxPerRound} Công Đức mỗi ván.`;
    if (!this.ctx.wager(p.pid, amount)) return `Cần đủ Đức để đặt cược (đang có ${p.duc}).`;
    let m = this.book.get(p.pid);
    if (!m) {
      m = new Map();
      this.book.set(p.pid, m);
    }
    m.set(key, (m.get(key) ?? 0) + amount);
    this.names.set(p.pid, p.name);
    return null;
  }

  /** Gỡ tối đa `amount` khỏi ô `key` và hoàn lại (im lặng). Trả số đã gỡ (0 nếu ô trống). */
  remove(pid: Pid, key: string, amount: number): number {
    const m = this.book.get(pid);
    const cur = m?.get(key) ?? 0;
    const n = Math.min(cur, Math.max(0, Math.floor(amount)));
    if (!m || n <= 0) return 0;
    if (cur > n) m.set(key, cur - n);
    else m.delete(key);
    if (m.size === 0) this.book.delete(pid);
    this.pay(pid, n, true);
    return n;
  }

  totalOf(pid: Pid): number {
    const m = this.book.get(pid);
    return m ? sum(m) : 0;
  }

  /** Tổng cả bàn đặt vào ô `key`. */
  totalOn(key: string): number {
    let t = 0;
    for (const m of this.book.values()) t += m.get(key) ?? 0;
    return t;
  }

  of(pid: Pid): StakeMap {
    return Object.fromEntries(this.book.get(pid) ?? []);
  }

  /** Bản chụp cả sổ (đưa vào trạng thái công khai). */
  snapshot(): Record<Pid, StakeMap> {
    const out: Record<Pid, StakeMap> = {};
    for (const [pid, m] of this.book) out[pid] = Object.fromEntries(m);
    return out;
  }

  nameOf(pid: Pid): string {
    return this.names.get(pid) ?? pid;
  }

  /** Người có cược, theo thứ tự đặt lần đầu (dùng xếp ghế). */
  bettors(): Pid[] {
    return [...this.book.keys()];
  }

  has(pid: Pid): boolean {
    return this.book.has(pid);
  }

  get isEmpty(): boolean {
    return this.book.size === 0;
  }

  /** Hoàn toàn bộ cược của 1 người (`pid`) hoặc cả bàn (bỏ trống) — rời bàn, đổi map, hủy ván. */
  refund(pid?: Pid): void {
    const pids = pid === undefined ? [...this.book.keys()] : [pid];
    for (const id of pids) {
      const t = this.totalOf(id);
      this.book.delete(id);
      if (t > 0) this.pay(id, t, true);
    }
    if (pid === undefined) this.names.clear();
  }

  /**
   * Chốt ván: `returns[pid]` = tổng Công Đức trả lại người đó (gồm tiền cược khi thắng/hòa; thiếu = 0 = thua hết).
   * Thắng: số bay "+N · nhãn"; hòa: hoàn im lặng; mỗi người có cược +Tạp Niệm; toast thắng/thua/hòa; xóa sổ.
   * Người đã rời hẳn phòng (mất kết nối tạm thì vẫn còn trong phòng) không được trả gì = mất cược: dòng kết quả ghi đúng
   * back 0, net −cược để bảng / tin chat không hiện "thắng" ảo. Trả bảng kết quả từng người.
   */
  settle(returns: Record<Pid, number>): CasinoSettleLine[] {
    const lines: CasinoSettleLine[] = [];
    for (const [pid, m] of this.book) {
      const staked = sum(m);
      const here = !!this.ctx.player(pid);
      const back = here ? Math.max(0, Math.floor(returns[pid] ?? 0)) : 0;
      const net = back - staked;
      lines.push({ pid, name: this.nameOf(pid), staked, back, net });
      if (!here) continue;
      if (back > 0) this.pay(pid, back, net === 0);
      this.ctx.addTapNiem(pid, CASINO.tapNiemPerRound, true);
      if (net > 0) this.ctx.toast(pid, `Thắng +${net} Công Đức! 🎉`, 'good');
      else if (net < 0) this.ctx.toast(pid, `Thua ${-net} Công Đức. Cờ bạc là bác thằng bần…`, 'bad');
      else this.ctx.toast(pid, `Hòa — hoàn ${staked} Công Đức.`, 'info');
    }
    this.clear();
    return lines;
  }

  clear(): void {
    this.book.clear();
    this.names.clear();
  }

  private pay(pid: Pid, amount: number, silent: boolean): void {
    if (!this.ctx.player(pid)) return;
    this.ctx.reward(pid, amount, { raw: true, noPool: true, silent, label: this.label });
  }
}
