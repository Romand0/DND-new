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
       // 数据验证：确保数据结构和类型正确
       const validateFlowData = (data: any): { valid: boolean; errors: string[] } => {
         const errors: string[] = [];
         
         // 检查必填字段
         if (!data.name || typeof data.name !== 'string') {
           errors.push('name 字段必填且必须是字符串');
         }
         
         // 检查时间戳类型
         if (data.publishedAt !== undefined && typeof data.publishedAt !== 'number') {
           errors.push('publishedAt 必须是数字类型（秒级时间戳）');
         }
         
         // 检查 nodes 数组
         if (!Array.isArray(data.nodes)) {
           errors.push('nodes 必须是数组');
         } else {
           // 验证每个节点
           data.nodes.forEach((node, index) => {
             if (!node || typeof node !== 'object') {
               errors.push(`nodes[${index}] 必须是对象`);
               return;
             }
             
             if (!node.id || typeof node.id !== 'string') {
               errors.push(`nodes[${index}].id 必填且必须是字符串`);
             }
             
             if (!node.type || typeof node.type !== 'string') {
               errors.push(`nodes[${index}].type 必填且必须是字符串`);
             }
             
             if (!node.label || typeof node.label !== 'string') {
               errors.push(`nodes[${index}].label 必填且必须是字符串`);
             }
             
             if (!node.position || typeof node.position !== 'object') {
               errors.push(`nodes[${index}].position 必须是对象`);
             } else {
               // 验证位置对象
               if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
                 errors.push(`nodes[${index}].position 必须包含数字类型的 x 和 y 坐标`);
               }
             }
             
             // 验证 config 对象（如果存在）
             if (node.config !== undefined && node.config !== null && typeof node.config !== 'object') {
               errors.push(`nodes[${index}].config 必须是对象或 undefined`);
             }
           });
         }
         
         // 检查 edges 数组
         if (!Array.isArray(data.edges)) {
           errors.push('edges 必须是数组');
         } else {
           // 验证每条边
           data.edges.forEach((edge, index) => {
             if (!edge || typeof edge !== 'object') {
               errors.push(`edges[${index}] 必须是对象`);
               return;
             }
             
             if (!edge.id || typeof edge.id !== 'string') {
               errors.push(`edges[${index}].id 必填且必须是字符串`);
             }
             
             if (!edge.from || typeof edge.from !== 'string') {
               errors.push(`edges[${index}].from 必填且必须是字符串`);
             }
             
             if (!edge.to || typeof edge.to !== 'string') {
               errors.push(`edges[${index}].to 必填且必须是字符串`);
             }
             
             if (!edge.trigger || typeof edge.trigger !== 'string') {
               errors.push(`edges[${index}].trigger 必填且必须是字符串`);
             }
             
             // 验证 dataMap 对象（如果存在）
             if (edge.dataMap !== undefined && edge.dataMap !== null && typeof edge.dataMap !== 'object') {
               errors.push(`edges[${index}].dataMap 必须是对象或 undefined`);
             }
             
             // 验证条件字符串（如果存在）
             if (edge.condition !== undefined && typeof edge.condition !== 'string') {
               errors.push(`edges[${index}].condition 必须是字符串或 undefined`);
             }
           });
         }
         
         // 检查其他必填字段
         if (!data.category || typeof data.category !== 'string') {
           errors.push('category 必填且必须是字符串');
         }
         
         if (!data.description || typeof data.description !== 'string') {
           errors.push('description 必填且必须是字符串');
         }
         
         if (!data.status || typeof data.status !== 'string') {
           errors.push('status 必填且必须是字符串');
         }
         
         return { valid: errors.length === 0, errors };
       };
       
       // 执行数据验证
       const validation = validateFlowData(flowData);
       if (!validation.valid) {
         console.error('数据验证失败:', validation.errors);
         return errorResponse(400, `数据验证失败: ${validation.errors.join(', ')}`);
       }
       
       console.log('数据验证通过');
       
        // 安全序列化：深度清理所有 undefined 值
       const sanitizeValue = (value: any, fieldPath: string = ''): any => {
         // 基础类型处理
         if (value === undefined || value === null) {
           // 记录 undefined 值清理信息
           console.log(`清理 undefined 值: ${fieldPath}`);
           return null;
         }
         
         if (Array.isArray(value)) {
           return value
             .map((item, index) => sanitizeValue(item, `${fieldPath}[${index}]`))
             .filter(item => item !== null);
         }
         
         if (typeof value === 'object' && value !== null) {
           const result: any = {};
           for (const [key, val] of Object.entries(value)) {
             if (val !== undefined) {
               result[key] = sanitizeValue(val, `${fieldPath}.${key}`);
             } else {
               // 记录 undefined 字段清理信息
               console.log(`清理 undefined 字段: ${fieldPath}.${key}`);
             }
           }
           return result;
         }
         
         return value;
       };
       
       // 深度清理整个 flow 对象
       console.log('开始深度清理数据...');
       const sanitizedFlowData = sanitizeValue(flowData);
       console.log('深度清理完成');
      
      const serializedData = JSON.stringify(sanitizedFlowData);
     
    // 数据类型转换和最终验证
    const finalFlowData = {
      ...sanitizedFlowData,
      publishedAt: typeof sanitizedFlowData.publishedAt === 'number' ? sanitizedFlowData.publishedAt : timestamp,
      version: typeof sanitizedFlowData.version === 'number' ? sanitizedFlowData.version : 1,
      bindingsCount: typeof sanitizedFlowData.bindingsCount === 'number' ? sanitizedFlowData.bindingsCount : 0,
    };
    
    console.log('最终处理后的数据:', finalFlowData);
     
    await env.DB.prepare(
      `INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, category=excluded.category, version=excluded.version,
       data=excluded.data, published_at=excluded.published_at, updated_at=excluded.updated_at`
    ).bind(
      params.id, 
      finalFlowData.name || '', 
      finalFlowData.category || 'custom', 
      nextVersion,
      serializedData,
      finalFlowData.publishedAt,
      timestamp,
      existing ? (existing as any).created_at : timestamp
    ).run();
    
     console.log('发布成功');
     
     // 发布成功后，清除关联草稿（工位清空）
     try {
       await env.DB.prepare('DELETE FROM flow_drafts WHERE parent_id = ?')
         .bind(params.id).run();
       console.log('已清除关联草稿');
     } catch (e) {
       console.warn('清除草稿失败（非致命）:', e);
     }
     
     return jsonResponse(finalFlowData);
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
