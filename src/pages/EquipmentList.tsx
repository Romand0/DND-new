// src/pages/EquipmentList.tsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEditorState } from '@/data/editorState';
import { Search, Plus, Edit, Trash2, ChevronLeft, Coins, RefreshCw } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import { fetchAllEquipments, createEquipment, updateEquipment, deleteEquipment, deleteEquipments } from '@/lib/api';

const CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];

export default function EquipmentList() {
  const navigate = useNavigate();
  const { isDM } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAllEquipments();
      data.sort((a, b) => a.id.localeCompare(b.id));
      setEquipments(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
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

  const filteredEquipments = useMemo(() => {
    return equipments.filter((item) => {
      const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [equipments, selectedCategory, searchQuery]);

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

  // ---- 批量删除 ----
  const handleBatchDelete = async () => {
    if (!isDM || selectedIds.size === 0) return;
    setSaving(true);
    setError('');
    try {
      await deleteEquipments(Array.from(selectedIds));
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
  if (!isDM) return;
  setSaving(true);
  setError('');
  try {
    if (editingItem) {
      if (item.id !== editingItem.id) {
        // ID 已变更：先创建新装备，再删除旧装备
        await createEquipment(item);
        await deleteEquipment(editingItem.id);
      } else {
        await updateEquipment(editingItem.id, item);
      }
    } else {
      await createEquipment(item);
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
    if (!isDM) return;
    setSaving(true);
    setError('');
    try {
      await deleteEquipment(id);
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

  const handleEdit = (item: EquipmentItem) => { if (!isDM) return; setEditingItem(item); setEditorOpen(true); };
  const handleAddNew = () => { if (!isDM) return; setEditingItem(undefined); setEditorOpen(true); };

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
        {isDM && (
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
        )}
      </div>

      {/* 分类 Tab */}
      <div className="flex gap-1 border-b dark:border-border-dark light:border-border-light overflow-x-auto -mx-2 px-2">
        {CATEGORIES.map((cat) => {
          const count = categoryCounts[cat] || 0;
          const isActive = selectedCategory === cat;
          return (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
                isActive ? 'text-primary' : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
              }`}>
              {cat}
              <span className={`ml-1.5 text-xs ${isActive ? 'text-primary' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>{count}</span>
              {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
            </button>
          );
        })}
      </div>

      {/* 全选行：仅选择模式 + DM + 有数据 */}
      {isDM && selectMode && filteredEquipments.length > 0 && (
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
          <div key={item.id} className="block p-4 rounded-lg border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light hover:border-primary transition-colors group">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* checkbox：仅选择模式 + DM */}
                {isDM && selectMode && (
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary truncate">{item.name}</h3>
                  <div className="flex items-center gap-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                    <span>{item.category}</span>
                    {item.subtype && <span>· {item.subtype}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="flex items-center gap-1 dark:text-text-dark light:text-text-light"><Coins className="w-3.5 h-3.5 text-accent" /> {formatPrice(item)}</span>
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">{item.weight} 磅</span>
                  </div>
                  {item.properties && item.properties.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.properties.slice(0, 4).map((p) => (<span key={p} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">{p}</span>))}
                      {item.properties.length > 4 && (<span className="px-1.5 py-0.5 text-xs rounded dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted">+{item.properties.length - 4}</span>)}
                    </div>
                  )}
                </div>
              </div>
              {/* 右侧：编辑/删除（一直有，DM 下） */}
              {isDM && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleEdit(item)} className="p-2 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light" title="编辑"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => setDeleteConfirm(item.id)} className="p-2 rounded hover:bg-danger/20 text-danger" title="删除"><Trash2 className="w-4 h-4" /></button>
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
