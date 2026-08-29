import React, { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import type { FlowDefinition } from '@/types/flow';
import type { FlowStatistics } from '@/components/flow-editor/hooks/use-flow-statistics';

interface FlowStatisticsActionsProps {
  flow: FlowDefinition;
  statistics: FlowStatistics;
}

export default function FlowStatisticsActions({
  flow,
  statistics,
}: FlowStatisticsActionsProps) {
  const [isExporting, setIsExporting] = useState(false);

  // 导出统计信息
  const handleExportStats = () => {
    setIsExporting(true);
    
    const statsData = {
      flow: {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        createdAt: flow.createdAt,
        updatedAt: flow.updatedAt,
      },
      statistics: {
        nodeCount: statistics.nodeCount,
        edgeCount: statistics.edgeCount,
        groupsCount: statistics.groups.length,
        connectedGroupsCount: statistics.connectedGroups.length,
        isolatedNodesCount: statistics.isolatedNodes.length,
        nodeTypes: Object.entries(statistics.nodeTypeStats).map(([type, stat]) => ({
          type,
          label: (stat as any).label,
          count: (stat as any).count,
          color: (stat as any).color,
        })),
      },
      exportTime: new Date().toISOString(),
    };

    // 创建并下载JSON文件
    const blob = new Blob([JSON.stringify(statsData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow-statistics-${flow.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setIsExporting(false);
  };

  // 刷新统计
  const handleRefreshStats = () => {
    // 重新计算统计信息
    window.location.reload();
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-medium dark:text-text-dark light:text-text-light">
          统计操作
        </h5>
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={handleExportStats}
          disabled={isExporting}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-3 h-3" />
          {isExporting ? '导出中...' : '导出统计'}
        </button>
        
        <button
          onClick={handleRefreshStats}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </button>
      </div>
    </div>
  );
}