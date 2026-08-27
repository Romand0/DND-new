import React from 'react';
import { CheckCircle, AlertCircle, Sparkles, X } from 'lucide-react';
import { Flow } from '@/types/flow';
import { validateFlowId } from '@/utils/flow-validation';
import { SpellPickerField } from '@/components/flow-editor/SpellPickerField';

interface FlowPropertiesHeaderProps {
  flow: Flow;
  draftId: string;
  idDirty: boolean;
  idErrors: string[];
  spellPickerOpen: boolean;
  setDraftId: (id: string) => void;
  setIdDirty: (dirty: boolean) => void;
  setIdErrors: (errors: string[]) => void;
  setSpellPickerOpen: (open: boolean) => void;
  setShowRightPanel: (show: boolean) => void;
  validation: {
    validationStatus: 'valid' | 'invalid';
    validationErrors: Array<{
      id?: string;
      field?: string;
      message: string;
    }>;
  };
}

export function FlowPropertiesHeader({
  flow,
  draftId,
  idDirty,
  idErrors,
  spellPickerOpen,
  setDraftId,
  setIdDirty,
  setIdErrors,
  setSpellPickerOpen,
  setShowRightPanel,
  validation
}: FlowPropertiesHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-4 lg:hidden">
        <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">属性</h3>
        <button
          onClick={() => setShowRightPanel(false)}
          className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 流程校验状态 */}
      <div className={`mb-4 p-3 rounded-lg border ${
        validation.validationStatus === 'valid'
          ? 'border-green-500/20 bg-green-500/5' 
          : 'border-red-500/20 bg-red-500/5'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          {validation.validationStatus === 'valid' ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">流程可以发布</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">
                流程无法发布（{validation.validationErrors.length} 个错误）
              </span>
            </>
          )}
        </div>
        {validation.validationErrors.length > 0 && (
          <div className="text-xs text-red-300">
             主要问题：{validation.validationErrors[0].message}
          </div>
        )}
      </div>

      <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-4">
        流程属性
      </h3>

      {/* 流程 ID —— 草稿编辑 + 重命名按钮 */}
      <div className="mb-3">
        <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
          流程 ID
        </label>
        <div className="flex items-center gap-1">
          {/* 输入框：绑定草稿，自由编辑 */}
          <input
            type="text"
            value={draftId}
            onChange={e => {
              setDraftId(e.target.value);
              setIdDirty(e.target.value !== flow.id);
              setIdErrors([]);  // 编辑中清空错误
            }}
            className="flex-1 min-w-0 px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none font-mono"
            placeholder="如 spell:fireball"
          />
          {/* 从法术库选取按钮 */}
          <button
            type="button"
            onClick={() => setSpellPickerOpen(true)}
            className="shrink-0 p-1.5 rounded border dark:border-border-dark light:border-border-light hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
            title="从法术库选取"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
          {/* 重命名按钮：仅此触发校验 + 写入 */}
          <button
            type="button"
            disabled={!idDirty}
            onClick={() => {
              const allIds = []; // TODO: 需要从 flowStore 获取
              const errors = validateFlowId(draftId, allIds, flow.id);
              if (errors.length > 0) {
                setIdErrors(errors);
                return;
              }
              if (draftId === flow.id) {
                setIdDirty(false);
                setIdErrors([]);
                return;
              }
              // 合法 → 写入
              // TODO: 需要调用 flowStore.renameId
              const result = null; // 临时占位
              if (result) {
                // setFlow(result);
                setIdDirty(false);
                setIdErrors([]);
                // navigate(`/flow-editor/${draftId}`, { replace: true });
              } else {
                setIdErrors(['重命名失败：源流程未在库中找到或目标 ID 已被占用']);
              }
            }}
            className={`shrink-0 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              idDirty
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'dark:text-text-dark-muted light:text-text-light-muted opacity-40 cursor-not-allowed'
            }`}
            title={idDirty ? '校验并重命名' : '未修改'}
          >
            重命名
          </button>
        </div>
        {/* 错误提示 */}
        {idErrors.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {idErrors.map((err, i) => (
              <li key={i} className="text-[10px] text-red-400 flex items-center gap-1">
                <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                {err}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}