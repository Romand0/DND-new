// 批量处理流程 API
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../../_utils';

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  if (auth.role !== 'dm') return errorResponse(403, '需要 DM 权限');

  const { action, data } = await readJsonBody(request);
  if (!action || !data || !Array.isArray(data)) {
    return errorResponse(400, '请求格式错误：需要 action 和 data 数组');
  }

  const timestamp = now();
  const results: any[] = [];

  try {
    switch (action) {
      case 'create':
        // 批量创建流程
        for (const flow of data) {
          const validation = validateFlowData(flow);
          if (!validation.valid) {
            results.push({ success: false, flow: flow.name, error: validation.errors.join(', ') });
            continue;
          }

          const existing = await env.DB.prepare('SELECT id FROM flows WHERE id = ?').bind(flow.id).first();
          if (existing) {
            results.push({ success: false, flow: flow.name, error: '流程 ID 已存在' });
            continue;
          }

          await env.DB.prepare(`
            INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            flow.id,
            flow.name,
            flow.category || 'custom',
            flow.version || 1,
            JSON.stringify(flow),
            timestamp,
            timestamp,
            timestamp
          ).run();

          results.push({ success: true, flow: flow.name });
        }
        break;

      case 'update':
        // 批量更新流程
        for (const flow of data) {
          const validation = validateFlowData(flow);
          if (!validation.valid) {
            results.push({ success: false, flow: flow.name, error: validation.errors.join(', ') });
            continue;
          }

          const existing = await env.DB.prepare('SELECT version FROM flows WHERE id = ?').bind(flow.id).first();
          if (!existing) {
            results.push({ success: false, flow: flow.name, error: '流程不存在' });
            continue;
          }

          const nextVersion = (existing as any).version + 1;
          await env.DB.prepare(`
            UPDATE flows 
            SET name = ?, category = ?, version = ?, data = ?, updated_at = ?
            WHERE id = ?
          `).bind(
            flow.name,
            flow.category || 'custom',
            nextVersion,
            JSON.stringify(flow),
            timestamp,
            flow.id
          ).run();

          results.push({ success: true, flow: flow.name, version: nextVersion });
        }
        break;

      case 'delete':
        // 批量删除流程
        for (const flowId of data) {
          await env.DB.prepare('DELETE FROM flows WHERE id = ?').bind(flowId).run();
          results.push({ success: true, flow: flowId });
        }
        break;

      default:
        return errorResponse(400, '不支持的操作类型');
    }

    return jsonResponse({ 
      success: true, 
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    console.error('批量处理失败:', error);
    return errorResponse(500, `批量处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export function onRequestOptions(context: any): Response {
  return handleOptions(context.request);
}

// 数据验证函数
function validateFlowData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.id || typeof data.id !== 'string') {
    errors.push('id 字段必填且必须是字符串');
  }
  
  if (!data.name || typeof data.name !== 'string') {
    errors.push('name 字段必填且必须是字符串');
  }
  
  if (!Array.isArray(data.nodes)) {
    errors.push('nodes 必须是数组');
  }
  
  if (!Array.isArray(data.edges)) {
    errors.push('edges 必须是数组');
  }
  
  return { valid: errors.length === 0, errors };
}