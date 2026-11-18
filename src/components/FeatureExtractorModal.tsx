// 特性数据提取器弹窗（feature-fullcycle P2）
// 单项流程：特性描述 → 提取核心正则候选 → 命中高亮 + spec JSON 预填 → 人工确认/修正 → 校验 → 复制合并进 phb2014.json
// 决策 5：无静默默认——低置信（manual=true）候选亮警示条，生成物必须过 validateFeatureSpecDb 才可复制
import { useMemo, useState, useEffect } from 'react';
import { X, Copy, Check, AlertTriangle, FileJson, Search } from 'lucide-react';
import { runFeatureExtract, validateSpecDraft } from '@/data/featureExtract';
import type { ExtractCandidate } from '@/data/featureExtract';

interface Props {
  /** 目标特性（种子名 / 角色卡特性名一致，作为 spec 键） */
  featureName: string;
  description: string;
  onClose: () => void;
}

const CHANNEL_LABEL: Record<string, string> = {
  heal: '治疗 heal',
  resource_conv: '资源转换 resource_conv',
};

/** 候选草案 → 可合并 JSON 文本（source/confidence 作人工合并参考，校验器允许额外字段？——
 *  校验器只认 channel/spec，其余字段会被 seed 合并时剔除，故 draft 仅含 channel+spec） */
function draftOf(cand: ExtractCandidate | null): string {
  const entry = cand
    ? { channel: cand.channel, spec: cand.spec }
    : { channel: '', spec: {} };
  return JSON.stringify(entry, null, 2);
}

export default function FeatureExtractorModal({ featureName, description, onClose }: Props) {
  const result = useMemo(() => runFeatureExtract(featureName, description), [featureName, description]);
  const candidates = result.candidates;
  // 候选索引：白名单内有草案时默认选最高置信那条；无草案（suggest/unmatched）→ -1 空模板
  const [candIdx, setCandIdx] = useState(candidates.length > 0 ? 0 : -1);
  const active: ExtractCandidate | null = candIdx >= 0 ? candidates[candIdx] : null;
  const [draftJson, setDraftJson] = useState(() => draftOf(active));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraftJson(draftOf(active));
    setCopied(false);
  }, [candIdx, active]);

  const errors = useMemo(() => {
    try {
      const parsed = JSON.parse(draftJson);
      return validateSpecDraft(featureName, parsed);
    } catch (e) {
      return [`JSON 解析失败：${(e as Error).message}`];
    }
  }, [draftJson, featureName]);

  const handleCopy = async () => {
    if (errors.length > 0) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ [featureName]: JSON.parse(draftJson) }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默（如非 https 环境），用户可手选 textarea 复制
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border light:bg-bg-light dark:bg-bg-dark-2 border-gray-300 dark:border-gray-600 p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
        data-testid="feature-extractor-modal"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-accent" />
            <h3 className="font-bold text-sm light:text-text-light dark:text-text-dark">
              特性数据提取：<span className="text-accent">{featureName}</span>
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="关闭">
            <X size={18} />
          </button>
        </div>

        {/* 候选渠道切换：白名单内草案 tab + 无草案时的空模板 */}
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c, i) => (
            <button
              key={c.channel}
              onClick={() => setCandIdx(i)}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                candIdx === i
                  ? 'bg-accent/20 border-accent text-accent font-bold'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-accent'
              }`}
            >
              {CHANNEL_LABEL[c.channel] ?? c.channel} · {c.confidence}
            </button>
          ))}
          <button
            onClick={() => setCandIdx(-1)}
            className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
              candIdx === -1
                ? 'bg-accent/20 border-accent text-accent font-bold'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-accent'
            }`}
          >
            空白模板
          </button>
        </div>

        {/* 渠道预推荐 / 白名单外建议提示 */}
        {result.guess && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            预推荐：{result.guess.reason}
          </div>
        )}

        {/* 低置信警示条（manual=true：提取器禁止静默填默认） */}
        {active?.manual && (
          <div className="flex items-start gap-2 rounded border border-amber-400/60 bg-amber-400/10 px-2.5 py-2 text-xs light:text-amber-700 dark:text-amber-300" data-testid="extractor-manual-warning">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>低置信候选（{active.confidence}），需人工确认：{active.manualReason}</span>
          </div>
        )}

        {/* 描述原文 + 命中高亮 */}
        <div className="rounded border border-gray-200 dark:border-gray-700 light:bg-bg-light-2 dark:bg-bg-dark-3 p-2.5">
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1.5">描述原文（命中片段高亮）</div>
          <div className="text-xs leading-relaxed light:text-text-light dark:text-text-dark whitespace-pre-wrap break-all">
            {active?.highlight && description.includes(active.highlight.text) ? (
              (() => {
                const start = description.indexOf(active.highlight.text);
                const end = start + active.highlight.text.length;
                return (
                  <>
                    {description.slice(0, start)}
                    <mark className="bg-accent/25 text-inherit rounded px-0.5">{active.highlight.text}</mark>
                    {description.slice(end)}
                  </>
                );
              })()
            ) : (
              description || '（无描述文本）'
            )}
          </div>
          {/* 命中成分明细 */}
          {active && active.hits.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {active.hits.slice(1).map((h, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]">
                  {h.label}: {h.text}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* draft JSON 编辑区 */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
            <FileJson size={13} />
            spec 草案（JSON，直接编辑）
          </div>
          <textarea
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
            spellCheck={false}
            rows={8}
            className="w-full rounded border border-gray-300 dark:border-gray-600 light:bg-white dark:bg-bg-dark-3 p-2 text-xs font-mono light:text-text-light dark:text-text-dark focus:outline-none focus:border-accent"
            data-testid="extractor-draft"
          />
        </div>

        {/* 校验状态 + 复制 */}
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs" data-testid="extractor-validate">
            {errors.length === 0 ? (
              <span className="text-green-600 dark:text-green-400 font-bold">校验通过</span>
            ) : (
              <span className="text-red-500 dark:text-red-400">
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </span>
            )}
          </div>
          <button
            onClick={handleCopy}
            disabled={errors.length > 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-colors ${
              errors.length > 0
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-accent text-white hover:opacity-90'
            }`}
            title={errors.length > 0 ? '修正校验错误后可复制' : `复制 ${featureName} 条目`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? '已复制' : '复制条目'}
          </button>
        </div>

        {/* 合并指引 */}
        <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed border-t border-gray-200 dark:border-gray-700 pt-2">
          复制后人工合并进 src/data/featureSpecs/phb2014.json 并提交；构建期 schema 校验会拦截非法条目。渠道白名单当前：heal / resource_conv（P3/P4 逐步扩展）。
        </div>
      </div>
    </div>
  );
}
