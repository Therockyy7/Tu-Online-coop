// Điện Tăng Đoàn (server): đảnh lễ chân dung Sư Thầy. Bấm E ở bồ đoàn trước chân dung → quỳ (giữ chỗ); mỗi `bow` = 1
// lạy; đủ PORTRAIT_BOW.bowsPerRite lạy liền nhau = 1 lễ → Công Đức + bớt Tạp Niệm (client cho bóc quẻ sau mỗi lễ, kể cả
// khi Công Đức đang hồi). Mỗi người, mỗi chân dung có thời gian hồi Công Đức riêng.
import { JOKES, PORTRAIT_BOW, type Pid } from '@shared/index';
import type { GalleryBowEvent, GalleryOpenData, GalleryPublicState } from '@shared/activities/temple';
import type { ActivityContext, ActivityInstance, ActivityServerModule } from '../types';

interface KneelSession {
  stationId: string;
  bows: number;
  lastBowAt: number;
}

function createGallery(ctx: ActivityContext): ActivityInstance {
  const seats = new Map<string, Pid>();
  const sessions = new Map<Pid, KneelSession>();
  /** `${pid}|${stationId}` → giờ server được thưởng lại. */
  const readyAt = new Map<string, number>();
  const publish = () => ctx.setState({ seats: Object.fromEntries(seats) } satisfies GalleryPublicState);
  const end = (pid: Pid, reason: string) => {
    const s = sessions.get(pid);
    if (!s) return;
    sessions.delete(pid);
    if (seats.get(s.stationId) === pid) seats.delete(s.stationId);
    ctx.close(pid, reason);
    publish();
  };
  publish();
  return {
    onInteract(p, station) {
      if (station.kind !== 'portrait' || sessions.has(p.pid)) return;
      if (seats.has(station.id)) return ctx.toast(p.pid, 'Có người đang đảnh lễ ở đây rồi, chờ chút nhé.', 'warn');
      if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
      seats.set(station.id, p.pid);
      sessions.set(p.pid, { stationId: station.id, bows: 0, lastBowAt: 0 });
      const open: GalleryOpenData = { stationId: station.id, bows: 0, readyAt: readyAt.get(`${p.pid}|${station.id}`) ?? 0 };
      ctx.open(p.pid, open);
      publish();
    },
    onAction(p, type) {
      const s = sessions.get(p.pid);
      if (!s) return;
      if (type === 'stand') return end(p.pid, 'done');
      if (type !== 'bow') return;
      const now = ctx.now();
      if (now - s.lastBowAt < PORTRAIT_BOW.minIntervalMs) return;
      if (!ctx.isNear(p.pid, s.stationId, 0.6)) return end(p.pid, 'moved');
      s.lastBowAt = now;
      s.bows++;
      const key = `${p.pid}|${s.stationId}`;
      const rite = s.bows >= PORTRAIT_BOW.bowsPerRite;
      let karma = 0;
      if (rite) {
        s.bows = 0;
        if (now >= (readyAt.get(key) ?? 0)) {
          karma = ctx.reward(p.pid, PORTRAIT_BOW.reward, { label: 'Lễ Tăng Đoàn' });
          ctx.addTapNiem(p.pid, PORTRAIT_BOW.tapNiem);
          readyAt.set(key, now + PORTRAIT_BOW.cooldownMs);
          ctx.fx({ type: 'sound', id: 'bell_small', x: p.x, z: p.z });
        } else {
          ctx.toast(p.pid, 'Lòng thành đã tỏ — Công Đức ở chân dung này để lần sau, quẻ thì con cứ bóc nhé.', 'info');
        }
      }
      const ev: GalleryBowEvent = { bows: s.bows, rite, karma, readyAt: readyAt.get(key) ?? 0 };
      ctx.emit('bowed', ev, p.pid);
    },
    onLeave(p) {
      end(p.pid, 'esc');
    },
    onMapChange() {
      for (const pid of [...sessions.keys()]) end(pid, 'map');
    },
  };
}

export const galleryModule: ActivityServerModule = { id: 'gallery', maps: ['temple'], create: createGallery };
