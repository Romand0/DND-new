import { useState } from 'react';
import { X, Plus, Trash2, Save, FolderOpen } from 'lucide-react';
import type { NpcTemplate, NpcAttack } from '@/types/combat';
import npcTemplateStore from '@/data/npcTemplateStore';

interface Props {
  onClose: () => void;
  onCreate: (combatant: Omit<import('@/types/combat').Combatant, 'id'>) => void;
  templates?: NpcTemplate[];
}

const ABILITY_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
type AbilityKey = typeof ABILITY_NAMES[number];
const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const DAMAGE_TYPES = ['挥砍', '穿刺', '钝击', '火焰', '冰冻', '闪电', '毒素', '雷鸣', '心灵', '光耀', '暗蚀', '力场'];

const WEAPON_PROPERTIES = ['灵巧', '重型', '轻型', '装填', '射程', '触及', '特殊', '双手', '投掷', '弹药', '多用'];

/** 射程与投掷互斥 */
const MUTUALLY_EXCLUSIVE: Record<string, string> = {
  '射程': '投掷',
  '投掷': '射程',
};

function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** 数字输入辅助：允许编辑过程中为空字符串，blur 时回填 0 */
function useNumberInput(initialValue: number) {
  const [text, setText] = useState(String(initialValue));
  const [value, setValue] = useState(initialValue);

  const onChange = (s: string) => {
    setText(s);
    const n = parseInt(s, 10);
    if (!isNaN(n)) setValue(n);
  };

  const onBlur = () => {
    const n = parseInt(text, 10);
    if (isNaN(n)) {
      setText('0');
      setValue(0);
    } else {
      setText(String(n));
      setValue(n);
    }
  };

  const setExternal = (n: number) => {
    setText(String(n));
    setValue(n);
  };

  return { text, value, onChange, onBlur, setExternal };
}

export default function NpcCreator({ onClose, onCreate, templates = [] }: Props) {
  const [mode, setMode] = useState<'create' | 'select'>('create');
  const [d20Input, setD20Input] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // 属性使用字符串状态，允许编辑过程中清空
  const [abilityTexts, setAbilityTexts] = useState<Record<AbilityKey, string>>({
    strength: '10',
    dexterity: '10',
    constitution: '10',
    intelligence: '10',
    wisdom: '10',
    charisma: '10',
  });

  const abilities: Record<AbilityKey, number> = {
    strength: parseInt(abilityTexts.strength, 10) || 0,
    dexterity: parseInt(abilityTexts.dexterity, 10) || 0,
    constitution: parseInt(abilityTexts.constitution, 10) || 0,
    intelligence: parseInt(abilityTexts.intelligence, 10) || 0,
    wisdom: parseInt(abilityTexts.wisdom, 10) || 0,
    charisma: parseInt(abilityTexts.charisma, 10) || 0,
  };

  const modifiers: Record<AbilityKey, number> = {
    strength: calcModifier(abilities.strength),
    dexterity: calcModifier(abilities.dexterity),
    constitution: calcModifier(abilities.constitution),
    intelligence: calcModifier(abilities.intelligence),
    wisdom: calcModifier(abilities.wisdom),
    charisma: calcModifier(abilities.charisma),
  };

  const [name, setName] = useState('');
  const hpInput = useNumberInput(10);
  const speedInput = useNumberInput(30);
  const acInput = useNumberInput(10);
  const [attacks, setAttacks] = useState<NpcAttack[]>([]);

  const initiative = () => {
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return null;
    return d20 + modifiers.dexterity;
  };

  const handleAbilityChange = (ability: AbilityKey, text: string) => {
    setAbilityTexts(prev => ({ ...prev, [ability]: text }));
  };

  const handleAbilityBlur = (ability: AbilityKey) => {
    const n = parseInt(abilityTexts[ability], 10);
    if (isNaN(n)) {
      setAbilityTexts(prev => ({ ...prev, [ability]: '0' }));
    } else {
      const clamped = Math.max(1, Math.min(30, n));
      setAbilityTexts(prev => ({ ...prev, [ability]: String(clamped) }));
    }
  };

  const addAttack = () => {
    setAttacks(prev => [...prev, {
      name: '',
      attackBonus: '',
      damage: '',
      damageType: '挥砍',
      range: '5 尺',
      properties: [],
    }]);
  };

  const removeAttack = (index: number) => {
    setAttacks(prev => prev.filter((_, i) => i !== index));
  };

  const updateAttack = (index: number, field: keyof NpcAttack, value: any) => {
    setAttacks(prev => prev.map((a, i) =>
      i === index ? { ...a, [field]: value } : a
    ));
  };

  const toggleAttackProperty = (index: number, prop: string) => {
    setAttacks(prev => prev.map((a, i) => {
      if (i !== index) return a;
      if (a.properties.includes(prop)) {
        // 取消选中
        return { ...a, properties: a.properties.filter(p => p !== prop) };
      }
      // 选中：移除互斥属性
      const exclusive = MUTUALLY_EXCLUSIVE[prop];
      let props = a.properties;
      if (exclusive && props.includes(exclusive)) {
        props = props.filter(p => p !== exclusive);
      }
      return { ...a, properties: [...props, prop] };
    }));
  };

  // 攻击射程显示逻辑
  const getAttackRangeDisplay = (attack: NpcAttack): {
    showMelee: boolean;
    showNormalMax: boolean;
  } => {
    const hasRange = attack.properties.includes('射程');
    const hasThrown = attack.properties.includes('投掷');
    const hasAmmo = attack.properties.includes('弹药');
    // 射程属性 → 只显示常规/最大
    if (hasRange) return { showMelee: false, showNormalMax: true };
    // 投掷属性 → 显示近战 + 常规/最大
    if (hasThrown || hasAmmo) return { showMelee: true, showNormalMax: true };
    // 都没有 → 只显示近战射程
    return { showMelee: true, showNormalMax: false };
  };

  const handleCreate = () => {
    if (!name) {
      alert('请输入 NPC 名称');
      return;
    }
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) {
      alert('请输入 1-20 之间的 d20 数值');
      return;
    }

    const finalAbilities = {
      strength: Math.max(1, Math.min(30, parseInt(abilityTexts.strength, 10) || 0)),
      dexterity: Math.max(1, Math.min(30, parseInt(abilityTexts.dexterity, 10) || 0)),
      constitution: Math.max(1, Math.min(30, parseInt(abilityTexts.constitution, 10) || 0)),
      intelligence: Math.max(1, Math.min(30, parseInt(abilityTexts.intelligence, 10) || 0)),
      wisdom: Math.max(1, Math.min(30, parseInt(abilityTexts.wisdom, 10) || 0)),
      charisma: Math.max(1, Math.min(30, parseInt(abilityTexts.charisma, 10) || 0)),
    };

    if (saveAsTemplate) {
      npcTemplateStore.create({
        name,
        ...finalAbilities,
        maxHp: hpInput.value,
        speed: speedInput.value,
        ac: acInput.value,
        attacks,
      });
    }

    onCreate({
      name,
      initiative: d20 + calcModifier(finalAbilities.dexterity),
      ac: acInput.value,
      maxHp: hpInput.value,
      currentHp: hpInput.value,
      isDead: false,
      isPc: false,
      speed: speedInput.value,
      note: '',
    });

    onClose();
  };

  const handleSelectTemplate = (template: NpcTemplate) => {
    setName(template.name);
    setAbilityTexts({
      strength: String(template.strength),
      dexterity: String(template.dexterity),
      constitution: String(template.constitution),
      intelligence: String(template.intelligence),
      wisdom: String(template.wisdom),
      charisma: String(template.charisma),
    });
    hpInput.setExternal(template.maxHp);
    speedInput.setExternal(template.speed);
    acInput.setExternal(template.ac);
    setAttacks([...template.attacks]);
    setMode('create');
    setD20Input('');
  };

  if (mode === 'select') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">选择NPC模板</h3>
            <button onClick={() => onClose()} className="p-1 rounded hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setMode('create')}
            className="w-full mb-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-2 justify-center hover:bg-white/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建 NPC
          </button>
          {templates.length === 0 ? (
            <div className="text-center py-8 text-sm opacity-50">暂无模板</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/50 cursor-pointer transition-colors"
                >
                  <div className="font-medium dark:text-text-dark light:text-text-light">{t.name}</div>
                  <div className="text-xs opacity-60">
                    AC {t.ac} | HP {t.maxHp} | 速度 {t.speed}尺
                  </div>
                  {t.attacks.length > 0 && (
                    <div className="text-xs opacity-60 mt-1">
                      攻击: {t.attacks.map(a => a.name).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-lg rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">创建 NPC</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('select')}
              className="p-1 rounded hover:bg-white/10"
              title="从模板创建"
            >
              <FolderOpen className="w-5 h-5" />
            </button>
            <button onClick={() => onClose()} className="p-1 rounded hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
              NPC 名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              placeholder="例如：哥布林"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
              六大属性（自动计算调整值）
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ABILITY_NAMES.map(ability => (
                <div key={ability} className="flex items-center gap-2">
                  <label className="text-xs w-12 dark:text-text-dark-muted light:text-text-light-muted">
                    {ABILITY_LABELS[ability]}
                  </label>
                  <input
                    type="number"
                    value={abilityTexts[ability]}
                    onChange={(e) => handleAbilityChange(ability, e.target.value)}
                    onBlur={() => handleAbilityBlur(ability)}
                    className="flex-1 px-2 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  />
                  <span className={`text-xs font-bold w-6 text-center rounded ${
                    modifiers[ability] >= 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {modifiers[ability] >= 0 ? '+' : ''}
                    {modifiers[ability]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                AC
              </label>
              <input
                type="number"
                value={acInput.text}
                onChange={(e) => acInput.onChange(e.target.value)}
                onBlur={acInput.onBlur}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                HP
              </label>
              <input
                type="number"
                value={hpInput.text}
                onChange={(e) => hpInput.onChange(e.target.value)}
                onBlur={hpInput.onBlur}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                速度（尺）
              </label>
              <input
                type="number"
                value={speedInput.text}
                onChange={(e) => speedInput.onChange(e.target.value)}
                onBlur={speedInput.onBlur}
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
                        <button
                          type="button"
                          onClick={() => removeAttack(index)}
                          className="ml-2 p-1 rounded text-danger hover:bg-danger/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="dark:text-text-dark-muted light:text-text-light-muted">攻击加值</label>
                          <input
                            type="text"
                            value={attack.attackBonus}
                            onChange={(e) => updateAttack(index, 'attackBonus', e.target.value)}
                            className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                            placeholder="+5"
                          />
                        </div>
                        <div>
                          <label className="dark:text-text-dark-muted light:text-text-light-muted">伤害</label>
                          <input
                            type="text"
                            value={attack.damage}
                            onChange={(e) => updateAttack(index, 'damage', e.target.value)}
                            className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                            placeholder="1d8+3"
                          />
                        </div>
                        <div>
                          <label className="dark:text-text-dark-muted light:text-text-light-muted">伤害类型</label>
                          <select
                            value={attack.damageType}
                            onChange={(e) => updateAttack(index, 'damageType', e.target.value)}
                            className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                          >
                            {DAMAGE_TYPES.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        {rangeDisplay.showMelee && (
                          <div>
                            <label className="dark:text-text-dark-muted light:text-text-light-muted">近战射程</label>
                            <input
                              type="text"
                              value={attack.range}
                              onChange={(e) => updateAttack(index, 'range', e.target.value)}
                              className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                              placeholder="5 尺"
                            />
                          </div>
                        )}
                      </div>
                      {rangeDisplay.showNormalMax && (
                        <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                          <div>
                            <label className="dark:text-text-dark-muted light:text-text-light-muted">常规射程</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={attack.normalRange ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                  updateAttack(index, 'normalRange', v);
                                }}
                                className="flex-1 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                                placeholder="20"
                              />
                              <span className="dark:text-text-dark-muted light:text-text-light-muted whitespace-nowrap">尺</span>
                            </div>
                          </div>
                          <div>
                            <label className="dark:text-text-dark-muted light:text-text-light-muted">最大射程</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={attack.maxRange ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                  updateAttack(index, 'maxRange', v);
                                }}
                                className="flex-1 px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                                placeholder="60"
                              />
                              <span className="dark:text-text-dark-muted light:text-text-light-muted whitespace-nowrap">尺</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {WEAPON_PROPERTIES.map(prop => (
                          <button
                            key={prop}
                            type="button"
                            onClick={() => toggleAttackProperty(index, prop)}
                            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                              attack.properties.includes(prop)
                                ? 'bg-primary/10 text-primary border-primary/30'
                                : 'dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted'
                            }`}
                          >
                            {prop}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={addAttack}
              className="w-full py-2 rounded-lg border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:border-primary hover:text-primary transition-colors text-sm flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              添加攻击方式
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
              先攻投掷
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">d20 结果</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={d20Input}
                  onChange={(e) => setD20Input(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  placeholder="1-20"
                />
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
                  {initiative() ?? '-'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              className="rounded"
            />
            <label className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              保存为模板（可多次使用）
            </label>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => onClose()}
              className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={!name || isNaN(parseInt(d20Input, 10))}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              <Save className="w-4 h-4" />
              创建 NPC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}