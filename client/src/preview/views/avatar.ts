// Xem thử nhân vật: dàn mọi ngoại hình (5 áo tu sĩ, Phương Trượng, NPC đủ tóc/mũ/phụ kiện) trong studio, nút cho mọi
// AnimId, đồ cầm, đi vòng tròn, say/mờ/hào quang/Tạp Niệm/thăng cấp, góc máy, đếm tam giác/mesh nhân vật đang chọn.
// URL: ?view=avatar&anim=<AnimId>&cam=<all|front|back34|face|side|seat>&look=<chỉ số>. window.__av để kiểm bằng script.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ANIM_IDS, type AnimId, type HeldItem } from '@shared/index';
import type { AvatarHandle, AvatarLook } from '../../art/api';
import { createAvatar } from '../../art/avatar';
import { gripStyle } from '../../art/props';
import type { PreviewView } from '../types';

const monk = (robe: AvatarLook['outfit']['robe'], skin: string, hat: AvatarLook['outfit']['hat'] = 'none', accessory: AvatarLook['outfit']['accessory'] = 'none'): AvatarLook => ({
  outfit: { robe, hat, accessory },
  hair: 'bald',
  skin,
  isHost: false,
  vip: false,
  accent: '#4fc3f7',
});
const npc = (robe: AvatarLook['outfit']['robe'], hair: AvatarLook['hair'], skin: string, accent: string, hat: AvatarLook['outfit']['hat'] = 'none', accessory: AvatarLook['outfit']['accessory'] = 'none'): AvatarLook => ({
  outfit: { robe, hat, accessory },
  hair,
  skin,
  isHost: false,
  vip: false,
  accent,
});

/** Dàn nhân vật (trái → phải): phủ mọi áo, tóc, mũ, phụ kiện; Phương Trượng ở giữa. */
const LINEUP: { name: string; look: AvatarLook }[] = [
  { name: 'Tiểu Đồng (nâu rách)', look: monk('robe_nau_rach', '#f6d2ad') },
  { name: 'Tập Sự (áo lam) + nón lá', look: monk('robe_lam', '#efc193', 'non_la') },
  { name: 'Tri Khách (tràng nâu) + chuỗi hạt', look: monk('robe_trang_nau', '#e8b48a', 'none', 'trang_hat') },
  { name: 'Đại Đức (cà sa vàng) + quạt', look: monk('robe_ca_sa_vang', '#d9a173', 'none', 'quat_nan') },
  { name: 'Phương Trượng', look: { ...monk('robe_ca_sa_vien_do', '#efc193'), isHost: true } },
  { name: 'Thượng Tọa (viền đỏ) + mũ len + dây chuyền', look: monk('robe_ca_sa_vien_do', '#c98e62', 'mu_len', 'day_chuyen_vang') },
  { name: 'Khách áo thun / tóc ngắn', look: npc('civ_ao_thun', 'short', '#e8b48a', '#ff6f91') },
  { name: 'Khách bà ba / tóc dài', look: npc('civ_ba_ba', 'long', '#f6d2ad', '#ba68c8') },
  { name: 'Khách tiệc / búi tóc + kính râm', look: npc('civ_party', 'bun', '#d9a173', '#4db6ac', 'none', 'kinh_ram') },
  { name: 'Nhà cái vest / tóc dựng + mũ VIP', look: npc('civ_vest', 'spiky', '#c98e62', '#ffd54f', 'mu_vip') },
];
const HOST = LINEUP.findIndex((l) => l.look.isHost);
const SPACING = 1.35;
const homeX = (i: number): number => (i - (LINEUP.length - 1) / 2) * SPACING;

const HELD: { name: string; item: HeldItem | null }[] = [
  { name: 'tay không', item: null },
  { name: 'chổi', item: { kind: 'broom' } },
  { name: 'thùng nước', item: { kind: 'water_bucket' } },
  { name: 'đèn dầu (thắp)', item: { kind: 'lamp', variant: 'lit' } },
  { name: 'nhang (thắp)', item: { kind: 'incense', variant: 'lit' } },
  { name: 'ly bia', item: { kind: 'drink_glass', variant: 'bia_bo_de' } },
];

/** Kiểu đi vòng: tắt / chậm / nhanh / đi ngang (mặt nhìn cố định về camera — thấy thân xoay theo hướng bước). */
const WALKS: { name: string; speed: number; strafe: boolean }[] = [
  { name: 'đứng yên', speed: 0, strafe: false },
  { name: 'đi chậm 1,2 m/s', speed: 1.2, strafe: false },
  { name: 'chạy 4 m/s', speed: 4, strafe: false },
  { name: 'đi ngang 2 m/s (mặt cố định)', speed: 2, strafe: true },
];
const WALK_R = 1;

type CamId = 'all' | 'front' | 'back34' | 'face' | 'side' | 'seat';
const CAMS: { id: CamId; name: string }[] = [
  { id: 'all', name: 'Toàn dàn' },
  { id: 'front', name: 'Chính diện' },
  { id: 'back34', name: 'Sau 3/4' },
  { id: 'face', name: 'Cận mặt' },
  { id: 'side', name: 'Nghiêng' },
  { id: 'seat', name: 'Phương Trượng ngồi' },
];

const view: PreviewView = {
  id: 'avatar',
  title: 'Nhân vật',
  setup(ctx) {
    const { scene, renderer, camera, controls } = ctx;
    const params = new URLSearchParams(location.search);

    // ── Studio: đèn chính dịu + đèn viền + trời/đất, IBL nhẹ, đĩa sàn nhận bóng ──
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    scene.background = new THREE.Color('#e9e4da');
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    const key = new THREE.DirectionalLight('#fff3e2', 2.6);
    key.position.set(-5, 8, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const rim = new THREE.DirectionalLight('#dfe9ff', 1.1);
    rim.position.set(4, 5, -6);
    scene.add(key, rim, new THREE.HemisphereLight('#ffffff', '#b8ab95', 0.7));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(11, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#d8cfbf', roughness: 0.95 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Dàn nhân vật ──
    const avatars: AvatarHandle[] = LINEUP.map((l, i) => {
      const a = createAvatar(l.look);
      a.root.position.set(homeX(i), 0, 0);
      scene.add(a.root);
      return a;
    });
    const speeds = avatars.map(() => 0);

    // Trạng thái điều khiển.
    let anim: AnimId = ANIM_IDS.includes(params.get('anim') as AnimId) ? (params.get('anim') as AnimId) : 'idle';
    let heldIdx = 0;
    let walkIdx = 0;
    let walkT = 0;
    let drunk = 0;
    let ghost = false;
    let glowIdx = 0;
    let tapIdx = 0;
    const lookParam = Number(params.get('look') ?? NaN);
    let focus = Number.isInteger(lookParam) ? Math.min(LINEUP.length - 1, Math.max(0, lookParam)) : HOST;
    let solo = false;
    let cam: CamId = (CAMS.find((c) => c.id === params.get('cam'))?.id ?? 'all') as CamId;
    let paused = false;
    let simT = 0;

    /** Hoạt ảnh thật áp cho nhân vật: đang đi vòng thì walk / carry_walk; ôm đồ mà đứng thì carry_idle. */
    const effAnim = (): AnimId => {
      const item = HELD[heldIdx]!.item;
      const carry = !!item && gripStyle(item.kind) === 'carry';
      if (WALKS[walkIdx]!.speed > 0) return carry ? 'carry_walk' : 'walk';
      if (carry && anim === 'idle') return 'carry_idle';
      if (!carry && anim === 'carry_idle') return 'idle';
      return anim;
    };
    const applyAnim = () => {
      for (const a of avatars) a.setAnim(effAnim());
    };

    // ── Góc máy (theo nhân vật đang chọn; "Phương Trượng ngồi" thì cho cả dàn ngồi) ──
    const setCam = (id: CamId) => {
      cam = id;
      const fx = homeX(id === 'seat' ? HOST : focus);
      const P: Record<CamId, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
        all: { pos: [0, 2.3, 12.5], target: [0, 0.85, 0], fov: 34 },
        front: { pos: [fx, 1.15, 3.9], target: [fx, 0.9, 0], fov: 30 },
        back34: { pos: [fx - 2.7, 1.75, -2.9], target: [fx, 0.9, 0], fov: 30 },
        face: { pos: [fx + 0.25, 1.4, 1.55], target: [fx, 1.3, 0], fov: 26 },
        side: { pos: [fx + 3.6, 1.1, 0.15], target: [fx, 0.85, 0], fov: 30 },
        seat: { pos: [fx + 0.95, 0.95, 2.35], target: [fx, 0.6, 0.1], fov: 30 },
      };
      const v = P[id];
      if (id === 'seat' && anim !== 'sit' && anim !== 'kneel' && anim !== 'prostrate') setAnim('sit');
      camera.fov = v.fov;
      camera.updateProjectionMatrix();
      camera.position.set(...v.pos);
      controls.target.set(...v.target);
      controls.update();
      refresh();
    };

    // ── Bảng điều khiển ──
    const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);
    const info = document.createElement('div');
    css(info, { fontSize: '12px', lineHeight: '1.35', maxWidth: '330px', whiteSpace: 'pre-line' });
    ctx.panel.append(info);
    const section = (title: string): HTMLDivElement => {
      const h = document.createElement('div');
      h.textContent = title;
      css(h, { fontWeight: '600', marginTop: '4px' });
      const box = document.createElement('div');
      css(box, { display: 'flex', flexWrap: 'wrap', gap: '3px', maxWidth: '330px' });
      ctx.panel.append(h, box);
      return box;
    };
    const btn = (box: HTMLElement, label: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = fn;
      css(b, { fontSize: '11px', padding: '2px 5px', borderRadius: '5px', border: '1px solid #c9b9a3', background: '#fff', cursor: 'pointer' });
      box.append(b);
      return b;
    };
    const mark = (b: HTMLButtonElement, on: boolean) => css(b, { background: on ? '#6e3b26' : '#fff', color: on ? '#fff' : '#222' });

    const animBox = section('Hoạt ảnh (cả dàn)');
    const animBtns = new Map<AnimId, HTMLButtonElement>();
    for (const a of ANIM_IDS) animBtns.set(a, btn(animBox, a, () => setAnim(a)));

    const doBox = section('Đồ cầm · đi lại');
    const heldBtn = btn(doBox, '', () => setHeld((heldIdx + 1) % HELD.length));
    const walkBtn = btn(doBox, '', () => setWalk((walkIdx + 1) % WALKS.length));

    const fxBox = section('Trạng thái');
    const drunkBtn = btn(fxBox, '', () => setDrunk(drunk >= 100 ? 0 : drunk + 50));
    const ghostBtn = btn(fxBox, '', () => setGhost(!ghost));
    const glowBtn = btn(fxBox, '', () => setGlow((glowIdx + 1) % 3));
    const tapBtn = btn(fxBox, '', () => setTapNiem((tapIdx + 1) % 3));
    btn(fxBox, 'Thăng cấp ✦', () => rankUp());

    const lookBox = section('Nhân vật chọn (góc máy cận)');
    btn(lookBox, '◀', () => setFocus((focus + LINEUP.length - 1) % LINEUP.length));
    btn(lookBox, '▶', () => setFocus((focus + 1) % LINEUP.length));
    const soloBtn = btn(lookBox, '', () => setSolo(!solo));
    const pauseBtn = btn(lookBox, '', () => {
      paused = !paused;
      refresh();
    });
    btn(lookBox, 'Bước 1/60 s', () => step(1 / 60, 1));

    const camBox = section('Góc máy');
    const camBtns = new Map<CamId, HTMLButtonElement>();
    for (const c of CAMS) camBtns.set(c.id, btn(camBox, c.name, () => setCam(c.id)));

    const GLOWS: (string | null)[] = [null, '#ffd166', '#7fd4ff'];
    const TAPS = [0, 60, 90];
    function refresh(): void {
      for (const [a, b] of animBtns) mark(b, a === anim);
      for (const [c, b] of camBtns) mark(b, c === cam);
      heldBtn.textContent = `Cầm: ${HELD[heldIdx]!.name}`;
      walkBtn.textContent = `Đi vòng: ${WALKS[walkIdx]!.name}`;
      drunkBtn.textContent = `Say: ${drunk}`;
      ghostBtn.textContent = `Mờ (mất kết nối): ${ghost ? 'bật' : 'tắt'}`;
      glowBtn.textContent = `Hào quang: ${['tắt', 'vàng', 'xanh'][glowIdx]}`;
      tapBtn.textContent = `Tạp Niệm: ${TAPS[tapIdx]}`;
      soloBtn.textContent = solo ? 'Hiện cả dàn' : 'Chỉ nhân vật chọn';
      pauseBtn.textContent = paused ? 'Chạy tiếp' : 'Dừng';
      mark(pauseBtn, paused);
    }

    // ── Thao tác (nút + window.__av) ──
    function setAnim(a: AnimId): void {
      anim = a;
      applyAnim();
      refresh();
    }
    function setHeld(i: number): void {
      heldIdx = i;
      for (const a of avatars) a.setHeld(HELD[i]!.item);
      applyAnim();
      refresh();
    }
    function setWalk(i: number): void {
      walkIdx = i;
      if (WALKS[i]!.speed === 0) {
        // Về chỗ đứng (dịch chuyển tức thời — avatar không coi là bước đi).
        walkT = 0;
        avatars.forEach((a, k) => {
          a.root.position.set(homeX(k), 0, 0);
          a.root.rotation.y = 0;
          speeds[k] = 0;
        });
      }
      applyAnim();
      refresh();
    }
    function setDrunk(v: number): void {
      drunk = v;
      for (const a of avatars) a.setDrunk(v);
      refresh();
    }
    function setGhost(v: boolean): void {
      ghost = v;
      for (const a of avatars) a.setGhost(v);
      refresh();
    }
    function setGlow(i: number): void {
      glowIdx = i;
      for (const a of avatars) a.setGlow(GLOWS[i]!);
      refresh();
    }
    function setTapNiem(i: number): void {
      tapIdx = i;
      for (const a of avatars) a.setTapNiem(TAPS[i]!);
      refresh();
    }
    function rankUp(): void {
      for (const a of avatars) a.playRankUp();
    }
    function setFocus(i: number): void {
      focus = i;
      setSolo(solo);
      if (cam !== 'all' && cam !== 'seat') setCam(cam);
      refresh();
    }
    function setSolo(v: boolean): void {
      solo = v;
      avatars.forEach((a, k) => (a.root.visible = !solo || k === focus));
      refresh();
    }

    /** Tiến mô phỏng dt giây: đi vòng tròn quanh chỗ đứng (cả dàn cùng pha nên không va nhau), tốc độ = tốc độ đo thật. */
    function advance(dt: number): void {
      simT += dt;
      const w = WALKS[walkIdx]!;
      if (w.speed > 0) walkT += (dt * w.speed) / WALK_R;
      avatars.forEach((a, k) => {
        const r = a.root;
        const px = r.position.x;
        const pz = r.position.z;
        if (w.speed > 0) {
          r.position.set(homeX(k) + Math.sin(walkT) * WALK_R, 0, (1 - Math.cos(walkT)) * WALK_R);
          const dx = r.position.x - px;
          const dz = r.position.z - pz;
          if (w.strafe) r.rotation.y = 0;
          else if (dx * dx + dz * dz > 1e-8) {
            const want = Math.atan2(dx, dz);
            let d = want - r.rotation.y;
            d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
            r.rotation.y += d * Math.min(1, dt * 10);
          }
        }
        const v = dt > 0 ? Math.hypot(r.position.x - px, r.position.z - pz) / dt : 0;
        speeds[k]! += (Math.min(v, 9) - speeds[k]!) * Math.min(1, dt * 10);
        a.update(dt, simT, speeds[k]!);
      });
    }
    function step(dt = 1 / 60, n = 1): void {
      paused = true;
      for (let i = 0; i < n; i++) advance(dt);
      refresh();
    }

    /** Tam giác + mesh đang hiện của một nhân vật. */
    function stats(i: number): { tris: number; meshes: number } {
      let tris = 0;
      let meshes = 0;
      avatars[i]!.root.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const g = m.geometry;
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        meshes++;
      });
      return { tris: Math.round(tris), meshes };
    }

    let infoT = 0;
    let frames = 0;
    ctx.onFrame((dt) => {
      if (!paused) advance(dt);
      frames++;
      infoT += dt;
      if (infoT >= 0.5) {
        const s = stats(focus);
        info.textContent = `${LINEUP[focus]!.name}\n${s.tris} tam giác · ${s.meshes} mesh · ${Math.round(frames / infoT)} khung/s\nhoạt ảnh: ${effAnim()}`;
        infoT = 0;
        frames = 0;
      }
    });

    (window as unknown as { __av: unknown }).__av = {
      avatars,
      looks: LINEUP.map((l) => l.name),
      setAnim,
      setCam,
      setHeld: (x: number | HeldItem | null) => {
        if (typeof x === 'number') setHeld(x);
        else for (const a of avatars) a.setHeld(x);
      },
      setWalk,
      setFocus,
      setSolo,
      setDrunk,
      setGhost,
      setGlow: (i: number) => setGlow(i),
      setTapNiem: (i: number) => setTapNiem(i),
      rankUp,
      step,
      play: () => {
        paused = false;
        refresh();
      },
      stats,
    };

    applyAnim();
    setFocus(focus);
    setCam(cam);
  },
};

export default view;
