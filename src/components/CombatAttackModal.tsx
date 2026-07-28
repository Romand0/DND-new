// 战斗攻击检定弹窗 —— 从沙盘战斗按钮触发
import { useState, useMemo } from 'react';
import { X, Swords, Dices, ChevronLeft, MoreHorizontal } from 'lucide-react';
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
  /** 命中确认：交由 main 切换至伤害弹窗 */
  onConfirmHit?: (attack: Attack | NpcAttack, disadvantage: boolean) => void;
}

// 射程等级：用于判断投掷武器的标签
type RangeTier = 'melee' | 'normal' | 'max' | 'outOfRange';

type Stage = 'attacks' | 'roll';

export default function CombatAttackModal({ attacker, target, onClose, attackerPos, targetPos, onConfirmHit }: Props) {
  const [stage, setStage] = useState<Stage>('attacks');
  const [selectedAttack, setSelectedAttack] = useState<Attack | NpcAttack | null>(null);
  // d20 投掷值：普通模式长度 1，优/劣势模式长度 2
  const [d20Values, setD20Values] = useState<string[]>(['']);
  const [rollResult, setRollResult] = useState<{ d20: number; bonus: number; total: number; isNatural1: boolean; isNatural20: boolean; hit: boolean; disadvantage: boolean } | null>(null);
  // 手动决定的检定模式（与自动检测的优劣势合并；优势/劣势互斥）
  const [manualMode, setManualMode] = useState<'none' | 'advantage' | 'disadvantage'>('none');
  const [showAdvDisadvMenu, setShowAdvDisadvMenu] = useState(false);

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

  // ========= 优势 / 劣势 检测 =========
  // 返回自动检测到的优劣势原因列表（已实现的机制适配）
  const getAttackAdvantageDisadvantage = (attack: Attack | NpcAttack): { advantage: string[]; disadvantage: string[] } => {
    const advantage: string[] = [];
    const disadvantage: string[] = [];

    // —— 劣势：不熟练的护甲（仅 PC，穿戴护甲且不熟练）——
    if (character) {
      const armorId = character.wornArmorId;
      if (armorId) {
        const armor = character.equipment.find(e => (e.childId || e.id) === armorId);
        if (armor && armor.subtype) {
          const profs = character.proficiencies?.armor || [];
          if (!profs.includes(armor.subtype)) {
            disadvantage.push('不熟练的护甲');
          }
        }
      }
    }

    // —— 劣势：从 5 尺距离发动远程攻击（远程武器且目标相邻 = 1 格 = 5 尺）——
    if (attackerPos && targetPos && isRangedWeapon(attack) && distanceCells === 1) {
      disadvantage.push('从 5 尺距离发动远程攻击');
    }

    // —— 劣势：投掷武器处于最大射程段（既有机制，纳入统一劣势系统）——
    if (isThrownWeapon(attack) && attackerPos && targetPos && getRangeTier(attack) === 'max') {
      disadvantage.push('投掷武器处于最大射程段');
    }

    return { advantage, disadvantage };
  };

  // 最终检定模式：手动优先，否则自动检测（优劣势互相抵消）
  const computeRollMode = (attack: Attack | NpcAttack): 'none' | 'advantage' | 'disadvantage' => {
    if (manualMode !== 'none') return manualMode;
    const { advantage, disadvantage } = getAttackAdvantageDisadvantage(attack);
    // D&D 5e：同时存在优劣势则互相抵消
    if (advantage.length > 0 && disadvantage.length > 0) return 'none';
    if (advantage.length > 0) return 'advantage';
    if (disadvantage.length > 0) return 'disadvantage';
    return 'none';
  };

  // 获取当前模式下的原因列表（用于展示效果来源）
  const getRollModeReasons = (attack: Attack | NpcAttack, mode: 'none' | 'advantage' | 'disadvantage'): string[] => {
    if (mode === 'none') return [];
    const { advantage, disadvantage } = getAttackAdvantageDisadvantage(attack);
    if (mode === 'advantage') return manualMode === 'advantage' ? ['手动指定'] : advantage;
    return manualMode === 'disadvantage' ? ['手动指定'] : disadvantage;
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

  // 骰子摇数：普通模式摇 1 个，优/劣势模式摇 2 个
  const handleRollDice = (mode: 'none' | 'advantage' | 'disadvantage') => {
    const count = mode === 'none' ? 1 : 2;
    const result = rollDice({ sides: 20, count, mode: 'independent' });
    setD20Values(result.values.map(String));
    setRollResult(null);
  };

  // 确定检定 —— 不切换阶段，结果在下方原位弹出
  const handleConfirmRoll = () => {
    if (!selectedAttack) return;
    const mode = computeRollMode(selectedAttack);
    // 普通模式需要 1 个值，优/劣势需要 2 个值都填充
    const parsed = d20Values.map(v => parseInt(v, 10));
    const allValid = parsed.every(n => !isNaN(n) && n >= 1 && n <= 20);
    if (!allValid) return;
    if (mode !== 'none' && parsed.length < 2) return;

    // 取较高（优势）/ 较低（劣势）/ 唯一（普通）
    const d20 = mode === 'advantage' ? Math.max(...parsed) : mode === 'disadvantage' ? Math.min(...parsed) : parsed[0];
    const bonus = getAttackBonus(selectedAttack);
    const total = d20 + bonus;
    const isNatural1 = d20 === 1;
    const isNatural20 = d20 === 20;
    const targetAc = target.ac || 0;
    const hit = isNatural20 ? true : isNatural1 ? false : total >= targetAc;
    setRollResult({ d20, bonus, total, isNatural1, isNatural20, hit, disadvantage: mode === 'disadvantage' });
  };

  // 确认结果
  const handleConfirmResult = () => {
    if (rollResult?.hit) {
      // 命中：交由 main 切换至伤害弹窗；若无回调则关闭
      if (onConfirmHit && selectedAttack) {
        onConfirmHit(selectedAttack, rollResult.disadvantage);
      } else {
        onClose();
      }
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
                // 优势/劣势标签（自动检测，手动覆盖不在此显示）
                const { advantage: advReasons, disadvantage: disadvReasons } = getAttackAdvantageDisadvantage(attack);
                const hasAdv = advReasons.length > 0;
                const hasDisadv = disadvReasons.length > 0;
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
                      // 根据自动检测的优劣势初始化 d20 输入框数量
                      const { advantage: a, disadvantage: d } = getAttackAdvantageDisadvantage(attack);
                      const autoMode = (a.length > 0 && d.length > 0) ? 'none' : (a.length > 0 ? 'advantage' : (d.length > 0 ? 'disadvantage' : 'none'));
                      setD20Values(autoMode === 'none' ? [''] : ['', '']);
                      setRollResult(null);
                      setManualMode('none');
                      setShowAdvDisadvMenu(false);
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
                          {hasAdv && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">检定优势</span>
                          )}
                          {hasDisadv && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">检定劣势</span>
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
            const rollMode = computeRollMode(selectedAttack);
            const modeReasons = getRollModeReasons(selectedAttack, rollMode);
            const isDual = rollMode !== 'none';
            // 校验所有 d20 输入是否有效
            const parsedDice = d20Values.map(v => parseInt(v, 10));
            const allFilled = isDual ? parsedDice.length === 2 && parsedDice.every(n => !isNaN(n) && n >= 1 && n <= 20)
              : parsedDice.length === 1 && !isNaN(parsedDice[0]) && parsedDice[0] >= 1 && parsedDice[0] <= 20;
            // 用于预览的最终 d20（优势取高、劣势取低、普通取唯一）
            const previewD20 = isDual && parsedDice.length === 2 && parsedDice.every(n => !isNaN(n))
              ? (rollMode === 'advantage' ? Math.max(...parsedDice) : Math.min(...parsedDice))
              : (!isDual && parsedDice.length === 1 && !isNaN(parsedDice[0]) ? parsedDice[0] : null);
            return (
            <div className="space-y-4">
              {/* 选择的攻击方式 + 手动优劣势覆盖 */}
              <div className="relative rounded-lg border border-danger/30 bg-danger/5 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm dark:text-text-dark light:text-text-light">{selectedAttack.name}</span>
                  {showThrownTag && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">投掷</span>
                  )}
                  {rollMode === 'advantage' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">检定优势</span>
                  )}
                  {rollMode === 'disadvantage' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">检定劣势</span>
                  )}
                </div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                  攻击加值 {selectedAttack.attackBonus || '+0'}
                  {attackerPos && targetPos && (
                    <span className="ml-2">距离 {distanceCells} 格（{distanceCells * 5}尺）</span>
                  )}
                </div>
                {/* 手动优劣势覆盖按钮 */}
                <button
                  onClick={() => setShowAdvDisadvMenu(v => !v)}
                  className={`absolute bottom-2 right-2 p-1 rounded transition-colors ${
                    showAdvDisadvMenu || manualMode !== 'none'
                      ? 'bg-primary/20 text-primary'
                      : 'dark:text-text-dark-muted light:text-text-light-muted hover:bg-white/10'
                  }`}
                  title="手动决定优/劣势"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {/* 手动覆盖菜单 */}
                {showAdvDisadvMenu && (
                  <div className="absolute bottom-9 right-2 z-10 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light shadow-xl py-1 w-28">
                    <button
                      onClick={() => {
                        setManualMode('none');
                        setD20Values(['']);
                        setRollResult(null);
                        setShowAdvDisadvMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${manualMode === 'none' ? 'text-primary font-medium' : 'dark:text-text-dark light:text-text-light'}`}
                    >
                      正常
                    </button>
                    <button
                      onClick={() => {
                        setManualMode('advantage');
                        setD20Values(['', '']);
                        setRollResult(null);
                        setShowAdvDisadvMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${manualMode === 'advantage' ? 'text-green-400 font-medium' : 'dark:text-text-dark light:text-text-light'}`}
                    >
                      优势
                    </button>
                    <button
                      onClick={() => {
                        setManualMode('disadvantage');
                        setD20Values(['', '']);
                        setRollResult(null);
                        setShowAdvDisadvMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 ${manualMode === 'disadvantage' ? 'text-amber-400 font-medium' : 'dark:text-text-dark light:text-text-light'}`}
                    >
                      劣势
                    </button>
                  </div>
                )}
              </div>

              {/* 优劣势效果来源说明（标签后陈述原因） */}
              {isDual && modeReasons.length > 0 && (
                <div className={`rounded-lg p-2.5 text-xs flex items-start gap-2 ${
                  rollMode === 'advantage' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  <span className="font-medium shrink-0">{rollMode === 'advantage' ? '优势来源' : '劣势来源'}</span>
                  <span>{modeReasons.join('；')}</span>
                </div>
              )}

              {/* d20 输入：普通模式 1 个，优/劣势模式 2 个 */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
                    d20 攻击骰{isDual ? '（双骰）' : ''}
                  </label>
                  {isDual && (
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      两次骰值取{rollMode === 'advantage' ? '高' : '低'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {d20Values.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-1">
                      {idx > 0 && (
                        <span className="dark:text-text-dark-muted light:text-text-light-muted text-sm">
                          {rollMode === 'advantage' ? '取高' : '取低'}
                        </span>
                      )}
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={v}
                        onChange={(e) => {
                          setD20Values(prev => {
                            const next = [...prev];
                            next[idx] = e.target.value;
                            return next;
                          });
                          setRollResult(null);
                        }}
                        placeholder="输入 1-20"
                        className="flex-1 w-0 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center"
                      />
                    </div>
                  ))}
                  <button
                    onDoubleClick={() => handleRollDice(rollMode)}
                    className="px-3 py-2 rounded-lg bg-primary text-white flex items-center gap-1.5 hover:bg-primary/90 active:scale-90 active:bg-primary/80 transition-all shrink-0 select-none"
                    title="双击摇骰"
                  >
                    <Dices className="w-4 h-4" />
                    <span className="text-sm">摇骰</span>
                  </button>
                </div>
              </div>

              {/* 计算预览 */}
              {previewD20 !== null && (
                <div className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-3 text-center">
                  <div className="flex items-center justify-center gap-2 text-lg font-bold flex-wrap">
                    {isDual && (
                      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                        ({parsedDice.join(rollMode === 'advantage' ? ' → 取高 → ' : ' → 取低 → ')})
                      </span>
                    )}
                    <span className="dark:text-text-dark light:text-text-light">{previewD20}</span>
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>
                    <span className="text-primary">{getAttackBonus(selectedAttack)}</span>
                    <span className="dark:text-text-dark-muted light:text-text-light-muted">=</span>
                    <span className="text-danger">{previewD20 + getAttackBonus(selectedAttack)}</span>
                  </div>
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">攻击检定值</div>
                </div>
              )}

              {/* 确定按钮：点击后在下方原位弹出检定结果 */}
              <button
                onClick={handleConfirmRoll}
                disabled={!allFilled}
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
                    {rollResult.hit ? '确认命中，进入伤害结算' : '确认未命中'}
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
