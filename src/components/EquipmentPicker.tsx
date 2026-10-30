import { useState, useEffect, useMemo } from 'react';
import { X, Search, Package, ScrollText, Minus, Plus } from 'lucide-react';
import type { EquipmentItem } from '@/types/equipment';
import { fetchAllEquipments } from '@/lib/api';
import { isScrollEquipmentItem, loadScrollCatalog } from '@/data/spellScrolls';

const CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '法术材料', '卷轴', '杂物', '自定义'];

// 分类排序顺序（排除"全部"）
const CATEGORY_ORDER = ['武器', '护甲', '药水', '法器', '工具', '法术材料', '卷轴', '杂物', '自定义'];

interface EquipmentPickerProps {
  /** quantity 仅对卷轴等可批量物化的虚拟条目有意义，缺省 1 */
  onSelect: (item: EquipmentItem, quantity?: number) => void;
  onClose: () => void;
}

export default function EquipmentPicker({ onSelect, onClose }: EquipmentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 卷轴选中后的数量确认（点击卷轴不立即加入，先选张数）
  const [scrollPick, setScrollPick] = useState<{ item: EquipmentItem; qty: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAllEquipments().catch((e) => {
        console.error('装备选择器加载失败', e);
        return [] as EquipmentItem[];
      }),
      // 卷轴为虚拟条目：由法术库即时生成，不占 D1
      loadScrollCatalog().catch((e) => {
        console.error('卷轴目录加载失败', e);
        return [] as EquipmentItem[];
      }),
    ])
      .then(([equipments, scrolls]) => {
        if (cancelled) return;
        setEquipments([...equipments, ...scrolls]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredEquipments = useMemo(() => {
    let result = equipments.filter((item) => {
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    // 排序逻辑：在"全部"筛选下按分类顺序排序，否则按 ID 排序
    result.sort((a, b) => {
      if (selectedCategory === '全部') {
        // 按分类顺序排序，同分类内按 ID 排序
        const aCategoryIndex = CATEGORY_ORDER.indexOf(a.category);
        const bCategoryIndex = CATEGORY_ORDER.indexOf(b.category);
        
        if (aCategoryIndex !== bCategoryIndex) {
          return aCategoryIndex - bCategoryIndex;
        }
        
        // 同分类内按 ID 排序
        return a.id.localeCompare(b.id);
      } else {
        // 非"全部"筛选下按 ID 排序
        return a.id.localeCompare(b.id);
      }
    });

    return result;
  }, [equipments, selectedCategory, searchQuery]);

  const formatPrice = (item: EquipmentItem) => {
    return `${item.price.amount} ${item.price.unit}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl border w-full max-w-2xl max-h-[80vh] flex flex-col dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b dark:border-border-dark light:border-border-light">
          <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light flex items-center gap-2">
            <Package className="w-5 h-5" />
            从装备库添加
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索和筛选 */}
        <div className="p-4 border-b dark:border-border-dark light:border-border-light space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索名称或描述..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-white'
                    : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-white/10'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 列表区：loading / 空 / 有数据 三者互斥 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-3">
            共 {filteredEquipments.length} 件装备
          </div>

          {scrollPick && (
            <div className="mb-3 rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm dark:text-text-dark light:text-text-light">
                <ScrollText className="w-4 h-4 text-primary shrink-0" />
                <span className="font-medium truncate">{scrollPick.item.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">获得张数</span>
                <button
                  onClick={() => setScrollPick(p => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
                  className="p-1 rounded border dark:border-border-dark light:border-border-light hover:bg-white/10"
                ><Minus className="w-3.5 h-3.5" /></button>
                <input
                  type="number"
                  min={1}
                  value={scrollPick.qty}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setScrollPick(p => p ? { ...p, qty: Number.isFinite(n) && n >= 1 ? n : 1 } : p);
                  }}
                  className="w-16 px-2 py-1 text-sm text-center rounded border bg-transparent dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light"
                />
                <button
                  onClick={() => setScrollPick(p => p ? { ...p, qty: p.qty + 1 } : p)}
                  className="p-1 rounded border dark:border-border-dark light:border-border-light hover:bg-white/10"
                ><Plus className="w-3.5 h-3.5" /></button>
                <button
                  onClick={() => {
                    onSelect(scrollPick.item, scrollPick.qty);
                    setScrollPick(null);
                    onClose();
                  }}
                  className="ml-auto px-3 py-1 text-xs rounded-lg bg-primary text-white hover:bg-primary/90"
                >确认获得</button>
                <button
                  onClick={() => setScrollPick(null)}
                  className="px-3 py-1 text-xs rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light"
                >取消</button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
              加载中...
            </div>
          ) : filteredEquipments.length === 0 ? (
            <div className="text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
              没有找到匹配的装备
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredEquipments.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isScrollEquipmentItem(item)) {
                      setScrollPick({ item, qty: 1 });
                      return;
                    }
                    onSelect(item);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-lg border transition-colors hover:border-primary dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors truncate">
                          {item.name}
                        </h3>
                        <span className="text-xs px-1.5 py-0.5 rounded dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted">
                          {item.category}
                        </span>
                        {isScrollEquipmentItem(item) && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400">法术卷轴</span>
                        )}
                      </div>
                      <p className="text-xs mt-1 dark:text-text-dark-muted light:text-text-light-muted line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm dark:text-text-dark light:text-text-light">
                        {formatPrice(item)}
                      </div>
                      <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                        {item.weight} 磅
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
