// Lớp giao diện HTML/CSS phủ trên canvas 3D: sảnh, HUD, chat, emote, bảng/hộp chọn, toast, banner,
// menu Phương Trượng, cài đặt, hiệu ứng toàn màn hình. Cài đặt hợp đồng UIApi.
import './ui.css';
import type { Tone } from '@shared/index';
import type { HostMenuItem, UIApi, UIGameContext } from './api';
import { ChatBox } from './chat';
import { h, renderKeyLabel } from './dom';
import { openHostMenu } from './hostMenu';
import { Hud } from './hud';
import { Lobby } from './lobby';
import { Modals } from './modals';
import { openSettings } from './settingsPanel';

interface BannerItem {
  title: string;
  sub?: string;
  tone: Tone;
  big: boolean;
}

export function createUI(root: HTMLElement): UIApi {
  const lobby = new Lobby(root);
  const fxLayer = h('div', 'screen-fx', '', root);
  const drunkLayer = h('div', 'drunk-veil', '', fxLayer);
  const auraLayer = h('div', 'aura', '', fxLayer);
  const flashLayer = h('div', 'flash', '', fxLayer);
  const crosshair = h('div', 'crosshair', '', root);
  h('i', '', '', crosshair);
  const pointerHint = h('div', 'pointer-hint', '', root);
  h('span', 'pointer-hint-icon', '🖱️', pointerHint);
  h('span', '', 'Bấm vào màn hình để điều khiển', pointerHint);
  const countdown = h('div', 'countdown', '', root);
  const bannerEl = h('div', 'banner', '', root);
  const toasts = h('div', 'toasts', '', root);
  const modals = new Modals(root);
  const hostProviders = new Set<() => HostMenuItem[]>();

  let hud: Hud | null = null;
  let chat: ChatBox | null = null;
  let game: UIGameContext | null = null;
  let promptText: string | null = null;
  let tabDown = false;

  // ── Banner xếp hàng, mỗi cái ~2,8 giây ──
  const bannerQueue: BannerItem[] = [];
  let bannerBusy = false;
  const nextBanner = () => {
    const b = bannerQueue.shift();
    if (!b) {
      bannerBusy = false;
      return;
    }
    bannerBusy = true;
    bannerEl.replaceChildren();
    bannerEl.className = `banner tone-${b.tone} ${b.big ? 'big' : ''}`;
    h('div', 'banner-title', b.title, bannerEl);
    if (b.sub) h('div', 'banner-sub', b.sub, bannerEl);
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    setTimeout(() => {
      bannerEl.classList.remove('show');
      setTimeout(nextBanner, 380);
    }, b.big ? 3000 : 2300);
  };

  // ── Phím riêng của UI: Enter mở chat, giữ Tab xem bảng người chơi ──
  const onKeyDown = (e: KeyboardEvent) => {
    if (!game || !chat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !modals.open) {
      e.preventDefault();
      chat.open();
    } else if (e.code === 'Tab') {
      e.preventDefault();
      if (!tabDown) {
        tabDown = true;
        hud?.setBoard(true);
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Tab') {
      tabDown = false;
      hud?.setBoard(false);
    }
  };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', () => hud?.setBoard(false));

  const api: UIApi = {
    root,

    showLobby: (opts) => lobby.show(opts),
    setLobbyBusy: (busy, error) => lobby.setBusy(busy, error),
    hideLobby: () => lobby.hide(),

    mountGame(ctx) {
      api.unmountGame();
      game = ctx;
      hud = new Hud(root, ctx, {
        openSettings: () => openSettings(modals, ctx, (t, tone) => api.toast(t, tone)),
        toast: (t, tone) => api.toast(t, tone),
      });
      chat = new ChatBox(root, ctx.state, (text) => ctx.actions.chat(text));
      root.classList.add('in-game');
    },

    unmountGame() {
      modals.closeAll();
      hud?.dispose();
      chat?.dispose();
      hud = null;
      chat = null;
      game = null;
      promptText = null;
      root.classList.remove('in-game');
      api.setCrosshair('hidden');
      api.setPointerHint(false);
      api.setCountdown(null);
      api.screenFx.setDrunk(0);
      api.screenFx.setAura(null);
    },

    toast(text, tone = 'info') {
      const t = h('div', `toast tone-${tone}`, '', toasts);
      h('span', 'toast-text', text, t);
      while (toasts.childElementCount > 5) toasts.firstElementChild?.remove();
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 3400);
    },

    banner(title, sub, tone = 'gold', big = false) {
      bannerQueue.push({ title, sub, tone, big });
      if (bannerQueue.length > 4) bannerQueue.shift();
      if (!bannerBusy) nextBanner();
    },

    setPrompt(text) {
      if (text === promptText || !hud) return;
      promptText = text;
      const el = hud.promptEl;
      if (text) renderKeyLabel(el, text);
      el.classList.toggle('show', !!text);
    },

    setCrosshair(mode) {
      crosshair.className = `crosshair ${mode}`;
    },

    setPointerHint(show) {
      pointerHint.classList.toggle('show', show && !!game);
    },

    setCountdown(text) {
      countdown.textContent = text ?? '';
      countdown.classList.toggle('show', !!text);
    },

    openPanel: (opts) => modals.openPanel(opts),
    openOverlay: (id) => modals.openOverlay(id, root),
    choose: (opts) => modals.choose(opts),
    confirm: (title, message) => modals.confirm(title, message),
    lightbox: (opts) => modals.lightbox(opts),

    registerHostMenuItems(provider) {
      hostProviders.add(provider);
      return () => hostProviders.delete(provider);
    },

    openHostMenu() {
      if (!game) return;
      openHostMenu(modals, game, () => [...hostProviders].flatMap((p) => p()), (t, tone) => api.toast(t, tone));
    },

    isTyping: () => {
      const a = document.activeElement;
      return (a instanceof HTMLInputElement && a.type !== 'range' && a.type !== 'checkbox') || a instanceof HTMLTextAreaElement;
    },
    isModalOpen: () => modals.open,
    closeTopModal: () => modals.closeTop(),

    screenFx: {
      setDrunk(level) {
        const k = Math.max(0, Math.min(1, (level - 30) / 70));
        root.style.setProperty('--drunk', k.toFixed(3));
        drunkLayer.classList.toggle('on', k > 0);
        document.body.classList.toggle('drunk', k > 0);
        document.body.style.setProperty('--drunk', k.toFixed(3));
      },
      flash(color) {
        flashLayer.style.background = color;
        flashLayer.classList.remove('go');
        void flashLayer.offsetWidth;
        flashLayer.classList.add('go');
      },
      setAura(color) {
        auraLayer.style.setProperty('--aura', color ?? 'transparent');
        auraLayer.classList.toggle('on', !!color);
      },
    },
  };
  api.setCrosshair('hidden');
  return api;
}
