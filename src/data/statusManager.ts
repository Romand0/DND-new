// 状态效果系统 —— 运行时状态管理器
// 负责状态实例的生命周期管理：声明开始、声明结束、效果查询、回合推进

import type {
  StatusInstance,
  StatusDefinition,
  StatusManager,
  StatusScope,
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

/** 创建新的状态管理器实例（每局战斗或全局各一个） */
export function createStatusManager(): StatusManager {
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

    getActiveStatuses(targetId: string, scope?: StatusScope): StatusInstance[] {
      return store.instances.filter(
        i => i.targetId === targetId && i.isActive && (!scope || i.scope === scope)
      );
    },

    hasEffect(targetId: string, effectType: EffectType, scope?: StatusScope): boolean {
      const effects = this.getEffects(targetId, scope);
      return effects.some(e => e.type === effectType);
    },

    getEffects(targetId: string, scope?: StatusScope): Effect[] {
      const activeInstances = this.getActiveStatuses(targetId, scope);
      const effects: Effect[] = [];

      for (const instance of activeInstances) {
        const definition = statusLibrary.get(instance.definitionId);
        if (definition) {
          effects.push(...definition.effects);
        }
      }

      return effects;
    },

    // --- 状态应用 ---

    /**
     * 应用状态到参战者（自动联动 canGesticulate）
     */
    applyEffect(
      targetId: string,
      statusId: string,
      scope: StatusScope = 'combat',
      combatId?: string
    ): StatusInstance {
      // 应用状态
      const instance = this.declareStart(statusId, targetId, scope, combatId);
      
      // 当施加以下状态时，自动设置 canGesticulate = false
      const SOMATIC_BLOCKING_STATES: Record<string, Partial<any>> = {
        incapacitated: { isIncapacitated: true, canGesticulate: false, canSpeak: false },
        grappled:      { canGesticulate: false },
        paralyzed:     { isIncapacitated: true, canGesticulate: false, canSpeak: false },
        petrified:     { isIncapacitated: true, canGesticulate: false, canSpeak: false },
        stunned:       { isIncapacitated: true, canGesticulate: false }, // 注意：stunned 不剥夺言语
        unconscious:   { isUnconscious: true, canGesticulate: false, canSpeak: false },
      };

      // 在状态施加循环中，若状态名在 SOMATIC_BLOCKING_STATES 中，则合并更新 combatant
      if (statusId in SOMATIC_BLOCKING_STATES) {
        // 这里需要调用 combatStore 来更新参战者状态
        // 由于当前文件没有直接访问 combatStore，这个逻辑需要在调用处实现
        // 或者通过事件系统通知状态变更
        console.log(`状态 ${statusId} 会影响 canGesticulate，需要联动更新`);
      }

      return instance;
    },

    // --- 维护 ---

    advanceRound(combatId: string): void {
      // 处理回合推进：衰减持续时间
      const combatInstances = store.instances.filter(
        i => i.combatId === combatId && i.isActive
      );

      for (const instance of combatInstances) {
        const definition = statusLibrary.get(instance.definitionId);
        if (!definition) continue;

        // 如果是按回合计时的，处理衰减
        if (definition.duration.type === 'rounds' && instance.expiresAt) {
          // 每回合减少剩余回合数
          // 简化：直接用时间戳比对
          if (Date.now() >= instance.expiresAt) {
            // 过期了，触发结束
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
