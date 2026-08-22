// 修复草稿校验成功却发布失败，显示500错误的问题
// 主要解决时间戳格式不匹配和数据序列化问题

// 1. 修复时间戳格式不匹配问题
export function fixTimestampIssues() {
  // 统一时间戳处理为秒级
  const toSeconds = (timestamp: number) => Math.floor(timestamp / 1000);
  
  // 修复前端 flowStore.ts 中的时间戳处理
  const fixFlowStoreTimestamp = (publishedAt: number | undefined) => {
    if (typeof publishedAt === 'number') {
      // 确保是秒级时间戳
      return toSeconds(publishedAt);
    }
    return Math.floor(Date.now() / 1000); // 默认当前秒级时间戳
  };

  return {
    toSeconds,
    fixFlowStoreTimestamp
  };
}

// 2. 修复数据序列化问题
export function fixSerializationIssues() {
  // 安全序列化函数，避免循环引用和特殊类型问题
  const safeSerialize = (obj: any) => {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (error) {
      console.error('序列化失败:', error);
      // 返回安全的简化对象
      return JSON.parse(JSON.stringify({
        id: obj.id,
        name: obj.name,
        type: obj.type,
        position: obj.position,
        data: typeof obj.data === 'object' ? {} : obj.data
      }));
    }
  };

  // 修复后端 flows/[id].ts 中的序列化逻辑
  const fixBackendSerialization = (flowData: any) => {
    const sanitizedFlowData = {
      ...flowData,
      nodes: flowData.nodes?.map((node: any) => ({
        ...node,
        // 安全序列化节点数据
        data: typeof node.data === 'object' ? safeSerialize(node.data) : node.data,
        // 移除可能引起问题的其他字段
        __proto__: null,
        constructor: null,
        prototype: null
      })) || [],
      edges: flowData.edges?.map((edge: any) => ({
        ...edge,
        // 安全序列化边数据
        data: typeof edge.data === 'object' ? safeSerialize(edge.data) : edge.data,
        // 移除可能引起问题的其他字段
        __proto__: null,
        constructor: null,
        prototype: null
      })) || []
    };

    return sanitizedFlowData;
  };

  return {
    safeSerialize,
    fixBackendSerialization
  };
}

// 3. 增强错误处理和日志
export function fixErrorHandling() {
  // 增强的错误处理函数
  const enhancedErrorHandler = (error: any, context: string) => {
    console.error(`${context} 错误:`, error);
    
    // 返回更详细的错误信息
    return {
      error: true,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: context,
      timestamp: Date.now()
    };
  };

  // 修复后端 flows/[id].ts 中的错误处理
  const fixBackendErrorHandling = async (context: any, operation: string) => {
    try {
      // 原有操作...
      const result = await env.DB.prepare(/* ... */).run();
      return result;
    } catch (error) {
      console.error(`${operation} 失败:`, error);
      return enhancedErrorHandler(error, `${operation} - ${context.params.id}`);
    }
  };

  return {
    enhancedErrorHandler,
    fixBackendErrorHandling
  };
}

// 4. 完整的修复方案
export function fixPublish500Error() {
  const { fixFlowStoreTimestamp } = fixTimestampIssues();
  const { fixBackendSerialization } = fixSerializationIssues();
  const { fixBackendErrorHandling } = fixErrorHandling();

  // 修复前端 flowStore.ts
  const fixFlowStorePublish = async (id: string) => {
    const flow = localFlows.find(f => f.id === id);
    if (!flow) return undefined;
    
    const res = await fetch(`/api/flows/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({
        ...flow,
        publishedAt: fixFlowStoreTimestamp(flow.publishedAt),
        updatedAt: Math.floor(Date.now() / 1000)
      }),
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(`发布失败: ${errorData.error || res.status}`);
    }
    
    const published = await res.json();
    const updated = {
      ...flow,
      publishedVersion: published.publishedVersion,
      publishedAt: published.publishedAt ?? Math.floor(Date.now() / 1000),
    };
    
    const idx = localFlows.findIndex(f => f.id === id);
    localFlows[idx] = updated;
    write(localFlows);
    notify();
    
    return updated;
  };

  // 修复后端 flows/[id].ts
  const fixBackendPut = async (context: any) => {
    const { request, env, params } = context;
    const auth = await authenticateRequest(request, env);
    if (!auth) return errorResponse(401, '未授权');
    if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
    
    const body: any = await readJsonBody(request);
    if (!body) return errorResponse(400, '请求体为空');
    
    const timestamp = now();
    const existing = await env.DB.prepare(
      'SELECT version, published_at FROM flows WHERE id = ?'
    ).bind(params.id).first();
    
    const nextVersion = existing ? ((existing as any).version as number) + 1 : 1;
    const publishedAt = fixFlowStoreTimestamp(body.publishedAt);
    
    // 应用序列化修复
    const sanitizedFlowData = fixBackendSerialization({
      ...body,
      publishedVersion: nextVersion,
      publishedAt: publishedAt,
      updatedAt: timestamp,
    });
    
    try {
      const serializedData = JSON.stringify(sanitizedFlowData);
      
      await env.DB.prepare(
        `INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, category=excluded.category, version=excluded.version,
         data=excluded.data, published_at=excluded.published_at, updated_at=excluded.updated_at`
      ).bind(
        params.id, 
        body.name || '', 
        body.category || 'custom', 
        nextVersion,
        serializedData,
        publishedAt,
        timestamp,
        existing ? (existing as any).created_at : timestamp
      ).run();
      
      return jsonResponse(sanitizedFlowData);
    } catch (error) {
      console.error('发布失败:', error);
      return errorResponse(500, `发布失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  return {
    fixFlowStorePublish,
    fixBackendPut
  };
}