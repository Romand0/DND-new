// 先攻表格行动概要：DM 端手动操作（useRoundTurn.recordOperation 调用点）与玩家回合打包提交共用同一套文案。
// 玩家提交的 op 带结构化字段（武器/目标/伤害/环位），这里按 DM 端既有格式生成，表格样式保持一致。
import type { TurnCommitOp } from '@/types/realtime';

export interface SummaryContext {
  /** 伤害实际落地结果（抗性结算后的数值与 HP 变化）；未命中为 null */
  damage?: { amount: number; oldHp: number | null; newHp: number | null } | null;
  /** 疾走获得的额外移动力（尺） */
  dashFeet?: number;
  /** feature-use 通道执行结果说明（挂状态/优劣势标记） */
  featureNote?: string | null;
  /** 搜索结算结果（察觉对抗 hidden） */
  search?: {
    total: number;
    revealed: number;
    skipped: number;
    estimated: number;
    /** DM 明细：被发现的潜伏者（名字+隐匿值） */
    hits?: { name: string; stealthTotal: number; estimated: boolean }[];
    /** DM 明细：未录入隐匿值被跳过的潜伏者名 */
    skippedNames?: string[];
  };
  /** 躲藏结算结果（DM 明细用） */
  hide?: {
    stealthTotal: number;
    /** 观察者清单（被动察觉值；无角色卡的 NPC 为 undefined；unseen=本次对抗是否未看破） */
    observers?: { name: string; pp?: number; unseen?: boolean }[];
  };
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
      // attack_rider（至圣斩/震慑拳等随 op 提交的 rider）在入账时统一扣资源，明细追加一行
      if (ctx.featureNote) lines.push(ctx.featureNote);
      return lines;
    }
    case 'cast':
      return [op.targetName ? `《${op.spellName}》→ ${op.targetName}` : `《${op.spellName}》`];
    case 'move':
      return [`移动至（第 ${op.to.col + 1} 列，第 ${op.to.row + 1} 行）`];
    case 'dash':
      return [`疾走：+【${ctx.dashFeet ?? 0}】尺移动`];
    case 'search': {
      const s = ctx.search;
      if (!s) return op.roundText ? [op.roundText] : [];
      // 玩家行只回数量与账务提示，察觉总值/目标身份走 roundsDm 明细
      let line = s.revealed > 0 ? `搜索：发现 ${s.revealed} 名潜伏者` : `搜索：未发现目标`;
      if (s.estimated > 0) line += `（其中 ${s.estimated} 名隐匿值为被动代填，待 DM 复核）`;
      if (s.skipped > 0) line += `（${s.skipped} 名潜伏者未录入隐匿值，待 DM 补录）`;
      return [line];
    }
    case 'ready-item': {
      const hand = op.slot === 'left' ? '左手' : '右手';
      return [op.itemName ? `${hand}换持《${op.itemName}》` : `${hand}放下物品`];
    }
    case 'hand-state':
      return [`${op.slot === 'left' ? '左手' : '右手'}：${HAND_STATE_LABELS[op.state]}`];
    case 'spell-slot':
      return [op.consume ? `消耗 ${op.level} 环法术位` : `恢复 ${op.level} 环法术位`];
    case 'feature-use': {
      const lines = [op.roundText || `发动《${op.featureName}》`];
      if (ctx.featureNote) lines.push(`《${op.featureName}》→ ${ctx.featureNote}`);
      return lines;
    }
    case 'stop-concentration':
      return ['停止专注'];
    case 'note':
      return op.roundText ? [op.roundText] : [];
    case 'hide':
      // 玩家行只写动作本身；隐匿总值与观察者清单走 roundsDm 明细
      return ['躲藏'];
    case 'end-turn':
      return [];
    default:
      return [];
  }
}

/**
 * 单条 op → DM 明细行（roundsDm 平行通道）：含目标名/隐匿值/掷骰拆解等机密细节。
 * 玩家通道 summarizeOp 与本函数同 op 同 ctx 双写，玩家行保持只回数量/结论。
 */
export function summarizeOpDetail(op: TurnCommitOp, ctx: SummaryContext = {}): string[] {
  switch (op.kind) {
    case 'search': {
      const s = ctx.search;
      if (!s) return [];
      const parts = [`察觉 ${op.d20}+${op.bonus}=${s.total}`];
      const hits = (s.hits ?? []).map(
        (h) => `《${h.name}》隐匿 ${h.stealthTotal}${h.estimated ? '（被动代填）' : ''}`,
      );
      if (hits.length > 0) parts.push(`发现：${hits.join('、')}`);
      const skipped = (s.skippedNames ?? []).map((n) => `《${n}》未录入隐匿值`);
      if (skipped.length > 0) parts.push(`跳过：${skipped.join('、')}`);
      if (!s.hits?.length && !s.skippedNames?.length) parts.push('无活跃躲藏者');
      return [`搜索：${parts.join('；')}`];
    }
    case 'hide': {
      const h = ctx.hide;
      if (!h) return [];
      const lines = [`躲藏：隐匿总值 ${h.stealthTotal}（来源：线下掷骰/DM 录入）`];
      const observers = (h.observers ?? []).map((o) => {
        const verdict = o.unseen === true ? '（未察觉）' : o.unseen === false ? '（看破）' : '';
        return `《${o.name}》被动察觉 ${o.pp ?? '—'}${verdict}`;
      });
      if (observers.length > 0) lines.push(`观察者：${observers.join('、')}`);
      return lines;
    }
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
