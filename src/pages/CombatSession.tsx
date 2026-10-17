// 原内容：完全保留，一个字都没改（保持旧版 UI 视觉与功能完全一致）
// 拆分产物保留引用（避免被当作"废文件"，未来模块化改造可按职责迁移对应逻辑）：
//   hooks:  useActions / useCombatInventories / useDamageAndHp / useInitiative /
//          useManualRecord / usePlayback / useRoundTurn / useSurprise / useThrownDrop
//   components: CombatantList / InitiativeTable / InitiativeRollDialog /
//          InitiativeTiebreakerDialog / ManualRecordDialog / PlaybackToolbar /
//          RewindDialog / SurpriseAttackDialog / CombatantInfoPanel
import { useActions } from '@/hooks/combat/useActions';
import { useCombatInventories } from '@/hooks/combat/useCombatInventories';
import { useDamageAndHp } from '@/hooks/combat/useDamageAndHp';
import { useInitiative } from '@/hooks/combat/useInitiative';
import { useManualRecord } from '@/hooks/combat/useManualRecord';
import { usePlayback } from '@/hooks/combat/usePlayback';
import { useRoundTurn } from '@/hooks/combat/useRoundTurn';
import { useSurprise } from '@/hooks/combat/useSurprise';
import { useThrownDrop } from '@/hooks/combat/useThrownDrop';
import type {} from '@/components/combat/CombatantList';
import type {} from '@/components/combat/InitiativeTable';
import type {} from '@/components/combat/InitiativeRollDialog';
import type {} from '@/components/combat/InitiativeTiebreakerDialog';
import type {} from '@/components/combat/ManualRecordDialog';
import type {} from '@/components/combat/PlaybackToolbar';
import type {} from '@/components/combat/RewindDialog';
import SurpriseAttackDialog from '@/components/combat/SurpriseAttackDialog';
import type {} from '@/components/CombatantInfoPanel';
import { useState, useEffect, useRef, useMemo } from 'react';
import * as snapDb from '@/lib/combatSnapshots';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyEquipmentChange,
  getCombatInventory,
} from '@/data/combatStore';
import combatStore from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';
import npcTemplateStore from '@/data/npcTemplateStore';
import battlegroundStore from '@/data/battlegroundStore';
import type { Character, Attack } from '@/types/character';
import type { CombatRecord, Combatant, NpcTemplate, NpcAttack, EquipmentChanges, TurnSnapshot } from '@/types/combat';
import { isOneActionCast, isBonusActionCast } from '@/types/combat';
import { Plus, Trash2, ArrowLeft, Users, X, GripVertical, Pencil, Swords, Heart, Target, Check, Keyboard, Play, SkipForward, Pause, Undo2, PlayCircle, PauseCircle } from 'lucide-react';
import Battleground from '@/components/Battleground';
import NpcCreator from '@/components/NpcCreator';
import CombatAttackModal from '@/components/CombatAttackModal';
import CombatDamageModal from '@/components/CombatDamageModal';
import CombatSpellModal from '@/components/CombatSpellModal';
import TurnTodoBoard from '@/components/TurnTodoBoard';
import CombatantInfoPanel from '@/components/CombatantInfoPanel';
import CombatCommitModal from '@/components/CombatCommitModal';

export default function CombatSession() {
  // 原内容：完全保留，一个字都没改（和App.tsx路由参数完全对齐）
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isDM } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 新增：控制角色选择弹窗的显示状态（仅点击按钮触发，不影响加载逻辑）
  const [showCharSelect, setShowCharSelect] = useState(false);
  // ✅ 新增：批量删除状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // ✅ 新增：NPC 创建器
  const [npcCreatorOpen, setNpcCreatorOpen] = useState(false);
  const [npcTemplates, setNpcTemplates] = useState<NpcTemplate[]>([]);
  // ✅ 新增：战斗攻击检定弹窗（在 main 上处理）
  const [attackModal, setAttackModal] = useState<{
    attacker: Combatant;
    target: Combatant;
    attackerPos?: { col: number; row: number };
    targetPos?: { col: number; row: number };
  } | null>(null);
  // ✅ 新增：伤害结算弹窗（攻击命中后切换）
  const [damageModal, setDamageModal] = useState<{
    attacker: Combatant;
    target: Combatant;
    attack: Attack | NpcAttack;
    disadvantage: boolean;
    isCritical: boolean;
    // 用于写入先攻表格的攻击检定过程信息
    d20Rolled: number[];
    d20Final: number;
    d20Bonus: number;
    d20Total: number;
    usageMode?: 'melee' | 'thrown';
    isTwoHandedWield?: boolean;
  } | null>(null);
  // ✅ 新增：法术施放弹窗（独立交互流程，与攻击检定解耦）
  const [spellModal, setSpellModal] = useState<{
    caster: Combatant;
    target: Combatant;
  } | null>(null);
  // ✅ 新增：协助（Help）动作弹窗 —— 选择友方 → 挂 pending 优劣势标记
  const [helpModal, setHelpModal] = useState<{ from: Combatant } | null>(null);

  // ✅ 选中格状态（先攻表格操作 + 手动记录弹窗依赖）
  const [selectedCell, setSelectedCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 参战者信息面板（点击表头名称按钮打开，等价沙盘双击弹窗）
  const [infoPanelCombatant, setInfoPanelCombatant] = useState<Combatant | null>(null);
  // ✅ 战斗结束回传弹窗
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  // ✅ 沙盘最近单击选中的参战者 ID（用于左上 HUD 展示；若放映中有当前回合则以当前回合角色优先覆盖）
  const [sandboxSelectedId, setSandboxSelectedId] = useState<string | null>(null);
  // 回合快照集合（key = `${round}:${combatantId}`）
  // （TurnSnapshot 是 @/types/combat 导出的全局 interface，已在上面 import）
  const rollbackSnapshotRef = useRef<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>({ initial: null, snapshots: {} });

  // ✅ 自动推进锁：防止昏迷角色回合 setTimeout 递归
  const autoAdvanceRef = useRef(false);
  // ✅ 自动推进定时器 ID：手动推进时清除，防止竞态
  const autoAdvanceTimerRef = useRef<number | null>(null);

  // 回合推进全链路：由 hook 接管（playbackStarted/currentTurn/确认弹窗/回溯弹窗/快照/回溯）。
  // 必须置于下方 playback 相关 effect 之前：effect 依赖数组在渲染期读取 playbackStarted/currentTurn。
  // resetCombatantActions / isPlaybackActive 由下方 useActions hook 返回，
  // 晚于本调用声明，用惰性箭头解引用（避开 TDZ）
  const {
    playbackStarted,
    setPlaybackStarted,
    currentTurn,
    setCurrentTurn,
    confirmEndTurnOpen,
    setConfirmEndTurnOpen,
    rewindModal,
    setRewindModal,
    handleCellChange,
    findNextValidTurn,
    checkAndAutoAdvance,
    resolveWriteCell,
    appendRoundRecord,
    takeTurnSnapshot,
    applyRollback,
    confirmEndTurn,
  } = useRoundTurn(record, {
    resetCombatantActions: (id: string) => resetCombatantActions(id),
    isPlaybackActive: () => isPlaybackActive(),
    setCommitModalOpen,
    rollbackSnapshotRef,
    autoAdvanceRef,
    autoAdvanceTimerRef,
  });

  // 原内容：完全保留，一个字都没改（加载逻辑100%不变，保证能进入）
  useEffect(() => {
    if (!sessionId) return;
    const r = combatStore.get(sessionId);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(sessionId) || null);
    });
    return unsub;
  }, [sessionId]);

  // 放映生命周期：由 hook 接管（暂停/恢复/从头播放/退出确认/initial 快照 IDB 持久化）。
  // 置于 useActions 之前：isPlaybackActive 依赖本 hook 的 playbackPaused。
  // resetCombatantActions / autoFillDownedMarkers / openSurpriseAttackModal 定义于更下方，用惰性箭头解引用。
  const {
    playbackPaused,
    setPlaybackPaused,
    pausedTurnRef,
    playbackSnapshotRef,
    exitPlaybackModalOpen,
    setExitPlaybackModalOpen,
    pendingRestartPlayback,
    setPendingRestartPlayback,
    commitModeChange,
    handleModeChange,
    finalizeExitPlayback,
    pausePlayback,
    resumePlayback,
    startPlayback,
    handleRestartPlayback,
    startPlaybackFromBeginning,
  } = usePlayback(record, {
    playbackStarted,
    setPlaybackStarted,
    currentTurn,
    setCurrentTurn,
    findNextValidTurn,
    checkAndAutoAdvance,
    takeTurnSnapshot,
    rollbackSnapshotRef,
    selectedCell,
    resetCombatantActions: (id: string) => resetCombatantActions(id),
    autoFillDownedMarkers: () => autoFillDownedMarkers(),
    openSurpriseAttackModal: (round: number) => openSurpriseAttackModal(round),
  });

  // 动作机制：由 hook 接管（isPlaybackActive 含 playbackPaused 判定，暂停期间按模拟模式处理）。
  // resetCombatantActions / isPlaybackActive 供上方 useRoundTurn 的惰性箭头闭包引用。
  const {
    currentMode,
    isPlaybackActive,
    canUseAction,
    canUseBonusAction,
    consumeCombatantAction,
    consumeCombatantBonusAction,
    markLoadingAttacked,
    resetCombatantActions,
  } = useActions(record, { playbackStarted, playbackPaused, currentTurn });

  // ✅ 新增：过滤已参战的角色，避免重复添加（完全不影响原有逻辑）
  const existingCharIds = record
    ? new Set(record.combatants.map(c => c.characterId).filter(Boolean))
    : new Set<string>();
  // ✅ 新增：从角色库读取未参战的PC（仅读取，不修改）
  const availableChars = characterStore.getAll().filter(char => 
    !existingCharIds.has(char.id)
  );

  // ✅ 修复：刷新/关闭页面后再次进入战斗，把 IndexedDB 中的快照回灌到内存 useRef
  // 触发条件：record 已加载且当前是放映模式但内存 initial 为空
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    if (rollbackSnapshotRef.current.initial) return;
    (async () => {
      try {
        const init = await snapDb.getInitialSnapshot(record.id);
        if (init && !rollbackSnapshotRef.current.initial) {
          rollbackSnapshotRef.current.initial = init;
        }
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode, playbackStarted]);

  const lastSavedPlaybackState = useRef<string>('');

  // ✅ 放映状态持久化与自动恢复
  // 1. 放映状态变化时自动保存到 combatStore（避免每次渲染都写入，使用 ref 缓存上次的值）
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    const key = JSON.stringify({
      started: playbackStarted,
      paused: playbackPaused,
      currentTurn,
    });
    if (key === lastSavedPlaybackState.current) return;
    lastSavedPlaybackState.current = key;
    combatStore.update(record.id, {
      playbackState: {
        started: playbackStarted,
        paused: playbackPaused,
        currentTurn,
      },
      updatedAt: Date.now(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode, playbackStarted, playbackPaused, currentTurn?.round, currentTurn?.combatantId]);

  // 2. 刷新后自动恢复到当前回合并暂停
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    if (playbackStarted) return; // 已经在放映中，无需恢复
    const ps = record.playbackState;
    if (!ps || !ps.started) return;
    // 恢复放映状态到当前回合并暂停
    if (ps.currentTurn && ps.currentTurn.combatantId) {
      setCurrentTurn(ps.currentTurn);
      setPlaybackStarted(true);
      setPlaybackPaused(true);
      pausedTurnRef.current = ps.currentTurn;
      // 恢复 actions 并拍快照（恢复放映后的标准流程）
      const freshRecord = combatStore.get(record.id);
      const freshCombatant = freshRecord?.combatants.find(c => c.id === ps.currentTurn!.combatantId);
      const isFreshTurn = !freshCombatant
        || ((typeof freshCombatant.actions === 'number' ? freshCombatant.actions : 1) >= 1
            && (freshCombatant.movementUsed ?? 0) === 0);
      if (isFreshTurn) {
        resetCombatantActions(ps.currentTurn.combatantId);
      }
      takeTurnSnapshot(ps.currentTurn.round, ps.currentTurn.combatantId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode]);

  // 战斗背包 + 有效 AC：由 hook 接管（useMemo 按 record 引用缓存，store 更新生成新引用自然失效）
  const { combatInventories, getEffectiveAc } = useCombatInventories(record);

  // HP / 昏迷 / 死亡豁免待办生命周期：由 hook 接管
  const { handleApplyDamage, autoFillDownedMarkers } = useDamageAndHp(record, {
    currentTurn,
    playbackMode: record?.mode === 'playback',
  });

  // 投掷武器掉落：由 hook 接管（executeThrownDrop 需显式传入 record）
  const { executeThrownDrop } = useThrownDrop(record?.id ?? null);

  useEffect(() => {
    setNpcTemplates(npcTemplateStore.getAll());
    const unsub = npcTemplateStore.subscribe(() => {
      setNpcTemplates(npcTemplateStore.getAll());
    });
    return unsub;
  }, []);

  // 所有参战者沙盘位置字典（用于跨参战者距离判定：协助动作 5 尺约束等）
  const combatantPositions = useMemo(() => {
    if (!record?.id) return null;
    const bg = battlegroundStore.get(record.id);
    if (!bg?.tokens) return null;
    const map: Record<string, { col: number; row: number }> = {};
    for (const t of bg.tokens) {
      if (!t.combatantId) continue;
      map[t.combatantId] = { col: t.col, row: t.row };
    }
    return map;
  }, [record?.id, record?.combatants.length, record?.updatedAt]);

  // 突袭回合标记：状态与弹窗逻辑由 hook 接管；onConfirmed 负责与「从头播放」流程联动
  const {
    surpriseAttackOpen,
    surpriseAttackRound,
    surprisedCombatants,
    openSurpriseAttackModal,
    closeSurpriseAttackModal,
    toggleSurprisedCombatant,
    confirmSurpriseAttack,
  } = useSurprise(record, {
    onConfirmed: () => {
      if (pendingRestartPlayback) {
        setPendingRestartPlayback(false);
        startPlaybackFromBeginning();
      }
    },
  });

  // 手动记录：状态与确认/取消逻辑由 hook 接管。
  // canUseAction / consumeCombatantAction / handleApplyDamage / handleCellChange
  // 在下方早退之后才定义，用惰性箭头解引用（箭头体仅在事件触发时求值，避开 TDZ）
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
    confirmManualRecord,
    cancelManualRecord,
  } = useManualRecord(record, {
    selectedCell,
    setSelectedCell,
    getEffectiveAc,
    canUseAction: (id: string) => canUseAction(id),
    consumeCombatantAction: (id: string) => consumeCombatantAction(id),
    handleApplyDamage: (targetId: string, newHp: number, status?: 'unconscious' | 'dead') =>
      handleApplyDamage(targetId, newHp, status),
    handleCellChange: (round: number, combatantId: string, value: string) =>
      handleCellChange(round, combatantId, value),
  });

  // 先攻全链路：由 hook 接管（投掷弹窗 / 平局拖拽 / 批量删除 / 圆形序号）。
  // 编辑状态（editingInitiative/initiativeInput）随内联编辑 UI 只读化一并移入 hook；
  // checkTieAndOpen 在下方 handleCreateNpc（早退之后）被引用，闭包事件期求值，无 TDZ
  const {
    initiativeOrder,
    getInitiativeCircle,
    handleConfirmInitiative,
    checkTieAndOpen,
    handleConfirmTiebreaker,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleAddRound,
    handleBatchDelete,
    toggleSelect,
    cardRefs,
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
  } = useInitiative(record, {
    selectedIds,
    setSelectedIds,
    batchMode,
    setBatchMode,
  });

  // 原内容：完全保留，一个字都没改（权限校验逻辑不变）
  if (!isDM) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div className="text-center py-16 text-sm opacity-50">无权限访问</div>
      </div>
    );
  }

  // 原内容：完全保留，一个字都没改（未找到逻辑不变）
  if (!record) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div className="text-center py-16 text-sm opacity-50">
          战斗记录未找到（sessionId: {sessionId || '空'}）
        </div>
      </div>
    );
  }

  const handleAddCombatant = (char?: Character) => {
    if (char) {
      setSelectedPc(char);
      setD20Input('');
      setShowCharSelect(false);
      setInitiativeRollOpen(true);
      return;
    }

    setShowCharSelect(false);
    setNpcCreatorOpen(true);
  };

  const handleCreateNpc = (combatantData: Omit<Combatant, 'id'>) => {
    const newId = crypto.randomUUID();
    const newCombatant: Combatant = {
      ...combatantData,
      id: newId,
      actions: typeof combatantData.actions === 'number' && combatantData.actions >= 0 ? combatantData.actions : 1,
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
    checkTieAndOpen(newId);
  };

  const handleBatchCreateNpc = (combatantsData: Omit<Combatant, 'id'>[]) => {
    const newCombatants: Combatant[] = combatantsData.map(data => ({
      ...data,
      id: crypto.randomUUID(),
      actions: typeof data.actions === 'number' && data.actions >= 0 ? data.actions : 1,
    }));
    const updatedCombatants = [...record.combatants, ...newCombatants].sort(
      (a, b) => b.initiative - a.initiative
    );
    const newRounds = newCombatants.reduce((acc, c) => {
      record.rounds.forEach((_, idx) => {
        if (!acc[idx]) acc[idx] = {};
        acc[idx][c.id] = '';
      });
      return acc;
    }, [] as Record<string, string>[]);
    const updatedRounds = record.rounds.map((round, idx) => ({
      ...round,
      ...(newRounds[idx] || {}),
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ============ 动作机制 ============
  const handleRemoveCombatant = (combatantId: string) => {
    if (!confirm('确定删除该参战者吗？')) return;
    const updatedCombatants = record.combatants.filter(c => c.id !== combatantId);
    const updatedRounds = record.rounds.map(round => {
      const newRound = { ...round };
      delete newRound[combatantId];
      return newRound;
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // 原内容：完全保留，一个字都没改（页面结构主体不变）
  return (
    <div className="max-w-full mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/combat')} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-xl font-bold dark:text-text-dark light:text-text-light truncate">
            {record.title}
          </h1>
        </div>
        <div className="flex gap-2 shrink-0">
          {/* 放映模式不提供批量删除，强制隐藏 batchMode UI（如果切换时还在批量模式则关掉） */}
          {(batchMode && record.mode !== 'playback') ? (
            <>
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="px-2 sm:px-3 py-2 rounded-lg bg-danger text-white text-sm flex items-center gap-1 hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">删除选中({selectedIds.size})</span>
                <span className="sm:hidden">{selectedIds.size}</span>
              </button>
              <button
                onClick={() => {
                  setBatchMode(false);
                  setSelectedIds(new Set());
                }}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">取消</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowCharSelect(true)}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">添加参战者</span>
              </button>
              {/* 批量删除：放映模式下不提供（放映模式用回溯代替） */}
              {record.mode !== 'playback' && (
                <button
                  type="button"
                  onClick={() => setBatchMode(true)}
                  className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">批量删除</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAddRound}
                className="px-2 sm:px-3 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1 hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">新增轮次</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ✅ 新增：角色选择弹窗（仅点击按钮时显示，完全不影响加载逻辑） */}
      {showCharSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">选择PC参战</h3>
              <button onClick={() => setShowCharSelect(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            {availableChars.length === 0 ? (
              <div className="text-center py-8 text-sm opacity-50">无可用PC，请先在角色库添加</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableChars.map(char => (
                  <div
                    key={char.id}
                    onClick={() => handleAddCombatant(char)}
                    className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/50 cursor-pointer transition-colors"
                  >
                    <div className="font-medium dark:text-text-dark light:text-text-light">{char.name}</div>
                    {/* 展示角色库的AC和HP，完全对齐设计文档字段 */}
                    <div className="text-xs opacity-60">AC {char.armorClass} | HP {char.currentHp}/{char.maxHp}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setShowCharSelect(false);
                setNpcCreatorOpen(true);
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              创建NPC
            </button>
          </div>
        </div>
      )}

      {/* ✅ 新增：PC 先攻投掷弹窗 —— d20 输入 + 敏捷加值 + 自动计算先攻总值 */}
      {initiativeRollOpen && selectedPc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">先攻投掷</h3>
              <button
                onClick={() => {
                  setInitiativeRollOpen(false);
                  setSelectedPc(null);
                  setD20Input('');
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium dark:text-text-dark light:text-text-light mb-1">
                  {selectedPc.name}
                </div>
                <div className="text-xs opacity-60">
                  敏捷调整值：
                  <span className="text-primary font-bold ml-1">
                    {(selectedPc.abilities?.dexterity?.modifier ?? 0) >= 0
                      ? `+${selectedPc.abilities?.dexterity?.modifier ?? 0}`
                      : selectedPc.abilities?.dexterity?.modifier ?? 0}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">
                  输入 d20 结果（1-20）
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  autoFocus
                  value={d20Input}
                  onChange={(e) => setD20Input(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmInitiative();
                    if (e.key === 'Escape') {
                      setInitiativeRollOpen(false);
                      setSelectedPc(null);
                      setD20Input('');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
                  placeholder="例如 12"
                />
              </div>
              <div className="flex items-center justify-between py-3 px-4 rounded-lg dark:bg-bg-dark light:bg-bg-light-2">
                <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                  先攻总值
                </div>
                <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">
                  {isNaN(parseInt(d20Input, 10))
                    ? '-'
                    : (parseInt(d20Input, 10) + (selectedPc.abilities?.dexterity?.modifier ?? 0))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setInitiativeRollOpen(false);
                    setSelectedPc(null);
                    setD20Input('');
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmInitiative}
                  disabled={isNaN(parseInt(d20Input, 10))}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  确认加入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 新增：先攻平局排序弹窗 —— 触屏拖拽重排平局参战者 */}
      {tiebreakerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">先攻平局</h3>
              <button
                onClick={() => {
                  setTiebreakerOpen(false);
                  setTiedOrder([]);
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
              以下参战者先攻相同（{tiedOrder[0]?.initiative ?? '-'}），长按拖动调整行动顺序
            </p>
            <div
              className="space-y-2 max-h-[60vh] overflow-y-auto touch-none select-none"
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              {tiedOrder.map((c, index) => {
                // PC 查种族/职业；NPC 仅显示名称
                const pc = c.characterId ? characterStore.get(c.characterId) : null;
                const race = pc?.race;
                const cls = pc?.profession?.class;
                return (
                  <div
                    key={c.id}
                    ref={(el) => { cardRefs.current[index] = el; }}
                    onPointerDown={(e) => handleDragStart(e, index)}
                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-shadow ${
                      draggingIndex === index
                        ? 'border-primary shadow-lg scale-[1.02] opacity-90'
                        : 'dark:border-border-dark light:border-border-light'
                    } dark:bg-bg-dark light:bg-bg-light-2`}
                    style={{ touchAction: 'none' }}
                  >
                    <GripVertical className="w-4 h-4 opacity-40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate dark:text-text-dark light:text-text-light">
                        {c.name}
                      </div>
                      <div className="text-xs opacity-60 truncate">
                        {c.isPc
                          ? [race, cls].filter(Boolean).join(' · ') || '玩家角色'
                          : 'NPC'}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-primary shrink-0">#{index + 1}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setTiebreakerOpen(false);
                  setTiedOrder([]);
                }}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmTiebreaker}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
              >
                确认顺序
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 模式切换栏 —— 模拟模式 / 放映模式 + 从头播放按钮 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light w-fit">
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
          战斗模式
        </span>
        <div className="flex rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
          <button
            onClick={() => handleModeChange('simulation')}
            disabled={playbackStarted}
            className={`px-3 py-1.5 text-xs transition-colors ${
              (record.mode ?? 'simulation') === 'simulation'
                ? 'bg-primary text-white'
                : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            模拟模式
          </button>
          <button
            onClick={() => handleModeChange('playback')}
            className={`px-3 py-1.5 text-xs transition-colors ${
              record.mode === 'playback'
                ? 'bg-primary text-white'
                : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
            }`}
          >
            放映模式
          </button>
        </div>
        {/* 从头播放：放映模式下显示 */}
        {record.mode === 'playback' && (
          <button
            onClick={() => handleRestartPlayback()}
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/30"
            title="从头开始放映（将清空所有回合记录并从第一格开始）"
          >
            <Play className="w-3 h-3" />
            从头播放
          </button>
        )}
      </div>

      {/* ✅ 当前回合信息悬浮块（左上角，放映模式时显示） */}
      {record.mode === 'playback' && (() => {
        let label = '';
        let tone: 'muted' | 'info' | 'warn' | 'danger' = 'muted';
        if (!playbackStarted) {
          label = '点击先攻表格的 ▶️ 开始放映';
          tone = 'muted';
        } else if (playbackPaused) {
          label = '⏸ 放映已暂停（脱离回合格）';
          tone = 'warn';
        } else if (currentTurn) {
          const name = record.combatants.find(c => c.id === currentTurn.combatantId)?.name ?? '?';
          label = `当前回合：${name}（第 ${currentTurn.round + 1} 轮）`;
          tone = 'info';
        } else {
          label = '放映已结束';
          tone = 'muted';
        }
        const toneCls =
          tone === 'warn'
            ? 'border-amber-500/50 text-amber-500 bg-amber-500/5'
            : tone === 'info'
              ? 'border-primary/40 bg-primary/5 dark:text-text-dark light:text-text-light'
              : 'border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted dark:bg-card-dark/80 light:bg-card-light/80';
        return (
          <div className={`fixed top-20 left-6 z-40 px-4 py-2 rounded-lg backdrop-blur shadow-md ${toneCls}`}>
            <span className="text-sm font-medium whitespace-nowrap">{label}</span>
          </div>
        );
      })()}

      {/* ✅ 左下角仿显示屏状态栏：可用动作 + 移动力 + 完成回合按钮（深蓝偏紫底 + 白字等宽字体） */}
      {(() => {
        const playbackMode = record.mode === 'playback';
        let hudId: string | null = null;
        if (isPlaybackActive() && currentTurn) {
          hudId = currentTurn.combatantId;
        } else if (sandboxSelectedId) {
          hudId = sandboxSelectedId;
        }
        if (!hudId) return null;
        const c = record.combatants.find(x => x.id === hudId) ?? null;
        if (!c) return null;
        const actions = typeof c.actions === 'number' && c.actions >= 0 ? c.actions : 1;
        const totalSpeed = c.speed ?? 0;
        const remaining = combatStore.getRemainingMovement(c, playbackMode ? 'playback' : 'simulation', isPlaybackActive());
        const active = playbackMode && playbackStarted && !playbackPaused;
        const actionText = active ? (actions <= 0 ? '0' : `${actions}`) : '∞';
        const moveText = totalSpeed > 0
          ? (active ? `${remaining}/${totalSpeed}` : `${totalSpeed}`)
          : '—';
        const showEndTurn = active && !!currentTurn;
        // 仿显示屏：深蓝偏紫底 + 白字 + 等宽字体
        const screenBg = 'bg-indigo-950/90';
        const screenBorder = 'border border-indigo-400/20';
        const labelCls = (isZero: boolean) =>
          active
            ? (isZero ? 'text-red-400' : 'text-white')
            : 'text-indigo-300/60';
        return (
          <div className={`fixed bottom-6 left-6 z-30 flex items-center gap-3 px-4 py-3 rounded-lg backdrop-blur shadow-lg ${screenBorder} ${screenBg} font-mono max-w-[calc(100vw-3rem)]`}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-300/50 tracking-wider">ACT</span>
              <span className={`text-sm font-bold ${labelCls(actions <= 0)}`}>{actionText}</span>
            </div>
            <span className="text-indigo-400/30">|</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-300/50 tracking-wider">MOV</span>
              <span className={`text-sm font-bold ${labelCls(remaining <= 0)}`}>{moveText}</span>
              <span className="text-[10px] text-indigo-300/50">ft</span>
            </div>
            {showEndTurn && (
              <>
                <span className="text-indigo-400/30">|</span>
                <button
                  onClick={() => setConfirmEndTurnOpen(true)}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
                  title="完成当前回合，进入下一个"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  完成回合
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* ✅ 回合待办展示板 —— 放映模式 + 已开始 + 当前回合存在时显示（暂停状态也显示） */}
      {record.mode === 'playback' && playbackStarted && currentTurn && (
        <TurnTodoBoard
          record={record}
          currentTurn={currentTurn}
          combatants={record.combatants}
        />
      )}

      {/* 原内容：完全保留，一个字都没改（表格逻辑不变） */}
      <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="dark:bg-card-dark light:bg-card-light">
              <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
                轮次
              </th>
              {record.combatants.map((c, idx) => {
                const downed = c.isDead || c.isUnconscious;
                return (
                <th key={c.id} className={`p-2 pt-7 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group ${downed ? 'opacity-40' : ''}`}>
                  <div className="absolute top-1 left-1 w-6 h-6 rounded-full dark:bg-gray-600 dark:text-white light:bg-gray-300 light:text-black text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                    {/* 死亡：在数字标记上打红叉 */}
                    {c.isDead && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                      >
                        <line x1="20" y1="20" x2="80" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                        <line x1="80" y1="20" x2="20" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {batchMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="shrink-0 cursor-pointer"
                      />
                    )}
                    {/* 名称：参战者信息按钮，点击展开「双击弹窗」（CombatantInfoPanel，等价沙盘双击棋子） */}
                    <button
                      type="button"
                      onClick={() => setInfoPanelCombatant(c)}
                      className="font-medium truncate flex-1 text-left px-1.5 py-0.5 rounded-md border border-transparent
                                 dark:text-text-dark light:text-text-light
                                 dark:hover:border-primary/40 dark:hover:bg-primary/10
                                 light:hover:border-primary/40 light:hover:bg-primary/10
                                 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/60
                                 hover:underline hover:underline-offset-2 hover:decoration-primary/70"
                      title="点击查看参战者详情 / 编辑信息"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Pencil className="w-3 h-3 opacity-50 shrink-0" />
                        <span>{c.name}</span>
                      </span>
                    </button>
                  </div>
                  {/* 先攻：只读显示（不可再点击编辑） */}
                  <div
                    className="text-xs opacity-60 select-none"
                    title={`先攻：${c.initiative}（只读）`}
                  >
                    先攻 {c.initiative}
                  </div>
                  {/* 展示 HP（PC 和 NPC 均显示） */}
                  {c.maxHp != null && c.maxHp > 0 && (
                    <div className="text-xs opacity-60 mt-1">
                      HP {c.currentHp}/{c.maxHp}
                    </div>
                  )}
                  {/* 单个删除按钮：仅非批量模式显示 */}
                  {!batchMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveCombatant(c.id);
                      }}
                      className="absolute top-1 right-1 p-0.5 rounded hover:bg-danger/20 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      title="删除参战者"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {record.rounds.map((round, roundIndex) => (
              <tr key={roundIndex} className="border-t dark:border-border-dark/50 light:border-border-light/50">
                <td className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-bg-dark light:bg-bg-light font-medium text-center">
                  {roundIndex === 0 ? (
                    <button
                      onClick={() => openSurpriseAttackModal(roundIndex)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-primary/10 text-primary transition-colors cursor-pointer"
                      title="设置被突袭角色"
                    >
                      {roundIndex + 1}
                    </button>
                  ) : (
                    roundIndex + 1
                  )}
                </td>
                {record.combatants.map((c) => {
                  const action = round[c.id] || '';
                  const isEditing =
                    editingCell?.round === roundIndex &&
                    editingCell?.combatantId === c.id;
                  const isSurprised = action === '被突袭';
                  const isSelected = selectedCell?.round === roundIndex && selectedCell?.combatantId === c.id;
                  // 放映模式判断
                  const isPlayback = record.mode === 'playback';
                  // 暂停放映：不高亮任何回合格（因为不处于任何参战者的回合）
                  const isCurrentTurn = isPlayback && playbackStarted && !playbackPaused && currentTurn?.round === roundIndex && currentTurn?.combatantId === c.id;
                  // 放映模式下：
                  // - 未开始放映：所有非被突袭格子可点击（用于选择放映起点）
                  // - 已开始放映：当前回合格子可记录/手动输入；其它任何已发生或后续格子也允许点击（用于回溯）
                  const cellClickable = isPlayback
                    ? (!isSurprised && (
                        !playbackStarted || true  // 已开始放映后允许点开任意格子查看并回溯
                      ))
                    : true;

                  if (isSurprised) {
                    return (
                      <td
                        key={c.id}
                        className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] dark:bg-yellow-500/10 light:bg-yellow-100/50 text-center"
                        title="被突袭：本回合被突袭，失去先攻"
                      >
                        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">被突袭</span>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={c.id}
                      className={`p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] transition-colors relative ${
                        isSelected ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : cellClickable ? 'hover:bg-white/5 cursor-pointer' : 'opacity-60'
                      } ${isCurrentTurn ? 'ring-2 ring-yellow-400 dark:ring-yellow-300 animate-pulse bg-yellow-400/10 dark:bg-yellow-300/10' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) return;
                        if (isPlayback) {
                          // 放映模式：所有非被突袭格子都可被点开
                          // （未开始放映 → 显示播放按钮；已开始放映 → 当前回合显示记录/手动输入，其它显示回溯）
                          setSelectedCell({ round: roundIndex, combatantId: c.id });
                          setEditingCell(null);
                        } else {
                          setSelectedCell({ round: roundIndex, combatantId: c.id });
                          setEditingCell(null);
                        }
                      }}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={action}
                          onChange={(e) => handleCellChange(roundIndex, c.id, e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-full bg-transparent outline-none resize-none text-xs"
                          rows={2}
                        />
                      ) : isSelected ? (
                        <div className="flex flex-col items-center gap-1 py-1 relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell(null);
                            }}
                            className="absolute -top-1 -right-1 p-0.5 rounded-full bg-danger text-white hover:bg-danger/80 transition-colors z-10"
                            title="取消"
                            type="button"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          <div className="whitespace-pre-wrap text-xs min-h-[2em] w-full text-center opacity-50 italic">
                            {action || '空白记录'}
                          </div>
                          {isPlayback && !playbackStarted ? (
                            // 放映模式 + 未开始放映 → 显示播放按钮（放映模式不要手动记录按钮）
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startPlayback();
                                setSelectedCell(null);
                              }}
                              className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                              title="从这里开始放映"
                            >
                              <Play className="w-3 h-3" />
                              开始放映
                            </button>
                          ) : isPlayback && playbackStarted ? (
                            // 放映模式 + 已开始放映：仅当前回合/之前的回合格支持「手动记录/手动输入」，所有回合格都支持「回溯」
                            <>
                              {(isCurrentTurn ||
                                roundIndex < (currentTurn?.round ?? Infinity) ||
                                (roundIndex === (currentTurn?.round ?? -1) &&
                                  (record.combatants.findIndex(x => x.id === c.id)) < (record.combatants.findIndex(x => x.id === currentTurn?.combatantId) ?? Infinity))
                              ) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setManualRecordType('attack');
                                      setManualRecordOpen(true);
                                      setManualTargetId('');
                                      setManualAttackMethod('');
                                      setManualDamage('');
                                      setManualIsKill(false);
                                      setManualHealMethod('');
                                      setManualHealAmount('');
                                      setManualAttackRoll('');
                                    }}
                                    className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                                    title="手动记录"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    记录
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCell({ round: roundIndex, combatantId: c.id });
                                      setSelectedCell(null);
                                    }}
                                    className="text-xs px-2 py-0.5 rounded border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors flex items-center gap-1"
                                    title="手动输入"
                                  >
                                    <Keyboard className="w-3 h-3" />
                                    手动输入
                                  </button>
                                </>
                              ) : null}
                              {/* 放映模式：任何已过/当前/后续回合格都提供回溯（只要不是纯占位符） */}
                              {action !== '被突袭' && action !== '昏迷中，无法行动' && action !== '死亡' && (() => {
                                const cidx = record.combatants.findIndex(x => x.id === c.id);
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // 打开回溯确认弹窗：第一次点击 firstClickDone，第二次确认
                                      setRewindModal({
                                        round: roundIndex,
                                        combatantId: c.id,
                                        combatantIdx: cidx,
                                        firstClickDone: false,
                                      });
                                    }}
                                    className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
                                    title="回溯到此回合（之后所有记录清空并还原生命值/沙盘）"
                                  >
                                    <Undo2 className="w-3 h-3" />
                                    回溯到此
                                  </button>
                                );
                              })()}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setManualRecordType('attack');
                                  setManualRecordOpen(true);
                                  setManualTargetId('');
                                  setManualAttackMethod('');
                                  setManualDamage('');
                                  setManualIsKill(false);
                                  setManualHealMethod('');
                                  setManualHealAmount('');
                                  setManualAttackRoll('');
                                }}
                                className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                                title="手动记录"
                              >
                                <Pencil className="w-3 h-3" />
                                记录
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCell({ round: roundIndex, combatantId: c.id });
                                  setSelectedCell(null);
                                }}
                                className="text-xs px-2 py-0.5 rounded border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors flex items-center gap-1"
                                title="手动输入"
                              >
                                <Keyboard className="w-3 h-3" />
                                手动输入
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap text-xs min-h-[2em]">{action || ''}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ✅ 新增：网格沙盘 —— 展示参战者位置与移动 */}
      <Battleground
        sessionId={record.id}
        combatants={record.combatants}
        combatInventories={combatInventories}
        equipmentChangesMap={record.equipmentChanges}
        onUpdateChanges={(combatantId, changes) => {
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record.equipmentChanges || {}),
              [combatantId]: changes,
            },
          });
        }}
        playbackOnlyMovableId={
          isPlaybackActive()
            ? currentTurn!.combatantId
            : null
        }
        activeTurnCombatantId={
          isPlaybackActive()
            ? currentTurn!.combatantId
            : null
        }
        mode={record.mode}
        playbackActive={isPlaybackActive()}
        remainingMovementMap={(() => {
          const m: Record<string, number> = {};
          const active = isPlaybackActive();
          for (const c of record.combatants) {
            m[c.id] = combatStore.getRemainingMovement(c, record.mode, active);
          }
          return m;
        })()}
        onConsumeMovement={(combatantId, feet) => {
          if (!record.id) return false;
          const got = combatStore.consumeMovement(record.id, combatantId, feet, record.mode, isPlaybackActive());
          return got >= feet;
        }}
        onRefundMovement={(combatantId, feet) => {
          if (!record.id) return;
          combatStore.refundMovement(record.id, combatantId, feet, record.mode, isPlaybackActive());
        }}
        onSelectionChange={(id) => {
          setSandboxSelectedId(id);
        }}
        onRequestAttack={(attacker, target) => {
          // 动作校验：放映模式可用动作耗尽时禁止发起攻击
          if (!canUseAction(attacker.id)) {
            alert('该参战者本回合已没有可用动作');
            return;
          }
          // 从最新 record 重取对象（pendingAdvantageSources 必须是协助后最新状态，不能用闭包 capture 的旧 snapshot）
          const latestAttacker = record.combatants.find(c => c.id === attacker.id) ?? attacker;
          const latestTarget = record.combatants.find(c => c.id === target.id) ?? target;
          const bg = record.id ? battlegroundStore.get(record.id) : null;
          const tokens = bg?.tokens ?? [];
          const attackerPos = tokens.find(t => t.combatantId === attacker.id);
          const targetPos = tokens.find(t => t.combatantId === target.id);
          setAttackModal({
            attacker: latestAttacker,
            target: latestTarget,
            attackerPos: attackerPos ? { col: attackerPos.col, row: attackerPos.row } : undefined,
            targetPos: targetPos ? { col: targetPos.col, row: targetPos.row } : undefined,
          });
        }}
        onRequestSpell={(caster, target) => {
          // 动作校验：放映模式可用动作耗尽时禁止施法
          if (!canUseAction(caster.id)) {
            alert('该参战者本回合已没有可用动作');
            return;
          }
          const latestCaster = record.combatants.find(c => c.id === caster.id) ?? caster;
          const latestTarget = record.combatants.find(c => c.id === target.id) ?? target;
          // 法术按钮：打开独立法术施放弹窗
          setSpellModal({ caster: latestCaster, target: latestTarget });
        }}
        onPickupItem={(itemToken, picker) => {
          // 拾起掉落物品：体型小型及以上 + 智力4以上 + 5尺内（1格）
          if (!record) return;
          const bg = battlegroundStore.get(record.id);
          if (!bg) return;
          const pickerToken = bg.tokens.find(t => t.combatantId === picker.id);
          if (!pickerToken) {
            alert('拾取者不在沙盘上');
            return;
          }
          // 距离检查：5尺内（切比雪夫距离 ≤ 1格）
          const dist = Math.max(
            Math.abs(pickerToken.col - itemToken.col),
            Math.abs(pickerToken.row - itemToken.row),
          );
          if (dist > 1) {
            alert(`距离过远（${dist * 5}尺），需在5尺（1格）内才能拾起`);
            return;
          }
          // 体型检查：小型及以上
          let size = '中型';
          let intelligence = 10;
          if (picker.characterId) {
            const char = characterStore.get(picker.characterId);
            if (char) {
              size = char.size || '中型';
              intelligence = char.abilities?.intelligence?.score || 10;
            }
          } else if (picker.templateId) {
            const template = npcTemplateStore.getAll().find(t => t.templateId === picker.templateId);
            if (template) {
              intelligence = template.intelligence || 10;
            }
          }
          const validSizes = ['微型', '小型', '中型', '大型', '巨型', '超巨型'];
          if (!validSizes.includes(size)) size = '中型';
          const sizeIdx = validSizes.indexOf(size);
          if (sizeIdx < 1) { // 小型 = index 1
            alert(`${picker.name} 体型为${size}，需小型及以上才能拾起`);
            return;
          }
          // 智力检查：4以上
          if (intelligence < 4) {
            alert(`${picker.name} 智力为${intelligence}，需4以上才能拾起`);
            return;
          }
          
          // 拾取物品：优先复用源 childId（"丢出去的匕首捡回来还是同一把"），
          // 避免生成新 childId 导致同名武器被识别为不同实体（武器定制化越强，数据丢失越严重）；
          // 仅 NPC 掉落物（无源 childId）才生成新的临时 childId。
          const sourceChildId = (itemToken.equipmentData?.childId as string | undefined)
            || (itemToken.equipmentData?.id as string | undefined);
          const fallbackChildId = `combat-${picker.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const childIdToUse = sourceChildId || fallbackChildId;

          // 判断拾取者是否为该 childId 的源拥有者：
          //   是 → 拾取 = 撤销当初的"丢失"操作（removedChildIds 或 quantityDeltas），
          //        否则 added 会被 removedChildIds 强制置 0，导致"捡不回来"
          //   否 → 当作新增物品写入 added
          const pickerChar = picker.characterId ? characterStore.get(picker.characterId) : null;
          const pickerSrcList = (pickerChar?.equipment as any[] | undefined) || [];
          const isInPickerSrc = sourceChildId
            ? pickerSrcList.some(e => (e.childId || e.id) === sourceChildId)
            : false;

          const equipSnapshot: Record<string, unknown> = {
            ...(itemToken.equipmentData || {}),
            name: (itemToken.equipmentData?.name as string) || itemToken.name || '未命名物品',
            category: (itemToken.equipmentData?.category as string) || '杂项',
            quantity: 1,
            childId: childIdToUse,
          };
          const currentChanges = record?.equipmentChanges?.[picker.id];
          const newChanges = applyEquipmentChange(currentChanges, (ch) => {
            if (isInPickerSrc && ch.removedChildIds.includes(childIdToUse)) {
              // 当初源数量=1，整件被 removed → 撤销 removed，combatQty 自然回到 srcQty
              ch.removedChildIds = ch.removedChildIds.filter(c => c !== childIdToUse);
            } else if (isInPickerSrc && (ch.quantityDeltas[childIdToUse] || 0) < 0) {
              // 当初源数量>1，quantityDeltas -1 → +1 抵消
              const next = (ch.quantityDeltas[childIdToUse] || 0) + 1;
              if (next === 0) delete ch.quantityDeltas[childIdToUse];
              else ch.quantityDeltas[childIdToUse] = next;
            } else {
              // 非源拥有者，或源拥有者从未丢失此物（捡到同名同 childId 的他人掉落物）：当作新增
              ch.added.push({
                childId: childIdToUse,
                equipment: equipSnapshot,
              });
            }
          });
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record?.equipmentChanges || {}),
              [picker.id]: newChanges,
            },
          });

          // 从网格移除物品 token
          battlegroundStore.removeItemToken(record.id, itemToken.id);
          // 写入先攻表格
          const cell = resolveWriteCell(picker.id);
          if (cell) {
            appendRoundRecord(cell.round, cell.combatantId, `${picker.name} 拾起了 ${itemToken.name}`);
          }
        }}
        onRemoveItem={(combatantId, item) => {
          // 从战斗背包删除物品：通过变更信息漏斗
          if (!record) return;
          const slotId = item.childId || item.id;
          if (!slotId) return;
          const currentChanges = record.equipmentChanges?.[combatantId];
          const newChanges = applyEquipmentChange(currentChanges, (ch) => {
            // 判断该 childId 是源装备还是战斗中新增的
            const isInAdded = ch.added.some(a => a.childId === slotId);
            if (isInAdded) {
              // 战斗中新增的：直接从 added 移除
              ch.added = ch.added.filter(a => a.childId !== slotId);
            } else {
              // 源装备：加入 removedChildIds
              if (!ch.removedChildIds.includes(slotId)) {
                ch.removedChildIds.push(slotId);
              }
            }
          });
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record.equipmentChanges || {}),
              [combatantId]: newChanges,
            },
          });
        }}
      />

      {/* ✅ 新增：NPC 创建器 */}
      {npcCreatorOpen && (
        <NpcCreator
          onClose={() => setNpcCreatorOpen(false)}
          onCreate={handleCreateNpc}
          onBatchCreate={handleBatchCreateNpc}
          templates={npcTemplates}
        />
      )}

      {/* ✅ 新增：战斗攻击检定弹窗 —— 在 main 上处理 */}
      {attackModal && (
        <CombatAttackModal
          attacker={attackModal.attacker}
          target={attackModal.target}
          attackerPos={attackModal.attackerPos}
          targetPos={attackModal.targetPos}
          combatantPositions={combatantPositions}
          combatInventory={getCombatInventory(record, attackModal.attacker)}
          targetCharacter={attackModal.target.characterId ? characterStore.get(attackModal.target.characterId) : null}
          targetCombatInventory={getCombatInventory(record, attackModal.target)}
          loadedWeapons={record?.loadedWeapons}
          loadingAttackedThisRound={record?.loadingAttackedThisRound}
          combatMode={currentMode()}
          playbackTurnActive={isPlaybackActive()}
          onLoadedChange={(key, loaded) => {
            if (!record) return;
            combatStore.update(record.id, {
              loadedWeapons: {
                ...(record.loadedWeapons || {}),
                [key]: loaded,
              },
              updatedAt: Date.now(),
            });
          }}
          onClose={() => setAttackModal(null)}
          onConfirmHit={(attack, info) => {
            // 攻击（无论是否命中）消耗 1 个动作
            consumeCombatantAction(attackModal.attacker.id);
            // 装填武器：标记本回合已攻击（每回合只能一次，优先级高于额外动作）
            if (attack.properties?.some(p => p.includes('装填'))) {
              markLoadingAttacked(attackModal.attacker.id);
            }
            // 命中确认：关闭攻击检定弹窗，切换至伤害结算弹窗
            // 弹药属性武器：消耗弹药（无论命中/未命中）
            if (info.ammoConsumed && record) {
              const currentChanges = record.equipmentChanges?.[attackModal.attacker.id];
              const newChanges = applyEquipmentChange(currentChanges, (ch) => {
                const ammoId = info.ammoConsumed!.ammoChildId;
                const prevDelta = ch.quantityDeltas[ammoId] || 0;
                // 若源弹药数量-1 后 ≤0 则加入 removedChildIds（整件移除）
                const srcQty = (() => {
                  const pc = attackModal.attacker.characterId ? characterStore.get(attackModal.attacker.characterId) : null;
                  const eq = pc?.equipment.find(e => (e.childId || e.id) === ammoId);
                  return eq ? (eq.quantity || 1) + prevDelta : 0;
                })();
                if (srcQty <= 1) {
                  if (!ch.removedChildIds.includes(ammoId)) ch.removedChildIds.push(ammoId);
                } else {
                  ch.quantityDeltas[ammoId] = prevDelta - 1;
                }
              });
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [attackModal.attacker.id]: newChanges,
                },
                updatedAt: Date.now(),
              });
            }
            setDamageModal({
              attacker: attackModal.attacker,
              target: attackModal.target,
              attack,
              disadvantage: info.disadvantage,
              isCritical: info.isNatural20,
              d20Rolled: info.d20Rolled,
              d20Final: info.d20Final,
              d20Bonus: info.bonus,
              d20Total: info.total,
              usageMode: info.usageMode,
              isTwoHandedWield: info.isTwoHandedWield,
            });
            setAttackModal(null);
          }}
          onAttackMiss={(missInfo) => {
            // 攻击（无论是否命中）消耗 1 个动作
            consumeCombatantAction(attackModal.attacker.id);
            // 装填武器：标记本回合已攻击（每回合只能一次，优先级高于额外动作）
            if (missInfo.attack.properties?.some(p => p.includes('装填'))) {
              markLoadingAttacked(attackModal.attacker.id);
            }
            // 未命中：写入先攻表格（简化格式）
            // 弹药属性武器：消耗弹药（无论命中/未命中）
            if (missInfo.ammoConsumed && record) {
              const currentChanges = record.equipmentChanges?.[attackModal.attacker.id];
              const newChanges = applyEquipmentChange(currentChanges, (ch) => {
                const ammoId = missInfo.ammoConsumed!.ammoChildId;
                const prevDelta = ch.quantityDeltas[ammoId] || 0;
                const srcQty = (() => {
                  const pc = attackModal.attacker.characterId ? characterStore.get(attackModal.attacker.characterId) : null;
                  const eq = pc?.equipment.find(e => (e.childId || e.id) === ammoId);
                  return eq ? (eq.quantity || 1) + prevDelta : 0;
                })();
                if (srcQty <= 1) {
                  if (!ch.removedChildIds.includes(ammoId)) ch.removedChildIds.push(ammoId);
                } else {
                  ch.quantityDeltas[ammoId] = prevDelta - 1;
                }
              });
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [attackModal.attacker.id]: newChanges,
                },
                updatedAt: Date.now(),
              });
            }
            const cell = resolveWriteCell(attackModal.attacker.id);
            if (!cell) return;
            const text = `对 ${attackModal.target.name} 的攻击未命中，${missInfo.attackName}打偏了`;
            appendRoundRecord(cell.round, cell.combatantId, text);
            // 投掷武器掉落：未命中也掉落
            if (attackModal.attackerPos && attackModal.targetPos) {
              executeThrownDrop(
                attackModal.attacker, attackModal.target,
                missInfo.attack,
                attackModal.attackerPos, attackModal.targetPos,
                false, record, missInfo.usageMode,
              );
            }
          }}
        />
      )}

      {/* ✅ 新增：伤害结算弹窗 —— 攻击命中后展示 */}
      {damageModal && (
        <CombatDamageModal
          attacker={damageModal.attacker}
          target={damageModal.target}
          attack={damageModal.attack}
          disadvantage={damageModal.disadvantage}
          isCritical={damageModal.isCritical}
          isTwoHandedWield={damageModal.isTwoHandedWield}
          onApplyDamage={({ damage, newHp, status }) => {
            // 1. 应用 HP / 状态
            handleApplyDamage(damageModal.target.id, newHp, status);
            // 2. 写入先攻表格（简化格式）
            const cell = resolveWriteCell(damageModal.attacker.id);
            if (cell) {
              let text = `对 ${damageModal.target.name} 的攻击命中，用${damageModal.attack.name}造成${damage}点伤害`;
              if (status === 'unconscious') text += '，将其击昏';
              else if (status === 'dead') text += '，将其杀死';
              appendRoundRecord(cell.round, cell.combatantId, text);
            }
            // 3. 投掷武器掉落：命中也掉落
            const bg = record ? battlegroundStore.get(record.id) : null;
            if (bg) {
              const attackerToken = bg.tokens.find(t => t.combatantId === damageModal.attacker.id);
              const targetToken = bg.tokens.find(t => t.combatantId === damageModal.target.id);
              if (attackerToken && targetToken) {
                executeThrownDrop(
                  damageModal.attacker, damageModal.target,
                  damageModal.attack,
                  { col: attackerToken.col, row: attackerToken.row },
                  { col: targetToken.col, row: targetToken.row },
                  true, record, damageModal.usageMode,
                );
              }
            }
          }}
          onClose={() => setDamageModal(null)}
        />
      )}

      {/* ✅ 新增：法术施放弹窗 —— 独立于攻击检定的交互流程 */}
      {spellModal && (
        <CombatSpellModal
          caster={spellModal.caster}
          target={spellModal.target}
          targetCharacter={spellModal.target.characterId ? characterStore.get(spellModal.target.characterId) : null}
          targetCombatInventory={getCombatInventory(record, spellModal.target)}
          combatantPositions={combatantPositions}
          canUseBonusAction={canUseBonusAction(spellModal.caster.id)}
          onClose={() => setSpellModal(null)}
          onCastResolved={(info) => {
            // 施法时间 = "1 动作" 的法术消耗 1 个动作（无论是否命中/被豁免）
            if (isOneActionCast(info.castingTime)) {
              consumeCombatantAction(spellModal.caster.id);
            }
            // 施法时间 = "1 附赠动作" 的法术消耗 1 个附赠动作
            if (isBonusActionCast(info.castingTime)) {
              consumeCombatantBonusAction(spellModal.caster.id);
            }
            // 1. 应用 HP / 状态（伤害扣血、治疗加血，handleApplyDamage 直接覆盖 newHp）
            handleApplyDamage(spellModal.target.id, info.newHp, info.status);
            // 2. 写入先攻表格：xxx 施展 xxx 成功/失败，对 xxx 造成 xxx 点伤害/恢复 xxx 点生命值
            const cell = resolveWriteCell(spellModal.caster.id);
            if (cell) {
              let text = `${spellModal.caster.name} 施展 ${info.spellName}${info.success ? '成功' : '失败'}`;
              if (info.success && info.amount > 0) {
                text += `，对 ${spellModal.target.name}${info.effectType === 'damage' ? `造成${info.amount}点伤害` : `恢复${info.amount}点生命值`}`;
                if (info.status === 'unconscious') text += '，将其击昏';
                else if (info.status === 'dead') text += '，将其杀死';
              }
              appendRoundRecord(cell.round, cell.combatantId, text);
            }
          }}
        />
      )}

      {/* ✅ 协助（Help）动作弹窗 */}
      {helpModal && record && (() => {
        const from = helpModal.from;
        // 友方：同阵营（isPc === from.isPc），未死亡，非自己
        const friendlies = record.combatants.filter(
          c => c.id !== from.id && c.isPc === from.isPc && !c.isDead,
        );
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setHelpModal(null)}>
            <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                  协助动作
                </h3>
                <button onClick={() => setHelpModal(null)} className="p-1 rounded hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-2">
                发出者：<span className="font-medium dark:text-text-dark light:text-text-light">{from.name}</span>
              </p>
              <ul className="text-xs dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 mb-4 list-disc pl-5">
                <li>效果：优势</li>
                <li>类型：一次性</li>
                <li>有效期：{from.name} 的下一个回合前</li>
                <li>生效场景：
                  <ul className="list-[circle] pl-4">
                    <li>属性检定 / 技能检定（无条件）</li>
                    <li>攻击检定（近战/远程/投掷/法术）：仅当对方攻击目标在 {from.name} 5 尺内</li>
                  </ul>
                </li>
              </ul>
              <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-2">
                选择协助对象（友方 · {friendlies.length}）
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friendlies.length === 0 && (
                  <div className="text-xs opacity-60 text-center py-6">当前没有可选择的友方</div>
                )}
                {friendlies.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (!record) return;
                      const curRound = currentTurn?.round ?? 0;
                      // 场景通配 + 批量写入：3 条标记覆盖全部场景
                      // - 'check' 通配 ability_check + skill_check（无条件）
                      // - 'attack' 通配 4 类攻击检定（requireTargetNearFromId 限制 5 尺内）
                      combatStore.addPendingAdvantages(record.id, f.id, [
                        {
                          fromId: from.id,
                          fromName: from.name,
                          scene: 'check',
                          mode: 'advantage',
                          reason: `${from.name} 协助：属性/技能检定优势`,
                          kind: 'action',
                          requireTargetNearFromId: false,
                          expireOnCombatantId: from.id,
                          createdRound: curRound,
                          expireRound: -1,
                        },
                        {
                          fromId: from.id,
                          fromName: from.name,
                          scene: 'attack',
                          mode: 'advantage',
                          reason: `${from.name} 协助：攻击检定优势（目标须在其 5 尺内）`,
                          kind: 'action',
                          requireTargetNearFromId: true,
                          expireOnCombatantId: from.id,
                          createdRound: curRound,
                          expireRound: -1,
                        },
                      ]);
                      // 消耗 1 个动作
                      consumeCombatantAction(from.id);
                      // 写入回合记录
                      if (currentTurn) {
                        appendRoundRecord(
                          currentTurn.round,
                          from.id,
                          `对 ${f.name} 的行动展开协助`,
                        );
                      }
                      setHelpModal(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/60 hover:bg-primary/5 transition-colors"
                  >
                    <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{f.name}</div>
                    <div className="text-xs opacity-60">
                      {f.isPc ? '玩家角色' : 'NPC'}
                      {f.initiative ? ` · 先攻 ${f.initiative}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✅ 突袭选择弹窗 */}
      {surpriseAttackOpen && (
        <SurpriseAttackDialog
          open={surpriseAttackOpen}
          round={surpriseAttackRound}
          combatants={record.combatants}
          surprisedCombatants={surprisedCombatants}
          onToggleSurprised={toggleSurprisedCombatant}
          onConfirm={confirmSurpriseAttack}
          onClose={closeSurpriseAttackModal}
        />
      )}

      {/* ✅ 手动记录弹窗 */}
      {manualRecordOpen && manualRecordType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                {manualRecordType === 'attack' ? '攻击记录' : '恢复记录'}
              </h3>
              <button
                onClick={cancelManualRecord}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {manualRecordType === 'attack' && (
              <div className="space-y-4">
                {/* 目标选择 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    被攻击者
                  </label>
                  <select
                    value={manualTargetId}
                    onChange={(e) => {
                      setManualTargetId(e.target.value);
                      setManualAttackRoll('');
                    }}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  >
                    <option value="">选择目标...</option>
                    {record.combatants.map(c => {
                      const attacker = selectedCell ? record.combatants.find(x => x.id === selectedCell.combatantId) : null;
                      // ✅ 禁止选择自己 + 禁止选择同队（PC 攻击 NPC / NPC 攻击 PC）
                      if (attacker && (c.id === attacker.id || (c.id !== attacker.id && c.isPc === attacker.isPc))) {
                        return null;
                      }
                      const circle = getInitiativeCircle(c.id);
                      return (
                        <option key={c.id} value={c.id}>
                          {circle} {c.name}（先攻 {c.initiative}）
                        </option>
                      );
                    })}
                  </select>
                  {/* 显示目标 AC */}
                  {manualTargetId && (() => {
                    const target = record.combatants.find(c => c.id === manualTargetId);
                    if (!target) return null;
                    const effAc = getEffectiveAc(target);
                    if (!effAc && effAc !== 0) return null;
                    return (
                      <div className="mt-1 text-xs text-primary font-medium">
                        目标 AC：{effAc}
                      </div>
                    );
                  })()}
                </div>

                {/* 攻击检定 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    攻击检定值
                  </label>
                  <input
                    type="number"
                    value={manualAttackRoll}
                    onChange={(e) => setManualAttackRoll(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="填入攻击检定总值"
                  />
                  {/* 自动判定命中结果 */}
                  {manualTargetId && manualAttackRoll && (() => {
                    const target = record.combatants.find(c => c.id === manualTargetId);
                    if (!target) return null;
                    const effAc = getEffectiveAc(target);
                    if (!effAc && effAc !== 0) return null;
                    const roll = parseInt(manualAttackRoll, 10);
                    if (isNaN(roll)) return null;
                    const hit = roll >= effAc;
                    return (
                      <div className={`mt-1 text-xs font-medium ${hit ? 'text-green-500' : 'text-red-500'}`}>
                        {roll} {hit ? '≥' : '<'} AC {effAc} → {hit ? '命中' : '未命中'}
                      </div>
                    );
                  })()}
                </div>

                {/* 攻击方式 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    攻击方式
                  </label>
                  <input
                    type="text"
                    value={manualAttackMethod}
                    onChange={(e) => setManualAttackMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="例如：长剑挥砍"
                  />
                </div>

                {/* 伤害（根据攻击检定自动判定命中后显示） */}
                {manualTargetId && manualAttackRoll && (() => {
                  const tgt = record.combatants.find(c => c.id === manualTargetId);
                  if (!tgt) return null;
                  const effAc = getEffectiveAc(tgt);
                  if (!effAc && effAc !== 0) return null;
                  const roll = parseInt(manualAttackRoll, 10);
                  if (isNaN(roll)) return null;
                  const hit = roll >= effAc;
                  if (!hit) return null;
                  return (
                    <>
                      <div>
                        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                          伤害值（整数，不为0）
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={manualDamage}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || (parseInt(v, 10) >= 1)) {
                              setManualDamage(v);
                            }
                          }}
                          className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                          placeholder="例如：15"
                        />
                      </div>

                      {/* 干掉目标 */}
                      {manualTargetId && (() => {
                        const target = record.combatants.find(c => c.id === manualTargetId);
                        if (!target || target.currentHp === undefined) return null;
                        const dmg = parseInt(manualDamage, 10) || 0;
                        const willKill = dmg > 0 && dmg >= (target.currentHp ?? 0);
                        if (!willKill) return null;
                        return (
                          <label className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30 cursor-pointer mt-3">
                            <input
                              type="checkbox"
                              checked={manualIsKill}
                              onChange={(e) => setManualIsKill(e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-xs text-red-500 dark:text-red-400">
                              造成致命伤害，{target.isPc ? '使其昏迷' : '将其杀死'}
                            </span>
                          </label>
                        );
                      })()}
                    </>
                  );
                })()}

                {/* 预览文本 */}
                {manualTargetId && (() => {
                  const target = record.combatants.find(c => c.id === manualTargetId);
                  if (!target) return null;
                  let preview = '';
                  // 自动判定：攻击检定值根据 AC 自动判断
                  let autoHit: boolean | null = null;
                  if (manualAttackRoll) {
                    const effAc = getEffectiveAc(target);
                    const roll = parseInt(manualAttackRoll, 10);
                    if (!isNaN(roll)) autoHit = roll >= effAc;
                  }
                  if (autoHit === false) {
                    preview = `对 ${target.name} 的攻击未命中，${manualAttackMethod || '???'}打偏了`;
                  } else if (autoHit === true) {
                    const dmg = parseInt(manualDamage, 10) || 0;
                    preview = `对 ${target.name} 的攻击命中，用${manualAttackMethod || '???'}造成${dmg}点伤害`;
                    if (manualIsKill) preview += target.isPc ? `，将其击昏` : `，将其杀死`;
                  } else {
                    preview = '请先填写攻击检定值';
                  }
                  return (
                    <div className="p-2 rounded-lg bg-bg-dark/50 border border-border-dark text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      <span className="opacity-60">预览：</span>{preview}
                    </div>
                  );
                })()}
              </div>
            )}

            {manualRecordType === 'recovery' && (
              <div className="space-y-4">
                {/* 恢复目标 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    恢复目标（可选，默认恢复自己）
                  </label>
                  <select
                    value={manualTargetId}
                    onChange={(e) => setManualTargetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                  >
                    <option value="">恢复自己</option>
                    {record.combatants.map(c => {
                      const circle = getInitiativeCircle(c.id);
                      return (
                        <option key={c.id} value={c.id}>
                          {circle} {c.name}（先攻 {c.initiative}）
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 恢复方式 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    恢复方式
                  </label>
                  <input
                    type="text"
                    value={manualHealMethod}
                    onChange={(e) => setManualHealMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="例如：治疗术、治疗药水"
                  />
                </div>

                {/* 恢复量 */}
                <div>
                  <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1 block">
                    恢复量（正整数）
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={manualHealAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || (parseInt(v, 10) >= 1)) {
                        setManualHealAmount(v);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                    placeholder="例如：10"
                  />
                </div>

                {/* 预览 */}
                {(() => {
                  const attacker = selectedCell ? record.combatants.find(c => c.id === selectedCell.combatantId) : null;
                  const target = manualTargetId
                    ? record.combatants.find(c => c.id === manualTargetId)
                    : attacker;
                  const amount = parseInt(manualHealAmount, 10) || 0;
                  const method = manualHealMethod || '???';
                  const tName = target?.name || '自己';
                  return (
                    <div className="p-2 rounded-lg bg-bg-dark/50 border border-border-dark text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      <span className="opacity-60">预览：</span>
                      用{method}恢复了{tName} {amount}点生命值
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 切换模板 */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setManualRecordType('attack');
                  setManualTargetId('');
                  setManualAttackMethod('');
                  setManualDamage('');
                  setManualIsKill(false);
                }}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  manualRecordType === 'attack'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'dark:border-border-dark light:border-border-light'
                }`}
              >
                <Swords className="w-4 h-4 inline mr-1" />攻击模板
              </button>
              <button
                onClick={() => {
                  setManualRecordType('recovery');
                  setManualTargetId('');
                  setManualHealMethod('');
                  setManualHealAmount('');
                }}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  manualRecordType === 'recovery'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'dark:border-border-dark light:border-border-light'
                }`}
              >
                <Heart className="w-4 h-4 inline mr-1" />恢复模板
              </button>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={cancelManualRecord}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmManualRecord}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 完成回合确认弹窗 */}
      {confirmEndTurnOpen && currentTurn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">完成回合</h3>
              <button
                onClick={() => setConfirmEndTurnOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确认完成 <span className="font-bold text-primary">
                {record.combatants.find(c => c.id === currentTurn.combatantId)?.name ?? '?'}
              </span> 的回合（第 {currentTurn.round + 1} 轮）？
            </p>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
              系统将按先攻顺序推进到下一回合。若该轮已结束，将自动开启新一轮。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmEndTurnOpen(false)}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmEndTurn}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <SkipForward className="w-4 h-4" />完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 右上角按钮组：暂停/恢复放映 + 退出放映（悬浮按钮，统一风格） */}
      {record.mode === 'playback' && (
        <div className="fixed top-20 right-6 z-40 flex flex-col gap-2 items-end">
          {/* 暂停放映 / 恢复放映：仅放映已开始时显示 */}
          {playbackStarted && (
            playbackPaused ? (
              <button
                onClick={resumePlayback}
                className="px-3 py-2 rounded-lg bg-green-500/10 backdrop-blur border border-green-500/50 text-green-500 hover:bg-green-500/20 transition-colors text-sm flex items-center gap-1"
                title="恢复放映，回到暂停前的回合"
                type="button"
              >
                <PlayCircle className="w-4 h-4" />
                恢复放映
              </button>
            ) : (
              <button
                onClick={pausePlayback}
                className="px-3 py-2 rounded-lg bg-amber-500/10 backdrop-blur border border-amber-500/50 text-amber-500 hover:bg-amber-500/20 transition-colors text-sm flex items-center gap-1.5"
                title="暂停放映，临时脱离回合进行全局编辑"
                type="button"
              >
                <span className="leading-none" aria-hidden="true">⏸</span>
                暂停放映
              </button>
            )
          )}
          {/* 退出放映 */}
          <button
            onClick={() => setExitPlaybackModalOpen(true)}
            className="px-3 py-2 rounded-lg bg-card-dark/80 backdrop-blur border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/10 transition-colors flex items-center gap-1"
            title="退出放映模式"
            type="button"
          >
            <ArrowLeft className="w-4 h-4" />
            退出放映
          </button>
        </div>
      )}

      {/* ✅ 退出放映弹窗：保存并覆盖 / 丢弃恢复 / 取消 */}
      {exitPlaybackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={e => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">退出放映</h3>
              <button
                type="button"
                onClick={() => setExitPlaybackModalOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              放映期间对先攻表、生命值、沙盘的操作可以选择保存或丢弃。
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => finalizeExitPlayback(true)}
                className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                保存并覆盖原版本
              </button>
              <button
                type="button"
                onClick={() => finalizeExitPlayback(false)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
              >
                <Undo2 className="w-4 h-4" />
                丢弃，恢复原先状态
              </button>
              <button
                type="button"
                onClick={() => setExitPlaybackModalOpen(false)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 回溯确认弹窗：放映模式下双击确认才生效 */}
      {rewindModal && (() => {
        const rewindC = record.combatants.find(c => c.id === rewindModal.combatantId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
            <div className="w-full max-w-md rounded-xl p-5 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">回溯回合</h3>
                  <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                    第 {rewindModal.round + 1} 轮 · {rewindC?.name ?? '未知角色'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRewindModal(null)}
                  className="p-1 rounded hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
                <div className="text-sm font-semibold text-amber-500 mb-1">⚠️ 此操作具有破坏性</div>
                <ul className="text-xs text-amber-400/90 space-y-1 list-disc pl-4">
                  <li>当前回合格以及之后所有先攻表格格子的内容将被清空</li>
                  <li>所有参战者的生命值、昏迷/死亡状态将还原到此回合开始时的快照</li>
                  <li>战斗沙盘上所有棋子的位置将被还原</li>
                  <li>后续自动新增的轮次也将一并删除</li>
                </ul>
              </div>

              <div className="flex flex-col gap-2">
                {!rewindModal.firstClickDone ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRewindModal({ ...rewindModal, firstClickDone: true })
                    }
                    className={`w-full px-4 py-3 rounded-lg text-white text-sm font-medium transition-all ${
                      rewindModal.firstClickDone
                        ? 'bg-amber-600 hover:bg-amber-700 animate-pulse'
                        : 'bg-danger hover:bg-danger/90'
                    }`}
                  >
                    我已了解，请继续（再次点击确认回溯）
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => applyRollback(rewindModal.round, rewindModal.combatantIdx)}
                    className="w-full px-4 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-all ring-2 ring-amber-400 animate-pulse"
                  >
                    🔴 再次点击以确认回溯到此回合
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRewindModal(null)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ✅ 参战者信息面板（点击表头名称按钮打开，等价沙盘双击弹窗） */}
      {infoPanelCombatant && (() => {
        const bg = record?.id ? battlegroundStore.get(record.id) : null;
        const tokens = bg?.tokens ?? [];
        const tokenMap: { get: (id: string) => { col: number; row: number } | undefined } = {
          get: (id: string) => {
            const t = tokens.find(x => x.combatantId === id);
            return t ? { col: t.col, row: t.row } : undefined;
          },
        };
        return (
          <CombatantInfoPanel
            combatant={infoPanelCombatant}
            onClose={() => setInfoPanelCombatant(null)}
            combatants={record?.combatants ?? []}
            tokenMap={tokenMap}
            combatInventory={combatInventories?.[infoPanelCombatant.id]}
            onRemoveItem={(item) => {
              if (!record) return;
              // 从战斗背包移除：写 EquipmentChanges.removedChildIds
              const childId = item.childId || item.id;
              const prev = record.equipmentChanges?.[infoPanelCombatant.id];
              const removed = Array.from(new Set([...(prev?.removedChildIds ?? []), childId]));
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [infoPanelCombatant.id]: {
                    added: prev?.added ?? [],
                    removedChildIds: removed,
                    quantityDeltas: prev?.quantityDeltas ?? {},
                  },
                },
              });
            }}
            equipmentChanges={record?.equipmentChanges?.[infoPanelCombatant.id]}
            onUpdateChanges={(changes) => {
              if (!record) return;
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [infoPanelCombatant.id]: changes,
                },
              });
            }}
            actions={infoPanelCombatant.actions}
            bonusActions={infoPanelCombatant.bonusActions}
            onHelpClick={() => {
              if (!record) return;
              setHelpModal({ from: infoPanelCombatant });
            }}
            onAttackClick={() => {
              if (!record) return;
              // 攻击需要目标，若已有上次选中的敌人优先；否则关闭面板等手动选择
              const potentialTarget = record.combatants.find(
                c => c.id !== infoPanelCombatant.id && !c.isDead,
              );
              if (potentialTarget) {
                const bg = battlegroundStore.get(record.id);
                const tokens = bg?.tokens ?? [];
                const aPos = tokens.find(t => t.combatantId === infoPanelCombatant.id);
                const tPos = tokens.find(t => t.combatantId === potentialTarget.id);
                setAttackModal({
                  attacker: infoPanelCombatant,
                  target: potentialTarget,
                  attackerPos: aPos ? { col: aPos.col, row: aPos.row } : undefined,
                  targetPos: tPos ? { col: tPos.col, row: tPos.row } : undefined,
                });
                setInfoPanelCombatant(null);
              } else {
                setInfoPanelCombatant(null);
              }
            }}
            onCastClick={() => {
              if (!record) return;
              const potentialTarget = record.combatants.find(
                c => c.id !== infoPanelCombatant.id && !c.isDead,
              );
              if (potentialTarget) {
                setSpellModal({
                  caster: infoPanelCombatant,
                  target: potentialTarget,
                });
                setInfoPanelCombatant(null);
              } else {
                setInfoPanelCombatant(null);
              }
            }}
            onDashClick={() => {
              if (!record || !infoPanelCombatant) return;
              // 检查是否有动作可用
              if (!canUseAction(infoPanelCombatant.id)) {
                alert('该参战者本回合已没有可用动作');
                return;
              }
              // 计算基础速度
              const c = record.combatants.find(x => x.id === infoPanelCombatant.id);
              if (!c) return;
              const baseSpeed = c.speed ?? 30;
              const currentModifier = c.speedModifier ?? 0;
              const battleSpeed = baseSpeed + currentModifier;
              // 疾走：额外获得等于战斗速度的可用移动力（dashExtraMovement += battleSpeed）
              // 注意：疾走不改变 speedModifier，只增加 dashExtraMovement
              const currentDashExtra = c.dashExtraMovement ?? 0;
              const newDashExtra = currentDashExtra + battleSpeed;
              combatStore.update(record.id, {
                combatants: record.combatants.map(x =>
                  x.id === infoPanelCombatant.id
                    ? { ...x, dashExtraMovement: newDashExtra }
                    : x
                ),
                updatedAt: Date.now(),
              });
              // 消耗 1 个动作
              consumeCombatantAction(infoPanelCombatant.id);
              // 写入先攻表格
              const cell = resolveWriteCell(infoPanelCombatant.id);
              if (cell) {
                appendRoundRecord(cell.round, cell.combatantId, `${infoPanelCombatant.name} 使用疾走，获得额外 ${battleSpeed} 尺移动力`);
              }
              // 显示结果弹窗
              const movementUsed = c.movementUsed ?? 0;
              const availableMovement = battleSpeed + newDashExtra - movementUsed;
              alert(`专注于疾跑，获得 ${battleSpeed} 尺额外移动力`);
              setInfoPanelCombatant(null);
            }}
          />
        );
       })()}
     
     {/* 战斗结束回传弹窗 */}
    <CombatCommitModal
      recordId={sessionId}
      isOpen={commitModalOpen}
      onClose={() => setCommitModalOpen(false)}
    />
    </div>
  );
}
