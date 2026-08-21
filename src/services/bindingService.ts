import { bindingStore } from '@/data/bindingStore';
import { spellStore } from '@/data/spellStore';
import flowStore from '@/data/flowStore';
import type { Spell } from '@/types/spell';
import type { FlowDefinition, FlowNodeDef, FlowEdgeDef } from '@/types/flow';
import type { SpellFlowBinding } from '@/types/binding';
import type { SpellWithFlowBindings, FlowWithSpellBindings } from '@/types/binding';

export class BindingService {
  private static initialized = false;

  static init(): void {
    if (this.initialized) return;
    this.initialized = true;

    bindingStore.onBindingChange(({ type, spellId, flowId }) => {
      const delta = type === 'bind' ? 1 : -1;
      this.syncSpellBindingsCount(spellId, delta);
      this.syncFlowBindingsCount(flowId, delta);
    });
  }

  private static syncSpellBindingsCount(spellId: string, delta: number): void {
    const spell = spellStore.getById(spellId);
    if (!spell) return;
    const newCount = Math.max(0, (spell.bindingsCount ?? 0) + delta);
    spellStore.updateById(spellId, { bindingsCount: newCount });
  }

  private static syncFlowBindingsCount(flowId: string, delta: number): void {
    const flow = flowStore.getById(flowId);
    if (!flow) return;
    const newCount = Math.max(0, (flow.bindingsCount ?? 0) + delta);
    flowStore.update(flowId, { bindingsCount: newCount });
    if (delta > 0) {
      const bindings = bindingStore.getByFlowId(flowId);
      if (bindings.length === 1) {
        flowStore.update(flowId, { spellId: bindings[0].spell_id });
      }
    }
    if (delta < 0) {
      const bindings = bindingStore.getByFlowId(flowId);
      if (bindings.length === 0) {
        flowStore.update(flowId, { spellId: undefined });
      }
    }
  }
  /**
   * 创建法术与流程的绑定关系
   */
  static async bindSpellToFlow(spellId: string, flowId: string): Promise<SpellFlowBinding> {
    // 检查是否已经绑定
    const existingBindings = bindingStore.getBySpellId(spellId);
    const alreadyBound = existingBindings.find(b => b.flow_id === flowId);
    
    if (alreadyBound) {
      throw new Error('该法术与流程已绑定');
    }

    // 创建绑定关系
    const binding = await bindingStore.create(spellId, flowId);
    
    // 更新本地缓存，添加绑定信息
    this.updateLocalCacheWithBinding(spellId, flowId);
    
    return binding;
  }

  /**
   * 解除法术与流程的绑定关系
   */
  static async unbindSpellFromFlow(bindingId: string): Promise<void> {
    await bindingStore.delete(bindingId);
    
    // 更新本地缓存
    const binding = bindingStore.getAll().find(b => b.id === bindingId);
    if (binding) {
      this.removeBindingFromCache(binding.spell_id, binding.flow_id);
    }
  }

  /**
   * 获取法术的所有绑定流程
   */
  static async getSpellBoundFlows(spellId: string): Promise<FlowDefinition[]> {
    const bindings = bindingStore.getBySpellId(spellId);
    return flowStore.getAll().filter(flow => 
      bindings.some(binding => binding.flow_id === flow.id)
    );
  }

  /**
   * 获取流程的所有绑定法术
   */
  static async getFlowBoundSpells(flowId: string): Promise<Spell[]> {
    const bindings = bindingStore.getByFlowId(flowId);
    return spellStore.getAll().filter(spell => 
      bindings.some(binding => binding.spell_id === spell.id)
    );
  }

  /**
   * 当获取法术详情时，自动加载绑定信息
   */
  static async enrichSpellWithBindings(spell: Spell): Promise<SpellWithFlowBindings> {
    const boundFlows = await this.getSpellBoundFlows(spell.id);
    return {
      ...spell,
      boundFlows,
      bindingsCount: boundFlows.length
    };
  }

  /**
   * 当获取流程详情时，自动加载绑定信息
   */
  static async enrichFlowWithBindings(flow: FlowDefinition): Promise<FlowWithSpellBindings> {
    const boundSpells = await this.getFlowBoundSpells(flow.id);
    return {
      ...flow,
      boundSpells,
      bindingsCount: boundSpells.length
    };
  }

  /**
   * 更新本地缓存，添加绑定信息
   */
  private static updateLocalCacheWithBinding(spellId: string, flowId: string): void {
    // 更新法术缓存
    const spells = [...spellStore.getAll()];
    const spellIndex = spells.findIndex(s => s.id === spellId);
    if (spellIndex >= 0) {
      spells[spellIndex] = {
        ...spells[spellIndex],
        bindingsCount: (spells[spellIndex].bindingsCount || 0) + 1
      };
    }
    
    // 更新流程缓存
    const flows = [...flowStore.getAll()];
    const flowIndex = flows.findIndex(f => f.id === flowId);
    if (flowIndex >= 0) {
      flows[flowIndex] = {
        ...flows[flowIndex],
        bindingsCount: (flows[flowIndex].bindingsCount || 0) + 1
      };
    }
  }

  /**
   * 从本地缓存移除绑定信息
   */
  private static removeBindingFromCache(spellId: string, flowId: string): void {
    // 更新法术缓存
    const spells = [...spellStore.getAll()];
    const spellIndex = spells.findIndex(s => s.id === spellId);
    if (spellIndex >= 0) {
      spells[spellIndex] = {
        ...spells[spellIndex],
        bindingsCount: Math.max(0, (spells[spellIndex].bindingsCount || 0) - 1)
      };
    }
    
    // 更新流程缓存
    const flows = [...flowStore.getAll()];
    const flowIndex = flows.findIndex(f => f.id === flowId);
    if (flowIndex >= 0) {
      flows[flowIndex] = {
        ...flows[flowIndex],
        bindingsCount: Math.max(0, (flows[flowIndex].bindingsCount || 0) - 1)
      };
    }
  }
}