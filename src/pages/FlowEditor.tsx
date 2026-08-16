// D&D DSL 可视化流程图编辑器 —— 在画布上拖拽节点、连线、配置属性，编排法术/机制的流程编码
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
  MousePointer, GitBranch, Zap, Target, Shield, Heart, Skull,
  ChevronRight, RotateCcw,
  PanelLeft, PanelRight,
} from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import flowStore from '@/data/flowStore';
import type {
  FlowDefinition,
  FlowNodeDef,
  FlowEdgeDef,
  NodeTypeMeta,
} from '@/types/flow';
import { NODE_TYPE_REGISTRY, groupNodeTypesByCategory, validateFlow } from '@/types/flow';
import { NODE_CONFIG_SCHEMA } from '@/types/flow';
import ConfigFieldRenderer from '@/components/ConfigFieldRenderer';

// ===== 节点图标解析 =====
/** 从 icon name 解析为 React 元素，单一真相源 */
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

// ===== 本地存储 key =====
const STORAGE_KEY = 'dnd-flow-editor-drafts';
const AUTOSAVE_KEY = 'dnd-flow-editor-autosave';

// 节点卡片尺寸常量
const NODE_W = 260;   // 窄屏基准宽度
const NODE_H = 56;    // 最小估计高度（头部）

// 画布缩放常量
const SCALE_MIN = 0.25;
const SCALE_MAX = 3;
const SCALE_STEP = 0.1;

interface DraftEntry {
  id: string;
  name: string;
  flow: FlowDefinition;
  updatedAt: number;
}

// ===== 碰撞检测工具函数 =====
function nodesOverlap(a: FlowNodeDef, b: FlowNodeDef, cardWidth: number): boolean {
  return (
    a.id !== b.id &&
    a.position.x < b.position.x + cardWidth &&
    a.position.x + cardWidth > b.position.x &&
    a.position.y < b.position.y + NODE_H &&
    a.position.y + NODE_H > b.position.y
  );
}

// 寻找不与其他节点碰撞的位置（右侧→下方探测）
function findNonOverlappingPosition(
  node: FlowNodeDef,
  allNodes: FlowNodeDef[],
  cardWidth: number,
  dx = 40,
  maxAttempts = 20,
): { x: number; y: number } {
  let pos = { x: node.position.x, y: node.position.y };
  for (let i = 0; i < maxAttempts; i++) {
    const testNode = { ...node, position: pos };
    const hasOverlap = allNodes.some(other => other.id !== node.id && nodesOverlap(testNode, other, cardWidth));
    if (!hasOverlap) return pos;
    pos = { x: pos.x + dx, y: pos.y };
  }
  pos = { x: node.position.x, y: node.position.y + dx };
  for (let i = 0; i < maxAttempts; i++) {
    const testNode = { ...node, position: pos };
    const hasOverlap = allNodes.some(other => other.id !== node.id && nodesOverlap(testNode, other, cardWidth));
    if (!hasOverlap) return pos;
    pos = { x: pos.x, y: pos.y + dx };
  }
  return pos;
}

export default function FlowEditor() {
  const { id: flowId } = useParams<{ id: string }>();

  // ===== 主题感知 =====
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ===== 状态 =====
  const [flow, setFlow] = useState<FlowDefinition>(() => {
    // ① 优先从 flowStore 加载指定 ID
    if (flowId) {
      const loaded = flowStore.getById(flowId);
      if (loaded) return loaded;
    }
    // ② 退回 autosave
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.flow?.nodes) return data.flow as FlowDefinition;
      }
    } catch { /* ignore */ }
    return createEmptyFlow();
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) return (JSON.parse(raw) as any).selectedNodeId ?? null;
    } catch {}
    return null;
  });
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectTrigger, setConnectTrigger] = useState<string>('on_complete');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [drafts, setDrafts] = useState<DraftEntry[]>(() => loadDrafts());
  const [showDrafts, setShowDrafts] = useState(false);
  const [flowName, setFlowName] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data?.flowName) return data.flowName as string;
      }
    } catch { /* ignore */ }
    return '';
  });
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  // 拖拽状态：实时碰撞检测
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isColliding, setIsColliding] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ nodeId: string; dx: number; dy: number } | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasTranslate, setCanvasTranslate] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const skipNameSync = useRef(true);

  // ===== 画布缩放：触屏双指捏合 =====
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

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
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
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current.startDist = 0;
  }, []);

  // ===== 画布缩放：鼠标 Ctrl/Meta + 滚轮 =====
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    setCanvasScale(prev => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round((prev + delta) * 100) / 100)));
  }, []);

  // ===== dnd-kit 传感器：Pointer（鼠标）+ Touch（触屏） =====
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 移动 5px 才激活拖拽，防止点击误触发
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 10,
      },
    }),
  );

  // ===== 同步 flowName（跳过首次挂载，避免覆盖从 autosave 恢复的名称） =====
  useEffect(() => {
    if (skipNameSync.current) {
      skipNameSync.current = false;
      return;
    }
    setFlowName(flow.name);
  }, [flow.name]);

  // ===== 自动保存（防抖 500ms，防止刷新丢失当前编辑） =====
  useEffect(() => {
    const timer = setTimeout(() => {
      if (flowId) {
        flowStore.update(flowId, flow);
      }
      // 兜底：仍写 autosave（无 flowId 时唯一保存渠道）
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ flow, flowName }));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [flow, flowName, flowId]);

  const scrollRestored = useRef(false);

  useLayoutEffect(() => {
    if (scrollRestored.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (typeof data.scrollX === 'number' && typeof data.scrollY === 'number') {
          canvas.scrollLeft = data.scrollX;
          canvas.scrollTop  = data.scrollY;
        }
      }
    } catch { /* ignore */ }

    scrollRestored.current = true;
  }, []);

  // ===== 创建空流程 =====
  function createEmptyFlow(): FlowDefinition {
    return {
      id: 'flow-' + Date.now(),
      name: '未命名流程',
      description: '',
      nodes: [],
      edges: [],
      tags: [],
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  // ===== 本地存储 =====
  function loadDrafts(): DraftEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as DraftEntry[];
    } catch {
      return [];
    }
  }

  function saveDraftsToStorage(drafts: DraftEntry[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  }

  // ===== 添加节点（自动防重叠） =====
  const addNode = useCallback((typeMeta: NodeTypeMeta, position: { x: number; y: number }) => {
    const id = `${typeMeta.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    // 从 Schema 合并默认值（Schema 优先，兜底 defaultConfig）
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
    // 新节点防重叠放置
    const finalPos = findNonOverlappingPosition(newNode, flow.nodes, NODE_W);
    newNode.position = finalPos;
    setFlow(prev => ({ ...prev, nodes: [...prev.nodes, newNode], updatedAt: Date.now() }));
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, [flow.nodes]);

  // ===== 删除节点 =====
  const deleteNode = useCallback((nodeId: string) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
      updatedAt: Date.now(),
    }));
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

  // ===== 更新节点位置（拖拽后应用 delta + 碰撞检测） =====
  const updateNodePositionByDelta = useCallback((nodeId: string, delta: { x: number; y: number }) => {
    setFlow(prev => {
      const target = prev.nodes.find(n => n.id === nodeId);
      if (!target) return prev;
      const proposed = {
        x: Math.max(0, target.position.x + delta.x),
        y: Math.max(0, target.position.y + delta.y),
      };
      const testNode = { ...target, position: proposed };
      const others = prev.nodes.filter(n => n.id !== nodeId);
      const hasOverlap = others.some(other => nodesOverlap(testNode, other, NODE_W));
      const finalPos = hasOverlap
        ? findNonOverlappingPosition(testNode, others, NODE_W)
        : proposed;
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

  // ===== 实时碰撞检测：计算拖拽节点的投影位置与其他节点是否重叠 =====
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

  // ===== 事件：拖拽开始 =====
  const handleDragStart = useCallback((event: DragEndEvent) => {
    const nodeId = event.active?.id as string;
    if (nodeId) setDraggingNodeId(nodeId);
    setIsColliding(false);
    setDragOffset(null); // 防御：清除可能残留的旧偏移
  }, []);

  // ===== 事件：拖拽移动（仅记录偏移 → 驱动 SVG 重绘，绝不 setFlow） =====
  const handleDragMove = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    if (!active) return;
    const nodeId = active.id as string;
    // 仅记录偏移 → 驱动 effectiveNodes → SVG 实时重绘
    // 绝不 setFlow，绝不双倍位移
    setDragOffset({ nodeId, dx: delta.x, dy: delta.y });
    // 碰撞检测照常
    const projected = getProjectedPosition(nodeId, delta);
    const colliding = checkCollision(nodeId, projected.x, projected.y);
    setIsColliding(colliding);
  }, [checkCollision, getProjectedPosition]);

  // ===== 事件：拖拽结束（清除偏移，提交 position） =====
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, delta } = event;
    if (!active) return;
    setDragOffset(null); // 清除偏移
    const nodeId = active.id as string;
    updateNodePositionByDelta(nodeId, { x: delta.x, y: delta.y });
    setDraggingNodeId(null);
    setIsColliding(false);
  }, [updateNodePositionByDelta]);

  // ===== 画布空白处点击取消选中 =====
  const handleCanvasClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  // ===== 画布事件：节点点击（选择或连接） =====
  const handleNodeClick = useCallback((nodeId: string) => {
    if (isConnecting) {
      if (connectFromId && connectFromId !== nodeId) {
        addEdge(connectFromId, nodeId, connectTrigger);
        setIsConnecting(false);
        setConnectFromId(null);
      }
      return;
    }
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }, [isConnecting, connectFromId, connectTrigger, addEdge]);

  // ===== 开始连接模式 =====
  const startConnecting = useCallback((nodeId: string) => {
    setIsConnecting(true);
    setConnectFromId(nodeId);
    setSelectedNodeId(nodeId);
  }, []);

  // ===== 取消连接模式 =====
  const cancelConnecting = useCallback(() => {
    setIsConnecting(false);
    setConnectFromId(null);
  }, []);

  // ===== 验证 =====
  const runValidation = useCallback(() => {
    const errors = validateFlow(flow);
    setValidationErrors(errors);
    setShowValidation(true);
  }, [flow]);

  // ===== 保存草稿 =====
  const saveDraft = useCallback(() => {
    const updatedFlow = { ...flow, name: flowName || flow.name, updatedAt: Date.now() };
    const newDraft: DraftEntry = {
      id: flow.id,
      name: flowName || flow.name,
      flow: updatedFlow,
      updatedAt: Date.now(),
    };
    const existingIdx = drafts.findIndex(d => d.id === flow.id);
    let newDrafts: DraftEntry[];
    if (existingIdx >= 0) {
      newDrafts = [...drafts];
      newDrafts[existingIdx] = newDraft;
    } else {
      newDrafts = [newDraft, ...drafts];
    }
    setDrafts(newDrafts);
    saveDraftsToStorage(newDrafts);
    setFlow(updatedFlow);
    alert('草稿已保存到本地');
  }, [flow, flowName, drafts]);

  // ===== 加载草稿 =====
  const loadDraft = useCallback((draft: DraftEntry) => {
    setFlow(draft.flow);
    setFlowName(draft.flow.name);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowDrafts(false);
  }, []);

  // ===== 删除草稿 =====
  const deleteDraft = useCallback((draftId: string) => {
    const newDrafts = drafts.filter(d => d.id !== draftId);
    setDrafts(newDrafts);
    saveDraftsToStorage(newDrafts);
  }, [drafts]);

  // ===== 清空画布 =====
  const clearCanvas = useCallback(() => {
    if (confirm('确定要清空当前画布吗？所有节点和连线将被删除。')) {
      setFlow(createEmptyFlow());
      setFlowName('未命名流程');
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, []);

  // ===== 拖拽期间的有效节点（dragOffset 只驱动 SVG 重绘，不动 flow.nodes） =====
  const effectiveNodes = useMemo(() => {
    if (!dragOffset) return flow.nodes;
    return flow.nodes.map(n =>
      n.id === dragOffset.nodeId
        ? { ...n, position: { x: Math.max(0, n.position.x + dragOffset.dx), y: Math.max(0, n.position.y + dragOffset.dy) } }
        : n
    );
  }, [flow.nodes, dragOffset]);

  // ===== 获取选中节点 =====
  const selectedNode = flow.nodes.find(n => n.id === selectedNodeId) || null;
  const selectedEdge = flow.edges.find(e => e.id === selectedEdgeId) || null;

  // ===== 计算 SVG 连线路径 =====
  function getEdgePath(edge: FlowEdgeDef, nodes: FlowNodeDef[]): string | null {
    const fromNode = nodes.find(n => n.id === edge.from);
    const toNode = nodes.find(n => n.id === edge.to);
    if (!fromNode || !toNode) return null;

    const fx = fromNode.position.x + NODE_W / 2;
    const fy = fromNode.position.y + 24;
    const tx = toNode.position.x + NODE_W / 2;
    const ty = toNode.position.y + 24;

    // 直线，不再用 C（cubic bezier）弯曲
    return `M ${fx} ${fy} L ${tx} ${ty}`;
  }

  // ===== 节点分类面板 =====
  const nodeGroups = groupNodeTypesByCategory();

  // ===== 渲染 =====
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col overflow-hidden dark:bg-bg-dark light:bg-bg-light relative">
      {/* ===== 顶部工具栏 ===== */}
      <div className="flex items-center justify-between h-12 border-b dark:border-border-dark light:border-border-light flex-shrink-0 dark:bg-bg-dark-2 light:bg-white">
        <div className="flex items-center gap-2 px-4">
          <button onClick={() => setExitModalOpen(true)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors dark:text-text-dark light:text-text-light hover:bg-white/5">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">退出</span>
          </button>
          <div className="h-5 w-px dark:bg-border-dark light:bg-border-light" />
          <input type="text" value={flowName} onChange={(e) => setFlowName(e.target.value)} className="text-sm font-medium bg-transparent border-none outline-none dark:text-text-dark light:text-text-light w-28 sm:w-48" placeholder="流程名称" />
        </div>
        <div className="flex items-center gap-2 px-4">
          <button onClick={saveDraft} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors">
            <Save className="w-3.5 h-3.5" />
            <span>保存</span>
          </button>
        </div>
      </div>

      {/* ===== 功能栏 ===== */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b dark:border-border-dark light:border-border-light flex-shrink-0 overflow-x-auto">
        <button onClick={() => setShowLeftPanel(!showLeftPanel)} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${showLeftPanel ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 dark:text-text-dark light:text-text-light'}`}>
          <PanelLeft className="w-3.5 h-3.5" /><span className="hidden sm:inline">节点库</span>
        </button>
        <div className="h-4 w-px dark:bg-border-dark light:bg-border-light mx-1" />
        <button onClick={runValidation} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/5 dark:text-text-dark light:text-text-light">
          <AlertCircle className="w-3.5 h-3.5" /><span className="hidden sm:inline">验证</span>
        </button>
        <button onClick={() => setShowDrafts(!showDrafts)} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/5 dark:text-text-dark light:text-text-light">
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showDrafts ? 'rotate-90' : ''}`} /><span className="hidden sm:inline">草稿</span><span className="sm:hidden">({drafts.length})</span>
        </button>
        <div className="h-4 w-px dark:bg-border-dark light:bg-border-light mx-1" />
        <div className="flex-1" />
        <div className="flex items-center gap-1 mr-2">
          <button onClick={() => setCanvasScale(p => Math.max(SCALE_MIN, Math.round((p - SCALE_STEP) * 100) / 100))}
            className="px-2 py-1 rounded-md text-xs dark:text-text-dark light:text-text-light hover:bg-white/5" title="缩小">−</button>
          <span className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted w-10 text-center tabular-nums">
            {Math.round(canvasScale * 100)}%
          </span>
          <button onClick={() => setCanvasScale(p => Math.min(SCALE_MAX, Math.round((p + SCALE_STEP) * 100) / 100))}
            className="px-2 py-1 rounded-md text-xs dark:text-text-dark light:text-text-light hover:bg-white/5" title="放大">+</button>
          <button onClick={() => { setCanvasScale(1); setCanvasTranslate({ x: 0, y: 0 }); }}
            className="px-2 py-1 rounded-md text-[10px] dark:text-text-dark-muted light:text-text-light-muted hover:bg-white/5 hidden sm:inline-block" title="重置缩放">1:1</button>
        </div>
        <button onClick={clearCanvas} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors text-red-400 hover:bg-red-400/10">
          <RotateCcw className="w-3.5 h-3.5" /><span className="hidden sm:inline">清空</span>
        </button>
        <div className="h-4 w-px dark:bg-border-dark light:bg-border-light mx-1 hidden sm:block" />
        <button onClick={() => setShowRightPanel(!showRightPanel)} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${showRightPanel ? 'bg-primary/10 text-primary' : 'hover:bg-white/5 dark:text-text-dark light:text-text-light'}`}>
          <PanelRight className="w-3.5 h-3.5" /><span className="hidden sm:inline">属性</span>
        </button>
      </div>

      {/* ===== 连接模式提示 ===== */}
      {isConnecting && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-primary/90 text-white text-xs font-medium z-50 shadow-lg whitespace-nowrap">
          连接模式：点击目标节点完成连接
          <button onClick={cancelConnecting} className="ml-2 underline">取消</button>
        </div>
      )}

      {/* ===== 内容区域（左面板 + 画布 + 右面板） ===== */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
      <div className="flex-1 flex overflow-hidden relative">
      {/* ===== 左侧节点面板 ===== */}
      {/* 宽屏：固定 64 宽图标条 + 256 宽内容区；窄屏：全宽滑出抽屉 */}
      <div
        className={`${
          showLeftPanel ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 absolute lg:relative z-30 w-64 h-full flex-shrink-0 border-r dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-gray-50 overflow-y-auto transition-transform duration-200 ease-out`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3 lg:hidden">
            <h2 className="text-sm font-semibold dark:text-text-dark light:text-text-light">环节库</h2>
            <button
              onClick={() => setShowLeftPanel(false)}
              className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <h2 className="text-sm font-semibold dark:text-text-dark light:text-light mb-3 hidden lg:block">环节库</h2>
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
            拖拽或点击节点类型添加到画布
          </p>

          {Object.entries(nodeGroups).map(([category, metas]) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted uppercase tracking-wide mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {metas.map(meta => (
                  <PaletteDragItem key={meta.type} meta={meta} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 左侧遮罩（窄屏抽屉打开时） */}
      {showLeftPanel && (
        <div
          className="lg:hidden absolute inset-0 z-20 bg-black/30"
          onClick={() => setShowLeftPanel(false)}
        />
      )}

      {/* ===== 中央：画布区域 ===== */}
      <div className="flex-1 relative overflow-hidden min-w-0">
        {/* 画布 */}
          <div
            ref={canvasRef}
            className="absolute inset-0 overflow-auto dark:bg-bg-dark light:bg-gray-50 select-none"
            onWheel={handleCanvasWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="relative origin-top-left"
              style={{
                width: 3000 * canvasScale,
                height: 2000 * canvasScale,
                transform: `translate(${canvasTranslate.x}px, ${canvasTranslate.y}px) scale(${canvasScale})`,
              }}
            >
            {/* 固定尺寸画布内容区 */}
            <div className="relative" style={{ width: 3000, height: 2000 }}>
              {/* 背景网格 + 点击空白处取消选中 */}
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
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
                  onClick={() => handleNodeClick(node.id)}
                  onStartConnecting={() => startConnecting(node.id)}
                  onDelete={() => deleteNode(node.id)}
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
                  const path = getEdgePath(edge, effectiveNodes);
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
                        const endpoints = getEdgeEndpoints(edge, effectiveNodes);
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
                      <polygon points="0,-5 10,0 0,5" fill={isDark ? '#312e81' : '#ffffff'} stroke={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')} strokeWidth="1" transform={`translate(${getArrowPos(edge, effectiveNodes)})`} />
                      <polygon points="0,-4 8,0 0,4" fill={isSelected ? (isDark ? '#f87171' : '#6366f1') : (isDark ? '#818cf8' : '#9ca3af')} transform={`translate(${getArrowPos(edge, effectiveNodes)})`} />
                      {/* 连线中部标签：圆角边框样式块（暗色适配：深紫底白字 / 亮白底黑字） */}
                      {edge.label && (
                        <>
                          <rect
                            x={getLabelPos(edge, effectiveNodes).x - 30}
                            y={getLabelPos(edge, effectiveNodes).y - 11}
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
                            x={getLabelPos(edge, effectiveNodes).x}
                            y={getLabelPos(edge, effectiveNodes).y}
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
                    <li key={i} className="text-xs text-red-400">{err}</li>
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
        } ${showRightPanel ? 'lg:relative' : ''} absolute right-0 z-30 w-72 h-full flex-shrink-0 border-l dark:border-border-dark light:border-border-light dark:bg-bg-dark-2 light:bg-white overflow-y-auto transition-transform duration-200 ease-out`}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-4 lg:hidden">
            <h3 className="text-sm font-semibold dark:text-text-dark light:text-text-light">属性</h3>
            <button
              onClick={() => setShowRightPanel(false)}
              className="p-1 rounded hover:bg-white/10 dark:text-text-dark light:text-text-light"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

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
                  value={selectedNode.label}
                  onChange={(e) => {
                    setFlow(prev => ({
                      ...prev,
                      nodes: prev.nodes.map(n =>
                        n.id === selectedNode.id ? { ...n, label: e.target.value } : n
                      ),
                      updatedAt: Date.now(),
                    }));
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
                              <div key={key} className="flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted mb-0.5">{key}</div>
                                  <input type="text" value={String(value)}
                                    onChange={e => updateNodeConfig(selectedNode.id, key, e.target.value)}
                                    className="w-full px-2 py-1 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none"
                                  />
                                </div>
                                <button onClick={() => {
                                  setFlow(prev => ({
                                    ...prev,
                                    nodes: prev.nodes.map(n =>
                                      n.id === selectedNode.id
                                        ? { ...n, config: Object.fromEntries(Object.entries(n.config || {}).filter(([k]) => k !== key)) }
                                        : n
                                    ),
                                    updatedAt: Date.now(),
                                  }));
                                }} className="p-1 rounded hover:bg-white/10 text-red-400 mt-4">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
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
                  value={selectedNode.notes || ''}
                  onChange={(e) => {
                    setFlow(prev => ({
                      ...prev,
                      nodes: prev.nodes.map(n =>
                        n.id === selectedNode.id ? { ...n, notes: e.target.value } : n
                      ),
                      updatedAt: Date.now(),
                    }));
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
                  value={selectedEdge.label || ''}
                  onChange={(e) => {
                    setFlow(prev => ({
                      ...prev,
                      edges: prev.edges.map(ed =>
                        ed.id === selectedEdge.id ? { ...ed, label: e.target.value } : ed
                      ),
                      updatedAt: Date.now(),
                    }));
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
                  value={selectedEdge.condition || ''}
                  onChange={(e) => {
                    setFlow(prev => ({
                      ...prev,
                      edges: prev.edges.map(ed =>
                        ed.id === selectedEdge.id ? { ...ed, condition: e.target.value || undefined } : ed
                      ),
                      updatedAt: Date.now(),
                    }));
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
                  value={selectedEdge.dataMap ? JSON.stringify(selectedEdge.dataMap, null, 2) : ''}
                  onChange={(e) => {
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
                  rows={4}
                  className="w-full px-2 py-1.5 rounded border dark:border-border-dark light:border-border-light bg-transparent text-xs dark:text-text-dark light:text-text-light focus:border-primary outline-none resize-none font-mono"
                  placeholder='{"failed_targets": "input_targets"}'
                />
              </div>

              <button
                onClick={() => deleteEdge(selectedEdge.id)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除连线
              </button>
            </div>
          ) : (
            /* 空状态 */
            <div>
              <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted">
                选择一个节点或连线以编辑属性
              </p>

              {/* 统计信息 */}
              <div className="mt-6 space-y-3">
                <h4 className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted uppercase tracking-wide">
                  流程统计
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
                    <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{flow.nodes.length}</div>
                    <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">节点</div>
                  </div>
                  <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
                    <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{flow.edges.length}</div>
                    <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">连线</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右侧遮罩（窄屏抽屉打开时） */}
      {showRightPanel && (
        <div
          className="lg:hidden absolute inset-0 z-20 bg-black/30"
          onClick={() => setShowRightPanel(false)}
        />
      )}
      </div>
      </DndContext>

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
                        · {draft.flow.nodes.length} 节点 · {draft.flow.edges.length} 连线
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
            <p className="text-sm opacity-60 mb-4">是否保存当前草稿？</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { saveDraft(); navigate('/'); }} className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90">保存并退出</button>
              <button onClick={() => navigate('/')} className="px-4 py-2 text-sm rounded-lg border border-red-400 text-red-400 hover:bg-red-400/10">丢弃</button>
              <button onClick={() => setExitModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 辅助函数：计算箭头位置 =====
function getArrowPos(edge: FlowEdgeDef, nodes: FlowNodeDef[]): string {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  if (!fromNode || !toNode) return '0,0';
  const fx = fromNode.position.x + NODE_W / 2;
  const fy = fromNode.position.y + 24;
  const tx = toNode.position.x + NODE_W / 2;
  const ty = toNode.position.y + 24;
  const t = 0.5;
  const x = fx + (tx - fx) * t;
  const y = fy + (ty - fy) * t;
  const angle = Math.atan2(ty - fy, tx - fx) * 180 / Math.PI;
  return `${x},${y} rotate(${angle})`;
}

// ===== 辅助函数：计算标签位置 =====
function getLabelPos(edge: FlowEdgeDef, nodes: FlowNodeDef[]): { x: number; y: number } {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  if (!fromNode || !toNode) return { x: 0, y: 0 };
  const fx = fromNode.position.x + NODE_W / 2;
  const fy = fromNode.position.y + 24;
  const tx = toNode.position.x + NODE_W / 2;
  const ty = toNode.position.y + 24;
  return { x: (fx + tx) / 2, y: (fy + ty) / 2 - 10 };
}

/** 将一条直线段按 spacing 间距采样为多段折线的 path d 属性，供 marker-mid 使用 */
function sampleEdgeToPolyline(
  from: { x: number; y: number },
  to: { x: number; y: number },
  spacing: number = 16  // 1rem ≈ 16px
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < spacing) return `M${from.x},${from.y} L${to.x},${to.y}`;
  const steps = Math.max(2, Math.round(dist / spacing));
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + dx * t;
    const py = from.y + dy * t;
    parts.push(i === 0 ? `M${px},${py}` : `L${px},${py}`);
  }
  return parts.join(' ');
}

/** 获取连线两端中心点（与 getArrowPos / getLabelPos 对齐） */
function getEdgeEndpoints(edge: FlowEdgeDef, nodes: FlowNodeDef[]) {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  if (!fromNode || !toNode) return null;
  return {
    from: { x: fromNode.position.x + NODE_W / 2, y: fromNode.position.y + 24 },
    to:   { x: toNode.position.x + NODE_W / 2,   y: toNode.position.y + 24 },
  };
}

// ===== DraggableFlowNode 子组件：封装 dnd-kit useDraggable =====
interface DraggableFlowNodeProps {
  node: FlowNodeDef;
  isSelected: boolean;
  isConnectSource: boolean;
  isDragging: boolean;
  isColliding: boolean;
  onClick: () => void;
  onStartConnecting: () => void;
  onDelete: () => void;
}

function DraggableFlowNode({
  node,
  isSelected,
  isConnectSource,
  isDragging,
  isColliding,
  onClick,
  onStartConnecting,
  onDelete,
}: DraggableFlowNodeProps) {
  const meta = NODE_TYPE_REGISTRY.find(m => m.type === node.type);
  const { attributes, listeners, setNodeRef, transform, isDragging: dndDragging } = useDraggable({
    id: node.id,
    data: { node },
  });

  // 拖拽时应用 CSS transform（跟随手指/鼠标）
  const style: React.CSSProperties = {
    position: 'absolute',
    left: node.position.x,
    top: node.position.y,
    width: NODE_W,
    zIndex: isDragging ? 20 : (isSelected ? 10 : 1),
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    opacity: dndDragging ? 0.9 : 1,
    // 禁用 transform 动画，拖拽响应更跟手
    transition: dndDragging ? 'none' : undefined,
    // 阻止浏览器默认 touch 行为（如滚动），确保 dnd-kit 接管拖拽
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
      className={`select-none ${shakeClass}`}
    >
      <div
        className={`rounded-lg border-2 p-2.5 sm:p-3 transition-all cursor-pointer ${borderColor} dark:bg-bg-dark-2 light:bg-white`}
        onClick={(e) => {
          // 仅在未拖拽时触发 click（dnd-kit 的 listeners 已处理拖拽）
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
      className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-xs text-left transition-colors
        hover:bg-white/5 dark:text-text-dark light:text-text-light active:scale-[0.98]
        ${isDragging ? 'opacity-40' : ''}`}
      title={meta.description}
      style={{ touchAction: 'none' }}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.color }}
      />
      <span className="truncate">{meta.label}</span>
    </button>
  );
}
