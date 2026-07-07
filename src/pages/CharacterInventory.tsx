import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEditorState } from '@/data/editorState';
import {
  ChevronLeft,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Scale,
  Coins,
  ArrowUpDown,
  Package,
  Swords,
  Shield,
  FlaskConical,
  Wand2,
  Wrench,
  Package as PackageIcon,
  MoreHorizontal,
  Minus,
  ArrowLeft,
} from 'lucide-react';
import EquipmentEditor from '@/components/EquipmentEditor';
import EquipmentPicker from '@/components/EquipmentPicker';
import SyncButton from '@/components/SyncButton';
import { characterStore } from '@/data/characterStore';
import { apiFetch } from '@/lib/api';
import { equipmentStore } from '@/data/equipmentStore';
import type { Equipment, Character } from '@/types/character';
import type { EquipmentItem } from '@/types/equipment';
import { extractBaseFields } from '@/data/equipmentFactory';
import CharacterEquipmentCard from '@/components/CharacterEquipmentCard';

const CATEGORIES = [
  { key: 'all', label: '所有', icon: Package },
  { key: '武器', label: '武器', icon: Swords },
  { key: '护甲', label: '护甲', icon: Shield },
  { key: '药水', label: '药水', icon: FlaskConical },
  { key: '法器', label: '法器', icon: Wand2 },
  { key: '工具', label: '工具', icon: Wrench },
  { key: '杂物', label: '杂物', icon: PackageIcon },
  { key: '自定义', label: '自定义', icon: MoreHorizontal },
];

export default function CharacterInventory({
  readOnly = false,
  externalCharacter = null,
}: {
  readOnly?: boolean;
  externalCharacter?: Character | null;
} = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const character = externalCharacter || (id ? characterStore.get(id) : null);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedEquipment, setExpandedEquipment] = useState<Set<string>>(new Set());
  const [equipmentEditorOpen, setEquipmentEditorOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<(Equipment & { id: string }) | null>(null);
  const [equipmentPickerOpen, setEquipmentPickerOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  useEditorState(equipmentEditorOpen, equipmentPickerOpen);

  const reloadChar = () => {
    forceUpdate((n) => n + 1);
  };

  if (!character) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center dark:text-text-dark-muted light:text-text-light-muted">
        角色不存在
      </div>
    );
  }

  const filteredEquipment = useMemo(() => {
    if (selectedCategory === 'all') {
      return character.equipment;
    }
    return character.equipment.filter((item) => item.category === selectedCategory);
  }, [character.equipment, selectedCategory]);

  const totalWeight = character.equipment.reduce((sum, item) => {
    return sum + (item.weight || 0) * (item.quantity || 1);
  }, 0);

  const totalValue = character.equipment.reduce(
    (sum, item) => {
      const amount = item.price?.amount || 0;
      const qty = item.quantity || 1;
      if (item.price?.unit === 'gp') sum.gp += amount * qty;
      else if (item.price?.unit === 'sp') sum.sp += amount * qty;
      else if (item.price?.unit === 'cp') sum.cp += amount * qty;
      return sum;
    },
    { gp: 0, sp: 0, cp: 0 }
  );

  const totalCp = totalValue.gp * 100 + totalValue.sp * 10 + totalValue.cp;
  const gp = Math.floor(totalCp / 100);
  const sp = Math.floor((totalCp % 100) / 10);
  const cp = totalCp % 10;

  const handleSortEquipment = () => {
    if (!id || !character) return;
    const categoryOrder = ['武器', '护甲', '法器', '工具', '药水', '杂物'];
    const sorted = [...character.equipment].sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.category || '');
      const bIndex = categoryOrder.indexOf(b.category || '');
      const aRank = aIndex === -1 ? categoryOrder.length : aIndex;
      const bRank = bIndex === -1 ? categoryOrder.length : bIndex;
      if (aRank !== bRank) return aRank - bRank;
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
    characterStore.update(id, { equipment: sorted });
    reloadChar();
  };

  const toggleEquipmentExpand = (equipId: string) => {
    const next = new Set(expandedEquipment);
    if (next.has(equipId)) {
      next.delete(equipId);
    } else {
      next.add(equipId);
    }
    setExpandedEquipment(next);
  };

  const handleAddEquipment = () => {
    setEditingEquipment(null);
    setEquipmentEditorOpen(true);
  };

  const handleEditEquipment = (item: Equipment & { id: string }) => {
    setEditingEquipment(item);
    setEquipmentEditorOpen(true);
  };

  const handleSaveEquipment = async (formData: EquipmentItem & { quantity?: number }, syncToLibrary?: boolean) => {
    if (!id) return;

const libraryItem: EquipmentItem = {
  id: formData.id,
  ...extractBaseFields(formData),
  isCustom: false,
};

if (syncToLibrary) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    await apiFetch(`/equipments/${formData.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(libraryItem),
    });
  } catch {
    const finalId = formData.id.startsWith('temp-')
      ? formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')
      : formData.id;
    await apiFetch('/equipments', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...libraryItem, id: finalId }),
    });
  }
}

if (!editingEquipment) {
  characterStore.addEquipment(id, {
    quantity: formData.quantity || 1,
    ...extractBaseFields(formData),
  });

} else if (editingEquipment.id.startsWith('temp-')) {
  characterStore.addEquipment(id, {
    quantity: formData.quantity || 1,
    ...extractBaseFields(formData),
  });

  } else if (editingEquipment) {
    characterStore.updateEquipment(id, editingEquipment.id, {
      quantity: formData.quantity,
      ...extractBaseFields(formData),
    });
  }

  reloadChar();
  setEquipmentEditorOpen(false);
  setEditingEquipment(null);
};


  const handleDeleteEquipmentConfirm = () => {
    if (!id || !deleteConfirmId) return;
    characterStore.deleteEquipment(id, deleteConfirmId);
    reloadChar();
    setDeleteConfirmId(null);
  };

  const handleUpdateEquipmentQuantity = (equipId: string, delta: number) => {
    if (!id) return;
    const equip = character.equipment.find((e) => e.id === equipId);
    if (!equip) return;
    const newQty = Math.max(1, (equip.quantity || 1) + delta);
    characterStore.updateEquipment(id, equipId, { quantity: newQty });
    reloadChar();
  };

  const handleAddEquipmentFromLibrary = (item: EquipmentItem) => {
  if (!id) return;
  characterStore.addEquipment(id, {
    quantity: 1,
    ...extractBaseFields(item),
  });
  reloadChar();
  setEquipmentPickerOpen(false);
};

  return (
    <div className={`min-h-screen flex dark:bg-bg-dark light:bg-bg-light-1 ${readOnly ? 'read-only-mode' : ''}`}>
      {/* 侧边栏 */}
      <div className="w-20 md:w-24 border-r dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light flex flex-col items-center py-4 gap-2">
        {!readOnly ? (
          <button
            onClick={() => navigate(`/characters/${id}`)}
            className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light mb-2"
            title="返回角色卡"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <Link
            to={`/player/${character?.id}`}
            className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light mb-2"
            title="返回角色卡"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const count =
            cat.key === 'all'
              ? character.equipment.length
              : character.equipment.filter((e) => e.category === cat.key).length;
          return (
            <button
              data-readonly-keep
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
                selectedCategory === cat.key
                  ? 'bg-primary/20 text-primary'
                  : 'hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted'
              }`}
              title={cat.label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {/* 主内容 */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <Package className="w-7 h-7 text-primary" />
                背包
              </h1>
              <p className="mt-1 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                {selectedCategory === 'all'
                  ? `共 ${character.equipment.length} 件装备`
                  : `${selectedCategory}：${filteredEquipment.length} 件`}
              </p>
            </div>
            <div className="flex gap-2">
              {!readOnly && (
                <>
                  <button
                    onClick={handleAddEquipment}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary-dark"
                  >
                    <Plus className="w-4 h-4" />
                    新增
                  </button>
                  <button
                    onClick={() => setEquipmentPickerOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary/10"
                  >
                    从装备库
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedCategory === 'all' && !readOnly && (
            <div className="flex justify-end">
              <button
                onClick={handleSortEquipment}
                className="px-3 py-1.5 text-sm rounded-lg bg-primary hover:bg-primary-dark text-white transition-colors flex items-center gap-1.5"
              >
                <ArrowUpDown className="w-4 h-4" />
                整理背包
              </button>
            </div>
          )}

          <div className="space-y-2">
            {filteredEquipment.length === 0 ? (
              <div className="text-center py-16 dark:text-text-dark-muted light:text-text-light-muted">
                没有装备
              </div>
            ) : (
                filteredEquipment.map((item) => {
  const itemId = item.id!;
  return (
    <CharacterEquipmentCard
      key={itemId}
      item={{ ...item, id: itemId }}
      onEdit={handleEditEquipment}
      onDelete={setDeleteConfirmId}
      onUpdateQuantity={handleUpdateEquipmentQuantity}
      showQuantity={true}
    />
  );
})
                                          
             )}
          </div>

          {/* 底部统计 */}
          <div className="pt-4 border-t dark:border-border-dark/50 light:border-border-light/50 space-y-2 text-sm">
            <div className="flex items-center justify-between dark:text-text-dark-muted light:text-text-light-muted">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4" />
                <span>总负重</span>
              </div>
              <span className="font-medium dark:text-text-dark light:text-text-light">
                {totalWeight} 磅
              </span>
            </div>
            <div className="flex items-center justify-between dark:text-text-dark-muted light:text-text-light-muted">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4" />
                <span>总价值</span>
              </div>
              <span className="font-medium dark:text-text-dark light:text-text-light">
                {gp > 0 && <span>{gp} gp </span>}
                {sp > 0 && <span>{sp} sp </span>}
                {cp > 0 && <span>{cp} cp</span>}
                {gp === 0 && sp === 0 && cp === 0 && <span>0 cp</span>}
              </span>
            </div>
          </div>
        </div>
      </div>

      {equipmentEditorOpen && (
  <EquipmentEditor
    item={editingEquipment ? {
      id: editingEquipment.id,
      ...extractBaseFields(editingEquipment),
      isCustom: true,
      quantity: editingEquipment.quantity,
    } : undefined}
    showQuantity={true}
    showSyncOption={true}
    onSave={handleSaveEquipment}
    onDelete={editingEquipment && !editingEquipment.id.startsWith('temp-') ? () => {
      if (!id) return;
      characterStore.deleteEquipment(id, editingEquipment.id);
      reloadChar();
      setEquipmentEditorOpen(false);
      setEditingEquipment(null);
    } : undefined}
    onClose={() => {
      setEquipmentEditorOpen(false);
      setEditingEquipment(null);
    }}
  />
)}

        
    

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative w-full max-w-xs rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6">
            <h3 className="text-lg font-bold mb-4 text-center dark:text-text-dark light:text-text-light">
              确认删除
            </h3>
            <p className="text-sm text-center mb-6 dark:text-text-dark-muted light:text-text-light-muted">
              确定要删除这件装备吗？此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2 px-4 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:border-primary dark:hover:text-primary light:border-border-light light:text-text-light light:hover:border-primary light:hover:text-primary"
              >
                取消
              </button>
              <button
                onClick={handleDeleteEquipmentConfirm}
                className="flex-1 py-2 px-4 text-sm rounded-lg bg-danger text-white hover:bg-danger/80 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DM 模式下显示浮动同步按钮 */}
      {!readOnly && <SyncButton />}
    </div>
  );
}
