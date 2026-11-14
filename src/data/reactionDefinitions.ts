// 通用反应定义表：数据驱动的反应来源登记 + 保守识别。
// 「识别不了的来源不自动生效」——只有登记在表里的定义会被检测器产出，
// 书籍/特性/法术条目须在此显式映射（后续阶段从 character.features / spellStore / npcTemplate 抽取）。
// P1 仅内置借机攻击；护盾术/哨兵/法术反制在 P2 扩充。
import type { ReactionTrigger } from '@/types/combat';

/** 反应解决方式：决定弹窗主体与落地链路 */
export type ReactionResolution =
  | 'attack'           // 走 CombatAttackModal 攻击链（借机攻击）
  | 'spell'            // 走 CombatSpellModal 简化施放（护盾术）
  | 'status'           // 挂状态/附加效果
  | 'damage_modifier'  // 伤害结算前修正（减伤/反弹）
  | 'movement';        // 强制位移（复用 useForcedMove）

export interface ReactionDefinition {
  /** 稳定键：builtin:* / spell:<id> / feature:<名> / book:<条目名> */
  id: string;
  name: string;
  trigger: ReactionTrigger;
  resolution: ReactionResolution;
  /** 持有者过滤（缺省 = 全部参战者） */
  ownerFilter?: {
    isPc?: boolean;
    hasStatus?: string[];
    requiresHeld?: 'weapon' | 'shield';
  };
  /** 目标过滤（缺省 = 检测器自行判定） */
  targetFilter?: {
    hostileOnly?: boolean;
    rangeCells?: number;
    selfOnly?: boolean;
  };
  /** 附加成本（反应次数恒 1 次，由 combatStore.consumeReaction 扣减） */
  cost?: {
    spellSlot?: number;
    ammo?: boolean;
    item?: string;
  };
  /** 每回合可用次数（默认 1） */
  usesPerRound?: number;
  /** 弹窗展示文案（缺省用 name） */
  prompt?: {
    title?: string;
    body?: string;
  };
}

const registry = new Map<string, ReactionDefinition>();

export function registerReactionDefinition(def: ReactionDefinition): void {
  if (!def?.id) return;
  registry.set(def.id, def);
}

export function getReactionDefinition(id: string): ReactionDefinition | null {
  return registry.get(id) ?? null;
}

/** 列出定义（可按触发类型过滤），按注册顺序返回 */
export function listReactionDefinitions(trigger?: ReactionTrigger): ReactionDefinition[] {
  const all = Array.from(registry.values());
  return trigger ? all.filter(d => d.trigger === trigger) : all;
}

// ===== 内置定义 =====

export const BUILTIN_OPPORTUNITY_ATTACK = 'builtin:opportunity_attack';

registerReactionDefinition({
  id: BUILTIN_OPPORTUNITY_ATTACK,
  name: '借机攻击',
  trigger: 'move_leave_reach',
  resolution: 'attack',
  usesPerRound: 1,
  prompt: {
    title: '借机攻击（反应）',
    body: '行使将消耗反应，放弃则保留反应',
  },
});
