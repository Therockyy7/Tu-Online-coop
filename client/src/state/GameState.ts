// Trạng thái game phía client: bản tin server → cập nhật + phát sự kiện cho UI và mini-game.
import type {
  ActivityId,
  ChatMsg,
  JoinResult,
  Pid,
  PlayerPublic,
  RoomPublic,
  SelfState,
  SnapMsg,
} from '@shared/index';
import type { ConnectionStatus, GameEvent, GameEventOf, GameEventType, GameStateApi } from './types';

type JoinOk = Extract<JoinResult, { ok: true }>;
const CHAT_LOG_MAX = 50;

export class GameState implements GameStateApi {
  key = '';
  me!: SelfState;
  room!: RoomPublic;
  connection: ConnectionStatus = 'connected';
  private readonly _players = new Map<Pid, PlayerPublic>();
  private readonly chat: ChatMsg[] = [];
  private readonly acts = new Map<ActivityId, unknown>();
  private readonly listeners = new Map<GameEventType, Set<(e: GameEvent) => void>>();

  constructor(private readonly clockNow: () => number) {}

  /** Nạp toàn bộ từ kết quả vào phòng (lần đầu hoặc vào lại sau khi rớt mạng). */
  reset(r: JoinOk): void {
    this.key = r.key;
    this.me = { ...r.you };
    this.room = { ...r.room };
    this._players.clear();
    for (const p of r.players) this._players.set(p.pid, { ...p });
    this.acts.clear();
    for (const [a, s] of Object.entries(r.activities)) this.acts.set(a as ActivityId, s);
    // Vào lại sau khi rớt mạng: báo cho HUD/UI vẽ lại toàn bộ (lần nạp đầu chưa có ai nghe nên vô hại).
    this.emit({ type: 'self', patch: { ...this.me } });
    this.emit({ type: 'room', patch: { ...this.room } });
  }

  on<T extends GameEventType>(type: T, fn: (e: GameEventOf<T>) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const f = fn as (e: GameEvent) => void;
    set.add(f);
    return () => set!.delete(f);
  }

  private emit(e: GameEvent): void {
    const set = this.listeners.get(e.type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(e);
      } catch (err) {
        console.error('[state] lỗi trong listener', e.type, err);
      }
    }
  }

  players(): ReadonlyMap<Pid, PlayerPublic> {
    return this._players;
  }

  player(pid: Pid): PlayerPublic | undefined {
    return this._players.get(pid);
  }

  myPlayer(): PlayerPublic | undefined {
    return this._players.get(this.me.pid);
  }

  chatLog(): readonly ChatMsg[] {
    return this.chat;
  }

  activityState(a: ActivityId): unknown {
    return this.acts.get(a);
  }

  serverNow(): number {
    return this.clockNow();
  }

  // ── Áp dụng bản tin server ──

  applySelf(patch: Partial<SelfState>): void {
    Object.assign(this.me, patch);
    this.emit({ type: 'self', patch });
  }

  applyRoom(patch: Partial<RoomPublic>): void {
    const prevMap = this.room.map;
    Object.assign(this.room, patch);
    this.emit({ type: 'room', patch });
    if (patch.map && patch.map !== prevMap) this.emit({ type: 'mapChanged', map: patch.map });
  }

  addPlayer(p: PlayerPublic): void {
    this._players.set(p.pid, { ...p });
    this.emit({ type: 'playerJoined', player: p });
  }

  removePlayer(pid: Pid): void {
    const p = this._players.get(pid);
    this._players.delete(pid);
    this.emit({ type: 'playerLeft', pid, name: p?.name ?? '' });
  }

  patchPlayer(pid: Pid, patch: Partial<PlayerPublic>): void {
    const p = this._players.get(pid);
    if (!p) return;
    Object.assign(p, patch);
    this.emit({ type: 'playerPatch', pid, patch });
  }

  /** Vị trí từ snapshot (không phát sự kiện — quá dày). */
  applySnap(m: SnapMsg): void {
    for (const [pid, x, z, ry, anim] of m.p) {
      if (pid === this.me.pid) continue;
      const p = this._players.get(pid);
      if (!p) continue;
      p.x = x;
      p.z = z;
      p.ry = ry;
      p.anim = anim;
    }
  }

  /** Vị trí của chính mình (do LocalController giữ). */
  setMyPose(x: number, z: number, ry: number, anim: PlayerPublic['anim']): void {
    const p = this._players.get(this.me.pid);
    if (!p) return;
    p.x = x;
    p.z = z;
    p.ry = ry;
    p.anim = anim;
  }

  addChat(msg: ChatMsg): void {
    this.chat.push(msg);
    if (this.chat.length > CHAT_LOG_MAX) this.chat.splice(0, this.chat.length - CHAT_LOG_MAX);
    this.emit({ type: 'chat', msg });
  }

  setActivityState(a: ActivityId, s: unknown): void {
    this.acts.set(a, s);
  }

  setConnection(status: ConnectionStatus): void {
    if (this.connection === status) return;
    this.connection = status;
    this.emit({ type: 'connection', status });
  }

  kicked(reason: string): void {
    this.emit({ type: 'kicked', reason });
  }
}
