import React from 'react';
import type { FlowScript, ScriptBlock } from '@/types/flowScript';
import { findBlock } from '@/lib/flowScriptTree';
import type { SlotPath } from '@/lib/flowScriptTree';
import { Zap } from 'lucide-react';
import FlowBlockCard from './FlowBlockCard';
import FlowDropSlot from './FlowDropSlot';
import type { ScriptDndState } from '../hooks/use-script-dnd';

// 脚本画布：帽子块 + 顶部序列的垂直渲染。结构即布局（无坐标），缩放走 CSS transform。
// 拖拽 ghost 挂 fixed 层跟随指针（pointer-events:none，不挡插槽命中）。

interface FlowScriptCanvasProps {
  script: FlowScript;
  isDark: boolean;
  canvasScale: number;
  selectedId: string | null;
  dnd: ScriptDndState;
  /** 只读渲染（FlowView 预览）：块无拖柄/删除，插槽静态 */
  readOnly?: boolean;
  beginDrag: (e: React.PointerEvent, blockId: string) => void;
  onDelete: (blockId: string) => void;
  onSlotPick: (slotKey: string) => void;
}

export const FlowScriptCanvas: React.FC<FlowScriptCanvasProps> = ({
  script,
  isDark,
  canvasScale,
  selectedId,
  dnd,
  readOnly,
  beginDrag,
  onDelete,
  onSlotPick,
}) => {
  const dragging = dnd.dragId !== null;
  const dragged = dnd.dragId ? findBlock(script.body, dnd.dragId) : null;

  const slotKeyOf = (path: SlotPath): string =>
    `${path.viaIds.join('/')}|${path.branches.join('/')}|${path.index}`;

  const topSlotPath = (index: number): SlotPath => ({ viaIds: [], branches: [], index });

  return (
    <div
      className="min-h-full w-full flex justify-center pt-6 pb-24 px-4"
      style={{ touchAction: 'manipulation' }}
    >
      <div
        className="origin-top"
        style={{ transform: `scale(${canvasScale})`, width: '100%', maxWidth: 560 }}
      >
        {/* 帽子块（固定入口） */}
        <div
          data-node-id={script.hat.id}
          className="flex items-center gap-2 px-3 py-3 rounded-t-2xl rounded-b-lg border border-b-0 text-left"
          style={{
            borderLeft: '4px solid #eab308',
            backgroundColor: isDark ? 'rgba(234,179,8,0.08)' : 'rgba(234,179,8,0.12)',
          }}
        >
          <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-yellow-500/20">
            <Zap className="w-4 h-4 text-yellow-500" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-yellow-500">{script.hat.label}</div>
            <div className="text-[10px] text-gray-400">施法入口（帽子块，唯一）</div>
          </div>
        </div>

        {/* 顶部序列：插槽 + 块递归 */}
        <div
          className={`rounded-b-xl border border-t-0 px-2 py-2 ${isDark ? 'border-border-dark bg-white/[0.02]' : 'border-border-light bg-white/60'}`}
        >
          {script.body.map((b: ScriptBlock, i: number) => (
            <React.Fragment key={b.id}>
              <FlowDropSlot
                slotKey={slotKeyOf(topSlotPath(i))}
                active={dragging && dnd.activeSlotKey === slotKeyOf(topSlotPath(i))}
                dragging={dragging}
                readOnly={readOnly}
                onPick={onSlotPick}
              />
              <FlowBlockCard
                block={b}
                viaIds={[]}
                branches={[]}
                isDark={isDark}
                selectedId={selectedId}
                dragging={dragging}
                dragId={dnd.dragId}
                activeSlotKey={dnd.activeSlotKey}
                readOnly={readOnly}
                beginDrag={beginDrag}
                onDelete={onDelete}
                onSlotPick={onSlotPick}
                slotKeyOf={slotKeyOf}
              />
            </React.Fragment>
          ))}
          <FlowDropSlot
            slotKey={slotKeyOf(topSlotPath(script.body.length))}
            active={dragging && dnd.activeSlotKey === slotKeyOf(topSlotPath(script.body.length))}
            dragging={dragging}
            readOnly={readOnly}
            onPick={onSlotPick}
          />
        </div>

        {script.body.length === 0 && !dragging && !readOnly && (
          <p className="text-center text-xs text-gray-400 mt-4">
            从左侧环节库点击添加积木，或拖动积木到插槽中
          </p>
        )}
      </div>

      {/* 拖拽 ghost */}
      {dragged && dnd.pointer && (
        <div
          className="fixed z-[80] w-72 pointer-events-none opacity-80 drop-shadow-xl"
          style={{ left: dnd.pointer.x + 8, top: dnd.pointer.y + 8 }}
        >
          <FlowBlockCard
            block={dragged}
            viaIds={[]}
            branches={[]}
            isDark={isDark}
            selectedId={null}
            dragging={false}
            dragId={null}
            activeSlotKey={null}
            beginDrag={() => {}}
            onDelete={() => {}}
            onSlotPick={() => {}}
            slotKeyOf={slotKeyOf}
          />
        </div>
      )}
    </div>
  );
};

export default FlowScriptCanvas;
