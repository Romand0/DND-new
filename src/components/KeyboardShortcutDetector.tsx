import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface KeyboardShortcutDetectorProps {
  children: React.ReactNode;
}

const SHORTCUT_TIMEOUT = 1000; // 1秒内完成快捷键输入

const SHORTCUT_MAP: Record<string, string> = {
  'CS': '/combat/:sessionId',
  'CL': '/characters',
  'EL': '/equipment',
  'SL': '/spells',
};

export default function KeyboardShortcutDetector({ children }: KeyboardShortcutDetectorProps) {
  const navigate = useNavigate();
  const [inputActive, setInputActive] = useState(false);
  const [keySequence, setKeySequence] = useState<string[]>([]);
  const sequenceTimeoutRef = useRef<number | null>(null);

  // 检查是否有输入框被激活
  const checkInputFocus = useCallback(() => {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    
    // 检查是否是输入框或可编辑元素
    const isInput = activeElement.tagName === 'INPUT' || 
                   activeElement.tagName === 'TEXTAREA' ||
                   activeElement.tagName === 'SELECT' ||
                   (activeElement as HTMLElement).isContentEditable;
    
    return isInput;
  }, []);

  // 处理键盘按键事件
  const handleKeyDown = useCallback(async (event: KeyboardEvent) => {
    // 如果输入框被激活，忽略快捷键
    if (checkInputFocus()) {
      return;
    }

    // 只处理字母键
    const key = event.key.toUpperCase();
    if (!/^[A-Z]$/.test(key)) {
      return;
    }

    // 清除之前的超时
    if (sequenceTimeoutRef.current) {
      clearTimeout(sequenceTimeoutRef.current);
    }

    // 更新按键序列
    const newSequence = [...keySequence, key];
    setKeySequence(newSequence);

    // 设置超时重置
    sequenceTimeoutRef.current = window.setTimeout(() => {
      setKeySequence([]);
    }, SHORTCUT_TIMEOUT) as unknown as number;

    // 检查是否匹配快捷键
    const sequence = newSequence.join('');
    if (SHORTCUT_MAP[sequence]) {
      const targetPath = SHORTCUT_MAP[sequence];
      
      // 特殊处理战斗场景快捷键
      if (sequence === 'CS') {
        // 复用现有的三击手势逻辑，获取当前战斗会话
        try {
          // 动态导入避免编译时依赖
          const hookedCombatModule = await import('@/data/hookedCombatStore');
          const hookedCombatStore = hookedCombatModule.default;
          const hooked = hookedCombatStore.get();
          if (hooked) {
            navigate(`/combat/${hooked.id}`);
          } else {
            console.log('No active combat session found');
          }
        } catch (error) {
          console.log('Failed to load combat store:', error);
        }
      } else {
        // 其他快捷键直接导航
        navigate(targetPath);
      }
      
      // 重置序列
      setKeySequence([]);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    }
  }, [keySequence, navigate, checkInputFocus]);

  // 监听输入框焦点变化
  useEffect(() => {
    const handleFocus = () => {
      setInputActive(checkInputFocus());
    };

    const handleBlur = () => {
      setInputActive(false);
    };

    // 监听全局焦点事件
    document.addEventListener('focus', handleFocus, true);
    document.addEventListener('blur', handleBlur, true);

    return () => {
      document.removeEventListener('focus', handleFocus, true);
      document.removeEventListener('blur', handleBlur, true);
    };
  }, [checkInputFocus]);

  // 监听键盘事件
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (sequenceTimeoutRef.current) {
        clearTimeout(sequenceTimeoutRef.current);
      }
    };
  }, [handleKeyDown]);

  // 渲染调试信息（开发环境）
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    return (
      <div className="keyboard-shortcut-debug">
        {children}
        <div className="fixed bottom-2 right-2 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          快捷键序列: {keySequence.join('')}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}