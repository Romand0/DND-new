import { useState, useEffect, useRef, useCallback } from 'react';
import gameTimeStore, { getTimeOfDay } from '@/data/gameTimeStore';

interface Props {
  size?: number;
  interactive?: boolean;
}

export default function GameClock({ size = 240, interactive = true }: Props) {
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const clockRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'hour' | 'minute' | null>(null);
  const lastAngleRef = useRef<number | null>(null);

  // 订阅时间变化
  useEffect(() => {
    const update = () => {
      const t = gameTimeStore.get();
      setHour(t.hour);
      setMinute(t.minute);
    };
    update();
    return gameTimeStore.subscribe(update);
  }, []);

  // 计算指针角度
  const minuteAngle = minute * 6; // 360/60 = 6
  const hourAngle = ((hour % 12) * 30) + (minute * 0.5); // 360/12 = 30

  // 获取鼠标/触摸在表盘上的角度（以12点方向为0度，顺时针）
  const getAngleFromEvent = useCallback((clientX: number, clientY: number): number => {
    if (!clockRef.current) return 0;
    const rect = clockRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    // atan2 返回弧度，0度在3点方向，顺时针为负，逆时针为正
    // 转换为以12点方向为0度，顺时针为正
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, []);

  // 处理拖拽
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    const angle = getAngleFromEvent(e.clientX, e.clientY);

    if (draggingRef.current === 'minute') {
      // 分针：角度 / 6 = 分钟数
      const newMinute = Math.round(angle / 6) % 60;
      gameTimeStore.set(hour, newMinute);
    } else if (draggingRef.current === 'hour') {
      // 时针：需要考虑跨越 12 点的情况
      // 根据角度计算小时（12小时制）
      let newHour12 = angle / 30;
      newHour12 = newHour12 % 12;
      if (newHour12 < 0) newHour12 += 12;

      // 结合当前分钟的小时偏移，保持连续
      const minuteOffset = (minute / 60) * 30;
      // 更精确的小时值（含小数）
      let preciseHour = (angle - minuteOffset) / 30;
      preciseHour = ((preciseHour % 12) + 12) % 12;
      const roundedHour = Math.round(preciseHour) % 12;

      // 确定 AM/PM：保持与当前相同的上下午，除非跨越了 12 点
      const isPm = hour >= 12;
      let newHour = roundedHour + (isPm ? 12 : 0);
      if (newHour === 24) newHour = 12; // 12 PM
      if (newHour === 12 && !isPm) newHour = 0; // 12 AM

      // 处理跨越 12 点的情况：通过角度变化方向判断
      if (lastAngleRef.current != null) {
        const diff = angle - lastAngleRef.current;
        // 顺时针跨越 12 点
        if (diff > 180) {
          newHour = (newHour + 12) % 24;
        }
        // 逆时针跨越 12 点
        if (diff < -180) {
          newHour = (newHour + 12) % 24;
        }
      }

      gameTimeStore.set(newHour, minute);
    }

    lastAngleRef.current = angle;
  }, [getAngleFromEvent, hour, minute]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
    lastAngleRef.current = null;
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const startDrag = (type: 'hour' | 'minute') => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = type;
    lastAngleRef.current = getAngleFromEvent(e.clientX, e.clientY);
    document.body.style.cursor = 'grabbing';
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const timeOfDay = getTimeOfDay(hour, minute);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  const center = size / 2;
  const clockRadius = size * 0.48;
  const hourHandLength = size * 0.28;
  const minuteHandLength = size * 0.38;
  const hourHandWidth = size * 0.04;
  const minuteHandWidth = size * 0.025;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={clockRef}
        className={`relative rounded-full border-4 dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light shadow-lg ${
          interactive ? 'cursor-pointer' : ''
        }`}
        style={{ width: size, height: size }}
      >
        {/* 刻度 */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = i * 30; // 360/12 = 30
          const rad = (angle - 90) * (Math.PI / 180);
          const outerX = center + clockRadius * Math.cos(rad);
          const outerY = center + clockRadius * Math.sin(rad);
          const innerX = center + (clockRadius - size * 0.06) * Math.cos(rad);
          const innerY = center + (clockRadius - size * 0.06) * Math.sin(rad);
          return (
            <div
              key={i}
              className="absolute dark:bg-border-dark light:bg-border-light"
              style={{
                width: size * 0.012,
                height: size * 0.06,
                left: outerX - size * 0.006,
                top: Math.min(outerY, innerY),
                transform: `rotate(${angle}deg)`,
                transformOrigin: 'center top',
              }}
            />
          );
        })}

        {/* 小时数字 */}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num, i) => {
          const angle = i * 30;
          const rad = (angle - 90) * (Math.PI / 180);
          const r = clockRadius - size * 0.13;
          const x = center + r * Math.cos(rad);
          const y = center + r * Math.sin(rad);
          return (
            <div
              key={num}
              className="absolute dark:text-text-dark light:text-text-light font-bold"
              style={{
                fontSize: size * 0.06,
                left: x,
                top: y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {num}
            </div>
          );
        })}

        {/* 时针 */}
        <div
          onPointerDown={startDrag('hour')}
          className={`absolute dark:bg-text-dark light:bg-text-light rounded-full ${
            interactive ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{
            width: hourHandWidth,
            height: hourHandLength,
            left: center - hourHandWidth / 2,
            top: center - hourHandLength + hourHandLength * 0.2,
            transform: `rotate(${hourAngle}deg)`,
            transformOrigin: `50% ${hourHandLength * 0.8}px`,
          }}
        />

        {/* 分针 */}
        <div
          onPointerDown={startDrag('minute')}
          className={`absolute dark:bg-primary light:bg-primary rounded-full ${
            interactive ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{
            width: minuteHandWidth,
            height: minuteHandLength,
            left: center - minuteHandWidth / 2,
            top: center - minuteHandLength + minuteHandLength * 0.2,
            transform: `rotate(${minuteAngle}deg)`,
            transformOrigin: `50% ${minuteHandLength * 0.8}px`,
          }}
        />

        {/* 中心点 */}
        <div
          className="absolute rounded-full dark:bg-text-dark light:bg-text-light"
          style={{
            width: size * 0.06,
            height: size * 0.06,
            left: center - size * 0.03,
            top: center - size * 0.03,
          }}
        />
      </div>

      {/* 时间显示 */}
      <div className="text-center">
        <div className="text-3xl font-mono font-bold dark:text-text-dark light:text-text-light">
          {timeStr}
        </div>
        <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted mt-1">
          {timeOfDay}
        </div>
      </div>
    </div>
  );
}