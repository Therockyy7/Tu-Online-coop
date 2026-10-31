// Co-op ở Chùa (server): Công phu tụng kinh — gõ mõ đồng điệu (7.7) và Thỉnh Đại Hồng Chung (7.8).
import { z } from 'zod';
import { BELL, CHANT, rankAtLeast, rankIndex, type Judgement, type Pid } from '@shared/index';
import {
  bellPower,
  bellQuality,
  chantChart,
  chantFinalizeAt,
  chantHoldBroken,
  matchChantPress,
  type BellPublicState,
  type ChantChart,
  type ChantKey,
  type ChantPublicState,
} from '@shared/activities/coop';
import type { ActivityContext, ActivityInstance, ActivityServerModule, ServerPlayerView } from '../types';

// ───────────────────────── Tụng kinh gõ mõ ─────────────────────────

const chooseMsg = z.object({ sutra: z.string().max(32), tempo: z.number() });
/** Bấm / thả phím: t = giờ server ước lượng ở client lúc bấm, k = phím (0 ← 1 ↑ 2 → 3 ↓ 4 Khánh). */
const keyMsg = z.object({ t: z.number(), k: z.number().int().min(0).max(4) });
const RESULT_MS = 5000;

interface Chanter {
  pid: Pid;
  name: string;
  cushion: string;
  hits: Map<number, Judgement>;
  /** Nốt ngân đã ăn đầu nốt → mốc thả phím (ms từ đầu bài), null = vẫn đang giữ. */
  holds: Map<number, number | null>;
  stray: boolean;
  perfect: number;
  good: number;
  points: number;
}

function createChant(ctx: ActivityContext): ActivityInstance {
  const s: ChantPublicState = { phase: 'idle', lobbyEndsAt: 0, chooserPid: null, sutraId: CHANT.sutras[0]!.id, tempo: 1, seed: 1, startAt: 0, participants: [], combo: 0, maxCombo: 0 };
  const chanters = new Map<Pid, Chanter>();
  let chart: ChantChart | null = null;
  let finalized = -1;
  let cancel: (() => void) | null = null;
  const publish = () => {
    s.participants = [...chanters.values()].map((c) => ({ pid: c.pid, name: c.name, cushion: c.cushion }));
    ctx.setState({ ...s, participants: [...s.participants] });
  };
  const eligible = (p: ServerPlayerView) => p.isHost || rankAtLeast(p.rank, CHANT.minRank);

  function pickChooser(): Pid | null {
    const senior = ctx
      .players()
      .filter((p) => p.connected && rankIndex(p.rank) >= rankIndex('dai_duc'))
      .sort((a, b) => b.congDuc - a.congDuc)[0];
    return senior?.pid ?? ctx.players().find((p) => p.isHost)?.pid ?? null;
  }

  function startLobby(p: ServerPlayerView): void {
    if (s.phase !== 'idle') return ctx.toast(p.pid, 'Đang có thời khóa tụng kinh rồi.', 'warn');
    // Người đã ngồi chờ sẵn ở bồ đoàn (khi chưa có thời khóa) được giữ lại làm người tham gia.
    for (const c of chanters.values()) {
      Object.assign(c, { hits: new Map(), holds: new Map(), stray: false, perfect: 0, good: 0, points: 0 });
    }
    Object.assign(s, { phase: 'lobby', lobbyEndsAt: ctx.now() + CHANT.lobbyMs, chooserPid: pickChooser(), sutraId: CHANT.sutras[0]!.id, tempo: 1, seed: ctx.rng.int(1, 2 ** 30), combo: 0, maxCombo: 0 });
    publish();
    ctx.fx({ type: 'sound', id: 'bell_big' });
    ctx.fx({ type: 'banner', title: '🔔 Bắt đầu thời khóa tụng kinh', sub: 'Vào Chánh Điện, ngồi bồ đoàn bấm E (20 giây)', tone: 'gold', big: true });
    ctx.chatSystem(`🔔 ${p.name} bắt đầu thời khóa tụng kinh. Từ Hòa Thượng Tập Sự trở lên vào Chánh Điện ngồi bồ đoàn!`);
    cancel = ctx.setTimeout(startPlaying, CHANT.lobbyMs);
  }

  function startPlaying(): void {
    if (chanters.size === 0) {
      s.phase = 'idle';
      publish();
      ctx.chatSystem('Thời khóa tụng kinh bị hủy vì chưa ai ngồi bồ đoàn.');
      return;
    }
    chart = chantChart(s.sutraId, s.tempo, s.seed);
    s.startAt = ctx.now() + CHANT.countdownMs;
    s.phase = 'playing';
    finalized = -1;
    publish();
    const last = chart.notes[chart.notes.length - 1];
    cancel = ctx.setTimeout(finish, CHANT.countdownMs + (last ? chantFinalizeAt(last) : 0) + 600);
  }

  function finalizeNote(i: number): void {
    if (!chart || chanters.size === 0) return;
    const note = chart.notes[i]!;
    const results: Record<string, Judgement> = {};
    const blame: Pid[] = [];
    for (const c of chanters.values()) {
      let j = c.hits.get(i) ?? 'miss';
      // Nốt ngân: thả phím sớm = đứt hơi, tính trượt.
      if (j !== 'miss' && chantHoldBroken(note, c.holds.get(i))) j = 'miss';
      c.holds.delete(i);
      results[c.pid] = j;
      if (j === 'perfect') {
        c.perfect++;
        c.points += CHANT.rewardPerfect;
      } else if (j === 'good') {
        c.good++;
        c.points += CHANT.rewardGood;
      }
      if (j === 'miss' || c.stray) blame.push(c.pid);
      c.stray = false;
      c.hits.delete(i);
    }
    if (blame.length) {
      const broke = s.combo > 0;
      if (broke) ctx.fx({ type: 'sound', id: 'bong' });
      s.combo = 0;
      ctx.emit('break', { i, blame, broke });
    } else {
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      if (s.combo % CHANT.comboForHaoQuang === 0) {
        const enough = chanters.size >= CHANT.minParticipantsForHaoQuang || ctx.players().filter((p) => p.connected).length === 1;
        if (s.combo === CHANT.comboForHaoQuang && enough) {
          ctx.addBuff('room', 'hao_quang');
          ctx.fx({ type: 'glow', target: 'chanh_dien', on: true });
          ctx.fx({ type: 'banner', title: '✨ Hào quang Chánh Điện!', sub: 'Cả chùa ×2 Công Đức trong 3 phút', tone: 'gold', big: true });
          ctx.fx({ type: 'sound', id: 'rankup' });
        } else if (s.combo > CHANT.comboForHaoQuang) {
          for (const c of chanters.values()) ctx.reward(c.pid, CHANT.bonusPer20Combo, { label: `Combo ${s.combo}` });
          if (enough) ctx.addBuff('room', 'hao_quang');
        }
      }
    }
    ctx.emit('note', { i, results, combo: s.combo });
  }

  function finish(): void {
    if (s.phase !== 'playing' || !chart) return;
    while (finalized < chart.notes.length - 1) finalizeNote(++finalized);
    const total = chart.notes.length;
    for (const c of chanters.values()) {
      const acc = (c.perfect + CHANT.goodWeight * c.good) / Math.max(1, total);
      const bonus = Math.round(acc * CHANT.endBonusMax);
      ctx.reward(c.pid, c.points + bonus, { label: `Tụng kinh ${Math.round(acc * 100)}%` });
      ctx.close(c.pid, 'done');
    }
    ctx.chatSystem(`📿 Hoàn tất thời khóa: combo cao nhất ${s.maxCombo}.`);
    s.phase = 'result';
    publish();
    cancel = ctx.setTimeout(() => {
      s.phase = 'idle';
      chanters.clear();
      publish();
    }, RESULT_MS);
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'mo_cushion') return;
      if (s.phase === 'playing' || s.phase === 'result') return ctx.toast(p.pid, 'Thời khóa đang diễn ra, chờ lượt sau nhé.', 'info');
      if (!eligible(p)) return ctx.toast(p.pid, 'Từ Hòa Thượng Tập Sự trở lên mới ngồi gõ mõ được.', 'warn');
      if (chanters.has(p.pid)) return;
      if ([...chanters.values()].some((c) => c.cushion === station.id)) return ctx.toast(p.pid, 'Bồ đoàn này có người ngồi rồi.', 'warn');
      chanters.set(p.pid, { pid: p.pid, name: p.name, cushion: station.id, hits: new Map(), holds: new Map(), stray: false, perfect: 0, good: 0, points: 0 });
      ctx.open(p.pid, { cushion: station.id });
      if (s.phase === 'idle') {
        // Chưa có thời khóa: Phương Trượng ngồi xuống là mở luôn; người khác ngồi chờ và báo cho Phương Trượng.
        if (p.isHost) return startLobby(p);
        ctx.toast(p.pid, 'Đã ngồi bồ đoàn. Chờ Phương Trượng bắt đầu thời khóa tụng kinh.', 'info');
        const host = ctx.players().find((x) => x.isHost && x.connected);
        if (host) ctx.toast(host.pid, `${p.name} đang ngồi bồ đoàn chờ tụng kinh — vào Chánh Điện ngồi bồ đoàn hoặc bấm H để bắt đầu.`, 'gold');
      }
      publish();
    },
    onAction(p, type, data) {
      if (type === 'start') {
        if (p.isHost && ctx.map() === 'temple') startLobby(p);
        return;
      }
      if (type === 'choose') {
        const r = chooseMsg.safeParse(data);
        if (!r.success || s.phase !== 'lobby' || p.pid !== s.chooserPid) return;
        if (!CHANT.sutras.some((x) => x.id === r.data.sutra) || !(CHANT.tempos as readonly number[]).includes(r.data.tempo)) return;
        s.sutraId = r.data.sutra;
        s.tempo = r.data.tempo;
        publish();
        return;
      }
      if (type === 'hit' || type === 'release') {
        const c = chanters.get(p.pid);
        const r = keyMsg.safeParse(data);
        if (!c || !r.success || s.phase !== 'playing' || !chart) return;
        const now = ctx.now();
        const t = Math.min(r.data.t, now);
        if (now - t > 1500) return;
        const rel = t - s.startAt;
        const k = r.data.k as ChantKey;
        if (type === 'release') {
          // Thả phím: chốt mốc thả cho nốt ngân (cùng phím) đang giữ.
          for (const [i, released] of c.holds) {
            if (released === null && chart.notes[i]!.key === k) {
              c.holds.set(i, rel);
              break;
            }
          }
          return;
        }
        const m = matchChantPress(chart.notes, finalized + 1, (i) => c.hits.has(i), rel, k);
        if (!m) {
          c.stray = true;
          return;
        }
        c.hits.set(m.i, m.j);
        if (m.j !== 'miss' && chart.notes[m.i]!.hold > 0) c.holds.set(m.i, null);
      }
    },
    onLeave(p) {
      if (!chanters.delete(p.pid)) return;
      if (p.activity === 'chant') ctx.close(p.pid, 'esc');
      if (s.phase === 'playing' && chanters.size === 0) {
        // Không còn ai tụng: dừng luôn, khỏi giữ trạng thái "đang bận" tới hết bài (chặn đổi map, chặn mở thời khóa mới).
        cancel?.();
        s.phase = 'idle';
        chart = null;
        ctx.chatSystem('📿 Thời khóa tụng kinh dừng sớm vì không còn ai ngồi bồ đoàn.');
      }
      publish();
    },
    tick(_dt, now) {
      if (s.phase !== 'playing' || !chart) return;
      const rel = now - s.startAt;
      while (finalized + 1 < chart.notes.length && chantFinalizeAt(chart.notes[finalized + 1]!) <= rel) {
        finalizeNote(++finalized);
      }
    },
    isBusy: () => s.phase === 'lobby' || s.phase === 'playing',
    onMapChange() {
      cancel?.();
      for (const pid of chanters.keys()) ctx.close(pid, 'map');
      chanters.clear();
      s.phase = 'idle';
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const chantModule: ActivityServerModule = { id: 'chant', maps: ['temple'], create: createChant };

// ───────────────────────── Thỉnh Đại Hồng Chung ─────────────────────────

const releaseMsg = z.object({ strike: z.number().int(), pressT: z.number(), releaseT: z.number() });

function createBell(ctx: ActivityContext): ActivityInstance {
  const s: BellPublicState = { phase: 'idle', pullers: [], countdownEndsAt: 0, strike: 0, cooldownUntil: 0 };
  const releases = new Map<Pid, { power: number; at: number }>();
  let cancel: (() => void) | null = null;
  /** Tiếng chuông hiện tại còn chờ người kéo thả tay (chưa chốt) — chặn chốt/trả thưởng 2 lần. */
  let awaiting = false;
  const publish = () => ctx.setState({ ...s, pullers: [...s.pullers] });
  const isPuller = (pid: Pid) => s.pullers.some((x) => x.pid === pid);

  function maybeCountdown(): void {
    if (s.phase === 'gathering' && s.pullers.length >= BELL.minPlayers) {
      s.phase = 'countdown';
      s.countdownEndsAt = ctx.now() + BELL.countdownMs;
      publish();
      ctx.emit('countdown', { at: s.countdownEndsAt });
      cancel = ctx.setTimeout(() => strike(1), BELL.countdownMs);
    }
  }

  function strike(n: number): void {
    s.phase = 'ringing';
    s.strike = n;
    releases.clear();
    awaiting = true;
    publish();
    ctx.emit('pull', { strike: n, at: ctx.now() }, s.pullers.map((x) => x.pid));
    cancel = ctx.setTimeout(() => resolveStrike(n), BELL.releaseTimeoutMs);
  }

  function resolveStrike(n: number): void {
    if (!awaiting || s.strike !== n || s.phase !== 'ringing') return;
    awaiting = false;
    cancel?.();
    const list = s.pullers.map((x) => {
      const r = releases.get(x.pid);
      return r ? { power: r.power, at: r.at } : { power: 0, at: null };
    });
    const q = bellQuality(list);
    const base = Math.round(BELL.rewardBase + BELL.rewardScale * q);
    for (const p of ctx.players()) {
      ctx.reward(p.pid, isPuller(p.pid) ? base * BELL.pullerMultiplier : base, { label: `Chuông ${n}`, silent: !isPuller(p.pid) });
    }
    ctx.emit('ring', { strike: n, q });
    if (n < BELL.strikes) {
      cancel = ctx.setTimeout(() => strike(n + 1), BELL.strikeGapMs);
    } else {
      for (const x of s.pullers) ctx.close(x.pid, 'done');
      s.pullers = [];
      s.phase = 'cooldown';
      s.cooldownUntil = ctx.now() + BELL.cooldownMs;
      publish();
      ctx.chatSystem('🔔 Đại Hồng Chung đã thỉnh đủ 3 tiếng. Chuông nghỉ 60 giây.');
      cancel = ctx.setTimeout(() => {
        s.phase = 'idle';
        publish();
      }, BELL.cooldownMs);
    }
  }

  publish();

  return {
    onInteract(p, station) {
      if (station.kind !== 'bell_rope') return;
      if (s.phase === 'cooldown') return ctx.toast(p.pid, `Chuông đang nghỉ ${Math.ceil((s.cooldownUntil - ctx.now()) / 1000)} giây.`, 'info');
      if (s.phase === 'ringing') return ctx.toast(p.pid, 'Đang thỉnh chuông, đợi lượt sau nhé.', 'info');
      if (isPuller(p.pid)) return;
      if (s.pullers.some((x) => x.rope === station.id)) return ctx.toast(p.pid, 'Dây này có người nắm rồi.', 'warn');
      if (s.pullers.length >= BELL.ropes) return ctx.toast(p.pid, 'Đã đủ 4 người kéo.', 'warn');
      if (s.phase === 'idle') s.phase = 'gathering';
      s.pullers.push({ pid: p.pid, name: p.name, rope: station.id });
      ctx.open(p.pid, { rope: station.id });
      publish();
      maybeCountdown();
    },
    onAction(p, type, data) {
      if (type !== 'release') return;
      const r = releaseMsg.safeParse(data);
      if (!r.success || !awaiting || s.phase !== 'ringing' || r.data.strike !== s.strike || !isPuller(p.pid) || releases.has(p.pid)) return;
      const now = ctx.now();
      const releaseT = Math.min(r.data.releaseT, now);
      const pressT = Math.min(r.data.pressT, releaseT);
      if (now - releaseT > 2500) return;
      releases.set(p.pid, { power: bellPower(pressT, releaseT), at: releaseT });
      if (releases.size >= s.pullers.length) resolveStrike(s.strike);
    },
    onLeave(p) {
      if (!isPuller(p.pid)) return;
      s.pullers = s.pullers.filter((x) => x.pid !== p.pid);
      if (p.activity === 'bell') ctx.close(p.pid, 'esc');
      if (s.pullers.length === 0 && s.phase !== 'cooldown') {
        cancel?.();
        awaiting = false;
        s.phase = 'idle';
      } else if (s.phase === 'countdown' && s.pullers.length < BELL.minPlayers) {
        cancel?.();
        s.phase = 'gathering';
      }
      publish();
    },
    isBusy: () => s.phase === 'countdown' || s.phase === 'ringing',
    onMapChange() {
      // Đang nghỉ thì giữ nguyên hẹn giờ nghỉ: đi Bar rồi về không được "lách" 60 giây nghỉ.
      if (s.phase === 'cooldown') return;
      cancel?.();
      awaiting = false;
      for (const x of s.pullers) ctx.close(x.pid, 'map');
      s.pullers = [];
      s.phase = 'idle';
      publish();
    },
    dispose() {
      cancel?.();
    },
  };
}

export const bellModule: ActivityServerModule = { id: 'bell', maps: ['temple'], create: createBell };
