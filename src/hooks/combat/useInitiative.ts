import { useState, useRef, MutableRefObject } from 'react';
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';
import type { Character } from '@/types/character';
import { characterStore } from '@/data/characterStore';
import combatStore from '@/data/combatStore';
import { computeInitiativeBonus } from '@/lib/attackBonus';
import { deriveCharacterAffinities, deriveSpeedModifier } from '@/data/passiveCombatRules';

const CIRCLE_NUMBERS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];

export interface UseInitiativeProps {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
}

export function useInitiative(record: CombatRecord | null, props: UseInitiativeProps) {
  const { selectedIds, setSelectedIds, batchMode, setBatchMode } = props;

  // 先攻编辑状态：内联先攻编辑 UI 已改为只读，InitiativeTable 经 props 只读消费
  const [editingInitiative, setEditingInitiative] = useState<string | null>(null);
  const [initiativeInput, setInitiativeInput] = useState('');

  // 先攻投掷弹窗
  const [initiativeRollOpen, setInitiativeRollOpen] = useState(false);
  const [selectedPc, setSelectedPc] = useState<Character | null>(null);
  const [d20Input, setD20Input] = useState('');

  // 平局排序
  const [tiebreakerOpen, setTiebreakerOpen] = useState(false);
  const [tiedOrder, setTiedOrder] = useState<Combatant[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 先攻顺序序号（按先攻高→低排序，同先攻保持原序）
  const initiativeOrder: Map<string, number> = (() => {
    if (!record) return new Map<string, number>();
    const order = [...record.combatants]
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (b.c.initiative - a.c.initiative) || (a.i - b.i));
    const m = new Map<string, number>();
    order.forEach((o, idx) => m.set(o.c.id, idx));
    return m;
  })();

  const getInitiativeCircle = (combatantId: string): string => {
    const idx = initiativeOrder.get(combatantId);
    if (idx === undefined) return '';
    if (idx < CIRCLE_NUMBERS.length) return CIRCLE_NUMBERS[idx];
    return `㉑${idx + 1}`;
  };

  // 确认 PC 先攻并加入战斗
  const handleConfirmInitiative = () => {
    if (!selectedPc || !record) return;
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) {
      alert('请输入 1-20 之间的 d20 数值');
      return;
    }
    const { total: initBonus } = computeInitiativeBonus(selectedPc);
    const initiative = d20 + initBonus;
    const newId = crypto.randomUUID();
    // 战斗层手持初始化：从角色卡备战槽复制（进战自动拿起备战中的武器/盾牌）
    const hands = combatStore.initCombatantHands(selectedPc);
    // 被动规则派生：伤害抗性/免疫快照 + 速度修正（快速移动/无甲移动，条件按战斗层着装/持盾）
    const heldIds = [hands.heldLeft?.equipmentId, hands.heldRight?.equipmentId].filter(Boolean) as string[];
    const heldEquipment = heldIds
      .map((hid) => (selectedPc.equipment as Array<{ childId?: string; id: string; subtype?: string }> | undefined ?? [])
        .find((e) => (e.childId || e.id) === hid))
      .filter(Boolean) as Array<{ subtype?: string }>;
    const armorWorn = selectedPc.wornArmorId
      ? (selectedPc.equipment as Array<{ childId?: string; id: string }> | undefined ?? [])
        .find((e) => (e.childId || e.id) === selectedPc.wornArmorId)
      : null;
    const shieldHeld = heldEquipment.some((e) => e?.subtype === '盾牌');
    const wearingHeavyArmor = !!armorWorn && (armorWorn as { subtype?: string }).subtype?.includes('重');
    const speedModifier = deriveSpeedModifier(selectedPc, { wearingHeavyArmor, combatShieldHeld: shieldHeld });
    const newCombatant: Combatant = {
      id: newId,
      name: selectedPc.name,
      initiative,
      ac: selectedPc.armorClass,
      maxHp: selectedPc.maxHp,
      currentHp: selectedPc.currentHp,
      tempHp: selectedPc.tempHp ?? 0,
      isDead: selectedPc.currentHp <= 0,
      isPc: true,
      characterId: selectedPc.id,
      speed: selectedPc.speed,
      speedModifier,
      damageAffinities: deriveCharacterAffinities(selectedPc),
      note: '',
      actions: 1,
      heldLeft: hands.heldLeft,
      heldRight: hands.heldRight,
    };
    const updatedCombatants = [...record.combatants, newCombatant].sort(
      (a, b) => b.initiative - a.initiative
    );
    const updatedRounds = record.rounds.map(round => ({
      ...round,
      [newCombatant.id]: '',
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
    // 持久状态挂载：角色卡上仍在作用期内的状态（上次战斗结算继承）复制进本次战斗
    combatStore.mountCharacterStatuses(record.id, newId);
    setInitiativeRollOpen(false);
    setSelectedPc(null);
    setD20Input('');
    checkTieAndOpen(newId);
  };

  const checkTieAndOpen = (latestId: string) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const target = latest.combatants.find((c) => c.id === latestId);
    if (!target) return;
    const tied = latest.combatants.filter((c) => c.initiative === target.initiative);
    if (tied.length >= 2) {
      setTiedOrder(tied);
      setTiebreakerOpen(true);
    }
  };

  const handleConfirmTiebreaker = () => {
    if (!record) {
      setTiebreakerOpen(false);
      return;
    }
    const latest = combatStore.get(record.id);
    if (!latest) {
      setTiebreakerOpen(false);
      return;
    }
    const tieInit = tiedOrder[0]?.initiative;
    if (tieInit === undefined) {
      setTiebreakerOpen(false);
      return;
    }
    const newTiedIds = tiedOrder.map((c) => c.id);
    let tiedPtr = 0;
    const updatedCombatants = latest.combatants.map((c) => {
      if (c.initiative === tieInit) {
        const replacement = latest.combatants.find((x) => x.id === newTiedIds[tiedPtr]);
        tiedPtr++;
        return replacement || c;
      }
      return c;
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      updatedAt: Date.now(),
    });
    setTiebreakerOpen(false);
    setTiedOrder([]);
  };

  const handleDragStart = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    setDraggingIndex(index);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (draggingIndex === null) return;
    const pointerY = e.clientY;
    let targetIndex = draggingIndex;
    for (let i = 0; i < cardRefs.current.length; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (pointerY < midY) { targetIndex = i; break; }
      if (i === cardRefs.current.length - 1) targetIndex = i;
    }
    if (targetIndex !== draggingIndex) {
      setTiedOrder((prev) => {
        const next = [...prev];
        const [moved] = next.splice(draggingIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
      setDraggingIndex(targetIndex);
    }
  };
  const handleDragEnd = () => setDraggingIndex(null);

  const handleAddRound = () => {
    if (!record) return;
    const newRound: RoundAction = {};
    record.combatants.forEach(combatant => { newRound[combatant.id] = ''; });
    combatStore.update(record.id, { rounds: [...record.rounds, newRound], updatedAt: Date.now() });
  };

  const handleInitiativeSave = (combatantId: string) => {
    if (!record) return;
    const newInit = parseInt(initiativeInput, 10);
    if (isNaN(newInit)) {
      alert('请输入有效的先攻数值');
      setEditingInitiative(null);
      return;
    }
    setEditingInitiative(null);
    const updatedCombatants = record.combatants
      .map((c) => (c.id === combatantId ? { ...c, initiative: newInit } : c))
      .sort((a, b) => b.initiative - a.initiative);
    combatStore.update(record.id, { combatants: updatedCombatants, updatedAt: Date.now() });
  };

  const handleBatchDelete = () => {
    if (!record) return;
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 个参战者吗？`)) return;
    const updatedCombatants = record.combatants.filter((c) => !selectedIds.has(c.id));
    const updatedRounds = record.rounds.map((round) => {
      const newRound = { ...round };
      selectedIds.forEach((id) => delete newRound[id]);
      return newRound;
    });
    combatStore.update(record.id, { combatants: updatedCombatants, rounds: updatedRounds, updatedAt: Date.now() });
    setSelectedIds(new Set());
    setBatchMode(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return {
    initiativeOrder,
    getInitiativeCircle,
    handleConfirmInitiative,
    checkTieAndOpen,
    handleConfirmTiebreaker,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleAddRound,
    handleInitiativeSave,
    handleBatchDelete,
    toggleSelect,
    cardRefs: cardRefs as MutableRefObject<(HTMLDivElement | null)[]>,
    // 先攻编辑（只读化前遗留，供 §六 组件迁移消费）
    editingInitiative,
    setEditingInitiative,
    initiativeInput,
    setInitiativeInput,
    // 弹窗状态
    initiativeRollOpen,
    setInitiativeRollOpen,
    selectedPc,
    setSelectedPc,
    d20Input,
    setD20Input,
    tiebreakerOpen,
    setTiebreakerOpen,
    tiedOrder,
    setTiedOrder,
    draggingIndex,
  };
}
