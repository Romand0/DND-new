// Spell-Flow 绑定管理服务
// 统一管理法术与流程之间的绑定关系，确保数据一致性

import type { Spell } from '@/types/spell';
import type { FlowDefinition } from '@/types/flow';
import spellStore from '@/data/spellStore';
import flowStore from '@/data/flowStore';

interface BindingRecord {
  spellId: string;
  flowId: string;
  createdAt: number;
}

class SpellFlowBinding {
  private static instance: SpellFlowBinding;
  private bindings: Map<string, BindingRecord[]> = new Map();
  private listeners: Set<(event: 'bind' | 'unbind', spellId: string, flowId: string) => void> = new Set();

  private constructor() {
    this.loadBindings();
  }

  static getInstance(): SpellFlowBinding {
    if (!SpellFlowBinding.instance) {
      SpellFlowBinding.instance = new SpellFlowBinding();
    }
    return SpellFlowBinding.instance;
  }

  // 加载绑定关系
  private loadBindings(): void {
    try {
      const stored = localStorage.getItem('dnd-spell-flow-bindings');
      if (stored) {
        const bindings: BindingRecord[] = JSON.parse(stored);
        bindings.forEach(binding => {
          if (!this.bindings.has(binding.spellId)) {
            this.bindings.set(binding.spellId, []);
          }
          this.bindings.get(binding.spellId)!.push(binding);
        });
      }
    } catch (error) {
      console.error('[SpellFlowBinding] 加载绑定关系失败:', error);
    }
  }

  // 保存绑定关系
  private saveBindings(): void {
    try {
      const allBindings: BindingRecord[] = [];
      this.bindings.forEach(bindings => {
        allBindings.push(...bindings);
      });
      localStorage.setItem('dnd-spell-flow-bindings', JSON.stringify(allBindings));
    } catch (error) {
      console.error('[SpellFlowBinding] 保存绑定关系失败:', error);
    }
  }

  // 绑定法术到流程
  async bindSpellToFlow(spellId: string, flowId: string): Promise<void> {
    // 检查是否已经绑定
    const existingBinding = this.findBinding(spellId, flowId);
    if (existingBinding) {
      return; // 已经绑定，无需重复操作
    }

    // 创建绑定记录
    const binding: BindingRecord = {
      spellId,
      flowId,
      createdAt: Date.now(),
    };

    // 添加到绑定关系
    if (!this.bindings.has(spellId)) {
      this.bindings.set(spellId, []);
    }
    this.bindings.get(spellId)!.push(binding);

    // 保存到本地存储
    this.saveBindings();

    // 更新法术的绑定计数
    const spell = spellStore.getById(spellId);
    if (spell) {
      const newBindingsCount = this.getBindingsCount(spellId);
      await spellStore.saveItem({ ...spell, bindingsCount: newBindingsCount });
    }

    // 更新流程的 spellId
    const flow = flowStore.read().find(f => f.id === flowId);
    if (flow) {
      await flowStore.save({ ...flow, spellId });
    }

    // 通知监听器
    this.notifyListeners('bind', spellId, flowId);
  }

  // 解绑法术和流程
  async unbindSpellFromFlow(spellId: string, flowId: string): Promise<void> {
    const bindingIndex = this.findBindingIndex(spellId, flowId);
    if (bindingIndex === -1) {
      return; // 不存在绑定关系
    }

    // 移除绑定记录
    const spellBindings = this.bindings.get(spellId);
    if (spellBindings) {
      spellBindings.splice(bindingIndex, 1);
      if (spellBindings.length === 0) {
        this.bindings.delete(spellId);
      }
    }

    // 保存到本地存储
    this.saveBindings();

    // 更新法术的绑定计数
    const spell = spellStore.getById(spellId);
    if (spell) {
      const newBindingsCount = this.getBindingsCount(spellId);
      await spellStore.saveItem({ ...spell, bindingsCount: newBindingsCount });
    }

    // 更新流程的 spellId
    const flow = flowStore.read().find(f => f.id === flowId);
    if (flow) {
      await flowStore.save({ ...flow, spellId: undefined });
    }

    // 通知监听器
    this.notifyListeners('unbind', spellId, flowId);
  }

  // 查找绑定关系
  private findBinding(spellId: string, flowId: string): BindingRecord | undefined {
    const spellBindings = this.bindings.get(spellId);
    if (!spellBindings) return undefined;
    return spellBindings.find(b => b.flowId === flowId);
  }

  // 查找绑定关系索引
  private findBindingIndex(spellId: string, flowId: string): number {
    const spellBindings = this.bindings.get(spellId);
    if (!spellBindings) return -1;
    return spellBindings.findIndex(b => b.flowId === flowId);
  }

  // 获取法术的绑定数量
  getBindingsCount(spellId: string): number {
    const spellBindings = this.bindings.get(spellId);
    return spellBindings ? spellBindings.length : 0;
  }

  // 获取流程绑定的法术ID
  getBoundSpellId(flowId: string): string | undefined {
    for (const [spellId, bindings] of this.bindings) {
      const binding = bindings.find(b => b.flowId === flowId);
      if (binding) {
        return spellId;
      }
    }
    return undefined;
  }

  // 获取法术绑定的所有流程ID
  getBoundFlowIds(spellId: string): string[] {
    const spellBindings = this.bindings.get(spellId);
    return spellBindings ? spellBindings.map(b => b.flowId) : [];
  }

  // 删除法术时自动清理所有绑定关系
  async onSpellDeleted(spellId: string): Promise<void> {
    const spellBindings = this.bindings.get(spellId);
    if (spellBindings && spellBindings.length > 0) {
      // 获取所有绑定的流程ID
      const flowIds = spellBindings.map(b => b.flowId);
      
      // 清除法术的绑定关系
      this.bindings.delete(spellId);
      this.saveBindings();

      // 更新这些流程的 spellId
      for (const flowId of flowIds) {
        const flow = flowStore.read().find(f => f.id === flowId);
        if (flow) {
          await flowStore.save({ ...flow, spellId: undefined });
        }
      }

      // 通知监听器
      for (const flowId of flowIds) {
        this.notifyListeners('unbind', spellId, flowId);
      }
    }
  }

  // 删除流程时自动清理绑定关系
  async onFlowDeleted(flowId: string): Promise<void> {
    let deletedSpellId: string | undefined = undefined;
    
    // 查找并移除绑定关系
    for (const [spellId, bindings] of this.bindings) {
      const bindingIndex = bindings.findIndex(b => b.flowId === flowId);
      if (bindingIndex !== -1) {
        deletedSpellId = spellId;
        bindings.splice(bindingIndex, 1);
        
        if (bindings.length === 0) {
          this.bindings.delete(spellId);
        }
        
        this.saveBindings();
        break;
      }
    }

    if (deletedSpellId) {
      // 更新法术的绑定计数
      const spell = spellStore.getById(deletedSpellId);
      if (spell) {
        const newBindingsCount = this.getBindingsCount(deletedSpellId);
        await spellStore.saveItem({ ...spell, bindingsCount: newBindingsCount });
      }

      // 通知监听器
      this.notifyListeners('unbind', deletedSpellId, flowId);
    }
  }

  // 订阅绑定事件
  subscribe(listener: (event: 'bind' | 'unbind', spellId: string, flowId: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // 通知监听器
  private notifyListeners(event: 'bind' | 'unbind', spellId: string, flowId: string): void {
    this.listeners.forEach(listener => {
      try {
        listener(event, spellId, flowId);
      } catch (error) {
        console.error('[SpellFlowBinding] 通知监听器失败:', error);
      }
    });
  }
}

// 导出单例实例
export const spellFlowBinding = SpellFlowBinding.getInstance();

// 导出类以便测试
export { SpellFlowBinding };