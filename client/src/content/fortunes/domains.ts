// Sáu lĩnh vực lời khuyên ở Điện Tăng Đoàn: mỗi chân dung (portrait_1..6 — 1–3 tường Tây, 4–6 tường Đông, tính từ
// cửa vào trong) là một vị Sư Thầy được tuyên dương ở một lĩnh vực. Đảnh lễ đủ 1 lễ rồi bóc quẻ → lời khuyên của lĩnh
// vực đó. File này chỉ có kiểu + thông tin hiển thị (tên, khẩu hiệu, màu nhấn); lá quẻ nằm ở các file cùng thư mục.

export type FortuneDomainId = 'cong_danh' | 'tinh_duyen' | 'tai_loc' | 'suc_khoe' | 'gia_dao' | 'van_han';

/** Mức quẻ, từ tốt nhất tới "bình thường, nên cẩn trọng" — không có quẻ xấu (chỉ có lời nhắc giữ mình). */
export type FortuneLevel = 'Đại Cát' | 'Thượng Cát' | 'Trung Cát' | 'Tiểu Cát' | 'Trung Bình';

/** Một lá quẻ. */
export interface FortuneSlip {
  level: FortuneLevel;
  /** Mảng nhỏ trong lĩnh vực, vd 'Thăng tiến', 'Khởi nghiệp'. */
  topic: string;
  /** Tên quẻ — một hình ảnh ngắn gọn, vd 'Cá chép vượt vũ môn'. */
  title: string;
  /** Hai câu thơ lục bát (dòng 6 chữ, dòng 8 chữ). */
  verse: readonly [string, string];
  /** Lời khuyên của Sư Thầy: 2–4 câu, cụ thể, thiết thực. */
  advice: string;
}

export interface FortuneDomain {
  id: FortuneDomainId;
  /** Chân dung tương ứng (khớp `data.photo` của trạm portrait_N). */
  photo: string;
  /** Tên đầy đủ, vd 'Công Danh & Sự Nghiệp'. */
  title: string;
  /** Tên ngắn trên bảng vinh danh, vd 'Công Danh'. */
  short: string;
  /** Khẩu hiệu tuyên dương 4 chữ trên băng rôn cạnh chân dung. */
  motto: string;
  /** Biểu tượng trên lá quẻ / HUD. */
  icon: string;
  /** Màu nhấn của lĩnh vực (viền lá quẻ, bảng tên). */
  color: string;
}

export const FORTUNE_DOMAINS: readonly FortuneDomain[] = [
  { id: 'cong_danh', photo: 'portrait_1', title: 'Công Danh & Sự Nghiệp', short: 'Công Danh', motto: 'Chí Bền Đường Rộng', icon: '📜', color: '#c8102e' },
  { id: 'tinh_duyen', photo: 'portrait_2', title: 'Tình Duyên & Hôn Nhân', short: 'Tình Duyên', motto: 'Duyên Lành Tự Đến', icon: '💞', color: '#d6457a' },
  { id: 'tai_loc', photo: 'portrait_3', title: 'Tài Lộc & Tiền Bạc', short: 'Tài Lộc', motto: 'Lộc Đến Nhà Siêng', icon: '💰', color: '#d4a017' },
  { id: 'suc_khoe', photo: 'portrait_4', title: 'Sức Khỏe & Bình An', short: 'Sức Khỏe', motto: 'Thân An Tâm Lạc', icon: '🍃', color: '#2e8b57' },
  { id: 'gia_dao', photo: 'portrait_5', title: 'Gia Đạo & Con Cái', short: 'Gia Đạo', motto: 'Gia Hòa Vạn Sự', icon: '🏡', color: '#e07b24' },
  { id: 'van_han', photo: 'portrait_6', title: 'Vận Hạn & Xuất Hành', short: 'Vận Hạn', motto: 'Thuận Buồm Xuôi Gió', icon: '🧭', color: '#3f5fb0' },
];

/** Lĩnh vực của chân dung `photo` (vd 'portrait_3' → Tài Lộc). */
export const domainOfPhoto = (photo: string): FortuneDomain | undefined => FORTUNE_DOMAINS.find((d) => d.photo === photo);
