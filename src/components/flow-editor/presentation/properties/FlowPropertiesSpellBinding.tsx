import React from 'react';
import { Zap } from 'lucide-react';
import { useSpellBinding } from '@/components/flow-editor/hooks/use-spell-binding';
import SpellPickerField from '@/components/SpellPickerField';
import SpellPicker from '@/components/SpellPicker';
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

  // 添加本地状态管理法术选择器
  const [isSpellPickerOpen, setIsSpellPickerOpen] = useState(false);

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

    </div>
  );
}