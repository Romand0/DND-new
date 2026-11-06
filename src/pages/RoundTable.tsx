// DM 圆桌页：左侧发起检定表单，右侧消息流（发起的请求状态 + 收到的结果）
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Send, Ban, Dices, Inbox, Hourglass } from 'lucide-react';
import type { TableMessage, CheckRequestPayload, CheckResultPayload, CheckKind, DcMode } from '@/types/roundTable';
import { SKILL_LABELS, ABILITY_LABELS } from '@/types/roundTable';
import { useRoundTableInbox } from '@/hooks/useRoundTableInbox';
import type { BoundCharacterInfo } from '@/types/roundTable';
import * as api from '@/lib/api';

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
type AbilityKeyStr = (typeof ABILITY_KEYS)[number];

const CHECK_KIND_OPTIONS: { value: CheckKind; label: string }[] = [
  { value: 'ability', label: '属性检定' },
  { value: 'skill', label: '技能检定' },
  { value: 'save', label: '豁免检定' },
];

const DC_MODE_OPTIONS: { value: DcMode; label: string; hint: string }[] = [
  { value: 'open', label: '明牌 DC', hint: '玩家可见 DC 与判定结论' },
  { value: 'hidden_dc', label: '隐藏 DC', hint: '玩家只见成功/失败' },
  { value: 'value_only', label: '仅回传数值', hint: '玩家不判定，由 DM 判定' },
];

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export default function RoundTable() {
  const inbox = useRoundTableInbox();
  const outbox = useRoundTableInbox({ outbox: true });

  const [boundChars, setBoundChars] = useState<BoundCharacterInfo[]>([]);
  const [charId, setCharId] = useState('');
  const [checkKind, setCheckKind] = useState<CheckKind>('ability');
  const [checkKey, setCheckKey] = useState<AbilityKeyStr>('strength');
  const [dcText, setDcText] = useState('15');
  const [dcMode, setDcMode] = useState<DcMode>('open');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.fetchBoundCharacters()
      .then(res => setBoundChars((res.characters ?? []) as BoundCharacterInfo[]))
      .catch(e => setError(e?.message || '加载绑定角色失败'));
  }, []);

  // 检定项选项随类型联动
  const checkKeyOptions = useMemo(() => {
    if (checkKind === 'skill') {
      return Object.entries(SKILL_LABELS).map(([key, v]) => ({ key, label: `${v.label}（${ABILITY_LABELS[v.ability]}）` }));
    }
    return ABILITY_KEYS.map(k => ({ key: k, label: ABILITY_LABELS[k] }));
  }, [checkKind]);

  useEffect(() => { setCheckKey(checkKeyOptions[0]?.key as AbilityKeyStr || 'strength'); }, [checkKind, checkKeyOptions]);

  const selectedLabel = useMemo(() => {
    if (checkKind === 'skill') return `${SKILL_LABELS[checkKey]?.label ?? ''}检定`;
    if (checkKind === 'save') return `${ABILITY_LABELS[checkKey as AbilityKeyStr]}豁免`;
    return `${ABILITY_LABELS[checkKey as AbilityKeyStr]}检定`;
  }, [checkKind, checkKey]);

  // 消息配对：发起的 request → 对应 result（via replyMessageId）
  const { requests, resultById } = useMemo(() => {
    const rbs = new Map<string, TableMessage & { payload: CheckResultPayload }>();
    for (const m of inbox.messages) {
      if (m.type === 'check_result') {
        rbs.set((m.payload as CheckResultPayload).replyTo, m as TableMessage & { payload: CheckResultPayload });
      }
    }
    const reqs = outbox.messages.filter(m => m.type === 'check_request').sort((a, b) => b.createdAt - a.createdAt);
    return { requests: reqs, resultById: rbs };
  }, [inbox.messages, outbox.messages]);

  const submit = useCallback(async () => {
    const char = boundChars.find(c => c.id === charId);
    if (!char) { setError('请选择目标角色'); return; }
    const dc = parseInt(dcText, 10);
    if (!Number.isFinite(dc) || dc < 1 || dc > 30) { setError('DC 需为 1-30 的数值'); return; }
    setSending(true);
    setError('');
    setNotice('');
    try {
      await api.sendCheckRequest({
        characterId: charId,
        checkKind,
        checkKey,
        checkLabel: selectedLabel,
        dc,
        dcMode,
        note: note.trim(),
      });
      setNotice(`已抛送：${char.name} · ${selectedLabel} · DC ${dc}`);
      setNote('');
      outbox.refresh();
    } catch (e: any) {
      setError(e?.message || '抛送失败，请重试');
    } finally {
      setSending(false);
    }
  }, [boundChars, charId, checkKind, checkKey, selectedLabel, dcText, dcMode, note, outbox]);

  const cancel = useCallback(async (messageId: string) => {
    try {
      await api.cancelCheckRequest(messageId);
      outbox.refresh();
    } catch (e: any) {
      setError(e?.message || '撤回失败');
    }
  }, [outbox]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">圆桌</h1>
        <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mt-1">
          向玩家抛送检定任务，接收答复结果；后续圆桌材料也将在此扩展
          {(inbox.connectionLost || outbox.connectionLost) && <span className="ml-2 text-xs text-red-500">（连接中断，重试中）</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 发起表单 */}
        <div className="lg:col-span-2 rounded-xl border p-4 dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light space-y-3 self-start">
          <div className="text-sm font-medium dark:text-text-dark light:text-text-light flex items-center gap-1.5">
            <Dices className="w-4 h-4 text-accent" />
            发起通用检定
          </div>

          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">目标角色（已绑定玩家账号）</label>
            <select
              value={charId}
              onChange={e => setCharId(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border text-sm dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
            >
              <option value="">选择角色…</option>
              {boundChars.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.boundUserName}）
                </option>
              ))}
            </select>
            {boundChars.length === 0 && (
              <div className="text-xs mt-1 text-amber-500">
                暂无已绑定角色，请先在 设置 → 账户一览 为玩家账号绑定角色卡
              </div>
            )}
          </div>

          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">检定类型</label>
            <div className="flex gap-1.5">
              {CHECK_KIND_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setCheckKind(o.value)}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    checkKind === o.value
                      ? 'bg-primary text-white'
                      : 'dark:bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted hover:text-primary'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">检定项</label>
            <select
              value={checkKey}
              onChange={e => setCheckKey(e.target.value as AbilityKeyStr)}
              className="w-full px-2.5 py-2 rounded-lg border text-sm dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
            >
              {checkKeyOptions.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">DC（1-30）</label>
            <input
              type="number"
              min={1}
              max={30}
              value={dcText}
              onChange={e => setDcText(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border text-sm dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">DC 可见性</label>
            <div className="space-y-1">
              {DC_MODE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setDcMode(o.value)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                    dcMode === o.value
                      ? 'bg-primary/15 text-primary border border-primary/40'
                      : 'dark:bg-bg-dark-dark light:bg-bg-light-3 dark:text-text-dark-muted light:text-text-light-muted border border-transparent hover:text-primary'
                  }`}
                >
                  <span className="font-medium">{o.label}</span>
                  <span className="ml-1.5 opacity-70">· {o.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1 block">DM 附言（可选）</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={500}
              placeholder="例如：翻越城墙，失败摔落 1d6"
              className="w-full px-2.5 py-2 rounded-lg border text-sm dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light outline-none focus:border-primary"
            />
          </div>

          {error && <div className="text-xs rounded-lg p-2.5 bg-red-500/10 text-red-500">{error}</div>}
          {notice && <div className="text-xs rounded-lg p-2.5 bg-emerald-500/10 text-emerald-500">{notice}</div>}

          <button
            onClick={submit}
            disabled={sending || !charId}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {sending ? '抛送中…' : '抛送检定'}
          </button>
        </div>

        {/* 消息流 */}
        <div className="lg:col-span-3 space-y-3">
          {requests.length === 0 && (
            <div className="rounded-xl border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light p-10 text-center">
              <Inbox className="w-10 h-10 mx-auto dark:text-text-dark-muted light:text-text-light-muted opacity-40" />
              <div className="mt-3 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                暂无抛送记录，左侧发起第一个检定
              </div>
            </div>
          )}
          {requests.map(msg => {
            const payload = msg.payload as CheckRequestPayload;
            const result = resultById.get(msg.id);
            return (
              <div
                key={msg.id}
                className="rounded-xl border p-4 dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-sm font-bold dark:text-text-dark light:text-text-light">
                    {payload.characterName} · {payload.checkLabel}
                  </div>
                  {msg.status === 'pending' && (
                    <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                      <Hourglass className="w-3.5 h-3.5" />
                      等待答复
                    </span>
                  )}
                  {msg.status === 'answered' && (
                    <span className="text-xs text-emerald-500 shrink-0">已答复</span>
                  )}
                  {msg.status === 'cancelled' && (
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted shrink-0">已撤回</span>
                  )}
                </div>
                <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                  DC {payload.dcMode === 'value_only' ? '（不判定）' : payload.dc}
                  {payload.dcMode === 'hidden_dc' ? '（玩家不可见）' : ''}
                  {payload.note ? ` · ${payload.note}` : ''} · {new Date(msg.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>

                {result && <ResultCard result={result.payload} />}

                {msg.status === 'pending' && (
                  <button
                    onClick={() => cancel(msg.id)}
                    className="mt-2 flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    撤回
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** DM 端结果卡：d20 明细 + 加值 + 应用值 + 判定 */
function ResultCard({ result }: { result: CheckResultPayload }) {
  return (
    <div className="mt-2 rounded-lg p-3 dark:bg-bg-dark light:bg-bg-light-2 space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="dark:text-text-dark-muted light:text-text-light-muted">
          d20{result.d20s.length > 1 ? `（${result.d20s.join(' / ')}，${result.rollMode === 'advantage' ? '优势取高' : '劣势取低'}）` : ''}
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
      {result.autoOutcome && (
        <div className={`text-xs font-bold ${result.autoOutcome === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
          {result.autoOutcome === 'success' ? '判定：成功' : '判定：失败'}
        </div>
      )}
    </div>
  );
}
