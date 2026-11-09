import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * 물리 기반 하늘(구름 포함) + 그 하늘로 만든 환경맵(반사·간접광).
 * 하늘 상자는 카메라를 따라다니도록 index.js 의 update 에서 위치를 옮긴다.
 */
export function createSky(renderer, { elevation = 36, azimuth = 140 } = {}) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevation),
    THREE.MathUtils.degToRad(azimuth),
  );

  const make = () => {
    const sky = new Sky();
    const u = sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.3;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(sunDir);
    u.cloudCoverage.value = 0.38;
    u.cloudDensity.value = 0.42;
    return sky;
  };

  const sky = make();
  sky.scale.setScalar(1600);
  sky.frustumCulled = false;
  sky.userData.noCollide = true;

  // 환경맵: 해 원반은 빼고 구움 (반사에 하얀 점 생기는 것 방지)
  const envSky = make();
  envSky.material.uniforms.showSunDisc.value = 0;
  envSky.scale.setScalar(50);
  const envScene = new THREE.Scene();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  envSky.geometry.dispose();
  envSky.material.dispose();

  return { sky, sunDir, envMap };
}
