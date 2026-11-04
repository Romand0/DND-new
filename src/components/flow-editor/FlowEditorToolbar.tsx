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
    <div className="flex items-center justify-between h-12 border-b dark:border-border-dark light:border-border-light flex-shrink-0 dark:bg-bg-dark-2 light:bg-white overflow-hidden">
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 min-w-0 flex-1">
        <button onClick={onExit} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 dark:text-text-dark light:text-text-light hover:bg-white/5">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">退出</span>
        </button>
        <div className="h-5 w-px shrink-0 dark:bg-border-dark light:bg-border-light hidden sm:block" />
        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-xs shrink-0">
          {syncStatus === 'syncing' && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
          {syncStatus === 'synced' && <CheckCircle className="w-3 h-3 text-green-400" />}
          {syncStatus === 'idle' && <div className="w-3 h-3 rounded-full bg-gray-400" />}
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">缓存</span>
        </div>
        <div className="h-5 w-px shrink-0 dark:bg-border-dark light:bg-border-light hidden sm:block" />
        <input
          type="text"
          value={flowNameInput.text}
          onChange={(e) => flowNameInput.onChange(e.target.value)}
          onBlur={flowNameInput.onBlur}
          onInput={(e) => onFlowNameChange((e.target as HTMLInputElement).value)}
          onBlurCapture={onFlowNameBlur}
          className="text-sm font-medium bg-transparent border-none outline-none dark:text-text-dark light:text-text-light flex-1 min-w-0 sm:w-48 sm:flex-none"
          placeholder="流程名称"
        />
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 shrink-0">
        <button
          onClick={onTidyLayout}
          className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5"
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
            flex items-center gap-1 px-2 sm:px-3 py-1.5 h-10 rounded-lg text-xs font-medium shrink-0
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
          <span className="truncate hidden sm:inline">{flowStatus === 'published' ? '保存并发布' : '发布'}</span>
          <span className="sm:hidden">发布</span>
        </button>
      </div>
    </div>
  );
};