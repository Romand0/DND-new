import type { FlowDefinition, FlowNodeType } from '@/types/flow';
import { NODE_CONFIG_SCHEMA } from '@/types/flow';

// ===== 增强的校验函数，提供节点级别错误 =====
export interface ValidationError {
  type: 'global' | 'node' | 'edge';
  id?: string; // 节点或边的ID
  message: string;
  field?: string; // 具体字段名（针对配置错误）
}

export function validateFlowWithDetails(flow: FlowDefinition): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. 检查必需的全局字段
  if (!flow.name || typeof flow.name !== 'string' || flow.name.trim() === '') {
    errors.push({ type: 'global', message: '流程名称不能为空' });
  }

  if (!Array.isArray(flow.nodes)) {
    errors.push({ type: 'global', message: '节点必须是数组' });
    return errors; // 节点不是数组，后续检查无意义
  }

  if (!Array.isArray(flow.edges)) {
    errors.push({ type: 'global', message: '边必须是数组' });
  }

  // 2. 检查节点
  const nodeIds = new Set<string>();
  for (let i = 0; i < flow.nodes.length; i++) {
    const node = flow.nodes[i];
    const nodeId = `节点${i + 1}(${node.id})`;

    // 检查节点必需字段
    if (!node.id || typeof node.id !== 'string') {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}缺少有效的ID` });
    } else if (nodeIds.has(node.id)) {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}ID重复` });
    } else {
      nodeIds.add(node.id);
    }

    if (!node.type || typeof node.type !== 'string') {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}缺少节点类型` });
    }

    // 检查节点配置
    if (node.config && typeof node.config === 'object') {
      const schema = NODE_CONFIG_SCHEMA[node.type as FlowNodeType];
      if (schema) {
        for (const field of schema) {
          if (field.required && (node.config[field.key] === undefined || node.config[field.key] === null || node.config[field.key] === '')) {
            errors.push({
              type: 'node',
              id: node.id,
              message: `${nodeId}缺少必需配置: ${field.label}`,
              field: field.key
            });
          }
        }
      }
    }

    // 检查位置
    if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}位置坐标无效` });
    }
  }

  // 3. 检查边
  const edgeIds = new Set<string>();
  for (let i = 0; i < flow.edges.length; i++) {
    const edge = flow.edges[i];
    const edgeId = `边${i + 1}(${edge.id})`;

    // 检查边必需字段
    if (!edge.id || typeof edge.id !== 'string') {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}缺少有效ID` });
    } else if (edgeIds.has(edge.id)) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}ID重复` });
    } else {
      edgeIds.add(edge.id);
    }

    if (!edge.from || !nodeIds.has(edge.from)) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}引用了不存在的源节点: ${edge.from}` });
    }

    if (!edge.to || !nodeIds.has(edge.to)) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}引用了不存在的目标节点: ${edge.to}` });
    }

    if (edge.from === edge.to) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}形成自环（不能连接到自身）` });
    }

    // 检查重复边
    const edgeSignature = `${edge.from}->${edge.to}@${edge.trigger}`;
    const duplicateEdge = flow.edges.find((e, idx) => 
      idx !== i && `${e.from}->${e.to}@${e.trigger}` === edgeSignature
    );
    if (duplicateEdge) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}存在重复连线: ${edge.from} → ${edge.to}（${edge.trigger}）` });
    }
  }

  // 4. 检查入口节点
  const nodesWithIncomingEdge = new Set(flow.edges.map(e => e.to));
  const entryNodes = flow.nodes.filter(n => !nodesWithIncomingEdge.has(n.id));
  if (entryNodes.length === 0) {
    errors.push({ type: 'global', message: '流程缺少入口节点（所有节点都有入边，可能存在循环）' });
  }

  // 5. 检查条件分支
  const branchNodes = flow.nodes.filter(n => n.type === 'condition_branch');
  for (const branch of branchNodes) {
    const outEdges = flow.edges.filter(e => e.from === branch.id);
    const hasTrue = outEdges.some(e => e.trigger === 'on_true');
    const hasFalse = outEdges.some(e => e.trigger === 'on_false');
    
    if (!hasTrue) {
      errors.push({ type: 'node', id: branch.id, message: `条件分支节点 ${branch.id} 缺少 on_true 出边` });
    }
    if (!hasFalse) {
      errors.push({ type: 'node', id: branch.id, message: `条件分支节点 ${branch.id} 缺少 on_false 出边` });
    }
  }

  // 检查流程绑定法术（可选，不再强制要求）
  // 允许草稿和已发布流程都不绑定法术

  return errors;
}

// 发布前特殊验证
export function validateForPublish(flow: FlowDefinition) {
  // 1. 检查流程状态（法术绑定现在是可选的）
  // 已发布的流程可以不绑定法术，草稿也可以不绑定法术

  // 2. 基本验证检查
  const basicValidation = validateFlowWithDetails(flow);
  if (basicValidation.length > 0) {
    return { 
      valid: false, 
      error: `存在 ${basicValidation.length} 个基本验证错误`,
      details: basicValidation,
      suggestions: ['请修复所有标记的错误后再尝试发布', '检查节点配置和连线关系']
    };
  }

  // 3. 发布前特殊验证
  const publishValidation = validatePublishSpecific(flow);
  if (!publishValidation.valid) {
    return {
      valid: false,
      error: publishValidation.error,
      suggestions: publishValidation.suggestions
    };
  }

  return { valid: true };
}

// 发布前特殊验证规则
function validatePublishSpecific(flow: FlowDefinition) {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // 检查流程是否为空
  if (flow.nodes.length === 0) {
    issues.push('流程为空，没有节点');
    suggestions.push('请添加至少一个节点开始构建流程');
  }

  // 检查是否有足够的执行节点
  const actionNodes = flow.nodes.filter(n => 
    n.type === 'cast_start' || 
    n.type === 'cast_end' || 
    n.type === 'apply_effect'
  );
  if (actionNodes.length === 0) {
    issues.push('缺少执行节点');
    suggestions.push('添加 cast_start、cast_end、damage 或 heal 等执行节点');
  }

  // 检查流程连通性
  const entryNodes = flow.nodes.filter(n => {
    return !flow.edges.some(e => e.to === n.id);
  });
  
  if (entryNodes.length === 0) {
    issues.push('缺少入口节点');
    suggestions.push('确保至少有一个节点没有入边作为流程入口');
  }

  // 检查是否有孤立节点
  const connectedNodes = new Set<string>();
  
  // 从入口节点开始遍历
  const traverseNodes = (nodeId: string) => {
    connectedNodes.add(nodeId);
    const outgoingEdges = flow.edges.filter(e => e.from === nodeId);
    outgoingEdges.forEach(edge => {
      if (!connectedNodes.has(edge.to)) {
        traverseNodes(edge.to);
      }
    });
  };

  // 从所有入口节点开始遍历
  entryNodes.forEach(entry => {
    if (!connectedNodes.has(entry.id)) {
      traverseNodes(entry.id);
    }
  });

  const isolatedNodes = flow.nodes.filter(n => !connectedNodes.has(n.id));
  if (isolatedNodes.length > 0) {
    issues.push(`发现 ${isolatedNodes.length} 个孤立节点`);
    suggestions.push('删除或连接孤立的节点，确保所有节点都在流程路径中');
  }

  // 检查循环引用
  const hasCycles = detectCycles(flow);
  if (hasCycles) {
    issues.push('检测到可能的循环引用');
    suggestions.push('检查流程是否存在无限循环，确保流程能够正常结束');
  }

  // 检查法术兼容性
  if (flow.spellId) {
    const spellCompatibility = checkSpellCompatibility(flow);
    if (!spellCompatibility.valid) {
      issues.push(spellCompatibility.issue || '法术兼容性问题');
      suggestions.push(...spellCompatibility.suggestions);
    }
  }

  if (issues.length > 0) {
    return {
      valid: false,
      error: issues.join('；'),
      suggestions
    };
  }

  return { valid: true };
}

// 检测循环引用
function detectCycles(flow: FlowDefinition): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const hasCycle = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const outgoingEdges = flow.edges.filter(e => e.from === nodeId);
    for (const edge of outgoingEdges) {
      if (hasCycle(edge.to)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const node of flow.nodes) {
    if (!visited.has(node.id) && hasCycle(node.id)) {
      return true;
    }
  }

  return false;
}

// 检查法术兼容性
function checkSpellCompatibility(flow: FlowDefinition): { valid: boolean; issue?: string; suggestions: string[] } {
  const suggestions: string[] = [];
  
  // 检查流程是否与法术类型匹配
  const spell = flow.spellId; // 这里可以根据实际需求获取法术信息
  if (spell) {
    // 检查是否有与法术类型不匹配的节点
    const incompatibleNodes = flow.nodes.filter(node => {
      // 这里可以根据实际法术类型和节点类型进行更详细的检查
      if (node.type === 'apply_effect' && spell.includes('治疗')) {
        // apply_effect 节点用于治疗法术是合适的
        return false;
      }
      if (node.type === 'apply_effect' && spell.includes('伤害')) {
        // apply_effect 节点用于伤害法术是合适的
        return false;
      }
      return false;
    });

    if (incompatibleNodes.length > 0) {
      return {
        valid: false,
        issue: '流程节点与法术类型不匹配',
        suggestions: ['确保流程节点与法术效果类型一致', '检查法术描述和流程逻辑']
      };
    }
  }

  return { valid: true, suggestions: [] };
}

// 获取自动修复建议
export function getAutoFixSuggestions(flow: FlowDefinition): Array<{
  type: 'global' | 'node' | 'edge';
  message: string;
  fix: () => FlowDefinition;
}> {
  const suggestions: Array<{
    type: 'global' | 'node' | 'edge';
    message: string;
    fix: () => FlowDefinition;
  }> = [];

  // 检查并修复空名称
  if (!flow.name || flow.name.trim() === '') {
    suggestions.push({
      type: 'global',
      message: '流程名称为空，将自动设置为"未命名流程"',
      fix: () => ({
        ...flow,
        name: '未命名流程',
        updatedAt: Date.now()
      })
    });
  }

  // 检查并修复孤立节点
  const connectedNodes = new Set<string>();
  const entryNodes = flow.nodes.filter(n => {
    return !flow.edges.some(e => e.to === n.id);
  });

  const traverseNodes = (nodeId: string) => {
    connectedNodes.add(nodeId);
    const outgoingEdges = flow.edges.filter(e => e.from === nodeId);
    outgoingEdges.forEach(edge => {
      if (!connectedNodes.has(edge.to)) {
        traverseNodes(edge.to);
      }
    });
  };

  entryNodes.forEach(entry => {
    if (!connectedNodes.has(entry.id)) {
      traverseNodes(entry.id);
    }
  });

  const isolatedNodes = flow.nodes.filter(n => !connectedNodes.has(n.id));
  isolatedNodes.forEach(node => {
    suggestions.push({
      type: 'node',
      message: `节点 ${node.id} 是孤立的，建议删除`,
      fix: () => ({
        ...flow,
        nodes: flow.nodes.filter(n => n.id !== node.id),
        edges: flow.edges.filter(e => e.from !== node.id && e.to !== node.id),
        updatedAt: Date.now()
      })
    });
  });

  // 检查并修复重复边
  const edgeSignatures = new Map<string, number>();
  flow.edges.forEach(edge => {
    const signature = `${edge.from}->${edge.to}@${edge.trigger}`;
    edgeSignatures.set(signature, (edgeSignatures.get(signature) || 0) + 1);
  });

  edgeSignatures.forEach((count, signature) => {
    if (count > 1) {
      const [from, to, trigger] = signature.split('->');
      const edges = flow.edges.filter(e => 
        e.from === from && e.to === to && e.trigger === trigger
      );
      
      // 保留第一条边，删除重复的边
      for (let i = 1; i < edges.length; i++) {
        suggestions.push({
          type: 'edge',
          message: `删除重复的边: ${from} → ${to} (${trigger})`,
          fix: () => ({
            ...flow,
            edges: flow.edges.filter(e => !(e.from === from && e.to === to && e.trigger === trigger && e.id !== edges[0].id)),
            updatedAt: Date.now()
          })
        });
      }
    }
  });

  return suggestions;
}