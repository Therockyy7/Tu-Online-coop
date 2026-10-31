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
  minRank: 'hoa_thuong_tap_su' as RankId,
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

export const DJ = {
  tracks: [
    { id: 'vinahouse_dac_dao', name: 'Vinahouse Đắc Đạo', bpm: 136 },
    { id: 'edm_niet_ban', name: 'EDM Niết Bàn', bpm: 128 },
    { id: 'lofi_ha_son', name: 'Lofi Hạ Sơn', bpm: 90 },
    { id: 'mo_house', name: 'Mõ House', bpm: 124 },
  ] as DjTrackDef[],
  dropCooldownMs: 8000,
  hornCooldownMs: 5000,
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
