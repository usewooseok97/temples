import { AUTOWALK } from '../config.js';
import { clamp } from '../core/math.js';

// event.code(물리 키 위치)를 쓰므로 한글 입력 상태에서도 WASD가 그대로 동작한다.
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF', 'KeyC', 'KeyV', 'KeyR', 'KeyP',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
]);
const MAX_MOUSE_DELTA = 300; // 포인터 락 직후 가끔 튀는 큰 값 무시

/** 화면 픽셀 좌표 → 정규화 장치 좌표(NDC, −1~1). 레이캐스트로 탭한 곳을 찾을 때 씀 */
export const toNdcX = (clientX) => (clientX / window.innerWidth) * 2 - 1;
export const toNdcY = (clientY) => -(clientY / window.innerHeight) * 2 + 1;

/** 누른 곳에서 거의 움직이지 않고 짧게 뗐으면 탭(클릭)으로 본다 */
export const isTap = (press, clientX, clientY, now = performance.now()) =>
  Math.hypot(clientX - press.x0, clientY - press.y0) <= AUTOWALK.tapMaxMovePx && now - press.t0 <= AUTOWALK.tapMaxTimeMs;

const isFormField = (el) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

/**
 * 키보드 + 마우스(포인터 락) 입력.
 *
 * 터치 조작(touchControls.js)은 아래 외부 입력 API 로 값을 넣고, 플레이어 쪽 코드는 그대로 동작한다.
 *   input.virtualMove.x / .y  (−1~1, 오른쪽/앞이 +)  ← 왼쪽 조이스틱
 *   input.virtualRun                               ← 조이스틱을 링 밖으로 더 밀기
 *   input.addLook(dx, dy)                          ← 오른쪽 화면 드래그
 *   input.press('Space')                           ← 점프 버튼
 *   input.tap(ndcX, ndcY)                          ← 화면 탭 (onTap 콜백으로 전달, 그곳으로 걸어가기)
 *
 * 자동 걷기(autoWalk.js)는 input.autoMove 에 월드 기준 방향을 넣고, 수동 이동 입력이 있으면 플레이어가 그쪽을 우선한다.
 */
export class Input {
  constructor(element) {
    this.element = element;
    this.enabled = false; // 시작 화면이 떠 있는 동안은 입력 무시
    this.locked = false;
    this.dragMode = false; // 포인터 락을 못 쓰는 환경이면 드래그로 둘러보기
    this.touchMode = false; // TouchControls 가 둘러보기를 넣는 중이면 마우스 드래그 둘러보기는 끔
    this.down = new Set();
    this.pressedNow = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    this.virtualMove = { x: 0, y: 0 };
    this.virtualRun = false;
    /** 자동 걷기가 넣는 월드 기준 이동 벡터 (길이 0~1 = 속도 배율). 수동 입력이 없을 때만 쓰임 */
    this.autoMove = { x: 0, z: 0, run: false };
    /** @type {(locked: boolean) => void} */
    this.onLockChange = null;
    /** @type {() => void} */
    this.onLockFailed = null;
    /** @type {(ndcX: number, ndcY: number) => void}  화면을 탭/클릭했을 때 (포인터 락 중엔 화면 중앙) */
    this.onTap = null;
    this._dragging = false;
    this._press = null; // 마우스 탭 판정용 (드래그 모드)
    this._lockUsesPromise = false;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isFormField(e.target) || !this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedNow.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || (this.dragMode && this._dragging)) {
        this.addLook(
          clamp(e.movementX, -MAX_MOUSE_DELTA, MAX_MOUSE_DELTA),
          clamp(e.movementY, -MAX_MOUSE_DELTA, MAX_MOUSE_DELTA),
        );
      }
    });
    // 마우스 클릭 → 탭. 터치 모드에서는 TouchControls 가 조이스틱과 구분해서 처리한다.
    this.element.addEventListener('pointerdown', (e) => {
      if (this.touchMode || !this.enabled || e.button !== 0) return;
      if (this.locked) {
        this.tap(0, 0); // 포인터 락 중엔 커서가 없으므로 조준점(화면 중앙)
        return;
      }
      this._press = { x0: e.clientX, y0: e.clientY, t0: performance.now() };
      if (this.dragMode) this._dragging = true;
    });
    window.addEventListener('pointerup', (e) => {
      this._dragging = false;
      const press = this._press;
      this._press = null;
      if (!press || this.touchMode || !this.enabled) return;
      if (isTap(press, e.clientX, e.clientY)) this.tap(toNdcX(e.clientX), toNdcY(e.clientY));
    });
    this.element.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.wheel += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
    // Promise 를 돌려주지 않는 옛 브라우저만 이 이벤트로 실패를 판단 (최신 브라우저는 Promise 로 처리)
    document.addEventListener('pointerlockerror', () => {
      if (!this._lockUsesPromise) this.onLockFailed?.();
    });
  }

  /** 마우스 잠금 요청 (사용자 클릭 이벤트 안에서 호출해야 함) */
  requestLock() {
    const el = this.element;
    if (!el.requestPointerLock) {
      this.onLockFailed?.();
      return;
    }
    this._lockUsesPromise = false;
    const attempt = (options) => {
      let result;
      try {
        result = options ? el.requestPointerLock(options) : el.requestPointerLock();
      } catch (err) {
        return Promise.reject(err);
      }
      if (result && typeof result.then === 'function') {
        this._lockUsesPromise = true;
        return result;
      }
      return null; // 옛 방식: 결과는 pointerlockchange / pointerlockerror 이벤트로 옴
    };
    // unadjustedMovement: OS 마우스 가속을 끈 원시 이동값. 지원 안 하면 기본 모드로 한 번 더 시도
    attempt({ unadjustedMovement: true })?.catch(() => {
      attempt()?.catch(() => this.onLockFailed?.());
    });
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.down.clear();
      this.pressedNow.clear();
      this.lookX = this.lookY = this.wheel = 0;
      this.clearVirtual();
    }
  }

  // ---- 외부(가상 조이스틱 등)에서도 쓰는 입력 주입 API ----
  clearVirtual() {
    this.virtualMove.x = this.virtualMove.y = 0;
    this.virtualRun = false;
    this.clearAutoMove();
  }

  clearAutoMove() {
    this.autoMove.x = this.autoMove.z = 0;
    this.autoMove.run = false;
  }

  addLook(dx, dy) {
    this.lookX += dx;
    this.lookY += dy;
  }

  press(code) {
    this.pressedNow.add(code);
  }

  /** 화면의 한 점을 탭/클릭함 (NDC 좌표). 그곳으로 걸어가기 등은 onTap 이 처리 */
  tap(ndcX, ndcY) {
    if (!this.enabled) return;
    this.onTap?.(ndcX, ndcY);
  }

  // ---- 플레이어가 읽는 값 ----
  isDown(code) {
    return this.down.has(code);
  }

  pressed(code) {
    return this.pressedNow.has(code);
  }

  /** 수동 이동 입력(키보드·조이스틱)이 있는지 */
  get hasManualMove() {
    return Math.hypot(this.moveX, this.moveY) > 0.1;
  }

  /** 좌우 (오른쪽 +1) */
  get moveX() {
    let x = 0;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    return clamp(x + this.virtualMove.x, -1, 1);
  }

  /** 앞뒤 (앞 +1) */
  get moveY() {
    let y = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) y += 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) y -= 1;
    return clamp(y + this.virtualMove.y, -1, 1);
  }

  get running() {
    return this.virtualRun || this.down.has('ShiftLeft') || this.down.has('ShiftRight');
  }

  consumeLook() {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return look;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /** 프레임 끝에 호출: '이번 프레임에 눌림' 상태 초기화 */
  endFrame() {
    this.pressedNow.clear();
  }
}
