import { useState } from 'react';
import type { CombatRecord, Combatant, RoundAction, TurnSnapshot } from '@/types/combat';
import battlegroundStore from '@/data/battlegroundStore';
import combatStore from '@/data/combatStore';
import * as snapDb from '@/lib/combatSnapshots';

// 再导出共享类型：stale usePlayback（P4 迁移前）仍从此处 import TurnSnapshot
export type { TurnSnapshot };

export interface UseRoundTurnProps {
  resetCombatantActions: (id: string) => void;
  isPlaybackActive: () => boolean;
  setCommitModalOpen: (open: boolean) => void;
  rollbackSnapshotRef: React.MutableRefObject<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>;
  autoAdvanceRef: React.MutableRefObject<boolean>;
  autoAdvanceTimerRef: React.MutableRefObject<number | null>;
}

export function useRoundTurn(record: CombatRecord | null, props: UseRoundTurnProps) {
  const {
    resetCombatantActions, isPlaybackActive, setCommitModalOpen,
    rollbackSnapshotRef, autoAdvanceRef, autoAdvanceTimerRef,
  } = props;

  // ✅ 放映模式状态（usePlayback 尚未接线，先由本 hook 持有，P4 迁移时复用）
  const [playbackStarted, setPlaybackStarted] = useState(false);
  // 当前回合：{ round: 行索引, combatantId: 列标识 }（§5.12 纯 combatantId 设计）
  const [currentTurn, setCurrentTurn] = useState<{ round: number; combatantId: string } | null>(null);
  // 确认弹窗：完成回合
  const [confirmEndTurnOpen, setConfirmEndTurnOpen] = useState(false);
  // ✅ 回溯弹窗：放映模式下删除先攻表格记录用（清空该格之后所有内容 + 还原生命值/沙盘）
  const [rewindModal, setRewindModal] = useState<{
    round: number;
    combatantId: string;
    combatantIdx: number;
    firstClickDone: boolean;
  } | null>(null);

  // 原内容：完全保留，一个字都没改（单元格编辑逻辑不变）
  const handleCellChange = (roundIndex: number, combatantId: string, value: string) => {
    if (!record) return;
    const updatedRounds = [...record.rounds];
    updatedRounds[roundIndex] = {
      ...updatedRounds[roundIndex],
      [combatantId]: value,
    };
    combatStore.update(record.id, {
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ✅ 找到下一个有效回合（跳过被突袭/死亡，不跳过昏迷）
  // 从指定位置（行、列）开始，向右→下一行扫描
  // 可选传入 roundsOverride：当本帧刚 combatStore.update 新增了轮次、record 还没重新渲染时使用
  // 说明：昏迷角色一律不跳过——进入回合后再根据 PC/NPC/稳定 分别处理
  //   - PC：显示待办板让用户做死亡豁免
  //   - NPC：系统自动掷骰并推进
  //   - 稳定（成功≥3）：显示状态后手动/自动推进
  const findNextValidTurn = (
    fromRound: number,
    fromCol: number,
    roundsOverride?: RoundAction[]
  ): { round: number; combatantId: string } | null => {
    if (!record) return null;
    const rounds = roundsOverride ?? record.rounds;
    for (let r = fromRound; r < rounds.length; r++) {
      const startCol = r === fromRound ? fromCol : 0;
      for (let i = startCol; i < record.combatants.length; i++) {
        const c = record.combatants[i];
        const v = rounds[r][c.id];
        if (v === '被突袭' || v === '死亡') continue;
        // 昏迷中，无法行动：不再跳过，保证视觉可见性
        return { round: r, combatantId: c.id };
      }
    }
    return null;
  };

  // ✅ 处理单个昏迷角色回合（NPC 自动掷骰，PC 稳定后直接跳过）
  // 返回 true 表示该回合无需用户操作（系统已自动处理）
  const handleComatoseTurn = (combatant: Combatant, round: number): boolean => {
    if (!record || record.mode !== 'playback') return false;
    if (!combatant.isUnconscious || combatant.isDead) return false;
    const latest = combatStore.get(record.id);
    if (!latest) return false;

    // PC：有未执行的 death_save 待办 → 需要用户操作（返回 false）
    if (combatant.isPc) {
      const hasActiveTodo = (latest.turnTodos ?? []).some(t =>
        t.type === 'death_save' &&
        t.combatantId === combatant.id &&
        !t.executed &&
        t.startRound <= round &&
        (t.endRound === -1 || t.endRound >= round)
      );
      // 无待办 → 稳定状态，直接跳过
      if (!hasActiveTodo) {
        // 稳定后的回合写入明确文字
        const roundContent = latest.rounds[round]?.[combatant.id] ?? '';
        if (roundContent === '昏迷中，无法行动') {
          const updatedRounds = latest.rounds.map((r, idx) =>
            idx === round ? { ...r, [combatant.id]: '昏迷中，伤势稳定（无需再掷骰）' } : r
          );
          combatStore.update(latest.id, { rounds: updatedRounds, updatedAt: Date.now() });
        }
        return true;
      }
      return false; // PC 有 death_save 待办 → 等用户操作
    }

    // NPC：自动死亡豁免掷骰 + 写入先攻表格
    const result = combatStore.autoNpcDeathSave(latest.id, combatant.id);
    if (!result) return true; // 已死亡或非昏迷，跳过
    let text: string;
    if (result.outcome === 'revive') {
      text = `死亡豁免：掷出 ${result.roll}，苏醒，HP 恢复至 1`;
    } else if (result.combatant.isDead) {
      text = `死亡豁免：掷出 ${result.roll}，失败 ${result.combatant.deathSaveFailures}/3，已死亡`;
    } else if ((result.combatant.deathSaveSuccesses ?? 0) >= 3) {
      text = `死亡豁免：掷出 ${result.roll}，成功 ${result.combatant.deathSaveSuccesses}/3，已稳定`;
    } else if (result.outcome === 'crit_fail') {
      text = `死亡豁免：掷出 ${result.roll}，两次失败（${result.combatant.deathSaveFailures}/3）`;
    } else if (result.outcome === 'fail') {
      text = `死亡豁免：掷出 ${result.roll}，一次失败（${result.combatant.deathSaveFailures}/3）`;
    } else {
      text = `死亡豁免：掷出 ${result.roll}，一次成功（${result.combatant.deathSaveSuccesses}/3）`;
    }
    const afterLatest = combatStore.get(latest.id);
    if (afterLatest) {
      const updatedRounds = afterLatest.rounds.map((r, idx) =>
        idx === round ? { ...r, [combatant.id]: text } : r
      );
      combatStore.update(afterLatest.id, { rounds: updatedRounds, updatedAt: Date.now() });
    }
    return true;
  };

  // ✅ 推进到下一个回合（用户点击"完成回合"时）
  const advanceTurn = () => {
    // 手动推进时清除自动推进定时器，防止与 checkAndAutoAdvance 的 setTimeout 竞态
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
      autoAdvanceRef.current = false;
    }
    if (!currentTurn || !record) return;
    const currentIdx = record.combatants.findIndex(c => c.id === currentTurn.combatantId);
    const next = findNextValidTurn(currentTurn.round, currentIdx + 1);
    if (next) {
      if (next.round > currentTurn.round) {
        combatStore.resetTurnTodosForRound(record.id, next.round);
      }
      // 进入新参战者回合时清理过期优劣势（§5.13 设计行为，页面此前漏调，接线时补齐）：
      // (1) 该参战者本身 expireRound 过期
      combatStore.clearExpiredAdvantage(record.id, next.combatantId, next.round);
      // (2) 所有以该参战者回合锚点过期的 pending（如协助动作：发出者下回合前）
      combatStore.clearAdvantageByExpireCombatant(record.id, next.combatantId);
      setCurrentTurn(next);
      resetCombatantActions(next.combatantId);
      takeTurnSnapshot(next.round, next.combatantId);
      checkAndAutoAdvance(next);
      return;
    }
    // 当前行结束 → 判断是否还有活着的角色可战斗
    const aliveCount = record.combatants.filter(c => !c.isDead && !c.isUnconscious).length;
    if (aliveCount === 0) {
      setCurrentTurn(null);
      setPlaybackStarted(false);
      // 显示战斗结束回传弹窗
      setCommitModalOpen(true);
      return;
    }
    // 检查是否需要新开一轮
    const nextRound = currentTurn.round + 1;
    if (nextRound >= record.rounds.length) {
      const newRound: RoundAction = {};
      record.combatants.forEach(c => {
        if (c.isDead) newRound[c.id] = '死亡';
        else if (c.isUnconscious) newRound[c.id] = '昏迷中，无法行动';
        else newRound[c.id] = '';
      });
      const updatedRounds = [...record.rounds, newRound];
      combatStore.update(record.id, { rounds: updatedRounds, updatedAt: Date.now() });
      combatStore.resetTurnTodosForRound(record.id, nextRound);
      const firstInNew = findNextValidTurn(nextRound, 0, updatedRounds);
      if (firstInNew) {
        combatStore.clearExpiredAdvantage(record.id, firstInNew.combatantId, firstInNew.round);
        combatStore.clearAdvantageByExpireCombatant(record.id, firstInNew.combatantId);
        setCurrentTurn(firstInNew);
        resetCombatantActions(firstInNew.combatantId);
        takeTurnSnapshot(firstInNew.round, firstInNew.combatantId);
        checkAndAutoAdvance(firstInNew);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    } else {
      combatStore.resetTurnTodosForRound(record.id, nextRound);
      const firstInNext = findNextValidTurn(nextRound, 0);
      if (firstInNext) {
        combatStore.clearExpiredAdvantage(record.id, firstInNext.combatantId, firstInNext.round);
        combatStore.clearAdvantageByExpireCombatant(record.id, firstInNext.combatantId);
        setCurrentTurn(firstInNext);
        resetCombatantActions(firstInNext.combatantId);
        takeTurnSnapshot(firstInNext.round, firstInNext.combatantId);
        checkAndAutoAdvance(firstInNext);
      } else {
        setCurrentTurn(null);
        setPlaybackStarted(false);
      }
    }
  };

  // ✅ 切换回合后检查：若当前是昏迷角色且无需用户操作（NPC/稳定PC），自动处理并延迟推进
  const checkAndAutoAdvance = (turn: { round: number; combatantId: string } | null) => {
    if (!record || !turn || record.mode !== 'playback' || !playbackStarted) return;
    if (autoAdvanceRef.current) return;
    const c = record.combatants.find(x => x.id === turn.combatantId);
    if (!c || !c.isUnconscious || c.isDead) return;
    const handled = handleComatoseTurn(c, turn.round);
    if (!handled) return;
    autoAdvanceRef.current = true;
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceRef.current = false;
      autoAdvanceTimerRef.current = null;
      advanceTurn();
    }, 750);
  };

  // ✅ 确定沙盘攻击写入先攻表格的 {round, combatantId} 坐标
  // 有效放映回合 → 当前回合（写入当前角色列）；模拟模式/暂停放映 → 最后一轮（写入攻击者本人列）
  const resolveWriteCell = (attackerId: string): { round: number; combatantId: string } | null => {
    if (!record) return null;
    if (isPlaybackActive()) {
      return { round: currentTurn!.round, combatantId: currentTurn!.combatantId };
    }
    // 模拟模式 / 暂停放映：最后一轮（不存在则创建第一轮），写入攻击者本人列
    const round = Math.max(0, record.rounds.length - 1);
    return { round, combatantId: attackerId };
  };

  // ✅ 写入先攻表格：支持追加（保留已有内容，另起一行）
  const appendRoundRecord = (round: number, combatantId: string, newLine: string) => {
    if (!record) return;
    const existing = record.rounds[round]?.[combatantId] || '';
    const finalText = existing ? `${existing}\n${newLine}` : newLine;
    handleCellChange(round, combatantId, finalText);
  };

  // ✅ 拍某回合的快照：记录此回合开始时的 combatants / rounds / 沙盘
  // 每次进入新回合（播放起始、确认完成回合后）调用一次
  // 注意：直接从 combatStore 读取最新值，避免 record state 还未重新渲染导致读到旧数据
  // 双写：内存 useRef（同步快读）+ IndexedDB（刷新/关闭页面后仍可回溯）
  const takeTurnSnapshot = (round: number, combatantId: string) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const bg = battlegroundStore.get(record.id);
    const snap: TurnSnapshot = {
      combatants: latest.combatants.map(c => ({ ...c })),
      rounds: latest.rounds.map(r => ({ ...r })),
      battleground: (bg?.tokens ?? []).map(t => ({ ...t })),
      equipmentChanges: latest.equipmentChanges
        ? Object.fromEntries(
            Object.entries(latest.equipmentChanges).map(([k, v]) => [
              k,
              { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
            ]),
          )
        : undefined,
    };
    const memKey = `${round}:${combatantId}`;
    // 只在第一次拍（始终回到该回合最初状态）
    if (!rollbackSnapshotRef.current.snapshots[memKey]) {
      rollbackSnapshotRef.current.snapshots[memKey] = snap;
    }
    // 异步写入 IndexedDB，不阻塞主线程
    snapDb.putTurnSnapshot(record.id, round, combatantId, snap).catch(e => console.warn('写入回合快照失败', e));
  };

  // ✅ 回溯到指定回合开始：还原该回合及其之后所有记录为空，并把战斗数据整体还原到快照
  // 查找优先级：内存 useRef（exact key）→ IndexedDB exact key → IndexedDB 近似 key（≤目标 round 的最大 round）→ initial
  // 关键修复：snap.rounds 是"拍快照那一瞬间"的短数组，若当时还没 push 到目标 round 长度，
  // 用 currentStoreRounds 在 snap.rounds 末尾补长度，避免"目标回合格子不存在就不做清空"。
  const applyRollback = async (round: number, combatantIdx: number) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    const combatantId = latest.combatants[combatantIdx]?.id;
    if (!combatantId) return;
    const memKey = `${round}:${combatantId}`;
    let snap: TurnSnapshot | null =
      rollbackSnapshotRef.current.snapshots[memKey] ?? rollbackSnapshotRef.current.initial ?? null;
    let exact = !!snap;
    if (!snap) {
      try {
        const best = await snapDb.getBestTurnSnapshot(record.id, round, combatantId);
        if (best) { snap = best.snapshot; exact = best.exact; }
      } catch { /* ignore */ }
    }
    if (!snap) {
      alert('回溯失败：未找到该回合的快照，请先至少推进一个回合后再回溯');
      return;
    }
    // 1) 还原 combatants（HP / 状态）到快照
    const restoredCombatants = snap.combatants.map(c => ({ ...c }));
    // 2) 还原 rounds：
    //   - 先将 snap.rounds 与 latest.rounds 对齐补全到目标 round + 1 长度（避免快照拍得太早导致缺少目标轮）
    //   - 然后直接截断到 round + 1，移除当前轮数之后的所有整行
    const needRounds = Math.max(round + 1, snap.rounds.length);
    const snapRounds = snap.rounds.map(r => ({ ...r }));
    const latestRounds = latest.rounds;
    const paddedRounds: RoundAction[] = [];
    for (let r = 0; r < needRounds; r++) {
      if (r < snapRounds.length) paddedRounds.push(snapRounds[r]);
      else paddedRounds.push({ ...(latestRounds[r] ?? {}) });
    }
    // 非 exact 的回退（用了较旧的 snapshot）：保留 snapshot 到目标 round 之间 rounds 已有的"被突袭/昏迷/死亡"占位
    if (!exact && latest.rounds.length > snap.rounds.length) {
      for (let r = snap.rounds.length; r < paddedRounds.length; r++) {
        if (latest.rounds[r]) {
          const cur = paddedRounds[r];
          for (const c of restoredCombatants) {
            const v = latest.rounds[r][c.id];
            if (v === '被突袭' || v === '昏迷中，无法行动' || v === '死亡') {
              cur[c.id] = v;
            }
          }
        }
      }
    }
    // 当前轮内：目标格之后的单元格清空（同一轮内的后续角色不删除整行）
    const totalCombatants = restoredCombatants.length;
    for (let c = 0; c < totalCombatants; c++) {
      const cid = restoredCombatants[c].id;
      const isAfterInRound = c > combatantIdx;
      if (isAfterInRound) {
        paddedRounds[round] = { ...paddedRounds[round], [cid]: '' };
      }
    }
    // 当前轮内目标格之后：根据 snap 时刻角色状态重新填入昏迷/死亡占位（不覆盖被突袭）
    restoredCombatants.forEach((c, idx) => {
      if (!c.isDead && !c.isUnconscious) return;
      const marker = c.isDead ? '死亡' : '昏迷中，无法行动';
      const isAfterInRound = idx > combatantIdx;
      if (!isAfterInRound) return;
      const cur = paddedRounds[round]?.[c.id];
      if (cur === '被突袭') return;
      paddedRounds[round] = { ...paddedRounds[round], [c.id]: marker };
    });
    // 关键修改：截断到 round + 1，移除当前轮数之后的所有整行（而非仅清空单元格）
    const truncatedRounds = paddedRounds.slice(0, round + 1);
    // 3) 应用还原
    combatStore.update(record.id, {
      combatants: restoredCombatants,
      rounds: truncatedRounds,
      equipmentChanges: snap.equipmentChanges
        ? Object.fromEntries(
            Object.entries(snap.equipmentChanges).map(([k, v]) => [
              k,
              { added: [...v.added], removedChildIds: [...v.removedChildIds], quantityDeltas: { ...v.quantityDeltas } },
            ]),
          )
        : undefined,
      updatedAt: Date.now(),
    });
    // 4) 还原沙盘
    battlegroundStore.setTokens(record.id, snap.battleground.map(t => ({ ...t })));
    // 5) 当前回合跳到此回合格
    setCurrentTurn({ round, combatantId });
    // 6) 此回合格在回溯后需要重新拍快照：清掉内存+IDB 中旧快照，下次进入重拍
    const memKey2 = `${round}:${combatantId}`;
    delete rollbackSnapshotRef.current.snapshots[memKey2];
    // 同步清理 IndexedDB 中的旧快照，防止回溯后重新操作时读到过期快照
    snapDb.deleteTurnSnapshot(record.id, round, combatantId).catch((e) => {
      console.warn('[CombatSession] 清理旧快照失败:', e);
    });
    // 下帧立即为当前"回到此回合"拍新快照（避免回到后再回溯找不到）
    setTimeout(() => takeTurnSnapshot(round, combatantId), 0);
    setRewindModal(null);
  };

  // ✅ 确认完成回合
  const confirmEndTurn = () => {
    setConfirmEndTurnOpen(false);
    advanceTurn();
  };

  return {
    // 状态（usePlayback P4 迁移时从本 hook 消费）
    playbackStarted,
    setPlaybackStarted,
    currentTurn,
    setCurrentTurn,
    confirmEndTurnOpen,
    setConfirmEndTurnOpen,
    rewindModal,
    setRewindModal,
    // 函数
    handleCellChange,
    findNextValidTurn,
    handleComatoseTurn,
    advanceTurn,
    checkAndAutoAdvance,
    resolveWriteCell,
    appendRoundRecord,
    takeTurnSnapshot,
    applyRollback,
    confirmEndTurn,
  };
}
