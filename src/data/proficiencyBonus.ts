// 特性熟练项加成：从角色选项（种族/亚种/背景/职业）的机械字段与特质文本中派生结构化熟练规则，
// 并计算「基线熟练 ∪ 选项解析 = 最终熟练」的合并结果与来源标记。与 abilityBonus.ts 同一模式：
// 读时派生、规则 ID 稳定、任选选择存角色字段、弹窗可用草稿实时预览。
import type { AbilityKey, SkillKey } from '@/types/character';
import type { CharacterOption } from '@/types/characterOption';
import { optionStore } from '@/data/optionStore';
import { SKILL_LABELS } from '@/data/characterStore';
import { getClassProficiencyInfo } from '@/data/classProficiencies';
import { matchToolCategory, TOOL_CATEGORY_CANDIDATES } from '@/data/toolCategoryCandidates';

export type ProfBonusKind = 'skill' | 'save' | 'tool' | 'weapon' | 'armor' | 'language';

// 规则 kind（单数）→ 角色 proficiencies 分类键（复数，与 CharacterProficiencies 字段对齐）
const KIND_TO_CHIP: Record<string, 'armor' | 'weapons' | 'tools' | 'languages'> = {
  tool: 'tools',
  weapon: 'weapons',
  armor: 'armor',
  language: 'languages',
};

export interface ProficiencyBonusRule {
  /** 稳定 ID：`${option.id}#${out.length}`，作为 proficiencyChoices 的 key */
  id: string;
  kind: ProfBonusKind;
  mode: 'fixed' | 'flexible';
  /** fixed 模式：熟练对象展示名（技能中文名 / 工具 / 武器 / 护甲 / 语言） */
  target?: string;
  /** fixed 技能的结构化键（与 target 同源，skillKey 由中文反查） */
  skillKey?: SkillKey;
  /** fixed 豁免的结构化键（职业 savingThrows 直接给 AbilityKey） */
  saveKey?: AbilityKey;
  /** flexible 模式：需选数量 */
  count?: number;
  /** flexible 候选列表（如矮人工匠工具三选一）；缺省 = 自由选择（技能走技能表，语言/工具自由文本） */
  candidates?: string[];
  /** 规则原文（解析依据，供解析弹窗回溯） */
  sourceText: string;
  /** 来源标记：如「种族 · 精灵」「背景 · 智者」「职业 · 游荡者」 */
  sourceLabel: string;
}

const SKILL_BY_ZH: Record<string, SkillKey> = Object.fromEntries(
  Object.entries(SKILL_LABELS).map(([key, label]) => [label, key as SkillKey])
);

const ZH_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const CATEGORY_LABEL: Record<string, string> = {
  race: '种族',
  subrace: '亚种',
  background: '背景',
  class: '职业',
  subclass: '子职业',
};

// 解析结果按 option.id 缓存：选项库静态，正则无需反复执行
const rulesCache = new Map<string, ProficiencyBonusRule[]>();

function label(option: CharacterOption): string {
  return `${CATEGORY_LABEL[option.category] ?? option.category} · ${option.name}`;
}

function parseTraitRules(option: CharacterOption, traits: { name?: string; text: string }[], out: ProficiencyBonusRule[]): void {
  // 与 abilityBonus 同一教训：直接推进共享 out，共享去重池与全局序号
  for (const t of traits) {
    const text = t.text || '';
    if (!text || text.includes('视为')) continue; // 「视为具有熟练」是条件型增益（如石中精妙），跳过

    // 任选工具（含候选）：「你获得一个工匠工具的熟练项，从以下项目中自选其一：铁匠工具，酿酒工具或石匠工具。」
    const flexTool = text.match(/你获得([一两二三四五六\d])个?[^，。：]{0,6}工具的熟练项[，,]?从以下[^：]*：([^。]*)。?/);
    if (flexTool) {
      const candidates = flexTool[2].split(/[，,、和或]/).map((s) => s.trim()).filter(Boolean);
      out.push({
        id: `${option.id}#${out.length}`,
        kind: 'tool',
        mode: 'flexible',
        count: (ZH_NUM[flexTool[1]] ?? parseInt(flexTool[1], 10)) || 1,
        candidates,
        sourceText: text,
        sourceLabel: label(option),
      });
      continue;
    }

    // 任选技能：「你获得两项自选技能的熟练项。」「你获得一项自选的技能作为熟练项。」
    const flexSkill = text.match(/获得([一两二三四五六\d])项?自选的?技能/);
    if (flexSkill) {
      out.push({
        id: `${option.id}#${out.length}`,
        kind: 'skill',
        mode: 'flexible',
        count: (ZH_NUM[flexSkill[1]] ?? parseInt(flexSkill[1], 10)) || 1,
        sourceText: text,
        sourceLabel: label(option),
      });
      continue;
    }

    // 固定技能：「你拥有察觉技能的熟练项。」「你获得威吓技能的熟练项。」
    const fixedSkill = text.match(/你(?:拥有|获得|具有|掌握)([^\s，。]{1,5}?)技能的熟练项/);
    if (fixedSkill) {
      const name = fixedSkill[1];
      const key = SKILL_BY_ZH[name];
      if (key && !out.some((r) => r.mode === 'fixed' && r.kind === 'skill' && r.skillKey === key)) {
        out.push({
          id: `${option.id}#${out.length}`,
          kind: 'skill',
          mode: 'fixed',
          target: name,
          skillKey: key,
          sourceText: text,
          sourceLabel: label(option),
        });
      }
      continue;
    }

    // 固定工具：「你拥有工匠工具（修补工具）的熟练项。」→ 取括号内具体名
    const fixedTool = text.match(/你(?:拥有|获得|具有)[^，。的]{0,6}工具（([^）]+)）的熟练项/);
    if (fixedTool) {
      const name = fixedTool[1];
      if (!out.some((r) => r.mode === 'fixed' && r.kind === 'tool' && r.target === name)) {
        out.push({
          id: `${option.id}#${out.length}`,
          kind: 'tool',
          mode: 'fixed',
          target: name,
          sourceText: text,
          sourceLabel: label(option),
        });
      }
      continue;
    }

    // 类别型任选工具：「你获得一种乐器的熟练项。」「你具有一种赌具的熟练项。」
    // （乐器/赌具措辞不含「工具」二字，flexTool 与 fixedTool 正则均无法覆盖，须在 fixedGear 前拦截）
    const categoryToolTrait = text.match(/你(?:拥有|获得|具有)一种?(乐器|工匠工具|赌具)的熟练项/);
    if (categoryToolTrait) {
      const candidates = TOOL_CATEGORY_CANDIDATES[categoryToolTrait[1]] ?? [];
      if (!out.some((r) => r.mode === 'flexible' && r.kind === 'tool')) {
        out.push({
          id: `${option.id}#${out.length}`,
          kind: 'tool',
          mode: 'flexible',
          count: 1,
          candidates,
          sourceText: text,
          sourceLabel: label(option),
        });
      }
      continue;
    }

    // 武器/护甲：「你拥有长剑、短剑、短弓和长弓的熟练项。」「你拥有轻甲和中甲的熟练项。」
    const fixedGear = text.match(/你(?:拥有|获得|具有)([^。]*?)的熟练项/);
    if (fixedGear) {
      const items = fixedGear[1].split(/[，,、和]/).map((s) => s.trim()).filter(Boolean);
      // 护甲判定：整体描述里含「甲」
      const isArmor = items.every((s) => s.includes('甲'));
      const kind: ProfBonusKind = isArmor ? 'armor' : 'weapon';
      for (const name of items) {
        if (out.some((r) => r.mode === 'fixed' && r.kind === kind && r.target === name)) continue;
        out.push({
          id: `${option.id}#${out.length}`,
          kind,
          mode: 'fixed',
          target: name,
          sourceText: text,
          sourceLabel: label(option),
        });
      }
      continue;
    }
  }
}

function parseLanguages(option: CharacterOption, prose: string, out: ProficiencyBonusRule[]): void {
  if (!prose) return;
  // 固定语言只看第一句：「通用语和侏儒语」；后续句子的叙述性提及
  // （如兽人语"可以借用矮人语的文字进行书写"）会造成误匹配
  const first = prose.split(/。/)[0] || '';
  const fixed = first.match(/通用语(?:和|、)([^。，,、]+?语)(?:[，。]|$)/);
  // 通用语只在原文显式提及时授予（背景 prose 只写任选语言，通用语由种族给）
  const fixedNames = first.includes('通用语') ? ['通用语'] : [];
  if (fixed) fixedNames.push(fixed[1]);
  for (const name of fixedNames) {
    if (!out.some((r) => r.mode === 'fixed' && r.kind === 'language' && r.target === name)) {
      out.push({
        id: `${option.id}#${out.length}`,
        kind: 'language',
        mode: 'fixed',
        target: name,
        sourceText: prose,
        sourceLabel: label(option),
      });
    }
  }
  // 任选语言：覆盖「任选两门语言」「自选两门语言」「一门自选语言」「任意一门自选语言」「一门额外的自选语言」
  const flex =
    prose.match(/任选([一两二三四五六\d])门语言/) ??
    prose.match(/自选([一两二三四五六\d])门语言/) ??
    prose.match(/([一两二三四五六\d])门(?:[^。，]*?)自选语言/);
  if (flex) {
    out.push({
      id: `${option.id}#${out.length}`,
      kind: 'language',
      mode: 'flexible',
      count: (ZH_NUM[flex[1]] ?? parseInt(flex[1], 10)) || 1,
      sourceText: prose,
      sourceLabel: label(option),
    });
  }
}

function getProficiencyRules(option: CharacterOption): ProficiencyBonusRule[] {
  const cached = rulesCache.get(option.id);
  if (cached) return cached;
  const out: ProficiencyBonusRule[] = [];
  const m = option.mechanics || {};

  // 背景：skills「洞悉，宗教」/ tools「一种赌具，载具（陆运）。」/ languages「任选两门语言」
  if (m.skills) {
    for (const name of m.skills.split(/[，,、]/).map((s) => s.trim()).filter(Boolean)) {
      const key = SKILL_BY_ZH[name];
      if (key && !out.some((r) => r.mode === 'fixed' && r.kind === 'skill' && r.skillKey === key)) {
        out.push({ id: `${option.id}#${out.length}`, kind: 'skill', mode: 'fixed', target: name, skillKey: key, sourceText: m.skills, sourceLabel: label(option) });
      }
    }
  }
  if (m.tools) {
    for (const name of m.tools.replace(/。$/, '').split(/[，,]/).map((s) => s.trim()).filter(Boolean)) {
      // 类别型任选（一种乐器/一种工匠工具/一种赌具）→ flexible + 类别候选表
      const categoryTool = matchToolCategory(name);
      if (categoryTool) {
        if (!out.some((r) => r.mode === 'flexible' && r.kind === 'tool')) {
          out.push({ id: `${option.id}#${out.length}`, kind: 'tool', mode: 'flexible', count: 1, candidates: categoryTool.candidates, sourceText: m.tools, sourceLabel: label(option) });
        }
        continue;
      }
      if (!out.some((r) => r.mode === 'fixed' && r.kind === 'tool' && r.target === name)) {
        out.push({ id: `${option.id}#${out.length}`, kind: 'tool', mode: 'fixed', target: name, sourceText: m.tools, sourceLabel: label(option) });
      }
    }
  }
  parseLanguages(option, m.languages || '', out);

  // 职业：savingThrows 直接是 AbilityKey
  if (Array.isArray(m.savingThrows)) {
    for (const key of m.savingThrows as AbilityKey[]) {
      if (!out.some((r) => r.mode === 'fixed' && r.kind === 'save' && r.saveKey === key)) {
        out.push({ id: `${option.id}#${out.length}`, kind: 'save', mode: 'fixed', saveKey: key, target: key, sourceText: m.savingThrows.join('、'), sourceLabel: label(option) });
      }
    }
  }

  parseTraitRules(option, option.traits || [], out);

  // 职业熟练项块（护甲/武器/工具/技能任选）在种子中缺失（见 classProficiencies.ts 头注），
  // 从手录表补齐任选规则：技能任选（如吟游诗人自选三项、游荡者四项）、工具任选（吟游诗人三种乐器）
  if (option.category === 'class') {
    const info = getClassProficiencyInfo(option.name);
    if (info) {
      if (info.skillsChoiceCount && !out.some((r) => r.kind === 'skill' && r.mode === 'flexible')) {
        out.push({
          id: `${option.id}#${out.length}`,
          kind: 'skill',
          mode: 'flexible',
          count: info.skillsChoiceCount,
          candidates: info.skillsCandidates,
          sourceText: info.skills || '',
          sourceLabel: label(option),
        });
      }
      if (info.toolsChoiceCount && !out.some((r) => r.kind === 'tool' && r.mode === 'flexible')) {
        out.push({
          id: `${option.id}#${out.length}`,
          kind: 'tool',
          mode: 'flexible',
          count: info.toolsChoiceCount,
          candidates: info.toolsCandidates,
          sourceText: info.tools || '',
          sourceLabel: label(option),
        });
      }
    }
  }
  rulesCache.set(option.id, out);
  return out;
}

/** 收集角色采用的选项链（种族 → 亚种、背景、职业）上的全部熟练规则，按来源顺序排列 */
export function collectProficiencyBonusRules(character: {
  race?: string;
  background?: string;
  profession?: { class?: string };
}): ProficiencyBonusRule[] {
  const out: ProficiencyBonusRule[] = [];

  const raceName = character.race;
  if (raceName) {
    const opt = optionStore.getByName(raceName);
    if (opt) {
      const chain: CharacterOption[] = [opt];
      if (opt.category === 'subrace' && opt.parentName) {
        const parent = optionStore.getByName(opt.parentName, 'race');
        if (parent) chain.unshift(parent);
      }
      for (const o of chain) out.push(...getProficiencyRules(o));
    }
  }

  if (character.background) {
    const bg = optionStore.getByName(character.background, 'background');
    if (bg) out.push(...getProficiencyRules(bg));
  }

  const className = character.profession?.class;
  if (className) {
    const cls = optionStore.getByName(className, 'class');
    if (cls) out.push(...getProficiencyRules(cls));
  }

  return out;
}

export interface PendingProfFlexible {
  rule: ProficiencyBonusRule;
  chosen: string[];
}

export interface GrantedChip {
  name: string;
  sourceLabel: string;
}

/** 手动来源标记（旧数据补充）：key = `skill:<skillKey>` / `save:<abilityKey>` / `<分类>:<条目名>` */
export type ProficiencySourceMarks = Record<string, string>;

const CHIP_CATEGORIES = ['armor', 'weapons', 'tools', 'languages'] as const;

/** 拆分标记 key：技能/豁免进对应表，四类条目进 chipMarks；未知前缀忽略（容错旧数据） */
export function splitSourceMarks(
  marks: ProficiencySourceMarks | undefined
): Pick<FinalProficiencies, 'skillMarks' | 'saveMarks' | 'chipMarks'> {
  const out = {
    skillMarks: {} as Partial<Record<SkillKey, string>>,
    saveMarks: {} as Partial<Record<AbilityKey, string>>,
    chipMarks: { armor: {}, weapons: {}, tools: {}, languages: {} } as FinalProficiencies['chipMarks'],
  };
  if (!marks) return out;
  for (const [key, value] of Object.entries(marks)) {
    if (!value) continue;
    const idx = key.indexOf(':');
    if (idx <= 0) continue;
    const kind = key.slice(0, idx);
    const name = key.slice(idx + 1);
    if (!name) continue;
    if (kind === 'skill') out.skillMarks[name as SkillKey] = value;
    else if (kind === 'save') out.saveMarks[name as AbilityKey] = value;
    else if ((CHIP_CATEGORIES as readonly string[]).includes(kind)) out.chipMarks[kind as 'armor'][name] = value;
  }
  return out;
}

export interface FinalProficiencies {
  /** 解析授予的技能：key → 来源标签列表（基线勾选另见 character.skills） */
  skillSources: Partial<Record<SkillKey, string[]>>;
  /** 解析授予的豁免：key → 来源标签列表 */
  saveSources: Partial<Record<AbilityKey, string[]>>;
  /** 解析授予的四类条目：基线芯片之外的额外项（按 name 去重） */
  grantedChips: Record<'armor' | 'weapons' | 'tools' | 'languages', GrantedChip[]>;
  /** 手动来源标记（仅展示，不参与判定；来源标记不进 skillSources/saveSources 以免被误当成解析授予点亮勾选） */
  skillMarks: Partial<Record<SkillKey, string>>;
  saveMarks: Partial<Record<AbilityKey, string>>;
  chipMarks: Record<'armor' | 'weapons' | 'tools' | 'languages', Record<string, string>>;
  /** 未选满的任选规则 */
  pendingFlexible: PendingProfFlexible[];
}

/**
 * 合并解析：规则 + 任选选择 → 解析授予的最终熟练集。
 * 独立导出以便弹窗用草稿 choices 实时预览；与基线（character.skills/proficiencies）的
 * 并集由调用方合成最终展示。
 */
export function buildFinalProficiencies(
  rules: ProficiencyBonusRule[],
  choices: Record<string, string[]>
): FinalProficiencies {
  const result: FinalProficiencies = {
    skillSources: {},
    saveSources: {},
    grantedChips: { armor: [], weapons: [], tools: [], languages: [] },
    skillMarks: {},
    saveMarks: {},
    chipMarks: { armor: {}, weapons: {}, tools: {}, languages: {} },
    pendingFlexible: [],
  };

  for (const rule of rules) {
    if (rule.mode === 'fixed') {
      if (rule.kind === 'skill' && rule.skillKey) {
        (result.skillSources[rule.skillKey] ??= []).push(rule.sourceLabel);
      } else if (rule.kind === 'save' && rule.saveKey) {
        (result.saveSources[rule.saveKey] ??= []).push(rule.sourceLabel);
      } else if (rule.target) {
        const kind = KIND_TO_CHIP[rule.kind];
        if (kind && !result.grantedChips[kind].some((c) => c.name === rule.target)) {
          result.grantedChips[kind].push({ name: rule.target, sourceLabel: rule.sourceLabel });
        }
      }
      continue;
    }
    // flexible：任选（选择存中文名；技能选择解析时反查 SkillKey）
    const chosen = [...new Set((choices[rule.id] ?? []).filter(Boolean))];
    if (chosen.length < (rule.count ?? 1)) {
      result.pendingFlexible.push({ rule, chosen });
      continue;
    }
    for (const name of chosen) {
      if (rule.kind === 'skill') {
        const key = SKILL_BY_ZH[name];
        if (key && !result.skillSources[key]) result.skillSources[key] = [rule.sourceLabel];
      } else {
        const kind = KIND_TO_CHIP[rule.kind];
        if (kind && !result.grantedChips[kind].some((c) => c.name === name)) {
          result.grantedChips[kind].push({ name, sourceLabel: rule.sourceLabel });
        }
      }
    }
  }

  return result;
}

/** 角色维度便捷入口：收集 + 合并 + 手动来源标记一步到位（页面只读展示用） */
export function computeFinalProficiencies(character: {
  race?: string;
  background?: string;
  profession?: { class?: string };
  proficiencyChoices?: Record<string, string[]>;
  proficiencySourceMarks?: Record<string, string>;
}): FinalProficiencies {
  const final = buildFinalProficiencies(collectProficiencyBonusRules(character), character.proficiencyChoices ?? {});
  const { skillMarks, saveMarks, chipMarks } = splitSourceMarks(character.proficiencySourceMarks);
  final.skillMarks = skillMarks;
  final.saveMarks = saveMarks;
  final.chipMarks = chipMarks;
  return final;
}
