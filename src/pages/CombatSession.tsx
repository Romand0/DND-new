// CombatSession：战斗追踪主页面（拆解完成态）
// 状态与逻辑由 9 个 hooks/combat/* hook 提供；弹窗/表格/工具条由 components/combat/* 组件渲染。
// CombatantList 预抽取已废弃：其卡片列表 UI 已并入先攻表格表头，详见 CombatSession-拆解规划.md §七。
import { useActions } from '@/hooks/combat/useActions';
import { useCombatInventories } from '@/hooks/combat/useCombatInventories';
import { useCombatBroadcast } from '@/hooks/combat/useCombatBroadcast';
import { usePlayerActionInbox } from '@/hooks/combat/usePlayerActionInbox';
import { useDamageAndHp } from '@/hooks/combat/useDamageAndHp';
import { useInitiative } from '@/hooks/combat/useInitiative';
import { useManualRecord } from '@/hooks/combat/useManualRecord';
import { usePlayback } from '@/hooks/combat/usePlayback';
import { useRoundTurn } from '@/hooks/combat/useRoundTurn';
import { useSurprise } from '@/hooks/combat/useSurprise';
import { useThrownDrop } from '@/hooks/combat/useThrownDrop';
import { useForcedMove } from '@/hooks/combat/useForcedMove';
import { useZoneEffects } from '@/hooks/combat/useZoneEffects';
import { useCampaign } from '@/contexts/CampaignContext';
import { applyTurnCommit } from '@/lib/turnCommitApply';
import { fetchBoundCharacters, sendSpectateInvite } from '@/lib/api';
import InitiativeTable from '@/components/combat/InitiativeTable';
import OperationLogPanel from '@/components/OperationLogPanel';
import InitiativeRollDialog from '@/components/combat/InitiativeRollDialog';
import SettlementDialog from '@/components/combat/SettlementDialog';
import InitiativeTiebreakerDialog from '@/components/combat/InitiativeTiebreakerDialog';
import ManualRecordDialog from '@/components/combat/ManualRecordDialog';
import PlaybackToolbar from '@/components/combat/PlaybackToolbar';
import RewindDialog from '@/components/combat/RewindDialog';
import SurpriseAttackDialog from '@/components/combat/SurpriseAttackDialog';
import PlayerActionReviewPanel from '@/components/combat/PlayerActionReviewPanel';
import DiceInputModal from '@/components/combat/DiceInputModal';
import CombatantTraitPanel from '@/components/combat/CombatantTraitPanel';
import { useState, useEffect, useRef, useMemo } from 'react';
import * as snapDb from '@/lib/combatSnapshots';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  applyEquipmentChange,
  getCombatInventory,
} from '@/data/combatStore';
import combatStore from '@/data/combatStore';
import { globalStatusManager } from '@/data/statusManager';
import { actionDeniedReason } from '@/data/statusRuntime';
import { formatDamageBreakdown, normalizeDamageType } from '@/data/damageRules';
import { characterStore } from '@/data/characterStore';
import { derivePcAttacksPerAction } from '@/lib/pcExtraAttack';
import { deriveSkillCheckBonus } from '@/data/passiveCombatRules';
import { resolveSearch } from '@/data/searchRules';
import { collectHideObservers, contestHide } from '@/data/hiddenRules';
import { optionStore } from '@/data/optionStore';
import { mergeFeatureMechanics } from '@/data/optionFeatures';
import { resolveFeatureCapability, type FeatureCapability } from '@/data/featureCapabilities';
import { executeFeatureChannel } from '@/data/featureChannelRunner';
import { getAttackRiders, applyAttackRiders } from '@/data/attackRiders';
import { immunityLabelFor } from '@/data/conditionImmunity';
import { resolvePoolKey } from '@/data/featurePool';
import npcTemplateStore from '@/data/npcTemplateStore';
import battlegroundStore from '@/data/battlegroundStore';
import { GRID_PRESETS } from '@/types/battleground';
import type { Character, Attack, Feature, AbilityKey } from '@/types/character';
import { ABILITY_LABEL_MAP } from '@/lib/saveBonus';
import type { CombatRecord, Combatant, NpcTemplate, NpcAttack, EquipmentChanges, TurnSnapshot, ReactionPrompt, WildShapeState } from '@/types/combat';
import type { SpellSlotLevel } from '@/types/character';
import { detectReactions } from '@/data/reactionRules';
import { resolveReactionDefinition } from '@/data/reactionDefinitions';
import { isOneActionCast, isBonusActionCast } from '@/types/combat';
import type { PlayerActionRequest } from '@/types/realtime';
import { Plus, Trash2, ArrowLeft, Users, X, Check, SkipForward, Undo2, CheckCircle2, Swords, Pause, PlayCircle, Coins, RotateCcw, Send } from 'lucide-react';
import Battleground from '@/components/Battleground';
import NpcCreator from '@/components/NpcCreator';
import CombatAttackModal from '@/components/CombatAttackModal';
import CombatDamageModal from '@/components/CombatDamageModal';
import FeatureCheckModifierModal from '@/components/combat/FeatureCheckModifierModal';
import FeatureAoeSaveModal from '@/components/combat/FeatureAoeSaveModal';
import QuiveringPalmModal from '@/components/combat/QuiveringPalmModal';
import FeatureConvTargetModal from '@/components/combat/FeatureConvTargetModal';
import HealRollModal from '@/components/combat/HealRollModal';
import { CONV_TARGET_LABELS } from '@/data/engines/resourceConvEngine';
import CombatSpellModal from '@/components/CombatSpellModal';
import ReactionPromptModal from '@/components/ReactionPromptModal';
import DamageAbsorbModal from '@/components/DamageAbsorbModal';
import WildShapeModal from '@/components/WildShapeModal';
import { applyWildShapeForm, restoreWildShapeForm } from '@/data/wildShapeBeasts';
import TurnTodoBoard from '@/components/TurnTodoBoard';
import CombatResourceHud from '@/components/combat/CombatResourceHud';
import CombatantInfoPanel from '@/components/CombatantInfoPanel';
import ForcedMoveDialog from '@/components/ForcedMoveDialog';
import CombatCommitModal from '@/components/CombatCommitModal';
import SandboxDummyDialog, { type SandboxDummyConfig } from '@/components/combat/SandboxDummyDialog';
import { deriveCharacterAffinities, deriveSpeedModifier } from '@/data/passiveCombatRules';

// ===== 试验场人偶预设（模块级，spawnDummy 与存量数据迁移共用） =====
// 注意：normalRange / maxRange 单位是英尺（与 parseWeaponData 解析约定一致）；纯近战武器不要传（会被误判为远程导致近战射程段丢失）
const PROVING_GROUND_ATTACKS: NpcAttack[] = [
  {
    name: '徒手击打',
    attackBonus: '+0',
    damage: '1d4',
    damageType: '钝击',
    range: '5尺',
    properties: [],
    subtype: 'melee',
  },
  {
    name: '长剑',
    attackBonus: '+0',
    damage: '1d8',
    damageType: '挥砍',
    range: '5尺',
    properties: ['多功能', '单手/双手'],
    subtype: 'melee',
  },
  {
    name: '匕首',
    attackBonus: '+0',
    damage: '1d4',
    damageType: '穿刺',
    range: '5尺',
    properties: ['灵巧', '轻型', '投掷', '20/60尺'],
    subtype: 'melee',
    normalRange: 20,
    maxRange: 60,
  },
  {
    name: '长弓',
    attackBonus: '+0',
    damage: '1d8',
    damageType: '穿刺',
    range: '150/600尺',
    properties: ['弹药', '双手', '150/600尺'],
    subtype: 'ranged',
    normalRange: 150,
    maxRange: 600,
  },
  {
    name: '轻弩',
    attackBonus: '+0',
    damage: '1d8',
    damageType: '穿刺',
    range: '80/320尺',
    properties: ['弹药', '装填', '双手', '80/320尺'],
    subtype: 'ranged',
    normalRange: 80,
    maxRange: 320,
    loaded: true,
  },
];

const PROVING_GROUND_EQUIPMENT: Character['equipment'] = [
  { id: 'longsword', childId: 'sandbox-longsword', name: '长剑', quantity: 1, category: '武器', damageDice: '1d8', damageType: '挥砍' },
  { id: 'dagger', childId: 'sandbox-dagger', name: '匕首', quantity: 2, category: '武器', damageDice: '1d4', damageType: '穿刺' },
  { id: 'bow', childId: 'sandbox-longbow', name: '长弓', quantity: 1, category: '武器', damageDice: '1d8', damageType: '穿刺' },
  { childId: 'sandbox-arrows', name: '箭矢', quantity: 999, category: '弹药', unit: '发' },
  { id: 'lightcrossbow', childId: 'sandbox-lightcrossbow', name: '轻弩', quantity: 1, category: '武器', damageDice: '1d8', damageType: '穿刺' },
  { childId: 'sandbox-bolts', name: '弩矢', quantity: 999, category: '弹药', unit: '发' },
];

// 存量试验场数据迁移：旧版人偶只有徒手攻击（且射程字段单位错误）、影子卡无装备包。
// 幂等：已是最新预设的 combatant / 影子卡自动跳过。

// 影子卡经验值：按 PHB 等级-XP 表填（等级字段为真，经验仅驱动 getLevelFromExp 类派生，
// 如武僧无甲移动速度档位）
const SANDBOX_XP_BY_LEVEL: Record<number, number> = {
  1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500, 6: 14000, 7: 23000, 8: 34000,
  9: 48000, 10: 64000, 11: 85000, 12: 100000, 13: 120000, 14: 140000,
  15: 165000, 16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000,
};
function migrateProvingGroundData(record: CombatRecord) {
  let combatantsChanged = false;
  const combatants = record.combatants.map(c => {
    if (c.note === '试验场人偶' && (c.attacks?.length ?? 0) < PROVING_GROUND_ATTACKS.length) {
      combatantsChanged = true;
      return { ...c, attacks: PROVING_GROUND_ATTACKS.map(a => ({ ...a })) };
    }
    return c;
  });
  if (combatantsChanged) {
    combatStore.update(record.id, { combatants });
  }
  record.combatants.forEach(c => {
    if (c.note !== '试验场人偶' || !c.characterId) return;
    const char = characterStore.get(c.characterId);
    if (char && char.isSandbox && (char.equipment?.length ?? 0) === 0) {
      characterStore.update(c.characterId, {
        equipment: PROVING_GROUND_EQUIPMENT.map(e => ({ ...e })),
        readiedRight: 'sandbox-longsword',
      });
    }
  });
}

/**
 * 动作入口门禁：只拦死亡/昏迷/失能。
 * 动作经济（主动作/附赠动作）在结算点消费，不在入口锁——放映模式下由 DM 裁定，
 * 且 0 主动作时仍可能有附赠动作入口（副手攻击、附赠动作法术）。
 */
function ensureCanEnter(c: Combatant): boolean {
  const reason = actionDeniedReason(c);
  if (reason) {
    alert(reason);
    return false;
  }
  return true;
}

export default function CombatSession() {
  // 原内容：完全保留，一个字都没改（和App.tsx路由参数完全对齐）
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [record, setRecord] = useState<CombatRecord | null>(null);

  // DM 明细合并视图：roundsDm 格非空则优先（机器明细），否则回退玩家行；
  // DM 手动编辑走 handleCellChange 会清对应 roundsDm 格，之后显示回退到玩家行
  const dmMergedRounds = useMemo(
    () =>
      (record?.rounds ?? []).map((row, i) => {
        const dm = record?.roundsDm?.[i] ?? {};
        const merged: Record<string, string> = { ...row };
        for (const [cid, v] of Object.entries(dm)) {
          if (v && v.trim()) merged[cid] = v;
        }
        return merged;
      }),
    [record?.rounds, record?.roundsDm],
  );
  const [editingCell, setEditingCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 新增：控制角色选择弹窗的显示状态（仅点击按钮触发，不影响加载逻辑）
  const [showCharSelect, setShowCharSelect] = useState(false);
  // ✅ 新增：批量删除状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // ✅ 新增：NPC 创建器
  const [npcCreatorOpen, setNpcCreatorOpen] = useState(false);
  // 荒野变形弹窗状态（德鲁伊 2 级战斗变形）：确认时执行参战者数据替换/还原
  const [wildShapeModal, setWildShapeModal] = useState<{
    combatantId: string;
    current: WildShapeState | null;
    poolKey: string | null;
    cost: number;
    featureName: string;
    activation: 'action' | 'bonus' | 'free' | 'reaction' | undefined;
  } | null>(null);
  // 试验场己方人偶设置弹窗（职业/子职业/等级/属性/资源）
  const [dummyDialogOpen, setDummyDialogOpen] = useState(false);
  // ✅ 新增：战斗攻击检定弹窗（在 main 上处理）
  const [attackModal, setAttackModal] = useState<{
    attacker: Combatant;
    target: Combatant;
    attackerPos?: { col: number; row: number };
    targetPos?: { col: number; row: number };
    /** 多重攻击序列：本步锁定的攻击名（未匹配步缺省 = 自选攻击） */
    lockedAttackName?: string;
    /** 多重攻击序列步骤徽标：「多重攻击 第2/3击 · 爪击」 */
    multiattackStepLabel?: string;
  } | null>(null);
  // ✅ 新增：伤害结算弹窗（攻击命中后切换）
  const [damageModal, setDamageModal] = useState<{
    attacker: Combatant;
    target: Combatant;
    attack: Attack | NpcAttack;
    disadvantage: boolean;
    isCritical: boolean;
    // 用于写入先攻表格的攻击检定过程信息
    d20Rolled: number[];
    d20Final: number;
    d20Bonus: number;
    d20Total: number;
    usageMode?: 'melee' | 'thrown';
    isTwoHandedWield?: boolean;
    /** 借机攻击路径：伤害确认/关闭后推进反应机会队列 */
    reactionPending?: boolean;
    /** 本次伤害已过 damage_taken 反应窗口：再次确认时直接结算 */
    reactionWindowDone?: boolean;
    /** damage_taken 窗口内 damage_modifier 反应累计吸收量：结算时从伤害中扣减 */
    absorbedDamage?: number;
  } | null>(null);
  // 借机攻击机会队列：move 触发 → 弹窗逐个处理（确认/放弃/过期）→ 推进
  const [reactionQueue, setReactionQueue] = useState<ReactionPrompt[] | null>(null);
  const [reactionIdx, setReactionIdx] = useState(0);
  // 伤害结算期间挂起队列（命中确认后等伤害弹窗关闭再展示下一个机会）
  const [reactionHold, setReactionHold] = useState(false);
  // 命中确认后若有防御方反应（attack_targeted），伤害弹窗延后到反应队列处理完毕再打开
  const [pendingDamage, setPendingDamage] = useState<{
    attacker: Combatant;
    target: Combatant;
    attack: Attack | NpcAttack;
    disadvantage: boolean;
    isCritical: boolean;
    d20Rolled: number[];
    d20Final: number;
    d20Bonus: number;
    d20Total: number;
    usageMode?: 'melee' | 'thrown';
    isTwoHandedWield?: boolean;
  } | null>(null);
  // 法术反应窗口：施法效果延后到 spell_cast 队列清空后应用
  const [pendingCast, setPendingCast] = useState<{
    label: string;
    casterId: string;
    exercised: boolean;
    finalize: () => void;
  } | null>(null);
  // 有反应被行使时，施法效果是否应用交给 DM 二次确认（反制场景默认不应用）
  const [pendingCastConfirm, setPendingCastConfirm] = useState<{
    label: string;
    casterId: string;
    finalize: () => void;
  } | null>(null);
  // ✅ 新增：法术施放弹窗（独立交互流程，与攻击检定解耦）
  const [spellModal, setSpellModal] = useState<{
    caster: Combatant;
    target: Combatant;
  } | null>(null);
  // 战斗结算弹窗（并入角色卡 + 封存记录）
  const [settlementOpen, setSettlementOpen] = useState(false);
  // ✅ 新增：协助（Help）动作弹窗 —— 选择友方 → 挂 pending 优劣势标记
  const [helpModal, setHelpModal] = useState<{ from: Combatant } | null>(null);
  // ✅ checkModifier 通道弹窗（激励骰等）：选受益人 → 确认时扣动作与池
  const [checkModifierModal, setCheckModifierModal] = useState<{
    from: Combatant;
    featureName: string;
    capability?: FeatureCapability;
    activation: Feature['activation'];
    poolKey: string | null;
    cost: number;
  } | null>(null);
  // ✅ aoe_save 通道弹窗（吐息武器等）：范围拾取 + 逐目标豁免 → 确认时扣动作与池并落 HP
  const [aoeSaveModal, setAoeSaveModal] = useState<{
    from: Combatant;
    featureName: string;
    capability?: FeatureCapability;
    activation: Feature['activation'];
    poolKey: string | null;
    cost: number;
    /** 形状描述覆盖（怪物吐息传入模板 shape 文本，无角色卡特性可读） */
    descriptionOverride?: string;
  } | null>(null);
  // resource_conv convert 通道弹窗（灵巧动作类）：to 多元素先选动作项，确认时扣动作与池
  const [convTargetPick, setConvTargetPick] = useState<{
    from: Combatant;
    featureName: string;
    capability?: FeatureCapability;
    targets: string[];
    activation: Feature['activation'];
    poolKey: string | null;
    cost: number;
  } | null>(null);
  // heal 骰值环节弹窗（线下骰口径）：spec 带 dice 的 heal 先填线下骰结果，确认时扣动作与池
  const [healRollPick, setHealRollPick] = useState<{
    from: Combatant;
    feature: Feature;
    capability: FeatureCapability;
    poolKey: string | null;
    cost: number;
  } | null>(null);
  // 渗透劲引爆弹窗：目标身上带施劲者标记时，渗透劲按钮变引爆入口；确认时耗动作/落地伤害/解除标记
  const [quiveringPalmModal, setQuiveringPalmModal] = useState<{
    from: Combatant;
    target: Combatant;
    markInstanceIds: string[];
    dc: number;
    damageDice: string;
    damageType: string;
  } | null>(null);

  // ✅ 选中格状态（先攻表格操作 + 手动记录弹窗依赖）
  const [selectedCell, setSelectedCell] = useState<{ round: number; combatantId: string } | null>(null);
  // ✅ 模拟模式手动记录：先选操作主体（无表格格子可选，round 用 -1 占位）
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  // ✅ 参战者信息面板（点击表头名称按钮打开，等价沙盘双击弹窗）
  const [infoPanelCombatant, setInfoPanelCombatant] = useState<Combatant | null>(null);
  // ✅ 强制位移弹窗（参战者面板/沙盘双击面板入口，落位引擎见 useForcedMove）
  const [forcedMoveTarget, setForcedMoveTarget] = useState<Combatant | null>(null);
  // 躲藏/搜索的线下骰录入弹窗（隐匿总值 / 察觉 d20）
  const [hideRollTarget, setHideRollTarget] = useState<Combatant | null>(null);
  const [searchRollTarget, setSearchRollTarget] = useState<Combatant | null>(null);
  // ✅ 战斗结束回传弹窗
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  // ✅ 沙盘最近单击选中的参战者 ID（用于左上 HUD 展示；若放映中有当前回合则以当前回合角色优先覆盖）
  const [sandboxSelectedId, setSandboxSelectedId] = useState<string | null>(null);
  // 回合快照集合（key = `${round}:${combatantId}`）
  // （TurnSnapshot 是 @/types/combat 导出的全局 interface，已在上面 import）
  const rollbackSnapshotRef = useRef<{
    initial: TurnSnapshot | null;
    snapshots: Record<string, TurnSnapshot>;
  }>({ initial: null, snapshots: {} });

  // ✅ 自动推进锁：防止昏迷角色回合 setTimeout 递归
  const autoAdvanceRef = useRef(false);
  // ✅ 自动推进定时器 ID：手动推进时清除，防止竞态
  const autoAdvanceTimerRef = useRef<number | null>(null);

  // 回合推进全链路：由 hook 接管（playbackStarted/currentTurn/确认弹窗/回溯弹窗/快照/回溯）。
  // 必须置于下方 playback 相关 effect 之前：effect 依赖数组在渲染期读取 playbackStarted/currentTurn。
  // resetCombatantActions / isPlaybackActive 由下方 useActions hook 返回，
  // 晚于本调用声明，用惰性箭头解引用（避开 TDZ）
  const {
    playbackStarted,
    setPlaybackStarted,
    currentTurn,
    setCurrentTurn,
    confirmEndTurnOpen,
    setConfirmEndTurnOpen,
    rewindModal,
    setRewindModal,
    canUndoLastRecord,
    undoLastRecord,
    handleCellChange,
    findNextValidTurn,
    checkAndAutoAdvance,
    recordOperation,
    takeTurnSnapshot,
    applyRollback,
    confirmEndTurn,
    advanceTurn,
  } = useRoundTurn(record, {
    resetCombatantActions: (id: string) => resetCombatantActions(id),
    isPlaybackActive: () => isPlaybackActive(),
    setCommitModalOpen,
    rollbackSnapshotRef,
    autoAdvanceRef,
    autoAdvanceTimerRef,
    // 惰性解引用：useZoneEffects 定义在本调用之后（依赖 handleApplyDamage）
    resolveEndTurnZone: (combatantId, round) => resolveEndTurnZone(combatantId, round),
    expireZonesForRound: (round) => { expireZonesForRound(round); },
  });

  // 强制位移落位引擎（手动入口与流程绑定共用，design.md 单一落位引擎）
  const { executeForcedMove } = useForcedMove(record?.id ?? null);

  // 防御方反应队列处理完毕（且无挂起的借机伤害）→ 打开延后的伤害结算弹窗
  useEffect(() => {
    if (!pendingDamage || damageModal || reactionHold) return;
    if (reactionIdx < (reactionQueue?.length ?? 0)) return;
    setDamageModal(pendingDamage);
    setPendingDamage(null);
  }, [pendingDamage, damageModal, reactionHold, reactionIdx, reactionQueue]);

  // 施法反应窗口处理完毕（且无挂起的伤害/弹窗）→ 应用延后的施法效果；
  // 已行使反应时先让 DM 确认是否仍应用（法术反制应在此取消）
  useEffect(() => {
    if (!pendingCast) return;
    if (reactionHold || damageModal || pendingDamage) return;
    if (reactionIdx < (reactionQueue?.length ?? 0)) return;
    const current = pendingCast;
    setPendingCast(null);
    if (current.exercised) {
      setPendingCastConfirm({ label: current.label, casterId: current.casterId, finalize: current.finalize });
    } else {
      current.finalize();
    }
  }, [pendingCast, reactionHold, damageModal, pendingDamage, reactionIdx, reactionQueue]);

  /** 标记本次反应窗口已有反应被行使（决定施法效果是否进入二次确认） */
  const noteReactionExercised = () => {
    setPendingCast(prev => (prev ? { ...prev, exercised: true } : prev));
  };

  /** 施法确认前的反应窗口：有 spell_cast 机会则延后 finalize，队列清空后再应用 */
  const beginSpellCastWindow = (casterId: string, spellId: string | undefined, spellName: string, finalize: () => void) => {
    if (!record || !spellId) {
      finalize();
      return;
    }
    const matches = detectReactions(record, { kind: 'spell_cast', casterId, spellId });
    if (matches.length === 0) {
      finalize();
      return;
    }
    const rxRound = currentTurn ? currentTurn.round + 1 : 0;
    const fulls = matches.flatMap(m => combatStore.addReactionPrompts(record.id, m.ownerId, [m], rxRound));
    setPendingCast({ label: spellName, casterId, exercised: false, finalize });
    setReactionQueue(prev => [...(prev || []), ...fulls]);
  };

  // 队列头部持有者已失效（死亡/昏迷/失能）→ 自动作废并推进，避免队列卡死挡住延后的伤害弹窗
  useEffect(() => {
    if (!record || !reactionQueue || reactionIdx >= reactionQueue.length) return;
    const head = reactionQueue[reactionIdx];
    const headOwner = record.combatants.find(c => c.id === head.ownerId);
    if (!headOwner || headOwner.isDead || headOwner.isUnconscious || headOwner.isIncapacitated) {
      combatStore.consumePendingReaction(record.id, head.ownerId, head.id);
      setReactionIdx(i => i + 1);
    }
  }, [record, reactionQueue, reactionIdx]);

  /** 反应法术位剩余（角色卡槽位 - 战斗内已消耗增量）；无角色卡/无该环返回 0 */
  const reactionSlotRemaining = (owner: Combatant, level: number): number => {
    const char = owner.characterId ? characterStore.get(owner.characterId) : null;
    const slot = char?.spells?.spellSlots?.[`level${level}` as SpellSlotLevel];
    if (!slot) return 0;
    const delta = record?.spellSlotChanges?.[owner.id]?.[`level${level}`] ?? 0;
    return Math.max(0, slot.max - slot.used - delta);
  };

  // 原内容：完全保留，一个字都没改（加载逻辑100%不变，保证能进入）
  useEffect(() => {
    if (!sessionId) return;
    const r = combatStore.get(sessionId);
    setRecord(r || null);
    const unsub = combatStore.subscribe(() => {
      setRecord(combatStore.get(sessionId) || null);
    });
    return unsub;
  }, [sessionId]);

  // 参战者角色卡机械字段自动刷新：老卡缺 activation/resource/poolFormula 标注会导致
  // 动作/池经济零记账（特性引擎按名字命中 capability，数据面靠卡上标注）——进战时幂等合并
  // 一次（description 保留、库无标注不动、changed 才写入防循环）；与 CharacterDetail 的
  // 打卡刷新同源（mergeFeatureMechanics），战斗页无角色卡详情打开路径也能升级。
  const mechanicsSyncedRef = useRef<Set<string>>(new Set());
  // 种子 chunk 晚到时 collectOptionFeatureEntries 返回空、合并空跑——optionTick 让种子
  // 就绪（store notify）后重跑一遍，避免进战瞬间升级失败且不再补跑
  const [optionTick, setOptionTick] = useState(0);
  useEffect(() => optionStore.subscribe(() => setOptionTick((t) => t + 1)), []);
  useEffect(() => {
    if (!record) return;
    const seedReady = !!optionStore.getByName('勇士', 'class');
    for (const c of record.combatants) {
      if (!c.characterId) continue;
      if (seedReady && mechanicsSyncedRef.current.has(c.characterId)) continue;
      const char = characterStore.get(c.characterId);
      if (!char) continue;
      const { features, changed } = mergeFeatureMechanics(char);
      if (seedReady) mechanicsSyncedRef.current.add(c.characterId);
      if (changed) characterStore.update(char.id, { features });
    }
  }, [record?.id, optionTick]);

  // 放映生命周期：由 hook 接管（暂停/恢复/从头播放/退出确认/initial 快照 IDB 持久化）。
  // 置于 useActions 之前：isPlaybackActive 依赖本 hook 的 playbackPaused。
  // resetCombatantActions / autoFillDownedMarkers / openSurpriseAttackModal 定义于更下方，用惰性箭头解引用。
  const {
    playbackPaused,
    setPlaybackPaused,
    pausedTurnRef,
    playbackSnapshotRef,
    exitPlaybackModalOpen,
    setExitPlaybackModalOpen,
    pendingRestartPlayback,
    setPendingRestartPlayback,
    commitModeChange,
    handleModeChange,
    finalizeExitPlayback,
    pausePlayback,
    resumePlayback,
    startPlayback,
    handleRestartPlayback,
    startPlaybackFromBeginning,
  } = usePlayback(record, {
    playbackStarted,
    setPlaybackStarted,
    currentTurn,
    setCurrentTurn,
    findNextValidTurn,
    checkAndAutoAdvance,
    takeTurnSnapshot,
    rollbackSnapshotRef,
    selectedCell,
    resetCombatantActions: (id: string) => resetCombatantActions(id),
    autoFillDownedMarkers: () => autoFillDownedMarkers(),
    openSurpriseAttackModal: (round: number) => openSurpriseAttackModal(round),
  });

  // 动作机制：由 hook 接管（isPlaybackActive 含 playbackPaused 判定，暂停期间按模拟模式处理）。
  // resetCombatantActions / isPlaybackActive 供上方 useRoundTurn 的惰性箭头闭包引用。
  const {
    currentMode,
    isPlaybackActive,
    canUseAction,
    canUseBonusAction,
    canUseReaction,
    consumeCombatantAction,
    consumeCombatantBonusAction,
    consumeCombatantReaction,
    markLoadingAttacked,
    resetCombatantActions,
  } = useActions(record, { playbackStarted, playbackPaused, currentTurn });

  // ✅ 新增：过滤已参战的角色，避免重复添加（完全不影响原有逻辑）
  const existingCharIds = record
    ? new Set(record.combatants.map(c => c.characterId).filter(Boolean))
    : new Set<string>();
  // ✅ 新增：从角色库读取未参战的PC（仅读取，不修改）
  const availableChars = characterStore.getAllVisible().filter(char => 
    !existingCharIds.has(char.id)
  );

  // ✅ 修复：刷新/关闭页面后再次进入战斗，把 IndexedDB 中的快照回灌到内存 useRef
  // 触发条件：record 已加载且当前是放映模式但内存 initial 为空
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    if (rollbackSnapshotRef.current.initial) return;
    (async () => {
      try {
        const init = await snapDb.getInitialSnapshot(record.id);
        if (init && !rollbackSnapshotRef.current.initial) {
          rollbackSnapshotRef.current.initial = init;
        }
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode, playbackStarted]);

  // 试验场存量数据迁移（幂等：旧人偶补攻击预设、影子卡补装备包）
  useEffect(() => {
    if (record?.isProvingGround) {
      migrateProvingGroundData(record);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const lastSavedPlaybackState = useRef<string>('');

  // ✅ 放映状态持久化与自动恢复
  // 1. 放映状态变化时自动保存到 combatStore（避免每次渲染都写入，使用 ref 缓存上次的值）
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    const key = JSON.stringify({
      started: playbackStarted,
      paused: playbackPaused,
      currentTurn,
    });
    if (key === lastSavedPlaybackState.current) return;
    lastSavedPlaybackState.current = key;
    combatStore.update(record.id, {
      playbackState: {
        started: playbackStarted,
        paused: playbackPaused,
        currentTurn,
      },
      updatedAt: Date.now(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode, playbackStarted, playbackPaused, currentTurn?.round, currentTurn?.combatantId]);

  // 2. 刷新后自动恢复到当前回合并暂停
  useEffect(() => {
    if (!record || record.mode !== 'playback') return;
    if (playbackStarted) return; // 已经在放映中，无需恢复
    const ps = record.playbackState;
    if (!ps || !ps.started) return;
    // 恢复放映状态到当前回合并暂停
    if (ps.currentTurn && ps.currentTurn.combatantId) {
      setCurrentTurn(ps.currentTurn);
      setPlaybackStarted(true);
      setPlaybackPaused(true);
      pausedTurnRef.current = ps.currentTurn;
      // 只拍快照，不重置动作/移动力：刷新前该回合已消耗的资源必须原样保留
      // （回合开始时的重置由 advanceTurn/startPlayback 负责，这里重复重置会丢数据）
      takeTurnSnapshot(ps.currentTurn.round, ps.currentTurn.combatantId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.mode]);

  // 战斗背包 + 有效 AC：由 hook 接管（useMemo 按 record 引用缓存，store 更新生成新引用自然失效）
  const { combatInventories, getEffectiveAc } = useCombatInventories(record);

  // 弹窗参战者实时解析：attackModal/spellModal 存的是打开时的快照对象，
  // 弹窗内换持/消耗材料写库后，若仍传快照，可用性与手持判定会读到旧手持槽
  const liveAttackModalAttacker = attackModal
    ? record?.combatants.find(c => c.id === attackModal.attacker.id) ?? attackModal.attacker
    : null;
  const liveAttackModalTarget = attackModal
    ? record?.combatants.find(c => c.id === attackModal.target.id) ?? attackModal.target
    : null;
  const liveSpellModalCaster = spellModal
    ? record?.combatants.find(c => c.id === spellModal.caster.id) ?? spellModal.caster
    : null;
  const liveSpellModalTarget = spellModal
    ? record?.combatants.find(c => c.id === spellModal.target.id) ?? spellModal.target
    : null;

  // 实时观战广播（DM 端）：record 变化 → combat.delta 幂等快照 → realtime Worker 房间
  const combatBroadcast = useCombatBroadcast(record);

  // 抛送观战邀请到玩家圆桌（与圆桌页同一接口：fan-out 给本团绑定玩家）
  const { current: campaign } = useCampaign();
  const [inviteSending, setInviteSending] = useState(false);
  const handleSendSpectateInvite = async () => {
    if (!record) return;
    const roomId = combatBroadcast.roomId || `combat-${record.id}`;
    setInviteSending(true);
    try {
      const res = await sendSpectateInvite({
        roomId,
        title: record.title,
        campaignId: campaign?.id || undefined,
      });
      alert(`观战邀请已抛送给 ${res.recipients} 个玩家账号\n\n玩家可在「圆桌」页点击邀请卡片直接进入观战`);
    } catch (e) {
      alert(`抛送失败：${(e as Error)?.message ?? '请重试'}`);
    } finally {
      setInviteSending(false);
    }
  };

  // HP / 昏迷 / 死亡豁免待办生命周期：由 hook 接管
  const { handleApplyDamage, handleApplyHealing, autoFillDownedMarkers } = useDamageAndHp(record, {
    currentTurn,
    playbackMode: record?.mode === 'playback',
  });

  // 玩家回合操作收件箱：直接放行开启时免审落库（校验失败自动拒绝回执），否则进审核卡
  const [autoAcceptTurns, setAutoAcceptTurns] = useState(() => {    try {
      return localStorage.getItem('combat-auto-accept') === '1';
    } catch {
      return false;
    }
  });
  const toggleAutoAcceptTurns = (on: boolean) => {
    setAutoAcceptTurns(on);
    try {
      localStorage.setItem('combat-auto-accept', on ? '1' : '0');
    } catch {
      // 隐私模式下 localStorage 不可写：仅本次会话生效
    }
  };
  const applyPlayerCommit = (request: PlayerActionRequest): { ok: boolean; reason?: string } => {
    if (!record) return { ok: false, reason: '战斗记录不可用' };
    const outcome = applyTurnCommit({
      record,
      request,
      currentRound: (currentTurn?.round ?? -1) + 1,
      applyDamage: (event) => handleApplyDamage(event),
      applyHealing: (targetId, amount) => handleApplyHealing(targetId, amount),
      consumeAction: consumeCombatantAction,
      consumeBonusAction: consumeCombatantBonusAction,
      advanceTurn,
      beginConcentration: (combatantId, spellName) => {
        beginConcentration(combatantId, spellName);
      },
    });
    // 回合包里的移动触发借机攻击：整包已落库，机会已持久化 → 打开逐个处理队列
    if (outcome.ok && outcome.reactions?.length) {
      setReactionQueue(prev => [...(prev || []), ...outcome.reactions!]);
    }
    // TS6 + strict:false 下 `!outcome.ok` 真值取反不触发判别式收窄，须用 === false 显式比较
    if (outcome.ok === false) return { ok: false, reason: outcome.reason };
    return { ok: true };
  };
  const { pending: pendingPlayerActions, resolve: resolvePlayerAction } = usePlayerActionInbox(
    combatBroadcast.client,
    autoAcceptTurns
      ? (item) => {
          const outcome = applyPlayerCommit(item.request);
          return { accepted: outcome.ok, reason: outcome.reason };
        }
      : null
  );

  // 参战者绑定映射（userId → 绑定角色 ID 集合）：审核卡校验玩家操作归属，加载失败仅降级为「未验证」
  const [boundByUser, setBoundByUser] = useState<Map<string, Set<string>>>(new Map());
  useEffect(() => {
    fetchBoundCharacters()
      .then((res) => {
        const map = new Map<string, Set<string>>();
        for (const b of res.characters ?? []) {
          if (!b.boundUserId || !b.id) continue;
          if (!map.has(b.boundUserId)) map.set(b.boundUserId, new Set());
          map.get(b.boundUserId)!.add(b.id);
        }
        setBoundByUser(map);
      })
      .catch(() => setBoundByUser(new Map()));
  }, []);

  // 专注声明（D&D 5e）：成功施展专注类法术后由 onCastResolved / onFlowResolved 调用。
  // statusIds：本次施法流程附加的状态实例 ID（防护能量的抗性等），专注结束时联动移除。
  // 已有专注时施放另一个专注法术 → 中断旧的并开始新的（旧专注挂载的状态同步移除），
  // 返回的表格备注由调用方拼接进摘要文本。
  const beginConcentration = (combatantId: string, spellName: string, statusIds?: string[]): string | null => {
    if (!record?.id) return null;
    const latest = combatStore.get(record.id);
    const caster = latest?.combatants.find(c => c.id === combatantId);
    if (!latest || !caster) return null;
    if (caster.isDead || caster.isUnconscious || caster.isIncapacitated) return null;
    if (globalStatusManager.hasEffect(combatantId, 'concentration_block', 'combat')) return null;
    const prev = caster.concentration;
    // 替换/重施：旧专注挂载的状态实例同步结束（5e：失去旧的才开始新的）
    combatStore.removeConcentrationStatuses(prev);
    combatStore.update(record.id, {
      combatants: latest.combatants.map(c =>
        c.id === combatantId
          ? { ...c, concentration: { spellName, startedRound: currentTurn?.round ?? 0, ...(statusIds?.length ? { statusIds } : {}) } }
          : c,
      ),
      updatedAt: Date.now(),
    });
    // 专注维持待办：与 concentration 字段同生命周期。
    // 替换/重施时先删旧再建新（endRound=-1 无限期，由 concludeConcentrationMaintain
    // 勾选结束、豁免失败/失能/死亡由 cleanup 自动移除）。
    // 模拟与放映模式都创建——试验场测试专注法术同样需要维持提醒。
    (combatStore.get(record.id)?.turnTodos ?? [])
      .filter(t => t.type === 'concentration_maintain' && t.combatantId === combatantId)
      .forEach(t => combatStore.removeTurnTodo(record.id, t.id));
    combatStore.addTurnTodo(record.id, {
      combatantId,
      name: `维持专注：${spellName}`,
      type: 'concentration_maintain',
      startRound: currentTurn?.round ?? 0,
      endRound: -1,
    });
    // 重施同一法术：重置计时但无需"中断"说明（5e 语义上仍是失去再开始）
    return prev && prev.spellName !== spellName ? `，中断《${prev.spellName}》专注` : null;
  };

  // 投掷武器掉落：由 hook 接管（executeThrownDrop 需显式传入 record）
  const { executeThrownDrop } = useThrownDrop(record?.id ?? null);

  // 地形区域效果（着火等）：进入区域 / 回合结束时结算伤害，按回合清理过期区域。
  // recordOperation 依赖 useRoundTurn 已返回；applyDamage 走统一伤害入口。
  const { handleTokenMoved, resolveEndTurnZone, expireZonesForRound } = useZoneEffects(record, {
    applyDamage: handleApplyDamage,
    recordOperation: (combatantId, text, kind, detail?, writeCellOverride?) =>
      recordOperation(combatantId, text, kind, detail, writeCellOverride),
  });

  // 沙盘变更信号：棋子移动只写 battlegroundStore，不经过 combatStore，
  // 因此位置字典必须额外订阅沙盘，否则流程/射程判定会读到过期坐标。
  const [battlegroundTick, setBattlegroundTick] = useState(0);
  useEffect(() => {
    if (!record?.id) return;
    return battlegroundStore.subscribe(() => setBattlegroundTick(t => t + 1));
  }, [record?.id]);

  // 所有参战者沙盘位置字典（用于跨参战者距离判定：协助动作 5 尺约束等）
  const combatantPositions = useMemo(() => {
    if (!record?.id) return null;
    const bg = battlegroundStore.get(record.id);
    if (!bg?.tokens) return null;
    const map: Record<string, { col: number; row: number }> = {};
    for (const t of bg.tokens) {
      if (!t.combatantId) continue;
      map[t.combatantId] = { col: t.col, row: t.row };
    }
    return map;
    // battlegroundTick：棋子位置变化不写战斗记录，需要显式依赖触发重算
  }, [record?.id, record?.combatants.length, record?.updatedAt, battlegroundTick]);

  // 战斗中可打开 NpcCreator 编辑模板，订阅刷新让特性面板读到最新数据
  const [npcTemplateTick, setNpcTemplateTick] = useState(0);
  useEffect(() => {
    return npcTemplateStore.subscribe(() => setNpcTemplateTick(t => t + 1));
  }, []);

  // 放映中当前回合 NPC 的图鉴模板（沙盘下方特性面板数据源）：
  // 仅放映已开始且处于 NPC 回合时解析；PC 回合 / 暂停（currentTurn 清空）/ 非放映 / 自定义 NPC 均为 null。
  // combatant.templateId 是模板业务键（非 store 内部 id），与拾取逻辑同款按 templateId 字段查找。
  const activeTurnNpcTemplate = useMemo(() => {
    if (!record || record.mode !== 'playback' || !playbackStarted || !currentTurn) return null;
    const combatant = record.combatants.find(c => c.id === currentTurn.combatantId);
    if (!combatant || combatant.isPc || !combatant.templateId) return null;
    const tpl = npcTemplateStore.getAll().find(t => t.templateId === combatant.templateId) ?? null;
    // 模板存在但既无结构化 traits 也无 features 原文时不占位，避免空面板
    if (!tpl || !(tpl.traits?.length || tpl.features?.trim())) return null;
    return tpl;
    // npcTemplateTick：模板编辑后刷新
  }, [record, currentTurn, playbackStarted, npcTemplateTick]);

  // 突袭回合标记：状态与弹窗逻辑由 hook 接管；onConfirmed 负责与「从头播放」流程联动
  const {
    surpriseAttackOpen,
    surpriseAttackRound,
    surprisedCombatants,
    openSurpriseAttackModal,
    closeSurpriseAttackModal,
    toggleSurprisedCombatant,
    confirmSurpriseAttack,
  } = useSurprise(record, {
    onConfirmed: () => {
      if (pendingRestartPlayback) {
        setPendingRestartPlayback(false);
        startPlaybackFromBeginning();
      }
    },
  });

  // 手动记录：状态与确认/取消逻辑由 hook 接管。
  // canUseAction / consumeCombatantAction / handleApplyDamage / handleCellChange
  // 在下方早退之后才定义，用惰性箭头解引用（箭头体仅在事件触发时求值，避开 TDZ）
  const {
    manualRecordOpen, setManualRecordOpen,
    manualRecordType, setManualRecordType,
    manualTargetId, setManualTargetId,
    manualAttackMethod, setManualAttackMethod,
    manualDamage, setManualDamage,
    manualIsKill, setManualIsKill,
    manualHealMethod, setManualHealMethod,
    manualHealAmount, setManualHealAmount,
    manualD20, setManualD20,
    manualD20Second, setManualD20Second,
    manualAttackBonus, setManualAttackBonus,
    manualRollMode, setManualRollMode,
    manualCrit, setManualCrit,
    manualActionCost, setManualActionCost,
    manualAttackCount, setManualAttackCount,
    manualDamageType, setManualDamageType,
    manualAttackSource, setManualAttackSource,
    manualWeaponTraits, setManualWeaponTraits,
    confirmManualRecord,
    cancelManualRecord,
  } = useManualRecord(record, {
    selectedCell,
    setSelectedCell,
    getEffectiveAc,
    canUseAction: (id: string) => canUseAction(id),
    canUseBonusAction: (id: string) => canUseBonusAction(id),
    canUseReaction: (id: string) => canUseReaction(id),
    consumeCombatantAction: (id: string) => consumeCombatantAction(id),
    consumeCombatantBonusAction: (id: string) => consumeCombatantBonusAction(id),
    consumeCombatantReaction: (id: string) => consumeCombatantReaction(id),
    handleApplyDamage: (event) => handleApplyDamage(event),
    handleApplyHealing,
    recordOperation,
  });

  // 手动记录入口：重置全部字段后打开弹窗（表格两处调用 + 沙盘共用同一重置序列）
  const openManualRecord = (round?: number, combatantId?: string) => {
    if (round !== undefined && combatantId) setSelectedCell({ round, combatantId });
    setManualRecordType('attack');
    setManualRecordOpen(true);
    setManualTargetId('');
    setManualAttackMethod('');
    setManualDamage('');
    setManualIsKill(false);
    setManualHealMethod('');
    setManualHealAmount('');
    setManualD20('');
    setManualD20Second('');
    setManualAttackBonus('0');
    setManualRollMode('none');
    setManualCrit(false);
    setManualActionCost('action');
    setManualAttackCount('1');
    setManualDamageType('');
    setManualAttackSource('weapon');
    setManualWeaponTraits({ magical: null, silvered: null, adamantine: null });
  };

  // 先攻全链路：由 hook 接管（投掷弹窗 / 平局拖拽 / 批量删除 / 圆形序号）。
  // 编辑状态（editingInitiative/initiativeInput）随内联编辑 UI 只读化一并移入 hook；
  // checkTieAndOpen 在下方 handleCreateNpc（早退之后）被引用，闭包事件期求值，无 TDZ
  const {
    initiativeOrder,
    getInitiativeCircle,
    handleConfirmInitiative,
    checkTieAndOpen,
    handleConfirmTiebreaker,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleAddRound,
    handleBatchDelete,
    toggleSelect,
    cardRefs,
    initiativeRollOpen,
    setInitiativeRollOpen,
    selectedPc,
    setSelectedPc,
    d20Input,
    setD20Input,
    tiebreakerOpen,
    setTiebreakerOpen,
    tiedOrder,
    setTiedOrder,
    draggingIndex,
  } = useInitiative(record, {
    selectedIds,
    setSelectedIds,
    batchMode,
    setBatchMode,
  });

  // 原内容：完全保留，一个字都没改（权限校验逻辑不变）
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div className="text-center py-16 text-sm opacity-50">无权限访问</div>
      </div>
    );
  }

  // 原内容：完全保留，一个字都没改（未找到逻辑不变）
  if (!record) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => navigate('/combat')} className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          返回
        </button>
        <div className="text-center py-16 text-sm opacity-50">
          战斗记录未找到（sessionId: {sessionId || '空'}）
        </div>
      </div>
    );
  }

  const handleAddCombatant = (char?: Character) => {
    if (char) {
      setSelectedPc(char);
      setD20Input('');
      setShowCharSelect(false);
      setInitiativeRollOpen(true);
      return;
    }

    setShowCharSelect(false);
    setNpcCreatorOpen(true);
  };

  const handleCreateNpc = (combatantData: Omit<Combatant, 'id'>) => {
    const newId = crypto.randomUUID();
    const newCombatant: Combatant = {
      ...combatantData,
      id: newId,
      actions: typeof combatantData.actions === 'number' && combatantData.actions >= 0 ? combatantData.actions : 1,
    };
    const updatedCombatants = [...record.combatants, newCombatant].sort(
      (a, b) => b.initiative - a.initiative
    );
    const updatedRounds = record.rounds.map(round => ({
      ...round,
      [newCombatant.id]: '',
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
    checkTieAndOpen(newId);
  };

  // 试验场：一键生成默认数值人偶（属性全 10、HP 20、AC 10、速度 30、徒手攻击、先攻随机 1-20）。
  // 底层自动创建影子角色卡（isSandbox，不上云、角色列表隐藏），使人偶复用完整 PC
  // 装备手持/穿戴/AC 重算/弹药派生链路；敌我仅 isPc 与命名区分。
  const spawnDummy = (hostile: boolean) => {
    spawnConfiguredDummy(hostile, null);
  };

  // 按配置生成人偶：hostile=true 走默认一键；己方人偶经 SandboxDummyDialog 传入配置
  // （职业/子职业/等级 → 特性写入影子卡 + 法术位按职业表填充，被动引擎经 characterId 链路生效）
  const spawnConfiguredDummy = (hostile: boolean, config: SandboxDummyConfig | null) => {
    if (!record) return;
    const existingCount = record.combatants.filter(c => c.name.includes('试验体·')).length;
    const name = config?.name || `试验体·${hostile ? '敌' : '友'}${existingCount + 1}`;
    const maxHp = config?.maxHp ?? 20;
    const speed = config?.speed ?? 30;
    const level = config?.level ?? 1;
    // 属性：config 传 score，派生 modifier；默认全 10（modifier 0）
    const abilities = config
      ? ({
          strength: { score: config.abilities.strength, modifier: Math.floor((config.abilities.strength - 10) / 2) },
          dexterity: { score: config.abilities.dexterity, modifier: Math.floor((config.abilities.dexterity - 10) / 2) },
          constitution: { score: config.abilities.constitution, modifier: Math.floor((config.abilities.constitution - 10) / 2) },
          intelligence: { score: config.abilities.intelligence, modifier: Math.floor((config.abilities.intelligence - 10) / 2) },
          wisdom: { score: config.abilities.wisdom, modifier: Math.floor((config.abilities.wisdom - 10) / 2) },
          charisma: { score: config.abilities.charisma, modifier: Math.floor((config.abilities.charisma - 10) / 2) },
        } as Character['abilities'])
      : undefined;
    const char = characterStore.createSandbox({
      name,
      maxHp,
      currentHp: maxHp,
      armorClass: 10,
      speed,
      level,
      experience: SANDBOX_XP_BY_LEVEL[level] ?? 0,
      ...(config?.className
        ? { profession: { class: config.className, ...(config.subclassName ? { subclass: config.subclassName } : {}) } as Character['profession'] }
        : {}),
      ...(abilities ? { abilities: abilities as Character['abilities'] } : {}),
      ...(config?.features?.length ? { features: config.features } : {}),
      ...(config
        ? { spells: { cantrips: [], custom: [], spellSlots: config.spellSlots } as Character['spells'] }
        : {}),
      equipment: PROVING_GROUND_EQUIPMENT.map(e => ({ ...e })),
      readiedRight: 'sandbox-longsword',
    });
    // 战斗层手持初始化（与 PC 参战同源）：拿起备战中的长剑，武器攻击立即可用
    const hands = combatStore.initCombatantHands(char);
    const heldIds = [hands.heldLeft?.equipmentId, hands.heldRight?.equipmentId].filter(Boolean) as string[];
    const heldEquipment = heldIds
      .map(hid => (char.equipment ?? []).find(e => (e.childId || e.id) === hid))
      .filter(Boolean) as Array<{ subtype?: string }>;
    const shieldHeld = heldEquipment.some(e => e?.subtype === '盾牌');
    const wornArmor = char.wornArmorId
      ? (char.equipment ?? []).find(e => (e.childId || e.id) === char.wornArmorId)
      : null;
    // 被动派生快照（对齐 useInitiative PC 入场路径）：抗性/免疫 + 速度加成
    const speedModifier = deriveSpeedModifier(char, { combatShieldHeld: shieldHeld, wearingHeavyArmor: !!wornArmor && (wornArmor.subtype ?? '').includes('重') });
    handleBatchCreateNpc([
      {
        name,
        initiative: Math.floor(Math.random() * 20) + 1,
        ac: char.armorClass,
        maxHp,
        currentHp: maxHp,
        tempHp: 0,
        isPc: !hostile,
        characterId: char.id,
        speed,
        speedModifier,
        damageAffinities: deriveCharacterAffinities(char),
        note: '试验场人偶',
        actions: 1,
        bonusActions: 0,
        heldLeft: hands.heldLeft,
        heldRight: hands.heldRight,
        attacks: PROVING_GROUND_ATTACKS.map(a => ({ ...a })),
      },
    ]);
  };

  const handleBatchCreateNpc = (combatantsData: Omit<Combatant, 'id'>[]) => {
    const newCombatants: Combatant[] = combatantsData.map(data => ({
      ...data,
      id: crypto.randomUUID(),
      actions: typeof data.actions === 'number' && data.actions >= 0 ? data.actions : 1,
    }));
    const updatedCombatants = [...record.combatants, ...newCombatants].sort(
      (a, b) => b.initiative - a.initiative
    );
    const newRounds = newCombatants.reduce((acc, c) => {
      record.rounds.forEach((_, idx) => {
        if (!acc[idx]) acc[idx] = {};
        acc[idx][c.id] = '';
      });
      return acc;
    }, [] as Record<string, string>[]);
    const updatedRounds = record.rounds.map((round, idx) => ({
      ...round,
      ...(newRounds[idx] || {}),
    }));
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ============ 动作机制 ============
  const handleRemoveCombatant = (combatantId: string) => {
    if (!confirm('确定删除该参战者吗？')) return;
    const updatedCombatants = record.combatants.filter(c => c.id !== combatantId);
    const updatedRounds = record.rounds.map(round => {
      const newRound = { ...round };
      delete newRound[combatantId];
      return newRound;
    });
    combatStore.update(record.id, {
      combatants: updatedCombatants,
      rounds: updatedRounds,
      updatedAt: Date.now(),
    });
  };

  // ============ 动作入口统一函数（操作栏面板与沙盘双击面板共用） ============
  const openHelpFor = (c: Combatant) => {
    if (!ensureCanEnter(c)) return;
    setHelpModal({ from: c });
  };

  const openCheckModifierFor = (c: Combatant, featureName: string, activation: Feature['activation'], poolInfo: { poolKey: string | null; available: number | null; max: number | null; cost: number }, capability?: FeatureCapability) => {
    if (!ensureCanEnter(c)) return;
    if (poolInfo.poolKey && poolInfo.available != null && poolInfo.available < poolInfo.cost) {
      alert(`「${featureName}」资源不足（可用 ${poolInfo.available}/${poolInfo.max ?? '?'}）`);
      return;
    }
    setCheckModifierModal({ from: c, featureName, capability, activation, poolKey: poolInfo.poolKey, cost: poolInfo.cost });
  };

  // checkModifier 通道确认：动作与池在确认时扣（取消不损失资源），随后由通道执行器写目标身上的加值标记
  const confirmCheckModifier = (targetId: string) => {
    if (!record || !checkModifierModal) return;
    const { from, featureName, capability, activation, poolKey, cost } = checkModifierModal;
    if (poolKey) {
      const ok = combatStore.consumeFeatureUse(record.id, from.id, poolKey, cost);
      if (!ok) {
        alert(`「${featureName}」资源不足`);
        return;
      }
    }
    if (activation === 'action') consumeCombatantAction(from.id);
    else if (activation === 'bonus') consumeCombatantBonusAction(from.id);
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    const channelResult = executeFeatureChannel(record, from, featureName, currentRound0, { targetId, capability });
    recordOperation(from.id, `发动《${featureName}》${channelResult.note ? `：${channelResult.note}` : ''}`, 'record');
    combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, targetId, text: `《${featureName}》→ ${channelResult.note ?? '发动'}` });
    setCheckModifierModal(null);
  };

  // 荒野变形确认：变身 = 参战者战斗形状按图鉴野兽模板整体替换（原形快照入参战者）；
  // 还原 = 快照回填。动作与池在确认时扣（取消不损失资源）；已变身状态 onConfirm('')
  // 走还原分支（弹窗还原模式无野兽选择）。
  const applyWildShapeConfirm = (beastTemplateId: string) => {
    if (!record || !wildShapeModal) return;
    const { combatantId, current, poolKey, cost, featureName, activation } = wildShapeModal;
    const combatant = record.combatants.find(x => x.id === combatantId);
    if (!combatant) {
      setWildShapeModal(null);
      return;
    }
    if (!current) {
      const beast = npcTemplateStore.getAll().find(t => t.templateId === beastTemplateId);
      if (!beast) {
        alert(`野兽模板「${beastTemplateId}」不存在（图鉴库已变更）`);
        return;
      }
      const updated = applyWildShapeForm(combatant, beast);
      if (poolKey) {
        const ok = combatStore.consumeFeatureUse(record.id, combatantId, poolKey, cost);
        if (!ok) {
          alert(`「${featureName}」资源不足`);
          return;
        }
      }
      if (activation === 'action') consumeCombatantAction(combatantId);
      else if (activation === 'bonus') consumeCombatantBonusAction(combatantId);
      combatStore.update(record.id, {
        combatants: record.combatants.map(x => (x.id === combatantId ? updated : x)),
        updatedAt: Date.now(),
      });
      recordOperation(combatantId, `《${featureName}》：变身为${beast.name}（HP【${beast.maxHp}】AC【${beast.ac}】）`, 'record');
      combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: combatantId, targetId: combatantId, text: `《${featureName}》→ 变身${beast.name}` });
    } else {
      const restoredHp = current.snapshot.currentHp ?? 0;
      // 5e 2014：变回原形同样消耗 1 次荒野变形（使用特性语义）
      if (poolKey) {
        const ok = combatStore.consumeFeatureUse(record.id, combatantId, poolKey, cost);
        if (!ok) {
          alert(`「${featureName}」资源不足，无法解除变形`);
          return;
        }
      }
      const updated = restoreWildShapeForm(combatant);
      if (activation === 'action') consumeCombatantAction(combatantId);
      else if (activation === 'bonus') consumeCombatantBonusAction(combatantId);
      combatStore.update(record.id, {
        combatants: record.combatants.map(x => (x.id === combatantId ? updated : x)),
        updatedAt: Date.now(),
      });
      recordOperation(combatantId, `《${featureName}》：恢复原形${current.beastName ? `（${current.beastName}形态结束，HP 回到【${restoredHp}】）` : ''}`, 'record');
      combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: combatantId, targetId: combatantId, text: `《${featureName}》→ 恢复原形` });
    }
    setWildShapeModal(null);
  };

  // aoe_save 通道确认：动作与池在确认时扣（取消不损失资源），逐目标 HP 经 handleApplyDamage 落地
  const resolveAoeSave = (payload: {
    results: { combatantId: string; name: string; damage: number; damageType: string }[];
    message: string;
  }) => {
    if (!record || !aoeSaveModal) return;
    const { from, featureName, activation, poolKey, cost } = aoeSaveModal;
    if (poolKey) {
      const ok = combatStore.consumeFeatureUse(record.id, from.id, poolKey, cost);
      if (!ok) {
        alert(`「${featureName}」资源不足`);
        return;
      }
    }
    if (activation === 'action') consumeCombatantAction(from.id);
    else if (activation === 'bonus') consumeCombatantBonusAction(from.id);
    for (const r of payload.results) {
      if (r.damage > 0) {
        handleApplyDamage({
          targetId: r.combatantId,
          amount: r.damage,
          sourceId: from.id,
          sourceName: from.name,
          sourceKind: 'effect',
          damageType: r.damageType,
        });
      }
    }
    recordOperation(from.id, payload.message, 'damage');
    combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, text: `《${featureName}》→ ${payload.message}` });
    setAoeSaveModal(null);
  };

  /** 怪物吐息武器：按模板结构化字段合成 aoe_save 能力，复用范围豁免弹窗（动作在确认时扣） */
  const openNpcBreathWeapon = (c: Combatant, index: number) => {
    const b = c.breathWeapon?.[index];
    if (!b || !record) return;
    if (!ensureCanEnter(c)) return;
    const bg = battlegroundStore.get(record.id);
    const placed = (bg?.tokens ?? []).some(t => t.combatantId === c.id);
    if (!placed) {
      alert(`「${b.name}」需要先将该参战者放置在沙盘上（范围以自身为源点）`);
      return;
    }
    const dc = b.dc ?? 10;
    const label = b.ability ?? '敏捷';
    const saveAbility = (Object.entries(ABILITY_LABEL_MAP).find(([, l]) => l === label)?.[0] as AbilityKey | undefined) ?? 'dexterity';
    const capability: FeatureCapability = {
      channel: 'aoe_save',
      aoeSave: {
        damage: { dice: b.damageDice ?? '', damageType: b.damageType ?? '火焰' },
        saveAbility,
        dc: () => dc,
        halfOnSave: b.halfOnSave ?? false,
      },
      hint: `${c.name}的${b.name}：${b.shape ?? ''}${b.recharge ? `（${b.recharge}）` : ''}，DC${dc}${label}豁免${b.halfOnSave ? '，成功减半' : ''}`,
    };
    setAoeSaveModal({
      from: c,
      featureName: `吐息武器（${b.name}）`,
      capability,
      activation: 'action',
      poolKey: null,
      cost: 1,
      descriptionOverride: b.shape ?? '',
    });
  };

  /**
   * 主动技能触发（非激励）：按池驱动扣动作 + 扣池 + 通道路由。
   *  - activation action/bonus → ensureCanAct 校验并消耗对应动作；reaction/free 无动作成本
   *  - 有池 → consumeFeatureUse 写 featureUses 漏斗（结算统一并入）；池不足直接拦截
   *  - 通道路由走 featureCapabilities 注册表；manual 通道弹手动结算提示
   */
  const handleFeatureUse = (c: Combatant, feature: Feature, poolInfo: { poolKey: string | null; available: number | null; max: number | null; cost: number }) => {
    let capability = resolveFeatureCapability(feature.name);
    // 0. 容器预选（引导神力/暗影技艺类）：未预选拦截，已预选按形态能力接管后续通道路由；
    //    动作/池扣按容器特性本身（poolInfo/activation 不变），效果按子形态通道执行
    if (capability.channel === 'container' && capability.container) {
      const formKey = feature.chosenForm;
      if (!formKey) {
        alert(capability.container.unchosenHint ?? `「${feature.name}」未预选形态，请回角色卡特性「…」信息对话框预选后使用`);
        return;
      }
      const form = capability.container.forms.find(f => f.key === formKey);
      if (!form) {
        alert(`「${feature.name}」预选形态「${formKey}」无效，请回角色卡重新预选`);
        return;
      }
      capability = form.capability;
    }
    // 1. 状态校验（动作成本在结算点消费；入口不按主动作/附赠动作经济加锁）
    if (!ensureCanEnter(c)) return;
    // 2. checkModifier 通道：先选受益人，动作与池在弹窗确认时扣（取消不损失资源）
    if (capability.channel === 'checkModifier' && capability.checkModifier) {
      openCheckModifierFor(c, feature.name, feature.activation, poolInfo, capability);
      return;
    }
    // 1.8 wildShape 通道（荒野变形）：弹窗选野兽，确认时执行参战者替换/还原 +
    // 动作与池扣（取消不损失资源）；已变身状态再次点按 = 还原模式
    if (capability.channel === 'wildShape') {
      setWildShapeModal({
        combatantId: c.id,
        current: c.wildShape ?? null,
        poolKey: poolInfo.poolKey,
        cost: poolInfo.cost,
        featureName: feature.name,
        activation: feature.activation,
      });
      return;
    }
    // 2.5 aoe_save 通道（吐息武器）：范围拾取 + 逐目标豁免，动作与池在弹窗确认时扣
    if (capability.channel === 'aoe_save' && capability.aoeSave) {
      const bg = battlegroundStore.get(record.id);
      const placed = (bg?.tokens ?? []).some(t => t.combatantId === c.id);
      if (!placed) {
        alert(`「${feature.name}」需要先将该参战者放置在沙盘上（范围以自身为源点）`);
        return;
      }
      setAoeSaveModal({ from: c, featureName: feature.name, capability, activation: feature.activation, poolKey: poolInfo.poolKey, cost: poolInfo.cost });
      return;
    }
    // 2.6 resource_conv convert 多目标（灵巧动作类）：先选动作项再扣资源（取消不损失，对齐 checkModifier 模式）
    if (capability.channel === 'resource_conv' && capability.resourceConv?.convert && capability.resourceConv.convert.to.length > 1) {
      setConvTargetPick({ from: c, featureName: feature.name, capability, targets: capability.resourceConv.convert.to, activation: feature.activation, poolKey: poolInfo.poolKey, cost: poolInfo.cost });
      return;
    }
    // 2.7 heal 骰值环节（线下骰口径）：spec 带 dice 先填线下骰结果，确认时扣资源（取消不损失）；无 dice 直接执行
    if (capability.channel === 'heal' && capability.heal && capability.heal.dice) {
      setHealRollPick({ from: c, feature, capability, poolKey: poolInfo.poolKey, cost: poolInfo.cost });
      return;
    }
    // 3. 池扣减（无池语义直接跳过，老数据优雅降级）；
    //    attack_rider（命中触发类）为声明入口：资源在命中时刻由伤害结算弹窗扣，此处不扣
    if (poolInfo.poolKey && poolInfo.available != null && capability.channel !== 'attack_rider') {
      const ok = combatStore.consumeFeatureUse(record.id, c.id, poolInfo.poolKey, poolInfo.cost);
      if (!ok) {
        alert(`「${feature.name}」资源不足（可用 ${poolInfo.available}/${poolInfo.max ?? '?'}）`);
        return;
      }
    }
    // 4. 动作消耗落到 combatant（与激励同口径）
    if (feature.activation === 'action') consumeCombatantAction(c.id);
    else if (feature.activation === 'bonus') consumeCombatantBonusAction(c.id);
    // 5. 通道路由：status/advantage 走通道执行器（挂状态/pending 优劣势），reaction 说明自动触发，
    //    manual 提示 DM 手动结算
    recordOperation(c.id, `发动《${feature.name}》`, 'record');
    // heal 通道（P3）：执行器掷定恢复量计划，HP 落库走 handleApplyHealing（hp 型）/ addTempHp（temp 型）
    if (capability.channel === 'heal' && capability.heal) {
      const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
      const r = executeFeatureChannel(record, c, feature.name, currentRound0, { capability });
      if (r.heal) {
        if (r.heal.type === 'temp') {
          const tp = combatStore.addTempHp(record.id, r.heal.targetId, r.heal.amount);
          // 先攻表/事件流只记结果（detail 计算过程走 alert 供 DM 核对）
          const healLine = `《${feature.name}》→ ${c.name} 获得临时生命【${tp ?? r.heal.amount}】`;
          recordOperation(c.id, healLine, 'record');
          combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: c.id, targetId: r.heal.targetId, text: healLine });
          // alert 是 DM 直读 UI，剥离标记符号（detail 与先攻表/事件流共用）
          alert(`「${feature.name}」：${c.name} 获得临时生命 ${tp ?? r.heal.amount}（${r.heal.detail.replace(/[【】]/g, '')}）`);
        } else {
          const hr = handleApplyHealing(r.heal.targetId, r.heal.amount);
          const healLine = `《${feature.name}》→ ${c.name} 恢复【${hr?.healed ?? 0}】点生命`;
          recordOperation(c.id, healLine, 'record');
          combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: c.id, targetId: r.heal.targetId, text: healLine });
          alert(`「${feature.name}」：${c.name} 恢复 ${hr?.healed ?? 0} 点生命（${r.heal.detail.replace(/[【】]/g, '')}${hr != null && hr.healed < r.heal.amount ? '，已达生命上限' : ''}）`);
        }
      } else if (r.note) {
        const noteLine = `《${feature.name}》→ ${r.note}`;
        recordOperation(c.id, noteLine, 'record');
        combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: c.id, text: noteLine });
        alert(`「${feature.name}」：${r.note}`);
      }
      return;
    }
    // resource_conv 通道（P3）：grants 额外动作 / convert 单目标（多目标已走 2.6 弹窗）
    if (capability.channel === 'resource_conv' && capability.resourceConv) {
      const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
      const r = executeFeatureChannel(record, c, feature.name, currentRound0, { convertTarget: capability.resourceConv.convert?.to[0], capability });
      if (r.note) {
        const noteLine = `《${feature.name}》→ ${r.note}`;
        recordOperation(c.id, noteLine, 'record');
        combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: c.id, text: noteLine });
        alert(`「${feature.name}」：${r.note}`);
      }
      return;
    }
    // manual 兜底：未注册，或 spec 数据渠道的引擎尚未实现（engineAvailable=false，P3 已登记 heal/resource_conv 自动切换）
    if (capability.channel === 'manual' || capability.engineAvailable === false) {
      alert(`「${feature.name}」已消耗资源${poolInfo.poolKey ? `（${poolInfo.cost} 点）` : ''}。请按特性描述手动结算：${capability.hint || (feature.description || '').slice(0, 80)}`);
      return;
    }
    if (capability.channel === 'attack_rider') {
      // 渗透劲类延迟引爆：目标身上带本参战者的劲力标记 → 按钮变引爆入口（耗动作结算豁免/伤害）；
      // 无标记 → 命中触发声明入口（池/法术位在命中时刻由伤害结算弹窗扣）
      const embedSpec = capability.attackRider?.embed;
      if (embedSpec) {
        const markedTarget = record.combatants.find(t => {
          if (t.id === c.id) return false;
          return globalStatusManager
            .getActiveStatuses(t.id, 'combat')
            .some(i => i.definitionId === embedSpec.statusId && (i.metadata as Record<string, unknown> | undefined)?.attackerId === c.id);
        });
        if (markedTarget) {
          const detOwner = c.characterId ? characterStore.get(c.characterId) : null;
          const markIds = globalStatusManager
            .getActiveStatuses(markedTarget.id, 'combat')
            .filter(i => i.definitionId === embedSpec.statusId)
            .map(i => i.instanceId);
          setQuiveringPalmModal({
            from: c,
            target: markedTarget,
            markInstanceIds: markIds,
            dc: embedSpec.detonate.dc(detOwner ?? (c as unknown as Character)),
            damageDice: embedSpec.detonate.damageDice,
            damageType: embedSpec.detonate.damageType,
          });
          return;
        }
      }
      alert(`「${feature.name}」为命中触发类特性：近战武器攻击命中后，在伤害结算弹窗的「命中触发」区勾选发动。${capability.attackRider?.hint ?? ''}`);
      return;
    }
    if (capability.channel === 'reaction') {
      alert(`「${feature.name}」为反应类特性：满足触发条件时（被攻击/受伤等）会自动弹出反应提示，无需主动使用`);
      return;
    }
    // status / advantage 通道：与玩家回合包 feature-use op 共用执行器
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    const channelResult = executeFeatureChannel(record, c, feature.name, currentRound0, { capability });
    if (channelResult.note) {
      const noteLine = `《${feature.name}》→ ${channelResult.note}`;
      recordOperation(c.id, noteLine, 'record');
      combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: c.id, text: noteLine });
      alert(`「${feature.name}」：${channelResult.note}`);
    }
  };

  /**
   * resource_conv convert 多目标弹窗确认：此处才扣动作与池（取消不损失资源，对齐 checkModifier 模式），
   * 随后经执行器按所选动作项落地（dash 移动力账务 / disengage+hide 声明）。
   */
  const confirmConvTargetUse = (from: Combatant, featureName: string, target: string, activation: Feature['activation'], poolKey: string | null, cost: number, capability?: FeatureCapability) => {
    setConvTargetPick(null);
    if (!ensureCanEnter(from)) return;
    if (poolKey) {
      const ok = combatStore.consumeFeatureUse(record.id, from.id, poolKey, cost);
      if (!ok) {
        alert(`「${featureName}」资源不足（需要 ${cost} 点）`);
        return;
      }
    }
    if (activation === 'action') consumeCombatantAction(from.id);
    else if (activation === 'bonus') consumeCombatantBonusAction(from.id);
    recordOperation(from.id, `发动《${featureName}》→ ${CONV_TARGET_LABELS[target] ?? target}`, 'record');
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    const r = executeFeatureChannel(record, from, featureName, currentRound0, { convertTarget: target, capability });
    if (r.note) {
      const noteLine = `《${featureName}》→ ${r.note}`;
      recordOperation(from.id, noteLine, 'record');
      combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, text: noteLine });
      alert(`「${featureName}」：${r.note}`);
    }
  };

  /** heal 骰值环节确认（线下骰口径）：此处才扣动作与池（取消不损失，对齐 conv/checkModifier 模式），
   *  随后带填入的骰结果经执行器结算（HP 落账走 handleApplyHealing / addTempHp）。 */
  const confirmHealRoll = (rolledDice: number) => {
    const pick = healRollPick;
    if (!pick) return;
    setHealRollPick(null);
    const { from, feature, capability } = pick;
    const activation = feature.activation;
    if (!ensureCanEnter(from)) return;
    if (pick.poolKey) {
      const ok = combatStore.consumeFeatureUse(record.id, from.id, pick.poolKey, pick.cost);
      if (!ok) {
        alert(`「${feature.name}」资源不足（需要 ${pick.cost} 点）`);
        return;
      }
    }
    if (activation === 'action') consumeCombatantAction(from.id);
    else if (activation === 'bonus') consumeCombatantBonusAction(from.id);
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    const r = executeFeatureChannel(record, from, feature.name, currentRound0, { rolledDice });
    // 结算结果并入先攻表文本（对齐玩家回合包的两行语义：发动行 + 结算明细行）
    recordOperation(from.id, `发动《${feature.name}》`, 'record');
    if (r.heal) {
      if (r.heal.type === 'temp') {
        const tp = combatStore.addTempHp(record.id, r.heal.targetId, r.heal.amount);
        // 先攻表/事件流只记结果（detail 计算过程走 alert 供 DM 核对）
        const healLine = `《${feature.name}》→ ${from.name} 获得临时生命【${tp ?? r.heal.amount}】`;
        recordOperation(from.id, healLine, 'record');
        combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, targetId: r.heal.targetId, text: healLine });
        alert(`「${feature.name}」：${from.name} 获得临时生命 ${tp ?? r.heal.amount}（${r.heal.detail.replace(/[【】]/g, '')}）`);
      } else {
        const hr = handleApplyHealing(r.heal.targetId, r.heal.amount);
        const healLine = `《${feature.name}》→ ${from.name} 恢复【${hr?.healed ?? 0}】点生命`;
        recordOperation(from.id, healLine, 'record');
        combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, targetId: r.heal.targetId, text: healLine });
        alert(`「${feature.name}」：${from.name} 恢复 ${hr?.healed ?? 0} 点生命（${r.heal.detail.replace(/[【】]/g, '')}${hr != null && hr.healed < r.heal.amount ? '，已达生命上限' : ''}）`);
      }
    } else if (r.note) {
      const noteLine = `《${feature.name}》→ ${r.note}`;
      recordOperation(from.id, noteLine, 'record');
      combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, text: noteLine });
      alert(`「${feature.name}」：${r.note}`);
    }
  };

  /** 渗透劲引爆确认：harmless 仅解除标记（零消耗）；fail/success 耗 1 动作 + 伤害落地 + 解除标记。
   *  动作消耗在确认时执行（弹窗取消零损失，对齐 checkModifier 模式）。 */
  const confirmQuiveringPalm = (payload: { saveResult: 'success' | 'fail' | 'harmless'; damage?: number; saveRoll?: number }) => {
    if (!record || !quiveringPalmModal) return;
    const { from, target, markInstanceIds, dc } = quiveringPalmModal;
    setQuiveringPalmModal(null);
    for (const id of markInstanceIds) globalStatusManager.declareEnd(id);
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    if (payload.saveResult === 'harmless') {
      const line = `《渗透劲》→ ${from.name} 无害终止对 ${target.name} 的劲力（标记解除）`;
      recordOperation(from.id, line, 'record');
      combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, targetId: target.id, text: line });
      return;
    }
    consumeCombatantAction(from.id);
    recordOperation(from.id, `发动《渗透劲》`, 'record');
    const amount = payload.saveResult === 'fail' ? Math.max(0, combatStore.get(record.id)?.combatants.find(c => c.id === target.id)?.currentHp ?? 0) : (payload.damage ?? 0);
    const dr = amount > 0
      ? handleApplyDamage({ targetId: target.id, amount, sourceId: from.id, sourceName: from.name, sourceKind: 'effect', damageType: '暗蚀' })
      : null;
    const line = payload.saveResult === 'fail'
      ? `《渗透劲》→ ${target.name} 体质豁免失败（d20=${payload.saveRoll ?? '?'} < DC${dc}），劲力引爆：生命归 0`
      : `《渗透劲》→ ${target.name} 体质豁免成功（d20=${payload.saveRoll ?? '?'} ≥ DC${dc}），劲力引爆：${amount > 0 ? dr ? `-${dr.damage}（${dr.oldHp}→${dr.newHp}）` : `-${amount} 点暗蚀` : '伤害 0（未填）'}`;
    recordOperation(from.id, line, 'damage');
    combatStore.pushCombatEvent(record.id, { kind: 'skill', actorId: from.id, targetId: target.id, text: line });
  };

  // ── 多重攻击序列（方案A：1 个 Attack 动作内按配方出 N 击）──
  // 读 combatStore 最新值而非闭包 record：序列状态在弹窗回调链中高频变更
  const activeMultiattackSeq = (combatantId: string) =>
    (record ? combatStore.get(record.id)?.multiattackProgress?.[combatantId] : null) ?? null;

  const startMultiattackSequence = (c: Combatant) => {
    if (!record) return;
    const recipe = c.multiattack ?? [];
    if (recipe.length === 0) return;
    if (!ensureCanEnter(c)) return;
    const queue = combatStore.expandMultiattackQueue(recipe);
    if (!combatStore.startMultiattack(record.id, c.id, queue)) return;
    // 直接入第一击（openAttackFor 的序列锁定分支接管，目标挑选逻辑复用）
    openAttackFor(c);
  };

  const endMultiattackSequence = (combatantId: string) => {
    if (!record) return;
    combatStore.endMultiattack(record.id, combatantId);
  };

  // 攻击结算时的动作消耗：序列首击扣 1 动作并置位 actionConsumed，后续击共享该动作；非序列按原行为逐击扣
  const consumeAttackActionFor = (attackerId: string) => {
    if (!record) return;
    const latest = combatStore.get(record.id);
    const seq = latest?.multiattackProgress?.[attackerId];
    if (seq) {
      if (seq.actionConsumed) return;
      combatStore.update(record.id, {
        multiattackProgress: {
          ...(latest.multiattackProgress ?? {}),
          [attackerId]: { ...seq, actionConsumed: true },
        },
        updatedAt: Date.now(),
      });
    }
    consumeCombatantAction(attackerId);
  };

  // 当前击结算完毕（伤害落账或未命中确认）→ 推进序列，越过队尾自动清除
  const advanceMultiattackFor = (attackerId: string) => {
    if (!record) return;
    combatStore.advanceMultiattack(record.id, attackerId);
  };

  // 步骤徽标文案：怪物队列存配方名（带攻击名）；PC 额外攻击队列存空哨兵（不锁武器，仅计次）
  const multiattackStepLabelOf = (seq: { queue: string[]; pos: number }) => {
    const name = seq.queue[seq.pos];
    const head = name ? '多重攻击' : '额外攻击';
    return `${head} 第${seq.pos + 1}/${seq.queue.length}击${name ? ` · ${name}` : ''}`;
  };

  // PC 额外攻击：每次攻击动作可攻击 N 次（职业特性推导），进第一击前自动开序列；
  // 队列哨兵为空名 → 弹窗不锁定攻击（5e 允许多次攻击中每击换武器），仅提供计数与动作共享
  const beginPcExtraAttackIfNeeded = (c: Combatant): { queue: string[]; pos: number } | null => {
    if (!record || !c.isPc || !c.characterId) return null;
    const n = derivePcAttacksPerAction(characterStore.get(c.characterId));
    if (n <= 1) return null;
    const queue = Array.from({ length: n }, () => '');
    if (!combatStore.startMultiattack(record.id, c.id, queue)) return null;
    return combatStore.get(record.id)?.multiattackProgress?.[c.id] ?? null;
  };

  const openAttackFor = (c: Combatant) => {
    let seq = activeMultiattackSeq(c.id);
    if (!seq) {
      if (!ensureCanEnter(c)) return;
      // PC 额外攻击（N>1）自动开序列；返回 null 视同单次攻击走原路径
      seq = beginPcExtraAttackIfNeeded(c);
    } else if (!ensureCanEnter(c)) {
      return;
    }
    // 攻击需要目标，若已有上次选中的敌人优先；否则提示等手动选择
    const potentialTarget = record.combatants.find(x => x.id !== c.id && !x.isDead);
    if (potentialTarget) {
      const bg = battlegroundStore.get(record.id);
      const tokens = bg?.tokens ?? [];
      const aPos = tokens.find(t => t.combatantId === c.id);
      const tPos = tokens.find(t => t.combatantId === potentialTarget.id);
      const stepName = seq ? seq.queue[seq.pos] : null;
      const stepAttack = stepName ? combatStore.resolveMultiattackStep(stepName, c.attacks ?? []) : null;
      setAttackModal({
        attacker: c,
        target: potentialTarget,
        attackerPos: aPos ? { col: aPos.col, row: aPos.row } : undefined,
        targetPos: tPos ? { col: tPos.col, row: tPos.row } : undefined,
        ...(seq ? {
          lockedAttackName: stepAttack?.name,
          multiattackStepLabel: multiattackStepLabelOf(seq),
        } : {}),
      });
      setInfoPanelCombatant(null);
    } else {
      alert('当前没有可攻击的目标');
    }
  };

  const openCastFor = (c: Combatant) => {
    if (!ensureCanEnter(c)) return;
    // 通道 2：操作栏施法 = 先在弹窗内选法术，再按法术对象类型选目标
    // （自身类法术在选法术后直接跳过目标确认；单体法术在目标确认步骤
    // 列表选人 + 射程门禁）。入口目标恒为施法者自己（通道 1 拖拽才带目标）
    setSpellModal({ caster: c, target: c });
  };

  const dashFor = (c: Combatant) => {
    if (!ensureCanEnter(c)) return;
    // 疾走：额外获得等于战斗速度的可用移动力（dashExtraMovement += battleSpeed）
    // 注意：疾走不改变 speedModifier，只增加 dashExtraMovement
    const battleSpeed = (c.speed ?? 30) + (c.speedModifier ?? 0);
    const newDashExtra = (c.dashExtraMovement ?? 0) + battleSpeed;
    combatStore.update(record.id, {
      combatants: record.combatants.map(x =>
        x.id === c.id ? { ...x, dashExtraMovement: newDashExtra } : x
      ),
      updatedAt: Date.now(),
    });
    // 消耗 1 个动作
    consumeCombatantAction(c.id);
    // 记录操作（放映写表格 / 模拟写日志）
    recordOperation(c.id, `疾走：+【${battleSpeed}】尺移动`, 'move');
    alert(`专注于疾跑，获得 ${battleSpeed} 尺额外移动力`);
  };

  // 基础动作「回避」：1 动作挂 dodging 状态——至下一回合开始，可见敌人攻击对己劣势（引擎
  // 攻击通配组 incoming）+ 敏捷豁免优势；失能/速度归零由 advantageRules 读取时判定失效。
  // 放映模式用 untilNextTurn 锚定自己下回合开始自动解除；模拟模式永续由 DM 手动解除（与现有
  // durationRounds 状态一致）。
  const dodgeFor = (c: Combatant) => {
    if (!ensureCanEnter(c)) return;
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    globalStatusManager.applyEffect(c.id, 'dodging', 'combat', record.id, {
      durationRounds: 1,
      ...(record.mode === 'playback'
        ? { combatMode: 'playback' as const, startRound: currentRound0, untilNextTurn: true, anchorCombatantId: c.id, turnCount: 1 }
        : { combatMode: 'simulation' as const }),
    });
    combatStore.addTurnTodo(record.id, {
      combatantId: c.id,
      name: '回避增益持续中（下回合开始解除）',
      type: 'condition_check',
      startRound: currentRound0,
      endRound: currentRound0 + 1,
    });
    consumeCombatantAction(c.id);
    recordOperation(c.id, '回避：至下回合开始，攻击对己劣势、敏捷豁免优势', 'record');
    alert(`「${c.name}」专注于回避：至下回合开始，可见敌人的攻击对其劣势，其敏捷豁免有优势`);
  };

  // 基础动作「撤离」：1 动作挂 disengaging 状态——状态存续期间移动不引发借机攻击
  //（抑制点在 reactionRules 借机检测器唯一出口）。生命周期与 dodging 同款：放映模式
  // untilNextTurn 锚定自己下回合开始解除，模拟模式永续由 DM 手动解除。
  const disengageFor = (c: Combatant) => {
    if (!ensureCanEnter(c)) return;
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    globalStatusManager.applyEffect(c.id, 'disengaging', 'combat', record.id, {
      durationRounds: 1,
      ...(record.mode === 'playback'
        ? { combatMode: 'playback' as const, startRound: currentRound0, untilNextTurn: true, anchorCombatantId: c.id, turnCount: 1 }
        : { combatMode: 'simulation' as const }),
    });
    combatStore.addTurnTodo(record.id, {
      combatantId: c.id,
      name: '撤离增益持续中（下回合开始解除）',
      type: 'condition_check',
      startRound: currentRound0,
      endRound: currentRound0 + 1,
    });
    consumeCombatantAction(c.id);
    recordOperation(c.id, '撤离：本回合移动不引发借机攻击', 'record');
    alert(`「${c.name}」采取撤离：本回合移动离开敌人触及范围不会引发借机攻击；下回合开始时解除`);
  };

  // 基础动作「躲藏」：1 动作挂 hidden 状态——未被定位前攻击对己劣势、己方攻击优势；
  // 隐匿检定由玩家线下掷骰、DM 核对观察者被动察觉后录入总值（引擎零暗骰）。
  // hidden 不自动过期：首次攻击结算后揭晓（breakHidden），被发现时 DM 手动解除。
  const hideFor = (c: Combatant, stealthTotal: number) => {
    if (!ensureCanEnter(c)) return;
    const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
    const observers = collectHideObservers(record.combatants, c.id);
    const contest = contestHide(stealthTotal, observers);
    const unseenSet = new Set(contest.unseenBy);
    const dcList = observers
      .map(o => `${o.name} 被动察觉 ${o.pp}${unseenSet.has(o.id) ? '（未察觉）' : '（看破）'}`)
      .join('、');
    globalStatusManager.applyEffect(c.id, 'hidden', 'combat', record.id, {
      ...(record.mode === 'playback'
        ? { combatMode: 'playback' as const, startRound: currentRound0 }
        : { combatMode: 'simulation' as const }),
      metadata: { stealthTotal, stealthSource: 'roll' as const, unseenBy: contest.unseenBy },
    });
    combatStore.addTurnTodo(record.id, {
      combatantId: c.id,
      name: '躲藏中（首次攻击或被发现后解除）',
      type: 'condition_check',
      startRound: currentRound0,
      endRound: currentRound0 + 1,
    });
    consumeCombatantAction(c.id);
    // 双通道：玩家行只写「躲藏」（隐匿总值与观察者清单属 DM 明细）
    recordOperation(c.id, '躲藏', 'record', `躲藏：隐匿总值 ${stealthTotal}（观察者：${dcList || '无'}）`);
    const verdict = unseenSet.size === 0
      ? '警告：隐匿总值未超过任何观察者被动察觉，位置已被全部看破（无机械收益）'
      : contest.seenBy.length === 0
        ? '全部观察者未察觉位置（对攻击/被攻击的优劣势生效）'
        : `${unseenSet.size} 名观察者未察觉，${contest.seenBy.length} 名已看破位置`;
    alert(`「${c.name}」进入躲藏（隐匿总值 ${stealthTotal}）。\n\n${verdict}\n\n观察者被动察觉：\n${dcList || '（无观察者）'}`);
  };

  // 基础动作「搜索」：察觉检定对抗全图活跃 hidden 实例的隐匿总值；成功解除该实例。
  // 规则无射程限制（全图），失败照扣 1 动作；结果只回发现/未发现，不写目标身份。
  const searchFor = (c: Combatant, d20: number) => {
    if (!ensureCanEnter(c)) return;
    if (!canUseAction(c.id)) {
      alert(`「${c.name}」本回合动作已用完，无法搜索`);
      return;
    }
    const character = c.characterId ? characterStore.get(c.characterId) : null;
    const bonus = deriveSkillCheckBonus(character, 'perception');
    const total = d20 + bonus;
    const resolution = resolveSearch({ searcherId: c.id, total, combatants: record.combatants });
    consumeCombatantAction(c.id);
    const found = resolution.revealed.length;
    // 双通道：玩家行只回数量（不写拆解与目标身份）；DM 明细含掷骰拆解 + 目标名/隐匿值
    const playerLine = found > 0 ? `搜索：发现 ${found} 名潜伏者` : '搜索：未发现目标';
    const hitParts = resolution.revealed.map(r => `《${r.name}》隐匿 ${r.stealthTotal}${r.estimated ? '（被动代填）' : ''}`);
    const skippedParts = resolution.skipped.map(s => `《${s.name}》未录入隐匿值`);
    const detailParts = [`察觉 ${d20}+${bonus}=${total}`, ...(hitParts.length ? [`发现：${hitParts.join('、')}`] : []), ...(skippedParts.length ? [`跳过：${skippedParts.join('、')}`] : [])];
    recordOperation(c.id, playerLine, 'record', `搜索：${detailParts.join('；')}`);
    alert(`「${c.name}」搜索：${detailParts.join('；')}${skippedParts.length ? '（跳过者需补录隐匿值）' : ''}`);
  };

  // 一攻揭晓：躲藏者发起攻击（命中/未命中均算）结算后移除 hidden
  const breakHidden = (combatantId: string) => {
    const inst = globalStatusManager.getActiveStatuses(combatantId, 'combat').find(i => i.definitionId === 'hidden');
    if (inst) globalStatusManager.declareEnd(inst.instanceId);
  };

  // 原内容：完全保留，一个字都没改（页面结构主体不变）
  return (
    <div className="max-w-full mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/combat')} className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-xl font-bold dark:text-text-dark light:text-text-light truncate">
            {record.title}
          </h1>
          {/* 实时观战广播状态：绿点=已连上实时房间；点击把本场战斗抛送到玩家圆桌 */}
          {combatBroadcast.connected && (
            <button
              type="button"
              onClick={handleSendSpectateInvite}
              disabled={inviteSending}
              title={`实时同步已连接：${combatBroadcast.roomId}（点击抛送观战邀请到玩家圆桌）`}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 text-xs hover:bg-emerald-600/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Send className="w-3 h-3" />
              <span className="hidden md:inline">{inviteSending ? '抛送中…' : '抛送观战'}</span>
            </button>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {/* 已封存：只读横幅内的结算标识；入口隐藏 */}
          {record.settledAt ? (
            <span className="px-2 sm:px-3 py-2 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span className="hidden sm:inline">已结算 · 只读</span>
              <span className="sm:hidden">已结算</span>
            </span>
          ) : (
            <>
              {/* 放映模式不提供批量删除，强制隐藏 batchMode UI（如果切换时还在批量模式则关掉） */}
              {(batchMode && record.mode !== 'playback') ? (
            <>
              <button
                type="button"
                onClick={handleBatchDelete}
                disabled={selectedIds.size === 0}
                className="px-2 sm:px-3 py-2 rounded-lg bg-danger text-white text-sm flex items-center gap-1 hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">删除选中({selectedIds.size})</span>
                <span className="sm:hidden">{selectedIds.size}</span>
              </button>
              <button
                onClick={() => {
                  setBatchMode(false);
                  setSelectedIds(new Set());
                }}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">取消</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowCharSelect(true)}
                disabled={!!record.settledAt}
                className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">添加参战者</span>
              </button>
              {/* 试验场：一键生成默认数值人偶（沙包），影子角色卡承载完整 PC 派生链路 */}
              {record.isProvingGround && (
                <>
                  <button
                    type="button"
                    onClick={() => spawnDummy(true)}
                    className="px-2 sm:px-3 py-2 rounded-lg border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 text-sm flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">敌对人偶</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDummyDialogOpen(true)}
                    className="px-2 sm:px-3 py-2 rounded-lg border border-green-300 dark:border-green-900 text-green-600 dark:text-green-400 text-sm flex items-center gap-1 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">己方人偶</span>
                  </button>
                  {/* 资源消耗开关：开启后动作/移动/弹药/重装填/法术位按正式战斗规则消耗 */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!record) return;
                      combatStore.update(record.id, {
                        resourceConsumption: !record.resourceConsumption,
                        updatedAt: Date.now(),
                      });
                    }}
                    title="资源消耗模式：开启后动作、移动、弹药、重装填、法术位按正式战斗规则消耗；关闭=动作类资源无限（特性资源池始终记账，如卓越骰/气/回气次数）"
                    className={`px-2 sm:px-3 py-2 rounded-lg border text-sm flex items-center gap-1 transition-colors ${
                      record.resourceConsumption
                        ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-400'
                        : 'border-amber-300 dark:border-amber-900 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                    }`}
                  >
                    <Coins className="w-4 h-4" />
                    <span className="hidden sm:inline">资源消耗{record.resourceConsumption ? '：开' : '：关'}</span>
                  </button>
                </>
              )}
              {/* 批量删除：放映模式下不提供（放映模式用回溯代替）；封存后禁用 */}
              {record.mode !== 'playback' && (
                <button
                  type="button"
                  onClick={() => setBatchMode(true)}
                  disabled={!!record.settledAt}
                  className="px-2 sm:px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">批量删除</span>
                </button>
              )}
              {/* 新增轮次：仅放映模式（模拟模式无回合概念）；封存后禁用 */}
              {record.mode === 'playback' && (
                <button
                  type="button"
                  onClick={handleAddRound}
                  disabled={!!record.settledAt}
                  className="px-2 sm:px-3 py-2 rounded-lg bg-primary text-white text-sm flex items-center gap-1 hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">新增轮次</span>
                </button>
              )}
              {/* 战斗结算：试验场不提供（沙盘数据不并入角色卡） */}
              {!record.isProvingGround && (
                <button
                  type="button"
                  onClick={() => setSettlementOpen(true)}
                  className="px-2 sm:px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm flex items-center gap-1 hover:bg-emerald-500 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="hidden sm:inline">结束并结算</span>
                </button>
              )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 回合收件箱（测试工具，默认折叠）：待审核数 + 连接状态 + 房间诊断 */}
      <details className="text-xs px-1 -mt-1 dark:text-text-dark-muted light:text-text-light-muted">
        <summary className="cursor-pointer select-none hover:opacity-80 w-fit">
          回合收件箱{pendingPlayerActions.length > 0 ? ` · ${pendingPlayerActions.length} 个待审核` : ''}
        </summary>
        <div className="pt-1 space-y-0.5 break-all">
          <p>
            连接：{combatBroadcast.connected ? '已连接' : '未连接'} · 待审核 {pendingPlayerActions.length} 个
            （审核卡在页面右下角）
          </p>
          <p>
            房间 {(combatBroadcast.roomId ?? '').replace('combat-', '')} @ {location.host}
            · 手机玩家观战页顶栏的房间号须与此一致
          </p>
        </div>
      </details>

      {/* ✅ 新增：角色选择弹窗（仅点击按钮时显示，完全不影响加载逻辑） */}
      {showCharSelect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">选择PC参战</h3>
              <button onClick={() => setShowCharSelect(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            {availableChars.length === 0 ? (
              <div className="text-center py-8 text-sm opacity-50">无可用PC，请先在角色库添加</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableChars.map(char => (
                  <div
                    key={char.id}
                    onClick={() => handleAddCombatant(char)}
                    className="p-3 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/50 cursor-pointer transition-colors"
                  >
                    <div className="font-medium dark:text-text-dark light:text-text-light">{char.name}</div>
                    {/* 展示角色库的AC和HP，完全对齐设计文档字段 */}
                    <div className="text-xs opacity-60">AC {char.armorClass} | HP {char.currentHp}/{char.maxHp}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                setShowCharSelect(false);
                setNpcCreatorOpen(true);
              }}
              className="w-full mt-4 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm flex items-center gap-1 justify-center hover:bg-white/5 transition-colors"
            >
              创建NPC
            </button>
          </div>
        </div>
      )}

      {/* ✅ 单条记录撤销：仅回退上一条手动记录文本/日志，不回退 HP */}
      {canUndoLastRecord && (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            type="button"
            onClick={undoLastRecord}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm shadow-lg hover:bg-amber-700 transition-colors"
            title="撤销上一条记录（仅回退记录文本，不回退生命值）"
          >
            <Undo2 className="w-4 h-4" />
            撤销上一条
          </button>
        </div>
      )}

      {/* ✅ 模拟模式手动记录：先选操作主体（放映模式的主体来自表格格子，模拟模式无格子可点） */}
      {manualPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">选择操作主体</h3>
              <button onClick={() => setManualPickerOpen(false)} className="p-1 rounded hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {record.combatants.filter(c => !c.isDead).map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCell({ round: -1, combatantId: c.id });
                    setManualPickerOpen(false);
                    openManualRecord();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/60 hover:bg-primary/5 transition-colors"
                >
                  <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{c.name}</div>
                  <div className="text-xs opacity-60">
                    {c.isPc ? '玩家角色' : 'NPC'}
                    {c.maxHp != null && c.maxHp > 0 ? ` · HP ${c.currentHp}/${c.maxHp}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ✅ 新增：PC 先攻投掷弹窗 —— d20 输入 + 敏捷加值 + 自动计算先攻总值 */}
      <InitiativeRollDialog
        open={initiativeRollOpen}
        selectedPc={selectedPc}
        d20Input={d20Input}
        onD20Change={setD20Input}
        onConfirm={handleConfirmInitiative}
        onClose={() => {
          setInitiativeRollOpen(false);
          setSelectedPc(null);
          setD20Input('');
        }}
      />

      {/* 战斗结算弹窗：并入角色卡 + 封存记录；成功后回列表 */}
      {settlementOpen && (
        <SettlementDialog
          record={record}
          onClose={() => setSettlementOpen(false)}
          onSettled={() => navigate('/combat')}
        />
      )}

      {/* ✅ 新增：先攻平局排序弹窗 —— 触屏拖拽重排平局参战者 */}
      <InitiativeTiebreakerDialog
        open={tiebreakerOpen}
        tiedOrder={tiedOrder}
        cardRefs={cardRefs}
        draggingIndex={draggingIndex}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onConfirm={handleConfirmTiebreaker}
        onClose={() => {
          setTiebreakerOpen(false);
          setTiedOrder([]);
        }}
      />

      <PlaybackToolbar
        mode={record.mode ?? 'simulation'}
        playbackStarted={playbackStarted}
        onModeChange={(mode) => {
          // 封存后只读：拦截放映模式切换（写操作通道）
          if (record.settledAt) return;
          handleModeChange(mode);
        }}
        onRestartPlayback={handleRestartPlayback}
      />

      {/* ✅ 放映状态卡片（放映模式时显示）：状态行 + 暂停/恢复。
          退出放映由模式切换的「模拟模式」按钮承担（弹保存/丢弃确认）。 */}
      {record.mode === 'playback' && (() => {
        let label = '';
        let tone: 'muted' | 'info' | 'warn' | 'danger' = 'muted';
        if (!playbackStarted) {
          label = '点击先攻表格的 ▶ 开始放映';
          tone = 'muted';
        } else if (playbackPaused) {
          label = '放映已暂停（脱离回合格）';
          tone = 'warn';
        } else if (currentTurn) {
          const name = record.combatants.find(c => c.id === currentTurn.combatantId)?.name ?? '?';
          label = `当前回合：${name}（第 ${currentTurn.round + 1} 轮）`;
          tone = 'info';
        } else {
          label = '放映已结束';
          tone = 'muted';
        }
        const toneCls =
          tone === 'warn'
            ? 'text-amber-500'
            : tone === 'info'
              ? 'text-primary'
              : 'dark:text-text-dark-muted light:text-text-light-muted';
        return (
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light dark:bg-card-dark light:bg-card-light w-fit flex-wrap">
            <span className={`text-sm font-medium whitespace-nowrap ${toneCls}`}>{label}</span>
            {playbackStarted && (
              playbackPaused ? (
                <button
                  onClick={resumePlayback}
                  className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/50 text-green-500 hover:bg-green-500/20 transition-colors text-xs flex items-center gap-1"
                  title="恢复放映，回到暂停前的回合"
                  type="button"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  恢复放映
                </button>
              ) : (
                <button
                  onClick={pausePlayback}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/50 text-amber-500 hover:bg-amber-500/20 transition-colors text-xs flex items-center gap-1"
                  title="暂停放映，临时脱离回合进行全局编辑"
                  type="button"
                >
                  <Pause className="w-3.5 h-3.5" />
                  暂停放映
                </button>
              )
            )}
            {/* 直接放行（M3）开关已挪至沙盘下方「玩家操作审阅」窗口 */}
          </div>
        );
      })()}

      {/* ✅ 左下角仿显示屏状态栏：可用动作 + 移动力 + 完成回合按钮（深蓝偏紫底 + 白字等宽字体） */}
      {(() => {
        const playbackMode = record.mode === 'playback';
        let hudId: string | null = null;
        if (isPlaybackActive() && currentTurn) {
          hudId = currentTurn.combatantId;
        } else if (sandboxSelectedId) {
          hudId = sandboxSelectedId;
        }
        if (!hudId) return null;
        const c = record.combatants.find(x => x.id === hudId) ?? null;
        if (!c) return null;
        const actions = typeof c.actions === 'number' && c.actions >= 0 ? c.actions : 1;
        const bonusActions = typeof c.bonusActions === 'number' && c.bonusActions >= 0 ? c.bonusActions : 0;
        // 总移动力含速度修正与疾走加成（与 getRemainingMovement 的 availableMovement 同源）
        const totalSpeed = (c.speed ?? 0) + (c.speedModifier ?? 0) + (c.dashExtraMovement ?? 0);
        const resourceMode = !!record.resourceConsumption;
        const remaining = combatStore.getRemainingMovement(c, playbackMode ? 'playback' : 'simulation', isPlaybackActive(), resourceMode);
        const active = (playbackMode && playbackStarted && !playbackPaused) || resourceMode;
        return (
          <CombatResourceHud
            actions={actions}
            bonusActions={bonusActions}
            remainingMovement={totalSpeed > 0 ? remaining : null}
            totalSpeed={totalSpeed}
            active={active}
            showEndTurn={playbackMode && active && !!currentTurn}
            onEndTurn={() => setConfirmEndTurnOpen(true)}
            showRestore={resourceMode && !playbackMode}
            onRestore={() => {
              const latest = combatStore.get(record.id);
              const target = latest?.combatants.find(x => x.id === c.id);
              if (!latest || !target) return;
              combatStore.update(record.id, {
                combatants: latest.combatants.map(x => (
                  x.id === c.id ? { ...x, actions: 1, bonusActions: 1, movementUsed: 0 } : x
                )),
                updatedAt: Date.now(),
              });
            }}
          />
        );
    })()}

      {/* ✅ 回合待办展示板 —— 放映模式 + 已开始 + 当前回合存在时显示（暂停状态也显示） */}
      {record.mode === 'playback' && playbackStarted && currentTurn && (
        <TurnTodoBoard
          record={record}
          currentTurn={currentTurn}
          combatants={record.combatants}
        />
      )}

      {/* 放映模式：先攻表格（轮次×参战者行动矩阵）。
          模拟模式：无回合概念，表格退化为单格堆叠，改为操作日志面板；
          批量编辑（batchMode）依赖表格复选框，批量进行中仍显示表格。 */}
      {record.mode !== 'playback' && !batchMode ? (
        <OperationLogPanel
          record={record}
          combatants={record.combatants}
          onOpenManualRecord={() => setManualPickerOpen(true)}
          onOpenInfoPanel={setInfoPanelCombatant}
        />
      ) : (
        <InitiativeTable
          combatants={record.combatants}
          rounds={dmMergedRounds}
          batchMode={batchMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpenInfoPanel={setInfoPanelCombatant}
          onRemoveCombatant={handleRemoveCombatant}
          onOpenSurpriseAttack={openSurpriseAttackModal}
          onOpenReactions={(c) => {
            // ⚡ 徽标重开：取该参战者全部未决机会重新入队（含跨触发累积的）
            if (!record.id) return;
            const open = (c.pendingReactions || []).filter(o => !o.consumed);
            if (open.length === 0) return;
            setReactionQueue(open);
            setReactionIdx(0);
          }}
          selectedCell={selectedCell}
          onSelectCell={setSelectedCell}
          editingCell={editingCell}
          onSetEditingCell={setEditingCell}
          onCellChange={handleCellChange}
          isPlayback={record.mode === 'playback'}
          playbackStarted={playbackStarted}
          playbackPaused={playbackPaused}
          currentTurn={currentTurn}
          onStartPlayback={startPlayback}
          onOpenManualRecord={openManualRecord}
          onOpenRewind={(round: number, combatantId: string, combatantIdx: number) =>
            setRewindModal({ round, combatantId, combatantIdx, firstClickDone: false })
          }
        />
      )}

      {/* ✅ 新增：网格沙盘 —— 展示参战者位置与移动 */}
      <Battleground
        sessionId={record.id}
        combatants={record.combatants}
        readOnly={!!record.settledAt}
        onPanelHelpClick={openHelpFor}
        onPanelAttackClick={openAttackFor}
        onPanelCastClick={openCastFor}
        onPanelDashClick={dashFor}
        onPanelDodgeClick={dodgeFor}
        onPanelDisengageClick={disengageFor}
        onPanelHideClick={(c) => setHideRollTarget(c)}
        onPanelSearchClick={(c) => setSearchRollTarget(c)}
        onPanelForcedMoveClick={(c) => setForcedMoveTarget(c)}
        onPanelFeatureClick={handleFeatureUse}
        multiattackProgress={record.multiattackProgress}
        onPanelMultiattackStart={startMultiattackSequence}
        onPanelMultiattackEnd={endMultiattackSequence}
        isProvingGround={record.isProvingGround ?? false}
        provingRecord={record.isProvingGround ? record : null}
        combatInventories={combatInventories}
        equipmentChangesMap={record.equipmentChanges}
        onUpdateChanges={(combatantId, changes) => {
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record.equipmentChanges || {}),
              [combatantId]: changes,
            },
          });
        }}
        playbackOnlyMovableId={
          isPlaybackActive()
            ? currentTurn!.combatantId
            : null
        }
        activeTurnCombatantId={
          isPlaybackActive()
            ? currentTurn!.combatantId
            : null
        }
        mode={record.mode}
        playbackActive={isPlaybackActive()}
        remainingMovementMap={(() => {
          const m: Record<string, number> = {};
          const active = isPlaybackActive();
          const resourceMode = !!record.resourceConsumption;
          for (const c of record.combatants) {
            m[c.id] = combatStore.getRemainingMovement(c, record.mode, active, resourceMode);
          }
          return m;
        })()}
        onConsumeMovement={(combatantId, feet) => {
          if (!record.id) return false;
          const got = combatStore.consumeMovement(record.id, combatantId, feet, record.mode, isPlaybackActive());
          return got >= feet;
        }}
        onRefundMovement={(combatantId, feet) => {
          if (!record.id) return;
          combatStore.refundMovement(record.id, combatantId, feet, record.mode, isPlaybackActive());
        }}
        onSelectionChange={(id) => {
          setSandboxSelectedId(id);
        }}
        onTokenMoved={(combatantId, pos, from) => {
          // 进入地形区域（着火等）→ 立即结算：油瓶规则「进入区域即受伤」
          const round = record.mode === 'playback'
            ? (isPlaybackActive() ? (currentTurn?.round ?? 0) : Math.max(0, record.rounds.length - 1))
            : 0;
          handleTokenMoved(combatantId, pos, round);
          // 借机攻击（DM 直操移动）：离开触及范围的瞬时窗口，机会挂在持有者身上
          if (from && record.id) {
            const matches = detectReactions(record, { kind: 'move', moverId: combatantId, from, to: pos, source: 'dm_drag' });
            if (matches.length > 0) {
              const fulls = matches.flatMap(m => combatStore.addReactionPrompts(record.id, m.ownerId, [m], round));
              setReactionQueue(prev => [...(prev || []), ...fulls]);
            }
          }
        }}
        onRequestAttack={(attacker, target) => {
          let seq = activeMultiattackSeq(attacker.id);
          if (!seq) {
            // 入口只拦死亡/昏迷/失能；动作经济在结算点消费
            if (!ensureCanEnter(attacker)) return;
            // PC 额外攻击（N>1）自动开序列；返回 null 视同单次攻击走原路径
            seq = beginPcExtraAttackIfNeeded(attacker);
          } else if (!ensureCanEnter(attacker)) {
            return;
          }
          // 从最新 record 重取对象（pendingAdvantageSources 必须是协助后最新状态，不能用闭包 capture 的旧 snapshot）
          const latestAttacker = record.combatants.find(c => c.id === attacker.id) ?? attacker;
          const latestTarget = record.combatants.find(c => c.id === target.id) ?? target;
          const bg = record.id ? battlegroundStore.get(record.id) : null;
          const tokens = bg?.tokens ?? [];
          const attackerPos = tokens.find(t => t.combatantId === attacker.id);
          const targetPos = tokens.find(t => t.combatantId === target.id);
          const stepName = seq ? seq.queue[seq.pos] : null;
          const stepAttack = stepName ? combatStore.resolveMultiattackStep(stepName, latestAttacker.attacks ?? []) : null;
          setAttackModal({
            attacker: latestAttacker,
            target: latestTarget,
            attackerPos: attackerPos ? { col: attackerPos.col, row: attackerPos.row } : undefined,
            targetPos: targetPos ? { col: targetPos.col, row: targetPos.row } : undefined,
            ...(seq ? {
              lockedAttackName: stepAttack?.name,
              multiattackStepLabel: multiattackStepLabelOf(seq),
            } : {}),
          });
        }}
        onRequestSpell={(caster, target) => {
          // 入口只拦死亡/昏迷/失能；施法时间对应的动作经济在弹窗内按法术裁定
          if (!ensureCanEnter(caster)) return;
          const latestCaster = record.combatants.find(c => c.id === caster.id) ?? caster;
          const latestTarget = record.combatants.find(c => c.id === target.id) ?? target;
          // 法术按钮：打开独立法术施放弹窗
          setSpellModal({ caster: latestCaster, target: latestTarget });
        }}
        onPickupItem={(itemToken, picker) => {
          // 拾起掉落物品：体型小型及以上 + 智力4以上 + 5尺内（1格）
          if (!record) return;
          const bg = battlegroundStore.get(record.id);
          if (!bg) return;
          const pickerToken = bg.tokens.find(t => t.combatantId === picker.id);
          if (!pickerToken) {
            alert('拾取者不在沙盘上');
            return;
          }
          // 距离检查：5尺内（切比雪夫距离 ≤ 1格）
          const dist = Math.max(
            Math.abs(pickerToken.col - itemToken.col),
            Math.abs(pickerToken.row - itemToken.row),
          );
          if (dist > 1) {
            alert(`距离过远（${dist * 5}尺），需在5尺（1格）内才能拾起`);
            return;
          }
          // 体型检查：小型及以上
          let size = '中型';
          let intelligence = 10;
          if (picker.characterId) {
            const char = characterStore.get(picker.characterId);
            if (char) {
              size = char.size || '中型';
              intelligence = char.abilities?.intelligence?.score || 10;
            }
          } else if (picker.templateId) {
            const template = npcTemplateStore.getAll().find(t => t.templateId === picker.templateId);
            if (template) {
              intelligence = template.intelligence || 10;
            }
          }
          const validSizes = ['微型', '小型', '中型', '大型', '巨型', '超巨型'];
          if (!validSizes.includes(size)) size = '中型';
          const sizeIdx = validSizes.indexOf(size);
          if (sizeIdx < 1) { // 小型 = index 1
            alert(`${picker.name} 体型为${size}，需小型及以上才能拾起`);
            return;
          }
          // 智力检查：4以上
          if (intelligence < 4) {
            alert(`${picker.name} 智力为${intelligence}，需4以上才能拾起`);
            return;
          }
          
          // 拾取物品：优先复用源 childId（"丢出去的匕首捡回来还是同一把"），
          // 避免生成新 childId 导致同名武器被识别为不同实体（武器定制化越强，数据丢失越严重）；
          // 仅 NPC 掉落物（无源 childId）才生成新的临时 childId。
          const sourceChildId = (itemToken.equipmentData?.childId as string | undefined)
            || (itemToken.equipmentData?.id as string | undefined);
          const fallbackChildId = `combat-${picker.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          const childIdToUse = sourceChildId || fallbackChildId;

          // 判断拾取者是否为该 childId 的源拥有者：
          //   是 → 拾取 = 撤销当初的"丢失"操作（removedChildIds 或 quantityDeltas），
          //        否则 added 会被 removedChildIds 强制置 0，导致"捡不回来"
          //   否 → 当作新增物品写入 added
          const pickerChar = picker.characterId ? characterStore.get(picker.characterId) : null;
          const pickerSrcList = (pickerChar?.equipment as any[] | undefined) || [];
          const isInPickerSrc = sourceChildId
            ? pickerSrcList.some(e => (e.childId || e.id) === sourceChildId)
            : false;

          const equipSnapshot: Record<string, unknown> = {
            ...(itemToken.equipmentData || {}),
            name: (itemToken.equipmentData?.name as string) || itemToken.name || '未命名物品',
            category: (itemToken.equipmentData?.category as string) || '杂项',
            quantity: 1,
            childId: childIdToUse,
          };
          const currentChanges = record?.equipmentChanges?.[picker.id];
          const newChanges = applyEquipmentChange(currentChanges, (ch) => {
            if (isInPickerSrc && ch.removedChildIds.includes(childIdToUse)) {
              // 当初源数量=1，整件被 removed → 撤销 removed，combatQty 自然回到 srcQty
              ch.removedChildIds = ch.removedChildIds.filter(c => c !== childIdToUse);
            } else if (isInPickerSrc && (ch.quantityDeltas[childIdToUse] || 0) < 0) {
              // 当初源数量>1，quantityDeltas -1 → +1 抵消
              const next = (ch.quantityDeltas[childIdToUse] || 0) + 1;
              if (next === 0) delete ch.quantityDeltas[childIdToUse];
              else ch.quantityDeltas[childIdToUse] = next;
            } else {
              // 非源拥有者，或源拥有者从未丢失此物（捡到同名同 childId 的他人掉落物）：当作新增
              ch.added.push({
                childId: childIdToUse,
                equipment: equipSnapshot,
              });
            }
          });
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record?.equipmentChanges || {}),
              [picker.id]: newChanges,
            },
          });

          // 从网格移除物品 token
          battlegroundStore.removeItemToken(record.id, itemToken.id);
          // 记录操作（放映写表格 / 模拟写日志）
          recordOperation(picker.id, `拾起《${itemToken.name}》`, 'loot');
        }}
        onRemoveItem={(combatantId, item) => {
          // 从战斗背包删除物品：通过变更信息漏斗
          if (!record) return;
          const slotId = item.childId || item.id;
          if (!slotId) return;
          const currentChanges = record.equipmentChanges?.[combatantId];
          const newChanges = applyEquipmentChange(currentChanges, (ch) => {
            // 判断该 childId 是源装备还是战斗中新增的
            const isInAdded = ch.added.some(a => a.childId === slotId);
            if (isInAdded) {
              // 战斗中新增的：直接从 added 移除
              ch.added = ch.added.filter(a => a.childId !== slotId);
            } else {
              // 源装备：加入 removedChildIds
              if (!ch.removedChildIds.includes(slotId)) {
                ch.removedChildIds.push(slotId);
              }
            }
          });
          combatStore.update(record.id, {
            equipmentChanges: {
              ...(record.equipmentChanges || {}),
              [combatantId]: newChanges,
            },
          });
        }}
      />

      {/* ✅ 放映中 NPC 回合：展示该参战者来源图鉴条目的「其他信息 > 特性」版块（沙盘下方、玩家操作审阅上方） */}
      {activeTurnNpcTemplate && <CombatantTraitPanel template={activeTurnNpcTemplate} />}

      {/* ✅ 玩家操作审阅窗口：沙盘下方常驻区块（待审提交 diff + 通过/拒绝 + 直接放行开关） */}
      <PlayerActionReviewPanel
        pending={pendingPlayerActions}
        combatants={record.combatants}
        boundByUser={boundByUser}
        currentRound={(currentTurn?.round ?? -1) + 1}
        autoAccept={autoAcceptTurns}
        onToggleAutoAccept={toggleAutoAcceptTurns}
        onApply={(request, ops) => {
          const outcome = applyPlayerCommit({ ...request, action: { ops } });
          resolvePlayerAction(request.requestId, outcome.ok, outcome.reason);
        }}
        onReject={(requestId, reason) => resolvePlayerAction(requestId, false, reason)}
      />

      {/* ✅ 新增：NPC 创建器 */}
      {npcCreatorOpen && (
        <NpcCreator
          onClose={() => setNpcCreatorOpen(false)}
          onCreate={handleCreateNpc}
          onBatchCreate={handleBatchCreateNpc}
        />
      )}

      {/* 荒野变形弹窗（德鲁伊）：图鉴野兽选择变身 / 已变身状态还原 */}
      {wildShapeModal && record && (
        <WildShapeModal
          current={wildShapeModal.current}
          targetName={record.combatants.find(c => c.id === wildShapeModal.combatantId)?.name ?? '参战者'}
          onConfirm={applyWildShapeConfirm}
          onClose={() => setWildShapeModal(null)}
        />
      )}

      {/* 试验场：己方人偶设置弹窗（职业/子职业/等级/属性/法术位 → 影子卡） */}
      <SandboxDummyDialog
        open={dummyDialogOpen}
        defaultName={`试验体·友${record.combatants.filter(c => c.name.includes('试验体·')).length + 1}`}
        onConfirm={(config) => {
          setDummyDialogOpen(false);
          spawnConfiguredDummy(false, config);
        }}
        onClose={() => setDummyDialogOpen(false)}
      />

      {/* ✅ 新增：战斗攻击检定弹窗 —— 在 main 上处理 */}
      {attackModal && (
        <CombatAttackModal
          attacker={liveAttackModalAttacker ?? attackModal.attacker}
          target={liveAttackModalTarget ?? attackModal.target}
          recordId={record?.id}
          currentRound={currentTurn?.round}
          attackerPos={attackModal.attackerPos}
          targetPos={attackModal.targetPos}
          combatantPositions={combatantPositions}
          paintedCells={record ? battlegroundStore.get(record.id)?.paintedCells : undefined}
          ambientLight={record ? battlegroundStore.get(record.id)?.ambientLight : undefined}
          lightCells={record ? battlegroundStore.get(record.id)?.lightCells : undefined}
          combatInventory={getCombatInventory(record, liveAttackModalAttacker ?? attackModal.attacker)}
          targetCharacter={liveAttackModalTarget?.characterId ? characterStore.get(liveAttackModalTarget.characterId) : null}
          targetCombatInventory={getCombatInventory(record, liveAttackModalTarget ?? attackModal.target)}
          loadedWeapons={record?.loadedWeapons}
          loadingAttackedThisRound={record?.loadingAttackedThisRound}
          combatMode={currentMode()}
          playbackTurnActive={isPlaybackActive()}
          onLoadedChange={(key, loaded) => {
            if (!record) return;
            // 试验场免重装填：装填武器射击后保持已装填状态（拒绝置 false）；资源消耗模式除外
            if (record.isProvingGround && !record.resourceConsumption && !loaded) return;
            combatStore.update(record.id, {
              loadedWeapons: {
                ...(record.loadedWeapons || {}),
                [key]: loaded,
              },
              updatedAt: Date.now(),
            });
          }}
          bonusActionsAvailable={liveAttackModalAttacker?.bonusActions ?? attackModal.attacker.bonusActions}
          actionsAvailable={liveAttackModalAttacker?.actions ?? attackModal.attacker.actions}
          onClose={() => setAttackModal(null)}
          onConfirmHit={(attack, info) => {
            // 副手攻击（双武器战斗）消耗附赠动作；常规攻击消耗动作（多重攻击序列首击扣 1，后续击共享）
            if ((attack as Attack).offhand) consumeCombatantBonusAction(attackModal.attacker.id);
            else consumeAttackActionFor(attackModal.attacker.id);
            // 一攻揭晓：躲藏者攻击结算后移除 hidden（命中/未命中均算）
            breakHidden(attackModal.attacker.id);
            // 装填武器：标记本回合已攻击（每回合只能一次，优先级高于额外动作）
            if (attack.properties?.some(p => p.includes('装填'))) {
              markLoadingAttacked(attackModal.attacker.id);
            }
            // 命中确认：关闭攻击检定弹窗，切换至伤害结算弹窗
            // 弹药属性武器：消耗弹药（无论命中/未命中）；试验场无限弹药，跳过扣减（资源消耗模式除外）
            if (info.ammoConsumed && record && (!record.isProvingGround || record.resourceConsumption)) {
              const currentChanges = record.equipmentChanges?.[attackModal.attacker.id];
              const newChanges = applyEquipmentChange(currentChanges, (ch) => {
                const ammoId = info.ammoConsumed!.ammoChildId;
                const prevDelta = ch.quantityDeltas[ammoId] || 0;
                // 若源弹药数量-1 后 ≤0 则加入 removedChildIds（整件移除）
                const srcQty = (() => {
                  const pc = attackModal.attacker.characterId ? characterStore.get(attackModal.attacker.characterId) : null;
                  const eq = pc?.equipment.find(e => (e.childId || e.id) === ammoId);
                  return eq ? (eq.quantity || 1) + prevDelta : 0;
                })();
                if (srcQty <= 1) {
                  if (!ch.removedChildIds.includes(ammoId)) ch.removedChildIds.push(ammoId);
                } else {
                  ch.quantityDeltas[ammoId] = prevDelta - 1;
                }
              });
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [attackModal.attacker.id]: newChanges,
                },
                updatedAt: Date.now(),
              });
            }
            // 攻击事件：驱动观众端攻击动画（飞矢/冲刺）；投掷与远程武器按飞矢播放
            combatStore.pushCombatEvent(record.id, {
              kind: 'attack',
              round: currentTurn ? currentTurn.round + 1 : 0,
              actorId: attackModal.attacker.id,
              targetId: attackModal.target.id,
              ranged: info.usageMode === 'thrown' || attack.subtype?.includes('远程') === true,
              hit: true,
              critical: info.isNatural20,
              weaponName: attack.name,
              text: `《${attack.name}》→ ${attackModal.target.name}：命中`,
            });
            const damagePayload = {
              attacker: attackModal.attacker,
              target: attackModal.target,
              attack,
              disadvantage: info.disadvantage,
              isCritical: info.isNatural20,
              d20Rolled: info.d20Rolled,
              d20Final: info.d20Final,
              d20Bonus: info.bonus,
              d20Total: info.total,
              usageMode: info.usageMode,
              isTwoHandedWield: info.isTwoHandedWield,
            };
            setAttackModal(null);
            // 防御方反应窗口（attack_targeted）：命中确认后、伤害结算前，先处理被攻击方/其盟友的反应
            const rxMatches = record
              ? detectReactions(record, { kind: 'attack', attackerId: attackModal.attacker.id, targetId: attackModal.target.id })
              : [];
            if (rxMatches.length > 0 && record) {
              const rxRound = currentTurn ? currentTurn.round + 1 : 0;
              const fulls = rxMatches.flatMap(m => combatStore.addReactionPrompts(record.id, m.ownerId, [m], rxRound));
              setPendingDamage(damagePayload);
              setReactionQueue(prev => [...(prev || []), ...fulls]);
            } else {
              setDamageModal(damagePayload);
            }
          }}
          onAttackMiss={(missInfo) => {
            // 副手攻击（双武器战斗）消耗附赠动作；常规攻击消耗动作（多重攻击序列首击扣 1，后续击共享）
            if ((missInfo.attack as Attack).offhand) consumeCombatantBonusAction(attackModal.attacker.id);
            else consumeAttackActionFor(attackModal.attacker.id);
            // 一攻揭晓：躲藏者攻击结算后移除 hidden（命中/未命中均算）
            breakHidden(attackModal.attacker.id);
            // 装填武器：标记本回合已攻击（每回合只能一次，优先级高于额外动作）
            if (missInfo.attack.properties?.some(p => p.includes('装填'))) {
              markLoadingAttacked(attackModal.attacker.id);
            }
            // 未命中：写入先攻表格（简化格式）
            // 弹药属性武器：消耗弹药（无论命中/未命中）；试验场无限弹药，跳过扣减（资源消耗模式除外）
            if (missInfo.ammoConsumed && record && (!record.isProvingGround || record.resourceConsumption)) {
              const currentChanges = record.equipmentChanges?.[attackModal.attacker.id];
              const newChanges = applyEquipmentChange(currentChanges, (ch) => {
                const ammoId = missInfo.ammoConsumed!.ammoChildId;
                const prevDelta = ch.quantityDeltas[ammoId] || 0;
                const srcQty = (() => {
                  const pc = attackModal.attacker.characterId ? characterStore.get(attackModal.attacker.characterId) : null;
                  const eq = pc?.equipment.find(e => (e.childId || e.id) === ammoId);
                  return eq ? (eq.quantity || 1) + prevDelta : 0;
                })();
                if (srcQty <= 1) {
                  if (!ch.removedChildIds.includes(ammoId)) ch.removedChildIds.push(ammoId);
                } else {
                  ch.quantityDeltas[ammoId] = prevDelta - 1;
                }
              });
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [attackModal.attacker.id]: newChanges,
                },
                updatedAt: Date.now(),
              });
            }
            const text = `《${missInfo.attackName}》→ ${attackModal.target.name}：未命中`;
            // 攻击事件（未命中也推）：观众端播放落空动画
            combatStore.pushCombatEvent(record.id, {
              kind: 'attack',
              round: currentTurn ? currentTurn.round + 1 : 0,
              actorId: attackModal.attacker.id,
              targetId: attackModal.target.id,
              ranged: missInfo.usageMode === 'thrown' || missInfo.attack.subtype?.includes('远程') === true,
              hit: false,
              weaponName: missInfo.attackName,
              text,
            });
            recordOperation(attackModal.attacker.id, text, 'attack');
            // 投掷武器掉落：未命中也掉落
            if (attackModal.attackerPos && attackModal.targetPos) {
              executeThrownDrop(
                attackModal.attacker, attackModal.target,
                missInfo.attack,
                attackModal.attackerPos, attackModal.targetPos,
                false, record, missInfo.usageMode,
              );
            }
            // 当前击（未命中）结算完毕 → 推进多重攻击序列（副手攻击独立于序列，不推进）
            if (!(missInfo.attack as Attack).offhand) advanceMultiattackFor(attackModal.attacker.id);
          }}
        />
      )}

      {/* 通用反应机会队列：行使=扣反应+消费机会（伤害弹窗关闭后推进队列）；
          放弃=仅消费机会保留反应次数；机会挂在持有者身上，DM 关闭后可从参战者列表 ⚡ 徽标重开 */}
      {(() => {
        if (!reactionQueue || reactionIdx >= reactionQueue.length || reactionHold) return null;
        const opp = reactionQueue[reactionIdx];
        const owner = record.combatants.find(c => c.id === opp.ownerId);
        // 持有者死亡/昏迷/已不可见 → 由自动作废 effect 回收（此处只跳过渲染）
        if (!owner || owner.isDead || owner.isUnconscious || owner.isIncapacitated) return null;
        const definition = resolveReactionDefinition(opp.definitionId);
        const resolution = definition?.resolution
          ?? (opp.trigger === 'move_leave_reach' || opp.trigger === 'enter_reach' ? 'attack' : 'spell');

        if (resolution !== 'attack') {
          const target = record.combatants.find(c => c.id === (opp.targetId ?? opp.moverId ?? opp.casterId));
          const targetName = target?.name ?? '目标';
          // 无角色卡的参战者（试验场影子卡/NPC）不扣法术位，避免因无槽位数据而无法测试
          const slotLevel = owner.characterId ? (definition?.cost?.spellSlot ?? 0) : 0;
          const slotAvailable = slotLevel <= 0 || reactionSlotRemaining(owner, slotLevel) > 0;
          const name = definition?.name ?? opp.definitionName ?? '反应';
          // damage_modifier 直连（damage_taken 窗口）：吸收量手填，确认时累计进本次伤害结算；
          // 前提是伤害弹窗仍开着（absorbedDamage 落 damageModal state）——effect 伤害无窗口，走通用提示弹窗
          // reactionWindowDone 只表示检测窗口已跑过（防重复入队），与直连前提无关
          if (resolution === 'damage_modifier' && opp.trigger === 'damage_taken' && damageModal) {
            return (
              <DamageAbsorbModal
                definitionName={name}
                targetName={targetName}
                amount={opp.amount ?? 0}
                damageType={opp.damageType}
                eventLabel={opp.eventLabel}
                onSkip={() => {
                  combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
                  setReactionIdx(i => i + 1);
                }}
                onConfirm={(absorb) => {
                  noteReactionExercised();
                  combatStore.consumeReaction(record.id, owner.id);
                  combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
                  const line = `${owner.name} 行使反应《${name}》→ 吸收 ${absorb} 点伤害（${targetName}）`;
                  recordOperation(owner.id, line, 'record');
                  combatStore.pushCombatEvent(record.id, {
                    kind: 'skill',
                    actorId: owner.id,
                    targetId: target?.id,
                    text: line,
                  });
                  setDamageModal(prev => (prev ? { ...prev, absorbedDamage: (prev.absorbedDamage ?? 0) + absorb } : prev));
                  setReactionIdx(i => i + 1);
                }}
              />
            );
          }
          return (
            <ReactionPromptModal
              prompt={opp}
              definition={definition}
              owner={owner}
              targetName={targetName}
              slotLevel={slotLevel}
              slotAvailable={slotAvailable}
              onSkip={() => {
                combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
                setReactionIdx(i => i + 1);
              }}
              onConfirm={() => {
                if (slotLevel > 0) {
                  const ok = combatStore.consumeSpellSlot(record.id, owner.id, `level${slotLevel}` as SpellSlotLevel);
                  if (!ok) {
                    alert(`法术位不足，无法行使《${name}》`);
                    return;
                  }
                }
                noteReactionExercised();
                combatStore.consumeReaction(record.id, owner.id);
                combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
                const text = `${owner.name} 行使反应《${name}》→ ${targetName}（请按对应流程结算）`;
                recordOperation(owner.id, text, 'spell');
                combatStore.pushCombatEvent(record.id, {
                  kind: 'cast',
                  round: currentTurn ? currentTurn.round + 1 : 0,
                  actorId: owner.id,
                  targetId: target?.id,
                  spellName: name,
                  text,
                });
                setReactionIdx(i => i + 1);
              }}
            />
          );
        }

        // 攻击型反应的目标：移动事件取移动者；伤害/施法事件取攻击者/施法者
        const reactionTargetId = opp.moverId ?? opp.attackerId;
        if (!reactionTargetId) return null;
        const reactionTarget = record.combatants.find(c => c.id === reactionTargetId);
        if (!reactionTarget) return null;
        const bg = record.id ? battlegroundStore.get(record.id) : null;
        const ownerPos = bg?.tokens.find(t => t.combatantId === owner.id);
        const targetToken = bg?.tokens.find(t => t.combatantId === reactionTarget.id);
        // 借机攻击按离开触及的起点格计算距离；进入触及/反击按目标当前落点计算
        const targetPos = opp.trigger === 'enter_reach'
          ? opp.toPos
          : (opp.fromPos ?? (targetToken ? { col: targetToken.col, row: targetToken.row } : undefined));
        return (
          <CombatAttackModal
            attacker={owner}
            target={reactionTarget}
            recordId={record?.id}
            currentRound={currentTurn?.round}
            attackerPos={ownerPos ? { col: ownerPos.col, row: ownerPos.row } : undefined}
            targetPos={targetPos}
            combatantPositions={combatantPositions}
            paintedCells={record ? battlegroundStore.get(record.id)?.paintedCells : undefined}
            ambientLight={record ? battlegroundStore.get(record.id)?.ambientLight : undefined}
            lightCells={record ? battlegroundStore.get(record.id)?.lightCells : undefined}
            combatInventory={getCombatInventory(record, owner)}
            targetCharacter={reactionTarget.characterId ? characterStore.get(reactionTarget.characterId) : null}
            targetCombatInventory={getCombatInventory(record, reactionTarget)}
            loadedWeapons={record?.loadedWeapons}
            loadingAttackedThisRound={record?.loadingAttackedThisRound}
            combatMode={currentMode()}
            playbackTurnActive={isPlaybackActive()}
            reactionMode
            reactionSpent={owner.reactionUsed === true}
            onLoadedChange={(key, loaded) => {
              if (!record) return;
              combatStore.update(record.id, {
                loadedWeapons: { ...(record.loadedWeapons || {}), [key]: loaded },
                updatedAt: Date.now(),
              });
            }}
            onClose={() => {
              // 放弃：机会作废，反应次数保留（5e 可用于其他触发）
              combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
              setReactionIdx(i => i + 1);
            }}
            onConfirmHit={(attack, info) => {
              // 行使反应：扣反应次数 + 消费机会（反应攻击不消耗主动作）
              noteReactionExercised();
              breakHidden(owner.id);
              combatStore.consumeReaction(record.id, owner.id);
              combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
              combatStore.pushCombatEvent(record.id, {
                kind: 'attack',
                round: currentTurn ? currentTurn.round + 1 : 0,
                actorId: owner.id,
                targetId: reactionTarget.id,
                ranged: false,
                hit: true,
                critical: info.isNatural20,
                weaponName: attack.name,
                text: `《${attack.name}》→ ${reactionTarget.name}：${definition?.name ?? '反应'}命中`,
              });
              setDamageModal({
                attacker: owner,
                target: reactionTarget,
                attack,
                disadvantage: info.disadvantage,
                isCritical: info.isNatural20,
                d20Rolled: info.d20Rolled,
                d20Final: info.d20Final,
                d20Bonus: info.bonus,
                d20Total: info.total,
                usageMode: info.usageMode,
                isTwoHandedWield: info.isTwoHandedWield,
                reactionPending: true,
              });
              // 队列推进延后到伤害弹窗关闭（reactionHold 期间不渲染下一个机会弹窗）
              setReactionHold(true);
              setReactionIdx(i => i + 1);
            }}
            onAttackMiss={(missInfo) => {
              noteReactionExercised();
              breakHidden(owner.id);
              combatStore.consumeReaction(record.id, owner.id);
              combatStore.consumePendingReaction(record.id, opp.ownerId, opp.id);
              const text = `《${missInfo.attackName}》→ ${reactionTarget.name}：${definition?.name ?? '反应'}未命中`;
              combatStore.pushCombatEvent(record.id, {
                kind: 'attack',
                round: currentTurn ? currentTurn.round + 1 : 0,
                actorId: owner.id,
                targetId: reactionTarget.id,
                ranged: false,
                hit: false,
                weaponName: missInfo.attackName,
                text,
              });
              recordOperation(owner.id, text, 'attack');
              // 借机路径跳过投掷武器掉落：近战触发的投掷使用按近战口径处理，沙盘落点语义不明
              setReactionIdx(i => i + 1);
            }}
          />
        );
      })()}

      {/* ✅ 新增：伤害结算弹窗 —— 攻击命中后展示 */}
      {damageModal && (
        <CombatDamageModal
          attacker={damageModal.attacker}
          target={damageModal.target}
          attack={damageModal.attack}
          disadvantage={damageModal.disadvantage}
          isCritical={damageModal.isCritical}
          isTwoHandedWield={damageModal.isTwoHandedWield}
          riders={(() => {
            // 命中触发 rider 仅近战/投掷可用（至圣斩/震慑拳 5e 语义）；渲染时实时取最新参战者
            const mode = damageModal.usageMode;
            if (mode !== 'melee' && mode !== 'thrown' || !record) return undefined;
            const live = record.combatants.find(c => c.id === damageModal.attacker.id) ?? damageModal.attacker;
            const options = getAttackRiders(record, live);
            return options.length > 0 ? options : undefined;
          })()}
          zIndexClass={!reactionHold && reactionQueue && reactionIdx < reactionQueue.length ? 'z-40' : 'z-50'}
          onApplyDamage={({ damage, newHp, status, resolution, riders: riderSelections }) => {
            const applyDamageNow = () => {              // damage_taken 窗口内 damage_modifier 反应的累计吸收量：从结算伤害中扣减
              const finalDamage = Math.max(0, damage - (damageModal.absorbedDamage ?? 0));
              // 1. 应用 HP / 状态：伤害量由攻击方结算结果直接传入
              const result = handleApplyDamage({
                targetId: damageModal.target.id,
                amount: finalDamage,
                status,
                sourceId: damageModal.attacker.id,
                sourceName: damageModal.attacker.name,
                sourceKind: 'weapon',
                damageType: damageModal.attack.damageType,
              });
              // 2. 记录操作（放映写表格 / 模拟写日志，简化格式 + 目标 HP 变动）
              const oldHp = result?.oldHp ?? damageModal.target.currentHp;
              const actualNewHp = result?.newHp ?? newHp;
              let text = `《${damageModal.attack.name}》→ ${damageModal.target.name}：【${finalDamage}】伤害`;
              if (damageModal.absorbedDamage) text += `，反应吸收${damageModal.absorbedDamage}`;
              if (oldHp != null) text += `，HP【${oldHp}→${actualNewHp}】`;
              if (result?.tempAbsorbed) text += `，临时HP吸收${result.tempAbsorbed}`;
              const breakdown = formatDamageBreakdown(resolution);
              if (breakdown) text += `，${breakdown}`;
              if (result?.status === 'unconscious') text += '，击昏';
              else if (result?.status === 'dead') text += '，杀死';
              if (result?.wildShapeBroken) {
                const ws = result.wildShapeBroken;
                text += `，${ws.beastName}形态破碎→恢复${ws.restoredName}原形（溢出${ws.overflow}伤，原形HP【${ws.restoredHp}】）`;
              }
              recordOperation(damageModal.attacker.id, text, 'damage');
              // 2.5 命中触发 rider：扣资源（池/法术位）+ 豁免失败挂震慑（死亡目标跳过状态）
              if (riderSelections && riderSelections.length > 0 && record) {
                const currentRound0 = currentTurn?.round ?? Math.max(0, record.rounds.length - 1);
                const alive = result?.status !== 'dead';
                const riderLines = applyAttackRiders(record, damageModal.attacker, damageModal.target, riderSelections, currentRound0, { targetAlive: alive });
                for (const line of riderLines) recordOperation(damageModal.attacker.id, line, 'record');
              }
              // 3. 投掷武器掉落：命中也掉落
              const bg = record ? battlegroundStore.get(record.id) : null;
              if (bg) {
                const attackerToken = bg.tokens.find(t => t.combatantId === damageModal.attacker.id);
                const targetToken = bg.tokens.find(t => t.combatantId === damageModal.target.id);
                if (attackerToken && targetToken) {
                  executeThrownDrop(
                    damageModal.attacker, damageModal.target,
                    damageModal.attack,
                    { col: attackerToken.col, row: attackerToken.row },
                    { col: targetToken.col, row: targetToken.row },
                    true, record, damageModal.usageMode,
                  );
                }
              }
            };

            // damage_taken 反应窗口：结算前先给目标/其盟友机会，弹窗保持打开并保留本次计算值
            if (!damageModal.reactionWindowDone && damage > 0 && record) {
              const matches = detectReactions(record, {
                kind: 'damage',
                targetId: damageModal.target.id,
                attackerId: damageModal.attacker.id,
                amount: damage,
                damageType: damageModal.attack.damageType,
              });
              if (matches.length > 0) {
                const rxRound = currentTurn ? currentTurn.round + 1 : 0;
                const fulls = matches.flatMap(m => combatStore.addReactionPrompts(record.id, m.ownerId, [m], rxRound));
                setReactionQueue(prev => [...(prev || []), ...fulls]);
                setDamageModal(prev => (prev ? { ...prev, reactionWindowDone: true } : prev));
                // 告知弹窗本次结算已挂起：保持打开，队列清空后由 DM 二次确认落账
                return true;
              }
            }
            applyDamageNow();
            // 当前击（命中伤害落账）结算完毕 → 推进多重攻击序列；反应挂起路径未落账不推进（副手攻击不推进）
            if (!(damageModal.attack as Attack).offhand) advanceMultiattackFor(damageModal.attacker.id);
            return false;
          }}
          onClose={() => {
            setDamageModal(null);
            // 借机攻击的伤害已结算 → 释放队列挂起，展示下一个机会（若有）
            setReactionHold(false);
          }}
        />
      )}

      {/* ✅ 新增：法术施放弹窗 —— 独立于攻击检定的交互流程 */}
      {spellModal && (
        <CombatSpellModal
          recordId={record?.id}
          caster={liveSpellModalCaster ?? spellModal.caster}
          target={liveSpellModalTarget ?? spellModal.target}
          isProvingGround={record?.isProvingGround ?? false}
          targetCharacter={liveSpellModalTarget?.characterId ? characterStore.get(liveSpellModalTarget.characterId) : null}
          targetCombatInventory={getCombatInventory(record, liveSpellModalTarget ?? spellModal.target)}
          casterCombatInventory={getCombatInventory(record, liveSpellModalCaster ?? spellModal.caster)}
          onConsumeMaterials={(items) => {
            if (!record || record.isProvingGround) return;
            const currentChanges = record.equipmentChanges?.[spellModal.caster.id];
            const newChanges = applyEquipmentChange(currentChanges, (ch) => {
              for (const item of items) {
                const delta = -(item.quantity || 1);
                const srcEq = (() => {
                  const pc = spellModal.caster.characterId ? characterStore.get(spellModal.caster.characterId) : null;
                  return pc?.equipment.find(e => (e.childId || e.id) === item.childId);
                })();
                const prevDelta = ch.quantityDeltas[item.childId] || 0;
                const effectiveQty = (srcEq?.quantity ?? 1) + prevDelta;
                if (effectiveQty + delta <= 0) {
                  if (!ch.removedChildIds.includes(item.childId)) ch.removedChildIds.push(item.childId);
                  delete ch.quantityDeltas[item.childId];
                } else {
                  ch.quantityDeltas[item.childId] = prevDelta + delta;
                }
              }
            });
            combatStore.update(record.id, {
              equipmentChanges: {
                ...(record.equipmentChanges || {}),
                [spellModal.caster.id]: newChanges,
              },
              updatedAt: Date.now(),
            });
          }}
          combatantPositions={combatantPositions}
          bounds={(() => {
            const bg = record?.id ? battlegroundStore.get(record.id) : null;
            const preset = GRID_PRESETS[bg?.size ?? 'small'];
            return { cols: preset.cols, rows: preset.rows };
          })()}
          canUseAction={canUseAction(spellModal.caster.id)}
          canUseBonusAction={canUseBonusAction(spellModal.caster.id)}
          onTargetChange={(c) => setSpellModal(m => (m ? { ...m, target: c } : m))}
          onClose={() => setSpellModal(null)}
          onFlowResolved={(payload) => {
            const finalizeFlow = () => {
            // 流程施放与手动管线同一动作语义：按施法时间扣动作
            if (isOneActionCast(payload.castingTime)) {
              consumeCombatantAction(spellModal.caster.id);
            }
            if (isBonusActionCast(payload.castingTime)) {
              consumeCombatantBonusAction(spellModal.caster.id);
            }
            // 逐目标 HP 回写（编译器纯计算，落地在此）；NPC 归 0 标记昏迷，与手动结算语义一致
            // 附加的状态实例 ID 收集进 concentration.statusIds：专注断 → 效果断
            const appliedStatusIds: string[] = [];
            // 条件免疫跳过的目标（摘要追加提示）
            const immunityNotes: string[] = [];
            payload.targetResults.forEach(tr => {
              const c = record?.combatants.find(x => x.id === tr.combatantId);
              if (!c) return;
              if (tr.effectType === 'zone') {
                // 地形区域落地：编译器只产出格子与规格，回合边界在此按当前回合补齐。
                // 模拟模式无回合概念 → createdRound=0 且不设 expireRound（手动移除）。
                if (!tr.zone || !record) return;
                const isPlaybackZone = record.mode === 'playback';
                const castRound = isPlaybackZone
                  ? (currentTurn?.round ?? Math.max(0, record.rounds.length - 1))
                  : 0;
                const duration = tr.zone.durationRounds ?? 0;
                battlegroundStore.addZone(record.id, {
                  type: tr.zone.type,
                  label: tr.zone.label,
                  cells: tr.zone.cells,
                  color: tr.zone.color,
                  damage: tr.zone.damage
                    ? {
                        amount: tr.zone.damage.amount,
                        damageType: (normalizeDamageType(tr.zone.damage.damageType) ?? '火焰'),
                        magical: tr.zone.damage.magical === true,
                      }
                    : undefined,
                  createdRound: castRound,
                  durationRounds: duration,
                  ...(isPlaybackZone && duration > 0 ? { expireRound: castRound + duration - 1 } : {}),
                  source: payload.spellName,
                  hitRounds: {},
                });
                return;
              }
              if (tr.effectType === 'forced_move') {
                // 强制位移落地：编译器只产出计划（方向/距离/规避区），落位由 useForcedMove
                // 统一执行（与手动入口同一落位引擎，design.md 单一事实源）。
                if (!tr.forcedMove || !record) return;
                const result = executeForcedMove(record, {
                  targetId: tr.forcedMove.targetId,
                  bearing: tr.forcedMove.bearing,
                  distanceCells: tr.forcedMove.distanceCells,
                  avoidCells: tr.forcedMove.avoidCells,
                  originId: tr.forcedMove.originId,
                });
                if (result) {
                  const moved = record.combatants.find(c => c.id === tr.forcedMove!.targetId);
                  recordOperation(
                    tr.forcedMove.targetId,
                    result.path.length > 0
                      ? `${moved?.name ?? '目标'}被《${payload.spellName}》强制位移 ${result.path.length} 格至 (${result.finalPos.col},${result.finalPos.row})${result.truncated ? '，途中受阻截断' : ''}`
                      : `${moved?.name ?? '目标'}被《${payload.spellName}》强制位移：无路可推，原地不动`,
                    'move',
                  );
                }
                return;
              }
              if (tr.effectType === 'status' || tr.effectType === 'check_modifier' || tr.effectType === 'advantage') {
                // 状态落地：通用伤害修饰引擎（实例级效果 + 持续时间由流程注入）。
                // 过期策略按施放时的战斗模式定性：
                //   放映模式 + untilNextTurn → 锚定施法者回合（「直到你的下一回合」，如剑刃防护）
                //   放映模式 + durationRounds → 绝对回合自动过期
                //   模拟模式 → 永续待手动取消
                if (tr.statusId) {
                  // 条件免疫：免疫的状态跳过挂载（5e 状态免疫语义）
                  const immuneLabel = immunityLabelFor(c, tr.statusId);
                  if (immuneLabel) {
                    immunityNotes.push(`「${c.name}」免疫${immuneLabel}，状态未附加`);
                    return;
                  }
                  const isPlayback = record?.mode === 'playback';
                  const castRound = currentTurn?.round ?? Math.max(0, (record?.rounds.length ?? 1) - 1);
                  // 次数型检定奖惩（如激励）：写参战者计数通道，不进状态系统
                  // （次数用完即消失，与状态过期语义不同）
                  if (tr.effectType === 'check_modifier' && (tr.modifierUses ?? 0) > 0) {
                    const cfg = (tr.statusEffects?.[0]?.config ?? {}) as Record<string, unknown>;
                    combatStore.addPendingCheckModifier(record.id, tr.combatantId, {
                      fromId: spellModal.caster.id,
                      fromName: spellModal.caster.name,
                      reason: payload.spellName,
                      mode: (cfg.mode as 'bonus' | 'penalty') ?? 'bonus',
                      dice: (cfg.dice as { count: number; sides: number; flatBonus?: number }) ?? { count: 0, sides: 0, flatBonus: 0 },
                      scene: (cfg.scene as any) ?? 'any',
                      forced: cfg.forced === true,
                      uses: tr.modifierUses,
                      createdRound: castRound,
                      expireRound: -1,
                    });
                    return;
                  }
                  const statusInstance = globalStatusManager.applyEffect(tr.combatantId, tr.statusId, 'combat', record?.id, {
                    ...(tr.statusEffects && tr.statusEffects.length > 0 ? { instanceEffects: tr.statusEffects } : {}),
                    ...(tr.durationRounds && tr.durationRounds > 0 ? { durationRounds: tr.durationRounds } : {}),
                    ...(isPlayback
                      ? {
                          combatMode: 'playback' as const,
                          startRound: castRound,
                          ...(tr.untilNextTurn
                            ? { untilNextTurn: true, anchorCombatantId: spellModal.caster.id, turnCount: tr.turnCount }
                            : {}),
                        }
                      : { combatMode: 'simulation' as const }),
                  });
                  appliedStatusIds.push(statusInstance.instanceId);
                }
                return;
              }
              if (tr.effectType === 'damage') {
                const status = (!c.isPc && tr.newHp <= 0) ? 'unconscious' as const : undefined;
                handleApplyDamage({
                  targetId: tr.combatantId,
                  amount: tr.finalValue,
                  status,
                  sourceId: spellModal.caster.id,
                  sourceName: spellModal.caster.name,
                  sourceKind: 'spell',
                  damageType: tr.damageType ?? undefined,
                });
              } else if (tr.effectType === 'healing') {
                handleApplyHealing(tr.combatantId, tr.finalValue);
              }
            });
            // 摘要文本（FlowRunStep 生成的单行紧凑文本）；专注替换/免疫拦截备注追加在末尾
            let flowSummary = payload.summary;
            if (immunityNotes.length > 0) flowSummary += `（${immunityNotes.join('；')}）`;
            if (payload.concentration && payload.success) {
              const concNote = beginConcentration(spellModal.caster.id, payload.spellName, appliedStatusIds);
              if (concNote) flowSummary += concNote;
            }
            recordOperation(spellModal.caster.id, flowSummary, 'spell');
            };
            beginSpellCastWindow(spellModal.caster.id, payload.spellId, payload.spellName, finalizeFlow);
          }}
          onCastResolved={(info) => {
            const finalizeCast = () => {
            // 施法时间 = "1 动作" 的法术消耗 1 个动作（无论是否命中/被豁免）
            if (isOneActionCast(info.castingTime)) {
              consumeCombatantAction(spellModal.caster.id);
            }
            // 施法时间 = "1 附赠动作" 的法术消耗 1 个附赠动作
            if (isBonusActionCast(info.castingTime)) {
              consumeCombatantBonusAction(spellModal.caster.id);
            }
            // 1. 应用 HP / 状态：伤害/治疗量由施法方结算结果直接传入
            if (info.effectType === 'damage') {
              handleApplyDamage({
                targetId: spellModal.target.id,
                amount: info.amount,
                status: info.status,
                sourceId: spellModal.caster.id,
                sourceName: spellModal.caster.name,
                sourceKind: 'spell',
                damageType: info.damageType,
              });
            } else {
              handleApplyHealing(spellModal.target.id, info.amount);
            }
            // 2. 专注类法术成功施展 → 声明/替换专注（失败不触发）
            let concNote: string | null = null;
            if (info.concentration && info.success) {
              concNote = beginConcentration(spellModal.caster.id, info.spellName);
            }
            // 3. 记录操作（简化格式：成功省略，直接说效果；失败才标注）
            let text: string;
            if (!info.success) {
              text = `《${info.spellName}》施法失败`;
            } else if (info.amount > 0) {
              const num = info.effectType === 'damage' ? `【${info.amount}】` : `【+${info.amount}】`;
              text = `《${info.spellName}》→ ${spellModal.target.name}：${num}${info.effectType === 'damage' ? '伤害' : '生命'}`;
              const oldHp = spellModal.target.currentHp;
              if (oldHp != null) text += `，HP【${oldHp}→${info.newHp}】`;
              if (info.affinityDetail) text += `，${info.affinityDetail}`;
              if (info.status === 'unconscious') text += '，击昏';
              else if (info.status === 'dead') text += '，杀死';
            } else {
              text = `《${info.spellName}》生效`;
            }
            if (concNote) text += concNote;
            recordOperation(spellModal.caster.id, text, 'spell');
            };
            beginSpellCastWindow(spellModal.caster.id, info.spellId, info.spellName, finalizeCast);
          }}
        />
      )}

      {/* 施法反应窗口结束：有反应被行使时由 DM 决定是否仍应用施法效果（反制场景选不应用） */}
      {pendingCastConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <h3 className="text-lg font-bold mb-2 dark:text-text-dark light:text-text-light">施法反应窗口结束</h3>
            <p className="text-sm mb-3 dark:text-text-dark light:text-text-light">
              《{pendingCastConfirm.label}》的反应已处理。是否仍应用本次施法效果？
            </p>
            <p className="text-xs mb-4 dark:text-text-dark-muted light:text-text-light-muted">
              若反应成功反制或改变了施法结果，请选择「不应用」；后续如需结算可手动补录。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  const current = pendingCastConfirm;
                  setPendingCastConfirm(null);
                  recordOperation(current.casterId, `《${current.label}》施法效果未应用（反应窗口）`, 'spell');
                }}
                className="px-3 py-1.5 rounded-lg text-sm border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light hover:bg-white/10"
              >
                不应用（视为被反制）
              </button>
              <button
                onClick={() => {
                  const current = pendingCastConfirm;
                  setPendingCastConfirm(null);
                  current.finalize();
                }}
                className="px-3 py-1.5 rounded-lg text-sm bg-primary text-white hover:opacity-90"
              >
                应用施法效果
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 协助（Help）动作弹窗 */}
      {helpModal && record && (() => {
        const from = helpModal.from;
        // 友方：同阵营（isPc === from.isPc），未死亡，非自己
        const friendlies = record.combatants.filter(
          c => c.id !== from.id && c.isPc === from.isPc && !c.isDead,
        );
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setHelpModal(null)}>
            <div className="w-full max-w-md rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">
                  协助动作
                </h3>
                <button onClick={() => setHelpModal(null)} className="p-1 rounded hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-2">
                发出者：<span className="font-medium dark:text-text-dark light:text-text-light">{from.name}</span>
              </p>
              <ul className="text-xs dark:text-text-dark-muted light:text-text-light-muted space-y-0.5 mb-4 list-disc pl-5">
                <li>效果：优势</li>
                <li>类型：一次性</li>
                <li>有效期：{from.name} 的下一个回合前</li>
                <li>生效场景：
                  <ul className="list-[circle] pl-4">
                    <li>属性检定 / 技能检定（无条件）</li>
                    <li>攻击检定（近战/远程/投掷/法术）：仅当对方攻击目标在 {from.name} 5 尺内</li>
                  </ul>
                </li>
              </ul>
              <div className="text-xs font-medium dark:text-text-dark light:text-text-light mb-2">
                选择协助对象（友方 · {friendlies.length}）
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {friendlies.length === 0 && (
                  <div className="text-xs opacity-60 text-center py-6">当前没有可选择的友方</div>
                )}
                {friendlies.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (!record) return;
                      const curRound = currentTurn?.round ?? 0;
                      // 场景通配 + 批量写入：3 条标记覆盖全部场景
                      // - 'check' 通配 ability_check + skill_check（无条件）
                      // - 'attack' 通配 4 类攻击检定（requireTargetNearFromId 限制 5 尺内）
                      combatStore.addPendingAdvantages(record.id, f.id, [
                        {
                          fromId: from.id,
                          fromName: from.name,
                          scene: 'check',
                          mode: 'advantage',
                          reason: `${from.name} 协助：属性/技能检定优势`,
                          kind: 'action',
                          requireTargetNearFromId: false,
                          expireOnCombatantId: from.id,
                          createdRound: curRound,
                          expireRound: -1,
                        },
                        {
                          fromId: from.id,
                          fromName: from.name,
                          scene: 'attack',
                          mode: 'advantage',
                          reason: `${from.name} 协助：攻击检定优势（目标须在其 5 尺内）`,
                          kind: 'action',
                          requireTargetNearFromId: true,
                          expireOnCombatantId: from.id,
                          createdRound: curRound,
                          expireRound: -1,
                        },
                      ]);
                      // 消耗 1 个动作
                      consumeCombatantAction(from.id);
                      // 记录操作（放映写表格 / 模拟写日志）
                      recordOperation(from.id, `协助 ${f.name}`, 'record');
                      setHelpModal(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg border dark:border-border-dark light:border-border-light hover:border-primary/60 hover:bg-primary/5 transition-colors"
                  >
                    <div className="text-sm font-medium dark:text-text-dark light:text-text-light">{f.name}</div>
                    <div className="text-xs opacity-60">
                      {f.isPc ? '玩家角色' : 'NPC'}
                      {f.initiative ? ` · 先攻 ${f.initiative}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* checkModifier 通道弹窗：选受益人 → 确认时扣动作与池 → 通道执行器写加值标记 */}
      {checkModifierModal && record && (() => {
        const friendlies = record.combatants.filter(
          c => c.id !== checkModifierModal.from.id && c.isPc === checkModifierModal.from.isPc && !c.isDead,
        );
        return (
          <FeatureCheckModifierModal
            from={checkModifierModal.from}
            featureName={checkModifierModal.featureName}
            capability={checkModifierModal.capability}
            friendlies={friendlies}
            onConfirm={confirmCheckModifier}
            onClose={() => setCheckModifierModal(null)}
          />
        );
      })()}

      {/* aoe_save 通道弹窗（吐息武器等）：范围拾取 + 逐目标豁免结算 */}
      {aoeSaveModal && record && (() => {
        const bg = battlegroundStore.get(record.id);
        const preset = GRID_PRESETS[bg?.size ?? 'small'];
        return (
          <FeatureAoeSaveModal
            caster={aoeSaveModal.from}
            featureName={aoeSaveModal.featureName}
            capability={aoeSaveModal.capability}
            descriptionOverride={aoeSaveModal.descriptionOverride}
            combatants={record.combatants}
            combatantPositions={combatantPositions}
            bounds={{ cols: preset.cols, rows: preset.rows }}
            onResolve={resolveAoeSave}
            onClose={() => setAoeSaveModal(null)}
          />
        );
      })()}

      {/* resource_conv convert 多目标选择弹窗（灵巧动作类） */}
      {convTargetPick && record && (
        <FeatureConvTargetModal
          from={convTargetPick.from}
          featureName={convTargetPick.featureName}
          targets={convTargetPick.targets}
          onConfirm={(target) => confirmConvTargetUse(convTargetPick.from, convTargetPick.featureName, target, convTargetPick.activation, convTargetPick.poolKey, convTargetPick.cost, convTargetPick.capability)}
          onClose={() => setConvTargetPick(null)}
        />
      )}

      {/* heal 骰值环节（线下骰）：按 spec 骰模板填入线下掷骰结果，确认时扣资源 */}
      {healRollPick && record && (() => {
        const char = healRollPick.from.characterId ? characterStore.get(healRollPick.from.characterId) : null;
        return (
          <HealRollModal
            featureName={healRollPick.feature.name}
            spec={healRollPick.capability.heal!}
            casterLevel={char?.level ?? 1}
            onConfirm={confirmHealRoll}
            onClose={() => setHealRollPick(null)}
          />
        );
      })()}

      {/* 渗透劲引爆（延迟引爆 rider）：豁免 d20 与伤害总量线下手填，确认时耗动作/落地伤害/解除标记 */}
      {quiveringPalmModal && record && (
        <QuiveringPalmModal
          attackerName={quiveringPalmModal.from.name}
          targetName={quiveringPalmModal.target.name}
          dc={quiveringPalmModal.dc}
          damageDice={quiveringPalmModal.damageDice}
          damageType={quiveringPalmModal.damageType}
          onConfirm={confirmQuiveringPalm}
          onClose={() => setQuiveringPalmModal(null)}
        />
      )}

      {/* ✅ 突袭选择弹窗 */}
      {surpriseAttackOpen && (
        <SurpriseAttackDialog
          open={surpriseAttackOpen}
          round={surpriseAttackRound}
          combatants={record.combatants}
          surprisedCombatants={surprisedCombatants}
          onToggleSurprised={toggleSurprisedCombatant}
          onConfirm={confirmSurpriseAttack}
          onClose={closeSurpriseAttackModal}
        />
      )}

      {/* ✅ 手动记录弹窗 */}
      {manualRecordOpen && manualRecordType && (
        <ManualRecordDialog
          open
          recordType={manualRecordType}
          combatants={record.combatants}
          attackerId={selectedCell?.combatantId ?? ''}
          onSetType={setManualRecordType}
          targetId={manualTargetId}
          onTargetIdChange={setManualTargetId}
          attackMethod={manualAttackMethod}
          onAttackMethodChange={setManualAttackMethod}
          attackD20={manualD20}
          onAttackD20Change={setManualD20}
          attackD20Second={manualD20Second}
          onAttackD20SecondChange={setManualD20Second}
          attackBonus={manualAttackBonus}
          onAttackBonusChange={setManualAttackBonus}
          rollMode={manualRollMode}
          onRollModeChange={setManualRollMode}
          crit={manualCrit}
          onCritChange={setManualCrit}
          actionCost={manualActionCost}
          onActionCostChange={setManualActionCost}
          attackCount={manualAttackCount}
          onAttackCountChange={setManualAttackCount}
          actionAvailability={{
            action: selectedCell ? canUseAction(selectedCell.combatantId) : false,
            bonus: selectedCell ? canUseBonusAction(selectedCell.combatantId) : false,
            reaction: selectedCell ? canUseReaction(selectedCell.combatantId) : false,
            free: true,
          }}
          damage={manualDamage}
          onDamageChange={setManualDamage}
          isKill={manualIsKill}
          onIsKillChange={setManualIsKill}
          damageType={manualDamageType}
          onDamageTypeChange={setManualDamageType}
          attackSource={manualAttackSource}
          onAttackSourceChange={setManualAttackSource}
          weaponTraits={manualWeaponTraits}
          onWeaponTraitsChange={(patch) => setManualWeaponTraits(prev => ({ ...prev, ...patch }))}
          healMethod={manualHealMethod}
          onHealMethodChange={setManualHealMethod}
          healAmount={manualHealAmount}
          onHealAmountChange={setManualHealAmount}
          getEffectiveAc={getEffectiveAc}
          getInitiativeCircle={getInitiativeCircle}
          onConfirm={confirmManualRecord}
          onCancel={cancelManualRecord}
        />
      )}

      {/* ✅ 完成回合确认弹窗 */}
      {confirmEndTurnOpen && currentTurn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">完成回合</h3>
              <button
                onClick={() => setConfirmEndTurnOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              确认完成 <span className="font-bold text-primary">
                {record.combatants.find(c => c.id === currentTurn.combatantId)?.name ?? '?'}
              </span> 的回合（第 {currentTurn.round + 1} 轮）？
            </p>
            <p className="text-xs dark:text-text-dark-muted light:text-text-light-muted mb-4">
              系统将按先攻顺序推进到下一回合。若该轮已结束，将自动开启新一轮。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmEndTurnOpen(false)}
                className="flex-1 px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmEndTurn}
                className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <SkipForward className="w-4 h-4" />完成
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ✅ 退出放映弹窗：保存并覆盖 / 丢弃恢复 / 取消 */}
      {exitPlaybackModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onMouseDown={e => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-xl p-4 dark:bg-card-dark light:bg-card-light border dark:border-border-dark light:border-border-light">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-text-dark light:text-text-light">退出放映</h3>
              <button
                type="button"
                onClick={() => setExitPlaybackModalOpen(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm dark:text-text-dark-muted light:text-text-light-muted mb-4">
              放映期间对先攻表、生命值、沙盘的操作可以选择保存或丢弃。
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => finalizeExitPlayback(true)}
                className="w-full px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Check className="w-4 h-4" />
                保存并覆盖原版本
              </button>
              <button
                type="button"
                onClick={() => finalizeExitPlayback(false)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-1"
              >
                <Undo2 className="w-4 h-4" />
                丢弃，恢复原先状态
              </button>
              <button
                type="button"
                onClick={() => setExitPlaybackModalOpen(false)}
                className="w-full px-3 py-2 rounded-lg border dark:border-border-dark dark:text-text-dark light:border-border-light light:text-text-light text-sm hover:bg-white/5 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 回溯确认弹窗：放映模式下双击确认才生效 */}
      {rewindModal && (
        <RewindDialog
          open
          round={rewindModal.round}
          combatantName={
            record.combatants.find(c => c.id === rewindModal.combatantId)?.name ?? '未知角色'
          }
          onRewind={() => applyRollback(rewindModal.round, rewindModal.combatantIdx)}
          onClose={() => setRewindModal(null)}
        />
      )}

      {/* ✅ 参战者信息面板（点击表头名称按钮打开，等价沙盘双击弹窗） */}
      {infoPanelCombatant && (() => {
        // 面板内的参战者数据必须实时跟 record 走：打开面板存的是快照，
        // 面板内部自己发起的变更（附加奖惩/状态/手持）否则读不到新值
        const liveCombatant = record?.combatants.find(c => c.id === infoPanelCombatant.id) ?? infoPanelCombatant;
        const bg = record?.id ? battlegroundStore.get(record.id) : null;
        const tokens = bg?.tokens ?? [];
        const tokenMap: { get: (id: string) => { col: number; row: number } | undefined } = {
          get: (id: string) => {
            const t = tokens.find(x => x.combatantId === id);
            return t ? { col: t.col, row: t.row } : undefined;
          },
        };
        return (
          <CombatantInfoPanel
            combatant={liveCombatant}
            isProvingGround={record?.isProvingGround ?? false}
            provingRecord={record?.isProvingGround ? record : null}
            recordId={record?.id}
            sealed={!record?.isProvingGround && !!record?.settledAt}
            onClose={() => setInfoPanelCombatant(null)}
            combatants={record?.combatants ?? []}
            tokenMap={tokenMap}
            combatInventory={combatInventories?.[liveCombatant.id]}
            onRemoveItem={(item) => {
              if (!record) return;
              // 从战斗背包移除：写 EquipmentChanges.removedChildIds
              const childId = item.childId || item.id;
              const prev = record.equipmentChanges?.[liveCombatant.id];
              const removed = Array.from(new Set([...(prev?.removedChildIds ?? []), childId]));
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [infoPanelCombatant.id]: {
                    added: prev?.added ?? [],
                    removedChildIds: removed,
                    quantityDeltas: prev?.quantityDeltas ?? {},
                  },
                },
              });
            }}
            equipmentChanges={record?.equipmentChanges?.[infoPanelCombatant.id]}
            onUpdateChanges={(changes) => {
              if (!record) return;
              combatStore.update(record.id, {
                equipmentChanges: {
                  ...(record.equipmentChanges || {}),
                  [infoPanelCombatant.id]: changes,
                },
              });
            }}
            actions={liveCombatant.actions}
            bonusActions={liveCombatant.bonusActions}
            onHelpClick={() => openHelpFor(liveCombatant)}
            onFeatureClick={(feature, poolInfo) => handleFeatureUse(liveCombatant, feature, poolInfo)}
            onAttackClick={() => openAttackFor(liveCombatant)}
            multiattackRecipe={liveCombatant.multiattack}
            multiattackStep={(() => {
              const seq = activeMultiattackSeq(liveCombatant.id);
              return seq ? { pos: seq.pos, total: seq.queue.length, stepName: seq.queue[seq.pos] } : null;
            })()}
            onMultiattackStart={() => startMultiattackSequence(liveCombatant)}
            onMultiattackEnd={() => endMultiattackSequence(liveCombatant.id)}
            onBreathWeaponClick={(index) => openNpcBreathWeapon(liveCombatant, index)}
            onCastClick={() => {
              openCastFor(liveCombatant);
              setInfoPanelCombatant(null);
            }}
            onDashClick={() => {
              dashFor(liveCombatant);
              setInfoPanelCombatant(null);
            }}
            onDodgeClick={() => {
              dodgeFor(liveCombatant);
              setInfoPanelCombatant(null);
            }}
            onDisengageClick={() => {
              disengageFor(liveCombatant);
              setInfoPanelCombatant(null);
            }}
            onHideClick={() => {
              setHideRollTarget(liveCombatant);
              setInfoPanelCombatant(null);
            }}
            onSearchClick={() => {
              setSearchRollTarget(liveCombatant);
              setInfoPanelCombatant(null);
            }}
            onForcedMoveClick={() => setForcedMoveTarget(liveCombatant)}
          />
        );
       })()}
     
      {/* 躲藏：录入线下掷出的隐匿检定总值（供后续搜索对抗） */}
      {hideRollTarget && (
        <DiceInputModal
          title={`躲藏 · ${hideRollTarget.name}`}
          diceText="d20 + 隐匿加值"
          hint="填入敏捷（隐匿）检定总值；搜索时以察觉检定与之对抗，平局仍视为未被发现"
          min={1}
          max={60}
          confirmLabel="进入躲藏"
          onConfirm={(stealthTotal) => {
            const target = hideRollTarget;
            setHideRollTarget(null);
            hideFor(target, stealthTotal);
          }}
          onClose={() => setHideRollTarget(null)}
        />
      )}

      {/* 搜索：录入线下掷出的察觉 d20，加值由角色卡派生 */}
      {searchRollTarget && (() => {
        const character = searchRollTarget.characterId ? characterStore.get(searchRollTarget.characterId) : null;
        const bonus = deriveSkillCheckBonus(character, 'perception');
        return (
          <DiceInputModal
            title={`搜索 · ${searchRollTarget.name}`}
            diceText="d20"
            hint={`填入感知（察觉）检定 d20 骰面，系统按 d20 ${bonus >= 0 ? '+' : '-'} ${Math.abs(bonus)} 对抗全图躲藏者的隐匿值`}
            min={1}
            max={20}
            confirmLabel="发起搜索"
            onConfirm={(d20) => {
              const target = searchRollTarget;
              setSearchRollTarget(null);
              searchFor(target, d20);
            }}
            onClose={() => setSearchRollTarget(null)}
          />
        );
      })()}

      {/* 强制位移弹窗（参战者面板 / 沙盘双击面板共用入口） */}
      {forcedMoveTarget && record && (() => {
        const bg = battlegroundStore.get(record.id);
        const positions: Record<string, { col: number; row: number } | null | undefined> = {};
        (bg?.tokens ?? []).forEach(t => { positions[t.combatantId] = { col: t.col, row: t.row }; });
        const candidates = record.combatants.filter(c => c.id !== forcedMoveTarget.id);
        return (
          <ForcedMoveDialog
            target={forcedMoveTarget}
            candidates={candidates}
            combatantPositions={positions}
            defaultOriginId={null}
            onClose={() => setForcedMoveTarget(null)}
            onConfirm={(req) => {
              const result = executeForcedMove(record, req);
              if (!result) return;
              const targetName = forcedMoveTarget.name;
              const origin = record.combatants.find(c => c.id === req.originId);
              const rel = origin ? `（参照：${origin.name}）` : '';
              const text = result.path.length > 0
                ? `${targetName}被强制位移${rel}：${result.path.length} 格${result.truncated ? '（途中受阻截断）' : ''}，落点 (${result.finalPos.col},${result.finalPos.row})`
                : `${targetName}被强制位移${rel}：无路可推，原地不动`;
              recordOperation(forcedMoveTarget.id, text, 'move');
              setForcedMoveTarget(null);
            }}
          />
        );
      })()}

      {/* 战斗结束回传弹窗 */}
    <CombatCommitModal
      recordId={sessionId}
      isOpen={commitModalOpen}
      onClose={() => setCommitModalOpen(false)}
    />
    </div>
  );
}
