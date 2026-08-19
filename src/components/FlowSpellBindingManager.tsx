import React, { useState, useEffect } from 'react';
import { Spell } from '@/types';
import { BindingService } from '@/services/bindingService';
import { spellStore } from '@/data';

interface FlowSpellBindingManagerProps {
  flowId: string;
  flowName: string;
  onBindingChange?: () => void;
}

export const FlowSpellBindingManager: React.FC<FlowSpellBindingManagerProps> = ({
  flowId,
  flowName,
  onBindingChange
}) => {
  const [boundSpells, setBoundSpells] = useState<Spell[]>([]);
  const [availableSpells, setAvailableSpells] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 获取已绑定的法术
        const bound = await BindingService.getFlowBoundSpells(flowId);
        setBoundSpells(bound);

        // 获取所有可用的法术（排除已绑定的）
        const allSpells = spellStore.getAll();
        const unbound = allSpells.filter(spell => !bound.some(b => b.id === spell.id));
        setAvailableSpells(unbound);
      } catch (error) {
        console.error('加载绑定信息失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [flowId]);

  const handleBind = async (spellId: string) => {
    try {
      await BindingService.bindSpellToFlow(spellId, flowId);
      // 重新加载数据
      const bound = await BindingService.getFlowBoundSpells(flowId);
      setBoundSpells(bound);
      
      // 更新可用法术列表
      const allSpells = spellStore.getAll();
      const unbound = allSpells.filter(spell => !bound.some(b => b.id === spell.id));
      setAvailableSpells(unbound);

      onBindingChange?.();
    } catch (error) {
      console.error('绑定失败:', error);
      alert('绑定失败: ' + (error as Error).message);
    }
  };

  const handleUnbind = async (spellId: string) => {
    try {
      const allBindings = await BindingService.getFlowBoundSpells(flowId);
      const bindingToRemove = allBindings.find(b => b.id === spellId);
      if (bindingToRemove) {
        await BindingService.unbindSpellFromFlow(bindingToRemove.id);
        // 重新加载数据
        const bound = await BindingService.getFlowBoundSpells(flowId);
        setBoundSpells(bound);
        
        // 更新可用法术列表
        const allSpells = spellStore.getAll();
        const unbound = allSpells.filter(spell => !bound.some(b => b.id === spell.id));
        setAvailableSpells(unbound);

        onBindingChange?.();
      }
    } catch (error) {
      console.error('解绑失败:', error);
      alert('解绑失败: ' + (error as Error).message);
    }
  };

  if (loading) {
    return <div>加载中...</div>;
  }

  return (
    <div className="binding-manager">
      <h4>流程法术绑定 - {flowName}</h4>
      
      {/* 已绑定的法术 */}
      {boundSpells.length > 0 && (
        <div className="bound-spells">
          <h5>已绑定法术 ({boundSpells.length})</h5>
          <ul className="space-y-2">
            {boundSpells.map(spell => (
              <li key={spell.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                <div>
                  <span className="font-medium">{spell.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {spell.level}环 {spell.school}
                  </span>
                </div>
                <button
                  onClick={() => handleUnbind(spell.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                >
                  解绑
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 可选的法术 */}
      {availableSpells.length > 0 && (
        <div className="available-spells">
          <h5>可选法术 ({availableSpells.length})</h5>
          <ul className="space-y-2">
            {availableSpells.map(spell => (
              <li key={spell.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{spell.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {spell.level}环 {spell.school}
                  </span>
                </div>
                <button
                  onClick={() => handleBind(spell.id)}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  绑定
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {boundSpells.length === 0 && availableSpells.length === 0 && (
        <div className="text-gray-500 text-center py-4">
          暂无可用的法术
        </div>
      )}
    </div>
  );
};