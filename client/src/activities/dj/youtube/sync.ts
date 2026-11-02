// Trình phát YouTube ở bàn DJ — hàm thuần (spec 2026-11-02-dj-youtube-led-design.md mục 4): vị trí cần có theo giờ
// server, quyết định tua sửa lệch (YouTube không cho nhích tốc độ mịn như mp3 — chỉ tua được), phát hiện livestream, âm
// lượng khung YouTube (iframe không đi qua Web Audio nên tự tính setVolume), cỡ khung theo đồ họa. Không chạm DOM /
// three — test được trong Node.
import type { DjYoutubeItem } from '@shared/activities/dj';
import { MUSIC_BUS_GAIN } from '../../../audio/index';
import type { GraphicsQuality } from '../../../settings';

/** Lệch quá ngần này (giây) mới tua — getCurrentTime() của YouTube đoán trước tới ~1 s khi đang phát. */
const SEEK_DRIFT_S = 1.5;
/** Hai lần tua cách nhau tối thiểu (ms): tua xong còn đệm / số giờ còn nhảy, đừng tua liên hồi. */
const SEEK_GAP_MS = 5000;
/** Còn ngần này (giây) là hết video thì để yên (tua sát cuối = hết video ngay). */
const SEEK_TAIL_S = 2;
/** Bị chậm thì tua vượt lên ngần này (giây): bù lúc đệm sau khi tua + YouTube làm tròn về khung khóa đứng trước. */
const SEEK_LEAD_S = 0.5;
/** Giữa hai lần kiểm (~1 s) giây đang phát phải tăng hơn ngần này, không thì coi như đứng (đang quảng cáo / kẹt). */
const STALL_ADVANCE_S = 0.25;
/** Thời lượng đọc lần sau (~4 s sau) còn tăng hơn ngần này (giây) → livestream. */
const LIVE_GROWTH_S = 2;

/** Giây cần có theo giờ server: đang phát → (now − startedAt) / 1000 (âm = chưa tới giờ); đang dừng → chỗ dừng. */
export function expectedSec(startedAt: number, playing: boolean, pausedAtMs: number, now: number): number {
  return playing ? (now - startedAt) / 1000 : pausedAtMs / 1000;
}

/** Giờ server video bắt đầu phát thật: startedAt ứng với giây 0, video vào từ giây startMs (link ?t=, chỗ đang dở). */
export function playAt(yt: Pick<DjYoutubeItem, 'startMs'>, startedAt: number): number {
  return startedAt + yt.startMs;
}

export interface SeekCheck {
  /** Giây đang phát (getCurrentTime). */
  current: number;
  /** Giây cần có theo giờ server. */
  expected: number;
  /** Thời lượng video (giây) server đã biết. */
  duration: number;
  /** performance.now() lúc kiểm / lúc tua gần nhất (ms). */
  now: number;
  lastSeekAt: number;
  /** Thời gian không chạy dù đang PLAYING (thường là đang quảng cáo) → không tua. */
  stalled: boolean;
}

/** Có nên tua (seekTo) cho bám giờ server: lệch rõ, cách lần tua trước đủ lâu, không quảng cáo, chưa sát cuối video. */
export function shouldSeek(c: SeekCheck): boolean {
  return (
    !c.stalled &&
    Math.abs(c.current - c.expected) > SEEK_DRIFT_S &&
    c.now - c.lastSeekAt >= SEEK_GAP_MS &&
    c.expected >= 0 &&
    c.expected <= c.duration - SEEK_TAIL_S
  );
}

/** Giây tua tới để bám giờ server: đang chậm thì vượt lên SEEK_LEAD_S (đệm xong vừa khớp); đang nhanh thì đúng chỗ. */
export function seekTarget(current: number, expected: number): number {
  return current < expected ? expected + SEEK_LEAD_S : expected;
}

/** Giây đang phát gần như không tăng giữa hai lần kiểm cách ~1 s (`prev` NaN = lần kiểm đầu → coi như đứng). */
export function stalledBetween(prev: number, cur: number): boolean {
  return !(cur - prev > STALL_ADVANCE_S);
}

/** Livestream: thời lượng đọc lần sau (`d2`) lớn hơn lần đầu (`d1`, đã có số) quá LIVE_GROWTH_S giây. */
export function detectLive(d1: number, d2: number): boolean {
  return d1 > 0 && d2 - d1 > LIVE_GROWTH_S;
}

/**
 * Âm lượng khung YouTube (setVolume 0..100), to ngang nhạc thu sẵn qua engine: mức theo chỗ đứng (Sòng Công Đức nhỏ
 * lại) × thanh nhạc × hệ số kênh nhạc × thanh tổng. 0 = tắt tiếng (mute()).
 */
export function ytVolumePercent(level: number, music: number, master: number): number {
  const v = Math.round(100 * level * music * MUSIC_BUS_GAIN * master);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

/** Cỡ khung YouTube (px CSS, 16:9): đồ họa thấp nhỏ hơn — trình duyệt đỡ tốn công vẽ lại iframe khi xoay camera. */
export function ytPixelSize(quality: GraphicsQuality): { w: number; h: number } {
  return quality === 'low' ? { w: 854, h: 480 } : { w: 1280, h: 720 };
}
