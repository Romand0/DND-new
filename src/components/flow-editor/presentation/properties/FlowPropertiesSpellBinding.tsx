import React from 'react';
import SpellPickerField from '@/components/SpellPickerField';
import { spellStore } from '@/data/spellStore';

interface FlowPropertiesSpellBindingProps {
  /** 当前流程内存态绑定的法术 ID */
  spellId: string | undefined;
  isDark: boolean;
  /** 只改内存中的 spellId，落库由「保存/发布」统一完成 */
  onSpellChange: (spellId: string | undefined) => void;
}

/**
 * 绑定法术选择：纯展示 + 回调，编辑期间不写任何存储。
 *
 * 绑定关系（spell_flow_bindings）依赖云端已存在的流程记录，
 * 新建流程在发布前根本没有云端行，因此绑定在发布成功后由编辑器统一同步。
 */
export default function FlowPropertiesSpellBinding({
  spellId,
  isDark,
  onSpellChange,
}: FlowPropertiesSpellBindingProps) {
  const boundSpell = spellId ? spellStore.getById(spellId) : null;

  return (
    <div className="mb-4">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">
        绑定法术
      </label>
      <SpellPickerField
        value={spellId || null}
        onChange={(next) => onSpellChange(next || undefined)}
        placeholder="选择要施放的法术"
        isDark={isDark}
      />
      {boundSpell && (
        <div className="mt-2 text-xs text-gray-500">
          已选择：{boundSpell.name} (Lv.{boundSpell.level} {boundSpell.school})
        </div>
      )}
    </div>
  );
}
