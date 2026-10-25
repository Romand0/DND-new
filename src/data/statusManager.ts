// 状态效果系统 —— 运行时状态管理器
// 负责状态实例的生命周期管理：声明开始、声明结束、效果查询、回合推进

import type {
  StatusInstance,
  StatusDefinition,
  StatusManager,
  StatusScope,
  StatusRoundCtx,
  Effect,
  EffectType,
  StatusChangeEvent,
  StatusChangeListener,
} from '@/types/status';
import statusLibrary from './statusLibrary';

/** 状态实例存储 */
interface StatusStore {
  instances: StatusInstance[];
  listeners: StatusChangeListener[];
}

/**
 * 状态管理器扩展接口：在 StatusManager 基础上增加 applyEffect
 * （applyEffect 负责施加状态时联动参战者能力标记，如 canGesticulate / canSpeak）
 */
export type StatusManagerWithApply = StatusManager & {
  applyEffect(
    targetId: string,
    statusId: string,
    scope?: StatusScope,
    combatId?: string,
    options?: {
      instanceEffects?: Effect[];
      durationRounds?: number;
      /** 施放时的绝对回合（放映模式）；模拟模式无回合概念，缺省即永续 */
      startRound?: number;
      /** 战斗模式：playback=按回合过期；simulation=永续待手动取消 */
      combatMode?: 'simulation' | 'playback';
      /** true = 持续到 anchorCombatantId 的下一次回合开始（如剑刃防护「直到你的下一回合」） */
      untilNextTurn?: boolean;
      /** untilNextTurn 的锚定参战者（通常为施法者） */
      anchorCombatantId?: string;
    }
  ): StatusInstance;
};

/** 创建新的状态管理器实例（每局战斗或全局各一个） */
export function createStatusManager(): StatusManagerWithApply {
  const store: StatusStore = {
    instances: [],
    listeners: [],
  };

  /** 生成唯一 ID */
  function generateId(): string {
    return `status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** 触发事件 */
  function emit(event: StatusChangeEvent): void {
    store.listeners.forEach(l => l(event));
  }

  /** 计算过期时间 */
  function computeExpiresAt(definition: StatusDefinition): number | undefined {
    if (definition.duration.type === 'rounds' && definition.duration.value) {
      return Date.now() + definition.duration.value * 6000; // 假设每回合 6 秒（战斗时间）
    }
    if (definition.duration.type === 'minutes' && definition.duration.value) {
      return Date.now() + definition.duration.value * 60000;
    }
    if (definition.duration.type === 'hours' && definition.duration.value) {
      return Date.now() + definition.duration.value * 3600000;
    }
    return undefined;
  }

  /** 判定一个实例在给定回合上下文下是否已到期 */
  function isExpiredByRound(
    instance: StatusInstance,
    ctx?: StatusRoundCtx,
  ): boolean {
    if (instance.expirePolicy === 'rounds' && instance.expiresAtRound != null) {
      // 无回合上下文（模拟模式 / 调用方未传）：保守不过期，效果保留待手动取消
      if (ctx?.currentRound == null) return false;
      return ctx.currentRound >= instance.expiresAtRound;
    }
    if (instance.expirePolicy === 'combatantTurn' && instance.anchorCombatantId && instance.startRound != null) {
      // 无当前行动者上下文：保守不过期
      if (ctx?.turnCombatantId == null) return false;
      const turnRound = ctx.turnRound ?? ctx.currentRound ?? 0;
      // 施放发生在自己回合内（currentTurn 已指向施法者），下一次轮到必然是更晚的回合
      return ctx.turnCombatantId === instance.anchorCombatantId && turnRound > instance.startRound;
    }
    return false;
  }

  return {
    // --- 声明管理 ---

    declareStart(
      definitionId: string,
      targetId: string,
      scope: StatusScope,
      combatId?: string
    ): StatusInstance {
      const definition = statusLibrary.get(definitionId);
      if (!definition) {
        throw new Error(`Status definition not found: ${definitionId}`);
      }

      // 检查叠加规则
      const existing = store.instances.find(
        i => i.definitionId === definitionId && i.targetId === targetId && i.isActive
      );
      if (existing) {
        const stacking = definition.stacking ?? { rule: 'replace' };
        if (stacking.rule === 'ignore') {
          // 忽略新实例
          return existing;
        }
        if (stacking.rule === 'replace') {
          // 结束旧实例
          this.declareEnd(existing.instanceId);
        }
        // stack: 允许叠加，继续创建
      }

      const instance: StatusInstance = {
        instanceId: generateId(),
        definitionId,
        targetId,
        scope,
        combatId,
        isActive: true,
        declaredAt: Date.now(),
        expiresAt: computeExpiresAt(definition),
      };

      store.instances.push(instance);

      emit({
        type: 'start',
        instance,
        definition,
        timestamp: Date.now(),
      });

      return instance;
    },

    declareEnd(instanceId: string): StatusInstance | null {
      const idx = store.instances.findIndex(i => i.instanceId === instanceId);
      if (idx === -1) return null;

      const instance = store.instances[idx];
      if (!instance.isActive) return null;

      instance.isActive = false;
      instance.declaredEndAt = Date.now();

      const definition = statusLibrary.get(instance.definitionId);
      if (definition) {
        emit({
          type: 'end',
          instance,
          definition,
          timestamp: Date.now(),
        });
      }

      return instance;
    },

    // --- 查询 ---

    getActiveStatuses(targetId: string, scope?: StatusScope, ctx?: StatusRoundCtx): StatusInstance[] {
      const now = Date.now();
      return store.instances.filter(i => {
        if (i.targetId !== targetId || !i.isActive) return false;
        if (scope && i.scope !== scope) return false;
        // 回合驱动过期：放映模式按当前回合判定；模拟模式（无回合上下文）保留待手动取消
        if (isExpiredByRound(i, ctx)) {
          this.declareEnd(i.instanceId);
          return false;
        }
        // 真实时间过期：minutes/hours 型 duration 专用；rounds 策略实例不受时间影响
        if (i.expirePolicy !== 'rounds' && i.expiresAt && now >= i.expiresAt) {
          this.declareEnd(i.instanceId);
          return false;
        }
        return true;
      });
    },

    hasEffect(targetId: string, effectType: EffectType, scope?: StatusScope): boolean {
      const effects = this.getEffects(targetId, scope);
      return effects.some(e => e.type === effectType);
    },

    getEffects(targetId: string, scope?: StatusScope, ctx?: StatusRoundCtx): Effect[] {
      const activeInstances = this.getActiveStatuses(targetId, scope, ctx);
      const effects: Effect[] = [];

      for (const instance of activeInstances) {
        const definition = statusLibrary.get(instance.definitionId);
        if (definition) {
          effects.push(...definition.effects);
        }
        // 实例级效果（applyEffect options 注入）：通用状态的参数载体
        const instanceEffects = instance.metadata?.effects;
        if (Array.isArray(instanceEffects)) {
          effects.push(...(instanceEffects as Effect[]));
        }
      }

      return effects;
    },

    // --- 状态应用 ---

    /**
     * 应用状态到参战者（自动联动 canGesticulate / canSpeak）
     * 当施加的状态在 SOMATIC_BLOCKING_STATES 中时，会在返回结果中携带
     * 需要联动更新的参战者字段，由调用方负责写入 combatStore。
     *
     * options.instanceEffects：实例级效果（如流程注入的 damage_resistance config），
     * getEffects 时与 definition.effects 合并——通用状态（damage_affinity）靠它
     * 携带具体参数，状态库零改动。
     * options.durationRounds：按回合计时的持续时间，>0 时注入 expiresAt
     * （definition.duration 恒为 permanent 的通用状态由这里驱动消退）。
     */
    applyEffect(
      targetId: string,
      statusId: string,
      scope: StatusScope = 'combat',
      combatId?: string,
      options?: {
        instanceEffects?: Effect[];
        durationRounds?: number;
        startRound?: number;
        combatMode?: 'simulation' | 'playback';
        /** true = 持续到 anchorCombatantId 的下一次回合开始（如剑刃防护「直到你的下一回合」） */
        untilNextTurn?: boolean;
        /** untilNextTurn 的锚定参战者（通常为施法者） */
        anchorCombatantId?: string;
      }
    ): StatusInstance {
      // 应用状态
      const instance = this.declareStart(statusId, targetId, scope, combatId);

      const definition = statusLibrary.get(statusId);

      if (definition?.combatantPatch) {
        instance.metadata = { ...instance.metadata, combatantPatch: definition.combatantPatch };
      }
      if (options?.instanceEffects && options.instanceEffects.length > 0) {
        instance.metadata = { ...instance.metadata, effects: options.instanceEffects };
      }
      if (options?.durationRounds && options.durationRounds > 0) {
        instance.durationRounds = options.durationRounds;
        if (options.combatMode === 'playback' && options.startRound != null) {
          if (options.untilNextTurn && options.anchorCombatantId) {
            // 「直到施法者下一次回合」：锚定参战者回合策略（如剑刃防护 2024 版）
            instance.expirePolicy = 'combatantTurn';
            instance.anchorCombatantId = options.anchorCombatantId;
            instance.startRound = options.startRound;
          } else {
            // 放映模式：回合驱动，绝对回合到期自动结束
            instance.expirePolicy = 'rounds';
            instance.startRound = options.startRound;
            instance.expiresAtRound = options.startRound + options.durationRounds;
          }
          // 清掉可能来自 definition 的时间戳，避免展示层误读
          instance.expiresAt = undefined;
        } else {
          // 模拟模式（或无回合数据）：永续，由 DM 手动取消（StatusAttachPanel）
          instance.expirePolicy = 'manual';
          instance.expiresAt = undefined;
        }
      } else if (options?.untilNextTurn && options.combatMode === 'playback' && options.startRound != null && options.anchorCombatantId) {
        // durationRounds 未配置但显式要求 untilNextTurn：同样按锚定参战者回合策略
        instance.expirePolicy = 'combatantTurn';
        instance.anchorCombatantId = options.anchorCombatantId;
        instance.startRound = options.startRound;
        instance.expiresAt = undefined;
      }

      return instance;
    },

    // --- 维护 ---

    advanceRound(combatId: string, ctx?: StatusRoundCtx): void {
      // 处理回合推进：衰减持续时间
      const combatInstances = store.instances.filter(
        i => i.combatId === combatId && i.isActive
      );

      for (const instance of combatInstances) {
        // 回合驱动实例：绝对回合到期即结束
        if (instance.expirePolicy === 'rounds' && instance.expiresAtRound != null) {
          if (ctx?.currentRound != null && ctx.currentRound >= instance.expiresAtRound) {
            this.declareEnd(instance.instanceId);
            const definition = statusLibrary.get(instance.definitionId);
            if (definition) {
              emit({ type: 'expire', instance, definition, timestamp: Date.now() });
            }
          }
          continue;
        }
        // 锚定参战者回合实例：下一次轮到锚定者时结束
        if (instance.expirePolicy === 'combatantTurn') {
          if (isExpiredByRound(instance, ctx)) {
            this.declareEnd(instance.instanceId);
            const definition = statusLibrary.get(instance.definitionId);
            if (definition) {
              emit({ type: 'expire', instance, definition, timestamp: Date.now() });
            }
          }
          continue;
        }
        const definition = statusLibrary.get(instance.definitionId);
        if (!definition) continue;

        // 时间驱动实例（minutes/hours 型 duration）：按真实时间比对
        if (definition.duration.type !== 'rounds' && instance.expiresAt) {
          if (Date.now() >= instance.expiresAt) {
            this.declareEnd(instance.instanceId);
            emit({
              type: 'expire',
              instance,
              definition,
              timestamp: Date.now(),
            });
          }
        }
      }
    },

    cleanupExpired(): void {
      const now = Date.now();
      const expired = store.instances.filter(
        i => i.isActive && i.expiresAt && now >= i.expiresAt
      );

      for (const instance of expired) {
        this.declareEnd(instance.instanceId);
        const definition = statusLibrary.get(instance.definitionId);
        if (definition) {
          emit({
            type: 'expire',
            instance,
            definition,
            timestamp: now,
          });
        }
      }
    },
  };
}

/** 全局单例（用于全局状态管理） */
export const globalStatusManager = createStatusManager();
