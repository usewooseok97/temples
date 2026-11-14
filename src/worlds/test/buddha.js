import * as THREE from 'three';

/**
 * 도형으로 만든 금동 부처님 좌상 (선정인). 로컬 원점 = 연화좌 바닥 중심, 정면 = +Z.
 * 전체 높이 ≈ height (연화좌 포함). 장식이라 충돌에서는 빠지고(noCollide), 올라앉은 단(dais)이 충돌을 맡는다.
 */
export function makeBuddha({ height = 2.4 } = {}) {
  const g = new THREE.Group();
  g.name = 'Buddha';
  g.userData.noCollide = true;
  const s = height / 2.4; // 2.4m 기준 비율

  const gold = new THREE.MeshStandardMaterial({ color: '#e2b54c', metalness: 0.75, roughness: 0.32 });
  const goldDark = new THREE.MeshStandardMaterial({ color: '#a9792b', metalness: 0.7, roughness: 0.4 });
  const halo = new THREE.MeshStandardMaterial({
    color: '#f3d78a',
    emissive: '#c98a2a',
    emissiveIntensity: 0.35,
    metalness: 0.4,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });

  const mesh = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * s, y * s, z * s);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // 연화좌: 받침 + 꽃잎 두 겹
  mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.28, 24), goldDark, 0, 0.14, 0);
  for (const [n, r, y, len, tilt] of [[16, 0.98, 0.3, 0.42, 0.55], [12, 0.8, 0.4, 0.36, 0.35]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (n === 12 ? Math.PI / 12 : 0);
      const petal = mesh(new THREE.SphereGeometry(0.18, 10, 8), gold, Math.sin(a) * r, y, Math.cos(a) * r);
      petal.scale.set(0.9, 0.45, len / 0.18);
      petal.rotation.y = a;
      petal.rotation.x = -tilt;
    }
  }
  mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.14, 24), gold, 0, 0.48, 0);

  // 가부좌한 다리
  const legs = mesh(new THREE.SphereGeometry(0.6, 16, 12), gold, 0, 0.78, 0.05);
  legs.scale.set(1.35, 0.42, 0.85);
  // 몸통 (어깨가 넓고 허리가 잘록한 타원)
  const torso = mesh(new THREE.SphereGeometry(0.5, 16, 14), gold, 0, 1.38, -0.05);
  torso.scale.set(0.98, 1.05, 0.62);
  // 어깨 → 팔꿈치 → 손 (선정인: 두 손을 배 앞에 포갬)
  for (const sx of [-1, 1]) {
    const upper = mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), gold, sx * 0.5, 1.4, -0.02);
    upper.rotation.z = sx * -0.22;
    upper.rotation.x = -0.12;
    const fore = mesh(new THREE.CapsuleGeometry(0.1, 0.4, 4, 10), gold, sx * 0.36, 1.02, 0.25);
    fore.rotation.z = sx * 1.15;
    fore.rotation.x = -0.35;
  }
  const hands = mesh(new THREE.SphereGeometry(0.17, 12, 8), gold, 0, 0.98, 0.36);
  hands.scale.set(1.5, 0.55, 1.0);
  // 목·머리·육계·귀
  mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 12), gold, 0, 1.9, -0.02);
  mesh(new THREE.SphereGeometry(0.3, 18, 14), gold, 0, 2.15, -0.02);
  mesh(new THREE.SphereGeometry(0.13, 12, 8), goldDark, 0, 2.42, -0.04);
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(0.07, 8, 6), gold, sx * 0.3, 2.1, -0.02);
    ear.scale.set(0.5, 1.6, 0.8);
  }
  // 광배 (머리 뒤 둥근 후광) + 신광 (몸 뒤 큰 타원)
  const body = mesh(new THREE.CircleGeometry(0.95, 36), halo, 0, 1.45, -0.42);
  body.scale.set(1, 1.35, 1);
  body.castShadow = false;
  const head = mesh(new THREE.RingGeometry(0.34, 0.56, 36), halo, 0, 2.15, -0.38);
  head.castShadow = false;

  return g;
}
