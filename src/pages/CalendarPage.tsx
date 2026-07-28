import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import calendarStore from '@/data/calendarStore';
import gameTimeStore from '@/data/gameTimeStore';
import {
  MONTHS,
  getMonthGrid,
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

  const refYear = new Date().getFullYear();
  const isLeap = isLeapYear(refYear);

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

  const isCurrentDay = (day: number): boolean => {
    if (dateInfo.isFestival) return false;
    return dateInfo.month === viewMonth && dateInfo.day === day;
  };

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

  const currentDateDisplay = dateInfo.isFestival
    ? `${MONTHS[dateInfo.month - 1].name} · ${dateInfo.festivalName}`
    : `${MONTHS[dateInfo.month - 1].name} ${dateInfo.day}日`;

  // 构建当月的节日列表（包括额外节日如盾会日）
  const currentMonthFestivals = [];
  if (monthGrid.festivalName) {
    currentMonthFestivals.push({
      name: monthGrid.festivalName,
      isCurrent: isCurrentFestival(monthGrid.festivalName),
    });
  }
  if (monthGrid.extraFestivalName) {
    currentMonthFestivals.push({
      name: monthGrid.extraFestivalName,
      isCurrent: isCurrentFestival(monthGrid.extraFestivalName),
    });
  }

  const festivals = [
    { name: '隆冬节', month: 1 },
    { name: '绿草节', month: 4 },
    { name: '仲夏节', month: 7 },
    ...(isLeap ? [{ name: '盾会日', month: 7 }] : []),
    { name: '丰收节', month: 9 },
    { name: '月之盛宴', month: 11 },
  ];

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            哈普托斯历
          </h1>
          {isLeap && (
            <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              （闰年）
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/clock"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
          >
            <Clock className="w-4 h-4" />
            时钟
          </Link>
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

      {/* 日历与节日容器：桌面端左右布局，移动端上下布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 日历网格（占2/3） */}
        <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3 sm:p-4 lg:col-span-2 min-w-0">
          {/* 表头 */}
          <div className="grid grid-cols-10 gap-1 mb-2">
            {['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'].map((h) => (
              <div
                key={h}
                className="text-center text-xs font-medium py-1.5 rounded dark:text-text-dark-muted light:text-text-light-muted dark:bg-bg-dark-2 light:bg-bg-light-2"
              >
                {h}
              </div>
            ))}
          </div>

          {/* 三个十天 */}
          {[0, 10, 20].map((start) => (
            <div key={start} className="grid grid-cols-10 gap-1 mb-1">
              {monthGrid.days.slice(start, start + 10).map((cell) => (
                <button
                  key={cell.day}
                  onClick={() => selectDay(cell.day)}
                  className={`aspect-square rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center ${
                    isCurrentDay(cell.day)
                      ? 'bg-primary text-white'
                      : 'dark:text-text-dark light:text-text-light hover:bg-white/5 dark:bg-bg-dark-2/50 light:bg-bg-light-2/50'
                  }`}
                >
                  {cell.day}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* 节日卡片（占1/3） */}
        {currentMonthFestivals.length > 0 && (
          <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4 flex flex-col justify-center min-w-0">
            {currentMonthFestivals.map((f) => {
              const Icon = festivalIcons[f.name] || Sun;
              return (
                <button
                  key={f.name}
                  onClick={() => selectFestival(viewMonth)}
                  className={`w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 transition-colors ${
                    f.isCurrent
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'dark:border-primary/30 light:border-primary/30 dark:text-primary light:text-primary hover:bg-primary/5'
                  } ${currentMonthFestivals.length > 1 ? 'mb-3 last:mb-0' : ''}`}
                >
                  <Icon className="w-10 h-10" />
                  <span className="text-lg font-bold">{f.name}</span>
                  <span className="text-xs opacity-70">点击选中</span>
                </button>
              );
            })}
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

      {/* 年度节日列表 */}
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