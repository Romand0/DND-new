import { useRef, useState } from 'react';
import type { CombatRecord, RoundAction, TurnSnapshot } from '@/types/combat';
import combatStore from '@/data/combatStore';
import battlegroundStore from '@/data/battlegroundStore';
import * as snapDb from '@/lib/combatSnapshots';

interface Props {
  playbackStarted: boolean;
  setPlaybackStarted: (v: boolean) => void;
  currentTurn: { round: number; combatantId: string } | null;
  setCurrentTurn: (v: { round: number; combatantId: string } | null) => void;
  findNextValidTurn: (
    fromRound: number,
    fromCol: number,
    roundsOverride?: RoundAction[]
  ) => { round: number; combatantId: string } | null;
  checkAndAutoAdvance: (turn: { round: number; combatantId: string } | null) => void;
  takeTurnSnapshot: (round: number, combatantId: string) => void;
  rollbackSnapshotRef: React.MutableRefObject<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>;
  // 先攻表格选中格：startPlayback 从该格开始扫描
  selectedCell: { round: number; combatantId: string } | null;
  // 惰性箭头传入：定义于页面更下方（useActions / useDamageAndHp / useSurprise），事件触发时才求值
  resetCombatantActions: (id: string) => void;
  autoFillDownedMarkers: () => void;
  openSurpriseAttackModal: (round: number) => void;
}

/**
 * 放映模式生命周期（方案 A：以页面为权威源抽取）。
 * 拥有暂停/恢复/从头播放/退出确认全链路；initial 快照的 IDB 持久化与清理也在此收口。
 */
export function usePlayback(record: CombatRecord | null, props: Props) {
  const {
    playbackStarted, setPlaybackStarted,
    currentTurn, setCurrentTurn,
    findNextValidTurn, checkAndAutoAdvance, takeTurnSnapshot,
    rollbackSnapshotRef, selectedCell,
    resetCombatantActions, autoFillDownedMarkers, openSurpriseAttackModal,
  } = props;

  // ✅ 暂停放映：true 时不处于任何参战者的回合，操作按模拟模式处理（不消耗动作、不计入当前回合）
  const [playbackPaused, setPlaybackPaused] = useState(false);
  // 暂停时临时保存的回合位置，恢复放映时回到该处
  const pausedTurnRef = useRef<{ round: number; combatantId: string } | null>(null);
  // 沙盘快照：用于开始放映时重置
  const playbackSnapshotRef = useRef<{ col: number; row: number; combatantId: string }[] | null>(null);
  // 退出放映弹窗：保存 / 丢弃
  const [exitPlaybackModalOpen, setExitPlaybackModalOpen] = useState(false);
  // ✅ 从头播放标记：突袭弹窗确认后自动启动放映
  const [pendingRestartPlayback, setPendingRestartPlayback] = useState(false);

  const commitModeChange = (mode: 'simulation' | 'playback') => {
    if (!record) return;
    combatStore.update(record.id, { mode, updatedAt: Date.now() });
  };

  // ✅ 模式切换（对外入口：放映→模拟时弹出确认窗，其他情况直接提交）
  const handleModeChange = (mode: 'simulation' | 'playback') => {
    if (!record) return;
    if (record.mode === mode) return;
    // 放映模式 → 模拟模式：弹窗
    if (record.mode === 'playback' && mode === 'simulation') {
      if (playbackStarted || playbackSnapshotRef.current) {
        setExitPlaybackModalOpen(true);
        return;
      }
    }
    // 其他情况：直接切换
    commitModeChange(mode);
    if (mode === 'playback') {
      const bg = battlegroundStore.get(record.id);
      const latestForSnapshot = combatStore.get(record.id);
      playbackSnapshotRef.current = (bg?.tokens ?? []).map(t => ({ ...t }));
      const initialSnap: TurnSnapshot = {
        combatants: record.combatants.map(c => ({ ...c })),
        rounds: record.rounds.map(r => ({ ...r })),
        battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
        equipmentChanges: latestForSnapshot?.equipmentChanges
          ? Object.fromEntries(
              Object.entries(latestForSnapshot.equipmentChanges).map(([k, v]) => [
                k,
                { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
              ]),
            )
          : undefined,
      };
      rollbackSnapshotRef.current = { initial: initialSnap, snapshots: {} };
      // 同步写入 IndexedDB：刷新/关闭页面后恢复可用
      snapDb.putInitialSnapshot(record.id, initialSnap).catch(e => console.warn('写入初始快照失败', e));
    }
  };

  // ✅ 退出放映：保存覆盖 or 丢弃恢复（由 exit modal 按钮调用）
  const finalizeExitPlayback = (preserveChanges: boolean) => {
    if (record?.mode !== 'playback') {
      setExitPlaybackModalOpen(false);
      return;
    }
    if (!preserveChanges) {
      // 「丢弃，恢复原先状态」：完整还原 combatants / rounds / 装备变更 / 沙盘 到进入放映模式时的快照
      const init = rollbackSnapshotRef.current.initial;
      if (init) {
        combatStore.update(record.id, {
          combatants: init.combatants.map(c => ({ ...c })),
          rounds: init.rounds.map(r => ({ ...r })),
          equipmentChanges: init.equipmentChanges
            ? Object.fromEntries(
                Object.entries(init.equipmentChanges).map(([k, v]) => [
                  k,
                  { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
                ]),
              )
            : undefined,
          updatedAt: Date.now(),
        });
        battlegroundStore.setTokens(record.id, init.battleground.map(t => ({ ...t })));
      } else if (playbackSnapshotRef.current) {
        // fallback：只恢复了沙盘
        battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
      }
    }
    // 「保存并覆盖」分支：combatStore 中已是最新数据，无需额外还原
    setPlaybackStarted(false);
    setPlaybackPaused(false);
    pausedTurnRef.current = null;
    setCurrentTurn(null);
    playbackSnapshotRef.current = null;
    rollbackSnapshotRef.current = { initial: null, snapshots: {} };
    // 退出放映模式清理 IndexedDB 快照（避免磁盘长期堆积）
    if (record) {
      snapDb.deleteSessionSnapshots(record.id).catch((e) => {
        console.warn('[CombatSession] 清理快照失败（磁盘满/QuotaExceeded/IDB损坏）:', e);
      });
    }
    setExitPlaybackModalOpen(false);
    commitModeChange('simulation');
  };

  // ✅ 暂停放映：清空 currentTurn，保存回合位置以便恢复
  const pausePlayback = () => {
    if (!record || !playbackStarted || playbackPaused) return;
    pausedTurnRef.current = currentTurn;
    setPlaybackPaused(true);
    // 这里不清空 actions：只是"临时脱离"，恢复放映时仍保持原动作计数不变
    // （暂停期间操作不消耗动作，恢复后按原状态继续）
  };

  // ✅ 恢复放映：回到暂停前保存的回合位置
  const resumePlayback = () => {
    if (!record || !playbackStarted || !playbackPaused) return;
    const savedTurn = pausedTurnRef.current;
    // 暂停期间用户可能把 rounds 截断或新增了轮次：若保存位置仍有效则直接用，否则重新扫描
    if (savedTurn
      && savedTurn.round < record.rounds.length
      && record.combatants.findIndex(c => c.id === savedTurn.combatantId) >= 0) {
      setCurrentTurn(savedTurn);
      checkAndAutoAdvance(savedTurn);
    } else {
      // 保存位置已失效（暂停期间做过回溯/截断等）：重新从头部扫描有效回合
      const firstTurn = findNextValidTurn(0, 0);
      setCurrentTurn(firstTurn);
      if (firstTurn) {
        resetCombatantActions(firstTurn.combatantId);
        takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
        checkAndAutoAdvance(firstTurn);
      }
    }
    pausedTurnRef.current = null;
    setPlaybackPaused(false);
  };

  // ✅ 启动放映：重置沙盘到快照状态，从选中的格子开始扫描
  const startPlayback = () => {
    if (!record) return;
    // 1. 重置沙盘到进入放映模式时的快照（从 initial 快照读取，刷新后也能正确恢复）
    const init = rollbackSnapshotRef.current.initial;
    if (init) {
      battlegroundStore.setTokens(record.id, init.battleground.map(t => ({ ...t })));
    } else if (playbackSnapshotRef.current) {
      // fallback：兼容旧逻辑
      battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
    }
    // 2. 自动填充昏迷/死亡标记到后续所有轮次
    autoFillDownedMarkers();
    // 3. 从用户点击的格子开始扫描（若未选中则从开头）
    let startRound = 0;
    let startCol = 0;
    if (selectedCell) {
      startRound = selectedCell.round;
      const colIdx = record.combatants.findIndex(c => c.id === selectedCell.combatantId);
      startCol = Math.max(0, colIdx);
    }
    const firstTurn = findNextValidTurn(startRound, startCol);
    setPlaybackPaused(false);
    pausedTurnRef.current = null;
    setCurrentTurn(firstTurn);
    setPlaybackStarted(true);
    // 进入第一回合时立即拍快照（takeTurnSnapshot 直接读 combatStore 最新值，无需等渲染）
    if (firstTurn) {
      // 放映模式：回合开始恢复该参战者可用动作为 1
      resetCombatantActions(firstTurn.combatantId);
      takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
      checkAndAutoAdvance(firstTurn);
    }
  };

  // ✅ 从头播放：三种场景处理
  const handleRestartPlayback = () => {
    if (!record) return;
    // 场景判断：使用最新 store 数据（避免闭包 stale）
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const hasRound0 = latest.rounds.length > 0;
    const round0HasSurprise = hasRound0 && latest.rounds[0] && Object.values(latest.rounds[0]).some(v => v === '被突袭');
    const isAtStart = currentTurn?.round === 0 && latest.combatants.findIndex(c => c.id === currentTurn.combatantId) === 0;

    if (!hasRound0) {
      // 场景 A：空表格 → 打开第一轮 + 突袭弹窗 + 从第一格放映
      setPendingRestartPlayback(true);
      openSurpriseAttackModal(0);
      // 等待突袭弹窗确认后，由 useSurprise.onConfirmed 调用 startPlaybackFromBeginning
      return;
    }

    if (!round0HasSurprise) {
      // 场景 B：已有第一轮但突袭为空 → 突袭弹窗 + 从第一格放映
      setPendingRestartPlayback(true);
      openSurpriseAttackModal(0);
      return;
    }

    // 场景 C：已有第一轮且突袭不为空
    if (!isAtStart) {
      // 当前不在起点 → 弹窗确认回溯
      if (!window.confirm('从头播放将清空所有回合记录并回到第一格，是否继续？')) return;
    }
    // 执行从头播放
    startPlaybackFromBeginning();
  };

  // ✅ 实际从头播放（重置沙盘+快照后启动）
  const startPlaybackFromBeginning = () => {
    if (!record) return;
    // 1. 重置沙盘到进入放映时的快照
    const init = rollbackSnapshotRef.current.initial;
    if (init) {
      battlegroundStore.setTokens(record.id, init.battleground.map(t => ({ ...t })));
      // 恢复参战者状态 + 回合记录 + 装备变更到初始快照（完整回溯）
      combatStore.update(record.id, {
        combatants: init.combatants.map(c => ({ ...c })),
        rounds: init.rounds.map(r => ({ ...r })),
        equipmentChanges: init.equipmentChanges
          ? Object.fromEntries(
              Object.entries(init.equipmentChanges).map(([k, v]) => [
                k,
                { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
              ]),
            )
          : undefined,
        updatedAt: Date.now(),
      });
    } else if (playbackSnapshotRef.current) {
      battlegroundStore.setTokens(record.id, playbackSnapshotRef.current);
    }
    // 2. 重置快照引用（保留 initial，清空 turn snapshots，从头开始新的放映历史）
    rollbackSnapshotRef.current = {
      initial: rollbackSnapshotRef.current.initial,
      snapshots: {}
    };
    // 3. 清空 IndexedDB 中的旧快照
    snapDb.deleteSessionSnapshots(record.id).catch(() => {});
    // 4. 从第一格开始启动放映
    setPlaybackStarted(false);
    setPlaybackPaused(false);
    pausedTurnRef.current = null;
    setCurrentTurn(null);
    // 延迟一帧确保状态更新后再启动
    setTimeout(() => {
      setPlaybackStarted(true);
      // 使用刚恢复的 rounds 而非 stale record，避免扫描到旧记录
      const restoredRounds = init ? init.rounds.map(r => ({ ...r })) : record.rounds;
      const firstTurn = findNextValidTurn(0, 0, restoredRounds);
      setCurrentTurn(firstTurn);
      if (firstTurn) {
        resetCombatantActions(firstTurn.combatantId);
        takeTurnSnapshot(firstTurn.round, firstTurn.combatantId);
        checkAndAutoAdvance(firstTurn);
      }
    }, 0);
  };

  return {
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
  };
}
