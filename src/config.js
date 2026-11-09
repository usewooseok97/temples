// 조작감·카메라 튜닝 값 (단위: 미터, 초, 라디안은 *Deg 이름이면 도)

export const PLAYER = {
  radius: 0.3, // 충돌 캡슐 반지름
  height: 1.75, // 충돌 캡슐 전체 높이(발~머리)
  eyeHeight: 1.62, // 1인칭 눈 높이(발 기준)
  walkSpeed: 3.2,
  runSpeed: 7.0,
  jumpSpeed: 5.0,
  gravity: 18,
  maxFallSpeed: 40,
  groundAccel: 14, // 클수록 키 입력에 즉각 반응
  airAccel: 2.5,
  coyoteTime: 0.12, // 발이 떨어진 직후에도 점프 허용하는 시간
  maxSlopeDeg: 50, // 걸어 올라갈 수 있는 최대 경사
  stepHeight: 0.42, // 자동으로 올라서는 턱 높이 (계단)
  snapToGround: 0.45, // 내리막에서 바닥에 붙어 있기
  waterSpeedFactor: 0.55, // 물속 이동 속도 배율
  flySpeed: 12, // 자유 비행(F) 속도, Shift 누르면 x3
};

export const CAMERA = {
  fov: 70,
  runFovBoost: 5, // 달릴 때 시야각 증가 (1인칭)
  near: 0.05,
  far: 2000,
  mouseSensitivity: 0.0022,
  headBob: 0.035, // 1인칭 걸음 흔들림 크기 (0이면 끔)
  thirdPerson: {
    distance: 4.0,
    minDistance: 1.5,
    maxDistance: 10,
    pivotHeight: 1.55, // 발 기준으로 카메라가 바라보는 높이
    minPitchDeg: -70,
    maxPitchDeg: 40,
    collisionRadius: 0.2, // 벽에 카메라가 파묻히지 않도록 쓰는 구 반지름
  },
};

export const TOUCH = {
  stickRadius: 60, // 조이스틱 링 반지름 (CSS px)
  deadZone: 0.12, // 스틱 중심의 무반응 구간 (반지름 대비)
  runStart: 1.4, // 손가락이 반지름의 이 배수를 넘으면 달리기
  runStop: 1.25, // 이 배수 아래로 돌아오면 다시 걷기 (경계에서 걷기/달리기가 깜빡이지 않게)
  lookScale: 2.5, // 드래그 1px 을 마우스 몇 px 로 칠지 (CAMERA.mouseSensitivity 에 곱해짐)
};

// 시작 시점: 'first' | 'third'  (URL ?view=third 로도 바꿀 수 있음)
export const DEFAULT_VIEW = 'first';
