// heal 引擎（B3 渠道，feature-fullcycle P3）：HealSpec → 恢复量计划。
// 纯计算无副作用：掷骰走 diceService；HP 落库由调用方执行
// （hp 型 → useDamageAndHp.handleApplyHealing，含 maxHp 截断与昏迷恢复；
//  temp 型 → combatStore.addTempHp，5e 临时生命取高者）。
// 玩家端打包（决策③）与 DM 端即时结算共用本推导，保证两端数值口径一致。
import { rollDice } from '@/data/diceService';
import type { DiceType } from '@/data/diceService';
import type { HealSpec } from '@/data/featureSpecs';

export interface HealPlan {
  /** 恢复量（骰式 + 固定值 + 等级系数合计） */
  amount: number;
  /** 结算明细（回合记录/提示文案）：'1d10=7 + 战士等级×1=5' */
  detail: string;
}

/** 按 spec 投掷恢复量；dice 格式 NdM（正则解析失败时跳过骰式项） */
export function rollHealAmount(spec: HealSpec, casterLevel: number): HealPlan {
  const parts: string[] = [];
  let total = 0;
  const m = spec.dice?.match(/^(\d+)d(\d+)$/);
  if (m) {
    const r = rollDice({ count: parseInt(m[1], 10), sides: parseInt(m[2], 10) as DiceType, mode: 'sum' });
    total += r.total;
    parts.push(`${spec.dice}=${r.total}`);
  }
  if (typeof spec.flat === 'number' && spec.flat > 0) {
    total += spec.flat;
    parts.push(`固定 ${spec.flat}`);
  }
  if (spec.levelFactor != null && spec.levelFactor !== 0) {
    const lv = spec.levelFactor * Math.max(0, casterLevel);
    total += lv;
    parts.push(`${spec.levelAttr ?? '等级'}×${spec.levelFactor}=${lv}`);
  }
  return { amount: total, detail: parts.length > 0 ? parts.join(' + ') : '0' };
}
