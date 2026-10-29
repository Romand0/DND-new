import { useCallback, useMemo, useState } from 'react';
import type { Spell } from '@/types/spell';
import { spellStore } from '@/data/spellStore';
import { bindingStore } from '@/data/bindingStore';
import { BindingService } from '@/services/bindingService';
import { fetchBindingsByFlow } from '@/lib/api';
import { resolveAutoChecksFromSpell } from '@/types/flow';

type FlowLike = { id?: string; spellId?: string; nodes?: Array<{ type: string; config?: any }> };

/**
 * 法术绑定 Hook。
 *
 * 编辑态纯内存：handleSetSpell 只改 flow.spellId 与 cast_start 的 autoChecks，
 * 不写本地、不调云端。真正的绑定关系在「保存/发布」成功后由 syncBinding 统一落地，
 * 因为云端绑定需要流程记录已存在（新建流程发布前没有云端行）。
 */
export function useSpellBinding(
  flow: FlowLike,
  setFlow: (updater: (prev: any) => any) => void,
  showToast: (type: 'success' | 'error', message: string) => void
) {
  const [syncing, setSyncing] = useState(false);

  const boundSpell = useMemo<Spell | null>(
    () => (flow.spellId ? spellStore.getById(flow.spellId) ?? null : null),
    [flow.spellId]
  );

  // 只改内存：绑定选择、解绑都走这一个入口
  const handleSetSpell = useCallback((spellId: string | undefined) => {
    if (!spellId) {
      setFlow(prev => ({ ...prev, spellId: undefined }));
      return;
    }

    const spell = spellStore.getById(spellId);
    if (!spell) {
      showToast('error', '法术不存在');
      return;
    }

    const { autoChecks, summary } = resolveAutoChecksFromSpell(spell);

    setFlow(prev => {
      const nodes = (prev.nodes ?? []).map((n: any) => {
        if (n.type !== 'cast_start' || !n.config) return n;
        return {
          ...n,
          config: {
            ...n.config,
            autoChecks: {
              ...n.config.autoChecks,
              ...autoChecks,
              componentsDetail: summary.components,
              rangeDetail: summary.range,
              timeDetail: summary.time,
            },
          },
        };
      });
      return { ...prev, spellId, nodes };
    });

    showToast('success', `已绑定法术并自动配置：${spell.name}`);
  }, [setFlow, showToast]);

  /**
   * 把内存中的 spellId 同步为云端绑定（发布成功后调用）。
   * 云端只允许「流程存在」后绑定，因此必须等 publish 落库再调用。
   * spellId 为空表示解绑：清掉该流程的所有绑定。
   */
  const syncBinding = useCallback(async (flowId: string, spellId: string | undefined) => {
    if (!flowId) return;
    setSyncing(true);
    try {
      const existing = await fetchBindingsByFlow<any[]>(flowId);
      const list = Array.isArray(existing) ? existing : [];

      if (!spellId) {
        for (const b of list) await BindingService.unbindSpellFromFlow(b.id);
        return;
      }

      if (list.some(b => b.spell_id === spellId)) {
        // 已经有了目标绑定，清掉其余多余绑定即可
        for (const b of list) {
          if (b.spell_id !== spellId) await BindingService.unbindSpellFromFlow(b.id);
        }
        return;
      }

      // 一个流程只保留一条绑定：先清掉指向其他法术的旧绑定
      for (const b of list) {
        await BindingService.unbindSpellFromFlow(b.id);
      }
      await BindingService.bindSpellToFlow(spellId, flowId);
    } catch (error) {
      console.error('同步法术绑定失败:', error);
      showToast('error', '法术绑定同步失败');
    } finally {
      setSyncing(false);
    }
  }, [showToast]);

  return {
    BindingService,
    bindingStore,

    boundSpell,
    syncing,

    handleSetSpell,
    syncBinding,

    isSpellBound: !!boundSpell,
    boundSpellName: boundSpell?.name || '',
    boundSpellLevel: boundSpell?.level || 0,
    boundSpellSchool: boundSpell?.school || '',
  };
}
