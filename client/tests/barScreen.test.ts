// Màn hình LED sân khấu Bar (client/src/art/bar/screen.ts) — phần thuần, không cần trình duyệt: tường LED 20 cột chia đôi
// sang hai bên màn hình (BAR_SCREEN) không lấn khung viền, không vượt bề ngang tường LED cũ, đối xứng, giữ khoảng cột
// 0,34 m; cắt tên video "Đang tải: …" cho vừa bề ngang (thêm "…", không cắt đôi emoji). Phần vẽ canvas / dựng hình cần
// trình duyệt nên kiểm bằng mắt khi chạy game.
import { describe, expect, it } from 'vitest';
import { BAR_SCREEN } from '@shared/index';
import { LED_COL_STEP, LED_COL_W, ellipsize, ledColumnX } from '../src/art/bar/screen';

const COLS = Array.from({ length: 20 }, (_, c) => ledColumnX(c));
const EPS = 1e-9;

describe('Tường LED chia đôi hai bên màn hình sân khấu', () => {
  it('20 cột tăng dần từ trái sang phải, đối xứng tuyệt đối qua tâm màn hình', () => {
    expect(BAR_SCREEN.x).toBe(0);
    for (let c = 1; c < 20; c++) expect(COLS[c]!).toBeGreaterThan(COLS[c - 1]!);
    for (let c = 0; c < 20; c++) expect(ledColumnX(c)).toBe(-ledColumnX(19 - c));
  });

  it('mỗi bên 10 cột rộng 0,28 m, hai cột liền nhau trong một bên cách đúng 0,34 m', () => {
    expect(LED_COL_W).toBe(0.28);
    expect(LED_COL_STEP).toBe(0.34);
    expect(COLS.slice(0, 10).every((x) => x < 0)).toBe(true);
    expect(COLS.slice(10).every((x) => x > 0)).toBe(true);
    for (let c = 1; c < 20; c++) if (c !== 10) expect(COLS[c]! - COLS[c - 1]!).toBeCloseTo(LED_COL_STEP, 9);
  });

  it('không cột nào lấn màn hình + khung viền (chừa 0,15 m), mép ngoài không quá 5,92 m (bề ngang tường LED cũ)', () => {
    for (const x of COLS) {
      expect(Math.abs(x) - LED_COL_W / 2).toBeGreaterThanOrEqual(BAR_SCREEN.w / 2 + 0.15 - EPS);
      expect(Math.abs(x) + LED_COL_W / 2).toBeLessThanOrEqual(5.92 + EPS);
    }
    // Cột trong cùng sát khung (mép trong 2,58 m), cột ngoài cùng sát mép tường cũ (mép ngoài 5,92 m).
    expect(Math.abs(COLS[9]!) - LED_COL_W / 2).toBeCloseTo(2.58, 9);
    expect(Math.abs(COLS[0]!) + LED_COL_W / 2).toBeCloseTo(5.92, 9);
  });
});

describe('ellipsize — cắt chữ cho vừa bề ngang', () => {
  /** Đo giả: mỗi ký tự (code point) rộng 10 px. */
  const measure = (s: string) => [...s].length * 10;

  it('vừa thì giữ nguyên', () => {
    expect(ellipsize('Đang tải: Lạc Trôi', 180, measure)).toBe('Đang tải: Lạc Trôi');
    expect(ellipsize('', 50, measure)).toBe('');
  });

  it('dài quá thì cắt + "…" sao cho vừa đúng bề ngang, bỏ khoảng trắng thừa trước "…"', () => {
    expect(ellipsize('abcdefghijkl', 100, measure)).toBe('abcdefghi…');
    expect(measure(ellipsize('abcdefghijkl', 100, measure))).toBeLessThanOrEqual(100);
    expect(ellipsize('abcd efgh ijkl', 100, measure)).toBe('abcd efgh…');
    expect(ellipsize('abcd efgh ijkl', 105, measure)).toBe('abcd efgh…');
  });

  it('không cắt đôi emoji (cặp surrogate)', () => {
    const out = ellipsize('😀'.repeat(12), 100, measure);
    expect(out).toBe(`${'😀'.repeat(9)}…`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out)).toBe(false);
  });

  it('bề ngang nhỏ hơn cả dấu "…" → chỉ còn "…"', () => {
    expect(ellipsize('abc', 5, measure)).toBe('…');
  });
});
