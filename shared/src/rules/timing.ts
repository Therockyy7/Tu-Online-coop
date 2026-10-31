export type Judgement = 'perfect' | 'great' | 'good' | 'miss';

export interface TimingWindows {
  perfect: number;
  /** Tùy chọn (chỉ thi nhảy dùng). */
  great?: number;
  good: number;
}

/** Chấm độ lệch thời điểm (ms, âm = sớm) theo cửa sổ đối xứng, tính cả biên. */
export function judgeTiming(deltaMs: number, w: TimingWindows): Judgement {
  const d = Math.abs(deltaMs);
  if (d <= w.perfect) return 'perfect';
  if (w.great !== undefined && d <= w.great) return 'great';
  if (d <= w.good) return 'good';
  return 'miss';
}

export interface ClockSample {
  /** Giờ client lúc gửi. */
  t0: number;
  /** Giờ client lúc nhận. */
  t1: number;
  /** Giờ server trả về. */
  server: number;
}

/**
 * Ước lượng độ lệch đồng hồ: offset = giờ server − giờ client.
 * Dùng mẫu có RTT nhỏ nhất (ít nhiễu nhất), giả định đường đi/về đối xứng.
 */
export function estimateClockOffset(samples: readonly ClockSample[]): { offset: number; rtt: number } | null {
  let best: ClockSample | null = null;
  for (const s of samples) if (!best || s.t1 - s.t0 < best.t1 - best.t0) best = s;
  if (!best) return null;
  const rtt = best.t1 - best.t0;
  return { offset: best.server - (best.t0 + rtt / 2), rtt };
}
