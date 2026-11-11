// API Client - 与 Cloudflare Pages Functions 后端通信
import { getCampaignId } from '@/data/campaignScope';
import type { Campaign, CampaignMember } from '@/types/campaign';
import type { ChangeRequest } from '@/types/changeRequest';

const AUTH_TOKEN_KEY = 'auth_token';
const DM_TOKEN_KEY = 'dm_token'; // 保留，兼容旧逻辑（设置页的 DM Token 验证）
const API_BASE = '/api';

// 获取账号 JWT
function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

// 获取旧 DM Token（设置页用，验证后端 DM_TOKEN 环境变量）
export function getDmToken(): string | null {
  return localStorage.getItem(DM_TOKEN_KEY);
}

export function setDmToken(token: string | null): void {
  if (token) {
    localStorage.setItem(DM_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(DM_TOKEN_KEY);
  }
}

// 账号系统登录后存 JWT
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getAuthTokenExport(): string | null {
  return getAuthToken();
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function hasAuthToken(): boolean {
  return !!getAuthToken();
}

// 请求头：优先带 JWT（账号系统），其次带 DM Token（旧设置页逻辑）
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  // 团组上下文：服务端按需读取（团组作用域端点校验成员资格与数据归属）
  headers['X-Campaign-Id'] = getCampaignId();
  const authToken = getAuthToken();
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
    return headers;
  }
  const dmToken = getDmToken();
  if (dmToken) {
    headers.Authorization = `Bearer ${dmToken}`;
  }
  return headers;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  });

  let data: any;
  let rawText = '';
  try {
    data = await res.json();
  } catch {
    try {
      rawText = await res.clone().text();
    } catch {
      rawText = '';
    }
    data = {};
  }

  if (!res.ok) {
    const msg =
      (data as any).error ||
      (rawText ? `${res.status} - ${rawText.slice(0, 200)}` : `请求失败: ${res.status}`);
    throw new Error(msg);
  }

  return data as T;
}

// ============ 鉴权（调 /api/auth/me 验证 JWT）============
export async function fetchCurrentUser<T = any>(): Promise<T> {
  return apiFetch<T>('/auth/me');
}

// ============ 角色卡 ============
export async function fetchAllCharacters<T = any[]>(): Promise<T> {
  return apiFetch<T>('/characters');
}

export async function fetchCharacter<T = any>(id: string): Promise<T> {
  return apiFetch<T>(`/characters/${id}`);
}

export async function createCharacter<T = any>(data: T): Promise<T> {
  return apiFetch<T>('/characters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function batchUpsertCharacters(items: any[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/characters', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

export async function updateCharacter<T = any>(id: string, data: T): Promise<T> {
  return apiFetch<T>(`/characters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCharacter(id: string): Promise<void> {
  await apiFetch(`/characters/${id}`, { method: 'DELETE' });
}

// ============ 装备库 ============
export async function fetchAllEquipments<T = any[]>(): Promise<T> {
  return apiFetch<T>('/equipments');
}

/** 全库视角导出（站点管理员）：含出版物全量，用于种子快照生成 */
export async function exportAllEquipments<T = any[]>(): Promise<T> {
  return apiFetch<T>('/equipments?scope=all');
}

export async function fetchEquipment<T = any>(id: string): Promise<T> {
  return apiFetch<T>(`/equipments/${id}`);
}

export async function createEquipment<T = any>(data: T): Promise<T> {
  return apiFetch<T>('/equipments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function batchUpsertEquipments(items: any[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/equipments', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

export async function updateEquipment<T = any>(id: string, data: T): Promise<T> {
  return apiFetch<T>(`/equipments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEquipment(id: string): Promise<void> {
  await apiFetch(`/equipments/${id}`, { method: 'DELETE' });
}

// ============ 法术库 ============
export async function fetchAllSpells<T = any[]>(): Promise<T> {
  return apiFetch<T>('/spells');
}

export async function fetchSpell<T = any>(id: string): Promise<T> {
  return apiFetch<T>(`/spells/${id}`);
}

export async function createSpell<T = any>(data: T): Promise<T> {
  return apiFetch<T>('/spells', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function batchUpsertSpells(items: any[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/spells', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

export async function updateSpell<T = any>(id: string, data: T): Promise<T> {
  return apiFetch<T>(`/spells/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSpell(id: string): Promise<void> {
  await apiFetch(`/spells/${id}`, { method: 'DELETE' });
}

// ============ NPC 模板（怪物图鉴） ============
export async function fetchAllNpcTemplates<T = any[]>(): Promise<T> {
  return apiFetch<T>('/templates');
}

/** 全库视角导出（站点管理员）：含出版物全量，用于种子快照生成 */
export async function exportAllNpcTemplates<T = any[]>(): Promise<T> {
  return apiFetch<T>('/templates?scope=all');
}

export async function createNpcTemplate<T = any>(data: T): Promise<T> {
  return apiFetch<T>('/templates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 批量导入模板（幂等：template_id 唯一约束，已存在被忽略）；421 条种子按 50/批分块由服务端执行 */
export async function batchImportNpcTemplates(
  items: any[],
  options: { overwrite?: boolean } = {},
): Promise<{ count: number; overwrite?: boolean }> {
  return apiFetch<{ count: number; overwrite?: boolean }>('/templates', {
    method: 'POST',
    body: JSON.stringify(options.overwrite ? { overwrite: true, items } : items),
  });
}

export async function updateNpcTemplate<T = any>(id: string, data: T): Promise<T> {
  return apiFetch<T>(`/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNpcTemplate(id: string): Promise<void> {
  await apiFetch(`/templates/${id}`, { method: 'DELETE' });
}

// ============ 角色选项库（种族/背景/职业） ============
export async function fetchAllOptions<T = any[]>(): Promise<T> {
  return apiFetch<T>('/options');
}

/** 全库视角导出（站点管理员）：含出版物全量，用于种子快照生成 */
export async function exportAllOptions<T = any[]>(): Promise<T> {
  return apiFetch<T>('/options?scope=all');
}

export async function batchUpsertOptions(items: any[]): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/options', {
    method: 'POST',
    body: JSON.stringify(items),
  });
}

// ============ 法术流程绑定 ============
export async function fetchAllSpellFlowBindings<T = any[]>(): Promise<T> {
  return apiFetch<T>('/bindings');
}

export async function createSpellFlowBinding<T = any>(data: { spell_id: string; flow_id: string }): Promise<T> {
  return apiFetch<T>('/bindings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteSpellFlowBinding(id: string): Promise<void> {
  await apiFetch(`/bindings/${id}`, { method: 'DELETE' });
}

export async function fetchBindingsBySpell<T = any[]>(spellId: string): Promise<T> {
  return apiFetch<T>(`/bindings/by-spell/${spellId}`);
}

export async function fetchBindingsByFlow<T = any[]>(flowId: string): Promise<T> {
  return apiFetch<T>(`/bindings/by-flow/${flowId}`);
}

// 扩展法术API以包含绑定信息
export async function fetchSpellWithBindings<T = any>(id: string): Promise<T> {
  return apiFetch<T>(`/spells/${id}`);
}

// 扩展流程API以包含绑定信息
export async function fetchFlowWithBindings<T = any>(id: string): Promise<T> {
  return apiFetch<T>(`/flows/${id}`);
}

// ============ 管理员认证函数（旧版兼容）============

export function hasToken(): boolean {
  return hasAuthToken() || !!getDmToken();
}

export function setToken(token: string | null): void {
  setDmToken(token);
}

export async function verifyToken(): Promise<any> {
  const jwt = getAuthToken();
  if (jwt) {
    try {
      return await fetchCurrentUser();
    } catch {
      // JWT 无效，尝试 DM Token
    }
  }
  const dmToken = getDmToken();
  if (dmToken) {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${dmToken}` },
    });
    if (res.ok) return res.json();
  }
  throw new Error('No valid token');
}


export async function deleteEquipments(ids: string[]): Promise<void> {
  // 根据后端接口实现，可以是并发请求或单次批量请求
  await Promise.all(ids.map(id => deleteEquipment(id)));
}

// ============ 账号一览（站点管理员端点）============
// 权限绑定账号：用当前账号 JWT；未登录时回退 DM Token 应急通道

function adminAuthHeaders(): Record<string, string> {
  return authHeaders();
}

export async function fetchAdminUsers<T = any>(): Promise<T> {
  return apiFetch<T>('/admin/users', { headers: adminAuthHeaders() });
}

export async function updateUserRole<T = any>(id: string, role: 'player' | 'dm'): Promise<T> {
  return apiFetch<T>(`/admin/users/${id}`, {
    method: 'PATCH',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ role }),
  });
}

/** 授予/撤销站点管理员权限（与游戏身份 role 独立） */
export async function updateUserAdmin<T = any>(id: string, isAdmin: boolean): Promise<T> {
  return apiFetch<T>(`/admin/users/${id}`, {
    method: 'PATCH',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ isAdmin }),
  });
}

export async function deleteAdminUser<T = any>(id: string): Promise<T> {
  return apiFetch<T>(`/admin/users/${id}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(),
  });
}

export async function resetUserPassword<T = any>(id: string, password: string): Promise<T> {
  return apiFetch<T>(`/admin/users/${id}/password`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ password }),
  });
}

export type PurgeKind = 'equipments' | 'monsters' | 'options' | 'all';

/** 预览云端出版物行计数（不删除） */
export async function previewPublicationPurge<T = any>(kind: PurgeKind = 'all'): Promise<T> {
  return apiFetch<T>(`/admin/purge-publications?kind=${encodeURIComponent(kind)}`, {
    headers: adminAuthHeaders(),
  });
}

/** 清理云端出版物行（campaign_id IS NULL），需 confirm:true 防误触 */
export async function purgePublications<T = any>(kind: PurgeKind = 'all'): Promise<T> {
  return apiFetch<T>('/admin/purge-publications', {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ kind, confirm: true }),
  });
}

/** 账号绑定的角色卡（name 为 null 表示角色已被删除的悬空绑定） */
export interface BoundCharacter {
  id: string;
  name: string | null;
  class: string;
  level: number;
  race: string;
}

/** 为账号绑定一个角色卡 */
export async function bindCharacterToUser<T = { ok: boolean; characters: BoundCharacter[] }>(
  userId: string,
  characterId: string,
): Promise<T> {
  return apiFetch<T>(`/admin/users/${userId}/characters`, {
    method: 'POST',
    headers: adminAuthHeaders(),
    body: JSON.stringify({ characterId }),
  });
}

/** 解绑账号的一个角色卡 */
export async function unbindCharacterFromUser<T = { ok: boolean; characters: BoundCharacter[] }>(
  userId: string,
  characterId: string,
): Promise<T> {
  return apiFetch<T>(`/admin/users/${userId}/characters/${characterId}`, {
    method: 'DELETE',
    headers: adminAuthHeaders(),
  });
}

// ============ 用户账号页 ============

/** 更新当前用户资料（用户名/头像） */
export async function updateProfile<T = any>(data: { username?: string; avatar?: string }): Promise<T> {
  return apiFetch<T>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** 修改密码（成功后后端清除会话） */
export async function changePassword<T = any>(oldPassword: string, newPassword: string): Promise<T> {
  return apiFetch<T>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

/** 退出登录：清除后端会话记录 */
export async function logoutUser<T = any>(): Promise<T> {
  return apiFetch<T>('/auth/logout', { method: 'POST' });
}

/** 上传头像：传压缩后的 base64 data URL，后端校验后返回（由 PATCH /auth/me 写入） */
export async function uploadAvatar<T = { url: string }>(dataUrl: string): Promise<T> {
  return apiFetch<T>('/upload/avatar', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
}

// ============ 流程管理 ============
// 流程的读写统一下沉到 flowStore（唯一入口），这里不再提供裸 CRUD 包装，
// 避免出现绕过镜像/校验/绑定同步的第二条写路径。


// ============ 团组（Campaign）============
// 成员关系即团组内身份：myRole 为 dm/player，作用域单场团组；站点权限仍走 is_admin。

export async function fetchCampaigns<T = Campaign[]>(): Promise<T> {
  return apiFetch<T>('/campaigns', { headers: authHeaders() });
}

export async function createCampaign<T = Campaign>(
  name: string,
  description = ''
): Promise<T> {
  return apiFetch<T>('/campaigns', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, description }),
  });
}

export async function fetchCampaign<T = Campaign>(id: string): Promise<T> {
  return apiFetch<T>(`/campaigns/${id}`, { headers: authHeaders() });
}

export async function updateCampaign<T = any>(
  id: string,
  patch: { name?: string; description?: string; rulebooks?: string[] }
): Promise<T> {
  return apiFetch<T>(`/campaigns/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
}

export async function fetchCampaignMembers<T = CampaignMember[]>(id: string): Promise<T> {
  return apiFetch<T>(`/campaigns/${id}/members`, { headers: authHeaders() });
}

export async function updateCampaignMemberRole<T = any>(
  id: string,
  userId: string,
  role: 'dm' | 'player'
): Promise<T> {
  return apiFetch<T>(`/campaigns/${id}/members/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
}

export async function removeCampaignMember<T = any>(id: string, userId: string): Promise<T> {
  return apiFetch<T>(`/campaigns/${id}/members/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function resetCampaignInviteCode<T = { inviteCode: string }>(id: string): Promise<T> {
  return apiFetch<T>(`/campaigns/${id}/invite`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function joinCampaign<T = Campaign & { joined: boolean }>(code: string): Promise<T> {
  return apiFetch<T>('/campaigns/join', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });
}

// ---------- 团组制品（六类纯本地数据上云：combat/treasure/note/battleground/calendar/gametime/proposal） ----------

export async function fetchArtifacts<T = any[]>(kind: string): Promise<T> {
  return apiFetch<T>(`/artifacts/${kind}`, { headers: authHeaders() });
}

export async function putArtifact<T = any>(kind: string, artId: string, data: unknown, opts?: RequestInit): Promise<T> {
  return apiFetch<T>(`/artifacts/${kind}/${encodeURIComponent(artId)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
    ...opts,
  });
}

export async function deleteArtifact(kind: string, artId: string, opts?: RequestInit): Promise<void> {
  await apiFetch(`/artifacts/${kind}/${encodeURIComponent(artId)}`, { method: 'DELETE', headers: authHeaders(), ...opts });
}

// ---------- 圆桌消息信箱（通用检定首批） ----------

/** 信箱游标增量拉取：默认收件（to_user_id），outbox=1 发件（DM 查发起状态） */
export async function fetchRoundTableInbox(after: string, opts?: { outbox?: boolean; limit?: number }): Promise<{ messages: any[]; cursor: string }> {
  const params = new URLSearchParams();
  if (after) params.set('after', after);
  if (opts?.outbox) params.set('outbox', '1');
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch<{ messages: any[]; cursor: string }>(`/table/inbox${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
}

/** DM 发起检定任务（需管理员） */
export async function sendCheckRequest(body: {
  characterId: string;
  checkKind: string;
  checkKey: string;
  checkLabel: string;
  dc: number;
  dcMode: string;
  note?: string;
}): Promise<{ ok: boolean; id: string }> {
  return apiFetch('/table/check-request', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
}

/** DM 抛送观战邀请给当前团绑定玩家（需管理员；重发同房间会自动失效旧邀请） */
export async function sendSpectateInvite(body: {
  roomId: string;
  title: string;
  campaignId?: string;
}): Promise<{ ok: boolean; recipients: number }> {
  return apiFetch('/table/spectate-invite', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
}

/** 玩家答复检定任务 */
export async function sendCheckResult(body: {
  replyTo: string;
  d20s: number[];
  d20Kept: number;
  rollMode: string;
  modeReasons: string[];
  bonuses: { label: string; value: number }[];
  appliedValue: number;
  autoOutcome: 'success' | 'fail' | null;
}): Promise<{ ok: boolean; id: string }> {
  return apiFetch('/table/check-result', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
}

/** DM 撤回 pending 检定任务（需管理员） */
export async function cancelCheckRequest(messageId: string): Promise<{ ok: boolean }> {
  return apiFetch('/table/cancel', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ messageId }) });
}

/** 查当前账号绑定的角色卡（玩家侧「我的角色」） */
export async function fetchMyCharacters(): Promise<{ characters: any[] }> {
  return apiFetch('/table/my-characters', { headers: authHeaders() });
}

/** 查已绑定玩家账号的角色卡（DM 发起表单可选项，需管理员） */
export async function fetchBoundCharacters(): Promise<{ characters: any[] }> {
  return apiFetch('/table/bound-characters', { headers: authHeaders() });
}

// ============ 角色卡变更请求（玩家提交 / DM 审批）============

/** 变更请求列表：DM 拿本团组全量，玩家拿自己的（mine=1 强制只看自己） */
export async function fetchChangeRequests<T = ChangeRequest[]>(mineOnly = false): Promise<T> {
  return apiFetch<T>(`/change-requests${mineOnly ? '?mine=1' : ''}`, { headers: authHeaders() });
}

/** 玩家提交变更请求：payload 为变更后整卡快照 */
export async function submitChangeRequest<T = { id: string }>(
  characterId: string,
  payload: any,
  baseUpdatedAt: number,
  note = ''
): Promise<T> {
  return apiFetch<T>('/change-requests', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ characterId, payload, baseUpdatedAt, note }),
  });
}

/** 玩家撤回自己的待审请求 */
export async function withdrawChangeRequest<T = { id: string }>(id: string): Promise<T> {
  return apiFetch<T>(`/change-requests/${id}/withdraw`, { method: 'POST', headers: authHeaders() });
}

/** DM 批准：快照写入正式卡；versionDrift=true 表示审批期间正式卡已被改过 */
export async function approveChangeRequest<T = { id: string; versionDrift: boolean; character: any }>(
  id: string
): Promise<T> {
  return apiFetch<T>(`/change-requests/${id}/approve`, { method: 'POST', headers: authHeaders() });
}

/** DM 驳回：理由必填且回传玩家可见 */
export async function rejectChangeRequest<T = { id: string }>(id: string, reviewNote: string): Promise<T> {
  return apiFetch<T>(`/change-requests/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reviewNote }),
  });
}
