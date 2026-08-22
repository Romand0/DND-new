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

  // 检查流程必须绑定法术
  if (!flow.spellId) {
    errors.push({ type: 'global', message: '流程必须绑定法术' });
  }

  return errors;
}

// 修改后的验证逻辑：分阶段验证
export function validateForPublish(flow: FlowDefinition) {
  // 只有已发布的流程才需要检查法术绑定
  if (flow.status === 'published' && !flow.spellId) {
    return { valid: false, error: '已发布的流程必须绑定法术' };
  }

  // 草稿只需要基本验证
  const basicValidation = validateFlowWithDetails(flow);
  if (basicValidation.length > 0) {
    return { valid: false, error: `存在 ${basicValidation.length} 个基本验证错误` };
  }

  return { valid: true };
}