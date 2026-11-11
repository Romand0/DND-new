import { useState, useEffect, useMemo } from 'react';
import { X, Search, Package, ScrollText, Minus, Plus } from 'lucide-react';
import type { EquipmentItem } from '@/types/equipment';
import type { Spell } from '@/types/spell';
import { equipmentStore } from '@/data/equipmentStore';
import {
  isScrollEquipmentItem,
  isSpellScrollTemplate,
  buildScrollFromTemplate,
} from '@/data/spellScrolls';
import { isMagicGenerator, GENERATOR_CARD_CLASS } from '@/data/magicGenerators';
import {
  type EquipmentFilters,
  MAGIC_KIND_OPTIONS,
  TRADE_OPTIONS,
  SUBCATEGORY_MAP,
  isMagicItem,
  matchesEquipmentFilters,
  magicCategoryLabel,
  functionCategoryLabel,
  magicCategoryOptions,
  rarityOptions,
  functionCategoryOptions,
  TAXONOMY_CATEGORY_ORDER,
} from '@/data/equipmentTaxonomy';
import SpellPicker from '@/components/SpellPicker';

interface EquipmentPickerProps {
  /** quantity 仅对卷轴等可批量物化的虚拟条目有意义，缺省 1 */
  onSelect: (item: EquipmentItem, quantity?: number) => void;
  onClose: () => void;
}

export default function EquipmentPicker({ onSelect, onClose }: EquipmentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  // 三层分类筛选（与装备库页同一口径）：第一级魔法/非魔法，第二级品类·稀有度·功能·交易，第三级子分类
  const [magicFilter, setMagicFilter] = useState<string[]>([]);
  const [magicCatFilter, setMagicCatFilter] = useState<string>('全部');
  const [rarityFilter, setRarityFilter] = useState<string[]>([]);
  const [funcFilter, setFuncFilter] = useState<string>('全部');
  const [tradeFilter, setTradeFilter] = useState<string[]>([]);
  const [subFilter, setSubFilter] = useState<string[]>([]);
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 卷轴选中后的数量确认（点击卷轴不立即加入，先选张数）
  const [scrollPick, setScrollPick] = useState<{ item: EquipmentItem; qty: number } | null>(null);
  // 法术卷轴泛条目 → 生成器：先选法术再确定张数
  const [scrollTemplate, setScrollTemplate] = useState<EquipmentItem | null>(null);
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 种子基线 + 云端覆盖/墓碑/自建：与装备库页同一数据源
    equipmentStore
      .fetchAll()
      .then((list) => {
        if (!cancelled) setEquipments([...list]);
      })
      .catch((e) => {
        console.error('装备选择器加载失败', e);
        if (!cancelled) setEquipments([...equipmentStore.getAll()]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 选定法术后，以泛条目为模板生成具体卷轴并进入张数确认
  const handleSpellChosen = (spell: Spell) => {
    const tpl = scrollTemplate;
    setSpellPickerOpen(false);
    setScrollTemplate(null);
    if (!tpl) return;
    setScrollPick({ item: buildScrollFromTemplate(tpl, spell), qty: 1 });
  };

  const filters: EquipmentFilters = useMemo(() => ({
    magicKinds: magicFilter,
    magicCategory: magicCatFilter,
    rarity: rarityFilter,
    functionCategory: funcFilter,
    trade: tradeFilter,
    subcategories: subFilter,
    search: searchQuery,
  }), [magicFilter, magicCatFilter, rarityFilter, funcFilter, tradeFilter, subFilter, searchQuery]);

  // 从实际条目派生各维度选项（以库中现有分类为准）
  const magicCatOptions = useMemo(() => magicCategoryOptions(equipments), [equipments]);
  const rarityOpts = useMemo(() => rarityOptions(equipments), [equipments]);
  const funcOptions = useMemo(() => functionCategoryOptions(equipments), [equipments]);

  const filteredEquipments = useMemo(() => {
    const result = equipments.filter((item) => matchesEquipmentFilters(item, filters));

    // 排序：魔法泛条目生成器恒置顶；其余按跨域品类权重，同品类按 ID
    result.sort((a, b) => {
      const ag = isMagicGenerator(a) ? 0 : 1;
      const bg = isMagicGenerator(b) ? 0 : 1;
      if (ag !== bg) return ag - bg;

      const aLabel = isMagicItem(a) ? magicCategoryLabel(a) : functionCategoryLabel(a);
      const bLabel = isMagicItem(b) ? magicCategoryLabel(b) : functionCategoryLabel(b);
      const ai = TAXONOMY_CATEGORY_ORDER.indexOf(aLabel);
      const bi = TAXONOMY_CATEGORY_ORDER.indexOf(bLabel);
      const ar = ai < 0 ? TAXONOMY_CATEGORY_ORDER.length : ai;
      const br = bi < 0 ? TAXONOMY_CATEGORY_ORDER.length : bi;
      if (ar !== br) return ar - br;

      return a.id.localeCompare(b.id);
    });

    return result;
  }, [equipments, filters]);

  const toggleTag = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const showMagicFilters = magicFilter.length === 0 || magicFilter.includes('魔法物品');
  const showNonMagicFilters = magicFilter.length === 0 || magicFilter.includes('非魔法物品');

  const pill = (active: boolean) =>
    `px-3 py-1 text-sm rounded-full transition-colors ${
      active
        ? 'bg-primary text-white'
        : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-white/10'
    }`;

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
        <div className="p-4 border-b dark:border-border-dark light:border-border-light space-y-3 max-h-[46vh] overflow-y-auto shrink-0">
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
          {/* 第一级：魔法 / 非魔法 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted w-8 shrink-0">类别</span>
            <button onClick={() => setMagicFilter([])} className={pill(magicFilter.length === 0)}>全部</button>
            {MAGIC_KIND_OPTIONS.map((m) => (
              <button key={m} onClick={() => setMagicFilter(toggleTag(magicFilter, m))}
                className={pill(magicFilter.includes(m))}>{m}</button>
            ))}
          </div>

          {/* 第二级 · 魔法：品类 + 稀有度 */}
          {showMagicFilters && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted w-8 shrink-0">品类</span>
                <button onClick={() => setMagicCatFilter('全部')} className={pill(magicCatFilter === '全部')}>全部</button>
                {magicCatOptions.map((c) => (
                  <button key={c} onClick={() => setMagicCatFilter(magicCatFilter === c ? '全部' : c)}
                    className={pill(magicCatFilter === c)}>{c}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted w-8 shrink-0">稀有</span>
                {rarityOpts.map((r) => (
                  <button key={r} onClick={() => setRarityFilter(toggleTag(rarityFilter, r))}
                    className={pill(rarityFilter.includes(r))}>{r}</button>
                ))}
              </div>
            </>
          )}

          {/* 第二级 · 非魔法：功能 + 交易；第三级子分类 */}
          {showNonMagicFilters && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted w-8 shrink-0">功能</span>
                <button onClick={() => setFuncFilter('全部')} className={pill(funcFilter === '全部')}>全部</button>
                {funcOptions.map((c) => (
                  <button key={c} onClick={() => {
                    const next = funcFilter === c ? '全部' : c;
                    setFuncFilter(next);
                    setSubFilter([]);
                  }}
                    className={pill(funcFilter === c)}>{c}</button>
                ))}
              </div>
              {funcFilter !== '全部' && SUBCATEGORY_MAP[funcFilter] && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted w-8 shrink-0">子类</span>
                  {SUBCATEGORY_MAP[funcFilter].map((s) => (
                    <button key={s} onClick={() => setSubFilter(toggleTag(subFilter, s))}
                      className={pill(subFilter.includes(s))}>{s}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted w-8 shrink-0">交易</span>
                {TRADE_OPTIONS.map((t) => (
                  <button key={t} onClick={() => setTradeFilter(toggleTag(tradeFilter, t))}
                    className={pill(tradeFilter.includes(t))}>{t}</button>
                ))}
              </div>
            </>
          )}
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
                    if (isSpellScrollTemplate(item)) {
                      setScrollTemplate(item);
                      setSpellPickerOpen(true);
                      return;
                    }
                    if (isScrollEquipmentItem(item)) {
                      setScrollPick({ item, qty: 1 });
                      return;
                    }
                    onSelect(item);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition-colors group ${
                    isMagicGenerator(item)
                      ? GENERATOR_CARD_CLASS
                      : 'hover:border-primary dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors truncate">
                          {item.name}
                        </h3>
                        <span className="text-xs px-1.5 py-0.5 rounded dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted">
                          {isMagicItem(item) ? magicCategoryLabel(item) : functionCategoryLabel(item)}
                        </span>
                        {isMagicGenerator(item) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white">魔法物品生成器</span>
                        )}
                        {item.subtype === '材料袋' && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-sky-500/10 text-sky-400">材料包</span>
                        )}
                        {item.subtype && ['奥术法器', '德鲁伊法器', '圣徽'].includes(item.subtype) && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">施法法器</span>
                        )}
                        {item.category === '工具' && item.subtype === '乐器' && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">施法法器·乐器</span>
                        )}
                        {item.rarity && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400">{item.rarity}</span>
                        )}
                        {isScrollEquipmentItem(item) && !isMagicGenerator(item) && (
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

      {/* 法术卷轴生成器：先选法术，再回到本弹窗确认张数 */}
      <SpellPicker
        isOpen={spellPickerOpen}
        onClose={() => { setSpellPickerOpen(false); setScrollTemplate(null); }}
        onSelect={handleSpellChosen}
        selectedSpellIds={[]}
      />
    </div>
  );
}
