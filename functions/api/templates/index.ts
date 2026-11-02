// NPC 模板（怪物图鉴）列表：GET 团组作用域读取（规则书集 ∪ 本团组私有）、POST 单条/批量写入（DM）
// 批量路径服务于 421 条种子的一次性上云；body.overwrite=true 时按 template_id upsert
// （种子解析修复后刷新云端已存在的行，自定义模板 templateId 不在批次内即不受影响）
import {
  jsonResponse,
  errorResponse,
  handleOptions,
  authenticateRequest,
  readJsonBody,
  now,
  resolveLibraryScope,
  libraryFilterClause,
  publicLibraryClause,
} from '../../_utils';

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;

  // 未登录（访客公开浏览）与登录无团组用户均回退公开分支：仅出版物条目
  const auth = await authenticateRequest(request, env);
  const scope = auth ? await resolveLibraryScope(request, env, auth) : null;

  try {
    const { clause, binds } = scope
      ? libraryFilterClause(scope, "json_extract(data, '$.source')")
      : publicLibraryClause();
    const result = await env.DB
      .prepare(`SELECT id, name, template_id, cr, creature_type, data, campaign_id, updated_at FROM npc_templates ${clause} ORDER BY name ASC`)
      .bind(...binds)
      .all();
    const items = result.results.map((row: any) => {
      const parsed = JSON.parse(row.data);
      if (parsed.campaignId === undefined && row.campaign_id) parsed.campaignId = row.campaign_id;
      return parsed;
    });
    return jsonResponse(items);
  } catch (e: any) {
    return errorResponse(500, e.message || '数据库查询失败');
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return errorResponse(401, 'Missing or invalid Authorization header');
  }
  const scope = await resolveLibraryScope(request, env, auth);
  if (!scope) {
    return errorResponse(403, '非该团组成员');
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

  // 分组执行：D1 单语句绑定参数上限 100，每行 9 个绑定 → 每批 50 行留余量
  const stmt = env.DB.prepare(
    overwrite
      ? `INSERT INTO npc_templates (id, template_id, name, cr, creature_type, data, campaign_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(template_id) DO UPDATE SET
           name = excluded.name, cr = excluded.cr, creature_type = excluded.creature_type,
           data = excluded.data, campaign_id = excluded.campaign_id, updated_at = excluded.updated_at`
      : 'INSERT OR IGNORE INTO npc_templates (id, template_id, name, cr, creature_type, data, campaign_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  let inserted = 0;
  try {
    for (let i = 0; i < validItems.length; i += 50) {
      const chunk = validItems.slice(i, i + 50);
      const binds = chunk.map((item: any) => {
        const itemData = { ...item, createdAt: item.createdAt || timestamp, updatedAt: timestamp };
        let ownerId: string | null = scope.ctx.campaignId;
        if (item.campaignId === null) {
          if (!auth.isAdmin) {
            return null;
          }
          ownerId = null;
        }
        itemData.campaignId = ownerId;
        return stmt.bind(
          item.id || crypto.randomUUID(),
          item.templateId,
          item.name || '',
          item.cr || '',
          item.type || item.creatureType || '',
          JSON.stringify(itemData),
          ownerId,
          item.createdAt || timestamp,
          timestamp,
        );
      });
      if (binds.some((b) => b === null)) {
        return errorResponse(403, '出版物条目仅站点管理员可创建');
      }
      await env.DB.batch(binds);
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
