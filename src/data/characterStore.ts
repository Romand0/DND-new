import type { Character, Attack, Equipment, Feature } from '@/types/character';
import * as api from '@/lib/api';

const STORAGE_KEY = 'DND';
const BACKUP_KEY = 'dm-characters-backup';
const BACKUP_INTERVAL = 30000;

let chars: Character[] = [];
let listeners: Array<(chars: Character[]) => void> = [];
let backupTimer: ReturnType<typeof setInterval> | null = null;

function loadStore(): Character[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to load characters from localStorage:', e);
  }
  return [];
}

function saveStore(data: Character[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save characters to localStorage:', e);
  }
}

function notify() {
  listeners.forEach(fn => fn([...chars]));
}

function startBackupTimer() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(() => {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(chars));
    } catch (e) {
      console.warn('Auto-backup failed:', e);
    }
  }, BACKUP_INTERVAL);
}

function stopBackupTimer() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}

// 从 localStorage 读取 auth_token，构造带 JWT 的 headers
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// 同步单个角色到后端（D1），带 JWT 鉴权
async function syncCharacterToBackend(char: Character): Promise<void> {
  const headers = getAuthHeaders();
  try {
    await api.apiFetch(`/characters/${char.id}`, {
      method: 'PUT',
      body: JSON.stringify(char),
      headers,
    });
  } catch {
    // PUT 失败（可能是新角色或 404），尝试 POST 创建
    await api.apiFetch('/characters', {
      method: 'POST',
      body: JSON.stringify(char),
      headers,
    });
  }
}

function getCharacters(): Character[] {
  if (chars.length === 0) {
    chars = loadStore();
  }
  return [...chars];
}

function getCharacter(id: string): Character | undefined {
  if (chars.length === 0) {
    chars = loadStore();
  }
  return chars.find(c => c.id === id);
}

function saveCharacter(char: Character): void {
  const index = chars.findIndex(c => c.id === char.id);
  const charWithTimestamps = {
    ...char,
    updatedAt: Date.now(),
    createdAt: char.createdAt || Date.now(),
  };
  if (index >= 0) {
    chars[index] = charWithTimestamps;
  } else {
    chars.push(charWithTimestamps);
  }
  saveStore(chars);
  notify();
  // 后台同步到 D1（静默失败，不影响本地）
  syncCharacterToBackend(charWithTimestamps).catch(() => {});
}

function deleteCharacter(id: string): void {
  chars = chars.filter(c => c.id !== id);
  saveStore(chars);
  notify();
}

function subscribe(fn: (chars: Character[]) => void): () => void {
  listeners.push(fn);
  if (listeners.length === 1) {
    startBackupTimer();
  }
  return () => {
    listeners = listeners.filter(l => l !== fn);
    if (listeners.length === 0) {
      stopBackupTimer();
    }
  };
}

function forceSync(): Promise<void[]> {
  const pending = chars.filter(c => c.updatedAt > 0);
  return Promise.all(
    pending.map(char =>
      syncCharacterToBackend(char).catch(err => {
        console.warn('Force sync failed for', char.id, err);
      })
    )
  );
}

function getAllCharacters(): Character[] {
  return getCharacters();
}

// 聚合对象，兼容旧代码的 import { characterStore } from '@/data/characterStore'
export const characterStore = {
  getCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  subscribe,
  forceSync,
  getAllCharacters,
};

// 同时也保留散装导出，方便新代码按需引入
export {
  getCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  subscribe,
  forceSync,
  getAllCharacters,
};
