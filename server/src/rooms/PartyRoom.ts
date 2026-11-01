// Một phòng chơi (một "chùa"): người chơi, map hiện tại, Phương Trượng, quỹ Công Đức, buff phòng,
// đổi map Hạ Sơn / Hồi Sơn, chat/emote, thưởng phạt và các hoạt động. Server quyết định mọi luật.
import { randomInt } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  ACCESSORY_IDS,
  BLESS,
  BUFFS,
  CASINO,
  CHOP,
  COOK,
  DO_SAY,
  HAT_IDS,
  HOST,
  HOST_TITLE,
  JOKES,
  MAP_NAMES,
  MOVE,
  NET,
  RANK_NAMES,
  ROBE_IDS,
  ROOM,
  applyTapNiem,
  canPassGate,
  computeGain,
  defaultRobeFor,
  findStation,
  getMap,
  isNearStation,
  isOutfitAllowed,
  pickHost,
  poolShareOf,
  rankAtLeast,
  rankIndex,
  rankOf,
  resolveMove,
  rngFrom,
  round2,
  sanitizeChat,
  settle,
  unlockedOutfit,
  type ActivityId,
  type BuffId,
  type BuffState,
  type ClientToServerEvents,
  type FxMsg,
  type HeldItem,
  type JoinResult,
  type MapChange,
  type MapId,
  type MoveContext,
  type Outfit,
  type Pid,
  type PlayerPublic,
  type Profile,
  type RankId,
  type Rng,
  type RoomPublic,
  type SelfState,
  type ServerToClientEvents,
  type SnapEntry,
  type Tone,
  type Vec2,
} from '@shared/index';
import { ActivityHost } from '../activities/ActivityHost';
import type {
  ActivityServerModule,
  LeaveReason,
  RewardOptions,
  RoomSharedStore,
  ServerPlayerView,
} from '../activities/types';
import { actSchema, emoteSchema, hostSchema, pidSchema, poseSchema, stationIdSchema } from '../net/schemas';
import type { ProfileService } from '../profiles/ProfileService';
import { ServerPlayer, type GameSocket } from './ServerPlayer';

export type GameIo = Server<ClientToServerEvents, ServerToClientEvents>;

export interface RoomHooks {
  /** Người chơi rời hẳn phòng (để RoomManager bỏ chỉ mục khóa → phòng). */
  onPlayerRemoved(room: PartyRoom, player: ServerPlayer): void;
}

const normalizeAngle = (a: number): number => {
  const t = Math.PI * 2;
  return ((((a + Math.PI) % t) + t) % t) - Math.PI;
};

export class PartyRoom {
  readonly channel: string;
  map: MapId = 'temple';
  readonly players = new Map<Pid, ServerPlayer>();
  hostPid: Pid | null = null;
  djPid: Pid | null = null;
  /** Quỹ Công Đức (số thực; gửi đi dạng làm tròn xuống). */
  pool = 0;
  mapChange: MapChange | null = null;
  roomBuffs: BuffState[] = [];
  readonly shared: RoomSharedStore;
  /** RNG luật chơi: lấy thẳng từ crypto mỗi lần gọi. */
  readonly rng: Rng = rngFrom(() => randomInt(0, 2 ** 32) / 2 ** 32);
  /** Thời điểm phòng trở nên trống (null = đang có người). */
  emptySince: number | null;
  readonly activities: ActivityHost;

  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly tickTimer: NodeJS.Timeout;
  private readonly snapTimer: NodeJS.Timeout;
  private lastTick = Date.now();
  private pidSeq = 0;
  private disposed = false;
  /** Lần đổi ghế Phương Trượng gần nhất giữa 2 người (để không báo lại khi cùng cặp đổi qua lại — HOST.swapQuietMs). */
  private lastHostSwap: { a: Pid; b: Pid; at: number } | null = null;

  constructor(
    readonly code: string,
    private readonly io: GameIo,
    private readonly profiles: ProfileService,
    modules: readonly ActivityServerModule[],
    private readonly hooks: RoomHooks,
  ) {
    this.channel = `room:${code}`;
    const values = new Map<string, number>([
      ['firewood', CHOP.firewoodStart],
      ['rice_stock', COOK.stockStart.rice],
      ['veg_stock', COOK.stockStart.veggies],
      ['dj_track', 0],
      ['dj_started_at', Date.now()],
    ]);
    this.shared = {
      get: (k) => values.get(k) ?? 0,
      set: (k, v) => void values.set(k, v),
      add: (k, d, min = -Infinity, max = Infinity) => {
        const v = Math.min(max, Math.max(min, (values.get(k) ?? 0) + d));
        values.set(k, v);
        return v;
      },
    };
    this.emptySince = Date.now();
    this.activities = new ActivityHost(this, modules);
    this.tickTimer = setInterval(() => this.safeTick(), 1000 / NET.tickHz);
    this.snapTimer = setInterval(() => this.sendSnapshot(), 1000 / NET.snapHz);
  }

  // ───────────────────────── Vào / ra phòng ─────────────────────────

  get isFull(): boolean {
    return this.players.size >= ROOM.maxPlayers;
  }

  findByKey(key: string): ServerPlayer | undefined {
    for (const p of this.players.values()) if (p.key === key) return p;
    return undefined;
  }

  addPlayer(socket: GameSocket, profile: Profile): ServerPlayer {
    const now = Date.now();
    const pid = `p${(++this.pidSeq).toString(36)}${randomInt(36 * 36).toString(36)}`;
    const p = new ServerPlayer(pid, profile, socket, now);
    const spawn = this.spawnPoint(this.map);
    p.x = spawn.x;
    p.z = spawn.z;
    p.ry = Math.PI; // nhìn vào trong (về phía Bắc)
    p.unlockedSig = JSON.stringify(unlockedOutfit(profile.peakCongDuc, profile.vip));
    this.players.set(pid, p);
    this.emptySince = null;
    void socket.join(this.channel);
    socket.to(this.channel).emit('playerJoined', this.toPublic(p));
    this.broadcastRoom({ playerCount: this.players.size });
    this.chatSystem(`${p.name} đã vào ${MAP_NAMES[this.map].toLowerCase()}.`);
    this.recomputeHost();
    return p;
  }

  /** Cùng khóa vào lại trong thời gian ân hạn (hoặc tab mới): gắn socket mới, giữ nguyên vị trí. */
  reattach(p: ServerPlayer, socket: GameSocket): void {
    p.socket = socket;
    p.connected = true;
    p.disconnectedAt = 0;
    p.lastPoseAt = Date.now();
    void socket.join(this.channel);
    this.broadcastPatch(p.pid, { connected: true });
    this.recomputeHost();
  }

  joinResult(p: ServerPlayer): JoinResult {
    return {
      ok: true,
      key: p.key,
      you: this.toSelf(p),
      room: this.roomPublic(),
      players: [...this.players.values()].map((x) => this.toPublic(x)),
      activities: this.activities.statesFor(this.map),
      serverTime: Date.now(),
    };
  }

  onDisconnect(p: ServerPlayer, socket: GameSocket): void {
    if (p.socket !== socket || !this.players.has(p.pid)) return;
    p.socket = null;
    p.connected = false;
    p.disconnectedAt = Date.now();
    this.activities.leaveAll(p, 'disconnect');
    this.broadcastPatch(p.pid, { connected: false });
    this.recomputeHost();
    void this.profiles.flush(p.key);
  }

  /** Tách socket cũ (vd cùng khóa vào ở tab khác) mà không coi là mất kết nối. */
  detachSocket(p: ServerPlayer, reason: string): void {
    const old = p.socket;
    p.socket = null;
    if (old) {
      old.emit('kicked', reason);
      void old.leave(this.channel);
      old.disconnect(true);
    }
  }

  removePlayer(p: ServerPlayer, why: 'timeout' | 'left' | 'moved'): void {
    if (!this.players.has(p.pid)) return;
    this.activities.leaveAll(p, 'left');
    this.players.delete(p.pid);
    if (p.socket) void p.socket.leave(this.channel);
    this.io.to(this.channel).emit('playerLeft', p.pid);
    if (why !== 'moved') this.chatSystem(`${p.name} đã rời ${MAP_NAMES[this.map].toLowerCase()}.`);
    if (this.djPid === p.pid) this.setDj(null);
    this.broadcastRoom({ playerCount: this.players.size });
    this.recomputeHost();
    if (this.players.size === 0) this.emptySince = Date.now();
    this.hooks.onPlayerRemoved(this, p);
    void this.profiles.release(p.key);
  }

  private spawnPoint(mapId: MapId): Vec2 {
    const map = getMap(mapId);
    const { x, z, r } = map.spawn;
    const ctx: MoveContext = { canPassGate: () => false };
    for (let i = 0; i < 12; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = Math.sqrt(this.rng.next()) * r;
      const s = settle({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d }, map, ctx);
      if (Math.hypot(s.x - x, s.z - z) <= r + 0.5) return s;
    }
    return { x, z };
  }

  // ───────────────────────── Vòng lặp ─────────────────────────

  private safeTick(): void {
    try {
      this.tick();
    } catch (err) {
      console.error(`[room ${this.code}] lỗi tick`, err);
    }
  }

  private tick(): void {
    const now = Date.now();
    const dt = Math.min(250, now - this.lastTick);
    this.lastTick = now;
    if (this.mapChange && now >= this.mapChange.at) this.performMapChange();

    const roomBuffsBefore = this.roomBuffs.length;
    this.roomBuffs = this.roomBuffs.filter((b) => b.until > now);
    const roomBuffsChanged = this.roomBuffs.length !== roomBuffsBefore;

    for (const p of this.players.values()) {
      if (p.kneelUntil && now >= p.kneelUntil) {
        p.kneelUntil = 0;
        if (p.anim === 'kneel') p.anim = 'idle';
        this.broadcastPatch(p.pid, { kneelUntil: 0, anim: p.anim });
        this.toast(p.pid, 'Đã sám hối xong. A Di Đà Phật!', 'good');
      }
      const active = p.buffs.filter((b) => b.until > now);
      if (active.length !== p.buffs.length) {
        p.buffs = active;
        this.sendBuffs(p);
      } else if (roomBuffsChanged) {
        this.sendBuffs(p);
      }
      if (p.doSay > 0) {
        const before = Math.round(p.doSay);
        p.doSay = Math.max(0, p.doSay - (DO_SAY.decayPerSec * dt) / 1000);
        const after = Math.round(p.doSay);
        if (after !== before) {
          this.sendSelf(p, { doSay: after });
          this.broadcastPatch(p.pid, { doSay: after });
        }
      }
      if (!p.connected && now - p.disconnectedAt >= ROOM.reconnectGraceMs) this.removePlayer(p, 'timeout');
    }
    this.activities.tick(dt, now);
  }

  private sendSnapshot(): void {
    if (this.players.size === 0) return;
    const p: SnapEntry[] = [];
    for (const pl of this.players.values()) p.push([pl.pid, round2(pl.x), round2(pl.z), round2(pl.ry), pl.anim]);
    this.io.to(this.channel).volatile.emit('snap', { t: Date.now(), p });
  }

  // ───────────────────────── Gói tin từ client ─────────────────────────

  onPose(p: ServerPlayer, raw: unknown): void {
    const now = Date.now();
    if (!p.limits.pose.take(now)) return;
    const parsed = poseSchema.safeParse(raw);
    if (!parsed.success) return;
    if (p.kneeling(now)) return;
    const m = parsed.data;
    const dt = Math.min(1, Math.max(0.05, (now - p.lastPoseAt) / 1000));
    p.lastPoseAt = now;
    p.ry = normalizeAngle(m.ry);
    p.anim = m.anim;
    const dist = Math.hypot(m.x - p.x, m.z - p.z);
    if (dist < 1e-4) return;
    if (dist > this.maxSpeedOf(p, now) * MOVE.speedTolerance * dt + 0.6) {
      this.correct(p);
      return;
    }
    const from = { x: p.x, z: p.z };
    const res = resolveMove(from, { x: m.x, z: m.z }, getMap(this.map), this.moveCtx(p, from));
    p.x = res.x;
    p.z = res.z;
    if (Math.hypot(res.x - m.x, res.z - m.z) > 0.35) this.correct(p);
  }

  onChat(p: ServerPlayer, raw: unknown): void {
    if (!p.limits.chat.take()) {
      this.toast(p.pid, 'Chat chậm lại chút nha (1 tin mỗi giây).', 'warn');
      return;
    }
    const text = sanitizeChat(raw);
    if (!text) return;
    this.io.to(this.channel).emit('chat', { pid: p.pid, name: p.name, text, t: Date.now() });
  }

  onEmote(p: ServerPlayer, raw: unknown): void {
    if (!p.limits.emote.take()) return;
    const r = emoteSchema.safeParse(raw);
    if (!r.success || p.kneeling(Date.now())) return;
    this.io.to(this.channel).emit('emote', p.pid, r.data);
  }

  onInteract(p: ServerPlayer, raw: unknown): void {
    const now = Date.now();
    if (!p.limits.interact.take(now)) return;
    const r = stationIdSchema.safeParse(raw);
    if (!r.success) return;
    if (p.kneeling(now)) return this.toast(p.pid, 'Đang quỳ sám hối, chưa làm gì được.', 'warn');
    const found = findStation(r.data);
    if (!found || found.map !== this.map) return;
    if (!isNearStation(found.station, p, NET.interactSlack)) return this.toast(p.pid, JOKES.tooFar, 'warn');
    if (p.activity && p.activity !== found.station.activity) {
      return this.toast(p.pid, 'Đang bận việc khác (Esc để thoát).', 'warn');
    }
    this.activities.interact(p, found.station);
  }

  onDrop(p: ServerPlayer): void {
    if (!p.limits.misc.take() || !p.held) return;
    this.setHeld(p.pid, null);
  }

  onLeaveActivity(p: ServerPlayer): void {
    if (!p.limits.misc.take()) return;
    this.activities.leave(p, 'esc');
  }

  onAct(p: ServerPlayer, raw: unknown): void {
    if (!p.limits.act.take()) return;
    const r = actSchema.safeParse(raw);
    if (!r.success) return;
    if (p.kneeling(Date.now())) return;
    this.activities.action(p, r.data.a, r.data.type, r.data.data);
  }

  onHost(p: ServerPlayer, raw: unknown): void {
    if (!p.limits.misc.take()) return;
    const r = hostSchema.safeParse(raw);
    if (!r.success) return;
    if (this.hostPid !== p.pid) return this.toast(p.pid, `Chỉ ${HOST_TITLE} mới dùng được menu này.`, 'warn');
    const m = r.data;
    switch (m.type) {
      case 'gift':
        return this.hostGift(p, m.target, m.amount);
      case 'punish':
        return this.hostPunish(p, m.target);
      case 'go_bar':
        return this.requestMapChange(p, 'bar');
      case 'go_temple':
        return this.requestMapChange(p, 'temple');
      case 'activity':
        return this.activities.hostAction(p, m.a, m.action, m.data);
    }
  }

  onBless(p: ServerPlayer, raw: unknown): void {
    const now = Date.now();
    if (!p.limits.misc.take(now)) return;
    const r = pidSchema.safeParse(raw);
    if (!r.success) return;
    const target = this.players.get(r.data);
    if (!target || target === p || !target.connected) return;
    if (!(this.hostPid === p.pid || rankAtLeast(p.rank, 'tri_khach_tang'))) {
      return this.toast(p.pid, 'Cần từ Tri Khách Tăng trở lên mới ban phước được.', 'warn');
    }
    if (target.rank !== 'tieu_dong') return this.toast(p.pid, 'Chỉ ban phước cho Tiểu Đồng thôi.', 'warn');
    if (Math.hypot(target.x - p.x, target.z - p.z) > BLESS.range + NET.interactSlack) {
      return this.toast(p.pid, JOKES.tooFar, 'warn');
    }
    if (now < p.blessReadyAt) {
      return this.toast(p.pid, `Chờ ${Math.ceil((p.blessReadyAt - now) / 1000)} giây nữa mới ban phước tiếp được.`, 'warn');
    }
    if (target.buffs.some((b) => b.id === 'ban_phuoc' && b.until > now)) {
      return this.toast(p.pid, 'Người này đang được ban phước rồi.', 'warn');
    }
    p.blessReadyAt = now + BLESS.cooldownMs;
    this.addBuff(target.pid, 'ban_phuoc', BLESS.durationMs);
    this.reward(p.pid, BLESS.blesserReward, { label: 'Ban phước' });
    this.fx({ type: 'sound', id: 'bell_small', x: target.x, z: target.z });
    this.fx({ type: 'bless', from: p.pid, to: target.pid });
    this.toast(target.pid, `${p.name} đã ban phước cho bạn: Công Đức ×1,2 trong 3 phút!`, 'gold');
    this.toast(p.pid, `Đã ban phước cho ${target.name}.`, 'good');
  }

  // ───────────────────────── Menu Phương Trượng ─────────────────────────

  private hostGift(p: ServerPlayer, targetPid: Pid, amount: number): void {
    const target = this.players.get(targetPid);
    if (!target) return;
    if (target === p) return this.toast(p.pid, 'Phương Trượng không tự phát bổng lộc cho mình nha.', 'warn');
    if (!(HOST.giftAmounts as readonly number[]).includes(amount)) return;
    if (Math.floor(this.pool) < amount) {
      return this.toast(p.pid, `Quỹ Công Đức chỉ còn ${Math.floor(this.pool)}, chưa đủ ${amount}.`, 'warn');
    }
    this.pool -= amount;
    this.broadcastRoom({ pool: Math.floor(this.pool) });
    this.reward(target.pid, amount, { raw: true, noPool: true, label: 'Bổng lộc' });
    this.fx({ type: 'sound', id: 'coin', x: target.x, z: target.z });
    this.toast(target.pid, `${HOST_TITLE} ${p.name} phát bổng lộc ${amount} Công Đức cho bạn!`, 'gold');
    this.chatSystem(`${HOST_TITLE} ${p.name} phát bổng lộc ${amount} Công Đức cho ${target.name}.`);
  }

  private hostPunish(p: ServerPlayer, targetPid: Pid): void {
    const now = Date.now();
    const target = this.players.get(targetPid);
    if (!target || !target.connected) return;
    if (target === p) return this.toast(p.pid, 'Không tự phạt mình được.', 'warn');
    if (now - p.lastPunishAt < HOST.punishCooldownMs) {
      return this.toast(p.pid, `Chờ ${Math.ceil((HOST.punishCooldownMs - (now - p.lastPunishAt)) / 1000)} giây nữa mới phạt tiếp được.`, 'warn');
    }
    if (now - target.lastPunishedAt < HOST.punishSameTargetMs) {
      return this.toast(p.pid, `${target.name} vừa bị phạt, tha cho 2 phút nha.`, 'warn');
    }
    p.lastPunishAt = now;
    target.lastPunishedAt = now;
    this.activities.leaveAll(target, 'esc');
    target.kneelUntil = now + HOST.punishMs;
    target.anim = 'kneel';
    this.broadcastPatch(target.pid, { kneelUntil: target.kneelUntil, anim: 'kneel' });
    this.addTapNiem(target.pid, -HOST.punishTapNiemRelief);
    this.fx({ type: 'sound', id: 'gong', x: target.x, z: target.z });
    this.toast(target.pid, `Bạn bị ${HOST_TITLE} phạt quỳ sám hối 15 giây. Sám hối cũng bớt Tạp Niệm!`, 'bad');
    this.chatSystem(`${HOST_TITLE} ${p.name} phạt ${target.name} quỳ sám hối 15 giây.`);
  }

  private requestMapChange(p: ServerPlayer, to: MapId): void {
    if (this.map === to) return;
    if (this.mapChange) return this.toast(p.pid, 'Đang chuẩn bị dịch chuyển rồi.', 'warn');
    if (this.activities.isBusy()) {
      return this.toast(p.pid, 'Đang có phiên chơi chung, đợi xong rồi hãy đi nha.', 'warn');
    }
    const at = Date.now() + HOST.mapChangeCountdownMs;
    this.mapChange = { to, at };
    this.broadcastRoom({ mapChange: this.mapChange });
    if (to === 'bar') {
      this.fx({ type: 'banner', title: 'Hạ Sơn Xả Nghiệp!', sub: `${HOST_TITLE} ${p.name} dẫn cả chùa xuống núi trong 5 giây…`, tone: 'gold', big: true });
    } else {
      this.fx({ type: 'banner', title: 'Hồi Sơn!', sub: `${HOST_TITLE} ${p.name} dẫn mọi người về chùa trong 5 giây…`, tone: 'gold', big: true });
    }
    this.fx({ type: 'sound', id: 'gong' });
  }

  private performMapChange(): void {
    const change = this.mapChange;
    if (!change) return;
    this.mapChange = null;
    // Trong 5 giây đếm ngược có người mở phiên chơi chung (thời khóa, đặt cược…) → hủy chuyến, không xóa phiên đó.
    if (this.activities.isBusy()) {
      this.broadcastRoom({ mapChange: null });
      this.fx({ type: 'banner', title: 'Hoãn dịch chuyển', sub: 'Có phiên chơi chung vừa bắt đầu — chơi xong rồi đi nha.', tone: 'warn' });
      return;
    }
    this.map = change.to;
    this.activities.onMapChange(change.to);
    const now = Date.now();
    for (const p of this.players.values()) {
      const s = this.spawnPoint(change.to);
      p.x = s.x;
      p.z = s.z;
      p.ry = Math.PI;
      p.held = null;
      p.activity = null;
      p.lastPoseAt = now;
      if (!p.kneeling(now)) p.anim = 'idle';
    }
    // Danh hiệu DJ chỉ do thắng vòng nhảy (setDj) mà có — Hạ Sơn KHÔNG trao cho Phương Trượng (Phương Trượng không còn
    // quyền riêng ở bàn DJ, vẫn mở được vòng nhảy). Giữ người thắng vòng nhảy gần nhất nếu người đó còn trong phòng.
    if (this.djPid && !this.players.has(this.djPid)) this.djPid = null;
    this.broadcastRoom({ map: change.to, mapChange: null, djPid: this.djPid });
    for (const p of this.players.values()) {
      this.broadcastPatch(p.pid, { x: round2(p.x), z: round2(p.z), ry: p.ry, held: null, activity: null, anim: p.anim });
    }
    for (const [a, state] of Object.entries(this.activities.statesFor(change.to))) {
      this.io.to(this.channel).emit('actState', a as ActivityId, state);
    }
    this.fx({ type: 'sound', id: 'teleport' });
    this.chatSystem(change.to === 'bar' ? 'Cả chùa đã xuống núi tới Quán Bar. Xả nghiệp thôi!' : 'Cả nhóm đã về chùa. Làm công quả hóa giải Tạp Niệm nào!');
  }

  // ───────────────────────── Phương Trượng ─────────────────────────

  recomputeHost(): void {
    const next = pickHost(
      [...this.players.values()].map((p) => ({
        pid: p.pid,
        congDuc: p.profile.congDuc,
        joinedAt: p.joinedAt,
        connected: p.connected,
      })),
    );
    if (next === this.hostPid) return;
    const prev = this.hostPid ? this.players.get(this.hostPid) : undefined;
    this.hostPid = next;
    this.broadcastRoom({ hostPid: next });
    if (prev) {
      this.broadcastPatch(prev.pid, { isHost: false });
      this.sendSelf(prev, { isHost: false });
    }
    const host = next ? this.players.get(next) : undefined;
    if (!host) return;
    this.broadcastPatch(host.pid, { isHost: true });
    this.sendSelf(host, { isHost: true });
    // Cùng một cặp người đổi ghế qua lại trong HOST.swapQuietMs (vd đặt / gỡ cược quanh mức Công Đức của nhau): ghế vẫn
    // đổi thật (patch ở trên), nhưng không bắn lại banner / chuông / tin chat cho cả phòng.
    const now = Date.now();
    const last = this.lastHostSwap;
    const repeat =
      !!prev &&
      !!last &&
      now - last.at < HOST.swapQuietMs &&
      ((last.a === prev.pid && last.b === host.pid) || (last.a === host.pid && last.b === prev.pid));
    if (prev) this.lastHostSwap = { a: prev.pid, b: host.pid, at: now };
    if (repeat) return;
    const connected = [...this.players.values()].filter((p) => p.connected).length;
    if (connected > 1) {
      this.fx({ type: 'banner', title: `${host.name} trở thành ${HOST_TITLE}!`, sub: 'Người nhiều Công Đức nhất chùa — mở menu bằng phím H', tone: 'gold', big: true });
      this.fx({ type: 'sound', id: 'bell_big' });
      this.chatSystem(`👑 ${host.name} trở thành ${HOST_TITLE}.`);
    } else {
      this.toast(host.pid, `Bạn đang là ${HOST_TITLE} của chùa này (phím H mở menu).`, 'gold');
    }
  }

  setDj(pid: Pid | null): void {
    if (this.djPid === pid) return;
    this.djPid = pid;
    this.broadcastRoom({ djPid: pid });
  }

  // ───────────────────────── Điểm số & trạng thái ─────────────────────────

  effectiveBuffs(p: ServerPlayer, now = Date.now()): BuffState[] {
    return [...p.buffs, ...this.roomBuffs].filter((b) => b.until > now);
  }

  private maxSpeedOf(p: ServerPlayer, now: number): number {
    const fed = this.effectiveBuffs(p, now).some((b) => b.id === 'no_bung');
    return MOVE.speed * (fed ? 1 + BUFFS.no_bung.speedBonus : 1);
  }

  private moveCtx(p: ServerPlayer, from: Vec2): MoveContext {
    const map = getMap(this.map);
    const who = { rank: p.rank, isHost: this.hostPid === p.pid, vip: p.profile.vip };
    return { canPassGate: (g) => canPassGate(g, who, map, from) };
  }

  private correct(p: ServerPlayer): void {
    p.socket?.emit('playerPatch', p.pid, { x: round2(p.x), z: round2(p.z) });
  }

  reward(pid: Pid, base: number, opts: RewardOptions = {}): number {
    const p = this.players.get(pid);
    if (!p || !(base > 0)) return 0;
    const now = Date.now();
    const prof = p.profile;
    const gain = opts.raw ? Math.round(base) : computeGain(base, prof.tapNiem, this.effectiveBuffs(p, now), now);
    if (gain <= 0) return 0;
    // Thăng cấp thật chỉ khi vượt cấp cao nhất từng đạt — tính theo Công Đức đỉnh TRƯỚC lần cộng này (gỡ / hoàn / thắng
    // lại cược Sòng Công Đức qua ngưỡng cấp chỉ là phục hồi cấp cũ).
    const bestRank = rankOf(prof.peakCongDuc);
    prof.congDuc += gain;
    prof.duc += gain;
    prof.peakCongDuc = Math.max(prof.peakCongDuc, prof.congDuc);
    prof.stats.earned = (prof.stats.earned ?? 0) + gain;
    if (!opts.noPool) {
      const before = Math.floor(this.pool);
      this.pool += poolShareOf(gain);
      if (Math.floor(this.pool) !== before) this.broadcastRoom({ pool: Math.floor(this.pool) });
    }
    if (!opts.silent) this.fx({ type: 'karma', pid, amount: gain, label: opts.label });
    this.afterKarmaChange(p, bestRank);
    return gain;
  }

  penalize(pid: Pid, amount: number, label?: string): void {
    const p = this.players.get(pid);
    if (!p || !(amount > 0)) return;
    const prof = p.profile;
    const oldRank = rankOf(prof.congDuc);
    const lost = Math.min(prof.congDuc, Math.round(amount));
    prof.congDuc -= lost;
    prof.duc = Math.max(0, prof.duc - Math.round(amount));
    this.fx({ type: 'karma', pid, amount: -Math.round(amount), label });
    this.afterKarmaChange(p, oldRank);
  }

  /**
   * Gửi Công Đức / cấp mới cho chính người đó (self) + cả phòng (patch). Thăng cấp (pháo rankup, banner, tin chat, đổi
   * áo mặc định theo cấp) chỉ khi cấp mới vượt `prevBest`: reward truyền cấp tính theo Công Đức đỉnh TRƯỚC lần cộng, nên
   * phục hồi lại cấp cũ (gỡ / hoàn / thắng lại cược) chỉ cập nhật số, không báo cả phòng, không đổi áo người chơi đã chọn;
   * penalize / wager truyền cấp trước khi trừ (chỉ có thể tụt).
   */
  private afterKarmaChange(p: ServerPlayer, prevBest: RankId): void {
    const prof = p.profile;
    const rank = rankOf(prof.congDuc);
    const self: Partial<SelfState> = { congDuc: prof.congDuc, duc: prof.duc, peakCongDuc: prof.peakCongDuc, rank };
    const pub: Partial<PlayerPublic> = { congDuc: prof.congDuc, rank };
    if (rankIndex(rank) > rankIndex(prevBest)) {
      prof.outfit = { ...prof.outfit, robe: defaultRobeFor(rank) };
      self.outfit = prof.outfit;
      pub.outfit = prof.outfit;
      this.fx({ type: 'rankup', pid: p.pid, rank });
      this.fx(
        { type: 'banner', title: `Thăng cấp: ${RANK_NAMES[rank]}!`, sub: 'Đã thay áo mới và mở thêm quyền hạn.', tone: 'gold', big: true },
        p.pid,
      );
      this.chatSystem(`🎉 ${p.name} đã thăng cấp ${RANK_NAMES[rank]}!`);
    }
    const unlocked = unlockedOutfit(prof.peakCongDuc, prof.vip);
    const sig = JSON.stringify(unlocked);
    if (sig !== p.unlockedSig) {
      p.unlockedSig = sig;
      self.unlocked = unlocked;
    }
    this.sendSelf(p, self);
    this.broadcastPatch(p.pid, pub);
    this.profiles.markDirty(p.key);
    this.recomputeHost();
  }

  addTapNiem(pid: Pid, delta: number, silent = false): void {
    const p = this.players.get(pid);
    if (!p || !delta) return;
    const before = p.profile.tapNiem;
    const after = applyTapNiem(before, delta);
    if (after === before) return;
    p.profile.tapNiem = after;
    if (!silent) this.fx({ type: 'tapniem', pid, amount: after - before });
    this.sendSelf(p, { tapNiem: after });
    this.broadcastPatch(pid, { tapNiem: after });
    this.profiles.markDirty(p.key);
  }

  addXu(pid: Pid, delta: number): boolean {
    const p = this.players.get(pid);
    if (!p) return false;
    const d = Math.round(delta);
    if (p.profile.xu + d < 0) return false;
    if (d === 0) return true;
    p.profile.xu += d;
    this.fx({ type: 'xu', pid, amount: d });
    this.sendSelf(p, { xu: p.profile.xu });
    this.profiles.markDirty(p.key);
    return true;
  }

  spendDuc(pid: Pid, amount: number): boolean {
    const p = this.players.get(pid);
    const a = Math.round(amount);
    if (!p || a < 0 || p.profile.duc < a) return false;
    p.profile.duc -= a;
    this.sendSelf(p, { duc: p.profile.duc });
    this.profiles.markDirty(p.key);
    return true;
  }

  /** Đặt cược bằng Công Đức thật (Sòng Công Đức) — xem `ActivityContext.wager`. */
  wager(pid: Pid, amount: number): boolean {
    const p = this.players.get(pid);
    if (!p || !Number.isInteger(amount) || amount <= 0) return false;
    const prof = p.profile;
    if (prof.duc < amount || prof.congDuc < amount) return false;
    const oldRank = rankOf(prof.congDuc);
    prof.congDuc -= amount;
    prof.duc -= amount;
    prof.stats.wagered = (prof.stats.wagered ?? 0) + amount;
    this.afterKarmaChange(p, oldRank);
    const rank = rankOf(prof.congDuc);
    if (rankIndex(rank) < rankIndex(oldRank)) {
      this.toast(pid, `📉 Tụt xuống ${RANK_NAMES[rank]} vì đỏ đen! Về chùa làm công quả gỡ lại nhé.`, 'bad');
      // Tin chat cho cả phòng tối đa 1 lần / CASINO.demoteChatCooldownMs mỗi người (đặt / gỡ cược quanh ngưỡng cấp
      // không spam cả phòng); toast riêng ở trên vẫn gửi mỗi lần.
      const now = Date.now();
      if (now - p.lastDemoteChatAt >= CASINO.demoteChatCooldownMs) {
        p.lastDemoteChatAt = now;
        this.chatSystem(`📉 ${p.name} tụt xuống ${RANK_NAMES[rank]} vì đỏ đen!`);
      }
    }
    return true;
  }

  setVip(pid: Pid): void {
    const p = this.players.get(pid);
    if (!p || p.profile.vip) return;
    p.profile.vip = true;
    const unlocked = unlockedOutfit(p.profile.peakCongDuc, true);
    p.unlockedSig = JSON.stringify(unlocked);
    this.sendSelf(p, { vip: true, unlocked });
    this.broadcastPatch(pid, { vip: true });
    this.profiles.markDirty(p.key);
  }

  addDoSay(pid: Pid, delta: number): void {
    const p = this.players.get(pid);
    if (!p) return;
    p.doSay = Math.min(DO_SAY.max, Math.max(0, p.doSay + delta));
    const v = Math.round(p.doSay);
    this.sendSelf(p, { doSay: v });
    this.broadcastPatch(pid, { doSay: v });
  }

  addBuff(target: Pid | 'room', buff: BuffId, durationMs: number = BUFFS[buff].durationMs): void {
    const entry: BuffState = { id: buff, until: Date.now() + durationMs };
    if (target === 'room') {
      this.roomBuffs = [...this.roomBuffs.filter((b) => b.id !== buff), entry];
      for (const p of this.players.values()) this.sendBuffs(p);
      return;
    }
    const p = this.players.get(target);
    if (!p) return;
    p.buffs = [...p.buffs.filter((b) => b.id !== buff), entry];
    this.sendBuffs(p);
  }

  private sendBuffs(p: ServerPlayer): void {
    const buffs = this.effectiveBuffs(p);
    this.sendSelf(p, { buffs });
    this.broadcastPatch(p.pid, { buffs });
  }

  setHeld(pid: Pid, item: HeldItem | null): void {
    const p = this.players.get(pid);
    if (!p) return;
    p.held = item ? { ...item } : null;
    this.broadcastPatch(pid, { held: p.held });
  }

  setTitle(pid: Pid, title: string | null): void {
    const p = this.players.get(pid);
    if (!p || p.title === title) return;
    p.title = title;
    this.broadcastPatch(pid, { title });
  }

  setOutfit(pid: Pid, partial: Partial<Outfit>): boolean {
    const p = this.players.get(pid);
    if (!p) return false;
    const next: Outfit = { ...p.profile.outfit, ...partial };
    if (!ROBE_IDS.includes(next.robe) || !HAT_IDS.includes(next.hat) || !ACCESSORY_IDS.includes(next.accessory)) return false;
    if (!isOutfitAllowed(next, unlockedOutfit(p.profile.peakCongDuc, p.profile.vip))) return false;
    p.profile.outfit = next;
    this.sendSelf(p, { outfit: next });
    this.broadcastPatch(pid, { outfit: next });
    this.profiles.markDirty(p.key);
    return true;
  }

  isNear(pid: Pid, stationId: string, slack: number = NET.interactSlack): boolean {
    const p = this.players.get(pid);
    const found = findStation(stationId);
    if (!p || !found || found.map !== this.map) return false;
    return isNearStation(found.station, p, slack);
  }

  // ───────────────────────── Hoạt động ─────────────────────────

  viewOf(p: ServerPlayer): ServerPlayerView {
    const now = Date.now();
    return {
      pid: p.pid,
      name: p.name,
      rank: p.rank,
      isHost: this.hostPid === p.pid,
      congDuc: p.profile.congDuc,
      duc: p.profile.duc,
      xu: p.profile.xu,
      vip: p.profile.vip,
      tapNiem: p.profile.tapNiem,
      doSay: Math.round(p.doSay),
      x: p.x,
      z: p.z,
      held: p.held,
      activity: p.activity,
      connected: p.connected,
      kneeling: p.kneeling(now),
      joinedAt: p.joinedAt,
    };
  }

  openActivity(pid: Pid, a: ActivityId, data: unknown): void {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.activity !== a) {
      p.activity = a;
      this.broadcastPatch(pid, { activity: a });
    }
    p.socket?.emit('actOpen', a, data);
  }

  closeActivity(pid: Pid, a: ActivityId, reason: string): void {
    const p = this.players.get(pid);
    if (!p) return;
    if (p.activity === a) {
      p.activity = null;
      this.broadcastPatch(pid, { activity: null });
    }
    p.socket?.emit('actClose', a, reason);
  }

  broadcastActState(a: ActivityId, state: unknown): void {
    this.io.to(this.channel).emit('actState', a, state);
  }

  emitActEvent(a: ActivityId, type: string, data: unknown, to?: Pid | Pid[]): void {
    if (to === undefined) {
      this.io.to(this.channel).emit('actEvent', a, type, data);
      return;
    }
    for (const pid of Array.isArray(to) ? to : [to]) this.players.get(pid)?.socket?.emit('actEvent', a, type, data);
  }

  setRoomTimeout(fn: () => void, ms: number): () => void {
    if (this.disposed) return () => {};
    const handle = setTimeout(() => {
      this.timers.delete(handle);
      fn();
    }, Math.max(0, ms));
    this.timers.add(handle);
    return () => {
      clearTimeout(handle);
      this.timers.delete(handle);
    };
  }

  // ───────────────────────── Gửi tin ─────────────────────────

  toPublic(p: ServerPlayer): PlayerPublic {
    return {
      pid: p.pid,
      name: p.name,
      rank: p.rank,
      congDuc: p.profile.congDuc,
      isHost: this.hostPid === p.pid,
      outfit: p.profile.outfit,
      vip: p.profile.vip,
      title: p.title,
      held: p.held,
      buffs: this.effectiveBuffs(p),
      tapNiem: p.profile.tapNiem,
      doSay: Math.round(p.doSay),
      connected: p.connected,
      kneelUntil: p.kneelUntil,
      activity: p.activity,
      x: round2(p.x),
      z: round2(p.z),
      ry: round2(p.ry),
      anim: p.anim,
      joinedAt: p.joinedAt,
    };
  }

  toSelf(p: ServerPlayer): SelfState {
    const prof = p.profile;
    return {
      pid: p.pid,
      name: prof.name,
      congDuc: prof.congDuc,
      peakCongDuc: prof.peakCongDuc,
      duc: prof.duc,
      tapNiem: prof.tapNiem,
      xu: prof.xu,
      vip: prof.vip,
      outfit: prof.outfit,
      unlocked: unlockedOutfit(prof.peakCongDuc, prof.vip),
      rank: rankOf(prof.congDuc),
      isHost: this.hostPid === p.pid,
      buffs: this.effectiveBuffs(p),
      doSay: Math.round(p.doSay),
    };
  }

  roomPublic(): RoomPublic {
    return {
      code: this.code,
      map: this.map,
      hostPid: this.hostPid,
      pool: Math.floor(this.pool),
      djPid: this.djPid,
      mapChange: this.mapChange,
      playerCount: this.players.size,
    };
  }

  sendSelf(p: ServerPlayer, patch: Partial<SelfState>): void {
    p.socket?.emit('self', patch);
  }

  broadcastPatch(pid: Pid, patch: Partial<PlayerPublic>): void {
    this.io.to(this.channel).emit('playerPatch', pid, patch);
  }

  broadcastRoom(patch: Partial<RoomPublic>): void {
    this.io.to(this.channel).emit('room', patch);
  }

  toast(target: Pid | 'room', text: string, tone: Tone = 'info'): void {
    if (target === 'room') this.io.to(this.channel).emit('toast', { text, tone });
    else this.players.get(target)?.socket?.emit('toast', { text, tone });
  }

  fx(msg: FxMsg, to?: Pid | Pid[]): void {
    if (to === undefined) {
      this.io.to(this.channel).emit('fx', msg);
      return;
    }
    for (const pid of Array.isArray(to) ? to : [to]) this.players.get(pid)?.socket?.emit('fx', msg);
  }

  chatSystem(text: string): void {
    this.io.to(this.channel).emit('chat', { pid: null, name: '', text, t: Date.now() });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.tickTimer);
    clearInterval(this.snapTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.activities.dispose();
  }
}
