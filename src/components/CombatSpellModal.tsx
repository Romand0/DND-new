// 法术施放弹窗 —— 与攻击检定完全独立的交互流程
// 从沙盘「法术」按钮触发：浏览法术 → 选定 → 选检定方式 → 检定 → 骰效果骰池
import { useState, useMemo, Fragment, useEffect, type ReactNode } from 'react';
import { X, BookOpen, Dices, Calculator, ChevronLeft } from 'lucide-react';
import { rollDice } from '@/data/diceService';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import combatStore, { computeCombatantAc } from '@/data/combatStore';
import { detectAdvantage, resolveRollMode, getMatchedPendingSourceIds, type AdvantageContext } from '@/data/advantageRules';
import AdvDisadvToggle from './AdvDisadvToggle';
import type { Combatant, CheckScene, AdvantageReason, AdvantageResult } from '@/types/combat';
import type { Character, AbilityKey, Equipment } from '@/types/character';
import type { Spell } from '@/types/spell';

type Stage = 'list' | 'cast';

// 检定方式：AC 检定（法术攻击 vs 目标 AC）/ 豁免检定（目标掷骰 vs 施法 DC）/ 无检定
type CheckType = 'ac' | 'save' | 'none';

// 效果类型：伤害 / 治疗（无检定场景下由用户选择；检定场景默认伤害）
type EffectType = 'damage' | 'heal';

interface Props {
  caster: Combatant;        // 施法者（攻击者位）
  target: Combatant;        // 目标
  onClose: () => void;
  /** 可选：目标角色（PC 时传入，用于基于目标战斗背包重算 AC） */
  targetCharacter?: Character | null;
  /** 可选：目标战斗背包，用于重算目标 AC */
  targetCombatInventory?: Equipment[];
  /** 战斗记录 ID（用于消费 pending 标记） */
  recordId?: string;
  /** 当前回合数（用于 pending 过期判定） */
  currentRound?: number;
  /** 所有参战者沙盘位置字典（跨参战者距离判定，如协助动作 5 尺内约束） */
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  /** 施放完成：回传完整信息由 main 写入先攻表格与应用 HP 变化 */
  onCastResolved: (info: {
    spellName: string;
    /** 施法时间原文（如 "1 动作"），用于动作机制判定 */
    castingTime?: string;
    success: boolean;              // 检定是否成功（无检定场景恒 true）
    effectType: EffectType;        // 伤害 / 治疗
    amount: number;                // 最终数值
    newHp: number;                 // 应用后的 HP
    status?: 'unconscious' | 'dead'; // NPC 致命伤害附带状态
    checkType: CheckType;          // 使用的检定方式
    d20Rolled?: number[];          // 检定骰序列
    d20Final?: number;             // 最终 d20
    d20Bonus?: number;             // 检定加值
    d20Total?: number;             // 检定总值
  }) => void;
}

// 解析骰子表达式，如 "8d6"、"2d8+3"、"1d4"
function parseDice(expr: string): { count: number; sides: number; bonus: number } {
  const result = { count: 1, sides: 0, bonus: 0 };
  if (!expr) return result;
  const plusIdx = expr.indexOf('+');
  let dicePart = expr;
  let bonusPart = '';
  if (plusIdx !== -1) {
    dicePart = expr.substring(0, plusIdx).trim();
    bonusPart = expr.substring(plusIdx + 1).trim();
  } else {
    dicePart = expr.trim();
  }
  if (bonusPart) {
    const b = parseInt(bonusPart, 10);
    if (!isNaN(b)) result.bonus = b;
  }
  const dIdx = dicePart.toLowerCase().indexOf('d');
  if (dIdx === -1) {
    const flat = parseInt(dicePart, 10);
    if (!isNaN(flat)) {
      result.bonus += flat;
      result.count = 0;
    }
    return result;
  }
  const countStr = dicePart.substring(0, dIdx).trim();
  const sidesStr = dicePart.substring(dIdx + 1).trim();
  if (countStr) {
    const c = parseInt(countStr, 10);
    if (!isNaN(c) && c > 0) result.count = c;
  }
  if (sidesStr) {
    const s = parseInt(sidesStr, 10);
    if (!isNaN(s) && s > 0) result.sides = s;
  }
  return result;
}

// 法术描述中的骰子表达式高亮
function renderSpellDice(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\d+)d(4|6|8|10|12|20)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    parts.push(
      <span key={key++} className="inline-flex items-baseline mx-0.5">
        <span className="text-primary font-bold">{match[1]}</span>
        <span className="px-1 py-0 mx-0.5 rounded bg-accent/20 text-accent font-mono font-semibold">d{match[2]}</span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts;
}

// 单张法术卡片
function SpellCard({ spell, level, active, onPick }: { spell: Spell; level: number; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={`w-full text-left rounded-lg p-2.5 border transition-all ${
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'dark:bg-bg-dark light:bg-bg-light-2 dark:border-border-dark/50 light:border-border-light/50 hover:border-primary/50'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm dark:text-text-dark light:text-text-light">{spell.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
          {level === 0 ? '戏法' : `${level}环`}
        </span>
        {spell.concentration && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">专注</span>
        )}
        {spell.ritual && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">仪式</span>
        )}
      </div>
      <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted mt-1 flex flex-wrap gap-x-2">
        {spell.castingTime && <span>· {spell.castingTime}</span>}
        {spell.range && <span>· 射程 {spell.range}</span>}
        {spell.duration && <span>· {spell.duration}</span>}
        {spell.school && <span>· {spell.school}</span>}
      </div>
      {spell.description && (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5 leading-relaxed whitespace-pre-line">
          {renderSpellDice(spell.description)}
        </div>
      )}
      {spell.heightenedEffect && (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5 flex items-start gap-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 shrink-0">升环</span>
          <span className="leading-relaxed">{spell.heightenedEffect}</span>
        </div>
      )}
    </button>
  );
}

export default function CombatSpellModal({ caster, target, onClose, onCastResolved, targetCharacter: propTargetCharacter, targetCombatInventory, recordId, currentRound, combatantPositions }: Props) {
  // 目标角色卡：优先使用 prop 传入值，没有时按 characterId 查找（用于自动填入豁免加值）
  const targetCharacter = useMemo<Character | null>(() => {
    if (propTargetCharacter !== undefined && propTargetCharacter !== null) return propTargetCharacter;
    if (target.characterId) return characterStore.get(target.characterId);
    return null;
  }, [propTargetCharacter, target.characterId]);
  // 目标 AC：PC 角色传入战斗背包时重算（被移除的护甲/盾牌不加值）
  const effectiveTargetAc = computeCombatantAc(target, targetCharacter ?? null, targetCombatInventory ?? null);
  const [stage, setStage] = useState<Stage>('list');
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);

  // 检定相关
  const [checkType, setCheckType] = useState<CheckType>('ac');
  const [effectType, setEffectType] = useState<EffectType>('damage');
  const [d20Values, setD20Values] = useState<string[]>(['']);
  const [targetSaveBonus, setTargetSaveBonus] = useState<string>('');
  const [saveAttribute, setSaveAttribute] = useState<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>('dex');
  const [rollResult, setRollResult] = useState<{ d20: number; bonus: number; total: number; isNatural1: boolean; isNatural20: boolean; success: boolean } | null>(null);
  const [lockedDice, setLockedDice] = useState<Set<number>>(new Set());
  const [manualMode, setManualMode] = useState<'none' | 'advantage' | 'disadvantage'>('none');

  // 效果骰池：用户手动输入表达式
  const [diceExpr, setDiceExpr] = useState<string>('');
  const [effectDiceValues, setEffectDiceValues] = useState<string[]>([]);
  const [calculated, setCalculated] = useState<number | null>(null);
  // NPC 致命伤害状态决定
  const [downedStatus, setDownedStatus] = useState<'unconscious' | 'dead' | null>(null);

  // 施法者角色卡（NPC 无 character，无法用法术弹窗——按钮层会拦截，这里兜底）
  const character = useMemo<Character | null>(() => {
    if (caster.characterId) return characterStore.get(caster.characterId);
    return null;
  }, [caster.characterId]);

  // 豁免属性短写 → AbilityKey 全称映射
  const SAVE_ATTR_MAP: Record<string, AbilityKey> = {
    str: 'strength', dex: 'dexterity', con: 'constitution',
    int: 'intelligence', wis: 'wisdom', cha: 'charisma',
  };

  // 自动填入目标豁免加值：选择豁免属性、切换到 save 模式、或目标角色变化时触发
  // 用户仍可手动覆盖输入框中的值
  useEffect(() => {
    if (checkType !== 'save') return;
    const abilityKey = SAVE_ATTR_MAP[saveAttribute];
    if (!abilityKey) return;
    
    let bonus = 0;
    if (targetCharacter) {
      // PC：从角色卡获取豁免加值
      bonus = characterStore.getSaveBonus(targetCharacter, abilityKey);
    } else {
      // NPC：从 Combatant 属性值计算调整值（非特殊说明时，豁免加值 = 属性调整值）
      const abilityScore = target[abilityKey as keyof Combatant] as number | undefined;
      if (typeof abilityScore === 'number') {
        bonus = Math.floor((abilityScore - 10) / 2);
      }
    }
    
    setTargetSaveBonus(String(bonus));
    setRollResult(null);
  }, [checkType, saveAttribute, targetCharacter, target]);

  const spellAbilityKey = character ? characterStore.getSpellcastingAbility(character) : null;
  const spellAbilityLabel = spellAbilityKey
    ? ({ strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力' } as const)[spellAbilityKey]
    : null;
  const spellAttackBonus = character ? characterStore.getSpellAttackBonus(character) : null;
  const spellSaveDC = character ? characterStore.getSpellSaveDC(character) : null;

  // 法术列表
  const knownSpells = useMemo<{ spell: Spell; level: number }[]>(() => {
    if (!character) return [];
    const all = spellStore.getAll();
    const byName = (name: string) => all.find(s => s.name === name);
    const list: { spell: Spell; level: number }[] = [];
    (character.spells?.cantrips || []).forEach(name => {
      const s = byName(name);
      if (s) list.push({ spell: s, level: 0 });
    });
    (character.spells?.custom || []).forEach(name => {
      const s = byName(name);
      if (s) list.push({ spell: s, level: s.level });
    });
    return list;
  }, [character]);

  // 是否同队伍（决定效果类型可选项）
  const sameTeam = !!caster && !!target && (caster.isPc === target.isPc);

  // 选定法术进入施放阶段
  const handlePickSpell = (spell: Spell) => {
    // 言语成分校验：若法术需要 V 成分而施法者无法言语，则阻止施放
    if (spell.components?.verbal && caster.canSpeak === false) {
      alert(`无法施放「${spell.name}」：该法术需要言语成分（V），但你当前无法说话或发出声音。`);
      return;
    }
    setSelectedSpell(spell);
    setStage('cast');
    setCheckType('ac');
    setEffectType('damage');
    setD20Values(['']);
    setTargetSaveBonus('');
    setRollResult(null);
    setLockedDice(new Set());
    setManualMode('none');
    setDiceExpr('');
    setEffectDiceValues([]);
    setCalculated(null);
    setDownedStatus(null);
  };

  // 切换检定方式
  const handleCheckTypeChange = (t: CheckType) => {
    setCheckType(t);
    setD20Values(['']);
    setTargetSaveBonus('');
    setRollResult(null);
    setLockedDice(new Set());
    // 无检定场景：默认效果类型（敌方默认伤害，友方默认治疗）
    if (t === 'none') {
      setEffectType(sameTeam ? 'heal' : 'damage');
    } else {
      // 检定场景固定走伤害（治疗类法术一般无需检定）
      setEffectType('damage');
    }
    setDiceExpr('');
    setEffectDiceValues([]);
    setCalculated(null);
    setDownedStatus(null);
  };

  // 优劣势模式：法术攻击走 spell_attack 场景，豁免走 saving_throw 场景
  const advantageContext: AdvantageContext = {
    scene: checkType === 'save' ? 'saving_throw' : 'spell_attack',
    currentRound,
    attacker: caster,
    target,
    attackerCharacter: character,
    targetCharacter: targetCharacter ?? null,
    saveAbility: checkType === 'save' ? SAVE_ATTR_MAP[saveAttribute] : undefined,
    combatantPositions,
  };
  const autoResult: AdvantageResult = checkType === 'none' ? { advantage: [], disadvantage: [] } : detectAdvantage(advantageContext);
  const { mode: rollMode, reasons: modeReasons } = resolveRollMode(manualMode, autoResult);
  const isDual = rollMode !== 'none';

  // 应用 d20 输入变化：自然 20 即时成功、自然 1 即时失败
  const applyDiceValues = (newValues: string[]) => {
    setD20Values(newValues);
    if (!selectedSpell) {
      setRollResult(null);
      setLockedDice(new Set());
      return;
    }
    if (checkType === 'none') return;

    // AC 检定：d20 + 法术攻击加值 vs AC
    // 自然 20 即时成功，自然 1 即时失败
    if (checkType === 'ac' && spellAttackBonus !== null) {
      if (isDual) {
        const idx20 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 20; });
        if (idx20 !== -1) {
          const otherIdx = idx20 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          setRollResult({ d20: 20, bonus: spellAttackBonus, total: 20 + spellAttackBonus, isNatural1: false, isNatural20: true, success: true });
          return;
        }
        const idx1 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 1; });
        if (idx1 !== -1) {
          const otherIdx = idx1 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          setRollResult({ d20: 1, bonus: spellAttackBonus, total: 1 + spellAttackBonus, isNatural1: true, isNatural20: false, success: false });
          return;
        }
      }
      setLockedDice(new Set());
      setRollResult(null);
      return;
    }

    // 豁免检定：目标掷 d20 + 豁免加值 vs DC
    // 自然 20 = 抵抗（失败），自然 1 = 失败（成功），语义反转
    if (checkType === 'save' && spellSaveDC !== null) {
      if (isDual) {
        const idx20 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 20; });
        if (idx20 !== -1) {
          const otherIdx = idx20 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          setRollResult({ d20: 20, bonus: 0, total: 20, isNatural1: false, isNatural20: true, success: false });
          return;
        }
        const idx1 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 1; });
        if (idx1 !== -1) {
          const otherIdx = idx1 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          setRollResult({ d20: 1, bonus: 0, total: 1, isNatural1: true, isNatural20: false, success: true });
          return;
        }
      }
      setLockedDice(new Set());
      setRollResult(null);
      return;
    }
  };

  // 摇 d20
  const handleRollD20 = () => {
    const count = isDual ? 2 : 1;
    const result = rollDice({ sides: 20, count, mode: 'independent' });
    applyDiceValues(result.values.map(String));
  };

  // 确定检定
  const handleConfirmCheck = () => {
    if (checkType === 'none') {
      // 无检定：直接进入效果骰池阶段
      setRollResult({ d20: 0, bonus: 0, total: 0, isNatural1: false, isNatural20: false, success: true });
      return;
    }
    const parsed = d20Values.map(v => parseInt(v, 10));
    const allValid = parsed.every(n => !isNaN(n) && n >= 1 && n <= 20);
    if (!allValid) return;
    if (isDual && parsed.length < 2) return;

    if (checkType === 'ac' && spellAttackBonus !== null) {
      const bonus = spellAttackBonus;
      let d20: number;
      let isNatural1: boolean;
      let isNatural20: boolean;
      let success: boolean;
      const targetAc = effectiveTargetAc || 0;
      // 优先级：自然 20 > 自然 1 > 普通比对
      if (isDual && parsed.some(n => n === 20)) {
        d20 = 20; isNatural1 = false; isNatural20 = true; success = true;
      } else if (isDual && parsed.some(n => n === 1)) {
        d20 = 1; isNatural1 = true; isNatural20 = false; success = false;
      } else {
        d20 = isDual ? (rollMode === 'advantage' ? Math.max(...parsed) : Math.min(...parsed)) : parsed[0];
        isNatural1 = d20 === 1;
        isNatural20 = d20 === 20;
        success = isNatural20 ? true : isNatural1 ? false : d20 + bonus >= targetAc;
      }
      setRollResult({ d20, bonus, total: d20 + bonus, isNatural1, isNatural20, success });
      // 消费 pending 优劣势标记
      if (recordId) {
        const pendingIds = getMatchedPendingSourceIds(autoResult);
        if (pendingIds.length > 0) combatStore.consumePendingAdvantage(recordId, caster.id, pendingIds);
      }
      return;
    }

    if (checkType === 'save' && spellSaveDC !== null) {
      const saveBonusNum = parseInt(targetSaveBonus, 10);
      const bonus = isNaN(saveBonusNum) ? 0 : saveBonusNum;
      let d20: number;
      let isNatural1: boolean;
      let isNatural20: boolean;
      let success: boolean;
      if (isDual && parsed.some(n => n === 20)) {
        d20 = 20; isNatural1 = false; isNatural20 = true; success = false;
      } else if (isDual && parsed.some(n => n === 1)) {
        d20 = 1; isNatural1 = true; isNatural20 = false; success = true;
      } else {
        d20 = isDual ? (rollMode === 'advantage' ? Math.max(...parsed) : Math.min(...parsed)) : parsed[0];
        isNatural1 = d20 === 1;
        isNatural20 = d20 === 20;
        const saveTotal = d20 + bonus;
        // 豁免总值 ≥ DC = 抵抗（失败）；< DC = 失败（成功命中）
        success = isNatural20 ? false : isNatural1 ? true : saveTotal < spellSaveDC;
      }
      setRollResult({ d20, bonus, total: d20 + bonus, isNatural1, isNatural20, success });
      // 消费 pending 优劣势标记
      if (recordId) {
        const pendingIds = getMatchedPendingSourceIds(autoResult);
        if (pendingIds.length > 0) combatStore.consumePendingAdvantage(recordId, caster.id, pendingIds);
      }
      return;
    }
  };

  // 效果骰池解析
  const parsedEffect = useMemo(() => parseDice(diceExpr), [diceExpr]);
  // 当骰子表达式变化导致数量变化时重置输入框
  useEffect(() => {
    if (parsedEffect.count > 0 && effectDiceValues.length !== parsedEffect.count) {
      setEffectDiceValues(Array.from({ length: parsedEffect.count }).map(() => ''));
      setCalculated(null);
      setDownedStatus(null);
    }
  }, [parsedEffect.count, parsedEffect.sides]);

  const computeEffectTotal = (): number => {
    let sum = parsedEffect.bonus;
    for (const v of effectDiceValues) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) sum += n;
    }
    return sum;
  };

  const handleRollEffectDice = () => {
    if (parsedEffect.count === 0 || parsedEffect.sides === 0) return;
    const result = rollDice({ sides: parsedEffect.sides as 4 | 6 | 8 | 10 | 12 | 20, count: parsedEffect.count, mode: 'independent' });
    setEffectDiceValues(result.values.map(String));
    setCalculated(null);
    setDownedStatus(null);
  };

  const updateEffectDie = (idx: number, val: string) => {
    setEffectDiceValues(prev => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    setCalculated(null);
    setDownedStatus(null);
  };

  const handleCalcEffect = () => {
    setCalculated(computeEffectTotal());
    setDownedStatus(null);
  };

  // HP 计算
  const maxHp = target.maxHp ?? 0;
  const currentHp = target.currentHp ?? 0;
  const amount = calculated ?? 0;
  const newHp = effectType === 'damage'
    ? Math.max(0, currentHp - amount)
    : Math.min(maxHp, currentHp + amount);
  const actualChange = effectType === 'damage' ? currentHp - newHp : newHp - currentHp;
  const isLethal = effectType === 'damage' && calculated !== null && amount >= currentHp && currentHp > 0;
  const needDownedDecision = isLethal && !target.isPc;

  // HP 条颜色
  const newHpPercent = maxHp > 0 ? (newHp / maxHp) * 100 : 0;
  const getHpColor = (): string => {
    if (newHp <= 0) return 'bg-red-500';
    if (newHpPercent > 50) return 'bg-green-500';
    if (newHpPercent > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  const getChangeColor = (): string => newHp <= 0 ? 'bg-red-500' : getHpColor();

  // 确认施放
  const handleConfirmCast = () => {
    if (!selectedSpell || !rollResult) return;
    if (needDownedDecision && !downedStatus) return;
    const diceNums = effectDiceValues.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
    onCastResolved({
      spellName: selectedSpell.name,
      castingTime: selectedSpell.castingTime,
      success: rollResult.success,
      effectType,
      amount,
      newHp,
      status: needDownedDecision ? downedStatus! : undefined,
      checkType,
      d20Rolled: checkType === 'none' ? undefined : diceNums.length > 0 ? diceNums : [rollResult.d20],
      d20Final: rollResult.d20,
      d20Bonus: rollResult.bonus,
      d20Total: rollResult.total,
    });
    onClose();
  };

  // ============ 校验 ============
  const parsedDice = d20Values.map(v => parseInt(v, 10));
  const allFilled = isDual
    ? parsedDice.length === 2 && parsedDice.every(n => !isNaN(n) && n >= 1 && n <= 20)
    : parsedDice.length === 1 && !isNaN(parsedDice[0]) && parsedDice[0] >= 1 && parsedDice[0] <= 20;
  const canConfirmCheck = checkType === 'none'
    ? true
    : checkType === 'save'
    ? allFilled && targetSaveBonus !== '' && !isNaN(parseInt(targetSaveBonus, 10))
    : allFilled;
  const canCast = calculated !== null && (!needDownedDecision || downedStatus !== null);

  // ============ 渲染 ============
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-[90vw] max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <div className="flex items-center gap-2">
            {stage === 'cast' && (
              <button
                onClick={() => { setStage('list'); setRollResult(null); }}
                className="p-1 rounded hover:bg-white/10"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-bold dark:text-text-dark light:text-text-light">
              {stage === 'list' ? '法术施放' : selectedSpell?.name}
            </span>
            {spellAbilityLabel && stage === 'list' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {spellAbilityLabel} · 攻击 +{spellAttackBonus} · DC {spellSaveDC}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 施法者 / 目标 */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">施法者</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{caster.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="dark:text-text-dark-muted light:text-text-light-muted">目标</span>
              <span className="font-medium dark:text-text-dark light:text-text-light">{target.name}</span>
              {sameTeam ? (
                <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">友方</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-danger/10 text-danger">敌方</span>
              )}
            </div>
          </div>

          {/* 阶段 1：法术列表 */}
          {stage === 'list' && (
            <>
              {knownSpells.length === 0 ? (
                <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">
                  {character ? '角色卡未配置法术' : 'NPC 暂不支持施法'}
                </div>
              ) : (
                <div className="space-y-2">
                  {knownSpells
                    .slice()
                    .sort((a, b) => a.level - b.level || a.spell.name.localeCompare(b.spell.name))
                    .map(({ spell, level }) => (
                      <SpellCard
                        key={spell.id}
                        spell={spell}
                        level={level}
                        active={selectedSpell?.id === spell.id}
                        onPick={() => handlePickSpell(spell)}
                      />
                    ))}
                </div>
              )}
            </>
          )}

          {/* 阶段 2：施放 */}
          {stage === 'cast' && selectedSpell && (
            <>
              {/* 法术卡片（参考） */}
              <SpellCard spell={selectedSpell} level={selectedSpell.level} active onPick={() => {}} />

              {/* 检定方式选择 */}
              <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5">检定方式</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => handleCheckTypeChange('ac')}
                    disabled={spellAttackBonus === null}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      checkType === 'ac' ? 'bg-primary text-white ring-2 ring-primary' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
                    }`}
                  >
                    <div>AC 检定</div>
                    <div className="text-[10px] font-normal mt-0.5 opacity-80">d20+{spellAttackBonus ?? '-'} vs AC</div>
                  </button>
                  <button
                    onClick={() => handleCheckTypeChange('save')}
                    disabled={spellSaveDC === null}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      checkType === 'save' ? 'bg-primary text-white ring-2 ring-primary' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
                    }`}
                  >
                    <div>豁免检定</div>
                    <div className="text-[10px] font-normal mt-0.5 opacity-80">目标 d20 vs DC {spellSaveDC ?? '-'}</div>
                  </button>
                  <button
                    onClick={() => handleCheckTypeChange('none')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                      checkType === 'none' ? 'bg-primary text-white ring-2 ring-primary' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
                    }`}
                  >
                    <div>无检定</div>
                    <div className="text-[10px] font-normal mt-0.5 opacity-80">直接掷效果</div>
                  </button>
                </div>
              </div>

              {/* 豁免属性选择（save 场景） */}
              {checkType === 'save' && spellSaveDC !== null && (
                <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-amber-400 font-medium">目标豁免属性：</span>
                    {([
                      { key: 'str', label: '力量' }, { key: 'dex', label: '敏捷' }, { key: 'con', label: '体质' },
                      { key: 'int', label: '智力' }, { key: 'wis', label: '感知' }, { key: 'cha', label: '魅力' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setSaveAttribute(opt.key)}
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          saveAttribute === opt.key ? 'bg-amber-500 text-white' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-amber-500/20'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-amber-400/80 mt-1">提示：根据法术描述选择对应属性，由目标掷骰</div>
                </div>
              )}

              {/* 无检定场景：效果类型选择 */}
              {checkType === 'none' && (
                <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5">效果类型</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setEffectType('damage')}
                      disabled={sameTeam}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        effectType === 'damage' ? 'bg-danger text-white ring-2 ring-danger' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-danger/10'
                      }`}
                      title={sameTeam ? '友方不能骰伤害' : ''}
                    >
                      伤害
                    </button>
                    <button
                      onClick={() => setEffectType('heal')}
                      disabled={!sameTeam}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        effectType === 'heal' ? 'bg-green-500 text-white ring-2 ring-green-500' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-green-500/10'
                      }`}
                      title={!sameTeam ? '敌方不能骰治疗' : ''}
                    >
                      治疗
                    </button>
                  </div>
                  <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5">
                    {sameTeam ? '友方目标：仅可骰治疗' : '敌方目标：仅可骰伤害'}
                  </div>
                </div>
              )}

              {/* 检定阶段：d20 输入 */}
              {checkType !== 'none' && !rollResult && (
                <>
                  {/* 检定优劣势（手动 + 自动引擎） */}
                  <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">检定优劣势</span>
                      <AdvDisadvToggle
                        manualMode={manualMode}
                        onChange={(m) => {
                          setManualMode(m);
                          setD20Values(m === 'none' ? [''] : ['', '']);
                          setRollResult(null);
                          setLockedDice(new Set());
                        }}
                        mode={rollMode}
                        reasons={modeReasons}
                      />
                    </div>
                    {modeReasons.length > 0 && (
                      <div className={`mt-1.5 rounded p-1.5 text-xs flex items-start gap-1.5 ${
                        rollMode === 'advantage' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        <span className="font-medium shrink-0">{rollMode === 'advantage' ? '优势来源' : '劣势来源'}</span>
                        <span>{modeReasons.map(r => r.label).join('；')}</span>
                      </div>
                    )}
                  </div>

                  {/* d20 输入 */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
                        {checkType === 'save' ? '目标豁免骰 d20' : '法术攻击骰 d20'}{isDual ? '（双骰）' : ''}
                      </label>
                      {isDual && (
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          两次骰值取{rollMode === 'advantage' ? '高' : '低'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {d20Values.map((v, idx) => (
                        <div key={idx} className="flex-1">
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={v}
                            onChange={(e) => {
                              const next = [...d20Values];
                              next[idx] = e.target.value;
                              applyDiceValues(next);
                            }}
                            placeholder={lockedDice.has(idx) ? '已锁定' : '输入 1-20'}
                            readOnly={lockedDice.has(idx)}
                            className={`w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center ${lockedDice.has(idx) ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                        </div>
                      ))}
                      {checkType === 'save' && (
                        <div className="flex-1">
                          <input
                            type="number"
                            value={targetSaveBonus}
                            onChange={(e) => { setTargetSaveBonus(e.target.value); setRollResult(null); }}
                            placeholder={targetCharacter ? '目标豁免加值' : '目标无角色卡，请手填'}
                            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center"
                          />
                          {targetCharacter && (
                            <div className="text-[10px] text-center dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                              已从角色卡自动填入，可修改
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        onDoubleClick={handleRollD20}
                        className="px-3 py-2 rounded-lg bg-primary text-white flex items-center gap-1.5 hover:bg-primary/90 active:scale-90 transition-all shrink-0 select-none"
                        title="双击摇骰"
                      >
                        <Dices className="w-4 h-4" />
                        <span className="text-sm">摇骰</span>
                      </button>
                    </div>
                  </div>

                  {/* 确定检定按钮 */}
                  <button
                    onClick={handleConfirmCheck}
                    disabled={!canConfirmCheck}
                    className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    确定
                  </button>
                </>
              )}

              {/* 无检定场景：单独的「进入效果骰池」按钮 */}
              {checkType === 'none' && !rollResult && (
                <button
                  onClick={handleConfirmCheck}
                  className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                >
                  进入效果骰池
                </button>
              )}

              {/* 检定结果 */}
              {rollResult && (
                <div className="space-y-3 pt-2 border-t dark:border-border-dark light:border-border-light animate-in fade-in slide-in-from-bottom duration-200">
                  {/* 比对值 */}
                  <div className="text-center pt-2">
                    {checkType === 'none' ? (
                      <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">无检定 · 直接掷效果</span>
                    ) : checkType === 'save' ? (
                      <>
                        <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">施法 DC </span>
                        <span className="text-lg font-bold text-amber-400">{spellSaveDC}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">对方 AC </span>
                        <span className="text-lg font-bold text-danger">{effectiveTargetAc || 0}</span>
                      </>
                    )}
                  </div>

                  {/* 列式判定 */}
                  <div className={`rounded-lg p-4 text-center font-bold text-base ${
                    checkType === 'none'
                      ? 'bg-primary/10 text-primary'
                      : checkType === 'save'
                      ? (rollResult.isNatural20
                        ? 'bg-blue-500/15 text-blue-400'
                        : rollResult.isNatural1
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : rollResult.success
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : 'bg-blue-500/15 text-blue-400')
                      : (rollResult.isNatural1
                        ? 'bg-red-900/30 text-red-400'
                        : rollResult.isNatural20
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : rollResult.success
                        ? 'bg-green-500/15 text-green-500'
                        : 'bg-gray-500/15 text-gray-400')
                  }`}>
                    {checkType === 'none'
                      ? '准备掷效果骰'
                      : checkType === 'save'
                      ? (rollResult.isNatural20
                        ? '目标自然 20，完全抵抗！'
                        : rollResult.isNatural1
                        ? '目标自然 1，法术命中！'
                        : rollResult.success
                        ? '豁免失败，法术命中'
                        : '豁免成功，法术未命中')
                      : (rollResult.isNatural1
                        ? '自然 1，施法失败！'
                        : rollResult.isNatural20
                        ? '自然 20，法术命中！'
                        : rollResult.success
                        ? '攻击检定值≥AC，命中'
                        : '攻击检定值＜AC，未命中')}
                  </div>

                  {/* 检定失败：直接结束 */}
                  {!rollResult.success && (
                    <button
                      onClick={handleConfirmCast}
                      className="w-full py-2.5 rounded-lg bg-gray-500 text-white font-medium hover:bg-gray-600 transition-colors"
                    >
                      确认施法失败
                    </button>
                  )}
                </div>
              )}

              {/* 效果骰池阶段：检定成功或无检定 */}
              {rollResult?.success && (
                <div className="space-y-3 pt-2 border-t dark:border-border-dark light:border-border-light">
                  {/* 骰子表达式输入 */}
                  <div>
                    <label className="text-sm font-medium dark:text-text-dark light:text-text-light block mb-1.5">
                      {effectType === 'damage' ? '伤害' : '治疗'}骰表达式
                    </label>
                    <input
                      type="text"
                      value={diceExpr}
                      onChange={(e) => { setDiceExpr(e.target.value); setEffectDiceValues([]); setCalculated(null); setDownedStatus(null); }}
                      placeholder="如 8d6、2d8+3"
                      className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
                    />
                    {parsedEffect.count > 0 && (
                      <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                        解析为：{parsedEffect.count}d{parsedEffect.sides}{parsedEffect.bonus !== 0 && ` + ${parsedEffect.bonus}`}
                      </div>
                    )}
                  </div>

                  {/* 各骰子输入 */}
                  {parsedEffect.count > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
                          输入各 d{parsedEffect.sides} 结果
                        </label>
                        <button
                          onDoubleClick={handleRollEffectDice}
                          className="px-2.5 py-1 rounded-lg bg-primary text-white flex items-center gap-1 hover:bg-primary/90 active:scale-90 transition-all text-xs shrink-0 select-none"
                          title="双击摇骰"
                        >
                          <Dices className="w-3.5 h-3.5" />
                          <span>摇骰</span>
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {effectDiceValues.map((v, i) => (
                          <Fragment key={i}>
                            <input
                              type="number"
                              min={1}
                              max={parsedEffect.sides}
                              value={v}
                              onChange={(e) => updateEffectDie(i, e.target.value)}
                              placeholder={`d${parsedEffect.sides}`}
                              className="w-16 px-2 py-1.5 text-center rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary"
                            />
                            {i < effectDiceValues.length - 1 && <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>}
                          </Fragment>
                        ))}
                        {parsedEffect.bonus !== 0 && (
                          <>
                            {parsedEffect.count > 0 && <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>}
                            <span className="px-2 py-1.5 text-sm font-medium text-primary rounded-lg bg-primary/10">{parsedEffect.bonus}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 计算按钮 */}
                  <button
                    onClick={handleCalcEffect}
                    className="w-full py-2.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Calculator className="w-4 h-4" />
                    计算{effectType === 'damage' ? '伤害' : '治疗量'}
                  </button>

                  {/* 结果 */}
                  {calculated !== null && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom duration-200">
                      <div className="text-center pt-2">
                        <div className={`text-lg font-bold ${effectType === 'damage' ? 'text-danger' : 'text-green-500'}`}>{amount}</div>
                        <div className="text-sm dark:text-text-dark light:text-text-light mt-1">
                          <span className="font-medium">{caster.name}</span>
                          <span className="dark:text-text-dark-muted light:text-text-light-muted"> 对 </span>
                          <span className="font-medium">{target.name}</span>
                          <span className="dark:text-text-dark-muted light:text-text-light-muted">
                            {effectType === 'damage' ? ' 造成了 ' : ' 恢复了 '}
                          </span>
                          <span className={`font-bold ${effectType === 'damage' ? 'text-danger' : 'text-green-500'}`}>{amount}</span>
                          <span className="dark:text-text-dark-muted light:text-text-light-muted">
                            点{effectType === 'damage' ? '伤害' : '生命值'}
                          </span>
                        </div>
                      </div>

                      {/* HP 影响 */}
                      <div className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-3">
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="dark:text-text-dark-muted light:text-text-light-muted">{target.name} HP</span>
                          <span className="font-medium dark:text-text-dark light:text-text-light">
                            {currentHp} → {newHp}
                            {actualChange > 0 && (
                              <span className={`ml-1 ${effectType === 'damage' ? 'text-danger' : 'text-green-500'}`}>
                                {effectType === 'damage' ? '-' : '+'}{actualChange}
                              </span>
                            )}
                          </span>
                        </div>
                        {maxHp > 0 && (
                          <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
                            <div className={`h-full ${getHpColor()} transition-all`} style={{ width: `${(newHp / maxHp) * 100}%` }} />
                            <div className={`h-full ${getChangeColor()} opacity-40 transition-all`} style={{ width: `${(actualChange / maxHp) * 100}%` }} />
                          </div>
                        )}
                        <div className="flex justify-between text-xs mt-1">
                          <span className="dark:text-text-dark-muted light:text-text-light-muted">最大 {maxHp}</span>
                          {newHp <= 0 && <span className="text-red-500 font-medium">已倒下</span>}
                        </div>
                      </div>

                      {/* NPC 致命伤害状态决定 */}
                      {needDownedDecision && (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                          <div className="text-sm font-medium text-amber-400">该 NPC 已倒下，请决定其状态</div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setDownedStatus('unconscious')}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                downedStatus === 'unconscious' ? 'bg-amber-500 text-white ring-2 ring-amber-400' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-amber-500/10'
                              }`}
                            >
                              昏迷
                            </button>
                            <button
                              onClick={() => setDownedStatus('dead')}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                downedStatus === 'dead' ? 'bg-red-500 text-white ring-2 ring-red-400' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-red-500/10'
                              }`}
                            >
                              死亡
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 确认施放 */}
                      <button
                        onClick={handleConfirmCast}
                        disabled={!canCast}
                        className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                          !canCast ? 'bg-gray-400/60 text-white/70 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90'
                        }`}
                      >
                        {needDownedDecision && !downedStatus ? '请先决定状态' : `确认${effectType === 'damage' ? '伤害' : '治疗'}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
