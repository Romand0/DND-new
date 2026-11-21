import { useCallback, useRef, useState } from 'react';
import { moveBlock, parseSlotKey } from '@/lib/flowScriptTree';
import type { ScriptBlock } from '@/types/flowScript';

// ======================
// 脚本树拖拽状态机（pointer 事件，触屏/鼠标统一）
// ======================
//
// 与旧图编辑器的 use-node-drag 不同：拖拽对象是块（含整串子树），落点是插槽。
// 按下 → 位移超过阈值进入拖拽 → elementFromPoint 命中 [data-slot-key] 高亮 →
// 松手提交 moveBlock（不可变树更新）。未超阈值的按下-松手视为点击（选中块）。

const DRAG_THRESHOLD = 6;

export interface ScriptDndState {
  /** 拖拽中的块 id（null = 未拖拽） */
  dragId: string | null;
  /** ghost 跟随位置（视口坐标） */
  pointer: { x: number; y: number } | null;
  /** 当前吸附插槽 key（data-slot-key） */
  activeSlotKey: string | null;
}

interface UseScriptDndOptions {
  /** 拖拽提交（不可变树更新由调用方实现，makeMover 提供默认工厂） */
  onMove: (originId: string, targetKey: string) => void;
  /** 点击（未成拖拽）选中块 */
  onSelect: (blockId: string) => void;
}

export function useScriptDnd({ onMove, onSelect }: UseScriptDndOptions) {
  const [state, setState] = useState<ScriptDndState>({
    dragId: null,
    pointer: null,
    activeSlotKey: null,
  });

  const pendingRef = useRef<{ id: string; startX: number; startY: number; active: boolean } | null>(null);
  const activeSlotRef = useRef<string | null>(null);

  const setActiveSlot = useCallback((key: string | null) => {
    if (activeSlotRef.current === key) return;
    activeSlotRef.current = key;
    setState(prev => ({ ...prev, activeSlotKey: key }));
  }, []);

  /** 块拖柄 pointerdown：挂 window 监听，等待位移阈值 */
  const beginDrag = useCallback((e: React.PointerEvent, blockId: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    pendingRef.current = { id: blockId, startX: e.clientX, startY: e.clientY, active: false };

    const cleanup = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerMove = (ev: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (!pending.active) {
        const dist = Math.abs(ev.clientX - pending.startX) + Math.abs(ev.clientY - pending.startY);
        if (dist < DRAG_THRESHOLD) return;
        pending.active = true;
        setState({ dragId: pending.id, pointer: { x: ev.clientX, y: ev.clientY }, activeSlotKey: null });
      }
      setState(prev =>
        prev.dragId === null ? prev : { ...prev, pointer: { x: ev.clientX, y: ev.clientY } }
      );
      // ghost pointer-events:none，elementFromPoint 直接命中插槽
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const slot = el?.closest('[data-slot-key]');
      setActiveSlot(slot?.getAttribute('data-slot-key') ?? null);
    };

    const onPointerUp = () => {
      cleanup();
      const pending = pendingRef.current;
      pendingRef.current = null;
      const slotKey = activeSlotRef.current;
      activeSlotRef.current = null;
      if (pending.active) {
        if (slotKey) onMove(pending.id, slotKey);
      } else {
        onSelect(pending.id);
      }
      setState({ dragId: null, pointer: null, activeSlotKey: null });
    };

    const onPointerCancel = () => {
      cleanup();
      pendingRef.current = null;
      activeSlotRef.current = null;
      setState({ dragId: null, pointer: null, activeSlotKey: null });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }, [onMove, onSelect, setActiveSlot]);

  return { dnd: state, beginDrag };
}

/** 拖拽提交默认实现：moveBlock 不可变更新（取消情形返回原引用，不触发写入） */
export function makeMover(
  getBody: () => ScriptBlock[],
  setBody: (next: ScriptBlock[]) => void,
): (originId: string, targetKey: string) => void {
  return (originId, targetKey) => {
    const current = getBody();
    const next = moveBlock(current, originId, parseSlotKey(targetKey));
    if (next !== current) setBody(next);
  };
}
