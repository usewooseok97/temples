import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import {
  WORLD_HALF,
  WATER_LEVEL,
  RIVER,
  riverDistance,
  VILLAGE,
  TEMPLE,
  PAVILION,
  BRIDGE,
  BRIDGE_X,
  SPAWN,
  PATHS,
} from './layout.js';

const perlin = new ImprovedNoise(); // 고정 순열 → 매번 같은 지형

export const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function fbm(x, z, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin.noise(x * freq, z * freq, seed + i * 17.13);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function ridged(x, z, octaves = 5, seed = 0) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const v = 1 - Math.abs(perlin.noise(x * freq, z * freq, seed + i * 31.7));
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

/** 손대기 전 자연 지형: 계곡 바닥의 언덕 + 바깥을 둘러싼 산맥 */
function naturalHeight(x, z) {
  const r = Math.hypot(x, z);
  const hills = 1.5 + 2.4 * (fbm(x / 110, z / 110, 4, 3.1) + 0.5) + 0.7 * fbm(x / 26, z / 26, 3, 9.7);
  const warp = 22 * fbm(x / 150, z / 150, 3, 5.5);
  const ring = smoothstep(118, 262, r + warp);
  const peaks = 60 + 80 * ridged(x / 150, z / 150, 5, 1.7);
  return hills + Math.pow(ring, 1.35) * peaks;
}

// 평탄화 구역 (y 가 null 이면 그 자리 원래 높이로 평평하게)
const FLATS = [
  { x: VILLAGE.x, z: VILLAGE.z, r: VILLAGE.radius, fall: VILLAGE.falloff, y: VILLAGE.y },
  { x: TEMPLE.x, z: TEMPLE.z, r: TEMPLE.radius, fall: TEMPLE.falloff, y: TEMPLE.y },
  { x: PAVILION.x, z: PAVILION.z, r: PAVILION.radius, fall: PAVILION.falloff, y: null },
  { x: BRIDGE_X - BRIDGE.length / 2, z: BRIDGE.z, r: 5, fall: 9, y: BRIDGE.y },
  { x: BRIDGE_X + BRIDGE.length / 2, z: BRIDGE.z, r: 5, fall: 9, y: BRIDGE.y },
  { x: SPAWN.x, z: SPAWN.z, r: 5, fall: 10, y: null },
];
for (const f of FLATS) if (f.y === null) f.y = naturalHeight(f.x, f.z);

/** 최종 지형 높이 (충돌·배치 모두 이 함수 기준) */
export function terrainHeight(x, z) {
  let h = naturalHeight(x, z);
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r + f.fall) h = lerp(f.y, h, smoothstep(f.r, f.r + f.fall, d));
  }
  // 강: 하상 + 둑 + 산을 가르는 V자 협곡
  const d = riverDistance(x, z);
  const W = RIVER.halfWidth;
  const edge = WATER_LEVEL - 0.25;
  h = Math.min(h, edge + 0.85 * Math.max(0, d - W));
  if (d < W) h = Math.min(h, edge - 0.65 * (1 - (d / W) ** 2));
  else if (d < W + RIVER.bank) h = Math.min(h, lerp(edge, h, smoothstep(W, W + RIVER.bank, d)));
  return h;
}

const SEGMENTS = [];
for (const path of PATHS) for (let i = 0; i < path.length - 1; i++) SEGMENTS.push([path[i], path[i + 1]]);

/** 가장 가까운 흙길까지의 거리 */
export function pathDistance(x, z) {
  let best = Infinity;
  for (const [[ax, az], [bx, bz]] of SEGMENTS) {
    const dx = bx - ax;
    const dz = bz - az;
    let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + t * dx - x;
    const ez = az + t * dz - z;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

const PAL = {
  grassA: new THREE.Color('#5c8a3c'),
  grassB: new THREE.Color('#86a64e'),
  dry: new THREE.Color('#a29f62'),
  forest: new THREE.Color('#41683a'),
  dirt: new THREE.Color('#a4865f'),
  sand: new THREE.Color('#cdbd95'),
  riverbed: new THREE.Color('#7d735c'),
  rock: new THREE.Color('#858179'),
  rockDark: new THREE.Color('#5f5b55'),
  snow: new THREE.Color('#f2f4f6'),
  plaza: new THREE.Color('#b9a98b'),
};

export function buildTerrain() {
  // 가운데(계곡)는 촘촘하게, 바깥(산)은 성기게: 균일 격자를 비선형으로 펼침
  const SEG = 300;
  const geo = new THREE.PlaneGeometry(2, 2, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const spread = (u) => WORLD_HALF * (0.55 * u + 0.45 * u * u * u);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = spread(pos.getX(i));
    const z = spread(pos.getZ(i));
    pos.setXYZ(i, x, terrainHeight(x, z), z);
    uv.setXY(i, x / 3, z / 3); // 디테일 텍스처 3m 반복
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const rockC = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm.getY(i);
    const n1 = fbm(x / 18, z / 18, 3, 21.3);

    c.copy(PAL.grassA).lerp(PAL.grassB, clamp01(0.5 + n1 * 1.6));
    c.lerp(PAL.dry, clamp01(fbm(x / 60, z / 60, 2, 40.1) * 1.8) * 0.5);

    const rd = riverDistance(x, z);
    const sandT =
      (1 - smoothstep(RIVER.halfWidth + 1, RIVER.halfWidth + 4.5, rd)) *
      (1 - smoothstep(WATER_LEVEL + 1.5, WATER_LEVEL + 3.5, y));
    c.lerp(y < WATER_LEVEL - 0.15 ? PAL.riverbed : PAL.sand, sandT);

    // 산 중턱은 짙은 숲색, 가파르거나 높은 곳은 바위
    const rockT = Math.max(smoothstep(0.8, 0.58, ny), smoothstep(55, 92, y + n1 * 14));
    c.lerp(PAL.forest, smoothstep(7, 26, y) * 0.75);
    rockC.copy(PAL.rock).lerp(PAL.rockDark, clamp01(0.5 + fbm(x / 9, z / 9, 2, 7.7) * 2));
    c.lerp(rockC, rockT);

    c.lerp(PAL.snow, smoothstep(98, 118, y + n1 * 12) * smoothstep(0.6, 0.82, ny));

    const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
    c.lerp(PAL.plaza, (1 - smoothstep(VILLAGE.radius - 9, VILLAGE.radius - 3, dv)) * 0.85);
    const dt = Math.hypot(x - TEMPLE.x, z - TEMPLE.z);
    c.lerp(PAL.plaza, (1 - smoothstep(TEMPLE.radius - 6, TEMPLE.radius, dt)) * 0.55);

    c.lerp(PAL.dirt, (1 - smoothstep(1.3, 2.6, pathDistance(x, z))) * 0.9);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: makeDetailTexture(),
    roughness: 0.95,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Terrain';
  mesh.receiveShadow = true;
  return mesh;
}

/** 이어붙여도 티 안 나는 회색 잡음 텍스처 (가까이서 땅이 밋밋하지 않게) */
function makeDetailTexture(size = 256) {
  const lattice = (n, seed) => {
    const a = new Float32Array(n * n);
    let s = seed;
    for (let i = 0; i < a.length; i++) {
      s = (s * 16807) % 2147483647;
      a[i] = s / 2147483647;
    }
    return a;
  };
  const octaves = [8, 16, 32, 64].map((n, i) => ({ n, g: lattice(n, 1234 + i * 99), amp: 0.5 ** i }));
  const sample = ({ n, g }, u, v) => {
    const x = u * n;
    const y = v * n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (ix, iy) => g[((iy % n) + n) % n * n + (((ix % n) + n) % n)];
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), sx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx), sy);
  };
  const data = new Uint8Array(size * size * 4);
  const total = octaves.reduce((s, o) => s + o.amp, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octaves) v += sample(o, x / size, y / size) * o.amp;
      v /= total;
      const b = Math.round(255 * (0.8 + 0.2 * v));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
