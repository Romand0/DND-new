const STORAGE_KEY = 'dnd-hooked-combat';

export interface HookedCombat {
  id: string;
  title: string;
}

function load(): HookedCombat | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(hooked: HookedCombat | null) {
  if (hooked) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hooked));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

const hookedCombatStore = {
  get(): HookedCombat | null { return load(); },
  set(id: string, title: string) { save({ id, title }); },
  clear() { save(null); },
};

export default hookedCombatStore;
