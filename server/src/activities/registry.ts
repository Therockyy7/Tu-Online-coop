// Danh sách module hoạt động phía server. Thêm module mới: import và thêm vào mảng.
import { bauCuaModule, drinkModule, exchangeModule, truthWheelModule } from './barUtils';
import { ceremonyModule } from './ceremony';
import { chopModule } from './chop';
import { cookModule } from './cook';
import { bellModule, chantModule } from './coop';
import { danceModule } from './dance';
import { galleryModule } from './gallery';
import { djModule } from './dj';
import { mixologyModule } from './mixology';
import { sutraModule } from './sutra';
import {
  guestModule,
  meditateModule,
  releaseModule,
  restockModule,
  sweepModule,
  wardrobeModule,
  waterModule,
} from './templePersonal';
import type { ActivityServerModule } from './types';

export const ACTIVITY_MODULES: ActivityServerModule[] = [
  // Chùa
  chopModule,
  sweepModule,
  waterModule,
  releaseModule,
  meditateModule,
  wardrobeModule,
  guestModule,
  restockModule,
  cookModule,
  chantModule,
  bellModule,
  ceremonyModule,
  galleryModule,
  sutraModule,
  // Quán Bar
  djModule,
  danceModule,
  exchangeModule,
  drinkModule,
  truthWheelModule,
  bauCuaModule,
  mixologyModule,
];
