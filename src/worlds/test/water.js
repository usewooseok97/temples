import * as THREE from 'three';
import { riverX, riverSlope, RIVER, WATER_LEVEL, WORLD_HALF } from './layout.js';

/** 강 중심선을 따라가는 띠 모양 수면 + 흐르는 노멀맵 */
export function buildWater() {
  const half = RIVER.halfWidth + 3.5;
  const step = 2;
  const positions = [];
  const uvs = [];
  const indices = [];
  let v = 0;
  let row = 0;
  for (let z = -WORLD_HALF; z <= WORLD_HALF + 1e-6; z += step) {
    const cx = riverX(z);
    const s = riverSlope(z);
    const inv = 1 / Math.sqrt(1 + s * s);
    const px = inv; // 흐름 방향 (s, 1) 에 수직인 단위 벡터
    const pz = -s * inv;
    positions.push(cx - px * half, WATER_LEVEL, z - pz * half, cx + px * half, WATER_LEVEL, z + pz * half);
    uvs.push(0, v, 1, v);
    if (row > 0) {
      const a = (row - 1) * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    v += (step * Math.sqrt(1 + s * s)) / 10; // 텍스처 한 장 = 강 10m
    row++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const normalMap = makeWaterNormalMap();
  normalMap.repeat.set(2, 1);
  const material = new THREE.MeshStandardMaterial({
    color: '#2f6a78',
    roughness: 0.06,
    metalness: 0.0,
    transparent: true,
    opacity: 0.82,
    normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'River';
  mesh.receiveShadow = true;
  mesh.userData.noCollide = true; // 물은 통과 (바닥은 지형 하상)

  return {
    mesh,
    update(time) {
      normalMap.offset.set(Math.sin(time * 0.07) * 0.08, -time * 0.11); // 남쪽(+Z)으로 흐름
    },
  };
}

/** 정수 주파수 사인파 합으로 만든 이어지는 물결 노멀맵 */
function makeWaterNormalMap(size = 256) {
  const waves = [
    [3, 1, 0.9, 0.3],
    [-2, 3, 0.6, 1.7],
    [5, -2, 0.35, 2.2],
    [1, 6, 0.3, 0.9],
    [-7, -3, 0.18, 4.1],
    [9, 4, 0.12, 1.1],
  ];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const w = y / size;
      let dx = 0;
      let dy = 0;
      for (const [kx, ky, a, ph] of waves) {
        const c = Math.cos(2 * Math.PI * (kx * u + ky * w) + ph) * a * 2 * Math.PI;
        dx += c * kx;
        dy += c * ky;
      }
      let nx = -dx * 0.02;
      let ny = -dy * 0.02;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * size + x) * 4;
      data[i] = (nx * 0.5 + 0.5) * 255;
      data[i + 1] = (ny * 0.5 + 0.5) * 255;
      data[i + 2] = (nz * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
