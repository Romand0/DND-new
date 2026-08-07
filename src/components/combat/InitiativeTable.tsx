import { X, Play, Pencil, Keyboard, Undo2, Trash2 } from 'lucide-react';
import type { Combatant, RoundAction, TurnTodo } from '@/types/combat';

interface Props {
  combatants: Combatant[];
  rounds: RoundAction[];
  selectedCell: { round: number; combatantId: string } | null;
  editingCell: { round: number; combatantId: string } | null;
  onCellClick: (round: number, combatantId: string) => void;
  onCellChange: (round: number, combatantId: string, value: string) => void;
  onSetEditingCell: (cell: { round: number; combatantId: string } | null) => void;
  onSetSelectedCell: (cell: { round: number; combatantId: string } | null) => void;
  // 先攻相关
  editingInitiative: string | null;
  initiativeInput: string;
  onInitiativeSave: (id: string) => void;
  onInitiativeCancel: () => void;
  onInitiativeStartEdit: (id: string) => void;
  onInitiativeInputChange: (v: string) => void;
  getInitiativeCircle: (id: string) => string;
  // 批量操作
  batchMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRemoveCombatant: (id: string) => void;
  onOpenSurpriseAttack: (round: number) => void;
  // 放映模式
  isPlayback: boolean;
  playbackStarted: boolean;
  currentTurn: { round: number; combatantIdx: number; combatantId: string } | null;
  onStartPlayback: () => void;
  onOpenManualRecord: () => void;
  onOpenRewind: (round: number, combatantId: string, combatantIdx: number) => void;
  // 待办
  turnTodos?: TurnTodo[];
  onToggleTodo?: (todoId: string, round: number) => void;
}

export default function InitiativeTable(props: Props) {
  const {
    combatants, rounds, selectedCell, editingCell,
    onCellClick, onCellChange, onSetEditingCell, onSetSelectedCell,
    editingInitiative, initiativeInput, onInitiativeSave, onInitiativeCancel,
    onInitiativeStartEdit, onInitiativeInputChange,
    batchMode, selectedIds, onToggleSelect, onRemoveCombatant, onOpenSurpriseAttack,
    isPlayback, playbackStarted, currentTurn,
    onStartPlayback, onOpenManualRecord, onOpenRewind,
  } = props;

  return (
    <div className="overflow-x-auto rounded-lg border dark:border-border-dark light:border-border-light">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="dark:bg-card-dark light:bg-card-light">
            <th className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-card-dark light:bg-card-light z-10 w-16 text-center">
              轮次
            </th>
            {combatants.map((c, idx) => {
              const downed = c.isDead || c.isUnconscious;
              return (
              <th key={c.id} className={`p-2 pt-7 border-r dark:border-border-dark light:border-border-light min-w-[120px] relative group ${downed ? 'opacity-40' : ''}`}>
                <div className="absolute top-1 left-1 w-6 h-6 rounded-full dark:bg-gray-600 dark:text-white light:bg-gray-300 light:text-black text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                  {/* 死亡：在数字标记上打红叉 */}
                  {c.isDead && (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox="0 0 100 100"
                      style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                    >
                      <line x1="20" y1="20" x2="80" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                      <line x1="80" y1="20" x2="20" y2="80" stroke="#ef4444" strokeWidth="14" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {batchMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => onToggleSelect(c.id)}
                      className="shrink-0 cursor-pointer"
                    />
                  )}
                  {/* 名称：PC/NPC 均为只读，不可编辑（名称属于角色卡默认信息） */}
                  <div className="font-medium truncate flex-1">{c.name}</div>
                </div>
                {/* 先攻：点击可编辑（先攻是战斗临时数据，不涉及角色卡默认信息） */}
                {editingInitiative === c.id ? (
                  <input
                    type="number"
                    autoFocus
                    value={initiativeInput}
                    onChange={(e) => onInitiativeInputChange(e.target.value)}
                    onBlur={() => onInitiativeSave(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onInitiativeSave(c.id);
                      if (e.key === 'Escape') onInitiativeCancel();
                    }}
                    className="w-12 text-xs bg-transparent border-b border-primary outline-none dark:text-text-dark light:text-text-light"
                  />
                ) : (
                  <div
                    className="text-xs opacity-60 cursor-text hover:opacity-100"
                    onClick={() => onInitiativeStartEdit(c.id)}
                    title="点击编辑先攻"
                  >
                    先攻 {c.initiative}
                  </div>
                )}
                {/* 展示 HP（PC 和 NPC 均显示） */}
                {c.maxHp != null && c.maxHp > 0 && (
                  <div className="text-xs opacity-60 mt-1">
                    HP {c.currentHp}/{c.maxHp}
                  </div>
                )}
                {/* 单个删除按钮：仅非批量模式显示 */}
                {!batchMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveCombatant(c.id);
                    }}
                    className="absolute top-1 right-1 p-0.5 rounded hover:bg-danger/20 text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除参战者"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, roundIndex) => (
            <tr key={roundIndex} className="border-t dark:border-border-dark/50 light:border-border-light/50">
              <td className="p-2 border-r dark:border-border-dark light:border-border-light sticky left-0 dark:bg-bg-dark light:bg-bg-light font-medium text-center">
                {roundIndex === 0 ? (
                  <button
                    onClick={() => onOpenSurpriseAttack(roundIndex)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-primary/10 text-primary transition-colors cursor-pointer"
                    title="设置被突袭角色"
                  >
                    {roundIndex + 1}
                  </button>
                ) : (
                  roundIndex + 1
                )}
              </td>
              {combatants.map((c) => {
                const action = round[c.id] || '';
                const isEditing =
                  editingCell?.round === roundIndex &&
                  editingCell?.combatantId === c.id;
                const isSurprised = action === '被突袭';
                const isSelected = selectedCell?.round === roundIndex && selectedCell?.combatantId === c.id;
                // 放映模式判断
                const isCurrentTurn = isPlayback && playbackStarted && currentTurn?.round === roundIndex && currentTurn?.combatantId === c.id;
                // 放映模式下：
                // - 未开始放映：所有非被突袭格子可点击（用于选择放映起点）
                // - 已开始放映：当前回合格子可记录/手动输入；其它任何已发生或后续格子也允许点击（用于回溯）
                const cellClickable = isPlayback
                  ? (!isSurprised && (
                      !playbackStarted || true  // 已开始放映后允许点开任意格子查看并回溯
                    ))
                  : true;

                if (isSurprised) {
                  return (
                    <td
                      key={c.id}
                      className="p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] dark:bg-yellow-500/10 light:bg-yellow-100/50 text-center"
                      title="被突袭：本回合被突袭，失去先攻"
                    >
                      <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">被突袭</span>
                    </td>
                  );
                }

                return (
                  <td
                    key={c.id}
                    className={`p-2 border-r dark:border-border-dark light:border-border-light min-w-[120px] transition-colors relative ${
                      isSelected ? 'bg-primary/10 ring-2 ring-inset ring-primary/30' : cellClickable ? 'hover:bg-white/5 cursor-pointer' : 'opacity-60'
                    } ${isCurrentTurn ? 'ring-2 ring-yellow-400 dark:ring-yellow-300 animate-pulse bg-yellow-400/10 dark:bg-yellow-300/10' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isEditing) return;
                      onCellClick(roundIndex, c.id);
                    }}
                  >
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={action}
                        onChange={(e) => onCellChange(roundIndex, c.id, e.target.value)}
                        onBlur={() => onSetEditingCell(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') onSetEditingCell(null);
                        }}
                        className="w-full bg-transparent outline-none resize-none text-xs"
                        rows={2}
                      />
                    ) : isSelected ? (
                      <div className="flex flex-col items-center gap-1 py-1 relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetSelectedCell(null);
                          }}
                          className="absolute -top-1 -right-1 p-0.5 rounded-full bg-danger text-white hover:bg-danger/80 transition-colors z-10"
                          title="取消"
                          type="button"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="whitespace-pre-wrap text-xs min-h-[2em] w-full text-center opacity-50 italic">
                          {action || '空白记录'}
                        </div>
                        {isPlayback && !playbackStarted ? (
                          // 放映模式 + 未开始放映 → 显示播放按钮（放映模式不要手动记录按钮）
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartPlayback();
                              onSetSelectedCell(null);
                            }}
                            className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                            title="从这里开始放映"
                          >
                            <Play className="w-3 h-3" />
                            开始放映
                          </button>
                        ) : isPlayback && playbackStarted ? (
                          // 放映模式 + 已开始放映：仅当前回合/之前的回合格支持「手动记录/手动输入」，所有回合格都支持「回溯」
                          <>
                            {(isCurrentTurn ||
                              roundIndex < (currentTurn?.round ?? Infinity) ||
                              (roundIndex === (currentTurn?.round ?? -1) &&
                                (combatants.findIndex(x => x.id === c.id)) < (currentTurn?.combatantIdx ?? Infinity))
                            ) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenManualRecord();
                                  }}
                                  className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                                  title="手动记录"
                                >
                                  <Pencil className="w-3 h-3" />
                                  记录
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSetEditingCell({ round: roundIndex, combatantId: c.id });
                                    onSetSelectedCell(null);
                                  }}
                                  className="text-xs px-2 py-0.5 rounded border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors flex items-center gap-1"
                                  title="手动输入"
                                >
                                  <Keyboard className="w-3 h-3" />
                                  手动输入
                                </button>
                              </>
                            ) : null}
                            {/* 放映模式：任何已过/当前/后续回合格都提供回溯（只要不是纯占位符） */}
                            {action !== '被突袭' && action !== '昏迷' && action !== '死亡' && (() => {
                              const cidx = combatants.findIndex(x => x.id === c.id);
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // 打开回溯确认弹窗：第一次点击 firstClickDone，第二次确认
                                    onOpenRewind(roundIndex, c.id, cidx);
                                  }}
                                  className="text-xs px-2 py-0.5 rounded border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
                                  title="回溯到此回合（之后所有记录清空并还原生命值/沙盘）"
                                >
                                  <Undo2 className="w-3 h-3" />
                                  回溯到此
                                </button>
                              );
                            })()}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenManualRecord();
                              }}
                              className="p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-1 text-xs"
                              title="手动记录"
                            >
                              <Pencil className="w-3 h-3" />
                              记录
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSetEditingCell({ round: roundIndex, combatantId: c.id });
                                onSetSelectedCell(null);
                              }}
                              className="text-xs px-2 py-0.5 rounded border dark:border-border-dark light:border-border-light hover:bg-white/5 transition-colors flex items-center gap-1"
                              title="手动输入"
                            >
                              <Keyboard className="w-3 h-3" />
                              手动输入
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-xs min-h-[2em]">{action || ''}</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
