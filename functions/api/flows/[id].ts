// 单个流程的获取、发布、删除
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM flows WHERE id = ?'
    ).bind(params.id).first();
    if (!row) return errorResponse(404, '流程不存在');
    
    const flowData = JSON.parse((row as any).data);
    return jsonResponse({
      ...flowData,
      publishedVersion: (row as any).version,
      publishedAt: (row as any).published_at,
    });
  } catch (error) {
    console.error('获取流程失败:', error);
    return errorResponse(500, `获取流程失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function onRequestPut(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
  const body: any = await readJsonBody(request);
  if (!body) return errorResponse('请求体为空', 400);
  
  const timestamp = now();
  console.log('发布请求:', { paramsId: params.id, body: body, timestamp });
  
  const existing = await env.DB.prepare(
    'SELECT version, published_at FROM flows WHERE id = ?'
  ).bind(params.id).first();
  
  console.log('现有数据:', existing);
  
  const nextVersion = existing ? ((existing as any).version as number) + 1 : 1;
  
  // 确保 publishedAt 是秒级时间戳，与数据库字段类型匹配
  let publishedAt = timestamp;
  if (existing) {
    if (typeof body.publishedAt === 'number') {
      // 如果前端提供了 publishedAt，确保它是秒级时间戳
      publishedAt = Math.floor(body.publishedAt / 1000); // 转换为秒级
    } else {
      // 使用现有的 published_at，确保是秒级
      publishedAt = Math.floor((existing as any).published_at / 1000);
    }
  }
  
  const flowData = {
    ...body,
    publishedVersion: nextVersion,
    publishedAt: publishedAt,
    updatedAt: timestamp,
  };
  
  console.log('处理后的数据:', { nextVersion, publishedAt, flowData });
  
  try {
    // 安全序列化：移除可能引起序列化问题的字段
    const sanitizedFlowData = {
      ...flowData,
      // 移除可能引起循环引用或序列化问题的字段
      nodes: flowData.nodes?.map((node: any) => ({
        ...node,
        // 移除可能引起问题的引用
        data: typeof node.data === 'object' ? JSON.parse(JSON.stringify(node.data)) : node.data
      })) || [],
      edges: flowData.edges?.map((edge: any) => ({
        ...edge,
        // 移除可能引起问题的引用
        data: typeof edge.data === 'object' ? JSON.parse(JSON.stringify(edge.data)) : edge.data
      })) || []
    };
    
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
    
    console.log('发布成功');
    return jsonResponse(flowData);
  } catch (error) {
    console.error('发布失败:', error);
    return errorResponse(500, `发布失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env, params } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');
  
  try {
    await env.DB.prepare('DELETE FROM flows WHERE id = ?').bind(params.id).run();
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('删除流程失败:', error);
    return errorResponse(500, `删除流程失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
