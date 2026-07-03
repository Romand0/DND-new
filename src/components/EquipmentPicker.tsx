import { useState, useEffect, useMemo } from 'react';
import { X, Search, Package } from 'lucide-react';
import type { EquipmentItem } from '@/types/equipment';
import { equipmentStore } from '@/data/equipmentStore';

const CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];

interface EquipmentPickerProps {
  onSelect: (item: EquipmentItem) => void;
  onClose: () => void;
}

export default function EquipmentPicker({ onSelect, onClose }: EquipmentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [equipments, setEquipments] = useState<EquipmentItem[]>(equipmentStore.getAll());

  useEffect(() => {
    const unsubscribe = equipmentStore.subscribe(() => {
      setEquipments(equipmentStore.getAll());
    });
    return unsubscribe;
  }, []);

  const filteredEquipments = useMemo(() => {
    return equipments.filter((item) => {
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
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

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-3">
            共 {filteredEquipments.length} 件装备
          </div>
          <div className="grid gap-2">
            {filteredEquipments.map((item) => (
              <button
                key={item.id}
                onClick={() => {
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
          {filteredEquipments.length === 0 && (
            <div className="text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
              没有找到匹配的装备
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
