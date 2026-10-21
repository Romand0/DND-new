// NPC 模板（怪物图鉴）列表：GET 全量读取（登录用户）、POST 单条/批量写入（DM）
// 批量路径服务于 421 条种子的一次性上云（INSERT OR IGNORE + template_id 唯一约束 = 幂等）
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody, now } from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { env } = context;
  try {
    const result = await env.DB
      .prepare('SELECT id, name, template_id, cr, creature_type, data, updated_at FROM npc_templates ORDER BY name ASC')
      .all();
    const items = result.results.map((row: any) => JSON.parse(row.data));
    return jsonResponse(items);
  } catch (e: any) {
    return errorResponse(e.message || '数据库查询失败', 500);
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  if (!auth.isAdmin) {
    return errorResponse(403, '需要站点管理员权限');
  }

  const body = await readJsonBody(request);
  const items = Array.isArray(body) ? body : [body];
  const timestamp = now();
  const validItems = items.filter((item: any) => item && typeof item.templateId === 'string' && item.templateId.length > 0);
  if (validItems.length === 0) {
    return errorResponse(400, '没有有效的模板数据（缺少 templateId）');
  }

  // 分组执行：D1 单语句绑定参数上限 100，每行 7 个绑定 → 每批 50 行留余量
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO npc_templates (id, template_id, name, cr, creature_type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  let inserted = 0;
  try {
    for (let i = 0; i < validItems.length; i += 50) {
      const chunk = validItems.slice(i, i + 50);
      await env.DB.batch(chunk.map((item: any) => {
        const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
        return stmt.bind(
          item.id || crypto.randomUUID(),
          item.templateId,
          item.name || '',
          item.cr || '',
          item.type || item.creatureType || '',
          JSON.stringify(itemData),
          item.createdAt || timestamp,
          timestamp,
        );
      }));
      inserted += chunk.length;
    }
    return jsonResponse({ count: inserted });
  } catch (e: any) {
    return errorResponse(500, `批量导入失败: ${e.message || '未知数据库错误'}`);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
