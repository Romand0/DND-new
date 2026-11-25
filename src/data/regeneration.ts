// 再生（Regeneration）规则 —— 回合开始回血 + 否定条件跟踪
//
// 5e 原文：回合开始时恢复 N 点生命值；若受到「强酸或火焰」等伤害，则该特质在其下一回合
// 开始时无法生效；若以 0 生命值开始自己的回合且再生无法生效，则死亡（巨魔/还魂鬼等）。
//
// 纯函数层：伤害判定（isRegenSuppressedBy）+ 回合开始计划（planTurnStartRegeneration）。
// 写库与事件由 combatStore.applyTurnStartRegeneration / useDamageAndHp 负责。

/** 解析否定条件文本为伤害类型列表（「强酸或者火焰」→ ['强酸','火焰']） */
export function regenNegateTypes(negate?: string): string[] {
  const text = String(negate ?? '').trim();
  if (!text) return [];
  return text
    .replace(/伤害/g, '')
    .split(/或者|[或、和]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** 该伤害类型是否触发再生失效（双向包含：种子写「强酸」、结算给「强酸」或「酸」皆可命中） */
export function isRegenSuppressedBy(negate: string | undefined, damageType: string | undefined): boolean {
  const types = regenNegateTypes(negate);
  if (types.length === 0) return false;
  const dt = String(damageType ?? '').trim();
  if (!dt) return false;
  return types.some(t => dt === t || dt.includes(t) || t.includes(dt));
}

export interface RegenPlan {
  /** 本回合恢复量（0 = 不恢复） */
  heal: number;
  /** 以 0 生命值开始回合且再生失效 → 死亡 */
  dies: boolean;
  /** 本次回合再生是否因伤害而失效 */
  suppressed: boolean;
  /** 回合记录文案 */
  note: string;
}

type RegenSource = {
  name?: string;
  regenAmount?: number;
  regenNegate?: string;
  regenSuppressed?: boolean;
  currentHp?: number;
  maxHp?: number;
  isDead?: boolean;
};

/**
 * 计算回合开始时的再生结果（不写库）。
 * 无再生特性或已死亡返回 null；suppressed 标记由调用方在消费后清除。
 */
export function planTurnStartRegeneration(c: RegenSource | null | undefined): RegenPlan | null {
  if (!c) return null;
  const amount = Math.max(0, Math.floor(c.regenAmount ?? 0));
  if (amount <= 0 || c.isDead) return null;
  const hp = Math.max(0, Math.floor(c.currentHp ?? 0));
  const maxHp = Math.max(hp, Math.floor(c.maxHp ?? hp));
  const suppressed = !!c.regenSuppressed;

  if (suppressed && hp <= 0) {
    return {
      heal: 0,
      dies: true,
      suppressed: true,
      note: `${c.name ?? '目标'}因${c.regenNegate ?? '特定伤害'}再生失效，且以 0 生命值开始回合 → 死亡`,
    };
  }
  if (suppressed) {
    return {
      heal: 0,
      dies: false,
      suppressed: true,
      note: `${c.name ?? '目标'}本回合再生失效（上回合受到${c.regenNegate ?? '特定'}伤害，HP ${hp}/${maxHp}）`,
    };
  }
  const heal = Math.min(amount, maxHp - hp);
  if (heal <= 0) {
    return {
      heal: 0,
      dies: false,
      suppressed: false,
      note: `${c.name ?? '目标'}再生：生命值已满（${hp}/${maxHp}），不恢复`,
    };
  }
  const revived = hp <= 0;
  return {
    heal,
    dies: false,
    suppressed: false,
    note: `${c.name ?? '目标'}再生恢复 ${heal} 点生命${revived ? '（自 0 生命值回复）' : ''}（${hp} → ${hp + heal}）`,
  };
}
