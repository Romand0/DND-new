import React from 'react';
import type { NodeGroup, FlowNodeDef } from '@/types/flow';

interface FlowStatisticsGroupsProps {
  groups: NodeGroup[];
  isolatedNodes: FlowNodeDef[];
  connectedGroups: NodeGroup[];
}

export default function FlowStatisticsGroups({
  groups,
  isolatedNodes,
  connectedGroups,
}: FlowStatisticsGroupsProps) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-medium dark:text-text-dark light:text-text-light">
          分组统计
        </h5>
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
          {connectedGroups.length} 个连接组，{isolatedNodes.length} 个孤立节点
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
          <div className="text-sm font-semibold text-primary">{connectedGroups.length}</div>
          <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">连接组</div>
        </div>
        <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
          <div className="text-sm font-semibold text-orange-400">{isolatedNodes.length}</div>
          <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">孤立节点</div>
        </div>
      </div>
      
      {/* 连接组详情 */}
      {connectedGroups.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-medium">
            连接组详情：
          </div>
          {connectedGroups.slice(0, 3).map((group, index) => (
            <div key={group.id} className="text-xs dark:text-text-dark light:text-text-light">
              <span className="text-primary">组 {index + 1}:</span> {group.nodes.length} 个节点，{group.edges.length} 条连线
            </div>
          ))}
          {connectedGroups.length > 3 && (
            <div className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">
              还有 {connectedGroups.length - 3} 个连接组...
            </div>
          )}
        </div>
      )}
    </div>
  );
}