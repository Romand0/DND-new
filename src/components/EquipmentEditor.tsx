import { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { EquipmentItem } from '@/types/equipment';

interface EquipmentEditorProps {
  item?: EquipmentItem | (EquipmentItem & { quantity?: number });
  /** 装备库全量数据（基础物品选择器数据源；未传时快速生成仅支持纯泛模板） */
  libraryEquipments?: EquipmentItem[];
  isStatic?: boolean;
  showQuantity?: boolean;
  showPackSize?: boolean;   // 新增：控制"单位 + 每份基准数"显示（装备库模板用）
  showSyncOption?: boolean;
  loading?: boolean;
  onSave: (item: EquipmentItem & { quantity?: number }, syncToLibrary?: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
}


const CATEGORIES = ['武器', '护甲', '药水', '法器', '工具', '法术材料', '卷轴', '杂物', '自定义'];
const PRICE_UNITS = ['gp', 'ep', 'sp', 'cp'] as const;
const PROPERTY_OPTIONS = ['轻型', '灵巧', '多功能', '重型', '双手', '远程', '弹药', '+2 AC', '单手', '双手'];
const DAMAGE_TYPES = ['穿刺', '钝击', '挥砍', '火焰', '冰冻', '闪电', '光', '黯蚀', '心灵', '毒素', '力场', '声波', '神力'];
const MAGIC_OPTIONS = ['非魔法物品', '魔法物品'] as const;
const TRADE_OPTIONS = ['冒险物品', '贵重物品'] as const;
const RARITY_OPTIONS = ['普通', '非普通', '珍稀', '极珍稀', '传说', '特殊', '多种稀有度'];

// DMG 2014 泛条目模板（+N 加值物品）：等级-稀有度映射按原书（护甲比武器高一档），同调按原书标注
const GENERIC_MAGIC_TEMPLATES = [
  {
    key: 'weapon', label: '武器', name: '武器', category: '武器', subtype: '任意',
    rarities: { 1: '非普通', 2: '珍稀', 3: '极珍稀' } as Record<number, string>,
    desc: (n: number) => `你在用此魔法武器发动的攻击检定和伤害掷骰获得 +${n} 加值。`,
  },
  {
    key: 'armor', label: '护甲', name: '护甲', category: '护甲', subtype: '轻甲、中甲、或重甲',
    rarities: { 1: '珍稀', 2: '极珍稀', 3: '传说' } as Record<number, string>,
    desc: (n: number) => `着装该护甲期间，你的 AC 获得 +${n} 加值。具体护甲类型与 AC 基础值请按所穿护甲填写。`,
  },
  {
    key: 'shield', label: '盾牌', name: '盾牌', category: '护甲', subtype: '盾牌',
    rarities: { 1: '非普通', 2: '珍稀', 3: '极珍稀' } as Record<number, string>,
    desc: (n: number) => `持握此盾牌期间，你的 AC 获得 +${n} 加值。这一 AC 加值会被算入盾牌正常情况下为你提供的 AC 值中。`,
  },
  {
    key: 'ammo', label: '弹药', name: '弹药', category: '武器', subtype: '任何弹药',
    rarities: { 1: '非普通', 2: '珍稀', 3: '极珍稀' } as Record<number, string>,
    desc: (n: number) => `你使用此魔法弹药发动攻击检定和伤害掷骰时获得 +${n} 加值。此弹药一旦击中目标即不再具有魔法效果。`,
  },
];

export default function EquipmentEditor({
  item, libraryEquipments, isStatic = false, showQuantity = false, showPackSize = false,
  showSyncOption = false, loading = false, onSave, onDelete, onClose
}: EquipmentEditorProps) {
const [formData, setFormData] = useState<
  Omit<EquipmentItem, 'isCustom'> & { quantity?: number } & { childId?: string }
>({
  id: '',
  childId: '',   // 新增：收装备实例的子ID
  name: '',
  category: '武器',
  subtype: '',
  weight: 0,
  price: { amount: 0, unit: 'gp' },
  damageDice: '',
  damageType: '',
  acBase: '',
  strengthReq: 0,
  stealthDisadvantage: false,
  description: '',
  properties: [],
  tags: [],
  source: '',
  magicCategory: '非魔法物品',
  tradeCategory: '冒险物品',
  rarity: '',
  attunement: false,
  attunePrereq: '',
  magicBonus: 0,
  charges: 0,
  chargeRegen: '',
  cursed: false,
  activation: '',
  quantity: showQuantity ? 1 : undefined,
  unit: '',
  packSize: undefined,  
});



  const [newProperty, setNewProperty] = useState('');
  const [newTagKey, setNewTagKey] = useState('');
  const [newTagValue, setNewTagValue] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [customProperty, setCustomProperty] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [syncToLibrary, setSyncToLibrary] = useState(false);
  // 快速生成：当前选中的泛模板 key（选等级后自动填充并清空）
  const [genMagicTpl, setGenMagicTpl] = useState<string | null>(null);
  const [genLevel, setGenLevel] = useState<number | null>(null);
  const [genBase, setGenBase] = useState<EquipmentItem | null>(null);
  const [baseSearch, setBaseSearch] = useState('');

  // 切模板时重置后续步骤（基础物品候选随模板类别变化）
  const selectGenTpl = (key: string | null) => {
    setGenMagicTpl(key);
    setGenLevel(null);
    setGenBase(null);
    setBaseSearch('');
  };

  // 基础物品候选：按模板类别过滤装备库（只列非魔法条目，魔法条目没有基础数据可照搬）
  const baseCandidates = useMemo(() => {
    if (!genMagicTpl || !libraryEquipments) return [];
    const nonMagic = (e: EquipmentItem) => e.magicCategory !== '魔法物品' && !e.rarity;
    switch (genMagicTpl) {
      case 'armor':
        return libraryEquipments.filter(e => e.category === '护甲' && e.subtype !== '盾牌' && nonMagic(e));
      case 'shield':
        return libraryEquipments.filter(e => e.category === '护甲' && e.subtype === '盾牌' && nonMagic(e));
      default: // weapon / ammo：武器类全部（弹药条目也在武器类下）
        return libraryEquipments.filter(e => e.category === '武器' && nonMagic(e));
    }
  }, [genMagicTpl, libraryEquipments]);

  const baseFiltered = useMemo(() => {
    if (!baseSearch.trim()) return baseCandidates;
    const q = baseSearch.trim();
    return baseCandidates.filter(e => e.name.includes(q) || (e.subtype ?? '').includes(q));
  }, [baseCandidates, baseSearch]);

  const applyGenericMagic = (tplKey: string, level: number, base?: EquipmentItem | null) => {
    const t = GENERIC_MAGIC_TEMPLATES.find(x => x.key === tplKey);
    if (!t) return;
    const magic = {
      magicCategory: '魔法物品' as const,
      magicBonus: level,
      rarity: t.rarities[level],
      attunement: true,
      attunePrereq: '',
      cursed: false,
    };
    if (base) {
      // 基础数据照搬 + 魔法叠加；新建时 id 置空由保存流程生成（避免 UPSERT 覆盖基础条目）
      setFormData({
        ...formData,
        id: item ? formData.id : '',
        childId: item ? formData.childId : '',
        name: `+${level} ${base.name}`,
        nameEn: '',
        category: base.category,
        subtype: base.subtype || t.subtype,
        weight: base.weight ?? 0,
        price: base.price ? { ...base.price } : { amount: 0, unit: 'gp' },
        damageDice: base.damageDice ?? '',
        damageType: base.damageType ?? '',
        acBase: base.acBase ?? '',
        strengthReq: base.strengthReq ?? 0,
        stealthDisadvantage: base.stealthDisadvantage ?? false,
        properties: base.properties ? [...base.properties] : [],
        description: t.desc(level),
        source: base.source || '城主指南 2014',
        ...magic,
      });
    } else {
      setFormData({
        ...formData,
        id: item ? formData.id : '',
        childId: item ? formData.childId : '',
        name: `+${level} ${t.name}`,
        nameEn: '',
        category: t.category,
        subtype: t.subtype,
        description: t.desc(level),
        ...magic,
      });
    }
    setGenMagicTpl(null);
    setGenLevel(null);
    setGenBase(null);
    setBaseSearch('');
  };

  useEffect(() => {
  if (item) {
    setFormData({
  id: item.id,
  childId: (item as any).childId || '',   // 透传 childId
  name: item.name,
  nameEn: item.nameEn ?? '',
  category: item.category,
  subtype: item.subtype || '',
  weight: item.weight,
  price: { ...item.price },
  damageDice: item.damageDice || '',
  damageType: item.damageType || '',
  acBase: item.acBase || '',
  strengthReq: item.strengthReq ?? 0,
  stealthDisadvantage: item.stealthDisadvantage ?? false,
  description: item.description,
  properties: item.properties || [],
  tags: [...(item.tags || [])],
  source: item.source || '',
  magicCategory: item.magicCategory ?? '非魔法物品',
  tradeCategory: item.tradeCategory ?? '冒险物品',
  // 魔法物品专属属性：编辑保存时不能丢
  rarity: item.rarity ?? '',
  attunement: item.attunement ?? false,
  attunePrereq: item.attunePrereq ?? '',
  magicBonus: item.magicBonus ?? 0,
  charges: item.charges ?? 0,
  chargeRegen: item.chargeRegen ?? '',
  cursed: item.cursed ?? false,
  activation: item.activation ?? '',
  quantity: (item as any).quantity ?? (item as any).packSize ?? 1,
  unit: (item as any).unit || '',
  packSize: (item as any).packSize,
  // 法术卷轴 / 材料身份字段：编辑保存时不能丢，否则物化后的装备无法关联法术
  scrollSpellId: (item as any).scrollSpellId,
  scrollSpellName: (item as any).scrollSpellName,
  scrollSpellLevel: (item as any).scrollSpellLevel,
  materialKey: (item as any).materialKey,
  materialName: (item as any).materialName,
  materialCostGp: (item as any).materialCostGp,
  materialConsumed: (item as any).materialConsumed,
});


    if (item.category && !CATEGORIES.includes(item.category)) {
      setCustomCategory(item.category);
    }
  } else {
    setFormData({
      id: '',
      name: '',
      category: '武器',
      subtype: '',
      weight: 0,
      price: { amount: 0, unit: 'gp' },
      damageDice: '',
      damageType: '',
      acBase: '',
      strengthReq: 0,
      stealthDisadvantage: false,
      description: '',
      properties: [],
      tags: [],
      source: '',
      magicCategory: '非魔法物品',
      tradeCategory: '冒险物品',
      rarity: '',
      attunement: false,
      attunePrereq: '',
      magicBonus: 0,
      charges: 0,
      chargeRegen: '',
      cursed: false,
      activation: '',
      quantity: showQuantity ? 1 : undefined,
    });
    setCustomCategory('');
  }
}, [item, showQuantity]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isCustom = !isStatic;
    const equipment: EquipmentItem & { quantity?: number } = {
      ...formData,
      id: formData.id || (isCustom ? `custom-${Date.now()}` : `static-${Date.now()}`),
      isCustom,
    };
    onSave(equipment, showSyncOption ? syncToLibrary : undefined);
  };

  const handleAddProperty = () => {
    const propToAdd = newProperty === '__custom__' ? customProperty.trim() : newProperty.trim();
    if (propToAdd && !formData.properties?.includes(propToAdd)) {
      setFormData({
        ...formData,
        properties: [...(formData.properties || []), propToAdd],
      });
      setNewProperty('');
      setCustomProperty('');
    }
  };

  const handleRemoveProperty = (prop: string) => {
    setFormData({
      ...formData,
      properties: formData.properties?.filter((p) => p !== prop),
    });
  };

  const handleAddTag = () => {
    if (newTagKey.trim() && newTagValue.trim()) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), { key: newTagKey.trim(), value: newTagValue.trim() }],
      });
      setNewTagKey('');
      setNewTagValue('');
    }
  };

  const handleRemoveTag = (index: number) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((_, i) => i !== index),
    });
  };

  const handleCategoryChange = (value: string) => {
    if (value === '自定义') {
      setFormData({ ...formData, category: customCategory || '自定义' });
    } else {
      setFormData({ ...formData, category: value });
    }
  };

  const getTitle = () => {
    if (item) {
      return '编辑装备';
    }
    if (isStatic) {
      return '新增标准装备';
    }
    return '新增自定义装备';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl border w-full max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
        <div className="sticky top-0 bg-inherit p-4 border-b dark:border-border-dark light:border-border-light flex items-center justify-between">
          <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            {getTitle()}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* 魔法物品属性：置顶优先区 —— 魔法判定与 +N 快速生成是最优先的操作 */}
          <div className="rounded-lg border p-3 space-y-3 dark:border-primary/40 light:border-primary/40">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold dark:text-text-dark light:text-text-light">魔法物品属性</div>
              <select
                value={formData.magicCategory}
                onChange={(e) => setFormData({ ...formData, magicCategory: e.target.value as any })}
                className="px-2 py-1.5 rounded-lg border bg-transparent text-sm outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              >
                {MAGIC_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {formData.magicCategory === '魔法物品' && (
              <>
                {/* 三步快速生成：模板定魔法属性，基础物品照搬战斗数据，等级定强度 */}
                <div className="space-y-2.5 rounded-md bg-primary/5 p-3">
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                    三步组合「+1 链甲」这类卡片：选模板 → 选等级 → 选基础物品（可选，照搬其分类/伤害/AC/价格），生成后在常规字段微调
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {GENERIC_MAGIC_TEMPLATES.map(t => (
                      <button key={t.key} type="button"
                        onClick={() => selectGenTpl(genMagicTpl === t.key ? null : t.key)}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          genMagicTpl === t.key
                            ? 'bg-primary text-white border-primary'
                            : 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:border-primary'
                        }`}>
                        ① {t.label} +N
                      </button>
                    ))}
                  </div>
                  {genMagicTpl && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">② 等级</span>
                      {[1, 2, 3].map(n => (
                        <button key={n} type="button"
                          onClick={() => setGenLevel(genLevel === n ? null : n)}
                          className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                            genLevel === n
                              ? 'bg-primary text-white border-primary'
                              : 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:border-primary'
                          }`}>
                          +{n}
                        </button>
                      ))}
                    </div>
                  )}
                  {genMagicTpl && genLevel && (
                    <div className="space-y-2">
                      <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                        ③ 基础物品（可选）：选中后照搬其战斗数据
                      </div>
                      {baseCandidates.length > 0 ? (
                        <>
                          <input
                            type="text"
                            value={baseSearch}
                            onChange={(e) => setBaseSearch(e.target.value)}
                            placeholder="搜索基础物品…"
                            className="w-full px-2 py-1.5 rounded border bg-transparent text-sm outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                          />
                          <div className="max-h-44 overflow-y-auto rounded border divide-y dark:border-border-dark dark:divide-border-dark/50 light:border-border-light light:divide-border-light/50">
                            {baseFiltered.map(e => (
                              <button key={e.id} type="button"
                                onClick={() => setGenBase(genBase?.id === e.id ? null : e)}
                                className={`w-full text-left px-2.5 py-2 text-sm transition-colors ${
                                  genBase?.id === e.id ? 'bg-primary/10 text-primary' : 'dark:text-text-dark light:text-text-light hover:bg-primary/5'
                                }`}>
                                <span className="font-medium">{e.name}</span>
                                {e.subtype && <span className="ml-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">{e.subtype}</span>}
                                {e.acBase && <span className="ml-2 text-xs text-amber-500">AC {e.acBase}</span>}
                                {e.damageDice && <span className="ml-2 text-xs text-amber-500">{e.damageDice}</span>}
                                {e.price?.amount > 0 && <span className="ml-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">{e.price.amount}{e.price.unit}</span>}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          装备库中没有可照搬的基础物品，直接生成纯泛模板（分类/子分类手动填）
                        </div>
                      )}
                      <button type="button"
                        onClick={() => applyGenericMagic(genMagicTpl, genLevel, genBase)}
                        className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors">
                        生成「+{genLevel} {genBase?.name ?? GENERIC_MAGIC_TEMPLATES.find(t => t.key === genMagicTpl)?.name}」
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                      稀有度
                    </label>
                    <input
                      type="text"
                      list="magic-rarity-options"
                      value={formData.rarity || ''}
                      onChange={(e) => setFormData({ ...formData, rarity: e.target.value })}
                      placeholder="如：珍稀 / 极珍稀或传说"
                      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                    <datalist id="magic-rarity-options">
                      {RARITY_OPTIONS.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                      激活方式
                    </label>
                    <input
                      type="text"
                      value={formData.activation || ''}
                      onChange={(e) => setFormData({ ...formData, activation: e.target.value })}
                      placeholder="如：命令词 / 用一个动作"
                      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex items-center gap-2 text-sm dark:text-text-dark light:text-text-light">
                    <input
                      type="checkbox"
                      checked={!!formData.attunement}
                      onChange={(e) => setFormData({ ...formData, attunement: e.target.checked })}
                      className="h-4 w-4"
                    />
                    需要同调
                  </label>
                  <label className="flex items-center gap-2 text-sm dark:text-text-dark light:text-text-light">
                    <input
                      type="checkbox"
                      checked={!!formData.cursed}
                      onChange={(e) => setFormData({ ...formData, cursed: e.target.checked })}
                      className="h-4 w-4"
                    />
                    被诅咒
                  </label>
                </div>
                {formData.attunement && (
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                      同调先决条件
                    </label>
                    <input
                      type="text"
                      value={formData.attunePrereq || ''}
                      onChange={(e) => setFormData({ ...formData, attunePrereq: e.target.value })}
                      placeholder="如：法师 / 施法者 / 善良阵营生物"
                      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                      魔法加值
                    </label>
                    <input
                      type="number"
                      value={formData.magicBonus ?? 0}
                      onChange={(e) => {
                        const n = parseInt(e.target.value);
                        setFormData({ ...formData, magicBonus: isNaN(n) ? 0 : n });
                      }}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                      初始充能
                    </label>
                    <input
                      type="number"
                      value={formData.charges ?? 0}
                      onChange={(e) => {
                        const n = parseInt(e.target.value);
                        setFormData({ ...formData, charges: isNaN(n) ? 0 : n });
                      }}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                </div>
                {typeof formData.charges === 'number' && formData.charges > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                      充能恢复规则
                    </label>
                    <input
                      type="text"
                      value={formData.chargeRegen || ''}
                      onChange={(e) => setFormData({ ...formData, chargeRegen: e.target.value })}
                      placeholder="如：每天黎明恢复1d3发已消耗的充能"
                      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
               <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              装备 ID
      {item && (item as any).id?.startsWith('temp-') && (
        <span className="ml-1 text-xs dark:text-text-dark-muted light:text-text-light-muted font-normal">
          （临时，保存后由模板 ID 替代）
        </span>
      )}
    </label>
    <input
      type="text"
      value={formData.id}
      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
      placeholder={item && (item as any).id?.startsWith('temp-') ? '保存后生成模板 ID' : '例如：longsword'}
      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
    />
  </div>
  <div>
    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
      实例 ID
    </label>
    {formData.childId ? (
      <div className="w-full px-3 py-2 rounded-lg border dark:bg-bg-dark/50 dark:border-border-dark/50 dark:text-text-dark-muted light:bg-bg-light/50 light:border-border-light/50 light:text-text-light-muted text-sm font-mono break-all">
        {formData.childId}
      </div>
    ) : item && (item as any).id?.startsWith('temp-') ? (
      <div className="w-full px-3 py-2 rounded-lg border dark:bg-bg-dark/50 dark:border-border-dark/50 dark:text-text-dark-muted light:bg-bg-light/50 light:border-border-light/50 light:text-text-light-muted text-sm">
        （临时，保存后生成：角色 ID + 随机后缀）
      </div>
    ) : item ? (
      <div className="w-full px-3 py-2 rounded-lg border dark:bg-bg-dark/50 dark:border-border-dark/50 dark:text-text-dark-muted light:bg-bg-light/50 light:border-border-light/50 light:text-text-light-muted text-sm">
        无子 ID（旧数据）
      </div>
    ) : (
      <div className="w-full px-3 py-2 rounded-lg border dark:bg-bg-dark/50 dark:border-border-dark/50 dark:text-text-dark-muted light:bg-bg-light/50 light:border-border-light/50 light:text-text-light-muted text-sm">
        （新建，保存后生成）
      </div>
    )}
    <p className="mt-0.5 text-xs dark:text-text-dark-muted light:text-text-light-muted">
      标识该装备在当前角色背包中的唯一实例，由"角色 ID + 随机后缀"构成。只读。
    </p>
  </div>
  <div>
    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
      名称 *
    </label>
    <input
      type="text"
      value={formData.name}
      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
      required
      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
    />
  </div>
          </div>

          {showQuantity && (
  <div>
    <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
      数量
    </label>
    <input
      type="number"
      value={formData.quantity ?? 1}
      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
      min="1"
      className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
    />
  </div>
)}

{showPackSize && (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
        单位
      </label>
      <input
        type="text"
        value={formData.unit || ''}
        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
        placeholder="如：发、小瓶、扁瓶"
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
        每份默认值
      </label>
      <input
        type="number"
        value={formData.packSize ?? ''}
        onChange={(e) => setFormData({ ...formData, packSize: e.target.value ? parseInt(e.target.value) : undefined })}
        min="1"
        placeholder="如 50（发/袋）"
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
      />
      <p className="mt-0.5 text-xs dark:text-text-dark-muted light:text-text-light-muted">
        选填
      </p>
    </div>
  </div>
)}




<div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                  分类
                </label>
                <select
                  value={CATEGORIES.includes(formData.category) ? formData.category : '自定义'}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                  子分类
                </label>
                <input
                  type="text"
                  value={formData.subtype}
                  onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                  placeholder="例如：简易武器"
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                  交易分类
                </label>
                <select
                  value={formData.tradeCategory}
                  onChange={(e) => setFormData({ ...formData, tradeCategory: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                >
                  {TRADE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>


          {formData.category === '自定义' || !CATEGORIES.includes(formData.category) ? (
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                自定义分类名称
              </label>
              <input
                type="text"
                value={customCategory}
                onChange={(e) => {
                  setCustomCategory(e.target.value);
                  setFormData({ ...formData, category: e.target.value || '自定义' });
                }}
                placeholder="输入自定义分类"
                className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                重量
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="any"
                  className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">磅</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
                价格
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={formData.price.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, price: { ...formData.price, amount: parseInt(e.target.value) || 0 } })
                  }
                  min="0"
                  className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <select
                  value={formData.price.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, price: { ...formData.price, unit: e.target.value as 'gp' | 'sp' | 'cp' } })
                  }
                  className="px-2 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                >
                  {PRICE_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          {/* 伤害（仅武器） */}
{formData.category === '武器' && (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
        伤害骰
      </label>
      <input
        type="text"
        value={formData.damageDice}
        onChange={(e) => setFormData({ ...formData, damageDice: e.target.value })}
        placeholder="例如：1d8"
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text:text-text-light focus:border-primary"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
        伤害类型
      </label>
      <select
        value={formData.damageType}
        onChange={(e) => setFormData({ ...formData, damageType: e.target.value })}
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
      >
        <option value="">选择伤害类型</option>
        {DAMAGE_TYPES.map((dt) => (
          <option key={dt} value={dt}>{dt}</option>
        ))}
      </select>
    </div>
  </div>
)}

         {/* 护甲属性（仅护甲） */}
{formData.category === '护甲' && (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
        AC 基础值
      </label>
      <input
        type="text"
        value={formData.acBase}
        onChange={(e) => setFormData({ ...formData, acBase: e.target.value })}
        placeholder="如 11、14、+2"
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
      />
    </div>
    
    <div>
      <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
        力量需求
      </label>
      <input
        type="number"
        min={0}
        value={formData.strengthReq}
        onChange={(e) => setFormData({ ...formData, strengthReq: parseInt(e.target.value) || 0 })}
        className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
      />
    </div>
    <div className="flex items-center gap-2 md:col-span-2">
      <input
        type="checkbox"
        id="stealthDisadvantage"
        checked={formData.stealthDisadvantage}
        onChange={(e) => setFormData({ ...formData, stealthDisadvantage: e.target.checked })}
        className="w-4 h-4 rounded border-border-dark accent-primary"
      />
      <label htmlFor="stealthDisadvantage" className="text-sm dark:text-text-dark light:text-text-light cursor-pointer">
        隐匿劣势
      </label>
    </div>
  </div>
)}

          
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              来源
            </label>
            <input
              type="text"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="例如：玩家手册"
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              描述
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              属性标签
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.properties?.map((prop) => (
                <span
                  key={prop}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary text-sm"
                >
                  {prop}
                  <button
                    type="button"
                    onClick={() => handleRemoveProperty(prop)}
                    className="hover:text-danger"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                value={newProperty}
                onChange={(e) => setNewProperty(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              >
                <option value="">选择属性或输入自定义</option>
                {PROPERTY_OPTIONS.filter((p) => !formData.properties?.includes(p)).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="__custom__">自定义...</option>
              </select>
              {newProperty === '__custom__' && (
                <input
                  type="text"
                  value={customProperty}
                  onChange={(e) => setCustomProperty(e.target.value)}
                  placeholder="输入自定义属性"
                  className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              )}
              <button
                type="button"
                onClick={handleAddProperty}
                className="px-3 py-2 rounded-lg bg-primary text-white"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
              自由标签
            </label>
            <div className="space-y-2 mb-2">
              {formData.tags?.map((tag, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg dark:bg-bg-dark light:bg-bg-light-2"
                >
                  <span className="text-sm dark:text-text-dark light:text-text-light">
                    {tag.key}: {tag.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(index)}
                    className="ml-auto p-1 rounded hover:bg-danger/20 text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagKey}
                onChange={(e) => setNewTagKey(e.target.value)}
                placeholder="标签名"
                className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
              <input
                type="text"
                value={newTagValue}
                onChange={(e) => setNewTagValue(e.target.value)}
                placeholder="标签值"
                className="flex-1 px-3 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-2 rounded-lg bg-primary text-white"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showSyncOption && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="syncToLibrary"
                checked={syncToLibrary}
                onChange={(e) => setSyncToLibrary(e.target.checked)}
                className="w-4 h-4 rounded border-border-dark accent-primary"
              />
              <label
                htmlFor="syncToLibrary"
                className="text-sm dark:text-text-dark light:text-text-light cursor-pointer"
              >
                同时更新到装备库（并同步到 D1 数据库）
              </label> 
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {item && onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 rounded-lg bg-danger/20 text-danger hover:bg-danger/30"
              >
                删除
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
              <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">
                确认删除
              </h3>
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
                确定要删除 "{item?.name}" 吗？此操作无法撤销。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    onDelete?.();
                    setShowDeleteConfirm(false);
                  }}
                  className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
