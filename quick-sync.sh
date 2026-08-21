#!/bin/bash

echo "=== 快速同步脚本 ==="

# 同步上游最新代码
echo "🔄 同步上游最新代码..."
git fetch upstream
git merge upstream/main --no-commit --no-ff

# 推送到镜像仓库
echo "🚀 推送到镜像仓库..."
git push origin feature-development

echo "✅ 快速同步完成!"
echo ""
echo "📊 状态:"
echo "   分支: $(git branch --show-current)"
echo "   最新提交: $(git log --oneline -1)"
