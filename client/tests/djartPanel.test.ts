// Bảng DJ (client/src/activities/dj/panel.ts) — phím tắt lúc đứng bàn: phím trơn điều khiển nhạc / hiệu ứng của cả quán;
// tổ hợp Ctrl / Meta / Alt là của trình duyệt (Ctrl+P in trang, Ctrl+F tìm, Ctrl+C sao chép, Alt+←/→ lùi / tới trang…)
// nên bảng để nguyên — không gửi lệnh, không chặn phím (giống các bảng sòng, mục C1). Môi trường test là node: cửa sổ =
// EventTarget giả, DOM giả chỉ có những gì bảng chạm tới.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DJ_RECORDED, trackInfo, type DjAnyTrackId, type DjPublicState } from '@shared/activities/dj';
import { DjPanel } from '../src/activities/dj/panel';
import type { ClientActivityContext } from '../src/activities/types';

type Mods = Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>;

/** Phần tử giả: đủ cho bảng DJ dựng DOM, vẽ lại và chạy đồng hồ mỗi khung. */
function fakeEl(): HTMLElement {
  const cls = new Set<string>();
  return {
    className: '',
    textContent: '',
    title: '',
    type: '',
    offsetWidth: 0,
    style: {},
    classList: {
      add: (c: string) => void cls.add(c),
      remove: (c: string) => void cls.delete(c),
      contains: (c: string) => cls.has(c),
      toggle(c: string, on?: boolean) {
        if (on ?? !cls.has(c)) cls.add(c);
        else cls.delete(c);
        return cls.has(c);
      },
    },
    append() {},
    addEventListener() {},
  } as unknown as HTMLElement;
}

function djState(trackId: DjAnyTrackId, playing: boolean): DjPublicState {
  const t = trackInfo(trackId);
  return {
    trackId,
    bpm: t.bpm,
    startedAt: 0,
    beat0: t.beatOffsetMs,
    playing,
    pausedAtMs: 0,
    theme: 'neon',
    dropAt: 0,
    hornAt: 0,
    confettiAt: 0,
    smokeAt: 0,
    strobeAt: 0,
    controllerPid: 'a',
    controllerName: 'A',
  };
}

let win: EventTarget;

beforeEach(() => {
  win = new EventTarget();
  vi.stubGlobal('addEventListener', win.addEventListener.bind(win));
  vi.stubGlobal('removeEventListener', win.removeEventListener.bind(win));
  vi.stubGlobal('document', { createElement: () => fakeEl() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mở bảng DJ (nằm trên cùng, không gõ chat) với trạng thái cố định; trả lệnh đã gửi server. */
function openDj(state: DjPublicState) {
  const send = vi.fn();
  const wrap: { parentElement: unknown } = { parentElement: null };
  wrap.parentElement = { lastElementChild: wrap };
  let closed = false;
  const ctx = {
    serverNow: () => 1_000_000,
    send,
    state: { activityState: () => undefined },
    ui: {
      isTyping: () => false,
      openPanel: (o: { onClose?: () => void }) => ({
        el: { parentElement: wrap },
        body: fakeEl(),
        get closed() {
          return closed;
        },
        setTitle() {},
        close() {
          if (closed) return;
          closed = true;
          o.onClose?.();
        },
      }),
    },
  } as unknown as ClientActivityContext;
  const panel = new DjPanel(ctx, () => state, () => {});
  const sent = () => send.mock.calls.map((c) => c[0] as string);
  return { panel, sent };
}

/** Nhấn một phím ở cửa sổ (bảng nghe pha bắt); trả sự kiện để xem bảng có chặn không. */
function press(code: string, mods: Mods = {}): Event {
  const e = Object.assign(new Event('keydown', { cancelable: true }), {
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });
  win.dispatchEvent(e);
  return e;
}

describe('Bảng DJ — phím tắt lúc đứng bàn', () => {
  it('phím trơn: P dừng nhạc, ← / → đổi bài, F đèn chớp — bảng giữ phím (preventDefault)', () => {
    const { sent } = openDj(djState(DJ_RECORDED[0]!.id, true));
    expect(press('KeyP').defaultPrevented).toBe(true);
    press('ArrowLeft');
    press('ArrowRight');
    expect(press('KeyF').defaultPrevented).toBe(true);
    expect(sent()).toEqual(['stop', 'prev', 'next', 'strobe']);
  });

  it('tổ hợp Ctrl / Meta / Alt để cho trình duyệt: không gửi lệnh cho cả quán, không chặn phím', () => {
    const { sent } = openDj(djState(DJ_RECORDED[0]!.id, true));
    const combos: [string, Mods][] = [
      ['KeyP', { ctrlKey: true }], // in trang
      ['KeyP', { metaKey: true }], // Cmd+P
      ['KeyF', { ctrlKey: true }], // tìm trong trang
      ['KeyC', { ctrlKey: true }], // sao chép
      ['KeyH', { ctrlKey: true }], // lịch sử
      ['KeyK', { ctrlKey: true }], // ô tìm kiếm
      ['Space', { ctrlKey: true }],
      ['ArrowLeft', { altKey: true }], // lùi trang
      ['ArrowRight', { altKey: true }], // tới trang
    ];
    for (const [code, mods] of combos) {
      expect(press(code, mods).defaultPrevented, `${code} ${JSON.stringify(mods)}`).toBe(false);
    }
    expect(sent()).toEqual([]);
  });

  it('Shift không tính là tổ hợp của trình duyệt (như bảng sòng): Shift + → vẫn đổi bài', () => {
    const { sent } = openDj(djState(DJ_RECORDED[0]!.id, true));
    expect(press('ArrowRight', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(sent()).toEqual(['next']);
  });
});
