import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
} from '../../_utils';
import { STORY_KIND, collectSceneIds } from './_shared';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

function parsePayload(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 场景最近经济记录候选：DM 挂载账本时挑选源记录用 */
export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const sceneId = new URL(request.url).searchParams.get('sceneId') || '';
  if (!sceneId) return errorResponse(400, '缺少 sceneId');

  try {
    const arcs = await env.DB
      .prepare('SELECT data FROM campaign_artifacts WHERE campaign_id = ? AND kind = ?')
      .bind(ctx.campaignId, STORY_KIND)
      .all();
    let rosterIds: string[] = [];
    let found = false;
    for (const row of arcs.results || []) {
      try {
        const arc = JSON.parse((row as any).data);
        if (!collectSceneIds(arc).includes(sceneId)) continue;
        found = true;
        for (const ch of arc.chapters || []) {
          for (const sc of ch.scenes || []) {
            if (sc.id === sceneId) rosterIds = (sc.roster?.characterIds ?? []).filter(Boolean);
          }
        }
      } catch {
        // 损坏数据跳过
      }
    }
    if (!found) return errorResponse(404, '场景不存在');

    if (rosterIds.length === 0) {
      const chars = await env.DB
        .prepare('SELECT id FROM characters WHERE campaign_id = ?')
        .bind(ctx.campaignId)
        .all();
      rosterIds = (chars.results || []).map((r: any) => r.id);
    }

    let logs: any[] = [];
    if (rosterIds.length) {
      const rows = await env.DB
        .prepare(
          `SELECT id, character_id, category, kind, title, source, detail, created_at
           FROM character_logs WHERE campaign_id = ? AND character_id IN (${placeholders(rosterIds.length)})
           ORDER BY created_at DESC LIMIT 80`
        )
        .bind(ctx.campaignId, ...rosterIds)
        .all();
      logs = (rows.results || []).map((r: any) => {
        let sourceKind = 'item';
        if (r.category === 'spell') sourceKind = 'spell';
        else if (r.category === 'growth') sourceKind = 'growth';
        if (r.source === 'treasure' || String(r.detail ?? '').includes('treasureId')) sourceKind = 'treasure';
        return {
          kind: 'log',
          id: r.id,
          characterId: r.character_id,
          title: r.title,
          category: r.category,
          logKind: r.kind,
          sourceKind,
          createdAt: r.created_at,
        };
      });
    }

    const checkRows = await env.DB
      .prepare(
        `SELECT id, payload, created_at FROM table_messages
         WHERE campaign_id = ? AND type = 'check_request'
         ORDER BY created_at DESC LIMIT 40`
      )
      .bind(ctx.campaignId)
      .all();
    const allowed = new Set(rosterIds);
    const checks = (checkRows.results || [])
      .map((r: any) => {
        const payload = parsePayload(r.payload);
        return {
          kind: 'check',
          id: r.id,
          characterId: payload.characterId,
          title: `${payload.checkLabel ?? '检定'}（${payload.characterName ?? '角色'}）`,
          category: 'check',
          sourceKind: 'check',
          createdAt: r.created_at,
        };
      })
      .filter((c: any) => !c.characterId || allowed.has(c.characterId));

    return jsonResponse({ logs, checks });
  } catch (e: any) {
    return errorResponse(500, e.message || '候选查询失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
