// Vật liệu tả thực: texture CC0 Poly Haven (1K) ánh xạ ba mặt (triplanar) theo toạ độ thế giới. Hình trong game dựng
// bằng code, không có UV chuẩn (và bị gộp mesh), nên lấy mẫu theo mét thật để vân không méo/giãn. Màu vật liệu giữ vai
// trò "màu trung bình": vân texture chỉ điều biến quanh màu đó (gỗ sơn son vẫn đỏ, chỉ thêm vân gỗ; tường vẫn vàng đất).
// Texture tải lười, một bộ dùng chung cho mọi vật liệu cùng bề mặt; trước khi tải xong, vật liệu hiển thị màu trơn.
import * as THREE from 'three';
import barkDiff from '../content/textures/bark_brown_02_diff.jpg';
import barkNor from '../content/textures/bark_brown_02_nor.jpg';
import plasterDiff from '../content/textures/clay_plaster_diff.jpg';
import plasterNor from '../content/textures/clay_plaster_nor.jpg';
import plasterRough from '../content/textures/clay_plaster_rough.jpg';
import fabricNor from '../content/textures/fabric_pattern_07_nor.jpg';
import grassDiff from '../content/textures/grass_ground_diff.jpg';
import grassNor from '../content/textures/grass_ground_nor.jpg';
import stoneDiff from '../content/textures/grey_stone_path_diff.jpg';
import stoneNor from '../content/textures/grey_stone_path_nor.jpg';
import woodDiff from '../content/textures/lacquered_cherry_wood_diff.jpg';
import woodNor from '../content/textures/lacquered_cherry_wood_nor.jpg';
import woodRough from '../content/textures/lacquered_cherry_wood_rough.jpg';
import roofDiff from '../content/textures/roof_tiles_14_diff.jpg';
import roofNor from '../content/textures/roof_tiles_14_nor.jpg';
import roofRough from '../content/textures/roof_tiles_14_rough.jpg';
import tileDiff from '../content/textures/terracotta_floor_tiles_diff.jpg';
import tileNor from '../content/textures/terracotta_floor_tiles_nor.jpg';
import tileRough from '../content/textures/terracotta_floor_tiles_rough.jpg';

export type SurfaceId = 'grass' | 'tile' | 'stone' | 'plaster' | 'roof' | 'wood' | 'bark' | 'fabric' | 'carved';

interface SurfaceDef {
  diff?: string;
  nor: string;
  rough?: string;
  /** Số mét cho một lần lặp texture. */
  scale: number;
  normalScale: number;
  /** Giữ bao nhiêu sắc độ màu của texture (0 = chỉ lấy sáng tối, 1 = giữ nguyên màu vân). */
  chroma: number;
  /** Hệ số độ phản xạ: bảng màu cũ (kiểu hoạt hình) sáng hơn vật liệu thật — đá lát, đất… phải tối bớt. */
  albedo: number;
}

const SURFACES: Record<SurfaceId, SurfaceDef> = {
  grass: { diff: grassDiff, nor: grassNor, scale: 2.4, normalScale: 0.9, chroma: 0.85, albedo: 0.8 },
  tile: { diff: tileDiff, nor: tileNor, rough: tileRough, scale: 2.0, normalScale: 1.0, chroma: 0.9, albedo: 0.92 },
  stone: { diff: stoneDiff, nor: stoneNor, scale: 2.6, normalScale: 1.0, chroma: 0.5, albedo: 0.68 },
  plaster: { diff: plasterDiff, nor: plasterNor, rough: plasterRough, scale: 2.8, normalScale: 0.8, chroma: 0.3, albedo: 0.88 },
  roof: { diff: roofDiff, nor: roofNor, rough: roofRough, scale: 1.8, normalScale: 1.0, chroma: 0.55, albedo: 0.9 },
  wood: { diff: woodDiff, nor: woodNor, rough: woodRough, scale: 1.5, normalScale: 0.8, chroma: 0.45, albedo: 1 },
  bark: { diff: barkDiff, nor: barkNor, scale: 1.3, normalScale: 1.2, chroma: 0.55, albedo: 0.85 },
  fabric: { nor: fabricNor, scale: 0.32, normalScale: 0.55, chroma: 0, albedo: 1 },
  // Đá tạc tượng: chỉ mượn vân hạt của vữa trát ở tỉ lệ nhỏ, rất nhẹ (màu do vật liệu + màu đỉnh quyết định).
  carved: { nor: plasterNor, scale: 0.6, normalScale: 0.3, chroma: 0, albedo: 1 },
};

/**
 * Bảng màu → bề mặt cho các màu kết cấu đang dùng ở Chùa (tường, gỗ, đá…). Vật liệu tạo bằng `kit.mat(color)` tự
 * nhận bề mặt theo bảng này; đồ trang trí nhỏ (quả, hoa, đồng, vàng) không có trong bảng nên giữ màu trơn.
 */
const BY_COLOR: Record<string, SurfaceId> = {
  // Tường trát
  '#f3d58f': 'plaster',
  '#f8e3ad': 'plaster',
  '#f6e8c8': 'plaster',
  '#d6b57a': 'plaster',
  '#efe4cf': 'plaster',
  '#e9d3a3': 'plaster',
  '#f7e9c6': 'plaster',
  // Gỗ mộc + gỗ sơn son thếp
  '#a8432f': 'wood',
  '#7f2e1f': 'wood',
  '#8a5a3b': 'wood',
  '#5e3a24': 'wood',
  '#4a2a1a': 'wood',
  '#5a321f': 'wood',
  '#7a1d12': 'wood',
  '#521008': 'wood',
  '#5c3420': 'wood',
  '#45261a': 'wood',
  '#6e4a32': 'wood',
  '#a0703f': 'wood',
  '#c8a064': 'wood',
  '#d9b07a': 'wood',
  '#8a1f14': 'wood',
  '#9a2a1c': 'wood',
  '#a32a22': 'wood',
  '#7a4a2e': 'wood',
  '#7a4a2a': 'wood',
  '#6e3b26': 'wood',
  '#7a1f12': 'wood',
  '#6e1a12': 'wood',
  '#9a3424': 'wood',
  '#94603d': 'wood',
  '#c98d5a': 'wood',
  '#9a4430': 'wood',
  '#7a5230': 'wood',
  '#2e1a10': 'wood',
  '#3a2418': 'wood',
  // Vỏ cây
  '#7a5236': 'bark',
  '#6e5038': 'bark',
  '#9a8a6a': 'bark',
  // Đá
  '#cfc8ba': 'stone',
  '#a8a092': 'stone',
  '#bdb4a3': 'stone',
  '#b8b0a2': 'stone',
  '#a39b8c': 'stone',
  '#8f877a': 'stone',
  '#bdb7aa': 'stone',
  '#c9c1b2': 'stone',
  '#9a948a': 'stone',
  '#a8a296': 'stone',
  '#b5aea0': 'stone',
  '#8f897f': 'stone',
  '#b8b2a7': 'stone',
  // Ngói, bờ nóc
  '#7a3324': 'roof',
  '#963f2c': 'roof',
  '#c0573e': 'roof',
  '#8a6a32': 'roof',
  // Vải
  '#9b2a1f': 'fabric',
  '#b8955a': 'fabric',
  '#c27a2c': 'fabric',
};

export function surfaceForColor(color: string): SurfaceId | null {
  return BY_COLOR[color.toLowerCase()] ?? null;
}

interface SurfaceUniforms {
  uTriDiff: { value: THREE.Texture | null };
  uTriNor: { value: THREE.Texture | null };
  uTriRough: { value: THREE.Texture | null };
  uTriAvg: { value: THREE.Vector3 };
  uTriRoughAvg: { value: number };
  uTriScale: { value: number };
  uTriNormalScale: { value: number };
  uTriChroma: { value: number };
  uTriAlbedo: { value: number };
  uTriReady: { value: number };
}

const uniformsCache = new Map<SurfaceId, SurfaceUniforms>();
/** Texture của từng bề mặt đã tải xong chưa (false = tải lỗi, giữ màu trơn). */
const readyCache = new Map<SurfaceId, Promise<boolean>>();

/** Trung bình màu (tuyến tính) của ảnh — vẽ thu nhỏ rồi cộng. */
function averageOf(img: CanvasImageSource): THREE.Vector3 {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new THREE.Vector3(0.5, 0.5, 0.5);
  ctx.drawImage(img, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i]!;
    g += d[i + 1]!;
    b += d[i + 2]!;
  }
  const n = (d.length / 4) * 255;
  const col = new THREE.Color().setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
  return new THREE.Vector3(col.r, col.g, col.b);
}

function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

function surfaceUniforms(id: SurfaceId): SurfaceUniforms {
  let u = uniformsCache.get(id);
  if (u) return u;
  const def = SURFACES[id];
  u = {
    uTriDiff: { value: null },
    uTriNor: { value: null },
    uTriRough: { value: null },
    uTriAvg: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
    uTriRoughAvg: { value: 0.5 },
    uTriScale: { value: def.scale },
    uTriNormalScale: { value: def.normalScale },
    uTriChroma: { value: def.chroma },
    uTriAlbedo: { value: def.albedo },
    uTriReady: { value: 0 },
  };
  uniformsCache.set(id, u);
  const uu = u;
  const ready = Promise.all([
    def.diff ? loadTex(def.diff, true) : Promise.resolve(null),
    loadTex(def.nor, false),
    def.rough ? loadTex(def.rough, false) : Promise.resolve(null),
  ])
    .then(([diff, nor, rough]) => {
      if (diff) {
        uu.uTriDiff.value = diff;
        uu.uTriAvg.value.copy(averageOf(diff.image as CanvasImageSource));
      }
      uu.uTriNor.value = nor;
      if (rough) {
        uu.uTriRough.value = rough;
        uu.uTriRoughAvg.value = Math.max(0.05, averageOf(rough.image as CanvasImageSource).x);
      }
      uu.uTriReady.value = 1;
      return true;
    })
    // Không tải được texture (mất mạng…) — vật liệu giữ màu trơn.
    .catch(() => false);
  readyCache.set(id, ready);
  return u;
}

/**
 * Bề mặt PBR theo UV có sẵn của hình (đơn vị UV = mét), cho hình có hướng vân rõ ràng (hàng ngói chạy dọc mép mái).
 * Màu `target` là màu trung bình mong muốn: màu vật liệu = target / màu trung bình texture.
 */
export function applySurfaceUV(m: THREE.MeshStandardMaterial, id: SurfaceId, target: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const def = SURFACES[id];
  const u = surfaceUniforms(id);
  const want = new THREE.Color(target).multiplyScalar(def.albedo);
  m.color.copy(want);
  const apply = () => {
    const tile = (t: THREE.Texture | null) => {
      if (!t) return null;
      const c = t.clone();
      c.repeat.set(1 / def.scale, 1 / def.scale);
      c.needsUpdate = true;
      return c;
    };
    m.map = tile(u.uTriDiff.value);
    m.normalMap = tile(u.uTriNor.value);
    m.normalScale.set(def.normalScale, def.normalScale);
    m.roughnessMap = tile(u.uTriRough.value);
    if (m.map) {
      const a = u.uTriAvg.value;
      m.color.setRGB(want.r / Math.max(a.x, 0.02), want.g / Math.max(a.y, 0.02), want.b / Math.max(a.z, 0.02));
    }
    if (m.roughnessMap) m.roughness = Math.min(1, m.roughness / Math.max(u.uTriRoughAvg.value, 0.05));
    m.needsUpdate = true;
  };
  void readyCache.get(id)?.then((ok) => ok && apply());
  return m;
}

const VERT_DECL = /* glsl */ `
varying vec3 vTriPos;
varying vec3 vTriNormal;`;

const VERT_BODY = /* glsl */ `
{
  vec4 triWorld = vec4(transformed, 1.0);
  vec3 triObjN = objectNormal;
  #ifdef USE_INSTANCING
    triWorld = instanceMatrix * triWorld;
    triObjN = mat3(instanceMatrix) * triObjN;
  #endif
  triWorld = modelMatrix * triWorld;
  vTriPos = triWorld.xyz;
  vTriNormal = normalize(mat3(modelMatrix) * triObjN);
}`;

const FRAG_DECL = /* glsl */ `
varying vec3 vTriPos;
varying vec3 vTriNormal;
uniform sampler2D uTriDiff;
uniform sampler2D uTriNor;
uniform sampler2D uTriRough;
uniform vec3 uTriAvg;
uniform float uTriRoughAvg;
uniform float uTriScale;
uniform float uTriNormalScale;
uniform float uTriChroma;
uniform float uTriAlbedo;
uniform float uTriReady;
vec3 triWeights(vec3 n) {
  vec3 w = pow(abs(n), vec3(4.0));
  return w / max(w.x + w.y + w.z, 1e-5);
}
vec4 triSample(sampler2D t, vec3 p, vec3 w) {
  return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
}`;

/** Gắn bề mặt PBR (texture ba mặt) vào vật liệu chuẩn/vật lý. Nối tiếp onBeforeCompile sẵn có của vật liệu. */
export function applySurface(m: THREE.MeshStandardMaterial, id: SurfaceId): THREE.MeshStandardMaterial {
  const def = SURFACES[id];
  const u = surfaceUniforms(id);
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.userData.surface = id;
  m.onBeforeCompile = (sh, renderer) => {
    prev.call(m, sh, renderer);
    Object.assign(sh.uniforms, u);
    sh.defines = { ...sh.defines, TRI_SURFACE: '' };
    if (def.diff) sh.defines.TRI_DIFF = '';
    if (def.rough) sh.defines.TRI_ROUGH = '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERT_BODY}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        vec3 triP = vTriPos / uTriScale;
        vec3 triW = triWeights(normalize(vTriNormal));
        diffuseColor.rgb *= uTriAlbedo;
        #ifdef TRI_DIFF
        {
          vec3 tc = triSample(uTriDiff, triP, triW).rgb;
          vec3 ratio = clamp(tc / max(uTriAvg, vec3(0.02)), 0.0, 1.9);
          float l = dot(ratio, vec3(0.2126, 0.7152, 0.0722));
          ratio = mix(vec3(l), ratio, uTriChroma);
          diffuseColor.rgb = min(diffuseColor.rgb * mix(vec3(1.0), ratio, uTriReady), vec3(1.0));
        }
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        #ifdef TRI_ROUGH
          roughnessFactor = clamp(roughnessFactor * mix(1.0, triSample(uTriRough, triP, triW).g / uTriRoughAvg, uTriReady), 0.04, 1.0);
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          // Pháp tuyến ba mặt (whiteout blend), tính ở không gian thế giới rồi đổi sang không gian nhìn.
          vec3 wn = normalize(vTriNormal) * faceDirection;
          vec3 tx = texture2D(uTriNor, triP.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(uTriNor, triP.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(uTriNor, triP.xy).xyz * 2.0 - 1.0;
          tx.xy *= uTriNormalScale;
          ty.xy *= uTriNormalScale;
          tz.xy *= uTriNormalScale;
          tx = vec3(tx.xy + wn.zy, abs(tx.z) * wn.x);
          ty = vec3(ty.xy + wn.xz, abs(ty.z) * wn.y);
          tz = vec3(tz.xy + wn.xy, abs(tz.z) * wn.z);
          vec3 tw = triWeights(wn);
          vec3 detail = normalize(tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z);
          vec3 viewDetail = normalize((viewMatrix * vec4(mix(wn, detail, uTriReady), 0.0)).xyz);
          normal = viewDetail;
        }`,
      );
  };
  m.customProgramCacheKey = () => `${prevKey()}|tri:${id}`;
  m.needsUpdate = true;
  return m;
}
