import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import optionStore from '@/data/optionStore';
import type { CharacterOption, OptionCategory } from '@/types/characterOption';

interface Props {
  category: OptionCategory;
  parentName?: string;
  placeholder?: string;
  onSelect: (option: CharacterOption) => void;
}

// 从角色选项库选择一个条目；选中后自动复位以便重复打开
export default function OptionPicker({ category, parentName, placeholder, onSelect }: Props) {
  const options = useMemo(() => {
    const all = optionStore.getAll().filter((o) => o.category === category);
    if (parentName) {
      const scoped = all.filter((o) => o.parentName === parentName);
      return scoped.length ? scoped : all;
    }
    return all;
  }, [category, parentName]);

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, 'zh')),
    [options]
  );

  return (
    <div className="relative inline-flex items-center">
      <select
        value=""
        onChange={(e) => {
          const opt = sorted.find((o) => o.id === e.target.value);
          if (opt) onSelect(opt);
        }}
        className="appearance-none pl-2 pr-7 py-0.5 text-xs rounded-lg border border-dashed dark:border-border-dark light:border-border-light dark:text-text-dark-muted light:text-text-light-muted dark:hover:text-primary light:hover:text-primary dark:hover:border-primary light:hover:border-primary bg-transparent outline-none cursor-pointer transition-colors"
      >
        <option value="">{placeholder || '从选项库选择…'}</option>
        {sorted.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.nameEn ? ` (${o.nameEn})` : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none dark:text-text-dark-muted light:text-text-light-muted" />
    </div>
  );
}
