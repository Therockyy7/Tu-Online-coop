// Đại Pháp Đường: điện nghe kinh lớn nhất chùa — KHUNG, sẽ được dựng đầy đủ. Bố cục đọc từ PHAP_DUONG (shared).
import * as THREE from 'three';
import type { TempleCtx } from './ctx';

export interface PhapDuongHandles {
  roof: THREE.Group;
}

export function buildPhapDuong(_ctx: TempleCtx, _sunDir: THREE.Vector3): PhapDuongHandles {
  return { roof: new THREE.Group() };
}
