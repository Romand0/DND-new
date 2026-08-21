// 事件发射器模拟（如果项目中没有现成的事件系统，请使用以下简单实现）

type EventCallback = (event: string, spellId: string, flowId: string) => void;

const listeners: EventCallback[] = [];

function emit(event: string, spellId: string, flowId: string) {
  listeners.forEach(cb => cb(event, spellId, flowId));
}

function on(callback: EventCallback) {
  listeners.push(callback);
}

function off(callback: EventCallback) {
  const idx = listeners.indexOf(callback);
  if (idx >= 0) listeners.splice(idx, 1);
}

// 注意：flowStore 需要从项目中已有的 store 导入，请根据实际情况调整路径

// 假设项目中存在一个通用的 flowStore（例如使用 Zustand 或 MobX）
import flowStore from './flowStore'; // 请确认路径正确

export const spellFlowBinding = {
  // 绑定法术到流程
  bindSpellToFlow: async (spellId: string, flowId: string) => {
    const flow = flowStore.getById(flowId);
    if (!flow) throw new Error('流程不存在');

    // 更新流程的 spellId
    flowStore.update(flowId, { spellId });

    // 触发绑定事件
    emit('bind', spellId, flowId);
  },

  // 解绑法术从流程
  unbindSpellFromFlow: async (spellId: string, flowId: string) => {
    const flow = flowStore.getById(flowId);
    if (!flow) throw new Error('流程不存在');

    // 清除流程的 spellId
    flowStore.update(flowId, { spellId: undefined });

    // 触发展开事件
    emit('unbind', spellId, flowId);
  },

  // 订阅绑定事件
  subscribe: (callback: (event: string, spellId: string, flowId: string) => void) => {
    on(callback);
    return () => {
      off(callback);
    };
  }
};