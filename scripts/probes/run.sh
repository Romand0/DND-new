#!/bin/sh
# 无头回归探针：默认静默模式，只输出每项末 3 行与最终结论。
# 用法：BASE_URL=http://localhost:5173 sh scripts/probes/run.sh
# 前置：dev server 已启动；改了源码先冷重启（见 .monkeycode/MEMORY.md）
set -u
: "${BASE_URL:=http://localhost:5174}"
export BASE_URL QUIET=1
fail=0
for f in scripts/probes/probe-*.cjs; do
  out=$(NODE_PATH=$(npm root -g) node "$f" 2>&1)
  code=$?
  printf '%s\n' "$out" | tail -n 3
  if [ "$code" -ne 0 ]; then
    fail=1
    printf -- '--- %s FAILED ---\n%s\n' "$f" "$out"
  fi
done
if [ "$fail" -eq 0 ]; then echo "ALL PROBES OK"; else echo "PROBES FAILED"; fi
exit "$fail"
