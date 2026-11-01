// Phòng Sòng Công Đức (map Bar, nối tường Đông; bố cục SONG_BAC): gom vỏ phòng (casinoShell), bàn Tài Xỉu / Bài Cào
// (casinoTables), bàn Xì Dách (casinoXiDach), đường đua ngựa (casinoRace), máy xèng + Hũ Công Đức (casinoSlots), 4 đèn
// chùm pha lê chỉ phát sáng tự thân + 2 PointLight ấm. Không đặt NPC; xúc xắc, bài, cuộn, ngựa, bảng số do module từng
// trò dựng ở các neo (anchors.ts). Đồ tĩnh trả về trong `statics` để Bar gộp mesh; chỉ những gì đổi vị trí theo thời
// gian mới ở `dyn` (đồ tĩnh vẫn nhấp nháy được vì gộp mesh giữ nguyên đối tượng vật liệu).
import * as THREE from 'three';
import type { MapDef } from '@shared/index';
import { defaultAnchors } from '../anchors';
import type { ArtKit } from '../kit';
import { C, SB, createCasinoCtx, type CasinoCtx } from './casinoKit';
import { buildRace } from './casinoRace';
import { buildEntrance, buildSconces, buildShell } from './casinoShell';
import { buildSlots } from './casinoSlots';
import { buildTables } from './casinoTables';
import { buildXiDach } from './casinoXiDach';

export interface CasinoHandles {
  /** Đồ tĩnh — index.ts thêm vào nhóm tĩnh của Bar trước khi gộp mesh. */
  readonly statics: THREE.Group;
  /** Đồ cần đổi/animate (không gộp). */
  readonly dyn: THREE.Group;
  /** 2 PointLight ấm (tối đa theo thiết kế: Bar đã có hemi + directional + 4 point + 4 spot). */
  readonly lights: THREE.Light[];
  update(dt: number, t: number): void;
  dispose(): void;
}

/** Tâm 4 đèn chùm (x, z): 2 đèn trên lối giữa, 1 đèn trước đường đua, 1 đèn giữa Bài Cào – Hũ – máy xèng. */
const CHANDELIERS: readonly (readonly [number, number])[] = [
  [27, 5],
  [35.5, 5],
  [31, -1.5],
  [31, 12],
];
/** Đèn chùm có kèm PointLight: phủ nửa Bắc (đường đua, Tài Xỉu, Xì Dách) và nửa Nam (Bài Cào, Hũ, máy xèng). */
const LIT = [2, 3] as const;

export function buildCasino(map: MapDef, kit: ArtKit): CasinoHandles {
  const ctx = createCasinoCtx(kit, defaultAnchors(map));
  buildShell(ctx);
  buildEntrance(ctx);
  buildSconces(ctx);
  buildChandeliers(ctx);
  buildTables(ctx);
  buildXiDach(ctx);
  buildRace(ctx);
  buildSlots(ctx);
  const lights = LIT.map((i) => {
    const [x, z] = CHANDELIERS[i]!;
    const l = new THREE.PointLight('#ffc98a', 20, 22, 1.4);
    l.position.set(x, SB.ceiling - 1.45, z);
    return l;
  });
  return {
    statics: ctx.statics,
    dyn: ctx.dyn,
    lights,
    update(dt, t) {
      for (const u of ctx.updates) u(dt, t);
    },
    dispose() {
      for (const tex of ctx.textures) tex.dispose();
      ctx.textures.length = 0;
      ctx.updates.length = 0;
    },
  };
}

/**
 * Đèn chùm pha lê: đế trần, cần treo, thân vàng, bầu pha lê, hai vòng tay đèn (6 + 8 bóng nến phát sáng), giọt pha lê
 * treo giữa các bóng, chuỗi giọt dưới đáy. Pha lê chia 2 vật liệu lấp lánh so le (đổi emissiveIntensity mỗi khung).
 */
function buildChandeliers(ctx: CasinoCtx): void {
  const { geo, mesh, mat } = ctx.kit;
  const crystal = (phase: number) => {
    const m = new THREE.MeshStandardMaterial({
      color: '#f4fbff',
      emissive: '#bfe0ff',
      emissiveIntensity: 0.6,
      roughness: 0.08,
      metalness: 0.2,
      transparent: true,
      opacity: 0.88,
      flatShading: true,
    });
    ctx.updates.push((_dt, t) => (m.emissiveIntensity = 0.45 + 0.4 * Math.max(0, Math.sin(t * 2.6 + phase))));
    return m;
  };
  const crystalA = crystal(0);
  const crystalB = crystal(Math.PI);
  const bulb = mat('#fff4dc', { emissive: C.warmLight, emissiveIntensity: 2.4 });
  const drop = new THREE.OctahedronGeometry(0.035, 0).scale(1, 1.8, 1);
  const top = SB.ceiling;
  for (const [cx, cz] of CHANDELIERS) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.add(mesh(geo.cyl(0.2, 0.24, 0.05, 16), ctx.gold, { y: top - 0.025, castShadow: false }));
    g.add(mesh(geo.cyl(0.014, 0.014, 0.62, 6), ctx.goldDim, { y: top - 0.36, castShadow: false }));
    g.add(mesh(geo.sphere(0.06, 10, 8), ctx.gold, { y: top - 0.68, castShadow: false }));
    g.add(mesh(geo.cyl(0.035, 0.07, 0.55, 10), ctx.gold, { y: top - 0.98, castShadow: false }));
    g.add(mesh(geo.sphere(0.12, 12, 8), crystalA, { y: top - 1.05, scale: [1, 1.25, 1], castShadow: false }));
    for (const [r, y, n, twist] of [
      [0.42, top - 0.9, 6, 0],
      [0.66, top - 1.18, 8, 0.4],
    ] as const) {
      g.add(mesh(geo.torus(r, 0.018, 5, 28), ctx.gold, { y, rx: Math.PI / 2, castShadow: false }));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + twist;
        g.add(mesh(geo.box(r, 0.014, 0.014), ctx.gold, { x: (Math.cos(a) * r) / 2, y, z: (Math.sin(a) * r) / 2, ry: -a, castShadow: false }));
      }
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        g.add(mesh(geo.cyl(0.03, 0.022, 0.05, 8), ctx.gold, { x, y: y + 0.035, z, castShadow: false }));
        g.add(mesh(geo.sphere(0.038, 8, 6), bulb, { x, y: y + 0.1, z, scale: [1, 1.35, 1], castShadow: false }));
        const b = a + Math.PI / n;
        g.add(mesh(drop, i % 2 ? crystalA : crystalB, { x: Math.cos(b) * r, y: y - 0.09, z: Math.sin(b) * r, castShadow: false }));
        g.add(mesh(drop, i % 2 ? crystalB : crystalA, { x: Math.cos(b) * r, y: y - 0.2, z: Math.sin(b) * r, scale: 0.75, castShadow: false }));
      }
    }
    g.add(mesh(geo.ico(0.07, 0), crystalB, { y: top - 1.42, castShadow: false }));
    g.add(mesh(geo.cone(0.045, 0.16, 6), crystalA, { y: top - 1.55, rx: Math.PI, castShadow: false }));
    ctx.statics.add(g);
  }
}
