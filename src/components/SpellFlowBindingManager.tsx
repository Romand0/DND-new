import React, { useState, useEffect } from 'react';
import { FlowDefinition } from '@/types';
import { BindingService } from '@/services/bindingService';
import { flowStore } from '@/data';

interface SpellFlowBindingManagerProps {
  spellId: string;
  spellName: string;
  onBindingChange?: () => void;
}

export const SpellFlowBindingManager: React.FC<SpellFlowBindingManagerProps> = ({
  spellId,
  spellName,
  onBindingChange
}) => {
  const [boundFlows, setBoundFlows] = useState<FlowDefinition[]>([]);
  const [availableFlows, setAvailableFlows] = useState<FlowDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 获取已绑定的流程
        const bound = await BindingService.getSpellBoundFlows(spellId);
        setBoundFlows(bound);

        // 获取所有可用的流程（排除已绑定的）
        const allFlows = flowStore.getAll();
        const unbound = allFlows.filter(flow => !bound.some(b => b.id === flow.id));
        setAvailableFlows(unbound);
      } catch (error) {
        console.error('加载绑定信息失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [spellId]);

  const handleBind = async (flowId: string) => {
    try {
      await BindingService.bindSpellToFlow(spellId, flowId);
      // 重新加载数据
      const bound = await BindingService.getSpellBoundFlows(spellId);
      setBoundFlows(bound);
      
      // 更新可用流程列表
      const allFlows = flowStore.getAll();
      const unbound = allFlows.filter(flow => !bound.some(b => b.id === flow.id));
      setAvailableFlows(unbound);

      onBindingChange?.();
    } catch (error) {
      console.error('绑定失败:', error);
      alert('绑定失败: ' + (error as Error).message);
    }
  };

  const handleUnbind = async (flowId: string) => {
    try {
      const binding = boundFlows.find(f => f.id === flowId);
      if (binding) {
        // 这里需要先获取binding ID，简化示例中直接使用flow ID
        const allBindings = await BindingService.getSpellBoundFlows(spellId);
        const bindingToRemove = allBindings.find(b => b.id === flowId);
        if (bindingToRemove) {
          await BindingService.unbindSpellFromFlow(bindingToRemove.id);
          // 重新加载数据
          const bound = await BindingService.getSpellBoundFlows(spellId);
          setBoundFlows(bound);
          
          // 更新可用流程列表
          const allFlows = flowStore.getAll();
          const unbound = allFlows.filter(flow => !bound.some(b => b.id === flow.id));
          setAvailableFlows(unbound);

          onBindingChange?.();
        }
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
      <h4>法术流程绑定 - {spellName}</h4>
      
      {/* 已绑定的流程 */}
      {boundFlows.length > 0 && (
        <div className="bound-flows">
          <h5>已绑定流程 ({boundFlows.length})</h5>
          <ul className="space-y-2">
            {boundFlows.map(flow => (
              <li key={flow.id} className="flex justify-between items-center p-2 bg-gray-100 rounded">
                <div>
                  <span className="font-medium">{flow.name}</span>
                  <span className="text-sm text-gray-500 ml-2">({flow.category})</span>
                </div>
                <button
                  onClick={() => handleUnbind(flow.id)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                >
                  解绑
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 可选的流程 */}
      {availableFlows.length > 0 && (
        <div className="available-flows">
          <h5>可选流程 ({availableFlows.length})</h5>
          <ul className="space-y-2">
            {availableFlows.map(flow => (
              <li key={flow.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{flow.name}</span>
                  <span className="text-sm text-gray-500 ml-2">({flow.category})</span>
                </div>
                <button
                  onClick={() => handleBind(flow.id)}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                >
                  绑定
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {boundFlows.length === 0 && availableFlows.length === 0 && (
        <div className="text-gray-500 text-center py-4">
          暂无可用的流程
        </div>
      )}
    </div>
  );
};