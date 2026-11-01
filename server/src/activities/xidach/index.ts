// Xì Dách (Sòng Công Đức) phía server: tối đa 5 ghế theo thứ tự đặt cược, cược bằng Công Đức thật (StakeBook, ô 'hand').
// Ván: đặt cược XIDACH.betMs → chia XIDACH.dealMs → cả bàn rút/dằn cùng lúc XIDACH.turnMs (xong sớm thì đi tiếp, hết giờ
// tự rút tới đủ tuổi rồi dằn) → nhà cái lật + rút từng lá (XIDACH.dealerStepMs) + xét dần → kết quả XIDACH.resultMs.
// Máy trạng thái ở table.ts; file này kiểm dữ liệu thao tác (zod) và định tuyến. Bộ bài mặc định xào mới bằng ctx.rng mỗi
// ván — test truyền bộ xếp sẵn qua createXiDach(ctx, deckFn).
import { z } from 'zod';
import { CASINO, type Rng } from '@shared/index';
import { shuffledDeck, type Card } from '@shared/activities/cards';
import type { ActivityContext, ActivityInstance, ActivityServerModule } from '../types';
import { XiDachTable } from './table';

const amountMsg = z.object({ amount: z.literal(CASINO.chips) });

export function createXiDach(ctx: ActivityContext, deckFn: (rng: Rng) => Card[] = shuffledDeck): ActivityInstance {
  const table = new XiDachTable(ctx, deckFn);
  return {
    onInteract(p, station) {
      if (station.kind === 'xidach_table') table.open(p);
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
        case 'hit':
          return table.hit(p);
        case 'stand':
          return table.stand(p);
      }
    },
    // Đang đặt mà rời phòng / mất kết nối → hoàn; đã chia (bài = kết quả đã công khai) mà rời hẳn phòng → mất cược, ghế
    // tự chơi như hết giờ; mất kết nối tạm thời → giữ ghế, trả như thường (xem table.leave).
    onLeave: (p, reason) => table.leave(p, reason),
    isBusy: () => table.busy,
    onMapChange: () => table.mapChange(),
    dispose: () => table.dispose(),
  };
}

export const xiDachModule: ActivityServerModule = { id: 'xidach', maps: ['bar'], create: (ctx) => createXiDach(ctx) };
