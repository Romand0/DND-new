import { validateFlowWithDetails } from './src/pages/FlowEditor.tsx';

// 测试1：正常流程
const normalFlow = {
  id: 'test-spell',
  name: '测试法术',
  nodes: [
    {
      id: 'start',
      type: 'cast_start',
      label: '施法开始',
      position: { x: 100, y: 100 }
    },
    {
      id: 'check_range',
      type: 'check_range',
      label: '距离检测',
      position: { x: 300, y: 100 },
      config: { range: 60 }
    }
  ],
  edges: [
    {
      id: 'edge1',
      from: 'start',
      to: 'check_range',
      trigger: 'on_complete'
    }
  ]
};

// 测试2：有错误的流程
const errorFlow = {
  id: 'error-spell',
  name: '', // 空名称
  nodes: [
    {
      id: 'node1',
      type: 'cast_start',
      label: '节点1',
      position: { x: 100, y: 100 }
    },
    {
      id: 'node1', // 重复ID
      type: 'check_range',
      label: '节点2',
      position: { x: 300, y: 100 }
    },
    {
      id: 'node3',
      type: 'condition_branch',
      label: '条件分支',
      position: { x: 500, y: 100 }
      // 缺少on_true和on_false出边
    }
  ],
  edges: [
    {
      id: 'edge1',
      from: 'node1',
      to: 'node1', // 自环
      trigger: 'on_complete'
    },
    {
      id: 'edge2',
      from: 'node3',
      to: 'node1',
      trigger: 'on_complete' // 缺少on_true和on_false
    },
    {
      id: 'edge3',
      from: 'node1',
      to: 'node3',
      trigger: 'on_complete'
    }
  ]
};

console.log('=== 测试1：正常流程 ===');
const normalErrors = validateFlowWithDetails(normalFlow);
console.log('错误数量:', normalErrors.length);
console.log('错误详情:', normalErrors);

console.log('\n=== 测试2：错误流程 ===');
const errorErrors = validateFlowWithDetails(errorFlow);
console.log('错误数量:', errorErrors.length);
console.log('错误详情:', errorErrors);