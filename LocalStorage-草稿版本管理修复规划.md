# LocalStorage 草稿版本管理修复规划

## 📋 项目概述

### 问题背景
当前 LocalStorage 草稿存在以下关键问题：
1. **数据丢失**：`readDrafts()` 函数的立即回写逻辑导致数据永久丢失
2. **版本混乱**：同一草稿产生多时间戳版本，导致数据不一致
3. **依赖外部**：草稿依赖数据库记录验证，不是真正的独立数据空间
4. **多版本并行**：`getById()` 可能返回错误版本，导致编辑器显示旧数据

### 修复目标
1. **独立数据空间**：LocalStorage 草稿完全独立，不依赖任何外部数据
2. **版本管理**：实现基于数据版本的精确版本控制
3. **数据一致性**：确保用户始终看到最新版本
4. **数据安全**：移除立即回写逻辑，避免数据丢失

## 🎯 核心设计原则

### 1. 独立性原则
- LocalStorage 草稿是独立的数据空间
- 不依赖数据库记录的存在
- 可以在离线状态下自由创建和编辑

### 2. 版本管理原则
- 使用数据版本号（`version`）作为版本标识
- 每个草稿数据版本号递增
- 避免多版本并行问题

### 3. 一致性原则
- 用户始终看到最新版本
- 编辑器状态与实际数据保持一致
- 版本检查确保数据同步

### 4. 安全性原则
- 移除立即回写逻辑
- 避免数据永久丢失
- 保留完整的历史版本

## 📁 需要修改的文件

### 🎯 主要修改文件：`src/data/flowStore.ts`

#### 1. FlowDraft 接口定义（第1-50行）

**当前代码**：
```typescript
interface FlowDraft {
  parentId: string;     // 问题：依赖外部数据
  data: FlowDefinition; // 草稿数据
  forkedAt: number;
  updatedAt: number;
}
```

**修改为**：
```typescript
interface FlowDraft {
  id: string;                    // 草稿唯一标识
  data: FlowDefinition;         // 草稿数据
  dataVersion: number;           // 数据版本号（与 flow.version 保持一致）
  draftVersion: number;          // 草稿版本号（递增）
  createdAt: number;             // 草稿创建时间
  updatedAt: number;             // 草稿更新时间
  isSynced: boolean;             // 是否已同步到数据库
  metadata?: {                   // 元数据（可选）
    source: 'local' | 'remote'; // 数据来源
    syncAttempts: number;       // 同步尝试次数
    sessionId?: string;         // 会话标识（防止多标签页冲突）
    userAgent?: string;          // 用户代理信息
  };
}
```

**修改理由**：
- 移除对 `parentId` 的依赖，使用独立的草稿 ID
- 添加版本管理字段，确保版本唯一性
- 添加会话隔离机制，防止多标签页冲突

#### 2. readDrafts() 函数（第118-164行）

**当前代码**：
```typescript
function readDrafts(): FlowDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const allDrafts: FlowDraft[] = raw ? JSON.parse(raw) : [];
    
    // 第一轮：按 parentId 去重，保留最新
    const byParentId = new Map<string, FlowDraft>();
    allDrafts.forEach(draft => {
      const existing = byParentId.get(draft.parentId);
      if (!existing || draft.updatedAt > existing.updatedAt) {
        byParentId.set(draft.parentId, draft);
      }
    });
    
    // 第二轮：按 data.id 去重，保留最新（消除同 ID 多 parentId 的幽灵）
    const byDataId = new Map<string, FlowDraft>();
    for (const draft of byParentId.values()) {
      // 自修正：parentId 与 data.id 不一致时，以 data.id 为准
      const canonical = draft.parentId !== draft.data.id && !publishedFlows.some(f => f.id === draft.parentId)
        ? { ...draft, parentId: draft.data.id }
        : draft;
      
      const existing = byDataId.get(canonical.data.id);
      if (!existing || canonical.updatedAt > existing.updatedAt) {
        byDataId.set(canonical.data.id, canonical);
      }
    }
    
    // 第三轮：清除孤儿草稿（parentId 既不在已发布版中，也不在其他草稿的 data.id 中）
    // 仅保留：parentId 在 publishedFlows 中，或 data.id 等于 parentId（纯草稿流程）
    const validDrafts = Array.from(byDataId.values()).filter(draft => {
      const isPublished = publishedFlows.some(f => f.id === draft.parentId);
      const isPureDraft = draft.parentId === draft.data.id;
      return isPublished || isPureDraft;
    });
    
    // 标准化：publishedVersion 归零
    const result = validDrafts.map(draft => ({
      ...draft,
      data: { ...draft.data, publishedVersion: 0 },
    }));
    
    // 如果清理有成效，立即回写（一次性修复）
    if (result.length < allDrafts.length) {
      console.log(`readDrafts() - 清理幽灵草稿: ${allDrafts.length} → ${result.length}`);
      writeDrafts(result);  // ← 永久删除数据！
    }
    
    return result;
  } catch { return []; }
}
```

**修改为**：
```typescript
function readDrafts(): FlowDraft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const allDrafts: FlowDraft[] = raw ? JSON.parse(raw) : [];
    
    // 【修复】移除所有依赖数据库的清理逻辑
    // 草稿是独立的，不需要依赖外部数据
    
    // 只做基本去重：按草稿 ID 去重，保留最新版本
    const byId = new Map<string, FlowDraft>();
    allDrafts.forEach(draft => {
      const existing = byId.get(draft.id);
      if (!existing || draft.updatedAt > existing.updatedAt) {
        byId.set(draft.id, draft);
      }
    });
    
    const result = Array.from(byId.values());
    
    // 【修复】移除立即回写逻辑
    // if (result.length < allDrafts.length) {
    //   writeDrafts(result);  // ← 删除这行！
    // }
    
    console.log(`readDrafts() - 返回 ${result.length} 个独立草稿`);
    return result;
  } catch { return []; }
}
```

**修改理由**：
- 移除对 `publishedFlows` 的依赖，草稿完全独立
- 移除立即回写逻辑，避免数据永久丢失
- 简化去重逻辑，使用草稿 ID 作为唯一标识

#### 3. save() 函数（第595-640行）

**当前代码**：
```typescript
save(flow: FlowDefinition): FlowDefinition {
  // 验证数据完整性
  if (!flow.id || !flow.name) {
    throw new Error('流程数据不完整');
  }

  // 检查是否有草稿
  const draftIndex = drafts.findIndex(d => d.parentId === flow.id);
  
  // 如果草稿已存在且版本相同，则不重复保存
  if (draftIndex >= 0 && drafts[draftIndex].data.updatedAt === flow.updatedAt) {
    console.log('save() - 草稿版本相同，跳过保存:', flow.id);
    return flow;
  }
  
  if (draftIndex >= 0) {
    // 有草稿，更新草稿
    drafts[draftIndex] = {
      ...drafts[draftIndex],
      data: {
        ...flow,
        publishedVersion: 0, // 草稿的 publishedVersion 必须为 0
      },
      updatedAt: Date.now(),
    };
    writeDrafts(drafts);
    console.log('save() - 更新现有草稿:', flow.id);
  } else {
    // 没有草稿，创建新草稿
    const newDraft: FlowDraft = {
      parentId: flow.id,
      data: {
        ...flow,
        publishedVersion: 0,
      },
      forkedAt: Date.now(),
      updatedAt: Date.now(),
    };
    drafts.push(newDraft);
    writeDrafts(drafts);
    console.log('save() - 创建新草稿:', flow.id);
  }
  
  notify();
  return flow;
}
```

**修改为**：
```typescript
save(flow: FlowDefinition): FlowDefinition {
  // 验证数据完整性
  if (!flow.id || !flow.name) {
    throw new Error('流程数据不完整');
  }

  // 获取该流程的所有草稿版本
  const relevantDrafts = drafts.filter(d => d.data.id === flow.id);
  
  if (relevantDrafts.length > 0) {
    // 找到最新版本的草稿
    const latestDraft = relevantDrafts.reduce((latest, current) => 
      current.dataVersion > latest.dataVersion ? current : latest
    );
    
    // 检查是否真的需要更新
    if (latestDraft.dataVersion >= flow.version) {
      console.log('save() - 草稿已是最新，无需更新:', flow.id);
      return flow;
    }
    
    // 更新现有草稿，保持草稿 ID 不变
    const draftIndex = drafts.findIndex(d => d.id === latestDraft.id);
    drafts[draftIndex] = {
      ...latestDraft,
      data: flow,
      dataVersion: flow.version,
      updatedAt: Date.now(),
      isSynced: false,
    };
    writeDrafts(drafts);
    console.log('save() - 更新现有草稿:', flow.id);
  } else {
    // 创建新草稿
    const newDraft: FlowDraft = {
      id: `draft-${flow.id}-${flow.version}-${Date.now()}`,
      data: flow,
      dataVersion: flow.version,
      draftVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSynced: false,
      metadata: {
        source: 'local',
        syncAttempts: 0,
      },
    };
    drafts.push(newDraft);
    writeDrafts(drafts);
    console.log('save() - 创建新草稿:', flow.id);
  }
  
  notify();
  return flow;
}
```

**修改理由**：
- 使用 `data.id` 查找草稿，避免多版本并行
- 添加版本检查逻辑，确保只更新需要更新的版本
- 使用数据版本号管理，避免时间戳冲突

#### 4. getById() 函数（第525-542行）

**当前代码**：
```typescript
getById(id: string): FlowDefinition | undefined {
  // 优先返回草稿数据
  const draft = drafts.find(d => d.data.id === id || d.parentId === id);
  if (draft) {
    console.log('getById() - 返回草稿数据:', id);
    return draft.data;
  }
  
  // 如果没有草稿，返回已发布流程
  const published = publishedFlows.find(f => f.id === id);
  if (published) {
    console.log('getById() - 返回已发布数据:', id);
    return published;
  }
  
  console.log('getById() - 未找到流程:', id);
  return undefined;
}
```

**修改为**：
```typescript
getById(id: string): FlowDefinition | undefined {
  // 查找该流程的所有草稿版本
  const relevantDrafts = drafts.filter(d => d.data.id === id);
  
  if (relevantDrafts.length > 0) {
    // 返回最新版本的草稿数据
    const latestDraft = relevantDrafts.reduce((latest, current) => 
      current.dataVersion > latest.dataVersion ? current : latest
    );
    console.log('getById() - 返回最新草稿数据:', id, '版本:', latestDraft.dataVersion);
    return latestDraft.data;
  }
  
  // 如果没有草稿，返回已发布流程
  const published = publishedFlows.find(f => f.id === id);
  if (published) {
    console.log('getById() - 返回已发布数据:', id);
    return published;
  }
  
  console.log('getById() - 未找到流程:', id);
  return undefined;
}
```

**修改理由**：
- 使用 `data.id` 查找草稿，避免多版本并行
- 添加版本排序逻辑，确保返回最新版本
- 移除对 `parentId` 的依赖

### 🎯 次要修改文件：`src/pages/FlowEditor.tsx`

#### 1. 手动保存机制（第295-314行）

**当前代码**：
```typescript
const manualSave = useCallback(() => {
  if (flow && flow.id) {
    setSaveStatus('saving');
    flowStore.save(flow);
    setSaveStatus('saved');
    setLastSavedAt(Date.now());
  }
}, [flow]);
```

**修改为**：
```typescript
const manualSave = useCallback(() => {
  if (flow && flow.id) {
    setSaveStatus('saving');
    // 使用修复后的 save() 函数，确保返回最新版本
    const savedFlow = flowStore.save(flow);
    setFlow(savedFlow);  // 确保使用最新版本
    setSaveStatus('saved');
    setLastSavedAt(Date.now());
  }
}, [flow]);
```

**修改理由**：
- 确保使用最新版本
- 避免版本不一致问题

#### 2. 数据加载机制（第100-119行、第332-350行）

**当前代码**：
```typescript
useEffect(() => {
  if (!flowId) return;
  
  const loaded = flowStore.getById(flowId);
  if (loaded) {
    setFlow(loaded);
    flowRef.current = loaded;
    flowNameInput.setExternal(loaded.name);
  } else {
    // 流程在本地不存在，尝试从远程拉取
    (async () => {
      try {
        await flowStore.fetchRemote();
        const remote = flowStore.getById(flowId);
        if (remote) {
          setFlow(remote);
          flowRef.current = remote;
          flowNameInput.setExternal(remote.name);
        } else {
          // 确实不存在，回退列表页
        }
      } catch (error) {
        console.error('远程拉取失败:', error);
      }
    })();
  }
}, [flowId]);

// 另一个调用点
const unsubscribe = flowStore.subscribe(() => {
  const loaded = flowStore.getById(flowId);
  if (loaded && JSON.stringify(loaded) !== JSON.stringify(flow)) {
    setFlow(loaded);
    flowRef.current = loaded;
    flowNameInput.setExternal(loaded.name);
  }
});
```

**修改为**：
```typescript
useEffect(() => {
  if (!flowId) return;
  
  const loaded = flowStore.getById(flowId);
  if (loaded) {
    // 确保使用最新版本
    setFlow(loaded);
    flowRef.current = loaded;
    flowNameInput.setExternal(loaded.name);
  } else {
    // 流程在本地不存在，尝试从远程拉取
    (async () => {
      try {
        await flowStore.fetchRemote();
        const remote = flowStore.getById(flowId);
        if (remote) {
          // 确保使用最新版本
          setFlow(remote);
          flowRef.current = remote;
          flowNameInput.setExternal(remote.name);
        } else {
          // 确实不存在，回退列表页
        }
      } catch (error) {
        console.error('远程拉取失败:', error);
      }
    })();
  }
}, [flowId]);

// 另一个调用点
const unsubscribe = flowStore.subscribe(() => {
  const loaded = flowStore.getById(flowId);
  if (loaded && JSON.stringify(loaded) !== JSON.stringify(flow)) {
    // 确保使用最新版本
    setFlow(loaded);
    flowRef.current = loaded;
    flowNameInput.setExternal(loaded.name);
  }
});
```

**修改理由**：
- 确保使用最新版本
- 避免版本不一致问题

#### 3. 保存和刷新机制（第721-737行）

**当前代码**：
```typescript
// 保存流程
flowStore.save(updatedFlow);
setDrafts(flowStore.getAll());   // 刷新下拉框数据

// 另一个保存操作
flowStore.save(updatedFlow);
setDrafts(flowStore.getAll());
```

**修改为**：
```typescript
// 保存流程
const savedFlow = flowStore.save(updatedFlow);
setFlow(savedFlow);  // 确保使用最新版本
setDrafts(flowStore.getAll());   // 刷新下拉框数据

// 另一个保存操作
const savedFlow = flowStore.save(updatedFlow);
setFlow(savedFlow);  // 确保使用最新版本
setDrafts(flowStore.getAll());
```

**修改理由**：
- 确保使用最新版本
- 避免版本不一致问题

### 🎯 其他相关文件

#### 1. `src/types/flow.ts`

**需要修改**：
```typescript
// 更新 FlowDraft 接口定义
interface FlowDraft {
  id: string;                    // 草稿唯一标识
  data: FlowDefinition;         // 草稿数据
  dataVersion: number;           // 数据版本号
  draftVersion: number;          // 草稿版本号
  createdAt: number;             // 草稿创建时间
  updatedAt: number;             // 草稿更新时间
  isSynced: boolean;             // 是否已同步
  metadata?: {                   // 元数据（可选）
    source: 'local' | 'remote'; // 数据来源
    syncAttempts: number;       // 同步尝试次数
    sessionId?: string;         // 会话标识
    userAgent?: string;          // 用户代理信息
  };
}
```

#### 2. `src/lib/api.ts`

**需要检查**：
- 确保API调用与新的版本管理逻辑兼容
- 检查同步逻辑是否正确

## 📋 实施步骤

### 第一阶段：核心修复（预计2-3小时）

#### 1. 修改 FlowDraft 接口定义
1. 打开 `src/types/flow.ts`
2. 更新 `FlowDraft` 接口定义
3. 添加版本管理相关字段

#### 2. 重构 readDrafts() 函数
1. 打开 `src/data/flowStore.ts`
2. 移除依赖数据库的清理逻辑
3. 移除立即回写逻辑
4. 简化去重逻辑

#### 3. 重构 save() 函数
1. 使用 `data.id` 查找草稿
2. 添加版本检查逻辑
3. 确保只更新需要更新的版本

#### 4. 重构 getById() 函数
1. 使用 `data.id` 查找草稿
2. 添加版本排序逻辑
3. 确保返回最新版本

### 第二阶段：调用点修复（预计1-2小时）

#### 1. 修复 FlowEditor.tsx 中的调用点
1. 修复手动保存机制
2. 修复数据加载机制
3. 修复保存和刷新机制

#### 2. 更新相关的辅助函数
1. 检查其他调用 `flowStore` 的函数
2. 确保使用最新版本

### 第三阶段：测试验证（预计1-2小时）

#### 1. 验证版本管理逻辑
1. 测试创建新草稿
2. 测试更新现有草稿
3. 测试版本冲突处理

#### 2. 测试 LocalStorage 独立性
1. 测试离线状态下的草稿操作
2. 测试数据不依赖外部记录

#### 3. 测试数据一致性
1. 测试多标签页编辑
2. 测试版本同步

## 🎯 验证方法

### 1. 版本管理验证
```typescript
// 测试创建新草稿
const flow1 = { id: 'flow-1', name: '测试流程', version: 1 };
const saved1 = flowStore.save(flow1);
console.log('保存后的版本:', saved1.version); // 应该是 1

// 测试更新草稿
const flow2 = { ...flow1, version: 2 };
const saved2 = flowStore.save(flow2);
console.log('更新后的版本:', saved2.version); // 应该是 2

// 测试获取最新版本
const latest = flowStore.getById('flow-1');
console.log('最新版本:', latest.version); // 应该是 2
```

### 2. 独立性验证
```typescript
// 测试草稿独立性
const flow = { id: 'flow-1', name: '测试流程', version: 1 };
flowStore.save(flow);

// 模拟数据库记录不存在
publishedFlows = [];

// 获取草稿应该仍然有效
const draft = flowStore.getById('flow-1');
console.log('草稿获取成功:', draft !== undefined); // 应该是 true
```

### 3. 数据一致性验证
```typescript
// 测试多版本处理
const flow1 = { id: 'flow-1', name: '测试流程', version: 1 };
const flow2 = { ...flow1, version: 2 };

// 创建多个版本
flowStore.save(flow1);
flowStore.save(flow2);

// 获取应该返回最新版本
const latest = flowStore.getById('flow-1');
console.log('最新版本:', latest.version); // 应该是 2
```

## 📋 风险评估

### 高风险
1. **数据丢失**：修改 `readDrafts()` 函数可能影响现有数据
2. **版本冲突**：版本管理逻辑可能产生冲突

### 中风险
1. **兼容性问题**：新的接口可能与现有代码不兼容
2. **性能影响**：版本检查可能影响性能

### 低风险
1. **用户体验**：修复后的版本管理可能改变用户行为
2. **文档更新**：需要更新相关文档

## 📋 回滚计划

### 1. 代码回滚
- 保留原始代码的备份
- 使用版本控制系统管理变更
- 可以快速回滚到原始状态

### 2. 数据回滚
- 保留 LocalStorage 数据的备份
- 提供数据恢复脚本
- 确保用户数据安全

### 3. 功能回滚
- 如果出现问题，可以临时回滚到原始版本
- 提供降级方案
- 确保核心功能不受影响

## 📋 总结

这份规划文档详细描述了 LocalStorage 草稿版本管理的修复方案。通过实施这些修改，我们将：

1. **解决数据丢失问题**：移除立即回写逻辑
2. **解决版本混乱问题**：实现精确的版本管理
3. **实现独立数据空间**：草稿不依赖外部数据
4. **确保数据一致性**：用户始终看到最新版本

修复完成后，LocalStorage 草稿将成为一个完全独立、版本可控、数据安全的系统，为用户提供更好的编辑体验。