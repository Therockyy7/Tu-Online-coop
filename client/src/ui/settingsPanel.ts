// Bảng cài đặt: âm lượng, độ nhạy chuột, đảo trục Y, chất lượng đồ họa, mã khôi phục, rời chùa.
import { isValidPlayerKey } from '@shared/index';
import { prefs, settings, type Settings } from '../settings';
import type { UIGameContext } from './api';
import { button, copyText, h } from './dom';
import type { Modals } from './modals';

export function openSettings(
  modals: Modals,
  ctx: UIGameContext,
  toast: (text: string, tone?: 'info' | 'good' | 'warn' | 'bad') => void,
): void {
  const panel = modals.openPanel({ id: 'settings', title: '⚙ Cài đặt', width: 460, className: 'settings-panel' });
  const body = panel.body;

  const section = (title: string) => {
    const sec = h('div', 'set-section', '', body);
    h('div', 'set-title', title, sec);
    return sec;
  };
  const slider = (parent: HTMLElement, label: string, key: keyof Settings, min: number, max: number, step: number, show: (v: number) => string) => {
    const row = h('label', 'set-row', '', parent);
    h('span', 'set-label', label, row);
    const input = h('input', 'set-range', '', row);
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings.get()[key]);
    const val = h('span', 'set-val', show(Number(input.value)), row);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = show(v);
      settings.set({ [key]: v } as Partial<Settings>);
    });
  };
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const audioSec = section('Âm thanh');
  slider(audioSec, 'Âm lượng tổng', 'volMaster', 0, 1, 0.01, pct);
  slider(audioSec, 'Nhạc nền', 'volMusic', 0, 1, 0.01, pct);
  slider(audioSec, 'Hiệu ứng', 'volSfx', 0, 1, 0.01, pct);
  button('🔔 Nghe thử', 'btn-ghost btn-small', () => {
    ctx.audio.unlock();
    ctx.audio.play('mo');
    setTimeout(() => ctx.audio.play('bell_small'), 260);
  }, audioSec);

  const ctrl = section('Điều khiển');
  slider(ctrl, 'Độ nhạy chuột', 'sensitivity', 0.6, 6, 0.1, (v) => v.toFixed(1));
  const inv = h('label', 'set-row check', '', ctrl);
  const cb = h('input', '', '', inv);
  cb.type = 'checkbox';
  cb.checked = settings.get().invertY;
  cb.addEventListener('change', () => settings.set({ invertY: cb.checked }));
  h('span', 'set-label', 'Đảo trục dọc chuột', inv);

  const gfx = section('Đồ họa');
  const seg = h('div', 'segmented', '', gfx);
  const mk = (label: string, q: Settings['quality']) => {
    const b = button(label, `seg ${settings.get().quality === q ? 'on' : ''}`, () => {
      settings.set({ quality: q });
      for (const c of seg.children) c.classList.remove('on');
      b.classList.add('on');
    }, seg);
  };
  mk('Đẹp (bóng + phát sáng)', 'high');
  mk('Nhẹ (máy yếu)', 'low');

  const acc = section('Mã khôi phục');
  h('p', 'set-note', 'Giữ mã này để chơi tiếp hồ sơ (Công Đức, Đức, Xu, VIP) trên máy khác. Đừng gửi cho người lạ.', acc);
  const keyRow = h('div', 'key-row', '', acc);
  const keyEl = h('code', 'recovery', '•'.repeat(32), keyRow);
  let shown = false;
  button('Hiện', 'btn-ghost btn-small', () => {
    shown = !shown;
    keyEl.textContent = shown ? ctx.state.key : '•'.repeat(32);
  }, keyRow);
  button('Sao chép', 'btn-ghost btn-small', async () => {
    toast((await copyText(ctx.state.key)) ? 'Đã sao chép mã khôi phục.' : 'Không sao chép được, hãy bấm Hiện rồi chép tay.', 'good');
  }, keyRow);
  const restoreRow = h('div', 'key-row', '', acc);
  const restore = h('input', 'input input-small', '', restoreRow);
  restore.placeholder = 'Dán mã khôi phục (32 ký tự)';
  restore.maxLength = 64;
  button('Dùng mã này', 'btn-secondary btn-small', async () => {
    const k = restore.value.trim().toLowerCase();
    if (!isValidPlayerKey(k)) {
      toast('Mã khôi phục gồm 32 ký tự 0–9, a–f.', 'warn');
      return;
    }
    if (!(await modals.confirm('Đổi hồ sơ?', 'Bạn sẽ rời chùa và vào lại bằng hồ sơ của mã này.'))) return;
    prefs.save({ key: k });
    ctx.actions.leaveRoom();
  }, restoreRow);

  const leave = h('div', 'set-section', '', body);
  button('🚪 Rời chùa về sảnh', 'btn-danger', async () => {
    if (await modals.confirm('Rời chùa?', 'Tiến trình đã được lưu. Bạn có thể vào lại bằng mã chùa.')) ctx.actions.leaveRoom();
  }, leave);
}
