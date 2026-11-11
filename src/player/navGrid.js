import * as THREE from 'three';
import { AUTOWALK } from '../config.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();

/**
 * 격자 A* 길찾기 — 미리 만든 내비메시 없이, 탭할 때마다 물리 월드에 직접 물어보며 찾는다.
 *
 * 칸(cell)은 cellSize 간격의 격자. 칸이 걸을 수 있는지는 이웃 칸의 바닥 높이에서 레이캐스트로 판단한다:
 *   - 바닥이 없거나(낭떠러지), 너무 높이 올라가거나(벽·지붕), 너무 떨어지거나, 수면 아래면 막힘
 *   - 다리 상판처럼 물 위에 떠 있는 바닥은 자연스럽게 걸을 수 있는 칸이 된다
 * 칸과 칸 사이는 허리 높이에서 구(sphere)를 쓸어 보내 얇은 벽·난간·문틀을 감지한다
 * (격자보다 얇은 장애물은 바닥 레이캐스트만으로는 못 본다).
 *
 * 목적지에 닿을 수 없으면(물 한가운데, 지붕 위) 갈 수 있는 칸 중 목적지에 가장 가까운 곳까지의 경로를 돌려준다.
 * 결과는 string-pulling 으로 직선 구간을 합쳐 웨이포인트 수를 줄인다.
 */
export class NavGrid {
  /**
   * @param {import('../physics/physics.js').Physics} physics
   * @param {{ excludeCollider?: any, waterLevel?: number | null }} opts
   */
  constructor(physics, { excludeCollider = undefined, waterLevel = null } = {}) {
    this.physics = physics;
    this.exclude = excludeCollider;
    this.waterLevel = waterLevel;
    /** key → 그 칸에서 찾은 바닥 높이들. 다리 위/아래처럼 한 칸에 층이 여럿일 수 있어 기준 높이별로 다시 잰다 */
    this.floors = new Map();
    this.nodes = new Map(); // key → { ix, iz, y }  탐색 중 도달한 칸 (층은 먼저 도달한 쪽)
    this.lastStats = null;
  }

  /**
   * @param {THREE.Vector3} from 출발 (발 위치)
   * @param {THREE.Vector3} to   목적지 (발 위치)
   * @returns {{ points: THREE.Vector3[], reachedGoal: boolean } | null}  null 이면 한 칸도 못 감 (호출자가 직진으로 대체)
   */
  findPath(from, to) {
    const cfg = AUTOWALK.nav;
    const cs = cfg.cellSize;
    const t0 = performance.now();
    this.floors.clear();
    this.nodes.clear();

    const sx = Math.round(from.x / cs);
    const sz = Math.round(from.z / cs);
    const gx = Math.round(to.x / cs);
    const gz = Math.round(to.z / cs);
    const start = { ix: sx, iz: sz, y: from.y };
    const sk = nodeKey(sx, sz, from.y);
    this.nodes.set(sk, start);

    const h = (ix, iz) => octile(ix - gx, iz - gz) * cs * cfg.heuristicWeight;
    const open = new MinHeap();
    const gScore = new Map([[sk, 0]]);
    const parent = new Map();
    const closed = new Set();
    open.push({ k: sk, f: h(sx, sz) });

    let best = start;
    let bestH = h(sx, sz);
    let sinceBest = 0; // 목적지에 더 가까워지지 못한 채 살펴본 칸 수 (닿을 수 없는 곳이면 일찍 포기)
    let expanded = 0;
    let goal = null;

    while (open.size > 0 && expanded < cfg.maxNodes && sinceBest < cfg.stallNodes) {
      const { k: ck } = open.pop();
      if (closed.has(ck)) continue;
      closed.add(ck);
      expanded++;
      const cell = this.nodes.get(ck);
      if (cell.ix === gx && cell.iz === gz && Math.abs(cell.y - to.y) < cfg.maxRise + 0.3) {
        goal = cell;
        break;
      }
      const hc = h(cell.ix, cell.iz);
      if (hc < bestH) {
        bestH = hc;
        best = cell;
        sinceBest = 0;
      } else sinceBest++;
      const g0 = gScore.get(ck);
      for (const [dx, dz] of NEIGHBORS) {
        const nx = cell.ix + dx;
        const nz = cell.iz + dz;
        const next = this._stepTo(cell, nx, nz);
        if (!next) continue;
        // 같은 칸이라도 층(다리 위/아래)이 다르면 다른 노드
        const nk = nodeKey(nx, nz, next.y);
        if (closed.has(nk)) continue;
        if (dx !== 0 && dz !== 0) {
          // 대각선은 양옆 칸도 걸을 수 있어야 함 (물·벽 모서리를 깎아 지나가지 않게)
          if (!this._stepTo(cell, cell.ix + dx, cell.iz) || !this._stepTo(cell, cell.ix, cell.iz + dz)) continue;
        }
        const g1 = g0 + (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * cs;
        if (g1 >= (gScore.get(nk) ?? Infinity)) continue;
        gScore.set(nk, g1);
        parent.set(nk, ck);
        this.nodes.set(nk, next);
        open.push({ k: nk, f: g1 + h(nx, nz) });
      }
    }

    const end = goal ?? best;
    this.lastStats = { expanded, ms: performance.now() - t0, reachedGoal: !!goal };
    if (end === start) return null;

    // 경로 복원 (칸 중심)
    const cells = [];
    for (let k = nodeKey(end.ix, end.iz, end.y); k !== undefined; k = parent.get(k)) cells.push(this.nodes.get(k));
    cells.reverse();
    const raw = cells.map((c) => new THREE.Vector3(c.ix * cs, c.y, c.iz * cs));
    raw[0].copy(from);
    if (goal) raw[raw.length - 1].copy(to);

    return { points: this._smooth(raw), reachedGoal: !!goal };
  }

  /** cell 에서 (nx, nz) 칸으로 한 걸음 갈 수 있으면 그 칸 { ix, iz, y }, 아니면 null */
  _stepTo(cell, nx, nz) {
    const cfg = AUTOWALK.nav;
    const cs = cfg.cellSize;
    const y = this._floorNear(nx, nz, cell.y);
    if (y === null) return null;
    const dy = y - cell.y;
    if (dy > cfg.maxRise || dy < -cfg.maxDrop) return null;
    if (this.waterLevel !== null && y < this.waterLevel - cfg.waterDepth) return null;
    _a.set(cell.ix * cs, cell.y, cell.iz * cs);
    _b.set(nx * cs, y, nz * cs);
    if (!this._sweepClear(_a, _b)) return null;
    return { ix: nx, iz: nz, y };
  }

  /**
   * 칸 (ix, iz) 에서 기준 높이 yRef 로부터 닿을 만한 바닥 높이 (캐시 → 없으면 레이캐스트).
   * 캐시 항목은 { fromY, y } = "fromY 에서 아래로 쏘면 y 에 닿는다". 새 시작점이 fromY 와 y 사이에 있으면
   * 그 사이에 다른 면이 없다는 뜻이므로 같은 답을 재사용할 수 있다 (다리 위/아래처럼 층이 겹쳐도 틀리지 않음).
   */
  _floorNear(ix, iz, yRef) {
    const cfg = AUTOWALK.nav;
    const k = key(ix, iz);
    const fromY = yRef + cfg.maxRise + 0.3;
    let list = this.floors.get(k);
    if (list) {
      for (const e of list) if (fromY <= e.fromY + 1e-6 && fromY >= e.y - 1e-6) return e.y;
    }
    const y = this._floorAt(ix * cfg.cellSize, iz * cfg.cellSize, yRef);
    if (y !== null) {
      if (!list) this.floors.set(k, (list = []));
      list.push({ fromY, y });
    }
    return y;
  }

  /** 기준 높이 yRef 근처에서 (x, z) 의 바닥 높이. 올라설 수 있는 높이 위에서 쏴 내려가 찾는다 */
  _floorAt(x, z, yRef) {
    const cfg = AUTOWALK.nav;
    const fromY = yRef + cfg.maxRise + 0.3;
    const t = this.physics.raycast({ x, y: fromY, z }, { x: 0, y: -1, z: 0 }, cfg.maxRise + 0.3 + cfg.maxDrop + 0.3, this.exclude);
    return t === null ? null : fromY - t;
  }

  /** 허리 높이에서 a→b 로 구를 쓸어 보내 벽·난간·문틀 등에 닿지 않는지 */
  _sweepClear(a, b) {
    const cfg = AUTOWALK.nav;
    _dir.subVectors(b, a);
    const len = _dir.length();
    if (len < 1e-4) return true;
    _dir.divideScalar(len);
    const origin = { x: a.x, y: a.y + cfg.clearanceHeight, z: a.z };
    const hit = this.physics.sphereCast(origin, _dir, len, cfg.clearanceRadius, this.exclude);
    return hit === null;
  }

  /**
   * 두 점 사이를 바로 걸어갈 수 있는지: 허리 높이 스윕 + 중간 바닥이 끊기거나 물·턱이 없는지.
   * 플레이어가 선에서 조금 벗어나 걸어도 되도록 선의 양옆(margin)도 같이 본다.
   */
  segmentClear(p, q, margin = AUTOWALK.nav.clearanceRadius + 0.15) {
    const cfg = AUTOWALK.nav;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const ox = (-dz / len) * margin; // 진행 방향에 수직인 옆 방향
    const oz = (dx / len) * margin;
    for (const side of [0, 1, -1]) {
      _a.set(p.x + ox * side, p.y, p.z + oz * side);
      _b.set(q.x + ox * side, q.y, q.z + oz * side);
      if (!this._sweepClear(_a, _b)) return false;
      const n = Math.max(1, Math.ceil(len / (cfg.cellSize * 0.5)));
      let prevY = p.y;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const y = this._floorAt(_a.x + (_b.x - _a.x) * t, _a.z + (_b.z - _a.z) * t, prevY);
        if (y === null) return false;
        const dy = y - prevY;
        if (dy > cfg.maxRise * 0.6 || dy < -cfg.maxDrop * 0.6) return false;
        if (this.waterLevel !== null && y < this.waterLevel - cfg.waterDepth) return false;
        prevY = y;
      }
    }
    return true;
  }

  /** 같은 방향으로 이어지는 칸들을 하나의 직선으로 합친 뒤, 앞쪽의 가장 먼 점까지 바로 갈 수 있으면 중간 점을 건너뛴다 */
  _smooth(points) {
    if (points.length <= 2) return points;
    // 1) 직선 구간 합치기 — 격자가 한 칸씩 이미 확인한 길이라 안전하다
    const line = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const sameDir = Math.abs((b.x - a.x) - (c.x - b.x)) < 1e-6 && Math.abs((b.z - a.z) - (c.z - b.z)) < 1e-6;
      const flat = Math.abs(c.y - b.y) < 0.25 && Math.abs(b.y - a.y) < 0.25;
      if (!(sameDir && flat)) line.push(b);
    }
    line.push(points[points.length - 1]);
    points = line;
    if (points.length <= 2) return points;
    // 2) string-pulling
    const out = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      while (j > i + 1 && !this.segmentClear(points[i], points[j])) j--;
      out.push(points[j]);
      i = j;
    }
    return out;
  }
}

const NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const key = (ix, iz) => ix * 131071 + iz; // 정수 쌍 → 숫자 키 (|iz| < 65535 가정)
const LEVEL_STEP = 1.5; // 이 높이 이상 차이 나면 같은 칸이라도 다른 층으로 본다
const nodeKey = (ix, iz, y) => key(ix, iz) * 256 + (Math.round(y / LEVEL_STEP) + 128);

function octile(dx, dz) {
  dx = Math.abs(dx);
  dz = Math.abs(dz);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

/** f 가 가장 작은 노드를 꺼내는 이진 힙 */
class MinHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}
