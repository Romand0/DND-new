// API Client - 与 Cloudflare Pages Functions 后端通信
const TOKEN_KEY = 'dm_token';
const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function hasToken(): boolean {
  return !!getToken();
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = (data as any).error || `请求失败: ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

// ============ 鉴权 ============
export async function verifyToken(): Promise<boolean> {
  try {
    const result = await apiFetch<{ valid: boolean }>('/auth/verify');
    return result.valid;
  } catch {
    return false;
  }
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
