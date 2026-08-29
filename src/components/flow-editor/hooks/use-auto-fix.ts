import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlowDefinition } from '@/types/flow';
import { getAutoFixSuggestions } from '@/utils/flow-editor/validation';

export interface AutoFixSuggestion {
  type: 'global' | 'node' | 'edge';
  message: string;
  fix: () => FlowDefinition;
}

export interface UseAutoFixReturn {
  // 状态
  autoFixSuggestions: AutoFixSuggestion[];
  isFixing: boolean;
  
  // 方法
  handleAutoFix: () => { updatedFlow: FlowDefinition; fixesApplied: string[] };
  refreshSuggestions: (flow: FlowDefinition) => void;
  
  // 计算属性
  hasSuggestions: boolean;
  suggestionCount: number;
  suggestionTypes: ('global' | 'node' | 'edge')[];
}

export function useAutoFix(flow: FlowDefinition): UseAutoFixReturn {
  // 状态管理
  const [autoFixSuggestions, setAutoFixSuggestions] = useState<AutoFixSuggestion[]>([]);
  const [isFixing, setIsFixing] = useState(false);

  // 获取自动修复建议
  const refreshSuggestions = useCallback((currentFlow: FlowDefinition) => {
    const suggestions = getAutoFixSuggestions(currentFlow);
    setAutoFixSuggestions(suggestions);
  }, []);

  // 初始化时获取建议
  useEffect(() => {
    refreshSuggestions(flow);
  }, [flow, refreshSuggestions]);

  // 自动修复处理
  const handleAutoFix = useCallback(() => {
    if (autoFixSuggestions.length === 0) return;

    setIsFixing(true);
    
    // 按顺序应用修复建议
    let updatedFlow = flow;
    const fixesApplied: string[] = [];

    autoFixSuggestions.forEach(suggestion => {
      try {
        const fixedFlow = suggestion.fix();
        if (fixedFlow !== updatedFlow) {
          updatedFlow = fixedFlow;
          fixesApplied.push(suggestion.message);
        }
      } catch (error) {
        console.warn('自动修复失败:', suggestion.message, error);
      }
    });

    setIsFixing(false);
    return { updatedFlow, fixesApplied };
  }, [flow, autoFixSuggestions]);

  // 计算属性
  const hasSuggestions = useMemo(() => autoFixSuggestions.length > 0, [autoFixSuggestions]);
  const suggestionCount = useMemo(() => autoFixSuggestions.length, [autoFixSuggestions]);
  const suggestionTypes = useMemo(() => {
    const types = new Set<AutoFixSuggestion['type']>();
    autoFixSuggestions.forEach(suggestion => {
      types.add(suggestion.type);
    });
    return Array.from(types);
  }, [autoFixSuggestions]);

  return {
    // 状态
    autoFixSuggestions,
    isFixing,
    
    // 方法
    handleAutoFix,
    refreshSuggestions,
    
    // 计算属性
    hasSuggestions,
    suggestionCount,
    suggestionTypes
  };
}