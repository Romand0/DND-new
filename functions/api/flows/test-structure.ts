// 数据库结构和连接测试端点
import { jsonResponse, errorResponse, authenticateRequest } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未授权');
  
  try {
    // 测试数据库连接
    const result = await env.DB.prepare('SELECT 1 as test').first();
    if (!result) {
      return errorResponse(500, '数据库连接测试失败');
    }
    
    // 检查 flows 表是否存在
    const tableCheck = await env.DB.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='flows'
    `).first();
    
    if (!tableCheck) {
      return errorResponse(500, 'flows 表不存在');
    }
    
    // 检查表结构
    const columns = await env.DB.prepare(`
      PRAGMA table_info(flows)
    `).all();
    
    const columnNames = columns.results.map((col: any) => col.name);
    const requiredColumns = ['id', 'name', 'category', 'version', 'data', 'published_at', 'updated_at', 'created_at'];
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      return errorResponse(500, `缺少必要的字段: ${missingColumns.join(', ')}`);
    }
    
    // 检查数据类型
    const sampleData = {
      id: 'test-' + Date.now(),
      name: '测试流程',
      category: 'test',
      version: 1,
      data: JSON.stringify({ test: 'data' }),
      published_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      created_at: Math.floor(Date.now() / 1000),
    };
    
    // 插入测试数据
    const insertResult = await env.DB.prepare(`
      INSERT INTO flows (id, name, category, version, data, published_at, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sampleData.id,
      sampleData.name,
      sampleData.category,
      sampleData.version,
      sampleData.data,
      sampleData.published_at,
      sampleData.updated_at,
      sampleData.created_at
    ).run();
    
    if (!insertResult.success) {
      return errorResponse(500, '插入测试数据失败');
    }
    
    // 查询测试数据
    const queryResult = await env.DB.prepare(`
      SELECT * FROM flows WHERE id = ?
    `).bind(sampleData.id).first();
    
    if (!queryResult) {
      return errorResponse(500, '查询测试数据失败');
    }
    
    // 清理测试数据
    await env.DB.prepare(`
      DELETE FROM flows WHERE id = ?
    `).bind(sampleData.id).run();
    
    return jsonResponse({ 
      status: 'ok', 
      message: '数据库连接和表结构正常',
      timestamp: Date.now(),
      tableInfo: {
        columns: columnNames,
        rowCount: columns.results.length
      }
    });
    
  } catch (error) {
    console.error('数据库结构测试失败:', error);
    return errorResponse(500, `数据库结构测试失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}