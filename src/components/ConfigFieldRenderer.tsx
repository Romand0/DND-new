import type { ConfigFieldSchema } from '@/types/flow';
import SpellPickerField from './SpellPickerField';

interface Props {
  schema: ConfigFieldSchema;
  value: any;
  onChange: (value: any) => void;
  isDark: boolean;
  /** 父级 object 的完整值，用于查找摘要字段 */
  parentValue?: any;
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
      // 查找自然语言摘要
      let summary = '';
      if (schema.spellSummaryKey && parentValue) {
        summary = parentValue[schema.spellSummaryKey] || '';
      }

      return (
        <div className="space-y-2">
          <div className="flex items-start space-x-2">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => onChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <div className="flex-1">
              <label className="text-sm font-medium cursor-pointer">
                {schema.label}
              </label>
              {summary && (
                <span className="ml-2 text-xs text-gray-500">
                  ({summary})
                </span>
              )}
            </div>
          </div>
          {schema.description && (
            <p className="text-xs text-gray-500">{schema.description}</p>
          )}
        </div>
      );

    case 'object':
      if (!value) value = {};
      return (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">{schema.label}</h4>
          {schema.children?.map((child) => (
            <ConfigFieldRenderer
              key={child.key}
              schema={child}
              value={value[child.key]}
              onChange={(newValue) => onChange({ ...value, [child.key]: newValue })}
              isDark={isDark}
              parentValue={value}
            />
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

    case 'spellPicker':
      return (
        <SpellPickerField
          value={value}
          onChange={onChange}
          isDark={isDark}
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
