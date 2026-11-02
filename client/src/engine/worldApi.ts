// HỢP ĐỒNG thế giới 3D mà mini-game được dùng (engine cài đặt).
import type * as THREE from 'three';
import type { MapDef, Pid } from '@shared/index';
import type { AvatarHandle, AvatarLook, WorldControls, WorldHandles } from '../art/api';

/** Điểm tương tác động (NPC, vật thể do mini-game tạo) — engine hiện gợi ý "[E] …" và gọi onInteract. */
export interface DynamicInteractable {
  id: string;
  position(): { x: number; z: number };
  r: number;
  /** Nhãn gợi ý; null = tạm ẩn (vd chưa đủ điều kiện). */
  label(): string | null;
  onInteract(): void;
}

export interface NpcHandle {
  readonly avatar: AvatarHandle;
  setPosition(x: number, z: number, ry?: number): void;
  /** Nhãn tên trên đầu; null = ẩn. */
  setLabel(text: string | null): void;
  /** Bong bóng thoại trên đầu trong `ms` mili-giây (mặc định 3000). */
  say(text: string, ms?: number): void;
  dispose(): void;
}

export type BurstKind =
  | 'confetti'
  | 'petals'
  | 'sparkle'
  | 'smoke'
  | 'splash'
  | 'leaves'
  | 'hearts'
  | 'notes'
  | 'stars'
  | 'tears'
  | 'steam'
  | 'coins';

/**
 * Lớp CSS3D nằm DƯỚI canvas WebGL (cùng camera, trong #stage): phần tử HTML thật (khung YouTube) đặt theo phối cảnh 3D,
 * chỉ lộ ra ở chỗ map "đục lỗ" trong suốt trên canvas (màn hình LED sân khấu ở chế độ 'video'). Canvas luôn đè lên nên
 * phần tử trong lớp này không nhận chuột / bàn phím.
 */
export interface Css3dLayer {
  /** Cảnh riêng chứa CSS3DObject (không phải cảnh 3D chính); gỡ CSS3DObject khỏi đây thì phần tử bị xoá khỏi DOM. */
  readonly scene: THREE.Scene;
  /**
   * true = vẽ lớp CSS3D mỗi khung (engine gọi sau cảnh WebGL). Chỉ bật khi màn hình đang trong tầm nhìn và đang chiếu
   * video — tắt thì phần tử giữ nguyên vị trí cũ (bị canvas đục che), đỡ tốn công trình duyệt vẽ lại khung YouTube.
   */
  setLive(live: boolean): void;
  /** Vẽ ngay 1 lần: đưa phần tử mới thêm vào DOM (YT.Player cần phần tử đã nằm trong trang trước khi tạo). */
  flush(): void;
}

export interface WorldApi {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  /** Lớp CSS3D dưới canvas (khung YouTube của màn hình LED Bar). */
  readonly css3d: Css3dLayer;
  /** Map hiện tại. */
  readonly map: MapDef;
  /** Phần dựng hình của map hiện tại (trạm, neo, điều khiển). */
  readonly handles: WorldHandles;
  readonly controls: WorldControls;
  stationGroup(stationId: string): THREE.Group | undefined;
  anchor(name: string): THREE.Object3D | undefined;
  /** Đăng ký điểm tương tác động; trả hàm hủy. */
  addInteractable(i: DynamicInteractable): () => void;
  /** Chữ bay lên tại vị trí (mét); y mặc định 2,2. */
  floatText(x: number, z: number, text: string, color?: string, y?: number): void;
  /** Hạt hiệu ứng tại vị trí. */
  burst(x: number, z: number, kind: BurstKind, count?: number): void;
  /** Vòng sáng loang trên mặt đất, bán kính tối đa `radius` mét. */
  ring(x: number, z: number, color?: string, radius?: number): void;
  shake(strength: number): void;
  /** Vị trí hiển thị (đã nội suy) của người chơi. */
  playerPosition(pid: Pid): { x: number; z: number } | undefined;
  avatar(pid: Pid): AvatarHandle | undefined;
  /** Tạo nhân vật NPC (khách vãng lai, khách bar, nhà cái…) — mini-game tự điều khiển vị trí. */
  createNpc(look: AvatarLook, name?: string): NpcHandle;
}
