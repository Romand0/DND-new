// DSL 编译器 - 节点执行引擎
// 将流程图中的节点转换为可执行的逻辑
import type { 
  FlowDefinition, 
  FlowNodeDef, 
  FlowEdgeDef, 
  FlowExecutionContext, 
  NodeExecutionResult,
  PreCastCheckReport,
  CastStartConfig 
} from '@/types/flow';
import type { Combatant, Character, Spell } from '@/types/combat';
import { characterStore } from './characterStore';
import { spellStore } from './spellStore';
import { combatStore } from './combatStore';

export class FlowCompiler {
  /**
   * 执行流程
   */
  async executeFlow(
    flow: FlowDefinition,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const startNode = flow.nodes.find(node => node.type === 'cast_start' || node.type === 'cast_start_legacy');
    
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
      case 'cast_start_legacy':
        return this.executeCastStartLegacyNode(node, context);
      case 'check_component':
        return this.executeCheckComponentNode(node, context);
      case 'check_range':
        return this.executeCheckRangeNode(node, context);
      case 'select_target':
        return this.executeSelectTargetNode(node, context);
      // ... 其他节点类型
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

    const spell = spellStore.get(config.spellId);
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
   * 执行旧版施法开始节点
   */
  private async executeCastStartLegacyNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    // 旧版逻辑：直接初始化施法上下文，不进行前置检查
    return {
      status: 'success',
      output: {
        spellId: context.spellId,
        message: '施法上下文已初始化'
      }
    };
  }

  /**
   * 执行成分检查节点
   */
  private async executeCheckComponentNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const component = config?.component || 'verbal';
    
    const caster = characterStore.get(context.casterId);
    if (!caster) {
      return {
        status: 'failure',
        output: { error: '施法者不存在' }
      };
    }

    // 检查成分是否可用
    let available = true;
    let missing: string[] = [];

    if (component === 'verbal' && caster.canSpeak === false) {
      available = false;
      missing = ['言语'];
    } else if (component === 'somatic' && caster.canSomatic === false) {
      available = false;
      missing = ['姿势'];
    }
    // material 成分检查需要具体的材料物品，这里简化处理

    return {
      status: available ? 'success' : 'failure',
      output: {
        component,
        available,
        missing,
        message: available ? '成分检查通过' : `缺少成分: ${missing.join(', ')}`
      }
    };
  }

  /**
   * 执行距离检查节点
   */
  private async executeCheckRangeNode(
    node: FlowNodeDef,
    context: FlowExecutionContext
  ): Promise<NodeExecutionResult> {
    const config = node.config;
    const range = config?.range || 60;
    
    if (context.targets.length === 0) {
      return {
        status: 'failure',
        output: { error: '没有选择目标' }
      };
    }

    const caster = characterStore.get(context.casterId);
    if (!caster) {
      return {
        status: 'failure',
        output: { error: '施法者不存在' }
      };
    }

    // 计算到最近目标的距离
    const distances = context.targets.map(targetId => {
      const target = combatStore.getCombatant(targetId);
      if (!target || !caster.position || !target.position) {
        return Infinity;
      }
      return Math.max(
        Math.abs(target.position.col - caster.position.col),
        Math.abs(target.position.row - caster.position.row)
      );
    });
    
    const currentDistance = Math.min(...distances);
    const inRange = currentDistance <= range;

    return {
      status: inRange ? 'success' : 'failure',
      output: {
        required: range,
        current: currentDistance,
        inRange,
        message: inRange ? '距离检查通过' : `超出射程: ${currentDistance}尺 > ${range}尺`
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
    const results = {
      components: this.checkComponents(spell, config, caster),
      range: this.checkRange(spell, config, targets),
      time: this.checkTime(spell, config, caster),
      overall: 'pass' as const
    };

    // 计算总体结果
    if (!results.components.available || !results.range.inRange || !results.time.available) {
      results.overall = 'fail';
    } else if (!results.components.available || !results.range.inRange || !results.time.available) {
      results.overall = 'partial';
    }

    return results;
  }

  /**
   * 检查法术成分
   */
  private checkComponents(spell: Spell, config: CastStartConfig, caster: Character) {
    const required = config.overrideComponents 
      ? config.overrideComponents.split(',') 
      : spell.components || [];

    const available = required.every(comp => {
      switch (comp.trim()) {
        case 'verbal':
          return caster.canSpeak !== false;
        case 'somatic':
          return caster.canSomatic !== false;
        case 'material':
          // 简化处理：假设材料成分总是可用
          return true;
        default:
          return true;
      }
    });

    return {
      required,
      available,
      missing: available ? undefined : required.filter(comp => 
        !this.hasComponent(caster, comp.trim())
      )
    };
  }

  /**
   * 检查施法距离
   */
  private checkRange(spell: Spell, config: CastStartConfig, targets: string[]) {
    const required = config.overrideRange ?? spell.range ?? 60;
    
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
    const required = config.overrideTime ?? spell.castingTime || '1 action';
    
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
}

// 导出编译器实例
export const flowCompiler = new FlowCompiler();