// Nhạc DJ thu sẵn ở Bar: các file .mp3 user gửi trong thư mục dj/ (tên ASCII), đóng gói vào bản build như nhạc kinh —
// ai có link game đều nghe được. Danh sách bài, tên hiển thị và số đo BPM / phách nằm ở shared/src/activities/dj.ts
// (DJ_RECORDED, trường `file`); ở đây chỉ ánh xạ id bài → URL file.
import { DJ_RECORDED, type DjAnyTrackId } from '@shared/activities/dj';

const FILES = import.meta.glob<string>('./dj/*.mp3', { eager: true, query: '?url', import: 'default' });

const URLS = new Map<DjAnyTrackId, string>();
for (const t of DJ_RECORDED) {
  const url = t.file ? FILES[`./dj/${t.file}`] : undefined;
  if (url) URLS.set(t.id, url);
  else console.warn('[dj] thiếu file nhạc', t.file);
}

/** URL file nhạc của bài thu sẵn; null = bài tổng hợp (Web Audio) hoặc thiếu file. */
export const djTrackUrl = (id: DjAnyTrackId): string | null => URLS.get(id) ?? null;
