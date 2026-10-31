// Nấu cơm chay tập thể (spec 7.6): mở ở Bảng gọi món, 10 giây chờ, nấu 150 giây; thùng gạo → vo → nồi;
// rau → thái → chảo (đảo 8 giây); củi/quạt giữ nhiệt; dọn mâm ra Trai đường. Khét thì trừ Công Đức và nấu lại.
import { z } from 'zod';
import { CHOP, COOK, JOKES, type Pid } from '@shared/index';
import { cookRoles, mealsFor, stepStove, type CookPublicState } from '@shared/activities/cook';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const stirMsg = z.object({ down: z.boolean() });
const RESULT_MS = 6000;

function createCook(ctx: ActivityContext): ActivityInstance {
  const s: CookPublicState = {
    phase: 'idle',
    endsAt: 0,
    participants: [],
    mealsNeeded: 1,
    rice: 0,
    dishes: 0,
    heat: 30,
    pot: { state: 'empty', progress: 0, burn: 0 },
    pan: { state: 'empty', progress: 0, stirring: false },
    stock: { rice: 0, veggies: 0, firewood: 0 },
    burnt: false,
    result: null,
  };
  const members = new Map<Pid, string>();
  const qte = new Map<Pid, { kind: 'wash' | 'cut'; at: number }>();
  let stirrer: Pid | null = null;
  /** Loại cửa sổ QTE mỗi người đang mở (để đóng đúng người khi xong việc). */
  const openKind = new Map<Pid, 'wash' | 'cut' | 'fan' | 'stir'>();
  const openQte = (pid: Pid, data: { qte: 'wash' | 'cut' | 'fan' | 'stir'; stationId: string; seq?: number[] }) => {
    openKind.set(pid, data.qte);
    ctx.open(pid, data);
  };
  const closeQte = (pid: Pid, reason: string) => {
    openKind.delete(pid);
    ctx.close(pid, reason);
  };
  let lastFan = new Map<Pid, number>();
  let pubAcc = 0;
  let cancel: (() => void) | null = null;

  const publish = () => {
    const roles = cookRoles(members.size);
    s.participants = [...members.entries()].map(([pid, name], i) => ({ pid, name, role: roles[i] ?? 'da_nang' }));
    s.stock = { rice: ctx.shared.get('rice_stock'), veggies: ctx.shared.get('veg_stock'), firewood: ctx.shared.get('firewood') };
    s.heat = Math.round(s.heat * 10) / 10;
    s.pot.progress = Math.round(s.pot.progress);
    s.pot.burn = Math.round(s.pot.burn);
    s.pan.progress = Math.round(s.pan.progress);
    ctx.setState(structuredClone(s));
  };
  const join = (p: ServerPlayerView) => {
    if (members.has(p.pid)) return;
    if (members.size >= COOK.maxPlayers) return ctx.toast(p.pid, 'Bếp đã đủ 6 người.', 'warn');
    members.set(p.pid, p.name);
    // Vào muộn khi còn hơn nửa giờ nấu thì số mâm tăng theo số người (không bao giờ giảm).
    if (s.phase === 'cooking' && s.endsAt - ctx.now() > COOK.durationMs / 2) {
      s.mealsNeeded = Math.max(s.mealsNeeded, mealsFor(members.size));
    }
    ctx.toast(p.pid, 'Vào bếp! Xem gợi ý vai trên màn hình.', 'good');
    publish();
  };
  const cooking = () => s.phase === 'cooking';

  function startCooking(): void {
    if (members.size === 0) {
      s.phase = 'idle';
      publish();
      return;
    }
    Object.assign(s, { phase: 'cooking', endsAt: ctx.now() + COOK.durationMs, mealsNeeded: mealsFor(members.size), rice: 0, dishes: 0, heat: 35, burnt: false, result: null });
    s.pot = { state: 'empty', progress: 0, burn: 0 };
    s.pan = { state: 'empty', progress: 0, stirring: false };
    publish();
    ctx.fx({ type: 'sound', id: 'gong', x: -27, z: -28 });
    ctx.chatSystem(`🍚 Bắt đầu nấu cơm chay: cần ${s.mealsNeeded} mâm trong 150 giây!`);
    cancel = ctx.setTimeout(() => finish('timeout'), COOK.durationMs);
  }

  function finish(result: 'success' | 'perfect' | 'timeout'): void {
    if (!cooking()) return;
    cancel?.();
    // Đóng mọi cửa sổ QTE còn mở (vo gạo, thái rau, quạt lửa, đảo chảo) để không ai bị khóa di chuyển.
    qte.clear();
    openKind.clear();
    stirrer = null;
    s.pan.stirring = false;
    for (const v of ctx.players()) if (v.activity === 'cook') ctx.close(v.pid, 'done');
    s.result = result;
    s.phase = 'result';
    const reward = result === 'perfect' ? COOK.rewardPerfect : result === 'success' ? COOK.rewardSuccess : COOK.timeoutReward;
    for (const pid of members.keys()) ctx.reward(pid, reward, { label: 'Nấu cơm chay' });
    if (result === 'perfect') {
      ctx.addBuff('room', 'no_bung');
      ctx.fx({ type: 'banner', title: '🍚 Mâm cơm hoàn hảo!', sub: 'Cả chùa No bụng: chạy nhanh +20%, Công Đức ×1,1 trong 3 phút', tone: 'gold', big: true });
      ctx.fx({ type: 'confetti', x: -30, z: -16 });
    } else if (result === 'success') {
      ctx.fx({ type: 'banner', title: '🍚 Dọn đủ mâm rồi!', sub: `+${reward} Công Đức mỗi người`, tone: 'good' });
    } else {
      ctx.fx({ type: 'banner', title: 'Hết giờ nấu…', sub: `Vẫn được +${reward} Công Đức vì đã cố gắng`, tone: 'info' });
    }
    publish();
    cancel = ctx.setTimeout(() => {
      s.phase = 'idle';
      members.clear();
      publish();
    }, RESULT_MS);
  }

  const take = (p: ServerPlayerView, key: 'rice_stock' | 'veg_stock' | 'firewood', item: 'rice' | 'veggies' | 'firewood', empty: string) => {
    if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
    if (ctx.shared.get(key) <= 0) return ctx.toast(p.pid, empty, 'warn');
    ctx.shared.add(key, -1, 0, key === 'firewood' ? CHOP.firewoodMax : COOK.stockMax);
    ctx.setHeld(p.pid, { kind: item });
    publish();
  };

  publish();

  return {
    onInteract(p, station) {
      if (station.kind === 'order_board') {
        if (s.phase === 'idle') {
          s.phase = 'lobby';
          s.endsAt = ctx.now() + COOK.lobbyMs;
          members.clear();
          join(p);
          ctx.fx({ type: 'banner', title: '🍳 Mở bếp nấu cơm chay!', sub: 'Vào bếp, bấm E ở Bảng gọi món để phụ nấu (10 giây)', tone: 'gold' });
          cancel = ctx.setTimeout(startCooking, COOK.lobbyMs);
        } else if (s.phase === 'lobby' || cooking()) {
          join(p);
        }
        return;
      }
      if (!cooking()) return ctx.toast(p.pid, 'Chưa mở bếp. Bấm E ở Bảng gọi món để bắt đầu.', 'info');
      join(p);
      switch (station.kind) {
        case 'rice_bin':
          return take(p, 'rice_stock', 'rice', 'Hết gạo! Chờ Tri Khách nhập kho.');
        case 'veggie_patch':
          return take(p, 'veg_stock', 'veggies', 'Hết rau! Chờ Tri Khách nhập kho.');
        case 'woodpile':
          return take(p, 'firewood', 'firewood', JOKES.noFirewood);
        case 'wash_basin':
          if (p.held?.kind !== 'rice') return ctx.toast(p.pid, 'Lấy gạo ở thùng gạo trước.', 'info');
          qte.set(p.pid, { kind: 'wash', at: ctx.now() });
          return openQte(p.pid, { qte: 'wash', stationId: station.id });
        case 'cutting_board':
          if (p.held?.kind !== 'veggies') return ctx.toast(p.pid, 'Hái rau nấm ở luống rau trước.', 'info');
          qte.set(p.pid, { kind: 'cut', at: ctx.now() });
          return openQte(p.pid, { qte: 'cut', stationId: station.id, seq: Array.from({ length: COOK.cutSequenceLength }, () => ctx.rng.int(0, 3)) });
        case 'stove_rice':
          if (p.held?.kind === 'rice_washed' && s.pot.state === 'empty') {
            ctx.setHeld(p.pid, null);
            s.pot = { state: 'cooking', progress: 0, burn: 0 };
            ctx.fx({ type: 'sound', id: 'pour', x: station.x, z: station.z });
          } else if (!p.held && s.pot.state === 'done') {
            ctx.setHeld(p.pid, { kind: 'rice_pot' });
            s.pot = { state: 'empty', progress: 0, burn: 0 };
          } else {
            ctx.toast(p.pid, s.pot.state === 'cooking' ? 'Cơm đang chín, canh lửa ở vùng xanh nhé!' : 'Cần gạo đã vo để bắc nồi.', 'info');
          }
          return publish();
        case 'firebox':
          if (p.held?.kind === 'firewood') {
            ctx.setHeld(p.pid, null);
            s.heat = Math.min(100, s.heat + COOK.firewoodHeat);
            ctx.fx({ type: 'sound', id: 'fire', x: station.x, z: station.z });
            return publish();
          }
          return openQte(p.pid, { qte: 'fan', stationId: station.id });
        case 'stove_pan':
          if (p.held?.kind === 'veggies_cut' && s.pan.state === 'empty') {
            ctx.setHeld(p.pid, null);
            s.pan = { state: 'ready', progress: 0, stirring: false };
            publish();
            return openQte(p.pid, { qte: 'stir', stationId: station.id });
          }
          if (s.pan.state === 'ready') return openQte(p.pid, { qte: 'stir', stationId: station.id });
          if (!p.held && s.pan.state === 'done') {
            ctx.setHeld(p.pid, { kind: 'veggie_dish' });
            s.pan = { state: 'empty', progress: 0, stirring: false };
            return publish();
          }
          return ctx.toast(p.pid, 'Cần rau nấm đã thái để xào.', 'info');
        case 'dining_table':
          if (p.held?.kind === 'rice_pot') s.rice++;
          else if (p.held?.kind === 'veggie_dish') s.dishes++;
          else return ctx.toast(p.pid, 'Mang nồi cơm chín hoặc đĩa rau xào ra đây.', 'info');
          ctx.setHeld(p.pid, null);
          ctx.fx({ type: 'sound', id: 'putdown', x: station.x, z: station.z });
          publish();
          if (Math.min(s.rice, s.dishes) >= s.mealsNeeded) {
            const left = s.endsAt - ctx.now();
            finish(!s.burnt && left >= COOK.perfectMinRemainingMs ? 'perfect' : 'success');
          }
          return;
      }
    },
    onAction(p, type, data) {
      if (!cooking()) return;
      const now = ctx.now();
      if (type === 'wash_done' || type === 'cut_done') {
        const q = qte.get(p.pid);
        if (!q || q.kind !== (type === 'wash_done' ? 'wash' : 'cut') || now - q.at < 900) return;
        qte.delete(p.pid);
        ctx.setHeld(p.pid, { kind: q.kind === 'wash' ? 'rice_washed' : 'veggies_cut' });
        closeQte(p.pid, 'done');
      } else if (type === 'fan') {
        if (now - (lastFan.get(p.pid) ?? 0) < COOK.bellowsMinIntervalMs || !ctx.isNear(p.pid, 'firebox', 1.5)) return;
        lastFan.set(p.pid, now);
        s.heat = Math.min(100, s.heat + COOK.bellowsHeat);
      } else if (type === 'stir') {
        const r = stirMsg.safeParse(data);
        if (!r.success || s.pan.state !== 'ready' || !ctx.isNear(p.pid, 'stove_pan', 1.5)) return;
        stirrer = r.data.down ? p.pid : stirrer === p.pid ? null : stirrer;
        s.pan.stirring = stirrer !== null;
      }
    },
    onLeave(p, reason) {
      qte.delete(p.pid);
      openKind.delete(p.pid);
      if (stirrer === p.pid) {
        stirrer = null;
        s.pan.stirring = false;
      }
      if (p.activity === 'cook') ctx.close(p.pid, 'esc');
      if (reason !== 'esc' && members.delete(p.pid)) publish();
    },
    tick(dt) {
      if (!cooking()) return;
      const sec = dt / 1000;
      const { burntNow } = stepStove(s, sec);
      if (burntNow) {
        s.burnt = true;
        s.pot = { state: 'empty', progress: 0, burn: 0 };
        for (const pid of members.keys()) ctx.penalize(pid, COOK.burnPenalty, 'Cơm khét');
        ctx.toast('room', JOKES.burnt, 'bad');
        ctx.fx({ type: 'sound', id: 'fail', x: -28.8, z: -32.9 });
      }
      if (s.pan.state === 'ready' && s.pan.stirring && s.heat >= COOK.heatGreenMin) {
        s.pan.progress = Math.min(100, s.pan.progress + (100 / (COOK.stirMs / 1000)) * sec);
        if (s.pan.progress >= 100) {
          s.pan.state = 'done';
          s.pan.stirring = false;
          // Chảo xong: đóng cửa sổ đảo chảo của mọi người đang mở (không chỉ người đang giữ Space).
          for (const [pid, k] of [...openKind]) if (k === 'stir') closeQte(pid, 'done');
          stirrer = null;
          ctx.fx({ type: 'sound', id: 'success', x: -25.2, z: -32.9 });
        }
      }
      pubAcc += dt;
      if (pubAcc >= 200) {
        pubAcc = 0;
        publish();
      }
    },
    isBusy: () => s.phase === 'lobby' || cooking(),
    onMapChange() {
      cancel?.();
      for (const pid of members.keys()) ctx.close(pid, 'map');
      members.clear();
      qte.clear();
      openKind.clear();
      lastFan = new Map();
      s.phase = 'idle';
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const cookModule: ActivityServerModule = { id: 'cook', maps: ['temple'], create: createCook };
