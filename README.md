# Temple Walk

AI로 만든 3D 월드(World Labs Marble)를 웹에서 걸어 다니는 뷰어입니다. 기본은 3인칭이고 1인칭으로 바꿀 수 있습니다.

지금은 절차 생성한 **테스트 월드**(산으로 둘러싸인 계곡, 강과 다리, 마을, 석축 위 탑과 법당, 정자)와 **테스트 마네킹 캐릭터**로 동작합니다. 집·망루·법당은 속이 비어 있어 문으로 들어갈 수 있고, 창문 개구부와 천장 램프가 있습니다 (`structures.js`의 `makeShell` / `makeDoor`). 실내 포인트 라이트는 2개만 두고 플레이어에게 가장 가까운 램프로 옮겨 씁니다. Marble 월드와 캐릭터 GLB는 파일을 넣고 JSON 항목 하나만 추가하면 붙습니다.

- Vite 8 + three.js r187 (순수 three.js) + Spark 2.4 (Gaussian splat 렌더러) + Rapier 0.21 (물리·충돌)
- 가고 싶은 곳을 탭/클릭하면 캐릭터가 그곳까지 걸어가고, 카메라는 내비게이션처럼 진행 방향 앞쪽을 비춥니다.
- PC: WASD + 마우스. 모바일: 가상 조이스틱 + 화면 드래그.

## 실행

Node.js **20.19 이상** 또는 **22.12 이상**이 필요합니다 (`node -v`로 확인).

```bash
npm install
npm run dev        # 브라우저가 자동으로 열림 (http://localhost:5173)
```

배포용: `npm run build` → `dist/` 폴더를 정적 호스팅에 올리면 됩니다. `npm run preview`로 미리 볼 수 있습니다.

## 조작

| 키 | 동작 |
|---|---|
| 클릭 | 시작 (마우스 잠금). 시작 후에는 조준점이 가리키는 곳으로 걸어가기 |
| W A S D / 방향키 | 이동 (걸어가는 중이면 취소) |
| 마우스 | 둘러보기 |
| Shift | 달리기 |
| Space | 점프 |
| V | 1인칭 ↔ 3인칭 (3인칭에서 캐릭터가 보임) |
| 휠 | 3인칭 카메라 거리 |
| Esc | 마우스 해제 (메뉴) |
| F | 자유 비행 — E/Space 위, Q 아래, Shift 빠르게 |
| C | 충돌 메시 보기 (분홍: 충돌면, 노랑: 플레이어 캡슐) |
| R | 시작 위치로 |
| P | 현재 위치·방향을 `spawn` 값으로 클립보드에 복사 |

한글 입력 상태에서도 키가 그대로 동작합니다 (물리 키 위치 기준).

### 모바일

| 터치 | 동작 |
|---|---|
| 화면 아무 곳이나 탭 | 그곳으로 걸어가기 (목적지에 링이 표시됨. 조이스틱을 밀면 취소) |
| 화면 왼쪽을 누르고 밀기 | 이동 (닿은 자리에 조이스틱이 생기고, 미는 만큼 빨라짐) |
| 조이스틱 링 밖으로 더 밀기 | 달리기 (손잡이가 주황색으로 바뀜) |
| 화면 오른쪽 드래그 | 둘러보기 |
| 점프 버튼 | 점프 |
| 시점 버튼 | 1인칭 ↔ 3인칭 |
| 메뉴 버튼 | 시작 화면으로 |

조이스틱 크기, 달리기 경계, 드래그 감도는 `src/config.js`의 `TOUCH`에서 바꿉니다.

### 탭해서 걸어가기 · 진행 방향 카메라

- 탭(클릭)한 화면 지점에서 카메라 방향으로 레이캐스트해 바닥을 찾고, 그곳을 목적지로 잡습니다. 벽이나 나무를 탭하면 그 앞의 바닥으로 갑니다.
- 길은 격자 A*(`src/player/navGrid.js`)로 찾습니다. 미리 만든 내비메시 없이 탭할 때마다 물리 월드에 레이캐스트로 물어보므로 Marble 월드에서도 그대로 동작합니다. 물(수면 아래)·낭떠러지·벽·지붕은 피하고 다리와 문으로 돌아갑니다. 강 한가운데나 지붕처럼 닿을 수 없는 곳을 탭하면 갈 수 있는 가장 가까운 곳까지만 가고 마커도 그곳에 찍힙니다.
- 멀면 달리다가 가까워지면 걷고, 막혀서 1초 넘게 가까워지지 않으면 멈춥니다. 탐색 비용은 보통 수십 ms 이고, 격자 간격·허용 턱 높이 등은 `AUTOWALK.nav`에서 바꿉니다.
- 걷는 동안 카메라는 캐릭터 뒤(진행 방향)로 천천히 돌아가 앞쪽이 보이게 합니다. 드래그/마우스로 직접 둘러보면 잠시 멈췄다가 다시 따라갑니다.
- 조이스틱으로 걸을 때도 3인칭에서는 같은 방식으로 따라갑니다. 옆이나 뒤로 미는 동안에는 돌리지 않습니다 (뒤로 걸을 때 카메라가 빙글 도는 것 방지). PC의 WASD 이동은 마우스가 카메라를 잡고 있으므로 기본으로 따라가지 않습니다 (`CAMERA.follow.keyboard`).
- 거리·속도·감도는 `src/config.js`의 `AUTOWALK`와 `CAMERA.follow`에서 바꿉니다. 처음부터 1인칭으로 열려면 `DEFAULT_VIEW`를 `'first'`로 하거나 `?view=first`를 붙입니다.

## Marble 월드 붙이기

1. Marble에서 월드를 만들고 내보냅니다(Export).
   - Splat: `.spz` 권장 (약 2M / 500k splat 중 아무거나). `.ply`도 됩니다.
   - Collider mesh: `.glb`
   - (선택) 360 panorama `.png`
2. `public/worlds/<이름>/` 폴더에 넣습니다.
   ```
   public/worlds/my-temple/world.spz
   public/worlds/my-temple/collider.glb
   ```
3. `public/worlds/worlds.json`에 항목을 추가합니다. `default`를 바꾸면 처음부터 그 월드로 열립니다.
   ```json
   {
     "default": "my-temple",
     "worlds": [
       { "id": "test", "name": "테스트 월드", "type": "procedural" },
       {
         "id": "my-temple",
         "name": "우리 절",
         "type": "marble",
         "splat": "worlds/my-temple/world.spz",
         "collider": "worlds/my-temple/collider.glb"
       }
     ]
   }
   ```
4. 시작 화면의 월드 선택에서 고르거나 `?world=my-temple`로 엽니다.

등록하기 전에 바로 열어 보려면 URL에 경로를 넣으면 됩니다.
`http://localhost:5173/?splat=worlds/my-temple/world.spz&collider=worlds/my-temple/collider.glb`

### 선택 항목

| 항목 | 설명 | 기본값 |
|---|---|---|
| `spawn` | `{"position": [x, y, z], "yaw": 도}`. 원하는 곳에 가서 **P**를 누르면 이 형식 그대로 복사됨 | 원점 아래 바닥을 자동으로 찾음 |
| `transform` | 월드 전체의 `position`, `rotation`(도), `scale`. 캐릭터에 비해 월드가 작거나 크면 `scale` 조절 | 원본 그대로 |
| `splatRotation` | splat만 회전(도). 위아래가 뒤집혀 보이면 `[180, 0, 0]` | `.spz`는 `[0,0,0]`, `.ply`는 `[180,0,0]` |
| `colliderRotation` | collider만 회전(도) | `[0, 0, 0]` |
| `panorama` | 배경 360 이미지 경로 | 없음 (어두운 배경) |
| `lod` | Spark LoD (기기 성능에 맞춰 splat 수 조절) | `true` |
| `killY` | 이 높이 아래로 떨어지면 시작 위치로 | collider 최저점 − 30 |

C 키로 충돌 메시를 겹쳐 보면서 맞추면 편합니다. collider가 없으면 y = 0 평면을 바닥으로 씁니다.

Marble 샘플(.spz + collider .glb, Draco 압축 포함)로 확인해 보니 회전 보정 없이 바로 맞았고, 크기도 대략 미터 단위였습니다.

## 캐릭터 에셋 붙이기

지금은 도형으로 만든 마네킹(`src/character/testCharacter.js`)이 절차 애니메이션으로 걷고 뜁니다. 애니메이션이 들어 있는 GLB(Mixamo → Blender → GLB, Ready Player Me 등)로 바꾸려면:

1. `public/characters/<이름>/hero.glb`에 넣습니다.
2. `public/characters/characters.json`에 항목을 추가합니다.
   ```json
   {
     "default": "hero",
     "characters": [
       { "id": "mannequin", "name": "테스트 마네킹", "type": "procedural" },
       {
         "id": "hero",
         "name": "주인공",
         "type": "gltf",
         "url": "characters/hero/hero.glb",
         "height": 1.75,
         "clips": { "idle": "Idle", "walk": "Walking", "run": "Running", "jump": "Jump", "fall": "Falling" }
       }
     ]
   }
   ```

- `clips`를 생략하면 이름에 idle / walk / run / jump / fall이 들어간 클립을 자동으로 찾습니다. 없는 동작은 비슷한 동작으로 대신합니다 (run → walk, fall → jump).
- `height`: 이 키에 맞춰 자동으로 크기를 맞춥니다. `scale`을 주면 그 값을 그대로 씁니다.
- `yaw`: 모델이 정면(+Z)을 보고 있지 않을 때 보정 각도(도).
- `walkAnimSpeed`, `runAnimSpeed`: 클립이 원래 표현하는 이동 속도(m/s). 발 미끄러짐을 줄입니다.
- 걷기 클립에 들어 있는 전진 이동(root motion)은 자동으로 제거합니다. 끄려면 `"stripRootMotion": false`.
- 파일을 못 읽으면 테스트 마네킹으로 대신하고 안내를 띄웁니다.

충돌은 캐릭터 모양이 아니라 캡슐로 처리합니다. 크기는 `src/config.js`의 `PLAYER.radius`, `PLAYER.height`.

## 폴더 구조

```
public/
  worlds/worlds.json           월드 목록 ← Marble 월드 등록
  characters/characters.json   캐릭터 목록 ← GLB 캐릭터 등록
src/
  main.js                      시작 + 메인 루프
  config.js                    걷기 속도·점프·경사·카메라 튜닝 값
  player/
    input.js                   키보드·마우스 + 외부 입력 API
    touchControls.js           모바일 조이스틱·드래그·버튼
    player.js                  Rapier 캐릭터 컨트롤러 (경사·계단·점프·물속 감속)
    autoWalk.js                탭/클릭한 곳으로 걸어가기 (레이캐스트 목적지, 마커, 막힘 감지)
    navGrid.js                 격자 A* 길찾기 (물·벽·낭떠러지 회피, 다리·문 통과)
    cameraRig.js               1인칭/3인칭 카메라, 진행 방향 추적, 벽 충돌, 걸음 흔들림
  character/
    index.js                   캐릭터 공통 규약 + 생성
    testCharacter.js           테스트 마네킹
    gltfCharacter.js           GLB 캐릭터 (AnimationMixer)
  worlds/
    index.js                   월드 공통 규약 + 선택·로딩
    marbleWorld.js             Spark splat + collider GLB
    test/                      절차 생성 테스트 월드 (Marble로 넘어가면 폴더째 지워도 됨)
  physics/physics.js           Rapier 래퍼 (메시 → trimesh 충돌체, 레이캐스트)
  debug/colliderView.js        C 키 충돌 메시 보기
  ui/hud.js                    로딩·시작 화면·토스트
```

월드와 캐릭터는 각각 `src/worlds/index.js`, `src/character/index.js` 맨 위에 적어 둔 규약만 맞추면 다른 종류도 추가할 수 있습니다.

## 모바일 테스트

폰으로 테스트할 때는 `npm run dev -- --host`로 띄우고 같은 Wi-Fi에서 표시되는 Network 주소로 접속하면 됩니다.

터치가 주 입력인 기기를 자동으로 감지해 터치 조작을 켭니다. PC에서 터치 화면을 보려면 `?touch=1`을 붙이면 되고(마우스로 조이스틱과 둘러보기를 하나씩 시험할 수 있음), 터치 기기에서 끄려면 `?touch=0`을 붙이면 됩니다.

## 참고

- URL 옵션: `?world=<id>`, `?character=<id>`, `?view=first`, `?lod=0.5`, `?splat=…&collider=…`, `?touch=1`
- Marble 월드가 무거우면 `?lod=0.5`처럼 splat 수를 줄여 보세요.
- 브라우저 콘솔의 `templeWalk` 객체로 내부 상태를 볼 수 있습니다. 예: `templeWalk.player.feet`, `templeWalk.step(1)`
