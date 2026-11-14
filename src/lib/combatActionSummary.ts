// 先攻表格行动概要：DM 端手动操作（useRoundTurn.recordOperation 调用点）与玩家回合打包提交共用同一套文案。
// 玩家提交的 op 带结构化字段（武器/目标/伤害/环位），这里按 DM 端既有格式生成，表格样式保持一致。
import type { TurnCommitOp } from '@/types/realtime';

export interface SummaryContext {
  /** 伤害实际落地结果（抗性结算后的数值与 HP 变化）；未命中为 null */
  damage?: { amount: number; oldHp: number | null; newHp: number | null } | null;
  /** 疾走获得的额外移动力（尺） */
  dashFeet?: number;
}

const HAND_STATE_LABELS: Record<'ready' | 'action' | 'unavailable', string> = {
  ready: '待用',
  action: '动作中',
  unavailable: '不可用',
};

/** 单条 op → 先攻表格行文本（可能拆成多行：攻击命中 + 伤害结算） */
export function summarizeOp(op: TurnCommitOp, ctx: SummaryContext = {}): string[] {
  switch (op.kind) {
    case 'attack': {
      const lines = [`《${op.weaponName}》→ ${op.targetName}：${op.hit ? '命中' : '未命中'}`];
      if (op.hit && op.damage && op.damage.amount > 0) {
        const amount = ctx.damage?.amount ?? op.damage.amount;
        let line = `《${op.weaponName}》→ ${op.targetName}：【${amount}】${op.damage.type}伤害`;
        const oldHp = ctx.damage?.oldHp;
        const newHp = ctx.damage?.newHp;
        if (oldHp != null && newHp != null) line += `，HP【${oldHp}→${newHp}】`;
        lines.push(line);
      }
      return lines;
    }
    case 'cast':
      return [op.targetName ? `《${op.spellName}》→ ${op.targetName}` : `《${op.spellName}》`];
    case 'move':
      return [`移动至（第 ${op.to.col + 1} 列，第 ${op.to.row + 1} 行）`];
    case 'dash':
      return [`疾走：+【${ctx.dashFeet ?? 0}】尺移动`];
    case 'ready-item': {
      const hand = op.slot === 'left' ? '左手' : '右手';
      return [op.itemName ? `${hand}换持《${op.itemName}》` : `${hand}放下物品`];
    }
    case 'hand-state':
      return [`${op.slot === 'left' ? '左手' : '右手'}：${HAND_STATE_LABELS[op.state]}`];
    case 'spell-slot':
      return [op.consume ? `消耗 ${op.level} 环法术位` : `恢复 ${op.level} 环法术位`];
    case 'stop-concentration':
      return ['停止专注'];
    case 'note':
      return op.roundText ? [op.roundText] : [];
    case 'end-turn':
      return [];
    default:
      return [];
  }
}

/** 按 DM 端先攻表格的追加语义合并文本：已有内容换行追加，多项操作各占一行 */
export function appendRoundLines(existing: string, lines: string[]): string {
  const incoming = lines.filter((l) => l.trim().length > 0).join('\n');
  if (!incoming) return existing;
  return existing ? `${existing}\n${incoming}` : incoming;
}
