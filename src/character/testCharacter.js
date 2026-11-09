import * as THREE from 'three';
import { clamp, dampFactor } from '../core/math.js';

/**
 * 도형으로 만든 테스트용 마네킹 + 절차적 걷기/달리기/점프 모션.
 * 나중에 GLB 캐릭터로 바꾸면 이 파일은 쓰이지 않는다 (characters.json 참고).
 * 비율은 키 1.75m 기준으로 잡고, height 에 맞춰 전체를 스케일한다.
 */
export class TestCharacter {
  constructor({ height = 1.75, color = '#e07a3f' } = {}) {
    this.object3d = new THREE.Group();
    this.object3d.name = 'TestCharacter';

    const rig = new THREE.Group();
    rig.scale.setScalar(height / 1.75);
    this.object3d.add(rig);

    const m = {
      body: new THREE.MeshStandardMaterial({ color: color ?? '#e07a3f', roughness: 0.55, metalness: 0.05 }),
      dark: new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.7 }),
      visor: new THREE.MeshStandardMaterial({
        color: '#9fe3ff',
        emissive: '#2aa9d6',
        emissiveIntensity: 0.7,
        roughness: 0.25,
      }),
    };
    this._materials = Object.values(m);

    const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geo, mat);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      return o;
    };
    const capsule = (r, len, mat, y) => mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat, 0, y, 0);

    // 골반 (상체·다리의 기준점)
    this.hips = new THREE.Group();
    this.hips.position.y = 0.93;
    rig.add(this.hips);
    const pelvis = mesh(new THREE.SphereGeometry(0.16, 16, 12), m.dark);
    pelvis.scale.set(1.15, 0.7, 0.85);
    this.hips.add(pelvis);

    // 상체
    this.spine = new THREE.Group();
    this.spine.position.y = 0.05;
    this.hips.add(this.spine);
    const torso = capsule(0.17, 0.3, m.body, 0.27);
    torso.scale.set(1.15, 1, 0.78);
    this.spine.add(torso);

    // 머리 + 바이저(앞 방향 표시)
    this.head = new THREE.Group();
    this.head.position.y = 0.58;
    this.spine.add(this.head);
    this.head.add(mesh(new THREE.SphereGeometry(0.125, 20, 16), m.body, 0, 0.07, 0));
    this.head.add(mesh(new THREE.BoxGeometry(0.17, 0.05, 0.06), m.visor, 0, 0.09, 0.1));

    // 팔
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.235 * side, 0.47, 0);
      this.spine.add(shoulder);
      shoulder.add(capsule(0.055, 0.2, m.body, -0.14));
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      elbow.add(capsule(0.05, 0.18, m.dark, -0.13));
      elbow.add(mesh(new THREE.SphereGeometry(0.055, 12, 10), m.body, 0, -0.29, 0));
      return { shoulder, elbow, side };
    });

    // 다리
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side, -0.03, 0);
      this.hips.add(hip);
      hip.add(capsule(0.075, 0.3, m.dark, -0.22));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      knee.add(capsule(0.065, 0.28, m.body, -0.2));
      knee.add(mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), m.dark, 0, -0.425, 0.05));
      return { hip, knee, side };
    });

    this.time = 0;
    this.phase = 0;
    // 현재 자세와 목표 자세 (목표로 부드럽게 보간)
    this.pose = { legL: 0, legR: 0, kneeL: 0, kneeR: 0, armL: 0, armR: 0, elbow: 0.25, spread: 0.06, lean: 0, bob: 0 };
    this.target = { ...this.pose };
  }

  update(dt, st) {
    this.time += dt;
    const speed = st.speed;
    const walkK = clamp(speed / st.walkSpeed, 0, 1);
    const runK = clamp((speed - st.walkSpeed) / Math.max(0.01, st.runSpeed - st.walkSpeed), 0, 1);
    const airborne = !st.grounded && st.airTime > 0.12;
    const T = this.target;

    if (airborne) {
      T.legL = 0.55;
      T.legR = -0.25;
      T.kneeL = 0.9;
      T.kneeR = 0.35;
      T.armL = 0.5;
      T.armR = 0.5;
      T.elbow = 0.4;
      T.spread = 0.55;
      T.lean = 0.05;
      T.bob = 0;
    } else {
      const stride = THREE.MathUtils.lerp(1.4, 2.3, runK); // 한 주기(두 걸음)당 이동 거리
      this.phase += (speed / stride) * Math.PI * 2 * dt;
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      const amp = THREE.MathUtils.lerp(0.5, 0.95, runK) * walkK;
      T.legL = s * amp;
      T.legR = -s * amp;
      T.kneeL = Math.max(0, c) * amp * 1.4 + 0.04;
      T.kneeR = Math.max(0, -c) * amp * 1.4 + 0.04;
      T.armL = -s * amp * 0.85;
      T.armR = s * amp * 0.85;
      T.elbow = 0.22 + runK * 1.0;
      T.spread = 0.06 + Math.sin(this.time * 2.2) * 0.015 * (1 - walkK);
      T.lean = 0.05 * walkK + 0.14 * runK;
      T.bob = (1 - Math.abs(s)) * 0.045 * walkK - 0.02 * walkK;
    }

    const k = dampFactor(airborne ? 10 : 16, dt);
    for (const key in T) this.pose[key] += (T[key] - this.pose[key]) * k;
    const P = this.pose;

    // 회전 부호: 다리 그룹의 rotation.x 가 음수면 발이 앞(+Z)으로 나간다
    const [legL, legR] = this.legs;
    legL.hip.rotation.x = -P.legL;
    legR.hip.rotation.x = -P.legR;
    legL.knee.rotation.x = P.kneeL;
    legR.knee.rotation.x = P.kneeR;
    const [armL, armR] = this.arms;
    armL.shoulder.rotation.x = -P.armL;
    armR.shoulder.rotation.x = -P.armR;
    armL.elbow.rotation.x = -P.elbow;
    armR.elbow.rotation.x = -P.elbow;
    armL.shoulder.rotation.z = -P.spread;
    armR.shoulder.rotation.z = P.spread;
    this.spine.rotation.x = P.lean;
    this.hips.position.y = 0.93 + P.bob;
  }

  dispose() {
    this.object3d.traverse((o) => o.geometry?.dispose());
    this._materials.forEach((m) => m.dispose());
  }
}
