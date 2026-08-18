// 数据库连接测试端点
import { jsonResponse, errorResponse, authenticateRequest } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  
  try {
    // 测试数据库连接
    const result = await env.DB.prepare('SELECT 1 as test').first();
    if (result) {
      return jsonResponse({ 
        status: 'ok', 
        message: '数据库连接正常',
        timestamp: Date.now()
      });
    } else {
      return errorResponse(500, '数据库连接测试失败');
    }
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    return errorResponse(500, `数据库连接测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}