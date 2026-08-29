import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlowDefinition } from '@/types/flow';
import { validateFlowWithDetails, validateForPublish, type ValidationError } from '@/utils/flow-editor/validation';
import { useAutoFix, type AutoFixSuggestion } from './use-auto-fix';

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 自动修复 Hook
  const autoFix = useAutoFix(flow);

  // 实时验证（防抖500ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      const errors = validateFlowWithDetails(flow);
      setValidationErrors(errors);
      setValidationStatus(errors.length === 0 ? 'valid' : 'invalid');
      
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

  // 计算属性
  const isValid = useMemo(() => validationErrors.length === 0, [validationErrors]);
  const hasErrors = useMemo(() => validationErrors.length > 0, [validationErrors]);
  const hasSuggestions = useMemo(() => autoFix.hasSuggestions, [autoFix.hasSuggestions]);

  return {
    // 状态
    validationErrors,
    showValidation,
    validationStatus,
    autoFixSuggestions: autoFix.autoFixSuggestions,
    saveStatus,
    
    // 方法
    setShowValidation,
    runValidation,
    handleAutoFix: autoFix.handleAutoFix,
    
    // 计算属性
    isValid,
    hasErrors,
    hasSuggestions
  };
}