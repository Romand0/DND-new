// 宝藏编辑页
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Save, Package, Edit3 } from 'lucide-react';
import treasureStore from '@/data/treasureStore';
import { extractBaseFields } from '@/data/equipmentFactory';
import EquipmentPicker from '@/components/EquipmentPicker';
import type { Treasure, TreasureItem, TreasurePriceUnit, TreasureCurrency } from '@/types/treasure';
import type { EquipmentItem } from '@/types/equipment';

const PRICE_UNITS: TreasurePriceUnit[] = ['pp', 'gp', 'ep', 'sp', 'cp'];

export default function TreasureEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<TreasureCurrency>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [experience, setExperience] = useState(0);
  const [showEquipPicker, setShowEquipPicker] = useState(false);
  // 自定义物品表单状态
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customCategory, setCustomCategory] = useState('杂物');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [customUnitPrice, setCustomUnitPrice] = useState('');
  const [customUnitPriceUnit, setCustomUnitPriceUnit] = useState<TreasurePriceUnit>('cp');
  const [customWeight, setCustomWeight] = useState<number | undefined>(undefined);
  // 物品编辑状态
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // 加载已有宝藏
  useEffect(() => {
    if (!id) return;
    const t = treasureStore.get(id);
    if (!t) {
      navigate('/inventory/treasures');
      return;
    }
    setTitle(t.title);
    setCurrency({ ...t.currency });
    setItems(t.items.map(it => ({ ...it })));
    setExperience(t.experience ?? 0);
  }, [id, navigate]);

  const handleSave = () => {
    if (isNew) {
      const t = treasureStore.create(title);
      treasureStore.update(t.id, { currency, items, experience });
      navigate('/inventory/treasures');
    } else if (id) {
      treasureStore.update(id, { title, currency, items, experience });
      navigate('/inventory/treasures');
    }
  };

  const addEquipment = (item: EquipmentItem) => {
    const newItem: TreasureItem = {
      id: crypto.randomUUID(),
      name: item.name,
      quantity: 1,
      unitPrice: undefined,
      category: item.category,
      subCategory: item.subtype || undefined,
      weight: item.weight,
      equipmentSnapshot: { id: item.id, quantity: 1, ...extractBaseFields(item) },
    };
    setItems(prev => [...prev, newItem]);
    setShowEquipPicker(false);
  };

  const addCustomItem = () => {
    if (!customName.trim()) return;
    const newItem: TreasureItem = {
      id: crypto.randomUUID(),
      name: customName.trim(),
      quantity: Math.max(1, customQty),
      category: customCategory || '杂物',
      subCategory: customSubCategory.trim() || undefined,
      unitPrice: customUnitPrice
        ? { amount: parseFloat(customUnitPrice) || 0, unit: customUnitPriceUnit }
        : undefined,
      weight: customWeight,
    };
    setItems(prev => [...prev, newItem]);
    // 重置表单
    setCustomName('');
    setCustomQty(1);
    setCustomCategory('杂物');
    setCustomSubCategory('');
    setCustomUnitPrice('');
    setCustomUnitPriceUnit('cp');
    setCustomWeight(undefined);
    setShowCustomForm(false);
  };

  const updateItemField = (itemId: string, field: keyof TreasureItem, value: unknown) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, [field]: value } : it));
  };

  const removeItem = (itemId: string) => {
    setItems(prev => prev.filter(it => it.id !== itemId));
  };

  const updateItemQty = (itemId: string, qty: number) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, quantity: Math.max(1, qty) } : it));
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory/treasures')}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
          {isNew ? '创建宝藏' : '编辑宝藏'}
        </h1>
        <button
          onClick={handleSave}
          className="ml-auto px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          保存
        </button>
      </div>

      {/* 标题 */}
      <div>
        <label className="block text-sm font-medium dark:text-text-dark light:text-text-light mb-1.5">
          标题
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="输入宝藏名称..."
          className="w-full px-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
        />
      </div>

      {/* 钱币 */}
      <div>
        <label className="block text-sm font-medium dark:text-text-dark light:text-text-light mb-1.5">
          钱币
        </label>
        <div className="grid grid-cols-4 gap-2">
          {(['pp', 'gp', 'sp', 'cp'] as const).map(type => (
            <div key={type} className="flex items-center gap-2">
              <span className="text-xs font-medium dark:text-text-dark light:text-text-light w-6">{type}</span>
              <input
                type="number"
                min={0}
                value={currency[type]}
                onChange={e => setCurrency(prev => ({ ...prev, [type]: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="w-full px-2 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 经验值 */}
      <div>
        <label className="block text-sm font-medium dark:text-text-dark light:text-text-light mb-1.5">
          经验值
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={experience}
            onChange={e => setExperience(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
          />
        </div>
      </div>

      {/* 物品列表 */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
            物品 ({items.length})
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEquipPicker(true)}
              className="px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors flex items-center gap-1"
            >
              <Package className="w-3.5 h-3.5" />
              从装备库添加
            </button>
          </div>
        </div>

        {/* 自定义物品添加 */}
        <div className="mb-3">
          {!showCustomForm ? (
            <button
              onClick={() => setShowCustomForm(true)}
              className="w-full py-2 rounded-lg border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted text-sm hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="w-4 h-4 inline mr-1" />
              添加自定义物品
            </button>
          ) : (
            <div className="space-y-2 p-3 rounded-lg border dark:border-border-dark light:border-border-light">
              {/* 名称 + 数量 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="物品名称 *"
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
                <input
                  type="number"
                  min={1}
                  value={customQty}
                  onChange={e => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 shrink-0 px-2 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
              {/* 分类 + 子分类 */}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  className="sm:flex-1 px-3 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                >
                  <option value="武器">武器</option>
                  <option value="护甲">护甲</option>
                  <option value="法器">法器</option>
                  <option value="工具">工具</option>
                  <option value="药水">药水</option>
                  <option value="杂物">杂物</option>
                </select>
                <input
                  type="text"
                  value={customSubCategory}
                  onChange={e => setCustomSubCategory(e.target.value)}
                  placeholder="子分类（可选）"
                  className="sm:flex-1 px-3 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
              {/* 单价 + 重量 */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="sm:flex-1 flex items-center gap-1 min-w-0">
                  <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">单价</span>
                  <input
                    type="number"
                    min={0}
                    value={customUnitPrice}
                    onChange={e => setCustomUnitPrice(e.target.value)}
                    placeholder="金额"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  />
                  <select
                    value={customUnitPriceUnit}
                    onChange={e => setCustomUnitPriceUnit(e.target.value as TreasurePriceUnit)}
                    className="shrink-0 px-1.5 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                  >
                    {PRICE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <WeightInput
                  initial={customWeight}
                  onCommit={w => setCustomWeight(w)}
                />
              </div>
              {/* 按钮 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="flex-1 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={addCustomItem}
                  disabled={!customName.trim()}
                  className="flex-1 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
                >
                  添加
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 物品卡片 */}
        {items.length === 0 ? (
          <div className="text-center py-6 text-sm dark:text-text-dark-muted light:text-text-light-muted border border-dashed rounded-lg dark:border-border-dark light:border-border-light">
            暂无物品
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(it => {
              const isEditing = editingItemId === it.id;
              return (
                <div
                  key={it.id}
                  className="rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden"
                >
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium dark:text-text-dark light:text-text-light flex items-center gap-1.5">
                        <span className="truncate">{it.name}</span>
                        {it.equipmentSnapshot && (
                          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
                            (装备库)
                          </span>
                        )}
                      </div>
                      <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5 flex flex-wrap gap-x-2">
                        {it.category && <span>{it.category}</span>}
                        {it.subCategory && <span>· {it.subCategory}</span>}
                        {it.unitPrice !== undefined && <span>· {it.unitPrice.amount}{it.unitPrice.unit}</span>}
                        {it.weight !== undefined && <span>· {it.weight}lb</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">x</span>
                      <input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={e => updateItemQty(it.id, parseInt(e.target.value) || 1)}
                        className="w-14 px-1 py-0.5 rounded border bg-transparent outline-none text-sm text-center dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                      />
                    </div>
                    <button
                      onClick={() => setEditingItemId(it.id)}
                      className="p-1.5 rounded hover:bg-accent/10 text-accent transition-colors shrink-0"
                      title="编辑属性"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeItem(it.id)}
                      className="p-1.5 rounded hover:bg-danger/10 text-danger transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* 展开编辑面板 */}
                  {isEditing && (
                    <div className="px-3 pb-3 space-y-2 border-t dark:border-border-dark light:border-border-light">
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <select
                          value={it.category || '杂物'}
                          onChange={e => updateItemField(it.id, 'category', e.target.value)}
                          className="sm:flex-1 px-2 py-1 rounded border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                        >
                          <option value="武器">武器</option>
                          <option value="护甲">护甲</option>
                          <option value="法器">法器</option>
                          <option value="工具">工具</option>
                          <option value="药水">药水</option>
                          <option value="杂物">杂物</option>
                        </select>
                        <input
                          type="text"
                          value={it.subCategory || ''}
                          onChange={e => updateItemField(it.id, 'subCategory', e.target.value || undefined)}
                          placeholder="子分类"
                          className="sm:flex-1 px-2 py-1 rounded border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="sm:flex-1 flex items-center gap-1 min-w-0">
                          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">单价</span>
                          <input
                            type="number"
                            min={0}
                            value={it.unitPrice?.amount ?? ''}
                            onChange={e => updateItemField(it.id, 'unitPrice', e.target.value ? { amount: parseFloat(e.target.value) || 0, unit: it.unitPrice?.unit ?? 'cp' } : undefined)}
                            placeholder="金额"
                            className="flex-1 min-w-0 px-2 py-1 rounded border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                          />
                          <select
                            value={it.unitPrice?.unit ?? 'cp'}
                            onChange={e => updateItemField(it.id, 'unitPrice', { amount: it.unitPrice?.amount ?? 0, unit: e.target.value as TreasurePriceUnit })}
                            className="shrink-0 px-1 py-1 rounded border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                          >
                            {PRICE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <WeightInput
                          initial={it.weight}
                          onCommit={w => updateItemField(it.id, 'weight', w)}
                          compact
                        />
                      </div>
                      <button
                        onClick={() => setEditingItemId(null)}
                        className="w-full py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        保存
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 装备库选择弹窗（D1 系统装备库） */}
      {showEquipPicker && (
        <EquipmentPicker
          onSelect={addEquipment}
          onClose={() => setShowEquipPicker(false)}
        />
      )}
    </div>
  );
}

interface WeightInputProps {
  initial: number | undefined;
  onCommit: (w: number) => void;
  compact?: boolean;
}

// 重量输入框：编辑中（光标闪烁）可任意值（包括空），失焦时空值自动补 0
function WeightInput({ initial, onCommit, compact = false }: WeightInputProps) {
  const [draft, setDraft] = useState<string>(initial === undefined ? '' : String(initial));
  useEffect(() => {
    setDraft(initial === undefined ? '' : String(initial));
  }, [initial]);

  const handleBlur = () => {
    const raw = draft.trim();
    const n = raw === '' || raw === '-' || raw === '.' ? Number.NaN : parseFloat(raw);
    const final = Number.isNaN(n) ? 0 : n;
    setDraft(String(final));
    onCommit(final);
  };

  const inputClass = compact
    ? 'flex-1 min-w-0 px-2 py-1 rounded border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary'
    : 'flex-1 min-w-0 px-2 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary';

  return (
    <div className="sm:flex-1 flex items-center gap-1 min-w-0">
      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">重量</span>
      <input
        type="number"
        min={0}
        step="0.1"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder="磅"
        className={inputClass}
      />
      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">lb</span>
    </div>
  );
}
