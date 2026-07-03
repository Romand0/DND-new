// API Client - 与 Cloudflare Pages Functions 后端通信
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
  const authToken = getAuthToken();
  if (authToken) {
    return { Authorization: `Bearer ${authToken}` };
  }
  const dmToken = getDmToken();
  if (dmToken) {
    return { Authorization: `Bearer ${dmToken}` };
  }
  return {};
}

async function apiFetch<T = any>(
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

// ============ 管理员认证函数 ============

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
