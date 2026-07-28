import { useState, useEffect } from 'react';
import calendarStore from '@/data/calendarStore';
import gameTimeStore from '@/data/gameTimeStore';
import {
  MONTHS,
  getMonthGrid,
  dayOfYearToDate,
  dateToDayOfYear,
  getYearDays,
  isLeapYear,
  getTendayName,
  formatDate,
  formatFullDate,
  type DateResult,
} from '@/data/calendarData';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Link2,
  Link2Off,
  Clock,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Flower2,
  Wheat,
  PartyPopper,
  Shield,
} from 'lucide-react';

// 节日图标映射
const festivalIcons: Record<string, React.ElementType> = {
  '隆冬节': Sun,
  '绿草节': Flower2,
  '仲夏节': Sunrise,
  '盾会日': Shield,
  '丰收节': Wheat,
  '月之盛宴': PartyPopper,
};

export default function CalendarPage() {
  const [calendar, setCalendar] = useState(calendarStore.get());
  const [gameTime, setGameTime] = useState(gameTimeStore.get());
  const [viewMonth, setViewMonth] = useState(1);

  // 订阅日历和时间变化
  useEffect(() => {
    const updateCalendar = () => {
      const c = calendarStore.get();
      setCalendar(c);
      // 同步视图月份到当前月份
      const info = calendarStore.getDateInfo();
      if (!info.isFestival) {
        setViewMonth(info.month);
      }
    };
    const updateTime = () => setGameTime(gameTimeStore.get());

    updateCalendar();
    updateTime();

    const unsubCal = calendarStore.subscribe(updateCalendar);
    const unsubTime = gameTimeStore.subscribe(updateTime);
    return () => {
      unsubCal();
      unsubTime();
    };
  }, []);

  const dateInfo = calendarStore.getDateInfo();
  const currentMonthInfo = MONTHS[viewMonth - 1];
  const monthGrid = getMonthGrid(viewMonth, calendar.year);
  const isLeap = isLeapYear(calendar.year);
  const yearDays = getYearDays(calendar.year);

  // 判断某天是否为当前日期
  const isCurrentDay = (day: number): boolean => {
    if (dateInfo.isFestival) return false;
    return dateInfo.month === viewMonth && dateInfo.day === day;
  };

  // 判断当前是否是节日
  const isCurrentFestival = (festivalName?: string): boolean => {
    if (!dateInfo.isFestival || !festivalName) return false;
    return dateInfo.festivalName === festivalName;
  };

  const goMonth = (delta: number) => {
    setViewMonth((m) => {
      let next = m + delta;
      if (next > 12) next = 1;
      if (next < 1) next = 12;
      return next;
    });
  };

  const selectDay = (day: number) => {
    const doy = dateToDayOfYear(viewMonth, day, calendar.year);
    calendarStore.setDate(calendar.year, doy);
  };

  const selectFestival = (festivalMonth: number) => {
    // 节日在某月之后，选节日就是选该月的下一天（即节日当天）
    const doy = dateToDayOfYear(festivalMonth, 30, calendar.year) + 1;
    calendarStore.setDate(calendar.year, doy);
  };

  const toggleLinked = () => {
    calendarStore.setLinked(!calendar.linkedToClock);
  };

  const resetToToday = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    calendarStore.setDate(now.getFullYear(), dayOfYear);
    gameTimeStore.set(now.getHours(), now.getMinutes());
  };

  const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            哈普托斯历
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToToday}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            重置为今天
          </button>
          <button
            onClick={toggleLinked}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              calendar.linkedToClock
                ? 'border-primary text-primary bg-primary/10'
                : 'dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5'
            }`}
          >
            {calendar.linkedToClock ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4" />}
            {calendar.linkedToClock ? '已挂钩' : '未挂钩'}
          </button>
        </div>
      </div>

      {/* 年份导航 + 当前日期概览 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 年份导航 */}
        <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => calendarStore.prevYear()}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors dark:text-text-dark light:text-text-light"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="text-2xl font-bold dark:text-text-dark light:text-text-light">
                {calendar.year}年
              </div>
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                {isLeap ? '闰年 · 366天' : '平年 · 365天'}
              </div>
            </div>
            <button
              onClick={() => calendarStore.nextYear()}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors dark:text-text-dark light:text-text-light"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 当前日期 */}
        <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4 md:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-lg font-bold dark:text-text-dark light:text-text-light">
                {dateInfo.isFestival
                  ? `${MONTHS[dateInfo.month - 1].name} · ${dateInfo.festivalName}`
                  : formatFullDate(dateInfo.month, dateInfo.day, dateInfo.year)}
              </div>
              <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                年内第 {calendar.dayOfYear} / {yearDays} 天
              </div>
            </div>
            {calendar.linkedToClock && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary">
                <Clock className="w-4 h-4" />
                <span className="font-mono font-medium">{timeStr}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 月份导航 */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goMonth(-1)}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors dark:text-text-dark light:text-text-light"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-center">
          <div className="text-xl font-bold dark:text-text-dark light:text-text-light">
            {currentMonthInfo.name}
          </div>
          <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            {currentMonthInfo.officialName} · {currentMonthInfo.days}天
            {monthGrid.hasFestival && (
              <span className="ml-2 text-primary">
                + {monthGrid.festivalName}
                {monthGrid.extraFestivalName && `、${monthGrid.extraFestivalName}`}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => goMonth(1)}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors dark:text-text-dark light:text-text-light"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* 日历网格 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
        {/* 表头 */}
        <div
          className="grid gap-1 mb-2"
          style={{
            gridTemplateColumns: monthGrid.hasFestival ? 'repeat(11, 1fr)' : 'repeat(10, 1fr)',
          }}
        >
          {['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'].map((h) => (
            <div
              key={h}
              className="text-center text-xs font-medium py-2 rounded dark:text-text-dark-muted light:text-text-light-muted dark:bg-bg-dark-2 light:bg-bg-light-2"
            >
              {h}
            </div>
          ))}
          {monthGrid.hasFestival && (
            <div className="text-center text-xs font-medium py-2 rounded dark:text-primary light:text-primary-dark dark:bg-primary/10 light:bg-primary/10">
              节日
            </div>
          )}
        </div>

        {/* 第1个十天 */}
        <div
          className="grid gap-1 mb-1"
          style={{
            gridTemplateColumns: monthGrid.hasFestival ? 'repeat(11, 1fr)' : 'repeat(10, 1fr)',
          }}
        >
          {monthGrid.days.slice(0, 10).map((cell) => (
            <DayButton
              key={cell.day}
              day={cell.day}
              tenday={cell.tenday}
              isCurrent={isCurrentDay(cell.day)}
              onClick={() => selectDay(cell.day)}
            />
          ))}
          {monthGrid.hasFestival && <div />}
        </div>

        {/* 第2个十天 */}
        <div
          className="grid gap-1 mb-1"
          style={{
            gridTemplateColumns: monthGrid.hasFestival ? 'repeat(11, 1fr)' : 'repeat(10, 1fr)',
          }}
        >
          {monthGrid.days.slice(10, 20).map((cell) => (
            <DayButton
              key={cell.day}
              day={cell.day}
              tenday={cell.tenday}
              isCurrent={isCurrentDay(cell.day)}
              onClick={() => selectDay(cell.day)}
            />
          ))}
          {monthGrid.hasFestival && <div />}
        </div>

        {/* 第3个十天 + 节日 */}
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: monthGrid.hasFestival ? 'repeat(11, 1fr)' : 'repeat(10, 1fr)',
          }}
        >
          {monthGrid.days.slice(20, 30).map((cell) => (
            <DayButton
              key={cell.day}
              day={cell.day}
              tenday={cell.tenday}
              isCurrent={isCurrentDay(cell.day)}
              onClick={() => selectDay(cell.day)}
            />
          ))}
          {monthGrid.hasFestival && (
            <FestivalButton
              name={monthGrid.festivalName!}
              isCurrent={isCurrentFestival(monthGrid.festivalName)}
              onClick={() => selectFestival(viewMonth)}
            />
          )}
        </div>

        {/* 额外节日（盾会日） */}
        {monthGrid.extraFestivalName && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => selectFestival(viewMonth)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors ${
                isCurrentFestival(monthGrid.extraFestivalName)
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5'
              }`}
            >
              <Shield className="w-4 h-4" />
              {monthGrid.extraFestivalName}
            </button>
          </div>
        )}
      </div>

      {/* 月份快捷导航 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
        <h3 className="text-sm font-medium mb-3 dark:text-text-dark light:text-text-light">
          月份导航
        </h3>
        <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
          {MONTHS.map((m) => (
            <button
              key={m.index}
              onClick={() => setViewMonth(m.index)}
              className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                viewMonth === m.index
                  ? 'bg-primary/20 text-primary'
                  : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* 节日列表 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
        <h3 className="text-sm font-medium mb-3 dark:text-text-dark light:text-text-light">
          年度节日
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { name: '隆冬节', month: 1, icon: Sun },
            { name: '绿草节', month: 4, icon: Flower2 },
            { name: '仲夏节', month: 7, icon: Sunrise },
            ...(isLeap ? [{ name: '盾会日', month: 7, icon: Shield }] : []),
            { name: '丰收节', month: 9, icon: Wheat },
            { name: '月之盛宴', month: 11, icon: PartyPopper },
          ].map((f) => {
            const Icon = f.icon;
            const isActive = dateInfo.isFestival && dateInfo.festivalName === f.name;
            return (
              <button
                key={f.name}
                onClick={() => {
                  setViewMonth(f.month);
                  selectFestival(f.month);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {f.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 日期按钮组件
function DayButton({
  day,
  tenday,
  isCurrent,
  onClick,
}: {
  day: number;
  tenday: number;
  isCurrent: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative aspect-square rounded-lg text-sm font-medium transition-colors flex flex-col items-center justify-center gap-0.5 ${
        isCurrent
          ? 'bg-primary text-white'
          : 'dark:text-text-dark light:text-text-light hover:bg-white/5 dark:bg-bg-dark-2/50 light:bg-bg-light-2/50'
      }`}
    >
      <span>{day}</span>
      <span className={`text-[10px] ${isCurrent ? 'text-white/70' : 'dark:text-text-dark-muted light:text-text-light-muted'}`}>
        第{getTendayName(tenday)}十天
      </span>
    </button>
  );
}

// 节日按钮组件
function FestivalButton({
  name,
  isCurrent,
  onClick,
}: {
  name: string;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const Icon = festivalIcons[name] || Sun;
  return (
    <button
      onClick={onClick}
      className={`aspect-square rounded-lg text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1 ${
        isCurrent
          ? 'bg-primary text-white'
          : 'dark:text-primary light:text-primary-dark hover:bg-primary/10 border dark:border-primary/30 light:border-primary/30'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{name}</span>
    </button>
  );
}
