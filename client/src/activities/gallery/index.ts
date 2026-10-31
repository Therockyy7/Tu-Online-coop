// Điện Tăng Đoàn (spec 7.13) — điện tuyên dương chư Tăng: mỗi chân dung là một vị Sư Thầy (bạn bè trong nhóm, đều còn
// đang tu học) được vinh danh ở một lĩnh vực (content/fortunes/domains.ts). Đứng ở bồ đoàn trước chân dung bấm E = quỳ
// xuống (server giữ chỗ). Đang quỳ: Space = lạy (đủ PORTRAIT_BOW.bowsPerRite lạy = 1 lễ, có Công Đức), sau mỗi lễ
// Q = bóc quẻ — lá quẻ lời khuyên đúng lĩnh vực của vị Sư Thầy đó (rút ở client, chỉ mình thấy; lễ chưa bóc thì dồn lại,
// tối đa MAX_DRAWS lá); F = xem ảnh lớn, E / Esc = đứng dậy (đang mở lá quẻ thì Space / E / Esc / Q cất quẻ trước).
// Khung hình điện ảnh: mắt hạ thấp, ngẩng nhìn chân dung, thu hẹp góc nhìn, viền đen trên dưới.
import { PORTRAIT_BOW, TANG_DOAN, type StationDef } from '@shared/index';
import type { GalleryBowEvent, GalleryOpenData, GalleryPublicState } from '@shared/activities/temple';
import { domainOfPhoto, drawSlip, type FortuneDomain, type FortuneLevel } from '../../content/fortunes';
import { GALLERY_PHOTOS, PORTRAIT_CENTER_Y, galleryPhotoById } from '../../content/gallery';
import type { OverlayHandle } from '../../ui/api';
import { fmtClock, h } from '../../ui/dom';
import type { ActivityClientModule, ClientActivityContext } from '../types';

/** Mắt khi quỳ (khớp EYE.kneel của engine) và góc nhìn điện ảnh khi quỳ. */
const KNEEL_EYE = 0.75;
const KNEEL_FOV = 60;
/** Lạy liền nhiều lễ chưa bóc quẻ thì được dồn tối đa chừng này lá. */
const MAX_DRAWS = 3;
/** Lớp CSS theo mức quẻ (màu dấu mức trên lá quẻ). */
const LEVEL_CLASS: Record<FortuneLevel, string> = {
  'Đại Cát': 'lv-dai',
  'Thượng Cát': 'lv-thuong',
  'Trung Cát': 'lv-trung',
  'Tiểu Cát': 'lv-tieu',
  'Trung Bình': 'lv-binh',
};

interface KneelUi {
  station: StationDef;
  /** Lĩnh vực lời khuyên của vị Sư Thầy ở chân dung này (theo ảnh). */
  domain: FortuneDomain | undefined;
  overlay: OverlayHandle;
  dots: HTMLElement[];
  sub: HTMLElement;
  hint: HTMLElement;
  bows: number;
  readyAt: number;
  /** Lạy đang diễn ra tới lúc này (performance.now); 0 = đang quỳ thẳng. */
  bowUntil: number;
  /** Lễ vừa xong: giữ đủ hạt sáng tới lúc này rồi xóa về 0. */
  clearAt: number;
  nextSubAt: number;
  /** Số lá còn được bóc: mỗi lễ thêm một lá (dồn tối đa MAX_DRAWS), mỗi lần bóc trừ một. */
  draws: number;
  /** Lá quẻ đang mở trên màn hình. */
  slip: HTMLElement | null;
  /** Dòng nhắc tạm thời (vd "lạy đủ rồi mới bóc quẻ") hiện tới lúc này rồi trả dòng phụ thường. */
  noteUntil: number;
}
let kneel: KneelUi | null = null;

/** Tên vị Sư Thầy ở chân dung: chú thích ảnh nếu có, không thì "Sư Thầy". */
function teacherName(station: StationDef): string {
  const caption = galleryPhotoById(String(station.data?.photo ?? ''))?.caption;
  return caption ? `Sư Thầy ${caption}` : 'Sư Thầy';
}

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
  k.hint.classList.toggle('ready', k.draws > 0);
  if (performance.now() < k.noteUntil) return;
  const left = k.readyAt - ctx.serverNow();
  const topic = k.domain ? ` về ${k.domain.short}` : '';
  k.sub.textContent =
    k.draws > 0
      ? `Lễ đã thành — bấm Q bóc quẻ xin lời khuyên${topic}${k.draws > 1 ? ` (còn ${k.draws} lá)` : ''}`
      : left > 0
        ? `Đã nhận lễ — Công Đức hồi sau ${fmtClock(left)}; lạy đủ ${PORTRAIT_BOW.bowsPerRite} lạy vẫn bóc được quẻ`
        : `Lạy đủ ${PORTRAIT_BOW.bowsPerRite} lạy thành 1 lễ (+Công Đức, bớt Tạp Niệm) rồi bóc quẻ xin lời khuyên${topic}`;
}

/** Dòng nhắc ngắn thay dòng phụ trong chốc lát. */
function note(k: KneelUi, text: string): void {
  k.noteUntil = performance.now() + 2200;
  k.nextSubAt = k.noteUntil;
  k.sub.textContent = text;
}

/** Cất lá quẻ đang mở (nếu có) và hiện lại HUD quỳ. */
function closeSlip(k: KneelUi): boolean {
  if (!k.slip) return false;
  k.slip.remove();
  k.slip = null;
  k.overlay.el.classList.remove('has-slip');
  return true;
}

/** Bóc một lá quẻ của lĩnh vực chân dung này và mở lên giữa màn hình. */
function openSlip(k: KneelUi, ctx: ClientActivityContext): void {
  const domain = k.domain;
  const drawn = domain ? drawSlip(domain.id) : null;
  if (!domain || !drawn) {
    note(k, 'Ống quẻ của vị Sư Thầy này đang trống — con quay lại sau nhé.');
    return;
  }
  k.draws--;
  renderSub(k, ctx);
  closeSlip(k);
  const { slip, number } = drawn;
  const card = h('div', 'fortune-slip', '', k.overlay.el);
  card.style.setProperty('--accent', domain.color);
  const head = h('div', 'fs-head', '', card);
  h('span', 'fs-icon', domain.icon, head);
  h('span', 'fs-domain', domain.title, head);
  const meta = h('div', 'fs-meta', '', card);
  h('span', 'fs-no', `Quẻ số ${number}`, meta);
  h('span', `fs-level ${LEVEL_CLASS[slip.level]}`, slip.level, meta);
  h('span', 'fs-topic', slip.topic, meta);
  h('div', 'fs-title', slip.title, card);
  const verse = h('div', 'fs-verse', '', card);
  for (const line of slip.verse) h('div', '', line, verse);
  h('div', 'fs-advice', slip.advice, card);
  h('div', 'fs-sign', `— Lời khuyên của ${teacherName(k.station)} —`, card);
  h(
    'div',
    'fs-hint',
    k.draws > 0
      ? `Space / Esc: cất quẻ · còn ${k.draws} lá chờ bóc`
      : `Space / Esc: cất quẻ · lạy thêm ${PORTRAIT_BOW.bowsPerRite} lạy để bóc lá mới`,
    card,
  );
  k.slip = card;
  // HUD quỳ nằm ngay dưới lá quẻ (màn thấp thì chạm nhau) — ẩn đi tới khi cất quẻ.
  k.overlay.el.classList.add('has-slip');
  ctx.audio.play('whoosh', { volume: 0.3 });
  ctx.audio.play('bell_small', { volume: 0.16 });
  // Ánh sáng lấp lánh trên kệ ống quẻ trước chân dung.
  const fx = k.station.x + Math.sin(k.station.ry) * (TANG_DOAN.kneelOff - 0.45);
  const fz = k.station.z + Math.cos(k.station.ry) * (TANG_DOAN.kneelOff - 0.45);
  ctx.world.burst(fx, fz, 'sparkle', 12);
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
    if (who && who !== ctx.me()?.pid) return 'Có người đang đảnh lễ';
    const domain = domainOfPhoto(String(station.data?.photo ?? ''));
    return `Đảnh lễ ${teacherName(station)}${domain ? ` · xin quẻ ${domain.short}` : ''}`;
  },

  onOpen(data, ctx) {
    const d = data as GalleryOpenData;
    const station = ctx.world.map.stations.find((s) => s.id === d.stationId);
    if (!station) return;
    cleanup(ctx);
    ctx.snapTo(station.x, station.z);
    // Ngẩng nhìn tâm chân dung (bớt chút để thấy cả bảng lĩnh vực phía dưới).
    ctx.faceTo(station.ry, Math.atan2(PORTRAIT_CENTER_Y - KNEEL_EYE, TANG_DOAN.kneelOff - 0.1) - 0.06);
    ctx.setFov(KNEEL_FOV);
    ctx.lockMovement(true);
    ctx.setLocalAnim('kneel');
    ctx.audio.play('whoosh', { volume: 0.25 });
    const overlay = ctx.ui.openOverlay('gallery');
    overlay.el.classList.add('cine-bars');
    const root = h('div', 'act-hud gallery-hud', '', overlay.el);
    const domain = domainOfPhoto(String(station.data?.photo ?? ''));
    h('div', 'act-title', `🙏 ${teacherName(station)}`, root);
    if (domain) h('div', 'gallery-domain', `${domain.icon} ${domain.title} · ${domain.motto}`, root);
    const row = h('div', 'gallery-bows', '', root);
    const dots = Array.from({ length: PORTRAIT_BOW.bowsPerRite }, () => h('span', 'gallery-bow', '', row));
    const sub = h('div', 'act-sub', '', root);
    const hint = h('div', 'act-hint', 'Space: lạy · Q: bóc quẻ · F: xem ảnh lớn · E / Esc: đứng dậy', root);
    kneel = {
      station,
      domain,
      overlay,
      dots,
      sub,
      hint,
      bows: d.bows,
      readyAt: d.readyAt,
      bowUntil: 0,
      clearAt: 0,
      nextSubAt: 0,
      draws: 0,
      slip: null,
      noteUntil: 0,
    };
    renderDots(kneel);
    renderSub(kneel, ctx);
  },

  onKey(e, down, ctx) {
    const k = kneel;
    if (!k) return false;
    const mine = ['Space', 'KeyF', 'KeyE', 'KeyQ', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code);
    // Đang mở lá quẻ: Space / E / Esc / Q chỉ cất quẻ (không lạy, không đứng dậy, không rời điện).
    if (k.slip && ['Space', 'KeyE', 'Escape', 'KeyQ'].includes(e.code)) {
      if (down && !e.repeat) {
        closeSlip(k);
        ctx.audio.play('click', { volume: 0.4 });
      }
      return true;
    }
    if (!down || e.repeat) return mine;
    if (e.code === 'KeyQ') {
      if (k.draws > 0) openSlip(k, ctx);
      else note(k, k.bowUntil || k.bows > 0 ? 'Lạy cho đủ lễ đã con, rồi hẵng bóc quẻ.' : `Lạy đủ ${PORTRAIT_BOW.bowsPerRite} lạy thành 1 lễ rồi mới bóc quẻ nhé.`);
      return true;
    }
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
    // Mỗi lễ (kể cả khi Công Đức đang hồi) được bóc một lá quẻ; lễ vừa thành thì bỏ dòng nhắc tạm để hiện "bấm Q" ngay.
    if (ev.rite) {
      k.draws = Math.min(MAX_DRAWS, k.draws + 1);
      k.noteUntil = 0;
    }
    renderDots(k);
    renderSub(k, ctx);
    if (ev.rite && ev.karma > 0) {
      // Cánh sen + ánh sáng tỏa ra trước chân dung, chân dung bừng sáng.
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
    // Đếm giờ hồi Công Đức, hoặc trả dòng phụ thường sau khi dòng nhắc tạm hết hạn.
    if ((k.readyAt > 0 || k.noteUntil > 0) && now >= k.nextSubAt) {
      k.nextSubAt = now + 500;
      if (k.noteUntil > 0 && now >= k.noteUntil) k.noteUntil = 0;
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
