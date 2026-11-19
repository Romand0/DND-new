// heal 引擎（B3 渠道，feature-fullcycle P3）：HealSpec → 恢复量计划。
// 纯计算无副作用：HP 落库由调用方执行
// （hp 型 → useDamageAndHp.handleApplyHealing，含 maxHp 截断与昏迷恢复；
//  temp 型 → combatStore.addTempHp，5e 临时生命取高者）。
// 玩家端打包（决策③）与 DM 端即时结算共用本推导，保证两端数值口径一致。
// 骰值口径（线下骰，P4）：dice 字段是提示玩家线下掷骰的模板，引擎零暗骰——
// 结果由 UI 骰值环节（HealRollModal）填入 rolledDice；缺省时跳过骰式项并标注（不虚构线下骰值）。
import type { HealSpec } from '@/data/featureSpecs';

export interface HealPlan {
  /** 恢复量（填入骰值 + 固定值 + 等级系数合计） */
  amount: number;
  /** 结算明细（回合记录/提示文案）：'1d10(线下骰)=7 + 战士等级×1=5' */
  detail: string;
}

/** 按 spec 合计恢复量；dice 格式 NdM（正则解析失败时跳过骰式项） */
export function planHealAmount(spec: HealSpec, casterLevel: number, rolledDice?: number): HealPlan {
  const parts: string[] = [];
  let total = 0;
  const m = spec.dice?.match(/^(\d+)d(\d+)$/);
  if (m) {
    if (rolledDice != null && rolledDice >= 0) {
      total += rolledDice;
      parts.push(`${spec.dice}(线下骰)=${rolledDice}`);
    } else {
      parts.push(`${spec.dice}未填(跳过)`);
    }
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
