import type { FlowDefinition } from '../types/flow';
import { generateFlowId } from '../lib/idUtils';

/**
 * 构造一份全新的空白流程（纯内存对象，不写入任何持久层）。
 *
 * 编辑器以内存为唯一真相源，新建流程时只把这份对象交给编辑器；
 * 只有发布才会落云端，因此不需要提前在本地缓存里占位。
 */
export function createBlankFlow(name: string = '未命名流程'): FlowDefinition {
  const now = Date.now();
  return {
    id: generateFlowId(),
    name,
    description: '',
    nodes: [],
    edges: [],
    tags: [],
    version: 1,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
