// Tài Xỉu chẵn lẻ (Sòng Công Đức) phía server: 3 xúc xắc, cược bằng Công Đức thật qua StakeBook.
// Ván: đặt cược TAIXIU.betMs → nhà cái lắc bát TAIXIU.rollMs → mở bát + trả thưởng TAIXIU.payoutMs → ván kế. Xúc xắc chỉ
// được gieo lúc mở bát (trạng thái lúc lắc không lộ gì). Bàn tự nghỉ sau CASINO.idleRounds ván liền không ai cược hoặc
// khi không còn ai đứng gần; bấm E ở bàn (hoặc nút "Mở ván" trên bảng) để mở lại.
import { z } from 'zod';
import { CASINO, JOKES, SONG_BAC, TAIXIU, type Pid } from '@shared/index';
import { TAIXIU_BETS, taiXiuOutcome, taiXiuReturn, type TaiXiuOutcome, type TaiXiuPublicState } from '@shared/activities/taixiu';
import { StakeBook } from '../casino/stakes';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const STATION = 'taixiu_table';
const betMsg = z.object({ bet: z.enum(TAIXIU_BETS), amount: z.literal(CASINO.chips) });

/** Mô tả kết quả cho tin chat, vd "TÀI · LẺ" hoặc "BỘ BA — nhà cái ăn Tài/Xỉu/Chẵn/Lẻ". */
function describe(o: TaiXiuOutcome): string {
  if (o.triple) return 'BỘ BA — nhà cái ăn Tài/Xỉu/Chẵn/Lẻ';
  return `${o.tai ? 'TÀI' : 'XỈU'} · ${o.chan ? 'CHẴN' : 'LẺ'}`;
}

function createTaiXiu(ctx: ActivityContext): ActivityInstance {
  const book = new StakeBook(ctx, 'Tài Xỉu');
  const state: TaiXiuPublicState = { phase: 'idle', endsAt: 0, round: 0, dice: [], bets: {}, names: {}, history: [], results: [] };
  let idleRounds = 0;
  let cancel: (() => void) | null = null;

  const publish = () => ctx.setState(structuredClone(state));
  const near = (pid: Pid) => ctx.isNear(pid, STATION, CASINO.nearSlack);
  const anyoneNear = () => ctx.players().some((p) => p.connected && near(p.pid));
  /** Chép sổ cược vào trạng thái công khai. */
  const syncBets = () => {
    state.bets = book.snapshot();
    state.names = Object.fromEntries(book.bettors().map((pid) => [pid, book.nameOf(pid)]));
  };
  const schedule = (fn: () => void, ms: number) => {
    cancel?.();
    cancel = ctx.setTimeout(fn, ms);
  };

  function startBetting(): void {
    state.phase = 'betting';
    state.round++;
    state.endsAt = ctx.now() + TAIXIU.betMs;
    state.dice = [];
    state.results = [];
    syncBets();
    publish();
    schedule(roll, TAIXIU.betMs);
  }

  /** Hết giờ đặt: chốt cược, nhà cái lắc bát. */
  function roll(): void {
    state.phase = 'resolving';
    state.endsAt = ctx.now() + TAIXIU.rollMs;
    publish();
    ctx.fx({ type: 'sound', id: 'dice_cup', x: SONG_BAC.taixiu.x, z: SONG_BAC.taixiu.z });
    schedule(reveal, TAIXIU.rollMs);
  }

  /** Mở bát: gieo 3 xúc xắc, trả thưởng (sổ cộng Tạp Niệm + toast từng người), ghi bảng cầu. */
  function reveal(): void {
    const dice = [ctx.rng.int(1, 6), ctx.rng.int(1, 6), ctx.rng.int(1, 6)];
    const o = taiXiuOutcome(dice);
    const anyBets = !book.isEmpty;
    syncBets(); // bản chụp lúc chốt để bảng còn hiện cược của ván này
    const returns: Record<Pid, number> = {};
    for (const pid of book.bettors()) returns[pid] = taiXiuReturn(book.of(pid), dice);
    state.results = book.settle(returns);
    state.dice = dice;
    state.phase = 'result';
    state.endsAt = ctx.now() + TAIXIU.payoutMs;
    state.history = [...state.history, { dice: [...dice], sum: o.sum }].slice(-TAIXIU.history);
    publish();
    if (anyBets) ctx.chatSystem(`🎲 Tài Xỉu ván ${state.round}: ${dice.join(' · ')} = ${o.sum} — ${describe(o)}`);
    idleRounds = anyBets ? 0 : idleRounds + 1;
    schedule(next, TAIXIU.payoutMs);
  }

  function next(): void {
    if (idleRounds >= CASINO.idleRounds || !anyoneNear()) {
      cancel = null;
      Object.assign(state, { phase: 'idle', endsAt: 0, dice: [], bets: {}, names: {}, results: [] });
      publish();
    } else {
      startBetting();
    }
  }

  function openTable(p: ServerPlayerView): void {
    idleRounds = 0;
    startBetting();
    ctx.chatSystem(`🎲 ${p.name} mở bàn Tài Xỉu. Đặt cược trong ${Math.round(TAIXIU.betMs / 1000)} giây!`);
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind === 'taixiu_table' && state.phase === 'idle') openTable(p);
    },
    onAction(p, type, data) {
      if (type === 'open') {
        if (state.phase === 'idle' && near(p.pid)) openTable(p);
        return;
      }
      if (type !== 'bet' && type !== 'unbet') return;
      const r = betMsg.safeParse(data);
      if (!r.success) return;
      if (state.phase !== 'betting') {
        return ctx.toast(p.pid, type === 'bet' ? 'Ngoài giờ đặt cược — chờ ván sau nhé.' : 'Đã chốt ván, không gỡ cược được nữa.', 'warn');
      }
      if (!near(p.pid)) return ctx.toast(p.pid, JOKES.tooFar, 'warn');
      if (type === 'bet') {
        const err = book.place(p, r.data.bet, r.data.amount);
        if (err) return ctx.toast(p.pid, err, 'warn');
      } else if (book.remove(p.pid, r.data.bet, r.data.amount) === 0) {
        return;
      }
      syncBets();
      publish();
    },
    onLeave(p, reason) {
      // Như Bầu Cua: đang đặt cược mà rời phòng / mất kết nối → hoàn. Đã chốt (đang lắc) mà chỉ mất kết nối tạm thời
      // → giữ cược, mở bát vẫn trả như thường; rời hẳn trước khi mở bát → hoàn. Esc chỉ đóng bảng, cược giữ nguyên.
      if (!book.has(p.pid) || reason === 'esc') return;
      const unpaid = state.phase === 'betting' || (state.phase === 'resolving' && reason !== 'disconnect');
      if (!unpaid) return;
      book.refund(p.pid);
      syncBets();
      publish();
    },
    isBusy: () => state.phase !== 'idle' && !book.isEmpty,
    onMapChange() {
      cancel?.();
      cancel = null;
      // Ván chưa mở bát (đang đặt hoặc đang lắc) thì hoàn toàn bộ cược.
      book.refund();
      idleRounds = 0;
      Object.assign(state, { phase: 'idle', endsAt: 0, dice: [], bets: {}, names: {}, results: [] });
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const taiXiuModule: ActivityServerModule = { id: 'taixiu', maps: ['bar'], create: createTaiXiu };
