// Điều phối một phiên chơi: dựng thế giới theo map của phòng, nối sự kiện mạng ↔ trạng thái ↔ cảnh 3D ↔ UI,
// bàn phím/chuột, vòng lặp khung hình, đổi map Hạ Sơn / Hồi Sơn, kết nối lại khi rớt mạng.
import * as THREE from 'three';
import {
  BLESS,
  EMOTE_IDS,
  NET,
  clamp,
  getMap,
  hashString,
  type ActivityId,
  type ChatMsg,
  type EmoteId,
  type FxMsg,
  type JoinResult,
  type MapDef,
  type MapId,
  type Pid,
  type PlayerPublic,
  type RoomPublic,
  type SelfState,
  type ServerToClientEvents,
  type SnapMsg,
  type ToastMsg,
} from '@shared/index';
import { CLIENT_ACTIVITIES } from '../activities/registry';
import { ActivityRuntime } from '../activities/runtime';
import type { FirstPersonHandle, WorldHandles } from '../art/api';
import { createFirstPersonView, playerLook, prostrateDip } from '../art/avatar';
import { buildBar } from '../art/bar';
import { kit } from '../art/kit';
import { buildTemple } from '../art/temple';
import type { AudioApi } from '../audio/api';
import type { GameActions } from '../net/types';
import { ServerClock, type Net } from '../net/Net';
import { settings } from '../settings';
import { GameState } from '../state/GameState';
import type { UIApi } from '../ui/api';
import { CameraRig } from './CameraRig';
import { Fx } from './Fx';
import { Input } from './Input';
import { Interaction } from './Interaction';
import { LocalController } from './LocalController';
import { Players } from './Players';
import { Renderer3D } from './Renderer';
import type { WorldApi } from './worldApi';

type JoinOk = Extract<JoinResult, { ok: true }>;

export interface GameDeps {
  ui: UIApi;
  audio: AudioApi;
  net: Net;
  stage: HTMLElement;
  join: JoinOk;
  /** Gọi khi rời game (null = tự rời; chuỗi = lý do bị đá/mất kết nối). */
  onExit(reason: string | null): void;
}

const EYE: Partial<Record<string, number>> = { sit: 0.85, kneel: 0.75, prostrate: 0.75, bow: 1.1, cry: 1.25 };
/** Ngưỡng bloom theo độ sáng HDR (trước tone mapping): trời sáng không bị loang, chỉ lửa/đèn rực mới tỏa. */
const BLOOM_TEMPLE = { strength: 0.32, radius: 0.5, threshold: 1.6 };
const BLOOM_BAR = { strength: 0.62, radius: 0.5, threshold: 0.62 };
/** Chùa: nắng ấm, màu tươi nhẹ; Bar: tối góc hơn, màu neon rực hơn. */
const GRADE_TEMPLE = { vignette: 0.26, saturation: 1.16, tint: [1.03, 1.0, 0.95] as [number, number, number] };
const GRADE_BAR = { vignette: 0.42, saturation: 1.14, tint: [1.0, 0.97, 1.04] as [number, number, number] };
/** Màu bụi bước chân theo map. */
const DUST = { temple: '#e2d4b6', bar: '#c9a2ff' } as const;

export class Game {
  readonly state: GameState;
  private readonly clock: ServerClock;
  private readonly r: Renderer3D;
  private readonly rig: CameraRig;
  private readonly input: Input;
  private readonly controller: LocalController;
  private readonly players: Players;
  private readonly fx: Fx;
  private readonly interaction: Interaction;
  private readonly runtime: ActivityRuntime;
  private readonly viewmodel: FirstPersonHandle;
  private readonly actions: GameActions;
  private readonly world: WorldApi;
  private map!: MapDef;
  private handles!: WorldHandles;
  private sun: THREE.DirectionalLight | null = null;
  /** 0 = ngoài trời, 1 = đang đứng trong nhà có mái (mắt "thích nghi" dần). */
  private interiorK = 0;
  private baseExposure = 1;
  private readonly sunOffset = new THREE.Vector3(18, 34, 14);
  private readonly listeners: (() => void)[] = [];
  private readonly socketHandlers: Partial<{ [K in keyof ServerToClientEvents]: ServerToClientEvents[K] }>;
  private lastFrame = performance.now();
  private running = true;
  private stopped = false;
  private countdownText: string | null = null;
  private burpAt = 0;
  private wasModal = false;
  /** Hoạt ảnh local khung trước + lúc bắt đầu (để camera cúi theo nhịp lạy). */
  private lastAnim = '';
  private animSince = 0;
  private hadDisconnect = false;
  private vmHeldKey = '';
  /** Bụi sáng quanh camera đang theo kiểu nào (đổi sang vàng khi cả chùa có Hào quang). */
  private motesTheme: 'temple' | 'bar' | 'halo' | null = null;
  private motesCheckAt = 0;
  /** Camera tự do để soi cảnh khi phát triển (window.__tu.cam). */
  private debugCam: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;

  constructor(private readonly deps: GameDeps) {
    const { net, ui, audio, join } = deps;
    this.clock = new ServerClock(net.socket);
    this.clock.seed(join.serverTime);
    this.state = new GameState(() => this.clock.now());
    this.state.reset(join);
    audio.setClock(() => this.clock.now());

    this.r = new Renderer3D(deps.stage);
    this.r.setQuality(settings.get().quality);
    this.rig = new CameraRig(this.r.camera);
    this.controller = new LocalController((pose) => net.socket.emit('pose', pose));
    this.players = new Players(this.r.scene, this.r.camera);
    this.players.setLocal(join.you.pid);
    this.fx = new Fx(this.r.scene, this.r.camera);
    this.players.onStep = (x, z) => {
      // Bụi bước chân: chỉ khi còn trong tầm nhìn gần.
      const cam = this.r.camera.position;
      if (Math.hypot(x - cam.x, z - cam.z) < 22) this.fx.dust(x, z, this.map?.id === 'bar' ? DUST.bar : DUST.temple, 3);
    };

    this.input = new Input(this.r.canvas, {
      key: (e, down) => this.onKey(e, down),
      look: (dx, dy) => {
        const s = settings.get();
        this.rig.look(dx, dy, s.sensitivity, s.invertY);
      },
      wheel: (dy) => {
        if (this.rig.mode === 'tp') this.rig.zoom(dy);
      },
      lockChange: () => {},
      mouse: () => {},
    });

    const self = this;
    this.world = {
      get scene() {
        return self.r.scene;
      },
      get camera() {
        return self.r.camera;
      },
      get map() {
        return self.map;
      },
      get handles() {
        return self.handles;
      },
      get controls() {
        return self.handles.controls;
      },
      stationGroup: (id) => self.handles.stations.get(id),
      anchor: (name) => self.handles.anchors.get(name),
      addInteractable: (i) => self.interaction.add(i),
      floatText: (x, z, text, color, y) => self.fx.floatText(x, z, text, color, y),
      burst: (x, z, kind, count) => self.fx.burst(x, z, kind, count),
      ring: (x, z, color, radius) => self.fx.ring(x, z, color, radius),
      shake: (s) => self.rig.shake(s),
      playerPosition: (pid) =>
        pid === self.state.me.pid ? { x: self.controller.x, z: self.controller.z } : self.players.position(pid),
      avatar: (pid) => self.players.avatar(pid),
      createNpc: (look, name) => self.players.createNpc(look, name),
    };

    this.actions = {
      chat: (text) => net.socket.emit('chat', text),
      emote: (id) => this.doEmote(id),
      host: (msg) => net.socket.emit('host', msg),
      bless: (target) => net.socket.emit('bless', target),
      drop: () => net.socket.emit('drop'),
      leaveActivity: () => net.socket.emit('leaveActivity'),
      act: (a, type, data) => net.socket.emit('act', { a, type, data }),
      interact: (id) => net.socket.emit('interact', id),
      leaveRoom: () => this.stop(null),
    };

    this.runtime = new ActivityRuntime(CLIENT_ACTIVITIES, {
      state: this.state,
      ui,
      audio,
      world: this.world,
      input: { isDown: (code) => this.input.isDown(code) },
      send: (a, type, data) => this.actions.act(a, type, data),
      leaveActivity: () => this.actions.leaveActivity(),
      serverNow: () => this.clock.now(),
      me: () => this.state.myPlayer(),
      setLocalAnim: (anim) => {
        this.controller.overrideAnim = anim;
      },
      lockMovement: (key, locked) => this.controller.setLocked(key, locked),
      faceTo: (ry, pitch) => this.rig.turnTo(ry, pitch),
      setFov: (fov) => {
        this.rig.fovOverride = fov;
      },
      snapTo: (x, z, ry) => {
        this.controller.glideTo(x, z);
        if (ry !== undefined) this.rig.turnTo(ry);
      },
    });
    this.interaction = new Interaction(ui, this.runtime, (id) => this.actions.interact(id));

    this.viewmodel = createFirstPersonView(this.myLook());
    this.r.vmCamera.add(this.viewmodel.root);

    // Nhân vật + thế giới.
    for (const p of this.state.players().values()) this.players.add(p);
    const me = this.state.myPlayer();
    if (me) {
      this.controller.teleport(me.x, me.z);
      this.rig.yaw = me.ry;
    }
    this.buildWorld(this.state.room.map);
    this.syncViewmodelHeld();
    this.applySelfVisuals();

    // Sự kiện mạng.
    this.socketHandlers = this.makeSocketHandlers();
    for (const [name, fn] of Object.entries(this.socketHandlers)) net.socket.on(name as never, fn as never);
    for (const [name, args] of net.takeQueued()) {
      const fn = (this.socketHandlers as Record<string, (...a: unknown[]) => void>)[name];
      fn?.(...args);
    }
    const onDisconnect = () => this.onDisconnect();
    const onConnect = () => void this.onReconnect();
    net.socket.on('disconnect', onDisconnect);
    net.socket.on('connect', onConnect);
    this.listeners.push(() => {
      net.socket.off('disconnect', onDisconnect);
      net.socket.off('connect', onConnect);
    });

    // Bấm vào màn hình để khóa chuột; đóng bảng bằng chuột thì khóa lại luôn.
    const onCanvasClick = () => {
      if (!ui.isModalOpen() && !ui.isTyping()) this.input.requestLock();
    };
    this.r.canvas.addEventListener('click', onCanvasClick);
    const onDown = () => {
      this.wasModal = ui.isModalOpen();
    };
    const onClick = () => {
      if (!this.wasModal) return;
      setTimeout(() => {
        if (!ui.isModalOpen() && !ui.isTyping() && !this.stopped) this.input.requestLock();
      }, 0);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick);
    this.listeners.push(() => {
      this.r.canvas.removeEventListener('click', onCanvasClick);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick);
    });
    this.listeners.push(
      settings.on((s) => {
        this.r.setQuality(s.quality);
        this.configureSun();
      }),
    );

    ui.mountGame({ state: this.state, actions: this.actions, audio });
    this.listeners.push(this.state.on('self', (e) => this.onSelf(e.patch)));

    this.clock.start();
    void this.clock.sync(5);
    this.r.renderer.setAnimationLoop(() => this.frame());
    if (import.meta.env.DEV) {
      (window as unknown as { __tu: unknown }).__tu = {
        game: this,
        cam: (x: number, y: number, z: number, yaw = 0, pitch = 0) => {
          this.debugCam = { x, y, z, yaw, pitch };
        },
        free: () => {
          this.debugCam = null;
        },
      };
    }
  }

  // ───────────────────────── Thế giới ─────────────────────────

  private buildWorld(mapId: MapId): void {
    if (this.handles) {
      this.r.scene.remove(this.handles.root);
      for (const l of this.handles.environment.lights) {
        this.r.scene.remove(l);
        if (l instanceof THREE.DirectionalLight || l instanceof THREE.SpotLight) this.r.scene.remove(l.target);
      }
      this.handles.dispose();
    }
    this.map = getMap(mapId);
    this.handles = (mapId === 'temple' ? buildTemple : buildBar)(this.map, kit);
    const env = this.handles.environment;
    this.r.scene.add(this.handles.root);
    this.sun = null;
    for (const l of env.lights) {
      this.r.scene.add(l);
      if (l instanceof THREE.DirectionalLight || l instanceof THREE.SpotLight) this.r.scene.add(l.target);
      if (l instanceof THREE.DirectionalLight && l.castShadow && !this.sun) this.sun = l;
    }
    if (this.sun) this.sunOffset.copy(this.sun.position).sub(this.sun.target.position);
    this.configureSun();
    this.r.scene.background = env.background;
    this.r.scene.fog = env.fog;
    this.r.setEnvironment(env.envScene ?? null, env.envIntensity ?? 1);
    for (const l of env.lights) if (l.userData.ambient) l.userData.baseIntensity = l.intensity;
    this.interiorK = 0;
    this.r.setBloom(mapId === 'bar' ? BLOOM_BAR : BLOOM_TEMPLE);
    this.r.setGrade(mapId === 'bar' ? GRADE_BAR : GRADE_TEMPLE);
    this.baseExposure = env.exposure ?? (mapId === 'bar' ? 1.15 : 1.0);
    this.r.renderer.toneMappingExposure = this.baseExposure;
    this.motesTheme = null;
    this.motesCheckAt = 0;
    if (mapId === 'temple') this.deps.audio.setMusic('temple_ambience');
    else this.deps.audio.setMusic(null);
    this.interaction.clearDynamic();
    this.runtime.mountForMap(mapId);
  }

  private configureSun(): void {
    const sun = this.sun;
    if (!sun) return;
    const high = settings.get().quality === 'high';
    sun.castShadow = true;
    const size = high ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    const cam = sun.shadow.camera;
    const ext = high ? 30 : 26;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 140;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    // Mép bóng mềm (PCF lấy mẫu đĩa Vogel theo bán kính).
    sun.shadow.radius = high ? 2.5 : 1;
  }

  /**
   * Vào nhà có mái: ánh sáng môi trường (IBL — không biết bị mái che) và đèn trời dịu đi, phơi sáng tăng nhẹ như mắt
   * thích nghi: trong điện ấm và sâu hơn, nhìn ra cửa thấy trời sáng chói.
   */
  private updateInterior(dt: number): void {
    const map = this.map;
    const handles = this.handles;
    if (!map || !handles) return;
    const p = this.r.camera.position;
    const inside = p.y < 4 && map.roofs.some((r) => Math.abs(p.x - r.box.x) < r.box.w / 2 - 0.4 && Math.abs(p.z - r.box.z) < r.box.d / 2 - 0.4);
    this.interiorK += ((inside ? 1 : 0) - this.interiorK) * Math.min(1, dt * 2.2);
    const env = handles.environment;
    this.r.scene.environmentIntensity = (env.envIntensity ?? 1) * (1 - this.interiorK * 0.6);
    for (const l of env.lights) {
      if (l.userData.ambient) l.intensity = (l.userData.baseIntensity as number) * (1 - this.interiorK * 0.55);
    }
    this.r.renderer.toneMappingExposure = this.baseExposure * (1 + this.interiorK * 0.3);
  }

  /** Bóng nắng đi theo người chơi (khung bóng nhỏ hơn → bóng nét hơn), làm tròn theo texel để khỏi rung. */
  private followSun(): void {
    const sun = this.sun;
    if (!sun) return;
    const texel = (sun.shadow.camera.right * 2) / sun.shadow.mapSize.x;
    const step = Math.max(0.25, texel * 4);
    const x = Math.round(this.controller.x / step) * step;
    const z = Math.round(this.controller.z / step) * step;
    sun.target.position.set(x, 0, z);
    sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z);
    sun.target.updateMatrixWorld();
  }

  private changeMap(map: MapId): void {
    this.runtime.unmountAll();
    this.controller.clearLocks();
    this.controller.overrideAnim = null;
    this.fx.clear();
    this.buildWorld(map);
    this.deps.ui.screenFx.flash('#ffffff');
    this.deps.audio.play('teleport');
  }

  // ───────────────────────── Sự kiện mạng ─────────────────────────

  private makeSocketHandlers(): Partial<{ [K in keyof ServerToClientEvents]: ServerToClientEvents[K] }> {
    return {
      snap: (m: SnapMsg) => {
        this.state.applySnap(m);
        this.players.onSnap(m);
      },
      playerJoined: (p: PlayerPublic) => {
        this.state.addPlayer(p);
        this.players.add(p);
        if (p.pid !== this.state.me.pid) this.deps.audio.play('pop', { volume: 0.5 });
      },
      playerLeft: (pid: Pid) => {
        this.state.removePlayer(pid);
        this.players.remove(pid);
      },
      playerPatch: (pid: Pid, patch: Partial<PlayerPublic>) => this.onPlayerPatch(pid, patch),
      self: (patch: Partial<SelfState>) => this.state.applySelf(patch),
      room: (patch: Partial<RoomPublic>) => {
        const prev = this.state.room.map;
        this.state.applyRoom(patch);
        if (patch.map && patch.map !== prev) this.changeMap(patch.map);
      },
      chat: (m: ChatMsg) => {
        this.state.addChat(m);
        if (m.pid) {
          this.players.showChat(m.pid, m.text);
          if (m.pid !== this.state.me.pid) this.deps.audio.play('click', { volume: 0.35, rate: 1.4 });
        }
      },
      emote: (pid: Pid, id: EmoteId) => {
        this.players.showEmote(pid, id);
        this.emoteFx(pid, id);
      },
      actState: (a: ActivityId, s: unknown) => this.runtime.onState(a, s),
      actEvent: (a: ActivityId, type: string, data: unknown) => this.runtime.onEvent(a, type, data),
      actOpen: (a: ActivityId, data: unknown) => this.runtime.onOpen(a, data),
      actClose: (a: ActivityId, reason: string) => this.runtime.onClose(a, reason),
      fx: (m: FxMsg) => this.onFx(m),
      toast: (m: ToastMsg) => this.deps.ui.toast(m.text, m.tone),
      kicked: (reason: string) => {
        this.state.kicked(reason);
        this.stop(reason);
      },
    };
  }

  private onPlayerPatch(pid: Pid, patch: Partial<PlayerPublic>): void {
    this.state.patchPlayer(pid, patch);
    const full = this.state.player(pid);
    this.players.patch(pid, patch, full);
    if (pid !== this.state.me.pid) return;
    if (patch.x !== undefined && patch.z !== undefined) {
      this.controller.teleport(patch.x, patch.z);
      if (patch.ry !== undefined) this.rig.yaw = patch.ry;
    }
    if ('held' in patch) this.syncViewmodelHeld();
    if ('outfit' in patch || 'isHost' in patch || 'vip' in patch) this.viewmodel.setLook(this.myLook());
  }

  private onSelf(patch: Partial<SelfState>): void {
    if ('doSay' in patch || 'buffs' in patch) this.applySelfVisuals();
  }

  private applySelfVisuals(): void {
    const me = this.state.me;
    this.rig.drunk = me.doSay;
    this.deps.ui.screenFx.setDrunk(me.doSay);
    const now = this.clock.now();
    const halo = me.buffs.some((b) => b.id === 'hao_quang' && b.until > now);
    this.deps.ui.screenFx.setAura(halo ? '#ffd166' : null);
  }

  /**
   * Chỗ phát hiệu ứng quanh một người: trên đầu người đó (y = `height`). Riêng mình ở góc nhìn thứ nhất thì đặt
   * trước mặt, thấp hơn tầm mắt — đặt đúng chỗ đứng thì hạt/chữ nằm ngay trên camera, không nhìn thấy.
   */
  private fxAnchor(pid: Pid, height: number): { x: number; z: number; y: number; self: boolean } | null {
    if (pid === this.state.me.pid) {
      if (this.players.firstPerson) {
        // Hạ đều mọi độ cao xuống dưới tầm mắt (giữ thứ tự Công Đức › Xu › Tạp Niệm để chữ không chồng nhau).
        const f = this.rig.forward();
        return { x: this.controller.x + f.x * 1.6, z: this.controller.z + f.z * 1.6, y: clamp(height - 0.95, 0.06, 1.3), self: true };
      }
      return { x: this.controller.x, z: this.controller.z, y: height, self: true };
    }
    const p = this.players.position(pid);
    return p ? { ...p, y: height, self: false } : null;
  }

  /** Hiệu ứng 3D theo emote — cả phòng đều thấy. */
  private emoteFx(pid: Pid, id: EmoteId): void {
    const a = this.fxAnchor(pid, 1.75);
    if (!a) return;
    const { x, z, y } = a;
    const feet = this.fxAnchor(pid, 0.06)!;
    switch (id) {
      case 'wave':
        this.fx.burst(x, z, 'hearts', 5, y, 0.25);
        this.fx.burst(x, z, 'sparkle', 8, y, 0.3);
        return;
      case 'pray':
        this.fx.burst(x, z, 'sparkle', 26, y - 0.2, 0.45);
        this.fx.ring(feet.x, feet.z, '#ffd166', 2.4, 1.1);
        return;
      case 'laugh':
        this.fx.burst(x, z, 'confetti', 16, y, 0.3);
        this.fx.floatText(x, z, 'Ha ha ha!', '#ffe14f', y + 0.3);
        return;
      case 'dance':
        this.fx.burst(x, z, 'notes', 9, y - 0.3, 0.4);
        return;
      case 'clap':
        this.fx.burst(x, z, 'stars', 12, y - 0.3, 0.25);
        return;
      case 'cry':
        this.fx.burst(x, z, 'tears', 24, y - 0.1, 0.15);
        return;
      case 'sit':
        this.fx.burst(x, z, 'petals', 12, y + 0.3, 0.6);
        this.fx.ring(feet.x, feet.z, '#ffb3c8', 1.8, 1.4);
        return;
      case 'angry':
        this.fx.burst(x, z, 'steam', 12, y + 0.1, 0.15);
        return;
    }
  }

  private onFx(m: FxMsg): void {
    const ui = this.deps.ui;
    const audio = this.deps.audio;
    const me = this.state.me.pid;
    const posOf = (pid: Pid) => (pid === me ? { x: this.controller.x, z: this.controller.z } : this.players.position(pid));
    switch (m.type) {
      case 'karma': {
        const a = this.fxAnchor(m.pid, 2.2);
        if (a) {
          const text = `${m.amount > 0 ? '+' : ''}${m.amount} Công Đức${m.label ? ` · ${m.label}` : ''}`;
          this.fx.floatText(a.x, a.z, text, m.amount > 0 ? '#ffd166' : '#ff8a80', a.y);
          // Lấp lánh theo độ lớn phần thưởng; thưởng to thì thêm vòng sáng dưới chân.
          if (m.amount > 0) this.fx.burst(a.x, a.z, 'sparkle', clamp(4 + m.amount, 6, 30), a.y - 0.5, 0.3);
          if (m.amount >= 20 && !a.self) this.fx.ring(a.x, a.z, '#ffd166', 2.2, 0.9);
        }
        if (m.pid === me) audio.play(m.amount > 0 ? 'karma' : 'fail', { volume: 0.55 });
        return;
      }
      case 'xu': {
        const a = this.fxAnchor(m.pid, 1.95);
        if (a) {
          this.fx.floatText(a.x, a.z, `${m.amount > 0 ? '+' : ''}${m.amount} Xu`, m.amount > 0 ? '#7fe3ff' : '#ff9e80', a.y);
          if (m.amount > 0) this.fx.burst(a.x, a.z, 'coins', clamp(3 + Math.round(m.amount / 5), 4, 18), a.y - 0.6, 0.2);
        }
        if (m.pid === me) audio.play('coin', { volume: 0.6 });
        return;
      }
      case 'tapniem': {
        const a = this.fxAnchor(m.pid, 1.75);
        if (a) {
          this.fx.floatText(a.x, a.z, `${m.amount > 0 ? '+' : ''}${m.amount} Tạp Niệm`, m.amount > 0 ? '#c9a2ff' : '#9df0c4', a.y);
        }
        return;
      }
      case 'banner':
        ui.banner(m.title, m.sub, m.tone, m.big);
        return;
      case 'sound':
        this.playSpatial(m.id, m.x, m.z, m.volume, m.at);
        return;
      case 'rankup': {
        this.players.playRankUp(m.pid);
        const p = posOf(m.pid);
        if (p) {
          // Biến hình thăng cấp: cột sáng vút lên, vòng sóng, lấp lánh + pháo giấy.
          // Chính mình ở góc nhìn thứ nhất thì camera nằm trong cột → trắng xóa: chỉ chớp vàng màn hình.
          const selfFirstPerson = m.pid === this.state.me.pid && this.rig.mode === 'fp';
          if (selfFirstPerson) this.deps.ui.screenFx.flash('#ffd166');
          else this.fx.pillar(p.x, p.z, '#ffd166', 2.6);
          this.fx.ring(p.x, p.z, '#ffe9a8', 5, 1.2);
          this.fx.burst(p.x, p.z, 'sparkle', 60, 1, 0.8);
          this.fx.burst(p.x, p.z, 'confetti', 70, 1.4, 0.7);
          this.playSpatial('rankup', p.x, p.z, 1);
        }
        return;
      }
      case 'bless': {
        const to = this.fxAnchor(m.to, 1.8);
        if (to) {
          this.fx.burst(to.x, to.z, 'hearts', 8, to.y, 0.35);
          this.fx.burst(to.x, to.z, 'sparkle', 22, to.y - 0.3, 0.4);
          const feet = posOf(m.to);
          if (feet) this.fx.ring(feet.x, feet.z, '#fff3b0', 2, 1);
        }
        const from = this.fxAnchor(m.from, 1.6);
        if (from) this.fx.burst(from.x, from.z, 'sparkle', 10, from.y, 0.25);
        return;
      }
      case 'confetti': {
        const x = m.x ?? this.controller.x;
        const z = m.z ?? this.controller.z;
        this.fx.burst(x, z, 'confetti', 110, 1.6, 0.9);
        audio.play('pop', { volume: 0.7 });
        return;
      }
      case 'petals':
        this.fx.startRain('petals', 7, () => ({ x: this.controller.x, z: this.controller.z }), 60);
        return;
      case 'shake':
        this.rig.shake(m.strength);
        return;
      case 'flash':
        ui.screenFx.flash(m.color);
        return;
      case 'glow':
        if (m.target === 'chanh_dien') this.handles.controls.setChanhDienGlow?.(m.on);
        return;
    }
  }

  /** Âm thanh theo vị trí: nhỏ dần theo khoảng cách, lệch trái/phải theo hướng nhìn. */
  private playSpatial(id: Parameters<AudioApi['play']>[0], x?: number, z?: number, volume = 1, at?: number): void {
    let vol = volume;
    let pan = 0;
    if (x !== undefined && z !== undefined) {
      const dx = x - this.controller.x;
      const dz = z - this.controller.z;
      const d = Math.hypot(dx, dz);
      vol *= Math.pow(clamp(1 - d / 34, 0, 1), 1.4);
      if (vol < 0.02) return;
      if (d > 0.5) {
        const yaw = this.rig.yaw;
        pan = clamp((dx * -Math.cos(yaw) + dz * Math.sin(yaw)) / d, -1, 1) * 0.8;
      }
    }
    if (at !== undefined) this.deps.audio.playAt(id, at, { volume: vol, pan });
    else this.deps.audio.play(id, { volume: vol, pan });
  }

  private onDisconnect(): void {
    if (this.stopped) return;
    this.hadDisconnect = true;
    this.state.setConnection('reconnecting');
    this.deps.ui.toast('Mất kết nối, đang thử kết nối lại…', 'warn');
  }

  private async onReconnect(): Promise<void> {
    if (this.stopped || !this.hadDisconnect) return;
    this.hadDisconnect = false;
    const res = await this.deps.net.join({
      key: this.state.key,
      name: this.state.me.name,
      room: this.state.room.code,
      create: false,
    });
    this.deps.net.takeQueued();
    if (!res.ok) {
      // Rớt mạng lần nữa ngay lúc đang vào lại → chờ lần kết nối kế tiếp thử tiếp, không đá về sảnh.
      if (!this.deps.net.connected) {
        this.hadDisconnect = true;
        return;
      }
      this.stop(res.error);
      return;
    }
    const prevMap = this.state.room.map;
    this.state.reset(res);
    // Hết thời gian ân hạn thì server cấp pid mới → cập nhật nhân vật "của mình" trước khi dựng lại.
    this.players.setLocal(this.state.me.pid);
    this.players.clear();
    for (const p of this.state.players().values()) this.players.add(p);
    const me = this.state.myPlayer();
    if (me) this.controller.teleport(me.x, me.z);
    if (res.room.map !== prevMap) this.changeMap(res.room.map);
    else {
      this.runtime.unmountAll();
      this.controller.clearLocks();
      this.controller.overrideAnim = null;
      this.runtime.mountForMap(res.room.map);
    }
    this.viewmodel.setLook(this.myLook());
    this.syncViewmodelHeld();
    this.applySelfVisuals();
    this.state.setConnection('connected');
    this.deps.ui.toast('Đã kết nối lại!', 'good');
  }

  // ───────────────────────── Bàn phím ─────────────────────────

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.stopped) return;
    const ui = this.deps.ui;
    this.deps.audio.unlock();
    if (ui.isTyping()) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // Ô chat vừa đóng (gửi tin) — khóa chuột lại ngay trong cú bấm phím.
      if (down && !ui.isModalOpen()) setTimeout(() => !ui.isTyping() && this.input.requestLock(), 0);
      return;
    }
    if (down && e.code === 'Escape') {
      if (ui.closeTopModal()) return;
      this.runtime.handleKey(e, down);
      return;
    }
    if (ui.isModalOpen()) return;
    if (this.runtime.handleKey(e, down)) return;
    if (!down || e.repeat) return;
    switch (e.code) {
      case 'KeyE':
        this.interaction.press();
        return;
      case 'KeyQ':
        if (this.state.myPlayer()?.held) {
          this.actions.drop();
          this.deps.audio.play('putdown', { volume: 0.7 });
        }
        return;
      case 'KeyB':
        this.tryBless();
        return;
      case 'KeyH':
        if (this.state.me.isHost) ui.openHostMenu();
        else ui.toast('Chỉ Phương Trượng (người nhiều Công Đức nhất) mới mở được menu này.', 'info');
        return;
      case 'KeyV':
        this.rig.toggleMode();
        this.players.firstPerson = this.rig.mode === 'fp';
        this.r.showViewmodel = this.rig.mode === 'fp';
        ui.toast(this.rig.mode === 'fp' ? 'Góc nhìn thứ nhất' : 'Xem góc thứ ba (lăn chuột để chỉnh xa gần, V để quay lại)', 'info');
        return;
    }
    const m = /^Digit([1-8])$/.exec(e.code);
    if (m) this.doEmote(EMOTE_IDS[Number(m[1]) - 1]!);
  }

  private doEmote(id: EmoteId): void {
    const me = this.state.myPlayer();
    if (!me || me.kneelUntil > this.clock.now() || this.controller.overrideAnim) return;
    this.controller.playEmote(id);
    this.deps.net.socket.emit('emote', id);
  }

  private tryBless(): void {
    const target = this.players.pickInFront(this.controller.x, this.controller.z, this.rig.yaw, BLESS.range + 0.6, 0.45);
    if (!target) {
      this.deps.ui.toast('Nhìn thẳng vào một Tiểu Đồng đứng gần để ban phước.', 'info');
      return;
    }
    this.actions.bless(target);
  }

  // ───────────────────────── Khung hình ─────────────────────────

  private frame(): void {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const t = now / 1000;
    const serverNow = this.clock.now();
    const ui = this.deps.ui;
    const blocked = ui.isTyping() || ui.isModalOpen();
    if (blocked && this.input.locked) this.input.exitLock();
    ui.setPointerHint(!this.input.locked && !blocked);

    const me = this.state.me;
    const pub = this.state.myPlayer();
    this.controller.update(dt, {
      isDown: (c) => this.input.isDown(c),
      yaw: this.rig.yaw,
      map: this.map,
      me,
      pub,
      serverNow,
      blocked,
    });
    this.state.setMyPose(this.controller.x, this.controller.z, this.controller.ry, this.controller.anim);
    if (this.controller.anim !== this.lastAnim) {
      this.lastAnim = this.controller.anim;
      this.animSince = performance.now();
    }
    // Đang lạy: camera góc thứ nhất cúi rạp theo đúng nhịp thân nhân vật.
    const dip = this.controller.anim === 'prostrate' ? prostrateDip((performance.now() - this.animSince) / 1000) : 0;
    this.rig.update(
      dt,
      {
        x: this.controller.x,
        z: this.controller.z,
        eyeHeight: (EYE[this.controller.anim] ?? 1.35) - dip * 0.3,
        pitchOffset: -dip * 0.62,
        speed: this.controller.speed,
      },
      this.map,
    );
    if (this.debugCam) {
      const c = this.debugCam;
      this.r.camera.position.set(c.x, c.y, c.z);
      this.r.camera.rotation.set(c.pitch, c.yaw + Math.PI, 0);
    }
    this.updateInterior(dt);
    this.r.showViewmodel = !this.debugCam && this.rig.mode === 'fp';
    this.players.firstPerson = !this.debugCam && this.rig.mode === 'fp';
    this.players.update(dt, t, serverNow - NET.interpDelayMs, {
      x: this.controller.x,
      z: this.controller.z,
      ry: this.controller.ry,
      anim: this.controller.anim,
      speed: this.controller.speed,
    });

    const kneelLeft = (pub?.kneelUntil ?? 0) - serverNow;
    this.interaction.override = kneelLeft > 0 ? `Đang quỳ sám hối… còn ${Math.ceil(kneelLeft / 1000)} giây` : null;
    const f = this.rig.forward();
    this.interaction.update(
      { map: this.map, x: this.controller.x, z: this.controller.z, fx: f.x, fz: f.z, blocked: blocked || kneelLeft > 0 },
      !blocked,
    );

    this.updateCountdown(serverNow);
    this.handles.update(dt, t);
    if (now >= this.motesCheckAt) {
      this.motesCheckAt = now + 500;
      const halo = this.map.id === 'temple' && me.buffs.some((b) => b.id === 'hao_quang' && b.until > serverNow);
      const theme = halo ? 'halo' : this.map.id === 'bar' ? 'bar' : 'temple';
      if (theme !== this.motesTheme) {
        this.motesTheme = theme;
        this.fx.setMotes(theme);
      }
    }
    this.fx.update(dt);
    this.runtime.update(dt);
    this.followSun();

    this.viewmodel.setAnim(this.controller.anim);
    this.viewmodel.update(dt, t, this.controller.speed);

    if (me.doSay > 30 && now > this.burpAt) {
      if (this.burpAt > 0) this.deps.audio.play('burp', { volume: 0.7, rate: 0.9 + Math.random() * 0.3 });
      this.burpAt = now + 9000 + Math.random() * 14000;
    }
    this.r.render();
  }

  private updateCountdown(serverNow: number): void {
    const mc = this.state.room.mapChange;
    let text: string | null = null;
    if (mc) {
      const left = Math.max(0, Math.ceil((mc.at - serverNow) / 1000));
      text = left > 0 ? `${mc.to === 'bar' ? 'Hạ Sơn' : 'Hồi Sơn'} trong ${left}…` : null;
    }
    if (text !== this.countdownText) {
      if (text && this.countdownText) this.deps.audio.play('click', { volume: 0.6 });
      this.countdownText = text;
      this.deps.ui.setCountdown(text);
    }
  }

  private myLook() {
    const me = this.state.me;
    return playerLook({ outfit: me.outfit, isHost: me.isHost, vip: me.vip }, hashString(me.pid));
  }

  private syncViewmodelHeld(): void {
    const held = this.state.myPlayer()?.held ?? null;
    const key = held ? `${held.kind}:${held.variant ?? ''}` : '';
    if (key === this.vmHeldKey) return;
    this.vmHeldKey = key;
    this.viewmodel.setHeld(held);
  }

  // ───────────────────────── Thoát ─────────────────────────

  stop(reason: string | null): void {
    if (this.stopped) return;
    this.stopped = true;
    this.running = false;
    this.r.renderer.setAnimationLoop(null);
    for (const off of this.listeners) off();
    for (const [name, fn] of Object.entries(this.socketHandlers)) this.deps.net.socket.off(name as never, fn as never);
    this.clock.stop();
    this.runtime.dispose();
    this.input.dispose();
    this.players.dispose();
    this.fx.clear();
    this.viewmodel.dispose();
    this.handles.dispose();
    this.r.dispose();
    this.deps.audio.setMusic(null);
    this.deps.audio.stopBeatTrack();
    this.deps.ui.unmountGame();
    this.deps.net.close();
    this.deps.onExit(reason);
  }
}

