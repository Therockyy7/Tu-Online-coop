// Tiện ích phím / chuột dùng chung của các bảng Sòng Công Đức (client/src/activities/casino/ui.ts):
// - C1: phím tắt bảng bỏ qua tổ hợp Ctrl / Meta / Alt (Ctrl+R là tải lại trang, Ctrl+1–4 chuyển tab), phím phỉnh nhận cả
//   bàn phím số;
// - C5: đang nhấn chuột trong bảng thì hoãn dựng lại DOM tới lúc nhả (để click trên ô cược không bị mất), và chỉ dựng lại
//   sau lượt sự kiện của cú nhả.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CASINO, NOHU } from '@shared/index';
import { handleChipKey, hasModifier, pressGuard, selectedChip, setSelectedChip } from '../src/activities/casino/ui';

const key = (code: string, mods: Partial<Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = {}): KeyboardEvent =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

describe('Bảng sòng — phím tắt (C1)', () => {
  beforeEach(() => setSelectedChip(CASINO.chips[1]!));

  it('hasModifier: Ctrl / Meta / Alt là tổ hợp của trình duyệt; Shift hay phím trơn thì không', () => {
    expect(hasModifier(key('KeyR'))).toBe(false);
    expect(hasModifier(key('KeyR', { shiftKey: true }))).toBe(false);
    expect(hasModifier(key('KeyR', { ctrlKey: true }))).toBe(true);
    expect(hasModifier(key('Digit1', { metaKey: true }))).toBe(true);
    expect(hasModifier(key('Space', { altKey: true }))).toBe(true);
  });

  it('phím 1–4 hàng số và bàn phím số chọn phỉnh', () => {
    expect(handleChipKey(key('Digit3'), true)).toBe(true);
    expect(selectedChip()).toBe(CASINO.chips[2]);
    expect(handleChipKey(key('Numpad4'), true)).toBe(true);
    expect(selectedChip()).toBe(CASINO.chips[3]);
    expect(handleChipKey(key('Numpad1'), true)).toBe(true);
    expect(selectedChip()).toBe(CASINO.chips[0]);
    // Nổ Hũ truyền dãy mức cược riêng.
    expect(handleChipKey(key('Numpad2'), true, NOHU.bets)).toBe(true);
    expect(selectedChip()).toBe(NOHU.bets[1]);
  });

  it('Ctrl/Cmd/Alt + số không đổi phỉnh (để trình duyệt chuyển tab); số ngoài dãy phỉnh không tính', () => {
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(handleChipKey(key('Digit4', mods), true)).toBe(false);
      expect(handleChipKey(key('Numpad3', mods), true)).toBe(false);
      expect(selectedChip()).toBe(CASINO.chips[1]);
    }
    expect(handleChipKey(key(`Digit${CASINO.chips.length + 1}`), true)).toBe(false);
    expect(handleChipKey(key('KeyE'), true)).toBe(false);
    expect(selectedChip()).toBe(CASINO.chips[1]);
  });
});

describe('Bảng sòng — hoãn dựng lại khi đang nhấn chuột (C5)', () => {
  // Môi trường test là node: cửa sổ = EventTarget giả, thân bảng = EventTarget khác.
  let win: EventTarget;
  let body: EventTarget;
  let now = 1000;

  beforeEach(() => {
    win = new EventTarget();
    body = new EventTarget();
    vi.stubGlobal('addEventListener', win.addEventListener.bind(win));
    vi.stubGlobal('removeEventListener', win.removeEventListener.bind(win));
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const guard = (rebuild: () => void) => pressGuard(body as HTMLElement, rebuild);

  it('không nhấn chuột: dựng lại ngay (hold = false)', () => {
    const rebuild = vi.fn();
    const g = guard(rebuild);
    expect(g.hold()).toBe(false);
    vi.runAllTimers();
    expect(rebuild).not.toHaveBeenCalled();
  });

  it('trạng thái mới tới giữa lúc nhấn: hoãn, nhả chuột rồi mới dựng lại — sau lượt sự kiện của cú nhả (click kịp chạy)', () => {
    const rebuild = vi.fn();
    const g = guard(rebuild);
    body.dispatchEvent(new Event('pointerdown'));
    expect(g.hold()).toBe(true);
    expect(g.hold()).toBe(true);
    win.dispatchEvent(new Event('pointerup'));
    expect(rebuild).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(rebuild).toHaveBeenCalledTimes(1);
    // Đã nhả: lượt sau dựng lại ngay.
    expect(g.hold()).toBe(false);
  });

  it('nhấn rồi nhả mà không có trạng thái mới: không dựng lại thừa; pointercancel / mất tiêu điểm cũng tính là nhả', () => {
    const rebuild = vi.fn();
    const g = guard(rebuild);
    body.dispatchEvent(new Event('pointerdown'));
    win.dispatchEvent(new Event('pointerup'));
    vi.runAllTimers();
    expect(rebuild).not.toHaveBeenCalled();
    for (const ev of ['pointercancel', 'blur']) {
      body.dispatchEvent(new Event('pointerdown'));
      expect(g.hold()).toBe(true);
      win.dispatchEvent(new Event(ev));
      vi.runAllTimers();
      expect(g.hold()).toBe(false);
    }
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it('nhấn giữ quá lâu (không nhận được pointerup) thì thôi hoãn', () => {
    const g = guard(vi.fn());
    body.dispatchEvent(new Event('pointerdown'));
    now += 1000;
    expect(g.hold()).toBe(true);
    now += 1000;
    expect(g.hold()).toBe(false);
  });

  it('dispose gỡ listener: nhấn sau khi bảng đóng không hoãn gì', () => {
    const rebuild = vi.fn();
    const g = guard(rebuild);
    g.dispose();
    body.dispatchEvent(new Event('pointerdown'));
    expect(g.hold()).toBe(false);
    win.dispatchEvent(new Event('pointerup'));
    vi.runAllTimers();
    expect(rebuild).not.toHaveBeenCalled();
  });
});
