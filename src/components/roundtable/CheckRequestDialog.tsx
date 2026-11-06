// 玩家检定弹窗：展示检定详情 → 投骰/手填 d20 → 引擎加工 → 判定回传
// dcMode 三档：open 显示 DC 与判定；hidden_dc 隐 DC 显判定；value_only 不判定仅回传数值
import { useMemo, useState } from 'react';
import { X, Dices, CheckCircle2, XCircle, Send } from 'lucide-react';
import type { Character } from '@/types/character';
import type { TableMessage, CheckRequestPayload, CheckResultPayload, DcMode } from '@/types/roundTable';
import { runCheckPipeline, judgeCheck, type CheckPipelineResult } from '@/lib/checkPipeline';
import { rollDice } from '@/data/diceService';
import * as api from '@/lib/api';

interface Props {
  message: TableMessage;
  payload: CheckRequestPayload;
  character: Character | null;
  onSubmitted: () => void;
  onClose: () => void;
}

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export default function CheckRequestDialog({ message, payload, character, onSubmitted, onClose }: Props) {
  const [d20Inputs, setD20Inputs] = useState<string[]>(['']);
  const [submitted, setSubmitted] = useState<CheckResultPayload | null>(null);
  const [autoOutcome, setAutoOutcome] = useState<'success' | 'fail' | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 优劣势在提交前不预判展示——由 DM 检定上下文决定，玩家端按实际掷骰数提交（1 或 2 骰）
  const [diceCount, setDiceCount] = useState<1 | 2>(1);

  const parsedD20s = useMemo(
    () => d20Inputs.slice(0, diceCount).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n >= 1 && n <= 20),
    [d20Inputs, diceCount]
  );
  const allFilled = parsedD20s.length === diceCount;

  const showDc = payload.dcMode === 'open';
  const showOutcome = payload.dcMode !== 'value_only';

  const roll = () => {
    const res = rollDice({ sides: 20, count: diceCount, mode: 'independent', source: 'roundtable-check' });
    setD20Inputs(res.values.map(v => String(v)));
  };

  const submit = async () => {
    if (!character) {
      setError('本地缺少该角色卡数据，无法加工检定');
      return;
    }
    if (!allFilled) {
      setError(`请输入 1-20 之间的 d20 数值（共 ${diceCount} 骰）`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const pipeline = runCheckPipeline(character, payload.checkKind, payload.checkKey, parsedD20s);
      const outcome = showOutcome ? judgeCheck(pipeline.appliedValue, payload.dc) : null;
      const resultPayload: CheckResultPayload = {
        replyTo: message.id,
        d20s: parsedD20s,
        d20Kept: pipeline.d20Kept,
        rollMode: pipeline.rollMode,
        modeReasons: pipeline.modeReasons,
        bonuses: pipeline.bonuses,
        appliedValue: pipeline.appliedValue,
        autoOutcome: outcome,
        submittedAt: Date.now(),
      };
      await api.sendCheckResult({
        replyTo: message.id,
        d20s: resultPayload.d20s,
        d20Kept: resultPayload.d20Kept,
        rollMode: resultPayload.rollMode,
        modeReasons: resultPayload.modeReasons,
        bonuses: resultPayload.bonuses,
        appliedValue: resultPayload.appliedValue,
        autoOutcome: resultPayload.autoOutcome,
      });
      setSubmitted(resultPayload);
      setAutoOutcome(outcome);
      onSubmitted();
    } catch (e: any) {
      setError(e?.message || '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-xl p-5 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4 gap-2">
          <div>
            <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">检定请求</h3>
            <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted mt-0.5">
              DM 发给「{payload.characterName}」
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="space-y-4">
            {showOutcome && autoOutcome && (
              <div className={`flex items-center justify-center gap-2 py-3 rounded-lg text-lg font-bold ${
                autoOutcome === 'success'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-red-500/15 text-red-500'
              }`}>
                {autoOutcome === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                {autoOutcome === 'success' ? '检定成功' : '检定失败'}
              </div>
            )}
            {showOutcome && payload.dcMode === 'hidden_dc' && (
              <div className="text-xs text-center dark:text-text-dark-muted light:text-text-light-muted">
                DC 已隐藏，仅展示判定结论
              </div>
            )}
            {payload.dcMode === 'value_only' && (
              <div className="text-xs text-center dark:text-text-dark-muted light:text-text-light-muted">
                数值已回传 DM，由 DM 判定结果
              </div>
            )}
            <ResultDetail result={submitted} />
            <button
              onClick={onClose}
              className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors"
            >
              完成
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg p-3 dark:bg-bg-dark light:bg-bg-light-2 space-y-1.5">
              <div className="text-sm font-medium dark:text-text-dark light:text-text-light">
                {payload.checkLabel}
              </div>
              {payload.note && (
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  DM 附言：{payload.note}
                </div>
              )}
              <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted flex items-center gap-2 flex-wrap">
                <span>DC：</span>
                {showDc ? (
                  <span className="text-primary font-bold">{payload.dc}</span>
                ) : payload.dcMode === 'hidden_dc' ? (
                  <span>已隐藏</span>
                ) : (
                  <span>无需判定</span>
                )}
              </div>
            </div>

            {!character && (
              <div className="text-xs rounded-lg p-2.5 bg-red-500/10 text-red-500">
                本地缺少「{payload.characterName}」的角色卡数据，无法加工加值。请先在角色卡页面同步数据。
              </div>
            )}

            {character && (
              <BonusPreview character={character} payload={payload} />
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  d20 结果{diceCount === 2 ? '（优势/劣势双骰）' : ''}
                </label>
                <div className="flex items-center gap-1.5">
                  {diceCount === 2 && (
                    <button
                      onClick={() => { setDiceCount(1); setD20Inputs(['']); }}
                      className="text-xs px-2 py-0.5 rounded dark:bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary transition-colors"
                    >
                      改单骰
                    </button>
                  )}
                  {diceCount === 1 && (
                    <button
                      onClick={() => { setDiceCount(2); setD20Inputs(['', '']); }}
                      className="text-xs px-2 py-0.5 rounded dark:bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary transition-colors"
                      title="优势/劣势检定：掷两枚 d20"
                    >
                      双骰
                    </button>
                  )}
                  <button
                    onClick={roll}
                    disabled={!character}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    掷骰
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {Array.from({ length: diceCount }).map((_, i) => (
                  <input
                    key={i}
                    type="number"
                    min={1}
                    max={20}
                    value={d20Inputs[i] ?? ''}
                    onChange={(e) => {
                      const next = [...d20Inputs];
                      next[i] = e.target.value;
                      setD20Inputs(next);
                    }}
                    className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
                    placeholder={`d20 #${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="text-xs rounded-lg p-2.5 bg-red-500/10 text-red-500">{error}</div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                稍后答复
              </button>
              <button
                onClick={submit}
                disabled={submitting || !character || !allFilled}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? '提交中…' : '提交答复'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 提交前的加值预估（不含优劣势裁决——d20 数量由玩家自行选择） */
function BonusPreview({ character, payload }: { character: Character; payload: CheckRequestPayload }) {
  const pipeline = useMemo(
    () => runCheckPipeline(character, payload.checkKind, payload.checkKey, [1]),
    [character, payload.checkKind, payload.checkKey]
  );
  const bonusSum = pipeline.bonuses.reduce((s, b) => s + b.value, 0);
  return (
    <div className="rounded-lg p-3 dark:bg-bg-dark light:bg-bg-light-2">
      <div className="text-xs font-medium dark:text-text-dark-muted light:text-text-light-muted mb-1.5">加值明细</div>
      <div className="space-y-1">
        {pipeline.bonuses.map((b, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="dark:text-text-dark-muted light:text-text-light-muted">{b.label}</span>
            <span className="text-primary font-bold font-mono">{fmt(b.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-xs border-t dark:border-border-dark light:border-border-light pt-1">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">d20 + 加值合计</span>
          <span className="text-accent font-bold font-mono">d20 {fmt(bonusSum)}</span>
        </div>
      </div>
    </div>
  );
}

/** 提交后的加工明细回执 */
function ResultDetail({ result }: { result: CheckResultPayload }) {
  return (
    <div className="rounded-lg p-3 dark:bg-bg-dark light:bg-bg-light-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="dark:text-text-dark-muted light:text-text-light-muted">
          d20{result.d20s.length > 1 ? `（${result.d20s.join(' / ')}）` : ''}
        </span>
        <span className="text-primary font-bold font-mono">{result.d20Kept}</span>
      </div>
      {result.modeReasons.length > 0 && (
        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          优劣势：{result.modeReasons.join('；')}
        </div>
      )}
      {result.bonuses.map((b, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="dark:text-text-dark-muted light:text-text-light-muted">{b.label}</span>
          <span className="text-primary font-bold font-mono">{fmt(b.value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-xs border-t dark:border-border-dark light:border-border-light pt-1">
        <span className="font-medium dark:text-text-dark light:text-text-light">应用值</span>
        <span className="text-accent font-bold font-mono text-sm">{result.appliedValue}</span>
      </div>
    </div>
  );
}
