// Hoạt động cá nhân ở Chùa (server): Quét lá (7.1), Xách nước (7.3), Phóng sinh (7.5), Thiền định (7.4),
// Tủ áo (7.12), Đón khách vãng lai + Nhập kho (7.10). Server giữ trạng thái và quyết định thưởng/phạt.
import { z } from 'zod';
import {
  ACCESSORY_IDS,
  ANIMAL_IDS,
  ANIMAL_NAMES,
  COOK,
  GUEST,
  HAT_IDS,
  JOKES,
  MEDITATE,
  NPC_NAMES,
  RELEASE,
  RESTOCK,
  ROBE_IDS,
  SWEEP,
  THOUGHT_WORDS,
  WATER,
  TEMPLE_MAP,
  getZone,
  rankAtLeast,
  resolveMove,
  round2,
  type AnimalId,
  type Pid,
} from '@shared/index';
import {
  inSweepArc,
  meditationReward,
  releaseTargetOk,
  type GuestNpc,
  type GuestPublicState,
  type Leaf,
  type MeditateOpenData,
  type ReleasePublicState,
  type SweepPublicState,
  type WaterPublicState,
} from '@shared/activities/temple';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const BODHI = { x: -14, z: -6 };
const LEAF_AREA = { x: -11, z: -2, r: 9 };
const BROOMS = 4;

// ───────────────────────── Quét lá ─────────────────────────

const sweepMsg = z.object({ ry: z.number() });
const thoughtMsg = z.object({ id: z.number().int(), key: z.string().max(4) });

function createSweep(ctx: ActivityContext): ActivityInstance {
  const leaves = new Map<number, Leaf>();
  const bags = new Map<Pid, number>();
  const lastSweep = new Map<Pid, number>();
  const thoughts = new Map<Pid, { id: number; key: string; expiresAt: number; cancel: () => void }>();
  let nextId = 1;
  let spawnAcc = 0;
  let wind = ctx.rng.range(0, Math.PI * 2);
  let windAcc = 0;
  let dirty = true;
  let publishAcc = 0;

  const brooms = () => ctx.players().filter((p) => p.held?.kind === 'broom').length;
  const publish = () => {
    const s: SweepPublicState = {
      leaves: [...leaves.values()].map((l) => ({ ...l, sx: round2(l.sx), sz: round2(l.sz), x: round2(l.x), z: round2(l.z) })),
      brooms: brooms(),
    };
    ctx.setState(s);
    dirty = false;
  };

  function spawn(now: number): void {
    for (let i = 0; i < SWEEP.spawnCount && leaves.size < SWEEP.maxLeaves; i++) {
      const a = ctx.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(ctx.rng.next()) * 4;
      const sx = BODHI.x + Math.cos(a) * r;
      const sz = BODHI.z + Math.sin(a) * r;
      const drift = ctx.rng.range(1.5, 4.5);
      let x = sx + Math.cos(wind) * drift;
      let z = sz + Math.sin(wind) * drift;
      const d = Math.hypot(x - LEAF_AREA.x, z - LEAF_AREA.z);
      if (d > LEAF_AREA.r) {
        x = LEAF_AREA.x + ((x - LEAF_AREA.x) / d) * LEAF_AREA.r;
        z = LEAF_AREA.z + ((z - LEAF_AREA.z) / d) * LEAF_AREA.r;
      }
      leaves.set(nextId, { id: nextId++, sx, sz, x, z, spawnAt: now, settleAt: now + SWEEP.driftMs });
    }
    dirty = true;
  }

  const setBag = (pid: Pid, n: number) => {
    bags.set(pid, n);
    ctx.emit('bag', { count: n }, pid);
  };

  for (let i = 0; i < 6; i++) spawn(ctx.now() - SWEEP.driftMs);
  publish();

  return {
    onInteract(p, station) {
      if (station.kind === 'broom_rack') {
        if (p.held?.kind === 'broom') {
          ctx.setHeld(p.pid, null);
          ctx.toast(p.pid, 'Đã trả chổi lên giá.', 'info');
        } else if (p.held) {
          ctx.toast(p.pid, JOKES.handsFull, 'warn');
        } else if (brooms() >= BROOMS) {
          ctx.toast(p.pid, 'Hết chổi trên giá rồi, chờ người khác trả nha.', 'warn');
        } else {
          ctx.setHeld(p.pid, { kind: 'broom' });
          ctx.toast(p.pid, 'Giữ Space để quét lá quanh cây Bồ đề. Đổ bao ở gốc cây.', 'good');
        }
        dirty = true;
      } else if (station.kind === 'tree_root') {
        const n = bags.get(p.pid) ?? 0;
        if (n <= 0) return ctx.toast(p.pid, 'Bao lá đang trống. Cầm chổi quét đã nhé!', 'info');
        setBag(p.pid, 0);
        const gain = Math.floor(n / SWEEP.leavesPerKarma);
        if (gain > 0) ctx.reward(p.pid, gain, { label: 'Quét lá' });
        ctx.emit('dumped', { x: station.x, z: station.z, count: n });
      }
    },

    onAction(p, type, data) {
      const now = ctx.now();
      if (type === 'sweep') {
        const r = sweepMsg.safeParse(data);
        if (!r.success || p.held?.kind !== 'broom') return;
        if (now - (lastSweep.get(p.pid) ?? 0) < SWEEP.sweepIntervalMs - 60) return;
        lastSweep.set(p.pid, now);
        let bag = bags.get(p.pid) ?? 0;
        if (bag >= SWEEP.bagMax) return ctx.emit('bag', { count: bag, full: true }, p.pid);
        let got = 0;
        for (const l of leaves.values()) {
          if (bag >= SWEEP.bagMax) break;
          if (now < l.settleAt) continue;
          if (!inSweepArc(p.x, p.z, r.data.ry, l.x, l.z)) continue;
          leaves.delete(l.id);
          bag++;
          got++;
        }
        if (got > 0) {
          dirty = true;
          setBag(p.pid, bag);
          if (!thoughts.has(p.pid) && ctx.rng.chance(SWEEP.thoughtChance)) {
            const id = nextId++;
            const key = ctx.rng.pick(SWEEP.thoughtKeys);
            const word = ctx.rng.pick(THOUGHT_WORDS);
            const expiresAt = now + SWEEP.thoughtWindowMs;
            const cancel = ctx.setTimeout(() => {
              if (thoughts.get(p.pid)?.id !== id) return;
              thoughts.delete(p.pid);
              ctx.addTapNiem(p.pid, SWEEP.thoughtFailTapNiem);
              ctx.emit('thought_result', { id, ok: false }, p.pid);
            }, SWEEP.thoughtWindowMs + 150);
            thoughts.set(p.pid, { id, key, expiresAt, cancel });
            ctx.emit('thought', { id, word, key, expiresAt }, p.pid);
          }
        }
      } else if (type === 'thought') {
        const r = thoughtMsg.safeParse(data);
        const t = thoughts.get(p.pid);
        if (!r.success || !t || t.id !== r.data.id) return;
        thoughts.delete(p.pid);
        t.cancel();
        const ok = r.data.key.toUpperCase() === t.key && now <= t.expiresAt + 150;
        if (ok) {
          ctx.addTapNiem(p.pid, SWEEP.thoughtSuccessTapNiem);
          ctx.reward(p.pid, SWEEP.thoughtSuccessKarma, { label: 'Dẹp tạp niệm' });
        } else {
          ctx.addTapNiem(p.pid, SWEEP.thoughtFailTapNiem);
        }
        ctx.emit('thought_result', { id: t.id, ok }, p.pid);
      }
    },

    onLeave(p, reason) {
      if (reason === 'disconnect' || reason === 'left') bags.delete(p.pid);
      thoughts.get(p.pid)?.cancel();
      thoughts.delete(p.pid);
    },

    tick(dt, now) {
      if (ctx.map() !== 'temple') return;
      spawnAcc += dt;
      windAcc += dt;
      if (windAcc >= SWEEP.windChangeMs) {
        windAcc = 0;
        wind = ctx.rng.range(0, Math.PI * 2);
      }
      if (spawnAcc >= SWEEP.spawnEveryMs) {
        spawnAcc = 0;
        spawn(now);
      }
      publishAcc += dt;
      if (dirty && publishAcc >= 500) {
        publishAcc = 0;
        publish();
      }
    },

    onMapChange() {
      bags.clear();
      for (const t of thoughts.values()) t.cancel();
      thoughts.clear();
      dirty = true;
    },
  };
}

export const sweepModule: ActivityServerModule = { id: 'sweep', maps: ['temple'], create: createSweep };

// ───────────────────────── Xách nước ─────────────────────────

const crankMsg = z.object({ presses: z.number().int().min(0).max(100) });

function createWater(ctx: ActivityContext): ActivityInstance {
  const jars: Record<string, number> = {};
  for (const s of TEMPLE_MAP.stations) if (s.kind === 'water_jar') jars[s.id] = 2;
  const sessions = new Map<Pid, { startAt: number; cancel: () => void; done: boolean }>();
  let drainAcc = 0;
  const publish = () => {
    const s: WaterPublicState = { jars: { ...jars } };
    ctx.setState(s);
  };
  const end = (pid: Pid, reason: string) => {
    sessions.get(pid)?.cancel();
    sessions.delete(pid);
    ctx.close(pid, reason);
  };
  publish();
  return {
    onInteract(p, station) {
      if (station.kind === 'well') {
        if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
        if (sessions.has(p.pid)) return;
        const startAt = ctx.now();
        const cancel = ctx.setTimeout(() => {
          if (!sessions.has(p.pid)) return;
          ctx.toast(p.pid, 'Hết giờ, gàu tuột mất rồi! Thử lại nhé.', 'warn');
          end(p.pid, 'timeout');
        }, WATER.crankTimeoutMs + 800);
        sessions.set(p.pid, { startAt, cancel, done: false });
        ctx.open(p.pid, { presses: WATER.crankPresses, timeoutMs: WATER.crankTimeoutMs, stationId: station.id });
      } else if (station.kind === 'water_jar') {
        if (p.held?.kind !== 'water_bucket') return ctx.toast(p.pid, 'Cần xách xô nước từ giếng tới đây.', 'info');
        const level = jars[station.id] ?? 0;
        if (level >= WATER.jarCapacity) return ctx.toast(p.pid, JOKES.jarFull, 'warn');
        jars[station.id] = level + 1;
        ctx.setHeld(p.pid, null);
        ctx.reward(p.pid, WATER.rewardPour, { label: 'Xách nước' });
        ctx.fx({ type: 'sound', id: 'pour', x: station.x, z: station.z });
        publish();
      }
    },
    onAction(p, type, data) {
      if (type !== 'crank') return;
      const s = sessions.get(p.pid);
      const r = crankMsg.safeParse(data);
      if (!s || !r.success || s.done) return;
      const elapsed = ctx.now() - s.startAt;
      if (r.data.presses < WATER.crankPresses || elapsed > WATER.crankTimeoutMs + 800) {
        ctx.toast(p.pid, 'Gàu tuột mất rồi! Thử lại nhé.', 'warn');
        end(p.pid, 'fail');
        return;
      }
      const giveBucket = () => {
        ctx.setHeld(p.pid, { kind: 'water_bucket' });
        ctx.toast(p.pid, 'Được một xô nước đầy! Mang ra chum đổ nha (đi chậm hơn).', 'good');
        end(p.pid, 'done');
      };
      const wait = WATER.crankMinMs - elapsed;
      if (wait <= 0) return giveBucket();
      // Bấm nhanh hơn mức tối thiểu vẫn được nước — gàu chỉ lên đúng lúc crankMinMs (chặn gửi gian lận tức thì).
      s.done = true;
      s.cancel();
      s.cancel = ctx.setTimeout(() => {
        if (sessions.get(p.pid) === s) giveBucket();
      }, wait);
    },
    onLeave(p) {
      if (sessions.has(p.pid)) end(p.pid, 'esc');
    },
    tick(dt) {
      drainAcc += dt;
      if (drainAcc < WATER.jarDrainMs) return;
      drainAcc = 0;
      let changed = false;
      for (const id of Object.keys(jars)) {
        if ((jars[id] ?? 0) > 0) {
          jars[id]!--;
          changed = true;
        }
      }
      if (changed) publish();
    },
    onMapChange() {
      for (const pid of [...sessions.keys()]) end(pid, 'map');
    },
  };
}

export const waterModule: ActivityServerModule = { id: 'water', maps: ['temple'], create: createWater };

// ───────────────────────── Phóng sinh ─────────────────────────

const takeAnimalMsg = z.object({ index: z.number().int().min(0).max(10) });

function createRelease(ctx: ActivityContext): ActivityInstance {
  const cart: AnimalId[] = [];
  for (let i = 0; i < 3; i++) cart.push(ctx.rng.pick(ANIMAL_IDS));
  let acc = 0;
  const publish = () => {
    const s: ReleasePublicState = { cart: [...cart] };
    ctx.setState(s);
  };
  publish();
  return {
    onInteract(p, station) {
      if (station.kind !== 'pond_release' && station.kind !== 'forest_release') return;
      if (p.held?.kind !== 'animal') return ctx.toast(p.pid, 'Lấy con vật ở xe phóng sinh gần cổng trước nhé.', 'info');
      const animal = p.held.variant as AnimalId;
      const place = station.kind === 'pond_release' ? 'pond' : 'forest';
      if (releaseTargetOk(animal, place)) {
        ctx.setHeld(p.pid, null);
        ctx.reward(p.pid, RELEASE.reward, { label: `Phóng sinh ${ANIMAL_NAMES[animal].toLowerCase()}` });
        ctx.emit('released', { animal, x: p.x, z: p.z, ry: station.ry });
        ctx.fx({ type: 'sound', id: animal === 'chim' ? 'bird' : 'splash', x: p.x, z: p.z });
      } else {
        ctx.penalize(p.pid, RELEASE.wrongPenalty, 'Thả sai chỗ');
        ctx.toast(p.pid, animal === 'chim' ? JOKES.releaseWrongBird : JOKES.releaseWrongFish, 'bad');
      }
    },
    onAction(p, type, data) {
      if (type !== 'take') return;
      const r = takeAnimalMsg.safeParse(data);
      if (!r.success || !ctx.isNear(p.pid, 'release_cart', 1.5)) return;
      if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
      const animal = cart[r.data.index];
      if (!animal) return;
      cart.splice(r.data.index, 1);
      ctx.setHeld(p.pid, { kind: 'animal', variant: animal });
      ctx.toast(p.pid, animal === 'chim' ? 'Mang lồng chim ra bìa rừng (phía Đông) thả nhé.' : `Mang ${ANIMAL_NAMES[animal].toLowerCase()} ra ao sen thả nhé.`, 'good');
      publish();
    },
    tick(dt) {
      acc += dt;
      if (acc < RELEASE.refillMs) return;
      acc = 0;
      if (cart.length < RELEASE.cartMax) {
        cart.push(ctx.rng.pick(ANIMAL_IDS));
        publish();
      }
    },
  };
}

export const releaseModule: ActivityServerModule = { id: 'release', maps: ['temple'], create: createRelease };

// ───────────────────────── Thiền định ─────────────────────────

const finishMsg = z.object({ score: z.number().min(0).max(1) });

function createMeditate(ctx: ActivityContext): ActivityInstance {
  const seats = new Map<string, Pid>();
  const sessions = new Map<Pid, { stationId: string; startAt: number }>();
  const publish = () => ctx.setState({ seats: Object.fromEntries(seats) });
  const end = (pid: Pid, reason: string) => {
    const s = sessions.get(pid);
    if (!s) return;
    sessions.delete(pid);
    if (seats.get(s.stationId) === pid) seats.delete(s.stationId);
    ctx.close(pid, reason);
    publish();
  };
  publish();
  return {
    onInteract(p, station) {
      if (station.kind !== 'meditation_cushion' || sessions.has(p.pid)) return;
      if (seats.has(station.id)) return ctx.toast(p.pid, JOKES.stationBusy, 'warn');
      if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
      const startAt = ctx.now() + 1500;
      seats.set(station.id, p.pid);
      sessions.set(p.pid, { stationId: station.id, startAt });
      const open: MeditateOpenData = { stationId: station.id, seed: ctx.rng.int(1, 2 ** 30), startAt, durationMs: MEDITATE.durationMs };
      ctx.open(p.pid, open);
      publish();
    },
    onAction(p, type, data) {
      if (type !== 'finish') return;
      const s = sessions.get(p.pid);
      const r = finishMsg.safeParse(data);
      if (!s || !r.success) return;
      if (ctx.now() - s.startAt < MEDITATE.durationMs - MEDITATE.durationSlackMs) return end(p.pid, 'early');
      const { karma, tapNiem } = meditationReward(r.data.score);
      ctx.reward(p.pid, karma, { label: 'Thiền định' });
      ctx.addTapNiem(p.pid, tapNiem);
      ctx.toast(p.pid, `Định tâm ${Math.round(r.data.score * 100)}% — tâm nhẹ như mây.`, 'good');
      end(p.pid, 'done');
    },
    onLeave(p) {
      end(p.pid, 'esc');
    },
    onMapChange() {
      for (const pid of [...sessions.keys()]) end(pid, 'map');
    },
  };
}

export const meditateModule: ActivityServerModule = { id: 'meditate', maps: ['temple'], create: createMeditate };

// ───────────────────────── Tủ áo ─────────────────────────

const equipMsg = z.object({
  robe: z.enum(ROBE_IDS).optional(),
  hat: z.enum(HAT_IDS).optional(),
  accessory: z.enum(ACCESSORY_IDS).optional(),
});

function createWardrobe(ctx: ActivityContext): ActivityInstance {
  return {
    onAction(p, type, data) {
      if (type !== 'equip') return;
      const r = equipMsg.safeParse(data);
      if (!r.success || !ctx.isNear(p.pid, 'wardrobe', 1.5)) return;
      if (r.data.robe && !r.data.robe.startsWith('robe_')) return;
      if (!ctx.setOutfit(p.pid, r.data)) ctx.toast(p.pid, 'Món này chưa mở khóa.', 'warn');
      else ctx.fx({ type: 'sound', id: 'pop', x: p.x, z: p.z });
    },
  };
}

export const wardrobeModule: ActivityServerModule = { id: 'wardrobe', maps: ['temple'], create: createWardrobe };

// ───────────────────────── Đón khách vãng lai ─────────────────────────

const leadMsg = z.object({ id: z.number().int() });
const canHost = (p: ServerPlayerView, min = GUEST.minRank) => p.isHost || rankAtLeast(p.rank, min);

function createGuest(ctx: ActivityContext): ActivityInstance {
  const guests = new Map<number, GuestNpc>();
  let nextId = 1;
  let spawnAcc = GUEST.spawnEveryMs - 8000;
  let pubAcc = 0;
  let dirty = true;
  const gate = getZone('temple', 'gate_wait')!.shape as { x: number; z: number; w: number; d: number };
  const steps = TEMPLE_MAP.stations.find((s) => s.id === 'temple_steps')!;
  const moveCtx = { canPassGate: () => false };
  /** Khách đang bỏ về đi tới điểm thứ mấy của lối ra. */
  const exitStep = new Map<number, number>();
  /** Vết chân người dẫn (khách đi theo đúng đường người dẫn đã đi — đường đó luôn không vướng vật cản). */
  const trails = new Map<number, { x: number; z: number }[]>();
  const startLeaving = (g: GuestNpc, now: number) => {
    g.state = 'leaving';
    g.leaderPid = null;
    g.arrivedAt = now;
    // Lối ra đi dần về phía Nam: bắt đầu từ điểm đầu tiên còn ở phía trước mặt khách.
    const i = EXIT_PATH.findIndex((wp) => wp.z > g.z + 0.5);
    exitStep.set(g.id, i < 0 ? EXIT_PATH.length - 1 : i);
    dirty = true;
  };
  /** Đi theo vết chân người dẫn, giữ cách người dẫn ~1,5 m. */
  const followTrail = (g: GuestNpc, leader: { x: number; z: number }, dt: number) => {
    const trail = trails.get(g.id) ?? [];
    trails.set(g.id, trail);
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(leader.x - last.x, leader.z - last.z) >= 0.6) {
      trail.push({ x: leader.x, z: leader.z });
      if (trail.length > 400) trail.shift();
    }
    if (Math.hypot(leader.x - g.x, leader.z - g.z) <= 1.5) return;
    // Bỏ các điểm vết đã tới gần.
    while (trail.length > 1 && Math.hypot(trail[0]!.x - g.x, trail[0]!.z - g.z) < 0.4) trail.shift();
    const target = trail[0] ?? leader;
    step(g, target.x, target.z, GUEST.followSpeed, dt);
  };
  const publish = () => {
    const s: GuestPublicState = { guests: [...guests.values()].map((g) => ({ ...g, x: round2(g.x), z: round2(g.z), ry: round2(g.ry) })) };
    ctx.setState(s);
    dirty = false;
  };
  const step = (g: GuestNpc, tx: number, tz: number, speed: number, dt: number, stopAt = 0) => {
    const dx = tx - g.x;
    const dz = tz - g.z;
    const d = Math.hypot(dx, dz);
    if (d <= stopAt + 0.05) return true;
    const mv = Math.min(d - stopAt, (speed * dt) / 1000);
    const res = resolveMove({ x: g.x, z: g.z }, { x: g.x + (dx / d) * mv, z: g.z + (dz / d) * mv }, TEMPLE_MAP, moveCtx);
    g.x = res.x;
    g.z = res.z;
    g.ry = Math.atan2(dx, dz);
    dirty = true;
    return false;
  };
  publish();
  return {
    onAction(p, type, data) {
      if (type !== 'lead') return;
      const r = leadMsg.safeParse(data);
      const g = r.success ? guests.get(r.data.id) : undefined;
      if (!g || g.state !== 'waiting') return;
      if (!canHost(p)) return ctx.toast(p.pid, 'Cần từ Tri Khách Tăng trở lên mới đón khách được.', 'warn');
      if (Math.hypot(p.x - g.x, p.z - g.z) > 3) return ctx.toast(p.pid, JOKES.tooFar, 'warn');
      if ([...guests.values()].some((x) => x.leaderPid === p.pid)) return ctx.toast(p.pid, 'Đang dẫn một vị khách rồi.', 'info');
      g.state = 'following';
      g.leaderPid = p.pid;
      trails.set(g.id, []);
      dirty = true;
      ctx.toast(p.pid, `Dẫn ${g.name} tới bậc Chánh Điện nhé.`, 'good');
    },
    onLeave(p) {
      for (const g of guests.values()) {
        if (g.leaderPid === p.pid && g.state === 'following') {
          g.state = 'waiting';
          g.leaderPid = null;
          trails.delete(g.id);
          dirty = true;
        }
      }
    },
    tick(dt, now) {
      if (ctx.map() !== 'temple') return;
      spawnAcc += dt;
      const waiting = [...guests.values()].filter((g) => g.state === 'waiting').length;
      if (spawnAcc >= GUEST.spawnEveryMs && waiting < GUEST.maxWaiting) {
        spawnAcc = 0;
        const id = nextId++;
        guests.set(id, {
          id,
          name: ctx.rng.pick(NPC_NAMES),
          seed: ctx.rng.int(1, 9999),
          x: gate.x + ctx.rng.range(-gate.w / 2 + 0.5, gate.w / 2 - 0.5),
          z: gate.z + ctx.rng.range(-0.6, 0.6),
          ry: Math.PI,
          state: 'waiting',
          leaderPid: null,
          arrivedAt: now,
        });
        dirty = true;
      }
      for (const g of [...guests.values()]) {
        if (g.state === 'waiting' && now - g.arrivedAt > GUEST.waitMs) startLeaving(g, now);
        if (g.state === 'following') {
          const leader = g.leaderPid ? ctx.player(g.leaderPid) : undefined;
          if (!leader || !leader.connected) {
            g.state = 'waiting';
            g.leaderPid = null;
            trails.delete(g.id);
            continue;
          }
          followTrail(g, leader, dt);
          const leaderAtSteps = Math.hypot(leader.x - steps.x, leader.z - steps.z) <= steps.r + 0.5;
          if (leaderAtSteps && Math.hypot(g.x - steps.x, g.z - steps.z) <= 4) {
            trails.delete(g.id);
            g.state = 'bowing';
            g.ry = Math.PI;
            g.arrivedAt = now;
            ctx.reward(leader.pid, GUEST.reward, { label: 'Đón khách' });
            ctx.emit('bow', { id: g.id });
            ctx.chatSystem(`🙏 ${g.name} vái lạy Chánh Điện, cảm ơn ${leader.name} đã dẫn đường.`);
          }
        } else if (g.state === 'bowing' && now - g.arrivedAt > 2600) {
          startLeaving(g, now);
        } else if (g.state === 'leaving') {
          const i = exitStep.get(g.id) ?? EXIT_PATH.length - 1;
          const wp = EXIT_PATH[i]!;
          const arrived = step(g, wp.x, wp.z, 3, dt, 0.4);
          if (arrived) exitStep.set(g.id, i + 1);
          // Ra tới cổng — hoặc lỡ kẹt quá lâu — thì biến mất.
          if ((arrived && i + 1 >= EXIT_PATH.length) || now - g.arrivedAt > GUEST_LEAVE_TIMEOUT_MS) {
            guests.delete(g.id);
            exitStep.delete(g.id);
            dirty = true;
          }
        }
      }
      pubAcc += dt;
      if (dirty && pubAcc >= 200) {
        pubAcc = 0;
        publish();
      }
    },
    onMapChange() {
      guests.clear();
      exitStep.clear();
      trails.clear();
      dirty = true;
    },
  };
}

/** Lối ra cho khách bỏ về: vòng bên phải đàn tràng + lư hương rồi ra giữa cổng Tam Quan (trong biên map). */
const EXIT_PATH: readonly { x: number; z: number }[] = [
  { x: 5.5, z: -17 },
  { x: 5.5, z: 18 },
  { x: 0, z: 33 },
  { x: 0, z: 38.3 },
];
/** Khách bỏ về quá lâu chưa ra tới cổng (bị kẹt) thì cho biến mất. */
const GUEST_LEAVE_TIMEOUT_MS = 30_000;

export const guestModule: ActivityServerModule = { id: 'guest', maps: ['temple'], create: createGuest };

// ───────────────────────── Nhập kho đồ chay ─────────────────────────

const supplyMsg = z.object({ kind: z.enum(['rice_sack', 'veg_crate']) });

function createRestock(ctx: ActivityContext): ActivityInstance {
  let lastRice = -1;
  let lastVeg = -1;
  const publish = () => ctx.setState({ rice: ctx.shared.get('rice_stock'), veggies: ctx.shared.get('veg_stock') });
  publish();
  return {
    onInteract(p, station) {
      if (station.kind !== 'storage') return;
      if (p.held?.kind !== 'supply') return ctx.toast(p.pid, `Kho: ${ctx.shared.get('rice_stock')} gạo, ${ctx.shared.get('veg_stock')} rau.`, 'info');
      const key = p.held.variant === 'veg_crate' ? 'veg_stock' : 'rice_stock';
      // Kho đầy thì giữ nguyên bao trên tay, không thưởng (tránh nhập khống lấy Công Đức).
      if (ctx.shared.get(key) >= COOK.stockMax) return ctx.toast(p.pid, 'Kho đầy rồi! Để dành nhập sau nhé.', 'warn');
      ctx.shared.add(key, RESTOCK.amount, 0, COOK.stockMax);
      ctx.setHeld(p.pid, null);
      ctx.reward(p.pid, RESTOCK.reward, { label: 'Nhập kho' });
      ctx.fx({ type: 'sound', id: 'thud', x: p.x, z: p.z });
      publish();
    },
    onAction(p, type, data) {
      if (type !== 'take') return;
      const r = supplyMsg.safeParse(data);
      if (!r.success || !ctx.isNear(p.pid, 'supply_cart', 1.5)) return;
      if (!canHost(p, RESTOCK.minRank)) return ctx.toast(p.pid, 'Cần từ Tri Khách Tăng trở lên mới nhập kho được.', 'warn');
      if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
      ctx.setHeld(p.pid, { kind: 'supply', variant: r.data.kind });
      ctx.toast(p.pid, 'Mang vào Kho đồ chay (phía Tây, cạnh nhà bếp).', 'good');
    },
    tick() {
      // Kho có thể đổi bởi Nấu cơm — đồng bộ lại khi lệch.
      const rice = ctx.shared.get('rice_stock');
      const veg = ctx.shared.get('veg_stock');
      if (rice !== lastRice || veg !== lastVeg) {
        lastRice = rice;
        lastVeg = veg;
        publish();
      }
    },
  };
}

export const restockModule: ActivityServerModule = { id: 'restock', maps: ['temple'], create: createRestock };
