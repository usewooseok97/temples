const $ = (id) => document.getElementById(id);

/** 로딩 / 시작 화면 / 조준점 / 좌상단 정보 / 토스트 / 오류 화면 */
export class Hud {
  constructor() {
    this.el = {
      loading: $('loading'),
      loadingText: $('loading-text'),
      loadingBar: $('loading-bar-fill'),
      start: $('start'),
      startWorld: $('start-world'),
      startButton: $('start-button'),
      worldSelect: $('world-select'),
      characterSelect: $('character-select'),
      crosshair: $('crosshair'),
      info: $('hud-info'),
      toast: $('toast'),
      error: $('error'),
      errorText: $('error-text'),
      touchUi: $('touch-ui'),
      touchStick: $('touch-stick'),
      touchKnob: $('touch-knob'),
      touchJump: $('touch-jump'),
      touchView: $('touch-view'),
      touchMenu: $('touch-menu'),
    };
    this._toastTimer = 0;
  }

  setLoading(text, progress = null) {
    this.el.loadingText.textContent = text;
    if (progress !== null) {
      this.el.loadingBar.style.width = `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`;
    }
  }

  hideLoading() {
    this.el.loading.classList.add('hidden');
  }

  showStart(subtitle) {
    if (subtitle !== undefined) this.el.startWorld.textContent = subtitle;
    this.el.start.classList.remove('hidden');
    this.setCrosshair(false);
  }

  hideStart() {
    this.el.start.classList.add('hidden');
  }

  get startVisible() {
    return !this.el.start.classList.contains('hidden');
  }

  setCrosshair(visible) {
    this.el.crosshair.classList.toggle('hidden', !visible);
  }

  setInfo(text) {
    if (this.el.info.textContent !== text) this.el.info.textContent = text;
  }

  toast(message, ms = 2200) {
    const t = this.el.toast;
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  showError(err) {
    this.el.loading.classList.add('hidden');
    this.el.start.classList.add('hidden');
    this.el.errorText.textContent = String(err?.message ?? err);
    this.el.error.classList.remove('hidden');
  }

  /** 월드/캐릭터 선택 드롭다운 채우기 */
  fillSelect(select, items, currentId, onPick) {
    select.innerHTML = '';
    for (const item of items) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name ?? item.id;
      select.appendChild(opt);
    }
    if (!items.some((i) => i.id === currentId)) {
      const opt = document.createElement('option');
      opt.value = currentId;
      opt.textContent = '(URL로 지정)';
      select.appendChild(opt);
    }
    select.value = currentId;
    select.addEventListener('change', () => onPick(select.value));
  }
}
