// functions/_utils.ts

export interface Env {
  DB: D1Database;
  DM_TOKEN: string;
  JWT_SECRET: string;
}

// ---------- HTTP 响应工具 ----------

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// 错误响应：历史上大量调用点写成了反序 (message, status)（132 处），与定义 (status, message)（24 处）并存。
// 反序调用会把字符串传进 Response 的 status，构造器抛 RangeError 后若处于 catch 内再次反序调用，
// 将形成双重异常无人接住 → Cloudflare Pages 返回裸 500（无 JSON 体）。
// 此处按运行时类型判别归一两种顺序；新代码请按 (status, message) 调用。
export function errorResponse(a: unknown, b: unknown): Response {
  const status = typeof a === 'number' ? a : typeof b === 'number' ? b : 500;
  const message = typeof a === 'string' ? a : typeof b === 'string' ? b : '请求失败';
  return jsonResponse({ error: message }, status);
}

export function handleOptions(request?: Request): Response {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  return new Response(null, { status: 405 });
}

// ---------- DM Token 验证（兼容旧逻辑） ----------

export function verifyDmToken(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === env.DM_TOKEN;
}

// ---------- 统一认证（JWT 优先，DM_TOKEN 应急兜底） ----------
// 用于写端点（POST/PUT/DELETE）。
// 站点操作权限只看账号的 is_admin，与游戏身份 role（dm/player）解耦；
// DM_TOKEN 仅作为无管理员账号时的服务端应急通道，前端不再使用。

export interface AuthIdentity {
  sub: string;
  /** 游戏身份：dm / player，仅作角色扮演层面的标识 */
  role: string;
  /** 站点管理员：拥有编辑与后台管理权限 */
  isAdmin: boolean;
}

export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthIdentity | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  // 先试 JWT
  let payload: { sub: string; role: string } | null = null;
  try {
    const jwtSecret = env.JWT_SECRET || 'cmy090907cmy090907cmy090907';
    payload = await verifyJwt(token, jwtSecret);
  } catch {
    payload = null;
  }

  if (payload) {
    // 以数据库为准：管理员授予/撤销立即生效，不依赖 7 天有效的 JWT 快照
    // 团组身份权威源 = campaign_members.role（getCampaignContext 查询），users.role 全局列已停读
    try {
      const row = await env.DB
        .prepare('SELECT is_admin FROM users WHERE id = ?')
        .bind(payload.sub)
        .first<{ is_admin: number }>();
      if (row) {
        return { sub: payload.sub, role: 'player', isAdmin: row.is_admin === 1 };
      }
      // 账号已被删除：保留非管理员身份，写操作会被拒绝
      return { sub: payload.sub, role: 'player', isAdmin: false };
    } catch {
      // 数据库瞬时异常或未执行 0009 迁移：退回 JWT 快照，兼容旧 role=dm 管理员
      return { sub: payload.sub, role: payload.role, isAdmin: payload.role === 'dm' };
    }
  }

  // 再试 DM_TOKEN（应急）
  if (env.DM_TOKEN && token === env.DM_TOKEN) {
    return { sub: 'dm-token-user', role: 'dm', isAdmin: true };
  }

  return null;
}

// ---------- JWT 工具 ----------

export async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + 604800 }; // 7天有效期

  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));

  const signatureInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signatureInput));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${signatureInput}.${signatureB64}`;
}

export async function verifyJwt(token: string, secret: string): Promise<{ sub: string; role: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerB64, payloadB64, signatureB64] = parts;

  const encoder = new TextEncoder();
  const signatureInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const expectedSignature = base64UrlDecode(signatureB64);
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    expectedSignature,
    encoder.encode(signatureInput)
  );
  if (!isValid) throw new Error('Invalid signature');

  const payloadJson = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  
  const now = Math.floor(Date.now() / 1000);
  if (payloadJson.exp && payloadJson.exp < now) {
    throw new Error('Token expired');
  }

  return { sub: payloadJson.sub, role: payloadJson.role };
}

// ---------- 密码工具 ----------

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const salted = new Uint8Array([...salt, ...encoder.encode(password)]);
  const hashBuffer = await crypto.subtle.digest('SHA-256', salted);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const salted = new Uint8Array([...salt, ...encoder.encode(password)]);

  const hashBuffer = await crypto.subtle.digest('SHA-256', salted);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return computedHash === hashHex;
}
// ---------- 团组上下文 ----------
// 团组是顶层组织单元：一场跑团战役的数据容器（角色卡/战斗/宝藏/笔记/沙盘/日历/时间均归属团组，
// 图鉴四库按团组规则书集筛选出版物条目 ∪ 本团组自定义条目）。流程库与账号体系保持团组无关。

export const DEFAULT_CAMPAIGN_ID = 'campaign-default';

export interface CampaignContext {
  campaignId: string;
  role: 'dm' | 'player';
  rulebooks: string[];
}

/**
 * 从 X-Campaign-Id 头解析团组并校验请求账号为该团组成员。
 * 头缺失时回退默认团组（存量客户端兼容）；非成员返回 null，调用方据此 403。
 */
export async function getCampaignContext(
  request: Request,
  env: Env,
  auth: AuthIdentity
): Promise<CampaignContext | null> {
  const headerId = request.headers.get('X-Campaign-Id');
  const campaignId = headerId || DEFAULT_CAMPAIGN_ID;
  // 单次 JOIN 同时取成员角色与规则书集（每团组请求省一次 D1 往返）
  let member = await env.DB
    .prepare(
      'SELECT m.role, c.rulebooks FROM campaign_members m JOIN campaigns c ON c.id = m.campaign_id WHERE m.campaign_id = ? AND m.user_id = ?'
    )
    .bind(campaignId, auth.sub)
    .first<{ role: string; rulebooks: string }>();
  // 默认团组成员缺失自愈：0012 批量回填可能未执行/遗漏，登录用户首次访问默认团组时按需登记
  // （幂等 INSERT OR IGNORE，与回填语义一致：管理员=DM、其余=player）。其他团组必须凭邀请码加入。
  let rulebooks: string[] = [];
  if (!member && campaignId === DEFAULT_CAMPAIGN_ID) {
    const campExists = await env.DB
      .prepare('SELECT rulebooks FROM campaigns WHERE id = ?')
      .bind(DEFAULT_CAMPAIGN_ID)
      .first<{ rulebooks: string }>();
    if (campExists) {
      const role = auth.isAdmin ? 'dm' : 'player';
      try {
        await env.DB
          .prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, user_id, role, joined_at) VALUES (?, ?, ?, unixepoch())')
          .bind(DEFAULT_CAMPAIGN_ID, auth.sub, role)
          .run();
        member = { role, rulebooks: campExists.rulebooks };
      } catch {
        return null;
      }
    }
  }
  if (!member) return null;
  try {
    rulebooks = JSON.parse(member.rulebooks || '[]');
  } catch {
    rulebooks = [];
  }
  return {
    campaignId,
    role: member.role === 'dm' ? 'dm' : 'player',
    rulebooks,
  };
}

/**
 * 团组作用域写操作校验：DM 或站点管理员放行；普通成员拒绝。
 * kind='proposal' 时成员放行（玩家提案单向递送通道，审批后经 DM 中转入库）。
 */
export function assertCampaignWrite(
  ctx: CampaignContext | null,
  auth: AuthIdentity,
  kind?: string
): boolean {
  if (!ctx) return false;
  if (auth.isAdmin || ctx.role === 'dm') return true;
  return kind === 'proposal';
}

// ---------- 团组图鉴库辅助（equipments/spells/character_options/npc_templates 四库共用） ----------
// 可见性 = 团组私有条目 ∪ 规则书集内出版物条目（出版物 campaign_id 恒 NULL，存储团组无关）。

export interface LibraryScope {
  ctx: CampaignContext;
  /** 全库视角（?scope=all 且站点管理员）：管理页维护出版物与全部条目用 */
  scopeAll: boolean;
}

/** 图鉴库读取作用域：团组成员校验 + scope=all 判定；非成员返回 null */
export async function resolveLibraryScope(
  request: Request,
  env: Env,
  auth: AuthIdentity
): Promise<LibraryScope | null> {
  const ctx = await getCampaignContext(request, env, auth);
  if (!ctx) return null;
  const url = new URL(request.url);
  const scopeAll = url.searchParams.get('scope') === 'all' && auth.isAdmin;
  return { ctx, scopeAll };
}

/**
 * 图鉴库列表过滤 SQL 片段。
 * sourceExpr：出版物来源字段表达式（equipments/spells/npc_templates 用 json_extract(data,'$.source')，
 * character_options 有独立 source 列）。
 * 返回 binds 依次为 [campaignId, rulebooksJson]；scopeAll 时子句为空。
 */
export function libraryFilterClause(
  scope: LibraryScope,
  sourceExpr: string
): { clause: string; binds: string[] } {
  if (scope.scopeAll) return { clause: '', binds: [] };
  return {
    // 缺 source 的无归属旧数据按「玩家手册 2014」兜底（与前端 normalizeSource 同语义）
    clause: `WHERE campaign_id = ? OR (campaign_id IS NULL AND COALESCE(${sourceExpr}, '玩家手册 2014') IN (SELECT value FROM json_each(?)))`,
    binds: [scope.ctx.campaignId, JSON.stringify(scope.ctx.rulebooks)],
  };
}

/**
 * 公开访客分支（未登录 / 登录但无团组上下文）：仅出版物条目（campaign_id IS NULL）。
 * 出版物为全局共享资料（玩家手册 2014 / 怪物图鉴 2014 等），对所有人只读开放。
 */
export function publicLibraryClause(): { clause: string; binds: string[] } {
  return { clause: 'WHERE campaign_id IS NULL', binds: [] };
}

/** 单条目可读：出版物条目全员可见；私有条目仅归属团组成员；全库视角任意 */
export function canReadEntry(scope: LibraryScope, entryCampaignId: string | null): boolean {
  if (scope.scopeAll) return true;
  if (entryCampaignId === null || entryCampaignId === '') return true;
  return entryCampaignId === scope.ctx.campaignId;
}

/**
 * 条目写权限：
 *  · 新建/修改归属为本团组的条目 → 团组 DM 或站点管理员
 *  · 出版物条目（归属 NULL）的修改/删除、跨团组转移归属 → 仅站点管理员（出版物全局共享）
 */
export function canWriteEntry(
  scope: LibraryScope,
  auth: AuthIdentity,
  entryCampaignId: string | null
): boolean {
  if (auth.isAdmin) return true;
  if (scope.ctx.role !== 'dm') return false;
  return entryCampaignId === scope.ctx.campaignId;
}

/** 新条目归属判定：body 显式 campaignId === null 表示出版物条目（需站点管理员），否则当前团组私有 */
export function resolveNewEntryCampaignId(
  scope: LibraryScope,
  auth: AuthIdentity,
  bodyCampaignId: unknown
): string | null {
  if (bodyCampaignId === null) {
    if (!auth.isAdmin) throw new Error('出版物条目仅站点管理员可创建');
    return null;
  }
  return scope.ctx.campaignId;
}

// ---------- 请求体解析工具 ----------

export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

export function now(): number {
  return Math.floor(Date.now() / 1000); // 返回秒级时间戳，与数据库字段类型匹配
}

// ---------- Base64 URL 工具 ----------

function base64UrlEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
