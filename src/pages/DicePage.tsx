import { useState, useRef, useEffect } from 'react';
import {
  Dices,
  X,
  RotateCcw,
  Sparkles,
  Sigma,
  List,
} from 'lucide-react';

interface DiceProps {
  type: number;
  size?: number;
  onRoll: (value: number) => void;
  onBatchRequest: () => void;
  result: number | null;
}

function rollDie(max: number): number {
  return Math.floor(Math.random() * max) + 1;
}

/**
 * 立体骰子 SVG 组件
 * 每种骰子都绘制为多面可见面，通过不同渐变模拟光照
 */
function DiceShape({ type, size }: { type: number; size: number }) {
  const s = size;
  const id = type;

  switch (type) {
    case 4: {
      // 四面体 — 三个可见面
      const apex = { x: s * 0.5, y: s * 0.1 };
      const left = { x: s * 0.12, y: s * 0.82 };
      const right = { x: s * 0.88, y: s * 0.82 };
      const front = { x: s * 0.5, y: s * 0.55 };
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`g${id}a`} x1="0%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#ff6b6b" /><stop offset="100%" stopColor="#c92a2a" />
            </linearGradient>
            <linearGradient id={`g${id}b`} x1="100%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#e63946" /><stop offset="100%" stopColor="#9d0208" />
            </linearGradient>
            <linearGradient id={`g${id}c`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#c92a2a" /><stop offset="100%" stopColor="#6a040f" />
            </linearGradient>
          </defs>
          <polygon points={`${apex.x},${apex.y} ${left.x},${left.y} ${front.x},${front.y}`} fill={`url(#g${id}a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${apex.x},${apex.y} ${right.x},${right.y} ${front.x},${front.y}`} fill={`url(#g${id}b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${left.x},${left.y} ${right.x},${right.y} ${front.x},${front.y}`} fill={`url(#g${id}c)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    case 6: {
      // 立方体 — 顶角正对屏幕（六边形轮廓 + 三个菱形面）
      const cx = s * 0.5;
      const cy = s * 0.5;
      const r = s * 0.42;
      // 六边形顶点（尖朝上）
      const v = [
        { x: cx, y: cy - r },                              // 0 上
        { x: cx + r * 0.866, y: cy - r * 0.5 },            // 1 右上
        { x: cx + r * 0.866, y: cy + r * 0.5 },            // 2 右下
        { x: cx, y: cy + r },                              // 3 下
        { x: cx - r * 0.866, y: cy + r * 0.5 },            // 4 左下
        { x: cx - r * 0.866, y: cy - r * 0.5 },            // 5 左上
      ];
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`g${id}a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffd93d" /><stop offset="100%" stopColor="#f4a261" />
            </linearGradient>
            <linearGradient id={`g${id}b`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#e76f51" /><stop offset="100%" stopColor="#d45a3e" />
            </linearGradient>
            <linearGradient id={`g${id}c`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#c94e30" /><stop offset="100%" stopColor="#8b3a22" />
            </linearGradient>
          </defs>
          {/* 右上菱形面（亮） */}
          <polygon points={`${cx},${cy} ${v[0].x},${v[0].y} ${v[1].x},${v[1].y} ${v[2].x},${v[2].y}`} fill={`url(#g${id}a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 下方菱形面（中） */}
          <polygon points={`${cx},${cy} ${v[2].x},${v[2].y} ${v[3].x},${v[3].y} ${v[4].x},${v[4].y}`} fill={`url(#g${id}b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 左上菱形面（暗） */}
          <polygon points={`${cx},${cy} ${v[4].x},${v[4].y} ${v[5].x},${v[5].y} ${v[0].x},${v[0].y}`} fill={`url(#g${id}c)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    case 8: {
      // 八面体 — 上下两个金字塔，四个可见面
      const top = { x: s * 0.5, y: s * 0.08 };
      const bottom = { x: s * 0.5, y: s * 0.92 };
      const left = { x: s * 0.12, y: s * 0.5 };
      const right = { x: s * 0.88, y: s * 0.5 };
      const mid = { x: s * 0.5, y: s * 0.5 };
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`g${id}a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2dd4bf" /><stop offset="100%" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id={`g${id}b`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#14b8a6" /><stop offset="100%" stopColor="#0f766e" />
            </linearGradient>
            <linearGradient id={`g${id}c`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0d9488" /><stop offset="100%" stopColor="#115e59" />
            </linearGradient>
            <linearGradient id={`g${id}d`} x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#0f766e" /><stop offset="100%" stopColor="#134e4a" />
            </linearGradient>
          </defs>
          <polygon points={`${top.x},${top.y} ${left.x},${left.y} ${mid.x},${mid.y}`} fill={`url(#g${id}a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${top.x},${top.y} ${right.x},${right.y} ${mid.x},${mid.y}`} fill={`url(#g${id}b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${bottom.x},${bottom.y} ${left.x},${left.y} ${mid.x},${mid.y}`} fill={`url(#g${id}c)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${bottom.x},${bottom.y} ${right.x},${right.y} ${mid.x},${mid.y}`} fill={`url(#g${id}d)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    case 10: {
      // 十面体 — 两个不对称五边形上下拼接
      // 先画底色背景填满整个区域，再画分面
      const top = { x: s * 0.5, y: s * 0.06 };
      const bottom = { x: s * 0.5, y: s * 0.94 };
      const upperL = { x: s * 0.1, y: s * 0.35 };
      const upperR = { x: s * 0.9, y: s * 0.35 };
      const lowerL = { x: s * 0.1, y: s * 0.65 };
      const lowerR = { x: s * 0.9, y: s * 0.65 };
      const mid = { x: s * 0.5, y: s * 0.5 };
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`g${id}a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc" /><stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
            <linearGradient id={`g${id}b`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
            <linearGradient id={`g${id}c`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9333ea" /><stop offset="100%" stopColor="#581c87" />
            </linearGradient>
            <linearGradient id={`g${id}d`} x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#4c1d95" />
            </linearGradient>
          </defs>
          {/* 整体背景填充（防止缝隙透明） */}
          <polygon
            points={`${top.x},${top.y} ${upperR.x},${upperR.y} ${lowerR.x},${lowerR.y} ${bottom.x},${bottom.y} ${lowerL.x},${lowerL.y} ${upperL.x},${upperL.y}`}
            fill="#7c3aed"
            stroke="none"
          />
          {/* 上左面 */}
          <polygon points={`${top.x},${top.y} ${upperL.x},${upperL.y} ${mid.x},${mid.y}`} fill={`url(#g${id}a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 上右面 */}
          <polygon points={`${top.x},${top.y} ${upperR.x},${upperR.y} ${mid.x},${mid.y}`} fill={`url(#g${id}b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 下左面 */}
          <polygon points={`${bottom.x},${bottom.y} ${lowerL.x},${lowerL.y} ${mid.x},${mid.y}`} fill={`url(#g${id}c)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 下右面 */}
          <polygon points={`${bottom.x},${bottom.y} ${lowerR.x},${lowerR.y} ${mid.x},${mid.y}`} fill={`url(#g${id}d)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 左右侧棱 */}
          <line x1={upperL.x} y1={upperL.y} x2={lowerL.x} y2={lowerL.y} stroke="#1a1a2e" strokeWidth="1.5" />
          <line x1={upperR.x} y1={upperR.y} x2={lowerR.x} y2={lowerR.y} stroke="#1a1a2e" strokeWidth="1.5" />
        </svg>
      );
    }
    case 12: {
      // 十二面体 — 外五边形 + 内五边形 + 五个梯形侧面
      const outerPts = [
        { x: s * 0.5, y: s * 0.08 },
        { x: s * 0.92, y: s * 0.38 },
        { x: s * 0.76, y: s * 0.9 },
        { x: s * 0.24, y: s * 0.9 },
        { x: s * 0.08, y: s * 0.38 },
      ];
      const innerPts = [
        { x: s * 0.5, y: s * 0.3 },
        { x: s * 0.72, y: s * 0.46 },
        { x: s * 0.63, y: s * 0.72 },
        { x: s * 0.37, y: s * 0.72 },
        { x: s * 0.28, y: s * 0.46 },
      ];
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`g${id}inner`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde047" /><stop offset="100%" stopColor="#ca8a04" />
            </linearGradient>
            <linearGradient id={`g${id}s0`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#facc15" /><stop offset="100%" stopColor="#a16207" />
            </linearGradient>
            <linearGradient id={`g${id}s1`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#eab308" /><stop offset="100%" stopColor="#854d0e" />
            </linearGradient>
            <linearGradient id={`g${id}s2`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ca8a04" /><stop offset="100%" stopColor="#713f12" />
            </linearGradient>
          </defs>
          {/* 背景填充 */}
          <polygon
            points={outerPts.map(p => `${p.x},${p.y}`).join(' ')}
            fill="#ca8a04"
            stroke="none"
          />
          {/* 五个梯形侧面 */}
          {[0, 1, 2, 3, 4].map((i) => (
            <polygon
              key={i}
              points={`${outerPts[i].x},${outerPts[i].y} ${outerPts[(i + 1) % 5].x},${outerPts[(i + 1) % 5].y} ${innerPts[(i + 1) % 5].x},${innerPts[(i + 1) % 5].y} ${innerPts[i].x},${innerPts[i].y}`}
              fill={`url(#g${id}s${i % 3})`}
              stroke="#1a1a2e"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ))}
          {/* 内五边形 */}
          <polygon
            points={innerPts.map(p => `${p.x},${p.y}`).join(' ')}
            fill={`url(#g${id}inner)`}
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    case 20: {
      // 二十面体 — 六边形外轮廓 + 内部六个三角形面 + 中心六边形
      const cx = s * 0.5;
      const cy = s * 0.5;
      const r = s * 0.44;
      const hex = Array.from({ length: 6 }, (_, i) => {
        const angle = (i * 60 - 90) * (Math.PI / 180);
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      });
      const innerR = r * 0.42;
      const inner = Array.from({ length: 6 }, (_, i) => {
        const angle = (i * 60 - 60) * (Math.PI / 180);
        return { x: cx + innerR * Math.cos(angle), y: cy + innerR * Math.sin(angle) };
      });
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`g${id}a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" /><stop offset="100%" stopColor="#db2777" />
            </linearGradient>
            <linearGradient id={`g${id}b`} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ec4899" /><stop offset="100%" stopColor="#be185d" />
            </linearGradient>
            <linearGradient id={`g${id}d`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#f9a8d4" /><stop offset="100%" stopColor="#be185d" />
            </linearGradient>
          </defs>
          {/* 背景六边形填充（防止缝隙透明） */}
          <polygon
            points={hex.map(p => `${p.x},${p.y}`).join(' ')}
            fill="#db2777"
            stroke="none"
          />
          {/* 六个三角形面 */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <polygon
              key={i}
              points={`${hex[i].x},${hex[i].y} ${hex[(i + 1) % 6].x},${hex[(i + 1) % 6].y} ${inner[i].x},${inner[i].y}`}
              fill={`url(#g${id}${i % 2 === 0 ? 'a' : 'b'})`}
              stroke="#1a1a2e"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          ))}
          {/* 中心六边形 */}
          <polygon
            points={inner.map(p => `${p.x},${p.y}`).join(' ')}
            fill={`url(#g${id}d)`}
            stroke="#1a1a2e"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    default:
      return null;
  }
}

function Dice({ type, size = 100, onRoll, onBatchRequest, result }: DiceProps) {
  const longPressTimer = useRef<number | null>(null);
  const isLongPress = useRef(false);
  const lastTap = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    isLongPress.current = false;
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true;
      onBatchRequest();
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPress.current) return;

    // 双击检测
    const now = Date.now();
    if (now - lastTap.current < 300) {
      onRoll(rollDie(type));
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="rounded-2xl p-3 dark:bg-bg-dark-2 light:bg-bg-light-2 border dark:border-border-dark light:border-border-light transition-colors">
          <DiceShape type={type} size={size} />
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted">
          d{type}
        </div>
        {result !== null && (
          <div className="mt-1 text-2xl font-bold dark:text-text-dark light:text-text-light">
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

type BatchMode = 'sum' | 'independent';

interface BatchResult {
  sides: number;
  values: number[];
  total: number;
  mode: BatchMode;
}

function BatchRollModal({
  open,
  onClose,
  onRoll,
  defaultSides,
}: {
  open: boolean;
  onClose: () => void;
  onRoll: (count: number, sides: number, mode: BatchMode) => void;
  defaultSides: number;
}) {
  const [count, setCount] = useState(10);
  const [sides, setSides] = useState(defaultSides);
  const [mode, setMode] = useState<BatchMode>('sum');
  const [result, setResult] = useState<BatchResult | null>(null);

  useEffect(() => {
    if (open) {
      setSides(defaultSides);
      setCount(10);
      setResult(null);
    }
  }, [open, defaultSides]);

  if (!open) return null;

  const handleRoll = () => {
    const c = Math.max(1, Math.min(1000, count));
    const values: number[] = [];
    for (let i = 0; i < c; i++) {
      values.push(rollDie(sides));
    }
    const total = values.reduce((a, b) => a + b, 0);
    setResult({ sides, values, total, mode });
    onRoll(c, sides, mode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            批量掷骰 · d{sides}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 dark:text-text-dark-muted light:text-text-light-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 模式切换 */}
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              掷骰模式
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('sum')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'sum'
                    ? 'bg-primary text-white'
                    : 'dark:bg-bg-dark-2 light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-white/10'
                }`}
              >
                <Sigma className="w-4 h-4" />
                累加
              </button>
              <button
                onClick={() => setMode('independent')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === 'independent'
                    ? 'bg-primary text-white'
                    : 'dark:bg-bg-dark-2 light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-white/10'
                }`}
              >
                <List className="w-4 h-4" />
                独立
              </button>
            </div>
          </div>

          {/* 掷骰次数 */}
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              掷骰次数
            </label>
            <input
              type="number"
              min="1"
              max="1000"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 dark:text-text-dark light:text-text-light focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* 掷骰按钮 */}
          <button
            onClick={handleRoll}
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            掷 {Math.max(1, Math.min(1000, count))}d{sides}
          </button>

          {/* 结果就地显示 */}
          {result && (
            <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-bg-light-2 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium dark:text-text-dark light:text-text-light">
                  结果
                </span>
                {result.mode === 'sum' && (
                  <span className="text-2xl font-bold text-primary">
                    {result.total}
                  </span>
                )}
              </div>
              <div className={`flex flex-wrap gap-1.5 ${result.mode === 'independent' ? '' : ''}`}>
                {result.values.map((v, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center min-w-[28px] h-7 px-1.5 rounded text-sm font-medium dark:bg-bg-dark light:bg-bg-light-2 dark:text-text-dark light:text-text-light border dark:border-border-dark light:border-border-light"
                  >
                    {v}
                  </span>
                ))}
              </div>
              {result.mode === 'sum' && result.values.length > 1 && (
                <div className="flex flex-wrap items-center gap-1 text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  {result.values.map((v, i) => (
                    <span key={i}>
                      {v}{i < result.values.length - 1 ? ' + ' : ''}
                    </span>
                  ))}
                  <span className="font-bold text-primary ml-1">= {result.total}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RollEntry {
  id: number;
  dice: string;
  values: number[];
  total: number;
  time: string;
  mode: BatchMode;
}

export default function DicePage() {
  const [results, setResults] = useState<Record<number, number | null>>({
    4: null, 6: null, 8: null, 10: null, 12: null, 20: null,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSides, setModalSides] = useState(20);
  const [history, setHistory] = useState<RollEntry[]>([]);
  const idCounter = useRef(0);

  const handleRoll = (type: number, value: number) => {
    setResults((prev) => ({ ...prev, [type]: value }));
    const entry: RollEntry = {
      id: ++idCounter.current,
      dice: `d${type}`,
      values: [value],
      total: value,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      mode: 'independent',
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const handleBatch = (count: number, sides: number, mode: BatchMode) => {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      values.push(rollDie(sides));
    }
    setResults((prev) => ({ ...prev, [sides]: values[values.length - 1] }));
    const total = values.reduce((a, b) => a + b, 0);
    const entry: RollEntry = {
      id: ++idCounter.current,
      dice: `${count}d${sides}`,
      values,
      total,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      mode,
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const clearHistory = () => setHistory([]);

  const diceTypes = [4, 6, 8, 10, 12, 20];

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* 标题栏 */}
      <div className="flex items-center gap-3">
        <Dices className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
          线上骰子
        </h1>
      </div>

      {/* 骰子网格：每行两个 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {diceTypes.map((type) => (
            <div key={type} className="flex justify-center">
              <Dice
                type={type}
                size={90}
                result={results[type] ?? null}
                onRoll={(v) => handleRoll(type, v)}
                onBatchRequest={() => {
                  setModalSides(type);
                  setModalOpen(true);
                }}
              />
            </div>
          ))}
        </div>
        <p className="text-center text-xs dark:text-text-dark-muted light:text-text-light-muted mt-4">
          双击骰子掷一次 · 长按骰子批量掷骰
        </p>
      </div>

      {/* 历史记录 */}
      <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-text-dark light:text-text-light">
            掷骰记录
          </h2>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-sm dark:text-text-dark-muted light:text-text-light-muted hover:bg-white/5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              清空
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8 dark:text-text-dark-muted light:text-text-light-muted">
            暂无记录，快来掷骰子吧！
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 rounded-lg dark:bg-bg-dark-2 light:bg-bg-light-2"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                    {entry.dice}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {entry.values.length > 1 && entry.values.map((v, i) => (
                      <span key={i} className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        {v}
                      </span>
                    ))}
                    {entry.values.length > 1 && entry.mode === 'sum' && (
                      <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        =
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {entry.values.length > 1 && entry.mode === 'sum' && (
                    <span className="text-lg font-bold dark:text-text-dark light:text-text-light">
                      {entry.total}
                    </span>
                  )}
                  <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                    {entry.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 批量掷骰窗口 */}
      <BatchRollModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onRoll={handleBatch}
        defaultSides={modalSides}
      />
    </div>
  );
}
