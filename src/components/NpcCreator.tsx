import { useState, useRef, useEffect } from 'react';
import { X, Plus, Save, Keyboard, Users, User, ArrowLeft, Edit3, Check, Pencil } from 'lucide-react';
import type { NpcTemplate, NpcAttack, Combatant } from '@/types/combat';
import npcTemplateStore from '@/data/npcTemplateStore';
import { rollDice } from '@/data/diceService';

const ABILITY_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
type AbilityKey = typeof ABILITY_NAMES[number];
const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: '力量', dexterity: '敏捷', constitution: '体质',
  intelligence: '智力', wisdom: '感知', charisma: '魅力',
};

const DAMAGE_TYPES = ['挥砍', '穿刺', '钝击', '火焰', '冰冻', '闪电', '毒素', '雷鸣', '心灵', '光耀', '暗蚀', '力场'];
const WEAPON_PROPERTIES = ['灵巧', '重型', '轻型', '装填', '射程', '触及', '特殊', '双手', '投掷', '弹药', '多用'];
const MUTUALLY_EXCLUSIVE: Record<string, string> = { '射程': '投掷', '投掷': '射程' };

function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function useNumberInput(initialValue: number) {
  const [text, setText] = useState(String(initialValue));
  const [value, setValue] = useState(initialValue);
  const onChange = (s: string) => { setText(s); const n = parseInt(s, 10); if (!isNaN(n)) setValue(n); };
  const onBlur = () => { const n = parseInt(text, 10); if (isNaN(n)) { setText('0'); setValue(0); } else { setText(String(n)); setValue(n); } };
  const setExternal = (n: number) => { setText(String(n)); setValue(n); };
  return { text, value, onChange, onBlur, setExternal };
}

/** 单个NPC的可编辑状态 */
interface NpcEditState {
  name: string;
  abilities: Record<AbilityKey, string>;
  hp: number;
  speed: number;
  ac: number;
  attacks: NpcAttack[];
  d20: number;
  initiative: number;
  templateId?: string;
  childId?: string;
}

function createStateFromTemplate(template: NpcTemplate, index?: number): NpcEditState {
  const d20 = rollDice({ sides: 20, count: 1, mode: 'independent' }).values[0];
  const dexMod = calcModifier(template.dexterity);
  return {
    name: index !== undefined ? `${template.name}${index + 1}` : template.name,
    abilities: {
      strength: String(template.strength),
      dexterity: String(template.dexterity),
      constitution: String(template.constitution),
      intelligence: String(template.intelligence),
      wisdom: String(template.wisdom),
      charisma: String(template.charisma),
    },
    hp: template.maxHp,
    speed: template.speed,
    ac: template.ac,
    attacks: [...template.attacks],
    d20,
    initiative: d20 + dexMod,
    templateId: template.templateId,
    childId: `${template.templateId}-${crypto.randomUUID().slice(0, 8)}`,
  };
}

function stateToCombatant(state: NpcEditState): Omit<Combatant, 'id'> {
  return {
    name: state.name,
    initiative: state.initiative,
    ac: state.ac,
    maxHp: state.hp,
    currentHp: state.hp,
    isDead: false,
    isPc: false,
    speed: state.speed,
    note: '',
    templateId: state.templateId,
    childId: state.childId,
    attacks: state.attacks,
  };
}

interface Props {
  onClose: () => void;
  onCreate: (combatant: Omit<Combatant, 'id'>) => void;
  onBatchCreate?: (combatants: Omit<Combatant, 'id'>[]) => void;
  templates?: NpcTemplate[];
}

export default function NpcCreator({ onClose, onCreate, onBatchCreate, templates = [] }: Props) {
  // 阶段: 'choose' 选择模板/自定义, 'single-edit' 单个编辑, 'batch' 批量列表, 'batch-edit' 批量中编辑单个, 'edit-template' 编辑模板
  const [stage, setStage] = useState<'choose' | 'single-edit' | 'batch' | 'batch-edit' | 'edit-template'>('choose');
  const [selectedTemplate, setSelectedTemplate] = useState<NpcTemplate | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NpcTemplate | null>(null);

  // 批量生成
  const [batchCountInput, setBatchCountInput] = useState('5');
  const [batchNpcs, setBatchNpcs] = useState<NpcEditState[]>([]);
  const [editingIndex, setEditingIndex] = useState(-1);
  const batchDiceValuesRef = useRef<number[]>([]);

  const batchCount = Math.max(1, Math.min(50, parseInt(batchCountInput) || 1));

  // 单个编辑状态
  const [editState, setEditState] = useState<NpcEditState | null>(null);
  const [manualD20, setManualD20] = useState(false);

  // 保存为模板相关
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');

  const handleSelectTemplate = (template: NpcTemplate) => {
    setSelectedTemplate(template);
    setCustomMode(false);
  };

  const startEditTemplate = (template: NpcTemplate) => {
    setEditingTemplate(template);
    setStage('edit-template');
  };

  const startCustom = () => {
    setSelectedTemplate(null);
    setCustomMode(true);
    const d20 = rollDice({ sides: 20, count: 1, mode: 'independent' }).values[0];
    setEditState({
      name: '',
      abilities: { strength: '10', dexterity: '10', constitution: '10', intelligence: '10', wisdom: '10', charisma: '10' },
      hp: 10, speed: 30, ac: 10, attacks: [],
      d20, initiative: d20 + 0,
    });
    setStage('single-edit');
    setManualD20(false);
  };

  const startSingle = () => {
    if (customMode) {
      const d20 = rollDice({ sides: 20, count: 1, mode: 'independent' }).values[0];
      setEditState({
        name: '',
        abilities: { strength: '10', dexterity: '10', constitution: '10', intelligence: '10', wisdom: '10', charisma: '10' },
        hp: 10, speed: 30, ac: 10, attacks: [],
        d20, initiative: d20 + 0,
      });
    } else if (selectedTemplate) {
      setEditState(createStateFromTemplate(selectedTemplate));
    }
    setStage('single-edit');
    setManualD20(false);
  };

  const startBatch = () => {
    if (!selectedTemplate) return;
    setBatchNpcs([]);
    setBatchCountInput('5');
    setStage('batch');
  };

  const generateBatch = () => {
    if (!selectedTemplate) return;
    const count = Math.max(1, Math.min(50, batchCount));
    const npcs: NpcEditState[] = [];
    for (let i = 0; i < count; i++) {
      npcs.push(createStateFromTemplate(selectedTemplate, i));
    }
    // 按先攻从高到低排序
    npcs.sort((a, b) => b.initiative - a.initiative);
    // 重新命名（按先攻排序后的序号）
    npcs.forEach((npc, i) => {
      npc.name = `${selectedTemplate.name}${i + 1}`;
    });
    setBatchNpcs(npcs);
  };

  const openBatchEdit = (index: number) => {
    setEditingIndex(index);
    setEditState({ ...batchNpcs[index], abilities: { ...batchNpcs[index].abilities }, attacks: [...batchNpcs[index].attacks] });
    setManualD20(false);
    setStage('batch-edit');
  };

  const saveBatchEdit = () => {
    if (!editState || editingIndex < 0) return;
    const newBatch = [...batchNpcs];
    newBatch[editingIndex] = editState;
    // 重新排序
    newBatch.sort((a, b) => b.initiative - a.initiative);
    // 重新命名
    if (selectedTemplate) {
      newBatch.forEach((npc, i) => {
        npc.name = `${selectedTemplate.name}${i + 1}`;
      });
    }
    setBatchNpcs(newBatch);
    setStage('batch');
    setEditingIndex(-1);
    setEditState(null);
  };

  const importAll = () => {
    if (batchNpcs.length === 0) return;
    const combatants = batchNpcs.map(s => stateToCombatant(s));
    if (onBatchCreate) {
      onBatchCreate(combatants);
    } else {
      combatants.forEach(c => onCreate(c));
    }
    onClose();
  };

  const goBack = () => {
    if (stage === 'single-edit' || stage === 'batch') {
      setStage('choose');
      setEditState(null);
    } else if (stage === 'batch-edit') {
      setStage('batch');
      setEditingIndex(-1);
      setEditState(null);
    } else if (stage === 'edit-template') {
      setStage('choose');
      setEditingTemplate(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[90vh] overflow-y-auto">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {stage !== 'choose' && (
              <button onClick={goBack} className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
              {stage === 'choose' && '创建 NPC'}
              {stage === 'single-edit' && (customMode ? '自定义 NPC' : `${selectedTemplate?.name} · 单个`)}
              {stage === 'batch' && `${selectedTemplate?.name} · 批量生成`}
              {stage === 'batch-edit' && `编辑 ${selectedTemplate?.name}${editingIndex + 1}`}
              {stage === 'edit-template' && `编辑模板`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 阶段1: 选择模板/自定义 */}
        {stage === 'choose' && (
          <div className="space-y-4">
            {/* 自定义按钮 */}
            <button
              onClick={startCustom}
              className="w-full px-4 py-3 rounded-lg border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light flex items-center gap-3 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">自定义 NPC</div>
                <div className="text-xs opacity-60">从零开始创建一个新 NPC</div>
              </div>
            </button>

            {/* 模板列表 */}
            <div>
              <div className="text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted flex items-center justify-between">
                <span>从模板创建</span>
                <span className="text-xs opacity-60">点击模板选择，点击笔图标编辑</span>
              </div>
              {templates.length === 0 ? (
                <div className="text-center py-8 text-sm opacity-50 dark:text-text-dark-muted light:text-text-light-muted">
                  暂无模板
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                  {templates.map(t => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-2 ${
                        selectedTemplate?.id === t.id
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'dark:border-border-dark light:border-border-light hover:border-primary/50'
                      }`}
                      onClick={() => handleSelectTemplate(t)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium dark:text-text-dark light:text-text-light truncate">{t.name}</div>
                        <div className="text-xs opacity-60 dark:text-text-dark-muted light:text-text-light-muted">
                          AC {t.ac} | HP {t.maxHp} | 速度 {t.speed}尺
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditTemplate(t);
                        }}
                        className="p-2 rounded-lg hover:bg-primary/10 text-primary transition-colors shrink-0"
                        title="编辑模板"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 选中模板后显示的操作按钮 */}
            {selectedTemplate && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={startSingle}
                  className="flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                >
                  <User className="w-4 h-4" />
                  单个
                </button>
                <button
                  onClick={startBatch}
                  className="flex items-center justify-center gap-2 py-3 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light font-medium hover:bg-white/5 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  批量
                </button>
              </div>
            )}
          </div>
        )}

        {/* 阶段: 单个编辑 / 批量编辑单个 */}
        {(stage === 'single-edit' || stage === 'batch-edit') && editState && (
          <NpcEditor
            state={editState}
            setState={setEditState}
            manualD20={manualD20}
            setManualD20={setManualD20}
            customMode={customMode}
            saveAsTemplate={saveAsTemplate}
            setSaveAsTemplate={setSaveAsTemplate}
            templateId={templateId}
            setTemplateId={setTemplateId}
            templateName={templateName}
            setTemplateName={setTemplateName}
            isTemplate={!!selectedTemplate}
            onCancel={goBack}
            onSave={() => {
              if (stage === 'single-edit') {
                onCreate(stateToCombatant(editState));
                onClose();
              } else {
                saveBatchEdit();
              }
            }}
            saveLabel={stage === 'single-edit' ? '创建 NPC' : '保存修改'}
          />
        )}

        {/* 阶段: 模板编辑 */}
        {stage === 'edit-template' && editingTemplate && (
          <TemplateEditor
            template={editingTemplate}
            onCancel={() => {
              setEditingTemplate(null);
              setStage('choose');
            }}
            onSave={(data) => {
              npcTemplateStore.update(editingTemplate.id, data);
              setEditingTemplate(null);
              setStage('choose');
            }}
          />
        )}

        {/* 阶段: 批量列表 */}
        {stage === 'batch' && selectedTemplate && (
          <div className="space-y-4">
            {/* 数量输入 */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium dark:text-text-dark light:text-text-light whitespace-nowrap">
                生成数量
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={batchCountInput}
                onChange={(e) => setBatchCountInput(e.target.value)}
                onBlur={() => setBatchCountInput(String(batchCount))}
                className="w-20 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary text-center"
              />
              <button
                onClick={generateBatch}
                className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                生成
              </button>
            </div>

            {/* NPC 按钮网格 */}
            {batchNpcs.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
                  按先攻排序 · 点击编辑
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {batchNpcs.map((npc, i) => (
                    <button
                      key={i}
                      onClick={() => openBatchEdit(i)}
                      className="aspect-square flex flex-col items-center justify-center rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <span className="text-lg font-bold dark:text-text-dark light:text-text-light">{i + 1}</span>
                      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{npc.initiative}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 导入按钮 */}
            {batchNpcs.length > 0 && (
              <button
                onClick={importAll}
                className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                全部导入战斗（{batchNpcs.length} 个）
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface NpcEditorProps {
  state: NpcEditState;
  setState: React.Dispatch<React.SetStateAction<NpcEditState | null>>;
  manualD20: boolean;
  setManualD20: (v: boolean) => void;
  customMode: boolean;
  saveAsTemplate: boolean;
  setSaveAsTemplate: (v: boolean) => void;
  templateId: string;
  setTemplateId: (v: string) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  isTemplate: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}

function NpcEditor(props: NpcEditorProps) {
  const { state, setState, manualD20, setManualD20, customMode, saveAsTemplate, setSaveAsTemplate,
    templateId, setTemplateId, templateName, setTemplateName, isTemplate, onCancel, onSave, saveLabel } = props;

  const abilities: Record<AbilityKey, number> = {
    strength: parseInt(state.abilities.strength, 10) || 0,
    dexterity: parseInt(state.abilities.dexterity, 10) || 0,
    constitution: parseInt(state.abilities.constitution, 10) || 0,
    intelligence: parseInt(state.abilities.intelligence, 10) || 0,
    wisdom: parseInt(state.abilities.wisdom, 10) || 0,
    charisma: parseInt(state.abilities.charisma, 10) || 0,
  };

  const modifiers: Record<AbilityKey, number> = {
    strength: calcModifier(abilities.strength),
    dexterity: calcModifier(abilities.dexterity),
    constitution: calcModifier(abilities.constitution),
    intelligence: calcModifier(abilities.intelligence),
    wisdom: calcModifier(abilities.wisdom),
    charisma: calcModifier(abilities.charisma),
  };

  const handleAbilityChange = (ability: AbilityKey, text: string) => {
    setState(prev => prev ? { ...prev, abilities: { ...prev.abilities, [ability]: text } } : null);
    if (!manualD20 && ability === 'dexterity') {
      // 重新计算先攻
      const newDex = parseInt(text, 10) || 0;
      const newDexMod = calcModifier(newDex);
      setState(prev => prev ? { ...prev, initiative: prev.d20 + newDexMod } : null);
    }
  };

  const handleAbilityBlur = (ability: AbilityKey) => {
    const n = parseInt(state.abilities[ability], 10);
    if (isNaN(n)) {
      setState(prev => prev ? { ...prev, abilities: { ...prev.abilities, [ability]: '0' } } : null);
    } else {
      const clamped = Math.max(1, Math.min(30, n));
      setState(prev => prev ? { ...prev, abilities: { ...prev.abilities, [ability]: String(clamped) } } : null);
    }
  };

  const addAttack = () => {
    setState(prev => prev ? {
      ...prev,
      attacks: [...prev.attacks, { name: '', attackBonus: '', damage: '', damageType: '挥砍', range: '5 尺', properties: [] }],
    } : null);
  };

  const removeAttack = (index: number) => {
    setState(prev => prev ? { ...prev, attacks: prev.attacks.filter((_, i) => i !== index) } : null);
  };

  const updateAttack = (index: number, field: keyof NpcAttack, value: any) => {
    setState(prev => prev ? {
      ...prev,
      attacks: prev.attacks.map((a, i) => i === index ? { ...a, [field]: value } : a),
    } : null);
  };

  const toggleAttackProperty = (index: number, prop: string) => {
    setState(prev => {
      if (!prev) return null;
      const newAttacks = prev.attacks.map((a, i) => {
        if (i !== index) return a;
        if (a.properties.includes(prop)) {
          return { ...a, properties: a.properties.filter(p => p !== prop) };
        }
        const exclusive = MUTUALLY_EXCLUSIVE[prop];
        let props = a.properties;
        if (exclusive && props.includes(exclusive)) {
          props = props.filter(p => p !== exclusive);
        }
        return { ...a, properties: [...props, prop] };
      });
      return { ...prev, attacks: newAttacks };
    });
  };

  const getAttackRangeDisplay = (attack: NpcAttack) => {
    const hasRange = attack.properties.includes('射程');
    const hasThrown = attack.properties.includes('投掷');
    const hasAmmo = attack.properties.includes('弹药');
    if (hasRange) return { showMelee: false, showNormalMax: true };
    if (hasThrown || hasAmmo) return { showMelee: true, showNormalMax: true };
    return { showMelee: true, showNormalMax: false };
  };

  const rerollInitiative = () => {
    const d20 = rollDice({ sides: 20, count: 1, mode: 'independent' }).values[0];
    setState(prev => prev ? { ...prev, d20, initiative: d20 + modifiers.dexterity } : null);
  };

  const handleD20ManualChange = (text: string) => {
    const n = parseInt(text, 10);
    if (!isNaN(n) && n >= 1 && n <= 20) {
      setState(prev => prev ? { ...prev, d20: n, initiative: n + modifiers.dexterity } : null);
    } else if (text === '') {
      setState(prev => prev ? { ...prev, d20: 0, initiative: modifiers.dexterity } : null);
    }
  };

  const handleSave = () => {
    if (!state.name) { alert('请输入 NPC 名称'); return; }
    if (state.d20 < 1 || state.d20 > 20) { alert('请输入 1-20 之间的 d20 数值'); return; }

    if (customMode && saveAsTemplate) {
      if (!templateId.trim()) { alert('请输入模板 ID'); return; }
      if (!templateName.trim()) { alert('请输入模板名称'); return; }
      const existing = npcTemplateStore.getAll().find(t => t.templateId === templateId.trim());
      if (existing) { alert('该模板 ID 已存在，请使用其他 ID'); return; }
      npcTemplateStore.create({
        templateId: templateId.trim(),
        name: templateName.trim(),
        ...abilities,
        maxHp: state.hp, speed: state.speed, ac: state.ac,
        attacks: state.attacks,
      });
    }
    onSave();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
            NPC 名称
          </label>
          <input
            type="text"
            value={state.name}
            onChange={(e) => setState(prev => prev ? { ...prev, name: e.target.value } : null)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
            placeholder="例如：哥布林"
          />
        </div>
        <button onClick={handleSave} disabled={!state.name || state.d20 < 1 || state.d20 > 20}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 whitespace-nowrap">
          <Save className="w-4 h-4" />{saveLabel}
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
          六大属性（自动计算调整值）
        </label>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          {ABILITY_NAMES.map(ability => (
            <div key={ability} className="flex items-center gap-1">
              <label className="text-xs w-10 dark:text-text-dark-muted light:text-text-light-muted shrink-0">
                {ABILITY_LABELS[ability]}
              </label>
              <input
                type="number"
                value={state.abilities[ability]}
                onChange={(e) => handleAbilityChange(ability, e.target.value)}
                onBlur={() => handleAbilityBlur(ability)}
                className="w-16 px-2 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary text-center"
              />
              <span className={`text-xs font-bold w-5 text-center rounded shrink-0 ${
                modifiers[ability] >= 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {modifiers[ability] >= 0 ? '+' : ''}{modifiers[ability]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">AC</label>
          <input
            type="number"
            value={state.ac}
            onChange={(e) => setState(prev => prev ? { ...prev, ac: parseInt(e.target.value) || 0 } : null)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">HP</label>
          <input
            type="number"
            value={state.hp}
            onChange={(e) => setState(prev => prev ? { ...prev, hp: parseInt(e.target.value) || 0 } : null)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">速度（尺）</label>
          <input
            type="number"
            value={state.speed}
            onChange={(e) => setState(prev => prev ? { ...prev, speed: parseInt(e.target.value) || 0 } : null)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
          攻击方式
        </label>
        {state.attacks.length > 0 && (
          <div className="space-y-3 mb-3">
            {state.attacks.map((attack, index) => {
              const rangeDisplay = getAttackRangeDisplay(attack);
              return (
                <div key={index} className="p-3 rounded-lg border dark:border-border-dark light:border-border-light">
                  <div className="flex items-center justify-between mb-2">
                    <input
                      type="text"
                      value={attack.name}
                      onChange={(e) => updateAttack(index, 'name', e.target.value)}
                      className="flex-1 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                      placeholder="攻击名称"
                    />
                    <button type="button" onClick={() => removeAttack(index)} className="ml-2 p-1 rounded text-danger hover:bg-danger/10">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="dark:text-text-dark-muted light:text-text-light-muted">攻击加值</label>
                      <input type="text" value={attack.attackBonus} onChange={(e) => updateAttack(index, 'attackBonus', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary" placeholder="+5" />
                    </div>
                    <div>
                      <label className="dark:text-text-dark-muted light:text-text-light-muted">伤害</label>
                      <input type="text" value={attack.damage} onChange={(e) => updateAttack(index, 'damage', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary" placeholder="1d8+3" />
                    </div>
                    <div>
                      <label className="dark:text-text-dark-muted light:text-text-light-muted">伤害类型</label>
                      <select value={attack.damageType} onChange={(e) => updateAttack(index, 'damageType', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary">
                        {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {rangeDisplay.showMelee && (
                      <div>
                        <label className="dark:text-text-dark-muted light:text-text-light-muted">近战射程</label>
                        <input type="text" value={attack.range} onChange={(e) => updateAttack(index, 'range', e.target.value)}
                          className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary" placeholder="5 尺" />
                      </div>
                    )}
                  </div>
                  {rangeDisplay.showNormalMax && (
                    <div className="flex gap-2 text-xs mt-2">
                      <div className="flex items-center gap-1">
                        <label className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">常规</label>
                        <input type="number" value={attack.normalRange ?? ''}
                          onChange={(e) => { const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10); updateAttack(index, 'normalRange', v); }}
                          className="w-14 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center" placeholder="20" />
                        <span className="dark:text-text-dark-muted light:text-text-light-muted whitespace-nowrap">尺</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">最大</label>
                        <input type="number" value={attack.maxRange ?? ''}
                          onChange={(e) => { const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10); updateAttack(index, 'maxRange', v); }}
                          className="w-14 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center" placeholder="60" />
                        <span className="dark:text-text-dark-muted light:text-text-light-muted whitespace-nowrap">尺</span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {WEAPON_PROPERTIES.map(prop => (
                      <button key={prop} type="button" onClick={() => toggleAttackProperty(index, prop)}
                        className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                          attack.properties.includes(prop)
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted'
                        }`}>{prop}</button>
                    ))}
                  </div>
                  {attack.properties.includes('多用') && (
                    <div className="mt-2">
                      <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">双手伤害</label>
                      <input type="text" value={attack.twoHandedDamage ?? ''} onChange={(e) => updateAttack(index, 'twoHandedDamage', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-xs" placeholder="1d10" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={addAttack}
          className="w-full py-2 rounded-lg border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:border-primary hover:text-primary transition-colors text-sm flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" />添加攻击方式
        </button>
      </div>

      {/* 先攻投掷 */}
      <div>
        <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
          先攻投掷
        </label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">d20 结果</label>
            <div className="flex items-center gap-1">
              <input
                type="number" min={1} max={20}
                value={state.d20 || ''}
                onChange={(e) => handleD20ManualChange(e.target.value)}
                disabled={!manualD20}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary disabled:opacity-50"
                placeholder="1-20"
              />
              <button
                onClick={() => {
                  if (manualD20) {
                    setManualD20(false);
                    rerollInitiative();
                  } else {
                    setManualD20(true);
                  }
                }}
                className={`p-2 rounded-lg transition-colors ${
                  manualD20
                    ? 'bg-primary text-white'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
                title={manualD20 ? '返回自动骰' : '手动输入'}
              >
                <Keyboard className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1">
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">敏捷调整值</label>
            <div className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm font-bold text-center">
              {modifiers.dexterity >= 0 ? '+' : ''}{modifiers.dexterity}
            </div>
          </div>
          <div className="flex-1">
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">先攻总值</label>
            <div className="w-full px-3 py-2 rounded-lg border dark:border-primary/30 dark:bg-primary/10 light:bg-primary/10 dark:text-primary light:text-primary text-sm font-bold text-center">
              {state.d20 >= 1 && state.d20 <= 20 ? state.initiative : '-'}
            </div>
          </div>
        </div>
      </div>

      {/* 保存为模板（仅自定义模式） */}
      {customMode && (
        <>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={saveAsTemplate} onChange={(e) => {
              setSaveAsTemplate(e.target.checked);
              if (!e.target.checked) { setTemplateId(''); setTemplateName(''); }
            }} className="rounded" />
            <label className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              保存为模板（可多次使用）
            </label>
          </div>
          {saveAsTemplate && (
            <div className="space-y-3 p-3 rounded-lg border dark:border-border-dark light:border-border-light">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">模板 ID</label>
                <input type="text" value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  placeholder="例如：goblin" />
                <p className="text-xs text-danger mt-1">仅允许字母、数字、下划线和连字符</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">模板名称</label>
                <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  placeholder="例如：哥布林" />
              </div>
            </div>
          )}
        </>
      )}

      <div className="pt-2">
        <button onClick={onCancel}
          className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors">
          取消
        </button>
      </div>
    </div>
  );
}

interface TemplateEditorProps {
  template: NpcTemplate;
  onCancel: () => void;
  onSave: (data: Partial<Omit<NpcTemplate, 'id' | 'createdAt'>>) => void;
}

function TemplateEditor({ template, onCancel, onSave }: TemplateEditorProps) {
  const [name, setName] = useState(template.name);
  const [abilities, setAbilities] = useState<Record<AbilityKey, string>>({
    strength: String(template.strength),
    dexterity: String(template.dexterity),
    constitution: String(template.constitution),
    intelligence: String(template.intelligence),
    wisdom: String(template.wisdom),
    charisma: String(template.charisma),
  });
  const [hp, setHp] = useState(template.maxHp);
  const [speed, setSpeed] = useState(template.speed);
  const [ac, setAc] = useState(template.ac);
  const [attacks, setAttacks] = useState<NpcAttack[]>(template.attacks.map(a => ({ ...a })));

  const modifiers: Record<AbilityKey, number> = {
    strength: calcModifier(parseInt(abilities.strength, 10) || 0),
    dexterity: calcModifier(parseInt(abilities.dexterity, 10) || 0),
    constitution: calcModifier(parseInt(abilities.constitution, 10) || 0),
    intelligence: calcModifier(parseInt(abilities.intelligence, 10) || 0),
    wisdom: calcModifier(parseInt(abilities.wisdom, 10) || 0),
    charisma: calcModifier(parseInt(abilities.charisma, 10) || 0),
  };

  const handleAbilityChange = (ability: AbilityKey, text: string) => {
    setAbilities(prev => ({ ...prev, [ability]: text }));
  };

  const handleAbilityBlur = (ability: AbilityKey) => {
    const n = parseInt(abilities[ability], 10);
    if (isNaN(n)) {
      setAbilities(prev => ({ ...prev, [ability]: '0' }));
    } else {
      const clamped = Math.max(1, Math.min(30, n));
      setAbilities(prev => ({ ...prev, [ability]: String(clamped) }));
    }
  };

  const addAttack = () => {
    setAttacks(prev => [...prev, { name: '', attackBonus: '', damage: '', damageType: '挥砍', range: '5 尺', properties: [] }]);
  };

  const removeAttack = (index: number) => {
    setAttacks(prev => prev.filter((_, i) => i !== index));
  };

  const updateAttack = (index: number, field: keyof NpcAttack, value: any) => {
    setAttacks(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const toggleAttackProperty = (index: number, prop: string) => {
    setAttacks(prev => prev.map((a, i) => {
      if (i !== index) return a;
      if (a.properties.includes(prop)) {
        return { ...a, properties: a.properties.filter(p => p !== prop) };
      }
      const exclusive = MUTUALLY_EXCLUSIVE[prop];
      let props = a.properties;
      if (exclusive && props.includes(exclusive)) {
        props = props.filter(p => p !== exclusive);
      }
      return { ...a, properties: [...props, prop] };
    }));
  };

  const getAttackRangeDisplay = (attack: NpcAttack) => {
    const hasRange = attack.properties.includes('射程');
    const hasThrown = attack.properties.includes('投掷');
    const hasAmmo = attack.properties.includes('弹药');
    if (hasRange) return { showMelee: false, showNormalMax: true };
    if (hasThrown || hasAmmo) return { showMelee: true, showNormalMax: true };
    return { showMelee: true, showNormalMax: false };
  };

  const handleSave = () => {
    if (!name.trim()) { alert('请输入模板名称'); return; }
    onSave({
      name: name.trim(),
      templateId: template.templateId,
      strength: parseInt(abilities.strength, 10) || 10,
      dexterity: parseInt(abilities.dexterity, 10) || 10,
      constitution: parseInt(abilities.constitution, 10) || 10,
      intelligence: parseInt(abilities.intelligence, 10) || 10,
      wisdom: parseInt(abilities.wisdom, 10) || 10,
      charisma: parseInt(abilities.charisma, 10) || 10,
      maxHp: hp,
      speed,
      ac,
      attacks,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">编辑模板</h3>
        <button onClick={onCancel} className="p-1 rounded hover:bg-white/10">
          <X className="w-5 h-5 dark:text-text-dark light:text-text-light" />
        </button>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
            模板名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
            placeholder="例如：哥布林"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1 whitespace-nowrap"
        >
          <Save className="w-4 h-4" />保存模板
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
          六大属性（自动计算调整值）
        </label>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          {ABILITY_NAMES.map(ability => (
            <div key={ability} className="flex items-center gap-1">
              <label className="text-xs w-10 dark:text-text-dark-muted light:text-text-light-muted shrink-0">
                {ABILITY_LABELS[ability]}
              </label>
              <input
                type="number"
                value={abilities[ability]}
                onChange={(e) => handleAbilityChange(ability, e.target.value)}
                onBlur={() => handleAbilityBlur(ability)}
                className="w-16 px-2 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary text-center"
              />
              <span className={`text-xs font-bold w-5 text-center rounded shrink-0 ${
                modifiers[ability] >= 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {modifiers[ability] >= 0 ? '+' : ''}{modifiers[ability]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">AC</label>
          <input
            type="number"
            value={ac}
            onChange={(e) => setAc(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">HP</label>
          <input
            type="number"
            value={hp}
            onChange={(e) => setHp(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">速度（尺）</label>
          <input
            type="number"
            value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
          攻击方式
        </label>
        {attacks.length > 0 && (
          <div className="space-y-3 mb-3">
            {attacks.map((attack, index) => {
              const rangeDisplay = getAttackRangeDisplay(attack);
              return (
                <div key={index} className="p-3 rounded-lg border dark:border-border-dark light:border-border-light">
                  <div className="flex items-center justify-between mb-2">
                    <input
                      type="text"
                      value={attack.name}
                      onChange={(e) => updateAttack(index, 'name', e.target.value)}
                      className="flex-1 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                      placeholder="攻击名称"
                    />
                    <button type="button" onClick={() => removeAttack(index)} className="ml-2 p-1 rounded text-danger hover:bg-danger/10">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="dark:text-text-dark-muted light:text-text-light-muted">攻击加值</label>
                      <input type="text" value={attack.attackBonus} onChange={(e) => updateAttack(index, 'attackBonus', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary" placeholder="+5" />
                    </div>
                    <div>
                      <label className="dark:text-text-dark-muted light:text-text-light-muted">伤害</label>
                      <input type="text" value={attack.damage} onChange={(e) => updateAttack(index, 'damage', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary" placeholder="1d8+3" />
                    </div>
                    <div>
                      <label className="dark:text-text-dark-muted light:text-text-light-muted">伤害类型</label>
                      <select value={attack.damageType} onChange={(e) => updateAttack(index, 'damageType', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary">
                        {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {rangeDisplay.showMelee && (
                      <div>
                        <label className="dark:text-text-dark-muted light:text-text-light-muted">近战射程</label>
                        <input type="text" value={attack.range} onChange={(e) => updateAttack(index, 'range', e.target.value)}
                          className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary" placeholder="5 尺" />
                      </div>
                    )}
                  </div>
                  {rangeDisplay.showNormalMax && (
                    <div className="flex gap-2 text-xs mt-2">
                      <div className="flex items-center gap-1">
                        <label className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">常规</label>
                        <input type="number" value={attack.normalRange ?? ''}
                          onChange={(e) => { const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10); updateAttack(index, 'normalRange', v); }}
                          className="w-14 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center" placeholder="20" />
                        <span className="dark:text-text-dark-muted light:text-text-light-muted whitespace-nowrap">尺</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="dark:text-text-dark-muted light:text-text-light-muted shrink-0">最大</label>
                        <input type="number" value={attack.maxRange ?? ''}
                          onChange={(e) => { const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10); updateAttack(index, 'maxRange', v); }}
                          className="w-14 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center" placeholder="60" />
                        <span className="dark:text-text-dark-muted light:text-text-light-muted whitespace-nowrap">尺</span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {WEAPON_PROPERTIES.map(prop => (
                      <button key={prop} type="button" onClick={() => toggleAttackProperty(index, prop)}
                        className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                          attack.properties.includes(prop)
                            ? 'bg-primary/10 text-primary border-primary/30'
                            : 'dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted'
                        }`}>{prop}</button>
                    ))}
                  </div>
                  {attack.properties.includes('多用') && (
                    <div className="mt-2">
                      <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">双手伤害</label>
                      <input type="text" value={attack.twoHandedDamage ?? ''} onChange={(e) => updateAttack(index, 'twoHandedDamage', e.target.value)}
                        className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-xs" placeholder="1d10" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={addAttack}
          className="w-full py-2 rounded-lg border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:border-primary hover:text-primary transition-colors text-sm flex items-center justify-center gap-1">
          <Plus className="w-4 h-4" />添加攻击方式
        </button>
      </div>

      <div className="pt-2">
        <button onClick={onCancel}
          className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors">
          取消
        </button>
      </div>
    </div>
  );
}
