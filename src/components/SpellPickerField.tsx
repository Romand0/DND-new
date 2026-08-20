import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import SpellPicker from './SpellPicker';
import type { Spell } from '@/types/spell';
import { spellStore } from '@/data/spellStore';

interface SpellPickerFieldProps {
  value: string | null;
  onChange: (spellId: string) => void;
  isDark: boolean;
  placeholder?: string;
}

export default function SpellPickerField({ value, onChange, isDark, placeholder = '选择法术' }: SpellPickerFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [spellCache, setSpellCache] = useState<Record<string, Spell>>({});
  
  // 缓存法术数据以避免重复获取
  useEffect(() => {
    if (value && !spellCache[value]) {
      const spell = spellStore.getById(value);
      if (spell) {
        setSpellCache(prev => ({ ...prev, [value]: spell }));
      }
    }
  }, [value, spellCache]);
  
  // 根据 spellId 获取法术信息用于显示
  const getSpellInfo = (spellId: string | null): { name: string; level: string; school: string } | null => {
    if (!spellId) return null;
    
    const spell = spellCache[spellId] || spellStore.getById(spellId);
    if (!spell) return null;
    
    const levelLabels: Record<number, string> = {
      0: '戏法',
      1: '1环',
      2: '2环',
      3: '3环',
      4: '4环',
      5: '5环',
      6: '6环',
      7: '7环',
      8: '8环',
      9: '9环',
    };
    
    return {
      name: spell.name,
      level: levelLabels[spell.level] || `${spell.level}环`,
      school: spell.school,
    };
  };

  const spellInfo = getSpellInfo(value);
  const base = 'w-full px-3 py-2 rounded-lg border text-sm focus:border-primary outline-none transition-colors '
    + (isDark 
      ? 'border-border-dark bg-transparent text-text-dark hover:border-border-dark-hover' 
      : 'border-border-light bg-transparent text-text-light hover:border-border-light-hover');

  return (
    <>
      <div 
        className={`${base} cursor-pointer flex items-center justify-between`}
        onClick={() => setIsPickerOpen(true)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {spellInfo ? (
            <>
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate dark:text-text-dark light:text-text-light">
                  {spellInfo.name}
                </div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {spellInfo.level} · {spellInfo.school}
                </div>
              </div>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-gray-400 dark:text-text-dark-muted light:text-text-light-muted">
                {placeholder}
              </span>
            </>
          )}
        </div>
        <div className="text-gray-400 dark:text-text-dark-muted light:text-text-light-muted">
          点击选择
        </div>
      </div>

      <SpellPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(spell: Spell) => {
          onChange(spell.id);
        }}
        selectedSpellIds={value ? [value] : []}
      />
    </>
  );
}