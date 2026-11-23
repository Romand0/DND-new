#!/bin/bash
# 打包并运行 FlowScript AI 生成实验（TS 依赖经 esbuild 解析后交给 node）
# 用法: ./scripts/run-flow-ai-experiment.sh [用例名过滤]
# 环境变量: CF_ACCOUNT_ID / CF_API_TOKEN 必填；CF_MODEL 可选
set -e

npx esbuild scripts/flow-ai-experiment.mjs \
  --bundle --format=esm --platform=node \
  --alias:@=./src \
  --outfile=/tmp/opencode/flow-ai-experiment.bundle.mjs

node /tmp/opencode/flow-ai-experiment.bundle.mjs "$@"
