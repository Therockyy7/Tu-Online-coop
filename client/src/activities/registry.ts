// Danh sách module hoạt động phía client. Thêm module mới: import và thêm vào mảng.
import './activities.css';
import { bauCuaClient, drinkClient, exchangeClient, truthWheelClient } from './barUtils';
import { ceremonyClient } from './ceremony';
import { chopClient } from './chop';
import { cookClient } from './cook';
import { bellClient, chantClient } from './coop';
import { danceClient } from './dance';
import { djClient } from './dj';
import { galleryClient } from './gallery';
import { mixologyClient } from './mixology';
import { sutraClient } from './sutra';
import {
  guestClient,
  meditateClient,
  releaseClient,
  restockClient,
  sweepClient,
  wardrobeClient,
  waterClient,
} from './templePersonal';
import type { ActivityClientModule } from './types';

export const CLIENT_ACTIVITIES: ActivityClientModule[] = [
  // Chùa
  chopClient,
  galleryClient,
  sutraClient,
  sweepClient,
  waterClient,
  releaseClient,
  meditateClient,
  wardrobeClient,
  guestClient,
  restockClient,
  cookClient,
  chantClient,
  bellClient,
  ceremonyClient,
  // Quán Bar
  djClient,
  danceClient,
  exchangeClient,
  drinkClient,
  truthWheelClient,
  bauCuaClient,
  mixologyClient,
];
