// 主动技能通道执行器：featureCapabilities 注册条目 → 既有引擎落地。
// DM 端 handleFeatureUse 与玩家回合包 feature-use op（turnCommitApply）共用同一条执行路径，
// 保证两端语义一致：status 通道挂状态实例 + TurnTodo 提醒；advantage 通道写 pending 优劣势标记。
// currentRound0 为 0-based 放映轮次（与 playbackState.currentTurn.round 同口径）。
import combatStore from '@/data/combatStore';
import { globalStatusManager } from '@/data/statusManager';
import { resolveFeatureCapability } from '@/data/featureCapabilities';
import { rollHealAmount } from '@/data/engines/healEngine';
import { applyConvTarget, CONV_TARGET_LABELS } from '@/data/engines/resourceConvEngine';
import { characterStore } from '@/data/characterStore';
import type { AdvantageSourceKind, CombatRecord, Combatant } from '@/types/combat';
import type { Effect } from '@/types/status';

export interface FeatureChannelResult {
  /** 通道执行说明（回合记录/提示文案；null = manual 等无自动通道） */
  note: string | null;
  /** status 通道挂载的状态实例 ID */
  statusInstanceId?: string;
  /**
   * heal 通道结算计划（P3）：HP 落库由调用方执行——
   * type hp → useDamageAndHp.handleApplyHealing（maxHp 截断 + 昏迷恢复）；
   * type temp → combatStore.addTempHp（5e 临时生命取高者）。
   * 玩家端打包已掷定 healAmount 时由调用方直接采用，此计划仅 DM 端即时结算产出。
   */
  heal?: { targetId: string; amount: number; detail: string; type: 'hp' | 'temp' };
}

/** 通道执行扩展参数（按通道可选；checkModifier 的受益人、convert 的目标动作项由调用方先选定） */
export interface FeatureChannelOptions {
  /** checkModifier 通道：加值标记的受益人参战者 ID（缺省不执行） */
  targetId?: string;
  /** resource_conv convert 通道：目标动作项（to 多元素时调用方弹窗选定；缺省取 spec.to[0]） */
  convertTarget?: string;
}

export function executeFeatureChannel(
  record: CombatRecord,
  combatant: Combatant,
  featureName: string,
  currentRound0: number,
  opts?: FeatureChannelOptions,
): FeatureChannelResult {
  const capability = resolveFeatureCapability(featureName);

  if (capability.channel === 'checkModifier' && capability.checkModifier && opts?.targetId) {
    const spec = capability.checkModifier;
    const target = record.combatants.find(c => c.id === opts.targetId);
    if (!target || target.isDead) return { note: null };
    const dice = spec.dice(combatant);
    const reason = spec.reason(combatant);
    combatStore.addPendingCheckModifier(record.id, target.id, {
      fromId: combatant.id,
      fromName: combatant.name,
      reason,
      mode: spec.mode ?? 'bonus',
      dice,
      scene: spec.scene,
      forced: false,
      createdRound: currentRound0,
      expireRound: spec.expireRound ?? -1,
      uses: 1,
    });
    const label = spec.diceLabel?.(combatant) ?? `d${dice.sides}`;
    return { note: `${target.name} 获得「${reason}」（${label}，下次适用检定可加）` };
  }

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

  // heal 通道（P3）：掷定恢复量计划，HP 落库由调用方执行（见 FeatureChannelResult.heal 注释）
  if (capability.channel === 'heal' && capability.heal) {
    const spec = capability.heal;
    const char = combatant.characterId ? characterStore.get(combatant.characterId) : null;
    const plan = rollHealAmount(spec, char?.level ?? 1);
    return {
      note: null,
      heal: { targetId: combatant.id, amount: plan.amount, detail: plan.detail, type: spec.type },
    };
  }

  // resource_conv 通道（P3）：grants 额外主动作（combatStore.grantAction，次数由池漏斗控制）；
  // convert 按 opts.convertTarget（缺省 spec.to[0]）执行——dash 移动力账务 / disengage+hide 声明。
  // from 槽扣减（activation 对应 actions/bonusActions）由调用方统一执行，此处不重复扣。
  if (capability.channel === 'resource_conv' && capability.resourceConv) {
    const conv = capability.resourceConv;
    const notes: string[] = [];
    if (conv.grants && conv.grants.length > 0) {
      const actions = combatStore.grantAction(record.id, combatant.id);
      notes.push(actions != null ? `获得一个额外主动作（本回合可用动作 ${actions}）` : '无法授予额外动作');
    }
    if (conv.convert) {
      const target = opts?.convertTarget ?? conv.convert.to[0];
      const r = applyConvTarget(record.id, combatant, target);
      notes.push(`${CONV_TARGET_LABELS[target] ?? target}：${r.note}`);
    }
    return { note: notes.length > 0 ? notes.join('；') : null };
  }

  return { note: null };
}
