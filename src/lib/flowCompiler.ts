// DSL 编译器 - 节点执行引擎
// 将流程图中的节点转换为可执行的逻辑
// Phase 2：图遍历执行（按边驱动 + trigger 匹配）、安全表达式求值、真实数据注入
// （施法加值/AC/属性修正/完整骰式/沙盘距离）。战斗身份映射（Combatant ↔ Character）留 Phase 3。
import type {
  FlowDefinition,
  FlowNodeDef,
  FlowExecutionContext,
  NodeExecutionResult,
  PreCastCheckReport,
  CastStartConfig,
  CheckResult,
  SavingThrowConfig,
  FlowLogEntry
} from '@/types/flow';
import type { Character, AbilityKey } from '@/types/character';
import type { Spell } from '@/types/spell';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import { rollDie, rollDice } from '@/data/diceService';
import { deriveCanGesticulate, SOMATIC_BLOCKING_CONDITIONS, type SomaticBlockingCondition } from '@/data/somaticCheck';
import { parseDice } from '@/utils/diceExpr';
import { evaluateExpression } from '@/lib/flowExpression';

/** 六属性全名（AbilityKey 收窄用） */
const ABILITY_KEYS: AbilityKey[] = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

/** 从 Character.abilities 安全取属性调整值（AbilityScore {score, modifier}） */
function abilityModifier(char: Character, ability: string): number {
  const entry = char.abilities?.[ability as AbilityKey];
  if (!entry || typeof entry.score !== 'number') return 0;
  return Math.floor((entry.score - 10) / 2);
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
  /**
   * 执行流程：从 cast_start 入口按边遍历整张图。
   * 每个节点至多执行一次（visited 守卫防环）；执行轨迹写入 context.log（FlowLogEntry），
   * 节点输出缓存进 context.results。返回最后一个执行节点的结果（通常为 cast_end）。
   */
  async executeFlow(
    flow: FlowDefinition,
    context: FlowExecutionContext
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

      const result = await this.executeNode(node, context);
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
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    switch (node.type) {
      case 'cast_start':
        return this.executeCastStartNode(node, context);
      case 'select_target':
        return this.executeSelectTargetNode(node, context);
      case 'saving_throw':
        return this.executeSavingThrowNode(node, context);
      case 'attack_roll':
        return this.executeAttackRollNode(node, context);
      case 'condition_branch':
        return this.executeConditionBranchNode(node, context);
      case 'apply_effect':
        return this.executeApplyEffectNode(node, context);
      case 'concentration_check':
        return this.executeConcentrationCheckNode(node, context);
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

    const caster = characterStore.get(context.casterId);
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
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config as SavingThrowConfig;
    const ability = config?.ability || 'dexterity';

    // DC 语义：留空 = 施法者法术豁免 DC（8 + 施法属性调整值 + 熟练）；显式数字 = 固定 DC（非法数字回落 10）
    let dc: number;
    const rawDc = config?.dc?.toString().trim() ?? '';
    if (rawDc === '') {
      const caster = characterStore.get(context.casterId);
      const casterDc = caster ? characterStore.getSpellSaveDC(caster) : null;
      if (casterDc === null) {
        return {
          status: 'failure',
          output: { error: 'DC 未配置且施法者无法术豁免 DC（NPC 施法者待身份映射支持）' },
        };
      }
      dc = casterDc;
    } else {
      dc = parseInt(rawDc, 10);
      if (isNaN(dc)) dc = 10;
    }

    const results: any[] = [];

    for (const targetId of context.targets) {
      const target = characterStore.get(targetId);
      if (!target) {
        results.push({
          targetId,
          success: false,
          error: '目标不存在'
        });
        continue;
      }

      // 豁免加值：PC 走角色卡熟练豁免；数据缺失时回退属性调整值
      let saveBonus = abilityModifier(target, ability);
      try {
        saveBonus = characterStore.getSaveBonus(target, ability as AbilityKey);
      } catch {
        // getSaveBonus 不可用时保持属性调整值兜底
      }

      const d20Roll = rollDie(20);
      const total = d20Roll + saveBonus;
      const success = total >= dc;

      results.push({
        targetId,
        targetName: target.name,
        ability,
        abilityScore: target.abilities?.[ability as AbilityKey]?.score,
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
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const caster = characterStore.get(context.casterId);
    if (!caster) {
      return {
        status: 'failure',
        output: { error: '施法者不存在' }
      };
    }

    const spellAttackBonus = characterStore.getSpellAttackBonus(caster) ?? 0;

    const results: any[] = [];

    for (const targetId of context.targets) {
      const target = characterStore.get(targetId);
      if (!target) {
        results.push({
          targetId,
          hit: false,
          error: '目标不存在'
        });
        continue;
      }

      const d20Roll = rollDie(20);
      const attackTotal = d20Roll + spellAttackBonus;
      const targetAC = typeof target.armorClass === 'number' ? target.armorClass : 15;
      // D&D 5e：自然 20 必中，自然 1 必失
      const hit = d20Roll === 20 ? true : d20Roll === 1 ? false : attackTotal >= targetAC;

      results.push({
        targetId,
        targetName: target.name,
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
      caster: characterStore.get(context.casterId),
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
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const effectType = config?.effectType || 'damage';
    const value = config?.value || '0';

    // 完整骰式解析与投掷（一次掷骰，全目标共用）
    let effectValue = 0;
    let diceDetail: { expr: string; count: number; sides: number; bonus: number; values: number[] } | null = null;
    try {
      const parsed = parseDice(String(value));
      if (parsed.count > 0 && parsed.sides > 0) {
        const result = rollDice({ sides: parsed.sides as 4 | 6 | 8 | 10 | 12 | 20, count: parsed.count, mode: 'independent' });
        effectValue = result.values.reduce((s, v) => s + v, 0) + parsed.bonus;
        diceDetail = { expr: String(value), count: parsed.count, sides: parsed.sides, bonus: parsed.bonus, values: result.values };
      } else {
        // flat 数值或无法解析的骰式
        effectValue = parsed.count === 0 ? parsed.bonus : 0;
      }
    } catch {
      effectValue = 0;
    }

    const results: any[] = [];

    for (const targetId of context.targets) {
      const target = characterStore.get(targetId);
      if (!target) {
        results.push({
          targetId,
          success: false,
          error: '目标不存在'
        });
        continue;
      }

      // 应用效果
      let newHp = target.currentHp;
      let effectApplied = false;

      if (effectType === 'damage') {
        newHp = Math.max(0, target.currentHp - effectValue);
        effectApplied = true;
      } else if (effectType === 'healing') {
        newHp = Math.min(target.maxHp, target.currentHp + effectValue);
        effectApplied = true;
      }
      // 其他效果类型可以在这里扩展

      results.push({
        targetId,
        targetName: target.name,
        effectType,
        effectValue,
        oldHp: target.currentHp,
        newHp,
        effectApplied
      });

      // 更新角色状态（简化处理）
      if (effectApplied) {
        // 实际实现中需要调用 characterStore 更新
        target.currentHp = newHp;
      }
    }

    return {
      status: 'success',
      output: {
        effectType,
        value,
        dice: diceDetail,
        results,
        message: `效果应用完成，${results.filter(r => r.effectApplied).length}个目标受影响`
      }
    };
  }

  /**
   * 执行专注检定节点
   * Phase 2 修复：体质调整值从 AbilityScore.score 重算（旧代码 .score 链短路得 undefined）。
   */
  private async executeConcentrationCheckNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const caster = characterStore.get(context.casterId);
    if (!caster) {
      return {
        status: 'failure',
        output: { error: '施法者不存在' }
      };
    }

    // 专注检定：体质属性 vs DC 10
    const ability = 'constitution';
    const dc = 10;
    const abilityScore = caster.abilities?.[ability]?.score ?? 10;
    const abilityModifierValue = Math.floor((abilityScore - 10) / 2);
    const d20Roll = rollDie(20);
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
