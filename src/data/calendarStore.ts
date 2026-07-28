// 游戏日历状态管理 — 哈普托斯历（Harptos Calendar）
import {
  getYearDays,
  dayOfYearToDate,
  getRealWorldDayOfYear,
} from './calendarData';
import gameTimeStore from './gameTimeStore';

const STORAGE_KEY = 'dnd-game-calendar';
type Listener = () => void;

let listeners: Listener[] = [];

function notify(): void {
  listeners.forEach((l) => l());
}

export interface GameCalendar {
  year: number;
  dayOfYear: number; // 1-based, 1-365/366
  linkedToClock: boolean;
}

function load(): GameCalendar {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        year: new Date().getFullYear(),
        dayOfYear: getRealWorldDayOfYear(),
        linkedToClock: false,
      };
    }
    const t: any = JSON.parse(raw);
    const year = Number.isNaN(Number(t.year)) ? new Date().getFullYear() : Number(t.year);
    const dayOfYear = Number.isNaN(Number(t.dayOfYear))
      ? getRealWorldDayOfYear()
      : Math.max(1, Number(t.dayOfYear));
    return {
      year,
      dayOfYear,
      linkedToClock: !!t.linkedToClock,
    };
  } catch {
    return {
      year: new Date().getFullYear(),
      dayOfYear: getRealWorldDayOfYear(),
      linkedToClock: false,
    };
  }
}

function save(calendar: GameCalendar): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(calendar));
    notify();
  } catch (e) {
    console.error('游戏日历保存失败:', e);
  }
}

/** 标准化 dayOfYear 到有效范围 */
function normalizeDayOfYear(dayOfYear: number, year: number): number {
  const max = getYearDays(year);
  let d = dayOfYear;
  while (d > max) {
    d -= max;
  }
  while (d < 1) {
    d += max;
  }
  return d;
}

// 用于检测时间跨天的状态
let prevTotalMinutes: number | null = null;

function initPrevTotalMinutes(): void {
  const c = load();
  const t = gameTimeStore.get();
  prevTotalMinutes = (c.dayOfYear - 1) * 24 * 60 + t.hour * 60 + t.minute;
}

/** 监听 gameTimeStore 变化，挂钩模式下自动同步日期 */
function onTimeChange(): void {
  const c = load();
  const t = gameTimeStore.get();
  const currentTotal = (c.dayOfYear - 1) * 24 * 60 + t.hour * 60 + t.minute;

  if (c.linkedToClock && prevTotalMinutes !== null) {
    const prevDay = Math.floor(prevTotalMinutes / (24 * 60));
    const currentDay = Math.floor(currentTotal / (24 * 60));
    const dayDelta = currentDay - prevDay;

    if (dayDelta !== 0) {
      let newDayOfYear = c.dayOfYear + dayDelta;
      let year = c.year;
      const max = getYearDays(year);
      // 处理跨年
      while (newDayOfYear > max) {
        newDayOfYear -= max;
        year++;
      }
      while (newDayOfYear < 1) {
        year--;
        newDayOfYear += getYearDays(year);
      }
      save({ ...c, year, dayOfYear: newDayOfYear });
      // 更新 prevTotalMinutes 以反映新的日期基准
      prevTotalMinutes = (newDayOfYear - 1) * 24 * 60 + t.hour * 60 + t.minute;
      return;
    }
  }

  prevTotalMinutes = currentTotal;
}

// 初始化并订阅时间变化
initPrevTotalMinutes();
gameTimeStore.subscribe(onTimeChange);

const calendarStore = {
  get(): GameCalendar {
    return load();
  },

  /** 设置日期 */
  setDate(year: number, dayOfYear: number): void {
    const c = load();
    const y = Number.isNaN(year) ? c.year : year;
    const d = normalizeDayOfYear(dayOfYear, y);
    save({ ...c, year: y, dayOfYear: d });
    initPrevTotalMinutes();
  },

  /** 加减天数（处理闰年跨年） */
  addDays(days: number): void {
    const c = load();
    let year = c.year;
    let dayOfYear = c.dayOfYear + days;

    while (dayOfYear > getYearDays(year)) {
      dayOfYear -= getYearDays(year);
      year++;
    }
    while (dayOfYear < 1) {
      year--;
      dayOfYear += getYearDays(year);
    }

    save({ ...c, year, dayOfYear });
    initPrevTotalMinutes();
  },

  /** 推进到下一年的同一天 */
  nextYear(): void {
    const c = load();
    save({ ...c, year: c.year + 1 });
    initPrevTotalMinutes();
  },

  /** 回退到上一年的同一天 */
  prevYear(): void {
    const c = load();
    save({ ...c, year: c.year - 1 });
    initPrevTotalMinutes();
  },

  /** 设置与时钟的同步状态 */
  setLinked(linked: boolean): void {
    const c = load();
    save({ ...c, linkedToClock: linked });
    initPrevTotalMinutes();
  },

  /** 获取当前日期的月/日/节日信息 */
  getDateInfo(): ReturnType<typeof dayOfYearToDate> & { year: number } {
    const c = load();
    const date = dayOfYearToDate(c.dayOfYear, c.year);
    return { ...date, year: c.year };
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

export default calendarStore;
