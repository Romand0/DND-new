
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
