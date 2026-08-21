import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, X, BookOpen, Target, AlertCircle } from 'lucide-react';
import type { Spell } from '@/types/spell';
import { BindingService } from '@/services/bindingService';
import { FlowSpellPicker } from './FlowSpellPicker';

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
  const [showSpellPicker, setShowSpellPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);

  // 设置BindingService的当前流程ID
  useEffect(() => {
    BindingService.setCurrentFlowId(flowId);
  }, [flowId]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 获取已绑定的法术
        const bound = await BindingService.getFlowBoundSpells(flowId);
        setBoundSpells(bound);
      } catch (error) {
        console.error('加载绑定信息失败:', error);
        setError('加载绑定信息失败');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [flowId]);

  const handleBind = async (spell: Spell) => {
    try {
      setError(null);
      await BindingService.bindSpellToFlow(spell.id, flowId);
      
      // 重新加载数据
      const bound = await BindingService.getFlowBoundSpells(flowId);
      setBoundSpells(bound);
      onBindingChange?.();
      
      // 关闭选择器
      setShowSpellPicker(false);
    } catch (error) {
      console.error('绑定失败:', error);
      setError('绑定失败: ' + (error as Error).message);
    }
  };

  const handleUnbind = async (spellId: string) => {
    try {
      setError(null);
      
      const allBindings = await BindingService.getFlowBoundSpells(flowId);
      const bindingToRemove = allBindings.find(b => b.id === spellId);
      
      if (bindingToRemove) {
        await BindingService.unbindSpellFromFlow(bindingToRemove.id);
        
        // 重新加载数据
        const bound = await BindingService.getFlowBoundSpells(flowId);
        setBoundSpells(bound);
        onBindingChange?.();
      }
    } catch (error) {
      console.error('解绑失败:', error);
      setError('解绑失败: ' + (error as Error).message);
    }
  };

  // 处理选择器加载状态变化
  const handlePickerLoading = (loading: boolean) => {
    setPickerLoading(loading);
  };

  // 处理选择器错误
  const handlePickerError = (errorMessage: string) => {
    setError(errorMessage);
  };

  // 加载状态
  if (loading) {
    return (
      <div className="binding-manager">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">加载中...</span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="binding-manager">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                加载失败
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="binding-manager space-y-4">
      {/* 绑定统计 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-blue-500" />
            <div>
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                法术绑定统计
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                已绑定 {boundSpells.length} 个法术
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSpellPicker(true)}
            disabled={pickerLoading}
            className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors ${
              pickerLoading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {pickerLoading ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                <span>加载中</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                绑定法术
              </>
            )}
          </button>
        </div>
      </div>

      {/* 法术选择器弹窗 */}
      {showSpellPicker && (
        <FlowSpellPicker
          isOpen={true}
          onClose={() => setShowSpellPicker(false)}
          onSelect={handleBind}
          selectedSpellIds={boundSpells.map(s => s.id)}
          flowId={flowId}
          onLoadingChange={handlePickerLoading}
          onError={handlePickerError}
        />
      )}

      {/* 已绑定的法术列表 */}
      {boundSpells.length > 0 ? (
        <div className="space-y-3">
          <h5 className="text-sm font-medium dark:text-text-dark light:text-text-light flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            已绑定法术
          </h5>
          <div className="space-y-2">
            {boundSpells.map(spell => (
              <div 
                key={spell.id} 
                className="group flex justify-between items-center p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                      {spell.name}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      spell.level === 0
                        ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                    }`}>
                      {spell.level === 0 ? '戏法' : `${spell.level}环`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{spell.school}</span>
                    <span>{spell.castingTime}</span>
                    <span>{spell.range}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleUnbind(spell.id)}
                  className="ml-3 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  解绑
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="text-gray-400 dark:text-gray-500 mb-2">
            <BookOpen className="w-12 h-12 mx-auto" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
            暂未绑定法术
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            点击"绑定法术"按钮开始绑定
          </p>
        </div>
      )}
    </div>
  );
};
