import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  /** 游戏身份：dm / player，属于具体战役的扮演身份 */
  role: 'dm' | 'player';
  /** 站点管理员：独立于游戏身份，决定编辑与后台权限 */
  isAdmin: boolean;
  avatar?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** 游戏身份是否为 DM（仅用于文案/标签，不代表站点权限） */
  isDM: boolean;
  /** 站点管理员：所有编辑、后台管理入口以此为准 */
  isAdmin: boolean;
  loading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => void;
  /** 更新当前用户信息（合并字段），同步到 localStorage */
  updateUser: (partial: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 初始化时从 localStorage 恢复登录状态
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');

    // 旧版 DM Token 验证标记已废弃，统一由账号 is_admin 决定权限
    localStorage.removeItem('dm_token_verified');

    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        const parsed = JSON.parse(savedUser) as User;
        // 兼容旧缓存：迁移前 role=dm 即管理员，后续以 /api/auth/me 的 isAdmin 为准
        setUser({ ...parsed, isAdmin: parsed.isAdmin ?? parsed.role === 'dm' });
      } catch {
        // 用户信息损坏，清除登录状态
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
      }
    }
    setLoading(false);
  }, []);

  // 验证 token 是否仍然有效（调用 /api/auth/me）
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const verifyToken = async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          // token 无效或过期，清除登录状态
          logout();
          return;
        }
        const data = await res.json();
        if (cancelled || !data?.user) return;
        // 以服务端为准刷新身份，管理员授予/撤销无需重新登录即可生效
        const next: User = {
          id: data.user.id,
          username: data.user.username,
          role: data.user.role,
          isAdmin: !!data.user.isAdmin,
          avatar: data.user.avatar ?? null,
        };
        setUser(next);
        localStorage.setItem('auth_user', JSON.stringify(next));
      } catch {
        // 网络错误，保留当前状态
      }
    };

    verifyToken();
    return () => { cancelled = true; };
  }, [token]);

  // login 返回 Promise，确保 setState flush 完再 resolve
  const login = (newToken: string, newUser: User): Promise<void> => {
    return new Promise((resolve) => {
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('auth_token', newToken);
      localStorage.setItem('auth_user', JSON.stringify(newUser));
      // 用 requestAnimationFrame 等 React setState flush 完
      requestAnimationFrame(() => resolve());
    });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  };

  const updateUser = (partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem('auth_user', JSON.stringify(next));
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        isDM: user?.role === 'dm',
        isAdmin: user?.isAdmin === true,
        loading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
