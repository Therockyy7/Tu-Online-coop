// Thi pha chế (spec 8.5): mở ca ở trạm pha chế (10 giây chờ), ca 90 giây; 6 bàn khách liên tục gọi món;
// nhận đơn → nhập 3 nguyên liệu đúng thứ tự → lắc 8 nhịp → mang ly tới đúng bàn lấy tip. Cuối ca xếp hạng.
import { z } from 'zod';
import { JOKES, MIXOLOGY, type Pid } from '@shared/index';
import { mixTip, recipeOf, shakeQuality, type MixOrder, type MixPublicState } from '@shared/activities/mixology';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const orderMsg = z.object({ id: z.number().int() });
const mixMsg = z.object({ id: z.number().int(), ingredients: z.array(z.string().max(16)).max(6), deltas: z.array(z.number()).max(16) });
const RESULT_MS = 6000;

function createMixology(ctx: ActivityContext): ActivityInstance {
  const stationIds = ['mix_station_1', 'mix_station_2', 'mix_station_3', 'mix_station_4'];
  const s: MixPublicState = { phase: 'idle', endsAt: 0, stations: Object.fromEntries(stationIds.map((id) => [id, null])), orders: [], scores: [] };
  const tips = new Map<Pid, { name: string; tips: number }>();
  const drinks = new Map<Pid, { orderId: number; quality: number }>();
  let nextOrder = 1;
  let orderAcc = 0;
  let nextOrderIn = 2000;
  let cancel: (() => void) | null = null;

  const publish = () => {
    s.scores = [...tips.entries()].map(([pid, v]) => ({ pid, name: v.name, tips: v.tips })).sort((a, b) => b.tips - a.tips);
    ctx.setState(structuredClone(s));
  };
  const stationOf = (pid: Pid) => Object.entries(s.stations).find(([, v]) => v === pid)?.[0] ?? null;
  const occupy = (p: ServerPlayerView, stationId: string) => {
    if (stationOf(p.pid)) return true;
    if (s.stations[stationId]) {
      ctx.toast(p.pid, JOKES.stationBusy, 'warn');
      return false;
    }
    s.stations[stationId] = p.pid;
    tips.set(p.pid, tips.get(p.pid) ?? { name: p.name, tips: 0 });
    return true;
  };

  function startShift(): void {
    if (tips.size === 0) {
      s.phase = 'idle';
      publish();
      return;
    }
    s.phase = 'playing';
    s.endsAt = ctx.now() + MIXOLOGY.durationMs;
    s.orders = [];
    publish();
    ctx.fx({ type: 'sound', id: 'airhorn' });
    ctx.chatSystem('🍸 Ca pha chế bắt đầu! 90 giây phục vụ khách.');
    cancel = ctx.setTimeout(finish, MIXOLOGY.durationMs);
  }

  function finish(): void {
    s.phase = 'result';
    s.orders = [];
    publish();
    // Người nhất phải thật sự phục vụ được khách (có tip) và còn đang ở trong phòng.
    const win = s.scores.find((x) => x.tips > 0 && ctx.player(x.pid)?.connected);
    if (win) {
      ctx.addXu(win.pid, MIXOLOGY.winnerBonus);
      ctx.fx({ type: 'banner', title: `🍸 ${win.name} pha chế xuất sắc nhất!`, sub: `${win.tips} Xu tiền tip · thưởng thêm ${MIXOLOGY.winnerBonus} Xu`, tone: 'gold', big: true });
    } else {
      ctx.fx({ type: 'banner', title: '🍸 Hết ca pha chế', sub: 'Chưa ai phục vụ được ly nào — ca sau cố lên!', tone: 'info' });
    }
    if (s.scores.length) ctx.chatSystem(`🍸 Kết quả pha chế: ${s.scores.map((x, i) => `${i + 1}. ${x.name} (${x.tips} Xu)`).join(' · ')}`);
    for (const pid of tips.keys()) {
      ctx.addTapNiem(pid, MIXOLOGY.tapNiem);
      ctx.close(pid, 'done');
      const p = ctx.player(pid);
      if (p?.held?.kind === 'cocktail') ctx.setHeld(pid, null);
    }
    cancel = ctx.setTimeout(() => {
      s.phase = 'idle';
      for (const id of stationIds) s.stations[id] = null;
      tips.clear();
      drinks.clear();
      publish();
    }, RESULT_MS);
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind === 'mix_station') {
        if (s.phase === 'result') return;
        if (s.phase === 'idle') {
          s.phase = 'lobby';
          s.endsAt = ctx.now() + MIXOLOGY.lobbyMs;
          tips.clear();
          drinks.clear();
          ctx.chatSystem(`🍸 ${p.name} mở ca pha chế! Vào trạm pha chế trong 10 giây.`);
          cancel = ctx.setTimeout(startShift, MIXOLOGY.lobbyMs);
        }
        if (!occupy(p, station.id)) return;
        publish();
        ctx.open(p.pid, { stationId: station.id });
      } else if (station.kind === 'npc_table') {
        if (s.phase !== 'playing') return;
        const d = drinks.get(p.pid);
        if (p.held?.kind !== 'cocktail' || !d) return ctx.toast(p.pid, 'Pha xong ly rồi mang tới đây nhé.', 'info');
        const order = s.orders.find((o) => o.id === d.orderId);
        const table = Number(station.data?.index);
        if (!order || order.table !== table) return ctx.toast(p.pid, 'Bàn này không gọi món đó!', 'warn');
        const tip = mixTip(d.quality, ctx.now() - order.takenAt);
        ctx.addXu(p.pid, tip);
        const t = tips.get(p.pid);
        if (t) t.tips += tip;
        drinks.delete(p.pid);
        ctx.setHeld(p.pid, null);
        s.orders = s.orders.filter((o) => o.id !== order.id);
        ctx.emit('served', { table, tip, name: p.name });
        ctx.fx({ type: 'sound', id: 'coin', x: station.x, z: station.z });
        publish();
      }
    },
    onAction(p, type, data) {
      if (type === 'close') {
        if (p.activity === 'mixology') ctx.close(p.pid, 'esc');
        return;
      }
      if (s.phase !== 'playing' || !stationOf(p.pid)) return;
      if (type === 'take_order') {
        const r = orderMsg.safeParse(data);
        const o = r.success ? s.orders.find((x) => x.id === r.data.id) : undefined;
        if (!o || o.takenBy) return;
        if (s.orders.some((x) => x.takenBy === p.pid)) return ctx.toast(p.pid, 'Làm xong đơn đang nhận đã nhé.', 'info');
        o.takenBy = p.pid;
        o.takenAt = ctx.now();
        publish();
      } else if (type === 'mix_done') {
        const r = mixMsg.safeParse(data);
        const o = r.success ? s.orders.find((x) => x.id === r.data.id && x.takenBy === p.pid) : undefined;
        const recipe = o ? recipeOf(o.recipe) : undefined;
        if (!r.success || !o || !recipe) return;
        if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
        if (r.data.ingredients.join(',') !== recipe.ingredients.join(',')) return ctx.toast(p.pid, 'Sai công thức rồi, pha lại nha!', 'warn');
        drinks.set(p.pid, { orderId: o.id, quality: shakeQuality(r.data.deltas) });
        ctx.setHeld(p.pid, { kind: 'cocktail', variant: recipe.id });
        ctx.close(p.pid, 'done');
        ctx.toast(p.pid, `Xong ${recipe.name}! Mang tới bàn ${o.table}.`, 'good');
      }
    },
    onLeave(p, reason) {
      if (reason === 'esc') return;
      const st = stationOf(p.pid);
      if (st) s.stations[st] = null;
      for (const o of s.orders) if (o.takenBy === p.pid) o.takenBy = null;
      drinks.delete(p.pid);
      publish();
    },
    tick(dt, now) {
      if (s.phase !== 'playing') return;
      orderAcc += dt;
      if (orderAcc >= nextOrderIn && s.orders.length < MIXOLOGY.maxOrders) {
        orderAcc = 0;
        nextOrderIn = ctx.rng.int(MIXOLOGY.orderMinMs, MIXOLOGY.orderMaxMs);
        const busy = new Set(s.orders.map((o) => o.table));
        const free = [1, 2, 3, 4, 5, 6].filter((t) => !busy.has(t));
        if (free.length) {
          const order: MixOrder = { id: nextOrder++, table: ctx.rng.pick(free), recipe: ctx.rng.pick(MIXOLOGY.recipes).id, createdAt: now, takenBy: null, takenAt: 0 };
          s.orders.push(order);
          ctx.emit('order', { table: order.table, recipe: order.recipe });
          publish();
        }
      }
    },
    isBusy: () => s.phase === 'lobby' || s.phase === 'playing',
    onMapChange() {
      cancel?.();
      for (const pid of tips.keys()) ctx.close(pid, 'map');
      tips.clear();
      drinks.clear();
      for (const id of stationIds) s.stations[id] = null;
      s.phase = 'idle';
      s.orders = [];
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const mixologyModule: ActivityServerModule = { id: 'mixology', maps: ['bar'], create: createMixology };
