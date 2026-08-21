import React, { useState, useEffect, useCallback } from 'react';
import SpellPicker from './SpellPicker';
import type { Spell } from '@/types/spell';
import { BindingService } from '@/services/bindingService';

interface FlowSpellPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (spell: Spell) => void;
  selectedSpellIds: string[];
  flowId: string;
  onLoadingChange?: (loading: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * 流程法术选择器 - 封装了业务逻辑的SpellPicker组件
 * 专门用于流程绑定法术场景
 */
export const FlowSpellPicker: React.FC<FlowSpellPickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  selectedSpellIds,
  flowId,
  onLoadingChange,
  onError,
}) => {
  const [allSpells, setAllSpells] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取所有可用法术
  const fetchAvailableSpells = useCallback(async () => {
    if (!isOpen) return;
    
    try {
      setLoading(true);
      onLoadingChange?.(true);
      setError(null);
      
      // 从BindingService获取法术列表(包含绑定状态)
      const spells = await BindingService.getAllAvailableSpells();
      setAllSpells(spells);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取法术列表失败';
      setError(errorMessage);
      onError?.(errorMessage);
      console.error('获取法术列表失败:', err);
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [isOpen, flowId, onLoadingChange, onError]);

  // 当弹窗打开时加载数据
  useEffect(() => {
    if (isOpen) {
      fetchAvailableSpells();
    }
  }, [isOpen, fetchAvailableSpells]);

  // 处理法术选择
  const handleSelect = (spell: Spell) => {
    // 检查是否已经绑定到当前流程
    const isAlreadyBound = selectedSpellIds.includes(spell.id);
    if (isAlreadyBound) {
      onError?.('该法术已经绑定到此流程');
      return;
    }
    
    onSelect(spell);
  };

  // 获取已绑定法术的环级分布
  const getLevelDistribution = () => {
    const distribution = new Map<number, number>();
    selectedSpellIds.forEach(spellId => {
      const spell = allSpells.find(s => s.id === spellId);
      if (spell) {
        distribution.set(spell.level, (distribution.get(spell.level) || 0) + 1);
      }
    });
    return distribution;
  };

  // 获取可用职业列表
  const getAvailableClasses = () => {
    const classes = new Set<string>();
    allSpells.forEach((spell) => {
      spell.classes.forEach((cls) => classes.add(cls));
    });
    return Array.from(classes).sort();
  };

  // 默认筛选:显示未绑定的法术
  const defaultFilterLevel: number | 'all' = 'all';
  const availableClasses = getAvailableClasses();

  return (
    <>
      <SpellPicker
        isOpen={isOpen}
        onClose={onClose}
        onSelect={handleSelect}
        selectedSpellIds={selectedSpellIds}
        filterLevel={defaultFilterLevel}
        characterClass={undefined} // 可以根据需要设置默认职业
        matchByName={false}
      />
      
      {/* 自定义覆盖层 - 显示绑定状态和统计信息 */}
      {isOpen && (
        <div className="absolute top-4 right-4 z-10 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 max-w-xs">
          <h3 className="text-sm font-semibold mb-2">绑定统计</h3>
          
          {/* 已绑定法术数量 */}
          <div className="mb-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">已绑定</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {selectedSpellIds.length}
            </div>
          </div>
          
          {/* 环级分布 */}
          <div className="mb-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">环级分布</div>
            <div className="space-y-1">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
                const count = getLevelDistribution().get(level) || 0;
                return (
                  <div key={level} className="flex items-center justify-between text-xs">
                    <span>{level === 0 ? '戏法' : `${level}环`}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* 可用法术总数 */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            共 {allSpells.length} 个法术可选
          </div>
        </div>
      )}
    </>
  );
};
