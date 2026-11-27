# 战斗状态持久化进 CombatRecord — 进度

## 阶段状态

- [x] 侦查：statusManager 内存单例 / CombatRecord 白名单重建 / 快照三处还原点 / 云备份 syncListDiff
- [x] design.md
- [x] P1：statusManager `getActiveCombatInstances` / `loadCombatInstances`；types StatusInstance 字段（record + TurnSnapshot）；combatStore 白名单重建
- [x] P2：`turnSnapshot.ts` 抽取（useRoundTurn / usePlayback 共用建快照，消除两处重复）
- [x] P3：`statusPersistence.ts` 桥接（hydrate / persist / 防抖订阅）+ CombatSession 集成
- [x] P4：三处还原点（applyRollback / finalizeExitPlayback / startPlaybackFromBeginning）
- [x] 探针 `probe-status-persistence.cjs` 10 断言全绿；回归 hidden-per-observer 19 / search 20 / status-projection 11 / reaction 72 / manual-damage 23 全绿
- [ ] tsc + build → 合 main 推送

## 已决策

- 只持久化活跃实例（历史结束即弃），避免记录无限膨胀
- 水合每场战斗仅一次（模块级 Set）；记录无字段时保持内存现状（老数据零迁移）
- 写回防抖 100ms + 卸载补写；内容 JSON 相等跳过（防 updatedAt 空转引发云同步风暴）
- legacy TurnSnapshot 缺 statusInstances 时回溯保持内存现状（不强制清空）
- statusManager 保持无存储依赖（持久化桥单向 import）

## 探针踩坑记录

- 探针内多次动态 import 不同模块路径可能命中 Vite HMR 查询串产生双模块实例（store 双缓存互相覆盖）——探针前必须冷重启 dev server
- 白名单重建必须校验 scope 合法值，否则注入的无 scope 脏实例会被 Coerce 保留

## 下一步

tsc + build → 合 main 推送。后续待立项：无（三项战斗状态改造全部完成）。
