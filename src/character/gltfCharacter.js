import * as THREE from 'three';
import { assertAssetExists, loadGltf } from '../core/assets.js';
import { DEG, clamp } from '../core/math.js';

// clips 를 지정하지 않으면 애니메이션 이름에서 이 단어들을 찾아 자동 연결한다
const STATE_KEYWORDS = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['walk'],
  run: ['run', 'jog', 'sprint'],
  jump: ['jump'],
  fall: ['fall', 'falling', 'air'],
};
// 해당 동작이 없으면 대신 쓸 동작
const FALLBACK = { run: 'walk', walk: 'idle', fall: 'jump', jump: 'idle', idle: null };

/**
 * GLB 캐릭터 (Mixamo, Ready Player Me, Blender 등에서 내보낸 애니메이션 포함 GLB).
 * characters.json 예:
 * {
 *   "id": "hero", "type": "gltf", "url": "characters/hero/hero.glb",
 *   "height": 1.75,      // 이 키로 자동 스케일 (scale 을 주면 그 값을 그대로 사용)
 *   "yaw": 0,            // 모델이 +Z 를 보고 있지 않으면 보정 (도)
 *   "clips": { "idle": "Idle", "walk": "Walking", "run": "Running", "jump": "Jump", "fall": "Falling" },
 *   "walkAnimSpeed": 1.4 // 걷기 클립이 원래 표현하는 이동 속도(m/s). 발 미끄러짐 줄이기용 (선택)
 * }
 */
export class GltfCharacter {
  static async load(def, opts) {
    await assertAssetExists(def.url);
    const gltf = await loadGltf(def.url);
    return new GltfCharacter(gltf, def, opts);
  }

  constructor(gltf, def, { height = 1.75 } = {}) {
    this.def = def;
    this.object3d = new THREE.Group();
    this.object3d.name = `Character:${def.id ?? def.url}`;

    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false; // 애니메이션 중 바운딩박스 밖으로 나가 사라지는 문제 방지
    });

    // 1) 크기: 원하는 키에 맞추거나 지정한 scale 사용
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const scale = def.scale ?? (size.y > 1e-6 ? (def.height ?? height) / size.y : 1);
    model.scale.multiplyScalar(scale);

    // 2) 발바닥을 원점에, 가운데를 정렬
    model.updateMatrixWorld(true);
    box.setFromObject(model, true);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    // 3) 앞 방향 보정
    const yawPivot = new THREE.Group();
    yawPivot.rotation.y = (def.yaw ?? 0) * DEG;
    yawPivot.add(model);
    this.object3d.add(yawPivot);

    // 4) 애니메이션 연결
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    const clips = gltf.animations ?? [];
    for (const state of Object.keys(STATE_KEYWORDS)) {
      const wanted = def.clips?.[state];
      const clip = wanted
        ? clips.find((c) => c.name === wanted)
        : clips.find((c) => STATE_KEYWORDS[state].some((k) => c.name.toLowerCase().includes(k)));
      if (wanted && !clip) console.warn(`[character] "${wanted}" 클립이 없습니다. 있는 클립:`, clips.map((c) => c.name));
      if (!clip) continue;
      if (def.stripRootMotion !== false) stripRootMotion(clip);
      const action = this.mixer.clipAction(clip);
      if (state === 'jump') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[state] = action;
    }
    if (clips.length === 0) console.info('[character] 애니메이션이 없는 GLB 입니다. 정지 자세로 표시합니다.');

    this.current = null;
    this.currentState = null;
    this._play('idle', 0);
  }

  _resolve(state) {
    let s = state;
    while (s && !this.actions[s]) s = FALLBACK[s];
    return s;
  }

  _play(state, fade = 0.2) {
    const s = this._resolve(state);
    if (s === this.currentState) return;
    if (!s) {
      // 대신 쓸 클립도 없으면(예: idle 없음) 기본 자세로 돌아감
      this.current?.fadeOut(fade);
      this.current = null;
      this.currentState = null;
      return;
    }
    const next = this.actions[s];
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && fade > 0) next.crossFadeFrom(this.current, fade, false);
    else if (this.current) this.current.stop();
    else if (fade > 0) next.fadeIn(fade);
    this.current = next;
    this.currentState = s;
  }

  update(dt, st) {
    let state;
    if (!st.grounded && st.airTime > 0.15) state = st.verticalSpeed > 0 ? 'jump' : 'fall';
    else if (st.speed < 0.35) state = 'idle';
    else state = st.running ? 'run' : 'walk';
    this._play(state);

    // 걷기/달리기 재생 속도를 실제 이동 속도에 맞춰 발 미끄러짐을 줄임
    if (this.current) {
      if (this.currentState === 'walk' || this.currentState === 'run') {
        const ref =
          this.currentState === 'run'
            ? (this.def.runAnimSpeed ?? st.runSpeed)
            : (this.def.walkAnimSpeed ?? st.walkSpeed);
        this.current.timeScale = clamp(st.speed / ref, 0.5, 1.8);
      } else {
        this.current.timeScale = 1;
      }
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.object3d.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      mats.forEach((m) => m.dispose());
    });
  }
}

/** 걷기 클립에 들어 있는 앞으로 나아가는 이동(root motion)을 제거해 제자리 걷기로 만든다 */
function stripRootMotion(clip) {
  for (const track of clip.tracks) {
    if (!track.name.endsWith('.position')) continue;
    if (!/(hips|root|pelvis)/i.test(track.name)) continue;
    const v = track.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
}
