import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Edit, Trash2, ChevronLeft, Coins, RefreshCw } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import { equipmentStore } from '@/data/equipmentStore';
import { commitFile, fetchFile } from '@/utils/github';

const CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];

export default function EquipmentList() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | undefined>(undefined);
  const [equipments, setEquipments] = useState<EquipmentItem[]>(equipmentStore.getAll());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsubscribe = equipmentStore.subscribe(() => {
      setEquipments(equipmentStore.getAll());
    });
    return unsubscribe;
  }, []);

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
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [equipments, selectedCategory, searchQuery]);

  const handleSave = async (item: EquipmentItem) => {
    setSaving(true);
    setError('');

    try {
      const idMatchIndex = equipments.findIndex((e) => e.id === item.id);
      const nameMatchIndex = equipments.findIndex((e) => e.name === item.name && e.id !== item.id);
      let newEquipments: EquipmentItem[];
      let isUpdate = false;

      if (idMatchIndex >= 0) {
        newEquipments = equipments.map((e, i) => (i === idMatchIndex ? item : e));
        isUpdate = true;
      } else if (nameMatchIndex >= 0) {
        const updatedItem = { ...item, id: equipments[nameMatchIndex].id };
        newEquipments = equipments.map((e, i) => (i === nameMatchIndex ? updatedItem : e));
        isUpdate = true;
      } else {
        newEquipments = [...equipments, item];
      }

      equipmentStore.save(newEquipments);
      setEquipments(newEquipments);

      try {
        await commitFile(
          'src/data/equipments.json',
          JSON.stringify(newEquipments, null, 2),
          isUpdate
            ? `update equipment: ${item.name}`
            : `add equipment: ${item.name}`
        );
      } catch (githubError) {
        console.warn('GitHub 同步失败，数据已保存在本地:', githubError);
      }

      setEditorOpen(false);
      setEditingItem(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const item = equipments.find((e) => e.id === id);
    if (!item) return;

    setSaving(true);
    setError('');

    try {
      const newEquipments = equipments.filter((e) => e.id !== id);

      equipmentStore.save(newEquipments);
      setEquipments(newEquipments);
      setDeleteConfirm(null);

      try {
        await commitFile(
          'src/data/equipments.json',
          JSON.stringify(newEquipments, null, 2),
          `delete equipment: ${item.name}`
        );
      } catch (githubError) {
        console.warn('GitHub 同步失败，数据已保存在本地:', githubError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromGitHub = async () => {
    try {
      setSyncing(true);
      setError('');
      const content = await fetchFile('src/data/equipments.json');
      if (content) {
        const data = JSON.parse(content) as EquipmentItem[];
        equipmentStore.save(data);
        setEquipments(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '从 GitHub 同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleEdit = (item: EquipmentItem) => {
    setEditingItem(item);
    setEditorOpen(true);
  };

  const handleAddNew = () => {
    setEditingItem(undefined);
    setEditorOpen(true);
  };

  const formatPrice = (item: EquipmentItem) => {
    return `${item.price.amount} ${item.price.unit}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/inventory')}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
          装备库
        </h1>
        <button
          onClick={handleSyncFromGitHub}
          disabled={syncing}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light disabled:opacity-50"
          title="从 GitHub 同步"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      {/* 搜索栏 */}
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
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          新增装备
        </button>
      </div>

      {/* 分类 tab */}
      <div className="flex gap-1 border-b dark:border-border-dark light:border-border-light overflow-x-auto -mx-2 px-2">
        {CATEGORIES.map((cat) => {
          const count = categoryCounts[cat] || 0;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors relative ${
                isActive
                  ? 'text-primary'
                  : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
              }`}
            >
              {cat}
              <span className={`ml-1.5 text-xs ${
                isActive ? 'text-primary' : 'dark:text-text-dark-muted light:text-text-light-muted'
              }`}>
                {count}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3">
        {filteredEquipments.map((item) => (
          <div
            key={item.id}
            className="block p-4 rounded-lg border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light hover:border-primary transition-colors group"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono dark:text-text-dark-muted light:text-text-light-muted">
                    {item.id}
                  </span>
                  <h3 className="font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors truncate">
                    {item.name}
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  <span>{item.category}</span>
                  {item.subtype && <span>· {item.subtype}</span>}
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm">
                  <span className="flex items-center gap-1 dark:text-text-dark light:text-text-light">
                    <Coins className="w-3.5 h-3.5 text-accent" />
                    {formatPrice(item)}
                  </span>
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">
                    {item.weight} 磅
                  </span>
                </div>
                {item.properties && item.properties.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.properties.slice(0, 4).map((prop) => (
                      <span
                        key={prop}
                        className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary"
                      >
                        {prop}
                      </span>
                    ))}
                    {item.properties.length > 4 && (
                      <span className="px-1.5 py-0.5 text-xs rounded dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted">
                        +{item.properties.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(item)}
                  className="p-2 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
                  title="编辑"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(item.id)}
                  className="p-2 rounded hover:bg-danger/20 text-danger"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredEquipments.length === 0 && (
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">
          没有找到匹配的装备
        </div>
      )}

      {editorOpen && (
        <EquipmentEditor
          item={editingItem}
          isStatic={true}
          onSave={handleSave}
          onDelete={editingItem ? () => handleDelete(editingItem.id) : undefined}
          onClose={() => {
            setEditorOpen(false);
            setEditingItem(undefined);
          }}
          loading={saving}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">
              确认删除
            </h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确定要删除 "{equipments.find((e) => e.id === deleteConfirm)?.name}" 吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 disabled:opacity-50"
              >
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
