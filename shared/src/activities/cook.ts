// Nấu cơm chay tập thể (spec 7.6) — trạng thái công khai + luật nhiệt/chín/khét dùng chung.
import { COOK } from '../config/balance';

export type CookRole = 'vo_gao' | 'nhat_rau' | 'canh_lua' | 'da_nang';

export interface CookPublicState {
  phase: 'idle' | 'lobby' | 'cooking' | 'result';
  endsAt: number;
  participants: { pid: string; name: string; role: CookRole }[];
  mealsNeeded: number;
  rice: number;
  dishes: number;
  heat: number;
  pot: { state: 'empty' | 'cooking' | 'done'; progress: number; burn: number };
  pan: { state: 'empty' | 'ready' | 'done'; progress: number; stirring: boolean };
  stock: { rice: number; veggies: number; firewood: number };
  burnt: boolean;
  result: 'success' | 'perfect' | 'timeout' | null;
}

export const mealsFor = (n: number): number => Math.min(COOK.mealsMax, COOK.mealsBase + Math.floor(n / 2));

/** Gợi ý vai theo số người (không ép): 1 người làm hết; nhiều người chia vo gạo / nhặt rau / canh lửa. */
export function cookRoles(n: number): CookRole[] {
  if (n <= 1) return ['da_nang'];
  const order: CookRole[] = ['vo_gao', 'nhat_rau', 'canh_lua'];
  return Array.from({ length: n }, (_, i) => order[i % order.length]!);
}

export const ROLE_NAMES: Record<CookRole, string> = {
  vo_gao: 'Vo gạo nấu cơm',
  nhat_rau: 'Nhặt rau xào nấm',
  canh_lua: 'Canh lửa bếp củi',
  da_nang: 'Đa năng',
};

/** Một bước mô phỏng bếp (dt giây): nhiệt giảm dần, cơm chín theo nhiệt, khét khi quá nóng. */
export function stepStove(s: { heat: number; pot: CookPublicState['pot'] }, dt: number): { burntNow: boolean } {
  s.heat = Math.max(0, s.heat - COOK.heatDecayPerSec * dt);
  let burntNow = false;
  if (s.pot.state === 'cooking') {
    const green = s.heat >= COOK.heatGreenMin;
    const rate = (100 / (COOK.cookMs / 1000)) * (green ? 1 : COOK.lowHeatCookRate * (s.heat / COOK.heatGreenMin));
    s.pot.progress = Math.min(100, s.pot.progress + rate * dt);
    if (s.heat > COOK.heatRed) s.pot.burn = Math.min(100, s.pot.burn + COOK.burnRisePerSec * dt);
    if (s.pot.burn >= 100) burntNow = true;
    else if (s.pot.progress >= 100 - 1e-6) {
      s.pot.progress = 100;
      s.pot.state = 'done';
    }
  }
  return { burntNow };
}
