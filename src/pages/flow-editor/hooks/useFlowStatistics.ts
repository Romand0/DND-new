import { useMemo } from 'react';
import React from 'react';
import { Zap, MousePointer, Shield, GitBranch, Heart, CheckCircle } from 'lucide-react';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef, NodeGroup, FlowNodeType } from '@/types/flow';
import { NODE_TYPE_REGISTRY } from '@/types/flow';

// 从 NODE_TYPE_REGISTRY 获取节点颜色
function getNodeColor(nodeType: FlowNodeType): string {
  const nodeMeta = NODE_TYPE_REGISTRY.find(meta => meta.type === nodeType);
  return nodeMeta?.color || '#6b7280'; // 默认灰色
}

// 从 NODE_TYPE_REGISTRY 获取节点图标
function getNodeIcon(nodeType: FlowNodeType): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    'cast_start': React.createElement(Zap, { className: "w-3 h-3" }),
    'select_target': React.createElement(MousePointer, { className: "w-3 h-3" }),
    'saving_throw': React.createElement(Shield, { className: "w-3 h-3" }),
    'attack_roll': React.createElement(Zap, { className: "w-3 h-3" }),
    'condition_branch': React.createElement(GitBranch, { className: "w-3 h-3" }),
    'apply_effect': React.createElement(Heart, { className: "w-3 h-3" }),
    'concentration_check': React.createElement(Shield, { className: "w-3 h-3" }),
    'cast_end': React.createElement(CheckCircle, { className: "w-3 h-3" }),
    'custom': React.createElement(Zap, { className: "w-3 h-3" }),
  };
  return iconMap[nodeType] || React.createElement(Zap, { className: "w-3 h-3" });
}

// 从 NODE_TYPE_REGISTRY 获取节点类型名称
function getNodeTypeName(nodeType: FlowNodeType): string {
  const nodeMeta = NODE_TYPE_REGISTRY.find(meta => meta.type === nodeType);
  return nodeMeta?.label || '未知类型';
}

// 从节点备注中提取组名
function extractGroupName(node: FlowNodeDef): string {
  if (!node.notes) {
    return '流程组';
  }
  
  // 匹配"组：XXX"格式
  const match = node.notes.match(/组：(.+)/);
  if (match) {
    return match[1];
  }
  
  return '流程组';
}

// 导出分组算法供组件使用
export function groupNodesByConnectivity(flow: FlowDefinition): NodeGroup[] {
  const groups: NodeGroup[] = [];
  const visited = new Set<string>();
  
  // 先处理相连节点组
  flow.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const group = findConnectedGroup(node, flow, visited);
      // 关键修正：只有≥2个节点才算流程组
      if (!group.isIsolated && group.nodes.length >= 2) {
        groups.unshift(group); // 非孤立节点组插入到前面
      }
    }
  });
  
  // 再处理孤立节点（包括单节点组）
  const isolatedNodes = findIsolatedNodes(flow);
  isolatedNodes.forEach(node => {
    groups.push({ // 孤立节点追加到后面
      id: `group-${node.id}`,
      nodes: [node],
      edges: [],
      isIsolated: true
    });
  });
  
  return groups;
}

function findIsolatedNodes(flow: FlowDefinition): FlowNodeDef[] {
  const connectedNodes = new Set<string>();
  flow.edges.forEach(edge => {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  });
  return flow.nodes.filter(node => !connectedNodes.has(node.id));
}

function findConnectedGroup(
  startNode: FlowNodeDef, 
  flow: FlowDefinition, 
  visited: Set<string>
): NodeGroup {
  const groupNodes: FlowNodeDef[] = [];
  const groupEdges: FlowEdgeDef[] = [];
  const stack = [startNode];
  
  while (stack.length > 0) {
    const currentNode = stack.pop();
    if (!currentNode || visited.has(currentNode.id)) continue;
    
    visited.add(currentNode.id);
    groupNodes.push(currentNode);
    
    const relatedEdges = flow.edges.filter(edge => 
      edge.from === currentNode.id || edge.to === currentNode.id
    );
    
    relatedEdges.forEach(edge => {
      groupEdges.push(edge);
      
      const adjacentNodeId = edge.from === currentNode.id ? edge.to : edge.from;
      const adjacentNode = flow.nodes.find(n => n.id === adjacentNodeId);
      if (adjacentNode && !visited.has(adjacentNodeId)) {
        stack.push(adjacentNode);
      }
    });
  }
  
  return {
    id: `group-${startNode.id}`,
    nodes: groupNodes,
    edges: groupEdges,
    isIsolated: false
  };
}

// 节点类型统计接口
interface NodeTypeStat {
  count: number;
  color: string;
  icon: React.ReactNode;
  label: string;
}

// Hook 返回值接口
interface FlowStatistics {
  // 基础统计
  nodeCount: number;
  edgeCount: number;
  
  // 分组统计
  groups: NodeGroup[];
  isolatedNodes: FlowNodeDef[];
  connectedGroups: NodeGroup[];
  
  // 类型统计
  nodeTypeStats: Record<FlowNodeType, NodeTypeStat>;
  
  // 工具函数
  getNodeStats: (nodeId: string) => {
    node: FlowNodeDef;
    group: NodeGroup | undefined;
    typeStats: NodeTypeStat;
  } | null;
  getNodeColor: (nodeType: FlowNodeType) => string;
  getNodeTypeName: (nodeType: FlowNodeType) => string;
  getNodeIcon: (nodeType: FlowNodeType) => React.ReactNode;
  extractGroupName: (node: FlowNodeDef) => string;
}

export function useFlowStatistics(flow: FlowDefinition): FlowStatistics {
  // 1. 基础统计计算
  const nodeCount = flow.nodes.length;
  const edgeCount = flow.edges.length;
  
  // 2. 节点分组统计
  const groups = useMemo(() => groupNodesByConnectivity(flow), [flow]);
  const isolatedNodes = useMemo(() => findIsolatedNodes(flow), [flow]);
  const connectedGroups = useMemo(() => groups.filter(g => !g.isIsolated), [groups]);
  
  // 3. 节点类型统计
  const nodeTypeStats = useMemo(() => {
    return flow.nodes.reduce((acc, node) => {
      const nodeMeta = NODE_TYPE_REGISTRY.find(meta => meta.type === node.type);
      acc[node.type] = {
        count: (acc[node.type]?.count || 0) + 1,
        color: nodeMeta?.color || '#6b7280',
        icon: getNodeIcon(node.type),
        label: nodeMeta?.label || '未知类型'
      };
      return acc;
    }, {} as Record<FlowNodeType, NodeTypeStat>);
  }, [flow.nodes]);
  
  // 4. 导出统计函数
  const getNodeStats = (nodeId: string) => {
    const node = flow.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    
    return {
      node,
      group: groups.find(g => g.nodes.some(n => n.id === nodeId)),
      typeStats: nodeTypeStats[node.type]
    };
  };
  
  return {
    // 基础统计
    nodeCount,
    edgeCount,
    
    // 分组统计
    groups,
    isolatedNodes,
    connectedGroups,
    
    // 类型统计
    nodeTypeStats,
    
    // 工具函数
    getNodeStats,
    getNodeColor: (nodeType: FlowNodeType) => nodeTypeStats[nodeType]?.color || '#6b7280',
    getNodeTypeName: (nodeType: FlowNodeType) => nodeTypeStats[nodeType]?.label || '未知类型',
    getNodeIcon: (nodeType: FlowNodeType) => nodeTypeStats[nodeType]?.icon || React.createElement(Zap, { className: "w-3 h-3" }),
    extractGroupName,
  };
}