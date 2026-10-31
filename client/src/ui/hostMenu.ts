// Menu Phương Trượng (phím H): phát bổng lộc, phạt quỳ sám hối, Hạ Sơn / Hồi Sơn + mục do mini-game thêm.
import { HOST, HOST_TITLE, type Pid } from '@shared/index';
import type { HostMenuItem, UIGameContext } from './api';
import { fmt, h } from './dom';
import type { Modals } from './modals';

export function openHostMenu(
  modals: Modals,
  ctx: UIGameContext,
  moduleItems: () => HostMenuItem[],
  toast: (text: string, tone?: 'info' | 'warn') => void,
): void {
  const s = ctx.state;
  if (!s.me.isHost) {
    toast(`Chỉ ${HOST_TITLE} mới mở được menu này.`, 'info');
    return;
  }
  const others = () => [...s.players().values()].filter((p) => p.pid !== s.me.pid && p.connected);
  const pickPlayer = async (title: string): Promise<Pid | null> =>
    modals.choose({
      title,
      options: others().map((p) => ({ value: p.pid, label: p.name, sub: `${fmt(p.congDuc)} Công Đức`, icon: '🧑' })),
    });

  const pool = s.room.pool;
  const busyMap = s.room.mapChange !== null;
  const alone = `Chưa có ai khác trong ${s.room.map === 'bar' ? 'quán' : 'chùa'}`;
  const core: HostMenuItem[] = [
    {
      id: 'gift',
      icon: '🎁',
      label: 'Phát bổng lộc',
      sub: `Lấy từ Quỹ Công Đức (còn ${fmt(pool)})`,
      disabled: pool < HOST.giftAmounts[0]! || others().length === 0,
      reason: others().length === 0 ? alone : `Quỹ cần ít nhất ${HOST.giftAmounts[0]}`,
      run: async () => {
        const target = await pickPlayer('Phát bổng lộc cho ai?');
        if (!target) return;
        const amount = await modals.choose({
          title: 'Bao nhiêu Công Đức?',
          options: HOST.giftAmounts.map((a) => ({
            value: String(a),
            label: `${a} Công Đức`,
            icon: a >= 50 ? '💰' : a >= 20 ? '🧧' : '🪷',
            disabled: a > pool,
          })),
        });
        if (amount) ctx.actions.host({ type: 'gift', target, amount: Number(amount) });
      },
    },
    {
      id: 'punish',
      icon: '🙇',
      label: 'Phạt quỳ sám hối',
      sub: 'Quỳ 15 giây, được bớt 5 Tạp Niệm',
      disabled: others().length === 0,
      reason: alone,
      run: async () => {
        const target = await pickPlayer('Phạt ai quỳ sám hối?');
        if (target) ctx.actions.host({ type: 'punish', target });
      },
    },
    s.room.map === 'temple'
      ? {
          id: 'go_bar',
          icon: '🍸',
          label: 'Hạ Sơn Xả Nghiệp',
          sub: 'Cả chùa xuống Quán Bar sau 5 giây',
          disabled: busyMap,
          reason: 'Đang dịch chuyển',
          run: () => ctx.actions.host({ type: 'go_bar' }),
        }
      : {
          id: 'go_temple',
          icon: '🏯',
          label: 'Hồi Sơn',
          sub: 'Cả nhóm về chùa sau 5 giây',
          disabled: busyMap,
          reason: 'Đang dịch chuyển',
          run: () => ctx.actions.host({ type: 'go_temple' }),
        },
  ];
  const items = [...core, ...moduleItems()];

  const panel = modals.openPanel({ id: 'host-menu', title: `👑 Menu ${HOST_TITLE}`, width: 600, className: 'host-panel' });
  h('div', 'host-pool', `🏺 Quỹ Công Đức của chùa: ${fmt(pool)}  ·  Bấm số hoặc chuột để chọn`, panel.body);
  const grid = h('div', 'host-grid', '', panel.body);
  const run = (item: HostMenuItem) => {
    if (item.disabled) return;
    panel.close();
    void Promise.resolve(item.run());
  };
  items.forEach((item, i) => {
    const b = h('button', `host-item ${item.disabled ? 'disabled' : ''}`, '', grid);
    b.type = 'button';
    b.disabled = !!item.disabled;
    if (i < 9) h('span', 'choose-num', String(i + 1), b);
    h('span', 'host-icon', item.icon ?? '✦', b);
    const t = h('span', 'host-text', '', b);
    h('span', 'host-label', item.label, t);
    const sub = item.disabled && item.reason ? item.reason : item.sub;
    if (sub) h('span', 'host-sub', sub, t);
    b.addEventListener('click', () => run(item));
  });
  const onKey = (e: KeyboardEvent) => {
    if (panel.closed) {
      removeEventListener('keydown', onKey, true);
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const m = /^Digit([1-9])$/.exec(e.code);
    if (!m) return;
    const item = items[Number(m[1]) - 1];
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    // Mục đang khóa: bỏ qua, giữ nguyên phím tắt cho các mục khác.
    if (item.disabled) return;
    removeEventListener('keydown', onKey, true);
    run(item);
  };
  addEventListener('keydown', onKey, true);
}
