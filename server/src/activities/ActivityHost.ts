// Chạy các module hoạt động trong 1 phòng: tạo instance, cấp ActivityContext, định tuyến interact/act/host/leave,
// tick 20Hz, lưu trạng thái công khai để gửi cho người mới vào. Lỗi của module không được làm sập server.
import type { ActivityId, MapId, Pid, StationDef } from '@shared/index';
import type { PartyRoom } from '../rooms/PartyRoom';
import type { ServerPlayer } from '../rooms/ServerPlayer';
import type { ActivityContext, ActivityInstance, ActivityServerModule, LeaveReason } from './types';

interface Entry {
  readonly mod: ActivityServerModule;
  inst: ActivityInstance;
  state: unknown;
  hasState: boolean;
}

export class ActivityHost {
  private readonly entries = new Map<ActivityId, Entry>();

  constructor(
    private readonly room: PartyRoom,
    modules: readonly ActivityServerModule[],
  ) {
    for (const mod of modules) {
      const entry: Entry = { mod, inst: {}, state: undefined, hasState: false };
      this.entries.set(mod.id, entry);
      try {
        entry.inst = mod.create(this.makeContext(entry));
      } catch (err) {
        console.error(`[activity:${mod.id}] lỗi khởi tạo`, err);
      }
    }
  }

  private safe<T>(entry: Entry, what: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      console.error(`[activity:${entry.mod.id}] lỗi ở ${what}`, err);
      return undefined;
    }
  }

  private activeHere(entry: Entry): boolean {
    return entry.mod.maps.includes(this.room.map);
  }

  /** Trạng thái công khai của các hoạt động thuộc map (gửi kèm khi vào phòng / đổi map). */
  statesFor(map: MapId): Partial<Record<ActivityId, unknown>> {
    const out: Partial<Record<ActivityId, unknown>> = {};
    for (const [id, e] of this.entries) if (e.hasState && e.mod.maps.includes(map)) out[id] = e.state;
    return out;
  }

  interact(p: ServerPlayer, station: StationDef): boolean {
    const e = this.entries.get(station.activity);
    if (!e || !this.activeHere(e) || !e.inst.onInteract) return false;
    this.safe(e, 'onInteract', () => e.inst.onInteract!(this.room.viewOf(p), station));
    return true;
  }

  action(p: ServerPlayer, a: ActivityId, type: string, data: unknown): void {
    const e = this.entries.get(a);
    if (!e || !this.activeHere(e)) return;
    this.safe(e, 'onAction', () => e.inst.onAction?.(this.room.viewOf(p), type, data));
  }

  hostAction(p: ServerPlayer, a: ActivityId, action: string, data: unknown): void {
    const e = this.entries.get(a);
    if (!e || !this.activeHere(e)) return;
    this.safe(e, 'onHostAction', () => e.inst.onHostAction?.(this.room.viewOf(p), action, data));
  }

  /** Esc: rời hoạt động đang tham gia. */
  leave(p: ServerPlayer, reason: LeaveReason): void {
    const a = p.activity;
    if (!a) return;
    const e = this.entries.get(a);
    if (e) this.safe(e, 'onLeave', () => e.inst.onLeave?.(this.room.viewOf(p), reason));
    // Module không tự đóng thì đóng giúp để người chơi khỏi kẹt.
    if (p.activity === a) this.room.closeActivity(p.pid, a, reason);
  }

  /** Mất kết nối / rời phòng / bị phạt quỳ: báo mọi module (có module theo dõi người chơi ở sảnh chờ). */
  leaveAll(p: ServerPlayer, reason: LeaveReason): void {
    const view = this.room.viewOf(p);
    for (const e of this.entries.values()) this.safe(e, 'onLeave', () => e.inst.onLeave?.(view, reason));
    if (p.activity) this.room.closeActivity(p.pid, p.activity, reason);
  }

  tick(dtMs: number, now: number): void {
    for (const e of this.entries.values()) {
      if (e.inst.tick) this.safe(e, 'tick', () => e.inst.tick!(dtMs, now));
    }
  }

  isBusy(): boolean {
    for (const e of this.entries.values()) {
      if (this.safe(e, 'isBusy', () => e.inst.isBusy?.() ?? false)) return true;
    }
    return false;
  }

  /** Tên các hoạt động đang bận (để báo lý do không đổi map được). */
  busyNames(): ActivityId[] {
    const out: ActivityId[] = [];
    for (const [id, e] of this.entries) if (this.safe(e, 'isBusy', () => e.inst.isBusy?.() ?? false)) out.push(id);
    return out;
  }

  onMapChange(map: MapId): void {
    for (const e of this.entries.values()) this.safe(e, 'onMapChange', () => e.inst.onMapChange?.(map));
  }

  dispose(): void {
    for (const e of this.entries.values()) this.safe(e, 'dispose', () => e.inst.dispose?.());
    this.entries.clear();
  }

  private makeContext(entry: Entry): ActivityContext {
    const room = this.room;
    const id = entry.mod.id;
    return {
      id,
      roomCode: room.code,
      rng: room.rng,
      shared: room.shared,
      now: () => Date.now(),
      map: () => room.map,
      players: () => [...room.players.values()].map((p) => room.viewOf(p)),
      player: (pid: Pid) => {
        const p = room.players.get(pid);
        return p ? room.viewOf(p) : undefined;
      },
      setState: (state) => {
        entry.state = state;
        entry.hasState = true;
        room.broadcastActState(id, state);
      },
      emit: (type, data, to) => room.emitActEvent(id, type, data ?? null, to),
      open: (pid, data) => room.openActivity(pid, id, data ?? null),
      close: (pid, reason = 'done') => room.closeActivity(pid, id, reason),
      reward: (pid, base, opts) => room.reward(pid, base, opts),
      penalize: (pid, amount, label) => room.penalize(pid, amount, label),
      addTapNiem: (pid, delta, silent) => room.addTapNiem(pid, delta, silent),
      addXu: (pid, delta) => room.addXu(pid, delta),
      spendDuc: (pid, amount) => room.spendDuc(pid, amount),
      wager: (pid, amount) => room.wager(pid, amount),
      setVip: (pid) => room.setVip(pid),
      addDoSay: (pid, delta) => room.addDoSay(pid, delta),
      addBuff: (target, buff, durationMs) => room.addBuff(target, buff, durationMs),
      setHeld: (pid, item) => room.setHeld(pid, item),
      setTitle: (pid, title) => room.setTitle(pid, title),
      setOutfit: (pid, outfit) => room.setOutfit(pid, outfit),
      setDj: (pid) => room.setDj(pid),
      djPid: () => room.djPid,
      toast: (target, text, tone) => room.toast(target, text, tone),
      fx: (msg, to) => room.fx(msg, to),
      chatSystem: (text) => room.chatSystem(text),
      isNear: (pid, stationId, slack) => room.isNear(pid, stationId, slack),
      setTimeout: (fn, ms) => room.setRoomTimeout(() => this.safe(entry, 'timer', fn), ms),
      log: (...args) => console.log(`[${room.code}:${id}]`, ...args),
    };
  }
}
