// D&D DSL 可视化流程图编辑器 —— 在画布上拖拽节点、连线、配置属性，编排法术/机制的流程编码
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useFlowEditorToast } from './flow-editor/useFlowEditorToast';
import { useFlowValidation } from './flow-editor/hooks/useFlowValidation';
import { useAutoFix } from './flow-editor/hooks/useAutoFix';
import { useDragEffects } from './flow-editor/hooks/useDragEffects';
import { useNodeSizeMeasurement } from './flow-editor/hooks/useNodeSizeMeasurement';
import { useFlowStatistics } from './flow-editor/hooks/useFlowStatistics';
import { FlowEditorToolbar } from '../components/flow-editor/FlowEditorToolbar';
import { FlowEditorFunctionBar } from '../components/flow-editor/FlowEditorFunctionBar';
import { FlowNodePalette } from './flow-editor/components/FlowNodePalette';
import { FlowCanvasArea } from './flow-editor/components/FlowCanvasArea';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  DragOverlay,
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
  ConfigFieldSchema,
} from '@/types/flow';
import { NODE_TYPE_REGISTRY, groupNodeTypesByCategory, validateFlow } from '@/types/flow';
import { NODE_CONFIG_SCHEMA, FlowNodeType } from '@/types/flow';
import {
  FLOW_CATEGORIES,
  parseFlowId,
  buildFlowId,
} from '@/types/flow';
import { NODE_W, NODE_H, CARD_NODE_W, CARD_NODE_H, SCALE_MIN, SCALE_MAX, SCALE_STEP } from './flow-editor/constants';
import { validateFlowWithDetails, validateForPublish, type ValidationError, getAutoFixSuggestions } from './flow-editor/validation';
import { resolveNodeIcon } from './flow-editor/nodeIcon';
import { nodesOverlap, findNonOverlappingPositionV2, setActiveSpatialGrid } from './flow-editor/collision';
import { getSmartEdgePath, getSmartArrowPos, getSmartLabelPos, getSmartEdgeDecoratedEndpoints, sampleSmartEdgeToPolyline } from './flow-editor/edgeConnection';
import DraggableFlowNode from './flow-editor/components/DraggableFlowNode';
import PaletteDragItem from './flow-editor/components/PaletteDragItem';
import NodeCardGhost from './flow-editor/components/NodeCardGhost';
import ExtraConfigField from './flow-editor/components/ExtraConfigField';
import SpellPicker from '@/components/SpellPicker';
import SpellPickerField from '@/components/SpellPickerField';
import { spellStore } from '@/data/spellStore';
import { resolveAutoChecksFromSpell } from '@/types/flow';
import { useSpellBinding } from './flow-editor/hooks/useSpellBinding';

import ConfigFieldRenderer from '@/components/ConfigFieldRenderer';
import SpellIdPicker from '@/components/SpellIdPicker';
import NodeListPanel from '@/components/NodeListPanel';
import { generateFlowId, validateFlowId } from '@/lib/idUtils';
import { SpatialGrid } from '@/utils/spatialGrid';







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
  // 流程 ID 草稿态（自由编辑，不触发保存）
  const [draftId, setDraftId] = useState(flow.id);
  const [idErrors, setIdErrors] = useState<string[]>([]);
  const [idDirty, setIdDirty] = useState(false);  // 草稿是否偏离正式值
  const [spellPickerOpen, setSpellPickerOpen] = useState(false);
  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);
  // 法术绑定状态已迁移至 useSpellBinding
  // flow.id 外部变更时同步草稿（如加载草稿、autosave 恢复）
  useEffect(() => {
    if (!idDirty) setDraftId(flow.id);
  }, [flow.id, idDirty]);

  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasTranslate, setCanvasTranslate] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const skipNameSync = useRef(true);
  
  // ===== 节点尺寸测量 =====
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { nodeSizes } = useNodeSizeMeasurement({
    nodes: flow.nodes,
    canvasScale,
  });

  // ===== 发布提示 toast =====
  const { toast, showToast } = useFlowEditorToast();

// ===== 法术绑定 Hook =====
  const spellBinding = useSpellBinding(flow, setFlow, showToast);
  
  // ===== 流程统计 Hook =====
  const statistics = useFlowStatistics(flow);
   
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

  // ===== 阻止浏览器默认双指缩放（React touch 事件是 passive 的，preventDefault 无效） =====
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
        distance: 3, // 5→3，更早激活
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,    // 250→150，触屏响应提速 100ms
        tolerance: 8,  // 5→8，允许更大手指抖动不取消
      },
    }),
  );

  // ===== 同步 flowName（跳过首次挂载，避免覆盖从 flowStore 恢复的名称） =====
  useEffect(() => {
    if (skipNameSync.current) {
      skipNameSync.current = false;
      return;
    }
    flowNameInput.setExternal(flow.name);
  }, [flow.name]);

  // ===== 自动保存（防抖 500ms，防止刷新丢失当前编辑） =====
  useEffect(() => {
    const timer = setTimeout(() => {
      // 始终用 flow.id 做主键，而非路由参数；save 为 upsert，新建流程也会入库
      flowStore.save(flow);
    }, 500);
    return () => clearTimeout(timer);
  }, [flow, flowNameInput.text]);



  // ===== 草稿列表：订阅 flowStore 变更，保持下拉框数据同步 =====
  useEffect(() => {
    const refresh = () => setDrafts(flowStore.getAll());
    refresh();
    return flowStore.subscribe(refresh);
  }, []);

  // ===== flow state 同步：监听 flowStore 变化，确保 React state 与 store 一致 =====
  useEffect(() => {
    const refreshFlow = () => {
      // 优先获取草稿数据
      const draft = flowStore.getDraft(flowId || flow.id);
      if (draft) {
        setFlow(draft.data);
        // 设置绑定的法术
        if (draft.data.spellId) {
          const spell = spellStore.getById(draft.data.spellId);
          if (spell) {
            spellBinding.setBoundSpell(spell);
          }
        } else {
          spellBinding.setBoundSpell(null);
        }
      } else {
        // 如果没有草稿，获取已发布版本
        const published = flowStore.getPublished(flowId || flow.id);
        if (published) {
          setFlow(published);
          // 设置绑定的法术
          if (published.spellId) {
            const spell = spellStore.getById(published.spellId);
            if (spell) {
              spellBinding.setBoundSpell(spell);
            }
          } else {
            spellBinding.setBoundSpell(null);
          }
        }
      }
    };
    
    refreshFlow();
    const unsub = flowStore.subscribe(refreshFlow);
    return () => unsub();
  }, [flowId, flow.id]);

  // ===== 位置快照：保存（画布滚动 + 缩放 + 面板展开状态，按流程 ID 持久化） =====
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

  // 视图状态 → ref（避免 useCallback 依赖抖动）
  useEffect(() => {
    viewportRef.current.scale = canvasScale;
    viewportRef.current.translateX = canvasTranslate.x;
    viewportRef.current.translateY = canvasTranslate.y;
    viewportRef.current.showLeftPanel = showLeftPanel;
    viewportRef.current.showRightPanel = showRightPanel;
  }, [canvasScale, canvasTranslate, showLeftPanel, showRightPanel]);

  // 滚动事件：实时记录 + 防抖保存
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

  // 缩放/面板状态变化：防抖保存
  useEffect(() => {
    scheduleViewportSave();
  }, [canvasScale, canvasTranslate, showLeftPanel, showRightPanel, scheduleViewportSave]);

  // 卸载 / 刷新前：立即保存
  useEffect(() => {
    const onUnload = () => saveViewport();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      saveViewport();
    };
  }, [saveViewport]);

  const scrollRestored = useRef(false);

  // ===== 位置快照：恢复（从 flowStore 快照） =====
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

  // ===== 添加节点（自动防重叠） =====
  /** 递归收集 schema 的默认值（含嵌套 object） */
  const collectSchemaDefaults = useCallback((fields: ConfigFieldSchema[]): Record<string, any> => {
    const defaults: Record<string, any> = {};
    for (const f of fields) {
      if (f.type === 'object' && f.children) {
        const childDefaults = collectSchemaDefaults(f.children);
        defaults[f.key] = Object.keys(childDefaults).length > 0 ? childDefaults : (f.defaultValue ?? {});
      } else {
        // 为所有字段提供默认值，防止 undefined
        if (f.defaultValue !== undefined) {
          defaults[f.key] = f.defaultValue;
        } else {
          switch (f.type) {
            case 'boolean':
              defaults[f.key] = false;
              break;
            case 'number':
              defaults[f.key] = 0;
              break;
            case 'text':
            case 'dice':
            case 'template':
              defaults[f.key] = '';
              break;
            case 'select':
              defaults[f.key] = f.options?.[0]?.value || null;
              break;
            case 'spellPicker':
              defaults[f.key] = null;
              break;
            default:
              defaults[f.key] = null;
          }
        }
      }
    }
    return defaults;
  }, []);

  const addNode = useCallback((typeMeta: NodeTypeMeta, position: { x: number; y: number }) => {
    const id = `${typeMeta.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    // 从 Schema 合并默认值（Schema 优先，兜底 defaultConfig）
    const schemaDefaults = collectSchemaDefaults(NODE_CONFIG_SCHEMA[typeMeta.type] ?? []);
    const newNode: FlowNodeDef = {
      id, type: typeMeta.type, label: typeMeta.label,
      position: { x: position.x, y: position.y },
      config: { ...typeMeta.defaultConfig, ...schemaDefaults },
    };
    // 新节点防重叠放置（智能退避 + 空间索引）
    const finalPos = findNonOverlappingPositionV2(newNode, flow.nodes, NODE_W, NODE_H, dragEffects.spatialGridRef.current, canvasScale);
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
      
      // 同步到 flowStore（单一真相源）
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

  // ===== 更新节点位置（拖拽后应用 delta + 碰撞检测） =====
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
      const finalPos = findNonOverlappingPositionV2(testNode, others, NODE_W, NODE_H, dragEffects.spatialGridRef.current, canvasScale);
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

  // ===== 验证逻辑（已迁移至 useFlowValidation Hook） =====
  const validation = useFlowValidation(flow);

  // ===== 自动修复逻辑（已迁移至 useAutoFix Hook） =====
  const autoFix = useAutoFix(flow);

  // ===== 拖拽效果（已迁移至 useDragEffects Hook） =====
  const dragEffects = useDragEffects({
    flow,
    canvasScale,
    canvasTranslate,
    addNode,
    updateNodePositionByDelta,
  });

  // ===== 加载草稿 =====
  const loadDraft = useCallback((draft: FlowDefinition) => {
    setFlow(draft);
    flowNameInput.setExternal(draft.name);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowDrafts(false);
  }, []);

  // ===== 删除草稿 =====
  const deleteDraft = useCallback((draftId: string) => {
    flowStore.delete(draftId);
    setDrafts(flowStore.getAll());
  }, []);

  // ===== 清空画布 =====
  const clearCanvas = useCallback(() => {
    if (confirm('确定要清空当前画布吗？所有节点和连线将被删除。')) {
      setFlow(createEmptyFlow());
      flowNameInput.setExternal('未命名流程');
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, []);

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

  // ===== 发布正式版 =====
  const handlePublish = useCallback(async () => {
    // 发布前先检查校验
    const publishValidation = validateForPublish(flow);
    if (!publishValidation.valid) {
      // 显示错误提示
      showToast('error', `无法发布：${publishValidation.error}`);
      
      // 如果有建议，显示提示
      if (publishValidation.suggestions && publishValidation.suggestions.length > 0) {
        console.log('发布建议：', publishValidation.suggestions.join('；'));
      }
      
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
        
        // 发布成功后隐藏验证面板
        validation.setShowValidation(false);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '发布失败');
    }
  }, [flow, showToast, validation]);

  // ===== 获取选中节点 =====
  const selectedNode = flow.nodes.find(n => n.id === selectedNodeId) || null;
  const selectedEdge = flow.edges.find(e => e.id === selectedEdgeId) || null;

  // ===== 受控输入（useTextInput：输入态字符串与业务值分离，外部值变化时自动同步） =====
  const nodeLabelInput = useTextInput(selectedNode?.label ?? '');
  const nodeNotesInput = useTextInput(selectedNode?.notes ?? '');
  const edgeLabelInput = useTextInput(selectedEdge?.label ?? '');
  const edgeConditionInput = useTextInput(selectedEdge?.condition ?? '');
  const edgeDataMapInput = useTextInput(
    selectedEdge?.dataMap ? JSON.stringify(selectedEdge.dataMap, null, 2) : ''
  );

  // ===== 计算 SVG 连线路径 =====
  function getEdgePath(edge: FlowEdgeDef): string | null {
    return getSmartEdgePath(edge, flow.nodes, nodeSizes);
  }

  // ===== 节点分类面板 =====
  const nodeGroups = groupNodeTypesByCategory();

  // ===== 渲染 =====
  return (
    <div className="h-[calc(100vh-64px)] flex flex-col dark:bg-bg-dark light:bg-bg-light relative">
      {/* 自定义样式卡片节点 */}
      <style>{`
        @media (max-width: 1024px) {
          .node-card-container {
            -webkit-overflow-scrolling: touch;
            scroll-behavior: smooth;
            padding-right: 20px;
          }
          
          .node-card {
            flex-direction: row !important;
            justify-content: flex-start !important;
            align-items: center !important;
            width: auto !important;
            min-width: 100px !important;
            max-width: 300px !important;
            height: 44px !important;
            padding: 0.625rem 0.75rem !important;
            gap: 0.5rem !important;
          }
          
          .node-card span:first-child {
            width: 0.75rem !important;
            height: 0.75rem !important;
            margin-bottom: 0 !important;
            margin-right: 0.25rem !important;
          }
          
          .node-card span:last-child {
            flex: 1 !important;
            min-width: 0 !important;
            text-align: left !important;
          }
        }
        
        @media (hover: none) {
          .node-card:hover {
            transform: none;
            box-shadow: none;
          }
        }
        
        .flow-node-card {
          will-change: transform;        /* 提示浏览器提前提升为合成层 */
          contain: layout style paint;   /* 限制重排范围 */
        }
        
        .flow-node-card.animate-move {
          transition: transform 300ms cubic-bezier(0.2, 0, 0, 1);  /* ease-out 曲线，结束不突兀 */
        }
      `}</style>
      <FlowEditorToolbar
  flowName={flow.name}
  flowStatus={flow.status}
  saveStatus={saveStatus}
  validationStatus={validation.validationStatus}
  onExit={() => setExitModalOpen(true)}
  onPublish={handlePublish}
  onSaveDraft={saveDraft}
  onFlowNameChange={(value) => flowNameInput.onChange(value)}
  onFlowNameBlur={flowNameInput.onBlur}
/>

      <FlowEditorFunctionBar
  showLeftPanel={showLeftPanel}
  onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
  validation={validation}
  showDrafts={showDrafts}
  onToggleDrafts={() => setShowDrafts(!showDrafts)}
  drafts={drafts}
  canvasScale={canvasScale}
  onScaleChange={setCanvasScale}
  onResetZoom={() => { setCanvasScale(1); setCanvasTranslate({ x: 0, y: 0 }); }}
  onClearCanvas={clearCanvas}
  showRightPanel={showRightPanel}
  onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}
  scaleMin={SCALE_MIN}
  scaleMax={SCALE_MAX}
  scaleStep={SCALE_STEP}
/>

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
        onDragStart={dragEffects.handleDragStart}
        onDragMove={dragEffects.handleDragMove}
        onDragEnd={dragEffects.handleDragEnd}
      >
        <div className="flex-1 flex overflow-hidden relative">
          <FlowNodePalette
          showLeftPanel={showLeftPanel}
          onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
          nodeGroups={nodeGroups}
          isDark={false}
        />

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
            style={{ touchAction: 'manipulation' }}
            onWheel={handleCanvasWheel}
            onTouchStart={handleTouchStart}
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
            {/* 画布区域 */}
            <FlowCanvasArea
              flow={flow}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              connectFromId={connectFromId}
              dragEffects={dragEffects}
              canvasScale={canvasScale}
              nodeSizes={nodeSizes}
              isDark={isDark}
              onNodeClick={handleNodeClick}
              onCanvasClick={handleCanvasClick}
              onStartConnecting={startConnecting}
              onDeleteNode={deleteNode}
              onRefSet={(nodeId, ref) => {
                if (ref) {
                  nodeRefs.current.set(nodeId, ref);
                } else {
                  nodeRefs.current.delete(nodeId);
                }
              }}
              validation={validation}
            />
          </div>
        </div>
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
                validation.validationStatus === 'valid'
            ? 'border-green-500/20 bg-green-500/5' 
            : 'border-red-500/20 bg-red-500/5'
        }`}>
          <div className="flex items-center gap-2 mb-2">
                  {validation.validationStatus === 'valid' ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">可以发布</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">
                   无法发布（{validation.validationErrors.length} 个错误）
                </span>
              </>
            )}
            <button 
              onClick={() => validation.setShowValidation(!validation.showValidation)}
              className="ml-auto text-xs text-gray-400 hover:text-gray-200"
            >
               {validation.showValidation ? '隐藏' : '显示'}详情
            </button>
            {autoFix.hasSuggestions && (
              <button 
                onClick={autoFix.handleAutoFix}
                className="ml-2 text-xs text-blue-400 hover:text-blue-200"
                disabled={autoFix.isFixing}
              >
                自动修复 ({autoFix.suggestionCount})
              </button>
            )}
          </div>
          
           {validation.showValidation && validation.validationErrors.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
               {validation.validationErrors.map((error, index) => {
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
          validation.validationStatus === 'valid'
                  ? 'border-green-500/20 bg-green-500/5' 
                  : 'border-red-500/20 bg-red-500/5'
              }`}>
                <div className="flex items-center gap-2 mb-2">
            {validation.validationStatus === 'valid' ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-green-400">流程可以发布</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">
                        流程无法发布（{validation.validationErrors.length} 个错误）
                      </span>
                    </>
                  )}
                </div>
                {validation.validationErrors.length > 0 && (
                  <div className="text-xs text-red-300">
                     主要问题：{validation.validationErrors[0].message}
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
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除连线
              </button>
            </div>
          ) : (
            <div>
              {/* ===== 流程类别 ===== */}
              <div className="mb-4">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">
                  流程类别
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {FLOW_CATEGORIES.map(cat => {
                    const { category: currentCat } = parseFlowId(flow.id);
                    const isActive = currentCat === cat.value;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => {
                          const { slug } = parseFlowId(flow.id);
                          const newId = buildFlowId(cat.value, slug);
                          if (newId !== flow.id && flowId) {
                            const result = flowStore.retargetId(flowId, newId);
                            if (result) {
                              setFlow(result);
                              navigate(`/flow-editor/${newId}`, { replace: true });
                            } else {
                              alert('ID 冲突，该类别+标识符已被占用');
                            }
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                          ${isActive
                            ? 'bg-primary text-white'
                            : 'border dark:border-border-dark light:border-border-light dark:text-text-dark light:text-text-light hover:border-primary/40'
                          }`}
                        title={cat.desc}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ===== 法术绑定 ===== */}
              <div className="mb-4">
                <label className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted block mb-1.5">
                  绑定法术
                </label>
                <SpellPickerField
                  value={flow.spellId || ''}
                  onChange={(spellId) => {
                    if (spellId) {
                      spellBinding.handleBindSpell(spellId);
                    } else {
                      spellBinding.handleUnbindSpell();
                    }
                  }}
                  placeholder="选择要施放的法术"
                  isDark={isDark}
                />
                {spellBinding.boundSpell && (
                  <div className="mt-2 text-xs text-gray-500">
                    已选择：{spellBinding.boundSpellName} (Lv.{spellBinding.boundSpellLevel} {spellBinding.boundSpellSchool})
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
                  </div>
                  <div className="rounded-lg border dark:border-border-dark light:border-border-light p-2.5 text-center">
                    <div className="text-lg font-semibold dark:text-text-dark light:text-text-light">{flow.edges.length}</div>
                    <div className="text-[10px] dark:text-text-dark-muted light:text-text-light-muted">连线</div>
                  </div>
                </div>
                
                {/* 节点列表组件 */}
                 <NodeListPanel 
                   flow={flow}
                   statistics={statistics}
                   onNodeSelect={(nodeId) => {
                     setSelectedNodeId(nodeId);
                     setSelectedEdgeId(null);
                     // 可选：滚动到对应节点位置
                     const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
                     if (nodeElement) {
                       nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     }
                   }}
                   onNodeEdit={(nodeId) => {
                     // 编辑节点：选中并显示右侧栏
                     setSelectedNodeId(nodeId);
                     setSelectedEdgeId(null);
                     // 确保右侧栏显示
                     setShowRightPanel(true);
                     // 窄屏下可能需要滚动到右侧栏
                     const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
                     if (nodeElement) {
                       nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     }
                   }}
                   onNodeFocus={(nodeId) => {
                     // 跳转到节点：移动画布视图使该节点处于画布窗口正中央
                     const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
                     if (nodeElement && canvasRef.current) {
                       const canvasRect = canvasRef.current.getBoundingClientRect();
                       const nodeRect = nodeElement.getBoundingClientRect();
                       
                       // 获取节点的实际位置（考虑画布变换）
                       const canvasTransform = canvasRef.current.querySelector('.relative');
                       if (canvasTransform) {
                         const transformStyle = window.getComputedStyle(canvasTransform);
                         const transform = transformStyle.transform;
                         
                         // 解析 transform 矩阵获取缩放和平移信息
                         let scaleX = 1, scaleY = 1, translateX = 0, translateY = 0;
                         if (transform && transform !== 'none') {
                           const matrix = new DOMMatrix(transform);
                           scaleX = matrix.a;
                           scaleY = matrix.d;
                           translateX = matrix.e;
                           translateY = matrix.f;
                         }
                         
                         // 计算节点在画布中的实际坐标（考虑缩放和平移）
                         const nodeCanvasX = nodeRect.left - canvasRect.left - translateX;
                         const nodeCanvasY = nodeRect.top - canvasRect.top - translateY;
                         
                         // 计算滚动位置，使节点居中（考虑缩放后的节点大小）
                         const scaledNodeWidth = nodeRect.width * scaleX;
                         const scaledNodeHeight = nodeRect.height * scaleY;
                         
                         const scrollLeft = nodeCanvasX - canvasRect.width / 2 + scaledNodeWidth / 2;
                         const scrollTop = nodeCanvasY - canvasRect.height / 2 + scaledNodeHeight / 2;
                         
                         // 确保滚动位置在有效范围内
                         const maxScrollLeft = canvasRef.current.scrollWidth - canvasRect.width;
                         const maxScrollTop = canvasRef.current.scrollHeight - canvasRect.height;
                         
                         canvasRef.current.scrollTo({
                           left: Math.max(0, Math.min(scrollLeft, maxScrollLeft)),
                           top: Math.max(0, Math.min(scrollTop, maxScrollTop)),
                           behavior: 'smooth'
                         });
                       }
                     }
                     
                     // 窄屏下收起右侧栏
                     if (window.innerWidth < 1024) {
                       setShowRightPanel(false);
                     }
                   }}
onNodeDelete={(nodeId) => {
                     deleteNode(nodeId);
                   }}
                 />
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
        <DragOverlay dropAnimation={null}>
          {dragEffects.crossLayerDrag.meta && dragEffects.crossLayerDrag.fingerPos && (
            <div
              className="pointer-events-none fixed z-50"
              style={{
                left: dragEffects.crossLayerDrag.fingerPos.x - CARD_NODE_W / 2,
                top: dragEffects.crossLayerDrag.fingerPos.y - CARD_NODE_H / 2,
                width: CARD_NODE_W,
                height: CARD_NODE_H,
                transform: 'scale(1.05)',
                opacity: dragEffects.crossLayerDrag.phase === 'crossing' ? 0.7 : 0.9,
                transition: 'opacity 150ms ease',
              }}
            >
              <NodeCardGhost meta={dragEffects.crossLayerDrag.meta} />
            </div>
          )}
        </DragOverlay>
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
            <p className="text-sm opacity-60 mb-4">是否保存当前草稿？</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => { saveDraft(); navigate('/'); }} className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90">保存并退出</button>
              <button onClick={() => navigate('/')} className="px-4 py-2 text-sm rounded-lg border border-red-400 text-red-400 hover:bg-red-400/10">丢弃</button>
              <button onClick={() => setExitModalOpen(false)} className="px-4 py-2 text-sm rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5">取消</button>
            </div>
          </div>
        </div>
      )}

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
      {spellBinding.showSpellPicker && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-xl p-6 max-w-2xl w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium dark:text-text-dark light:text-text-light">选择法术</h3>
              <button onClick={() => spellBinding.setShowSpellPicker(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {spellStore.getAll().map(spell => (
                <div
                  key={spell.id}
                  className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:bg-primary/5 cursor-pointer transition-colors"
                  onClick={() => spellBinding.handleBindSpell(spell.id)}
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


    </div>
  );
}

/** 将一条直线段按 spacing 间距采样为多段折线的 path d 属性，供 marker-mid 使用 */
function sampleEdgeToPolyline(
  from: { x: number; y: number },
  to: { x: number; y: number },
  spacing: number = 16  // 1rem ≈ 16px
): string {
  // 临时创建 EdgeEndpoint 对象以匹配 sampleSmartEdgeToPolyline 的签名
  const fromWithSide: any = { ...from, side: 'bottom' as any };
  const toWithSide: any = { ...to, side: 'top' as any };
  return sampleSmartEdgeToPolyline(fromWithSide, toWithSide, spacing);
}








