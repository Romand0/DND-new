import type { Spell } from '@/types/spell';
import initialSpells from '@/data/spells.json';

const STORAGE_KEY = 'DND-spells';
let listeners: (() => void)[] = [];

function loadSpells(): Spell[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return initialSpells as Spell[];
}

function saveSpells(spells: Spell[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spells));
  notifyListeners();
}

function notifyListeners(): void {
  listeners.forEach((fn) => fn());
}

export const spellStore = {
  getAll(): Spell[] {
    return loadSpells();
  },

  getById(id: string): Spell | undefined {
    return loadSpells().find((s) => s.id === id);
  },

  getByName(name: string): Spell | undefined {
    return loadSpells().find((s) => s.name === name);
  },

  save(spells: Spell[]): void {
    saveSpells(spells);
  },

  subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};
