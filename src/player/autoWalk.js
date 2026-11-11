import * as THREE from 'three';
import { AUTOWALK, PLAYER } from '../config.js';
import { DEG, clamp } from '../core/math.js';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * 탭/클릭한 곳으로 자동으로 걸어가기.
 *
 *   goToScreenPoint(ndcX, ndcY)  화면의 한 점 → 카메라에서 레이캐스트 → 바닥 지점을 목적지로 (마커 표시)
 *   update(dt)                   매 프레임 Input.autoMove 에 월드 기준 방향을 넣는다 (Player 가 읽음)
 *   cancel()                     그만 걷기
 *
 * 수동 이동 입력(키보드·조이스틱)이 들어오거나, 입력이 꺼지거나(메뉴), 비행을 켜면 스스로 취소된다.
 * 길찾기는 하지 않고 직진한다. 벽에 막혀 stuckTime 동안 가까워지지 않으면 포기한다.
 */
export class AutoWalk {
  /**
   * @param {{ scene: THREE.Scene, physics: import('../physics/physics.js').Physics,
   *           player: import('./player.js').Player, camera: THREE.Camera, input: import('./input.js').Input }} ctx
   */
  constructor({ scene, physics, player, camera, input }) {
    this.physics = physics;
    this.player = player;
    this.camera = camera;
    this.input = input;
    /** @type {THREE.Vector3 | null} 목적지 (발 위치) */
    this.target = null;
    this.headingYaw = 0; // 목적지 방향 (카메라 yaw 규약: forward = (−sin, 0, −cos))
    this.distance = 0; // 목적지까지 남은 수평 거리
    this.bestDist = Infinity;
    this.noProgress = 0;
    /** @type {((reason: 'arrived' | 'blocked' | 'cancel') => void) | null} */
    this.onStop = null;

    this.marker = makeMarker();
    this.markerAge = 0;
    this.markerFade = 0; // 도착·취소 후 사라지는 남은 시간
    scene.add(this.marker);
  }

  get active() {
    return this.target !== null;
  }

  /**
   * 화면 좌표(NDC, −1~1) 방향으로 레이캐스트해 바닥을 찾으면 그곳을 목적지로 잡는다.
   * @returns {boolean} 목적지를 잡았는지
   */
  goToScreenPoint(ndcX, ndcY) {
    const cam = this.camera;
    cam.updateMatrixWorld();
    _origin.setFromMatrixPosition(cam.matrixWorld);
    _dir.set(ndcX, ndcY, 0.5).unproject(cam).sub(_origin).normalize();

    const hit = this.physics.raycastHit(_origin, _dir, AUTOWALK.maxTapDistance, this.player.collider);
    if (!hit || hit.distance < 0.3) return false;
    const point = new THREE.Vector3().copy(_origin).addScaledVector(_dir, hit.distance);
    _normal.set(hit.normal.x, hit.normal.y, hit.normal.z);

    // 벽·나무줄기·가파른 면을 탭했으면 그 앞(법선 쪽)의 바닥으로
    if (_normal.y < Math.cos(PLAYER.maxSlopeDeg * DEG)) {
      const hx = _normal.x;
      const hz = _normal.z;
      const hl = Math.hypot(hx, hz);
      if (hl > 1e-3) {
        point.x += (hx / hl) * (PLAYER.radius + 0.25);
        point.z += (hz / hl) * (PLAYER.radius + 0.25);
      }
      const y = this.physics.findGround(point.x, point.z, point.y + 1.0, 10, this.player.collider);
      if (y === null) return false;
      point.y = y;
      _normal.set(0, 1, 0);
    }

    this.target = point;
    this.bestDist = Infinity;
    this.noProgress = 0;
    this._updateHeading();
    this._showMarker(point, _normal);
    return true;
  }

  cancel(reason = 'cancel') {
    if (!this.target) return;
    this.target = null;
    this.distance = 0;
    this.input.clearAutoMove();
    this.markerFade = 0.35;
    this.onStop?.(reason);
  }

  update(dt) {
    this._animateMarker(dt);
    if (!this.target) return;

    const { input, player } = this;
    if (!input.enabled || input.hasManualMove || player.flying) {
      this.cancel('cancel');
      return;
    }

    const dist = this._updateHeading();
    if (dist < AUTOWALK.arriveRadius) {
      this.cancel('arrived');
      return;
    }
    // 가까워지지 않으면(벽, 절벽, 손 닿지 않는 지붕) 포기
    if (dist < this.bestDist - 0.03) {
      this.bestDist = dist;
      this.noProgress = 0;
    } else {
      this.noProgress += dt;
      if (this.noProgress > AUTOWALK.stuckTime) {
        this.cancel('blocked');
        return;
      }
    }

    const amount = clamp(dist / AUTOWALK.slowRadius, 0.3, 1); // 목적지 근처에서 감속
    const f = player.feet;
    input.autoMove.x = ((this.target.x - f.x) / dist) * amount;
    input.autoMove.z = ((this.target.z - f.z) / dist) * amount;
    input.autoMove.run = AUTOWALK.runBeyond > 0 && dist > AUTOWALK.runBeyond;
  }

  /** 목적지까지 수평 거리와 방향(headingYaw) 갱신 */
  _updateHeading() {
    const f = this.player.feet;
    const dx = this.target.x - f.x;
    const dz = this.target.z - f.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-4) this.headingYaw = Math.atan2(-dx, -dz);
    this.distance = dist;
    return dist;
  }

  _showMarker(point, normal) {
    const m = this.marker;
    m.position.copy(point).addScaledVector(normal, 0.04);
    m.quaternion.setFromUnitVectors(_up, normal);
    m.visible = true;
    this.markerAge = 0;
    this.markerFade = 0;
    this._setMarkerOpacity(1);
  }

  _animateMarker(dt) {
    const m = this.marker;
    if (!m.visible) return;
    this.markerAge += dt;
    if (this.target) {
      // 찍힐 때 살짝 커졌다가 줄어들고, 그 뒤로는 은은하게 숨 쉬듯
      const pop = Math.max(0, 1 - this.markerAge / 0.25);
      const s = 1 + 0.8 * pop * pop + 0.06 * Math.sin(this.markerAge * 4);
      m.scale.setScalar(s);
      return;
    }
    this.markerFade -= dt;
    if (this.markerFade <= 0) {
      m.visible = false;
      return;
    }
    const k = this.markerFade / 0.35;
    this._setMarkerOpacity(k);
    m.scale.setScalar(1 + (1 - k) * 0.4);
  }

  _setMarkerOpacity(k) {
    for (const child of this.marker.children) child.material.opacity = child.userData.opacity * k;
  }

  dispose() {
    this.marker.parent?.remove(this.marker);
    for (const child of this.marker.children) {
      child.geometry.dispose();
      child.material.dispose();
    }
  }
}

/** 목적지 표시: 바닥에 눕힌 링 + 가운데 점 */
function makeMarker() {
  const g = new THREE.Group();
  g.name = 'AutoWalkMarker';
  g.visible = false;
  g.userData.noCollide = true;
  const makeMat = (opacity) =>
    new THREE.MeshBasicMaterial({
      color: AUTOWALK.markerColor,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 40).rotateX(-Math.PI / 2), makeMat(0.9));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24).rotateX(-Math.PI / 2), makeMat(0.95));
  for (const mesh of [ring, dot]) {
    mesh.userData.opacity = mesh.material.opacity;
    mesh.renderOrder = 998;
    mesh.castShadow = mesh.receiveShadow = false;
  }
  g.add(ring, dot);
  return g;
}
