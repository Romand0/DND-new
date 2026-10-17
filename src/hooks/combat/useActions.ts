import combatStore from '@/data/combatStore';
import type { CombatRecord } from '@/types/combat';

interface Props {
  playbackStarted: boolean;
  playbackPaused: boolean;
  currentTurn: { round: number; combatantId: string } | null;
}

/**
 * 动作机制（方案 A：以页面为权威源抽取）。
 * 可用性统一走 isPlaybackActive()：放映模式 + 已开始 + 未暂停 + 有当前回合才消耗动作；
 * 暂停期间按模拟模式处理（恒可用、不消耗、不标记装填攻击）。
 */
export function useActions(record: CombatRecord | null, { playbackStarted, playbackPaused, currentTurn }: Props) {
  // 当前战斗模式：playback=放映（有回合，每回合 1 动作），否则 simulation=模拟（动作无限）
  const currentMode = (): 'simulation' | 'playback' =>
    record?.mode === 'playback' ? 'playback' : 'simulation';

  // 是否处于"有效放映回合中"：放映模式 + 已开始 + 未暂停 + 有当前回合
  // （暂停期间所有动作判定按模拟模式处理：不消耗动作、不写当前回合格）
  const isPlaybackActive = (): boolean =>
    currentMode() === 'playback' && playbackStarted && !playbackPaused && !!currentTurn;

  // 该参战者当前是否还能发起动作（模拟模式/放映暂停恒可；放映模式 0 时禁止）
  const canUseAction = (combatantId: string): boolean => {
    if (!record) return false;
    if (!isPlaybackActive()) return true;
    const c = record.combatants.find(x => x.id === combatantId);
    if (!c) return false;
    return (typeof c.actions === 'number' ? c.actions : 1) > 0;
  };

  // 消耗 1 个动作（写入 store，订阅机制自动刷新 UI）；暂停期间不消耗
  const consumeCombatantAction = (combatantId: string) => {
    if (!record) return;
    if (!isPlaybackActive()) return;
    combatStore.consumeAction(record.id, combatantId, 'playback');
  };

  // 该参战者当前是否还有可用附赠动作次数（模拟模式/放映暂停恒可；放映模式 0 时禁止）
  const canUseBonusAction = (combatantId: string): boolean => {
    if (!record) return false;
    if (!isPlaybackActive()) return true;
    const c = record.combatants.find(x => x.id === combatantId);
    if (!c) return false;
    return (typeof c.bonusActions === 'number' ? c.bonusActions : 1) > 0;
  };

  // 消耗 1 个附赠动作（写入 store，订阅机制自动刷新 UI）；暂停期间不消耗
  const consumeCombatantBonusAction = (combatantId: string) => {
    if (!record) return;
    if (!isPlaybackActive()) return;
    combatStore.consumeBonusAction(record.id, combatantId, 'playback');
  };

  // 放映模式：标记本回合已用过装填武器攻击（每回合只能攻击一次，优先级高于额外动作）
  // 暂停期间不做标记，暂停解除前的操作不计入回合限制
  const markLoadingAttacked = (combatantId: string) => {
    if (!isPlaybackActive()) return;
    const latest = combatStore.get(record.id);
    if (!latest) return;
    combatStore.update(record.id, {
      loadingAttackedThisRound: {
        ...(latest.loadingAttackedThisRound || {}),
        [combatantId]: true,
      },
      updatedAt: Date.now(),
    });
  };

  // 放映模式回合开始：恢复该参战者可用动作为 1
  const resetCombatantActions = (combatantId: string) => {
    if (!record) return;
    if (record.mode !== 'playback') return;
    combatStore.resetActions(record.id, combatantId);
  };

  return {
    currentMode,
    isPlaybackActive,
    canUseAction,
    canUseBonusAction,
    consumeCombatantAction,
    consumeCombatantBonusAction,
    markLoadingAttacked,
    resetCombatantActions,
  };
}
