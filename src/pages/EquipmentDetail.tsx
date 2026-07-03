import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEditorState } from '@/data/editorState';
import { ChevronLeft, Edit, Trash2, Coins, Scale, Tag } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [item, setItem] = useState<EquipmentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEditorState(editorOpen);

  // 从后端加载单条装备
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const data = await apiFetch(`/equipments/${id}`, { method: 'GET', headers });
      setItem(data);
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (updatedItem: EquipmentItem) => {
    if (!isDM || !id) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await apiFetch(`/equipments/${id}`, { method: 'PUT', body: JSON.stringify(updatedItem), headers });
      setEditorOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isDM || !id) return;
    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await apiFetch(`/equipments/${id}`, { method: 'DELETE', headers });
      navigate('/equipment');
    } catch (e: any) {
      setError(e.message || '删除失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">加载中...</div>;

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/equipment" className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">装备详情</h1>
        </div>
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">
          {error || '未找到该装备'}
        </div>
      </div>
    );
  }

  const formatPrice = () => {
    const unitMap: Record<string, string> = {
      gp: '金币',
      sp: '银币',
      cp: '铜币',
    };
    return `${item.price.amount} ${unitMap[item.price.unit] || item.price.unit}`;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/equipment" className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">{item.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{item.category}</span>
            {item.subtype && (
              <>
                <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
                <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{item.subtype}</span>
              </>
            )}
          </div>
        </div>
        {isDM && (
          <div className="flex gap-2">
            <button onClick={() => setEditorOpen(true)}
              className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
              <Edit className="w-5 h-5" />
            </button>
            <button onClick={() => setDeleteConfirm(true)}
              className="p-2 rounded-lg hover:bg-danger/20 text-danger">
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-danger/20 text-danger text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-4 h-4 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">价格</span>
          </div>
          <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">{formatPrice()}</p>
        </div>
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-4 h-4 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">重量</span>
          </div>
          <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">{item.weight} 磅</p>
        </div>
      </div>

      {item.properties && item.properties.length > 0 && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">属性</h3>
          <div className="flex flex-wrap gap-2">
            {item.properties.map((prop) => (
              <span key={prop} className="px-2 py-1 rounded bg-primary/20 text-primary text-sm">{prop}</span>
            ))}
          </div>
        </div>
      )}

      {item.description && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">描述</h3>
          <p className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap leading-relaxed">{item.description}</p>
        </div>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-medium dark:text-text-dark light:text-text-light">标签</h3>
          </div>
          <div className="space-y-2">
            {item.tags.map((tag, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">{tag.key}</span>
                <span className="dark:text-text-dark light:text-text-light">{tag.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {item.source && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">来源</h3>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">{item.source}</p>
        </div>
      )}

      {editorOpen && (
        <EquipmentEditor
          item={item}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">确认删除</h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确定要删除 "{item.name}" 吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(false)} disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10 disabled:opacity-50">
                取消
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80 disabled:opacity-50">
                {saving ? '删除中...' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
