import { scopedKey } from '@/data/campaignScope';
const storageKey = () => scopedKey('dnd-hooked-combat');

export interface HookedCombat {
  id: string;
  title: string;
}

function load(): HookedCombat | null {
  try {
    const raw = localStorage.getItem(storageKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(hooked: HookedCombat | null) {
  if (hooked) {
    localStorage.setItem(storageKey(), JSON.stringify(hooked));
  } else {
    localStorage.removeItem(storageKey());
  }
}

const hookedCombatStore = {
  get(): HookedCombat | null { return load(); },
  set(id: string, title: string) { save({ id, title }); },
  clear() { save(null); },
};

export default hookedCombatStore;
