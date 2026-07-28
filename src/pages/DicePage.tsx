import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Dices,
  X,
  RotateCcw,
  Sparkles,
  BookOpen,
  Clock,
  Calendar,
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

/** 生成 SVG 骰子形状（立体投影风格） */
function DiceShape({ type, size }: { type: number; size: number }) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;

  // 根据骰子类型绘制不同的几何体轮廓
  switch (type) {
    case 4: {
      // 四面体 (三角形底 + 三条可见棱)
      const topY = s * 0.12;
      const blX = s * 0.15;
      const blY = s * 0.78;
      const brX = s * 0.85;
      const brY = s * 0.78;
      // 右侧阴影面
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`grad4a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e63946" />
              <stop offset="100%" stopColor="#a8242f" />
            </linearGradient>
            <linearGradient id={`grad4b`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c02a37" />
              <stop offset="100%" stopColor="#7a1520" />
            </linearGradient>
          </defs>
          {/* 左侧面 */}
          <polygon points={`${cx},${topY} ${blX},${blY} ${cx},${cy + s * 0.08}`} fill={`url(#grad4a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 右侧面 */}
          <polygon points={`${cx},${topY} ${brX},${brY} ${cx},${cy + s * 0.08}`} fill={`url(#grad4b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    case 6: {
      // 立方体（三面可见）
      const depth = s * 0.15;
      const faceSize = s * 0.5;
      const fx = cx - faceSize / 2 + depth * 0.5;
      const fy = cy - faceSize / 2 - depth * 0.5;
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`grad6top`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f4a261" />
              <stop offset="100%" stopColor="#e76f51" />
            </linearGradient>
            <linearGradient id={`grad6front`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e76f51" />
              <stop offset="100%" stopColor="#d45a3e" />
            </linearGradient>
            <linearGradient id={`grad6side`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c94e30" />
              <stop offset="100%" stopColor="#8b3a22" />
            </linearGradient>
          </defs>
          {/* 顶面 */}
          <polygon
            points={`${fx},${fy} ${fx + faceSize},${fy} ${fx + faceSize + depth},${fy - depth} ${fx + depth},${fy - depth}`}
            fill={`url(#grad6top)`}
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* 正面 */}
          <polygon
            points={`${fx},${fy} ${fx + faceSize},${fy} ${fx + faceSize},${fy + faceSize} ${fx},${fy + faceSize}`}
            fill={`url(#grad6front)`}
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* 右侧面 */}
          <polygon
            points={`${fx + faceSize},${fy} ${fx + faceSize + depth},${fy - depth} ${fx + faceSize + depth},${fy + faceSize - depth} ${fx + faceSize},${fy + faceSize}`}
            fill={`url(#grad6side)`}
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    case 8: {
      // 八面体
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`grad8a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2a9d8f" />
              <stop offset="100%" stopColor="#1d7266" />
            </linearGradient>
            <linearGradient id={`grad8b`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#21867a" />
              <stop offset="100%" stopColor="#155c52" />
            </linearGradient>
          </defs>
          {/* 上左 */}
          <polygon points={`${cx},${s * 0.1} ${s * 0.15},${cy} ${cx},${cy}`} fill={`url(#grad8a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 上右 */}
          <polygon points={`${cx},${s * 0.1} ${s * 0.85},${cy} ${cx},${cy}`} fill={`url(#grad8b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 下左 */}
          <polygon points={`${cx},${s * 0.9} ${s * 0.15},${cy} ${cx},${cy}`} fill={`url(#grad8b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 下右 */}
          <polygon points={`${cx},${s * 0.9} ${s * 0.85},${cy} ${cx},${cy}`} fill={`url(#grad8a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    case 10: {
      // 十面体（菱形）
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`grad10a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#9b5de5" />
              <stop offset="100%" stopColor="#6a3aa8" />
            </linearGradient>
            <linearGradient id={`grad10b`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7f3dc7" />
              <stop offset="100%" stopColor="#4d2185" />
            </linearGradient>
          </defs>
          {/* 上半菱形 */}
          <polygon points={`${cx},${s * 0.08} ${s * 0.25},${cy} ${cx},${cy}`} fill={`url(#grad10a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${cx},${s * 0.08} ${s * 0.75},${cy} ${cx},${cy}`} fill={`url(#grad10b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          {/* 下半菱形 */}
          <polygon points={`${cx},${s * 0.92} ${s * 0.25},${cy} ${cx},${cy}`} fill={`url(#grad10b)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
          <polygon points={`${cx},${s * 0.92} ${s * 0.75},${cy} ${cx},${cy}`} fill={`url(#grad10a)`} stroke="#1a1a2e" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    }
    case 12: {
      // 十二面体（五边形近似）
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`grad12a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f4d35e" />
              <stop offset="100%" stopColor="#d4a017" />
            </linearGradient>
            <linearGradient id={`grad12b`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#dcb23a" />
              <stop offset="100%" stopColor="#b8870d" />
            </linearGradient>
          </defs>
          {/* 五边形外轮廓 */}
          <polygon
            points={`${cx},${s * 0.1} ${s * 0.9},${s * 0.38} ${s * 0.72},${s * 0.88} ${s * 0.28},${s * 0.88} ${s * 0.1},${s * 0.38}`}
            fill={`url(#grad12a)`}
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* 内五边形（立体效果） */}
          <polygon
            points={`${cx},${s * 0.28} ${s * 0.72},${s * 0.44} ${s * 0.6},${s * 0.72} ${s * 0.4},${s * 0.72} ${s * 0.28},${s * 0.44}`}
            fill={`url(#grad12b)`}
            stroke="#1a1a2e"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          {/* 连接线 */}
          <line x1={cx} y1={s * 0.28} x2={cx} y2={s * 0.1} stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
          <line x1={s * 0.72} y1={s * 0.44} x2={s * 0.9} y2={s * 0.38} stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
          <line x1={s * 0.6} y1={s * 0.72} x2={s * 0.72} y2={s * 0.88} stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
          <line x1={s * 0.4} y1={s * 0.72} x2={s * 0.28} y2={s * 0.88} stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
          <line x1={s * 0.28} y1={s * 0.44} x2={s * 0.1} y2={s * 0.38} stroke="#1a1a2e" strokeWidth="1" opacity="0.5" />
        </svg>
      );
    }
    case 20: {
      // 二十面体（六边形 + 内部三角形线）
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <linearGradient id={`grad20a`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f72585" />
              <stop offset="100%" stopColor="#b5179e" />
            </linearGradient>
            <linearGradient id={`grad20b`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c71478" />
              <stop offset="100%" stopColor="#88106b" />
            </linearGradient>
          </defs>
          {/* 六边形 */}
          <polygon
            points={`${cx},${s * 0.08} ${s * 0.88},${cy} ${cx},${s * 0.92} ${s * 0.12},${cy}`}
            fill={`url(#grad20a)`}
            stroke="#1a1a2e"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          {/* 内部三角形分割线（立体效果） */}
          <polygon
            points={`${cx},${s * 0.08} ${s * 0.88},${cy} ${cx},${cy}`}
            fill={`url(#grad20b)`}
            opacity="0.7"
            stroke="#1a1a2e"
            strokeWidth="1"
          />
          <polygon
            points={`${cx},${s * 0.92} ${s * 0.12},${cy} ${cx},${cy}`}
            fill={`url(#grad20b)`}
            opacity="0.7"
            stroke="#1a1a2e"
            strokeWidth="1"
          />
          <polygon
            points={`${cx},${s * 0.08} ${s * 0.12},${cy} ${cx},${cy}`}
            fill="#c71478"
            opacity="0.5"
            stroke="#1a1a2e"
            strokeWidth="1"
          />
          <polygon
            points={`${cx},${s * 0.92} ${s * 0.88},${cy} ${cx},${cy}`}
            fill="#c71478"
            opacity="0.5"
            stroke="#1a1a2e"
            strokeWidth="1"
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

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    isLongPress.current = false;
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true;
      onBatchRequest();
    }, 500);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isLongPress.current) {
      onRoll(rollDie(type));
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
        style={{ touchAction: 'none' }}
      >
        <div
          className="rounded-2xl p-3 dark:bg-bg-dark-2 light:bg-bg-light-2 border dark:border-border-dark light:border-border-light transition-colors"
        >
          <DiceShape type={type} size={size} />
        </div>
        <div className="absolute -inset-2 rounded-full pointer-events-none" />
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

function BatchRollModal({
  open,
  onClose,
  onRoll,
  defaultSides,
}: {
  open: boolean;
  onClose: () => void;
  onRoll: (count: number, sides: number) => void;
  defaultSides: number;
}) {
  const [count, setCount] = useState(10);
  const [sides, setSides] = useState(defaultSides);

  useEffect(() => {
    if (open) {
      setSides(defaultSides);
      setCount(10);
    }
  }, [open, defaultSides]);

  if (!open) return null;

  const handleSubmit = () => {
    const c = Math.max(1, Math.min(1000, count));
    onRoll(c, sides);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-2xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold dark:text-text-dark light:text-text-light">
            批量掷骰
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 dark:text-text-dark-muted light:text-text-light-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 dark:text-text-dark light:text-text-light">
              骰子类型
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {[4, 6, 8, 10, 12, 20].map((s) => (
                <button
                  key={s}
                  onClick={() => setSides(s)}
                  className={`py-2 text-sm font-medium rounded-lg transition-colors ${
                    sides === s
                      ? 'bg-primary text-white'
                      : 'dark:bg-bg-dark-2 light:bg-bg-light-2 dark:text-text-dark light:text-text-light hover:bg-white/10'
                  }`}
                >
                  d{s}
                </button>
              ))}
            </div>
          </div>

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

          <button
            onClick={handleSubmit}
            className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            掷 {count} 次 d{sides}
          </button>
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
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const handleBatch = (count: number, sides: number) => {
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
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
  };

  const clearHistory = () => setHistory([]);

  const diceTypes = [4, 6, 8, 10, 12, 20];

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Dices className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">
            线上骰子
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/clock"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
          >
            <Clock className="w-4 h-4" />
            时钟
          </Link>
          <Link
            to="/calendar"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light text-sm dark:text-text-dark light:text-text-light hover:bg-white/5 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            日历
          </Link>
        </div>
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
          单击骰子掷一次 · 长按骰子批量掷骰
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
                    {entry.values.length > 1 && (
                      <span className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        =
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {entry.values.length > 1 && (
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