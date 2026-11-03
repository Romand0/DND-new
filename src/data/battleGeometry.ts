/**
 * 沙盘网格几何引擎：8 方位判定 + 强制位移落位规划。
 * 纯函数模块：零 store 访问、零 React/DOM 依赖（design.md P8）。
 * 坐标系与沙盘一致：col 向东增、row 向南增；距离一律切比雪夫（5 尺/格）。
 */

export type Bearing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'same';

/** 方位中文标签（编译器日志与 ForcedMoveDialog 共用） */
export const BEARING_LABELS: Record<Bearing, string> = {
  N: '正北',
  NE: '东北',
  E: '正东',
  SE: '东南',
  S: '正南',
  SW: '西南',
  W: '正西',
  NW: '西北',
  same: '同格',
};

export interface GridPos {
  col: number;
  row: number;
}

export interface GridBounds {
  cols: number;
  rows: number;
}

/**
 * 目标相对参照的 8 方位分类（design.md P1：任意非零 (Δcol,Δrow) 恰落一扇区）。
 * 切比雪夫主轴归属：|dc|>|dr| 取东西轴，|dr|>|dc| 取南北轴，相等取对角。
 */
export function bearing8(from: GridPos, to: GridPos): Bearing {
  const dc = to.col - from.col;
  const dr = to.row - from.row;
  if (dc === 0 && dr === 0) return 'same';
  if (dc === 0) return dr > 0 ? 'S' : 'N';
  if (dr === 0) return dc > 0 ? 'E' : 'W';
  if (Math.abs(dc) === Math.abs(dr)) {
    if (dc > 0) return dr > 0 ? 'SE' : 'NE';
    return dr > 0 ? 'SW' : 'NW';
  }
  if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? 'E' : 'W';
  return dr > 0 ? 'S' : 'N';
}

/** 取反扇区（「远离参照」裁决）；'same' → 'same'（design.md P2 对合） */
export function oppositeBearing(b: Bearing): Bearing {
  switch (b) {
    case 'N': return 'S';
    case 'S': return 'N';
    case 'E': return 'W';
    case 'W': return 'E';
    case 'NE': return 'SW';
    case 'SW': return 'NE';
    case 'SE': return 'NW';
    case 'NW': return 'SE';
    case 'same': return 'same';
  }
}

/**
 * 主方向扇区：主方向及其两个相邻 45° 方向（design.md P3）。
 * 定向原则的约束集——绕行路径每步的方位分类必须落在此集合内。
 */
export function bearingSector(b: Bearing): Bearing[] {
  switch (b) {
    case 'N': return ['NW', 'N', 'NE'];
    case 'NE': return ['N', 'NE', 'E'];
    case 'E': return ['NE', 'E', 'SE'];
    case 'SE': return ['E', 'SE', 'S'];
    case 'S': return ['SE', 'S', 'SW'];
    case 'SW': return ['S', 'SW', 'W'];
    case 'W': return ['SW', 'W', 'NW'];
    case 'NW': return ['W', 'NW', 'N'];
    case 'same': return ['same'];
  }
}

/** 方位 → 单位步向量；'same' → 原地（design.md Data Models） */
export function bearingDelta(b: Bearing): { dc: number; dr: number } {
  switch (b) {
    case 'N': return { dc: 0, dr: -1 };
    case 'NE': return { dc: 1, dr: -1 };
    case 'E': return { dc: 1, dr: 0 };
    case 'SE': return { dc: 1, dr: 1 };
    case 'S': return { dc: 0, dr: 1 };
    case 'SW': return { dc: -1, dr: 1 };
    case 'W': return { dc: -1, dr: 0 };
    case 'NW': return { dc: -1, dr: -1 };
    case 'same': return { dc: 0, dr: 0 };
  }
}

export interface ForcedMoveInput {
  start: GridPos;
  /** 位移主方向（已裁决远离/朝向后；'same' 视为 no-op） */
  bearing: Bearing;
  /** 总格数上限（含绕行步） */
  maxCells: number;
  bounds: GridBounds;
  /** 禁行判定闭包：边界墙 ∪ 规避区 ∪ 其他棋子占用（由调用方组装） */
  isBlocked: (col: number, row: number) => boolean;
}

export interface ForcedMovePath {
  /** 逐格路径（不含起点，含终点） */
  path: GridPos[];
  /** true = 途中被截断（受阻/越界导致未走满 maxCells） */
  truncated: boolean;
}

/**
 * 强制位移计划（编译器产出 → onFlowResolved 消费的待落地记录，design.md Data Models）。
 * 手动入口由 ForcedMoveDialog 产出同构对象——两个入口的数据契约完全一致。
 */
export interface ForcedMovePlanDraft {
  targetId: string;
  originId: string | null;
  bearing: Bearing;
  distanceCells: number;
  avoidCells: string[];
}

/**
 * 落位引擎：限深搜索（design.md 绕行搜索算法）。
 * 状态空间 = 格子 × 深度（≤ 36×54×maxCells），每状态 3 个候选转移（扇区内），
 * 无需 A* 剪枝。目标：≤ maxCells 步内最大化主方向进度（点积），进度并列取步数少者。
 * truncated = path.length < maxCells（走满即未截断；受阻/越界/步数耗尽均视为截断）。
 */
export function planForcedMovePath(input: ForcedMoveInput): ForcedMovePath {
  const { start, bearing, maxCells, bounds, isBlocked } = input;
  const maxSteps = Math.max(0, Math.floor(maxCells));
  if (bearing === 'same' || maxSteps === 0) {
    return { path: [], truncated: false };
  }

  const main = bearingDelta(bearing);
  const sector = bearingSector(bearing);
  // 扇区内扩展顺序：主方向（偏差 0）严格最优先，两个相邻方向（偏差 1）随后。
  // 轴向方位的邻居与主方向点积相同（|切比雪夫点积|=1），必须以偏差角 tie-break，
  // 否则 BFS 先探索的邻居分支会在进度并列时压过直行路径（斜走 bug）。
  const deviationOf = (d: { dc: number; dr: number }): number =>
    d.dc === main.dc && d.dr === main.dr ? 0 : 1;
  const stepDirs = sector
    .filter(s => s !== 'same')
    .map(bearingDelta)
    .sort((a, b) => {
      const da = deviationOf(a);
      const db = deviationOf(b);
      if (da !== db) return da - db;
      const pa = a.dc * main.dc + a.dr * main.dr;
      const pb = b.dc * main.dc + b.dr * main.dr;
      return pb - pa;
    });

  // 进度 = 沿主方向单位向量的点积（切比雪夫轴向投影）
  const progressOf = (p: GridPos): number =>
    (p.col - start.col) * main.dc + (p.row - start.row) * main.dr;

  let best: { path: GridPos[]; progress: number } = { path: [], progress: 0 };
  const visited = new Set<string>([`${start.col},${start.row},0`]);
  // 队列元素：位置、已走步数、路径、路径内格子集（防环：位移中重经同格无意义）
  const queue: { pos: GridPos; steps: number; path: GridPos[]; seen: Set<string> }[] = [
    { pos: start, steps: 0, path: [], seen: new Set<string>([`${start.col},${start.row}`]) },
  ];

  while (queue.length > 0) {
    const cur = queue.shift() as (typeof queue)[number];
    const curProgress = progressOf(cur.pos);

    // 更新最优：进度更大，或进度并列且步数更少（少绕路）
    if (
      cur.path.length > 0 &&
      (curProgress > best.progress ||
        (curProgress === best.progress && cur.path.length < best.path.length))
    ) {
      best = { path: cur.path, progress: curProgress };
    }
    if (cur.steps >= maxSteps) continue;

    for (const d of stepDirs) {
      const nc = cur.pos.col + d.dc;
      const nr = cur.pos.row + d.dr;
      if (nc < 0 || nc >= bounds.cols || nr < 0 || nr >= bounds.rows) continue;
      if (isBlocked(nc, nr)) continue;
      const key = `${nc},${nr}`;
      if (cur.seen.has(key)) continue;
      const nextSeen = new Set(cur.seen);
      nextSeen.add(key);
      const nextPath = [...cur.path, { col: nc, row: nr }];
      const stateKey = `${nc},${nr},${cur.steps + 1}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);
      queue.push({ pos: { col: nc, row: nr }, steps: cur.steps + 1, path: nextPath, seen: nextSeen });
    }
  }

  return {
    path: best.path,
    truncated: best.path.length < maxSteps,
  };
}
