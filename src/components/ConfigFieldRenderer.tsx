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
