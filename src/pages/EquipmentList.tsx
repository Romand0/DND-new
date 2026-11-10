// src/pages/EquipmentList.tsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCampaign } from '@/contexts/CampaignContext';
import { useEditorState } from '@/data/editorState';
import { Search, Plus, Edit, Trash2, ChevronLeft, Coins, RefreshCw, ExternalLink } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import { equipmentStore } from '@/data/equipmentStore';
import { getSeedEditUrl } from '@/lib/seedGitHub';
import { isMagicGenerator, GENERATOR_CARD_CLASS } from '@/data/magicGenerators';

const FUNC_CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '法术材料', '卷轴', '杂物', '自定义'];
const MAGIC_CATEGORIES = ['魔法物品', '非魔法物品'];
const TRADE_CATEGORIES = ['冒险物品', '贵重物品'];

// 分类排序顺序（排除"全部"）
const CATEGORY_ORDER = ['武器', '护甲', '药水', '法器', '工具', '法术材料', '卷轴', '杂物', '自定义'];

const SUBCATEGORY_MAP: Record<string, string[]> = {
  '武器': ['军用近战', '军用远程', '简易近战', '简易远程'],
  '护甲': ['轻甲', '中甲', '重甲', '盾牌'],
  '工具': ['工匠工具', '赌具', '乐器'],
  '法器': ['奥术法器', '德鲁伊法器', '圣徽', '材料袋'],
};

export default function EquipmentList() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { current } = useCampaign();
  // 无团组登录用户：出版物只读可见，自定义条目写入需团组归属（R6）
  const noCampaignHint = isAdmin && !current;

  // 检索状态持久化：sessionStorage 会话级保存（刷新/页间返回后恢复筛选与滚动位置）
  const LIST_STATE_KEY = 'DND-equipment-list-state';
  const savedListState = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || '{}');
    } catch {
      return {} as Record<string, unknown>;
    }
  })();

  const [searchQuery, setSearchQuery] = useState<string>(savedListState.searchQuery ?? '');
  const [funcFilter, setFuncFilter] = useState<string>(savedListState.funcFilter ?? '全部');
  const [subFilter, setSubFilter] = useState<string[]>(savedListState.subFilter ?? []);
  const [magicFilter, setMagicFilter] = useState<string[]>(savedListState.magicFilter ?? []);
  const [tradeFilter, setTradeFilter] = useState<string[]>(savedListState.tradeFilter ?? []);
  const savedScrollRef = useRef<number>(typeof savedListState.scrollTop === 'number' ? savedListState.scrollTop : 0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | undefined>(undefined);
  const [equipments, setEquipments] = useState<EquipmentItem[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false); // 新增：选择模式
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEditorState(editorOpen);

  // 筛选状态变化 → 写 sessionStorage（滚动位置由监听器单独维护）
  useEffect(() => {
    sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({
      searchQuery, funcFilter, subFilter, magicFilter, tradeFilter, scrollTop: savedScrollRef.current,
    }));
  }, [searchQuery, funcFilter, subFilter, magicFilter, tradeFilter]);

  // 滚动位置节流记录（200ms）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { savedScrollRef.current = window.scrollY; }, 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // 数据就绪后恢复滚动位置（仅进入页面时一次）
  useEffect(() => {
    if (!loading && savedScrollRef.current > 0) {
      requestAnimationFrame(() => window.scrollTo(0, savedScrollRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const load = async () => {
    setError('');
    // 首屏即时：先渲染合并视图（种子 ∪ 云端本地缓存），不等网络
    try {
      setEquipments([...equipmentStore.getAll()]);
    } catch { /* 本地缓存异常时继续走云端 */ }
    setLoading(false);
    // 预热种子 + 云端校准（法术卷轴不再按法术库全量投影，改为泛条目生成器）
    try {
      const mergedList = await equipmentStore.fetchAll();
      setEquipments([...mergedList]);
    } catch (e: any) {
      setError(e.message || '加载失败');
    }
  };

  useEffect(() => { load(); }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { '全部': equipments.length };
    for (const item of equipments) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [equipments]);

  const pill = (active: boolean) => 
    `px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
      active 
        ? 'bg-primary text-white' 
        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  const toggleTag = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  const filteredEquipments = useMemo(() => {
    let result = equipments.filter((item) => {
      const mc = item.magicCategory ?? '非魔法物品';
      const tc = item.tradeCategory ?? '冒险物品';
      const matchFunc = funcFilter === '全部' || item.category === funcFilter;
      const matchSub = subFilter.length === 0 || subFilter.some(s => item.subtype?.includes(s));
      const matchMagic = magicFilter.length === 0 || magicFilter.includes(mc);
      const matchTrade = tradeFilter.length === 0 || tradeFilter.includes(tc);
      const matchSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchFunc && matchSub && matchMagic && matchTrade && matchSearch;
    });

    // 排序逻辑：魔法泛条目生成器恒置顶；其余在"全部"筛选下按分类顺序，否则按 ID
    result.sort((a, b) => {
      const ag = isMagicGenerator(a) ? 0 : 1;
      const bg = isMagicGenerator(b) ? 0 : 1;
      if (ag !== bg) return ag - bg;

      if (funcFilter === '全部') {
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
  }, [equipments, funcFilter, subFilter, magicFilter, tradeFilter, searchQuery]);

  // ---- 选择逻辑 ----
  const allFilteredSelected = useMemo(() => {
    return filteredEquipments.length > 0 && filteredEquipments.every((item) => selectedIds.has(item.id));
  }, [filteredEquipments, selectedIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredEquipments.forEach((item) => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredEquipments.forEach((item) => next.add(item.id));
        return next;
      });
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // 卡片点击：选择模式下 = 勾选；否则跳详情页（描述非空才有意义，但保持全卡片可点）
  const handleCardClick = (item: EquipmentItem) => {
    if (isAdmin && selectMode) {
      toggleSelect(item.id);
      return;
    }
    navigate(`/equipment/${encodeURIComponent(item.id)}`);
  };

  // ---- 批量删除 ----
  const handleBatchDelete = async () => {
    if (!isAdmin || selectedIds.size === 0) return;
    setSaving(true);
    setError('');
    try {
      // 逐条走 store（种子派生墓碑、自建/覆盖云端移除）
      await Promise.all(Array.from(selectedIds).map((id) => equipmentStore.deleteItem(id)));
      exitSelectMode();
      setBatchDeleteConfirm(false);
      load();
    } catch (e: any) {
      setError(e.message || '批量删除失败');
    } finally {
      setSaving(false);
    }
  };

  // ---- 单条 CRUD（不变）----
  const handleSave = async (item: EquipmentItem) => {
  if (!isAdmin) return;
  setSaving(true);
  setError('');
  try {
    if (editingItem) {
      if (item.id !== editingItem.id) {
        // ID 已变更：新建条目 + 删除旧条目（种子会派生覆盖行/墓碑）
        await equipmentStore.saveItem({ ...item, campaignId: item.campaignId ?? undefined });
        await equipmentStore.deleteItem(editingItem.id);
      } else {
        await equipmentStore.saveItem(item);
      }
    } else {
      await equipmentStore.saveItem({ ...item, campaignId: item.campaignId ?? null });
    }
    setEditorOpen(false);
    setEditingItem(undefined);
    load();
  } catch (e: any) {
    setError(e.message || '保存失败');
  } finally {
    setSaving(false);
  }
};


  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    setSaving(true);
    setError('');
    try {
      await equipmentStore.deleteItem(id);
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromGitHub = async () => {
    setSyncing(true);
    setError('');
    try { await load(); } catch (e: any) { setError('云端加载失败：' + (e.message || '')); } finally { setSyncing(false); }
  };

  const handleEdit = (item: EquipmentItem) => {
    if (!isAdmin || item.scrollSpellId) return;
    setEditingItem(item);
    setEditorOpen(true);
  };
  const handleAddNew = () => { if (!isAdmin) return; setEditingItem(undefined); setEditorOpen(true); };

  const formatPrice = (item: EquipmentItem) => `${item.price.amount} ${item.price.unit}`;

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 顶栏 */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/inventory')} className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">装备库</h1>
        <button onClick={handleSyncFromGitHub} disabled={syncing} className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light disabled:opacity-50" title="从云端刷新">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (<div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>)}

      {/* 搜索 + DM 操作栏 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索名称或描述..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
          />
        </div>
        {isAdmin && (
          current ? (
          <div className="flex gap-2">
            {/* 非选择模式：只显新增 + 批量操作入口 */}
            {!selectMode && (
              <>
                <button onClick={handleAddNew} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark whitespace-nowrap">
                  <Plus className="w-4 h-4" /> 新增装备
                </button>
                <button onClick={() => setSelectMode(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 whitespace-nowrap">
                  <Trash2 className="w-4 h-4" /> 批量操作
                </button>
              </>
            )}
            {/* 选择模式：取消 + 批量删除（有选中才显） */}
            {selectMode && (
              <>
                <button onClick={exitSelectMode} className="flex items-center gap-2 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 whitespace-nowrap">
                  取消
                </button>
                {selectedIds.size > 0 && (
                  <button onClick={() => setBatchDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 whitespace-nowrap">
                    <Trash2 className="w-4 h-4" /> 批量删除 ({selectedIds.size})
                  </button>
                )}
              </>
            )}
          </div>
          ) : (
            <span className="self-center text-xs text-gray-500" title="加入或创建团组后再添加自定义条目">
              加入或创建团组后再添加自定义条目
            </span>
          )
        )}
      </div>

      {/* 三维筛选胶囊标签 */}
      <div className="space-y-2.5 rounded-xl border dark:border-border-dark light:border-border-light p-3">
        {/* ① 功能分类 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark light:text-text-light w-10">功能</span>
          <button onClick={() => setFuncFilter('全部')} className={pill(funcFilter === '全部')}>全部</button>
          {FUNC_CATEGORIES.filter(c => c !== '全部').map(c => (
            <button key={c} onClick={() => {
              const next = funcFilter === c ? '全部' : c;
              setFuncFilter(next);
              setSubFilter([]); // 切换主分类时重置子分类
            }}
              className={pill(funcFilter === c)}>{c}</button>
          ))}
        </div>
        
        {/* 子分类：仅当主分类有预设时展开 */}
        {funcFilter !== '全部' && SUBCATEGORY_MAP[funcFilter] && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium dark:text-text-dark light:text-text-light w-10">子类</span>
            {SUBCATEGORY_MAP[funcFilter].map(s => (
              <button key={s}
                onClick={() => setSubFilter(toggleTag(subFilter, s))}
                className={pill(subFilter.includes(s))}
              >{s}</button>
            ))}
          </div>
        )}
        
        {/* ② 魔法分类 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark light:text-text-light w-10">魔法</span>
          {MAGIC_CATEGORIES.map(m => (
            <button key={m} onClick={() => setMagicFilter(toggleTag(magicFilter, m))}
              className={pill(magicFilter.includes(m))}>{m}</button>
          ))}
        </div>
        {/* ③ 交易分类 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium dark:text-text-dark light:text-text-light w-10">交易</span>
          {TRADE_CATEGORIES.map(t => (
            <button key={t} onClick={() => setTradeFilter(toggleTag(tradeFilter, t))}
              className={pill(tradeFilter.includes(t))}>{t}</button>
          ))}
        </div>
      </div>

      {/* 全选行：仅选择模式 + DM + 有数据 */}
      {isAdmin && selectMode && filteredEquipments.length > 0 && (
        <label className="flex items-center gap-2 cursor-pointer select-none px-1">
          <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
          <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            {allFilteredSelected ? '取消全选' : '全选当前页'}
            <span className="ml-1">({selectedIds.size} 个已选)</span>
          </span>
        </label>
      )}

      {/* 列表 */}
      <div className="grid gap-3">
        {filteredEquipments.map((item) => (
          <div key={item.id}
            onClick={() => handleCardClick(item)}
            className={`block min-w-0 p-4 rounded-lg border transition-colors group cursor-pointer ${
              isMagicGenerator(item)
                ? GENERATOR_CARD_CLASS
                : 'dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light hover:border-primary'
            }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* checkbox：仅选择模式 + DM（已绑法术的具体卷轴为派生条目，不参与库维护） */}
                {isAdmin && selectMode && !item.scrollSpellId && (
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary truncate">{item.name}</h3>
                    {isMagicGenerator(item) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white shrink-0">魔法物品生成器</span>
                    )}
                    {item.magicCategory === '魔法物品' && !isMagicGenerator(item) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 shrink-0">魔法</span>
                    )}
                    {item.cursed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger shrink-0">诅咒</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                    <span>{item.category}</span>
                    {item.subtype && <span>· {item.subtype}</span>}
                    {item.rarity && <span className="text-amber-400">· {item.rarity}</span>}
                  </div>
                  {(item.price?.amount > 0 || item.weight > 0) && (
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      {item.price?.amount > 0 && (
                        <span className="flex items-center gap-1 dark:text-text-dark light:text-text-light"><Coins className="w-3.5 h-3.5 text-accent" /> {formatPrice(item)}</span>
                      )}
                      {item.weight > 0 && (
                        <span className="dark:text-text-dark-muted light:text-text-light-muted">{item.weight} 磅</span>
                      )}
                    </div>
                  )}
                  {item.description?.trim() && (
                    <p className="mt-2 text-xs dark:text-text-dark-muted light:text-text-light-muted line-clamp-2 leading-relaxed break-words">
                      {item.description.trim()}
                    </p>
                  )}
                  {item.properties && item.properties.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.properties.slice(0, 4).map((p) => (<span key={p} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">{p}</span>))}
                      {item.properties.length > 4 && (<span className="px-1.5 py-0.5 text-xs rounded dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted">+{item.properties.length - 4}</span>)}
                    </div>
                  )}
                </div>
              </div>
              {/* 右侧：编辑/删除。种子泛条目（含法术卷轴生成器）走 GitHub 编辑；已绑法术的派生卷轴只读 */}
              {isAdmin && item.scrollSpellId && (
                <span className="text-[10px] px-2 py-1 rounded bg-fuchsia-500/10 text-fuchsia-400 shrink-0">法术卷轴 · 只读</span>
              )}
              {isAdmin && !item.scrollSpellId && equipmentStore.isSeedItem(item.id) && (
                getSeedEditUrl('equipments', item.id) ? (
                  <a
                    href={getSeedEditUrl('equipments', item.id)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] shrink-0 border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:border-primary hover:text-primary"
                    title="种子条目只读，点击在 GitHub 编辑源文件"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> 在 GitHub 编辑
                  </a>
                ) : (
                  <span className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary shrink-0">种子 · 只读</span>
                )
              )}
              {isAdmin && !item.scrollSpellId && !equipmentStore.isSeedItem(item.id) && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} className="p-2 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light" title="编辑"><Edit className="w-4 h-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item.id); }} className="p-2 rounded hover:bg-danger/20 text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredEquipments.length === 0 && (<div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">没有找到匹配的装备</div>)}

      {/* Editor 弹窗 */}
      {editorOpen && (
      <EquipmentEditor
  item={editingItem}
  libraryEquipments={equipments}
  isStatic={true}
  showQuantity={false}      
  showPackSize={true}       
  onSave={handleSave}
  onDelete={editingItem ? () => handleDelete(editingItem.id) : undefined}
  onClose={() => { setEditorOpen(false); setEditingItem(undefined); }}
  loading={saving}
/>

    )}

      {/* 单删确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">确定要删除 "{equipments.find((e) => e.id === deleteConfirm)?.name}" 吗？此操作无法撤销。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} disabled={saving} className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">取消</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 disabled:opacity-50">{saving ? '删除中...' : '删除'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 批量删除确认 */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">批量删除确认</h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">确定要删除已选的 <strong>{selectedIds.size}</strong> 件装备吗？此操作无法撤销。</p>
            <div className="flex gap-3">
              <button onClick={() => setBatchDeleteConfirm(false)} disabled={saving} className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">取消</button>
              <button onClick={handleBatchDelete} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 disabled:opacity-50">{saving ? '删除中...' : `删除 ${selectedIds.size} 件`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
