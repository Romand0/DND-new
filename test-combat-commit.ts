// 战斗→角色变更回传测试
// 验证 commitCombatToCharacter 相关功能的正确性

import { combatStore, commitCombatToCharacter, commitAllPcCombatChanges } from '@/data/combatStore';
import { characterStore } from '@/data/characterStore';

// 测试数据
const testCharacter = {
  id: 'test-char-1',
  name: '测试角色',
  hp: 20,
  equipment: [
    {
      id: 'sword',
      childId: 'sword-001',
      name: '长剑',
      quantity: 1,
      category: '武器',
      subtype: '单手武器'
    }
  ],
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const testCombatant = {
  id: 'test-combatant-1',
  name: '测试角色',
  characterId: 'test-char-1',
  currentHp: 15, // 战斗中受伤
  isPc: true,
  equipmentChanges: {
    'test-combatant-1': {
      added: [
        {
          childId: 'potion-001',
          equipment: {
            id: 'potion',
            childId: 'potion-001',
            name: '治疗药水',
            quantity: 1,
            category: '药水'
          }
        }
      ],
      removedChildIds: [],
      quantityDeltas: {
        'sword-001': -1 // 使用了一发弹药或投掷了武器
      }
    }
  }
};

const testCombatRecord = {
  id: 'test-combat-1',
  title: '测试战斗',
  combatants: [testCombatant],
  rounds: [],
  mode: 'simulation' as const,
  equipmentChanges: {
    'test-combatant-1': {
      added: [
        {
          childId: 'potion-001',
          equipment: {
            id: 'potion',
            childId: 'potion-001',
            name: '治疗药水',
            quantity: 1,
            category: '药水'
          }
        }
      ],
      removedChildIds: [],
      quantityDeltas: {
        'sword-001': -1
      }
    }
  },
  createdAt: Date.now(),
  updatedAt: Date.now()
};

function testCommitCombatToCharacter() {
  console.log('=== 测试 commitCombatToCharacter ===');
  
  // 保存测试数据
  characterStore.saveCharacter(testCharacter);
  
  // 模拟战斗记录
  localStorage.setItem('dnd-combat-records', JSON.stringify([testCombatRecord]));
  
  // 执行回传
  const result = commitCombatToCharacter('test-combat-1', 'test-combatant-1');
  
  if (result) {
    console.log('✅ 回传成功');
    console.log('HP 变更:', result.hp);
    console.log('装备变更:', result.equipmentDeltas);
    console.log('状态变更:', result.statusChanges);
    console.log('冲突:', result.conflicts);
    
    // 验证 HP 取最小值策略
    if (result.hp.after === Math.min(15, 20)) {
      console.log('✅ HP 取最小值策略正确');
    } else {
      console.log('❌ HP 取最小值策略错误');
    }
    
    // 验证装备合并
    const swordDelta = result.equipmentDeltas.find(d => d.childId === 'sword-001');
    if (swordDelta && swordDelta.delta === -1) {
      console.log('✅ 装备数量减少正确');
    } else {
      console.log('❌ 装备数量减少错误');
    }
    
    const potionDelta = result.equipmentDeltas.find(d => d.childId === 'potion-001');
    if (potionDelta && potionDelta.delta === 1) {
      console.log('✅ 新增装备正确');
    } else {
      console.log('❌ 新增装备错误');
    }
  } else {
    console.log('❌ 回传失败');
  }
}

function testCommitAllPcCombatChanges() {
  console.log('\n=== 测试 commitAllPcCombatChanges ===');
  
  const results = commitAllPcCombatChanges('test-combat-1');
  console.log('批量回传结果:', results);
  
  if (results.success.length > 0) {
    console.log('✅ 批量回传成功');
  } else {
    console.log('❌ 批量回传失败');
  }
}

// 运行测试
if (typeof window !== 'undefined') {
  testCommitCombatToCharacter();
  testCommitAllPcCombatChanges();
} else {
  console.log('此测试需要在浏览器环境中运行');
}