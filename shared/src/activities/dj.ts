// DJ Chiếm Sóng (spec 8.4) — trạng thái bài đang phát + mốc nhịp theo giờ server (cả quán nghe cùng phách).
import { DJ, type DjTrackDef } from '../config/balance';
import type { DjTrackId } from '../ids';

export const LIGHT_THEMES = ['neon', 'gold', 'ocean', 'fire'] as const;
export type LightTheme = (typeof LIGHT_THEMES)[number];

export interface DjPublicState {
  trackId: DjTrackId;
  bpm: number;
  /** Giờ server của phách 0. */
  startedAt: number;
  theme: LightTheme;
  /** Giờ server lần Drop gần nhất (0 = chưa). */
  dropAt: number;
  hornAt: number;
}

export const beatMs = (bpm: number): number => 60_000 / bpm;

export function trackDef(id: DjTrackId): DjTrackDef {
  return DJ.tracks.find((t) => t.id === id) ?? DJ.tracks[0]!;
}

/** Chỉ số phách tại giờ server t (âm nếu chưa bắt đầu). */
export function beatIndexAt(s: Pick<DjPublicState, 'startedAt' | 'bpm'>, t: number): number {
  return Math.floor((t - s.startedAt) / beatMs(s.bpm));
}

/** Giờ server bắt đầu ô nhịp (4 phách) kế tiếp sau thời điểm t. */
export function nextMeasureAt(s: Pick<DjPublicState, 'startedAt' | 'bpm'>, t: number): number {
  const m = beatMs(s.bpm) * 4;
  const n = Math.ceil((t - s.startedAt) / m);
  return s.startedAt + Math.max(0, n) * m;
}
