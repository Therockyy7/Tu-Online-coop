// Bảng (panel), hộp chọn nhanh, hộp xác nhận, xem ảnh to — xếp chồng; Esc đóng cái trên cùng.
import type {
  ChooseOptions,
  LightboxOptions,
  OverlayHandle,
  PanelHandle,
  PanelOptions,
} from './api';
import { button, h } from './dom';

interface Modal {
  close(): void;
  closable: boolean;
}

export class Modals {
  private readonly stack: Modal[] = [];
  private readonly layer: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.layer = h('div', 'modal-layer', '', root);
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  closeTop(): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const m = this.stack[i]!;
      if (m.closable) {
        m.close();
        return true;
      }
    }
    return false;
  }

  closeAll(): void {
    for (const m of [...this.stack].reverse()) m.close();
  }

  private push(m: Modal): void {
    this.stack.push(m);
    this.layer.classList.add('has-modal');
  }

  private pop(m: Modal): void {
    const i = this.stack.indexOf(m);
    if (i >= 0) this.stack.splice(i, 1);
    if (!this.stack.length) this.layer.classList.remove('has-modal');
  }

  openPanel(opts: PanelOptions): PanelHandle {
    const pos = opts.position ?? 'center';
    const wrap = h('div', `panel-wrap pos-${pos}`, '', this.layer);
    const el = h('div', `panel interactive ${opts.className ?? ''}`.trim(), '', wrap);
    el.style.width = `min(${opts.width ?? 420}px, calc(100vw - 32px))`;
    el.dataset.panel = opts.id;
    const head = h('div', 'panel-head', '', el);
    const title = h('div', 'panel-title', opts.title, head);
    const closable = opts.closable ?? true;
    const body = h('div', 'panel-body', '', el);
    let closed = false;
    const modal: Modal = {
      closable,
      close: () => {
        if (closed) return;
        closed = true;
        this.pop(modal);
        wrap.classList.add('leaving');
        setTimeout(() => wrap.remove(), 180);
        opts.onClose?.();
      },
    };
    if (closable) button('✕', 'panel-close', () => modal.close(), head).title = 'Đóng (Esc)';
    this.push(modal);
    return {
      el,
      body,
      get closed() {
        return closed;
      },
      setTitle: (t) => {
        title.textContent = t;
      },
      close: () => modal.close(),
    };
  }

  openOverlay(id: string, root: HTMLElement): OverlayHandle {
    const el = h('div', 'overlay', '', root);
    el.dataset.overlay = id;
    return { el, close: () => el.remove() };
  }

  choose<T extends string>(opts: ChooseOptions<T>): Promise<T | null> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: T | null) => {
        if (done) return;
        done = true;
        removeEventListener('keydown', onKey, true);
        resolve(v);
        panel.close();
      };
      const panel = this.openPanel({
        id: 'choose',
        title: opts.title,
        width: opts.options.length > 4 ? 560 : 440,
        className: 'choose-panel',
        onClose: () => finish(null),
      });
      const grid = h('div', 'choose-grid', '', panel.body);
      opts.options.forEach((o, i) => {
        const b = h('button', `choose-opt ${o.disabled ? 'disabled' : ''}`, '', grid);
        b.type = 'button';
        b.disabled = !!o.disabled;
        if (i < 9) h('span', 'choose-num', String(i + 1), b);
        if (o.icon) h('span', 'choose-icon', o.icon, b);
        const txt = h('span', 'choose-text', '', b);
        h('span', 'choose-label', o.label, txt);
        if (o.sub) h('span', 'choose-sub', o.sub, txt);
        b.addEventListener('click', () => finish(o.value));
      });
      const onKey = (e: KeyboardEvent) => {
        // Đang gõ chat: chữ số là chữ, không phải lựa chọn.
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const m = /^Digit([1-9])$/.exec(e.code) ?? /^Numpad([1-9])$/.exec(e.code);
        if (!m) return;
        const o = opts.options[Number(m[1]) - 1];
        if (o && !o.disabled) {
          e.preventDefault();
          e.stopPropagation();
          finish(o.value);
        }
      };
      addEventListener('keydown', onKey, true);
      if (opts.signal?.aborted) finish(null);
      else opts.signal?.addEventListener('abort', () => finish(null), { once: true });
    });
  }

  confirm(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        resolve(v);
        panel.close();
      };
      const panel = this.openPanel({ id: 'confirm', title, width: 400, onClose: () => finish(false) });
      h('p', 'confirm-msg', message, panel.body);
      const row = h('div', 'btn-row', '', panel.body);
      button('Thôi', 'btn-ghost', () => finish(false), row);
      button('Đồng ý', 'btn-primary', () => finish(true), row).focus();
    });
  }

  lightbox(opts: LightboxOptions): void {
    let index = Math.max(0, Math.min(opts.images.length - 1, opts.index));
    const wrap = h('div', 'lightbox interactive', '', this.layer);
    const frame = h('div', 'lightbox-frame', '', wrap);
    const img = h('img', 'lightbox-img', '', frame);
    img.alt = '';
    const cap = h('div', 'lightbox-caption', '', frame);
    const count = h('div', 'lightbox-count', '', wrap);
    const prev = button('‹', 'lightbox-nav prev', () => go(-1), wrap);
    const next = button('›', 'lightbox-nav next', () => go(1), wrap);
    button('✕', 'lightbox-close', () => modal.close(), wrap);
    h('div', 'lightbox-hint', '← → chuyển ảnh · Esc đóng', wrap);
    const render = () => {
      const im = opts.images[index]!;
      img.classList.remove('show');
      img.onload = () => img.classList.add('show');
      img.src = im.url;
      cap.textContent = im.caption ?? '';
      cap.style.display = im.caption ? '' : 'none';
      count.textContent = `${index + 1} / ${opts.images.length}`;
      prev.style.visibility = opts.images.length > 1 ? '' : 'hidden';
      next.style.visibility = opts.images.length > 1 ? '' : 'hidden';
    };
    const go = (d: number) => {
      index = (index + d + opts.images.length) % opts.images.length;
      render();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') go(-1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') go(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) modal.close();
    });
    let closed = false;
    const modal: Modal = {
      closable: true,
      close: () => {
        if (closed) return;
        closed = true;
        removeEventListener('keydown', onKey, true);
        this.pop(modal);
        wrap.classList.add('leaving');
        setTimeout(() => wrap.remove(), 200);
        opts.onClose?.();
      },
    };
    this.push(modal);
    render();
  }
}
