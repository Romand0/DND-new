// 战役级经济回顾：把本团组所有账本索引聚合成带场景/场次/游戏时间元数据的时间线。
// 玩家仍按绑定角色过滤，与单场景账本口径一致。
import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
} from '../../_utils';
import {
  STORY_KIND,
  buildSceneIndex,
  enrichTimelineEntries,
  buildLedgerEntries,
} from './_shared';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

async function loadRows(env: any, sql: string, binds: any[]): Promise<any[]> {
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return result.results || [];
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) return errorResponse(403, '非该团组成员');

  try {
    const arcRows = await loadRows(
      env,
      'SELECT data FROM campaign_artifacts WHERE campaign_id = ? AND kind = ?',
      [ctx.campaignId, STORY_KIND]
    );
    const arcs = arcRows
      .map((row: any) => {
        try {
          return JSON.parse(row.data);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const sceneIndex = buildSceneIndex(arcs);

    let links = await loadRows(
      env,
      'SELECT * FROM story_ledger_links WHERE campaign_id = ? ORDER BY occurred_at ASC, created_at ASC',
      [ctx.campaignId]
    );

    const isDm = auth.isAdmin || ctx.role === 'dm';
    if (!isDm) {
      const bound = await loadRows(
        env,
        'SELECT character_id FROM user_characters WHERE user_id = ?',
        [auth.sub]
      );
      const allowed = new Set(bound.map((r: any) => r.character_id));
      links = links.filter((l: any) => l.character_id && allowed.has(l.character_id));
    }

    const checkIds = links.filter((l: any) => l.source_kind === 'check').map((l: any) => l.source_id);
    const logIds = links.filter((l: any) => l.source_kind !== 'check').map((l: any) => l.source_id);

    const checkRequests = new Map<string, any>();
    const checkResults = new Map<string, any>();
    const logs = new Map<string, any>();

    if (checkIds.length) {
      const reqRows = await loadRows(
        env,
        `SELECT * FROM table_messages WHERE campaign_id = ? AND id IN (${placeholders(checkIds.length)})`,
        [ctx.campaignId, ...checkIds]
      );
      for (const row of reqRows) checkRequests.set(row.id, row);
      const resRows = await loadRows(
        env,
        `SELECT * FROM table_messages WHERE campaign_id = ? AND reply_message_id IN (${placeholders(checkIds.length)})`,
        [ctx.campaignId, ...checkIds]
      );
      for (const row of resRows) checkResults.set(row.reply_message_id, row);
    }

    if (logIds.length) {
      const logRows = await loadRows(
        env,
        `SELECT * FROM character_logs WHERE campaign_id = ? AND id IN (${placeholders(logIds.length)})`,
        [ctx.campaignId, ...logIds]
      );
      for (const row of logRows) logs.set(row.id, row);
    }

    const entries = buildLedgerEntries(links, { checkRequests, checkResults, logs });
    return jsonResponse({ entries: enrichTimelineEntries(entries, sceneIndex) });
  } catch (e: any) {
    return errorResponse(500, e.message || '回顾查询失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
