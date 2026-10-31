// Trang xem thử (client/preview.html?view=<id>): mỗi agent thêm 1 file vào preview/views/ — tự được nạp.
import type * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { ArtKit } from '../art/kit';

export interface PreviewContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Khung nút điều khiển góc phải. */
  panel: HTMLElement;
  /** Lớp UI phủ toàn màn hình (cho xem thử giao diện). */
  uiRoot: HTMLElement;
  kit: ArtKit;
  /** Đăng ký hàm chạy mỗi khung hình (dt, time tính bằng giây). */
  onFrame(fn: (dt: number, time: number) => void): void;
  /** Thêm nút vào panel. */
  button(label: string, onClick: () => void): HTMLButtonElement;
}

export interface PreviewView {
  id: string;
  title: string;
  /** Có cần cảnh 3D không (false cho trang xem thử UI/âm thanh). */
  needs3d?: boolean;
  setup(ctx: PreviewContext): void | Promise<void>;
}
