import React from 'react';
import type { FlowEdgeDef } from '@/types/flow';
import type { UseTextInputResult } from '@/hooks/useInput';

interface EdgeDataMapperProps {
  edge: FlowEdgeDef;
  edgeDataMapInput: UseTextInputResult;
  onUpdateEdge: (updates: Partial<FlowEdgeDef>) => void;
  isDark: boolean;
}

export default function EdgeDataMapper({ edge, edgeDataMapInput, onUpdateEdge, isDark }: EdgeDataMapperProps) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
        数据映射（可选）
      </label>
      <textarea
        value={edgeDataMapInput.text}
        onChange={(e) => {
          edgeDataMapInput.onChange(e.target.value);
          try {
            const map = e.target.value ? JSON.parse(e.target.value) : undefined;
            onUpdateEdge({ dataMap: map });
          } catch {
            // JSON 解析错误时不更新
          }
        }}
        onBlur={edgeDataMapInput.onBlur}
        rows={4}
        className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light resize-none font-mono"
        placeholder='{"failed_targets": "input_targets"}'
      />
    </div>
  );
}