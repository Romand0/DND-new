// 网格沙盘组件 —— 展示参战者位置与移动，支持三种大小预设
import { useState, useEffect, useMemo, useRef } from 'react';
import { Grid3x3, Eraser, Trash2, ZoomIn, ZoomOut, Undo2, X, Swords, BookOpen, MoreHorizontal, Package } from 'lucide-react';
import battlegroundStore from '@/data/battlegroundStore';
import { GRID_PRESETS } from '@/types/battleground';
import type { Battleground as BG, GridSize, ItemToken } from '@/types/battleground';
import type { Combatant, EquipmentChanges } from '@/types/combat';
import type { Equipment } from '@/types/character';
import CombatantInfoPanel from './CombatantInfoPanel';

interface Props {
  sessionId: string;
  combatants: Combatant[];
  // 战斗按钮触发：交由 main（CombatSession）处理攻击检定弹窗
  onRequestAttack?: (attacker: Combatant, target: Combatant) => void;
  // 法术按钮触发：交由 main（CombatSession）处理法术施放弹窗
  onRequestSpell?: (caster: Combatant, target: Combatant) => void;
  /** 拾起掉落物品：交由 main 处理（体型/智力检查 + 加入背包 + 移除 token） */
  onPickupItem?: (itemToken: ItemToken, picker: Combatant) => void;
  /** 放映模式：禁用所有沙盘操作（移动、放置、删除、橡皮） */
  readOnly?: boolean;
  /** 当前回合角色 ID（放映模式高亮） */
  activeTurnCombatantId?: string | null;
  /**
   * 放映模式下：仅该角色可以操作沙盘（移动/选中/攻击），
   * 其他角色不可操作。未指定时所有角色都可操作。
   * 单独传递以区别于 readOnly（readOnly 仍可控制全局锁定）。
   */
  playbackOnlyMovableId?: string | null;
  /** 战斗背包（外部传入，key 为 combatantId）—— 信息面板 / 手持选择等将优先读取它 */
  combatInventories?: Record<string, Equipment[]>;
  /** 从战斗背包删除物品（通过变更信息漏斗） */
  onRemoveItem?: (combatantId: string, item: Equipment) => void;
  /** 各参战者的装备变更信息（漏斗），key 为 combatantId */
  equipmentChangesMap?: Record<string, EquipmentChanges>;
  /** 直接更新某参战者的变更信息（变更信息编辑弹窗用） */
  onUpdateChanges?: (combatantId: string, changes: EquipmentChanges) => void;
}

export default function Battleground({ sessionId, combatants, onRequestAttack, onRequestSpell, onPickupItem, readOnly = false, activeTurnCombatantId = null, playbackOnlyMovableId = null, combatInventories, onRemoveItem, equipmentChangesMap, onUpdateChanges }: Props) {
  const [bg, setBg] = useState<BG | null>(null);
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [eraserMode, setEraserMode] = useState(false);
  // 双击弹窗
  const [doubleClickedCombatant, setDoubleClickedCombatant] = useState<Combatant | null>(null);
  // 缩放与平移状态
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // 长按拖拽锁定状态
  const [dragLock, setDragLock] = useState<{
    sourceId: string;          // 发起长按的棋子
    pointerX: number;          // 当前指针屏幕坐标
    pointerY: number;
    hoveredTargetId: string | null;   // 当前接触的目标棋子
    hoveredItemTokenId: string | null; // 当前接触的掉落物品 token
  } | null>(null);
  // 锁定选中状态（长按拖拽松手后选中）
  const [lockedTargetId, setLockedTargetId] = useState<string | null>(null);
  // 锁定选中时记录发起者（攻击者），用于战斗按钮
  const [lockedSourceId, setLockedSourceId] = useState<string | null>(null);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragLockRef = useRef<typeof dragLock>(null);
  dragLockRef.current = dragLock;
  // 拖拽圆框位置用 ref + 直接 DOM 更新，避免每帧 setState 导致卡顿
  const dragCircleRef = useRef<HTMLDivElement | null>(null);

  const touchState = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startPoints: Map<number, { x: number; y: number }>;
    startTranslate: { x: number; y: number };
    startScale: number;
    startDist: number;
    // 双指按下时的中点（屏幕坐标）和对应的容器内坐标，
    // 用于以双指中心为锚点缩放（而非默认的左上角）
    startMidScreen: { x: number; y: number };
    moved: boolean;
  }>({
    pointers: new Map(),
    startPoints: new Map(),
    startTranslate: { x: 0, y: 0 },
    startScale: 1,
    startDist: 0,
    startMidScreen: { x: 0, y: 0 },
    moved: false,
  });
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  // 同步最新 translate/scale 到 ref，避免 pointerup 闭包拿到陈旧的 state
  // （双指→单指切换时若用旧 startTranslate，会导致剩余手指突然跳变）
  const latestTranslate = useRef(translate);
  latestTranslate.current = translate;
  const updateTranslate = (next: { x: number; y: number }) => {
    latestTranslate.current = next; // 同步刷新，保证 pointerup 拿到最新值
    setTranslate(next);
  };

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

  // 格子 -> 掉落物品 token 列表 反向索引
  const cellItemTokens = useMemo(() => {
    const m = new Map<string, ItemToken[]>(); // "col,row" -> ItemToken[]
    (bg?.itemTokens || []).forEach((t) => {
      const key = `${t.col},${t.row}`;
      const arr = m.get(key) || [];
      arr.push(t);
      m.set(key, arr);
    });
    return m;
  }, [bg?.itemTokens]);

  // 实体选择对话框：当格子有多个实体时展示
  const [entityPickerCell, setEntityPickerCell] = useState<string | null>(null); // "col,row"
  // 锁定的物品 token id（光圈选中物品时）
  const [lockedItemTokenId, setLockedItemTokenId] = useState<string | null>(null);

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

  // 锁定角色或物品后：若所在格有多个实体，自动展开实体选择对话框
  useEffect(() => {
    if (!bg) return;
    let targetCol = -1;
    let targetRow = -1;
    if (lockedTargetId) {
      const token = tokenMap.get(lockedTargetId);
      if (token) {
        targetCol = token.col;
        targetRow = token.row;
      }
    } else if (lockedItemTokenId) {
      const itemT = (bg.itemTokens || []).find(t => t.id === lockedItemTokenId);
      if (itemT) {
        targetCol = itemT.col;
        targetRow = itemT.row;
      }
    }
    if (targetCol >= 0 && targetRow >= 0) {
      const key = `${targetCol},${targetRow}`;
      const combatantsHere = cellToken.get(key) ? 1 : 0;
      const itemsHere = cellItemTokens.get(key)?.length || 0;
      if (combatantsHere + itemsHere > 1) {
        setEntityPickerCell(key);
      }
    }
  }, [lockedTargetId, lockedItemTokenId, bg, tokenMap, cellToken, cellItemTokens]);

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
      // 记录双指中点（屏幕坐标），作为缩放锚点
      ts.startMidScreen = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };
    }
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    // 进入拖拽锁定模式时禁止网格平移
    if (dragLockRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const ts = touchState.current;
    if (!ts.pointers.has(e.pointerId)) return;
    ts.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // 拖拽锁定模式：直接操作 DOM 更新圆框位置，避免每帧 setState
    if (dragLockRef.current) {
      e.preventDefault();
      const px = e.clientX;
      const py = e.clientY;

      // 直接更新圆框 DOM 位置（流畅，无 React 重渲染）
      if (dragCircleRef.current) {
        const rect = gridWrapRef.current?.getBoundingClientRect();
        if (rect) {
          const size = cellSize * scale * 2;
          dragCircleRef.current.style.left = `${px - rect.left - size / 2}px`;
          dragCircleRef.current.style.top = `${py - rect.top - size / 2}px`;
        }
      }

      // 检测接触的棋子或物品（仅在必要时 setState）
      let hoveredId: string | null = null;
      let hoveredItemId: string | null = null;
      const gridEl = gridWrapRef.current;
      if (gridEl) {
        const rect = gridEl.getBoundingClientRect();
        // 识别半径与白圈本身一样大（2 倍棋子尺寸的一半）
        const detectRadius = cellSize * scale;
        // 根据发起者类型决定检测顺序
        const fromItem = !dragLockRef.current.sourceId; // sourceId 为空表示从物品发起
        if (fromItem) {
          // 从物品发起：优先检测角色棋子
          for (const token of bg.tokens) {
            const cellX = rect.left + translate.x + (token.col + 0.5) * cellSize * scale;
            const cellY = rect.top + translate.y + (token.row + 0.5) * cellSize * scale;
            const dist = Math.hypot(px - cellX, py - cellY);
            if (dist < detectRadius) {
              hoveredId = token.combatantId;
              break;
            }
          }
          // 若未接触角色，则检测其他物品
          if (!hoveredId) {
            for (const itemToken of bg.itemTokens || []) {
              if (itemToken.id === dragLockRef.current.hoveredItemTokenId) continue; // 跳过自身
              const cellX = rect.left + translate.x + (itemToken.col + 0.5) * cellSize * scale;
              const cellY = rect.top + translate.y + (itemToken.row + 0.5) * cellSize * scale;
              const dist = Math.hypot(px - cellX, py - cellY);
              if (dist < detectRadius) {
                hoveredItemId = itemToken.id;
                break;
              }
            }
          }
        } else {
          // 从角色发起：按原逻辑检测
          for (const token of bg.tokens) {
            if (token.combatantId === dragLockRef.current.sourceId) continue;
            const cellX = rect.left + translate.x + (token.col + 0.5) * cellSize * scale;
            const cellY = rect.top + translate.y + (token.row + 0.5) * cellSize * scale;
            const dist = Math.hypot(px - cellX, py - cellY);
            if (dist < detectRadius) {
              hoveredId = token.combatantId;
              break;
            }
          }
          // 若未接触角色，则检测掉落物品
          if (!hoveredId) {
            for (const itemToken of bg.itemTokens || []) {
              const cellX = rect.left + translate.x + (itemToken.col + 0.5) * cellSize * scale;
              const cellY = rect.top + translate.y + (itemToken.row + 0.5) * cellSize * scale;
              const dist = Math.hypot(px - cellX, py - cellY);
              if (dist < detectRadius) {
                hoveredItemId = itemToken.id;
                break;
              }
            }
          }
        }
      }
      // 仅当 hovered 对象变化时才 setState，避免每帧重渲染
      if (
        hoveredId !== dragLockRef.current.hoveredTargetId ||
        hoveredItemId !== dragLockRef.current.hoveredItemTokenId
      ) {
        // 切换半选中对象时震动
        if ((hoveredId || hoveredItemId) && navigator.vibrate) navigator.vibrate(10);
        setDragLock(prev => prev ? {
          ...prev,
          hoveredTargetId: hoveredId,
          hoveredItemTokenId: hoveredItemId,
        } : null);
      }
      ts.moved = true;
      return;
    }

    // 长按等待中：移动超过阈值则取消长按，继续执行平移
    if (longPressTimer.current && longPressStartRef.current) {
      const dx = e.clientX - longPressStartRef.current.x;
      const dy = e.clientY - longPressStartRef.current.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        // 重置平移起始点，从当前位置开始平移
        ts.startPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
        ts.startTranslate = { ...translate };
      } else {
        return; // 未超过阈值，不触发任何操作
      }
    }

    if (ts.pointers.size === 1) {
      // 单指平移：用按下时记录的起始位置做参照
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
    if (ts.pointers.size === 2) {
      // 双指缩放：以实时双指中点为锚点（而非默认的左上角），
      // 这样滑动两指时，"指头下面的那块地图"始终在指头下面。
      ts.moved = true;
      const pts = Array.from(ts.pointers.values());
      const dist = getDistance(pts[0], pts[1]);
      if (ts.startDist > 0) {
        const newScale = Math.max(0.5, Math.min(3, ts.startScale * (dist / ts.startDist)));
        // 实时双指中点（屏幕坐标）相对于容器左上角的偏移
        const rect = gridWrapRef.current?.getBoundingClientRect();
        if (rect) {
          // 用按下时的中点做锚点参照，确保缩放手势中锚点不抖动：
          //   按下时锚点屏幕位置 = rect.left + startTranslate + startScale * startMidOffset
          //   令 newTranslate 使按下时的锚点屏幕位置 = rect.left + newTranslate + newScale * startMidOffset
          //   → newTranslate = startTranslate + (startScale - newScale) * startMidOffset
          // 同时叠加按下后双指中点的移动量（startMid → 当前 mid），实现"跟着指头走"
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
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // 清除长按计时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // 拖拽锁定模式松手：确定目标
    if (dragLockRef.current) {
      const source = dragLockRef.current.sourceId;
      const target = dragLockRef.current.hoveredTargetId;
      const hoveredItem = dragLockRef.current.hoveredItemTokenId;
      const fromItem = !source; // 从物品发起
      
      if (fromItem) {
        // 从物品发起的白圈：
        // - 若 hover 到角色：锁定角色（但无攻击者 sourceId）
        // - 若未 hover：锁定物品自己（用于拾起）
        if (target) {
          setLockedTargetId(target);
          setLockedSourceId(null); // 无攻击者
          setLockedItemTokenId(null);
        } else {
          // 锁定物品自己
          setLockedItemTokenId(dragLockRef.current.hoveredItemTokenId);
          setLockedTargetId(null);
          setLockedSourceId(null);
        }
      } else {
        // 从角色发起的白圈（原逻辑）
        if (target) {
          setLockedTargetId(target);
          setLockedSourceId(source);
          setLockedItemTokenId(null);
        } else if (hoveredItem) {
          // 选中掉落物：锁定物品 token，保留发起者作为拾取者
          setLockedItemTokenId(hoveredItem);
          setLockedTargetId(null);
          setLockedSourceId(source); // 关键：保留发起者 ID，用于拾取时确定 picker
        }
      }
      setDragLock(null);
      dragLockRef.current = null;
      const ts = touchState.current;
      ts.pointers.delete(e.pointerId);
      ts.startPoints.delete(e.pointerId);
      return;
    }
    const ts = touchState.current;
    ts.pointers.delete(e.pointerId);
    ts.startPoints.delete(e.pointerId);
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    // 双指 → 单指切换的关键修复：
    //   双指捏合过程中 ts.startTranslate / ts.startPoints 一直停留在"双指按下瞬间"的值，
    //   若不重置，松开一指后剩余手指继续移动会按"按下时的旧起点"计算 delta，
    //   导致画面突然跳变（动作越快、单指位移越大，跳变越明显）。
    //   修复：把剩余那根手指的 startPoints 重置为"当前"位置，
    //   并把 startTranslate 同步为"当前"实际 translate（通过 ref 取最新值，避免闭包陈旧）。
    if (ts.pointers.size === 1) {
      const remainingId = Array.from(ts.pointers.keys())[0];
      const cur = ts.pointers.get(remainingId);
      if (cur) {
        ts.startPoints.set(remainingId, { x: cur.x, y: cur.y });
        ts.startTranslate = { ...latestTranslate.current };
      }
    }
  };

  // 点击格子：只有未发生拖拽时才触发
  const handleCellClick = (col: number, row: number) => {
    if (readOnly) return;
    if (touchState.current.moved) {
      touchState.current.moved = false;
      return;
    }
    const existingCombatantId = cellToken.get(`${col},${row}`);
    if (eraserMode) {
      if (existingCombatantId) battlegroundStore.removeToken(sessionId, existingCombatantId);
      return;
    }
    // 放映模式：检查是否只允许某个角色可操作
    if (playbackOnlyMovableId) {
      // 已选中参战者
      if (selectedCombatantId) {
        // 只有选中的就是允许的角色时，才能移动
        if (selectedCombatantId !== playbackOnlyMovableId) {
          setSelectedCombatantId(null);
          return;
        }
        if (existingCombatantId === selectedCombatantId) {
          setSelectedCombatantId(null);
          return;
        }
        if (existingCombatantId) {
          // 占用其他格子：允许切换选择（只能切换到允许的角色）
          if (existingCombatantId !== playbackOnlyMovableId) {
            return; // 不可选中其他角色
          }
          setSelectedCombatantId(existingCombatantId);
          return;
        }
        // 空格 → 移动到该格
        battlegroundStore.placeToken(sessionId, { combatantId: selectedCombatantId, col, row });
        setSelectedCombatantId(null);
        return;
      }
      // 未选中：只能选中允许的角色
      if (existingCombatantId === playbackOnlyMovableId) {
        setSelectedCombatantId(existingCombatantId);
      }
      return;
    }
    // 已选中参战者（非放映模式）
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

  const handleUndo = () => {
    battlegroundStore.undoMove(sessionId);
    setSelectedCombatantId(null);
  };

  const undoCount = bg?.moveHistory?.length ?? 0;

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
              if (playbackOnlyMovableId) return; // 放映模式禁用橡皮
              setEraserMode((v) => !v);
              setSelectedCombatantId(null);
            }}
            disabled={!!playbackOnlyMovableId}
            className={`px-2 py-1 text-xs rounded-lg border flex items-center gap-1 transition-colors ${
              eraserMode
                ? 'bg-danger text-white border-danger'
                : 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">橡皮</span>
          </button>
          <button
            onClick={() => {
              if (playbackOnlyMovableId) return; // 放映模式禁用撤回
              handleUndo();
            }}
            disabled={!!playbackOnlyMovableId || undoCount === 0}
            className="px-2 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-inherit"
            title={`撤回（${undoCount}/5）`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">撤回{undoCount > 0 ? ` (${undoCount})` : ''}</span>
          </button>
          <button
            onClick={() => {
              if (playbackOnlyMovableId) return; // 放映模式禁用清空
              handleClear();
            }}
            disabled={!!playbackOnlyMovableId}
            className="px-2 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-danger/10 hover:text-danger transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
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
          {placed.map((c) => {
            // 放映模式下：仅当前回合角色可被选中
            const selectable = !playbackOnlyMovableId || c.id === playbackOnlyMovableId;
            return (
            <button
              key={c.id}
              onClick={() => {
                if (eraserMode) return;
                if (!selectable) return;
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
              } ${eraserMode ? 'opacity-40 cursor-not-allowed' : !selectable ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {c.name}
            </button>
            );
          })}
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
          {unplaced.map((c) => {
            const selectable = !playbackOnlyMovableId || c.id === playbackOnlyMovableId;
            return (
            <button
              key={c.id}
              onClick={() => {
                if (!selectable) return;
                setSelectedCombatantId(c.id === selectedCombatantId ? null : c.id);
                setEraserMode(false);
              }}
              className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                selectedCombatantId === c.id
                  ? 'bg-primary text-white border-primary'
                  : c.isPc
                  ? 'border-info/50 text-info hover:bg-info/10'
                  : 'border-danger/50 text-danger hover:bg-danger/10'
              } ${!selectable ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              {c.name}
            </button>
            );
          })}
        </div>
        {/* 提示语 —— 固定双行高度，避免选中状态切换导致沙盘整体位移 */}
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted min-h-[2rem] leading-4">
          {playbackOnlyMovableId
            ? `放映模式：仅 ${combatantMap.get(playbackOnlyMovableId)?.name ?? '当前角色'} 可操作沙盘`
            : eraserMode
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
        onDoubleClick={() => {
          if (lockedTargetId) {
            setLockedTargetId(null);
            setLockedSourceId(null);
          }
        }}
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
            const itemsHere = cellItemTokens.get(key) || [];
            const hasMultiple = (combatant ? 1 : 0) + itemsHere.length > 1;
            const isHover = selectedCombatantId && !eraserMode;
            const inMoveRange = moveRangeSet.has(key);
            // 拖拽锁定时被接触的棋子高亮白圈
            const isDragHovered = dragLock?.hoveredTargetId === combatantId;
            // 锁定选中的棋子
            const isLocked = lockedTargetId === combatantId;
            // 放映模式下当前回合角色
            const isActiveTurn = activeTurnCombatantId === combatantId;
            return (
              <div
                key={i}
                onClick={() => handleCellClick(col, row)}
                className={`border flex items-center justify-center cursor-pointer transition-colors relative ${
                  inMoveRange
                    ? 'bg-info/30 border-info/40'
                    : 'dark:border-border-dark/40 light:border-border-light/40'
                } ${isHover ? 'hover:bg-primary/20' : ''} ${
                  eraserMode && combatantId ? 'hover:bg-danger/30' : ''
                }`}
                style={{ width: cellSize, height: cellSize }}
                title={combatant ? combatant.name : itemsHere.length > 0 ? itemsHere.map(t => t.name).join(', ') : `${col},${row}`}
              >
                {/* 掉落物品 token：武器图标，位于角色下层 */}
                {itemsHere.length > 0 && (() => {
                  const item = itemsHere[0];
                  const isItemLocked = lockedItemTokenId === item.id;
                  // 多实体格：物品渲染但不显示（用于白圈检测），单实体格正常显示
                  const isHidden = hasMultiple;
                  return (
                    <div
                      className={`absolute rounded-lg flex items-center justify-center transition-all select-none bg-amber-600/80 ${
                        isItemLocked ? 'ring-2 ring-yellow-400 scale-110 z-10' : 'z-0'
                      } ${isHidden ? 'opacity-0 pointer-events-none' : ''}`}
                      style={{
                        width: cellSize - 8,
                        height: cellSize - 8,
                        touchAction: 'none',
                      }}
                      onPointerDown={(e) => {
                        if (readOnly) return;
                        e.stopPropagation();
                        if (longPressTimer.current) clearTimeout(longPressTimer.current);
                        longPressStartRef.current = { x: e.clientX, y: e.clientY };
                        longPressTimer.current = setTimeout(() => {
                          if (longPressStartRef.current) {
                            // 设置白圈位置
                            const rect = gridWrapRef.current?.getBoundingClientRect();
                            const size = cellSize * scale * 2;
                            if (rect && dragCircleRef.current) {
                              dragCircleRef.current.style.left = `${longPressStartRef.current.x - rect.left - size / 2}px`;
                              dragCircleRef.current.style.top = `${longPressStartRef.current.y - rect.top - size / 2}px`;
                            }
                            if (navigator.vibrate) navigator.vibrate(15);
                            // 物品 token 启动白圈（sourceId 为空表示物品发起，用于区分）
                            setDragLock({
                              sourceId: '', // 空字符串表示从物品发起
                              pointerX: longPressStartRef.current.x,
                              pointerY: longPressStartRef.current.y,
                              hoveredTargetId: null,
                              hoveredItemTokenId: item.id,
                            });
                          }
                        }, 350);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (readOnly) return;
                        // 若当前已有选中的角色（待移动状态）：优先将角色移到物品所在格（同格共存）
                        if (selectedCombatantId && !playbackOnlyMovableId) {
                          battlegroundStore.placeToken(sessionId, {
                            combatantId: selectedCombatantId,
                            col,
                            row,
                          });
                          setSelectedCombatantId(null);
                          return;
                        }
                        // 放映模式下：只允许指定操作的角色移动
                        if (
                          selectedCombatantId &&
                          playbackOnlyMovableId &&
                          selectedCombatantId === playbackOnlyMovableId
                        ) {
                          battlegroundStore.placeToken(sessionId, {
                            combatantId: selectedCombatantId,
                            col,
                            row,
                          });
                          setSelectedCombatantId(null);
                          return;
                        }
                        // 未选中待移动角色：直接锁定物品以显示拾起按钮
                        setLockedItemTokenId(item.id);
                        setLockedTargetId(null);
                        setLockedSourceId(null);
                      }}
                    >
                      <Package style={{ width: cellSize * 0.45, height: cellSize * 0.45 }} className="text-white" />
                    </div>
                  );
                })()}

                {/* 多实体共存：角色棋子在上层 */}
                {combatant && (() => {
                  const downed = combatant.isDead || combatant.isUnconscious;
                  return (
                  <div
                    className={`relative rounded-full flex items-center justify-center font-bold text-white leading-none transition-all select-none z-10 ${
                      downed
                        ? 'bg-gray-500'
                        : combatant.isPc ? 'bg-info' : 'bg-danger'
                    } ${selectedCombatantId === combatant.id ? 'ring-2 ring-white scale-110' : ''} ${
                      isDragHovered ? 'ring-2 ring-white' : ''
                    } ${isLocked ? 'ring-2 ring-yellow-400 scale-110' : ''} ${
                      downed ? 'opacity-60' : ''
                    } ${isActiveTurn ? 'ring-4 ring-yellow-300 animate-pulse scale-110 shadow-lg shadow-yellow-400/50' : ''}`}
                    style={{
                      width: cellSize - 6,
                      height: cellSize - 6,
                      fontSize: cellSize > 22 ? 11 : 9,
                      touchAction: 'none',
                    }}
                    onPointerDown={(e) => {
                      if (readOnly) return;
                      // 放映模式下：只允许当前回合角色长按
                      if (playbackOnlyMovableId && combatant.id !== playbackOnlyMovableId) return;
                      // 不 stopPropagation，让网格容器收到事件并 setPointerCapture
                      // 启动长按计时器
                      if (longPressTimer.current) clearTimeout(longPressTimer.current);
                      longPressStartRef.current = { x: e.clientX, y: e.clientY };
                      longPressTimer.current = setTimeout(() => {
                        if (longPressStartRef.current) {
                          // 长按触发：先设置位置，再显示（避免闪烁）
                          const rect = gridWrapRef.current?.getBoundingClientRect();
                          const size = cellSize * scale * 2;
                          if (rect && dragCircleRef.current) {
                            dragCircleRef.current.style.left = `${longPressStartRef.current.x - rect.left - size / 2}px`;
                            dragCircleRef.current.style.top = `${longPressStartRef.current.y - rect.top - size / 2}px`;
                          }
                          // 手机震动反馈
                          if (navigator.vibrate) navigator.vibrate(15);
                          setDragLock({
                            sourceId: combatant.id,
                            pointerX: longPressStartRef.current.x,
                            pointerY: longPressStartRef.current.y,
                            hoveredTargetId: null,
                            hoveredItemTokenId: null,
                          });
                        }
                      }, 350);
                    }}
                    onDoubleClick={() => setDoubleClickedCombatant(combatant)}
                  >
                    {combatant.name.slice(0, 1)}
                    {/* 死亡：红叉叠加 */}
                    {combatant.isDead && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 100 100"
                        style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                      >
                        <line x1="15" y1="15" x2="85" y2="85" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" />
                        <line x1="85" y1="15" x2="15" y2="85" stroke="#ef4444" strokeWidth="12" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                  );
                })()}

                {/* 多实体共存的 "..." 按钮 */}
                {hasMultiple && !readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEntityPickerCell(entityPickerCell === key ? null : key);
                    }}
                    className={`absolute top-0 right-0 z-20 rounded-full flex items-center justify-center bg-gray-800 text-white shadow-lg transition-transform hover:scale-110 ${
                      entityPickerCell === key ? 'ring-2 ring-yellow-400' : ''
                    }`}
                    style={{
                      width: Math.max(14, cellSize * 0.4),
                      height: Math.max(14, cellSize * 0.4),
                    }}
                    title="该格有多个实体"
                  >
                    <MoreHorizontal style={{ width: '70%', height: '70%' }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 拖拽锁定时跟随指针的白色半透明圆框（始终在DOM中，用opacity控制显隐，避免闪烁） */}
        <div
          ref={dragCircleRef}
          className="absolute pointer-events-none z-20 rounded-full border-2 border-white/60 bg-white/15 transition-opacity duration-100"
          style={{
            width: cellSize * scale * 2,
            height: cellSize * scale * 2,
            left: -9999,
            top: -9999,
            opacity: dragLock ? 1 : 0,
          }}
        />

        {/* 半选中框：右上角显示当前半选中棋子的样式和名字 */}
        {(dragLock?.hoveredTargetId || dragLock?.hoveredItemTokenId) && (() => {
          if (dragLock?.hoveredTargetId) {
            const hoveredCombatant = combatantMap.get(dragLock.hoveredTargetId);
            if (!hoveredCombatant) return null;
            return (
              <div className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/70 text-white shadow-lg pointer-events-none animate-in fade-in slide-in-from-right duration-150">
                <div
                  className={`rounded-full flex items-center justify-center font-bold text-white shrink-0 ${
                    hoveredCombatant.isPc ? 'bg-info' : 'bg-danger'
                  }`}
                  style={{ width: 28, height: 28, fontSize: 12 }}
                >
                  {hoveredCombatant.name.slice(0, 1)}
                </div>
                <span className="text-sm font-medium">{hoveredCombatant.name}</span>
              </div>
            );
          } else if (dragLock?.hoveredItemTokenId) {
            const itemToken = (bg?.itemTokens || []).find(t => t.id === dragLock.hoveredItemTokenId);
            if (!itemToken) return null;
            return (
              <div className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-2 rounded-lg bg-black/70 text-white shadow-lg pointer-events-none animate-in fade-in slide-in-from-right duration-150">
                <div
                  className="rounded bg-amber-600 flex items-center justify-center shrink-0"
                  style={{ width: 28, height: 28 }}
                >
                  <Package style={{ width: 16, height: 16 }} className="text-white" />
                </div>
                <span className="text-sm font-medium">{itemToken.name}</span>
              </div>
            );
          }
          return null;
        })()}

        {/* 锁定选中后展开的交互按钮 + 叉按钮 */}
        {lockedTargetId && (() => {
          const token = tokenMap.get(lockedTargetId);
          const combatant = combatantMap.get(lockedTargetId);
          if (!token || !combatant) return null;
          const rect = gridWrapRef.current?.getBoundingClientRect();
          if (!rect) return null;
          // 棋子中心相对于网格容器的坐标
          const cx = translate.x + (token.col + 0.5) * cellSize * scale;
          const cy = translate.y + (token.row + 0.5) * cellSize * scale;
          const tokenSize = (cellSize - 6) * scale;
          // 按钮大小：1.5 倍棋子大小
          const btnSize = tokenSize * 1.5;
          // 按钮在上侧弧形排列，角度范围 -160° ~ -20°（上半圆展开更大）
          const actions = [
            { angle: -160 },
            { angle: -113 },
            { angle: -67 },
            { angle: -20 },
          ];
          const radius = tokenSize * 0.8 + btnSize * 0.8;
          // 发起者（攻击者）= 长按源棋子；目标 = 锁定的棋子
          const attacker = lockedSourceId ? combatantMap.get(lockedSourceId) : null;
          // 同队伍判定：均为 PC 或均为 NPC 时禁止攻击
          const sameTeam = !!attacker && !!combatant && (attacker.isPc === combatant.isPc);
          return (
            <>
              {/* 四个上侧弧形按钮 */}
              {actions.map((a, i) => {
                const rad = (a.angle * Math.PI) / 180;
                const bx = cx + Math.cos(rad) * radius - btnSize / 2;
                const by = cy + Math.sin(rad) * radius - btnSize / 2;
                const isCombat = i === 0;
                const isSpell = i === 1;
                const combatDisabled = isCombat && sameTeam;
                return (
                  <button
                    key={i}
                    disabled={combatDisabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (combatDisabled) return;
                      if (isCombat && attacker && onRequestAttack) {
                        onRequestAttack(attacker, combatant);
                        setLockedTargetId(null);
                        setLockedSourceId(null);
                      } else if (isSpell && attacker && onRequestSpell) {
                        onRequestSpell(attacker, combatant);
                        setLockedTargetId(null);
                        setLockedSourceId(null);
                      }
                    }}
                    className={`absolute z-30 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform ${
                      combatDisabled
                        ? 'bg-gray-400/60 text-white/70 cursor-not-allowed'
                        : isCombat
                        ? 'bg-danger text-white hover:scale-110'
                        : isSpell
                        ? 'bg-primary text-white hover:scale-110'
                        : 'bg-primary text-white hover:scale-110'
                    }`}
                    style={{
                      width: btnSize,
                      height: btnSize,
                      left: bx,
                      top: by,
                    }}
                    title={combatDisabled ? '同队伍不可攻击' : isSpell ? '施放法术' : undefined}
                  >
                    {isCombat ? (
                      <>
                        <Swords style={{ width: btnSize * 0.38, height: btnSize * 0.38 }} />
                        <span style={{ fontSize: Math.max(8, btnSize * 0.16) }} className="font-medium leading-none mt-0.5">战斗</span>
                      </>
                    ) : isSpell ? (
                      <>
                        <BookOpen style={{ width: btnSize * 0.38, height: btnSize * 0.38 }} />
                        <span style={{ fontSize: Math.max(8, btnSize * 0.16) }} className="font-medium leading-none mt-0.5">法术</span>
                      </>
                    ) : null}
                  </button>
                );
              })}
              {/* 叉按钮：棋子下方，略小于棋子 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLockedTargetId(null);
                  setLockedSourceId(null);
                }}
                className="absolute z-30 bg-gray-700 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                style={{
                  width: Math.max(16, tokenSize * 0.55),
                  height: Math.max(16, tokenSize * 0.55),
                  left: cx - Math.max(16, tokenSize * 0.55) / 2,
                  top: cy + tokenSize * 0.7,
                }}
                title="取消选中"
              >
                <X style={{ width: '60%', height: '60%' }} />
              </button>
            </>
          );
        })()}

        {/* 锁定物品 token 后的拾起按钮 */}
        {lockedItemTokenId && (() => {
          const itemToken = (bg?.itemTokens || []).find(t => t.id === lockedItemTokenId);
          if (!itemToken) return null;
          const rect = gridWrapRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const cx = translate.x + (itemToken.col + 0.5) * cellSize * scale;
          const cy = translate.y + (itemToken.row + 0.5) * cellSize * scale;
          const tokenSize = (cellSize - 8) * scale;
          const btnSize = tokenSize * 1.5;
          return (
            <>
              {/* 拾起按钮：物品上方 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // 拾起：确定拾取者优先级：
                  // 1. lockedSourceId（白圈发起者）
                  // 2. selectedCombatantId（单击选中的角色）
                  // 3. activeTurnCombatantId（放映模式当前回合角色）
                  const pickerId = lockedSourceId || selectedCombatantId || activeTurnCombatantId;
                  if (pickerId) {
                    const picker = combatantMap.get(pickerId);
                    if (picker && onPickupItem) {
                      onPickupItem(itemToken, picker);
                    }
                  } else {
                    alert('请先选中一个角色再拾起物品');
                  }
                  setLockedItemTokenId(null);
                  setLockedSourceId(null);
                }}
                className="absolute z-30 rounded-full flex flex-col items-center justify-center shadow-lg transition-transform bg-amber-600 text-white hover:scale-110"
                style={{
                  width: btnSize,
                  height: btnSize,
                  left: cx - btnSize / 2,
                  top: cy - tokenSize * 0.7 - btnSize,
                }}
                title="拾起物品"
              >
                <Package style={{ width: btnSize * 0.38, height: btnSize * 0.38 }} />
                <span style={{ fontSize: Math.max(8, btnSize * 0.16) }} className="font-medium leading-none mt-0.5">拾起</span>
              </button>
              {/* 取消选中按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLockedItemTokenId(null);
                }}
                className="absolute z-30 bg-gray-700 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                style={{
                  width: Math.max(16, tokenSize * 0.55),
                  height: Math.max(16, tokenSize * 0.55),
                  left: cx - Math.max(16, tokenSize * 0.55) / 2,
                  top: cy + tokenSize * 0.7,
                }}
                title="取消选中"
              >
                <X style={{ width: '60%', height: '60%' }} />
              </button>
            </>
          );
        })()}

        {/* 实体选择对话框：当格子有多个实体且 "..." 被点击时展示 */}
        {entityPickerCell && (() => {
          const combatantId = cellToken.get(entityPickerCell);
          const combatant = combatantId ? combatantMap.get(combatantId) : null;
          const itemsHere = cellItemTokens.get(entityPickerCell) || [];
          const [ec, er] = entityPickerCell.split(',').map(Number);
          const rect = gridWrapRef.current?.getBoundingClientRect();
          if (!rect) return null;
          const cx = translate.x + (ec + 0.5) * cellSize * scale;
          const cy = translate.y + (er + 0.5) * cellSize * scale;
          return (
            <div
              className="absolute z-40 rounded-lg shadow-2xl p-2 min-w-[120px]"
              style={{
                left: cx + cellSize * scale,
                top: cy - cellSize * scale,
                background: 'rgba(0,0,0,0.85)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-white text-xs font-medium mb-1.5 text-center">该格有多个实体</div>
              <div className="flex flex-col gap-1">
                {combatant && (
                  <button
                    onClick={() => {
                      setLockedTargetId(combatant.id);
                      setLockedItemTokenId(null);
                      setEntityPickerCell(null);
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-white text-xs hover:bg-white/20 transition-colors ${
                      lockedTargetId === combatant.id ? 'bg-white/25 ring-1 ring-yellow-400' : ''
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${combatant.isPc ? 'bg-info' : 'bg-danger'}`} />
                    {combatant.name}
                  </button>
                )}
                {itemsHere.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setLockedItemTokenId(item.id);
                      setLockedTargetId(null);
                      setLockedSourceId(null);
                      setEntityPickerCell(null);
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-white text-xs hover:bg-white/20 transition-colors ${
                      lockedItemTokenId === item.id ? 'bg-white/25 ring-1 ring-yellow-400' : ''
                    }`}
                  >
                    <span className="w-3 h-3 rounded bg-amber-600 flex items-center justify-center">
                      <Package style={{ width: 8, height: 8 }} className="text-white" />
                    </span>
                    {item.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setEntityPickerCell(null)}
                className="w-full mt-1.5 px-2 py-1 rounded text-white/70 text-xs hover:bg-white/10 transition-colors"
              >
                关闭
              </button>
            </div>
          );
        })()}
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
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-600/80" />
          掉落物品
        </div>
      </div>

      {/* 双击棋子弹出信息窗口 */}
      {doubleClickedCombatant && (
        <CombatantInfoPanel
                  combatant={doubleClickedCombatant}
                  onClose={() => setDoubleClickedCombatant(null)}
                  combatants={combatants}
                  tokenMap={tokenMap}
                  combatInventory={combatInventories?.[doubleClickedCombatant.id]}
                  onRemoveItem={onRemoveItem ? (item) => onRemoveItem(doubleClickedCombatant.id, item) : undefined}
                  equipmentChanges={equipmentChangesMap?.[doubleClickedCombatant.id]}
                  onUpdateChanges={onUpdateChanges ? (changes) => onUpdateChanges(doubleClickedCombatant.id, changes) : undefined}
                />
      )}
    </div>
  );
}
