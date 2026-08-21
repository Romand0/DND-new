// D&D DSL 可视化流程图编辑器 —— 在画布上拖拽节点、连线、配置属性,编排法术/机制的流程编码
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft, X, Plus, Trash2, Save, AlertCircle, CheckCircle,
  Loader2, MousePointer, GitBranch, Zap, Target, Shield, Heart, Skull,
  ChevronRight, RotateCcw,
  PanelLeft, PanelRight, Sparkles, CloudUpload,
  Search, Filter,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useTextInput } from '@/hooks/useInput';
import flowStore from '@/data/flowStore';
import type {
  FlowDefinition,
  FlowNodeDef,
  FlowEdgeDef,
  NodeTypeMeta,
} from '@/types/flow';
import { NODE_TYPE_REGISTRY, groupNodeTypesByCategory, validateFlow } from '@/types/flow';
import { NODE_CONFIG_SCHEMA, FlowNodeType } from '@/types/flow';
import {
  FLOW_CATEGORIES,
  parseFlowId,
  buildFlowId,
} from '@/types/flow';
import SpellPicker from '@/components/SpellPicker';
<<<<<<< HEAD
import { FlowSpellBindingManager } from '@/components/FlowSpellBindingManager';
=======
import SpellPickerField from '@/components/SpellPickerField';
import { spellStore } from '@/data/spellStore';
import { resolveAutoChecksFromSpell } from '@/types/flow';
import { bindingStore } from '@/data/bindingStore';
import type { Spell } from '@/types/spell';
import { BindingService } from '@/services/bindingService';
>>>>>>> upstream/main

// ===== 增强的校验函数,提供节点级别错误 =====
interface ValidationError {
  type: 'global' | 'node' | 'edge';
  id?: string; // 节点或边的ID
  message: string;
  field?: string; // 具体字段名(针对配置错误)
}

function validateFlowWithDetails(flow: FlowDefinition): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. 检查必需的全局字段
  if (!flow.name || typeof flow.name !== 'string' || flow.name.trim() === '') {
    errors.push({ type: 'global', message: '流程名称不能为空' });
  }

  if (!Array.isArray(flow.nodes)) {
    errors.push({ type: 'global', message: '节点必须是数组' });
    return errors; // 节点不是数组,后续检查无意义
  }

  if (!Array.isArray(flow.edges)) {
    errors.push({ type: 'global', message: '边必须是数组' });
  }

  // 2. 检查节点
  const nodeIds = new Set<string>();
  for (let i = 0; i < flow.nodes.length; i++) {
    const node = flow.nodes[i];
    const nodeId = `节点${i + 1}(${node.id})`;

    // 检查节点必需字段
    if (!node.id || typeof node.id !== 'string') {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}缺少有效的ID` });
    } else if (nodeIds.has(node.id)) {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}ID重复` });
    } else {
      nodeIds.add(node.id);
    }

    if (!node.type || typeof node.type !== 'string') {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}缺少节点类型` });
    }

    // 检查节点配置
    if (node.config && typeof node.config === 'object') {
      const schema = NODE_CONFIG_SCHEMA[node.type as FlowNodeType];
      if (schema) {
        for (const field of schema) {
          if (field.required && (node.config[field.key] === undefined || node.config[field.key] === null || node.config[field.key] === '')) {
            errors.push({
              type: 'node',
              id: node.id,
              message: `${nodeId}缺少必需配置: ${field.label}`,
              field: field.key
            });
          }
        }
      }
    }

    // 检查位置
    if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
      errors.push({ type: 'node', id: node.id, message: `${nodeId}位置坐标无效` });
    }
  }

  // 3. 检查边
  const edgeIds = new Set<string>();
  for (let i = 0; i < flow.edges.length; i++) {
    const edge = flow.edges[i];
    const edgeId = `边${i + 1}(${edge.id})`;

    // 检查边必需字段
    if (!edge.id || typeof edge.id !== 'string') {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}缺少有效ID` });
    } else if (edgeIds.has(edge.id)) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}ID重复` });
    } else {
      edgeIds.add(edge.id);
    }

    if (!edge.from || !nodeIds.has(edge.from)) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}引用了不存在的源节点: ${edge.from}` });
    }

    if (!edge.to || !nodeIds.has(edge.to)) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}引用了不存在的目标节点: ${edge.to}` });
    }

    if (edge.from === edge.to) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}形成自环(不能连接到自身)` });
    }

    // 检查重复边
    const edgeSignature = `${edge.from}->${edge.to}@${edge.trigger}`;
    const duplicateEdge = flow.edges.find((e, idx) => 
      idx !== i && `${e.from}->${e.to}@${e.trigger}` === edgeSignature
    );
    if (duplicateEdge) {
      errors.push({ type: 'edge', id: edge.id, message: `${edgeId}存在重复连线: ${edge.from} → ${edge.to}(${edge.trigger})` });
    }
  }

  // 4. 检查入口节点
  const nodesWithIncomingEdge = new Set(flow.edges.map(e => e.to));
  const entryNodes = flow.nodes.filter(n => !nodesWithIncomingEdge.has(n.id));
  if (entryNodes.length === 0) {
    errors.push({ type: 'global', message: '流程缺少入口节点(所有节点都有入边,可能存在循环)' });
  }

  // 5. 检查条件分支
  const branchNodes = flow.nodes.filter(n => n.type === 'condition_branch');
  for (const branch of branchNodes) {
    const outEdges = flow.edges.filter(e => e.from === branch.id);
    const hasTrue = outEdges.some(e => e.trigger === 'on_true');
    const hasFalse = outEdges.some(e => e.trigger === 'on_false');
    
    if (!hasTrue) {
      errors.push({ type: 'node', id: branch.id, message: `条件分支节点 ${branch.id} 缺少 on_true 出边` });
    }
    if (!hasFalse) {
      errors.push({ type: 'node', id: branch.id, message: `条件分支节点 ${branch.id} 缺少 on_false 出边` });
    }
  }

  // 检查流程必须绑定法术
  if (!flow.spellId) {
    errors.push({ type: 'global', message: '流程必须绑定法术' });
  }

  return errors;
}
<<<<<<< HEAD
=======

// 修改后的验证逻辑：分阶段验证
const validateForPublish = (flow: FlowDefinition) => {
  // 只有已发布的流程才需要检查法术绑定
  if (flow.status === 'published' && !flow.spellId) {
    return { valid: false, error: '已发布的流程必须绑定法术' };
  }

  // 草稿只需要基本验证
  const basicValidation = validateFlowWithDetails(flow);
  if (basicValidation.length > 0) {
    return { valid: false, error: `存在 ${basicValidation.length} 个基本验证错误` };
  }

  return { valid: true };
};
import ConfigFieldRenderer from '@/components/ConfigFieldRenderer';
import SpellIdPicker from '@/components/SpellIdPicker';
import NodeListPanel from '@/components/NodeListPanel';
import { generateFlowId, validateFlowId } from '@/lib/idUtils';
import { SpatialGrid } from '@/utils/spatialGrid';
>>>>>>> upstream/main

// ===== 节点图标解析 =====
/** 从 icon name 解析为 React 元素,单一真相源 */
function resolveNodeIcon(iconName?: string): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    'zap': <Zap className="w-4 h-4" />,
    'shield': <Shield className="w-4 h-4" />,
    'target': <Target className="w-4 h-4" />,
    'mouse-pointer': <MousePointer className="w-4 h-4" />,
    'git-branch': <GitBranch className="w-4 h-4" />,
    'heart': <Heart className="w-4 h-4" />,
    'skull': <Skull className="w-4 h-4" />,
  };
  return map[iconName || ''] ?? <Zap className="w-4 h-4" />;
}

// 节点卡片尺寸常量
const NODE_W = 260;   // 窄屏基准宽度
const NODE_H = 56;    // 最小估计高度(头部)

// 卡片节点样式常量
const CARD_NODE_W = 140;  // 卡片节点宽度
const CARD_NODE_H = 48;   // 卡片节点高度

// 画布缩放常量
const SCALE_MIN = 0.25;
const SCALE_MAX = 3;
const SCALE_STEP = 0.1;

// ===== 碰撞检测工具函数 =====
// 当前生效的空间索引(组件在 flow.nodes 变化时同步),供模块级 nodesOverlap 做候选筛选
let activeSpatialGrid: any = null;

function nodesOverlap(a: FlowNodeDef, b: FlowNodeDef, cardWidth: number): boolean {
  if (a.id === b.id) return false;
  // 空间索引候选筛选:b 不在候选集中则必不重叠(精确 AABB 检测在下方)
  if (activeSpatialGrid) {
    const candidates = activeSpatialGrid.queryCandidates(a.position.x, a.position.y, cardWidth, NODE_H);
    if (!candidates.some(c => c.id === b.id)) return false;
  }
  return (
    a.position.x < b.position.x + cardWidth &&
    a.position.x + cardWidth > b.position.x &&
    a.position.y < b.position.y + NODE_H &&
    a.position.y + NODE_H > b.position.y
  );
}

// 智能退避策略:对每个重叠节点计算推离向量(选重叠量最小的轴、方向远离对方),
// 按位移平方和排序取最小推离向量作为最终落位
function findNonOverlappingPositionV2(
  node: FlowNodeDef,
  others: FlowNodeDef[],
  cardW: number,
  cardH: number,
  grid: any,
  scale: number,
): { x: number; y: number } {
  const step = 30 / scale;
  const candidates = grid.queryCandidates(node.position.x, node.position.y, cardW, cardH)
    .filter(o => o.id !== node.id);

  // 对每个重叠节点计算推离向量
  const pushVectors: { x: number; y: number }[] = [];
  for (const o of candidates) {
    const overlapX = Math.min(node.position.x + cardW, o.position.x + cardW) - Math.max(node.position.x, o.position.x);
    const overlapY = Math.min(node.position.y + cardH, o.position.y + cardH) - Math.max(node.position.y, o.position.y);
    if (overlapX <= 0 || overlapY <= 0) continue;
    if (overlapX <= overlapY) {
      const dir = node.position.x < o.position.x ? -1 : 1;
      pushVectors.push({ x: dir * overlapX, y: 0 });
    } else {
      const dir = node.position.y < o.position.y ? -1 : 1;
      pushVectors.push({ x: 0, y: dir * overlapY });
    }
  }

  if (pushVectors.length === 0) {
    return { x: node.position.x, y: node.position.y };
  }

  // 候选退避点:推离向量 + 四轴向 step 递增,位移平方和越小越优先
  const seen = new Set<string>();
  const attempts: { x: number; y: number; cost: number }[] = [];
  const addAttempt = (vx: number, vy: number) => {
    const x = Math.max(0, node.position.x + vx);
    const y = Math.max(0, node.position.y + vy);
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    const stillOverlap = others.some(o => (
      x < o.position.x + cardW && x + cardW > o.position.x &&
      y < o.position.y + cardH && y + cardH > o.position.y
    ));
    const dx = x - node.position.x;
    const dy = y - node.position.y;
    attempts.push({ x, y, cost: stillOverlap ? Infinity : dx * dx + dy * dy });
  };

  for (const v of pushVectors) addAttempt(v.x, v.y);
  for (let d = 1; d <= 3; d++) {
    addAttempt(step * d, 0);
    addAttempt(-step * d, 0);
    addAttempt(0, step * d);
    addAttempt(0, -step * d);
  }

  attempts.sort((p, q) => p.cost - q.cost);
  const best = attempts.find(a => a.cost !== Infinity);
  return best ? { x: best.x, y: best.y } : { x: node.position.x, y: node.position.y };
}

export default function FlowEditor() {
  const { id: flowId } = useParams<{ id: string }>();

  // ===== 主题感知 =====
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ===== 状态 =====
  const [flow, setFlow] = useState<FlowDefinition>(() => {
    // 1 优先从 flowStore 加载指定 ID
    if (flowId) {
      const loaded = flowStore.getById(flowId);
      if (loaded) return loaded;
    }
    return createEmptyFlow();
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // ===== 确保 flowStore 引用最新 =====
  const flowStoreRef = useRef(flowStore);
  useEffect(() => {
    flowStoreRef.current = flowStore;
  }, [flowStore]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectTrigger, setConnectTrigger] = useState<string>('on_complete');
  const [drafts, setDrafts] = useState<FlowDefinition[]>(() => flowStore.getAll());
  const [showDrafts, setShowDrafts] = useState(false);
  const flowNameInput = useTextInput('');
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches
  );
  // 流程 ID 草稿态(自由编辑,不触发保存)
  const [draftId, setDraftId] = useState(flow.id);
  const [idErrors, setIdErrors] = useState<string[]>([]);
  const [idDirty, setIdDirty] = useState(false);  // 草稿是否偏离正式值
<<<<<<< HEAD
  // flow.id 外部变更时同步草稿(如加载草稿、autosave 恢复)
=======
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);
  const [showSpellPicker, setShowSpellPicker] = useState(false);
  const [boundSpell, setBoundSpell] = useState<Spell | null>(null);
  // flow.id 外部变更时同步草稿（如加载草稿、autosave 恢复）
>>>>>>> upstream/main
  useEffect(() => {
    if (!idDirty) setDraftId(flow.id);
  }, [flow.id, idDirty]);
  // 拖拽状态:实时碰撞检测
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const [collisionDir, setCollisionDir] = useState<'up' | 'down' | 'left' | 'right' | null>(null);
  const [animateMove, setAnimateMove] = useState(false);
  const spatialGridRef = useRef<any>(new (require('@/utils/spatialGrid').SpatialGrid)());
  const rafIdRef = useRef<number | null>(null);
  const lastEventRef = useRef<DragEndEvent | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasTranslate, setCanvasTranslate] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const skipNameSync = useRef(true);

  // ===== 发布提示 toast =====
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  // ===== 画布缩放:触屏双指捏合 =====
  const pinchRef = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startScale: number;
    startTranslate: { x: number; y: number };
    startDist: number;
    startMid: { x: number; y: number };
  }>({
    pointers: new Map(),
    startScale: 1,
    startTranslate: { x: 0, y: 0 },
    startDist: 0,
    startMid: { x: 0, y: 0 },
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) return;
    const pts = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    const map = new Map(pts.map(p => [p.id, { x: p.x, y: p.y }]));
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    pinchRef.current = {
      pointers: map,
      startScale: canvasScale,
      startTranslate: canvasTranslate,
      startDist: dist,
      startMid: mid,
    };
  }, [canvasScale, canvasTranslate]);

  // ===== 阻止浏览器默认双指缩放(React touch 事件是 passive 的,preventDefault 无效) =====
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      const state = pinchRef.current;
      if (e.touches.length < 2 || state.startDist === 0) return;
      e.preventDefault();
      const pts = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const ratio = dist / state.startDist;
      const newScale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, state.startScale * ratio));
      const scaleDelta = newScale / state.startScale;
      const newTranslate = {
        x: state.startTranslate.x * scaleDelta + (mid.x - state.startMid.x * scaleDelta),
        y: state.startTranslate.y * scaleDelta + (mid.y - state.startMid.y * scaleDelta),
      };
      setCanvasScale(newScale);
      setCanvasTranslate(newTranslate);
    };

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current.startDist = 0;
  }, []);

  // ===== 画布缩放:鼠标 Ctrl/Meta + 滚轮 =====
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setCanvasScale(prev => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((prev + delta) * 100) / 100)));
  }, []);

  // ===== dnd-kit 传感器:Pointer(鼠标)+ Touch(触屏) =====
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 移动 5px 才激活拖拽,防止点击误触发
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
  );

  // ===== 同步 flowName(跳过首次挂载,避免覆盖从 flowStore 恢复的名称) =====
  useEffect(() => {
    if (skipNameSync.current) {
      skipNameSync.current = false;
      return;
    }
    flowNameInput.setExternal(flow.name);
  }, [flow.name]);

  // ===== 自动保存(防抖 500ms,防止刷新丢失当前编辑) =====
  useEffect(() => {
    const timer = setTimeout(() => {
      // 始终用 flow.id 做主键,而非路由参数;save 为 upsert,新建流程也会入库
      flowStore.save(flow);
    }, 500);
    return () => clearTimeout(timer);
  }, [flow, flowNameInput.text]);

  // ===== 空间索引:节点列表变化时重建,供碰撞检测候选筛选 =====
  useEffect(() => {
    spatialGridRef.current.rebuild(flow.nodes);
    activeSpatialGrid = spatialGridRef.current;
  }, [flow.nodes]);

  // ===== 拖拽降频:卸载时取消挂起的 rAF =====
  useEffect(() => () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
  }, []);

  // ===== 草稿列表:订阅 flowStore 变更,保持下拉框数据同步 =====
  useEffect(() => {
    const refresh = () => setDrafts(flowStore.getAll());
    refresh();
    return flowStore.subscribe(refresh);
  }, []);

  // ===== flow state 同步:监听 flowStore 变化,确保 React state 与 store 一致 =====
  useEffect(() => {
    const refreshFlow = () => {
      const stored = flowStore.getById(flowId || flow.id);
      if (stored) {
        setFlow(stored);
        // 设置绑定的法术
        if (stored.spellId) {
          const spell = spellStore.getById(stored.spellId);
          if (spell) {
            setBoundSpell(spell);
          }
        } else {
          setBoundSpell(null);
        }
      }
    };
    
    refreshFlow();
    const unsub = flowStore.subscribe(refreshFlow);
    return () => unsub();
  }, [flowId, flow.id]);

  // ===== 位置快照:保存(画布滚动 + 缩放 + 面板展开状态,按流程 ID 持久化) =====
  const viewportRef = useRef({
    scrollX: 0,
    scrollY: 0,
    scale: canvasScale,
    translateX: canvasTranslate.x,
    translateY: canvasTranslate.y,
    showLeftPanel,
    showRightPanel,
  });
  const saveTimerRef = useRef<number | null>(null);

  const saveViewport = useCallback(() => {
    if (!flowId) return;
    const canvas = canvasRef.current;
    const v = viewportRef.current;
    flowStore.saveViewportSnapshot(flowId, {
      scrollX: canvas ? canvas.scrollLeft : v.scrollX,
      scrollY: canvas ? canvas.scrollTop : v.scrollY,
      scale: v.scale,
      translateX: v.translateX,
      translateY: v.translateY,
      showLeftPanel: v.showLeftPanel,
      showRightPanel: v.showRightPanel,
    });
  }, [flowId]);

  const scheduleViewportSave = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveViewport();
    }, 500);
  }, [saveViewport]);

  // 视图状态 → ref(避免 useCallback 依赖抖动)
  useEffect(() => {
    viewportRef.current.scale = canvasScale;
    viewportRef.current.translateX = canvasTranslate.x;
    viewportRef.current.translateY = canvasTranslate.y;
    viewportRef.current.showLeftPanel = showLeftPanel;
    viewportRef.current.showRightPanel = showRightPanel;
  }, [canvasScale, canvasTranslate, showLeftPanel, showRightPanel]);

  // 滚动事件:实时记录 + 防抖保存
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onScroll = () => {
      viewportRef.current.scrollX = canvas.scrollLeft;
      viewportRef.current.scrollY = canvas.scrollTop;
      scheduleViewportSave();
    };
    canvas.addEventListener('scroll', onScroll);
    return () => canvas.removeEventListener('scroll', onScroll);
  }, [scheduleViewportSave]);

  // 缩放/面板状态变化:防抖保存
  useEffect(() => {
    scheduleViewportSave();
  }, [canvasScale, canvasTranslate, showLeftPanel, showRightPanel, scheduleViewportSave]);

  // 卸载 / 刷新前:立即保存
  useEffect(() => {
    const onUnload = () => saveViewport();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      saveViewport();
    };
  }, [saveViewport]);

  const scrollRestored = useRef(false);

  // ===== 位置快照:恢复(从 flowStore 快照) =====
  useLayoutEffect(() => {
    if (scrollRestored.current) return;
    scrollRestored.current = true;
    const canvas = canvasRef.current;

    const snapshot = flowId ? flowStore.getViewportSnapshot(flowId) : null;
    if (snapshot && canvas) {
      if (typeof snapshot.scale === 'number' && snapshot.scale > 0) setCanvasScale(snapshot.scale);
      setCanvasTranslate({ x: snapshot.translateX, y: snapshot.translateY });
      setShowLeftPanel(snapshot.showLeftPanel);
      setShowRightPanel(snapshot.showRightPanel);
      canvas.scrollLeft = snapshot.scrollX;
      canvas.scrollTop  = snapshot.scrollY;
    }
  }, [flowId]);

  // ===== 创建空流程 =====
  function createEmptyFlow(): FlowDefinition {
    return {
      id: generateFlowId(),
      name: '未命名流程',
      description: '',
      nodes: [],
      edges: [],
      tags: [],
      version: 1,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // ===== 添加节点(自动防重叠) =====
  const addNode = useCallback((typeMeta: NodeTypeMeta, position: { x: number; y: number }) => {
    const id = `${typeMeta.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    // 从 Schema 合并默认值(Schema 优先,兜底 defaultConfig)
    const schemaDefaults: Record<string, any> = {};
    const fields = NODE_CONFIG_SCHEMA[typeMeta.type] ?? [];
    for (const f of fields) {
      if (f.defaultValue !== undefined) schemaDefaults[f.key] = f.defaultValue;
    }
    const newNode: FlowNodeDef = {
      id, type: typeMeta.type, label: typeMeta.label,
      position: { x: position.x, y: position.y },
      config: { ...typeMeta.defaultConfig, ...schemaDefaults },
    };
    // 新节点防重叠放置(智能退避 + 空间索引)
    const finalPos = findNonOverlappingPositionV2(newNode, flow.nodes, NODE_W, NODE_H, spatialGridRef.current, canvasScale);
    newNode.position = finalPos;
    setFlow(prev => ({ ...prev, nodes: [...prev.nodes, newNode], updatedAt: Date.now() }));
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, [flow.nodes, canvasScale]);

  // ===== 删除节点 =====
  const deleteNode = useCallback((nodeId: string) => {
    setFlow(prev => {
      const updatedFlow = {
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== nodeId),
        edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
        updatedAt: Date.now(),
      };
      
      // 同步到 flowStore(单一真相源)
      flowStoreRef.current.save(updatedFlow);
      
      return updatedFlow;
    });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [selectedNodeId]);

  // ===== 更新节点配置 =====
  const updateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.id === nodeId
          ? { ...n, config: { ...n.config, [key]: value } }
          : n
      ),
      updatedAt: Date.now(),
    }));
  }, []);

  // ===== 更新节点位置(拖拽后应用 delta + 碰撞检测) =====
  const updateNodePositionByDelta = useCallback((nodeId: string, delta: { x: number; y: number }) => {
    setFlow(prev => {
      const target = prev.nodes.find(n => n.id === nodeId);
      if (!target) return prev;
      const proposed = {
        x: Math.max(0, target.position.x + delta.x / canvasScale),
        y: Math.max(0, target.position.y + delta.y / canvasScale),
      };
      const testNode = { ...target, position: proposed };
      const others = prev.nodes.filter(n => n.id !== nodeId);
      const finalPos = findNonOverlappingPositionV2(testNode, others, NODE_W, NODE_H, spatialGridRef.current, canvasScale);
      return {
        ...prev,
        nodes: prev.nodes.map(n => n.id === nodeId ? { ...n, position: finalPos } : n),
        updatedAt: Date.now(),
      };
    });
  }, []);

  // ===== 添加边 =====
  const addEdge = useCallback((fromId: string, toId: string, trigger: string) => {
    if (fromId === toId) return;
    const exists = flow.edges.some(e => e.from === fromId && e.to === toId);
    if (exists) return;

    const edgeId = `edge-${fromId}-${toId}-${Date.now()}`;
    const newEdge: FlowEdgeDef = {
      id: edgeId,
      from: fromId,
      to: toId,
      trigger: trigger as any,
      label: triggerToLabel(trigger),
    };
    setFlow(prev => ({
      ...prev,
      edges: [...prev.edges, newEdge],
      updatedAt: Date.now(),
    }));
    setSelectedEdgeId(edgeId);
  }, [flow.edges]);

  // ===== 删除边 =====
  const deleteEdge = useCallback((edgeId: string) => {
    setFlow(prev => ({
      ...prev,
      edges: prev.edges.filter(e => e.id !== edgeId),
      updatedAt: Date.now(),
    }));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
  }, [selectedEdgeId]);

  // ===== 触发时机 → 标签 =====
  function triggerToLabel(trigger: string): string {
    const map: Record<string, string> = {
      on_complete: '完成',
      on_success: '成功',
      on_failure: '失败',
      on_partial: '部分',
      on_true: '是',
      on_false: '否',
    };
    return map[trigger] || trigger;
  }

  // ===== 实时碰撞检测:计算拖拽节点的投影位置与其他节点是否重叠 =====
  const checkCollision = useCallback((nodeId: string, projectedX: number, projectedY: number): boolean => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return false;
    const projected = { ...target, position: { x: projectedX, y: projectedY } };
    return flow.nodes.some(other => other.id !== nodeId && nodesOverlap(projected, other, NODE_W));
  }, [flow.nodes]);

  // ===== 拖拽中实时位置投影 =====
  const getProjectedPosition = useCallback((nodeId: string, delta: { x: number; y: number }) => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return { x: 0, y: 0 };
    return {
      x: Math.max(0, target.position.x + delta.x),
      y: Math.max(0, target.position.y + delta.y),
    };
  }, [flow.nodes]);

  // ===== 碰撞方向:计算被拖拽节点的推离方向(供方向提示箭头) =====
  const getCollisionDir = useCallback((
    nodeId: string,
    projectedX: number,
    projectedY: number,
  ): 'up' | 'down' | 'left' | 'right' | null => {
    const target = flow.nodes.find(n => n.id === nodeId);
    if (!target) return null;
    const projected = { ...target, position: { x: projectedX, y: projectedY } };
    const candidates = spatialGridRef.current.queryCandidates(target.position.x, target.position.y, NODE_W, NODE_H)
      .filter(o => o.id !== nodeId);

    // 对每个重叠节点计算推离向量
    const pushVectors: { x: number; y: number }[] = [];
    for (const o of candidates) {
      const overlapX = Math.min(projected.x + NODE_W, o.position.x + NODE_W) - Math.max(projected.x, o.position.x);
      const overlapY = Math.min(projected.y + NODE_H, o.position.y + NODE_H) - Math.max(projected.y, o.position.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      if (overlapX <= overlapY) {
        const dir = projected.x < o.position.x ? -1 : 1;
        pushVectors.push({ x: dir * overlapX, y: 0 });
      } else {
        const dir = projected.y < o.position.y ? -1 : 1;
        pushVectors.push({ x: 0, y: dir * overlapY });
      }
    }

    if (pushVectors.length === 0) {
      return null;
    }

    // 候选退避点:推离向量 + 四轴向 step 递增,位移平方和越小越优先
    const seen = new Set<string>();
    const attempts: { x: number; y: number; cost: number }[] = [];
    const addAttempt = (vx: number, vy: number) => {
      const x = Math.max(0, projected.x + vx);
      const y = Math.max(0, projected.y + vy);
      const k = `${x},${y}`;
      if (seen.has(k)) return;
      seen.add(k);
      const stillOverlap = flow.nodes.some(o => (
        x < o.position.x + NODE_W && x + NODE_W > o.position.x &&
        y < o.position.y + NODE_H && y + NODE_H > o.position.y
      ));
      const dx = x - projected.x;
      const dy = y - projected.y;
      attempts.push({ x, y, cost: stillOverlap ? Infinity : dx * dx + dy * dy });
    };

    for (const v of pushVectors) addAttempt(v.x, v.y);
    for (let d = 1; d <= 3; d++) {
      addAttempt(SCALE_STEP * d, 0);
      addAttempt(-SCALE_STEP * d, 0);
      addAttempt(0, SCALE_STEP * d);
      addAttempt(0, -SCALE_STEP * d);
    }

    attempts.sort((p, q) => p.cost - q.cost);
    const best = attempts.find(a => a.cost !== Infinity);
    if (!best) return null;
    
    if (best.x !== projected.x) return best.x < projected.x ? 'left' : 'right';
    if (best.y !== projected.y) return best.y < projected.y ? 'up' : 'down';
    return null;
  }, [flow.nodes]);

  // ===== 拖拽结束处理 =====
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDraggingNodeId(null);
      setIsColliding(false);
      setCollisionDir(null);
      return;
    }

    const delta = {
      x: event.delta.x,
      y: event.delta.y,
    };

    // 更新节点位置
    updateNodePositionByDelta(active.id as string, delta);

    // 重置拖拽状态
    setDraggingNodeId(null);
    setIsColliding(false);
    setCollisionDir(null);
  }, [updateNodePositionByDelta]);

  // ===== 拖拽开始处理 =====
  const handleDragStart = useCallback((event: DragEndEvent) => {
    const { active } = event;
    setDraggingNodeId(active.id as string);
    
    // 检查初始位置是否碰撞
    const node = flow.nodes.find(n => n.id === active.id);
    if (node) {
      const isColliding = checkCollision(active.id as string, node.position.x, node.position.y);
      setIsColliding(isColliding);
      if (isColliding) {
        const dir = getCollisionDir(active.id as string, node.position.x, node.position.y);
        setCollisionDir(dir);
      }
    }
  }, [flow.nodes, checkCollision, getCollisionDir]);

  // ===== 拖拽移动处理 =====
  const handleDragMove = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const projected = getProjectedPosition(active.id as string, {
      x: event.delta.x,
      y: event.delta.y,
    });

    // 检查投影位置是否碰撞
    const isColliding = checkCollision(active.id as string, projected.x, projected.y);
    setIsColliding(isColliding);
    if (isColliding) {
      const dir = getCollisionDir(active.id as string, projected.x, projected.y);
      setCollisionDir(dir);
    } else {
      setCollisionDir(null);
    }
  }, [getProjectedPosition, checkCollision, getCollisionDir]);

  // ===== 连接开始处理 =====
  const handleConnectStart = useCallback((nodeId: string) => {
    setIsConnecting(true);
    setConnectFromId(nodeId);
    setConnectTrigger('on_complete');
  }, []);

<<<<<<< HEAD
  // ===== 连接结束处理 =====
  const handleConnectEnd = useCallback((nodeId: string) => {
    if (!isConnecting || !connectFromId || connectFromId === nodeId) {
      setIsConnecting(false);
      setConnectFromId(null);
      return;
    }

    // 添加边
    addEdge(connectFromId, nodeId, connectTrigger);
    setIsConnecting(false);
    setConnectFromId(null);
  }, [isConnecting, connectFromId, connectTrigger, addEdge]);

  // ===== 连接触发器变更处理 =====
  const handleTriggerChange = useCallback((trigger: string) => {
    setConnectTrigger(trigger);
  }, []);

  // ===== 验证状态 =====
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const validationStatus = validationErrors.length === 0 ? 'valid' : 'invalid';

  // ===== 发布处理 =====
  const handlePublish = useCallback(async () => {
    if (flow.status === 'draft') {
      // 草稿发布前的确认对话框
      const confirmed = confirm(
        '发布流程确认\n\n' +
        '• 发布后流程将变为只读状态\n' +
        '• 发布后可以绑定法术供使用\n' +
        '• 发布后可以继续更新流程内容\n\n' +
        '确定要发布此流程吗?'
      );
      
      if (!confirmed) return;
      
      try {
        // 发布流程
        const publishedFlow = {
          ...flow,
          status: 'published' as const,
          publishedAt: Date.now(),
        };
        
        await flowStore.save(publishedFlow);
        setFlow(publishedFlow);
        
        // 显示成功提示
        showToast('success', '流程已发布,现在可以绑定法术了');
        
        // 自动滚动到绑定区域
        setTimeout(() => {
          const bindingSection = document.querySelector('.binding-manager');
          if (bindingSection) {
            bindingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
        
      } catch (error) {
        console.error('发布失败:', error);
        showToast('error', '发布失败: ' + (error as Error).message);
      }
    } else {
      // 已发布状态的更新
      try {
        await flowStore.save(flow);
        showToast('success', '流程已更新');
      } catch (error) {
        console.error('更新失败:', error);
        showToast('error', '更新失败: ' + (error as Error).message);
=======
  // ===== 取消连接模式 =====
  const cancelConnecting = useCallback(() => {
    setIsConnecting(false);
    setConnectFromId(null);
  }, []);

  // ===== 实时校验 =====
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid'>('valid');
  
  // 实时校验（防抖500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      const errors = validateFlowWithDetails(flow);
      setValidationErrors(errors);
      setValidationStatus(errors.length === 0 ? 'valid' : 'invalid');
    }, 500);
    return () => clearTimeout(timer);
  }, [flow]);

  // ===== 手动验证 =====
  const runValidation = useCallback(() => {
    const errors = validateFlowWithDetails(flow);
    setValidationErrors(errors);
    setShowValidation(true);
    setValidationStatus(errors.length === 0 ? 'valid' : 'invalid');
  }, [flow]);

  // ===== 保存草稿 =====
  const saveDraft = useCallback(() => {
    setSaveStatus('saving');
    // 用 requestAnimationFrame 制造一帧延迟，让 "saving" 态先渲染
    requestAnimationFrame(() => {
      const updatedFlow = { ...flow, name: flowNameInput.value || flow.name, updatedAt: Date.now() };
      // 直接写入 flowStore（单一真相源）；save 为 upsert，库中不存在的流程也会写入
      flowStore.save(updatedFlow);
      setDrafts(flowStore.getAll());   // 刷新下拉框数据
      setFlow(updatedFlow);
      setSaveStatus('saved');
      
      // 如果是新建流程（flowId 为占位符），保存后跳转到真实 ID 的编辑页
      if (flowId && flowId !== updatedFlow.id) {
        navigate(`/flow-editor/${updatedFlow.id}`, { replace: true });
      }
      
      setTimeout(() => setSaveStatus('idle'), 2000);
    });
  }, [flow, flowNameInput.value, flowId, navigate]);

  // ===== 法术绑定/解绑方法 =====
  const handleBindSpell = useCallback(async (spellId: string) => {
    if (!flow.id) return;

    try {
      await BindingService.bindSpellToFlow(spellId, flow.id);
      const spell = spellStore.getById(spellId);
      if (spell) {
        // 自动回填 autoChecks 配置
        const { autoChecks, dsl } = resolveAutoChecksFromSpell(spell);
        
        // 更新 flow 的 autoChecks 配置
        setFlow(prev => {
          const updatedFlow = { ...prev, spellId };
          
          // 查找 cast_start 节点并更新其 config
          const castStartNode = updatedFlow.nodes.find(n => n.type === 'cast_start');
          if (castStartNode && castStartNode.config) {
            castStartNode.config = {
              ...castStartNode.config,
              autoChecks,
            };
          }
          
          return updatedFlow;
        });
        
        setBoundSpell(spell);
        setShowSpellPicker(false);
        
        // 显示提示
        showToast('success', `已绑定法术并自动配置：${spell.name}`);
      }
    } catch (error) {
      console.error('法术绑定失败:', error);
      showToast('error', '法术绑定失败');
    }
  }, [flow.id, showToast]);

  const handleUnbindSpell = useCallback(async () => {
    if (!flow.id || !flow.spellId) return;

    try {
      // 获取绑定ID
      const bindings = bindingStore.getBySpellId(flow.spellId);
      if (bindings.length > 0) {
        await BindingService.unbindSpellFromFlow(bindings[0].id);
        setBoundSpell(null);
        setFlow(prev => ({ ...prev, spellId: undefined }));
      }
    } catch (error) {
      console.error('法术解绑失败:', error);
      showToast('error', '法术解绑失败');
    }
  }, [flow.id, flow.spellId, showToast]);

  // ===== 发布正式版 =====
  const handlePublish = useCallback(async () => {
    // 发布前先检查校验
    const validation = validateForPublish(flow);
    if (!validation.valid) {
      setValidationErrors([{ type: 'global', message: validation.error! }]);
      setShowValidation(true);
      showToast('error', `无法发布：${validation.error}`);
      return;
    }

    try {
      // 更新流程状态为已发布
      flowStore.update(flow.id, { ...flow, status: 'published' });
      const published = await flowStore.publish(flow.id);
      if (published) {
        setFlow(prev => ({
          ...prev,
          status: 'published',
          publishedVersion: published.publishedVersion,
          publishedAt: published.publishedAt ?? Date.now(),
        }));
        showToast('success', `已发布 v${published.publishedVersion}`);
>>>>>>> upstream/main
      }
    }
  }, [flow, showToast]);

  // ===== 加载草稿 =====
  const loadDraft = useCallback((draft: FlowDefinition) => {
    setFlow(draft);
    setShowDrafts(false);
  }, []);

  // ===== 删除草稿 =====
  const deleteDraft = useCallback((draftId: string) => {
    if (confirm('确定要删除此草稿吗?')) {
      flowStore.delete(draftId);
      setDrafts(flowStore.getAll());
    }
  }, []);

  // ===== 保存草稿 =====
  const saveDraft = useCallback(() => {
    const draft = {
      ...flow,
      id: draftId,
      name: flowNameInput.text || flow.name,
    };
    flowStore.save(draft);
    setFlow(draft);
    setShowDrafts(false);
    showToast('success', '草稿已保存');
  }, [flow, draftId, flowNameInput.text, showToast]);

  // ===== 退出编辑器 =====
  const handleExit = useCallback(() => {
    if (flow.status === 'draft') {
      setExitModalOpen(true);
    } else {
      navigate('/');
    }
  }, [flow.status, navigate]);

  // ===== 生成流程ID =====
  function generateFlowId(): string {
    return `flow:${Date.now()}`;
  }

  // ===== 验证流程ID =====
  function validateFlowId(id: string, existingIds: string[], currentId: string): string[] {
    const errors: string[] = [];
    
    // 检查格式
    if (!id.startsWith('flow:')) {
      errors.push('流程ID必须以 "flow:" 开头');
    }
    
    // 检查长度
    if (id.length < 6) {
      errors.push('流程ID长度不能少于6个字符');
    }
    
    // 检查是否重复(排除当前ID)
    if (id !== currentId && existingIds.includes(id)) {
      errors.push('该流程ID已被占用');
    }
    
    return errors;
  }

  // ===== 节点配置渲染器 =====
  import ConfigFieldRenderer from '@/components/ConfigFieldRenderer';
  import NodeListPanel from '@/components/NodeListPanel';
  import { generateFlowId, validateFlowId } from '@/lib/idUtils';

  return (
    <div className={`h-screen flex flex-col ${isDark ? 'dark' : ''}`}>
      {/* ===== 顶部工具栏 ===== */}
<<<<<<< HEAD
      <div className="flex items-center justify-between px-4 py-2 border-b dark:border-border-dark light:border-border-light bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
=======
      <div className="flex items-center justify-between h-12 border-b dark:border-border-dark light:border-border-light flex-shrink-0 dark:bg-bg-dark-2 light:bg-white">
        <div className="flex items-center gap-2 px-4">
          <button onClick={() => setExitModalOpen(true)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors dark:text-text-dark light:text-text-light hover:bg-white/5">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">退出</span>
          </button>
          <div className="h-5 w-px dark:bg-border-dark light:bg-border-light" />
          <input type="text" value={flowNameInput.text} onChange={(e) => flowNameInput.onChange(e.target.value)} onBlur={flowNameInput.onBlur} className="text-sm font-medium bg-transparent border-none outline-none dark:text-text-dark light:text-text-light w-28 sm:w-48" placeholder="流程名称" />
        </div>
        <div className="flex items-center gap-2 px-4">
          <button 
            onClick={handlePublish}
            disabled={validationStatus === 'invalid'}
            className={`
              flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${validationStatus === 'valid'
                ? 'border-green-500 text-green-500 hover:border-green-400 hover:text-green-400 hover:bg-green-500/10'
                : 'border-gray-400 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            <CloudUpload className="w-3.5 h-3.5" />
            <span>{flow.status === 'published' ? '更新发布' : '发布'}</span>
          </button>
>>>>>>> upstream/main
          <button
            onClick={handleExit}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold dark:text-text-dark light:text-text-light">
              流程编辑器
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {flow.name} ({flow.id})
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDrafts(true)}
            className="px-3 py-1.5 rounded-lg border dark:border-border-dark light:border-border-light hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
          >
            草稿 ({drafts.length})
          </button>
          <button
            onClick={handlePublish}
            className={`px-4 py-1.5 rounded-lg font-medium transition-colors ${
              flow.status === 'draft'
                ? 'bg-primary text-white hover:bg-primary/90'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {flow.status === 'draft' ? '发布流程' : '更新流程'}
          </button>
        </div>
      </div>

      {/* ===== 主内容区 ===== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ===== 左侧面板 ===== */}
        <div className={`w-64 border-r dark:border-border-dark light:border-border-light bg-white dark:bg-gray-900 transition-all duration-200 ${showLeftPanel ? 'ml-0' : '-ml-64'}`}>
          <div className="p-4 border-b dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light">节点库</h2>
              <button
                onClick={() => setShowLeftPanel(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索节点..."
                className="w-full pl-10 pr-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light bg-transparent text-sm focus:border-primary outline-none"
              />
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            {FLOW_CATEGORIES.map(category => (
              <div key={category.value}>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                  {category.label}
                </h3>
                <div className="space-y-2">
                  {groupNodeTypesByCategory(category.value).map(meta => (
                    <PaletteDragItem key={meta.type} meta={meta} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== 画布区域 ===== */}
        <div className="flex-1 relative overflow-hidden bg-gray-50 dark:bg-gray-950">
          <DndContext
            sensors={sensors}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
          >
            <div
              ref={canvasRef}
              className="w-full h-full overflow-auto"
              onWheel={handleCanvasWheel}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="relative min-w-full min-h-full"
                style={{
                  transform: `scale(${canvasScale}) translate(${canvasTranslate.x}px, ${canvasTranslate.y}px)`,
                  transformOrigin: '0 0',
                }}
<<<<<<< HEAD
=======
                onClick={handleCanvasClick}
                onTouchStart={handleCanvasClick}
              />

              {/* 节点渲染层（dnd-kit 拖拽） */}
              {flow.nodes.map(node => (
                <DraggableFlowNode
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  isConnectSource={connectFromId === node.id}
                  isDragging={draggingNodeId === node.id}
                  isColliding={draggingNodeId === node.id && isColliding}
                  collisionDir={draggingNodeId === node.id ? collisionDir : null}
                  animateMove={animateMove}
                  canvasScale={canvasScale}          // ★ 新增
                  onClick={() => handleNodeClick(node.id)}
                  onStartConnecting={() => startConnecting(node.id)}
                  onDelete={() => deleteNode(node.id)}
                  flow={flow}
                />
              ))}

              {/* SVG 连线层 —— 暗色模式：浅紫边框+深紫背景+红色波浪纹；亮色模式：灰色边框+白底+灰色脉冲 */}
              <svg className="absolute inset-0 pointer-events-none" style={{ width: 3000, height: 2000, left: 0, right: 0 }}>
                <defs>
                  {/* 连线白色阴影滤镜：暗色模式下白色外发光，提升辨识度 */}
                  <filter id="edge-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ffffff" floodOpacity="0.5" />
                  </filter>
                  <marker id="chevron-dark" viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#818cf8" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </marker>
                  <marker id="chevron-dark-selected" viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#f87171" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </marker>
                  <marker id="chevron-light" viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </marker>
                  <marker id="chevron-light-selected" viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#6366f1" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </marker>
                  <marker id="chevron-fail-dark" viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#f87171" strokeWidth="1.5"
                      strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round"/>
                  </marker>
                  <marker id="chevron-fail-light" viewBox="0 0 10 10" refX="5" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M1,1.5 L5,5 L1,8.5" fill="none" stroke="#9ca3af" strokeWidth="1.5"
                      strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round"/>
                  </marker>
                </defs>
                {flow.edges.map(edge => {
                  const path = getEdgePath(edge);
                  if (!path) return null;
                  const isSelected = selectedEdgeId === edge.id;
                  return (
                    <g key={edge.id}>
                      {/* 底纹轨道（细半透明线） */}
                      <path
                        d={path}
                        fill="none"
                        stroke={isDark ? '#4338ca' : '#e5e7eb'}
                        strokeWidth={isSelected ? 3 : 2}
                        strokeLinecap="round"
                        opacity={0.5}
                      />
                      {/* 波浪箭头层 —— 用 marker-mid 沿采样折线放置 >>>>> 花纹 */}
                      {(() => {
                        const endpoints = getEdgeEndpoints(edge, flow.nodes);
                        if (!endpoints) return null;
                        const isFailEdge = edge.trigger === 'on_failure' || edge.trigger === 'on_false';
                        const chevronMarkerId = isFailEdge
                          ? (isDark ? 'chevron-fail-dark' : 'chevron-fail-light')
                          : isSelected
                            ? (isDark ? 'chevron-dark-selected' : 'chevron-light-selected')
                            : (isDark ? 'chevron-dark' : 'chevron-light');
                        const polyline = sampleEdgeToPolyline(endpoints.from, endpoints.to, 16);
                        return (
                          <path
                            d={polyline}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={2}
                            markerMid={`url(#${chevronMarkerId})`}
                          />
                        );
                      })()}
                      {/* 流向箭头 */}
                      <polygon points="0,-5 10,0 0,5" fill={isDark ? '#312e81' : '#ffffff'} stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')} strokeWidth="1" transform={`translate(${getArrowPos(edge, flow.nodes)})`} />
                      <polygon points="0,-4 8,0 0,4" fill={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')} transform={`translate(${getArrowPos(edge, flow.nodes)})`} />
                      {/* 连线中部标签：圆角边框样式块（暗色适配：深紫底白字 / 亮白底黑字） */}
                      {edge.label && (
                        <>
                          <rect
                            x={getLabelPos(edge, flow.nodes).x - 30}
                            y={getLabelPos(edge, flow.nodes).y - 11}
                            width="60"
                            height="22"
                            rx="6"
                            fill={isDark ? '#4338ca' : '#ffffff'}
                            stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#d1d5db')}
                            strokeWidth="1"
                            className="select-none pointer-events-auto cursor-pointer transition-colors"
                            onClick={() => setSelectedEdgeId(edge.id)}
                          />
                          <text
                            x={getLabelPos(edge, flow.nodes).x}
                            y={getLabelPos(edge, flow.nodes).y}
                            fill={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#ffffff' : '#1a1a2e')}
                            fontSize="10"
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontWeight="600"
                            className="select-none pointer-events-auto cursor-pointer"
                            onClick={() => setSelectedEdgeId(edge.id)}
                          >{edge.label}</text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            </div>
          </div>

        {/* 验证结果浮层 */}
        {showValidation && (
          <div className="absolute bottom-4 left-4 right-4 max-w-lg mx-auto z-30">
            <div className="rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-white shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {validationErrors.length === 0 ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-green-400">验证通过</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">发现 {validationErrors.length} 个问题</span>
                    </>
                  )}
                </div>
                <button onClick={() => setShowValidation(false)} className="text-gray-400 hover:text-gray-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {validationErrors.length > 0 && (
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {validationErrors.map((err, i) => (
                    <li key={i} className="text-xs text-red-400">{err.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ===== 右侧：属性面板 ===== */}
      <div
        className={`${
          showRightPanel ? 'translate-x-0' : 'translate-x-full'
        } lg:translate-x-0 absolute lg:relative right-0 z-30 w-72 h-full flex-shrink-0 border-l dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-white overflow-y-auto transition-transform duration-200 ease-out`}
      >
      <div className="p-4">
        {/* ===== 实时校验结果显示 ===== */}
        <div className={`mb-4 p-3 rounded-lg border ${
          validationStatus === 'valid' 
            ? 'border-green-500/20 bg-green-500/5' 
            : 'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {validationStatus === 'valid' ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">可以发布</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">
                  无法发布（{validationErrors.length} 个错误）
                </span>
              </>
            )}
            <button 
              onClick={() => setShowValidation(!showValidation)}
              className="ml-auto text-xs text-gray-400 hover:text-gray-200"
            >
              {showValidation ? '隐藏' : '显示'}详情
            </button>
          </div>
          
          {showValidation && validationErrors.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {validationErrors.map((error, index) => {
                // 根据错误类型选择不同的图标和颜色
                let icon, borderColor, bgColor;
                if (error.type === 'global') {
                  icon = <AlertCircle className="w-3 h-3 text-red-400" />;
                  borderColor = 'border-red-400';
                  bgColor = 'bg-red-500/5';
                } else if (error.type === 'node') {
                  icon = <Zap className="w-3 h-3 text-orange-400" />;
                  borderColor = 'border-orange-400';
                  bgColor = 'bg-orange-500/5';
                } else {
                  icon = <GitBranch className="w-3 h-3 text-yellow-400" />;
                  borderColor = 'border-yellow-400';
                  bgColor = 'bg-yellow-500/5';
                }

                return (
                  <div key={index} className={`text-xs p-2 rounded border-l-2 ${borderColor} ${bgColor}`}>
                    <div className="flex items-start gap-2">
                      {icon}
                      <div className="flex-1">
                        <span className="text-red-300">{error.message}</span>
                        
                        {/* 显示节点/边ID */}
                        {error.id && (
                          <div className="mt-1 ml-2 p-1 bg-gray-800/50 rounded text-xs font-mono">
                            ID: <span className="text-blue-300">{error.id}</span>
                          </div>
                        )}
                        
                        {/* 显示具体字段 */}
                        {error.field && (
                          <div className="mt-1 ml-2 p-1 bg-gray-800/50 rounded text-xs font-mono">
                            字段: <span className="text-green-300">{error.field}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 lg:hidden">
          <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">属性</h3>
          <button
            onClick={() => setShowRightPanel(false)}
            className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

          {/* 流程属性（无选中节点时显示） */}
          {!selectedNode && (
            <div>
              {/* ===== 流程校验状态 ===== */}
              <div className={`mb-4 p-3 rounded-lg border ${
                validationStatus === 'valid' 
                  ? 'border-green-500/20 bg-green-500/5' 
                  : 'border-red-500/20 bg-red-500/5'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {validationStatus === 'valid' ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-green-400">流程可以发布</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">
                        流程无法发布（{validationErrors.length} 个错误）
                      </span>
                    </>
                  )}
                </div>
                {validationErrors.length > 0 && (
                  <div className="text-xs text-red-300">
                    主要问题：{validationErrors[0].message}
                  </div>
                )}
              </div>

              <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-4">
                流程属性
              </h3>

              {/* 流程 ID —— 草稿编辑 + 重命名按钮 */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  流程 ID
                </label>
                <div className="flex items-center gap-1">
                  {/* 输入框：绑定草稿，自由编辑 */}
                  <input
                    type="text"
                    value={draftId}
                    onChange={e => {
                      setDraftId(e.target.value);
                      setIdDirty(e.target.value !== flow.id);
                      setIdErrors([]);  // 编辑中清空错误
                    }}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none font-mono"
                    placeholder="如 spell:fireball"
                  />
                  {/* 从法术库选取按钮 */}
                  <button
                    type="button"
                    onClick={() => setSpellPickerOpen(true)}
                    className="shrink-0 p-1.5 rounded border dark:border-border-dark light:border-border-light hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
                    title="从法术库选取"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                  {/* 重命名按钮：仅此触发校验 + 写入 */}
                  <button
                    type="button"
                    disabled={!idDirty}
                    onClick={() => {
                      const allIds = flowStore.getAll().map(f => f.id);
                      const errors = validateFlowId(draftId, allIds, flow.id);
                      if (errors.length > 0) {
                        setIdErrors(errors);
                        return;
                      }
                      if (draftId === flow.id) {
                        setIdDirty(false);
                        setIdErrors([]);
                        return;
                      }
                      // 合法 → 写入
                      const result = flowStore.renameId(flow.id, draftId);
                      if (result) {
                        setFlow(result);
                        setIdDirty(false);
                        setIdErrors([]);
                        // 同步路由
                        navigate(`/flow-editor/${draftId}`, { replace: true });
                      } else {
                        setIdErrors(['重命名失败：源流程未在库中找到或目标 ID 已被占用']);
                      }
                    }}
                    className={`shrink-0 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                      idDirty
                        ? 'bg-primary text-white hover:bg-primary/90'
                        : 'dark:text-text-dark-muted light:text-text-light-muted opacity-40 cursor-not-allowed'
                    }`}
                    title={idDirty ? '校验并重命名' : '未修改'}
                  >
                    重命名
                  </button>
                </div>
                {/* 错误提示 */}
                {idErrors.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {idErrors.map((err, i) => (
                      <li key={i} className="text-[10px] text-red-400 flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
                {/* 脏标记提示 */}
                {idDirty && idErrors.length === 0 && (
                  <p className="text-[10px] mt-1 text-amber-400">
                    已修改，点击「重命名」保存
                  </p>
                )}
                {/* 法术前缀提示 */}
                <p className="text-[10px] mt-1 dark:text-text-dark-muted light:text-text-light-muted">
                  法术绑定流程建议以 <code className="font-mono">spell:</code> 为前缀
                </p>
              </div>



              {/* 流程描述 */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  描述
                </label>
                <textarea
                  value={flow.description || ''}
                  onChange={e => setFlow(prev => ({ ...prev, description: e.target.value, updatedAt: Date.now() }))}
                  rows={3}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-y"
                />
              </div>

              {/* 标签 */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  标签
                </label>
                <input
                  type="text"
                  value={(flow.tags || []).join(', ')}
                  onChange={e => setFlow(prev => ({
                    ...prev,
                    tags: e.target.value.split(/,\s*/).filter(Boolean),
                    updatedAt: Date.now(),
                  }))}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                  placeholder="逗号分隔，如 法术, 火焰"
                />
              </div>
            </div>
          )}

          {/* 节点属性 */}
          {selectedNode ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="w-6 h-6 rounded flex items-center justify-center text-white"
                  style={{ backgroundColor: NODE_TYPE_REGISTRY.find(m => m.type === selectedNode.type)?.color || '#6b7280' }}
                >
                  {resolveNodeIcon(NODE_TYPE_REGISTRY.find(m => m.type === selectedNode.type)?.icon)}
                </span>
                <div>
                  <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">
                    {selectedNode.label}
                  </h3>
                  <p className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                    {selectedNode.type}
                  </p>
                </div>
              </div>

              {/* 节点 ID（只读） */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  节点 ID
                </label>
                <input
                  type="text"
                  value={selectedNode.id}
                  readOnly
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light opacity-60"
                />
              </div>

              {/* 显示名称 */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  显示名称
                </label>
                <input
                  type="text"
                  value={nodeLabelInput.text}
                  onChange={(e) => {
                    nodeLabelInput.onChange(e.target.value);
                    setFlow(prev => ({
                      ...prev,
                      nodes: prev.nodes.map(n =>
                        n.id === selectedNode.id ? { ...n, label: e.target.value } : n
                      ),
                      updatedAt: Date.now(),
                    }));
                  }}
                  onBlur={(e) => {
                    nodeLabelInput.onBlur();
                    const trimmed = e.target.value.trim();
                    if (trimmed !== e.target.value) {
                      setFlow(prev => ({
                        ...prev,
                        nodes: prev.nodes.map(n =>
                          n.id === selectedNode.id ? { ...n, label: trimmed } : n
                        ),
                        updatedAt: Date.now(),
                      }));
                    }
                  }}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                />
              </div>

              {/* 配置项 —— Schema 驱动 */}
              {(() => {
                const fields = NODE_CONFIG_SCHEMA[selectedNode.type] ?? [];
                return (
                  <div className="mb-3">
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-2">
                      配置项
                    </label>

                    {/* Schema 定义的字段：中文标签 + 专用控件 */}
                    {fields.length > 0 ? (
                      <div className="space-y-3">
                        {fields.map(field => (
                          <div key={field.key}>
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-xs font-medium dark:text-text-dark light:text-text-light">
                                {field.label}
                              </span>
                              {field.required && <span className="text-[10px] text-red-400">*</span>}
                            </div>
                            <ConfigFieldRenderer
                              schema={field}
                              value={selectedNode.config?.[field.key]}
                              onChange={v => updateNodeConfig(selectedNode.id, field.key, v)}
                              isDark={isDark}
                              parentValue={selectedNode.config}
                            />
                            {/* DSL 值提示：底部小字显示实际存储值 */}
                            <div className="text-[10px] font-mono mt-0.5 dark:text-text-dark-muted light:text-text-light-muted">
                              {field.key} = {String(selectedNode.config?.[field.key] ?? field.defaultValue ?? '')}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">
                        该节点无可配置项
                      </p>
                    )}

                    {/* Schema 之外的自定义额外字段（保留灵活性） */}
                    {(() => {
                      const schemaKeys = new Set(fields.map(f => f.key));
                      const extra = Object.entries(selectedNode.config || {}).filter(([k]) => !schemaKeys.has(k));
                      if (extra.length === 0) return null;
                      return (
                        <div className="mt-3 pt-3 border-t dark:border-border-dark light:border-border-light">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">自定义字段</span>
                            <button
                              onClick={() => {
                                const key = prompt('请输入配置项名称:');
                                if (key) updateNodeConfig(selectedNode.id, key, '');
                              }}
                              className="text-xs text-primary hover:underline"
                            >+ 添加</button>
                          </div>
                          <div className="space-y-2">
                            {extra.map(([key, value]) => (
                              <ExtraConfigField
                                key={key}
                                label={key}
                                value={String(value)}
                                onValueChange={(v) => updateNodeConfig(selectedNode.id, key, v)}
                                onRemove={() => {
                                  setFlow(prev => ({
                                    ...prev,
                                    nodes: prev.nodes.map(n =>
                                      n.id === selectedNode.id
                                        ? { ...n, config: Object.fromEntries(Object.entries(n.config || {}).filter(([k]) => k !== key)) }
                                        : n
                                    ),
                                    updatedAt: Date.now(),
                                  }));
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* 备注 */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  备注
                </label>
                <textarea
                  value={nodeNotesInput.text}
                  onChange={(e) => {
                    nodeNotesInput.onChange(e.target.value);
                    setFlow(prev => ({
                      ...prev,
                      nodes: prev.nodes.map(n =>
                        n.id === selectedNode.id ? { ...n, notes: e.target.value } : n
                      ),
                      updatedAt: Date.now(),
                    }));
                  }}
                  onBlur={(e) => {
                    nodeNotesInput.onBlur();
                    const trimmed = e.target.value.trim();
                    if (trimmed !== e.target.value) {
                      setFlow(prev => ({
                        ...prev,
                        nodes: prev.nodes.map(n =>
                          n.id === selectedNode.id ? { ...n, notes: trimmed } : n
                        ),
                        updatedAt: Date.now(),
                      }));
                    }
                  }}
                  rows={3}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-none"
                  placeholder="添加备注..."
                />
              </div>

              {/* 出边列表 */}
              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-2">
                  出边连接
                </label>
                <div className="space-y-1">
                  {flow.edges.filter(e => e.from === selectedNode.id).map(edge => {
                    const toNode = flow.nodes.find(n => n.id === edge.to);
                    return (
                      <div
                        key={edge.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${
                          selectedEdgeId === edge.id ? 'bg-primary/10' : 'hover:bg-white/5'
                        }`}
                        onClick={() => setSelectedEdgeId(edge.id)}
                      >
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                          {edge.label || edge.trigger}
                        </span>
                        <span className="dark:text-text-dark light:text-text-light truncate">
                          → {toNode?.label || edge.to}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEdge(edge.id);
                          }}
                          className="ml-auto p-0.5 rounded hover:bg-white/10 text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                  {flow.edges.filter(e => e.from === selectedNode.id).length === 0 && (
                    <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted italic">
                      暂无出边
                    </p>
                  )}
                </div>
              </div>

              {/* 入边列表 */}
              <div>
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-2">
                  入边连接
                </label>
                <div className="space-y-1">
                  {flow.edges.filter(e => e.to === selectedNode.id).map(edge => {
                    const fromNode = flow.nodes.find(n => n.id === edge.from);
                    return (
                      <div
                        key={edge.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer ${
                          selectedEdgeId === edge.id ? 'bg-primary/10' : 'hover:bg-white/5'
                        }`}
                        onClick={() => setSelectedEdgeId(edge.id)}
                      >
                        <span className="dark:text-text-dark light:text-text-light truncate">
                          {fromNode?.label || edge.from} →
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                          {edge.label || edge.trigger}
                        </span>
                      </div>
                    );
                  })}
                  {flow.edges.filter(e => e.to === selectedNode.id).length === 0 && (
                    <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted italic">
                      暂无入边
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : selectedEdge ? (
            /* 边属性 */
            <div>
              <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-4">
                连线属性
              </h3>

              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  边 ID
                </label>
                <input
                  type="text"
                  value={selectedEdge.id}
                  readOnly
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light opacity-60"
                />
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  触发时机
                </label>
                <select
                  value={selectedEdge.trigger}
                  onChange={(e) => {
                    setFlow(prev => ({
                      ...prev,
                      edges: prev.edges.map(ed =>
                        ed.id === selectedEdge.id
                          ? { ...ed, trigger: e.target.value as any, label: triggerToLabel(e.target.value) }
                          : ed
                      ),
                      updatedAt: Date.now(),
                    }));
                  }}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                >
                  <option value="on_complete">on_complete（完成）</option>
                  <option value="on_success">on_success（成功）</option>
                  <option value="on_failure">on_failure（失败）</option>
                  <option value="on_partial">on_partial（部分）</option>
                  <option value="on_true">on_true（是）</option>
                  <option value="on_false">on_false（否）</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  显示标签
                </label>
                <input
                  type="text"
                  value={edgeLabelInput.text}
                  onChange={(e) => {
                    edgeLabelInput.onChange(e.target.value);
                    setFlow(prev => ({
                      ...prev,
                      edges: prev.edges.map(ed =>
                        ed.id === selectedEdge.id ? { ...ed, label: e.target.value } : ed
                      ),
                      updatedAt: Date.now(),
                    }));
                  }}
                  onBlur={(e) => {
                    edgeLabelInput.onBlur();
                    const trimmed = e.target.value.trim();
                    if (trimmed !== e.target.value) {
                      setFlow(prev => ({
                        ...prev,
                        edges: prev.edges.map(ed =>
                          ed.id === selectedEdge.id ? { ...ed, label: trimmed } : ed
                        ),
                        updatedAt: Date.now(),
                      }));
                    }
                  }}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                />
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  守卫条件（可选）
                </label>
                <input
                  type="text"
                  value={edgeConditionInput.text}
                  onChange={(e) => {
                    edgeConditionInput.onChange(e.target.value);
                    setFlow(prev => ({
                      ...prev,
                      edges: prev.edges.map(ed =>
                        ed.id === selectedEdge.id ? { ...ed, condition: e.target.value || undefined } : ed
                      ),
                      updatedAt: Date.now(),
                    }));
                  }}
                  onBlur={(e) => {
                    edgeConditionInput.onBlur();
                    const trimmed = e.target.value.trim();
                    if (trimmed !== e.target.value) {
                      setFlow(prev => ({
                        ...prev,
                        edges: prev.edges.map(ed =>
                          ed.id === selectedEdge.id ? { ...ed, condition: trimmed || undefined } : ed
                        ),
                        updatedAt: Date.now(),
                      }));
                    }
                  }}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                  placeholder="如：target.currentHp > 0"
                />
              </div>

              <div className="mb-3">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                  数据映射（可选）
                </label>
                <textarea
                  value={edgeDataMapInput.text}
                  onChange={(e) => {
                    edgeDataMapInput.onChange(e.target.value);
                    try {
                      const map = e.target.value ? JSON.parse(e.target.value) : undefined;
                      setFlow(prev => ({
                        ...prev,
                        edges: prev.edges.map(ed =>
                          ed.id === selectedEdge.id ? { ...ed, dataMap: map } : ed
                        ),
                        updatedAt: Date.now(),
                      }));
                    } catch {
                      // JSON 解析错误时不更新
                    }
                  }}
                  onBlur={edgeDataMapInput.onBlur}
                  rows={4}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-none font-mono"
                  placeholder='{"failed_targets": "input_targets"}'
                />
              </div>

              <button
                onClick={() => deleteEdge(selectedEdge.id)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
>>>>>>> upstream/main
              >
                {/* 网格背景 */}
                <div className="absolute inset-0 opacity-5">
                  <svg width="100%" height="100%">
                    <defs>
                      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="1"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                  </svg>
                </div>

                {/* 连线 */}
                <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
                  {flow.edges.map(edge => {
                    const fromNode = flow.nodes.find(n => n.id === edge.from);
                    const toNode = flow.nodes.find(n => n.id === edge.to);
                    if (!fromNode || !toNode) return null;
                    
                    const fromX = fromNode.position.x + NODE_W / 2;
                    const fromY = fromNode.position.y + 24;
                    const toX = toNode.position.x + NODE_W / 2;
                    const toY = toNode.position.y + 24;
                    
                    return (
                      <g key={edge.id}>
                        <path
                          d={`M ${fromX} ${fromY} L ${toX} ${toY}`}
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          className="opacity-50"
                        />
                        <circle
                          cx={toX}
                          cy={toY}
                          r="4"
                          fill="currentColor"
                          className="opacity-70"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* 节点 */}
                {flow.nodes.map(node => (
                  <DraggableFlowNode
                    key={node.id}
                    node={node}
                    isSelected={selectedNodeId === node.id}
                    isConnectSource={connectFromId === node.id}
                    isDragging={draggingNodeId === node.id}
                    isColliding={isColliding && draggingNodeId === node.id}
                    collisionDir={collisionDir}
                    animateMove={animateMove}
                    canvasScale={canvasScale}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      setSelectedEdgeId(null);
                    }}
                    onStartConnecting={() => handleConnectStart(node.id)}
                    onDelete={() => deleteNode(node.id)}
                  />
                ))}
              </div>
            </div>
          </DndContext>
        </div>

        {/* ===== 右侧面板 ===== */}
        <div className={`w-80 border-l dark:border-border-dark light:border-border-light bg-white dark:bg-gray-900 transition-all duration-200 ${showRightPanel ? 'mr-0' : 'mr-[-20rem]'}`}>
          <div className="p-4 border-b dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light">
                {selectedNodeId ? '节点配置' : selectedEdgeId ? '连线配置' : '流程属性'}
              </h2>
              <button
                onClick={() => setShowRightPanel(false)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

<<<<<<< HEAD
          <div className="p-4 overflow-y-auto h-[calc(100vh-120px)]">
            {/* 节点配置 */}
            {selectedNodeId && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">
                    {flow.nodes.find(n => n.id === selectedNodeId)?.label}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    ID: {selectedNodeId}
                  </p>
                </div>

                <ConfigFieldRenderer
                  nodeType={flow.nodes.find(n => n.id === selectedNodeId)?.type || ''}
                  config={flow.nodes.find(n => n.id === selectedNodeId)?.config || {}}
                  onChange={(key, value) => updateNodeConfig(selectedNodeId, key, value)}
                />

                <div className="mt-4 pt-4 border-t dark:border-border-dark light:border-border-light">
                  <button
                    onClick={() => deleteNode(selectedNodeId)}
                    className="w-full py-2 px-4 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    删除节点
                  </button>
                </div>
              </div>
            )}

            {/* 连线配置 */}
            {selectedEdgeId && (
              <div>
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-2 dark:text-text-dark light:text-text-light">
                    连线配置
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    ID: {selectedEdgeId}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      触发条件
                    </label>
                    <select
                      value={connectTrigger}
                      onChange={(e) => handleTriggerChange(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                    >
                      <option value="on_complete">完成</option>
                      <option value="on_success">成功</option>
                      <option value="on_failure">失败</option>
                      <option value="on_partial">部分</option>
                    </select>
=======
              {/* ===== 法术绑定 ===== */}
              <div className="mb-4">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">
                  绑定法术
                </label>
                <SpellPickerField
                  value={flow.spellId || ''}
                  onChange={(spellId) => {
                    if (spellId) {
                      const spell = spellStore.getById(spellId);
                      if (spell) {
                        setBoundSpell(spell);
                        setFlow(prev => ({ ...prev, spellId }));
                      }
                    } else {
                      setBoundSpell(null);
                      setFlow(prev => ({ ...prev, spellId: undefined }));
                    }
                  }}
                  placeholder="选择要施放的法术"
                  isDark={isDark}
                />
                {boundSpell && (
                  <div className="mt-2 text-xs text-gray-500">
                    已选择：{boundSpell.name} (Lv.{boundSpell.level} {boundSpell.school})
                  </div>
                )}
              </div>

              {/* ===== 增强的流程统计 ===== */}
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted uppercase tracking-wide">
                  流程统计
                </h4>
                
                {/* 基础统计信息 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
                    <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{flow.nodes.length}</div>
                    <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">节点</div>
>>>>>>> upstream/main
                  </div>

                  <div>
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      连线标签
                    </label>
                    <input
                      type="text"
                      value={flow.edges.find(e => e.id === selectedEdgeId)?.label || ''}
                      onChange={(e) => {
                        const edge = flow.edges.find(e => e.id === selectedEdgeId);
                        if (edge) {
                          updateNodeConfig(edge.id, 'label', e.target.value);
                        }
                      }}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                      placeholder="输入连线标签"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      守卫条件(可选)
                    </label>
                    <input
                      type="text"
                      value={flow.edges.find(e => e.id === selectedEdgeId)?.condition || ''}
                      onChange={(e) => {
                        const edge = flow.edges.find(e => e.id === selectedEdgeId);
                        if (edge) {
                          updateNodeConfig(edge.id, 'condition', e.target.value || undefined);
                        }
                      }}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                      placeholder="如:target.currentHp > 0"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      数据映射(可选)
                    </label>
                    <textarea
                      value={JSON.stringify(flow.edges.find(e => e.id === selectedEdgeId)?.dataMap || {}, null, 2)}
                      onChange={(e) => {
                        try {
                          const map = e.target.value ? JSON.parse(e.target.value) : undefined;
                          const edge = flow.edges.find(e => e.id === selectedEdgeId);
                          if (edge) {
                            updateNodeConfig(edge.id, 'dataMap', map);
                          }
                        } catch {
                          // JSON 解析错误时不更新
                        }
                      }}
                      rows={4}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-none font-mono"
                      placeholder='{"failed_targets": "input_targets"}'
                    />
                  </div>

                  <button
                    onClick={() => deleteEdge(selectedEdgeId)}
                    className="w-full py-2 px-4 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    删除连线
                  </button>
                </div>
              </div>
            )}

            {/* 流程属性(无选中节点时显示) */}
            {!selectedNode && (
              <div>
                {/* ===== 流程校验状态 ===== */}
                <div className={`mb-4 p-3 rounded-lg border ${
                  validationStatus === 'valid' 
                    ? 'border-green-500/20 bg-green-500/5' 
                    : 'border-red-500/20 bg-red-500/5'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {validationStatus === 'valid' ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-sm font-medium text-green-400">流程可以发布</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-red-400">
                          流程无法发布({validationErrors.length} 个错误)
                        </span>
                      </>
                    )}
                  </div>
                  {validationErrors.length > 0 && (
                    <div className="text-xs text-red-300">
                      主要问题:{validationErrors[0].message}
                    </div>
                  )}
                </div>

                <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-4">
                  流程属性
                </h3>

                {/* 流程基本信息 */}
                <div className="border-b dark:border-border-dark light:border-border-light pb-4 mb-4">
                  <h4 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-3">
                    流程基本信息
                  </h4>
                  
                  {/* 流程ID */}
                  <div className="mb-3">
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      流程 ID
                    </label>
                    <input
                      type="text"
                      value={flow.id}
                      onChange={e => {
                        setFlow(prev => ({ ...prev, id: e.target.value }));
                        setIdDirty(e.target.value !== flow.id);
                        setIdErrors([]);
                      }}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none font-mono"
                      placeholder="如 spell:fireball"
                    />
                  </div>

                  {/* 流程名称 */}
                  <div className="mb-3">
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      流程名称
                    </label>
                    <input
                      type="text"
                      value={flow.name}
                      onChange={e => setFlow(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                      placeholder="输入流程名称"
                    />
                  </div>

                  {/* 流程描述 */}
                  <div className="mb-3">
                    <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1">
                      流程描述
                    </label>
                    <textarea
                      value={flow.description}
                      onChange={e => setFlow(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-none"
                      placeholder="输入流程描述"
                    />
                  </div>
                </div>

                {/* 流程状态和发布区域 */}
                <div className="border-b dark:border-border-dark light:border-border-light pb-4 mb-4">
                  <h4 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-3">
                    流程状态
                  </h4>
                  
                  {/* 状态指示器 */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        flow.status === 'draft' ? 'bg-yellow-500' : 'bg-green-500'
                      }`} />
                      <span className="text-sm font-medium">
                        {flow.status === 'draft' ? '草稿状态' : '已发布'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {flow.status === 'draft' 
                        ? '草稿可以随时编辑,发布后将锁定部分功能'
                        : '已发布的流程可以绑定法术供使用'
                      }
                    </p>
                  </div>

                  {/* 发布/更新按钮 */}
                  <button
                    onClick={handlePublish}
                    className={`w-full py-2 rounded-lg font-medium transition-colors ${
                      flow.status === 'draft'
                        ? 'bg-primary text-white hover:bg-primary/90'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    {flow.status === 'draft' ? '发布流程' : '更新流程'}
                  </button>
                </div>

                {/* 法术绑定区域 - 根据状态显示不同内容 */}
                <div>
                  <h4 className="text-sm font-semibold dark:text-text-dark light:text-text-light mb-3">
                    法术绑定
                  </h4>
                  
                  {/* 草稿状态下的提示 */}
                  {flow.status === 'draft' && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="text-yellow-600 dark:text-yellow-400">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <h5 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                            草稿状态
                          </h5>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            草稿状态下不需要绑定法术。发布流程后,可以在此绑定法术供使用。
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 已发布状态下的绑定管理 */}
                  {flow.status === 'published' && (
                    <FlowSpellBindingManager
                      flowId={flow.id}
                      flowName={flow.name}
                      onBindingChange={() => {
                        // 重新加载流程数据
                        const updatedFlow = flowStore.getById(flow.id);
                        if (updatedFlow) setFlow(updatedFlow);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧遮罩(窄屏抽屉打开时) */}
      {showRightPanel && (
        <div
          className="lg:hidden absolute inset-0 z-20 bg-black/30"
          onClick={() => setShowRightPanel(false)}
        />
      )}

      {/* ===== 草稿列表弹窗 ===== */}
      {showDrafts && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 px-4 pointer-events-none">
          <div className="mt-4 w-full max-w-md rounded-xl border dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-white shadow-xl pointer-events-auto">
            <div className="p-3 border-b dark:border-border-dark light:border-border-light flex items-center justify-between">
              <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">本地草稿</h3>
              <button onClick={() => setShowDrafts(false)} className="text-gray-400 hover:text-gray-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {drafts.length === 0 ? (
                <p className="p-4 text-xs dark:text-text-dark-muted light:text-text-light-muted text-center">
                  暂无草稿
                </p>
              ) : (
                drafts.map(draft => (
                  <div
                    key={draft.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 cursor-pointer border-b dark:border-border-dark/50 light:border-border-light/50 last:border-0"
                    onClick={() => loadDraft(draft)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium dark:text-text-dark light:text-text-light truncate">
                        {draft.name}
                      </div>
                      <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">
                        {new Date(draft.updatedAt).toLocaleString('zh-CN')}
                        · {draft.nodes.length} 节点 · {draft.edges.length} 连线
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDraft(draft.id);
                      }}
                      className="p-1 rounded hover:bg-white/10 text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 退出确认弹窗 ===== */}
      {exitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg p-6 max-w-sm w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-xl">
            <h3 className="text-base font-bold mb-2">退出编辑器</h3>
            <p className="text-sm opacity-60 mb-4">是否保存当前草稿?</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { saveDraft(); navigate('/'); }} className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90">保存并退出</button>
              <button onClick={() => navigate('/')} className="px-4 py-2 text-sm rounded-lg border border-red-400 text-red-400 hover:bg-red-400/10">丢弃</button>
              <button onClick={() => setExitModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5">取消</button>
            </div>
          </div>
        </div>
      )}

<<<<<<< HEAD
=======
      {/* ===== 法术选择器弹窗 ===== */}
      {spellPickerOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm border-2 border-dashed border-pink-500">
          <SpellPicker
            isOpen={spellPickerOpen}
            onClose={() => setSpellPickerOpen(false)}
            onSelect={(spell) => {
              setDraftId(spell.id);
              setSpellPickerOpen(false);
              setIdDirty(true);
              setIdErrors([]);
            }}
            selectedSpellIds={[]}
          />
        </div>
      )}

      {/* ===== 法术绑定弹窗 ===== */}
      {showSpellPicker && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl p-6 max-w-2xl w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium dark:text-text-dark light:text-text-light">选择法术</h3>
              <button onClick={() => setShowSpellPicker(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {spellStore.getAll().map(spell => (
                <div
                  key={spell.id}
                  className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:bg-primary/5 cursor-pointer transition-colors"
                  onClick={() => handleBindSpell(spell.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium dark:text-text-dark light:text-text-light truncate">
                        {spell.name}
                      </div>
                      <div className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        Lv.{spell.level} {spell.school}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

>>>>>>> upstream/main
      {/* ===== 发布提示 toast ===== */}
      {toast && (
        <div className={`fixed top-16 right-4 z-[70] px-4 py-2 rounded-lg text-sm font-medium shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ===== DraggableFlowNode 子组件:封装 dnd-kit useDraggable =====
interface DraggableFlowNodeProps {
  node: FlowNodeDef;
  isSelected: boolean;
  isConnectSource: boolean;
  isDragging: boolean;
  isColliding: boolean;
  collisionDir: 'up' | 'down' | 'left' | 'right' | null;
  animateMove: boolean;
  canvasScale: number;
  onClick: () => void;
  onStartConnecting: () => void;
  onDelete: () => void;
  flow: FlowDefinition;
}

function DraggableFlowNode({
  node,
  isSelected,
  isConnectSource,
  isDragging,
  isColliding,
  collisionDir,
  animateMove,
  canvasScale,
  onClick,
  onStartConnecting,
  onDelete,
  flow,
}: DraggableFlowNodeProps) {
  const meta = NODE_TYPE_REGISTRY.find(m => m.type === node.type);
  const { attributes, listeners, setNodeRef, transform, isDragging: dndDragging } = useDraggable({
    id: node.id,
    data: { node },
  });

  // ★ 将 dnd-kit 屏幕像素 transform 转换为画布坐标,补偿父容器 scale
  const adjustedTransform: React.CSSProperties['transform'] =
    transform
      ? CSS.Transform.toString({
          x: transform.x / canvasScale,
          y: transform.y / canvasScale,
          scaleX: 1,
          scaleY: 1,
        })
      : undefined;

  // 拖拽时应用 CSS transform(跟随手指/鼠标)
  const style: React.CSSProperties = {
    position: 'absolute',
    left: node.position.x,
    top: node.position.y,
    width: NODE_W,
    zIndex: isDragging ? 20 : (isSelected ? 10 : 1),
    transform: adjustedTransform,   // ★ 用调整后的 transform
    opacity: isColliding ? 0.6 : (dndDragging ? 0.9 : 1),
    // 软排斥预览:碰撞时红色投影提示
    filter: isColliding ? 'drop-shadow(0 0 4px red)' : undefined,
    // 拖拽中禁用 transform 动画更跟手;结束后短暂开启 200ms 过渡做瞬移落位动画
    transition: dndDragging ? 'none' : (animateMove ? 'transform 200ms ease-out' : undefined),
    // 阻止浏览器默认 touch 行为(如滚动),确保 dnd-kit 接管拖拽
    touchAction: 'none',
    cursor: dndDragging ? 'grabbing' : 'grab',
  };

  // 碰撞时抖动动画
  const shakeClass = isColliding ? 'animate-shake' : '';
  const borderColor = isColliding
    ? 'border-red-500 shadow-red-500/30'
    : isSelected
      ? 'border-primary shadow-primary/20'
      : isConnectSource
        ? 'border-primary/60'
        : 'dark:border-border-dark light:border-border-light shadow-sm hover:border-primary/40';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      data-node-id={node.id}
      className={`select-none ${shakeClass}`}
    >
      {/* 碰撞方向提示:按推离方向显示对应边缘箭头 */}
      {collisionDir && (
        <div className="absolute inset-0 pointer-events-none z-30 text-red-500 text-lg leading-none">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2" style={{ display: collisionDir === 'up' ? 'block' : 'none' }}>↑</div>
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2" style={{ display: collisionDir === 'down' ? 'block' : 'none' }}>↓</div>
          <div className="absolute -left-3 top-1/2 -translate-y-1/2" style={{ display: collisionDir === 'left' ? 'block' : 'none' }}>←</div>
          <div className="absolute -right-3 top-1/2 -translate-y-1/2" style={{ display: collisionDir === 'right' ? 'block' : 'none' }}>→</div>
        </div>
      )}
      <div
        className={`rounded-lg border-2 p-2.5 sm:p-3 transition-all cursor-pointer ${borderColor} dark:bg-bg-dark-2 light:bg-white`}
        onClick={(e) => {
          // 仅在未拖拽时触发 click(dnd-kit 的 listeners 已处理拖拽)
          if (!dndDragging) onClick();
        }}
      >
        {/* 节点头部 */}
        <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
          <span
            className="w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center text-white flex-shrink-0"
            style={{ backgroundColor: meta?.color || '#6b7280' }}
          >
            {resolveNodeIcon(meta?.icon)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-semibold dark:text-text-dark light:text-text-light truncate">
              {node.label}
            </div>
            <div className="text-[9px] sm:text-[10px] dark:text-text-dark-muted light:text-text-light-muted truncate">
              {node.type}
            </div>
          </div>
<<<<<<< HEAD
          {/* 操作按钮:阻止事件冒泡到拖拽层 */}
          <div className="flex items-center gap-0.5
=======
          {/* 操作按钮：阻止事件冒泡到拖拽层 */}
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onStartConnecting();
              }}
              className="p-1 sm:p-1.5 rounded hover:bg-white/10 text-primary"
              title="连接"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 sm:p-1.5 rounded hover:bg-white/10 text-red-400"
              title="删除"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 节点配置预览 */}
        {node.config && Object.keys(node.config).length > 0 && (
          <div className="text-[9px] sm:text-[10px] dark:text-text-dark-muted light:text-text-light-muted space-y-0.5">
            {Object.entries(node.config).map(([k, v]) => (
              <div key={k} className="truncate">
                <span className="font-medium">{k}:</span> {String(v)}
              </div>
            ))}
            
            {/* 如果是 cast_start 节点且绑定了法术，显示 DSL */}
            {node.type === 'cast_start' && flow.spellId && (
              <div className="mt-1 pt-1 border-t dark:border-border-dark light:border-border-light text-[8px] font-mono bg-gray-100/30 dark:bg-gray-800/30 rounded px-1">
                autoChecks={JSON.stringify(node.config?.autoChecks || {})}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 左侧栏可拖拽节点类型条目 =====
interface PaletteDragItemProps {
  meta: NodeTypeMeta;
}

function PaletteDragItem({ meta }: PaletteDragItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${meta.type}`,
    data: { fromPalette: true, typeMeta: meta },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`node-card flex-shrink-0 inline-flex flex-row items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-left transition-all duration-200
        hover:bg-primary/10 hover:border-primary hover:shadow-md hover:scale-105
        border border-transparent dark:border-transparent light:border-transparent
        bg-white/8 dark:bg-white/8 light:bg-gray-100/60
        active:scale-[0.95] active:shadow-inner
        ${isDragging ? 'opacity-50 scale-95 shadow-lg border-primary/30' : ''}
        min-w-[100px] max-w-[130px] h-[44px] w-auto`}
      title={meta.description}
      style={{ touchAction: 'none' }}
    >
      <span
        className="w-4 h-4 rounded-full flex-shrink-0 mb-1"
        style={{ backgroundColor: meta.color }}
      />
      <span className="truncate font-medium text-xs flex-1 min-w-0">{meta.label}</span>
    </button>
  );
}

// ===== 自定义额外配置字段输入（受控输入走 useTextInput） =====
interface ExtraConfigFieldProps {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  onRemove: () => void;
}

function ExtraConfigField({ label, value, onValueChange, onRemove }: ExtraConfigFieldProps) {
  const input = useTextInput(value);
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mb-0.5">{label}</div>
        <input
          type="text"
          value={input.text}
          onChange={(e) => {
            input.onChange(e.target.value);
            onValueChange(e.target.value);
          }}
          onBlur={(e) => {
            input.onBlur();
            const trimmed = e.target.value.trim();
            if (trimmed !== e.target.value) {
              onValueChange(trimmed);
            }
          }}
          className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
        />
      </div>
      <button onClick={onRemove} className="p-1 rounded hover:bg-white/10 text-red-400 mt-4">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
>>>>>>> upstream/main
