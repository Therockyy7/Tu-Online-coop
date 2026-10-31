// Ảnh chân dung thờ trong Điện Tăng Đoàn (1–3 tường Tây, 4–6 tường Đông). Ảnh gốc do user cung cấp,
// đã thu nhỏ (cạnh dài ≤ 1280px). Muốn ghi tên dưới tranh (và trong gợi ý quỳ lạy): điền `caption`.
import portrait1 from './gallery/portrait_1.jpg';
import portrait2 from './gallery/portrait_2.jpg';
import portrait3 from './gallery/portrait_3.jpg';
import portrait4 from './gallery/portrait_4.jpg';
import portrait5 from './gallery/portrait_5.jpg';
import portrait6 from './gallery/portrait_6.jpg';

export interface GalleryPhoto {
  /** Khớp `data.photo` của trạm `portrait_N` trong shared/src/maps/temple.ts. */
  id: string;
  url: string;
  width: number;
  height: number;
  /** Tên/chú thích hiện trên bảng đồng dưới khung; rỗng = không hiện. */
  caption: string;
}

export const GALLERY_TITLE = 'Tăng Đoàn Tu Online';

/** Tâm chân dung cao chừng này trên khám thờ (m) — camera quỳ lạy ngẩng nhìn vào đây. */
export const PORTRAIT_CENTER_Y = 1.62;
/** Chiều cao phần ảnh trong khung (m). */
export const PORTRAIT_HEIGHT = 1.12;

export const GALLERY_PHOTOS: GalleryPhoto[] = [
  { id: 'portrait_1', url: portrait1, width: 1024, height: 1024, caption: '' },
  { id: 'portrait_2', url: portrait2, width: 960, height: 1280, caption: '' },
  { id: 'portrait_3', url: portrait3, width: 1029, height: 1280, caption: '' },
  { id: 'portrait_4', url: portrait4, width: 804, height: 1024, caption: '' },
  { id: 'portrait_5', url: portrait5, width: 591, height: 1280, caption: '' },
  { id: 'portrait_6', url: portrait6, width: 878, height: 1216, caption: '' },
];

export const galleryPhotoById = (id: string): GalleryPhoto | undefined => GALLERY_PHOTOS.find((p) => p.id === id);
