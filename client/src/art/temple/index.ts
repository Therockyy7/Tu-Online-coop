// Map Chùa 3D: ghép bầu trời, núi, mặt đất, công trình, đồ vật ở trạm, sự sống; cung cấp nhóm trạm, mái, điểm neo,
// môi trường ánh sáng và điều khiển hình ảnh cho mini-game (WorldHandles).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { createRng } from '@shared/index';
import { defaultAnchors } from '../anchors';
import type { WorldBuilder, WorldHandles } from '../api';
import { createMountains } from '../common/sky';
import { createWind, windMaterial } from '../common/wind';
import { leafMaterial, needleMaterial, type TreeMats } from '../common/nature';
import { kit as defaultKit } from '../kit';
import { prepareBuddha } from './buddha';
import { buildBellTower, buildChanhDien, buildHaSonGate, buildKitchen, buildStorage, buildTamQuan, buildWalls } from './buildings';
import { anchor, type TempleCtx } from './ctx';
import { buildGround } from './ground';
import { pondLife, skyLife, smokeSystem } from './life';
import { buildPhapDuong } from './phapDuong';
import { buildPhapDuongYard } from './phapDuongYard';
import { buildStationProps } from './stations';
import { buildTangDoan } from './tangDoan';

const SUN_DIR = new THREE.Vector3(30, 52, 34).normalize();

// Dựng lưới tượng Phật (Web Worker) ngay khi tải game — tới lúc vào Chùa thường đã xong, không giật khung hình.
void prepareBuddha();

/**
 * Nén chỗ sáng của bầu trời thấy được (HDR, trước phơi sáng): từ `knee` trở lên nén mềm về trần `sky`, thấp hơn ngưỡng
 * bloom của Chùa (1,6) — nếu không, cả vùng trời rộng quanh mặt trời vượt ngưỡng, bloom tràn thành màn trắng phủ kín
 * hình mỗi khi nhìn về phía mặt trời. Riêng đĩa mặt trời được sáng tới `sun` để còn quầng nhỏ.
 */
const SKY_LIMIT = { knee: 0.9, sky: 1.35, sun: 6 };

/**
 * Đặt thông số bầu trời vật lý (Preetham + mây thể tích của Sky.js) — dùng chung cho bầu trời thấy được và bản chụp IBL.
 * Độ rọi gốc của Sky.js rất cao (ví dụ của three hạ phơi sáng còn 0,5) → nhân `gain` ngay trong shader để giữ phơi sáng 1.
 * Chỉ bầu trời thấy được (`sunDisc`) mới nén chỗ sáng theo SKY_LIMIT; bản chụp IBL giữ nguyên để ánh sáng cảnh không đổi.
 */
function tuneSky(sky: Sky, sunDisc: boolean, gain: number): void {
  const m = sky.material;
  if (!m.uniforms.uSkyGain) {
    m.uniforms.uSkyGain = { value: gain };
    m.uniforms.uSkyKnee = { value: 0 };
    m.uniforms.uSkyMax = { value: 0 };
    m.uniforms.uSunMax = { value: 0 };
    // Trần riêng cho đĩa mặt trời dựa vào biến `sundisc` của shader Sky.js; bản three khác không có thì đĩa chung trần.
    const discLimit = m.fragmentShader.includes('float sundisc') ? 'mix( uSkyMax, uSunMax, sundisc )' : 'uSkyMax';
    m.fragmentShader = m.fragmentShader
      .replace('uniform float time;', 'uniform float time;\nuniform float uSkyGain;\nuniform float uSkyKnee;\nuniform float uSkyMax;\nuniform float uSunMax;')
      .replace(
        'gl_FragColor = vec4( texColor, 1.0 );',
        [
          'vec3 skyC = texColor * uSkyGain;',
          'float skyPk = max( max( skyC.r, skyC.g ), skyC.b );',
          `float skyLim = ${discLimit};`,
          'if ( skyPk > uSkyKnee ) {',
          '  float room = max( skyLim - uSkyKnee, 1e-3 );',
          '  skyC *= ( uSkyKnee + room * ( 1.0 - exp( ( uSkyKnee - skyPk ) / room ) ) ) / skyPk;',
          '}',
          'gl_FragColor = vec4( skyC, 1.0 );',
        ].join('\n'),
      );
    m.needsUpdate = true;
  }
  m.uniforms.uSkyGain.value = gain;
  const u = m.uniforms;
  u.uSkyKnee!.value = sunDisc ? SKY_LIMIT.knee : 1e9; // 1e9 = không bao giờ nén (tránh Infinity trong uniform)
  u.uSkyMax!.value = SKY_LIMIT.sky;
  u.uSunMax!.value = SKY_LIMIT.sun;
  u.turbidity!.value = 4.2;
  u.rayleigh!.value = 1.55;
  u.mieCoefficient!.value = 0.0045;
  u.mieDirectionalG!.value = 0.82;
  u.sunPosition!.value.copy(SUN_DIR);
  u.cloudCoverage!.value = 0.36;
  u.cloudDensity!.value = 0.5;
  u.cloudElevation!.value = 0.55;
  u.cloudSpeed!.value = 0.00006;
  u.showSunDisc!.value = sunDisc ? 1 : 0;
}

/** Cảnh nguồn cho ánh sáng môi trường: bầu trời (không đĩa mặt trời — đã có đèn mặt trời) + nền đất dưới chân trời. */
function skyEnvScene(): THREE.Scene {
  const scene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(80);
  tuneSky(sky, false, 0.5);
  scene.add(sky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#4f5b3c' }));
  ground.position.y = -1.5;
  scene.add(ground);
  return scene;
}

export const buildTemple: WorldBuilder = (map, kit = defaultKit): WorldHandles => {
  const root = new THREE.Group();
  root.name = 'temple';
  const wind = createWind(0.11);
  const ctx: TempleCtx = {
    rng: createRng(20261030),
    wind,
    statics: new THREE.Group(),
    dynamics: new THREE.Group(),
    flicker: [],
    updates: [],
    anchors: new Map(),
    lights: [],
  };
  smokeSystem(ctx);

  const sky = new Sky();
  sky.scale.setScalar(800);
  sky.frustumCulled = false;
  tuneSky(sky, true, 0.5);
  root.add(sky);
  // Map đã mở rộng lên phía Bắc tới sát dãy núi gần → chừa khung phẳng của khuôn viên (biên đi lại nới 5 m, xem
  // ground.ts) thêm 8 m để không ngọn núi nào mọc xuyên vào chùa.
  const b = map.bounds;
  root.add(
    createMountains(
      11,
      [
        { dist: [120, 165], height: [18, 38], colors: ['#4c6b3a', '#56753f', '#47643a'], count: 26 },
        { dist: [200, 260], height: [45, 85], colors: ['#4f6646', '#58704c', '#4a5f45'], count: 22 },
        { dist: [300, 360], height: [70, 120], colors: ['#5a6b5c', '#62735f'], count: 18 },
      ],
      { minX: b.minX - 13, maxX: b.maxX + 13, minZ: b.minZ - 13, maxZ: b.maxZ + 13 },
    ),
  );

  buildGround(ctx, map);
  buildWalls(ctx, map);
  buildTamQuan(ctx);
  buildHaSonGate(ctx);
  const chanhDien = buildChanhDien(ctx, map);
  const bell = buildBellTower(ctx, map);
  const kitchen = buildKitchen(ctx, (x, y, z, a) => ctx.smoke?.(x, y, z, a));
  buildStorage(ctx);
  const tangDoan = buildTangDoan(ctx, SUN_DIR);
  const phapDuong = buildPhapDuong(ctx, SUN_DIR);
  buildPhapDuongYard(ctx);

  const leaf = (colors: string[], h: number): THREE.Material[] => colors.map((c) => windMaterial(kit.matUnique(c), wind, h));
  const foliage = (colors: string[], h: number): THREE.Material[] => colors.map((c) => leafMaterial(c, wind, h));
  const trunk = kit.mat('#7a5236');
  const mats: Record<'tree' | 'pine' | 'bodhi' | 'garden', TreeMats> = {
    tree: { trunk, leaves: leaf(['#6fbf4a', '#5fae4e', '#7cc35a', '#4f9a3f'], 6), foliage: foliage(['#6a9c48', '#5e8f40', '#77a852', '#527f38'], 6) },
    pine: { trunk, leaves: leaf(['#3f8a4a', '#4f9a55', '#367a40'], 8), foliage: ['#4f7a48', '#5a8650', '#456e40'].map((c) => needleMaterial(c, wind, 8)) },
    bodhi: { trunk: kit.mat('#6e5038'), leaves: leaf(['#5fae4e', '#6fbf4a', '#4f9a3f', '#7cc35a', '#8fcf6a'], 11), foliage: foliage(['#5e8f40', '#6a9c48', '#4f7f36', '#77a852', '#82b05a'], 11) },
    garden: { trunk, leaves: leaf(['#5fae4e', '#7cc35a', '#4f9a3f', '#86c76a'], 4), foliage: foliage(['#5e8f40', '#77a852', '#527f38', '#82b05a'], 4) },
  };
  const stations = buildStationProps(ctx, map, mats);
  pondLife(ctx, map);
  skyLife(ctx, map);

  // Điểm neo cho mini-game (vị trí chuẩn từ dữ liệu map).
  for (const [name, spec] of defaultAnchors(map)) {
    if (!ctx.anchors.has(name)) anchor(ctx, name, spec.x, spec.y, spec.z, spec.ry ?? 0);
  }
  const stationGroups = new Map<string, THREE.Group>();
  for (const s of map.stations) {
    const g = new THREE.Group();
    g.name = `station:${s.id}`;
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.ry;
    ctx.dynamics.add(g);
    stationGroups.set(s.id, g);
  }

  root.add(kit.mergeStatic(ctx.statics, 'temple-static'));
  root.add(ctx.dynamics);

  // Ánh sáng trời chủ yếu đến từ IBL (bầu trời vật lý); bán cầu chỉ thêm chút hắt sáng ấm từ mặt đất.
  const hemi = new THREE.HemisphereLight('#d4e6ff', '#7a6446', 0.35);
  hemi.userData.ambient = true;
  const sun = new THREE.DirectionalLight('#fff0da', 3.9);
  sun.position.copy(SUN_DIR).multiplyScalar(60);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;

  const roofs = new Map<string, THREE.Object3D>([
    ['chanh_dien', chanhDien.roof],
    ['kitchen', kitchen.roof],
    ['bell_tower', bell.roof],
    ['tang_doan', tangDoan.roof],
    ['phap_duong', phapDuong.roof],
  ]);

  return {
    root,
    stations: stationGroups,
    roofs,
    anchors: ctx.anchors,
    environment: {
      background: new THREE.Color('#c8d9e4'),
      fog: new THREE.Fog('#c3d4df', 70, 430),
      lights: [hemi, sun, ...ctx.lights],
      envScene: skyEnvScene(),
      envIntensity: 0.7,
      exposure: 0.82,
    },
    controls: {
      setChanhDienGlow: chanhDien.setGlow,
      setBellPull: bell.setPull,
      hitBell: bell.hit,
      setJarLevel: stations.setJarLevel,
      setStove: kitchen.setStove,
      setAltarIncense: stations.setAltarIncense,
      pulsePortrait: tangDoan.pulsePortrait,
    },
    update(dt, t) {
      wind.uTime.value = t;
      sky.material.uniforms.time!.value = t;
      for (const u of ctx.updates) u(dt, t);
      for (const f of ctx.flicker) {
        const m = f.mat as THREE.MeshStandardMaterial;
        m.emissiveIntensity = f.base * (0.86 + Math.sin(t * f.speed + f.phase) * 0.1 + Math.sin(t * f.speed * 2.7 + f.phase) * 0.04);
      }
    },
    dispose() {
      kit.disposeTree(root);
    },
  };
};
