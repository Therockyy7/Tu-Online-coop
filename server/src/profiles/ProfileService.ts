// Bộ nhớ đệm hồ sơ + ghi trễ 5 giây khi có thay đổi, ghi ngay khi rời phòng / tắt server.
import { randomBytes } from 'node:crypto';
import { isValidPlayerKey, type Profile } from '@shared/index';
import { newProfile, type ProfileStore } from './ProfileStore';

export class ProfileService {
  private readonly cache = new Map<string, Profile>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** Chuỗi ghi theo từng khóa để các lần ghi cùng hồ sơ không chen nhau. */
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    readonly store: ProfileStore,
    private readonly delayMs = 5000,
  ) {}

  /**
   * Lấy hồ sơ theo khóa; không có thì tạo mới (khóa hợp lệ giữ nguyên để trình duyệt khỏi đổi khóa).
   * Khóa null/không hợp lệ → sinh khóa mới bằng crypto.
   */
  async getOrCreate(key: string | null, name: string): Promise<Profile> {
    const k = isValidPlayerKey(key) ? key : randomBytes(16).toString('hex');
    let p = this.cache.get(k);
    if (!p) {
      p = (await this.store.load(k)) ?? newProfile(k, name);
      // Có thể đã có lời gọi khác nạp xong trong lúc chờ.
      p = this.cache.get(k) ?? p;
      this.cache.set(k, p);
    }
    if (p.name !== name) {
      p.name = name;
      this.markDirty(k);
    }
    return p;
  }

  markDirty(key: string): void {
    if (this.timers.has(key)) return;
    this.timers.set(
      key,
      setTimeout(() => {
        void this.flush(key);
      }, this.delayMs),
    );
  }

  flush(key: string): Promise<void> {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
    const p = this.cache.get(key);
    if (!p) return Promise.resolve();
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        p.updatedAt = Date.now();
        await this.store.save(structuredClone(p));
      })
      .catch((err) => {
        console.error('[profiles] lỗi ghi hồ sơ:', (err as Error).message);
      });
    this.chains.set(key, next);
    void next.then(() => {
      if (this.chains.get(key) === next) this.chains.delete(key);
    });
    return next;
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.cache.keys()].map((k) => this.flush(k)));
  }

  /** Bỏ hồ sơ khỏi bộ nhớ đệm (sau khi đã ghi) khi người chơi không còn ở phòng nào. */
  async release(key: string): Promise<void> {
    await this.flush(key);
    if (!this.timers.has(key)) this.cache.delete(key);
  }
}
