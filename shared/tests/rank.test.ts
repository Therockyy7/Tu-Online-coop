import { describe, expect, it } from 'vitest';
import {
  canEnterChanhDien,
  defaultRobeFor,
  isOutfitAllowed,
  progressToNext,
  rankAtLeast,
  rankOf,
  unlockedOutfit,
} from '@shared/rules/rank';

describe('rankOf', () => {
  it.each([
    [0, 'tieu_dong'],
    [100, 'tieu_dong'],
    [101, 'hoa_thuong_tap_su'],
    [500, 'hoa_thuong_tap_su'],
    [501, 'tri_khach_tang'],
    [1500, 'tri_khach_tang'],
    [1501, 'dai_duc'],
    [4000, 'dai_duc'],
    [4001, 'thuong_toa'],
    [999_999, 'thuong_toa'],
  ] as const)('%i Công Đức → %s', (cd, rank) => {
    expect(rankOf(cd)).toBe(rank);
  });

  it('số âm coi như 0', () => {
    expect(rankOf(-5)).toBe('tieu_dong');
  });
});

describe('rankAtLeast', () => {
  it('so sánh theo thứ bậc', () => {
    expect(rankAtLeast('dai_duc', 'hoa_thuong_tap_su')).toBe(true);
    expect(rankAtLeast('hoa_thuong_tap_su', 'hoa_thuong_tap_su')).toBe(true);
    expect(rankAtLeast('tieu_dong', 'hoa_thuong_tap_su')).toBe(false);
  });
});

describe('progressToNext', () => {
  it('tính tiến độ tới cấp kế', () => {
    const p = progressToNext(51);
    expect(p.rank).toBe('tieu_dong');
    expect(p.next).toBe('hoa_thuong_tap_su');
    expect(p.current).toBe(51);
    expect(p.needed).toBe(101);
    expect(p.ratio).toBeCloseTo(51 / 101);
  });

  it('cấp cao nhất thì next = null, ratio = 1', () => {
    const p = progressToNext(5000);
    expect(p.rank).toBe('thuong_toa');
    expect(p.next).toBeNull();
    expect(p.ratio).toBe(1);
  });
});

describe('canEnterChanhDien', () => {
  it('Tiểu Đồng bị chặn, Hòa Thượng trở lên được vào, Phương Trượng luôn được vào', () => {
    expect(canEnterChanhDien('tieu_dong', false)).toBe(false);
    expect(canEnterChanhDien('tieu_dong', true)).toBe(true);
    expect(canEnterChanhDien('hoa_thuong_tap_su', false)).toBe(true);
    expect(canEnterChanhDien('thuong_toa', false)).toBe(true);
  });
});

describe('defaultRobeFor', () => {
  it('mỗi cấp một áo', () => {
    expect(defaultRobeFor('tieu_dong')).toBe('robe_nau_rach');
    expect(defaultRobeFor('hoa_thuong_tap_su')).toBe('robe_lam');
    expect(defaultRobeFor('tri_khach_tang')).toBe('robe_trang_nau');
    expect(defaultRobeFor('dai_duc')).toBe('robe_ca_sa_vang');
    expect(defaultRobeFor('thuong_toa')).toBe('robe_ca_sa_vien_do');
  });
});

describe('unlockedOutfit', () => {
  it('người mới chỉ có đồ cơ bản', () => {
    const u = unlockedOutfit(0, false);
    expect(u.robes).toEqual(['robe_nau_rach']);
    expect(u.hats).toEqual(['none']);
    expect(u.accessories).toEqual(['none']);
  });

  it('mở khóa theo Công Đức đỉnh', () => {
    const u = unlockedOutfit(650, false);
    expect(u.robes).toEqual(['robe_nau_rach', 'robe_lam', 'robe_trang_nau']);
    expect(u.hats).toEqual(['none', 'non_la', 'mu_len']);
    expect(u.accessories).toEqual(['none', 'trang_hat', 'quat_nan']);
  });

  it('đồ VIP cần Vé VIP', () => {
    const u = unlockedOutfit(0, true);
    expect(u.hats).toContain('mu_vip');
    expect(u.accessories).toContain('kinh_ram');
    expect(u.accessories).toContain('day_chuyen_vang');
    expect(u.robes).toEqual(['robe_nau_rach']);
  });

  it('isOutfitAllowed kiểm tra từng món', () => {
    const u = unlockedOutfit(150, false);
    expect(isOutfitAllowed({ robe: 'robe_lam', hat: 'non_la', accessory: 'none' }, u)).toBe(true);
    expect(isOutfitAllowed({ robe: 'robe_ca_sa_vang', hat: 'none', accessory: 'none' }, u)).toBe(false);
    expect(isOutfitAllowed({ robe: 'robe_lam', hat: 'mu_vip', accessory: 'none' }, u)).toBe(false);
  });
});
