import { useState } from 'react';
import combatStore from '@/data/combatStore';
import { getCombatantAffinities } from '@/data/combatAffinities';
import {
  resolveManualDamage,
  type ManualAttackSource,
  type ManualWeaponTraits,
} from '@/data/manualDamage';
import {
  formatManualRollSummary,
  normalizeManualAttackCount,
  resolveManualAttackRoll,
} from '@/data/manualAttack';
import type { CombatRecord, ManualActionCost, ManualMode, OperationLogEntry } from '@/types/combat';
import type { DamageApplication, DamageApplyResult, HealApplyResult } from '@/types/damage';

// 手动攻击方式是自由文本，按关键词启发式判定远程（只影响观众端动画形态：飞矢 vs 冲刺）
const RANGED_HINT = /(弓|弩|射击|投掷|标枪|飞斧|飞锤|箭)/;

export interface UseManualRecordProps {
  selectedCell: { round: number; combatantId: string } | null;
  setSelectedCell: (v: { round: number; combatantId: string } | null) => void;
  canUseAction: (id: string) => boolean;
  canUseBonusAction: (id: string) => boolean;
  canUseReaction: (id: string) => boolean;
  consumeCombatantAction: (id: string) => void;
  consumeCombatantBonusAction: (id: string) => void;
  consumeCombatantReaction: (id: string) => void;
  getEffectiveAc: (c: any) => number;
  handleApplyDamage: (event: DamageApplication) => DamageApplyResult | null;
  handleApplyHealing: (targetId: string, amount: number) => HealApplyResult | null;
  /** 统一记录入口（放映写表格 / 模拟写日志） */
  recordOperation: (
    combatantId: string | null,
    text: string,
    kind: OperationLogEntry['kind'],
    detail?: string,
    writeCellOverride?: { round: number; combatantId: string } | null,
  ) => void;
}

export function useManualRecord(record: CombatRecord | null, props: UseManualRecordProps) {
  const {
    selectedCell, setSelectedCell,
    canUseAction, canUseBonusAction, canUseReaction,
    consumeCombatantAction, consumeCombatantBonusAction, consumeCombatantReaction,
    getEffectiveAc, handleApplyDamage, handleApplyHealing, recordOperation,
  } = props;

  const [manualRecordOpen, setManualRecordOpen] = useState(false);
  const [manualRecordType, setManualRecordType] = useState<'attack' | 'recovery' | null>(null);
  const [manualTargetId, setManualTargetId] = useState('');
  const [manualAttackMethod, setManualAttackMethod] = useState('');
  const [manualDamage, setManualDamage] = useState('');
  const [manualIsKill, setManualIsKill] = useState(false);
  const [manualHealMethod, setManualHealMethod] = useState('');
  const [manualHealAmount, setManualHealAmount] = useState('');
  const [manualD20, setManualD20] = useState('');
  const [manualD20Second, setManualD20Second] = useState('');
  const [manualAttackBonus, setManualAttackBonus] = useState('0');
  const [manualRollMode, setManualRollMode] = useState<ManualMode>('none');
  const [manualCrit, setManualCrit] = useState(false);
  const [manualActionCost, setManualActionCost] = useState<ManualActionCost>('action');
  const [manualAttackCount, setManualAttackCount] = useState('1');
  const [manualDamageType, setManualDamageType] = useState('');
  const [manualAttackSource, setManualAttackSource] = useState<ManualAttackSource>('weapon');
  // 高级选项：武器材质显式指定（null = 按攻击方式自动推断）
  const [manualWeaponTraits, setManualWeaponTraits] = useState<ManualWeaponTraits>({
    magical: null,
    silvered: null,
    adamantine: null,
  });

  const confirmManualRecord = () => {
    if (!selectedCell || !record) return;
    const { round, combatantId } = selectedCell;
    const target = record.combatants.find(c => c.id === manualTargetId);
    const attacker = record.combatants.find(c => c.id === combatantId);

    if (manualRecordType === 'attack') {
      // 入口只做输入校验；动作经济在记录落账时消费（DM 手动记录允许补录/裁定）
      if (!manualAttackMethod.trim()) { alert('请填写攻击方式'); return; }
      if (!target) { alert('请选择目标'); return; }
      const dice = [parseInt(manualD20, 10)];
      if (manualRollMode !== 'none') dice.push(parseInt(manualD20Second, 10));
      if (dice.some(n => isNaN(n) || n < 1 || n > 20)) {
        alert(manualRollMode === 'none' ? 'd20 骰值需为 1-20 的整数' : '请填写两颗 d20 骰值（均为 1-20）');
        return;
      }
      const bonus = manualAttackBonus.trim() === '' ? 0 : parseInt(manualAttackBonus, 10);
      if (isNaN(bonus)) { alert('攻击加值必须是整数'); return; }
      if (manualActionCost === 'action' && !canUseAction(combatantId)) { alert('该角色本回合已无可用动作'); return; }
      if (manualActionCost === 'bonus' && !canUseBonusAction(combatantId)) { alert('该角色本回合已无可用附赠动作'); return; }
      if (manualActionCost === 'reaction' && !canUseReaction(combatantId)) { alert('该角色本回合已无可用反应'); return; }
      const strikeCount = normalizeManualAttackCount(manualAttackCount);
      const tgtAc = getEffectiveAc(target);
      if (!tgtAc && tgtAc !== 0) { alert('目标缺少 AC，无法判定命中'); return; }
      const rollInfo = resolveManualAttackRoll({
        d20: dice,
        bonus,
        ac: tgtAc,
        mode: manualRollMode,
        forceCrit: manualCrit,
      });
      const rollDetail = formatManualRollSummary({ d20: dice, bonus, mode: manualRollMode }, rollInfo);
      const costTag = manualActionCost === 'bonus' ? '（附赠动作）' : manualActionCost === 'reaction' ? '（反应）' : '';
      const methodLabel = strikeCount > 1 ? `《${manualAttackMethod}》×${strikeCount}` : `《${manualAttackMethod}》`;
      const hit = rollInfo.hit;
      let text = '';
      let kind: OperationLogEntry['kind'] = 'attack';
      if (!hit) {
        text = `${methodLabel}→ ${target.name}：未命中（${rollDetail} vs AC【${tgtAc}】）${costTag}`;
        if (rollInfo.isNatural1) text += '（自然1 必失）';
      } else {
        const rawDmg = parseInt(manualDamage, 10);
        if (isNaN(rawDmg) || rawDmg === 0) { alert('请输入有效的伤害值（非0整数）'); return; }
        // 抗性/易伤/免疫与自动攻击链共用同一引擎；未声明类型时原样通过
        const preview = resolveManualDamage({
          amount: rawDmg,
          damageType: manualDamageType,
          source: manualAttackSource,
          method: manualAttackMethod,
          weaponTraits: manualWeaponTraits,
          affinities: getCombatantAffinities(target, record.id),
        });
        const dmg = preview.final;
        const typeLabel = preview.damageType ?? '';
        kind = 'damage';
        text = `${methodLabel}→ ${target.name}：命中（${rollDetail} vs AC【${tgtAc}】）${costTag}`;
        if (rollInfo.critical) text += '（重击）';
        text += `，【${dmg}】${typeLabel}伤害`;
        if (strikeCount > 1) text += `（${strikeCount} 击合计）`;
        if (preview.breakdown) text += `（${preview.breakdown}）`;
        else if (!preview.damageType) text += '（未声明伤害类型，未应用抗性）';
        if (target.currentHp !== undefined) {
          const oldHp = target.currentHp;
          const tempHp = Math.max(0, target.tempHp ?? 0);
          // 免疫/0 伤害不致死：击倒勾选仅在最终伤害 > 0 时生效
          const lethal = manualIsKill && dmg > 0;
          const status: 'unconscious' | 'dead' | undefined = lethal
            ? (target.isPc ? 'unconscious' : 'dead')
            : undefined;
          // 手动击倒优先于临时 HP：补足穿透伤害确保 HP 归零
          const amount = lethal ? Math.max(dmg, oldHp + tempHp) : dmg;
          const result = handleApplyDamage({
            targetId: target.id,
            amount,
            status,
            sourceId: attacker?.id,
            sourceName: manualAttackMethod,
            sourceKind: 'manual',
            damageType: preview.damageType ?? undefined,
          });
          const newHp = result?.newHp ?? Math.max(0, oldHp - dmg);
          text += `，HP【${oldHp}→${newHp}】`;
          if (result?.tempAbsorbed) text += `，临时HP吸收${result.tempAbsorbed}`;
          if (lethal) text += target.isPc ? `，击昏` : `，杀死`;
          else if (manualIsKill) text += '，免疫该伤害，击倒未生效';
        } else if (manualIsKill) {
          alert('目标缺少当前 HP，无法判定击倒');
          return;
        }
      }
      // 攻击事件：伤害/治疗事件由 handleApplyDamage 自动推送，此处补攻击动画本体
      combatStore.pushCombatEvent(record.id, {
        kind: 'attack',
        round: round + 1,
        actorId: combatantId,
        targetId: target.id,
        ranged: RANGED_HINT.test(manualAttackMethod),
        hit,
        critical: rollInfo.critical,
        weaponName: manualAttackMethod,
        text,
      });
      recordOperation(combatantId, text, kind, undefined, selectedCell);
      if (manualActionCost === 'action') consumeCombatantAction(combatantId);
      else if (manualActionCost === 'bonus') consumeCombatantBonusAction(combatantId);
      else if (manualActionCost === 'reaction') consumeCombatantReaction(combatantId);
    } else if (manualRecordType === 'recovery') {
      if (!manualHealMethod.trim()) { alert('请填写恢复方式'); return; }
      const amount = parseInt(manualHealAmount, 10);
      if (isNaN(amount) || amount <= 0) { alert('请输入有效的恢复量（正整数）'); return; }
      if (!attacker) return;
      if (manualActionCost === 'action' && !canUseAction(combatantId)) { alert('该角色本回合已无可用动作'); return; }
      if (manualActionCost === 'bonus' && !canUseBonusAction(combatantId)) { alert('该角色本回合已无可用附赠动作'); return; }
      if (manualActionCost === 'reaction' && !canUseReaction(combatantId)) { alert('该角色本回合已无可用反应'); return; }
      let targetHpId = manualTargetId;
      let targetName = target?.name || '';
      if (!target) {
        targetHpId = combatantId;
        targetName = attacker.name;
      }
      const tgt = record.combatants.find(c => c.id === targetHpId);
      if (!tgt) return;
      const oldHp = tgt.currentHp;
      const result = handleApplyHealing(tgt.id, amount);
      const newHp = result?.newHp ?? Math.min(tgt.maxHp ?? oldHp ?? 0, (oldHp ?? 0) + amount);
      const isSelf = targetHpId === combatantId;
      let text = isSelf
        ? `《${manualHealMethod}》→ 自己：【+${amount}】生命`
        : `《${manualHealMethod}》→ ${targetName}：【+${amount}】生命`;
      if (oldHp != null) text += `，HP【${oldHp}→${newHp}】`;
      if (manualActionCost === 'bonus') text += '（附赠动作）';
      else if (manualActionCost === 'reaction') text += '（反应）';
      else if (manualActionCost === 'action') text += '（动作）';
      recordOperation(combatantId, text, 'heal', undefined, selectedCell);
      if (manualActionCost === 'action') consumeCombatantAction(combatantId);
      else if (manualActionCost === 'bonus') consumeCombatantBonusAction(combatantId);
      else if (manualActionCost === 'reaction') consumeCombatantReaction(combatantId);
    }

    setManualRecordOpen(false);
    setManualRecordType(null);
    setManualTargetId('');
    setManualAttackMethod('');
    setManualDamage('');
    setManualIsKill(false);
    setManualHealMethod('');
    setManualHealAmount('');
    setManualD20('');
    setManualD20Second('');
    setManualAttackBonus('0');
    setManualRollMode('none');
    setManualCrit(false);
    setManualActionCost('action');
    setManualAttackCount('1');
    setManualDamageType('');
    setManualAttackSource('weapon');
    setManualWeaponTraits({ magical: null, silvered: null, adamantine: null });
    setSelectedCell(null);
  };

  const cancelManualRecord = () => {
    setManualRecordOpen(false);
    setManualRecordType(null);
    setManualTargetId('');
    setManualAttackMethod('');
    setManualDamage('');
    setManualIsKill(false);
    setManualHealMethod('');
    setManualHealAmount('');
    setManualD20('');
    setManualD20Second('');
    setManualAttackBonus('0');
    setManualRollMode('none');
    setManualCrit(false);
    setManualActionCost('action');
    setManualAttackCount('1');
    setManualDamageType('');
    setManualAttackSource('weapon');
    setManualWeaponTraits({ magical: null, silvered: null, adamantine: null });
    setSelectedCell(null);
  };

  return {
    manualRecordOpen,
    setManualRecordOpen,
    manualRecordType,
    setManualRecordType,
    manualTargetId,
    setManualTargetId,
    manualAttackMethod,
    setManualAttackMethod,
    manualDamage,
    setManualDamage,
    manualIsKill,
    setManualIsKill,
    manualHealMethod,
    setManualHealMethod,
    manualHealAmount,
    setManualHealAmount,
    manualD20,
    setManualD20,
    manualD20Second,
    setManualD20Second,
    manualAttackBonus,
    setManualAttackBonus,
    manualRollMode,
    setManualRollMode,
    manualCrit,
    setManualCrit,
    manualActionCost,
    setManualActionCost,
    manualAttackCount,
    setManualAttackCount,
    manualDamageType,
    setManualDamageType,
    manualAttackSource,
    setManualAttackSource,
    manualWeaponTraits,
    setManualWeaponTraits,
    confirmManualRecord,
    cancelManualRecord,
  };
}
