// 检定步骤（attack_roll / saving_throw）—— 检定方式切换（ac/save/none）在本步内部完成（R2.2）
// d20 输入 / 豁免加值 / 优劣势 / 自然 20-1 判定整体自 CombatSpellModal 迁入；
// 确认时上报 SpellCheckOutcome，pending 优劣势标记在确认后消费。
import { useEffect, useState } from 'react';
import { Dices } from 'lucide-react';
import { rollDice } from '@/data/diceService';
import { characterStore } from '@/data/characterStore';
import combatStore from '@/data/combatStore';
import { detectAdvantage, resolveRollMode, getMatchedPendingSourceIds, type AdvantageContext } from '@/data/advantageRules';
import { detectCheckModifiers, computeModifierTotal, collectDiceRequests, getAppliedModifierRefs, type CheckModifierContext } from '@/data/checkModifierRules';
import { getCombatRoundCtx } from '@/data/combatAffinities';
import AdvDisadvToggle from '../AdvDisadvToggle';
import CheckModifierPanel from './CheckModifierPanel';
import { computeSaveBonus } from '@/lib/saveBonus';
import type { Combatant, CheckScene, AdvantageResult } from '@/types/combat';
import type { Character, AbilityKey } from '@/types/character';

/** 检定结果（宿主收尾需要回传 onCastResolved） */
export interface SpellCheckOutcome {
  d20: number;
  bonus: number;
  total: number;
  isNatural1: boolean;
  isNatural20: boolean;
  success: boolean;
}

export type SpellCheckType = 'ac' | 'save' | 'none';

interface Props {
  checkType: Exclude<SpellCheckType, 'none'>;
  caster: Combatant;
  target: Combatant;
  casterCharacter: Character | null;
  targetCharacter: Character | null;
  effectiveTargetAc: number;
  recordId?: string;
  currentRound?: number;
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  /** 确定检定：上报结果（含失败——失败也要留轨迹） */
  onComplete: (checkType: Exclude<SpellCheckType, 'none'>, outcome: SpellCheckOutcome) => void;
  /** 检定方式切换（ac↔save）：宿主调 hook.rebuild 保留已完成前缀 */
  onRequestCheckType: (t: Exclude<SpellCheckType, 'none'>) => void;
  /** 切换到无检定：宿主重建步骤序列（apply_effect 成为当前步） */
  onRequestNoCheck: () => void;
}

// 豁免属性短写 → AbilityKey 全称映射
const SAVE_ATTR_MAP: Record<string, AbilityKey> = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
};

const SAVE_ATTR_OPTIONS = [
  { key: 'str', label: '力量' }, { key: 'dex', label: '敏捷' }, { key: 'con', label: '体质' },
  { key: 'int', label: '智力' }, { key: 'wis', label: '感知' }, { key: 'cha', label: '魅力' },
] as const;

export default function SpellCheckStep({
  checkType, caster, target, casterCharacter, targetCharacter, effectiveTargetAc,
  recordId, currentRound, combatantPositions, onComplete, onRequestCheckType, onRequestNoCheck,
}: Props) {
  const [saveAttribute, setSaveAttribute] = useState<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'>('dex');
  const [d20Values, setD20Values] = useState<string[]>(['']);
  const [targetSaveBonus, setTargetSaveBonus] = useState<string>('');
  const [lockedDice, setLockedDice] = useState<Set<number>>(new Set());
  const [manualMode, setManualMode] = useState<'none' | 'advantage' | 'disadvantage'>('none');
  // 检定奖惩：可选条目启用集合 + 各条目已掷骰值
  const [enabledModifierKeys, setEnabledModifierKeys] = useState<Set<string>>(new Set());
  const [modifierRolledValues, setModifierRolledValues] = useState<Record<string, string[]>>({});

  const spellAttackBonus = casterCharacter ? characterStore.getSpellAttackBonus(casterCharacter) : null;
  const spellSaveDC = casterCharacter ? characterStore.getSpellSaveDC(casterCharacter) : null;

  const fmtBonus = (n: number) => (n >= 0 ? `+${n}` : String(n));
  const ABILITY_LABEL_MAP: Record<AbilityKey, string> = {
    strength: '力量', dexterity: '敏捷', constitution: '体质',
    intelligence: '智力', wisdom: '感知', charisma: '魅力',
  };

  // 豁免加值构成（推导链展示：属性值 → 调整值 (+ 熟练) → 豁免加值；与仪表盘同源）
  const saveBreakdown = (() => {
    if (checkType !== 'save') return null;
    const abilityKey = SAVE_ATTR_MAP[saveAttribute];
    if (!abilityKey) return null;
    return computeSaveBonus(target, targetCharacter, abilityKey);
  })();

  // DC 来源拆解（与 calcSpellSaveDC 公式一致：8 基础 + 施法属性调整值 + 熟练；熟练部分反推保持与实际 DC 严格一致）
  const dcBreakdown = (() => {
    if (checkType !== 'save' || spellSaveDC === null || !casterCharacter) return null;
    const ability = characterStore.getSpellcastingAbility(casterCharacter);
    const mod = ability ? casterCharacter.abilities?.[ability]?.modifier ?? 0 : 0;
    const profPart = spellSaveDC - 8 - mod;
    const abilityLabel = ability ? ABILITY_LABEL_MAP[ability] : null;
    return abilityLabel
      ? `DC ${spellSaveDC} = 8 基础 + ${abilityLabel}调整 ${fmtBonus(mod)} + 熟练 ${profPart}（施法者）`
      : `DC ${spellSaveDC}（施法者法术豁免 DC）`;
  })();

  // 自动填入目标豁免加值：PC 从角色卡取豁免加值；NPC 从属性值 + 图鉴熟练信息推导。用户仍可手动覆盖
  useEffect(() => {
    if (checkType !== 'save') return;
    const abilityKey = SAVE_ATTR_MAP[saveAttribute];
    if (!abilityKey) return;

    let bonus = 0;
    if (targetCharacter) {
      bonus = characterStore.getSaveBonus(targetCharacter, abilityKey);
    } else {
      const abilityScore = target[abilityKey as keyof Combatant] as number | undefined;
      if (typeof abilityScore === 'number') {
        bonus = Math.floor((abilityScore - 10) / 2);
        if (target.proficientSaves?.includes(abilityKey)) {
          bonus += target.proficiencyBonus ?? 2;
        }
      }
    }

    setTargetSaveBonus(String(bonus));
  }, [checkType, saveAttribute, targetCharacter, target]);

  // 优劣势模式：法术攻击走 spell_attack 场景，豁免走 saving_throw 场景。
  // 主体恒为「本次掷骰方」：法术攻击是施法者掷骰，豁免是目标掷骰——
  // 掷骰方挂在 ctx.attacker（引擎的 self 侧），另一方挂在 ctx.target（incoming 侧）。
  const roller = checkType === 'save' ? target : caster;
  const counterpart = checkType === 'save' ? caster : target;
  const advantageContext: AdvantageContext = {
    scene: (checkType === 'save' ? 'saving_throw' : 'spell_attack') as CheckScene,
    currentRound,
    attacker: roller,
    target: counterpart,
    attackerCharacter: checkType === 'save' ? (targetCharacter ?? null) : casterCharacter,
    targetCharacter: checkType === 'save' ? casterCharacter : (targetCharacter ?? null),
    saveAbility: checkType === 'save' ? SAVE_ATTR_MAP[saveAttribute] : undefined,
    combatantPositions,
    recordId,
    roundCtx: getCombatRoundCtx(recordId),
  };
  const autoResult: AdvantageResult = detectAdvantage(advantageContext);
  const { mode: rollMode, reasons: modeReasons } = resolveRollMode(manualMode, autoResult);
  const isDual = rollMode !== 'none';

  // 检定奖惩：主体为「本次掷骰方」——法术攻击看施法者，豁免看目标
  const modifierSubject = checkType === 'save' ? target : caster;
  const modifierContext: CheckModifierContext = {
    scene: (checkType === 'save' ? 'saving_throw' : 'spell_attack') as CheckScene,
    combatant: modifierSubject,
    currentRound,
    recordId,
    roundCtx: getCombatRoundCtx(recordId),
    enabledSourceKeys: enabledModifierKeys,
  };
  const modifierResult = detectCheckModifiers(modifierContext);

  // 结算本次奖惩（仅启用项）
  const resolveModifierTotal = (): number => {
    const rolledByKey: Record<string, number[]> = {};
    for (const hit of modifierResult.hits) {
      if (!hit.enabled) continue;
      const raw = modifierRolledValues[hit.sourceKey];
      if (Array.isArray(raw) && raw.length === hit.dice.count) {
        const nums = raw.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
        if (nums.length === hit.dice.count) rolledByKey[hit.sourceKey] = nums;
      }
    }
    return computeModifierTotal(modifierResult, rolledByKey).total;
  };

  // 应用 d20 输入变化：自然 20/自然 1 即时出结果（注意 save 场景成功语义反转）
  const applyDiceValues = (newValues: string[]) => {
    setD20Values(newValues);
    if (checkType === 'ac' && spellAttackBonus !== null) {
      if (isDual) {
        const idx20 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 20; });
        if (idx20 !== -1) {
          const otherIdx = idx20 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          return;
        }
        const idx1 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 1; });
        if (idx1 !== -1) {
          const otherIdx = idx1 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          return;
        }
      }
      setLockedDice(new Set());
      return;
    }

    if (checkType === 'save' && spellSaveDC !== null) {
      if (isDual) {
        const idx20 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 20; });
        if (idx20 !== -1) {
          const otherIdx = idx20 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          return;
        }
        const idx1 = newValues.findIndex(v => { const n = parseInt(v, 10); return !isNaN(n) && n === 1; });
        if (idx1 !== -1) {
          const otherIdx = idx1 === 0 ? 1 : 0;
          const otherEmpty = newValues[otherIdx] === '' || newValues[otherIdx] === undefined;
          setLockedDice(otherEmpty ? new Set([otherIdx]) : new Set());
          return;
        }
      }
      setLockedDice(new Set());
      return;
    }
  };

  // 摇 d20
  const handleRollD20 = () => {
    const count = isDual ? 2 : 1;
    const result = rollDice({ sides: 20, count, mode: 'independent' });
    applyDiceValues(result.values.map(String));
  };

  // ============ 校验 ============
  const parsedDice = d20Values.map(v => parseInt(v, 10));
  const allFilled = isDual
    ? parsedDice.length === 2 && parsedDice.every(n => !isNaN(n) && n >= 1 && n <= 20)
    : parsedDice.length === 1 && !isNaN(parsedDice[0]) && parsedDice[0] >= 1 && parsedDice[0] <= 20;
  const canConfirmCheck = checkType === 'save'
    ? allFilled && targetSaveBonus !== '' && !isNaN(parseInt(targetSaveBonus, 10))
    : allFilled;

  // 确定检定：判定 + 消费 pending 标记 + 上报
  const handleConfirmCheck = () => {
    const parsed = parsedDice;
    if (!canConfirmCheck) return;
    if (isDual && parsed.length < 2) return;

    if (checkType === 'ac' && spellAttackBonus !== null) {
      const bonus = spellAttackBonus;
      let d20: number;
      let isNatural1: boolean;
      let isNatural20: boolean;
      let success: boolean;
      const targetAc = effectiveTargetAc || 0;
      // 检定奖惩合计（自然 20/1 仍优先，普通比对阶段并入）
      const modTotal = resolveModifierTotal();
      // 优先级：自然 20 > 自然 1 > 普通比对
      if (isDual && parsed.some(n => n === 20)) {
        d20 = 20; isNatural1 = false; isNatural20 = true; success = true;
      } else if (isDual && parsed.some(n => n === 1)) {
        d20 = 1; isNatural1 = true; isNatural20 = false; success = false;
      } else {
        d20 = isDual ? (rollMode === 'advantage' ? Math.max(...parsed) : Math.min(...parsed)) : parsed[0];
        isNatural1 = d20 === 1;
        isNatural20 = d20 === 20;
        success = isNatural20 ? true : isNatural1 ? false : d20 + bonus + modTotal >= targetAc;
      }
      if (recordId) {
        const pendingIds = getMatchedPendingSourceIds(autoResult);
        if (pendingIds.length > 0) combatStore.consumePendingAdvantage(recordId, roller.id, pendingIds);
        const { pendingIds: modPendingIds } = getAppliedModifierRefs(modifierResult);
        if (modPendingIds.length > 0) combatStore.consumePendingCheckModifiers(recordId, roller.id, modPendingIds);
      }
      onComplete('ac', { d20, bonus, total: d20 + bonus + modTotal, isNatural1, isNatural20, success });
      return;
    }

    if (checkType === 'save' && spellSaveDC !== null) {
      const saveBonusNum = parseInt(targetSaveBonus, 10);
      const bonus = isNaN(saveBonusNum) ? 0 : saveBonusNum;
      const modTotal = resolveModifierTotal();
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
        // 奖惩必须先计入：豁免是「总值 ≥ DC = 抵抗成功」，奖惩直接影响成败
        const saveTotal = d20 + bonus + resolveModifierTotal();
        // 豁免总值 ≥ DC = 抵抗（失败）；< DC = 失败（成功命中）
        success = isNatural20 ? false : isNatural1 ? true : saveTotal < spellSaveDC;
      }
      if (recordId) {
        const pendingIds = getMatchedPendingSourceIds(autoResult);
        if (pendingIds.length > 0) combatStore.consumePendingAdvantage(recordId, roller.id, pendingIds);
        // 次数型奖惩记在掷骰方（豁免场景为目标）名下
        const { pendingIds: modPendingIds } = getAppliedModifierRefs(modifierResult);
        if (modPendingIds.length > 0) combatStore.consumePendingCheckModifiers(recordId, modifierSubject.id, modPendingIds);
      }
      onComplete('save', { d20, bonus, total: d20 + bonus + modTotal, isNatural1, isNatural20, success });
    }
  };

  return (
    <div className="space-y-3">
      {/* 检定方式切换：ac / save 留在本步；none 交还宿主重建序列 */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5">检定方式</div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => onRequestCheckType('ac')}
            disabled={checkType === 'ac' || spellAttackBonus === null}
            className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              checkType === 'ac' ? 'bg-primary text-white ring-2 ring-primary' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
            }`}
          >
            <div>AC 检定</div>
            <div className="text-[10px] font-normal mt-0.5 opacity-80">d20+{spellAttackBonus ?? '-'} vs AC</div>
          </button>
          <button
            onClick={() => onRequestCheckType('save')}
            disabled={checkType === 'save' || spellSaveDC === null}
            className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              checkType === 'save' ? 'bg-primary text-white ring-2 ring-primary' : 'dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10'
            }`}
          >
            <div>豁免检定</div>
            <div className="text-[10px] font-normal mt-0.5 opacity-80">目标 d20 vs DC {spellSaveDC ?? '-'}</div>
          </button>
          <button
            onClick={onRequestNoCheck}
            className="py-1.5 px-2 rounded-lg text-xs font-medium transition-all dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-primary/10"
          >
            <div>无检定</div>
            <div className="text-[10px] font-normal mt-0.5 opacity-80">直接掷效果</div>
          </button>
        </div>
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5">
          切换检定方式将重置已输入的骰值（已完成的前置检查与目标确认保留）
        </div>
      </div>

      {/* 豁免属性选择（save 场景） */}
      {checkType === 'save' && spellSaveDC !== null && (
        <div className="rounded-lg bg-amber-500/10 p-2.5 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-amber-400 font-medium">目标豁免属性：</span>
            {SAVE_ATTR_OPTIONS.map(opt => (
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
          <div className="text-amber-400/80 mt-1">
            提示：根据法术描述选择对应属性，由目标掷骰
            {dcBreakdown && <span className="ml-1">· {dcBreakdown}</span>}
          </div>
        </div>
      )}

      {/* 检定优劣势（手动 + 自动引擎） */}
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">检定优劣势</span>
          <AdvDisadvToggle
            manualMode={manualMode}
            onChange={(m) => {
              setManualMode(m);
              setD20Values(m === 'none' ? [''] : ['', '']);
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

      {/* 检定奖惩（祝福术/灾厄术等）：豁免场景主体为目标，法术攻击场景为施法者 */}
      {modifierResult.hits.length > 0 && (
        <CheckModifierPanel
          result={modifierResult}
          enabledKeys={enabledModifierKeys}
          onToggle={(key, on) => {
            setEnabledModifierKeys(prev => {
              const next = new Set(prev);
              if (on) next.add(key); else next.delete(key);
              return next;
            });
          }}
          rolledValues={modifierRolledValues}
          onRolledChange={(key, values) => setModifierRolledValues(prev => ({ ...prev, [key]: values }))}
          onRollAll={() => {
            const reqs = collectDiceRequests(modifierResult);
            const next: Record<string, string[]> = { ...modifierRolledValues };
            for (const req of reqs) {
              next[req.sourceKey] = rollDice({ sides: req.sides as 4 | 6 | 8 | 10 | 12 | 20, count: req.count, mode: 'independent' }).values.map(String);
            }
            setModifierRolledValues(next);
          }}
        />
      )}

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
                onChange={(e) => setTargetSaveBonus(e.target.value)}
                placeholder={targetCharacter ? '目标豁免加值' : '目标无角色卡，请手填'}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary text-center"
              />
              {saveBreakdown ? (
                <div className="text-[10px] text-center dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                  {saveBreakdown.formula}，可修改
                  {parseInt(targetSaveBonus, 10) === saveBreakdown.total ? '' : '（已手动修改）'}
                </div>
              ) : (
                targetCharacter && (
                  <div className="text-[10px] text-center dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
                    已从角色卡自动填入，可修改
                  </div>
                )
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
        确定检定
      </button>
    </div>
  );
}
