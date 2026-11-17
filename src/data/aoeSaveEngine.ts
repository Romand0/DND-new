// aoe_save 通道结算引擎（吐息武器等范围豁免类特性）：
// 几何复用 aoeShapes 引擎（parseAoeSpec 解析特性描述里的形状文本），豁免加值走 saveBonus，
// 伤害落地走 resolveDamage 抗性管线（kind='effect'：特性来源不触发「非魔法武器」类限定词）。
// plan 只做几何 + DC 推导；apply 接受显式骰值（DM 弹窗手填/自动骰均可，探针可覆写保证确定性），
// HP 落地由调用方处理。
import { parseAoeSpec, computeAoeCells, filterAoeTargets, describeAoeSpec } from '@/data/aoeShapes';
import type { AoeSpec, AoeMethod, AoeResult } from '@/data/aoeShapes';
import type { Bearing, GridBounds, GridPos } from '@/data/battleGeometry';
import { computeSaveBonus } from '@/lib/saveBonus';
import { characterStore } from '@/data/characterStore';
import { resolveDamage } from '@/data/damageRules';
import { getCombatantAffinities } from '@/data/combatAffinities';
import { rollDice } from '@/data/diceService';
import type { AbilityKey } from '@/types/character';
import type { DamageSourceKind, DamageType } from '@/types/damage';
import type { Combatant } from '@/types/combat';

/**
 * 解析伤害骰文本（"2d6" / "3d8+2"）并掷出总量；解析失败返回 null。
 * DM 弹窗与 turnCommitApply 自动结算共用。
 */
export function rollAoeDamage(diceText: string): number | null {
  const m = /^(\d*)d(\d+)(?:\s*\+\s*(\d+))?$/.exec(diceText.replace(/\s+/g, ''));
  if (!m) return null;
  const count = Math.max(1, parseInt(m[1] || '1', 10));
  const sides = parseInt(m[2], 10);
  const flat = m[3] ? parseInt(m[3], 10) : 0;
  if (![4, 6, 8, 10, 12, 20].includes(sides)) return null;
  return rollDice({ sides: sides as 4 | 6 | 8 | 10 | 12 | 20, count, mode: 'sum' }).total + flat;
}

/** plan 输出：单目标豁免上下文（弹窗逐目标预填 DC/加值） */
export interface AoeSaveTargetPlan {
  combatantId: string;
  name: string;
  dc: number;
  saveBonus: number;
  saveFormula: string;
}

export interface AoeSavePlan {
  spec: AoeSpec;
  shapeLabel: string;
  origin: GridPos;
  direction: Bearing;
  method: AoeMethod;
  area: AoeResult;
  targets: AoeSaveTargetPlan[];
  /** 几何解析失败原因（null = 正常） */
  error: string | null;
}

/** apply 输出：单目标结算明细（HP 落地前） */
export interface AoeSaveTargetResult {
  combatantId: string;
  name: string;
  dc: number;
  saveBonus: number;
  roll: number;
  total: number;
  success: boolean;
  /** 抗性管线后的最终伤害（已含减半/免疫/易伤） */
  damage: number;
  damageType: string;
  /** 抗性结算说明（免疫/抗性等） */
  note?: string;
}

/** 便捷读取：参战者豁免加值（PC 走角色卡存档，NPC 走属性快照；属性缺失降级 +0） */
export function saveBonusFor(target: Combatant, ability: string): { bonus: number; formula: string } {
  const char = target.characterId ? characterStore.get(target.characterId) : null;
  const r = computeSaveBonus(target, char, ability as AbilityKey);
  if (!r) return { bonus: 0, formula: '属性未知，按 +0 结算' };
  return { bonus: r.total, formula: r.formula };
}

/**
 * 几何规划：解析特性描述中的形状文本（「15尺锥状」「30尺线状」等）→ 覆盖格 → 命中目标逐个推导豁免 DC。
 * selfOriginated 恒 true（吐息武器源点是自身，锥/线不含自身格由 computeAoeCells 处理）；
 * 施法者恒排除在目标外（对自身吐息免疫）。
 * @param candidates 参与几何判定的候选（调用方负责过滤死亡/未放置者）
 */
export function planAoeSave(
  caster: Combatant,
  description: string,
  dc: number,
  saveAbility: string,
  candidates: { combatant: Combatant; pos: GridPos | null }[],
  q: { origin: GridPos; direction: Bearing; method?: AoeMethod; bounds?: GridBounds },
): AoeSavePlan {
  const spec = parseAoeSpec(description);
  const method = q.method ?? 'template';
  const emptyArea: AoeResult = { cells: [], method, spec: { shape: 'cone', lengthFt: 0 }, note: '' };
  if (!spec) {
    return {
      spec: { shape: 'cone', lengthFt: 0 },
      shapeLabel: '',
      origin: q.origin,
      direction: q.direction,
      method,
      area: emptyArea,
      targets: [],
      error: '无法从特性描述解析范围形状，请在描述中写明形状与尺寸（如「15尺锥状」）',
    };
  }
  const area = computeAoeCells({
    spec,
    origin: q.origin,
    direction: q.direction,
    selfOriginated: true,
    bounds: q.bounds,
  }, method);
  const locked = filterAoeTargets(area, candidates.map(c => ({ id: c.combatant.id, pos: c.pos })));
  const targets: AoeSaveTargetPlan[] = locked
    .filter(l => l.id !== caster.id)
    .map(l => {
      const combatant = candidates.find(c => c.combatant.id === l.id)!.combatant;
      const { bonus, formula } = saveBonusFor(combatant, saveAbility);
      return {
        combatantId: l.id,
        name: combatant.name,
        dc,
        saveBonus: bonus,
        saveFormula: formula,
      };
    });
  return {
    spec,
    shapeLabel: describeAoeSpec(spec),
    origin: q.origin,
    direction: q.direction,
    method,
    area,
    targets,
    error: null,
  };
}

/**
 * 逐目标结算：显式骰值 + 抗性管线（kind='effect'）。
 * @param entries 调用方已按几何过滤好的目标 + 豁免加值（saveBonusFor）+ 骰值
 * @param damageAmount 伤害总量（单骰池，已由调用方掷出/覆写）；豁免成功减半按 floor(x/2)
 */
export function applyAoeSave(
  entries: { combatant: Combatant; roll: number; saveBonus: number; dc: number }[],
  damageAmount: number,
  damageType: string,
  opts?: { halfOnSave?: boolean; sourceKind?: DamageSourceKind },
): AoeSaveTargetResult[] {
  const half = opts?.halfOnSave !== false;
  const sourceKind: DamageSourceKind = opts?.sourceKind ?? 'effect';
  return entries.map(({ combatant, roll, saveBonus, dc }) => {
    const total = roll + saveBonus;
    const success = total >= dc;
    const raw = success && half ? Math.floor(damageAmount / 2) : damageAmount;
    const resolution = resolveDamage(
      // 描述/弹窗里的类型文本可能超出 DamageType 字面量集合，管线按字符串比较，收窄为断言
      [{ amount: raw, type: damageType as DamageType }],
      getCombatantAffinities(combatant),
      { kind: sourceKind },
    );
    return {
      combatantId: combatant.id,
      name: combatant.name,
      dc,
      saveBonus,
      roll,
      total,
      success,
      damage: resolution.final,
      damageType,
      note: resolution.notes.length > 0 ? resolution.notes.join('；') : undefined,
    };
  });
}
