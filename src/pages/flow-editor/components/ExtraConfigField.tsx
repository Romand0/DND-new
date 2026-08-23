import { Trash2 } from 'lucide-react';
import { useTextInput } from '@/hooks/useInput';

interface ExtraConfigFieldProps {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  onRemove: () => void;
}

export default function ExtraConfigField({ label, value, onValueChange, onRemove }: ExtraConfigFieldProps) {
  const input = useTextInput(value);
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mb-0.5">{label}</div>
        <input
          type="text"
          value={input.text}
          onChange={(e) => {
            input.onChange(e.target.value);
            onValueChange(e.target.value);
          }}
          onBlur={(e) => {
            input.onBlur();
            const trimmed = e.target.value.trim();
            if (trimmed !== e.target.value) {
              onValueChange(trimmed);
            }
          }}
          className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
        />
      </div>
      <button onClick={onRemove} className="p-1 rounded hover:bg-white/10 text-red-400 mt-4">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}