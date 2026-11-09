import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader, DRACO_GLTF_CONFIG } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * public/ 기준 경로를 실제 URL로 바꾼다.
 * 'worlds/a/world.spz' → '/worlds/a/world.spz' (dev) 또는 './worlds/a/world.spz' (build)
 * http(s)://, blob:, data:, / 로 시작하면 그대로 쓴다.
 */
export function assetUrl(path) {
  if (!path) return path;
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(path)) return path;
  return import.meta.env.BASE_URL + path.replace(/^\.\//, '');
}

export function fileExtension(url) {
  const clean = String(url).split(/[?#]/)[0];
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * 파일이 실제로 있는지 미리 확인 (경로 오타를 알아보기 쉬운 메시지로 알려주기 위함).
 * 개발 서버는 없는 파일에 index.html 을 돌려주므로 content-type 으로 판단한다.
 * 네트워크/CORS 문제로 확인 자체가 안 되면 그냥 통과시키고 로더가 시도하게 둔다.
 */
export async function assertAssetExists(path) {
  let res;
  try {
    res = await fetch(assetUrl(path), { method: 'HEAD', cache: 'no-cache' });
  } catch {
    return;
  }
  const type = res.headers.get('content-type') || '';
  if (res.status === 404 || type.includes('text/html')) {
    const shown = /^([a-z][a-z0-9+.-]*:|\/)/i.test(path) ? path : `public/${path}`;
    throw new Error(`파일을 찾을 수 없습니다: ${shown}`);
  }
}

export async function fetchJson(path) {
  const res = await fetch(assetUrl(path), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} 를 불러오지 못했습니다 (HTTP ${res.status})`);
  return res.json();
}

let gltfLoader = null;

/** Draco / Meshopt 압축 GLB까지 읽을 수 있는 공용 로더 */
export function getGltfLoader() {
  if (!gltfLoader) {
    // three r187 부터 디코더(wasm)가 패키지에 포함되어 Vite가 알아서 번들링함
    const draco = new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG);
    gltfLoader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoader;
}

export function loadGltf(path, onProgress) {
  return new Promise((resolve, reject) => {
    getGltfLoader().load(
      assetUrl(path),
      resolve,
      onProgress,
      (err) => reject(new Error(`${path} 를 불러오지 못했습니다: ${err?.message ?? err}`)),
    );
  });
}

/** 무거운 동기 작업 사이에 화면(로딩 문구)이 갱신될 틈을 준다 */
export const nextFrame = () => new Promise((r) => setTimeout(r, 0));
