// 游戏日历状态管理 — 哈普托斯历（Harptos Calendar）
import { getYearDays, dayOfYearToDate, getRealWorldDayOfYear, isLeapYear } from './calendarData';
import gameTimeStore from './gameTimeStore';

const STORAGE_KEY = 'dnd-game-calendar';
type Listener = () => void;

let listeners: Listener[] = [];

function notify(): void {
  listeners.forEach((l) => l());
}

export interface GameCalendar {
  dayOfYear: number; // 1-based, 1-365/366
  linkedToClock: boolean;
}

function load(): GameCalendar {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        dayOfYear: getRealWorldDayOfYear(),
        linkedToClock: false,
      };
    }
    const t: any = JSON.parse(raw);
    const dayOfYear = Number.isNaN(Number(t.dayOfYear))
      ? getRealWorldDayOfYear()
      : Math.max(1, Number(t.dayOfYear));
    return {
      dayOfYear,
      linkedToClock: !!t.linkedToClock,
    };
  } catch {
    return {
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
      // 用现实年份判断闰年
      const refYear = new Date().getFullYear();
      const maxDays = getYearDays(refYear);
      let newDayOfYear = c.dayOfYear + dayDelta;

      // 处理跨年
      while (newDayOfYear > maxDays) {
        newDayOfYear -= maxDays;
      }
      while (newDayOfYear < 1) {
        newDayOfYear += getYearDays(refYear);
      }

      save({ ...c, dayOfYear: newDayOfYear });
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

  /** 设置日期（使用现实年份作为参考） */
  setDate(year: number, dayOfYear: number): void {
    const c = load();
    const refYear = new Date().getFullYear();
    const maxDays = getYearDays(refYear);
    const d = Math.max(1, Math.min(maxDays, dayOfYear));
    save({ ...c, dayOfYear: d });
    initPrevTotalMinutes();
  },

  /** 加减天数 */
  addDays(days: number): void {
    const c = load();
    const refYear = new Date().getFullYear();
    let dayOfYear = c.dayOfYear + days;
    const maxDays = getYearDays(refYear);

    while (dayOfYear > maxDays) {
      dayOfYear -= maxDays;
    }
    while (dayOfYear < 1) {
      dayOfYear += maxDays;
    }

    save({ ...c, dayOfYear });
    initPrevTotalMinutes();
  },

  /** 设置与时钟的同步状态 */
  setLinked(linked: boolean): void {
    const c = load();
    save({ ...c, linkedToClock: linked });
    initPrevTotalMinutes();
  },

  /** 获取当前日期的月/日/节日信息 */
  getDateInfo(): ReturnType<typeof dayOfYearToDate> {
    const c = load();
    const refYear = new Date().getFullYear();
    return dayOfYearToDate(c.dayOfYear, refYear);
  },

  subscribe(listener: Listener): () => void {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },
};

export default calendarStore;