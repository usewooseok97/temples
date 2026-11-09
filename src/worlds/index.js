import { fetchJson } from '../core/assets.js';

/**
 * 월드 로더 공통 규약 — 어떤 월드든 loadXxxWorld(def, ctx) 가 아래 모양을 돌려주면 된다.
 *
 * {
 *   name:       string
 *   root:       THREE.Object3D   화면에 보이는 것 (splat, 메시, 조명…)
 *   collider:   THREE.Object3D   충돌에 쓸 메시들 (보일 필요 없음). 전부 trimesh 로 등록됨
 *                                userData.noCollide = true 인 오브젝트는 제외
 *   boundary?:  THREE.Object3D   장면에 넣지 않는 충돌 전용 메시 (경계 벽 등, 디버그 표시 제외)
 *   spawn:      { position?: THREE.Vector3 (발 위치), yaw?: 라디안, findGround?: boolean }
 *   killY:      number           이 높이 아래로 떨어지면 시작 위치로
 *   waterLevel?: number          수면 높이 (물속 감속용)
 *   warning?:   string           시작 시 띄울 안내 문구
 *   update?(dt, elapsed, { camera, focus })   매 프레임
 * }
 *
 * ctx = { renderer, scene, camera, params, onProgress(text, 0~1) }
 */

const FALLBACK_MANIFEST = {
  default: 'test',
  worlds: [{ id: 'test', name: '테스트 월드', type: 'procedural' }],
};

export async function loadWorldManifest() {
  try {
    const m = await fetchJson('worlds/worlds.json');
    if (!Array.isArray(m.worlds) || m.worlds.length === 0) throw new Error('worlds 배열이 비어 있음');
    return m;
  } catch (err) {
    console.warn('[world] worlds.json 을 읽지 못해 기본값을 씁니다.', err);
    return FALLBACK_MANIFEST;
  }
}

/**
 * URL 로 월드 고르기
 *   ?world=<id>                       worlds.json 의 항목
 *   ?splat=<경로>&collider=<경로>      목록에 등록하지 않고 바로 열어보기 (Marble 내보내기 확인용)
 */
export function pickWorld(manifest, params) {
  const splat = params.get('splat');
  if (splat) {
    return {
      id: 'url',
      name: `URL 월드 (${splat.split('/').pop()})`,
      type: 'marble',
      splat,
      collider: params.get('collider') || undefined,
    };
  }
  const id = params.get('world') || manifest.default;
  return manifest.worlds.find((w) => w.id === id) ?? manifest.worlds[0];
}

export async function loadWorld(def, ctx) {
  switch (def.type) {
    case 'marble': {
      const { loadMarbleWorld } = await import('./marbleWorld.js');
      return loadMarbleWorld(def, ctx);
    }
    case 'procedural':
    case 'test': {
      const { loadTestWorld } = await import('./test/index.js');
      return loadTestWorld(def, ctx);
    }
    default:
      throw new Error(`알 수 없는 월드 type: "${def.type}" (marble 또는 procedural)`);
  }
}
