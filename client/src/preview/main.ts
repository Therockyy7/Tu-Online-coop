import '../styles/fonts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { kit } from '../art/kit';
import type { PreviewContext, PreviewView } from './types';

const modules = import.meta.glob<{ default: PreviewView }>('./views/*.ts', { eager: true });
const views = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.id.localeCompare(b.id));

const nav = document.getElementById('preview-nav')!;
const panel = document.getElementById('preview-panel')!;
const stage = document.getElementById('stage')!;
const uiRoot = document.getElementById('ui')!;
for (const v of views) {
  const a = document.createElement('a');
  a.href = `?view=${v.id}`;
  a.textContent = v.title;
  nav.append(a);
}

const wanted = new URLSearchParams(location.search).get('view');
const view = views.find((v) => v.id === wanted) ?? views[0];

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(kit.PALETTE.sky);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 12, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

const frameFns: ((dt: number, t: number) => void)[] = [];
const ctx: PreviewContext = {
  scene,
  camera,
  renderer,
  controls,
  panel,
  uiRoot,
  kit,
  onFrame: (fn) => frameFns.push(fn),
  button(label, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = onClick;
    panel.append(b);
    return b;
  },
};

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

if (!view) {
  nav.append('Chưa có trang xem thử nào trong preview/views/.');
} else {
  document.title = `Xem thử — ${view.title}`;
  if (view.needs3d === false) stage.style.display = 'none';
  await view.setup(ctx);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    for (const fn of frameFns) fn(dt, t);
    controls.update();
    if (view.needs3d !== false) renderer.render(scene, camera);
  });
}
