// Chuỗi tiếng Việt dùng chung. Chuỗi riêng của một mini-game có thể đặt trong module của nó.
import type {
  AccessoryId,
  ActivityId,
  AnimalId,
  BauCuaSymbol,
  BuffId,
  EmoteId,
  FlowerColor,
  FruitId,
  HatId,
  HeldKind,
  MapId,
  RankId,
  RobeId,
} from '../ids';

export const RANK_NAMES: Record<RankId, string> = {
  tieu_dong: 'Tiểu Đồng Quét Lá',
  hoa_thuong_tap_su: 'Hòa Thượng Tập Sự',
  tri_khach_tang: 'Tri Khách Tăng',
  dai_duc: 'Đại Đức',
  thuong_toa: 'Thượng Tọa',
};

export const HOST_TITLE = 'Phương Trượng';

export const MAP_NAMES: Record<MapId, string> = {
  temple: 'Chùa',
  bar: 'Quán Bar',
};

export const ROBE_NAMES: Record<RobeId, string> = {
  robe_nau_rach: 'Áo nâu sồng rách',
  robe_lam: 'Áo lam',
  robe_trang_nau: 'Áo tràng nâu',
  robe_ca_sa_vang: 'Cà sa vàng',
  robe_ca_sa_vien_do: 'Cà sa vàng viền đỏ',
  civ_ao_thun: 'Áo thun',
  civ_ba_ba: 'Áo bà ba',
  civ_party: 'Đồ đi quẩy',
  civ_vest: 'Áo vest',
};

export const HAT_NAMES: Record<HatId, string> = {
  none: 'Không đội',
  non_la: 'Nón lá',
  mu_len: 'Mũ len',
  mu_vip: 'Mũ VIP',
};

export const ACCESSORY_NAMES: Record<AccessoryId, string> = {
  none: 'Không đeo',
  trang_hat: 'Tràng hạt',
  quat_nan: 'Quạt nan',
  kinh_ram: 'Kính râm',
  day_chuyen_vang: 'Dây chuyền vàng',
};

export const BUFF_NAMES: Record<BuffId, string> = {
  hao_quang: 'Hào quang ×2',
  ban_phuoc: 'Được ban phước',
  no_bung: 'No bụng',
};

export const ACTIVITY_NAMES: Record<ActivityId, string> = {
  sweep: 'Quét lá bồ đề',
  chop: 'Chẻ củi',
  water: 'Xách nước',
  meditate: 'Ngồi thiền định tâm',
  release: 'Phóng sinh',
  cook: 'Nấu cơm chay',
  chant: 'Công phu tụng kinh',
  bell: 'Thỉnh Đại Hồng Chung',
  ceremony: 'Đại lễ cúng dường',
  guest: 'Đón khách vãng lai',
  restock: 'Nhập kho đồ chay',
  wardrobe: 'Tủ áo',
  gallery: 'Điện Tăng Đoàn',
  sutra: 'Nghe kinh — Đại Pháp Đường',
  exchange: 'Quầy đổi Đức',
  drink: 'Gọi đồ uống',
  dance: 'Thi nhảy',
  dj: 'DJ Chiếm Sóng',
  mixology: 'Thi pha chế',
  baucua: 'Bầu Cua Cá Cọp',
  truthwheel: 'Vòng quay sự thật',
  taixiu: 'Tài Xỉu chẵn lẻ',
  xidach: 'Xì Dách',
  baicao: 'Bài Cào 3 lá',
  nohu: 'Nổ Hũ',
  duangua: 'Đua Ngựa',
};

export const EMOTE_NAMES: Record<EmoteId, string> = {
  wave: 'Chào',
  pray: 'A Di Đà Phật',
  laugh: 'Cười lăn',
  dance: 'Nhảy',
  clap: 'Vỗ tay',
  cry: 'Khóc',
  sit: 'Ngồi thiền',
  angry: 'Giận dỗi',
};

export const EMOTE_ICONS: Record<EmoteId, string> = {
  wave: '👋',
  pray: '🙏',
  laugh: '🤣',
  dance: '💃',
  clap: '👏',
  cry: '😭',
  sit: '🧘',
  angry: '😤',
};

export const FRUIT_NAMES: Record<FruitId, string> = {
  chuoi: 'Chuối',
  buoi: 'Bưởi',
  phat_thu: 'Phật thủ',
  thanh_long: 'Thanh long',
  xoai: 'Xoài',
  du_du: 'Đu đủ',
  mang_cau: 'Mãng cầu',
};

export const FLOWER_NAMES: Record<FlowerColor, string> = {
  vang: 'vàng',
  trang: 'trắng',
  do: 'đỏ',
  tim: 'tím',
};

export const ANIMAL_NAMES: Record<AnimalId, string> = {
  ca: 'Cá',
  rua: 'Rùa',
  chim: 'Chim',
};

export const BAUCUA_NAMES: Record<BauCuaSymbol, string> = {
  bau: 'Bầu',
  cua: 'Cua',
  tom: 'Tôm',
  ca: 'Cá',
  ga: 'Gà',
  nai: 'Nai',
};

/** Tên hiển thị vật cầm tay (variant ghép thêm khi cần). */
export function heldItemName(kind: HeldKind, variant?: string): string {
  switch (kind) {
    case 'broom':
      return 'Chổi tre';
    case 'water_bucket':
      return 'Xô nước';
    case 'animal':
      return variant === 'ca' ? 'Xô cá' : variant === 'rua' ? 'Chậu rùa' : 'Lồng chim';
    case 'fruit':
      return `Quả ${FRUIT_NAMES[variant as FruitId] ?? ''}`.trim();
    case 'flower':
      return `Hoa ${FLOWER_NAMES[variant as FlowerColor] ?? ''}`.trim();
    case 'vase':
      return `Bình hoa ${FLOWER_NAMES[variant as FlowerColor] ?? ''}`.trim();
    case 'lamp':
      return variant === 'lit' ? 'Đèn dầu đã thắp' : variant === 'filled' ? 'Đèn dầu đầy' : 'Đèn dầu rỗng';
    case 'incense':
      return variant === 'lit' ? 'Nén hương đã thắp' : 'Nén hương';
    case 'rice':
      return 'Gạo';
    case 'rice_washed':
      return 'Gạo đã vo';
    case 'veggies':
      return 'Rau nấm';
    case 'veggies_cut':
      return 'Rau nấm đã thái';
    case 'rice_pot':
      return 'Nồi cơm chín';
    case 'veggie_dish':
      return 'Đĩa rau xào';
    case 'firewood':
      return 'Bó củi';
    case 'supply':
      return variant === 'veg_crate' ? 'Thùng rau' : 'Bao gạo';
    case 'cocktail':
      return 'Ly cocktail';
    case 'drink_glass':
      return 'Ly đồ uống';
  }
}

/** Chữ "Tạp niệm" bật lên khi quét lá / khi thiền. */
export const THOUGHT_WORDS = [
  'Trà sữa',
  'Deadline',
  'Người yêu cũ',
  'Lương tháng',
  'Game mới',
  'Crush',
  'Nợ nần',
  'Mạng lag',
  'Sale 11.11',
  'Lẩu nướng',
  'Drama',
  'Tiền điện',
  'Story 24h',
  'Kèo nhậu',
  'Idol',
  'Bóng đá',
];

export const GATE_MESSAGES = {
  vip: 'Khu VIP — cần Vé VIP mới được vào.',
};

/** Câu hỏi/thử thách Vòng quay sự thật — vui, lành mạnh. */
export const TRUTH_PROMPTS = [
  'Kể lần gần nhất bạn ngủ quên trễ giờ.',
  'Món ăn bạn có thể ăn cả tuần không chán là gì?',
  'Bạn từng giả vờ hiểu điều gì để khỏi bị hỏi lại?',
  'Kể một tật xấu nhỏ mà bạn vẫn chưa bỏ được.',
  'Nếu được làm Phương Trượng một ngày, bạn sẽ ra luật gì?',
  'Bài hát bạn hay hát dở nhất khi đi karaoke?',
  'Bạn từng lỡ gửi tin nhắn nhầm người chưa? Kể đi.',
  'Ai trong phòng này bạn nghĩ sẽ thành Phương Trượng nhanh nhất?',
  'Lần cuối bạn khóc vì phim là phim gì?',
  'Bạn sợ con vật gì nhất?',
  'Kể một lần bạn bị "quê" nhất.',
  'App bạn mở nhiều nhất mỗi ngày là gì?',
  'Bạn đã từng thức trắng vì chơi game chưa?',
  'Món quà tệ nhất bạn từng nhận là gì?',
  'Bạn hay nói dối câu gì nhất? ("Sắp tới rồi"?)',
  'Nếu trúng số, việc đầu tiên bạn làm là gì?',
  'Kỷ niệm đáng nhớ nhất với hội bạn này?',
  'Bạn từng crush ai lâu nhất? (không cần nói tên)',
  'Bạn có biệt danh nào xấu hổ không?',
  'Câu nói cửa miệng của bạn là gì?',
];

export const DARE_PROMPTS = [
  'Nhảy một điệu tại chỗ trong 10 giây (emote 4).',
  'Hát 1 câu bất kỳ trên Discord.',
  'Khen người bên trái bạn 3 câu.',
  'Nói "A Di Đà Phật" bằng giọng MC sự kiện.',
  'Gõ vào chat một câu thả thính siêu sến.',
  'Đi một vòng sàn nhảy và vỗ tay (emote 5).',
  'Bắt chước tiếng mõ bằng miệng 5 lần.',
  'Đổi tên gọi người kế bên thành "Đại sư" đến hết vòng.',
  'Kể một câu chuyện cười trong 30 giây.',
  'Làm động tác thiền giữa sàn nhảy 10 giây (emote 7).',
  'Gửi một emoji mô tả tâm trạng hiện tại vào chat.',
  'Tự giới thiệu bản thân như một MC gameshow.',
  'Đọc to 3 Tạp niệm lớn nhất của bạn hôm nay.',
  'Chọn 1 người và "bao" họ 1 câu khen.',
  'Làm một tràng cười ma quái trên Discord.',
  'Nói chuyện bằng giọng robot trong 1 phút.',
  'Gõ vào chat tên món ăn bạn thèm nhất lúc này.',
  'Làm động tác lạy Phật về phía DJ (emote 2).',
  'Hát chế 1 câu nhạc có chữ "mõ".',
  'Tạo dáng "Đại gia bao quán" và chụp màn hình.',
];

/** Tên khách NPC. */
export const NPC_NAMES = [
  'Cô Ba',
  'Chú Tư',
  'Bà Sáu',
  'Anh Hai',
  'Chị Út',
  'Ông Bảy',
  'Bé Na',
  'Dì Năm',
  'Cậu Tám',
  'Thím Chín',
];

/** Câu chọc vui khi làm sai. */
export const JOKES = {
  releaseWrongFish: 'Cá không biết leo cây đâu!',
  releaseWrongBird: 'Chim không biết bơi nha!',
  chopMiss: 'Cạch! Trượt rồi.',
  burnt: 'Khét lẹt rồi! Trừ đức nha.',
  jarFull: 'Chum đầy rồi!',
  wrongFengShui: 'Sai phong thủy!',
  noFirewood: 'Hết củi, đi chẻ củi đi!',
  stationBusy: 'Có người đang dùng rồi.',
  tooFar: 'Lại gần hơn chút nữa.',
  handsFull: 'Tay đang bận cầm đồ rồi (Q để bỏ).',
  rankTooLow: 'Cấp bậc chưa đủ.',
};
