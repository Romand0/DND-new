import { Link } from 'react-router-dom';
import { Calendar, ChevronRight, Dices, Inbox } from 'lucide-react';
import gameTimeStore from '@/data/gameTimeStore';
import calendarStore from '@/data/calendarStore';
import { useState, useEffect } from 'react';
import { getTimeOfDay } from '@/data/gameTimeStore';
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';

export default function NotesPage() {
  const [gameTime, setGameTime] = useState({ hour: 8, minute: 0 });
  const [calendarDate, setCalendarDate] = useState('');
  const { messages: outboxMessages } = useRoundTableInbox({ outbox: true });
  const pendingChecks = outboxMessages.filter(
    (m) => m.type === 'check_request' && m.status === 'pending',
  ).length;

  useEffect(() => {
    const updateTime = () => {
      const t = gameTimeStore.get();
      setGameTime({ hour: t.hour, minute: t.minute });
    };
    const updateCalendar = () => {
      const info = calendarStore.getDateInfo();
      const m = ['一','二','三','四','五','六','七','八','九','十','十一','十二'][info.month - 1];
      setCalendarDate(info.isFestival ? `${m}月·${info.festivalName}` : `${m}月${info.day}日`);
    };
    updateTime();
    updateCalendar();
    const unsubTime = gameTimeStore.subscribe(updateTime);
    const unsubCal = calendarStore.subscribe(updateCalendar);
    return () => {
      unsubTime();
      unsubCal();
    };
  }, []);

  const timeStr = `${String(gameTime.hour).padStart(2, '0')}:${String(gameTime.minute).padStart(2, '0')}`;
  const timeOfDay = getTimeOfDay(gameTime.hour, gameTime.minute);
  const isAM = gameTime.hour < 12;

  // 时针角度（12小时制）
  const hourAngle = ((gameTime.hour % 12) * 30 + gameTime.minute * 0.5);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold dark:text-text-dark light:text-text-light">
        剧情笔记
      </h1>

      {/* 上方：时钟 / 日历 / 骰子 三卡并排（窄屏也保持同行，视觉元素随屏收缩） */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Link
          to="/clock"
          className="group relative rounded-xl border p-3 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all hover:scale-[1.02] hover:border-primary/50 dark:border-border-dark dark:bg-card-dark light:border-border-light light:bg-card-light"
        >
          {/* 迷你表盘 */}
          <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-full border-2 dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 flex items-center justify-center">
            <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
              {/* 刻度 */}
              {[0, 90, 180, 270].map((angle, i) => (
                <line
                  key={i}
                  x1="40" y1="8" x2="40" y2="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.3"
                  transform={`rotate(${angle} 40 40)`}
                />
              ))}
              {/* 时针 */}
              <line
                x1="40" y1="40" x2="40" y2="20"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${hourAngle} 40 40)`}
                className="dark:text-text-dark light:text-text-light"
              />
              {/* 中心点 */}
              <circle cx="40" cy="40" r="3" fill="currentColor" className="dark:text-text-dark light:text-text-light" />
            </svg>
          </div>

          <div className="text-center">
            <div className="text-xl sm:text-2xl font-mono font-bold dark:text-text-dark light:text-text-light">
              {timeStr}
            </div>
            <div className="text-xs sm:text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {isAM ? 'AM' : 'PM'} · {timeOfDay}
            </div>
          </div>

          {/* 悬浮提示 */}
          <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
            <span className="flex items-center gap-1 text-primary font-medium">
              打开时钟 <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </Link>

        <Link
          to="/calendar"
          className="group relative rounded-xl border p-3 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all hover:scale-[1.02] hover:border-primary/50 dark:border-border-dark dark:bg-card-dark light:border-border-light light:bg-card-light"
        >
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg border-2 dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 flex items-center justify-center">
            <Calendar className="w-7 h-7 sm:w-10 sm:h-10 dark:text-text-dark-muted light:text-text-light-muted" />
          </div>

          <div className="text-center">
            <div className="text-base sm:text-xl font-bold dark:text-text-dark light:text-text-light">
              {calendarDate}
            </div>
            <div className="text-xs sm:text-sm dark:text-text-dark-muted light:text-text-light-muted">
              哈普托斯历
            </div>
          </div>

          {/* 悬浮提示 */}
          <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
            <span className="flex items-center gap-1 text-primary font-medium">
              打开日历 <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </Link>

        <Link
          to="/dice"
          className="group relative rounded-xl border p-3 sm:p-6 flex flex-col items-center justify-center gap-3 sm:gap-4 transition-all hover:scale-[1.02] hover:border-primary/50 dark:border-border-dark dark:bg-card-dark light:border-border-light light:bg-card-light"
        >
          <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg border-2 dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 flex items-center justify-center">
            <Dices className="w-7 h-7 sm:w-10 sm:h-10 dark:text-text-dark-muted light:text-text-light-muted" />
          </div>

          <div className="text-center">
            <div className="text-base sm:text-xl font-bold dark:text-text-dark light:text-text-light">
              线上骰子
            </div>
            <div className="text-xs sm:text-sm dark:text-text-dark-muted light:text-text-light-muted">
              d4 ~ d20
            </div>
          </div>

          {/* 悬浮提示 */}
          <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
            <span className="flex items-center gap-1 text-primary font-medium">
              打开骰子 <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </Link>
      </div>

      {/* 下方：圆桌入口 */}
      <Link
        to="/table"
        className="group flex items-center justify-between p-5 rounded-xl border transition-all hover:scale-[1.01] bg-gradient-to-r from-primary/15 via-accent/10 to-transparent dark:border-primary/40 dark:hover:border-primary/70 light:border-primary/40 light:hover:border-primary/70"
      >
        <div className="flex items-center gap-4">
          <div className="relative p-3 rounded-lg bg-primary/20">
            <Inbox className="w-6 h-6 text-primary" />
            {pendingChecks > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center">
                {pendingChecks}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light group-hover:text-primary transition-colors">
              圆桌 · 通用检定
            </h2>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {pendingChecks > 0
                ? `${pendingChecks} 条检定待玩家答复`
                : '向玩家抛送检定，查看答复进度'}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 dark:text-text-dark-muted light:text-text-light-muted group-hover:text-primary transition-colors" />
      </Link>
    </div>
  );
}
