import * as THREE from 'three';

/**
 * C 키: 물리 엔진이 실제로 쓰는 충돌 메시(분홍 면 + 청록 선)와 플레이어 캡슐(노랑)을 보여준다.
 * Marble 월드에서 splat과 collider가 잘 겹치는지, 캐릭터 크기가 맞는지 확인할 때 쓴다.
 */
export class ColliderDebugView {
  constructor(scene, physics, player) {
    this.player = player;
    this.group = new THREE.Group();
    this.group.name = 'ColliderDebug';
    this.group.visible = false;

    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xff3fb4,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x3dffd0,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    for (const entry of physics.statics) {
      if (entry.debug === false) continue; // 경계 벽처럼 화면을 가리기만 하는 충돌체는 생략
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(entry.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(entry.indices, 1));
      geo.computeBoundingSphere();
      const fill = new THREE.Mesh(geo, fillMat);
      const wire = new THREE.Mesh(geo, wireMat);
      fill.renderOrder = wire.renderOrder = 999;
      this.group.add(fill, wire);
    }

    this.capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(player.cfg.radius, player.halfHeight * 2, 4, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, wireframe: true, depthTest: false }),
    );
    this.capsule.renderOrder = 1000;
    this.group.add(this.capsule);
    scene.add(this.group);
  }

  toggle() {
    this.group.visible = !this.group.visible;
    return this.group.visible;
  }

  /** @param {boolean} showCapsule 1인칭에서는 카메라가 캡슐 안에 있으므로 숨김 */
  update(showCapsule = true) {
    if (!this.group.visible) return;
    const f = this.player.feet;
    this.capsule.visible = showCapsule;
    this.capsule.position.set(f.x, f.y + this.player.centerOffset, f.z);
  }
}
