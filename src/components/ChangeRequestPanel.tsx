// 变更审批面板（DM 端）：待审徽标按钮 + 请求列表 + 字段级 diff 明细 + 批准/驳回。
// 数据源云端 change-requests；diff 与漂移基准优先用云端正式卡（与 baseUpdatedAt 同为服务器
// 时间戳，时钟域一致），云端拉取失败才回退父级列表/本地桶（降级为旧行为，漂移判断可能失真）。
// 批准支持字段级采纳：勾选的行采纳玩家值，未勾选行回退正式卡现状，合并快照交后端写入。

import { useState, useCallback } from 'react';
import { GitPullRequest, CheckCircle2, XCircle, ChevronLeft, AlertTriangle } from 'lucide-react';
import type { Character } from '@/types/character';
import type { ChangeRequest } from '@/types/changeRequest';
import type { CharacterDiffRow } from '@/types/changeRequest';
import { fetchChangeRequests, fetchAllCharacters, approveChangeRequest, rejectChangeRequest } from '@/lib/api';
import { characterStore } from '@/data/characterStore';
import { diffCharacter, summarizeDiff } from '@/lib/characterDiff';
import { mergeAdoptedFields } from '@/lib/characterAdoption';
import { logChangeRequestApplied } from '@/lib/characterLog';

export default function ChangeRequestPanel({ characters, onChanged }: {
  characters: Character[];
  /** 批准入库后父级刷新列表 */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<ChangeRequest[] | null>(null);
  const [selected, setSelected] = useState<ChangeRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);
  /** 云端正式卡（打开面板时拉取，作为 diff/漂移基准的第一优先级） */
  const [cloudChars, setCloudChars] = useState<Character[] | null>(null);
  /** 字段采纳勾选：null = 全部采纳（默认）；仅收录「未采纳」行 key 以省状态量 */
  const [skipKeys, setSkipKeys] = useState<Set<string> | null>(null);

  const pendingCount = (requests ?? []).filter((r) => r.status === 'pending').length;

  const loadRequests = useCallback(async () => {
    setRequests(null);
    try {
      const list = await fetchChangeRequests<ChangeRequest[]>();
      setRequests(Array.isArray(list) ? list : []);
    } catch {
      setRequests([]);
    }
    // 云端正式卡并行拉取；失败置 null 回退父级/本地基准（不阻塞审批）
    try {
      const chars = await fetchAllCharacters<Character[]>();
      setCloudChars(Array.isArray(chars) ? chars : []);
    } catch {
      setCloudChars(null);
    }
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setSelected(null);
    setSkipKeys(null);
    loadRequests();
  };

  // 基准卡三级回退：云端正式卡 → 父级列表（异步刷新后即云端行）→ 本地桶
  const getBaseCard = (req: ChangeRequest): Character | null =>
    cloudChars?.find((c) => c.id === req.characterId)
      ?? characters.find((c) => c.id === req.characterId)
      ?? characterStore.get(req.characterId);

  const getVersionDrift = (req: ChangeRequest): boolean => {
    const base = getBaseCard(req);
    if (!base) return false;
    return (base.updatedAt ?? 0) !== req.baseUpdatedAt;
  };

  /** 当前勾选状态下的合并快照与采纳统计；rows 由调用方按同一基准产出 */
  const buildMerged = (req: ChangeRequest, base: Character, rows: CharacterDiffRow[]):
    { merged: Character; skipped: number } => {
    const adopted = new Set<string>();
    for (const row of rows) {
      if (row.key && skipKeys?.has(row.key)) continue;
      if (row.key) adopted.add(row.key);
    }
    const merged = mergeAdoptedFields(base, req.payload, rows, adopted);
    const skipped = rows.filter((r) => r.key && skipKeys?.has(r.key)).length;
    return { merged, skipped };
  };

  const handleApprove = async (req: ChangeRequest) => {
    const base = getBaseCard(req);
    const rows = base ? diffCharacter(base, req.payload) : [];
    const { merged, skipped } = base
      ? buildMerged(req, base, rows)
      : { merged: req.payload, skipped: 0 };
    const drift = getVersionDrift(req);
    if (drift) {
      if (!window.confirm('正式卡在该请求提交后已被修改过。仍要按当前勾选写入吗？（勾选字段将覆盖正式卡对应值）')) return;
    } else if (skipped > 0) {
      if (!window.confirm(`按勾选写入正式卡？（未勾选的 ${skipped} 项保留正式卡现状）`)) return;
    } else if (!window.confirm(`批准「${req.characterName || req.characterId}」的变更并写入正式卡？`)) {
      return;
    }
    setBusy(true);
    try {
      // 存在未勾选行时回传合并快照；全量采纳走后端原快照（与旧行为等价）
      const res = await approveChangeRequest(req.id, skipped > 0 ? merged : undefined);
      // 快照同步本地桶（后端已写云端；store.update 的再次上云为幂等冗余，保证双端一致最简路径）
      if (res.character) characterStore.update(res.character.id, res.character);
      // 全周期日志：记录实际生效 diff（基准用批准前的正式卡，快照用合并结果）
      if (base) {
        logChangeRequestApplied(req.characterId, diffCharacter(base, merged));
      }
      setSelected(null);
      setSkipKeys(null);
      await loadRequests();
      onChanged();
      if (res.versionDrift) alert('已批准入库（注意：勾选字段覆盖了期间的其他修改）');
      else alert('已批准入库');
    } catch (e) {
      alert(`批准失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (req: ChangeRequest) => {
    if (!rejectNote.trim()) {
      alert('驳回理由必填（玩家可见）');
      return;
    }
    setBusy(true);
    try {
      await rejectChangeRequest(req.id, rejectNote.trim());
      setSelected(null);
      setRejectNote('');
      await loadRequests();
    } catch (e) {
      alert(`驳回失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (r: ChangeRequest) => {
    const map: Record<ChangeRequest['status'], { label: string; cls: string }> = {
      pending: { label: '待审', cls: 'bg-amber-500/20 text-amber-400' },
      approved: { label: '已批准', cls: 'bg-green-500/20 text-green-400' },
      rejected: { label: '已驳回', cls: 'bg-danger/20 text-danger' },
      withdrawn: { label: '已撤回', cls: 'bg-white/10 dark:text-text-dark-muted light:text-text-light-muted' },
    };
    const meta = map[r.status];
    return <span className={`px-1.5 py-0.5 rounded text-[10px] ${meta.cls}`}>{meta.label}</span>;
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors dark:border-border-dark dark:text-text-dark dark:hover:bg-card-dark light:border-border-light light:text-text-light light:hover:bg-card-light whitespace-nowrap"
      >
        <GitPullRequest className="w-3.5 h-3.5" />
        变更审批
        {pendingCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-white text-[10px] leading-[18px] text-center">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { setOpen(false); setSelected(null); }}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl border dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between p-4 border-b dark:border-border-dark light:border-border-light">
              <div className="flex items-center gap-2">
                {selected && (
                  <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className="text-base font-bold dark:text-text-dark light:text-text-light">
                  {selected ? `变更详情 · ${selected.characterName || selected.characterId.slice(0, 8)}` : '玩家变更审批'}
                </h3>
              </div>
              <button onClick={() => { setOpen(false); setSelected(null); }} className="p-1.5 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* 列表视图 */}
            {!selected && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {requests === null ? (
                  <div className="text-center py-8 text-sm dark:text-text-dark-muted light:text-text-light-muted">加载中…</div>
                ) : requests.length === 0 ? (
                  <div className="text-center py-8 text-sm dark:text-text-dark-muted light:text-text-light-muted">暂无变更请求</div>
                ) : (
                  requests.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => { if (r.status === 'pending') { setSelected(r); setSkipKeys(null); } }}
                      disabled={r.status !== 'pending'}
                      className={`w-full text-left rounded-lg border p-3 space-y-1 transition-colors dark:border-border-dark light:border-border-light ${r.status === 'pending' ? 'hover:border-primary' : 'opacity-60'}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusBadge(r)}
                        <span className="text-sm font-medium dark:text-text-dark light:text-text-light">{r.characterName || '未知角色'}</span>
                        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                          {r.requesterName || '玩家'} · {new Date(r.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </div>
                      {r.note && (
                        <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted truncate">说明：{r.note}</div>
                      )}
                      {(() => {
                        const base = getBaseCard(r);
                        const rows = base ? diffCharacter(base, r.payload) : [];
                        const drift = getVersionDrift(r);
                        return (
                          <div className="flex items-center gap-2 text-xs flex-wrap">
                            <span className="dark:text-text-dark-muted light:text-text-light-muted">{summarizeDiff(rows)}</span>
                            {drift && r.status === 'pending' && (
                              <span className="inline-flex items-center gap-1 text-amber-400">
                                <AlertTriangle className="w-3 h-3" /> 版本漂移
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 详情视图 */}
            {selected && (() => {
              const base = getBaseCard(selected);
              const rows: CharacterDiffRow[] = base ? diffCharacter(base, selected.payload) : [];
              const drift = getVersionDrift(selected);
              const adoptableRows = rows.filter((r) => !!r.key);
              const skipCount = adoptableRows.filter((r) => skipKeys?.has(r.key as string)).length;
              const toggleRow = (key: string, checked: boolean) => {
                setSkipKeys((prev) => {
                  const next = new Set(prev ?? []);
                  if (checked) next.delete(key);
                  else next.add(key);
                  return next;
                });
              };
              return (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="px-4 pt-3 space-y-1">
                    <div className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      {selected.requesterName || '玩家'} 提交于 {new Date(selected.createdAt).toLocaleString('zh-CN')}
                      {selected.note ? ` · 说明：${selected.note}` : ''}
                    </div>
                    {drift && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 rounded-lg bg-amber-500/10 px-2.5 py-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        正式卡在此请求提交后已被修改过；批准将按勾选覆盖对应字段
                      </div>
                    )}
                  </div>
                  <div className="px-4 pt-2 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                      采纳 {adoptableRows.length - skipCount}/{adoptableRows.length} 项；未勾选项保留正式卡现状
                    </span>
                    {adoptableRows.length > 0 && (
                      <span className="flex gap-2 text-xs">
                        <button
                          onClick={() => setSkipKeys(new Set())}
                          className="text-primary hover:underline"
                        >全部保留现状</button>
                        <button
                          onClick={() => setSkipKeys(null)}
                          className="text-primary hover:underline"
                        >全部采纳</button>
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                    {rows.length === 0 ? (
                      <div className="text-center py-8 text-sm dark:text-text-dark-muted light:text-text-light-muted">
                        与当前正式卡无差异（可能已被其他修改覆盖）
                      </div>
                    ) : (
                      rows.map((row, i) => {
                        const adopted = row.key ? !skipKeys?.has(row.key) : true;
                        return (
                          <label
                            key={i}
                            className={`flex items-center gap-2 text-xs rounded-lg bg-black/5 dark:bg-white/5 px-2.5 py-1.5 ${row.key ? 'cursor-pointer' : 'opacity-70'}`}
                          >
                            <input
                              type="checkbox"
                              checked={adopted}
                              disabled={!row.key || busy}
                              onChange={(e) => row.key && toggleRow(row.key, e.target.checked)}
                              className="w-3.5 h-3.5 shrink-0 accent-primary"
                              title={row.key ? undefined : '该行暂不支持字段级采纳，批准时将保留玩家值'}
                            />
                            <span className={`w-2 h-2 rounded-full shrink-0 ${row.kind === 'add' ? 'bg-green-500' : row.kind === 'remove' ? 'bg-danger' : 'bg-amber-500'}`} />
                            <span className="font-medium dark:text-text-dark light:text-text-light shrink-0">{row.path}</span>
                            <span className={`dark:text-text-dark-muted light:text-text-light-muted truncate ${adopted ? '' : 'line-through'}`}>
                              {row.kind === 'add' ? `→ ${row.after}` : row.kind === 'remove' ? `（${row.before}）` : `${row.before} → ${row.after}`}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div className="p-4 border-t dark:border-border-dark light:border-border-light space-y-2.5">
                    <input
                      type="text"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="驳回理由（驳回时必填，玩家可见）"
                      className="w-full px-3 py-2 text-sm rounded-lg border outline-none focus:border-primary dark:bg-card-dark-hover dark:border-border-dark dark:text-text-dark light:bg-card-light-hover light:border-border-light light:text-text-light"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleReject(selected)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border text-danger hover:bg-danger/10 disabled:opacity-40 transition-colors"
                      >
                        <XCircle className="w-4 h-4" /> 驳回
                      </button>
                      <button
                        onClick={() => handleApprove(selected)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark disabled:opacity-40 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" /> {busy ? '处理中…' : '批准入库'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
