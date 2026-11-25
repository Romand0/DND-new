// 状态免疫判定 —— 种子 conditionImmunities（中文条件名）↔ 状态库（id / 标准名）归一
//
// 5e 条件免疫：免疫某状态的生物无法被施加该状态。种子用词存在变体
// （受擒/擒抱、恐慌/惊恐/恐惧），统一归一后与状态库标准名比对。
// 仅内建条件参与拦截（状态库无定义的通用状态如伤害修饰恒不免疫）。
import statusLibrary from './statusLibrary';
import type { Combatant } from '@/types/combat';

/** 种子用词变体 → 状态库标准名 */
const CONDITION_ALIASES: Record<string, string> = {
  受擒: '擒抱',
  恐慌: '恐惧',
  惊恐: '恐惧',
};

/** 归一条件名（去空格 + 别名映射） */
export function normalizeConditionName(name: string): string {
  const trimmed = String(name ?? '').trim();
  return CONDITION_ALIASES[trimmed] ?? trimmed;
}

/** 状态 ID → 标准条件名；状态库无此定义返回 null */
export function conditionNameOf(statusId: string): string | null {
  const def = statusLibrary.get(statusId);
  return def ? normalizeConditionName(def.name) : null;
}

type ImmunitySource = Pick<Combatant, 'conditionImmunities'> | null | undefined;

/** 参战者是否免疫该状态 */
export function isImmuneToStatus(combatant: ImmunitySource, statusId: string): boolean {
  const name = conditionNameOf(statusId);
  if (!name) return false;
  return (combatant?.conditionImmunities ?? []).some(imm => normalizeConditionName(imm) === name);
}

/** 免疫命中时的标准条件名（提示文案用）；未免疫返回 null */
export function immunityLabelFor(combatant: ImmunitySource, statusId: string): string | null {
  return isImmuneToStatus(combatant, statusId) ? conditionNameOf(statusId) : null;
}
