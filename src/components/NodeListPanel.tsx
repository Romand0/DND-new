import { useState } from 'react';
import { ChevronRight, Zap, Shield, Target, MousePointer, GitBranch, Heart, CheckCircle } from 'lucide-react';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef, NodeGroup } from '@/types/flow';

interface NodeListPanelProps {
  flow: FlowDefinition;
  onNodeSelect?: (nodeId: string) => void;
}

// 导出分组算法供组件使用
export function groupNodesByConnectivity(flow: FlowDefinition): NodeGroup[] {
  const groups: NodeGroup[] = [];
  const visited = new Set<string>();
  
  const isolatedNodes = findIsolatedNodes(flow);
  
  isolatedNodes.forEach(node => {
    groups.push({
      id: `group-${node.id}`,
      nodes: [node],
      edges: [],
      isIsolated: true
    });
    visited.add(node.id);
  });
  
  flow.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      const group = findConnectedGroup(node, flow, visited);
      groups.push(group);
    }
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

export default function NodeListPanel({ flow, onNodeSelect }: NodeListPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
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
  
  const getNodeIcon = (node: FlowNodeDef) => {
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
    return iconMap[node.type] || <Zap className="w-3 h-3" />;
  };
  
  const getNodeTypeName = (nodeType: string) => {
    const typeMap: Record<string, string> = {
      'cast_start': '施法开始',
      'check_component': '成分检测',
      'check_range': '距离检测',
      'select_target': '目标指定',
      'saving_throw': '豁免检定',
      'attack_roll': '法术攻击检定',
      'condition_branch': '条件分支',
      'apply_effect': '效果分配',
      'concentration_check': '专注检定',
      'cast_end': '法术结束',
      'custom': '自定义',
    };
    return typeMap[nodeType] || '未知类型';
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
            
            {/* 组内容 */}
            {expandedGroups.has(group.id) && (
              <div className="p-2.5 space-y-1 border-t dark:border-border-dark light:border-border-light">
                {group.nodes.map(node => (
                  <div
                    key={node.id}
                    className={`flex items-center gap-2 p-2 rounded text-xs cursor-pointer hover:bg-white/5 ${
                      onNodeSelect ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => onNodeSelect?.(node.id)}
                  >
                    <div className="text-gray-400">{getNodeIcon(node)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium dark:text-text-dark light:text-text-light truncate">
                        {node.label || node.id}
                      </div>
                      <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                        {getNodeTypeName(node.type)}
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {node.id}
                    </div>
                  </div>
                ))}
                
                {/* 显示组内的连线信息 */}
                {!group.isIsolated && group.edges.length > 0 && (
                  <div className="mt-2 pt-2 border-t dark:border-border-dark light:border-border-light">
                    <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mb-1">
                      连接关系 ({group.edges.length})
                    </div>
                    <div className="space-y-1">
                      {group.edges.slice(0, 3).map(edge => {
                        const fromNode = group.nodes.find(n => n.id === edge.from);
                        const toNode = group.nodes.find(n => n.id === edge.to);
                        return (
                          <div key={edge.id} className="text-[10px] dark:text-text-dark light:text-text-light">
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