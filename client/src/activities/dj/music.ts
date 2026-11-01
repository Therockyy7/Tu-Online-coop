// Nhạc DJ phía client: phát đúng bài, đúng giây theo trạng thái server — bài thu sẵn bám giờ server liên tục, bài tổng
// hợp lặp theo lưới phách; nhỏ lại trong Sòng Công Đức; phách → đèn / sàn LED; phổ nhạc thật → tường LED; Drop tự bắn
// ở mốc drop đã đo. Chỉ gọi audio khi trạng thái phát đổi (bài / mốc bắt đầu / dừng) hoặc mức to đổi — không mỗi khung.
import { DJ, inZone, type DjTrackId } from '@shared/index';
import { beat0At, beatMs, trackInfo, type DjPublicState } from '@shared/activities/dj';
import type { RecordedOptions } from '../../audio/api';
import { djTrackUrl } from '../../content/djTracks';
import type { ClientActivityContext } from '../types';

/** Số dải phổ gửi cho tường LED. */
const BANDS = 20;
/** Vị trí nhảy quá ngần này (ms) giữa hai khung = vừa tua / tab bị treo: không bắn Drop bù. */
const DROP_GAP_MS = 1000;
/** Kiểm chỗ đứng (đổi mức to khi vào / ra Sòng Công Đức) cách nhau ngần này (ms). */
const ZONE_CHECK_MS = 250;

export class DjMusic {
  private readonly bands = new Float32Array(BANDS);
  /** Trạng thái phát đã áp vào audio: `bài|mốc bắt đầu|đang phát`. */
  private applied = '';
  /** Bài thu sẵn đang mở trong audio + tùy chọn đã gửi (đổi mức to phải gửi lại đúng tùy chọn đó). */
  private url: string | null = null;
  private opts: RecordedOptions | null = null;
  /** Mức to đã đặt theo chỗ đứng (bài thu sẵn: setRecorded; bài tổng hợp: setBeatLevel). */
  private level = 1;
  private zoneCheckAt = 0;
  /** Đang phát bài tổng hợp (startBeatTrack) — chỉ tắt bài có nhịp do chính DJ bật. */
  private synth = false;
  private lastBeat = -1;
  /** Vị trí trong bài (ms) ở khung trước để bắt mốc drop; NaN = chưa có (vừa đổi bài / vừa vào quán). */
  private lastPos = Number.NaN;

  /** Quên những gì đã áp (vào lại Bar): lần sync sau phát lại từ đầu. */
  reset(): void {
    this.applied = '';
    this.url = null;
    this.opts = null;
    this.synth = false;
    this.lastBeat = -1;
    this.lastPos = Number.NaN;
  }

  /** Trạng thái server mới: đổi bài / mốc bắt đầu / dừng thì phát lại cho khớp; còn lại giữ nguyên. */
  sync(s: DjPublicState, ctx: ClientActivityContext): void {
    const key = `${s.trackId}|${s.startedAt}|${s.playing}`;
    if (key === this.applied) return;
    this.applied = key;
    this.lastBeat = -1;
    this.lastPos = Number.NaN;
    const t = trackInfo(s.trackId);
    const controls = ctx.world.controls;
    controls.setMusicPlaying?.(s.playing);
    controls.setNowPlaying?.(s.playing ? t.name : null);
    // Cùng bài phát lại / phát tiếp / dừng: tắt hẳn bài đang mở để thẻ audio mới tua đúng giây theo mốc mới.
    if (this.url) ctx.audio.setRecorded(null, 0);
    this.url = null;
    this.opts = null;
    const url = s.playing && t.kind === 'recorded' ? djTrackUrl(t.id) : null;
    if (s.playing && t.kind === 'synth') {
      this.synth = true;
      // Mức to theo chỗ đứng đặt trước khi bật: trong Sòng bài tổng hợp vào thẳng mức nhỏ như bài thu sẵn.
      this.level = this.levelAt(ctx);
      this.zoneCheckAt = performance.now();
      ctx.audio.setBeatLevel(this.level);
      ctx.audio.startBeatTrack(t.id as DjTrackId, s.startedAt, s.bpm);
      return;
    }
    this.stopSynth(ctx);
    if (!url) return;
    const startedAt = s.startedAt;
    this.level = this.levelAt(ctx);
    this.zoneCheckAt = performance.now();
    this.opts = { loop: false, follow: true, startAt: () => (ctx.serverNow() - startedAt) / 1000 };
    this.url = url;
    ctx.audio.setRecorded(url, this.level, this.opts);
  }

  /** Mỗi khung: phổ nhạc → tường LED, mức to theo chỗ đứng, phách → đèn, Drop tự bắn ở mốc drop. */
  update(s: DjPublicState, ctx: ClientActivityContext): void {
    const controls = ctx.world.controls;
    if (ctx.audio.musicBands(this.bands)) controls.setSpectrum?.(this.bands);
    if ((this.url || this.synth) && performance.now() - this.zoneCheckAt > ZONE_CHECK_MS) {
      this.zoneCheckAt = performance.now();
      const lv = this.levelAt(ctx);
      if (lv !== this.level) {
        this.level = lv;
        // Bài thu sẵn: gửi lại đúng tùy chọn cũ (không mở thẻ mới); bài tổng hợp: đổi mức to bài có nhịp.
        if (this.url && this.opts) ctx.audio.setRecorded(this.url, lv, this.opts);
        else if (this.synth) ctx.audio.setBeatLevel(lv);
      }
    }
    if (!s.playing) return;
    const t = trackInfo(s.trackId);
    const now = ctx.serverNow();
    const pos = now - s.startedAt;
    if (pos < 0 || (t.durationMs > 0 && pos >= t.durationMs)) return;
    // Lưới phách tính tại chỗ theo bài: bài ghép nhiều đoạn đổi pha đúng mốc, không phải chờ server báo beat0 mới.
    const beat0 = t.kind === 'recorded' ? beat0At(t, s.startedAt, pos) : s.beat0;
    const beat = Math.floor((now - beat0) / beatMs(s.bpm));
    if (beat >= 0 && beat !== this.lastBeat) {
      this.lastBeat = beat;
      controls.onBeat?.(beat, s.bpm);
    }
    const drops = t.drops;
    if (drops) {
      const last = this.lastPos;
      if (pos > last && pos - last < DROP_GAP_MS) {
        for (let i = 0; i < drops.length; i++) {
          if (last < drops[i]! && pos >= drops[i]!) {
            // Bài tự "drop": chỉ hiệu ứng hình — tiếng drop đã có sẵn trong bản nhạc. Trong Sòng không rung màn hình
            // (đang chơi bài / cược, sàn nhảy ở phòng bên).
            controls.drop?.();
            if (!inCasino(ctx)) ctx.world.shake(0.35);
            break;
          }
        }
      }
      this.lastPos = pos;
    }
  }

  /** Rời Bar / thoát: tắt nhạc DJ (bài thu sẵn lẫn bài tổng hợp). */
  stop(ctx: ClientActivityContext): void {
    if (this.url) ctx.audio.setRecorded(null, 0);
    this.stopSynth(ctx);
    this.reset();
  }

  private stopSynth(ctx: ClientActivityContext): void {
    if (!this.synth) return;
    this.synth = false;
    // Dừng bài có nhịp cũng trả mức to bài có nhịp về 1 (hợp đồng AudioApi) — nhạc tụng kinh ở Chùa không bị nhỏ theo.
    ctx.audio.stopBeatTrack();
  }

  /** Mức to theo chỗ đứng: trong Sòng Công Đức nhỏ lại (DJ.casinoLevel), nơi khác trong Bar to hết cỡ. */
  private levelAt(ctx: ClientActivityContext): number {
    return inCasino(ctx) ? DJ.casinoLevel : 1;
  }
}

/** Người chơi đang đứng trong Sòng Công Đức (nhạc / hiệu ứng DJ ở đó nhỏ lại, không rung màn hình, không chớp trắng). */
export function inCasino(ctx: ClientActivityContext): boolean {
  const me = ctx.me();
  return !!me && inZone('bar', 'casino', me);
}
