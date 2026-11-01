// Luật thuần của các mini-game (dùng chung client/server).
import { describe, expect, it } from 'vitest';
import { BELL, CEREMONY, CHANT, COOK, DANCE, MIXOLOGY } from '../src/config/balance';
import { bauCuaReturn, segmentKind, totalBet, wheelFinalAngle, WHEEL_SEGMENTS } from '../src/activities/bar';
import { ceremonyLayout, ceremonyRoles, ceremonySlots, slotAccepts } from '../src/activities/ceremony';
import { cookRoles, mealsFor, stepStove } from '../src/activities/cook';
import {
  bellPower,
  bellQuality,
  bellSyncFactor,
  bellZoneScore,
  CHANT_KHANH,
  chantChart,
  chantFinalizeAt,
  chantHoldBroken,
  judgeChantHit,
  matchChantPress,
  oppositeChantKey,
  type ChantKey,
  type ChantNote,
} from '../src/activities/coop';
import { arrowCount, danceChart, expectedKey, measureScore, OPPOSITE } from '../src/activities/dance';
import { beatIndexAt, nextMeasureAt } from '../src/activities/dj';
import { mixTip, shakeQuality } from '../src/activities/mixology';
import { inSweepArc, meditationReward, meditationSchedule, releaseTargetOk } from '../src/activities/temple';

describe('Thi nhảy', () => {
  it('bài nhảy tất định, 2 ô dạo trống, số mũi tên tăng 3 → 9, mũi tên đỏ chỉ từ ô 10', () => {
    const a = danceChart(42);
    expect(danceChart(42)).toEqual(a);
    expect(a).toHaveLength(DANCE.measures);
    expect(a[0]!.arrows).toHaveLength(0);
    expect(a[1]!.arrows).toHaveLength(0);
    expect(a[2]!.arrows).toHaveLength(DANCE.arrowsMin);
    expect(a[DANCE.measures - 1]!.arrows).toHaveLength(DANCE.arrowsMax);
    for (let i = 0; i < DANCE.reverseFromMeasure; i++) expect(a[i]!.reversed.every((r) => !r)).toBe(true);
    expect(arrowCount(2)).toBe(3);
  });
  it('mũi tên đỏ phải bấm hướng ngược', () => {
    const m = { arrows: [0, 2] as const, reversed: [true, false] };
    expect(expectedKey({ arrows: [...m.arrows], reversed: m.reversed }, 0)).toBe(OPPOSITE[0]);
    expect(expectedKey({ arrows: [...m.arrows], reversed: m.reversed }, 1)).toBe(2);
  });
  it('điểm: Perfect 100 × (1 + k/10), chuỗi Perfect cộng 10 mỗi lần, Miss 0', () => {
    expect(measureScore('perfect', 3, 1)).toBe(130);
    expect(measureScore('perfect', 3, 3)).toBe(150);
    expect(measureScore('great', 5, 0)).toBe(105);
    expect(measureScore('miss', 9, 4)).toBe(0);
  });
});

describe('DJ', () => {
  it('chỉ số phách và ranh ô nhịp kế tiếp theo giờ server', () => {
    const s = { beat0: 1000, bpm: 120 };
    expect(beatIndexAt(s, 1000)).toBe(0);
    expect(beatIndexAt(s, 1499)).toBe(0);
    expect(beatIndexAt(s, 1500)).toBe(1);
    expect(nextMeasureAt(s, 1001)).toBe(3000);
    expect(nextMeasureAt(s, 3000)).toBe(3000);
  });
});

describe('Bầu Cua + Vòng quay', () => {
  it('ô ra m mặt nhận lại B + B×m, ô không ra mất B', () => {
    expect(bauCuaReturn({ cua: 10 }, ['cua', 'ga', 'nai'])).toBe(20);
    expect(bauCuaReturn({ cua: 10 }, ['cua', 'cua', 'cua'])).toBe(40);
    expect(bauCuaReturn({ cua: 10, ga: 20 }, ['bau', 'bau', 'tom'])).toBe(0);
    expect(bauCuaReturn({ ca: 30, tom: 10 }, ['ca', 'tom', 'ca'])).toBe(30 + 60 + 10 + 10);
    expect(totalBet({ ca: 30, tom: 10 })).toBe(40);
  });
  it('góc dừng đặt tâm ô dưới kim chỉ ở đỉnh và luôn quay tới', () => {
    for (let seg = 0; seg < WHEEL_SEGMENTS; seg++) {
      const a = wheelFinalAngle(1.234, seg, 5);
      expect(a).toBeGreaterThan(1.234 + 5 * Math.PI * 2 - 1e-9);
      const phi = ((seg + 0.5) / WHEEL_SEGMENTS) * Math.PI * 2;
      const r = (((a - Math.PI / 2 - phi) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      expect(Math.min(r, Math.PI * 2 - r)).toBeLessThan(1e-9);
    }
    expect(segmentKind(1)).toBe('truth');
    expect(segmentKind(2)).toBe('dare');
  });
});

describe('Tụng kinh + Thỉnh chuông', () => {
  it('bài kinh tất định; nốt không chồng nhau; mỗi câu chốt bằng một tiếng Khánh; nốt nằm trong sân khấu', () => {
    for (const s of CHANT.sutras) {
      for (const tempo of CHANT.tempos) {
        for (const seed of [1, 7, 42, 99_999]) {
          const c = chantChart(s.id, tempo, seed);
          expect(chantChart(s.id, tempo, seed)).toEqual(c);
          expect(c.beats).toHaveLength(s.beats);
          const ends = c.notes.filter((n) => n.end);
          expect(ends).toHaveLength(Math.ceil(s.beats / CHANT.phraseBeats));
          for (const n of ends) expect(n.key).toBe(CHANT_KHANH);
          c.notes.forEach((n, i) => {
            for (const v of [n.x, n.x2]) expect(v >= 0.1 && v <= 0.9).toBe(true);
            for (const v of [n.y, n.y2]) expect(v >= 0.14 && v <= 0.86).toBe(true);
            if (s.arrows === 2 && n.key !== CHANT_KHANH) expect([0, 2]).toContain(n.key);
            if (s.reverse === 0) expect(n.rev).toBe(false);
            expect(n.n).toBeGreaterThanOrEqual(1);
            const next = c.notes[i + 1];
            if (!next) return;
            // Nốt sau luôn bắt đầu sau đuôi nốt trước → server chốt lần lượt theo thứ tự.
            expect(next.t).toBeGreaterThan(n.t + n.hold);
            expect(chantFinalizeAt(next)).toBeGreaterThan(chantFinalizeAt(n));
            if (next.phrase === n.phrase) expect(next.n).toBe(n.n + 1);
            else expect(next.n).toBe(1);
          });
        }
      }
    }
  });
  it('nhịp nhanh làm nốt dày hơn; Tâm Kinh có nốt ngân; A Di Đà có móc đơn; Đại Bi có mũi tên đỏ', () => {
    const slow = chantChart('tam_kinh', 0.85, 1);
    const fast = chantChart('tam_kinh', 1.15, 1);
    expect(fast.beats[1]!).toBeLessThan(slow.beats[1]!);
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(seeds.some((s) => chantChart('tam_kinh', 1, s).notes.some((n) => n.hold > 0))).toBe(true);
    expect(seeds.some((s) => chantChart('dai_bi', 1, s).notes.some((n) => n.rev))).toBe(true);
    const eighth = 60_000 / 84 / 2;
    expect(seeds.some((s) => chantChart('a_di_da', 1, s).notes.some((n, i, a) => i > 0 && Math.abs(n.t - a[i - 1]!.t - eighth) < 2))).toBe(true);
  });
  it('mũi tên đỏ vẽ hướng ngược: ← ↔ →, ↑ ↔ ↓; Khánh giữ nguyên', () => {
    expect(([0, 1, 2, 3, 4] as ChantKey[]).map(oppositeChantKey)).toEqual([2, 3, 0, 1, 4]);
  });
  it('chấm gõ mõ: ±45 hoàn hảo, ±100 tốt', () => {
    expect(judgeChantHit(45)).toBe('perfect');
    expect(judgeChantHit(-100)).toBe('good');
    expect(judgeChantHit(101)).toBe('miss');
  });
  it('ghép phím: đúng phím chấm theo độ lệch, sai phím vẫn ăn nốt và tính trượt, xa mọi nốt là trật nhịp', () => {
    const mk = (t: number, key: ChantKey): ChantNote => ({ t, key, rev: false, hold: 0, x: 0.5, y: 0.5, x2: 0.5, y2: 0.5, n: 1, phrase: 0, end: false });
    const notes = [mk(1000, 0), mk(1200, 2), mk(2000, 4)];
    const none = () => false;
    expect(matchChantPress(notes, 0, none, 1030, 0)).toEqual({ i: 0, j: 'perfect', wrongKey: false });
    expect(matchChantPress(notes, 0, none, 920, 0)).toEqual({ i: 0, j: 'good', wrongKey: false });
    // Hai nốt cùng trong cửa sổ: ưu tiên nốt đúng phím.
    expect(matchChantPress(notes, 0, none, 1100, 2)).toEqual({ i: 1, j: 'good', wrongKey: false });
    expect(matchChantPress(notes, 0, none, 1100, 0)).toEqual({ i: 0, j: 'good', wrongKey: false });
    // Sai phím: ăn nốt gần nhất, tính trượt.
    expect(matchChantPress(notes, 0, none, 1000, 1)).toEqual({ i: 0, j: 'miss', wrongKey: true });
    expect(matchChantPress(notes, 0, none, 2000, 0)).toEqual({ i: 2, j: 'miss', wrongKey: true });
    // Trật nhịp: không có nốt nào trong ±strayMs, hoặc nốt đã chấm rồi.
    expect(matchChantPress(notes, 0, none, 1600, 0)).toBeNull();
    expect(matchChantPress(notes, 0, (i) => i === 2, 2000, 4)).toBeNull();
    expect(matchChantPress(notes, 2, none, 1000, 0)).toBeNull();
  });
  it('nốt ngân: thả sớm quá holdEarlyMs là đứt hơi; giữ tới gần đuôi hoặc chưa thả là được', () => {
    const n: ChantNote = { t: 1000, key: 1, rev: false, hold: 800, x: 0.5, y: 0.5, x2: 0.6, y2: 0.5, n: 1, phrase: 0, end: false };
    expect(chantHoldBroken(n, null)).toBe(false);
    expect(chantHoldBroken(n, 1800 - CHANT.holdEarlyMs)).toBe(false);
    expect(chantHoldBroken(n, 1800 - CHANT.holdEarlyMs - 1)).toBe(true);
    expect(chantHoldBroken({ ...n, hold: 0 }, 1000)).toBe(false);
  });
  it('lực chuông dao động tam giác; điểm vùng; hệ số đồng bộ; chất lượng theo số người', () => {
    expect(bellPower(0, BELL.oscillationMs / 2)).toBeCloseTo(100);
    expect(bellPower(0, BELL.oscillationMs / 4)).toBeCloseTo(50);
    expect(bellZoneScore(80)).toBe(1);
    expect(bellZoneScore(60)).toBe(0.6);
    expect(bellZoneScore(30)).toBe(0.25);
    expect(bellSyncFactor(100)).toBe(1);
    expect(bellSyncFactor(400)).toBeCloseTo(0.4);
    expect(bellSyncFactor(500)).toBe(0.3);
    const perfect4 = bellQuality([0, 1, 2, 3].map((i) => ({ power: 80, at: 1000 + i * 10 })));
    expect(perfect4).toBeCloseTo(1);
    const three = bellQuality([0, 1, 2].map(() => ({ power: 80, at: 1000 })));
    expect(three).toBeCloseTo(0.75);
    expect(bellQuality([{ power: 80, at: null }])).toBeLessThan(0.1);
  });
});

describe('Nấu cơm', () => {
  it('số mâm = 1 + ⌊n/2⌋ tối đa 3; vai gợi ý', () => {
    expect(mealsFor(1)).toBe(1);
    expect(mealsFor(4)).toBe(3);
    expect(mealsFor(6)).toBe(COOK.mealsMax);
    expect(cookRoles(1)).toEqual(['da_nang']);
    expect(cookRoles(3)).toEqual(['vo_gao', 'nhat_rau', 'canh_lua']);
  });
  it('nhiệt vùng xanh: chín trong 30 giây; quá nóng thì khét', () => {
    const s = { heat: 60, pot: { state: 'cooking' as const, progress: 0, burn: 0 } };
    for (let i = 0; i < 300; i++) {
      s.heat = 60;
      stepStove(s, 0.1);
    }
    expect(s.pot.state).toBe('done');
    const hot = { heat: 100, pot: { state: 'cooking' as const, progress: 0, burn: 0 } };
    let burnt = false;
    for (let i = 0; i < 120 && !burnt; i++) {
      hot.heat = 100;
      burnt = stepStove(hot, 0.1).burntNow;
    }
    expect(burnt).toBe(true);
  });
});

describe('Đại lễ', () => {
  it('sơ đồ 5 quả khác nhau + 2 màu hoa khác nhau, đủ 10 vị trí', () => {
    const layout = ceremonyLayout(99);
    expect(new Set(layout.fruits).size).toBe(5);
    expect(new Set(layout.vases).size).toBe(2);
    expect(ceremonySlots(layout)).toHaveLength(10);
  });
  it('chia vai đúng ví dụ 10 người = 3 quả, 2 hoa, 2 hương đăng, 3 bày lễ; dưới 4 người đa năng', () => {
    const roles = ceremonyRoles(10);
    const count = (r: string) => roles.filter((x) => x === r).length;
    expect([count('hai_qua'), count('cam_hoa'), count('huong_dang'), count('bay_le')]).toEqual([3, 2, 2, 3]);
    expect(ceremonyRoles(3)).toEqual(['da_nang', 'da_nang', 'da_nang']);
    expect(ceremonyRoles(CEREMONY.roleThreshold)).toContain('bay_le');
  });
  it('ô chỉ nhận đúng vật phẩm', () => {
    const slots = ceremonySlots(ceremonyLayout(5));
    const fruit = slots.find((s) => s.kind === 'fruit')!;
    expect(slotAccepts(fruit, { kind: 'fruit', variant: fruit.variant })).toBe(true);
    expect(slotAccepts(fruit, { kind: 'fruit', variant: 'khong_co' })).toBe(false);
    const lamp = slots.find((s) => s.kind === 'lamp')!;
    expect(slotAccepts(lamp, { kind: 'lamp', variant: 'filled' })).toBe(false);
    expect(slotAccepts(lamp, { kind: 'lamp', variant: 'lit' })).toBe(true);
  });
});

describe('Pha chế + hoạt động Chùa', () => {
  it('chất lượng lắc và tiền tip trong khoảng 10–40', () => {
    expect(shakeQuality(Array(MIXOLOGY.shakeBeats).fill(10))).toBe(1);
    expect(shakeQuality([])).toBe(0);
    expect(mixTip(1, 0)).toBe(MIXOLOGY.tipMax);
    expect(mixTip(0, 0)).toBe(MIXOLOGY.tipMin);
    expect(mixTip(1, 30_000)).toBe(20);
  });
  it('thả đúng chỗ: cá/rùa xuống ao, chim về rừng', () => {
    expect(releaseTargetOk('ca', 'pond')).toBe(true);
    expect(releaseTargetOk('rua', 'forest')).toBe(false);
    expect(releaseTargetOk('chim', 'forest')).toBe(true);
  });
  it('thưởng thiền theo điểm + lịch nhiễu tất định', () => {
    expect(meditationReward(1)).toEqual({ karma: 14, tapNiem: -38 });
    expect(meditationReward(0)).toEqual({ karma: 4, tapNiem: -8 });
    expect(meditationSchedule(3, ['a'])).toEqual(meditationSchedule(3, ['a']));
  });
  it('quét: chỉ gom lá trong nửa hình tròn phía trước', () => {
    expect(inSweepArc(0, 0, 0, 0, 1)).toBe(true);
    expect(inSweepArc(0, 0, 0, 0, -1.2)).toBe(false);
    expect(inSweepArc(0, 0, 0, 0, 3)).toBe(false);
  });
});
