import React from 'react';
import ConfigFieldRenderer from '@/components/ConfigFieldRenderer';
import { NODE_CONFIG_SCHEMA } from '@/types/flow';
import type { FlowNodeDef, ConfigFieldSchema } from '@/types/flow';

interface NodeConfigFormProps {
  node: FlowNodeDef;
  updateNodeConfig: (nodeId: string, key: string, value: any) => void;
  isDark: boolean;
}

export default function NodeConfigForm({
  node,
  updateNodeConfig,
  isDark,
}: NodeConfigFormProps) {
  // 获取节点类型的配置 Schema
  const fields = NODE_CONFIG_SCHEMA[node.type] ?? [];

  return (
    <div className="mb-3">
      <label className="text-xs font-medium dark:text-text-dark light:text-text-light block mb-1.5">
        配置项
      </label>
      <div className="space-y-3">
        {fields.map(field => (
          <div key={field.key}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
                {field.label}
              </span>
              {field.required && (
                <span className="text-[10px] text-red-400">*</span>
              )}
            </div>
            <ConfigFieldRenderer
              schema={field}
              value={node.config?.[field.key]}
              onChange={(v) => updateNodeConfig(node.id, field.key, v)}
              isDark={isDark}
              parentValue={node.config}
            />
            {/* DSL 值提示 */}
            <div className="text-[10px] font-mono mt-0.5 dark:text-text-dark-muted light:text-text-light-muted">
              {field.key} = {String(node.config?.[field.key] ?? field.defaultValue ?? '')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}