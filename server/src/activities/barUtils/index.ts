// Tiện ích Quán Bar phía server: Quầy đổi Đức (8.1), Gọi đồ uống + Độ Say (8.2), Vòng quay sự thật (8.7),
// Bầu Cua Cá Cọp (8.6). Mỗi hoạt động là một module riêng; giao diện mở ở client, server kiểm và quyết định.
import { z } from 'zod';
import {
  BAUCUA,
  BAUCUA_NAMES,
  BAUCUA_SYMBOLS,
  DARE_PROMPTS,
  DRINKS,
  EXCHANGE,
  JOKES,
  TRUTHWHEEL,
  TRUTH_PROMPTS,
  type BauCuaSymbol,
  type Pid,
} from '@shared/index';
import { WHEEL_SEGMENTS, bauCuaReturn, segmentKind, totalBet, type BauCuaState, type TruthWheelState } from '@shared/activities/bar';
import type { ActivityContext, ActivityInstance, ActivityServerModule } from '../types';

// ───────────────────────── Quầy đổi Đức ─────────────────────────

const xuMsg = z.object({ duc: z.number().int().min(1).max(EXCHANGE.maxExchangePerAction) });

function createExchange(ctx: ActivityContext): ActivityInstance {
  return {
    onAction(p, type, data) {
      if (!ctx.isNear(p.pid, 'exchange_kiosk', 1.5)) return ctx.toast(p.pid, JOKES.tooFar, 'warn');
      if (type === 'xu') {
        const r = xuMsg.safeParse(data);
        if (!r.success) return;
        if (!ctx.spendDuc(p.pid, r.data.duc)) return ctx.toast(p.pid, `Không đủ Đức (đang có ${p.duc}).`, 'warn');
        ctx.addXu(p.pid, r.data.duc * EXCHANGE.xuPerDuc);
        ctx.fx({ type: 'sound', id: 'coin', x: p.x, z: p.z });
        ctx.toast(p.pid, `Đã đổi ${r.data.duc} Đức lấy ${r.data.duc * EXCHANGE.xuPerDuc} Xu.`, 'good');
      } else if (type === 'baoquan') {
        if (!ctx.spendDuc(p.pid, EXCHANGE.baoQuanCost)) return ctx.toast(p.pid, `Bao cả quán cần ${EXCHANGE.baoQuanCost} Đức.`, 'warn');
        for (const other of ctx.players()) ctx.addXu(other.pid, EXCHANGE.baoQuanXu);
        ctx.setTitle(p.pid, 'Đại gia');
        ctx.fx({ type: 'banner', title: `💸 Đại gia ${p.name} bao cả quán!`, sub: `Mỗi người +${EXCHANGE.baoQuanXu} Xu`, tone: 'gold', big: true });
        ctx.fx({ type: 'confetti' });
        ctx.fx({ type: 'sound', id: 'cheer' });
        ctx.chatSystem(`💸 ${p.name} bao cả quán: mọi người +${EXCHANGE.baoQuanXu} Xu!`);
      } else if (type === 'vip') {
        if (p.vip) return ctx.toast(p.pid, 'Bạn đã có Vé VIP rồi.', 'info');
        if (!ctx.spendDuc(p.pid, EXCHANGE.vipCost)) return ctx.toast(p.pid, `Vé VIP cần ${EXCHANGE.vipCost} Đức.`, 'warn');
        ctx.setVip(p.pid);
        ctx.fx({ type: 'banner', title: '🎟️ Vé VIP vĩnh viễn!', sub: 'Vào khu VIP, mở đồ VIP, đồ uống giảm 50%', tone: 'gold', big: true }, p.pid);
        ctx.fx({ type: 'sound', id: 'rankup', x: p.x, z: p.z });
        ctx.chatSystem(`🎟️ ${p.name} vừa lên VIP!`);
      }
    },
  };
}

export const exchangeModule: ActivityServerModule = { id: 'exchange', maps: ['bar'], create: createExchange };

// ───────────────────────── Đồ uống ─────────────────────────

const buyMsg = z.object({ id: z.string().max(40) });

function createDrink(ctx: ActivityContext): ActivityInstance {
  return {
    onAction(p, type, data) {
      if (type === 'buy') {
        const r = buyMsg.safeParse(data);
        const def = r.success ? DRINKS.menu.find((d) => d.id === r.data.id) : undefined;
        if (!def) return;
        if (!ctx.isNear(p.pid, 'drink_counter', 1.5)) return ctx.toast(p.pid, JOKES.tooFar, 'warn');
        if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
        const price = Math.round(def.price * (p.vip ? DRINKS.vipDiscount : 1));
        if (!ctx.addXu(p.pid, -price)) return ctx.toast(p.pid, `Không đủ Xu (cần ${price}). Ra quầy đổi Đức nha!`, 'warn');
        ctx.setHeld(p.pid, { kind: 'drink_glass', variant: def.id });
        ctx.toast(p.pid, `${def.name} đây! Bấm Space để uống.`, 'good');
      } else if (type === 'drink') {
        if (p.held?.kind !== 'drink_glass') return;
        const def = DRINKS.menu.find((d) => d.id === p.held?.variant) ?? DRINKS.menu[0]!;
        ctx.setHeld(p.pid, null);
        ctx.addDoSay(p.pid, def.say);
        ctx.addTapNiem(p.pid, def.tapNiem);
        ctx.fx({ type: 'sound', id: 'burp', x: p.x, z: p.z }, ctx.players().filter((o) => o.pid !== p.pid).map((o) => o.pid));
      }
    },
  };
}

export const drinkModule: ActivityServerModule = { id: 'drink', maps: ['bar'], create: createDrink };

// ───────────────────────── Vòng quay sự thật ─────────────────────────

function createTruthWheel(ctx: ActivityContext): ActivityInstance {
  const state: TruthWheelState = { startAt: 0, endAt: 0, segment: 0, targetPid: null, targetName: '', kind: 'truth', text: '', cooldownUntil: 0 };
  let cancel: (() => void) | null = null;
  ctx.setState({ ...state });
  return {
    onInteract(p, station) {
      if (station.kind !== 'truth_wheel') return;
      const now = ctx.now();
      if (now < state.cooldownUntil) {
        return ctx.toast(p.pid, `Vòng quay đang nghỉ, chờ ${Math.ceil((state.cooldownUntil - now) / 1000)} giây nữa.`, 'info');
      }
      const pool = ctx.players().filter((x) => x.connected);
      const target = ctx.rng.pick(pool);
      const kind = ctx.rng.chance(0.5) ? 'truth' : 'dare';
      const segs = Array.from({ length: WHEEL_SEGMENTS }, (_, i) => i).filter((i) => segmentKind(i) === kind);
      Object.assign(state, {
        startAt: now + 200,
        endAt: now + 200 + TRUTHWHEEL.spinMs,
        segment: ctx.rng.pick(segs),
        targetPid: target.pid,
        targetName: target.name,
        kind,
        text: ctx.rng.pick(kind === 'truth' ? TRUTH_PROMPTS : DARE_PROMPTS),
        cooldownUntil: now + 200 + TRUTHWHEEL.spinMs + TRUTHWHEEL.cooldownMs,
      });
      ctx.setState({ ...state });
      ctx.chatSystem(`🎡 ${p.name} quay vòng sự thật…`);
      cancel?.();
      cancel = ctx.setTimeout(() => {
        const label = state.kind === 'truth' ? 'SỰ THẬT' : 'THỬ THÁCH';
        ctx.fx({ type: 'banner', title: `🎡 ${state.targetName} — ${label}`, sub: state.text, tone: 'gold', big: true });
        ctx.fx({ type: 'sound', id: 'success' });
        ctx.chatSystem(`🎡 ${state.targetName} — [${label}] ${state.text}`);
      }, TRUTHWHEEL.spinMs + 200);
    },
    dispose() {
      cancel?.();
    },
  };
}

export const truthWheelModule: ActivityServerModule = { id: 'truthwheel', maps: ['bar'], create: createTruthWheel };

// ───────────────────────── Bầu Cua Cá Cọp ─────────────────────────

const symMsg = z.object({ sym: z.enum(BAUCUA_SYMBOLS) });

function createBauCua(ctx: ActivityContext): ActivityInstance {
  const state: BauCuaState = { phase: 'idle', endsAt: 0, round: 0, dice: [], bets: {}, names: {} };
  let idleRounds = 0;
  let cancel: (() => void) | null = null;
  const publish = () => ctx.setState(structuredClone(state));
  const near = (pid: Pid) => ctx.isNear(pid, 'baucua_table', BAUCUA.nearRange - 3.2);
  const anyoneNear = () => ctx.players().some((p) => p.connected && near(p.pid));

  function startBetting(): void {
    state.phase = 'betting';
    state.round++;
    state.endsAt = ctx.now() + BAUCUA.betMs;
    state.dice = [];
    state.bets = {};
    state.names = {};
    publish();
    cancel = ctx.setTimeout(roll, BAUCUA.betMs);
  }

  function roll(): void {
    state.phase = 'rolling';
    state.endsAt = ctx.now() + BAUCUA.rollMs;
    publish();
    ctx.fx({ type: 'sound', id: 'dice', x: 17.5, z: 8.2 });
    cancel = ctx.setTimeout(payout, BAUCUA.rollMs);
  }

  function payout(): void {
    state.dice = [ctx.rng.pick(BAUCUA_SYMBOLS), ctx.rng.pick(BAUCUA_SYMBOLS), ctx.rng.pick(BAUCUA_SYMBOLS)];
    state.phase = 'payout';
    state.endsAt = ctx.now() + BAUCUA.payoutMs;
    const anyBets = Object.keys(state.bets).length > 0;
    for (const [pid, bets] of Object.entries(state.bets)) {
      if (totalBet(bets) === 0) continue;
      const back = bauCuaReturn(bets, state.dice);
      if (back > 0) ctx.addXu(pid, back);
      ctx.addTapNiem(pid, BAUCUA.tapNiem, true);
      const net = back - totalBet(bets);
      ctx.toast(pid, net > 0 ? `Thắng ${net} Xu! 🎉` : net < 0 ? `Thua ${-net} Xu. Ván sau gỡ!` : 'Hòa vốn.', net > 0 ? 'good' : 'info');
    }
    publish();
    ctx.chatSystem(`🎲 Bầu Cua: ${state.dice.map((d) => BAUCUA_NAMES[d]).join(' · ')}`);
    idleRounds = anyBets ? 0 : idleRounds + 1;
    cancel = ctx.setTimeout(() => {
      if (idleRounds >= BAUCUA.idleRounds || !anyoneNear()) {
        state.phase = 'idle';
        state.bets = {};
        publish();
      } else {
        startBetting();
      }
    }, BAUCUA.payoutMs);
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'baucua_table') return;
      if (state.phase === 'idle') {
        idleRounds = 0;
        startBetting();
        ctx.chatSystem(`🎲 ${p.name} mở sòng Bầu Cua. Đặt cược trong 15 giây!`);
      }
    },
    onAction(p, type, data) {
      if (type !== 'bet' && type !== 'unbet') return;
      const r = symMsg.safeParse(data);
      if (!r.success || state.phase !== 'betting') return;
      if (!near(p.pid)) return ctx.toast(p.pid, JOKES.tooFar, 'warn');
      const sym: BauCuaSymbol = r.data.sym;
      if (type === 'bet') {
        const mine = state.bets[p.pid] ?? {};
        if (totalBet(mine) + BAUCUA.chip > BAUCUA.maxBetPerRound) return ctx.toast(p.pid, `Tối đa ${BAUCUA.maxBetPerRound} Xu mỗi ván.`, 'warn');
        if (!ctx.addXu(p.pid, -BAUCUA.chip)) return ctx.toast(p.pid, 'Hết Xu rồi! Ra quầy đổi Đức nha.', 'warn');
        // Chỉ tạo mục cược khi đã trừ Xu thành công (không để mục rỗng làm bàn "bận" / cộng Tạp Niệm oan).
        mine[sym] = (mine[sym] ?? 0) + BAUCUA.chip;
        state.bets[p.pid] = mine;
        state.names[p.pid] = p.name;
      } else {
        const mine = state.bets[p.pid];
        if (!mine?.[sym]) return;
        mine[sym] = mine[sym] - BAUCUA.chip;
        if (mine[sym] <= 0) delete mine[sym];
        ctx.addXu(p.pid, BAUCUA.chip);
        if (totalBet(mine) === 0) delete state.bets[p.pid];
      }
      publish();
    },
    onLeave(p, reason) {
      // Rời phòng / đổi map trước khi trả thưởng: hoàn tiền cược. Mất kết nối tạm thời (còn ân hạn)
      // thì giữ cược nếu xúc xắc đang lắc — vẫn được trả thưởng như thường.
      const unpaid = state.phase === 'betting' || (state.phase === 'rolling' && reason !== 'disconnect');
      if ((reason === 'disconnect' || reason === 'left' || reason === 'map') && unpaid && state.bets[p.pid]) {
        ctx.addXu(p.pid, totalBet(state.bets[p.pid]));
        delete state.bets[p.pid];
        publish();
      }
    },
    isBusy: () => state.phase !== 'idle' && Object.keys(state.bets).length > 0,
    onMapChange() {
      cancel?.();
      // Ván chưa trả thưởng (đang đặt hoặc đang lắc) thì hoàn lại toàn bộ tiền cược.
      if (state.phase === 'betting' || state.phase === 'rolling') {
        for (const [pid, bets] of Object.entries(state.bets)) ctx.addXu(pid, totalBet(bets));
      }
      Object.assign(state, { phase: 'idle', bets: {}, dice: [] });
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const bauCuaModule: ActivityServerModule = { id: 'baucua', maps: ['bar'], create: createBauCua };
