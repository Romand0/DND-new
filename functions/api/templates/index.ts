// NPC 模板（怪物图鉴）列表：GET 全量读取（登录用户）、POST 单条/批量写入（DM）
// 批量路径服务于 421 条种子的一次性上云；body.overwrite=true 时按 template_id upsert
// （种子解析修复后刷新云端已存在的行，自定义模板 templateId 不在批次内即不受影响）
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
  // 两种入参：数组（普通批量）/ { overwrite, items }（种子覆盖刷新）
  const overwrite = body && !Array.isArray(body) && body.overwrite === true;
  const rawItems = Array.isArray(body) ? body : (Array.isArray(body?.items) ? body.items : [body]);
  const timestamp = now();
  const validItems = rawItems.filter((item: any) => item && typeof item.templateId === 'string' && item.templateId.length > 0);
  if (validItems.length === 0) {
    return errorResponse(400, '没有有效的模板数据（缺少 templateId）');
  }

  // 分组执行：D1 单语句绑定参数上限 100，每行 7 个绑定 → 每批 50 行留余量
  const stmt = env.DB.prepare(
    overwrite
      ? `INSERT INTO npc_templates (id, template_id, name, cr, creature_type, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(template_id) DO UPDATE SET
           name = excluded.name, cr = excluded.cr, creature_type = excluded.creature_type,
           data = excluded.data, updated_at = excluded.updated_at`
      : 'INSERT OR IGNORE INTO npc_templates (id, template_id, name, cr, creature_type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
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
    return jsonResponse({ count: inserted, overwrite });
  } catch (e: any) {
    return errorResponse(500, `批量导入失败: ${e.message || '未知数据库错误'}`);
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
