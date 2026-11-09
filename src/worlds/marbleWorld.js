import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';
import { assertAssetExists, assetUrl, fileExtension, loadGltf } from '../core/assets.js';
import { DEG, toXYZ } from '../core/math.js';

/**
 * World Labs Marble 에서 내보낸 월드 = Gaussian splat(.spz/.ply) + 충돌 메시(collider .glb)
 *
 * worlds.json 항목 예:
 * {
 *   "id": "my-temple",
 *   "name": "우리 절",
 *   "type": "marble",
 *   "splat": "worlds/my-temple/world.spz",
 *   "collider": "worlds/my-temple/collider.glb",          // 없으면 y=0 평면 바닥
 *   "panorama": "worlds/my-temple/pano.png",               // 선택: 배경 360 이미지
 *   "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": 1 },  // 선택: 월드 전체 배치·크기
 *   "splatRotation": [0,0,0],                              // 선택: splat 만 따로 회전 (도)
 *   "colliderRotation": [0,0,0],                           // 선택: collider 만 따로 회전 (도)
 *   "spawn": { "position": [0, 0, 0], "yaw": 0 },          // 선택: 없으면 원점 아래 바닥을 자동으로 찾음
 *   "lod": true                                            // 선택: Spark LoD (기본 true)
 * }
 *
 * 좌표계: Marble .spz 와 collider .glb 는 three.js 기준 Y-up 으로 바로 맞는다.
 * .ply 는 OpenCV 좌표(Y-down)로 나오는 경우가 많아 기본으로 X축 180° 뒤집는다.
 * 뒤집혀 보이면 splatRotation 을 [180,0,0] / [0,0,0] 으로 바꿔 보면 된다.
 */
export async function loadMarbleWorld(def, ctx) {
  const { renderer, scene, params, onProgress } = ctx;
  if (!def.splat) throw new Error(`월드 "${def.id}" 에 splat 경로가 없습니다.`);
  try {
    await Promise.all([assertAssetExists(def.splat), def.collider && assertAssetExists(def.collider)]);
  } catch (err) {
    throw new Error(`Marble 월드를 불러오지 못했습니다.\n${err.message}\n\nworlds.json 의 경로는 public/ 폴더 기준입니다.`);
  }

  renderer.toneMapping = THREE.NoToneMapping; // splat 색은 이미 화면용이라 톤매핑 끔
  renderer.shadowMap.enabled = false;

  const lodScale = Number(params?.get('lod')) || def.lodSplatScale || 1;
  const spark = new SparkRenderer({ renderer, lodSplatScale: lodScale });
  scene.add(spark);

  const root = new THREE.Group();
  root.name = `World:${def.id}`;
  applyTransform(root, def.transform);

  // 캐릭터(일반 메시)를 비출 조명 — splat 자체는 조명 영향을 받지 않음
  root.add(new THREE.HemisphereLight('#ffffff', '#5b5348', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(3, 10, 4);
  root.add(key);

  // ---- 1) splat ----
  const progress = { splat: 0, collider: def.collider ? 0 : 1 };
  const report = () => onProgress?.('월드 데이터 받는 중…', progress.splat * 0.8 + progress.collider * 0.2);
  const splat = new SplatMesh({
    url: assetUrl(def.splat),
    lod: def.lod ?? true,
    onProgress: (e) => {
      if (e?.total) {
        progress.splat = e.loaded / e.total;
        report();
      }
    },
  });
  const defaultSplatRot = fileExtension(def.splat) === 'ply' ? [180, 0, 0] : [0, 0, 0];
  setRotationDeg(splat, def.splatRotation ?? defaultSplatRot);
  root.add(splat);

  // ---- 2) collider ----
  const colliderRoot = new THREE.Group();
  colliderRoot.name = 'MarbleCollider';
  applyTransform(colliderRoot, def.transform);
  let warning;

  const colliderTask = def.collider
    ? loadGltf(def.collider, (e) => {
        if (e?.total) {
          progress.collider = e.loaded / e.total;
          report();
        }
      }).then((gltf) => {
        const holder = new THREE.Group();
        setRotationDeg(holder, def.colliderRotation ?? [0, 0, 0]);
        holder.add(gltf.scene);
        colliderRoot.add(holder);
      })
    : Promise.resolve().then(() => {
        warning = '충돌 메시(collider)가 없어 y=0 평면을 바닥으로 씁니다.';
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2));
        ground.position.y = def.groundY ?? 0;
        colliderRoot.add(ground);
      });

  try {
    await Promise.all([splat.initialized, colliderTask]);
  } catch (err) {
    throw new Error(
      `Marble 월드를 불러오지 못했습니다.\n` +
        `splat: ${def.splat}\ncollider: ${def.collider ?? '(없음)'}\n\n` +
        `public/ 폴더 안 경로가 맞는지 확인해 주세요.\n(${err?.message ?? err})`,
    );
  }

  // ---- 3) 배경 ----
  scene.background = new THREE.Color('#0b0d10');
  if (def.panorama) {
    try {
      const tex = await new THREE.TextureLoader().loadAsync(assetUrl(def.panorama));
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
      scene.environment = tex;
    } catch (err) {
      console.warn('[marble] panorama 를 불러오지 못했습니다.', err);
    }
  }

  // ---- 4) 시작 위치 ----
  let spawn;
  if (def.spawn?.position) {
    const [x, y, z] = toXYZ(def.spawn.position);
    spawn = { position: new THREE.Vector3(x, y, z), yaw: (def.spawn.yaw ?? 0) * DEG, findGround: !!def.spawn.findGround };
  } else {
    // 원점 근처에서 아래로 레이캐스트해 바닥을 찾음 (Marble 월드는 원점이 보통 촬영 위치)
    const o = new THREE.Vector3();
    root.updateMatrixWorld(true);
    root.localToWorld(o);
    spawn = { position: o, yaw: (def.spawn?.yaw ?? 0) * DEG, findGround: true };
  }

  colliderRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(colliderRoot);
  const killY = def.killY ?? (box.isEmpty() ? -50 : box.min.y - 30);

  return {
    name: def.name ?? def.id,
    root,
    collider: colliderRoot,
    spawn,
    killY,
    warning,
    splat,
  };
}

function setRotationDeg(obj, rot) {
  const [x, y, z] = toXYZ(rot);
  obj.rotation.set(x * DEG, y * DEG, z * DEG);
}

function applyTransform(obj, t = {}) {
  const [px, py, pz] = toXYZ(t.position);
  obj.position.set(px, py, pz);
  setRotationDeg(obj, t.rotation);
  const s = t.scale ?? 1;
  if (Array.isArray(s)) obj.scale.set(s[0], s[1], s[2]);
  else obj.scale.setScalar(s);
}
