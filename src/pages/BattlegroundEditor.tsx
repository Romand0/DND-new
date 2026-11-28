import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Grid3x3, Pencil, Eraser, Hand, Flame, Sun, Moon, MoonStar, Undo2 } from 'lucide-react';
import battlegroundStore from '@/data/battlegroundStore';
import combatStore from '@/data/combatStore';
import { buildFireLightMap, strongerTier } from '@/data/visionRules';
import { GRID_PRESETS, ZONE_PRESETS, LIGHT_LABELS, LIGHT_OVERLAY } from '@/types/battleground';
import type { Battleground as BG, BattlegroundZone, ZoneType, LightTier } from '@/types/battleground';
import type { Combatant } from '@/types/combat';
import { useNumberInput } from '@/hooks/useInput';

type Tool = 'brush' | 'eraser' | 'hand';

/** 画笔对象：边界墙（涂白）、某类地形区域，或光照标注（明亮=无标注，故只画笔微光/黑暗） */
type PaintMode = 'wall' | ZoneType | 'light:dim' | 'light:darkness';

const LIGHT_TIERS: LightTier[] = ['bright', 'dim', 'darkness'];
const LIGHT_BRUSH_TIERS: ('dim' | 'darkness')[] = ['dim', 'darkness'];
const LIGHT_ICONS: Record<LightTier, typeof Sun> = { bright: Sun, dim: Moon, darkness: MoonStar };

/** 是否是光照画笔（光照标注从战斗沙盘移入绘图模式） */
function isLightMode(m: PaintMode): m is 'light:dim' | 'light:darkness' {
  return m.startsWith('light:');
}

/** 绘图草稿快照：撤销以「一次画笔/一次环境切换」为粒度整体回滚 */
interface DraftSnapshot {
  cells: string[];
  light: Record<LightTier, string[]>;
  zones: BattlegroundZone[];
  ambient: LightTier;
}

const UNDO_LIMIT = 50;

/** 绘图模式创建的区域统一标记，保存时只替换这一批，保留法术生成的其他区域 */
const BRUSH_SOURCE = '绘图';

export default function BattlegroundEditor() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  // 工具选择
  const [tool, setTool] = useState<Tool>('brush');

  // 草稿涂白格子
  const [draftCells, setDraftCells] = useState<Set<string>>(new Set());

  // 画笔对象：边界墙 or 地形区域类型 or 光照档位
  const [paintMode, setPaintMode] = useState<PaintMode>('wall');

  // 光照草稿：三桶互斥（与 store 语义一致），保存时整批覆盖
  const [draftLight, setDraftLight] = useState<Record<LightTier, Set<string>>>({
    bright: new Set(), dim: new Set(), darkness: new Set(),
  });
  const [draftAmbient, setDraftAmbient] = useState<LightTier>('bright');

  // 草稿区域（仅绘图模式创建的，保存时与法术区域合并）
  const [draftZones, setDraftZones] = useState<BattlegroundZone[]>([]);

  // 自定义区域的伤害与持续回合（仅 paintMode='custom' 时使用）
  const customAmountInput = useNumberInput(5, { fallback: 0 });
  const customDurationInput = useNumberInput(0, { fallback: 0 });

  // 缩放与平移
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // 退出确认弹窗
  const [exitModalOpen, setExitModalOpen] = useState(false);

  // 保存成功提示
  const [savedFlash, setSavedFlash] = useState(false);

  // 画笔撤销栈：每次起笔/切换环境前压入快照，撤销整体回滚到该步之前
  const [undoStack, setUndoStack] = useState<DraftSnapshot[]>([]);

  // 网格数据
  const [bg, setBg] = useState<BG | null>(null);

  // 数据加载
  useEffect(() => {
    if (!sessionId) return;
    const data = battlegroundStore.getOrCreate(sessionId);
    setBg(data);
    setDraftCells(new Set(data.paintedCells || []));
    setDraftZones((data.zones ?? []).filter(z => z.source === BRUSH_SOURCE));
    setDraftLight({
      bright: new Set(data.lightCells?.bright ?? []),
      dim: new Set(data.lightCells?.dim ?? []),
      darkness: new Set(data.lightCells?.darkness ?? []),
    });
    setDraftAmbient(data.ambientLight ?? 'bright');
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

  // 光照格索引："col,row" -> 档位（三桶互斥）
  const lightTierMap = useMemo(() => {
    const m = new Map<string, LightTier>();
    (['bright', 'dim', 'darkness'] as LightTier[]).forEach(t => {
      draftLight[t].forEach(key => m.set(key, t));
    });
    return m;
  }, [draftLight]);

  // 着火照明（火把口径：自身+20 尺明亮、再 20 尺微光），绘图时即时预览
  const fireLightMap = useMemo(() => buildFireLightMap(draftZones), [draftZones]);

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

  /** 当前画笔的区域预设（自定义时用表单值覆盖伤害与时长） */
  const activeZonePreset = paintMode === 'wall' || isLightMode(paintMode) ? null : ZONE_PRESETS[paintMode];

  /** 压入一次快照（起笔、切换环境前调用），上限 UNDO_LIMIT 步 */
  const pushUndo = () => {
    const snap: DraftSnapshot = {
      cells: [...draftCells],
      light: {
        bright: [...draftLight.bright],
        dim: [...draftLight.dim],
        darkness: [...draftLight.darkness],
      },
      zones: draftZones.map(z => ({ ...z, cells: [...z.cells] })),
      ambient: draftAmbient,
    };
    setUndoStack(prev => [...prev.slice(-(UNDO_LIMIT - 1)), snap]);
  };

  /** 撤销一步：整体回滚到最近一次快照 */
  const undoLastPaint = () => {
    if (undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setDraftCells(new Set(snap.cells));
    setDraftLight({
      bright: new Set(snap.light.bright),
      dim: new Set(snap.light.dim),
      darkness: new Set(snap.light.darkness),
    });
    setDraftZones(snap.zones);
    setDraftAmbient(snap.ambient);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const applyPaint = (key: string, mode: 'paint' | 'erase') => {
    if (isLightMode(paintMode)) {
      const tier = paintMode.slice('light:'.length) as LightTier;
      setDraftLight(prev => {
        const next = {
          bright: new Set(prev.bright),
          dim: new Set(prev.dim),
          darkness: new Set(prev.darkness),
        };
        // 同档重涂 = 擦除（与战斗沙盘旧交互一致）；异档重涂 = 迁移
        const sameTier = next[tier].has(key);
        next.bright.delete(key);
        next.dim.delete(key);
        next.darkness.delete(key);
        if (mode === 'paint' && !sameTier) next[tier].add(key);
        return next;
      });
      return;
    }
    if (paintMode === 'wall') {
      setDraftCells(prev => {
        const next = new Set(prev);
        if (mode === 'paint') next.add(key);
        else next.delete(key);
        return next;
      });
      return;
    }
    // 区域绘制：同一类型在草稿里合并成一个区域（DM 连续涂抹多格）
    const zoneType = paintMode;
    setDraftZones(prev => {
      const idx = prev.findIndex(z => z.type === zoneType && z.source === BRUSH_SOURCE);
      if (mode === 'erase') {
        if (idx === -1) return prev;
        const zones = [...prev];
        const cells = zones[idx].cells.filter(c => c !== key);
        if (cells.length === 0) zones.splice(idx, 1);
        else zones[idx] = { ...zones[idx], cells };
        return zones;
      }
      if (idx === -1) {
        const preset = ZONE_PRESETS[zoneType];
        const isCustom = zoneType === 'custom';
        const amount = isCustom ? Math.max(0, customAmountInput.value ?? 0) : (preset.damage?.amount ?? 0);
        return [...prev, {
          id: `zone-brush-${zoneType}`,
          type: zoneType,
          label: preset.label,
          cells: [key],
          color: preset.color,
          damage: amount > 0
            ? { amount, damageType: preset.damage?.damageType ?? '火焰', magical: preset.damage?.magical === true }
            : undefined,
          durationRounds: isCustom ? Math.max(0, customDurationInput.value ?? 0) : preset.durationRounds,
          source: BRUSH_SOURCE,
          hitRounds: {},
        }];
      }
      const zones = [...prev];
      if (zones[idx].cells.includes(key)) return prev;
      zones[idx] = { ...zones[idx], cells: [...zones[idx].cells, key] };
      return zones;
    });
  };

  /** 全图环境档位：设置默认光照并清空单格标注（环境=全图，画笔=单格覆盖） */
  const changeAmbient = (tier: LightTier) => {
    pushUndo();
    setDraftAmbient(tier);
    setDraftLight({ bright: new Set(), dim: new Set(), darkness: new Set() });
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
            pushUndo();
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

  /** 保存：涂白格子整体覆盖；区域只覆盖「绘图模式创建的」那部分，保留法术生成区域 */
  const persistDraft = () => {
    if (!sessionId) return;
    battlegroundStore.setPaintedCells(sessionId, [...draftCells]);
    const existing = battlegroundStore.getZones(sessionId).filter(z => z.source !== BRUSH_SOURCE);
    const brushZones = draftZones.map(z => ({
      ...z,
      // 绘图创建的区域没有回合概念：永久，由 DM 手动移除
      createdRound: undefined,
      expireRound: undefined,
    }));
    battlegroundStore.setZones(sessionId, [...existing, ...brushZones]);
    battlegroundStore.setLightCells(sessionId, {
      bright: [...draftLight.bright],
      dim: [...draftLight.dim],
      darkness: [...draftLight.darkness],
    });
    battlegroundStore.setAmbientLight(sessionId, draftAmbient);
  };

  const handleSave = () => {
    if (!sessionId) return;
    persistDraft();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleSaveAndExit = () => {
    if (!sessionId) return;
    persistDraft();
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
            const zonesHere = draftZones.filter(z => z.cells.includes(key));
            return (
              <div key={key}
                className={`border flex items-center justify-center relative ${
                  isPainted
                    ? 'bg-white dark:bg-white/90 border-gray-400 dark:border-gray-500'
                    : 'dark:border-border-dark/40 light:border-border-light/40'
                }`}
                style={{ width: cellSize, height: cellSize }}
              >
                {zonesHere.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ background: zonesHere[0].color }} />
                )}
                {combatant && (
                  <div className="rounded-full flex items-center justify-center font-bold text-white opacity-30 pointer-events-none"
                    style={{ width: cellSize - 6, height: cellSize - 6, fontSize: cellSize > 22 ? 11 : 9,
                      background: combatant.isPc ? 'var(--color-info)' : 'var(--color-danger)' }}>
                    {combatant.name.slice(0, 1)}
                  </div>
                )}
                {/* 光照遮罩：单格标注覆盖全图环境，着火照明作为下限；明亮=自然状态不叠图层 */}
                {(() => {
                  const baseTier = lightTierMap.get(key) ?? draftAmbient;
                  const fireTier = fireLightMap.get(key);
                  const tierHere = fireTier ? strongerTier(baseTier, fireTier) : baseTier;
                  return LIGHT_OVERLAY[tierHere] !== 'transparent'
                    ? <div className="absolute inset-0 z-30 pointer-events-none"
                        style={{ background: LIGHT_OVERLAY[tierHere] }} />
                    : null;
                })()}
              </div>
            );
          })}
        </div>

        <div className="absolute top-2 left-2 px-2 py-1 text-xs rounded-md bg-black/50 text-white pointer-events-none">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* 画笔对象选择 */}
      <div className="flex items-center justify-center gap-2 px-4 pt-3 flex-wrap">
        <span className="text-xs opacity-60">画笔对象</span>
        <button onClick={() => setPaintMode('wall')}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
            paintMode === 'wall' ? 'bg-primary text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-white/5'
          }`}>
          边界墙
        </button>
        {(Object.keys(ZONE_PRESETS) as ZoneType[]).map((t) => (
          <button key={t} onClick={() => setPaintMode(t)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
              paintMode === t ? 'bg-primary text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-white/5'
            }`}>
            {t === 'fire' && <Flame className="w-3.5 h-3.5" />}
            <span>{ZONE_PRESETS[t].label}</span>
          </button>
        ))}
      </div>

      {/* 光照：全图环境（默认档位）+ 单格画笔（明亮=自然状态无标注，故只画微光/黑暗） */}
      <div className="flex items-center justify-center gap-2 px-4 pt-2 flex-wrap">
        <span className="text-xs opacity-60">全图环境</span>
        {LIGHT_TIERS.map((t) => (
          <button key={`ambient-${t}`} onClick={() => changeAmbient(t)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              draftAmbient === t ? 'bg-primary text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-white/5'
            }`}
            title={`整张地图默认${LIGHT_LABELS[t]}（会清空单格光照标注）`}>
            {LIGHT_LABELS[t]}
          </button>
        ))}
        <span className="ml-3 text-xs opacity-60">单格画笔</span>
        {LIGHT_BRUSH_TIERS.map((t) => {
          const Icon = LIGHT_ICONS[t];
          const active = paintMode === `light:${t}`;
          return (
            <button key={`light-brush-${t}`} onClick={() => setPaintMode(`light:${t}`)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                active ? 'bg-info text-white' : 'border dark:border-border-dark light:border-border-light hover:bg-info/10'
              }`}
              title={`点击/拖拽给格子标注${LIGHT_LABELS[t]}（重涂同档擦除，橡皮可擦回自然明亮）`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{LIGHT_LABELS[t]}</span>
            </button>
          );
        })}
      </div>
      {paintMode === 'custom' && (
        <div className="flex items-center justify-center gap-3 px-4 pt-2 text-xs">
          <label className="flex items-center gap-1">
            <span className="opacity-60">伤害</span>
            <input type="number" value={customAmountInput.text}
              onChange={e => customAmountInput.onChange(e.target.value)}
              onBlur={customAmountInput.onBlur}
              className="w-16 rounded px-2 py-1 border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-white" />
          </label>
          <label className="flex items-center gap-1">
            <span className="opacity-60">持续回合（0=永久）</span>
            <input type="number" value={customDurationInput.text}
              onChange={e => customDurationInput.onChange(e.target.value)}
              onBlur={customDurationInput.onBlur}
              className="w-16 rounded px-2 py-1 border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-white" />
          </label>
        </div>
      )}
      {activeZonePreset && (
        <div className="px-4 pt-2 text-center text-xs opacity-55">
          {activeZonePreset.description}
        </div>
      )}
      {isLightMode(paintMode) && (
        <div className="px-4 pt-2 text-center text-xs opacity-55">
          光照画笔（{LIGHT_LABELS[paintMode.slice('light:'.length) as LightTier]}）：点击/拖拽给格子标注{paintMode === 'light:dim' ? '微光' : '黑暗'}，重涂同档擦除；明亮无需标注（自然状态），用橡皮擦回
        </div>
      )}

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
        <button onClick={undoLastPaint} disabled={undoStack.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors border dark:border-border-dark light:border-border-light hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
          title="撤销上一步画笔/环境操作">
          <Undo2 className="w-4 h-4" />
          <span>撤销</span>
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
