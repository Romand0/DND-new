import type { ConfigFieldSchema } from '@/types/flow';

interface Props {
  schema: ConfigFieldSchema;
  value: any;
  onChange: (value: any) => void;
  isDark: boolean;
}

export default function ConfigFieldRenderer({ schema, value, onChange, isDark }: Props) {
  const base =
    'w-full px-2 py-1.5 rounded border text-xs focus:border-primary outline-none '
    + (isDark ? 'border-border-dark bg-transparent text-text-dark' : 'border-border-light bg-transparent text-text-light');

  switch (schema.type) {
    case 'select':
      return (
        <select
          value={value ?? schema.defaultValue ?? ''}
          onChange={e => onChange(e.target.value)}
          className={base + ' truncate'}
        >
          <option value="" disabled>{schema.placeholder ?? '请选择…'}</option>
          {schema.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          type="number"
          value={value ?? schema.defaultValue ?? ''}
          onChange={e => onChange(Number(e.target.value))}
          className={base}
          placeholder={schema.placeholder}
        />
      );

    case 'dice':
      return (
        <input
          type="text"
          value={value ?? schema.defaultValue ?? ''}
          onChange={e => onChange(e.target.value)}
          className={base + ' font-mono tracking-wider'}
          placeholder={schema.placeholder ?? '如 8d6、2d4+2'}
        />
      );

    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value ?? schema.defaultValue ?? false}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 accent-indigo-500"
        />
      );

    case 'object':
      // 嵌套配置对象
      if (!schema.children) return null;
      return (
        <div className="space-y-2 pl-3 border-l-2 border-gray-300 dark:border-gray-600">
          {schema.children.map(child => (
            <div key={child.key}>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
                  {child.label}
                </span>
                {child.required && <span className="text-[10px] text-red-400">*</span>}
              </div>
              <ConfigFieldRenderer
                schema={child}
                value={value?.[child.key]}
                onChange={v => {
                  const newValue = { ...value, [child.key]: v };
                  onChange(newValue);
                }}
                isDark={isDark}
              />
            </div>
          ))}
        </div>
      );

    case 'template':
      return (
        <input
          type="text"
          value={value ?? schema.defaultValue ?? ''}
          onChange={e => onChange(e.target.value)}
          className={base + ' font-mono'}
          placeholder={schema.placeholder}
        />
      );

    case 'text':
    default:
      return (
        <input
          type="text"
          value={value ?? schema.defaultValue ?? ''}
          onChange={e => onChange(e.target.value)}
          className={base}
          placeholder={schema.placeholder}
        />
      );
  }
}
