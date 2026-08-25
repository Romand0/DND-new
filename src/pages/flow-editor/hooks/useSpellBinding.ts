import { useState, useCallback, useEffect } from 'react';
import type { Spell } from '@/types/spell';
import { spellStore } from '@/data/spellStore';
import { bindingStore } from '@/data/bindingStore';
import { BindingService } from '@/services/bindingService';
import { resolveAutoChecksFromSpell } from '@/types/flow';

/**
 * 法术绑定 Hook - 管理流程与法术的绑定关系
 * @param flow - 当前流程定义
 * @param setFlow - 更新流程的函数
 * @param showToast - 显示提示消息的函数
 */
export function useSpellBinding(
  flow: { id?: string; spellId?: string; nodes?: Array<{ type: string; config?: any }> },
  setFlow: (updater: (prev: any) => any) => void,
  showToast: (type: 'success' | 'error', message: string) => void
) {
  // 法术绑定状态
  const [boundSpell, setBoundSpell] = useState<Spell | null>(null);
  const [showSpellPicker, setShowSpellPicker] = useState(false);

  // 绑定法术到流程
  const handleBindSpell = useCallback(async (spellId: string) => {
    if (!flow.id) return;

    try {
      await BindingService.bindSpellToFlow(spellId, flow.id);
      const spell = spellStore.getById(spellId);
      if (spell) {
        // 自动回填 autoChecks 配置
        const { autoChecks, dsl, summary } = resolveAutoChecksFromSpell(spell);
        
        // 更新 flow 的 autoChecks 配置
        setFlow(prev => {
          const updatedFlow = { ...prev, spellId };
          
          // 查找 cast_start 节点并更新其 config
          const castStartNode = updatedFlow.nodes?.find(n => n.type === 'cast_start');
          if (castStartNode && castStartNode.config) {
            castStartNode.config = {
              ...castStartNode.config,
              autoChecks: {
                ...castStartNode.config.autoChecks,
                ...autoChecks,
                componentsDetail: summary.components,
                rangeDetail: summary.range,
                timeDetail: summary.time,
              },
            };
          }
          
          return updatedFlow;
        });
        
        setBoundSpell(spell);
        setShowSpellPicker(false);
        
        // 显示提示
        showToast('success', `已绑定法术并自动配置：${spell.name}`);
      }
    } catch (error) {
      console.error('法术绑定失败:', error);
      showToast('error', '法术绑定失败');
    }
  }, [flow.id, setFlow, showToast]);

  // 解绑法术
  const handleUnbindSpell = useCallback(async () => {
    if (!flow.id || !flow.spellId) return;

    try {
      // 获取绑定ID
      const bindings = bindingStore.getBySpellId(flow.spellId);
      if (bindings.length > 0) {
        await BindingService.unbindSpellFromFlow(bindings[0].id);
        setBoundSpell(null);
        setFlow(prev => ({ ...prev, spellId: undefined }));
      }
    } catch (error) {
      console.error('法术解绑失败:', error);
      showToast('error', '法术解绑失败');
    }
  }, [flow.id, flow.spellId, setFlow, showToast]);

  // 当流程ID变化时，同步绑定状态
  useEffect(() => {
    if (flow.spellId) {
      const spell = spellStore.getById(flow.spellId);
      setBoundSpell(spell || null);
    } else {
      setBoundSpell(null);
    }
  }, [flow.spellId]);

  return {
    // 状态
    boundSpell,
    showSpellPicker,
    
    // 操作方法
    handleBindSpell,
    handleUnbindSpell,
    setShowSpellPicker,
    
    // 计算属性
    isSpellBound: !!boundSpell,
    boundSpellName: boundSpell?.name || '',
    boundSpellLevel: boundSpell?.level || 0,
    boundSpellSchool: boundSpell?.school || '',
  };
    }
