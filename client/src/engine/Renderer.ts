// Lớp vẽ: WebGL (bóng mềm, tone mapping AgX, ánh sáng môi trường IBL, AO, bloom, chỉnh màu + viền tối),
// nhãn HTML gắn 3D (CSS2D), lượt vẽ riêng cho đôi tay góc nhìn thứ nhất, lớp CSS3D dưới canvas (khung YouTube của màn hình
// LED Bar — chỉ lộ ra ở chỗ canvas "đục lỗ" trong suốt).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import type { GraphicsQuality } from '../settings';

export interface BloomSettings {
  strength: number;
  radius: number;
  threshold: number;
}

/** Chỉnh màu cuối khung hình: viền tối bốn góc, độ rực màu, ánh màu chung của map. */
export interface GradeSettings {
  vignette: number;
  saturation: number;
  tint: [number, number, number];
}

const GradeShader = {
  name: 'TuGradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0 },
    uSaturation: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Chặn điểm ảnh NaN/vô cực (nếu còn sót) để không thành đốm trắng/đen.
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, uSaturation), 0.0) * uTint;
      vec2 d = vUv - 0.5;
      float edge = smoothstep(0.1, 0.5, dot(d, d) * 1.6);
      c.rgb *= 1.0 - uVignette * edge;
      gl_FragColor = c;
    }`,
};

// Flat shading tính pháp tuyến từ đạo hàm màn hình: với tam giác quá nhỏ/suy biến (đồ vật nhỏ ở xa)
// tích có hướng = 0 → normalize ra NaN → điểm ảnh NaN bị bloom loang thành đốm trắng nhấp nháy.
// Vá một lần cho mọi vật liệu: pháp tuyến suy biến thì dùng hướng nhìn thẳng.
const FLAT_NORMAL = 'vec3 normal = normalize( cross( fdx, fdy ) );';
if (THREE.ShaderChunk.normal_fragment_begin.includes(FLAT_NORMAL)) {
  THREE.ShaderChunk.normal_fragment_begin = THREE.ShaderChunk.normal_fragment_begin.replace(
    FLAT_NORMAL,
    'vec3 flatN = cross( fdx, fdy ); vec3 normal = dot( flatN, flatN ) > 1e-20 ? normalize( flatN ) : vec3( 0.0, 0.0, 1.0 );',
  );
}

export class Renderer3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly labels: CSS2DRenderer;
  /** Lớp CSS3D dưới canvas (khung YouTube của màn hình LED Bar) + cảnh riêng của nó. */
  readonly css3d: CSS3DRenderer;
  readonly cssScene = new THREE.Scene();
  /** Vẽ lớp CSS3D mỗi khung (chỉ bật khi màn hình trong tầm nhìn và đang chiếu video). */
  cssLive = false;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 900);
  /** Cảnh riêng cho đôi tay + vật cầm (góc nhìn thứ nhất), vẽ sau cảnh chính và xóa depth. */
  readonly vmScene = new THREE.Scene();
  readonly vmCamera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  showViewmodel = true;

  private readonly composer: EffectComposer;
  private readonly gtao: GTAOPass;
  private readonly bloom: UnrealBloomPass;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly grade: ShaderPass;
  private bloomSettings: BloomSettings | null = null;
  private quality: GraphicsQuality = 'high';
  private readonly onResize = () => this.resize();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    // Canvas có kênh alpha để màn hình LED "đục lỗ" cho video YouTube (lớp CSS3D bên dưới) hiện qua; chỗ khác vẫn đục
    // (nền map là Color → xoá với alpha 1; cảnh không nền cũng xoá đục).
    this.renderer.setClearAlpha(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    container.append(this.renderer.domElement);

    // Chèn TRƯỚC canvas, trong #stage (hiệu ứng say rượu biến dạng cả hai lớp như nhau); nằm dưới canvas nhờ z-index âm
    // (.css3d-layer ở ui.css) — canvas luôn đè lên nên phần tử trong lớp này không nhận chuột / bàn phím.
    this.css3d = new CSS3DRenderer();
    this.css3d.domElement.className = 'css3d-layer';
    container.insertBefore(this.css3d.domElement, this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.append(this.labels.domElement);

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // AO màn hình (góc tường, chân cột, gầm mái tối lại tự nhiên). Bỏ qua vật thể hiệu ứng (trong suốt, không chịu sáng,
    // shader riêng, lá cắt alpha, sprite) — không thì chúng ghi pháp tuyến giả và sinh quầng tối sai.
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    const gtaoInternals = this.gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    gtaoInternals._overrideVisibility = () => {
      this.scene.traverse((o) => {
        if (!o.visible) return;
        const m = (o as THREE.Mesh).material as (THREE.Material & { isShaderMaterial?: boolean; isMeshBasicMaterial?: boolean }) | undefined;
        const fx = !m || Array.isArray(m) || m.transparent || m.alphaTest > 0 || m.isShaderMaterial || m.isMeshBasicMaterial;
        if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || ((o as THREE.Mesh).isMesh && fx)) {
          o.visible = false;
          gtaoInternals._visibilityCache.push(o);
        }
      });
    };
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.4, 0.9);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    // Ánh sáng riêng cho đôi tay (không phụ thuộc map).
    this.vmScene.add(new THREE.HemisphereLight('#fff6e8', '#6b5a4a', 2.2));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(0.6, 1, 0.4);
    this.vmScene.add(key, this.vmCamera);

    addEventListener('resize', this.onResize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setQuality(q: GraphicsQuality): void {
    this.quality = q;
    this.renderer.shadowMap.enabled = q === 'high';
    this.gtao.enabled = q === 'high';
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
    });
    this.resize();
  }

  /**
   * Ánh sáng môi trường (IBL) chụp từ một cảnh nguồn (vd bầu trời vật lý): mọi vật liệu PBR nhận ánh sáng khuếch tán
   * + phản chiếu bầu trời. null = tắt.
   */
  setEnvironment(source: THREE.Scene | null, intensity = 1): void {
    this.envTarget?.dispose();
    this.envTarget = null;
    if (!source) {
      this.scene.environment = null;
      return;
    }
    this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
    this.envTarget = this.pmrem.fromScene(source, 0.015);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = intensity;
  }

  /** null = tắt bloom cho map hiện tại. */
  setBloom(b: BloomSettings | null): void {
    this.bloomSettings = b;
    if (b) {
      this.bloom.strength = b.strength;
      this.bloom.radius = b.radius;
      this.bloom.threshold = b.threshold;
    }
  }

  setGrade(g: GradeSettings): void {
    const u = this.grade.uniforms as typeof GradeShader.uniforms;
    u.uVignette.value = g.vignette;
    u.uSaturation.value = g.saturation;
    u.uTint.value.set(...g.tint);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth || innerWidth);
    const h = Math.max(1, this.container.clientHeight || innerHeight);
    const ratio = this.quality === 'high' ? Math.min(devicePixelRatio, 1.5) : 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.css3d.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  render(): void {
    if (this.bloomSettings && this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.showViewmodel) {
      const r = this.renderer;
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
      r.autoClear = true;
    }
    this.labels.render(this.scene, this.camera);
    if (this.cssLive) this.css3d.render(this.cssScene, this.camera);
  }

  /** Vẽ lớp CSS3D ngay 1 lần (đưa phần tử mới thêm vào DOM, kể cả khi chưa bật cssLive). */
  renderCss(): void {
    this.css3d.render(this.cssScene, this.camera);
  }

  dispose(): void {
    removeEventListener('resize', this.onResize);
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.gtao.dispose();
    this.bloom.dispose();
    this.grade.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    // Trả ngay ngữ cảnh WebGL cho trình duyệt (rời phòng rồi vào lại nhiều lần không bị cạn ngữ cảnh).
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
    // Gỡ CSS3DObject khỏi cảnh → phần tử của nó tự rời DOM (sự kiện 'removed'), rồi gỡ cả lớp.
    this.cssScene.clear();
    this.css3d.domElement.remove();
  }
}
