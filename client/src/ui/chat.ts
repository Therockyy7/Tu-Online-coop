// Khung chat góc trái dưới: 50 dòng cuối, Enter để gõ, tin hệ thống màu vàng. Chữ luôn là text thuần.
import { NET, type ChatMsg } from '@shared/index';
import type { GameStateApi } from '../state/types';
import { h } from './dom';

export class ChatBox {
  readonly el: HTMLDivElement;
  private readonly log: HTMLDivElement;
  readonly input: HTMLInputElement;
  private readonly offs: (() => void)[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    root: HTMLElement,
    private readonly state: GameStateApi,
    private readonly send: (text: string) => void,
  ) {
    this.el = h('div', 'chat', '', root);
    this.log = h('div', 'chat-log', '', this.el);
    const row = h('div', 'chat-input-row', '', this.el);
    this.input = h('input', 'chat-input interactive', '', row);
    this.input.maxLength = NET.chatMaxLen;
    this.input.placeholder = 'Nhắn cả chùa… (Enter gửi · Esc hủy)';
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value.trim();
        if (text) this.send(text);
        this.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      e.stopPropagation();
    });
    this.input.addEventListener('blur', () => this.el.classList.remove('typing'));
    for (const m of state.chatLog()) this.add(m, false);
    this.offs.push(state.on('chat', (e) => this.add(e.msg, true)));
    this.wake();
  }

  get typing(): boolean {
    return document.activeElement === this.input;
  }

  open(): void {
    this.el.classList.add('typing');
    this.input.focus();
    this.wake();
  }

  close(): void {
    this.input.value = '';
    this.input.blur();
    this.el.classList.remove('typing');
    this.wake();
  }

  private add(m: ChatMsg, live: boolean): void {
    const line = h('div', m.pid ? 'chat-line' : 'chat-line system', '', this.log);
    if (m.pid) {
      const name = h('span', 'chat-name', `${m.name}: `, line);
      if (m.pid === this.state.me.pid) name.classList.add('me');
    }
    h('span', 'chat-text', m.text, line);
    while (this.log.childElementCount > 50) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
    if (live) this.wake();
  }

  /** Hiện rõ khung chat một lúc rồi mờ dần khi không dùng. */
  private wake(): void {
    this.el.classList.add('awake');
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.typing) this.el.classList.remove('awake');
    }, 9000);
  }

  dispose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (const off of this.offs) off();
    this.el.remove();
  }
}
