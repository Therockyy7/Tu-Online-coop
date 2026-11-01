// Danh sách module hoạt động phía client. Thêm module mới: import và thêm vào mảng.
import './activities.css';
import { baiCaoClient } from './baicao';
import { bauCuaClient, drinkClient, exchangeClient, truthWheelClient } from './barUtils';
import { ceremonyClient } from './ceremony';
import { chopClient } from './chop';
import { cookClient } from './cook';
import { bellClient, chantClient } from './coop';
import { danceClient } from './dance';
import { djClient } from './dj';
import { duaNguaClient } from './duangua';
import { galleryClient } from './gallery';
import { mixologyClient } from './mixology';
import { noHuClient } from './nohu';
import { sutraClient } from './sutra';
import { taiXiuClient } from './taixiu';
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
import { xiDachClient } from './xidach';

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
  // Sòng Công Đức
  taiXiuClient,
  xiDachClient,
  baiCaoClient,
  noHuClient,
  duaNguaClient,
];
