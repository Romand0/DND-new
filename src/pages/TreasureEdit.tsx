// 宝藏编辑页
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Save, X, Search, Package } from 'lucide-react';
import treasureStore from '@/data/treasureStore';
import { characterStore } from '@/data/characterStore';
import type { Treasure, TreasureItem, TreasureCurrency } from '@/types/treasure';
import type { Equipment } from '@/types/character';

// 从角色库收集所有装备模板（用于装备库选择）
function getAllEquipmentTemplates(): Equipment[] {
  const chars = characterStore.getAll();
  const map = new Map<string, Equipment>();
  for (const char of chars) {
    for (const eq of char.equipment || []) {
      const key = eq.name;
      if (!map.has(key)) {
        map.set(key, { ...eq, childId: undefined });
      }
    }
  }
  return Array.from(map.values());
}

export default function TreasureEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id;

  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<TreasureCurrency>({ pp: 0, gp: 0, sp: 0, cp: 0 });
  const [items, setItems] = useState<TreasureItem[]>([]);
  const [showEquipPicker, setShowEquipPicker] = useState(false);
  const [equipSearch, setEquipSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState(1);

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
  }, [id, navigate]);

  const allEquips = useMemo(() => getAllEquipmentTemplates(), []);
  const filteredEquips = useMemo(() => {
    if (!equipSearch) return allEquips;
    const q = equipSearch.toLowerCase();
    return allEquips.filter(e => e.name.toLowerCase().includes(q));
  }, [allEquips, equipSearch]);

  const handleSave = () => {
    if (isNew) {
      const t = treasureStore.create(title);
      treasureStore.update(t.id, { currency, items });
      navigate('/inventory/treasures');
    } else if (id) {
      treasureStore.update(id, { title, currency, items });
      navigate('/inventory/treasures');
    }
  };

  const addEquipment = (eq: Equipment) => {
    const newItem: TreasureItem = {
      id: crypto.randomUUID(),
      name: eq.name,
      quantity: 1,
      unitPrice: undefined,
      equipmentSnapshot: { ...eq },
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
    };
    setItems(prev => [...prev, newItem]);
    setCustomName('');
    setCustomQty(1);
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

      {/* 物品列表 */}
      <div>
        <div className="flex items-center justify-between mb-3">
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
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="自定义物品名称..."
            className="flex-1 px-3 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
          />
          <input
            type="number"
            min={1}
            value={customQty}
            onChange={e => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-20 px-2 py-1.5 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
          />
          <button
            onClick={addCustomItem}
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 物品卡片 */}
        {items.length === 0 ? (
          <div className="text-center py-6 text-sm dark:text-text-dark-muted light:text-text-light-muted border border-dashed rounded-lg dark:border-border-dark light:border-border-light">
            暂无物品
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(it => (
              <div
                key={it.id}
                className="flex items-center gap-3 p-3 rounded-lg border dark:border-border-dark light:border-border-light"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                    {it.name}
                    {it.equipmentSnapshot && (
                      <span className="text-xs ml-1 dark:text-text-dark-muted light:text-text-light-muted">
                        (装备库)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
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
                  onClick={() => removeItem(it.id)}
                  className="p-1.5 rounded hover:bg-danger/10 text-danger transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 装备库选择弹窗 */}
      {showEquipPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="dark:bg-card-dark light:bg-card-light rounded-xl w-full max-w-md max-h-[80vh] flex flex-col">
            {/* 头部 */}
            <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light shrink-0">
              <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">从装备库选择</h3>
              <button onClick={() => setShowEquipPicker(false)} className="p-1 rounded hover:bg-danger/10 text-danger">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* 搜索 */}
            <div className="p-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                <input
                  type="text"
                  value={equipSearch}
                  onChange={e => setEquipSearch(e.target.value)}
                  placeholder="搜索装备..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
                />
              </div>
            </div>
            {/* 列表 */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {filteredEquips.length === 0 ? (
                <div className="text-center py-6 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  无匹配装备
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredEquips.map(eq => (
                    <button
                      key={eq.name}
                      onClick={() => addEquipment(eq)}
                      className="w-full text-left p-2.5 rounded-lg text-sm dark:text-text-dark light:text-text-light hover:bg-primary/10 transition-colors border dark:border-border-dark/50 light:border-border-light/50"
                    >
                      <div className="font-medium">{eq.name}</div>
                      <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                        {eq.category} · {(eq.weight || 0)}lb
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
