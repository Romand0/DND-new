import {
  authenticateRequest,
  errorResponse,
  getCampaignContext,
  jsonResponse,
  handleOptions,
  readJsonBody,
  now,
} from '../../_utils';
import {
  STORY_KIND,
  isLedgerSourceKind,
  collectSceneIds,
  buildLedgerEntries,
  summarizeLedger,
} from './_shared';

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

async function loadRows(env: any, sql: string, binds: any[]): Promise<any[]> {
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return result.results || [];
}

async function sceneBelongsToCampaign(env: any, campaignId: string, sceneId: string): Promise<boolean> {
  const rows = await loadRows(
    env,
    'SELECT data FROM campaign_artifacts WHERE campaign_id = ? AND kind = ?',
    [campaignId, STORY_KIND]
  );
  for (const row of rows) {
    try {
      if (collectSceneIds(JSON.parse(row.data)).includes(sceneId)) return true;
    } catch {
      // 损坏数据跳过
    }
  }
  return false;
}

async function characterInCampaign(env: any, campaignId: string, characterId: string): Promise<boolean> {
  const row = await env.DB
    .prepare('SELECT 1 AS ok FROM characters WHERE campaign_id = ? AND id = ?')
    .bind(campaignId, characterId)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

async function resolveCheckCharacter(env: any, campaignId: string, messageId: string): Promise<string | null> {
  const row = await env.DB
    .prepare('SELECT payload FROM table_messages WHERE campaign_id = ? AND id = ?')
    .bind(campaignId, messageId)
    .first<{ payload: string }>();
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload);
    return typeof payload.characterId === 'string' ? payload.characterId : null;
  } catch {
    return null;
  }
}

/** 校验源记录存在；返回错误文案或 null */
async function sourceError(env: any, campaignId: string, kind: string, sourceId: string): Promise<string | null> {
  if (kind === 'check') {
    const row = await env.DB
      .prepare('SELECT 1 AS ok FROM table_messages WHERE campaign_id = ? AND id = ?')
      .bind(campaignId, sourceId)
      .first();
    return row ? null : '检定消息不存在';
  }
  const row = await env.DB
    .prepare('SELECT 1 AS ok FROM character_logs WHERE campaign_id = ? AND id = ?')
    .bind(campaignId, sourceId)
    .first();
  return row ? null : '角色日志不存在';
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) return errorResponse(403, '非该团组成员');

  const sceneId = new URL(request.url).searchParams.get('sceneId') || '';
  if (!sceneId) return errorResponse(400, '缺少 sceneId');

  try {
    let links = await loadRows(
      env,
      'SELECT * FROM story_ledger_links WHERE campaign_id = ? AND scene_id = ? ORDER BY occurred_at ASC, created_at ASC',
      [ctx.campaignId, sceneId]
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
    const summary = summarizeLedger(links, { logs });
    return jsonResponse({ entries, summary });
  } catch (e: any) {
    return errorResponse(500, e.message || '账本查询失败');
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const body = await readJsonBody<any>(request);
  if (!body) return errorResponse(400, '请求体为空');
  const sceneId = typeof body.sceneId === 'string' ? body.sceneId : '';
  const sourceKind = typeof body.sourceKind === 'string' ? body.sourceKind : '';
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : '';
  if (!sceneId || !sourceId) return errorResponse(400, '缺少 sceneId 或 sourceId');
  if (!isLedgerSourceKind(sourceKind)) return errorResponse(400, `未知的源类别: ${sourceKind}`);

  try {
    if (!(await sceneBelongsToCampaign(env, ctx.campaignId, sceneId))) {
      return errorResponse(400, '场景不存在或不属于当前团组');
    }
    const invalid = await sourceError(env, ctx.campaignId, sourceKind, sourceId);
    if (invalid) return errorResponse(400, invalid);

    let characterId = typeof body.characterId === 'string' ? body.characterId : '';
    if (!characterId && sourceKind === 'check') {
      characterId = (await resolveCheckCharacter(env, ctx.campaignId, sourceId)) || '';
    }
    if (characterId && !(await characterInCampaign(env, ctx.campaignId, characterId))) {
      return errorResponse(400, '角色不属于当前团组');
    }

    const ts = now();
    const link = {
      id: crypto.randomUUID(),
      campaign_id: ctx.campaignId,
      scene_id: sceneId,
      source_kind: sourceKind,
      source_id: sourceId,
      character_id: characterId || null,
      note: typeof body.note === 'string' && body.note ? body.note : null,
      occurred_at: typeof body.occurredAt === 'number' ? body.occurredAt : ts,
      created_by: auth.sub,
      created_at: ts,
    };
    await env.DB
      .prepare(
        `INSERT INTO story_ledger_links
         (id, campaign_id, scene_id, source_kind, source_id, character_id, note, occurred_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        link.id,
        link.campaign_id,
        link.scene_id,
        link.source_kind,
        link.source_id,
        link.character_id,
        link.note,
        link.occurred_at,
        link.created_by,
        link.created_at
      )
      .run();
    return jsonResponse(link, 201);
  } catch (e: any) {
    return errorResponse(500, e.message || '挂载失败');
  }
}

export async function onRequestDelete(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, 'Missing or invalid Authorization header');
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx || !(auth.isAdmin || ctx.role === 'dm')) return errorResponse(403, '需要团组 DM 权限');

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return errorResponse(400, '缺少 id');
  try {
    const result = await env.DB
      .prepare('DELETE FROM story_ledger_links WHERE campaign_id = ? AND id = ?')
      .bind(ctx.campaignId, id)
      .run();
    if (!result.meta?.changes) return errorResponse(404, '索引不存在');
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return errorResponse(500, e.message || '解除索引失败');
  }
}

export function onRequestOptions(): Response {
  return handleOptions();
}
