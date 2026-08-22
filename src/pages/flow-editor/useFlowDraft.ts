/**
 * Flow Draft Hook
 * 
 * 管理流程草稿的状态和操作，包括：
 * - 流程数据管理（flow, setFlow）
 * - 草稿列表管理（drafts, setDrafts）
 * - 草稿操作（saveDraft, loadDraft, deleteDraft）
 * - 草稿ID管理（draftId, setDraftId）
 * - ID验证和同步
 * - flowStore 同步
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FlowDefinition } from '../../types/flow';
import flowStore from '../../data/flowStore';
import { generateFlowId } from '../../lib/idUtils';
import { useTextInput } from '../../hooks/useInput';

// ===== 草稿操作状态 =====
export type SaveStatus = 'idle' | 'saving' | 'saved';

// ===== Hook 配置接口 =====
export interface UseFlowDraftConfig {
  initialFlowId?: string;
  initialFlow?: FlowDefinition;
}

// ===== Hook 返回值接口 =====
export interface UseFlowDraftReturn {
  // 状态
  flow: FlowDefinition;
  setFlow: (flow: FlowDefinition) => void;
  drafts: FlowDefinition[];
  setDrafts: (drafts: FlowDefinition[]) => void;
  draftId: string;
  setDraftId: (draftId: string) => void;
  idErrors: string[];
  setIdErrors: (errors: string[]) => void;
  idDirty: boolean;
  setIdDirty: (dirty: boolean) => void;
  saveStatus: SaveStatus;
  showDrafts: boolean;
  setShowDrafts: (show: boolean) => void;
  
  // 输入管理
  flowNameInput: {
    value: string;
    setExternal: (value: string) => void;
    onChange: (value: string) => void;
  };
  
  // 操作方法
  saveDraft: () => void;
  loadDraft: (draft: FlowDefinition) => void;
  deleteDraft: (draftId: string) => void;
  clearCanvas: () => void;
  createEmptyFlow: () => FlowDefinition;
  
  // 引用
  flowStoreRef: ReturnType<typeof useRef<typeof flowStore>>;
}

// ===== 创建空流程的函数 =====
export function createEmptyFlow(): FlowDefinition {
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

// ===== 主要 Hook =====
export function useFlowDraft(config: UseFlowDraftConfig = {}): UseFlowDraftReturn {
  const { initialFlowId, initialFlow } = config;
  
  // ===== 流程状态 =====
  const [flow, setFlow] = useState<FlowDefinition>(() => {
    // 优先使用传入的初始流程
    if (initialFlow) {
      return initialFlow;
    }
    // 其次从 flowStore 加载指定 ID
    if (initialFlowId) {
      const loaded = flowStore.getById(initialFlowId);
      if (loaded) return loaded;
    }
    // 最后创建空流程
    return createEmptyFlow();
  });
  
  // ===== 草稿状态 =====
  const [drafts, setDrafts] = useState<FlowDefinition[]>(() => flowStore.getAll());
  const [showDrafts, setShowDrafts] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  
  // ===== 草稿ID管理 =====
  const [draftId, setDraftId] = useState(flow.id);
  const [idErrors, setIdErrors] = useState<string[]>([]);
  const [idDirty, setIdDirty] = useState(false); // 草稿是否偏离正式值
  
  // ===== flowStore 引用管理 =====
  const flowStoreRef = useRef(flowStore);
  useEffect(() => {
    flowStoreRef.current = flowStore;
  }, [flowStore]);
  
  // ===== flow.id 外部变更时同步草稿 =====
  useEffect(() => {
    if (!idDirty) setDraftId(flow.id);
  }, [flow.id, idDirty]);
  
  // ===== 流程名称输入管理 =====
  const flowNameInput = useTextInput(flow.name);
  
  // ===== 保存草稿 =====
  const saveDraft = useCallback(() => {
    setSaveStatus('saving');
    
    // 用 requestAnimationFrame 制造一帧延迟，让 "saving" 态先渲染
    requestAnimationFrame(() => {
      const updatedFlow = { 
        ...flow, 
        name: flowNameInput.value || flow.name, 
        updatedAt: Date.now() 
      };
      
      // 直接写入 flowStore（单一真相源）；save 为 upsert，库中不存在的流程也会写入
      flowStoreRef.current.save(updatedFlow);
      setDrafts(flowStoreRef.current.getAll()); // 刷新下拉框数据
      setFlow(updatedFlow);
      setSaveStatus('saved');
      
      // 如果是新建流程（initialFlowId 为占位符），保存后跳转到真实 ID 的编辑页
      if (initialFlowId && initialFlowId !== updatedFlow.id) {
        // 注意：这里不直接处理路由跳转，由调用者负责
        console.log(`Navigate to: /flow-editor/${updatedFlow.id}`);
      }
      
      // 重置 ID 脏状态
      setIdDirty(false);
      
      // 2秒后恢复空闲状态
      setTimeout(() => setSaveStatus('idle'), 2000);
    });
  }, [flow, flowNameInput.value, initialFlowId]);
  
  // ===== 加载草稿 =====
  const loadDraft = useCallback((draft: FlowDefinition) => {
    setFlow(draft);
    flowNameInput.setExternal(draft.name);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setShowDrafts(false);
    setIdDirty(false);
  }, []);
  
  // ===== 删除草稿 =====
  const deleteDraft = useCallback((draftId: string) => {
    flowStoreRef.current.delete(draftId);
    setDrafts(flowStoreRef.current.getAll());
    
    // 如果删除的是当前流程，需要处理清理逻辑
    if (flow.id === draftId) {
      // 注意：这里不直接处理页面跳转，由调用者负责
      // TODO: 需要处理页面跳转逻辑
    }
  }, [flow.id]);
  
  // ===== 清空画布 =====
  const clearCanvas = useCallback(() => {
    if (confirm('确定要清空当前画布吗？所有节点和连线将被删除。')) {
      const newFlow = createEmptyFlow();
      setFlow(newFlow);
      flowNameInput.setExternal(newFlow.name);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setIdDirty(true);
    }
  }, []);
  
  // ===== 设置选中节点（需要外部传入） =====
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  
  return {
    // 状态
    flow,
    setFlow,
    drafts,
    setDrafts,
    draftId,
    setDraftId,
    idErrors,
    setIdErrors,
    idDirty,
    setIdDirty,
    saveStatus,
    showDrafts,
    setShowDrafts,
    selectedNodeId,
    setSelectedNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
    
    // 输入管理
    flowNameInput,
    
    // 操作方法
    saveDraft,
    loadDraft,
    deleteDraft,
    clearCanvas,
    createEmptyFlow,
    
    // 引用
    flowStoreRef,
  };
}

// ===== 便捷函数 =====
/**
 * 创建 useFlowDraft hook 的便捷函数，用于不需要复杂配置的场景
 */
export function useFlowDraftSimple(initialFlowId?: string): UseFlowDraftReturn {
  return useFlowDraft({ initialFlowId });
}

/**
 * 创建 useFlowDraft hook 的便捷函数，用于基于现有流程创建草稿
 */
export function useFlowDraftFromFlow(initialFlow: FlowDefinition): UseFlowDraftReturn {
  return useFlowDraft({ initialFlow });
}