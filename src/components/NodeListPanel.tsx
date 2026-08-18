import { useState } from 'react';
import { ChevronRight, Edit3, ExternalLink, Trash2, Zap, Shield, Target, MousePointer, GitBranch, Heart, CheckCircle } from 'lucide-react';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef, NodeGroup, FlowNodeType } from '@/types/flow';
import { NODE_TYPE_REGISTRY } from '@/types/flow';

interface NodeListPanelProps {
  flow: FlowDefinition;
  onNodeSelect?: (nodeId: string) => void;
  onNodeEdit?: (nodeId: string) => void;
  onNodeFocus?: (nodeId: string) => void;
  onNodeDelete?: (nodeId: string) => void;
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

export default function NodeListPanel({ flow, onNodeSelect, onNodeEdit, onNodeFocus, onNodeDelete }: NodeListPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
  
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
    const nodeColor = getNodeColor(node.type);
    
    return (
      <div className="p-3 rounded-lg hover:bg-white/5 transition-colors">
        {/* 颜色徽记 - 使用类型对应的颜色 */}
        <div 
          className="w-4 h-4 rounded-full mb-2"
          style={{ backgroundColor: nodeColor }}
        />
        
        {/* 节点名称 - 完整显示 */}
        <div className="font-medium text-sm dark:text-text-dark light:text-text-light mb-2">
          {node.label || node.id}
        </div>
        
        {/* 节点类型 - 使用 NODE_TYPE_REGISTRY 的显示名称 */}
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-2">
          {getNodeTypeName(node.type)}
        </div>
        
        {/* 节点ID - 可选显示 */}
        <div className="text-xs text-gray-400 mb-3">
          ID: {node.id}
        </div>
        
        {/* 操作按钮组 */}
        <div className="flex gap-1">
          {/* 编辑按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNodeEdit?.(node.id);
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs text-blue-400 hover:bg-blue-400/10 transition-colors"
            title="编辑节点"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          
          {/* 跳转按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNodeFocus?.(node.id);
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs text-green-400 hover:bg-green-400/10 transition-colors"
            title="跳转到节点"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
          
          {/* 删除按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirmOpen(node.id);
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
            title="删除节点"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };
  
  // 渲染组标题
  const renderGroupTitle = (group: NodeGroup) => {
    const firstNode = group.nodes[0];
    const groupName = extractGroupName(firstNode);
    
    return (
      <div className="flex items-center justify-between p-3 border-b dark:border-border-dark light:border-border-light">
        <div className="flex items-center gap-3">
          {/* 组类型指示器 */}
          <div className={`w-3 h-3 rounded-full ${
            group.isIsolated ? 'bg-gray-400' : 'bg-primary'
          }`} />
          
          {/* 组名称 */}
          <div className="font-medium text-sm dark:text-text-dark light:text-text-light">
            {group.isIsolated ? '孤立节点' : `${groupName} (${group.nodes.length})`}
          </div>
          
          {/* 第一个节点的颜色徽记和名称 */}
          {!group.isIsolated && (
            <div className="flex items-center gap-2 ml-4">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getNodeColor(firstNode.type) }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {firstNode.label || firstNode.id}
              </span>
            </div>
          )}
        </div>
        
        {/* 展开/折叠箭头 */}
        <ChevronRight className={`w-4 h-4 transition-transform ${
          expandedGroups.has(group.id) ? 'rotate-90' : ''
        }`} />
      </div>
    );
  };
  
  // 确认删除弹窗
  const renderDeleteConfirmModal = () => {
    if (!deleteConfirmOpen) return null;
    
    const node = flow.nodes.find(n => n.id === deleteConfirmOpen);
    if (!node) return null;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg p-6 max-w-sm w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-xl">
          <h3 className="text-base font-bold mb-2">确认删除</h3>
          <p className="text-sm opacity-60 mb-4">
            确定要删除节点 <span className="font-medium">"{node.label || node.id}"</span> 吗？
            <br />
            <span className="text-red-400">此操作不可恢复</span>
          </p>
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => {
                onNodeDelete?.(deleteConfirmOpen);
                setDeleteConfirmOpen(null);
              }} 
              className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600"
            >
              确认删除
            </button>
            <button 
              onClick={() => setDeleteConfirmOpen(null)} 
              className="px-4 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-3">
      {/* 确认删除弹窗 */}
      {renderDeleteConfirmModal()}
      
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
          <div key={group.id} className="border dark:border-border-dark light:border-border-light rounded-lg overflow-hidden">
            {/* 组标题 - 显示组名和第一个节点信息 */}
            <button
              className="w-full text-left hover:bg-white/5 transition-colors"
              onClick={() => toggleGroup(group.id)}
            >
              {renderGroupTitle(group)}
            </button>
            
            {/* 组内容 - 默认展开 */}
            {expandedGroups.has(group.id) && (
              <div className="p-3 space-y-2 bg-gray-50/5 dark:bg-gray-900/5">
                {/* 节点列表 - 使用统一的节点卡片样式 */}
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.nodes.map(node => renderNodeItem(node))}
                </div>
                
                {/* 连线信息 */}
                {!group.isIsolated && group.edges.length > 0 && (
                  <div className="mt-3 pt-3 border-t dark:border-border-dark light:border-border-light">
                    <div className="text-xs text-gray-500 mb-2">
                      连接关系 ({group.edges.length})
                    </div>
                    <div className="space-y-1">
                      {group.edges.slice(0, 3).map(edge => {
                        const fromNode = group.nodes.find(n => n.id === edge.from);
                        const toNode = group.nodes.find(n => n.id === edge.to);
                        return (
                          <div key={edge.id} className="text-xs text-gray-600 dark:text-gray-400">
                            <span>{fromNode?.label || edge.from}</span>
                            <span className="mx-1">→</span>
                            <span>{toNode?.label || edge.to}</span>
                            <span className="text-gray-500 ml-1">({edge.trigger})</span>
                          </div>
                        );
                      })}
                      {group.edges.length > 3 && (
                        <div className="text-xs text-gray-500">
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