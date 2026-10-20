import React, { useState, useEffect, useCallback } from 'react';
import type { Spell } from '@/types/spell';
import { BindingService } from '@/services/bindingService';
import { bindingStore } from '@/data/bindingStore';
import { fetchAllSpells, fetchBindingsByFlow } from '@/lib/api';

interface FlowSpellBindingManagerProps {
  flowId: string;
  flowName: string;
  status?: 'draft' | 'published';
  onBindingChange?: () => void;
}

export const FlowSpellBindingManager: React.FC<FlowSpellBindingManagerProps> = ({
  flowId,
  flowName,
  status = 'draft',
  onBindingChange
}) => {
  const [boundSpells, setBoundSpells] = useState<Spell[]>([]);
  const [boundBindings, setBoundBindings] = useState<any[]>([]);
  const [availableSpells, setAvailableSpells] = useState<Spell[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 以云端为真源：此前读本地缓存（bindingStore），与云端漂移时会显示幽灵绑定且解绑 404
      const [allSpells, bindings] = await Promise.all([
        fetchAllSpells<Spell[]>(),
        fetchBindingsByFlow<any[]>(flowId),
      ]);
      const boundIds = new Set(bindings.map(b => b.spell_id));
      setBoundBindings(bindings);
      setBoundSpells(bindings.map(b => b.spell).filter(Boolean));
      setAvailableSpells(allSpells.filter(spell => !boundIds.has(spell.id)));
    } catch (error) {
      console.error('加载绑定信息失败:', error);
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 🔑 同样的订阅
  useEffect(() => {
    return bindingStore.subscribe(() => { loadData(); });
  }, [loadData]);

  const handleBind = async (spellId: string) => {
    try {
      await BindingService.bindSpellToFlow(spellId, flowId);
      onBindingChange?.();
    } catch (error) {
      console.error('绑定失败:', error);
      alert('绑定失败: ' + (error as Error).message);
    }
  };

  const handleUnbind = async (spellId: string) => {
    try {
      // 解绑必须用云端绑定关系自身的 ID（云端真源），误用法术 ID 或本地幽灵行 ID 均会 404
      const binding = boundBindings.find(b => b.spell_id === spellId);
      if (!binding) {
        alert('未找到该绑定关系，请刷新后重试');
        return;
      }
      await BindingService.unbindSpellFromFlow(binding.id);
      onBindingChange?.();
      await loadData();
    } catch (error) {
      console.error('解绑失败:', error);
      alert('解绑失败: ' + (error as Error).message);
    }
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div className="binding-manager">
      <h4>流程法术绑定 - {flowName}</h4>
      
      {/* 状态提示 */}
      <div className={`mb-4 p-3 rounded-lg ${
        status === 'published' 
          ? 'bg-blue-50 border border-blue-200' 
          : 'bg-gray-50 border border-gray-200'
      }`}>
        <p className="text-sm">
          {status === 'published' 
            ? '已发布流程：建议绑定法术以便正常使用。绑定后可以随时更改。'
            : '草稿流程：法术绑定是可选的。绑定后可以在发布时自动使用。'
          }
        </p>
      </div>
      
      {/* 已绑定的法术 */}
      {boundSpells.length > 0 && (
        <div className="bound-spells">
          <h5>已绑定法术 ({boundSpells.length})</h5>
          <ul className="space-y-2">
            {boundSpells.map(spell => {
              return (
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
              );
            })}
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

      {/* 状态特定的提示 */}
      {boundSpells.length === 0 && (
        <div className={`p-4 rounded-lg text-center ${
          status === 'published' 
            ? 'bg-red-50 border border-red-200 text-red-700' 
            : 'bg-gray-50 border border-gray-200 text-gray-500'
        }`}>
          {status === 'published' 
            ? '⚠️ 已发布流程建议绑定至少一个法术以便使用'
            : '暂未绑定法术，可以随时添加'
          }
        </div>
      )}

      {boundSpells.length > 0 && availableSpells.length === 0 && (
        <div className="text-gray-500 text-center py-4">
          所有可用的法术都已绑定
        </div>
      )}
    </div>
  );
};