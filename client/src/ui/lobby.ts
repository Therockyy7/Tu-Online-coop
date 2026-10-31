// Sảnh vào game: tranh chùa trên núi lúc bình minh (SVG + CSS động), nhập tên, chọn chùa chung / mã / tạo mới.
import { ROOM } from '@shared/index';
import type { LobbyOptions, LobbyRequest } from './api';
import { button, h } from './dom';

const SCENE_SVG = `
<svg class="lobby-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="lb-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7cc6ea"/>
      <stop offset="0.45" stop-color="#bfe3f2"/>
      <stop offset="0.75" stop-color="#ffe2b8"/>
      <stop offset="1" stop-color="#ffc98f"/>
    </linearGradient>
    <radialGradient id="lb-sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6d6"/>
      <stop offset="0.35" stop-color="#ffe39a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffd38a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="lb-m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb9cf"/><stop offset="1" stop-color="#c9d9e2"/></linearGradient>
    <linearGradient id="lb-m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f9a8c"/><stop offset="1" stop-color="#9dbfae"/></linearGradient>
    <linearGradient id="lb-m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c7a52"/><stop offset="1" stop-color="#6c9a5e"/></linearGradient>
    <linearGradient id="lb-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0573e"/><stop offset="1" stop-color="#8e3a28"/></linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#lb-sky)"/>
  <circle cx="1180" cy="360" r="260" fill="url(#lb-sun)"/>
  <circle cx="1180" cy="360" r="58" fill="#fff4cf"/>
  <path d="M0 560 L120 470 L230 520 L380 400 L520 500 L640 440 L780 520 L930 410 L1080 500 L1230 430 L1380 510 L1500 450 L1600 500 L1600 900 L0 900Z" fill="url(#lb-m1)" opacity="0.85"/>
  <path d="M0 640 L160 560 L300 620 L470 520 L620 610 L760 560 L900 630 L1060 540 L1220 620 L1380 560 L1600 630 L1600 900 L0 900Z" fill="url(#lb-m2)"/>
  <g class="lobby-temple" transform="translate(300 470)">
    <path d="M-30 180 Q120 120 260 175 L260 260 L-30 260Z" fill="#5b8a4c"/>
    <rect x="40" y="96" width="150" height="70" fill="#f3d58f"/>
    <rect x="58" y="110" width="16" height="56" fill="#a8432f"/><rect x="156" y="110" width="16" height="56" fill="#a8432f"/>
    <rect x="98" y="118" width="34" height="48" fill="#6e3b26"/>
    <path d="M10 100 Q115 70 220 100 L200 82 Q115 40 30 82Z" fill="url(#lb-roof)"/>
    <path d="M10 100 L-4 86 M220 100 L234 86" stroke="#7a3324" stroke-width="6" stroke-linecap="round"/>
    <rect x="62" y="44" width="106" height="34" fill="#f3d58f"/>
    <path d="M40 50 Q115 22 190 50 L176 36 Q115 0 54 36Z" fill="url(#lb-roof)"/>
    <path d="M40 50 L28 38 M190 50 L202 38" stroke="#7a3324" stroke-width="5" stroke-linecap="round"/>
    <circle cx="115" cy="12" r="6" fill="#ffd166"/>
    <circle class="lobby-glow" cx="115" cy="140" r="9" fill="#ffd27a"/>
  </g>
  <path d="M0 720 L200 650 L380 700 L560 640 L760 720 L980 660 L1180 730 L1400 670 L1600 720 L1600 900 L0 900Z" fill="url(#lb-m3)"/>
  <g fill="#3d6a43">
    <path d="M90 700 l22 -70 l22 70z"/><path d="M128 708 l18 -56 l18 56z"/><path d="M1420 690 l24 -76 l24 76z"/><path d="M1462 700 l18 -58 l18 58z"/>
    <path d="M760 716 l16 -50 l16 50z"/><path d="M1240 724 l20 -62 l20 62z"/>
  </g>
  <g class="lobby-clouds" fill="#ffffff" opacity="0.9">
    <g class="cloud c1"><ellipse cx="200" cy="170" rx="90" ry="26"/><ellipse cx="250" cy="150" rx="60" ry="30"/><ellipse cx="160" cy="158" rx="46" ry="22"/></g>
    <g class="cloud c2"><ellipse cx="900" cy="120" rx="110" ry="28"/><ellipse cx="960" cy="98" rx="70" ry="32"/><ellipse cx="850" cy="108" rx="52" ry="22"/></g>
    <g class="cloud c3"><ellipse cx="1400" cy="230" rx="80" ry="22"/><ellipse cx="1440" cy="212" rx="50" ry="24"/></g>
  </g>
</svg>`;

export class Lobby {
  private el: HTMLDivElement | null = null;
  private nameInput!: HTMLInputElement;
  private codeInput!: HTMLInputElement;
  private errorEl!: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private resolve: ((r: LobbyRequest) => void) | null = null;

  constructor(private readonly root: HTMLElement) {}

  show(opts: LobbyOptions): Promise<LobbyRequest> {
    if (!this.el) this.render(opts);
    this.setBusy(false, opts.error);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private submit(req: Omit<LobbyRequest, 'name'>): void {
    if (!this.resolve) return;
    const r = this.resolve;
    this.resolve = null;
    r({ name: this.nameInput.value, ...req });
  }

  private render(opts: LobbyOptions): void {
    const el = h('div', 'lobby interactive');
    el.innerHTML = SCENE_SVG;
    const petals = h('div', 'lobby-petals', '', el);
    for (let i = 0; i < 18; i++) {
      const p = h('i', '', '', petals);
      p.style.left = `${(i * 53) % 100}%`;
      p.style.animationDelay = `${(i * 0.9) % 9}s`;
      p.style.animationDuration = `${8 + ((i * 7) % 6)}s`;
    }
    const lanterns = h('div', 'lobby-lanterns', '', el);
    for (let i = 0; i < 7; i++) {
      const l = h('i', '', '', lanterns);
      l.style.left = `${8 + i * 13}%`;
      l.style.animationDelay = `${i * 2.1}s`;
      l.style.animationDuration = `${16 + (i % 3) * 4}s`;
    }

    const card = h('div', 'lobby-card', '', el);
    const logo = h('div', 'lobby-logo', '', card);
    h('span', 'logo-tu', 'Tu', logo);
    h('span', 'logo-online', 'Online', logo);
    h('div', 'lobby-tagline', 'Vào chùa tích Công Đức · Hạ sơn xả nghiệp cùng hội bạn', card);

    const form = h('form', 'lobby-form', '', card);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit({ room: ROOM.publicCode, create: false });
    });
    const nameRow = h('label', 'field', '', form);
    h('span', 'field-label', 'Pháp danh của bạn', nameRow);
    this.nameInput = h('input', 'input', '', nameRow);
    this.nameInput.maxLength = 16;
    this.nameInput.placeholder = 'Ví dụ: Tiểu Bảo';
    this.nameInput.setAttribute('autocomplete', 'nickname');
    this.nameInput.value = opts.defaultName;

    const main = button(`Vào Chùa Chung (${ROOM.publicCode})`, 'btn-primary btn-big', () => this.submit({ room: ROOM.publicCode, create: false }), form);
    main.type = 'submit';

    const codeRow = h('div', 'code-row', '', form);
    this.codeInput = h('input', 'input code-input', '', codeRow);
    this.codeInput.maxLength = ROOM.codeLength;
    this.codeInput.placeholder = 'MÃ';
    this.codeInput.value = opts.defaultRoom && opts.defaultRoom !== ROOM.publicCode ? opts.defaultRoom : '';
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit({ room: this.codeInput.value.trim().toUpperCase(), create: false });
      }
    });
    const joinCode = button('Vào bằng mã', 'btn-secondary', () => this.submit({ room: this.codeInput.value.trim().toUpperCase(), create: false }), codeRow);
    const create = button('✨ Tạo chùa mới cho hội bạn', 'btn-ghost', () => this.submit({ room: null, create: true }), form);
    this.buttons = [main, joinCode, create];

    this.errorEl = h('div', 'lobby-error', '', form);
    const help = h('div', 'lobby-help', '', card);
    for (const [k, t] of [
      ['Chuột', 'nhìn'],
      ['WASD', 'đi'],
      ['E', 'tương tác'],
      ['Q', 'bỏ đồ'],
      ['1–8', 'emote'],
      ['Enter', 'chat'],
      ['V', 'góc nhìn'],
      ['H', 'menu Phương Trượng'],
    ]) {
      const s = h('span', '', '', help);
      h('kbd', 'key', k, s);
      s.append(` ${t}`);
    }
    h('div', 'lobby-foot', 'Chơi tốt nhất trên máy tính · Trò chuyện thoại qua Discord', el);
    this.root.append(el);
    this.el = el;
    setTimeout(() => (this.nameInput.value ? this.codeInput : this.nameInput).focus(), 50);
  }

  setBusy(busy: boolean, error?: string): void {
    if (!this.el) return;
    for (const b of this.buttons) b.disabled = busy;
    this.el.classList.toggle('busy', busy);
    this.errorEl.textContent = busy ? 'Đang gõ cửa chùa…' : (error ?? '');
    this.errorEl.classList.toggle('info', busy);
  }

  hide(): void {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    this.resolve = null;
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 450);
  }
}
