// Đại lễ cúng dường & lập đàn tràng (spec 7.9) — sơ đồ phong thủy ngẫu nhiên, vị trí trên đàn, chia vai.
import { CEREMONY } from '../config/balance';
import { FLOWER_COLORS, FRUIT_IDS, type FlowerColor, type FruitId } from '../ids';
import type { HeldItem } from '../types';
import { createRng } from '../util/rng';

export interface CeremonyLayout {
  fruits: FruitId[];
  vases: FlowerColor[];
}

export function ceremonyLayout(seed: number): CeremonyLayout {
  const rng = createRng(seed);
  return {
    fruits: rng.shuffle(FRUIT_IDS).slice(0, CEREMONY.fruitSlots),
    vases: rng.shuffle(FLOWER_COLORS).slice(0, CEREMONY.vaseSlots),
  };
}

export interface CeremonySlot {
  id: string;
  kind: 'fruit' | 'vase' | 'lamp' | 'incense';
  variant?: string;
  /** Vị trí trên mặt đàn (m, theo trục dài của bàn), để client bày đồ. */
  x: number;
  z: number;
}

export function ceremonySlots(layout: CeremonyLayout): CeremonySlot[] {
  const slots: CeremonySlot[] = [];
  layout.fruits.forEach((f, i) => slots.push({ id: `fruit_${i}`, kind: 'fruit', variant: f, x: -0.9 + i * 0.45, z: 0.3 }));
  layout.vases.forEach((c, i) => slots.push({ id: `vase_${i}`, kind: 'vase', variant: c, x: i ? 3.1 : -3.1, z: 0 }));
  for (let i = 0; i < CEREMONY.lampSlots; i++) slots.push({ id: `lamp_${i}`, kind: 'lamp', variant: 'lit', x: i ? 2.0 : -2.0, z: 0.1 });
  slots.push({ id: 'incense_0', kind: 'incense', variant: 'lit', x: 0, z: -0.25 });
  return slots;
}

/** Vật đang cầm có đúng yêu cầu của ô không. */
export function slotAccepts(slot: CeremonySlot, held: HeldItem | null): boolean {
  if (!held) return false;
  if (slot.kind === 'fruit') return held.kind === 'fruit' && held.variant === slot.variant;
  if (slot.kind === 'vase') return held.kind === 'vase' && held.variant === slot.variant;
  if (slot.kind === 'lamp') return held.kind === 'lamp' && held.variant === 'lit';
  return held.kind === 'incense' && held.variant === 'lit';
}

export type CeremonyRole = 'bay_le' | 'hai_qua' | 'cam_hoa' | 'huong_dang' | 'da_nang';

export const CEREMONY_ROLE_NAMES: Record<CeremonyRole, string> = {
  bay_le: 'Bày lễ',
  hai_qua: 'Hái quả',
  cam_hoa: 'Cắm hoa',
  huong_dang: 'Hương đăng',
  da_nang: 'Đa năng',
};

/** Chia vai: dưới 4 người tất cả Đa năng; từ 4 người: Bày lễ ≈ 30%, còn lại 3 : 2 : 2 (quả : hoa : hương đăng). */
export function ceremonyRoles(n: number): CeremonyRole[] {
  if (n < CEREMONY.roleThreshold) return Array.from({ length: n }, () => 'da_nang');
  const arrangers = Math.max(1, Math.round(n * CEREMONY.arrangerShare));
  const rest = n - arrangers;
  const { fruit, flower, light } = CEREMONY.roleRatio;
  const sum = fruit + flower + light;
  const nFruit = Math.round((rest * fruit) / sum);
  const nFlower = Math.round((rest * flower) / sum);
  const nLight = rest - nFruit - nFlower;
  return [
    ...Array<CeremonyRole>(nFruit).fill('hai_qua'),
    ...Array<CeremonyRole>(nFlower).fill('cam_hoa'),
    ...Array<CeremonyRole>(Math.max(0, nLight)).fill('huong_dang'),
    ...Array<CeremonyRole>(arrangers).fill('bay_le'),
  ];
}

export interface CeremonyPublicState {
  active: boolean;
  startAt: number;
  endsAt: number;
  cooldownUntil: number;
  seed: number;
  placed: Record<string, boolean>;
  prep: HeldItem[];
  participants: { pid: string; name: string; role: CeremonyRole }[];
  result: 'success' | 'fail' | null;
}
