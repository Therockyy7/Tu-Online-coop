// Map "khối thô" dựng thẳng từ dữ liệu va chạm — dùng làm stub ban đầu và chế độ gỡ lỗi (?debugWorld=1).
import * as THREE from 'three';
import type { MapDef } from '@shared/index';
import { defaultAnchors } from './anchors';
import type { WorldBuilder, WorldHandles } from './api';
import type { ArtKit } from './kit';

const TAG_COLORS: Record<string, string> = {
  wall_perimeter: '#c9b58e',
  wall_chanh_dien: '#f3d58f',
  wall_kitchen: '#e9d3a3',
  buddha: '#e8b04a',
  bell: '#a9743b',
  pond: '#6cc3d5',
  tree: '#5fae4e',
  fruit_tree: '#5fae4e',
  bodhi: '#3f8a3a',
  wall_tang_doan: '#efe4cf',
  storage_shed: '#c98d5a',
};

export const buildDebugWorld: WorldBuilder = (map: MapDef, kit: ArtKit): WorldHandles => {
  const root = new THREE.Group();
  root.name = `debug:${map.id}`;
  const isBar = map.id === 'bar';
  const { minX, maxX, minZ, maxZ } = map.bounds;
  root.add(
    kit.mesh(kit.geo.ground(maxX - minX + 6, maxZ - minZ + 6), kit.mat(isBar ? kit.PALETTE.barFloor : kit.PALETTE.grass), {
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      castShadow: false,
    }),
  );
  for (const c of map.colliders) {
    const color = TAG_COLORS[c.tag] ?? (isBar ? '#6b5b95' : '#b8b2a7');
    if (c.kind === 'box') root.add(kit.mesh(kit.geo.box(c.w, 1.2, c.d), kit.mat(color), { x: c.x, y: 0.6, z: c.z }));
    else root.add(kit.mesh(kit.geo.cyl(c.r, c.r, 1.2, 12), kit.mat(color), { x: c.x, y: 0.6, z: c.z }));
  }
  for (const g of map.gates) {
    root.add(
      kit.mesh(kit.geo.box(g.box.w, 0.15, g.box.d), kit.mat('#ff5a5a', { transparent: true, opacity: 0.6 }), {
        x: g.box.x,
        y: 0.08,
        z: g.box.z,
      }),
    );
  }
  const stations = new Map<string, THREE.Group>();
  for (const s of map.stations) {
    const grp = new THREE.Group();
    grp.name = `station:${s.id}`;
    grp.position.set(s.x, 0, s.z);
    grp.rotation.y = s.ry;
    grp.add(
      kit.mesh(new THREE.RingGeometry(Math.max(0.05, s.r - 0.08), s.r, 28).rotateX(-Math.PI / 2), kit.glowMat('#ffe14f', 0.55), {
        y: 0.03,
        castShadow: false,
        receiveShadow: false,
      }),
    );
    root.add(grp);
    stations.set(s.id, grp);
  }
  const roofs = new Map<string, THREE.Object3D>();
  for (const r of map.roofs) {
    const m = kit.mesh(kit.geo.box(r.box.w, 0.3, r.box.d), kit.mat(kit.PALETTE.roofTile), { x: r.box.x, y: 4.2, z: r.box.z });
    roofs.set(r.id, m);
    root.add(m);
  }
  const anchors = new Map<string, THREE.Object3D>();
  for (const [name, spec] of defaultAnchors(map)) {
    const o = new THREE.Object3D();
    o.name = `anchor:${name}`;
    o.position.set(spec.x, spec.y, spec.z);
    o.rotation.y = spec.ry ?? 0;
    root.add(o);
    anchors.set(name, o);
  }
  const hemi = new THREE.HemisphereLight(isBar ? '#8a7dff' : '#ffffff', isBar ? '#1a1030' : '#7da05f', isBar ? 1.2 : 1.6);
  const sun = new THREE.DirectionalLight('#fff3dc', isBar ? 1.2 : 2.6);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -50;
  sc.right = 50;
  sc.top = 50;
  sc.bottom = -50;
  sc.far = 150;
  return {
    root,
    stations,
    roofs,
    anchors,
    environment: { background: new THREE.Color(isBar ? '#120f1f' : kit.PALETTE.sky), fog: null, lights: [hemi, sun] },
    controls: {},
    update() {},
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry.type === 'RingGeometry') m.geometry.dispose();
      });
    },
  };
};
