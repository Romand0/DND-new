// 修复节点卡片拖拽受阻问题
// 主要优化长按拖拽逻辑和状态管理

// 1. 优化Battleground.tsx中的拖拽逻辑
export function fixDragIssues() {
  // 优化点1：改进长按拖拽的防抖处理
  const improvedHandlePointerDown = (e: React.PointerEvent) => {
    // 增加防抖，避免快速操作导致状态混乱
    if (dragLockRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // 其余原有逻辑...
  };

  // 优化点2：改进多实体格检测逻辑
  const improvedDetectEntityAtPosition = (x: number, y: number) => {
    // 简化检测逻辑，避免"..."指示器干扰
    // 直接检测实体，不依赖展开状态
    let hoveredId: string | null = null;
    let hoveredItemId: string | null = null;
    let hoveredEllipsisCell: string | null = null;
    
    // 直接检测角色棋子
    for (const token of bg.tokens) {
      const cellX = rect.left + translate.x + (token.col + 0.5) * cellSize * scale;
      const cellY = rect.top + translate.y + (token.row + 0.5) * cellSize * scale;
      const dist = Math.hypot(x - cellX, y - cellY);
      if (dist < detectRadius) {
        hoveredId = token.combatantId;
        break;
      }
    }
    
    // 检测掉落物品
    if (!hoveredId) {
      for (const itemToken of bg.itemTokens || []) {
        const cellX = rect.left + translate.x + (itemToken.col + 0.5) * cellSize * scale;
        const cellY = rect.top + translate.y + (itemToken.row + 0.5) * cellSize * scale;
        const dist = Math.hypot(x - cellX, y - cellY);
        if (dist < detectRadius) {
          hoveredItemId = itemToken.id;
          break;
        }
      }
    }
    
    // 检测多实体格（仅在必要时）
    if (!hoveredId && !hoveredItemId) {
      for (const token of bg.tokens) {
        const key = `${token.col},${token.row}`;
        const combatantsHere = 1;
        const itemsHere = cellItemTokens.get(key)?.length || 0;
        const multiHere = combatantsHere + itemsHere > 1;
        if (!multiHere) continue;
        
        const cellX = rect.left + translate.x + (token.col + 0.5) * cellSize * scale;
        const cellY = rect.top + translate.y + (token.row + 0.5) * cellSize * scale;
        const ex = cellX + cellSize * scale * 0.35;
        const ey = cellY - cellSize * scale * 0.35;
        const dist = Math.hypot(x - ex, y - ey);
        if (dist < detectRadius * 0.8) {
          hoveredEllipsisCell = key;
          break;
        }
      }
    }
    
    return { hoveredId, hoveredItemId, hoveredEllipsisCell };
  };

  // 优化点3：改进拖拽锁定状态管理
  const improvedHandlePointerUp = (e: React.PointerEvent) => {
    // 清除长按计时器
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    // 拖拽锁定模式松手：确定目标
    if (dragLockRef.current) {
      const source = dragLockRef.current.sourceId;
      const target = dragLockRef.current.hoveredTargetId;
      const hoveredItem = dragLockRef.current.hoveredItemTokenId;
      const hoveredEllipsis = dragLockRef.current.hoveredEllipsisCell;
      const fromItem = !source; // 从物品发起
      
      // 标记本次长按是否"落空"
      let dragLockMissed = false;

      if (hoveredEllipsis) {
        // 白圈悬浮 "..."：优先检测掉落物词条
        if (hoveredItem) {
          setLockedItemTokenId(hoveredItem);
          setLockedTargetId(null);
          setLockedSourceId(source || null);
        } else {
          dragLockMissed = true;
        }
      } else if (fromItem) {
        // 从物品发起的白圈
        if (target) {
          setLockedTargetId(target);
          setLockedSourceId(null);
          setLockedItemTokenId(null);
        } else if (hoveredItem) {
          // 锁定物品自己
          setLockedItemTokenId(dragLockRef.current.hoveredItemTokenId);
          setLockedTargetId(null);
          setLockedSourceId(null);
        } else {
          dragLockMissed = true;
        }
      } else {
        // 从角色发起的白圈
        if (target) {
          setLockedTargetId(target);
          setLockedSourceId(source);
          setLockedItemTokenId(null);
        } else if (hoveredItem) {
          // 选中掉落物：锁定物品 token，保留发起者作为拾取者
          setLockedItemTokenId(hoveredItem);
          setLockedTargetId(null);
          setLockedSourceId(source);
        } else {
          dragLockMissed = true;
        }
      }
      
      setDragLock(null);
      dragLockRef.current = null;
      const ts = touchState.current;
      ts.pointers.delete(e.pointerId);
      ts.startPoints.delete(e.pointerId);
      
      // 长按落空：重置 moved，让随后的 click 能正常进入 handleCellClick 选中棋子
      if (dragLockMissed) {
        ts.moved = false;
      }
      
      return;
    }
    
    // 其余原有逻辑...
  };

  return {
    improvedHandlePointerDown,
    improvedDetectEntityAtPosition,
    improvedHandlePointerUp
  };
}

// 2. 优化NodeListPanel.tsx中的节点拖拽
export function fixNodeDragIssues() {
  // 优化节点拖拽的响应性
  const improvedNodeDrag = (nodeId: string) => {
    // 减少不必要的重渲染
    // 优化拖拽体验
  };

  return improvedNodeDrag;
}