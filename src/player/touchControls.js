import { TOUCH } from '../config.js';
import { clamp } from '../core/math.js';

/** URL 의 ?touch=1 / ?touch=0 을 우선하고, 없으면 터치가 주 입력인 기기인지로 판단 */
export function wantsTouchControls(params) {
  const forced = params.get('touch');
  if (forced === '1' || forced === '0') return forced === '1';
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * 터치 조작: 화면 왼쪽 절반은 조이스틱(닿은 자리에 생김), 오른쪽 절반은 둘러보기, 버튼은 점프/시점/메뉴.
 * 손가락을 pointerId 로 구분하므로 두 엄지를 동시에 쓸 수 있다.
 * 결과는 Input 의 외부 입력 API 로만 넣기 때문에 플레이어·카메라 코드는 터치를 모른다.
 */
export class TouchControls {
  /**
   * @param {import('./input.js').Input} input
   * @param {import('../ui/hud.js').Hud['el']} ui
   */
  constructor(input, ui) {
    this.input = input;
    this.ui = ui;
    /** @type {() => void} */
    this.onMenu = null;
    /** @type {{ id: number, originX: number, originY: number, running: boolean } | null} */
    this.stick = null;
    /** @type {{ id: number, x: number, y: number } | null} */
    this.look = null;

    input.dragMode = true; // 포인터 락 없이 바로 시작
    input.touchMode = true;
    document.body.classList.add('touch-mode');
    ui.touchStick.style.setProperty('--stick-radius', `${TOUCH.stickRadius}px`);
    this._bind();
  }

  _bind() {
    const { input, ui } = this;
    // touch-action: none 인 캔버스에서 시작한 손가락은 끝날 때까지 캔버스로 이벤트가 오고, window 로 올라온다.
    input.element.addEventListener('pointerdown', (e) => this._onDown(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onEnd(e));
    window.addEventListener('pointercancel', (e) => this._onEnd(e));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });

    ui.touchJump.addEventListener('pointerdown', () => input.press('Space'));
    ui.touchView.addEventListener('pointerdown', () => input.press('KeyV'));
    // 조이스틱을 잡은 채로 누르면 브라우저가 탭으로 인식하지 않아 click 이 오지 않을 수 있어서 touchend 로 연다.
    // preventDefault 가 뒤따르는 click 을 막는다. 안 막으면 방금 뜬 시작 화면에 click 이 떨어져 바로 다시 시작된다.
    ui.touchMenu.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault();
      this.onMenu?.();
    });
    ui.touchMenu.addEventListener('click', () => this.onMenu?.()); // ?touch=1 로 마우스 시험할 때
  }

  _onDown(e) {
    if (!this.input.enabled || e.button !== 0) return;
    if (e.clientX < window.innerWidth / 2) {
      if (!this.stick) this._pressStick(e);
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  _onMove(e) {
    if (e.pointerId === this.stick?.id) {
      this._moveStick(e.clientX, e.clientY);
    } else if (e.pointerId === this.look?.id) {
      // PointerEvent.movementX 는 브라우저마다 단위가 달라서 좌표 차이로 계산
      this.input.addLook((e.clientX - this.look.x) * TOUCH.lookScale, (e.clientY - this.look.y) * TOUCH.lookScale);
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    }
  }

  _onEnd(e) {
    if (e.pointerId === this.stick?.id) this._releaseStick();
    else if (e.pointerId === this.look?.id) this.look = null;
  }

  _pressStick(e) {
    this.stick = { id: e.pointerId, originX: e.clientX, originY: e.clientY, running: false };
    this.ui.touchStick.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    this.ui.touchKnob.style.transform = '';
    this.ui.touchStick.classList.remove('hidden');
  }

  _moveStick(clientX, clientY) {
    const stick = this.stick;
    const dx = clientX - stick.originX;
    const dy = clientY - stick.originY;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / TOUCH.stickRadius;
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;

    const amount = clamp((ratio - TOUCH.deadZone) / (1 - TOUCH.deadZone), 0, 1);
    this.input.virtualMove.x = ux * amount;
    this.input.virtualMove.y = -uy * amount; // 화면 위쪽이 앞(+)
    stick.running = ratio >= (stick.running ? TOUCH.runStop : TOUCH.runStart);
    this.input.virtualRun = stick.running;

    const knob = Math.min(dist, TOUCH.stickRadius);
    this.ui.touchKnob.style.transform = `translate(${ux * knob}px, ${uy * knob}px)`;
    this.ui.touchStick.classList.toggle('running', stick.running);
  }

  _releaseStick() {
    this.stick = null;
    this.input.clearVirtual();
    this.ui.touchStick.classList.add('hidden');
    this.ui.touchStick.classList.remove('running');
  }

  /** 잡고 있던 손가락을 모두 놓은 상태로 (앱 전환, 메뉴 등에서 혼자 계속 걷지 않게) */
  reset() {
    this._releaseStick();
    this.look = null;
  }

  show() {
    this.ui.touchUi.classList.remove('hidden');
  }

  hide() {
    this.reset();
    this.ui.touchUi.classList.add('hidden');
  }
}
