
[Project Knowledge Summary]
- Date: 2026-10-17
- Context: Discovered by Agent while performing CombatSession P2-2 refactor verification
- Category: Build Methods
- Instructions:
  - 本仓库 tsconfig.json 是 solution-style（只有 references），`npx tsc --noEmit` 实际不检查任何源文件，会假通过
  - 真正的类型门禁是 `tsc -b`（npm run build 的一部分）或 `npx tsc -b --force`（全量重查，绕过增量缓存）
  - 改动共享类型/被 import 的文件后，务必用 `tsc -b --force` 验证，增量缓存会掩盖下游文件的类型错误
