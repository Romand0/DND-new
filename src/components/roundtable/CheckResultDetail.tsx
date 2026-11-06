// 检定结果明细卡：圆桌回执与检定计算器共用（Pick 子集形状，不要求完整 CheckResultPayload）
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

interface Props {
  d20s: number[];
  d20Kept: number;
  modeReasons: string[];
  bonuses: { label: string; value: number }[];
  appliedValue: number;
}

export default function CheckResultDetail({ d20s, d20Kept, modeReasons, bonuses, appliedValue }: Props) {
  return (
    <div className="rounded-lg p-3 dark:bg-bg-dark light:bg-bg-light-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="dark:text-text-dark-muted light:text-text-light-muted">
          d20{d20s.length > 1 ? `（${d20s.join(' / ')}）` : ''}
        </span>
        <span className="text-primary font-bold font-mono">{d20Kept}</span>
      </div>
      {modeReasons.length > 0 && (
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          优劣势：{modeReasons.join('；')}
        </div>
      )}
      {bonuses.map((b, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">{b.label}</span>
          <span className="text-primary font-bold font-mono">{fmt(b.value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs border-t dark:border-border-dark light:border-border-light pt-1">
        <span className="font-medium dark:text-text-dark light:text-text-light">应用值</span>
        <span className="text-accent font-bold font-mono text-sm">{appliedValue}</span>
      </div>
    </div>
  );
}
