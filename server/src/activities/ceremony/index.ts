// Đại lễ cúng dường (spec 7.9): Phương Trượng mở lễ (nghỉ 5 phút giữa hai lễ), nén nhang lớn cháy 150 giây;
// cả chùa hái quả, cắm hoa, châm dầu thắp đèn, thắp hương, bày đủ 10 vị trí theo sơ đồ phong thủy.
import { z } from 'zod';
import { CEREMONY, JOKES, findStation, type FlowerColor, type FruitId, type HeldItem, type Pid } from '@shared/index';
import { ceremonyLayout, ceremonyRoles, ceremonySlots, slotAccepts, type CeremonyPublicState, type CeremonySlot } from '@shared/activities/ceremony';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const stationMsg = z.object({ stationId: z.string().max(64) });
const takeMsg = z.object({ kind: z.enum(['lamp', 'incense']) });
const indexMsg = z.object({ index: z.number().int().min(0).max(20) });
const slotMsg = z.object({ slot: z.string().max(16) });

function createCeremony(ctx: ActivityContext): ActivityInstance {
  const s: CeremonyPublicState = { active: false, startAt: 0, endsAt: 0, cooldownUntil: 0, seed: 1, placed: {}, prep: [], participants: [], result: null };
  let slots: CeremonySlot[] = [];
  const members = new Map<Pid, string>();
  const holds = new Map<Pid, { stationId: string; at: number }>();
  let cancel: (() => void) | null = null;

  const publish = () => {
    const roles = ceremonyRoles(members.size);
    s.participants = [...members.entries()].map(([pid, name], i) => ({ pid, name, role: roles[i] ?? 'da_nang' }));
    ctx.setState(structuredClone(s));
  };
  const join = (p: ServerPlayerView) => {
    if (!s.active || members.has(p.pid)) return;
    members.set(p.pid, p.name);
    publish();
  };
  const roleOf = (pid: Pid) => s.participants.find((x) => x.pid === pid)?.role ?? 'da_nang';

  function start(p: ServerPlayerView): void {
    const now = ctx.now();
    if (s.active) return ctx.toast(p.pid, 'Đang có Đại lễ rồi.', 'warn');
    if (now < s.cooldownUntil) return ctx.toast(p.pid, `Đại lễ cần nghỉ thêm ${Math.ceil((s.cooldownUntil - now) / 1000)} giây.`, 'warn');
    members.clear();
    holds.clear();
    Object.assign(s, { active: true, startAt: now, endsAt: now + CEREMONY.durationMs, seed: ctx.rng.int(1, 2 ** 30), placed: {}, prep: [], result: null });
    slots = ceremonySlots(ceremonyLayout(s.seed));
    publish();
    ctx.fx({ type: 'sound', id: 'gong' });
    ctx.fx({ type: 'banner', title: '🪷 Mở Đại lễ cúng dường!', sub: 'Xem thẻ yêu cầu: hái quả, cắm hoa, thắp đèn, dâng hương — 150 giây', tone: 'gold', big: true });
    ctx.chatSystem(`🪷 ${p.name} mở Đại lễ cúng dường. Bày đủ 10 vị trí trên đàn tràng trước khi nhang tàn!`);
    cancel = ctx.setTimeout(() => end(false), CEREMONY.durationMs);
  }

  function end(success: boolean): void {
    if (!s.active) return;
    cancel?.();
    s.active = false;
    s.result = success ? 'success' : 'fail';
    s.cooldownUntil = ctx.now() + CEREMONY.cooldownMs;
    if (success) {
      for (const p of ctx.players()) {
        ctx.reward(p.pid, members.has(p.pid) ? CEREMONY.rewardSuccess : CEREMONY.rewardRoom, { label: 'Đại lễ' });
      }
      ctx.fx({ type: 'petals' });
      ctx.fx({ type: 'banner', title: '🌸 Đại lễ viên mãn!', sub: `Người tham gia +${CEREMONY.rewardSuccess}, cả chùa +${CEREMONY.rewardRoom} Công Đức`, tone: 'gold', big: true });
      ctx.fx({ type: 'sound', id: 'bell_big' });
    } else {
      for (const pid of members.keys()) ctx.reward(pid, CEREMONY.rewardFail, { label: 'Đại lễ' });
      ctx.fx({ type: 'banner', title: 'Nhang đã tàn…', sub: `Chưa bày đủ lễ. Người tham gia +${CEREMONY.rewardFail} Công Đức`, tone: 'info' });
    }
    for (const pid of members.keys()) {
      const p = ctx.player(pid);
      if (p?.held && ['fruit', 'flower', 'vase', 'lamp', 'incense'].includes(p.held.kind)) ctx.setHeld(pid, null);
    }
    publish();
  }

  const giveHeld = (pid: Pid, item: HeldItem) => {
    ctx.setHeld(pid, item);
    ctx.fx({ type: 'sound', id: 'pickup', x: ctx.player(pid)?.x, z: ctx.player(pid)?.z });
  };

  publish();

  return {
    onInteract(p, station) {
      if (!s.active) return ctx.toast(p.pid, 'Chưa có Đại lễ. Phương Trượng mở lễ trong menu H.', 'info');
      join(p);
      if (station.kind === 'oil_jar') {
        if (p.held?.kind === 'lamp' && p.held.variant === 'empty') giveHeld(p.pid, { kind: 'lamp', variant: 'filled' });
        else ctx.toast(p.pid, 'Mang đèn dầu rỗng (lấy ở Bàn hương đăng) tới châm dầu.', 'info');
      } else if (station.kind === 'candle_stand') {
        if (p.held?.kind === 'lamp' && p.held.variant === 'filled') giveHeld(p.pid, { kind: 'lamp', variant: 'lit' });
        else if (p.held?.kind === 'incense' && p.held.variant !== 'lit') giveHeld(p.pid, { kind: 'incense', variant: 'lit' });
        else ctx.toast(p.pid, 'Mang đèn đã châm dầu hoặc nén hương tới thắp lửa.', 'info');
      }
    },
    onAction(p, type, data) {
      const now = ctx.now();
      if (type === 'start') {
        if (p.isHost && ctx.map() === 'temple') start(p);
        return;
      }
      if (!s.active) return;
      join(p);
      if (type === 'hold_start') {
        const r = stationMsg.safeParse(data);
        if (r.success && ctx.isNear(p.pid, r.data.stationId, 1)) holds.set(p.pid, { stationId: r.data.stationId, at: now });
      } else if (type === 'pick') {
        const r = stationMsg.safeParse(data);
        const h = holds.get(p.pid);
        holds.delete(p.pid);
        if (!r.success || !h || h.stationId !== r.data.stationId || !ctx.isNear(p.pid, h.stationId, 1)) return;
        const st = findStation(h.stationId)?.station;
        if (!st) return;
        const need = st.kind === 'flower_table' ? CEREMONY.arrangeHoldMs : CEREMONY.pickHoldMs;
        if (now - h.at < need - 200) return;
        if (st.kind === 'fruit_tree' && !p.held) giveHeld(p.pid, { kind: 'fruit', variant: st.data?.fruit as FruitId });
        else if (st.kind === 'flower_bed' && !p.held) giveHeld(p.pid, { kind: 'flower', variant: st.data?.color as FlowerColor });
        else if (st.kind === 'flower_table' && p.held?.kind === 'flower') giveHeld(p.pid, { kind: 'vase', variant: p.held.variant });
      } else if (type === 'take') {
        const r = takeMsg.safeParse(data);
        if (!r.success || !ctx.isNear(p.pid, 'lamp_table', 1)) return;
        if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
        giveHeld(p.pid, r.data.kind === 'lamp' ? { kind: 'lamp', variant: 'empty' } : { kind: 'incense', variant: 'unlit' });
      } else if (type === 'put') {
        if (!ctx.isNear(p.pid, 'prep_table', 1) || !p.held) return;
        if (s.prep.length >= CEREMONY.prepTableMax) return ctx.toast(p.pid, 'Bàn soạn lễ đầy rồi.', 'warn');
        s.prep.push({ ...p.held });
        ctx.setHeld(p.pid, null);
        publish();
      } else if (type === 'take_prep') {
        const r = indexMsg.safeParse(data);
        if (!r.success || !ctx.isNear(p.pid, 'prep_table', 1)) return;
        if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
        const item = s.prep[r.data.index];
        if (!item) return;
        s.prep.splice(r.data.index, 1);
        giveHeld(p.pid, item);
        publish();
      } else if (type === 'place') {
        const r = slotMsg.safeParse(data);
        const slot = r.success ? slots.find((x) => x.id === r.data.slot) : undefined;
        if (!slot || !ctx.isNear(p.pid, 'altar', 1)) return;
        if (members.size >= CEREMONY.roleThreshold && roleOf(p.pid) !== 'bay_le') {
          return ctx.toast(p.pid, 'Từ 4 người trở lên chỉ vai Bày lễ được đặt lên đàn. Để đồ lên Bàn soạn lễ nhé!', 'warn');
        }
        if (s.placed[slot.id]) return ctx.toast(p.pid, 'Vị trí này đã bày rồi.', 'info');
        if (!slotAccepts(slot, p.held)) return ctx.toast(p.pid, JOKES.wrongFengShui, 'bad');
        s.placed[slot.id] = true;
        ctx.setHeld(p.pid, null);
        ctx.fx({ type: 'sound', id: 'bell_small', x: 0, z: -14 });
        publish();
        if (slots.every((x) => s.placed[x.id])) end(true);
      }
    },
    onLeave(p, reason) {
      holds.delete(p.pid);
      if ((reason === 'disconnect' || reason === 'left') && members.delete(p.pid)) publish();
    },
    isBusy: () => s.active,
    onMapChange() {
      if (s.active) {
        cancel?.();
        s.active = false;
        members.clear();
        publish();
      }
    },
    dispose() {
      cancel?.();
    },
  };
}

export const ceremonyModule: ActivityServerModule = { id: 'ceremony', maps: ['temple'], create: createCeremony };
