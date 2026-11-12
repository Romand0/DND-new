// DM Toolkit - Character Detail Page Component
import { useState, useEffect, useRef, Fragment } from 'react';
import { useEditorState } from '@/data/editorState';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  Shield,
  Crosshair,
  Zap,
  Footprints,
  Star,
  Eye,
  Swords,
  ScrollText,
  Package,
  Coins,
  Scale,
  Sparkles,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  EyeOff,
  MoreHorizontal,
  Edit2,
  X,
  ArrowUpDown,
  Download,
  Library,
  Send,
  Undo2,
  Tag,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { Character, Abilities, AbilityScore, AbilityKey, SkillKey, ProficiencyCategory, Equipment, Attack, Feature, FeatureRole } from '@/types/character';
import type { CharacterOption } from '@/types/characterOption';
import type { Spell } from '@/types/spell';
import type { EquipmentItem } from '@/types/equipment';
import { characterStore, SKILL_LABELS } from '@/data/characterStore';
import { diffCharacter, summarizeDiff } from '@/lib/characterDiff';
import { submitChangeRequest } from '@/lib/api';
import type { CharacterDiffRow } from '@/types/changeRequest';
import statusLibrary from '@/data/statusLibrary';
import { useNumberInput, type UseNumberInputResult } from '@/hooks/useInput';
import { buildAbilityEntries, collectCharacterAbilityBonuses } from '@/data/abilityBonus';
import { computeFinalProficiencies, collectProficiencyBonusRules, buildFinalProficiencies } from '@/data/proficiencyBonus';
import { collectClassProficiencyEntries, collectOptionFeatureEntries } from '@/data/optionFeatures';
import { warmSeed, loadSeed } from '@/data/seedLoader';
import FeatureSystemView from '@/components/FeatureSystemView';
import type { SystemMember } from '@/data/systemView';
import { spellStore } from '@/data/spellStore';
import { equipmentStore } from '@/data/equipmentStore';
import { extractBaseFields } from '@/data/equipmentFactory';
import SpellPicker from '@/components/SpellPicker';
import EquipmentPicker from '@/components/EquipmentPicker';
import OptionPicker from '@/components/OptionPicker';
import optionStore from '@/data/optionStore';
import EquipmentEditor from '@/components/EquipmentEditor';
import AttackEditor from '@/components/AttackEditor';
import SyncButton from '@/components/SyncButton';
import CharacterLogPanel from '@/components/CharacterLogPanel';
import CharacterEquipmentCard from '@/components/CharacterEquipmentCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEquipmentActions } from '@/hooks/useEquipmentActions';
import TradeModal from '@/components/TradeModal';
import SpellMaterialRequirementBlock from '@/components/SpellMaterialRequirementBlock';

const abilityLabels: Record<AbilityKey, string> = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const proficiencyLabels: Record<ProficiencyCategory, string> = {
  armor: '护甲',
  weapons: '武器',
  tools: '工具',
  languages: '语言',
  savingThrows: '豁免熟练',
};

const displayedProficiencyCategories: Exclude<ProficiencyCategory, 'savingThrows'>[] = ['armor', 'weapons', 'tools', 'languages'];

// 特性区熟练类派生条目 → 集中卡片分组行标签（与 collectOptionFeatureEntries 派生名一一对应）
const proficiencyEntryLabels: Record<string, string> = {
  护甲熟练项: '护甲',
  武器熟练项: '武器',
  工具熟练项: '工具',
  技能熟练项: '技能',
  语言: '语言',
  装备: '装备',
};


// 角色有效等级：与顶栏「等级」展示同源（经验推导）。character.level 是独立存储字段，
// 旧数据/导入卡/云端行可能与经验脱节（显示 3 级、字段残留高值），用它过滤会全量放行
function charDisplayLevel(character: Character): number {
  return characterStore.getLevelFromExp(character.experience ?? 0) || 1;
}

// 特性解锁门槛：卡片 level 优先 → 选项库同名条目回填（旧卡未透传 level）→
// 描述文本「第X级时/起」解析兜底（旧选项库行无标注时仍能挡住未达等级条目；
// 严格正则与标注脚本 LEVEL_RE 一致，裸「第X级」引用不误伤 L1 特性）
const FEATURE_TEXT_LEVEL_RE = /第\s*(\d+)\s*级(?:时|起)/;

function seedFeatureLevelMap(character: Character): Map<string, number> {
  const seedLevelByKey = new Map<string, number>();
  for (const e of collectOptionFeatureEntries(character)) {
    if (e.level != null && e.level > 0) seedLevelByKey.set(`${e.category}:${e.name}`, e.level);
  }
  return seedLevelByKey;
}

function featureUnlockLevel(f: Feature, seedLevelByKey: Map<string, number>): number | undefined {
  if (typeof f.level === 'number' && f.level > 0) return f.level;
  const seeded = seedLevelByKey.get(`${f.category || ''}:${f.name}`)
    ?? seedLevelByKey.get(`职业特性:${f.name}`);
  if (seeded != null) return seeded;
  if (f.category === '职业特性' || !f.category) {
    const m = (f.description || '').match(FEATURE_TEXT_LEVEL_RE);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function isFeatureLevelUnlocked(f: Feature, charLevel: number, seedLevelByKey: Map<string, number>): boolean {
  const lv = featureUnlockLevel(f, seedLevelByKey);
  return lv == null || lv <= charLevel;
}

// ===== 特性作用方式分类（FeatureRole）=====
// 分类引擎共享于 src/data/featureRole.ts（战斗参战者弹窗的主动技能区也依赖同一套派生）
import { FEATURE_RENDER_ORDER, FEATURE_ROLE_META, deriveFeatureRole } from '@/data/featureRole';

function renderSpellDice(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\d+)d(4|6|8|10|12|20)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={key++} className="inline-flex items-baseline mx-0.5">
        <span className="text-primary font-bold">{match[1]}</span>
        <span className="px-1 py-0 mx-0.5 rounded bg-accent/20 text-accent font-mono font-semibold">
          d{match[2]}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts;
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border overflow-hidden dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <button
        data-section-toggle
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 transition-colors dark:hover:bg-card-dark-hover light:hover:bg-card-light-hover"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold dark:text-text-dark light:text-text-light">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

const ABILITY_KEYS: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

interface AbilityBreakdownDialogProps {
  character: Character;
  onClose: () => void;
  onSave: (baseAbilities: Abilities, abilityBonusChoices: Record<string, AbilityKey[]>) => void;
}

// 属性值统一弹窗：初始值行内可编辑 + 各特性加值组分解析 + 任选槽位选择，一次保存写回全部。
// 仅在打开时条件挂载：useNumberInput 的初始值即预填值；任选草稿独立于已存数据，未保存的修改可整体取消。
function AbilityBreakdownDialog({ character, onClose, onSave }: AbilityBreakdownDialogProps) {
  const strengthInput = useNumberInput(character.baseAbilities?.strength?.score ?? character.abilities.strength.score, { fallback: 10 });
  const dexterityInput = useNumberInput(character.baseAbilities?.dexterity?.score ?? character.abilities.dexterity.score, { fallback: 10 });
  const constitutionInput = useNumberInput(character.baseAbilities?.constitution?.score ?? character.abilities.constitution.score, { fallback: 10 });
  const intelligenceInput = useNumberInput(character.baseAbilities?.intelligence?.score ?? character.abilities.intelligence.score, { fallback: 10 });
  const wisdomInput = useNumberInput(character.baseAbilities?.wisdom?.score ?? character.abilities.wisdom.score, { fallback: 10 });
  const charismaInput = useNumberInput(character.baseAbilities?.charisma?.score ?? character.abilities.charisma.score, { fallback: 10 });

  const inputs: Record<AbilityKey, UseNumberInputResult> = {
    strength: strengthInput,
    dexterity: dexterityInput,
    constitution: constitutionInput,
    intelligence: intelligenceInput,
    wisdom: wisdomInput,
    charisma: charismaInput,
  };

  const [draftChoices, setDraftChoices] = useState<Record<string, AbilityKey[]>>(() => character.abilityBonusChoices ?? {});
  const rules = collectCharacterAbilityBonuses(character);
  const flexibleRules = rules.filter((r) => r.mode === 'flexible');

  // 实时预览：初始值取输入框当前业务值，任选取草稿（未保存的修改即时反映在组分与总和中）
  const preview = buildAbilityEntries(
    rules,
    {
      strength: inputs.strength.value ?? null,
      dexterity: inputs.dexterity.value ?? null,
      constitution: inputs.constitution.value ?? null,
      intelligence: inputs.intelligence.value ?? null,
      wisdom: inputs.wisdom.value ?? null,
      charisma: inputs.charisma.value ?? null,
    },
    draftChoices
  );

  // 任选单槽变更（只改草稿，保存时统一写回）；空槽过滤后压缩，与已存数据结构保持一致
  const setDraftChoice = (ruleId: string, slot: number, ability: AbilityKey | '') => {
    setDraftChoices((prev) => {
      const arr: (AbilityKey | '')[] = [...(prev[ruleId] ?? [])];
      while (arr.length < slot + 1) arr.push('');
      arr[slot] = ability;
      const cleaned = arr.filter((v): v is AbilityKey => !!v);
      const next = { ...prev };
      if (cleaned.length === 0) delete next[ruleId];
      else next[ruleId] = cleaned;
      return next;
    });
  };

  const handleSave = () => {
    const baseAbilities = {} as Abilities;
    for (const key of ABILITY_KEYS) {
      const score = inputs[key].value;
      if (score == null || score < 1 || score > 30) {
        alert('请输入 1-30 之间的有效属性值');
        return;
      }
      baseAbilities[key] = { score, modifier: characterStore.calcModifier(score) };
    }
    onSave(baseAbilities, draftChoices);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-1 dark:text-text-dark light:text-text-light">属性值解析</h3>
        <p className="text-sm mb-4 dark:text-text-dark-muted light:text-text-light-muted">
          初始值可直接修改，任选加值在下方选择；保存后写回并重算最终属性值
        </p>
        <div className="space-y-2">
          {ABILITY_KEYS.map((key) => {
            const entry = preview.entries[key];
            return (
              <div key={key} className="flex items-center gap-2 text-sm p-2 rounded-lg dark:bg-white/5 light:bg-white/50">
                <span className="w-12 shrink-0 font-medium dark:text-text-dark light:text-text-light">{abilityLabels[key]}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  title="初始属性值"
                  value={inputs[key].text}
                  onChange={(e) => inputs[key].onChange(e.target.value)}
                  onBlur={inputs[key].onBlur}
                  className="w-14 shrink-0 px-2 py-1 rounded-lg border text-center bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {entry.parts.length === 0 && <span>（无加值）</span>}
                  {entry.parts.map((p) => (
                    <span key={p.ruleId} className="text-primary">
                      {p.label} +{p.amount}
                    </span>
                  ))}
                </div>
                <span className="shrink-0 font-bold text-primary">= {entry.total}</span>
              </div>
            );
          })}
        </div>
        {flexibleRules.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">任选加值</div>
            {flexibleRules.map((rule) => {
              const chosen = draftChoices[rule.id] ?? [];
              const complete = chosen.length >= (rule.count ?? 1);
              return (
                <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg dark:bg-white/5 light:bg-white/50">
                  <div className="text-sm">
                    <span className="dark:text-text-dark light:text-text-light">{rule.sourceLabel}</span>
                    <span className={`ml-2 text-xs ${complete ? 'dark:text-text-dark-muted light:text-text-light-muted' : 'text-warning'}`}>
                      任选 {rule.count} 项各 +{rule.amount}{complete ? '' : '（待选择）'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: rule.count ?? 0 }).map((_, slot) => {
                      const current = chosen[slot] ?? '';
                      return (
                        <select
                          key={slot}
                          value={current}
                          onChange={(e) => setDraftChoice(rule.id, slot, e.target.value as AbilityKey | '')}
                          className={`px-2 py-1 rounded-lg border text-xs bg-transparent outline-none ${
                            current
                              ? 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light'
                              : 'border-warning text-warning'
                          }`}
                        >
                          <option value="">选择...</option>
                          {ABILITY_KEYS.filter((k) => k === current || !chosen.includes(k)).map((k) => (
                            <option key={k} value={k}>{abilityLabels[k]}</option>
                          ))}
                        </select>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {preview.pendingFlexible.length > 0 && (
          <p className="mt-3 text-xs text-warning dark:text-warning light:text-warning">
            有 {preview.pendingFlexible.length} 条任选加值尚未选满，完成后会计入最终值。
          </p>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10">
            取消
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProficienciesDialogProps {
  character: Character;
  onClose: () => void;
  onSave: (draft: {
    skills: Character['skills'];
    proficiencies: Character['proficiencies'];
    saveExpertise: AbilityKey[];
    saveBonusOverride: Partial<Record<AbilityKey, number>>;
    proficiencyChoices: Record<string, string[]>;
    proficiencySourceMarks: Record<string, string>;
  }) => void;
}

const PROF_KIND_LABEL: Record<string, string> = {
  skill: '技能', save: '豁免', tool: '工具', weapon: '武器', armor: '护甲', language: '语言',
};

// 熟练项统一弹窗，四层模式与「属性值解析」一致：
// ① 角色选项解析（固定规则只读展示 + 任选槽位选择，来源标记）
// ② 基线设置（手填勾选/专精/覆盖值/四类芯片，全部草稿态）
// ③ 最终值只读呈现（基线 ∪ 解析，经影子角色复用 getGroupedSkills 同口径计算）
// ④ 数据源标记（每条解析授予均标注 种族/亚种/背景/职业 来源）
function ProficienciesDialog({ character, onClose, onSave }: ProficienciesDialogProps) {
  const [draft, setDraft] = useState(() => ({
    skills: JSON.parse(JSON.stringify(character.skills ?? {})) as Character['skills'],
    savingThrows: [...(character.proficiencies?.savingThrows ?? [])] as string[],
    saveExpertise: [...(character.saveExpertise ?? [])],
    saveBonusOverride: { ...(character.saveBonusOverride ?? {}) } as Partial<Record<AbilityKey, number>>,
    categories: {
      armor: [...(character.proficiencies?.armor ?? [])],
      weapons: [...(character.proficiencies?.weapons ?? [])],
      tools: [...(character.proficiencies?.tools ?? [])],
      languages: [...(character.proficiencies?.languages ?? [])],
    },
  }));
  const [newChip, setNewChip] = useState<Record<Exclude<ProficiencyCategory, 'savingThrows'>, string>>({ armor: '', weapons: '', tools: '', languages: '' });
  // 覆盖值输入态：空串 = 未覆盖（回退属性调整值+熟练加值）
  const [overrideText, setOverrideText] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(character.saveBonusOverride ?? {})) {
      if (typeof v === 'number') init[k] = String(v);
    }
    return init;
  });
  // 任选规则的草稿选择（保存时写回 proficiencyChoices）
  const [draftChoices, setDraftChoices] = useState<Record<string, string[]>>(() => character.proficiencyChoices ?? {});
  // 手动来源标记草稿（旧数据补充，key = skill:<键> / save:<键> / <分类>:<条目名>）
  const [draftMarks, setDraftMarks] = useState<Record<string, string>>(() => character.proficiencySourceMarks ?? {});
  const [editingMark, setEditingMark] = useState<string | null>(null);
  const [markText, setMarkText] = useState('');

  // ① 选项解析：规则集 + 草稿任选 → 解析授予集
  const rules = collectProficiencyBonusRules(character);
  const final = buildFinalProficiencies(rules, draftChoices);
  const flexibleRules = rules.filter((r) => r.mode === 'flexible');

  // ③ 影子角色：草稿基线 ∪ 解析授予，复用 getGroupedSkills 的全部计算
  const shadowSkills: Character['skills'] = { ...draft.skills };
  for (const key of Object.keys(final.skillSources) as SkillKey[]) {
    const sk = shadowSkills[key];
    shadowSkills[key] = { ...(sk ?? { proficient: false, extra: 0, expertise: false }), proficient: true };
  }
  const shadowSaves = [...new Set([...draft.savingThrows, ...(Object.keys(final.saveSources) as AbilityKey[])])];
  const groups = characterStore.getGroupedSkills({
    ...character,
    skills: shadowSkills,
    proficiencies: { ...draft.categories, savingThrows: shadowSaves },
    saveExpertise: draft.saveExpertise,
    saveBonusOverride: draft.saveBonusOverride,
  });

  const toggleSkillProf = (key: SkillKey) => {
    setDraft((prev) => {
      const skill = { ...(prev.skills[key] ?? { proficient: false, extra: 0, expertise: false }) };
      skill.proficient = !skill.proficient;
      // 取消熟练时同步取消专精（与 store 的 toggleSkillProficiency 语义一致）
      if (!skill.proficient) skill.expertise = false;
      return { ...prev, skills: { ...prev.skills, [key]: skill } };
    });
  };
  const toggleSkillExp = (key: SkillKey) => {
    setDraft((prev) => {
      const skill = prev.skills[key];
      if (!skill?.proficient) return prev;
      return { ...prev, skills: { ...prev.skills, [key]: { ...skill, expertise: !skill.expertise } } };
    });
  };
  const toggleSaveProf = (key: AbilityKey) => {
    setDraft((prev) => {
      const has = prev.savingThrows.includes(key);
      const savingThrows = has ? prev.savingThrows.filter((k) => k !== key) : [...prev.savingThrows, key];
      // 取消熟练时同步取消专精
      const saveExpertise = has ? prev.saveExpertise.filter((k) => k !== key) : prev.saveExpertise;
      return { ...prev, savingThrows, saveExpertise };
    });
  };
  const toggleSaveExp = (key: AbilityKey) => {
    setDraft((prev) => {
      if (!prev.savingThrows.includes(key)) return prev;
      const saveExpertise = prev.saveExpertise.includes(key)
        ? prev.saveExpertise.filter((k) => k !== key)
        : [...prev.saveExpertise, key];
      return { ...prev, saveExpertise };
    });
  };
  const setOverride = (key: AbilityKey, raw: string) => {
    setOverrideText((prev) => ({ ...prev, [key]: raw }));
    setDraft((prev) => {
      const saveBonusOverride = { ...prev.saveBonusOverride };
      if (raw.trim() === '') delete saveBonusOverride[key];
      else {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) saveBonusOverride[key] = n;
      }
      return { ...prev, saveBonusOverride };
    });
  };
  const addChip = (category: Exclude<ProficiencyCategory, 'savingThrows'>) => {
    const value = newChip[category].trim();
    if (!value) return;
    setDraft((prev) => ({ ...prev, categories: { ...prev.categories, [category]: [...prev.categories[category], value] } }));
    setNewChip((prev) => ({ ...prev, [category]: '' }));
  };
  const removeChip = (category: Exclude<ProficiencyCategory, 'savingThrows'>, index: number) => {
    setDraft((prev) => ({ ...prev, categories: { ...prev.categories, [category]: prev.categories[category].filter((_, i) => i !== index) } }));
  };

  // 任选单槽变更（只改草稿，保存时统一写回）；空槽过滤后压缩，与已存数据结构保持一致
  const setDraftChoice = (ruleId: string, slot: number, value: string) => {
    setDraftChoices((prev) => {
      const arr: string[] = [...(prev[ruleId] ?? [])];
      while (arr.length < slot + 1) arr.push('');
      arr[slot] = value;
      const cleaned = arr.filter(Boolean);
      const next = { ...prev };
      if (cleaned.length === 0) delete next[ruleId];
      else next[ruleId] = cleaned;
      return next;
    });
  };

  // 来源标记行内编辑：空文本 = 删除标记；Enter 或失焦提交
  const startEditMark = (key: string) => {
    setEditingMark(key);
    setMarkText(draftMarks[key] ?? '');
  };
  const commitMark = () => {
    if (!editingMark) return;
    const key = editingMark;
    const text = markText.trim();
    setDraftMarks((prev) => {
      const next = { ...prev };
      if (text) next[key] = text;
      else delete next[key];
      return next;
    });
    setEditingMark(null);
    setMarkText('');
  };

  const handleSave = () => {
    onSave({
      skills: draft.skills,
      proficiencies: { ...draft.categories, savingThrows: draft.savingThrows },
      saveExpertise: draft.saveExpertise,
      saveBonusOverride: draft.saveBonusOverride,
      proficiencyChoices: draftChoices,
      proficiencySourceMarks: draftMarks,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-xl border p-6 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-1 dark:text-text-dark light:text-text-light">熟练项解析</h3>
        <p className="text-sm mb-4 dark:text-text-dark-muted light:text-text-light-muted">
          选项规则自动授予熟练；勾选为手填基线，二者并集为最终熟练项；任选加值在下方选择，保存后写回。
          熟练项旁的标签按钮可手动补充来源说明（适用于旧数据），仅作展示
        </p>

        {/* ① 角色选项解析：固定规则只读 + 任选槽位 */}
        <div className="mb-4">
          <div className="text-xs font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">选项解析规则</div>
          {rules.length === 0 ? (
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
              角色尚未选择种族/背景/职业选项，或所选选项无熟练项规则。
            </p>
          ) : (
            <div className="space-y-1.5">
              {rules.filter((r) => r.mode === 'fixed').map((rule) => (
                <div key={rule.id} className="flex flex-wrap items-center gap-2 p-2 rounded-lg dark:bg-white/5 light:bg-white/50">
                  <span className="text-xs text-primary">{rule.sourceLabel}</span>
                  <span className="text-sm dark:text-text-dark light:text-text-light">
                    {PROF_KIND_LABEL[rule.kind]}
                    {rule.kind === 'save' && rule.saveKey
                      ? ` · ${abilityLabels[rule.saveKey]}`
                      : rule.target
                        ? ` · ${rule.target}`
                        : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 豁免与技能：基线勾选（可编辑）+ 来源标记 + 最终态 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((group) => {
            const saveSources = final.saveSources[group.save.key];
            return (
            <div key={group.attribute} className="p-3 rounded-xl border dark:bg-white/5 light:bg-white/50 dark:border-border-dark light:border-border-light">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b dark:border-border-dark light:border-border-light">
                <span className="text-sm font-bold dark:text-text-dark light:text-text-light">{group.attributeLabel}</span>
                <span className="text-xs text-primary font-mono">
                  {group.save.modifier >= 0 ? `+${group.save.modifier}` : group.save.modifier}
                </span>
              </div>
              <div className={`flex flex-wrap items-center gap-2 p-1.5 rounded-lg mb-2 ${group.save.proficient ? 'bg-accent/10' : 'dark:bg-bg-dark/50 light:bg-bg-light-2/50'}`}>
                <button
                  onClick={() => toggleSaveExp(group.save.key)}
                  disabled={!group.save.proficient}
                  className={`w-4 h-4 flex items-center justify-center ${
                    group.save.proficient
                      ? group.save.expertise
                        ? 'text-accent'
                        : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-accent'
                      : 'dark:text-text-dark-muted/30 light:text-text-light-muted/30 cursor-not-allowed'
                  }`}
                  title={group.save.proficient ? (group.save.expertise ? '取消专精' : '设为专精') : '需要熟练才能专精'}
                >
                  <Star className={`w-3.5 h-3.5 ${group.save.expertise ? 'fill-accent' : ''}`} />
                </button>
                <input
                  type="checkbox"
                  checked={group.save.proficient}
                  onChange={() => toggleSaveProf(group.save.key)}
                  title="基线勾选（手动授予）"
                  className="w-4 h-4 accent-accent"
                />
                <span className={`text-xs flex-1 min-w-[3rem] ${group.save.proficient ? 'font-medium dark:text-text-dark light:text-text-light' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>
                  {group.save.label}
                </span>
                {saveSources && (
                  <span className="text-[10px] text-primary" title="选项解析授予">{saveSources.join('、')}</span>
                )}
                {group.save.proficient && (
                  <button
                    onClick={() => startEditMark(`save:${group.save.key}`)}
                    title="手动来源标记（旧数据补充）"
                    className={editingMark === `save:${group.save.key}` || draftMarks[`save:${group.save.key}`]
                      ? 'text-primary'
                      : 'dark:text-text-dark-muted/40 light:text-text-light-muted/40 hover:text-primary'}
                  >
                    <Tag className="w-3 h-3" />
                  </button>
                )}
                {group.save.proficient && draftMarks[`save:${group.save.key}`] && (
                  <span className="text-[10px] text-primary/80" title="手动来源标记">{draftMarks[`save:${group.save.key}`]}</span>
                )}
                <input
                  type="number"
                  value={overrideText[group.save.key] ?? ''}
                  onChange={(e) => setOverride(group.save.key, e.target.value)}
                  placeholder={`${group.save.bonus >= 0 ? '+' : ''}${group.save.bonus}`}
                  title="留空回退到属性调整值+熟练加值"
                  className={`w-14 px-1.5 py-0.5 text-xs text-center font-mono rounded border bg-transparent outline-none dark:border-accent light:border-accent dark:text-text-dark light:text-text-light focus:border-accent ${
                    group.save.overridden ? 'text-accent' : ''
                  }`}
                />
              </div>
              {editingMark === `save:${group.save.key}` && (
                <div className="flex items-center gap-2 pl-6 mb-1">
                  <Tag className="w-3 h-3 text-primary flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    value={markText}
                    onChange={(e) => setMarkText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitMark()}
                    onBlur={commitMark}
                    placeholder="来源说明，如：职业 · 游荡者（旧数据）"
                    className="flex-1 px-2 py-1 text-xs rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  />
                </div>
              )}
              {group.skills.map((skill) => {
                const sources = final.skillSources[skill.key];
                return (
                <Fragment key={skill.key}>
                <div className={`flex flex-wrap items-center gap-2 p-1.5 rounded-lg ${skill.proficient ? 'bg-primary/10' : 'dark:bg-bg-dark/50 light:bg-bg-light-2/50'}`}>
                  <button
                    onClick={() => toggleSkillExp(skill.key)}
                    disabled={!skill.proficient}
                    className={`w-4 h-4 flex items-center justify-center ${
                      skill.proficient
                        ? skill.expertise
                          ? 'text-primary'
                          : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
                        : 'dark:text-text-dark-muted/30 light:text-text-light-muted/30 cursor-not-allowed'
                    }`}
                    title={skill.proficient ? (skill.expertise ? '取消专精' : '设为专精') : '需要熟练才能专精'}
                  >
                    <Star className={`w-3.5 h-3.5 ${skill.expertise ? 'fill-primary' : ''}`} />
                  </button>
                  <input
                    type="checkbox"
                    checked={skill.proficient}
                    onChange={() => toggleSkillProf(skill.key)}
                    title="基线勾选（手动授予）"
                    className="w-4 h-4 accent-primary"
                  />
                  <span className={`text-xs flex-1 min-w-[3rem] ${skill.proficient ? 'font-medium dark:text-text-dark light:text-text-light' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>
                    {skill.label}
                  </span>
                  {sources && (
                    <span className="text-[10px] text-primary" title="选项解析授予">{sources.join('、')}</span>
                  )}
                  {skill.proficient && (
                    <button
                      onClick={() => startEditMark(`skill:${skill.key}`)}
                      title="手动来源标记（旧数据补充）"
                      className={editingMark === `skill:${skill.key}` || draftMarks[`skill:${skill.key}`]
                        ? 'text-primary'
                        : 'dark:text-text-dark-muted/40 light:text-text-light-muted/40 hover:text-primary'}
                    >
                      <Tag className="w-3 h-3" />
                    </button>
                  )}
                  {skill.proficient && draftMarks[`skill:${skill.key}`] && (
                    <span className="text-[10px] text-primary/80" title="手动来源标记">{draftMarks[`skill:${skill.key}`]}</span>
                  )}
                  <span className={`text-xs font-mono font-bold w-8 text-right ${skill.proficient ? 'dark:text-text-dark light:text-text-light' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>
                    {skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus}
                  </span>
                </div>
                {editingMark === `skill:${skill.key}` && (
                  <div className="flex items-center gap-2 pl-6 my-1">
                    <Tag className="w-3 h-3 text-primary flex-shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={markText}
                      onChange={(e) => setMarkText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && commitMark()}
                      onBlur={commitMark}
                      placeholder="来源说明，如：种族 · 半精灵（旧数据）"
                      className="flex-1 px-2 py-1 text-xs rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                )}
                </Fragment>
                );
              })}
              {group.skills.length === 0 && (
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted text-center py-1">无关联技能</div>
              )}
            </div>
            );
          })}
        </div>

        {/* 任选规则槽位 */}
        {flexibleRules.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">任选熟练项</div>
            {flexibleRules.map((rule) => {
              const chosen = draftChoices[rule.id] ?? [];
              const complete = chosen.length >= (rule.count ?? 1);
              const optionsForSlot = (slot: number) => {
                if (rule.candidates) return rule.candidates;
                if (rule.kind === 'skill') return Object.values(SKILL_LABELS);
                return null; // 自由文本
              };
              return (
                <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg dark:bg-white/5 light:bg-white/50">
                  <div className="text-sm">
                    <span className="text-primary">{rule.sourceLabel}</span>
                    <span className={`ml-2 dark:text-text-dark light:text-text-light`}>
                      {PROF_KIND_LABEL[rule.kind]}任选 {rule.count} 项{rule.candidates ? `（${rule.candidates.join('/')}）` : ''}
                    </span>
                    <span className={`ml-2 text-xs ${complete ? 'dark:text-text-dark-muted light:text-text-light-muted' : 'text-warning'}`}>
                      {complete ? '已选满' : '待选择'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: rule.count ?? 0 }).map((_, slot) => {
                      const current = chosen[slot] ?? '';
                      const options = optionsForSlot(slot);
                      return options ? (
                        <select
                          key={slot}
                          value={current}
                          onChange={(e) => setDraftChoice(rule.id, slot, e.target.value)}
                          className={`px-2 py-1 rounded-lg border text-xs bg-transparent outline-none ${
                            current
                              ? 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light'
                              : 'border-warning text-warning'
                          }`}
                        >
                          <option value="">选择...</option>
                          {options.filter((o) => o === current || !chosen.includes(o)).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          key={slot}
                          type="text"
                          value={current}
                          onChange={(e) => setDraftChoice(rule.id, slot, e.target.value)}
                          placeholder="输入名称..."
                          className="w-24 px-2 py-1 rounded-lg border text-xs bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 四类熟练项：基线芯片（可编辑）+ 解析授予（来源标记） */}
        <div className="mt-4">
          <div className="text-xs font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">护甲 / 武器 / 工具 / 语言</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedProficiencyCategories.map((category) => {
              const granted = final.grantedChips[category];
              return (
              <div key={category}>
                <label className="block text-xs mb-1.5 dark:text-text-dark-muted light:text-text-light-muted">{proficiencyLabels[category]}</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {draft.categories[category].length === 0 && granted.length === 0 && (
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">无</span>
                  )}
                  {draft.categories[category].map((item, index) => (
                    <div key={index} className="flex items-center gap-1 px-2 py-1 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                      <span className="text-xs dark:text-text-dark light:text-text-light">{item}</span>
                      {draftMarks[`${category}:${item}`] && (
                        <span className="text-[10px] text-primary/80" title="手动来源标记">{draftMarks[`${category}:${item}`]}</span>
                      )}
                      <button
                        onClick={() => startEditMark(`${category}:${item}`)}
                        title="手动来源标记（旧数据补充）"
                        className={editingMark === `${category}:${item}` || draftMarks[`${category}:${item}`]
                          ? 'text-primary'
                          : 'dark:text-text-dark-muted/40 light:text-text-light-muted/40 hover:text-primary'}
                      >
                        <Tag className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeChip(category, index)} className="p-0.5 rounded hover:bg-danger/20 text-danger flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {granted.filter((g) => !draft.categories[category].includes(g.name)).map((g, i) => (
                    <div key={`granted-${i}`} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10"
                      title={`选项解析授予：${g.sourceLabel}`}>
                      <span className="text-xs text-primary">{g.name}</span>
                      <span className="text-[10px] text-primary/70">{g.sourceLabel}</span>
                      {draftMarks[`${category}:${g.name}`] && (
                        <span className="text-[10px] text-primary/80" title="手动来源标记">+ {draftMarks[`${category}:${g.name}`]}</span>
                      )}
                      <button
                        onClick={() => startEditMark(`${category}:${g.name}`)}
                        title="手动来源标记（旧数据补充）"
                        className={editingMark === `${category}:${g.name}` ? 'text-primary' : 'text-primary/50 hover:text-primary'}
                      >
                        <Tag className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {editingMark?.startsWith(`${category}:`) && (
                  <div className="flex items-center gap-2 mb-2">
                    <Tag className="w-3 h-3 text-primary flex-shrink-0" />
                    <span className="text-xs dark:text-text-dark light:text-text-light flex-shrink-0">
                      {editingMark.slice(category.length + 1)}
                    </span>
                    <input
                      autoFocus
                      type="text"
                      value={markText}
                      onChange={(e) => setMarkText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && commitMark()}
                      onBlur={commitMark}
                      placeholder="来源说明，如：背景 · 士兵（旧数据）"
                      className="flex-1 px-2 py-1 text-xs rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newChip[category]}
                    onChange={(e) => setNewChip({ ...newChip, [category]: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && addChip(category)}
                    placeholder="添加基线..."
                    className="flex-1 px-2 py-1.5 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  />
                  <button onClick={() => addChip(category)} className="px-2 py-1.5 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10">
            取消
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-lg">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CharacterDetail({
  readOnly = false,
  draftMode = false,
  externalCharacter = null,
  onExitDraft,
}: {
  readOnly?: boolean;
  /** 玩家变更请求编辑态：store 写入被草稿会话劫持，顶部显示提交/放弃横幅 */
  draftMode?: boolean;
  externalCharacter?: Character | null;
  /** 提交成功或放弃草稿后回调（PlayerView 退出编辑态回只读视图） */
  onExitDraft?: () => void;
} = {}) {

  try {


  // PlayerView 以 /player/:playerId 路由挂载本组件（路由参数名不同），此时靠 externalCharacter 兜底
  const params = useParams<{ id: string }>();
  const { id: routeId } = params;
  const { id } = { id: routeId ?? externalCharacter?.id };
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(externalCharacter);
  const [loading, setLoading] = useState(true);
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const [selectedSpellType, setSelectedSpellType] = useState<'cantrip' | 'spell'>('cantrip');
  const [expandedCantrips, setExpandedCantrips] = useState<Set<number>>(new Set());
  const [expandedSpells, setExpandedSpells] = useState<Set<number>>(new Set());
  const [allSpells, setAllSpells] = useState<Spell[]>([]);
  const [spellsLoaded, setSpellsLoaded] = useState(false);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [expandedEquipment, setExpandedEquipment] = useState<Set<string>>(new Set());
  // 特性卡片隐藏偏好：DM 不常查看的特质（已被其他模块计入）可点眼睛图标隐藏，
  // 被隐藏的条目收进列表底部的「…」折叠块；按「分类:名称」持久化到 localStorage，
  // 跨角色通用，重新点选选项库后名称不变、隐藏状态保持
  const [hiddenFeatures, setHiddenFeatures] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('DND-feature-hidden') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [hiddenFeaturesOpen, setHiddenFeaturesOpen] = useState(false);
  // 特性作用方式筛选（localStorage 持久，跨会话记住浏览视角）
  // 作用方式筛选页（无「全部」页：查找用搜索替代），旧 localStorage 里存的 'all' 视为无效回默认
  const [featureRoleFilter, setFeatureRoleFilter] = useState<FeatureRole | 'system'>(() => {
    try {
      const saved = localStorage.getItem('dnd-feature-role-filter');
      if (saved === 'stat' || saved === 'passive' || saved === 'active' || saved === 'profile' || saved === 'system') return saved;
    } catch { /* ignore */ }
    return 'active';
  });
  useEffect(() => {
    try { localStorage.setItem('dnd-feature-role-filter', featureRoleFilter); } catch { /* ignore */ }
  }, [featureRoleFilter]);
  // 预热选项库种子：特性刷新/体系分页都依赖种子标注（level/system），本页此前不触发加载，
  // localStorage 缓存为旧版本（无标注）或为空时，页面会拿旧数据渲染出未达等级条目
  useEffect(() => {
    warmSeed('options');
  }, []);
  // 特性搜索：跨作用方式分类按名称与描述匹配（替代原「全部」页的查找职能）
  const [featureSearch, setFeatureSearch] = useState('');
  // 手动归类下拉：记录当前展开菜单的 feature id（空串关闭）；点选直接落到目标分类
  const [roleMenuId, setRoleMenuId] = useState('');
  // 隐藏操作需二次确认（防误触）；恢复显示无破坏性，直接执行
  const [hideConfirmKey, setHideConfirmKey] = useState<string | null>(null);
  const toggleFeatureHidden = (key: string) => {
    setHiddenFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('DND-feature-hidden', JSON.stringify([...next]));
      return next;
    });
  };
  const [tradeOpen, setTradeOpen] = useState(false);
  const [equipmentEditorOpen, setEquipmentEditorOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { id: string }) | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [proficienciesOpen, setProficienciesOpen] = useState(false);
  // 数据来源对话框：技能/豁免/四类条目的解析授予与手动标记汇总展示（页面只读区徽标点击展开）
  const [sourceDialog, setSourceDialog] = useState<{
    name: string;
    kindLabel: string;
    parsed: string[];
    manual?: string;
  } | null>(null);
  const [statsEditorOpen, setStatsEditorOpen] = useState(false);
  const [statsForm, setStatsForm] = useState({
    currentHp: 0,
    maxHp: 0,
    tempHp: 0,
    armorClass: 0,
    speed: 0,
    proficiencyBonus: 2,
  });
  const [genderPickerOpen, setGenderPickerOpen] = useState(false);
  const [attackEditorOpen, setAttackEditorOpen] = useState(false);
  const [editingAttack, setEditingAttack] = useState<(Attack & { id: string }) | null>(null);

  useEditorState(spellPickerOpen, equipmentPickerOpen, equipmentEditorOpen, statsEditorOpen, genderPickerOpen, attackEditorOpen);

  const genderOptions = [
    { value: 'male', label: '男', icon: '♂', color: 'text-info' },
    { value: 'female', label: '女', icon: '♀', color: 'text-danger' },
    { value: 'other', label: '其他', icon: '⚧', color: 'text-accent' },
    { value: '', label: '不显示', icon: '—', color: 'dark:text-text-dark-muted light:text-text-light-muted' },
  ] as const;

  const getGenderDisplay = () => {
    if (!character?.gender) return null;
    const option = genderOptions.find((o) => o.value === character.gender);
    return option || null;
  };

  const handleSelectGender = (gender: string) => {
    if (!id) return;
    characterStore.update(id, { gender: gender as any });
    reloadChar();
    setGenderPickerOpen(false);
  };

  const getSpellByName = (name: string): Spell | undefined => {
  let found = allSpells.find((s) => s.name === name);
  if (!found && spellsLoaded) {
    // D1 已加载完仍没命中，再试一次 spellStore 兜底（旧本地数据）
    found = spellStore.getAll().find((s) => s.name === name);
  }
  return found;
};


  const getSelectedSpellNames = (): string[] => {
    if (!character) return [];
    return [...character.spells.cantrips, ...character.spells.custom];
  };

  const toggleCantripExpand = (index: number) => {
    setExpandedCantrips((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSpellExpand = (index: number) => {
    setExpandedSpells((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectSpell = (spell: Spell) => {
    if (!id) return;
    if (selectedSpellType === 'cantrip') {
      characterStore.addCantrip(id, spell.name);
    } else {
      characterStore.addCustomSpell(id, spell.name);
    }
    reloadChar();
  };

  useEffect(() => {
    // draftMode 下草稿会话接管 character state，外部正式卡刷新不覆盖草稿
    if (draftMode) return;
    if (externalCharacter) {
      setCharacter(externalCharacter);
      setLoading(false);
      return;
    }
    if (id) {
      const char = characterStore.get(id);
      setCharacter(char);
      setLoading(false);
    }
  }, [id, externalCharacter, draftMode]);

  // draftMode 生命周期：正式卡快照存基准（diff 与 baseUpdatedAt 用），开启草稿会话劫持 store 读写
  const baseCardRef = useRef<Character | null>(null);
  const draftBegunRef = useRef(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitNote, setSubmitNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const draftDiffRows: CharacterDiffRow[] = draftMode && character && baseCardRef.current
    ? diffCharacter(baseCardRef.current, character)
    : [];

  useEffect(() => {
    if (!draftMode || !character || draftBegunRef.current) return;
    draftBegunRef.current = true;
    baseCardRef.current = externalCharacter;
    const draft = characterStore.beginDraftSession(character.id);
    // 有暂存草稿（刷新恢复）则用它，否则会话内即正式卡副本
    if (draft) setCharacter(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftMode, character?.id]);

  // 卸载兜底：提交成功路径已 commit（会话清空后 discard 幂等），放弃/直接离开由这里清理
  useEffect(() => {
    return () => {
      if (draftBegunRef.current && id) characterStore.discardDraftSession(id);
    };
  }, [id]);

  const handleDiscardDraft = () => {
    if (!character) return;
    if (!window.confirm('放弃未提交的草稿？所有修改将被丢弃')) return;
    characterStore.discardDraftSession(character.id);
    onExitDraft?.();
  };

  const handleSubmitDraft = async () => {
    if (!character || !baseCardRef.current) return;
    if (draftDiffRows.length === 0) {
      alert('没有检测到变更，请先修改角色卡数据');
      return;
    }
    setSubmitting(true);
    try {
      await submitChangeRequest(character.id, character, baseCardRef.current.updatedAt ?? 0, submitNote.trim());
      characterStore.commitDraftSession(character.id);
      alert('变更请求已提交，等待 DM 审批');
      setSubmitDialogOpen(false);
      onExitDraft?.();
    } catch (e) {
      alert(`提交失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  // 选项库种子 chunk 晚到时重渲染一次（亚种下拉的条件渲染依赖 getSubraces）
  const [, setOptionTick] = useState(0);
  useEffect(() => optionStore.subscribe(() => setOptionTick((t) => t + 1)), []);

  // 打开角色时按基线重算一次最终属性值：选项缓存异步加载会改变规则集，
  // 不重算则静态值滞留旧底、与属性解析口径漂移（基线未设置时 recompute 自动跳过）
  useEffect(() => {
    // draftMode 下基线重算同样走草稿会话（begin effect 先行建立会话）
    if (draftMode && id) {
      characterStore.recomputeAbilities(id);
      return;
    }
    if (id && !externalCharacter) {
      characterStore.recomputeAbilities(id);
    }
  }, [id, externalCharacter, draftMode]);

  useEffect(() => {
  let cancelled = false;
  fetch('/api/spells')
    .then(res => res.json())
    .then(data => {
      if (cancelled) return;
      const spells = Array.isArray(data) ? data : (data.data || []);
      setAllSpells(spells);
      setSpellsLoaded(true);
    })
    .catch(err => {
      console.error('获取法术库失败，降级到 spellStore', err);
      setAllSpells(spellStore.getAll());
      setSpellsLoaded(true);
    });
  return () => { cancelled = true; };
}, []);

  const reloadChar = () => {
    if (id) {
      const char = characterStore.get(id);
      setCharacter(char);
    }
  };

  const {
  handleAddEquipmentFromLibrary: hookHandleAddEquipmentFromLibrary,
  handleSaveEquipment: hookHandleSaveEquipment,
  handleDeleteEquipment: hookHandleDeleteEquipment,
  handleUpdateEquipmentQuantity: hookHandleUpdateEquipmentQuantity,
} = useEquipmentActions(id, reloadChar);

    
  // 统一保存：基线 + 任选选择一次写回，再重算最终属性值
  const handleSaveAbilityLayers = (baseAbilities: Abilities, abilityBonusChoices: Record<string, AbilityKey[]>) => {
    if (!id) return;
    characterStore.update(id, { baseAbilities, abilityBonusChoices });
    characterStore.recomputeAbilities(id);
    reloadChar();
    setBreakdownOpen(false);
  };

  const handleAddAttack = () => {
    setEditingAttack(null);
    setAttackEditorOpen(true);
  };

  const handleEditAttack = (attack: Attack & { id: string }) => {
    setEditingAttack(attack);
    setAttackEditorOpen(true);
  };

  const handleSaveAttack = (attack: Attack) => {
    if (!id || !character) return;
    let updatedAttacks: Attack[];
    if (editingAttack) {
      updatedAttacks = character.attacks.map((a) =>
        a.id === editingAttack.id ? { ...attack, id: editingAttack.id } : a
      );
    } else {
      updatedAttacks = [...character.attacks, { ...attack, id: `attack-${Date.now()}` }];
    }
    characterStore.update(id, { attacks: updatedAttacks });
    reloadChar();
    setAttackEditorOpen(false);
    setEditingAttack(null);
  };

  const handleDeleteAttack = () => {
    if (!id || !editingAttack || !character) return;
    const updatedAttacks = character.attacks.filter((a) => a.id !== editingAttack.id);
    characterStore.update(id, { attacks: updatedAttacks });
    reloadChar();
    setAttackEditorOpen(false);
    setEditingAttack(null);
  };

  const handleDeleteAttackDirect = (attackId: string) => {
    if (!id || !character) return;
    const updatedAttacks = character.attacks.filter((a) => a.id !== attackId);
    characterStore.update(id, { attacks: updatedAttacks });
    reloadChar();
  };

  const handleAddEquipment = () => {
    setEditingEquipment(null);
    setEquipmentEditorOpen(true);
  };

  const handleEditEquipment = (item: Equipment & { id: string }) => {
    setEditingEquipment(item);
    setEquipmentEditorOpen(true);
  };

  const handleAddEquipmentFromLibrary = (item: EquipmentItem, quantity?: number) => {
  if (!id) return;
  const temp = hookHandleAddEquipmentFromLibrary(item, quantity);
  if (temp) {
    setEditingEquipment(temp);
    setEquipmentEditorOpen(true);
  }
};

 const handleDeleteEquipmentConfirm = () => {
  if (!deleteConfirmId) return;
  hookHandleDeleteEquipment(deleteConfirmId);
  setDeleteConfirmId(null);
};

  const handleUpdateEquipmentQuantity = (equipId: string, delta: number) => {
  hookHandleUpdateEquipmentQuantity(equipId, delta);
};
  

  const handleSortEquipment = () => {
    if (!id || !character) return;
    const categoryOrder = ['武器', '护甲', '法器', '工具', '药水', '法术材料', '卷轴', '杂物'];
    const sorted = [...character.equipment].sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.category);
      const bIndex = categoryOrder.indexOf(b.category);
      const aRank = aIndex === -1 ? categoryOrder.length : aIndex;
      const bRank = bIndex === -1 ? categoryOrder.length : bIndex;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    characterStore.update(id, { equipment: sorted });
    reloadChar();
  };


  const handleOpenStatsEditor = () => {
    if (!character) return;
    setStatsForm({
      currentHp: character.currentHp,
      maxHp: character.maxHp,
      tempHp: character.tempHp,
      armorClass: character.armorClass,
      speed: character.speed,
      proficiencyBonus: character.proficiencyBonus,
    });
    setStatsEditorOpen(true);
  };

  const handleSaveStats = () => {
    if (!id) return;
    characterStore.update(id, {
      currentHp: statsForm.currentHp || 0,
      maxHp: statsForm.maxHp || 0,
      tempHp: statsForm.tempHp || 0,
      armorClass: statsForm.armorClass || 0,
      speed: statsForm.speed || 0,
      proficiencyBonus: Math.max(2, Math.min(6, statsForm.proficiencyBonus || 2)),
    });
    reloadChar();
    setStatsEditorOpen(false);
  };

  const toggleEquipmentExpand = (equipId: string) => {
    setExpandedEquipment((prev) => {
      const next = new Set(prev);
      if (next.has(equipId)) {
        next.delete(equipId);
      } else {
        next.add(equipId);
      }
      return next;
    });
  };

  // 从选项库填充特质：先移除角色卡上指定分类的旧特质，再写入新特质（完整替换，
  // 更换种族/职业/背景时避免新旧混杂）；basePatch 顺带合并一次 update。
  // 职业特性全量写入并携带 level，显示层按角色等级过滤（升级后自动出现新特性）；
  // role 随选项库种子标注透传（无标注的条目保持缺省走关键词派生）
  const applyOptionTraits = (
    basePatch: Partial<Character>,
    traits: { name: string; text: string; level?: number; role?: FeatureRole; system?: string; systemKind?: Feature['systemKind'] }[],
    removeCategories: string[],
    category: string,
    source: string
  ) => {
    if (!id) return;
    const kept = (character.features || []).filter(
      (f) => !removeCategories.includes(f.category)
    );
    const fresh = traits
      .filter((t) => t.name && t.text)
      .map((t) => ({
        id: crypto.randomUUID(),
        name: t.name,
        description: t.text,
        category,
        source,
        level: t.level,
        role: t.role,
        system: t.system,
        systemKind: t.systemKind,
      }));
    characterStore.update(id, { ...basePatch, features: [...kept, ...fresh] });
    return fresh.length;
  };

  const handleRaceSelect = (opt: CharacterOption) => {
    // 换种族时亚种特质一并失效（旧亚种归属旧种族）
    applyOptionTraits({ race: opt.name }, opt.traits, ['种族特质', '亚种特质'], '种族特质', opt.name);
    // 旧种族的任选加值记录随种族失效，重算最终属性值
    if (id) {
      characterStore.update(id, { abilityBonusChoices: {} });
      characterStore.recomputeAbilities(id);
    }
    reloadChar();
  };

  const handleSubraceSelect = (opt: CharacterOption) => {
    applyOptionTraits(
      { race: opt.name },
      opt.traits,
      ['亚种特质'],
      '亚种特质',
      opt.parentName || opt.name
    );
    if (id) {
      characterStore.update(id, { abilityBonusChoices: {} });
      characterStore.recomputeAbilities(id);
    }
    reloadChar();
  };

  const handleClassSelect = (opt: CharacterOption) => {
    // 熟练项块（护甲/武器/工具/技能任选）种子缺失，从手录表随职业特性一并写入
    const profTraits = collectClassProficiencyEntries(opt.name).map((e) => ({ name: e.name, text: e.description, role: e.role }));
    applyOptionTraits(
      { profession: { ...character.profession, class: opt.name } },
      [...(opt.traits || []), ...profTraits],
      ['职业特性'],
      '职业特性',
      opt.name
    );
    reloadChar();
  };

  const handleBackgroundSelect = (opt: CharacterOption) => {
    const traits: { name: string; text: string; role?: FeatureRole }[] = [];
    if (opt.feature) traits.push(opt.feature);
    if (opt.mechanics?.skills) traits.push({ name: '技能熟练项', text: opt.mechanics.skills, role: 'stat' });
    if (opt.mechanics?.tools) traits.push({ name: '工具熟练项', text: opt.mechanics.tools, role: 'stat' });
    if (opt.mechanics?.languages) traits.push({ name: '语言', text: opt.mechanics.languages, role: 'profile' });
    if (opt.mechanics?.equipment) traits.push({ name: '装备', text: opt.mechanics.equipment, role: 'stat' });
    applyOptionTraits({ background: opt.name }, traits, ['背景特性'], '背景特性', opt.name);
    reloadChar();
  };

  // 刷新：以选项库为准重新同步特性/特质（升级自旧的「补全」——补全只加缺失，库内容更新后
  // 卡上残留旧版描述、库中已移除的条目也清不掉）。同步规则：
  //  · 选项链期望集内的条目 → 用库最新版整组重建（描述/等级/来源随库走，库删卡也删）
  //  · 期望集外的条目（手动添加的自建条目、旧数据遗留）→ 原样保留
  // 隐藏状态按「分类:名称」存 localStorage，与条目 id 无关，重建后自然延续
  // 刷新进行中标记：等待种子就绪期间防重复点击
  const [refreshingFeatures, setRefreshingFeatures] = useState(false);
  const handleRefreshOptionFeatures = async () => {
    if (!id || !character || refreshingFeatures) return;
    setRefreshingFeatures(true);
    try {
      // 先确保选项库种子就绪（页面刚打开种子未就绪时点击也能拿到最新库）：
      // 索引已强制重验 + 版本变化自动重拉，await 后 expected 集一定来自最新种子
      await loadSeed('options');
      const expected = collectOptionFeatureEntries(character);
      const expectedKeys = new Set(expected.map((e) => `${e.category}:${e.name}`));
      const oldFeatures = character.features || [];
      const kept = oldFeatures.filter((f) => !expectedKeys.has(`${f.category || ''}:${f.name}`));
      const oldKeys = new Set(oldFeatures.map((f) => `${f.category || ''}:${f.name}`));
      const addedCount = expected.filter((e) => !oldKeys.has(`${e.category}:${e.name}`)).length;
      const fresh = expected.map((e) => ({
        id: crypto.randomUUID(),
        name: e.name,
        description: e.description,
        category: e.category,
        source: e.source,
        level: e.level,
        role: e.role,
        system: e.system,
        systemKind: e.systemKind,
      }));
      characterStore.update(id, { features: [...fresh, ...kept] });
      reloadChar();
      alert(
        `已按选项库刷新：同步 ${fresh.length} 条（其中新增 ${addedCount} 条），` +
          `替换旧版 ${oldFeatures.length - kept.length} 条，保留自建 ${kept.length} 条`
      );
    } finally {
      setRefreshingFeatures(false);
    }
  };

  // 集中熟练卡片行内编辑：熟练类条目描述直接改角色卡 features（不进整卡编辑器）
  const [editProfId, setEditProfId] = useState<string | null>(null);
  const [editProfText, setEditProfText] = useState('');
  const saveProfDescription = () => {
    if (!id || !editProfId) {
      setEditProfId(null);
      return;
    }
    characterStore.update(id, {
      features: (character?.features || []).map((f) =>
        f.id === editProfId ? { ...f, description: editProfText } : f
      ),
    });
    reloadChar();
    setEditProfId(null);
  };

  // 手动归类：下拉直选目标作用方式，显式写回 role（优先于关键词派生）；同分类直接关闭菜单
  const handleAddSystemMember = (member: SystemMember) => {
    if (!id || readOnly) return;
    const exists = (character.features || []).some(
      (f) => f.name === member.name || f.name === member.optionName
    );
    if (exists) return;
    characterStore.update(id, {
      features: [
        ...(character.features || []),
        {
          id: crypto.randomUUID(),
          name: member.name,
          description: member.description,
          category: member.category,
          source: member.source,
          level: member.level,
          role: member.role,
          system: member.system,
          systemKind: 'member' as const,
        },
      ],
    });
    reloadChar();
  };

  const pickFeatureRole = (feature: Feature, role: FeatureRole) => {
    setRoleMenuId('');
    if (!id || role === deriveFeatureRole(feature)) return;
    characterStore.update(id, {
      features: (character.features || []).map((f) => (f.id === feature.id ? { ...f, role } : f)),
    });
    reloadChar();
  };

  // 特性/特质卡片（主列表与底部隐藏折叠块共用）；inHiddenBlock 时眼睛按钮变为恢复
  const renderFeatureCard = (feature: Feature, inHiddenBlock: boolean) => {
    const role = deriveFeatureRole(feature);
    const roleMeta = FEATURE_ROLE_META[role];
    return (
    <div
      key={feature.id}
      className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 space-y-1.5"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium dark:text-text-dark light:text-text-light">
          {feature.name}
        </span>
        {feature.level != null && feature.category === '职业特性' && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs flex-shrink-0">
            Lv.{feature.level}
          </span>
        )}
        {feature.category && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs flex-shrink-0">
            {feature.category}
          </span>
        )}
        <span className="relative flex-shrink-0">
          <button
            onClick={() => setRoleMenuId(roleMenuId === feature.id ? '' : feature.id)}
            className={`px-1.5 py-0.5 rounded-full text-xs ${roleMeta.chip}`}
            title="点击调整作用方式分类"
          >
            {roleMeta.label}
          </button>
          {roleMenuId === feature.id && (
            <>
              {/* 透明遮罩：点菜单外任意处关闭 */}
              <div className="fixed inset-0 z-40" onClick={() => setRoleMenuId('')} />
              <div className="absolute left-0 top-full mt-1 z-50 w-28 rounded-lg border shadow-xl py-1 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light">
                {FEATURE_RENDER_ORDER.map((r) => {
                  const meta = FEATURE_ROLE_META[r];
                  const isCurrent = r === role;
                  return (
                    <button
                      key={r}
                      onClick={() => pickFeatureRole(feature, r)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-left transition-colors ${
                        isCurrent
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'dark:text-text-dark light:text-text-light hover:bg-primary/10'
                      }`}
                    >
                      {meta.label}
                      {isCurrent && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </span>
        <button
          onClick={() => {
            if (inHiddenBlock) toggleFeatureHidden(`${feature.category || ''}:${feature.name}`);
            else setHideConfirmKey(`${feature.category || ''}:${feature.name}`);
          }}
          className="ml-auto p-1 rounded dark:hover:bg-bg-dark-2 light:hover:bg-bg-light-3 text-dark-text-muted light:text-text-light-muted hover:text-primary flex-shrink-0"
          title={inHiddenBlock ? '恢复显示' : '隐藏'}
        >
          {inHiddenBlock ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>
      {feature.description && (
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted leading-relaxed whitespace-pre-wrap">
          {renderSpellDice(feature.description)}
        </p>
      )}
    </div>
    );
  };

  const handleRemoveCantrip = (index: number) => {
    if (!id) return;
    characterStore.removeCantrip(id, index);
    reloadChar();
  };

  const handleRemoveCustomSpell = (index: number) => {
    if (!id) return;
    characterStore.removeCustomSpell(id, index);
    reloadChar();
  };

  const handleUpdateSpellSlots = (levelKey: any, field: 'max' | 'used', value: number) => {
    if (!id) return;
    characterStore.updateSpellSlots(id, levelKey, { [field]: value });
    reloadChar();
  };

  // 熟练项统一保存：基线（技能/豁免熟练与专精、豁免加值覆盖、四类芯片）+ 选项任选选择 + 手动来源标记一次写回
  const handleSaveProficiencies = (draft: {
    skills: Character['skills'];
    proficiencies: Character['proficiencies'];
    saveExpertise: AbilityKey[];
    saveBonusOverride: Partial<Record<AbilityKey, number>>;
    proficiencyChoices: Record<string, string[]>;
    proficiencySourceMarks: Record<string, string>;
  }) => {
    if (!id) return;
    characterStore.update(id, {
      skills: draft.skills,
      proficiencies: draft.proficiencies,
      saveExpertise: draft.saveExpertise,
      saveBonusOverride: draft.saveBonusOverride,
      proficiencyChoices: draft.proficiencyChoices,
      proficiencySourceMarks: draft.proficiencySourceMarks,
    });
    reloadChar();
    setProficienciesOpen(false);
  };

  const hpPercentage = character
    ? character.maxHp > 0
      ? ((character.currentHp + character.tempHp) / character.maxHp) * 100
      : 0
    : 0;

  const hpColor =
    hpPercentage > 60 ? 'bg-success' : hpPercentage > 30 ? 'bg-warning' : 'bg-danger';

  const carryCapacity = character ? character.abilities.strength.score * 15 : 0;

    const totalWeight = character
  ? character.equipment.reduce((sum, item) => {
      const w = item.weight || 0;
      const q = item.quantity || 1;
      if (item.packSize && item.packSize > 0) {
        return sum + (w / item.packSize) * q;
      }
      return sum + w * q;
    }, 0)
  : 0;

const totalValue = character
  ? character.equipment.reduce(
      (acc, item) => {
        if (!item.price) return acc;
        const q = Math.floor(item.quantity || 1);
        const amount = Math.floor(item.price.amount);
        let effectiveAmount: number;
        if (item.packSize && item.packSize > 0) {
          effectiveAmount = Math.floor((amount / item.packSize) * q);
        } else {
          effectiveAmount = amount * q;
        }
        if (item.price.unit === 'gp') acc.gp += effectiveAmount;
        else if (item.price.unit === 'ep') acc.ep += effectiveAmount;
        else if (item.price.unit === 'sp') acc.sp += effectiveAmount;
        else if (item.price.unit === 'cp') acc.cp += effectiveAmount;
        return acc;
      },
      { gp: 0, ep: 0, sp: 0, cp: 0 }
    )
  : { gp: 0, ep: 0, sp: 0, cp: 0 };

  const totalCp = Math.floor(totalValue.gp) * 100 + Math.floor(totalValue.ep) * 20 + Math.floor(totalValue.sp) * 10 + Math.floor(totalValue.cp);
  const gp = Math.floor(totalCp / 100);
  const ep = Math.floor((totalCp % 100) / 20);
  const sp = Math.floor((totalCp % 20) / 10);
  const cp = totalCp % 10;
  
  const isOverloaded = totalWeight > carryCapacity;
  const effectiveSpeed = character
    ? isOverloaded
      ? Math.max(0, character.speed - 10)
      : character.speed
    : 0;


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="dark:text-text-dark-muted light:text-text-light-muted">加载中...</div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-bold dark:text-text-dark light:text-text-light">角色不存在</h2>
        <Link
          to="/characters"
          className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          返回角色列表
        </Link>
      </div>
    );
  }

   // 深度补齐：防止因 D1 同步回来的角色缺嵌套字段导致渲染崩溃
if (character) {
  if (!character.abilities) {
    character.abilities = {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 10, modifier: 0 },
      charisma: { score: 10, modifier: 0 },
    };
  }
  if (!character.skills) {
    character.skills = {
      acrobatics: { proficient: false, extra: 0 },
      animalHandling: { proficient: false, extra: 0 },
      arcana: { proficient: false, extra: 0 },
      athletics: { proficient: false, extra: 0 },
      deception: { proficient: false, extra: 0 },
      history: { proficient: false, extra: 0 },
      insight: { proficient: false, extra: 0 },
      intimidation: { proficient: false, extra: 0 },
      investigation: { proficient: false, extra: 0 },
      medicine: { proficient: false, extra: 0 },
      nature: { proficient: false, extra: 0 },
      perception: { proficient: false, extra: 0 },
      performance: { proficient: false, extra: 0 },
      persuasion: { proficient: false, extra: 0 },
      religion: { proficient: false, extra: 0 },
      sleightOfHand: { proficient: false, extra: 0 },
      stealth: { proficient: false, extra: 0 },
      survival: { proficient: false, extra: 0 },
    };
  }
  if (!character.proficiencies) character.proficiencies = { armor: [], weapons: [], tools: [], languages: [], savingThrows: [] };
  if (!character.spells) {
    character.spells = {
      cantrips: [],
      spellSlots: {
        level1: { max: 0, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 },
      },
      custom: [],
    };
  }
  if (!character.spells.spellSlots) {
    character.spells.spellSlots = {
      level1: { max: 0, used: 0 },
      level2: { max: 0, used: 0 },
      level3: { max: 0, used: 0 },
      level4: { max: 0, used: 0 },
      level5: { max: 0, used: 0 },
      level6: { max: 0, used: 0 },
      level7: { max: 0, used: 0 },
      level8: { max: 0, used: 0 },
      level9: { max: 0, used: 0 },
    };
  }
  if (!character.equipment) character.equipment = [];
  if (!character.features) character.features = [];
  if (!character.attacks) character.attacks = [];
  if (!character.currency) character.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  // 兼容旧数据 / 后端直接返回的对象：profession 可能缺失，兜底成空职业，避免渲染崩溃
  if (!character.profession || typeof character.profession !== 'object') {
    character.profession = {
      class: (character as any).class || '',
      subclass: (character as any).subclass || undefined,
    };
  } else if (character.profession.class === undefined) {
    character.profession.class = (character as any).class || '';
  }
  if (character.wornArmorId === undefined) character.wornArmorId = null;
  if (character.wornOutfitId === undefined) character.wornOutfitId = null;

  // 每个装备确保 id 有值（childId 由 store 迁移保证唯一性）
  character.equipment = character.equipment.map(eq => {
    if (!eq.id && (eq as any).childId) eq.id = (eq as any).childId;
    return eq;
  });
}



  
  return (
    <div className={`space-y-6 ${readOnly ? 'read-only-mode' : ''}`}>
      {draftMode && character && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <div className="text-sm font-medium text-amber-400">草稿编辑中（修改不会直接写入正式角色卡）</div>
            <div className="text-xs text-amber-400/70 mt-0.5">
              {draftDiffRows.length > 0 ? `已修改 ${draftDiffRows.length} 处，提交后由 DM 审批入库` : '尚未修改任何数据'}
            </div>
          </div>
          <button
            onClick={() => setSubmitDialogOpen(true)}
            disabled={draftDiffRows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" /> 提交变更
          </button>
          <button
            onClick={handleDiscardDraft}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            <Undo2 className="w-4 h-4" /> 放弃
          </button>
        </div>
      )}

      {!readOnly && !draftMode && (
          <Link
            to="/characters"
            className="inline-flex items-center gap-2 text-white hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}

      <div className={`flex items-center gap-2 flex-wrap ${readOnly ? 'px-2' : ''}`}>
        <input
          type="text"
          value={character.name}
          onChange={(e) => {
            characterStore.update(id!, { name: e.target.value });
            reloadChar();
          }}
          className="text-xl sm:text-2xl md:text-3xl font-bold bg-transparent border-none outline-none dark:text-text-dark light:text-text-light"
          placeholder="角色名称"
        />
        <button
          onClick={() => setGenderPickerOpen(true)}
          className="flex-shrink-0 p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted transition-colors"
          title={getGenderDisplay()?.label || '设置性别'}
        >
          {getGenderDisplay() ? (
            <span className={`text-xl sm:text-2xl md:text-3xl font-bold ${getGenderDisplay()!.color}`}>
              {getGenderDisplay()!.icon}
            </span>
          ) : (
            <span className="text-lg sm:text-xl md:text-2xl dark:text-text-dark-muted light:text-text-light-muted">
              ⚲
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={character.race}
          onChange={(e) => {
            characterStore.update(id!, { race: e.target.value });
            reloadChar();
          }}
          placeholder="种族"
          className="px-2 py-0.5 text-base bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark dark:focus:text-text-dark light:text-text-light light:focus:text-text-light w-28 font-medium"
        />
        <OptionPicker category="race" onSelect={handleRaceSelect} />
        {optionStore.getSubraces(character.race).length > 0 && (
          <OptionPicker
            category="subrace"
            parentName={character.race}
            placeholder="选择亚种…"
            onSelect={handleSubraceSelect}
          />
        )}
        <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
        <input
          type="text"
          value={character.profession.class}
          onChange={(e) => {
            characterStore.update(id!, { profession: { ...character.profession, class: e.target.value } });
            reloadChar();
          }}
          placeholder="职业"
          className="px-2 py-0.5 text-base bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark dark:focus:text-text-dark light:text-text-light light:focus:text-text-light w-28 font-medium"
        />
        <OptionPicker category="class" onSelect={handleClassSelect} />
      </div>

      {/* 子职业选择 */}
      {characterStore.canCharacterChooseSubclass(character) && (
        <div className="mt-4 p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium dark:text-text-dark light:text-text-light">子职业</span>
            {character.profession.subclass && (
              <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                {characterStore.getSubclassDisplayName(character)}
              </span>
            )}
          </div>
          
          {!character.profession.subclass ? (
            <div className="space-y-2">
              <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                {character.profession.class === '术士' || character.profession.class === '邪术师' 
                  ? '1级角色可以选择一个子职业，获得特殊能力和特性' 
                  : '3级角色可以选择一个子职业，获得特殊能力和特性'}
              </p>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    characterStore.setSubclass(id!, e.target.value);
                    reloadChar();
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light bg-transparent"
              >
                <option value="">选择子职业...</option>
                {characterStore.getAvailableSubclasses(character).map((subclass) => (
                  <option key={subclass.id} value={subclass.id}>
                    {subclass.displayName} - {subclass.description}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm dark:text-text-dark light:text-text-light">
                  当前子职业: {characterStore.getSubclassDisplayName(character)}
                </p>
                <button
                  onClick={() => {
                    if (confirm('确定要更换子职业吗？')) {
                      characterStore.changeSubclass(id!, '');
                      reloadChar();
                    }
                  }}
                  className="text-xs px-3 py-1 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                >
                  更换
                </button>
              </div>
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted space-y-2">
                <div>
                  {characterStore.getAvailableSubclasses(character)
                    .find(sc => sc.id === character.profession.subclass)?.features.join('、')}
                </div>
                    {/* 诡术师显示法术成长轨迹 */}
                    {character.profession?.class === '游荡者' && character.profession?.subclass === 'arcane_trickster' && (
                      <div className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                        <div className="font-medium text-accent mb-1">法术成长轨迹</div>
                        <div className="text-xs space-y-1">
                          <div>智力施法，最高4环</div>
                          <div>3级开始获得法术位</div>
                          <div>1环: {character.level >= 3 ? (character.level >= 5 ? 4 : (character.level >= 4 ? 3 : 2)) : 0}个</div>
                          <div>2环: {character.level >= 5 ? (character.level >= 9 ? 3 : (character.level >= 7 ? 2 : 0)) : 0}个</div>
                          <div>3环: {character.level >= 9 ? (character.level >= 17 ? 3 : (character.level >= 13 ? 1 : 0)) : 0}个</div>
                          <div>4环: {character.level >= 13 ? (character.level >= 19 ? 3 : (character.level >= 15 ? 2 : 1)) : 0}个</div>
                        </div>
                      </div>
                    )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={character.alignment}
          onChange={(e) => {
            characterStore.update(id!, { alignment: e.target.value });
            reloadChar();
          }}
          placeholder="阵营"
          className="px-2 py-0.5 text-sm bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark-muted dark:focus:text-text-dark light:text-text-light-muted light:focus:text-text-light w-20"
        />
        <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
        <input
          type="text"
          value={character.size}
          onChange={(e) => {
            characterStore.update(id!, { size: e.target.value });
            reloadChar();
          }}
          placeholder="体型"
          className="px-2 py-0.5 text-sm bg-transparent border-b border-transparent focus:border-primary outline-none dark:text-text-dark-muted dark:focus:text-text-dark light:text-text-light-muted light:focus:text-text-light w-16"
        />
        <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 text-accent" />
          <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">等级</span>
          <span className="text-sm font-bold dark:text-text-dark light:text-text-light">
            {characterStore.getLevelFromExp(character.experience)}
          </span>
        </div>
      </div>

      <div className="mt-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                经验值: {character.experience}
              </span>
              <span className="dark:text-text-dark-muted light:text-text-light-muted">
                {characterStore.getNextLevelInfo(character.experience).currentLevel >= 20
                  ? '已满级'
                  : `距下一级还需 ${characterStore.getNextLevelInfo(character.experience).expRemaining} XP`}
              </span>
            </div>
            <div className="h-1.5 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${characterStore.getNextLevelInfo(character.experience).expProgress * 100}%` }}
              />
            </div>
            {!readOnly && (
              <input
                type="number"
                value={character.experience === 0 ? '' : character.experience}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    // 允许清空，暂不更新 store
                  } else {
                    const exp = parseInt(val);
                    if (!isNaN(exp)) {
                      const level = characterStore.getLevelFromExp(exp);
                      const proficiencyBonus = Math.ceil(level / 4) + 1;
                      characterStore.update(id!, { experience: exp, level, proficiencyBonus });
                      reloadChar();
                    }
                  }
                }}
                onBlur={(e) => {
                  // 失去焦点时，如果为空，设置为 0
                  if (e.target.value === '') {
                    characterStore.update(id!, { experience: 0, level: 0, proficiencyBonus: 2 });
                    reloadChar();
                  }
                }}
                onKeyDown={(e) => {
                  // 按回车时，如果为空，设置为 0
                  if (e.key === 'Enter' && (e.target as HTMLInputElement).value === '') {
                    characterStore.update(id!, { experience: 0, level: 0, proficiencyBonus: 2 });
                    reloadChar();
                  }
                }}
                className="mt-2 w-full px-2 py-1 text-xs bg-white/50 dark:bg-white/10 rounded outline-none dark:text-text-dark light:text-text-light"
                placeholder="输入经验值..."
              />
            )}
          </div>

      <div className="relative">
        <button
          onClick={handleOpenStatsEditor}
          className="absolute top-0 right-0 z-10 p-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark dark:text-text-dark-muted hover:border-primary hover:text-primary light:border-border-light light:bg-bg-light-2 light:text-text-light-muted transition-colors"
          title="编辑属性"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-5 h-5 text-danger" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">生命值</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold dark:text-text-dark light:text-text-light">{character.currentHp}</span>
            {character.tempHp > 0 && (
              <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">(+{character.tempHp})</span>
            )}
            <span className="text-lg dark:text-text-dark-muted light:text-text-light-muted">/</span>
            <span className="text-lg dark:text-text-dark-muted light:text-text-light-muted">{character.maxHp}</span>
          </div>
          <div className="mt-2 h-2 rounded-full dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${hpColor}`} style={{ width: `${hpPercentage}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">临时HP: {character.tempHp}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-info" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">护甲等级</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">{character.armorClass}</div>
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Footprints className="w-5 h-5 text-success" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">速度</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${
              isOverloaded ? 'text-danger' : 'dark:text-text-dark light:text-text-light'
            }`}>
              {isOverloaded ? effectiveSpeed : character.speed}
            </span>
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">尺</span>
          </div>
          {isOverloaded && (
            <div className="mt-1 text-xs text-danger">
              负重 {character.speed} 尺 → {effectiveSpeed} 尺
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">熟练加值</span>
          </div>
          <div className="text-3xl font-bold dark:text-text-dark light:text-text-light">
            {character.proficiencyBonus >= 0 ? `+${character.proficiencyBonus}` : character.proficiencyBonus}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Eye className="w-3.5 h-3.5 dark:text-text-dark-muted light:text-text-light-muted" />
            <span className="dark:text-text-dark-muted light:text-text-light-muted">被动察觉: {character ? characterStore.calcPassivePerception(character) : 10}</span>
          </div>
        </div>
      </div>
      </div>

      <Section title="属性值" icon={Zap}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            初始属性值：{character.baseAbilities ? '已设置' : '未设置'}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setBreakdownOpen(true)} title="查看并编辑初始值、特性加值与任选选择"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark hover:bg-white/10 light:border-border-light light:text-text-light">
              <ScrollText className="w-4 h-4" /> 属性解析
            </button>
          </div>
        </div>
        <ErrorBoundary fallback={
    <div className="p-4 text-sm text-danger border border-danger/30 rounded-lg">
      属性值区块渲染异常，请尝试重新同步角色数据
    </div>
  }>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {(Object.keys(character.abilities || {}) as AbilityKey[]).map((ability) => (
            <div
              key={ability}
              className="text-center p-4 rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light"
            >
              <div className="text-xs uppercase tracking-wide mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                {abilityLabels[ability]}
              </div>
              {/* 最终属性值 = 初始基线 + 特性加值，由 recomputeAbilities 写回，静态展示 */}
              <div className="text-2xl font-bold py-1 dark:text-text-dark light:text-text-light">
                {character.abilities[ability].score}
              </div>
              <div className="mt-1 text-lg font-semibold text-primary">
                {character.abilities[ability].modifier >= 0
                  ? `+${character.abilities[ability].modifier}`
                  : character.abilities[ability].modifier}
              </div>
            </div>
          ))}
        </div>

        {/* 特性加值与任选槽位已并入「属性解析」弹窗统一编辑 */}
          </ErrorBoundary>
      </Section>

      <div className="flex items-center justify-end gap-2 px-4 py-2 text-sm dark:text-text-dark-muted light:text-text-light-muted">
        <Scale className="w-4 h-4" />
        <span>载重：{carryCapacity} 磅</span>
      </div>

      <Section title="熟练项" icon={Star}>
        <ErrorBoundary fallback={
    <div className="p-4 text-sm text-danger border border-danger/30 rounded-lg">
      熟练项区块渲染异常，请尝试重新同步角色数据
    </div>
  }>
        {!readOnly && (
          <div className="flex justify-end mb-3">
            <button onClick={() => setProficienciesOpen(true)} title="编辑技能/豁免熟练、专精与四类熟练项"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark hover:bg-white/10 light:border-border-light light:text-text-light">
              <ScrollText className="w-4 h-4" /> 编辑熟练项
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          {(() => {
  try {
    const groups = characterStore.getGroupedSkills(character || {} as Character);
    if (!Array.isArray(groups)) {
      return <div className="text-sm text-danger col-span-full">技能数据异常，请重新同步角色</div>;
    }
    // 选项解析授予集：与基线并集构成最终熟练项（来源标记一并取出）
    const profFinal = computeFinalProficiencies(character || {} as Character);
    return groups.map((group) => {
      const saveSources = profFinal.saveSources[group.save.key];
      const saveFinal = group.save.proficient || !!saveSources;
      return (
      <div
        key={group.attribute}
        className="p-3 rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light"
      >
        <div className="flex items-center gap-2 mb-2 pb-2 border-b dark:border-border-dark light:border-border-light">
          <span className="text-sm font-bold dark:text-text-dark light:text-text-light">
            {group.attributeLabel}
          </span>
          <span className="text-xs text-primary font-mono">
            {group.save.modifier >= 0 ? `+${group.save.modifier}` : group.save.modifier}
          </span>
        </div>

        {/* 豁免（最终值只读展示，编辑走「编辑熟练项」弹窗） */}
        <div
          className={`flex flex-wrap items-center gap-2 p-1.5 rounded-lg mb-2 transition-colors ${
            saveFinal
              ? 'bg-accent/10'
              : 'dark:bg-bg-dark/50 light:bg-bg-light-2/50'
          }`}
        >
          <Star className={`w-3.5 h-3.5 flex-shrink-0 ${
            group.save.expertise
              ? 'fill-accent text-accent'
              : saveFinal
                ? 'dark:text-text-dark-muted light:text-text-light-muted'
                : 'dark:text-text-dark-muted/30 light:text-text-light-muted/30'
          }`} />
          <input
            type="checkbox"
            checked={saveFinal}
            disabled
            className="w-4 h-4 accent-accent"
          />
          <span
            className={`text-xs flex-1 min-w-[3rem] ${
              saveFinal
                ? 'font-medium dark:text-text-dark light:text-text-light'
                : 'dark:text-text-dark-muted light:text-text-light-muted'
            }`}
          >
            {group.save.label}
          </span>
          {(saveSources || profFinal.saveMarks[group.save.key]) && (
            <button
              data-readonly-keep
              onClick={() => setSourceDialog({
                name: group.save.label,
                kindLabel: '豁免',
                parsed: saveSources ?? [],
                manual: profFinal.saveMarks[group.save.key],
              })}
              className="p-1 rounded hover:bg-accent/10 text-accent flex-shrink-0"
              title="查看数据来源"
            >
              <Tag className="w-3.5 h-3.5" />
            </button>
          )}
          <span className={`text-xs font-mono font-bold w-14 text-right rounded px-1 py-0.5 ${
            group.save.overridden
              ? 'text-accent dark:bg-accent/10 light:bg-accent/10'
              : saveFinal
                ? 'dark:text-text-dark light:text-text-light'
                : 'dark:text-text-dark-muted light:text-text-light-muted'
          }`}>
            {group.save.bonus >= 0 ? `+${group.save.bonus}` : group.save.bonus}
          </span>
        </div>

        {/* 技能列表（最终值只读展示） */}
        {group.skills.map((skill) => {
          const sources = profFinal.skillSources[skill.key];
          const finalProf = skill.proficient || !!sources;
          return (
          <div
            key={skill.key}
            className={`flex flex-wrap items-center gap-2 p-1.5 rounded-lg transition-colors ${
              finalProf
                ? 'bg-primary/10'
                : 'dark:bg-bg-dark/50 light:bg-bg-light-2/50'
            }`}
          >
            <Star className={`w-3.5 h-3.5 flex-shrink-0 ${
              skill.expertise
                ? 'fill-primary text-primary'
                : finalProf
                  ? 'dark:text-text-dark-muted light:text-text-light-muted'
                  : 'dark:text-text-dark-muted/30 light:text-text-light-muted/30'
            }`} />
            <input
              type="checkbox"
              checked={finalProf}
              disabled
              className="w-4 h-4 accent-primary"
            />
            <span
              className={`text-xs flex-1 min-w-[3rem] ${
                finalProf
                  ? 'font-medium dark:text-text-dark light:text-text-light'
                  : 'dark:text-text-dark-muted light:text-text-light-muted'
              }`}
            >
              {skill.label}
            </span>
            {(sources || profFinal.skillMarks[skill.key]) && (
              <button
                data-readonly-keep
                onClick={() => setSourceDialog({
                  name: skill.label,
                  kindLabel: '技能',
                  parsed: sources ?? [],
                  manual: profFinal.skillMarks[skill.key],
                })}
                className="p-1 rounded hover:bg-primary/10 text-primary flex-shrink-0"
                title="查看数据来源"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
            )}
            <span
              className={`text-xs font-mono font-bold w-8 text-right ${
                finalProf
                  ? 'dark:text-text-dark light:text-text-light'
                  : 'dark:text-text-dark-muted light:text-text-light-muted'
              }`}
            >
              {skill.bonus >= 0 ? `+${skill.bonus}` : skill.bonus}
            </span>
          </div>
          );
        })}

        {group.skills.length === 0 && (
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted text-center py-1">
            无关联技能
          </div>
        )}
      </div>
      );
    });
  } catch (e) {
    console.error('技能区块渲染错误:', e);
    return <div className="text-sm text-danger col-span-full">技能区块渲染异常: {String(e)}</div>;
  }
})()}
        </div>

        {/* 四类熟练项摘要（最终值只读展示：基线芯片 ∪ 选项解析授予，含手动来源标记） */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t dark:border-border-dark light:border-border-light">
          {(() => {
            const profFinalChips = computeFinalProficiencies(character || {} as Character);
            return displayedProficiencyCategories.map((category) => {
            const items = character.proficiencies?.[category] || [];
            const granted = profFinalChips.grantedChips[category]
              .filter((g) => !items.includes(g.name));
            return (
              <div key={category} className="min-w-[160px]">
                <label className="block text-xs mb-1.5 dark:text-text-dark-muted light:text-text-light-muted">{proficiencyLabels[category]}</label>
                <div className="flex flex-wrap gap-1.5">
                  {items.length === 0 && granted.length === 0 && (
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">无</span>
                  )}
                  {items.map((item, index) => {
                    const mark = profFinalChips.chipMarks[category][item];
                    return (
                    <span key={index} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light">
                      {item}
                      {mark && (
                        <button
                          data-readonly-keep
                          onClick={() => setSourceDialog({
                            name: item,
                            kindLabel: proficiencyLabels[category],
                            parsed: [],
                            manual: mark,
                          })}
                          className="p-0.5 rounded hover:bg-primary/10 text-primary"
                          title="查看数据来源"
                        >
                          <Tag className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                    );
                  })}
                  {granted.map((g, i) => {
                    const mark = profFinalChips.chipMarks[category][g.name];
                    return (
                    <span key={`granted-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary">
                      {g.name}
                      <button
                        data-readonly-keep
                        onClick={() => setSourceDialog({
                          name: g.name,
                          kindLabel: proficiencyLabels[category],
                          parsed: [g.sourceLabel],
                          manual: mark,
                        })}
                        className="p-0.5 rounded hover:bg-primary/10 text-primary/70 hover:text-primary"
                        title="查看数据来源"
                      >
                        <Tag className="w-3 h-3" />
                      </button>
                    </span>
                    );
                  })}
                </div>
              </div>
            );
            });
          })()}
        </div>
          </ErrorBoundary>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Section title="攻击" icon={Swords}>
            <ErrorBoundary fallback={
    <div className="p-4 text-sm text-danger border border-danger/30 rounded-lg">
      攻击区块渲染异常，请尝试重新同步角色数据
    </div>
  }>
            <div className="space-y-2">
              {(character.attacks || []).length === 0 ? (
                <div className="text-center py-6 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  暂无攻击
                </div>
              ) : (
                (character.attacks || []).map((attack) => {
                  // 判断攻击是否"可用"：同名武器在备战槽中（备战数据代表进战斗会拿起）
                  const attackUsable = (() => {
                    const leftItem = character.readiedLeft ? character.equipment.find(e => (e.childId || e.id) === character.readiedLeft) : null;
                    const rightItem = character.readiedRight ? character.equipment.find(e => (e.childId || e.id) === character.readiedRight) : null;
                    return (leftItem && leftItem.name === attack.name) || (rightItem && rightItem.name === attack.name);
                  })();
                  return (
                  <div
                    key={attack.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 transition-all ${
                      attackUsable
                        ? 'ring-2 ring-primary/60 shadow-[0_0_8px_rgba(99,102,241,0.3)]'
                        : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">
                        {attack.name || '未命名攻击'}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs flex-wrap dark:text-text-dark-muted light:text-text-light-muted">
                        <span className="text-primary font-medium">{attack.attackBonus || '—'}</span>
                        <span>·</span>
                        <span>{attack.damage || '—'}</span>
                        {attack.damageType && <span>{attack.damageType}</span>}
                        {attack.range && (
                          <>
                            <span>·</span>
                            <span>{attack.range}</span>
                          </>
                        )}
                        {attack.properties && attack.properties.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="truncate">{attack.properties.join('、')}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEditAttack(attack as Attack & { id: string })}
                        className="p-1.5 rounded hover:bg-primary/20 text-primary"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAttackDirect(attack.id!)}
                        className="p-1.5 rounded hover:bg-danger/20 text-danger"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  );
                })
              )}
              <button
                onClick={handleAddAttack}
                className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                添加攻击
              </button>
            </div>
              </ErrorBoundary>
          </Section>

          <Section title="装备" icon={Package}>
            <ErrorBoundary fallback={
    <div className="p-4 text-sm text-danger border border-danger/30 rounded-lg">
      装备区块渲染异常，请尝试重新同步角色数据
    </div>
  }>
            <div className="space-y-2">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={handleAddEquipment}
                  className="flex-1 py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                >
                  <Plus className="w-4 h-4 inline mr-1" />
                  添加装备
                </button>
                <button
                  onClick={() => setEquipmentPickerOpen(true)}
                  className="flex-1 py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                >
                  <Library className="w-4 h-4 inline mr-1" />
                  从装备库添加
                </button>
              </div>

              <div className="relative">
                
              {(character.equipment || []).slice(0, 5).map((item) => {
  const itemId = (item as any).childId || item.id;
  const heldHand: 'L' | 'R' | 'B' | null =
    character.readiedLeft === itemId && character.readiedRight === itemId ? 'B' :
    character.readiedLeft === itemId ? 'L' :
    character.readiedRight === itemId ? 'R' : null;
  return (
    <CharacterEquipmentCard
      key={itemId}
      item={item as any}
      characterId={id}
      onEdit={handleEditEquipment}
      onDelete={setDeleteConfirmId}
      onRefresh={reloadChar}
      onUpdateQuantity={handleUpdateEquipmentQuantity}
      showQuantity={true}
      heldHand={heldHand}
      onHeldLabelClick={() => navigate(readOnly ? `/player/${character.id}/inventory` : `/characters/${id}/inventory`)}
    />
  );
})}

       {character.equipment.length > 5 && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none bg-gradient-to-t from-transparent dark:from-card-dark light:from-card-light to-transparent" />
                    <button
                      data-readonly-keep
                      onClick={() => navigate(readOnly ? `/player/${character.id}/inventory` : `/characters/${id}/inventory`)}
                      className="w-full text-center py-2 text-sm text-primary hover:text-primary-dark transition-colors"
                    >
                      … 查看全部 {character.equipment.length} 件装备
                    </button>
                  </>
                )}
              </div>

              <div className="flex justify-end mb-3">
                <button
                  onClick={handleSortEquipment}
                  className="px-3 py-1.5 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white transition-colors flex items-center gap-1.5"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  整理背包
                </button>
              </div>
              <div className={`pt-3 border-t text-sm dark:border-border-dark/50 light:border-border-light/50 ${
                isOverloaded ? 'text-danger' : 'dark:text-text-dark-muted light:text-text-light-muted'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4" />
                    <span>总负重</span>
                  </div>
                  <span className="font-medium">
                    {totalWeight} / {carryCapacity} 磅
                    {isOverloaded && <span className="ml-2 text-xs">（超重）</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4" />
                    <span>总价值</span>
                  </div>
                  <span className="font-medium">
                    {gp > 0 && <span>{gp} gp </span>}
                    {sp > 0 && <span>{sp} sp </span>}
                    {cp > 0 && <span>{cp} cp</span>}
                    {gp === 0 && sp === 0 && cp === 0 && <span>0 cp</span>}
                  </span>
                </div>
              </div>
            </div>
              </ErrorBoundary>
          </Section>

          <Section title="货币" icon={Coins}>
            <ErrorBoundary fallback={
    <div className="p-4 text-sm text-danger border border-danger/30 rounded-lg">
      货币区块渲染异常，请尝试重新同步角色数据
    </div>
  }>
            <div className="grid grid-cols-5 gap-2">
              {(['pp', 'gp', 'ep', 'sp', 'cp'] as const).map((coin) => (
                <div key={coin} className="text-center p-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                  <div className="text-xs uppercase mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                    {coin === 'pp' ? '铂金币' : coin === 'gp' ? '金币' : coin === 'ep' ? '银金币' : coin === 'sp' ? '银币' : '铜币'}
                  </div>
                  <input
                    type="number"
                    value={character.currency[coin] === 0 ? '' : character.currency[coin]}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        // 立即更新为 0（value 逻辑：0 显示为空，视觉上仍为空）
                        characterStore.update(id!, {
                          currency: {
                            ...character!.currency,
                            [coin]: 0,
                          },
                        });
                        reloadChar();
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num)) {
                          characterStore.update(id!, {
                            currency: {
                              ...character!.currency,
                              [coin]: Math.floor(num),
                            },
                          });
                          reloadChar();
                        }
                      }
                    }}
                    placeholder="0"
                    className="w-full py-1 text-lg font-bold text-center rounded bg-white/50 dark:bg-white/10 outline-none dark:text-text-dark light:text-text-light"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setTradeOpen(true)}
              className="w-full mt-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Coins className="w-4 h-4" />
              交易 / 物资分配
            </button>
              </ErrorBoundary>
          </Section>
        </div>

        <div className="space-y-6">
          {characterStore.shouldShowSpellSlots(character) ? (
            <Section title="法术" icon={Sparkles}>
              <ErrorBoundary fallback={
    <div className="p-4 text-sm text-danger border border-danger/30 rounded-lg">
      法术区块渲染异常，请尝试重新同步角色数据
    </div>
  }>
              <div className="space-y-4">
                {/* ★ 新增：施法关键属性 UI 替换过时的施法者信息 */}
                <div className="flex items-center justify-between p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      施法属性
                    </span>
                    <span className="text-sm font-bold text-primary">
                      {abilityLabels[characterStore.getSpellcastingAbility(character) || 'intelligence']}
                    </span>
                    {/* 施法关键属性由职业决定（CLASS_SPELLCASTING_ABILITY），只读展示 */}
                    <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                      由职业决定
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      characterStore.resetSpellSlots(id!);
                      reloadChar();
                    }}
                    className="px-2 py-1 text-xs rounded border dark:border-border-dark dark:text-text-dark-muted hover:border-primary hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    长休重置
                  </button>
                </div>

                {/* ★ 法术攻击加值 + 法术豁免 DC（施法者专有派生值，移动端两行各占一项） */}
                {(() => {
                  const saveDC = characterStore.calcSpellSaveDC(character);
                  if (saveDC === null) return null;
                  const attackBonus = characterStore.getSpellAttackBonus(character);
                  const fmtBonus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
                  return (
                    <div className="flex flex-col gap-2 p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                      <div className="flex items-center gap-2">
                        <Crosshair className="w-4 h-4 text-accent" />
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          法术攻击加值
                        </span>
                        <span className="text-lg font-bold dark:text-text-dark light:text-text-light">
                          {attackBonus !== null ? fmtBonus(attackBonus) : '-'}
                        </span>
                        <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted ml-auto">
                          = 熟练 {character.proficiencyBonus} + 属性调整值
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-info" />
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          法术豁免 DC
                        </span>
                        <span className="text-lg font-bold dark:text-text-dark light:text-text-light">
                          {saveDC}
                        </span>
                        <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted ml-auto">
                          = 8 + {character.proficiencyBonus} + 属性调整值
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* 法术位 */}
                <div>
                  <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                    法术位
                  </div>
                  {/* 图形化环位：一环一行，实心圆=可用、空心圆=已消耗；点击实心消耗 / 空心恢复 */}
                  <div className="space-y-2">
                    {(() => {
                      const spellData = characterStore.getSpellSlotDisplayData(character);
                      if (!spellData) return null;
                      return spellData.spellSlots.map((slot) => (
                        <div
                          key={slot.level}
                          className="flex items-center gap-3 py-2 px-1 rounded-lg"
                        >
                          <span className="w-12 shrink-0 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                            {slot.label}
                            {slot.isWarlock && <span className="ml-0.5 text-[10px]">短休</span>}
                          </span>
                          <div className="flex items-center">
                            {Array.from({ length: slot.max }).map((_, i) => {
                              const filled = i < slot.available;
                              const levelKey = 'level' + slot.level;
                              return (
                                <div key={i} className="flex items-center">
                                  {i > 0 && <span className="w-2 h-0.5 bg-gray-400/70 dark:bg-gray-500/70" />}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // store 端无边界防护，点击时 clamp 到 [0, max]
                                      const next = filled ? slot.used + 1 : slot.used - 1;
                                      handleUpdateSpellSlots(levelKey, 'used', Math.max(0, Math.min(slot.max, next)));
                                    }}
                                    title={filled ? '消耗一个环位' : '恢复一个环位'}
                                    className="w-4.5 h-4.5 rounded-full border-2 border-gray-500 dark:border-gray-400 hover:border-primary p-[2px] transition-colors"
                                  >
                                    {/* 填充圆内嵌于环框，padding 露出间隙：实心=primary，空心=透明 */}
                                    <span
                                      className={`block w-full h-full rounded-full transition-colors ${
                                        filled ? 'bg-primary' : 'bg-transparent'
                                      }`}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <span
                            className="ml-auto text-xs tabular-nums dark:text-text-dark-muted light:text-text-light-muted"
                            title="可用 / 总量"
                          >
                            {slot.available}/{slot.max}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* 持续状态（战斗结算继承的持久状态源，下次开战自动挂载） */}
                {(() => {
                  const statuses = (character.statuses ?? []).filter(
                    s => s.isActive && (!s.expiresAt || s.expiresAt > Date.now()),
                  );
                  if (statuses.length === 0) return null;
                  return (
                    <div>
                      <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                        持续状态 ({statuses.length})
                      </div>
                      <div className="space-y-1.5">
                        {statuses.map(s => {
                          const def = statusLibrary.get(s.definitionId);
                          let duration = '';
                          if (s.expiresAt) {
                            duration = `剩余约 ${Math.max(0, Math.ceil((s.expiresAt - Date.now()) / 60000))} 分钟`;
                          } else if (s.metadata?.remainRounds) {
                            duration = `原战斗内 ${s.metadata.remainRounds} 回合`;
                          } else {
                            duration = '持续生效（手动维持）';
                          }
                          return (
                            <div
                              key={s.instanceId}
                              className="flex items-center gap-2 py-1.5 px-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 text-xs"
                            >
                              <span className="flex-1 min-w-0">
                                <span className="dark:text-text-dark light:text-text-light">{def?.name ?? s.definitionId}</span>
                                <span className="ml-2 dark:text-text-dark-muted light:text-text-light-muted">{duration}</span>
                                {def?.shortDescription && (
                                  <span className="ml-2 dark:text-text-dark-muted light:text-text-light-muted opacity-80 truncate">
                                    {def.shortDescription}
                                  </span>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!window.confirm(`结束状态「${def?.name ?? s.definitionId}」？`)) return;
                                  characterStore.updateCharacterStatus(character.id, s.instanceId, 'remove');
                                }}
                                className="p-1 rounded text-danger hover:bg-danger/10 transition-colors shrink-0"
                                title="结束该状态"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* 戏法 */}
                <div>
                  <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                    戏法 ({character.spells.cantrips.length})
                  </div>
                <div className="space-y-2">
                  {character.spells.cantrips.map((cantrip, index) => {
                    const spellInfo = getSpellByName(cantrip);
                    const isExpanded = expandedCantrips.has(index);
                    return (
                      <div
                        key={index}
                        className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 p-2">
                          <button
                            data-readonly-keep
                            onClick={() => spellInfo && toggleCantripExpand(index)}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            {spellInfo && (
                              <ChevronDown
                                className={`w-4 h-4 flex-shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                                {cantrip}
                              </div>
                              {spellInfo && (
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-500/20 text-gray-400">
                                    戏法
                                  </span>
                                  <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                                    {spellInfo.school}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={() => handleRemoveCantrip(index)}
                            className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isExpanded && spellInfo && (
                          <div className="px-4 pb-3 pt-1 border-t dark:border-border-dark light:border-border-light">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                              <div>施法时间: {spellInfo.castingTime}</div>
                              <div>射程: {spellInfo.range}</div>
                              <div>持续时间: {spellInfo.duration}</div>
                              <div>
                                成分:{' '}
                                {[
                                  spellInfo.components?.verbal && 'V',
                                  spellInfo.components?.somatic && 'S',
                                  spellInfo.components?.material && 'M',
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </div>
                            </div>
                            {spellInfo.components?.material && spellInfo.materialInfo && (
                              <div className="mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                材料: {spellInfo.materialInfo}
                              </div>
                            )}
                            {spellInfo.components?.material && character && (
                              <SpellMaterialRequirementBlock
                                spell={spellInfo}
                                character={character}
                                inventory={character.equipment}
                                onChanged={reloadChar}
                                readOnly={readOnly}
                              />
                            )}
                            <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                              {renderSpellDice(spellInfo.description)}
                            </div>
                            {spellInfo.hasHeightened && spellInfo.heightenedEffect && (
                              <div className="mt-2 pt-2 border-t dark:border-border-dark/50 light:border-border-light/50">
                                <div className="text-xs font-medium text-accent mb-1">升环效果</div>
                                <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                                  {renderSpellDice(spellInfo.heightenedEffect)}
                                </div>
                              </div>
                            )}
                            {spellInfo.notes && (
                              <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                备注: {spellInfo.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      setSelectedSpellType('cantrip');
                      setSpellPickerOpen(true);
                    }}
                    className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    从法术库添加戏法
                  </button>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
                  已知法术 ({character.spells.custom.length})
                </div>
                <div className="space-y-2">
                  {character.spells.custom.map((spell, index) => {
                    const spellInfo = getSpellByName(spell);
                    const isExpanded = expandedSpells.has(index);
                    return (
                      <div
                        key={index}
                        className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 overflow-hidden"
                      >
                        <div className="flex items-center gap-2 p-2">
                          <button
                            data-readonly-keep
                            onClick={() => spellInfo && toggleSpellExpand(index)}
                            className="flex-1 flex items-center gap-2 text-left min-w-0"
                          >
                            {spellInfo && (
                              <ChevronDown
                                className={`w-4 h-4 flex-shrink-0 transition-transform dark:text-text-dark-muted light:text-text-light-muted ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                                {spell}
                              </div>
                              {spellInfo && (
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      spellInfo.level === 0
                                        ? 'bg-gray-500/20 text-gray-400'
                                        : 'bg-primary/20 text-primary'
                                    }`}
                                  >
                                    {spellInfo.level === 0 ? '戏法' : `${spellInfo.level}环`}
                                  </span>
                                  <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                                    {spellInfo.school}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                          <button
                            onClick={() => handleRemoveCustomSpell(index)}
                            className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {isExpanded && spellInfo && (
                          <div className="px-4 pb-3 pt-1 border-t dark:border-border-dark light:border-border-light">
                            <div className="grid grid-cols-2 gap-2 mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                              <div>施法时间: {spellInfo.castingTime}</div>
                              <div>射程: {spellInfo.range}</div>
                              <div>持续时间: {spellInfo.duration}</div>
                              <div>
                                成分:{' '}
                                {[
                                  spellInfo.components?.verbal && 'V',
                                  spellInfo.components?.somatic && 'S',
                                  spellInfo.components?.material && 'M',
                                ]
                                  .filter(Boolean)
                                  .join(', ')}
                              </div>
                            </div>
                            {spellInfo.components?.material && spellInfo.materialInfo && (
                              <div className="mb-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                材料: {spellInfo.materialInfo}
                              </div>
                            )}
                            {spellInfo.components?.material && character && (
                              <SpellMaterialRequirementBlock
                                spell={spellInfo}
                                character={character}
                                inventory={character.equipment}
                                onChanged={reloadChar}
                                readOnly={readOnly}
                              />
                            )}
                            <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                              {renderSpellDice(spellInfo.description)}
                            </div>
                            {spellInfo.hasHeightened && spellInfo.heightenedEffect && (
                              <div className="mt-2 pt-2 border-t dark:border-border-dark/50 light:border-border-light/50">
                                <div className="text-xs font-medium text-accent mb-1">升环效果</div>
                                <div className="text-xs whitespace-pre-wrap dark:text-text-dark light:text-text-light">
                                  {renderSpellDice(spellInfo.heightenedEffect)}
                                </div>
                              </div>
                            )}
                            {spellInfo.notes && (
                              <div className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                备注: {spellInfo.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    onClick={() => {
                      setSelectedSpellType('spell');
                      setSpellPickerOpen(true);
                    }}
                    className="w-full py-2 text-sm rounded-lg border border-dashed transition-colors dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    从法术库添加法术
                  </button>
                </div>
              </div>
            </div>
                </ErrorBoundary>
          </Section>
          ) : null}

          <Section title="特性与特质" icon={Sparkles}>
            <div className="space-y-2">
              <button
                onClick={handleRefreshOptionFeatures}
                disabled={refreshingFeatures}
                className="w-full py-1.5 text-xs rounded-lg border border-dashed transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                title="选项库随页面加载自动同步最新种子；此按钮把库最新内容写入角色卡，库中已移除的条目一并清掉，手动添加的自建条目保留"
              >
                <RefreshCw className="w-4 h-4" />
                {refreshingFeatures ? '正在同步选项库…' : '刷新选项特性与特质'}
              </button>
              {/* 作用方式分页（主动技能最大展示度 → 被动技能 → 属性调整融入数值）+ 跨分类搜索 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {FEATURE_RENDER_ORDER.map((key) => {
                  const active = featureRoleFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setFeatureRoleFilter(key)}
                      className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                        active
                          ? 'bg-primary/15 text-primary'
                          : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-primary/10'
                      }`}
                    >
                      {FEATURE_ROLE_META[key].label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setFeatureRoleFilter('system')}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    featureRoleFilter === 'system'
                      ? 'bg-primary/15 text-primary'
                      : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-primary/10'
                  }`}
                >
                  体系
                </button>
                <div className="relative flex-1 min-w-[160px] ml-auto">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 dark:text-text-dark-muted light:text-text-light-muted pointer-events-none" />
                  <input
                    type="text"
                    value={featureSearch}
                    onChange={(e) => setFeatureSearch(e.target.value)}
                    placeholder="搜索特性名称或描述"
                    className="w-full pl-8 pr-2 py-1 rounded-full border bg-transparent text-xs dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light placeholder-gray-400 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              {(() => {
                // 熟练类派生条目（护甲/武器/工具/技能熟练项、语言、装备）收进一张集中卡片，
                // 与图鉴选项页的熟练项卡片呈现同步；其余条目按作用方式分组渲染
                const charLevel = charDisplayLevel(character);
                const seedLevelByKey = seedFeatureLevelMap(character);
                const visible = character.features.filter(
                  // 未达等级的条目只在「体系」分页以置灰展示；其它分页隐藏（数据仍保留在卡上）
                  (f) =>
                    isFeatureLevelUnlocked(f, charLevel, seedLevelByKey) &&
                    !hiddenFeatures.has(`${f.category || ''}:${f.name}`)
                );
                const profGroup = visible.filter((f) => proficiencyEntryLabels[f.name]);
                const normalGroup = visible.filter((f) => !proficiencyEntryLabels[f.name]);
                const groups: Record<FeatureRole, Feature[]> = {
                  active: normalGroup.filter((f) => deriveFeatureRole(f) === 'active'),
                  passive: normalGroup.filter((f) => deriveFeatureRole(f) === 'passive'),
                  profile: normalGroup.filter((f) => deriveFeatureRole(f) === 'profile'),
                  stat: normalGroup.filter((f) => deriveFeatureRole(f) === 'stat'),
                };
                // 熟练项集中卡片：熟练条目语义上属于属性调整层（融入数值），单选/全部视角都挂在属性组位置
                const profCard = profGroup.length > 0 ? (
                  <div className="mt-1">
                    <div className="text-xs font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
                      熟练项
                    </div>
                    <div className="p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2 space-y-2">
                      {Object.entries(proficiencyEntryLabels).map(([entryName, label]) => {
                        const group = profGroup.filter((f) => f.name === entryName);
                        if (group.length === 0) return null;
                        const editingRow = editProfId && group.some((f) => f.id === editProfId);
                        // 合并行隐藏需携带全部组成条目的 key（confirm 弹窗按逗号拆分逐个 toggle）
                        const rowKeys = group.map((f) => `${f.category || ''}:${f.name}`).join(',');
                        const sourceCats = [...new Set(group.map((f) => f.category).filter(Boolean))];
                        return (
                          <div key={entryName} className="text-sm flex items-start gap-2">
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted mr-1 inline-block w-10 flex-shrink-0 pt-0.5">
                              {label}
                            </span>
                            {editingRow ? (
                              <textarea
                                autoFocus
                                value={editProfText}
                                onChange={(e) => setEditProfText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    saveProfDescription();
                                  }
                                  if (e.key === 'Escape') setEditProfId(null);
                                }}
                                onBlur={saveProfDescription}
                                rows={2}
                                className="flex-1 min-w-0 p-2 rounded-lg border text-xs bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                              />
                            ) : (
                              <span className="flex-1 min-w-0 dark:text-text-dark light:text-text-light break-words">
                                {group.map((f) => f.description).join('；')}
                              </span>
                            )}
                            {sourceCats.map((c) => (
                              <span
                                key={c}
                                className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs flex-shrink-0"
                              >
                                {c}
                              </span>
                            ))}
                            <button
                              onClick={() => {
                                setEditProfId(group[0].id);
                                setEditProfText(group[0].description);
                              }}
                              title="编辑描述"
                              className={editingRow
                                ? 'text-primary flex-shrink-0 pt-0.5'
                                : 'dark:text-text-dark-muted/40 light:text-text-light-muted/40 hover:text-primary flex-shrink-0 pt-0.5'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setHideConfirmKey(rowKeys)}
                              title="隐藏"
                              className="dark:text-text-dark-muted/40 light:text-text-light-muted/40 hover:text-primary flex-shrink-0 pt-0.5"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null;
                if (featureRoleFilter === 'system') {
                  return (
                    <FeatureSystemView
                      character={character}
                      search={featureSearch}
                      charLevel={charDisplayLevel(character)}
                      readOnly={readOnly}
                      onAddMember={readOnly ? undefined : handleAddSystemMember}
                    />
                  );
                }
                // 搜索模式：跨作用方式分类按名称与描述匹配（含熟练条目），平铺渲染
                const kw = featureSearch.trim().toLowerCase();
                if (kw) {
                  const matched = visible.filter(
                    (f) =>
                      f.name.toLowerCase().includes(kw) ||
                      (f.description || '').toLowerCase().includes(kw)
                  );
                  if (matched.length === 0) {
                    return (
                      <div className="py-4 text-center text-xs dark:text-text-dark-muted light:text-text-light-muted">
                        没有匹配「{featureSearch.trim()}」的特性
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      {matched.map((feature) => renderFeatureCard(feature, false))}
                    </div>
                  );
                }
                // 分页模式：只渲染当前作用方式组（属性调整组附带熟练项集中卡片）
                const list = groups[featureRoleFilter];
                const showProfCard = featureRoleFilter === 'stat' ? profCard : null;
                if (list.length === 0 && !showProfCard) {
                  return (
                    <div className="py-4 text-center text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      该分类下暂无特性
                    </div>
                  );
                }
                return (
                  <>
                    {list.map((feature) => renderFeatureCard(feature, false))}
                    {showProfCard}
                  </>
                );
              })()}
              {(() => {
                // 隐藏条目跟随当前作用方式分页，组间按渲染顺序排序
                const charLevel = charDisplayLevel(character);
                const seedLevelByKey = seedFeatureLevelMap(character);
                const hiddenList = character.features
                  .filter((f) => hiddenFeatures.has(`${f.category || ''}:${f.name}`))
                  .filter((f) => isFeatureLevelUnlocked(f, charLevel, seedLevelByKey))
                  .filter((f) => featureRoleFilter !== 'system' && deriveFeatureRole(f) === featureRoleFilter)
                  .sort(
                    (a, b) =>
                      FEATURE_RENDER_ORDER.indexOf(deriveFeatureRole(a)) -
                      FEATURE_RENDER_ORDER.indexOf(deriveFeatureRole(b))
                  );
                if (hiddenList.length === 0) return null;
                return (
                  <>
                    <button
                      onClick={() => setHiddenFeaturesOpen(!hiddenFeaturesOpen)}
                      className="w-full py-1.5 text-xs rounded-lg border border-dashed transition-colors flex items-center justify-center gap-1.5 dark:border-border-dark dark:text-text-dark-muted dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light-muted light:hover:border-primary light:hover:text-primary"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                      {hiddenFeaturesOpen
                        ? '收起已隐藏条目'
                        : `${hiddenList.length} 条已隐藏`}
                    </button>
                    {hiddenFeaturesOpen &&
                      hiddenList.map((feature) => renderFeatureCard(feature, true))}
                  </>
                );
              })()}
              {character.features.length === 0 && (
                <div className="py-6 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  暂无特性，可点击「刷新」从选项库同步，或通过上方种族/职业/背景选择器更换选项
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      <Section title="背景与描述" icon={ScrollText}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              背景
            </label>
            <textarea
              value={character.background}
              onChange={(e) => {
                characterStore.update(id!, { background: e.target.value });
                reloadChar();
              }}
              placeholder="例如：士兵、学者、游荡者..."
              rows={1}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[40px] field-sizing-content"
            />
            <div className="mt-2">
              <OptionPicker category="background" onSelect={handleBackgroundSelect} />
            </div>
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              外貌描述
            </label>
            <textarea
              value={character.appearance}
              onChange={(e) => {
                characterStore.update(id!, { appearance: e.target.value });
                reloadChar();
              }}
              placeholder="描述角色的外貌特征..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[80px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              性格特点
            </label>
            <textarea
              value={character.personality}
              onChange={(e) => {
                characterStore.update(id!, { personality: e.target.value });
                reloadChar();
              }}
              placeholder="角色的性格特征..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              理想
            </label>
            <textarea
              value={character.ideals}
              onChange={(e) => {
                characterStore.update(id!, { ideals: e.target.value });
                reloadChar();
              }}
              placeholder="角色的理想与信念..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              羁绊
            </label>
            <textarea
              value={character.bonds}
              onChange={(e) => {
                characterStore.update(id!, { bonds: e.target.value });
                reloadChar();
              }}
              placeholder="角色的羁绊与重要的人..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              缺陷
            </label>
            <textarea
              value={character.flaws}
              onChange={(e) => {
                characterStore.update(id!, { flaws: e.target.value });
                reloadChar();
              }}
              placeholder="角色的缺点与弱点..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none min-h-[96px] field-sizing-content"
            />
          </div>
        </div>
      </Section>

      {!readOnly && !draftMode && (
      <div className="flex justify-between items-center pt-4">
        <button
          onClick={() => navigate('/characters')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => characterStore.exportSingleCharacter(character.id)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
          >
            <Download className="w-4 h-4" />
            导出此角色
          </button>
          <button
            onClick={() => {
              characterStore.delete(character.id);
              navigate('/characters');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            删除角色
          </button>
        </div>
      </div>
      )}

      <SpellPicker
        isOpen={spellPickerOpen}
        onClose={() => setSpellPickerOpen(false)}
        onSelect={handleSelectSpell}
        selectedSpellIds={getSelectedSpellNames()}
        characterClass={character?.profession?.class}
        characterSubclass={character?.profession?.subclass}
        spellListSource={character ? characterStore.getSpellListForCharacter(character)?.source : undefined}
        maxSpellLevel={character ? characterStore.getSpellListForCharacter(character)?.maxLevel : undefined}
        filterLevel={selectedSpellType === 'cantrip' ? 0 : 'all'}
        matchByName={true}
      />

      {equipmentPickerOpen && (
        <EquipmentPicker
          onSelect={handleAddEquipmentFromLibrary}
          onClose={() => setEquipmentPickerOpen(false)}
        />
      )}

      {tradeOpen && id && (
        <TradeModal
          characterId={id}
          onClose={() => setTradeOpen(false)}
        />
      )}

      {equipmentEditorOpen && (
  <EquipmentEditor
    item={editingEquipment ? ({
  id: editingEquipment.id,
  childId: (editingEquipment as any).childId,
  ...extractBaseFields(editingEquipment),
  isCustom: true,
  quantity: editingEquipment.quantity,
} as any) : undefined}

    showQuantity={true}
    showPackSize={true}
    showSyncOption={!draftMode}
    onSave={(formData, syncToLibrary) => {
  hookHandleSaveEquipment(editingEquipment, formData, syncToLibrary, () => {
    setEquipmentEditorOpen(false);
    setEditingEquipment(null);
  });
}}

    onDelete={editingEquipment && !editingEquipment.id.startsWith('temp-') ? () => {
  const equipId = (editingEquipment as any).childId || editingEquipment.id;
  hookHandleDeleteEquipment(equipId);
  setEquipmentEditorOpen(false);
  setEditingEquipment(null);
} : undefined}

    onClose={() => {
      setEquipmentEditorOpen(false);
      setEditingEquipment(null);
    }}
  />
)}

      

      {hideConfirmKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHideConfirmKey(null)} />
          <div className="relative w-full max-w-xs rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center dark:text-text-dark light:text-text-light">
              隐藏此条目
            </h3>
            <p className="text-sm text-center mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要隐藏这条特性与特质吗？它将收进列表底部的「已隐藏」折叠块。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setHideConfirmKey(null)}
                className="flex-1 py-2 px-4 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light light:hover:border-primary light:hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={() => {
                  // 熟练项合并行携带多个条目 key（逗号分隔），逐个加入隐藏集合
                  if (hideConfirmKey) {
                    hideConfirmKey.split(',').forEach((k) => toggleFeatureHidden(k));
                  }
                  setHideConfirmKey(null);
                }}
                className="flex-1 py-2 px-4 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white transition-colors"
              >
                隐藏
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative w-full max-w-xs rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center dark:text-text-dark light:text-text-light">
              确认删除
            </h3>
            <p className="text-sm text-center mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除这件装备吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 px-4 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light light:hover:border-primary light:hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={handleDeleteEquipmentConfirm}
                className="flex-1 py-2 px-4 text-sm rounded-lg bg-danger hover:bg-danger-dark text-white transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {statsEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setStatsEditorOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                编辑属性
              </h3>
              <button
                onClick={() => setStatsEditorOpen(false)}
                className="p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">生命值</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1 dark:text-text-dark-muted light:text-text-light-muted">当前HP</label>
                    <input
                      type="number"
                      value={statsForm.currentHp || ''}
                      onChange={(e) => setStatsForm({ ...statsForm, currentHp: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 dark:text-text-dark-muted light:text-text-light-muted">最大HP</label>
                    <input
                      type="number"
                      value={statsForm.maxHp || ''}
                      onChange={(e) => setStatsForm({ ...statsForm, maxHp: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 dark:text-text-dark-muted light:text-text-light-muted">临时HP</label>
                    <input
                      type="number"
                      value={statsForm.tempHp || ''}
                      onChange={(e) => setStatsForm({ ...statsForm, tempHp: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">护甲等级 (AC)</label>
                <input
                  type="number"
                  value={statsForm.armorClass || ''}
                  onChange={(e) => setStatsForm({ ...statsForm, armorClass: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  placeholder="10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">速度</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={statsForm.speed || ''}
                    onChange={(e) => setStatsForm({ ...statsForm, speed: parseInt(e.target.value) || 0 })}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    placeholder="30"
                  />
                  <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">尺</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">熟练加值</label>
                <input
                  type="number"
                  value={statsForm.proficiencyBonus || ''}
                  onChange={(e) => setStatsForm({ ...statsForm, proficiencyBonus: parseInt(e.target.value) || 2 })}
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  placeholder="2"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setStatsEditorOpen(false)}
                className="flex-1 py-2 px-4 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light light:hover:border-primary light:hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={handleSaveStats}
                className="flex-1 py-2 px-4 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {genderPickerOpen && !readOnly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setGenderPickerOpen(false)} />
          <div className="relative w-full max-w-xs rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center dark:text-text-dark light:text-text-light">
              选择性别
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {genderOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectGender(option.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                    character?.gender === option.value
                      ? 'border-primary bg-primary/10'
                      : 'dark:border-border-dark light:border-border-light hover:border-primary hover:bg-primary/5'
                  }`}
                >
                  <span className={`text-3xl font-bold ${option.color}`}>
                    {option.icon}
                  </span>
                  <span className="text-sm dark:text-text-dark light:text-text-light">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setGenderPickerOpen(false)}
              className="w-full mt-4 py-2 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {attackEditorOpen && (
        <AttackEditor
          attack={editingAttack || undefined}
          weapons={character.equipment.filter((e) => e.category === '武器')}
          character={character}
          onSave={handleSaveAttack}
          onDelete={editingAttack ? handleDeleteAttack : undefined}
          onClose={() => {
            setAttackEditorOpen(false);
            setEditingAttack(null);
          }}
        />
      )}

      {/* 属性值解析弹窗（初始值编辑 + 特性加值组分 + 任选槽位，统一保存） */}
      {breakdownOpen && character && (
        <AbilityBreakdownDialog
          character={character}
          onClose={() => setBreakdownOpen(false)}
          onSave={handleSaveAbilityLayers}
        />
      )}

      {/* 熟练项弹窗（技能/豁免熟练与专精 + 加值覆盖 + 四类芯片，统一保存） */}
      {proficienciesOpen && character && !readOnly && (
        <ProficienciesDialog
          character={character}
          onClose={() => setProficienciesOpen(false)}
          onSave={handleSaveProficiencies}
        />
      )}

      {/* 数据来源弹窗（页面只读区徽标点击展开；解析授予与手动标记分区展示） */}
      {sourceDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSourceDialog(null)} />
          <div className="relative w-full max-w-sm rounded-xl border p-5 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-primary flex-shrink-0" />
              <h3 className="text-base font-bold flex-1 dark:text-text-dark light:text-text-light">
                数据来源 · {sourceDialog.name}
              </h3>
              <button
                data-readonly-keep
                onClick={() => setSourceDialog(null)}
                className="p-1 rounded hover:bg-danger/10 text-danger flex-shrink-0"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs mb-3 dark:text-text-dark-muted light:text-text-light-muted">
              {sourceDialog.kindLabel}
            </div>
            {sourceDialog.parsed.length === 0 && !sourceDialog.manual && (
              <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">暂无来源记录</p>
            )}
            {sourceDialog.parsed.length > 0 && (
              <div className="mb-3">
                <div className="text-xs mb-1.5 dark:text-text-dark-muted light:text-text-light-muted">选项解析授予</div>
                <div className="space-y-1.5">
                  {sourceDialog.parsed.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-primary/10">
                      <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span className="text-xs text-primary">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sourceDialog.manual && (
              <div>
                <div className="text-xs mb-1.5 dark:text-text-dark-muted light:text-text-light-muted">手动来源标记</div>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                  <Tag className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="text-xs dark:text-text-dark light:text-text-light">{sourceDialog.manual}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DM 模式下显示浮动同步按钮 */}
      {!readOnly && !draftMode && <SyncButton />}

      {/* 全周期日志：物资钱币/法术/角色成长三领域变更记录（玩家端只读页同样展示） */}
      {character && !draftMode && (
        <CharacterLogPanel characterId={character.id} draftMode={draftMode} />
      )}

      {/* 变更提交弹窗：diff 明细 + 玩家说明（draftMode 专用） */}
      {submitDialogOpen && draftMode && character && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setSubmitDialogOpen(false)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b dark:border-border-dark light:border-border-light">
              <div>
                <h3 className="text-base font-bold dark:text-text-dark light:text-text-light">提交变更请求</h3>
                <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                  {summarizeDiff(draftDiffRows)}，DM 批准后写入正式角色卡
                </p>
              </div>
              <button onClick={() => setSubmitDialogOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {draftDiffRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-xs rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${row.kind === 'add' ? 'bg-green-500' : row.kind === 'remove' ? 'bg-danger' : 'bg-amber-500'}`} />
                  <span className="font-medium dark:text-text-dark light:text-text-light shrink-0">{row.path}</span>
                  <span className="dark:text-text-dark-muted light:text-text-light-muted truncate">
                    {row.kind === 'add' ? `→ ${row.after}` : row.kind === 'remove' ? `（${row.before}）` : `${row.before} → ${row.after}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="p-4 border-t dark:border-border-dark light:border-border-light space-y-2.5">
              <textarea
                value={submitNote}
                onChange={(e) => setSubmitNote(e.target.value)}
                placeholder="变更说明（可选）：告诉 DM 这次改动的缘由，如「升级后属性重排」「买了新装备」"
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border resize-none outline-none focus:border-primary dark:bg-card-dark-hover dark:border-border-dark dark:text-text-dark light:bg-card-light-hover light:border-border-light light:text-text-light"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSubmitDialogOpen(false)}
                  className="px-3 py-1.5 text-sm rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={handleSubmitDraft}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" /> {submitting ? '提交中…' : '确认提交'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
    } catch (err) {
  console.error('CharacterDetail 渲染崩溃:', err);
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-lg">
        <h2 className="text-xl font-bold text-danger">角色详情页渲染异常</h2>
        <p className="text-sm opacity-70 break-all">
          错误信息：{err instanceof Error ? err.message : String(err)}
        </p>
        <p className="text-xs opacity-50">
          请截屏此页面，或复制错误信息发送给开发者。
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm"
        >
          刷新
        </button>
      </div>
    </div>
  );
}
}
