import './style.css';
import * as THREE from 'three';
import { CAMERA, PLAYER, DEFAULT_VIEW } from './config.js';
import { DEG, clamp, dampAngle, dampFactor } from './core/math.js';
import { nextFrame } from './core/assets.js';
import { createPhysics } from './physics/physics.js';
import { Input } from './player/input.js';
import { TouchControls, wantsTouchControls } from './player/touchControls.js';
import { Player } from './player/player.js';
import { CameraRig } from './player/cameraRig.js';
import { AutoWalk } from './player/autoWalk.js';
import { createCharacter, loadCharacterManifest, pickCharacter } from './character/index.js';
import { loadWorldManifest, pickWorld, loadWorld } from './worlds/index.js';
import { ColliderDebugView } from './debug/colliderView.js';
import { Hud } from './ui/hud.js';

const hud = new Hud();

main().catch((err) => {
  console.error(err);
  hud.showError(err);
});

async function main() {
  const params = new URLSearchParams(location.search);

  hud.setLoading('설정 읽는 중…', 0.05);
  const [worldManifest, characterManifest] = await Promise.all([loadWorldManifest(), loadCharacterManifest()]);
  const worldDef = pickWorld(worldManifest, params);
  const characterDef = pickCharacter(characterManifest, params);
  const worldLabel = worldDef.name ?? worldDef.id;

  hud.setLoading('물리 엔진 준비 중…', 0.1);
  const physics = await createPhysics();

  // ---- 렌더러 / 씬 / 카메라 ----
  // splat 월드는 MSAA를 끄는 게 Spark 권장 (화질 이득 없이 느려짐)
  const splatWorld = worldDef.type === 'marble';
  const renderer = new THREE.WebGLRenderer({ antialias: !splatWorld, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, splatWorld ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far,
  );
  scene.add(camera);

  // ---- 월드 (보이는 것 + 충돌 메시) ----
  hud.setLoading(`월드 불러오는 중 — ${worldLabel}`, 0.15);
  const world = await loadWorld(worldDef, {
    renderer,
    scene,
    camera,
    params,
    onProgress: (text, fraction = 0) => hud.setLoading(text, 0.15 + 0.7 * fraction),
  });
  scene.add(world.root);

  hud.setLoading('충돌 메시 만드는 중…', 0.88);
  await nextFrame();
  if (!physics.addStaticMeshes(world.collider, 'world')) {
    hud.toast('충돌 메시가 비어 있어요. F 키로 비행하며 둘러보세요.', 6000);
  }
  if (world.boundary) physics.addStaticMeshes(world.boundary, 'boundary', { debug: false });
  if (world.warning) hud.toast(world.warning, 6000);

  // ---- 플레이어 (물리 캡슐) & 카메라 ----
  const player = new Player(physics);
  player.waterLevel = world.waterLevel ?? null;
  const spawn = resolveSpawn(world, physics, player);
  player.teleport(spawn.position);
  player.syncFromPhysics();

  const view = params.get('view') === 'third' || params.get('view') === 'first' ? params.get('view') : DEFAULT_VIEW;
  const rig = new CameraRig(camera, physics, { mode: view, eyeHeight: PLAYER.eyeHeight });
  rig.yaw = spawn.yaw;

  // ---- 캐릭터 (보이는 아바타) ----
  hud.setLoading('캐릭터 불러오는 중…', 0.93);
  const character = await createCharacter(characterDef, {
    height: PLAYER.height,
    onWarning: (msg) => hud.toast(msg, 6000),
  });
  scene.add(character.object3d);
  let characterYaw = spawn.yaw + Math.PI;
  const charState = {
    speed: 0,
    walkSpeed: PLAYER.walkSpeed,
    runSpeed: PLAYER.runSpeed,
    running: false,
    grounded: true,
    airTime: 0,
    verticalSpeed: 0,
    inWater: false,
  };

  // ---- 입력 & 시작 화면 ----
  const input = new Input(renderer.domElement);
  const touch = wantsTouchControls(params) ? new TouchControls(input, hud.el) : null;

  // 탭/클릭한 곳으로 걸어가기 (포인터 락 중에는 조준점 위치)
  const autoWalk = new AutoWalk({ scene, physics, player, camera, input });
  input.onTap = (ndcX, ndcY) => {
    if (player.flying) return;
    autoWalk.goToScreenPoint(ndcX, ndcY);
  };
  autoWalk.onStop = (reason) => {
    if (reason === 'blocked') hud.toast('길이 막혀서 멈췄어요', 1600);
  };

  // 조준점: 1인칭이거나, 커서가 없는 포인터 락 상태(클릭할 곳을 알 수 있게)
  const refreshCrosshair = () => hud.setCrosshair(input.enabled && (rig.mode === 'first' || input.locked));
  const startPlaying = () => {
    hud.hideStart();
    input.setEnabled(true);
    touch?.show();
    refreshCrosshair();
  };
  const stopPlaying = () => {
    input.setEnabled(false);
    autoWalk.cancel();
    touch?.hide();
    hud.showStart();
  };
  if (touch) touch.onMenu = stopPlaying;
  input.onLockChange = (locked) => {
    if (locked) startPlaying();
    else if (!input.dragMode) stopPlaying();
  };
  input.onLockFailed = () => {
    if (input.dragMode) return;
    input.dragMode = true;
    startPlaying();
    hud.toast('마우스 잠금을 쓸 수 없는 환경이라 드래그로 둘러봅니다 (Esc: 메뉴)', 4500);
  };
  hud.el.start.addEventListener('click', (e) => {
    if (e.target.closest('select, label, details, summary, a')) return;
    if (input.dragMode) startPlaying();
    else input.requestLock();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && input.dragMode && input.enabled) stopPlaying();
  });

  hud.fillSelect(hud.el.worldSelect, worldManifest.worlds, worldDef.id, (id) =>
    navigate({ world: id, splat: null, collider: null }),
  );
  hud.fillSelect(hud.el.characterSelect, characterManifest.characters, characterDef.id, (id) =>
    navigate({ character: id }),
  );

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- 디버그 키 ----
  let colliderView = null;
  const handleActions = () => {
    if (input.pressed('KeyV')) {
      const mode = rig.toggle();
      refreshCrosshair();
      hud.toast(mode === 'first' ? '1인칭 시점' : touch ? '3인칭 시점' : '3인칭 시점 (휠: 카메라 거리)');
    }
    if (input.pressed('KeyF')) {
      player.flying = !player.flying;
      autoWalk.cancel();
      hud.toast(player.flying ? '자유 비행 — E/Space 위, Q 아래, Shift 빠르게' : '자유 비행 끔');
    }
    if (input.pressed('KeyC')) {
      colliderView ??= new ColliderDebugView(scene, physics, player);
      hud.toast(colliderView.toggle() ? '충돌 메시 표시 (분홍: 충돌면, 노랑: 플레이어)' : '충돌 메시 숨김');
    }
    if (input.pressed('KeyR')) {
      autoWalk.cancel();
      player.teleport(spawn.position);
      rig.yaw = spawn.yaw;
      rig.resetPitch();
      hud.toast('시작 위치로 이동');
    }
    if (input.pressed('KeyP')) copySpawn();
  };

  const copySpawn = () => {
    const f = player.feet;
    const r2 = (v) => Math.round(v * 100) / 100;
    const yawDeg = Math.round((((rig.yaw / DEG) % 360) + 360) % 360);
    const text = `"spawn": ${JSON.stringify({ position: [r2(f.x), r2(f.y), r2(f.z)], yaw: yawDeg })}`;
    console.log('[spawn]', text);
    const fail = () => hud.toast(`${text}  (콘솔에도 출력됨)`, 6000);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => hud.toast(`복사됨 → ${text}`, 4000), fail);
    } else fail();
  };

  // ---- 메인 루프 ----
  let last = performance.now();
  let elapsed = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsTime = 0;

  const updateInfo = () => {
    const f = player.feet;
    const flags = [
      autoWalk.active && '자동 이동',
      player.flying && '비행',
      player.inWater && '물속',
      colliderView?.group.visible && '충돌메시',
    ]
      .filter(Boolean)
      .join(' · ');
    hud.setInfo(
      `${worldLabel}\n${rig.mode === 'first' ? '1인칭' : '3인칭'} · ${fps} fps${flags ? ` · ${flags}` : ''}\n` +
        `xyz ${f.x.toFixed(1)}, ${f.y.toFixed(1)}, ${f.z.toFixed(1)}`,
    );
  };

  /**
   * 진행 방향 추적 카메라 (내비게이션처럼 앞쪽이 보이게).
   * 탭 이동 중에는 목적지 방향으로, 조이스틱으로 걷는 중에는 실제 이동 방향으로 카메라를 돌린다.
   * 옆·뒤로 미는 중에는 돌리지 않고(빙글 도는 것 방지), 직접 둘러본 직후에는 rig 가 잠시 쉰다.
   */
  const followCamera = (dt) => {
    const F = CAMERA.follow;
    if (player.flying) return;
    if (autoWalk.active) {
      // 가까운 목적지는 약하게, 도착 직전에는 돌리지 않음
      const w = clamp((autoWalk.distance - F.autoWalkNear) / (F.autoWalkFar - F.autoWalkNear), 0, 1);
      rig.follow(autoWalk.headingYaw, dt, {
        lambda: F.autoWalkLambda * w,
        pitch: rig.mode === 'third' ? F.autoWalkPitchDeg * DEG : null,
        pitchLambda: F.pitchLambda * w,
      });
      return;
    }
    if (rig.mode !== 'third' || player.speed < F.minSpeed) return;
    const vm = input.virtualMove;
    const viaStick = Math.hypot(vm.x, vm.y) > 0.1;
    const lambda = viaStick ? F.stickLambda : F.keyboard ? F.keyboardLambda : 0;
    if (lambda <= 0 || !input.hasManualMove) return;
    const sideDeg = Math.abs(Math.atan2(input.moveX, input.moveY)) / DEG; // 스틱이 앞에서 벗어난 각도
    const weight = clamp((F.stickStopDeg - sideDeg) / (F.stickStopDeg - F.stickFullDeg), 0, 1);
    if (weight <= 0) return;
    const v = player.velocity;
    rig.follow(Math.atan2(-v.x, -v.z), dt, { lambda: lambda * weight });
  };

  /** 한 프레임 분량의 시뮬레이션 (입력 → 물리 → 캐릭터 → 카메라). 렌더링은 하지 않음 */
  const simulate = (dt) => {
    elapsed += dt;
    const look = input.consumeLook();
    rig.look(look.x, look.y);
    rig.zoom(input.consumeWheel());
    if (input.enabled) handleActions();

    autoWalk.update(dt);
    player.update(dt, input, rig.yaw, rig.pitch);
    physics.step(dt);
    player.syncFromPhysics();
    if (player.feet.y < world.killY) {
      autoWalk.cancel();
      player.teleport(spawn.position);
      hud.toast('떨어져서 시작 위치로 돌아왔어요');
    }

    followCamera(dt);
    rig.update(dt, player);

    // 캐릭터는 이동 방향을 바라봄 (1인칭에서는 숨김)
    if (rig.mode === 'first') {
      characterYaw = rig.yaw + Math.PI;
    } else if (Math.hypot(player.velocity.x, player.velocity.z) > 0.3) {
      characterYaw = dampAngle(characterYaw, Math.atan2(player.velocity.x, player.velocity.z), 12, dt);
    }
    character.object3d.position.set(player.feet.x, rig.smoothY ?? player.feet.y, player.feet.z);
    character.object3d.rotation.y = characterYaw;
    character.object3d.visible = rig.mode === 'third' && rig.tpCurrent > 0.7;
    charState.speed = player.speed;
    charState.running = player.running;
    charState.grounded = player.grounded || player.flying;
    charState.airTime = player.airTime;
    charState.verticalSpeed = player.velocity.y;
    charState.inWater = player.inWater;
    character.update(dt, charState);

    // 달릴 때 시야각 살짝 넓힘
    const fovTarget =
      CAMERA.fov +
      (rig.mode === 'first' && player.running && player.speed > PLAYER.walkSpeed * 1.15 ? CAMERA.runFovBoost : 0);
    if (Math.abs(camera.fov - fovTarget) > 0.01) {
      camera.fov += (fovTarget - camera.fov) * dampFactor(6, dt);
      camera.updateProjectionMatrix();
    }

    world.update?.(dt, elapsed, { camera, focus: player.feet });
    colliderView?.update(rig.mode === 'third');
    input.endFrame();
  };

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const rawDt = (now - last) / 1000;
    last = now;
    simulate(Math.min(rawDt, 0.05));
    renderer.render(scene, camera);

    fpsFrames++;
    fpsTime += rawDt;
    if (fpsTime >= 0.5) {
      fps = Math.round(fpsFrames / fpsTime);
      fpsFrames = 0;
      fpsTime = 0;
      updateInfo();
    }
  });

  /** 디버그/테스트용: 화면 갱신과 상관없이 seconds 만큼 시뮬레이션을 고정 간격으로 진행 */
  const step = (seconds, h = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += h) simulate(h);
  };

  hud.hideLoading();
  hud.showStart(`${worldLabel} · 캐릭터: ${characterDef.name ?? characterDef.id}`);
  updateInfo();

  // 콘솔 디버깅용 핸들 (예: templeWalk.player.teleport(new templeWalk.THREE.Vector3(0, 10, 0)))
  window.templeWalk = {
    THREE, scene, camera, renderer, physics, world, player, rig, autoWalk, character, input, touch, hud, spawn, step,
    ready: true,
  };
}

/** 월드가 spawn 위치를 주지 않았거나 findGround 를 요청하면 레이캐스트로 바닥을 찾는다 */
function resolveSpawn(world, physics, player) {
  const s = world.spawn ?? {};
  const yaw = s.yaw ?? 0;
  if (s.position && !s.findGround) return { position: s.position.clone(), yaw };
  const x = s.position?.x ?? 0;
  const z = s.position?.z ?? 0;
  const fromY = (s.position?.y ?? 0) + 1.6;
  let y = physics.findGround(x, z, fromY, 60, player.collider);
  if (y === null) y = physics.findGround(x, z, 2000, 4000, player.collider);
  return { position: new THREE.Vector3(x, (y ?? 0) + 0.05, z), yaw };
}

function navigate(changes) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined) p.delete(k);
    else p.set(k, v);
  }
  location.search = p.toString();
}
