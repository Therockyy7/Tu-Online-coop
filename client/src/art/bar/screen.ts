// Màn hình LED sân khấu Bar (spec 2026-11-02-dj-youtube-led-design.md mục 1–2): tấm 4,8 × 2,7 m trên tường Bắc sau lưng
// DJ (BAR_SCREEN), khung viền tối + viền neon theo màu đèn. Ba chế độ (WorldControls.setVideoScreen): 'idle' hình nền club
// (logo NIẾT BÀN CLUB + gợi ý dán link), 'loading' "Đang tải: <tên video>", 'video' mặt màn hình thành "lỗ" trong suốt trên
// canvas để khung YouTube thật ở lớp CSS3D bên dưới hiện qua (người / khói / tia laser đứng trước vẫn che như vật thật).
// Canvas hình nền chỉ vẽ lại khi đổi chế độ / tên. Kèm vị trí cột tường LED chia đôi hai bên màn hình (ledColumnX).
import * as THREE from 'three';
import { BAR_SCREEN } from '@shared/index';
import type { ArtKit } from '../kit';
import { glowCanvasMat, neonText } from './casinoKit';

/** Bề rộng / khoảng cách cột tường LED chia đôi 2 bên màn hình (m). */
export const LED_COL_W = 0.28;
export const LED_COL_STEP = 0.34;
/**
 * |X| tâm cột ngoài cùng: mép ngoài 5,92 m ≈ bề ngang tường LED cũ (±5,91). Cột trong cùng ở 5,78 − 9 × 0,34 = 2,72 m —
 * mép 2,58 m, cách khung viền màn hình (BAR_SCREEN.w / 2 + BEZEL = 2,55 m) 3 cm.
 */
const LED_OUTER_X = 5.78;

/**
 * X tâm cột c (0..19) — trái → phải, 10 cột mỗi bên màn hình (cột 0 sát mép trái tường, cột 9 / 10 sát khung màn hình).
 * Bên phải là ảnh gương bên trái (cột c ↔ 19 − c) nên đối xứng tuyệt đối, không lệch số thực.
 */
export function ledColumnX(c: number): number {
  return c < 10 ? -(LED_OUTER_X - c * LED_COL_STEP) : LED_OUTER_X - (19 - c) * LED_COL_STEP;
}

/**
 * Cắt `text` cho vừa `maxW` (đo bằng `measure`, vd measureText của canvas): dài quá thì bỏ bớt cuối + "…" (bỏ khoảng
 * trắng thừa trước "…"); cắt theo code point nên không tách đôi emoji.
 */
export function ellipsize(text: string, maxW: number, measure: (s: string) => number): string {
  if (measure(text) <= maxW) return text;
  const chars = [...text];
  const cut = (n: number) => `${chars.slice(0, n).join('').trimEnd()}…`;
  // Tìm nhị phân số ký tự giữ lại nhiều nhất (bề rộng không giảm khi giữ thêm ký tự).
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(cut(mid)) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return cut(lo);
}

export type ScreenMode = 'idle' | 'loading' | 'video';

export interface BarScreen {
  /** Khung viền + 4 dải neon ôm ngoài mép mặt màn hình (gộp tĩnh; dải neon dùng vật liệu theme nên vẫn đổi màu theo đèn). */
  readonly statics: THREE.Group;
  /** Mặt màn hình (đổi vật liệu theo chế độ — không gộp) + neo. */
  readonly dyn: THREE.Group;
  /** Neo 'video_screen': tâm mặt màn hình, +Z cục bộ hướng khán giả. */
  readonly anchor: THREE.Object3D;
  setMode(mode: ScreenMode, title?: string | null): void;
  dispose(): void;
}

/** Canvas hình nền 16:9 (≈ 213 px/m trên mặt 4,8 m). */
const CW = 1024;
const CH = 576;
/** Khung viền: rộng thêm mỗi phía, sâu; mặt trước lùi sau mặt màn hình (mặt màn hình nhô 2 cm — tránh z-fighting). */
const BEZEL = 0.15;
const FRAME_D = 0.1;
const FACE_GAP = 0.02;
/** Dải neon mảnh ôm ngoài mép mặt màn hình (không đè lên lỗ): tiết diện, bề dày (đứng trên mặt khung, nhô 1 cm). */
const STRIP = 0.04;
const STRIP_D = 0.03;
const LOGO = 'NIẾT BÀN';
const CLUB = 'C L U B';
const IDLE_HINT = '▶ Dán link YouTube ở bàn DJ — cả quán cùng xem';

export function buildBarScreen(kit: ArtKit, themedMat: (slot: number, intensity: number) => THREE.Material): BarScreen {
  const S = BAR_SCREEN;
  /** Nhóm đặt sẵn tại tâm mặt màn hình, quay theo ry: con đặt theo toạ độ cục bộ (+Z ra phía khán giả). */
  const placed = () => {
    const g = new THREE.Group();
    g.position.set(S.x, S.y, S.z);
    g.rotation.y = S.ry;
    return g;
  };
  const statics = placed();
  const dyn = placed();

  statics.add(
    kit.mesh(kit.geo.box(S.w + 2 * BEZEL, S.h + 2 * BEZEL, FRAME_D), kit.mat('#0d0a14', { roughness: 0.6 }), { z: -FACE_GAP - FRAME_D / 2 }),
  );
  const neon = themedMat(0, 1.6);
  const stripZ = -FACE_GAP + STRIP_D / 2;
  for (const s of [-1, 1]) {
    statics.add(kit.mesh(kit.geo.box(S.w + 2 * STRIP, STRIP, STRIP_D), neon, { y: s * (S.h / 2 + STRIP / 2), z: stripZ, castShadow: false }));
    statics.add(kit.mesh(kit.geo.box(STRIP, S.h, STRIP_D), neon, { x: s * (S.w / 2 + STRIP / 2), z: stripZ, castShadow: false }));
  }

  // Hình nền (idle / loading): canvas riêng, chỉ vẽ lại khi đổi nội dung (không cấp phát / vẽ lại mỗi khung).
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const c2d = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const glowMat = glowCanvasMat(tex, 1.1);
  // "Lỗ": ghi thẳng (0,0,0,0) vào canvas có kênh alpha. NoBlending bắt buộc (blending thường + không trong suốt thì three ép
  // alpha = 1 → ra màu đen); fog:false (không thì sương tím cộng vào rgb trong khi alpha 0 → quầng sáng trên video).
  const holeMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    opacity: 0,
    transparent: false,
    blending: THREE.NoBlending,
    depthWrite: true,
    fog: false,
    toneMapped: false,
  });
  const face = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(new THREE.PlaneGeometry(S.w, S.h), glowMat);
  face.name = 'bar_screen_face';
  face.castShadow = false;
  face.receiveShadow = false;
  dyn.add(face);
  const anchor = new THREE.Object3D();
  anchor.name = 'anchor:video_screen';
  dyn.add(anchor);

  /** Tên video đang hiện "Đang tải: …"; null = hình nền chờ (idle). */
  let loadingTitle: string | null = null;
  /** Nội dung canvas đã vẽ ('idle' | 'loading|<tên>'). */
  let drawn = 'idle';
  let disposed = false;

  /** Đặt font canvas cỡ lớn nhất (giảm dần từ `size`, tối thiểu `min`) để `text` vừa `maxW`. */
  const fitFont = (text: string, weight: number, size: number, family: string, maxW: number, min: number) => {
    const c = c2d;
    c.font = `${weight} ${size}px ${family}`;
    while (c.measureText(text).width > maxW && size > min) {
      size -= 2;
      c.font = `${weight} ${size}px ${family}`;
    }
  };

  const draw = () => {
    if (disposed) return;
    const c = c2d;
    const bg = c.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, '#0b0814');
    bg.addColorStop(1, '#1d1236');
    c.fillStyle = bg;
    c.fillRect(0, 0, CW, CH);
    const halo = c.createRadialGradient(CW / 2, 250, 0, CW / 2, 250, 430);
    halo.addColorStop(0, 'rgba(155,92,255,0.2)');
    halo.addColorStop(1, 'rgba(155,92,255,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, CW, CH);
    // Chấm lưới LED mờ (như chữ chạy trên bàn DJ).
    c.fillStyle = 'rgba(255,255,255,0.045)';
    for (let x = 2; x < CW; x += 6) for (let y = 2; y < CH; y += 6) c.fillRect(x, y, 2, 2);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // Logo: "NIẾT BÀN" chữ neon xanh, quầng hồng; dưới là "C L U B" hồng giữa hai vạch neon.
    fitFont(LOGO, 800, 150, kit.FONT_TITLE, CW * 0.8, 60);
    c.save();
    c.shadowColor = '#ff4fd8';
    c.shadowBlur = 46;
    c.fillStyle = '#ff4fd8';
    c.fillText(LOGO, CW / 2, 200);
    c.restore();
    neonText(c, LOGO, CW / 2, 200, '#7ff6ff', 16);
    fitFont(CLUB, 800, 58, kit.FONT_TITLE, CW * 0.5, 30);
    neonText(c, CLUB, CW / 2, 300, '#ff4fd8', 14);
    const gap = c.measureText(CLUB).width / 2 + 26;
    c.save();
    c.strokeStyle = '#ff4fd8';
    c.lineWidth = 4;
    c.shadowColor = '#ff4fd8';
    c.shadowBlur = 14;
    c.beginPath();
    c.moveTo(CW / 2 - gap - 170, 302);
    c.lineTo(CW / 2 - gap, 302);
    c.moveTo(CW / 2 + gap, 302);
    c.lineTo(CW / 2 + gap + 170, 302);
    c.stroke();
    c.restore();
    if (loadingTitle === null) {
      fitFont(IDLE_HINT, 700, 42, kit.FONT_BODY, CW * 0.88, 22);
      neonText(c, IDLE_HINT, CW / 2, 430, '#ffe14f', 10);
    } else {
      c.font = `700 46px ${kit.FONT_BODY}`;
      const line = loadingTitle ? ellipsize(`Đang tải: ${loadingTitle}`, CW * 0.88, (s) => c.measureText(s).width) : 'Đang tải video YouTube…';
      neonText(c, line, CW / 2, 415, '#7ff6ff', 10);
      c.font = `700 30px ${kit.FONT_BODY}`;
      neonText(c, '▶ YouTube', CW / 2, 482, '#ff4f4f', 8);
    }
    tex.needsUpdate = true;
  };
  draw();
  if (typeof document !== 'undefined' && document.fonts) void document.fonts.ready.then(draw);

  return {
    statics,
    dyn,
    anchor,
    setMode(mode, title) {
      if (mode === 'video') {
        face.material = holeMat;
        return;
      }
      const t = mode === 'loading' ? (title?.trim() ?? '') : null;
      const key = t === null ? 'idle' : `loading|${t}`;
      if (key !== drawn) {
        drawn = key;
        loadingTitle = t;
        draw();
      }
      face.material = glowMat;
    },
    dispose() {
      disposed = true;
      tex.dispose();
      glowMat.dispose();
      holeMat.dispose();
      face.geometry.dispose();
    },
  };
}
