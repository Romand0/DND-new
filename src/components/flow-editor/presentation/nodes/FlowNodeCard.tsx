import React from 'react';
import type { FlowNodeDef } from '@/types/flow';
import { NODE_TYPE_REGISTRY } from '@/types/flow';
import { NODE_W } from '@/utils/flow-editor/constants';
import { resolveNodeIcon } from '@/utils/flow-editor/node-icon';

interface FlowNodeCardProps {
  node: FlowNodeDef;
  x: number;
  y: number;
  /** 尺寸测量回调（供连线端点计算使用） */
  nodeRef?: (el: HTMLDivElement | null) => void;
}

/**
 * 只读节点卡片：仅描述节点的语义与配置摘要，不含拖拽/连接/删除等编辑交互。
 */
export default function FlowNodeCard({ node, x, y, nodeRef }: FlowNodeCardProps) {
  const meta = NODE_TYPE_REGISTRY.find(m => m.type === node.type);
  const configEntries = node.config ? Object.entries(node.config) : [];

  return (
    <div
      ref={nodeRef}
      data-node-id={node.id}
      className="absolute select-none"
      style={{ left: x, top: y, width: NODE_W }}
    >
      <div className="rounded-lg border-2 border-primary/30 dark:bg-bg-dark-2 light:bg-white shadow-sm p-2.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-5 h-5 rounded flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: meta?.color || '#6b7280' }}
          >
            {resolveNodeIcon(meta?.icon)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold dark:text-text-dark light:text-text-light truncate">
              {node.label}
            </div>
            <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted truncate">
              {meta?.label || node.type}
            </div>
          </div>
        </div>

        {configEntries.length > 0 && (
          <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 max-h-16 overflow-hidden">
            {configEntries.slice(0, 4).map(([k, v]) => (
              <div key={k} className="truncate pr-1" title={`${k}: ${String(v)}`}>
                <span className="font-medium">{k}:</span>
                <span className="ml-1">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
