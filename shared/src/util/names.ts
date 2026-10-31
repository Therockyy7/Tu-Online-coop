import { NET, ROOM } from '../config/balance';

// Ký tự điều khiển, zero-width và ký tự định hướng (chống giả mạo hiển thị) — theo dải code point.
const CONTROL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];

function isControlCodePoint(cp: number): boolean {
  for (const [lo, hi] of CONTROL_RANGES) if (cp >= lo && cp <= hi) return true;
  return false;
}

function stripControl(s: string): string {
  let out = '';
  for (const ch of s) {
    if (!isControlCodePoint(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

function clean(raw: string): string {
  return stripControl(raw.normalize('NFC')).replace(/\s+/g, ' ').trim();
}

/** Chuẩn hóa tên người chơi; trả null nếu không hợp lệ (2–16 ký tự sau khi làm sạch). */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = clean(raw);
  const len = [...s].length;
  if (len < 2 || len > 16) return null;
  return s;
}

/** Làm sạch tin chat; trả null nếu rỗng. Cắt bớt nếu quá dài. */
export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = clean(raw);
  if (!s) return null;
  return [...s].slice(0, NET.chatMaxLen).join('');
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (s.length !== ROOM.codeLength) return null;
  for (const ch of s) if (!ROOM.codeChars.includes(ch)) return null;
  return s;
}

/** playerKey hợp lệ: 32 ký tự hex thường. */
export function isValidPlayerKey(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[0-9a-f]{32}$/.test(raw);
}
