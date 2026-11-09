import * as THREE from 'three';
import { nextFrame } from '../../core/assets.js';
import { buildTerrain, terrainHeight } from './terrain.js';
import { buildNature } from './nature.js';
import { buildStructures } from './structures.js';
import { buildWater } from './water.js';
import { createSky } from './sky.js';
import { SPAWN, WATER_LEVEL, WALK_LIMIT } from './layout.js';

/**
 * 절차 생성 테스트 월드: 산으로 둘러싸인 계곡, 강과 다리, 마을, 석축 위 탑과 법당, 정자, 숲.
 * Marble 월드와 똑같은 규약(root / collider / spawn …)을 돌려주므로
 * 나중에 worlds.json 에서 Marble 월드로 바꾸면 나머지 코드는 그대로 동작한다.
 */
export async function loadTestWorld(def, { renderer, scene, onProgress }) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const root = new THREE.Group();
  root.name = 'TestWorld';

  onProgress?.('하늘 만드는 중…', 0.05);
  await nextFrame();
  const { sky, sunDir, envMap } = createSky(renderer);
  root.add(sky);
  scene.environment = envMap;
  scene.environmentIntensity = 0.6;
  scene.background = new THREE.Color('#a9c2d8');
  scene.fog = new THREE.Fog('#b4c7d6', 110, 650);

  const sun = new THREE.DirectionalLight('#fff1dc', 3.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -55;
  sc.right = sc.top = 55;
  sc.near = 1;
  sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  root.add(new THREE.HemisphereLight('#cfe3ff', '#5a6b3a', 0.55));

  onProgress?.('지형 만드는 중…', 0.15);
  await nextFrame();
  root.add(buildTerrain());

  onProgress?.('강 만드는 중…', 0.45);
  await nextFrame();
  const water = buildWater();
  root.add(water.mesh);

  onProgress?.('나무 심는 중…', 0.55);
  await nextFrame();
  root.add(buildNature());

  onProgress?.('건물 짓는 중…', 0.8);
  await nextFrame();
  root.add(buildStructures());

  const spawnPos = new THREE.Vector3(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z) + 0.05, SPAWN.z);
  const [lx, lz] = SPAWN.lookAt;
  const yaw = Math.atan2(-(lx - SPAWN.x), -(lz - SPAWN.z));

  return {
    name: def.name ?? '테스트 월드',
    root,
    collider: root, // 테스트 월드는 보이는 메시 자체가 충돌 메시 (장식은 noCollide)
    boundary: makeBoundaryWalls(), // 장면에 넣지 않는 보이지 않는 벽 (충돌만)
    spawn: { position: spawnPos, yaw },
    killY: -40,
    waterLevel: WATER_LEVEL,
    update(dt, time, { camera, focus }) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = time;
      water.update(time);
      // 그림자 영역이 플레이어를 따라다니도록
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 160);
    },
  };
}

/** 월드 가장자리의 보이지 않는 벽 */
function makeBoundaryWalls() {
  const g = new THREE.Group();
  g.name = 'BoundaryWalls';
  const L = WALK_LIMIT;
  const H = 460;
  const T = 2;
  const mat = new THREE.MeshBasicMaterial();
  for (const [x, z, w, d] of [
    [L + T / 2, 0, T, 2 * L + 2 * T],
    [-L - T / 2, 0, T, 2 * L + 2 * T],
    [0, L + T / 2, 2 * L + 2 * T, T],
    [0, -L - T / 2, 2 * L + 2 * T, T],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mat);
    wall.position.set(x, H / 2 - 60, z);
    g.add(wall);
  }
  return g;
}
