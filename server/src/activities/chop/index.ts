// Chẻ củi (spec 7.2) — mini-game cá nhân mẫu: chiếm thớt, 8 khúc gỗ, kim chạy qua lại, Space để bổ.
// Server sinh tham số từng khúc và tự chấm theo thời điểm bấm (giờ server) → client không gian lận được điểm.
import { z } from 'zod';
import { CHOP, JOKES, type Pid, type StationDef } from '@shared/index';
import {
  chopJudge,
  type ChopDoneEvent,
  type ChopLog,
  type ChopLogEvent,
  type ChopOpenData,
  type ChopPublicState,
  type ChopResult,
  type ChopResultEvent,
} from '@shared/activities/chop';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

interface Session {
  pid: Pid;
  stationId: string;
  index: number;
  log: ChopLog | null;
  judged: boolean;
  stats: Record<ChopResult, number>;
  cancelTimer: (() => void) | null;
}

const chopMsg = z.object({ index: z.number().int().min(0).max(100), t: z.number().finite() });

/** Thời gian chờ tối đa cho 1 khúc = số chu kỳ kim. */
const LOG_TIMEOUT_PERIODS = 3;
/** Độ trễ trước khi kim bắt đầu chạy (để client kịp nhận tham số). */
const LOG_LEAD_MS = 350;

function create(ctx: ActivityContext): ActivityInstance {
  const sessions = new Map<Pid, Session>();
  const blocks: Record<string, Pid | null> = {};

  const publish = () => {
    const state: ChopPublicState = { blocks: { ...blocks }, firewood: ctx.shared.get('firewood') };
    ctx.setState(state);
  };

  const others = (pid: Pid) => ctx.players().filter((p) => p.pid !== pid && p.connected).map((p) => p.pid);

  function end(s: Session, reason: string) {
    s.cancelTimer?.();
    sessions.delete(s.pid);
    if (blocks[s.stationId] === s.pid) blocks[s.stationId] = null;
    ctx.close(s.pid, reason);
    publish();
  }

  function nextLog(s: Session) {
    if (s.index >= CHOP.logs) {
      const { perfect, good, miss } = s.stats;
      const done: ChopDoneEvent = { perfect, good, miss };
      ctx.emit('done', done, s.pid);
      ctx.toast(s.pid, `Chẻ xong ${CHOP.logs} khúc: ${perfect} hoàn hảo, ${good} tốt, ${miss} trượt.`, 'good');
      end(s, 'done');
      return;
    }
    const period = Math.max(CHOP.minPeriodMs, CHOP.basePeriodMs - s.index * CHOP.periodStepMs);
    const half = CHOP.greenWidth / 2;
    const log: ChopLog = {
      index: s.index,
      center: ctx.rng.range(half + 0.05, 1 - half - 0.05),
      period,
      t0: ctx.now() + LOG_LEAD_MS,
    };
    s.log = log;
    s.judged = false;
    const ev: ChopLogEvent = { ...log, green: CHOP.greenWidth, perfect: CHOP.perfectWidth, total: CHOP.logs };
    ctx.emit('log', ev, s.pid);
    s.cancelTimer?.();
    s.cancelTimer = ctx.setTimeout(() => judge(s, null), LOG_LEAD_MS + period * LOG_TIMEOUT_PERIODS);
  }

  function judge(s: Session, t: number | null) {
    if (!s.log || s.judged) return;
    s.judged = true;
    s.cancelTimer?.();
    s.cancelTimer = null;
    const result: ChopResult = t === null ? 'miss' : chopJudge(s.log, t, CHOP.judgeSlackMs);
    s.stats[result]++;
    let firewood = ctx.shared.get('firewood');
    if (result !== 'miss') {
      ctx.reward(s.pid, result === 'perfect' ? CHOP.rewardPerfect : CHOP.rewardGood, { label: 'Chẻ củi' });
      firewood = ctx.shared.add('firewood', CHOP.firewoodPerHit, 0, CHOP.firewoodMax);
    }
    // Người chẻ đã tự phát âm ngay lúc bấm; chỉ gửi cho người khác nghe.
    const chopper = ctx.player(s.pid);
    ctx.fx(
      { type: 'sound', id: result === 'miss' ? 'chop_miss' : 'chop', x: chopper?.x, z: chopper?.z },
      others(s.pid),
    );
    const ev: ChopResultEvent = { index: s.log.index, result, firewood };
    ctx.emit('result', ev, s.pid);
    publish();
    s.index++;
    s.cancelTimer = ctx.setTimeout(() => nextLog(s), CHOP.logGapMs);
  }

  publish();

  return {
    onInteract(p: ServerPlayerView, station: StationDef) {
      if (station.kind !== 'chop_block') return;
      if (sessions.has(p.pid)) return;
      const occupant = blocks[station.id];
      if (occupant && occupant !== p.pid) {
        ctx.toast(p.pid, JOKES.stationBusy, 'warn');
        return;
      }
      if (p.held) {
        ctx.toast(p.pid, JOKES.handsFull, 'warn');
        return;
      }
      const s: Session = {
        pid: p.pid,
        stationId: station.id,
        index: 0,
        log: null,
        judged: true,
        stats: { perfect: 0, good: 0, miss: 0 },
        cancelTimer: null,
      };
      sessions.set(p.pid, s);
      blocks[station.id] = p.pid;
      const open: ChopOpenData = { stationId: station.id, total: CHOP.logs };
      ctx.open(p.pid, open);
      publish();
      s.cancelTimer = ctx.setTimeout(() => nextLog(s), 600);
    },

    onAction(p, type, data) {
      if (type !== 'chop') return;
      const s = sessions.get(p.pid);
      const parsed = chopMsg.safeParse(data);
      if (!s || !s.log || !parsed.success || parsed.data.index !== s.log.index) return;
      // Thời điểm bấm theo giờ server do client ước lượng — chặn giá trị vô lý (tương lai / quá cũ).
      const now = ctx.now();
      const t = Math.min(parsed.data.t, now);
      if (now - t > 1500 || t < s.log.t0 - CHOP.judgeSlackMs) return judge(s, null);
      judge(s, t);
    },

    onLeave(p) {
      const s = sessions.get(p.pid);
      if (s) end(s, 'esc');
    },

    onMapChange() {
      for (const s of [...sessions.values()]) end(s, 'map');
    },

    dispose() {
      for (const s of sessions.values()) s.cancelTimer?.();
      sessions.clear();
    },
  };
}

export const chopModule: ActivityServerModule = {
  id: 'chop',
  maps: ['temple'],
  create,
};
