import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Edit, Trash2, ChevronLeft, Coins, RefreshCw } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import staticEquipments from '@/data/equipments.json';
import { fetchFile, commitFile } from '@/utils/github';

const STORAGE_KEY = 'equipment-cache';

const CATEGORIES = ['全部', '武器', '护甲', '药水', '法器', '工具', '杂物', '自定义'];

export default function EquipmentList() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | undefined>(undefined);
  const [equipments, setEquipments] = useState<EquipmentItem[]>(staticEquipments as EquipmentItem[]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        setEquipments(JSON.parse(cached));
      } catch {
        // ignore
      }
    }
    loadEquipments();
  }, []);

  const loadEquipments = async () => {
    try {
      setLoading(true);
      setError(null);
      const content = await fetchFile('src/data/equipments.json');
      if (content) {
        const data = JSON.parse(content) as EquipmentItem[];
        setEquipments(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (err) {
      console.warn('从 GitHub 加载装备失败，使用本地缓存:', err);
    } finally {
      setLoading(false);
    }
  };

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
    try {
      setSaving(true);
      setError(null);
      const existing = equipments.findIndex((e) => e.id === item.id);
      let updated: EquipmentItem[];
      let action: string;
      if (existing >= 0) {
        updated = [...equipments];
        updated[existing] = { ...item, isCustom: false };
        action = 'Update';
      } else {
        updated = [...equipments, { ...item, isCustom: false }];
        action = 'Add';
      }
      const content = JSON.stringify(updated, null, 2);
      await commitFile('src/data/equipments.json', content, `${action} equipment: ${item.name}`);
      setEquipments(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setEditorOpen(false);
      setEditingItem(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setSaving(true);
      setError(null);
      const item = equipments.find((e) => e.id === id);
      const updated = equipments.filter((e) => e.id !== id);
      const content = JSON.stringify(updated, null, 2);
      await commitFile('src/data/equipments.json', content, `Delete equipment: ${item?.name || id}`);
      setEquipments(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setDeleteConfirm(null);
      setEditorOpen(false);
      setEditingItem(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
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
          onClick={loadEquipments}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light disabled:opacity-50"
          title="刷新装备库"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

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
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 rounded-lg border bg-transparent outline-none dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light focus:border-primary"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark"
        >
          <Plus className="w-4 h-4" />
          新增装备
        </button>
      </div>

      <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
        共 {filteredEquipments.length} 件装备
        {loading && <span className="ml-2">（加载中...）</span>}
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
              确定要删除这件装备吗？此操作将提交到 GitHub 仓库，无法撤销。
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
