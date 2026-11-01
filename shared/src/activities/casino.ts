// Kiểu dùng chung của các bàn Sòng Công Đức (Tài Xỉu, Xì Dách, Bài Cào, Đua Ngựa) — cược bằng Công Đức thật.
// Luật + trạng thái công khai riêng từng trò nằm ở shared/src/activities/<trò>.ts.

/** Pha của 1 bàn theo ván: nghỉ → đặt cược → đang lắc/chia/đua → kết quả. */
export type CasinoPhase = 'idle' | 'betting' | 'resolving' | 'result';

/** Cược của 1 người trong 1 ván: khóa ô cược (vd 'tai', 'horse_3', 'hand') → số Công Đức. */
export type StakeMap = Record<string, number>;

export const stakeTotal = (m: StakeMap | undefined): number => (m ? Object.values(m).reduce((a, b) => a + (b > 0 ? b : 0), 0) : 0);

/** Kết quả chốt ván của 1 người (gửi kèm trạng thái để bảng hiện thắng/thua). */
export interface CasinoSettleLine {
  pid: string;
  name: string;
  /** Tổng đã cược. */
  staked: number;
  /** Tổng nhận lại (gồm cả tiền cược khi thắng/hòa). */
  back: number;
  /** back − staked. */
  net: number;
}
