import { useState, useRef, useCallback } from 'react';

export type FlowEditorToastType = 'success' | 'error' | 'info';

export interface FlowEditorToastState {
  type: FlowEditorToastType;
  msg: string;
}

export interface UseFlowEditorToastReturn {
  toast: FlowEditorToastState | null;
  showToast: (type: FlowEditorToastType, msg: string) => void;
}

export function useFlowEditorToast(): UseFlowEditorToastReturn {
  const [toast, setToast] = useState<FlowEditorToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  
  const showToast = useCallback((type: FlowEditorToastType, msg: string) => {
    setToast({ type, msg });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showToast };
}
