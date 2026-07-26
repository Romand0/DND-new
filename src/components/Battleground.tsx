// 网格沙盘组件 —— 展示参战者位置与移动，支持三种大小预设
import { useState, useEffect, useMemo } from 'react';
import { Grid3x3, Eraser, Trash2 } from 'lucide-react';
import battlegroundStore from '@/data/battlegroundStore';
import { GRID_PRESETS } from '@/types/battleground';
import type { Battleground as BG, GridSize } from '@/types/battleground';
import type { Combatant } from '@/types/combat';

interface Props {
  sessionId: string;
  combatants: Combatant[];
}

export default function Battleground({ sessionId, combatants }: Props) {
  const [bg, setBg] = useState<BG | null>(null);
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [eraserMode, setEraserMode] = useState(false);

  useEffect(() => {
    setBg(battlegroundStore.getOrCreate(sessionId));
    const unsub = battlegroundStore.subscribe(() => {
      setBg(battlegroundStore.get(sessionId));
    });
    return unsub;
  }, [sessionId]);

  // 参战者地图，便于查名称/PC标记
  const combatantMap = useMemo(() => {
    const m = new Map<string, Combatant>();
    combatants.forEach((c) => m.set(c.id, c));
    return m;
  }, [combatants]);

  // 棋子坐标索引：combatantId -> token
  const tokenMap = useMemo(() => {
    const m = new Map<string, { col: number; row: number }>();
    bg?.tokens.forEach((t) => m.set(t.combatantId, { col: t.col, row: t.row }));
    return m;
  }, [bg?.tokens]);

  // 格子 -> 棋子 反向索引
  const cellToken = useMemo(() => {
    const m = new Map<string, string>(); // "col,row" -> combatantId
    bg?.tokens.forEach((t) => m.set(`${t.col},${t.row}`, t.combatantId));
    return m;
  }, [bg?.tokens]);

  if (!bg) return null;

  const preset = GRID_PRESETS[bg.size];

  const handleCellClick = (col: number, row: number) => {
    const existingCombatantId = cellToken.get(`${col},${row}`);
    if (eraserMode) {
      if (existingCombatantId) battlegroundStore.removeToken(sessionId, existingCombatantId);
      return;
    }
    if (!selectedCombatantId) {
      // 未选中参战者：若格子有棋子则移除
      if (existingCombatantId) battlegroundStore.removeToken(sessionId, existingCombatantId);
      return;
    }
    // 放置/移动选中的参战者
    battlegroundStore.placeToken(sessionId, { combatantId: selectedCombatantId, col, row });
    setSelectedCombatantId(null); // 放置后取消选中
  };

  const handleSizeChange = (size: GridSize) => {
    battlegroundStore.setSize(sessionId, size);
  };

  const handleClear = () => {
    if (confirm('确定清空所有棋子吗？')) battlegroundStore.clearTokens(sessionId);
  };

  // 未放置的参战者（用于列表选择）
  const unplaced = combatants.filter((c) => !tokenMap.has(c.id));

  // 单元格尺寸：根据大小预设调整，保证整体可见
  const cellSize = bg.size === 'small' ? 28 : bg.size === 'medium' ? 22 : 18;

  return (
    <div className="rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-3 sm:p-4 space-y-3">
      {/* 标题与工具栏 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Grid3x3 className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-base sm:text-lg font-bold dark:text-text-dark light:text-text-light">
            战斗沙盘
          </h2>
          <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
            {preset.cols}×{preset.rows}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 大小切换 */}
          <div className="flex rounded-lg border dark:border-border-dark light:border-border-light overflow-hidden">
            {(Object.keys(GRID_PRESETS) as GridSize[]).map((s) => (
              <button
                key={s}
                onClick={() => handleSizeChange(s)}
                className={`px-2 py-1 text-xs transition-colors ${
                  bg.size === s
                    ? 'bg-primary text-white'
                    : 'dark:text-text-dark light:text-text-light hover:bg-white/5'
                }`}
              >
                {s === 'small' ? '小' : s === 'medium' ? '中' : '大'}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setEraserMode((v) => !v);
              setSelectedCombatantId(null);
            }}
            className={`px-2 py-1 text-xs rounded-lg border flex items-center gap-1 transition-colors ${
              eraserMode
                ? 'bg-danger text-white border-danger'
                : 'dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">橡皮</span>
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-danger/10 hover:text-danger transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">清空</span>
          </button>
        </div>
      </div>

      {/* 参战者选择条 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">
          {selectedCombatantId ? '点击格子放置：' : eraserMode ? '橡皮模式：点击棋子移除' : '选择参战者放置，或点击已有棋子移除：'}
        </span>
        {unplaced.length === 0 && !selectedCombatantId && !eraserMode && (
          <span className="text-xs italic dark:text-text-dark-muted light:text-text-light-muted">
            所有参战者已放置
          </span>
        )}
        {unplaced.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setSelectedCombatantId(c.id === selectedCombatantId ? null : c.id);
              setEraserMode(false);
            }}
            className={`px-2 py-1 text-xs rounded-full border transition-colors ${
              selectedCombatantId === c.id
                ? 'bg-primary text-white border-primary'
                : c.isPc
                ? 'border-info/50 text-info hover:bg-info/10'
                : 'border-danger/50 text-danger hover:bg-danger/10'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* 网格 */}
      <div className="overflow-auto max-h-[70vh] rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light-2">
        <div
          className="grid touch-none"
          style={{
            gridTemplateColumns: `repeat(${preset.cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${preset.rows}, ${cellSize}px)`,
            width: 'max-content',
          }}
        >
          {Array.from({ length: preset.cols * preset.rows }).map((_, i) => {
            const col = i % preset.cols;
            const row = Math.floor(i / preset.cols);
            const key = `${col},${row}`;
            const combatantId = cellToken.get(key);
            const combatant = combatantId ? combatantMap.get(combatantId) : null;
            const isHover = selectedCombatantId && !eraserMode;
            return (
              <div
                key={i}
                onClick={() => handleCellClick(col, row)}
                className={`border dark:border-border-dark/40 light:border-border-light/40 flex items-center justify-center cursor-pointer transition-colors ${
                  isHover ? 'hover:bg-primary/20' : ''
                } ${eraserMode && combatantId ? 'hover:bg-danger/30' : ''}`}
                style={{ width: cellSize, height: cellSize }}
                title={combatant ? combatant.name : `${col},${row}`}
              >
                {combatant && (
                  <div
                    className={`rounded-full flex items-center justify-center font-bold text-white leading-none ${
                      combatant.isPc ? 'bg-info' : 'bg-danger'
                    }`}
                    style={{
                      width: cellSize - 6,
                      height: cellSize - 6,
                      fontSize: cellSize > 22 ? 11 : 9,
                    }}
                  >
                    {combatant.name.slice(0, 1)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 text-xs dark:text-text-dark-muted light:text-text-light-muted">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-info" />
          玩家角色
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-danger" />
          NPC/敌人
        </div>
      </div>
    </div>
  );
}
