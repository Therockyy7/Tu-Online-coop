// HỢP ĐỒNG lớp giao diện HTML/CSS phủ trên canvas 3D (agent UI cài đặt ở ui/index.ts → createUI).
import type { Tone } from '@shared/index';
import type { AudioApi } from '../audio/api';
import type { GameActions } from '../net/types';
import type { GameStateApi } from '../state/types';

export interface LobbyRequest {
  name: string;
  /** Mã phòng (đã viết hoa); null khi tạo phòng mới. */
  room: string | null;
  create: boolean;
}

export interface LobbyOptions {
  defaultName: string;
  /** Mã phòng điền sẵn (từ link ?r=ABCD hoặc lần chơi trước). */
  defaultRoom: string | null;
  error?: string;
}

export interface UIGameContext {
  state: GameStateApi;
  actions: GameActions;
  audio: AudioApi;
}

export interface PanelOptions {
  id: string;
  title: string;
  /** Rộng (px), mặc định 420. */
  width?: number;
  /** Hiện nút ✕ và cho Esc đóng (mặc định true). */
  closable?: boolean;
  onClose?: () => void;
  className?: string;
  /** Vị trí: giữa màn hình (mặc định), đáy, hoặc cạnh phải. */
  position?: 'center' | 'bottom' | 'right';
}

export interface PanelHandle {
  /** Phần tử gốc của panel. */
  readonly el: HTMLElement;
  /** Vùng nội dung để mini-game tự vẽ. */
  readonly body: HTMLElement;
  readonly closed: boolean;
  setTitle(title: string): void;
  close(): void;
}

export interface OverlayHandle {
  /** Lớp phủ toàn màn hình, `pointer-events: none` mặc định (con tự bật lại nếu cần). */
  readonly el: HTMLElement;
  close(): void;
}

export interface ChooseOption<T extends string> {
  value: T;
  label: string;
  sub?: string;
  /** Emoji hoặc ký tự hiển thị to. */
  icon?: string;
  disabled?: boolean;
}

export interface ChooseOptions<T extends string> {
  title: string;
  options: ChooseOption<T>[];
  /** Hủy từ bên ngoài (vd hết giờ chờ): hộp chọn tự đóng và trả về null. */
  signal?: AbortSignal;
}

export interface HostMenuItem {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  disabled?: boolean;
  /** Lý do khi disabled (hiện dưới mục). */
  reason?: string;
  run(): void;
}

export interface LightboxOptions {
  images: { url: string; caption?: string }[];
  index: number;
  onClose?: () => void;
}

export interface UIApi {
  readonly root: HTMLElement;

  /** Hiện sảnh; resolve khi người chơi bấm Vào. Gọi lại được (vd sau lỗi). */
  showLobby(opts: LobbyOptions): Promise<LobbyRequest>;
  /** Đang kết nối (khóa nút) / báo lỗi trên sảnh. */
  setLobbyBusy(busy: boolean, error?: string): void;
  hideLobby(): void;

  /** Gắn HUD, chat, emote, bảng người chơi, cài đặt, menu host vào trạng thái game. */
  mountGame(ctx: UIGameContext): void;
  unmountGame(): void;

  toast(text: string, tone?: Tone): void;
  banner(title: string, sub?: string, tone?: Tone, big?: boolean): void;
  /** Gợi ý tương tác giữa đáy màn hình, vd "[E] Lấy chổi"; null để ẩn. */
  setPrompt(text: string | null): void;
  /** Tâm ngắm giữa màn hình (góc nhìn thứ nhất): ẩn / bình thường / đang nhắm vào thứ tương tác được. */
  setCrosshair(mode: 'hidden' | 'idle' | 'target'): void;
  /**
   * Gợi ý "Bấm vào màn hình để điều khiển" khi chuột chưa bị khóa (pointer lock).
   * Chỉ là lớp hiển thị (pointer-events: none) — cú bấm phải lọt xuống canvas để engine khóa chuột.
   */
  setPointerHint(show: boolean): void;
  /** Màn đếm ngược lớn giữa màn hình (vd đổi map, bắt đầu mini-game); null để ẩn. */
  setCountdown(text: string | null): void;

  openPanel(opts: PanelOptions): PanelHandle;
  openOverlay(id: string): OverlayHandle;
  /** Hộp chọn nhanh; resolve null nếu Esc/đóng. */
  choose<T extends string>(opts: ChooseOptions<T>): Promise<T | null>;
  confirm(title: string, message: string): Promise<boolean>;
  lightbox(opts: LightboxOptions): void;

  /** Mini-game đăng ký thêm mục cho menu Phương Trượng; trả hàm hủy. */
  registerHostMenuItems(provider: () => HostMenuItem[]): () => void;
  openHostMenu(): void;

  /** Đang gõ chat (engine bỏ qua phím di chuyển/tương tác). */
  isTyping(): boolean;
  /** Có panel/hộp chọn/lightbox đang mở (Esc thuộc về UI). */
  isModalOpen(): boolean;
  /** Đóng panel/hộp thoại trên cùng; trả true nếu có đóng. */
  closeTopModal(): boolean;

  /** Hiệu ứng toàn màn hình. */
  readonly screenFx: {
    /** Độ Say 0..100 → chao, mờ nhẹ. */
    setDrunk(level: number): void;
    flash(color: string): void;
    /** Mép màn hình phát sáng (Hào quang). */
    setAura(color: string | null): void;
  };
}
