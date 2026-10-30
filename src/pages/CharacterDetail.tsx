// DM Toolkit - Character Detail Page Component
import { useState, useEffect, Fragment } from 'react';
import { useEditorState } from '@/data/editorState';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  Shield,
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
  Tag,
} from 'lucide-react';
import type { Character, Abilities, AbilityScore, AbilityKey, SkillKey, ProficiencyCategory, Equipment, Attack, Feature } from '@/types/character';
import type { CharacterOption } from '@/types/characterOption';
import type { Spell } from '@/types/spell';
import type { EquipmentItem } from '@/types/equipment';
import { characterStore, SKILL_LABELS } from '@/data/characterStore';
import { useNumberInput, type UseNumberInputResult } from '@/hooks/useInput';
import { buildAbilityEntries, collectCharacterAbilityBonuses } from '@/data/abilityBonus';
import { computeFinalProficiencies, collectProficiencyBonusRules, buildFinalProficiencies } from '@/data/proficiencyBonus';
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
import CharacterEquipmentCard from '@/components/CharacterEquipmentCard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEquipmentActions } from '@/hooks/useEquipmentActions';
import TradeModal from '@/components/TradeModal';

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
  externalCharacter = null,
}: {
  readOnly?: boolean;
  externalCharacter?: Character | null;
} = {}) {

  try {
  

  const { id } = useParams<{ id: string }>();
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
  }, [id, externalCharacter]);

  // 选项库种子 chunk 晚到时重渲染一次（亚种下拉的条件渲染依赖 getSubraces）
  const [, setOptionTick] = useState(0);
  useEffect(() => optionStore.subscribe(() => setOptionTick((t) => t + 1)), []);

  // 打开角色时按基线重算一次最终属性值：选项缓存异步加载会改变规则集，
  // 不重算则静态值滞留旧底、与属性解析口径漂移（基线未设置时 recompute 自动跳过）
  useEffect(() => {
    if (id && !externalCharacter) {
      characterStore.recomputeAbilities(id);
    }
  }, [id, externalCharacter]);

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

  const handleAddEquipmentFromLibrary = (item: EquipmentItem) => {
  if (!id) return;
  const temp = hookHandleAddEquipmentFromLibrary(item);
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
    const categoryOrder = ['武器', '护甲', '法器', '工具', '药水', '杂物'];
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
  // 职业特性全量写入并携带 level，显示层按角色等级过滤（升级后自动出现新特性）
  const applyOptionTraits = (
    basePatch: Partial<Character>,
    traits: { name: string; text: string; level?: number }[],
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
    applyOptionTraits(
      { profession: { ...character.profession, class: opt.name } },
      opt.traits,
      ['职业特性'],
      '职业特性',
      opt.name
    );
    reloadChar();
  };

  const handleBackgroundSelect = (opt: CharacterOption) => {
    const traits: { name: string; text: string }[] = [];
    if (opt.feature) traits.push(opt.feature);
    if (opt.mechanics?.skills) traits.push({ name: '技能熟练项', text: opt.mechanics.skills });
    if (opt.mechanics?.tools) traits.push({ name: '工具熟练项', text: opt.mechanics.tools });
    if (opt.mechanics?.languages) traits.push({ name: '语言', text: opt.mechanics.languages });
    if (opt.mechanics?.equipment) traits.push({ name: '装备', text: opt.mechanics.equipment });
    applyOptionTraits({ background: opt.name }, traits, ['背景特性'], '背景特性', opt.name);
    reloadChar();
  };

  const handleDeleteFeature = (featureId: string) => {
    if (!id) return;
    characterStore.deleteFeature(id, featureId);
    reloadChar();
  };

  // 特性/特质卡片（主列表与底部隐藏折叠块共用）；inHiddenBlock 时眼睛按钮变为恢复
  const renderFeatureCard = (feature: Feature, inHiddenBlock: boolean) => (
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
        {feature.source && (
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted truncate">
            {feature.source}
          </span>
        )}
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
        <button
          onClick={() => handleDeleteFeature(feature.id!)}
          className="p-1 rounded hover:bg-danger/20 text-danger flex-shrink-0"
          title="移除此条目"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {feature.description && (
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted leading-relaxed whitespace-pre-wrap">
          {renderSpellDice(feature.description)}
        </p>
      )}
    </div>
  );

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

      {!readOnly && (
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
          {saveSources && (
            <span className="text-[10px] text-primary" title="选项解析授予">{saveSources.join('、')}</span>
          )}
          {saveFinal && profFinal.saveMarks[group.save.key] && (
            <span className="text-[10px] text-primary/80 inline-flex items-center gap-0.5" title="手动来源标记">
              <Tag className="w-3 h-3" />{profFinal.saveMarks[group.save.key]}
            </span>
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
            {sources && (
              <span className="text-[10px] text-primary" title="选项解析授予">{sources.join('、')}</span>
            )}
            {finalProf && profFinal.skillMarks[skill.key] && (
              <span className="text-[10px] text-primary/80 inline-flex items-center gap-0.5" title="手动来源标记">
                <Tag className="w-3 h-3" />{profFinal.skillMarks[skill.key]}
              </span>
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
                    <span key={index} className="px-2 py-1 rounded-lg text-xs dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light">
                      {item}
                      {mark && (
                        <span className="text-[10px] text-primary/80 ml-1" title="手动来源标记">{mark}</span>
                      )}
                    </span>
                    );
                  })}
                  {granted.map((g, i) => (
                    <span key={`granted-${i}`} className="px-2 py-1 rounded-lg text-xs bg-primary/10 text-primary"
                      title={`选项解析授予：${g.sourceLabel}`}>
                      {g.name} <span className="text-[10px] text-primary/70">{g.sourceLabel}</span>
                      {profFinalChips.chipMarks[category][g.name] && (
                        <span className="text-[10px] text-primary/80" title="手动来源标记">+ {profFinalChips.chipMarks[category][g.name]}</span>
                      )}
                    </span>
                  ))}
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
                  // 判断攻击是否"可用"：同名武器被手持且可用
                  const attackUsable = (() => {
                    const heldLeftId = character.heldLeft?.equipmentId;
                    const heldRightId = character.heldRight?.equipmentId;
                    const leftItem = heldLeftId ? character.equipment.find(e => (e.childId || e.id) === heldLeftId) : null;
                    const rightItem = heldRightId ? character.equipment.find(e => (e.childId || e.id) === heldRightId) : null;
                    const leftMatch = leftItem && leftItem.name === attack.name;
                    const rightMatch = rightItem && rightItem.name === attack.name;
                    if (leftMatch && characterStore.isWeaponUsable(character, 'left')) return true;
                    if (rightMatch && characterStore.isWeaponUsable(character, 'right')) return true;
                    return false;
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
  const heldHand: 'L' | 'R' | null =
    character.heldLeft?.equipmentId === itemId ? 'L' :
    character.heldRight?.equipmentId === itemId ? 'R' : null;
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
                    {/* 可编辑：点击切换 */}
                    {!readOnly && (
                      <select
                        value={characterStore.getSpellcastingAbility(character) || 'intelligence'}
                        onChange={(e) => {
                          characterStore.update(id!, { spellcastingAbility: e.target.value as AbilityKey });
                          reloadChar();
                        }}
                        className="ml-1 text-xs px-1 py-0.5 rounded bg-transparent border dark:border-border-dark light:border-border-light outline-none text-primary"
                      >
                        {(['strength','dexterity','constitution','intelligence','wisdom','charisma'] as AbilityKey[]).map((k) => (
                          <option key={k} value={k}>{abilityLabels[k]}</option>
                        ))}
                      </select>
                    )}
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

                {/* ★ 新增：法术豁免 DC（左侧空间留给未来的法术检定值） */}
                {(() => {
                  const saveDC = characterStore.calcSpellSaveDC(character);
                  if (saveDC === null) return null;
                  return (
                    <div className="flex items-center gap-4 p-3 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                      <div className="flex items-center gap-2 ml-auto">
                        <Shield className="w-4 h-4 text-info" />
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          法术豁免 DC
                        </span>
                        <span className="text-lg font-bold dark:text-text-dark light:text-text-light">
                          {saveDC}
                        </span>
                        <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
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
                  <div className="grid grid-cols-3 gap-2">
                    {(() => {
                      const spellData = characterStore.getSpellSlotDisplayData(character);
                      if (!spellData) return null;
                      return spellData.spellSlots.map((slot) => (
                        <div
                          key={slot.level}
                          className="p-2 rounded-lg text-center dark:bg-bg-dark light:bg-bg-light-2"
                        >
                          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                            {slot.label}
                            {slot.isWarlock && <span className="ml-1 text-[10px]">(短休)</span>}
                          </div>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <input
                              type="number"
                              value={slot.used === 0 ? '' : slot.used}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  // 允许清空，暂不更新 store
                                } else {
                                  const num = parseInt(val);
                                  if (!isNaN(num)) {
                                    const levelKey = 'level' + slot.level;
                                    handleUpdateSpellSlots(levelKey, 'used', num);
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                if (e.target.value === '') {
                                  const levelKey = 'level' + slot.level;
                                  handleUpdateSpellSlots(levelKey, 'used', 0);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.target as HTMLInputElement).value === '') {
                                  const levelKey = 'level' + slot.level;
                                  handleUpdateSpellSlots(levelKey, 'used', 0);
                                }
                              }}
                              placeholder="0"
                              className="w-8 py-0.5 text-sm rounded bg-white/50 dark:bg-white/10 outline-none text-center dark:text-text-dark light:text-text-light"
                            />
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">/</span>
                            <span className="w-8 py-0.5 text-sm text-center dark:text-text-dark-muted light:text-text-light-muted">
                              {slot.max}
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

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
              {character.features
                .filter(
                  // 职业特性按等级门槛显示（数据仍保留在卡上）；被 DM 隐藏的条目移入底部折叠块
                  (f) =>
                    (f.category !== '职业特性' ||
                      !f.level ||
                      f.level <= (character.level || 1)) &&
                    !hiddenFeatures.has(`${f.category || ''}:${f.name}`)
                )
                 .map((feature) => renderFeatureCard(feature, false))}
              {(() => {
                const hiddenList = character.features.filter((f) =>
                  hiddenFeatures.has(`${f.category || ''}:${f.name}`)
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
                  暂无特性，可通过上方种族/职业/背景选择器从选项库填充
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

      {!readOnly && (
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
    showSyncOption={true}
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
                  if (hideConfirmKey) toggleFeatureHidden(hideConfirmKey);
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

      {/* DM 模式下显示浮动同步按钮 */}
      {!readOnly && <SyncButton />}
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
