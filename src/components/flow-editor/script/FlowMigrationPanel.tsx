import React from 'react';
import { AlertTriangle, XCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import type { MigrationWarning } from '@/types/flowScript';

// 迁移过渡面板：旧图流程首次进入积木编辑时一次性确认。
// 迁移失败（no_cast_start）→ 阻止编辑；有告警 → 列出后确认进入。

interface FlowMigrationPanelProps {
  /** script 为 null 表示迁移失败 */
  scriptAvailable: boolean;
  warnings: MigrationWarning[];
  isDark: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const KIND_LABELS: Record<MigrationWarning['kind'], string> = {
  back_edge: '回流边（死代码，行为等价）',
  orphan: '不可达节点（行为等价）',
  dropped_edge: '丢弃出边（可能改变行为）',
  asymmetric_join: '不对称汇合（可能改变行为）',
  no_cast_start: '缺少施法入口',
};

export const FlowMigrationPanel: React.FC<FlowMigrationPanelProps> = ({
  scriptAvailable,
  warnings,
  isDark,
  onConfirm,
  onCancel,
}) => {
  const fatal = !scriptAvailable;
  const behavioral = warnings.some(w => w.kind === 'dropped_edge' || w.kind === 'asymmetric_join');

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div
        className={`max-w-lg w-full rounded-xl border p-5 ${isDark ? 'bg-bg-dark-2 border-border-dark' : 'bg-white border-border-light'} shadow-lg`}
      >
        <div className="flex items-center gap-2 mb-3">
          {fatal ? (
            <XCircle className="w-5 h-5 text-red-400" />
          ) : (
            <AlertTriangle className={`w-5 h-5 ${behavioral ? 'text-orange-400' : 'text-yellow-400'}`} />
          )}
          <h3 className="text-sm font-bold">
            {fatal ? '无法转换为积木模式' : behavioral ? '迁移存在行为损失' : '转换为积木模式'}
          </h3>
        </div>

        {fatal ? (
          <p className="text-xs opacity-70 mb-4">
            该流程缺少「施法开始」入口节点，积木模型要求唯一入口。请先在流程数据中补齐入口节点。
          </p>
        ) : (
          <p className="text-xs opacity-70 mb-3">
            检测到旧版自由连线数据。已自动转换为积木结构，以下差异项请知悉：
          </p>
        )}

        {warnings.length > 0 && (
          <ul className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
            {warnings.map((w, i) => (
              <li
                key={i}
                className={`text-xs p-2 rounded border-l-2 ${
                  w.kind === 'dropped_edge' || w.kind === 'asymmetric_join'
                    ? 'border-orange-400 bg-orange-500/5'
                    : 'border-yellow-400 bg-yellow-500/5'
                }`}
              >
                <span className="font-medium opacity-80">[{KIND_LABELS[w.kind]}]</span>{' '}
                <span className="opacity-70">{w.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border dark:border-border-dark light:border-border-light hover:bg-white/5 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />返回列表
          </button>
          {!fatal && (
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:bg-primary/90 inline-flex items-center gap-1"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              {behavioral ? '仍要进入积木编辑' : '进入积木编辑'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlowMigrationPanel;
