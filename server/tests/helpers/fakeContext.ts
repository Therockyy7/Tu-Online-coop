// FakeActivityContext — chạy module hoạt động phía server mà không cần mạng/phòng thật.
// Ghi lại mọi lời gọi (setState, emit, reward…), có đồng hồ giả + hẹn giờ giả + rng seed cố định.
import {
  BUFFS,
  NET,
  RANK_IDS,
  applyTapNiem,
  computeGain,
  createRng,
  findStation,
  isNearStation,
  isOutfitAllowed,
  rankOf,
  unlockedOutfit,
  type ActivityId,
  type BuffId,
  type BuffState,
  type FxMsg,
  type HeldItem,
  type MapId,
  type Outfit,
  type Pid,
  type RankId,
  type Rng,
  type StationDef,
  type Tone,
} from '@shared/index';
import type {
  ActivityContext,
  ActivityInstance,
  ActivityServerModule,
  RewardOptions,
  RoomSharedStore,
  ServerPlayerView,
} from '../../src/activities/types';

export interface FakePlayer {
  pid: Pid;
  name: string;
  rank: RankId;
  isHost: boolean;
  congDuc: number;
  duc: number;
  xu: number;
  vip: boolean;
  tapNiem: number;
  doSay: number;
  x: number;
  z: number;
  held: HeldItem | null;
  activity: ActivityId | null;
  connected: boolean;
  kneeling: boolean;
  joinedAt: number;
  buffs: BuffState[];
  outfit: Outfit;
  title: string | null;
}

interface Timer {
  at: number;
  seq: number;
  fn: () => void;
  cancelled: boolean;
}

export interface Recorded<T> {
  t: number;
  value: T;
}

export class FakeActivityContext implements ActivityContext {
  readonly roomCode = 'TEST';
  readonly rng: Rng;
  time = 1_000_000;
  mapId: MapId = 'temple';
  readonly playersById = new Map<Pid, FakePlayer>();
  readonly states: unknown[] = [];
  readonly events: { type: string; data: unknown; to: Pid[] | 'room' }[] = [];
  readonly opens: { pid: Pid; data: unknown }[] = [];
  readonly closes: { pid: Pid; reason: string }[] = [];
  readonly rewards: { pid: Pid; base: number; gain: number; opts?: RewardOptions }[] = [];
  readonly penalties: { pid: Pid; amount: number }[] = [];
  readonly toasts: { target: Pid | 'room'; text: string; tone?: Tone }[] = [];
  readonly fxs: { msg: FxMsg; to: Pid[] | 'room' }[] = [];
  readonly chats: string[] = [];
  readonly logs: unknown[][] = [];
  /** Các lần đặt cược Công Đức thành công (ctx.wager). */
  readonly wagers: { pid: Pid; amount: number }[] = [];
  roomBuffs: BuffState[] = [];
  dj: Pid | null = null;
  private timers: Timer[] = [];
  private seq = 0;
  private sharedValues = new Map<string, number>();
  readonly shared: RoomSharedStore;

  constructor(
    readonly id: ActivityId,
    seed = 12345,
  ) {
    this.rng = createRng(seed);
    const values = this.sharedValues;
    this.shared = {
      get: (k) => values.get(k) ?? 0,
      set: (k, v) => void values.set(k, v),
      add: (k, d, min = -Infinity, max = Infinity) => {
        const v = Math.min(max, Math.max(min, (values.get(k) ?? 0) + d));
        values.set(k, v);
        return v;
      },
    };
  }

  /** Thêm người chơi giả (mặc định Tiểu Đồng ở điểm spawn). */
  addPlayer(p: Partial<FakePlayer> & { pid: Pid }): FakePlayer {
    const congDuc = p.congDuc ?? 0;
    const full: FakePlayer = {
      name: p.pid,
      rank: rankOf(congDuc),
      isHost: false,
      congDuc,
      duc: congDuc,
      xu: 0,
      vip: false,
      tapNiem: 0,
      doSay: 0,
      x: 0,
      z: 30,
      held: null,
      activity: null,
      connected: true,
      kneeling: false,
      joinedAt: this.time + this.playersById.size,
      buffs: [],
      outfit: { robe: 'robe_nau_rach', hat: 'none', accessory: 'none' },
      title: null,
      ...p,
    };
    this.playersById.set(full.pid, full);
    return full;
  }

  /** Đặt người chơi đứng đúng điểm của trạm. */
  placeAt(pid: Pid, stationId: string): StationDef {
    const found = findStation(stationId);
    if (!found) throw new Error(`Không có trạm ${stationId}`);
    const p = this.mustPlayer(pid);
    p.x = found.station.x;
    p.z = found.station.z;
    return found.station;
  }

  station(stationId: string): StationDef {
    const found = findStation(stationId);
    if (!found) throw new Error(`Không có trạm ${stationId}`);
    return found.station;
  }

  /** Tiến đồng hồ, chạy các hẹn giờ tới hạn theo thứ tự; gọi tick của instance mỗi tickMs nếu truyền vào. */
  advance(ms: number, instance?: ActivityInstance, tickMs = 1000 / NET.tickHz): void {
    const end = this.time + ms;
    while (this.time < end) {
      const step = Math.min(tickMs, end - this.time);
      const target = this.time + step;
      this.runTimersUntil(target);
      this.time = target;
      instance?.tick?.(step, this.time);
    }
    this.runTimersUntil(this.time);
  }

  lastState<T>(): T {
    return this.states[this.states.length - 1] as T;
  }

  eventsOf(type: string, pid?: Pid): unknown[] {
    return this.events
      .filter((e) => e.type === type && (pid === undefined || e.to === 'room' || e.to.includes(pid)))
      .map((e) => e.data);
  }

  view(pid: Pid): ServerPlayerView {
    return this.toView(this.mustPlayer(pid));
  }

  // ── ActivityContext ──
  now(): number {
    return this.time;
  }
  map(): MapId {
    return this.mapId;
  }
  players(): ServerPlayerView[] {
    return [...this.playersById.values()].map((p) => this.toView(p));
  }
  player(pid: Pid): ServerPlayerView | undefined {
    const p = this.playersById.get(pid);
    return p ? this.toView(p) : undefined;
  }
  setState(state: unknown): void {
    this.states.push(structuredClone(state));
  }
  emit(type: string, data?: unknown, to?: Pid | Pid[]): void {
    this.events.push({ type, data: structuredClone(data), to: to === undefined ? 'room' : Array.isArray(to) ? to : [to] });
  }
  open(pid: Pid, data?: unknown): void {
    this.mustPlayer(pid).activity = this.id;
    this.opens.push({ pid, data: structuredClone(data) });
  }
  close(pid: Pid, reason = 'done'): void {
    const p = this.playersById.get(pid);
    if (p && p.activity === this.id) p.activity = null;
    this.closes.push({ pid, reason });
  }
  reward(pid: Pid, base: number, opts?: RewardOptions): number {
    const p = this.mustPlayer(pid);
    const gain = opts?.raw ? Math.max(0, Math.round(base)) : computeGain(base, p.tapNiem, [...p.buffs, ...this.roomBuffs], this.time);
    p.congDuc += gain;
    p.duc += gain;
    p.rank = rankOf(p.congDuc);
    this.rewards.push({ pid, base, gain, opts });
    return gain;
  }
  penalize(pid: Pid, amount: number): void {
    const p = this.mustPlayer(pid);
    p.congDuc = Math.max(0, p.congDuc - amount);
    p.duc = Math.max(0, p.duc - amount);
    p.rank = rankOf(p.congDuc);
    this.penalties.push({ pid, amount });
  }
  addTapNiem(pid: Pid, delta: number): void {
    const p = this.mustPlayer(pid);
    p.tapNiem = applyTapNiem(p.tapNiem, delta);
  }
  addXu(pid: Pid, delta: number): boolean {
    const p = this.mustPlayer(pid);
    if (p.xu + delta < 0) return false;
    p.xu += delta;
    return true;
  }
  spendDuc(pid: Pid, amount: number): boolean {
    const p = this.mustPlayer(pid);
    if (amount < 0 || p.duc < amount) return false;
    p.duc -= amount;
    return true;
  }
  setVip(pid: Pid): void {
    this.mustPlayer(pid).vip = true;
  }
  addDoSay(pid: Pid, delta: number): void {
    const p = this.mustPlayer(pid);
    p.doSay = Math.max(0, Math.min(100, p.doSay + delta));
  }
  addBuff(target: Pid | 'room', buff: BuffId, durationMs = BUFFS[buff].durationMs): void {
    const entry: BuffState = { id: buff, until: this.time + durationMs };
    if (target === 'room') {
      this.roomBuffs = [...this.roomBuffs.filter((b) => b.id !== buff), entry];
      return;
    }
    const p = this.mustPlayer(target);
    p.buffs = [...p.buffs.filter((b) => b.id !== buff), entry];
  }
  wager(pid: Pid, amount: number): boolean {
    const p = this.mustPlayer(pid);
    if (!Number.isInteger(amount) || amount <= 0 || p.duc < amount || p.congDuc < amount) return false;
    p.congDuc -= amount;
    p.duc -= amount;
    p.rank = rankOf(p.congDuc);
    this.wagers.push({ pid, amount });
    return true;
  }
  setHeld(pid: Pid, item: HeldItem | null): void {
    this.mustPlayer(pid).held = item;
  }
  setTitle(pid: Pid, title: string | null): void {
    this.mustPlayer(pid).title = title;
  }
  setOutfit(pid: Pid, outfit: Partial<Outfit>): boolean {
    const p = this.mustPlayer(pid);
    const next = { ...p.outfit, ...outfit };
    if (!isOutfitAllowed(next, unlockedOutfit(p.congDuc, p.vip))) return false;
    p.outfit = next;
    return true;
  }
  setDj(pid: Pid | null): void {
    this.dj = pid;
  }
  djPid(): Pid | null {
    return this.dj;
  }
  toast(target: Pid | 'room', text: string, tone?: Tone): void {
    this.toasts.push({ target, text, tone });
  }
  fx(msg: FxMsg, to?: Pid | Pid[]): void {
    this.fxs.push({ msg, to: to === undefined ? 'room' : Array.isArray(to) ? to : [to] });
  }
  chatSystem(text: string): void {
    this.chats.push(text);
  }
  isNear(pid: Pid, stationId: string, slack = NET.interactSlack): boolean {
    const p = this.playersById.get(pid);
    const found = findStation(stationId);
    if (!p || !found || found.map !== this.mapId) return false;
    return isNearStation(found.station, p, slack);
  }
  setTimeout(fn: () => void, ms: number): () => void {
    const timer: Timer = { at: this.time + Math.max(0, ms), seq: this.seq++, fn, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }
  log(...args: unknown[]): void {
    this.logs.push(args);
  }

  // ── nội bộ ──
  private runTimersUntil(t: number): void {
    for (;;) {
      const due = this.timers
        .filter((x) => !x.cancelled && x.at <= t)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      due.cancelled = true;
      const saved = this.time;
      this.time = Math.max(this.time, due.at);
      due.fn();
      this.time = Math.max(saved, this.time);
    }
    this.timers = this.timers.filter((x) => !x.cancelled);
  }

  private mustPlayer(pid: Pid): FakePlayer {
    const p = this.playersById.get(pid);
    if (!p) throw new Error(`Không có người chơi ${pid}`);
    return p;
  }

  private toView(p: FakePlayer): ServerPlayerView {
    return {
      pid: p.pid,
      name: p.name,
      rank: RANK_IDS.includes(p.rank) ? p.rank : rankOf(p.congDuc),
      isHost: p.isHost,
      congDuc: p.congDuc,
      duc: p.duc,
      xu: p.xu,
      vip: p.vip,
      tapNiem: p.tapNiem,
      doSay: p.doSay,
      x: p.x,
      z: p.z,
      held: p.held,
      activity: p.activity,
      connected: p.connected,
      kneeling: p.kneeling,
      joinedAt: p.joinedAt,
    };
  }
}

/** Tạo instance của module với context giả. */
export function mountActivity(mod: ActivityServerModule, seed?: number) {
  const ctx = new FakeActivityContext(mod.id, seed);
  ctx.mapId = mod.maps[0] ?? 'temple';
  const instance = mod.create(ctx);
  return { ctx, instance };
}
