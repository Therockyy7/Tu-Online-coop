// Xem thử tượng Phật đá (so với ảnh mẫu): ánh sáng studio dịu, các góc nhìn chính diện / cận mặt / nghiêng / bệ sen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { prepareBuddha, realisticBuddha } from '../../art/temple/buddha';
import type { PreviewView } from '../types';

const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  'Toàn thân': { pos: [0, 1.85, 10.2], target: [0, 1.81, 0], fov: 23.5 },
  'Cận mặt': { pos: [0, 3.05, 3.2], target: [0, 3.05, 0], fov: 22 },
  'Thân + tay': { pos: [0, 1.75, 5.6], target: [0, 1.7, 0], fov: 24 },
  'Nghiêng 3/4': { pos: [5.5, 2.3, 7.2], target: [0, 1.8, 0], fov: 24 },
  'Mặt nghiêng': { pos: [2.2, 3.05, 2.2], target: [0, 3.0, 0], fov: 24 },
  'Bệ sen': { pos: [0, 0.9, 6.2], target: [0, 0.45, 0], fov: 26 },
  'Sau lưng': { pos: [-4, 2.6, -8], target: [0, 1.8, 0], fov: 26 },
};

const view: PreviewView = {
  id: 'buddha',
  title: 'Tượng Phật',
  async setup(ctx) {
    const { scene, renderer, camera, controls } = ctx;
    renderer.toneMapping = THREE.AgXToneMapping;
    scene.background = new THREE.Color('#e7e7e3');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    const key = new THREE.DirectionalLight('#fff6ea', 3.2);
    key.position.set(-5, 7, 6);
    const rim = new THREE.DirectionalLight('#e8f0ff', 0.7);
    rim.position.set(5, 4, -4);
    scene.add(key, rim, new THREE.HemisphereLight('#ffffff', '#8a8a80', 0.35));

    const info = document.createElement('div');
    info.textContent = 'Đang dựng lưới…';
    ctx.panel.append(info);
    const t0 = performance.now();
    await prepareBuddha();
    const b = realisticBuddha();
    scene.add(b.group);
    // Đếm tam giác từng mức chi tiết (LOD: gần / xa).
    const count = (root: THREE.Object3D) => {
      let tris = 0;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const n = (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
        tris += (m as THREE.InstancedMesh).isInstancedMesh ? n * (m as THREE.InstancedMesh).count : n;
      });
      return `${Math.round(tris / 1000)}k`;
    };
    const lod = b.group.children.find((o) => (o as THREE.LOD).isLOD) as THREE.LOD | undefined;
    const levels = lod ? lod.levels.map((l) => count(l.object)).join(' / ') : count(b.group);
    info.textContent = `Dựng ${((performance.now() - t0) / 1000).toFixed(1)} s · ${levels} tam giác (gần / xa)`;

    const go = (name: string) => {
      const v = VIEWS[name]!;
      camera.fov = v.fov;
      camera.updateProjectionMatrix();
      camera.position.set(...v.pos);
      controls.target.set(...v.target);
      controls.update();
    };
    for (const name of Object.keys(VIEWS)) ctx.button(name, () => go(name));
    const wanted = new URLSearchParams(location.search).get('cam');
    go(wanted && VIEWS[wanted] ? wanted : 'Toàn thân');
    (window as unknown as { __cam: (n: string) => void }).__cam = go;
  },
};

export default view;
