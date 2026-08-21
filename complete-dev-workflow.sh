#!/bin/bash

echo "=== DND-new 完整开发工作流程 ==="

# 设置 Git 配置
echo "🔧 配置 Git 用户..."
git config user.name "Romand0Mirror"
git config user.email "romandomirror@example.com"

# 检查当前状态
echo "📊 当前状态..."
echo "分支: $(git branch --show-current)"
echo "远程: $(git remote -v | head -1)"

# 同步上游最新代码
echo "🔄 同步上游最新代码..."
git fetch upstream
git merge upstream/main --no-commit --no-ff

# 类型检查
echo "🔍 运行类型检查..."
if npx tsc --noEmit; then
    echo "✅ 类型检查通过"
else
    echo "❌ 类型检查失败,请修复错误"
    exit 1
fi

# 构建项目
echo "🏗️ 构建项目..."
if npm run build; then
    echo "✅ 构建成功"
else
    echo "❌ 构建失败,请修复错误"
    exit 1
fi

# 添加所有更改
echo "📝 添加所有更改..."
git add .

# 提交更改
echo "💾 提交更改..."
git commit -m "Development update: $(date '+%Y-%m-%d %H:%M:%S')"

# 推送到镜像仓库
echo "🚀 推送到镜像仓库..."
git push -u origin feature-development

echo "✅ 完整开发工作流程完成!"
echo ""
echo "📊 最终状态:"
echo "   分支: $(git branch --show-current)"
echo "   远程: $(git remote get-url origin)"
echo "   最新提交: $(git log --oneline -1)"
echo ""
echo "🎉 您现在可以拉取这些更改到本地环境!"
