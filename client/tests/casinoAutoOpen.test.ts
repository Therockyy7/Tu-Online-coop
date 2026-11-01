// Luật tự mở bảng bàn sòng lúc bàn vừa mở ván (client/src/activities/casino/autoOpen.ts, C2): vùng "đứng gần" của bàn Tài
// Xỉu / Xì Dách chồng vùng lan can Đua Ngựa ở lối đi giữa hai bên → chỉ bàn gần nhất tự mở, và không bật đè bảng khác.
import { describe, expect, it } from 'vitest';
import { BAR_MAP, CASINO, SONG_BAC } from '@shared/index';
import { canAutoOpen, nearestTableKind } from '../src/activities/casino/autoOpen';
import type { ClientActivityContext } from '../src/activities/types';

type Ctx = Pick<ClientActivityContext, 'me' | 'world' | 'ui'>;
const ctxAt = (x: number | null, z: number, modal = false): Ctx =>
  ({
    me: () => (x === null ? undefined : { x, z }),
    world: { map: BAR_MAP },
    ui: { isModalOpen: () => modal },
  }) as unknown as Ctx;

const KINDS = ['taixiu_table', 'xidach_table', 'baicao_table', 'race_rail'] as const;
/** Đứng trong tầm một trạm loại `kind` như module / server kiểm (bán kính + CASINO.nearSlack). */
const inReach = (x: number, z: number, kind: string): boolean =>
  BAR_MAP.stations.some((s) => s.kind === kind && Math.hypot(x - s.x, z - s.z) <= s.r + CASINO.nearSlack);

describe('Sòng — tự mở bảng khi bàn vừa mở ván (C2)', () => {
  it('lối đi giữa bàn Tài Xỉu và lan can 1: đứng trong tầm cả hai, chỉ bàn gần hơn được tự mở', () => {
    // Gần bàn Tài Xỉu hơn (2,42 m so với 2,61 m tới lan can 1).
    expect(inReach(27.3, -0.6, 'taixiu_table') && inReach(27.3, -0.6, 'race_rail')).toBe(true);
    expect(nearestTableKind(ctxAt(27.3, -0.6))).toBe('taixiu_table');
    expect(canAutoOpen(ctxAt(27.3, -0.6), 'taixiu_table')).toBe(true);
    expect(canAutoOpen(ctxAt(27.3, -0.6), 'race_rail')).toBe(false);
    // Lùi về phía đường đua xem ngựa: vẫn trong tầm bàn Tài Xỉu nhưng lan can gần hơn → Tài Xỉu mở ván không bật bảng.
    expect(inReach(27.4, -1.3, 'taixiu_table')).toBe(true);
    expect(canAutoOpen(ctxAt(27.4, -1.3), 'taixiu_table')).toBe(false);
    expect(canAutoOpen(ctxAt(27.4, -1.3), 'race_rail')).toBe(true);
  });

  it('lối đi giữa bàn Xì Dách và lan can 2: đứng xem đua thì Xì Dách mở ván không bật bảng', () => {
    expect(inReach(35.3, -1.4, 'xidach_table') && inReach(35.3, -1.4, 'race_rail')).toBe(true);
    expect(canAutoOpen(ctxAt(35.3, -1.4), 'xidach_table')).toBe(false);
    expect(canAutoOpen(ctxAt(35.3, -1.4), 'race_rail')).toBe(true);
    const { x, z } = SONG_BAC.xidach;
    expect(canAutoOpen(ctxAt(x, z + 1.6), 'xidach_table')).toBe(true);
  });

  it('đang mở bảng / hộp chọn khác thì không tự mở bảng nào; chưa có nhân vật cũng không', () => {
    for (const k of KINDS) expect(canAutoOpen(ctxAt(27.3, -0.6, true), k)).toBe(false);
    expect(canAutoOpen(ctxAt(SONG_BAC.baicao.x, SONG_BAC.baicao.z + 2), 'baicao_table')).toBe(true);
    expect(canAutoOpen(ctxAt(SONG_BAC.baicao.x, SONG_BAC.baicao.z + 2, true), 'baicao_table')).toBe(false);
    expect(nearestTableKind(ctxAt(null, 0))).toBeNull();
    for (const k of KINDS) expect(canAutoOpen(ctxAt(null, 0), k)).toBe(false);
  });

  it('mọi chỗ đứng trong Sòng: nhiều nhất một bàn tự mở bảng', () => {
    let overlap = 0;
    for (let x = SONG_BAC.minX; x <= SONG_BAC.maxX; x += 0.2) {
      for (let z = SONG_BAC.minZ; z <= SONG_BAC.maxZ; z += 0.2) {
        const near = KINDS.filter((k) => inReach(x, z, k));
        if (near.length > 1) overlap++;
        expect(near.filter((k) => canAutoOpen(ctxAt(x, z), k)).length).toBeLessThanOrEqual(1);
      }
    }
    // Có thật dải chồng vùng (lý do của luật này).
    expect(overlap).toBeGreaterThan(0);
  });
});
