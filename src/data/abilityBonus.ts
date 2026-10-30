// 特性属性加值：从角色选项（种族/亚种）的机械字段与特质文本中派生结构化加值规则，
// 并计算「初始值 + 特性增益 = 最终值」的组分解析。读时派生，D1 数据零迁移。
import type { AbilityKey, Abilities } from '@/types/character';
import type { CharacterOption } from '@/types/characterOption';
import { optionStore } from '@/data/optionStore';

export interface AbilityBonusRule {
  /** 稳定 ID：`${option.id}#${index}`，作为 abilityBonusChoices 的 key */
  id: string;
  mode: 'fixed' | 'flexible';
  /** fixed 模式：指定属性 */
  ability?: AbilityKey;
  /** 每项加值 */
  amount: number;
  /** flexible 模式：需选数量（任选两项 → 2） */
  count?: number;
  /** 特性原文（解析依据，供解析弹窗回溯） */
  sourceText: string;
  /** 来源标记：如「种族 · 半精灵」 */
  sourceLabel: string;
}

const ABILITY_BY_ZH: Record<string, AbilityKey> = {
  力量: 'strength',
  敏捷: 'dexterity',
  体质: 'constitution',
  智力: 'intelligence',
  感知: 'wisdom',
  魅力: 'charisma',
};

const ZH_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const CATEGORY_LABEL: Record<string, string> = {
  race: '种族',
  subrace: '亚种',
  background: '背景',
  class: '职业',
  subclass: '子职业',
};

// 解析结果按 option.id 缓存：选项库静态，解析正则无需反复执行
const rulesCache = new Map<string, AbilityBonusRule[]>();

function pushFixed(
  out: AbilityBonusRule[],
  option: CharacterOption,
  ability: AbilityKey,
  amount: number,
  sourceText: string
): void {
  // 去重：mechanics 与特质文本描述的是同一加成（同属性同数值），跳过
  const dup = out.some(
    (r) => r.mode === 'fixed' && r.ability === ability && r.amount === amount
  );
  if (dup) return;
  out.push({
    id: `${option.id}#${out.length}`,
    mode: 'fixed',
    ability,
    amount,
    sourceText,
    sourceLabel: `${CATEGORY_LABEL[option.category] ?? option.category} · ${option.name}`,
  });
}

function parseTraitRules(option: CharacterOption, traits: { text: string }[]): AbilityBonusRule[] {
  const out: AbilityBonusRule[] = [];

  for (const t of traits) {
    const text = t.text || '';
    if (!text) continue;

    // 全部属性（人类）：「全部属性值加1」
    const allMatch = text.match(/全部属性值加\s*(\d+)/);
    if (allMatch) {
      const amount = Number(allMatch[1]);
      for (const ability of Object.values(ABILITY_BY_ZH)) {
        pushFixed(out, option, ability, amount, text);
      }
      continue;
    }

    // 任选 N 项：半精灵「再选择其他两项属性值各加1」、变体人类「自选两项不同属性各加1」
    const flexMatch = text.match(
      /(?:再选择|自选|任选|另选)\s*(?:其他|其余)?\s*([一两二三四五六1-9])\s*项?[^加。；]*?各?加\s*(\d+)/
    );
    if (flexMatch) {
      const count = ZH_NUM[flexMatch[1]] ?? Number(flexMatch[1]);
      out.push({
        id: `${option.id}#${out.length}`,
        mode: 'flexible',
        amount: Number(flexMatch[2]),
        count,
        sourceText: text,
        sourceLabel: `${CATEGORY_LABEL[option.category] ?? option.category} · ${option.name}`,
      });
      continue;
    }

    // 固定单项：亚种 mechanics 缺失时的文本兜底，如「你的感知值加1」「你的力量加2」
    const fixedRe = /你的?(力量|敏捷|体质|智力|感知|魅力)(?:值)?加\s*(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = fixedRe.exec(text)) !== null) {
      const ability = ABILITY_BY_ZH[m[1]];
      if (ability) pushFixed(out, option, ability, Number(m[2]), text);
    }
  }

  return out;
}

export function getAbilityBonusRules(option: CharacterOption): AbilityBonusRule[] {
  const cached = rulesCache.get(option.id);
  if (cached) return cached;

  const out: AbilityBonusRule[] = [];

  // 1) 机械字段（种族主来源，中文键：{ 魅力: 2 }）
  const bonus = option.mechanics?.abilityBonus;
  if (bonus) {
    for (const [zh, amount] of Object.entries(bonus)) {
      const ability = ABILITY_BY_ZH[zh];
      if (ability && typeof amount === 'number') {
        pushFixed(out, option, ability, amount, '属性值加成');
      }
    }
  }

  // 2) 特质文本解析（亚种唯一来源；同时兜底任选模式）
  out.push(...parseTraitRules(option, option.traits ?? []));

  rulesCache.set(option.id, out);
  return out;
}

/** 收集角色采用的种族/亚种链上的全部加值规则（母种族在前；background 无 ASI，职业 ASI 按等级后续扩展） */
export function collectCharacterAbilityBonuses(character: {
  race?: string;
  abilityBonusChoices?: Record<string, AbilityKey[]>;
}): AbilityBonusRule[] {
  const raceName = character.race;
  if (!raceName) return [];

  const opt = optionStore.getByName(raceName);
  if (!opt) return [];

  const chain: CharacterOption[] = [opt];
  if (opt.category === 'subrace' && opt.parentName) {
    const parent = optionStore.getByName(opt.parentName, 'race');
    if (parent) chain.unshift(parent);
  }

  return chain.flatMap((o) => getAbilityBonusRules(o));
}

export interface AbilityPart {
  ruleId: string;
  label: string;
  amount: number;
}

export interface AbilityBreakdownEntry {
  base: number | null;
  parts: AbilityPart[];
  total: number;
}

export interface PendingFlexibleRule {
  rule: AbilityBonusRule;
  chosen: AbilityKey[];
}

export interface AbilityBreakdown {
  entries: Record<AbilityKey, AbilityBreakdownEntry>;
  /** 未完成选择的任选规则 */
  pendingFlexible: PendingFlexibleRule[];
  hasBase: boolean;
}

const ALL_ABILITIES: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

/**
 * 组分解析：初始值 + 各加值 = 最终值。
 * 任选规则只在选择齐全（count 个互异属性）后计入。
 */
export function computeAbilityBreakdown(character: {
  baseAbilities?: Abilities;
  race?: string;
  abilityBonusChoices?: Record<string, AbilityKey[]>;
}): AbilityBreakdown | null {
  const rules = collectCharacterAbilityBonuses(character);
  const choices = character.abilityBonusChoices ?? {};
  const hasBase = !!character.baseAbilities;
  if (!hasBase && rules.length === 0) return null;

  const entries = {} as Record<AbilityKey, AbilityBreakdownEntry>;
  const pendingFlexible: PendingFlexibleRule[] = [];

  // 每个属性的加值分组：ruleId → (label, amount)。
  // flexible 规则对选中的每个属性各产生一个 part。
  const partsByAbility: Record<AbilityKey, AbilityPart[]> = {
    strength: [], dexterity: [], constitution: [],
    intelligence: [], wisdom: [], charisma: [],
  };

  for (const rule of rules) {
    if (rule.mode === 'fixed' && rule.ability) {
      partsByAbility[rule.ability].push({ ruleId: rule.id, label: rule.sourceLabel, amount: rule.amount });
      continue;
    }
    if (rule.mode === 'flexible') {
      const chosen = (choices[rule.id] ?? []).filter(Boolean);
      const complete = chosen.length >= (rule.count ?? 1);
      if (complete) {
        for (const ability of chosen) {
          partsByAbility[ability].push({ ruleId: rule.id, label: rule.sourceLabel, amount: rule.amount });
        }
      } else {
        pendingFlexible.push({ rule, chosen });
      }
    }
  }

  for (const key of ALL_ABILITIES) {
    const base = hasBase ? character.baseAbilities?.[key]?.score ?? null : null;
    const parts = partsByAbility[key];
    entries[key] = {
      base,
      parts,
      total: (base ?? 0) + parts.reduce((sum, p) => sum + p.amount, 0),
    };
  }

  return { entries, pendingFlexible, hasBase };
}
