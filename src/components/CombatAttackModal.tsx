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
  // 攻击者与目标在沙盘上的格子坐标（从 tokenMap 获取）
  attackerPos?: { col: number; row: number };
  targetPos?: { col: number; row: number };
}

// 射程等级：用于判断投掷武器的标签
type RangeTier = 'melee' | 'normal' | 'max' | 'outOfRange';

type Stage = 'attacks' | 'roll';

export default function CombatAttackModal({ attacker, target, onClose, attackerPos, targetPos }: Props) {
  const [stage, setStage] = useState<Stage>('attacks');
  const [selectedAttack, setSelectedAttack] = useState<Attack | NpcAttack | null>(null);
  const [d20Value, setD20Value] = useState<string>('');
  const [rollResult, setRollResult] = useState<{ d20: number; bonus: number; total: number; isNatural1: boolean; isNatural20: boolean; hit: boolean; disadvantage: boolean } | null>(null);

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

  // ========= 射程判定辅助函数（复用 CombatantInfoPanel 的逻辑） =========
  const isRangedWeapon = (attack: Attack | NpcAttack): boolean => {
    if (attack.subtype) {
      if (attack.subtype.includes('远程') || attack.subtype.includes('弹药')) return true;
    }
    if (attack.normalRange !== undefined && attack.normalRange > 0) return true;
    if (attack.maxRange !== undefined && attack.maxRange > 0) return true;
    return false;
  };

  const isThrownWeapon = (attack: Attack | NpcAttack): boolean => {
    if (attack.subtype && attack.subtype.includes('投掷')) return true;
    if (attack.properties) {
      return attack.properties.some(p => p.includes('投掷'));
    }
    return false;
  };

  const getRangeInfo = (attack: Attack | NpcAttack): { label: string; value: string; feet: number }[] => {
    const ranges: { label: string; value: string; feet: number }[] = [];
    const meleeRange = attack.range;
    const hasNormal = attack.normalRange !== undefined && attack.normalRange > 0;
    const hasMax = attack.maxRange !== undefined && attack.maxRange > 0;
    const isRanged = isRangedWeapon(attack);
    const isThrown = isThrownWeapon(attack);

    if (meleeRange && !meleeRange.startsWith('-') && (!isRanged || isThrown)) {
      const meleeMatch = meleeRange.match(/(\d+)/);
      const meleeFeet = meleeMatch ? parseInt(meleeMatch[1], 10) : 5;
      ranges.push({ label: '近战', value: meleeRange, feet: meleeFeet });
    }
    if (hasNormal) {
      ranges.push({ label: '常规', value: `${attack.normalRange}尺`, feet: attack.normalRange });
    }
    if (hasMax) {
      ranges.push({ label: '最大', value: `${attack.maxRange}尺`, feet: attack.maxRange });
    }
    return ranges;
  };

  // 攻击者到目标的切比雪夫距离（格数）；未放置则视为零距离
  const distanceCells = useMemo(() => {
    if (!attackerPos || !targetPos) return 0;
    return Math.max(Math.abs(attackerPos.col - targetPos.col), Math.abs(attackerPos.row - targetPos.row));
  }, [attackerPos, targetPos]);

  // 获取某攻击下目标所处的射程等级
  const getRangeTier = (attack: Attack | NpcAttack): RangeTier => {
    const ranges = getRangeInfo(attack);
    if (ranges.length === 0) return 'outOfRange';
    const distanceFeet = distanceCells * 5;

    // 检查是否在近战射程
    const melee = ranges.find(r => r.label === '近战');
    if (melee && distanceFeet <= melee.feet) return 'melee';

    // 若在常规射程内（近战范围外）
    const normal = ranges.find(r => r.label === '常规');
    if (normal && distanceFeet <= normal.feet) return 'normal';

    // 若在最大射程内（常规射程外）
    const max = ranges.find(r => r.label === '最大');
    if (max && distanceFeet <= max.feet) return 'max';

    return 'outOfRange';
  };

  // 判断攻击是否可用 + 不可用原因
  const getAttackStatus = (attack: Attack | NpcAttack): { usable: boolean; reason?: string } => {
    if (character) {
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

      const handUsable = (leftMatch && leftUsable) || (rightMatch && rightUsable);
      if (!handUsable) return { usable: false, reason: '手部不可用' };
    }

    // 射程检查：仅当攻击者与目标都已放置在沙盘上时才判定
    if (attackerPos && targetPos) {
      const tier = getRangeTier(attack);
      if (tier === 'outOfRange') return { usable: false, reason: '不在射程内' };
    }

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
  }, [attacks, character, heldLeftItem, heldRightItem, attackerPos, targetPos]);

  // 骰子摇数
  const handleRollDice = () => {
    const result = rollDice({ sides: 20, count: 1, mode: 'independent' });
    setD20Value(String(result.values[0]));
  };

  // 判断某攻击当前是否属于「检定劣势」（投掷武器处于最大射程段）
  const hasDisadvantage = (attack: Attack | NpcAttack): boolean => {
    if (!isThrownWeapon(attack)) return false;
    return getRangeTier(attack) === 'max';
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
    const disadvantage = hasDisadvantage(selectedAttack);
    setRollResult({ d20, bonus, total, isNatural1, isNatural20, hit, disadvantage });
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
                const thrown = isThrownWeapon(attack);
                const tier = attackerPos && targetPos ? getRangeTier(attack) : 'melee';
                // 投掷武器：不在近战射程但在常规射程 → 加「投掷」标签
                const showThrownTag = thrown && tier === 'normal';
                // 投掷武器：在常规射程外、最大射程内 → 额外加「检定劣势」标签
                const showDisadvantageTag = thrown && tier === 'max';
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm dark:text-text-dark light:text-text-light">{attack.name}</span>
                          {status.usable ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-500">可用</span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">不可用</span>
                          )}
                          {showThrownTag && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">投掷</span>
                          )}
                          {showDisadvantageTag && (
                            <>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">投掷</span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">检定劣势</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1 flex flex-wrap gap-x-3">
                          <span>加值 {attack.attackBonus || '+0'}</span>
                          <span>伤害 {attack.damage || '-'}</span>
                          {attack.damageType && <span>{attack.damageType}</span>}
                          {attackerPos && targetPos && (
                            <span>距离 {distanceCells} 格（{distanceCells * 5}尺）</span>
                          )}
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
          {stage === 'roll' && selectedAttack && (() => {
            const thrown = isThrownWeapon(selectedAttack);
            const tier = attackerPos && targetPos ? getRangeTier(selectedAttack) : 'melee';
            const showThrownTag = thrown && tier === 'normal';
            const showDisadvantageTag = thrown && tier === 'max';
            return (
            <div className="space-y-4">
              {/* 选择的攻击方式 */}
              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm dark:text-text-dark light:text-text-light">{selectedAttack.name}</span>
                  {showThrownTag && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">投掷</span>
                  )}
                  {showDisadvantageTag && (
                    <>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">投掷</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">检定劣势</span>
                    </>
                  )}
                </div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                  攻击加值 {selectedAttack.attackBonus || '+0'}
                  {attackerPos && targetPos && (
                    <span className="ml-2">距离 {distanceCells} 格（{distanceCells * 5}尺）</span>
                  )}
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
            );
          })()}
        </div>
      </div>
    </div>
  );
}
