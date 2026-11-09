import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { VILLAGE, TEMPLE, PAVILION, BRIDGE, BRIDGE_X } from './layout.js';

// ---------------------------------------------------------------------------
// 재질 & 도우미
// ---------------------------------------------------------------------------
const stoneTex = makeStoneTexture();
const M = {
  plaster: new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 0.9 }),
  plasterWarm: new THREE.MeshStandardMaterial({ color: '#e9d9bf', roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: '#8a6040', roughness: 0.8 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#4e3826', roughness: 0.8 }),
  roofRed: new THREE.MeshStandardMaterial({ color: '#8e4b3a', roughness: 0.75 }),
  roofSlate: new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.7 }),
  roofGreen: new THREE.MeshStandardMaterial({ color: '#4f6b5a', roughness: 0.75 }),
  pillar: new THREE.MeshStandardMaterial({ color: '#7c2f25', roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: '#2e3d4b', roughness: 0.25, metalness: 0.2 }),
  stone: new THREE.MeshStandardMaterial({ color: '#ffffff', map: stoneTex, roughness: 0.92 }),
  stoneLight: new THREE.MeshStandardMaterial({ color: '#a39d92', roughness: 0.9 }),
  water: new THREE.MeshStandardMaterial({ color: '#203a44', roughness: 0.1 }),
};

function shade(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = shade(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat));
  m.position.set(x, y, z);
  return m;
}

function cyl(rTop, rBottom, h, seg, mat, x = 0, y = 0, z = 0) {
  const m = shade(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat));
  m.position.set(x, y, z);
  return m;
}

/** 돌 텍스처가 면 크기에 맞게 반복되도록 UV를 늘린 상자 */
function stoneBox(w, h, d, x = 0, y = 0, z = 0, tile = 1.6) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x −x +y −y +z −z
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      // 텍스처 한 장 = 가로 2·tile m × 세로 tile m (가로세로 2:1 이미지)
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / (tile * 2), (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  const m = shade(new THREE.Mesh(geo, M.stone));
  m.position.set(x, y, z);
  return m;
}

/** 모임지붕(사각뿔). 밑면이 w × d, 높이 h, 밑면 중심이 (0, y, 0) */
function hipRoof(w, d, h, mat, y) {
  const geo = new THREE.ConeGeometry(Math.SQRT2, 1, 4, 1);
  geo.rotateY(Math.PI / 4); // 밑면 모서리를 축에 맞춤 → −1..1 정사각형
  const m = shade(new THREE.Mesh(geo, mat));
  m.scale.set(w / 2, h, d / 2);
  m.position.y = y + h / 2;
  return m;
}

const deco = (mesh) => {
  mesh.userData.noCollide = true; // 문·창문 같은 장식은 충돌에서 제외
  return mesh;
};

// ---------------------------------------------------------------------------
// 집 (앞면 = 로컬 +Z)
// ---------------------------------------------------------------------------
function makeHouse({ w, d, h, pitch = 0.62, wall = M.plaster, roof = M.roofRed, floors = 1 }) {
  const g = new THREE.Group();
  const baseTop = 0.35;
  g.add(stoneBox(w + 0.5, 2.2, d + 0.5, 0, baseTop - 1.1, 0)); // 기초 (땅속까지 박혀 경사를 가림)
  g.add(box(w, h, d, wall, 0, baseTop + h / 2, 0));

  // 박공(삼각 벽)
  const rise = (d / 2) * pitch;
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const gable = shade(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }), wall));
  gable.rotation.y = Math.PI / 2;
  gable.position.set(-w / 2, baseTop + h, 0);
  g.add(gable);

  // 지붕판 2장
  const overhang = 0.5;
  const thick = 0.18;
  const ang = Math.atan2(rise, d / 2);
  const len = Math.hypot(d / 2, rise) + overhang;
  const ridgeY = baseTop + h + rise;
  for (const side of [-1, 1]) {
    const slab = box(w + overhang * 2, thick, len, roof);
    slab.rotation.x = side * ang;
    slab.position.set(
      0,
      ridgeY - Math.sin(ang) * (len / 2) + Math.cos(ang) * (thick / 2),
      side * (Math.cos(ang) * (len / 2) + Math.sin(ang) * (thick / 2)),
    );
    g.add(slab);
  }
  g.add(box(w + overhang * 2 + 0.1, 0.16, 0.26, M.woodDark, 0, ridgeY + 0.1, 0)); // 용마루

  // 문과 창문 (앞면)
  const front = d / 2 + 0.04;
  g.add(deco(box(1.1, 2.1, 0.1, M.woodDark, 0, baseTop + 1.05, front)));
  const floorH = h / floors;
  for (let f = 0; f < floors; f++) {
    const wy = baseTop + floorH * f + floorH * 0.58;
    const xs = w > 6 ? [-w / 3, w / 3] : [-w / 3.2, w / 3.2];
    for (const wx of xs) if (f > 0 || Math.abs(wx) > 0.9) g.add(deco(box(0.95, 0.9, 0.08, M.glass, wx, wy, front)));
    if (f > 0) g.add(deco(box(0.95, 0.9, 0.08, M.glass, 0, wy, front)));
    for (const sx of [-1, 1]) g.add(deco(box(0.08, 0.9, 0.95, M.glass, sx * (w / 2 + 0.04), wy, 0)));
  }
  return g;
}

function makeTower() {
  const g = new THREE.Group();
  g.add(stoneBox(5.2, 2.2, 5.2, 0, -0.75, 0));
  g.add(stoneBox(4.4, 9.5, 4.4, 0, 0.35 + 4.75, 0));
  g.add(box(5.4, 0.3, 5.4, M.woodDark, 0, 10.0, 0));
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) g.add(cyl(0.12, 0.12, 2.2, 8, M.wood, x, 11.25, z));
  g.add(box(5.6, 0.18, 5.6, M.roofSlate, 0, 12.4, 0));
  g.add(hipRoof(5.6, 5.6, 2.4, M.roofSlate, 12.45));
  g.add(deco(box(1.1, 2.1, 0.1, M.woodDark, 0, 1.4, 2.25)));
  return g;
}

function buildVillage() {
  const g = new THREE.Group();
  g.name = 'Village';
  const cx = VILLAGE.x;
  const cz = VILLAGE.z;
  // 각도(도)는 광장 중심 기준, 서쪽(약 280°)은 다리에서 오는 길이라 비워 둠
  const houses = [
    { a: 0, r: 22, w: 8, d: 6.5, h: 3.4, roof: M.roofRed },
    { a: 38, r: 23, w: 7, d: 6, h: 3.2, roof: M.roofSlate, wall: M.plasterWarm },
    { a: 75, r: 23, w: 9, d: 7, h: 6.4, floors: 2, roof: M.roofGreen },
    { a: 115, r: 22, w: 7.5, d: 6.5, h: 3.4, roof: M.roofRed, wall: M.plasterWarm },
    { a: 188, r: 23, w: 8.5, d: 7, h: 3.6, roof: M.roofSlate },
    { a: 226, r: 22, w: 7, d: 6, h: 3.2, roof: M.roofRed },
    { a: 330, r: 23, w: 8, d: 6.5, h: 6.2, floors: 2, roof: M.roofSlate, wall: M.plasterWarm },
  ];
  for (const spec of houses) {
    const a = THREE.MathUtils.degToRad(spec.a);
    const x = cx + Math.sin(a) * spec.r;
    const z = cz + Math.cos(a) * spec.r;
    const house = makeHouse(spec);
    house.position.set(x, terrainHeight(x, z), z);
    house.rotation.y = Math.atan2(cx - x, cz - z); // 앞면이 광장을 향함
    g.add(house);
  }
  // 망루 (멀리서 보이는 랜드마크)
  {
    const a = THREE.MathUtils.degToRad(152);
    const x = cx + Math.sin(a) * 24;
    const z = cz + Math.cos(a) * 24;
    const tower = makeTower();
    tower.position.set(x, terrainHeight(x, z), z);
    tower.rotation.y = Math.atan2(cx - x, cz - z);
    g.add(tower);
  }
  // 광장 가운데: 큰 나무 + 둥근 돌 벤치
  {
    const y = terrainHeight(cx, cz);
    g.add(cyl(2.4, 2.5, 0.45, 28, M.stoneLight, cx, y + 0.225, cz));
    g.add(cyl(0.45, 0.65, 4.5, 9, M.woodDark, cx, y + 2.6, cz));
    const leaves = new THREE.MeshStandardMaterial({ color: '#4f7a33', roughness: 0.85, flatShading: true });
    for (const [ox, oy, oz, r] of [[0, 6.4, 0, 3.4], [2.2, 5.6, 1.0, 2.4], [-2.0, 5.8, -1.2, 2.5], [0.6, 7.6, -1.4, 2.2]]) {
      const blob = shade(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaves));
      blob.position.set(cx + ox, y + oy, cz + oz);
      g.add(deco(blob));
    }
  }
  // 우물
  {
    const x = cx - 8;
    const z = cz - 10;
    const y = terrainHeight(x, z);
    g.add(cyl(0.95, 1.0, 0.85, 18, M.stoneLight, x, y + 0.425, z));
    g.add(deco(cyl(0.78, 0.78, 0.02, 18, M.water, x, y + 0.86, z)));
    for (const sx of [-1, 1]) g.add(cyl(0.07, 0.07, 2.0, 6, M.wood, x + sx * 0.9, y + 1.4, z));
    g.add(box(2.2, 0.12, 1.2, M.roofRed, x, y + 2.45, z));
  }
  return g;
}

// ---------------------------------------------------------------------------
// 다리 (x 축 방향)
// ---------------------------------------------------------------------------
function makeBridge() {
  const g = new THREE.Group();
  g.name = 'Bridge';
  const L = BRIDGE.length;
  const W = BRIDGE.width;
  g.add(box(L, 0.4, W, M.wood, 0, 0, 0)); // 상판 윗면 = +0.2
  for (const side of [-1, 1]) {
    const z = side * (W / 2 - 0.1);
    const n = 9;
    for (let i = 0; i < n; i++) g.add(box(0.14, 1.0, 0.14, M.woodDark, -L / 2 + 0.3 + (i * (L - 0.6)) / (n - 1), 0.7, z));
    g.add(box(L - 0.4, 0.1, 0.12, M.woodDark, 0, 1.18, z));
    g.add(box(L - 0.4, 0.08, 0.1, M.woodDark, 0, 0.72, z));
  }
  for (const x of [-4.5, 4.5]) g.add(cyl(0.5, 0.6, 3.8, 12, M.stoneLight, x, -2.1, 0));
  return g;
}

// ---------------------------------------------------------------------------
// 정자
// ---------------------------------------------------------------------------
function makePavilion() {
  const g = new THREE.Group();
  g.name = 'Pavilion';
  const floorTop = 0.38; // 자동 턱 오르기 높이(0.42) 이하
  g.add(stoneBox(5.8, 1.6, 5.8, 0, floorTop - 0.12 - 0.8, 0));
  g.add(box(5.4, 0.12, 5.4, M.wood, 0, floorTop - 0.06, 0));
  const P = 2.3;
  for (const [x, z] of [[-P, -P], [P, -P], [-P, P], [P, P]]) g.add(cyl(0.14, 0.16, 2.6, 10, M.pillar, x, floorTop + 1.3, z));
  for (const s of [-1, 1]) {
    g.add(box(4.9, 0.22, 0.22, M.woodDark, 0, floorTop + 2.6, s * P));
    g.add(box(0.22, 0.22, 4.9, M.woodDark, s * P, floorTop + 2.6, 0));
  }
  g.add(box(7.0, 0.16, 7.0, M.roofSlate, 0, floorTop + 2.79, 0));
  g.add(hipRoof(7.0, 7.0, 2.0, M.roofSlate, floorTop + 2.86));
  g.add(cyl(0.12, 0.2, 0.5, 8, M.woodDark, 0, floorTop + 5.0, 0));
  return g;
}

// ---------------------------------------------------------------------------
// 석축 + 계단 + 석탑 + 석등 + 법당   (로컬 원점 = 석축 주변 지면, 계단은 +Z 쪽)
// ---------------------------------------------------------------------------
function makePagoda() {
  const g = new THREE.Group();
  g.name = 'Pagoda';
  const S = M.stoneLight;
  g.add(box(5.2, 0.7, 5.2, S, 0, 0.35, 0));
  g.add(box(4.2, 0.5, 4.2, S, 0, 0.95, 0));
  let y = 1.2;
  let s = 2.6;
  for (let i = 0; i < 5; i++) {
    const bodyH = i === 0 ? 1.5 : 0.75;
    g.add(box(s, bodyH, s, S, 0, y + bodyH / 2, 0));
    y += bodyH;
    g.add(box(s * 1.3, 0.14, s * 1.3, S, 0, y + 0.07, 0));
    y += 0.14;
    g.add(box(s * 1.75, 0.22, s * 1.75, S, 0, y + 0.11, 0));
    y += 0.22;
    s *= 0.84;
  }
  g.add(cyl(0.1, 0.16, 2.2, 10, S, 0, y + 1.1, 0));
  for (const [oy, r] of [[0.5, 0.32], [1.2, 0.26], [1.9, 0.2]]) {
    const ring = shade(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), S));
    ring.position.y = y + oy;
    ring.scale.y = 0.55;
    g.add(ring);
  }
  return g;
}

function makeLantern() {
  const g = new THREE.Group();
  const S = M.stoneLight;
  g.add(box(0.9, 0.3, 0.9, S, 0, 0.15, 0));
  g.add(cyl(0.16, 0.2, 1.1, 8, S, 0, 0.85, 0));
  g.add(box(0.7, 0.12, 0.7, S, 0, 1.46, 0));
  g.add(box(0.5, 0.55, 0.5, S, 0, 1.8, 0));
  g.add(deco(box(0.52, 0.28, 0.3, M.woodDark, 0, 1.82, 0)));
  g.add(hipRoof(0.95, 0.95, 0.45, S, 2.08));
  return g;
}

function makeHall() {
  const g = new THREE.Group();
  g.name = 'Hall';
  const W = 11;
  const D = 6.4;
  const H = 3.6;
  g.add(stoneBox(W + 1.2, 0.6, D + 1.2, 0, 0.3, 0));
  g.add(box(W, H, D, M.plaster, 0, 0.6 + H / 2, 0));
  for (let i = 0; i <= 5; i++) g.add(cyl(0.2, 0.2, H, 12, M.pillar, -W / 2 + (i * W) / 5, 0.6 + H / 2, D / 2 + 0.06));
  for (let i = 0; i < 5; i++) {
    g.add(deco(box(W / 5 - 0.7, H - 1.1, 0.08, M.woodDark, -W / 2 + W / 10 + (i * W) / 5, 0.6 + (H - 1.1) / 2 + 0.1, D / 2 + 0.05)));
  }
  g.add(box(W + 0.8, 0.5, D + 0.8, M.woodDark, 0, 0.6 + H + 0.05, 0));
  g.add(box(W + 3.4, 0.22, D + 3.4, M.roofSlate, 0, 0.6 + H + 0.41, 0));
  g.add(hipRoof(W + 3.4, D + 3.4, 3.4, M.roofSlate, 0.6 + H + 0.52));
  return g;
}

function makeTemple() {
  const g = new THREE.Group();
  g.name = 'Temple';
  const { w, d, h } = TEMPLE.platform;
  const capT = 0.2;
  g.add(stoneBox(w, h - capT + 1.2, d, 0, (h - capT - 1.2) / 2, 0)); // 석축: 땅속 1.2m ~ 갓돌 아래
  // 갓돌: 좌우·뒤로 살짝 내밀고, 계단이 붙는 앞쪽은 맞춤
  g.add(box(w + 0.3, capT, d + 0.15, M.stoneLight, 0, h - capT / 2, -0.075));

  // 계단: 단마다 땅속까지 이어진 돌덩어리 (12단 × 0.2m → 자동 턱 오르기 테스트)
  const N = TEMPLE.steps;
  const rise = TEMPLE.stepRise;
  const run = TEMPLE.stepRun;
  const sw = TEMPLE.stairWidth;
  for (let k = 1; k <= N; k++) {
    const top = k * rise;
    const z = d / 2 + (N - k + 0.5) * run;
    g.add(stoneBox(sw, top + 1.2, run, 0, (top - 1.2) / 2, z));
    // 양옆 소맷돌 (계단보다 0.35m 높게)
    for (const side of [-1, 1]) {
      const sideTop = top + 0.35;
      g.add(box(0.5, sideTop + 1.2, run, M.stoneLight, side * (sw / 2 + 0.25), (sideTop - 1.2) / 2, z));
    }
  }

  const pagoda = makePagoda();
  pagoda.position.set(0, h, 2.0);
  g.add(pagoda);
  for (const sx of [-1, 1]) {
    const lantern = makeLantern();
    lantern.position.set(sx * 4.4, h, d / 2 - 2.2);
    g.add(lantern);
  }
  const hall = makeHall();
  hall.position.set(0, h, -d / 2 + 4.0);
  g.add(hall);
  return g;
}

function makeGate() {
  const g = new THREE.Group();
  g.name = 'Gate';
  for (const sx of [-1, 1]) {
    g.add(cyl(0.26, 0.28, 4.4, 12, M.pillar, sx * 2.3, 2.2, 0));
    g.add(stoneBox(0.9, 0.5, 0.9, sx * 2.3, 0.1, 0));
  }
  g.add(box(6.0, 0.45, 0.55, M.woodDark, 0, 4.1, 0));
  g.add(box(7.6, 0.2, 2.6, M.roofSlate, 0, 4.45, 0));
  g.add(hipRoof(7.6, 2.6, 1.1, M.roofSlate, 4.55));
  return g;
}

// ---------------------------------------------------------------------------
export function buildStructures() {
  const root = new THREE.Group();
  root.name = 'Structures';

  root.add(buildVillage());

  const bridge = makeBridge();
  bridge.position.set(BRIDGE_X, BRIDGE.y, BRIDGE.z);
  root.add(bridge);

  const pavilion = makePavilion();
  pavilion.position.set(PAVILION.x, terrainHeight(PAVILION.x, PAVILION.z), PAVILION.z);
  pavilion.rotation.y = -Math.PI / 2; // 강(서쪽)을 바라봄
  root.add(pavilion);

  const temple = makeTemple();
  temple.position.set(TEMPLE.x, TEMPLE.y, TEMPLE.z);
  root.add(temple);

  const gate = makeGate();
  gate.position.set(TEMPLE.x, terrainHeight(TEMPLE.x, TEMPLE.gateZ), TEMPLE.gateZ);
  root.add(gate);

  return root;
}

/** 캔버스로 그린 돌 블록 텍스처 (석축·기초용) */
function makeStoneTexture() {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5f5a52';
  g.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rowH = 32;
  for (let row = 0; row < H / rowH; row++) {
    let x = row % 2 ? -rnd() * 40 : 0;
    while (x < W) {
      const bw = 44 + rnd() * 44;
      const v = 118 + Math.floor(rnd() * 46);
      g.fillStyle = `rgb(${v + 6}, ${v + 2}, ${v - 6})`;
      const draw = (ox) => g.fillRect(ox + 2, row * rowH + 2, bw - 4, rowH - 4);
      draw(x);
      if (x + bw > W) draw(x - W); // 가로로 이어지게
      if (x < 0) draw(x + W);
      x += bw;
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
