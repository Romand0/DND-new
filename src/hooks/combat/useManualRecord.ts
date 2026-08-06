import { useState } from 'react';
import type { CombatRecord } from '@/types/combat';

export interface UseManualRecordProps {
  selectedCell: { round: number; combatantId: string } | null;
  setSelectedCell: (v: { round: number; combatantId: string } | null) => void;
  canUseAction: (id: string) => boolean;
  consumeCombatantAction: (id: string) => void;
  getEffectiveAc: (c: any) => number;
  handleApplyDamage: (targetId: string, newHp: number, status?: 'unconscious' | 'dead') => void;
  handleCellChange: (round: number, combatantId: string, value: string) => void;
}

export function useManualRecord(record: CombatRecord | null, props: UseManualRecordProps) {
  const {
    selectedCell, setSelectedCell,
    canUseAction, consumeCombatantAction,
    getEffectiveAc, handleApplyDamage, handleCellChange,
  } = props;

  const [manualRecordOpen, setManualRecordOpen] = useState(false);
  const [manualRecordType, setManualRecordType] = useState<'attack' | 'recovery' | null>(null);
  const [manualTargetId, setManualTargetId] = useState('');
  const [manualAttackMethod, setManualAttackMethod] = useState('');
  const [manualDamage, setManualDamage] = useState('');
  const [manualIsKill, setManualIsKill] = useState(false);
  const [manualHealMethod, setManualHealMethod] = useState('');
  const [manualHealAmount, setManualHealAmount] = useState('');
  const [manualAttackRoll, setManualAttackRoll] = useState('');

  const confirmManualRecord = () => {
    if (!selectedCell || !record) return;
    const { round, combatantId } = selectedCell;
    const target = record.combatants.find(c => c.id === manualTargetId);
    const attacker = record.combatants.find(c => c.id === combatantId);

    if (manualRecordType === 'attack') {
      if (!canUseAction(combatantId)) {
        alert('该参战者本回合已没有可用动作');
        return;
      }
      if (!manualAttackMethod.trim()) { alert('请填写攻击方式'); return; }
      if (!target) { alert('请选择目标'); return; }
      if (!manualAttackRoll) { alert('请填写攻击检定值'); return; }
      const roll = parseInt(manualAttackRoll, 10);
      if (isNaN(roll)) { alert('攻击检定值必须是数字'); return; }
      const tgtAc = getEffectiveAc(target);
      if (!tgtAc && tgtAc !== 0) { alert('目标缺少 AC，无法判定命中'); return; }
      const hit = roll >= tgtAc;
      let text = '';
      if (!hit) {
        text = `对 ${target.name} 的攻击未命中，${manualAttackMethod}打偏了`;
      } else {
        const dmg = parseInt(manualDamage, 10);
        if (isNaN(dmg) || dmg === 0) { alert('请输入有效的伤害值（非0整数）'); return; }
        text = `对 ${target.name} 的攻击命中，用${manualAttackMethod}造成${dmg}点伤害`;
        if (manualIsKill && target.currentHp !== undefined) {
          const newHp = Math.max(0, (target.currentHp ?? 0) - dmg);
          const status: 'unconscious' | 'dead' = target.isPc ? 'unconscious' : 'dead';
          handleApplyDamage(target.id, newHp, status);
          text += target.isPc ? `，将其击昏` : `，将其杀死`;
        } else if (target.currentHp !== undefined) {
          const newHp = Math.max(0, target.currentHp - dmg);
          handleApplyDamage(target.id, newHp);
        }
      }
      handleCellChange(round, combatantId, text);
      consumeCombatantAction(combatantId);
    } else if (manualRecordType === 'recovery') {
      if (!manualHealMethod.trim()) { alert('请填写恢复方式'); return; }
      const amount = parseInt(manualHealAmount, 10);
      if (isNaN(amount) || amount <= 0) { alert('请输入有效的恢复量（正整数）'); return; }
      if (!attacker) return;
      let targetHpId = manualTargetId;
      let targetName = target?.name || '';
      if (!target) {
        targetHpId = combatantId;
        targetName = attacker.name;
      }
      const tgt = record.combatants.find(c => c.id === targetHpId);
      if (!tgt) return;
      const newHp = Math.min(tgt.maxHp ?? tgt.currentHp ?? 0, (tgt.currentHp ?? 0) + amount);
      handleApplyDamage(tgt.id, newHp);
      const isSelf = targetHpId === combatantId;
      const text = isSelf
        ? `用${manualHealMethod}恢复了自己${amount}点生命值`
        : `用${manualHealMethod}恢复了${targetName} ${amount}点生命值`;
      handleCellChange(round, combatantId, text);
    }

    setManualRecordOpen(false);
    setManualRecordType(null);
    setManualTargetId('');
    setManualAttackMethod('');
    setManualDamage('');
    setManualIsKill(false);
    setManualHealMethod('');
    setManualHealAmount('');
    setManualAttackRoll('');
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
    setManualAttackRoll('');
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
    manualAttackRoll,
    setManualAttackRoll,
    confirmManualRecord,
    cancelManualRecord,
  };
}
