// Đua Ngựa (Sòng Công Đức) phía server: 1 đường đua, 2 lan can đặt cược (race_rail_1/2 — E ở lan can nào cũng là bàn
// này), cược "về nhất" bằng Công Đức thật qua StakeBook (ô 'horse_<i>'). Ván: mở ván → phong độ mới → tỉ lệ trả, đặt cược
// DUANGUA.betMs → bốc thứ tự về đích theo xác suất + sinh kịch bản, xuất phát (chuông) → DUANGUA.raceMs sau ngựa nhất chạm
// đích: trả thưởng → kết quả DUANGUA.resultMs → ván kế. Ván không ai cược vẫn đua (vào lịch sử, không báo chat); bàn tự
// nghỉ sau CASINO.idleRounds ván trống hoặc khi không còn ai đứng gần lan can nào; E / nút "Mở ván" để mở lại.
import { z } from 'zod';
import { CASINO, DUANGUA, JOKES, SONG_BAC, type Pid } from '@shared/index';
import {
  HORSES,
  horseKey,
  oddsLabel,
  raceFinishOrder,
  raceOdds,
  raceReturn,
  raceScript,
  raceWinner,
  type DuaNguaPublicState,
} from '@shared/activities/duangua';
import { StakeBook } from '../casino/stakes';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

/** Hai trạm khu vực của cùng một đường đua. */
const RAILS = SONG_BAC.race.rails.map((_, i) => `race_rail_${i + 1}`);
const betMsg = z.object({ horse: z.number().int().min(0).max(DUANGUA.horses - 1), amount: z.literal(CASINO.chips) });

function createDuaNgua(ctx: ActivityContext): ActivityInstance {
  const book = new StakeBook(ctx, 'Đua Ngựa');
  const state: DuaNguaPublicState = {
    phase: 'idle',
    endsAt: 0,
    round: 0,
    odds: [],
    probs: [],
    bets: {},
    names: {},
    race: null,
    winner: null,
    results: [],
    history: [],
  };
  let idleRounds = 0;
  let cancel: (() => void) | null = null;

  const publish = () => ctx.setState(structuredClone(state));
  /** Đứng gần một trong hai lan can (bán kính trạm + dung sai). */
  const near = (pid: Pid) => RAILS.some((id) => ctx.isNear(pid, id, CASINO.nearSlack));
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
  const toIdle = () => {
    Object.assign(state, { phase: 'idle', endsAt: 0, odds: [], probs: [], bets: {}, names: {}, race: null, winner: null, results: [] });
  };

  /** Ván mới: phong độ mới → xác suất + tỉ lệ (công khai ngay); chưa bốc ngựa thắng. */
  function startBetting(): void {
    const { probs, odds } = raceOdds(ctx.rng);
    state.phase = 'betting';
    state.round++;
    state.endsAt = ctx.now() + DUANGUA.betMs;
    state.odds = odds;
    state.probs = probs;
    state.race = null;
    state.winner = null;
    state.results = [];
    syncBets();
    publish();
    schedule(start, DUANGUA.betMs);
  }

  /** Hết giờ đặt: chốt sổ, bốc thứ tự về đích theo xác suất, phát kịch bản + chuông xuất phát. */
  function start(): void {
    const script = raceScript(ctx.rng, raceFinishOrder(ctx.rng, state.probs));
    const startAt = ctx.now();
    state.phase = 'resolving';
    state.race = { startAt, ...script };
    state.endsAt = startAt + DUANGUA.raceMs;
    publish();
    ctx.fx({ type: 'sound', id: 'race_bell', x: SONG_BAC.race.x, z: SONG_BAC.race.z });
    schedule(finish, DUANGUA.raceMs);
  }

  /** Ngựa nhất chạm đích: trả thưởng (sổ cộng Tạp Niệm + toast từng người), ghi lịch sử; các ngựa sau vẫn chạy nốt ở client. */
  function finish(): void {
    const w = raceWinner(state.race!);
    const anyBets = !book.isEmpty;
    syncBets(); // bản chụp lúc chốt để bảng còn hiện cược của ván này
    // Người đã rời hẳn phòng lúc đua bị settle bỏ qua (mất cược) — sửa dòng kết quả cho khỏi hiện "thắng" ảo.
    const gone = new Set(book.bettors().filter((pid) => !ctx.player(pid)));
    const returns: Record<Pid, number> = {};
    for (const pid of book.bettors()) returns[pid] = raceReturn(book.of(pid), w, state.odds);
    state.results = book.settle(returns).map((l) => (gone.has(l.pid) ? { ...l, back: 0, net: -l.staked } : l));
    state.winner = w;
    state.phase = 'result';
    state.endsAt = ctx.now() + DUANGUA.resultMs;
    state.history = [...state.history, { round: state.round, winner: w, odds: state.odds[w]! }].slice(-DUANGUA.history);
    publish();
    if (anyBets) ctx.chatSystem(`🏇 Đua Ngựa ván ${state.round}: ${HORSES[w]!.name} về nhất (${oddsLabel(state.odds[w]!)})!`);
    idleRounds = anyBets ? 0 : idleRounds + 1;
    schedule(next, DUANGUA.resultMs);
  }

  function next(): void {
    if (idleRounds >= CASINO.idleRounds || !anyoneNear()) {
      cancel = null;
      toIdle();
      publish();
    } else {
      startBetting();
    }
  }

  function openTrack(p: ServerPlayerView): void {
    idleRounds = 0;
    startBetting();
    ctx.chatSystem(`🏇 ${p.name} mở đường đua. Đặt cược ngựa về nhất trong ${Math.round(DUANGUA.betMs / 1000)} giây!`);
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind === 'race_rail' && state.phase === 'idle') openTrack(p);
    },
    onAction(p, type, data) {
      if (type === 'open') {
        if (state.phase === 'idle' && near(p.pid)) openTrack(p);
        return;
      }
      if (type !== 'bet' && type !== 'unbet') return;
      const r = betMsg.safeParse(data);
      if (!r.success) return;
      if (state.phase !== 'betting') {
        return ctx.toast(p.pid, type === 'bet' ? 'Ngoài giờ đặt cược — chờ ván sau nhé.' : 'Ngựa đã xuất phát, không gỡ cược được nữa.', 'warn');
      }
      if (!near(p.pid)) return ctx.toast(p.pid, JOKES.tooFar, 'warn');
      const key = horseKey(r.data.horse);
      if (type === 'bet') {
        const err = book.place(p, key, r.data.amount);
        if (err) return ctx.toast(p.pid, err, 'warn');
      } else if (book.remove(p.pid, key, r.data.amount) === 0) {
        return;
      }
      syncBets();
      publish();
    },
    onLeave(p, reason) {
      // Đang đặt cược mà rời phòng / mất kết nối → hoàn như Bầu Cua; Esc chỉ đóng bảng, cược giữ nguyên. Từ lúc xuất phát
      // kịch bản (giờ về đích lộ ngựa thắng) đã công khai tới lúc trả: rời hẳn phòng KHÔNG hoàn — settle bỏ qua người vắng
      // (mất cược), chặn trò "thấy ngựa mình thua thì thoát lấy lại cược"; mất kết nối tạm thì giữ, trả như thường.
      if (reason === 'esc' || state.phase !== 'betting' || !book.has(p.pid)) return;
      book.refund(p.pid);
      syncBets();
      publish();
    },
    isBusy: () => state.phase !== 'idle' && !book.isEmpty,
    onMapChange() {
      // Đổi map bị chặn khi có ván có cược (isBusy) — tới được đây thì cứ hoàn hết cho chắc rồi về nghỉ.
      cancel?.();
      cancel = null;
      book.refund();
      idleRounds = 0;
      toIdle();
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const duaNguaModule: ActivityServerModule = { id: 'duangua', maps: ['bar'], create: createDuaNgua };
