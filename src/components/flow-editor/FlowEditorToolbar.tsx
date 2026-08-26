import React from 'react';
import { ArrowLeft, CloudUpload, Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTextInput } from '@/hooks/useInput';

interface FlowEditorToolbarProps {
  flowName: string;
  flowStatus: 'draft' | 'published';
  saveStatus: 'idle' | 'saving' | 'saved';
  validationStatus: 'valid' | 'invalid';
  onExit: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  onFlowNameChange: (value: string) => void;
  onFlowNameBlur: () => void;
}

export const FlowEditorToolbar: React.FC<FlowEditorToolbarProps> = ({
  flowName,
  flowStatus,
  saveStatus,
  validationStatus,
  onExit,
  onPublish,
  onSaveDraft,
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
          onClick={onPublish}
          disabled={validationStatus === 'invalid'}
          className={`
            flex items-center gap-1 px-3 py-1.5 h-10 rounded-lg text-xs font-medium border transition-colors min-w-[80px]
            ${validationStatus === 'valid'
              ? 'border-green-500 text-green-500 hover:border-green-400 hover:text-green-400 hover:bg-green-500/10'
              : 'border-gray-400 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          <CloudUpload className="w-3.5 h-3.5" />
          <span className="truncate">{flowStatus === 'published' ? '更新' : '发布'}</span>
        </button>
        <button
          onClick={onSaveDraft}
          disabled={saveStatus === 'saving'}
          className={`
            flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium
            transition-all duration-300
            ${saveStatus === 'saved'
              ? 'bg-emerald-500 text-white scale-95'
              : saveStatus === 'saving'
              ? 'bg-primary/60 text-white/70 cursor-wait'
              : validationStatus === 'valid'
              ? 'bg-primary text-white hover:bg-primary/90 active:scale-95'
              : 'bg-orange-500 text-white hover:bg-orange-90 active:scale-95'
            }
          `}
        >
          {saveStatus === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saveStatus === 'saved' && <CheckCircle className="w-3.5 h-3.5" />}
          {saveStatus === 'idle' && (
            validationStatus === 'valid' ? <Save className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
};