import type { Pid } from '../types';

export interface HostCandidate {
  pid: Pid;
  congDuc: number;
  joinedAt: number;
  connected: boolean;
}

/** Phương Trượng = người đang kết nối có Công Đức cao nhất; bằng điểm thì ai vào trước. */
export function pickHost(cands: readonly HostCandidate[]): Pid | null {
  let best: HostCandidate | null = null;
  for (const c of cands) {
    if (!c.connected) continue;
    if (!best || c.congDuc > best.congDuc || (c.congDuc === best.congDuc && c.joinedAt < best.joinedAt)) {
      best = c;
    }
  }
  return best ? best.pid : null;
}
