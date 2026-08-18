import { useState } from 'react';
import { ChevronRight, Zap, Shield, Target, MousePointer, GitBranch, Heart, CheckCircle } from 'lucide-react';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef, NodeGroup, FlowNodeType } from '@/types/flow';
import { NODE_TYPE_REGISTRY } from '@/types/flow';

interface NodeListPanelProps {
  flow: FlowDefinition;
  onNodeSelect?: (nodeId: string) => void;
}

// 导出分组算法供组件使用
export function groupNodesByConnectivity(flow: FlowDefinition): NodeGroup[] {
  const groups: NodeGroup[] = [];
  const visited = new Set<string>();
  
  // 先处理相连节点组
  flow.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const group = findConnectedGroup(node, flow, visited);
      if (!group.isIsolated) {
        groups.unshift(group); // 非孤立节点组插入到前面
      }
    }
  });
  
  // 再处理孤立节点
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

// 从 NODE_TYPE_REGISTRY 获取节点颜色
function getNodeColor(nodeType: FlowNodeType): string {
  const nodeMeta = NODE_TYPE_REGISTRY.find(meta => meta.type === nodeType);
  return nodeMeta?.color || '#6b7280'; // 默认灰色
}

// 从 NODE_TYPE_REGISTRY 获取节点图标
function getNodeIcon(nodeType: FlowNodeType): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    'cast_start': <Zap className="w-3 h-3" />,
    'check_component': <Shield className="w-3 h-3" />,
    'check_range': <Target className="w-3 h-3" />,
    'select_target': <MousePointer className="w-3 h-3" />,
    'saving_throw': <Shield className="w-3 h-3" />,
    'attack_roll': <Zap className="w-3 h-3" />,
    'condition_branch': <GitBranch className="w-3 h-3" />,
    'apply_effect': <Heart className="w-3 h-3" />,
    'concentration_check': <Shield className="w-3 h-3" />,
    'cast_end': <CheckCircle className="w-3 h-3" />,
    'custom': <Zap className="w-3 h-3" />,
  };
  return iconMap[nodeType] || <Zap className="w-3 h-3" />;
}

// 从 NODE_TYPE_REGISTRY 获取节点类型名称
function getNodeTypeName(nodeType: FlowNodeType): string {
  const nodeMeta = NODE_TYPE_REGISTRY.find(meta => meta.type === nodeType);
  return nodeMeta?.label || '未知类型';
}

export default function NodeListPanel({ flow, onNodeSelect }: NodeListPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // 优化后的分组排序：相连节点组优先，孤立节点在后
  const groups = groupNodesByConnectivity(flow);
  
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };
  
  // 渲染单个节点项
  const renderNodeItem = (node: FlowNodeDef) => {
    const nodeColor = getNodeColor(node.type); // 使用类型获取颜色
    
    return (
      <div
        className={`p-3 rounded-lg cursor-pointer hover:bg-white/5 transition-colors ${
          onNodeSelect ? 'cursor-pointer' : ''
        }`}
        onClick={() => onNodeSelect?.(node.id)}
      >
        {/* 颜色徽记 - 使用类型对应的颜色 */}
        <div 
          className="w-4 h-4 rounded-full mb-2"
          style={{ backgroundColor: nodeColor }}
        />
        
        {/* 节点名称 - 完整显示 */}
        <div className="font-medium text-sm dark:text-text-dark light:text-text-light mb-1">
          {node.label || node.id}
        </div>
        
        {/* 节点类型 - 使用 NODE_TYPE_REGISTRY 的显示名称 */}
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          {getNodeTypeName(node.type)}
        </div>
        
        {/* 节点ID - 可选显示 */}
        <div className="text-xs text-gray-400 mt-1">
          ID: {node.id}
        </div>
      </div>
    );
  };
  
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted uppercase tracking-wide">
          节点列表
        </h4>
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
          {flow.nodes.length} 个节点
        </div>
      </div>
      
      <div className="space-y-2">
        {groups.map(group => (
          <div key={group.id} className="border dark:border-border-dark light:border-border-light rounded-lg">
            {/* 组标题 */}
            <button
              className="w-full flex items-center justify-between p-2.5 text-left hover:bg-white/5 transition-colors"
              onClick={() => toggleGroup(group.id)}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  group.isIsolated ? 'bg-gray-400' : 'bg-primary'
                }`} />
                <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
                  {group.isIsolated ? '孤立节点' : `流程组 (${group.nodes.length})`}
                </span>
              </div>
              <ChevronRight className={`w-3 h-3 transition-transform ${
                expandedGroups.has(group.id) ? 'rotate-90' : ''
              }`} />
            </button>
            
            {/* 组内容 - 响应式布局 */}
            {expandedGroups.has(group.id) && (
              <div className="p-2.5 space-y-1 border-t dark:border-border-dark light:border-border-light">
                {/* 响应式节点网格布局 */}
                <div className={`grid gap-2 ${
                  group.nodes.length <= 3 
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' 
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                }`}>
                  {group.nodes.map(node => renderNodeItem(node))}
                </div>
                
                {/* 显示组内的连线信息 */}
                {!group.isIsolated && group.edges.length > 0 && (
                  <div className="mt-4 pt-2 border-t dark:border-border-dark light:border-border-light">
                    <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mb-2">
                      连接关系 ({group.edges.length})
                    </div>
                    <div className="space-y-1">
                      {group.edges.slice(0, 3).map(edge => {
                        const fromNode = group.nodes.find(n => n.id === edge.from);
                        const toNode = group.nodes.find(n => n.id === edge.to);
                        return (
                          <div key={edge.id} className="text-xs dark:text-text-dark light:text-text-light">
                            <span className="text-gray-400">{fromNode?.label || edge.from}</span>
                            <span className="mx-1">→</span>
                            <span>{toNode?.label || edge.to}</span>
                            <span className="text-gray-400 ml-1">({edge.trigger})</span>
                          </div>
                        );
                      })}
                      {group.edges.length > 3 && (
                        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                          还有 {group.edges.length - 3} 条连线...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}