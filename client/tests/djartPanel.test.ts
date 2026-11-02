// Bảng DJ (client/src/activities/dj/panel.ts) — phím tắt lúc đứng bàn: phím trơn điều khiển nhạc / hiệu ứng của cả
// quán; tổ hợp Ctrl / Meta / Alt là của trình duyệt (Ctrl+P in trang, Ctrl+F tìm, Ctrl+C sao chép, Alt+←/→ lùi / tới
// trang…) nên bảng để nguyên — không gửi lệnh, không chặn phím (giống các bảng sòng, mục C1). Mục YouTube (spec
// 2026-11-02): ô dán link (kiểm dạng tại máy, Enter thêm, Esc chỉ bỏ chọn ô), hàng chờ (dựng lại chỉ khi hàng chờ đổi,
// ▶ / ✕ gửi đúng key, ▶ khóa trong vòng nhảy), khu điều khiển hiện video đang phát. Môi trường test là node: cửa sổ =
// EventTarget giả, DOM giả chỉ có những gì bảng chạm tới.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DJ } from '@shared/index';
import {
  DJ_RECORDED,
  trackInfo,
  type DjAnyTrackId,
  type DjPublicState,
  type DjYoutubeItem,
  type DjYoutubeNow,
} from '@shared/activities/dj';
import { DjPanel } from '../src/activities/dj/panel';
import type { ClientActivityContext } from '../src/activities/types';

type Mods = Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>>;

/** Phần tử giả: đủ cho bảng DJ dựng DOM, vẽ lại, chạy đồng hồ mỗi khung; nhớ phần tử con + hàm nghe (test bấm / gõ). */
interface FakeEl {
  className: string;
  textContent: string;
  title: string;
  type: string;
  value: string;
  placeholder: string;
  maxLength: number;
  offsetWidth: number;
  style: Record<string, string>;
  classList: {
    add(c: string): void;
    remove(c: string): void;
    contains(c: string): boolean;
    toggle(c: string, on?: boolean): boolean;
  };
  children: FakeEl[];
  blurs: number;
  append(...els: FakeEl[]): void;
  replaceChildren(): void;
  addEventListener(type: string, fn: (e: unknown) => void): void;
  blur(): void;
  focus(): void;
  /** Gọi các hàm nghe `type` (giả lập sự kiện). */
  fire(type: string, e: object): void;
}

function fakeEl(): FakeEl {
  const cls = new Set<string>();
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const el: FakeEl = {
    className: '',
    textContent: '',
    title: '',
    type: '',
    value: '',
    placeholder: '',
    maxLength: -1,
    offsetWidth: 0,
    style: {},
    classList: {
      add: (c) => void cls.add(c),
      remove: (c) => void cls.delete(c),
      contains: (c) => cls.has(c) || el.className.split(' ').includes(c),
      toggle(c, on) {
        if (on ?? !cls.has(c)) cls.add(c);
        else cls.delete(c);
        return cls.has(c);
      },
    },
    children: [],
    blurs: 0,
    append: (...els) => void el.children.push(...els),
    replaceChildren: () => void (el.children = []),
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    blur: () => void el.blurs++,
    focus() {},
    fire(type, e) {
      for (const fn of listeners.get(type) ?? []) fn(e);
    },
  };
  return el;
}

/** Mọi phần tử trong cây (kể cả gốc). */
const all = (root: FakeEl): FakeEl[] => [root, ...root.children.flatMap(all)];
const byClass = (root: FakeEl, c: string): FakeEl[] => all(root).filter((e) => e.classList.contains(c));
function one(root: FakeEl, c: string): FakeEl {
  const found = byClass(root, c);
  expect(found, c).toHaveLength(1);
  return found[0]!;
}
const click = (el: FakeEl): void => el.fire('click', { stopPropagation() {} });

/** Gõ phím trong ô nhập; trả sự kiện để xem bảng có chặn / ngăn lan không. */
function typeKey(el: FakeEl, key: string) {
  const e = {
    key,
    repeat: false,
    isComposing: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
  el.fire('keydown', e);
  return e;
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
    yt: null,
    ytQueue: [],
  };
}

const NOW = 1_000_000;
const item = (key: number): DjYoutubeItem => ({
  key,
  videoId: 'dQw4w9WgXcQ',
  title: `Tên ${key}`,
  author: 'Kênh',
  startMs: 0,
  byPid: 'a',
  byName: 'A',
});
const now = (key: number, extra: Partial<DjYoutubeNow> = {}): DjYoutubeNow => ({
  ...item(key),
  durationMs: 0,
  live: false,
  ...extra,
});

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

/**
 * Mở bảng DJ (nằm trên cùng) với trạng thái cố định hoặc đọc qua hàm; `env.dance` = pha Thi nhảy, `env.typing` = đang
 * gõ chữ. Trả lệnh đã gửi server + thân bảng (DOM giả).
 */
function openDj(state: DjPublicState | (() => DjPublicState), env: { dance?: string; typing?: boolean } = {}) {
  const send = vi.fn();
  const leave = vi.fn();
  const wrap: { parentElement: unknown } = { parentElement: null };
  wrap.parentElement = { lastElementChild: wrap };
  let closed = false;
  const body = fakeEl();
  const ctx = {
    serverNow: () => NOW,
    send,
    state: { activityState: (id: string) => (id === 'dance' && env.dance ? { phase: env.dance } : undefined) },
    ui: {
      isTyping: () => !!env.typing,
      openPanel: (o: { onClose?: () => void }) => ({
        el: { parentElement: wrap },
        body,
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
  const get = typeof state === 'function' ? state : () => state;
  const panel = new DjPanel(ctx, get, leave);
  const sent = () => send.mock.calls.map((c) => c[0] as string);
  return { panel, sent, send, leave, body, env, closed: () => closed };
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

  it('đang gõ chữ (ô dán link): phím tắt bàn DJ không chạy, không chặn phím', () => {
    const { sent } = openDj(djState(DJ_RECORDED[0]!.id, true), { typing: true });
    for (const code of ['KeyP', 'KeyH', 'KeyF', 'Space', 'ArrowRight']) {
      expect(press(code).defaultPrevented).toBe(false);
    }
    expect(sent()).toEqual([]);
  });
});

describe('Bảng DJ — mục YouTube', () => {
  it('dựng ô dán link + nút Thêm; link sai báo tại chỗ (không gửi), link đúng gửi rồi xoá ô, bỏ tiêu điểm', () => {
    const { body, send, sent } = openDj(djState(DJ_RECORDED[0]!.id, true));
    const input = one(body, 'dj-yt-input');
    const add = one(body, 'dj-yt-add');
    const hint = one(body, 'dj-yt-hint');
    expect(input.maxLength).toBe(DJ.youtube.urlMax);
    expect(input.placeholder).toContain('YouTube');
    expect(hint.textContent).toContain('phát ngay');
    input.value = 'https://example.com/watch?v=dQw4w9WgXcQ';
    click(add);
    expect(sent()).toEqual([]);
    expect(hint.classList.contains('bad')).toBe(true);
    expect(input.classList.contains('nope')).toBe(true);
    // Gõ lại → bỏ báo đỏ (cả viền ô).
    input.fire('input', {});
    expect(hint.classList.contains('bad')).toBe(false);
    expect(input.classList.contains('nope')).toBe(false);
    input.value = '  https://youtu.be/dQw4w9WgXcQ?t=42  ';
    click(add);
    expect(send).toHaveBeenLastCalledWith('youtube', { url: 'https://youtu.be/dQw4w9WgXcQ?t=42' });
    expect(input.value).toBe('');
    expect(input.blurs).toBe(1);
    expect(hint.textContent).toBe('Đang kiểm tra link…');
  });

  it('ô dán link: Enter = thêm; Esc = bỏ chọn ô, không đóng bảng / rời bàn; cả hai không lan lên cửa sổ', () => {
    const { body, send, leave, closed } = openDj(djState(DJ_RECORDED[0]!.id, true));
    const input = one(body, 'dj-yt-input');
    input.value = 'dQw4w9WgXcQ';
    const enter = typeKey(input, 'Enter');
    expect(enter.prevented && enter.stopped).toBe(true);
    expect(send).toHaveBeenLastCalledWith('youtube', { url: 'dQw4w9WgXcQ' });
    input.value = 'https://youtu.be/kJQP7kiw5Fk';
    const esc = typeKey(input, 'Escape');
    expect(esc.prevented && esc.stopped).toBe(true);
    expect(input.blurs).toBe(2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
    expect(closed()).toBe(false);
    expect(input.value).toBe('https://youtu.be/kJQP7kiw5Fk');
    // Phím khác: gõ chữ bình thường (không chặn).
    const x = typeKey(input, 'p');
    expect(x.prevented || x.stopped).toBe(false);
  });

  it('hàng chờ: mỗi video 1 dòng; vẽ lại cùng hàng chờ thì giữ nguyên phần tử; ▶ / ✕ gửi đúng key', () => {
    let s: DjPublicState = { ...djState(DJ_RECORDED[0]!.id, true), yt: now(10), ytQueue: [item(11), item(12)] };
    const { panel, body, send } = openDj(() => s);
    expect(one(body, 'dj-yt-qhead').textContent).toBe(`Hàng chờ (2/${DJ.youtube.queueMax})`);
    const rows = byClass(body, 'dj-yt-item');
    expect(rows).toHaveLength(2);
    expect(one(rows[0]!, 'dj-yt-name').textContent).toBe('#1 Tên 11 — A');
    expect(one(rows[1]!, 'dj-yt-name').textContent).toBe('#2 Tên 12 — A');
    // Trạng thái mới (đổi màu đèn, mảng mới cùng key) → không dựng lại danh sách.
    s = { ...s, theme: 'fire', ytQueue: [item(11), item(12)] };
    panel.render();
    expect(byClass(body, 'dj-yt-item')[0]).toBe(rows[0]);
    click(one(rows[1]!, 'dj-yt-play'));
    expect(send).toHaveBeenLastCalledWith('yt_play', { key: 12 });
    click(one(rows[0]!, 'dj-yt-del'));
    expect(send).toHaveBeenLastCalledWith('yt_remove', { key: 11 });
    // Server xoá xong → dựng lại còn 1 dòng.
    s = { ...s, ytQueue: [item(12)] };
    panel.render();
    expect(byClass(body, 'dj-yt-item')).toHaveLength(1);
    expect(one(body, 'dj-yt-qhead').textContent).toBe(`Hàng chờ (1/${DJ.youtube.queueMax})`);
    // Trống → dòng gợi ý.
    s = { ...s, ytQueue: [] };
    panel.render();
    expect(byClass(body, 'dj-yt-item')).toHaveLength(0);
    expect(one(body, 'dj-yt-empty').textContent).toContain('Hàng chờ trống');
  });

  it('vòng nhảy: ▶ phát ngay bị khóa như ⏮ ⏭; ô dán, nút Thêm và ✕ vẫn dùng được; hết vòng mở lại', () => {
    let s: DjPublicState = { ...djState(DJ_RECORDED[0]!.id, true), yt: now(10), ytQueue: [item(11)] };
    const { panel, body, env } = openDj(() => s, { dance: 'playing' });
    panel.tick();
    expect(one(body, 'dj-yt-play').classList.contains('locked')).toBe(true);
    expect(one(body, 'dj-yt-del').classList.contains('locked')).toBe(false);
    expect(one(body, 'dj-yt-input').classList.contains('locked')).toBe(false);
    expect(one(body, 'dj-yt-add').classList.contains('locked')).toBe(false);
    expect(one(body, 'dj-yt-hint').textContent).toContain('vòng nhảy');
    // Dòng mới dựng trong lúc nhảy (vừa dán thêm) cũng khóa ngay.
    s = { ...s, ytQueue: [item(11), item(12)] };
    panel.render();
    expect(byClass(body, 'dj-yt-play').map((b) => b.classList.contains('locked'))).toEqual([true, true]);
    env.dance = 'result';
    panel.tick();
    expect(byClass(body, 'dj-yt-play').map((b) => b.classList.contains('locked'))).toEqual([false, false]);
    expect(one(body, 'dj-yt-hint').textContent).toContain('xếp cuối hàng chờ');
  });

  it('đang phát YouTube: tên video + "YouTube · kênh · người chọn", không bài có sẵn nào sáng; tiến độ', () => {
    let s: DjPublicState = {
      ...djState(DJ_RECORDED[0]!.id, true),
      bpm: DJ.youtube.bpm,
      startedAt: NOW - 30_000,
      beat0: NOW - 30_000,
      yt: now(10, { title: 'Sơn Tùng M-TP — Lạc Trôi', author: '' }),
    };
    const { panel, body } = openDj(() => s);
    expect(one(body, 'dj-title').textContent).toBe('Sơn Tùng M-TP — Lạc Trôi');
    expect(one(body, 'dj-meta').textContent).toBe('YouTube · không rõ kênh · A chọn');
    expect(byClass(body, 'dj-song').filter((b) => b.classList.contains('on'))).toHaveLength(0);
    const time = one(body, 'dj-time');
    expect(time.textContent).toBe('Đang lấy thời lượng…');
    s = { ...s, yt: { ...s.yt!, durationMs: 200_000 } };
    panel.render();
    panel.tick();
    expect(time.textContent).toBe('0:30 / 3:20');
    s = { ...s, yt: { ...s.yt!, live: true } };
    panel.render();
    panel.tick();
    expect(time.textContent).toBe('● TRỰC TIẾP');
    s = { ...s, startedAt: NOW + 2000, yt: { ...s.yt!, live: false } };
    panel.render();
    panel.tick();
    expect(time.textContent).toBe('Sắp vào bài…');
    s = { ...s, playing: false, pausedAtMs: 12_000 };
    panel.render();
    panel.tick();
    expect(time.textContent).toBe('Đã dừng');
    // Về nhạc có sẵn: bài đang phát sáng lại.
    s = { ...djState(DJ_RECORDED[1]!.id, true) };
    panel.render();
    expect(byClass(body, 'dj-song').filter((b) => b.classList.contains('on'))).toHaveLength(1);
    expect(one(body, 'dj-title').textContent).toBe(DJ_RECORDED[1]!.name);
  });

  it('gợi ý dưới ô dán: hết "đang kiểm tra" khi server nhận link (video vào hàng chờ); hàng chờ đầy thì báo', () => {
    let s: DjPublicState = { ...djState(DJ_RECORDED[0]!.id, true), yt: now(10) };
    const { panel, body } = openDj(() => s);
    const hint = one(body, 'dj-yt-hint');
    expect(hint.textContent).toContain('xếp cuối hàng chờ');
    const input = one(body, 'dj-yt-input');
    input.value = 'https://youtu.be/kJQP7kiw5Fk';
    click(one(body, 'dj-yt-add'));
    expect(hint.textContent).toBe('Đang kiểm tra link…');
    panel.render();
    expect(hint.textContent).toBe('Đang kiểm tra link…');
    s = { ...s, ytQueue: [item(11)] };
    panel.render();
    expect(hint.textContent).toContain('xếp cuối hàng chờ');
    s = { ...s, ytQueue: Array.from({ length: DJ.youtube.queueMax }, (_, i) => item(20 + i)) };
    panel.render();
    expect(hint.textContent).toContain('đầy');
    expect(hint.classList.contains('bad')).toBe(true);
  });
});
