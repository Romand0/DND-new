import React from 'react';
import type { FlowEdgeDef } from '@/types/flow';
import type { UseTextInputResult } from '@/hooks/useInput';

interface EdgeLabelEditorProps {
  edge: FlowEdgeDef;
  edgeLabelInput: UseTextInputResult;
  onUpdateEdge: (updates: Partial<FlowEdgeDef>) => void;
  isDark: boolean;
}

export default function EdgeLabelEditor({ edge, edgeLabelInput, onUpdateEdge, isDark }: EdgeLabelEditorProps) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
        显示标签
      </label>
      <input
        type="text"
        value={edgeLabelInput.text}
        onChange={(e) => {
          edgeLabelInput.onChange(e.target.value);
          onUpdateEdge({ label: e.target.value });
        }}
        onBlur={(e) => {
          edgeLabelInput.onBlur();
          const trimmed = e.target.value.trim();
          if (trimmed !== e.target.value) {
            onUpdateEdge({ label: trimmed });
          }
        }}
        className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
      />
    </div>
  );
}