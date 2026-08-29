import { useState, useRef, useCallback } from 'react';

export interface UseFlowEditorToastReturn {
  toast: { type: 'success' | 'error'; msg: string } | null;
  showToast: (type: 'success' | 'error', msg: string) => void;
}

export function useFlowEditorToast(): UseFlowEditorToastReturn {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  return { toast, showToast };
}