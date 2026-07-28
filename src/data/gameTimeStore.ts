// 游戏内时间存储
const STORAGE_KEY = 'dnd-game-time';
type Listener = () => void;

let listeners: Listener[] = [];

function notify(): void {
  listeners.forEach((l) => l());
}

interface GameTime {
  hour: number;
  minute: number;
  updatedAt: number;
}

function load(): GameTime {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { hour: 8, minute: 0, updatedAt: Date.now() };
    const t: any = JSON.parse(raw);
    return {
      hour: Math.max(0, Math.min(23, Number(t.hour) || 8)),
      minute: Math.max(0, Math.min(59, Number(t.minute) || 0)),
      updatedAt: t.updatedAt ?? Date.now(),
    };
  } catch {
    return { hour: 8, minute: 0, updatedAt: Date.now() };
  }
}

function save(time: GameTime): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(time));
    notify();
  } catch (e) {
    console.error('游戏时间保存失败:', e);
  }
}

/** 获取一天中的时间段 */
export function getTimeOfDay(hour: number, minute: number): string {
  const totalMinutes = hour * 60 + minute;
  if (totalMinutes >= 5 * 60 && totalMinutes < 6 * 60) return '黎明';
  if (totalMinutes >= 6 * 60 && totalMinutes < 12 * 60) return '上午';
  if (totalMinutes >= 12 * 60 && totalMinutes < 13 * 60) return '中午';
  if (totalMinutes >= 13 * 60 && totalMinutes < 18 * 60) return '下午';
  if (totalMinutes >= 18 * 60 && totalMinutes < 19 * 60) return '黄昏';
  return '夜晚';
}

const gameTimeStore = {
  get(): GameTime {
    return load();
  },

  /** 设置时间（小时和分钟） */
  set(hour: number, minute: number): void {
    const h = ((hour % 24) + 24) % 24;
    const m = ((minute % 60) + 60) % 60;
    save({ hour: h, minute: m, updatedAt: Date.now() });
  },

  /** 按分钟调整时间（正数前进，负数后退） */
  addMinutes(minutes: number): void {
    const t = load();
    let totalMin = t.hour * 60 + t.minute + minutes;
    totalMin = ((totalMin % (24 * 60)) + (24 * 60)) % (24 * 60);
    save({ hour: Math.floor(totalMin / 60), minute: totalMin % 60, updatedAt: Date.now() });
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

export default gameTimeStore;