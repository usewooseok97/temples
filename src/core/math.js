export const DEG = Math.PI / 180;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** 프레임레이트와 무관한 지수 감쇠 보간 계수 (lambda가 클수록 빠르게 따라감) */
export const dampFactor = (lambda, dt) => 1 - Math.exp(-lambda * dt);

/** 각도를 최단 방향으로 부드럽게 따라가게 함 */
export function dampAngle(current, target, lambda, dt) {
  const TAU = Math.PI * 2;
  let d = (target - current) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return current + d * dampFactor(lambda, dt);
}

/** [x, y, z] 배열 또는 {x, y, z} → 숫자 3개 */
export function toXYZ(v, fallback = [0, 0, 0]) {
  if (!v) return fallback;
  if (Array.isArray(v)) return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0];
}
