// Nhạc kinh phát ở Đại Pháp Đường: mọi file .mp3 trong thư mục sutra/ (thả thêm file là có thêm bài), phát nối tiếp
// theo thứ tự tên file rồi lặp lại. File do user cung cấp, được đóng gói vào bản build như ảnh chân dung — ai có link
// game đều nghe được. Tên hiển thị lấy từ SUTRA_TITLES (theo tên file); không có thì suy ra từ tên file.
const FILES = import.meta.glob<string>('./sutra/*.mp3', { eager: true, query: '?url', import: 'default' });

export interface SutraTrack {
  url: string;
  title: string;
}

const SUTRA_TITLES: Record<string, string> = {
  'nhac-phat-tinh-tam.mp3': 'Nhạc Phật tĩnh tâm — buông áp lực đời thường',
};

export const SUTRA_TRACKS: SutraTrack[] = Object.keys(FILES)
  .sort()
  .map((path) => {
    const name = path.slice(path.lastIndexOf('/') + 1);
    return { url: FILES[path]!, title: SUTRA_TITLES[name] ?? name.replace(/\.mp3$/i, '').replace(/[-_]+/g, ' ') };
  });
