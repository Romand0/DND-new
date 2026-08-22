import { Zap, Shield, Target, MousePointer, GitBranch, Heart, Skull } from 'lucide-react';

// ===== 节点图标解析 =====
/** 从 icon name 解析为 React 元素，单一真相源 */
export function resolveNodeIcon(iconName?: string): React.ReactNode {
  const map: Record<string, React.ReactNode> = {
    'zap': <Zap className="w-4 h-4" />,
    'shield': <Shield className="w-4 h-4" />,
    'target': <Target className="w-4 h-4" />,
    'mouse-pointer': <MousePointer className="w-4 h-4" />,
    'git-branch': <GitBranch className="w-4 h-4" />,
    'heart': <Heart className="w-4 h-4" />,
    'skull': <Skull className="w-4 h-4" />,
  };
  return map[iconName || ''] ?? <Zap className="w-4 h-4" />;
}