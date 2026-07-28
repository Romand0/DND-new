import GameClock from '@/components/GameClock';
import gameTimeStore, { getTimeOfDay } from '@/data/gameTimeStore';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Minus, Plus, RotateCcw, Sun, Moon, Sunrise, Sunset, Coffee, Calendar } from 'lucide-react';

export default function GameClockPage() {
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    const update = () => {
      const t = gameTimeStore.get();
      setHour(t.hour);
      setMinute(t.minute);
    };
    update();
    return gameTimeStore.subscribe(update);
  }, []);

  const timeOfDay = getTimeOfDay(hour, minute);

  const timeOfDayInfo = [
    { name: '黎明', icon: Sunrise, start: '5:00', end: '6:00', color: 'text-orange-400' },
    { name: '上午', icon: Sun, start: '6:00', end: '12:00', color: 'text-yellow-400' },
    { name: '中午', icon: Coffee, start: '12:00', end: '13:00', color: 'text-amber-400' },
    { name: '下午', icon: Sun, start: '13:00', end: '18:00', color: 'text-orange-300' },
    { name: '黄昏', icon: Sunset, start: '18:00', end: '19:00', color: 'text-orange-500' },
    { name: '夜晚', icon: Moon, start: '19:00', end: '5:00', color: 'text-blue-400' },
  ];

  const quickTimes = [
    { label: '黎明', hour: 5, minute: 30 },
    { label: '早晨', hour: 8, minute: 0 },
    { label: '中午', hour: 12, minute: 0 },
    { label: '下午', hour: 14, minute: 0 },
    { label: '黄昏', hour: 18, minute: 30 },
    { label: '深夜', hour: 0, minute: 0 },
  ];

  const addMinutes = (m: number) => {
    gameTimeStore.addMinutes(m);
  };

  const reset = () => {
    gameTimeStore.set(8, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            游戏时间
          </h1>
        </div>
        <Link
          to="/calendar"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          日历
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左侧：钟表 */}
        <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-6 flex flex-col items-center">
          <GameClock size={300} interactive={true} />
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-4 text-center">
            拖拽时针或分针调整时间
          </p>
        </div>

        {/* 右侧：控制与信息 */}
        <div className="space-y-4">
          {/* 时间调整 */}
          <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
            <h3 className="text-sm font-medium mb-3 dark:text-text-dark light:text-text-light">
              时间调整
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => addMinutes(-60)}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
              >
                <Minus className="w-4 h-4" />
                1小时
              </button>
              <button
                onClick={() => addMinutes(60)}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                1小时
              </button>
              <button
                onClick={() => addMinutes(-10)}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
              >
                <Minus className="w-4 h-4" />
                10分钟
              </button>
              <button
                onClick={() => addMinutes(10)}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                10分钟
              </button>
              <button
                onClick={() => addMinutes(-1)}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
              >
                <Minus className="w-4 h-4" />
                1分钟
              </button>
              <button
                onClick={() => addMinutes(1)}
                className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                1分钟
              </button>
            </div>
            <button
              onClick={reset}
              className="w-full mt-3 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              重置为 8:00
            </button>
          </div>

          {/* 快速跳转 */}
          <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
            <h3 className="text-sm font-medium mb-3 dark:text-text-dark light:text-text-light">
              快速跳转
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {quickTimes.map((qt) => (
                <button
                  key={qt.label}
                  onClick={() => gameTimeStore.set(qt.hour, qt.minute)}
                  className="px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:bg-primary/10 hover:text-primary transition-colors text-sm"
                >
                  {qt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 时段说明 */}
          <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4">
            <h3 className="text-sm font-medium mb-3 dark:text-text-dark light:text-text-light">
              时段划分
            </h3>
            <div className="space-y-2">
              {timeOfDayInfo.map((t) => {
                const Icon = t.icon;
                const isActive = timeOfDay === t.name;
                return (
                  <div
                    key={t.name}
                    className={`flex items-center justify-between text-sm ${
                      isActive
                        ? `${t.color} font-medium`
                        : 'dark:text-text-dark-muted light:text-text-light-muted'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {t.name}
                    </div>
                    <span className="text-xs">{t.start} - {t.end}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}