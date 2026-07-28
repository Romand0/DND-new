// 战斗攻击检定弹窗 —— 从沙盘战斗按钮触发
import { useState, useMemo } from 'react';
import { X, Swords, Dices, ChevronLeft } from 'lucide-react';
import { rollDice } from '@/data/diceService';
import { characterStore } from '@/data/characterStore';
import type { Combatant, NpcAttack } from '@/types/combat';
import type { Character, Attack } from '@/types/character';

interface Props {
  attacker: Combatant;
  target: Combatant;
  onClose: () => void;
}

type Stage = 'attacks' | 'roll';

export default function CombatAttackModal({ attacker, target, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('attacks');
  const [selectedAttack, setSelectedAttack] = useState<Attack | NpcAttack | null>(null);
  const [d20Value, setD20Value] = useState<string>('');
  const [rollResult, setRollResult] = useState<{ d20: number; bonus: number; total: number; isNatural1: boolean; isNatural20: boolean; hit: boolean } | null>(null);

  // 获取 PC 的角色卡数据（NPC 无 character）
  const character = useMemo(() => {
    if (attacker.characterId) return characterStore.get(attacker.characterId);
    return null;
  }, [attacker.characterId]);

  // PC 手持装备
  const heldLeftId = character?.heldLeft?.equipmentId;
  const heldRightId = character?.heldRight?.equipmentId;
  const heldLeftItem = heldLeftId ? character!.equipment.find(e => (e.childId || e.id) === heldLeftId) : null;
  const heldRightItem = heldRightId ? character!.equipment.find(e => (e.childId || e.id) === heldRightId) : null;
  const leftUsable = character ? characterStore.isWeaponUsable(character, 'left') : false;
  const rightUsable = character ? characterStore.isWeaponUsable(character, 'right') : false;

  // 攻击列表
  const attacks: (Attack | NpcAttack)[] = character?.attacks || attacker.attacks || [];

  // 判断攻击是否可用 + 不可用原因
  const getAttackStatus = (attack: Attack | NpcAttack): { usable: boolean; reason?: string } => {
    // NPC 没有手持状态，攻击默认可用
    if (!character) return { usable: true };

    const leftMatch = heldLeftItem && heldLeftItem.name === attack.name;
    const rightMatch = heldRightItem && heldRightItem.name === attack.name;
    const isHeld = leftMatch || rightMatch;

    if (!isHeld) return { usable: false, reason: '未手持' };

    // 双手武器检查
    const isTwoHanded = attack.properties?.includes('双手');
    if (isTwoHanded) {
      const bothHands = leftMatch && rightMatch;
      if (!bothHands) return { usable: false, reason: '未双手握持' };
    }

    const usable = (leftMatch && leftUsable) || (rightMatch && rightUsable);
    if (!usable) return { usable: false, reason: '手部不可用' };
    return { usable: true };
  };

  // 解析攻击加值
  const getAttackBonus = (attack: Attack | NpcAttack): number => {
    const bonus = parseInt(attack.attackBonus || '0', 10);
    return isNaN(bonus) ? 0 : bonus;
  };

  // 可用攻击置顶
  const sortedAttacks = useMemo(() => {
    return [...attacks].sort((a, b) => {
      const sa = getAttackStatus(a).usable ? 0 : 1;
      const sb = getAttackStatus(b).usable ? 0 : 1;
      return sa - sb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacks, character, heldLeftItem, heldRightItem]);

  // 骰子摇数
  const handleRollDice = () => {
    const result = rollDice({ sides: 20, count: 1, mode: 'independent' });
    setD20Value(String(result.values[0]));
  };

  // 确定检定 —— 不切换阶段，结果在下方原位弹出
  const handleConfirmRoll = () => {
    if (!selectedAttack) return;
    const d20 = parseInt(d20Value, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const bonus = getAttackBonus(selectedAttack);
    const total = d20 + bonus;
    const isNatural1 = d20 === 1;
    const isNatural20 = d20 === 20;
    const targetAc = target.ac || 0;
    const hit = isNatural20 ? true : isNatural1 ? false : total >= targetAc;
    setRollResult({ d20, bonus, total, isNatural1, isNatural20, hit });
  };

  // 确认结果
  const handleConfirmResult = () => {
    if (rollResult?.hit) {
      // 命中：留接口给伤害弹窗，暂时回到沙盘
      // TODO: 切换至伤害弹窗
      onClose();
    } else {
      // 未命中：回到沙盘
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-[90vw] max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <div className="flex items-center gap-2">
            {stage !== 'attacks' && (
              <button
                onClick={() => {
                  setStage('attacks');
                  setRollResult(null);
                }}
                className="p-1 rounded hover:bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <Swords className="w-5 h-5 text-danger" />
            <span className="font-bold dark:text-text-dark light:text-text-light">
              {stage === 'attacks' ? '攻击方式' : '攻击检定'}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 攻击者/目标信息 */}
          <div className="flex items-center justify-between mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">攻击者</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{attacker.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">目标</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{target.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger">AC {target.ac || 0}</span>
            </div>
          </div>

          {/* 阶段1：攻击方式列表 */}
          {stage === 'attacks' && (
            <div className="space-y-2">
              {sortedAttacks.length === 0 && (
                <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">
                  暂无攻击方式
                </div>
              )}
              {sortedAttacks.map((attack, i) => {
                const status = getAttackStatus(attack);
                return (
                  <div
                    key={i}
                    className={`rounded-lg border p-3 transition-colors ${
                      status.usable
                        ? 'border-danger/30 bg-danger/5 cursor-pointer hover:bg-danger/10'
                        : 'dark:border-border-dark light:border-border-light opacity-60'
                    }`}
                    onClick={() => {
                      if (!status.usable) return;
                      setSelectedAttack(attack);
                      setD20Value('');
                      setRollResult(null);
                      setStage('roll');
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm dark:text-text-dark light:text-text-light">{attack.name}</span>
                          {status.usable ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">可用</span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">不可用</span>
                          )}
                        </div>
                        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1 flex flex-wrap gap-x-3">
                          <span>加值 {attack.attackBonus || '+0'}</span>
                          <span>伤害 {attack.damage || '-'}</span>
                          {attack.damageType && <span>{attack.damageType}</span>}
                        </div>
                      </div>
                      {!status.usable && status.reason && (
                        <span className="text-xs text-red-400 ml-2 shrink-0">{status.reason}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 阶段2：攻击检定（含下方检定结果） */}
          {stage === 'roll' && selectedAttack && (
            <div className="space-y-4">
              {/* 选择的攻击方式 */}
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                <div className="font-medium text-sm dark:text-text-dark light:text-text-light">{selectedAttack.name}</div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                  攻击加值 {selectedAttack.attackBonus || '+0'}
                </div>
              </div>

              {/* d20 输入 */}
              <div>
                <label className="text-sm font-medium dark:text-text-dark light:text-text-light">d20 攻击骰</label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={d20Value}
                    onChange={(e) => {
                      setD20Value(e.target.value);
                      // 修改 d20 后清除已有结果，避免结果与输入不一致
                      setRollResult(null);
                    }}
                    placeholder="输入 1-20"
                    className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => {
                      handleRollDice();
                      setRollResult(null);
                    }}
                    className="px-3 py-2 rounded-lg bg-primary text-white flex items-center gap-1.5 hover:bg-primary/90 transition-colors shrink-0"
                    title="摇骰"
                  >
                    <Dices className="w-4 h-4" />
                    <span className="text-sm">摇骰</span>
                  </button>
                </div>
              </div>

              {/* 计算预览 */}
              {d20Value && !isNaN(parseInt(d20Value, 10)) && (
                <div className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-lg font-bold">
                    <span className="dark:text-text-dark light:text-text-light">{d20Value}</span>
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>
                    <span className="text-primary">{getAttackBonus(selectedAttack)}</span>
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">=</span>
                    <span className="text-danger">{parseInt(d20Value, 10) + getAttackBonus(selectedAttack)}</span>
                  </div>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">攻击检定值</div>
                </div>
              )}

              {/* 确定按钮：点击后在下方原位弹出检定结果 */}
              <button
                onClick={handleConfirmRoll}
                disabled={!d20Value || isNaN(parseInt(d20Value, 10)) || parseInt(d20Value, 10) < 1 || parseInt(d20Value, 10) > 20}
                className="w-full py-2.5 rounded-lg bg-danger text-white font-medium hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                确定
              </button>

              {/* 检定结果：在同一个窗口页下方弹出 */}
              {rollResult && (
                <div className="space-y-3 pt-2 border-t dark:border-border-dark light:border-border-light animate-in fade-in slide-in-from-bottom duration-200">
                  {/* 对方 AC */}
                  <div className="text-center pt-2">
                    <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">对方 AC </span>
                    <span className="text-lg font-bold text-danger">{target.ac || 0}</span>
                  </div>

                  {/* 列式判定 */}
                  <div className={`rounded-lg p-4 text-center font-bold text-base sm:text-lg ${
                    rollResult.isNatural1
                      ? 'bg-red-900/30 text-red-400'
                      : rollResult.isNatural20
                      ? 'bg-yellow-500/20 text-yellow-500'
                      : rollResult.hit
                      ? 'bg-green-500/15 text-green-500'
                      : 'bg-gray-500/15 text-gray-400'
                  }`}>
                    {rollResult.isNatural1
                      ? '自然 1，未命中敌人！'
                      : rollResult.isNatural20
                      ? '自然 20，重击敌人！'
                      : rollResult.hit
                      ? '攻击检定值≥AC，命中'
                      : '攻击检定值＜AC，未命中'}
                  </div>

                  {/* 最底部的确认按钮：随检定结果出现 */}
                  <button
                    onClick={handleConfirmResult}
                    className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                  >
                    {rollResult.hit ? '确认命中' : '确认未命中'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
