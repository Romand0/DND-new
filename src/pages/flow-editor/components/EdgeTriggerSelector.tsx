import React from 'react';
import type { FlowEdgeDef } from '@/types/flow';

interface EdgeTriggerSelectorProps {
  edge: FlowEdgeDef;
  onUpdateEdge: (updates: Partial<FlowEdgeDef>) => void;
  isDark: boolean;
}

export default function EdgeTriggerSelector({ edge, onUpdateEdge, isDark }: EdgeTriggerSelectorProps) {
  const triggerOptions = [
    { value: 'on_complete', label: 'on_complete（完成）' },
    { value: 'on_success', label: 'on_success（成功）' },
    { value: 'on_failure', label: 'on_failure（失败）' },
    { value: 'on_partial', label: 'on_partial（部分）' },
    { value: 'on_true', label: 'on_true（是）' },
    { value: 'on_false', label: 'on_false（否）' },
  ];

  return (
    <div className="mb-3">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
        触发时机
      </label>
      <select
        value={edge.trigger}
        onChange={(e) => onUpdateEdge({
          trigger: e.target.value as any,
          label: triggerToLabel(e.target.value)
        })}
        className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
      >
        {triggerOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// 触发时机 → 标签
function triggerToLabel(trigger: string): string {
  const map: Record<string, string> = {
    on_complete: '完成',
    on_success: '成功',
    on_failure: '失败',
    on_partial: '部分',
    on_true: '是',
    on_false: '否',
  };
  return map[trigger] || trigger;
}