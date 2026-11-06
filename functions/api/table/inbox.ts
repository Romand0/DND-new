// 圆桌信箱拉取（双端共用）：按登录账号 + 游标增量拉取
// 默认拉 to_user_id = 当前账号（玩家收任务 / DM 收结果）；?outbox=1 改拉 from_user_id（DM 查发起状态）
// 游标格式 `${created_at}:${id}`，D1 无元组比较，落地为 (created_at > a) OR (created_at = a AND id > b)
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, type Env } from '../../_utils';
import { toApiMessage } from './_shared';

interface EnvWithDb extends Env {
  DB: D1Database;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function onRequestGet(context: { request: Request; env: EnvWithDb }): Promise<Response> {
  const { request, env } = context;

  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse('未登录', 401);

  const url = new URL(request.url);
  const outbox = url.searchParams.get('outbox') === '1';
  const afterRaw = url.searchParams.get('after') || '';
  const limitRaw = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;

  // 游标解析：失败（空/格式错）从头拉最近 limit 条
  let afterTs: number | null = null;
  let afterId = '';
  if (afterRaw) {
    const idx = afterRaw.indexOf(':');
    if (idx > 0) {
      const ts = parseInt(afterRaw.slice(0, idx), 10);
      if (Number.isFinite(ts) && ts > 0) {
        afterTs = ts;
        afterId = afterRaw.slice(idx + 1);
      }
    }
  }

  const column = outbox ? 'from_user_id' : 'to_user_id';
  const stmt = afterTs === null
    ? env.DB
        .prepare(
          `SELECT * FROM table_messages WHERE ${column} = ?
           ORDER BY created_at DESC, id DESC LIMIT ?`
        )
        .bind(auth.sub, limit)
    : env.DB
        .prepare(
          `SELECT * FROM table_messages WHERE ${column} = ?
             AND (created_at > ? OR (created_at = ? AND id > ?))
           ORDER BY created_at DESC, id DESC LIMIT ?`
        )
        .bind(auth.sub, afterTs, afterTs, afterId, limit);

  const result = await stmt.all<any>();
  const rows = (result.results ?? []) as any[];

  // 拉取按倒序取最近，返回给前端按时间正序排列
  const ordered = [...rows].reverse();
  const messages = ordered.map(toApiMessage);
  const last = ordered[ordered.length - 1];
  const cursor = last ? `${last.created_at}:${last.id}` : afterRaw;

  return jsonResponse({ messages, cursor });
}

export function onRequestOptions(): Response {
  return handleOptions();
}
