// 网格沙盘组件 —— 展示参战者位置与移动，支持三种大小预设
import { useState, useEffect, useMemo, useRef } from 'react';
import { Grid3x3, Eraser, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import battlegroundStore from '@/data/battlegroundStore';
import { GRID_PRESETS } from '@/types/battleground';
import type { Battleground as BG, GridSize } from '@/types/battleground';
import type { Combatant } from '@/types/combat';
import CombatantInfoPanel from './CombatantInfoPanel';

interface Props {
  sessionId: string;
  combatants: Combatant[];
}

export default function Battleground({ sessionId, combatants }: Props) {
  const [bg, setBg] = useState<BG | null>(null);
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [eraserMode, setEraserMode] = useState(false);
  // 双击弹窗
  const [doubleClickedCombatant, setDoubleClickedCombatant] = useState<Combatant | null>(null);
  // 缩放与平移状态
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const touchState = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startPoints: Map<number, { x: number; y: number }>;
    startTranslate: { x: number; y: number };
    startScale: number;
    startDist: number;
    moved: boolean;
  }>({
    pointers: new Map(),
    startPoints: new Map(),
    startTranslate: { x: 0, y: 0 },
    startScale: 1,
    startDist: 0,
    moved: false,
  });
  const gridWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBg(battlegroundStore.getOrCreate(sessionId));
    const unsub = battlegroundStore.subscribe(() => {
      setBg(battlegroundStore.get(sessionId));
    });
    return unsub;
  }, [sessionId]);

  // 参战者地图，便于查名称/PC标记
  const combatantMap = useMemo(() => {
    const m = new Map<string, Combatant>();
    combatants.forEach((c) => m.set(c.id, c));
    return m;
  }, [combatants]);

  // 棋子坐标索引：combatantId -> token
  const tokenMap = useMemo(() => {
    const m = new Map<string, { col: number; row: number }>();
    bg?.tokens.forEach((t) => m.set(t.combatantId, { col: t.col, row: t.row }));
    return m;
  }, [bg?.tokens]);

  // 格子 -> 棋子 反向索引
  const cellToken = useMemo(() => {
    const m = new Map<string, string>(); // "col,row" -> combatantId
    bg?.tokens.forEach((t) => m.set(`${t.col},${t.row}`, t.combatantId));
    return m;
  }, [bg?.tokens]);

  // 选中棋子的速度（用于悬浮标签显示）
  const selectedSpeed = useMemo(() => {
    if (!selectedCombatantId) return null;
    const c = combatantMap.get(selectedCombatantId);
    return c?.speed ?? null;
  }, [selectedCombatantId, combatantMap]);

  // 选中棋子的最大移动范围（切比雪夫距离：8方向都算1格，5尺/格）
  const moveRangeSet = useMemo(() => {
    if (!bg || !selectedCombatantId) return new Set<string>();
    const token = tokenMap.get(selectedCombatantId);
    const combatant = combatantMap.get(selectedCombatantId);
    if (!token || !combatant || !combatant.speed) return new Set<string>();
    const range = Math.floor(combatant.speed / 5);
    if (range <= 0) return new Set<string>();
    const set = new Set<string>();
    const preset = GRID_PRESETS[bg.size];
    for (let dc = -range; dc <= range; dc++) {
      for (let dr = -range; dr <= range; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) > range) continue;
        const col = token.col + dc;
        const row = token.row + dr;
        if (col >= 0 && col < preset.cols && row >= 0 && row < preset.rows) {
          set.add(`${col},${row}`);
        }
      }
    }
    return set;
  }, [selectedCombatantId, tokenMap, combatantMap, bg?.size]);

  if (!bg) return null;

  const preset = GRID_PRESETS[bg.size];

  const handleSizeChange = (size: GridSize) => {
    battlegroundStore.setSize(sessionId, size);
  };

  const handleClear = () => {
    if (confirm('确定清空所有棋子吗？')) battlegroundStore.clearTokens(sessionId);
  };

  // —— 手势处理：单指拖拽平移、双指捏合缩放 ——
  const getDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const handlePointerDown = (e: React.PointerEvent) => {
    const ts = touchState.current;
    const pt = { x: e.clientX, y: e.clientY };
    ts.pointers.set(e.pointerId, pt);
    ts.startPoints.set(e.pointerId, pt);
    ts.moved = false;
    if (ts.pointers.size === 1) {
      ts.startTranslate = { ...translate };
    }
    if (ts.pointers.size === 2) {
      const pts = Array.from(ts.pointers.values());
      ts.startDist = getDistance(pts[0], pts[1]);
      ts.startScale = scale;
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ts = touchState.current;
    if (!ts.pointers.has(e.pointerId)) return;
    ts.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ts.pointers.size === 1) {
      // 单指平移：用按下时记录的起始位置做参照
      const start = ts.startPoints.get(e.pointerId);
      if (!start) return;
      const deltaX = e.clientX - start.x;
      const deltaY = e.clientY - start.y;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) ts.moved = true;
      setTranslate({
        x: ts.startTranslate.x + deltaX,
        y: ts.startTranslate.y + deltaY,
      });
    }
    if (ts.pointers.size === 2) {
      // 双指缩放
      ts.moved = true;
      const pts = Array.from(ts.pointers.values());
      const dist = getDistance(pts[0], pts[1]);
      if (ts.startDist > 0) {
        const newScale = Math.max(0.5, Math.min(3, ts.startScale * (dist / ts.startDist)));
        setScale(newScale);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const ts = touchState.current;
    ts.pointers.delete(e.pointerId);
    ts.startPoints.delete(e.pointerId);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  // 点击格子：只有未发生拖拽时才触发
  const handleCellClick = (col: number, row: number) => {
    if (touchState.current.moved) {
      touchState.current.moved = false;
      return;
    }
    const existingCombatantId = cellToken.get(`${col},${row}`);
    if (eraserMode) {
      if (existingCombatantId) battlegroundStore.removeToken(sessionId, existingCombatantId);
      return;
    }
    // 已选中参战者
    if (selectedCombatantId) {
      if (existingCombatantId === selectedCombatantId) {
        // 点击的就是当前选中的棋子 → 取消选中
        setSelectedCombatantId(null);
        return;
      }
      if (existingCombatantId) {
        // 目标格有其他棋子 → 选中那个棋子（不覆盖）
        setSelectedCombatantId(existingCombatantId);
        return;
      }
      // 目标格为空 → 移动/放置到该格
      battlegroundStore.placeToken(sessionId, { combatantId: selectedCombatantId, col, row });
      setSelectedCombatantId(null);
      return;
    }
    // 未选中参战者：点击有棋子的格 → 选中该棋子
    if (existingCombatantId) {
      setSelectedCombatantId(existingCombatantId);
    }
  };

  // 缩放按钮
  const handleZoom = (delta: number) => {
    setScale((s) => Math.max(0.5, Math.min(3, s + delta)));
  };
  const handleResetView = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  // 未放置的参战者（用于列表选择）
  const unplaced = combatants.filter((c) => !tokenMap.has(c.id));
  // 已放置的参战者（用于回收框展示）
  const placed = combatants.filter((c) => tokenMap.has(c.id));

  // 单元格尺寸：根据大小预设调整，保证整体可见
  const cellSize = bg.size === 'small' ? 28 : bg.size === 'medium' ? 22 : 18;

  return (
    <div className="rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3 sm:p-4 space-y-3">
      {/* 标题与工具栏 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Grid3x3 className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-base sm:text-lg font-bold dark:text-text-dark light:text-text-light">
            战斗沙盘
          </h2>
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
            {preset.cols}×{preset.rows}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 大小切换 */}
          <div className="flex rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
            {(Object.keys(GRID_PRESETS) as GridSize[]).map((s) => (
              <button
                key={s}
                onClick={() => handleSizeChange(s)}
                className={`px-2 py-1 text-xs transition-colors ${
                  bg.size === s
                    ? 'bg-primary text-white'
                    : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
                }`}
              >
                {s === 'small' ? '小' : s === 'medium' ? '中' : '大'}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setEraserMode((v) => !v);
              setSelectedCombatantId(null);
            }}
            className={`px-2 py-1 text-xs rounded-lg border flex items-center gap-1 transition-colors ${
              eraserMode
                ? 'bg-danger text-white border-danger'
                : 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">橡皮</span>
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-danger/10 hover:text-danger transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">清空</span>
          </button>
          {/* 缩放控制 */}
          <div className="flex items-center gap-1 ml-1">
            <button
              onClick={() => handleZoom(-0.2)}
              className="px-1.5 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5 transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetView}
              className="px-1.5 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5 transition-colors min-w-[2.5rem] text-center"
              title="重置视图"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={() => handleZoom(0.2)}
              className="px-1.5 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5 transition-colors"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 参战者选择条 —— 已放置（回收框）+ 未放置 */}
      <div className="space-y-1.5">
        {/* 已放置：回收框，点击选中的棋子可收回 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">
            沙盘上
          </span>
          {placed.length === 0 && (
            <span className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">
              无
            </span>
          )}
          {placed.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                if (eraserMode) return;
                if (selectedCombatantId === c.id) {
                  // 已选中 → 点击回收框收回
                  battlegroundStore.removeToken(sessionId, c.id);
                  setSelectedCombatantId(null);
                } else {
                  setSelectedCombatantId(c.id);
                }
              }}
              className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                selectedCombatantId === c.id
                  ? 'bg-primary text-white border-primary animate-pulse'
                  : c.isPc
                  ? 'border-info/50 text-info hover:bg-info/10'
                  : 'border-danger/50 text-danger hover:bg-danger/10'
              } ${eraserMode ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {/* 未放置：点击选中后到沙盘放置 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0 w-10">
            未放置
          </span>
          {unplaced.length === 0 && !selectedCombatantId && !eraserMode && (
            <span className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">
              所有参战者已放置
            </span>
          )}
          {unplaced.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedCombatantId(c.id === selectedCombatantId ? null : c.id);
                setEraserMode(false);
              }}
              className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                selectedCombatantId === c.id
                  ? 'bg-primary text-white border-primary'
                  : c.isPc
                  ? 'border-info/50 text-info hover:bg-info/10'
                  : 'border-danger/50 text-danger hover:bg-danger/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {/* 提示语 */}
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          {eraserMode
            ? '橡皮模式：点击棋子移除'
            : selectedCombatantId
            ? placed.find((c) => c.id === selectedCombatantId)
              ? `已选中 ${combatantMap.get(selectedCombatantId)?.name}：点击空格移动，点击上方高亮框收回`
              : `已选中 ${combatantMap.get(selectedCombatantId)?.name}：点击空格放置`
            : '点击沙盘上的棋子选中，点击未放置的参战者后到沙盘放置'}
        </div>
      </div>

      {/* 网格 —— 手势平移与缩放 */}
      <div
        ref={gridWrapRef}
        className="relative overflow-hidden max-h-[70vh] rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* 悬浮标签：移动距离 */}
        {selectedSpeed != null && moveRangeSet.size > 0 && (
          <div className="absolute top-2 left-2 z-10 px-2 py-1 text-xs rounded-md bg-info/80 text-white pointer-events-none shadow-md">
            移动：{selectedSpeed}尺（{Math.floor(selectedSpeed / 5)}格）
          </div>
        )}
        <div
          className="grid origin-top-left"
          style={{
            gridTemplateColumns: `repeat(${preset.cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${preset.rows}, ${cellSize}px)`,
            width: 'max-content',
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          }}
        >
          {Array.from({ length: preset.cols * preset.rows }).map((_, i) => {
            const col = i % preset.cols;
            const row = Math.floor(i / preset.cols);
            const key = `${col},${row}`;
            const combatantId = cellToken.get(key);
            const combatant = combatantId ? combatantMap.get(combatantId) : null;
            const isHover = selectedCombatantId && !eraserMode;
            const inMoveRange = moveRangeSet.has(key);
            return (
              <div
                key={i}
                onClick={() => handleCellClick(col, row)}
                className={`border flex items-center justify-center cursor-pointer transition-colors ${
                  inMoveRange
                    ? 'bg-info/30 border-info/40'
                    : 'dark:border-border-dark/40 light:border-border-light/40'
                } ${isHover ? 'hover:bg-primary/20' : ''} ${
                  eraserMode && combatantId ? 'hover:bg-danger/30' : ''
                }`}
                style={{ width: cellSize, height: cellSize }}
                title={combatant ? combatant.name : `${col},${row}`}
              >
                {combatant && (
                  <div
                    className={`rounded-full flex items-center justify-center font-bold text-white leading-none transition-all ${
                      combatant.isPc ? 'bg-info' : 'bg-danger'
                    } ${selectedCombatantId === combatant.id ? 'ring-2 ring-white scale-110' : ''}`}
                    style={{
                      width: cellSize - 6,
                      height: cellSize - 6,
                      fontSize: cellSize > 22 ? 11 : 9,
                    }}
                    onDoubleClick={() => setDoubleClickedCombatant(combatant)}
                  >
                    {combatant.name.slice(0, 1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 text-xs dark:text-text-dark-muted light:text-text-light-muted">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-info" />
          玩家角色
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-danger" />
          NPC/敌人
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 border border-info/40 bg-info/30" />
          移动范围
        </div>
      </div>

      {/* 双击棋子弹出信息窗口 */}
      {doubleClickedCombatant && (
        <CombatantInfoPanel
                  combatant={doubleClickedCombatant}
                  onClose={() => setDoubleClickedCombatant(null)}
                  combatants={combatants}
                  tokenMap={tokenMap}
                />
      )}
    </div>
  );
}
