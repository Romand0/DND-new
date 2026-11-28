// 职业资源池公式引擎：角色卡池量计算与池键解析（主动技能引擎 P1）。
// 纯读派生——池满量由等级/属性实时计算，角色卡只存 used（与法术位 max/used 同构）。
import type { Character, Feature, FeaturePoolFormula, AbilityKey } from '@/types/character';
import { getEffectiveLevel } from '@/lib/experience';

/** 池键稳定口径：与 reactionDefinitions 的 feature:<名> 键一致 */
export function featurePoolKey(name: string): string {
  return `feature:${name}`;
}

/**
 * 解析特性所属池键：
 *  - 池主（自带 poolFormula）→ 自身名
 *  - 成员 → 显式 pool 引用 > system 容器名
 * 返回 null = 无池语义（manual/toggle 等无池消耗路径）
 */
export function resolvePoolKey(f: Feature): string | null {
  if (f.poolFormula) return featurePoolKey(f.name);
  if (f.pool) return featurePoolKey(f.pool);
  if (f.system) return featurePoolKey(f.system);
  return null;
}

function abilityMod(character: Character, ability?: AbilityKey): number {
  if (!ability) return 0;
  return character.abilities?.[ability]?.modifier ?? Math.floor(((character.abilities?.[ability]?.score ?? 10) - 10) / 2);
}

/** 按公式计算池满量（角色当前等级/属性实时派生；公式缺失返回 0） */
export function getPoolMax(character: Character, formula?: FeaturePoolFormula): number {
  if (!formula) return 0;
  const level = getEffectiveLevel(character);
  let max = 0;
  switch (formula.type) {
    case 'fixed':
      max = formula.value ?? 0;
      break;
    case 'classLevel':
      max = level * (formula.multiplier ?? 1);
      break;
    case 'abilityMod':
      max = (formula.plus ?? 0) + abilityMod(character, formula.ability);
      break;
    case 'levelTiers': {
      const tiers = [...(formula.tiers ?? [])].sort((a, b) => b.min - a.min);
      max = tiers.find((t) => level >= t.min)?.value ?? 0;
      break;
    }
  }
  return Math.max(0, max, formula.floor ?? 0);
}

/** 读取角色某池已用量（老数据无 featurePools 字段按 0 兜底） */
export function getPoolUsed(character: Character, poolKey: string): number {
  return character.featurePools?.[poolKey]?.used ?? 0;
}

/** 单次消耗池量（缺省 1） */
export function getPoolCost(f: Feature): number {
  return Math.max(1, Math.floor(f.cost ?? 1));
}

/** 池条目查找：按名称在角色特性列表中找池主（poolFormula + resource='pool'） */
export function findPoolOwner(character: Character, poolKey: string): Feature | null {
  const name = poolKey.startsWith('feature:') ? poolKey.slice('feature:'.length) : poolKey;
  return (
    (character.features || []).find(
      (f) => f.name === name && f.poolFormula != null && f.resource === 'pool',
    ) ?? null
  );
}
