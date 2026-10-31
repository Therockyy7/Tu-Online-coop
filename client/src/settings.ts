// Tùy chọn của người chơi lưu ở trình duyệt (localStorage). Mọi truy cập bọc try/catch:
// tab ẩn danh / chặn lưu trữ thì vẫn chơi được với giá trị mặc định.

export type GraphicsQuality = 'high' | 'low';

export interface Settings {
  /** Độ nhạy chuột (rad / pixel × 1000). */
  sensitivity: number;
  invertY: boolean;
  quality: GraphicsQuality;
  volMaster: number;
  volMusic: number;
  volSfx: number;
}

export interface Prefs {
  name: string;
  /** playerKey (mã khôi phục). */
  key: string | null;
  room: string | null;
}

const SETTINGS_KEY = 'tu-online:settings';
let prefsKey = 'tu-online:prefs';

const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.2,
  invertY: false,
  quality: 'high',
  volMaster: 0.8,
  volMusic: 0.55,
  volSfx: 0.9,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Không lưu được (chế độ riêng tư) — bỏ qua.
  }
}

let current: Settings = read(SETTINGS_KEY, DEFAULT_SETTINGS);
const listeners = new Set<(s: Settings) => void>();

export const settings = {
  get(): Readonly<Settings> {
    return current;
  },
  set(patch: Partial<Settings>): void {
    current = { ...current, ...patch };
    write(SETTINGS_KEY, current);
    for (const fn of listeners) fn(current);
  },
  /** Đăng ký thay đổi; trả hàm hủy. */
  on(fn: (s: Settings) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export const prefs = {
  load(): Prefs {
    return read<Prefs>(prefsKey, { name: '', key: null, room: null });
  },
  save(patch: Partial<Prefs>): void {
    write(prefsKey, { ...prefs.load(), ...patch });
  },
  /** Chỉ dùng khi phát triển: mỗi tab một hồ sơ riêng (thử nhiều người trên cùng trình duyệt). */
  useSlot(slot: string): void {
    prefsKey = `tu-online:prefs:${slot}`;
  },
};
