// 全局编辑窗口状态 - 控制 SyncButton 等浮动元素的显示
let count = 0;
let listeners: (() => void)[] = [];

function notify() {
  listeners.forEach((fn) => fn());
}

export const editorState = {
  open() {
    count++;
    notify();
  },
  close() {
    count = Math.max(0, count - 1);
    notify();
  },
  get() {
    return count > 0;
  },
  subscribe(fn: () => void): () => void {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
};

import { useEffect } from 'react';

// Hook：传入任意数量的布尔标志，自动同步到全局状态
export function useEditorState(...flags: boolean[]) {
  const isOpen = flags.some(Boolean);
  useEffect(() => {
    if (isOpen) {
      editorState.open();
    } else {
      editorState.close();
    }
  }, [isOpen]);
}
