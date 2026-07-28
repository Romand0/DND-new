import { useState, useEffect, useRef, useCallback } from 'react';
import gameTimeStore, { getTimeOfDay } from '@/data/gameTimeStore';

interface Props {
  size?: number;
  interactive?: boolean;
}

/** 角度差归一化到 [-180, 180] */
function angleDelta(current: number, last: number): number {
  let diff = current - last;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

const DAY_MINUTES = 24 * 60;

export default function GameClock({ size = 240, interactive = true }: Props) {
  // smoothTotalMinutes: 浮点总分钟数，用于流畅渲染
  const [smoothTotalMinutes, setSmoothTotalMinutes] = useState(8 * 60);
  const [draggingHand, setDraggingHand] = useState<'hour' | 'minute' | null>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const draggingHandRef = useRef<'hour' | 'minute' | null>(null);
  const lastAngleRef = useRef(0);
  const smoothRef = useRef(8 * 60);

  /** 同时更新 ref 和 state */
  const setSmooth = useCallback((val: number) => {
    smoothRef.current = val;
    setSmoothTotalMinutes(val);
  }, []);

  // 订阅 store 变化（拖拽时跳过，避免覆盖流畅值）
  useEffect(() => {
    const update = () => {
      if (draggingHandRef.current) return;
      const t = gameTimeStore.get();
      setSmooth(t.hour * 60 + t.minute);
    };
    update();
    return gameTimeStore.subscribe(update);
  }, [setSmooth]);

  // 渲染用的时/分（整数，用于显示和时段判断）
  const totalMin = smoothTotalMinutes;
  const renderHour = Math.floor(totalMin / 60) % 24;
  const renderMinute = Math.floor(totalMin % 60);

  // 指针角度（用浮点值实现流畅旋转）
  const minuteAngle = (totalMin % 60) * 6; // 360/60 = 6°/min
  const hourAngle = ((totalMin / 60) % 12) * 30; // 360/12 = 30°/hour

  // 获取事件位置相对表盘中心的角度（12点方向 = 0°，顺时针为正）
  const getAngleFromEvent = useCallback((clientX: number, clientY: number): number => {
    if (!clockRef.current) return 0;
    const rect = clockRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, []);

  // 拖拽处理：角度增量驱动，两根指针联动
  const handlePointerMove = useCallback((e: PointerEvent) => {
    const hand = draggingHandRef.current;
    if (!hand) return;
    e.preventDefault();

    const angle = getAngleFromEvent(e.clientX, e.clientY);
    const delta = angleDelta(angle, lastAngleRef.current);
    lastAngleRef.current = angle;

    let total = smoothRef.current;
    if (hand === 'minute') {
      // 分针：1° ≈ 1/6 分钟
      total += delta / 6;
    } else {
      // 时针：1° = 2 分钟（30° = 1h = 60min）
      total += delta * 2;
    }
    // 归一化到 [0, DAY_MINUTES)
    total = ((total % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

    setSmooth(total);

    // 写入 store（整数，持久化）
    const h = Math.floor(total / 60) % 24;
    const m = Math.floor(total % 60);
    gameTimeStore.set(h, m);
  }, [getAngleFromEvent, setSmooth]);

  const handlePointerUp = useCallback(() => {
    draggingHandRef.current = null;
    setDraggingHand(null);
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    // 从 store 同步最终整数值
    const t = gameTimeStore.get();
    setSmooth(t.hour * 60 + t.minute);
  }, [handlePointerMove, setSmooth]);

  const startDrag = (type: 'hour' | 'minute') => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    draggingHandRef.current = type;
    setDraggingHand(type);
    lastAngleRef.current = getAngleFromEvent(e.clientX, e.clientY);
    document.body.style.cursor = 'grabbing';
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const timeOfDay = getTimeOfDay(renderHour, renderMinute);
  const timeStr = `${String(renderHour).padStart(2, '0')}:${String(renderMinute).padStart(2, '0')}`;

  const center = size / 2;
  const clockRadius = size * 0.48;
  const hourHandLength = size * 0.28;
  const minuteHandLength = size * 0.38;
  const hourHandWidth = size * 0.04;
  const minuteHandWidth = size * 0.025;

  // 光圈样式
  const glowStyle = (isActive: boolean): React.CSSProperties =>
    isActive
      ? {
          boxShadow: `0 0 ${size * 0.05}px ${size * 0.02}px rgba(255,255,255,0.7)`,
          filter: `drop-shadow(0 0 ${size * 0.015}px rgba(255,255,255,0.9))`,
        }
      : {};

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
          const angle = i * 30;
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
          className={`absolute dark:bg-text-dark light:bg-text-light rounded-full transition-[box-shadow,filter] duration-150 ${
            interactive ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{
            width: hourHandWidth,
            height: hourHandLength,
            left: center - hourHandWidth / 2,
            top: center - hourHandLength + hourHandLength * 0.2,
            transform: `rotate(${hourAngle}deg)`,
            transformOrigin: `50% ${hourHandLength * 0.8}px`,
            ...glowStyle(draggingHand === 'hour'),
          }}
        />

        {/* 分针 */}
        <div
          onPointerDown={startDrag('minute')}
          className={`absolute dark:bg-primary light:bg-primary rounded-full transition-[box-shadow,filter] duration-150 ${
            interactive ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
          style={{
            width: minuteHandWidth,
            height: minuteHandLength,
            left: center - minuteHandWidth / 2,
            top: center - minuteHandLength + minuteHandLength * 0.2,
            transform: `rotate(${minuteAngle}deg)`,
            transformOrigin: `50% ${minuteHandLength * 0.8}px`,
            ...glowStyle(draggingHand === 'minute'),
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
