// DJ Chiếm Sóng (spec 8.4 + Quán Bar mở rộng mục 4) — danh sách bài hợp nhất (4 bài thu sẵn user gửi + 4 bài tổng hợp),
// trạng thái công khai của bàn DJ (ai đứng bàn cũng chỉnh được, mỗi lúc 1 người) và lưới phách theo giờ server: cả quán
// nghe cùng một đoạn, đèn + Thi nhảy canh cùng một phách.
import { DJ } from '../config/balance';
import type { DjTrackId } from '../ids';
import type { Pid } from '../types';

export const LIGHT_THEMES = ['neon', 'gold', 'ocean', 'fire'] as const;
export type LightTheme = (typeof LIGHT_THEMES)[number];

/** Bài thu sẵn — file mp3 ở client/src/content/dj/ (tên ASCII). */
export const DJ_RECORDED_IDS = ['chu_dai_bi_masew', 'chu_dai_bi_tliem', 'chu_dai_bi_remix', 'duoi_toa_sen_vang'] as const;
export type DjRecordedId = (typeof DJ_RECORDED_IDS)[number];
/** Mọi bài phát được ở bàn DJ: thu sẵn + tổng hợp. */
export type DjAnyTrackId = DjRecordedId | DjTrackId;

/** Bài ghép từ nhiều đoạn lệch pha nhau: từ vị trí `atMs` trong bài, lưới phách neo ở phách mạnh `beatMs` (ms trong bài). */
export interface DjGridShift {
  atMs: number;
  beatMs: number;
}

export interface DjTrack {
  id: DjAnyTrackId;
  kind: 'recorded' | 'synth';
  name: string;
  /** Nhịp (bài thu sẵn: số đo, lẻ tới 0,001 BPM). */
  bpm: number;
  /** ms từ đầu file tới phách mạnh (đầu ô nhịp) đầu tiên; bài tổng hợp = 0 (phách 0 = lúc bắt đầu). */
  beatOffsetMs: number;
  /** Thời lượng file (ms, theo ffprobe); bài tổng hợp = 0 (lặp tới khi đổi bài). */
  durationMs: number;
  /** Tên file trong client/src/content/dj/. */
  file?: string;
  /** Mốc drop (ms trong bài) — Drop tự bắn ở máy khách. */
  drops?: readonly number[];
  /** Các lần đổi pha lưới phách giữa bài (tăng dần). */
  grid?: readonly DjGridShift[];
}

/**
 * 4 bài user gửi (2026-11-01). Đo bằng ffmpeg (mono 11 025 Hz) + script: hàm onset dải thấp (< 150 Hz), tự tương quan
 * 60–180 BPM, tinh chỉnh chu kỳ bước 0,005 BPM, rồi hồi quy mốc onset theo lưới phách (đã bù 6,5 ms độ sớm của bộ dò,
 * đo trên tín hiệu thử biết trước nhịp). "Khớp" = % phách (đoạn có trống) có onset trong ±30 ms. Hai bài ghép từ nhiều
 * đoạn lệch pha nên có `grid`: Remix lặp đoạn dài đúng 66 s (mỗi đoạn sớm 98 ms so với lưới cũ), TLiem gồm 2 bản nối
 * nhau lệch 222 766 ms. Drop = phách có trống đầu tiên sau ≥ 2 ô nhịp lặng.
 */
export const DJ_RECORDED: readonly DjTrack[] = [
  {
    // Khớp 96,6% (riêng dải thấp 70,5% — trống/bass hay lệch phách).
    id: 'chu_dai_bi_masew',
    kind: 'recorded',
    name: 'Chú Đại Bi (Vô Lượng) — Masew, Khoi Vu',
    file: 'chu-dai-bi-vo-luong-masew.mp3',
    bpm: 94.997,
    beatOffsetMs: 130,
    durationMs: 234_606,
    drops: [135_924, 209_821],
  },
  {
    // Khớp 98,4% (dải thấp 94,1%); 1 lưới chung cả bài chỉ khớp 76,3%.
    id: 'chu_dai_bi_tliem',
    kind: 'recorded',
    name: 'Chú Đại Bi (Vô Lượng) — TLiem Remix',
    file: 'chu-dai-bi-vo-luong-tliem-remix.mp3',
    bpm: 138.001,
    beatOffsetMs: 179,
    durationMs: 453_329,
    drops: [28_005, 250_771],
    grid: [{ atMs: 222_728, beatMs: 222_945 }],
  },
  {
    // Khớp 100% (dải thấp 96,7%); 1 lưới chung cả bài chỉ khớp 42,6%.
    id: 'chu_dai_bi_remix',
    kind: 'recorded',
    name: 'Chú Đại Bi Remix',
    file: 'chu-dai-bi-remix.mp3',
    bpm: 127.993,
    beatOffsetMs: 1692,
    durationMs: 264_176,
    drops: [71_442, 137_442, 203_443],
    grid: [
      { atMs: 71_208, beatMs: 71_442 },
      { atMs: 137_208, beatMs: 137_442 },
      { atMs: 203_209, beatMs: 203_443 },
    ],
  },
  {
    // Khớp 99,1% (dải thấp 87,7%).
    id: 'duoi_toa_sen_vang',
    kind: 'recorded',
    name: 'Dưới Tòa Sen Vàng — AnhVu Remix',
    file: 'duoi-toa-sen-vang-anhvu-remix.mp3',
    bpm: 141.999,
    beatOffsetMs: 1574,
    durationMs: 285_179,
    drops: [18_476, 184_111, 255_097],
  },
];

/** Danh sách phát của bàn DJ: thu sẵn trước (tự phát nối tiếp khi vào Bar), tổng hợp sau (lặp tới khi đổi). */
export const DJ_TRACKS: readonly DjTrack[] = [
  ...DJ_RECORDED,
  ...DJ.tracks.map((t): DjTrack => ({ id: t.id, kind: 'synth', name: t.name, bpm: t.bpm, beatOffsetMs: 0, durationMs: 0 })),
];
export const DJ_TRACK_IDS = DJ_TRACKS.map((t) => t.id) as [DjAnyTrackId, ...DjAnyTrackId[]];

export interface DjPublicState {
  trackId: DjAnyTrackId;
  bpm: number;
  /** Giờ server ứng với giây 0 của bài (bài tổng hợp: phách 0). */
  startedAt: number;
  /** Giờ server của một phách mạnh trong đoạn đang phát — lưới phách = beat0 + k·beatMs(bpm). */
  beat0: number;
  playing: boolean;
  /** Đang dừng: vị trí trong bài (ms) lúc dừng — phát tiếp từ đây. */
  pausedAtMs: number;
  theme: LightTheme;
  /** Giờ server lần gần nhất bấm Drop / còi / pháo giấy / khói / đèn chớp (0 = chưa). */
  dropAt: number;
  hornAt: number;
  confettiAt: number;
  smokeAt: number;
  strobeAt: number;
  /** Người đang đứng bàn DJ (null = bàn trống). */
  controllerPid: Pid | null;
  controllerName: string | null;
}

/** Lưới phách: mốc một phách mạnh (giờ server) + nhịp. */
export interface BeatGrid {
  beat0: number;
  bpm: number;
}

export const beatMs = (bpm: number): number => 60_000 / bpm;

const TRACK_BY_ID = new Map<string, DjTrack>(DJ_TRACKS.map((t) => [t.id, t]));

/** Thông tin bài theo id (id lạ → bài đầu). Tra bảng dựng sẵn — gọi mỗi khung hình được. */
export function trackInfo(id: DjAnyTrackId): DjTrack {
  return TRACK_BY_ID.get(id) ?? DJ_TRACKS[0]!;
}

/** Bài kế (dir 1) / bài trước (dir −1), vòng quanh trong nhóm của bài (thu sẵn / tổng hợp). */
export function nextTrackId(id: DjAnyTrackId, dir: 1 | -1): DjAnyTrackId {
  const kind = trackInfo(id).kind;
  const group = DJ_TRACKS.filter((t) => t.kind === kind);
  const i = Math.max(0, group.findIndex((t) => t.id === id));
  return group[(((i + dir) % group.length) + group.length) % group.length]!.id;
}

/** Chỉ số phách tại giờ server t (âm nếu trước beat0). */
export function beatIndexAt(g: BeatGrid, t: number): number {
  return Math.floor((t - g.beat0) / beatMs(g.bpm));
}

/** Giờ server bắt đầu ô nhịp (4 phách) kế tiếp tại/sau t (không sớm hơn beat0). */
export function nextMeasureAt(g: BeatGrid, t: number): number {
  const m = beatMs(g.bpm) * 4;
  const n = Math.ceil((t - g.beat0) / m);
  return g.beat0 + Math.max(0, n) * m;
}

/** Mốc neo lưới phách (ms trong bài) của đoạn chứa vị trí posMs. */
export function gridAnchorAt(t: DjTrack, posMs: number): number {
  let a = t.beatOffsetMs;
  for (const g of t.grid ?? []) {
    if (posMs < g.atMs) break;
    a = g.beatMs;
  }
  return a;
}

/** beat0 (giờ server) của bài bắt đầu lúc startedAt, khi đang ở vị trí posMs trong bài. */
export function beat0At(t: DjTrack, startedAt: number, posMs: number): number {
  return startedAt + gridAnchorAt(t, posMs);
}

/** Vị trí đang phát trong bài (ms; âm = chưa tới giờ bắt đầu); đang dừng = vị trí lúc dừng. */
export function positionMs(s: Pick<DjPublicState, 'startedAt' | 'playing' | 'pausedAtMs'>, now: number): number {
  return s.playing ? now - s.startedAt : s.pausedAtMs;
}

/**
 * Mốc bắt đầu (giờ server) để phát lại bài `t` từ đầu mà phách mạnh đầu tiên của bài rơi đúng ranh ô nhịp của lưới `g`
 * (Thi nhảy đang chấm theo lưới đó): mốc sớm nhất không trước `earliest`.
 */
export function alignedStartAt(t: DjTrack, g: BeatGrid, earliest: number): number {
  const m = beatMs(g.bpm) * 4;
  const n = Math.ceil((earliest + t.beatOffsetMs - g.beat0) / m);
  return g.beat0 + n * m - t.beatOffsetMs;
}
