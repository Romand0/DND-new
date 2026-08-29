import React from 'react';
import { NODE_TYPE_REGISTRY } from '@/types/flow';
import type { FlowNodeDef } from '@/types/flow';
import { resolveNodeIcon } from '@/utils/flow-editor/node-icon';

interface NodeBasicInfoProps {
  node: FlowNodeDef;
  updateNodeLabel: (nodeId: string, label: string) => void;
  isDark: boolean;
}

export default function NodeBasicInfo({
  node,
  updateNodeLabel,
  isDark,
}: NodeBasicInfoProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="w-6 h-6 rounded flex items-center justify-center text-white"
          style={{ backgroundColor: NODE_TYPE_REGISTRY.find(m => m.type === node.type)?.color || '#6b7280' }}
        >
          {resolveNodeIcon(NODE_TYPE_REGISTRY.find(m => m.type === node.type)?.icon)}
        </span>
        <div>
          <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">
            {node.label}
          </h3>
          <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
            {node.type}
          </p>
        </div>
      </div>

      {/* 节点 ID（只读） */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
          节点 ID
        </label>
        <input
          type="text"
          value={node.id}
          readOnly
          className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light opacity-60"
        />
      </div>

      {/* 显示名称 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
          显示名称
        </label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => {
            updateNodeLabel(node.id, e.target.value);
          }}
          onBlur={(e) => {
            const trimmed = e.target.value.trim();
            if (trimmed !== e.target.value) {
              updateNodeLabel(node.id, trimmed);
            }
          }}
          className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
        />
      </div>
    </div>
  );
}