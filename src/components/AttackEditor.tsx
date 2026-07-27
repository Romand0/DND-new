import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Package } from 'lucide-react';
import type { Attack } from '@/types/character';
import type { Equipment, Character } from '@/types/character';
import { calcAttackBonus, formatAttackBonus } from '@/lib/attackBonus';

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
  character?: Character;
  onSave: (attack: Attack) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function AttackEditor({ attack, weapons = [], character, onSave, onDelete, onClose }: AttackEditorProps) {
  const [formData, setFormData] = useState<Omit<Attack, 'id'>>({
    name: attack?.name || '',
    attackBonus: attack?.attackBonus || '',
    damage: attack?.damage || '',
    damageType: attack?.damageType || '挥砍',
    range: attack?.range || '',
    properties: attack?.properties || [],
    subtype: attack?.subtype,
  });
  const [customDamageType, setCustomDamageType] = useState('');
  const [customProperty, setCustomProperty] = useState('');
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false);
  // 保留最近抓取的武器引用（含 subtype），用于攻击加值自动计算
  const [selectedWeapon, setSelectedWeapon] = useState<Equipment | null>(null);
  // 灵巧武器的属性选择；null 表示使用默认（较高者）
  const [finesseChoice, setFinesseChoice] = useState<'strength' | 'dexterity' | null>(null);
  // 用户是否手动编辑过 attackBonus（防止自动计算覆盖）
  const [hasManualEditedBonus, setHasManualEditedBonus] = useState(false);
  // 用户是否手动编辑过 damageBonus
  const [hasManualEditedDamageBonus, setHasManualEditedDamageBonus] = useState(false);

  // 自定义武器的分类：近战/远程（必须选择）
  const [weaponRangeType, setWeaponRangeType] = useState<'melee' | 'ranged' | ''>('');
  // 自定义武器的分类：简易/军用/空置
  const [weaponProfType, setWeaponProfType] = useState<'simple' | 'martial' | ''>('');
  // 原始武器 subtype（从装备抓取时如实展示用）
  const [originalSubtype, setOriginalSubtype] = useState<string>('');

  // 将 weaponRangeType + weaponProfType 合成为 subtype（仅自定义武器用）
  const buildSubtype = (range: string, prof: string): string => {
    if (!range) return '';
    const rangeLabel = range === 'ranged' ? '远程' : '近战';
    if (!prof) return rangeLabel;
    const profLabel = prof === 'simple' ? '简易' : '军用';
    return profLabel + rangeLabel;
  };

  // 解析武器子分类为 { range, prof } 两部分（仅自定义武器 UI 使用）
  // 已知装备库的 subtype 取值: '简易武器' | '军用武器' | '远程武器' | '近战武器' | 其他自定义
  const parseSubtypeForUI = (subtype: string): { range: 'melee' | 'ranged' | ''; prof: 'simple' | 'martial' | '' } => {
    if (!subtype) return { range: '', prof: '' };
    let range: 'melee' | 'ranged' | '' = '';
    let prof: 'simple' | 'martial' | '' = '';
    if (subtype.includes('远程')) range = 'ranged';
    else if (subtype.includes('近战')) range = 'melee';
    if (subtype.includes('简易')) prof = 'simple';
    else if (subtype.includes('军用')) prof = 'martial';
    return { range, prof };
  };

  // 攻击加值预览（基于当前武器属性 + 角色）
  // 自定义武器：必须选定 weaponRangeType 才计算；从装备抓取：直接计算
  const attackBonusPreview = useMemo(() => {
    if (!character) return null;
    const isFromEquipment = !!selectedWeapon;
    const subtype = formData.subtype || originalSubtype || buildSubtype(weaponRangeType, weaponProfType);
    // 自定义武器未选分类 → 不自动计算
    if (!isFromEquipment && !weaponRangeType) return null;
    const weapon = {
      name: formData.name,
      subtype,
      properties: formData.properties,
    };
    return calcAttackBonus(weapon, character, finesseChoice || undefined);
  }, [character, selectedWeapon, formData.name, formData.subtype, formData.properties, weaponRangeType, weaponProfType, finesseChoice, originalSubtype]);

  // 预览变化时同步 attackBonus 字段（仅在有 character 且用户未手动编辑时）
  useEffect(() => {
    if (attackBonusPreview && !hasManualEditedBonus) {
      setFormData((prev) => ({
        ...prev,
        attackBonus: formatAttackBonus(attackBonusPreview.bonus),
      }));
    }
  }, [attackBonusPreview, hasManualEditedBonus]);

  // 伤害骰拆解：基础伤害骰（如 1d4）+ 伤害加值（如 +2）
  // 解析形如 "1d8+3" / "1d8 +3" / "1d8" / "2d6-1"
  const parseDamage = (damage: string): { dice: string; bonus: number } => {
    if (!damage) return { dice: '', bonus: 0 };
    const match = damage.match(/^(\d+d\d+)\s*([+-]\s*\d+)?$/);
    if (!match) return { dice: damage, bonus: 0 };
    const dice = match[1];
    const bonus = match[2] ? parseInt(match[2].replace(/\s/g, ''), 10) : 0;
    return { dice, bonus };
  };

  const damageParts = useMemo(() => parseDamage(formData.damage), [formData.damage]);

  // 伤害加值预览：复用 attackBonusPreview 的属性判定（灵巧与攻击加值同步）
  const damageBonusPreview = useMemo(() => {
    if (!character || !attackBonusPreview) return 0;
    return attackBonusPreview.abilityMod;
  }, [character, attackBonusPreview]);

  // 伤害骰变化时同步 damage 字段（dice 优先保留原始值，bonus 由自动计算填入）
  useEffect(() => {
    if (damageBonusPreview !== 0 && !hasManualEditedDamageBonus && damageParts.dice) {
      const sign = damageBonusPreview >= 0 ? '+' : '';
      setFormData((prev) => ({
        ...prev,
        damage: damageParts.dice ? `${damageParts.dice}${sign}${damageBonusPreview}` : prev.damage,
      }));
    }
  }, [damageBonusPreview, hasManualEditedDamageBonus, damageParts.dice]);

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
    const result: Partial<Omit<Attack, 'id'>> & { subtype?: string } = {
      name: weapon.name,
      subtype: weapon.subtype,
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
    // 保留武器引用（含 subtype），用于攻击加值自动计算
    setSelectedWeapon(weapon);
    // 重置灵巧选择，使用默认（较高者）
    setFinesseChoice(null);
    // 重置手动编辑标记，允许自动计算覆盖
    setHasManualEditedBonus(false);
    setHasManualEditedDamageBonus(false);
    // 原始 subtype 如实保存（不拆分展示）
    setOriginalSubtype(parsed.subtype || '');
    // 自定义分类选择器清空（从装备抓取时不展示）
    setWeaponRangeType('');
    setWeaponProfType('');
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

          {/* 武器分类：从装备抓取时如实展示；自定义武器时拆分选择 */}
          {selectedWeapon ? (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                武器分类
              </label>
              <div className="px-3 py-2 rounded-lg border bg-transparent dark:border-border-dark light:border-border-light">
                <span className="text-sm dark:text-text-dark light:text-text-light">
                  {originalSubtype || '未分类'}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                  攻击距离 <span className="text-danger">*</span>
                </label>
                <select
                  value={weaponRangeType}
                  onChange={(e) => {
                    const val = e.target.value as 'melee' | 'ranged' | '';
                    setWeaponRangeType(val);
                    setHasManualEditedBonus(false);
                    setHasManualEditedDamageBonus(false);
                    // 同步更新 formData.subtype
                    const newSubtype = buildSubtype(val, weaponProfType);
                    setFormData((prev) => ({ ...prev, subtype: newSubtype || undefined }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                >
                  <option value="">请选择</option>
                  <option value="melee">近战</option>
                  <option value="ranged">远程</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                  武器类别
                </label>
                <select
                  value={weaponProfType}
                  onChange={(e) => {
                    const val = e.target.value as 'simple' | 'martial' | '';
                    setWeaponProfType(val);
                    setHasManualEditedBonus(false);
                    setHasManualEditedDamageBonus(false);
                    const newSubtype = buildSubtype(weaponRangeType, val);
                    setFormData((prev) => ({ ...prev, subtype: newSubtype || undefined }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                >
                  <option value="">空置</option>
                  <option value="simple">简易</option>
                  <option value="martial">军用</option>
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                攻击加值
              </label>
              <input
                type="text"
                value={formData.attackBonus}
                onChange={(e) => {
                  setHasManualEditedBonus(true);
                  setFormData({ ...formData, attackBonus: e.target.value });
                }}
                placeholder="+5"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
              {/* 攻击加值自动计算提示 */}
              {attackBonusPreview && (
                <div className="mt-1.5 space-y-1">
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                    {attackBonusPreview.breakdown}
                    {!attackBonusPreview.isProficient && (
                      <span className="ml-1 text-warning">（不熟练）</span>
                    )}
                  </div>
                  {/* 灵巧武器属性选择 */}
                  {attackBonusPreview.isFinesse && (
                    <div className="flex items-center gap-1">
                      {(['strength', 'dexterity'] as const).map((ab) => {
                        const mod = ab === 'strength'
                          ? character?.abilities?.strength?.modifier ?? 0
                          : character?.abilities?.dexterity?.modifier ?? 0;
                        const active = (finesseChoice || attackBonusPreview.defaultFinesseChoice) === ab;
                        return (
                          <button
                            key={ab}
                            type="button"
                            onClick={() => {
                              setFinesseChoice(ab);
                              // 灵巧切换需要重算伤害加值
                              setHasManualEditedDamageBonus(false);
                            }}
                            className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                              active
                                ? 'bg-primary/10 text-primary border-primary/40'
                                : 'dark:border-border-dark dark:text-text-dark-muted light:border-border-light light:text-text-light-muted hover:border-primary/40'
                            }`}
                          >
                            {ab === 'strength' ? '力量' : '敏捷'} ({mod >= 0 ? `+${mod}` : mod})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                伤害骰
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={damageParts.dice}
                  onChange={(e) => {
                    const newDice = e.target.value;
                    const sign = damageParts.bonus >= 0 ? '+' : '';
                    const newDamage = newDice
                      ? (damageParts.bonus !== 0 ? `${newDice}${sign}${damageParts.bonus}` : newDice)
                      : formData.damage;
                    setFormData({ ...formData, damage: newDamage });
                  }}
                  placeholder="1d8"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">+</span>
                <input
                  type="text"
                  value={damageParts.bonus !== 0 ? (damageParts.bonus >= 0 ? `${damageParts.bonus}` : `${damageParts.bonus}`) : ''}
                  onChange={(e) => {
                    setHasManualEditedDamageBonus(true);
                    const v = e.target.value;
                    const num = v === '' ? 0 : parseInt(v, 10);
                    if (isNaN(num) && v !== '' && v !== '-') return;
                    const sign = num >= 0 ? '+' : '';
                    const newDamage = damageParts.dice
                      ? (num !== 0 ? `${damageParts.dice}${sign}${num}` : damageParts.dice)
                      : '';
                    setFormData({ ...formData, damage: newDamage });
                  }}
                  placeholder="0"
                  className="w-16 px-2 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
              {damageBonusPreview !== 0 && (
                <div className="mt-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {attackBonusPreview?.abilityKey === 'strength' ? '力量' : '敏捷'}调整 {damageBonusPreview >= 0 ? `+${damageBonusPreview}` : damageBonusPreview}
                </div>
              )}
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
