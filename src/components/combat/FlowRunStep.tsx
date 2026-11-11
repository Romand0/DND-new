// 按流程施放 —— 战斗施法弹窗的流程执行步骤
// 组装参战者身份映射的 FlowExecutionContext 调用 flowCompiler 执行绑定流程，
// 逐节点渲染执行日志（豁免判定/分档取值/骰值/HP 变化），确认后把逐目标 HP 结果交宿主回写。
// 编译器纯计算不落库：HP 变更只在确认时经 CombatSession 的参战者路径应用。
// 骰源钩子：默认手动模式（现场投骰后输入，编译器在每个检定/效果骰前暂停收数），
// 输入框旁挂自动掷按钮；关闭手动开关则全自动（旧行为）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Play, Check, AlertTriangle, Workflow, Dices } from 'lucide-react';
import { flowCompiler } from '@/lib/flowCompiler';
import { detectCheckModifiers, resolveModifierValue, getAppliedModifierRefs } from '@/data/checkModifierRules';
import { getCombatRoundCtx } from '@/data/combatAffinities';
import combatStore from '@/data/combatStore';
import type { ForcedMovePlanDraft } from '@/data/battleGeometry';
import type { FlowDefinition, FlowExecutionContext, FlowLogEntry, FlowDiceRequest, FlowAreaInput } from '@/types/flow';
import type { Combatant } from '@/types/combat';
import type { Spell } from '@/types/spell';
import type { Effect } from '@/types/status';
import SpellMaterialPanel from './SpellMaterialPanel';
import type { MaterialEvaluation, MaterialRequirement } from '@/data/spellMaterials';

/** 流程创建的待落地地形区域（编译器纯计算，位置与回合由宿主补全） */
export interface FlowCastZoneSpec {
  type: 'fire' | 'poison' | 'difficult' | 'custom';
  label: string;
  cells: string[];
  color: string;
  damage?: { amount: number; damageType: string; magical?: boolean };
  /** 持续回合数；0 = 永久（需手动移除） */
  durationRounds: number;
  source?: string;
}

/** 单目标结算结果（回传宿主回写参战者 HP） */
export interface FlowCastTargetResult {
  combatantId: string;
  name: string;
  effectType: 'damage' | 'healing' | 'status' | 'check_modifier' | 'advantage' | 'zone' | 'forced_move';
  /** 抗性前原始值（保留用于日志/审计） */
  effectValue: number;
  /** 抗性结算后的最终值（HP 扣减依据；status 恒 0） */
  finalValue: number;
  damageType?: string | null;
  affinitySummary?: string;
  notes?: string[];
  newHp: number;
  /** 被临时生命值吸收的伤害量（0 表示未触发） */
  tempAbsorbed?: number;
  /** effectType='status' 时：待落地的状态库 ID（宿主确认后调 globalStatusManager.applyEffect） */
  statusId?: string;
  statusName?: string;
  /** effectType='status' 时：实例级效果规格（通用伤害修饰引擎的参数载体） */
  statusEffects?: Effect[];
  /** effectType='status' 时：按回合自动消退的时长（0 = 直到手动解除） */
  durationRounds?: number;
  /** effectType='status' 时：持续到目标方（施法者）下一次回合开始（如剑刃防护「直到你的下一回合」） */
  untilNextTurn?: boolean;
  /** untilNextTurn 时轮到施法者的第 N 个回合结束（1=下一回合，2=下下回合…） */
  turnCount?: number;
  /** effectType='check_modifier' 时：使用次数（0 = 状态型随状态过期，>0 = 次数型） */
  modifierUses?: number;
  /** effectType='zone' 时：待落地到沙盘的地形区域规格 */
  zone?: FlowCastZoneSpec;
  /** effectType='forced_move' 时：待落地的位移计划（宿主调 useForcedMove.executeForcedMove） */
  forcedMove?: ForcedMovePlanDraft;
}

/** 流程施放完成回传（契约：CombatSession.onFlowResolved 消费） */
export interface FlowCastPayload {
  spellName: string;
  castingTime?: string;
  /** 主目标受影响（豁免失败/被命中）；豁免成功或无效果节点时 false */
  success: boolean;
  effectType: 'damage' | 'heal' | 'status' | 'check_modifier' | 'advantage' | 'zone' | 'forced_move';
  /** 主目标数值（无效果时 0） */
  amount: number;
  targetResults: FlowCastTargetResult[];
  /** 先攻表格摘要文本 */
  summary: string;
  /** 专注类法术标记（成功施展时宿主声明专注状态） */
  concentration?: boolean;
}

interface Props {
  flow: FlowDefinition;
  spell: Spell;
  caster: Combatant;
  target: Combatant;
  allCombatants: Combatant[];
  combatantPositions?: Record<string, { col: number; row: number } | null | undefined> | null;
  /** 战斗记录 ID：注入后流程内检定（豁免/法术攻击）接入检定奖惩引擎（如灾祸术 -1d4） */
  recordId?: string;
  /** 范围施法输入（AoE 拾取步骤采集）：select_target 区域模式 / zone 节点 zoneCellsFromArea 消费 */
  areaInput?: FlowAreaInput | null;
  /** 本次施放实际消耗的法术位环级（升环缩放用，如 5 环位施 3 环火球）；卷轴/戏法缺省回落法术登记环位 */
  castSlotLevel?: number;
  /** 摘要中的目标标签覆盖（群体效果传「锁定 N 人：名字」，区域效果传「区域 x 格」）；缺省用主目标名 */
  targetsLabel?: string;
  /** UI 皮肤：dm=开发者向（节点日志/骰式细节）；player=引导向（单步聚焦/大输入框/通俗文案） */
  variant?: 'dm' | 'player';
  /** 材料成分评估（流程施放页顶部展示 + 阻止未满足时执行） */
  materialEvaluation?: MaterialEvaluation;
  onCraftMaterial?: (req: MaterialRequirement) => void;
  onCraftScroll?: () => void;
  onBack: () => void;
  onApplied: (payload: FlowCastPayload) => void;
}

/** 日志状态 → 展示色 */
const STATUS_STYLES: Record<FlowLogEntry['status'], string> = {
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  failure: 'text-red-400 bg-red-500/10 border-red-500/30',
  partial: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  skipped: 'text-text-dark-muted light:text-text-light-muted bg-black/5 dark:bg-white/5 border-transparent',
};

export default function FlowRunStep({
  flow, spell, caster, target, allCombatants, combatantPositions, recordId, areaInput, targetsLabel, castSlotLevel,
  variant = 'dm',
  materialEvaluation, onCraftMaterial, onCraftScroll, onBack, onApplied,
}: Props) {
  const [log, setLog] = useState<FlowLogEntry[]>([]);
  const [ran, setRan] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 骰源：默认手动（现场投骰后输入）；关闭则全自动。ref 供 executeFlow 闭包读取最新值
  const [manualDice, setManualDice] = useState(true);
  const manualDiceRef = useRef(manualDice);
  useEffect(() => { manualDiceRef.current = manualDice; }, [manualDice]);

  // 悬停中的骰值请求：编译器暂停等输入，Promise resolve 后继续执行
  const [pendingReq, setPendingReq] = useState<FlowDiceRequest | null>(null);
  const pendingResolveRef = useRef<((v: number | number[] | null) => void) | null>(null);
  // 手动输入态（请求切换时重置）
  const [d20Input, setD20Input] = useState('');
  const [diceInputs, setDiceInputs] = useState<string[]>([]);
  useEffect(() => {
    setD20Input('');
    setDiceInputs(pendingReq?.count ? Array.from({ length: pendingReq.count }, () => '') : []);
  }, [pendingReq]);

  // 玩家视图的已完成骰值摘要（「豁免骰 14」「惩罚骰 3」），确认时记录
  const [rollHistory, setRollHistory] = useState<string[]>([]);
  const shortRollLabel = (req: FlowDiceRequest): string => {
    if (req.label) return req.label.replace(/骰$/, '');
    switch (req.purpose) {
      case 'save': return '豁免骰';
      case 'attack': return '攻击骰';
      case 'concentration': return '专注骰';
      default: return '效果骰';
    }
  };

  // 节点 ID → 标签（日志行标题）
  const nodeLabel = useMemo(() => {
    const m = new Map<string, string>();
    flow.nodes.forEach(n => m.set(n.id, n.label || n.id));
    return m;
  }, [flow]);

  // 主效果节点输出（apply_effect / scaled_effect，取最后执行的）
  const effectOutput = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i--) {
      const t = log[i].nodeType;
      if (t === 'apply_effect' || t === 'scaled_effect') return log[i].data as Record<string, any> | undefined;
    }
    return undefined;
  }, [log]);

  // 全部效果节点输出：多 apply_effect 法术（如灾祸术「攻击-1d4 → 豁免-1d4」串联）
  // 每个节点的 results 都要独立落地，仅取最后一个会静默丢弃其余场景的奖惩实例
  const effectOutputs = useMemo(() => {
    return log
      .filter(l => l.nodeType === 'apply_effect' || l.nodeType === 'scaled_effect')
      .map(l => l.data as Record<string, any> | undefined)
      .filter((d): d is Record<string, any> => !!d);
  }, [log]);

  // 主豁免节点（success 语义：主目标豁免失败 = 法术生效）
  const saveOutput = useMemo(() => {
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].nodeType === 'saving_throw') return log[i].data as Record<string, any> | undefined;
    }
    return undefined;
  }, [log]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setPendingReq(null);
    pendingResolveRef.current = null;
    try {
      // 检定奖惩解析（灾祸术等 -1d4）：d20 输入后、结果宣布前，逐条弹奖惩骰输入框。
  // 惩罚恒强制计入；可选奖励（无开关 UI）在流程路径自动不启用。次数型在计入后立即消费。
  const resolveCheckModifierTotal = async (
    scene: 'spell_attack' | 'saving_throw',
    combatantId: string,
  ): Promise<number> => {
    if (!recordId) return 0;
    const rec = combatStore.get(recordId);
    const subject = rec?.combatants.find(c => c.id === combatantId) ?? null;
    if (!subject) return 0;
    const result = detectCheckModifiers({
      scene,
      combatant: subject,
      recordId,
      roundCtx: getCombatRoundCtx(recordId),
    });
    if (result.hits.length === 0) return 0;
    let total = 0;
    const appliedHits = [];
    for (const hit of result.hits) {
      if (!hit.enabled) continue;
      let values: number[] | undefined;
      if (hit.dice.count > 0 && hit.dice.sides > 0) {
        if (manualDiceRef.current) {
          const raw = await new Promise<number | number[] | null>(resolve => {
            pendingResolveRef.current = resolve;
            setPendingReq({
              purpose: 'effect',
              expr: `${hit.dice.count}d${hit.dice.sides}`,
              count: hit.dice.count,
              sides: hit.dice.sides,
              label: `${hit.label} ${hit.mode === 'penalty' ? '惩罚' : '奖励'}骰`,
            });
          });
          values = Array.isArray(raw) ? raw : undefined;
        }
        total += resolveModifierValue(hit, values);
      } else {
        total += resolveModifierValue(hit);
      }
      appliedHits.push(hit);
    }
    const refs = getAppliedModifierRefs({ hits: appliedHits, hasForced: false, hasOptional: false });
    if (refs.pendingIds.length > 0) {
      combatStore.consumePendingCheckModifiers(recordId, combatantId, refs.pendingIds);
    }
    return total;
  };

  const context: FlowExecutionContext = {
    casterId: caster.id,
    spellId: spell.id,
    targets: [target.id],
    results: new Map(),
    stateSnapshot: {},
    log: [],
    positions: combatantPositions,
    // 范围施法输入：区域模式在编译器内权威算格并写回 targets（单体流程此字段为空）
    area: areaInput ?? undefined,
    // 升环施法：实际消耗的法术位环级（scaled_effect spell_level 缩放）
    castSlotLevel: castSlotLevel,
    // 参战者身份映射：编译器按参战者解析豁免/AC/HP（NPC 免角色卡）
    combatants: Object.fromEntries(allCombatants.map(c => [c.id, c])),
    damageSource: { kind: 'spell', magical: true },
    modifierResolver: resolveCheckModifierTotal,
  };
      // 骰源：手动模式下每个检定/效果骰暂停等输入；自动模式直接回落编译器随机
      await flowCompiler.executeFlow(flow, context, async (req) => {
        if (!manualDiceRef.current) return null;
        setLog([...context.log]);
        return new Promise<number | number[] | null>(resolve => {
          pendingResolveRef.current = resolve;
          setPendingReq(req);
        });
      });
      setPendingReq(null);
      pendingResolveRef.current = null;
      setLog([...context.log]);
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  // ── 手动骰收数 ──
  const ABILITY_LABELS: Record<string, string> = {
    strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力',
  };

  const resolvePending = (v: number | number[] | null) => {
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    setPendingReq(null);
    resolve?.(v);
  };

  const d20Valid = Number.isFinite(parseInt(d20Input, 10)) && parseInt(d20Input, 10) >= 1 && parseInt(d20Input, 10) <= 20;
  const diceValid = diceInputs.length > 0 && diceInputs.every(s => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n >= 1 && n <= (pendingReq?.sides ?? 0);
  });

  const confirmD20 = () => {
    if (d20Valid) {
      if (variant === 'player' && pendingReq) setRollHistory(h => [...h, `${shortRollLabel(pendingReq)} ${d20Input}`]);
      resolvePending(parseInt(d20Input, 10));
    }
  };
  const confirmDice = () => {
    if (diceValid) {
      if (variant === 'player' && pendingReq) setRollHistory(h => [...h, `${shortRollLabel(pendingReq)} ${diceInputs.join(' + ')}`]);
      resolvePending(diceInputs.map(s => parseInt(s, 10)));
    }
  };
  // 「帮我掷/自动掷」：随机掷好并填入输入框，停在现场等用户按「确定」才继续。
  // 环节推进的确认权永远在用户手里，自动掷只代劳投骰本身。
  const autoFillPending = () => {
    if (!pendingReq) return;
    if (pendingReq.purpose === 'effect') {
      const count = pendingReq.count ?? 1;
      const sides = pendingReq.sides ?? 6;
      setDiceInputs(Array.from({ length: count }, () => String(1 + Math.floor(Math.random() * sides))));
    } else {
      setD20Input(String(1 + Math.floor(Math.random() * 20)));
    }
  };

  const pendingTitle = (() => {
    if (!pendingReq) return '';
    switch (pendingReq.purpose) {
      case 'save':
        return `${pendingReq.targetName ?? '目标'} ${ABILITY_LABELS[pendingReq.ability ?? ''] ?? pendingReq.ability ?? ''}豁免${pendingReq.dc != null ? ` vs DC ${pendingReq.dc}` : ''}`;
      case 'attack':
        return `法术攻击${pendingReq.targetName ? ` → ${pendingReq.targetName}` : ''}${pendingReq.ac != null ? ` vs AC ${pendingReq.ac}` : ''}`;
      case 'concentration':
        return `专注检定${pendingReq.dc != null ? ` vs DC ${pendingReq.dc}` : ''}`;
      case 'effect':
        return pendingReq.label
          ?? `效果骰 ${pendingReq.expr ?? ''}（${pendingReq.count ?? 0} 颗 d${pendingReq.sides ?? '?'}）`;
      default:
        return '';
    }
  })();

  const inputCls = 'w-20 rounded-lg px-2 py-1.5 text-sm text-center dark:bg-bg-dark light:bg-bg-light-2 dark:border-border-dark light:border-border-light border dark:text-text-dark light:text-text-light';

  const handleApply = () => {
    const saveResults: any[] = Array.isArray(saveOutput?.results) ? saveOutput.results : [];
    // 豁免成功且未配置半伤时，该目标不应用效果；半伤时仍应用减半后的结果。
    const isNegated = (targetId: string) => {
      const save = saveResults.find(r => r.targetId === targetId);
      return !!save?.success && !saveOutput?.halfDamageOnSave;
    };
    const targetResults: FlowCastTargetResult[] = effectOutputs.flatMap(output => {
      const effectResults: any[] = Array.isArray(output?.results) ? output.results : [];
      const halfOnSave = output?.halfDamageOnSave === true;
      return effectResults
        .filter(r => !r.error && r.effectApplied && !isNegated(r.targetId))
        .map(r => ({
          combatantId: r.targetId,
          name: r.targetName,
          effectType: r.effectType as 'damage' | 'healing' | 'status' | 'check_modifier' | 'advantage' | 'zone' | 'forced_move',
          effectValue: r.effectValue as number,
          finalValue: (r.finalValue ?? r.effectValue) as number,
          damageType: r.damageType ?? null,
          affinitySummary: r.affinitySummary,
          notes: Array.isArray(r.notes) ? r.notes : [],
          newHp: r.newHp as number,
          tempAbsorbed: typeof r.tempAbsorbed === 'number' ? r.tempAbsorbed : 0,
          statusId: typeof r.statusId === 'string' ? r.statusId : undefined,
          statusName: typeof r.statusName === 'string' ? r.statusName : undefined,
          statusEffects: Array.isArray(r.statusEffects) ? (r.statusEffects as Effect[]) : undefined,
          durationRounds: typeof r.durationRounds === 'number' ? r.durationRounds : undefined,
          untilNextTurn: r.untilNextTurn === true,
          turnCount: typeof r.turnCount === 'number' ? r.turnCount : undefined,
          modifierUses: typeof r.modifierUses === 'number' ? r.modifierUses : undefined,
          zone: r.zone && typeof r.zone === 'object' ? (r.zone as FlowCastZoneSpec) : undefined,
          forcedMove: r.forcedMove && typeof r.forcedMove === 'object' ? (r.forcedMove as ForcedMovePlanDraft) : undefined,
        }));
    });

    const mainEffect = effectOutput && Array.isArray(effectOutput.results)
      ? (effectOutput.results as any[]).find(r => r.targetId === target.id) ?? (effectOutput.results as any[])[0]
      : undefined;
    const mainSave = saveResults.find((r: any) => r.targetId === target.id);
    const mainHalfOnSave = effectOutput?.halfDamageOnSave === true;
    const mainNegated = !!mainSave?.success && !mainHalfOnSave;
    const success = saveOutput
      ? (mainSave ? (!mainSave.success || mainHalfOnSave) : true)
      : !!mainEffect?.effectApplied;
    const effectType: 'damage' | 'heal' | 'status' | 'check_modifier' | 'advantage' | 'zone' | 'forced_move' =
      effectOutput?.effectType === 'healing' ? 'heal' as const
      : effectOutput?.effectType === 'status' ? 'status' as const
      : effectOutput?.effectType === 'check_modifier' ? 'check_modifier' as const
      : effectOutput?.effectType === 'advantage' ? 'advantage' as const
      : effectOutput?.effectType === 'zone' ? 'zone' as const
      : effectOutput?.effectType === 'forced_move' ? 'forced_move' as const
      : 'damage' as const;

    // 摘要（先攻表格单元格宽度有限，保持一行紧凑；《》【】为渲染器标记：法术名/数值高亮）
    const parts: string[] = [];
    if (mainSave) {
      parts.push(mainSave.success ? '豁免通过' : '豁免失败');
    }
    if (mainEffect && !mainEffect.error && !mainNegated && effectType === 'status') {
      const desc = typeof mainEffect.message === 'string' && mainEffect.message
        ? mainEffect.message
        : `附加状态【${mainEffect.statusName ?? ''}】`;
      parts.push(desc);
    } else if (mainEffect && !mainEffect.error && !mainNegated && effectType === 'check_modifier') {
      // 奖惩摘要：次数型标注剩余次数来源，状态型只报附加
      const desc = typeof mainEffect.message === 'string' && mainEffect.message
        ? mainEffect.message
        : `附加检定奖惩【${mainEffect.statusName ?? ''}】`;
      const usesLabel = typeof mainEffect.modifierUses === 'number' && mainEffect.modifierUses > 0
        ? `（${mainEffect.modifierUses} 次）`
        : '';
      parts.push(`${desc}${usesLabel}`);
    } else if (mainEffect && !mainEffect.error && !mainNegated && effectType === 'advantage') {
      const desc = typeof mainEffect.message === 'string' && mainEffect.message
        ? mainEffect.message
        : `附加优劣势【${mainEffect.statusName ?? ''}】`;
      parts.push(desc);
    } else if (mainEffect && !mainEffect.error && !mainNegated && effectType === 'zone') {
      const desc = typeof mainEffect.message === 'string' && mainEffect.message
        ? mainEffect.message
        : '区域生成';
      parts.push(desc);
    } else if (mainEffect && !mainEffect.error && !mainNegated && effectType === 'forced_move') {
      const desc = typeof mainEffect.message === 'string' && mainEffect.message
        ? mainEffect.message
        : '强制位移裁决';
      parts.push(desc);
    } else if (mainEffect && !mainEffect.error && !mainNegated) {
      const finalValue = mainEffect.finalValue ?? mainEffect.effectValue;
      const affinityLabel = mainEffect.affinitySummary === 'immunity'
        ? '免疫'
        : mainEffect.affinitySummary === 'both'
          ? '抗性+易伤'
          : mainEffect.affinitySummary === 'resistance'
            ? '抗性'
            : mainEffect.affinitySummary === 'vulnerability'
              ? '易伤'
              : '';
      const valueText = finalValue !== mainEffect.effectValue
        ? `${mainEffect.effectValue}→${finalValue}`
        : `${finalValue}`;
      const halfLabel = mainEffect.halved ? '，豁免半伤' : '';
      const tempLabel = mainEffect.tempAbsorbed > 0 ? `，临时HP吸收${mainEffect.tempAbsorbed}` : '';
      parts.push(`【${valueText}】${effectType === 'damage' ? '伤害' : '生命'}，HP【${mainEffect.oldHp}→${mainEffect.newHp}】${affinityLabel ? `，${affinityLabel}` : ''}${halfLabel}${tempLabel}`);
    } else if (mainNegated) {
      parts.push('无效');
    }
    const summary = `《${spell.name}》→ ${targetsLabel ?? target.name}：${parts.join('，')}`;

    onApplied({
      spellName: spell.name,
      castingTime: spell.castingTime,
      success,
      effectType,
      amount: success ? (mainEffect?.finalValue ?? mainEffect?.effectValue ?? 0) : 0,
      targetResults,
      summary,
      concentration: spell.concentration === true,
    });
  };

  // ── 玩家引导视图：单步聚焦 + 通俗文案 + 大输入框 ──
  // 文案规则：说「谁要做什么、难度多少、请投什么骰」，隐藏节点/骰式/编译器术语
  if (variant === 'player') {
    const ABILITY_NAMES: Record<string, string> = {
      strength: '力量', dexterity: '敏捷', constitution: '体质',
      intelligence: '智力', wisdom: '感知', charisma: '魅力',
    };
    // 当前请求的引导文案（主标题 + 副说明 + 骰种）
    const guide = (() => {
      if (!pendingReq) return null;
      switch (pendingReq.purpose) {
        case 'save':
          return {
            title: `${pendingReq.targetName ?? '目标'} 需要进行${ABILITY_NAMES[pendingReq.ability ?? ''] ?? ''}豁免`,
            sub: `难度等级 DC ${pendingReq.dc ?? '?'}`,
            die: 'd20',
            hint: `投掷一颗 d20，把点数填进输入框（{目标}的豁免加值会自动计入）`,
          };
        case 'attack':
          return {
            title: `${caster.name} 对 ${pendingReq.targetName ?? '目标'} 发起法术攻击`,
            sub: `目标防御 AC ${pendingReq.ac ?? '?'}`,
            die: 'd20',
            hint: '投掷一颗 d20，把点数填进输入框',
          };
        case 'concentration':
          return {
            title: `${caster.name} 需要进行专注检定`,
            sub: `难度 DC ${pendingReq.dc ?? '?'}`,
            die: 'd20',
            hint: '投掷一颗 d20，把点数填进输入框',
          };
        default:
          return {
            title: pendingReq.label ?? '投掷法术效果骰',
            sub: `骰组 ${pendingReq.expr ?? ''}${(pendingReq.count ?? 0) > 1 ? `（共 ${pendingReq.count} 颗，逐颗输入）` : ''}`,
            die: `d${pendingReq.sides ?? '?'}`,
            hint: (pendingReq.count ?? 0) > 1 ? `投掷 ${pendingReq.count} 颗 d${pendingReq.sides}，逐颗填入` : `投掷一颗 d${pendingReq.sides}，把点数填进输入框`,
          };
      }
    })();
    // 施法结果摘要（玩家可懂结论，替代节点日志）
    const outcomeLines: string[] = [];
    for (const entry of log) {
      const data = entry.data as Record<string, any> | undefined;
      if (Array.isArray(data?.results) && data.results.some((r: any) => r.dc !== undefined)) {
        for (const r of data.results) {
          if (r.error) continue;
          outcomeLines.push(`${r.targetName} 豁免${r.success ? '通过' : '失败'}（${r.d20Roll} + ${r.saveBonus}${r.modifierTotal ? ` − ${Math.abs(r.modifierTotal)}` : ''} = ${r.total} vs DC ${r.dc}）`);
        }
      }
      if (data?.attackTotal !== undefined) {
        outcomeLines.push(`${caster.name} 的攻击${data.hit ? '命中' : '未命中'}（d20 ${data.d20Roll} = ${data.attackTotal} vs AC ${data.targetAC}）`);
      }
    }
    const bigInputCls = 'w-28 rounded-xl border-2 border-primary px-3 py-3 text-2xl text-center font-semibold text-text-dark light:text-text-light dark:bg-bg-dark light:bg-bg-light-2 focus:outline-none focus:ring-2 focus:ring-primary/40';

    return (
      <div className="space-y-4">
        {/* 施法标题 */}
        <div className="text-center space-y-1 pt-1">
          <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{spell.name}</div>
          <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{caster.name} 正在施展</div>
        </div>

        {materialEvaluation && !materialEvaluation.satisfied && (
          <SpellMaterialPanel evaluation={materialEvaluation} spellName={spell.name} onCraftMaterial={onCraftMaterial} compact />
        )}

        {/* 未开始：大按钮 */}
        {!ran && !running && (
          <div className="space-y-2">
            <button
              onClick={handleRun}
              disabled={materialEvaluation ? !materialEvaluation.satisfied : false}
              className="w-full rounded-xl px-4 py-4 text-lg font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              开始施法
            </button>
            <button onClick={onBack} className="w-full rounded-lg px-3 py-2 text-sm border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/5">
              返回
            </button>
          </div>
        )}

        {running && !pendingReq && (
          <div className="text-center py-6 text-sm dark:text-text-dark-muted light:text-text-light-muted">施法进行中…</div>
        )}

        {/* 当前步骤大卡片 */}
        {pendingReq && guide && (
          <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-5 space-y-4 text-center">
            <div className="text-xl font-semibold dark:text-text-dark light:text-text-light">{guide.title}</div>
            <div className="text-sm text-primary font-medium">{guide.sub}</div>
            <div className="text-sm dark:text-text-dark light:text-text-light pt-1">
              请投掷 <span className="font-bold">{guide.die}</span> 并输入结果
            </div>
            {pendingReq.purpose === 'effect' ? (
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {diceInputs.map((v, i) => (
                  <input
                    key={i}
                    type="number"
                    min={1}
                    max={pendingReq.sides}
                    value={v}
                    onChange={e => setDiceInputs(arr => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    onKeyDown={e => { if (e.key === 'Enter') confirmDice(); }}
                    placeholder={`d${pendingReq.sides}`}
                    autoFocus={i === 0}
                    className={bigInputCls}
                  />
                ))}
              </div>
            ) : (
              <div className="flex justify-center">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={d20Input}
                  onChange={e => setD20Input(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmD20(); }}
                  placeholder={guide.die}
                  autoFocus
                  className={bigInputCls}
                />
              </div>
            )}
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{guide.hint}</div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={pendingReq.purpose === 'effect' ? confirmDice : confirmD20}
                disabled={pendingReq.purpose === 'effect' ? !diceValid : !d20Valid}
                className="rounded-xl px-8 py-2.5 text-base font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-40"
              >
                确定
              </button>
              <button
                onClick={autoFillPending}
                className="rounded-lg px-4 py-2 text-sm border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/5"
              >
                帮我掷
              </button>
            </div>
          </div>
        )}

        {/* 已完成骰值摘要 */}
        {rollHistory.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {rollHistory.map((h, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                <Check className="w-3 h-3" />{h}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* 施法结果 + 完成按钮 */}
        {ran && !running && !pendingReq && (
          <div className="space-y-3">
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-1.5 text-center">
              <div className="text-sm font-semibold dark:text-text-dark light:text-text-light">施法完成</div>
              {outcomeLines.length > 0 ? (
                outcomeLines.map((l, i) => (
                  <div key={i} className="text-xs dark:text-text-dark-muted light:text-text-light-muted">{l}</div>
                ))
              ) : (
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">效果已结算</div>
              )}
            </div>
            <button
              onClick={handleApply}
              className="w-full rounded-xl px-4 py-3.5 text-base font-semibold bg-primary text-white hover:bg-primary/90"
            >
              完成施法
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 流程卡片头 */}
      <div className="flex items-center gap-2 rounded-lg p-2.5 border dark:bg-bg-dark light:bg-bg-light-2 dark:border-border-dark/50 light:border-border-light/50">
        <Workflow className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium dark:text-text-dark light:text-text-light truncate">{flow.name}</div>
          <div className="text-[11px] dark:text-text-dark-muted light:text-text-light-muted">
            {flow.nodes.length} 节点 · {flow.edges.length} 边{flow.publishedVersion ? ` · v${flow.publishedVersion}` : ''}
          </div>
        </div>
      </div>

      {spell.components?.material && materialEvaluation && (
        <SpellMaterialPanel
          evaluation={materialEvaluation}
          spellName={spell.name}
          onCraftMaterial={onCraftMaterial}
          onCraftScroll={onCraftScroll}
          compact
        />
      )}

      {/* 手动掷骰开关（默认开：现场投骰后输入；关 = 全自动随机） */}
      <label className="flex items-center gap-1.5 text-xs dark:text-text-dark-muted light:text-text-light-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={manualDice}
          onChange={e => setManualDice(e.target.checked)}
          disabled={running}
        />
        手动掷骰（现场投骰后输入，每个检定/效果骰暂停确认）
      </label>

      {/* 执行 / 重跑 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRun}
          disabled={running || (materialEvaluation ? !materialEvaluation.satisfied : false)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {running ? '执行中…' : ran ? '重新执行' : '执行流程'}
        </button>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm border dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ChevronLeft className="w-4 h-4" />
          返回
        </button>
      </div>

      {/* 悬停骰值请求：现场投骰后输入，或点自动掷交给编译器随机 */}
      {pendingReq && (
        <div className="rounded-lg p-3 border border-primary/40 bg-primary/5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium dark:text-text-dark light:text-text-light">
            <Dices className="w-4 h-4 text-primary shrink-0" />
            <span>{pendingTitle}</span>
            <span className="dark:text-text-dark-muted light:text-text-light-muted font-normal">—— 现场投骰后输入</span>
          </div>
          {pendingReq.purpose === 'effect' ? (
            <div className="flex items-center gap-2 flex-wrap">
              {diceInputs.map((v, i) => (
                <input
                  key={i}
                  type="number"
                  min={1}
                  max={pendingReq.sides}
                  value={v}
                  onChange={e => setDiceInputs(arr => arr.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={`d${pendingReq.sides}`}
                  autoFocus={i === 0}
                  className={inputCls}
                />
              ))}
              <button
                onClick={confirmDice}
                disabled={!diceValid}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                确认
              </button>
              <button
                onClick={autoFillPending}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Dices className="w-3.5 h-3.5" />
                自动掷
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={20}
                value={d20Input}
                onChange={e => setD20Input(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmD20(); }}
                placeholder="d20"
                autoFocus
                className={inputCls}
              />
              <button
                onClick={confirmD20}
                disabled={!d20Valid}
                className="rounded-lg px-3 py-1.5 text-xs font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                确认
              </button>
              <button
                onClick={autoFillPending}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Dices className="w-3.5 h-3.5" />
                自动掷
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* 执行日志（逐节点） */}
      {ran && log.length === 0 && !error && (
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted p-2.5 rounded-lg border border-dashed dark:border-border-dark light:border-border-light">
          流程无可执行节点（检查 cast_start 入口与边连接）
        </div>
      )}
      {log.map((entry, i) => {
        const data = entry.data as Record<string, any> | undefined;
        return (
          <div key={`${entry.nodeId}-${i}`} className={`rounded-lg p-2.5 border text-xs space-y-1.5 ${STATUS_STYLES[entry.status]}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{nodeLabel.get(entry.nodeId) ?? entry.nodeId}</span>
              <span className="text-[10px] opacity-70">{entry.status}</span>
            </div>
            {entry.message && <div className="opacity-80">{entry.message}</div>}
            {/* 豁免逐目标明细 */}
            {Array.isArray(data?.results) && data.results.some((r: any) => r.dc !== undefined) && (
              <div className="space-y-1 opacity-90">
                {data.results.map((r: any, j: number) => (
                  <div key={j} className="flex items-center justify-between gap-2">
                    <span>{r.error ? `${r.targetId}: ${r.error}` : `${r.targetName} d20 ${r.d20Roll}+${r.saveBonus}=${r.total} vs DC ${r.dc}`}</span>
                    <span className="font-medium">{r.success ? '通过' : '失败'}</span>
                  </div>
                ))}
              </div>
            )}
            {/* 分级取值明细 */}
            {data?.scaleSource && (
              <div className="opacity-90">
                缩放：{data.scaleSource} → 档位 {data.matchedTier?.value}
                {(data.dice?.values?.length ?? 0) > 0 && ` · 骰值 [${data.dice.values.join(', ')}]${data.dice.bonus ? `+${data.dice.bonus}` : ''}${data.dice.manual ? '（手动）' : ''}`}
              </div>
            )}
            {/* 骰值明细（apply_effect 无缩放时） */}
            {!data?.scaleSource && (data?.dice?.values?.length ?? 0) > 0 && (
              <div className="opacity-90">骰值 [{data.dice.values.join(', ')}]{data.dice.bonus ? `+${data.dice.bonus}` : ''}{data.dice.manual ? '（手动）' : ''}</div>
            )}
            {/* 多类型伤害分量骰值 */}
            {Array.isArray(data?.diceList) && data.diceList.length > 0 && (
              <div className="space-y-1 opacity-90">
                {data.diceList.map((d: any, j: number) => (
                  <div key={j}>
                    {d.type ?? '未声明类型'} {d.expression ?? ''}
                    {Array.isArray(d.values) && d.values.length > 0 ? ` · 骰值 [${d.values.join(', ')}]` : ''}
                    {d.bonus ? `+${d.bonus}` : ''}
                  </div>
                ))}
              </div>
            )}
            {/* HP 变更明细 */}
            {Array.isArray(data?.results) && data.results.some((r: any) => r.newHp !== undefined) && (
              <div className="space-y-1 opacity-90">
                {data.results.filter((r: any) => !r.error).map((r: any, j: number) => (
                  <div key={j} className="flex items-center justify-between gap-2">
                    <span>{r.targetName}</span>
                    <span className="font-medium">{r.oldHp} → {r.newHp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 确认应用：HP 回写交宿主 */}
      <button
        onClick={handleApply}
        disabled={!ran || running}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        <Check className="w-4 h-4" />
        确认应用{effectOutput
          ? `（${effectOutput.effectType === 'healing' ? '治疗' : '伤害'} ${effectOutput.matchedTier?.value ?? effectOutput.value ?? ''}）`
          : '（无效果节点，仅记录）'}
      </button>
    </div>
  );
}
