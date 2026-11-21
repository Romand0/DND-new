# 项目记忆：操作 / 构建 / 排障 / 协作

> 只记「怎么做」；架构与设计细节见 `AGENTS.md` 与 `docs/agents-patterns.md`，不在此重复。

## 构建与云端
- 根 tsconfig.json 是 solution-style（只有 references），`npx tsc --noEmit` 空跑假通过；真门禁 = `npm run build`（tsc -b + vite），共享类型改动用 `tsc -b --force`；单域快查 `npx tsc -p tsconfig.app.json --noEmit`
- TS 6.0.3 + strict:false：判别式联合取反不收窄（TS2339），用 `x.ok === false` 或 `'k' in x`
- functions/ 相对导入层数 = 文件在 functions/api/ 下的深度：api/xxx.ts→../_utils；api/xxx/yyy.ts→../../_utils；api/xxx/[p]/index.ts→../../../_utils；再深逐层累加（曾少算一层导致 CF 部署失败，本地 tsc 不查 functions/）
- 改 functions/ 后必须 `--bundle` 校验（默认 transform 不解析 import）：for f in $(find functions -name '*.ts'); do npx esbuild "$f" --bundle --packages=external --loader:.ts=ts --format=esm --outfile=/dev/null; done
- wrangler.toml 缺 pages_build_output_dir 警告无害（Pages 走 dashboard 构建）；真正阻塞部署的是 Functions 打包错误

## 本地全栈与无头测试
- `npx wrangler pages dev dist --port 8788`（先 build；.dev.vars 提供 JWT_SECRET/DM_TOKEN），改 functions/ 需重启
- 本地 D1：.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite（无 sqlite3 CLI，用 python3 sqlite3）
- 探针账号 probe-test/probe12345（首个注册用户自动 is_admin）
- Playwright 全局装：`NODE_PATH=$(npm root -g) node xxx.js`；chromium 需 `npx playwright install chromium --with-deps`；launch 加 --no-sandbox；每个 context 的 localStorage 独立，需重新注入登录态
- 绕过登录测页面：mock `**/api/auth/me` 返回 {user:{isAdmin:true}}、其余 `**/api/**` 返回 {items:[]}，addInitScript 注入 auth_token/auth_user/dnd-default:DND
- 纯引擎单测免浏览器：jiti（node_modules/jiti）直接 import .ts + '@' alias，补 globalThis.localStorage 桩；flow 边必须带 trigger:'on_complete'

## 试验场与沙盘 E2E
- 入口 button[title*="沙盒试验场"]；进入会重置该 CombatRecord（combatants 清空、mode=simulation），store 注入必须在进入之后
- setRulebookScope 是 SPA 内存变量，须在 goto /combat 后 evaluate，整页刷新丢失
- InitiativeTable（⚡/专注/激励徽标）只在放映模式渲染；测徽标先 combatStore.update(rec.id,{mode:'playback'})
- 边改代码边跑 E2E：Vite HMR 让动态 import('/src/x.ts') 拿到另一模块实例（hook 替换无效、写入丢失），重跑前冷重启 dev server；失败先最小化复现区分真实 bug 与 HMR 污染
- dev server 长时间运行 + 大量 HMR（尤其 merge 改写多文件后）会进入腐化态：探针大面积无关 FAIL、参战者未落库、update 日志为空——用 `npm run dev -- --port 5174 --force` 冷重启（绕过 node_modules/.vite 磁盘缓存）即恢复，先重启再排查
- chromium「随机」Target closed / 渲染空页 = 容器缺字体：必须 `apt-get install -y fontconfig fonts-wqy-zenhei`；缺字体时 Skia FATAL（SkFontMgr_FontConfigInterface Not implemented），DEBUG=pw:browser 可见；与内存/代码无关
- 探针播种 localStorage 必须走 ctx.addInitScript（先于应用脚本）：页面加载后 evaluate 播种会被 store 模块 fetchRemote 的镜像回写竞态清掉（模块读的旧内存覆盖新种子）
- 排查疑似回归：起 git worktree 挂基线提交 + 软链 node_modules + 独立端口 dev server 跑同款探针对照，区分「真回归」与「陈旧 dev server」
- 沙盘坐标：querySelector('div.grid.origin-top-left') 的 children[0].boundingRect（cell≈22px）；坐标每步实时读——日志每增一行网格下移≈66px，缓存 geo 会点空格。默认 Playwright 视口 720 高时模拟模式日志可把网格顶到屏外（y≈689），`mouse.dblclick` 点空而 grid 仍在 DOM（表现为「操作」按钮超时，非 children of null）
- 棋子位置存 battlegroundStore（dnd-battlegrounds.tokens），不在 combatant.tokenPos；放置 = 点「未放置」芯片（bg-primary 高亮）→ 点沙盘格
- 移动棋子可靠路径 = 点棋子格选中 → 点目标空格（白圈长按拖拽是攻击/拾取语义）
- 面板遮挡：CombatantInfoPanel 根是 fixed inset-0 z-50，开着时沙盘不可点；关闭点标题栏 svg.lucide-x（状态条目的 X 是最后一个，.last() 会误删状态）
- 状态断言收窄到 `div.fixed.inset-0.z-50.last()` 的 innerText，整页 innerText 会被战斗日志/附加表单静态文案污染
- 攻击链：InfoPanel「操作」tab → 攻击条目 div.rounded-lg.border.p-3（非 button）→ 填 d20「确定」→「确认命中，进入伤害结算」→ 伤害弹窗填值「计算」；相邻格才可攻击
- 放映模式开面板用列表卡片 button[title*="参战者详情"]；模拟模式用日志条芯片 `button[title="查看参战者信息"]`（filter hasText 名），比双击沙盘格稳。芯片面板接 handleFeatureUse，与沙盘双击面板等价
- 技能嵌套弹窗（HealRollModal / DiceInputModal / FeatureAoeSaveModal / Conv / CheckModifier）必须 z-[60]，盖过 InfoPanel 的 z-50，否则确认按钮被 `grid grid-cols-2` 操作区分流拦截
- 试验场数据：种子职业 id=cletic/monk/wizard；职业 slots keys「1环」..「9环」→ levelN；武僧无甲防御=10+敏+感知
- reload 后 dblclick 打参战者面板的 UI 交互链在沙盘 token/grid 水合时序上偶发失效（token 不渲染、现象漂移，重试无效）——引擎/数据断言改用 evaluate 直调 executeFeatureChannel/applyTurnCommit（池扣 consumeFeatureUse + 槽扣 consumeBonusAction(recId,cid,'playback') 后再调 runner），UI 接线留手动验证
- statusManager（globalStatusManager）纯内存无持久化：探针 evaluate 埋的状态标记 page.reload() 即丢——UI 段（弹窗路由）沿用 evaluate 后的活页面，开面板前先关遗留 z-50/z-[60] 遮罩（点 button:has(.lucide-x)）
- 探针 newContext 默认 viewport 1280×720：沙盘 y≈744 的双击点落视口外（elementFromPoint 返回 null），探针统一 setViewportSize({width:1280, height:900})
- combatEvents/operationLog/rounds cells 跨探针运行持久累积：依赖「本次产生行」的断言（如 heal 明细）需在段 setup 清 combatEvents；live 模式结算行落 operationLog，rounds cell 双写是放映模式口径——断言先确认 record.mode
- 改 phb2014.json 等种子 json 会触发 vite 依赖重优化 → 页面模块图分裂（写丢/池拒绝/null.find、无 PAGE ERROR）：冷重启 dev server 即恢复，与 HMR 腐化同处理
- 怪物图鉴（npcTemplateStore）探针使用：先 `loadSeed('monsters')` 预热（fetchAll 会打云端 API，dev 未跑后端时用 loadSeed）；setRulebookScope 必须含「怪物图鉴 2014」——登录态下出版物条目按规则书集过滤，只给玩家手册会滤掉全部野兽
- characterStore.add() 返回完整对象：参战者 characterId 必须传 `pcChar.id`，直传对象会导致角色卡查找失败（特性按钮/属性全部静默消失）

## 战斗数据约定
- CombatRecord.combatants 与记录级字段都走白名单重建（combatStore.load）：新增 combatant 字段（reactionUsed/pendingReactions/bonusActions）或记录字段（resourceConsumption / combatEvents）必须同步白名单，否则刷新丢字段且下次 save 永久抹掉
- 严格资源消耗开关：combatant 扣槽（consumeCombatantBonusAction 等）只在 `record.resourceConsumption === true` 或放映时生效，关闭时静默跳过——探针构造记录必须显式开启
- 战斗内一切变更只写临时副本（equipmentChanges/spellSlotChanges/combatant 字段），角色卡全程只读，结算时统一并入；禁止立即写 characterStore
- 法术位扣减统一在收尾 handleFinishConfirm：characterStore.get 重读 used/max（useMemo 快照陈旧），used<max 才写
- 卷轴消耗复用 onConsumeMaterials 漏斗，scrollChildId 已在 materialEvaluation.consumption 时不追加（防双重消耗）
- 施法步骤机新增步骤三件套同步：types/castStep.ts + useCastSteps（build/initState/begin 三处，含 rebuild 依赖）+ SpellStepBar.STEP_LABELS
- 攻击列表来源：character?.attacks 长度>0 才用，否则回落 combatant.attacks（影子卡 attacks 恒空；空数组为 truthy 曾致列表空白）
- 近战武器不要传 normalRange/maxRange（parseWeaponData 按英尺解析，误判远程后近战射程段被吞）；徒手击打豁免「未手持/手部不可用」检查
- 云端导入法术可能缺 components，读 components.verbal 必须可选链；自造测试法术带 components
- 同一弹窗常被 CombatSession 与 Battleground 两处挂载，回调/参数漏传一处即该路径全灰（recordId 漏传曾致奖惩不消费）

## 状态 / 优劣势 / 检定奖惩
- 过期策略按 record.mode：manual（模拟，永不自动过期）/ rounds（放映，expireRound 绝对回合）/ combatantTurn（锚定参战者下次回合起）；真实时间戳 expiresAt 只留给 minutes/hours 型
- 状态读取需 recordId + roundCtx：getCombatRoundCtx(recordId) 仅放映模式有回合上下文，模拟模式返回 {} → 保守不过期；漏传导致状态型优劣势静默失效
- 优劣势合并 resolveRollMode：手动覆盖最高；同一掷骰上自动优劣势并存在互相抵消
- Effect.config.appliesTo：self = 影响持有者自己掷骰；incoming = 影响针对持有者的检定（昏迷/麻痹/震慑给攻击者优势）
- 豁免场景掷骰方是 target 而非 caster：roller=save?target:caster，消费 pending 用 roller.id
- 检定奖惩双载体：状态型 Effect(type='check_modifier') 随状态过期；次数型 Combatant.pendingCheckModifiers 每次 -1；惩罚恒 forced，奖励由 CheckModifierPanel 开关
- parseDice 无法识别时回落 {count:1,sides:0}，编译器必须显式判「有骰数无面数」为非法
- 新增奖惩/优劣势/抗性法术只需在 apply_effect 节点配参数，引擎与状态库零改动（编译器纯计算，CombatSession.onFlowResolved 统一落地）
- 地形区域数据挂 Battleground.zones（战斗临时，随沙盘走）；durationRounds 仅回显，过期判定只认 expireRound，两者 normalizeZone 都要兜底
- 「进入区域」伤害只在 from 存在且换格时触发（初次放置不伤）；同回合同区域去重靠 firedRef + zone.hitRounds 双保险；绘图区域 source='绘图'，保存只替换这批

## 法术弹窗 / 流程链 / 专注
- 流程徽标三环：角色卡法术条目（存名字）→ CombatSpellModal 按名字从 spellStore 缓存解析（带 id）→ fetchBindingsBySpell(spell.id)。任一环错位 = 徽标消失 + 静默退回手动；缓存刷新 = 弹窗挂载时 fetchAll()
- spellStore 读单条是 getById(id)（无 .get）；保存/读取受团组作用域过滤：campaignId=null 的条目要求 source ∈ setRulebookScope 列表（测试法术需 source:'玩家手册 2014'）
- 流程施放两段式：选法术 →「执行流程」→「确认应用」（onFlowResolved 落地）
- 专注-状态联动：concentration.statusIds 存状态实例 ID，removeConcentrationStatuses 在五处结束路径统一收尾
- 流程 zone 节点依赖 context.positions；CombatSession 需订阅 battlegroundStore（battlegroundTick）否则读过期坐标

## 职业 / 特性 / 种子
- 特性等级门槛权威口径 = getLevelFromExp(experience)（与顶栏同源），character.level 会脱节
- 职业种子缺「熟练项」块（extract-options.mjs 收集不到），已用 src/data/classProficiencies.ts 手录表兜底
- 书里技能名与 SKILL_LABELS 不一致：求生→生存、医药→医疗、游说→说服；候选表用标准名
- options 种子只在 OptionsPage fetchAll 加载，其他依赖种子的页面要 warmSeed('options')
- seedLoader 按索引.json 版本号缓存（seed:options:data/version），版本不变不发请求；索引 fetch 用 cache:'no-cache'
- 种子 traits 的 level 标注要求正文含「第X级时/起」，显示层解析必须复刻同款锚定正则
- mergeBaseline：仓库种子为唯一事实源；只有带 seedId 的显式覆盖云端赢，无 seedId 但 id 命中种子视为旧快照（种子赢）

## 反应引擎（P1-P3）
- 触发时机一律用数据声明：法术走 Spell.reaction、特性走 Feature.reaction（trigger/resolution/scope/slotLevel/prompt）；代码零法术名与效果逻辑
- 定义解析 resolveReactionDefinition：内置表优先，其次 `spell:<id>` / `feature:<名>` 运行时派生
- 命中窗口：onConfirmHit 先 detectReactions({kind:'attack'})，有反应则 pendingDamage 延后，伤害弹窗由 effect 在队列清空后打开
- 伤害窗口：onApplyDamage 先 detectReactions({kind:'damage'})，弹窗保持打开（reactionWindowDone 防重入），队列清空后再应用
- 施法窗口：onCastResolved/onFlowResolved 包 beginSpellCastWindow；有反应被行使时进入 pendingCastConfirm 让 DM 决定是否应用效果（反制）
- 检测器纯只读（不判次数/法术位），可用性在弹窗二次校验；无 characterId 参战者不扣法术位
- move / attack / damage / spell_cast 均已接插桩；玩家回合提交的攻击窗口在 turnCommitApply

## 用户指令
- git push 失败一次即停：执行完整 fetch+rebase+push 周期，仍被拒立即报告，不反复重试
- 消耗资源型验证（全量探针、构建）失败先定位原因再重跑，不做盲目重复
- 技能引擎「硬编码」语义（用户多次纠正）：种子静态条目直接携带引擎接收面格式化数据（骰值格式/渠道/资源），调用时直接灌入封闭处理器——指数据形态，非手写 TS 处理器
- 全周期自动化含数值填入：玩家唯一保留动作 = 线下掷骰 + 按提示填结果；引擎零暗骰（P3 heal 曾暗骰，已改 planHealAmount 纯计算 + HealRollModal 填值）；新增技能走 SPEC_DB 手写条目（数据入库 Agent 全责），提取器降级为规则书导入辅助
