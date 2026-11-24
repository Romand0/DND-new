// resource_conv 引擎（B7 渠道，feature-fullcycle P3）：convert 动作项执行 + grants 额外资源。
// from 槽扣减（原特性 activation 对应 actions/bonusActions）由调用方（handleFeatureUse /
// turnCommitApply）统一执行，引擎只负责 to 目标的落地与声明。
// v1 覆盖度：dash 走移动力账务（与 dash op 同构）；disengage 挂撤离状态（与基础动作
// disengageFor 同状态，反应通道据此抑制借机攻击）；hide 隐匿机制未建，产出声明 note；
// action/bonus 目标走槽位授予。
import combatStore from '@/data/combatStore';
import { globalStatusManager } from '@/data/statusManager';
import type { Combatant } from '@/types/combat';

/** convert.to 动作项中文标签（弹窗选择列表与回合记录共用） */
export const CONV_TARGET_LABELS: Record<string, string> = {
  action: '主动作',
  bonus: '附赠动作',
  dash: '疾走',
  disengage: '撤离',
  hide: '躲藏',
};

export interface ConvApplyResult {
  note: string;
}

/**
 * convert.to 单项目标执行：
 *  - dash：额外移动力 += 战斗速度（speed + speedModifier），与 dash op/DM 端 dashFor 同账务
 *  - disengage：挂撤离状态（至下回合开始），移动不引发借机攻击；动作消耗由转换上游扣除
 *  - hide：隐匿机制未建（隐匿检定占位），声明文案交 DM 裁定
 *  - action/bonus：对应动作槽 +1（grants 语义复用）
 */
export function applyConvTarget(recordId: string, combatant: Combatant, target: string): ConvApplyResult {
  const latest = combatStore.get(recordId);
  const live = latest?.combatants.find(c => c.id === combatant.id) ?? combatant;
  if (target === 'dash') {
    const battleSpeed = (live.speed ?? 30) + (live.speedModifier ?? 0);
    combatStore.update(recordId, {
      combatants: (latest?.combatants ?? [combatant]).map(c =>
        c.id === combatant.id ? { ...c, dashExtraMovement: (c.dashExtraMovement ?? 0) + battleSpeed } : c
      ),
      updatedAt: Date.now(),
    });
    return { note: `额外移动力 +${battleSpeed}` };
  }
  if (target === 'action') {
    const actions = combatStore.grantAction(recordId, combatant.id);
    return { note: actions != null ? `获得一个额外主动作（本回合可用动作 ${actions}）` : '无法授予主动作' };
  }
  if (target === 'bonus') {
    const bonus = combatStore.grantBonusAction(recordId, combatant.id);
    return { note: bonus != null ? `获得一个附赠动作（本回合可用附赠动作 ${bonus}）` : '无法授予附赠动作' };
  }
  if (target === 'disengage') {
    // 与 CombatSession.disengageFor 同一状态：放映模式锚定至自己下回合开始，
    // 模拟模式保留手动解除（与 dodging 同款语义）。
    const playback = latest?.mode === 'playback';
    const currentRound0 = latest
      ? (latest.playbackState?.currentTurn?.round ?? Math.max(0, latest.rounds.length - 1))
      : 0;
    globalStatusManager.applyEffect(combatant.id, 'disengaging', 'combat', recordId, {
      durationRounds: 1,
      ...(playback
        ? {
            combatMode: 'playback' as const,
            startRound: currentRound0,
            untilNextTurn: true,
            anchorCombatantId: combatant.id,
            turnCount: 1,
          }
        : { combatMode: 'simulation' as const }),
    });
    return { note: '本回合移动不引发借机攻击' };
  }
  if (target === 'hide') {
    return { note: '进入躲藏（隐匿检定与被动察觉对抗由 DM 按沙盘裁定）' };
  }
  return { note: `${CONV_TARGET_LABELS[target] ?? target}（无对应引擎，DM 手动裁定）` };
}
