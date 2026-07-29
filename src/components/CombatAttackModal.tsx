// 战斗攻击检定弹窗 —— 从沙盘战斗按钮触发
import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import { X, Swords, Dices, ChevronLeft, MoreHorizontal, BookOpen } from 'lucide-react';
import { rollDice } from '@/data/diceService';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import type { Combatant, NpcAttack } from '@/types/combat';
import type { Character, Attack } from '@/types/character';
import type { Spell } from '@/types/spell';

interface Props {
  attacker: Combatant;
  target: Combatant;
  onClose: () => void;
  // 攻击者与目标在沙盘上的格子坐标（从 tokenMap 获取）
  attackerPos?: { col: number; row: number };
  targetPos?: { col: number; row: number };
  /** 命中确认：交由 main 切换至伤害弹窗，附带 d20 过程信息用于先攻表格记录 */
  onConfirmHit?: (attack: Attack | NpcAttack, info: {
    d20Rolled: number[];      // 实际投掷的骰子序列（普通模式 1 个，优/劣势 2 个）
    d20Final: number;         // 最终取用的 d20
    bonus: number;            // 攻击加值
    total: number;            // d20Final + bonus
    disadvantage: boolean;    // 检定是否处于劣势
    isNatural1: boolean;      // 自然 1
    isNatural20: boolean;     // 自然 20（重击）
    usageMode?: 'melee' | 'thrown';
  }) => void;
  /** 攻击未命中：回传主，写入先攻表格 */
  onAttackMiss?: (info: {
    attackName: string;
    d20Rolled: number[];
    d20Final: number;
    bonus: number;
    total: number;
    isNatural1: boolean;
    usageMode?: 'melee' | 'thrown';
  }) => void;
}

// 射程等级：用于判断投掷武器的标签
type RangeTier = 'melee' | 'normal' | 'max' | 'outOfRange';

type Stage = 'attacks' | 'roll';

// 法术描述中的骰子表达式高亮渲染（复用 CharacterDetail 的逻辑）
function renderSpellDice(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\d+)d(4|6|8|10|12|20)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={key++} className="inline-flex items-baseline mx-0.5">
        <span className="text-primary font-bold">{match[1]}</span>
        <span className="px-1 py-0 mx-0.5 rounded bg-accent/20 text-accent font-mono font-semibold">
          d{match[2]}
        </span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }
  return parts;
}

export default function CombatAttackModal({ attacker, target, onClose, attackerPos, targetPos, onConfirmHit, onAttackMiss }: Props) {
  const [stage, setStage] = useState<Stage>('attacks');
  const [selectedAttack, setSelectedAttack] = useState<Attack | NpcAttack | null>(null);
  // d20 投掷值：普通模式长度 1，优/劣势模式长度 2
  const [d20Values, setD20Values] = useState<string[]>(['']);
  const [rollResult, setRollResult] = useState<{ d20: number; bonus: number; total: number; isNatural1: boolean; isNatural20: boolean; hit: boolean; disadvantage: boolean } | null>(null);
  // 手动决定的检定模式（与自动检测的优劣势合并；优势/劣势互斥）
  const [manualMode, setManualMode] = useState<'none' | 'advantage' | 'disadvantage'>('none');
  const [showAdvDisadvMenu, setShowAdvDisadvMenu] = useState(false);
  // 投掷武器的使用方式：近战 / 投掷（选择攻击方式后确定）
  const [usageMode, setUsageMode] = useState<UsageMode | null>(null);
  // 当前展开使用方式选择的攻击索引（投掷武器专用）
  const [expandedThrownIdx, setExpandedThrownIdx] = useState<number | null>(null);
  // 自然 20 触发时被锁定的骰子索引（另一个空未填则锁定只读）
  const [lockedDice, setLockedDice] = useState<Set<number>>(new Set());
  // 检定场景：武器攻击 / 法术攻击 / 目标豁免 / 自动命中
  const [checkScene, setCheckScene] = useState<'weapon' | 'spellAttack' | 'savingThrow' | 'autoHit'>('weapon');
  // 法术速查面板开关
  const [showSpellReference, setShowSpellReference] = useState(false);
  // 目标豁免属性（savingThrow 场景下由用户选择）
  const [saveAttribute, setSaveAttribute] = useState<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>('dex');
  // 目标豁免加值（savingThrow 场景下手动填，由目标的属性调整值 + 熟练加值构成）
  const [targetSaveBonus, setTargetSaveBonus] = useState<string>('');

  // 获取 PC 的角色卡数据（NPC 无 character）
  const character = useMemo(() => {
    if (attacker.characterId) return characterStore.get(attacker.characterId);
    return null;
  }, [attacker.characterId]);

  // 施法派生数据：仅施法者有值（NPC 暂不支持施法速查）
  const isSpellcaster = character ? characterStore.hasSpellcasting(character) : false;
  const spellAbilityKey = character ? characterStore.getSpellcastingAbility(character) : null;
  const spellAbilityLabel = spellAbilityKey
    ? ({ strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力' } as const)[spellAbilityKey]
    : null;
  const spellAttackBonus = character ? characterStore.getSpellAttackBonus(character) : null;
  const spellSaveDC = character ? characterStore.getSpellSaveDC(character) : null;

  // 法术速查：从角色卡 spells.cantrips/custom 按名称反查 spellStore
  const knownSpells = useMemo<{ spell: Spell; isCantrip: boolean; level: number }[]>(() => {
    if (!character) return [];
    const all = spellStore.getAll();
    const byName = (name: string) => all.find(s => s.name === name);
    const result: { spell: Spell; isCantrip: boolean; level: number }[] = [];
    (character.spells?.cantrips || []).forEach(name => {
      const s = byName(name);
      if (s) result.push({ spell: s, isCantrip: true, level: 0 });
    });
    (character.spells?.custom || []).forEach(name => {
      const s = byName(name);
      if (s) result.push({ spell: s, isCantrip: s.level === 0, level: s.level });
    });
    return result;
  }, [character]);

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
  // usageMode: 投掷武器的使用方式（近战/投掷）；纯远程或纯近战武器忽略此参数
  type UsageMode = 'melee' | 'thrown';
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

  // 投掷武器在选定使用方式下的射程段列表
  const getRangeInfo = (attack: Attack | NpcAttack, usageMode?: UsageMode): { label: string; value: string; feet: number }[] => {
    const ranges: { label: string; value: string; feet: number }[] = [];
    const meleeRange = attack.range;
    const hasNormal = attack.normalRange !== undefined && attack.normalRange > 0;
    const hasMax = attack.maxRange !== undefined && attack.maxRange > 0;
    const isRanged = isRangedWeapon(attack);
    const isThrown = isThrownWeapon(attack);

    // 近战射程段：纯近战 / 投掷武器选近战模式 / 投掷武器未指定模式（卡片预览用）
    if (meleeRange && !meleeRange.startsWith('-') && (!isRanged || isThrown)) {
      const meleeMatch = meleeRange.match(/(\d+)/);
      const meleeFeet = meleeMatch ? parseInt(meleeMatch[1], 10) : 5;
      ranges.push({ label: '近战', value: meleeRange, feet: meleeFeet });
    }
    // 投掷射程段：纯远程 / 投掷武器选投掷模式 / 投掷武器未指定模式
    if (hasNormal && (isRanged && !isThrown || (isThrown && (usageMode === undefined || usageMode === 'thrown')))) {
      ranges.push({ label: '常规', value: `${attack.normalRange}尺`, feet: attack.normalRange });
    }
    if (hasMax && (isRanged && !isThrown || (isThrown && (usageMode === undefined || usageMode === 'thrown')))) {
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
  const getRangeTier = (attack: Attack | NpcAttack, usageMode?: UsageMode): RangeTier => {
    const ranges = getRangeInfo(attack, usageMode);
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
  const getAttackStatus = (attack: Attack | NpcAttack, usageMode?: UsageMode): { usable: boolean; reason?: string } => {
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
      const tier = getRangeTier(attack, usageMode);
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
  // usageMode 决定投掷武器按近战还是投掷规则判定
  const getAttackAdvantageDisadvantage = (attack: Attack | NpcAttack, usageMode?: UsageMode): { advantage: string[]; disadvantage: string[] } => {
    const advantage: string[] = [];
    const disadvantage: string[] = [];
    const thrown = isThrownWeapon(attack);
    // 当前是否按远程规则判定：
    // - 纯远程武器（非投掷）→ 永远按远程
    // - 投掷武器选投掷模式 → 按远程
    // - 投掷武器选近战模式 / 未指定模式 → 按近战
    const rangedOnly = isRangedWeapon(attack) && !thrown;
    const treatAsRanged = rangedOnly || (thrown && usageMode === 'thrown');

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

    // —— 劣势：从 5 尺距离发动远程攻击（远程/投掷模式下且目标相邻 = 1 格 = 5 尺）——
    if (treatAsRanged && attackerPos && targetPos && distanceCells === 1) {
      disadvantage.push('从 5 尺距离发动远程攻击');
    }

    // —— 劣势：投掷武器处于最大射程段（投掷模式下且目标在最大射程段）——
    if (thrown && usageMode === 'thrown' && attackerPos && targetPos && getRangeTier(attack, usageMode) === 'max') {
      disadvantage.push('投掷武器处于最大射程段');
    }

    return { advantage, disadvantage };
  };

  // 最终检定模式：手动优先，否则自动检测（优劣势互相抵消）
  const computeRollMode = (attack: Attack | NpcAttack, usageMode?: UsageMode): 'none' | 'advantage' | 'disadvantage' => {
    if (manualMode !== 'none') return manualMode;
    const { advantage, disadvantage } = getAttackAdvantageDisadvantage(attack, usageMode);
    // D&D 5e：同时存在优劣势则互相抵消
    if (advantage.length > 0 && disadvantage.length > 0) return 'none';
    if (advantage.length > 0) return 'advantage';
    if (disadvantage.length > 0) return 'disadvantage';
    return 'none';
  };

  // 获取当前模式下的原因列表（用于展示效果来源）
  const getRollModeReasons = (attack: Attack | NpcAttack, mode: 'none' | 'advantage' | 'disadvantage', usageMode?: UsageMode): string[] => {
    if (mode === 'none') return [];
    const { advantage, disadvantage } = getAttackAdvantageDisadvantage(attack, usageMode);
    if (mode === 'advantage') return manualMode === 'advantage' ? ['手动指定'] : advantage;
    return manualMode === 'disadvantage' ? ['手动指定'] : disadvantage;
  };

  // 为投掷武器选择默认使用方式：
  // 优先无劣势 > 优势 > 劣势最少；打平则近战在上
  const pickDefaultUsageMode = (attack: Attack | NpcAttack): UsageMode => {
    const meleeMode = computeRollMode(attack, 'melee');
    const thrownMode = computeRollMode(attack, 'thrown');
    const meleeBad = meleeMode === 'disadvantage';
    const thrownBad = thrownMode === 'disadvantage';
    const meleeGood = meleeMode === 'advantage';
    const thrownGood = thrownMode === 'advantage';
    // 任一可用性为不可用也参与比较（不在射程内的模式劣后）
    const meleeUsable = getAttackStatus(attack, 'melee').usable;
    const thrownUsable = getAttackStatus(attack, 'thrown').usable;
    if (meleeUsable && !thrownUsable) return 'melee';
    if (thrownUsable && !meleeUsable) return 'thrown';
    if (!meleeUsable && !thrownUsable) return 'melee'; // 都不可用，默认近战展示
    // 两者都可用，比较优劣势
    if (!meleeBad && thrownBad) return 'melee';
    if (meleeBad && !thrownBad) return 'thrown';
    if (meleeGood && !thrownGood) return 'melee';
    if (thrownGood && !meleeGood) return 'thrown';
    return 'melee'; // 打平：近战在上
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

  // 从法术速查直接施放：构造临时 Attack 作为容器进入 roll 阶段
  // 伤害与加值由检定场景切换器接管，不依赖法术描述解析
  const handleCastSpell = (spell: Spell) => {
    const fakeAttack: Attack = {
      name: spell.name,
      attackBonus: spellAttackBonus !== null ? `+${spellAttackBonus}` : '+0',
      damage: '',
      damageType: '',
      range: spell.range || '',
      properties: [],
    };
    setSelectedAttack(fakeAttack);
    setUsageMode(null);
    setD20Values(['']);
    setRollResult(null);
    setLockedDice(new Set());
    setManualMode('none');
    setShowAdvDisadvMenu(false);
    setShowSpellReference(false);
    // 默认法术攻击场景，用户可切到目标豁免 / 自动命中
    setCheckScene(spellAttackBonus !== null ? 'spellAttack' : 'autoHit');
    setStage('roll');
  };

  // 应用骰子值变化：优势/劣势下任一骰为自然 20 时直接命中，另一个空锁定只读
  // 适用于手动输入与摇骰两条路径。仅 weapon / spellAttack 场景启用即时命中；
  // savingThrow 场景的目标自然 20 是「抵抗」语义反转，不在此即时判定
  const applyDiceValues = (newValues: string[]) => {
    setD20Values(newValues);
    if (!selectedAttack) {
      setRollResult(null);
      setLockedDice(new Set());
      return;
    }
    // autoHit 场景：不需要 d20，直接出命中结果
    if (checkScene === 'autoHit') {
      setLockedDice(new Set());
      const bonus = getAttackBonus(selectedAttack);
      setRollResult({
        d20: 0,
        bonus,
        total: bonus,
        isNatural1: false,
        isNatural20: false,
        hit: true,
        disadvantage: false,
      });
      return;
    }
    // savingThrow 场景：等待用户填完目标豁免加值后点「确定」
    if (checkScene === 'savingThrow') {
      setLockedDice(new Set());
      setRollResult(null);
      return;
    }
    // weapon / spellAttack 场景：保留自然 20 即时命中逻辑
    const mode = computeRollMode(selectedAttack, usageMode ?? undefined);
    if (mode !== 'none') {
      // 任一骰为自然 20：无论另一骰是否填完或是否为自然 1，均直接命中
      const idx20 = newValues.findIndex(v => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n === 20;
      });
      if (idx20 !== -1) {
        const otherIdx = idx20 === 0 ? 1 : 0;
        const otherVal = newValues[otherIdx];
        const otherEmpty = otherVal === '' || otherVal === undefined;
        // 另一个空未填则锁定只读
        setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
        const bonus = checkScene === 'spellAttack' ? (spellAttackBonus ?? 0) : getAttackBonus(selectedAttack);
        setRollResult({
          d20: 20,
          bonus,
          total: 20 + bonus,
          isNatural1: false,
          isNatural20: true,
          hit: true,
          disadvantage: mode === 'disadvantage',
        });
        return;
      }
    }
    setLockedDice(new Set());
    setRollResult(null);
  };

  // 骰子摇数：普通模式摇 1 个，优/劣势模式摇 2 个
  const handleRollDice = (mode: 'none' | 'advantage' | 'disadvantage') => {
    const count = mode === 'none' ? 1 : 2;
    const result = rollDice({ sides: 20, count, mode: 'independent' });
    applyDiceValues(result.values.map(String));
  };

  // 切换检定场景：清空状态重新开始
  const handleSceneChange = (scene: 'weapon' | 'spellAttack' | 'savingThrow' | 'autoHit') => {
    setCheckScene(scene);
    setD20Values(['']);
    setRollResult(null);
    setLockedDice(new Set());
    setTargetSaveBonus('');
  };

  // 确定检定 —— 不切换阶段，结果在下方原位弹出
  const handleConfirmRoll = () => {
    if (!selectedAttack) return;
    const mode = computeRollMode(selectedAttack, usageMode ?? undefined);

    // autoHit 场景：无检定，直接命中
    if (checkScene === 'autoHit') {
      const bonus = getAttackBonus(selectedAttack);
      setRollResult({
        d20: 0,
        bonus,
        total: bonus,
        isNatural1: false,
        isNatural20: false,
        hit: true,
        disadvantage: false,
      });
      return;
    }

    // savingThrow 场景：目标掷 d20 + 豁免加值 vs 施法 DC
    // 自然 20 = 抵抗（未命中），自然 1 = 失败（命中），语义与攻击检定相反
    if (checkScene === 'savingThrow') {
      if (spellSaveDC === null) return;
      const parsed = d20Values.map(v => parseInt(v, 10));
      const allValid = parsed.every(n => !isNaN(n) && n >= 1 && n <= 20);
      if (!allValid) return;
      if (mode !== 'none' && parsed.length < 2) return;
      const saveBonusNum = parseInt(targetSaveBonus, 10);
      const bonus = isNaN(saveBonusNum) ? 0 : saveBonusNum;
      const hasNatural20 = mode !== 'none' && parsed.some(n => n === 20);
      const hasNatural1 = mode !== 'none' && parsed.some(n => n === 1);
      let d20: number;
      let isNatural1: boolean;
      let isNatural20: boolean;
      let hit: boolean;
      if (hasNatural20) {
        // 目标自然 20 → 抵抗 → 未命中
        d20 = 20;
        isNatural1 = false;
        isNatural20 = true;
        hit = false;
      } else if (hasNatural1) {
        // 目标自然 1 → 失败 → 命中
        d20 = 1;
        isNatural1 = true;
        isNatural20 = false;
        hit = true;
      } else {
        // 优势取高（对目标有利=抵抗）、劣势取低（对目标不利=命中）
        d20 = mode === 'advantage' ? Math.max(...parsed) : mode === 'disadvantage' ? Math.min(...parsed) : parsed[0];
        isNatural1 = d20 === 1;
        isNatural20 = d20 === 20;
        const saveTotal = d20 + bonus;
        // 豁免总值 ≥ DC = 抵抗（未命中）；< DC = 失败（命中）
        hit = isNatural20 ? false : isNatural1 ? true : saveTotal < spellSaveDC;
      }
      const total = d20 + bonus;
      setRollResult({ d20, bonus, total, isNatural1, isNatural20, hit, disadvantage: mode === 'disadvantage' });
      return;
    }

    // weapon / spellAttack 场景：d20 + 攻击加值 vs 目标 AC
    const parsed = d20Values.map(v => parseInt(v, 10));
    const allValid = parsed.every(n => !isNaN(n) && n >= 1 && n <= 20);
    if (!allValid) return;
    if (mode !== 'none' && parsed.length < 2) return;

    const bonus = checkScene === 'spellAttack' ? (spellAttackBonus ?? 0) : getAttackBonus(selectedAttack);
    // 优势/劣势下任一骰为自然 20：直接命中（优先于自然 1 与取高/低规则）
    const hasNatural20 = mode !== 'none' && parsed.some(n => n === 20);
    let d20: number;
    let isNatural1: boolean;
    let isNatural20: boolean;
    let hit: boolean;
    if (hasNatural20) {
      d20 = 20;
      isNatural1 = false;
      isNatural20 = true;
      hit = true;
    } else {
      // 取较高（优势）/ 较低（劣势）/ 唯一（普通）
      d20 = mode === 'advantage' ? Math.max(...parsed) : mode === 'disadvantage' ? Math.min(...parsed) : parsed[0];
      isNatural1 = d20 === 1;
      isNatural20 = d20 === 20;
      const targetAc = target.ac || 0;
      hit = isNatural20 ? true : isNatural1 ? false : d20 + bonus >= targetAc;
    }
    const total = d20 + bonus;
    setRollResult({ d20, bonus, total, isNatural1, isNatural20, hit, disadvantage: mode === 'disadvantage' });
  };

  // 确认结果
  const handleConfirmResult = () => {
    if (!rollResult || !selectedAttack) return;
    const d20RolledNums = d20Values.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
    const infoBase = {
      d20Rolled: d20RolledNums.length > 0 ? d20RolledNums : [rollResult.d20],
      d20Final: rollResult.d20,
      bonus: rollResult.bonus,
      total: rollResult.total,
      isNatural1: rollResult.isNatural1,
      usageMode: usageMode ?? undefined,
    };
    if (rollResult.hit) {
      if (onConfirmHit) {
        onConfirmHit(selectedAttack, {
          ...infoBase,
          disadvantage: rollResult.disadvantage,
          isNatural20: rollResult.isNatural20,
        });
      } else {
        onClose();
      }
    } else {
      // 未命中：调用 onAttackMiss 回传主以写入先攻表格
      if (onAttackMiss) {
        onAttackMiss({
          attackName: selectedAttack.name,
          ...infoBase,
        });
      }
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
                  setLockedDice(new Set());
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
              {/* 施法者专属：法术速查入口 */}
              {isSpellcaster && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <button
                    onClick={() => setShowSpellReference(v => !v)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm dark:text-text-dark light:text-text-light">施法速查</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {spellAbilityLabel} · 攻击 +{spellAttackBonus} · DC {spellSaveDC}
                      </span>
                    </div>
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      {showSpellReference ? '收起' : '展开'}（{knownSpells.length}）
                    </span>
                  </button>
                  {showSpellReference && (
                    <div className="mt-3 pt-3 border-t dark:border-border-dark/50 light:border-border-light/50 space-y-2 max-h-72 overflow-y-auto">
                      {knownSpells.length === 0 && (
                        <div className="text-center text-xs dark:text-text-dark-muted light:text-text-light-muted py-4">
                          角色卡未配置法术
                        </div>
                      )}
                      {knownSpells
                        .slice()
                        .sort((a, b) => a.level - b.level || a.spell.name.localeCompare(b.spell.name))
                        .map(({ spell, isCantrip: _isCantrip, level }) => (
                          <div
                            key={spell.id}
                            className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-2.5 border dark:border-border-dark/50 light:border-border-light/50"
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
                              <div className="text-[11px] mt-1 text-purple-400">
                                <span className="font-medium">升环：</span>{spell.heightenedEffect}
                              </div>
                            )}
                            <button
                              onClick={() => handleCastSpell(spell)}
                              className="w-full mt-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                            >
                              施放此法术 → 进入检定
                            </button>
                          </div>
                        ))}
                      <div className="text-[10px] text-center dark:text-text-dark-muted light:text-text-light-muted pt-1">
                        提示：看法术后选择对应攻击方式进入检定，可在 roll 阶段切换为「法术攻击 / 目标豁免 / 自动命中」
                      </div>
                    </div>
                  )}
                </div>
              )}
              {sortedAttacks.length === 0 && !isSpellcaster && (
                <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">
                  暂无攻击方式
                </div>
              )}
              {sortedAttacks.length === 0 && isSpellcaster && !showSpellReference && (
                <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">
                  暂无武器攻击，可点击上方「施法速查」查看法术
                </div>
              )}
              {sortedAttacks.map((attack, i) => {
                const thrown = isThrownWeapon(attack);
                // 投掷武器：展开后用已选模式判定；未展开用默认模式预览
                const isExpanded = expandedThrownIdx === i;
                const previewMode: UsageMode | undefined = thrown
                  ? (isExpanded && usageMode ? usageMode : pickDefaultUsageMode(attack))
                  : undefined;
                const status = getAttackStatus(attack, previewMode);
                // 投掷模式标签：仅在投掷模式下且非常规近战时显示
                const tier = attackerPos && targetPos ? getRangeTier(attack, previewMode) : 'melee';
                const showThrownTag = thrown && previewMode === 'thrown';
                // 优势/劣势标签（基于预览模式）
                const { advantage: advReasons, disadvantage: disadvReasons } = getAttackAdvantageDisadvantage(attack, previewMode);
                const hasAdv = advReasons.length > 0;
                const hasDisadv = disadvReasons.length > 0;
                const handleEnterRoll = (mode?: UsageMode) => {
                  if (!status.usable) return;
                  setSelectedAttack(attack);
                  setUsageMode(mode ?? null);
                  const { advantage: a, disadvantage: d } = getAttackAdvantageDisadvantage(attack, mode);
                  const autoMode = (a.length > 0 && d.length > 0) ? 'none' : (a.length > 0 ? 'advantage' : (d.length > 0 ? 'disadvantage' : 'none'));
                  setD20Values(autoMode === 'none' ? [''] : ['', '']);
                  setRollResult(null);
                  setLockedDice(new Set());
                  setManualMode('none');
                  setShowAdvDisadvMenu(false);
                  setCheckScene('weapon');
                  setStage('roll');
                };
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
                      // 投掷武器：展开使用方式选择，不直接跳转
                      if (thrown && expandedThrownIdx !== i) {
                        setExpandedThrownIdx(i);
                        setUsageMode(pickDefaultUsageMode(attack));
                        return;
                      }
                      // 非投掷武器或已展开的投掷武器：直接进入（投掷武器用当前 usageMode）
                      handleEnterRoll(thrown ? (usageMode ?? previewMode) : undefined);
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
                          {thrown && previewMode === 'melee' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">近战</span>
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

                    {/* 投掷武器：展开的使用方式选择 */}
                    {thrown && isExpanded && (() => {
                      const meleeStatus = getAttackStatus(attack, 'melee');
                      const thrownStatus = getAttackStatus(attack, 'thrown');
                      const meleeMode = computeRollMode(attack, 'melee');
                      const thrownMode = computeRollMode(attack, 'thrown');
                      const cur = usageMode ?? previewMode ?? 'melee';
                      return (
                        <div className="mt-3 pt-3 border-t dark:border-border-dark/50 light:border-border-light/50" onClick={(e) => e.stopPropagation()}>
                          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-2">选择使用方式</div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setUsageMode('melee')}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                cur === 'melee'
                                  ? 'bg-primary text-white ring-2 ring-primary'
                                  : meleeStatus.usable
                                  ? 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
                                  : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted opacity-50'
                              }`}
                            >
                              <div>近战</div>
                              <div className="text-[10px] font-normal mt-0.5 opacity-80">
                                {meleeStatus.usable
                                  ? (meleeMode === 'advantage' ? '检定优势' : meleeMode === 'disadvantage' ? '检定劣势' : '正常')
                                  : (meleeStatus.reason || '不可用')}
                              </div>
                            </button>
                            <button
                              onClick={() => setUsageMode('thrown')}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                cur === 'thrown'
                                  ? 'bg-primary text-white ring-2 ring-primary'
                                  : thrownStatus.usable
                                  ? 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
                                  : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark-muted light:text-text-light-muted opacity-50'
                              }`}
                            >
                              <div>投掷</div>
                              <div className="text-[10px] font-normal mt-0.5 opacity-80">
                                {thrownStatus.usable
                                  ? (thrownMode === 'advantage' ? '检定优势' : thrownMode === 'disadvantage' ? '检定劣势' : '正常')
                                  : (thrownStatus.reason || '不可用')}
                              </div>
                            </button>
                          </div>
                          {/* 当前模式下的效果来源 */}
                          {(() => {
                            const m = cur === 'melee' ? meleeMode : thrownMode;
                            if (m === 'none') return null;
                            const reasons = getRollModeReasons(attack, m, cur);
                            if (reasons.length === 0) return null;
                            return (
                              <div className={`mt-2 text-xs ${m === 'advantage' ? 'text-green-400' : 'text-amber-400'}`}>
                                {m === 'advantage' ? '优势' : '劣势'}来源：{reasons.join('；')}
                              </div>
                            );
                          })()}
                          {/* 确认进入检定按钮：仅当选定模式可用时启用 */}
                          <button
                            onClick={() => handleEnterRoll(cur)}
                            disabled={!(cur === 'melee' ? meleeStatus.usable : thrownStatus.usable)}
                            className="w-full mt-3 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            确认使用{(cur === 'melee' ? '近战' : '投掷')}方式攻击
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          {/* 阶段2：攻击检定（含下方检定结果） */}
          {stage === 'roll' && selectedAttack && (() => {
            const thrown = isThrownWeapon(selectedAttack);
            const tier = attackerPos && targetPos ? getRangeTier(selectedAttack, usageMode ?? undefined) : 'melee';
            const showThrownTag = thrown && usageMode === 'thrown';
            const showMeleeTag = thrown && usageMode === 'melee';
            const rollMode = computeRollMode(selectedAttack, usageMode ?? undefined);
            const modeReasons = getRollModeReasons(selectedAttack, rollMode, usageMode ?? undefined);
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
                  {showMeleeTag && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">近战</span>
                  )}
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
                  {checkScene === 'spellAttack'
                    ? `法术攻击 +${spellAttackBonus ?? 0}（${spellAbilityLabel}）`
                    : checkScene === 'savingThrow'
                    ? `施法 DC ${spellSaveDC ?? '-'}（${spellAbilityLabel}）`
                    : checkScene === 'autoHit'
                    ? '自动命中 · 无需检定'
                    : `攻击加值 ${selectedAttack.attackBonus || '+0'}`}
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
                        setLockedDice(new Set());
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
                        setLockedDice(new Set());
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
                        setLockedDice(new Set());
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

              {/* 检定场景切换器：施法者可切到法术攻击 / 目标豁免 / 自动命中 */}
              {isSpellcaster && (
                <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
                  <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5">检定场景</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { key: 'weapon', label: '武器攻击', desc: 'd20+加值 vs AC' },
                      { key: 'spellAttack', label: '法术攻击', desc: `d20+${spellAttackBonus ?? 0} vs AC` },
                      { key: 'savingThrow', label: '目标豁免', desc: `目标 d20 vs DC ${spellSaveDC ?? '-'}` },
                      { key: 'autoHit', label: '自动命中', desc: '无检定' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => handleSceneChange(opt.key)}
                        disabled={opt.key !== 'weapon' && opt.key !== 'autoHit' && (opt.key === 'spellAttack' ? spellAttackBonus === null : opt.key === 'savingThrow' ? spellSaveDC === null : false)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                          checkScene === opt.key
                            ? 'bg-primary text-white ring-2 ring-primary'
                            : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        <div>{opt.label}</div>
                        <div className="text-[10px] font-normal mt-0.5 opacity-80">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 目标豁免属性选择（仅 savingThrow 场景） */}
              {checkScene === 'savingThrow' && spellSaveDC !== null && (
                <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-amber-400 font-medium">目标豁免属性：</span>
                    {([
                      { key: 'str', label: '力量' },
                      { key: 'dex', label: '敏捷' },
                      { key: 'con', label: '体质' },
                      { key: 'int', label: '智力' },
                      { key: 'wis', label: '感知' },
                      { key: 'cha', label: '魅力' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setSaveAttribute(opt.key)}
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          saveAttribute === opt.key
                            ? 'bg-amber-500 text-white'
                            : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-amber-500/20'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-amber-400/80 mt-1">提示：根据法术描述选择对应属性，由目标掷骰</div>
                </div>
              )}

              {/* d20 输入：普通模式 1 个，优/劣势模式 2 个；autoHit 场景隐藏 */}
              {checkScene !== 'autoHit' && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium dark:text-text-dark light:text-text-light">
                    {checkScene === 'savingThrow' ? '目标豁免骰 d20' : 'd20 攻击骰'}{isDual ? '（双骰）' : ''}
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
                          const newValues = [...d20Values];
                          newValues[idx] = e.target.value;
                          applyDiceValues(newValues);
                        }}
                        placeholder={lockedDice.has(idx) ? '已锁定（自然 20）' : '输入 1-20'}
                        readOnly={lockedDice.has(idx)}
                        className={`w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center ${
                          lockedDice.has(idx) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                  ))}
                  {checkScene === 'savingThrow' ? (
                    <div className="flex-1">
                      <input
                        type="number"
                        value={targetSaveBonus}
                        onChange={(e) => {
                          setTargetSaveBonus(e.target.value);
                          setRollResult(null);
                        }}
                        placeholder="目标豁免加值"
                        className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center"
                      />
                    </div>
                  ) : null}
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
              )}

              {/* 计算预览：根据场景显示不同加值与比对值 */}
              {checkScene !== 'autoHit' && previewD20 !== null && (() => {
                const sceneBonus = checkScene === 'spellAttack'
                  ? (spellAttackBonus ?? 0)
                  : checkScene === 'savingThrow'
                  ? (parseInt(targetSaveBonus, 10) || 0)
                  : getAttackBonus(selectedAttack);
                const compareLabel = checkScene === 'savingThrow' ? 'DC' : 'AC';
                const compareValue = checkScene === 'savingThrow' ? (spellSaveDC ?? 0) : (target.ac || 0);
                return (
                  <div className="rounded-lg dark:bg-bg-dark light:bg-bg-light-2 p-3 text-center">
                    <div className="flex items-center justify-center gap-2 text-lg font-bold flex-wrap">
                      {isDual && (
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          ({parsedDice.join(rollMode === 'advantage' ? ' → 取高 → ' : ' → 取低 → ')})
                        </span>
                      )}
                      <span className="dark:text-text-dark light:text-text-light">{previewD20}</span>
                      <span className="dark:text-text-dark-muted light:text-text-light-muted">+</span>
                      <span className="text-primary">{sceneBonus}</span>
                      <span className="dark:text-text-dark-muted light:text-text-light-muted">=</span>
                      <span className={checkScene === 'savingThrow' ? 'text-amber-400' : 'text-danger'}>{previewD20 + sceneBonus}</span>
                      <span className="dark:text-text-dark-muted light:text-text-light-muted text-sm">vs {compareLabel} {compareValue}</span>
                    </div>
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-1">
                      {checkScene === 'savingThrow' ? '目标豁免总值' : '攻击检定值'}
                    </div>
                  </div>
                );
              })()}

              {/* autoHit 场景提示 */}
              {checkScene === 'autoHit' && !rollResult && (
                <div className="rounded-lg bg-yellow-500/10 text-yellow-500 p-3 text-center text-sm">
                  此法术自动命中，无需检定。点击「确定」进入伤害结算。
                </div>
              )}

              {/* 确定按钮：autoHit 场景恒可点；savingThrow 需 d20 + 豁免加值都填 */}
              {(() => {
                const sceneCanConfirm = checkScene === 'autoHit'
                  ? true
                  : checkScene === 'savingThrow'
                  ? allFilled && targetSaveBonus !== '' && !isNaN(parseInt(targetSaveBonus, 10))
                  : allFilled;
                return (
                  <button
                    onClick={handleConfirmRoll}
                    disabled={!sceneCanConfirm}
                    className="w-full py-2.5 rounded-lg bg-danger text-white font-medium hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    确定
                  </button>
                );
              })()}

              {/* 检定结果：在同一个窗口页下方弹出 */}
              {rollResult && (
                <div className="space-y-3 pt-2 border-t dark:border-border-dark light:border-border-light animate-in fade-in slide-in-from-bottom duration-200">
                  {/* 比对值：AC（攻击场景）或 DC（豁免场景）或 自动命中提示 */}
                  <div className="text-center pt-2">
                    {checkScene === 'savingThrow' ? (
                      <>
                        <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">施法 DC </span>
                        <span className="text-lg font-bold text-amber-400">{spellSaveDC}</span>
                      </>
                    ) : checkScene === 'autoHit' ? (
                      <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">自动命中 · 无需比对</span>
                    ) : (
                      <>
                        <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">对方 AC </span>
                        <span className="text-lg font-bold text-danger">{target.ac || 0}</span>
                      </>
                    )}
                  </div>

                  {/* 列式判定：savingThrow 场景语义反转 */}
                  <div className={`rounded-lg p-4 text-center font-bold text-base sm:text-lg ${
                    checkScene === 'savingThrow'
                      ? (rollResult.isNatural20
                        ? 'bg-blue-500/15 text-blue-400'          // 目标自然 20 = 抵抗
                        : rollResult.isNatural1
                        ? 'bg-yellow-500/20 text-yellow-500'      // 目标自然 1 = 失败命中
                        : rollResult.hit
                        ? 'bg-yellow-500/20 text-yellow-500'      // 命中
                        : 'bg-blue-500/15 text-blue-400')         // 抵抗
                      : (rollResult.isNatural1
                        ? 'bg-red-900/30 text-red-400'
                        : rollResult.isNatural20
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : rollResult.hit
                        ? 'bg-green-500/15 text-green-500'
                        : 'bg-gray-500/15 text-gray-400')
                  }`}>
                    {checkScene === 'savingThrow'
                      ? (rollResult.isNatural20
                        ? '目标自然 20，完全抵抗！'
                        : rollResult.isNatural1
                        ? '目标自然 1，法术命中！'
                        : rollResult.hit
                        ? '豁免失败，法术命中'
                        : '豁免成功，法术未命中')
                      : checkScene === 'autoHit'
                      ? '法术自动命中'
                      : (rollResult.isNatural1
                        ? '自然 1，未命中敌人！'
                        : rollResult.isNatural20
                        ? '自然 20，重击敌人！'
                        : rollResult.hit
                        ? '攻击检定值≥AC，命中'
                        : '攻击检定值＜AC，未命中')}
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
