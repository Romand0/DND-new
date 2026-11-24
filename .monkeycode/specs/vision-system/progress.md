# Progress — 视野系统（vision-system）

## 阶段状态

- **P1 掩护完成**（2026-11-23，`61ec87f` 推送）：23 断言探针全绿，run.sh 29/29。
- **P2 光线/感官完成**（2026-11-23，main `77bdc47` 推送）：probe-vision-p2 34 断言全绿 + p1 23 断言回归绿，build 通过。
- **P3 隐身/决策点完成**（2026-11-24，feature/vision-p3-hide-decision）：probe-vision-p3 21 断言全绿 + p1 23 / p2 34 回归绿，tsc + build 通过。

## P1 已交付（掩护）

- 数据层：`Combatant.coverTier`（types/combat.ts 导出 CoverTier）；`visionRules.ts` 纯函数层（isLosBlocked paintedCells Bresenham / suggestCoverHint / getCoverBonus / getCoverSaveBonus Dex 限定 / getAmbientLightTier P2 骨架）；`computeCombatantAc` 掩护加值并入（PC/NPC 双路径，NPC 分支原提前 return 已补掩护；`coverOverride` 第 4 参供弹窗单次覆盖）
- UI：CombatAttackModal 掩护覆盖下拉（跟随标注/覆盖为无/半身/3q/total）+ total 阻断 getAttackStatus（「目标处于全身掩护，无法直接瞄准」）+ 视线遮挡几何提示（CombatSession 两处调用传 paintedCells）；SpellCheckStep Dex 豁免自动填入并入掩护修正 + 提示行 + 法术攻击 AC 场景 total 阻断；CombatantInfoPanel 状态页掩护等级卡片（DM 专属）
- 探针：probe-vision-p1.cjs 23 断言（LOS 7 用例 / 提示 2 / 加值矩阵 6 / AC 双路径 5 / 环境档位 2）

## P1 设计修正（实现期决策）

- **掩护修正走确定性数据读取**：detector 通道只产优劣势（AdvantageResult），AC/豁免加值类不适用——cover-ac-note/cover-save 检测器方案作废，改弹窗/豁免结算点直读 coverTier。detector 留给 P2/P3 自动优劣势（light/unseen）。
- **几何只提示不裁定**：isLosBlocked 单线判定无法区分半身/3q（裁定量），suggestCoverHint 输出单级「存在遮挡」提示；total 阻断也由 DM 标注驱动。
- **NPC 路径修正**：computeCombatantAc NPC 提前 return 分支必须同步加掩护加值（探针 19/21 失败定位）。
- **探针踩坑复现**：改源码后不冷重启 dev server 会大面积假 FAIL（HMR 腐化，states/todos 落账断言全空）——冷重启后 29/29 全绿，与 AGENTS.md 8.1 经验一致。

## P2 已交付（光线/感官）

- 数据层：`Battleground.ambientLight/lightCells`（三桶 bright/dim/darkness，与 paintedCells 同构；store `setLightCell` 桶间互斥、同档重涂=擦除、`setAmbientLight`、`clearLightCells`；load 兜底 ambientLight='bright' 与空桶）；`Combatant.senses`（darkvision/blindsight/truesight/tremorsense）
- 引擎：visionRules `getLightTierAt`（区域 > 环境，返回 source）/`getEffectiveTierAt`（感官降档 truesight 无视光照、blindsight 黑暗→明亮、darkvision 黑暗→微光，优先级 truesight>blindsight>darkvision）/`canSenseInDark`（tremorsense/blindsight 尺数 ≥ 距离格×5）/`parseSenses`（中文感官文本正则）
- 检测器：`environment-light`（攻击场景双向黑暗可见性，ATTACK_SCENES 四场景，互不可见时优劣势抵消交给 resolveRollMode）、`environment-dim`（仅 skill_check+perception，有效档位 dim 时劣势）；AdvantageContext 增 `skillKey`/`battleground`；AdvantageSourceKind 增 `environment`
- UI：Battleground 环境档位三态按钮 + 光照画笔三档（DM 侧，非投影非放映）+ 光照格微光/黑暗遮罩 + 橡皮擦光照 + modeHint；CombatAttackModal/CombatSession 传 ambientLight/lightCells 入优劣势上下文；SpellCheckStep 补 attackerPos/targetPos/distanceCells/battleground（法术链黑暗判定贯通）；NpcCreator 模板 senses → parseSenses → 入战结构化
- 探针：probe-vision-p2.cjs 34 断言（档位解析 4 / 降档矩阵 6 / canSenseInDark 4 / parseSenses 5 / environment-light 5 / environment-dim 4 + 注册 2 / 三桶写读 5）

## P2 设计修正（实现期决策）

- **lightZones → lightCells 三桶**：design.md 原设想 `lightZones{id,cells,tier,label}` 数组，实现改三桶字符串列表（与 paintedCells 同构，画笔/渲染/序列化/擦除统一，桶间天然互斥）；design 语义（区域覆盖环境）不变。
- **无光源中心概念**：v1 不做「光照半径随距离衰减」，感官尺数只用于 canSenseInDark 覆盖判定与展示；truesight 一律视为无视黑暗/微光。
- **环境档位不做全局压暗**：只渲染格级 lightCells 遮罩（明亮区不压色），避免与地形区域色冲突。
- **微光察觉劣势限定 perception**：其他技能检定不受微光影响，靠 AdvantageContext.skillKey 区分。
- **兜底口径**：parseSenses 全部失败返回空对象（DM 面板可后续录入），不抛出。

## P3 已交付（躲藏隐身/决策点）

- 引擎：visionRules `canSeeThroughHide`（truesight 全窥、hidden 额外 blindsight、尺数≥dist×5）；statusLibrary `hidden`/`invisible` 条目（无自动解除效果）；advantageRules `getVisibilityState` + `detectUnseen`（detector `unseen`：hidden 与 ATTR 攻击场景双向判定，双向优势抵消交给 resolveRollMode）
- 落账：TurnCommitOp `{kind:'hide'}`；turnCommitApply hide 分支（applyEffect hidden + addTurnTodo + consumeAction）；PlayerActionReviewCard hide 文案
- 交互：CombatantInfoPanel hide 动作 + onHideClick → Battleground onPanelHideClick；CombatSession `hideFor`（1 动作挂 hidden + 观察者被动察觉 DC 提示）与 `breakHidden`（四处攻击回调一攻揭晓）
- 决策点（R5）：`functions/api/table/decision-request.ts`（登录 + 角色绑定校验 + 定向投 DM）+ `decision-result.ts`（isAdmin + to_user_id + batch 原子回填）；`findDmUserId`（campaign_members role='dm' → is_admin=1 回退）；前端 sendDecisionRequest/sendDecisionResult + RoundTable DecisionRequestCard（DM 裁定）；玩家端 MyTurnPanel「请求裁定（躲藏）」按钮 + 等待标记 + PlayerSpectate 发件箱轮询回执（批准自动记入 hide op，驳回提示理由）
- 探针：probe-vision-p3.cjs 21 断言（canSeeThroughHide 矩阵 / 状态库 / unseen 双向判定 / 注册）

## P3 设计修正（实现期决策）

- **决策点复用 table_messages**：不新建 pendingDecisions 表/字段；新 type decision_request/decision_result + payload 扩展，status/reply_message_id 复用，DM 归属 findDmUserId。
- **等待标记放玩家端组件态 + 圆桌发件箱轮询**：玩家请求不阻塞回合继续，回执到达后自动补 hide op；驳回不改动已记录的其他操作。
- **一攻揭晓显式 breakHidden**：hidden 状态无自动解除 effect，四处攻击回调（主攻击两处 + 反应两处）统一调用，避免依赖隐藏状态生命周期隐式规则。

## 下一步

1. 远程不可达时（gnutls handshake 失败）稍后重试 push；本地 feature 分支已提交 5 个原子 commit 并合入 main 验证通过。
2. 后续可扩展 decisionKind（如「借机攻击确认」「专注打断」）——后端 DECISION_KINDS 白名单 + 前端按钮即可。

## 验证命令

```bash
npx tsc -p tsconfig.app.json --noEmit
npm run build
NODE_PATH=$(npm root -g) node scripts/probes/probe-vision-p1.cjs   # 23 断言
NODE_PATH=$(npm root -g) node scripts/probes/probe-vision-p2.cjs   # 34 断言
NODE_PATH=$(npm root -g) node scripts/probes/probe-vision-p3.cjs   # 21 断言
```

## 关键上下文

- AdvantageContext 已含 attackerPos/targetPos/distanceCells（CombatAttackModal.tsx:478-501）；SpellCheckStep 缺三字段待补传（P2 前置）
- paintedCells 为 "col,row" 墙体语义（types/battleground.ts:129-130），遮挡几何唯一数据源；CombatSession 从 battlegroundStore.get(record.id) 读取传弹窗
- NPC senses 纯文本（NpcTemplate.senses），381 处条目，正则解析降级手动录入（P2）
- PC darkvision 派生链现成：deriveDarkvision（passiveCombatRules.ts:207-223）→ useInitiative.ts:95（P2 迁入 senses.darkvision）
- 圆桌信箱现成：request 不可变仅 status/replyMessageId 可回填；checkPipeline skill_check stealth 已通（P3）
- 决策点等待标记：record.pendingDecisions（load 兜底），回合末审批展示摘要（P3）
- computeCombatantAc 第 4 参 coverOverride 语义：undefined=读参战者标注 / null=覆盖为无 / 值=临时等级；ProvingDashboard 同函数自动带上掩护

