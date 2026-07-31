import { useState, useEffect } from 'react';
import { X, Plus, ChevronDown, ChevronUp, Trash2, Hand, ScrollText, Minus } from 'lucide-react';
import { characterStore } from '@/data/characterStore';
import type { Combatant, NpcAttack, EquipmentChanges } from '@/types/combat';
import type { Character, Attack, Equipment } from '@/types/character';

interface Props {
  combatant: Combatant;
  onClose: () => void;
  combatants?: Combatant[];
  tokenMap?: { get: (id: string) => { col: number; row: number } | undefined };
  /** 可选：战斗背包（当在战斗场景下传入时，手持候选列表读它） */
  combatInventory?: Equipment[];
  /** 战斗场景下：从战斗背包删除物品（通过变更信息漏斗） */
  onRemoveItem?: (item: Equipment) => void;
  /** 该参战者的装备变更信息（漏斗） */
  equipmentChanges?: EquipmentChanges;
  /** 直接更新该参战者的变更信息（变更信息编辑弹窗用） */
  onUpdateChanges?: (changes: EquipmentChanges) => void;
}

export default function CombatantInfoPanel({ combatant, onClose, combatants = [], tokenMap, combatInventory, onRemoveItem, equipmentChanges, onUpdateChanges }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'status' | 'inventory' | 'actions'>('info');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAttackId, setSelectedAttackId] = useState<string | null>(null);
  const [expandedRangeAttackId, setExpandedRangeAttackId] = useState<string | null>(null);
  // 战斗背包筛选：分类药丸
  const [invFilter, setInvFilter] = useState<string>('全部');

  const character = combatant.characterId ? characterStore.get(combatant.characterId) : null;

  // 手持候选列表：战斗场景下（combatInventory 已传入）强制使用战斗背包；否则回退角色背包
  const inventoryForSelection: Equipment[] = combatInventory
    ? combatInventory
    : ((character?.equipment as Equipment[] | undefined) || []);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const attacks: (Attack | NpcAttack)[] = character?.attacks || combatant.attacks || [];
  const heldLeftId = character?.heldLeft?.equipmentId;
  const heldRightId = character?.heldRight?.equipmentId;
  // 手持物品：仅从战斗背包查找（战斗场景下），物品被消耗后自然为 null
  const heldLeftItem = heldLeftId
    ? (combatInventory
      ? combatInventory.find(e => (e.childId || e.id) === heldLeftId) ?? null
      : character?.equipment.find(e => (e.childId || e.id) === heldLeftId) ?? null)
    : null;
  const heldRightItem = heldRightId
    ? (combatInventory
      ? combatInventory.find(e => (e.childId || e.id) === heldRightId) ?? null
      : character?.equipment.find(e => (e.childId || e.id) === heldRightId) ?? null)
    : null;
  // 可用性：物品不存在于战斗背包时视为不可用
  const leftUsable = character && heldLeftItem ? characterStore.isWeaponUsable(character, 'left') : false;
  const rightUsable = character && heldRightItem ? characterStore.isWeaponUsable(character, 'right') : false;

  const handleHoldSelect = (item: Equipment, hand: 'left' | 'right') => {
    if (!character) return;
    const result = characterStore.holdItem(character.id, (item.childId || item.id)!, hand);
    if (!result.success) alert(result.message);
    setRefreshKey(k => k + 1);
  };

  const handleUnhold = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.unholdItem(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleSetAction = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.setHandAction(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleEndAction = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.endHandAction(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleSetUnavailable = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.setHandUnavailable(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleRestoreHand = (hand: 'left' | 'right' | 'both') => {
    if (!character) return;
    characterStore.restoreHand(character.id, hand);
    setRefreshKey(k => k + 1);
  };

  const [selectingHand, setSelectingHand] = useState<'left' | 'right' | null>(null);
  // 变更信息编辑弹窗
  const [showChangesEditor, setShowChangesEditor] = useState(false);

  // 变更信息条目（文字化 + 可编辑）
  // 获得的物品：added 列表 + 正向 quantityDeltas
  // 失去的物品：removedChildIds + 负向 quantityDeltas
  type ChangeEntry =
    | { kind: 'gained-added'; childId: string; name: string; quantity: number; category?: string }
    | { kind: 'gained-delta'; childId: string; name: string; quantity: number }
    | { kind: 'lost-removed'; childId: string; name: string }
    | { kind: 'lost-delta'; childId: string; name: string; quantity: number };

  // 通过 childId 从角色源装备查名称
  const nameByChildId = (cid: string): string => {
    const src = character?.equipment.find(e => (e.childId || e.id) === cid);
    return src?.name || '未知物品';
  };

  const changeEntries: ChangeEntry[] = (() => {
    if (!equipmentChanges) return [];
    const entries: ChangeEntry[] = [];
    for (const a of equipmentChanges.added) {
      const data = (a.equipment || {}) as Partial<Equipment>;
      entries.push({
        kind: 'gained-added',
        childId: a.childId,
        name: (data.name as string) || '未命名物品',
        quantity: (data.quantity as number) ?? 1,
        category: (data.category as string) || '杂项',
      });
    }
    for (const [cid, delta] of Object.entries(equipmentChanges.quantityDeltas)) {
      if (delta > 0) {
        entries.push({ kind: 'gained-delta', childId: cid, name: nameByChildId(cid), quantity: delta });
      } else if (delta < 0) {
        entries.push({ kind: 'lost-delta', childId: cid, name: nameByChildId(cid), quantity: -delta });
      }
    }
    for (const cid of equipmentChanges.removedChildIds) {
      entries.push({ kind: 'lost-removed', childId: cid, name: nameByChildId(cid) });
    }
    return entries;
  })();

  // 编辑操作：基于当前 equipmentChanges 派生新对象并回调
  const commitChanges = (next: EquipmentChanges) => {
    onUpdateChanges?.({
      added: next.added,
      removedChildIds: next.removedChildIds,
      quantityDeltas: next.quantityDeltas,
    });
  };

  // 调整 added 物品数量
  const setAddedQty = (childId: string, qty: number) => {
    if (!equipmentChanges) return;
    const q = Math.max(1, Math.floor(qty) || 1);
    const next: EquipmentChanges = {
      ...equipmentChanges,
      added: equipmentChanges.added.map(a =>
        a.childId === childId
          ? { ...a, equipment: { ...a.equipment, quantity: q } }
          : a
      ),
    };
    commitChanges(next);
  };
  // 删除 added 条目
  const removeAdded = (childId: string) => {
    if (!equipmentChanges) return;
    commitChanges({
      ...equipmentChanges,
      added: equipmentChanges.added.filter(a => a.childId !== childId),
    });
  };
  // 调整 quantityDeltas（正数获得 / 负数失去）
  const setDelta = (childId: string, qty: number, isGained: boolean) => {
    if (!equipmentChanges) return;
    const q = Math.max(0, Math.floor(qty) || 0);
    const newDelta = isGained ? q : -q;
    const next: EquipmentChanges = {
      ...equipmentChanges,
      quantityDeltas: { ...equipmentChanges.quantityDeltas },
    };
    if (q === 0) {
      delete next.quantityDeltas[childId];
    } else {
      next.quantityDeltas[childId] = newDelta;
    }
    commitChanges(next);
  };
  // 移除 quantityDelta 条目
  const removeDelta = (childId: string) => {
    if (!equipmentChanges) return;
    const next: EquipmentChanges = {
      ...equipmentChanges,
      quantityDeltas: { ...equipmentChanges.quantityDeltas },
    };
    delete next.quantityDeltas[childId];
    commitChanges(next);
  };
  // 移除 removedChildId 条目（恢复物品）
  const removeRemoved = (childId: string) => {
    if (!equipmentChanges) return;
    commitChanges({
      ...equipmentChanges,
      removedChildIds: equipmentChanges.removedChildIds.filter(c => c !== childId),
    });
  };

  const hasAnyChanges = changeEntries.length > 0;
  // 手持候选列表：优先使用战斗背包，否则回退到角色背包
  const holdableCandidates = (() => {
    const list = inventoryForSelection;
    return list.filter(item => {
      const slotId = item.childId || item.id;
      if (character && character.wornArmorId === slotId) return false;
      if (character && character.wornOutfitId === slotId) return false;
      return true;
    });
  })();

  const handleHoldItemSelect = (item: Equipment) => {
    if (!selectingHand) return;
    handleHoldSelect(item, selectingHand);
    setSelectingHand(null);
  };

  const hpPercent = combatant.maxHp && combatant.maxHp > 0
    ? Math.max(0, (combatant.currentHp || 0) / combatant.maxHp * 100)
    : 0;

  const getHpColor = () => {
    if (hpPercent > 50) return 'bg-green-500';
    if (hpPercent > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const isAttackUsable = (attack: Attack | NpcAttack): boolean => {
    // NPC 没有手持状态，攻击默认可用
    if (!character) return true;
    const leftMatch = heldLeftItem && heldLeftItem.name === attack.name;
    const rightMatch = heldRightItem && heldRightItem.name === attack.name;
    return (leftMatch && leftUsable) || (rightMatch && rightUsable);
  };

  const isRangedWeapon = (attack: Attack | NpcAttack): boolean => {
    // 优先检查子分类
    if (attack.subtype) {
      if (attack.subtype.includes('远程') || attack.subtype.includes('弹药')) return true;
    }
    // 再检查常规/最大射程字段（有这两个字段的武器视为远程）
    if (attack.normalRange !== undefined && attack.normalRange > 0) return true;
    if (attack.maxRange !== undefined && attack.maxRange > 0) return true;
    return false;
  };

  const isThrownWeapon = (attack: Attack | NpcAttack): boolean => {
    // 优先检查子分类
    if (attack.subtype && attack.subtype.includes('投掷')) return true;
    // 再检查属性
    if (attack.properties) {
      return attack.properties.some(p => p.includes('投掷'));
    }
    return false;
  };

  const hasMultipleRanges = (attack: Attack | NpcAttack): boolean => {
    const meleeRange = attack.range && !attack.range.startsWith('-');
    const hasNormal = attack.normalRange !== undefined && attack.normalRange > 0;
    const hasMax = attack.maxRange !== undefined && attack.maxRange > 0;
    let count = 0;
    if (meleeRange && (!isRangedWeapon(attack) || isThrownWeapon(attack))) count++;
    if (hasNormal) count++;
    if (hasMax) count++;
    return count > 1;
  };

  const getRangeInfo = (attack: Attack | NpcAttack): { label: string; value: string; feet: number }[] => {
    const ranges: { label: string; value: string; feet: number }[] = [];
    const meleeRange = attack.range;
    const hasNormal = attack.normalRange !== undefined && attack.normalRange > 0;
    const hasMax = attack.maxRange !== undefined && attack.maxRange > 0;
    const isRanged = isRangedWeapon(attack);
    const isThrown = isThrownWeapon(attack);

    if (meleeRange && !meleeRange.startsWith('-') && (!isRanged || isThrown)) {
      const meleeMatch = meleeRange.match(/(\d+)/);
      const meleeFeet = meleeMatch ? parseInt(meleeMatch[1], 10) : 5;
      ranges.push({ label: '近战', value: meleeRange, feet: meleeFeet });
    }
    if (hasNormal) {
      ranges.push({ label: '常规', value: `${attack.normalRange}尺`, feet: attack.normalRange });
    }
    if (hasMax) {
      ranges.push({ label: '最大', value: `${attack.maxRange}尺`, feet: attack.maxRange });
    }
    return ranges;
  };

  const getNPCsInRange = (attack: Attack | NpcAttack, rangeIndex: number | null): Combatant[] => {
    if (!tokenMap || !combatant.id) return [];
    const attackerPos = tokenMap.get(combatant.id);
    if (!attackerPos) return [];

    const rangeInfo = getRangeInfo(attack);
    let maxRangeFeet: number;

    if (rangeIndex !== null && rangeIndex >= 0 && rangeIndex < rangeInfo.length) {
      maxRangeFeet = rangeInfo[rangeIndex].feet;
    } else {
      maxRangeFeet = rangeInfo.length > 0 ? rangeInfo[rangeInfo.length - 1].feet : 5;
    }

    const maxRangeCells = Math.max(1, Math.floor(maxRangeFeet / 5));

    return combatants.filter(c => {
      if (c.id === combatant.id) return false;
      if (c.isPc) return false;
      const pos = tokenMap.get(c.id);
      if (!pos) return false;
      const distance = Math.max(Math.abs(pos.col - attackerPos.col), Math.abs(pos.row - attackerPos.row));
      return distance <= maxRangeCells;
    });
  };

  const handleAttackSelect = (attackIdx: number) => {
    if (selectedAttackId === String(attackIdx)) {
      // 取消选中
      setSelectedAttackId(null);
      setExpandedRangeAttackId(null);
      setSelectedRangeIndex(null);
      return;
    }
    setSelectedAttackId(String(attackIdx));
    setExpandedRangeAttackId(String(attackIdx));
    // 自动选中最小包含敌人的射程
    const attack = attacks[attackIdx];
    if (attack) {
      const rangeInfo = getRangeInfo(attack);
      let autoIdx: number | null = null;
      for (let i = 0; i < rangeInfo.length; i++) {
        const npcs = getNPCsInRange(attack, i);
        if (npcs.length > 0) {
          autoIdx = i;
          break;
        }
      }
      // 若所有射程都无敌人也选中第一个（让用户看到禁用状态）
      if (autoIdx === null && rangeInfo.length > 0) autoIdx = 0;
      setSelectedRangeIndex(autoIdx);
    } else {
      setSelectedRangeIndex(null);
    }
  };

  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light">
          <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">
            {combatant.name}
            {combatant.isPc && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-info/20 text-info">PC</span>}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-danger/10 text-danger transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b dark:border-border-dark light:border-border-light">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'info'
                ? 'border-b-2 border-primary text-primary'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
            }`}
          >
            快捷
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'status'
                ? 'border-b-2 border-primary text-primary'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
            }`}
          >
            状态
          </button>
          {combatInventory && combatInventory.length > 0 && (
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                activeTab === 'inventory'
                  ? 'border-b-2 border-primary text-primary'
                  : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
              }`}
            >
              背包
            </button>
          )}
          <button
            onClick={() => setActiveTab('actions')}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === 'actions'
                ? 'border-b-2 border-primary text-primary'
                : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
            }`}
          >
            操作
          </button>
        </div>

        <div className="p-3 max-h-[50vh] overflow-y-auto">
          {activeTab === 'info' && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">HP</span>
                  <span className="dark:text-text-dark light:text-text-light">
                    {combatant.currentHp || 0} / {combatant.maxHp || 0}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full ${getHpColor()} transition-all`}
                    style={{ width: `${hpPercent}%` }}
                  />
                </div>
              </div>

              {combatant.tempHp !== undefined && combatant.tempHp > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">临时 HP</span>
                  <span className="text-accent font-medium">{combatant.tempHp}</span>
                </div>
              )}

              <div className="flex justify-between text-xs">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">AC</span>
                <span className="font-medium dark:text-text-dark light:text-text-light">
                  {character?.armorClass ?? combatant.ac ?? '—'}
                </span>
              </div>

              {attacks.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">攻击</div>
                  <div className="grid grid-cols-2 gap-2">
                    {attacks.map((attack, aIdx) => {
                      const usable = isAttackUsable(attack);
                      const selected = selectedAttackId === String(aIdx);
                      const hasMultiRange = hasMultipleRanges(attack);
                      const expanded = expandedRangeAttackId === String(aIdx);
                      const rangeInfo = getRangeInfo(attack);
                      const currentRangeIdx = selected ? selectedRangeIndex : null;
                      const npcsInRange = selected ? getNPCsInRange(attack, currentRangeIdx) : [];
                      const rangeNpcCounts = selected ? rangeInfo.map((_, idx) => getNPCsInRange(attack, idx).length) : [];

                      return (
                        <div key={aIdx} className={`${selected ? 'col-span-2' : ''}`}>
                          <button
                            onClick={() => handleAttackSelect(aIdx)}
                            className={`w-full text-left p-2.5 rounded-lg text-sm transition-all ${
                              selected
                                ? 'ring-2 ring-primary dark:bg-primary/10 light:bg-primary/10'
                                : usable
                                ? 'dark:bg-bg-dark light:bg-bg-light-2'
                                : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted/60 light:text-text-light-muted/60 opacity-60'
                            }`}
                          >
                            <div className="font-medium truncate flex items-center gap-2">
                              {attack.name}
                              {rangeInfo.length > 0 && (
                                <span className="flex-shrink-0">
                                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={usable ? 'text-primary' : 'dark:text-text-dark-muted/60 light:text-text-light-muted/60'}>{attack.attackBonus || '—'}</span>
                              <span>·</span>
                              <span>{attack.damage || '—'}</span>
                            </div>
                          </button>

                          {selected && attack.properties && attack.properties.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {attack.properties.map((prop, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                                >
                                  {prop}
                                </span>
                              ))}
                            </div>
                          )}

                          {selected && rangeInfo.length > 0 && (
                            <div className="mt-1 p-2.5 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                              <div className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted mb-2">射程信息</div>
                              <div className="flex flex-wrap gap-2">
                                {rangeInfo.map((r, idx) => {
                                  const npcCount = rangeNpcCounts[idx] || 0;
                                  const isDisabled = npcCount === 0;
                                  const isActive = currentRangeIdx === idx;
                                  return (
                                    <button
                                      key={idx}
                                      disabled={isDisabled}
                                      onClick={() => setSelectedRangeIndex(idx)}
                                      className={`text-sm px-2.5 py-1 rounded transition-colors ${
                                        isActive
                                          ? 'bg-info text-white'
                                          : isDisabled
                                          ? 'bg-gray-200/50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                          : 'bg-info/10 text-info hover:bg-info/20'
                                      }`}
                                    >
                                      {r.label}: {r.value}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {selected && npcsInRange.length > 0 && (
                            <div className="mt-1 p-2.5 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                              <div className="text-sm font-medium dark:text-text-dark-muted light:text-text-light-muted mb-2">射程内目标</div>
                              <div className="flex flex-wrap gap-1.5">
                                {npcsInRange.map(npc => (
                                  <div key={npc.id} className="flex items-center gap-1.5 text-sm px-2.5 py-1 rounded dark:bg-danger/10 light:bg-danger/5 text-danger">
                                    <span className="w-3 h-3 rounded-full bg-danger" />
                                    <span>{npc.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {attacks.length === 0 && (
                <div className="text-xs text-center py-4 dark:text-text-dark-muted light:text-text-light-muted">
                  暂无攻击方式
                </div>
              )}
            </div>
          )}

          {activeTab === 'status' && character && (
            <div className="space-y-3">
              <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">手持状态</div>
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const slot = character.heldLeft;
                  const isUnavailable = slot.state === 'unavailable';
                  const isAction = slot.state === 'action';
                  const isReady = slot.state === 'ready';
                  const usable = leftUsable;
                  const twoHanded = heldLeftItem && characterStore.isTwoHandedWeapon(heldLeftItem);
                  return (
                    <div className={`rounded-lg border p-2 ${
                      isUnavailable ? 'border-danger/40 bg-danger/5'
                        : isAction ? 'border-accent/40 bg-accent/5'
                        : 'dark:border-border-dark light:border-border-light'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">左手</span>
                        {isUnavailable ? (
                          <button onClick={() => handleRestoreHand('left')} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">恢复</button>
                        ) : isAction ? (
                          <button onClick={() => handleEndAction('left')} className="px-1.5 py-0.5 text-xs rounded bg-accent/10 text-accent">结束</button>
                        ) : heldLeftItem ? (
                          <button onClick={() => handleUnhold('left')} className="px-1.5 py-0.5 text-xs rounded bg-danger/10 text-danger">放下</button>
                        ) : isReady && (
                          <button onClick={() => setSelectingHand('left')} className="p-0.5 rounded bg-primary/10 text-primary" title="拿取装备">
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {isUnavailable ? (
                        <div className="text-xs text-danger">不可用</div>
                      ) : isAction ? (
                        <div className="text-xs text-accent">动作中</div>
                      ) : heldLeftItem ? (
                        <>
                          <div className="text-xs font-medium dark:text-text-dark light:text-text-light">{heldLeftItem.name}</div>
                          {twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">双手可用</span>}
                          {twoHanded && !usable && <span className="text-xs px-1 py-0.5 rounded bg-warning/20 text-warning">仅拿持</span>}
                          {!twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">可用</span>}
                        </>
                      ) : (
                        <div className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">待用</div>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  const slot = character.heldRight;
                  const isUnavailable = slot.state === 'unavailable';
                  const isAction = slot.state === 'action';
                  const isReady = slot.state === 'ready';
                  const usable = rightUsable;
                  const twoHanded = heldRightItem && characterStore.isTwoHandedWeapon(heldRightItem);
                  return (
                    <div className={`rounded-lg border p-2 ${
                      isUnavailable ? 'border-danger/40 bg-danger/5'
                        : isAction ? 'border-accent/40 bg-accent/5'
                        : 'dark:border-border-dark light:border-border-light'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">右手</span>
                        {isUnavailable ? (
                          <button onClick={() => handleRestoreHand('right')} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">恢复</button>
                        ) : isAction ? (
                          <button onClick={() => handleEndAction('right')} className="px-1.5 py-0.5 text-xs rounded bg-accent/10 text-accent">结束</button>
                        ) : heldRightItem ? (
                          <button onClick={() => handleUnhold('right')} className="px-1.5 py-0.5 text-xs rounded bg-danger/10 text-danger">放下</button>
                        ) : isReady && (
                          <button onClick={() => setSelectingHand('right')} className="p-0.5 rounded bg-primary/10 text-primary" title="拿取装备">
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {isUnavailable ? (
                        <div className="text-xs text-danger">不可用</div>
                      ) : isAction ? (
                        <div className="text-xs text-accent">动作中</div>
                      ) : heldRightItem ? (
                        <>
                          <div className="text-xs font-medium dark:text-text-dark light:text-text-light">{heldRightItem.name}</div>
                          {twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">双手可用</span>}
                          {twoHanded && !usable && <span className="text-xs px-1 py-0.5 rounded bg-warning/20 text-warning">仅拿持</span>}
                          {!twoHanded && usable && <span className="text-xs px-1 py-0.5 rounded bg-primary/20 text-primary">可用</span>}
                        </>
                      ) : (
                        <div className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">待用</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {activeTab === 'status' && !character && (
            <div className="space-y-3">
              <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">手持状态</div>
              <div className="text-xs text-center py-4 dark:text-text-dark-muted light:text-text-light-muted">
                NPC 手持状态暂不支持
              </div>
            </div>
          )}

          {activeTab === 'inventory' && combatInventory && (
            <div className="space-y-3">
              {/* 变更信息按钮 */}
              {onUpdateChanges && (
                <button
                  onClick={() => setShowChangesEditor(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  变更信息{hasAnyChanges ? `（${changeEntries.length}）` : ''}
                </button>
              )}
              {/* 药丸筛选标签 */}
              <div className="flex flex-wrap gap-1.5">
                {['全部', ...Array.from(new Set(combatInventory.map(e => e.category || '杂项')))].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setInvFilter(cat)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      invFilter === cat
                        ? 'bg-primary text-white'
                        : 'dark:bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* 物品列表 */}
              <div className="space-y-1.5">
                {combatInventory
                  .filter(e => invFilter === '全部' || (e.category || '杂项') === invFilter)
                  .map(item => {
                    const slotId = item.childId || item.id;
                    const isHeldLeft = heldLeftId === slotId;
                    const isHeldRight = heldRightId === slotId;
                    const isWornArmor = character?.wornArmorId === slotId;
                    const isWornOutfit = character?.wornOutfitId === slotId;
                    // 判断是否可手持
                    const isHoldable = !isWornArmor && !isWornOutfit;
                    return (
                      <div
                        key={slotId}
                        className="flex items-center gap-2 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">
                            {item.name || '未命名物品'}
                          </div>
                          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                            {item.category || '杂项'}
                            {item.subtype ? ` · ${item.subtype}` : ''}
                            {(item.quantity ?? 1) > 1 ? ` ×${item.quantity}` : ''}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0 items-center">
                          {isHeldLeft && <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">左手</span>}
                          {isHeldRight && <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">右手</span>}
                          {isWornArmor && <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">盔甲</span>}
                          {isWornOutfit && <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">服装</span>}
                          {/* 手持按钮：可手持且当前未手持时显示 */}
                          {character && isHoldable && !isHeldLeft && !isHeldRight && (
                            <button
                              onClick={() => {
                                // 优先放空手，否则放另一只手
                                const hand = !heldLeftId ? 'left' : !heldRightId ? 'right' : null;
                                if (hand) {
                                  handleHoldSelect(item, hand);
                                } else {
                                  // 两手都有，弹出选择
                                  setSelectingHand('left');
                                }
                              }}
                              className="p-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                              title="手持"
                            >
                              <Hand className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {/* 删除按钮：通过变更信息漏斗移除 */}
                          {onRemoveItem && (
                            <button
                              onClick={() => {
                                if (confirm(`确定从战斗背包中移除「${item.name || '未命名物品'}」？`)) {
                                  onRemoveItem(item);
                                }
                              }}
                              className="p-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {combatInventory.filter(e => invFilter === '全部' || (e.category || '杂项') === invFilter).length === 0 && (
                  <div className="text-xs text-center py-4 dark:text-text-dark-muted light:text-text-light-muted">
                    无此类物品
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="text-xs text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
              暂无操作
            </div>
          )}
        </div>

        {selectingHand && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectingHand(null)}>
            <div className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light w-full max-w-sm relative flex flex-col max-h-[80%]" onClick={(e) => e.stopPropagation()}>
              {/* 头部 */}
              <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light shrink-0">
                <div className="text-sm font-medium">选择装备（{selectingHand === 'left' ? '左手' : '右手'}）</div>
                <button
                  onClick={() => setSelectingHand(null)}
                  className="p-1 rounded hover:bg-danger/10 text-danger transition-colors"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 操作按钮区 */}
              <div className="flex gap-2 p-3 shrink-0">
                <button
                  onClick={() => { handleSetAction(selectingHand); setSelectingHand(null); }}
                  className="flex-1 py-1.5 text-xs rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >动作</button>
                <button
                  onClick={() => { handleSetUnavailable(selectingHand); setSelectingHand(null); }}
                  className="flex-1 py-1.5 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                >不可用</button>
                {((selectingHand === 'left' && heldLeftItem) || (selectingHand === 'right' && heldRightItem)) && (
                  <button
                    onClick={() => { handleUnhold(selectingHand); setSelectingHand(null); }}
                    className="flex-1 py-1.5 text-xs rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                  >放下</button>
                )}
              </div>

              {/* 物品列表 */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1">选择手持装备：</div>
                {holdableCandidates.length === 0 && (
                  <div className="text-xs text-center py-4 dark:text-text-dark-muted light:text-text-light-muted">
                    无可手持的装备
                  </div>
                )}
                {holdableCandidates.map(item => {
                  const slotId = item.childId || item.id;
                  const isHeldThis = (selectingHand === 'left' && heldLeftId === slotId) || (selectingHand === 'right' && heldRightId === slotId);
                  const isHeldOther = (selectingHand === 'left' && heldRightId === slotId) || (selectingHand === 'right' && heldLeftId === slotId);
                  return (
                    <button
                      key={slotId}
                      onClick={() => handleHoldItemSelect(item)}
                      className={`w-full text-left p-2 text-sm rounded transition-colors ${
                        isHeldThis
                          ? 'bg-primary/20 text-primary'
                          : isHeldOther
                            ? 'bg-warning/10 text-warning'
                            : 'hover:bg-primary/10 dark:text-text-dark light:text-text-light'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{item.name || '未命名物品'}</span>
                        <div className="flex items-center gap-1">
                          {(item.quantity ?? 1) > 1 && (
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">×{item.quantity}</span>
                          )}
                          {isHeldThis && <span className="text-xs">当前</span>}
                          {isHeldOther && <span className="text-xs">另手</span>}
                        </div>
                      </div>
                      {(item.category || item.subtype) && (
                        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                          {item.category || '杂项'}{item.subtype ? ` · ${item.subtype}` : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 底部取消按钮 */}
              <div className="p-3 border-t dark:border-border-dark light:border-border-light shrink-0">
                <button
                  onClick={() => setSelectingHand(null)}
                  className="w-full py-2 text-sm rounded bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark light:text-text-light hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 变更信息编辑弹窗 */}
        {showChangesEditor && equipmentChanges && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-10" onClick={() => setShowChangesEditor(false)}>
            <div className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light w-full max-w-sm relative flex flex-col max-h-[80%]" onClick={(e) => e.stopPropagation()}>
              {/* 头部 */}
              <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light shrink-0">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <ScrollText className="w-4 h-4 text-accent" />
                  变更信息
                </div>
                <button
                  onClick={() => setShowChangesEditor(false)}
                  className="p-1 rounded hover:bg-danger/10 text-danger transition-colors"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 内容区 */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {!hasAnyChanges && (
                  <div className="text-xs text-center py-6 dark:text-text-dark-muted light:text-text-light-muted">
                    暂无变更信息
                  </div>
                )}

                {/* 获得的物品 */}
                {changeEntries.filter(e => e.kind === 'gained-added' || e.kind === 'gained-delta').length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-success mb-1.5">获得的物品</div>
                    <div className="space-y-1.5">
                      {changeEntries.filter(e => e.kind === 'gained-added' || e.kind === 'gained-delta').map(entry => {
                        const isAdded = entry.kind === 'gained-added';
                        return (
                          <div key={`g-${entry.childId}`} className="flex items-center gap-2 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                            <span className="text-xs text-success shrink-0">+</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{entry.name}</div>
                              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                {isAdded ? (entry as any).category || '新增' : '数量增加'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">获得了</span>
                              <button
                                onClick={() => {
                                  const cur = entry.quantity;
                                  const next = cur - 1;
                                  if (isAdded) setAddedQty(entry.childId, next);
                                  else setDelta(entry.childId, next, true);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-danger/10 text-danger"
                                title="减少"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-medium dark:text-text-dark light:text-text-light">{entry.quantity}</span>
                              <button
                                onClick={() => {
                                  const next = entry.quantity + 1;
                                  if (isAdded) setAddedQty(entry.childId, next);
                                  else setDelta(entry.childId, next, true);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 text-primary"
                                title="增加"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (!confirm(`删除「${entry.name}」的获得记录？`)) return;
                                  if (isAdded) removeAdded(entry.childId);
                                  else removeDelta(entry.childId);
                                }}
                                className="ml-1 p-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                                title="删除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 失去的物品 */}
                {changeEntries.filter(e => e.kind === 'lost-removed' || e.kind === 'lost-delta').length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-danger mb-1.5">失去的物品</div>
                    <div className="space-y-1.5">
                      {changeEntries.filter(e => e.kind === 'lost-removed' || e.kind === 'lost-delta').map(entry => {
                        const isRemoved = entry.kind === 'lost-removed';
                        const qty = isRemoved ? 0 : (entry as any).quantity;
                        return (
                          <div key={`l-${entry.childId}-${entry.kind}`} className="flex items-center gap-2 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                            <span className="text-xs text-danger shrink-0">−</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{entry.name}</div>
                              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                {isRemoved ? '全部失去' : '数量减少'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">失去了</span>
                              {isRemoved ? (
                                <span className="px-1 text-xs italic dark:text-text-dark-muted light:text-text-light-muted">全部</span>
                              ) : (
                                <>
                                  <button
                                    onClick={() => setDelta(entry.childId, qty - 1, false)}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-danger/10 text-danger"
                                    title="减少"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center text-sm font-medium dark:text-text-dark light:text-text-light">{qty}</span>
                                  <button
                                    onClick={() => setDelta(entry.childId, qty + 1, false)}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 text-primary"
                                    title="增加"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => {
                                  if (!confirm(`删除「${entry.name}」的失去记录？（物品将恢复）`)) return;
                                  if (isRemoved) removeRemoved(entry.childId);
                                  else removeDelta(entry.childId);
                                }}
                                className="ml-1 p-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                                title="删除记录"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 底部关闭按钮 */}
              <div className="p-3 border-t dark:border-border-dark light:border-border-light shrink-0">
                <button
                  onClick={() => setShowChangesEditor(false)}
                  className="w-full py-2 text-sm rounded bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark light:text-text-light hover:bg-danger/10 hover:text-danger transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
