// 玩家回合操作面板：复用 DM 侧战斗流程（CombatAttackModal → CombatDamageModal / CombatSpellModal），
// 玩家操作完即自动记入本回合操作序列，回合末统一打包提交给 DM 审核入账。
// 数据来源：观战投影（roster/board）+ 本人角色卡（云端拉取，仅用于攻击加值/法术位/法术列表）。
// 投影经 combatantAdapter 映射成 Combatant 形状，弹窗内的射程/弹药/装填/优劣势判定与 DM 端同源。
import { useEffect, useMemo, useState } from 'react';
import { Dices, Hand, PenLine, Send, Sparkles, Swords, Trash2, X } from 'lucide-react';
import { useTextInput } from '@/hooks/useInput';
import { fetchCharacter } from '@/lib/api';
import { spellStore } from '@/data/spellStore';
import { isOneActionCast, isBonusActionCast } from '@/types/combat';
import { GRID_PRESETS } from '@/types/battleground';
import CombatAttackModal from '@/components/CombatAttackModal';
import CombatDamageModal from '@/components/CombatDamageModal';
import CombatSpellModal from '@/components/CombatSpellModal';
import { rosterEntryToCombatant, rosterInventoryToEquipmentList, applyPendingHandOps } from './combatantAdapter';
import type { Character, Attack } from '@/types/character';
import type { NpcAttack } from '@/types/combat';
import type { BoardProjection, CombatRosterEntry, PlayerActionRequest, PlayerActionResult, RosterInventoryItem, TurnCommitOp, TurnCommitPayload } from '@/types/realtime';

const fieldCls = 'w-full px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light';

/** 攻击检定回执（CombatAttackModal onConfirmHit 的 info 子集） */
interface HitInfo {
  d20Final: number;
  bonus: number;
  total: number;
  isNatural20: boolean;
  usageMode?: 'melee' | 'thrown';
  isTwoHandedWield?: boolean;
  ammoConsumed?: { ammoChildId: string; ammoName: string };
}

/** 攻击未命中回执 */
interface MissInfo {
  attack: Attack | NpcAttack;
  d20Final: number;
  bonus: number;
  total: number;
  isNatural1: boolean;
  ammoConsumed?: { ammoChildId: string; ammoName: string };
}

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
  /** 沙盘白圈「攻击/施法」按钮发起的请求（seq 用于重复请求去重），宿主处理后回 handled 清空 */
  boardRequest?: { kind: 'attack' | 'cast'; targetId?: string; seq: number } | null;
  onBoardRequestHandled?: () => void;
}

/** 弹窗外壳：换持 / 其他行动这类轻量弹窗用（掷骰类弹窗直接复用 DM 侧组件） */
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

/** 武器是否远程（飞矢动画与先攻表格标注用：弹药/投掷属性或带射程数据） */
function isRangedAttack(atk: Attack | NpcAttack): boolean {
  const props = atk.properties ?? [];
  return props.includes('弹药') || props.includes('投掷') || ((atk as Attack).normalRange ?? 0) > 0;
}

export default function MyTurnPanel({ actor, roster, round, baseSeq, send, result, onNotice, ops, onOpsChange, board, boardRequest, onBoardRequestHandled }: Props) {
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const myResult = result && result.requestId === lastRequestId ? result : null;
  // 当前打开的弹窗：attack/cast/damage 直接复用 DM 侧组件，ready/note 用轻量外壳
  const [dialog, setDialog] = useState<'attack' | 'damage' | 'cast' | 'ready' | 'note' | null>(null);

  // 回执到达：入账成功清空操作列表与提交态；拒绝保留 ops 供修改后重交
  useEffect(() => {
    if (myResult?.accepted) {
      onOpsChange(() => []);
      setSentAt(null);
      setLastRequestId(null);
      setDialog(null);
    }
  }, [myResult?.accepted, myResult?.requestId]);

  const targets = roster.filter((r) => r.id !== actor.id && !r.dead);
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? '');
  const target = targets.find((t) => t.id === targetId) ?? targets[0] ?? null;

  // 沙盘白圈请求：锁定目标并直接打开对应弹窗（与 DM 端长按锁定后点按钮同一路径）
  useEffect(() => {
    if (!boardRequest) return;
    if (boardRequest.targetId) setTargetId(boardRequest.targetId);
    setDialog(boardRequest.kind);
    onBoardRequestHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardRequest?.seq]);

  // 本人角色卡：攻击加值/法术位/法术列表都按它计算（拉取失败则弹窗降级为无角色卡模式）
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

  // 投影 → Combatant 形状（弹窗读手持/攻击列表/AC 用）
  // 未提交的换持 op 叠加到手持上：弹窗（攻击/施法可用性）与换持基线都要按「最新意图」判断
  const effectiveHand = (slot: 'left' | 'right'): string | null => {
    const last = [...ops].reverse().find((o) => o.kind === 'ready-item' && o.slot === slot);
    if (last && last.kind === 'ready-item') return last.childId ? last.itemName : null;
    const cur = slot === 'left' ? actor.heldLeft : actor.heldRight;
    return cur?.name ?? null;
  };
  const myCombatant = useMemo(
    () => applyPendingHandOps(rosterEntryToCombatant(actor, character), ops),
    [actor, character, ops]
  );
  const myInventory = useMemo(() => rosterInventoryToEquipmentList(actor), [actor.inventory]);
  const targetCombatant = useMemo(
    () => (target ? rosterEntryToCombatant(target, null) : myCombatant),
    [target, myCombatant]
  );

  // 沙盘坐标（射程判定 / 范围法术拾取）
  const positions = useMemo(() => {
    const map: Record<string, { col: number; row: number }> = {};
    (board?.tokens ?? []).forEach((t) => {
      map[t.combatantId] = { col: t.col, row: t.row };
    });
    return map;
  }, [board]);
  const bounds = board ? { cols: GRID_PRESETS[board.size].cols, rows: GRID_PRESETS[board.size].rows } : null;

  // 装填武器状态（与 DM 端同 key："{combatantId}:{attackName}"），初值取投影快照
  const [loadedWeapons, setLoadedWeapons] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    (actor.inventory ?? []).forEach((i) => {
      if (i.attack && (i.attack.properties ?? []).includes('装填')) {
        out[`${actor.id}:${i.name}`] = i.attack.loaded ?? true;
      }
    });
    return out;
  });
  // 放映模式装填武器每回合一次：本回合已击发过的武器（回合变化自动清空）
  const [loadingAttacked, setLoadingAttacked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setLoadingAttacked({});
  }, [round]);

  // 攻击命中后的伤害结算上下文（攻击弹窗确认 → 伤害弹窗）
  const [attackCtx, setAttackCtx] = useState<{ attack: Attack | NpcAttack; info: HitInfo } | null>(null);

  /** 攻击检定确认（命中）：转交伤害弹窗 */
  const handleConfirmHit = (attack: Attack | NpcAttack, info: HitInfo) => {
    if ((attack.properties ?? []).includes('装填')) {
      setLoadingAttacked((prev) => ({ ...prev, [actor.id]: true }));
    }
    setAttackCtx({ attack, info });
    setDialog('damage');
  };

  /** 记录一条攻击操作（命中/未命中统一出口） */
  const recordAttackOp = (
    attack: Attack | NpcAttack,
    roll: { d20Final: number; bonus: number; total: number; isNatural20?: boolean; ammoConsumed?: { ammoChildId: string } },
    hit: boolean,
    damage: { amount: number; type: string } | null
  ) => {
    const tName = target?.name ?? '目标';
    const ac = target?.ac ?? 10;
    const critical = !!roll.isNatural20 && hit;
    const rollText = `d20 ${roll.d20Final}${roll.bonus >= 0 ? '+' : ''}${roll.bonus}=${roll.total} vs AC ${ac}`;
    const roundText = `用${attack.name}攻击${tName}：${rollText} ${critical ? '暴击命中' : hit ? '命中' : '未命中'}${
      hit && damage ? `，${damage.amount} 点${damage.type}伤害` : ''
    }`;
    onOpsChange((prev) => [
      ...prev,
      {
        kind: 'attack',
        weaponChildId: (attack as Attack).id ?? null,
        weaponName: attack.name,
        targetId: target?.id ?? '',
        targetName: tName,
        d20: roll.d20Final,
        bonus: roll.bonus,
        hit,
        critical,
        ranged: isRangedAttack(attack),
        damage: hit && damage ? { amount: damage.amount, type: damage.type } : null,
        ...(roll.ammoConsumed ? { ammoChildId: roll.ammoConsumed.ammoChildId, ammoCount: 1 } : {}),
        roundText,
      },
    ]);
  };

  /** 伤害弹窗确认：落成攻击 op */
  const handleApplyDamage = (attack: Attack | NpcAttack, payload: { damage: number }) => {
    if (!attackCtx) return;
    recordAttackOp(attackCtx.attack, attackCtx.info, true, { amount: payload.damage, type: attack.damageType || '未分类' });
    setAttackCtx(null);
    setDialog(null);
  };

  /** 施法完成：落成施法 op（法术位消耗由 DM 端按 slotLevel 应用） */
  const handleCastResolved = (info: {
    spellName: string;
    castingTime?: string;
    success: boolean;
    effectType: 'damage' | 'heal';
    amount: number;
    damageType?: string;
    concentration?: boolean;
  }) => {
    const spell = spellStore.getAll().find((s) => s.name === info.spellName) ?? null;
    const ct = info.castingTime ?? spell?.castingTime ?? '';
    const actionCost: 'action' | 'bonus' | null = isBonusActionCast(ct) ? 'bonus' : isOneActionCast(ct) ? 'action' : null;
    const slotLevel = spell && spell.level > 0 ? spell.level : 0;
    const effectText =
      info.effectType === 'damage' && info.success && info.amount > 0
        ? `，造成 ${info.amount} 点${info.damageType ?? spell?.damageType ?? '伤害'}`
        : info.effectType === 'heal' && info.amount > 0
          ? `，恢复 ${info.amount} 点生命`
          : '';
    const targetName = target?.name;
    const roundText = `施放 ${info.spellName}${targetName ? `（目标 ${targetName}）` : ''}${
      slotLevel > 0 ? `，消耗 ${slotLevel} 环法术位` : '（戏法）'
    }${info.concentration || spell?.concentration ? '，需要专注' : ''}${effectText}`;
    onOpsChange((prev) => [
      ...prev,
      {
        kind: 'cast',
        spellId: spell?.id ?? '',
        spellName: info.spellName,
        slotLevel,
        ...(target && (info.effectType !== 'heal' || info.success) ? { targetId: target.id, targetName: target.name } : {}),
        ...(info.concentration || spell?.concentration ? { concentration: true } : {}),
        actionCost,
        roundText,
      },
    ]);
    setDialog(null);
  };

  // ── 换持 ──
  const inventory: RosterInventoryItem[] = actor.inventory ?? [];
  const itemByChildId = useMemo(() => new Map(inventory.map((i) => [i.childId, i])), [inventory]);
  const childIdByName = (name?: string | null) => (name ? inventory.find((i) => i.name === name)?.childId ?? '' : '');
  const [leftSel, setLeftSel] = useState<string>(() => childIdByName(actor.heldLeft?.name));
  const [rightSel, setRightSel] = useState<string>(() => childIdByName(actor.heldRight?.name));

  const addReadyOps = (): boolean => {
    // 基线取「投影 + 未提交 ops」，避免连续换持时重复产出同一条 op
    const curLeft = childIdByName(effectiveHand('left'));
    const curRight = childIdByName(effectiveHand('right'));
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

  // ── 其他行动 ──
  const noteInput = useTextInput('');
  const [noteCost, setNoteCost] = useState<'none' | 'action' | 'bonus'>('none');

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

  const spells = actor.spells ?? [];
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

      {/* 动作按钮条：点开与 DM 端同一套弹窗，确认后自动记入下方序列 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setDialog('attack')} disabled={!target} className={primaryBtn}>
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
        {targets.length > 0 && (
          <select
            value={target?.id ?? ''}
            onChange={(e) => setTargetId(e.target.value)}
            className="px-2 py-1.5 rounded-lg border text-sm dark:bg-card-dark dark:border-border-dark dark:text-text-dark light:bg-card-light light:border-border-light light:text-text-light"
            title="攻击目标（施法目标在施法弹窗内选择）"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（HP {t.hp}/{t.maxHp} · AC {t.ac ?? '—'}）
              </option>
            ))}
          </select>
        )}
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

      {/* ── 攻击：DM 侧攻击检定弹窗（手持/射程/弹药/装填/优劣势全同源） ── */}
      {dialog === 'attack' && (
        <CombatAttackModal
          attacker={myCombatant}
          target={targetCombatant}
          combatInventory={myInventory}
          attackerPos={positions[actor.id] ?? null}
          targetPos={target ? positions[target.id] ?? null : null}
          combatantPositions={positions}
          loadedWeapons={loadedWeapons}
          onLoadedChange={(key, loaded) => setLoadedWeapons((prev) => ({ ...prev, [key]: loaded }))}
          loadingAttackedThisRound={loadingAttacked}
          combatMode="playback"
          playbackTurnActive
          currentRound={round}
          characterOverride={character}
          onClose={() => setDialog(null)}
          onConfirmHit={(attack, info) => handleConfirmHit(attack, info)}
          onAttackMiss={(info) => {
            recordAttackOp(info.attack, info, false, null);
            setDialog(null);
          }}
        />
      )}

      {/* ── 伤害：DM 侧伤害结算弹窗（暴击/抗性/伤害骰解析同源） ── */}
      {dialog === 'damage' && attackCtx && (
        <CombatDamageModal
          attacker={myCombatant}
          target={targetCombatant}
          attack={attackCtx.attack}
          isCritical={attackCtx.info.isNatural20}
          isTwoHandedWield={!!attackCtx.info.isTwoHandedWield}
          onClose={() => {
            setAttackCtx(null);
            setDialog(null);
          }}
          onApplyDamage={(payload) => handleApplyDamage(attackCtx.attack, payload)}
        />
      )}

      {/* ── 施法：DM 侧施法弹窗（法术列表/法术位/成分/步骤化流程同源；法术位由 DM 端统一扣） ── */}
      {dialog === 'cast' && (
        <CombatSpellModal
          caster={myCombatant}
          target={targetCombatant}
          characterOverride={character}
          casterCombatInventory={myInventory}
          bounds={bounds}
          canUseAction={(actor.actions ?? 1) > 0}
          canUseBonusAction={(actor.bonusActions ?? 1) > 0}
          currentRound={round}
          onTargetChange={(c) => setTargetId(c.id)}
          onClose={() => setDialog(null)}
          onCastResolved={(info) => handleCastResolved(info)}
        />
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
