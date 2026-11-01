// Nổ Hũ (Sòng Công Đức) phía server: 4 máy xèng cá nhân (1 người/máy, trạm slot_machine_N) + Hũ Công Đức thuộc phòng.
// Không theo ván, không dùng StakeBook: mỗi lượt tự ctx.wager(mức cược) → góp NOHU.jackpotShare vào hũ → quyết 3 ô dừng
// ngay bằng ctx.rng (trạng thái công khai có luôn kết quả để mọi máy vẽ cuộn dừng đúng ô) → trả thưởng raw, không vào
// Quỹ, đúng lúc cuộn 3 dừng (stopAt). Nổ hũ ăn theo tỉ lệ mức cược (noHuJackpotPay: cược / cược tối đa × quỹ lúc đó,
// phần nguyên; cược tối đa ăn trọn hũ), phần còn lại ở lại hũ, dưới NOHU.jackpotSeed thì bù lên mức gốc (giữ phần lẻ).
// Esc / đi xa / mất kết nối / rời phòng → nhả máy; lượt đang quay vẫn được trả lúc cuộn dừng nếu người quay còn trong
// phòng (rời hẳn trước lúc cuộn dừng thì không trả, hũ giữ nguyên — không mất quỹ). Đổi map → chốt ngay lượt đang quay
// rồi nhả máy; Nổ Hũ không bao giờ chặn đổi map (isBusy luôn false).
import { z } from 'zod';
import { JOKES, NOHU, SONG_BAC, type Pid } from '@shared/index';
import {
  NOHU_FUND_SCALE,
  NOHU_STRIPS,
  noHuJackpotPay,
  noHuJackpotShare,
  noHuPayout,
  noHuSymbolsAt,
  type NoHuMachine,
  type NoHuPublicState,
  type NoHuSpin,
} from '@shared/activities/nohu';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

/** Hũ giữ theo phần nghìn Công Đức (số nguyên) để cộng dồn phần lẻ của các lần góp mà không trôi số thực. */
const SCALE = NOHU_FUND_SCALE;
const LABEL = 'Nổ Hũ';
const spinMsg = z.object({ bet: z.literal(NOHU.bets) });
const stationOf = (id: number) => `slot_machine_${id}`;

function createNoHu(ctx: ActivityContext): ActivityInstance {
  let fund = NOHU.jackpotSeed * SCALE;
  const machines: NoHuMachine[] = Array.from({ length: NOHU.machines }, (_, i) => ({ id: i + 1, pid: null, name: null, spin: null }));
  const state: NoHuPublicState = { jackpot: NOHU.jackpotSeed, machines, lastJackpot: null };
  /** Giờ server của lượt gần nhất từng máy (chống quay dồn). */
  const lastSpinAt = machines.map(() => -Infinity);
  /** Hẹn giờ chốt lượt đang quay của từng máy (hủy khi phòng đóng). */
  const pending = new Map<number, () => void>();

  const publish = () => {
    state.jackpot = Math.floor(fund / SCALE);
    ctx.setState(structuredClone(state));
  };
  const machineOf = (pid: Pid) => machines.find((m) => m.pid === pid);
  /** Người ngồi máy còn ở đó: còn trong phòng, còn kết nối, chưa đi xa quá bán kính trạm + leaveSlack. */
  const present = (pid: Pid, m: NoHuMachine) => {
    const p = ctx.player(pid);
    return !!p && p.connected && ctx.isNear(pid, stationOf(m.id), NOHU.leaveSlack);
  };

  /** Nhả máy (không gửi trạng thái). `closeReason` = module tự đóng giao diện của người đó (act leave, đi xa, đổi map). */
  function vacate(m: NoHuMachine, closeReason?: string): void {
    const pid = m.pid;
    if (!pid) return;
    m.pid = null;
    m.name = null;
    if (closeReason && ctx.player(pid)?.activity === 'nohu') ctx.close(pid, closeReason);
  }

  function spin(p: ServerPlayerView, m: NoHuMachine, bet: number): void {
    const now = ctx.now();
    if ((m.spin && !m.spin.done) || now - lastSpinAt[m.id - 1]! < NOHU.minIntervalMs) return;
    if (!ctx.wager(p.pid, bet)) return ctx.toast(p.pid, `Cần đủ Đức để quay (đang có ${p.duc}).`, 'warn');
    lastSpinAt[m.id - 1] = now;
    fund += Math.round(bet * NOHU.jackpotShare * SCALE);
    const stops: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) stops[k] = ctx.rng.int(0, NOHU_STRIPS[k]!.length - 1);
    const symbols = noHuSymbolsAt(stops);
    const pay = noHuPayout(symbols);
    const s: NoHuSpin = {
      pid: p.pid,
      name: p.name,
      stops,
      symbols,
      bet,
      startAt: now,
      stopAt: now + NOHU.spinMs,
      win: pay === 'jackpot' ? 0 : bet * pay,
      jackpot: pay === 'jackpot',
      done: false,
    };
    m.spin = s;
    ctx.addTapNiem(p.pid, NOHU.tapNiemPerSpin, true);
    pending.set(
      m.id,
      ctx.setTimeout(() => settle(m, s), NOHU.spinMs),
    );
    publish();
  }

  /** Cuộn 3 dừng: trả thưởng (nổ hũ thì chốt quỹ lúc này); người quay đã rời phòng thì không trả, hũ giữ nguyên. */
  function settle(m: NoHuMachine, s: NoHuSpin): void {
    pending.delete(m.id);
    if (s.done) return;
    s.done = true;
    if (!ctx.player(s.pid)) {
      s.win = 0;
    } else if (s.jackpot) {
      const { amount, fund: rest } = noHuJackpotPay(fund, s.bet);
      fund = rest;
      s.win = amount;
      state.lastJackpot = { name: s.name, amount, at: ctx.now(), machine: m.id };
      ctx.reward(s.pid, amount, { raw: true, noPool: true, label: LABEL });
      celebrate(m.id, s.name, amount, s.bet);
    } else if (s.win > 0) {
      ctx.reward(s.pid, s.win, { raw: true, noPool: true, label: LABEL });
    }
    publish();
  }

  /** Nổ hũ: banner + pháo giấy + nhạc nổ hũ + còi cho cả phòng, tin chat (mưa xu do client vẽ theo lastJackpot). */
  function celebrate(id: number, name: string, amount: number, bet: number): void {
    const x = SONG_BAC.slots.xs[id - 1] ?? SONG_BAC.jackpot.x;
    const pct = Math.round(noHuJackpotShare(bet) * 100);
    const left = Math.floor(fund / SCALE);
    const full = pct >= 100;
    const sub = full
      ? `${name} ăn trọn Hũ Công Đức: +${amount} Công Đức!`
      : `${name} ăn ${pct}% Hũ Công Đức (cược ${bet}): +${amount} Công Đức!`;
    ctx.fx({ type: 'banner', title: '🏺 NỔ HŨ!', sub, tone: 'gold', big: true });
    ctx.fx({ type: 'confetti', x, z: SONG_BAC.slots.standZ });
    ctx.fx({ type: 'sound', id: 'jackpot' });
    ctx.fx({ type: 'sound', id: 'airhorn', volume: 0.6 });
    ctx.chatSystem(
      full
        ? `🏺 ${name} NỔ HŨ ${amount} Công Đức ở máy Nổ Hũ số ${id}! Hũ Công Đức về lại ${left}.`
        : `🏺 ${name} NỔ HŨ ${amount} Công Đức (${pct}% hũ, cược ${bet}) ở máy Nổ Hũ số ${id}! Hũ Công Đức còn ${left}.`,
    );
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'slot_machine') return;
      const m = machines[Number(/^slot_machine_(\d+)$/.exec(station.id)?.[1]) - 1];
      if (!m) return;
      if (m.pid && m.pid !== p.pid) {
        if (present(m.pid, m)) return ctx.toast(p.pid, `Máy ${m.id} đang có ${m.name} chơi — sang máy khác nhé.`, 'info');
        vacate(m, 'far');
      }
      const old = machineOf(p.pid);
      if (old && old !== m) vacate(old);
      m.pid = p.pid;
      m.name = p.name;
      publish();
      ctx.open(p.pid, { machine: m.id });
    },

    onAction(p, type, data) {
      if (type === 'leave') {
        const m = machineOf(p.pid);
        if (m) {
          vacate(m, 'leave');
          publish();
        } else if (p.activity === 'nohu') ctx.close(p.pid, 'leave');
        return;
      }
      if (type !== 'spin') return;
      const r = spinMsg.safeParse(data);
      const m = machineOf(p.pid);
      if (!r.success || !m) return;
      if (!present(p.pid, m)) {
        vacate(m, 'far');
        publish();
        return ctx.toast(p.pid, JOKES.tooFar, 'warn');
      }
      spin(p, m, r.data.bet);
    },

    onLeave(p) {
      // Esc / mất kết nối / rời phòng: nhả máy (host tự đóng giao diện); lượt đang quay vẫn chốt ở stopAt.
      const m = machineOf(p.pid);
      if (!m) return;
      vacate(m);
      publish();
    },

    tick() {
      if (ctx.map() !== 'bar') return;
      let changed = false;
      for (const m of machines) {
        if (!m.pid || present(m.pid, m)) continue;
        const pid = m.pid;
        vacate(m, 'far');
        if (ctx.player(pid)?.connected) ctx.toast(pid, 'Đã rời máy Nổ Hũ.', 'info');
        changed = true;
      }
      if (changed) publish();
    },

    // Không chặn đổi map: mỗi lượt bận 2,2 s trong nhịp tối thiểu 2,4 s nên một người quay liên tục là chặn Hồi Sơn gần
    // như mãi mãi. Thay vào đó onMapChange chốt ngay các lượt đang quay (kết quả đã quyết từ lúc quay).
    isBusy: () => false,

    onMapChange() {
      // Chốt ngay lượt đang quay (hủy hẹn giờ, trả đúng số đã quyết nếu người quay còn trong phòng) rồi mới nhả máy —
      // không còn hẹn giờ nào trả thưởng sau khi đổi map.
      for (const m of machines) {
        if (m.spin && !m.spin.done) {
          pending.get(m.id)?.();
          settle(m, m.spin);
        }
        vacate(m, 'map');
      }
      publish();
    },

    dispose() {
      for (const cancel of pending.values()) cancel();
      pending.clear();
    },
  };
}

export const noHuModule: ActivityServerModule = { id: 'nohu', maps: ['bar'], create: createNoHu };
