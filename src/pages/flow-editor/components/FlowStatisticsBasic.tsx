import React from 'react';

interface FlowStatisticsBasicProps {
  nodeCount: number;
  edgeCount: number;
}

export default function FlowStatisticsBasic({
  nodeCount,
  edgeCount,
}: FlowStatisticsBasicProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
        <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{nodeCount}</div>
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">节点</div>
      </div>
      <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
        <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{edgeCount}</div>
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">连线</div>
      </div>
    </div>
  );
}