import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEditorState } from '@/data/editorState';
import { ChevronLeft, Edit, Trash2, Coins, Scale, Tag } from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import type { EquipmentItem } from '@/types/equipment';
import staticEquipments from '@/data/equipments.json';

const STORAGE_KEY = 'custom-equipments';

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<EquipmentItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [customEquipments, setCustomEquipments] = useState<EquipmentItem[]>([]);

  useEditorState(editorOpen);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setCustomEquipments(JSON.parse(stored));
      } catch {
        setCustomEquipments([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    
    // 先在自定义装备中查找
    const custom = customEquipments.find((e) => e.id === id);
    if (custom) {
      setItem(custom);
      return;
    }

    // 再在静态装备中查找
    const staticItem = (staticEquipments as EquipmentItem[]).find((e) => e.id === id);
    setItem(staticItem || null);
  }, [id, customEquipments]);

  const handleSave = (updatedItem: EquipmentItem) => {
    const existing = customEquipments.findIndex((e) => e.id === updatedItem.id);
    if (existing >= 0) {
      const updated = [...customEquipments];
      updated[existing] = updatedItem;
      setCustomEquipments(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } else {
      const updated = [...customEquipments, updatedItem];
      setCustomEquipments(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
    setItem(updatedItem);
    setEditorOpen(false);
  };

  const handleDelete = () => {
    if (!id) return;
    const updated = customEquipments.filter((e) => e.id !== id);
    setCustomEquipments(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    navigate('/equipment');
  };

  if (!item) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            to="/equipment"
            className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            装备详情
          </h1>
        </div>
        <div className="text-center py-12 dark:text-text-dark-muted light:text-text-light-muted">
          未找到该装备
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
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <Link
          to="/equipment"
          className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            {item.name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {item.category}
            </span>
            {item.subtype && (
              <>
                <span className="dark:text-text-dark-muted light:text-text-light-muted">·</span>
                <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  {item.subtype}
                </span>
              </>
            )}
            {item.isCustom && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-accent/20 text-accent">
                自定义
              </span>
            )}
          </div>
        </div>
        {item.isCustom && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditorOpen(true)}
              className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="p-2 rounded-lg hover:bg-danger/20 text-danger"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* 基本信息 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-1">
            <Coins className="w-4 h-4 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              价格
            </span>
          </div>
          <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">
            {formatPrice()}
          </p>
        </div>
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-4 h-4 text-accent" />
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              重量
            </span>
          </div>
          <p className="text-lg font-semibold dark:text-text-dark light:text-text-light">
            {item.weight} 磅
          </p>
        </div>
      </div>

      {/* 属性标签 */}
      {item.properties && item.properties.length > 0 && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
            属性
          </h3>
          <div className="flex flex-wrap gap-2">
            {item.properties.map((prop) => (
              <span
                key={prop}
                className="px-2 py-1 rounded bg-primary/20 text-primary text-sm"
              >
                {prop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 描述 */}
      {item.description && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
            描述
          </h3>
          <p className="text-sm dark:text-text-dark light:text-text-light whitespace-pre-wrap leading-relaxed">
            {item.description}
          </p>
        </div>
      )}

      {/* 自由标签 */}
      {item.tags && item.tags.length > 0 && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-medium dark:text-text-dark light:text-text-light">
              标签
            </h3>
          </div>
          <div className="space-y-2">
            {item.tags.map((tag, index) => (
              <div
                key={index}
                className="flex items-center gap-2 text-sm"
              >
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
                  {tag.key}
                </span>
                <span className="dark:text-text-dark light:text-text-light">
                  {tag.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 来源 */}
      {item.source && (
        <div className="p-4 rounded-lg dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
          <h3 className="text-sm font-medium mb-1 dark:text-text-dark light:text-text-light">
            来源
          </h3>
          <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            {item.source}
          </p>
        </div>
      )}

      {/* 编辑器模态框 */}
      {editorOpen && (
        <EquipmentEditor
          item={item}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-xl border p-6 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light max-w-sm w-full">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">
              确认删除
            </h3>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确定要删除 "{item.name}" 吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 rounded-lg bg-danger text-white hover:bg-danger/80"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
