import { useState } from 'react';
import { ChevronRight, Edit3, ExternalLink, Trash2 } from 'lucide-react';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef, NodeGroup, FlowNodeType } from '@/types/flow';
import { useFlowStatistics } from '@/pages/flow-editor/hooks/useFlowStatistics';

interface NodeListPanelProps {
  flow: FlowDefinition;
  statistics: ReturnType<typeof useFlowStatistics>;
  onNodeSelect?: (nodeId: string) => void;
  onNodeEdit?: (nodeId: string) => void;
  onNodeFocus?: (nodeId: string) => void;
  onNodeDelete?: (nodeId: string) => void;
}

export default function NodeListPanel({ flow, statistics, onNodeSelect, onNodeEdit, onNodeFocus, onNodeDelete }: NodeListPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
  
  const { groups, getNodeColor, getNodeTypeName, getNodeIcon, extractGroupName } = statistics;
  
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