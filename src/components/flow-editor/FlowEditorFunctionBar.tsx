import React from 'react';
import { 
  PanelLeft, 
  AlertCircle, 
  ChevronRight, 
  RotateCcw, 
  PanelRight 
} from 'lucide-react';

interface FlowEditorFunctionBarProps {
  showLeftPanel: boolean;
  onToggleLeftPanel: () => void;
  validation: {
    runValidation: () => void;
  };
  showDrafts: boolean;
  onToggleDrafts: () => void;
  drafts: Array<any>;
  canvasScale: number;
  onScaleChange: (scale: number) => void;
  onResetZoom: () => void;
  onClearCanvas: () => void;
  showRightPanel: boolean;
  onToggleRightPanel: () => void;
  scaleMin: number;
  scaleMax: number;
  scaleStep: number;
}

export const FlowEditorFunctionBar: React.FC<FlowEditorFunctionBarProps> = ({
  showLeftPanel,
  onToggleLeftPanel,
  validation,
  showDrafts,
  onToggleDrafts,
  drafts,
  canvasScale,
  onScaleChange,
  onResetZoom,
  onClearCanvas,
  showRightPanel,
  onToggleRightPanel,
  scaleMin,
  scaleMax,
  scaleStep,
}) => {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b dark:border-border-dark light:border-border-light flex-shrink-0 overflow-x-auto">
      <button onClick={onToggleLeftPanel} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${showLeftPanel ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 dark:text-text-dark light:text-text-light'}`}>
        <PanelLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">节点库</span>
      </button>
      <div className="h-4 w-px dark:bg-border-dark light:bg-border-light mx-1" />
      <button onClick={validation.runValidation} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/5 dark:text-text-dark light:text-text-light">
        <AlertCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline">验证</span>
      </button>
      <button onClick={onToggleDrafts} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/5 dark:text-text-dark light:text-text-light">
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showDrafts ? 'rotate-90' : ''}`} /><span className="hidden sm:inline">草稿</span><span className="sm:hidden">({drafts.length})</span>
      </button>
      <div className="h-4 w-px dark:bg-border-dark light:bg-border-light mx-1" />
      <div className="flex-1" />
      <div className="flex items-center gap-1 mr-2">
        <button onClick={() => onScaleChange(Math.max(scaleMin, Math.round((canvasScale - scaleStep) * 100) / 100))}
          className="px-2 py-1 rounded-md text-xs dark:text-text-dark light:text-text-light hover:bg-white/5" title="缩小">−</button>
        <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted w-10 text-center tabular-nums">
          {Math.round(canvasScale * 100)}%
        </span>
        <button onClick={() => onScaleChange(Math.min(scaleMax, Math.round((canvasScale + scaleStep) * 100) / 100))}
          className="px-2 py-1 rounded-md text-xs dark:text-text-dark light:text-text-light hover:bg-white/5" title="放大">+</button>
        <button onClick={onResetZoom}
          className="px-2 py-1 rounded-md text-[10px] dark:text-text-dark-muted light:text-text-light-muted hover:bg-white/5 hidden sm:inline-block" title="重置缩放">1:1</button>
      </div>
      <button onClick={onClearCanvas} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors text-red-400 hover:bg-red-400/10">
        <RotateCcw className="w-3.5 h-3.5" /><span className="hidden sm:inline">清空</span>
      </button>
      <div className="h-4 w-px dark:bg-border-dark light:bg-border-light mx-1 hidden sm:block" />
      <button onClick={onToggleRightPanel} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${showRightPanel ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 dark:text-text-dark light:text-text-light'}`}>
        <PanelRight className="w-3.5 h-3.5" /><span className="hidden sm:inline">属性</span>
      </button>
    </div>
  );
};