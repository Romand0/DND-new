// 哈普托斯历（Harptos Calendar）数据定义与计算工具
// 被遗忘的国度（Forgotten Realms）世界观

export interface MonthInfo {
  index: number; // 1-12
  name: string; // 通用中文名
  officialName: string; // 官方英文名
  days: number; // 每月固定30天
  festival?: string; // 月末节日（如有）
  extraFestival?: string; // 额外节日（如盾会日，仅闰年）
}

export interface DateResult {
  month: number; // 1-12
  day: number; // 1-30，节日为0
  isFestival: boolean;
  festivalName?: string;
}

/** 十二个月 */
export const MONTHS: MonthInfo[] = [
  { index: 1, name: '一月', officialName: 'Hammer', days: 30, festival: '隆冬节' },
  { index: 2, name: '二月', officialName: 'Alturiak', days: 30 },
  { index: 3, name: '三月', officialName: 'Ches', days: 30 },
  { index: 4, name: '四月', officialName: 'Tarsakh', days: 30, festival: '绿草节' },
  { index: 5, name: '五月', officialName: 'Mirtul', days: 30 },
  { index: 6, name: '六月', officialName: 'Kythorn', days: 30 },
  { index: 7, name: '七月', officialName: 'Flamerule', days: 30, festival: '仲夏节', extraFestival: '盾会日' },
  { index: 8, name: '八月', officialName: 'Eleasis', days: 30 },
  { index: 9, name: '九月', officialName: 'Eleint', days: 30, festival: '丰收节' },
  { index: 10, name: '十月', officialName: 'Marpenoth', days: 30 },
  { index: 11, name: '十一月', officialName: 'Uktar', days: 30, festival: '月之盛宴' },
  { index: 12, name: '十二月', officialName: 'Nightal', days: 30 },
];

/** 节日配置 */
interface FestivalConfig {
  name: string;
  afterMonth: number; // 在哪个月之后
  leapOnly?: boolean;
}

const FESTIVALS: FestivalConfig[] = [
  { name: '隆冬节', afterMonth: 1 },
  { name: '绿草节', afterMonth: 4 },
  { name: '仲夏节', afterMonth: 7 },
  { name: '盾会日', afterMonth: 7, leapOnly: true },
  { name: '丰收节', afterMonth: 9 },
  { name: '月之盛宴', afterMonth: 11 },
];

/** 各月起始的年内第几天（1-based） */
function getMonthStarts(leap: boolean): number[] {
  return leap
    ? [1, 32, 62, 92, 123, 153, 183, 215, 245, 276, 306, 337]
    : [1, 32, 62, 92, 123, 153, 183, 214, 244, 275, 305, 336];
}

/** 获取某年的总天数 */
export function getYearDays(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** 判断闰年 — 与现实历法一致（4年一闰，百年不闰，400年再闰） */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 年内第几天 → 月/日/节日 */
export function dayOfYearToDate(dayOfYear: number, year: number): DateResult {
  const leap = isLeapYear(year);
  const starts = getMonthStarts(leap);
  const maxDay = getYearDays(year);
  const d = Math.max(1, Math.min(maxDay, dayOfYear));

  // 先检查是否是节日
  const festivalMap: Record<number, { name: string; month: number }> = leap
    ? {
        31: { name: '隆冬节', month: 1 },
        122: { name: '绿草节', month: 4 },
        213: { name: '仲夏节', month: 7 },
        214: { name: '盾会日', month: 7 },
        275: { name: '丰收节', month: 9 },
        336: { name: '月之盛宴', month: 11 },
      }
    : {
        31: { name: '隆冬节', month: 1 },
        122: { name: '绿草节', month: 4 },
        213: { name: '仲夏节', month: 7 },
        274: { name: '丰收节', month: 9 },
        335: { name: '月之盛宴', month: 11 },
      };

  if (festivalMap[d]) {
    return {
      month: festivalMap[d].month,
      day: 0,
      isFestival: true,
      festivalName: festivalMap[d].name,
    };
  }

  // 找到所属月份（从后往前找第一个起始日 ≤ d 的月份）
  for (let i = 11; i >= 0; i--) {
    if (d >= starts[i]) {
      return {
        month: i + 1,
        day: d - starts[i] + 1,
        isFestival: false,
      };
    }
  }

  return { month: 1, day: 1, isFestival: false };
}

/** 月/日 → 年内第几天 */
export function dateToDayOfYear(month: number, day: number, year: number): number {
  const leap = isLeapYear(year);
  const starts = getMonthStarts(leap);
  const m = Math.max(1, Math.min(12, month));
  return starts[m - 1] + Math.max(0, Math.min(29, day - 1));
}

/** 获取某月在某年的日历网格数据 */
export interface DayCell {
  day: number; // 1-30
  tenday: number; // 1-3，第几个十天
}

export interface MonthGrid {
  days: DayCell[]; // 30个天格子
  hasFestival: boolean;
  festivalName?: string;
  extraFestivalName?: string;
  festivalDayOfYear?: number; // 节日在年内的第几天（用于高亮）
  extraFestivalDayOfYear?: number;
}

export function getMonthGrid(month: number, year: number): MonthGrid {
  const m = MONTHS[month - 1];
  const leap = isLeapYear(year);
  const starts = getMonthStarts(leap);

  const days: DayCell[] = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    tenday: Math.floor(i / 10) + 1,
  }));

  // 计算节日在年内的第几天
  let festivalDayOfYear: number | undefined;
  let extraFestivalDayOfYear: number | undefined;

  if (m.festival) {
    // 节日在月末之后，即下个月起始日 - 1
    festivalDayOfYear = starts[month - 1] + 30;
  }
  if (m.extraFestival && leap) {
    extraFestivalDayOfYear = festivalDayOfYear! + 1;
  }

  return {
    days,
    hasFestival: !!m.festival,
    festivalName: m.festival,
    extraFestivalName: leap ? m.extraFestival : undefined,
    festivalDayOfYear,
    extraFestivalDayOfYear,
  };
}

/** 获取现实世界今天的年内第几天 */
export function getRealWorldDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** 获取某天的十天名称 */
export function getTendayName(tenday: number): string {
  const names = ['一', '二', '三'];
  return names[tenday - 1] ?? '';
}

/** 格式化日期显示 */
export function formatDate(month: number, day: number, year: number): string {
  const m = MONTHS[month - 1];
  if (day === 0) {
    const grid = getMonthGrid(month, year);
    return `${m.name} · ${grid.festivalName || ''}`;
  }
  return `${m.name} ${day}日`;
}

/** 格式化完整日期（含官方名和十天） */
export function formatFullDate(month: number, day: number, year: number): string {
  const m = MONTHS[month - 1];
  const tenday = Math.floor((day - 1) / 10) + 1;
  const dayInTenday = ((day - 1) % 10) + 1;
  return `${m.name}（${m.officialName}）${day}日 · 第${getTendayName(tenday)}十天之第${dayInTenday}天`;
}
