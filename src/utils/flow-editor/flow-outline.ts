// 流程结构大纲：把图结构转成线性的「步骤流」文本描述
// 关注节点之间的衔接关系（拓扑），与画布坐标无关。

import type { FlowDefinition, FlowNodeDef, EdgeTrigger } from '@/types/flow';
import { NODE_TYPE_REGISTRY } from '@/types/flow';
import { computeRanks } from './topology-layout';

/** 触发时机 → 中文短标签（默认 on_complete 不展示） */
export const TRIGGER_LABELS: Record<EdgeTrigger, string> = {
  on_complete: '完成',
  on_success: '成功',
  on_failure: '失败',
  on_partial: '部分成功',
  on_true: '是',
  on_false: '否',
};

/** 一条出向衔接 */
export interface OutlineTransition {
  edgeId: string;
  /** 边上的自定义标签（优先）或触发时机中文 */
  label: string;
  /** 是否使用了默认触发时机（on_complete 且无边标签） */
  isDefault: boolean;
  targetId: string;
  targetLabel: string;
  condition?: string;
}

/** 一个步骤（节点 + 其后继衔接） */
export interface OutlineStep {
  node: FlowNodeDef;
  typeLabel: string;
  transitions: OutlineTransition[];
}

function typeLabelOf(type: FlowNodeDef['type']): string {
  return NODE_TYPE_REGISTRY.find(m => m.type === type)?.label ?? type;
}

/**
 * 按拓扑顺序生成结构大纲。
 * 只读，不改动入参。
 */
export function buildFlowOutline(flow: FlowDefinition): OutlineStep[] {
  const ranks = computeRanks(flow);
  const order = ranks.flat();
  const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));

  const steps: OutlineStep[] = [];
  for (const id of order) {
    const node = nodeMap.get(id);
    if (!node) continue;

    const transitions: OutlineTransition[] = flow.edges
      .filter(e => e.from === id)
      .map(e => {
        const isDefault = e.trigger === 'on_complete' && !e.label;
        return {
          edgeId: e.id,
          label: e.label || TRIGGER_LABELS[e.trigger] || e.trigger,
          isDefault,
          targetId: e.to,
          targetLabel: nodeMap.get(e.to)?.label ?? e.to,
          condition: e.condition,
        };
      });

    steps.push({ node, typeLabel: typeLabelOf(node.type), transitions });
  }

  return steps;
}
