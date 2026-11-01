// Hiệu ứng bàn DJ phía client: bắn theo mốc thời gian trong trạng thái server (Drop, còi, khói CO2, đèn chớp) cho cả
// quán — chỉ khi mốc còn mới (vào quán giữa chừng không bắn lại hiệu ứng cũ). Pháo giấy do server bắn qua fx. Người
// đang ở Sòng Công Đức (phòng bên): tiếng nhỏ lại theo DJ.casinoLevel, không rung màn hình, không chớp trắng.
import { DJ, findStation } from '@shared/index';
import type { DjPublicState } from '@shared/activities/dj';
import type { ClientActivityContext } from '../types';
import { inCasino } from './music';

/** Mốc cũ hơn ngần này (ms) thì không bắn nữa. */
const FRESH_MS = 2000;
/** Khói phun ra phía trước bàn DJ (về phía sàn nhảy) ngần này mét, trải ngang ±SMOKE_SPREAD mét. */
const SMOKE_AHEAD = 3;
const SMOKE_SPREAD = 2;

const FIELDS = ['dropAt', 'hornAt', 'smokeAt', 'strobeAt'] as const;
type FxField = (typeof FIELDS)[number];

export class DjEffects {
  private readonly seen: Record<FxField, number> = { dropAt: 0, hornAt: 0, smokeAt: 0, strobeAt: 0 };

  reset(): void {
    for (const f of FIELDS) this.seen[f] = 0;
  }

  onState(s: DjPublicState, ctx: ClientActivityContext): void {
    const now = ctx.serverNow();
    for (const f of FIELDS) {
      const at = s[f];
      if (!at || at === this.seen[f]) continue;
      this.seen[f] = at;
      if (now - at < FRESH_MS) this.fire(f, now - at, ctx);
    }
  }

  /** `age` = mốc đã qua bao lâu (ms) — đèn chớp chỉ chớp nốt phần còn lại. */
  private fire(f: FxField, age: number, ctx: ClientActivityContext): void {
    const c = ctx.world.controls;
    const casino = inCasino(ctx);
    const k = casino ? DJ.casinoLevel : 1;
    if (f === 'dropAt') {
      c.drop?.();
      ctx.audio.djDrop(k);
      if (!casino) {
        ctx.world.shake(0.6);
        ctx.ui.screenFx.flash('#ffffff');
      }
    } else if (f === 'hornAt') {
      ctx.audio.play('airhorn', { volume: 0.7 * k });
    } else if (f === 'smokeAt') {
      c.smoke?.();
      ctx.audio.play('smoke_jet', { volume: 0.8 * k });
      const booth = findStation('dj_booth')?.station;
      if (booth) {
        for (const dx of [-SMOKE_SPREAD, 0, SMOKE_SPREAD]) ctx.world.burst(booth.x + dx, booth.z + SMOKE_AHEAD, 'smoke', 14);
      }
    } else {
      c.strobe?.(Math.max(0.5, (DJ.strobeMs - age) / 1000));
    }
  }
}
