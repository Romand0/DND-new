
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
- Context: Discovered by Agent while diagnosing user report "flow badge disappeared, casting degraded to manual" (root cause: user deleted/recreated the character; chain silently misaligned)
- Category: Troubleshooting & Debugging
- Instructions:
  - 流程徽标/流程施放三环链路：角色卡法术条目（存名字）→ CombatSpellModal knownSpells 按名字从 spellStore 缓存解析出法术对象（带 id）→ fetchBindingsBySpell(spell.id) 查云端绑定。任一环错位（角色/缓存陈旧、id 脱节）= 徽标消失 + 静默退回手动管线，且全部 silent catch 无诊断信息（现已加 console.warn，前缀 [CombatSpellModal]）
  - 排查口诀：浏览器 Console 跑 fetch('/api/spells') + fetch('/api/bindings/by-spell/'+id) 对照 id 是否对得上；徽标与手动退化同源（flowBindings Map 空），编译器错误只影响流程执行环节，无法让徽标消失
  - spellStore 缓存刷新时机 = 法术弹窗挂载时 fetchAll()（云端真值覆盖缓存），非 proving ground 的 knownSpells 依赖 character.spells（名字数组）+ byName 匹配
