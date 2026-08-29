import React from 'react';
import ExtraConfigField from './ExtraConfigField';
import { NODE_CONFIG_SCHEMA } from '@/types/flow';
import type { FlowNodeDef } from '@/types/flow';

interface NodeCustomFieldsProps {
  node: FlowNodeDef;
  updateNodeConfig: (nodeId: string, key: string, value: any) => void;
  isDark: boolean;
}

export default function NodeCustomFields({
  node,
  updateNodeConfig,
  isDark,
}: NodeCustomFieldsProps) {
  // 获取 Schema 定义的字段键
  const schemaFields = NODE_CONFIG_SCHEMA[node.type] ?? [];
  const schemaKeys = new Set(schemaFields.map(f => f.key));
  
  // 获取自定义字段（不在 Schema 中的字段）
  const customFields = Object.entries(node.config || {})
    .filter(([key]) => !schemaKeys.has(key));

  if (customFields.length === 0) {
    return null;
  }

  // 添加自定义字段
  const addCustomField = () => {
    const key = prompt('请输入配置项名称:');
    if (key) {
      updateNodeConfig(node.id, key, '');
    }
  };

  // 删除自定义字段
  const removeCustomField = (key: string) => {
    // 创建新的配置对象，排除要删除的字段
    const newConfig = { ...node.config };
    delete newConfig[key];
    
    // 更新节点配置
    updateNodeConfig(node.id, '__temp__', newConfig);
    
    // 移除临时字段
    setTimeout(() => {
      updateNodeConfig(node.id, '__temp__', undefined);
    }, 0);
  };

  return (
    <div className="mt-3 pt-3 border-t dark:border-border-dark light:border-border-light">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
          自定义字段
        </span>
        <button
          onClick={addCustomField}
          className="text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          + 添加
        </button>
      </div>
      <div className="space-y-2">
        {customFields.map(([key, value]) => (
          <ExtraConfigField
            key={key}
            label={key}
            value={String(value)}
            onValueChange={(v) => updateNodeConfig(node.id, key, v)}
            onRemove={() => removeCustomField(key)}
          />
        ))}
      </div>
    </div>
  );
}