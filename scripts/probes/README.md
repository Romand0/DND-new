# 回归探针

无头 Playwright 脚本，覆盖战斗沙盘、被动规则与反应机制。默认假设 dev server 在 5174。

```bash
# 全部跑（静默：只出 FAIL + 汇总）
BASE_URL=http://localhost:5174 sh scripts/probes/run.sh

# 单个跑，看完整 PASS 列表
NODE_PATH=$(npm root -g) node scripts/probes/probe-reaction.cjs
```

约定：
- 新选择器先在临时 debug 脚本验证，再补进全量探针（一次全量运行约 30s）
- 探针依赖 `/src/**` 动态 import，`BASE_URL` 变化时同步改 store 注入逻辑
- 改了源码先冷重启 dev server，避免 HMR 模块实例分裂造成假失败
