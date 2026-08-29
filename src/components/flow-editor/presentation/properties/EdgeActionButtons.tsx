import React from 'react';
import { Trash2 } from 'lucide-react';
import type { FlowEdgeDef } from '@/types/flow';

interface EdgeActionButtonsProps {
  edge: FlowEdgeDef;
  onDeleteEdge: (edgeId: string) => void;
  isDark: boolean;
}

export default function EdgeActionButtons({ edge, onDeleteEdge, isDark }: EdgeActionButtonsProps) {
  return (
    <button
      onClick={() => onDeleteEdge(edge.id)}
      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
      删除连线
    </button>
  );
}