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
  Hand,
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
import { useEquipmentActions } from '@/hooks/useEquipmentActions';

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

  

  // 新增：视图模式
  const [viewMode, setViewMode] = useState<'inventory' | 'equipped'>('inventory');
  // 新增：选择弹窗状态
  const [selectingSlot, setSelectingSlot] = useState<'armor' | 'outfit' | null>(null);
  // 手持选择弹窗状态
  const [selectingHand, setSelectingHand] = useState<'left' | 'right' | null>(null);

  useEditorState(equipmentEditorOpen, equipmentPickerOpen);

  const reloadChar = () => {
    forceUpdate((n) => n + 1);
  };

  const {
  handleAddEquipmentFromLibrary: hookHandleAddEquipmentFromLibrary,
  handleSaveEquipment: hookHandleSaveEquipment,
  handleDeleteEquipment: hookHandleDeleteEquipment,
  handleUpdateEquipmentQuantity: hookHandleUpdateEquipmentQuantity,
} = useEquipmentActions(id, reloadChar);
  
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
  const qty = item.quantity || 1;
  const weight = item.weight || 0;
  if (item.packSize && item.packSize > 0) {
    return sum + (weight / item.packSize) * qty;
  }
  return sum + weight * qty;
}, 0);

const totalValue = character.equipment.reduce(
  (sum, item) => {
    const amount = item.price?.amount || 0;
    const qty = item.quantity || 1;
    let effectiveAmount: number;
    if (item.packSize && item.packSize > 0) {
      effectiveAmount = (amount / item.packSize) * qty;
    } else {
      effectiveAmount = amount * qty;
    }
    if (item.price?.unit === 'gp') sum.gp += effectiveAmount;
    else if (item.price?.unit === 'sp') sum.sp += effectiveAmount;
    else if (item.price?.unit === 'cp') sum.cp += effectiveAmount;
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

  const handleAddEquipmentFromLibrary = (item: EquipmentItem) => {
  if (!id) return;
  const temp = hookHandleAddEquipmentFromLibrary(item);
  if (temp) {
    setEditingEquipment(temp);
    setEquipmentEditorOpen(true);
    setEquipmentPickerOpen(false);
  }
};

const handleDeleteEquipmentConfirm = () => {
  if (!deleteConfirmId) return;
  hookHandleDeleteEquipment(deleteConfirmId);
  setDeleteConfirmId(null);
};

const handleUpdateEquipmentQuantity = (equipId: string, delta: number) => {
  hookHandleUpdateEquipmentQuantity(equipId, delta);
};
 
  // --- 穿戴管理相关函数 ---
  const handleWearSelect = (item: Equipment) => {
    if (!id || !selectingSlot) return;
    characterStore.wearEquipment(id, item.id!);
    reloadChar();
    setSelectingSlot(null);
  };

  const handleUnequip = (slot: 'armor' | 'outfit') => {
    if (!id) return;
    const equipId = slot === 'armor' ? character.wornArmorId : character.wornOutfitId;
    if (equipId) {
      characterStore.unwearEquipment(id, equipId);
      reloadChar();
    }
  };

  const armorItem = character.equipment.find(e => (e.childId || e.id) === character.wornArmorId);
  const outfitItem = character.equipment.find(e => (e.childId || e.id) === character.wornOutfitId);
  const armorCandidates = character.equipment.filter(e => e.category === '护甲');
  const outfitCandidates = character.equipment.filter(e => e.category === '杂物' && e.subtype === '服装');

  // 手持物品
  const heldLeftItem = character.equipment.find(e => (e.childId || e.id) === character.heldLeft.equipmentId);
  const heldRightItem = character.equipment.find(e => (e.childId || e.id) === character.heldRight.equipmentId);
  const leftUsable = characterStore.isWeaponUsable(character, 'left');
  const rightUsable = characterStore.isWeaponUsable(character, 'right');

  // 可手持的装备候选（排除已穿戴的盔甲/服装）
  const holdableCandidates = useMemo(() => {
    return character.equipment.filter(item => {
      const slotId = item.childId || item.id;
      if (character.wornArmorId === slotId) return false;
      if (character.wornOutfitId === slotId) return false;
      return true;
    });
  }, [character.equipment, character.wornArmorId, character.wornOutfitId]);

  // 手持选择处理
  const handleHoldSelect = (item: Equipment) => {
    if (!id || !selectingHand) return;
    const result = characterStore.holdItem(id, item.id!, selectingHand);
    if (result.success) {
      reloadChar();
      setSelectingHand(null);
    } else {
      alert(result.message);
    }
  };

  // 放下手持物品
  const handleUnhold = (hand: 'left' | 'right' | 'both') => {
    if (!id) return;
    const result = characterStore.unholdItem(id, hand);
    if (result.success) {
      reloadChar();
    } else {
      alert(result.message);
    }
  };

  // 设置动作占位
  const handleSetAction = (hand: 'left' | 'right' | 'both') => {
    if (!id) return;
    const result = characterStore.setHandAction(id, hand);
    if (result.success) {
      reloadChar();
    } else {
      alert(result.message);
    }
  };

  // 结束动作
  const handleEndAction = (hand: 'left' | 'right' | 'both') => {
    if (!id) return;
    const result = characterStore.endHandAction(id, hand);
    if (result.success) {
      reloadChar();
    } else {
      alert(result.message);
    }
  };

  // 设置不可用
  const handleSetUnavailable = (hand: 'left' | 'right' | 'both') => {
    if (!id) return;
    const result = characterStore.setHandUnavailable(id, hand);
    if (result.success) {
      reloadChar();
    } else {
      alert(result.message);
    }
  };

  // 恢复不可用的手
  const handleRestoreHand = (hand: 'left' | 'right' | 'both') => {
    if (!id) return;
    const result = characterStore.restoreHand(id, hand);
    if (result.success) {
      reloadChar();
    } else {
      alert(result.message);
    }
  };

  return (
    <div className={`min-h-screen flex dark:bg-bg-dark light:bg-bg-light-1 ${readOnly ? 'read-only-mode' : ''}`}>
      {/* 侧边栏 */}
<div className="w-16 md:w-20 border-r dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light flex flex-col items-center py-4 gap-2">
  {!readOnly ? (
    <button
      onClick={() => navigate(`/characters/${id}`)}
      className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light mb-1"
      title="返回角色卡"
    >
      <ChevronLeft className="w-4 h-4" />
    </button>
  ) : (
    <Link
      to={`/player/${character?.id}`}
      className="p-2 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light mb-1"
      title="返回角色卡"
    >
      <ArrowLeft className="w-4 h-4" />
    </Link>
  )}

  {/* 状态栏按钮 */}
  <button
    data-readonly-keep
    onClick={() => {
      setViewMode(viewMode === 'equipped' ? 'inventory' : 'equipped');
      setSelectedCategory('all');
    }}
    className={`w-12 h-12 md:w-14 md:h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
      viewMode === 'equipped'
        ? 'bg-primary/20 text-primary'
        : 'hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted'
    }`}
    title="状态栏"
  >
    <Shield className="w-5 h-5" />
    <span className="text-xs leading-none">状态栏</span>
  </button>

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
        onClick={() => {
          setSelectedCategory(cat.key);
          setViewMode('inventory');
        }}
        className={`w-12 h-12 md:w-14 md:h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
          selectedCategory === cat.key
            ? 'bg-primary/20 text-primary'
            : 'hover:bg-white/10 dark:text-text-dark-muted light:text-text-light-muted'
        }`}
        title={cat.label}
      >
        <Icon className="w-5 h-5" />
        <span className="text-xs leading-none">{count}</span>
      </button>
    );
  })}
</div>



      {/* 主内容 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {viewMode === 'inventory' ? (
          /* ---- 背包视图 ---- */
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
              {
                filteredEquipment.length === 0 ? (
                <div className="text-center py-16 dark:text-text-dark-muted light:text-text-light-muted">
                  没有装备
                </div>
              ) : (
                filteredEquipment.map((item) => {
  const keyId = (item as any).childId || item.id;
  const heldHand: 'L' | 'R' | null =
    character.heldLeft.equipmentId === keyId ? 'L' :
    character.heldRight.equipmentId === keyId ? 'R' : null;
  return (
    <CharacterEquipmentCard
      key={keyId}
      item={item as Equipment & { id: string }}
      characterId={id}
      onEdit={handleEditEquipment}
      onDelete={setDeleteConfirmId}
      onUpdateQuantity={handleUpdateEquipmentQuantity}
      onRefresh={reloadChar}
      showQuantity={true}
      heldHand={heldHand}
      onHeldLabelClick={() => setViewMode('equipped')}
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
        ) : (
          /* ---- 穿戴管理视图 ---- */
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2 dark:text-text-dark light:text-text-light">
                <Shield className="w-7 h-7 text-primary" />
                穿戴管理
              </h2>
            </div>

            {/* 护甲位 */}
            <div className="rounded-lg border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-info" />
                  <span className="font-semibold dark:text-text-dark light:text-text-light">护甲位</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectingSlot('armor')}
                    className="px-3 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    更换
                  </button>
                  {armorItem && (
                    <button
                      onClick={() => handleUnequip('armor')}
                      className="px-3 py-1 text-xs rounded-lg bg-danger/10 text-danger hover:bg-danger/20"
                    >
                      卸下
                    </button>
                  )}
                </div>
              </div>
              {armorItem ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{armorItem.name}</div>
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">AC {armorItem.acBase}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm italic dark:text-text-dark-muted light:text-text-light-muted">空</div>
              )}
            </div>

            {/* 服饰位 */}
            <div className="rounded-lg border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-accent" />
                  <span className="font-semibold dark:text-text-dark light:text-text-light">服饰位</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectingSlot('outfit')}
                    className="px-3 py-1 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    更换
                  </button>
                  {outfitItem && (
                    <button
                      onClick={() => handleUnequip('outfit')}
                      className="px-3 py-1 text-xs rounded-lg bg-danger/10 text-danger hover:bg-danger/20"
                    >
                      卸下
                    </button>
                  )}
                </div>
              </div>
              {outfitItem ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{outfitItem.name}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm italic dark:text-text-dark-muted light:text-text-light-muted">空</div>
              )}
            </div>

            {/* 手持槽 */}
            <div className="rounded-lg border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Hand className="w-5 h-5 text-warning" />
                  <span className="font-semibold dark:text-text-dark light:text-text-light">手持装备</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* 左手 */}
                {(() => {
                  const slot = character.heldLeft;
                  const isUnavailable = slot.state === 'unavailable';
                  const isAction = slot.state === 'action';
                  const isReady = slot.state === 'ready';
                  const usable = leftUsable;
                  const twoHanded = heldLeftItem && characterStore.isTwoHandedWeapon(heldLeftItem);
                  return (
                    <div className={`rounded-lg border p-3 ${
                      isUnavailable
                        ? 'border-danger/40 bg-danger/5'
                        : isAction
                        ? 'border-accent/40 bg-accent/5'
                        : 'dark:border-border-dark light:border-border-light'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">左手</span>
                        {!readOnly && (
                          <div className="flex gap-1">
                            {isUnavailable ? (
                              <button
                                onClick={() => handleRestoreHand('left')}
                                className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20"
                              >
                                恢复
                              </button>
                            ) : isAction ? (
                              <button
                                onClick={() => handleEndAction('left')}
                                className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent hover:bg-accent/20"
                              >
                                结束
                              </button>
                            ) : heldLeftItem ? (
                              <button
                                onClick={() => handleUnhold('left')}
                                className="px-2 py-0.5 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20"
                              >
                                放下
                              </button>
                            ) : isReady && (
                              <button
                                onClick={() => setSelectingHand('left')}
                                className="p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                                title="拿取装备"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {isUnavailable ? (
                        <div className="text-sm font-medium text-danger">不可用</div>
                      ) : isAction ? (
                        <div className="text-sm font-medium text-accent">动作中</div>
                      ) : heldLeftItem ? (
                        <div
                          onClick={() => !readOnly && isReady && setSelectingHand('left')}
                          className={!readOnly && isReady ? 'cursor-pointer' : ''}
                        >
                          <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{heldLeftItem.name}</div>
                          <div className="flex gap-1 mt-1">
                            {twoHanded && usable && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">双手可用</span>
                            )}
                            {twoHanded && !usable && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">仅拿持</span>
                            )}
                            {!twoHanded && usable && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">可用</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm italic dark:text-text-dark-muted light:text-text-light-muted">待用</div>
                      )}
                    </div>
                  );
                })()}
                {/* 右手 */}
                {(() => {
                  const slot = character.heldRight;
                  const isUnavailable = slot.state === 'unavailable';
                  const isAction = slot.state === 'action';
                  const isReady = slot.state === 'ready';
                  const usable = rightUsable;
                  const twoHanded = heldRightItem && characterStore.isTwoHandedWeapon(heldRightItem);
                  return (
                    <div className={`rounded-lg border p-3 ${
                      isUnavailable
                        ? 'border-danger/40 bg-danger/5'
                        : isAction
                        ? 'border-accent/40 bg-accent/5'
                        : 'dark:border-border-dark light:border-border-light'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">右手</span>
                        {!readOnly && (
                          <div className="flex gap-1">
                            {isUnavailable ? (
                              <button
                                onClick={() => handleRestoreHand('right')}
                                className="px-2 py-0.5 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20"
                              >
                                恢复
                              </button>
                            ) : isAction ? (
                              <button
                                onClick={() => handleEndAction('right')}
                                className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent hover:bg-accent/20"
                              >
                                结束
                              </button>
                            ) : heldRightItem ? (
                              <button
                                onClick={() => handleUnhold('right')}
                                className="px-2 py-0.5 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20"
                              >
                                放下
                              </button>
                            ) : isReady && (
                              <button
                                onClick={() => setSelectingHand('right')}
                                className="p-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                                title="拿取装备"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {isUnavailable ? (
                        <div className="text-sm font-medium text-danger">不可用</div>
                      ) : isAction ? (
                        <div className="text-sm font-medium text-accent">动作中</div>
                      ) : heldRightItem ? (
                        <div
                          onClick={() => !readOnly && isReady && setSelectingHand('right')}
                          className={!readOnly && isReady ? 'cursor-pointer' : ''}
                        >
                          <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{heldRightItem.name}</div>
                          <div className="flex gap-1 mt-1">
                            {twoHanded && usable && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">双手可用</span>
                            )}
                            {twoHanded && !usable && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">仅拿持</span>
                            )}
                            {!twoHanded && usable && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">可用</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm italic dark:text-text-dark-muted light:text-text-light-muted">待用</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 当前 AC */}
            <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted">
              当前护甲等级：<span className="font-bold text-xl dark:text-text-dark light:text-text-light">{character.armorClass}</span>
            </div>

            {/* 选择弹窗 */}
            {selectingSlot && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => setSelectingSlot(null)} />
                <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light">
                    选择{selectingSlot === 'armor' ? '护甲' : '服饰'}
                  </h3>
                  <div className="space-y-2">
                    {(selectingSlot === 'armor' ? armorCandidates : outfitCandidates).length === 0 ? (
                      <div className="text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
                        背包中没有符合条件的装备
                      </div>
                    ) : (
                      (selectingSlot === 'armor' ? armorCandidates : outfitCandidates).map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleWearSelect(item)}
                          className="w-full text-left p-3 rounded-lg hover:bg-primary/10 transition-colors dark:text-text-dark light:text-text-light"
                        >
                          <div className="font-medium">{item.name}</div>
                          {selectingSlot === 'armor' && item.acBase && (
                            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">AC {item.acBase}</div>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <button
                    onClick={() => setSelectingSlot(null)}
                    className="mt-4 w-full py-2 text-sm rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 手持装备选择弹窗 */}
            {selectingHand && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/50" onClick={() => setSelectingHand(null)} />
                <div className="relative w-full max-w-md rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
                  <h3 className="text-lg font-bold mb-4 dark:text-text-dark light:text-text-light">
                    选择{selectingHand === 'left' ? '左手' : '右手'}装备
                  </h3>
                  <div className="space-y-2">
                    {/* 特殊占位选项 */}
                    <div className="flex gap-2 pb-3 mb-1 border-b dark:border-border-dark light:border-border-light">
                      <button
                        onClick={() => { handleSetAction(selectingHand); setSelectingHand(null); }}
                        className="flex-1 py-2 text-sm rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                      >
                        动作
                      </button>
                      <button
                        onClick={() => { handleSetUnavailable(selectingHand); setSelectingHand(null); }}
                        className="flex-1 py-2 text-sm rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                      >
                        不可用
                      </button>
                    </div>
                    {/* 装备列表 */}
                    {holdableCandidates.length === 0 ? (
                      <div className="text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
                        背包中没有可手持的装备
                      </div>
                    ) : (
                      holdableCandidates.map(item => {
                        const keyId = item.childId || item.id;
                        const twoHanded = characterStore.isTwoHandedWeapon(item);
                        return (
                          <button
                            key={keyId}
                            onClick={() => handleHoldSelect(item)}
                            className="w-full text-left p-3 rounded-lg hover:bg-primary/10 transition-colors dark:text-text-dark light:text-text-light"
                          >
                            <div className="font-medium flex items-center gap-2">
                              {item.name}
                              {twoHanded && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">双手</span>
                              )}
                            </div>
                            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                              {item.category || '—'}
                              {item.subtype && ` · ${item.subtype}`}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    onClick={() => setSelectingHand(null)}
                    className="mt-4 w-full py-2 text-sm rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {equipmentEditorOpen && (
        <EquipmentEditor
          item={editingEquipment ? ({
  id: editingEquipment.id,
  childId: (editingEquipment as any).childId,
  ...extractBaseFields(editingEquipment),
  isCustom: true,
  quantity: editingEquipment.quantity,
} as any) : undefined}


          showQuantity={true}
          showPackSize={true}
          showSyncOption={true}
          onSave={(formData, syncToLibrary) => {
  hookHandleSaveEquipment(editingEquipment, formData, syncToLibrary, () => {
    setEquipmentEditorOpen(false);
    setEditingEquipment(null);
  });
}}

          onDelete={editingEquipment && !editingEquipment.id.startsWith('temp-') ? () => {
  const equipId = (editingEquipment as any).childId || editingEquipment.id;
  hookHandleDeleteEquipment(equipId);
  setEquipmentEditorOpen(false);
  setEditingEquipment(null);
} : undefined}

          onClose={() => {
            setEquipmentEditorOpen(false);
            setEditingEquipment(null);
          }}
        />
      )}
      
      {equipmentPickerOpen && (
  <EquipmentPicker
    onSelect={handleAddEquipmentFromLibrary}
    onClose={() => setEquipmentPickerOpen(false)}
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
