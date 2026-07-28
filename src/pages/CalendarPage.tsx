import { useState, useEffect } from 'react';
import calendarStore from '@/data/calendarStore';
import gameTimeStore from '@/data/gameTimeStore';
import {
  MONTHS,
  getMonthGrid,
  dayOfYearToDate,
  dateToDayOfYear,
  isLeapYear,
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

  // 用现实年份作为参考年份（仅用于判断闰年）
  const refYear = new Date().getFullYear();
  const isLeap = isLeapYear(refYear);

  // 订阅日历和时间变化
  useEffect(() => {
    const updateCalendar = () => {
      const c = calendarStore.get();
      setCalendar(c);
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
  const monthGrid = getMonthGrid(viewMonth, refYear);

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
    const doy = dateToDayOfYear(viewMonth, day, refYear);
    calendarStore.setDate(refYear, doy);
  };

  const selectFestival = (festivalMonth: number) => {
    const doy = dateToDayOfYear(festivalMonth, 30, refYear) + 1;
    calendarStore.setDate(refYear, doy);
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

  // 格式化当前日期显示
  const currentDateDisplay = dateInfo.isFestival
    ? `${MONTHS[dateInfo.month - 1].name} · ${dateInfo.festivalName}`
    : `${MONTHS[dateInfo.month - 1].name} ${dateInfo.day}日`;

  // 节日列表
  const festivals = [
    { name: '隆冬节', month: 1, afterDay: 30 },
    { name: '绿草节', month: 4, afterDay: 30 },
    { name: '仲夏节', month: 7, afterDay: 30 },
    ...(isLeap ? [{ name: '盾会日', month: 7, afterDay: 30 }] : []),
    { name: '丰收节', month: 9, afterDay: 30 },
    { name: '月之盛宴', month: 11, afterDay: 30 },
  ];

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            哈普托斯历
          </h1>
          <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
            {isLeap ? '（闰年）' : ''}
          </span>
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

      {/* 当前日期概览 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xl font-bold dark:text-text-dark light:text-text-light">
            {currentDateDisplay}
          </div>
          {calendar.linkedToClock && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary">
              <Clock className="w-4 h-4" />
              <span className="font-mono font-medium">{timeStr}</span>
            </div>
          )}
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
            {currentMonthInfo.officialName}
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
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3 sm:p-4">
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
              className="text-center text-xs font-medium py-1.5 rounded dark:text-text-dark-muted light:text-text-light-muted dark:bg-bg-dark-2 light:bg-bg-light-2"
            >
              {h}
            </div>
          ))}
          {monthGrid.hasFestival && (
            <div className="text-center text-xs font-medium py-1.5 rounded dark:text-primary light:text-primary-dark dark:bg-primary/10 light:bg-primary/10">
              节日
            </div>
          )}
        </div>

        {/* 三个十天 */}
        {[0, 10, 20].map((start) => (
          <div
            key={start}
            className="grid gap-1 mb-1"
            style={{
              gridTemplateColumns: monthGrid.hasFestival ? 'repeat(11, 1fr)' : 'repeat(10, 1fr)',
            }}
          >
            {monthGrid.days.slice(start, start + 10).map((cell) => (
              <button
                key={cell.day}
                onClick={() => selectDay(cell.day)}
                className={`aspect-square rounded-lg text-sm font-medium transition-colors flex items-center justify-center ${
                  isCurrentDay(cell.day)
                    ? 'bg-primary text-white'
                    : 'dark:text-text-dark light:text-text-light hover:bg-white/5 dark:bg-bg-dark-2/50 light:bg-bg-light-2/50'
                }`}
              >
                {cell.day}
              </button>
            ))}
            {monthGrid.hasFestival && start === 20 && (
              <button
                onClick={() => selectFestival(viewMonth)}
                className={`aspect-square rounded-lg text-xs font-medium transition-colors flex items-center justify-center ${
                  isCurrentFestival(monthGrid.festivalName)
                    ? 'bg-primary text-white'
                    : 'dark:text-primary light:text-primary-dark hover:bg-primary/10 border dark:border-primary/30 light:border-primary/30'
                }`}
              >
                {monthGrid.festivalName}
              </button>
            )}
            {monthGrid.hasFestival && start !== 20 && <div />}
          </div>
        ))}

        {/* 额外节日（盾会日） */}
        {monthGrid.extraFestivalName && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => selectFestival(viewMonth)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                isCurrentFestival(monthGrid.extraFestivalName)
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              {monthGrid.extraFestivalName}
            </button>
          </div>
        )}
      </div>

      {/* 月份快捷导航 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3 sm:p-4">
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 sm:gap-2">
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
              {m.name.replace('月', '')}
            </button>
          ))}
        </div>
      </div>

      {/* 节日卡片 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3 sm:p-4">
        <h3 className="text-sm font-medium mb-3 dark:text-text-dark light:text-text-light">
          年度节日
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {festivals.map((f) => {
            const Icon = festivalIcons[f.name] || Sun;
            const isActive = dateInfo.isFestival && dateInfo.festivalName === f.name;
            return (
              <button
                key={f.name}
                onClick={() => {
                  setViewMonth(f.month);
                  selectFestival(f.month);
                }}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg text-sm border transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{f.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}