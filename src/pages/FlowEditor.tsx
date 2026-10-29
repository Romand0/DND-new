import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';

// 防抖函数
function debounce(func: Function, wait: number) {
  let timeout: number;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as unknown as number;
  };
}
import { useFlowEditorToast } from '@/components/flow-editor/hooks/use-flow-editor-toast';
import { useFlowValidation } from '@/components/flow-editor/hooks/use-flow-validation';
import { useAutoFix } from '@/components/flow-editor/hooks/use-auto-fix';
import { useFlowStatistics } from '@/components/flow-editor/hooks/use-flow-statistics';
import { FlowPropertiesHeader } from '@/components/flow-editor/presentation/properties/FlowPropertiesHeader';
import FlowPropertiesCategories from '@/components/flow-editor/presentation/properties/FlowPropertiesCategories';
import FlowPropertiesSpellBinding from '@/components/flow-editor/presentation/properties/FlowPropertiesSpellBinding';
import FlowPropertiesNodeEditor from '@/components/flow-editor/presentation/properties/FlowPropertiesNodeEditor';
import FlowPropertiesStatistics from '@/components/flow-editor/presentation/properties/FlowPropertiesStatistics';
import EdgePropertiesPanel from '@/components/flow-editor/presentation/properties/EdgePropertiesPanel';
import { FlowNodePalette } from '@/components/flow-editor/presentation/nodes/FlowNodePalette';
import FlowTopologyEditorCanvas from '@/components/flow-editor/presentation/canvas/FlowTopologyEditorCanvas';
import { FlowEditorToolbar } from '@/components/flow-editor/FlowEditorToolbar';
import { FlowEditorFunctionBar } from '@/components/flow-editor/FlowEditorFunctionBar';
import SpellPicker from '@/components/SpellPicker';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle,
  Loader2, GitBranch, Zap,
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
import { groupNodeTypesByCategory, parseFlowId } from '@/types/flow';
import { tidyFlowLayout, layoutTopology } from '@/utils/flow-editor/topology-layout';
import { NODE_CONFIG_SCHEMA, isConfigFieldVisible } from '@/types/flow';
import { insertNodeAfter, appendIsolatedNode, moveNodeWithinRank, canInsertAfter } from '@/utils/flow-editor/topology-edit';
// FLOW_CATEGORIES, parseFlowId, buildFlowId 已移至 FlowPropertiesCategories 组件
import { SCALE_MIN, SCALE_MAX, SCALE_STEP } from '@/utils/flow-editor/constants';
import { useSpellBinding } from '@/components/flow-editor/hooks/use-spell-binding';
import { createBlankFlow } from '@/data/flowFactory';

/** 新建流程的占位路由 ID：此时流程只存在于编辑器内存中 */
const NEW_FLOW_ID = 'new';







/** 加载完成前的空占位流程：保证组件内所有 Hook 无条件执行、顺序恒定 */
const EMPTY_FLOW: FlowDefinition = {
  id: '',
  name: '',
  description: '',
  nodes: [],
  edges: [],
  tags: [],
  version: 1,
  status: 'draft',
  createdAt: 0,
  updatedAt: 0,
};

export default function FlowEditor() {
  const { id: flowId } = useParams<{ id: string }>();

  // ===== 主题感知 =====
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // ===== 状态 =====
  // flow 恒非 null：加载完成前用 EMPTY_FLOW 占位。
  // 若在此处返回 spinner 会切断其后的 Hook 链，导致二次渲染 Hook 数量不一致而崩溃。
  const [flowState, setFlowState] = useState<{ flow: FlowDefinition; loaded: boolean }>({
    flow: EMPTY_FLOW,
    loaded: false,
  });
  const flow = flowState.flow;
  const flowLoaded = flowState.loaded;
  // 编辑器操作更新（保持 loaded 不变）
  // 每次结构变更后按拓扑重算坐标：编辑态坐标恒为派生值，落盘也保持整洁
  const setFlow = useCallback((updater: FlowDefinition | ((prev: FlowDefinition) => FlowDefinition)) => {
    setFlowState(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: FlowDefinition) => FlowDefinition)(prev.flow)
        : updater;
      return { flow: tidyFlowLayout(next), loaded: prev.loaded };
    });
  }, []);
  // 数据加载完成（置 loaded，结束占位）
  const setLoadedFlow = useCallback((f: FlowDefinition) => {
    setFlowState({ flow: f, loaded: true });
  }, []);
  // ===== 编辑会话不落本地：编辑器 state 是唯一真相源 =====
  // 只有「发布」会把内容写入云端并同步本地镜像；退出未发布则改动丢弃。
  const flowRef = useRef<FlowDefinition | null>(null);

  // ===== 未发布改动检测 =====
  // 编辑态不落盘，需要靠内容签名判断「与加载时相比是否改过」
  const baselineRef = useRef('');
  // 基线法术绑定：只有用户真的改过绑定才同步云端，避免「镜像无 spellId」误清空已有绑定
  const baselineSpellIdRef = useRef<string | undefined>(undefined);
  const flowSignature = useCallback((f: FlowDefinition) => JSON.stringify({
    name: f.name,
    description: f.description ?? '',
    tags: f.tags ?? [],
    nodes: f.nodes,
    edges: f.edges,
    spellId: f.spellId ?? null,
  }), []);
  const isDirty = flowLoaded && baselineRef.current !== '' && baselineRef.current !== flowSignature(flow);
  
  // 初始化加载流程数据（只读镜像；镜像缺失时从云端取正式版）
  useEffect(() => {
    if (!flowId) return;

    // 切换流程时重置基线：脏检测与绑定同步都以「本次加载的内容」为准
    baselineRef.current = '';
    baselineSpellIdRef.current = undefined;

    // 新建流程：只存在于编辑器内存，publish 之后才产生云端记录
    if (flowId === NEW_FLOW_ID) {
      const blank = createBlankFlow();
      setLoadedFlow(blank);
      flowRef.current = blank;
      flowNameInput.setExternal(blank.name);
      return;
    }

    const loaded = flowStore.getById(flowId);
    if (loaded) {
      // 编辑态坐标全部由拓扑派生，落盘坐标仅作兼容：加载时统一归一化
      const normalized = tidyFlowLayout(loaded);
      setLoadedFlow(normalized);
      flowRef.current = normalized;
      flowNameInput.setExternal(normalized.name);
    } else {
      // 镜像里没有，尝试从云端取正式版
      (async () => {
        try {
          await flowStore.fetchRemote();
          const remote = flowStore.getById(flowId);
          if (remote) {
            const normalized = tidyFlowLayout(remote);
            setLoadedFlow(normalized);
            flowRef.current = normalized;
            flowNameInput.setExternal(normalized.name);
          } else {
            // 确实不存在，回退列表页
            navigate('/flows', { replace: true });
          }
        } catch {
          navigate('/flows', { replace: true });
        }
      })();
    }
  }, [flowId]);
  
  // flowRef 同步
  useEffect(() => { flowRef.current = flow; });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // 从左侧环节库添加节点时的插入锚点（卡片「后插」按钮设置）
  const [insertAnchorId, setInsertAnchorId] = useState<string | null>(null);
  
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [connectTrigger, setConnectTrigger] = useState<string>('on_complete');

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
  
  // ===== 草稿编辑会话：自动保存状态 =====
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
  const skipNameSync = useRef(true);
  
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

  // ===== 同步 flowName（跳过首次挂载，避免覆盖从 flowStore 恢复的名称） =====
  useEffect(() => {
    if (skipNameSync.current) {
      skipNameSync.current = false;
      return;
    }
    flowNameInput.setExternal(flow.name);
  }, [flow.name]);



  // 编辑态不自动落盘：没有草稿可恢复，退出即丢弃未发布改动。



  // ===== 缓存同步状态 =====
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');


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
      showLeftPanel: showLeftPanel,
      showRightPanel: showRightPanel,
      timestamp: Date.now(),
    } as any);
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
      // 编辑态画布不做自由平移，恢复视图时只还原缩放与滚动位置
      setCanvasTranslate({ x: 0, y: 0 });
      setShowLeftPanel(snapshot.showLeftPanel);
      setShowRightPanel(snapshot.showRightPanel);
      canvas.scrollLeft = snapshot.scrollX;
      canvas.scrollTop  = snapshot.scrollY;
    }
  }, [flowId]);

  // ===== 添加节点（自动防重叠） =====
  /** 递归收集 schema 的默认值（含嵌套 object）；按已收集值跳过当前不可见字段 */
  const collectSchemaDefaults = useCallback((fields: ConfigFieldSchema[], current: Record<string, any> = {}): Record<string, any> => {
    const defaults: Record<string, any> = {};
    // 本地副本：可见性判断需要边收集边读取，但不修改调用方传入的 config
    const evaluated = { ...current };
    for (const f of fields) {
      if (!isConfigFieldVisible(f, evaluated)) continue;
      if (f.type === 'object' && f.children) {
        const childDefaults = collectSchemaDefaults(f.children, evaluated[f.key] ?? {});
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
      evaluated[f.key] = defaults[f.key];
    }
    return defaults;
  }, []);

  /** 构造新节点：Schema 默认值优先，defaultConfig 兜底 */
  const buildNewNode = useCallback((typeMeta: NodeTypeMeta): FlowNodeDef => {
    const id = `${typeMeta.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const schemaDefaults = collectSchemaDefaults(
      NODE_CONFIG_SCHEMA[typeMeta.type] ?? [],
      { ...(typeMeta.defaultConfig ?? {}) },
    );
    return {
      id,
      type: typeMeta.type,
      label: typeMeta.label,
      config: { ...typeMeta.defaultConfig, ...schemaDefaults },
    };
  }, [collectSchemaDefaults]);

  // ===== 添加节点：有插入锚点时插到锚点之后，否则追加为孤立节点 =====
  const addNode = useCallback((typeMeta: NodeTypeMeta) => {
    const newNode = buildNewNode(typeMeta);
    // 显式「后插」优先，否则以当前选中节点作为锚点
    const candidate = insertAnchorId ?? selectedNodeId;
    const anchorId = candidate && flow.nodes.some(n => n.id === candidate) ? candidate : null;

    if (anchorId && !canInsertAfter(flow, anchorId)) {
      // 分支节点的出边多于一条，无法判断插入位置：改为孤立节点并提示手动连接
      setFlow(prev => appendIsolatedNode(prev, newNode));
      showToast('info', '该节点有多个分支，已追加为独立环节，请手动连接');
    } else {
      setFlow(prev => (
        anchorId ? insertNodeAfter(prev, anchorId, newNode) : appendIsolatedNode(prev, newNode)
      ));
    }
    setInsertAnchorId(null);
    setSelectedNodeId(newNode.id);
    setSelectedEdgeId(null);
  }, [buildNewNode, insertAnchorId, selectedNodeId, flow, setFlow, showToast]);

  // ===== 卡片「后插」：选中该节点并等待从左侧环节库挑选类型 =====
  const beginInsertAfter = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setInsertAnchorId(nodeId);
    setShowLeftPanel(true);
  }, []);

  // ===== 层内左右移动 =====
  const moveWithinRank = useCallback((nodeId: string, direction: -1 | 1) => {
    setFlow(prev => moveNodeWithinRank(prev, nodeId, direction));
  }, []);


  // ===== 删除节点 =====
  const deleteNode = useCallback((nodeId: string) => {
    setFlow(prev => tidyFlowLayout({
      ...prev,
      nodes: prev.nodes.filter(n => n.id !== nodeId),
      edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
      updatedAt: Date.now(),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    if (insertAnchorId === nodeId) setInsertAnchorId(null);
  }, [selectedNodeId, insertAnchorId]);

  // ===== 更新节点配置 =====
  const updateNodeConfig = useCallback(debounce((nodeId: string, key: string, value: any) => {
    setFlow(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const config = { ...n.config, [key]: value };
        // 切换 effectType 等条件字段后，新出现的字段可能还没有默认值，按可见性补齐
        const defaults = collectSchemaDefaults(NODE_CONFIG_SCHEMA[n.type] ?? [], { ...config });
        for (const [k, v] of Object.entries(defaults)) {
          if (config[k] === undefined) config[k] = v;
        }
        return { ...n, config };
      }),
      updatedAt: Date.now(),
    }));
  }, 300), [collectSchemaDefaults]);

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
    setInsertAnchorId(null);
    setIsConnecting(false);
    setConnectFromId(null);
  }, []);

  // ===== 画布事件：节点点击（选择或连接） =====
  const handleNodeClick = useCallback((nodeId: string) => {
    if (isConnecting) {
      if (connectFromId && connectFromId !== nodeId) {
        addEdge(connectFromId, nodeId, connectTrigger);
      }
      // 再次点击源节点等同于取消连接
      setIsConnecting(false);
      setConnectFromId(null);
      return;
    }
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setInsertAnchorId(null);
  }, [isConnecting, connectFromId, connectTrigger, addEdge]);

  // ===== 开始连接模式 =====
  const startConnecting = useCallback((nodeId: string) => {
    setIsConnecting(true);
    setConnectFromId(nodeId);
    setSelectedNodeId(nodeId);
    setInsertAnchorId(null);
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

  // ===== 用云端正式版覆盖编辑器 =====
  // 编辑态不落盘，本地改动随时会被丢弃，因此覆盖前先确认
  const syncWithCache = useCallback(async () => {
    if (syncStatus === 'syncing' || !flowId || flowId === NEW_FLOW_ID) return;
    if (isDirty && !confirm('云端正式版会覆盖当前未发布的改动，确定继续吗？')) return;

    setSyncStatus('syncing');
    try {
      const remote = await flowStore.pullRemote(flowId);
      if (!remote) {
        showToast('error', '云端没有该流程的正式版');
        return;
      }
      const normalized = tidyFlowLayout(remote);
      setLoadedFlow(normalized);
      flowRef.current = normalized;
      flowNameInput.setExternal(normalized.name);
      baselineRef.current = flowSignature(normalized);
      baselineSpellIdRef.current = normalized.spellId;
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSyncStatus('synced');
      showToast('success', `已载入云端正式版 v${normalized.publishedVersion ?? 0}`);
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (error) {
      setSyncStatus('idle');
      showToast('error', error instanceof Error ? error.message : '同步失败');
    }
  }, [syncStatus, flowId, isDirty, setLoadedFlow, flowNameInput, flowSignature, showToast]);

  // ===== 清空画布 =====
  const clearCanvas = useCallback(() => {
    if (confirm('确定要清空当前画布吗？所有节点和连线将被删除（流程 ID 与名称保留）。')) {
      setFlow(prev => ({ ...prev, nodes: [], edges: [], updatedAt: Date.now() }));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  }, []);

  // ===== 保存 =====
  // 编辑态只在内存里，保存即发布到云端：写入正式版并同步本地镜像。
  const saveFlow = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const updatedFlow = tidyFlowLayout({
        ...flow,
        name: flowNameInput.value || flow.name,
        updatedAt: Date.now(),
      });

      const published = await flowStore.publish(updatedFlow);

      // 已发布流程改了 ID：新 ID 已落云端，旧 ID 随之删除，避免两条正式版并存
      const renamed = flowId !== NEW_FLOW_ID && !!flowId && published.id !== flowId;

      // 绑定关系依赖云端流程记录：改过绑定或换了 ID 才同步，避免误清空既有绑定
      const bindingChanged = (baselineSpellIdRef.current ?? '') !== (published.spellId ?? '');
      if (bindingChanged || renamed) {
        await spellBinding.syncBinding(published.id, published.spellId);
      }

      // 旧 ID 的云端行（含其绑定）在新 ID 落库后再清理
      if (renamed) {
        await flowStore.remove(flowId);
      }

      // 新建流程发布成功后，URL 从占位符切到真实 ID
      if (flowId === NEW_FLOW_ID || renamed) {
        navigate(`/flow-editor/${published.id}`, { replace: true });
      }

      baselineRef.current = flowSignature(published);
      baselineSpellIdRef.current = published.spellId;
      setFlow(published);
      flowNameInput.setExternal(published.name);
      setSaveStatus('saved');
      setSyncStatus('synced');
      validation.setShowValidation(false);
      showToast('success', `已发布 v${published.publishedVersion}`);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      showToast('error', err instanceof Error ? err.message : '保存失败');
      throw err;
    }
  }, [flow, flowNameInput, flowId, navigate, setFlow, showToast, spellBinding, flowSignature]);

  // ===== 整理布局：按拓扑分层重排（与查看模式同款布局），写回流程并随自动保存持久化 =====
  const handleTidyLayout = useCallback(() => {
    const source = flowRef.current ?? flow;
    if (source.nodes.length === 0) return;
    setFlow(tidyFlowLayout(source));
    showToast('success', '已按拓扑结构整理布局');
  }, [flow, setFlow, showToast]);

  // ===== 基线建立 + 未发布改动保护 =====
  // 加载完成后把当前内容记为基线；之后与基线不一致才拦截关闭
  useEffect(() => {
    if (!flowLoaded) return;
    if (baselineRef.current === '') {
      baselineRef.current = flowSignature(flow);
      baselineSpellIdRef.current = flow.spellId;
    }
  }, [flowLoaded, flow, flowSignature]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

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

  // ===== 画布内容尺寸：与拓扑派生布局保持一致，避免固定空白滚动区 =====
  const canvasSize = useMemo(() => {
    const layout = layoutTopology(flow);
    return { width: layout.width, height: layout.height };
  }, [flow]);

  // ===== 节点分类面板 =====
  const nodeGroups = groupNodeTypesByCategory();

  // 加载完成前渲染占位（位于所有 Hook 之后，不切断 Hook 链）
  if (!flowLoaded) {
    return <div className="h-[calc(100vh-64px)] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>;
  }

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
      `}</style>
      <FlowEditorToolbar
        flowName={flow.name}
        flowStatus={flow.status}
        saveStatus={saveStatus as 'idle' | 'saving' | 'saved'}
        validationStatus={validation.validationStatus}
        syncStatus={syncStatus}
        onExit={() => setExitModalOpen(true)}
        onSave={saveFlow}
        onTidyLayout={handleTidyLayout}
        onFlowNameChange={(value) => flowNameInput.onChange(value)}
        onFlowNameBlur={flowNameInput.onBlur}
      />

      <FlowEditorFunctionBar
        showLeftPanel={showLeftPanel}
        onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
        validation={validation}
        syncStatus={syncStatus}
        onSync={syncWithCache}
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
      <div className="flex-1 flex overflow-hidden relative">
        <FlowNodePalette
          showLeftPanel={showLeftPanel}
          onToggleLeftPanel={() => setShowLeftPanel(!showLeftPanel)}
          nodeGroups={nodeGroups}
          isDark={isDark}
          onAdd={addNode}
          insertHint={(() => {
            const anchor = insertAnchorId
              ? flow.nodes.find(n => n.id === insertAnchorId)
              : (selectedNodeId ? flow.nodes.find(n => n.id === selectedNodeId) : undefined);
            if (!anchor) return '点击条目将追加为新环节';
            return canInsertAfter(flow, anchor.id)
              ? `将插入到「${anchor.label}」之后`
              : `「${anchor.label}」分支过多，将追加为独立环节`;
          })()}
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
            {/* 外层占据缩放后的尺寸，内层按 1:1 画布坐标绘制再整体缩放 */}
            <div
              className="relative origin-top-left"
              style={{
                width: canvasSize.width * canvasScale,
                height: canvasSize.height * canvasScale,
              }}
            >
              <div
                className="absolute top-0 left-0 origin-top-left"
                style={{
                  width: canvasSize.width,
                  height: canvasSize.height,
                  transform: `translate(${canvasTranslate.x}px, ${canvasTranslate.y}px) scale(${canvasScale})`,
                }}
              >
            {/* 画布区域 */}
            <FlowTopologyEditorCanvas
              flow={flow}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              connectFromId={connectFromId}
              canvasScale={canvasScale}
              isDark={isDark}
              onNodeSelect={handleNodeClick}
              onEdgeSelect={(edgeId) => {
                setSelectedEdgeId(edgeId);
                setSelectedNodeId(null);
                setInsertAnchorId(null);
              }}
              onCanvasClick={handleCanvasClick}
              onInsertAfter={beginInsertAfter}
              onStartConnecting={startConnecting}
              onMoveWithinRank={moveWithinRank}
              onDeleteNode={deleteNode}
            />
              </div>
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

          {/* 节点属性 */}
          {selectedNode ? (
            <FlowPropertiesNodeEditor
              node={selectedNode}
              flow={flow}
              isDark={isDark}
              updateNodeConfig={updateNodeConfig}
              deleteEdge={deleteEdge}
              selectedEdgeId={selectedEdgeId}
              setSelectedEdgeId={setSelectedEdgeId}
            />
) : selectedEdge ? (
            <EdgePropertiesPanel
              edge={selectedEdge}
              flow={flow}
              onUpdateEdge={(edgeId, updates) => {
                setFlow(prev => ({
                  ...prev,
                  edges: prev.edges.map(ed =>
                    ed.id === edgeId ? { ...ed, ...updates } : ed
                  ),
                  updatedAt: Date.now(),
                }));
              }}
              onDeleteEdge={deleteEdge}
              isDark={isDark}
            />

          ) : (
            <div>
              <FlowPropertiesHeader
                flow={flow}
                draftId={draftId}
                idDirty={idDirty}
                idErrors={idErrors}
                spellPickerOpen={spellPickerOpen}
                setDraftId={setDraftId}
                setIdDirty={setIdDirty}
                setIdErrors={setIdErrors}
                setSpellPickerOpen={setSpellPickerOpen}
                setShowRightPanel={setShowRightPanel}
                setFlow={setFlow}
                validation={validation}
              />
              <FlowPropertiesCategories
                currentFlowId={flow.id}
                onCategoryChange={(newId) =>
                  setFlow(prev => ({
                    ...prev,
                    id: newId,
                    category: parseFlowId(newId).category,
                    updatedAt: Date.now(),
                  }))
                }
              />

              <FlowPropertiesSpellBinding
                spellId={flow.spellId}
                isDark={isDark}
                onSpellChange={(newSpellId) => {
                  spellBinding.handleSetSpell(newSpellId);
                }}
              />

              {/* ===== 流程统计 ===== */}
              <FlowPropertiesStatistics
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
                  // 节点已带画布变换，直接用视口矩形换算滚动量，居中即可
                  const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
                  const canvas = canvasRef.current;
                  if (nodeElement && canvas) {
                    const canvasRect = canvas.getBoundingClientRect();
                    const nodeRect = nodeElement.getBoundingClientRect();
                    const scrollLeft = canvas.scrollLeft + (nodeRect.left - canvasRect.left)
                      - canvasRect.width / 2 + nodeRect.width / 2;
                    const scrollTop = canvas.scrollTop + (nodeRect.top - canvasRect.top)
                      - canvasRect.height / 2 + nodeRect.height / 2;
                    const maxScrollLeft = canvas.scrollWidth - canvasRect.width;
                    const maxScrollTop = canvas.scrollHeight - canvasRect.height;
                    canvas.scrollTo({
                      left: Math.max(0, Math.min(scrollLeft, maxScrollLeft)),
                      top: Math.max(0, Math.min(scrollTop, maxScrollTop)),
                      behavior: 'smooth',
                    });
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



      {/* ===== 提示 toast ===== */}
      {toast && (
        <div
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-xs font-medium text-white shadow-lg whitespace-nowrap ${
            toast.type === 'success' ? 'bg-green-600/90' : toast.type === 'error' ? 'bg-red-600/90' : 'bg-primary/90'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ===== 退出确认弹窗 ===== */}
      {exitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg p-6 max-w-sm w-full mx-4 bg-white dark:bg-card-dark border dark:border-border-dark light:border-border-light shadow-xl">
            <h3 className="text-base font-bold mb-2">退出编辑器</h3>
            <p className="text-sm opacity-60 mb-4">
              {isDirty ? '当前改动尚未发布，退出后这些改动会丢失。' : '当前内容已发布，可以直接退出。'}
            </p>
            <div className="flex flex-col gap-2">
              {isDirty && (
                <button
                  onClick={async () => {
                    try {
                      await saveFlow();
                      setExitModalOpen(false);
                      navigate('/flows');
                    } catch {
                      // saveFlow 已提示失败原因，留在编辑器让用户处理
                    }
                  }}
                  className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90"
                >
                  发布并退出
                </button>
              )}
              <button
                onClick={() => { setExitModalOpen(false); navigate('/flows'); }}
                className={`px-4 py-2 text-sm rounded-lg border ${isDirty ? 'border-red-400 text-red-400 hover:bg-red-400/10' : 'border-primary text-primary hover:bg-primary/10'}`}
              >
                {isDirty ? '丢弃改动并退出' : '退出'}
              </button>
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

      


    </div>
  );
}
