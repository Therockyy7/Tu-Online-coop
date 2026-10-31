// Lưu mỗi hồ sơ một file JSON; ghi nguyên tử (file tạm + rename) để không hỏng file khi tắt đột ngột.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidPlayerKey, type Profile } from '@shared/index';
import { normalizeProfile, type ProfileStore } from './ProfileStore';

export class FileProfileStore implements ProfileStore {
  readonly kind = 'file' as const;
  private readonly ready: Promise<unknown>;
  private seq = 0;

  constructor(private readonly dir: string) {
    this.ready = mkdir(dir, { recursive: true });
  }

  private file(key: string): string {
    // playerKey đã được kiểm 32 ký tự hex → an toàn làm tên file.
    if (!isValidPlayerKey(key)) throw new Error('playerKey không hợp lệ');
    return path.join(this.dir, `${key}.json`);
  }

  async load(key: string): Promise<Profile | null> {
    await this.ready;
    try {
      const raw = await readFile(this.file(key), 'utf8');
      return normalizeProfile(JSON.parse(raw), key);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(profile: Profile): Promise<void> {
    await this.ready;
    const target = this.file(profile.key);
    const tmp = `${target}.${process.pid}.${++this.seq}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(profile), 'utf8');
      await rename(tmp, target);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async close(): Promise<void> {}
}
