import * as THREE from 'three';
import { CAMERA } from '../config.js';
import { DEG, clamp, dampFactor } from '../core/math.js';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _pivot = new THREE.Vector3();
const _back = new THREE.Vector3();
const _right = new THREE.Vector3();

/**
 * 1인칭 / 3인칭 카메라.
 * yaw/pitch는 마우스가 바꾸고, 플레이어 이동 방향도 이 yaw를 기준으로 한다.
 */
export class CameraRig {
  constructor(camera, physics, { mode = 'first', eyeHeight = 1.62 } = {}) {
    this.camera = camera;
    this.physics = physics;
    this.mode = mode;
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = eyeHeight;
    this.tpDistance = CAMERA.thirdPerson.distance; // 원하는 거리 (휠)
    this.tpCurrent = this.tpDistance; // 벽 충돌을 반영한 실제 거리
    this.smoothY = null; // 계단 오를 때 카메라 높이를 부드럽게
    this.bobPhase = 0;
    this.bobAmount = 0;
  }

  look(dx, dy) {
    const s = CAMERA.mouseSensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this._clampPitch();
  }

  _clampPitch() {
    if (this.mode === 'first') {
      this.pitch = clamp(this.pitch, -89 * DEG, 89 * DEG);
    } else {
      const tp = CAMERA.thirdPerson;
      this.pitch = clamp(this.pitch, tp.minPitchDeg * DEG, tp.maxPitchDeg * DEG);
    }
  }

  zoom(deltaY) {
    if (this.mode !== 'third' || !deltaY) return;
    const tp = CAMERA.thirdPerson;
    this.tpDistance = clamp(this.tpDistance * Math.exp(deltaY * 0.001), tp.minDistance, tp.maxDistance);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'third') this.tpCurrent = Math.min(this.tpCurrent, 0.6); // 머리 위치에서 뒤로 빠지며 시작
    this._clampPitch();
  }

  toggle() {
    this.setMode(this.mode === 'first' ? 'third' : 'first');
    return this.mode;
  }

  /** @param {import('./player.js').Player} player */
  update(dt, player) {
    const feet = player.feet;
    const jump = this.smoothY === null || Math.abs(feet.y - this.smoothY) > 1.5;
    if (jump || !player.grounded || player.flying) this.smoothY = feet.y;
    else this.smoothY += (feet.y - this.smoothY) * dampFactor(16, dt);

    _euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(_euler);

    if (this.mode === 'first') {
      // 걸음 흔들림: 속도에 비례, 발 디딜 때 살짝 내려감 + 좌우로 미세하게
      const moving = player.grounded && !player.flying ? Math.min(player.speed / player.cfg.walkSpeed, 1.5) : 0;
      this.bobAmount += (moving - this.bobAmount) * dampFactor(8, dt);
      this.bobPhase += dt * player.speed * 2.1;
      const amp = CAMERA.headBob * this.bobAmount;
      const bobY = (Math.abs(Math.sin(this.bobPhase)) - 0.6) * amp;
      const bobX = Math.sin(this.bobPhase) * amp * 0.45;
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.camera.position
        .set(feet.x, this.smoothY + this.eyeHeight + bobY, feet.z)
        .addScaledVector(_right, bobX);
      return;
    }

    // 3인칭: 피벗(머리 근처) 뒤쪽으로 빠지되, 벽/지형에 막히면 앞으로 당김
    const tp = CAMERA.thirdPerson;
    _pivot.set(feet.x, this.smoothY + tp.pivotHeight, feet.z);
    const cp = Math.cos(this.pitch);
    _back.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hit = this.physics.sphereCast(_pivot, _back, this.tpDistance, tp.collisionRadius, player.collider);
    const allowed = hit === null ? this.tpDistance : Math.max(0.25, hit - 0.05);
    if (allowed < this.tpCurrent) this.tpCurrent = allowed;
    else this.tpCurrent += (allowed - this.tpCurrent) * dampFactor(5, dt);
    this.camera.position.copy(_pivot).addScaledVector(_back, this.tpCurrent);
  }
}
