import React from 'react';
import { FlowCategory } from '@/types/flow';
import { FLOW_CATEGORIES, parseFlowId, buildFlowId } from '@/types/flow';
import flowStore from '@/data/flowStore';

interface FlowPropertiesCategoriesProps {
  currentFlowId: string;
  onCategoryChange: (newId: string) => void;
  disabled?: boolean;
}

/**
 * 流程类别切换：只改内存中的 ID 前缀，不写任何存储。
 * 冲突检查基于本地镜像（云端正式版列表）。
 */
export default function FlowPropertiesCategories({
  currentFlowId,
  onCategoryChange,
  disabled = false,
}: FlowPropertiesCategoriesProps) {
  const handleCategoryChange = (category: FlowCategory) => {
    if (disabled) return;

    const { slug } = parseFlowId(currentFlowId);
    const newId = buildFlowId(category, slug);

    if (newId === currentFlowId) return;

    const taken = flowStore.getAll().some(f => f.id === newId);
    if (taken) {
      alert('ID 冲突，该类别+标识符已被占用');
      return;
    }

    onCategoryChange(newId);
  };

  const { category: currentCategory } = parseFlowId(currentFlowId);

  return (
    <div className="mb-4">
      <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">
        流程类别
      </label>
      <div className="flex gap-1.5 flex-wrap">
        {FLOW_CATEGORIES.map(cat => {
          const isActive = currentCategory === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => handleCategoryChange(cat.value)}
              disabled={disabled}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                ${isActive
                  ? 'bg-primary text-white'
                  : 'border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:border-primary/40'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              title={cat.desc}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
