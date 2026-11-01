// Mô hình ngựa đua (client/src/activities/duangua/horseModel.ts) vừa đường đua mô hình của làn A (casinoRace.ts): cao không
// chạm xà cổng xuất phát (mặt đường + 0,44 m), rộng lọt làn 0,42 m, dài lọt chuồng (startX − 0,42 .. startX + 0,02) khi mũi
// ở vạch xuất phát, móng chạm mặt đường, mũi đúng hằng NOSE. Hình khối thuần Three.js, không cần trình duyệt. Kèm đường về
// chuồng (horses3d.ts homeStep): quay mặt ra cổng trước vách ngăn làn rồi lùi vào, không góc nào lấn vách / lòi sau cổng.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DUANGUA, SONG_BAC } from '@shared/index';
import { HORSE_SCALE, LEG_PIVOTS, NOSE, TAIL_PIVOT, buildHorseGeometry } from '../src/activities/duangua/horseModel';
import { STALL_TURN_X, homeStep, turnStep } from '../src/activities/duangua/horses3d';

/** Hộp bao cả con ngựa ở tư thế đứng (chưa nhân tỉ lệ): thân cứng + 4 chân ở khớp + đuôi ở gốc đuôi. */
function horseBox(): THREE.Box3 {
  const g = buildHorseGeometry();
  const box = new THREE.Box3();
  const add = (geo: THREE.BufferGeometry, at?: readonly number[]) => {
    geo.computeBoundingBox();
    const b = geo.boundingBox!.clone();
    if (at) b.translate(new THREE.Vector3(at[0], at[1], at[2]));
    box.union(b);
  };
  for (const geo of [g.coat, g.mane, g.silk, g.fixed, g.blaze]) add(geo);
  for (const p of LEG_PIVOTS) add(g.leg, p);
  add(g.tail, TAIL_PIVOT);
  return box;
}

describe('Mô hình ngựa đua — kích thước khớp đường đua mô hình', () => {
  const b = horseBox();
  const S = HORSE_SCALE;

  it('đỉnh mũ nài dưới xà cổng xuất phát (0,44 m) cả khi nhún, móng chạm mặt đường', () => {
    expect(b.max.y * S).toBeLessThanOrEqual(0.36);
    expect(b.min.y * S).toBeGreaterThanOrEqual(-0.002);
    expect(b.min.y * S).toBeLessThanOrEqual(0.003);
  });

  it('rộng lọt làn (≤ 0,28 m), dài lọt chuồng khi mũi ở vạch xuất phát', () => {
    expect((b.max.z - b.min.z) * S).toBeLessThanOrEqual(0.28);
    expect((b.max.x - b.min.x) * S).toBeLessThanOrEqual(0.42);
    // Mũi = điểm xa nhất phía trước; đuôi không lòi ra sau chuồng (sâu 0,42 m sau vạch).
    expect(Math.abs(b.max.x * S - NOSE)).toBeLessThan(0.003);
    expect(NOSE - b.min.x * S).toBeLessThanOrEqual(0.42);
  });

  it('chân Ô Truy (móng trắng) cùng kích thước chân thường', () => {
    const g = buildHorseGeometry();
    g.leg.computeBoundingBox();
    g.legWhiteHoof.computeBoundingBox();
    expect(g.legWhiteHoof.boundingBox!.equals(g.leg.boundingBox!)).toBe(true);
    expect(g.leg.attributes.color).toBeDefined();
  });
});

describe('Ngựa về chuồng — quay mặt ra cổng trước vách ngăn rồi lùi vào (C4)', () => {
  const b = horseBox();
  const S = HORSE_SCALE;
  const FRONT = b.max.x * S;
  const BACK = b.min.x * S;
  const W = Math.max(-b.min.z, b.max.z) * S;
  /** Cổng xuất phát (casinoRace.ts buildGate): vách ngăn làn x −0,42..+0,02 (cục bộ neo), mặt đệm cách tâm làn 0,21 − 0,009. */
  const GATE_BACK = -0.42;
  const GATE_FRONT = 0.02;
  const PAD = 0.21 - 0.009;
  const LEN = SONG_BAC.race.finishX - SONG_BAC.race.startX;

  it('chỗ quay đủ xa: vòng quét của mũi quanh gốc nằm hẳn trước vách', () => {
    expect(STALL_TURN_X - NOSE).toBeGreaterThan(GATE_FRONT);
    expect(STALL_TURN_X + BACK).toBeGreaterThan(GATE_FRONT);
  });

  it('từ chỗ dừng sau vạch đích: không góc nào của ngựa lấn vách ngăn làn hay lòi sau cổng; về đúng gốc −NOSE, mặt ra cổng', () => {
    const r = { x: LEN + 0.42 - NOSE, yaw: 0 };
    const dt = 1 / 60;
    let t = 0;
    let walked = false;
    let turnedAt = Number.NaN;
    for (; t < 30 && !(r.x === -NOSE && r.yaw === 0); t += dt) {
      turnStep(r, homeStep(r, dt), dt);
      // Gốc ngựa lúc quay mặt lại ra cổng (yaw qua π/2 sau khi đã quay về −X để đi về).
      if (r.yaw > Math.PI - 1e-9) walked = true;
      if (walked && Number.isNaN(turnedAt) && r.yaw < Math.PI / 2) turnedAt = r.x;
      const c = Math.cos(r.yaw);
      const s = Math.sin(r.yaw);
      // 4 góc hộp bao (nhìn từ trên) + mũi, quay theo yaw quanh gốc (Three.js: x' = x·cos + z·sin, z' = −x·sin + z·cos).
      for (const [lx, lz] of [
        [FRONT, W],
        [FRONT, -W],
        [BACK, W],
        [BACK, -W],
        [NOSE, 0],
      ] as const) {
        const x = r.x + lx * c + lz * s;
        const z = -lx * s + lz * c;
        expect(x).toBeGreaterThanOrEqual(GATE_BACK);
        if (x <= GATE_FRONT) expect(Math.abs(z)).toBeLessThan(PAD);
      }
    }
    expect(r.x).toBe(-NOSE);
    expect(r.yaw).toBe(0);
    // Quay mặt ra cổng ở chỗ quay (ngoài vách), không phải trong chuồng.
    expect(turnedAt).toBeGreaterThanOrEqual(STALL_TURN_X);
    expect(turnedAt).toBeLessThan(STALL_TURN_X + 0.01);
    // Về kịp trong lúc đặt cược ván sau.
    expect(t).toBeLessThan(DUANGUA.betMs / 1000);
  });

  it('ngựa đang đứng trong chuồng (chưa đua) thì đứng yên, mặt ra cổng', () => {
    const r = { x: -NOSE, yaw: 0 };
    for (let i = 0; i < 120; i++) turnStep(r, homeStep(r, 1 / 60), 1 / 60);
    expect(r).toEqual({ x: -NOSE, yaw: 0 });
  });
});
