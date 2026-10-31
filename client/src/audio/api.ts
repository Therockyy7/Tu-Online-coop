// HỢP ĐỒNG âm thanh tổng hợp bằng Web Audio (agent audio cài đặt ở audio/index.ts → createAudio).
import type { SfxId, TrackId } from '@shared/index';

export type AudioChannel = 'master' | 'music' | 'sfx';

export interface PlayOptions {
  /** 0..1 (nhân với kênh sfx). */
  volume?: number;
  /** −1 (trái) .. 1 (phải). */
  pan?: number;
  /** Hệ số tốc độ/cao độ, 1 = bình thường. */
  rate?: number;
}

export interface RecordedOptions {
  /**
   * Giây bắt đầu mỗi lần phát hoặc nối lại sau khi tạm dừng, tính theo thời lượng bài (giây) — để canh theo giờ server
   * (cả phòng nghe cùng một đoạn). Không có = phát từ đầu.
   */
  startAt?: (duration: number) => number;
  /** Lặp lại bài khi hết (mặc định true). */
  loop?: boolean;
  /** Bài phát hết (chỉ khi loop = false) — để chuyển bài kế trong danh sách. */
  onEnded?: () => void;
}

export interface AudioApi {
  /** Gọi trong sự kiện click/phím đầu tiên của người dùng để mở khóa AudioContext. */
  unlock(): void;
  readonly unlocked: boolean;
  /** Hàm lấy giờ server (ms) để canh nhịp — engine gọi sau khi đồng bộ đồng hồ. */
  setClock(serverNow: () => number): void;

  play(id: SfxId, opts?: PlayOptions): void;
  /** Phát đúng tại giờ server (ms). Quá khứ < 80ms thì phát ngay, trễ hơn thì bỏ. */
  playAt(id: SfxId, serverMs: number, opts?: PlayOptions): void;
  /** Tiếng Đại Hồng Chung với độ mạnh 0..1 (âm lượng + độ ngân). */
  bell(strength: number): void;

  /** Nhạc nền (crossfade ~1,5s). null = tắt. */
  setMusic(track: TrackId | null): void;
  /** Bài có nhịp canh theo giờ server: phách 0 rơi đúng `startServerMs`. Thay nhạc nền hiện tại. */
  startBeatTrack(track: TrackId, startServerMs: number, bpm: number): void;
  /** Dừng bài có nhịp, trở về nhạc nền trước đó. */
  stopBeatTrack(): void;
  /** Hiệu ứng "drop" của DJ (bass boom + quét lọc). */
  djDrop(): void;

  /**
   * Nhạc thu sẵn phát trực tuyến qua kênh nhạc (file dài — nhạc kinh ở Đại Pháp Đường). `level` 0..1 = mức to mong
   * muốn (đổi êm vài trăm ms); 0 = nhỏ dần rồi tạm dừng (thôi tải). Nhạc nền tổng hợp nhỏ dần theo `level` để nhường
   * chỗ. Gọi lại với cùng `url` chỉ đổi mức to; `url` khác = chuyển bài; null = tắt. Gọi trước khi mở khóa âm thanh
   * thì được nhớ lại và áp dụng khi mở khóa.
   */
  setRecorded(url: string | null, level: number, opts?: RecordedOptions): void;
  /** Thời lượng (giây) của một file nhạc thu sẵn — chỉ tải phần đầu file (metadata). */
  recordedDuration(url: string): Promise<number>;

  setVolume(channel: AudioChannel, value: number): void;
  getVolume(channel: AudioChannel): number;
}
