// 检定计算器（玩家端本地工具，/player/check）：与圆桌抛送并行的轻量模式。
// 玩家在 DM 口头指示下自选检定方式 → 手动掷骰/填骰值 → 引擎算出应用值与明细 → 报给 DM 判定。
// 纯本地计算：无消息收发、无 DM 发起，机制加值与优劣势复用 runCheckPipeline（含手动优劣势覆盖）。
import { useEffect, useMemo, useState } from 'react';
import { Dices, Calculator, CheckCircle2, XCircle } from 'lucide-react';
import type { Character, AbilityKey } from '@/types/character';
import type { CheckKind } from '@/types/roundTable';
import type { ManualMode } from '@/types/combat';
import { SKILL_LABELS } from '@/types/roundTable';
import { runCheckPipeline, judgeCheck, type CheckPipelineResult } from '@/lib/checkPipeline';
import { rollDice } from '@/data/diceService';
import { characterStore } from '@/data/characterStore';
import { fetchMyCharacters } from '@/lib/api';
import CheckResultDetail from '@/components/roundtable/CheckResultDetail';

const ABILITIES: { key: AbilityKey; label: string }[] = [
  { key: 'strength', label: '力量' },
  { key: 'dexterity', label: '敏捷' },
  { key: 'constitution', label: '体质' },
  { key: 'intelligence', label: '智力' },
  { key: 'wisdom', label: '感知' },
  { key: 'charisma', label: '魅力' },
];

const MODE_LABEL: Record<ManualMode, string> = {
  none: '正常',
  advantage: '优势',
  disadvantage: '劣势',
};

export default function CheckCalculator() {
  const [boundChars, setBoundChars] = useState<{ id: string; name: string }[]>([]);
  const [charId, setCharId] = useState('');
  const [checkKind, setCheckKind] = useState<CheckKind>('ability');
  const [checkKey, setCheckKey] = useState<string>('strength');
  const [manualMode, setManualMode] = useState<ManualMode>('none');
  const [diceCount, setDiceCount] = useState<1 | 2>(1);
  const [d20Inputs, setD20Inputs] = useState<string[]>(['']);
  const [dcText, setDcText] = useState('');
  const [bindError, setBindError] = useState('');

  useEffect(() => {
    const loadLocalFallback = () => {
      // 云端绑定不可用时退回本地角色卡（计算器纯本地计算，本地卡即可用；与 PlayerHome 同过滤口径）
      const list = (characterStore.getAllVisible() || [])
        .filter((c: any) => !c.isSandbox && !String(c.name || '').startsWith('试验体·'))
        .map((c: any) => ({ id: c.id, name: c.name ?? '未命名' }));
      setBoundChars(list);
      if (list.length > 0) setCharId(list[0].id);
      else setBindError('云端绑定不可用且本地无角色卡数据，请先在角色卡页面同步');
    };
    fetchMyCharacters()
      .then(({ characters }) => {
        const list = (characters || []).map((c: any) => ({ id: c.id, name: c.name ?? '未命名' }));
        setBoundChars(list);
        if (list.length > 0) setCharId(list[0].id);
        else setBindError('当前账号未绑定角色卡，请让 DM 在账户管理中绑定');
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('401') || msg.includes('未登录')) {
          setBindError('登录态失效，请重新登录');
          return;
        }
        loadLocalFallback();
      });
  }, []);

  // 本地完整角色卡（管线需要 abilities/skills 派生，绑定列表仅提供身份）
  const character: Character | null = charId ? characterStore.get(charId) : null;

  const parsedD20s = useMemo(
    () => d20Inputs.slice(0, diceCount).map(s => parseInt(s, 10)).filter(n => Number.isFinite(n) && n >= 1 && n <= 20),
    [d20Inputs, diceCount],
  );
  const allFilled = parsedD20s.length === diceCount;

  const pipeline: CheckPipelineResult | null = useMemo(() => {
    if (!character) return null;
    try {
      return runCheckPipeline(character, checkKind, checkKey, allFilled ? parsedD20s : [1], manualMode);
    } catch {
      return null;
    }
  }, [character, checkKind, checkKey, manualMode, allFilled, parsedD20s]);

  const dc = parseInt(dcText, 10);
  const outcome = pipeline && allFilled && Number.isFinite(dc) && dc > 0
    ? judgeCheck(pipeline.appliedValue, dc)
    : null;

  const roll = () => {
    const res = rollDice({ sides: 20, count: diceCount, mode: 'independent', source: 'check-calculator' });
    setD20Inputs(res.values.map(v => String(v)));
  };

  const switchKind = (kind: CheckKind) => {
    setCheckKind(kind);
    setCheckKey(kind === 'skill' ? Object.keys(SKILL_LABELS)[0] : 'strength');
  };

  const modeHint = pipeline && pipeline.rollMode !== 'none'
    ? `引擎生效：${MODE_LABEL[pipeline.rollMode as ManualMode]}${pipeline.modeReasons.length > 0 ? `（${pipeline.modeReasons.join('；')}）` : ''}`
    : '';

  const itemGrid = checkKind === 'skill'
    ? Object.entries(SKILL_LABELS).map(([key, meta]) => ({ key, label: meta.label }))
    : ABILITIES.map(a => ({ key: a.key, label: a.label }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold dark:text-text-dark light:text-text-light">检定计算器</h1>
        <p className="text-sm mt-1 dark:text-text-dark-muted light:text-text-light-muted">
          按 DM 指示选择检定方式，掷骰后自动套用角色卡加值与优劣势，报出应用值即可
        </p>
      </div>

      {bindError && (
        <div className="text-xs rounded-lg p-3 bg-red-500/10 text-red-500">{bindError}</div>
      )}

      {/* 角色选择 */}
      {boundChars.length > 0 && (
        <div>
          <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">角色</label>
          <select
            value={charId}
            onChange={(e) => setCharId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
          >
            {boundChars.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {charId && !character && (
            <div className="text-xs mt-1.5 rounded-lg p-2.5 bg-warning/10 text-warning">
              本地缺少该角色的完整卡数据，请先到角色卡页面打开一次完成同步
            </div>
          )}
        </div>
      )}

      {/* 检定类型 */}
      <div className="flex gap-2">
        {([
          { kind: 'ability' as CheckKind, label: '属性' },
          { kind: 'skill' as CheckKind, label: '技能' },
          { kind: 'save' as CheckKind, label: '豁免' },
        ]).map(({ kind, label }) => (
          <button
            key={kind}
            onClick={() => switchKind(kind)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              checkKind === kind
                ? 'bg-primary text-white'
                : 'border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 具体检定项 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {itemGrid.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCheckKey(key)}
            className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
              checkKey === key
                ? 'bg-primary/15 text-primary border border-primary/50'
                : 'border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:border-primary/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 优劣势手动覆盖（优/劣势按规则强制双骰） */}
      <div>
        <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">
          优劣势（按 DM 指示选择，引擎自动检测叠加生效）
        </label>
        <div className="flex gap-2">
          {(['none', 'advantage', 'disadvantage'] as ManualMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setManualMode(m);
                setDiceCount(m === 'none' ? 1 : 2);
                setD20Inputs(m === 'none' ? [''] : ['', '']);
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                manualMode === m
                  ? 'bg-accent/15 text-accent border border-accent/50'
                  : 'border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/5'
              }`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        {modeHint && (
          <div className="text-xs mt-1.5 dark:text-text-dark-muted light:text-text-light-muted">{modeHint}</div>
        )}
      </div>

      {/* d20 输入 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            d20 结果{diceCount === 2 ? '（优/劣势双骰取高/低）' : ''}
          </label>
          {manualMode === 'none' && (
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
            </div>
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
              className="w-full px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-dark light:bg-bg-light dark:bg-bg-dark dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
              placeholder={`d20 #${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* 可选 DC 自判 */}
      <div>
        <label className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-1.5 block">
          DC（可选，DM 报了 DC 就填，自动判定成功/失败）
        </label>
        <input
          type="number"
          min={1}
          value={dcText}
          onChange={(e) => setDcText(e.target.value)}
          className="w-32 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-bg-dark light:bg-bg-light dark:text-text-dark light:text-text-light text-sm outline-none focus:border-primary transition-colors"
          placeholder="如 15"
        />
      </div>

      {/* 实时结果 */}
      {pipeline && allFilled && (
        <div className="rounded-xl border p-4 space-y-3 dark:border-border-dark dark:bg-card-dark light:border-border-light light:bg-card-light">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 dark:text-text-dark-muted light:text-text-light-muted">
              <Calculator className="w-4 h-4" />
              <span className="text-sm">应用值（报给 DM 的数）</span>
            </div>
            {outcome && (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${
                outcome === 'success' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-red-500/15 text-red-500'
              }`}>
                {outcome === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {outcome === 'success' ? '成功' : '失败'}
              </div>
            )}
          </div>
          <div className="text-4xl font-bold text-primary font-mono text-center py-1">
            {pipeline.appliedValue}
          </div>
          <CheckResultDetail
            d20s={parsedD20s}
            d20Kept={pipeline.d20Kept}
            modeReasons={pipeline.modeReasons}
            bonuses={pipeline.bonuses}
            appliedValue={pipeline.appliedValue}
          />
        </div>
      )}
    </div>
  );
}
