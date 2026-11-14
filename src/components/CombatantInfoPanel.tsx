import { useState, useEffect, useMemo } from 'react';
import { X, Plus, ChevronDown, ChevronUp, Trash2, Hand, ScrollText, Minus } from 'lucide-react';

import { characterStore } from '@/data/characterStore';
import { deriveFeatureRole } from '@/data/featureRole';
import { computeNetChanges, computeCombatantAc, type NetChangeEntry } from '@/data/combatStore';
import npcTemplateStore from '@/data/npcTemplateStore';
import combatStore from '@/data/combatStore';
import type { Combatant, NpcAttack, EquipmentChanges, CreatureSize, CreatureType, CombatRecord } from '@/types/combat';
import { ACTION_LABELS, ALL_ACTIONS, CREATURE_SIZE_LABELS, CREATURE_TYPE_LABELS } from '@/types/combat';
import type { Character, Attack, Equipment, SpellSlotLevel } from '@/types/character';
import ProvingDashboard from './combat/ProvingDashboard';
import StatusAttachPanel from './combat/StatusAttachPanel';

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
  /** 当前可用动作数（放映模式显示，模拟模式不显示） */
  actions?: number;
  /** 当前可用附赠动作数（放映模式显示，模拟模式不显示） */
  bonusActions?: number;
  /** 点击「协助」动作时回调（由 CombatSession 实现友方选择 + pending 标记） */
  onHelpClick?: () => void;
  /** 点击「吟游诗人激励」动作时回调（由 CombatSession 实现友方选择 + 附赠动作消耗） */
  onBardicClick?: () => void;
  /** 点击「攻击」动作时回调（用于替代 info 面板内按钮，保持动作面板入口统一） */
  onAttackClick?: () => void;
  /** 点击「施法」动作时回调 */
  onCastClick?: () => void;
  /** 点击「疾走」动作时回调 */
  onDashClick?: () => void;
  /** 点击「强制位移」按钮时回调（DM 手动推离入口，CombatSession 挂弹窗与落位引擎） */
  onForcedMoveClick?: () => void;
  /** 试验场模式：开放仪表盘 tab 与状态附加面板 */
  isProvingGround?: boolean;
  /** 试验场战斗记录（仪表盘数据源：回合数/记录 ID） */
  provingRecord?: CombatRecord | null;
  /** 战斗记录 ID：战斗层手持读写落到该记录的参战者上（试验场传 provingRecord.id） */
  recordId?: string;
  /** 记录已封存（结算完成）：全部写操作禁用，仅保留查看 */
  sealed?: boolean;
  /** 角色卡覆盖（玩家端复用：本地 store 没有该卡时由宿主传入云端卡） */
  characterOverride?: Character | null;
  /** 手持变更请求（玩家端提供后不写本地战斗记录，改由宿主转成 ready-item op）；传 null 表示放下 */
  onRequestHandChange?: (side: 'left' | 'right', item: Equipment | null) => void;
}

export default function CombatantInfoPanel({ combatant, onClose, combatants = [], tokenMap, combatInventory, onRemoveItem, equipmentChanges, onUpdateChanges, actions, bonusActions, onHelpClick, onBardicClick, onAttackClick, onCastClick, onDashClick, onForcedMoveClick, isProvingGround = false, provingRecord = null, recordId, sealed = false, characterOverride, onRequestHandChange }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'status' | 'inventory' | 'actions' | 'dashboard'>('info');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAttackId, setSelectedAttackId] = useState<string | null>(null);
  const [expandedRangeAttackId, setExpandedRangeAttackId] = useState<string | null>(null);
  // 战斗背包筛选：分类药丸
  const [invFilter, setInvFilter] = useState<string>('全部');

  // 玩家端由宿主传入 characterOverride 覆盖本地 store 读取（本地没有同团角色卡）
  const character = characterOverride !== undefined
    ? characterOverride
    : combatant.characterId
      ? characterStore.get(combatant.characterId)
      : null;

  // 主动技能区：只有角色卡特性与特质里归类为主动技能的条目才展示（NPC/无卡参战者不显示）。
  // 名称含「激励」的条目接入吟游诗人激励流程，其余主动技能暂为提示占位
  const activeFeatures = useMemo(
    () => (character?.features || []).filter((f) => deriveFeatureRole(f) === 'active'),
    [character]
  );
  const hasBardicFeature = activeFeatures.some((f) => /激励/.test(f.name));

  // 旧参战者（体型/种类/AC 固化前创建）缺失字段时从图鉴模板反查兜底
  const fallbackTemplate = useMemo(
    () => (combatant.templateId ? npcTemplateStore.getAll().find(t => t.templateId === combatant.templateId) ?? null : null),
    [combatant.templateId],
  );
  const displaySize = combatant.creatureSize ?? fallbackTemplate?.creatureSize;
  const displayType = combatant.creatureType ?? fallbackTemplate?.creatureType;
  // PC 走装备算法；NPC/无角色卡用参战者自带 AC，缺失时回落模板值
  const displayAc = combatant.isPc && character
    ? computeCombatantAc(combatant, character, combatInventory)
    : combatant.ac ?? fallbackTemplate?.ac ?? 0;

  // 失能切换所需：反查该参战者所属战斗记录（本组件无 record prop，通过 combatStore 获取）
  const record = combatStore.getAll().find(r => r.combatants.some(c => c.id === combatant.id)) ?? null;

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

  // 角色卡 attacks 非空才用，否则回落参战者 attacks——试验场影子卡的 attacks 恒为空数组，
  // 武器条目实际挂在 combatant.attacks 上（与 CombatAttackModal 的取值逻辑保持一致）
  const attacks: (Attack | NpcAttack)[] = character?.attacks && character.attacks.length > 0
    ? character.attacks
    : combatant.attacks || [];
  const rawHeldLeftId = combatStore.getCombatantHandSlot(combatant, 'left').equipmentId;
  const rawHeldRightId = combatStore.getCombatantHandSlot(combatant, 'right').equipmentId;
  // 手持物品：仅从战斗背包查找（战斗场景下），物品被消耗后自然为 null
  const heldLeftItem = rawHeldLeftId
    ? (combatInventory
      ? combatInventory.find(e => (e.childId || e.id) === rawHeldLeftId) ?? null
      : character?.equipment.find(e => (e.childId || e.id) === rawHeldLeftId) ?? null)
    : null;
  const heldRightItem = rawHeldRightId
    ? (combatInventory
      ? combatInventory.find(e => (e.childId || e.id) === rawHeldRightId) ?? null
      : character?.equipment.find(e => (e.childId || e.id) === rawHeldRightId) ?? null)
    : null;
  // 有效手持 ID：物品已不在战斗背包（被消耗/移除）时视为空手，避免换手报"手不可用"
  const heldLeftId = heldLeftItem ? rawHeldLeftId : null;
  const heldRightId = heldRightItem ? rawHeldRightId : null;
  // 可用性：物品不存在于战斗背包时视为不可用（state/双手检查在参战者手持槽上）
  const leftUsable = heldLeftItem ? combatStore.isCombatantWeaponUsable(combatant, 'left', combatInventory) : false;
  const rightUsable = heldRightItem ? combatStore.isCombatantWeaponUsable(combatant, 'right', combatInventory) : false;

  const handleHoldSelect = (item: Equipment, hand: 'left' | 'right') => {
    // 玩家端：换持只产出 ready-item op，由 DM 端审核入账
    if (onRequestHandChange) {
      onRequestHandChange(hand, item);
      return;
    }
    if (!recordId) return;
    // 若目标手仍持有已不在战斗背包中的物品（悬空引用），先清空，避免换手报"手不可用"
    const rawSlot = combatStore.getCombatantHandSlot(combatant, hand);
    const rawId = rawSlot?.equipmentId ?? null;
    const stillExists = rawId
      ? (combatInventory
        ? combatInventory.some(e => (e.childId || e.id) === rawId)
        : (character?.equipment.some(e => (e.childId || e.id) === rawId) ?? false))
      : false;
    if (rawId && !stillExists) {
      combatStore.unsetCombatantHand(recordId, combatant.id, hand);
    }
    const result = combatStore.setCombatantHand(recordId, combatant.id, (item.childId || item.id)!, hand, combatInventory);
    if (!result.success) alert(result.message);
    setRefreshKey(k => k + 1);
  };

  const handleUnhold = (hand: 'left' | 'right' | 'both') => {
    if (onRequestHandChange && hand !== 'both') {
      onRequestHandChange(hand, null);
      return;
    }
    if (!recordId) return;
    combatStore.unsetCombatantHand(recordId, combatant.id, hand);
    setRefreshKey(k => k + 1);
  };

  const handleSetAction = (hand: 'left' | 'right' | 'both') => {
    if (!recordId) return;
    combatStore.setCombatantHandState(recordId, combatant.id, hand, 'action');
    setRefreshKey(k => k + 1);
  };

  const handleEndAction = (hand: 'left' | 'right' | 'both') => {
    if (!recordId) return;
    combatStore.setCombatantHandState(recordId, combatant.id, hand, 'ready');
    setRefreshKey(k => k + 1);
  };

  const handleSetUnavailable = (hand: 'left' | 'right' | 'both') => {
    if (!recordId) return;
    combatStore.setCombatantHandState(recordId, combatant.id, hand, 'unavailable');
    setRefreshKey(k => k + 1);
  };

  const handleRestoreHand = (hand: 'left' | 'right' | 'both') => {
    if (!recordId) return;
    combatStore.setCombatantHandState(recordId, combatant.id, hand, 'ready');
    setRefreshKey(k => k + 1);
  };

  const [selectingHand, setSelectingHand] = useState<'left' | 'right' | null>(null);
  // 变更信息编辑弹窗
  const [showChangesEditor, setShowChangesEditor] = useState(false);

  // 变更信息条目（文字化 + 可编辑）
  // 通过 childId 查名称：战斗场景下优先查战斗背包（含拾取物），否则回退角色源背包
  const nameByChildId = (cid: string): string => {
    const src = combatInventory?.find(e => (e.childId || e.id) === cid)
      ?? character?.equipment.find(e => (e.childId || e.id) === cid);
    return src?.name || '未知物品';
  };

  // 净变化量条目（每个 childId 最多一条）：
  //   delta = combatQty - srcQty，正数=净获得，负数=净失去，0=无变化（不展示）
  const netEntries: NetChangeEntry[] = equipmentChanges ? computeNetChanges(character, equipmentChanges) : [];
  const hasAnyChanges = netEntries.length > 0;

  // 编辑操作：基于当前 equipmentChanges 派生新对象并回调
  const commitChanges = (next: EquipmentChanges) => {
    onUpdateChanges?.({
      added: next.added,
      removedChildIds: next.removedChildIds,
      quantityDeltas: next.quantityDeltas,
    });
  };

  /**
   * 统一写回：把目标净 delta 翻译成 added / quantityDeltas / removedChildIds 并写入
   * 目标：combatQty = max(0, srcQty + newDeltaSigned) ；
   *      若 srcQty=0（added 物品），则 combatQty = newDeltaSigned ≥ 0
   * 约束：newDeltaSigned ≥ -srcQty（不能让失去超过源数量；派生已保证 combatQty≥0）
   */
  const setNetDelta = (entry: NetChangeEntry, newDeltaSigned: number) => {
    if (!equipmentChanges) return;
    const { childId, srcQty, info } = entry;
    // 约束检查：失去不超过源拥有量
    const clampedDelta = Math.max(-srcQty, newDeltaSigned);
    const desiredCombatQty = srcQty + clampedDelta; // 可能 <0 时已被 clamp 保证 ≥ -srcQty，所以 ≥0
    // 若 desiredCombatQty <0（不可能，因 clampedDelta ≥ -srcQty），以下统一处理

    const next: EquipmentChanges = {
      ...equipmentChanges,
      added: [...equipmentChanges.added],
      removedChildIds: [...equipmentChanges.removedChildIds],
      quantityDeltas: { ...equipmentChanges.quantityDeltas },
    };

    if (info.addedEq && !info.srcEq) {
      // 纯 added 物品（源里没有）：改 added 快照的 quantity；不需要 quantityDeltas / removedChildIds
      const idx = next.added.findIndex(a => a.childId === childId);
      if (idx >= 0) {
        if (desiredCombatQty <= 0) {
          // 获得量归零 → 从 added 移除
          next.added.splice(idx, 1);
        } else {
          // 调整 added 快照内数量
          next.added[idx] = {
            ...next.added[idx],
            equipment: { ...next.added[idx].equipment, quantity: desiredCombatQty },
          };
        }
      }
      // added 物品如果原来还有 quantityDeltas，把它清掉（避免二次应用）
      delete next.quantityDeltas[childId];
    } else if (info.srcEq) {
      // 源里有该物品：
      //   combatQty = srcQty + qtyDelta（若 removedChildIds 中含此则 combatQty=0）
      //   目标：srcQty + qtyDelta' = desiredCombatQty → qtyDelta' = desiredCombatQty - srcQty = clampedDelta
      if (desiredCombatQty <= 0) {
        // 整件失去 → 加入 removedChildIds，并删除对应 delta（removed 优先级更高）
        if (!next.removedChildIds.includes(childId)) {
          next.removedChildIds.push(childId);
        }
        delete next.quantityDeltas[childId];
      } else {
        // 正常增减量
        next.removedChildIds = next.removedChildIds.filter(c => c !== childId);
        const newQtyDelta = desiredCombatQty - srcQty;
        if (newQtyDelta === 0) {
          delete next.quantityDeltas[childId];
        } else {
          next.quantityDeltas[childId] = newQtyDelta;
        }
      }
    }
    commitChanges(next);
  };
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

  // 状态管理
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(new Set());

  const toggleStatusExpand = (statusKey: string) => {
    setExpandedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(statusKey)) next.delete(statusKey);
      else next.add(statusKey);
      return next;
    });
  };

  const [selectedRangeIndex, setSelectedRangeIndex] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm rounded-xl border dark:bg-bg-dark dark:border-border-dark light:bg-bg-light light:border-border-light shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light">
          <h3 className="font-bold text-sm dark:text-text-dark light:text-text-light">
            {combatant.name}
            {combatant.isPc && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-info/20 text-info">PC</span>}
            {combatant.isIncapacitated && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400">失能</span>
            )}
            {combatant.concentration && (
              <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">专注</span>
            )}
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
          {isProvingGround && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-b-2 border-primary text-primary'
                  : 'dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
              }`}
            >
              仪表盘
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
                  {displayAc}
                </span>
              </div>

              {/* 被动检定三件套（PC 入战快照；优势 +5 / 劣势 -5 由 DM 按现场人工修饰） */}
              {combatant.passiveChecks && (
                <div className="flex justify-between text-xs">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">被动检定</span>
                  <span className="font-medium dark:text-text-dark light:text-text-light">
                    感知 {combatant.passiveChecks.perception}
                    <span className="mx-1.5 opacity-40">|</span>
                    洞察 {combatant.passiveChecks.insight}
                    <span className="mx-1.5 opacity-40">|</span>
                    调查 {combatant.passiveChecks.investigation}
                  </span>
                </div>
              )}

              {!!combatant.darkvision && (
                <div className="flex justify-between text-xs">
                  <span className="dark:text-text-dark-muted light:text-text-light-muted">黑暗视觉</span>
                  <span className="font-medium dark:text-text-dark light:text-text-light">
                    {combatant.darkvision} 尺
                  </span>
                </div>
              )}

              {/* 法术位（PC）：战斗临时副本视图（角色卡源 + 本场消耗 delta 叠加）。
                  实心圆=可用、空心圆=已消耗；点击实心消耗 / 空心恢复（与角色详情页同款交互，
                  但只写战斗漏斗 spellSlotChanges，角色卡在战斗结算时统一并入） */}
              {combatant.isPc && !isProvingGround && record && (() => {
                const slots = combatStore.getCombatSpellSlotView(record.id, combatant.id);
                if (!slots || slots.length === 0) return null;
                const updateSlot = (levelKey: SpellSlotLevel, consume: boolean) => {
                  if (sealed) return;
                  if (consume) combatStore.consumeSpellSlot(record.id, combatant.id, levelKey);
                  else combatStore.restoreSpellSlot(record.id, combatant.id, levelKey);
                  setRefreshKey(k => k + 1);
                };
                return (
                  <div>
                    <div className="text-sm font-medium mb-2 dark:text-text-dark-muted light:text-text-light-muted">
                      法术位
                    </div>
                    <div className="space-y-1.5">
                      {slots.map((slot) => {
                        const levelKey = `level${slot.level}` as SpellSlotLevel;
                        return (
                        <div key={slot.level} className="flex items-center gap-3 py-1 px-1 rounded-lg">
                          <span className="w-12 shrink-0 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                            {slot.label}
                            {slot.isWarlock && <span className="ml-0.5 text-[10px]">短休</span>}
                          </span>
                          <div className="flex items-center">
                            {Array.from({ length: slot.max }).map((_, i) => {
                              const filled = i < slot.available;
                              return (
                                <div key={i} className="flex items-center">
                                  {i > 0 && <span className="w-2 h-0.5 bg-gray-400/70 dark:bg-gray-500/70" />}
                                  <button
                                    type="button"
                                    onClick={() => updateSlot(levelKey, filled)}
                                    title={filled ? '消耗一个环位' : '恢复一个环位'}
                                    className="w-4.5 h-4.5 rounded-full border-2 border-gray-500 dark:border-gray-400 hover:border-primary p-[2px] transition-colors"
                                  >
                                    <span
                                      className={`block w-full h-full rounded-full transition-colors ${
                                        filled ? 'bg-primary' : 'bg-transparent'
                                      }`}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <span
                            className="ml-auto text-xs tabular-nums dark:text-text-dark-muted light:text-text-light-muted"
                            title="可用 / 总量（战斗中消耗，结算时并入角色卡）"
                          >
                            {slot.available}/{slot.max}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 体型和种类 */}
              <div className="flex justify-between text-xs">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">体型</span>
                <span className="font-medium dark:text-text-dark light:text-text-light">
                  {displaySize !== undefined ? CREATURE_SIZE_LABELS[displaySize] : '—'}
                </span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="dark:text-text-dark-muted light:text-text-light-muted">种类</span>
                <span className="font-medium dark:text-text-dark light:text-text-light">
                  {displayType ? CREATURE_TYPE_LABELS[displayType] : '—'}
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
                  const slot = combatStore.getCombatantHandSlot(combatant, 'left');
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
                        {(!sealed || !!onRequestHandChange) && (isUnavailable ? (
                          recordId && <button onClick={() => handleRestoreHand('left')} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">恢复</button>
                        ) : isAction ? (
                          recordId && <button onClick={() => handleEndAction('left')} className="px-1.5 py-0.5 text-xs rounded bg-accent/10 text-accent">结束</button>
                        ) : heldLeftItem ? (
                          <button onClick={() => handleUnhold('left')} className="px-1.5 py-0.5 text-xs rounded bg-danger/10 text-danger">放下</button>
                        ) : isReady && (
                          <button onClick={() => setSelectingHand('left')} className="p-0.5 rounded bg-primary/10 text-primary" title="拿取装备">
                            <Plus className="w-3 h-3" />
                          </button>
                        ))}
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
                  const slot = combatStore.getCombatantHandSlot(combatant, 'right');
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
                        {(!sealed || !!onRequestHandChange) && (isUnavailable ? (
                          recordId && <button onClick={() => handleRestoreHand('right')} className="px-1.5 py-0.5 text-xs rounded bg-primary/10 text-primary">恢复</button>
                        ) : isAction ? (
                          recordId && <button onClick={() => handleEndAction('right')} className="px-1.5 py-0.5 text-xs rounded bg-accent/10 text-accent">结束</button>
                        ) : heldRightItem ? (
                          <button onClick={() => handleUnhold('right')} className="px-1.5 py-0.5 text-xs rounded bg-danger/10 text-danger">放下</button>
                        ) : isReady && (
                          <button onClick={() => setSelectingHand('right')} className="p-0.5 rounded bg-primary/10 text-primary" title="拿取装备">
                            <Plus className="w-3 h-3" />
                          </button>
                        ))}
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

          {activeTab === 'status' && (
            <div className="space-y-3">
              {/* 能力开关 */}
              <div className="rounded-lg border dark:border-border-dark light:border-border-light p-3">
                <div className="text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">能力开关</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs dark:text-text-dark light:text-text-light">言语能力 (V)</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={combatant.canSpeak !== false}
                        onChange={e => {
                          const record = combatStore.getAll().find(r => r.combatants.some(c => c.id === combatant.id));
                          if (record) {
                            const updatedCombatants = record.combatants.map(c => 
                              c.id === combatant.id ? { ...c, canSpeak: e.target.checked } : c
                            );
                            combatStore.update(record.id, { combatants: updatedCombatants });
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs dark:text-text-dark light:text-text-light">手势能力 (S)</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={combatant.canGesticulate !== false}
                        onChange={e => {
                          const record = combatStore.getAll().find(r => r.combatants.some(c => c.id === combatant.id));
                          if (record) {
                            const updatedCombatants = record.combatants.map(c => 
                              c.id === combatant.id ? { ...c, canGesticulate: e.target.checked } : c
                            );
                            combatStore.update(record.id, { combatants: updatedCombatants });
                          }
                        }}
                      />
                      <span className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground">DM覆盖</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 状态卡片：专注（施法者正在维持的专注类法术，可主动停止） */}
              {combatant.concentration && (
                <div className="rounded-lg border border-amber-500/40 overflow-hidden">
                  <button
                    onClick={() => toggleStatusExpand('concentration')}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium dark:text-text-dark light:text-text-light">专注</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">
                        {combatant.concentration.spellName}
                      </span>
                    </div>
                    {expandedStatuses.has('concentration') ? (
                      <ChevronUp className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                    )}
                  </button>
                  {expandedStatuses.has('concentration') && (
                    <div className="px-3 pb-3 space-y-1.5 border-t border-amber-500/40 pt-2">
                      <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                        自第 {combatant.concentration.startedRound} 轮开始维持；受到伤害时需做体质豁免（DC = max(10, 伤害/2)）。
                      </p>
                      <button
                        onClick={() => {
                          const rec = combatStore.getAll().find(r => r.combatants.some(c => c.id === combatant.id));
                          if (!rec) return;
                          const latest = combatStore.get(rec.id);
                          if (!latest) return;
                          const self = latest.combatants.find(c => c.id === combatant.id);
                          // 手动停止：联动移除本次专注挂载的状态实例（防护能量的抗性等）
                          combatStore.removeConcentrationStatuses(self?.concentration);
                          combatStore.update(rec.id, {
                            combatants: latest.combatants.map(c =>
                              c.id === combatant.id ? { ...c, concentration: undefined } : c,
                            ),
                            updatedAt: Date.now(),
                          });
                          // 手动停止专注：「维持专注」待办同步清扫（与字段同生命周期）
                          combatStore.cleanupConcentrationMaintainTodos(rec.id);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-500 text-xs hover:bg-amber-500/10 transition-colors"
                      >
                        停止专注
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 状态卡片：激励骰（次数型检定奖惩，未消费项展示；支持手动移除） */}
              {(combatant.pendingCheckModifiers || []).some(m => !m.consumed && m.remainingUses > 0) && (
                <div className="rounded-lg border border-sky-500/40 overflow-hidden">
                  <button
                    onClick={() => toggleStatusExpand('bardic')}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium dark:text-text-dark light:text-text-light">激励骰</span>
                      {(combatant.pendingCheckModifiers || [])
                        .filter(m => !m.consumed && m.remainingUses > 0)
                        .map(m => (
                          <span key={m.id} className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">
                            {m.dice.sides > 0 ? `d${m.dice.sides}` : `+${m.dice.flatBonus ?? 0}`}
                          </span>
                        ))}
                    </div>
                    {expandedStatuses.has('bardic') ? (
                      <ChevronUp className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                    )}
                  </button>
                  {expandedStatuses.has('bardic') && (
                    <div className="px-3 pb-3 space-y-1.5 border-t border-sky-500/40 pt-2">
                      {(combatant.pendingCheckModifiers || [])
                        .filter(m => !m.consumed && m.remainingUses > 0)
                        .map(m => (
                          <div key={m.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted truncate">
                                {m.reason}
                              </p>
                              <p className="text-[10px] opacity-60">
                                剩余 {m.remainingUses} 次 · 攻击/法术/豁免/技能检定后可加值
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                const rec = combatStore.getAll().find(r => r.combatants.some(c => c.id === combatant.id));
                                if (!rec) return;
                                combatStore.removePendingCheckModifier(rec.id, combatant.id, m.id);
                              }}
                              className="shrink-0 px-2 py-1 rounded border border-sky-500/40 text-sky-400 text-xs hover:bg-sky-500/10 transition-colors"
                            >
                              移除
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* 状态卡片：失能 */}
              {combatant.isIncapacitated && (
                <div className="rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
                  <button
                    onClick={() => toggleStatusExpand('incapacitated')}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium dark:text-text-dark light:text-text-light">失能</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-400">生效中</span>
                    </div>
                    {expandedStatuses.has('incapacitated') ? (
                      <ChevronUp className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 dark:text-text-dark-muted light:text-text-light-muted" />
                    )}
                  </button>
                  {expandedStatuses.has('incapacitated') && (
                    <div className="px-3 pb-3 space-y-1.5 border-t dark:border-border-dark light:border-border-light pt-2">
                      <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">该参战者正处于失能状态，受到以下影响：</p>
                      <ul className="space-y-1">
                        <li className="text-xs flex items-start gap-1.5">
                          <span className="text-purple-400 mt-0.5">•</span>
                          <span className="dark:text-text-dark light:text-text-light">无法行动</span>
                        </li>
                        <li className="text-xs flex items-start gap-1.5">
                          <span className="text-purple-400 mt-0.5">•</span>
                          <span className="dark:text-text-dark light:text-text-light">无法专注</span>
                        </li>
                        <li className="text-xs flex items-start gap-1.5">
                          <span className="text-purple-400 mt-0.5">•</span>
                          <span className="dark:text-text-dark light:text-text-light">无法说话</span>
                        </li>
                        <li className="text-xs flex items-start gap-1.5">
                          <span className="text-purple-400 mt-0.5">•</span>
                          <span className="dark:text-text-dark light:text-text-light">先攻投掷劣势</span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {!combatant.isIncapacitated && !(recordId || provingRecord?.id) && (
                <div className="text-center py-8 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  当前无状态效果
                </div>
              )}
            </div>
          )}

          {/* 试验场：状态附加面板（任意参战者附加/解除状态库任意状态） */}
          {activeTab === 'status' && (recordId || provingRecord?.id) && (
            <div className="mt-3 pt-3 border-t dark:border-border-dark light:border-border-light">
              <StatusAttachPanel recordId={(recordId || provingRecord?.id)!} combatant={combatant} />
            </div>
          )}

          {activeTab === 'inventory' && combatInventory && (
            <div className="space-y-3">
              {/* 变更信息按钮 */}
              {onUpdateChanges && !sealed && (
                <button
                  onClick={() => setShowChangesEditor(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  变更信息{hasAnyChanges ? `（${netEntries.length}）` : ''}
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
                          {character && isHoldable && !isHeldLeft && !isHeldRight && (!sealed || !!onRequestHandChange) && (
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
                          {onRemoveItem && !sealed && (
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

          {activeTab === 'dashboard' && isProvingGround && provingRecord && (
            <ProvingDashboard
              record={provingRecord}
              combatant={combatant}
              character={character}
              combatInventory={combatInventory}
            />
          )}

          {activeTab === 'actions' && (
            <div className="space-y-3">
              {/* 动作 + 附赠动作 计数行：同一行展示 */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium dark:text-text-dark light:text-text-light">动作</span>
                    <span className="text-sm font-semibold dark:text-text-dark light:text-text-light">
                      {Math.max(0, typeof actions === 'number' ? actions : (typeof combatant.actions === 'number' ? combatant.actions : 1))}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium dark:text-text-dark light:text-text-light">附赠动作</span>
                    <span className="text-sm font-semibold dark:text-text-dark light:text-text-light">
                      {Math.max(0, typeof bonusActions === 'number' ? bonusActions : (typeof combatant.bonusActions === 'number' ? combatant.bonusActions : 1))}
                    </span>
                  </div>
                </div>
              </div>
              {/* 模板特质提醒：多重攻击构成 / 天生施法 / 再生（每回合开始恢复，失效条件由 DM 判断） */}
              {(combatant.multiattack || combatant.spellcasting || combatant.regenAmount) && (
                <div className="space-y-1.5">
                  {combatant.multiattack && (
                    <div className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-400">
                      多重攻击：
                      {combatant.multiattack.map(m => `${m.name}×${m.count}`).join(' + ')}
                    </div>
                  )}
                  {combatant.spellcasting && (
                    <div className="rounded-lg bg-violet-500/10 p-2 text-xs text-violet-400 space-y-1">
                      <div>
                        天生施法：DC{combatant.spellcasting.dc}（{combatant.spellcasting.ability}）
                        {typeof combatant.spellcasting.attackBonus === 'number' ? `，命中 +${combatant.spellcasting.attackBonus}` : ''}
                      </div>
                      {(combatant.spellcasting.groups ?? []).map(g => {
                        const usage = g.usage;
                        const used = combatant.spellcastingUsage?.[g.ring] ?? 0;
                        const remaining = usage?.kind === 'slots' && typeof usage.count === 'number' ? usage.count - used : null;
                        const exhausted = remaining !== null && remaining <= 0;
                        return (
                          <div key={g.ring} className="flex items-center gap-2">
                            <span className="text-violet-400/80 flex-1">
                              {g.ring}
                              {usage?.kind === 'atWill' ? '（随意）' : remaining !== null ? `（${usage.count}法术位，剩 ${remaining}）` : ''}：
                              {g.spells.join('、')}
                            </span>
                            {remaining !== null && !sealed && recordId && (
                              <button
                                type="button"
                                disabled={exhausted}
                                onClick={() => combatStore.consumeNpcSpellcasting(recordId, combatant.id, g.ring)}
                                className={`rounded px-1.5 py-0.5 text-[10px] ${exhausted ? 'bg-text-dark/10 text-text-dark/40' : 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'}`}
                              >
                                消耗
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {combatant.regenAmount && (
                    <div className="rounded-lg bg-green-500/10 p-2 text-xs text-green-400">
                      再生：每回合开始恢复 {combatant.regenAmount} 点生命值
                      {combatant.regenNegate ? `（受到${combatant.regenNegate}则下回合失效）` : ''}
                    </div>
                  )}
                </div>
              )}
              {/* 动作类型列表（攻击/施法已实现，其余为预留接口占位） */}
              <div>
                <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-2">
                  可执行动作
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_ACTIONS.map((type) => {
                    const statusBlocked = !!(combatant.isDead || combatant.isUnconscious || combatant.isIncapacitated);
                    const clickable = !sealed && !statusBlocked && (
                      (type === 'help' && !!onHelpClick) ||
                      (type === 'attack' && !!onAttackClick) ||
                      (type === 'cast' && !!onCastClick) ||
                      (type === 'dash' && !!onDashClick));
                    const implemented =
                      type === 'attack' || type === 'cast' || type === 'help' || type === 'dash';
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          if (type === 'help') onHelpClick?.();
                          else if (type === 'attack') onAttackClick?.();
                          else if (type === 'cast') onCastClick?.();
                          else if (type === 'dash') onDashClick?.();
                        }}
                        disabled={!clickable}
                        className={`flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors ${
                          clickable
                            ? 'dark:bg-bg-dark-2 light:bg-gray-100 dark:text-text-dark light:text-text-light hover:bg-primary/15 active:scale-[0.98]'
                            : implemented
                              ? 'dark:bg-bg-dark-2/50 light:bg-gray-50 dark:text-text-dark light:text-text-light opacity-80 cursor-default'
                              : 'dark:bg-bg-dark-2/50 light:bg-gray-50 dark:text-text-dark-muted light:text-text-light-muted opacity-70 cursor-not-allowed'
                        }`}
                      >
                        <span>{ACTION_LABELS[type]}</span>
                        {!implemented && (
                          <span className="text-[10px] opacity-60">预留</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {(combatant.isDead || combatant.isUnconscious || combatant.isIncapacitated) && (
                  <p className="mt-1.5 text-[10px] text-purple-400">
                    {combatant.isDead ? '已死亡，无法行动' : combatant.isUnconscious ? '已昏迷，无法行动' : '已失能，无法行动'}
                  </p>
                )}
                {onForcedMoveClick && (
                  <button
                    type="button"
                    onClick={onForcedMoveClick}
                    disabled={sealed}
                    className={`mt-1.5 w-full px-2 py-1.5 rounded text-xs text-left transition-colors dark:bg-bg-dark-2 light:bg-gray-100 dark:text-text-dark light:text-text-light active:scale-[0.98] ${sealed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/15'}`}
                  >
                    强制位移（推离/推近）
                  </button>
                )}
                {/* 主动技能区：按角色卡特性与特质过滤，只有真的携带对应主动技能的角色才显示对应按钮 */}
                {activeFeatures.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-2">
                      主动技能
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {activeFeatures.map((f) => {
                        const isBardic = /激励/.test(f.name);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            disabled={sealed || !!(combatant.isDead || combatant.isUnconscious || combatant.isIncapacitated)}
                            onClick={() => {
                              if (isBardic && onBardicClick) {
                                onBardicClick();
                              } else if (!isBardic) {
                                alert(`「${f.name}」暂未接入自动化流程，请按特性描述手动处理`);
                              }
                            }}
                            className={`px-2 py-1.5 rounded text-xs text-left transition-colors dark:bg-bg-dark-2 light:bg-gray-100 dark:text-text-dark light:text-text-light active:scale-[0.98] ${sealed ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary/15'}`}
                            title={isBardic ? '附赠动作·发放激励骰' : (f.description || '').slice(0, 60)}
                          >
                            <span className="block truncate">{f.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectingHand && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectingHand(null)}>
            <div className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light w-full max-w-sm relative flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
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
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowChangesEditor(false)}>
            <div className="bg-white dark:bg-bg-dark rounded-lg border dark:border-border-dark light:border-border-light w-full max-w-sm relative flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
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

              {/* 内容区：按净变化量分组展示（获得/失去各一组，同一 childId 一条）*/}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {!hasAnyChanges && (
                  <div className="text-xs text-center py-6 dark:text-text-dark-muted light:text-text-light-muted">
                    暂无变更信息
                  </div>
                )}

                {/* 净获得（delta > 0）*/}
                {netEntries.some(e => e.delta > 0) && (
                  <div>
                    <div className="text-xs font-medium text-success mb-1.5">获得的物品</div>
                    <div className="space-y-1.5">
                      {netEntries.filter(e => e.delta > 0).map(entry => (
                        <div key={`g-${entry.childId}`} className="flex items-center gap-2 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                          <span className="text-xs text-success shrink-0">+</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{entry.name}</div>
                            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                              源 {entry.srcQty} · 战斗中 {entry.combatQty}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">获得了</span>
                            <button
                              onClick={() => setNetDelta(entry, entry.delta - 1)}
                              className="w-5 h-5 flex items-center justify-center rounded hover:bg-danger/10 text-danger"
                              title="减少获得量"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-medium dark:text-text-dark light:text-text-light">{entry.delta}</span>
                            <button
                              onClick={() => setNetDelta(entry, entry.delta + 1)}
                              className="w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 text-primary"
                              title="增加获得量"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                if (!confirm(`删除「${entry.name}」的获得记录？（delta 归零）`)) return;
                                setNetDelta(entry, 0);
                              }}
                              className="ml-1 p-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 净失去（delta < 0），最多失去 srcQty 件（纯 added 的 srcQty=0，不应该出现净失去；展示时不允许调至负数）*/}
                {netEntries.some(e => e.delta < 0) && (
                  <div>
                    <div className="text-xs font-medium text-danger mb-1.5">失去的物品</div>
                    <div className="space-y-1.5">
                      {netEntries.filter(e => e.delta < 0).map(entry => {
                        const lostQty = -entry.delta;
                        const maxLost = entry.srcQty;
                        return (
                          <div key={`l-${entry.childId}`} className="flex items-center gap-2 p-2 rounded-lg dark:bg-bg-dark-dark light:bg-bg-light-3 border dark:border-border-dark light:border-border-light">
                            <span className="text-xs text-danger shrink-0">−</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{entry.name}</div>
                              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                                源 {entry.srcQty} · 战斗中 {entry.combatQty}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">失去了</span>
                              <button
                                onClick={() => {
                                  // 减少失去量 = delta 变大（朝 0 靠）
                                  const nextDelta = entry.delta + 1; // -3 → -2
                                  setNetDelta(entry, nextDelta);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-danger/10 text-danger"
                                title="减少失去量"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-6 text-center text-sm font-medium dark:text-text-dark light:text-text-light">{lostQty}</span>
                              <button
                                onClick={() => {
                                  // 增加失去量 = delta 变小（朝 -srcQty 靠，但不超过 -srcQty 下限）
                                  const nextDelta = entry.delta - 1;
                                  setNetDelta(entry, nextDelta);
                                }}
                                className="w-5 h-5 flex items-center justify-center rounded hover:bg-primary/10 text-primary"
                                title="增加失去量"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (!confirm(`删除「${entry.name}」的失去记录？（物品将恢复）`)) return;
                                  setNetDelta(entry, 0);
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
