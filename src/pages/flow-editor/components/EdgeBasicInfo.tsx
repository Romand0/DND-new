import React from 'react';
import type { FlowEdgeDef } from '@/types/flow';

interface EdgeBasicInfoProps {
  edge: FlowEdgeDef;
  isDark: boolean;
}

export default function EdgeBasicInfo({ edge, isDark }: EdgeBasicInfoProps) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
        边 ID
      </label>
      <input
        type="text"
        value={edge.id}
        readOnly
        className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light opacity-60"
      />
    </div>
  );
}