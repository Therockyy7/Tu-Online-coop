// DJ Chiếm Sóng — phía client: cả quán phát bài theo mốc nhịp của server, đèn/sàn LED nháy mỗi phách,
// Drop! / còi hú; DJ mở bàn DJ để đổi bài, đổi màu đèn.
import { DJ, type DjTrackId } from '@shared/index';
import { LIGHT_THEMES, beatIndexAt, type DjPublicState, type LightTheme } from '@shared/activities/dj';
import type { PanelHandle } from '../../ui/api';
import type { ActivityClientModule, ClientActivityContext } from '../types';

const THEME_LABEL: Record<LightTheme, [string, string]> = {
  neon: ['Neon', 'linear-gradient(135deg,#ff4fd8,#3ef2ff)'],
  gold: ['Vàng son', 'linear-gradient(135deg,#ffd166,#ff9f43)'],
  ocean: ['Đại dương', 'linear-gradient(135deg,#3ef2ff,#2f7bff)'],
  fire: ['Lửa', 'linear-gradient(135deg,#ff3b30,#ffd60a)'],
};

let state: DjPublicState | null = null;
let lastBeat = -1;
let lastDrop = 0;
let lastHorn = 0;
let panel: PanelHandle | null = null;

function playTrack(ctx: ClientActivityContext): void {
  if (!state) return;
  ctx.audio.startBeatTrack(state.trackId, state.startedAt, state.bpm);
  ctx.world.controls.setLightTheme?.(state.theme);
}

function renderPanel(ctx: ClientActivityContext): void {
  if (!panel || panel.closed || !state) return;
  const b = panel.body;
  b.replaceChildren();
  const mk = (tag: string, cls: string, text = '') => {
    const e = document.createElement(tag);
    e.className = cls;
    e.textContent = text;
    return e;
  };
  b.append(mk('div', 'dj-sub', 'Chọn bài cho cả quán'));
  const tracks = mk('div', 'dj-tracks');
  for (const t of DJ.tracks) {
    const btn = mk('button', `dj-track ${t.id === state.trackId ? 'on' : ''}`) as HTMLButtonElement;
    btn.append(mk('b', '', t.name), mk('span', '', `${t.bpm} BPM`));
    btn.onclick = () => ctx.send('track', { id: t.id as DjTrackId });
    tracks.append(btn);
  }
  b.append(tracks);
  const row = mk('div', 'dj-row');
  const drop = mk('button', 'dj-big drop', '💥 DROP!') as HTMLButtonElement;
  drop.onclick = () => ctx.send('drop');
  const horn = mk('button', 'dj-big horn', '📯 Còi hú') as HTMLButtonElement;
  horn.onclick = () => ctx.send('horn');
  row.append(drop, horn);
  b.append(row, mk('div', 'dj-sub', 'Màu đèn'));
  const themes = mk('div', 'dj-themes');
  for (const th of LIGHT_THEMES) {
    const btn = mk('button', `dj-theme ${th === state.theme ? 'on' : ''}`, THEME_LABEL[th][0]) as HTMLButtonElement;
    btn.style.background = THEME_LABEL[th][1];
    btn.onclick = () => ctx.send('theme', { theme: th });
    themes.append(btn);
  }
  b.append(themes, mk('div', 'dj-hint', 'Mở vòng nhảy: bấm E trên sàn LED · Esc để đóng bàn DJ'));
}

export const djClient: ActivityClientModule = {
  id: 'dj',
  maps: ['bar'],

  mount(ctx) {
    lastBeat = -1;
    if (state) playTrack(ctx);
  },

  unmount(ctx) {
    ctx.audio.stopBeatTrack();
    panel?.close();
    panel = null;
  },

  prompt(station, ctx) {
    if (station.kind !== 'dj_booth') return undefined;
    const djPid = ctx.state.room.djPid;
    const me = ctx.me();
    if (djPid && djPid === me?.pid) return 'Bàn DJ (bạn đang làm DJ)';
    const name = djPid ? ctx.state.player(djPid)?.name : null;
    return name ? `Bàn DJ — DJ ${name}` : me?.isHost ? 'Bàn DJ (Phương Trượng tạm làm DJ)' : 'Bàn DJ';
  },

  onState(s, ctx) {
    const prev = state;
    state = s as DjPublicState;
    if (!prev || prev.trackId !== state.trackId || prev.startedAt !== state.startedAt || prev.bpm !== state.bpm) {
      lastBeat = -1;
      playTrack(ctx);
    } else if (prev.theme !== state.theme) {
      ctx.world.controls.setLightTheme?.(state.theme);
    }
    if (state.dropAt && state.dropAt !== lastDrop) {
      if (lastDrop !== 0 || ctx.serverNow() - state.dropAt < 2000) {
        ctx.world.controls.drop?.();
        ctx.audio.djDrop();
        ctx.world.shake(0.6);
        ctx.ui.screenFx.flash('#ffffff');
      }
      lastDrop = state.dropAt;
    }
    if (state.hornAt && state.hornAt !== lastHorn) {
      if (lastHorn !== 0 || ctx.serverNow() - state.hornAt < 2000) ctx.audio.play('airhorn', { volume: 0.7 });
      lastHorn = state.hornAt;
    }
    renderPanel(ctx);
  },

  onOpen(data, ctx) {
    state = data as DjPublicState;
    panel?.close();
    panel = ctx.ui.openPanel({
      id: 'dj',
      title: '🎧 Bàn DJ — Chiếm Sóng',
      width: 520,
      className: 'dj-panel',
      onClose: () => {
        panel = null;
        ctx.send('close');
      },
    });
    ctx.setLocalAnim('dj');
    renderPanel(ctx);
  },

  onClose(_reason, ctx) {
    ctx.setLocalAnim(null);
    const p = panel;
    panel = null;
    p?.close();
  },

  update(_dt, ctx) {
    if (!state) return;
    const beat = beatIndexAt(state, ctx.serverNow());
    if (beat !== lastBeat && beat >= 0) {
      lastBeat = beat;
      ctx.world.controls.onBeat?.(beat, state.bpm);
    }
  },
};
