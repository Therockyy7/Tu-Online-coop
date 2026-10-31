// Runtime mini-game phía client: tạo ClientActivityContext cho từng module, mount/unmount theo map,
// định tuyến actState/actEvent/actOpen/actClose, phím, cập nhật mỗi khung hình và mục menu Phương Trượng.
import type { ActivityId, AnimId, MapId, PlayerPublic, StationDef } from '@shared/index';
import type { AudioApi } from '../audio/api';
import type { WorldApi } from '../engine/worldApi';
import type { GameStateApi } from '../state/types';
import type { HostMenuItem, UIApi } from '../ui/api';
import type { ActivityClientModule, ClientActivityContext, InputApi } from './types';

export interface RuntimeDeps {
  state: GameStateApi & { setActivityState(a: ActivityId, s: unknown): void };
  ui: UIApi;
  audio: AudioApi;
  world: WorldApi;
  input: InputApi;
  send(a: ActivityId, type: string, data?: unknown): void;
  leaveActivity(): void;
  serverNow(): number;
  me(): PlayerPublic | undefined;
  setLocalAnim(anim: AnimId | null): void;
  lockMovement(key: string, locked: boolean): void;
  faceTo(ry: number, pitch?: number): void;
  setFov(fov: number | null): void;
  snapTo(x: number, z: number, ry?: number): void;
}

export class ActivityRuntime {
  private readonly mods = new Map<ActivityId, ActivityClientModule>();
  private readonly ctxs = new Map<ActivityId, ClientActivityContext>();
  private readonly mounted = new Set<ActivityId>();
  private readonly clientOpen = new Set<ActivityId>();
  private serverOpen: ActivityId | null = null;
  private animOwner: ActivityId | null = null;
  private fovOwner: ActivityId | null = null;
  private readonly unregisterHost: () => void;

  constructor(
    modules: readonly ActivityClientModule[],
    private readonly deps: RuntimeDeps,
  ) {
    for (const m of modules) {
      this.mods.set(m.id, m);
      this.ctxs.set(m.id, this.makeContext(m.id));
    }
    this.unregisterHost = deps.ui.registerHostMenuItems(() => this.hostItems());
  }

  private safe<T>(id: ActivityId, what: string, fn: () => T): T | undefined {
    try {
      return fn();
    } catch (err) {
      console.error(`[activity:${id}] lỗi ở ${what}`, err);
      return undefined;
    }
  }

  private makeContext(id: ActivityId): ClientActivityContext {
    const d = this.deps;
    return {
      id,
      state: d.state,
      ui: d.ui,
      audio: d.audio,
      world: d.world,
      input: d.input,
      send: (type, data) => d.send(id, type, data),
      serverNow: () => d.serverNow(),
      me: () => d.me(),
      setLocalAnim: (anim) => {
        if (anim) this.animOwner = id;
        else if (this.animOwner !== id) return;
        else this.animOwner = null;
        d.setLocalAnim(anim);
      },
      lockMovement: (locked) => d.lockMovement(`act:${id}`, locked),
      faceTo: (ry, pitch) => d.faceTo(ry, pitch),
      setFov: (fov) => {
        if (fov !== null) this.fovOwner = id;
        else if (this.fovOwner !== id) return;
        else this.fovOwner = null;
        d.setFov(fov);
      },
      snapTo: (x, z, ry) => d.snapTo(x, z, ry),
      setOpen: (open) => {
        if (open) this.clientOpen.add(id);
        else this.clientOpen.delete(id);
      },
      publicState: <T>() => d.state.activityState(id) as T | undefined,
    };
  }

  mountForMap(map: MapId): void {
    for (const [id, m] of this.mods) {
      if (!m.maps.includes(map)) continue;
      const ctx = this.ctxs.get(id)!;
      this.mounted.add(id);
      this.safe(id, 'mount', () => m.mount?.(ctx));
      const s = this.deps.state.activityState(id);
      if (s !== undefined) this.safe(id, 'onState', () => m.onState?.(s, ctx));
    }
  }

  unmountAll(): void {
    for (const id of this.mounted) {
      const m = this.mods.get(id)!;
      this.safe(id, 'unmount', () => m.unmount?.(this.ctxs.get(id)!));
      this.releaseFor(id);
    }
    this.mounted.clear();
    this.clientOpen.clear();
    this.serverOpen = null;
  }

  /** Thả khóa di chuyển / hoạt ảnh mà hoạt động để lại. */
  private releaseFor(id: ActivityId): void {
    this.deps.lockMovement(`act:${id}`, false);
    if (this.animOwner === id) {
      this.animOwner = null;
      this.deps.setLocalAnim(null);
    }
    if (this.fovOwner === id) {
      this.fovOwner = null;
      this.deps.setFov(null);
    }
  }

  onState(a: ActivityId, s: unknown): void {
    this.deps.state.setActivityState(a, s);
    if (!this.mounted.has(a)) return;
    this.safe(a, 'onState', () => this.mods.get(a)!.onState?.(s, this.ctxs.get(a)!));
  }

  onEvent(a: ActivityId, type: string, data: unknown): void {
    if (!this.mounted.has(a)) return;
    this.safe(a, 'onEvent', () => this.mods.get(a)!.onEvent?.(type, data, this.ctxs.get(a)!));
  }

  onOpen(a: ActivityId, data: unknown): void {
    const m = this.mods.get(a);
    if (!m) return;
    this.serverOpen = a;
    this.safe(a, 'onOpen', () => m.onOpen?.(data, this.ctxs.get(a)!));
  }

  onClose(a: ActivityId, reason: string): void {
    const m = this.mods.get(a);
    if (this.serverOpen === a) this.serverOpen = null;
    if (m) this.safe(a, 'onClose', () => m.onClose?.(reason, this.ctxs.get(a)!));
    if (!this.clientOpen.has(a)) this.releaseFor(a);
  }

  get anyOpen(): boolean {
    return this.serverOpen !== null || this.clientOpen.size > 0;
  }

  isOpen(a: ActivityId): boolean {
    return this.serverOpen === a || this.clientOpen.has(a);
  }

  /** Phím cho hoạt động đang mở. Trả true nếu đã xử lý. Esc không bị chặn thì rời hoạt động. */
  handleKey(e: KeyboardEvent, down: boolean): boolean {
    // Hoạt động server đang mở (tụng kinh, thỉnh chuông, chẻ củi…) nhận phím TRƯỚC hoạt động chỉ mở ở client
    // (vd đang cầm chổi): không thì Space bị chổi chiếm, gõ mõ/kéo chuông không ăn.
    const open: ActivityId[] = [];
    if (this.serverOpen) open.push(this.serverOpen);
    for (const id of this.clientOpen) if (id !== this.serverOpen) open.push(id);
    if (open.length === 0) return false;
    for (const id of open) {
      const m = this.mods.get(id);
      const handled = m?.onKey ? this.safe(id, 'onKey', () => m.onKey!(e, down, this.ctxs.get(id)!)) : false;
      if (handled) return true;
    }
    if (down && e.code === 'Escape') {
      if (this.serverOpen) this.deps.leaveActivity();
      for (const id of this.clientOpen) {
        this.clientOpen.delete(id);
        const m = this.mods.get(id);
        this.safe(id, 'onClose', () => m?.onClose?.('esc', this.ctxs.get(id)!));
        this.releaseFor(id);
      }
      return true;
    }
    return false;
  }

  update(dt: number): void {
    for (const id of this.mounted) {
      const m = this.mods.get(id)!;
      if (m.update) this.safe(id, 'update', () => m.update!(dt, this.ctxs.get(id)!));
    }
  }

  /** Nhãn gợi ý cho trạm: undefined = nhãn mặc định, null = ẩn. */
  prompt(station: StationDef): string | null | undefined {
    if (!this.mounted.has(station.activity)) return null;
    const m = this.mods.get(station.activity)!;
    if (!m.prompt) return undefined;
    return this.safe(station.activity, 'prompt', () => m.prompt!(station, this.ctxs.get(station.activity)!));
  }

  /** Bấm E ở trạm: true nếu module xử lý ở client (không gửi lên server). */
  interact(station: StationDef): boolean {
    const m = this.mods.get(station.activity);
    if (!m?.interact || !this.mounted.has(station.activity)) return false;
    return this.safe(station.activity, 'interact', () => m.interact!(station, this.ctxs.get(station.activity)!)) === true;
  }

  private hostItems(): HostMenuItem[] {
    const out: HostMenuItem[] = [];
    for (const id of this.mounted) {
      const m = this.mods.get(id)!;
      if (!m.hostMenuItems) continue;
      const items = this.safe(id, 'hostMenuItems', () => m.hostMenuItems!(this.ctxs.get(id)!));
      if (items) out.push(...items);
    }
    return out;
  }

  dispose(): void {
    this.unmountAll();
    this.unregisterHost();
  }
}
