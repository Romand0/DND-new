// 战斗场景主页面（拆分后）—— 仅负责：路由 + 布局 + hooks 接线 + 组件组合
// 行数目标：<600 行。任何独立子域请迁移到 @/hooks/combat/* 或 @/components/combat/*
import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { characterStore } from '@/data/characterStore';
import type { Character, Attack, Equipment } from '@/types/character';
import battlegroundStore from '@/data/battlegroundStore';
import combatStore, { applyEquipmentChange } from '@/data/combatStore';
import type {
  CombatRecord, Combatant, RoundAction, EquipmentChanges, NpcAttack,
} from '@/types/combat';
import type { ItemToken } from '@/types/battleground';

// —— 子 hooks（9 个独立子域）——
import { useCombatInventories } from '@/hooks/combat/useCombatInventories';
import { useActions } from '@/hooks/combat/useActions';
import { useThrownDrop, chebyDist, calcThrownDropPos } from '@/hooks/combat/useThrownDrop';
import { useSurprise } from '@/hooks/combat/useSurprise';
import { useInitiative } from '@/hooks/combat/useInitiative';
import { useDamageAndHp } from '@/hooks/combat/useDamageAndHp';
import { useRoundTurn, TurnSnapshot } from '@/hooks/combat/useRoundTurn';
import { useManualRecord } from '@/hooks/combat/useManualRecord';
import { usePlayback } from '@/hooks/combat/usePlayback';

// —— 子组件（8 个战斗专属）——
import InitiativeRollDialog from '@/components/combat/InitiativeRollDialog';
import InitiativeTiebreakerDialog from '@/components/combat/InitiativeTiebreakerDialog';
import SurpriseAttackDialog from '@/components/combat/SurpriseAttackDialog';
import RewindDialog from '@/components/combat/RewindDialog';
import ManualRecordDialog from '@/components/combat/ManualRecordDialog';
import PlaybackToolbar from '@/components/combat/PlaybackToolbar';
import CombatantList from '@/components/combat/CombatantList';
import InitiativeTable from '@/components/combat/InitiativeTable';

// —— 复用组件（既有）——
import Battleground from '@/components/Battleground';
import CombatAttackModal from '@/components/CombatAttackModal';
import CombatSpellModal from '@/components/CombatSpellModal';
import CombatDamageModal from '@/components/CombatDamageModal';
import TurnTodoBoard from '@/components/TurnTodoBoard';
import NpcCreator from '@/components/NpcCreator';

export default function CombatSession() {
  const { sessionId: id = '' } = useParams<{ sessionId?: string }>();

  // ========= 1. 顶层共享 state =========
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [_, forceRender] = useState(0);
  const rerender = () => forceRender((n) => n + 1);

  const [editingInitiative, setEditingInitiative] = useState<string | null>(null);
  const [initiativeInput, setInitiativeInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ round: number; combatantId: string } | null>(null);

  const rollbackSnapshotRef = useRef<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>({ initial: null, snapshots: {} });
  const playbackSnapshotRef = useRef<any>(null);

  const [addNpcOpen, setAddNpcOpen] = useState(false);
  const [attackModal, setAttackModal] = useState<{
    attacker: Combatant; target: Combatant;
    attackerPos?: { col: number; row: number };
    targetPos?: { col: number; row: number };
  } | null>(null);
  const [spellModal, setSpellModal] = useState<{
    caster: Combatant; target: Combatant;
  } | null>(null);
  const [damageModal, setDamageModal] = useState<{
    attacker: Combatant; target: Combatant; attack: Attack | NpcAttack;
    disadvantage?: boolean; isCritical?: boolean;
  } | null>(null);

  const [loadedWeapons, setLoadedWeapons] = useState<Record<string, boolean>>({});
  const [rewindModalOpen, setRewindModalOpen] = useState(false);

  // ========= 2. store 订阅 =========
  useEffect(() => {
    setCharacters(characterStore.getAll());
    setRecord(combatStore.get(id) ?? null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(id) ?? null);
      rerender();
    });
    const unsubBg = battlegroundStore.subscribe(() => rerender());
    return () => { unsub(); unsubBg(); };
  }, [id]);

  // ========= 3. hooks 调用（依赖顺序严格） =========
  const { combatInventories, getEffectiveAc } = useCombatInventories(record);

  const {
    currentMode, canUseAction, consumeCombatantAction,
    markLoadingAttacked, resetCombatantActions,
  } = useActions(record);

  const { executeThrownDrop } = useThrownDrop(record ? record.id : null);

  const surprise = useSurprise(record);
  const {
    surpriseAttackOpen, surprisedCombatants, setSurprisedCombatants,
    openSurpriseAttackModal, confirmSurpriseAttack,
  } = surprise;

  const playbackMode = currentMode() === 'playback';
  // 先实例化一次占位（currentTurn 此时为 null），后面 roundTurn.currentTurn 可用后再覆盖
  const _damageHpStub = useDamageAndHp(record, { currentTurn: null, playbackMode });
  void _damageHpStub;

  const roundTurn = useRoundTurn(record, {
    autoFillDownedMarkers: _damageHpStub.autoFillDownedMarkers,
    resetCombatantActions,
    rollbackSnapshotRef,
  });
  const {
    currentTurn, playbackStarted, handleCellChange,
    appendRoundRecord, findNextValidTurn, takeTurnSnapshot, applyRollback,
    confirmEndTurn, resolveWriteCell, setCurrentTurn, setPlaybackStarted,
    confirmEndTurnOpen, setConfirmEndTurnOpen,
  } = roundTurn;

  const playback = usePlayback(record, {
    playbackStarted, setPlaybackStarted,
    currentTurn, setCurrentTurn,
    rollbackSnapshotRef, playbackSnapshotRef,
    findNextValidTurn, resetCombatantActions, takeTurnSnapshot,
    autoFillDownedMarkers: _damageHpStub.autoFillDownedMarkers,
    selectedCell,
  });
  const {
    exitPlaybackModalOpen, setExitPlaybackModalOpen,
    handleModeChange, finalizeExitPlayback, startPlayback,
  } = playback;

  // 带 currentTurn 的最终 useDamageAndHp 实例（实际使用的）
  const damageHp = useDamageAndHp(record, { currentTurn, playbackMode });

  // onAddXxx / onRemoveXxx callbacks（useInitiative 注入）
  const onAddCombatant = (char?: Character) => {
    initiativeRefs.setInitiativeRollOpen(true);
    initiativeRefs.setSelectedPc(char ?? null);
    initiativeRefs.setD20Input('');
  };
  const onRemoveCombatant = (combatantId: string) => {
    if (!record) return;
    if (!confirm('确定移除该参战者吗？')) return;
    const updatedCombatants = record.combatants.filter(c => c.id !== combatantId);
    const updatedRounds = record.rounds.map(r => {
      const nr = { ...r }; delete nr[combatantId]; return nr;
    });
    combatStore.update(record.id, { combatants: updatedCombatants, rounds: updatedRounds, updatedAt: Date.now() });
  };
  const onAddNpc = (c: Omit<Combatant, 'id'>) => {
    if (!record) return;
    const newId = crypto.randomUUID();
    const newCombatant: Combatant = {
      ...c, id: newId, isPc: false, actions: 1,
      currentHp: c.currentHp ?? c.maxHp ?? 0,
      isDead: (c.currentHp ?? c.maxHp ?? 1) <= 0,
    };
    const updatedCombatants = [...record.combatants, newCombatant].sort((a, b) => b.initiative - a.initiative);
    const updatedRounds = record.rounds.map(r => ({ ...r, [newId]: '' }));
    combatStore.update(record.id, { combatants: updatedCombatants, rounds: updatedRounds, updatedAt: Date.now() });
    initiativeRefs.checkTieAndOpen(newId);
    setAddNpcOpen(false);
  };
  const onBatchAddNpc = (list: Omit<Combatant, 'id'>[]) => {
    if (!record) return;
    const newCombatants: Combatant[] = list.map((c, i) => ({
      ...c,
      id: `${crypto.randomUUID()}-${i}`,
      isPc: false, actions: 1,
      currentHp: c.currentHp ?? c.maxHp ?? 0,
      isDead: (c.currentHp ?? c.maxHp ?? 1) <= 0,
    }));
    const updatedCombatants = [...record.combatants, ...newCombatants].sort((a, b) => b.initiative - a.initiative);
    const updatedRounds = record.rounds.map(r => {
      const nr = { ...r };
      newCombatants.forEach(nc => { nr[nc.id] = ''; });
      return nr;
    });
    combatStore.update(record.id, { combatants: updatedCombatants, rounds: updatedRounds, updatedAt: Date.now() });
    setAddNpcOpen(false);
  };

  const initiativeRefs = useInitiative(record, {
    editingInitiative, setEditingInitiative,
    initiativeInput, setInitiativeInput,
    selectedIds, setSelectedIds, batchMode, setBatchMode,
    onAddCombatant, onRemoveCombatant, onAddNpc, onBatchAddNpc,
  });
  const {
    getInitiativeCircle,
    handleConfirmInitiative, handleConfirmTiebreaker,
    handleDragStart, handleDragMove, handleDragEnd,
    handleAddRound, handleInitiativeSave, handleBatchDelete,
    toggleSelect, cardRefs,
    initiativeRollOpen, setInitiativeRollOpen,
    selectedPc, setSelectedPc, d20Input, setD20Input,
    tiebreakerOpen, setTiebreakerOpen,
    tiedOrder, setTiedOrder, draggingIndex,
  } = initiativeRefs;

  const manRec = useManualRecord(record, {
    selectedCell, setSelectedCell,
    canUseAction, consumeCombatantAction,
    getEffectiveAc,
    handleApplyDamage: damageHp.handleApplyDamage,
    handleCellChange,
  });
  const {
    manualRecordOpen, setManualRecordOpen,
    manualRecordType, setManualRecordType,
    manualTargetId, setManualTargetId,
    manualAttackMethod, setManualAttackMethod,
    manualDamage, setManualDamage,
    manualIsKill, setManualIsKill,
    manualHealMethod, setManualHealMethod,
    manualHealAmount, setManualHealAmount,
    manualAttackRoll, setManualAttackRoll,
    confirmManualRecord, cancelManualRecord,
  } = manRec;

  // ========= 4. 统一 helper：通过 applyEquipmentChange 写入 record =========
  const updateCombatantEquipment = (
    combatantId: string,
    mutator: (ch: EquipmentChanges) => void,
  ) => {
    if (!record) return;
    const latest = combatStore.get(record.id) ?? record;
    const cur = latest?.equipmentChanges?.[combatantId];
    const newChanges = applyEquipmentChange(cur, mutator);
    const newEquipmentChanges = {
      ...(latest?.equipmentChanges ?? {}),
      [combatantId]: newChanges,
    };
    combatStore.update(record.id, { equipmentChanges: newEquipmentChanges, updatedAt: Date.now() });
  };

  // ========= 5. 攻击/法术/接线流程 =========
  const bg = useMemo(() => record ? battlegroundStore.get(record.id) : null, [record, _]);
  const tokenMap = useMemo(() => {
    const m = new Map<string, { col: number; row: number }>();
    if (bg) bg.tokens.forEach(t => { m.set(t.combatantId, { col: t.col, row: t.row }); });
    return m;
  }, [bg]);
  const actionsMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (record) record.combatants.forEach(c => { m[c.id] = c.actions ?? 1; });
    return m;
  }, [record]);

  const handleRequestAttack = (attacker: Combatant, target: Combatant) => {
    if (playbackMode && currentTurn && playbackStarted) {
      if (currentTurn.combatantId !== attacker.id) {
        const currentName = record?.combatants.find(c => c.id === currentTurn.combatantId)?.name ?? '';
        alert(`当前轮到 ${currentName} 的行动，无法使用 ${attacker.name} 发动攻击`);
        return;
      }
    }
    setAttackModal({
      attacker, target,
      attackerPos: tokenMap.get(attacker.id),
      targetPos: tokenMap.get(target.id),
    });
  };
  const handleRequestSpell = (caster: Combatant, target: Combatant) => {
    if (playbackMode && currentTurn && playbackStarted && currentTurn.combatantId !== caster.id) {
      alert(`当前不是 ${caster.name} 的行动回合`);
      return;
    }
    setSpellModal({ caster, target });
  };
  const handlePickupItem = (item: ItemToken, picker: Combatant) => {
    if (!record || !bg) return;
    if (item.equipmentData && Object.keys(item.equipmentData).length > 0) {
      const childId = `combat-${picker.id}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      updateCombatantEquipment(picker.id, (ch) => {
        ch.added.push({ childId, equipment: item.equipmentData });
      });
    } else {
      alert('此掉落物无法直接加入背包');
      return;
    }
    const nextItemTokens = (bg.itemTokens ?? []).filter(t => t.id !== item.id);
    if (nextItemTokens.length !== (bg.itemTokens ?? []).length) {
      // 逐个移除（battlegroundStore.removeItemToken 有 notify）
      for (const oldT of bg.itemTokens ?? []) {
        if (!nextItemTokens.some(nt => nt.id === oldT.id)) {
          battlegroundStore.removeItemToken(record.id, oldT.id);
        }
      }
    }
  };

  // 攻击命中 -> 打开伤害弹窗
  const onConfirmHit = (attack: Attack | NpcAttack, info: any) => {
    if (!attackModal || !record) return;
    const { attacker, target } = attackModal;
    const write = resolveWriteCell(attacker.id);
    if (write) {
      const line = `对 ${target.name} 的攻击命中，用${info.usageMode === 'thrown' ? '投掷' : '近战'}${attack.name}（${info.d20Final}+${info.bonus}=${info.total}${info.isNatural20 ? '💥重击' : ''}${info.isNatural1 ? '💩自然1' : ''}）造成伤害`;
      appendRoundRecord(write.round, write.combatantId, line);
    }
    if (info.ammoConsumed) {
      updateCombatantEquipment(attacker.id, (ch) => {
        ch.quantityDeltas[info.ammoConsumed.ammoChildId] =
          (ch.quantityDeltas[info.ammoConsumed.ammoChildId] ?? 0) - 1;
      });
      const w2 = resolveWriteCell(attacker.id);
      if (w2) appendRoundRecord(w2.round, w2.combatantId, `消耗 1 发${info.ammoConsumed.ammoName}`);
    }
    if (info.usageMode === 'thrown' && attackModal.attackerPos && attackModal.targetPos && bg) {
      const dist = chebyDist(attackModal.attackerPos, attackModal.targetPos);
      const gridCols = bg.size === 'small' ? 12 : bg.size === 'medium' ? 24 : 36;
      const gridRows = bg.size === 'small' ? 18 : bg.size === 'medium' ? 36 : 54;
      const dropPos = calcThrownDropPos(
        attackModal.attackerPos,
        attackModal.targetPos,
        true,
        dist * 5,
        target.speed ?? 30,
        gridCols,
        gridRows,
      );
      const latest = combatStore.get(record.id) ?? record;
      executeThrownDrop(
        attacker, target, attack,
        attackModal.attackerPos, attackModal.targetPos,
        true, latest, 'thrown',
      );
      void dropPos;
    }
    if (playbackMode) markLoadingAttacked(attacker.id);
    if (playbackMode) consumeCombatantAction(attacker.id);
    setDamageModal({
      attacker, target, attack,
      disadvantage: info.disadvantage,
      isCritical: info.isNatural20,
    });
    setAttackModal(null);
  };

  const onAttackMiss = (info: any) => {
    if (!attackModal || !record) return;
    const { attacker, target } = attackModal;
    const write = resolveWriteCell(attacker.id);
    if (write) {
      const line = `对 ${target.name} 的攻击未命中，${info.attackName}（${info.d20Final}+${info.bonus}=${info.total}${info.isNatural1 ? '💩自然1' : ''}）打偏了`;
      appendRoundRecord(write.round, write.combatantId, line);
    }
    if (info.ammoConsumed) {
      updateCombatantEquipment(attacker.id, (ch) => {
        ch.quantityDeltas[info.ammoConsumed.ammoChildId] =
          (ch.quantityDeltas[info.ammoConsumed.ammoChildId] ?? 0) - 1;
      });
      const w2 = resolveWriteCell(attacker.id);
      if (w2) appendRoundRecord(w2.round, w2.combatantId, `消耗 1 发${info.ammoConsumed.ammoName}`);
    }
    if (playbackMode) markLoadingAttacked(attacker.id);
    if (playbackMode) consumeCombatantAction(attacker.id);
    setAttackModal(null);
  };

  const onApplyDamage = (payload: any) => {
    if (!damageModal || !record) return;
    const { attacker, target } = damageModal;
    damageHp.handleApplyDamage(target.id, payload.newHp, payload.status);
    const crit = damageModal.isCritical || payload.isCritical ? '（重击！）' : '';
    const write = resolveWriteCell(attacker.id);
    if (write) {
      const parts = (payload.diceValues ?? []).join(' + ');
      appendRoundRecord(write.round, write.combatantId,
        `造成 ${payload.damage} 点伤害${crit}[${parts} + ${payload.damageBonus}]`);
      if (payload.status === 'dead') appendRoundRecord(write.round, write.combatantId, `击杀 ${target.name}！`);
      else if (payload.status === 'unconscious') appendRoundRecord(write.round, write.combatantId, `${target.name} 被击昏！`);
    }
    setDamageModal(null);
  };

  const onLoadedChange = (k: string, v: boolean) =>
    setLoadedWeapons(lw => ({ ...lw, [k]: v }));

  const onCastResolved = (info: any) => {
    if (!spellModal || !record) return;
    const { caster, target } = spellModal;
    damageHp.handleApplyDamage(target.id, info.newHp, info.status);
    const write = resolveWriteCell(caster.id);
    if (write) {
      let line = `施放 ${info.spellName}`;
      if (info.success === false && info.checkType !== 'none') {
        line += `，${target.name} 成功闪避（检定失败）`;
      } else {
        line += `对 ${target.name} ${info.effectType === 'damage' ? '造成' : '恢复'} ${info.amount} 点`;
        if (info.status === 'dead') line += `，击杀！`;
        else if (info.status === 'unconscious') line += `，击昏！`;
      }
      appendRoundRecord(write.round, write.combatantId, line);
    }
    if (playbackMode) consumeCombatantAction(caster.id);
    setSpellModal(null);
  };

  // ========= 6. 主渲染 =========
  if (!record) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300">未找到战斗记录。正在加载…</p>
      </div>
    );
  }

  const currentTurnCombatant = currentTurn
    ? record.combatants.find(c => c.id === currentTurn.combatantId)
    : null;
  const currentTurnText = currentTurn
    ? `回合 ${currentTurn.round + 1} · ${currentTurnCombatant?.name ?? '—'}`
    : '未开始';
  const manRecTarget = manualTargetId ? record.combatants.find(c => c.id === manualTargetId) : null;

  const toggleTodoExecuted = (todoId: string) => {
    const latest = combatStore.get(record.id);
    if (!latest?.turnTodos) return;
    const updated = latest.turnTodos.map(t =>
      t.id === todoId ? { ...t, executed: !t.executed } : t,
    );
    combatStore.update(record.id, { turnTodos: updated, updatedAt: Date.now() });
  };

  const surpriseTargetsArr = record.combatants.filter(c => surprisedCombatants.has(c.id));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">⚔️ 战斗：{record.title ?? record.id.slice(0, 8)}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              参战者 {record.combatants.length} · 回合 {record.rounds.length}
              {record.mode === 'playback' && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">放映模式</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-300 bg-white p-0.5 dark:border-gray-600 dark:bg-gray-800">
              <button
                onClick={() => handleModeChange('simulation')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  record.mode !== 'playback' ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >🧪 模拟模式</button>
              <button
                onClick={() => handleModeChange('playback')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  record.mode === 'playback' ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >🎬 放映模式</button>
            </div>
            <button onClick={handleAddRound} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">＋ 添加回合</button>
            <button onClick={() => onAddCombatant()} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">➕ 添加角色</button>
            <button onClick={() => setAddNpcOpen(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">👹 添加敌人</button>
            <button
              onClick={() => openSurpriseAttackModal(Math.max(0, record.rounds.length - 1))}
              className="rounded-lg border border-red-400 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
            >🐉 突袭！</button>
          </div>
        </header>

        {record.mode === 'playback' && (
          <PlaybackToolbar
            playbackStarted={playbackStarted}
            onStartPlayback={startPlayback}
            onConfirmEndTurn={() => setConfirmEndTurnOpen(true)}
            currentTurnText={currentTurnText}
            onExitPlayback={() => handleModeChange('simulation')}
            onRewind={() => setRewindModalOpen(true)}
            onOpenManual={() => {
              if (!currentTurn) { alert('请先点击「开始放映」'); return; }
              setSelectedCell({ round: currentTurn.round, combatantId: currentTurn.combatantId });
              setManualRecordOpen(true);
              setManualRecordType(null);
            }}
          />
        )}

        {confirmEndTurnOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">确认结束当前回合？</h2>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">完成 {currentTurnText}，切到下一参战者。</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmEndTurnOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">取消</button>
                <button onClick={confirmEndTurn} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">确认结束</button>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <Battleground
              sessionId={record.id}
              combatants={record.combatants}
              onRequestAttack={handleRequestAttack}
              onRequestSpell={handleRequestSpell}
              onPickupItem={handlePickupItem}
              activeTurnCombatantId={record.mode === 'playback' ? (currentTurn?.combatantId ?? null) : null}
              playbackOnlyMovableId={record.mode === 'playback' && playbackStarted ? (currentTurn?.combatantId ?? null) : null}
              combatInventories={combatInventories}
              equipmentChangesMap={record.equipmentChanges}
              onUpdateChanges={(cid, changes) => {
                if (!record) return;
                const latest = combatStore.get(record.id) ?? record;
                combatStore.update(record.id, {
                  equipmentChanges: { ...(latest.equipmentChanges ?? {}), [cid]: changes },
                  updatedAt: Date.now(),
                });
              }}
              onRemoveItem={(cid, item) => updateCombatantEquipment(cid, (ch) => {
                const sid = item.childId || item.id;
                if (!ch.removedChildIds.includes(sid)) ch.removedChildIds.push(sid);
              })}
              mode={record.mode === 'playback' ? 'playback' : 'simulation'}
              actionsMap={actionsMap}
            />
            {record.mode === 'playback' && (
              <TurnTodoBoard record={record} currentTurn={currentTurn} combatants={record.combatants} />
            )}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <CombatantList
              combatants={record.combatants}
              turnTodos={record.turnTodos}
              getEffectiveAc={getEffectiveAc}
              batchMode={batchMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={(checked) => setSelectedIds(checked ? new Set(record.combatants.map(c => c.id)) : new Set())}
              onSetBatchMode={setBatchMode}
              onBatchDelete={handleBatchDelete}
              editingInitiative={editingInitiative}
              initiativeInput={initiativeInput}
              onInitiativeInputChange={setInitiativeInput}
              onStartEditInitiative={(cid) => {
                const c = record.combatants.find(x => x.id === cid);
                if (!c) return;
                setEditingInitiative(cid);
                setInitiativeInput(String(c.initiative));
              }}
              onSaveInitiative={handleInitiativeSave}
              onCancelEditInitiative={() => setEditingInitiative(null)}
              onRemoveCombatant={onRemoveCombatant}
              currentTurnId={currentTurn?.combatantId ?? null}
              currentTurnRound={currentTurn?.round ?? 0}
            />
            <InitiativeTable
              combatants={record.combatants}
              rounds={record.rounds}
              selectedCell={selectedCell}
              onCellClick={(r, cid) => {
                if (record.mode === 'playback') {
                  setSelectedCell({ round: r, combatantId: cid });
                  setManualRecordOpen(true);
                  setManualRecordType(null);
                  return;
                }
                setSelectedCell(sel =>
                  (sel && sel.round === r && sel.combatantId === cid) ? null : { round: r, combatantId: cid });
              }}
              onCellChange={handleCellChange}
              currentTurnId={currentTurn?.combatantId ?? null}
              currentTurnRound={currentTurn?.round ?? 0}
              getInitiativeCircle={getInitiativeCircle}
              turnTodos={record.turnTodos}
              onToggleTodo={toggleTodoExecuted}
            />
          </div>
        </div>
      </div>

      {/* 弹窗层 */}
      <InitiativeRollDialog
        open={initiativeRollOpen}
        characters={characters}
        selectedPc={selectedPc}
        onSelectPc={setSelectedPc}
        d20Input={d20Input}
        onD20Change={setD20Input}
        onConfirm={handleConfirmInitiative}
        onClose={() => { setInitiativeRollOpen(false); setSelectedPc(null); setD20Input(''); }}
      />
      <InitiativeTiebreakerDialog
        open={tiebreakerOpen}
        tiedOrder={tiedOrder}
        cardRefs={cardRefs}
        draggingIndex={draggingIndex}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onChangeOrder={setTiedOrder}
        onConfirm={handleConfirmTiebreaker}
        onClose={() => { setTiebreakerOpen(false); setTiedOrder([]); }}
      />
      <SurpriseAttackDialog
        open={surpriseAttackOpen}
        combatants={surpriseTargetsArr}
        onConfirm={confirmSurpriseAttack}
        onClose={() => { void setSurprisedCombatants; surprise.setSurpriseAttackOpen(false); }}
      />
      <RewindDialog
        open={rewindModalOpen}
        onRewind={() => {
          if (!currentTurn) return;
          const combatantIdx = record.combatants.findIndex(c => c.id === currentTurn.combatantId);
          applyRollback(currentTurn.round, combatantIdx);
          setRewindModalOpen(false);
        }}
        onCancel={() => setRewindModalOpen(false)}
      />
      <ManualRecordDialog
        open={manualRecordOpen}
        recordType={manualRecordType}
        combatants={record.combatants}
        attackerName={selectedCell ? (record.combatants.find(c => c.id === selectedCell.combatantId)?.name ?? '—') : '—'}
        onSetType={setManualRecordType}
        targetId={manualTargetId}
        onTargetIdChange={setManualTargetId}
        attackMethod={manualAttackMethod}
        onAttackMethodChange={setManualAttackMethod}
        attackRoll={manualAttackRoll}
        onAttackRollChange={setManualAttackRoll}
        damage={manualDamage}
        onDamageChange={setManualDamage}
        isKill={manualIsKill}
        onIsKillChange={setManualIsKill}
        targetAc={manRecTarget ? getEffectiveAc(manRecTarget) : null}
        healMethod={manualHealMethod}
        onHealMethodChange={setManualHealMethod}
        healAmount={manualHealAmount}
        onHealAmountChange={setManualHealAmount}
        actionsLeft={selectedCell ? (record.combatants.find(c => c.id === selectedCell.combatantId)?.actions ?? -1) : -1}
        onConfirm={confirmManualRecord}
        onCancel={cancelManualRecord}
      />
      {exitPlaybackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">退出放映模式</h2>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">放映期间的改动是否保留？</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => finalizeExitPlayback(true)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">✅ 保留所有改动</button>
              <button onClick={() => finalizeExitPlayback(false)} className="rounded-lg border border-orange-400 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-100">⏪ 还原至放映前快照</button>
              <button onClick={() => setExitPlaybackModalOpen(false)} className="mt-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">取消</button>
            </div>
          </div>
        </div>
      )}
      {addNpcOpen && (
        <NpcCreator
          onClose={() => setAddNpcOpen(false)}
          onCreate={onAddNpc}
          onBatchCreate={onBatchAddNpc}
        />
      )}
      {attackModal && (
        <CombatAttackModal
          attacker={attackModal.attacker}
          target={attackModal.target}
          attackerPos={attackModal.attackerPos}
          targetPos={attackModal.targetPos}
          onClose={() => setAttackModal(null)}
          onConfirmHit={onConfirmHit}
          onAttackMiss={onAttackMiss}
          combatInventory={combatInventories[attackModal.attacker.id]}
          targetCharacter={attackModal.target.characterId
            ? (characterStore.get(attackModal.target.characterId) ?? null)
            : null}
          targetCombatInventory={combatInventories[attackModal.target.id]}
          loadedWeapons={loadedWeapons}
          onLoadedChange={onLoadedChange}
          loadingAttackedThisRound={record.loadingAttackedThisRound ?? {}}
          combatMode={record.mode === 'playback' ? 'playback' : 'simulation'}
        />
      )}
      {spellModal && (
        <CombatSpellModal
          caster={spellModal.caster}
          target={spellModal.target}
          onClose={() => setSpellModal(null)}
          onCastResolved={onCastResolved}
          targetCombatInventory={combatInventories[spellModal.target.id]}
        />
      )}
      {damageModal && (
        <CombatDamageModal
          attacker={damageModal.attacker}
          target={damageModal.target}
          attack={damageModal.attack}
          disadvantage={damageModal.disadvantage}
          onApplyDamage={onApplyDamage}
          onClose={() => setDamageModal(null)}
        />
      )}
    </div>
  );
}
