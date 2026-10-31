// Đại Pháp Đường (server): ngồi bồ đoàn nghe kinh. Bấm E ở bồ đoàn → ngồi (giữ chỗ); `stand` / Esc / đổi map → đứng dậy,
// trả bồ đoàn. Nhạc kinh phát ở client theo giờ server nên cả phòng nghe cùng một đoạn — server chỉ giữ chỗ ngồi.
// Chỉ ngồi nghe: không thưởng Công Đức, không đổi Tạp Niệm.
import { JOKES, type Pid } from '@shared/index';
import type { SutraOpenData, SutraPublicState } from '@shared/activities/temple';
import type { ActivityContext, ActivityInstance, ActivityServerModule } from '../types';

/** Bao lâu kiểm lại chỗ ngồi một lần (ms) — tick chạy 20 lần/giây, kiểm thưa vậy là đủ. */
const CHECK_EVERY_MS = 1000;
/** Vừa ngồi xuống thì client còn đang lướt vào giữa bồ đoàn (ms) — chưa kiểm vị trí để khỏi đuổi nhầm. */
const SETTLE_MS = 2000;
/** Nới bán kính bồ đoàn khi kiểm người còn ngồi đó không. */
const SEAT_SLACK = 0.8;

interface SitSession {
  stationId: string;
  /** Giờ server lúc ngồi xuống. */
  since: number;
}

function createSutra(ctx: ActivityContext): ActivityInstance {
  /** stationId → pid người đang ngồi. */
  const seats = new Map<string, Pid>();
  const sessions = new Map<Pid, SitSession>();
  let checkAcc = 0;
  const publish = () => ctx.setState({ seats: Object.fromEntries(seats) } satisfies SutraPublicState);
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
      if (station.kind !== 'sutra_cushion' || sessions.has(p.pid)) return;
      if (seats.has(station.id)) return ctx.toast(p.pid, 'Bồ đoàn này có người ngồi rồi, chọn chỗ khác nhé.', 'warn');
      if (p.held) return ctx.toast(p.pid, JOKES.handsFull, 'warn');
      seats.set(station.id, p.pid);
      sessions.set(p.pid, { stationId: station.id, since: ctx.now() });
      ctx.open(p.pid, { stationId: station.id } satisfies SutraOpenData);
      publish();
    },
    onAction(p, type) {
      if (type === 'stand') end(p.pid, 'done');
    },
    onLeave(p) {
      end(p.pid, 'esc');
    },
    tick(dt, now) {
      if (sessions.size === 0) return;
      checkAcc += dt;
      if (checkAcc < CHECK_EVERY_MS) return;
      checkAcc = 0;
      // Người đang ngồi bị khóa di chuyển ở client — lệch khỏi bồ đoàn chỉ có thể do dịch chuyển / lệch đồng bộ.
      // Không còn mở Đại Pháp Đường (bị đóng ở đường khác) cũng trả chỗ, tránh bồ đoàn "ma" giữ mãi.
      for (const [pid, s] of [...sessions]) {
        if (now - s.since < SETTLE_MS) continue;
        if (ctx.player(pid)?.activity !== ctx.id || !ctx.isNear(pid, s.stationId, SEAT_SLACK)) end(pid, 'moved');
      }
    },
    onMapChange() {
      for (const pid of [...sessions.keys()]) end(pid, 'map');
    },
  };
}

export const sutraModule: ActivityServerModule = { id: 'sutra', maps: ['temple'], create: createSutra };
