import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Grid3x3, Pencil, Eraser, Hand } from 'lucide-react';
import battlegroundStore from '@/data/battlegroundStore';
import combatStore from '@/data/combatStore';
import { GRID_PRESETS } from '@/types/battleground';
import type { Battleground as BG } from '@/types/battleground';
import type { Combatant } from '@/types/combat';

type Tool = 'brush' | 'eraser' | 'hand';

export default function BattlegroundEditor() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // 工具选择
  const [tool, setTool] = useState<Tool>('brush');

  // 草稿涂白格子
  const [draftCells, setDraftCells] = useState<Set<string>>(new Set());

  // 缩放与平移
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // 退出确认弹窗
  const [exitModalOpen, setExitModalOpen] = useState(false);

  // 保存成功提示
  const [savedFlash, setSavedFlash] = useState(false);

  // 网格数据
  const [bg, setBg] = useState<BG | null>(null);

  // 数据加载
  useEffect(() => {
    if (!sessionId) return;
    const data = battlegroundStore.getOrCreate(sessionId);
    setBg(data);
    setDraftCells(new Set(data.paintedCells || []));
    const unsub = battlegroundStore.subscribe(() => {
      setBg(battlegroundStore.get(sessionId));
    });
    return unsub;
  }, [sessionId]);

  // —— 所有 refs 必须在 early return 之前声明 ——
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const latestTranslate = useRef(translate);
  const touchState = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startPoints: Map<number, { x: number; y: number }>;
    startTranslate: { x: number; y: number };
    startScale: number;
    startDist: number;
    startMidScreen: { x: number; y: number };
    moved: boolean;
  }>({
    pointers: new Map(), startPoints: new Map(),
    startTranslate: { x: 0, y: 0 }, startScale: 1, startDist: 0,
    startMidScreen: { x: 0, y: 0 }, moved: false,
  });
  const paintDragRef = useRef<{
    active: boolean;
    cells: Set<string>;
    mode: 'paint' | 'erase';
  } | null>(null);

  // —— 所有 useMemo 必须在 early return 之前调用 ——
  const combatants = useMemo(() => {
    if (!sessionId) return [];
    return combatStore.get(sessionId)?.combatants ?? [];
  }, [sessionId, bg?.updatedAt]);

  const combatantMap = useMemo(() => {
    const m = new Map<string, Combatant>();
    combatants.forEach(c => m.set(c.id, c));
    return m;
  }, [combatants]);

  const cellToken = useMemo(() => {
    const m = new Map<string, string>();
    if (bg?.tokens) bg.tokens.forEach(t => m.set(`${t.col},${t.row}`, t.combatantId));
    return m;
  }, [bg?.tokens]);

  // —— early return 放在所有 hooks 之后 ——
  if (!bg) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center text-sm opacity-50">
        加载中...
      </div>
    );
  }

  // 派生量（非 hook，放在 early return 之后，保证 bg 非 null）
  const preset = GRID_PRESETS[bg.size];
  const cellSize = bg.size === 'small' ? 28 : bg.size === 'medium' ? 22 : 18;
  latestTranslate.current = translate;

  const getDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const PAN_MARGIN = 150;
  const updateTranslate = (next: { x: number; y: number }) => {
    const rect = gridWrapRef.current?.getBoundingClientRect();
    if (!rect || !bg) {
      latestTranslate.current = next;
      setTranslate(next);
      return;
    }
    const gridW = preset.cols * cellSize * scale;
    const gridH = preset.rows * cellSize * scale;
    const containerW = rect.width;
    const containerH = rect.height;
    let minX: number, maxX: number;
    if (gridW > containerW) { minX = containerW - gridW - PAN_MARGIN; maxX = PAN_MARGIN; }
    else { minX = -PAN_MARGIN; maxX = containerW - gridW + PAN_MARGIN; }
    let minY: number, maxY: number;
    if (gridH > containerH) { minY = containerH - gridH - PAN_MARGIN; maxY = PAN_MARGIN; }
    else { minY = -PAN_MARGIN; maxY = containerH - gridH + PAN_MARGIN; }
    const clamped = {
      x: Math.max(minX, Math.min(maxX, next.x)),
      y: Math.max(minY, Math.min(maxY, next.y)),
    };
    latestTranslate.current = clamped;
    setTranslate(clamped);
  };

  const applyPaint = (key: string, mode: 'paint' | 'erase') => {
    setDraftCells(prev => {
      const next = new Set(prev);
      if (mode === 'paint') next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const ts = touchState.current;
    const pt = { x: e.clientX, y: e.clientY };
    ts.pointers.set(e.pointerId, pt);
    ts.startPoints.set(e.pointerId, pt);
    ts.moved = false;

    if (ts.pointers.size === 1) {
      if (tool === 'hand') {
        ts.startTranslate = { ...translate };
      } else {
        const rect = gridWrapRef.current?.getBoundingClientRect();
        if (rect) {
          const col = Math.floor((e.clientX - rect.left - translate.x) / (cellSize * scale));
          const row = Math.floor((e.clientY - rect.top - translate.y) / (cellSize * scale));
          if (col >= 0 && col < preset.cols && row >= 0 && row < preset.rows) {
            const key = `${col},${row}`;
            const mode = tool === 'brush' ? 'paint' : 'erase';
            paintDragRef.current = { active: true, cells: new Set([key]), mode };
            applyPaint(key, mode);
          }
        }
      }
    }
    if (ts.pointers.size === 2) {
      paintDragRef.current = null;
      const pts = Array.from(ts.pointers.values());
      ts.startDist = getDistance(pts[0], pts[1]);
      ts.startScale = scale;
      ts.startMidScreen = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      ts.startTranslate = { ...latestTranslate.current };
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ts = touchState.current;
    if (!ts.pointers.has(e.pointerId)) return;
    ts.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ts.pointers.size === 2) {
      ts.moved = true;
      const pts = Array.from(ts.pointers.values());
      const dist = getDistance(pts[0], pts[1]);
      if (ts.startDist > 0) {
        const newScale = Math.max(0.5, Math.min(3, ts.startScale * (dist / ts.startDist)));
        const rect = gridWrapRef.current?.getBoundingClientRect();
        if (rect) {
          const startMidX = ts.startMidScreen.x - rect.left;
          const startMidY = ts.startMidScreen.y - rect.top;
          const curMidX = ((pts[0].x + pts[1].x) / 2) - rect.left;
          const curMidY = ((pts[0].y + pts[1].y) / 2) - rect.top;
          const midDeltaX = curMidX - startMidX;
          const midDeltaY = curMidY - startMidY;
          const ratio = ts.startScale - newScale;
          updateTranslate({
            x: ts.startTranslate.x + ratio * startMidX + midDeltaX,
            y: ts.startTranslate.y + ratio * startMidY + midDeltaY,
          });
        }
        setScale(newScale);
      }
      return;
    }

    if (paintDragRef.current?.active) {
      e.preventDefault();
      const rect = gridWrapRef.current?.getBoundingClientRect();
      if (rect) {
        const col = Math.floor((e.clientX - rect.left - translate.x) / (cellSize * scale));
        const row = Math.floor((e.clientY - rect.top - translate.y) / (cellSize * scale));
        if (col >= 0 && col < preset.cols && row >= 0 && row < preset.rows) {
          const key = `${col},${row}`;
          if (!paintDragRef.current.cells.has(key)) {
            applyPaint(key, paintDragRef.current.mode);
            paintDragRef.current.cells.add(key);
          }
        }
      }
      if (Math.abs(e.clientX - (ts.startPoints.get(e.pointerId)?.x ?? 0)) > 4 ||
          Math.abs(e.clientY - (ts.startPoints.get(e.pointerId)?.y ?? 0)) > 4) {
        ts.moved = true;
      }
      return;
    }

    if (ts.pointers.size === 1 && tool === 'hand') {
      const start = ts.startPoints.get(e.pointerId);
      if (!start) return;
      const deltaX = e.clientX - start.x;
      const deltaY = e.clientY - start.y;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) ts.moved = true;
      updateTranslate({
        x: ts.startTranslate.x + deltaX,
        y: ts.startTranslate.y + deltaY,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const ts = touchState.current;

    if (paintDragRef.current?.active) {
      paintDragRef.current = null;
      ts.pointers.delete(e.pointerId);
      ts.startPoints.delete(e.pointerId);
      return;
    }

    ts.pointers.delete(e.pointerId);
    ts.startPoints.delete(e.pointerId);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

    if (ts.pointers.size === 1) {
      const remainingId = Array.from(ts.pointers.keys())[0];
      const cur = ts.pointers.get(remainingId);
      if (cur) {
        ts.startPoints.set(remainingId, { x: cur.x, y: cur.y });
        ts.startTranslate = { ...latestTranslate.current };
      }
    }
  };

  const handleSave = () => {
    if (!sessionId) return;
    battlegroundStore.setPaintedCells(sessionId, [...draftCells]);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleSaveAndExit = () => {
    if (!sessionId) return;
    battlegroundStore.setPaintedCells(sessionId, [...draftCells]);
    navigate(`/combat/${sessionId}`);
  };

  const handleDiscard = () => {
    navigate(`/combat/${sessionId}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-bg-dark">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-border-dark light:border-border-light">
        <div className="flex items-center gap-2">
          <Grid3x3 className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold">沙盘绘图</span>
          <span className="text-xs opacity-50">{preset.cols}×{preset.rows}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
            保存
          </button>
          <button onClick={() => setExitModalOpen(true)} className="px-3 py-1.5 text-xs rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors">
            退出
          </button>
        </div>
      </div>

      {/* 网格区域 */}
      <div className="flex-1 relative overflow-hidden" ref={gridWrapRef}
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        style={{ touchAction: 'none' }}
      >
        <div className="grid origin-top-left"
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
            const isPainted = draftCells.has(key);
            return (
              <div key={key}
                className={`border flex items-center justify-center relative ${
                  isPainted
                    ? 'bg-white dark:bg-white/90 border-gray-400 dark:border-gray-500'
                    : 'dark:border-border-dark/40 light:border-border-light/40'
                }`}
                style={{ width: cellSize, height: cellSize }}
              >
                {combatant && (
                  <div className="rounded-full flex items-center justify-center font-bold text-white opacity-30 pointer-events-none"
                    style={{ width: cellSize - 6, height: cellSize - 6, fontSize: cellSize > 22 ? 11 : 9,
                      background: combatant.isPc ? 'var(--color-info)' : 'var(--color-danger)' }}>
                    {combatant.name.slice(0, 1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="absolute top-2 left-2 px-2 py-1 text-xs rounded-md bg-black/50 text-white pointer-events-none">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* 底边工具栏 */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 border-t dark:border-border-dark light:border-border-light">
        <button onClick={() => setTool('brush')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors ${
            tool === 'brush' ? 'bg-primary text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-white/5'
          }`}>
          <Pencil className="w-4 h-4" />
          <span>画笔</span>
        </button>
        <button onClick={() => setTool('eraser')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors ${
            tool === 'eraser' ? 'bg-primary text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-white/5'
          }`}>
          <Eraser className="w-4 h-4" />
          <span>橡皮</span>
        </button>
        <button onClick={() => setTool('hand')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors ${
            tool === 'hand' ? 'bg-primary text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-white/5'
          }`}>
          <Hand className="w-4 h-4" />
          <span>拖拽</span>
        </button>
      </div>

      {/* 退出确认弹窗 */}
      {exitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg p-6 max-w-sm w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-xl">
            <h3 className="text-base font-bold mb-2">退出绘图模式</h3>
            <p className="text-sm opacity-60 mb-4">是否保存当前草稿？</p>
            <div className="flex flex-col gap-2">
              <button onClick={handleSaveAndExit}
                className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90">
                保存并退出
              </button>
              <button onClick={handleDiscard}
                className="px-4 py-2 text-sm rounded-lg border border-danger text-danger hover:bg-danger/10">
                丢弃
              </button>
              <button onClick={() => setExitModalOpen(false)}
                className="px-4 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {savedFlash && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm shadow-lg z-50 animate-in fade-in">
          已保存
        </div>
      )}
    </div>
  );
}
