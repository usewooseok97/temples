import { fetchJson } from '../core/assets.js';
import { TestCharacter } from './testCharacter.js';

/**
 * 캐릭터(아바타) 공통 인터페이스 — 새 캐릭터 종류를 만들 때 이것만 맞추면 된다.
 *
 *   object3d : THREE.Object3D   원점 = 발바닥, +Z = 앞
 *   update(dt, state)           매 프레임. state = {
 *       speed, walkSpeed, runSpeed,   // 실제 수평 속도와 기준 속도 (m/s)
 *       running, grounded, airTime, verticalSpeed, inWater
 *   }
 *   dispose()
 *
 * 충돌은 캐릭터가 아니라 Player(캡슐)가 담당하므로, 캐릭터는 보이는 것만 책임진다.
 */

const FALLBACK_MANIFEST = {
  default: 'mannequin',
  characters: [{ id: 'mannequin', name: '테스트 마네킹', type: 'procedural' }],
};

export async function loadCharacterManifest() {
  try {
    const m = await fetchJson('characters/characters.json');
    if (!Array.isArray(m.characters) || m.characters.length === 0) throw new Error('characters 배열이 비어 있음');
    return m;
  } catch (err) {
    console.warn('[character] characters.json 을 읽지 못해 기본값을 씁니다.', err);
    return FALLBACK_MANIFEST;
  }
}

export function pickCharacter(manifest, params) {
  const id = params.get('character') || manifest.default;
  return manifest.characters.find((c) => c.id === id) ?? manifest.characters[0];
}

/**
 * @param {object} def  characters.json 의 항목
 * @param {{height?: number, onWarning?: (msg: string) => void}} opts
 */
export async function createCharacter(def, { height = 1.75, onWarning } = {}) {
  if (def?.type === 'gltf') {
    try {
      const { GltfCharacter } = await import('./gltfCharacter.js');
      return await GltfCharacter.load(def, { height });
    } catch (err) {
      console.error('[character]', err);
      onWarning?.(`캐릭터 에셋을 불러오지 못해 테스트 캐릭터를 씁니다 (${def.url})`);
    }
  }
  return new TestCharacter({ height, color: def?.color });
}
