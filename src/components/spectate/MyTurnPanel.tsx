// 玩家回合操作面板：与 DM 端手感一致——点动作按钮开弹窗，掷骰自动判定命中/伤害，
// 确认即自动记入本回合操作序列（无需先填表再点「记入」），回合末统一打包提交给 DM。
// 数据来源：观战投影（inventory 攻击快照 / spells 法术列表 / roster HP-AC）+ 本人角色卡（攻击加值自动算）。
// 提交走 player.action（回合批提交模型），回执 accepted 清空、rejected 保留重改。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Hand, PenLine, Send, Sparkles, Swords, Trash2, X } from 'lucide-react';
import { useNumberInput, useTextInput } from '@/hooks/useInput';
import { calcAttackBonus } from '@/lib/attackBonus';
import { rollDice } from '@/data/diceService';
import { fetchCharacter } from '@/lib/api';
import { isOneActionCast, isBonusActionCast } from '@/types/combat';
import type { Character } from '@/types/character';
import type { BoardProjection, CombatRosterEntry, PlayerActionRequest, PlayerActionResult, RosterInventoryItem, RosterSpellEntry, TurnCommitOp, TurnCommitPayload } from '@/types/realtime';

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

const fieldCls = 'w-full px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light';

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
  /** ops 由页面层持有（沙盘拖拽与本面板共享同一操作列表） */
  ops: TurnCommitOp[];
  onOpsChange: (updater: (prev: TurnCommitOp[]) => TurnCommitOp[]) => void;
  /** 沙盘投影：射程/触及提示用（棋盘未开启时为 null） */
  board?: BoardProjection | null;
}

/** 武器是否远程（飞矢动画与射程提示共用判定：弹药/投掷属性或带射程数据） */
function isRangedWeapon(atk: NonNullable<RosterInventoryItem['attack']>): boolean {
  const props = atk.properties ?? [];
  return props.includes('弹药') || props.includes('投掷') || (atk.normalRange ?? 0) > 0;
}

/** 解析武器伤害骰 "2d6+3" / "1d8" / "1d4-1"；解析失败返回 null（禁用掷骰按钮） */
function parseDamageDice(damage: string): { count: number; sides: number; flat: number } | null {
  const m = /^(\d+)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/.exec(damage.trim());
  if (!m) return null;
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  if (!count || !sides) return null;
  const flat = m[3] ? (m[3] === '-' ? -1 : 1) * parseInt(m[4], 10) : 0;
  return { count, sides, flat };
}

/** 弹窗外壳：与 DM 端战斗弹窗同构（遮罩 + 标题栏 + 滚动体 + 底部操作区） */
function DialogShell({ title, onClose, children, footer }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="dark:bg-card-dark light:bg-card-light rounded-xl shadow-2xl w-[92vw] max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-border-dark light:border-border-light shrink-0">
          <h4 className="font-bold dark:text-text-dark light:text-text-light">{title}</h4>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 dark:text-text-dark light:text-text-light">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t dark:border-border-dark light:border-border-light flex gap-2 justify-end shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MyTurnPanel({ actor, roster, round, baseSeq, send, result, onNotice, ops, onOpsChange, board }: Props) {
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const myResult = result && result.requestId === lastRequestId ? result : null;
  // 当前打开的动作用弹窗（与 DM 端点按钮开弹窗一致）
  const [dialog, setDialog] = useState<'attack' | 'cast' | 'ready' | 'note' | null>(null);

  // 回执到达：入账成功清空操作列表与提交态；拒绝保留 ops 供修改后重交
  useEffect(() => {
    if (myResult?.accepted) {
      onOpsChange(() => []);
      setSentAt(null);
      setLastRequestId(null);
      setDialog(null);
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

  // 本人角色卡：攻击加值自动计算（拉取失败则退回手填）
  const [character, setCharacter] = useState<Character | null>(null);
  useEffect(() => {
    let alive = true;
    if (!actor.characterId) return;
    fetchCharacter<Character>(actor.characterId)
      .then((c) => {
        if (alive) setCharacter(c);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [actor.characterId]);

  const autoBonus = useMemo(() => {
    if (!character || !selectedWeapon?.attack) return null;
    return calcAttackBonus(
      { name: selectedWeapon.name, subtype: selectedWeapon.attack.subtype, properties: selectedWeapon.attack.properties, magicBonus: selectedWeapon.magicBonus },
      character
    ).bonus;
  }, [character, selectedWeapon]);

  // 换武器时用自动加值覆盖手填值；角色卡未就绪时保持手填
  const prevAutoBonusRef = useRef<number | null>(null);
  useEffect(() => {
    if (autoBonus != null && autoBonus !== prevAutoBonusRef.current) {
      prevAutoBonusRef.current = autoBonus;
      bonusInput.setExternal(autoBonus);
    }
  }, [autoBonus]);

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

  // 射程/触及提示：切比雪夫距离 × 5 尺（与 DM 端沙盘同规则）
  const selfTok = board?.tokens.find((t) => t.combatantId === actor.id) ?? null;
  const tgtTok = target ? board?.tokens.find((t) => t.combatantId === target.id) ?? null : null;
  const distanceCells = selfTok && tgtTok ? Math.max(Math.abs(selfTok.col - tgtTok.col), Math.abs(selfTok.row - tgtTok.row)) : null;
  const rangeHints = useMemo(() => {
    const atk = selectedWeapon?.attack;
    if (!atk || distanceCells == null) return [] as { level: 'warn' | 'block'; text: string }[];
    const props = atk.properties ?? [];
    const isRanged = isRangedWeapon(atk);
    const feet = distanceCells * 5;
    const hints: { level: 'warn' | 'block'; text: string }[] = [];
    if (isRanged) {
      if (atk.maxRange && feet > atk.maxRange) {
        hints.push({ level: 'block', text: `超出最大射程（${feet} 尺 > ${atk.maxRange} 尺），无法攻击` });
      } else if (atk.normalRange && feet > atk.normalRange) {
        hints.push({ level: 'warn', text: `远距攻击（${feet} 尺 > 常规 ${atk.normalRange} 尺）：d20 劣势，请掷两次取低` });
      } else if (distanceCells === 1 && !props.includes('投掷')) {
        hints.push({ level: 'warn', text: '5 尺内有近身敌人：远程攻击劣势，请掷两次取低' });
      }
    } else if (distanceCells > 1) {
      hints.push({ level: 'warn', text: `目标距离 ${feet} 尺，超出近战触及（5 尺）` });
    }
    return hints;
  }, [selectedWeapon, distanceCells]);
  const rangeBlocked = rangeHints.some((h) => h.level === 'block');
  const disadvantage = rangeHints.some((h) => h.level === 'warn' && h.text.includes('劣势'));

  /** 掷攻击骰：劣势自动掷两次取低（与 DM 端检定一致） */
  const rollAttack = () => {
    const rolled = rollDice({ sides: 20, count: disadvantage ? 2 : 1, mode: 'sum' });
    const picked = disadvantage ? Math.min(...rolled.values) : rolled.total;
    d20Input.setExternal(picked);
    onNotice(disadvantage ? `劣势掷骰 ${rolled.values.join(' / ')}，取低 ${picked}` : `攻击骰 d20 = ${picked}`);
  };

  /** 记录攻击：校验 → 自动追加 op（成功返回 true，弹窗随即关闭） */
  const addAttackOp = (): boolean => {
    if (!target) { onNotice('请选择攻击目标'); return false; }
    if (!selectedWeapon) { onNotice('没有可用武器，请改用备注行动'); return false; }
    if (rangeBlocked) { onNotice(rangeHints.find((h) => h.level === 'block')?.text ?? '目标超出射程'); return false; }
    if (ammoInfo && (!ammoInfo.ammo || ammoInfo.ammo.quantity <= 0)) {
      onNotice(`${selectedWeapon.name} 需要弹药（${(AMMO_MAP[selectedWeapon.name] ?? []).join('/')}），背包投影中未找到`);
      return false;
    }
    const dmg = dmgInput.value ?? 0;
    if (hit && dmg <= 0) { onNotice('命中时请先掷伤害骰或填写伤害量'); return false; }
    const wName = selectedWeapon.name;
    const tName = target.name;
    const rollText = `d20 ${d20}+${bonus}=${total} vs AC ${ac}`;
    const roundText = `用${wName}攻击${tName}：${rollText} ${critical ? '暴击命中' : hit ? '命中' : '未命中'}${
      hit ? `，${dmg} 点${damageType}伤害` : ''
    }`;
    onOpsChange((prev) => [
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
        ranged: isRangedWeapon(selectedWeapon.attack),
        damage: hit ? { amount: dmg, type: damageType } : null,
        ...(ammoInfo?.ammo ? { ammoChildId: ammoInfo.ammo.childId, ammoCount: 1 } : {}),
        roundText,
      },
    ]);
    // 记录后：伤害值清零，命中骰保留（一回合多打时复用加值）
    dmgInput.setExternal(0);
    return true;
  };

  const rollDamage = () => {
    const atk = selectedWeapon?.attack;
    if (!atk) return;
    const dice = parseDamageDice(atk.damage);
    if (!dice) return onNotice(`伤害骰「${atk.damage}」无法解析，请手填伤害量`);
    const count = critical ? dice.count * 2 : dice.count;
    const rolled = rollDice({ sides: dice.sides as 4 | 6 | 8 | 10 | 12 | 20, count, mode: 'sum' });
    const total_ = Math.max(0, rolled.total + dice.flat);
    dmgInput.setExternal(total_);
    if (DAMAGE_TYPES.includes(atk.damageType)) setDamageType(atk.damageType);
    onNotice(`掷伤害 ${count}d${dice.sides}${dice.flat ? (dice.flat > 0 ? `+${dice.flat}` : dice.flat) : ''} = ${total_}${critical ? '（暴击骰数翻倍）' : ''}`);
  };

  const addNoteOp = (): boolean => {
    const text = noteInput.value.trim();
    if (!text) { onNotice('请填写行动内容'); return false; }
    onOpsChange((prev) => [
      ...prev,
      {
        kind: 'note',
        roundText: text,
        actionCost: noteCost === 'none' ? null : noteCost,
      },
    ]);
    noteInput.reset();
    return true;
  };

  // ── 施法 ──
  const spells: RosterSpellEntry[] = actor.spells ?? [];
  const [spellId, setSpellId] = useState<string>('');
  const selectedSpell = spells.find((s) => s.id === spellId) ?? spells[0] ?? null;
  const [spellTargetId, setSpellTargetId] = useState<string>('');
  const spellTarget = spellTargetId ? targets.find((t) => t.id === spellTargetId) ?? null : null;
  const spellActionCost: 'action' | 'bonus' | null = useMemo(() => {
    const ct = selectedSpell?.castingTime ?? '';
    if (!ct) return null;
    if (isBonusActionCast(ct)) return 'bonus';
    if (isOneActionCast(ct)) return 'action';
    return null;
  }, [selectedSpell]);
  const spellSlot = selectedSpell && selectedSpell.level > 0 ? (actor.spellSlots ?? []).find((s) => s.level === selectedSpell.level) ?? null : null;
  const spellSlotAvailable = selectedSpell?.level > 0 ? (spellSlot ? spellSlot.max - spellSlot.used > 0 : false) : true;

  const addCastOp = (): boolean => {
    if (!selectedSpell) { onNotice('角色卡没有可施放的法术'); return false; }
    if (selectedSpell.level > 0 && !spellSlotAvailable) {
      onNotice(`${selectedSpell.name} 需要 ${selectedSpell.level} 环法术位，当前已用尽`);
      return false;
    }
    const slotText = selectedSpell.level > 0 ? `，消耗 ${selectedSpell.level} 环法术位` : '（戏法）';
    const roundText = `施放 ${selectedSpell.name}${spellTarget ? `（目标 ${spellTarget.name}）` : ''}${slotText}${
      selectedSpell.concentration ? '，需要专注' : ''
    }`;
    onOpsChange((prev) => [
      ...prev,
      {
        kind: 'cast',
        spellId: selectedSpell.id,
        spellName: selectedSpell.name,
        slotLevel: selectedSpell.level > 0 ? selectedSpell.level : 0,
        ...(spellTarget ? { targetId: spellTarget.id, targetName: spellTarget.name } : {}),
        ...(selectedSpell.concentration ? { concentration: true } : {}),
        actionCost: spellActionCost,
        roundText,
      },
    ]);
    return true;
  };

  // ── 换持 ──
  const inventory: RosterInventoryItem[] = actor.inventory ?? [];
  const itemByChildId = useMemo(() => new Map(inventory.map((i) => [i.childId, i])), [inventory]);
  const childIdByName = (name?: string | null) => (name ? inventory.find((i) => i.name === name)?.childId ?? '' : '');
  const [leftSel, setLeftSel] = useState<string>(() => childIdByName(actor.heldLeft?.name));
  const [rightSel, setRightSel] = useState<string>(() => childIdByName(actor.heldRight?.name));

  const addReadyOps = (): boolean => {
    const curLeft = childIdByName(actor.heldLeft?.name);
    const curRight = childIdByName(actor.heldRight?.name);
    const pending: TurnCommitOp[] = [];
    if (leftSel !== curLeft) {
      const item = leftSel ? itemByChildId.get(leftSel) : null;
      pending.push({
        kind: 'ready-item',
        slot: 'left',
        childId: leftSel || null,
        itemName: item?.name ?? null,
        roundText: item ? `左手换持为 ${item.name}` : '放下左手物品',
      });
    }
    if (rightSel !== curRight) {
      const item = rightSel ? itemByChildId.get(rightSel) : null;
      pending.push({
        kind: 'ready-item',
        slot: 'right',
        childId: rightSel || null,
        itemName: item?.name ?? null,
        roundText: item ? `右手换持为 ${item.name}` : '放下右手物品',
      });
    }
    if (pending.length === 0) { onNotice('手持没有变化'); return false; }
    onOpsChange((prev) => [...prev, ...pending]);
    return true;
  };

  /** 回合末打包：ops + end-turn 一并提交，DM 端一次审核入账 */
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

  const primaryBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40';
  const ghostBtn = 'px-3 py-1.5 rounded-lg border text-sm dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:opacity-80 transition-opacity';

  return (
    <div className="rounded-xl border-2 border-primary/40 p-4 space-y-3 dark:bg-card-dark dark:border-border-dark light:bg-card-light light:border-border-light">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-primary">
          <Dices className="w-4 h-4" />
          我的回合 — {actor.name}
        </h3>
        <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
          第 {round} 轮 · 主动作 {actor.actions ?? 0} · 附赠 {actor.bonusActions ?? 0}
        </span>
      </div>

      {/* 动作按钮条：点开弹窗执行，确认后自动记入下方序列 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setDialog('attack')} className={primaryBtn}>
          <Swords className="w-4 h-4" />
          攻击
        </button>
        <button onClick={() => setDialog('cast')} disabled={spells.length === 0} className={primaryBtn}>
          <Sparkles className="w-4 h-4" />
          施法
        </button>
        <button onClick={() => setDialog('ready')} disabled={inventory.length === 0} className={ghostBtn}>
          <Hand className="w-4 h-4 inline mr-1" />
          换持
        </button>
        <button onClick={() => setDialog('note')} className={ghostBtn}>
          <PenLine className="w-4 h-4 inline mr-1" />
          其他行动
        </button>
      </div>

      {/* 已自动记录的操作序列：可删除，回合末打包 */}
      <div className="space-y-1.5">
        {ops.length === 0 ? (
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted px-1">
            本回合尚未记录操作。点上方动作按钮执行，系统会自动按顺序记录，回合结束统一提交。
          </p>
        ) : (
          ops.map((op, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm dark:bg-bg-dark light:bg-bg-light-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-bold mt-0.5">
                {i + 1}
              </span>
              <span className="flex-1 dark:text-text-dark light:text-text-light">
                {op.kind === 'end-turn' ? '结束回合' : op.roundText}
              </span>
              <button
                onClick={() => onOpsChange((prev) => prev.filter((_, idx) => idx !== i))}
                className="shrink-0 text-danger hover:opacity-70 transition-opacity"
                title="撤销这条操作"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 提交与回执 */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          onClick={submit}
          disabled={sentAt !== null && !myResult}
          className={primaryBtn}
        >
          <Send className="w-4 h-4" />
          结束回合并提交{ops.length > 0 ? `（打包 ${ops.length} 项）` : ''}
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

      {/* ── 攻击弹窗：掷骰自动判定命中 → 命中则掷伤害 → 确认自动记录 ── */}
      {dialog === 'attack' && (
        <DialogShell
          title={`攻击 — ${actor.name}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button onClick={() => setDialog(null)} className={ghostBtn}>取消</button>
              <button
                onClick={() => { if (addAttackOp()) setDialog(null); }}
                disabled={!target || rangeBlocked || !selectedWeapon}
                className={primaryBtn}
              >
                <Swords className="w-4 h-4" />
                记录攻击
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">武器</span>
              <select value={selectedWeapon?.childId ?? ''} onChange={(e) => setWeaponChildId(e.target.value)} className={fieldCls}>
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
              <select value={target?.id ?? ''} onChange={(e) => setTargetId(e.target.value)} className={fieldCls}>
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
              {distanceCells != null ? ` · 距目标 ${distanceCells * 5} 尺` : ''}
            </p>
          )}

          {rangeHints.map((h, i) => (
            <p key={i} className={`text-xs font-medium ${h.level === 'block' ? 'text-red-500' : 'text-amber-500'}`}>
              {h.text}
            </p>
          ))}

          <div className="grid grid-cols-2 gap-2 items-end">
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">d20{disadvantage ? '（劣势取低）' : ''}</span>
              <input
                type="number"
                min={1}
                max={20}
                value={d20Input.text}
                onChange={(e) => d20Input.onChange(e.target.value)}
                onBlur={d20Input.onBlur}
                className={`${fieldCls} font-mono`}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
                攻击加值{autoBonus != null ? '（自动）' : ''}
              </span>
              <input
                type="number"
                value={bonusInput.text}
                onChange={(e) => bonusInput.onChange(e.target.value)}
                onBlur={bonusInput.onBlur}
                className={`${fieldCls} font-mono`}
              />
            </label>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={rollAttack} className={ghostBtn}>
              <Dices className="w-4 h-4 inline mr-1" />
              掷攻击骰
            </button>
            {autoBonus != null && (
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">加值按角色卡自动计算，可改</span>
            )}
          </div>

          {d20 >= 1 && d20 <= 20 && target && (
            <p className={`text-xs font-medium ${critical ? 'text-amber-500' : hit ? 'text-emerald-500' : 'text-red-500'}`}>
              {d20 === 1 ? '大失败（恒未命中）' : critical ? '暴击！（d20=20 恒命中）' : `${total} vs AC ${ac} → ${hit ? '命中' : '未命中'}`}
            </p>
          )}

          {hit && (
            <div className="grid grid-cols-2 gap-2 items-end">
              <label className="space-y-1">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">伤害量</span>
                <input
                  type="number"
                  value={dmgInput.text}
                  onChange={(e) => dmgInput.onChange(e.target.value)}
                  onBlur={dmgInput.onBlur}
                  className={`${fieldCls} font-mono`}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">伤害类型</span>
                <select value={damageType} onChange={(e) => setDamageType(e.target.value)} className={fieldCls}>
                  {DAMAGE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              {selectedWeapon?.attack && parseDamageDice(selectedWeapon.attack.damage) && (
                <button onClick={rollDamage} className={`${ghostBtn} col-span-2`}>
                  <Dices className="w-4 h-4 inline mr-1" />
                  掷伤害骰{critical ? '（暴击翻倍）' : ''}
                </button>
              )}
            </div>
          )}
        </DialogShell>
      )}

      {/* ── 施法弹窗 ── */}
      {dialog === 'cast' && (
        <DialogShell
          title={`施法 — ${actor.name}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button onClick={() => setDialog(null)} className={ghostBtn}>取消</button>
              <button
                onClick={() => { if (addCastOp()) setDialog(null); }}
                disabled={!!selectedSpell && selectedSpell.level > 0 && !spellSlotAvailable}
                className={primaryBtn}
              >
                <Sparkles className="w-4 h-4" />
                记录施法
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">法术</span>
              <select value={selectedSpell?.id ?? ''} onChange={(e) => setSpellId(e.target.value)} className={fieldCls}>
                {spells.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.level === 0 ? '戏法' : `${s.level} 环`}）
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">目标（可选）</span>
              <select value={spellTargetId} onChange={(e) => setSpellTargetId(e.target.value)} className={fieldCls}>
                <option value="">（无目标 / 自身 / 范围）</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          </div>

          {selectedSpell && (
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">
              施法时间 {selectedSpell.castingTime || '未知'}
              {spellActionCost ? ` · 消耗${spellActionCost === 'action' ? '主动作' : '附赠动作'}` : ' · 不占动作'}
              {selectedSpell.level > 0 && spellSlot ? ` · ${spellSlot.label} 剩余 ${spellSlot.max - spellSlot.used}/${spellSlot.max}` : ''}
            </p>
          )}
          {selectedSpell?.level > 0 && !spellSlotAvailable && (
            <p className="text-xs font-medium text-red-500">{selectedSpell.level} 环法术位已用尽，无法施放</p>
          )}
          {selectedSpell?.concentration && (
            <p className="text-xs font-medium text-amber-500">专注法术：施放后进入专注状态（再施放新专注法术会打断旧的）</p>
          )}
        </DialogShell>
      )}

      {/* ── 换持弹窗 ── */}
      {dialog === 'ready' && (
        <DialogShell
          title={`换持 — ${actor.name}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button onClick={() => setDialog(null)} className={ghostBtn}>取消</button>
              <button onClick={() => { if (addReadyOps()) setDialog(null); }} className={primaryBtn}>
                <Hand className="w-4 h-4" />
                记录换持
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">左手（当前 {actor.heldLeft?.name ?? '空'}）</span>
              <select value={leftSel} onChange={(e) => setLeftSel(e.target.value)} className={fieldCls}>
                <option value="">（空手）</option>
                {inventory.map((i) => (
                  <option key={i.childId} value={i.childId}>
                    {i.name}
                    {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">右手（当前 {actor.heldRight?.name ?? '空'}）</span>
              <select value={rightSel} onChange={(e) => setRightSel(e.target.value)} className={fieldCls}>
                <option value="">（空手）</option>
                {inventory.map((i) => (
                  <option key={i.childId} value={i.childId}>
                    {i.name}
                    {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted">物品互动（拔/收一件武器）通常免费；第二次起 DM 可能要求消耗动作</p>
        </DialogShell>
      )}

      {/* ── 其他行动弹窗 ── */}
      {dialog === 'note' && (
        <DialogShell
          title={`其他行动 — ${actor.name}`}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button onClick={() => setDialog(null)} className={ghostBtn}>取消</button>
              <button onClick={() => { if (addNoteOp()) setDialog(null); }} className={primaryBtn}>
                <PenLine className="w-4 h-4" />
                记录
              </button>
            </>
          }
        >
          <label className="space-y-1 block">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">行动内容</span>
            <input
              value={noteInput.text}
              onChange={(e) => noteInput.onChange(e.target.value)}
              placeholder="如：喝治疗药水 / 疾走 / 躲避"
              className={fieldCls}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs dark:text-text-dark-muted light:text-text-light-muted">动作消耗</span>
            <select value={noteCost} onChange={(e) => setNoteCost(e.target.value as 'none' | 'action' | 'bonus')} className={fieldCls}>
              <option value="none">不耗动作</option>
              <option value="action">主动作</option>
              <option value="bonus">附赠动作</option>
            </select>
          </label>
        </DialogShell>
      )}
    </div>
  );
}
