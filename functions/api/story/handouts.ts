// 道具列表：DM 返回全部（含已撤回）；玩家仅目标为空或含自己的未撤回道具。
import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
} from '../../_utils';
import { canViewHandout, projectHandoutRow } from './_shared';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) return errorResponse(403, '非该团组成员');

  try {
    const result = await env.DB
      .prepare('SELECT * FROM story_handouts WHERE campaign_id = ? ORDER BY created_at DESC, rowid DESC')
      .bind(ctx.campaignId)
      .all();
    const rows: any[] = result.results || [];
    const ids = rows.map(r => r.id);

    const readsById = new Map<string, any>();
    const readCounts = new Map<string, number>();
    if (ids.length) {
      const reads = await env.DB
        .prepare(`SELECT * FROM story_handout_reads WHERE handout_id IN (${placeholders(ids.length)})`)
        .bind(...ids)
        .all();
      for (const r of reads.results || []) {
        const key = String(r.handout_id);
        readCounts.set(key, (readCounts.get(key) ?? 0) + (Number(r.read_at) > 0 ? 1 : 0));
        if (r.user_id === auth.sub) readsById.set(key, r);
      }
    }

    const isDm = auth.isAdmin || ctx.role === 'dm';
    const handouts = rows
      .map(row => projectHandoutRow(row, readsById.get(row.id), readCounts.get(row.id) ?? 0))
      .filter(h => canViewHandout(h, auth.sub, isDm));
    return jsonResponse(handouts);
  } catch (e: any) {
    return errorResponse(500, e.message || '道具查询失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
