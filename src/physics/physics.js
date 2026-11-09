import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inst = new THREE.Matrix4();
const IDENTITY_ROT = { x: 0, y: 0, z: 0, w: 1 };

export async function createPhysics() {
  await RAPIER.init();
  return new Physics();
}

/**
 * Rapier 월드 래퍼.
 * 월드의 충돌은 전부 "메시 → 고정 trimesh" 한 가지 경로로 만든다.
 * (테스트 월드든 Marble의 collider.glb든 똑같이 처리)
 */
export class Physics {
  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    /** @type {{name:string, body:any, collider:any, vertices:Float32Array, indices:Uint32Array}[]} */
    this.statics = [];
  }

  /**
   * root 아래의 모든 Mesh / InstancedMesh를 월드 좌표 삼각형으로 합쳐 고정 충돌체로 등록.
   * userData.noCollide = true 인 오브젝트(와 그 자식)는 건너뛴다.
   */
  addStaticMeshes(root, name = 'static', { debug = true } = {}) {
    const { vertices, indices } = collectTriangles(root);
    if (indices.length < 3) return null;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const collider = this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices), body);
    const entry = { name, body, collider, vertices, indices, debug };
    this.statics.push(entry);
    this.refresh();
    return entry;
  }

  /** 충돌체 추가 후 레이캐스트 같은 질의가 바로 동작하도록 내부 구조를 갱신 */
  refresh() {
    this.world.step();
  }

  /** 레이캐스트: 맞으면 거리, 아니면 null */
  raycast(origin, dir, maxDist, excludeCollider) {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, undefined, excludeCollider);
    return hit ? hit.timeOfImpact : null;
  }

  /** 구를 쓸어 보내 처음 닿는 거리 (3인칭 카메라 충돌용) */
  sphereCast(origin, dir, maxDist, radius, excludeCollider) {
    const hit = this.world.castShape(
      origin,
      IDENTITY_ROT,
      dir,
      new RAPIER.Ball(radius),
      0,
      maxDist,
      true,
      undefined,
      undefined,
      excludeCollider,
    );
    if (!hit) return null;
    return hit.time_of_impact ?? hit.timeOfImpact ?? null;
  }

  /** (x, fromY, z)에서 아래로 쏴서 바닥 높이를 찾는다 */
  findGround(x, z, fromY = 500, maxDist = 1000, excludeCollider) {
    const t = this.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, maxDist, excludeCollider);
    return t === null ? null : fromY - t;
  }

  step(dt) {
    this.world.timestep = dt;
    this.world.step();
  }
}

/** Object3D 트리를 하나의 삼각형 묶음(월드 좌표)으로 모은다 */
export function collectTriangles(root) {
  root.updateMatrixWorld(true);
  const positions = [];
  const indices = [];
  let base = 0;

  const visit = (obj) => {
    if (obj.userData?.noCollide) return;
    if (obj.isMesh && obj.geometry?.getAttribute('position')) {
      const geo = obj.geometry;
      const pos = geo.getAttribute('position');
      const index = geo.getIndex();
      const count = obj.isInstancedMesh ? obj.count : 1;
      for (let k = 0; k < count; k++) {
        if (obj.isInstancedMesh) {
          obj.getMatrixAt(k, _inst);
          _m.multiplyMatrices(obj.matrixWorld, _inst);
        } else {
          _m.copy(obj.matrixWorld);
        }
        for (let i = 0; i < pos.count; i++) {
          _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
          positions.push(_v.x, _v.y, _v.z);
        }
        if (index) {
          for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
        } else {
          for (let i = 0; i < pos.count; i++) indices.push(base + i);
        }
        base += pos.count;
      }
    }
    for (const child of obj.children) visit(child);
  };
  visit(root);

  return { vertices: new Float32Array(positions), indices: new Uint32Array(indices) };
}
