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
    defaultPitchDeg: -12, // 시작할 때 / R 키로 되돌릴 때 상하각 (음수 = 내려다봄)
    minPitchDeg: -70,
    maxPitchDeg: 40,
    collisionRadius: 0.2, // 벽에 카메라가 파묻히지 않도록 쓰는 구 반지름
  },
  // 진행 방향 추적: 걷는 동안 카메라가 캐릭터 뒤로 돌아가 앞쪽이 보이게 함 (내비게이션처럼)
  follow: {
    autoWalkLambda: 2.5, // 탭/클릭 이동 중 카메라가 진행 방향으로 돌아가는 속도 (클수록 빠름)
    autoWalkNear: 1.5, // 목적지까지 이 거리 안이면 돌리지 않음 (바로 옆을 탭했는데 카메라가 휙 도는 것 방지)
    autoWalkFar: 5.0, // 이 거리부터 완전히 따라감 (그 사이는 비례)
    autoWalkPitchDeg: -14, // 탭/클릭 이동 중 3인칭 상하각 목표 (살짝 내려다봄)
    pitchLambda: 2.0,
    stickLambda: 1.0, // 조이스틱으로 걷는 중 (3인칭만). 스틱이 카메라 기준이라 크게 하면 옆으로 밀 때 원을 그리며 돎
    stickFullDeg: 60, // 스틱이 앞쪽 이 각도 안이면 완전히 따라감
    stickStopDeg: 110, // 이 각도 밖(옆·뒤)으로 밀면 따라가지 않음 — 뒤로 걸을 때 카메라가 빙글 돌지 않게
    keyboard: false, // WASD 이동 중에도 따라 돌지 여부 (PC는 마우스가 카메라를 잡고 있어 기본 끔)
    keyboardLambda: 1.2,
    resumeDelay: 1.2, // 직접 둘러본 뒤 다시 따라가기까지 기다리는 시간 (초)
    minSpeed: 0.6, // 이 속도(m/s) 이상 움직일 때만
  },
};

// 탭/클릭한 곳으로 자동 이동
export const AUTOWALK = {
  maxTapDistance: 400, // 이보다 먼 곳을 탭하면 무시 (m)
  arriveRadius: 0.4, // 목적지에서 이 거리 안이면 도착
  slowRadius: 1.5, // 목적지 이 거리 안에서는 감속
  runBeyond: 20, // 목적지가 이보다 멀면 달려감 (0이면 항상 걷기)
  stuckTime: 1.2, // 이 시간 동안 가까워지지 않으면 포기 (벽·절벽)
  tapMaxMovePx: 10, // 손가락/마우스가 이보다 많이 움직이면 탭이 아니라 드래그
  tapMaxTimeMs: 350, // 이보다 오래 누르면 탭이 아님
  markerColor: '#f0b35a',
};

export const TOUCH = {
  stickRadius: 60, // 조이스틱 링 반지름 (CSS px)
  deadZone: 0.12, // 스틱 중심의 무반응 구간 (반지름 대비)
  runStart: 1.4, // 손가락이 반지름의 이 배수를 넘으면 달리기
  runStop: 1.25, // 이 배수 아래로 돌아오면 다시 걷기 (경계에서 걷기/달리기가 깜빡이지 않게)
  lookScale: 2.5, // 드래그 1px 을 마우스 몇 px 로 칠지 (CAMERA.mouseSensitivity 에 곱해짐)
};

// 시작 시점: 'first' | 'third'  (URL ?view=first 로도 바꿀 수 있음)
export const DEFAULT_VIEW = 'third';
