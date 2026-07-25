// src/data/combatStore.ts
import type { CombatRecord, Combatant, RoundAction } from '@/types/combat';

const STORAGE_KEY = 'combat_records';

type Listener = () => void;

let listeners: Listener[] = [];

function notify() {
  listeners.forEach((fn) => fn());
}

function loadAll(): CombatRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(records: CombatRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  notify();
}

export const combatStore = {
  getAll(): CombatRecord[] {
    return loadAll();
  },

  get(id: string): CombatRecord | undefined {
    return loadAll().find((r) => r.id === id);
  },

  create(title: string, combatants: Omit<Combatant, 'id'>[]): CombatRecord {
    const records = loadAll();
    const newRecord: CombatRecord = {
      id: `combat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      combatants: combatants.map((c, i) => ({
        ...c,
        id: `cbt-${Date.now()}-${i}`,
      })),
      rounds: [{ /* 第1轮空行动 */ }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // 按先攻降序排序
    newRecord.combatants.sort((a, b) => b.initiative - a.initiative);
    records.push(newRecord);
    saveAll(records);
    return newRecord;
  },

  update(id: string, partial: Partial<CombatRecord>) {
    const records = loadAll();
    const index = records.findIndex((r) => r.id === id);
    if (index === -1) return;
    records[index] = { ...records[index], ...partial, updatedAt: Date.now() };
    saveAll(records);
  },

  delete(id: string) {
    const records = loadAll().filter((r) => r.id !== id);
    saveAll(records);
  },

  addCombatant(combatId: string, combatant: Omit<Combatant, 'id'>) {
    const record = this.get(combatId);
    if (!record) return;
    const newCombatant: Combatant = {
      ...combatant,
      id: `cbt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    const updatedCombatants = [...record.combatants, newCombatant].sort(
      (a, b) => b.initiative - a.initiative
    );
    // 在所有轮次的行动记录中为新参战者添加空字符串
    const updatedRounds = record.rounds.map((round) => ({
      ...round,
      [newCombatant.id]: '',
    }));
    this.update(combatId, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
    });
  },

  removeCombatant(combatId: string, combatantId: string) {
    const record = this.get(combatId);
    if (!record) return;
    const updatedCombatants = record.combatants.filter((c) => c.id !== combatantId);
    const updatedRounds = record.rounds.map((round) => {
      const { [combatantId]: _, ...rest } = round;
      return rest;
    });
    this.update(combatId, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
    });
  },

  addRound(combatId: string) {
    const record = this.get(combatId);
    if (!record) return;
    const newRound: RoundAction = {};
    record.combatants.forEach((c) => {
      newRound[c.id] = '';
    });
    this.update(combatId, {
      rounds: [...record.rounds, newRound],
    });
  },

  removeRound(combatId: string, roundIndex: number) {
    const record = this.get(combatId);
    if (!record || record.rounds.length <= 1) return;
    const updatedRounds = record.rounds.filter((_, i) => i !== roundIndex);
    this.update(combatId, { rounds: updatedRounds });
  },

  updateAction(combatId: string, roundIndex: number, combatantId: string, action: string) {
    const record = this.get(combatId);
    if (!record || !record.rounds[roundIndex]) return;
    const updatedRounds = record.rounds.map((round, i) => {
      if (i !== roundIndex) return round;
      return { ...round, [combatantId]: action };
    });
    this.update(combatId, { rounds: updatedRounds });
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};
