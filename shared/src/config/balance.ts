// MỌI con số cân bằng game nằm ở đây (spec mục 4–8). Chỉnh ở đây sau khi chơi thử.
// Thời gian tính bằng ms, khoảng cách bằng mét.
import type { AccessoryId, DjTrackId, HatId, MonkRobeId, RankId } from '../ids';

export const ROOM = {
  maxPlayers: 20,
  codeChars: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  codeLength: 4,
  publicCode: 'CHUA',
  emptyTtlMs: 5 * 60_000,
  reconnectGraceMs: 60_000,
  maxCoopParticipants: 10,
} as const;

export const NET = {
  tickHz: 20,
  snapHz: 15,
  poseHz: 15,
  interpDelayMs: 100,
  chatMaxLen: 120,
  chatPerSec: 1,
  chatBurst: 3,
  posePerSec: 30,
  actPerSec: 20,
  clockPingIntervalMs: 10_000,
  /** Dung sai khoảng cách khi server kiểm tra người chơi có đứng gần trạm không. */
  interactSlack: 1,
} as const;

export const MOVE = {
  speed: 5,
  radius: 0.45,
  /** Hệ số tốc độ khi cầm vật. */
  carry: { default: 0.85, water_bucket: 0.7, animal: 0.8, supply: 0.75, rice_pot: 0.8 } as Record<string, number>,
  /** Server chấp nhận tốc độ tới mức này × tốc độ tối đa. */
  speedTolerance: 1.3,
} as const;

export const RANK_THRESHOLDS: Record<RankId, number> = {
  tieu_dong: 0,
  hoa_thuong_tap_su: 101,
  tri_khach_tang: 501,
  dai_duc: 1501,
  thuong_toa: 4001,
};

export const KARMA = {
  /** Tạp Niệm 100 thì chỉ nhận (1 − 0.5) = 50% Công Đức. */
  tapNiemPenaltyAtMax: 0.5,
  /** Phần trăm cộng thêm vào Quỹ Công Đức của phòng cho mỗi khoản nhận dương. */
  poolShare: 0.1,
  tapNiemMax: 100,
  tapNiemCloud: 50,
  tapNiemStorm: 80,
} as const;

export const BUFFS = {
  hao_quang: { mult: 2, durationMs: 180_000 },
  ban_phuoc: { mult: 1.2, durationMs: 180_000 },
  no_bung: { mult: 1.1, durationMs: 180_000, speedBonus: 0.2 },
} as const;

export const HOST = {
  giftAmounts: [10, 20, 50],
  punishMs: 15_000,
  punishTapNiemRelief: 5,
  punishCooldownMs: 30_000,
  punishSameTargetMs: 120_000,
  mapChangeCountdownMs: 5_000,
  /**
   * Ghế Phương Trượng đổi qua lại giữa cùng một cặp người trong chừng này (vd đặt / gỡ cược Sòng Công Đức quanh mức
   * Công Đức của nhau) → ghế vẫn đổi thật nhưng không bắn lại banner / chuông / tin chat cho cả phòng.
   */
  swapQuietMs: 30_000,
} as const;

export const BLESS = {
  mult: 1.2,
  durationMs: 180_000,
  cooldownMs: 90_000,
  blesserReward: 2,
  range: 3,
} as const;

// ───────────────────────────── Chùa ─────────────────────────────

export const SWEEP = {
  maxLeaves: 80,
  spawnEveryMs: 2000,
  spawnCount: 3,
  windChangeMs: 30_000,
  /** Thời gian lá trôi trong gió trước khi nằm xuống. */
  driftMs: 4000,
  sweepIntervalMs: 400,
  sweepRadius: 1.8,
  bagMax: 30,
  /** Đổ bao: +1 Công Đức mỗi N lá. */
  leavesPerKarma: 2,
  thoughtChance: 0.12,
  thoughtWindowMs: 1500,
  thoughtKeys: ['J', 'K', 'L', 'U', 'I', 'O'],
  thoughtSuccessTapNiem: -2,
  thoughtSuccessKarma: 1,
  thoughtFailTapNiem: 1,
} as const;

export const CHOP = {
  logs: 8,
  basePeriodMs: 1600,
  periodStepMs: 80,
  minPeriodMs: 700,
  /** Bề rộng vùng xanh / vùng hoàn hảo trên thanh 0..1. */
  greenWidth: 0.18,
  perfectWidth: 0.06,
  rewardPerfect: 3,
  rewardGood: 2,
  firewoodPerHit: 1,
  firewoodMax: 40,
  firewoodStart: 10,
  /** Dung sai thời điểm (độ trễ mạng) khi server chấm. */
  judgeSlackMs: 60,
  /** Nghỉ giữa 2 khúc. */
  logGapMs: 900,
} as const;

export const WATER = {
  crankPresses: 12,
  crankTimeoutMs: 6000,
  crankMinMs: 1200,
  rewardPour: 4,
  jarCapacity: 5,
  jarDrainMs: 40_000,
} as const;

export const MEDITATE = {
  durationMs: 40_000,
  greenDeg: 15,
  yellowDeg: 35,
  disturbMinMs: 5000,
  disturbMaxMs: 8000,
  keyWindowMs: 1500,
  stillWindowMs: 1500,
  kickDeg: 20,
  rewardBase: 4,
  rewardScale: 10,
  tapNiemBase: 8,
  tapNiemScale: 30,
  /** Server chấp nhận kết thúc sớm hơn tối đa chừng này (độ trễ). */
  durationSlackMs: 2000,
} as const;

/** Đảnh lễ chân dung Sư Thầy ở Điện Tăng Đoàn (mỗi lễ được bóc một lá quẻ ở client). */
export const PORTRAIT_BOW = {
  /** Thời gian 1 lạy (cúi rạp + ngẩng lên); server chặn lạy dồn nhanh hơn `minIntervalMs`. */
  bowMs: 1800,
  minIntervalMs: 1300,
  /** Đủ chừng này lạy liền nhau thì thành 1 lễ. */
  bowsPerRite: 3,
  /** Công Đức mỗi lễ (qua hệ số Tạp Niệm/buff như thường). */
  reward: 2,
  /** Tạp Niệm giảm mỗi lễ (số âm). */
  tapNiem: -3,
  /** Mỗi người chỉ được thưởng lại ở cùng một chân dung sau chừng này. */
  cooldownMs: 5 * 60_000,
} as const;

/** Lạy "Xả nghiệp" ở bồ đoàn trước Bảng Vàng Điện Tăng Đoàn: lạy như đảnh lễ chân dung, mỗi lễ chỉ bớt Tạp Niệm. */
export const XA_NGHIEP = {
  /** Tạp Niệm giảm mỗi lễ (số âm; còn ít hơn thì về 0). Không có Công Đức, không bóc quẻ. */
  tapNiem: -10,
  /** Mỗi người chỉ được xả nghiệp lại sau chừng này. */
  cooldownMs: 5 * 60_000,
} as const;

export const RELEASE = {
  cartMax: 6,
  refillMs: 20_000,
  reward: 6,
  wrongPenalty: 2,
} as const;

export const COOK = {
  lobbyMs: 10_000,
  durationMs: 150_000,
  maxPlayers: 6,
  mealsBase: 1,
  mealsMax: 3,
  washPresses: 10,
  cutSequenceLength: 6,
  stirMs: 8000,
  heatDecayPerSec: 4,
  firewoodHeat: 30,
  bellowsHeat: 3,
  bellowsMinIntervalMs: 120,
  heatGreenMin: 40,
  heatGreenMax: 75,
  heatRed: 85,
  cookMs: 30_000,
  /** Tốc độ chín khi nhiệt dưới vùng xanh (tỉ lệ so với bình thường). */
  lowHeatCookRate: 0.35,
  burnRisePerSec: 12,
  rewardSuccess: 15,
  rewardPerfect: 25,
  perfectMinRemainingMs: 30_000,
  burnPenalty: 5,
  timeoutReward: 3,
  stockStart: { rice: 10, veggies: 10 },
  stockMax: 40,
} as const;

export interface SutraDef {
  id: string;
  name: string;
  bpm: number;
  beats: number;
  /** 'quarter' chỉ nốt đen; 'eighths' có móc đơn; 'mixed' móc đơn + dấu lặng. */
  pattern: 'quarter' | 'eighths' | 'mixed';
  /** Số hướng mũi tên: 2 (← →) hoặc 4 (← ↑ → ↓). */
  arrows: 2 | 4;
  /** Xác suất một nốt ngân dài (giữ phím) ở phách chẵn trong câu. */
  hold: number;
  /** Xác suất mũi tên đỏ (bấm hướng ngược) từ câu thứ 3 trở đi. */
  reverse: number;
}

export const CHANT = {
  lobbyMs: 20_000,
  countdownMs: 3000,
  perfectMs: 45,
  goodMs: 100,
  /** Gõ khi không có nốt trong khoảng này = gõ trật nhịp. */
  strayMs: 150,
  /** Server chốt kết quả mỗi nốt sau đuôi nốt chừng này. */
  finalizeDelayMs: 250,
  /** Mỗi câu kinh 8 phách; phách cuối câu là tiếng Khánh (Space) — kiểu Audition chốt phách 4. */
  phraseBeats: 8,
  /** Nốt ngân dài: thả phím sớm hơn đuôi nốt quá chừng này thì "đứt hơi" (tính trượt). */
  holdEarlyMs: 140,
  comboForHaoQuang: 20,
  bonusPer20Combo: 10,
  rewardPerfect: 2,
  rewardGood: 1,
  endBonusMax: 20,
  goodWeight: 0.6,
  minParticipantsForHaoQuang: 2,
  sutras: [
    { id: 'tam_kinh', name: 'Tâm Kinh Bát Nhã', bpm: 72, beats: 64, pattern: 'quarter', arrows: 2, hold: 0.22, reverse: 0 },
    { id: 'a_di_da', name: 'Kinh A Di Đà', bpm: 84, beats: 72, pattern: 'eighths', arrows: 4, hold: 0.14, reverse: 0 },
    { id: 'dai_bi', name: 'Chú Đại Bi', bpm: 96, beats: 84, pattern: 'mixed', arrows: 4, hold: 0.1, reverse: 0.2 },
  ] as SutraDef[],
  tempos: [0.85, 1, 1.15],
} as const;

export const BELL = {
  ropes: 4,
  minPlayers: 3,
  countdownMs: 3000,
  strikes: 3,
  oscillationMs: 2000,
  zoneMin: 70,
  zoneMax: 90,
  nearRanges: [
    [55, 70],
    [90, 95],
  ] as [number, number][],
  zoneScore: { in: 1, near: 0.6, out: 0.25 },
  releaseTimeoutMs: 5000,
  syncPerfectMs: 120,
  syncMaxMs: 400,
  syncFactorAtMax: 0.4,
  syncFactorBeyond: 0.3,
  rewardBase: 2,
  rewardScale: 8,
  pullerMultiplier: 2,
  cooldownMs: 60_000,
  strikeGapMs: 3500,
} as const;

export const CEREMONY = {
  durationMs: 150_000,
  cooldownMs: 300_000,
  fruitSlots: 5,
  vaseSlots: 2,
  lampSlots: 2,
  incenseSlots: 1,
  pickHoldMs: 1500,
  arrangeHoldMs: 2000,
  prepTableMax: 12,
  /** Từ số người này trở lên mới chia vai và giới hạn quyền bày lễ. */
  roleThreshold: 4,
  arrangerShare: 0.3,
  roleRatio: { fruit: 3, flower: 2, light: 2 },
  rewardSuccess: 40,
  rewardRoom: 10,
  rewardFail: 5,
} as const;

export const GUEST = {
  spawnEveryMs: 40_000,
  maxWaiting: 3,
  waitMs: 120_000,
  reward: 6,
  followSpeed: 4.2,
  minRank: 'tri_khach_tang' as RankId,
} as const;

export const RESTOCK = {
  amount: 5,
  reward: 3,
  minRank: 'tri_khach_tang' as RankId,
} as const;

/** Điều kiện mở khóa đồ trong Tủ áo: số = Công Đức đỉnh; 'vip' = cần Vé VIP. */
export const WARDROBE_UNLOCKS: {
  robes: Record<MonkRobeId, number>;
  hats: Record<HatId, number | 'vip'>;
  accessories: Record<AccessoryId, number | 'vip'>;
} = {
  robes: {
    robe_nau_rach: 0,
    robe_lam: 101,
    robe_trang_nau: 501,
    robe_ca_sa_vang: 1501,
    robe_ca_sa_vien_do: 4001,
  },
  hats: { none: 0, non_la: 100, mu_len: 300, mu_vip: 'vip' },
  accessories: { none: 0, trang_hat: 200, quat_nan: 600, kinh_ram: 'vip', day_chuyen_vang: 'vip' },
};

// ───────────────────────────── Bar ─────────────────────────────

export const EXCHANGE = {
  xuPerDuc: 10,
  baoQuanCost: 100,
  baoQuanXu: 100,
  vipCost: 300,
  maxExchangePerAction: 1000,
} as const;

export interface DrinkDef {
  id: string;
  name: string;
  price: number;
  say: number;
  tapNiem: number;
}

export const DRINKS = {
  menu: [
    { id: 'bia_bo_de', name: 'Bia Bồ Đề', price: 20, say: 20, tapNiem: 3 },
    { id: 'mojito_niet_ban', name: 'Mojito Niết Bàn', price: 30, say: 30, tapNiem: 4 },
    { id: 'ruou_can_tap_niem', name: 'Rượu Cần Tạp Niệm', price: 50, say: 45, tapNiem: 6 },
  ] as DrinkDef[],
  vipDiscount: 0.5,
} as const;

export const DO_SAY = {
  decayPerSec: 1,
  max: 100,
  wobble: 30,
  sway: 60,
  stumble: 85,
} as const;

export const DANCE = {
  lobbyMs: 15_000,
  measures: 16,
  introMeasures: 2,
  arrowsMin: 3,
  arrowsMax: 9,
  reverseFromMeasure: 10,
  perfectMs: 40,
  greatMs: 80,
  goodMs: 130,
  points: { perfect: 100, great: 70, good: 40, miss: 0 },
  perfectComboBonus: 10,
  rewards: [100, 60, 40],
  rewardOthers: 15,
  tapNiem: 5,
  maxPlayers: 10,
} as const;

export interface DjTrackDef {
  id: DjTrackId;
  name: string;
  bpm: number;
}

/**
 * Bàn DJ (spec Quán Bar mở rộng mục 4): ai đứng ở bàn cũng chỉnh được, mỗi lúc 1 người. `tracks` = 4 bài tổng hợp
 * (Web Audio); 4 bài thu sẵn + số đo BPM/phách ở `shared/src/activities/dj.ts` (DJ_TRACKS = thu sẵn trước, tổng hợp sau).
 */
export const DJ = {
  tracks: [
    { id: 'vinahouse_dac_dao', name: 'Vinahouse Đắc Đạo', bpm: 136 },
    { id: 'edm_niet_ban', name: 'EDM Niết Bàn', bpm: 128 },
    { id: 'lofi_ha_son', name: 'Lofi Hạ Sơn', bpm: 90 },
    { id: 'mo_house', name: 'Mõ House', bpm: 124 },
  ] as DjTrackDef[],
  dropCooldownMs: 8000,
  hornCooldownMs: 5000,
  confettiCooldownMs: 10_000,
  smokeCooldownMs: 10_000,
  strobeCooldownMs: 10_000,
  /** Đèn chớp kéo dài (ms). */
  strobeMs: 4000,
  /** Đổi bài (⏮ ⏭, chọn bài) tối thiểu cách nhau. */
  switchCooldownMs: 3000,
  /** Phát / dừng tối thiểu cách nhau (đỡ bấm dồn làm cả quán tua nhạc liên tục). */
  toggleCooldownMs: 1000,
  /** Đổi màu đèn tối thiểu cách nhau (đỡ bấm xen kẽ làm đèn cả quán nháy liên tục, lách thời gian nghỉ đèn chớp). */
  themeCooldownMs: 800,
  /** Vào Bar: bài đầu bắt đầu sau ngần này (máy khách kịp tải nhạc). */
  enterDelayMs: 1000,
  /** Đổi bài / phát tiếp / sang bài kế: bắt đầu sau ngần này. */
  switchDelayMs: 800,
  /** Người đứng bàn đi xa hơn bán kính trạm + ngần này (m) → bàn trống. */
  leaveSlack: 2,
  /** Mức to nhạc DJ khi đứng trong Sòng Công Đức (sảnh Bar = 1). */
  casinoLevel: 0.55,
  /** Link YouTube ở bàn DJ + màn hình LED sân khấu (spec 2026-11-02-dj-youtube-led-design.md). */
  youtube: {
    /**
     * Nhịp danh nghĩa khi phát YouTube (video không có số đo nhịp): đèn / sàn LED nháy theo, khớp nhịp tự chạy của Bar
     * (124). Thi nhảy không chấm theo nhịp này — mở sảnh nhảy thì tự chuyển về nhạc thu sẵn.
     */
    bpm: 124,
    /** Phát video: bắt đầu sau ngần này (máy khách kịp tải trình phát YouTube). */
    startDelayMs: 2500,
    /** Hết thời lượng + ngần này mới sang bài (bù chênh giờ, máy dính quảng cáo đầu video). */
    endGraceMs: 2000,
    /** Phát quá ngần này mà chưa máy nào báo được thời lượng (không phải livestream) → coi như không phát được. */
    metaTimeoutMs: 30_000,
    /**
     * Thời lượng máy khách báo phải nằm trong khoảng này (ms). Trần 13 giờ: YouTube cho tải lên video tới 12 giờ (loại
     * "nhạc 10 tiếng") — trần thấp hơn thì video dài bị bỏ báo cáo rồi bị cắt ở mốc `metaTimeoutMs`.
     */
    minDurationMs: 1000,
    maxDurationMs: 13 * 3600_000,
    /** Hàng chờ tối đa (không tính video đang phát). */
    queueMax: 10,
    /** Độ dài tối đa (ký tự) tên video / tên kênh sau khi làm sạch. */
    titleMax: 80,
    authorMax: 40,
    /** Link dán vào dài tối đa (ký tự). */
    urlMax: 500,
    /** Dán link tối thiểu cách nhau (mỗi lần dán server tra cứu YouTube 1 lần). */
    pasteCooldownMs: 3000,
    /** Chờ tra cứu YouTube (oEmbed) tối đa; quá thì vẫn nhận link với tên chung. */
    lookupTimeoutMs: 3000,
  },
} as const;

export interface IngredientDef {
  id: string;
  name: string;
  /** Phím số 1–6. */
  key: number;
}

export interface RecipeDef {
  id: string;
  name: string;
  ingredients: string[];
}

export const MIXOLOGY = {
  lobbyMs: 10_000,
  durationMs: 90_000,
  stations: 4,
  shakeBeats: 8,
  tipBase: 20,
  tipMin: 10,
  tipMax: 40,
  winnerBonus: 50,
  tapNiem: 3,
  orderMinMs: 4000,
  orderMaxMs: 7000,
  maxOrders: 6,
  ingredients: [
    { id: 'da', name: 'Đá', key: 1 },
    { id: 'chanh', name: 'Chanh', key: 2 },
    { id: 'bac_ha', name: 'Bạc hà', key: 3 },
    { id: 'ruou_nep', name: 'Rượu nếp', key: 4 },
    { id: 'siro', name: 'Siro dâu', key: 5 },
    { id: 'soda', name: 'Soda', key: 6 },
  ] as IngredientDef[],
  recipes: [
    { id: 'mojito_niet_ban', name: 'Mojito Niết Bàn', ingredients: ['bac_ha', 'chanh', 'soda'] },
    { id: 'sinh_to_tap_niem', name: 'Sinh Tố Tạp Niệm', ingredients: ['siro', 'da', 'chanh'] },
    { id: 'tra_da_vo_uu', name: 'Trà Đá Vô Ưu', ingredients: ['da', 'chanh', 'bac_ha'] },
    { id: 'ruou_nep_than_thong', name: 'Rượu Nếp Thần Thông', ingredients: ['ruou_nep', 'siro', 'da'] },
    { id: 'soda_giai_thoat', name: 'Soda Giải Thoát', ingredients: ['soda', 'siro', 'bac_ha'] },
    { id: 'cocktail_ha_son', name: 'Cocktail Hạ Sơn', ingredients: ['ruou_nep', 'chanh', 'soda'] },
  ] as RecipeDef[],
} as const;

export const BAUCUA = {
  betMs: 15_000,
  rollMs: 3000,
  payoutMs: 5000,
  chip: 10,
  maxBetPerRound: 200,
  tapNiem: 2,
  /** Bàn dừng quay khi chừng này vòng liên tiếp không ai cược. */
  idleRounds: 3,
  nearRange: 5,
} as const;

export const TRUTHWHEEL = {
  cooldownMs: 15_000,
  spinMs: 5000,
} as const;

// ─────────────── Sòng Công Đức — cược bằng Công Đức thật (ctx.wager), spec 2026-11-01 ───────────────
// Mỗi khối thuộc đúng 1 trò; lane làm trò nào chỉ sửa khối của trò đó.

export const CASINO = {
  /** Mệnh giá phỉnh (Công Đức) ở 4 bàn theo ván; phím 1–4 chọn. */
  chips: [1, 5, 10, 50],
  /** Trần tổng cược của 1 người trong 1 ván ở 1 bàn. */
  maxBetPerRound: 100,
  /** Tạp Niệm cộng cho mỗi người có cược khi ván chốt (đỏ đen làm tâm loạn). */
  tapNiemPerRound: 2,
  /** Bàn tự nghỉ khi chừng này ván liên tiếp không ai cược (hoặc không còn ai đứng gần). */
  idleRounds: 3,
  /** Dung sai (m) cộng thêm bán kính trạm khi server kiểm "đứng gần bàn". */
  nearSlack: 0.6,
  /**
   * Tin chat "tụt cấp vì đỏ đen" của 1 người tối đa 1 lần trong chừng này (toast riêng vẫn gửi mỗi lần) — đặt / gỡ cược
   * quanh ngưỡng cấp không spam cả phòng.
   */
  demoteChatCooldownMs: 60_000,
} as const;

/** Tài Xỉu chẵn lẻ: 3 xúc xắc; lãi theo ô (thua cả 4 ô Tài/Xỉu/Chẵn/Lẻ khi ra bộ ba). */
export const TAIXIU = {
  betMs: 15_000,
  rollMs: 3000,
  payoutMs: 5000,
  /** Lãi × tiền cược (thắng nhận lại cược + lãi). */
  payout: { tai: 1, xiu: 1, chan: 1, le: 1, bo_ba: 30 },
  /** Số ván gần nhất hiện ở bảng cầu. */
  history: 16,
} as const;

/**
 * Xì Dách (luật Việt): Át 2 lá 11/10/1, 3 lá 10/1, ≥ 4 lá 1; người đủ 16 mới dằn; nhà cái rút tới 16 rồi **xét dần**
 * (chốt ghế thua/hòa, còn ghế hơn điểm thì rút tiếp — xem xiDachDealerStep). **Ngũ Linh lãi ×1** (spec ghi ×2): với ×2
 * người chơi khá nhìn lá ngửa nhà cái là có lợi thế dương — có Át thì rút "miễn phí" (Át 3 lá = 10/1, không thể Quắc) và
 * đuổi Ngũ Linh gần như chắc thắng: chiến lược S2 +0,87% (600 000 ván), chơi tối ưu +2,03% → Công Đức sinh ra từ không khí.
 * Lợi thế nhà cái với ×1, đo bằng chính hàm luật (bộ 52 lá xào bằng createRng(20261101); cách đo + test hồi quy ở
 * shared/tests/xidach.test.ts): người rút tới 16 rồi dằn 3,9% (1 ghế, 200 000 ván) · 3,6% (5 ghế × 40 000 ván, seed 7);
 * S2 (dưới 16 rút; có Át mà ≤ 18 — 3 lá ≤ 19 — thì rút; 4 lá ≤ 17 rút; đúng 16 mà lá ngửa A hoặc 7–K thì rút) 2,3%
 * (600 000 ván); chơi tối ưu (expectimax theo lá ngửa, bộ bài vô hạn, tính chính xác) 1,32%. Nếu nhà cái chỉ rút tới 16
 * rồi dừng thì lỗ ≈ 6,9% (hai bên đối xứng mà lãi đặc biệt chỉ người chơi hưởng); nâng dealerStandAt lên 17 thì tệ hơn
 * (người chơi tối ưu lời 0,8%).
 */
export const XIDACH = {
  betMs: 15_000,
  dealMs: 2500,
  /** Cả bàn rút/dằn cùng lúc trong chừng này; hết giờ tự rút tới đủ tuổi rồi dằn. */
  turnMs: 20_000,
  dealerStepMs: 900,
  resultMs: 6000,
  seats: 5,
  playerMinStand: 16,
  /** Nhà cái rút tới chừng này mới được xét bài. */
  dealerStandAt: 16,
  maxCards: 5,
  /** Lãi × tiền cược theo hạng thắng. */
  payout: { xi_bang: 3, xi_dach: 2, ngu_linh: 1, win: 1 },
} as const;

/**
 * Bài Cào 3 lá: nút = tổng mod 10, Ba Tiên (3 lá J/Q/K) cao nhất; bằng nút so lá lớn nhất (K > Q > J > 10 > … > Át), vẫn
 * bằng thì nhà cái thắng; thêm luật **bù gặp bù (cùng 0 nút) → nhà cái ăn, không so lá**. Lợi thế nhà cái (liệt kê chính
 * xác mọi cặp tay 3 lá rời nhau, shared/tests/baicao.test.ts): **0,933%**. Lý do thêm luật bù: đúng luật spec (lãi ×1,
 * Ba Tiên ×2) nhà cái chỉ lợi 0,077% — dưới khoảng [0,5%; 4%]; trong các cách chỉnh, luật bù lệch spec ít nhất (coi J/Q/K
 * ngang nhau khi so lá 2,14%; so lá theo điểm 3,57%; bằng nút nhà cái ăn luôn 8,8% — quá cao). Khách thắng thường 48,05%,
 * thắng bằng Ba Tiên 0,99%; mỗi nút 0..9 ra ≈ 10%, Ba Tiên 1%.
 */
export const BAICAO = {
  betMs: 15_000,
  /** Chia + lật dần (pha 'resolving'). */
  revealMs: 3000,
  /** Trong revealMs: bài bay hết trong chừng này đầu tiên, phần còn lại lật 3 đợt (lá 1 → 2 → 3 của mọi tay + nhà cái). */
  dealFlyMs: 1400,
  resultMs: 6000,
  /** Lãi × tiền cược: thắng thường / thắng bằng Ba Tiên (nỉ bàn in "BA TIÊN ĂN ĐÔI" đọc từ đây). */
  payout: { win: 1, ba_tien: 2 },
  /** Số tay khách bày lá 3D trên bàn (người cược thêm vẫn chơi, chỉ hiện ở bảng). */
  seats3d: 6,
} as const;

export const NOHU_SYMBOLS = ['bia', 'dao', 'sen', 'chuong', 'vang', 'that', 'hu'] as const;
export type NoHuSymbol = (typeof NOHU_SYMBOLS)[number];

/**
 * Nổ Hũ: 3 cuộn × 1 đường. Số ô mỗi biểu tượng trên từng cuộn (mỗi cuộn 32 ô). Bảng trả (× mức cược):
 * 3 giống nhau theo `paytable`; 3 "quả" bất kỳ lẫn nhau (bia/đào/sen) ×`mixedFruit`; đúng 2 hũ ×`twoHu`; 3 hũ = nổ hũ.
 * Với số dưới đây: trả lại (chưa tính hũ) 27757/32768 ≈ 84,7%, tần suất trúng ≈ 32,6%, nổ hũ 9/32768 ≈ 1/3641 lượt;
 * cộng 10% góp hũ → ≈ 94,7%. Khóa bằng test liệt kê đủ 32³ tổ hợp (shared/tests/nohu.test.ts); dải cuộn dựng tất
 * định từ `reelCounts` ở shared/src/activities/nohu.ts. Nổ hũ ăn theo tỉ lệ mức cược (cược / cược tối đa × hũ, cược 20 ăn
 * trọn — user chốt 2026-11-01) nên mọi mức cược cùng trả lại dài hạn ≈ 94,4–95,7% (mô phỏng 8 triệu lượt 2 người cược 20
 * và 1 xen kẽ, 3 seed); nếu ai nổ cũng ăn trọn hũ thì người cược 1 hớt hũ người cược 20 nuôi (~190%).
 */
export const NOHU = {
  machines: 4,
  bets: [1, 5, 10, 20],
  spinMs: 2200,
  /** Mốc dừng từng cuộn tính từ lúc quay (ms). */
  reelStopMs: [1200, 1700, 2200],
  /** Khoảng cách tối thiểu giữa 2 lượt của một máy. */
  minIntervalMs: 2400,
  jackpotSeed: 100,
  jackpotShare: 0.1,
  tapNiemPerSpin: 1,
  /** Đi xa quá bán kính trạm máy + chừng này (m) thì tự rời máy (lượt đang quay vẫn được trả). */
  leaveSlack: 1,
  reelCounts: [
    { bia: 9, dao: 7, sen: 5, chuong: 4, vang: 2, that: 2, hu: 3 },
    { bia: 9, dao: 7, sen: 5, chuong: 4, vang: 2, that: 2, hu: 3 },
    { bia: 10, dao: 7, sen: 6, chuong: 4, vang: 2, that: 2, hu: 1 },
  ] as Record<NoHuSymbol, number>[],
  paytable: { bia: 4, dao: 6, sen: 10, chuong: 15, vang: 40, that: 80 } as Record<Exclude<NoHuSymbol, 'hu'>, number>,
  fruits: ['bia', 'dao', 'sen'] as NoHuSymbol[],
  mixedFruit: 2,
  twoHu: 3,
} as const;

/**
 * Đua Ngựa: 6 ngựa, phong độ ngẫu nhiên mỗi ván → xác suất về nhất → tỉ lệ trả (đã trừ biên nhà cái). Lợi thế nhà cái
 * đo trên 2 000 ván seed cố định (shared/tests/duangua.test.ts): ≈ 7,8% (biên 7% + phần làm tròn xuống 0,1 — ngựa
 * mạnh nhất chịu nặng hơn: trung bình ≈ 8,4%, cá biệt tới ~11%; ngựa yếu nhất ≈ 7,35%).
 * Tiền trả là số nguyên: floor(tổng cược của 1 người vào ngựa đó × tỉ lệ) (raceReturn) — giữ làm tròn XUỐNG vì làm tròn
 * lên / làm tròn thường có thể cho kỳ vọng > 1 (vd p 0,252, tỉ lệ ×3,6, cược 1 mà trả 4). Nên biên thực phụ thuộc mệnh
 * giá (đo bằng raceOdds + raceReturn, 200 000 ván, createRng(20261101)): tổng cược vào 1 ngựa là bội số 10 → 7,82% (cược
 * đều 6 ngựa) / 8,45% (luôn cược ngựa ưa chuộng nhất); là 5 → 8,67% / 10,05%; là 1 → 15,36% / 22,13% (vd ×2,3 chỉ trả 2).
 */
export const DUANGUA = {
  horses: 6,
  betMs: 20_000,
  raceMs: 12_000,
  resultMs: 6000,
  /** Biên nhà cái: tỉ lệ trả = (1 − margin) / p, làm tròn xuống 0,1. */
  margin: 0.07,
  minOdds: 1.5,
  maxWinProb: 0.4,
  minWinProb: 0.05,
  /** Phong độ mỗi ván: trọng số e^u, u đều trong [−formSpread, formSpread] (rồi chuẩn hóa + kẹp [min, max]). */
  formSpread: 1,
  /** Số ván gần nhất hiện ở bảng "ngựa về nhất". */
  history: 12,
  /** Số mốc tiến độ của kịch bản đua (kể cả mốc 0 và mốc về đích). */
  keyframes: 13,
  /** Các ngựa sau về đích trễ hơn ngựa nhất trong khoảng này (ms). */
  trailMinMs: 150,
  trailMaxMs: 1500,
} as const;
