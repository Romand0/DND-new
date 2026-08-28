import React from 'react';
import { Zap, X } from 'lucide-react';
import { useSpellBinding } from '@/pages/flow-editor/hooks/useSpellBinding';
import SpellPickerField from '@/components/SpellPickerField';
import type { Spell } from '@/types/spell';
import { spellStore } from '@/data/spellStore';

interface FlowPropertiesSpellBindingProps {
  flowId: string;
  spellId: string | undefined;
  isDark: boolean;
  onSpellChange: (spellId: string | undefined) => void;
  showToast: (type: 'success' | 'error', message: string) => void;
}

export default function FlowPropertiesSpellBinding({
  flowId,
  spellId,
  isDark,
  onSpellChange,
  showToast,
}: FlowPropertiesSpellBindingProps) {
  // 使用 useSpellBinding Hook
  const spellBinding = useSpellBinding(
    { id: flowId, spellId },
    (updater) => {
      const updatedFlow = updater({ id: flowId, spellId });
      onSpellChange(updatedFlow.spellId);
    },
    showToast
  );

  const handleSpellChange = (newSpellId: string) => {
    if (newSpellId) {
      spellBinding.handleBindSpell(newSpellId);
    } else {
      spellBinding.handleUnbindSpell();
    }
  };

  return (
    <div className="mb-4">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">
        绑定法术
      </label>
      <SpellPickerField
        value={spellId || ''}
        onChange={handleSpellChange}
        placeholder="选择要施放的法术"
        isDark={isDark}
      />
      {spellBinding.boundSpell && (
        <div className="mt-2 text-xs text-gray-500">
          已选择：{spellBinding.boundSpellName} (Lv.{spellBinding.boundSpellLevel} {spellBinding.boundSpellSchool})
        </div>
      )}
      
      {/* 法术选择弹窗 */}
      {spellBinding.showSpellPicker && (
        <SpellPickerModal
          isOpen={spellBinding.showSpellPicker}
          onClose={() => spellBinding.setShowSpellPicker(false)}
          onSpellSelect={spellBinding.handleBindSpell}
          selectedSpellId={spellId}
        />
      )}
    </div>
  );
}

// 法术选择弹窗组件
interface SpellPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpellSelect: (spellId: string) => void;
  selectedSpellId: string | undefined;
}

function SpellPickerModal({
  isOpen,
  onClose,
  onSpellSelect,
  selectedSpellId,
}: SpellPickerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-xl p-6 max-w-2xl w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium dark:text-text-dark light:text-text-light">选择法术</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {spellStore.getAll().map(spell => (
            <div
              key={spell.id}
              className={`p-3 rounded-lg border dark:border-border-dark light:border-border-light cursor-pointer transition-colors ${
                selectedSpellId === spell.id
                  ? 'bg-primary/5 border-primary'
                  : 'hover:bg-primary/5'
              }`}
              onClick={() => onSpellSelect(spell.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium dark:text-text-dark light:text-text-light truncate">
                    {spell.name}
                  </div>
                  <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                    Lv.{spell.level} {spell.school}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}