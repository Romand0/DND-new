// 通用反应定义表：数据驱动的反应来源登记 + 保守识别。
// 「识别不了的来源不自动生效」——只有静态登记的定义或法术库中带 reaction 声明的法术会被检测器产出。
// 具体法术不做硬编码：spell:<id> 的定义在运行时由 Spell.reaction 数据派生（见 resolveReactionDefinition）。
import { spellStore } from '@/data/spellStore';
import type { ReactionTrigger, ReactionResolution } from '@/types/combat';
import type { Spell } from '@/types/spell';

export type { ReactionResolution };

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

/** 由法术数据的 reaction 声明派生反应定义（spell:<id>）；无声明返回 null */
export function definitionFromSpell(spell: Spell): ReactionDefinition | null {
  const rx = spell.reaction;
  if (!rx?.trigger) return null;
  return {
    id: `spell:${spell.id}`,
    name: spell.name,
    trigger: rx.trigger,
    resolution: rx.resolution ?? 'spell',
    usesPerRound: 1,
    cost: rx.slotLevel === 0 ? undefined : { spellSlot: rx.slotLevel ?? Math.max(0, spell.level) },
    prompt: {
      title: `${spell.name}（反应）`,
      body: rx.prompt,
    },
  };
}

/** 解析定义：先查静态表，再按 spell: 前缀从法术库派生（数据驱动，无硬编码法术条目） */
export function resolveReactionDefinition(id: string): ReactionDefinition | null {
  const stat = registry.get(id);
  if (stat) return stat;
  if (id.startsWith('spell:')) {
    const spell = spellStore.getById(id.slice('spell:'.length));
    return spell ? definitionFromSpell(spell) : null;
  }
  return null;
}

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
