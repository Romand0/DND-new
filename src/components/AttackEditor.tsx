import { useState } from 'react';
import { X, Plus, Trash2, Package } from 'lucide-react';
import type { Attack } from '@/types/character';
import type { Equipment } from '@/types/character';

const DAMAGE_TYPES = [
  '挥砍', '穿刺', '钝击', '火焰', '冰冻', '闪电',
  '毒素', '雷鸣', '心灵', '光耀', '暗蚀', '力场'
];

const WEAPON_PROPERTIES = [
  '灵巧', '轻型', '重型', '双手', '远程', '弹药', '掷射', '法术', '法器'
];

interface AttackEditorProps {
  attack?: Attack;
  weapons?: Equipment[];
  onSave: (attack: Attack) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function AttackEditor({ attack, weapons = [], onSave, onDelete, onClose }: AttackEditorProps) {
  const [formData, setFormData] = useState<Omit<Attack, 'id'>>({
    name: attack?.name || '',
    attackBonus: attack?.attackBonus || '',
    damage: attack?.damage || '',
    damageType: attack?.damageType || '挥砍',
    range: attack?.range || '',
    properties: attack?.properties || [],
  });
  const [customDamageType, setCustomDamageType] = useState('');
  const [customProperty, setCustomProperty] = useState('');
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: attack?.id,
      ...formData,
    });
  };

  const toggleProperty = (prop: string) => {
    setFormData((prev) => ({
      ...prev,
      properties: prev.properties.includes(prop)
        ? prev.properties.filter((p) => p !== prop)
        : [...prev.properties, prop],
    }));
  };

  const addCustomProperty = () => {
    if (customProperty.trim() && !formData.properties.includes(customProperty.trim())) {
      setFormData((prev) => ({
        ...prev,
        properties: [...prev.properties, customProperty.trim()],
      }));
      setCustomProperty('');
    }
  };

  const parseWeaponData = (weapon: Equipment) => {
    const result: Partial<Omit<Attack, 'id'>> = {
      name: weapon.name,
      properties: [],
      damage: '',
      damageType: '挥砍',
      range: '5 尺',
      attackBonus: '',
    };

    if (weapon.properties && weapon.properties.length > 0) {
      const weaponProps: string[] = [];
      for (const prop of weapon.properties) {
        const rangeMatch = prop.match(/^(\d+\/\d+)尺$/);
        if (rangeMatch) {
          result.range = `${rangeMatch[1]} 尺`;
          weaponProps.push('远程');
          continue;
        }
        if (['灵巧', '轻型', '重型', '双手', '远程', '弹药', '掷射', '法术', '法器', '多功能'].includes(prop)) {
          weaponProps.push(prop);
          continue;
        }
        if (prop.includes('单手') || prop.includes('双手')) {
          if (prop.includes('双手') && !weaponProps.includes('双手')) {
            weaponProps.push('双手');
          }
          continue;
        }
      }
      result.properties = weaponProps;
    }

    if (weapon.description) {
      const desc = weapon.description;
      
      const damageMatch = desc.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*点(\S+?)伤害/);
      if (damageMatch) {
        result.damage = damageMatch[1].replace(/\s/g, '');
        const dmgType = damageMatch[2];
        const typeMap: Record<string, string> = {
          '挥砍': '挥砍',
          '穿刺': '穿刺',
          '钝击': '钝击',
          '火焰': '火焰',
          '冰冻': '冰冻',
          '闪电': '闪电',
          '毒素': '毒素',
          '雷鸣': '雷鸣',
          '心灵': '心灵',
          '光耀': '光耀',
          '暗蚀': '暗蚀',
          '力场': '力场',
        };
        result.damageType = typeMap[dmgType] || dmgType;
      }

      const rangeDescMatch = desc.match(/普通射程\s*(\d+)\s*尺[^0-9]*(\d+)\s*尺/);
      if (rangeDescMatch) {
        result.range = `${rangeDescMatch[1]}/${rangeDescMatch[2]} 尺`;
      }
    }

    if (weapon.tags && weapon.tags.length > 0) {
      for (const tag of weapon.tags) {
        if (tag.key === 'damage' && tag.value) {
          result.damage = tag.value;
        }
        if (tag.key === 'damageType' && tag.value) {
          result.damageType = tag.value;
        }
        if (tag.key === 'range' && tag.value) {
          result.range = tag.value;
        }
      }
    }

    return result;
  };

  const handleSelectWeapon = (weapon: Equipment) => {
    const parsed = parseWeaponData(weapon);
    setFormData((prev) => ({
      ...prev,
      ...parsed,
    }));
    setWeaponPickerOpen(false);
  };

  const isCustomDamageType = !DAMAGE_TYPES.includes(formData.damageType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b dark:border-border-dark light:border-border-light">
          <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            {attack ? '编辑攻击' : '新增攻击'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {weapons.length > 0 && (
            <button
              type="button"
              onClick={() => setWeaponPickerOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg border border-primary text-primary hover:bg-primary/10 transition-colors"
            >
              <Package className="w-4 h-4" />
              从装备中抓取
            </button>
          )}

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              攻击名称
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="长剑"
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                攻击加值
              </label>
              <input
                type="text"
                value={formData.attackBonus}
                onChange={(e) => setFormData({ ...formData, attackBonus: e.target.value })}
                placeholder="+5"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                伤害骰
              </label>
              <input
                type="text"
                value={formData.damage}
                onChange={(e) => setFormData({ ...formData, damage: e.target.value })}
                placeholder="1d8+3"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                伤害类型
              </label>
              <select
                value={isCustomDamageType ? '__custom__' : formData.damageType}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomDamageType(formData.damageType);
                  } else {
                    setFormData({ ...formData, damageType: e.target.value });
                    setCustomDamageType('');
                  }
                }}
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              >
                {DAMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                <option value="__custom__">自定义...</option>
              </select>
              {isCustomDamageType && (
                <input
                  type="text"
                  value={customDamageType}
                  onChange={(e) => {
                    setCustomDamageType(e.target.value);
                    setFormData({ ...formData, damageType: e.target.value });
                  }}
                  placeholder="自定义伤害类型"
                  className="w-full mt-2 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                射程
              </label>
              <input
                type="text"
                value={formData.range}
                onChange={(e) => setFormData({ ...formData, range: e.target.value })}
                placeholder="5 尺"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              武器属性
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {WEAPON_PROPERTIES.map((prop) => {
                const active = formData.properties.includes(prop);
                return (
                  <button
                    key={prop}
                    type="button"
                    onClick={() => toggleProperty(prop)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted hover:border-primary hover:text-primary'
                    }`}
                  >
                    {prop}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customProperty}
                onChange={(e) => setCustomProperty(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomProperty();
                  }
                }}
                placeholder="自定义属性"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
              <button
                type="button"
                onClick={addCustomProperty}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {formData.properties.filter((p) => !WEAPON_PROPERTIES.includes(p)).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.properties
                  .filter((p) => !WEAPON_PROPERTIES.includes(p))
                  .map((prop) => (
                    <span
                      key={prop}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent/10 text-accent"
                    >
                      {prop}
                      <button
                        type="button"
                        onClick={() => toggleProperty(prop)}
                        className="hover:text-accent-dark"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2 rounded-lg text-danger border border-danger hover:bg-danger/10"
              >
                删除
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark"
            >
              保存
            </button>
          </div>
        </form>
      </div>

      {weaponPickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setWeaponPickerOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b dark:border-border-dark light:border-border-light">
              <h3 className="font-bold dark:text-text-dark light:text-text-light">选择武器</h3>
              <button
                onClick={() => setWeaponPickerOpen(false)}
                className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {weapons.length === 0 ? (
                <div className="text-center py-8 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  没有武器类装备
                </div>
              ) : (
                weapons.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleSelectWeapon(w)}
                    className="w-full text-left p-3 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light transition-colors"
                  >
                    <div className="font-medium text-sm">{w.name}</div>
                    <div className="text-xs mt-1 dark:text-text-dark-muted light:text-text-light-muted">
                      {w.category || '—'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
