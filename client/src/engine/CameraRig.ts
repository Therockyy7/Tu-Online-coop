// Camera góc nhìn thứ nhất (chuột xoay, nhún đầu khi đi, rung, chao khi say) + chế độ xem góc thứ ba (V)
// đặt sau lưng ~3 m, không xuyên tường (dò vật cản theo dữ liệu map dùng chung).
import * as THREE from 'three';
import { clamp, lerpAngle, type MapDef } from '@shared/index';

/** Vật cản thấp hơn tầm camera — camera góc thứ ba được bay qua. */
const LOW_TAGS = new Set([
  'altar_table',
  'shrine_table',
  'prep_table',
  'lamp_table',
  'flower_table',
  'dining_table',
  'cutting_board',
  'chop_block',
  'jar',
  'oil_jar',
  'candle_stand',
  'incense_burner',
  'release_cart',
  'supply_cart',
  'stone_lantern',
  'pond',
  'broom_rack',
  'wardrobe',
  'woodpile',
  'wash_basin',
  'rice_bin',
  'stove',
  'order_board',
  'npc_table',
  'sofa',
  'baucua_table',
  'exchange_kiosk',
  'vip_rope',
  'bar_counter',
  'bar_counter_side',
  'dj_booth',
  // Sòng Công Đức: bàn cược (mặt bàn 0,86 m) và đường đua (0,95 m, phông 1,46 m) thấp hơn tầm camera; máy Nổ Hũ, hũ
  // jackpot, tường Sòng vẫn là vật cao.
  'taixiu_table',
  'xidach_table',
  'baicao_table',
  'race_track',
  'well',
  'path_lantern',
  'nghe',
]);

const DEG = Math.PI / 180;

export interface CameraTarget {
  x: number;
  z: number;
  /** Độ cao mắt mong muốn (đứng 1,35 · ngồi 0,85 · quỳ 0,75). */
  eyeHeight: number;
  /** Cúi/ngẩng thêm tạm thời (radian, vd đang lạy) — cộng vào góc nhìn, không đổi góc người chơi chọn. */
  pitchOffset?: number;
  /** Tốc độ di chuyển thực (m/s). */
  speed: number;
}

export class CameraRig {
  /** Hướng nhìn quanh trục Y (ry=0 nhìn về +Z). */
  yaw = Math.PI;
  /** Ngẩng (+) / cúi (−). */
  pitch = -0.06;
  mode: 'fp' | 'tp' = 'fp';
  tpDistance = 3.2;
  /** Độ Say 0..100. */
  drunk = 0;
  baseFov = 75;
  /** Góc nhìn do hoạt động đặt (khung hình điện ảnh); null = baseFov. Chuyển mượt. */
  fovOverride: number | null = null;
  readonly reducedMotion: boolean;

  private eye = 1.35;
  private fovNow = 75;
  private pitchOff = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private shakeAmp = 0;
  private time = 0;
  private readonly head = new THREE.Vector3();
  /** Quay mượt tới hướng này (vd ngồi vào bồ đoàn); null = không quay. */
  private turnTarget: number | null = null;
  /** Ngẩng/cúi mượt tới góc này cùng lúc với turnTarget; null = giữ nguyên. */
  private pitchTarget: number | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  look(dx: number, dy: number, sensitivity: number, invertY: boolean): void {
    const s = sensitivity / 1000;
    if (dx !== 0) this.turnTarget = null;
    if (dx !== 0 || dy !== 0) this.pitchTarget = null;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (invertY ? -1 : 1);
    this.clampPitch();
  }

  private clampPitch(): void {
    this.pitch = this.mode === 'fp' ? clamp(this.pitch, -85 * DEG, 85 * DEG) : clamp(this.pitch, -55 * DEG, 65 * DEG);
  }

  toggleMode(): void {
    this.mode = this.mode === 'fp' ? 'tp' : 'fp';
    this.clampPitch();
  }

  zoom(deltaY: number): void {
    this.tpDistance = clamp(this.tpDistance + deltaY * 0.0028, 1.6, 7.5);
  }

  shake(strength: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, clamp(strength, 0, 1.6));
  }

  /** Quay mượt camera (và nhân vật) về hướng ry; `pitch` = ngẩng/cúi mượt tới góc đó luôn. */
  turnTo(ry: number, pitch?: number): void {
    this.turnTarget = ry;
    this.pitchTarget = pitch ?? null;
  }

  forward(): { x: number; z: number } {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  update(dt: number, target: CameraTarget, map: MapDef | null): void {
    this.time += dt;
    if (this.turnTarget !== null) {
      this.yaw = lerpAngle(this.yaw, this.turnTarget, Math.min(1, dt * 9));
      if (Math.abs(lerpAngle(this.yaw, this.turnTarget, 1) - this.yaw) < 0.01) {
        this.yaw = this.turnTarget;
        this.turnTarget = null;
      }
    }
    if (this.pitchTarget !== null) {
      this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * 5);
      if (Math.abs(this.pitchTarget - this.pitch) < 0.002) this.pitchTarget = null;
      this.clampPitch();
    }
    this.eye += (target.eyeHeight - this.eye) * Math.min(1, dt * 7);
    this.pitchOff += ((target.pitchOffset ?? 0) - this.pitchOff) * Math.min(1, dt * 9);
    const moving = target.speed > 0.4 && !this.reducedMotion;
    this.bobAmp += ((moving ? 1 : 0) - this.bobAmp) * Math.min(1, dt * 6);
    this.bobPhase += dt * (3 + target.speed * 1.7);
    const bobY = Math.sin(this.bobPhase * 2) * 0.034 * this.bobAmp;
    const bobSide = Math.cos(this.bobPhase) * 0.022 * this.bobAmp;

    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 2.2);
    const sh = this.reducedMotion ? this.shakeAmp * 0.25 : this.shakeAmp;
    const jx = (Math.random() - 0.5) * 0.1 * sh;
    const jy = (Math.random() - 0.5) * 0.1 * sh;

    const dl = clamp((this.drunk - 30) / 70, 0, 1);
    const heavy = clamp((this.drunk - 60) / 40, 0, 1);
    const roll = Math.sin(this.time * 1.25) * 0.075 * dl + (Math.random() - 0.5) * 0.03 * sh;
    const yaw = this.yaw + Math.sin(this.time * 0.83) * 0.06 * heavy;
    const pitch = this.pitch + this.pitchOff + Math.sin(this.time * 1.6) * 0.035 * dl;

    const cam = this.camera;
    this.fovNow += ((this.fovOverride ?? this.baseFov) - this.fovNow) * Math.min(1, dt * 3);
    if (Math.abs((this.fovOverride ?? this.baseFov) - this.fovNow) < 0.01) this.fovNow = this.fovOverride ?? this.baseFov;
    const fov = this.fovNow + Math.sin(this.time * 1.1) * 4 * dl;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    if (this.mode === 'fp') {
      const rx = -Math.cos(yaw);
      const rz = Math.sin(yaw);
      cam.position.set(target.x + rx * bobSide + jx, this.eye + bobY + jy, target.z + rz * bobSide);
      cam.rotation.set(pitch, yaw + Math.PI, roll);
      return;
    }

    // Góc thứ ba: quay quanh đầu nhân vật, lùi ra sau theo hướng nhìn.
    this.head.set(target.x, this.eye + 0.22, target.z);
    const cp = Math.cos(pitch);
    const dx = Math.sin(yaw) * cp;
    const dy = Math.sin(pitch);
    const dz = Math.cos(yaw) * cp;
    const dist = map ? this.clipDistance(map, -dx, -dz, this.tpDistance) : this.tpDistance;
    cam.position.set(this.head.x - dx * dist + jx, Math.max(0.35, this.head.y - dy * dist + 0.35) + jy, this.head.z - dz * dist);
    cam.lookAt(this.head.x, this.head.y + 0.05, this.head.z);
    cam.rotateZ(roll);
  }

  /** Lùi camera dọc hướng (bx, bz) tới khi chạm vật cản cao. */
  private clipDistance(map: MapDef, bx: number, bz: number, want: number): number {
    const step = 0.1;
    for (let s = 0.3; s <= want; s += step) {
      const px = this.head.x + bx * s;
      const pz = this.head.z + bz * s;
      if (this.blocked(map, px, pz, 0.28)) return Math.max(0.35, s - 0.3);
    }
    return want;
  }

  private blocked(map: MapDef, x: number, z: number, pad: number): boolean {
    const b = map.bounds;
    if (x < b.minX - 1.2 || x > b.maxX + 1.2 || z < b.minZ - 1.2 || z > b.maxZ + 1.2) return true;
    for (const c of map.colliders) {
      if (LOW_TAGS.has(c.tag)) continue;
      if (c.kind === 'circle') {
        const ddx = x - c.x;
        const ddz = z - c.z;
        const r = c.r + pad;
        if (ddx * ddx + ddz * ddz < r * r) return true;
      } else if (Math.abs(x - c.x) < c.w / 2 + pad && Math.abs(z - c.z) < c.d / 2 + pad) {
        return true;
      }
    }
    return false;
  }
}
