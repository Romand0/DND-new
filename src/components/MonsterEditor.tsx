import { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2, GripVertical } from 'lucide-react';
import type { NpcTemplate, NpcAttack } from '@/types/combat';
import npcTemplateStore from '@/data/npcTemplateStore';

interface MonsterEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (template: NpcTemplate) => void;
  initialTemplate?: NpcTemplate | null;
}

export default function MonsterEditor({ isOpen, onClose, onSave, initialTemplate }: MonsterEditorProps) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [cr, setCr] = useState<string | undefined>(undefined);
  const [size, setSize] = useState('');
  const [type, setType] = useState('');
  const [alignment, setAlignment] = useState('');
  const [features, setFeatures] = useState('');
  const [senses, setSenses] = useState('');
  const [languages, setLanguages] = useState('');
  const [source, setSource] = useState('');
  const [strength, setStrength] = useState('10');
  const [dexterity, setDexterity] = useState('10');
  const [constitution, setConstitution] = useState('10');
  const [intelligence, setIntelligence] = useState('10');
  const [wisdom, setWisdom] = useState('10');
  const [charisma, setCharisma] = useState('10');
  const [maxHp, setMaxHp] = useState('10');
  const [ac, setAc] = useState('10');
  const [speed, setSpeed] = useState('30');
  const [attacks, setAttacks] = useState<NpcAttack[]>([]);

  // 重置表单
  useEffect(() => {
    if (!isOpen) return;
    if (initialTemplate) {
      setName(initialTemplate.name);
      setTemplateId(initialTemplate.templateId);
      setCr(initialTemplate.cr ? parseFloat(initialTemplate.cr) : undefined);
      setSize(initialTemplate.size || '');
      setType(initialTemplate.type || '');
      setAlignment(initialTemplate.alignment || '');
      setFeatures(initialTemplate.features || '');
      setSenses(initialTemplate.senses || '');
      setLanguages(initialTemplate.languages || '');
      setSource(initialTemplate.source || '');
      setStrength(String(initialTemplate.strength));
      setDexterity(String(initialTemplate.dexterity));
      setConstitution(String(initialTemplate.constitution));
      setIntelligence(String(initialTemplate.intelligence));
      setWisdom(String(initialTemplate.wisdom));
      setCharisma(String(initialTemplate.charisma));
      setMaxHp(String(initialTemplate.maxHp));
      setAc(String(initialTemplate.ac));
      setSpeed(String(initialTemplate.speed));
      setAttacks([...initialTemplate.attacks]);
    } else {
      resetForm();
    }
  }, [isOpen, initialTemplate]);

  const resetForm = () => {
    setName('');
    setTemplateId('');
    setCr(undefined);
    setSize('');
    setType('');
    setAlignment('');
    setFeatures('');
    setSenses('');
    setLanguages('');
    setSource('');
    setStrength('10');
    setDexterity('10');
    setConstitution('10');
    setIntelligence('10');
    setWisdom('10');
    setCharisma('10');
    setMaxHp('10');
    setAc('10');
    setSpeed('30');
    setAttacks([]);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('请输入名称');
      return;
    }
    if (!templateId.trim()) {
      alert('请输入模板 ID');
      return;
    }

    const template: NpcTemplate = {
      id: initialTemplate?.id || crypto.randomUUID(),
      templateId: templateId.trim(),
      name: name.trim(),
      strength: parseInt(strength, 10) || 10,
      dexterity: parseInt(dexterity, 10) || 10,
      constitution: parseInt(constitution, 10) || 10,
      intelligence: parseInt(intelligence, 10) || 10,
      wisdom: parseInt(wisdom, 10) || 10,
      charisma: parseInt(charisma, 10) || 10,
      maxHp: parseInt(maxHp, 10) || 10,
      speed: parseInt(speed, 10) || 30,
      ac: parseInt(ac, 10) || 10,
      attacks,
      createdAt: initialTemplate?.createdAt || Date.now(),
      updatedAt: Date.now(),
      cr: cr || '',
      size,
      type,
      alignment,
      features,
      senses,
      languages,
      source,
    };

    onSave(template);
    onClose();
  };

  const handleAddAttack = () => {
    setAttacks([...attacks, {
      name: '',
      attackBonus: '',
      damage: '',
      damageType: '挥砍',
      range: '5 尺',
      properties: [],
    }]);
  };

  const handleUpdateAttack = (index: number, field: keyof NpcAttack, value: any) => {
    const newAttacks = [...attacks];
    newAttacks[index] = { ...newAttacks[index], [field]: value };
    setAttacks(newAttacks);
  };

  const handleRemoveAttack = (index: number) => {
    setAttacks(attacks.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl p-4 dark:bg-bg-card dark:border-border-card light:bg-bg-card light:border-border-card shadow-2xl overflow-y-auto">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            {initialTemplate ? '编辑怪物模板' : '新建怪物模板'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 基本信息 */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:哥布林"
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">模板 ID *</label>
            <input
              type="text"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="如:goblin"
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">挑战等级 (CR)</label>
              <input
                type="number"
                step="0.25"
                value={cr ?? ''}
                onChange={(e) => setCr(e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="0, 0.25, 1, 5..."
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">尺寸</label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="如:中型"
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">种类</label>
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="如:类人生物"
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">阵营</label>
              <input
                type="text"
                value={alignment}
                onChange={(e) => setAlignment(e.target.value)}
                placeholder="如:混乱邪恶"
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">来源</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="如:MM, VGtM, 自定义"
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
            />
          </div>
        </div>

        {/* 属性值 */}
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">属性值</h4>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'strength', label: '力量', value: strength, onChange: setStrength },
              { key: 'dexterity', label: '敏捷', value: dexterity, onChange: setDexterity },
              { key: 'constitution', label: '体质', value: constitution, onChange: setConstitution },
              { key: 'intelligence', label: '智力', value: intelligence, onChange: setIntelligence },
              { key: 'wisdom', label: '感知', value: wisdom, onChange: setWisdom },
              { key: 'charisma', label: '魅力', value: charisma, onChange: setCharisma },
            ].map(({ key, label, value, onChange }) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 战斗属性 */}
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">战斗属性</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">HP</label>
              <input
                type="number"
                value={maxHp}
                onChange={(e) => setMaxHp(e.target.value)}
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">AC</label>
              <input
                type="number"
                value={ac}
                onChange={(e) => setAc(e.target.value)}
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">速度 (尺)</label>
              <input
                type="number"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* 攻击列表 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium dark:text-text-dark light:text-text-light">攻击方式</h4>
            <button
              onClick={handleAddAttack}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              添加
            </button>
          </div>
          {attacks.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground dark:text-text-dark-muted light:text-text-light-muted">
              暂无攻击方式
            </div>
          ) : (
            <div className="space-y-2">
              {attacks.map((attack, index) => (
                <div key={index} className="p-3 rounded-lg border dark:border-border-dark light:border-border-light bg-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={attack.name}
                      onChange={(e) => handleUpdateAttack(index, 'name', e.target.value)}
                      placeholder="攻击名称"
                      className="flex-1 px-2 py-1 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm"
                    />
                    <button
                      onClick={() => handleRemoveAttack(index)}
                      className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="text"
                      value={attack.attackBonus}
                      onChange={(e) => handleUpdateAttack(index, 'attackBonus', e.target.value)}
                      placeholder="攻击加值"
                      className="px-2 py-1 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                    />
                    <input
                      type="text"
                      value={attack.damage}
                      onChange={(e) => handleUpdateAttack(index, 'damage', e.target.value)}
                      placeholder="伤害"
                      className="px-2 py-1 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                    />
                    <input
                      type="text"
                      value={attack.damageType}
                      onChange={(e) => handleUpdateAttack(index, 'damageType', e.target.value)}
                      placeholder="伤害类型"
                      className="px-2 py-1 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                    />
                    <input
                      type="text"
                      value={attack.range}
                      onChange={(e) => handleUpdateAttack(index, 'range', e.target.value)}
                      placeholder="射程"
                      className="px-2 py-1 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 其他信息 */}
        <div className="mb-4">
          <h4 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">其他信息</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">特性</label>
              <textarea
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                placeholder="如:黑暗视觉 60 尺,被动感知 10"
                rows={2}
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">感官</label>
              <textarea
                value={senses}
                onChange={(e) => setSenses(e.target.value)}
                placeholder="如:黑暗视觉 60 尺,被动感知 10"
                rows={2}
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm resize-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">语言</label>
              <input
                type="text"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                placeholder="如:通用语,地精语"
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 dark:text-text-dark-muted light:text-text-light-muted">豁免加值</label>
              <input
                type="text"
                value={JSON.stringify({})}
                disabled
                placeholder="暂未实现"
                className="w-full px-2 py-1.5 rounded border dark:border-border-dark dark:bg-bg-dark light:border-border-light light:bg-bg-light dark:text-text-dark light:text-text-light focus:border-primary outline-none text-sm opacity-60"
              />
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 pt-4 border-t dark:border-border-dark light:border-border-light">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
