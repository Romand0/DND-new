import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { EquipmentItem } from '@/types/equipment';

interface EquipmentEditorProps {
  item?: EquipmentItem | (EquipmentItem & { quantity?: number });
  isStatic?: boolean;
  showQuantity?: boolean;
  showPackSize?: boolean;   // 新增：控制"单位 + 每份基准数"显示（装备库模板用）
  showSyncOption?: boolean;
  loading?: boolean;
  onSave: (item: EquipmentItem & { quantity?: number }, syncToLibrary?: boolean) => void;
  onDelete?: () => void;
  onClose: () => void;
}


const CATEGORIES = ['武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];
const PRICE_UNITS = ['gp', 'sp', 'cp'] as const;
const PROPERTY_OPTIONS = ['轻型', '灵巧', '多功能', '重型', '双手', '远程', '弹药', '+2 AC', '单手', '双手'];
const DAMAGE_TYPES = ['穿刺', '钝击', '挥砍', '火焰', '冰冻', '闪电', '光', '黯蚀', '心灵', '毒素', '力场', '声波', '神力'];

export default function EquipmentEditor({
  item, isStatic = false, showQuantity = false, showPackSize = false,
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

  useEffect(() => {
  if (item) {
    setFormData({
  id: item.id,
  childId: (item as any).childId || '',   // 透传 childId
  name: item.name,
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
  quantity: (item as any).quantity ?? (item as any).packSize ?? 1,
  unit: (item as any).unit || '',
  packSize: (item as any).packSize,
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
