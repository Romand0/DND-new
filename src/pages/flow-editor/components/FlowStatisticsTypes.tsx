import React from 'react';
import type { FlowNodeType } from '@/types/flow';
import type { NodeTypeStat } from '@/pages/flow-editor/hooks/useFlowStatistics';

interface FlowStatisticsTypesProps {
  nodeTypeStats: Record<FlowNodeType, NodeTypeStat>;
}

export default function FlowStatisticsTypes({
  nodeTypeStats,
}: FlowStatisticsTypesProps) {
  // 转换为数组并排序
  const typeStats = Object.values(nodeTypeStats).sort((a, b) => b.count - a.count);
  
  if (typeStats.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-medium dark:text-text-dark light:text-text-light">
          节点类型分布
        </h5>
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
          {Object.keys(nodeTypeStats).length} 种类型
        </div>
      </div>
      
      <div className="space-y-1">
        {typeStats.map((stat, index) => (
          <div key={stat.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: stat.color }}
              />
              <span className="text-xs dark:text-text-dark light:text-text-light">
                {stat.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold dark:text-text-dark light:text-text-light">
                {stat.count}
              </span>
              <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                ({Math.round((stat.count / typeStats.reduce((sum, s) => sum + s.count, 0)) * 100)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}