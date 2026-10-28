
[Project Knowledge Summary]
- Date: 2026-10-17
- Context: Discovered by Agent while performing CombatSession P2-2 refactor verification
- Category: Build Methods
- Instructions:
  - 本仓库 tsconfig.json 是 solution-style（只有 references），`npx tsc --noEmit` 实际不检查任何源文件，会假通过
  - 真正的类型门禁是 `tsc -b`（npm run build 的一部分）或 `npx tsc -b --force`（全量重查，绕过增量缓存）
  - 改动共享类型/被 import 的文件后，务必用 `tsc -b --force` 验证，增量缓存会掩盖下游文件的类型错误

[Project Knowledge Summary]
- Date: 2026-10-24
- Context: Discovered by Agent while reproducing cast-button bug with headless browser
- Category: Troubleshooting & Debugging
- Instructions:
  - 本地全栈复现环境：`npx wrangler pages dev dist --port 8788`（先 npm run build；.dev.vars 提供 JWT_SECRET/DM_TOKEN）；改 functions/ 后端代码需重启 wrangler 终端
  - 本地 D1 文件：.wrangler/state/v3/d1/miniflare-D1DatabaseObject/910235ff9a47e17f35f828f72b94875edb99139a69e3b9ee267b5914693dab4e.sqlite（无 sqlite3 CLI，用 python3 sqlite3 模块操作）
  - 本地探针账号 probe-test/probe12345（首个注册用户自动 is_admin）
  - 无头浏览器验证：playwright 全局安装，require(path.join(npm root -g,'playwright'))，launch 须 executablePath=/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome + --no-sandbox；每次新 browser context localStorage 独立，需重新登录/生成试验场人偶
  - 试验场无头复现路径：/combat 点「试验场」→「敌对人偶」→ 点按钮「试验体·敌N」（芯片本身就是 button）→ 点沙盘(160,585) 放置 → 双击(160,585) 打开信息面板 →「操作」tab；模拟模式无参战者表格（放映模式才渲染 InitiativeTable）
  - 排查 UI 不可点 bug 先核对组件实例接线：同一弹窗组件可能被多处挂载（CombatSession IIFE 面板 vs Battleground 双击面板），回调 prop 漏传一处即该路径全灰

[Project Knowledge Summary]
- Date: 2026-10-24
- Context: Discovered by Agent while building proving ground weapon presets and debugging attack modal
- Category: Troubleshooting & Debugging
- Instructions:
  - NpcAttack.normalRange / maxRange 单位是英尺（parseWeaponData 从「弹药(150/600尺)」解析），CombatAttackModal.getRangeInfo 直接当 feet 用；近战武器（徒手/长剑）不要传 normalRange，否则 isRangedWeapon 误判为远程、近战射程段被吞、显示「不在射程内」
  - CombatAttackModal 攻击列表来源：character?.attacks 非空才用，否则回落 attacker.attacks——影子卡 attacks 恒为空，武器条目在 combatant.attacks 上
  - 徒手击打已豁免「未手持/手部不可用」检查（CombatAttackModal getAttackStatus）
  - 沙盘棋子位置存 battlegroundStore（localStorage dnd-battlegrounds 的 tokens），不在 combatant.tokenPos；试验场放置流程 = 点「未放置」区芯片（高亮 bg-primary 确认选中）→ 点沙盘格子
  - 无头测试定位沙盘格子：querySelector('div.grid.origin-top-left') 读 children[0] 的 boundingRect（cell 约 22px）算目标格中心坐标，勿用视觉估算坐标

[Project Knowledge Summary]
- Date: 2026-10-24
- Context: Discovered by Agent while E2E verifying blade-ward flow cast resistance in proving ground
- Category: Troubleshooting & Debugging
- Instructions:
  - 无头 E2E 沙盘交互的格心坐标必须每次实时读取：战斗日志每新增一条 OperationLogPanel 增高约 66px，沙盘网格整体下移，缓存 geo 会导致后续点击命中错误格子（棋子 onDoubleClick 收不到事件）
  - 沙盘 E2E 选择器要点：攻击方式条目是 div.rounded-lg.border.p-3（非 button）；CombatantInfoPanel 根元素是 fixed inset-0 z-50 全屏透明遮罩，面板开着时沙盘所有点击被挡，须先点面板标题栏 svg.lucide-x 按钮关闭；攻击检定按钮链 = 填 d20 →「确定」→「确认命中，进入伤害结算」→ 伤害弹窗填骰值 →「计算」
  - 云端 POST /api/spells 导入的法术可能缺 components 字段，cast_start 读 components.verbal 会崩——已全链路加可选链防护；自造测试法术记得带 components
  - 防护类法术流程施放 → 抗性落地链路已 E2E 验证通：流程施放（FlowRunStep 执行流程）→ statusManager.applyEffect → 战斗日志「获得抗性」→ 敌方近战攻击 CombatDamageModal 结算减半（8→4）→ HP 扣减正确；用户端若无效优先排查浏览器缓存旧 bundle（硬刷新）与流程节点 config 参数（affinityKind/damageTypes/sourceKind 拼写）

[Project Knowledge Summary]
- Date: 2026-10-25
- Context: Discovered by Agent while fixing status duration expiring by real time instead of rounds
- Category: Troubleshooting & Debugging
- Instructions:
  - 状态过期双轨制（statusManager）：expirePolicy=manual（模拟模式，永续待 StatusAttachPanel 手动取消）vs rounds（放映模式，expiresAtRound=startRound+durationRounds 绝对回合判定）vs combatantTurn（持续到锚定参战者下一次回合开始，剑刃防护 2024 版语义）；真实时间戳 expiresAt 仅保留给 minutes/hours 型 duration 定义
  - applyEffect 落地时按 record.mode 定性过期策略；getEffects/getActiveStatuses 的 StatusRoundCtx（currentRound/turnCombatantId/turnRound）由调用方经 getCombatRoundCtx(recordId)（combatAffinities 导出）从 record.playbackState.currentTurn 推导，模拟模式无回合上下文 → 保守不过期
  - combatantTurn 判定：currentTurn.combatantId === anchorCombatantId && turnRound >= startRound + (turnCount ?? 1)（N=1 下一回合，2=下下回合…同轮内不会再次轮到同一人）；无 turnCombatantId 上下文时 advanceRound 清扫跳过，靠 getEffects 查询时惰性判定
  - 流程 apply_effect 节点 config.durationType='untilCasterTurn' + durationTurns=N 表示「直到施法者第 N 个回合」，FlowRunStep → CombatSession onFlowResolved 透传 untilNextTurn + anchorCombatantId=spellModal.caster.id + turnCount
  - 回合推进衰减入口 useRoundTurn.advanceTurn 里 globalStatusManager.advanceRound(record.id, { currentRound: nextRound })

[Project Knowledge Summary]
- Date: 2026-10-25
- Context: Discovered by Agent while E2E testing playback-mode flow cast (combatantTurn expiry) in proving ground
- Category: Troubleshooting & Debugging
- Instructions:
  - 放映模式开始放映链：切「放映模式」按钮 → 点先攻表格格子 ▶ 按钮 → 突袭弹窗（「确定（0）」全角括号）→ 当前回合横幅出现
  - InfoPanel 关闭必须点标题栏的第一个 svg.lucide-x；状态条目的删除 X 是面板内最后一个 lucide-x，用 .last() 会误删状态
  - 流程施放两段式：法术弹窗选法术 →「执行流程」（跑节点）→「确认应用」（onFlowResolved 落地状态）
  - 棋子定位用 [title*="参战者名"]（格子 title=名字）；施法会消耗动作（ACT 0），新回合自动恢复

[Project Knowledge Summary]
- Date: 2026-10-25
- Context: Discovered by Agent while E2E testing flow-stage target picker and concentration-status linkage (protection from energy)
- Category: Troubleshooting & Debugging
- Instructions:
  - InfoPanel 打开后默认停在「快捷」tab；专注卡片与 StatusAttachPanel（状态清单/附加表单）在「状态」tab，E2E 找状态相关按钮前先点「状态」tab
  - 状态断言必须收窄到 InfoPanel 内文（div.fixed.inset-0.z-50.last() 的 innerText）：整页 innerText 会被战斗日志历史行与 StatusAttachPanel 附加表单的静态「抗性/免疫/易伤」按钮文案污染，产生假阳/假阴
  - 放映模式开参战者面板：列表卡片 button[title*="参战者详情"]（hasText 过滤名字）比沙盘格双击稳（双击第二次点击可能落在弹出的遮罩上把它关掉）
  - 专注-状态联动：concentration.statusIds 记录流程附加的状态实例 ID，combatStore.removeConcentrationStatuses 在五处结束路径统一 declareEnd；替换/重施专注法术时旧状态同步结束
  - 已修复存量 bug：CombatSession 此前未向 CombatSpellModal 传 recordId，弹窗内 allCombatants/activeConcentration 永远退化为 [caster, target] fallback（触及类法术换目标列表只有施法者一人）

[Project Knowledge Summary]
- Date: 2026-10-25
- Context: Discovered by Agent while diagnosing user report "flow badge disappeared, casting degraded to manual" (root cause: user deleted/recreated the character; chain silently misaligned)
- Category: Troubleshooting & Debugging
- Instructions:
  - 流程徽标/流程施放三环链路：角色卡法术条目（存名字）→ CombatSpellModal knownSpells 按名字从 spellStore 缓存解析出法术对象（带 id）→ fetchBindingsBySpell(spell.id) 查云端绑定。任一环错位（角色/缓存陈旧、id 脱节）= 徽标消失 + 静默退回手动管线，且全部 silent catch 无诊断信息（现已加 console.warn，前缀 [CombatSpellModal]）
  - 排查口诀：浏览器 Console 跑 fetch('/api/spells') + fetch('/api/bindings/by-spell/'+id) 对照 id 是否对得上；徽标与手动退化同源（flowBindings Map 空），编译器错误只影响流程执行环节，无法让徽标消失
  - spellStore 缓存刷新时机 = 法术弹窗挂载时 fetchAll()（云端真值覆盖缓存），非 proving ground 的 knownSpells 依赖 character.spells（名字数组）+ byName 匹配

[Project Knowledge Summary]
- Date: 2026-10-26
- Context: Discovered by Agent while implementing the check-modifier (检定奖惩) engine end to end
- Category: Troubleshooting & Debugging
- Instructions:
  - 检定奖惩双载体：状态型走 globalStatusManager 实例 Effect(type='check_modifier')，随状态 duration/专注/手动解除过期；次数型走 Combatant.pendingCheckModifiers，每次检定确认 -1、归零即移除（expireRound=-1 不过期）。引擎 src/data/checkModifierRules.ts 纯只读检测，消费由调用方确认后执行
  - 与优劣势互补：优劣势决定掷几个 d20 取哪个，奖惩在最终 d20 上做数值平移，两者可叠加（优势 + 祝福术 = 2d20 取高再 +1d4）
  - 惩罚恒强制：引擎与编译器都把 penalty 的 forced 强制为 true（忽略配置的 false）；奖励的 forced=false 时由 CheckModifierPanel 开关控制是否启用（enabledSourceKeys 传 status:<instanceId> / pending:<pendingId>）
  - 新增奖惩类法术只需在 apply_effect 节点配 6 个 modifier* 参数（方向/骰式/固定值/范围/强制/次数），引擎与状态库零改动；编译器纯计算不落库，CombatSession.onFlowResolved 统一落地（uses>0 → addPendingCheckModifier，否则 applyEffect）
  - parseDice 对无法识别的表达式不抛错而是回落 {count:1,sides:0}，编译器必须显式判定「有骰数无面数」为非法，否则签出永远掷 0 的奖惩

[Project Knowledge Summary]
- Date: 2026-10-26
- Context: Discovered by Agent while E2E testing attack-roll modifier panel and counter decrement
- Category: Troubleshooting & Debugging
- Instructions:
  - 攻击检定入口在 InfoPanel「操作」tab（ALL_ACTIONS 里的攻击按钮），攻击列表条目是 div.rounded-lg.border.p-3 而非 button，用 div 选择器点击才进检定阶段
  - 攻击弹窗必须收到 recordId 才会消费次数型奖惩/优劣势 pending 标记；CombatSession 传参漏了 recordId 时面板能显示奖惩但次数永不扣减（已修）
  - CombatantInfoPanel 的 combatant 若是打开时快照，面板自身发起的变更（附加奖惩/状态/手持）不会反映；Battleground 与 CombatSession 两处渲染都必须从最新 combatants 实时派生（liveCombatant）
  - 攻击相邻格才可用：placed 棋子距离 2 格时所有攻击都显示「不在射程内」或「未手持」，E2E 需把目标放在攻击者相邻格
  - E2E 断言用固定顺序：附加奖惩 → 状态 tab 见「次数型奖惩（1）」→ 操作 tab 攻击 → 徒手击打 → 填 d20 + 奖惩骰 → 确定 → 确认命中 → 重开面板验「剩余 2/3 次」
  - 纯引擎/编译器单测无需浏览器：jiti（node_modules/jiti）可直接 import .ts + alias '@'，补 globalThis.localStorage 桩与 context.results=new Map()，flow 边必须带 trigger:'on_complete'

[Project Knowledge Summary]
- Date: 2026-10-27
- Context: Discovered by Agent while implementing the status-driven advantage engine and flow advantage node end to end
- Category: Troubleshooting & Debugging
- Instructions:
  - 优劣势三层来源：自动检测器（registerDetector，目前 equipment/positional/pending/condition 四个）、待消费标记（Combatant.pendingAdvantageSources，确认后才消费）、手动覆盖（ManualMode，优先级最高）。合并规则 resolveRollMode：手动 > 自动；自动优劣势同时存在互相抵消
  - 通用载体设计：状态 Effect(type='advantage') 的 config 用 AdvantageEffectConfig{mode, scene, ability?, appliesTo:'self'|'incoming', label?, fromId?, fromName?}，一个类型覆盖所有场景（含 attack/check/save），新法术只需在 apply_effect 配 advantage* 参数，引擎与状态库零改动
  - appliesTo 语义是关键区分：self = 影响持有者自己掷骰（如中毒 → 自身攻击/检定劣势），incoming = 影响针对持有者的检定（如昏迷/麻痹/石化/震慑 → 攻击者获得优势）。detectCondition 双向扫描：roller 侧读 self，counterpart 侧读 incoming
  - 属性限制只在 ctx.saveAbility 存在时参与比对（豁免/属性检定场景）；攻击与技能检定传 undefined 时不限制
  - legacy 兼容：LEGACY_EFFECT_SCENE 把 attack_disadvantage/check_disadvantage/save_disadvantage/incoming_attack_advantage/own_attack_disadvantage 等固定类型映射到场景，老状态定义无需改写即可被统一引擎识别
  - 状态实例 effects 合并顺序：globalStatusManager.getEffects 合并 definition.effects + instance.metadata.effects（惰性过期），检测器一次遍历同时处理通用 advantage 与 legacy 固定类型
  - AdvantageContext 需要 recordId + roundCtx 才能读到战斗中真实状态（getCombatRoundCtx(recordId) 仅放映模式返回回合上下文，模拟模式返回 {}）；漏传会导致状态型优劣势在战斗中静默失效
  - 检定主体语义易错点：豁免场景的「掷骰方」是 target 而非 caster。SpellCheckStep 构造上下文时 roller=save?target:caster、counterpart 取另一方，attacker/attackerCharacter 都要跟着切换，消费 pending 用 roller.id（曾用 caster.id 导致目标身上的标记漏检漏消费）
  - 流程 effectType='advantage' 沿用 status 的 durationType 语义（rounds / untilCasterTurn），非法 mode/scene/appliesTo/durationType 记 failure 日志而非静默；编译器纯计算不落库，CombatSession.onFlowResolved 统一落地
  - 手动附加面板（StatusAttachPanel）的优劣势区走 statusId='advantage' + instanceEffects 路径，与流程节点共用同一套状态生命周期，避免两套数据源
  - 另修存量 bug：CombatantInfoPanel 的 attacks 取 character?.attacks || combatant.attacks 时空数组为 truthy，导致试验场影子卡武器列表空白；改为 length>0 判定后回落（与 CombatAttackModal 一致）

[Project Knowledge Summary]
- Date: 2026-10-28
- Context: Discovered by Agent while implementing the terrain zone system (paint editor + flow node + combat effects)
- Category: Troubleshooting & Debugging
- Instructions:
  - 沙盘地形区域数据挂在 Battleground.zones（localStorage dnd-battlegrounds），不是 CombatRecord：区域是战斗临时数据，随沙盘走、可随战斗丢弃；规则基线 PHB2014 油瓶（5 尺方形 / 2 轮 / 5 点火焰非魔法 / 同生物每回合一次）
  - 「进入区域」伤害在 Battleground.moveToken 里通知父层（onTokenMoved），只有 from 存在且换格才触发——初次放置不伤，避免摆放阶段被误伤；点击与拖拽两条路径都走 moveToken
  - 「回合结束于区域内」由 useRoundTurn 完成回合前调 resolveEndTurnZone；新回合 expireZonesForRound 清理过期区域（expireRound < currentRound）并裁掉非当前回合的 hitRounds（否则上回合记录会永久阻止再次触发）
  - 同回合同区域去重双保险：useZoneEffects.firedRef（会话内即时，不等 store 回写）+ zone.hitRounds（跨帧持久）；模拟模式 round=0 时两层都跳过，因为没有回合概念
  - 编译器 zone 节点纯计算不落库：只产出 cells + 规格 + durationRounds，createdRound/expireRound 由 CombatSession.onFlowResolved 按当前回合补齐（模拟模式 createdRound=0 且不设 expireRound = 手动移除）
  - durationRounds 是区域规格字段（回显用），过期判定只认 expireRound；两字段都要在 normalizeZone 里兜底，否则老数据/新数据回显会丢
  - 绘图编辑器区域统一 source='绘图'，保存时只替换这一批，保留法术生成区域；绘图区域无回合概念（永久，DM 手动移除）
  - 流程 zone 节点依赖 context.positions 取目标坐标，未放置在沙盘时记 failure「目标未放置在沙盘上」。注意：CombatSession 的 combatantPositions 曾只依赖战斗记录字段，棋子移动不触发重算导致流程读到过期坐标（表现为「0个目标位置受影响」）——已加 battlegroundStore 订阅 + battlegroundTick 依赖
  - zone 落地的伤害走统一 handleApplyDamage（sourceKind='effect'），抗性/易伤/免疫在 zoneRules.computeZoneDamage 内经 resolveDamage 预结算，不要绕过
