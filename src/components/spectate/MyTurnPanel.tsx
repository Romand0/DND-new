// 玩家回合操作面板：玩家在自己回合内本地执行攻击/备注操作，打包成 ops 批提交给 DM。
// 数据来源全部为观战投影（inventory 攻击属性快照 / roster HP-AC），本地零解析；
// 提交走 player.action（回合批提交模型），回执 accepted 清空、rejected 保留重改。
import { useEffect, useMemo, useState } from 'react';
import { Dices, Plus, Send, Trash2, X } from 'lucide-react';
import { useNumberInput, useTextInput } from '@/hooks/useInput';
import type { CombatRosterEntry, PlayerActionRequest, PlayerActionResult, TurnCommitOp, TurnCommitPayload } from '@/types/realtime';

const AMMO_MAP: Record<string, string[]> = {
  短弓: ['箭矢'],
  长弓: ['箭矢'],
  轻弩: ['弩矢'],
  手弩: ['弩矢'],
  重弩: ['弩矢'],
  投石索: ['弹丸'],
  吹箭筒: ['吹箭针'],
};

const DAMAGE_TYPES = ['挥砍', '穿刺', '钝击', '火', '寒', '雷', '酸', '毒', '光耀', '黯蚀', '心灵', '力场', '闪电'];

interface Props {
  actor: CombatRosterEntry;
  roster: CombatRosterEntry[];
  round: number;
  /** 玩家端最后收到的 delta seq（过期检测） */
  baseSeq: number;
  send: (request: PlayerActionRequest) => boolean;
  /** DM 回执（页面 WS 层转发；requestId 匹配本面板最近提交才展示） */
  result: (PlayerActionResult & { at: number }) | null;
  onNotice: (msg: string) => void;
}

export default function MyTurnPanel({ actor, roster, round, baseSeq, send, result, onNotice }: Props) {
  const [ops, setOps] = useState<TurnCommitOp[]>([]);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const myResult = result && result.requestId === lastRequestId ? result : null;

  // 回执到达：入账成功清空操作列表与提交态；拒绝保留 ops 供修改后重交
  useEffect(() => {
    if (myResult?.accepted) {
      setOps([]);
      setSentAt(null);
      setLastRequestId(null);
    }
  }, [myResult?.accepted, myResult?.requestId]);

  const weapons = useMemo(() => (actor.inventory ?? []).filter((i) => i.attack), [actor.inventory]);
  const [weaponChildId, setWeaponChildId] = useState<string>('');

  const targets = roster.filter((r) => r.id !== actor.id && !r.dead);
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? '');

  const d20Input = useNumberInput(20, { fallback: 20 });
  const bonusInput = useNumberInput(0);
  const dmgInput = useNumberInput(0);
  const [damageType, setDamageType] = useState('挥砍');
  const noteInput = useTextInput('');
  const [noteCost, setNoteCost] = useState<'none' | 'action' | 'bonus'>('none');

  const selectedWeapon = weapons.find((w) => w.childId === weaponChildId) ?? weapons[0] ?? null;
  const target = targets.find((t) => t.id === targetId) ?? targets[0] ?? null;

  const ammoInfo = useMemo(() => {
    if (!selectedWeapon?.attack) return null;
    const props = selectedWeapon.attack.properties ?? [];
    if (!props.includes('弹药') || props.includes('投掷')) return null;
    const ammoNames = AMMO_MAP[selectedWeapon.name] ?? [];
    const ammo = (actor.inventory ?? []).find((i) => ammoNames.includes(i.name));
    return { ammo, weaponName: selectedWeapon.name };
  }, [selectedWeapon, actor.inventory]);

  // 手持武器标注（heldLeft/Right 投影只有 name，按名匹配）
  const handLabel = (childId: string) => {
    const item = (actor.inventory ?? []).find((i) => i.childId === childId);
    if (!item) return '';
    if (actor.heldLeft?.name === item.name) return '（左手）';
    if (actor.heldRight?.name === item.name) return '（右手）';
    return '';
  };

  const d20 = d20Input.value ?? 0;
  const bonus = bonusInput.value ?? 0;
  const total = d20 + bonus;
  const ac = target?.ac ?? 10;
  const critical = d20 === 20;
  const miss = d20 === 1;
  const hit = !miss && (critical || total >= ac);

  const addAttackOp = () => {
    if (!target) return onNotice('请选择攻击目标');
    if (!selectedWeapon) return onNotice('没有可用武器，请添加备注行动或直接结束回合');
    if (ammoInfo && (!ammoInfo.ammo || ammoInfo.ammo.quantity <= 0)) {
      return onNotice(`${selectedWeapon.name} 需要弹药（${(AMMO_MAP[selectedWeapon.name] ?? []).join('/')}），背包投影中未找到`);
    }
    const dmg = dmgInput.value ?? 0;
    if (hit && dmg <= 0) return onNotice('命中时请填写伤害量（未命中可留 0）');
    const wName = selectedWeapon.name;
    const tName = target.name;
    const rollText = `d20 ${d20}+${bonus}=${total} vs AC ${ac}`;
    const roundText = `用${wName}攻击${tName}：${rollText} ${critical ? '暴击命中' : hit ? '命中' : '未命中'}${
      hit ? `，${dmg} 点${damageType}伤害` : ''
    }`;
    setOps((prev) => [
      ...prev,
      {
        kind: 'attack',
        weaponChildId: selectedWeapon.childId,
        weaponName: wName,
        targetId: target.id,
        targetName: tName,
        d20,
        bonus,
        hit,
        critical,
        damage: hit ? { amount: dmg, type: damageType } : null,
        ...(ammoInfo?.ammo ? { ammoChildId: ammoInfo.ammo.childId, ammoCount: 1 } : {}),
        roundText,
      },
    ]);

  };

  const addNoteOp = () => {
    const text = noteInput.value.trim();
    if (!text) return onNotice('请填写行动内容');
    setOps((prev) => [
      ...prev,
      {
        kind: 'note',
        roundText: text,
        actionCost: noteCost === 'none' ? null : noteCost,
      },
    ]);
    noteInput.reset();

  };

  const submit = () => {
    const requestId = crypto.randomUUID();
    const payload: TurnCommitPayload = { ops: [...ops, { kind: 'end-turn' }] };
    const ok = send({
      requestId,
      round,
      combatantId: actor.id,
      baseSeq,
      action: payload,
    });
    if (!ok) {
      onNotice('发送失败：连接未就绪');
      return;
    }
    onNotice('');
    setSentAt(Date.now());
    setLastRequestId(requestId);
  };

  return (
    <div className="rounded-xl border-2 border-primary/40 p-4 space-y-4 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-primary">
          <Dices className="w-4 h-4" />
          我的回合 — {actor.name}
        </h3>
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          第 {round} 轮 · 主动作 {actor.actions ?? 0} · 附赠 {actor.bonusActions ?? 0}
        </span>
      </div>

      {/* 攻击表单 */}
      <div className="rounded-lg p-3 space-y-2 text-sm dark:bg-bg-dark light:bg-bg-light-2">
        <div className="font-medium dark:text-text-dark light:text-text-light">攻击</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">武器</span>
            <select
              value={selectedWeapon?.childId ?? ''}
              onChange={(e) => setWeaponChildId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            >
              {weapons.length === 0 && <option value="">（无武器）</option>}
              {weapons.map((w) => (
                <option key={w.childId} value={w.childId}>
                  {w.name}
                  {handLabel(w.childId)}
                  {w.quantity > 1 ? ` ×${w.quantity}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">目标</span>
            <select
              value={target?.id ?? ''}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            >
              {targets.length === 0 && <option value="">（无存活目标）</option>}
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（HP {t.hp}/{t.maxHp} · AC {t.ac ?? '—'}）
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedWeapon?.attack && (
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
            {selectedWeapon.attack.damage} {selectedWeapon.attack.damageType}
            {selectedWeapon.attack.normalRange ? ` · 射程 ${selectedWeapon.attack.normalRange}/${selectedWeapon.attack.maxRange ?? selectedWeapon.attack.normalRange} 尺` : ''}
            {selectedWeapon.attack.properties.length > 0 ? ` · ${selectedWeapon.attack.properties.join('、')}` : ''}
            {ammoInfo ? ` · 弹药 ${ammoInfo.ammo?.quantity ?? 0}` : ''}
          </p>
        )}

        <div className="grid grid-cols-4 gap-2 items-end">
          <label className="space-y-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">d20</span>
            <input
              type="number"
              min={1}
              max={20}
              value={d20Input.text}
              onChange={(e) => d20Input.onChange(e.target.value)}
              onBlur={d20Input.onBlur}
              className="w-full px-2 py-1.5 rounded-lg border text-sm font-mono dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">加值</span>
            <input
              type="number"
              value={bonusInput.text}
              onChange={(e) => bonusInput.onChange(e.target.value)}
              onBlur={bonusInput.onBlur}
              className="w-full px-2 py-1.5 rounded-lg border text-sm font-mono dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">伤害量</span>
            <input
              type="number"
              value={dmgInput.text}
              onChange={(e) => dmgInput.onChange(e.target.value)}
              onBlur={dmgInput.onBlur}
              disabled={!hit}
              className="w-full px-2 py-1.5 rounded-lg border text-sm font-mono disabled:opacity-40 dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">类型</span>
            <select
              value={damageType}
              onChange={(e) => setDamageType(e.target.value)}
              disabled={!hit}
              className="w-full px-2 py-1.5 rounded-lg border text-sm disabled:opacity-40 dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            >
              {DAMAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {d20 >= 1 && d20 <= 20 && target && (
          <p className={`text-xs font-medium ${critical ? 'text-amber-500' : hit ? 'text-emerald-500' : 'text-red-500'}`}>
            {d20 === 1 ? '大失败（恒未命中）' : critical ? '暴击！（d20=20 恒命中）' : `${total} vs AC ${ac} → ${hit ? '命中' : '未命中'}`}
          </p>
        )}

        <button
          onClick={addAttackOp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          记入攻击
        </button>
      </div>

      {/* 备注行动 */}
      <div className="rounded-lg p-3 space-y-2 text-sm dark:bg-bg-dark light:bg-bg-light-2">
        <div className="font-medium dark:text-text-dark light:text-text-light">其他行动</div>
        <div className="flex gap-2">
          <input
            value={noteInput.text}
            onChange={(e) => noteInput.onChange(e.target.value)}
            placeholder="如：喝治疗药水 / 疾走 / 躲避"
            className="flex-1 px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
          />
          <select
            value={noteCost}
            onChange={(e) => setNoteCost(e.target.value as 'none' | 'action' | 'bonus')}
            className="px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
          >
            <option value="none">不耗动作</option>
            <option value="action">主动作</option>
            <option value="bonus">附赠动作</option>
          </select>
          <button
            onClick={addNoteOp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:opacity-80 transition-opacity shrink-0"
          >
            <Plus className="w-4 h-4" />
            记入
          </button>
        </div>
      </div>

      {/* ops 列表 */}
      {ops.length > 0 && (
        <div className="space-y-1.5">
          {ops.map((op, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm dark:bg-bg-dark light:bg-bg-light-2"
            >
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold mt-0.5">
                {i + 1}
              </span>
              <span className="flex-1 dark:text-text-dark light:text-text-light">
                {op.kind === 'end-turn' ? '结束回合' : op.roundText}
              </span>
              <button
                onClick={() => setOps((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 text-danger hover:opacity-70 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 提交与回执 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={submit}
          disabled={sentAt !== null && !myResult}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          提交回合并结束
        </button>
        {sentAt !== null && !myResult && (
          <span className="text-xs text-amber-500">已提交，等待 DM 审核…</span>
        )}
        {myResult && !myResult.accepted && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-500">
            <X className="w-3.5 h-3.5" />
            被拒绝：{myResult.reason ?? '未说明'}（可修改后重新提交）
          </span>
        )}
      </div>
    </div>
  );
}
