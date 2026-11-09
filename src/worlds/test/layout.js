// 테스트 월드 배치 — 지형·구조물·나무가 같은 값을 공유한다.
// (Marble 월드를 쓰기 시작하면 test/ 폴더 전체가 필요 없어진다)

export const WORLD_HALF = 340; // 지형 메시 절반 크기 (m)
export const WALK_LIMIT = 232; // 보이지 않는 경계 벽 위치
export const WATER_LEVEL = -0.6;

// 강: 북(−Z)에서 남(+Z)으로 흐르며 산을 가르는 계곡을 만든다
export const RIVER = { halfWidth: 6.5, bank: 6 };
export const riverX = (z) => -6 + 16 * Math.sin(z / 60) + 6 * Math.sin(z / 23 + 1.3);
export const riverSlope = (z) => (16 / 60) * Math.cos(z / 60) + (6 / 23) * Math.cos(z / 23 + 1.3);
/** 강 중심선까지의 (근사) 수직 거리 */
export const riverDistance = (x, z) => Math.abs(x - riverX(z)) / Math.sqrt(1 + riverSlope(z) ** 2);

// 마을 광장 (강 동쪽)
export const VILLAGE = { x: 52, z: 6, radius: 30, falloff: 18, y: 1.6 };

// 석축 위 탑과 법당 (강 서쪽) — 계단으로 올라가 자동 턱 오르기 테스트
export const TEMPLE = {
  x: -62,
  z: -48,
  radius: 24,
  falloff: 16,
  y: 4.0,
  platform: { w: 24, d: 20, h: 2.4 },
  steps: 12,
  stepRise: 0.2,
  stepRun: 0.38,
  stairWidth: 5,
  gateZ: -22,
};

// 강가 정자 (강 동쪽, 다리 북쪽)
export const PAVILION = { x: 24, z: 48, radius: 6, falloff: 8 };

// 다리: x 축 방향으로 강을 가로지름
export const BRIDGE = { z: 26, length: 28, width: 3.2, y: 1.3 };
export const BRIDGE_X = riverX(BRIDGE.z);

// 시작 위치와 처음 바라볼 지점
export const SPAWN = { x: -30, z: 74, lookAt: [12, 16] };

// 흙길 (폴리라인)
const STAIR_BASE_Z = TEMPLE.z + TEMPLE.platform.d / 2 + TEMPLE.steps * TEMPLE.stepRun;
export const PATHS = [
  // 시작 → 다리 서쪽
  [[-30, 80], [-25, 60], [-16, 40], [BRIDGE_X - BRIDGE.length / 2 - 1, BRIDGE.z]],
  // 다리 동쪽 → 마을 광장
  [[BRIDGE_X + BRIDGE.length / 2 + 1, BRIDGE.z], [32, 18], [VILLAGE.x - 14, VILLAGE.z + 3]],
  // 갈림길 → 일주문 → 석축 계단
  [[-16, 40], [-30, 10], [-44, -6], [TEMPLE.x, -16], [TEMPLE.x, STAIR_BASE_Z]],
  // 다리 동쪽 → 정자
  [[BRIDGE_X + BRIDGE.length / 2 + 1, BRIDGE.z], [20, 36], [PAVILION.x, PAVILION.z - 3]],
];
