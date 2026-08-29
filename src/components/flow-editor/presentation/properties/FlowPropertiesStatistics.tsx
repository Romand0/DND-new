import React from 'react';
import FlowStatisticsBasic from './FlowStatisticsBasic';
import FlowStatisticsGroups from './FlowStatisticsGroups';
import FlowStatisticsTypes from './FlowStatisticsTypes';
import FlowStatisticsActions from './FlowStatisticsActions';
import NodeListPanel from '@/components/NodeListPanel';
import type { FlowDefinition } from '@/types/flow';
import type { FlowStatistics } from '@/components/flow-editor/hooks/use-flow-statistics';

interface FlowPropertiesStatisticsProps {
  flow: FlowDefinition;
  statistics: FlowStatistics;
  onNodeSelect?: (nodeId: string) => void;
  onNodeEdit?: (nodeId: string) => void;
  onNodeFocus?: (nodeId: string) => void;
  onNodeDelete?: (nodeId: string) => void;
}

export default function FlowPropertiesStatistics({
  flow,
  statistics,
  onNodeSelect,
  onNodeEdit,
  onNodeFocus,
  onNodeDelete,
}: FlowPropertiesStatisticsProps) {
  return (
    <div className="mt-6 space-y-3">
      <h4 className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted uppercase tracking-wide">
        流程统计
      </h4>
      
      {/* 基础统计信息 */}
      <FlowStatisticsBasic
        nodeCount={statistics.nodeCount}
        edgeCount={statistics.edgeCount}
      />
      
      {/* 分组统计 */}
      <FlowStatisticsGroups
        groups={statistics.groups}
        isolatedNodes={statistics.isolatedNodes}
        connectedGroups={statistics.connectedGroups}
      />
      
      {/* 类型统计 */}
      <FlowStatisticsTypes
        nodeTypeStats={statistics.nodeTypeStats}
      />
      
      {/* 统计操作 */}
      <FlowStatisticsActions
        flow={flow}
        statistics={statistics}
      />
      
      {/* 节点列表组件 */}
      <NodeListPanel
        flow={flow}
        statistics={statistics}
        onNodeSelect={onNodeSelect}
        onNodeEdit={onNodeEdit}
        onNodeFocus={onNodeFocus}
        onNodeDelete={onNodeDelete}
      />
    </div>
  );
}