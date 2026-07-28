import { Link } from 'react-router-dom';
import { Clock, Calendar, ChevronRight } from 'lucide-react';
import gameTimeStore from '@/data/gameTimeStore';
import calendarStore from '@/data/calendarStore';
import { useState, useEffect } from 'react';
import { getTimeOfDay } from '@/data/gameTimeStore';
import { MONTHS } from '@/data/calendarData';

export default function NotesPage() {
  const [gameTime, setGameTime] = useState({ hour: 8, minute: 0 });
  const [calendarDate, setCalendarDate] = useState('');

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
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold dark:text-text-dark light:text-text-light">
          剧情笔记
        </h1>
        <p className="mt-2 dark:text-text-dark-muted light:text-text-light-muted">
          记录剧情、NPC关系、世界设定，随时查阅
        </p>
      </div>

      {/* 时间卡片 — 左右分割 */}
      <div className="grid grid-cols-2 gap-0 rounded-xl border dark:border-border-dark light:border-border-light overflow-hidden dark:bg-card-dark light:bg-card-light">
        {/* 左侧：时钟 */}
        <Link
          to="/clock"
          className="group relative p-6 flex flex-col items-center justify-center gap-4 hover:bg-white/5 transition-colors"
        >
          {/* 迷你表盘 */}
          <div className="relative w-20 h-20 rounded-full border-2 dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 flex items-center justify-center">
            <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0">
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
            <div className="text-2xl font-mono font-bold dark:text-text-dark light:text-text-light">
              {timeStr}
            </div>
            <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              {isAM ? 'AM' : 'PM'} · {timeOfDay}
            </div>
          </div>

          {/* 悬浮提示 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
            <span className="flex items-center gap-1 text-primary font-medium">
              打开时钟 <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </Link>

        {/* 分割线 */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px dark:bg-border-dark light:bg-border-light hidden sm:block" style={{ display: 'none' }} />

        {/* 右侧：日历 */}
        <Link
          to="/calendar"
          className="group relative p-6 flex flex-col items-center justify-center gap-4 hover:bg-white/5 transition-colors border-l dark:border-border-dark light:border-border-light"
        >
          {/* 日历图标 */}
          <div className="w-20 h-20 rounded-lg border-2 dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 flex items-center justify-center">
            <Calendar className="w-10 h-10 dark:text-text-dark-muted light:text-text-light-muted" />
          </div>

          <div className="text-center">
            <div className="text-xl font-bold dark:text-text-dark light:text-text-light">
              {calendarDate}
            </div>
            <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
              哈普托斯历
            </div>
          </div>

          {/* 悬浮提示 */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
            <span className="flex items-center gap-1 text-primary font-medium">
              打开日历 <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </Link>
      </div>

      {/* 功能说明 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-text-dark light:text-text-light">
          剧情工具
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium dark:text-text-dark light:text-text-light">游戏时钟</h3>
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                可拖拽调整的游戏内时钟，支持时针/分针联动，实时显示时段
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium dark:text-text-dark light:text-text-light">哈普托斯历</h3>
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                被遗忘的国度世界观的日历系统，包含节日和闰年计算
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 占位内容：后续可扩展 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-6">
        <div className="text-center py-8">
          <p className="dark:text-text-dark-muted light:text-text-light-muted">
            更多剧情笔记功能即将上线...
          </p>
        </div>
      </div>
    </div>
  );
}