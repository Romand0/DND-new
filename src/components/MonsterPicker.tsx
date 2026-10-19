// src/components/MonsterPicker.tsx
// 从怪物图鉴选取：被 NpcCreator（参战者创建）等场景复用的选择器。
// 与 MonsterList 共享筛选逻辑，但持久化走独立命名空间、行为为"点选回调"而非导航/编辑。
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import {
  CREATURE_SIZE_LABELS, CREATURE_TYPE_LABELS,
  CR_FILTER_VALUES, normalizeCr, crToNumber,
  type CreatureSize, type CreatureType, type NpcTemplate,
} from '@/types/combat';
import npcTemplateStore from '@/data/npcTemplateStore';

// 筛选状态持久化 key（独立命名空间，与 /monsters 页互不干扰）
const STORAGE_KEY_SEARCH = 'npcCreator.monsterPicker.search';
const STORAGE_KEY_TYPE = 'npcCreator.monsterPicker.type';
const STORAGE_KEY_CR = 'npcCreator.monsterPicker.cr';
const STORAGE_KEY_SIZE = 'npcCreator.monsterPicker.size';

function loadSearchQuery(): string {
  try { return sessionStorage.getItem(STORAGE_KEY_SEARCH) || ''; } catch { return ''; }
}
function loadTypeFilter(): CreatureType | 'all' {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_TYPE);
    if (v === null || v === 'all') return 'all';
    if (Object.keys(CREATURE_TYPE_LABELS).includes(v)) return v as CreatureType;
    return 'all';
  } catch { return 'all'; }
}
function loadCrFilter(): string | 'all' {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_CR);
    if (v === null || v === 'all') return 'all';
    return normalizeCr(v) ?? 'all';
  } catch { return 'all'; }
}
function loadSizeFilter(): CreatureSize | 'all' {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY_SIZE);
    if (v === null || v === 'all') return 'all';
    const num = parseInt(v, 10);
    if (num >= 0 && num <= 5) return num as CreatureSize;
    return 'all';
  } catch { return 'all'; }
}

const CR_LABELS: Record<string, string> = {
  '0': '0', '1/8': '1⁄8', '1/4': '1⁄4', '1/2': '1⁄2',
  '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '10': '10', '11': '11', '12': '12', '13': '13', '14': '14', '15': '15', '16': '16',
  '17': '17', '18': '18', '19': '19', '20': '20',
};

interface Props {
  onSelect: (template: NpcTemplate) => void;
  /** 高亮当前已选模板（编辑场景回显用） */
  selectedId?: string;
  /** 列表为空时的提示文案 */
  emptyHint?: string;
  /** 每行右侧的自定义动作（如编辑按钮）；行点击仍是 onSelect */
  renderAction?: (template: NpcTemplate) => ReactNode;
}

export default function MonsterPicker({ onSelect, selectedId, emptyHint, renderAction }: Props) {
  const [templates, setTemplates] = useState<NpcTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState(loadSearchQuery);
  const [typeFilter, setTypeFilter] = useState<CreatureType | 'all'>(loadTypeFilter);
  const [crFilter, setCrFilter] = useState<string | 'all'>(loadCrFilter);
  const [sizeFilter, setSizeFilter] = useState<CreatureSize | 'all'>(loadSizeFilter);

  useEffect(() => {
    const refresh = () => setTemplates(npcTemplateStore.getAll());
    refresh();
    return npcTemplateStore.subscribe(refresh);
  }, []);

  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SEARCH, searchQuery); } catch {} }, [searchQuery]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_TYPE, typeFilter === 'all' ? 'all' : typeFilter); } catch {} }, [typeFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_CR, String(crFilter)); } catch {} }, [crFilter]);
  useEffect(() => { try { sessionStorage.setItem(STORAGE_KEY_SIZE, sizeFilter === 'all' ? 'all' : String(sizeFilter)); } catch {} }, [sizeFilter]);

  const ALL_CREATURE_TYPES: CreatureType[] = Object.keys(CREATURE_TYPE_LABELS) as CreatureType[];
  const ALL_CREATURE_SIZES: CreatureSize[] = [0, 1, 2, 3, 4, 5];

  const filtered = useMemo(() => {
    return templates.filter(t => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        t.name.toLowerCase().includes(q) ||
        (t.nameEn || '').toLowerCase().includes(q) ||
        t.templateId.toLowerCase().includes(q);
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
    `px-2.5 py-1 rounded-full text-xs transition-colors ${active ? 'bg-primary text-white' : 'dark:bg-white/5 light:bg-white/60 dark:text-text-dark light:text-text-light hover:bg-primary/10'}`;

  return (
    <div className="space-y-3">
      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索怪物名称 / 英文名 / ID..."
          className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary text-sm"
        />
      </div>

      {/* 筛选区 */}
      <div className="space-y-2.5 rounded-xl border p-3 dark:bg-bg-dark dark:border-border-dark light:bg-bg-light-2 light:border-border-light">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">种类</span>
          <button onClick={() => setTypeFilter('all')} className={chipClass(typeFilter === 'all')}>全部</button>
          {ALL_CREATURE_TYPES.map(ct => (
            <button key={ct} onClick={() => setTypeFilter(typeFilter === ct ? 'all' : ct)} className={chipClass(typeFilter === ct)}>
              {CREATURE_TYPE_LABELS[ct]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">CR</span>
          <button onClick={() => setCrFilter('all')} className={chipClass(crFilter === 'all')}>全部</button>
          {CR_FILTER_VALUES.map(cr => (
            <button key={cr} onClick={() => setCrFilter(crFilter === cr ? 'all' : cr)} className={chipClass(crFilter === cr)}>
              {CR_LABELS[cr] || cr}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">尺寸</span>
          <button onClick={() => setSizeFilter('all')} className={chipClass(sizeFilter === 'all')}>全部</button>
          {ALL_CREATURE_SIZES.map(cs => (
            <button key={cs} onClick={() => setSizeFilter(sizeFilter === cs ? 'all' : cs)} className={chipClass(sizeFilter === cs)}>
              {CREATURE_SIZE_LABELS[cs]}
            </button>
          ))}
        </div>
        {hasAnyFilter && (
          <div className="pt-1">
            <button onClick={clearAllFilters} className="text-xs text-danger hover:underline">清空所有筛选</button>
          </div>
        )}
      </div>

      {/* 结果列表 */}
      <div className="max-h-80 overflow-y-auto rounded-xl border divide-y dark:border-border-dark dark:divide-border-dark/50 light:border-border-light light:divide-border-light/50 dark:bg-bg-dark light:bg-bg-light-2">
        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
            {emptyHint || '暂无匹配的怪物'}
          </div>
        ) : (
          sorted.map(t => {
            const selected = selectedId && t.id === selectedId;
            const sz = t.creatureSize !== undefined ? CREATURE_SIZE_LABELS[t.creatureSize] : t.size;
            const tp = t.creatureType !== undefined ? CREATURE_TYPE_LABELS[t.creatureType] : t.type;
            return (
              <div
                key={t.id}
                onClick={() => onSelect(t)}
                className={`flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors ${
                  selected ? 'bg-primary/15' : 'hover:bg-primary/5'
                }`}
              >
                <span className="font-medium text-sm dark:text-text-dark light:text-text-light truncate">{t.name}</span>
                {t.nameEn && (
                  <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted truncate hidden sm:inline">{t.nameEn}</span>
                )}
                <span className="ml-auto flex items-center gap-1.5 shrink-0">
                  {t.cr !== undefined && (
                    <span className="inline-block px-1.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary">
                      {CR_LABELS[normalizeCr(t.cr) ?? ''] ?? t.cr}
                    </span>
                  )}
                  {sz && tp && (
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{sz}·{tp}</span>
                  )}
                  <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">HP {t.maxHp}</span>
                  {renderAction?.(t)}
                </span>
              </div>
            );
          })
        )}
      </div>
      {sorted.length > 0 && (
        <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          共 {sorted.length} 条（库内 {templates.length} 条）
        </p>
      )}
    </div>
  );
}
