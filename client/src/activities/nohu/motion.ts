// Chuyển động cuộn + cần gạt máy Nổ Hũ (thuần, không dính Three.js): cuộn k quay từ ô đang hiện tới đúng ô dừng server
// quyết, dừng đúng lúc startAt + NOHU.reelStopMs[k], dội nhẹ rồi đứng yên; cần gạt kéo xuống lúc bắt đầu lượt rồi nhả
// về. Tính thuần từ giờ server (giây kể từ startAt) nên mọi máy thấy cùng một lượt quay.
import { NOHU_STRIP_LEN } from '@shared/activities/nohu';

const L = NOHU_STRIP_LEN;
/** Nhịp cuộn (giây): tăng tốc, hãm; tốc độ đỉnh tối thiểu (ô/giây); dội nhẹ sau khi dừng (giây, ô). */
export const RAMP_UP = 0.12;
export const RAMP_DOWN = 0.42;
export const MIN_SPEED = 14;
export const BOUNCE_S = 0.2;
const BOUNCE = 0.25;
/** Cần gạt: kéo xuống, nhả về (giây). */
const PULL_S = 0.18;
const RELEASE_S = 0.5;

const smooth = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/** Đưa vị trí (ô, liên tục) về [0, 32). */
export const wrapCell = (p: number): number => p - L * Math.floor(p / L);

/** Quãng đã đi (0..1) của cuộn dài T giây ở giây t: tăng tốc RAMP_UP, chạy đều, hãm RAMP_DOWN về 0 đúng lúc T. */
export function travel(t: number, T: number): number {
  if (t <= 0) return 0;
  if (t >= T) return 1;
  const a = Math.min(RAMP_UP, T / 3);
  const d = Math.min(RAMP_DOWN, T / 2);
  const area = T - a / 2 - d / 2;
  if (t < a) return (t * t) / (2 * a) / area;
  if (t < T - d) return (a / 2 + t - a) / area;
  const r = T - t;
  return (area - (r * r) / (2 * d)) / area;
}

/** Số ô cuộn phải đi từ ô p0 tới đúng ô dừng `to` trong T giây (thêm đủ vòng để tốc độ đỉnh không dưới MIN_SPEED). */
export function reelDistance(p0: number, to: number, T: number): number {
  const d0 = wrapCell(to - p0);
  const min = MIN_SPEED * (T - Math.min(RAMP_UP, T / 3) / 2 - Math.min(RAMP_DOWN, T / 2) / 2);
  return d0 + L * Math.max(0, Math.ceil((min - d0) / L));
}

/** Vị trí cuộn (ô nằm trên đường thắng, liên tục) ở giây t của lượt: đi `dist` ô từ `from`, tới T thì đúng `stop`. */
export function reelPosition(from: number, dist: number, stop: number, t: number, T: number): number {
  if (t < T) return from + dist * travel(t, T);
  const u = (t - T) / BOUNCE_S;
  return stop + (u < 1 ? BOUNCE * Math.sin(Math.PI * u) * (1 - u) : 0);
}

/** Độ kéo cần gạt (0..1) ở giây t của lượt (âm = chưa quay). */
export function leverPull(t: number): number {
  if (t < 0) return 0;
  return t < PULL_S ? smooth(t / PULL_S) : 1 - smooth((t - PULL_S) / RELEASE_S);
}
