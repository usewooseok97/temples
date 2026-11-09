import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { DEG, dampFactor } from '../core/math.js';

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();

/**
 * 플레이어의 "몸" — Rapier 키네마틱 캡슐 + 캐릭터 컨트롤러.
 * 화면에 보이는 캐릭터(아바타)와 카메라는 이 위치(feet)를 따라갈 뿐이다.
 */
export class Player {
  constructor(physics, overrides = {}) {
    const R = physics.RAPIER;
    const cfg = (this.cfg = { ...PLAYER, ...overrides });
    this.physics = physics;
    this.halfHeight = Math.max(0.05, cfg.height / 2 - cfg.radius); // 캡슐 원통 부분 절반
    this.centerOffset = this.halfHeight + cfg.radius; // 발바닥 → 캡슐 중심

    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0));
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(this.halfHeight, cfg.radius).setFriction(0),
      this.body,
    );

    const cc = (this.controller = physics.world.createCharacterController(0.02));
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.setSlideEnabled(true);
    cc.setMaxSlopeClimbAngle(cfg.maxSlopeDeg * DEG);
    cc.setMinSlopeSlideAngle(cfg.maxSlopeDeg * DEG); // 오를 수 있는 경사에서는 미끄러지지 않음
    cc.enableAutostep(cfg.stepHeight, 0.12, false);
    cc.enableSnapToGround(cfg.snapToGround);

    this.velocity = new THREE.Vector3();
    this.feet = new THREE.Vector3(); // 발바닥 위치 (월드 좌표)
    this.grounded = false;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpLock = 0;
    this.speed = 0; // 실제 수평 속도 (애니메이션용, 부드럽게 필터링)
    this.running = false;
    this.flying = false;
    this.inWater = false;
    this.waterLevel = null; // 월드가 수면 높이를 주면 물속 감속
  }

  /** 발바닥 위치로 순간이동 */
  teleport(feetPos) {
    const c = { x: feetPos.x, y: feetPos.y + this.centerOffset, z: feetPos.z };
    this.body.setTranslation(c, true);
    this.body.setNextKinematicTranslation(c);
    this.velocity.set(0, 0, 0);
    this.feet.copy(feetPos);
    this.grounded = false;
    this.airTime = 0;
    this.speed = 0;
  }

  /**
   * @param {number} dt
   * @param {import('./input.js').Input} input
   * @param {number} yaw   카메라 좌우 각 (라디안)
   * @param {number} pitch 카메라 상하 각 (비행 모드에서 사용)
   */
  update(dt, input, yaw, pitch) {
    if (this.flying) {
      this._fly(dt, input, yaw, pitch);
      return;
    }
    const cfg = this.cfg;

    // 입력 → 카메라 기준 수평 방향.  forward = (−sin, 0, −cos), right = (cos, 0, −sin)
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const dirX = mx * cos - my * sin;
    const dirZ = -mx * sin - my * cos;

    this.running = input.running && len > 0.1;
    let speed = this.running ? cfg.runSpeed : cfg.walkSpeed;
    if (this.inWater) speed *= cfg.waterSpeedFactor;

    const k = dampFactor(this.grounded ? cfg.groundAccel : cfg.airAccel, dt);
    this.velocity.x += (dirX * speed - this.velocity.x) * k;
    this.velocity.z += (dirZ * speed - this.velocity.z) * k;

    // 점프 & 중력 (점프 직후 잠깐은 바닥 판정이 남아 있어도 다시 점프하지 않게)
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    this.coyote = this.grounded && this.jumpLock === 0 ? cfg.coyoteTime : this.coyote - dt;
    if (input.pressed('Space') && this.coyote > 0) {
      this.velocity.y = cfg.jumpSpeed * (this.inWater ? 0.6 : 1);
      this.coyote = 0;
      this.jumpLock = 0.2;
    }
    this.velocity.y = Math.max(this.velocity.y - cfg.gravity * dt, -cfg.maxFallSpeed);

    // 충돌을 고려한 실제 이동량 계산
    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt };
    this.controller.computeColliderMovement(this.collider, desired);
    const mv = this.controller.computedMovement();
    const p = this.body.translation();
    this.body.setNextKinematicTranslation({ x: p.x + mv.x, y: p.y + mv.y, z: p.z + mv.z });

    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (this.velocity.y > 0 && mv.y < desired.y * 0.5) this.velocity.y = 0; // 천장에 머리 박음
    this.airTime = this.grounded ? 0 : this.airTime + dt;

    if (dt > 0) {
      const actual = Math.hypot(mv.x, mv.z) / dt;
      this.speed += (actual - this.speed) * dampFactor(12, dt);
    }
  }

  _fly(dt, input, yaw, pitch) {
    const speed = this.cfg.flySpeed * (input.running ? 3 : 1);
    const cp = Math.cos(pitch);
    _fwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _move.copy(_fwd).multiplyScalar(input.moveY).addScaledVector(_right, input.moveX);
    if (input.isDown('KeyE') || input.isDown('Space')) _move.y += 1;
    if (input.isDown('KeyQ')) _move.y -= 1;
    if (_move.lengthSq() > 1) _move.normalize();
    const p = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: p.x + _move.x * speed * dt,
      y: p.y + _move.y * speed * dt,
      z: p.z + _move.z * speed * dt,
    });
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.airTime = 0;
    this.speed = 0;
  }

  /** physics.step() 다음에 호출: 시뮬레이션 결과를 feet에 반영 */
  syncFromPhysics() {
    const p = this.body.translation();
    this.feet.set(p.x, p.y - this.centerOffset, p.z);
    this.inWater = this.waterLevel !== null && !this.flying && this.feet.y < this.waterLevel - 0.3;
  }
}
