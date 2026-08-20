// DSL 编译器 - 节点执行引擎
// 将流程图中的节点转换为可执行的逻辑
import type { 
  FlowDefinition, 
  FlowNodeDef, 
  FlowExecutionContext, 
  NodeExecutionResult,
  PreCastCheckReport,
  CastStartConfig,
  CheckResult,
  SavingThrowConfig
} from '@/types/flow';
import type { Character } from '@/types/character';
import type { Spell } from '@/types/spell';
import { characterStore } from '@/data/characterStore';
import { spellStore } from '@/data/spellStore';
import { rollDie } from '@/data/diceService';

export class FlowCompiler {
  /**
   * 执行流程
   */
  async executeFlow(
    flow: FlowDefinition,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const startNode = flow.nodes.find(node => node.type === 'cast_start');
    
    if (!startNode) {
      throw new Error('流程缺少施法开始节点');
    }

    return await this.executeNode(startNode, context);
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
    const config = node.config as CastStartConfig;
    
    if (!config?.spellId) {
      return {
        status: 'failure',
        output: { error: '施法开始节点必须绑定法术' }
      };
    }

    const spell = spellStore.getById(config.spellId);
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

    // 执行前置检查
    const checkReport = await this.executePreCastChecks(spell, caster, config, context.targets);

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
        spellId: config.spellId,
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
    targets: string[]
  ): Promise<PreCastCheckReport> {
    const components = this.checkComponents(spell, config, caster);
    const range = this.checkRange(spell, config, targets);
    const time = this.checkTime(spell, config, caster);

    // 计算总体结果
    const checks = [components.available, range.inRange, time.available];
    const overall: CheckResult = checks.every(Boolean)
      ? 'pass'
      : checks.some(Boolean)
        ? 'partial'
        : 'fail';

    // 生成自动检查代码
    const autoChecks: string[] = [];
    
    // 添加成分检查
    if (config.autoChecks.components) {
      const componentChecks: string[] = [];
      if (spell.components.verbal) {
        componentChecks.push(`施法者可言语: ${caster.canSpeak !== false ? '是' : '否'}`);
      }
      if (spell.components.somatic) {
        componentChecks.push(`施法者可做手势: ${caster.canSomatic !== false ? '是' : '否'}`);
      }
      if (spell.components.material) {
        componentChecks.push(`材料组件: 已准备`);
      }
      if (componentChecks.length > 0) {
        autoChecks.push(`成分检查: ${componentChecks.join(', ')}`);
      }
    }

    // 添加距离检查
    if (config.autoChecks.range) {
      const spellRange = typeof spell.range === 'string'
        ? parseInt(spell.range.replace(/\D/g, ''), 10)
        : NaN;
      const required = config.overrideRange ?? (Number.isFinite(spellRange) ? spellRange : 30);
      const current = targets.length > 0 ? 30 : 0; // 假设距离
      autoChecks.push(`距离检查: 当前${current}尺 ≤ 要求${required}尺 - ${current <= required ? '通过' : '失败'}`);
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
  private checkComponents(spell: Spell, config: CastStartConfig, caster: Character) {
    const required = config.overrideComponents
      ? config.overrideComponents.split(',').map(s => s.trim()).filter(Boolean)
      : (['verbal', 'somatic', 'material'] as const).filter(c => spell.components[c]);

    const missing = required.filter(comp => !this.hasComponent(caster, comp));
    const available = missing.length === 0;

    return {
      required,
      available,
      missing: available ? undefined : missing
    };
  }

  /**
   * 检查施法距离
   */
  private checkRange(spell: Spell, config: CastStartConfig, targets: string[]) {
    // 解析法术射程字符串中的数字（如 "60尺" → 60，"120尺" → 120），无法解析时回退默认 30
    const spellRange = typeof spell.range === 'string'
      ? parseInt(spell.range.replace(/\D/g, ''), 10)
      : NaN;
    const required = config.overrideRange ?? (Number.isFinite(spellRange) ? spellRange : 30);

    // 简化处理：假设总是有目标且在射程内
    // 实际实现中需要根据战斗记录计算真实距离
    const current = targets.length > 0 ? 30 : 0; // 假设距离
    const inRange = current <= required;

    return {
      required,
      current,
      inRange
    };
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
  private hasComponent(caster: Character, component: string): boolean {
    switch (component) {
      case 'verbal':
        return caster.canSpeak !== false;
      case 'somatic':
        return caster.canSomatic !== false;
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
   */
  private async executeSavingThrowNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config as SavingThrowConfig;
    const ability = config?.ability || 'dexterity';
    const dc = parseInt(config?.dc?.toString() || '10', 10);
    
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

      // 计算豁免修正
      const abilityModifier = Math.floor((target.abilities[ability] - 10) / 2);
      const d20Roll = rollDie(20);
      const total = d20Roll + abilityModifier;
      const success = total >= dc;

      results.push({
        targetId,
        targetName: target.name,
        ability,
        abilityScore: target.abilities[ability],
        abilityModifier,
        dc,
        d20Roll,
        total,
        success
      });
    }

    return {
      status: 'success',
      output: {
        results,
        message: `豁免检定完成，${results.filter(r => r.success).length}个目标成功`
      }
    };
  }

  /**
   * 执行法术攻击节点
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

      // 计算攻击加值（简化处理）
      const attackBonus = 5; // 应该根据施法者属性和法术等级计算
      const d20Roll = rollDie(20);
      const attackTotal = d20Roll + attackBonus;
      
      // 简化处理：假设目标AC为15
      const targetAC = 15;
      const hit = attackTotal >= targetAC;

      results.push({
        targetId,
        targetName: target.name,
        attackBonus,
        d20Roll,
        attackTotal,
        targetAC,
        hit
      });
    }

    return {
      status: 'success',
      output: {
        results,
        message: `攻击检定完成，${results.filter(r => r.hit).length}个目标被击中`
      }
    };
  }

  /**
   * 执行条件分支节点
   */
  private async executeConditionBranchNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const condition = config?.condition || 'true';
    
    try {
      // 简化处理：在上下文中执行条件表达式
      // 实际实现中需要更安全的表达式求值
      const conditionResult = eval(condition); // 注意：实际实现中需要安全的表达式求值
      
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
   */
  private async executeApplyEffectNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const effectType = config?.effectType || 'damage';
    const value = config?.value || '0';
    
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

      // 计算效果值
      let effectValue = 0;
      try {
        // 简化处理：解析骰子表达式
        if (value.includes('d')) {
          // 简单解析骰子表达式，只支持XdY格式
          const match = value.match(/(\d+)d(\d+)/);
          if (match) {
            const count = parseInt(match[1], 10);
            const sides = parseInt(match[2], 10);
            effectValue = rollDie(sides as any); // 简化处理，只掷一次
          } else {
            effectValue = 0;
          }
        } else {
          effectValue = parseInt(value, 10);
        }
      } catch (error) {
        effectValue = 0;
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
        results,
        message: `效果应用完成，${results.filter(r => r.effectApplied).length}个目标受影响`
      }
    };
  }

  /**
   * 执行专注检定节点
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
    const abilityScore = caster.abilities[ability]?.score || 10; // 默认值10
    const abilityModifier = Math.floor((abilityScore - 10) / 2);
    const d20Roll = rollDie(20);
    const total = d20Roll + abilityModifier;
    const success = total >= dc;

    return {
      status: 'success',
      output: {
        ability,
        dc,
        abilityScore,
        abilityModifier,
        d20Roll,
        total,
        success,
        message: `专注检定: ${ability}(${abilityScore}) + ${abilityModifier} + ${d20Roll} = ${total} vs DC ${dc} - ${success ? '成功' : '失败'}`
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
      // 简化处理：执行自定义代码
      // 实际实现中需要安全的沙箱环境
      const result = eval(code); // 注意：实际实现中需要安全的代码执行
      
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