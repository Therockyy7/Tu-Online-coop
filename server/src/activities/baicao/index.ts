// Bài Cào 3 lá (Sòng Công Đức) phía server: cược bằng Công Đức thật (StakeBook, ô 'hand'), không giới hạn số người.
// Ván: đặt cược BAICAO.betMs → chia 3 lá mỗi tay + nhà cái, lật dần BAICAO.revealMs → trả thưởng, kết quả BAICAO.resultMs.
// Máy trạng thái ở table.ts; file này kiểm dữ liệu thao tác (zod) và định tuyến. Bộ bài mặc định xào mới bằng ctx.rng mỗi
// ván — test truyền bộ xếp sẵn qua createBaiCao(ctx, deckFn).
import { z } from 'zod';
import { CASINO, type Rng } from '@shared/index';
import { shuffledDeck, type Card } from '@shared/activities/cards';
import type { ActivityContext, ActivityInstance, ActivityServerModule } from '../types';
import { BaiCaoTable } from './table';

const amountMsg = z.object({ amount: z.literal(CASINO.chips) });

export function createBaiCao(ctx: ActivityContext, deckFn: (rng: Rng) => Card[] = shuffledDeck): ActivityInstance {
  const table = new BaiCaoTable(ctx, deckFn);
  return {
    onInteract(p, station) {
      if (station.kind === 'baicao_table') table.open(p);
    },
    onAction(p, type, data) {
      switch (type) {
        case 'open':
          // Nút "Mở ván mới" trên bảng: phải đứng gần như khi bấm E.
          if (table.near(p.pid)) table.open(p);
          return;
        case 'bet':
        case 'unbet': {
          const r = amountMsg.safeParse(data);
          if (!r.success) return;
          if (type === 'bet') table.bet(p, r.data.amount);
          else table.unbet(p, r.data.amount);
          return;
        }
      }
    },
    // Đang đặt mà rời phòng / mất kết nối → hoàn; đã chia (bài = kết quả đã công khai) mà rời hẳn phòng → mất cược, để
    // không ai thấy mình thua rồi rời phòng lấy lại tiền; mất kết nối tạm thời → giữ, trả như thường (xem table.leave).
    onLeave: (p, reason) => table.leave(p, reason),
    isBusy: () => table.busy,
    onMapChange: () => table.mapChange(),
    dispose: () => table.dispose(),
  };
}

export const baiCaoModule: ActivityServerModule = { id: 'baicao', maps: ['bar'], create: (ctx) => createBaiCao(ctx) };
