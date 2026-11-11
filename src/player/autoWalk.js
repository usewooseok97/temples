import * as THREE from 'three';
import { AUTOWALK, PLAYER } from '../config.js';
import { DEG, clamp } from '../core/math.js';
import { NavGrid } from './navGrid.js';

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
 * 경로는 NavGrid(격자 A*)로 찾아 물·벽을 피해 다리와 문으로 돌아간다. 목적지에 닿을 수 없으면 가장 가까운 곳까지.
 * 길을 못 찾으면 직진하고, 벽에 막혀 stuckTime 동안 가까워지지 않으면 포기한다.
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
    /** @type {THREE.Vector3 | null} 지금 향하는 점 (경로의 현재 웨이포인트) */
    this.target = null;
    /** @type {THREE.Vector3[]} 남은 웨이포인트 (target 포함, 마지막이 최종 목적지) */
    this.path = [];
    this.nav = new NavGrid(physics, { excludeCollider: player.collider, waterLevel: player.waterLevel ?? null });
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

    return this.goTo(point, _normal);
  }

  /**
   * 월드 좌표(발 위치)로 걸어가기. 경로를 찾아 웨이포인트로 나누고 마커를 실제 도착 지점에 놓는다.
   * @param {THREE.Vector3} point
   * @param {THREE.Vector3} [normal] 마커를 눕힐 바닥 법선
   */
  goTo(point, normal = _up) {
    this.nav.waterLevel = this.player.waterLevel ?? null;
    const route = this.nav.findPath(this.player.feet, point);
    this.path = route ? route.points.slice(1) : [point.clone()]; // 첫 점은 현재 위치
    const dest = this.path[this.path.length - 1];
    this.target = this.path[0];
    this.bestDist = Infinity;
    this.noProgress = 0;
    this._updateHeading();
    this._showMarker(dest, route && !route.reachedGoal ? _up : normal); // 닿을 수 없는 곳이면 실제로 가는 끝점에
    return true;
  }

  /** 최종 목적지까지 남은 경로 길이 (달리기·감속 판단용) */
  get remaining() {
    if (!this.target) return 0;
    let total = this.distance;
    for (let i = 1; i < this.path.length; i++) total += this.path[i].distanceTo(this.path[i - 1]);
    return total;
  }

  cancel(reason = 'cancel') {
    if (!this.target) return;
    this.target = null;
    this.path = [];
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

    let dist = this._updateHeading();
    const last = this.path.length <= 1;
    if (dist < (last ? AUTOWALK.arriveRadius : AUTOWALK.waypointRadius)) {
      if (last) {
        this.cancel('arrived');
        return;
      }
      this.path.shift();
      this.target = this.path[0];
      this.bestDist = Infinity;
      this.noProgress = 0;
      dist = this._updateHeading();
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

    const remaining = this.remaining;
    const amount = clamp(remaining / AUTOWALK.slowRadius, 0.3, 1); // 최종 목적지 근처에서 감속
    const f = player.feet;
    input.autoMove.x = ((this.target.x - f.x) / dist) * amount;
    input.autoMove.z = ((this.target.z - f.z) / dist) * amount;
    input.autoMove.run = AUTOWALK.runBeyond > 0 && remaining > AUTOWALK.runBeyond;
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
