// src/components/MonsterPicker.tsx
// 从怪物图鉴选取：整屏选择器（交互对齐 SpellPicker），数据源与 /monsters 页（MonsterList）完全一致——都走 npcTemplateStore，
// 打开时同样先 fetchAll() 拉 D1 云端全量（空库会自动上云种子），本地缓存只作离线兜底。
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, BookOpen, X } from 'lucide-react';
import {
  CREATURE_SIZE_LABELS, CREATURE_TYPE_LABELS,
  CR_FILTER_VALUES, normalizeCr, crToNumber,
  type CreatureSize, type CreatureType, type NpcTemplate,
} from '@/types/combat';
import npcTemplateStore from '@/data/npcTemplateStore';

const CR_LABELS: Record<string, string> = {
  '0': '0', '1/8': '1⁄8', '1/4': '1⁄4', '1/2': '1⁄2',
  '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', '11': '11', '12': '12', '13': '13', '14': '14', '15': '15', '16': '16',
  '17': '17', '18': '18', '19': '19', '20': '20',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: NpcTemplate) => void;
  /** 高亮当前已选模板 */
  selectedId?: string;
  /** 图鉴本身为空时的提示 */
  emptyHint?: string;
  /** 每行右侧的自定义动作（如编辑模板）；行点击仍是 onSelect */
  renderAction?: (template: NpcTemplate) => ReactNode;
}

export default function MonsterPicker({ isOpen, onClose, onSelect, selectedId, emptyHint, renderAction }: Props) {
  const [templates, setTemplates] = useState<NpcTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<CreatureType | 'all'>('all');
  const [crFilter, setCrFilter] = useState<string | 'all'>('all');
  const [sizeFilter, setSizeFilter] = useState<CreatureSize | 'all'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const refresh = () => setTemplates(npcTemplateStore.getAll());
    refresh();
    const unsubscribe = npcTemplateStore.subscribe(refresh);

    // 与 MonsterList 一致：D1 为真源，先展示本地缓存，再拉云端覆盖
    setLoading(true);
    npcTemplateStore.fetchAll()
      .catch(() => { /* 离线时保留本地缓存 */ })
      .finally(() => {
        if (cancelled) return;
        refresh();
        setLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isOpen]);

  const ALL_CREATURE_TYPES: CreatureType[] = Object.keys(CREATURE_TYPE_LABELS) as CreatureType[];
  const ALL_CREATURE_SIZES: CreatureSize[] = [0, 1, 2, 3, 4, 5];

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter(t => {
      const matchesSearch = !q
        || t.name.toLowerCase().includes(q)
        || (t.nameEn || '').toLowerCase().includes(q)
        || (t.templateId || '').toLowerCase().includes(q)
        || (t.type || '').toLowerCase().includes(q);
      const matchesType = typeFilter === 'all'
        || t.creatureType === typeFilter
        || t.type === CREATURE_TYPE_LABELS[typeFilter];
      const matchesCr = crFilter === 'all' || normalizeCr(t.cr) === crFilter;
      const matchesSize = sizeFilter === 'all'
        || t.creatureSize === sizeFilter
        || t.size === CREATURE_SIZE_LABELS[sizeFilter];
      return matchesSearch && matchesType && matchesCr && matchesSize;
    });
  }, [templates, searchQuery, typeFilter, crFilter, sizeFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aCr = crToNumber(a.cr);
      const bCr = crToNumber(b.cr);
      if (aCr !== bCr) return aCr - bCr;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [filtered]);

  const hasAnyFilter = typeFilter !== 'all' || crFilter !== 'all' || sizeFilter !== 'all' || searchQuery !== '';
  const clearAllFilters = () => {
    setTypeFilter('all');
    setCrFilter('all');
    setSizeFilter('all');
    setSearchQuery('');
  };

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-2.5 py-1 rounded-full text-xs transition-colors ${active ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`;

  // 标签行：单行 + 行内横向滑动，避免手机上标签换行挤占列表高度
  const filterRow = (label: string, children: ReactNode) => (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );

  if (!isOpen) return null;

  const handleSelect = (template: NpcTemplate) => {
    onSelect(template);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full h-full max-w-4xl max-h-[90vh] m-4 flex flex-col rounded-2xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-border-dark light:border-border-light flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
            <BookOpen className="w-5 h-5 text-primary" />
            从怪物图鉴选取
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索 + 筛选 */}
        <div className="p-6 border-b dark:border-border-dark light:border-border-light flex-shrink-0 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索怪物名称 / 英文名 / 种类..."
              className="w-full pl-12 pr-4 py-3 rounded-lg border bg-transparent outline-none text-base dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
            />
          </div>

          <div className="space-y-2.5">
            {filterRow('种类', (
              <>
                <button onClick={() => setTypeFilter('all')} className={chipClass(typeFilter === 'all')}>全部</button>
                {ALL_CREATURE_TYPES.map(ct => (
                  <button key={ct} onClick={() => setTypeFilter(typeFilter === ct ? 'all' : ct)} className={chipClass(typeFilter === ct)}>
                    {CREATURE_TYPE_LABELS[ct]}
                  </button>
                ))}
              </>
            ))}
            {filterRow('CR', (
              <>
                <button onClick={() => setCrFilter('all')} className={chipClass(crFilter === 'all')}>全部</button>
                {CR_FILTER_VALUES.map(cr => (
                  <button key={cr} onClick={() => setCrFilter(crFilter === cr ? 'all' : cr)} className={chipClass(crFilter === cr)}>
                    {CR_LABELS[cr] || cr}
                  </button>
                ))}
              </>
            ))}
            {filterRow('尺寸', (
              <>
                <button onClick={() => setSizeFilter('all')} className={chipClass(sizeFilter === 'all')}>全部</button>
                {ALL_CREATURE_SIZES.map(cs => (
                  <button key={cs} onClick={() => setSizeFilter(sizeFilter === cs ? 'all' : cs)} className={chipClass(sizeFilter === cs)}>
                    {CREATURE_SIZE_LABELS[cs]}
                  </button>
                ))}
              </>
            ))}
            {hasAnyFilter && (
              <div className="pt-1">
                <button onClick={clearAllFilters} className="text-xs text-danger hover:underline">清空所有筛选</button>
              </div>
            )}
          </div>
        </div>

        {/* 结果列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {loading ? '正在从云端加载图鉴…' : (emptyHint || '怪物图鉴暂无数据')}
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-sm dark:text-text-dark-muted light:text-text-light-muted">
              暂无匹配的怪物
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(t => {
                const selected = selectedId && t.id === selectedId;
                const sz = t.creatureSize !== undefined ? CREATURE_SIZE_LABELS[t.creatureSize] : t.size;
                const tp = t.creatureType !== undefined ? CREATURE_TYPE_LABELS[t.creatureType] : t.type;
                return (
                  <div
                    key={t.id}
                    onClick={() => handleSelect(t)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10'
                        : 'dark:border-border-dark light:border-border-light hover:border-primary dark:hover:bg-white/5 light:hover:bg-white/70'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold dark:text-text-dark light:text-text-light">{t.name}</span>
                        {t.nameEn && (
                          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{t.nameEn}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        {t.cr !== undefined && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                            CR {CR_LABELS[normalizeCr(t.cr) ?? ''] ?? t.cr}
                          </span>
                        )}
                        {sz && tp && <span>{sz}·{tp}</span>}
                        <span>AC {t.ac}</span>
                        <span>HP {t.maxHp}</span>
                      </div>
                    </div>
                    {renderAction?.(t)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t dark:border-border-dark light:border-border-light flex-shrink-0 text-xs dark:text-text-dark-muted light:text-text-light-muted">
          共 {sorted.length} 条（图鉴 {templates.length} 条）
        </div>
      </div>
    </div>,
    document.body,
  );
}
