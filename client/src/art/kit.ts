// Bộ dụng cụ dựng hình low-poly dùng chung: bảng màu, vật liệu (cache), hình khối (cache), gộp mesh tĩnh,
// chữ trên canvas, mái chùa cong. Mọi phần dựng hình nên dùng kit để giữ một phong cách thống nhất.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applySurface, surfaceForColor, type SurfaceId } from './pbr';

/** Bảng màu chuẩn (pastel tươi, đổ bóng phẳng). */
export const PALETTE = {
  // Nền chùa
  grass: '#9fd47b',
  grassDark: '#7dbb5e',
  path: '#eadbb8',
  pathDark: '#d6c39b',
  stone: '#cfc8ba',
  stoneDark: '#a39b8c',
  sand: '#f0e2c0',
  wallYellow: '#f3d58f',
  wallCream: '#f7e9c6',
  plaster: '#efe4cf',
  woodRed: '#a8432f',
  woodDark: '#6e3b26',
  woodMid: '#94603d',
  woodLight: '#c98d5a',
  roofTile: '#c0573e',
  roofTileDark: '#963f2c',
  roofRidge: '#7a3324',
  gold: '#e8b04a',
  goldBright: '#ffd166',
  bronze: '#a9743b',
  bronzeDark: '#7d5126',
  water: '#6cc3d5',
  waterDeep: '#3f9db3',
  lotusPink: '#f4a7b9',
  lotusPad: '#5bae5a',
  leafGreen: '#5fae4e',
  leafLight: '#86c76a',
  leafDark: '#3f8a3a',
  trunk: '#8a5a3b',
  rock: '#b8b2a7',
  incenseSmoke: '#e8e4dc',
  lanternRed: '#d9352b',
  clothRed: '#b8322a',
  sky: '#bfe6f5',
  // Áo tu sĩ
  robeNauRach: '#8b6a4a',
  robeNauRachPatch: '#a88560',
  robeLam: '#7f97a8',
  robeTrangNau: '#6d4c35',
  robeCaSaVang: '#e9a23b',
  robeCaSaVienDo: '#e9a23b',
  robeTrimRed: '#b5382f',
  hostRed: '#c8432f',
  hostGold: '#ffd166',
  // Da (tham khảo)
  skinLight: '#f6d2ad',
  skinMid: '#e8b48a',
  skinTan: '#c98e62',
  // Bar
  barFloor: '#2a2340',
  barWall: '#1d1830',
  barWood: '#4a2e2a',
  neonPink: '#ff4fd8',
  neonCyan: '#3ef2ff',
  neonYellow: '#ffe14f',
  neonPurple: '#9b5cff',
  neonGreen: '#5cff8f',
  velvet: '#7a1f3d',
  chrome: '#d9dde3',
  // Chung
  white: '#ffffff',
  black: '#1b1b1f',
  ink: '#2b2b33',
} as const;

export type PaletteKey = keyof typeof PALETTE;

export interface MatOptions {
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  doubleSide?: boolean;
  roughness?: number;
  metalness?: number;
  /** Đổ bóng phẳng từng mặt (kiểu low-poly). Mặc định false: bề mặt mượt, tả thực. */
  flat?: boolean;
  /** Bề mặt PBR (texture ba mặt); mặc định tự nhận theo màu (bảng ở pbr.ts), 'none' = màu trơn. */
  surface?: SurfaceId | 'none';
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Vật liệu chuẩn (cache theo tham số). Đừng sửa vật liệu lấy từ cache — dùng `matUnique` nếu cần đổi động. */
export function mat(color: string, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([color, o]);
  let m = matCache.get(key);
  if (!m) {
    m = matUnique(color, o);
    m.userData.kitCached = true;
    matCache.set(key, m);
  }
  return m;
}

/** Vật liệu riêng (không cache) — dùng khi cần đổi màu/độ trong suốt theo thời gian. */
export function matUnique(color: string, o: MatOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.roughness ?? 0.88,
    metalness: o.metalness ?? 0,
    flatShading: o.flat ?? false,
    emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: o.emissiveIntensity ?? (o.emissive ? 1 : 0),
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const surface = o.surface === 'none' ? null : (o.surface ?? (o.emissive || o.transparent ? null : surfaceForColor(color)));
  if (surface) applySurface(m, surface);
  return m;
}

/** Vật liệu tự phát sáng không chịu ánh sáng (neon, hào quang, lửa). */
export function glowMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    g.userData.kitCached = true;
    geoCache.set(key, g);
  }
  return g;
}

/** Hình khối cơ bản (cache). Đơn vị mét. */
export const geo = {
  box: (w: number, h: number, d: number) => cached(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rTop: number, rBottom: number, h: number, seg = 10) =>
    cached(`cyl:${rTop}:${rBottom}:${h}:${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg)),
  cone: (r: number, h: number, seg = 8) => cached(`cone:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  sphere: (r: number, w = 10, hs = 8) =>
    cached(`sphere:${r}:${w}:${hs}`, () => new THREE.SphereGeometry(r, w, hs)),
  ico: (r: number, detail = 0) => cached(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail)),
  dodeca: (r: number) => cached(`dodeca:${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  capsule: (r: number, len: number, cap = 4, radial = 10) =>
    cached(`capsule:${r}:${len}:${cap}:${radial}`, () => new THREE.CapsuleGeometry(r, len, cap, radial)),
  torus: (r: number, tube: number, radial = 6, tubular = 14, arc = Math.PI * 2) =>
    cached(`torus:${r}:${tube}:${radial}:${tubular}:${arc}`, () => new THREE.TorusGeometry(r, tube, radial, tubular, arc)),
  /** Mặt phẳng nằm ngang (đã xoay để pháp tuyến hướng +Y). */
  ground: (w: number, d: number) =>
    cached(`ground:${w}:${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
  circleGround: (r: number, seg = 24) =>
    cached(`circleGround:${r}:${seg}`, () => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2)),
  /** Hình tiện (bình, chuông, chum…) — points: [bán kính, độ cao]. Không cache. */
  lathe: (points: [number, number][], seg = 12) =>
    new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
    ),
};

export interface MeshOptions {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  /** Tỉ lệ đều hoặc [sx, sy, sz]. */
  scale?: number | [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
  name?: string;
}

/** Tạo mesh, mặc định đổ và nhận bóng. */
export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, o: MeshOptions = {}): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
  if (o.scale !== undefined) {
    if (typeof o.scale === 'number') m.scale.setScalar(o.scale);
    else m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  m.castShadow = o.castShadow ?? true;
  m.receiveShadow = o.receiveShadow ?? true;
  if (o.name) m.name = o.name;
  return m;
}

export function group(name?: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  if (name) g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** Đặt vị trí/hướng cho object rồi trả lại chính nó (tiện chain). */
export function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number, ry = 0): T {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

export function setShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

/**
 * Gộp mọi mesh tĩnh bên trong `root` theo vật liệu thành ít draw call nhất (biến đổi được "nướng" vào hình).
 * Chỉ dùng cho đồ trang trí không di chuyển. Trả về group mới; `root` không còn dùng được nữa.
 */
export function mergeStatic(root: THREE.Object3D, name?: string): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || !m.visible) return;
    if ((m as THREE.Mesh & { isInstancedMesh?: boolean }).isInstancedMesh) return;
    const material = m.material as THREE.Material & { map?: THREE.Texture | null; vertexColors?: boolean };
    let g = m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const attr of Object.keys(g.attributes)) {
      const keep =
        attr === 'position' || attr === 'normal' || (attr === 'uv' && !!material.map) || (attr === 'color' && !!material.vertexColors);
      if (!keep) g.deleteAttribute(attr);
    }
    const entry = byMat.get(material) ?? { geos: [], cast: false, receive: false };
    entry.geos.push(g);
    entry.cast ||= m.castShadow;
    entry.receive ||= m.receiveShadow;
    byMat.set(material, entry);
  });
  const out = new THREE.Group();
  if (name) out.name = name;
  for (const [material, { geos, cast, receive }] of byMat) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const m = new THREE.Mesh(merged, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    out.add(m);
  }
  return out;
}

/** Biến thể màu nhẹ (tự nhiên hơn). amount ~0.05–0.15. `rnd` trả số [0,1). */
export function jitter(color: string, amount: number, rnd: () => number): string {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(
    (hsl.h + (rnd() - 0.5) * amount * 0.3 + 1) % 1,
    THREE.MathUtils.clamp(hsl.s + (rnd() - 0.5) * amount, 0, 1),
    THREE.MathUtils.clamp(hsl.l + (rnd() - 0.5) * amount, 0, 1),
  );
  return `#${c.getHexString()}`;
}

export const FONT_TITLE = '"Baloo 2", "Be Vietnam Pro", system-ui, sans-serif';
export const FONT_BODY = '"Be Vietnam Pro", system-ui, sans-serif';

/** Texture vẽ bằng canvas 2D (sRGB). Tự vẽ lại khi font web đã tải xong. */
export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const render = () => {
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    tex.needsUpdate = true;
  };
  render();
  if (typeof document !== 'undefined' && document.fonts) void document.fonts.ready.then(render);
  return tex;
}

export interface SignOptions {
  /** Kích thước tấm biển (m). */
  width: number;
  height: number;
  bg?: string;
  border?: string;
  color?: string;
  /** Cỡ chữ tương đối theo chiều cao canvas (0..1). */
  fontScale?: number;
  font?: string;
  /** Độ dày tấm biển (m); 0 = chỉ là mặt phẳng. */
  depth?: number;
}

/** Tấm biển có chữ (tiếng Việt) — mặt chữ hướng +Z. */
export function signBoard(text: string, o: SignOptions): THREE.Group {
  const pxPerM = 256;
  const w = Math.max(64, Math.round(o.width * pxPerM));
  const h = Math.max(32, Math.round(o.height * pxPerM));
  const tex = canvasTexture(w, h, (ctx, cw, ch) => {
    ctx.fillStyle = o.bg ?? PALETTE.woodDark;
    ctx.fillRect(0, 0, cw, ch);
    const b = Math.round(ch * 0.08);
    ctx.strokeStyle = o.border ?? PALETTE.gold;
    ctx.lineWidth = b;
    ctx.strokeRect(b / 2, b / 2, cw - b, ch - b);
    ctx.fillStyle = o.color ?? PALETTE.goldBright;
    let size = Math.round(ch * (o.fontScale ?? 0.5));
    ctx.font = `700 ${size}px ${o.font ?? FONT_TITLE}`;
    while (ctx.measureText(text).width > cw * 0.88 && size > 8) {
      size -= 2;
      ctx.font = `700 ${size}px ${o.font ?? FONT_TITLE}`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cw / 2, ch / 2 + size * 0.06);
  });
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(o.width, o.height),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  );
  const depth = o.depth ?? 0.06;
  face.position.z = depth / 2 + 0.002;
  g.add(face);
  if (depth > 0) g.add(mesh(geo.box(o.width + 0.04, o.height + 0.04, depth), mat(o.bg ?? PALETTE.woodDark)));
  return g;
}

export interface HipRoofOptions {
  /** Kích thước phần nhà bên dưới (m). */
  w: number;
  d: number;
  /** Chiều cao mái (từ mép mái tới nóc). */
  h: number;
  /** Mái vươn ra ngoài tường. */
  overhang?: number;
  /** Độ cong vểnh ở 4 góc (m). */
  lift?: number;
  color?: string;
  ridgeColor?: string;
  /** Có đầu đao (sừng cong) ở 4 góc không. */
  horns?: boolean;
  /** Viên ngọc giữa nóc ("lưỡng long chầu nguyệt" giản lược). */
  pearl?: boolean;
}

/**
 * Mái chùa kiểu Việt (mái chái 4 mặt, đầu đao vểnh). Gốc tọa độ = tâm mép mái (y = 0),
 * nóc chạy dọc trục X. Đặt group lên đỉnh tường.
 */
export function hipRoof(o: HipRoofOptions): THREE.Group {
  const over = o.overhang ?? 0.8;
  const W = o.w + over * 2;
  const D = o.d + over * 2;
  const H = o.h;
  const lift = o.lift ?? H * 0.28;
  const R = Math.max(0, W - D);
  const curve = (u: number) => Math.pow(Math.abs(2 * u - 1), 3);
  const positions: number[] = [];
  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const SEG = 8;
  const ROWS = 3;
  // Mặt trước (+Z) và sau (−Z): hình thang từ mép mái tới nóc.
  for (const side of [1, -1]) {
    const eave = (u: number) => new THREE.Vector3(-W / 2 + W * u, lift * curve(u), (side * D) / 2);
    const ridge = (u: number) => new THREE.Vector3(-R / 2 + R * u, H, 0);
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < ROWS; j++) {
        const p = (u: number, v: number) => eave(u).lerp(ridge(u), v);
        const u0 = i / SEG;
        const u1 = (i + 1) / SEG;
        const v0 = j / ROWS;
        const v1 = (j + 1) / ROWS;
        const a = p(u0, v0);
        const b = p(u1, v0);
        const c = p(u1, v1);
        const d = p(u0, v1);
        if (side === 1) {
          pushTri(a, b, c);
          pushTri(a, c, d);
        } else {
          pushTri(a, c, b);
          pushTri(a, d, c);
        }
      }
    }
  }
  // Hai mặt hồi (±X): tam giác từ mép mái hồi tới đầu nóc.
  for (const side of [1, -1]) {
    const eave = (u: number) => new THREE.Vector3((side * W) / 2, lift * curve(u), -D / 2 + D * u);
    const apex = new THREE.Vector3((side * R) / 2, H, 0);
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < ROWS; j++) {
        const p = (u: number, v: number) => eave(u).lerp(apex, v);
        const u0 = i / SEG;
        const u1 = (i + 1) / SEG;
        const v0 = j / ROWS;
        const v1 = (j + 1) / ROWS;
        const a = p(u0, v0);
        const b = p(u1, v0);
        const c = p(u1, v1);
        const d = p(u0, v1);
        if (side === 1) {
          pushTri(a, c, b);
          pushTri(a, d, c);
        } else {
          pushTri(a, b, c);
          pushTri(a, c, d);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const roof = new THREE.Group();
  roof.add(mesh(g, mat(o.color ?? PALETTE.roofTile, { doubleSide: true })));
  const ridgeColor = o.ridgeColor ?? PALETTE.roofRidge;
  // Bờ nóc + hai đầu cong.
  if (R > 0.01) roof.add(mesh(geo.box(R + 0.3, 0.22, 0.3), mat(ridgeColor), { y: H + 0.08 }));
  for (const s of [1, -1]) {
    roof.add(mesh(geo.cone(0.14, 0.7, 6), mat(ridgeColor), { x: (s * (R + 0.3)) / 2, y: H + 0.35, rz: -s * 0.5 }));
  }
  if (o.pearl ?? true) {
    roof.add(mesh(geo.sphere(0.2, 10, 8), mat(PALETTE.goldBright, { emissive: PALETTE.gold, emissiveIntensity: 0.25 }), { y: H + 0.42 }));
  }
  // Đầu đao 4 góc.
  if (o.horns ?? true) {
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const horn = mesh(geo.cone(0.12, 0.95, 6), mat(ridgeColor));
        horn.position.set((sx * W) / 2, lift + 0.25, (sz * D) / 2);
        // Nghiêng ra ngoài theo đường chéo và vểnh lên.
        const out = new THREE.Vector3(sx, 1.3, sz).normalize();
        horn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
        roof.add(horn);
      }
    }
  }
  return roof;
}

/** Giải phóng tài nguyên GPU của một cây đối tượng (bỏ qua hình khối/vật liệu dùng chung trong cache của kit). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Points).isPoints) return;
    const g = m.geometry as THREE.BufferGeometry | undefined;
    if (g && !g.userData.kitCached) g.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) {
      if (!mt || mt.userData.kitCached) continue;
      const tex = (mt as THREE.MeshStandardMaterial).map;
      if (tex) tex.dispose();
      mt.dispose();
    }
    if ((m as THREE.InstancedMesh).isInstancedMesh) (m as THREE.InstancedMesh).dispose();
  });
}

export const kit = {
  PALETTE,
  mat,
  matUnique,
  glowMat,
  geo,
  mesh,
  group,
  place,
  setShadows,
  mergeStatic,
  disposeTree,
  jitter,
  canvasTexture,
  signBoard,
  hipRoof,
  FONT_TITLE,
  FONT_BODY,
};

export type ArtKit = typeof kit;
