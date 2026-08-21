#!/bin/bash

echo "=== DND-new 项目信息 ==="

echo "📁 项目路径: $(pwd)"
echo "🌿 当前分支: $(git branch --show-current)"
echo "📋 远程仓库:"
git remote -v

echo ""
echo "📊 Git 状态:"
git status

echo ""
echo "📝 最近提交:"
git log --oneline -5

echo ""
echo "🔧 项目信息:"
if [ -f "package.json" ]; then
    echo "📦 项目名称: $(grep -o '"name": *"[^"]*"' package.json | cut -d'"' -f4)"
    echo "📦 版本: $(grep -o '"version": *"[^"]*"' package.json | cut -d'"' -f4)"
    echo "📦 可用脚本:"
    grep -o '"[^"]*": *"[^"]*"' package.json | grep -E '(dev|build|test|start)' | sed 's/^/  /'
fi

echo ""
echo "🎯 使用方法:"
echo "  ./complete-dev-workflow.sh  # 完整开发流程(类型检查+构建+提交+推送)"
echo "  ./quick-sync.sh            # 快速同步(拉取+推送)"
echo "  ./dev-workflow.sh         # 基本开发流程(提交+推送)"
echo "  ./project-info.sh         # 显示项目信息"
