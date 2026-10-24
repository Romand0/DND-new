// DSL 编译器 - 节点执行引擎
// 将流程图中的节点转换为可执行的逻辑
// Phase 2：图遍历执行（按边驱动 + trigger 匹配）、安全表达式求值、真实数据注入
// （施法加值/AC/属性修正/完整骰式/沙盘距离）。
// Phase 3：战斗身份映射落地——context.combatants 注入参战者映射，NPC 豁免/AC/HP 直读
// 参战者字段，PC 经 characterId 回落角色卡；效果结算纯计算不落库（由战斗弹窗确认后回写）。
import type {
  FlowDefinition,
  FlowNodeDef,
  FlowExecutionContext,
  NodeExecutionResult,
  PreCastCheckReport,
  CastStartConfig,
  CheckResult,
  SavingThrowConfig,
  FlowLogEntry,
  FlowDiceSource,
  FlowDiceRequest
} from '@/types/flow';
import type { Character, AbilityKey } from '@/types/character';
import type { Combatant } from '@/types/combat';
import type { Spell } from '@/types/spell';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import { rollDie, rollDice } from '@/data/diceService';
import { deriveCanGesticulate, SOMATIC_BLOCKING_CONDITIONS, type SomaticBlockingCondition } from '@/data/somaticCheck';
import { parseDice } from '@/utils/diceExpr';
import { evaluateExpression } from '@/lib/flowExpression';
import { createUntypedResolution, normalizeDamageType, resolveDamage } from '@/data/damageRules';
import { getCombatantAffinities } from '@/data/combatAffinities';
import statusLibrary from '@/data/statusLibrary';
import type { Effect } from '@/types/status';
import type { DamageSource, DamageType } from '@/types/damage';

/** 六属性全名（AbilityKey 收窄用） */
const ABILITY_KEYS: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

/** 通用伤害修饰状态 ID（statusLibrary 注册，抗性/免疫/易伤实例的统一载体） */
export const GENERIC_AFFINITY_STATUS_ID = 'damage_affinity';

/** 伤害类型中文标签（摘要文本用） */
const DAMAGE_TYPE_LABELS: Record<string, string> = {
  bludgeoning: '钝击', piercing: '穿刺', slashing: '挥砍', fire: '火焰', cold: '寒冷',
  lightning: '闪电', acid: '酸蚀', poison: '毒素', force: '力场', necrotic: '黯蚀',
  radiant: '光耀', psychic: '心灵', thunder: '雷鸣',
};

const SOURCE_KIND_LABELS: Record<string, string> = { weapon: '武器', spell: '法术', effect: '效果' };

/** 生成人类可读的效果描述（摘要/状态说明共用） */
function buildAffinityDescription(
  affinityKind: string,
  types: string[],
  sourceKind?: string
): string {
  const kindLabel = affinityKind === 'immunity' ? '免疫' : affinityKind === 'vulnerability' ? '易伤' : '抗性';
  const scopeLabel = sourceKind ? `${SOURCE_KIND_LABELS[sourceKind] ?? sourceKind}攻击造成的` : '';
  const typesLabel = types.length > 0
    ? types.map(t => DAMAGE_TYPE_LABELS[t] ?? t).join('/')
    : '全部类型';
  return `获得${kindLabel}：${scopeLabel}${typesLabel}伤害`;
}

/** 从 Character.abilities 安全取属性调整值（AbilityScore {score, modifier}） */
function abilityModifier(char: Character, ability: string): number {
  const entry = char.abilities?.[ability as AbilityKey];
  if (!entry || typeof entry.score !== 'number') return 0;
  return Math.floor((entry.score - 10) / 2);
}

/** 从 Combatant 六维字段安全取属性调整值（NPC 参战者无角色卡） */
function combatantAbilityModifier(c: Combatant, ability: string): number {
  const score = (c as unknown as Record<string, unknown>)[ability];
  return typeof score === 'number' ? Math.floor((score - 10) / 2) : 0;
}

/** NPC 参战者施法属性启发式：无角色卡时取精神三维（智/感/魅）最大调整值（怪物天生施法属性的常见落点） */
function combatantCastingModifier(c: Combatant): number {
  return Math.max(
    combatantAbilityModifier(c, 'intelligence'),
    combatantAbilityModifier(c, 'wisdom'),
    combatantAbilityModifier(c, 'charisma'),
  );
}

/** 节点结果到出边 trigger 的匹配（§2.2 边目录语义） */
function triggerMatches(trigger: string, result: NodeExecutionResult): boolean {
  switch (trigger) {
    case 'on_complete': return true;
    case 'on_success': return result.status === 'success';
    case 'on_failure': return result.status === 'failure';
    case 'on_partial': return result.status === 'partial';
    case 'on_true': return result.output?.result === true;
    case 'on_false': return result.output?.result === false;
    default: return false;
  }
}

export class FlowCompiler {
  // ======================
  // 身份解析（战斗参战者 ↔ 角色卡）
  // ======================

  /** 按身份取参战者：combatants 映射存在时 id 即参战者 id；无映射（非战斗场景）恒 null */
  private resolveCombatant(id: string, context: FlowExecutionContext): Combatant | null {
    return context.combatants?.[id] ?? null;
  }

  /**
   * 按身份取角色卡：PC 参战者经 characterId 引用；无 combatants 映射（非战斗场景）时
   * id 直接当角色卡 ID（旧行为）；纯 NPC 参战者返回 null。
   */
  private resolveCharacter(id: string, context: FlowExecutionContext): Character | null {
    const combatant = context.combatants?.[id];
    if (combatant) {
      return combatant.characterId ? characterStore.get(combatant.characterId) : null;
    }
    if (!context.combatants) return characterStore.get(id);
    return null;
  }

  /** 目标豁免加值：纯 NPC 参战者 = 属性调整值 + 熟练属性 × 熟练加值（与 SpellCheckStep 推导一致） */
  private npcSaveBonus(c: Combatant, ability: AbilityKey): number {
    const mod = combatantAbilityModifier(c, ability);
    const pb = typeof c.proficiencyBonus === 'number' ? c.proficiencyBonus : 0;
    return mod + (c.proficientSaves?.includes(ability) ? pb : 0);
  }


  // ======================
  // 骰源钩子（现场投骰手动输入）：返回 null/undefined 回落自动掷
  // ======================

  /** d20 检定骰：骰源返回 1-20 整数则采用，否则自动掷 */
  private async rollCheckD20(req: FlowDiceRequest, diceSource?: FlowDiceSource): Promise<number> {
    if (diceSource) {
      const v = await diceSource(req);
      if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 20) {
        return Math.floor(v);
      }
    }
    return rollDie(20);
  }

  /** 效果骰组：骰源返回长度 = count 的数组则逐颗采用，否则自动掷（一次掷骰全目标共用） */
  private async rollEffectValueWithSource(
    value: string,
    reqBase: FlowDiceRequest,
    diceSource?: FlowDiceSource,
  ): Promise<{ effectValue: number; diceDetail: { expr: string; count: number; sides: number; bonus: number; values: number[]; manual?: boolean } | null }> {
    let parsed: { count: number; sides: number; bonus: number };
    try {
      parsed = parseDice(value);
    } catch {
      return { effectValue: 0, diceDetail: null };
    }
    if (parsed.count <= 0 || parsed.sides <= 0) {
      return { effectValue: parsed.count === 0 ? parsed.bonus : 0, diceDetail: null };
    }

    if (diceSource) {
      const v = await diceSource({ ...reqBase, expr: value, count: parsed.count, sides: parsed.sides });
      if (Array.isArray(v) && v.length === parsed.count && v.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= parsed.sides)) {
        const values = v.map(n => Math.floor(n));
        return {
          effectValue: values.reduce((sum, n) => sum + n, 0) + parsed.bonus,
          diceDetail: { expr: value, count: parsed.count, sides: parsed.sides, bonus: parsed.bonus, values, manual: true },
        };
      }
    }

    const result = rollDice({ sides: parsed.sides as 4 | 6 | 8 | 10 | 12 | 20, count: parsed.count, mode: 'independent' });
    return {
      effectValue: result.values.reduce((sum, n) => sum + n, 0) + parsed.bonus,
      diceDetail: { expr: value, count: parsed.count, sides: parsed.sides, bonus: parsed.bonus, values: result.values },
    };
  }

  /**
   * 执行流程：从 cast_start 入口按边遍历整张图。
   * 每个节点至多执行一次（visited 守卫防环）；执行轨迹写入 context.log（FlowLogEntry），
   * 节点输出缓存进 context.results。返回最后一个执行节点的结果（通常为 cast_end）。
   */
  async executeFlow(
    flow: FlowDefinition,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    const startNode = flow.nodes.find(node => node.type === 'cast_start');

    if (!startNode) {
      throw new Error('流程缺少施法开始节点');
    }

    const nodeById = new Map(flow.nodes.map(n => [n.id, n]));
    const outEdges = new Map<string, FlowDefinition['edges'][number][]>();
    for (const edge of flow.edges) {
      const list = outEdges.get(edge.from) ?? [];
      list.push(edge);
      outEdges.set(edge.from, list);
    }

    const visited = new Set<string>();
    let lastResult: NodeExecutionResult | null = null;
    // 步数上限：节点数 × 出边数，防异常图死循环（visited 已挡环，这里是双保险）
    const maxSteps = flow.nodes.length * Math.max(1, flow.edges.length) + flow.nodes.length;
    let steps = 0;

    // 深度优先：按声明顺序展开匹配的出边（分支语义由 triggerMatches 决定）
    const stack: FlowNodeDef[] = [startNode];
    while (stack.length > 0 && steps < maxSteps) {
      const node = stack.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      steps++;

      const result = await this.executeNode(node, context, diceSource);
      lastResult = result;

      // 日志与输出缓存
      context.results.set(node.id, result.output);
      const logEntry: FlowLogEntry = {
        timestamp: Date.now(),
        nodeId: node.id,
        nodeType: node.type,
        status: result.status === 'partial' ? 'partial' : result.status,
        message: typeof result.output?.message === 'string' ? result.output.message : '',
        data: result.output,
      };
      context.log.push(logEntry);

      // 匹配出边入栈（保持声明顺序）
      const nextEdges = (outEdges.get(node.id) ?? []).filter(e => triggerMatches(e.trigger, result));
      for (const edge of nextEdges) {
        const next = nodeById.get(edge.to);
        if (next && !visited.has(next.id)) stack.unshift(next);
      }
    }

    if (steps >= maxSteps && stack.length > 0) {
      return {
        status: 'failure',
        output: { error: '流程执行步数超限（疑似异常图结构），已中止', executedNodeIds: [...visited] },
      };
    }

    return lastResult ?? { status: 'failure', output: { error: '流程未执行任何节点' } };
  }

  /**
   * 执行单个节点
   */
  async executeNode(
    node: FlowNodeDef,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    switch (node.type) {
      case 'cast_start':
        return this.executeCastStartNode(node, context);
      case 'select_target':
        return this.executeSelectTargetNode(node, context);
      case 'saving_throw':
        return this.executeSavingThrowNode(node, context, diceSource);
      case 'attack_roll':
        return this.executeAttackRollNode(node, context, diceSource);
      case 'condition_branch':
        return this.executeConditionBranchNode(node, context);
      case 'apply_effect':
        return this.executeApplyEffectNode(node, context, diceSource);
      case 'scaled_effect':
        return this.executeScaledEffectNode(node, context, diceSource);
      case 'concentration_check':
        return this.executeConcentrationCheckNode(node, context, diceSource);
      case 'cast_end':
        return this.executeCastEndNode(node, context);
      case 'custom':
        return this.executeCustomNode(node, context);
      default:
        throw new Error(`未知的节点类型: ${node.type}`);
    }
  }

  /**
   * 执行智能施法开始节点
   */
  private async executeCastStartNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    // 使用流程级别的 spellId，而不是节点级别
    const spellId = context.spellId;

    if (!spellId) {
      return {
        status: 'failure',
        output: { error: '流程未绑定法术' }
      };
    }

    const spell = spellStore.getById(spellId);
    if (!spell) {
      return {
        status: 'failure',
        output: { error: '法术不存在' }
      };
    }

    // 施法者身份：PC 参战者经 characterId 查角色卡；纯 NPC 参战者用最小桩（成分/施法时间检查降级通过）
    const casterCharacter = this.resolveCharacter(context.casterId, context);
    const casterCombatant = this.resolveCombatant(context.casterId, context);
    const caster: Character = casterCharacter ?? (casterCombatant
      ? { name: casterCombatant.name, canSpeak: true, canGesticulate: true } as unknown as Character
      : null as unknown as Character);
    if (!caster) {
      return {
        status: 'failure',
        output: { error: '施法者不存在' }
      };
    }

    const config = node.config as CastStartConfig;

    // 执行前置检查
    const casterPos = context.positions?.[context.casterId] ?? null;
    const checkReport = await this.executePreCastChecks(spell, caster, config, context.targets, context.positions, casterPos);

    // 如果检查失败，直接返回失败结果
    if (checkReport.overall === 'fail') {
      return {
        status: 'failure',
        output: {
          checkReport,
          error: '前置检查失败，法术无法施放'
        }
      };
    }

    // 检查通过，继续执行
    return {
      status: 'success',
      output: {
        spellId, // 从流程级别获取
        checkReport,
        spellSlotReserved: true,
        message: '前置检查通过，可以继续施法'
      }
    };
  }

  /**
   * 执行目标选择节点
   */
  private async executeSelectTargetNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const mode = config?.mode || 'single';
    const maxCount = config?.maxCount || 1;

    // 检查目标数量是否符合要求
    if (context.targets.length === 0) {
      return {
        status: 'failure',
        output: { error: '未选择目标' }
      };
    }

    if (mode === 'single' && context.targets.length > 1) {
      return {
        status: 'failure',
        output: { error: '单体目标模式下只能选择一个目标' }
      };
    }

    if (context.targets.length > maxCount) {
      return {
        status: 'failure',
        output: { error: `最多只能选择 ${maxCount} 个目标` }
      };
    }

    return {
      status: 'success',
      output: {
        mode,
        selectedTargets: context.targets,
        message: `已选择 ${context.targets.length} 个目标`
      }
    };
  }

  /**
   * 执行前置检查
   */
  private async executePreCastChecks(
    spell: Spell,
    caster: Character,
    config: CastStartConfig,
    targets: string[],
    positions?: FlowExecutionContext['positions'],
    casterPos?: { col: number; row: number } | null,
  ): Promise<PreCastCheckReport> {
    const components = this.checkComponents(spell, caster, []);
    const range = this.checkRange(spell, config, targets, positions, casterPos);
    const time = this.checkTime(spell, config, caster);

    // 计算总体结果
    const checks = [components.available, range.inRange, time.available];
    const overall: CheckResult = checks.every(Boolean)
      ? 'pass'
      : checks.some(Boolean)
        ? 'partial'
        : 'fail';

    // 生成自动检查报告文本
    const autoChecks: string[] = [];

    // 添加成分检查
    if (config.autoChecks.components) {
      const componentChecks: string[] = [];
      if (spell.components.verbal) {
        componentChecks.push(`施法者可言语: ${caster.canSpeak !== false ? '是' : '否'}`);
      }
      if (spell.components.somatic) {
        componentChecks.push(`施法者可做手势: ${components.somaticDetail?.canGesticulate !== false ? '是' : '否'}`);
      }
      if (spell.components.material) {
        componentChecks.push(`材料组件: 已准备`);
      }
      if (componentChecks.length > 0) {
        autoChecks.push(`成分检查: ${componentChecks.join(', ')}`);
      }
    }

    // 添加距离检查（真实沙盘距离：切比雪夫 × 5 尺；无位置数据时跳过并注明）
    if (config.autoChecks.range) {
      autoChecks.push(`距离检查: ${range.current}尺 ≤ 要求${range.required}尺 - ${range.inRange ? '通过' : '失败'}${range.assumed ? '（无位置数据，跳过校验）' : ''}`);
    }

    // 添加时间检查
    if (config.autoChecks.time) {
      const required = (config.overrideTime ?? spell.castingTime) || '1 action';
      const available = this.isCastingTimeAvailable(required, caster);
      autoChecks.push(`时间检查: ${required} - ${available ? '可用' : '不可用'}`);
    }

    return {
      components,
      range,
      time,
      overall,
      autoChecks
    };
  }

  /**
   * 检查法术成分
   */
  private checkComponents(
    spell: Spell,
    combatant: any,
    activeConditions: string[],
  ) {
    const required: string[] = [];
    if (spell.components?.verbal)   required.push('V');
    if (spell.components?.somatic)  required.push('S');
    if (spell.components?.material) required.push('M');

    const missing: string[] = [];

    // V 检查（已有）
    if (spell.components?.verbal && !combatant.canSpeak) {
      missing.push('V');
    }

    // S 检查（新增）
    let somaticDetail: any;
    if (spell.components?.somatic) {
      const derived = deriveCanGesticulate(combatant, activeConditions);

      // DM 手动覆盖优先：若 canGesticulate 被显式设为 false，则强制不可用
      const finalCanGesticulate = combatant.canGesticulate === false ? false : derived;

      if (!finalCanGesticulate) {
        missing.push('S');
      }

      // 收集详情
      const blocking = activeConditions.filter(c =>
        SOMATIC_BLOCKING_CONDITIONS.has(c as SomaticBlockingCondition)
      );
      somaticDetail = {
        canGesticulate: finalCanGesticulate,
        blockingConditions: combatant.isIncapacitated
          ? ['incapacitated', ...blocking]
          : blocking,
        manualOverride: combatant.canGesticulate === false && derived === true,
      };
    }

    // M 检查（暂无运行时判定，跳过）

    return {
      required,
      available: missing.length === 0,
      missing: missing.length > 0 ? missing : undefined,
      somaticDetail,
    };
  }

  /**
   * 检查施法距离
   * Phase 2：施法者与目标均有沙盘位置时按切比雪夫距离（×5 尺/格）真实校验，
   * 目标取所有可定位目标中最近者；任一方无位置数据时跳过校验（inRange=true + assumed 标记），保持旧行为兼容。
   */
  private checkRange(
    spell: Spell,
    config: CastStartConfig,
    targets: string[],
    positions?: FlowExecutionContext['positions'],
    casterPos?: { col: number; row: number } | null,
  ) {
    // 解析法术射程字符串中的数字（如 "60尺" → 60，"120尺" → 120），特殊射程回退默认 30
    const spellRange = typeof spell.range === 'string'
      ? parseInt(spell.range.replace(/\D/g, ''), 10)
      : NaN;
    const required = config.overrideRange ?? (Number.isFinite(spellRange) ? spellRange : 30);

    if (casterPos && positions && targets.length > 0) {
      let nearest = Infinity;
      for (const targetId of targets) {
        const pos = positions[targetId];
        if (!pos) continue;
        const cells = Math.max(Math.abs(casterPos.col - pos.col), Math.abs(casterPos.row - pos.row));
        nearest = Math.min(nearest, cells * 5);
      }
      if (Number.isFinite(nearest)) {
        return { required, current: nearest, inRange: nearest <= required, assumed: false };
      }
    }

    return { required, current: 0, inRange: true, assumed: true };
  }

  /**
   * 检查施法时间
   */
  private checkTime(spell: Spell, config: CastStartConfig, caster: Character) {
    const required = (config.overrideTime ?? spell.castingTime) || '1 action';

    // 检查施法时间是否可用
    const available = this.isCastingTimeAvailable(required, caster);

    return {
      required,
      available
    };
  }

  /**
   * 检查是否有组件
   */
  private hasComponent(caster: any, component: string): boolean {
    switch (component) {
      case 'verbal':
        return caster.canSpeak !== false;
      case 'somatic':
        return caster.canGesticulate !== false;
      case 'material':
        return true; // 简化处理
      default:
        return true;
    }
  }

  /**
   * 检查施法时间是否可用
   */
  private isCastingTimeAvailable(castingTime: string, caster: Character): boolean {
    // 简化处理：假设总是可用
    // 实际实现中需要检查动作点数
    return true;
  }

  /**
   * 执行豁免检定节点
   * Phase 2 修复：属性调整值从 AbilityScore.score 重算（旧代码对象直接减法得 NaN，判定恒失败）；
   * 熟练加值走 characterStore.getSaveBonus（PC 标准豁免）；节点状态反映多目标结果（全成/全败/混合）。
   */
  private async executeSavingThrowNode(
    node: FlowNodeDef,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    const config = node.config as SavingThrowConfig;
    const ability = config?.ability || 'dexterity';

    // DC 语义：留空 = 施法者法术豁免 DC（8 + 施法属性调整值 + 熟练）；显式数字 = 固定 DC（非法数字回落 10）
    // 施法者无角色卡（纯 NPC 参战者）时启发式：8 + 熟练加值 + 精神三维最大调整值
    let dc: number;
    const rawDc = config?.dc?.toString().trim() ?? '';
    if (rawDc === '') {
      const casterCharacter = this.resolveCharacter(context.casterId, context);
      const casterDc = casterCharacter ? characterStore.getSpellSaveDC(casterCharacter) : null;
      if (casterDc !== null) {
        dc = casterDc;
      } else {
        const casterCombatant = this.resolveCombatant(context.casterId, context);
        if (!casterCombatant) {
          return {
            status: 'failure',
            output: { error: 'DC 未配置且施法者无法术豁免 DC' },
          };
        }
        const pb = typeof casterCombatant.proficiencyBonus === 'number' ? casterCombatant.proficiencyBonus : 2;
        dc = 8 + pb + combatantCastingModifier(casterCombatant);
      }
    } else {
      dc = parseInt(rawDc, 10);
      if (isNaN(dc)) dc = 10;
    }

    const results: any[] = [];

    for (const targetId of context.targets) {
      const targetCombatant = this.resolveCombatant(targetId, context);
      const targetCharacter = this.resolveCharacter(targetId, context);
      if (!targetCombatant && !targetCharacter) {
        results.push({
          targetId,
          success: false,
          error: '目标不存在'
        });
        continue;
      }

      // 豁免加值：纯 NPC 参战者走参战者字段；PC（有角色卡）走角色卡熟练豁免；数据缺失时回退属性调整值
      let saveBonus: number;
      if (targetCharacter) {
        try {
          saveBonus = characterStore.getSaveBonus(targetCharacter, ability as AbilityKey);
        } catch {
          saveBonus = abilityModifier(targetCharacter, ability);
        }
      } else {
        saveBonus = this.npcSaveBonus(targetCombatant, ability as AbilityKey);
      }
      const targetName = targetCombatant?.name ?? targetCharacter?.name ?? targetId;
      const abilityScore = targetCharacter
        ? targetCharacter.abilities?.[ability as AbilityKey]?.score
        : (targetCombatant as unknown as Record<string, unknown>)[ability];

      // 现场投骰：骰源注入时先询问手动值（附 DC 上下文供输入界面显示），null 回落自动掷
      const d20Roll = await this.rollCheckD20(
        { purpose: 'save', targetId, targetName, ability, dc },
        diceSource,
      );
      const total = d20Roll + saveBonus;
      const success = total >= dc;

      results.push({
        targetId,
        targetName,
        ability,
        abilityScore,
        saveBonus,
        dc,
        d20Roll,
        total,
        success
      });
    }

    const valid = results.filter(r => !r.error);
    const successCount = valid.filter(r => r.success).length;
    const status: NodeExecutionResult['status'] =
      valid.length === 0 ? 'failure'
      : successCount === valid.length ? 'success'
      : successCount === 0 ? 'failure'
      : 'partial';

    return {
      status,
      output: {
        results,
        dc,
        ability,
        message: `豁免检定完成，${successCount}/${valid.length} 个目标成功`
      }
    };
  }

  /**
   * 执行法术攻击节点
   * Phase 2 修复：攻击加值走 characterStore.getSpellAttackBonus（旧硬编码 5）；
   * 目标 AC 优先读 target.armorClass（旧硬编码 15）；自然 20 必中 / 自然 1 必失。
   */
  private async executeAttackRollNode(
    node: FlowNodeDef,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    // 施法者攻击加值：有角色卡走 getSpellAttackBonus；纯 NPC 参战者启发式 = 熟练加值 + 精神三维最大调整值
    const casterCharacter = this.resolveCharacter(context.casterId, context);
    let spellAttackBonus: number;
    if (casterCharacter) {
      spellAttackBonus = characterStore.getSpellAttackBonus(casterCharacter) ?? 0;
    } else {
      const casterCombatant = this.resolveCombatant(context.casterId, context);
      if (!casterCombatant) {
        return {
          status: 'failure',
          output: { error: '施法者不存在' }
        };
      }
      const pb = typeof casterCombatant.proficiencyBonus === 'number' ? casterCombatant.proficiencyBonus : 2;
      spellAttackBonus = pb + combatantCastingModifier(casterCombatant);
    }

    const results: any[] = [];

    for (const targetId of context.targets) {
      const targetCombatant = this.resolveCombatant(targetId, context);
      const targetCharacter = this.resolveCharacter(targetId, context);
      if (!targetCombatant && !targetCharacter) {
        results.push({
          targetId,
          hit: false,
          error: '目标不存在'
        });
        continue;
      }

      // 目标 AC：参战者 ac 优先（战斗背包不参与重算，弹窗侧已传入计算后的值时可在此覆盖），
      // 角色卡 armorClass 兜底，均无按 15 估算
      const targetAC = typeof targetCombatant?.ac === 'number'
        ? targetCombatant.ac
        : typeof (targetCharacter as unknown as { armorClass?: number } | null)?.armorClass === 'number'
          ? (targetCharacter as unknown as { armorClass: number }).armorClass
          : 15;
      // 现场投骰：骰源注入时先询问手动值（附 AC 上下文），null 回落自动掷
      const d20Roll = await this.rollCheckD20(
        { purpose: 'attack', targetId, targetName: targetCombatant?.name ?? targetCharacter?.name ?? targetId, ac: targetAC },
        diceSource,
      );
      const attackTotal = d20Roll + spellAttackBonus;
      // D&D 5e：自然 20 必中，自然 1 必失
      const hit = d20Roll === 20 ? true : d20Roll === 1 ? false : attackTotal >= targetAC;

      results.push({
        targetId,
        targetName: targetCombatant?.name ?? targetCharacter?.name ?? targetId,
        attackBonus: spellAttackBonus,
        d20Roll,
        attackTotal,
        targetAC,
        isNatural20: d20Roll === 20,
        isNatural1: d20Roll === 1,
        hit
      });
    }

    const valid = results.filter(r => !r.error);
    const hitCount = valid.filter(r => r.hit).length;
    const status: NodeExecutionResult['status'] =
      valid.length === 0 ? 'failure'
      : hitCount === valid.length ? 'success'
      : hitCount === 0 ? 'failure'
      : 'partial';

    return {
      status,
      output: {
        results,
        message: `攻击检定完成，${hitCount}/${valid.length} 个目标被击中`
      }
    };
  }

  /**
   * 执行条件分支节点
   * Phase 2 修复：裸 eval 换成白名单表达式求值器（flowExpression.ts），
   * 作用域注入 state / results / spell / caster / targets / prev。
   */
  private async executeConditionBranchNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const condition = config?.condition || 'true';

    // 作用域：stateSnapshot 只读暴露；results 已是 Map，摊平成对象便于表达式引用
    const resultsObj: Record<string, any> = {};
    context.results.forEach((v, k) => { resultsObj[k] = v; });

    const scope: Record<string, unknown> = {
      state: context.stateSnapshot ?? {},
      results: resultsObj,
      spell: context.spellId ? spellStore.getById(context.spellId) : null,
      caster: this.resolveCharacter(context.casterId, context) ?? this.resolveCombatant(context.casterId, context),
      targets: context.targets,
      prev: resultsObj.results ?? null,
    };

    try {
      const conditionResult = evaluateExpression(condition, scope);

      return {
        status: 'success',
        output: {
          condition,
          result: conditionResult,
          message: `条件分支: ${condition} = ${conditionResult}`
        }
      };
    } catch (error) {
      return {
        status: 'failure',
        output: {
          error: `条件表达式错误: ${error}`
        }
      };
    }
  }

  /**
   * 执行效果应用节点
   * Phase 2 修复：骰式完整解析（NdM+K 全骰投掷，旧代码 8d6 只掷一颗）；
   * 同一次执行内所有目标共用一次伤害掷骰（5e 标准：伤害掷一次应用于全部目标）。
   */
  private async executeApplyEffectNode(
    node: FlowNodeDef,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const effectType = config?.effectType || 'damage';
    const value = config?.value || '0';
    const damageType = config?.damageType || '';
    const halfDamageOnSave = config?.halfDamageOnSave === true;

    // 状态附加（通用伤害修饰引擎）：节点配置 affinityKind/damageTypes/sourceKind/durationRounds
    // → 产出待落地记录（statusId 固定 damage_affinity + 实例级 effects），由战斗确认侧
    // （CombatSession.onFlowResolved）统一调 globalStatusManager.applyEffect 写入。
    // 与 HP 同款「编译器不落库」原则：重复执行预演不会叠加施加状态。
    // 新增防护类法术（任意伤害类型/来源组合）只需配节点参数，状态库与编译器零改动。
    if (effectType === 'status') {
      const affinityKind = String(config?.affinityKind ?? 'resistance');
      const effectTypeMap: Record<string, Effect['type']> = {
        resistance: 'damage_resistance',
        immunity: 'damage_immunity',
        vulnerability: 'damage_vulnerability',
      };
      const mappedEffectType = effectTypeMap[affinityKind];
      if (!mappedEffectType) {
        return {
          status: 'failure',
          output: { error: `未知的伤害修饰类型「${affinityKind}」（可选 resistance/immunity/vulnerability）` },
        };
      }
      const types = String(config?.damageTypes ?? '')
        .split(/[,，、\s]+/)
        .map(s => s.trim())
        .filter(Boolean);
      const sourceKindRaw = String(config?.sourceKind ?? '');
      const sourceKind = ['weapon', 'spell', 'effect'].includes(sourceKindRaw) ? sourceKindRaw : undefined;
      const durationRounds = Math.max(0, Math.floor(Number(config?.durationRounds ?? 0)) || 0);

      const effect: Effect = {
        id: `flow.damage_affinity.${affinityKind}`,
        type: mappedEffectType,
        target: 'self',
        config: {
          ...(types.length > 0 ? { types } : {}),
          ...(sourceKind ? { sourceKind } : {}),
        },
        description: buildAffinityDescription(affinityKind, types, sourceKind),
      };
      const affinityDefinition = statusLibrary.get(GENERIC_AFFINITY_STATUS_ID);
      if (!affinityDefinition) {
        return {
          status: 'failure',
          output: { error: '状态库缺少通用伤害修饰状态（damage_affinity），请检查 statusLibrary' },
        };
      }
      const results = context.targets.map((targetId) => {
        const targetCombatant = this.resolveCombatant(targetId, context);
        const targetCharacter = this.resolveCharacter(targetId, context);
        if (!targetCombatant && !targetCharacter) {
          return { targetId, success: false, effectApplied: false, error: '目标不存在' };
        }
        const currentHp = targetCombatant
          ? (typeof targetCombatant.currentHp === 'number' ? targetCombatant.currentHp : (targetCombatant.maxHp ?? 0))
          : (targetCharacter?.currentHp ?? 0);
        return {
          targetId,
          success: true,
          effectApplied: true,
          effectType: 'status',
          statusId: GENERIC_AFFINITY_STATUS_ID,
          statusName: affinityDefinition.name,
          statusEffects: [effect],
          durationRounds,
          effectValue: 0,
          finalValue: 0,
          oldHp: currentHp,
          newHp: currentHp,
          tempAbsorbed: 0,
          notes: [] as string[],
          message: effect.description ?? `附加状态：${affinityDefinition.name}`,
        };
      });
      return {
        status: 'success',
        output: {
          effectType,
          statusId: GENERIC_AFFINITY_STATUS_ID,
          statusName: affinityDefinition.name,
          affinityKind,
          value: '0',
          dice: null,
          results,
          totalFinal: 0,
          anyResisted: false,
          anyImmune: false,
          anyVulnerable: false,
          message: `状态附加完成，${results.filter(r => r.success).length}个目标受影响`,
        },
      };
    }

    const rolled = await this.rollEffectComponents(config, effectType, diceSource);
    const results = this.applyValueToTargets(
      effectType,
      rolled.components,
      context,
      this.resolveNodeDamageSource(config, context),
      halfDamageOnSave,
    );
    const damageTypes = Array.from(new Set(
      rolled.components.map(c => c.type).filter((t): t is DamageType => !!t)
    ));

    return {
      status: 'success',
      output: {
        effectType,
        value,
        damageType: damageTypes.length === 1 ? damageTypes[0] : (normalizeDamageType(damageType) ?? damageType),
        dice: rolled.isMulti ? null : rolled.components[0]?.dice ?? null,
        diceList: rolled.isMulti
          ? rolled.components.map(c => ({ type: c.type ?? null, expression: c.expr, ...(c.dice ?? {}) }))
          : undefined,
        damageComponents: rolled.isMulti
          ? rolled.components.map(c => ({ type: c.type ?? null, expression: c.expr, base: c.amount }))
          : undefined,
        halfDamageOnSave,
        results,
        totalFinal: results.reduce((sum, r) => sum + (typeof r.finalValue === 'number' ? r.finalValue : 0), 0),
        anyResisted: results.some(r => r.resisted),
        anyImmune: results.some(r => r.immune),
        anyVulnerable: results.some(r => r.vulnerable),
        message: `效果应用完成，${results.filter(r => r.effectApplied).length}个目标受影响`
      }
    };
  }

  /**
   * 执行分级效果节点（戏法缩放 / 升环施法）
   *
   * 分档表按 level 降序排列后取首个「缩放值 ≥ level」的档位；
   * 缩放值 = caster_level 时读施法者角色等级，spell_level 时读当前法术环位。
   * 掷骰与目标结算复用 apply_effect 的路径，保证语义一致。
   */
  private async executeScaledEffectNode(
    node: FlowNodeDef,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const effectType = config?.effectType === 'healing' ? 'healing' : 'damage';
    const damageType = config?.damageType || '';

    // 归一化分档表：过滤非法行 + 按 level 降序（首个命中 = 最大可用档）
    const tiers = (Array.isArray(config?.tiers) ? config.tiers : [])
      .map(t => ({ level: Number(t?.level), value: String(t?.value ?? '') }))
      .filter(t => Number.isFinite(t.level) && t.value !== '')
      .sort((a, b) => b.level - a.level);
    if (tiers.length === 0) {
      return {
        status: 'failure',
        output: { error: '分级效果节点缺少有效的分档表（tiers）' }
      };
    }

    const scaleBy = config?.scaleBy === 'spell_level' ? 'spell_level' : 'caster_level';
    let scaleValue: number;
    let scaleSource: string;
    if (scaleBy === 'spell_level') {
      const spell = context.spellId ? spellStore.getById(context.spellId) : null;
      scaleValue = spell?.level ?? 0;
      scaleSource = spell ? `${spell.name}（环位 ${scaleValue}）` : '（未指定法术，按 0 环）';
    } else {
      // 施法者等级：PC 参战者经角色卡；纯 NPC 参战者无等级概念按 0 级
      const caster = this.resolveCharacter(context.casterId, context);
      scaleValue = caster?.level ?? 0;
      scaleSource = caster ? `${caster.name}（角色等级 ${scaleValue}）` : '（未指定施法者，按 0 级）';
    }

    const matchedTier = tiers.find(t => scaleValue >= t.level) ?? tiers[tiers.length - 1];

    const { effectValue, diceDetail } = await this.rollEffectValueWithSource(
      matchedTier.value,
      { purpose: 'effect', expr: matchedTier.value },
      diceSource,
    );
    const normalizedType = normalizeDamageType(damageType);
    const results = this.applyValueToTargets(
      effectType,
      [{ type: normalizedType ?? undefined, amount: effectValue, expr: matchedTier.value }],
      context,
      this.resolveNodeDamageSource(config, context),
      config?.halfDamageOnSave === true,
    );

    return {
      status: 'success',
      output: {
        effectType,
        damageType: normalizeDamageType(damageType) ?? damageType,
        scaleBy,
        scaleValue,
        scaleSource,
        matchedTier,
        tiers,
        dice: diceDetail,
        results,
        totalFinal: results.reduce((sum, r) => sum + (typeof r.finalValue === 'number' ? r.finalValue : 0), 0),
        anyResisted: results.some(r => r.resisted),
        anyImmune: results.some(r => r.immune),
        anyVulnerable: results.some(r => r.vulnerable),
        message: `分级效果（${scaleBy === 'spell_level' ? '环位' : '角色等级'} ${scaleValue} → ${matchedTier.value}），${results.filter(r => r.effectApplied).length}个目标受影响`
      }
    };
  }

  /**
   * 掷效果骰。配置了 damageComponents（且效果为伤害）时逐分量掷骰；
   * 否则沿用 value + damageType 的单分量路径。
   */
  private async rollEffectComponents(
    config: any,
    effectType: string,
    diceSource?: FlowDiceSource,
  ): Promise<{
    components: { type?: DamageType; amount: number; expr: string; dice: any }[];
    isMulti: boolean;
  }> {
    const configured = effectType === 'damage' && Array.isArray(config?.damageComponents)
      ? config.damageComponents
          .map((c: any) => ({ type: String(c?.type ?? ''), value: String(c?.value ?? '') }))
          .filter((c: { value: string }) => c.value.trim() !== '')
      : [];

    if (configured.length > 0) {
      const components: { type?: DamageType; amount: number; expr: string; dice: any }[] = [];
      for (const component of configured) {
        const { effectValue, diceDetail } = await this.rollEffectValueWithSource(
          component.value,
          { purpose: 'effect', expr: component.value },
          diceSource,
        );
        components.push({
          type: normalizeDamageType(component.type) ?? undefined,
          amount: effectValue,
          expr: component.value,
          dice: diceDetail,
        });
      }
      return { components, isMulti: true };
    }

    const expr = String(config?.value ?? '0');
    const { effectValue, diceDetail } = await this.rollEffectValueWithSource(
      expr,
      { purpose: 'effect' },
      diceSource,
    );
    return {
      components: [{
        type: normalizeDamageType(config?.damageType) ?? undefined,
        amount: effectValue,
        expr,
        dice: diceDetail,
      }],
      isMulti: false,
    };
  }

  /** 最近一次豁免节点对指定目标的结果；用于 halfDamageOnSave */
  private getLatestSaveSuccess(context: FlowExecutionContext, targetId: string): boolean | undefined {
    const outputs = Array.from(context.results.values());
    for (let i = outputs.length - 1; i >= 0; i--) {
      const output = outputs[i];
      if (!output || !Array.isArray(output.results)) continue;
      const hit = output.results.find(
        (r: any) => r?.targetId === targetId && typeof r?.success === 'boolean' && r?.dc !== undefined,
      );
      if (hit) return hit.success;
    }
    return undefined;
  }

  /** 解析并投掷骰式：一次掷骰，全目标共用（含纯加值回退） */
  private rollEffectValue(value: string): { effectValue: number; diceDetail: { expr: string; count: number; sides: number; bonus: number; values: number[] } | null } {
    try {
      const parsed = parseDice(value);
      if (parsed.count > 0 && parsed.sides > 0) {
        const result = rollDice({ sides: parsed.sides as 4 | 6 | 8 | 10 | 12 | 20, count: parsed.count, mode: 'independent' });
        return {
          effectValue: result.values.reduce((s, v) => s + v, 0) + parsed.bonus,
          diceDetail: { expr: value, count: parsed.count, sides: parsed.sides, bonus: parsed.bonus, values: result.values },
        };
      }
      return { effectValue: parsed.count === 0 ? parsed.bonus : 0, diceDetail: null };
    } catch {
      return { effectValue: 0, diceDetail: null };
    }
  }

  /** 节点配置可覆盖伤害来源；auto 时沿用施法上下文（默认法术=魔法） */
  private resolveNodeDamageSource(config: any, context: FlowExecutionContext): DamageSource {
    const override = config?.damageSource;
    if (override === 'magical') return { kind: 'spell', magical: true };
    if (override === 'nonmagical') return { kind: 'effect', magical: false };
    return context.damageSource ?? { kind: 'spell', magical: true };
  }

  /**
   * 将数值效果结算到全部目标（伤害/治疗），返回逐目标结果。
   * 纯计算不落库：HP 变化只写进 results（oldHp/newHp），由调用方（战斗弹窗确认后）
   * 经参战者 HP 路径回写——编译器保持无副作用，重复执行不叠加扣血。
   */
  private applyValueToTargets(
    effectType: string,
    components: { type?: DamageType; amount: number; expr: string }[],
    context: FlowExecutionContext,
    damageSourceOverride?: DamageSource,
    halfDamageOnSave = false,
  ) {
    const results: any[] = [];
    const damageSource: DamageSource = damageSourceOverride ?? context.damageSource ?? { kind: 'spell', magical: true };

    for (const targetId of context.targets) {
      const targetCombatant = this.resolveCombatant(targetId, context);
      const targetCharacter = this.resolveCharacter(targetId, context);
      if (!targetCombatant && !targetCharacter) {
        results.push({
          targetId,
          success: false,
          error: '目标不存在'
        });
        continue;
      }

      // HP 来源：参战者优先（currentHp 缺省按 maxHp 满血），角色卡兜底
      const oldHp = targetCombatant
        ? (typeof targetCombatant.currentHp === 'number' ? targetCombatant.currentHp : (targetCombatant.maxHp ?? 0))
        : (targetCharacter?.currentHp ?? 0);
      const maxHp = targetCombatant ? (targetCombatant.maxHp ?? 0) : (targetCharacter?.maxHp ?? 0);
      const tempHpBefore = targetCombatant ? Math.max(0, targetCombatant.tempHp ?? 0) : 0;

      // 半伤豁免：先减半分量，再进入抗性/易伤结算（顺序与设计文档一致）
      const saveSuccess = halfDamageOnSave ? this.getLatestSaveSuccess(context, targetId) : undefined;
      const halved = saveSuccess === true;
      const targetParts = components.map(c => ({
        type: c.type,
        amount: halved ? Math.floor(c.amount / 2) : c.amount,
      }));
      const effectValue = targetParts.reduce((sum, c) => sum + c.amount, 0);
      const hasTypedPart = targetParts.some(c => !!c.type);
      const untypedNote = '存在未声明伤害类型的伤害分量，仅通用抗性可能生效';

      let newHp = oldHp;
      let effectApplied = false;
      let finalValue = effectValue;
      let tempAbsorbed = 0;
      let tempHpAfter = tempHpBefore;
      let resolution = effectType === 'damage'
        ? (hasTypedPart
            ? resolveDamage(targetParts, getCombatantAffinities(targetCombatant), damageSource)
            : createUntypedResolution(effectValue))
        : null;

      if (effectType === 'damage') {
        finalValue = resolution?.final ?? effectValue;
        // 临时 HP 先于当前 HP 扣减（D&D 5e）；预览与实际落地保持同一算法
        tempAbsorbed = Math.min(tempHpBefore, finalValue);
        tempHpAfter = tempHpBefore - tempAbsorbed;
        newHp = Math.max(0, oldHp - (finalValue - tempAbsorbed));
        effectApplied = true;
        if (hasTypedPart && targetParts.some(c => !c.type) && !resolution?.notes.includes(untypedNote)) {
          resolution = {
            ...resolution!,
            notes: [...(resolution?.notes ?? []), untypedNote],
          };
        }
      } else if (effectType === 'healing') {
        newHp = Math.min(maxHp, oldHp + effectValue);
        effectApplied = true;
      }
      // 其他效果类型可以在这里扩展

      const damageTypes = Array.from(new Set(
        targetParts.map(c => c.type).filter((t): t is DamageType => !!t)
      ));

      results.push({
        targetId,
        targetName: targetCombatant?.name ?? targetCharacter?.name ?? targetId,
        effectType,
        effectValue,
        finalValue,
        damageType: damageTypes.length === 1 ? damageTypes[0] : null,
        damageComponents: targetParts.map((c, i) => ({
          type: c.type ?? null,
          expression: components[i]?.expr ?? '',
          base: c.amount,
          final: resolution?.components[i]?.final ?? c.amount,
          affinity: resolution?.components[i]?.affinity ?? 'none',
        })),
        halved,
        oldHp,
        newHp,
        tempHpBefore,
        tempAbsorbed,
        tempHpAfter,
        effectApplied,
        isCombatant: !!targetCombatant,
        resisted: resolution?.anyResisted ?? false,
        immune: resolution?.anyImmune ?? false,
        vulnerable: resolution?.anyVulnerable ?? false,
        notes: resolution?.notes ?? [],
        affinitySummary: resolution
          ? (resolution.anyImmune
              ? 'immunity'
              : resolution.anyResisted && resolution.anyVulnerable
                ? 'both'
                : resolution.anyResisted
                  ? 'resistance'
                  : resolution.anyVulnerable
                    ? 'vulnerability'
                    : 'none')
          : 'none',
        affinityBreakdown: resolution?.components.map(c => ({
          type: c.type ?? null,
          base: c.base,
          final: c.final,
          affinity: c.affinity,
        })) ?? [],
      });
    }

    return results;
  }

  /**
   * 执行专注检定节点
   * Phase 2 修复：体质调整值从 AbilityScore.score 重算（旧代码 .score 链短路得 undefined）。
   */
  private async executeConcentrationCheckNode(
    node: FlowNodeDef,
    context: FlowExecutionContext,
    diceSource?: FlowDiceSource
  ): Promise<NodeExecutionResult> {
    // 专注检定：PC 经角色卡取体质调整值；纯 NPC 参战者直接读六维 constitution
    const casterCharacter = this.resolveCharacter(context.casterId, context);
    const casterCombatant = this.resolveCombatant(context.casterId, context);
    if (!casterCharacter && !casterCombatant) {
      return {
        status: 'failure',
        output: { error: '施法者不存在' }
      };
    }

    // 专注检定：体质属性 vs DC 10
    const ability = 'constitution';
    const dc = 10;
    const abilityScore = casterCharacter
      ? casterCharacter.abilities?.[ability]?.score ?? 10
      : typeof casterCombatant?.constitution === 'number' ? casterCombatant.constitution : 10;
    const abilityModifierValue = Math.floor((abilityScore - 10) / 2);
    const d20Roll = await this.rollCheckD20({ purpose: 'concentration', targetId: context.casterId, dc }, diceSource);
    const total = d20Roll + abilityModifierValue;
    const success = total >= dc;

    return {
      status: 'success',
      output: {
        ability,
        dc,
        abilityScore,
        abilityModifier: abilityModifierValue,
        d20Roll,
        total,
        success,
        message: `专注检定: ${ability}(${abilityScore}) ${abilityModifierValue >= 0 ? '+' : ''}${abilityModifierValue} + ${d20Roll} = ${total} vs DC ${dc} - ${success ? '成功' : '失败'}`
      }
    };
  }

  /**
   * 执行施法结束节点
   */
  private async executeCastEndNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    // 施法结束：清理资源，记录日志
    return {
      status: 'success',
      output: {
        message: '法术施放完成，资源已清理'
      }
    };
  }

  /**
   * 执行自定义节点
   */
  private async executeCustomNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const code = config?.code || '';

    if (!code) {
      return {
        status: 'failure',
        output: { error: '自定义节点没有代码' }
      };
    }

    try {
      // custom 节点保留 eval 逃逸舱（流程生成器 skill §2.1 明示「风险自负」）；
      // 常规条件分支请用 condition_branch（已接入安全求值器）。
      const result = eval(code);

      return {
        status: 'success',
        output: {
          code,
          result,
          message: '自定义代码执行完成'
        }
      };
    } catch (error) {
      return {
        status: 'failure',
        output: {
          error: `自定义代码执行错误: ${error}`
        }
      };
    }
  }
}

// 导出编译器实例
export const flowCompiler = new FlowCompiler();
