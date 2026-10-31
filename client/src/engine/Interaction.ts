// Chọn thứ để tương tác theo hướng nhìn: trạm trong tầm với VÀ nằm trong ~45° trước mặt (trạm dạng khu vực
// thì chỉ cần đứng trong vùng), cộng điểm tương tác động do mini-game đăng ký. Hiện "[E] …" + tâm ngắm.
import type { MapDef, StationDef } from '@shared/index';
import type { ActivityRuntime } from '../activities/runtime';
import type { UIApi } from '../ui/api';
import type { DynamicInteractable } from './worldApi';

type Target = { kind: 'station'; station: StationDef; label: string } | { kind: 'dynamic'; item: DynamicInteractable; label: string };

const COS_45 = Math.cos(Math.PI / 4);
/** Vật thể nằm trước điểm đứng của trạm chừng này mét (theo station.ry). */
const OBJECT_AHEAD = 1;

export interface InteractionFrame {
  map: MapDef;
  x: number;
  z: number;
  /** Hướng nhìn của camera. */
  fx: number;
  fz: number;
  /** Không gợi ý (đang mở bảng, gõ chat, quỳ…). */
  blocked: boolean;
}

export class Interaction {
  private readonly dynamic = new Set<DynamicInteractable>();
  private target: Target | null = null;
  private lastPrompt: string | null = '';
  private lastCross = '';
  /** Gợi ý ghi đè (vd "Đang quỳ sám hối… 12 giây"). */
  override: string | null = null;

  constructor(
    private readonly ui: UIApi,
    private readonly runtime: ActivityRuntime,
    private readonly sendInteract: (stationId: string) => void,
  ) {}

  add(i: DynamicInteractable): () => void {
    this.dynamic.add(i);
    return () => {
      this.dynamic.delete(i);
      if (this.target?.kind === 'dynamic' && this.target.item === i) this.target = null;
    };
  }

  clearDynamic(): void {
    this.dynamic.clear();
    this.target = null;
  }

  private facing(f: InteractionFrame, tx: number, tz: number): boolean {
    const dx = tx - f.x;
    const dz = tz - f.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) return true;
    return (dx * f.fx + dz * f.fz) / d >= COS_45;
  }

  update(f: InteractionFrame, crosshairVisible: boolean): void {
    this.target = f.blocked ? null : this.pick(f);
    const prompt = this.override ?? (this.target ? `[E] ${this.target.label}` : null);
    if (prompt !== this.lastPrompt) {
      this.lastPrompt = prompt;
      this.ui.setPrompt(prompt);
    }
    const cross = !crosshairVisible ? 'hidden' : this.target ? 'target' : 'idle';
    if (cross !== this.lastCross) {
      this.lastCross = cross;
      this.ui.setCrosshair(cross as 'hidden' | 'idle' | 'target');
    }
  }

  private pick(f: InteractionFrame): Target | null {
    const cands: { ratio: number; t: () => Target | null }[] = [];
    for (const s of f.map.stations) {
      const d = Math.hypot(f.x - s.x, f.z - s.z);
      if (d > s.r) continue;
      if (!s.area) {
        const tx = s.x + Math.sin(s.ry) * OBJECT_AHEAD;
        const tz = s.z + Math.cos(s.ry) * OBJECT_AHEAD;
        if (!this.facing(f, tx, tz)) continue;
      }
      cands.push({
        ratio: d / s.r,
        t: () => {
          const label = this.runtime.prompt(s);
          if (label === null) return null;
          return { kind: 'station', station: s, label: label ?? s.label };
        },
      });
    }
    for (const item of this.dynamic) {
      const p = item.position();
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > item.r || !this.facing(f, p.x, p.z)) continue;
      cands.push({
        ratio: d / item.r,
        t: () => {
          const label = item.label();
          return label === null ? null : { kind: 'dynamic', item, label };
        },
      });
    }
    cands.sort((a, b) => a.ratio - b.ratio);
    for (const c of cands) {
      const t = c.t();
      if (t) return t;
    }
    return null;
  }

  /** Bấm E. */
  press(): void {
    const t = this.target;
    if (!t) return;
    if (t.kind === 'dynamic') {
      t.item.onInteract();
      return;
    }
    if (!this.runtime.interact(t.station)) this.sendInteract(t.station.id);
  }
}
