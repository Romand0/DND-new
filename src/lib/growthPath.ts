import type { Character } from '@/types/character';
import type { CharacterOption, OptionTrait } from '@/types/characterOption';
import type {
  GrowthDataGap,
  GrowthFeatureRef,
  GrowthMilestone,
  GrowthPath,
} from '@/types/growthTask';
import { getEffectiveLevel, getProficiencyBonus } from '@/lib/experience';

const RULE_VERSION = 'growth-path-v1';

// options.json 使用「魔契师」，旧角色卡/子职业表使用「邪术师」，派生入口统一归一化。
const CLASS_ALIASES: Record<string, string> = {
  邪术师: '魔契师',
};

function normalizeClassName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  return CLASS_ALIASES[trimmed] ?? trimmed;
}

function normalizeFeatureName(name: string | undefined): string {
  return (name ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[（(].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .replace(/^选择/, '');
}

function stripFeatureSuffix(name: string): string {
  return name.replace(/[（(].*$/, '').trim();
}

function isAbilityScoreImprovement(name: string): boolean {
  return normalizeFeatureName(name).startsWith('属性值提升');
}

function isSubclassPlaceholder(name: string): boolean {
  return /^(范型特性|学院特性|奥术传承特性|领域特性|道途特性|圣誓特性|宗派特性|结社特性|异界宗主特性|游侠范型特性|游荡者范型特性|武术范型特性)$/.test(
    normalizeFeatureName(name),
  );
}

function traitsOf(option: CharacterOption | undefined): OptionTrait[] {
  if (!option) return [];
  const traits = option.traits?.length
    ? option.traits
    : ((option as CharacterOption & { features?: OptionTrait[] }).features ?? []);
  return Array.isArray(traits) ? traits : [];
}

function featureRefFromTrait(
  trait: OptionTrait,
  level: number,
  source: 'class' | 'subclass',
): GrowthFeatureRef {
  return {
    name: trait.name,
    nameEn: trait.nameEn,
    description: trait.text ?? (trait as OptionTrait & { description?: string }).description ?? '',
    level,
    source,
    category: '职业特性',
    role: trait.role,
    system: trait.system,
    systemKind: trait.systemKind,
    options: trait.options?.map((option) => ({
      name: option.name,
      nameEn: option.nameEn,
      description: option.text ?? '',
    })),
  };
}

function findTrait(traits: OptionTrait[], rawName: string, level: number): OptionTrait | undefined {
  const target = normalizeFeatureName(rawName);
  return (
    traits.find((trait) => normalizeFeatureName(trait.name) === target && (trait.level == null || trait.level === level)) ??
    traits.find((trait) => normalizeFeatureName(trait.name) === target)
  );
}

function parseSlotNumber(value: string | undefined): number {
  const matched = String(value ?? '').match(/\d+/);
  return matched ? parseInt(matched[0], 10) : 0;
}

function deriveSpellSlots(row: { slots?: Record<string, string> } | undefined): Record<number, number> | undefined {
  if (!row?.slots) return undefined;
  const slots: Record<number, number> = {};
  for (const [key, value] of Object.entries(row.slots)) {
    const matched = key.match(/^(\d+)环$/);
    if (!matched) continue;
    const count = parseSlotNumber(value);
    if (count > 0) slots[parseInt(matched[1], 10)] = count;
  }
  // 魔契师使用「法术位 + 法术位环阶」而非逐环槽位，合并为同一份派生结果。
  if (row.slots['法术位'] != null) {
    const slotLevel = parseSlotNumber(row.slots['法术位环阶']);
    const count = parseSlotNumber(row.slots['法术位']);
    if (slotLevel > 0 && count > 0) slots[slotLevel] = count;
  }
  return Object.keys(slots).length > 0 ? slots : undefined;
}

function resolveSubclassOption(
  classOption: CharacterOption | undefined,
  subclassKey: string | undefined,
  options: CharacterOption[],
): CharacterOption | undefined {
  if (!classOption || !subclassKey) return undefined;
  const parent = normalizeClassName(classOption.name);
  const key = subclassKey.trim();
  const keyWithoutPrefix = key.replace(/^subclass-/, '');
  const explicit = options.filter(
    (option) =>
      option.category === 'subclass' &&
      normalizeClassName(option.parentName) === parent,
  );
  const matched = explicit.find((option) => {
    const id = option.id.replace(/^subclass-/, '');
    return id === keyWithoutPrefix || option.name === key;
  });
  if (matched) return matched;

  const embedded = ((classOption as unknown as { subclasses?: unknown[] }).subclasses ?? []).find(
    (item): item is CharacterOption => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as CharacterOption;
      return (
        candidate.id?.replace(/^subclass-/, '') === keyWithoutPrefix || candidate.name === key
      );
    },
  );
  if (!embedded) return undefined;
  return {
    ...embedded,
    category: 'subclass',
    parentName: classOption.name,
    traits: traitsOf(embedded),
  };
}

function subclassCandidates(
  classOption: CharacterOption | undefined,
  options: CharacterOption[],
): Array<{ id: string; name: string }> {
  if (!classOption) return [];
  const parent = normalizeClassName(classOption.name);
  const explicit = options.filter(
    (option) =>
      option.category === 'subclass' &&
      normalizeClassName(option.parentName) === parent,
  );
  if (explicit.length > 0) {
    return explicit.map((option) => ({
      id: option.id.replace(/^subclass-/, ''),
      name: option.name,
    }));
  }
  const raw = ((classOption as unknown as { subclasses?: unknown[] }).subclasses ?? []);
  return raw
    .map((item) => {
      if (typeof item === 'string') return { id: item, name: item };
      if (!item || typeof item !== 'object') return null;
      const candidate = item as { id?: string; name?: string };
      return candidate.id && candidate.name ? { id: candidate.id.replace(/^subclass-/, ''), name: candidate.name } : null;
    })
    .filter((item): item is { id: string; name: string } => item !== null);
}

function findSubclassChoiceLevel(
  classOption: CharacterOption | undefined,
  options: CharacterOption[],
): number | undefined {
  if (!classOption) return undefined;
  const table = classOption.table ?? [];
  const selectedRow = table.find((row) => row.features.some((name) => name.startsWith('选择')));
  if (selectedRow) return selectedRow.level;

  const parent = normalizeClassName(classOption.name);
  const levels = options
    .filter((option) => option.category === 'subclass' && normalizeClassName(option.parentName) === parent)
    .flatMap((option) => traitsOf(option).map((trait) => trait.level))
    .filter((level): level is number => typeof level === 'number' && level > 0);
  if (levels.length > 0) return Math.min(...levels);

  const placeholderRow = table.find((row) =>
    row.features.some(
      (name) => /范型|传承|领域|道途|结社|宗派|誓言|学院|宗主/.test(name) && !name.startsWith('选择'),
    ),
  );
  return placeholderRow?.level;
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildPathVersion(input: {
  classOption: CharacterOption | undefined;
  subclassOption: CharacterOption | undefined;
  effectiveLevel: number;
}): string {
  const source = JSON.stringify({
    rule: RULE_VERSION,
    className: input.classOption?.name ?? '',
    table: input.classOption?.table ?? [],
    traits: traitsOf(input.classOption).map((trait) => ({
      name: trait.name,
      level: trait.level,
      text: trait.text,
    })),
    subclass: input.subclassOption
      ? {
          id: input.subclassOption.id,
          name: input.subclassOption.name,
          traits: traitsOf(input.subclassOption).map((trait) => ({
            name: trait.name,
            level: trait.level,
            text: trait.text,
          })),
        }
      : null,
    effectiveLevel: input.effectiveLevel,
  });
  return `${RULE_VERSION}:${input.classOption?.name ?? 'none'}:${input.subclassOption?.id ?? 'none'}:${input.effectiveLevel}:${hashString(source)}`;
}

/**
 * 从角色快照与选项库派生 1-20 级成长路径。纯函数：不读写 store/API。
 */
export function buildGrowthPath(character: Character, options: CharacterOption[]): GrowthPath {
  const effectiveLevel = getEffectiveLevel(character);
  const classKey = normalizeClassName(character.profession?.class);
  const classOption = options.find(
    (option) => option.category === 'class' && normalizeClassName(option.name) === classKey,
  );
  const subclassKey = character.profession?.subclass?.trim();
  const subclassOption = resolveSubclassOption(classOption, subclassKey, options);
  const classTraits = traitsOf(classOption);
  const subclassTraits = traitsOf(subclassOption);
  const table = classOption?.table ?? [];
  const hasSpellSlotRows = table.some((row) => row.slots && Object.keys(row.slots).length > 0);
  const choiceLevel = findSubclassChoiceLevel(classOption, options);
  const candidates = subclassCandidates(classOption, options);
  const hitDie = classOption?.mechanics?.hitDie ?? undefined;
  const conMod =
    character.abilities?.constitution?.modifier ??
    Math.floor(((character.abilities?.constitution?.score ?? 10) - 10) / 2);

  const milestones: GrowthMilestone[] = [];

  for (let level = 1; level <= 20; level++) {
    const row = table.find((item) => item.level === level);
    const gaps: GrowthDataGap[] = [];

    if (!classOption && level === 1) {
      gaps.push({
        level,
        field: 'class',
        message: `未找到职业「${classKey || '未填写'}」的选项数据`,
      });
    }
    if (classOption && !row) {
      gaps.push({
        level,
        field: 'class-table',
        message: `职业表缺少 ${level} 级行`,
      });
    }

    const classFeatures: GrowthFeatureRef[] = [];
    let abilityScoreImprovement: GrowthMilestone['abilityScoreImprovement'];
    for (const rawName of row?.features ?? []) {
      if (isAbilityScoreImprovement(rawName)) {
        abilityScoreImprovement = { points: 2, modes: ['+2', '+1/+1'] };
        continue;
      }
      if (isSubclassPlaceholder(rawName)) continue;

      const trait = findTrait(classTraits, rawName, level);
      if (trait) {
        classFeatures.push(featureRefFromTrait(trait, level, 'class'));
        continue;
      }
      const fallbackName = stripFeatureSuffix(rawName);
      classFeatures.push({
        name: fallbackName,
        description: '',
        level,
        source: 'class',
        category: '职业特性',
      });
      gaps.push({
        level,
        field: 'class-feature',
        message: `未找到职业特性「${fallbackName}」的描述`,
      });
    }

    const subclassFeatures = subclassTraits
      .filter((trait) => trait.level === level)
      .map((trait) => featureRefFromTrait(trait, level, 'subclass'));

    if (subclassOption && (row?.features ?? []).some(isSubclassPlaceholder) && subclassFeatures.length === 0) {
      gaps.push({
        level,
        field: 'subclass-feature',
        message: `子职业「${subclassOption.name}」缺少 ${level} 级特性`,
      });
    }
    if (subclassKey && !subclassOption && level === 1) {
      gaps.push({
        level,
        field: 'subclass',
        message: `未找到子职业「${subclassKey}」的选项数据`,
      });
    }

    let subclassChoice: GrowthMilestone['subclassChoice'];
    if (choiceLevel === level) {
      subclassChoice = {
        required: !subclassKey,
        candidates,
      };
      if (candidates.length === 0) {
        gaps.push({
          level,
          field: 'subclass',
          message: `职业「${classKey}」缺少子职业候选`,
        });
      }
    }

    const slots = deriveSpellSlots(row);
    if (row && hasSpellSlotRows && !slots && level === 1) {
      gaps.push({
        level,
        field: 'spell-slots',
        message: '职业表缺少法术位数据',
      });
    }

    if (!hitDie && level === 1) {
      gaps.push({
        level,
        field: 'hit-die',
        message: `职业「${classKey || '未填写'}」缺少生命骰`,
      });
    }

    milestones.push({
      level,
      proficiencyBonus: row?.proficiency ?? getProficiencyBonus(level),
      classFeatures,
      subclassFeatures,
      subclassChoice,
      abilityScoreImprovement,
      spellSlots: slots,
      cantripsKnown: row?.slots && '已知戏法' in row.slots ? parseSlotNumber(row.slots['已知戏法']) : undefined,
      spellsKnown: row?.slots && '已知法术' in row.slots ? parseSlotNumber(row.slots['已知法术']) : undefined,
      hitDie,
      hpGain: hitDie
        ? {
            fixed: Math.floor(hitDie / 2) + 1 + conMod,
            conMod,
            formula: `${Math.floor(hitDie / 2) + 1} + ${conMod}`,
          }
        : undefined,
      gaps,
    });
  }

  return {
    characterId: character.id,
    classKey,
    subclassKey: subclassOption?.id.replace(/^subclass-/, '') ?? subclassKey,
    effectiveLevel,
    pathVersion: buildPathVersion({ classOption, subclassOption, effectiveLevel }),
    milestones,
  };
}
