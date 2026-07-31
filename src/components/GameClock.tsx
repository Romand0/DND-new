import { useState, useEffect, useRef, useCallback } from 'react';
import gameTimeStore, { getTimeOfDay } from '@/data/gameTimeStore';

interface Props {
  size?: number;
  interactive?: boolean;
}

/** 角度差归一化到 [-180, 180]，处理跨越 0/360 边界 */
function angleDelta(current: number, last: number): number {
  let diff = current - last;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

const DAY_MINUTES = 24 * 60;

export default function GameClock({ size = 240, interactive = true }: Props) {
  // 浮点总分钟数，用于流畅渲染（不取整）
  const [smoothTotalMinutes, setSmoothTotalMinutes] = useState(8 * 60);
  const [draggingHand, setDraggingHand] = useState<'hour' | 'minute' | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  // 全部用 ref 存储可变状态，避免闭包陷阱
  const draggingHandRef = useRef<'hour' | 'minute' | null>(null);
  const lastAngleRef = useRef(0);
  const smoothRef = useRef(8 * 60);
  // rAF 节流：避免每次 pointermove 都触发 React setState
  const rafIdRef = useRef<number | null>(null);
  // 拖拽期间累积的总分钟数，用 ref 读取避免闭包过期
  const pendingTotalRef = useRef(0);

  const setSmooth = useCallback((val: number) => {
    smoothRef.current = val;
    setSmoothTotalMinutes(val);
  }, []);

  // 订阅 store（拖拽中跳过，避免覆盖流畅浮点值）
  useEffect(() => {
    const update = () => {
      if (draggingHandRef.current) return;
      const t = gameTimeStore.get();
      setSmooth(t.hour * 60 + t.minute);
    };
    update();
    return gameTimeStore.subscribe(update);
  }, [setSmooth]);

  // 卸载时清理 rAF
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // --- 渲染值 ---
  const totalMin = smoothTotalMinutes;
  const renderHour = Math.floor(totalMin / 60) % 24;
  const renderMinute = Math.floor(totalMin % 60);
  // 浮点角度 → 流畅旋转
  const minuteAngle = (totalMin % 60) * 6;
  const hourAngle = ((totalMin / 60) % 12) * 30;

  // --- 几何参数 ---
  const center = size / 2;
  const clockRadius = size * 0.46;
  const hourHandLen = size * 0.27;
  const minuteHandLen = size * 0.37;
  const hourHandW = size * 0.035;
  const minuteHandW = size * 0.022;

  // --- 角度计算 ---
  const getAngleFromEvent = useCallback((clientX: number, clientY: number): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    return angle;
  }, []);

  // --- 指针按下：在 SVG 上捕获 pointer，后续 move/up 全由 SVG 接收 ---
  const handleHandDown = (type: 'hour' | 'minute') => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    draggingHandRef.current = type;
    setDraggingHand(type);
    lastAngleRef.current = getAngleFromEvent(e.clientX, e.clientY);
    // 在 SVG 元素上捕获 pointer，确保拖拽期间所有事件都发到 SVG
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  // --- 指针移动：角度增量驱动，rAF 节流 + 拖拽期间不写 store ---
  const handlePointerMove = (e: React.PointerEvent) => {
    const hand = draggingHandRef.current;
    if (!hand) return;
    e.preventDefault();

    const angle = getAngleFromEvent(e.clientX, e.clientY);
    const delta = angleDelta(angle, lastAngleRef.current);
    lastAngleRef.current = angle;

    let total = smoothRef.current;
    if (hand === 'minute') {
      total += delta / 6; // 360° / 60min = 6°/min → 1° = 1/6 min
    } else {
      total += delta * 2; // 30°/hour = 60min → 1° = 2min
    }
    total = ((total % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    pendingTotalRef.current = total;

    // rAF 节流：合并同一帧内的多次 pointermove 为一次 setState
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        setSmooth(pendingTotalRef.current);
      });
    }
  };

  // --- 指针抬起：拖拽结束时一次性写入 store（持久化 + 通知其他订阅者） ---
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingHandRef.current) return;
    e.preventDefault();
    draggingHandRef.current = null;
    setDraggingHand(null);
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // pointerId 可能已释放，忽略
    }
    // 取消可能残留的 rAF
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    // 确保最终浮点值已同步
    setSmooth(pendingTotalRef.current);
    // 一次性写入 store（localStorage + 通知导航栏等其他订阅者）
    const total = pendingTotalRef.current;
    const h = Math.floor(total / 60) % 24;
    const m = Math.floor(total % 60);
    gameTimeStore.set(h, m);
  };

  const timeOfDay = getTimeOfDay(renderHour, renderMinute);
  const timeStr = `${String(renderHour).padStart(2, '0')}:${String(renderMinute).padStart(2, '0')}`;

  // 光圈 filter
  const glowFilter = (active: boolean) =>
    active ? `drop-shadow(0 0 ${size * 0.025}px rgba(255,255,255,0.95))` : 'none';

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="game-clock-svg select-none"
        style={{ touchAction: interactive ? 'none' : 'auto' }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* 表盘背景 */}
        <circle
          cx={center}
          cy={center}
          r={clockRadius}
          fill="var(--clock-face)"
          stroke="var(--clock-border)"
          strokeWidth={size * 0.018}
        />

        {/* 刻度 */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = i * 30;
          const rad = (angle - 90) * (Math.PI / 180);
          const outerR = clockRadius * 0.92;
          const innerR = clockRadius * 0.82;
          return (
            <line
              key={i}
              x1={center + innerR * Math.cos(rad)}
              y1={center + innerR * Math.sin(rad)}
              x2={center + outerR * Math.cos(rad)}
              y2={center + outerR * Math.sin(rad)}
              stroke="var(--clock-tick)"
              strokeWidth={i % 3 === 0 ? size * 0.018 : size * 0.01}
              strokeLinecap="round"
            />
          );
        })}

        {/* 小时数字 */}
        {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num, i) => {
          const angle = i * 30;
          const rad = (angle - 90) * (Math.PI / 180);
          const r = clockRadius * 0.68;
          const x = center + r * Math.cos(rad);
          const y = center + r * Math.sin(rad);
          return (
            <text
              key={num}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--clock-num)"
              style={{ fontSize: size * 0.07, fontWeight: 700, userSelect: 'none' }}
            >
              {num}
            </text>
          );
        })}

        {/* 时针 — 透明宽 hit area */}
        <line
          x1={center}
          y1={center}
          x2={center}
          y2={center - hourHandLen}
          stroke="transparent"
          strokeWidth={Math.max(size * 0.1, hourHandW * 3)}
          strokeLinecap="round"
          transform={`rotate(${hourAngle} ${center} ${center})`}
          onPointerDown={handleHandDown('hour')}
          style={{ cursor: interactive ? 'grab' : 'default', touchAction: interactive ? 'none' : 'auto' }}
        />
        {/* 时针 — 可见 */}
        <line
          x1={center}
          y1={center}
          x2={center}
          y2={center - hourHandLen}
          stroke="var(--clock-hour-hand)"
          strokeWidth={hourHandW}
          strokeLinecap="round"
          transform={`rotate(${hourAngle} ${center} ${center})`}
          pointerEvents="none"
          style={{
            filter: glowFilter(draggingHand === 'hour'),
            transition: draggingHand === 'hour'
              ? 'none'
              : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s',
          }}
        />

        {/* 分针 — 透明宽 hit area */}
        <line
          x1={center}
          y1={center}
          x2={center}
          y2={center - minuteHandLen}
          stroke="transparent"
          strokeWidth={Math.max(size * 0.08, minuteHandW * 3)}
          strokeLinecap="round"
          transform={`rotate(${minuteAngle} ${center} ${center})`}
          onPointerDown={handleHandDown('minute')}
          style={{ cursor: interactive ? 'grab' : 'default', touchAction: interactive ? 'none' : 'auto' }}
        />
        {/* 分针 — 可见 */}
        <line
          x1={center}
          y1={center}
          x2={center}
          y2={center - minuteHandLen}
          stroke="var(--clock-minute-hand)"
          strokeWidth={minuteHandW}
          strokeLinecap="round"
          transform={`rotate(${minuteAngle} ${center} ${center})`}
          pointerEvents="none"
          style={{
            filter: glowFilter(draggingHand === 'minute'),
            transition: draggingHand === 'minute'
              ? 'none'
              : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s',
          }}
        />

        {/* 中心点 */}
        <circle
          cx={center}
          cy={center}
          r={size * 0.03}
          fill="var(--clock-center)"
        />
      </svg>

      {/* 时间显示 */}
      <div className="text-center select-none">
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
