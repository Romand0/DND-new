import React from 'react';
import type { FlowEdgeDef } from '@/types/flow';
import type { UseTextInputResult } from '@/hooks/useInput';

interface EdgeConditionEditorProps {
  edge: FlowEdgeDef;
  edgeConditionInput: UseTextInputResult;
  onUpdateEdge: (updates: Partial<FlowEdgeDef>) => void;
  isDark: boolean;
}

export default function EdgeConditionEditor({ edge, edgeConditionInput, onUpdateEdge, isDark }: EdgeConditionEditorProps) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
        守卫条件（可选）
      </label>
      <input
        type="text"
        value={edgeConditionInput.text}
        onChange={(e) => {
          edgeConditionInput.onChange(e.target.value);
          onUpdateEdge({ condition: e.target.value || undefined });
        }}
        onBlur={(e) => {
          edgeConditionInput.onBlur();
          const trimmed = e.target.value.trim();
          if (trimmed !== e.target.value) {
            onUpdateEdge({ condition: trimmed || undefined });
          }
        }}
        className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
        placeholder="如：target.currentHp > 0"
      />
    </div>
  );
}