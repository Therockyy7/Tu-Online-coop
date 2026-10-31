// Xem thử map "khối thô" dựng từ dữ liệu va chạm (kiểm tra bố cục shared/maps).
import { MAPS, type MapId } from '@shared/index';
import { buildDebugWorld } from '../../art/debugWorld';
import type { PreviewView } from '../types';

const view: PreviewView = {
  id: 'debug',
  title: 'Bố cục thô',
  setup(ctx) {
    let current: ReturnType<typeof buildDebugWorld> | null = null;
    const show = (id: MapId) => {
      if (current) {
        ctx.scene.remove(current.root, ...current.environment.lights);
        current.dispose();
      }
      current = buildDebugWorld(MAPS[id], ctx.kit);
      ctx.scene.add(current.root, ...current.environment.lights);
      ctx.scene.background = current.environment.background;
      ctx.camera.position.set(0, id === 'temple' ? 70 : 40, id === 'temple' ? 60 : 32);
      ctx.controls.target.set(0, 0, 0);
    };
    ctx.button('Chùa', () => show('temple'));
    ctx.button('Bar', () => show('bar'));
    show('temple');
  },
};

export default view;
