// 范围施法引擎（AoE）：球状 / 柱状 / 锥状 / 线状 / 立方五类效应在 2D 沙盘格子上的范围计算。
// 规则基线（不全书检索原文）：
// - PHB 2014 第十章「效应范围」：锥状在距源点 d 处宽度 = d；球状/柱状源点包含在效应内，
//   锥状/线状/立方默认不含源点（施法者可选包含）；线状由法术说明线长与线宽；立方给出边长。
// - DMG「效应范围转格子」：以方格一角的顶点为原点按通常规则实行；圆形覆盖至少半个方格 → 整格受影响。
// - XGtE「格子地图上的效应范围」：模板法（方格有任何部分被模板覆盖即命中）与标记物法
//   （圆形→边长 2R 的方形；锥状→逐行放置标记，首行与源点格垂直相邻或对角相邻，每行多放一个）。
// 两种方法结果不同（XGtE 明言不混用），由调用方按 method 选择。
// 纯函数模块：零 store / DOM 依赖（同 battleGeometry.ts 约定）；1 格 = 5 尺；col 向东 row 向南。

import type { Bearing, GridBounds, GridPos } from './battleGeometry';
import type { Spell } from '@/types/spell';

export type AoeShape = 'sphere' | 'cylinder' | 'cone' | 'line' | 'cube';

/** 计算方法：template = DMG/XGtE 模板法（几何覆盖判定）；token = XGtE 标记物法（离散格子规则） */
export type AoeMethod = 'template' | 'token';

export interface AoeSpec {
  shape: AoeShape;
  /** 球状/柱状半径（尺） */
  radiusFt?: number;
  /** 柱状高度（尺）。2D 地面沙盘上高度只影响竖直维（飞行单位），不改变格子集合，仅随结果记录 */
  heightFt?: number;
  /** 锥状/线状长度（尺） */
  lengthFt?: number;
  /** 线状宽度（尺），缺省 5 尺 */
  widthFt?: number;
  /** 立方边长（尺） */
  sideFt?: number;
}

export interface AoeQuery {
  spec: AoeSpec;
  /** 原点格：自身施法 = 施法者所在格；指点施法 = DM 所选点所在格 */
  origin: GridPos;
  /** 锥/线/立方朝向；球/柱忽略；'same' 按 E 兜底 */
  direction: Bearing;
  /** true = 源点为施法者自身：锥/线/立方默认不含施法者格（PHB）；球/柱恒含源点格 */
  selfOriginated?: boolean;
  /** 沙盘边界：越界格丢弃 */
  bounds?: GridBounds;
}

export interface AoeResult {
  cells: GridPos[];
  method: AoeMethod;
  spec: AoeSpec;
  /** 规则出处与判定口径说明（写战斗日志用） */
  note: string;
}

export const AOE_SHAPE_LABELS: Record<AoeShape, string> = {
  sphere: '球状',
  cylinder: '柱状',
  cone: '锥状',
  line: '线状',
  cube: '立方',
};

const FEET_PER_CELL = 5;

/** 8 方位整步向量（标记物法用；与 battleGeometry.bearingDelta 同构，本地复制以保持本模块零运行时依赖） */
const INT_DIR: Record<Bearing, { dc: number; dr: number }> = {
  N: { dc: 0, dr: -1 },
  NE: { dc: 1, dr: -1 },
  E: { dc: 1, dr: 0 },
  SE: { dc: 1, dr: 1 },
  S: { dc: 0, dr: 1 },
  SW: { dc: -1, dr: 1 },
  W: { dc: -1, dr: 0 },
  NW: { dc: -1, dr: -1 },
  same: { dc: 1, dr: 0 },
};

/** 单位向量：轴向长度 1，对角按真实几何归一（模板法是几何判定，斜向锥/线必须用真实角度） */
function unitVec(b: Bearing): { x: number; y: number } {
  const d = INT_DIR[b];
  const len = d.dc !== 0 && d.dr !== 0 ? Math.SQRT1_2 : 1;
  return { x: d.dc * len, y: d.dr * len };
}

/** 立方体按规则恒为轴对齐（PHB：边长沿方格），对角朝向吸附到东西轴 */
function orthogonalOf(b: Bearing): Bearing {
  switch (b) {
    case 'NE': case 'SE': return 'E';
    case 'NW': case 'SW': return 'W';
    case 'same': return 'E';
    default: return b;
  }
}

// ======================
// 解析：从法术描述文本识别范围形状（措辞统计自 PHB 中文译本，如
// 「半径20尺的火球」「20尺半径球状范围」「长100尺宽5尺的线状」）
// ======================

/** 数字提取容差：形状关键词与尺寸数字之间的最大字符距离 */
const PROXIMITY = 10;

function numNear(text: string, index: number, before = true): number | null {
  const window = before ? text.slice(Math.max(0, index - PROXIMITY), index) : text.slice(index, index + PROXIMITY);
  const m = window.match(/(\d+)\s*尺/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * 从法术描述解析 AoE 规格；识别失败返回 null（调用方回退单体目标流程）。
 * 优先级：柱状 → 立方 → 线状 → 锥状 → 球状（球状关键词最泛，最后兜底）。
 */
export function parseAoeSpec(description: string | undefined): AoeSpec | null {
  const text = (description ?? '').replace(/\s+/g, '');
  if (!text) return null;

  const cylShape = text.search(/柱状|柱形/);
  if (cylShape !== -1) {
    const radius = numNear(text.slice(0, cylShape + PROXIMITY), cylShape)
      ?? numNear(text, text.search(/半径/), false);
    const heightMatch = text.match(/高\s*(\d+)\s*尺/);
    if (radius) {
      return { shape: 'cylinder', radiusFt: radius, heightFt: heightMatch ? parseInt(heightMatch[1], 10) : undefined };
    }
  }

  const cubeMatch = text.match(/(\d+)\s*尺(?:的)?立方(?:体)?/);
  if (cubeMatch) return { shape: 'cube', sideFt: parseInt(cubeMatch[1], 10) };

  const lineShape = text.search(/线状|线形/);
  if (lineShape !== -1) {
    const lenWidth = text.match(/长\s*(\d+)\s*尺[^。]{0,10}?宽\s*(\d+)\s*尺/);
    if (lenWidth) {
      return { shape: 'line', lengthFt: parseInt(lenWidth[1], 10), widthFt: parseInt(lenWidth[2], 10) };
    }
    const length = numNear(text, lineShape);
    if (length) return { shape: 'line', lengthFt: length, widthFt: 5 };
  }

  const coneShape = text.search(/锥状|锥形/);
  if (coneShape !== -1) {
    const length = numNear(text, coneShape) ?? numNear(text, coneShape, false);
    if (length) return { shape: 'cone', lengthFt: length };
  }

  const sphereShape = text.search(/球形|球状|火球|球体|的球|半圆/);
  if (sphereShape !== -1) {
    const radius = numNear(text, sphereShape) ?? numNear(text, sphereShape, false);
    if (radius) return { shape: 'sphere', radiusFt: radius };
  }

  return null;
}

/** 法术便捷入口：描述解析失败返回 null */
export function spellAoeSpec(spell: Pick<Spell, 'description'>): AoeSpec | null {
  return parseAoeSpec(spell.description);
}

// ======================
// 模板法几何原语：Sutherland–Hodgman 凸多边形裁剪取正面积重叠。
// 面积 > 0 即命中（XGtE 模板法），零面积接触（共边/擦角）视为未覆盖 —— 保证锥/线/立方默认不含源点格；
// 顶点落在格边而多边形主体伸入格内时按正面积命中（严格点/边判定会漏掉这类切向构型）。
// ======================

interface Pt { x: number; y: number }

function crossOf(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** 凸多边形与格子正面积重叠判定：裁剪到格子矩形后以鞋带公式取面积 */
function polyOverlapsCell(poly: Pt[], col: number, row: number): boolean {
  // 格子四边按内旋方向排列，内侧半平面 cross >= 0
  const planes: [Pt, Pt][] = [
    [{ x: col, y: row }, { x: col + 1, y: row }],
    [{ x: col + 1, y: row }, { x: col + 1, y: row + 1 }],
    [{ x: col + 1, y: row + 1 }, { x: col, y: row + 1 }],
    [{ x: col, y: row + 1 }, { x: col, y: row }],
  ];
  let out = poly;
  for (const [a, b] of planes) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const dCur = crossOf(a, b, cur);
      const dPrev = crossOf(a, b, prev);
      if (dCur >= 0) {
        if (dPrev < 0) out.push(linePlaneIntersect(prev, cur, dPrev, dCur));
        out.push(cur);
      } else if (dPrev >= 0) {
        out.push(linePlaneIntersect(prev, cur, dPrev, dCur));
      }
    }
    if (out.length < 3) return false;
  }
  let area2 = 0;
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    const n = out[(i + 1) % out.length];
    area2 += p.x * n.y - n.x * p.y;
  }
  return Math.abs(area2) / 2 > 1e-9;
}

function linePlaneIntersect(p1: Pt, p2: Pt, d1: number, d2: number): Pt {
  const t = d1 / (d1 - d2);
  return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
}

// ======================
// 格子枚举
// ======================

function clampCells(cells: GridPos[], bounds?: GridBounds): GridPos[] {
  const seen = new Set<string>();
  const out: GridPos[] = [];
  for (const c of cells) {
    if (bounds && (c.col < 0 || c.row < 0 || c.col >= bounds.cols || c.row >= bounds.rows)) continue;
    const key = `${c.col},${c.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** 模板法原点：格中心；自身锥/线/立方前移半格（落在格边中点/角点，与施法者格零面积接触 → 默认不含源点格） */
function templateOriginPoint(q: AoeQuery): Pt {
  const center = { x: q.origin.col + 0.5, y: q.origin.row + 0.5 };
  if (q.selfOriginated && (q.spec.shape === 'cone' || q.spec.shape === 'line' || q.spec.shape === 'cube')) {
    const d = INT_DIR[q.spec.shape === 'cube' ? orthogonalOf(q.direction) : q.direction];
    return { x: center.x + d.dc * 0.5, y: center.y + d.dr * 0.5 };
  }
  return center;
}

/** DMG「圆形覆盖至少半格算整格」的确定性渲染：格心到圆心距离 ≤ 半径（与 πR² 面积吻合，见引擎注释） */
function templateCircleCells(q: AoeQuery, radiusCells: number): GridPos[] {
  const o = templateOriginPoint(q);
  const cells: GridPos[] = [];
  const span = Math.ceil(radiusCells) + 1;
  for (let row = q.origin.row - span; row <= q.origin.row + span; row++) {
    for (let col = q.origin.col - span; col <= q.origin.col + span; col++) {
      const cx = col + 0.5 - o.x;
      const cy = row + 0.5 - o.y;
      if (Math.sqrt(cx * cx + cy * cy) <= radiusCells + 1e-9) cells.push({ col, row });
    }
  }
  return cells;
}

/** 模板法锥/线/立方：凸多边形（三角形/矩形）与格子正面积重叠判定 */
function templatePolyCells(q: AoeQuery, poly: Pt[], bbox: number): GridPos[] {
  const cells: GridPos[] = [];
  const minCol = Math.floor(Math.min(...poly.map(p => p.x))) - bbox;
  const maxCol = Math.ceil(Math.max(...poly.map(p => p.x))) + bbox;
  const minRow = Math.floor(Math.min(...poly.map(p => p.y))) - bbox;
  const maxRow = Math.ceil(Math.max(...poly.map(p => p.y))) + bbox;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (polyOverlapsCell(poly, col, row)) cells.push({ col, row });
    }
  }
  return cells;
}

function templateCells(q: AoeQuery): GridPos[] {
  const { spec } = q;
  const dir = q.spec.shape === 'cube' ? orthogonalOf(q.direction) : q.direction;
  const u = unitVec(dir);
  const perp = { x: -u.y, y: u.x };
  const o = templateOriginPoint(q);

  switch (spec.shape) {
    case 'sphere': {
      if (!spec.radiusFt) return [];
      return templateCircleCells(q, spec.radiusFt / FEET_PER_CELL);
    }
    case 'cylinder': {
      // 柱状 2D 投影 = 半径圆（高度只作用于竖直维）
      if (!spec.radiusFt) return [];
      return templateCircleCells(q, spec.radiusFt / FEET_PER_CELL);
    }
    case 'cone': {
      // PHB：宽度在距源点 d 处 = d → 半角 atan(1/2)，端点半宽 = L/2
      const L = (spec.lengthFt ?? 0) / FEET_PER_CELL;
      if (L <= 0) return [];
      const tip = { x: o.x + u.x * L, y: o.y + u.y * L };
      const half = L / 2;
      return templatePolyCells(q, [o, { x: tip.x + perp.x * half, y: tip.y + perp.y * half }, { x: tip.x - perp.x * half, y: tip.y - perp.y * half }], 1);
    }
    case 'line': {
      const L = (spec.lengthFt ?? 0) / FEET_PER_CELL;
      const halfW = Math.max(0.5, (spec.widthFt ?? FEET_PER_CELL) / FEET_PER_CELL / 2);
      if (L <= 0) return [];
      const far = { x: o.x + u.x * L, y: o.y + u.y * L };
      return templatePolyCells(q, [
        { x: o.x + perp.x * halfW, y: o.y + perp.y * halfW },
        { x: far.x + perp.x * halfW, y: far.y + perp.y * halfW },
        { x: far.x - perp.x * halfW, y: far.y - perp.y * halfW },
        { x: o.x - perp.x * halfW, y: o.y - perp.y * halfW },
      ], 1);
    }
    case 'cube': {
      const S = (spec.sideFt ?? 0) / FEET_PER_CELL;
      if (S <= 0) return [];
      const orth = orthogonalOf(q.direction);
      const ou = unitVec(orth);
      const operp = { x: -ou.y, y: ou.x };
      const oc = { x: q.origin.col + 0.5, y: q.origin.row + 0.5 };
      // 原点格边中点起沿朝向推进 S 格，垂直方向以原点格中心为基准对称展开 S 格
      const near = { x: oc.x + ou.x * 0.5, y: oc.y + ou.y * 0.5 };
      const far = { x: near.x + ou.x * S, y: near.y + ou.y * S };
      const halfS = S / 2;
      return templatePolyCells(q, [
        { x: near.x + operp.x * halfS, y: near.y + operp.y * halfS },
        { x: far.x + operp.x * halfS, y: far.y + operp.y * halfS },
        { x: far.x - operp.x * halfS, y: far.y - operp.y * halfS },
        { x: near.x - operp.x * halfS, y: near.y - operp.y * halfS },
      ], 1);
    }
  }
}

// ======================
// 标记物法（XGtE）：圆→边长 2R 方形；锥→逐行递增标记；线→直线/对角阶梯；立方→ S×S 方块
// ======================

function tokenCells(q: AoeQuery): GridPos[] {
  const { spec } = q;
  const origin = q.origin;

  switch (spec.shape) {
    case 'sphere':
    case 'cylinder': {
      // XGtE：圆形范围转边长 2R 的方形（焰击术 半径10尺=2格 → 4×4）；源点格含于效应
      const R = Math.max(1, Math.round((spec.radiusFt ?? 0) / FEET_PER_CELL));
      const cells: GridPos[] = [];
      for (let dy = -R; dy < R; dy++) {
        for (let dx = -R; dx < R; dx++) cells.push({ col: origin.col + dx, row: origin.row + dy });
      }
      return cells;
    }
    case 'cone': {
      // XGtE：行数 = 长度÷5，第 k 行 k 个标记；首行与源点格垂直相邻或对角相邻
      const L = Math.max(1, Math.floor((spec.lengthFt ?? 0) / FEET_PER_CELL));
      const d = INT_DIR[q.direction];
      const cells: GridPos[] = [];
      if (d.dc !== 0 && d.dr !== 0) {
        // 对角首行：第 k 行 = 与源点格对角前沿线上的 k 格（与前行共边），a+b = k+1
        for (let k = 1; k <= L; k++) {
          for (let a = 1; a <= k; a++) {
            cells.push({ col: origin.col + a * d.dc, row: origin.row + (k + 1 - a) * d.dr });
          }
        }
      } else {
        // 垂直首行：第 k 行 k 格；规则允许新增标记放任一端，引擎固定按 −⌊(k−1)/2⌋…⌈(k−1)/2⌉ 对称展开
        const perpD = d.dc !== 0 ? { dc: 0, dr: 1 } : { dc: 1, dr: 0 };
        for (let k = 1; k <= L; k++) {
          const oMin = -Math.floor((k - 1) / 2);
          const oMax = Math.ceil((k - 1) / 2);
          for (let o = oMin; o <= oMax; o++) {
            cells.push({ col: origin.col + d.dc * k + perpD.dc * o, row: origin.row + d.dr * k + perpD.dr * o });
          }
        }
      }
      return cells;
    }
    case 'line': {
      // XGtE 原文「线状可从源点垂直或对角延伸」（转码文件在此截断，图 2.6 不可考）：
      // 垂直 = 直线逐格；对角 = 每格 5 尺的阶梯折线（5e 默认对角 1 格 = 5 尺）；
      // 源点默认不含 → 从相邻格起步
      const Lsteps = Math.max(1, Math.floor((spec.lengthFt ?? 0) / FEET_PER_CELL));
      const d = INT_DIR[q.direction];
      const cells: GridPos[] = [];
      if (d.dc !== 0 && d.dr !== 0) {
        for (let k = 1; k <= Lsteps; k++) cells.push({ col: origin.col + d.dc * k, row: origin.row + d.dr * k });
      } else {
        const w = Math.max(1, Math.round((spec.widthFt ?? FEET_PER_CELL) / FEET_PER_CELL));
        const perpD = d.dc !== 0 ? { dc: 0, dr: 1 } : { dc: 1, dr: 0 };
        const oMin = -Math.floor((w - 1) / 2);
        const oMax = Math.ceil((w - 1) / 2);
        for (let k = 1; k <= Lsteps; k++) {
          for (let o = oMin; o <= oMax; o++) {
            cells.push({ col: origin.col + d.dc * k + perpD.dc * o, row: origin.row + d.dr * k + perpD.dr * o });
          }
        }
      }
      return cells;
    }
    case 'cube': {
      const S = Math.max(1, Math.floor((spec.sideFt ?? 0) / FEET_PER_CELL));
      const cells: GridPos[] = [];
      if (q.selfOriginated) {
        // 自身立方：沿朝向轴前移 1..S（不含施法者格），垂直轴以原点格为基准对称展开
        const d = INT_DIR[orthogonalOf(q.direction)];
        const perpD = d.dc !== 0 ? { dc: 0, dr: 1 } : { dc: 1, dr: 0 };
        const oMin = -Math.floor((S - 1) / 2);
        const oMax = Math.ceil((S - 1) / 2);
        for (let f = 1; f <= S; f++) {
          for (let o = oMin; o <= oMax; o++) {
            cells.push({ col: origin.col + d.dc * f + perpD.dc * o, row: origin.row + d.dr * f + perpD.dr * o });
          }
        }
      } else {
        // 指点立方：原点格为方块一角（DM 可在调用前自行平移原点格摆位）
        for (let dy = 0; dy < S; dy++) {
          for (let dx = 0; dx < S; dx++) cells.push({ col: origin.col + dx, row: origin.row + dy });
        }
      }
      return cells;
    }
  }
}

// ======================
// 引擎入口
// ======================

/** 五类形状范围 → 受影响格子集合 */
export function computeAoeCells(q: AoeQuery, method: AoeMethod = 'template'): AoeResult {
  const raw = method === 'token' ? tokenCells(q) : templateCells(q);
  const cells = clampCells(raw, q.bounds);
  const note = method === 'token'
    ? 'XGtE 标记物法：每 5 尺范围一格标记'
    : 'DMG 网格规则 + XGtE 模板法：原点取格点，覆盖即命中；圆形按「覆盖至少半格」以格心距离 ≤ 半径判定';
  return { cells, method, spec: q.spec, note };
}

export interface AoeTargetRef {
  id: string;
  /** 参战者所在格；未放置（null）恒不命中 */
  pos: GridPos | null | undefined;
}

/** 按范围结果过滤命中目标（大型生物多格占位由调用方展开为多格 pos 后聚合） */
export function filterAoeTargets<T extends AoeTargetRef>(result: AoeResult, targets: T[]): T[] {
  const keys = new Set(result.cells.map(c => `${c.col},${c.row}`));
  return targets.filter(t => t.pos && keys.has(`${t.pos.col},${t.pos.row}`));
}

/** 结果格子键集合（与 zoneRules.getZonesAtCell 的 "col,row" 键格式一致，便于未来落区域） */
export function aoeCellKeys(result: AoeResult): Set<string> {
  return new Set(result.cells.map(c => `${c.col},${c.row}`));
}
