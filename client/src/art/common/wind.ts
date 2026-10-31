// Gió lay cây/cỏ trên GPU: chèn vào vertex shader của vật liệu. Độ lệch tăng theo độ cao thế giới của đỉnh
// (gốc cây đứng yên), pha theo vị trí nên mỗi cây lay khác nhau — chạy được cả với mesh đã gộp và InstancedMesh.
import * as THREE from 'three';

export interface WindUniforms {
  uTime: { value: number };
  uWind: { value: number };
}

/** Một bộ uniform dùng chung cho mọi vật liệu có gió của 1 map (map tự tăng uTime mỗi khung hình). */
export function createWind(strength = 0.12): WindUniforms {
  return { uTime: { value: 0 }, uWind: { value: strength } };
}

/**
 * Bản sao vật liệu có gió (không đụng vật liệu cache). `heightScale`: độ cao (m) mà tại đó độ lệch đạt mức chuẩn.
 */
export function windMaterial(base: THREE.MeshStandardMaterial, wind: WindUniforms, heightScale = 1): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uWind = wind.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wWorld = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          wWorld = instanceMatrix * wWorld;
        #endif
        wWorld = modelMatrix * wWorld;
        float wH = clamp(wWorld.y / ${heightScale.toFixed(3)}, 0.0, 1.6);
        float wPhase = uTime * 1.6 + wWorld.x * 0.21 + wWorld.z * 0.17;
        float wSway = sin(wPhase) * 0.6 + sin(wPhase * 2.3 + 1.3) * 0.22;
        transformed.x += wSway * wH * wH * uWind;
        transformed.z += cos(wPhase * 0.8) * wH * wH * uWind * 0.55;`,
      );
  };
  m.customProgramCacheKey = () => `wind-${heightScale}`;
  return m;
}
