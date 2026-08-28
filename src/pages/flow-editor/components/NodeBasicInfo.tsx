import React from 'react';
import { NODE_TYPE_REGISTRY } from '@/types/flow';
import type { FlowNodeDef } from '@/types/flow';
import { useTextInput } from '@/hooks/useInput';

interface NodeBasicInfoProps {
  node: FlowNodeDef;
  nodeLabelInput: {
    text: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    reset: () => void;
    setExternal: (value: string) => void;
  };
  nodeNotesInput: {
    text: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    reset: () => void;
    setExternal: (value: string) => void;
  };
  updateNodeLabel: (nodeId: string, label: string) => void;
  updateNodeNotes: (nodeId: string, notes: string) => void;
  isDark: boolean;
}

export default function NodeBasicInfo({
  node,
  nodeLabelInput,
  nodeNotesInput,
  updateNodeLabel,
  updateNodeNotes,
  isDark,
}: NodeBasicInfoProps) {
  // 获取节点图标
  const resolveNodeIcon = (iconName?: string) => {
    if (!iconName) return '⚪';
    return iconName;
  };

  return (
    <div className="space-y-3">
      {/* 节点基本信息 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-6 h-6 rounded flex items-center justify-center text-white bg-primary">
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
        <label className="text-xs font-medium dark:text-text-dark light:text-text-light block mb-1.5">
          节点 ID
        </label>
        <input
          type="text"
          value={node.id}
          readOnly
          className="w-full px-3 py-2 text-xs border dark:border-border-dark light:border-border-light rounded bg-white/5 dark:bg-card-dark light:bg-card-light text-gray-400"
        />
      </div>

      {/* 显示名称编辑 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark light:text-text-light block mb-1.5">
          显示名称
        </label>
        <input
          type="text"
          value={nodeLabelInput.text}
          onChange={(e) => {
            nodeLabelInput.onChange(e.target.value);
            updateNodeLabel(node.id, e.target.value);
          }}
          onBlur={nodeLabelInput.onBlur}
          className="w-full px-3 py-2 text-xs border dark:border-border-dark light:border-border-light rounded bg-white/10 dark:bg-card-dark light:bg-card-light dark:text-text-dark light:text-text-light focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="输入节点名称..."
        />
      </div>

      {/* 备注编辑 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark light:text-text-light block mb-1.5">
          备注
        </label>
        <textarea
          value={nodeNotesInput.text}
          onChange={(e) => {
            nodeNotesInput.onChange(e.target.value);
            updateNodeNotes(node.id, e.target.value);
          }}
          onBlur={nodeNotesInput.onBlur}
          rows={3}
          className="w-full px-3 py-2 text-xs border dark:border-border-dark light:border-border-light rounded bg-white/10 dark:bg-card-dark light:bg-card-light dark:text-text-dark light:text-text-light focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="添加备注..."
        />
      </div>
    </div>
  );
}