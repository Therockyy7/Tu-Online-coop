import { describe, expect, it } from 'vitest';
import { pickHost } from '@shared/rules/host';

describe('pickHost', () => {
  it('người cao Công Đức nhất làm Phương Trượng', () => {
    expect(
      pickHost([
        { pid: 'a', congDuc: 10, joinedAt: 1, connected: true },
        { pid: 'b', congDuc: 300, joinedAt: 2, connected: true },
        { pid: 'c', congDuc: 50, joinedAt: 3, connected: true },
      ]),
    ).toBe('b');
  });

  it('bằng điểm → ai vào trước', () => {
    expect(
      pickHost([
        { pid: 'a', congDuc: 0, joinedAt: 5, connected: true },
        { pid: 'b', congDuc: 0, joinedAt: 2, connected: true },
      ]),
    ).toBe('b');
  });

  it('bỏ qua người mất kết nối', () => {
    expect(
      pickHost([
        { pid: 'a', congDuc: 999, joinedAt: 1, connected: false },
        { pid: 'b', congDuc: 1, joinedAt: 2, connected: true },
      ]),
    ).toBe('b');
  });

  it('không còn ai kết nối → null', () => {
    expect(pickHost([])).toBeNull();
    expect(pickHost([{ pid: 'a', congDuc: 1, joinedAt: 1, connected: false }])).toBeNull();
  });
});
