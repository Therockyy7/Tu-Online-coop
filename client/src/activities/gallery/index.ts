// Điện Tăng Đoàn (spec 7.13): đứng ở bồ đoàn trước khám thờ bấm E = quỳ xuống (server giữ chỗ). Đang quỳ: Space = lạy
// (đủ PORTRAIT_BOW.bowsPerRite lạy = 1 lễ, có Công Đức), F = xem ảnh lớn, E / Esc = đứng dậy.
// Khung hình điện ảnh: mắt hạ thấp, ngẩng nhìn chân dung, thu hẹp góc nhìn, viền đen trên dưới.
import { PORTRAIT_BOW, TANG_DOAN, type StationDef } from '@shared/index';
import type { GalleryBowEvent, GalleryOpenData, GalleryPublicState } from '@shared/activities/temple';
import { GALLERY_PHOTOS, PORTRAIT_CENTER_Y, galleryPhotoById } from '../../content/gallery';
import type { OverlayHandle } from '../../ui/api';
import { fmtClock, h } from '../../ui/dom';
import type { ActivityClientModule, ClientActivityContext } from '../types';

/** Mắt khi quỳ (khớp EYE.kneel của engine) và góc nhìn điện ảnh khi quỳ. */
const KNEEL_EYE = 0.75;
const KNEEL_FOV = 60;

interface KneelUi {
  station: StationDef;
  overlay: OverlayHandle;
  dots: HTMLElement[];
  sub: HTMLElement;
  bows: number;
  readyAt: number;
  /** Lạy đang diễn ra tới lúc này (performance.now); 0 = đang quỳ thẳng. */
  bowUntil: number;
  /** Lễ vừa xong: giữ đủ hạt sáng tới lúc này rồi xóa về 0. */
  clearAt: number;
  nextSubAt: number;
}
let kneel: KneelUi | null = null;

function photoIndex(station: StationDef): number {
  return Math.max(
    0,
    GALLERY_PHOTOS.findIndex((p) => p.id === station.data?.photo),
  );
}

function renderDots(k: KneelUi): void {
  k.dots.forEach((d, i) => d.classList.toggle('on', i < k.bows));
}

function renderSub(k: KneelUi, ctx: ClientActivityContext): void {
  const left = k.readyAt - ctx.serverNow();
  k.sub.textContent =
    left > 0
      ? `Chân dung này đã nhận lễ — Công Đức hồi sau ${fmtClock(left)} (vẫn lạy được cho tâm an)`
      : `Lạy đủ ${PORTRAIT_BOW.bowsPerRite} lạy thành 1 lễ: +Công Đức, bớt Tạp Niệm`;
}

function cleanup(ctx: ClientActivityContext): void {
  if (!kneel) return;
  kneel.overlay.close();
  kneel = null;
  ctx.lockMovement(false);
  ctx.setLocalAnim(null);
  ctx.setFov(null);
}

export const galleryClient: ActivityClientModule = {
  id: 'gallery',
  maps: ['temple'],

  prompt(station, ctx) {
    if (station.kind !== 'portrait') return undefined;
    if (kneel) return null;
    const who = ctx.publicState<GalleryPublicState>()?.seats[station.id];
    if (who && who !== ctx.me()?.pid) return 'Có người đang quỳ lạy';
    const photo = galleryPhotoById(String(station.data?.photo ?? ''));
    return photo?.caption ? `Quỳ lạy chân dung ${photo.caption}` : 'Quỳ lạy chân dung';
  },

  onOpen(data, ctx) {
    const d = data as GalleryOpenData;
    const station = ctx.world.map.stations.find((s) => s.id === d.stationId);
    if (!station) return;
    cleanup(ctx);
    ctx.snapTo(station.x, station.z);
    // Ngẩng nhìn tâm chân dung (bớt chút để thấy cả nến, bình sen phía dưới).
    ctx.faceTo(station.ry, Math.atan2(PORTRAIT_CENTER_Y - KNEEL_EYE, TANG_DOAN.kneelOff - 0.1) - 0.06);
    ctx.setFov(KNEEL_FOV);
    ctx.lockMovement(true);
    ctx.setLocalAnim('kneel');
    ctx.audio.play('whoosh', { volume: 0.25 });
    const overlay = ctx.ui.openOverlay('gallery');
    overlay.el.classList.add('cine-bars');
    const root = h('div', 'act-hud gallery-hud', '', overlay.el);
    const photo = GALLERY_PHOTOS[photoIndex(station)];
    h('div', 'act-title', photo?.caption ? `🙏 ${photo.caption}` : '🙏 Chân dung Tăng Đoàn', root);
    const row = h('div', 'gallery-bows', '', root);
    const dots = Array.from({ length: PORTRAIT_BOW.bowsPerRite }, () => h('span', 'gallery-bow', '', row));
    const sub = h('div', 'act-sub', '', root);
    h('div', 'act-hint', 'Space: lạy · F: xem ảnh lớn · E / Esc: đứng dậy', root);
    kneel = { station, overlay, dots, sub, bows: d.bows, readyAt: d.readyAt, bowUntil: 0, clearAt: 0, nextSubAt: 0 };
    renderDots(kneel);
    renderSub(kneel, ctx);
  },

  onKey(e, down, ctx) {
    const k = kneel;
    if (!k) return false;
    const mine = ['Space', 'KeyF', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
    if (!down || e.repeat) return mine;
    if (e.code === 'Space') {
      if (k.bowUntil) return true;
      k.bowUntil = performance.now() + PORTRAIT_BOW.bowMs;
      ctx.setLocalAnim('prostrate');
      ctx.send('bow');
      ctx.audio.play('mo', { volume: 0.22 });
      return true;
    }
    if (e.code === 'KeyF') {
      ctx.audio.play('click', { volume: 0.6 });
      ctx.ui.lightbox({ images: GALLERY_PHOTOS.map((p) => ({ url: p.url, caption: p.caption || undefined })), index: photoIndex(k.station) });
      return true;
    }
    if (e.code === 'KeyE') {
      ctx.send('stand');
      return true;
    }
    return mine;
  },

  onEvent(type, data, ctx) {
    const k = kneel;
    if (type !== 'bowed' || !k) return;
    const ev = data as GalleryBowEvent;
    k.readyAt = ev.readyAt;
    k.bows = ev.rite ? PORTRAIT_BOW.bowsPerRite : ev.bows;
    k.clearAt = ev.rite ? performance.now() + 1100 : 0;
    renderDots(k);
    renderSub(k, ctx);
    if (ev.rite && ev.karma > 0) {
      // Cánh sen + ánh sáng tỏa ra trước khám thờ, chân dung bừng sáng.
      const fx = k.station.x + Math.sin(k.station.ry) * (TANG_DOAN.kneelOff - 0.4);
      const fz = k.station.z + Math.cos(k.station.ry) * (TANG_DOAN.kneelOff - 0.4);
      ctx.world.burst(fx, fz, 'petals', 26);
      ctx.world.burst(fx, fz, 'sparkle', 18);
      ctx.world.controls.pulsePortrait?.(String(k.station.data?.photo ?? ''));
    }
  },

  update(_dt, ctx) {
    const k = kneel;
    if (!k) return;
    const now = performance.now();
    if (k.bowUntil && now >= k.bowUntil) {
      k.bowUntil = 0;
      ctx.setLocalAnim('kneel');
    }
    if (k.clearAt && now >= k.clearAt) {
      k.clearAt = 0;
      k.bows = 0;
      renderDots(k);
    }
    if (k.readyAt > 0 && now >= k.nextSubAt) {
      k.nextSubAt = now + 500;
      renderSub(k, ctx);
    }
  },

  onClose(_reason, ctx) {
    cleanup(ctx);
  },

  unmount(ctx) {
    cleanup(ctx);
  },
};
