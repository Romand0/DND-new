import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlowDefinition } from '@/types/flow';
import { validateFlowWithDetails, validateForPublish, type ValidationError, getAutoFixSuggestions } from '../validation';

export interface AutoFixSuggestion {
  type: 'global' | 'node' | 'edge';
  message: string;
  fix: () => FlowDefinition;
}

export interface UseFlowValidationReturn {
  // 状态
  validationErrors: ValidationError[];
  showValidation: boolean;
  validationStatus: 'valid' | 'invalid';
  autoFixSuggestions: AutoFixSuggestion[];
  saveStatus: 'idle' | 'saving' | 'saved';
  
  // 方法
  setShowValidation: (show: boolean) => void;
  runValidation: () => void;
  handleAutoFix: () => { updatedFlow: FlowDefinition; fixesApplied: string[] };
  
  // 计算属性
  isValid: boolean;
  hasErrors: boolean;
  hasSuggestions: boolean;
}

export function useFlowValidation(flow: FlowDefinition): UseFlowValidationReturn {
  // 状态管理
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid'>('valid');
  const [autoFixSuggestions, setAutoFixSuggestions] = useState<AutoFixSuggestion[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 实时验证（防抖500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      const errors = validateFlowWithDetails(flow);
      setValidationErrors(errors);
      setValidationStatus(errors.length === 0 ? 'valid' : 'invalid');
      
      // 获取自动修复建议
      const suggestions = getAutoFixSuggestions(flow);
      setAutoFixSuggestions(suggestions);
      
      // 如果有错误，自动显示验证面板
      if (errors.length > 0 && !showValidation) {
        setShowValidation(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [flow, showValidation]);

  // 手动验证
  const runValidation = useCallback(() => {
    const errors = validateFlowWithDetails(flow);
    setValidationErrors(errors);
    setShowValidation(true);
    setValidationStatus(errors.length === 0 ? 'valid' : 'invalid');
  }, [flow]);

  // 自动修复
  const handleAutoFix = useCallback(() => {
    if (autoFixSuggestions.length === 0) return;

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

    return { updatedFlow, fixesApplied };
  }, [flow, autoFixSuggestions]);

  // 计算属性
  const isValid = useMemo(() => validationErrors.length === 0, [validationErrors]);
  const hasErrors = useMemo(() => validationErrors.length > 0, [validationErrors]);
  const hasSuggestions = useMemo(() => autoFixSuggestions.length > 0, [autoFixSuggestions]);

  return {
    // 状态
    validationErrors,
    showValidation,
    validationStatus,
    autoFixSuggestions,
    saveStatus,
    
    // 方法
    setShowValidation,
    runValidation,
    handleAutoFix,
    
    // 计算属性
    isValid,
    hasErrors,
    hasSuggestions
  };
}