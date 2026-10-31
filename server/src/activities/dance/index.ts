// Thi nhảy (spec 8.3): DJ/Phương Trượng mở vòng (15 giây chờ), vòng bắt đầu ở ranh ô nhịp của bài DJ đang phát,
// 16 ô nhịp; mỗi ô nhập chuỗi mũi tên rồi Space đúng phách 4. Cuối vòng xếp hạng, thưởng Xu, người nhất thành DJ.
import { z } from 'zod';
import { DANCE, DJ, type Judgement, type Pid } from '@shared/index';
import { arrowCount, judgeDanceHit, measureScore, type DancePublicState } from '@shared/activities/dance';
import { nextMeasureAt } from '@shared/activities/dj';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

const measureMsg = z.object({ i: z.number().int().min(0).max(64), ok: z.boolean(), t: z.number() });
const RESULT_MS = 7000;

interface Dancer {
  pid: Pid;
  name: string;
  score: number;
  streak: number;
  last: Judgement | null;
  done: Set<number>;
}

function create(ctx: ActivityContext): ActivityInstance {
  let phase: DancePublicState['phase'] = 'idle';
  let lobbyEndsAt = 0;
  let startAt = 0;
  let bpm = DJ.tracks[0]!.bpm;
  let seed = 1;
  let results: DancePublicState['results'] = [];
  const dancers = new Map<Pid, Dancer>();
  let finalized = -1;
  let cancel: (() => void) | null = null;

  const measureMs = () => (60_000 / bpm) * 4;

  const publish = () => {
    const s: DancePublicState = {
      phase,
      lobbyEndsAt,
      startAt,
      bpm,
      seed,
      measures: DANCE.measures,
      players: [...dancers.values()].map((d) => ({ pid: d.pid, name: d.name, score: d.score, streak: d.streak, last: d.last })),
      results,
    };
    ctx.setState(s);
  };

  const djTimeline = () => {
    const track = DJ.tracks[ctx.shared.get('dj_track')] ?? DJ.tracks[0]!;
    return { bpm: track.bpm, startedAt: ctx.shared.get('dj_started_at') };
  };

  const canOpen = (p: ServerPlayerView) => p.isHost || ctx.djPid() === p.pid;

  function openLobby(p: ServerPlayerView): void {
    if (phase !== 'idle') return ctx.toast(p.pid, 'Đang có vòng nhảy rồi.', 'warn');
    phase = 'lobby';
    lobbyEndsAt = ctx.now() + DANCE.lobbyMs;
    dancers.clear();
    results = [];
    seed = ctx.rng.int(1, 2 ** 30);
    publish();
    ctx.fx({ type: 'banner', title: '💃 Mở vòng nhảy!', sub: 'Lên sàn LED bấm E để tham gia (15 giây)', tone: 'gold', big: true });
    ctx.fx({ type: 'sound', id: 'airhorn' });
    cancel = ctx.setTimeout(startRound, DANCE.lobbyMs);
  }

  function join(p: ServerPlayerView): void {
    if (dancers.has(p.pid)) return;
    if (dancers.size >= DANCE.maxPlayers) return ctx.toast(p.pid, 'Sàn đã đủ 10 người.', 'warn');
    dancers.set(p.pid, { pid: p.pid, name: p.name, score: 0, streak: 0, last: null, done: new Set() });
    ctx.open(p.pid, { seed });
    publish();
  }

  function startRound(): void {
    if (dancers.size === 0) {
      phase = 'idle';
      publish();
      ctx.chatSystem('Vòng nhảy bị hủy vì không ai lên sàn.');
      return;
    }
    const tl = djTimeline();
    bpm = tl.bpm;
    startAt = nextMeasureAt({ startedAt: tl.startedAt, bpm }, ctx.now() + 1500);
    phase = 'playing';
    finalized = -1;
    // Báo cho DJ: tới mốc này không được đổi bài (nhạc phải khớp nhịp đang chấm điểm).
    ctx.shared.set('dance_until', startAt + DANCE.measures * measureMs() + 500);
    publish();
  }

  function finalizeMeasure(i: number): void {
    if (i < DANCE.introMeasures) return;
    for (const d of dancers.values()) {
      if (d.done.has(i)) continue;
      d.done.add(i);
      d.streak = 0;
      d.last = 'miss';
    }
  }

  function finish(): void {
    const ranked = [...dancers.values()].sort((a, b) => b.score - a.score);
    results = ranked.map((d, idx) => ({ pid: d.pid, name: d.name, score: d.score, xu: DANCE.rewards[idx] ?? DANCE.rewardOthers }));
    for (const r of results) {
      ctx.addXu(r.pid, r.xu);
      ctx.addTapNiem(r.pid, DANCE.tapNiem);
      ctx.close(r.pid, 'done');
    }
    phase = 'result';
    publish();
    const win = results[0];
    if (win) {
      ctx.setDj(win.pid);
      ctx.fx({ type: 'banner', title: `🏆 ${win.name} thắng vòng nhảy!`, sub: `${win.score} điểm · trở thành DJ chiếm sóng`, tone: 'gold', big: true });
      ctx.fx({ type: 'confetti' });
      ctx.fx({ type: 'sound', id: 'cheer' });
      ctx.chatSystem(`🏆 Kết quả nhảy: ${results.map((r, i) => `${i + 1}. ${r.name} (${r.score})`).join(' · ')}`);
    }
    cancel = ctx.setTimeout(() => {
      phase = 'idle';
      dancers.clear();
      publish();
    }, RESULT_MS);
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'dance_floor') return;
      if (phase === 'idle') {
        if (canOpen(p)) {
          openLobby(p);
          // Đang đứng trên sàn bấm E để mở → vào luôn, khỏi phải bấm E lần nữa.
          join(p);
        } else ctx.toast(p.pid, 'Chờ DJ (hoặc Phương Trượng) mở vòng nhảy nhé.', 'info');
      } else if (phase === 'lobby') {
        join(p);
      } else {
        ctx.toast(p.pid, 'Vòng nhảy đang diễn ra, đợi vòng sau nha.', 'info');
      }
    },

    onHostAction(p, action) {
      if (action === 'open') openLobby(p);
    },

    onAction(p, type, data) {
      if (type === 'open') {
        if (canOpen(p)) openLobby(p);
        return;
      }
      if (type !== 'measure' || phase !== 'playing') return;
      const d = dancers.get(p.pid);
      const r = measureMsg.safeParse(data);
      if (!d || !r.success) return;
      const { i, ok, t } = r.data;
      if (i < DANCE.introMeasures || i >= DANCE.measures || d.done.has(i) || i <= finalized) return;
      const mMs = measureMs();
      const beat4 = startAt + i * mMs + (mMs * 3) / 4;
      const now = ctx.now();
      const tt = Math.min(t, now);
      const j: Judgement = ok && now - tt < 1500 ? judgeDanceHit(tt - beat4) : 'miss';
      d.done.add(i);
      d.streak = j === 'perfect' ? d.streak + 1 : 0;
      d.last = j;
      d.score += measureScore(j, arrowCount(i), d.streak);
      publish();
    },

    onLeave(p) {
      if (!dancers.has(p.pid)) return;
      dancers.delete(p.pid);
      if (p.activity === 'dance') ctx.close(p.pid, 'esc');
      publish();
    },

    tick(_dt, now) {
      if (phase !== 'playing') return;
      const mMs = measureMs();
      const current = Math.floor((now - startAt - 400) / mMs);
      while (finalized < current && finalized < DANCE.measures - 1) {
        finalized++;
        finalizeMeasure(finalized);
        publish();
      }
      if (now > startAt + DANCE.measures * mMs + 500) finish();
    },

    isBusy: () => phase === 'lobby' || phase === 'playing',

    onMapChange() {
      cancel?.();
      for (const pid of dancers.keys()) ctx.close(pid, 'map');
      dancers.clear();
      phase = 'idle';
      ctx.shared.set('dance_until', 0);
      publish();
    },

    dispose() {
      cancel?.();
    },
  };
}

export const danceModule: ActivityServerModule = { id: 'dance', maps: ['bar'], create };
