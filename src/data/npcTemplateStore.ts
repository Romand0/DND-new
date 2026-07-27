import type { NpcTemplate } from '@/types/combat';

const STORAGE_KEY = 'dnd-npc-templates';
type Listener = () => void;

let listeners: Listener[] = [];

function notify(): void {
  listeners.forEach(listener => listener());
}

function load(): NpcTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const templates: unknown[] = JSON.parse(raw);
    return templates.map((t: any) => ({
      id: t.id ?? crypto.randomUUID(),
      templateId: t.templateId ?? t.id ?? crypto.randomUUID(),
      name: t.name ?? '未命名NPC',
      strength: t.strength ?? 10,
      dexterity: t.dexterity ?? 10,
      constitution: t.constitution ?? 10,
      intelligence: t.intelligence ?? 10,
      wisdom: t.wisdom ?? 10,
      charisma: t.charisma ?? 10,
      maxHp: t.maxHp ?? 10,
      speed: t.speed ?? 30,
      ac: t.ac ?? 10,
      attacks: (t.attacks ?? []).map((a: any) => ({
        name: a.name ?? '',
        attackBonus: a.attackBonus ?? '',
        damage: a.damage ?? '',
        damageType: a.damageType ?? '挥砍',
        range: a.range ?? '5 尺',
        properties: a.properties ?? [],
        subtype: a.subtype,
        normalRange: a.normalRange,
        maxRange: a.maxRange,
      })),
      createdAt: t.createdAt ?? Date.now(),
      updatedAt: t.updatedAt ?? Date.now(),
    }));
  } catch {
    return [];
  }
}

function save(templates: NpcTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    notify();
  } catch (e) {
    console.error('NPC模板保存失败:', e);
  }
}

const npcTemplateStore = {
  getAll(): NpcTemplate[] {
    return load().sort((a, b) => b.updatedAt - a.updatedAt);
  },

  get(id: string): NpcTemplate | null {
    return load().find(t => t.id === id) ?? null;
  },

  create(template: Omit<NpcTemplate, 'id' | 'createdAt' | 'updatedAt'>): NpcTemplate {
    const now = Date.now();
    const newTemplate: NpcTemplate = {
      ...template,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    const templates = load();
    templates.push(newTemplate);
    save(templates);
    return newTemplate;
  },

  update(id: string, partial: Partial<Omit<NpcTemplate, 'id' | 'createdAt'>>): NpcTemplate | null {
    const templates = load();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) return null;

    templates[index] = {
      ...templates[index],
      ...partial,
      updatedAt: Date.now(),
    };
    save(templates);
    return templates[index];
  },

  delete(id: string): void {
    const templates = load().filter(t => t.id !== id);
    save(templates);
  },

  clear(): void {
    save([]);
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },
};

export default npcTemplateStore;