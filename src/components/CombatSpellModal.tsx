// 法术施放弹窗 —— 与攻击检定完全独立的交互流程
// 从沙盘「法术」按钮触发：浏览法术 → 步骤化施放（前置检查/目标/检定/效果/收尾）
// 副作用延迟原则：HP/动作/先攻表格/castLogs 全部在收尾确认时一次性应用（见 hooks/combat/useCastSteps）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, BookOpen, ChevronLeft, Workflow, ScrollText, Sparkles } from 'lucide-react';
import { rollDice } from '@/data/diceService';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import flowStore from '@/data/flowStore';
import { fetchBindingsBySpell } from '@/lib/api';
import combatStore, { computeCombatantAc } from '@/data/combatStore';
import { useCastSteps } from '@/hooks/combat/useCastSteps';
import type { Combatant } from '@/types/combat';
import type { Character, Equipment, SpellSlotLevel } from '@/types/character';
import type { Spell } from '@/types/spell';
import type { FlowDefinition } from '@/types/flow';
import type { DamageResolution, DamageType } from '@/types/damage';
import { createUntypedResolution, extractDamageType, formatDamageBreakdown, normalizeDamageType, resolveDamage, spellDamageSource } from '@/data/damageRules';
import { getCombatantAffinities } from '@/data/combatAffinities';
import { parseSpellRange } from '@/utils/spellRange';
import SpellStepBar from './combat/SpellStepBar';
import SpellPreCastStep from './combat/SpellPreCastStep';
import SpellConsumeStep, { type ScrollOption, type SlotOption } from './combat/SpellConsumeStep';
import SpellTargetStep from './combat/SpellTargetStep';
import SpellCheckStep, { type SpellCheckOutcome, type SpellCheckType } from './combat/SpellCheckStep';
import SpellEffectStep, { parseDice, renderSpellDice, type SpellEffectType } from './combat/SpellEffectStep';
import SpellFinishStep from './combat/SpellFinishStep';
import { evaluateSpellMaterials, isScrollItem, buildMaterialEquipment, buildScrollEquipment, type MaterialEvaluation, type MaterialRequirement } from '@/data/spellMaterials';
import { getHeldEquipmentIds } from '@/data/spellFocus';
import FlowRunStep, { type FlowCastPayload } from './combat/FlowRunStep';

type Stage = 'list' | 'flow-target' | 'flow' | 'cast';

interface Props {
  caster: Combatant;        // 施法者（攻击者位）
  target: Combatant;        // 目标
  onClose: () => void;
  /** 可选：目标角色（PC 时传入，用于基于目标战斗背包重算 AC） */
  targetCharacter?: Character | null;
  /** 可选：目标战斗背包，用于重算目标 AC */
  targetCombatInventory?: Equipment[];
  /** 施法者战斗背包，用于材料成分（M）门禁 */
  casterCombatInventory?: Equipment[];
  /** 战斗记录 ID（用于消费 pending 标记 + 收尾写入 castLogs） */
  recordId?: string;
  /** 当前回合数（用于 pending 过期判定） */
  currentRound?: number;
  /** 所有参战者沙盘位置字典（跨参战者距离判定，如协助动作 5 尺内约束） */
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  /** 施法者是否还有可用动作次数（1 动作施法时间法术的前置门禁） */
  canUseAction?: boolean;
  /** 施法者是否还有可用附赠动作次数（附赠动作施法时间法术需要消耗） */
  canUseBonusAction?: boolean;
  /** 试验场模式：法术列表开放全库（不限于角色卡已学），支持名称搜索 */
  isProvingGround?: boolean;
  /** 目标确认步骤内更换目标时同步回宿主（HP 应用与先攻表格按新目标结算） */
  onTargetChange?: (c: Combatant) => void;
  /**
   * 按流程施放完成：宿主回写逐目标参战者 HP + 动作消耗 + 先攻表格摘要。
   * 有绑定正式流程的法术才会走此路径；未提供时流程入口隐藏。
   */
  onFlowResolved?: (payload: FlowCastPayload) => void;
  /** 施放完成：回传完整信息由 main 写入先攻表格与应用 HP 变化（契约冻结） */
  /** 收尾时消耗材料 / 卷轴（宿主写入战斗变更漏斗） */
  onConsumeMaterials?: (items: { childId: string; name: string; quantity: number }[]) => void;
  onCastResolved: (info: {
    spellName: string;
    /** 施法时间原文（如 "1 动作"），用于动作机制判定 */
    castingTime?: string;
    success: boolean;              // 检定是否成功（无检定场景恒 true）
    effectType: 'damage' | 'heal'; // 伤害 / 治疗
    amount: number;                // 最终数值（抗性结算后）
    baseAmount?: number;           // 抗性前原始数值
    damageType?: string;           // 本次伤害类型
    affinityDetail?: string;       // 抗性明细（如“火焰 24→12（抗性）”）
    newHp: number;                 // 应用后的 HP
    status?: 'unconscious' | 'dead'; // NPC 致命伤害附带状态
    checkType: 'ac' | 'save' | 'none'; // 使用的检定方式
    d20Rolled?: number[];          // 检定骰序列
    d20Final?: number;             // 最终 d20
    d20Bonus?: number;             // 检定加值
    d20Total?: number;             // 检定总值
    concentration?: boolean;       // 专注类法术标记（成功施展时宿主声明专注状态）
  }) => void;
}

// 单张法术卡片
// compact：列表态——只显示基本信息（描述/升环说明在选中施放后的参考卡展示）
// scrollOnly：法术仅通过背包卷轴获得（未习得），加「仅卷轴」徽记
function SpellCard({ spell, level, active, onPick, hasFlow, compact, scrollOnly }: { spell: Spell; level: number; active: boolean; onPick: () => void; hasFlow?: boolean; compact?: boolean; scrollOnly?: boolean }) {
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
        {scrollOnly && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 inline-flex items-center gap-0.5">
            <ScrollText className="w-2.5 h-2.5" />
            仅卷轴
          </span>
        )}
        {hasFlow && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 inline-flex items-center gap-0.5">
            <Workflow className="w-2.5 h-2.5" />
            流程
          </span>
        )}
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
      {!compact && spell.description && (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5 leading-relaxed whitespace-pre-line">
          {renderSpellDice(spell.description)}
        </div>
      )}
      {!compact && spell.heightenedEffect && (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted mt-1.5 flex items-start gap-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 shrink-0">升环</span>
          <span className="leading-relaxed">{spell.heightenedEffect}</span>
        </div>
      )}
    </button>
  );
}

/**
 * 流程施放路径的资源消耗选择条：流程执行不占 cast 步骤机，
 * 消耗决策在流程确认应用时（onApplied）统一落地。
 */
function FlowConsumeBar({
  spell, scrolls, isLearned, usableSlots, value, onChange,
}: {
  spell: Spell;
  scrolls: ScrollOption[];
  isLearned: boolean;
  usableSlots: SlotOption[];
  value: { method: 'slot' | 'scroll'; slotLevel?: number; scrollChildId?: string; scrollName?: string } | null;
  onChange: (v: { method: 'slot' | 'scroll'; slotLevel?: number; scrollChildId?: string; scrollName?: string } | null) => void;
}) {
  // 无可用资源：提示但不阻断（流程自身门禁 + DM 裁决）
  if (scrolls.length === 0 && usableSlots.length === 0) {
    return (
      <div className="px-3 py-2 rounded-lg border border-amber-500/40 dark:bg-amber-500/10 light:bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
        无可用消耗资源：未持有该法术卷轴，且 {spell.level} 环及以上法术位已耗尽。可强制继续（不消耗）。
      </div>
    );
  }

  const isScroll = value?.method === 'scroll';
  const isSlot = value?.method === 'slot';
  const selectedScroll = scrolls.find(s => s.childId === value?.scrollChildId);
  const selectedSlot = usableSlots.find(s => s.level === value?.slotLevel);
  const higher = isSlot && (value?.slotLevel ?? 0) > spell.level;

  return (
    <div className="rounded-lg border p-2.5 space-y-2 dark:border-border-dark light:border-border-light">
      <div className="flex items-center gap-2 text-xs dark:text-text-dark-muted light:text-text-light-muted">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span>资源消耗（流程完成后应用）</span>
        {higher && <span className="text-purple-400">升环 {value?.slotLevel}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {scrolls.map(s => (
          <button
            key={s.childId}
            onClick={() => onChange({ method: 'scroll', scrollChildId: s.childId, scrollName: s.name })}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors ${
              isScroll && s.childId === value?.scrollChildId
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'dark:border-border-dark/60 light:border-border-light/60 dark:text-text-dark-muted light:text-text-light-muted'
            }`}
          >
            <ScrollText className="w-3 h-3 text-amber-400" />
            卷轴 {s.level} 环
          </button>
        ))}
        {usableSlots.map(s => (
          <button
            key={s.level}
            onClick={() => onChange({ method: 'slot', slotLevel: s.level })}
            title="可用 / 总量"
            className={`px-2 py-1 rounded text-[11px] border transition-colors ${
              isSlot && s.level === value?.slotLevel
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'dark:border-border-dark/60 light:border-border-light/60 dark:text-text-dark-muted light:text-text-light-muted'
            }`}
          >
            {s.level} 环位（{s.max - s.used}/{s.max}）
          </button>
        ))}
      </div>
      {(isScroll || isSlot) && (
        <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
          {isScroll
            ? `将消耗卷轴「${selectedScroll?.name ?? value?.scrollName}」（${selectedScroll?.level ?? '?'} 环），不占法术位`
            : `将消耗 ${value?.slotLevel} 环法术位（可用 ${selectedSlot ? selectedSlot.max - selectedSlot.used : '?'} → ${selectedSlot ? selectedSlot.max - selectedSlot.used - 1 : '?'}/${selectedSlot?.max ?? '?'}）${higher && spell.heightenedEffect ? `；升环效果：${spell.heightenedEffect}` : ''}`}
        </div>
      )}
    </div>
  );
}

export default function CombatSpellModal({
  caster, target, onClose, onCastResolved, targetCharacter: propTargetCharacter, targetCombatInventory,
  recordId, currentRound, combatantPositions, canUseAction = true, canUseBonusAction, onTargetChange, onFlowResolved,
  isProvingGround = false, casterCombatInventory, onConsumeMaterials,
}: Props) {
  // 目标角色卡：优先使用 prop 传入值，没有时按 characterId 查找（用于自动填入豁免加值）
  const targetCharacter = useMemo<Character | null>(() => {
    if (propTargetCharacter !== undefined && propTargetCharacter !== null) return propTargetCharacter;
    if (target.characterId) return characterStore.get(target.characterId);
    return null;
  }, [propTargetCharacter, target.characterId]);
  // 目标 AC：PC 角色传入战斗背包时重算（被移除的护甲/盾牌不加值）
  const effectiveTargetAc = computeCombatantAc(target, targetCharacter ?? null, targetCombatInventory ?? null);

  // 施法步骤状态机（副作用延迟：只在收尾时应用）
  const cast = useCastSteps();

  const [stage, setStage] = useState<Stage>('list');
  const [selectedSpell, setSelectedSpell] = useState<Spell | null>(null);
  // 流程施放：spellId → 绑定的正式流程（挂载时从云端拉一次绑定关系；拉取失败静默降级手动管线）
  const [flowBindings, setFlowBindings] = useState<Map<string, string>>(new Map());
  const [boundFlow, setBoundFlow] = useState<FlowDefinition | null>(null);
  // 法术库缓存刷新信号：knownSpells 按名字从本地缓存解析，而绑定按云端 spell_id 查询——
  // 本地缓存可能是种子回落（id 与云端不同源），必须先 fetchAll 刷新为云端真值再查绑定
  const [spellCacheTick, setSpellCacheTick] = useState(0);

  // 材料成分：本次施法内补入的材料/卷轴（已写入角色背包；跨法术保留，避免切换法术时丢失评估）
  const [craftedMaterials, setCraftedMaterials] = useState<Equipment[]>([]);

  // 流程施放的资源消耗决策（延迟到流程 onApplied 落地；戏法/NPC/试验场为 null）
  const [flowConsume, setFlowConsume] = useState<{ method: 'slot' | 'scroll'; slotLevel?: number; scrollChildId?: string; scrollName?: string } | null>(null);

  // 目标确认步骤内可更换目标：本地生效目标 + 通知宿主同步（HP/先攻按新目标结算）
  const [effectiveTarget, setEffectiveTarget] = useState<Combatant>(target);
  useEffect(() => { setEffectiveTarget(target); }, [target.id]);
  // 换目标后旧的抗性明细不再适用
  useEffect(() => { setDamageResolution(null); }, [effectiveTarget.id]);

  // 检定结果（检定步骤上报，收尾与 onCastResolved 使用）
  const [checkOutcome, setCheckOutcome] = useState<SpellCheckOutcome | null>(null);
  // 效果结算步骤的最终数值（确认结算 / 跳过效果时落定）
  const [resolvedAmount, setResolvedAmount] = useState(0);

  // 效果骰池状态（效果步骤受控）
  const [effectType, setEffectType] = useState<SpellEffectType>('damage');
  const [damageType, setDamageType] = useState<DamageType | null>(null);
  const [damageResolution, setDamageResolution] = useState<DamageResolution | null>(null);
  const [diceExpr, setDiceExpr] = useState('');
  const [effectDiceValues, setEffectDiceValues] = useState<string[]>([]);
  const [calculated, setCalculated] = useState<number | null>(null);

  // 施法者角色卡（NPC 无 character，无法用法术弹窗——按钮层会拦截，这里兜底）
  const character = useMemo<Character | null>(() => {
    if (caster.characterId) return characterStore.get(caster.characterId);
    return null;
  }, [caster.characterId]);

  const spellAbilityKey = character ? characterStore.getSpellcastingAbility(character) : null;
  const spellAbilityLabel = spellAbilityKey
    ? ({ strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力' } as const)[spellAbilityKey]
    : null;
  const spellSaveDC = character
    ? characterStore.getSpellSaveDC(character)
    // 纯 NPC 参战者：读模板解析出的天生施法 DC（如「法术豁免DC12」）
    : (typeof caster.spellcasting?.dc === 'number' ? caster.spellcasting.dc : null);

  // 材料成分评估（直接材料 / 材料包替代 / 对应卷轴）
  const materialEvaluation = useMemo<MaterialEvaluation | null>(() => {
    if (!selectedSpell) return null;
    // NPC 无角色卡背包、试验场无限资源：不做材料门禁（交由 DM 裁决）
    if (!character || isProvingGround) return null;
    if (!selectedSpell.components?.material) return null;
    const inventory = [...(casterCombatInventory || []), ...craftedMaterials];
    // 法器需要「手持 + 职业匹配」（手持为参战者战斗层槽位），材料袋只要在背包即可
    return evaluateSpellMaterials(selectedSpell, inventory, {
      character,
      heldIds: getHeldEquipmentIds(caster),
    });
  }, [selectedSpell, casterCombatInventory, craftedMaterials, character, isProvingGround, caster]);

  // 快捷补货：把法术材料 / 卷轴加入施法者背包（PC 限定）
  const handleCraftMaterial = (req: MaterialRequirement) => {
    if (!selectedSpell || !character) return;
    const existing = [...(casterCombatInventory || []), ...craftedMaterials]
      .find(it => (it.materialKey || it.name) === req.name || it.materialKey === req.key);
    if (existing) return;
    const data = buildMaterialEquipment(selectedSpell, req);
    const added = characterStore.addEquipment(character.id, data);
    if (added) setCraftedMaterials(prev => [...prev, added]);
  };

  const handleCraftScroll = () => {
    if (!selectedSpell || !character) return;
    const existing = [...(casterCombatInventory || []), ...craftedMaterials]
      .find(it => it.scrollSpellId === selectedSpell.id);
    if (existing) return;
    const data = buildScrollEquipment(selectedSpell);
    const added = characterStore.addEquipment(character.id, data);
    if (added) setCraftedMaterials(prev => [...prev, added]);
  };

  // 法术列表
  const [spellSearch, setSpellSearch] = useState('');
  // 最近施放记忆（spellId → 越近 rank 越小）：stage 变化时重读战斗记录，保证刚施放完回来就置顶
  const lastCastRankRef = useRef(new Map<string, number>());
  useEffect(() => {
    const stack = recordId ? combatStore.get(recordId)?.lastSpellCasts?.[caster.id] : undefined;
    lastCastRankRef.current = new Map((stack ?? []).map((id, i) => [id, i]));
  }, [stage, recordId, caster.id]);
  const knownSpells = useMemo<{ spell: Spell; level: number; scrollOnly?: boolean }[]>(() => {
    // 试验场：全员开放法术库全量（测试施法者与受术者双向效果）
    if (isProvingGround) {
      return spellStore.getAll().map(s => ({ spell: s, level: s.level }));
    }
    if (!character) return [];
    const all = spellStore.getAll();
    const byName = (name: string) => all.find(s => s.name === name);
    const list: { spell: Spell; level: number; scrollOnly?: boolean }[] = [];
    (character.spells?.cantrips || []).forEach(name => {
      const s = byName(name);
      if (s) list.push({ spell: s, level: 0 });
    });
    (character.spells?.custom || []).forEach(name => {
      const s = byName(name);
      if (s) list.push({ spell: s, level: s.level });
    });
    return list;
  }, [character, spellCacheTick, isProvingGround]);

  // 施法者背包（战斗派生 + 本次施法补入 + 角色卡兜底），用于卷轴法术识别
  const casterInventory = useMemo<Equipment[]>(() => {
    const fromChar = character?.equipment ?? [];
    return [...(casterCombatInventory || []), ...craftedMaterials, ...fromChar];
  }, [casterCombatInventory, craftedMaterials, character?.id]);

  // 仅卷轴法术：背包里有对应卷轴但角色未习得 → 入列表并打「仅卷轴」徽记（卷轴环级优先于法术库环级）
  const scrollOnlySpells = useMemo<{ spell: Spell; level: number; scrollOnly: boolean }[]>(() => {
    if (!character || isProvingGround) return [];
    const knownIds = new Set(knownSpells.map(k => k.spell.id));
    const seen = new Set<string>();
    const list: { spell: Spell; level: number; scrollOnly: boolean }[] = [];
    casterInventory.forEach(item => {
      if (!isScrollItem(item) || !item.scrollSpellId) return;
      const id = item.scrollSpellId;
      if (knownIds.has(id) || seen.has(id)) return;
      const s = spellStore.getById(id);
      if (!s) return;
      seen.add(id);
      list.push({ spell: s, level: typeof item.scrollSpellLevel === 'number' ? item.scrollSpellLevel : s.level, scrollOnly: true });
    });
    return list;
  }, [character, isProvingGround, casterInventory, knownSpells, spellCacheTick]);

  // 挂载时刷新法术库缓存为云端真值（失败保留现有缓存），随后绑定查询才能命中云端 spell_id
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await spellStore.fetchAll();
      } catch (e) {
        // 离线：用现有缓存（种子或上次同步），绑定查询可能落空但不影响手动施放
        console.warn('[CombatSpellModal] 法术库云端刷新失败，绑定可能按旧 id 查询落空:', e);
      }
      if (!cancelled) setSpellCacheTick(t => t + 1);
    })();
    return () => { cancelled = true; };
  }, []);

  // 法术缓存就绪后拉取每个已知法术的绑定关系（取首个绑定的正式流程）；失败静默——流程入口消失但手动施放不受影响
  useEffect(() => {
    if (knownSpells.length === 0) return;
    let cancelled = false;
    (async () => {
      const map = new Map<string, string>();
      await Promise.all(knownSpells.map(async ({ spell }) => {
        try {
          const list = await fetchBindingsBySpell(spell.id);
          if (Array.isArray(list) && list.length > 0 && list[0]?.flow_id) {
            map.set(spell.id, list[0].flow_id);
          } else {
            // 有法术但查不到绑定：多半是缓存 id 与云端绑定 spell_id 脱节（角色/缓存陈旧）
            console.warn('[CombatSpellModal] 法术无绑定流程（缓存 id 可能与云端绑定脱节）:', spell.name, spell.id);
          }
        } catch (e) {
          // 单个法术拉取失败不影响其余
          console.warn('[CombatSpellModal] 绑定拉取失败，流程徽标降级手动:', spell.name, spell.id, e);
        }
      }));
      if (!cancelled) setFlowBindings(map);
    })();
    return () => { cancelled = true; };
  }, [knownSpells]);

  // 是否同队伍（决定效果类型可选项）
  const sameTeam = !!caster && !!effectiveTarget && (caster.isPc === effectiveTarget.isPc);

  // 流程施放 UI 皮肤：放映模式默认玩家引导视图（大输入框/通俗文案），DM 可随时切回详细视图
  const [flowUiOverride, setFlowUiOverride] = useState<'dm' | 'player' | null>(null);
  const flowUiVariant: 'dm' | 'player' = flowUiOverride ?? (
    recordId && combatStore.get(recordId)?.mode === 'playback' ? 'player' : 'dm'
  );

  // 参战者列表（目标更换用）
  const allCombatants = useMemo(() => {
    const rec = recordId ? combatStore.get(recordId) : null;
    return rec?.combatants ?? [caster, effectiveTarget];
  }, [recordId, caster.id, effectiveTarget.id]);

  // 施法者当前专注的法术（实时取 store：弹窗内的 caster 是快照，声明/替换后 props 不会自动刷新）
  const activeConcentration = useMemo(() => {
    if (!recordId) return undefined;
    return combatStore.get(recordId)?.combatants.find(c => c.id === caster.id)?.concentration;
  }, [recordId, caster.id]);

  // 选定法术进入施放阶段：有绑定正式流程 → 流程施放；否则步骤化手动管线
  // （成分/动作门禁在前置检查步骤内做，不再 alert 打断）
  const handlePickSpell = async (spell: Spell) => {
    setSelectedSpell(spell);
    setFlowUiOverride(null);

    // 自身类法术（射程「自身」）：目标恒为施法者自己——手动管线跳过 select_target
    // 步骤，流程施放直接以自己为目标（select_target mode=self 的流程节点同样无需换目标）
    const selfCast = parseSpellRange(spell.range).self;
    if (selfCast) {
      setEffectiveTarget(caster);
    }

    // 绑定流程解析：本地缓存优先，缺失时拉云端正式版（pullRemote 会写入本地缓存）
    const flowId = flowBindings.get(spell.id);
    if (flowId) {
      let f = flowStore.getPublished(flowId);
      if (!f) {
        try {
          const remote = await flowStore.pullRemote(flowId);
          f = remote ? flowStore.getPublished(remote.id) : undefined;
        } catch (e) {
          // 云端不可用：回落手动管线
          console.warn('[CombatSpellModal] 绑定流程云端拉取失败，回落手动管线:', flowId, e);
        }
      }
      if (f) {
        setBoundFlow(f);
        // 流程含 select_target 且法术非「自身」射程 → 先选目标（触及类：防护能量等）；
        // 自身类法术目标恒为施法者，直接进入流程执行
        const flowNeedsTarget = !selfCast && f.nodes.some(n => n.type === 'select_target');
        // 流程施放的消耗默认值：本步骤内直接计算（usableSlots/scrollOptions 的 useMemo
        // 仍指向上一个 selectedSpell，此处不能复用）；可用法术位优先，其次卷轴。
        // 可用性叠加本场战斗已消耗 delta（漏斗思想：角色卡源 + delta = 战斗中真实余量）
        let defaultConsume: { method: 'slot' | 'scroll'; slotLevel?: number; scrollChildId?: string; scrollName?: string } | null = null;
        const deltas = recordId ? combatStore.getSpellSlotDeltas(recordId, caster.id) : {};
        if (character && !isProvingGround && spell.level > 0) {
          for (let lv = Math.max(1, spell.level); lv <= 9; lv++) {
            const slot = character.spells?.spellSlots?.[`level${lv}` as SpellSlotLevel];
            if (slot && slot.max > slot.used + (deltas[`level${lv}` as SpellSlotLevel] ?? 0)) {
              defaultConsume = { method: 'slot', slotLevel: lv };
              break;
            }
          }
          if (!defaultConsume) {
            const firstScroll = casterInventory.find(it => isScrollItem(it) && (
              it.scrollSpellId === spell.id || (!!it.scrollSpellName && it.scrollSpellName === spell.name)
            ));
            if (firstScroll?.childId) {
              defaultConsume = { method: 'scroll', scrollChildId: firstScroll.childId, scrollName: firstScroll.name };
            }
          }
        }
        setFlowConsume(defaultConsume);
        setStage(flowNeedsTarget ? 'flow-target' : 'flow');
        return;
      }
    }

    setStage('cast');
    // 资源消耗步骤：PC + 非试验场 + 非戏法时插入（NPC 无角色卡法术位、试验场无限资源、戏法免位）
    cast.begin('ac', selfCast, !!character && !isProvingGround && spell.level > 0);
    setCheckOutcome(null);
    setResolvedAmount(0);
    setEffectType('damage');
    setDamageType(normalizeDamageType(spell.damageType) ?? extractDamageType(spell.description));
    setDamageResolution(null);
    setDiceExpr('');
    setEffectDiceValues([]);
    setCalculated(null);
  };

  // 返回法术列表：无痕中止当前轨迹（含流程施放轨迹）
  const handleBackToList = () => {
    setStage('list');
    setBoundFlow(null);
    setFlowConsume(null);
    cast.abort();
    setCheckOutcome(null);
    setResolvedAmount(0);
    setDamageResolution(null);
    setDiceExpr('');
    setEffectDiceValues([]);
    setCalculated(null);
  };

  // 检定步骤完成：成功推进到效果结算；失败自动跳过效果结算直达收尾
  const handleCheckComplete = (t: Exclude<SpellCheckType, 'none'>, outcome: SpellCheckOutcome) => {
    setCheckOutcome(outcome);
    setEffectType('damage');
    setDamageResolution(null);
    if (t === 'ac') {
      cast.completeCurrent(
        outcome.success ? 'success' : 'failure',
        `d20 ${outcome.d20}+${outcome.bonus}=${outcome.total} vs AC ${effectiveTargetAc || 0}`,
        { ...outcome, checkType: 'ac' },
      );
    } else {
      cast.completeCurrent(
        outcome.success ? 'success' : 'failure',
        `豁免 d20 ${outcome.d20}+${outcome.bonus}=${outcome.total} vs DC ${spellSaveDC ?? '-'}${outcome.legendaryResistanceUsed ? '，消耗传奇抗性改为成功' : ''}`,
        { ...outcome, checkType: 'save' },
      );
    }
    if (!outcome.success) {
      // 检定未过：效果结算记失败（无效果），直达收尾
      cast.completeCurrent('failure', '检定未通过，无效果', { amount: 0, skipped: true });
    }
  };

  // 效果骰池：摇骰
  const handleRollEffectDice = () => {
    const parsed = parseDice(diceExpr);
    if (parsed.count === 0 || parsed.sides === 0) return;
    const result = rollDice({ sides: parsed.sides as 4 | 6 | 8 | 10 | 12 | 20, count: parsed.count, mode: 'independent' });
    setEffectDiceValues(result.values.map(String));
    setCalculated(null);
  };

  // 效果骰池：计算合计
  const handleCalcEffect = () => {
    const parsed = parseDice(diceExpr);
    let sum = parsed.bonus;
    for (const v of effectDiceValues) {
      const n = parseInt(v, 10);
      if (!isNaN(n)) sum += n;
    }
    setCalculated(sum);
  };

  // 检定摘要（收尾审计用）
  const checkSummary = useMemo(() => {
    if (!checkOutcome) return undefined;
    return cast.checkType === 'ac'
      ? `d20 ${checkOutcome.d20}+${checkOutcome.bonus}=${checkOutcome.total} vs AC ${effectiveTargetAc || 0}，${checkOutcome.success ? '命中' : '未命中'}`
      : `豁免 d20 ${checkOutcome.d20}+${checkOutcome.bonus}=${checkOutcome.total} vs DC ${spellSaveDC ?? '-'}，${checkOutcome.success ? '法术命中' : '目标抵抗'}`;
  }, [checkOutcome, cast.checkType, effectiveTargetAc, spellSaveDC]);

  // 资源消耗数据源：匹配卷轴选项 + 可用法术位（used < max 且环级 >= 法术基础环级）
  const scrollOptions = useMemo<ScrollOption[]>(() => {
    if (!selectedSpell || !character) return [];
    return casterInventory
      .filter(it => isScrollItem(it) && (
        it.scrollSpellId === selectedSpell.id ||
        (!!it.scrollSpellName && it.scrollSpellName === selectedSpell.name)
      ))
      .map(it => ({
        childId: it.childId || it.id || '',
        name: it.name,
        level: typeof it.scrollSpellLevel === 'number' ? it.scrollSpellLevel : (selectedSpell.level || 1),
      }))
      .filter(s => s.childId);
  }, [selectedSpell, character, casterInventory]);

  const usableSlots = useMemo<SlotOption[]>(() => {
    if (!selectedSpell || !character) return [];
    // 战斗临时副本叠加：可用性按「角色卡 used + 本场战斗 delta < max」判定（漏斗思想，角色卡源不被触碰）
    const deltas = recordId ? combatStore.getSpellSlotDeltas(recordId, caster.id) : {};
    const minLevel = Math.max(1, selectedSpell.level);
    const out: SlotOption[] = [];
    for (let lv = minLevel; lv <= 9; lv++) {
      const key = `level${lv}` as SpellSlotLevel;
      const slot = character.spells?.spellSlots?.[key];
      if (slot && slot.max > slot.used + (deltas[key] ?? 0)) out.push({ level: lv, used: slot.used + (deltas[key] ?? 0), max: slot.max });
    }
    return out;
  }, [selectedSpell, character, recordId, caster.id]);

  // 该法术是否在角色卡上习得（卷轴法术未习得 → 只能走卷轴）
  const isSpellLearned = useMemo(() => {
    if (!selectedSpell || !character) return false;
    return scrollOnlySpells.every(s => s.spell.id !== selectedSpell.id);
  }, [selectedSpell, character, scrollOnlySpells]);

  // 收尾确认：副作用唯一出口——写 castLogs + 上报 onCastResolved（HP/动作/先攻表格由 main 应用）
  const handleFinishConfirm = ({ newHp, status }: { newHp: number; status?: 'unconscious' | 'dead' }) => {
    if (!selectedSpell) return;
    const logs = cast.collectLogs();
    if (recordId && logs.length > 0) {
      combatStore.appendCastLogs(recordId, logs);
    }
    if (recordId) {
      combatStore.recordSpellCast(recordId, caster.id, selectedSpell.id);
    }

    // 资源消耗落地（延迟原则：consume_slot 步骤只记录决策，此处统一应用）
    // 法术位走战斗临时副本漏斗（与装备变更同思想）：只记 delta，战斗结算时统一并入角色卡
    const consumeData = cast.steps.find(s => s.type === 'consume_slot' && s.data)?.data as
      | { method?: string; slotLevel?: number; scrollChildId?: string; scrollName?: string }
      | undefined;
    if (consumeData?.method === 'slot' && recordId && typeof consumeData.slotLevel === 'number') {
      combatStore.consumeSpellSlot(recordId, caster.id, `level${consumeData.slotLevel}` as SpellSlotLevel);
    }
    let consumptions = [...(materialEvaluation?.consumption ?? [])];
    if (consumeData?.method === 'scroll' && consumeData.scrollChildId
      && !consumptions.some(c => c.childId === consumeData.scrollChildId)) {
      consumptions.push({ childId: consumeData.scrollChildId, name: consumeData.scrollName || '法术卷轴', quantity: 1 });
    }
    if (consumptions.length > 0) {
      onConsumeMaterials?.(consumptions);
    }

    onCastResolved({
      spellName: selectedSpell.name,
      castingTime: selectedSpell.castingTime,
      success: cast.checkType === 'none' ? true : (checkOutcome?.success ?? true),
      effectType,
      amount: resolvedAmount,
      baseAmount: damageResolution?.base ?? resolvedAmount,
      damageType: damageType ?? undefined,
      affinityDetail: formatDamageBreakdown(damageResolution) || undefined,
      newHp,
      status,
      checkType: cast.checkType,
      d20Rolled: checkOutcome ? [checkOutcome.d20] : undefined,
      d20Final: checkOutcome?.d20,
      d20Bonus: checkOutcome?.bonus,
      d20Total: checkOutcome?.total,
      concentration: selectedSpell.concentration === true,
    });
    onClose();
  };

  // 当前活动步骤
  const currentStep = cast.currentIndex >= 0 ? cast.steps[cast.currentIndex] : null;

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
                onClick={handleBackToList}
                className="p-1 rounded hover:bg-white/10"
                title="返回法术列表（当前施放轨迹作废）"
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
                {spellAbilityLabel} · DC {spellSaveDC}
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
              <span className="font-medium dark:text-text-dark light:text-text-light">{effectiveTarget.name}</span>
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
              {isProvingGround && (
                <input
                  type="text"
                  value={spellSearch}
                  onChange={e => setSpellSearch(e.target.value)}
                  placeholder="搜索法术名称…"
                  className="mb-2 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm dark:text-text-dark light:text-text-light"
                />
              )}
              {(knownSpells.length + scrollOnlySpells.length) === 0 ? (
                <div className="text-center text-sm dark:text-text-dark-muted light:text-text-light-muted py-8">
                  {isProvingGround ? '法术库为空' : character ? '角色卡未配置法术' : 'NPC 暂不支持施法'}
                </div>
              ) : (
                <div className="space-y-2">
                  {[...knownSpells, ...scrollOnlySpells]
                    .slice()
                    .sort((a, b) => {
                      // 记忆权重：该参战者最近施放过的法术排前（按最近施放倒序），其余保持环阶+名称序。
                      // stage 变化（返回列表）时重读 store，刚完成的施放下次进列表即置顶。
                      const rank = lastCastRankRef.current;
                      const ra = rank.get(a.spell.id) ?? Number.MAX_SAFE_INTEGER;
                      const rb = rank.get(b.spell.id) ?? Number.MAX_SAFE_INTEGER;
                      if (ra !== rb) return ra - rb;
                      return a.level - b.level || a.spell.name.localeCompare(b.spell.name);
                    })
                    .filter(({ spell }) =>
                      !isProvingGround ||
                      spellSearch.trim() === '' ||
                      spell.name.toLowerCase().includes(spellSearch.trim().toLowerCase()),
                    )
                    .map(({ spell, level, scrollOnly }) => (
                      <SpellCard
                        key={spell.id}
                        spell={spell}
                        level={level}
                        active={selectedSpell?.id === spell.id}
                        hasFlow={flowBindings.has(spell.id)}
                        compact
                        scrollOnly={scrollOnly}
                        onPick={() => handlePickSpell(spell)}
                      />
                    ))}
                </div>
              )}
            </>
          )}

          {/* 专注替换提示：已有专注时再施专注类法术（5e：打断旧的才开始新的） */}
          {stage !== 'list' && selectedSpell?.concentration && activeConcentration && (
            <div className="px-3 py-2 rounded-lg border border-amber-500/40 dark:bg-amber-500/10 light:bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
              当前正在维持「{activeConcentration.spellName}」——施放此法术将中断它并开始新的专注。
            </div>
          )}

          {/* 阶段 2a-前置：流程选目标（触及类流程法术，select_target 节点驱动） */}
          {stage === 'flow-target' && selectedSpell && boundFlow && (
            <SpellTargetStep
              spell={selectedSpell}
              caster={caster}
              target={effectiveTarget}
              combatants={allCombatants}
              combatantPositions={combatantPositions}
              confirmLabel="目标确认，开始施法流程"
              onSelectTarget={(c) => { setEffectiveTarget(c); onTargetChange?.(c); }}
              onConfirm={() => setStage('flow')}
              onForce={() => setStage('flow')}
            />
          )}

          {/* 阶段 2a：按流程施放（绑定正式流程时优先入口） */}
          {stage === 'flow' && selectedSpell && boundFlow && (
            <>
              {/* 视图皮肤切换：放映模式默认玩家引导视图，DM 可切回详细视图看节点日志 */}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setFlowUiOverride(flowUiVariant === 'player' ? 'dm' : 'player')}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/5"
                >
                  {flowUiVariant === 'player' ? '切换到详细视图' : '切换到玩家视图'}
                </button>
              </div>
              {flowConsume !== null && (
                <FlowConsumeBar
                  spell={selectedSpell}
                  scrolls={scrollOptions}
                  isLearned={isSpellLearned}
                  usableSlots={usableSlots}
                  value={flowConsume}
                  onChange={setFlowConsume}
                />
              )}
              <FlowRunStep
                flow={boundFlow}
                spell={selectedSpell}
                caster={caster}
                target={effectiveTarget}
                allCombatants={allCombatants}
                combatantPositions={combatantPositions}
                recordId={recordId}
                variant={flowUiVariant}
                materialEvaluation={materialEvaluation}
                onCraftMaterial={handleCraftMaterial}
                onCraftScroll={handleCraftScroll}
                onBack={handleBackToList}
                onApplied={(payload) => {
                  // 流程施放的资源消耗落地（延迟原则：流程确认应用时才写）
                  // 法术位走战斗临时副本漏斗：只记 delta，角色卡源不被触碰
                  if (flowConsume?.method === 'slot' && recordId && typeof flowConsume.slotLevel === 'number') {
                    combatStore.consumeSpellSlot(recordId, caster.id, `level${flowConsume.slotLevel}` as SpellSlotLevel);
                  }
                  let consumptions = [...(materialEvaluation?.consumption ?? [])];
                  if (flowConsume?.method === 'scroll' && flowConsume.scrollChildId
                    && !consumptions.some(c => c.childId === flowConsume.scrollChildId)) {
                    consumptions.push({ childId: flowConsume.scrollChildId, name: flowConsume.scrollName || '法术卷轴', quantity: 1 });
                  }
                  if (consumptions.length > 0) {
                    onConsumeMaterials?.(consumptions);
                  }
                  if (recordId) {
                    combatStore.recordSpellCast(recordId, caster.id, selectedSpell.id);
                  }
                  onFlowResolved?.(payload);
                  onClose();
                }}
              />
            </>
          )}

          {/* 阶段 2b：步骤化施放 */}
          {stage === 'cast' && selectedSpell && currentStep && (
            <>
              {/* 法术卡片（参考） */}
              <SpellCard spell={selectedSpell} level={selectedSpell.level} active onPick={() => {}} />

              {/* 步骤进度条 */}
              <SpellStepBar steps={cast.steps} />

              {/* 当前步骤主体 */}
              {currentStep.type === 'cast_start' && (
                <SpellPreCastStep
                  spell={selectedSpell}
                  caster={caster}
                  canUseAction={canUseAction}
                  canUseBonusAction={canUseBonusAction === true}
                  materialEvaluation={materialEvaluation ?? undefined}
                  onCraftMaterial={handleCraftMaterial}
                  onCraftScroll={handleCraftScroll}
                  onConfirm={(message, data) => cast.completeCurrent('success', message, data)}
                  onForce={(message, data) => cast.forceCurrent(message, data)}
                />
              )}

              {currentStep.type === 'consume_slot' && (
                <SpellConsumeStep
                  spell={selectedSpell}
                  scrolls={scrollOptions}
                  isLearned={isSpellLearned}
                  usableSlots={usableSlots}
                  onConfirm={(message, data) => cast.completeCurrent('success', message, data)}
                  onForce={(message, data) => cast.forceCurrent(message, data)}
                />
              )}

              {currentStep.type === 'select_target' && (
                <SpellTargetStep
                  spell={selectedSpell}
                  caster={caster}
                  target={effectiveTarget}
                  combatants={allCombatants}
                  combatantPositions={combatantPositions}
                  onSelectTarget={(c) => { setEffectiveTarget(c); onTargetChange?.(c); }}
                  onConfirm={(message, data) => cast.completeCurrent('success', message, data)}
                  onForce={(message, data) => cast.forceCurrent(message, data)}
                />
              )}

              {(currentStep.type === 'attack_roll' || currentStep.type === 'saving_throw') && (
                <SpellCheckStep
                  key={currentStep.type}
                  checkType={currentStep.type === 'attack_roll' ? 'ac' : 'save'}
                  caster={caster}
                  target={effectiveTarget}
                  casterCharacter={character}
                  targetCharacter={targetCharacter}
                  effectiveTargetAc={effectiveTargetAc}
                  recordId={recordId}
                  currentRound={currentRound}
                  combatantPositions={combatantPositions}
                  spellName={selectedSpell?.name}
                  onComplete={handleCheckComplete}
                  onRequestCheckType={(t) => cast.rebuild(t)}
                  onRequestNoCheck={() => { setEffectType(sameTeam ? 'heal' : 'damage'); cast.rebuild('none'); }}
                />
              )}

              {currentStep.type === 'apply_effect' && (
                <SpellEffectStep
                  effectType={effectType}
                  allowEffectTypeChoice={cast.checkType === 'none'}
                  sameTeam={sameTeam}
                  damageType={damageType}
                  onDamageTypeChange={(type) => { setDamageType(type); setDamageResolution(null); setCalculated(null); }}
                  diceExpr={diceExpr}
                  effectDiceValues={effectDiceValues}
                  calculated={calculated}
                  onEffectTypeChange={(type) => { setEffectType(type); setDamageResolution(null); setCalculated(null); }}
                  onDiceExprChange={(expr) => { setDiceExpr(expr); setEffectDiceValues([]); setCalculated(null); setDamageResolution(null); }}
                  onEffectDieChange={(idx, val) => {
                    setEffectDiceValues(prev => {
                      const next = [...prev];
                      next[idx] = val;
                      return next;
                    });
                    setCalculated(null);
                    setDamageResolution(null);
                  }}
                  onDicePoolReset={() => {
                    // 表达式变化后按新 count 重建槽位（旧 modal 同款行为）
                    const c = parseDice(diceExpr).count;
                    setEffectDiceValues(Array.from({ length: c }).map(() => ''));
                    setCalculated(null);
                  }}
                  onRollDice={handleRollEffectDice}
                  onCalc={handleCalcEffect}
                  onConfirm={(amount) => {
                    const resolution = effectType === 'damage'
                      ? (damageType
                          ? resolveDamage([{ type: damageType, amount }], getCombatantAffinities(effectiveTarget), spellDamageSource())
                          : createUntypedResolution(amount))
                      : null;
                    const finalAmount = resolution?.final ?? amount;
                    setResolvedAmount(finalAmount);
                    setDamageResolution(resolution);
                    const detail = formatDamageBreakdown(resolution);
                    cast.completeCurrent('success', `${effectType === 'damage' ? '造成' : '恢复'} ${finalAmount} 点${detail ? `（${detail}）` : ''}`, {
                      amount: finalAmount,
                      baseAmount: amount,
                      effectType,
                      damageType,
                      resolution,
                    });
                  }}
                  onSkip={() => {
                    setResolvedAmount(0);
                    setDamageResolution(null);
                    setCalculated(0);
                    cast.completeCurrent('success', '跳过效果（0）', { amount: 0, effectType, skipped: true });
                  }}
                />
              )}

              {currentStep.type === 'cast_end' && (
                <SpellFinishStep
                  spellName={selectedSpell.name}
                  castingTime={selectedSpell.castingTime}
                  caster={caster}
                  target={effectiveTarget}
                  checkType={cast.checkType}
                  checkSuccess={checkOutcome?.success ?? true}
                  checkSummary={checkSummary}
                  effectType={effectType}
                  amount={resolvedAmount}
                  resolution={damageResolution}
                  steps={cast.steps}
                  onConfirm={handleFinishConfirm}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
