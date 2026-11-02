// HỢP ĐỒNG phần dựng hình 3D: nhân vật (avatar.ts), vật cầm tay (props.ts), map (temple/, bar/).
import type * as THREE from 'three';
import type { AnimId, HairId, HeldItem, MapDef, Outfit } from '@shared/index';
import type { ArtKit } from './kit';

export interface AvatarLook {
  outfit: Outfit;
  /** Tu sĩ: 'bald'. NPC có tóc. */
  hair: HairId;
  /** Màu da (hex). */
  skin: string;
  /** Bộ Phương Trượng: cà sa đỏ thêu kim + mũ Tỳ Lư + tích trượng (đè lên áo đang mặc). */
  isHost: boolean;
  vip: boolean;
  /** Màu nhấn riêng để phân biệt người chơi (khăn/viền nhỏ). */
  accent?: string;
}

export interface AvatarHandle {
  /** Engine đặt position (x, 0, z) và rotation.y = ry. */
  readonly root: THREE.Group;
  /** Điểm trên đỉnh đầu (gắn nhãn tên, bong bóng chat). */
  readonly headAnchor: THREE.Object3D;
  setLook(look: AvatarLook): void;
  setHeld(item: HeldItem | null): void;
  setAnim(anim: AnimId): void;
  /** dt, time tính bằng giây; speed = tốc độ di chuyển thực (m/s) để chỉnh nhịp bước. */
  update(dt: number, time: number, speed: number): void;
  /** 0..100 → mây đen (≥ 50), mây có sấm (≥ 80). */
  setTapNiem(level: number): void;
  /** 0..100 → lảo đảo, má đỏ. */
  setDrunk(level: number): void;
  /** Mất kết nối → mờ. */
  setGhost(ghost: boolean): void;
  /** Viền sáng (hào quang vàng, ban phước xanh…); null = tắt. */
  setGlow(color: string | null): void;
  /** Hiệu ứng biến hình khi thăng cấp (~1,5 giây). */
  playRankUp(): void;
  dispose(): void;
}

export type CreateAvatar = (look: AvatarLook) => AvatarHandle;
export type CreateHeldItemMesh = (item: HeldItem) => THREE.Object3D;

/**
 * "Viewmodel" ở góc nhìn thứ nhất: đôi tay (tay áo theo màu áo đang mặc) + vật đang cầm, hiển thị trước camera.
 * Tọa độ theo không gian camera: camera nhìn về −Z, +Y lên, +X sang phải. Engine vẽ nó ở lượt riêng
 * sau cảnh chính (xóa depth) để không xuyên vào tường.
 */
export interface FirstPersonHandle {
  readonly root: THREE.Group;
  setLook(look: AvatarLook): void;
  setHeld(item: HeldItem | null): void;
  /** Hành động (quét, chẻ, gõ mõ…), đi/đứng (nhún nhẹ khi đi), emote tay (chào, chắp tay, vỗ tay). */
  setAnim(anim: AnimId): void;
  /** dt, time tính bằng giây; speed = tốc độ di chuyển thực (m/s). */
  update(dt: number, time: number, speed: number): void;
  dispose(): void;
}

export type CreateFirstPersonView = (look: AvatarLook) => FirstPersonHandle;

/** Điều khiển hình ảnh map cho mini-game. Map không có thì để undefined. */
export interface WorldControls {
  // ── Chùa ──
  /** Hào quang Chánh Điện (tụng kinh đạt combo 20). */
  setChanhDienGlow?(on: boolean): void;
  /** Kéo chày chuông lùi, 0..1. */
  setBellPull?(amount: number): void;
  /** Chày đập chuông; chuông rung theo độ mạnh 0..1. */
  hitBell?(strength: number): void;
  /** Mực nước chum 0..1 theo id trạm (water_jar_N). */
  setJarLevel?(stationId: string, level: number): void;
  /** Lửa (0..1) và khói (0..1) của lò. */
  setStove?(burner: 'rice' | 'pan', state: { fire: number; smoke: number }): void;
  /** Nén nhang lớn trên đàn tràng: phần còn lại 0..1; null = ẩn (không có lễ). */
  setAltarIncense?(ratio: number | null): void;
  /** Điện Tăng Đoàn: chân dung (theo id ảnh, vd 'portrait_3') bừng sáng rồi dịu lại khi vừa xong 1 lễ lạy. */
  pulsePortrait?(photoId: string): void;
  // ── Bar ──
  /** Gọi mỗi phách nhạc: đèn, sàn LED, cầu disco nháy theo. */
  onBeat?(beatIndex: number, bpm: number): void;
  /** DJ "Drop!": chớp mạnh, cầu disco quay nhanh vài giây. */
  drop?(): void;
  setLightTheme?(theme: 'neon' | 'gold' | 'ocean' | 'fire'): void;
  /**
   * Phổ nhạc thật (mỗi phần tử 0..1, dải thấp → cao, thường 20 dải) để tường LED sau DJ nhảy theo; DJ gọi mỗi khung
   * hình khi có nhạc. Lâu không gọi (> 0,5 s) thì tường LED quay về hoạt ảnh tự chạy.
   */
  setSpectrum?(bands: Float32Array): void;
  /** Nhạc DJ đang phát / đã dừng: đĩa than quay hay dừng, đèn chuyển chế độ chờ khi dừng. */
  setMusicPlaying?(playing: boolean): void;
  /** Chữ chạy "ĐANG PHÁT: …" trên bàn DJ; null = ẩn. */
  setNowPlaying?(title: string | null): void;
  /**
   * Đèn chớp toàn quán (sàn LED, đèn quét, tường LED) trong `seconds` giây — an toàn cho người nhạy sáng: ≤ 2,5 lần/giây,
   * tương phản thấp (pha tối giữ màu theme, pha sáng màu theme ngả trắng — không đen ↔ trắng lóa).
   */
  strobe?(seconds: number): void;
  /** Khói CO2 phun lên từ trước bàn DJ (~1,5 giây). */
  smoke?(): void;
  /**
   * Màn hình LED sân khấu (BAR_SCREEN, neo 'video_screen'):
   * - 'idle': hình nền club (logo NIẾT BÀN CLUB + "Dán link YouTube ở bàn DJ").
   * - 'loading': "Đang tải: <title>" — đã có video YouTube nhưng trình phát chưa chạy (đang tải / chờ giờ bắt đầu / bị
   *   chặn tự phát tiếng mà chưa bật được).
   * - 'video': mặt màn hình thành lỗ trong suốt (MeshBasicMaterial đen, opacity 0, NoBlending, fog / toneMapped false) để
   *   khung YouTube thật ở lớp CSS3D dưới canvas hiện qua; người / vật đứng trước vẫn che được.
   * Chỉ gọi khi chế độ hoặc tên đổi (vẽ lại canvas), không mỗi khung.
   */
  setVideoScreen?(mode: 'idle' | 'loading' | 'video', title?: string | null): void;
}

/**
 * Tên điểm neo (Object3D) để mini-game đặt đồ / điều khiển. Map phải cung cấp đủ các neo của mình:
 * - Chùa: 'altar_top' (giữa mặt đàn tràng, trục +X dọc chiều dài bàn), 'prep_table_top', 'stove_rice_top',
 *   'stove_pan_top', 'dining_table_top', 'release_cart_top', 'supply_cart_top', 'tree_root' (gốc bồ đề, mặt đất),
 *   'cutting_board_top', 'flower_table_top', 'lamp_table_top', 'storage_door', 'gate_wait' (chỗ khách đứng chờ),
 *   'leaf_ground' (tâm khu lá rụng, mặt đất).
 * - Bar: 'dj_booth_top', 'bar_counter_top', 'baucua_table_top', 'truth_wheel_disc' (mini-game quay quanh trục Z
 *   cục bộ), 'exchange_kiosk_top', 'npc_table_top:npc_table_1' … 'npc_table_top:npc_table_6', 'dance_floor_center',
 *   'video_screen' (tâm mặt màn hình LED sân khấu = BAR_SCREEN; +Z cục bộ hướng ra khán giả; mặt rộng BAR_SCREEN.w ×
 *   cao BAR_SCREEN.h — DJ đặt khung YouTube ở lớp CSS3D đúng tại đây, scale 1 đơn vị = 1 m).
 * - Sòng Công Đức (vị trí tính từ SONG_BAC ở anchors.ts; đồ động của mini-game đặt vào đây):
 *   'taixiu_table_top' · 'xidach_table_top', 'xidach_dealer', 'xidach_seat:1' … 'xidach_seat:5' (chỗ đặt bài, +Z cục bộ
 *   hướng ra phía khách) · 'baicao_table_top', 'baicao_dealer', 'baicao_seat:1' … 'baicao_seat:6' · 'race_track'
 *   (gốc = vạch xuất phát làn 1 trên mặt đường, +X dọc đường đua, +Z sang làn kế) · 'race_board' (mặt bảng LED, nhìn
 *   về +Z) · 'slot_reels:slot_machine_1' … '_4' (tâm ô kính 3 cuộn, nhìn về −Z) · 'slot_lever:slot_machine_N' (khớp
 *   cần gạt) · 'jackpot_display' (mặt bảng số trên bệ Hũ Công Đức, nhìn về −Z / lối giữa).
 */
export type AnchorName = string;

export interface WorldEnvironment {
  background: THREE.Color;
  fog: THREE.Fog | THREE.FogExp2 | null;
  /** Đèn của map (engine thêm vào scene). Đèn mặt trời nên castShadow. Đèn có `userData.ambient` sẽ dịu bớt trong nhà. */
  lights: THREE.Light[];
  /** Cảnh nguồn để chụp ánh sáng môi trường (IBL) — vd bầu trời vật lý; không có = không IBL. */
  envScene?: THREE.Scene;
  /** Cường độ IBL ngoài trời (mặc định 1). */
  envIntensity?: number;
  /** Độ phơi sáng tone mapping của map. */
  exposure?: number;
}

export interface WorldHandles {
  /** Gốc toàn bộ map (engine thêm vào scene). */
  readonly root: THREE.Group;
  /** Group đặt tại điểm đứng của từng trạm (id → group, đã quay theo station.ry). */
  readonly stations: ReadonlyMap<string, THREE.Group>;
  /**
   * Mái nhà theo RoofDef.id. Ở góc nhìn thứ nhất mái LUÔN hiện (người chơi đứng trong nhà thấy trần/mặt dưới mái);
   * engine chỉ có thể ẩn khi ở chế độ xem góc thứ ba (V) mà camera lọt vào trong nhà.
   */
  readonly roofs: ReadonlyMap<string, THREE.Object3D>;
  readonly anchors: ReadonlyMap<AnchorName, THREE.Object3D>;
  readonly environment: WorldEnvironment;
  readonly controls: WorldControls;
  /**
   * Tường che nhãn tên / chữ bay (phần tử HTML của CSS2DRenderer luôn vẽ đè lên canvas, không qua bộ đệm độ sâu): true
   * khi đoạn thẳng (ax, az) → (bx, bz) trên mặt bằng bị tường che. Engine gọi với camera → chủ nhãn, nhiều lần mỗi
   * khung — không cấp phát. Map không có tường ngăn phòng thì để undefined (nhãn chỉ mờ theo khoảng cách như cũ).
   */
  readonly labelOccluded?: (ax: number, az: number, bx: number, bz: number) => boolean;
  /** Hoạt ảnh nền mỗi khung hình (dt, time tính bằng giây). */
  update(dt: number, time: number): void;
  dispose(): void;
}

export type WorldBuilder = (map: MapDef, kit: ArtKit) => WorldHandles;
