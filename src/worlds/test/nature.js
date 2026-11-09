import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight, fbm, pathDistance, smoothstep } from './terrain.js';
import { RIVER, riverDistance, VILLAGE, TEMPLE, PAVILION, SPAWN, BRIDGE, BRIDGE_X } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);

/** 시드 고정 난수 (매번 같은 배치) */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slopeAt(x, z) {
  const e = 1;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

/** 나무·바위를 두면 안 되는 곳 (강, 광장, 석축, 길 …) */
function blocked(x, z, margin = 0) {
  if (riverDistance(x, z) < RIVER.halfWidth + 4.5 + margin) return true;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + 3) return true;
  if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < TEMPLE.radius + 2) return true;
  if (Math.hypot(x - PAVILION.x, z - PAVILION.z) < 9) return true;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 10) return true;
  if (Math.abs(z - BRIDGE.z) < 7 && Math.abs(x - BRIDGE_X) < BRIDGE.length / 2 + 7) return true;
  if (pathDistance(x, z) < 3.4) return true;
  return false;
}

function translated(geo, x, y, z) {
  geo.translate(x, y, z);
  return geo;
}

export function buildNature() {
  const rand = rng(20251109);
  const group = new THREE.Group();
  group.name = 'Nature';

  // ---- 나무 배치 ----
  const trees = [];
  const minGap2 = 3.2 * 3.2;
  for (let i = 0; i < 12000 && trees.length < 900; i++) {
    const r = Math.sqrt(rand()) * 250;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (blocked(x, z)) continue;
    const y = terrainHeight(x, z);
    if (y > 82 || y < 0.3 || slopeAt(x, z) > 0.9) continue;
    const forest = smoothstep(105, 175, r); // 산기슭은 숲
    const grove = Math.max(0, fbm(x / 45, z / 45, 3, 77.7)); // 계곡의 작은 숲 덩어리
    if (rand() > 0.06 + 0.8 * forest + grove * 1.5) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < minGap2)) continue;
    trees.push({
      x,
      y,
      z,
      s: 0.8 + rand() * 0.7,
      rot: rand() * Math.PI * 2,
      conifer: rand() < 0.4 + forest * 0.5,
    });
  }

  // ---- 나무 형태 (로우폴리) ----
  const trunkGeo = translated(new THREE.CylinderGeometry(0.16, 0.26, 3.0, 7), 0, 1.2, 0);
  const coniferGeo = mergeGeometries([
    translated(new THREE.ConeGeometry(1.7, 2.8, 7), 0, 2.6, 0),
    translated(new THREE.ConeGeometry(1.3, 2.4, 7), 0, 3.8, 0),
    translated(new THREE.ConeGeometry(0.85, 2.0, 7), 0, 4.9, 0),
  ]);
  const broadGeo = mergeGeometries([
    translated(new THREE.IcosahedronGeometry(1.9, 1), 0, 3.7, 0),
    translated(new THREE.IcosahedronGeometry(1.35, 1), 0.9, 4.4, 0.3),
    translated(new THREE.IcosahedronGeometry(1.25, 1), -0.8, 4.2, -0.5),
  ]);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true });

  const conifers = trees.filter((t) => t.conifer);
  const broads = trees.filter((t) => !t.conifer);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const conMesh = new THREE.InstancedMesh(coniferGeo, leafMat, conifers.length);
  const broadMesh = new THREE.InstancedMesh(broadGeo, leafMat, broads.length);
  conMesh.userData.noCollide = true; // 잎은 통과, 줄기만 충돌
  broadMesh.userData.noCollide = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const place = (t) => {
    p.set(t.x, t.y, t.z);
    q.setFromAxisAngle(UP, t.rot);
    s.setScalar(t.s);
    return m.compose(p, q, s);
  };
  trees.forEach((t, i) => trunks.setMatrixAt(i, place(t)));
  conifers.forEach((t, i) => {
    conMesh.setMatrixAt(i, place(t));
    conMesh.setColorAt(i, col.setHSL(0.36 + rand() * 0.04, 0.42 + rand() * 0.15, 0.17 + rand() * 0.06));
  });
  broads.forEach((t, i) => {
    broadMesh.setMatrixAt(i, place(t));
    broadMesh.setColorAt(i, col.setHSL(0.22 + rand() * 0.06, 0.45 + rand() * 0.15, 0.26 + rand() * 0.08));
  });

  for (const mesh of [trunks, conMesh, broadMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // ---- 바위 (강둑과 산기슭) ----
  const rocks = [];
  for (let i = 0; i < 4000 && rocks.length < 160; i++) {
    const r = Math.sqrt(rand()) * 240;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const rd = riverDistance(x, z);
    const nearRiver = rd > RIVER.halfWidth + 0.5 && rd < RIVER.halfWidth + 10;
    const onSlope = r > 120;
    if (!nearRiver && !onSlope) continue;
    if (!nearRiver && rand() > 0.15) continue;
    if (blocked(x, z, -4.5)) continue;
    if (pathDistance(x, z) < 3) continue;
    const big = rand() < 0.2;
    const sx = (big ? 1.4 : 0.5) + rand() * (big ? 1.2 : 0.7);
    rocks.push({ x, z, sx, sy: sx * (0.5 + rand() * 0.4), sz: sx * (0.7 + rand() * 0.5), rot: rand() * Math.PI });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  rocks.forEach((r, i) => {
    p.set(r.x, terrainHeight(r.x, r.z) - r.sy * 0.35, r.z);
    q.setFromEuler(new THREE.Euler(rand() * 0.4, r.rot, rand() * 0.4));
    s.set(r.sx, r.sy, r.sz);
    rockMesh.setMatrixAt(i, m.compose(p, q, s));
    const g = 0.3 + rand() * 0.12;
    rockMesh.setColorAt(i, col.setRGB(g, g * 0.98, g * 0.94));
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  rockMesh.computeBoundingSphere();
  group.add(rockMesh);

  return group;
}
