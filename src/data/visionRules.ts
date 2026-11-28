// src/data/visionRules.ts
// 视野系统纯函数层（仿 zoneRules 模式）：掩护几何 / 光照档位 / 感官解析。
// 全部函数无副作用，可被探针直调；几何判定结果仅作 DM 提示，最终裁定在弹窗完成。
import type { Battleground, BattlegroundZone, LightTier } from '@/types/battleground';
import type { CoverTier, CombatantSenses } from '@/types/combat';

export type { LightTier };

export interface CellPos {
  col: number;
  row: number;
}

// =======================
// 掩护
// =======================

/** 掩护对 AC 与敏捷豁免的加值（total 不在加值语义里：直接瞄准被阻断，走弹窗可用性层） */
export const COVER_BONUS: Record<Exclude<CoverTier, 'total'>, number> = {
  half: 2,
  three_quarters: 5,
};

export const COVER_LABELS: Record<CoverTier, string> = {
  half: '半身掩护',
  three_quarters: '四分之三掩护',
  total: '全身掩护',
};

/** 掩护加值（total 返回 0；命中判定外的豁免场景按 ability 过滤在调用方做） */
export function getCoverBonus(tier: CoverTier | null | undefined): number {
  if (tier === 'half') return COVER_BONUS.half;
  if (tier === 'three_quarters') return COVER_BONUS.three_quarters;
  return 0;
}

/** 敏捷豁免场景的掩护加值；其他属性豁免掩护不生效（5e：掩护仅提升 AC 与 Dex 豁免） */
export function getCoverSaveBonus(
  tier: CoverTier | null | undefined,
  ability: string | undefined,
): number {
  if (ability !== 'dexterity') return 0;
  return getCoverBonus(tier);
}

// =======================
// 视线遮挡（paintedCells 墙体几何）
// =======================

function parseCellKey(key: string): CellPos | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(key.trim());
  if (!m) return null;
  const col = parseInt(m[1], 10);
  const row = parseInt(m[2], 10);
  if (isNaN(col) || isNaN(row)) return null;
  return { col, row };
}

/** Bresenham 直线（格中心连线），含两端；返回路径格键序列 */
function lineCells(from: CellPos, to: CellPos): string[] {
  const cells: string[] = [];
  let x0 = from.col;
  let y0 = from.row;
  const x1 = to.col;
  const y1 = to.row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // 防御上限：沙盘最大 54 行，路径不可能超过行列和
  const guard = dx + dy + 1;
  for (let i = 0; i < guard; i++) {
    cells.push(`${x0},${y0}`);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  return cells;
}

/**
 * 攻击者与目标格中心连线是否被墙体（paintedCells）阻断。
 * 中间路径格命中墙体即遮挡；两端所在格的墙体视为依托掩体（计入遮挡提示），
 * 相邻格（切比雪夫距离 1）恒无遮挡（贴脸攻击）。
 */
export function isLosBlocked(
  bg: Pick<Battleground, 'paintedCells'> | null | undefined,
  from: CellPos | null | undefined,
  to: CellPos | null | undefined,
): boolean {
  if (!bg?.paintedCells?.length || !from || !to) return false;
  if (Math.max(Math.abs(from.col - to.col), Math.abs(from.row - to.row)) <= 1) return false;
  const walls = new Set(bg.paintedCells);
  const path = lineCells(from, to);
  // 含中间格与两端格（两端格有墙 = 目标依托掩体/攻击者贴掩体，均为遮挡证据）
  return path.some(key => walls.has(key));
}

/**
 * 几何掩护提示：LOS 被墙体阻断时建议 DM 考虑掩护等级。
 * 格状几何无法区分半身/四分之三（5e 掩护等级是裁定量），只输出「存在遮挡」一级提示。
 */
export function suggestCoverHint(
  bg: Pick<Battleground, 'paintedCells'> | null | undefined,
  from: CellPos | null | undefined,
  to: CellPos | null | undefined,
): string | null {
  return isLosBlocked(bg, from, to) ? '沙盘攻击线被墙体遮挡，建议考虑掩护等级' : null;
}

// =======================
// 光照档位（视野系统 R2）
// =======================

type LightBg = Pick<Battleground, 'ambientLight' | 'lightCells' | 'zones'> | null | undefined;

const TIER_RANK: Record<LightTier, number> = { darkness: 0, dim: 1, bright: 2 };

/** 取两档位中更亮的一个（着火照明作为「至少这么亮」的下限使用） */
export function strongerTier(a: LightTier, b: LightTier): LightTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/**
 * 着火区域照明半径（按 5 尺/格换算）：
 * 区域自身及周围 20 尺（4 格）明亮，再向外 20 尺（至 40 尺 / 8 格）微光。
 * 注意：官方读物没有「着火区域提供光照」的规则，这里复用火把数据（明亮 20 尺 / 微光再 20 尺），
 * 属于本工具的房规近似，不代表 5e 标准。
 */
export const FIRE_LIGHT_BRIGHT_CELLS = 4;
export const FIRE_LIGHT_DIM_CELLS = 8;

/**
 * 由着火区域生成照明格映射（切比雪夫距离，单位格）：bright 4 格内 / dim 8 格内。
 * 多块火焰重叠取更亮档位；供渲染按格查表，避免每个格子重复遍历区域。
 */
export function buildFireLightMap(zones?: BattlegroundZone[] | null): Map<string, LightTier> {
  const map = new Map<string, LightTier>();
  if (!zones || zones.length === 0) return map;
  for (const zone of zones) {
    if (zone.type !== 'fire') continue;
    for (const cell of zone.cells) {
      const [cs, rs] = cell.split(',');
      const c0 = parseInt(cs, 10);
      const r0 = parseInt(rs, 10);
      if (isNaN(c0) || isNaN(r0)) continue;
      for (let dc = -FIRE_LIGHT_DIM_CELLS; dc <= FIRE_LIGHT_DIM_CELLS; dc++) {
        for (let dr = -FIRE_LIGHT_DIM_CELLS; dr <= FIRE_LIGHT_DIM_CELLS; dr++) {
          const dist = Math.max(Math.abs(dc), Math.abs(dr));
          if (dist > FIRE_LIGHT_DIM_CELLS) continue;
          const key = `${c0 + dc},${r0 + dr}`;
          const tier: LightTier = dist <= FIRE_LIGHT_BRIGHT_CELLS ? 'bright' : 'dim';
          const prev = map.get(key);
          if (!prev || TIER_RANK[tier] > TIER_RANK[prev]) map.set(key, tier);
        }
      }
    }
  }
  return map;
}

/** 沙盘环境光照档位（load 兜底口径同 battlegroundStore：未设置视为明亮） */
export function getAmbientLightTier(bg: { ambientLight?: LightTier } | null | undefined): LightTier {
  return bg?.ambientLight ?? 'bright';
}

/**
 * 格子原始光照档位：光照区域覆盖 > 环境默认，再取着火照明下限（火把口径）。
 * 区域无标注格返回环境档位（source='ambient'）；着火提亮时记 source='zone'。
 * fireMap 可传入预计算表避免逐格重复遍历区域。
 */
export function getLightTierAt(
  bg: LightBg,
  cell: CellPos | string,
  fireMap?: Map<string, LightTier>,
): { tier: LightTier; source: 'zone' | 'ambient' } {
  const key = typeof cell === 'string' ? cell : `${cell.col},${cell.row}`;
  let tier: LightTier;
  let source: 'zone' | 'ambient';
  const lc = bg?.lightCells;
  if (lc && lc.darkness.includes(key)) { tier = 'darkness'; source = 'zone'; }
  else if (lc && lc.dim.includes(key)) { tier = 'dim'; source = 'zone'; }
  else if (lc && lc.bright.includes(key)) { tier = 'bright'; source = 'zone'; }
  else { tier = getAmbientLightTier(bg); source = 'ambient'; }

  const fireTier = (fireMap ?? buildFireLightMap(bg?.zones)).get(key);
  if (fireTier && TIER_RANK[fireTier] > TIER_RANK[tier]) return { tier: fireTier, source: 'zone' };
  return { tier, source };
}

/**
 * 参战者视角的有效档位：按自身感官降档。
 * v1 口径（无光源中心概念，尺数仅作展示）：
 *   - truesight：darkness/dim → bright（真实视觉无视光照）
 *   - blindsight：darkness → bright（盲视不依赖视觉）
 *   - darkvision：dim → bright、darkness → dim（黑暗视觉把微光当明亮、黑暗当微光）
 * 优先级 truesight > blindsight > darkvision。
 */
export function getEffectiveTierAt(
  bg: LightBg,
  cell: CellPos | string,
  senses: CombatantSenses | null | undefined,
  fireMap?: Map<string, LightTier>,
): { tier: LightTier; base: LightTier; source: 'zone' | 'ambient'; sense?: 'truesight' | 'blindsight' | 'darkvision' } {
  const raw = getLightTierAt(bg, cell, fireMap);
  const s = senses ?? {};
  if (raw.tier === 'bright') return { ...raw, base: raw.tier };
  if (s.truesight) return { tier: 'bright', base: raw.tier, source: raw.source, sense: 'truesight' };
  if (s.blindsight && raw.tier === 'darkness') return { tier: 'bright', base: raw.tier, source: raw.source, sense: 'blindsight' };
  if (s.darkvision) {
    if (raw.tier === 'darkness') return { tier: 'dim', base: raw.tier, source: raw.source, sense: 'darkvision' };
    if (raw.tier === 'dim') return { tier: 'bright', base: raw.tier, source: raw.source, sense: 'darkvision' };
  }
  return { ...raw, base: raw.tier };
}

/** 能否在黑暗中定位目标（震颤感知尺数覆盖距离；距离单位=格） */
export function canSenseInDark(senses: CombatantSenses | null | undefined, distanceCells: number | undefined): boolean {
  const s = senses ?? {};
  const dist = Math.max(1, distanceCells ?? 1) * 5;
  if (s.tremorsense && s.tremorsense >= dist) return true;
  if (s.blindsight && s.blindsight >= dist) return true;
  return false;
}

/**
 * 躲藏/隐形的可见性判定（5e 非魔法感知口径，距离单位=格）：
 *   - hidden（躲藏）：盲视或真实视觉尺数覆盖距离 → 可见（被非视觉感官锁定）
 *   - invisible（隐形）：仅真实视觉尺数覆盖距离 → 可见
 * 黑暗仅影响普通视觉，不改变本判定（黑暗优劣势由 environment-light 单独产出）。
 */
export function canSeeThroughHide(
  senses: CombatantSenses | null | undefined,
  distanceCells: number | undefined,
  kind: 'hidden' | 'invisible',
): boolean {
  const s = senses ?? {};
  const dist = Math.max(1, distanceCells ?? 1) * 5;
  if (s.truesight && s.truesight >= dist) return true;
  if (kind === 'hidden' && s.blindsight && s.blindsight >= dist) return true;
  return false;
}

// =======================
// 感官文本解析（NPC 图鉴 senses 自由文本 → 结构化）
// =======================

const SENSE_KEYS: Record<string, keyof CombatantSenses> = {
  黑暗视觉: 'darkvision',
  盲视: 'blindsight',
  真实视觉: 'truesight',
  震颤感知: 'tremorsense',
};

/**
 * 解析 NPC senses 文本（如「盲视60尺，黑暗视觉120尺，被动察觉21」）。
 * 解析失败的条目忽略（其余正常提取）；全部失败返回空对象，DM 面板可手动录入。
 */
export function parseSenses(text?: string | null): CombatantSenses {
  const out: CombatantSenses = {};
  if (!text || typeof text !== 'string') return out;
  const re = /(黑暗视觉|盲视|真实视觉|震颤感知)\s*(\d+)\s*尺/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = SENSE_KEYS[m[1]];
    const value = parseInt(m[2], 10);
    if (!key || isNaN(value) || value <= 0) continue;
    out[key] = Math.max(out[key] ?? 0, value);
  }
  return out;
}

export { parseCellKey };

