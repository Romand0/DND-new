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
    
    // 获取绑定的法术信息
    const bindingsResult = await env.DB
      .prepare(`
        SELECT s.* FROM spell_flow_bindings b
        JOIN spells s ON b.spell_id = s.id
        WHERE b.flow_id = ?
      `)
      .bind(params.id)
      .all();

    const boundSpells = bindingsResult.results.map((row: any) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      school: row.school,
      data: JSON.parse(row.data)
    }));

    return jsonResponse({
      ...flowData,
      publishedVersion: (row as any).version,
      publishedAt: (row as any).published_at,
      boundSpells,
      bindingsCount: boundSpells.length
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
  if (!body) return errorResponse(400, '请求体为空');
  
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
      publishedAt = body.publishedAt; // 前端已发送秒级时间戳，无需再除
    } else {
      publishedAt = (existing as any).published_at; // 数据库存储的已是秒级
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
      // 安全序列化：深度清理所有 undefined 值
      const sanitizeValue = (value: any): any => {
        if (value === undefined || value === null) {
          return null;
        }
        
        if (Array.isArray(value)) {
          return value
            .map(item => sanitizeValue(item))
            .filter(item => item !== null);
        }
        
        if (typeof value === 'object' && value !== null) {
          const result: any = {};
          for (const [key, val] of Object.entries(value)) {
            if (val !== undefined) {
              result[key] = sanitizeValue(val);
            }
          }
          return result;
        }
        
        return value;
      };
      
      // 深度清理整个 flow 对象
      const sanitizedFlowData = sanitizeValue(flowData);
     
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

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}
