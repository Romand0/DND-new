import React from 'react';
import { ArrowLeft, Save, CheckCircle, AlertCircle, Loader2, Wand2 } from 'lucide-react';
import { useTextInput } from '@/hooks/useInput';

interface FlowEditorToolbarProps {
  flowName: string;
  flowStatus: 'draft' | 'published';
  saveStatus: 'idle' | 'saving' | 'saved';
  validationStatus: 'valid' | 'invalid';
  syncStatus: 'idle' | 'syncing' | 'synced';
  onExit: () => void;
  onSave: () => void;
  onTidyLayout: () => void;
  onFlowNameChange: (value: string) => void;
  onFlowNameBlur: () => void;
}

export const FlowEditorToolbar: React.FC<FlowEditorToolbarProps> = ({
  flowName,
  flowStatus,
  saveStatus,
  validationStatus,
  syncStatus,
  onExit,
  onSave,
  onTidyLayout,
  onFlowNameChange,
  onFlowNameBlur,
}) => {
  const flowNameInput = useTextInput(flowName);

  return (
    <div className="flex items-center justify-between h-12 border-b dark:border-border-dark light:border-border-light flex-shrink-0 dark:bg-bg-dark-2 light:bg-white">
      <div className="flex items-center gap-2 px-4">
        <button onClick={onExit} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors dark:text-text-dark light:text-text-light hover:bg-white/5">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">退出</span>
        </button>
        <div className="h-5 w-px dark:bg-border-dark light:bg-border-light" />
        <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs">
          {syncStatus === 'syncing' && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
          {syncStatus === 'synced' && <CheckCircle className="w-3 h-3 text-green-400" />}
          {syncStatus === 'idle' && <div className="w-3 h-3 rounded-full bg-gray-400" />}
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">缓存</span>
        </div>
        <div className="h-5 w-px dark:bg-border-dark light:bg-border-light" />
        <input 
          type="text" 
          value={flowNameInput.text} 
          onChange={(e) => flowNameInput.onChange(e.target.value)} 
          onBlur={flowNameInput.onBlur}
          onInput={(e) => onFlowNameChange((e.target as HTMLInputElement).value)}
          onBlurCapture={onFlowNameBlur}
          className="text-sm font-medium bg-transparent border-none outline-none dark:text-text-dark light:text-text-light w-28 sm:w-48" 
          placeholder="流程名称" 
        />
      </div>
      <div className="flex items-center gap-2 px-4">
        <button
          onClick={onTidyLayout}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5"
          title="按拓扑结构重新排列所有节点"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">整理布局</span>
        </button>
        <button
          onClick={onSave}
          disabled={saveStatus === 'saving' || validationStatus === 'invalid'}
          title={validationStatus === 'invalid' ? '流程校验未通过，无法发布' : '保存即发布到云端正式版'}
          className={`
            flex items-center gap-1 px-3 py-1.5 h-10 rounded-lg text-xs font-medium
            transition-all duration-300
            ${saveStatus === 'saved'
              ? 'bg-emerald-500 text-white scale-95'
              : saveStatus === 'saving'
              ? 'bg-primary/60 text-white/70 cursor-wait'
              : validationStatus === 'invalid'
              ? 'bg-gray-400 text-white/70 cursor-not-allowed'
              : 'bg-primary text-white hover:bg-primary/90 active:scale-95'
            }
          `}
        >
          {saveStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saveStatus === 'saved' && <CheckCircle className="w-3.5 h-3.5" />}
          {saveStatus === 'idle' && <Save className="w-3.5 h-3.5" />}
          <span className="truncate">{flowStatus === 'published' ? '保存并发布' : '发布'}</span>
        </button>
      </div>
    </div>
  );
};