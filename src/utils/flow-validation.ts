import type { FlowDefinition } from '@/types/flow';

/**
 * 验证流程定义（增强版）
 */
export function validateFlowDefinition(flow: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 基础字段验证
  if (!flow.id || typeof flow.id !== 'string') {
    errors.push('流程 ID 必填且必须是字符串');
  }
  
  if (!flow.name || typeof flow.name !== 'string') {
    errors.push('流程名称必填且必须是字符串');
  }
  
  if (!flow.description || typeof flow.description !== 'string') {
    errors.push('流程描述必填且必须是字符串');
  }

  // 节点验证
  if (!Array.isArray(flow.nodes)) {
    errors.push('节点列表必须是数组');
  } else {
    const nodeIds = new Set<string>();
    flow.nodes.forEach((node, index) => {
      if (!node || typeof node !== 'object') {
        errors.push(`节点 ${index} 必须是对象`);
        return;
      }
      
      if (!node.id || typeof node.id !== 'string') {
        errors.push(`节点 ${index} 缺少 ID 或 ID 不是字符串`);
      } else if (nodeIds.has(node.id)) {
        errors.push(`节点 ID 重复: ${node.id}`);
      } else {
        nodeIds.add(node.id);
      }
      
      if (!node.type || typeof node.type !== 'string') {
        errors.push(`节点 ${index} 缺少类型或类型不是字符串`);
      }
      
      if (!node.label || typeof node.label !== 'string') {
        errors.push(`节点 ${index} 缺少标签或标签不是字符串`);
      }
      
      if (!node.position || typeof node.position !== 'object') {
        errors.push(`节点 ${index} 缺少位置或位置不是对象`);
      } else {
        if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
          errors.push(`节点 ${index} 位置坐标必须是数字`);
        }
      }
    });
  }

  // 边验证
  if (!Array.isArray(flow.edges)) {
    errors.push('边列表必须是数组');
  } else {
    const edgeIds = new Set<string>();
    flow.edges.forEach((edge, index) => {
      if (!edge || typeof edge !== 'object') {
        errors.push(`边 ${index} 必须是对象`);
        return;
      }
      
      if (!edge.id || typeof edge.id !== 'string') {
        errors.push(`边 ${index} 缺少 ID 或 ID 不是字符串`);
      } else if (edgeIds.has(edge.id)) {
        errors.push(`边 ID 重复: ${edge.id}`);
      } else {
        edgeIds.add(edge.id);
      }
      
      if (!edge.from || typeof edge.from !== 'string') {
        errors.push(`边 ${index} 缺少起始节点或起始节点不是字符串`);
      }
      
      if (!edge.to || typeof edge.to !== 'string') {
        errors.push(`边 ${index} 缺少目标节点或目标节点不是字符串`);
      }
      
      if (!edge.trigger || typeof edge.trigger !== 'string') {
        errors.push(`边 ${index} 缺少触发条件或触发条件不是字符串`);
      }
    });
  }

  // 连接关系验证
  if (flow.nodes && flow.edges) {
    const nodeIds = new Set(flow.nodes.map((n: any) => n.id));
    flow.edges.forEach((edge: any, index: number) => {
      if (!nodeIds.has(edge.from)) {
        warnings.push(`边 ${index} 的起始节点 ${edge.from} 不存在`);
      }
      if (!nodeIds.has(edge.to)) {
        warnings.push(`边 ${index} 的目标节点 ${edge.to} 不存在`);
      }
    });
  }

  // 检查孤立节点
  if (flow.nodes && flow.edges) {
    const connectedNodeIds = new Set<string>();
    flow.edges.forEach((edge: any) => {
      connectedNodeIds.add(edge.from);
      connectedNodeIds.add(edge.to);
    });
    
    flow.nodes.forEach((node: any) => {
      if (!connectedNodeIds.has(node.id)) {
        warnings.push(`节点 ${node.id} 没有连接到任何边，可能是孤立节点`);
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 验证流程是否可以发布
 */
export function validateForPublish(flow: FlowDefinition): { valid: boolean; errors: string[]; warnings: string[] } {
  const validation = validateFlowDefinition(flow);
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];

  // 检查是否有起始节点
  const startNodes = flow.nodes.filter((node: any) => node.type === 'cast_start');
  if (startNodes.length === 0) {
    errors.push('流程必须包含至少一个起始节点（cast_start）');
  } else if (startNodes.length > 1) {
    warnings.push('流程包含多个起始节点，建议只保留一个');
  }

  // 检查是否有结束节点
  const endNodes = flow.nodes.filter((node: any) => node.type === 'cast_end');
  if (endNodes.length === 0) {
    warnings.push('流程没有明确的结束节点，建议添加 cast_end 节点');
  }

  // 检查节点配置完整性
  flow.nodes.forEach((node: any, index: number) => {
    if (node.type === 'saving_throw') {
      if (!node.config?.ability) {
        warnings.push(`节点 ${index}（豁免检定）缺少能力属性配置`);
      }
    }
    if (node.type === 'attack_roll') {
      if (!node.config?.attackType) {
        warnings.push(`节点 ${index}（攻击检定）缺少攻击类型配置`);
      }
    }
  });

  return { valid: errors.length === 0, errors, warnings };
}