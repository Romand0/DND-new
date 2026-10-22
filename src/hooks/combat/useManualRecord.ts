import { useState } from 'react';
import type { CombatRecord, OperationLogEntry } from '@/types/combat';

export interface UseManualRecordProps {
  selectedCell: { round: number; combatantId: string } | null;
  setSelectedCell: (v: { round: number; combatantId: string } | null) => void;
  canUseAction: (id: string) => boolean;
  consumeCombatantAction: (id: string) => void;
  getEffectiveAc: (c: any) => number;
  handleApplyDamage: (targetId: string, newHp: number, status?: 'unconscious' | 'dead') => void;
  /** 统一记录入口（放映写表格 / 模拟写日志） */
  recordOperation: (combatantId: string | null, text: string, kind: OperationLogEntry['kind']) => void;
}

export function useManualRecord(record: CombatRecord | null, props: UseManualRecordProps) {
  const {
    selectedCell, setSelectedCell,
    canUseAction, consumeCombatantAction,
    getEffectiveAc, handleApplyDamage, recordOperation,
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
      let kind: OperationLogEntry['kind'] = 'attack';
      if (!hit) {
        text = `《${manualAttackMethod}》→ ${target.name}：未命中`;
      } else {
        const dmg = parseInt(manualDamage, 10);
        if (isNaN(dmg) || dmg === 0) { alert('请输入有效的伤害值（非0整数）'); return; }
        kind = 'damage';
        text = `《${manualAttackMethod}》→ ${target.name}：【${dmg}】伤害`;
        if (target.currentHp !== undefined) {
          const oldHp = target.currentHp;
          const newHp = Math.max(0, oldHp - dmg);
          text += `，HP【${oldHp}→${newHp}】`;
          if (manualIsKill) {
            const status: 'unconscious' | 'dead' = target.isPc ? 'unconscious' : 'dead';
            handleApplyDamage(target.id, newHp, status);
            text += target.isPc ? `，击昏` : `，杀死`;
          } else {
            handleApplyDamage(target.id, newHp);
          }
        } else if (manualIsKill) {
          alert('目标缺少当前 HP，无法判定击倒');
          return;
        }
      }
      recordOperation(combatantId, text, kind);
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
      const oldHp = tgt.currentHp;
      const newHp = Math.min(tgt.maxHp ?? oldHp ?? 0, (oldHp ?? 0) + amount);
      handleApplyDamage(tgt.id, newHp);
      const isSelf = targetHpId === combatantId;
      let text = isSelf
        ? `《${manualHealMethod}》→ 自己：【+${amount}】生命`
        : `《${manualHealMethod}》→ ${targetName}：【+${amount}】生命`;
      if (oldHp != null) text += `，HP【${oldHp}→${newHp}】`;
      recordOperation(combatantId, text, 'heal');
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
