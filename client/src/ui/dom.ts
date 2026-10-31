// Tiện ích DOM nhỏ cho lớp giao diện. Mọi chữ từ người chơi đều đi qua textContent (không chèn HTML).

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent?.append(e);
  return e;
}

export function button(label: string, cls: string, onClick: () => void, parent?: HTMLElement): HTMLButtonElement {
  const b = h('button', `btn ${cls}`.trim(), label, parent);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

const nf = new Intl.NumberFormat('vi-VN');
export const fmt = (n: number): string => nf.format(Math.round(n));

/** mm:ss */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Hiện chuỗi "[E] Lấy chổi" thành phím + nhãn. */
export function renderKeyLabel(el: HTMLElement, text: string): void {
  el.replaceChildren();
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(text);
  if (m) {
    h('kbd', 'key', m[1], el);
    h('span', '', m[2], el);
  } else {
    h('span', '', text, el);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', '', '', document.body);
    ta.value = text;
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
