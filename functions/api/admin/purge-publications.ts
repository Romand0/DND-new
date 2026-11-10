// functions/api/admin/purge-publications.ts
// 清理云端出版物行（campaign_id IS NULL），仅站点管理员。
// 图鉴三库（装备/怪物/选项）改为「仓库种子基线 + 云端仅存增改」后，
// D1 里的出版物全量行不再需要（种子驻留 public/seed/）。
//
// GET  ?kind=equipments|monsters|options|all   预览计数（不删）
// POST { kind, confirm: true }                 实际删除（confirm 必填防误触）
//
// 顺序约束（前端负责提示）：必须先「导出快照 → 生成种子 → 发布」，再执行清理；
// 否则云端删了、仓库还没有，期间图鉴会空。清理幂等，重复执行删除 0 行。
import { jsonResponse, errorResponse, handleOptions, authenticateRequest, readJsonBody } from '../../_utils';

interface Env {
  DB: D1Database;
  DM_TOKEN: string;
  JWT_SECRET: string;
}

type Kind = 'equipments' | 'monsters' | 'options' | 'all';

const TABLE_BY_KIND: Record<Exclude<Kind, 'all'>, string> = {
  equipments: 'equipments',
  monsters: 'npc_templates',
  options: 'character_options',
};

const KINDS: Exclude<Kind, 'all'>[] = ['equipments', 'monsters', 'options'];

function normalizeKind(raw: unknown): Kind | null {
  if (raw === 'all' || raw === undefined || raw === null || raw === '') return 'all';
  if (raw === 'equipments' || raw === 'monsters' || raw === 'options') return raw;
  return null;
}

async function countPublications(env: Env, kind: Kind): Promise<Record<string, number>> {
  const targets = kind === 'all' ? KINDS : [kind];
  const counts: Record<string, number> = {};
  for (const k of targets) {
    const table = TABLE_BY_KIND[k];
    const row = await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE campaign_id IS NULL`)
      .first<{ c: number }>();
    counts[k] = row?.c ?? 0;
  }
  return counts;
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录或凭证无效');
  if (!auth.isAdmin) return errorResponse(403, '需要站点管理员权限');

  const url = new URL(request.url);
  const kind = normalizeKind(url.searchParams.get('kind'));
  if (!kind) return errorResponse(400, '无效的 kind，仅支持 equipments / monsters / options / all');

  try {
    const counts = await countPublications(env, kind);
    return jsonResponse({ kind, counts });
  } catch (e: any) {
    return errorResponse(500, e?.message || '统计失败');
  }
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;
  const auth = await authenticateRequest(request, env);
  if (!auth) return errorResponse(401, '未登录或凭证无效');
  if (!auth.isAdmin) return errorResponse(403, '需要站点管理员权限');

  const body = await readJsonBody<{ kind?: string; confirm?: boolean }>(request);
  const kind = normalizeKind(body?.kind);
  if (!kind) return errorResponse(400, '无效的 kind，仅支持 equipments / monsters / options / all');
  if (body?.confirm !== true) {
    return errorResponse(400, '删除出版物行需要显式确认（confirm: true）');
  }

  try {
    const before = await countPublications(env, kind);
    const deleted: Record<string, number> = {};
    const targets = kind === 'all' ? KINDS : [kind];
    for (const k of targets) {
      const table = TABLE_BY_KIND[k];
      const res = await env.DB
        .prepare(`DELETE FROM ${table} WHERE campaign_id IS NULL`)
        .run();
      deleted[k] = res?.meta?.changes ?? 0;
    }
    return jsonResponse({ kind, before, deleted });
  } catch (e: any) {
    return errorResponse(500, e?.message || '清理失败');
  }
}

export async function onRequestOptions(): Promise<Response> {
  return handleOptions();
}
