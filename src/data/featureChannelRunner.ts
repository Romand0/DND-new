// 主动技能通道执行器：featureCapabilities 注册条目 → 既有引擎落地。
// DM 端 handleFeatureUse 与玩家回合包 feature-use op（turnCommitApply）共用同一条执行路径，
// 保证两端语义一致：status 通道挂状态实例 + TurnTodo 提醒；advantage 通道写 pending 优劣势标记。
// currentRound0 为 0-based 放映轮次（与 playbackState.currentTurn.round 同口径）。
import combatStore from '@/data/combatStore';
import { globalStatusManager } from '@/data/statusManager';
import { resolveFeatureCapability } from '@/data/featureCapabilities';
import type { AdvantageSourceKind, CombatRecord, Combatant } from '@/types/combat';
import type { Effect } from '@/types/status';

export interface FeatureChannelResult {
  /** 通道执行说明（回合记录/提示文案；null = manual 等无自动通道） */
  note: string | null;
  /** status 通道挂载的状态实例 ID */
  statusInstanceId?: string;
}

export function executeFeatureChannel(
  record: CombatRecord,
  combatant: Combatant,
  featureName: string,
  currentRound0: number,
): FeatureChannelResult {
  const capability = resolveFeatureCapability(featureName);

  if (capability.channel === 'status' && capability.status) {
    const { statusKey, durationRounds, todo, effects } = capability.status;
    // AdvantageEffectConfig → 状态实例级 Effect（advantage 引擎按 config 匹配检定场景）
    const instanceEffects: Effect[] | undefined = effects?.length
      ? effects.map((cfg, i) => ({
          id: `${statusKey}.adv-${i}`,
          type: 'advantage' as const,
          target: 'self' as const,
          config: cfg as unknown as Record<string, unknown>,
          description: cfg.label ?? featureName,
        }))
      : undefined;
    const instance = globalStatusManager.applyEffect(combatant.id, statusKey, 'combat', record.id, {
      ...(instanceEffects ? { instanceEffects } : {}),
      ...(durationRounds && durationRounds > 0 ? { durationRounds } : {}),
      ...(record.mode === 'playback'
        ? { combatMode: 'playback' as const, startRound: currentRound0 }
        : { combatMode: 'simulation' as const }),
    });
    if (todo) {
      combatStore.addTurnTodo(record.id, {
        combatantId: combatant.id,
        name: todo,
        type: 'condition_check',
        startRound: currentRound0,
        endRound: durationRounds && durationRounds > 0 ? currentRound0 + durationRounds : -1,
      });
    }
    return { note: `已进入「${featureName}」状态`, statusInstanceId: instance.instanceId };
  }

  if (capability.channel === 'advantage' && capability.advantage) {
    const { self, incoming } = capability.advantage;
    const anchorId = combatant.id;
    const mkSource = (spec: { mode: 'advantage' | 'disadvantage'; scene: typeof self.scene; reason?: string }, targetId?: string) => ({
      fromId: combatant.id,
      fromName: combatant.name,
      scene: spec.scene,
      mode: spec.mode,
      reason: spec.reason ?? featureName,
      kind: 'trait' as AdvantageSourceKind,
      ...(targetId ? { targetId } : {}),
      // 双条目都锚定施用者回合：鲁莽攻击的自体优势与敌方反击优势均在下回合开始时清除
      expireOnCombatantId: anchorId,
      createdRound: currentRound0,
      expireRound: -1,
    });
    combatStore.addPendingAdvantage(record.id, anchorId, mkSource(self));
    if (incoming) {
      for (const other of record.combatants) {
        if (other.id === anchorId || other.isDead) continue;
        if (!!other.isPc === !!combatant.isPc) continue;
        combatStore.addPendingAdvantage(record.id, other.id, mkSource(incoming, anchorId));
      }
    }
    return { note: incoming ? '自身近战攻击获得优势，敌人对你的近战攻击也获得优势（至下回合开始）' : '相关检定获得优劣势标记（至下回合开始）' };
  }

  // attack_rider（命中触发）：声明不扣资源，实际消耗与效果在命中时刻由伤害结算弹窗落地
  if (capability.channel === 'attack_rider' && capability.attackRider) {
    return { note: `命中时结算：${capability.attackRider.hint}` };
  }

  return { note: null };
}
