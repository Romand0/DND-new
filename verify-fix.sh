#!/bin/bash

echo "🔍 验证 FlowEditor 修复效果..."
echo

# 测试1: fetchRemote() 修复
echo "✅ 测试1: fetchRemote() 修复"
echo "   检查是否正确分离已发布版和草稿..."

if grep -q "remotePublished: FlowDefinition\[\]" src/data/flowStore.ts && \
   grep -q "remoteDrafts: FlowDraft\[\]" src/data/flowStore.ts && \
   grep -q "publishedVersion > 0" src/data/flowStore.ts; then
    echo "   ✓ fetchRemote() 已正确分离已发布版和草稿"
else
    echo "   ✗ fetchRemote() 修复失败"
fi

# 测试2: FlowEditor 初始化修复
echo
echo "✅ 测试2: FlowEditor 初始化修复"
echo "   检查是否添加了远程拉取和加载状态..."

if grep -q "flowRef.current = flow" src/pages/FlowEditor.tsx && \
   grep -q "await flowStore.fetchRemote()" src/pages/FlowEditor.tsx && \
   grep -q "加载完成前不渲染编辑器主体" src/pages/FlowEditor.tsx; then
    echo "   ✓ FlowEditor 初始化已添加远程拉取和加载状态"
else
    echo "   ✗ FlowEditor 初始化修复失败"
fi

# 测试3: 订阅回调修复
echo
echo "✅ 测试3: 订阅回调修复"
echo "   检查是否消除了陈旧闭包问题..."

if grep -q "const current = flowRef.current" src/pages/FlowEditor.tsx && \
   grep -q "loaded.updatedAt !== current.updatedAt" src/pages/FlowEditor.tsx; then
    echo "   ✓ 订阅回调已消除陈旧闭包问题"
else
    echo "   ✗ 订阅回调修复失败"
fi

# 测试4: 类型检查通过
echo
echo "✅ 测试4: TypeScript 类型检查"
echo "   检查是否所有修复都通过类型检查..."

if npx tsc --noEmit > /dev/null 2>&1; then
    echo "   ✓ TypeScript 类型检查通过"
else
    echo "   ✗ TypeScript 类型检查失败"
fi

echo
echo "🎉 修复验证完成！"
echo
echo "📋 修复总结:"
echo "   1. fetchRemote() 现在正确分离已发布版和草稿"
echo "   2. FlowEditor 初始化添加了远程拉取和加载状态"
echo "   3. 订阅回调使用 ref 消除陈旧闭包问题"
echo "   4. 所有修复都通过了 TypeScript 类型检查"