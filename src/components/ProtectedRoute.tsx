import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireDM?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireDM = false }) => {
  const { isAuthenticated, isDM, loading } = useAuth();

  // 加载中，显示加载页（父 Route 元素层级，子路由暂不挂，正常）
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  // 未登录，重定向到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 需要 DM 权限但不是 DM，直接踢到玩家端首页（避免两次跳转）
  if (requireDM && !isDM) {
    return <Navigate to="/player/home" replace />;
  }

  // 已登录且有权限，正常渲染
  return <>{children}</>;
};

export default ProtectedRoute;
