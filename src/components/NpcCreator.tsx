import { useState } from 'react';
import { X, Plus, Trash2, Save, FolderOpen } from 'lucide-react';
import type { NpcTemplate, NpcAttack } from '@/types/combat';
import npcTemplateStore from '@/data/npcTemplateStore';

interface Props {
  onClose: () => void;
  onCreate: (combatant: Omit<import('@/types/combat').Combatant, 'id'>) => void;
  templates?: NpcTemplate[];
}

const ABILITY_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
const ABILITY_LABELS: Record<string, string> = {
  strength: '力量',
  dexterity: '敏捷',
  constitution: '体质',
  intelligence: '智力',
  wisdom: '感知',
  charisma: '魅力',
};

const DAMAGE_TYPES = ['挥砍', '穿刺', '钝击', '火焰', '冰冻', '闪电', '毒素', '雷鸣', '心灵', '光耀', '暗蚀', '力场'];

const WEAPON_PROPERTIES = ['灵巧', '重型', '轻型', '装填', '射程', '触及', '特殊', '双手', '投掷', '弹药', '多用'];

function calcModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export default function NpcCreator({ onClose, onCreate, templates = [] }: Props) {
  const [mode, setMode] = useState<'create' | 'select'>('create');
  const [d20Input, setD20Input] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    maxHp: 10,
    speed: 30,
    ac: 10,
    attacks: [] as NpcAttack[],
  });

  const modifiers = {
    strength: calcModifier(formData.strength),
    dexterity: calcModifier(formData.dexterity),
    constitution: calcModifier(formData.constitution),
    intelligence: calcModifier(formData.intelligence),
    wisdom: calcModifier(formData.wisdom),
    charisma: calcModifier(formData.charisma),
  };

  const initiative = () => {
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return null;
    return d20 + modifiers.dexterity;
  };

  const handleAbilityChange = (ability: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      [ability]: Math.max(1, Math.min(30, value)),
    }));
  };

  const addAttack = () => {
    setFormData(prev => ({
      ...prev,
      attacks: [...prev.attacks, {
        name: '',
        attackBonus: '',
        damage: '',
        damageType: '挥砍',
        range: '5 尺',
        properties: [],
      }],
    }));
  };

  const removeAttack = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attacks: prev.attacks.filter((_, i) => i !== index),
    }));
  };

  const updateAttack = (index: number, field: keyof NpcAttack, value: any) => {
    setFormData(prev => ({
      ...prev,
      attacks: prev.attacks.map((a, i) =>
        i === index ? { ...a, [field]: value } : a
      ),
    }));
  };

  const toggleAttackProperty = (index: number, prop: string) => {
    setFormData(prev => ({
      ...prev,
      attacks: prev.attacks.map((a, i) => {
        if (i !== index) return a;
        return {
          ...a,
          properties: a.properties.includes(prop)
            ? a.properties.filter(p => p !== prop)
            : [...a.properties, prop],
        };
      }),
    }));
  };

  const handleCreate = () => {
    if (!formData.name) {
      alert('请输入 NPC 名称');
      return;
    }
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) {
      alert('请输入 1-20 之间的 d20 数值');
      return;
    }

    if (saveAsTemplate) {
      npcTemplateStore.create({
        name: formData.name,
        strength: formData.strength,
        dexterity: formData.dexterity,
        constitution: formData.constitution,
        intelligence: formData.intelligence,
        wisdom: formData.wisdom,
        charisma: formData.charisma,
        maxHp: formData.maxHp,
        speed: formData.speed,
        ac: formData.ac,
        attacks: formData.attacks,
      });
    }

    onCreate({
      name: formData.name,
      initiative: d20 + modifiers.dexterity,
      ac: formData.ac,
      maxHp: formData.maxHp,
      currentHp: formData.maxHp,
      isDead: false,
      isPc: false,
      speed: formData.speed,
      note: '',
    });

    onClose();
  };

  const handleSelectTemplate = (template: NpcTemplate) => {
    setFormData({
      name: template.name,
      strength: template.strength,
      dexterity: template.dexterity,
      constitution: template.constitution,
      intelligence: template.intelligence,
      wisdom: template.wisdom,
      charisma: template.charisma,
      maxHp: template.maxHp,
      speed: template.speed,
      ac: template.ac,
      attacks: [...template.attacks],
    });
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
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
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
                    min={1}
                    max={30}
                    value={formData[ability as 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma']}
                    onChange={(e) => handleAbilityChange(ability, parseInt(e.target.value, 10) || 10)}
                    className="flex-1 px-2 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  />
                  <span className={`text-xs font-bold w-6 text-center rounded ${
                    modifiers[ability as keyof typeof modifiers] >= 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {modifiers[ability as keyof typeof modifiers] >= 0 ? '+' : ''}
                    {modifiers[ability as keyof typeof modifiers]}
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
                min={1}
                value={formData.ac}
                onChange={(e) => setFormData(prev => ({ ...prev, ac: parseInt(e.target.value, 10) || 10 }))}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                HP
              </label>
              <input
                type="number"
                min={1}
                value={formData.maxHp}
                onChange={(e) => setFormData(prev => ({ ...prev, maxHp: parseInt(e.target.value, 10) || 10 }))}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">
                速度（尺）
              </label>
              <input
                type="number"
                min={1}
                value={formData.speed}
                onChange={(e) => setFormData(prev => ({ ...prev, speed: parseInt(e.target.value, 10) || 30 }))}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
              攻击方式
            </label>
            {formData.attacks.length > 0 && (
              <div className="space-y-3 mb-3">
                {formData.attacks.map((attack, index) => (
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
                      <div>
                        <label className="dark:text-text-dark-muted light:text-text-light-muted">射程</label>
                        <input
                          type="text"
                          value={attack.range}
                          onChange={(e) => updateAttack(index, 'range', e.target.value)}
                          className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                          placeholder="5 尺"
                        />
                      </div>
                    </div>
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
                ))}
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
              disabled={!formData.name || isNaN(parseInt(d20Input, 10))}
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