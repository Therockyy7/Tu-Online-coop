// Danh sách ID dùng chung (runtime) + kiểu union suy ra từ danh sách.
// Thêm ID mới: thêm vào mảng tương ứng, kiểu tự cập nhật.

export const MAP_IDS = ['temple', 'bar'] as const;
export type MapId = (typeof MAP_IDS)[number];

export const RANK_IDS = ['tieu_dong', 'hoa_thuong_tap_su', 'tri_khach_tang', 'dai_duc', 'thuong_toa'] as const;
export type RankId = (typeof RANK_IDS)[number];

/** Mọi hoạt động/mini-game. Module server và client dùng đúng ID này. */
export const ACTIVITY_IDS = [
  // Chùa
  'sweep', // Quét lá bồ đề
  'chop', // Chẻ củi
  'water', // Xách nước
  'meditate', // Ngồi thiền định tâm
  'release', // Phóng sinh
  'cook', // Nấu cơm chay tập thể
  'chant', // Công phu tụng kinh — gõ mõ đồng điệu
  'bell', // Thỉnh Đại Hồng Chung
  'ceremony', // Đại lễ cúng dường & lập đàn tràng
  'guest', // Tri Khách: đón khách vãng lai
  'restock', // Tri Khách: nhập kho đồ chay
  'wardrobe', // Tủ áo
  'gallery', // Điện Tăng Đoàn — đảnh lễ chân dung Sư Thầy (3 lạy được Công Đức) rồi bóc quẻ lời khuyên + xem ảnh lớn
  'sutra', // Đại Pháp Đường — ngồi bồ đoàn nghe kinh (nhạc kinh thu sẵn, cả phòng nghe cùng một đoạn)
  // Bar
  'exchange', // Quầy đổi Đức
  'drink', // Gọi đồ uống
  'dance', // Thi nhảy Audition
  'dj', // DJ Chiếm Sóng
  'mixology', // Thi pha chế
  'baucua', // Bầu Cua Cá Cọp
  'truthwheel', // Vòng quay sự thật
] as const;
export type ActivityId = (typeof ACTIVITY_IDS)[number];

/** Trạng thái hoạt ảnh nhân vật (đồng bộ qua mạng). */
export const ANIM_IDS = [
  'idle',
  'walk',
  'carry_idle',
  'carry_walk',
  'sweep',
  'chop',
  'cut',
  'crank',
  'pour',
  'wash',
  'stir',
  'fan',
  'pick',
  'release',
  'sit',
  'kneel',
  'bow',
  /** Quỳ lạy: cúi rạp từ tư thế quỳ (1 lạy ≈ PORTRAIT_BOW.bowMs, hoạt ảnh tự đứng lại sau 1 lạy). */
  'prostrate',
  'pray',
  'strike',
  'pull',
  'shake',
  'drink',
  'dj',
  'dance',
  'dance2',
  'dance3',
  'wave',
  'laugh',
  'clap',
  'cry',
  'angry',
  'cheer',
  'stumble',
] as const;
export type AnimId = (typeof ANIM_IDS)[number];

/** Emote phím 1–8 (thứ tự = phím). */
export const EMOTE_IDS = ['wave', 'pray', 'laugh', 'dance', 'clap', 'cry', 'sit', 'angry'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

export const ROBE_IDS = [
  'robe_nau_rach', // Tiểu Đồng: áo nâu sồng rách
  'robe_lam', // Hòa Thượng Tập Sự: áo lam
  'robe_trang_nau', // Tri Khách Tăng: áo tràng nâu
  'robe_ca_sa_vang', // Đại Đức: cà sa vàng
  'robe_ca_sa_vien_do', // Thượng Tọa: cà sa vàng viền đỏ
  // Đồ thường cho NPC (khách vãng lai, khách bar, nhà cái…)
  'civ_ao_thun',
  'civ_ba_ba',
  'civ_party',
  'civ_vest',
] as const;
export type RobeId = (typeof ROBE_IDS)[number];
export type MonkRobeId = Extract<RobeId, `robe_${string}`>;

export const HAT_IDS = ['none', 'non_la', 'mu_len', 'mu_vip'] as const;
export type HatId = (typeof HAT_IDS)[number];

export const ACCESSORY_IDS = ['none', 'trang_hat', 'quat_nan', 'kinh_ram', 'day_chuyen_vang'] as const;
export type AccessoryId = (typeof ACCESSORY_IDS)[number];

export const HAIR_IDS = ['bald', 'short', 'long', 'bun', 'spiky'] as const;
export type HairId = (typeof HAIR_IDS)[number];

export const BUFF_IDS = ['hao_quang', 'ban_phuoc', 'no_bung'] as const;
export type BuffId = (typeof BUFF_IDS)[number];

/**
 * Vật cầm tay. `variant` (chuỗi) chi tiết thêm:
 * - animal: AnimalId · fruit: FruitId · flower/vase: FlowerColor
 * - lamp: 'empty' | 'filled' | 'lit' · incense: 'unlit' | 'lit'
 * - supply: 'rice_sack' | 'veg_crate' · cocktail: id công thức · drink_glass: id đồ uống
 */
export const HELD_KINDS = [
  'broom',
  'water_bucket',
  'animal',
  'fruit',
  'flower',
  'vase',
  'lamp',
  'incense',
  'rice',
  'rice_washed',
  'veggies',
  'veggies_cut',
  'rice_pot',
  'veggie_dish',
  'firewood',
  'supply',
  'cocktail',
  'drink_glass',
] as const;
export type HeldKind = (typeof HELD_KINDS)[number];

export const FRUIT_IDS = ['chuoi', 'buoi', 'phat_thu', 'thanh_long', 'xoai', 'du_du', 'mang_cau'] as const;
export type FruitId = (typeof FRUIT_IDS)[number];

export const FLOWER_COLORS = ['vang', 'trang', 'do', 'tim'] as const;
export type FlowerColor = (typeof FLOWER_COLORS)[number];

export const ANIMAL_IDS = ['ca', 'rua', 'chim'] as const;
export type AnimalId = (typeof ANIMAL_IDS)[number];

export const BAUCUA_SYMBOLS = ['bau', 'cua', 'tom', 'ca', 'ga', 'nai'] as const;
export type BauCuaSymbol = (typeof BAUCUA_SYMBOLS)[number];

/** Âm thanh hiệu ứng (server có thể ra lệnh phát qua fx 'sound'). */
export const SFX_IDS = [
  'mo', // cốc
  'mo_lead', // mõ dẫn nhịp (to, trầm)
  'bell_big', // Đại Hồng Chung
  'bell_small', // chuông gia trì
  'bong', // Bongggg chói tai khi đứt combo
  'sweep',
  'leaf',
  'chop',
  'chop_miss',
  'crank',
  'pour',
  'splash',
  'bird',
  'mosquito',
  'thud',
  'pop',
  'pickup',
  'putdown',
  'success',
  'fail',
  'rankup',
  'karma',
  'coin',
  'click',
  'whoosh',
  'teleport',
  'burp',
  'dice',
  'wheel_tick',
  'airhorn',
  'drop',
  'shaker',
  'cheer',
  'fire',
  'sizzle',
  'chant_hum',
  'gong',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** Nhạc nền / bài DJ. */
export const TRACK_IDS = [
  'temple_ambience',
  'chant_lofi',
  'vinahouse_dac_dao',
  'edm_niet_ban',
  'lofi_ha_son',
  'mo_house',
] as const;
export type TrackId = (typeof TRACK_IDS)[number];
export type DjTrackId = Exclude<TrackId, 'temple_ambience' | 'chant_lofi'>;
