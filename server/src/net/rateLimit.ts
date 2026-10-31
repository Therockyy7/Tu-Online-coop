// Giới hạn tần suất kiểu "xô token": nạp `perSec` token mỗi giây, chứa tối đa `burst`.

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSec: number,
    private readonly burst: number,
    now = Date.now(),
  ) {
    this.tokens = burst;
    this.last = now;
  }

  /** Lấy `cost` token; false nếu không đủ (gói tin bị bỏ qua). */
  take(now = Date.now(), cost = 1): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSec);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}
